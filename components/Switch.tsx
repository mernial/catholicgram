'use client';

import { useRef, useState } from 'react';

const TRAVEL = 24; // 동그라미가 움직이는 거리(px) — 칸 w-14(56) - 동그라미 w-7(28) - 양옆 2px×2

// 켜기·끄기 밀기 단추 (휴대폰 설정 화면처럼): 누르면 바뀌고, 동그라미를 옆으로 밀어도 바뀐다
export default function Switch({ on, onChange, disabled, busy, label }: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;   // 바꾸는 중 (휴대폰이 알림 허용을 묻는 동안 등) — 누를 수 없고 동그라미가 흐려짐
  label: string;    // 화면 읽기용 이름 (예: '휴대폰 알림')
}) {
  const start = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const skipClickUntil = useRef(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const off = disabled || busy;
  const base = on ? TRAVEL : 0;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (off || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, base, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (!s.moved && Math.abs(d) > 4) { s.moved = true; setDragging(true); }
    if (s.moved) setDx(Math.min(TRAVEL, Math.max(0, s.base + d)) - s.base);
  };
  const end = (apply: boolean) => {
    const s = start.current;
    start.current = null;
    if (s?.moved) {
      skipClickUntil.current = Date.now() + 500; // 민 뒤 따라오는 누름은 버림
      const next = s.base + dx > TRAVEL / 2;
      if (apply && next !== on) onChange(next);
    }
    setDx(0); setDragging(false);
  };

  return (
    <button
      type="button"
      role="switch"
      data-no-sheet-drag
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => { if (off || Date.now() < skipClickUntil.current) return; onChange(!on); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      className={`relative w-14 h-8 shrink-0 rounded-full touch-none select-none transition-colors duration-200 ${on ? 'bg-emerald-500' : 'bg-stone-300'} ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-7 h-7 rounded-full bg-[#fff] shadow-md flex items-center justify-center ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: `translateX(${base + dx}px)` }}
      >
        {busy && <span className="w-3.5 h-3.5 rounded-full border-2 border-stone-300 border-t-stone-600 animate-spin" />}
      </span>
    </button>
  );
}
