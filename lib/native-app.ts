// 가톨릭그램 안드로이드 앱(하이브리드, android-app/)과 웹 화면이 주고받는 통로.
// 앱 안의 웹뷰에서만 window.CatholicgramApp 이 생기고(가톨릭그램 주소에서만), 사용자 에이전트에 'CatholicgramApp/버전' 이 붙는다.
// 크롬·삼성 인터넷·아이폰·컴퓨터에서는 isNativeApp() 이 false 라 이 파일은 아무 일도 하지 않는다.
//
// 웹 → 앱: callNative('cmd', {...}) → Promise (앱이 같은 id 로 답함)
// 앱 → 웹: window 'cg-native' 이벤트 { type: 'push' | 'push-token' | 'resume', ... } — onNative(type, fn)

type NativePort = {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
  addEventListener?: (type: 'message', fn: (event: { data: string }) => void) => void;
};

export const isNativeApp = (): boolean =>
  typeof navigator !== 'undefined' && /CatholicgramApp\//.test(navigator.userAgent);

/** 앱 버전 (예: '1.1.0'), 앱이 아니면 null */
export const nativeAppVersion = (): string | null =>
  typeof navigator === 'undefined' ? null : navigator.userAgent.match(/CatholicgramApp\/([\w.-]+)/)?.[1] ?? null;

const port = (): NativePort | null =>
  typeof window === 'undefined' ? null : ((window as unknown as { CatholicgramApp?: NativePort }).CatholicgramApp ?? null);

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let listening = false;
let seq = 0;

function listen(p: NativePort) {
  if (listening) return;
  listening = true;
  const onMessage = (event: { data: string }) => {
    let msg: { id?: string; ok?: boolean; data?: unknown; error?: string };
    try { msg = JSON.parse(event.data); } catch { return; }
    const job = msg.id ? pending.get(msg.id) : undefined;
    if (!job) return;
    pending.delete(msg.id!);
    clearTimeout(job.timer);
    if (msg.ok) job.resolve(msg.data ?? null);
    else job.reject(new Error(msg.error || 'native error'));
  };
  if (p.addEventListener) p.addEventListener('message', onMessage);
  else p.onmessage = onMessage;
}

/** 앱에 일을 맡김. 앱이 아니거나 통로가 없으면 바로 실패 */
export function callNative<T = unknown>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  const p = port();
  if (!p) return Promise.reject(new Error('not in app'));
  listen(p);
  const id = `n${Date.now().toString(36)}${(seq++).toString(36)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, timeoutMs);
    pending.set(id, { resolve: v => resolve(v as T), reject, timer });
    try { p.postMessage(JSON.stringify({ id, cmd, ...args })); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e as Error); }
  });
}

/** 앱이 먼저 보내는 소식 받기 → 그만 받기 함수 */
export function onNative(type: string, fn: (detail: Record<string, unknown>) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
    if (detail?.type === type) fn(detail);
  };
  window.addEventListener('cg-native', handler);
  return () => window.removeEventListener('cg-native', handler);
}

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export type NativeFile = { name?: string; mime?: string; blob?: Blob; url?: string };

async function packFiles(files: NativeFile[]) {
  const blobs = await Promise.all(files.filter(f => f.blob).map(async f => ({ name: f.name || '', mime: f.mime || f.blob!.type || 'application/octet-stream', data: await blobToBase64(f.blob!) })));
  const urls = files.filter(f => !f.blob && f.url).map(f => ({ url: f.url!, name: f.name || '', mime: f.mime || '' }));
  return { files: blobs, urls };
}

/** 휴대폰 공유 창 (카카오톡·문자 등): 글·주소·파일(사진) */
export async function nativeShare(opts: { title?: string; text?: string; url?: string; files?: NativeFile[] }): Promise<void> {
  const packed = await packFiles(opts.files || []);
  await callNative('share', { title: opts.title || '', text: opts.text || '', url: opts.url || '', ...packed }, 120_000);
}

/** 사진첩에 저장 (사진은 Pictures/가톨릭그램, 동영상은 Movies/가톨릭그램) → 저장한 개수 */
export async function nativeSave(files: NativeFile[]): Promise<number> {
  const packed = await packFiles(files);
  const r = await callNative<{ saved: number }>('save', packed, 180_000);
  return r?.saved ?? 0;
}

/** 로그인: 앱 안 웹뷰에서는 구글이 로그인을 막아서 크롬 창에서 하고 앱으로 돌아온다 */
export function nativeLogin(provider: 'kakao' | 'google' | 'naver', switchAccount = false) {
  return callNative('login', { provider, switch: switchAccount });
}

/** 가톨릭그램 밖 링크 (다른 사이트·앱) */
export function nativeOpenExternal(url: string) {
  return callNative('openExternal', { url });
}

/** 시계 줄·아래 막대 색을 지금 화면 색에 맞춤 */
export function nativeSetBars(color: string, dark: boolean) {
  if (!isNativeApp()) return;
  callNative('bars', { color, dark }).catch(() => {});
}

/** 앱이 화면에 떠 있을 때 알림을 웹으로 넘겨줌 → 앱 안 배너로 / 화면을 바꿀 때 웹이 부를 함수 */
export function exposeNativeHooks(openLink: (url: string) => void) {
  if (typeof window === 'undefined') return;
  (window as unknown as { __cgOpenLink?: (url: string) => void }).__cgOpenLink = openLink;
}
