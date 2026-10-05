import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { ADMIN_EMAILS } from '@/lib/admin';
import { extractMentions } from '@/lib/mentions';

// 새 댓글/메시지가 생겼을 때 받는 사람의 휴대폰으로 푸시 알림을 보낸다.
// 클라이언트는 방금 자신이 작성한 댓글/메시지의 id만 보내고,
// 받는 사람과 내용은 서버가 DB에서 직접 확인한다.

const MAX_AGE_MS = 2 * 60 * 1000; // 오래된 글로 알림을 반복 발송하는 것을 막기 위함

type NotifyBody = { type?: 'comment' | 'post' | 'message' | 'follow' | 'feedback' | 'feedback_reply' | 'report' | 'report_reply'; id?: string };
type Payload = { title: string; body: string; url: string; tag: string };

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
  if (!id || !type || !['comment', 'post', 'message', 'follow', 'feedback', 'feedback_reply', 'report', 'report_reply'].includes(type)) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  let recipientId: string | null = null;
  let payload: { title: string; body: string; url: string; tag: string } | null = null;
  // 댓글 답글: 글쓴이 외에 답글 받은 사람에게도 따로 보낸다
  // 댓글·글은 여러 사람에게(글쓴이, 답글 받은 사람, @태그된 사람) 보낼 수 있다
  const list: { recipientId: string; payload: Payload }[] = [];
  // 글·댓글에서 @태그된 회원 (이미 알림 받는 사람·본인 제외)
  const mentionedIds = async (text: string | null | undefined, skip: Set<string>) => {
    const handles = extractMentions(text);
    if (handles.length === 0) return [];
    const { data } = await admin.from('profiles').select('id').in('handle', handles.slice(0, 20));
    return (data || []).map(p => p.id as string).filter(pid => !skip.has(pid));
  };

  if (type === 'comment') {
    const { data: comment } = await admin.from('comments').select('*').eq('id', id).single();
    if (!comment || comment.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(comment.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: post } = await admin.from('posts').select('user_id').eq('id', comment.post_id).single();
    const replyTo = comment.reply_to_user_id as string | null | undefined;
    const body = `${comment.author_name}님: ${truncate(comment.content || '')}`;
    const url = `/?post=${comment.post_id}`;
    const notified = new Set<string>([user.id]);
    if (post && !notified.has(post.user_id)) {
      list.push({ recipientId: post.user_id, payload: { title: replyTo === post.user_id ? '↩ 새 답글' : '💬 새 댓글', body, url, tag: `comment-${comment.post_id}` } });
      notified.add(post.user_id);
    }
    if (replyTo && !notified.has(replyTo)) {
      list.push({ recipientId: replyTo, payload: { title: '↩ 새 답글', body, url, tag: `reply-${comment.post_id}` } });
      notified.add(replyTo);
    }
    for (const pid of await mentionedIds(comment.content, notified)) {
      list.push({ recipientId: pid, payload: { title: '🏷️ 댓글에서 회원님을 언급했어요', body, url, tag: `mention-${comment.id}` } });
    }
    if (list.length === 0) return Response.json({ skipped: 'nobody to notify' });
  } else if (type === 'post') {
    // 새 글에서 @태그된 사람에게
    const { data: post } = await admin.from('posts').select('id, user_id, author_name, content, created_at').eq('id', id).single();
    if (!post || post.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(post.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    for (const pid of await mentionedIds(post.content, new Set([user.id]))) {
      list.push({ recipientId: pid, payload: { title: '🏷️ 글에서 회원님을 언급했어요', body: `${post.author_name}님: ${truncate(post.content || '')}`, url: `/?post=${post.id}`, tag: `mention-${post.id}` } });
    }
    if (list.length === 0) return Response.json({ skipped: 'no mentions' });
  } else if (type === 'feedback') {
    // 새 건의 → 관리자에게
    const { data: fb } = await admin.from('feedback').select('id, user_id, author_name, content, created_at').eq('id', id).single();
    if (!fb || fb.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(fb.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: adminProfile } = await admin.from('profiles').select('id').in('email', ADMIN_EMAILS).limit(1).maybeSingle();
    if (!adminProfile) return Response.json({ skipped: 'admin not found' });
    recipientId = adminProfile.id;
    payload = {
      title: '📮 새 건의사항',
      body: `${fb.author_name || '교우'}님: ${truncate(fb.content || '')}`,
      url: '/?feedback=1',
      tag: `feedback-${fb.id}`,
    };
  } else if (type === 'feedback_reply') {
    // 관리자 답변 → 건의한 사람에게
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { data: fb } = await admin.from('feedback').select('id, user_id, admin_reply, replied_at').eq('id', id).single();
    if (!fb || !fb.admin_reply || !fb.replied_at) return Response.json({ error: 'bad request' }, { status: 400 });
    if (Date.now() - new Date(fb.replied_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    recipientId = fb.user_id;
    payload = {
      title: '📮 운영자 답변이 도착했어요',
      body: truncate(fb.admin_reply),
      url: '/?feedback=1',
      tag: `feedback-${fb.id}`,
    };
  } else if (type === 'report') {
    // 새 신고 → 관리자에게 바로
    const { data: rp } = await admin.from('reports').select('id, reporter_id, target_type, target_preview, reason, created_at').eq('id', id).single();
    if (!rp || rp.reporter_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(rp.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: adminProfile } = await admin.from('profiles').select('id').in('email', ADMIN_EMAILS).limit(1).maybeSingle();
    if (!adminProfile) return Response.json({ skipped: 'admin not found' });
    const what: Record<string, string> = { post: '게시글', comment: '댓글', anon_post: '고민글', anon_reply: '고민 답글', user: '사용자', message: '메시지' };
    recipientId = adminProfile.id;
    payload = {
      title: `🚨 새 신고 (${what[rp.target_type] || rp.target_type})`,
      body: truncate(rp.target_preview || '신고 내용을 확인해 주세요'),
      url: '/?reports=1',
      tag: `report-${rp.id}`,
    };
  } else if (type === 'report_reply') {
    // 관리자 처리 답변 → 신고한 사람에게
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { data: rp } = await admin.from('reports').select('id, reporter_id, admin_reply, replied_at').eq('id', id).single();
    if (!rp || !rp.admin_reply || !rp.replied_at) return Response.json({ error: 'bad request' }, { status: 400 });
    if (Date.now() - new Date(rp.replied_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    recipientId = rp.reporter_id;
    payload = {
      title: '🚨 신고 처리 결과를 알려드려요',
      body: truncate(rp.admin_reply),
      url: '/?reports=1',
      tag: `report-${rp.id}`,
    };
  } else if (type === 'follow') {
    const { data: follow } = await admin.from('follows').select('*').eq('id', id).single();
    if (!follow || follow.follower_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (follow.created_at && Date.now() - new Date(follow.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: follower } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).single();
    recipientId = follow.following_id;
    payload = {
      title: '👤 새 팔로워',
      body: `${follower?.baptismal_name || '교우'}님이 회원님을 팔로우하기 시작했어요`,
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

  const targets = list.length > 0 ? list : [{ recipientId: recipientId!, payload: payload! }];
  const payloadByUser = new Map(targets.map(t => [t.recipientId, t.payload]));
  const { data: subscriptions } = await admin.from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth').in('user_id', targets.map(t => t.recipientId));
  if (!subscriptions || subscriptions.length === 0) return Response.json({ sent: 0 });

  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', vapidPublicKey, vapidPrivateKey);
  const results = await Promise.allSettled(subscriptions.map(sub =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payloadByUser.get(sub.user_id)))
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
