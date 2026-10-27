'use client';

import { useRef, useState } from 'react';

// 목록 한 줄을 왼쪽으로 밀면 오른쪽에 빨간 단추(나가기)가 나온다 (메시지 목록).
// 반 넘게 밀고 놓으면 열린 채로 멈추고, 덜 밀면 제자리로. 한 번에 한 줄만 열리고,
// 어느 줄이 열려 있을 때 줄을 누르면 들어가지 않고 닫기만 한다. 위아래 스크롤은 그대로 (touch-action: pan-y)
const ACTION_W = 88;

export default function SwipeRow({ open, anyOpen, onOpen, onClose, onAction, actionLabel = '나가기', children }: {
  open: boolean;      // 이 줄이 열려 있음
  anyOpen: boolean;   // 어느 줄이든 열려 있음
  onOpen: () => void;
  onClose: () => void;
  onAction: () => void;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState<number | null>(null); // 미는 동안만
  const drag = useRef<{ x: number; y: number; base: number; cur: number; active: boolean } | null>(null);
  const draggedAt = useRef(0); // 밀고 손을 뗀 때 (이어서 오는 '누름'은 버린다)
  const offset = dragX ?? (open ? -ACTION_W : 0);
  const transition = dragX === null ? '0.22s ease' : 'none';

  return (
    <div className="relative overflow-hidden">
      <button type="button" data-swipe-action onClick={() => { onClose(); onAction(); }} tabIndex={open ? 0 : -1} aria-hidden={!open}
        className="absolute inset-y-0 right-0 overflow-hidden bg-red-500 text-white font-bold text-[0.9375rem] whitespace-nowrap flex items-center justify-center"
        style={{ width: -offset, transition: `width ${transition}` }}>
        {actionLabel}
      </button>
      <div className="relative bg-white" style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: `transform ${transition}`, touchAction: 'pan-y' }}
        onPointerDown={e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          const base = open ? -ACTION_W : 0;
          drag.current = { x: e.clientX, y: e.clientY, base, cur: base, active: false };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const mx = e.clientX - d.x, my = e.clientY - d.y;
          if (!d.active) {
            if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
              d.active = true;
              if (!open) onClose(); // 다른 줄이 열려 있으면 닫는다
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
            } else {
              if (Math.abs(my) > 10) drag.current = null; // 위아래 스크롤
              return;
            }
          }
          const x = d.base + mx;
          // 단추 너비를 넘으면 뻑뻑하게, 오른쪽으로는 제자리까지만
          d.cur = Math.min(0, x < -ACTION_W ? -ACTION_W + (x + ACTION_W) * 0.35 : x);
          setDragX(d.cur);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d?.active) return;
          draggedAt.current = Date.now();
          setDragX(null);
          if (d.cur < -ACTION_W / 2) onOpen(); else onClose();
        }}
        onPointerCancel={() => { drag.current = null; setDragX(null); }}
        onClickCapture={e => {
          const afterDrag = Date.now() - draggedAt.current < 400; // 손을 떼며 오는 '누름'으로 대화방에 들어가지 않게
          if (afterDrag || anyOpen) { e.stopPropagation(); e.preventDefault(); }
          if (!afterDrag && anyOpen) onClose();
        }}>
        {children}
      </div>
    </div>
  );
}
