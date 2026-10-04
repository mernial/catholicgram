// 글씨 크기 설정 (설정 → 글씨 크기). 화면 전체 rem 기준 크기를 바꾼다.
export const TEXT_SIZES = [
  { key: '100%', label: '보통' },
  { key: '112.5%', label: '크게' },
  { key: '125%', label: '아주 크게' },
] as const;

export const TEXT_SIZE_STORAGE_KEY = 'textSize';

export function getTextSize(): string {
  try { return localStorage.getItem(TEXT_SIZE_STORAGE_KEY) || '100%'; } catch { return '100%'; }
}

export function applyTextSize(size: string) {
  document.documentElement.style.fontSize = size;
  try { localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size); } catch { /* 저장 불가 환경 */ }
}

// 첫 화면이 그려지기 전에 저장된 크기를 적용하는 스크립트 (app/layout.tsx)
export const TEXT_SIZE_BOOT_SCRIPT =
  `try{var s=localStorage.getItem('${TEXT_SIZE_STORAGE_KEY}');if(s)document.documentElement.style.fontSize=s}catch(e){}`;
