import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import type { StatKey } from '@/lib/badges';

// 관리자: 한 교우의 앱 활동 숫자 (뱃지 달기 창에서 참고 — components/MemberBadges BadgeGrantSheet)
// GET /api/admin/member-stats?user=<id>  →  { likes, prays, comments, posts, photos, feedback, bugs, intentions, lounge, days }
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const userId = new URL(request.url).searchParams.get('user');
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: 'bad request' }, { status: 400 });

  const n = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { try { const { count, error } = await q; return error ? 0 : (count || 0); } catch { return 0; } };
  const head = (table: string) => admin.from(table).select('id', { count: 'exact', head: true });
  const stickerLike = '[%]%'; // 이모티콘 글 '[아멘이] 안녕!' (lib/stickers) — LIKE 의 [ 는 그냥 글자
  const [posts, comments, feedback, bugs, intentions, lounge, sessions, likesGiven, praysGiven, intentionPrays, followers, following, dms, groupMsgs, anonReplies, commentIds,
    replies, letters, reactC, reactM, reactG, reactL, stkM, stkG, stkL, myComments, userRow] = await Promise.all([
    admin.from('posts').select('like_count, pray_count, images, video_url, is_story, music, created_at, content').eq('user_id', userId).limit(5000),
    n(head('comments').eq('user_id', userId)),
    n(head('feedback').eq('user_id', userId).eq('category', 'suggestion')),
    n(head('feedback').eq('user_id', userId).eq('category', 'bug')),
    n(head('prayer_intentions').eq('user_id', userId)),
    n(head('lounge_messages').eq('user_id', userId).is('deleted_at', null)),
    admin.from('app_sessions').select('started_at').eq('user_id', userId).limit(20000),
    n(head('post_reactions').eq('user_id', userId).eq('reaction_type', 'like')),
    n(head('post_reactions').eq('user_id', userId).eq('reaction_type', 'pray')),
    n(admin.from('intention_prayers').select('intention_id', { count: 'exact', head: true }).eq('user_id', userId)),
    n(head('follows').eq('following_id', userId).eq('status', 'accepted')),
    n(head('follows').eq('follower_id', userId).eq('status', 'accepted')),
    n(head('messages').eq('sender_id', userId)),
    n(head('group_chat_messages').eq('user_id', userId).eq('kind', 'text')),
    n(head('anon_replies').eq('user_id', userId).eq('is_post_author', false)),
    admin.from('comments').select('id').eq('user_id', userId).limit(5000),
    n(head('comments').eq('user_id', userId).not('parent_id', 'is', null)),
    n(head('letters').eq('user_id', userId)),
    n(admin.from('comment_reactions').select('comment_id', { count: 'exact', head: true }).eq('user_id', userId)),
    n(admin.from('message_reactions').select('message_id', { count: 'exact', head: true }).eq('user_id', userId)),
    n(admin.from('group_chat_reactions').select('message_id', { count: 'exact', head: true }).eq('user_id', userId)),
    n(admin.from('lounge_reactions').select('message_id', { count: 'exact', head: true }).eq('user_id', userId)),
    n(head('messages').eq('sender_id', userId).like('content', stickerLike)),
    n(head('group_chat_messages').eq('user_id', userId).like('content', stickerLike)),
    n(head('lounge_messages').eq('user_id', userId).like('content', stickerLike)),
    admin.from('comments').select('post_id, created_at').eq('user_id', userId).limit(5000),
    admin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
  ]);
  // 환영 댓글: 가입 2주 안인 교우의 글에 단 댓글 (본인 글 빼고)
  let welcomes = 0;
  try {
    const cRows = ((myComments.data || []) as { post_id: string; created_at: string }[]);
    const postIds = Array.from(new Set(cRows.map(c => c.post_id).filter(Boolean))).slice(0, 1000);
    if (postIds.length > 0) {
      const { data: ps } = await admin.from('posts').select('id, user_id').in('id', postIds);
      const owner = new Map(((ps || []) as { id: string; user_id: string }[]).map(p => [String(p.id), p.user_id]));
      const owners = Array.from(new Set(Array.from(owner.values()).filter(u => u && u !== userId)));
      const joined = new Map<string, number>();
      await Promise.all(owners.slice(0, 200).map(async u => { const { data } = await admin.auth.admin.getUserById(u).catch(() => ({ data: { user: null } })); if (data.user?.created_at) joined.set(u, new Date(data.user.created_at).getTime()); }));
      welcomes = cRows.filter(c => { const u = owner.get(String(c.post_id)); const j = u ? joined.get(u) : undefined; return !!u && u !== userId && j !== undefined && new Date(c.created_at).getTime() < j + 14 * 86400e3; }).length;
    }
  } catch { welcomes = 0; }
  const myCommentIds = ((commentIds.data || []) as { id: string }[]).map(c => String(c.id));
  const commentLikes = myCommentIds.length > 0 ? await n(admin.from('comment_reactions').select('comment_id', { count: 'exact', head: true }).in('comment_id', myCommentIds.slice(0, 1000)).neq('user_id', userId)) : 0;
  const rows = (posts.data || []) as { like_count?: number; pray_count?: number; images?: string[] | null; video_url?: string | null; is_story?: boolean; music?: string | null; created_at?: string; content?: string | null }[];
  const kstDow = (iso?: string) => iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).getUTCDay() : -1;
  const kstHour = (iso?: string) => iso ? (new Date(iso).getUTCHours() + 9) % 24 : -1;
  const real = rows.filter(p => !p.is_story);
  const dayList = Array.from(new Set((sessions.data || []).map(s => new Date(new Date(s.started_at as string).getTime() + 9 * 3600e3).toISOString().slice(0, 10)))).sort();
  const days = dayList.length;
  let streak = 0; { let run = 0, prev = NaN; for (const d of dayList) { const t = Date.parse(d); run = t - prev === 86400e3 ? run + 1 : 1; prev = t; streak = Math.max(streak, run); } }
  const joinedAt = userRow.data.user?.created_at ? new Date(userRow.data.user.created_at).getTime() : NaN;
  const years = Number.isFinite(joinedAt) ? Math.floor((Date.now() - joinedAt) / (365.25 * 86400e3)) : 0;
  const stats: Record<StatKey, number> = {
    likes: real.reduce((n, p) => n + (p.like_count || 0), 0),
    prays: real.reduce((n, p) => n + (p.pray_count || 0), 0),
    comments, posts: real.length,
    photos: real.filter(p => p.images && p.images.length > 0).length,
    videos: real.filter(p => !!p.video_url).length,
    stories: rows.length - real.length,
    music: real.filter(p => !!p.music).length,
    dawn: real.filter(p => { const h = kstHour(p.created_at); return h >= 4 && h <= 6; }).length,
    night: real.filter(p => { const h = kstHour(p.created_at); return h >= 22 || (h >= 0 && h < 3); }).length,
    feedback, bugs, intentions, lounge, days,
    likesGiven, praysGiven: praysGiven + intentionPrays, commentLikes, followers, following, dms, groupMsgs, anonReplies,
    replies, reactions: reactC + reactM + reactG + reactL, stickers: stkM + stkG + stkL, letters, welcomes, streak, years,
    sunday: real.filter(p => kstDow(p.created_at) === 0).length,
    longform: real.filter(p => (p.content || '').length >= 300).length,
    hashtags: real.filter(p => (p.content || '').includes('#')).length,
  };
  return Response.json(stats);
}
