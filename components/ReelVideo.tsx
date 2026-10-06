'use client';

import { useEffect, useRef, useState } from 'react';
import { OverlayLayer, type VideoOverlays } from '@/components/VideoOverlays';
import { useDoubleTap } from '@/lib/double-tap';
import HeartBurst from '@/components/HeartBurst';
import Icon from '@/components/Icon';

// 영상(릴스) 탭의 한 칸: 화면 가득 영상. 화면에 들어오면 재생, 나가면 멈춤.
// 한 번 누르면 소리 켜기/끄기(모든 영상 공통), 두 번 누르면 공감
export default function ReelVideo({ src, poster, overlays, muted, onToggleMute, onDoubleTap }: {
  src: string;
  poster?: string | null;
  overlays?: VideoOverlays | null;
  muted: boolean;
  onToggleMute: () => void;
  onDoubleTap?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [burst, setBurst] = useState(0);
  const [hint, setHint] = useState(0);
  const soundless = !!overlays?.muteOriginal;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.7) {
        video.currentTime = 0;
        video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      } else video.pause();
    }, { threshold: [0, 0.7, 1] });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const tap = useDoubleTap(
    () => { if (!soundless) { onToggleMute(); setHint(Date.now()); } },
    () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } },
  );

  return (
    <div className="absolute inset-0 bg-black [container-type:inline-size]" onClick={tap}>
      <video
        ref={ref}
        src={poster ? src : `${src}#t=0.1`}
        poster={poster || undefined}
        muted={muted || soundless}
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-contain"
      />
      <OverlayLayer overlays={overlays} />
      <HeartBurst show={burst} />
      {hint > 0 && (
        <span key={hint} className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/50 text-white flex items-center justify-center animate-[fadeOut_0.9s_ease-out_forwards] pointer-events-none">
          <Icon name={muted ? 'mute' : 'speaker'} className="w-8 h-8" />
        </span>
      )}
    </div>
  );
}
