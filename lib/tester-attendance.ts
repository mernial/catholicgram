// 안드로이드 테스터 14일 출석 도장 (운영자 2026-11-14: 테스트 다시 14일 — 테스터가 날마다 Play 테스트 앱으로 들어오는지)
// 도장 = 그날(한국 날짜) Play 테스트 앱으로 들어옴: app_sessions.app_kind='play'(supabase/app-sessions-kind.sql) + tester_signups.play_opened_at
export const ATTEND_START = '2026-11-14';     // 구글 검토일 — 테스트 다시 14일 시작
export const ATTEND_DAYS = 14;
export const ATTEND_UNTIL = Date.parse('2026-11-30T00:00:00+09:00'); // 이날부터 출석 창은 저절로 안 뜸

export const kstDayOf = (ms: number | string) => new Date((typeof ms === 'string' ? Date.parse(ms) : ms) + 9 * 3600e3).toISOString().slice(0, 10);
export const kstToday = () => kstDayOf(Date.now());

// 14일의 한국 날짜들 ['2026-11-14', …, '2026-11-27']
export const attendDates = (): string[] => Array.from({ length: ATTEND_DAYS }, (_, i) => new Date(Date.parse(ATTEND_START + 'T00:00:00Z') + i * 86400e3).toISOString().slice(0, 10));
// 오늘이 몇째 날인지 (1~14, 시작 전 0, 끝나면 15)
export const attendDayNo = (day = kstToday()) => {
  const n = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(ATTEND_START + 'T00:00:00Z')) / 86400e3) + 1;
  return Math.max(0, Math.min(ATTEND_DAYS + 1, n));
};
export const shortDate = (day: string) => `${+day.slice(5, 7)}.${+day.slice(8, 10)}`;

// 오늘(또는 어제)부터 거꾸로 이어진 날 수 — 오늘 아직 안 왔으면 어제까지
export function attendStreak(days: Iterable<string>, today = kstToday()) {
  const set = new Set(days); let k = 0;
  let t = Date.parse(today + 'T00:00:00Z');
  if (!set.has(today)) t -= 86400e3;
  while (set.has(new Date(t).toISOString().slice(0, 10)) && new Date(t).toISOString().slice(0, 10) >= ATTEND_START) { k++; t -= 86400e3; }
  return k;
}

export const attendSeenKey = (uid: string, day: string) => `testerAttendSeen:${uid}:${day}`; // 오늘 이미 봄 (하루 한 번)
export const attendHiddenKey = (uid: string) => `testerAttendHidden:${uid}:${ATTEND_START}`;  // 다시 보지 않기
