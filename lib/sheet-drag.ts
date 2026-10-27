'use client';

import { useEffect, useRef } from 'react';

// 아래에서 올라오는 창(사연함·알림·익명 고민상담 등)을 손가락으로 아래로 끌어내리면 닫는다.
//  - 손잡이·제목줄: 어디서든 아래로 끌기 (마우스도)
//  - 내용: 맨 위까지 올라가 있을 때 아래로 끌면 창이 따라 내려온다 (내용을 위로 올려 보는 중이면 그냥 스크롤)
// 110px 넘게 내리고 놓으면 닫히고, 덜 내리면 제자리로 돌아간다.
const CLOSE_AT = 110;

export function useSheetDrag(onClose: () => void, active = true) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const settle = (sheet: HTMLElement, dy: number) => {
    if (dy > CLOSE_AT) {
      sheet.style.transition = 'transform 0.18s ease-in';
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => closeRef.current(), 170);
    } else {
      sheet.style.transition = 'transform 0.2s';
      sheet.style.transform = '';
    }
  };

  // 내용에서 아래로 당기기 (손가락만: 브라우저 스크롤을 막아야 해서 직접 듣는다)
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !active) return;
    let y0 = 0, dy = 0, dragging = false, blocked = false;
    const scrolledInside = (el: EventTarget | null) => {
      for (let n = el as HTMLElement | null; n && n !== sheet; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable || n.dataset?.noSheetDrag !== undefined) return true;
      }
      return false;
    };
    const start = (e: TouchEvent) => { y0 = e.touches[0].clientY; dy = 0; dragging = false; blocked = scrolledInside(e.target); };
    const move = (e: TouchEvent) => {
      if (blocked) return;
      dy = e.touches[0].clientY - y0;
      if (!dragging) {
        if (dy < -4) { blocked = true; return; }   // 위로 = 내용 스크롤
        if (dy < 8) return;
        dragging = true;
        sheet.style.transition = 'none';
      }
      e.preventDefault();
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const end = () => { if (dragging) settle(sheet, dy); dragging = false; };
    sheet.addEventListener('touchstart', start, { passive: true });
    sheet.addEventListener('touchmove', move, { passive: false });
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
    return () => {
      sheet.removeEventListener('touchstart', start);
      sheet.removeEventListener('touchmove', move);
      sheet.removeEventListener('touchend', end);
      sheet.removeEventListener('touchcancel', end);
    };
  }, [active]);

  // 손잡이·제목줄 끌기 (마우스·펜도) — 단추 위에서 시작해도 되고, 그냥 누르면 단추가 눌린다
  const drag = useRef<{ y: number; dy: number; moved: boolean; id: number } | null>(null);
  const handleProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => { if (e.pointerType !== 'touch') drag.current = { y: e.clientY, dy: 0, moved: false, id: e.pointerId }; },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current, sheet = sheetRef.current;
      if (!d || !sheet) return;
      d.dy = e.clientY - d.y;
      if (!d.moved) {
        if (Math.abs(d.dy) <= 6) return;
        d.moved = true;
        sheet.style.transition = 'none';
        try { e.currentTarget.setPointerCapture(d.id); } catch { /* 무시 */ }
      }
      sheet.style.transform = `translateY(${Math.max(0, d.dy)}px)`;
    },
    onPointerUp: () => { const d = drag.current, sheet = sheetRef.current; drag.current = null; if (d?.moved && sheet) settle(sheet, d.dy); },
    onPointerCancel: () => { const sheet = sheetRef.current; drag.current = null; if (sheet) settle(sheet, 0); },
  };
  return { sheetRef, handleProps };
}
