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
  const [posts, comments, feedback, bugs, intentions, lounge, sessions, likesGiven, praysGiven, intentionPrays, followers, following, dms, groupMsgs, anonReplies, commentIds] = await Promise.all([
    admin.from('posts').select('like_count, pray_count, images, video_url, is_story, music, created_at').eq('user_id', userId).limit(5000),
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
  ]);
  const myCommentIds = ((commentIds.data || []) as { id: string }[]).map(c => String(c.id));
  const commentLikes = myCommentIds.length > 0 ? await n(admin.from('comment_reactions').select('comment_id', { count: 'exact', head: true }).in('comment_id', myCommentIds.slice(0, 1000)).neq('user_id', userId)) : 0;
  const rows = (posts.data || []) as { like_count?: number; pray_count?: number; images?: string[] | null; video_url?: string | null; is_story?: boolean; music?: string | null; created_at?: string }[];
  const kstHour = (iso?: string) => iso ? (new Date(iso).getUTCHours() + 9) % 24 : -1;
  const real = rows.filter(p => !p.is_story);
  const days = new Set((sessions.data || []).map(s => new Date(new Date(s.started_at as string).getTime() + 9 * 3600e3).toISOString().slice(0, 10))).size;
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
  };
  return Response.json(stats);
}
