import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용: 공지를 모든 회원의 휴대폰으로 알림 보내기
// POST { id } → 그 공지를 알림을 켜 둔 모든 기기로 보냄 (한 공지는 한 번만)

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
  const { data: notice } = await admin.from('announcements').select('id, title, content, pushed_at').eq('id', id).single();
  if (!notice) return Response.json({ error: '공지를 찾을 수 없어요.' }, { status: 404 });
  if (notice.pushed_at) return Response.json({ error: '이미 알림을 보낸 공지예요.' }, { status: 409 });

  // 먼저 보낸 것으로 표시 (두 번 누름 방지)
  await admin.from('announcements').update({ pushed_at: new Date().toISOString() }).eq('id', id);

  const payload = JSON.stringify({
    title: `📢 ${notice.title}`,
    body: notice.content.length > 80 ? `${notice.content.slice(0, 80)}…` : notice.content,
    url: `/?notice=${notice.id}`,
    tag: `notice-${notice.id}`,
  });
  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, vapidPrivateKey);

  let sent = 0;
  const expired: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').range(from, from + 499);
    if (!subs || subs.length === 0) break;
    const results = await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    ));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent++;
      else {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) expired.push(subs[i].id);
      }
    });
    if (subs.length < 500) break;
  }
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired);
  return Response.json({ ok: true, sent });
}
