'use client';

import { useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import RoleBadge from '@/components/RoleBadge';
import HashtagText from '@/components/HashtagText';
import { extractHashtags, popularHashtags } from '@/lib/hashtags';
import { InterestEvent, loadInterests, recordInterest, removeSearch } from '@/lib/interests';
import Icon from '@/components/Icon';

// 탐색 탭: 사람 / 게시글 / #해시태그 검색 + 내 활동 기반 맞춤 추천
//
// 추천 방식 (모두 이 기기에서 계산)
//  - 관심 태그 점수: 내가 쓴 글의 태그 3점, 기도·공감한 글 / 댓글 단 글의 태그 2점,
//    누른 태그·#검색 1.5점 (최근일수록 높게)
//  - 탐색 피드(사진 바둑판): 내가 팔로우한 교우의 글 + 관심 태그·검색어와 겹치는 글 + 반응 많은 최근 글
//    (사진 게시물을 먼저, 내 글은 제외, 이미 반응한 글은 뒤로)
//  - 추천 교우: 관심 태그가 같은 글쓴이 + 내가 팔로우하는 교우가 팔로우하는 사람 + 인증된 성직자·수도자

export interface ExplorePost {
  id: string;
  content: string;
  images: string[];
  is_video?: boolean;
  pray_count: number;
  like_count: number;
  author_name: string;
  user_id: string;
  created_at: string;
  avatar_url?: string;
  handle?: string;
  badge_type?: string;
}

interface Person { id: string; baptismal_name: string; handle?: string; avatar_url?: string; badge_type?: string }
interface RecPerson extends Person { reason: string; score: number }

const DAY = 24 * 3600 * 1000;

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
};

// 서버 검색에 넣으면 문법이 깨지는 문자 제거
const safeForFilter = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim();

function Avatar({ p, size = 'w-10 h-10' }: { p: { avatar_url?: string; baptismal_name?: string; author_name?: string }; size?: string }) {
  const name = p.baptismal_name || p.author_name || '교';
  return p.avatar_url
    ? <img src={p.avatar_url} alt="" className={`${size} rounded-full object-cover border border-stone-200 shrink-0`} />
    : <div className={`${size} rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-sm font-bold shrink-0`}>{name[0]}</div>;
}

function Chip({ label, onClick, onRemove, active }: { label: string; onClick: () => void; onRemove?: () => void; active?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full border text-sm ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-stone-200 text-stone-700'}`}>
      <button onClick={onClick} className="pl-3 pr-2 py-1.5">{label}</button>
      {onRemove && <button onClick={onRemove} className="pr-2.5 pl-0.5 py-1.5 text-stone-400" aria-label="삭제">×</button>}
    </span>
  );
}

export default function ExploreTab({ user, posts, blockedIds, initialQuery, onOpenProfile, onOpenPost, onRequireLogin }: {
  user: User | null;
  posts: ExplorePost[];
  blockedIds: Set<string>;
  initialQuery: string;
  onOpenProfile: (userId: string) => void;
  onOpenPost: (postId: string, queue: string[]) => void; // queue: 위로 밀면 이어서 볼 추천 순서
  onRequireLogin: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState<'all' | 'people' | 'posts' | 'tags'>('all');
  const [events, setEvents] = useState<InterestEvent[]>([]);
  const [reacted, setReacted] = useState<Set<string>>(new Set());
  const [commented, setCommented] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [acceptedFollowing, setAcceptedFollowing] = useState<Set<string>>(new Set());
  const [searchFocused, setSearchFocused] = useState(false);
  const [fofCounts, setFofCounts] = useState<Map<string, number>>(new Map());
  const [fofProfiles, setFofProfiles] = useState<Person[]>([]);

  const [now] = useState(() => Date.now()); // 추천 계산 기준 시각 (탭을 열 때 한 번)
  const visiblePosts = useMemo(() => posts.filter(p => !blockedIds.has(p.user_id)), [posts, blockedIds]);

  // 바깥(해시태그 누르기 등)에서 검색어가 바뀌면 반영
  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);

  // 내 활동 불러오기 (추천 계산용)
  useEffect(() => {
    loadInterests(user?.id).then(setEvents);
    if (!user) return;
    (async () => {
      const [r, c, f] = await Promise.all([
        supabase.from('post_reactions').select('post_id').eq('user_id', user.id).limit(500),
        supabase.from('comments').select('post_id').eq('user_id', user.id).limit(500),
        supabase.from('follows').select('following_id, status').eq('follower_id', user.id),
      ]);
      setReacted(new Set((r.data || []).map(x => x.post_id)));
      setCommented(new Set((c.data || []).map(x => x.post_id)));
      const following = (f.data || []).map(x => x.following_id as string);
      setFollowingIds(new Set(following));
      setAcceptedFollowing(new Set((f.data || []).filter(x => (x as { status?: string }).status !== 'pending').map(x => x.following_id as string)));
      if (following.length === 0) return;
      // 내가 팔로우하는 교우들이 팔로우하는 사람
      const { data: fof } = await supabase.from('follows').select('following_id')
        .in('follower_id', following).eq('status', 'accepted').limit(500);
      const counts = new Map<string, number>();
      (fof || []).forEach(x => counts.set(x.following_id, (counts.get(x.following_id) || 0) + 1));
      setFofCounts(counts);
      const ids = Array.from(counts.keys()).filter(id => id !== user.id && !following.includes(id)).slice(0, 30);
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type').in('id', ids);
        setFofProfiles((profiles || []) as Person[]);
      }
    })();
  }, [user]);

  // --- 검색 ---
  const term = query.trim();
  const isTagSearch = term.startsWith('#');
  const tagTerm = term.replace(/^#/, '').toLowerCase();

  useEffect(() => {
    if (!term || isTagSearch) { setPeople([]); return; }
    const t = setTimeout(async () => {
      const q = safeForFilter(term.replace(/^@/, ''));
      if (!q) return;
      const { data } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type')
        .or(`baptismal_name.ilike.%${q}%,handle.ilike.%${q}%`).limit(20);
      setPeople(((data || []) as Person[]).filter(p => !blockedIds.has(p.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [term, isTagSearch, blockedIds]);

  const matchedPosts = useMemo(() => {
    if (!term) return [];
    if (isTagSearch) {
      return visiblePosts.filter(p => extractHashtags(p.content).some(t => t === tagTerm || t.startsWith(tagTerm)));
    }
    const q = term.toLowerCase();
    return visiblePosts.filter(p => p.content?.toLowerCase().includes(q) || p.author_name?.toLowerCase().includes(q));
  }, [term, isTagSearch, tagTerm, visiblePosts]);

  const allTags = useMemo(() => popularHashtags(visiblePosts.map(p => p.content), 200), [visiblePosts]);
  const matchedTags = useMemo(() => tagTerm ? allTags.filter(t => t.tag.includes(tagTerm)).slice(0, 20) : [], [allTags, tagTerm]);

  // 탐색에서 글을 열면 그 글의 태그를 관심사로 기록 (다음 추천에 반영)
  const openPost = (post: ExplorePost) => {
    extractHashtags(post.content).slice(0, 3).forEach(t => { recordInterest(user?.id, 'tag', t); });
    // 검색 중이면 검색 결과 순서, 아니면 추천 순서대로 이어서 보기
    const queue = term ? matchedPosts.map(p => p.id) : exploreFeed.map(s => s.post.id);
    onOpenPost(post.id, queue);
  };

  const runSearch = (value: string) => {
    setQuery(value);
    setFilter('all');
    const v = value.trim();
    if (!v) return;
    recordInterest(user?.id, v.startsWith('#') ? 'tag' : 'search', v.startsWith('#') ? v.slice(1).toLowerCase() : v)
      .then(() => loadInterests(user?.id).then(setEvents));
  };

  // --- 맞춤 추천 ---

  const { tagWeights, keywords } = useMemo(() => {
    const w = new Map<string, number>();
    const add = (tag: string, v: number) => w.set(tag, (w.get(tag) || 0) + v);
    visiblePosts.forEach(p => {
      if (user && p.user_id === user.id) extractHashtags(p.content).forEach(t => add(t, 3));
      if (reacted.has(p.id)) extractHashtags(p.content).forEach(t => add(t, 2));
      if (commented.has(p.id)) extractHashtags(p.content).forEach(t => add(t, 2));
    });
    const kw: string[] = [];
    events.forEach((e, i) => {
      const decay = Math.pow(0.97, i);
      if (e.kind === 'tag') add(e.value.toLowerCase(), 1.5 * decay);
      else if (e.value.startsWith('#')) add(e.value.slice(1).toLowerCase(), 1.5 * decay);
      else if (kw.length < 10 && e.value.length >= 2) kw.push(e.value.toLowerCase());
    });
    return { tagWeights: w, keywords: kw };
  }, [visiblePosts, user, reacted, commented, events]);


  // 탐색 피드: 시간 순서가 아니라 '내가 좋아할 만한 글' 순서 (사진 게시물 우선)
  //  - 팔로우한 교우, 관심 태그·검색어, 내가 자주 반응한 글쓴이, 반응 많은 글
  //  - 오래된 글도 관심사와 맞으면 올라오고, 날마다 순서가 조금씩 바뀜
  const exploreFeed = useMemo(() => {
    const authorAffinity = new Map<string, number>();
    visiblePosts.forEach(p => {
      if (reacted.has(p.id) || commented.has(p.id)) authorAffinity.set(p.user_id, (authorAffinity.get(p.user_id) || 0) + 1);
    });
    const daySeed = Math.floor(now / DAY);
    const jitter = (id: string) => {
      let h = daySeed;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return (h % 1000) / 1000 * 0.8;
    };
    const scored = visiblePosts
      .filter(p => !(user && p.user_id === user.id))
      .map(p => {
        const tags = extractHashtags(p.content);
        const tagScore = tags.reduce((sum, t) => sum + (tagWeights.get(t) || 0), 0);
        const text = (p.content || '').toLowerCase();
        const kwScore = keywords.filter(k => text.includes(k)).length;
        const ageDays = (now - new Date(p.created_at).getTime()) / DAY;
        const fresh = Math.max(0, 0.6 - ageDays / 30);                       // 새 글은 아주 조금만 우대
        const popular = Math.log1p((p.pray_count || 0) + (p.like_count || 0)) * 0.6;
        const followed = acceptedFollowing.has(p.user_id);
        const seen = reacted.has(p.id) || commented.has(p.id);
        const affinity = Math.min(authorAffinity.get(p.user_id) || 0, 3) * 1.2;
        const score = (followed ? 3 : 0) + Math.min(tagScore, 6) + kwScore + affinity + fresh + popular + jitter(p.id) - (seen ? 2.5 : 0);
        return { post: p, followed, hasPhoto: (p.images?.length || 0) > 0, score };
      })
      .sort((a, b) => b.score - a.score);
    const photos = scored.filter(s => s.hasPhoto);
    const texts = scored.filter(s => !s.hasPhoto);
    // 사진 게시물을 먼저, 사진이 적으면 글 게시물로 채움
    return [...photos, ...texts.slice(0, Math.max(0, 18 - photos.length))].slice(0, 60);
  }, [visiblePosts, user, reacted, commented, tagWeights, keywords, now, acceptedFollowing]);

  const recommendedPeople = useMemo(() => {
    if (!user) return [];
    const cands = new Map<string, RecPerson>();
    const upsert = (p: Person, add: number, reason: string) => {
      if (p.id === user.id || followingIds.has(p.id) || blockedIds.has(p.id)) return;
      const cur = cands.get(p.id);
      if (cur) { cur.score += add; if (add > 1) cur.reason = reason; }
      else cands.set(p.id, { ...p, score: add, reason });
    };
    visiblePosts.forEach(p => {
      const author: Person = { id: p.user_id, baptismal_name: p.author_name, handle: p.handle, avatar_url: p.avatar_url, badge_type: p.badge_type };
      const shared = extractHashtags(p.content).filter(t => tagWeights.has(t));
      if (shared.length > 0) upsert(author, Math.min(3, shared.length * 1.5), `#${shared[0]} 관심사가 같아요`);
      if (p.badge_type) upsert(author, 0.8, '인증된 성직자·수도자예요');
    });
    fofProfiles.forEach(p => {
      const n = fofCounts.get(p.id) || 0;
      if (n > 0) upsert(p, n * 1.5, `팔로우하는 교우 ${n}명이 팔로우해요`);
    });
    return Array.from(cands.values()).sort((a, b) => b.score - a.score).slice(0, 10);
  }, [user, visiblePosts, tagWeights, followingIds, blockedIds, fofProfiles, fofCounts]);

  const recentSearches = useMemo(() => {
    const seen = new Set<string>();
    return events.filter(e => e.kind === 'search' && !seen.has(e.value) && seen.add(e.value)).slice(0, 10).map(e => e.value);
  }, [events]);

  const openTag = (tag: string) => runSearch(`#${tag}`);
  const deleteSearch = (value: string | null) => {
    removeSearch(user?.id, value).then(() => loadInterests(user?.id).then(setEvents));
  };

  // --- 화면 ---
  const sectionTitle = 'text-sm font-bold text-stone-800 mb-2.5 flex items-center justify-between';

  // 인스타그램 탐색처럼 정사각형 바둑판 (사진 없는 글은 글 카드)
  const renderGrid = (items: { post: ExplorePost; followed: boolean }[]) => (
    <div className="grid grid-cols-3 gap-0.5 bg-stone-100">
      {items.map(({ post, followed }) => (
        <button key={post.id} onClick={() => openPost(post)} className="relative aspect-square overflow-hidden bg-white text-left">
          {post.images?.[0] ? (
            <img src={post.images[0]} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 p-2.5 bg-gradient-to-br from-stone-50 to-stone-100 flex">
              <p className="text-[0.8125rem] text-stone-700 leading-snug line-clamp-5 break-words"><HashtagText text={post.content} /></p>
            </div>
          )}
          {(post.images?.length || 0) > 1 && <span className="absolute top-1.5 right-1.5 text-white text-xs drop-shadow"><Icon name="stack" fill className="w-4 h-4" /></span>}
          {post.is_video && <span className="absolute top-1.5 right-1.5 text-white text-xs drop-shadow"><Icon name="play" fill className="w-4 h-4" /></span>}
          {followed && (
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/45 text-white rounded-full pl-0.5 pr-1.5 py-0.5 max-w-[90%]">
              {post.avatar_url
                ? <img src={post.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                : <span className="w-4 h-4 rounded-full bg-white/80 text-stone-700 text-[0.6rem] flex items-center justify-center font-bold">{post.author_name?.[0]}</span>}
              <span className="text-[0.6875rem] truncate">{post.author_name}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const renderPostRow = (post: ExplorePost, note?: string) => (
    <button key={post.id} onClick={() => openPost(post)} className="w-full text-left p-4 flex gap-3 hover:bg-stone-50 transition-colors">
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar p={post} size="w-7 h-7" />
          <span className="text-xs font-bold text-stone-800 truncate">{post.author_name}</span>
          <RoleBadge type={post.badge_type} size="xs" showLabel={false} />
          <span className="text-[0.75rem] text-stone-400 shrink-0">· {timeAgo(post.created_at)}</span>
        </div>
        <p className="text-sm text-stone-800 line-clamp-3 leading-relaxed"><HashtagText text={post.content} onTag={openTag} /></p>
        <p className="text-[0.75rem] text-stone-500">
          <Icon name="pray" fill className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-0.5" />{post.pray_count || 0} · <Icon name="heart" fill className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-0.5" />{post.like_count || 0}
          {note && <span className="text-blue-600 ml-1.5">· {note}</span>}
        </p>
      </div>
      {post.images?.[0] && <img src={post.images[0]} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0 border border-stone-100" />}
    </button>
  );

  const renderPersonRow = (p: Person) => (
    <button key={p.id} onClick={() => { recordInterest(user?.id, 'search', term || p.baptismal_name); onOpenProfile(p.id); }} className="w-full text-left p-4 flex items-center gap-3 hover:bg-stone-50">
      <Avatar p={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold text-stone-800 truncate">{p.baptismal_name}</span>
          <RoleBadge type={p.badge_type} size="xs" />
        </div>
        <p className="text-xs text-stone-500 truncate">@{p.handle || 'user'}</p>
      </div>
      <span className="text-xs text-stone-400 shrink-0">프로필 ›</span>
    </button>
  );

  return (
    <section className="flex-1 flex flex-col bg-stone-50/30">
      {/* 검색창 */}
      <form onSubmit={(e) => { e.preventDefault(); runSearch(query); }} className="sticky top-[calc(3.6rem+env(safe-area-inset-top))] z-10 p-3 bg-white/95 backdrop-blur border-b border-stone-200">
        <div className="flex items-center gap-2 bg-stone-100 rounded-2xl px-3.5">
          <Icon name="search" className="w-5 h-5 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="사람, #해시태그, 글 내용 검색"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
          />
          {query && <button type="button" onClick={() => setQuery('')} className="text-stone-400 text-lg px-1" aria-label="지우기">×</button>}
        </div>
      </form>

      {term ? (
        // ---------- 검색 결과 ----------
        <div className="flex-1">
          <div className="flex gap-1.5 px-4 pt-3 pb-1">
            {([['all', '전체'], ['people', `사람 ${people.length}`], ['posts', `게시물 ${matchedPosts.length}`], ['tags', `태그 ${matchedTags.length}`]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={`text-xs px-3 py-1.5 rounded-full border ${filter === key ? 'bg-stone-900 text-white border-stone-900 font-bold' : 'bg-white text-stone-600 border-stone-200'}`}>{label}</button>
            ))}
          </div>

          {(filter === 'all' || filter === 'tags') && matchedTags.length > 0 && (
            <div className="px-4 py-3 flex flex-wrap gap-1.5">
              {matchedTags.map(t => <Chip key={t.tag} label={`#${t.tag} · ${t.count}`} onClick={() => openTag(t.tag)} active={t.tag === tagTerm} />)}
            </div>
          )}

          {(filter === 'all' || filter === 'people') && people.length > 0 && (
            <div className="bg-white border-y border-stone-200 divide-y divide-stone-100 mt-1">
              {(filter === 'all' ? people.slice(0, 3) : people).map(p => renderPersonRow(p))}
              {filter === 'all' && people.length > 3 && <button onClick={() => setFilter('people')} className="w-full py-2.5 text-xs text-blue-600 font-bold">사람 {people.length}명 모두 보기</button>}
            </div>
          )}

          {(filter === 'all' || filter === 'posts') && (
            <div className="bg-white border-y border-stone-200 divide-y divide-stone-100 mt-2">
              {matchedPosts.slice(0, filter === 'all' ? 20 : 100).map(p => renderPostRow(p))}
            </div>
          )}

          {people.length === 0 && matchedPosts.length === 0 && matchedTags.length === 0 && (
            <div className="p-12 text-center text-sm text-stone-400">&lsquo;{term}&rsquo;에 대한 검색 결과가 없어요.</div>
          )}
        </div>
      ) : (
        // ---------- 탐색 첫 화면: 사진 바둑판 ----------
        <div className="flex-1 flex flex-col pb-4">
          {searchFocused && recentSearches.length > 0 && (
            <div className="bg-white p-4 border-b border-stone-200">
              <p className={sectionTitle}>
                <span><Icon name="history" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />최근 검색</span>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => deleteSearch(null)} className="text-xs font-normal text-stone-400">전체 삭제</button>
              </p>
              <div className="flex flex-wrap gap-1.5" onMouseDown={(e) => e.preventDefault()}>
                {recentSearches.map(v => <Chip key={v} label={v} onClick={() => runSearch(v)} onRemove={() => deleteSearch(v)} />)}
              </div>
            </div>
          )}

          {exploreFeed.length === 0 ? (
            <div className="p-12 text-center text-sm text-stone-400">아직 둘러볼 게시물이 없어요.</div>
          ) : (
            <>
              {renderGrid(exploreFeed.slice(0, 9))}
              {user && recommendedPeople.length > 0 && (
                <div className="bg-white py-4 my-1 border-y border-stone-200">
                  <p className={`${sectionTitle} px-4`}><span><Icon name="handWave" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />이런 교우는 어때요?</span></p>
                  <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 snap-x">
                    {recommendedPeople.map(p => (
                      <button key={p.id} onClick={() => onOpenProfile(p.id)} className="snap-start shrink-0 w-36 border border-stone-200 rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center bg-stone-50/50">
                        <Avatar p={p} size="w-14 h-14" />
                        <span className="flex items-center gap-1 max-w-full">
                          <span className="text-sm font-bold text-stone-800 truncate">{p.baptismal_name}</span>
                          <RoleBadge type={p.badge_type} size="xs" showLabel={false} />
                        </span>
                        <span className="text-[0.75rem] text-stone-500 line-clamp-2 leading-snug">{p.reason}</span>
                        <span className="mt-1 text-xs font-bold text-blue-600">프로필 보기</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {exploreFeed.length > 9 && renderGrid(exploreFeed.slice(9))}
            </>
          )}

          {!user && (
            <p className="px-4 pt-3 text-xs text-stone-500">
              <button onClick={onRequireLogin} className="text-blue-600 font-bold underline">로그인</button>하면 팔로우한 교우의 글과 관심사에 맞는 글을 보여드려요.
            </p>
          )}
          <p className="px-4 pt-3 text-[0.75rem] text-stone-400 leading-relaxed">
            팔로우한 교우의 글과, 회원님이 쓴 글·기도·공감·댓글·검색 기록을 바탕으로 좋아하실 만한 글을 보여드려요.
          </p>
        </div>
      )}
    </section>
  );
}
