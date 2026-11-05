'use client';

// 공간 머리의 '게시물 N' 을 누르면 뜨는 게시글 목록 (운영자 2026-11-05: '게시글의 숫자를 누르면 관련된 게시글 목록을 볼 수 있도록').
// 사진·첫 줄·날짜·기도/공감/댓글 수를 한 줄씩, 전체·사진·영상·글로 나눠 보고, 누르면 그 글 크게 보기(위아래로 밀면 목록 차례대로).
import { useMemo, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';
import { postPlainText, splitPostStickers } from '@/lib/stickers';

export interface PostListItem {
  id: string;
  content: string;
  images?: string[] | null;
  video_url?: string | null;
  video_poster?: string | null;
  created_at: string;
  pray_count?: number;
  like_count?: number;
  music?: string | null;
  visibility?: string | null;
}

type Kind = 'all' | 'photo' | 'video' | 'text';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'photo', label: '사진' },
  { key: 'video', label: '영상' },
  { key: 'text', label: '글' },
];
const kindOf = (p: PostListItem): Exclude<Kind, 'all'> => p.video_url ? 'video' : (p.images?.length || 0) > 0 ? 'photo' : 'text';

const when = (iso: string) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ko-KR', sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function PostList({ posts, commentCounts, mine, visibilityIcon, onOpen }: {
  posts: PostListItem[];
  commentCounts: Record<string, number>;
  mine: boolean;
  visibilityIcon?: (v: string) => { icon: IconName; label: string } | null;
  onOpen: (id: string, queue: string[]) => void;
}) {
  const [kind, setKind] = useState<Kind>('all');
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { all: posts.length, photo: 0, video: 0, text: 0 };
    for (const p of posts) c[kindOf(p)]++;
    return c;
  }, [posts]);
  // 고른 칸이 비게 되면(글을 지움 등) 전체로
  const shown = kind !== 'all' && counts[kind] === 0 ? 'all' : kind;
  const list = shown === 'all' ? posts : posts.filter(p => kindOf(p) === shown);
  const chips = KINDS.filter(k => k.key === 'all' || counts[k.key] > 0);

  if (posts.length === 0) return (
    <div className="p-10 text-center text-stone-500">
      <p className="text-[0.9375rem]">{mine ? '아직 올린 게시물이 없어요.' : '아직 게시물이 없어요.'}</p>
      {mine && <p className="text-[0.8125rem] text-stone-400 mt-1">아래 ＋ 를 눌러 첫 게시물을 올려 보세요.</p>}
    </div>
  );
  const ids = list.map(p => p.id);
  return (
    <div className="flex flex-col">
      {chips.length > 2 && (
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="게시물 종류">
          {chips.map(k => (
            <button key={k.key} role="tab" aria-selected={shown === k.key} onClick={() => setKind(k.key)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[0.875rem] font-bold border ${shown === k.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
              {k.label} {counts[k.key]}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-stone-100">
        {list.map(p => {
          const { text, stickers } = splitPostStickers(p.content);
          const plain = postPlainText(p.content).replace(/\s+/g, ' ').trim();
          const photos = p.images?.length || 0;
          const thumb = p.video_url ? p.video_poster : p.images?.[0];
          const title = plain
            || (p.video_url ? '영상' : photos > 1 ? `사진 ${photos}장` : photos ? '사진' : stickers.length ? `이모티콘 ${stickers[0].label}` : '(글 없음)');
          const vis = p.visibility && p.visibility !== 'public' ? visibilityIcon?.(p.visibility) : null;
          const comments = commentCounts[p.id] || 0;
          return (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id, ids)} className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-stone-50">
                <span className="relative w-16 h-16 rounded-xl overflow-hidden bg-stone-100 shrink-0 flex items-center justify-center">
                  {thumb
                    ? <img loading="lazy" src={thumb} alt="" className="w-full h-full object-cover" />
                    : p.video_url
                    ? <video src={`${p.video_url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    : stickers.length && !text.trim()
                    ? <img loading="lazy" src={stickers[0].src} alt="" className="w-full h-full object-contain p-1.5" />
                    : <Icon name="text" className="w-7 h-7 text-stone-400" />}
                  {p.video_url
                    ? <span className="absolute bottom-1 right-1 text-white drop-shadow" aria-hidden="true"><Icon name="play" fill className="w-4 h-4" /></span>
                    : photos > 1 && <span className="absolute bottom-1 right-1 text-white drop-shadow" aria-hidden="true"><Icon name="stack" fill className="w-4 h-4" /></span>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[0.9375rem] leading-snug line-clamp-2 break-words ${plain ? 'text-stone-900' : 'text-stone-500'}`}>{title}</span>
                  <span className="mt-1 flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-[0.75rem] text-stone-500">
                    <span>{when(p.created_at)}</span>
                    {vis && <span className="inline-flex items-center gap-0.5"><Icon name={vis.icon} className="w-3.5 h-3.5" />{vis.label}</span>}
                    {p.music && <span className="inline-flex items-center" aria-label="음악"><Icon name="music" className="w-3.5 h-3.5" /></span>}
                    {(p.pray_count || 0) > 0 && <span className="inline-flex items-center gap-0.5 text-amber-900 font-bold"><Icon name="pray" className="w-3.5 h-3.5 text-amber-700" />{p.pray_count}<span className="sr-only">명 기도</span></span>}
                    {(p.like_count || 0) > 0 && <span className="inline-flex items-center gap-0.5 text-rose-700 font-bold"><Icon name="heart" className="w-3.5 h-3.5" />{p.like_count}<span className="sr-only">명 공감</span></span>}
                    {comments > 0 && <span className="inline-flex items-center gap-0.5 text-sky-900 font-bold"><Icon name="message" className="w-3.5 h-3.5" />{comments}<span className="sr-only">개 댓글</span></span>}
                  </span>
                </span>
                <span className="text-stone-300 text-xl leading-none shrink-0" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="py-5 text-center text-[0.75rem] text-stone-400">누르면 크게 볼 수 있어요 · 크게 보기에서 위아래로 밀면 다음 글</p>
    </div>
  );
}
