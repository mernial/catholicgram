'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 두 손가락으로 사진·이모티콘을 벌리면 앱 화면 전체가 아니라 그 그림만 커진다 (인스타그램처럼, 손을 떼면 제자리로).
// 앱 화면 전체 확대는 막는다: viewport maximumScale 1 (app/layout.tsx) + html touch-action: pan-x pan-y (globals.css)
// + 아이폰 gesturestart 막기 (여기). 글씨가 작으면 설정 → 글씨 크기로 키운다.
// 직접 확대를 처리하는 화면(사진 크게 보기·사진 편집·자르기·영상 위 글자)은 data-no-pinch 로 빠진다.
type Peek = { src: string; left: number; top: number; width: number; height: number; fit: string; pos: string; radius: string; ox: number; oy: number };
type Pt = { x: number; y: number };

const MIN_SIZE = 40;   // 이보다 작은 그림(작은 아이콘)은 키우지 않음
const MAX_SCALE = 4;
const BACK_MS = 220;

const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const mid = (t: TouchList): Pt => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

// 두 손가락 가운데에 있는 그림: 누른 곳이 그림이 아니어도(그림 위 겹친 칸, 누르기를 받지 않는 그림) 가까운 위 칸들에서 찾음
function findImage(target: Element, p: Pt): HTMLImageElement | null {
  const under = (img: HTMLImageElement) => {
    const r = img.getBoundingClientRect();
    return r.width >= MIN_SIZE && r.height >= MIN_SIZE && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
      && getComputedStyle(img).visibility !== 'hidden' && !!(img.currentSrc || img.src);
  };
  const own = target.closest('img');
  if (own && under(own)) return own;
  let el: Element | null = target;
  for (let depth = 0; el && el !== document.body && depth < 4; depth++, el = el.parentElement) {
    const imgs = el.querySelectorAll('img');
    if (imgs.length > 30) break;
    for (const img of Array.from(imgs)) if (under(img)) return img;
  }
  return null;
}

export default function PinchPeek() {
  const [peek, setPeek] = useState<Peek | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let g: { el: HTMLImageElement; d0: number; m0: Pt; vis: string; rect: DOMRect } | null = null;
    let ending = false;
    const onStart = (e: TouchEvent) => {
      if (g || ending || e.touches.length !== 2) return;
      const target = e.target;
      if (!(target instanceof Element) || target.closest('[data-no-pinch]')) return;
      const m = mid(e.touches);
      const el = findImage(target, m);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      g = { el, d0: Math.max(1, dist(e.touches)), m0: m, vis: el.style.visibility, rect: r };
      // 꾹 누르기·밀기·두 번 누르기 같은 다른 손동작은 그만 (메뉴가 뜨지 않게)
      try { target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })); } catch { /* 무시 */ }
      setPeek({ src: el.currentSrc || el.src, left: r.left, top: r.top, width: r.width, height: r.height, fit: cs.objectFit, pos: cs.objectPosition, radius: cs.borderRadius, ox: m.x - r.left, oy: m.y - r.top });
      el.style.visibility = 'hidden';
    };
    const onMove = (e: TouchEvent) => {
      if (!g) return;
      if (e.cancelable) e.preventDefault(); // 키우는 동안 화면이 스크롤되지 않게
      if (e.touches.length < 2) return;
      const s = Math.min(MAX_SCALE, Math.max(1, dist(e.touches) / g.d0));
      const m = mid(e.touches);
      if (imgRef.current) imgRef.current.style.transform = `translate(${m.x - g.m0.x}px, ${m.y - g.m0.y}px) scale(${s})`;
      if (shadeRef.current) shadeRef.current.style.opacity = String(Math.min(1, (s - 1) * 1.2));
    };
    const onEnd = (e: TouchEvent) => {
      if (!g || e.touches.length >= 2) return;
      const { el, vis, rect } = g;
      g = null; ending = true;
      // 제자리로 (그사이 화면이 움직였으면 그림이 지금 있는 곳으로)
      const now = el.getBoundingClientRect();
      const img = imgRef.current;
      if (img) {
        img.style.transition = `transform ${BACK_MS}ms ease-out`;
        img.style.transform = `translate(${now.left - rect.left}px, ${now.top - rect.top}px)`;
      }
      if (shadeRef.current) { shadeRef.current.style.transition = `opacity ${BACK_MS}ms`; shadeRef.current.style.opacity = '0'; }
      setTimeout(() => { el.style.visibility = vis; setPeek(null); ending = false; }, BACK_MS + 10);
    };
    const block = (e: Event) => e.preventDefault(); // 아이폰: 화면 전체 확대
    const opts = { capture: true };
    document.addEventListener('touchstart', onStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onMove, { capture: true, passive: false });
    document.addEventListener('touchend', onEnd, opts);
    document.addEventListener('touchcancel', onEnd, opts);
    document.addEventListener('gesturestart', block);
    document.addEventListener('gesturechange', block);
    return () => {
      document.removeEventListener('touchstart', onStart, opts);
      document.removeEventListener('touchmove', onMove, opts);
      document.removeEventListener('touchend', onEnd, opts);
      document.removeEventListener('touchcancel', onEnd, opts);
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('gesturechange', block);
    };
  }, []);

  if (!peek) return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] pointer-events-none" aria-hidden="true">
      <div ref={shadeRef} className="absolute inset-0 bg-black/60" style={{ opacity: 0 }} />
      <img ref={imgRef} src={peek.src} alt="" draggable={false}
        style={{
          position: 'absolute', left: peek.left, top: peek.top, width: peek.width, height: peek.height, maxWidth: 'none',
          objectFit: peek.fit as React.CSSProperties['objectFit'], objectPosition: peek.pos, borderRadius: peek.radius,
          transformOrigin: `${peek.ox}px ${peek.oy}px`, willChange: 'transform',
        }} />
    </div>,
    document.body,
  );
}
