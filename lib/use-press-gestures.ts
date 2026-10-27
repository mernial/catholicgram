'use client';

import { useRef, useState } from 'react';

// 메시지·댓글 공통 손동작 (1:1 메시지, 단체 채팅방, 게시글 댓글)
//  - 한 번 누르기(onTap): 두 번 누르기를 쓰는 곳에서는 0.36초 기다렸다가
//  - 두 번 누르기(onDoubleTap): 하트
//  - 꾹 누르기(onLongPress, 0.45초): 그 자리 메뉴 (컴퓨터는 오른쪽 단추)
//  - 옆으로 밀기(onSwipe, SWIPE_REPLY 넘게 밀었다 놓기): 답장. 미는 동안 swipe 로 따라 움직이게
//    위아래 스크롤은 그대로 (붙이는 칸에 touch-action: pan-y)
export const SWIPE_REPLY = 60;

// 꾹 누르고 나서 손을 떼면 어떤 휴대폰은 '누름'을 한 번 더 보낸다. 그 누름이 막 뜬 메뉴의 바깥(어두운 곳)에 떨어지면
// 메뉴가 바로 닫히므로, 손을 뗀 직후(0.3초 안)의 누름은 화면 어디서든 한 번 버린다.
let swallowClicksUntil = 0;
let swallowInstalled = false;
const swallowNextClick = () => {
  swallowClicksUntil = Date.now() + 300;
  if (swallowInstalled || typeof document === 'undefined') return;
  swallowInstalled = true;
  document.addEventListener('click', e => {
    if (Date.now() < swallowClicksUntil) { swallowClicksUntil = 0; e.stopPropagation(); e.preventDefault(); }
  }, true);
};

export function usePressGestures<T>({ keyOf, onTap, onDoubleTap, onLongPress, onSwipe }: {
  keyOf: (item: T) => string;
  onTap?: (item: T, el: HTMLElement) => void;
  onDoubleTap?: (item: T) => void;
  onLongPress?: (item: T, el: HTMLElement) => void;
  onSwipe?: (item: T) => void;
}) {
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const swipeRef = useRef<{ id: string; x: number; y: number; dx: number; active: boolean; done: boolean } | null>(null);
  const clearSingle = () => { if (singleTimer.current) { clearTimeout(singleTimer.current); singleTimer.current = null; } };

  const bind = (item: T) => {
    const id = keyOf(item);
    const dragging = swipe?.id === id;
    return {
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        if (longPress.current?.fired) { longPress.current = null; return; } // 꾹 누른 뒤 손을 뗀 것
        if (swipeRef.current?.done) { swipeRef.current = null; return; }   // 밀어서 답장한 뒤 손을 뗀 것
        const el = e.currentTarget;
        const now = Date.now();
        const last = lastTap.current;
        clearSingle();
        if (onDoubleTap && last && last.id === id && now - last.at < 350) { lastTap.current = null; onDoubleTap(item); return; }
        lastTap.current = { id, at: now };
        if (!onTap) return;
        if (onDoubleTap) singleTimer.current = setTimeout(() => onTap(item, el), 360);
        else onTap(item, el);
      },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        if (longPress.current) clearTimeout(longPress.current.timer);
        longPress.current = null;
        if (onLongPress) {
          const timer = setTimeout(() => {
            if (longPress.current) longPress.current.fired = true;
            clearSingle();
            swipeRef.current = null; setSwipe(null);
            try { navigator.vibrate?.(15); } catch { /* 무시 */ }
            onLongPress(item, el);
          }, 450);
          longPress.current = { timer, x: e.clientX, y: e.clientY, fired: false };
        }
        swipeRef.current = onSwipe ? { id, x: e.clientX, y: e.clientY, dx: 0, active: false, done: false } : null;
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const lp = longPress.current;
        if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.timer); longPress.current = null; } // 움직이면 꾹 누르기가 아님
        const sw = swipeRef.current;
        if (!sw || sw.id !== id || sw.done || lp?.fired) return;
        const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
        if (!sw.active) {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            sw.active = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
          } else {
            if (Math.abs(dy) > 12) swipeRef.current = null; // 위아래로 스크롤하는 중
            return;
          }
        }
        sw.dx = Math.max(-90, Math.min(90, dx));
        setSwipe({ id, dx: sw.dx });
      },
      onPointerUp: () => {
        const lp = longPress.current;
        if (lp && !lp.fired) { clearTimeout(lp.timer); longPress.current = null; }
        else if (lp?.fired) { longPress.current = null; swallowNextClick(); } // 이어서 오는 '누름'은 무시
        const sw = swipeRef.current;
        if (sw?.active) {
          if (Math.abs(sw.dx) >= SWIPE_REPLY && onSwipe) { try { navigator.vibrate?.(10); } catch { /* 무시 */ } onSwipe(item); }
          sw.active = false; sw.done = true; // 이어서 오는 '누름'은 무시
          setSwipe(null);
        } else swipeRef.current = null;
      },
      onPointerCancel: () => {
        const lp = longPress.current; if (lp) clearTimeout(lp.timer); longPress.current = null;
        swipeRef.current = null; setSwipe(null);
      },
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => { // 컴퓨터 오른쪽 단추·휴대폰 길게 누르기 메뉴 대신
        if (!onLongPress) return;
        e.preventDefault();
        if (longPress.current?.fired) return; // 꾹 누르기로 이미 열었음
        onLongPress(item, e.currentTarget);
      },
      style: { transform: dragging ? `translateX(${swipe!.dx}px)` : undefined, transition: dragging ? 'none' : 'transform 0.2s' } as React.CSSProperties,
    };
  };
  return { bind, swipe };
}
