'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadYouTubeApi, YT_ENDED, type YTPlayer } from '@/lib/youtube-api';
import { CLIP_SECONDS } from '@/lib/music';

const PX_PER_SEC = 10;          // 음악 막대 1초당 너비
const MIN_CLIP = 5;             // 가장 짧게 고를 수 있는 길이(초)
const BAR_EVERY = 1;            // 1초마다 막대 하나

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// 올리는 사람이 음악 막대를 옆으로 밀어서 시작 위치를 고르고,
// 왼쪽 테두리 상자의 오른쪽 손잡이를 끌어 길이를 5~30초 사이로 줄이거나 늘린다.
// 밀기·끌기를 멈추면 그 구간을 바로 들려준다.
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
  const startRef = useRef(initialStart);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(initialStart);
  const [clip, setClip] = useState(Math.min(CLIP_SECONDS, Math.max(MIN_CLIP, initialClip)));
  const clipRef = useRef(clip);
  const handleDrag = useRef<{ x: number; clip: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

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
            setReady(true);
            e.target.seekTo(startRef.current, true);
            e.target.playVideo();
            // 고른 30초 안에서만 반복
            loopTimer = setInterval(() => {
              const p = playerRef.current;
              if (!p) return;
              const t = p.getCurrentTime();
              if (t > startRef.current + clipRef.current || t < startRef.current - 1) p.seekTo(startRef.current, true);
            }, 400);
          },
          onStateChange: e => { if (e.data === YT_ENDED) { e.target.seekTo(startRef.current, true); e.target.playVideo(); } },
          onError: () => setFailed(true),
        },
      });
    });
    return () => {
      cancelled = true;
      clearInterval(loopTimer);
      clearTimeout(settleTimer.current);
      try { playerRef.current?.destroy(); } catch { /* 이미 정리됨 */ }
      playerRef.current = null;
    };
  }, [videoId, initialStart]);

  // 처음 열 때 이전에 고른 위치로 막대를 옮겨 둔다
  useEffect(() => {
    if (ready && stripRef.current) stripRef.current.scrollLeft = initialStart * PX_PER_SEC;
  }, [ready, initialStart]);

  const maxClip = duration > 0 ? Math.min(CLIP_SECONDS, duration) : CLIP_SECONDS;
  const maxStart = Math.max(0, duration - clip);
  const tooShort = ready && duration > 0 && duration <= MIN_CLIP;

  const playFromStart = () => {
    playerRef.current?.seekTo(startRef.current, true);
    playerRef.current?.playVideo();
  };

  // 오른쪽 손잡이 끌기: 1초 = PX_PER_SEC 만큼
  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handleDrag.current = { x: e.clientX, clip: clipRef.current };
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = handleDrag.current;
    if (!d) return;
    const room = Math.max(MIN_CLIP, duration - startRef.current); // 곡 끝을 넘지 않게
    const next = Math.round(Math.min(maxClip, room, Math.max(MIN_CLIP, d.clip + (e.clientX - d.x) / PX_PER_SEC)));
    if (next !== clipRef.current) { clipRef.current = next; setClip(next); }
  };
  const onHandleUp = () => {
    if (!handleDrag.current) return;
    handleDrag.current = null;
    playFromStart();
  };

  const onScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const s = Math.min(maxStart, Math.max(0, Math.round(el.scrollLeft / PX_PER_SEC)));
    startRef.current = s;
    setStart(s);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(playFromStart, 300);
  };

  // 음악 막대 모양 (영상마다 같은 모양이 나오도록 영상 ID로 높이를 정함)
  const bars = useMemo(() => {
    let seed = Array.from(videoId).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    return Array.from({ length: Math.ceil(duration / BAR_EVERY) }, () => 0.25 + rand() * 0.75);
  }, [videoId, duration]);

  const windowWidth = clip * PX_PER_SEC;
  const padWidth = CLIP_SECONDS * PX_PER_SEC; // 끝 부분까지 밀 수 있게 남겨 두는 자리

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
            <b className="text-violet-700 text-base">{fmt(start)} ~ {fmt(Math.min(duration, start + clip))}</b>
            <b className="ml-1.5 text-white bg-violet-600 rounded-full px-2 py-0.5 text-[0.8125rem]">{clip}초</b>
            <span className="text-stone-400"> / 전체 {fmt(duration)}</span>
          </p>
          <div className="relative">
            <div
              ref={stripRef}
              onScroll={onScroll}
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl bg-stone-100 touch-pan-x"
            >
              <div className="flex items-center h-20" style={{ width: duration * PX_PER_SEC + padWidth, paddingRight: padWidth }}>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={`shrink-0 rounded-full mx-[2px] ${i >= start && i < start + clip ? 'bg-violet-600' : 'bg-stone-300'}`}
                    style={{ width: PX_PER_SEC * BAR_EVERY - 4, height: `${Math.round(h * 100)}%` }}
                  />
                ))}
              </div>
            </div>
            {/* 고른 구간 테두리 (왼쪽 고정) + 오른쪽 손잡이로 길이 조절 */}
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 rounded-xl border-[3px] border-violet-600" style={{ width: windowWidth }} />
            <div
              role="slider"
              aria-label="음악 길이"
              aria-valuemin={MIN_CLIP}
              aria-valuemax={maxClip}
              aria-valuenow={clip}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              className="absolute -top-2 -bottom-2 w-11 -ml-[1.375rem] flex items-center justify-center touch-none cursor-ew-resize"
              style={{ left: windowWidth }}
            >
              <span className="w-5 h-14 rounded-full bg-violet-600 shadow-md flex items-center justify-center gap-[3px]">
                <span className="w-[2px] h-6 rounded-full bg-white/80" /><span className="w-[2px] h-6 rounded-full bg-white/80" />
              </span>
            </div>
          </div>
          <p className="text-center text-xs text-stone-500 leading-relaxed">음악 막대를 옆으로 밀어서 <b>시작 위치</b>를 고르고,<br />보라색 <b>손잡이</b>를 끌어서 <b>길이</b>를 줄이거나 늘리세요 (5~30초)</p>
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
