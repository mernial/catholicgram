// 화면 색 (설정 → 화면 색): 다섯 가지 중 고르면 앱 전체 바탕·글자·주요 단추 색이 바뀐다 (이 휴대폰에만 저장)
// 색 값은 app/globals.css 의 [data-theme] 변수, tailwind.config.js 의 white·stone·blue 가 그 변수를 쓴다.
// preview: 고르는 칸을 그 색으로 미리 보여 줄 [바탕, 주요 색, 글자]
export interface AppTheme { key: string; name: string; desc: string; swatches: string[]; bar: string; preview: [string, string, string] }

export const THEMES: AppTheme[] = [
  { key: 'ivory', name: '아이보리 & 골드', desc: '따뜻한 상아색에 은은한 금빛', swatches: ['#FAF8F3', '#A48248', '#292724', '#D9D2C6'], bar: '#F6F3EC', preview: ['#FAF8F3', '#A48248', '#292724'] },
  { key: 'navy', name: '화이트 & 네이비', desc: '맑은 흰색에 차분한 남색', swatches: ['#FFFFFF', '#192B49', '#4F6B8F', '#D9DEE7'], bar: '#F1F4F8', preview: ['#F4F6F9', '#192B49', '#192B49'] },
  { key: 'sage', name: '세이지 & 스톤', desc: '지금 색 · 모래색에 부드러운 초록', swatches: ['#FAF7F2', '#5F7D55', '#2A2621', '#D4C9B8'], bar: '#F3EEE6', preview: ['#F3EEE6', '#5F7D55', '#2A2621'] },
  { key: 'burgundy', name: '에디토리얼 버건디', desc: '부드러운 흰색에 깊은 포도주색', swatches: ['#FCFAF7', '#713C47', '#30282A', '#D9D2CC'], bar: '#F6F2EE', preview: ['#FCFAF7', '#713C47', '#30282A'] },
  { key: 'charcoal', name: '차콜 & 샴페인', desc: '어두운 화면 · 눈이 편한 밤 모드', swatches: ['#18191C', '#C9A96E', '#EFEBE3', '#36373D'], bar: '#18191C', preview: ['#18191C', '#C9A96E', '#EFEBE3'] },
];
export const DEFAULT_THEME = 'sage';
export const THEME_STORAGE_KEY = 'appTheme';

export function getTheme(): string {
  try { const t = localStorage.getItem(THEME_STORAGE_KEY); return t && THEMES.some(x => x.key === t) ? t : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export function applyTheme(key: string) {
  const theme = THEMES.find(t => t.key === key) || THEMES.find(t => t.key === DEFAULT_THEME)!;
  document.documentElement.dataset.theme = theme.key;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', theme.bar));
  try { localStorage.setItem(THEME_STORAGE_KEY, theme.key); } catch { /* 저장 불가 환경 */ }
}

// 첫 화면이 그려지기 전에 저장된 색을 적용하는 스크립트 (app/layout.tsx)
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var b=${JSON.stringify(Object.fromEntries(THEMES.map(t => [t.key, t.bar])))};` +
  `if(t&&b[t]){document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',b[t])}}catch(e){}`;
