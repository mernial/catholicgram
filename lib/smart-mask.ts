'use client';

// 사진 편집 '그려서 모자이크'(components/PhotoEditor): 손가락으로 그린 곳을 가릴 곳(마스크)으로 바꾼다.
//  - 둘레를 빙 둘러 그리면(시작과 끝이 가까움) 그 안쪽, 그냥 칠하면 칠한 붓 자국이 '대강 그린 곳'
//  - 자동 맞춤(운영자: '그리면 근처 사진을 인식해서 해당 부분만'): 그린 곳 바깥 둘레의 색으로 안쪽을 메워 '물체가 없었다면 보였을 배경'을
//    짐작하고(밀고 당기기 pushPull — 하늘·벽처럼 위아래로 색이 바뀌는 배경도 그 자리 배경과 견줌), 그 배경과 색이 꽤 다른 곳 중
//    그린 곳과 이어진 덩어리만 남긴다(얼굴·머리·물건만). 칠했으면 그 근처 물체 끝까지 넓히고, 둘레를 그렸으면 선 가까이까지만.
//    너무 작게 잡히면 그린 그대로
// 계산은 긴 쪽 512px 로 줄인 사진에서 하고, 결과는 사진 크기에 대한 비율(0~1)로 돌려준다 → 어느 크기로 그려도 같음
export interface MaskRegion { mask: HTMLCanvasElement; x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number } // 사진 너비·높이 대비 0~1

const WORK = 512;

const toLab = (r: number, g: number, b: number): [number, number, number] => {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = h(X), fy = h(Y), fz = h(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

// 밀고 당기기(push-pull)로 빈 곳 메우기: 값이 있는 곳(Wt=1)의 색을 반씩 줄여 가며 모았다가 다시 늘려 빈 곳을 부드럽게 채움
function pushPull(L: Float32Array, A: Float32Array, B: Float32Array, Wt: Float32Array, w: number, h: number): [Float32Array, Float32Array, Float32Array] {
  type Lv = { w: number; h: number; c: [Float32Array, Float32Array, Float32Array]; wt: Float32Array };
  const levels: Lv[] = [{ w, h, c: [L.map((v, i) => v * Wt[i]), A.map((v, i) => v * Wt[i]), B.map((v, i) => v * Wt[i])], wt: Wt.slice() }];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const p = levels[levels.length - 1];
    const nw = Math.max(1, Math.ceil(p.w / 2)), nh = Math.max(1, Math.ceil(p.h / 2));
    const c: [Float32Array, Float32Array, Float32Array] = [new Float32Array(nw * nh), new Float32Array(nw * nh), new Float32Array(nw * nh)];
    const wt = new Float32Array(nw * nh);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x, j = (y >> 1) * nw + (x >> 1);
      wt[j] += p.wt[i]; c[0][j] += p.c[0][i]; c[1][j] += p.c[1][i]; c[2][j] += p.c[2][i];
    }
    levels.push({ w: nw, h: nh, c, wt });
  }
  // 위(거친 층)에서부터 내려오며, 값이 모자란 곳은 거친 층 값으로 채움
  let up: [Float32Array, Float32Array, Float32Array] | null = null, upW = 1;
  for (let k = levels.length - 1; k >= 0; k--) {
    const lv = levels[k];
    const out: [Float32Array, Float32Array, Float32Array] = [new Float32Array(lv.w * lv.h), new Float32Array(lv.w * lv.h), new Float32Array(lv.w * lv.h)];
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
      const i = y * lv.w + x, wt = lv.wt[i];
      const own = (ch: number) => (wt > 0 ? lv.c[ch][i] / wt : 0);
      const par = (ch: number) => (up ? up[ch][(y >> 1) * upW + (x >> 1)] : own(ch));
      const a = Math.min(1, wt);
      for (let ch = 0; ch < 3; ch++) out[ch][i] = wt > 0 ? a * own(ch) + (1 - a) * par(ch) : par(ch);
    }
    up = out; upW = lv.w;
  }
  return up!;
}

// 3-4 거리 변환: mask 안(값 1)까지의 거리(밖의 점) — 대략 px 단위
function distanceTo(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); }
    d[i] = v;
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}
const grow = (m: Uint8Array, w: number, h: number, r: number) => { const d = distanceTo(m, w, h); const o = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) o[i] = d[i] <= r ? 1 : 0; return o; };
const shrink = (m: Uint8Array, w: number, h: number, r: number) => { const inv = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = m[i] ? 0 : 1; const g = grow(inv, w, h, r); for (let i = 0; i < w * h; i++) inv[i] = g[i] ? 0 : 1; return inv; };

// 씨앗과 이어진 덩어리만 + 안의 구멍 메우기
function keepConnected(m: Uint8Array, seed: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h), stack: number[] = [];
  for (let i = 0; i < w * h; i++) if (m[i] && seed[i]) { out[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) if (j >= 0 && m[j] && !out[j]) { out[j] = 1; stack.push(j); }
  }
  // 구멍 메우기: 바깥 테두리에서 닿을 수 없는 빈 곳은 채움
  const outside = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { for (const y of [0, h - 1]) { const i = y * w + x; if (!out[i] && !outside[i]) { outside[i] = 1; stack.push(i); } } }
  for (let y = 0; y < h; y++) { for (const x of [0, w - 1]) { const i = y * w + x; if (!out[i] && !outside[i]) { outside[i] = 1; stack.push(i); } } }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) if (j >= 0 && !out[j] && !outside[j]) { outside[j] = 1; stack.push(j); }
  }
  for (let i = 0; i < w * h; i++) if (!outside[i]) out[i] = 1;
  return out;
}

export const isClosedStroke = (pts: Pt[], brush: number) => {
  if (pts.length < 8) return false;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const span = Math.max(bw, bh);
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return span > brush * 2.5 && gap < span * 0.3;
};

// base: 자른 사진(캔버스), pts: 그린 길(0~1), brush: 붓 굵기(사진 짧은 쪽 대비), auto: 자동 맞춤
export function buildMask(base: HTMLCanvasElement, pts: Pt[], brush: number, auto: boolean): MaskRegion | null {
  if (!pts.length) return null;
  const s = Math.min(1, WORK / Math.max(base.width, base.height));
  const w = Math.max(1, Math.round(base.width * s)), h = Math.max(1, Math.round(base.height * s));
  const lw = Math.max(2, brush * Math.min(w, h));
  const closed = isClosedStroke(pts, brush * Math.min(base.width, base.height) / Math.max(base.width, base.height));
  // 대강 그린 곳 (붓 자국, 둘레를 그렸으면 그 안쪽까지)
  const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
  const r = rc.getContext('2d', { willReadFrequently: true })!;
  r.fillStyle = r.strokeStyle = '#fff'; r.lineWidth = lw; r.lineCap = 'round'; r.lineJoin = 'round';
  r.beginPath();
  pts.forEach((p, i) => (i ? r.lineTo(p.x * w, p.y * h) : r.moveTo(p.x * w, p.y * h)));
  if (pts.length === 1) r.lineTo(pts[0].x * w + 0.01, pts[0].y * h);
  if (closed) { r.closePath(); r.fill(); }
  r.stroke();
  const rough = new Uint8Array(w * h);
  { const a = r.getImageData(0, 0, w, h).data; for (let i = 0; i < w * h; i++) rough[i] = a[i * 4 + 3] > 127 ? 1 : 0; }
  let roughArea = 0; for (let i = 0; i < w * h; i++) roughArea += rough[i];
  if (!roughArea) return null;

  let final: Uint8Array = rough;
  if (auto) {
    const ic = document.createElement('canvas'); ic.width = w; ic.height = h;
    const ictx = ic.getContext('2d', { willReadFrequently: true })!;
    ictx.drawImage(base, 0, 0, w, h);
    const px = ictx.getImageData(0, 0, w, h).data;
    const lab = (i: number) => toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    const dOut = distanceTo(rough, w, h);
    const near = Math.max(6, Math.round(0.06 * Math.max(w, h)));   // 칠했을 때 물체 끝까지 넓힐 수 있는 거리
    // 둘레를 그렸으면 사용자가 그은 선 가까이까지만, 칠했으면 근처 물체 끝까지
    const reach = closed ? Math.max(3, Math.round(near * 0.35)) : near;
    // 배경 짐작: 그린 곳 바깥 둘레의 색으로 안쪽을 메워(밀고 당기기) '물체가 없었다면 보였을 배경'을 만든다
    //  → 하늘·벽처럼 위아래로 색이 바뀌는 배경도 그 자리의 배경과 견줌
    const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h), Wt = new Float32Array(w * h);
    const labs: [number, number, number][] = new Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (dOut[i] > reach + near * 1.2) continue;
      labs[i] = lab(i);
      if (dOut[i] > reach + 1) { L[i] = labs[i][0]; A[i] = labs[i][1]; B[i] = labs[i][2]; Wt[i] = 1; }
    }
    const bg = pushPull(L, A, B, Wt, w, h);
    // 짐작한 배경과 색이 꽤 다른 곳 = 물체
    const T = 16;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (dOut[i] > reach || !labs[i]) continue;
      const [l, a, b2] = labs[i];
      if (Math.hypot(l - bg[0][i], a - bg[1][i], b2 - bg[2][i]) > T) m[i] = 1;
    }
    // 잔 점 지우고(열기) 틈 메우기(닫기) → 그린 곳(둘레를 그렸으면 그 안쪽, 칠했으면 붓 자국 가운데)과 이어진 덩어리만
    const opened = grow(shrink(m, w, h, 1), w, h, 1);
    const closedM = shrink(grow(opened, w, h, 2), w, h, 2);
    const seed = closed ? rough : shrink(rough, w, h, Math.max(1, lw * 0.25));
    const kept = keepConnected(closedM, seed, w, h);
    let area = 0; for (let i = 0; i < w * h; i++) area += kept[i];
    // 너무 작게 잡히면(배경과 비슷한 색의 물체 등) 그린 그대로 — 가려야 할 곳이 덜 가려지지 않게
    if (area >= roughArea * 0.15) final = kept;
  }
  // 결과를 둘레 상자만큼만 잘라 캔버스로 (흰색 + 투명)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (final[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const mc = document.createElement('canvas'); mc.width = bw; mc.height = bh;
  const mctx = mc.getContext('2d')!;
  const out = mctx.createImageData(bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const o = (y * bw + x) * 4;
    out.data[o] = out.data[o + 1] = out.data[o + 2] = 255;
    out.data[o + 3] = final[(y + y0) * w + (x + x0)] ? 255 : 0;
  }
  mctx.putImageData(out, 0, 0);
  return { mask: mc, x: x0 / w, y: y0 / h, w: bw / w, h: bh / h };
}

// 모자이크 칸 수(가로): 강도 1(약하게) ~ 5(강하게) — 칸이 클수록 알아보기 어려움
export const MOSAIC_COLUMNS = [56, 40, 28, 20, 14];

// 모자이크(블록) 사진: 줄였다가 크게 늘린 사진 (W×H)
export function pixelate(base: HTMLCanvasElement, W: number, H: number, level: number): HTMLCanvasElement {
  const cols = MOSAIC_COLUMNS[Math.min(4, Math.max(0, level - 1))];
  const small = document.createElement('canvas');
  small.width = cols; small.height = Math.max(1, Math.round(cols * base.height / base.width));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(base, 0, 0, small.width, small.height);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, W, H);
  return out;
}
