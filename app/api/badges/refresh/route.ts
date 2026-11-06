import { createClient } from '@supabase/supabase-js';
import { refreshAutoBadges } from '@/lib/auto-badges';

// 앱을 열 때마다(로그인한 교우 누구나) 활동 1등 뱃지를 다시 계산 — 5분에 한 번만 (badge_refresh_log, supabase/member-badges.sql)
// 운영자 2026-11-06: '프로그램이 실행되면 자동으로 새로 고침될 때 실시간 반영해서 1등이 뱃지를 달도록'
const MIN_GAP_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ skipped: 'not configured' });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { data: last, error } = await admin.from('badge_refresh_log').select('ran_at').order('ran_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return Response.json({ skipped: 'no table' }); // SQL 전
  if (last && Date.now() - new Date(last.ran_at as string).getTime() < MIN_GAP_MS) return Response.json({ skipped: 'recent' });

  // 먼저 기록해 두어 같은 때 여럿이 열어도 한 번만
  const { data: claimed } = await admin.from('badge_refresh_log').insert({ by_user: user.id }).select('id').single();
  const result = await refreshAutoBadges(admin);
  if (claimed) await admin.from('badge_refresh_log').update({ awarded: result.awarded.length }).eq('id', claimed.id);
  // 오래된 기록 정리 (최근 200개만)
  const { data: old } = await admin.from('badge_refresh_log').select('id').order('ran_at', { ascending: false }).range(200, 400);
  if (old && old.length > 0) await admin.from('badge_refresh_log').delete().in('id', old.map(o => o.id));
  if (result.error) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ awarded: result.awarded, pushed: result.pushed });
}
