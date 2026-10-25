'use client';

import { useEffect, useRef, useState } from 'react';

// 사진만 화면 가득 크게 보기
//  - 한 번 누르면 닫힘 (확대해 둔 상태면 먼저 원래 크기로)
//  - 두 손가락으로 벌려 확대 → 한 손가락으로 끌어 사진 안을 이동, 두 번 누르면 확대 / 원래대로
//  - 여러 장이면 옆으로 밀거나 ‹ › 로 넘김
//  - 컴퓨터: 마우스 휠로 확대, 끌어서 이동, Esc 닫기, ← → 넘기기
// 브라우저의 화면 전체 확대를 쓰지 않고 사진만 직접 키운다 (화면이 커진 채 남거나 한 손가락 이동이 막히지 않게)
type Pt = { x: number; y: number };
type View = { s: number; x: number; y: number }; // 배율, 가운데에서 옮긴 거리
const ONE: View = { s: 1, x: 0, y: 0 };
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

export default function PhotoZoom({ images, start = 0, onClose }: { images: string[]; start?: number; onClose: () => void }) {
  const last = images.length - 1;
  const [index, setIndex] = useState(Math.min(Math.max(0, start), last));
  const [view, setView] = useState<View>(ONE);
  const [dragX, setDragX] = useState(0); // 사진 넘기는 중 손가락을 따라 움직인 만큼
  const [animate, setAnimate] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const viewRef = useRef<View>(ONE);
  const gesture = useRef({
    pts: new Map<number, Pt>(),
    mode: 'none' as 'none' | 'pan' | 'pinch' | 'swipe',
    start: ONE, down: { x: 0, y: 0 } as Pt, downAt: 0, moved: false, multi: false,
    dist: 1, anchor: { x: 0, y: 0 } as Pt, dx: 0,
  });
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frame = () => {
    const r = stage.current?.getBoundingClientRect();
    return r ? { W: r.width, H: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { W: 1, H: 1, cx: 0, cy: 0 };
  };
  // 사진이 화면 밖으로 빠져나가지 않는 범위로 (화면보다 작은 쪽은 가운데에 고정)
  const clamp = (v: View): View => {
    const s = Math.min(MAX_SCALE, Math.max(1, v.s));
    const { W, H } = frame();
    const img = stage.current?.querySelectorAll('img')[indexRef.current];
    const w = img?.offsetWidth || W, h = img?.offsetHeight || H; // 확대 전 화면에 보이는 크기
    const mx = Math.max(0, (s * w - W) / 2), my = Math.max(0, (s * h - H) / 2);
    return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const apply = (v: View, smooth = false) => { viewRef.current = v; setAnimate(smooth); setView(v); };
  // 화면의 한 점(p)을 손가락 아래 그대로 둔 채 배율 s 로
  const zoomAt = (p: Pt, s: number) => {
    const { cx, cy } = frame();
    const v = viewRef.current;
    const qx = (p.x - cx - v.x) / v.s, qy = (p.y - cy - v.y) / v.s;
    return clamp({ s, x: p.x - cx - s * qx, y: p.y - cy - s * qy });
  };
  const go = (i: number) => {
    const next = Math.min(last, Math.max(0, i));
    indexRef.current = next;
    setIndex(next);
    setDragX(0);
    apply(ONE, true); // 다른 사진은 원래 크기부터
  };

  const onTap = (p: Pt) => {
    const prev = lastTap.current;
    if (prev && Date.now() - prev.t < 300 && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 40) {
      // 두 번 누름: 누른 곳을 확대 ↔ 원래대로
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = null;
      apply(viewRef.current.s > 1 ? ONE : zoomAt(p, DOUBLE_TAP_SCALE), true);
      return;
    }
    lastTap.current = { t: Date.now(), p };
    tapTimer.current = setTimeout(() => {
      lastTap.current = null;
      if (viewRef.current.s > 1) apply(ONE, true);
      else onClose();
    }, 300);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const g = gesture.current;
    try { stage.current?.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 손가락 */ }
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    if (g.pts.size === 1) {
      g.down = { x: e.clientX, y: e.clientY }; g.downAt = Date.now(); g.moved = false; g.multi = false; g.dx = 0;
      g.start = viewRef.current;
      g.mode = viewRef.current.s > 1 ? 'pan' : 'swipe';
    } else if (g.pts.size === 2) {
      // 두 손가락: 두 손가락 가운데 점을 붙잡고 벌린 만큼 확대
      const [a, b] = Array.from(g.pts.values());
      const { cx, cy } = frame();
      const v = viewRef.current;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.multi = true; g.mode = 'pinch'; g.start = v;
      g.dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      g.anchor = { x: (mid.x - cx - v.x) / v.s, y: (mid.y - cy - v.y) / v.s };
      setDragX(0);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === 'pinch' && g.pts.size >= 2) {
      const [a, b] = Array.from(g.pts.values());
      const { cx, cy } = frame();
      const s = Math.min(MAX_SCALE, Math.max(1, g.start.s * Math.hypot(a.x - b.x, a.y - b.y) / g.dist));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      apply(clamp({ s, x: mid.x - cx - s * g.anchor.x, y: mid.y - cy - s * g.anchor.y }));
      return;
    }
    const dx = e.clientX - g.down.x, dy = e.clientY - g.down.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
    if (g.mode === 'pan') apply(clamp({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy }));
    else if (g.mode === 'swipe' && last > 0) {
      const edge = (indexRef.current === 0 && dx > 0) || (indexRef.current === last && dx < 0);
      g.dx = edge ? dx / 3 : dx; // 처음·마지막 사진에서는 덜 끌림
      setDragX(g.dx);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.delete(e.pointerId);
    if (g.mode === 'pinch') {
      if (g.pts.size === 1) {
        // 한 손가락만 남으면 이어서 끌어 이동
        const [p] = Array.from(g.pts.values());
        g.down = p; g.start = viewRef.current;
        g.mode = viewRef.current.s > 1 ? 'pan' : 'none';
      } else if (g.pts.size === 0) {
        g.mode = 'none';
        if (viewRef.current.s < 1.05) apply(ONE, true);
      }
      return;
    }
    if (g.pts.size > 0) return;
    if (g.mode === 'swipe' && g.moved && last > 0) {
      const { W } = frame();
      if (g.dx < -W * 0.18 && indexRef.current < last) go(indexRef.current + 1);
      else if (g.dx > W * 0.18 && indexRef.current > 0) go(indexRef.current - 1);
      else { setAnimate(true); setDragX(0); }
    }
    if (e.type !== 'pointercancel' && !g.moved && !g.multi && Date.now() - g.downAt < 500) onTap({ x: e.clientX, y: e.clientY });
    g.mode = 'none';
  };

  // 컴퓨터: 마우스 휠로 확대·축소 (마우스가 가리키는 곳을 중심으로), Esc 닫기, ← → 넘기기
  useEffect(() => {
    const el = stage.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = viewRef.current.s * Math.exp(-e.deltaY * 0.0015);
      apply(s <= 1.01 ? ONE : zoomAt({ x: e.clientX, y: e.clientY }, s));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(indexRef.current + 1);
      else if (e.key === 'ArrowLeft') go(indexRef.current - 1);
    };
    // 아이폰·아이패드: 두 손가락이면 화면 전체를 확대하려 해서 그것도 막는다
    const block = (e: Event) => e.preventDefault();
    el?.addEventListener('wheel', onWheel, { passive: false });
    el?.addEventListener('touchmove', block, { passive: false });
    el?.addEventListener('gesturestart', block);
    el?.addEventListener('gesturechange', block);
    window.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('wheel', onWheel);
      el?.removeEventListener('touchmove', block);
      el?.removeEventListener('gesturestart', block);
      el?.removeEventListener('gesturechange', block);
      window.removeEventListener('keydown', onKey);
    };
  });
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  const many = images.length > 1;
  const ease = animate ? 'transform 0.25s ease-out' : 'none';
  return (
    <div className="fixed inset-0 z-[96] bg-black animate-fade-in select-none overflow-hidden" role="dialog" aria-label="사진 크게 보기">
      <div
        ref={stage}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: 'none' }} // 손가락 움직임은 모두 여기서 직접 처리 (화면 전체가 확대·이동되지 않게)
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="h-full flex" style={{ transform: `translateX(calc(${-index * 100}% + ${dragX}px))`, transition: ease }}>
          {images.map((src, i) => (
            <div key={i} className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden">
              <img
                src={src}
                alt={many ? `사진 ${i + 1}/${images.length}` : '사진'}
                className="max-w-full max-h-full object-contain"
                draggable={false}
                style={i === index ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: ease } : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      {many && (
        <>
          <span className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 text-sm font-bold text-white bg-black/55 rounded-full px-3 py-1 pointer-events-none">{index + 1} / {images.length}</span>
          {index > 0 && (
            <button onClick={() => go(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white text-3xl leading-none flex items-center justify-center" aria-label="이전 사진">‹</button>
          )}
          {index < last && (
            <button onClick={() => go(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white text-3xl leading-none flex items-center justify-center" aria-label="다음 사진">›</button>
          )}
        </>
      )}
      <button onClick={onClose} className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 w-11 h-11 rounded-full bg-black/55 text-white text-3xl leading-none flex items-center justify-center" aria-label="닫기">×</button>
      <p className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center pointer-events-none">
        <span className="text-xs text-white/80 bg-black/45 rounded-full px-3 py-1">
          {view.s > 1 ? '한 손가락으로 끌어서 옮겨 보세요 · 한 번 누르면 원래 크기' : '누르면 닫혀요 · 두 손가락으로 벌리면 커져요'}
        </span>
      </p>
    </div>
  );
}
