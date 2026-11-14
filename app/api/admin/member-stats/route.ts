import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { computeMemberStats } from '@/lib/member-stats';

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

  const stats = await computeMemberStats(admin, userId);
  return Response.json(stats);
}
