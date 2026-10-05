import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { todayFeastKeys, todayKst } from '@/lib/feast';

// 매일 아침 8시(한국 시간) Vercel Cron 이 호출한다. (vercel.json 참고)
// 1) 오늘 축일인 교우 본인에게 축하 푸시
// 2) 그 교우를 팔로우하는 사람들에게 "오늘은 OOO님의 축일이에요" 푸시
// 같은 날 두 번 호출되어도 feast_day_sends 기록으로 한 번만 보낸다.

type Payload = { title: string; body: string; url: string; tag: string };
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

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

  const { data: celebrants, error } = await admin.from('profiles')
    .select('id, baptismal_name').in('feast_day', todayFeastKeys());
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

  const messages = new Map<string, Payload>();
  // 팔로워 알림 (본인 축일 알림이 같은 사람에게 있으면 아래에서 본인 축하가 우선)
  celebrantsByFollower.forEach((ids, followerId) => {
    const first = nameById.get(ids[0]);
    messages.set(followerId, ids.length === 1
      ? { title: `🎉 오늘은 ${first}님의 축일이에요`, body: '축하 메시지를 보내 함께 기뻐해주세요 🙏', url: `/?chat=${ids[0]}`, tag: `feast-${today}` }
      : { title: `🎉 오늘은 ${first}님 외 ${ids.length - 1}명의 축일이에요`, body: '축하 메시지를 보내 함께 기뻐해주세요 🙏', url: '/?alerts=1', tag: `feast-${today}` });
  });
  todays.forEach(c => {
    messages.set(c.id, {
      title: '🎉 축일을 축하드립니다!',
      body: `${nameById.get(c.id)}님, 주님의 은총과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏`,
      url: '/',
      tag: `feast-me-${today}`,
    });
  });

  const recipientIds = Array.from(messages.keys());
  const subscriptions: Subscription[] = [];
  for (let i = 0; i < recipientIds.length; i += 200) {
    const { data } = await admin.from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth').in('user_id', recipientIds.slice(i, i + 200));
    if (data) subscriptions.push(...data);
  }
  if (subscriptions.length === 0) return Response.json({ celebrants: todays.length, sent: 0 });

  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, vapidPrivateKey);
  const results = await Promise.allSettled(subscriptions.map(sub =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(messages.get(sub.user_id)))
  ));

  // 만료되었거나 해지된 구독은 정리
  const expired = subscriptions.filter((_, i) => {
    const r = results[i];
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return status === 404 || status === 410;
  });
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired.map(s => s.id));

  return Response.json({ celebrants: todays.length, sent: results.filter(r => r.status === 'fulfilled').length });
}
