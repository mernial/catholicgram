'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import LoadMore from '@/components/LoadMore';
import { postPlainText } from '@/lib/stickers';

// 내 공간 → '내 댓글': 내가 단 댓글을 최근 순으로 모아 본다 (나만 볼 수 있음).
// 누르면 그 글로 가서 댓글 창의 그 댓글을 보여 준다 (지워진 글이면 댓글 창만).
const PAGE = 30;

interface MyComment { id: string; post_id: string; content: string; created_at: string; parent_id?: string | null }
interface PostInfo { id: string; content: string | null; images: string[] | null; video_poster: string | null; author_name: string | null; user_id: string; is_story?: boolean }

const when = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function MyComments({ userId, onOpen }: { userId: string; onOpen: (postId: string, commentId: string) => void }) {
  const [items, setItems] = useState<MyComment[]>([]);
  const [postsById, setPostsById] = useState<Record<string, PostInfo | null>>({});
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    let q = supabase.from('comments').select('id, post_id, content, created_at, parent_id')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(PAGE);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) { setFailed(true); setLoading(false); setHasMore(false); return; }
    const rows = (data || []) as MyComment[];
    setItems(prev => (before ? [...prev, ...rows] : rows));
    setHasMore(rows.length === PAGE);
    // 댓글을 단 글 (지워졌거나 볼 수 없는 글은 null)
    const ids = Array.from(new Set(rows.map(r => r.post_id)));
    if (ids.length) {
      const { data: ps } = await supabase.from('posts').select('id, content, images, video_poster, author_name, user_id, is_story').in('id', ids);
      const found = Object.fromEntries(((ps || []) as PostInfo[]).map(p => [p.id, p]));
      setPostsById(prev => ({ ...prev, ...Object.fromEntries(ids.map(id => [id, found[id] || null])) }));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="p-10 text-center text-[0.9375rem] text-stone-500">댓글을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>;
  if (!loading && items.length === 0) return (
    <div className="p-10 text-center text-stone-500">
      <p className="text-[0.9375rem]">아직 단 댓글이 없어요.</p>
      <p className="text-[0.8125rem] text-stone-400 mt-1">교우들의 글에 댓글을 달면 여기에 모여요.</p>
    </div>
  );
  return (
    <div className="flex flex-col">
      <ul className="divide-y divide-stone-100">
        {items.map(c => {
          const post = postsById[c.post_id];
          const thumb = post?.images?.[0] || post?.video_poster || null;
          return (
            <li key={c.id}>
              <button onClick={() => onOpen(c.post_id, c.id)} className="w-full px-4 py-3.5 flex items-start gap-3 text-left active:bg-stone-50">
                {thumb
                  ? <img loading="lazy" src={thumb} alt="" className="w-12 h-12 rounded-lg object-cover bg-stone-100 shrink-0" />
                  : <span className="w-12 h-12 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center text-xl shrink-0" aria-hidden="true">💬</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.8125rem] text-stone-500 truncate">
                    {post === undefined ? '…' : post
                      ? <><b className="font-semibold text-stone-700">{post.author_name || '교우'}</b>님의 {post.is_story ? '스토리' : '글'}{post.content ? ` · ${postPlainText(post.content).replace(/\s+/g, ' ')}` : ''}</>
                      : '지워졌거나 볼 수 없는 글'}
                  </span>
                  <span className="block mt-0.5 text-[0.9375rem] text-stone-900 leading-snug line-clamp-2 break-words">
                    {c.parent_id && <span className="text-stone-400 mr-1" aria-label="답글">↳</span>}{c.content}
                  </span>
                  <span className="block mt-1 text-[0.75rem] text-stone-400">{when(c.created_at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > 0 && <LoadMore hasMore={hasMore} loading={loading} onMore={() => { if (!loading) load(items[items.length - 1]?.created_at); }} doneText="댓글을 모두 보셨어요" moreText="댓글 더 보기" />}
      {loading && items.length === 0 && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
    </div>
  );
}
