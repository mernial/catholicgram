/** @type {import('tailwindcss').Config} */

// 둥근 글꼴 (app/layout.tsx 의 나눔스퀘어라운드) + 휴대폰 기본 글꼴 대체
// 화면 색(테마)에 따라 바뀌는 색: app/globals.css 의 [data-theme] 변수 (R G B) — 투명도(/50 등)도 그대로 쓸 수 있게
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const themedScale = (name) => Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(k => [k, themed(`${name}-${k}`)]));

const roundFont = [
  'var(--font-round)', 'NanumSquareRound', 'Apple SD Gothic Neo', 'Noto Sans KR',
  'Malgun Gothic', 'system-ui', 'sans-serif',
];

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // tablet: 아이패드 같은 큰 터치 화면 → 가운데 좁은 칸 대신 화면 가득 (컴퓨터는 그대로)
      screens: {
        tablet: { raw: '(min-width: 700px) and (any-pointer: coarse)' },
        // 그중 가로로 든 화면 (게시글 크게 보기: 사진 왼쪽 · 글 오른쪽)
        'tablet-land': { raw: '(min-width: 700px) and (any-pointer: coarse) and (orientation: landscape)' },
      },
      // 글씨 크기: 55세 이상 이용자를 위해 기본보다 한 단계씩 크게
      // (rem 단위라 설정의 '글씨 크기'를 바꾸면 전체가 함께 커지고 작아짐)
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.35rem' }],     // 12 → 14px
        sm: ['1rem', { lineHeight: '1.55rem' }],         // 14 → 16px
        base: ['1.0625rem', { lineHeight: '1.7rem' }],   // 16 → 17px
        lg: ['1.25rem', { lineHeight: '1.8rem' }],       // 18 → 20px
        xl: ['1.375rem', { lineHeight: '1.9rem' }],      // 20 → 22px
        '2xl': ['1.625rem', { lineHeight: '2.1rem' }],   // 24 → 26px
        '3xl': ['2rem', { lineHeight: '2.4rem' }],       // 30 → 32px
        '4xl': ['2.375rem', { lineHeight: '2.6rem' }],   // 36 → 38px
      },
      fontFamily: {
        sans: roundFont,
        serif: roundFont, // 제목/로고도 같은 둥근 글꼴로
      },
      // 앱 배색: 기존 클래스 이름은 그대로 두고 색만 바꿔서 모든 화면에 한 번에 적용
      // white(흰 칸)·stone(바탕·글자)·blue(주요 단추·내 메시지·링크)는 고른 화면 색(lib/theme.ts)을 따른다
      // 기본(세이지 & 스톤): 따뜻한 흰색 · 아이보리·모래색 · 차분한 세이지 그린
      colors: {
        white: themed('white'),
        stone: themedScale('stone'),
        blue: themedScale('blue'),
        // 보라(익명 고민상담) → 부드러운 라벤더
        violet: {
          50: '#F6F3F8', 100: '#ECE6F1', 200: '#DACFE4', 300: '#BFADD0', 400: '#9F88B6',
          500: '#85699E', 600: '#6F5686', 700: '#5B476E', 800: '#4B3B5B', 900: '#3F334C', 950: '#2A2233',
        },
        // 금색(신부님 뱃지, 광고, 포인트) → 은은한 꿀색
        amber: {
          50: '#FBF6EC', 100: '#F5EAD2', 200: '#EBD5A6', 300: '#DDB975', 400: '#CC9E4D',
          500: '#B98535', 600: '#9C6C2A', 700: '#7D5524', 800: '#644522', 900: '#52391F', 950: '#2E1F10',
        },
      },
    },
  },
  plugins: [],
}
