'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { SponsorBannerData } from '@/lib/sponsor';

// 이번 접속에서 이미 노출을 기록한 배너 (같은 배너를 여러 번 세지 않음)
const viewed = new Set<string>();

export default function SponsorBanner({ banner, variant }: { banner: SponsorBannerData; variant: 'top' | 'feed' }) {
  const ref = useRef<HTMLDivElement>(null); // 피드형은 article 에 같은 ref 를 붙여 노출을 잰다

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

  // 피드: 일반 게시글과 같은 모양의 '광고 게시물'
  if (variant === 'feed') {
    return (
      <article ref={ref as unknown as React.RefObject<HTMLElement>} className="p-4 sm:p-5 bg-white flex flex-col gap-3">
        <button onClick={handleClick} className="flex items-center gap-2.5 text-left">
          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-xs font-serif font-bold shrink-0">
            {banner.sponsor_name[0]}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-stone-800 truncate">{banner.sponsor_name}</span>
            <span className="text-[11px] text-stone-400">광고</span>
          </div>
        </button>

        {banner.title && <p className="text-stone-800 text-[13.5px] leading-relaxed"><b>{banner.title}</b>{banner.description && <><br />{banner.description}</>}</p>}

        {banner.image_url && (
          <button onClick={handleClick} className="rounded-xl overflow-hidden border border-stone-100">
            <img src={banner.image_url} alt={banner.title} className="w-full aspect-square object-cover bg-stone-100" />
          </button>
        )}

        {banner.link_url && (
          <button onClick={handleClick} className="w-full flex items-center justify-between bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-800 transition-colors">
            자세히 보기
            <span className="text-stone-400">›</span>
          </button>
        )}
      </article>
    );
  }

  // 홈 맨 위 배너
  return (
    <div ref={ref} className="px-4 pt-3 pb-1 bg-white">
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
            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-px">광고</span>
            {banner.link_url && <span className="text-[11px] font-bold text-amber-700">자세히 ›</span>}
          </div>
        </div>
      </button>
    </div>
  );
}
