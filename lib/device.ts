// 아이패드·안드로이드 태블릿처럼 큰 터치 화면인지 → html[data-tablet] (Tailwind 의 `tablet:`·`tablet-land:` 가 이것을 봄, tailwind.config.js)
// 예전엔 CSS 미디어 쿼리(창 너비 700px 이상 + 터치)로 정해서, 아이패드에서 알림을 눌러 앱이 다시 뜰 때 잠깐 창 크기가
// 다르게 잡히면 '가운데 좁은 칸' ↔ '화면 가득'이 바뀌며 화면이 오른쪽으로 치우쳤다가 펴졌다 (운영자).
// 창 크기 대신 기기 화면 크기(screen — 돌리거나 앱이 다시 떠도 그대로)로 화면을 그리기 전에 한 번 정한다
export const DEVICE_BOOT_SCRIPT =
  `try{if((navigator.maxTouchPoints||0)>0&&Math.min(screen.width,screen.height)>=700)document.documentElement.setAttribute('data-tablet','')}catch(e){}`;
