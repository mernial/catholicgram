import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { ADMIN_EMAILS } from '@/lib/admin';
import { extractMentions } from '@/lib/mentions';
import { postPlainText } from '@/lib/stickers';

// 새 댓글/메시지가 생겼을 때 받는 사람의 휴대폰으로 푸시 알림을 보낸다.
// 클라이언트는 방금 자신이 작성한 댓글/메시지의 id만 보내고,
// 받는 사람과 내용은 서버가 DB에서 직접 확인한다.

export const maxDuration = 30; // 테스트 알림은 10초 기다렸다 보낸다

const MAX_AGE_MS = 2 * 60 * 1000; // 오래된 글로 알림을 반복 발송하는 것을 막기 위함

type NotifyBody = { type?: 'group_message' | 'test' | 'lounge_call' | 'lounge_mention' | 'letter_gift' | 'comment' | 'post' | 'story' | 'anon_reply' | 'letter' | 'message' | 'follow' | 'feedback' | 'feedback_reply' | 'report' | 'report_reply' | 'tester_added'; id?: string };
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
  if (!id || !type || !['group_message', 'test', 'lounge_call', 'lounge_mention', 'letter_gift', 'comment', 'post', 'story', 'anon_reply', 'letter', 'message', 'follow', 'feedback', 'feedback_reply', 'report', 'report_reply', 'tester_added'].includes(type)) {
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

  if (type === 'group_message') {
    // 단체 채팅방 새 메시지 → 그 방의 다른 교우들에게 (보낸 교우를 차단한 교우는 빼고, 방에 없는 관리자에게는 가지 않음)
    const { data: msg } = await admin.from('group_chat_messages').select('id, chat_id, user_id, content, kind, created_at').eq('id', id).maybeSingle();
    if (!msg || msg.user_id !== user.id || msg.kind !== 'text') return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(msg.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const [{ data: chat }, { data: members }, { data: sender }, { data: blockers }] = await Promise.all([
      admin.from('group_chats').select('name').eq('id', msg.chat_id).maybeSingle(),
      admin.from('group_chat_members').select('user_id').eq('chat_id', msg.chat_id),
      admin.from('profiles').select('baptismal_name').eq('id', user.id).maybeSingle(),
      admin.from('blocks').select('blocker_id').eq('blocked_id', user.id),
    ]);
    const blockedBy = new Set((blockers || []).map(b => b.blocker_id as string));
    (members || []).filter(m => m.user_id !== user.id && !blockedBy.has(m.user_id)).forEach(m => list.push({
      recipientId: m.user_id,
      payload: { title: `👥 ${chat?.name || '단체 채팅방'}`, body: truncate(`${sender?.baptismal_name || '교우'}: ${msg.content}`), url: `/?group=${msg.chat_id}`, tag: `group-${msg.chat_id}` },
    }));
    if (list.length === 0) return Response.json({ sent: 0 });
  } else if (type === 'tester_added') {
    // 관리자가 테스터 신청자를 구글 플레이 테스터 목록에 등록함 → 신청한 분께 참여 방법 안내
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { data: signup } = await admin.from('tester_signups').select('user_id, status').eq('user_id', id).maybeSingle();
    if (!signup || signup.status !== 'added') return Response.json({ skipped: 'not added' });
    list.push({ recipientId: signup.user_id, payload: { title: '🎉 안드로이드 테스터 등록이 끝났어요', body: '눌러서 테스트 앱 설치 방법을 확인해 주세요 🙏', url: '/?tester=1', tag: 'tester-added' } });
  } else if (type === 'letter_gift') {
    // 관리자가 사연을 선물 대상으로 뽑음 → 보낸 분께
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { data: letter } = await admin.from('letters').select('id, user_id, gift').eq('id', id).maybeSingle();
    if (!letter || !letter.gift) return Response.json({ skipped: 'not a gift' });
    list.push({ recipientId: letter.user_id, payload: { title: '🎁 사연이 선물 대상으로 뽑혔어요!', body: '보내 주신 사연 감사해요. 운영자가 곧 메시지로 연락드릴게요 🙏', url: '/?letters=1', tag: `letter-gift-${letter.id}` } });
  } else if (type === 'lounge_call') {
    // 사랑방에서 '@관리자'로 부름 → 관리자에게만 (사랑방의 다른 대화는 알림 없음)
    const { data: msg } = await admin.from('lounge_messages').select('id, user_id, content, created_at').eq('id', id).maybeSingle();
    if (!msg || msg.user_id !== user.id || !String(msg.content).includes('@관리자')) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(msg.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    // 자정부터 아침 8시(한국 시간)까지는 관리자를 부르지 않는다 (앱에서도 막음)
    if (new Date(Date.now() + 9 * 3600e3).getUTCHours() < 8) return Response.json({ skipped: 'quiet hours' });
    // 같은 교우는 5분에 한 번만 (여러 번 불러도 알림이 쏟아지지 않게)
    const { count } = await admin.from('lounge_messages').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).neq('id', msg.id).like('content', '%@관리자%')
      .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    if ((count || 0) > 0) return Response.json({ skipped: 'called recently' });
    const { data: adminProfile } = await admin.from('profiles').select('id').in('email', ADMIN_EMAILS).limit(1).maybeSingle();
    if (!adminProfile || adminProfile.id === user.id) return Response.json({ skipped: 'admin not found' });
    const { data: caller } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).maybeSingle();
    list.push({ recipientId: adminProfile.id, payload: { title: '🙋 사랑방에서 관리자를 불렀어요', body: `${caller?.baptismal_name || '교우'}님: ${truncate(String(msg.content).replace(/@관리자\s*/g, '').trim() || '관리자님!')}`, url: `/?lounge=${msg.id}`, tag: `lounge-call-${msg.id}` } });
  } else if (type === 'lounge_mention') {
    // 사랑방에서 '@아이디'로 부름 → 부른 교우에게만 (누르면 사랑방 그 대화로)
    const { data: msg } = await admin.from('lounge_messages').select('id, user_id, content, created_at').eq('id', id).maybeSingle();
    if (!msg || msg.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(msg.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const handles = extractMentions(String(msg.content)).filter(h => h !== '관리자').slice(0, 5); // 한 번에 다섯 분까지
    if (handles.length === 0) return Response.json({ skipped: 'no mention' });
    // 1분에 세 번까지만 (여러 번 불러 알림이 쏟아지지 않게)
    const { count } = await admin.from('lounge_messages').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).neq('id', msg.id).like('content', '%@%')
      .gt('created_at', new Date(Date.now() - 60 * 1000).toISOString());
    if ((count || 0) >= 3) return Response.json({ skipped: 'too many' });
    const { data: people } = await admin.from('profiles').select('id').in('handle', handles);
    let ids = (people || []).map(p => p.id as string).filter(pid => pid !== user.id);
    if (ids.length === 0) return Response.json({ skipped: 'nobody' });
    // 서로 차단한 사이는 보내지 않는다
    const [{ data: b1 }, { data: b2 }] = await Promise.all([
      admin.from('blocks').select('blocker_id').in('blocker_id', ids).eq('blocked_id', user.id),
      admin.from('blocks').select('blocked_id').eq('blocker_id', user.id).in('blocked_id', ids),
    ]);
    const blocked = new Set([...(b1 || []).map(b => b.blocker_id as string), ...(b2 || []).map(b => b.blocked_id as string)]);
    ids = ids.filter(pid => !blocked.has(pid));
    const { data: caller } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).maybeSingle();
    ids.forEach(pid => list.push({ recipientId: pid, payload: { title: '💬 사랑방에서 회원님을 불렀어요', body: `${caller?.baptismal_name || '교우'}님: ${truncate(String(msg.content))}`, url: `/?lounge=${msg.id}`, tag: `lounge-mention-${msg.id}` } }));
    if (list.length === 0) return Response.json({ skipped: 'nobody' });
  } else if (type === 'test') {
    // 알림 확인용 (관리자만): 나에게만, 10초 뒤 (그사이 앱을 홈 화면으로 내려 두면 휴대폰 알림으로 온다)
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
    // 댓글 알림처럼 그 글의 가장 최근 댓글로 가는지 확인한다. 그 글에 댓글이 없으면 최근 댓글이 달린 다른 공개 글로.
    const { data: post } = await admin.from('posts').select('id').eq('id', id).maybeSingle();
    if (!post) return Response.json({ error: 'not found' }, { status: 404 });
    let target: { postId: string; commentId: string | null } = { postId: post.id, commentId: null };
    const { data: own } = await admin.from('comments').select('id').eq('post_id', post.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (own) target.commentId = own.id;
    else {
      const { data: recent } = await admin.from('comments').select('id, post_id').order('created_at', { ascending: false }).limit(20);
      const ids = Array.from(new Set((recent || []).map(c => c.post_id as string)));
      const { data: open } = ids.length ? await admin.from('posts').select('id, visibility, is_story').in('id', ids) : { data: [] };
      const ok = new Set((open || []).filter(p => (p.visibility ?? 'public') === 'public' && !p.is_story).map(p => p.id as string));
      const c = (recent || []).find(x => ok.has(x.post_id as string));
      if (c) target = { postId: c.post_id as string, commentId: c.id as string };
    }
    await new Promise(r => setTimeout(r, 10 * 1000));
    list.push({ recipientId: user.id, payload: {
      title: '🔔 테스트 알림',
      body: target.commentId ? '눌러서 그 글의 최근 댓글로 바로 가는지 확인해 보세요' : '눌러서 이 글이 열리는지 확인해 보세요',
      url: target.commentId ? `/?post=${target.postId}&comment=${target.commentId}` : `/?post=${target.postId}`,
      tag: `test-${Date.now()}`,
    } });
  } else if (type === 'comment') {
    const { data: comment } = await admin.from('comments').select('*').eq('id', id).single();
    if (!comment || comment.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(comment.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: post } = await admin.from('posts').select('user_id').eq('id', comment.post_id).single();
    const replyTo = comment.reply_to_user_id as string | null | undefined;
    const body = `${comment.author_name}님: ${truncate(postPlainText(comment.content))}`;
    const url = `/?post=${comment.post_id}&comment=${comment.id}`; // 그 글의 댓글 창을 열고 이 댓글로
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
      list.push({ recipientId: pid, payload: { title: '🏷️ 글에서 회원님을 언급했어요', body: `${post.author_name}님: ${truncate(postPlainText(post.content))}`, url: `/?view=${post.id}`, tag: `mention-${post.id}` } });
    }
    if (list.length === 0) return Response.json({ skipped: 'no mentions' });
  } else if (type === 'story') {
    // 새 스토리 → 나를 팔로우하는 교우들에게
    const { data: story } = await admin.from('posts').select('id, user_id, author_name, is_story, created_at').eq('id', id).single();
    if (!story || story.user_id !== user.id || !story.is_story) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(story.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: me } = await admin.from('profiles').select('baptismal_name').eq('id', user.id).single();
    const { data: followers } = await admin.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted').limit(1000);
    const name = me?.baptismal_name || story.author_name || '교우';
    for (const f of followers || []) {
      if (f.follower_id === user.id) continue;
      list.push({ recipientId: f.follower_id, payload: { title: '📸 새 스토리', body: `${name}님이 새 스토리를 올렸어요`, url: `/?story=${user.id}`, tag: `story-${user.id}` } });
    }
    if (list.length === 0) return Response.json({ skipped: 'no followers' });
  } else if (type === 'anon_reply') {
    // 고민글 답글 → 글쓴이에게 (글쓴이가 답하면 그 글에 답글을 단 교우들에게). 누가 썼는지는 알리지 않음
    const { data: reply } = await admin.from('anon_replies').select('id, post_id, user_id, content, created_at').eq('id', id).single();
    if (!reply || reply.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(reply.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: anonPost } = await admin.from('anon_posts').select('id, user_id').eq('id', reply.post_id).single();
    if (!anonPost) return Response.json({ skipped: 'post gone' });
    const url = `/?anon=${anonPost.id}&reply=${reply.id}`; // 그 답글로
    const body = truncate(reply.content || '');
    if (anonPost.user_id !== user.id) {
      list.push({ recipientId: anonPost.user_id, payload: { title: '🕊 내 고민글에 답글이 달렸어요', body, url, tag: `anon-${anonPost.id}` } });
    } else {
      const { data: others } = await admin.from('anon_replies').select('user_id').eq('post_id', anonPost.id).neq('user_id', user.id).limit(200);
      for (const uid of Array.from(new Set((others || []).map(o => o.user_id)))) {
        list.push({ recipientId: uid, payload: { title: '🕊 고민글 작성자가 답글을 남겼어요', body, url, tag: `anon-${anonPost.id}` } });
      }
    }
    if (list.length === 0) return Response.json({ skipped: 'nobody to notify' });
  } else if (type === 'letter') {
    // 새 사연 → 관리자에게
    const { data: letter } = await admin.from('letters').select('id, user_id, author_name, name_display, content, created_at').eq('id', id).single();
    if (!letter || letter.user_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (Date.now() - new Date(letter.created_at).getTime() > MAX_AGE_MS) return Response.json({ skipped: 'too old' });
    const { data: adminProfile } = await admin.from('profiles').select('id').in('email', ADMIN_EMAILS).limit(1).maybeSingle();
    if (!adminProfile) return Response.json({ skipped: 'admin not found' });
    recipientId = adminProfile.id;
    payload = {
      title: `💌 새 사연 (${letter.name_display === 'name' ? `${letter.author_name || '교우'}님` : '익명'})`,
      body: truncate(letter.content || ''),
      url: '/?letters=1',
      tag: `letter-${letter.id}`,
    };
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
    const what: Record<string, string> = { post: '게시글', comment: '댓글', anon_post: '고민글', anon_reply: '고민 답글', user: '사용자', message: '메시지', lounge: '사랑방 대화' };
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
      url: `/?profile=${user.id}`, // 팔로우한 교우의 공간으로
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
  // 알림마다 주소에 고유 표시(n)를 붙인다 → 앱이 같은 알림 주소로 두 번 열리지 않게 (휴대폰이 예전 주소로 앱을 다시 띄우는 경우)
  const nonce = Date.now().toString(36);
  targets.forEach(t => { t.payload = { ...t.payload, url: `${t.payload.url}${t.payload.url.includes('?') ? '&' : '?'}n=${nonce}` }; });
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
