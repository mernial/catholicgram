'use client';

import { useEffect, useRef, useState } from 'react';

import { loadYouTubeApi, type YTPlayer } from '@/lib/youtube-api';

const PLAYING = 1;
const API_TIMEOUT_MS = 5000;

// 게시물 보기에서 유튜브 음악을 바로 재생한다. 영상은 크게 보여 주지 않고 '음악 막대' 안에 작은 창으로만 둔다
// (유튜브 규칙상 재생기를 완전히 숨길 수는 없음). 사진과 글이 화면의 주인공.
// 휴대폰이 소리 있는 자동재생을 막으면 소리 없이 먼저 재생하고 '🔊 소리 켜기' 버튼을 크게 보여준다.
// clip: 올린 사람이 고른 구간 길이(초). 있으면 그 구간만 반복 재생
export default function YouTubePlayer({ videoId, start = 0, clip, title }: { videoId: string; start?: number; clip?: number; title?: string | null }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [needsSound, setNeedsSound] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [error, setError] = useState<number | null>(null);
  // 유튜브 재생 도구를 불러오지 못하면(광고 차단 등) 기본 재생기로 대신 보여준다
  const [plainEmbed, setPlainEmbed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const apiTimer = setTimeout(() => { if (!cancelled && !playerRef.current) setPlainEmbed(true); }, API_TIMEOUT_MS);
    loadYouTubeApi().then(YT => {
      clearTimeout(apiTimer);
      if (cancelled || !holderRef.current) return;
      const el = document.createElement('div');
      holderRef.current.innerHTML = '';
      holderRef.current.appendChild(el);
      playerRef.current = new YT.Player(el, {
        videoId,
        playerVars: clip
          ? { autoplay: 1, playsinline: 1, rel: 0, start, end: start + clip }
          : { autoplay: 1, playsinline: 1, rel: 0, start, loop: 1, playlist: videoId },
        events: {
          onReady: e => {
            e.target.playVideo();
            // 잠시 뒤에도 재생이 안 되면 자동재생이 막힌 것 → 소리 없이 재생 후 소리 켜기 안내
            fallbackTimer = setTimeout(() => {
              if (cancelled) return;
              if (e.target.getPlayerState() !== PLAYING) {
                e.target.mute();
                e.target.playVideo();
                setTimeout(() => {
                  if (cancelled) return;
                  if (e.target.getPlayerState() === PLAYING) setNeedsSound(true);
                  else setNeedsTap(true);
                }, 1200);
              }
            }, 1500);
          },
          onStateChange: e => {
            // 고른 구간이 끝나면 처음으로 돌아가 반복
            if (clip && e.data === 0) { e.target.seekTo(start, true); e.target.playVideo(); return; }
            setPlaying(e.data === PLAYING);
            if (e.data === PLAYING) {
              setNeedsTap(false);
              if (!e.target.isMuted()) setNeedsSound(false);
            }
          },
          onError: e => setError(e.data),
        },
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      clearTimeout(apiTimer);
      try { playerRef.current?.destroy(); } catch { /* 이미 정리됨 */ }
      playerRef.current = null;
    };
  }, [videoId, start, clip]);

  const turnOnSound = () => {
    const p = playerRef.current;
    if (!p) return;
    p.unMute();
    p.playVideo();
    setNeedsSound(false);
    setNeedsTap(false);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (needsSound || needsTap) { turnOnSound(); return; }
    if (p.getPlayerState() === PLAYING) p.pauseVideo(); else p.playVideo();
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-[#2a1d4f] to-[#1c2357]">
      {/* 작은 영상 창 (앨범 표지처럼) */}
      <div className="relative w-[5.5rem] aspect-video shrink-0 rounded-lg overflow-hidden bg-black">
        <div ref={holderRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
        {plainEmbed && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&autoplay=1${start ? `&start=${start}` : ''}${clip ? `&end=${start + clip}` : ''}`}
            title={title || '음악'}
            allow="autoplay; encrypted-media"
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[0.875rem] font-bold text-white truncate">🎵 {title || '유튜브 음악'}</p>
        {error !== null ? (
          <p className="text-[0.75rem] text-amber-200 leading-snug">{error === 101 || error === 150 || error === 152 ? '이 곡은 유튜브에서만 들을 수 있어요' : '재생하지 못했어요'}</p>
        ) : (needsSound || needsTap) && !plainEmbed ? (
          <button onClick={turnOnSound} className="mt-1 bg-white text-stone-900 font-bold text-[0.875rem] rounded-full px-3.5 py-1.5 shadow">
            {needsSound ? '🔊 소리 켜기' : '▶ 눌러서 듣기'}
          </button>
        ) : (
          <p className="text-[0.75rem] text-white/70">{plainEmbed ? '작은 창을 눌러 재생' : playing ? '재생 중' : '잠시 멈춤'}{clip ? ` · ${clip}초 구간` : ''}</p>
        )}
      </div>
      {error === null && !plainEmbed && !(needsSound || needsTap) && (
        <button onClick={togglePlay} className="w-10 h-10 shrink-0 rounded-full bg-white/15 text-white flex items-center justify-center text-lg" aria-label={playing ? '음악 멈춤' : '음악 재생'}>{playing ? '❚❚' : '▶'}</button>
      )}
      <a
        href={`https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}s` : ''}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-[0.6875rem] font-bold text-white/80 border border-white/30 rounded-full px-2.5 py-1"
        aria-label="유튜브에서 듣기"
      >
        유튜브 ↗
      </a>
    </div>
  );
}
