'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import Icon from '@/components/Icon';
import StickerPanel, { useStickerPicker } from '@/components/StickerPanel';
import type { Sticker } from '@/lib/stickers';

// 사진 편집: ① 원하는 부분만 자르기 → ② 꾸미기·가리기: 내 이모티콘(채팅 이모티콘, 선물받은·관리자 전용 포함)·그림 문자·모자이크
//    (옮기기·크기·회전·좌우 뒤집기). 붙인 것은 사진에 합쳐서 새 사진으로 만든다 (원본의 가린 부분은 올라가지 않음).

type Area = { x: number; y: number; width: number; height: number };
interface Cover {
  id: string;
  kind: 'emoji' | 'mosaic' | 'sticker';
  emoji?: string;
  src?: string;           // 내 이모티콘 그림 (kind 'sticker')
  label?: string;
  flip?: boolean;         // 좌우 뒤집기
  x: number; y: number;   // 가운데 위치 (사진 너비·높이 대비 0~1)
  size: number;           // 크기 (사진 너비 대비)
  rotation: number;       // 도(°)
}

const ASPECTS: { key: string; label: string; value: number | null }[] = [
  { key: 'orig', label: '원본', value: null },
  { key: '1', label: '정사각형', value: 1 },
  { key: '45', label: '세로 4:5', value: 4 / 5 },
  { key: '169', label: '가로 16:9', value: 16 / 9 },
];
const EMOJIS = ['😊', '🙂', '😇', '🥰', '😎', '🙏', '❤️', '🌸', '🌼', '⭐', '✨', '🕊️', '✝️', '☁️', '🐱', '🐶', '⚫', '⬛'];
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const MAX_OUT = 2048;
const newId = () => Math.random().toString(36).slice(2, 9);
const normAngle = (deg: number) => ((deg + 540) % 360) - 180;
const clampSize = (s: number) => Math.min(0.9, Math.max(0.05, s));

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

export default function PhotoEditor({ file, onDone, onCancel, startStep = 'crop' }: {
  file: File;
  onDone: (edited: File) => void;
  onCancel: () => void;
  // 'cover': 자르지 않고 바로 ② (게시글 수정의 '가리기'), 'sticker': 바로 ② 의 '내 이모티콘' (글쓰기·수정의 '이모티콘 붙이기')
  startStep?: 'crop' | 'cover' | 'sticker';
}) {
  const srcUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(srcUrl), [srcUrl]);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => { loadImage(srcUrl).then(img => setNatural({ w: img.naturalWidth, h: img.naturalHeight })).catch(() => {}); }, [srcUrl]);

  const [step, setStep] = useState<'crop' | 'cover'>('crop');
  // ① 자르기
  const [aspectKey, setAspectKey] = useState('orig');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const aspect = ASPECTS.find(a => a.key === aspectKey)?.value ?? (natural ? natural.w / natural.h : 1);
  // ② 가리기
  const [cropped, setCropped] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<'sticker' | 'emoji'>(startStep === 'cover' ? 'emoji' : 'sticker'); // 아래 칸: 내 이모티콘 / 그림 문자·모자이크
  // 이모티콘 칸(채팅과 같은 칸 — 즐겨찾기·탭 순서·전용 이모티콘 그대로): 고르면 바로 사진 가운데에 붙임
  const pickerBase = useStickerPicker(() => {});
  const stickerPicker = { ...pickerBase, open: true, picked: null, pick: (st: Sticker) => addCover({ kind: 'sticker', src: st.src, label: st.label, size: 0.32 }) };
  // 사진 칸 크기: 남은 자리(위 머리줄·아래 칸을 뺀 곳)에 사진 비율대로 꽉 차게
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);
  const boxRef = useRef<HTMLDivElement>(null);
  const coversRef = useRef(covers);
  coversRef.current = covers;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { mode: 'drag'; id: string; dx: number; dy: number }
    | { mode: 'pinch'; id: string; dist: number; angle: number; size: number; rotation: number }
    | { mode: 'handle'; id: string; cx: number; cy: number; dist: number; angle: number; size: number; rotation: number }
    | null
  >(null);
  const selected = covers.find(c => c.id === selectedId) || null;
  const update = (id: string, patch: Partial<Cover>) => setCovers(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  // 자른 부분을 캔버스로 (긴 쪽 2048px 이하)
  const goCover = async (whole?: Area) => {
    const part = whole || area;
    if (!part) return;
    const img = await loadImage(srcUrl);
    const scale = Math.min(1, MAX_OUT / Math.max(part.width, part.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(part.width * scale));
    canvas.height = Math.max(1, Math.round(part.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, part.x, part.y, part.width, part.height, 0, 0, canvas.width, canvas.height);
    setCropped({ url: canvas.toDataURL('image/jpeg', 0.92), canvas });
    setStep('cover');
  };

  // '가리기'로 열면 사진 전체를 그대로 두고 바로 가리기 단계로
  const startedCover = useRef(false);
  useEffect(() => {
    if (startStep === 'crop' || !natural || startedCover.current) return;
    startedCover.current = true;
    goCover({ x: 0, y: 0, width: natural.w, height: natural.h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStep, natural]);

  const addCover = (c: Omit<Cover, 'id' | 'x' | 'y' | 'rotation'>) => {
    const id = newId();
    setCovers(prev => [...prev, { id, x: 0.5, y: 0.45, rotation: 0, ...c }]);
    setSelectedId(id);
  };

  // --- 손가락: 옮기기 / 두 손가락 돌리기·키우기 / ↻ 손잡이 ---
  const rel = (cx: number, cy: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
  };
  const capture = (e: React.PointerEvent) => {
    try { boxRef.current?.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const twoFingers = () => {
    const [a, b] = Array.from(pointers.current.values());
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  const startDrag = (id: string, cx: number, cy: number) => {
    const c = coversRef.current.find(i => i.id === id);
    if (!c) return;
    const p = rel(cx, cy);
    gesture.current = { mode: 'drag', id, dx: c.x - p.x, dy: c.y - p.y };
  };
  const startPinch = (id: string) => {
    const c = coversRef.current.find(i => i.id === id);
    if (!c || pointers.current.size < 2) return;
    const { dist, angle } = twoFingers();
    gesture.current = { mode: 'pinch', id, dist, angle, size: c.size, rotation: c.rotation };
  };
  const onItemDown = (e: React.PointerEvent, c: Cover) => {
    e.stopPropagation();
    capture(e);
    setSelectedId(c.id);
    if (pointers.current.size >= 2) startPinch(c.id); else startDrag(c.id, e.clientX, e.clientY);
  };
  const onBoxDown = (e: React.PointerEvent) => {
    capture(e);
    if (pointers.current.size >= 2 && selectedId) startPinch(selectedId);
    else if (pointers.current.size === 1) { setSelectedId(null); gesture.current = null; }
  };
  const onHandleDown = (e: React.PointerEvent, c: Cover) => {
    e.stopPropagation();
    capture(e);
    const r = boxRef.current!.getBoundingClientRect();
    const cx = r.left + c.x * r.width, cy = r.top + c.y * r.height;
    gesture.current = { mode: 'handle', id: c.id, cx, cy, dist: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)), angle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI, size: c.size, rotation: c.rotation };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'drag') {
      const p = rel(e.clientX, e.clientY);
      update(g.id, { x: Math.min(1, Math.max(0, p.x + g.dx)), y: Math.min(1, Math.max(0, p.y + g.dy)) });
    } else if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const { dist, angle } = twoFingers();
      update(g.id, { size: clampSize(g.size * dist / g.dist), rotation: normAngle(g.rotation + angle - g.angle) });
    } else if (g.mode === 'handle') {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI;
      update(g.id, { size: clampSize(g.size * dist / g.dist), rotation: normAngle(g.rotation + angle - g.angle) });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.mode === 'pinch' && pointers.current.size === 1) {
      const [rest] = Array.from(pointers.current.values());
      startDrag(g.id, rest.x, rest.y);
    } else if (pointers.current.size === 0) gesture.current = null;
  };

  // 완료: 자른 사진 + 가리기를 한 장으로 합친다
  const finish = async () => {
    if (!cropped) return;
    setSaving(true);
    const base = cropped.canvas;
    const W = base.width, H = base.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    // 내 이모티콘 그림은 미리 다 불러 둠
    const stickerImgs = new Map<string, HTMLImageElement>();
    for (const c of covers) {
      if (c.kind !== 'sticker' || !c.src || stickerImgs.has(c.src)) continue;
      try { stickerImgs.set(c.src, await loadImage(c.src)); } catch { /* 못 불러온 그림은 빼고 */ }
    }
    // 모자이크용: 작게 줄였다가 크게 늘린 사진
    let pixel: HTMLCanvasElement | null = null;
    if (covers.some(c => c.kind === 'mosaic')) {
      const block = Math.max(10, Math.round(W / 32)); // 얼굴을 알아볼 수 없을 만큼 굵게
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(W / block)); small.height = Math.max(1, Math.round(H / block));
      small.getContext('2d')!.drawImage(base, 0, 0, small.width, small.height);
      pixel = document.createElement('canvas');
      pixel.width = W; pixel.height = H;
      const pctx = pixel.getContext('2d')!;
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(small, 0, 0, W, H);
    }
    for (const c of covers) {
      const cx = c.x * W, cy = c.y * H, s = c.size * W, rad = c.rotation * Math.PI / 180;
      if (c.kind === 'mosaic' && pixel) {
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rad);
        ctx.beginPath();
        const r = s * 0.18;
        ctx.moveTo(-s / 2 + r, -s / 2); ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, r); ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, r);
        ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, r); ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, r); ctx.closePath();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clip();
        ctx.drawImage(pixel, 0, 0);
        ctx.restore();
      } else if (c.kind === 'sticker' && c.src) {
        const im = stickerImgs.get(c.src);
        if (!im) continue;
        // 칸(s×s) 안에 비율대로
        const a = im.naturalWidth / Math.max(1, im.naturalHeight);
        const dw = a >= 1 ? s : s * a, dh = a >= 1 ? s / a : s;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rad);
        if (c.flip) ctx.scale(-1, 1);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      } else if (c.emoji) {
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rad);
        if (c.flip) ctx.scale(-1, 1);
        ctx.font = `${s}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.emoji, 0, s * 0.05);
        ctx.restore();
      }
    }
    const blob = await new Promise<Blob | null>(r => out.toBlob(r, 'image/jpeg', 0.9));
    setSaving(false);
    if (!blob) { alert('사진을 만들지 못했어요. 다시 시도해 주세요.'); return; }
    onDone(new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'photo') + '_edit.jpg', { type: 'image/jpeg' }));
  };

  const head = (title: string, left: React.ReactNode, right: React.ReactNode) => (
    <div className="shrink-0 flex items-center justify-between px-3 pt-[calc(0.6rem+env(safe-area-inset-top))] pb-2 text-white">
      {left}<p className="font-bold text-[1.0625rem]">{title}</p>{right}
    </div>
  );
  const ratio = cropped ? cropped.canvas.width / cropped.canvas.height : 1;

  return (
    <div data-no-pinch className="fixed inset-0 z-[88] bg-black flex flex-col select-none" role="dialog" aria-label="사진 편집">
      {step === 'crop' ? (
        <>
          {head('자르기',
            <button onClick={onCancel} className="px-2 py-2 text-[1rem] text-white/80">취소</button>,
            <button onClick={() => goCover()} disabled={!area} className="px-2 py-2 text-[1rem] font-bold text-[#fbe7b0] disabled:opacity-40">다음</button>)}
          <div className="relative flex-1 min-h-0">
            <Cropper image={srcUrl} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} objectFit="contain" showGrid />
          </div>
          <div className="shrink-0 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2">
              {ASPECTS.map(a => (
                <button key={a.key} onClick={() => { setAspectKey(a.key); setCrop({ x: 0, y: 0 }); setZoom(1); }} className={`py-2.5 rounded-xl text-[0.875rem] font-bold ${aspectKey === a.key ? 'bg-white text-stone-900' : 'bg-white/10 text-white'}`}>{a.label}</button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-white text-[0.875rem]">
              <span className="shrink-0">확대</span>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-[#fbe7b0]" />
            </label>
            <p className="text-center text-[0.75rem] text-white/60">손가락으로 사진을 옮기고, 두 손가락으로 키울 수 있어요</p>
          </div>
        </>
      ) : (
        <>
          {head('꾸미기·가리기',
            <button onClick={() => { setStep('crop'); setSelectedId(null); }} className="px-2 py-2 text-[1rem] text-white/80">← 자르기</button>,
            <button onClick={finish} disabled={saving} className="px-2 py-2 text-[1rem] font-bold text-[#fbe7b0] disabled:opacity-40">{saving ? '만드는 중' : '완료'}</button>)}
          <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center px-3 py-2">
            <div
              ref={boxRef}
              className="relative touch-none overflow-hidden [container-type:inline-size]"
              style={{ aspectRatio: String(ratio), width: stage ? Math.max(40, Math.min(stage.w - 24, (stage.h - 16) * ratio)) : '100%' }}
              onPointerDown={onBoxDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            >
              {cropped && <img src={cropped.url} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />}
              {covers.map(c => (
                <div
                  key={c.id}
                  onPointerDown={e => onItemDown(e, c)}
                  className={`absolute flex items-center justify-center ${selectedId === c.id ? 'outline outline-2 outline-dashed outline-white/90 outline-offset-2' : ''}`}
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.size * 100}cqw`, height: `${c.size * 100}cqw`, transform: `translate(-50%, -50%) rotate(${c.rotation}deg)` }}
                >
                  {c.kind === 'mosaic'
                    ? <span className="absolute inset-0 rounded-[18%] backdrop-blur-md bg-white/10 border border-white/40" />
                    : c.kind === 'sticker'
                      ? <img src={c.src} alt={c.label || '이모티콘'} draggable={false} className="w-full h-full object-contain pointer-events-none" style={c.flip ? { transform: 'scaleX(-1)' } : undefined} />
                      : <span style={{ fontSize: `${c.size * 100}cqw`, lineHeight: 1, fontFamily: EMOJI_FONT, transform: c.flip ? 'scaleX(-1)' : undefined }}>{c.emoji}</span>}
                  {selectedId === c.id && (
                    <span onPointerDown={e => onHandleDown(e, c)} className="absolute -right-5 -bottom-5 w-11 h-11 rounded-full bg-[#e8b85a] text-[#101a3f] border-[3px] border-white flex items-center justify-center font-black text-2xl shadow-lg" style={{ transform: `rotate(${-c.rotation}deg)` }} aria-label="돌리기·크기">↻</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {selected ? (
            <div className="shrink-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-3 bg-black">
              <label className="flex items-center gap-3 text-white text-[0.875rem]">
                <span className="w-10 shrink-0">크기</span>
                <input type="range" min={0.05} max={0.9} step={0.01} value={selected.size} onChange={e => update(selected.id, { size: Number(e.target.value) })} className="flex-1 accent-[#fbe7b0]" aria-label="크기" />
              </label>
              <label className="flex items-center gap-3 text-white text-[0.875rem]">
                <span className="w-10 shrink-0">회전</span>
                <input type="range" min={-180} max={180} step={1} value={selected.rotation} onChange={e => update(selected.id, { rotation: Number(e.target.value) })} className="flex-1 accent-[#fbe7b0]" aria-label="회전" />
                <button onClick={() => update(selected.id, { rotation: 0 })} disabled={!selected.rotation} className="shrink-0 px-2.5 py-1 rounded-lg bg-white/10 text-[0.8125rem] font-bold disabled:opacity-30">바로</button>
              </label>
              <div className="flex gap-2">
                {selected.kind !== 'mosaic' && (
                  <button onClick={() => update(selected.id, { flip: !selected.flip })} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-[0.875rem] font-bold">⇋ 좌우 뒤집기</button>
                )}
                <button onClick={() => setSelectedId(null)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-[0.875rem] font-bold">＋ 더 붙이기</button>
                <button onClick={() => { setCovers(prev => prev.filter(c => c.id !== selected.id)); setSelectedId(null); }} className="flex-1 py-2.5 rounded-xl bg-red-500/90 text-white text-[0.875rem] font-bold"><Icon name="trash" className="w-4 h-4 inline-block align-[-0.2em] mr-1" />지우기</button>
              </div>
              <p className="text-center text-[0.75rem] text-white/60">끌어서 옮기고, 두 손가락이나 ↻ 손잡이로 크기·회전을 바꿔요</p>
            </div>
          ) : (
            <div className="shrink-0 bg-black">
              {/* 아래 칸: 내 이모티콘 / 그림 문자·모자이크 */}
              <div className="flex gap-2 px-4 pt-2 pb-2" role="tablist" aria-label="붙일 것">
                {([['sticker', '내 이모티콘'], ['emoji', '그림 문자 · 모자이크']] as const).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tool === k} onClick={() => setTool(k)}
                    className={`flex-1 py-2 rounded-xl text-[0.875rem] font-bold inline-flex items-center justify-center gap-1.5 ${tool === k ? 'bg-white text-stone-900' : 'bg-white/10 text-white'}`}>{k === 'sticker' && <Icon name="sticker" className={`w-5 h-5 ${tool === k ? 'text-amber-500' : ''}`} />}{label}</button>
                ))}
              </div>
              {tool === 'sticker' ? (
                <StickerPanel picker={stickerPicker} closable={false} />
              ) : (
                <div className="px-4 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
                  <button onClick={() => addCover({ kind: 'mosaic', size: 0.3 })} className="w-full py-2.5 rounded-xl bg-white text-stone-900 text-[0.9375rem] font-bold">▦ 모자이크로 가리기</button>
                  <div className="grid grid-cols-9 gap-1">
                    {EMOJIS.map(e => <button key={e} onClick={() => addCover({ kind: 'emoji', emoji: e, size: 0.25 })} className="text-[1.6rem] py-1 rounded-lg active:bg-white/10" style={{ fontFamily: EMOJI_FONT }} aria-label={`${e} 붙이기`}>{e}</button>)}
                  </div>
                  <p className="text-center text-[0.75rem] text-white/60">붙인 것을 끌어서 옮기고, ↻ 손잡이나 아래 막대로 크기·회전을 바꿔요</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
