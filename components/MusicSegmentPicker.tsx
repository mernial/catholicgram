'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadYouTubeApi, YT_ENDED, type YTPlayer } from '@/lib/youtube-api';
import { CLIP_SECONDS } from '@/lib/music';

const PX_PER_SEC = 8;           // 음악 막대 1초당 너비
const BAR_EVERY = 1;            // 1초마다 막대 하나

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// 올리는 사람이 음악 막대를 옆으로 밀어서 30초 구간을 고른다.
// 왼쪽의 테두리 상자가 고른 30초이고, 밀기를 멈추면 그 구간을 바로 들려준다.
export default function MusicSegmentPicker({ videoId, title, initialStart = 0, onConfirm, onBack }: {
  videoId: string;
  title: string;
  initialStart?: number;
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
              if (t > startRef.current + CLIP_SECONDS || t < startRef.current - 1) p.seekTo(startRef.current, true);
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

  const maxStart = Math.max(0, duration - CLIP_SECONDS);
  const tooShort = ready && duration > 0 && duration <= CLIP_SECONDS;

  const onScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const s = Math.min(maxStart, Math.max(0, Math.round(el.scrollLeft / PX_PER_SEC)));
    startRef.current = s;
    setStart(s);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      playerRef.current?.seekTo(s, true);
      playerRef.current?.playVideo();
    }, 300);
  };

  const replay = () => {
    playerRef.current?.seekTo(startRef.current, true);
    playerRef.current?.playVideo();
  };

  // 음악 막대 모양 (영상마다 같은 모양이 나오도록 영상 ID로 높이를 정함)
  const bars = useMemo(() => {
    let seed = Array.from(videoId).reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    return Array.from({ length: Math.ceil(duration / BAR_EVERY) }, () => 0.25 + rand() * 0.75);
  }, [videoId, duration]);

  const windowWidth = CLIP_SECONDS * PX_PER_SEC;

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
        <p className="text-center text-sm text-stone-500 py-4">30초보다 짧은 곡이라 전체가 재생돼요.</p>
      ) : (
        <>
          <p className="text-center text-sm text-stone-700">
            <b className="text-violet-700 text-base">{fmt(start)} ~ {fmt(Math.min(duration, start + CLIP_SECONDS))}</b>
            <span className="text-stone-400"> / 전체 {fmt(duration)}</span>
          </p>
          <div className="relative">
            <div
              ref={stripRef}
              onScroll={onScroll}
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl bg-stone-100 touch-pan-x"
            >
              <div className="flex items-center h-20" style={{ width: duration * PX_PER_SEC + windowWidth, paddingRight: windowWidth }}>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={`shrink-0 rounded-full mx-[2px] ${i >= start && i < start + CLIP_SECONDS ? 'bg-violet-600' : 'bg-stone-300'}`}
                    style={{ width: PX_PER_SEC * BAR_EVERY - 4, height: `${Math.round(h * 100)}%` }}
                  />
                ))}
              </div>
            </div>
            {/* 고른 30초 테두리 (왼쪽 고정) */}
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 rounded-xl border-[3px] border-violet-600" style={{ width: windowWidth }} />
          </div>
          <p className="text-center text-xs text-stone-500">👈 음악 막대를 손가락으로 밀어서 들려줄 30초를 고르세요</p>
          <button onClick={replay} className="self-center text-xs px-3 py-1.5 rounded-full border border-stone-300 text-stone-600">▶ 이 구간 다시 듣기</button>
        </>
      )}

      <button
        onClick={() => onConfirm(tooShort ? 0 : start, tooShort ? undefined : CLIP_SECONDS)}
        disabled={!ready || failed}
        className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40"
      >
        이 구간으로 올리기
      </button>
    </div>
  );
}
