// 같은 휴대폰에서 알림이 두 번 오지 않게.
// 한 휴대폰에 가톨릭그램이 둘 깔려 있으면(크롬으로 홈 화면에 추가한 앱 + Play 테스트 앱이 삼성 인터넷으로 열리는 경우 등)
// 브라우저마다 따로 알림 구독이 생겨, 알림 하나가 두 번 왔다. 구독마다 기기 이름(device)과 마지막으로 앱을 연 때(last_seen)를 적어 두고
// 같은 사람의 같은 기기에는 가장 최근에 연 앱 하나에만 보낸다. (supabase/push-devices.sql 실행 전에는 예전처럼 모두에게)

export type PushSub = {
  id: string; user_id?: string; endpoint: string; p256dh: string; auth: string;
  device?: string | null; last_seen?: string | null; created_at?: string | null;
  paused_until?: string | null; // 이 기기에서 알림을 잠시(또는 계속) 끈 때까지 (supabase/push-pause.sql)
};

// 알림을 끈 기기인지: 알림 받기(구독)는 남겨 두고 서버가 보내지 않는다 (운영자 2026-11-14: 휴대폰 알림 자체는 켜 두고 앱에서 끄기)
export const isPaused = (s: { paused_until?: string | null }, now = Date.now()) => !!s.paused_until && Date.parse(s.paused_until) > now;
// '다시 켤 때까지' 끈 것
export const PAUSE_FOREVER = '9999-12-31T00:00:00.000Z';

// Play 테스트 앱이 쓰는 브라우저의 구독은 기기 이름 끝에 '|play' 를 붙여 둔다 (루비로사 2026-11-01: 알림이 두 개씩 —
// Play 앱(크롬)과 예전 삼성 인터넷 구독이 함께 받았음). 같은 기기라면 Play 앱 구독을 먼저 고르고, 없으면 가장 최근에 연 앱.
export const PLAY_MARK = '|play';
const baseDevice = (d: string) => (d.endsWith(PLAY_MARK) ? d.slice(0, -PLAY_MARK.length) : d);

export function onePerDevice<T extends PushSub>(subs: T[]): T[] {
  const latest = new Map<string, T>();
  const rest: T[] = [];
  const seenAt = (s: T) => +new Date(s.last_seen || s.created_at || 0);
  const isPlay = (s: T) => !!s.device?.endsWith(PLAY_MARK);
  for (const s of subs) {
    if (!s.device) { rest.push(s); continue; } // 기기를 모르면 따로 (예전 구독 · 컴퓨터)
    const key = `${s.user_id || ''}|${baseDevice(s.device)}`;
    const cur = latest.get(key);
    const better = !cur || (isPlay(s) !== isPlay(cur) ? isPlay(s) : seenAt(s) > seenAt(cur));
    if (better) latest.set(key, s);
  }
  // 같은 기기에서 고른 앱이 알림을 꺼 두었으면 그 기기에는 보내지 않는다 (다른 앱으로 대신 보내지도 않음)
  const now = Date.now();
  return [...rest, ...latest.values()].filter(s => !isPaused(s, now));
}

// 이 브라우저가 Play 테스트 앱으로 열린 적이 있는지 (Play 앱은 크롬·삼성 인터넷의 저장소를 같이 씀 → 그 브라우저의 구독이 Play 앱의 구독)
const PLAY_HERE = 'playHereAt';
export function notePlayHere(isPlay: boolean) {
  if (!isPlay) return;
  try { localStorage.setItem(PLAY_HERE, String(Date.now())); } catch { /* 무시 */ }
}
export function playHereRecently(days = 30): boolean {
  try { const t = Number(localStorage.getItem(PLAY_HERE) || 0); return !!t && Date.now() - t < days * 86400e3; } catch { return false; }
}

// 이 기기의 이름: 안드로이드는 모델(예: SM-S928N, 크롬·삼성 인터넷 모두 같은 값), 아이폰·아이패드는 그 이름.
// 컴퓨터는 모델이 없어 빈 값 (기기별로 묶지 않음)
export async function pushDeviceKey(): Promise<string> {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const uad = (navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ model?: string; platform?: string }> } }).userAgentData;
  let model = '';
  let platform = uad?.platform || '';
  try {
    const v = await uad?.getHighEntropyValues?.(['model', 'platform']);
    model = v?.model || '';
    platform = v?.platform || platform;
  } catch { /* 못 읽으면 아래에서 */ }
  if (!model) { const m = ua.match(/Android [\d.]+; ([^;)]+)/); if (m && m[1].trim() !== 'K') model = m[1].trim(); }
  if (/iPhone|iPod/.test(ua)) return 'iOS|iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iOS|iPad';
  if (!platform) platform = /Android/.test(ua) ? 'Android' : '';
  return model ? `${platform || 'Android'}|${model}` : '';
}
