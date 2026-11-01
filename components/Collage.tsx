'use client';

// 콜라주 (루비로사 건의 2026-11-01: '4장의 사진을 모아 올릴 때 사진 모양에 따라 비율을 달리하며 자주 사용해요' —
// 삼성 갤러리 '만들기 → 콜라주'처럼): 글쓰기에서 고른 사진 2~9장을 한 장으로 모은다.
//  · 모양(칸 나누기) — 사진 수에 맞는 여러 모양 · 비율 — 세로/가로 + 1:1·5:4·4:3·3:2·16:9 (1:1 은 방향 없음)
//  · 간격·모서리 둥글게·바탕 색 · 칸을 누르면 고름 → 끌어서 사진 위치, 두 손가락이나 막대로 확대, '⇄ 자리 바꾸기'
//  · 완료하면 긴 쪽 2048px JPEG 한 장 (onDone)
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';

type Cell = { x: number; y: number; w: number; h: number };
type Fit = { ox: number; oy: number; zoom: number }; // ox·oy: -1~1 (사진이 칸보다 남는 만큼 중 어디), zoom ≥ 1
export const COLLAGE_MAX = 9;
const OUT = 2048;
const EPS = 0.001;

// 줄마다 칸 수 [2,3] → 위 줄 2칸·아래 줄 3칸
const rows = (pattern: number[]): Cell[] => pattern.flatMap((n, r) => Array.from({ length: n }, (_, i) => ({ x: i / n, y: r / pattern.length, w: 1 / n, h: 1 / pattern.length })));
const transpose = (cells: Cell[]): Cell[] => cells.map(c => ({ x: c.y, y: c.x, w: c.h, h: c.w }));
// 왼쪽 큰 칸 하나 + 오른쪽에 나머지를 위아래로
const bigLeft = (n: number, big = 0.6): Cell[] => [{ x: 0, y: 0, w: big, h: 1 }, ...Array.from({ length: n - 1 }, (_, i) => ({ x: big, y: i / (n - 1), w: 1 - big, h: 1 / (n - 1) }))];

export function collageLayouts(n: number): Cell[][] {
  switch (n) {
    case 2: return [rows([2]), rows([1, 1]), bigLeft(2, 0.6), transpose(bigLeft(2, 0.6))];
    case 3: return [bigLeft(3), transpose(bigLeft(3)), rows([3]), rows([1, 1, 1]), rows([1, 2]), rows([2, 1])];
    case 4: return [rows([2, 2]), bigLeft(4, 0.62), transpose(bigLeft(4, 0.62)), rows([1, 3]), rows([3, 1]), rows([4]), rows([1, 1, 1, 1])];
    case 5: return [rows([2, 3]), rows([3, 2]), rows([1, 2, 2]), rows([2, 1, 2]), transpose(rows([2, 3])), transpose(rows([1, 2, 2]))];
    case 6: return [rows([2, 2, 2]), rows([3, 3]), rows([1, 2, 3]), transpose(rows([1, 2, 3])), rows([3, 1, 2])];
    case 7: return [rows([2, 3, 2]), rows([3, 1, 3]), rows([2, 2, 3]), transpose(rows([2, 3, 2]))];
    case 8: return [rows([3, 2, 3]), rows([2, 2, 2, 2]), rows([4, 4]), transpose(rows([3, 2, 3]))];
    default: return [rows([3, 3, 3]), rows([2, 3, 4]), transpose(rows([2, 3, 4]))];
  }
}

const RATIOS: { key: string; label: string; a: number; b: number }[] = [
  { key: '1:1', label: '1:1', a: 1, b: 1 },
  { key: '5:4', label: '5:4', a: 5, b: 4 },
  { key: '4:3', label: '4:3', a: 4, b: 3 },
  { key: '3:2', label: '3:2', a: 3, b: 2 },
  { key: '16:9', label: '16:9', a: 16, b: 9 },
];
const BACKS = [
  { key: 'white', label: '흰색', color: '#ffffff' },
  { key: 'cream', label: '크림', color: '#f4ecdf' },
  { key: 'black', label: '검정', color: '#111111' },
];

// 칸의 실제 네모 (간격 g: 바깥 둘레 g, 칸 사이 g)
function cellBox(c: Cell, W: number, H: number, g: number) {
  const l = c.x * W + (c.x < EPS ? g : g / 2);
  const t = c.y * H + (c.y < EPS ? g : g / 2);
  const r = (c.x + c.w) * W - (c.x + c.w > 1 - EPS ? g : g / 2);
  const b = (c.y + c.h) * H - (c.y + c.h > 1 - EPS ? g : g / 2);
  return { l, t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
}
// 칸(cw×ch)을 사진(iw×ih)으로 꽉 채울 때 그릴 자리
function coverBox(iw: number, ih: number, cw: number, ch: number, f: Fit) {
  const s = Math.max(cw / iw, ch / ih) * f.zoom;
  const dw = iw * s, dh = ih * s;
  const mx = (dw - cw) / 2, my = (dh - ch) / 2;
  return { x: (cw - dw) / 2 + f.ox * mx, y: (ch - dh) / 2 + f.oy * my, w: dw, h: dh, mx, my };
}
const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export default function Collage({ files, onDone, onCancel }: { files: File[]; onDone: (f: File) => void; onCancel: () => void }) {
  const used = files.slice(0, COLLAGE_MAX);
  const urls = useMemo(() => files.slice(0, COLLAGE_MAX).map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
  const [dims, setDims] = useState<({ w: number; h: number } | null)[]>([]);
  // 처음 비율: 사진들이 대체로 세로면 세로 4:3(=3:4), 가로면 가로 4:3, 섞였으면 1:1
  const [portrait, setPortrait] = useState(true);
  const [ratioKey, setRatioKey] = useState('1:1');
  const autoRef = useRef(false);
  useEffect(() => {
    let alive = true;
    Promise.all(urls.map(u => loadImage(u).then(i => ({ w: i.naturalWidth, h: i.naturalHeight })).catch(() => null))).then(d => {
      if (!alive) return;
      setDims(d);
      if (autoRef.current) return;
      autoRef.current = true;
      const ok = d.filter(Boolean) as { w: number; h: number }[];
      const tall = ok.filter(x => x.h > x.w * 1.1).length, wide = ok.filter(x => x.w > x.h * 1.1).length;
      if (tall > ok.length / 2) { setPortrait(true); setRatioKey('4:3'); }
      else if (wide > ok.length / 2) { setPortrait(false); setRatioKey('4:3'); }
    });
    return () => { alive = false; };
  }, [urls]);
  const n = used.length;
  const layouts = useMemo(() => collageLayouts(n), [n]);
  const [layoutIdx, setLayoutIdx] = useState(0);
  const layout = layouts[Math.min(layoutIdx, layouts.length - 1)];
  const ratio = RATIOS.find(r => r.key === ratioKey) || RATIOS[0];
  const aspect = ratio.a === ratio.b ? 1 : portrait ? ratio.b / ratio.a : ratio.a / ratio.b; // 너비 ÷ 높이
  const [gap, setGap] = useState(0.012);      // 짧은 쪽 대비
  const [radius, setRadius] = useState(0);    // 짧은 쪽 대비
  const [back, setBack] = useState('white');
  const backColor = BACKS.find(b => b.key === back)?.color || '#ffffff';
  // 칸 i 에 들어갈 사진 번호 · 사진마다 위치·확대
  const [order, setOrder] = useState<number[]>(() => used.map((_, i) => i));
  const [fits, setFits] = useState<Fit[]>(() => used.map(() => ({ ox: 0, oy: 0, zoom: 1 })));
  const [sel, setSel] = useState<number | null>(null); // 고른 칸
  const [swapping, setSwapping] = useState(false);
  const [saving, setSaving] = useState(false);

  // 미리 보기 칸 크기: 남은 자리에 비율대로
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const m = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const PW = stage ? Math.max(60, Math.min(stage.w - 24, (stage.h - 16) * aspect)) : 0;
  const PH = PW / aspect;
  const short = Math.min(PW, PH);

  // 손가락: 칸을 끌면 그 칸의 사진 위치, 두 손가락이면 확대, 살짝 누르면 고르기(자리 바꾸기 중이면 바꾸기)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ cell: number; sx: number; sy: number; fit: Fit; moved: boolean; t: number; dist?: number } | null>(null);
  const onDown = (cell: number) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pi = order[cell];
    if (pointers.current.size === 2 && g.current?.cell === cell) {
      const [a, b] = [...pointers.current.values()];
      g.current = { ...g.current, dist: Math.hypot(a.x - b.x, a.y - b.y), fit: fits[pi], moved: true };
      return;
    }
    g.current = { cell, sx: e.clientX, sy: e.clientY, fit: fits[pi], moved: false, t: Date.now() };
  };
  const onMove = (cell: number) => (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = g.current;
    if (!st || st.cell !== cell) return;
    const pi = order[cell];
    const d = dims[pi];
    if (!d) return;
    const box = cellBox(layout[cell], PW, PH, gap * short);
    if (pointers.current.size >= 2 && st.dist) {
      const [a, b] = [...pointers.current.values()];
      const zoom = Math.min(4, Math.max(1, st.fit.zoom * Math.hypot(a.x - b.x, a.y - b.y) / st.dist));
      setFits(prev => prev.map((f, i) => i === pi ? { ...f, zoom } : f));
      return;
    }
    const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if (!st.moved && Math.hypot(dx, dy) < 6) return;
    st.moved = true;
    if (swapping) return;
    const cb = coverBox(d.w, d.h, box.w, box.h, st.fit);
    const ox = cb.mx > 0.5 ? Math.max(-1, Math.min(1, st.fit.ox + dx / cb.mx)) : 0;
    const oy = cb.my > 0.5 ? Math.max(-1, Math.min(1, st.fit.oy + dy / cb.my)) : 0;
    setFits(prev => prev.map((f, i) => i === pi ? { ...f, ox, oy } : f));
  };
  const onUp = (cell: number) => (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const st = g.current;
    if (pointers.current.size > 0) return;
    g.current = null;
    if (!st || st.cell !== cell || st.moved || Date.now() - st.t > 500) return;
    // 살짝 누름
    if (swapping && sel !== null && sel !== cell) {
      setOrder(prev => { const nx = [...prev]; [nx[sel], nx[cell]] = [nx[cell], nx[sel]]; return nx; });
      setSwapping(false);
      setSel(cell);
      return;
    }
    setSwapping(false);
    setSel(s => (s === cell ? null : cell));
  };

  const finish = async () => {
    setSaving(true);
    try {
      const W = aspect >= 1 ? OUT : Math.round(OUT * aspect);
      const H = aspect >= 1 ? Math.round(OUT / aspect) : OUT;
      const k = Math.min(W, H);
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = backColor;
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingQuality = 'high';
      const imgs = await Promise.all(urls.map(u => loadImage(u).catch(() => null)));
      layout.forEach((c, ci) => {
        const pi = order[ci];
        const img = imgs[pi];
        if (!img) return;
        const b = cellBox(c, W, H, gap * k);
        const cb = coverBox(img.naturalWidth, img.naturalHeight, b.w, b.h, fits[pi]);
        ctx.save();
        ctx.beginPath();
        const r = Math.min(radius * k, b.w / 2, b.h / 2);
        if (r > 0.5 && ctx.roundRect) ctx.roundRect(b.l, b.t, b.w, b.h, r); else ctx.rect(b.l, b.t, b.w, b.h);
        ctx.clip();
        ctx.drawImage(img, b.l + cb.x, b.t + cb.y, cb.w, cb.h);
        ctx.restore();
      });
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('blob');
      onDone(new File([blob], `collage_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } catch {
      alert('콜라주를 만들지 못했어요. 다시 시도해 주세요.');
    }
    setSaving(false);
  };

  const selFit = sel !== null ? fits[order[sel]] : null;
  const thumb = (cells: Cell[], i: number) => (
    <button key={i} type="button" onClick={() => { setLayoutIdx(i); setSel(null); setSwapping(false); }} aria-pressed={i === layoutIdx} aria-label={`모양 ${i + 1}`}
      className={`shrink-0 w-12 h-12 rounded-lg p-1 ${i === layoutIdx ? 'bg-white' : 'bg-white/10'}`}>
      <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden="true">
        {cells.map((c, j) => <rect key={j} x={c.x * 40 + 1.2} y={c.y * 40 + 1.2} width={c.w * 40 - 2.4} height={c.h * 40 - 2.4} rx={2} className={i === layoutIdx ? 'fill-stone-800' : 'fill-white/70'} />)}
      </svg>
    </button>
  );

  return (
    <div data-no-pinch className="fixed inset-0 z-[88] bg-black flex flex-col select-none text-white" role="dialog" aria-label="콜라주 만들기">
      <div className="shrink-0 flex items-center justify-between px-3 pt-[calc(0.6rem+env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onCancel} className="px-2 py-2 text-[1rem] text-white/80">취소</button>
        <p className="font-bold text-[1.0625rem] inline-flex items-center gap-1.5"><Icon name="collage" className="w-5 h-5 text-[#fbe7b0]" />콜라주 <span className="text-white/60 text-[0.875rem] font-normal">{n}장</span></p>
        <button type="button" onClick={finish} disabled={saving || dims.length !== n} className="px-2 py-2 text-[1rem] font-bold text-[#fbe7b0] disabled:opacity-40">{saving ? '만드는 중' : '완료'}</button>
      </div>
      <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center px-3 py-2">
        {stage && (
          <div className="relative shadow-2xl" style={{ width: PW, height: PH, background: backColor }}>
            {layout.map((c, ci) => {
              const b = cellBox(c, PW, PH, gap * short);
              const pi = order[ci];
              const d = dims[pi];
              const cb = d ? coverBox(d.w, d.h, b.w, b.h, fits[pi]) : null;
              return (
                <div key={ci} onPointerDown={onDown(ci)} onPointerMove={onMove(ci)} onPointerUp={onUp(ci)} onPointerCancel={onUp(ci)}
                  className="absolute overflow-hidden touch-none cursor-grab bg-stone-700"
                  style={{ left: b.l, top: b.t, width: b.w, height: b.h, borderRadius: Math.min(radius * short, b.w / 2, b.h / 2) }}
                  aria-label={`${ci + 1}번 칸 (${pi + 1}번 사진)`} role="button">
                  {cb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[pi]} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ left: cb.x, top: cb.y, width: cb.w, height: cb.h }} />
                  )}
                  {sel === ci && <span className="pointer-events-none absolute inset-0 ring-[3px] ring-inset ring-[#fbe7b0]" style={{ borderRadius: 'inherit' }} />}
                  {swapping && sel !== ci && <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 text-[0.8125rem] font-bold">여기와 바꾸기</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 bg-black px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
        {sel !== null && selFit ? (
          <>
            <label className="flex items-center gap-3 text-[0.875rem] px-1">
              <span className="w-10 shrink-0">확대</span>
              <input type="range" min={1} max={4} step={0.01} value={selFit.zoom} aria-label="고른 칸 사진 확대"
                onChange={e => { const z = Number(e.target.value); setFits(prev => prev.map((f, i) => i === order[sel] ? { ...f, zoom: z } : f)); }}
                className="flex-1 accent-[#fbe7b0]" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setSwapping(s => !s)} aria-pressed={swapping}
                className={`py-2.5 rounded-xl text-[0.875rem] font-bold ${swapping ? 'bg-[#fbe7b0] text-stone-900' : 'bg-white/10'}`}>⇄ {swapping ? '바꿀 칸 누르기' : '자리 바꾸기'}</button>
              <button type="button" onClick={() => setFits(prev => prev.map((f, i) => i === order[sel] ? { ox: 0, oy: 0, zoom: 1 } : f))} className="py-2.5 rounded-xl bg-white/10 text-[0.875rem] font-bold">↺ 처음대로</button>
              <button type="button" onClick={() => { setSel(null); setSwapping(false); }} className="py-2.5 rounded-xl bg-white text-stone-900 text-[0.875rem] font-bold">다 됐어요</button>
            </div>
            <p className="text-center text-[0.75rem] text-white/60">칸 안의 사진을 끌어 보일 곳을 맞추고, 두 손가락으로 키워요</p>
          </>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] pt-1" role="group" aria-label="모양">{layouts.map(thumb)}</div>
            <div className="flex items-center gap-1.5" role="group" aria-label="비율">
              <button type="button" onClick={() => setPortrait(p => !p)} disabled={ratio.a === ratio.b} aria-label={portrait ? '세로 (눌러서 가로로)' : '가로 (눌러서 세로로)'}
                className="shrink-0 w-11 h-10 rounded-xl bg-white/10 flex items-center justify-center disabled:opacity-30">
                <span className={`block border-2 border-white rounded-[3px] ${portrait ? 'w-3.5 h-5' : 'w-5 h-3.5'}`} />
              </button>
              {RATIOS.map(r => (
                <button key={r.key} type="button" onClick={() => setRatioKey(r.key)} aria-pressed={ratioKey === r.key}
                  className={`flex-1 h-10 rounded-xl text-[0.875rem] font-bold ${ratioKey === r.key ? 'bg-white text-stone-900' : 'bg-white/10'}`}>
                  {r.a === r.b ? r.label : portrait ? `${r.b}:${r.a}` : r.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 text-[0.8125rem]">
              <label className="flex items-center gap-2"><span className="shrink-0 whitespace-nowrap">간격</span>
                <input type="range" min={0} max={0.04} step={0.002} value={gap} onChange={e => setGap(Number(e.target.value))} className="flex-1 min-w-0 accent-[#fbe7b0]" aria-label="간격" /></label>
              <label className="flex items-center gap-2"><span className="shrink-0 whitespace-nowrap">둥글게</span>
                <input type="range" min={0} max={0.08} step={0.004} value={radius} onChange={e => setRadius(Number(e.target.value))} className="flex-1 min-w-0 accent-[#fbe7b0]" aria-label="모서리 둥글게" /></label>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-[0.8125rem] shrink-0 whitespace-nowrap mr-1">바탕</span>
              {BACKS.map(b => (
                <button key={b.key} type="button" onClick={() => setBack(b.key)} aria-pressed={back === b.key}
                  className={`h-8 px-3 rounded-full text-[0.8125rem] font-bold inline-flex items-center gap-1.5 ${back === b.key ? 'bg-white text-stone-900' : 'bg-white/10'}`}>
                  <span className="w-4 h-4 rounded-full border border-white/50" style={{ background: b.color }} />{b.label}
                </button>
              ))}
            </div>
            <p className="text-center text-[0.75rem] text-white/60">{files.length > COLLAGE_MAX ? `앞의 ${COLLAGE_MAX}장으로 만들어요 · ` : ''}칸을 누르면 사진 위치·크기·자리를 바꿀 수 있어요</p>
          </>
        )}
      </div>
    </div>
  );
}
