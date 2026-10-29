// 실제로 보이는 화면(visual viewport)의 높이·위치 → html 의 CSS 변수 --vvh(높이)·--vvtop(위로 밀린 만큼)
// 대화방(1:1·단체방·사랑방)이 이 값으로 보이는 화면에 딱 맞춘다 (fixed + top·height).
// 아이폰·아이패드는 자판이 올라오면(아이패드+키보드는 아래 작은 단축 막대만) 화면 높이를 줄이지 않고 입력칸이 보이게
// 화면을 위로 밀어 올려서, 채팅을 치다 보면 대화방 맨 위(상대 프로필)가 가려졌다 (운영자). 안드로이드·컴퓨터는 값이 화면 그대로
export function watchVisualViewport(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  const root = document.documentElement.style;
  const apply = () => {
    root.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.setProperty('--vvtop', `${Math.max(0, Math.round(vv.offsetTop))}px`);
  };
  apply();
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
}
