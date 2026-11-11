'use client';

import { useEffect, useRef, useState } from 'react';

// 긴 영상에서 올릴 부분을 고르는 막대 (스토리, 운영자 2026-11-11 '영상 중에서 원하는 부분을 1분 안쪽으로')
// 위: 고른 구간만 되풀이해 보여 주는 영상 / 아래: 장면 그림 줄 위의 노란 틀 — 가운데를 끌면 옮기기, 양 끝 손잡이를 끌면 길이(1초~max초)
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export default function VideoTrimmer({ src, duration, max, start, end, onChange }: {
  src: string; duration: number; max: number; start: number; end: number;
  onChange: (start: number, end: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [now, setNow] = useState(start);
  const drag = useRef<{ mode: 'move' | 'l' | 'r'; x: number; s: number; e: number } | null>(null);
  const range = useRef({ start, end });
  range.current = { start, end };

  // 장면 그림 8장 (막대 바탕)
  useEffect(() => {
    let off = false;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
    const canvas = document.createElement('canvas');
    const out: string[] = [];
    const N = 8;
    const next = (i: number) => {
      if (off || i >= N) return;
      v.onseeked = () => {
        if (off) return;
        const h = 96, w = Math.max(1, Math.round(h * (v.videoWidth || 9) / (v.videoHeight || 16)));
        canvas.width = w; canvas.height = h;
        try { canvas.getContext('2d')!.drawImage(v, 0, 0, w, h); out.push(canvas.toDataURL('image/jpeg', 0.6)); setThumbs([...out]); } catch { /* 못 그리면 그냥 바탕색 */ }
        next(i + 1);
      };
      v.currentTime = Math.min(duration - 0.1, (duration * (i + 0.5)) / N);
    };
    v.onloadedmetadata = () => next(0);
    return () => { off = true; v.removeAttribute('src'); v.load(); };
  }, [src, duration]);

  // 구간이 바뀌면 처음으로, 끝에 닿으면 처음부터 다시
  useEffect(() => { const v = videoRef.current; if (v && !drag.current) { v.currentTime = start; v.play().catch(() => {}); } }, [start, end]);
  const onTime = () => {
    const v = videoRef.current; if (!v) return;
    setNow(v.currentTime);
    if (v.currentTime >= range.current.end - 0.05 || v.currentTime < range.current.start - 0.3) { v.currentTime = range.current.start; v.play().catch(() => {}); }
  };

  const down = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, s: start, e: end };
    videoRef.current?.pause();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, track = trackRef.current;
    if (!d || !track) return;
    const dt = ((e.clientX - d.x) / track.clientWidth) * duration;
    let s = d.s, en = d.e;
    if (d.mode === 'move') { const len = d.e - d.s; s = Math.min(Math.max(0, d.s + dt), duration - len); en = s + len; }
    else if (d.mode === 'l') s = Math.min(Math.max(Math.max(0, d.e - max), d.s + dt), d.e - 1);
    else en = Math.max(Math.min(Math.min(duration, d.s + max), d.e + dt), d.s + 1);
    onChange(s, en);
    const v = videoRef.current; if (v) v.currentTime = d.mode === 'r' ? Math.max(s, en - 0.1) : s; // 끄는 쪽 장면을 보여 줌
  };
  const up = () => { if (!drag.current) return; drag.current = null; const v = videoRef.current; if (v) { v.currentTime = range.current.start; v.play().catch(() => {}); } };

  const left = (start / duration) * 100, width = ((end - start) / duration) * 100;
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-no-pinch>
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <video ref={videoRef} src={src} autoPlay muted playsInline onTimeUpdate={onTime} onLoadedMetadata={e => { e.currentTarget.currentTime = start; }} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="shrink-0 px-5 pt-3">
        <div className="flex items-baseline justify-between text-white text-[0.8125rem]">
          <span className="font-bold">{fmt(start)} ~ {fmt(end)} <span className="font-normal text-white/70">· {Math.round(end - start)}초</span></span>
          <span className="text-white/60">전체 {fmt(duration)}</span>
        </div>
        <div ref={trackRef} className="relative mt-2 h-14 rounded-lg overflow-hidden bg-white/10 select-none touch-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="absolute inset-0 flex">{thumbs.map((t, i) => <img key={i} src={t} alt="" className="h-full flex-1 min-w-0 object-cover" draggable={false} />)}</div>
          {/* 고르지 않은 곳은 어둡게 */}
          <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: `${left}%` }} />
          <div className="absolute inset-y-0 right-0 bg-black/60" style={{ width: `${100 - left - width}%` }} />
          <div className="absolute inset-y-0 border-y-[3px] border-amber-400 cursor-grab" style={{ left: `${left}%`, width: `${width}%` }} onPointerDown={down('move')} aria-label="고른 구간 옮기기">
            <span className="absolute inset-y-0 w-0.5 bg-white/90 pointer-events-none" style={{ left: `${Math.min(100, Math.max(0, ((now - start) / Math.max(0.1, end - start)) * 100))}%` }} />
          </div>
          <button type="button" onPointerDown={down('l')} className="absolute inset-y-0 w-5 -ml-2.5 flex items-center justify-center touch-none" style={{ left: `${left}%` }} aria-label="시작 지점">
            <span className="w-3 h-full rounded-l-md bg-amber-400 flex items-center justify-center"><span className="w-0.5 h-5 bg-black/50 rounded" /></span>
          </button>
          <button type="button" onPointerDown={down('r')} className="absolute inset-y-0 w-5 -ml-2.5 flex items-center justify-center touch-none" style={{ left: `${left + width}%` }} aria-label="끝 지점">
            <span className="w-3 h-full rounded-r-md bg-amber-400 flex items-center justify-center"><span className="w-0.5 h-5 bg-black/50 rounded" /></span>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.75rem] text-white/60">노란 틀을 끌어 올릴 부분을 고르세요 · 양 끝을 끌면 길이 (최대 {max}초)</p>
      </div>
    </div>
  );
}
