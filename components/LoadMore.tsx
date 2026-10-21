'use client';

import { useEffect, useRef } from 'react';

// 목록 맨 아래: 화면에 가까워지면 저절로 더 불러오고, 단추로도 누를 수 있게
export default function LoadMore({ hasMore, loading, onMore, doneText = '모든 글을 다 보셨어요' }: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  doneText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!hasMore || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onMoreRef.current(); }, { rootMargin: '800px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);
  if (!hasMore) return <p className="py-8 text-center text-sm text-stone-400">{doneText}</p>;
  return (
    <div ref={ref} className="py-6 flex justify-center">
      <button onClick={onMore} disabled={loading} className="px-5 py-2.5 rounded-full border border-stone-300 bg-white text-[0.9375rem] font-bold text-stone-700 disabled:opacity-60">
        {loading ? '불러오는 중...' : '글 더 보기'}
      </button>
    </div>
  );
}
