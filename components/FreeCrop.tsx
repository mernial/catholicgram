'use client';

// 사진 자르기 (루비로사 건의 2026-11-01: '자르기는 보통 상하좌우를 제가 직접 사이즈를 맞춰서 자르게 되더라구요'):
// 사진 전체가 보이고 그 위의 자르기 네모를 네 가장자리·네 모서리를 끌어 크기를 맞추고, 가운데를 끌어 옮긴다.
// aspect 가 정해지면(정사각형 등) 모서리만 — 비율을 지키며 크기만 바뀜. 값(value)은 원본 사진의 픽셀 좌표
import { useEffect, useRef, useState } from 'react';

export type CropArea = { x: number; y: number; width: number; height: number };
type Mode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const PAD = 22; // 사진 둘레 여백 (손잡이가 화면 끝에 붙지 않게)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 비율 a 의 가장 큰 네모를 (cx, cy) 가운데에 — 사진 밖으로 나가지 않게
export function fitAspect(nw: number, nh: number, a: number, cx = nw / 2, cy = nh / 2): CropArea {
  const w = Math.min(nw, nh * a), h = w / a;
  return { x: clamp(cx - w / 2, 0, nw - w), y: clamp(cy - h / 2, 0, nh - h), width: w, height: h };
}

export default function FreeCrop({ src, natural, aspect, value, onChange }: {
  src: string;
  natural: { w: number; h: number };
  aspect: number | null;          // null = 자유
  value: CropArea | null;         // null = 사진 전체
  onChange: (a: CropArea) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w: nw, h: nh } = natural;
  const rect = value ?? { x: 0, y: 0, width: nw, height: nh };
  const s = size ? Math.max(0.0001, Math.min((size.w - PAD * 2) / nw, (size.h - PAD * 2) / nh)) : 0;
  const imgL = size ? (size.w - nw * s) / 2 : 0;
  const imgT = size ? (size.h - nh * s) / 2 : 0;
  const minSide = Math.max(24, Math.min(nw, nh) * 0.06);

  const drag = useRef<{ mode: Mode; px: number; py: number; r: CropArea; id: number } | null>(null);
  const [active, setActive] = useState<Mode | null>(null);
  // 손잡이마다 data-mode (없으면 네모 안 = 옮기기) — 한 곳에서 받음
  const onBoxDown = (e: React.PointerEvent) => {
    const mode = ((e.target as HTMLElement).closest('[data-mode]') as HTMLElement | null)?.dataset.mode as Mode | undefined ?? 'move';
    e.stopPropagation();
    e.preventDefault();
    if (drag.current) return; // 두 번째 손가락은 무시
    drag.current = { mode, px: e.clientX, py: e.clientY, r: rect, id: e.pointerId };
    boxRef.current?.setPointerCapture(e.pointerId);
    setActive(mode);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !s) return;
    const dx = (e.clientX - d.px) / s, dy = (e.clientY - d.py) / s;
    const { x, y, width: w, height: h } = d.r;
    let L = x, T = y, R = x + w, B = y + h;
    if (d.mode === 'move') {
      const nx = clamp(x + dx, 0, nw - w), ny = clamp(y + dy, 0, nh - h);
      onChange({ x: nx, y: ny, width: w, height: h });
      return;
    }
    const E = d.mode.includes('e'), W = d.mode.includes('w'), N = d.mode.includes('n'), S = d.mode.includes('s');
    if (aspect && d.mode.length === 2) {
      // 비율을 지키며 모서리 끌기: 맞은편 모서리는 그대로
      const a = aspect;
      const wFromX = w + (E ? dx : -dx);
      const wFromY = (h + (S ? dy : -dy)) * a;
      const maxW = Math.min(E ? nw - L : R, (S ? nh - T : B) * a);
      const minW = Math.max(minSide, minSide * a);
      const want = Math.abs(wFromX - w) >= Math.abs(wFromY - w) ? wFromX : wFromY; // 더 많이 움직인 쪽을 따라감
      const nw2 = clamp(want, Math.min(minW, maxW), maxW);
      const nh2 = nw2 / a;
      onChange({ x: E ? L : R - nw2, y: S ? T : B - nh2, width: nw2, height: nh2 });
      return;
    }
    if (W) L = clamp(L + dx, 0, R - minSide);
    if (E) R = clamp(R + dx, L + minSide, nw);
    if (N) T = clamp(T + dy, 0, B - minSide);
    if (S) B = clamp(B + dy, T + minSide, nh);
    onChange({ x: L, y: T, width: R - L, height: B - T });
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current && e.pointerId === drag.current.id) { drag.current = null; setActive(null); }
  };

  // 화면 위치 (px)
  const bx = imgL + rect.x * s, by = imgT + rect.y * s, bw = rect.width * s, bh = rect.height * s;
  const corner = (m: 'nw' | 'ne' | 'sw' | 'se') => {
    const top = m[0] === 'n', left = m[1] === 'w';
    return (
      <span key={m} data-mode={m} role="presentation"
        className="absolute w-11 h-11 -m-[22px] flex items-center justify-center"
        style={{ left: left ? 0 : '100%', top: top ? 0 : '100%', cursor: `${m}-resize` }}>
        {/* L 모양 굵은 모서리 */}
        <span className="absolute w-6 h-6 border-white" style={{
          left: left ? 19 : undefined, right: left ? undefined : 19, top: top ? 19 : undefined, bottom: top ? undefined : 19,
          borderTopWidth: top ? 4 : 0, borderBottomWidth: top ? 0 : 4, borderLeftWidth: left ? 4 : 0, borderRightWidth: left ? 0 : 4,
        }} />
      </span>
    );
  };
  const edge = (m: 'n' | 's' | 'e' | 'w') => {
    const horiz = m === 'n' || m === 's';
    return (
      <span key={m} data-mode={m} role="presentation"
        className="absolute flex items-center justify-center"
        style={horiz
          ? { left: 22, right: 22, height: 44, top: m === 'n' ? -22 : undefined, bottom: m === 's' ? -22 : undefined, cursor: 'ns-resize' }
          : { top: 22, bottom: 22, width: 44, left: m === 'w' ? -22 : undefined, right: m === 'e' ? -22 : undefined, cursor: 'ew-resize' }}>
        <span className={`rounded-full bg-white shadow ${horiz ? 'w-8 h-[5px]' : 'w-[5px] h-8'}`} />
      </span>
    );
  };

  return (
    <div ref={boxRef} className="relative w-full h-full overflow-hidden touch-none select-none"
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {size && s > 0 && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="absolute pointer-events-none max-w-none"
            style={{ left: imgL, top: imgT, width: nw * s, height: nh * s }} />
          <div onPointerDown={onBoxDown} className="absolute border-2 border-white cursor-move"
            style={{ left: bx, top: by, width: bw, height: bh, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }}
            aria-label="자를 부분 (끌어서 옮기기)" role="group">
            {/* 3×3 안내선 (끄는 동안 또렷하게) */}
            <span aria-hidden="true" className={`pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 ${active ? 'opacity-100' : 'opacity-40'}`}>
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border-[0.5px] border-white/70" />)}
            </span>
            {!aspect && (['n', 's', 'e', 'w'] as const).map(edge)}
            {(['nw', 'ne', 'sw', 'se'] as const).map(corner)}
          </div>
          {active && active !== 'move' && (
            <span className="absolute left-1/2 top-2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/70 text-white text-[0.75rem] font-bold pointer-events-none">
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
