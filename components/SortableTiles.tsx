'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// 아이콘 칸을 꾹 눌러(0.45초) 끌어서 자리 바꾸기 — 휴대폰 첫 화면처럼. 순서는 이 기기에 기억 (운영자 2026-11-18: 관리자 내 공간 기능키 순서)
// 꾹 누르는 동안 조금이라도 밀면 화면 넘김으로 보고 취소, 끌어서 옮긴 뒤 손을 떼면 그 누름은 열지 않음
export type SortableTile = { key: string; onClick: () => void; body: React.ReactNode; aria?: string };

const HOLD_MS = 450;
const readOrder = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const saveOrder = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

export default function SortableTiles({ tiles, storageKey, className, tileClassName }: {
  tiles: SortableTile[];
  storageKey: string;
  className: string;
  tileClassName: string;
}) {
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(readOrder(storageKey)); }, [storageKey]);
  // 기억한 순서 → 그 뒤에 새로 생긴 칸 (없어진 칸은 뺌)
  const sorted = useMemo(() => {
    const byKey = new Map(tiles.map(t => [t.key, t]));
    const out = order.filter(k => byKey.has(k)).map(k => byKey.get(k)!);
    tiles.forEach(t => { if (!order.includes(t.key)) out.push(t); });
    return out;
  }, [tiles, order]);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const press = useRef<{ key: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; moved: boolean } | null>(null);
  const dragging = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const liveOrder = useRef<string[]>([]);
  liveOrder.current = sorted.map(t => t.key);

  // 끄는 동안 화면이 같이 밀리지 않게 (touchmove 는 passive:false 로만 막을 수 있음)
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (dragging.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const end = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    if (dragging.current) {
      saveOrder(storageKey, liveOrder.current);
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 350);
    }
    dragging.current = null;
    setDragKey(null);
  };

  const onPointerDown = (key: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = { key, x: e.clientX, y: e.clientY, timer: null as ReturnType<typeof setTimeout> | null, moved: false };
    p.timer = setTimeout(() => {
      if (press.current !== p || p.moved) return;
      dragging.current = key;
      setDragKey(key);
      try { navigator.vibrate?.(15); } catch { /* 무시 */ }
    }, HOLD_MS);
    press.current = p;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!dragging.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { p.moved = true; if (p.timer) clearTimeout(p.timer); press.current = null; }
      return;
    }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('[data-tile-key]') as HTMLElement | null;
    const target = over?.dataset.tileKey;
    const from = dragging.current;
    if (!target || target === from) return;
    const next = liveOrder.current.filter(k => k !== from);
    const at = next.indexOf(target);
    const fromIdx = liveOrder.current.indexOf(from), toIdx = liveOrder.current.indexOf(target);
    next.splice(fromIdx < toIdx ? at + 1 : at, 0, from);
    setOrder(next);
  };

  return (
    <div ref={gridRef} className={className} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}>
      {sorted.map(t => (
        <button key={t.key} type="button" data-tile-key={t.key} aria-label={t.aria}
          onPointerDown={onPointerDown(t.key)}
          onContextMenu={e => e.preventDefault()}
          onClick={() => { if (suppressClick.current || dragging.current) return; t.onClick(); }}
          className={`${tileClassName} select-none [-webkit-touch-callout:none] transition-transform ${dragKey === t.key ? 'scale-110 bg-stone-100 shadow-lg ring-2 ring-amber-300 z-10 relative' : dragKey ? 'opacity-80' : ''}`}>
          {t.body}
        </button>
      ))}
    </div>
  );
}
