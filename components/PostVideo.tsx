'use client';

import { useEffect, useRef, useState } from 'react';
import { OverlayLayer, type VideoOverlays } from '@/components/VideoOverlays';
import { useDoubleTap } from '@/lib/double-tap';
import HeartBurst from '@/components/HeartBurst';
import Icon from '@/components/Icon';

// 지금 영상 말고 화면의 다른 영상은 모두 소리를 끈다 (소리가 두 번 겹쳐 들리는 것 방지)
const silenceOthers = (keep: HTMLVideoElement, pause = false) => {
  document.querySelectorAll('video').forEach(v => {
    if (v === keep) return;
    v.muted = true; // 각 영상은 volumechange 로 자기 소리 표시를 맞춘다
    if (pause) v.pause();
  });
};

// 피드의 숏폼 영상: 화면에 보이면 소리 없이 자동 재생(반복), 누르면 소리 켜기/끄기
// 배경음악이 있는 영상은 누르면 크게 보기(음악과 함께)로 연다
export default function PostVideo({ src, poster, overlays, hasMusic, musicTitle, onOpen, onDoubleTap }: {
  src: string;
  poster?: string | null;
  overlays?: VideoOverlays | null;
  hasMusic?: boolean;
  musicTitle?: string | null;
  onOpen?: () => void;
  onDoubleTap?: () => void; // 두 번 누르면 공감
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [burst, setBurst] = useState(0);
  const soundless = !!overlays?.muteOriginal;

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

  const onTap = () => {
    if (hasMusic || soundless) { onOpen?.(); return; }
    const video = ref.current;
    if (!video) return;
    if (video.muted) silenceOthers(video); // 다른 영상 소리가 겹치지 않게
    video.muted = !video.muted;
    setMuted(video.muted);
    if (video.paused) video.play().catch(() => {});
  };

  const videoTap = useDoubleTap(onTap, () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } else onTap(); });

  return (
    <div className="relative bg-black [container-type:inline-size]">
      <video
        ref={ref}
        src={poster ? src : `${src}#t=0.1`}
        poster={poster || undefined}
        muted={muted}
        onVolumeChange={e => setMuted(e.currentTarget.muted)}
        loop
        playsInline
        preload="metadata"
        onClick={videoTap}
        className="w-full aspect-[4/5] object-cover"
      />
      <OverlayLayer overlays={overlays} />
      <HeartBurst show={burst} />
      <button onClick={onTap} className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-black/55 text-white text-base flex items-center justify-center" aria-label="소리">
        <Icon name={hasMusic ? 'music' : soundless ? 'play' : muted ? 'mute' : 'speaker'} fill={soundless && !hasMusic} className="w-4 h-4" />
      </button>
      {hasMusic && musicTitle ? (
        <button onClick={onOpen} className="absolute top-2.5 left-2.5 flex items-center gap-1.5 max-w-[75%] text-xs font-bold text-white bg-black/45 backdrop-blur-sm rounded-full px-3 py-1.5">
          <Icon name="music" className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{musicTitle}</span>
        </button>
      ) : (
        <span className="absolute top-2.5 left-2.5 text-[0.75rem] font-bold text-white bg-black/45 rounded-full px-2 py-0.5"><Icon name="film" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />숏폼</span>
      )}
      {onOpen && (
        <button onClick={onOpen} className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/45 text-white text-sm flex items-center justify-center" aria-label="크게 보기"><Icon name="expand" className="w-4 h-4" /></button>
      )}
    </div>
  );
}

// 크게 보기: 꾸민 글자·이모티콘과 함께 재생, 누르면 멈춤/재생
export function VideoViewer({ src, poster, overlays, onDoubleTap }: { src: string; poster?: string | null; overlays?: VideoOverlays | null; onDoubleTap?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const soundless = !!overlays?.muteOriginal;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    silenceOthers(video, true); // 크게 보기를 열면 뒤의 피드 영상은 멈추고 소리 끔
    video.muted = soundless;
    // 소리와 함께 재생이 막히면 소리 없이라도 재생
    video.play().catch(() => { video.muted = true; video.play().catch(() => setPaused(true)); });
  }, [src, soundless]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) { video.play().catch(() => {}); setPaused(false); }
    else { video.pause(); setPaused(true); }
  };

  // 한 번 누르면 멈춤/재생, 두 번 누르면 공감
  const tap = useDoubleTap(toggle, () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } else toggle(); });

  return (
    <div className="relative aspect-[4/5] mx-auto bg-black [container-type:inline-size]" style={{ width: 'min(100%, calc(60dvh * 0.8))' }} onClick={tap}>
      <video ref={ref} src={src} poster={poster || undefined} loop playsInline className="absolute inset-0 w-full h-full object-cover" />
      <OverlayLayer overlays={overlays} />
      {paused && <span className="absolute inset-0 flex items-center justify-center text-white text-5xl bg-black/20"><Icon name="play" fill className="w-14 h-14 drop-shadow" /></span>}
      <HeartBurst show={burst} />
    </div>
  );
}
