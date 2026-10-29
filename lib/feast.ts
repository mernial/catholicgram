// 축일(주보성인 축일) 관련 도우미
// 축일은 'MM-DD' 형식 문자열로 저장한다. (예: '09-29')

export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isValidFeastDay = (value?: string | null): value is string => {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [m, d] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN_MONTH[m - 1];
};

export const formatFeastDay = (value?: string | null) => {
  if (!isValidFeastDay(value)) return '';
  const [m, d] = value.split('-').map(Number);
  return `${m}월 ${d}일`;
};

export const toFeastDay = (month: number, day: number) =>
  `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// 한국 시간 기준 오늘의 축일 키 목록
// (2월 29일이 축일인 분은 윤년이 아닌 해에는 2월 28일에 함께 축하)
export const todayFeastKeys = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const key = toFeastDay(kst.getUTCMonth() + 1, kst.getUTCDate());
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return key === '02-28' && !leap ? [key, '02-29'] : [key];
};

// 오늘(한국 시간)이 그 날('MM-DD')인지 — 생일·축일 리본 (2월 29일은 윤년이 아니면 28일에)
export const isTodayMonthDay = (value?: string | null, now = new Date()) => !!value && todayFeastKeys(now).includes(value);

// 오늘 무슨 날인지 ('MM-DD' 생일·축일) → 알림 문구 · 축하 인사 (매일 아침 알림 /api/cron/feast-day 와 앱 알림 목록이 같이 씀)
export type CheerKind = 'birthday' | 'feast' | 'both';
export const cheerKindOf = (p?: { birthday?: string | null; feast_day?: string | null } | null, now = new Date()): CheerKind | null => {
  const b = isTodayMonthDay(p?.birthday, now), f = isTodayMonthDay(p?.feast_day, now);
  return b && f ? 'both' : b ? 'birthday' : f ? 'feast' : null;
};
export const CHEER_WORD: Record<CheerKind, string> = { birthday: '생일', feast: '축일', both: '생일이자 축일' };
export const CHEER_ICON: Record<CheerKind, string> = { birthday: '🎂', feast: '🎉', both: '🎂' };
export const cheerMessage = (name: string, kind: CheerKind) =>
  kind === 'both' ? `${name}님, 생일과 축일을 함께 축하드려요! 🎂🎉 주님의 축복과 주보성인의 전구가 늘 함께하시길 기도할게요 🙏`
  : kind === 'birthday' ? `${name}님, 생일 축하드려요! 🎂 주님의 축복이 가득한 한 해 되시길 기도할게요 🙏`
  : `${name}님, 축일 축하드려요! 🎉 주님의 은총이 가득하시길 기도할게요 🙏`;
// 본인에게 보내는 축하
export const selfCheer = (name: string, kind: CheerKind) =>
  kind === 'both' ? { title: '생일과 축일을 함께 축하드립니다!', body: `${name}님, 주님의 축복과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏` }
  : kind === 'birthday' ? { title: '생일을 축하드립니다!', body: `${name}님, 태어나신 오늘, 주님의 축복이 가득하시길 기도합니다 🙏` }
  : { title: '축일을 축하드립니다!', body: `${name}님, 주님의 은총과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏` };
// 여러 사람: 모두 생일이면 '생일', 모두 축일이면 '축일', 섞이면 '생일·축일'
export const cheerWordOfMany = (kinds: CheerKind[]) =>
  kinds.every(k => k === 'birthday') ? '생일' : kinds.every(k => k === 'feast') ? '축일' : '생일·축일';

// 로그인 정보의 생일(네이버 'MM-DD', 카카오 'MMDD', 'YYYY-MM-DD' 등) → 'MM-DD' (알 수 없으면 null)
export const birthdayFromMeta = (raw?: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(?:\d{4}-?)?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const value = `${m[1]}-${m[2]}`;
  return isValidFeastDay(value) ? value : null;
};

// 한국 시간 기준 오늘 날짜 'YYYY-MM-DD'
export const todayKst = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
