import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용 회원 관리
// GET  : 가입 회원 목록과 상태 (가입일, 최근 접속, 접속 횟수, 로그인 방식, 글·댓글 수, 받은 하트·기도, 신고 수, 알림 여부, 이용 정지 여부)
// POST : { action: 'suspend' | 'unsuspend' | 'dismiss-reports', userId } 이용 정지 / 해제 / 신고 해제
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

// 수파베이스는 한 번에 1000줄까지만 주므로 나눠서 끝까지 받는다
async function fetchAll(admin: SupabaseClient, table: string, cols: string, apply?: (q: any) => any, maxPages = 200) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < maxPages; page++) {
    let q = admin.from(table).select(cols).range(page * 1000, page * 1000 + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error || !data) break; // 표가 없으면 빈 목록
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return rows;
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

  const [profiles, posts, comments, sessions, reports, pushes, followers, privates] = await Promise.all([
    fetchAll(admin, 'profiles', 'id, baptismal_name, handle, avatar_url, badge_type, feast_day'),
    fetchAll(admin, 'posts', 'user_id, like_count, pray_count, is_story'),
    fetchAll(admin, 'comments', 'user_id'),
    fetchAll(admin, 'app_sessions', 'user_id, last_seen_at', q => q.not('user_id', 'is', null)),
    fetchAll(admin, 'reports', 'target_user_id', q => q.eq('status', 'open')),
    // 기기 이름·마지막으로 연 때(supabase/push-devices.sql)까지, 그 칸이 없으면 예전처럼 사람만
    fetchAll(admin, 'push_subscriptions', 'user_id, device, last_seen').then(r => (r.length ? r : fetchAll(admin, 'push_subscriptions', 'user_id'))),
    fetchAll(admin, 'follows', 'following_id', q => q.eq('status', 'accepted')),
    fetchAll(admin, 'profile_private', 'id, real_name'),
  ]);
  const realNameById = new Map(privates.map(p => [p.id as string, p.real_name as string | null]));
  const profileById = new Map(profiles.map(p => [p.id as string, p as Record<string, string | null>]));
  const feedPosts = posts.filter(p => !p.is_story); // 스토리는 글 수에서 뺌
  const postCount = countBy(feedPosts, 'user_id');
  const sumBy = (rows: Record<string, unknown>[], key: string) => {
    const sums = new Map<string, number>();
    rows.forEach(r => { const id = r.user_id as string | null; if (id) sums.set(id, (sums.get(id) || 0) + (Number(r[key]) || 0)); });
    return sums;
  };
  const likesReceived = sumBy(posts, 'like_count');
  const praysReceived = sumBy(posts, 'pray_count');
  const commentCount = countBy(comments, 'user_id');
  const visitCount = countBy(sessions, 'user_id');
  const lastSeen = new Map<string, string>();
  sessions.forEach(r => { const id = r.user_id as string; const at = r.last_seen_at as string; if (id && at && (!lastSeen.has(id) || at > lastSeen.get(id)!)) lastSeen.set(id, at); });
  const reportCount = countBy(reports, 'target_user_id');
  const pushCount = countBy(pushes, 'user_id');
  // 알림 받는 기기: '기기 이름(마지막으로 연 날)' — 기기마다 가장 최근 것 하나 (같은 휴대폰에 앱이 둘이면 하나로)
  const pushDevices = new Map<string, Map<string, string>>();
  pushes.forEach(r => {
    const id = r.user_id as string; if (!id) return;
    const name = ((r.device as string | null) || '').split('|').pop() || '기기 이름 모름';
    const at = (r.last_seen as string | null) || '';
    const m = pushDevices.get(id) || new Map<string, string>();
    if (!m.has(name) || at > m.get(name)!) m.set(name, at);
    pushDevices.set(id, m);
  });
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
      last_seen_at: lastSeen.get(u.id) || u.last_sign_in_at || null, // 앱을 마지막으로 쓴 때
      visits: visitCount.get(u.id) || 0,                           // 앱을 연 횟수
      comments: commentCount.get(u.id) || 0,
      likes_received: likesReceived.get(u.id) || 0,                // 내 글이 받은 하트(공감)
      prays_received: praysReceived.get(u.id) || 0,                // 내 글이 받은 기도
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
      push_devices: [...(pushDevices.get(u.id) || new Map<string, string>()).entries()].map(([name, at]) => ({ name, at: at || null })),
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
  if (!userId || !['suspend', 'unsuspend', 'dismiss-reports'].includes(action || '')) return Response.json({ error: 'bad request' }, { status: 400 });

  // 신고 해제: 이 회원에 대한 미처리 신고를 모두 '해제(dismissed)'로
  if (action === 'dismiss-reports') {
    const { data, error } = await admin.from('reports').update({ status: 'dismissed' })
      .eq('target_user_id', userId).eq('status', 'open').select('id');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, dismissed: data?.length || 0 });
  }

  if (userId === me.id) return Response.json({ error: '본인 계정은 정지할 수 없습니다.' }, { status: 400 });

  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target.user) return Response.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
  if (target.user.email && ADMIN_EMAILS.includes(target.user.email)) return Response.json({ error: '관리자 계정은 정지할 수 없습니다.' }, { status: 400 });

  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === 'suspend' ? FOREVER : 'none' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, suspended: action === 'suspend' });
}
