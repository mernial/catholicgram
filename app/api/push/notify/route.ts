import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';

// 새 댓글/메시지가 생겼을 때 받는 사람의 휴대폰으로 푸시 알림을 보낸다.
// 클라이언트는 방금 자신이 작성한 댓글/메시지의 id만 보내고,
// 받는 사람과 내용은 서버가 DB에서 직접 확인한다.

const MAX_AGE_MS = 2 * 60 * 1000; // 오래된 글로 알림을 반복 발송하는 것을 막기 위함

type NotifyBody = { type?: 'comment' | 'message' | 'follow'; id?: string };

const truncate = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max)}…` : text);

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ skipped: 'push is not configured' });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { type, id } = ((await request.json().catch(() => ({}))) ?? {}) as NotifyBody;
  if (!id || (type !== 'comment' && type !== 'message' && type !== 'follow')) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  let recipientId: string | null = null;
  let payload: { title: string; body: string; url: string; tag: string } | null = null;

  if (type === 'comment') {
    const { data: comment } = await admin.from('comments')
      .select('id, post_id, user_id, author_name, content, created_at').eq('id', id).single();
    if (!comment || comment.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(comment.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: post } = await admin.from('posts').select('user_id').eq('id', comment.post_id).single();
    if (!post || post.user_id === user.id) return Response.json({ skipped: 'own post' });
    recipientId = post.user_id;
    payload = {
      title: '💬 새 댓글',
      body: `${comment.author_name}님: ${truncate(comment.content || '')}`,
      url: `/?post=${comment.post_id}`,
      tag: `comment-${comment.post_id}`,
    };
  } else if (type === 'follow') {
    const { data: follow } = await admin.from('follows').select('*').eq('id', id).single();
    if (!follow || follow.follower_id !== user.id || follow.status !== 'pending') return Response.json({ error: 'forbidden' }, { status: 403 });
    if (follow.created_at && Date.now() - new Date(follow.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: follower } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).single();
    recipientId = follow.following_id;
    payload = {
      title: '👤 팔로우 요청',
      body: `${follower?.baptismal_name || '교우'}님이 팔로우를 요청했습니다`,
      url: '/?alerts=1',
      tag: `follow-${user.id}`,
    };
  } else {
    const { data: message } = await admin.from('messages')
      .select('id, sender_id, receiver_id, content, created_at').eq('id', id).single();
    if (!message || message.sender_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(message.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: sender } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).single();
    recipientId = message.receiver_id;
    payload = {
      title: `✉️ ${sender?.baptismal_name || '교우'}님의 메시지`,
      body: truncate(message.content || ''),
      url: `/?chat=${user.id}`,
      tag: `chat-${user.id}`,
    };
  }

  const { data: subscriptions } = await admin.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', recipientId);
  if (!subscriptions || subscriptions.length === 0) return Response.json({ sent: 0 });

  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', vapidPublicKey, vapidPrivateKey);
  const results = await Promise.allSettled(subscriptions.map(sub =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload))
  ));

  // 만료되었거나 해지된 구독은 정리
  const expired = subscriptions.filter((_, i) => {
    const r = results[i];
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return status === 404 || status === 410;
  });
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired.map(s => s.id));

  return Response.json({ sent: results.filter(r => r.status === 'fulfilled').length });
}
