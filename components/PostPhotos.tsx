'use client';

import { useState } from 'react';
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
  const [burst, setBurst] = useState(0);
  const tap = useDoubleTap(
    () => onOpen(index),
    () => { if (onDoubleTap) { setBurst(Date.now()); onDoubleTap(); } else onOpen(index); },
  );
  return (
    <div className="relative">
      <div
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
