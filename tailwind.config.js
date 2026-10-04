/** @type {import('tailwindcss').Config} */

// 둥근 글꼴 (app/layout.tsx 의 나눔스퀘어라운드) + 휴대폰 기본 글꼴 대체
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
      // 앱 배색: 단순하고 자연스러운 색
      // 기존 클래스 이름은 그대로 두고 색만 바꿔서 모든 화면에 한 번에 적용
      colors: {
        white: '#FFFDF9',            // 순백 대신 따뜻한 흰색
        // 회색 → 아이보리·모래색 계열
        stone: {
          50: '#FAF7F2', 100: '#F3EEE6', 200: '#E7DFD3', 300: '#D4C9B8', 400: '#A99D8B',
          500: '#857A6A', 600: '#685F52', 700: '#514A40', 800: '#3B352E', 900: '#2A2621', 950: '#1A1714',
        },
        // 파란색(주요 버튼, 내 메시지, 링크) → 차분한 세이지 그린
        blue: {
          50: '#F1F5EE', 100: '#E1EAD9', 200: '#C5D5B8', 300: '#A3BB91', 400: '#7F9C6C',
          500: '#5F7D55', 600: '#4E6946', 700: '#40563A', 800: '#354631', 900: '#2C3A29', 950: '#1D271B',
        },
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
