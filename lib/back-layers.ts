'use client';

// 창 안의 작은 창(건의함·사연함의 사진 크게 보기, 단체방·사랑방의 메뉴·책갈피·캡처, 확인 창 등)을
// 휴대폰 뒤로가기로 하나씩 닫는다 — 맨 위 것만 닫고 그 아래 창은 그대로 (운영자 요청 2026-11-01:
// 건의함에서 사진을 보다 뒤로가기를 누르면 건의함까지 닫혔음 — '다른 비슷한 상황도 같은 규칙으로').
//  - 작은 창이 열릴 때 뒤로가기 기록 한 칸을 쌓고(page 의 host.push — 휴대폰 뒤로가기 바로 뒤처럼 쌓으면 안 될 때는 쌓지 않음),
//  - 뒤로가기가 오면 page 가 popBackLayer() 로 맨 위 작은 창을 닫고,
//  - 작은 창의 × 등으로 닫히면 쌓아 둔 칸을 걷는다(host.release).
import { useEffect, useRef } from 'react';

type Layer = { close: () => void; pushed: boolean };
const stack: Layer[] = [];
type Host = { push: () => boolean; release: () => void };
let host: Host | null = null;

export function setBackLayerHost(h: Host | null) { host = h; }
export function hasBackLayer() { return stack.length > 0; }
// 뒤로가기: 맨 위 작은 창을 닫는다. 그 창을 위해 쌓은 칸이 있었는지(= 방금 빠진 칸이 그 칸인지)를 돌려준다
export function popBackLayer(): { closed: boolean; hadEntry: boolean } {
  const top = stack.pop();
  if (!top) return { closed: false, hadEntry: false };
  top.close();
  return { closed: true, hadEntry: top.pushed };
}

export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { close: () => closeRef.current(), pushed: false };
    layer.pushed = !!host?.push();
    stack.push(layer);
    return () => {
      const i = stack.indexOf(layer);
      if (i < 0) return; // 뒤로가기로 닫힘 (popBackLayer 가 이미 뺌)
      stack.splice(i, 1);
      if (layer.pushed) host?.release(); // 단추로 닫힘 → 쌓아 둔 칸을 걷음
    };
  }, [open]);
}
