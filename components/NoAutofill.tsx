'use client';

import { useEffect } from 'react';

// 글을 쓰는 칸을 누르면 크롬(안드로이드)이 자판 위에 '비밀번호(열쇠)·카드·주소' 자동 채우기 줄을 띄운다 (운영자 2026-11-15 화면: 기도지향 칸).
// 가톨릭그램의 글 칸은 이런 것을 채울 일이 없으므로, autocomplete 를 따로 정하지 않은 칸은 모두 'off' 로 둔다.
// (로그인 이메일처럼 일부러 정한 칸은 그대로. 칸이 많고 새로 생기기도 하므로 칸을 누르는 순간에 붙인다)
export default function NoAutofill() {
  useEffect(() => {
    const mark = (el: EventTarget | null) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (el instanceof HTMLInputElement && /^(password|email|checkbox|radio|file|range|color|hidden)$/.test(el.type)) return;
      if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
    };
    const onDown = (e: Event) => mark(e.target);
    // 칸을 누르기 전(pointerdown)에 붙여야 첫 번째 누름부터 줄이 안 뜸. 자판 이동(Tab)·autoFocus 칸은 focusin 으로
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onDown, true);
    document.querySelectorAll('input, textarea').forEach(mark);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('focusin', onDown, true); };
  }, []);
  return null;
}
