import { createClient } from '@supabase/supabase-js';
import { ATTEND_START, attendDates, kstDayOf } from '@/lib/tester-attendance';

// 테스터 본인의 출석 도장: 14일 동안 Play 테스트 앱으로 들어온 한국 날짜들
// GET (Authorization: Bearer 로그인 토큰) → { tracked, days: ['2026-11-14', …] }
// 접속 기록(app_sessions)은 서버만 읽으므로 여기서 본인 것만 골라 준다
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const since = new Date(Date.parse(ATTEND_START + 'T00:00:00+09:00')).toISOString();
  const valid = new Set(attendDates());
  const days = new Set<string>();
  // app_kind 칸이 없으면(SQL 전) 접속 기록으로는 셀 수 없음 → 아래 '마지막으로 연 때'만
  const { data: rows, error } = await admin.from('app_sessions').select('started_at, last_seen_at')
    .eq('user_id', user.id).eq('app_kind', 'play').gte('last_seen_at', since).limit(2000);
  const tracked = !error;
  (rows || []).forEach(r => { days.add(kstDayOf(r.started_at as string)); if (r.last_seen_at) days.add(kstDayOf(r.last_seen_at as string)); });
  const { data: signup } = await admin.from('tester_signups').select('play_opened_at').eq('user_id', user.id).maybeSingle();
  const lastPlay = (signup as { play_opened_at?: string | null } | null)?.play_opened_at;
  if (lastPlay) days.add(kstDayOf(lastPlay));
  return Response.json({ tracked, days: [...days].filter(d => valid.has(d)).sort() });
}
