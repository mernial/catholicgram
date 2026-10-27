'use client';

import { useEffect, useRef, useState } from 'react';

// 게시글 수정의 사진 줄: 누르면 그 사진을 고르고(아래 자르기·가리기·삭제가 그 사진에), 길게 눌러 옆으로 끌면 순서를 바꾼다.
// 끄는 동안에는 줄이 옆으로 스크롤되지 않게 막는다.
export default function PhotoStrip({ photos, selected, onSelect, onMove }: {
  photos: { url: string }[];
  selected: number;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  dragRef.current = dragIdx;
  const press = useRef<{ i: number; x: number; y: number; timer: ReturnType<typeof setTimeout>; active: boolean } | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const stop = (e: TouchEvent) => { if (dragRef.current !== null) e.preventDefault(); };
    row.addEventListener('touchmove', stop, { passive: false });
    return () => row.removeEventListener('touchmove', stop);
  }, []);

  // 손가락(마우스) 가로 위치에 있는 사진 칸
  const indexAt = (x: number) => {
    const cells = Array.from(rowRef.current?.querySelectorAll<HTMLElement>('[data-photo]') || []);
    const i = cells.findIndex(c => x < c.getBoundingClientRect().right);
    return i < 0 ? cells.length - 1 : i;
  };
  const end = () => {
    const p = press.current;
    press.current = null;
    if (p) clearTimeout(p.timer);
    setDragIdx(null);
    return p;
  };

  return (
    <div ref={rowRef} className="flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x' }}>
      {photos.map((ph, i) => (
        <button key={ph.url} type="button" data-photo aria-pressed={selected === i} aria-label={`${i + 1}번째 사진${selected === i ? ' (고름)' : ''}`}
          onPointerDown={e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const p = { i, x: e.clientX, y: e.clientY, active: false, timer: setTimeout(() => {
              p.active = true;
              setDragIdx(i);
              onSelect(i);
              try { navigator.vibrate?.(15); } catch { /* 무시 */ }
            }, 400) };
            press.current = p;
          }}
          onPointerMove={e => {
            const p = press.current;
            if (!p) return;
            if (!p.active) {
              if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { clearTimeout(p.timer); press.current = null; } // 줄 스크롤
              return;
            }
            const from = dragRef.current, to = indexAt(e.clientX);
            if (from !== null && to !== from) { onMove(from, to); setDragIdx(to); }
          }}
          onPointerUp={() => { const p = end(); if (p && !p.active) onSelect(p.i); }}
          onPointerCancel={() => { end(); }}
          onContextMenu={e => e.preventDefault()}
          className={`relative shrink-0 w-[5.75rem] h-[7.25rem] rounded-xl overflow-hidden bg-stone-100 select-none [-webkit-touch-callout:none] transition-transform ${selected === i ? 'ring-[3px] ring-amber-500' : 'ring-1 ring-stone-200'} ${dragIdx === i ? 'scale-105 shadow-xl z-10' : ''}`}>
          <img src={ph.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
          <span className="absolute left-1 top-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-black/55 text-white text-[0.6875rem] font-bold flex items-center justify-center">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
