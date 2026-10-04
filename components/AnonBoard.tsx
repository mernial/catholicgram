'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ReportTarget } from '@/components/ReportDialog';

// 익명 고민상담 게시판
// 글/답글은 user_id 가 없는 보기(anon_posts_feed, anon_replies_feed)로만 읽는다.
// 쓰기는 테이블에 직접, 삭제와 감정 표현은 서버 함수(rpc)로 처리한다. (supabase/anon-board.sql)

interface AnonPost {
  id: string;
  anon_code: string;
  content: string;
  expires_at: string | null;
  created_at: string;
  is_mine: boolean;
  reply_count: number;
  pray_count: number;
  like_count: number;
  cheer_count: number;
  my_reactions: string[];
}

interface AnonReply {
  id: string;
  post_id: string;
  anon_code: string;
  is_post_author: boolean;
  content: string;
  created_at: string;
  is_mine: boolean;
}

type Reaction = 'pray' | 'like' | 'cheer';

const REACTIONS: { key: Reaction; emoji: string; label: string; count: keyof AnonPost; hover: string }[] = [
  { key: 'pray', emoji: '🙏', label: '기도할게요', count: 'pray_count', hover: 'hover:text-indigo-600' },
  { key: 'like', emoji: '🍇', label: '공감해요', count: 'like_count', hover: 'hover:text-purple-600' },
  { key: 'cheer', emoji: '🤗', label: '힘내요', count: 'cheer_count', hover: 'hover:text-amber-600' },
];

// 자동 삭제 시간 (시간 단위, 0 = 삭제 안 함)
const EXPIRY_OPTIONS = [
  { hours: 1, label: '1시간' },
  { hours: 6, label: '6시간' },
  { hours: 24, label: '하루' },
  { hours: 72, label: '3일' },
  { hours: 168, label: '7일' },
  { hours: 0, label: '삭제 안 함' },
];

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
};

const timeLeft = (iso: string) => {
  const sec = Math.max(0, (new Date(iso).getTime() - Date.now()) / 1000);
  if (sec < 3600) return `${Math.max(1, Math.ceil(sec / 60))}분`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${Math.floor(sec / 86400)}일`;
};

function AnonTag({ code, isAuthor, isMine }: { code: string; isAuthor?: boolean; isMine?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[0.8125rem]">🕊️</span>
      <span className="text-xs font-bold text-stone-800">익명 #{code}</span>
      {isAuthor && <span className="text-[0.75rem] bg-violet-600 text-white px-1.5 py-px rounded-full font-bold">작성자</span>}
      {isMine && <span className="text-[0.75rem] text-stone-400">(나)</span>}
    </span>
  );
}

export default function AnonBoard({ user, isAdmin, onRequireLogin, onReport }: {
  user: User | null;
  isAdmin: boolean;
  onRequireLogin: () => void;
  onReport: (target: ReportTarget) => void;
}) {
  const [posts, setPosts] = useState<AnonPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [content, setContent] = useState('');
  const [expiryHours, setExpiryHours] = useState(24);
  const [posting, setPosting] = useState(false);
  const [openReplies, setOpenReplies] = useState<{ [postId: string]: boolean }>({});
  const [replies, setReplies] = useState<{ [postId: string]: AnonReply[] }>({});
  const [replyInputs, setReplyInputs] = useState<{ [postId: string]: string }>({});
  const [, setTick] = useState(0); // 남은 시간 표시 갱신용

  const fetchPosts = async () => {
    const { data, error } = await supabase.from('anon_posts_feed').select('*')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      // 테이블/보기가 아직 없으면 SQL 실행이 필요하다는 안내
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) setSetupNeeded(true);
      setLoaded(true);
      return;
    }
    setPosts((data || []) as AnonPost[]);
    setLoaded(true);
  };

  const fetchReplies = async (postId: string) => {
    const { data } = await supabase.from('anon_replies_feed').select('*')
      .eq('post_id', postId).order('created_at', { ascending: true });
    if (data) setReplies(prev => ({ ...prev, [postId]: data as AnonReply[] }));
  };

  useEffect(() => {
    if (!user) return;
    fetchPosts();
    const refresh = setInterval(fetchPosts, 30000);
    const tick = setInterval(() => setTick(t => t + 1), 60000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [user]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { onRequireLogin(); return; }
    const text = content.trim();
    if (!text) return;
    setPosting(true);
    const expires_at = expiryHours > 0 ? new Date(Date.now() + expiryHours * 3600 * 1000).toISOString() : null;
    const { error } = await supabase.from('anon_posts').insert({ content: text, expires_at });
    setPosting(false);
    if (error) { alert(`글을 올리지 못했습니다.\n(${error.message})`); return; }
    setContent('');
    fetchPosts();
  };

  const toggleReplies = (postId: string) => {
    const next = !openReplies[postId];
    setOpenReplies(prev => ({ ...prev, [postId]: next }));
    if (next) fetchReplies(postId);
  };

  const handleReply = async (postId: string) => {
    if (!user) { onRequireLogin(); return; }
    const text = (replyInputs[postId] || '').trim();
    if (!text) return;
    const { error } = await supabase.from('anon_replies').insert({ post_id: postId, content: text });
    if (error) { alert(`답글을 달지 못했습니다.\n(${error.message})`); return; }
    setReplyInputs(prev => ({ ...prev, [postId]: '' }));
    fetchReplies(postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, reply_count: p.reply_count + 1 } : p));
  };

  const handleReaction = async (post: AnonPost, reaction: Reaction) => {
    if (!user) { onRequireLogin(); return; }
    const mine = post.my_reactions.includes(reaction);
    const countKey = `${reaction}_count` as 'pray_count' | 'like_count' | 'cheer_count';
    // 화면 먼저 반영
    setPosts(prev => prev.map(p => p.id !== post.id ? p : {
      ...p,
      [countKey]: Math.max(0, p[countKey] + (mine ? -1 : 1)),
      my_reactions: mine ? p.my_reactions.filter(r => r !== reaction) : [...p.my_reactions, reaction],
    }));
    const { error } = await supabase.rpc('toggle_anon_reaction', { p_post: post.id, p_reaction: reaction });
    if (error) fetchPosts();
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('이 고민글을 삭제하시겠습니까? 답글도 함께 삭제됩니다.')) return;
    const { error } = await supabase.rpc('delete_anon_post', { p_id: postId });
    if (error) { alert(`삭제하지 못했습니다.\n(${error.message})`); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleDeleteReply = async (postId: string, replyId: string) => {
    if (!window.confirm('이 답글을 삭제하시겠습니까?')) return;
    const { error } = await supabase.rpc('delete_anon_reply', { p_id: replyId });
    if (error) { alert(`삭제하지 못했습니다.\n(${error.message})`); return; }
    setReplies(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(r => r.id !== replyId) }));
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, reply_count: Math.max(0, p.reply_count - 1) } : p));
  };

  return (
    <section className="flex-1 flex flex-col bg-stone-50/30">
      <div className="px-4 pt-4 pb-3 bg-violet-50/60 border-b border-violet-100">
        <h2 className="font-bold text-stone-900 flex items-center gap-1.5">🕊️ 익명 고민상담</h2>
        <p className="text-[0.8125rem] text-stone-600 mt-1 leading-relaxed">
          글과 답글은 <b>익명 코드</b>로만 표시되고, 누가 썼는지는 아무에게도 보이지 않아요.<br />
          서로의 아픔을 존중하며 따뜻하게 답해주세요.
        </p>
      </div>

      {!user ? (
        <div className="p-12 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-stone-500">로그인한 교우만 고민상담 게시판을 볼 수 있어요.</p>
          <button onClick={onRequireLogin} className="bg-stone-900 text-white text-xs font-bold px-4 py-2 rounded-xl">로그인</button>
        </div>
      ) : setupNeeded ? (
        <div className="p-10 text-center text-sm text-stone-500 leading-relaxed">
          게시판 준비 중입니다.<br />
          <span className="text-xs">(관리자: Supabase에서 <code>supabase/anon-board.sql</code> 을 실행해주세요)</span>
        </div>
      ) : (
        <>
          <form onSubmit={handlePost} className="p-4 bg-white border-b border-stone-200 flex flex-col gap-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="마음속 고민을 익명으로 나눠보세요..."
              className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[0.8125rem] font-bold text-stone-500">⏳ 자동 삭제</span>
              {EXPIRY_OPTIONS.map(o => (
                <button
                  type="button"
                  key={o.hours}
                  onClick={() => setExpiryHours(o.hours)}
                  className={`text-[0.8125rem] px-2.5 py-1 rounded-full border transition-colors ${expiryHours === o.hours ? 'bg-violet-600 text-white border-violet-600 font-bold' : 'bg-white text-stone-600 border-stone-200'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={posting || !content.trim()} className="bg-violet-600 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-violet-700 disabled:opacity-40">
                {posting ? '올리는 중...' : '익명으로 올리기'}
              </button>
            </div>
          </form>

          <div className="divide-y divide-stone-200/70 flex-1">
            {loaded && posts.length === 0 && (
              <div className="p-12 text-center text-stone-400 text-sm">아직 고민글이 없어요. 첫 마음을 나눠주세요.</div>
            )}
            {posts.map(post => (
              <article key={post.id} className="p-4 sm:p-5 bg-white flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AnonTag code={post.anon_code} isMine={post.is_mine} />
                    <span className="text-[0.8125rem] text-stone-400">· {timeAgo(post.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {post.expires_at && (
                      <span className="text-[0.75rem] text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">⏳ {timeLeft(post.expires_at)} 후 삭제</span>
                    )}
                    {(post.is_mine || isAdmin) && (
                      <button onClick={() => handleDeletePost(post.id)} className="text-[0.8125rem] text-stone-400 hover:text-red-500 px-1.5 py-1">삭제</button>
                    )}
                    {!post.is_mine && (
                      <button onClick={() => onReport({ type: 'anon_post', id: post.id, preview: post.content })} className="text-[0.8125rem] text-stone-400 hover:text-red-500 px-1.5 py-1">신고</button>
                    )}
                  </div>
                </div>

                <p className="text-stone-800 text-[1rem] whitespace-pre-wrap leading-relaxed">{post.content}</p>

                <div className="flex items-center gap-4 text-xs font-medium pt-1 flex-wrap">
                  {REACTIONS.map(r => {
                    const count = post[r.count] as number;
                    const active = post.my_reactions.includes(r.key);
                    return (
                      <button key={r.key} onClick={() => handleReaction(post, r.key)} className={`flex items-center gap-1 transition-colors ${active ? 'text-violet-700 font-bold' : `text-stone-600 ${r.hover}`}`}>
                        {r.emoji} {r.label} {count > 0 && `(${count})`}
                      </button>
                    );
                  })}
                  <button onClick={() => toggleReplies(post.id)} className="flex items-center gap-1 text-stone-600 hover:text-stone-900">
                    💬 답글 {post.reply_count > 0 && `(${post.reply_count})`}
                  </button>
                </div>

                {openReplies[post.id] && (
                  <div className="mt-1 pt-3 border-t border-stone-100 flex flex-col gap-2.5">
                    {(replies[post.id] || []).map(reply => (
                      <div key={reply.id} className={`text-xs p-2.5 rounded-xl flex flex-col gap-1.5 ${reply.is_post_author ? 'bg-violet-50/70' : 'bg-stone-100/70'}`}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <AnonTag code={reply.anon_code} isAuthor={reply.is_post_author} isMine={reply.is_mine} />
                            <span className="text-[0.75rem] text-stone-400">{timeAgo(reply.created_at)}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {(reply.is_mine || isAdmin) && (
                              <button onClick={() => handleDeleteReply(post.id, reply.id)} className="text-[0.75rem] text-stone-400 hover:text-red-500">삭제</button>
                            )}
                            {!reply.is_mine && (
                              <button onClick={() => onReport({ type: 'anon_reply', id: reply.id, preview: reply.content })} className="text-[0.75rem] text-stone-400 hover:text-red-500">신고</button>
                            )}
                          </span>
                        </div>
                        <span className="text-stone-800 whitespace-pre-wrap pl-1">{reply.content}</span>
                      </div>
                    ))}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={replyInputs[post.id] || ''}
                        onChange={(e) => setReplyInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleReply(post.id); }}
                        maxLength={1000}
                        placeholder="따뜻한 답글을 익명으로 남겨주세요..."
                        className="flex-1 text-xs border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
                      />
                      <button onClick={() => handleReply(post.id)} className="bg-violet-600 text-white text-xs px-3 py-2 rounded-xl">등록</button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
