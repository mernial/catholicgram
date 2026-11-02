// 가톨릭 앱 바로가기 (루비로사 건의 → 운영자 2026-11-02: '바로가기 창보다 각각의 앱이 바로 누르면 들어가도록, 각 앱의 그림도',
// '박스로 감싸지 말고 아이콘으로만 정렬') — 내 공간 아이콘 줄(app/page.tsx 'tileGrid')에 내 메뉴 아이콘과 함께 늘어놓는다.
//  - 그림: 각 앱의 Play 스토어 아이콘 (public/apps/<key>.png 192px, scripts/link-check/apps.sh — GitHub Actions app-check 로 받음)
//  - 여는 곳: 휴대폰 화면 주소 (클라우드 세션에서 막혀 있어 link-check 로 200·viewport 확인)
//    · 매일미사(굿뉴스 pk.catholic.missa) → 굿뉴스 휴대폰 '오늘의 미사'
//    · 가톨릭성경(굿뉴스 kr.or.catholic.bible) → 굿뉴스 휴대폰 성경
//    · cpbc플러스(com.pbc.ax.mobilePBC) → cpbc플러스 웹
//  - 휴대폰에 깔린 다른 앱을 웹에서 바로 실행할 수는 없다(크롬은 BROWSABLE 화면만 열어 줌). 다만 굿뉴스 사이트는
//    assetlinks.json 에 '굿뉴스' 앱(kr.or.catholic.goodnews)이 있어, 그 앱이 깔린 안드로이드에서는 굿뉴스 주소가 앱으로 열릴 수 있음
export const CATHOLIC_APPS: { key: string; name: string; url: string; label: string }[] = [
  { key: 'missa', name: '매일미사', url: 'https://maria.catholic.or.kr/mobile/missa/missa_view.asp?today=on', label: '매일미사 — 오늘 미사의 독서와 복음 (굿뉴스)' },
  { key: 'bible', name: '가톨릭성경', url: 'https://maria.catholic.or.kr/mobile/bible/', label: '가톨릭성경 — 성경 읽기 (굿뉴스)' },
  { key: 'pbc', name: 'cpbc플러스', url: 'https://www.cpbc.co.kr/', label: 'cpbc플러스 — 가톨릭평화방송 TV·라디오' },
];
