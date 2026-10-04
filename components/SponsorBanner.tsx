'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { SponsorBannerData } from '@/lib/sponsor';

// 이번 접속에서 이미 노출을 기록한 배너 (같은 배너를 여러 번 세지 않음)
const viewed = new Set<string>();

export default function SponsorBanner({ banner, variant }: { banner: SponsorBannerData; variant: 'top' | 'feed' }) {
  const ref = useRef<HTMLDivElement>(null);

  // 화면에 실제로 보였을 때 한 번만 노출 기록
  useEffect(() => {
    const el = ref.current;
    if (!el || viewed.has(banner.id)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !viewed.has(banner.id)) {
        viewed.add(banner.id);
        supabase.rpc('record_banner_event', { p_id: banner.id, p_kind: 'view' }).then(() => {});
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [banner.id]);

  const handleClick = () => {
    supabase.rpc('record_banner_event', { p_id: banner.id, p_kind: 'click' }).then(() => {});
    if (banner.link_url) window.open(banner.link_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div ref={ref} className={variant === 'top' ? 'px-4 pt-3 pb-1 bg-white' : 'p-4 bg-white'}>
      <button onClick={handleClick} className="w-full text-left rounded-2xl overflow-hidden border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white shadow-sm hover:shadow transition-shadow">
        {banner.image_url && (
          <img src={banner.image_url} alt={banner.title} className="w-full aspect-[3/1] object-cover bg-stone-100" />
        )}
        <div className="px-3.5 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-stone-900 truncate">{banner.title}</p>
            {banner.description && <p className="text-[11px] text-stone-600 line-clamp-2 mt-0.5">{banner.description}</p>}
            <p className="text-[10px] text-stone-400 mt-1">{banner.sponsor_name}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-px">후원</span>
            {banner.link_url && <span className="text-[11px] font-bold text-amber-700">자세히 ›</span>}
          </div>
        </div>
      </button>
    </div>
  );
}
