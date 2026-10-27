'use client';

import { useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import RoleBadge from '@/components/RoleBadge';
import type { ReportTarget } from '@/components/ReportDialog';
import NewChat, { GROUP_SETUP_HINT, isGroupSetupError, type ChatPerson } from '@/components/NewChat';
import { initial } from '@/lib/fancy-name';

// 단체 채팅방 (supabase/group-chats.sql)
// 들어와 있는 교우만 읽고 쓴다. 새 대화는 Supabase 실시간으로 바로 받고, 연결이 안 되면 5초마다 확인한다.
// 관리자 보기(adminView): 모든 방을 읽기만 한다 — 글쓰기·읽음 표시·입장 안내가 없어 교우들에게 보이지 않는다.
interface GroupMessage { id: string; chat_id: string; user_id: string | null; content: string; kind: 'text' | 'system'; created_at: string }
interface Member { user_id: string; joined_at: string }

const PAGE = 80;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

export default function GroupChat({ user, chatId, adminView = false, blockedIds, onClose, onOpenProfile, onReport, onSent, onChanged }: {
  user: User;
  chatId: string;
  adminView?: boolean;                       // 관리자: 몰래 읽기만
  blockedIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  onSent?: (messageId: string) => void;      // 휴대폰 알림 보내기
  onChanged?: () => void;                    // 방 이름·인원·나가기 → 목록 새로 고침
}) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Record<string, ChatPerson>>({});
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // 엔터로 보내기: 컴퓨터·아이패드처럼 큰 화면 (휴대폰은 엔터가 줄바꿈, 보내기 단추로 전송) — 사랑방과 같은 방식
  const [enterSends, setEnterSends] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine), (min-width: 700px)');
    const on = () => setEnterSends(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const shiftRef = useRef(false);
  const composingRef = useRef(false);
  const sendRef = useRef<(typed: string) => void>(() => {});
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta || !enterSends) return;
    // 한글 조합 중에 엔터를 누르면 keydown 없이 줄바꿈이 들어오려 함 → 그 줄바꿈을 막고 보낸다
    const onBeforeInput = (ev: InputEvent) => {
      if ((ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph') && !shiftRef.current) {
        ev.preventDefault();
        const typed = ta.value;
        setTimeout(() => sendRef.current(typed), 0);
      }
    };
    ta.addEventListener('beforeinput', onBeforeInput);
    return () => ta.removeEventListener('beforeinput', onBeforeInput);
  }, [enterSends, loading]);

  const loadPeople = async (ids: (string | null)[]) => {
    const need = Array.from(new Set(ids.filter((x): x is string => !!x))).filter(id => !peopleRef.current[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type').in('id', need);
    if (data) setPeople(prev => ({ ...prev, ...Object.fromEntries((data as ChatPerson[]).map(p => [p.id, p])) }));
  };

  const loadRoom = async () => {
    const [{ data: chat, error: e1 }, { data: mem }] = await Promise.all([
      supabase.from('group_chats').select('id, name').eq('id', chatId).maybeSingle(),
      supabase.from('group_chat_members').select('user_id, joined_at').eq('chat_id', chatId).order('joined_at', { ascending: true }),
    ]);
    if (e1) { setError(isGroupSetupError(e1) ? GROUP_SETUP_HINT : '채팅방을 불러오지 못했어요.'); return false; }
    if (!chat) { setError('채팅방을 찾을 수 없어요. 나갔거나 없어진 방이에요.'); return false; }
    setName(chat.name);
    setMembers((mem || []) as Member[]);
    loadPeople((mem || []).map(m => m.user_id));
    return true;
  };

  const markRead = () => { if (!adminView) supabase.rpc('mark_group_chat_read', { p_chat: chatId }).then(() => {}, () => {}); };
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadSoon = () => {
    if (adminView || readTimer.current) return;
    readTimer.current = setTimeout(() => { readTimer.current = null; markRead(); }, 1500);
  };

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  };

  const addMessages = (rows: GroupMessage[]) => {
    if (rows.length === 0) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const fresh = rows.filter(r => !seen.has(r.id));
      if (fresh.length === 0) return prev;
      if (!atBottomRef.current) setNewBelow(n => n + fresh.filter(r => r.user_id !== user.id && r.kind === 'text').length);
      return [...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    loadPeople(rows.map(r => r.user_id));
    // 초대·나감·이름 바꿈 안내가 오면 방 정보도 다시
    if (rows.some(r => r.kind === 'system')) { loadRoom(); onChanged?.(); }
  };

  // 처음 불러오기
  useEffect(() => {
    (async () => {
      const ok = await loadRoom();
      if (!ok) { setLoading(false); return; }
      const { data, error: e } = await supabase.from('group_chat_messages').select('*')
        .eq('chat_id', chatId).order('created_at', { ascending: false }).limit(PAGE);
      setLoading(false);
      if (e) { setError(isGroupSetupError(e) ? GROUP_SETUP_HINT : '대화를 불러오지 못했어요.'); return; }
      const rows = ((data || []) as GroupMessage[]).reverse();
      setMessages(rows);
      setHasOlder((data || []).length === PAGE);
      loadPeople(rows.map(r => r.user_id));
      markRead();
      setTimeout(() => scrollToBottom(), 50);
    })();
    return () => { if (readTimer.current) clearTimeout(readTimer.current); markRead(); onChanged?.(); };
  }, [chatId]);

  // 실시간: 이 방의 새 대화·지운 대화
  useEffect(() => {
    let live = false;
    const channel = supabase.channel(`group-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        addMessages([payload.new as GroupMessage]);
        markReadSoon();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chat_messages' }, payload => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages(prev => prev.filter(m => m.id !== id));
      })
      .subscribe(status => { live = status === 'SUBSCRIBED'; });
    const poll = setInterval(async () => {
      if (live || document.visibilityState === 'hidden') return;
      const last = messagesRef.current[messagesRef.current.length - 1];
      let q = supabase.from('group_chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(50);
      if (last) q = q.gt('created_at', last.created_at);
      const { data } = await q;
      if (data && data.length) { addMessages(data as GroupMessage[]); markReadSoon(); }
    }, 5000);
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [chatId]);

  // 맨 아래를 보고 있었으면: 사진이 늦게 불러와지거나 키보드가 올라와도 계속 맨 아래에
  useEffect(() => {
    const list = listRef.current, content = contentRef.current;
    if (!list || !content) return;
    const stick = () => { if (atBottomRef.current) list.scrollTop = list.scrollHeight; };
    const ro = new ResizeObserver(stick);
    ro.observe(content); ro.observe(list);
    stick();
    return () => ro.disconnect();
  }, [loading]);
  useEffect(() => { if (atBottomRef.current) scrollToBottom(true); }, [messages.length]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight : 0;
    const { data } = await supabase.from('group_chat_messages').select('*')
      .eq('chat_id', chatId).lt('created_at', first.created_at).order('created_at', { ascending: false }).limit(PAGE);
    const rows = ((data || []) as GroupMessage[]).reverse();
    setHasOlder((data || []).length === PAGE);
    atBottomRef.current = false;
    setMessages(prev => [...rows, ...prev]);
    loadPeople(rows.map(r => r.user_id));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  const lastSendRef = useRef({ text: '', at: 0 });
  sendRef.current = (typed: string) => {
    const now = Date.now();
    if (typed.trim() === lastSendRef.current.text && now - lastSendRef.current.at < 1000) return; // 엔터 한 번에 두 번 가지 않게
    lastSendRef.current = { text: typed.trim(), at: now };
    send(undefined, typed);
  };
  const send = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    if (sending || adminView) return;
    const ta = inputRef.current;
    const raw = typed ?? ta?.value ?? input;
    const text = raw.trim();
    if (!text) return;
    const keepKeyboard = !!ta && document.activeElement === ta;
    // 조합 중인 마지막 글자를 먼저 끝맺어야 입력창을 비워도 글자가 되살아나지 않는다
    if (keepKeyboard && composingRef.current && ta) { ta.blur(); ta.focus(); composingRef.current = false; }
    setInput('');
    setSending(true);
    const { data, error: err } = await supabase.from('group_chat_messages').insert({ chat_id: chatId, content: text.slice(0, 1000) }).select('*').single();
    setSending(false);
    if (keepKeyboard) setTimeout(() => inputRef.current?.focus(), 0);
    if (err || !data) {
      setInput(cur => (cur.trim() ? cur : raw));
      alert(err && isGroupSetupError(err) ? GROUP_SETUP_HINT : err && /[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err?.message || ''})`);
      return;
    }
    atBottomRef.current = true;
    addMessages([data as GroupMessage]);
    onSent?.((data as GroupMessage).id);
  };

  const remove = async (m: GroupMessage) => {
    setMenuId(null);
    if (!window.confirm('이 메시지를 지울까요?\n다른 교우들에게도 보이지 않게 돼요.')) return;
    const { error: err } = await supabase.from('group_chat_messages').delete().eq('id', m.id);
    if (err) { alert('지우지 못했어요.'); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  };

  const rename = async () => {
    const next = window.prompt('새 방 이름을 적어 주세요 (40자까지)', name);
    if (next === null || !next.trim() || next.trim() === name) return;
    const { error: err } = await supabase.rpc('rename_group_chat', { p_chat: chatId, p_name: next.trim().slice(0, 40) });
    if (err) { alert(/[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : '이름을 바꾸지 못했어요.'); return; }
    setName(next.trim().slice(0, 40));
    onChanged?.();
  };

  const leave = async () => {
    if (!window.confirm(`'${name}' 채팅방에서 나갈까요?\n나가면 이 방의 대화를 더 볼 수 없어요.`)) return;
    const { error: err } = await supabase.rpc('leave_group_chat', { p_chat: chatId });
    if (err) { alert('나가지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    onChanged?.();
    onClose();
  };

  const me = members.some(m => m.user_id === user.id);
  const canWrite = !adminView && me && !error;

  return (
    <div className="fixed inset-0 z-[75] bg-[#eef1ea] flex flex-col" role="dialog" aria-label={`단체 채팅방 ${name}`}>
      <div className="shrink-0 bg-white border-b border-stone-200 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 flex items-center gap-1">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-stone-700" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => setShowMembers(true)} className="flex-1 min-w-0 text-left" aria-label="참여한 교우 보기">
          <h2 className="font-bold text-[1.0625rem] text-stone-900 truncate">👥 {name || '단체 채팅방'}</h2>
          <p className="text-[0.8125rem] text-stone-500">{members.length}명 함께하는 중 <span className="text-stone-400">▾ 누구?</span></p>
        </button>
        <button onClick={() => setShowMembers(true)} className="w-11 h-11 flex items-center justify-center text-stone-600" aria-label="채팅방 메뉴">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
      {adminView && (
        <p className="shrink-0 bg-stone-800 text-white px-4 py-2 text-[0.8125rem] leading-snug">🔒 관리자 보기 · 읽기만 할 수 있어요. 교우들에게는 관리자가 본다는 표시가 나타나지 않아요.</p>
      )}

      <div ref={listRef} onScroll={e => {
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottomRef.current && newBelow) setNewBelow(0);
      }} onClick={() => setMenuId(null)} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col">
        <div ref={contentRef} className="mt-auto flex flex-col gap-2">
          {hasOlder && <button onClick={loadOlder} className="self-center text-[0.8125rem] text-stone-600 bg-white border border-stone-200 rounded-full px-4 py-1.5">이전 대화 더 보기</button>}
          {loading && <p className="text-center text-stone-400 text-sm py-10">불러오는 중...</p>}
          {error && <p className="text-center text-stone-500 text-sm py-10 px-6">{error}</p>}
          {!loading && !error && messages.length === 0 && <p className="text-center text-stone-400 text-sm py-10">아직 대화가 없어요. 먼저 인사를 건네 보세요 😊</p>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
            const dayLine = newDay && <p className="text-center text-[0.75rem] text-stone-500 my-2"><span className="bg-white/70 rounded-full px-3 py-1">{dayOf(m.created_at)}</span></p>;
            if (m.kind === 'system') return (
              <div key={m.id}>
                {dayLine}
                <p className="text-center my-1"><span className="inline-block text-[0.8125rem] text-stone-600 bg-white/80 border border-stone-200 rounded-full px-3.5 py-1">{m.content}</span></p>
              </div>
            );
            const mine = m.user_id === user.id;
            const a = m.user_id ? people[m.user_id] : undefined;
            const blocked = !!m.user_id && blockedIds.has(m.user_id);
            const grouped = !newDay && prev && prev.kind === 'text' && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60 * 1000;
            return (
              <div key={m.id}>
                {dayLine}
                <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '-mt-1' : ''}`}>
                  {!mine && (grouped ? <span className="w-10 shrink-0" /> : (
                    <button onClick={() => m.user_id && onOpenProfile(m.user_id)} className="shrink-0 self-start" aria-label={`${a?.baptismal_name || '교우'}님 공간`}>
                      {a?.avatar_url
                        ? <img loading="lazy" src={a.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                        : <span className="w-10 h-10 rounded-full bg-stone-300 text-stone-700 font-serif font-bold flex items-center justify-center">{initial(a?.baptismal_name, '교')}</span>}
                    </button>
                  ))}
                  <div className={`min-w-0 max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && !grouped && (
                      <span className="flex items-center gap-1 text-[0.8125rem] font-bold text-stone-700 mb-0.5 ml-1">
                        {a?.baptismal_name || '교우'}<RoleBadge type={a?.badge_type} size="xs" showLabel={false} />
                      </span>
                    )}
                    <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                      <button onClick={e => { e.stopPropagation(); if (!adminView || !mine) setMenuId(menuId === m.id ? null : m.id); }}
                        className={`text-left px-3.5 py-2 rounded-2xl text-[1rem] leading-relaxed whitespace-pre-wrap break-words ${blocked ? 'bg-white/60 text-stone-400 italic' : mine ? 'bg-emerald-700 text-white rounded-br-md' : 'bg-white text-stone-900 rounded-bl-md shadow-sm'}`}>
                        {blocked ? '차단한 교우의 메시지예요' : m.content}
                      </button>
                      <span className="shrink-0 text-[0.6875rem] text-stone-500 pb-0.5">{timeOf(m.created_at)}</span>
                    </div>
                    {menuId === m.id && (
                      <div className={`mt-1 flex gap-1.5 ${mine ? 'justify-end' : ''}`} onClick={e => e.stopPropagation()}>
                        {mine && !adminView && <button onClick={() => remove(m)} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-red-600"><Icon name="trash" className="w-[1.05em] h-[1.05em] inline-block align-[-0.2em] mr-1" />지우기</button>}
                        {!mine && m.user_id && <button onClick={() => { setMenuId(null); onOpenProfile(m.user_id!); }} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700">👤 프로필</button>}
                        {!mine && !adminView && m.user_id && <button onClick={() => { setMenuId(null); onReport({ type: 'user', id: m.user_id!, userId: m.user_id!, userName: a?.baptismal_name, preview: `[단체 채팅방 '${name}'] ${m.content}` }); }} className="text-[0.8125rem] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700"><Icon name="siren" className="w-[1.05em] h-[1.05em] inline-block align-[-0.2em] mr-1 text-red-500" />신고</button>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {newBelow > 0 && (
        <button onClick={() => scrollToBottom(true)} className="absolute left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] px-4 py-2 rounded-full bg-stone-900/85 text-white text-[0.875rem] font-bold shadow-lg">새 대화 {newBelow}개 ↓</button>
      )}

      {canWrite && (
        <form onSubmit={send} className="shrink-0 bg-white border-t border-stone-200 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 1000))}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            enterKeyHint={enterSends ? 'send' : 'enter'}
            onKeyDown={e => {
              if (e.key === 'Enter') shiftRef.current = e.shiftKey;
              if (e.key !== 'Enter' || e.shiftKey || !enterSends) return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              const typed = e.currentTarget.value;
              setTimeout(() => sendRef.current(typed), 0);
            }}
            rows={1}
            placeholder="메시지를 적어 주세요"
            className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[1rem] text-stone-900 focus:outline-none focus:border-stone-500"
            aria-label="단체 채팅방에 보낼 말"
          />
          <button type="submit" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} disabled={!input.trim() || sending} className="shrink-0 h-11 px-4 rounded-2xl bg-emerald-700 disabled:bg-stone-300 text-white font-bold text-[0.9375rem]">{sending ? '...' : '보내기'}</button>
        </form>
      )}

      {/* 참여한 교우 · 초대 · 이름 바꾸기 · 나가기 */}
      {showMembers && (
        <div className="fixed inset-0 z-[5] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowMembers(false)}>
          <div className="w-full sm:w-96 max-h-[85dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl pb-[env(safe-area-inset-bottom)]" onClick={e => e.stopPropagation()} role="dialog" aria-label="참여한 교우">
            <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between border-b border-stone-100">
              <h3 className="font-bold text-[1.125rem] text-stone-900 truncate">👥 {name} · {members.length}명</h3>
              <button onClick={() => setShowMembers(false)} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl" aria-label="닫기">×</button>
            </div>
            {canWrite && (
              <div className="shrink-0 px-4 py-3 grid grid-cols-2 gap-2 border-b border-stone-100">
                <button onClick={() => { setShowMembers(false); setShowInvite(true); }} className="py-2.5 rounded-xl bg-emerald-700 text-white text-[0.9375rem] font-bold">➕ 교우 초대</button>
                <button onClick={rename} className="py-2.5 rounded-xl border border-stone-300 text-stone-700 text-[0.9375rem] font-bold">✏️ 방 이름 바꾸기</button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {members.map(m => {
                const p = people[m.user_id];
                return (
                  <button key={m.user_id} onClick={() => { setShowMembers(false); onOpenProfile(m.user_id); }} className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-stone-50">
                    {p?.avatar_url
                      ? <img loading="lazy" src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                      : <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-700 font-serif font-bold flex items-center justify-center">{initial(p?.baptismal_name, '교')}</span>}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1 font-bold text-[0.9375rem] text-stone-900">{p?.baptismal_name || '교우'}{m.user_id === user.id && <span className="font-normal text-stone-400">(나)</span>}<RoleBadge type={p?.badge_type} size="xs" showLabel={false} /></span>
                      {p?.handle && <span className="block text-[0.8125rem] text-stone-500">@{p.handle}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {canWrite && <button onClick={leave} className="shrink-0 m-4 mt-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold">🚪 채팅방 나가기</button>}
          </div>
        </div>
      )}

      {showInvite && (
        <NewChat user={user} mode="invite" chatId={chatId} excludeIds={members.map(m => m.user_id)} blockedIds={blockedIds}
          onClose={() => setShowInvite(false)}
          onInvited={n => { setShowInvite(false); if (n > 0) { loadRoom(); onChanged?.(); } }} />
      )}
    </div>
  );
}
