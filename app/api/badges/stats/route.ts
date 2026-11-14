import { createClient } from '@supabase/supabase-js';
import { computeMemberStats } from '@/lib/member-stats';

// 본인의 활동 숫자 (뱃지 모음 — 다음 등급까지 남은 수, 운영자 2026-11-14). 로그인한 교우가 자기 것만
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await computeMemberStats(admin, user.id), { headers: { 'cache-control': 'no-store' } });
}
