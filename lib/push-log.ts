// 휴대폰 알림이 켜지고 꺼진 기록 (이 휴대폰·이 앱에만, 최근 8개)
// '분명 켰는데 다시 꺼져 있다'는 교우 휴대폰에서 설정 → '지금 쓰는 앱' 아래로 언제·왜 꺼졌는지 본다 (율리T)

export type PushState = 'on' | 'off' | 'denied';
export type PushLogEntry = { at: number; state: PushState; why: string };

const MAX = 8;
const key = (userId: string) => `pushLog:${userId}`;

export function readPushLog(userId: string): PushLogEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(userId)) || '[]');
    return Array.isArray(list) ? list.filter(e => e && typeof e.at === 'number' && typeof e.why === 'string') : [];
  } catch {
    return [];
  }
}

export const lastPushState = (userId: string): PushState | null => readPushLog(userId).at(-1)?.state ?? null;

// 한 번이라도 켠 적이 있으면(이 휴대폰·이 앱) 켜기 안내 창을 다시 띄우지 않음 — 저절로 꺼지는 휴대폰에서 안내가 자꾸 떠서 불편했음(루비로사)
export const everPushOn = (userId: string) => readPushLog(userId).some(e => e.state === 'on');
// 직접 끄지 않았는데 꺼진 적이 있음 → 알림창에 '알림이 자꾸 꺼지나요?' 해결 방법
export const LOST_WHY = '직접 끄지 않았는데 꺼짐';
export const lastPushLossAt = (userId: string) => readPushLog(userId).filter(e => e.state === 'off' && e.why.startsWith(LOST_WHY)).at(-1)?.at ?? 0;

// 바뀐 때만 적는다 (같은 상태가 이어지면 그대로) — force 면 같은 상태여도 적음 (켜지 못한 이유 등)
export function notePush(userId: string, state: PushState, why: string, force = false) {
  const list = readPushLog(userId);
  const last = list.at(-1);
  if (!force && last?.state === state) return;
  if (last && last.state === state && last.why === why) return;
  list.push({ at: Date.now(), state, why });
  try { localStorage.setItem(key(userId), JSON.stringify(list.slice(-MAX))); } catch { /* 저장 불가 환경 */ }
}

// 허용 상태 글: Notification.permission · pushManager.permissionState ('prompt' = 아직 안 물어봄)
export const permissionWord = (p?: string | null) =>
  p === 'granted' ? '허용됨' : p === 'denied' ? '막힘' : p === 'default' || p === 'prompt' ? '아직 안 물어봄' : '알 수 없음';

export const formatPushLogTime = (at: number) =>
  new Date(at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
