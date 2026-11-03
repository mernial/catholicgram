'use client';

// 대화방의 지난 사진·동영상 모아 보기 (1:1·단체방 공통, 카카오톡 '사진·동영상' 서랍처럼)
// 최근 것부터 달마다 묶어 바둑판으로. 사진을 누르면 크게 보며 넘기기(PhotoZoom — 저장·공유 단추), 동영상은 여기서 재생.
// 휴대폰 뒤로가기는 맨 위 것(사진·동영상 크게 보기 → 이 창)만 닫는다 — 크게 보기도 이 창 안에서 열어 순서가 꼬이지 않게.
import { useMemo, useState } from 'react';
import { useBackLayer } from '@/lib/back-layers';
import { isVideoUrl } from '@/lib/upload';
import { mediaMenuActions } from '@/lib/save-media';
import Icon from '@/components/Icon';
import PhotoZoom from '@/components/PhotoZoom';

export interface GalleryItem { key: string; url: string; video: boolean; at: string; messageId: string }
type MediaMessage = { id: string | number; image_url?: string | null; images?: string[] | null; created_at: string };

/** 메시지들 → 사진·동영상 (최근 것부터, 묶음 사진은 한 장씩) */
export function galleryItems(rows: MediaMessage[]): GalleryItem[] {
  const out: GalleryItem[] = [];
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).forEach(m => {
    const urls = m.images && m.images.length ? m.images : m.image_url ? [m.image_url] : [];
    urls.forEach((url, i) => out.push({ key: `${m.id}:${i}`, url, video: isVideoUrl(url), at: m.created_at, messageId: String(m.id) }));
  });
  return out;
}

const monthOf = (iso: string) => {
  const d = new Date(iso);
  return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월` };
};

export default function ChatGallery({ title, items, loading, onClose }: {
  title: string;                       // '○○님과의 대화' · 방 이름
  items: GalleryItem[];
  loading?: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [playing, setPlaying] = useState<GalleryItem | null>(null);
  const [zoom, setZoom] = useState<{ urls: string[]; index: number } | null>(null);
  useBackLayer(true, onClose);
  useBackLayer(!!playing, () => setPlaying(null));
  useBackLayer(!!zoom, () => setZoom(null));
  const photos = items.filter(x => !x.video);
  const videos = items.length - photos.length;
  const shown = filter === 'all' ? items : items.filter(x => (filter === 'video' ? x.video : !x.video));
  const months = useMemo(() => {
    const groups: { key: string; label: string; list: GalleryItem[] }[] = [];
    shown.forEach(x => {
      const m = monthOf(x.at);
      const last = groups[groups.length - 1];
      if (last && last.key === m.key) last.list.push(x); else groups.push({ ...m, list: [x] });
    });
    return groups;
  }, [shown]);
  const open = (x: GalleryItem) => {
    if (x.video) { setPlaying(x); return; }
    setZoom({ urls: photos.map(p => p.url), index: Math.max(0, photos.findIndex(p => p.key === x.key)) });
  };
  const chip = (key: typeof filter, label: string) => (
    <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
      className={`px-3.5 h-8 rounded-full text-[0.875rem] font-bold border ${filter === key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'}`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-xl tablet:max-w-3xl h-[92dvh] tablet:h-[88dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()} role="dialog" aria-label="사진·동영상 모아 보기">
        <div className="shrink-0 px-5 pt-5 pb-3 flex items-start justify-between gap-2 border-b border-stone-100">
          <div className="min-w-0">
            <h3 className="font-bold text-[1.125rem] text-stone-900 flex items-center gap-1.5"><Icon name="image" className="w-5 h-5 text-amber-600" />사진·동영상</h3>
            <p className="text-[0.8125rem] text-stone-500 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 -mt-1 shrink-0 flex items-center justify-center text-stone-500 text-2xl" aria-label="닫기">×</button>
        </div>
        {items.length > 0 && (
          <div className="shrink-0 px-4 py-2.5 flex gap-2 border-b border-stone-100">
            {chip('all', `전체 ${items.length}`)}
            {chip('photo', `사진 ${photos.length}`)}
            {videos > 0 && chip('video', `동영상 ${videos}`)}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {loading && items.length === 0 && <p className="text-center text-stone-400 text-sm py-16">불러오는 중...</p>}
          {!loading && items.length === 0 && (
            <div className="text-center text-stone-500 py-16 px-8">
              <Icon name="image" className="w-10 h-10 mx-auto text-stone-300 mb-2" />
              <p className="text-[0.9375rem]">아직 주고받은 사진·동영상이 없어요.</p>
            </div>
          )}
          {months.map(g => (
            <section key={g.key} aria-label={g.label}>
              <h4 className="sticky top-0 z-[1] bg-white/95 backdrop-blur px-4 py-2 text-[0.8125rem] font-bold text-stone-600">{g.label}</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 tablet:grid-cols-6 gap-0.5 px-0.5">
                {g.list.map(x => (
                  <button key={x.key} type="button" onClick={() => open(x)} className="relative aspect-square bg-stone-200 overflow-hidden"
                    aria-label={`${x.video ? '동영상' : '사진'} · ${new Date(x.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} · 눌러서 ${x.video ? '재생' : '크게 보기'}`}>
                    {x.video
                      ? <video src={`${x.url}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                      : <img loading="lazy" src={x.url} alt="" className="w-full h-full object-cover" />}
                    {x.video && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><Icon name="play" fill className="w-4 h-4 ml-0.5" /></span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {items.length > 0 && <p className="text-center text-[0.75rem] text-stone-400 py-4">사진을 누르면 크게 보고 저장·공유할 수 있어요</p>}
        </div>
      </div>

      {zoom && <div onClick={e => e.stopPropagation()}><PhotoZoom images={zoom.urls} start={zoom.index} saveable onClose={() => setZoom(null)} /></div>}

      {/* 동영상 재생 */}
      {playing && (
        <div className="fixed inset-0 z-[97] bg-black flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="동영상 보기">
          <div className="shrink-0 flex items-center justify-between px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
            <span className="text-white/80 text-[0.875rem] px-2">{new Date(playing.at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <button onClick={() => setPlaying(null)} className="w-11 h-11 flex items-center justify-center text-white text-3xl" aria-label="닫기">×</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <video key={playing.url} src={playing.url} controls autoPlay playsInline className="max-w-full max-h-full" />
          </div>
          <div className="shrink-0 flex justify-center gap-3 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {mediaMenuActions({ image_url: playing.url }, () => {}).map(a => (
              <button key={a.label} type="button" onClick={a.run} className="px-5 h-11 rounded-full bg-black/75 ring-1 ring-white/50 text-white font-bold text-[0.9375rem]">{a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
