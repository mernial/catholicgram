// 음력 생일 → 다가오는 양력 날짜 (루비로사 건의 2026-11-24: 음력 생일인 교우가 양력으로만 적을 수 있어 엉뚱한 날 축하를 받음)
// 따로 라이브러리 없이 브라우저·서버(Node)에 들어 있는 한국 음력(단기, ko-KR-u-ca-dangi) 달력을 쓴다.
// 오늘(한국 날짜)부터 하루씩 넘기며 음력 월·일이 같은 첫 날을 찾는다 (윤달은 건너뜀, 그 달에 30일이 없으면 29일)
const fmt = (() => {
  try { return new Intl.DateTimeFormat('ko-KR-u-ca-dangi', { timeZone: 'UTC', month: 'numeric', day: 'numeric' }); } catch { return null; }
})();

export const lunarSupported = () => !!fmt;

const lunarOf = (utc: Date) => {
  const parts = fmt!.formatToParts(utc);
  const m = parts.find(p => p.type === 'month')?.value || '';
  const d = Number(parts.find(p => p.type === 'day')?.value || 0);
  return { leap: !/^\d+$/.test(m), month: Number(m.replace(/\D/g, '')), day: d };
};

const pad = (n: number) => String(n).padStart(2, '0');

// lunar: 'MM-DD'(음력) → 오늘 또는 그 뒤로 가장 가까운 양력 'MM-DD' (못 찾으면 null)
export function nextSolarOfLunar(lunar: string, now = Date.now()): string | null {
  if (!fmt) return null;
  const m = /^(\d{2})-(\d{2})$/.exec(lunar);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  const kst = new Date(now + 9 * 3600_000);
  const start = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  for (let i = 0; i < 400; i++) {
    const t = new Date(start + i * 86400_000);
    const l = lunarOf(t);
    if (l.leap || l.month !== month) continue;
    // 그 해 그 달에 30일이 없으면(작은달) 29일에 축하
    const hit = l.day === day || (day === 30 && l.day === 29 && lunarOf(new Date(t.getTime() + 86400_000)).day === 1);
    if (hit) return `${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  return null;
}
