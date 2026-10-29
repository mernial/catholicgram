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

// '휴대폰 설정 따라가기'(auto): 휴대폰이 다크 모드면 차콜, 아니면 세이지 — 색을 직접 고른 적 없는 교우의 기본.
// 휴대폰이 다크 모드인데 밝은 색을 쓰면 삼성 인터넷(Play 앱이 쓰는 브라우저인 경우가 많음)이 화면을 억지로 어둡게 바꿔
// 글씨·색이 이상해졌음(루비로사) → 다크 모드면 앱이 직접 만든 어두운 화면으로
export const AUTO_THEME = 'auto';
export const AUTO_OPTION = { key: AUTO_THEME, name: '휴대폰 설정 따라가기', desc: '휴대폰이 다크 모드면 어두운 화면(차콜 & 샴페인), 아니면 세이지 & 스톤' };
const DARK_THEME = 'charcoal';
export const prefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
export const isSamsungBrowser = () => typeof navigator !== 'undefined' && /SamsungBrowser/i.test(navigator.userAgent);

// 고른 것 ('auto' 또는 색 이름). 저장된 게 없으면 'auto'
export function getThemeChoice(): string {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t && (t === AUTO_THEME || THEMES.some(x => x.key === t)) ? t : AUTO_THEME;
  } catch { return AUTO_THEME; }
}
export const resolveTheme = (choice: string) =>
  choice === AUTO_THEME || !THEMES.some(x => x.key === choice) ? (prefersDark() ? DARK_THEME : DEFAULT_THEME) : choice;
// 지금 화면에 쓰는 색
export function getTheme(): string { return resolveTheme(getThemeChoice()); }
// color-scheme 표시: 어두운 화면이면 dark. 밝은 색은 보통 'only light'(휴대폰 다크 모드가 색을 바꾸지 않게),
// 삼성 인터넷은 'only light'를 무시하고 억지로 어둡게 바꾸는 대신 '이 사이트는 어두운 화면을 스스로 다룬다'(light dark)고 하면
// 그대로 둔다고 해서 'light dark' (입력칸은 globals.css 에서 밝게 고정)
const colorSchemeFor = (key: string) => (key === DARK_THEME ? 'dark' : isSamsungBrowser() ? 'light dark' : 'only light');

// 다른 색을 골라도 어두운 색(차콜)이 남던 문제(운영자) 대비:
//  - 일부 휴대폰 브라우저는 html 의 data-theme 만 바뀌어서는 안쪽 칸들의 색 규칙(html[data-theme=…] .bg-white 등)을 다시 계산하지 않을 수 있어
//    모든 칸에 걸리는 규칙(`*{}`)을 잠깐 넣었다 빼서 화면 전체 색을 한 번 다시 계산하게 한다 (칸·스크롤 위치는 그대로)
//  - 앱이 다른 창·탭에도 열려 있거나 뒤에 있다 돌아오면 저장된 색을 다시 맞춘다 (아래 THEME_BOOT_SCRIPT)
const RESTYLE = `var s=document.createElement('style');s.textContent='*{--theme-restyle:0}';document.head.appendChild(s);setTimeout(function(){s.remove()},50)`;
function restyle() {
  const s = document.createElement('style');
  s.textContent = '*{--theme-restyle:0}';
  document.head.appendChild(s);
  setTimeout(() => s.remove(), 50);
}
export function applyTheme(choice: string) {
  const key = resolveTheme(choice);
  const theme = THEMES.find(t => t.key === key) || THEMES.find(t => t.key === DEFAULT_THEME)!;
  document.documentElement.dataset.theme = theme.key;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', theme.bar));
  document.querySelectorAll('meta[name="color-scheme"]').forEach(m => m.setAttribute('content', colorSchemeFor(theme.key)));
  restyle();
  try { localStorage.setItem(THEME_STORAGE_KEY, choice === AUTO_THEME ? AUTO_THEME : theme.key); } catch { /* 저장 불가 환경 */ }
}

// 첫 화면이 그려지기 전에 저장된 색을 적용하는 스크립트 (app/layout.tsx). color-scheme meta 도 여기서 head 맨 앞에 만든다(휴대폰 다크 모드가 화면 색을 억지로 바꾸지 않게). 다른 창에서 색을 바꾸거나(storage)
// 뒤에 있다 돌아오면(pageshow·visibilitychange)·휴대폰 다크 모드가 켜지고 꺼지면(다크 모드 예약 등) 다시 맞춘다
export const THEME_BOOT_SCRIPT =
  `(function(){try{var b=${JSON.stringify(Object.fromEntries(THEMES.map(t => [t.key, t.bar])))},d=document.documentElement,` +
  `sam=/SamsungBrowser/i.test(navigator.userAgent),mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null,` +
  `read=function(){try{return localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){return null}},` +
  `res=function(c){if(!c||!b[c])return mq&&mq.matches?'${DARK_THEME}':'${DEFAULT_THEME}';return c},` +
  `set=function(c){var t=res(c),m=document.querySelectorAll('meta[name="theme-color"]'),i;for(i=0;i<m.length;i++)m[i].setAttribute('content',b[t]);` +
  `var s=document.querySelector('meta[name="color-scheme"]');if(!s&&document.head){s=document.createElement('meta');s.setAttribute('name','color-scheme');document.head.insertBefore(s,document.head.firstChild)}` +
  `if(s)s.setAttribute('content',t==='${DARK_THEME}'?'dark':sam?'light dark':'only light');` +
  `if(d.getAttribute('data-theme')!==t){d.setAttribute('data-theme',t);if(document.head){${RESTYLE}}}};` +
  `set(read());addEventListener('storage',function(e){if(e.key==='${THEME_STORAGE_KEY}')set(e.newValue)});` +
  `addEventListener('pageshow',function(){set(read())});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')set(read())});` +
  `document.addEventListener('DOMContentLoaded',function(){set(read())});` +
  `if(mq){var f=function(){set(read())};mq.addEventListener?mq.addEventListener('change',f):mq.addListener&&mq.addListener(f)}` +
  `}catch(e){}})();`;
