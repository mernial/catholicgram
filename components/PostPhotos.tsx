'use client';

import { useRef, useState } from 'react';
import { useDoubleTap } from '@/lib/double-tap';
import HeartBurst from '@/components/HeartBurst';

// 피드 게시물 사진: 화면 폭 가득, 여러 장이면 옆으로 넘기고 아래 점으로 위치 표시
export default function PostPhotos({ images, onOpen, onDoubleTap, musicTitle, onMusic }: {
  images: string[];
  onOpen: (index: number) => void;
  onDoubleTap?: () => void; // 두 번 누르면 공감
  musicTitle?: string | null;
  onMusic?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const goTo = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const [burst, setBurst] = useState(0);
  const tap = useDoubleTap(
    () => onOpen(index),
    () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } else onOpen(index); },
  );
  return (
    <div className="relative">
      <div
        ref={scroller}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {images.map((img, i) => (
          <img key={i} src={img} alt="게시물 사진" className="w-full shrink-0 snap-center aspect-[4/5] object-cover cursor-pointer bg-stone-100" onClick={tap} />
        ))}
      </div>
      <HeartBurst show={burst} />
      {images.length > 1 && (
        <>
          {/* 좌우 넘김 버튼 */}
          {index > 0 && (
            <button onClick={() => goTo(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-stone-800 text-2xl leading-none shadow-md flex items-center justify-center" aria-label="이전 사진">‹</button>
          )}
          {index < images.length - 1 && (
            <button onClick={() => goTo(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-stone-800 text-2xl leading-none shadow-md flex items-center justify-center" aria-label="다음 사진">›</button>
          )}
          <span className="absolute top-2.5 right-2.5 text-[0.75rem] font-bold text-white bg-black/45 rounded-full px-2 py-0.5">{index + 1}/{images.length}</span>
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {images.map((_, i) => <span key={i} className={`w-2 h-2 rounded-full bg-white shadow ${i === index ? '' : 'opacity-50'}`} />)}
          </div>
        </>
      )}
      {onMusic && (
        <button onClick={onMusic} className="absolute top-2.5 left-2.5 flex items-center gap-1.5 max-w-[75%] text-xs font-bold text-white bg-black/45 backdrop-blur-sm rounded-full px-3 py-1.5">
          <span>🎵</span><span className="truncate">{musicTitle || '음악'}</span>
        </button>
      )}
    </div>
  );
}
