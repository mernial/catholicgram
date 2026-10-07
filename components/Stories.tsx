'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';

// 스토리: 24시간 뒤 사라지는 사진 한 장 + 짧은 글.
// 게시글(posts)에 is_story 표시로 저장 → 기도·공감·댓글·알림을 다른 게시글과 똑같이 씀.
// 홈 맨 위에 동그라미 줄(내 스토리 → 팔로우한 교우 → 다른 교우), 누르면 화면 가득 보기.

export interface StoryPost { id: string; user_id: string; images?: string[] | null; content?: string | null; created_at: string; pray_count?: number; like_count?: number }
interface Story { id: string; user_id: string; image_url: string; caption: string | null; created_at: string; pray: number; like: number }
interface Author { id: string; baptismal_name: string; avatar_url?: string | null; handle?: string | null; badge_type?: string | null }
export interface StoryUser { id: string; baptismal_name: string; avatar_url?: string; handle?: string; badge_type?: string }

const STORY_MS = 5000;
const SEEN_KEY = 'storySeen';
const loadSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };
const saveSeen = (ids: string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500))); } catch { /* 저장 불가 */ } };
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간`;
};

export default function Stories({ posts, unavailable, me, followingIds, blockedIds, isAdmin, viewerOpen, setViewerOpen, onOpenProfile, onMessage, onNeedLogin, canPost, onPosted, onDelete, myReactions, commentCounts, onReact, onComment }: {
  posts: StoryPost[];                   // 24시간 안의 스토리 (화면이 불러옴)
  unavailable: boolean;                 // SQL 실행 전
  me: { id: string; name: string; avatar?: string | null } | null;
  followingIds: Set<string>;
  blockedIds: Set<string>;
  isAdmin: boolean;
  viewerOpen: boolean;                  // 뒤로가기로 닫을 수 있게 열림 여부는 화면(page)이 들고 있음
  setViewerOpen: (open: boolean) => void;
  onOpenProfile: (userId: string) => void;
  onMessage: (u: StoryUser) => void;
  onNeedLogin: () => void;
  canPost: () => boolean;               // 프로필을 다 만들었는지 확인 (아니면 안내)
  onPosted: () => Promise<void>;        // 올린 뒤 다시 불러오기
  onDelete: (id: string) => Promise<boolean>;
  myReactions: Set<string>;             // `${id}:pray` / `${id}:like`
  commentCounts: Record<string, number>;
  onReact: (id: string, type: 'pray' | 'like') => void;
  onComment: (id: string) => void;
}) {
  const stories: Story[] = useMemo(() => posts
    .filter(p => p.images && p.images.length > 0)
    .map(p => ({ id: p.id, user_id: p.user_id, image_url: p.images![0], caption: p.content || null, created_at: p.created_at, pray: p.pray_count || 0, like: p.like_count || 0 })), [posts]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [seen, setSeen] = useState<string[]>([]);
  const [openMineAfterPost, setOpenMineAfterPost] = useState(false);
  // 올리기
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 보기
  const [pos, setPos] = useState<{ user: number; item: number }>({ user: 0, item: 0 });
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => { setSeen(loadSeen()); }, []);
  // 작성자 이름·사진
  const authorIds = Array.from(new Set(stories.map(st => st.user_id))).sort().join(',');
  useEffect(() => {
    const ids = authorIds ? authorIds.split(',') : [];
    if (ids.length === 0) return;
    supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', ids)
      .then(({ data }) => setAuthors(prev => ({ ...prev, ...Object.fromEntries((data || []).map(p => [p.id, p])) })));
  }, [authorIds]);

  // 사람별로 묶기: 나 → 안 본 스토리가 있는 사람(팔로우 먼저) → 다 본 사람
  const groups = useMemo(() => {
    const byUser = new Map<string, Story[]>();
    stories.filter(s => !blockedIds.has(s.user_id)).forEach(s => { byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]); });
    const list = Array.from(byUser.entries()).map(([userId, items]) => ({ userId, items, unseen: items.some(i => !seen.includes(i.id)), last: items[items.length - 1].created_at }));
    const rank = (g: typeof list[number]) => (g.userId === me?.id ? 0 : g.unseen ? (followingIds.has(g.userId) ? 1 : 2) : 3);
    return list.sort((a, b) => rank(a) - rank(b) || b.last.localeCompare(a.last));
  }, [stories, seen, followingIds, blockedIds, me?.id]);
  const myGroupIndex = groups.findIndex(g => g.userId === me?.id);

  const current = groups[pos.user]?.items[pos.item];

  // 방금 올린 내 스토리를 바로 보여 줌
  useEffect(() => {
    if (!openMineAfterPost || myGroupIndex < 0) return;
    setOpenMineAfterPost(false);
    setPos({ user: myGroupIndex, item: groups[myGroupIndex].items.length - 1 });
    setPaused(false);
    setViewerOpen(true);
  }, [openMineAfterPost, myGroupIndex]);

  // 보는 중인 스토리는 '봤음'으로
  useEffect(() => {
    if (!viewerOpen || !current || seen.includes(current.id)) return;
    const next = [...seen, current.id];
    setSeen(next); saveSeen(next);
  }, [viewerOpen, current?.id]);

  // 5초마다 다음으로 (누르고 있으면 멈춤)
  useEffect(() => {
    if (!viewerOpen || !current) return;
    setProgress(0);
    let elapsed = 0, last = performance.now(), raf = 0;
    const tick = (now: number) => {
      if (!pausedRef.current) elapsed += now - last;
      last = now;
      setProgress(Math.min(1, elapsed / STORY_MS));
      if (elapsed >= STORY_MS) { step(1); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewerOpen, pos.user, pos.item, current?.id]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const open = (userIndex: number) => {
    const g = groups[userIndex];
    if (!g) return;
    const firstUnseen = g.items.findIndex(i => !seen.includes(i.id));
    setPos({ user: userIndex, item: firstUnseen >= 0 ? firstUnseen : 0 });
    setPaused(false);
    setViewerOpen(true);
  };
  const step = (dir: 1 | -1) => {
    setPos(p => {
      const g = groups[p.user];
      if (!g) return p;
      if (dir === 1) {
        if (p.item < g.items.length - 1) return { user: p.user, item: p.item + 1 };
        if (p.user < groups.length - 1) return { user: p.user + 1, item: 0 };
        setViewerOpen(false);
        return p;
      }
      if (p.item > 0) return { user: p.user, item: p.item - 1 };
      if (p.user > 0) return { user: p.user - 1, item: groups[p.user - 1].items.length - 1 };
      return { ...p, item: 0 };
    });
  };

  // --- 올리기 ---
  const pick = () => {
    if (!me) { onNeedLogin(); return; }
    if (!canPost()) return;
    fileRef.current?.click();
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCaption('');
    setDraft({ file, url: URL.createObjectURL(file) });
  };
  const post = async () => {
    if (!draft || !me) return;
    setPosting(true);
    try {
      const compressed = await imageCompression(draft.file, { maxSizeMB: 1, maxWidthOrHeight: 1440, useWebWorker: true });
      const name = `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage.from('community-images').upload(name, compressed);
      if (upErr) throw upErr;
      const url = supabase.storage.from('community-images').getPublicUrl(name).data.publicUrl;
      const { error } = await supabase.from('posts').insert({ user_id: me.id, author_name: me.name, content: caption.trim().slice(0, 100), images: [url], is_story: true });
      if (error) {
        alert(error.code === '42703' || error.code === 'PGRST204' ? '스토리 기능을 준비 중이에요. (관리자: supabase/stories.sql 실행 필요)' : '스토리를 올리지 못했어요.');
        return;
      }
      URL.revokeObjectURL(draft.url);
      setDraft(null);
      await onPosted();
      setOpenMineAfterPost(true);
    } catch {
      alert('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPosting(false);
    }
  };
  const remove = async (s: Story) => {
    if (!window.confirm('이 스토리를 지울까요?')) return;
    setPaused(true);
    const ok = await onDelete(s.id);
    if (!ok) { setPaused(false); return; }
    setViewerOpen(false);
  };

  const avatarOf = (a: { avatar_url?: string | null; baptismal_name?: string } | undefined, size: string) => a?.avatar_url
    ? <img src={a.avatar_url} alt="" className={`${size} rounded-full object-cover`} />
    : <span className={`${size} rounded-full bg-stone-200 text-stone-600 font-serif font-bold flex items-center justify-center`}>{a?.baptismal_name?.[0] || '교'}</span>;

  if (unavailable && !isAdmin) return null; // SQL 실행 전에는 일반 회원에게 숨김

  const meAuthor = me ? { avatar_url: me.avatar, baptismal_name: me.name } : undefined;
  const ring = (unseen: boolean) => unseen ? 'bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600' : 'bg-stone-300';

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-3 py-3 bg-white border-b border-stone-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 내 스토리: 있으면 보기, 없으면 올리기. 작은 ＋ 는 항상 올리기 */}
        <div className="shrink-0 w-[4.5rem] flex flex-col items-center gap-1">
          <div className="relative">
            <button onClick={() => (myGroupIndex >= 0 ? open(myGroupIndex) : pick())} className={`p-[3px] rounded-full ${myGroupIndex >= 0 ? ring(groups[myGroupIndex].unseen) : 'bg-transparent'}`} aria-label="내 스토리">
              <span className="block p-[2px] bg-white rounded-full">{avatarOf(meAuthor, 'w-16 h-16 text-xl')}</span>
            </button>
            <button onClick={pick} className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-blue-500 text-white border-2 border-white flex items-center justify-center" aria-label="스토리 올리기"><Icon name="plus" className="w-3.5 h-3.5" /></button>
          </div>
          <span className="text-[0.75rem] text-stone-700 truncate max-w-full">내 스토리</span>
        </div>
        {groups.map((g, i) => g.userId === me?.id ? null : (
          <button key={g.userId} onClick={() => open(i)} className="shrink-0 w-[4.5rem] flex flex-col items-center gap-1">
            <span className={`p-[3px] rounded-full ${ring(g.unseen)}`}>
              <span className="block p-[2px] bg-white rounded-full">{avatarOf(authors[g.userId], 'w-16 h-16 text-xl')}</span>
            </span>
            <span className={`text-[0.75rem] truncate max-w-full ${g.unseen ? 'text-stone-900' : 'text-stone-500'}`}>{authors[g.userId]?.baptismal_name || '교우'}</span>
          </button>
        ))}
        {groups.filter(g => g.userId !== me?.id).length === 0 && (
          <p className="self-center text-[0.8125rem] text-stone-400 leading-snug">{unavailable ? '스토리 준비 중 (관리자: stories.sql 실행)' : <>오늘의 순간을 스토리로 나눠 보세요<br />24시간 뒤에 사라져요</>}</p>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* 올리기 미리보기 */}
      {draft && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-white">
            <button onClick={() => { URL.revokeObjectURL(draft.url); setDraft(null); }} className="text-[0.9375rem]">취소</button>
            <p className="font-bold">새 스토리</p>
            <span className="w-8" />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center"><img src={draft.url} alt="" className="max-w-full max-h-full object-contain" /></div>
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
            <input value={caption} onChange={e => setCaption(e.target.value.slice(0, 100))} placeholder="한마디 쓰기 (선택)" className="w-full px-4 py-3 rounded-full bg-white/15 text-white placeholder-white/60 text-[0.9375rem] focus:outline-none" />
            <button onClick={post} disabled={posting} className="w-full py-3.5 rounded-full bg-white text-stone-900 font-bold disabled:opacity-50">{posting ? '올리는 중...' : '내 스토리에 올리기'}</button>
            <p className="text-center text-[0.75rem] text-white/60">24시간 뒤에 저절로 사라져요</p>
          </div>
        </div>
      )}

      {/* 보기 */}
      {viewerOpen && current && (() => {
        const g = groups[pos.user];
        const a = authors[g.userId] || (g.userId === me?.id ? { id: me.id, baptismal_name: me.name, avatar_url: me.avatar } : undefined);
        const mine = g.userId === me?.id;
        return (
          <div className="fixed inset-0 z-[90] bg-black flex justify-center">
            <div className="relative w-full max-w-xl h-full select-none"
              onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)}>
              <img src={current.image_url} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
              {/* 위: 진행 막대 + 작성자 */}
              <div className="absolute top-0 inset-x-0 z-10 px-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-8 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex gap-1">
                  {g.items.map((it, i) => (
                    <span key={it.id} className="flex-1 h-[3px] rounded-full bg-white/35 overflow-hidden">
                      <span className="block h-full bg-white" style={{ width: `${i < pos.item ? 100 : i === pos.item ? progress * 100 : 0}%` }} />
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 text-white">
                  <button onClick={() => { setViewerOpen(false); onOpenProfile(g.userId); }} className="flex items-center gap-2 min-w-0">
                    {avatarOf(a, 'w-8 h-8 text-sm')}
                    <span className="font-bold text-[0.9375rem] truncate">{a?.baptismal_name || '교우'}</span>
                    <span className="text-white/70 text-[0.8125rem] shrink-0">{ago(current.created_at)}</span>
                  </button>
                  <span className="flex-1" />
                  {(mine || isAdmin) && <button onClick={() => remove(current)} className="w-10 h-10 flex items-center justify-center" aria-label="스토리 지우기"><Icon name="trash" className="w-5 h-5" /></button>}
                  <button onClick={() => setViewerOpen(false)} className="w-10 h-10 flex items-center justify-center text-3xl leading-none" aria-label="닫기">×</button>
                </div>
              </div>
              {/* 왼쪽·오른쪽 눌러 넘기기 */}
              <button onClick={() => step(-1)} className="absolute left-0 top-24 bottom-28 w-1/3" aria-label="이전 스토리" />
              <button onClick={() => step(1)} className="absolute right-0 top-24 bottom-28 w-2/3" aria-label="다음 스토리" />
              {/* 아래: 한마디 + 메시지 */}
              <div className="absolute bottom-0 inset-x-0 z-10 px-4 pt-10 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/70 to-transparent flex flex-col gap-3">
                {current.caption && <p className="text-white text-[1.0625rem] text-center leading-snug whitespace-pre-wrap drop-shadow">{current.caption}</p>}
                {/* 기도 · 공감 · 댓글 · 메시지 (다른 게시글과 같음) */}
                {(() => {
                  const prayed = myReactions.has(`${current.id}:pray`);
                  const liked = myReactions.has(`${current.id}:like`);
                  const item = 'flex flex-col items-center gap-0.5 text-white text-[0.8125rem] font-semibold min-w-[3.5rem]';
                  return (
                    <div className="flex items-end justify-around" onPointerDown={e => e.stopPropagation()}>
                      <button onClick={() => onReact(current.id, 'pray')} className={item} aria-label="기도"><Icon name="pray" fill={prayed} className={`w-8 h-8 ${prayed ? 'text-amber-300' : ''}`} />{current.pray}</button>
                      <button onClick={() => onReact(current.id, 'like')} className={item} aria-label="공감"><Icon name="heart" fill={liked} className={`w-8 h-8 ${liked ? 'text-rose-500' : ''}`} />{current.like}</button>
                      <button onClick={() => { setViewerOpen(false); onComment(current.id); }} className={item} aria-label="댓글"><Icon name="chat" className="w-8 h-8" />{commentCounts[current.id] || 0}</button>
                      {!mine && me && a && (
                        <button onClick={() => { setViewerOpen(false); onMessage({ id: g.userId, baptismal_name: a.baptismal_name, avatar_url: a.avatar_url || undefined, handle: (a as Author).handle || undefined, badge_type: (a as Author).badge_type || undefined }); }} className={item} aria-label="메시지">
                          <Icon name="send" className="w-7 h-7" />메시지
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
