// 아이패드·안드로이드 태블릿처럼 큰 터치 화면인지 → html[data-tablet] (Tailwind 의 `tablet:`·`tablet-land:` 가 이것을 봄, tailwind.config.js)
// 예전엔 CSS 미디어 쿼리(창 너비 700px 이상 + 터치)로 정해서, 아이패드에서 알림을 눌러 앱이 다시 뜰 때 잠깐 창 크기가
// 다르게 잡히면 '가운데 좁은 칸' ↔ '화면 가득'이 바뀌며 화면이 오른쪽으로 치우쳤다가 펴졌다 (운영자).
// 창 크기 대신 기기 화면 크기(screen — 돌리거나 앱이 다시 떠도 그대로)로 화면을 그리기 전에 정한다.
// 갤럭시 폴드처럼 접었다 펴는 휴대폰은 펴면 기기 화면 크기 자체가 바뀌므로 그때(screen 값이 바뀐 resize) 다시 정한다
// (운영자: 폴드8을 펴도 가운데 좁은 칸 그대로였음 — 접은 채로 앱을 열면 처음에 휴대폰으로 정해진 뒤 바뀌지 않았음).
// 기준은 짧은 쪽 600px (안드로이드의 '큰 화면' 기준, 펼친 폴드는 글씨·화면 크게 보기를 켜도 650px 안팎, 휴대폰은 480px 아래)
// 화면 방향: 예전엔 manifest 가 '세로 고정'이라 폴드를 펴면(안쪽 화면이 가로로 넓으면) 안드로이드가 앱을 가운데 세로 칸에 넣고 양옆을 검게 비웠다.
// 이제 manifest 는 'any', 설치한 앱(standalone)을 휴대폰 화면에서 쓸 때만 여기서 세로로 고정하고 큰 화면(펼친 폴드·태블릿)은 풀어 둔다
export const DEVICE_BOOT_SCRIPT =
  `(function(){try{var d=document.documentElement,s=screen,o=s.orientation,set=function(){var big=(navigator.maxTouchPoints||0)>0&&Math.min(s.width,s.height)>=600;if(big)d.setAttribute('data-tablet','');else d.removeAttribute('data-tablet');try{if(o&&matchMedia('(display-mode: standalone)').matches){if(big)o.unlock();else o.lock('portrait').catch(function(){})}}catch(e){}},last=s.width+'x'+s.height;set();addEventListener('resize',function(){var now=s.width+'x'+s.height;if(now!==last){last=now;set()}})}catch(e){}})();`;
