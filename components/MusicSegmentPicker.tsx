'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadYouTubeApi, YT_ENDED, type YTPlayer } from '@/lib/youtube-api';
import { CLIP_SECONDS } from '@/lib/music';

const PX_PER_SEC = 10;          // 음악 막대 1초당 너비
const MIN_CLIP = 5;             // 가장 짧게 고를 수 있는 길이(초)
const EDGE_PAD = 24;            // 막대 양 끝 여백 (손잡이가 잘리지 않게)

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// 음악 구간 고르기: 곡 전체 막대 위에 보라색 상자가 고른 구간.
// 상자의 왼쪽·오른쪽 손잡이를 끌면 시작·끝이 바뀌고(5~30초), 상자 가운데를 끌면 구간이 통째로 움직인다.
// 막대 바깥을 밀면 곡의 다른 부분을 볼 수 있다. 손을 떼면 고른 구간을 바로 들려준다.
export default function MusicSegmentPicker({ videoId, title, initialStart = 0, initialClip = CLIP_SECONDS, onConfirm, onBack }: {
  videoId: string;
  title: string;
  initialStart?: number;
  initialClip?: number;
  onConfirm: (start: number, clip?: number) => void;
  onBack: () => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState(() => ({ start: initialStart, clip: Math.min(CLIP_SECONDS, Math.max(MIN_CLIP, initialClip)) }));
  const rangeRef = useRef(range);
  const drag = useRef<{ kind: 'start' | 'end' | 'move'; x: number; start: number; clip: number } | null>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'move' | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { start, clip } = range;

  const update = (next: { start: number; clip: number }) => { rangeRef.current = next; setRange(next); };

  // 재생기 준비 + 길이 알아내기
  useEffect(() => {
    let cancelled = false;
    let loopTimer: ReturnType<typeof setInterval> | undefined;
    loadYouTubeApi().then(YT => {
      if (cancelled || !holderRef.current) return;
      const el = document.createElement('div');
      holderRef.current.innerHTML = '';
      holderRef.current.appendChild(el);
      playerRef.current = new YT.Player(el, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, controls: 0, start: initialStart },
        events: {
          onReady: e => {
            const d = Math.floor(e.target.getDuration() || 0);
            setDuration(d);
            // 예전에 고른 구간이 곡 길이를 넘으면 맞춰 줌
            if (d > 0) {
              const c = Math.min(rangeRef.current.clip, Math.max(MIN_CLIP, d));
              update({ start: Math.max(0, Math.min(rangeRef.current.start, d - c)), clip: c });
            }
            setReady(true);
            e.target.seekTo(rangeRef.current.start, true);
            e.target.playVideo();
            // 고른 구간 안에서만 반복
            loopTimer = setInterval(() => {
              const p = playerRef.current;
              if (!p) return;
              const t = p.getCurrentTime();
              const r = rangeRef.current;
              if (t > r.start + r.clip || t < r.start - 1) p.seekTo(r.start, true);
            }, 400);
          },
          onStateChange: e => { if (e.data === YT_ENDED) { e.target.seekTo(rangeRef.current.start, true); e.target.playVideo(); } },
          onError: () => setFailed(true),
        },
      });
    });
    return () => {
      cancelled = true;
      clearInterval(loopTimer);
      try { playerRef.current?.destroy(); } catch { /* 이미 정리됨 */ }
      playerRef.current = null;
    };
  }, [videoId, initialStart]);

  // 처음 열 때 고른 구간이 보이도록 막대를 옮겨 둔다
  useEffect(() => {
    if (ready && stripRef.current) stripRef.current.scrollLeft = Math.max(0, rangeRef.current.start * PX_PER_SEC - 40);
  }, [ready]);

  const tooShort = ready && duration > 0 && duration <= MIN_CLIP;

  const playFromStart = () => {
    playerRef.current?.seekTo(rangeRef.current.start, true);
    playerRef.current?.playVideo();
  };

  // 손잡이·상자 끌기 (1초 = PX_PER_SEC)
  const onDown = (kind: 'start' | 'end' | 'move') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, ...rangeRef.current };
    setDragging(kind);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.round((e.clientX - d.x) / PX_PER_SEC);
    const end = d.start + d.clip;
    let next = rangeRef.current;
    if (d.kind === 'start') {
      // 끝은 그대로, 시작만: 5~30초 길이 안에서
      const s = Math.min(end - MIN_CLIP, Math.max(0, end - CLIP_SECONDS, d.start + dt));
      next = { start: s, clip: end - s };
    } else if (d.kind === 'end') {
      const e2 = Math.max(d.start + MIN_CLIP, Math.min(duration, d.start + CLIP_SECONDS, end + dt));
      next = { start: d.start, clip: e2 - d.start };
    } else {
      next = { start: Math.max(0, Math.min(duration - d.clip, d.start + dt)), clip: d.clip };
    }
    if (next.start !== rangeRef.current.start || next.clip !== rangeRef.current.clip) update(next);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(null);
    playFromStart();
  };
  const dragProps = (kind: 'start' | 'end' | 'move') => ({
    onPointerDown: onDown(kind), onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp,
  });

  // 음악 막대 모양 (영상마다 같은 모양이 나오도록 영상 ID로 높이를 정함)
  const bars = useMemo(() => {
    let seed = Array.from(videoId).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    return Array.from({ length: Math.ceil(duration) }, () => 0.25 + rand() * 0.75);
  }, [videoId, duration]);

  const handle = (side: 'start' | 'end') => (
    <div
      role="slider"
      aria-label={side === 'start' ? '구간 시작' : '구간 끝'}
      aria-valuenow={side === 'start' ? start : start + clip}
      {...dragProps(side)}
      className={`absolute -top-2 -bottom-2 w-11 flex items-center justify-center touch-none cursor-ew-resize z-10 ${side === 'start' ? '-left-[1.375rem]' : '-right-[1.375rem]'}`}
    >
      <span className={`w-5 h-14 rounded-full shadow-md flex items-center justify-center gap-[3px] transition-colors ${dragging === side ? 'bg-violet-800' : 'bg-violet-600'}`}>
        <span className="w-[2px] h-6 rounded-full bg-white/80" /><span className="w-[2px] h-6 rounded-full bg-white/80" />
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-stone-500 shrink-0">← 다시 고르기</button>
        <p className="flex-1 min-w-0 text-sm font-bold text-stone-800 truncate text-right">{title}</p>
      </div>

      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-stone-900">
        <div ref={holderRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
        {failed && <div className="absolute inset-0 flex items-center justify-center text-white text-sm p-4 text-center">이 영상은 앱에서 재생할 수 없어요.<br />다른 곡을 골라주세요.</div>}
      </div>

      {!ready ? (
        <p className="text-center text-sm text-stone-400 py-6">음악 불러오는 중...</p>
      ) : tooShort ? (
        <p className="text-center text-sm text-stone-500 py-4">아주 짧은 곡이라 전체가 재생돼요.</p>
      ) : (
        <>
          <p className="text-center text-sm text-stone-700">
            <b className="text-violet-700 text-base">{fmt(start)} ~ {fmt(start + clip)}</b>
            <b className="ml-1.5 text-white bg-violet-600 rounded-full px-2 py-0.5 text-[0.8125rem]">{clip}초</b>
            <span className="text-stone-400"> / 전체 {fmt(duration)}</span>
          </p>
          <div
            ref={stripRef}
            className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl bg-stone-100 touch-pan-x py-2"
          >
            <div className="relative flex items-center h-20" style={{ width: duration * PX_PER_SEC + EDGE_PAD * 2, paddingLeft: EDGE_PAD, paddingRight: EDGE_PAD }}>
              {bars.map((h, i) => (
                <span
                  key={i}
                  className={`shrink-0 rounded-full mx-[2px] ${i >= start && i < start + clip ? 'bg-violet-600' : 'bg-stone-300'}`}
                  style={{ width: PX_PER_SEC - 4, height: `${Math.round(h * 100)}%` }}
                />
              ))}
              {/* 고른 구간: 가운데를 끌면 통째로 이동, 양 끝 손잡이로 시작·끝 조절 */}
              <div
                {...dragProps('move')}
                aria-label="고른 구간 옮기기"
                className={`absolute top-0 bottom-0 rounded-xl border-[3px] touch-none cursor-grab ${dragging === 'move' ? 'border-violet-800 bg-violet-600/10' : 'border-violet-600'}`}
                style={{ left: EDGE_PAD + start * PX_PER_SEC, width: clip * PX_PER_SEC }}
              >
                {handle('start')}
                {handle('end')}
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-stone-500 leading-relaxed">
            보라색 <b>양쪽 손잡이</b>를 끌어서 <b>시작과 끝</b>을 정하세요 (5~30초)<br />
            상자 <b>가운데</b>를 끌면 구간이 통째로 움직여요 · 막대를 밀면 곡의 다른 부분이 보여요
          </p>
          <button onClick={playFromStart} className="self-center text-xs px-3 py-1.5 rounded-full border border-stone-300 text-stone-600">▶ 이 구간 다시 듣기</button>
        </>
      )}

      <button
        onClick={() => onConfirm(tooShort ? 0 : start, tooShort ? undefined : clip)}
        disabled={!ready || failed}
        className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40"
      >
        이 구간으로 올리기
      </button>
    </div>
  );
}
