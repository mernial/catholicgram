// 실제로 보이는 화면(visual viewport)의 크기·위치 → html 의 CSS 변수 --vvh·--vvw(높이·너비)·--vvtop·--vvleft(밀린 만큼)
// 대화방(1:1·단체방·사랑방)이 이 값으로 보이는 화면에 딱 맞춘다 (globals.css `.fit-visual`).
// 아이폰·아이패드는 자판이 올라오면(아이패드+키보드는 아래 작은 단축 막대만) 화면 높이를 줄이지 않고 입력칸이 보이게
// 화면을 위로 밀어 올려서, 채팅을 치다 보면 대화방 맨 위(상대 프로필)가 가려졌다 (운영자).
// 아이패드에서 알림을 눌러 앱이 뜰 때·입력칸에 들어갈 때 화면이 옆으로 밀려 대화방이 오른쪽 절반에 치우쳐 보이기도 했다 (운영자)
//  → 옆으로 밀린 만큼도 맞추고(--vvleft), 페이지가 옆으로 스크롤되어 있으면 제자리로. 안드로이드·컴퓨터는 값이 화면 그대로
export function watchVisualViewport(): () => void {
  if (typeof window === 'undefined') return () => {};
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  const unshift = () => { if (window.scrollX !== 0) window.scrollTo(0, window.scrollY); };
  const apply = () => {
    unshift();
    if (!vv) return;
    root.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.setProperty('--vvw', `${Math.round(vv.width)}px`);
    root.setProperty('--vvtop', `${Math.max(0, Math.round(vv.offsetTop))}px`);
    root.setProperty('--vvleft', `${Math.round(vv.offsetLeft)}px`);
  };
  // 앱이 다시 뜨거나(알림을 누름) 돌리거나 입력칸에 들어간 뒤 화면이 자리 잡을 때까지 몇 번 더
  const settle = () => { apply(); [80, 300, 800].forEach(ms => setTimeout(apply, ms)); };
  const onVisible = () => { if (document.visibilityState === 'visible') settle(); };
  apply();
  vv?.addEventListener('resize', apply);
  vv?.addEventListener('scroll', apply);
  window.addEventListener('scroll', unshift, { passive: true }); // 옆으로 밀리는 즉시 제자리로 (앱은 옆으로 스크롤할 곳이 없음)
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  window.addEventListener('pageshow', settle);
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('focusin', settle);
  return () => {
    vv?.removeEventListener('resize', apply);
    vv?.removeEventListener('scroll', apply);
    window.removeEventListener('scroll', unshift);
    window.removeEventListener('resize', settle);
    window.removeEventListener('orientationchange', settle);
    window.removeEventListener('pageshow', settle);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('focusin', settle);
  };
}
