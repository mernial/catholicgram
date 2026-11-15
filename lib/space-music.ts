// 공간(내 공간·교우의 공간)에 들어가면 그 주인의 배경음악을 저절로 틀지 — 이 휴대폰에만 저장 (운영자 2026-11-15:
// 무음·진동인데 음악이 나와서. 웹은 휴대폰이 무음인지 알 수 없으므로 설정에서 직접 고름). 기본은 켬(예전처럼)
const KEY = 'spaceMusicAuto';
export function getSpaceMusicAuto(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSpaceMusicAuto(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 저장 못 해도 이번엔 그대로 */ }
}
