'use client';

import { useEffect, useRef, useState } from 'react';
import { OverlayLayer, type VideoOverlays } from '@/components/VideoOverlays';
import { useDoubleTap } from '@/lib/double-tap';
import HeartBurst from '@/components/HeartBurst';
import Icon from '@/components/Icon';

// 영상(릴스) 탭의 한 칸: 화면 가득 영상. 화면에 들어오면 저절로 처음부터 재생, 나가면 멈춤.
//  - 소리와 함께 재생이 막히면(휴대폰 정책) 소리 없이라도 재생, 그것도 막히면(절전 모드 등) ▶ 표시 → 누르면 재생
//  - 한 번 누르면 멈춤/재생, 두 번 누르면 공감, 오른쪽 아래 단추로 소리 켜기/끄기(모든 영상 공통)
//  - 바로 다음(가까운) 영상은 미리 받아 두어 내리자마자 이어서 재생
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
  const [paused, setPaused] = useState(true);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  const [silent, setSilent] = useState(true); // 지금 실제로 소리가 꺼져 있는지 (정책 때문에 꺼졌을 수도)
  const soundless = !!overlays?.muteOriginal;
  const wantMuted = muted || soundless;
  const wantMutedRef = useRef(wantMuted);
  wantMutedRef.current = wantMuted;

  // 재생: 원하는 소리 상태로 → 막히면 소리 없이 → 그것도 막히면 ▶ 표시 (누르면 재생)
  const start = (video: HTMLVideoElement) => {
    video.muted = wantMutedRef.current;
    setSilent(video.muted);
    video.play().catch(() => {
      if (video.muted) return;
      video.muted = true;
      setSilent(true);
      video.play().catch(() => {});
    });
  };

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onScreen = new IntersectionObserver(([entry]) => {
      const on = entry.intersectionRatio >= 0.6;
      setVisible(on);
      if (on) { video.currentTime = 0; start(video); } else video.pause();
    }, { threshold: [0, 0.6, 1] });
    // 위아래 한 화면 안에 들어오면 미리 받아 둔다
    const nearScreen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { rootMargin: '100% 0px 100% 0px' });
    onScreen.observe(video);
    nearScreen.observe(video);
    return () => { onScreen.disconnect(); nearScreen.disconnect(); };
  }, []);

  // 다른 영상에서 소리를 켜고 끈 것을 따라간다 (보고 있는 영상만)
  useEffect(() => {
    const video = ref.current;
    if (!video || !visible) return;
    video.muted = wantMuted;
    setSilent(wantMuted);
  }, [wantMuted, visible]);

  const togglePlay = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) start(video); // 누른 김에 재생하므로 소리와 함께도 된다
    else video.pause();
  };
  const tap = useDoubleTap(togglePlay, () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (soundless) return;
    const video = ref.current;
    const next = !silent;
    // 누른 그 자리에서 바로 바꿔야 휴대폰이 소리를 허락한다
    wantMutedRef.current = next;
    if (video) { video.muted = next; setSilent(next); if (video.paused) start(video); }
    if (next !== muted) onToggleMute();
  };

  return (
    <div className="absolute inset-0 bg-black [container-type:inline-size]" onClick={tap}>
      <video
        ref={ref}
        src={poster ? src : `${src}#t=0.1`}
        poster={poster || undefined}
        muted={wantMuted}
        loop
        playsInline
        preload={near ? 'auto' : poster ? 'none' : 'metadata'} // 멀리 있는 영상은 표지만 (전송량 절약)
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onVolumeChange={e => setSilent(e.currentTarget.muted)}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <OverlayLayer overlays={overlays} />
      <HeartBurst show={burst} />
      {visible && paused && (
        <span className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-black/45 text-white flex items-center justify-center pointer-events-none" aria-hidden="true">
          <Icon name="play" fill className="w-10 h-10 ml-1" />
        </span>
      )}
      {!soundless && (
        <button onClick={toggleSound} className="absolute left-3 top-[calc(3.25rem+env(safe-area-inset-top))] z-10 h-10 px-3 rounded-full bg-black/50 text-white text-[0.875rem] font-bold flex items-center gap-1.5"
          aria-label={silent ? '소리 켜기' : '소리 끄기'}>
          <Icon name={silent ? 'mute' : 'speaker'} className="w-5 h-5" />{silent ? '소리 켜기' : '소리 끄기'}
        </button>
      )}
    </div>
  );
}
