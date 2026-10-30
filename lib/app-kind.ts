// 지금 어떤 앱으로 가톨릭그램을 보고 있는지 (설정 맨 아래에 표시).
// 한 휴대폰에 앱이 둘(Play 스토어 테스트 앱 + 홈 화면에 추가한 앱)이면 아이콘이 똑같아 어느 쪽인지 알기 어려워서.
//  - Play 스토어 앱(TWA)은 처음 열릴 때 document.referrer 가 'android-app://com.catholicgram.android' → 이 창이 닫힐 때까지 기억(sessionStorage)
//  - 홈 화면에 추가한 앱은 display-mode: standalone, 나머지는 인터넷 창
const PLAY_PACKAGE = 'com.catholicgram.android';
const KEY = 'appKind';

if (typeof window !== 'undefined' && document.referrer.startsWith(`android-app://${PLAY_PACKAGE}`)) {
  try { sessionStorage.setItem(KEY, 'play'); } catch { /* 못 적어도 이번 화면에서는 referrer 로 앎 */ }
}

export type AppKind = 'play' | 'home' | 'browser';

export function browserName(ua = navigator.userAgent): string {
  if (/SamsungBrowser/i.test(ua)) return '삼성 인터넷';
  if (/NAVER|Whale/i.test(ua)) return '네이버 앱·웨일';
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/Edg\//.test(ua)) return '엣지';
  if (/CriOS|Chrome\//.test(ua)) return '크롬';
  if (/Safari\//.test(ua)) return '사파리';
  return '인터넷';
}

export function appKind(): AppKind {
  let play = document.referrer.startsWith(`android-app://${PLAY_PACKAGE}`);
  try { play = play || sessionStorage.getItem(KEY) === 'play'; } catch { /* 무시 */ }
  if (play) return 'play';
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true ? 'home' : 'browser';
}

export function appKindLabel(): { title: string; detail: string } {
  const kind = appKind();
  const browser = browserName();
  if (kind === 'play') return { title: 'Play 스토어에서 받은 앱 (테스트 앱)', detail: `구글 Play 스토어로 설치한 가톨릭그램이에요 · ${browser}로 열려요` };
  if (kind === 'home') return { title: `홈 화면에 추가한 앱 (${browser})`, detail: `${browser}에서 '홈 화면에 추가'로 만든 가톨릭그램이에요` };
  return { title: `인터넷 창 (${browser})`, detail: '앱이 아니라 인터넷 창에서 보고 있어요' };
}
