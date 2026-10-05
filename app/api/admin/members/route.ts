import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용 회원 관리
// GET  : 가입 회원 목록과 상태 (가입일, 마지막 접속, 로그인 방식, 글 수, 신고 수, 알림 여부, 이용 정지 여부)
// POST : { action: 'suspend' | 'unsuspend', userId } 이용 정지 / 해제
//        정지하면 로그인이 막히고, 이미 로그인한 기기도 최대 1시간 안에 로그아웃된다.

const FOREVER = '876000h'; // 약 100년

async function requireAdmin(request: Request): Promise<{ admin: SupabaseClient; me: User } | Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });
  return { admin, me: user };
}

const countBy = (rows: Record<string, unknown>[] | null, key: string) => {
  const counts = new Map<string, number>();
  (rows || []).forEach(r => {
    const id = r[key] as string | null;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  const users: User[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const [{ data: profiles }, { data: posts }, { data: reports }, { data: pushes }, { data: followers }, { data: privates }] = await Promise.all([
    admin.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type, feast_day'),
    admin.from('posts').select('user_id'),
    admin.from('reports').select('target_user_id').eq('status', 'open'),
    admin.from('push_subscriptions').select('user_id'),
    admin.from('follows').select('following_id').eq('status', 'accepted'),
    admin.from('profile_private').select('id, real_name'),
  ]);
  const realNameById = new Map((privates || []).map(p => [p.id, p.real_name as string | null]));
  const profileById = new Map((profiles || []).map(p => [p.id, p]));
  const postCount = countBy(posts, 'user_id');
  const reportCount = countBy(reports, 'target_user_id');
  const pushCount = countBy(pushes, 'user_id');
  const followerCount = countBy(followers, 'following_id');

  const now = Date.now();
  const members = users.map(u => {
    const p = profileById.get(u.id);
    const bannedUntil = (u as User & { banned_until?: string }).banned_until;
    return {
      id: u.id,
      email: u.email || null,
      provider: (u.app_metadata?.naver_id ? 'naver' : (u.app_metadata?.provider as string)) || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
      baptismal_name: p?.baptismal_name || null,
      real_name: realNameById.get(u.id) || null,
      handle: p?.handle || null,
      avatar_url: p?.avatar_url || null,
      badge_type: p?.badge_type || null,
      feast_day: p?.feast_day || null,
      posts: postCount.get(u.id) || 0,
      followers: followerCount.get(u.id) || 0,
      open_reports: reportCount.get(u.id) || 0,
      push: (pushCount.get(u.id) || 0) > 0,
      suspended: !!bannedUntil && new Date(bannedUntil).getTime() > now,
      is_admin: !!u.email && ADMIN_EMAILS.includes(u.email),
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return Response.json({ members });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const { admin, me } = auth;

  const { action, userId } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; userId?: string };
  if (!userId || (action !== 'suspend' && action !== 'unsuspend')) return Response.json({ error: 'bad request' }, { status: 400 });
  if (userId === me.id) return Response.json({ error: '본인 계정은 정지할 수 없습니다.' }, { status: 400 });

  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target.user) return Response.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
  if (target.user.email && ADMIN_EMAILS.includes(target.user.email)) return Response.json({ error: '관리자 계정은 정지할 수 없습니다.' }, { status: 400 });

  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === 'suspend' ? FOREVER : 'none' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, suspended: action === 'suspend' });
}
