'use client';
// 조용히 보내기 (운영자 요청, 카카오톡처럼): 보내기 단추를 꾹 누르면(컴퓨터는 오른쪽 단추) 단추 위에 '🔕 조용히 보내기'.
// 누르면 메시지는 그대로 가지만 받는 교우의 휴대폰 알림·앱 화면 배너·소리가 울리지 않는다 (안 읽은 숫자는 그대로).
// 1:1·단체방 공통. 보내기 단추를 <div className="relative"> 로 감싸고 {...quiet.buttonProps} 를 단추에, {quiet.menu} 를 그 옆에
import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 450;

export function useQuietSend(onQuiet: () => void) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false); // 꾹 눌러 메뉴를 열었으면 손을 뗄 때 따라오는 누름(보내기)은 버림
  const start = useRef({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);

  // 메뉴 밖을 누르거나 Esc → 닫기
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const t = setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc); };
  }, [open]);

  const openMenu = () => { clear(); fired.current = true; setOpen(true); navigator.vibrate?.(15); };
  const buttonProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault(); // 입력칸 초점(자판)을 그대로
      fired.current = false;
      if (e.currentTarget.disabled) return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(openMenu, HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (timer.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 12) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => { e.preventDefault(); if (!e.currentTarget.disabled) openMenu(); },
    onClickCapture: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!fired.current) return;
      e.preventDefault(); e.stopPropagation(); fired.current = false;
    },
  };

  const menu = open ? (
    <div ref={menuRef} role="menu" className="absolute bottom-full right-0 mb-2 z-30 w-max animate-fade-in">
      <button type="button" role="menuitem" autoFocus={false}
        onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}
        onClick={() => { setOpen(false); onQuiet(); }}
        className="flex items-center gap-2.5 rounded-2xl bg-white shadow-xl ring-1 ring-stone-200 px-4 py-3 text-left active:bg-stone-100">
        <span className="text-[1.375rem] leading-none" aria-hidden>🔕</span>
        <span>
          <span className="block font-bold text-[1rem] text-stone-900">조용히 보내기</span>
          <span className="block text-[0.8125rem] text-stone-500">상대 휴대폰에 알림이 울리지 않아요</span>
        </span>
      </button>
    </div>
  ) : null;

  return { buttonProps, menu, open, close: () => setOpen(false) };
}

// 보낸 사람 화면: 조용히 보낸 메시지 시간 옆 작은 표시
export const QUIET_MARK = '🔕';
