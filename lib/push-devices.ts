// 같은 휴대폰에서 알림이 두 번 오지 않게.
// 한 휴대폰에 가톨릭그램이 둘 깔려 있으면(크롬으로 홈 화면에 추가한 앱 + Play 테스트 앱이 삼성 인터넷으로 열리는 경우 등)
// 브라우저마다 따로 알림 구독이 생겨, 알림 하나가 두 번 왔다. 구독마다 기기 이름(device)과 마지막으로 앱을 연 때(last_seen)를 적어 두고
// 같은 사람의 같은 기기에는 가장 최근에 연 앱 하나에만 보낸다. (supabase/push-devices.sql 실행 전에는 예전처럼 모두에게)

export type PushSub = {
  id: string; user_id?: string; endpoint: string; p256dh: string; auth: string;
  device?: string | null; last_seen?: string | null; created_at?: string | null;
};

export function onePerDevice<T extends PushSub>(subs: T[]): T[] {
  const latest = new Map<string, T>();
  const rest: T[] = [];
  const seenAt = (s: T) => +new Date(s.last_seen || s.created_at || 0);
  for (const s of subs) {
    if (!s.device) { rest.push(s); continue; } // 기기를 모르면 따로 (예전 구독 · 컴퓨터)
    const key = `${s.user_id || ''}|${s.device}`;
    const cur = latest.get(key);
    if (!cur || seenAt(s) > seenAt(cur)) latest.set(key, s);
  }
  return [...rest, ...latest.values()];
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
