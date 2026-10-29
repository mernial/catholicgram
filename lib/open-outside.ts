// 카카오톡·네이버·밴드 같은 앱 안의 창(인앱 브라우저)에서 가톨릭그램 주소를 밖에서 열기.
// 앱 안의 창은 저장 공간이 따로라 로그인이 안 되어 있다(공유받은 글에 댓글을 달려면 다시 로그인) →
// 이미 로그인해 둔 곳으로 넘긴다. Play 앱은 휴대폰의 크롬(또는 삼성 인터넷) 저장 공간을 같이 쓰므로 거기서도 로그인되어 있다
//  - 카카오톡(안드로이드·아이폰): kakaotalk://web/openExternal — 휴대폰 기본 브라우저(설치한 Play 앱이 있으면 Play 앱)
//    아이패드 카카오톡은 이 주소를 못 열어 '해당 페이지를 찾을 수 없습니다'가 떠서 null (⋯ → 다른 브라우저로 열기 안내)
//  - 다른 앱 안의 창(안드로이드): intent:// (패키지 없이) — Play 앱이 있으면 Play 앱, 없으면 기본 브라우저
export const IN_APP_UA = /KAKAOTALK|NAVER\(inapp|NAVER|Line\/|FBAN|FBAV|Instagram|BAND\/|DaumApps|everytimeApp|; wv\)/i;

const isIPad = (ua: string) => /iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

export const inAppBrowser = () => typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent);

export function outsideHref(url: string): string | null {
  if (typeof window === 'undefined' || !inAppBrowser()) return null;
  const ua = navigator.userAgent;
  const abs = new URL(url, window.location.origin);
  if (/KAKAOTALK/i.test(ua)) return isIPad(ua) ? null : `kakaotalk://web/openExternal?url=${encodeURIComponent(abs.href)}`;
  if (/Android/i.test(ua)) return `intent://${abs.host}${abs.pathname}${abs.search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
  return null;
}
