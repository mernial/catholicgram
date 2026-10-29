import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { CHEER_ICON, CHEER_WORD, cheerKindOf, cheerWordOfMany, selfCheer, todayFeastKeys, todayKst, type CheerKind } from '@/lib/feast';
import { onePerDevice } from '@/lib/push-devices';
import { sendScheduledTesterNotice } from '@/lib/tester-notice';

// 매일 아침 8시(한국 시간) Vercel Cron 이 호출한다. (vercel.json 참고)
// 1) 오늘 생일·축일인 교우 본인에게 축하 푸시
// 2) 그 교우를 팔로우하는 사람들에게 "오늘은 OOO님의 생일입니다. 축하해 주세요!" 푸시 (누르면 축하 인사가 채워진 대화방)
// 같은 날 두 번 호출되어도 feast_day_sends 기록으로 한 번만 보낸다.
// 3) 운영자가 정한 날이면 등록한 테스터에게 설치 안내 (lib/tester-notice)

type Payload = { title: string; body: string; url: string; tag: string };
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; device?: string | null; last_seen?: string | null };

export async function GET(request: Request) {
  // CRON_SECRET 이 있으면 그것으로 확인하고, 없으면 Vercel Cron 요청을 아침 시간대(7~10시)에만 받는다.
  // (feast_day_sends 로 하루 한 번만 보내므로 누가 임의로 호출해도 중복 발송되지 않음)
  const cronSecret = process.env.CRON_SECRET;
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const authorized = cronSecret
    ? request.headers.get('authorization') === `Bearer ${cronSecret}`
    : (request.headers.get('user-agent') || '').startsWith('vercel-cron') && kstHour >= 7 && kstHour < 10;
  if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPrivateKey) {
    return Response.json({ skipped: 'push is not configured' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 축일 알림과 상관없이 먼저 (축일인 교우가 없는 날에도 보내야 함)
  const testerNotice = await sendScheduledTesterNotice(admin, vapidPrivateKey).catch(e => ({ error: String(e) }));
  if (testerNotice) console.log('tester notice', JSON.stringify(testerNotice));

  // 생일 칸(birthday.sql)이 아직 없으면 축일만
  type Celebrant = { id: string; baptismal_name: string | null; feast_day?: string | null; birthday?: string | null };
  const keys = todayFeastKeys();
  const inList = keys.map(k => `"${k}"`).join(',');
  const loadCelebrants = async (): Promise<{ data: Celebrant[] | null; error: { message: string } | null }> => {
    const r = await admin.from('profiles').select('id, baptismal_name, feast_day, birthday').or(`feast_day.in.(${inList}),birthday.in.(${inList})`);
    if (!r.error || !/birthday/.test(r.error.message)) return r;
    return await admin.from('profiles').select('id, baptismal_name, feast_day').in('feast_day', keys);
  };
  const { data: celebrants, error } = await loadCelebrants();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!celebrants || celebrants.length === 0) return Response.json({ celebrants: 0, sent: 0 });

  // 오늘 이미 보낸 사람은 제외 (중복 호출 대비)
  const today = todayKst();
  const { data: claimed, error: claimError } = await admin.from('feast_day_sends')
    .upsert(celebrants.map(c => ({ profile_id: c.id, sent_on: today })), { onConflict: 'profile_id,sent_on', ignoreDuplicates: true })
    .select('profile_id');
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  const claimedIds = new Set((claimed || []).map(c => c.profile_id));
  const todays = celebrants.filter(c => claimedIds.has(c.id));
  if (todays.length === 0) return Response.json({ celebrants: celebrants.length, sent: 0, skipped: 'already sent' });

  const celebrantIds = todays.map(c => c.id);
  const nameById = new Map(todays.map(c => [c.id, c.baptismal_name || '교우']));
  const kindById = new Map(todays.map(c => [c.id, cheerKindOf(c) || 'feast'] as [string, CheerKind]));

  // 팔로워 목록 (차단 관계는 제외)
  const [{ data: follows }, { data: blocks }] = await Promise.all([
    admin.from('follows').select('follower_id, following_id').in('following_id', celebrantIds).eq('status', 'accepted'),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.in.(${celebrantIds.join(',')}),blocked_id.in.(${celebrantIds.join(',')})`),
  ]);
  const blocked = new Set((blocks || []).flatMap(b => [`${b.blocker_id}:${b.blocked_id}`, `${b.blocked_id}:${b.blocker_id}`]));
  const celebrantsByFollower = new Map<string, string[]>();
  (follows || []).forEach(f => {
    if (f.follower_id === f.following_id || blocked.has(`${f.follower_id}:${f.following_id}`)) return;
    const list = celebrantsByFollower.get(f.follower_id) || [];
    list.push(f.following_id);
    celebrantsByFollower.set(f.follower_id, list);
  });

  // 한 사람이 본인 축하와 팔로잉 교우 소식을 함께 받을 수 있다 (tag 가 달라 따로 뜸)
  const messages = new Map<string, Payload[]>();
  const add = (userId: string, payload: Payload) => messages.set(userId, [...(messages.get(userId) || []), payload]);
  todays.forEach(c => {
    const kind = kindById.get(c.id)!;
    const { title, body } = selfCheer(nameById.get(c.id)!, kind);
    add(c.id, { title: `${kind === 'both' ? '🎂🎉' : CHEER_ICON[kind]} ${title}`, body, url: '/', tag: `feast-me-${today}` });
  });
  // 팔로워 알림: 한 명이면 누르면 그 교우와의 대화방(축하 인사가 채워짐), 여럿이면 알림 목록
  celebrantsByFollower.forEach((ids, followerId) => {
    const first = nameById.get(ids[0]), kind = kindById.get(ids[0])!;
    add(followerId, ids.length === 1
      ? { title: `${CHEER_ICON[kind]} 오늘은 ${first}님의 ${CHEER_WORD[kind]}입니다`, body: '축하해 주세요! 눌러서 축하 메시지를 보내 보세요 🙏', url: `/?chat=${ids[0]}&cheer=${kind}`, tag: `feast-${today}` }
      : { title: `🎉 오늘은 ${first}님 외 ${ids.length - 1}명의 ${cheerWordOfMany(ids.map(id => kindById.get(id)!))}입니다`, body: '축하해 주세요! 눌러서 누구인지 보고 축하 메시지를 보내 보세요 🙏', url: '/?alerts=1', tag: `feast-${today}` });
  });

  const recipientIds = Array.from(messages.keys());
  const subscriptions: Subscription[] = [];
  for (let i = 0; i < recipientIds.length; i += 200) {
    const { data } = await admin.from('push_subscriptions')
      .select('*').in('user_id', recipientIds.slice(i, i + 200));
    if (data) subscriptions.push(...onePerDevice(data as Subscription[])); // 같은 기기에는 한 번만 (한 사람의 구독은 같은 묶음 안)
  }
  if (subscriptions.length === 0) return Response.json({ celebrants: todays.length, sent: 0 });

  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, vapidPrivateKey);
  const sends = subscriptions.flatMap(sub => (messages.get(sub.user_id) || []).map(payload => ({ sub, payload })));
  const results = await Promise.allSettled(sends.map(({ sub, payload }) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload))
  ));

  // 만료되었거나 해지된 구독은 정리
  const expired = Array.from(new Set(sends.filter((_, i) => {
    const r = results[i];
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return status === 404 || status === 410;
  }).map(s => s.sub)));
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired.map(s => s.id));

  return Response.json({ celebrants: todays.length, sent: results.filter(r => r.status === 'fulfilled').length });
}
