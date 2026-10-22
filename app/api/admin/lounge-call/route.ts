import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용: '관리자가 사랑방에 왔어요'를 모든 교우의 휴대폰으로 알리기
// POST { id } → 관리자가 방금 사랑방에 올린 📢 안내 글. 알림을 켜 둔 모든 기기로 보냄 (관리자 본인 제외)
// 알림이 너무 잦지 않게 30분에 한 번만

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPrivateKey) return Response.json({ error: '알림 설정이 완료되지 않았습니다.' }, { status: 503 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = ((await request.json().catch(() => ({}))) ?? {}) as { id?: string };
  if (!id) return Response.json({ error: 'bad request' }, { status: 400 });
  const { data: msg } = await admin.from('lounge_messages').select('id, user_id, content, created_at').eq('id', id).maybeSingle();
  if (!msg || msg.user_id !== user.id || !String(msg.content).startsWith('📢')) return Response.json({ error: '안내 글을 찾을 수 없어요.' }, { status: 404 });
  if (Date.now() - new Date(msg.created_at).getTime() > 2 * 60 * 1000) return Response.json({ error: '오래된 안내 글이에요.' }, { status: 409 });

  const { count } = await admin.from('lounge_messages').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).neq('id', msg.id).like('content', '📢%')
    .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if ((count || 0) > 0) return Response.json({ error: '사랑방 알림은 30분에 한 번만 보낼 수 있어요.' }, { status: 429 });

  const text = String(msg.content).replace(/^📢\s*/, '').trim();
  const payload = JSON.stringify({
    title: '🙋 관리자가 사랑방에 왔어요',
    body: text.length > 80 ? `${text.slice(0, 80)}…` : text || '모두의 사랑방에서 함께 이야기 나눠요',
    url: `/?lounge=${msg.id}&n=${Date.now().toString(36)}`,
    tag: 'lounge-open',
  });
  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, vapidPrivateKey);

  let sent = 0;
  const expired: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data: subs } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').range(from, from + 499);
    if (!subs || subs.length === 0) break;
    const targets = subs.filter(s => s.user_id !== user.id);
    const results = await Promise.allSettled(targets.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    ));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent++;
      else {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) expired.push(targets[i].id);
      }
    });
    if (subs.length < 500) break;
  }
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired);
  return Response.json({ ok: true, sent });
}
