'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 사진만 화면 가득 크게 보기 (단추·글씨는 어두운 바탕이라 흰 사진 위에서도 보임): 아무 데나 한 번 누르면 닫힌다. 여러 장이면 옆으로 밀거나 ‹ › 로 넘긴다.
export default function PhotoZoom({ images, start = 0, onClose }: { images: string[]; start?: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const scroller = useRef<HTMLDivElement>(null);
  const goTo = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  // 처음 연 사진 자리로 바로 이동 (움직이는 모습 없이)
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);
  // 컴퓨터: Esc 로 닫기, 화살표로 넘기기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(Math.min(images.length - 1, index + 1));
      else if (e.key === 'ArrowLeft') goTo(Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, index, onClose]);

  const many = images.length > 1;
  return (
    <div className="fixed inset-0 z-[96] bg-black animate-fade-in select-none" onClick={onClose} role="dialog" aria-label="사진 크게 보기">
      <div
        ref={scroller}
        className="h-full flex overflow-x-auto snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: 'pan-x pinch-zoom' }} // 옆으로 넘기기·두 손가락 확대만 (뒤 화면이 위아래로 움직이지 않게)
        onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {images.map((src, i) => (
          <div key={i} className="w-full h-full shrink-0 snap-center flex items-center justify-center">
            <img src={src} alt={many ? `사진 ${i + 1}/${images.length}` : '사진'} className="max-w-full max-h-full object-contain" draggable={false} />
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 text-sm font-bold text-white bg-black/55 rounded-full px-3 py-1">{index + 1} / {images.length}</span>
          {index > 0 && (
            <button onClick={e => { e.stopPropagation(); goTo(index - 1); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white text-3xl leading-none flex items-center justify-center" aria-label="이전 사진">‹</button>
          )}
          {index < images.length - 1 && (
            <button onClick={e => { e.stopPropagation(); goTo(index + 1); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 text-white text-3xl leading-none flex items-center justify-center" aria-label="다음 사진">›</button>
          )}
        </>
      )}
      <button onClick={onClose} className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 w-11 h-11 rounded-full bg-black/55 text-white text-3xl leading-none flex items-center justify-center" aria-label="닫기">×</button>
      <p className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center pointer-events-none"><span className="text-xs text-white/80 bg-black/45 rounded-full px-3 py-1">사진을 누르면 닫혀요</span></p>
    </div>
  );
}
