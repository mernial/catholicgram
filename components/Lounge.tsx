'use client';

import { useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import RoleBadge from '@/components/RoleBadge';
import type { ReportTarget } from '@/components/ReportDialog';

// 모두의 사랑방 (supabase/lounge.sql)
// 모든 교우가 세례명으로 함께하는 실시간 대화방. 대화는 7일 동안 남는다.
// 새 대화·지운 대화는 Supabase 실시간으로 바로 받고, 실시간 연결이 안 되면 5초마다 확인한다.
// 사랑방 대화는 휴대폰 알림·알림음이 없다. 다만 '@관리자'로 부르면 관리자에게만 휴대폰 알림이 간다.

interface LoungeMessage { id: string; user_id: string; content: string; created_at: string }
interface Author { id: string; baptismal_name: string; avatar_url?: string | null; badge_type?: string | null }
interface Trashed { id: string; user_id: string | null; content: string | null; created_at: string | null; deleted_at: string; deleted_by: string | null }

const PAGE = 80;
const SETUP_HINT = '사랑방을 준비 중이에요. (관리자: supabase/lounge.sql 실행 필요)';
const isSetupError = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

export const CALL_ADMIN = '@관리자';
// '@관리자' 부분을 눈에 띄게
const withCall = (text: string, mine: boolean) => text.split(/(@관리자)/g).map((part, i) =>
  part === CALL_ADMIN ? <b key={i} className={mine ? 'text-amber-200' : 'text-amber-700'}>{part}</b> : part);

export const loungeSeenKey = (userId: string) => `loungeSeenAt:${userId}`;

export default function Lounge({ user, isAdmin, blockedIds, focusId, onClose, onOpenProfile, onReport, onCallAdmin, onAnnounce }: {
  user: User;
  isAdmin: boolean;
  blockedIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  focusId?: string | null;               // 관리자 부름 알림으로 들어왔을 때 그 대화로
  onCallAdmin: (messageId: string) => void;
  onAnnounce?: (messageId: string) => Promise<string>; // 관리자: 모든 교우에게 휴대폰 알림 → 결과 문구
}) {
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);         // 위로 올려 보는 중에 새로 온 대화 수
  const [banned, setBanned] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState<Trashed[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const atBottomRef = useRef(true);
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const loadAuthors = async (ids: string[]) => {
    const need = Array.from(new Set(ids)).filter(id => !authorsRef.current[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, badge_type').in('id', need);
    if (data) setAuthors(prev => ({ ...prev, ...Object.fromEntries(data.map(a => [a.id, a as Author])) }));
  };

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  };

  const addMessages = (rows: LoungeMessage[]) => {
    if (rows.length === 0) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const fresh = rows.filter(r => !seen.has(r.id));
      if (fresh.length === 0) return prev;
      if (!atBottomRef.current) setNewBelow(n => n + fresh.filter(r => r.user_id !== user.id).length);
      return [...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    loadAuthors(rows.map(r => r.user_id));
  };

  const markSeen = () => { try { localStorage.setItem(loungeSeenKey(user.id), new Date().toISOString()); } catch { /* 무시 */ } };

  // 처음 불러오기
  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.from('lounge_messages').select('id, user_id, content, created_at')
        .order('created_at', { ascending: false }).limit(PAGE);
      setLoading(false);
      if (e) { setError(isSetupError(e) ? SETUP_HINT : '대화를 불러오지 못했어요.'); return; }
      const rows = (data || []).reverse();
      setMessages(rows);
      setHasOlder((data || []).length === PAGE);
      loadAuthors(rows.map(r => r.user_id));
      markSeen();
      if (focusId && rows.some(r => r.id === focusId)) {
        atBottomRef.current = false;
        setHighlightId(focusId);
        setTimeout(() => document.getElementById(`lounge-${focusId}`)?.scrollIntoView({ block: 'center' }), 80);
        setTimeout(() => setHighlightId(null), 8000);
      } else setTimeout(() => scrollToBottom(), 50);
      if (isAdmin) {
        const { data: b } = await supabase.from('lounge_bans').select('user_id');
        setBanned(new Set((b || []).map(x => x.user_id)));
      }
    })();
    return () => markSeen();
  }, []);

  // 실시간: 새 대화·지운 대화 + 지금 함께 있는 교우 수
  useEffect(() => {
    let live = false;
    const channel = supabase.channel('lounge', { config: { presence: { key: user.id } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_messages' }, payload => {
        addMessages([payload.new as LoungeMessage]);
        markSeen();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lounge_messages' }, payload => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages(prev => prev.filter(m => m.id !== id));
      })
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(channel.presenceState()).length))
      .subscribe(status => {
        live = status === 'SUBSCRIBED';
        if (live) channel.track({ at: Date.now() }).catch(() => {});
      });
    // 실시간 연결이 안 되는 환경이면 5초마다 새 대화 확인
    const poll = setInterval(async () => {
      if (live || document.visibilityState === 'hidden') return;
      const last = messagesRef.current[messagesRef.current.length - 1];
      let q = supabase.from('lounge_messages').select('id, user_id, content, created_at').order('created_at', { ascending: true }).limit(50);
      if (last) q = q.gt('created_at', last.created_at);
      const { data } = await q;
      if (data) addMessages(data);
    }, 5000);
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, []);
  // 새 대화가 오면: 맨 아래를 보고 있었으면 따라 내려간다
  useEffect(() => { if (atBottomRef.current) scrollToBottom(true); }, [messages.length]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight : 0;
    const { data } = await supabase.from('lounge_messages').select('id, user_id, content, created_at')
      .lt('created_at', first.created_at).order('created_at', { ascending: false }).limit(PAGE);
    const rows = (data || []).reverse();
    setHasOlder((data || []).length === PAGE);
    atBottomRef.current = false;
    setMessages(prev => [...rows, ...prev]);
    loadAuthors(rows.map(r => r.user_id));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const { data, error: err } = await supabase.from('lounge_messages').insert({ content: text.slice(0, 500) })
      .select('id, user_id, content, created_at').single();
    setSending(false);
    if (err) {
      alert(isSetupError(err) ? SETUP_HINT : /천천히|제한/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err.message})`);
      return;
    }
    setInput('');
    atBottomRef.current = true;
    if (data) addMessages([data]);
    // '@관리자'로 불렀으면 관리자에게만 알림 (관리자 본인은 제외)
    if (data && text.includes(CALL_ADMIN) && !isAdmin) {
      onCallAdmin(data.id);
      setNotice('관리자에게 알림을 보냈어요 🙋');
      setTimeout(() => setNotice(''), 4000);
    }
  };

  // 관리자: '관리자가 사랑방에 왔어요' — 사랑방에 📢 안내 글을 올리고 모든 교우에게 휴대폰 알림
  const announce = async () => {
    if (!onAnnounce || sending) return;
    const text = input.trim() || '관리자가 사랑방에 왔어요! 함께 이야기 나눠요 😊';
    if (!window.confirm(`모든 교우의 휴대폰으로 알림을 보낼까요?\n\n"${text}"\n\n(사랑방에도 안내 글로 올라가요 · 30분에 한 번)`)) return;
    setSending(true);
    const { data, error: err } = await supabase.from('lounge_messages').insert({ content: `📢 ${text}`.slice(0, 500) })
      .select('id, user_id, content, created_at').single();
    setSending(false);
    if (err || !data) { alert(`보내지 못했어요.\n(${err?.message || ''})`); return; }
    setInput('');
    atBottomRef.current = true;
    addMessages([data]);
    setNotice('알림을 보내는 중...');
    const result = await onAnnounce(data.id);
    setNotice(result);
    setTimeout(() => setNotice(''), 6000);
  };

  const remove = async (m: LoungeMessage) => {
    setMenuId(null);
    if (!window.confirm('이 대화를 지울까요?')) return;
    const { error: err } = await supabase.from('lounge_messages').delete().eq('id', m.id);
    if (err) { alert(`지우지 못했어요.\n(${err.message})`); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  };

  const toggleBan = async (userId: string) => {
    setMenuId(null);
    const name = authors[userId]?.baptismal_name || '이 교우';
    if (banned.has(userId)) {
      if (!window.confirm(`${name}님의 사랑방 대화 금지를 풀까요?`)) return;
      const { error: err } = await supabase.from('lounge_bans').delete().eq('user_id', userId);
      if (err) { alert(err.message); return; }
      setBanned(prev => { const n = new Set(prev); n.delete(userId); return n; });
    } else {
      if (!window.confirm(`${name}님이 사랑방에 글을 쓰지 못하게 할까요?\n(읽기는 할 수 있어요. 나중에 풀 수 있어요)`)) return;
      const { error: err } = await supabase.from('lounge_bans').insert({ user_id: userId });
      if (err) { alert(err.message); return; }
      setBanned(prev => new Set(prev).add(userId));
    }
  };

  const openTrash = async () => {
    if (trash) { setTrash(null); return; }
    const { data, error: err } = await supabase.from('lounge_trash').select('*').order('deleted_at', { ascending: false }).limit(100);
    if (err) { alert(err.message); return; }
    setTrash((data || []) as Trashed[]);
    loadAuthors((data || []).map(t => t.user_id).filter(Boolean) as string[]);
  };

  const shown = messages.filter(m => !blockedIds.has(m.user_id));

  return (
    <div className="fixed inset-0 z-[75] bg-[#f4efe6] flex flex-col" role="dialog" aria-label="모두의 사랑방">
      {/* 맨 위 */}
      <div className="shrink-0 bg-white border-b border-stone-200 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 flex items-center gap-1">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-stone-700" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-[1.0625rem] text-stone-900 truncate">💬 모두의 사랑방</h2>
          <p className="text-[0.75rem] text-stone-500">{online > 0 ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" />지금 {online}명 함께하는 중</> : '모든 교우가 함께하는 대화방'}</p>
        </div>
        {isAdmin && <button onClick={openTrash} className="px-2.5 py-1.5 mr-1 rounded-lg border border-stone-200 text-[0.75rem] text-stone-600">{trash ? '대화로' : '지운 대화'}</button>}
      </div>

      {trash ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
          <p className="text-[0.8125rem] text-stone-500 px-1">최근 지운 대화 (관리자만 보여요)</p>
          {trash.length === 0 && <p className="text-center text-stone-400 text-sm py-10">지운 대화가 없어요.</p>}
          {trash.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-stone-200 p-3">
              <p className="text-[0.8125rem] font-bold text-stone-800">{(t.user_id && authors[t.user_id]?.baptismal_name) || '교우'} <span className="font-normal text-stone-400">· {t.created_at ? `${dayOf(t.created_at)} ${timeOf(t.created_at)}` : ''}</span></p>
              <p className="text-[0.9375rem] text-stone-700 whitespace-pre-wrap break-words mt-1">{t.content}</p>
              <p className="text-[0.75rem] text-red-500 mt-1">{t.deleted_by && t.deleted_by === t.user_id ? '본인이 지움' : '관리자가 지움'} · {dayOf(t.deleted_at)} {timeOf(t.deleted_at)}</p>
            </div>
          ))}
        </div>
      ) : (
      <div ref={listRef} onScroll={e => {
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottomRef.current && newBelow) setNewBelow(0);
      }} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-2" onClick={() => setMenuId(null)}>
        <div className="mx-auto max-w-sm text-center text-[0.8125rem] text-stone-500 bg-white/70 rounded-2xl px-4 py-2.5 mb-1 leading-relaxed">
          모든 교우가 함께 보는 대화방이에요 🙏<br />서로 존중하는 말로 나눠 주세요. 대화는 7일 뒤 사라져요.<br />도움이 필요하면 <b className="text-amber-700">🙋 관리자 부르기</b>를 눌러 주세요.
        </div>
        {hasOlder && <button onClick={loadOlder} className="self-center text-[0.8125rem] text-stone-600 bg-white border border-stone-200 rounded-full px-4 py-1.5">이전 대화 더 보기</button>}
        {loading && <p className="text-center text-stone-400 text-sm py-10">불러오는 중...</p>}
        {error && <p className="text-center text-stone-500 text-sm py-10 px-6">{error}</p>}
        {!loading && !error && shown.length === 0 && <p className="text-center text-stone-400 text-sm py-10">아직 대화가 없어요. 먼저 인사를 건네 보세요 😊</p>}
        {shown.map((m, i) => {
          const mine = m.user_id === user.id;
          const a = authors[m.user_id];
          const prev = shown[i - 1];
          const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
          const grouped = !newDay && prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60 * 1000;
          return (
            <div key={m.id} id={`lounge-${m.id}`} className={highlightId === m.id ? 'rounded-2xl ring-4 ring-amber-300/70 bg-amber-50/60 transition-all' : ''}>
              {newDay && <p className="text-center text-[0.75rem] text-stone-500 my-2"><span className="bg-white/70 rounded-full px-3 py-1">{dayOf(m.created_at)}</span></p>}
              <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '-mt-1' : ''}`}>
                {!mine && (
                  grouped ? <span className="w-10 shrink-0" /> : (
                    <button onClick={() => onOpenProfile(m.user_id)} className="shrink-0 self-start" aria-label={`${a?.baptismal_name || '교우'}님 공간`}>
                      {a?.avatar_url
                        ? <img loading="lazy" src={a.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                        : <span className="w-10 h-10 rounded-full bg-stone-300 text-stone-700 font-serif font-bold flex items-center justify-center">{a?.baptismal_name?.[0] || '교'}</span>}
                    </button>
                  )
                )}
                <div className={`min-w-0 max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && !grouped && (
                    <span className="flex items-center gap-1 text-[0.8125rem] font-bold text-stone-700 mb-0.5 ml-1">
                      {a?.baptismal_name || '교우'}<RoleBadge type={a?.badge_type} size="xs" showLabel={false} />
                      {isAdmin && banned.has(m.user_id) && <span className="text-[0.6875rem] text-red-500 font-normal">(대화 금지)</span>}
                    </span>
                  )}
                  <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuId(menuId === m.id ? null : m.id); }}
                      className={`text-left px-3.5 py-2 rounded-2xl text-[1rem] leading-relaxed whitespace-pre-wrap break-words ${m.content.startsWith('📢') ? 'bg-sky-50 border-2 border-sky-300 text-stone-900 font-bold' : mine ? 'bg-[#4d6a45] text-white rounded-br-md' : 'bg-white text-stone-900 rounded-bl-md shadow-sm'}`}
                    >{withCall(m.content, mine && !m.content.startsWith('📢'))}</button>
                    <span className="shrink-0 text-[0.6875rem] text-stone-500 pb-0.5">{timeOf(m.created_at)}</span>
                  </div>
                  {menuId === m.id && (
                    <div className={`mt-1 flex gap-1.5 ${mine ? 'justify-end' : ''}`} onClick={e => e.stopPropagation()}>
                      {(mine || isAdmin) && <button onClick={() => remove(m)} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-red-600"><Icon name="trash" className="w-[1.05em] h-[1.05em] inline-block align-[-0.2em] mr-1" />지우기</button>}
                      {!mine && <button onClick={() => { setMenuId(null); onReport({ type: 'lounge', id: m.id, userId: m.user_id, userName: a?.baptismal_name, preview: m.content }); }} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700"><Icon name="siren" className="w-[1.05em] h-[1.05em] inline-block align-[-0.2em] mr-1" />신고</button>}
                      {isAdmin && !mine && <button onClick={() => toggleBan(m.user_id)} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700">{banned.has(m.user_id) ? '대화 금지 풀기' : '대화 금지'}</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {newBelow > 0 && !trash && (
        <button onClick={() => scrollToBottom(true)} className="absolute left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] px-4 py-2 rounded-full bg-stone-900/85 text-white text-[0.875rem] font-bold shadow-lg">새 대화 {newBelow}개 ↓</button>
      )}

      {/* 입력 */}
      {!trash && (
        <div className="shrink-0 bg-white border-t border-stone-200">
        {notice && <p className="px-4 pt-2 text-[0.8125rem] font-bold text-amber-700">{notice}</p>}
        {isAdmin && onAnnounce && (
          <div className="px-3 pt-2 flex items-center gap-2">
            <button type="button" onClick={announce} disabled={sending || !!error} className="px-3 py-1.5 rounded-full border border-sky-300 bg-sky-50 text-sky-800 text-[0.8125rem] font-bold disabled:opacity-50">📢 모두에게 알리기</button>
            <span className="text-[0.75rem] text-stone-400">모든 교우 휴대폰으로 &lsquo;관리자가 왔어요&rsquo;</span>
          </div>
        )}
        {!isAdmin && (
          <div className="px-3 pt-2 flex items-center gap-2">
            <button type="button" onClick={() => {
              setInput(v => (v.includes(CALL_ADMIN) ? v : `${CALL_ADMIN} ${v}`));
              setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
            }} className="px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-[0.8125rem] font-bold">🙋 관리자 부르기</button>
            <span className="text-[0.75rem] text-stone-400">대화는 알림 없이 조용히 올라가요</span>
          </div>
        )}
        <form onSubmit={send} className="px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="사랑방에 한마디..."
            className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[1rem] focus:outline-none focus:border-stone-500"
            aria-label="사랑방에 보낼 말"
          />
          <button type="submit" disabled={!input.trim() || sending || !!error} className="shrink-0 h-11 px-4 rounded-2xl bg-[#4d6a45] disabled:bg-stone-300 text-white font-bold text-[0.9375rem]">{sending ? '...' : '보내기'}</button>
        </form>
        </div>
      )}
    </div>
  );
}
