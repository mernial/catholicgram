'use client';

import { useEffect, useRef, useState } from 'react';

// 유튜브 IFrame Player API (필요한 부분만)
interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
  destroy: () => void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: {
    videoId: string;
    host?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      onError?: (e: { data: number }) => void;
    };
  }) => YTPlayer;
}
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YTNamespace> | null = null;
const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); if (window.YT) resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return apiPromise;
};

const PLAYING = 1;

// 게시물 보기에서 유튜브 음악을 바로 재생한다.
// 휴대폰이 소리 있는 자동재생을 막으면 소리 없이 먼저 재생하고 '🔊 소리 켜기' 버튼을 크게 보여준다.
export default function YouTubePlayer({ videoId, start = 0, title }: { videoId: string; start?: number; title?: string | null }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [needsSound, setNeedsSound] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    loadYouTubeApi().then(YT => {
      if (cancelled || !holderRef.current) return;
      const el = document.createElement('div');
      holderRef.current.innerHTML = '';
      holderRef.current.appendChild(el);
      playerRef.current = new YT.Player(el, {
        videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, start, loop: 1, playlist: videoId },
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
            if (e.data === PLAYING) {
              setNeedsTap(false);
              if (!e.target.isMuted()) setNeedsSound(false);
            }
          },
          onError: () => setError(true),
        },
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      try { playerRef.current?.destroy(); } catch { /* 이미 정리됨 */ }
      playerRef.current = null;
    };
  }, [videoId, start]);

  const turnOnSound = () => {
    const p = playerRef.current;
    if (!p) return;
    p.unMute();
    p.playVideo();
    setNeedsSound(false);
    setNeedsTap(false);
  };

  return (
    <div className="bg-stone-900">
      <div className="relative w-full aspect-video">
        <div ref={holderRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
        {(needsSound || needsTap) && !error && (
          <button onClick={turnOnSound} className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="bg-white text-stone-900 font-bold text-base rounded-full px-5 py-3 shadow-lg">
              {needsSound ? '🔊 소리 켜기' : '▶ 눌러서 듣기'}
            </span>
          </button>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm text-center p-4">
            이 영상은 앱에서 재생할 수 없어요.<br />(유튜브에서 다른 곳 재생을 막아둔 영상)
          </div>
        )}
      </div>
      <p className="px-4 py-2 text-xs text-white/80 truncate">🎵 {title || '유튜브 음악'}</p>
    </div>
  );
}
