'use client';

import { useEffect, useRef, useState } from 'react';

// 피드의 숏폼 영상: 화면에 보이면 소리 없이 자동 재생(반복), 누르면 소리 켜기/끄기
export default function PostVideo({ src, poster, onOpen }: { src: string; poster?: string | null; onOpen?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.6) video.play().catch(() => {});
      else video.pause();
    }, { threshold: [0, 0.6, 1] });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const toggleSound = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (video.paused) video.play().catch(() => {});
  };

  return (
    <div className="relative bg-black">
      <video
        ref={ref}
        src={poster ? src : `${src}#t=0.1`}
        poster={poster || undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onClick={toggleSound}
        className="w-full aspect-[4/5] object-cover"
      />
      <button onClick={toggleSound} className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-black/55 text-white text-base flex items-center justify-center" aria-label={muted ? '소리 켜기' : '소리 끄기'}>
        {muted ? '🔇' : '🔊'}
      </button>
      <span className="absolute top-2.5 left-2.5 text-[0.75rem] font-bold text-white bg-black/45 rounded-full px-2 py-0.5">🎬 숏폼</span>
      {onOpen && (
        <button onClick={onOpen} className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/45 text-white text-sm flex items-center justify-center" aria-label="크게 보기">⛶</button>
      )}
    </div>
  );
}
