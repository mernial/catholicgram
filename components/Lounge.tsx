'use client';

import { useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import RoleBadge from '@/components/RoleBadge';
import type { ReportTarget } from '@/components/ReportDialog';

// 모두의 사랑방 (supabase/lounge.sql)
// 모든 교우가 세례명으로 함께하는 실시간 대화방. 대화는 매일 자정(한국 시간)에 새로 시작한다.
// 관리자 글은 위쪽 칸(두 줄 높이, 오른쪽 정렬, 관리자 프로필과 함께)에, 교우들의 대화는 아래 칸에 따로 보인다.
// 새 대화·지운 대화는 Supabase 실시간으로 바로 받고, 실시간 연결이 안 되면 5초마다 확인한다.
// 사랑방 대화는 휴대폰 알림·알림음이 없다. 다만 '@관리자'로 부르면 관리자에게만 휴대폰 알림이 간다.

interface LoungeMessage { id: string; user_id: string; content: string; created_at: string; is_admin?: boolean }
interface Author { id: string; baptismal_name: string; avatar_url?: string | null; badge_type?: string | null }
interface Trashed { id: string; user_id: string | null; content: string | null; created_at: string | null; deleted_at: string; deleted_by: string | null }

const PAGE = 80;
const SETUP_HINT = '사랑방을 준비 중이에요. (관리자: supabase/lounge.sql 실행 필요)';
const isSetupError = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
// 오늘(한국 시간) 0시 — 이때부터의 대화만 보인다
const todayStartIso = () => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600e3).toISOString();
};
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

export const CALL_ADMIN = '@관리자';
// 관리자가 사랑방에 들어오면 교우 대화 칸에 작게 '관리자가 들어왔어요' (보이지 않는 표시 문자로 구분)
const ENTER_MARK = '\u2063';
const ENTER_TEXT = '관리자가 사랑방에 들어왔어요';
// '@관리자' 부분을 눈에 띄게
const withCall = (text: string, mine: boolean) => text.split(/(@관리자)/g).map((part, i) =>
  part === CALL_ADMIN ? <b key={i} className={mine ? 'text-amber-200' : 'text-amber-700'}>{part}</b> : part);

export const loungeSeenKey = (userId: string) => `loungeSeenAt:${userId}`;

export default function Lounge({ user, isAdmin, blockedIds, focusId, online = 0, stealth = false, onReveal, onClose, onOpenProfile, onReport, onCallAdmin, onAnnounce }: {
  user: User;
  isAdmin: boolean;
  blockedIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  focusId?: string | null;
  online?: number;                       // 지금 사랑방에 들어와 있는 교우 수 (화면(page)이 실시간으로 셈)               // 관리자 부름 알림으로 들어왔을 때 그 대화로
  onCallAdmin: (messageId: string) => void;
  onAnnounce?: (messageId: string) => Promise<string>; // 관리자: 모든 교우에게 휴대폰 알림 → 결과 문구
  stealth?: boolean;                     // 관리자 몰래 들어가기: 들어왔다는 안내 없이, 참여 인원에도 안 잡힘
  onReveal?: () => void;                 // 몰래 보다가 '들어왔다고 알리기'
}) {
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);         // 위로 올려 보는 중에 새로 온 대화 수
  const [banned, setBanned] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState<Trashed[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 엔터로 보내기: 컴퓨터(마우스)와 아이패드처럼 화면이 큰 기기. 휴대폰은 엔터가 줄바꿈 (보내기 단추로 전송)
  const [enterSends, setEnterSends] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine), (min-width: 700px)');
    const on = () => setEnterSends(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // 한글 조합 중에 엔터를 누르면 keydown 을 건너뛰고 줄바꿈이 들어오려 함 → 그 줄바꿈 입력을 막고 보낸다
  const shiftRef = useRef(false);
  const composingRef = useRef(false); // 한글 자음·모음을 조합하는 중인지
  const sendRef = useRef<(typed: string) => void>(() => {});
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta || !enterSends) return;
    const onBeforeInput = (ev: InputEvent) => {
      if ((ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph') && !shiftRef.current) {
        ev.preventDefault();
        const typed = ta.value;
        setTimeout(() => sendRef.current(typed), 0);
      }
    };
    ta.addEventListener('beforeinput', onBeforeInput);
    return () => ta.removeEventListener('beforeinput', onBeforeInput);
  }, [enterSends, trash === null]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const atBottomRef = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);
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

  // 관리자가 들어왔다고 대화에 작게 알림 (10분 안에 이미 알렸으면 생략 — 들락날락해도 도배되지 않게)
  const postEnterNotice = (rows: LoungeMessage[]) => {
    const recent = rows.some(r => r.user_id === user.id && r.content.startsWith(ENTER_MARK) && Date.now() - new Date(r.created_at).getTime() < 10 * 60 * 1000);
    if (recent) return;
    supabase.from('lounge_messages').insert({ content: ENTER_MARK + ENTER_TEXT }).select('*').single()
      .then(({ data: d }) => { if (d) addMessages([d as LoungeMessage]); });
  };
  const reveal = () => { postEnterNotice(messagesRef.current); onReveal?.(); };

  const markSeen = () => { try { localStorage.setItem(loungeSeenKey(user.id), new Date().toISOString()); } catch { /* 무시 */ } };

  // 처음 불러오기
  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.from('lounge_messages').select('*')
        .gte('created_at', todayStartIso()).order('created_at', { ascending: false }).limit(PAGE);
      setLoading(false);
      if (e) { setError(isSetupError(e) ? SETUP_HINT : '대화를 불러오지 못했어요.'); return; }
      const rows = (data || []).reverse();
      setMessages(rows);
      setHasOlder((data || []).length === PAGE);
      loadAuthors(rows.map(r => r.user_id));
      markSeen();
      if (!(focusId && rows.some(r => r.id === focusId))) setTimeout(() => scrollToBottom(), 50); // 부른 대화가 있으면 아래 효과가 그리로
      if (isAdmin) {
        loadAuthors([user.id]); // 위 칸에 관리자 프로필
        if (!stealth) postEnterNotice(rows); // 몰래 들어가기면 알리지 않는다
        const { data: b } = await supabase.from('lounge_bans').select('user_id');
        setBanned(new Set((b || []).map(x => x.user_id)));
      }
    })();
    return () => markSeen();
  }, []);

  // 관리자 부름 알림으로 열면 그 대화로 옮겨 잠깐 강조. 사랑방이 이미 열려 있을 때 알림을 눌러도,
  // 그 대화가 아직 화면에 안 왔으면 실시간으로 들어오는 대로
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || loading || focusedRef.current === focusId || !messages.some(m => m.id === focusId)) return;
    focusedRef.current = focusId;
    atBottomRef.current = false;
    setHighlightId(focusId);
    setTimeout(() => document.getElementById(`lounge-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    setTimeout(() => setHighlightId(h => (h === focusId ? null : h)), 8000);
  }, [focusId, loading, messages]);

  // 실시간: 새 대화·지운 대화 (함께 있는 교우 수는 화면(page)의 lounge-presence 채널이 셈)
  useEffect(() => {
    let live = false;
    const channel = supabase.channel('lounge-db')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_messages' }, payload => {
        addMessages([payload.new as LoungeMessage]);
        markSeen();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lounge_messages' }, payload => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages(prev => prev.filter(m => m.id !== id));
      })
      .subscribe(status => { live = status === 'SUBSCRIBED'; });
    // 실시간 연결이 안 되는 환경이면 5초마다 새 대화 확인
    const poll = setInterval(async () => {
      if (live || document.visibilityState === 'hidden') return;
      const last = messagesRef.current[messagesRef.current.length - 1];
      const q = supabase.from('lounge_messages').select('*').order('created_at', { ascending: true }).limit(50)
        .gt('created_at', last && last.created_at > todayStartIso() ? last.created_at : todayStartIso());
      const { data } = await q;
      if (data) addMessages(data);
    }, 5000);
    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, []);
  // 자정이 지나면 화면의 대화도 비운다 (서버는 지난 대화를 보여 주지 않고 새 글이 올라올 때 지움)
  const [dayStart, setDayStart] = useState(todayStartIso);
  useEffect(() => {
    const t = setInterval(() => { const d = todayStartIso(); if (d !== dayStart) { setDayStart(d); setMessages([]); setHasOlder(false); } }, 20000);
    return () => clearInterval(t);
  }, [dayStart]);
  // 열면 최신 대화(맨 아래)부터: 프로필 사진이 늦게 불러와져 내용이 길어져도 맨 아래를 보고 있었으면 계속 맨 아래에
  useEffect(() => {
    const list = listRef.current, content = contentRef.current;
    if (!list || !content) return;
    const stick = () => { if (atBottomRef.current) list.scrollTop = list.scrollHeight; };
    const ro = new ResizeObserver(stick);
    ro.observe(content); ro.observe(list); // 키보드가 올라와 칸이 줄어들 때도
    stick();
    return () => ro.disconnect();
  }, [trash === null]);
  // 새 대화가 오면: 맨 아래를 보고 있었으면 따라 내려간다
  useEffect(() => { if (atBottomRef.current) scrollToBottom(true); }, [messages.length]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight : 0;
    const { data } = await supabase.from('lounge_messages').select('*')
      .lt('created_at', first.created_at).gte('created_at', todayStartIso()).order('created_at', { ascending: false }).limit(PAGE);
    const rows = (data || []).reverse();
    setHasOlder((data || []).length === PAGE);
    atBottomRef.current = false;
    setMessages(prev => [...rows, ...prev]);
    loadAuthors(rows.map(r => r.user_id));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  const lastSendRef = useRef({ text: '', at: 0 });
  sendRef.current = (typed: string) => {
    // 엔터 한 번에 두 번 보내지지 않게
    const now = Date.now();
    if (typed.trim() === lastSendRef.current.text && now - lastSendRef.current.at < 1000) return;
    lastSendRef.current = { text: typed.trim(), at: now };
    send(undefined, typed);
  };
  const send = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    if (sending) return;
    const ta = inputRef.current;
    const raw = typed ?? ta?.value ?? input;
    const text = raw.trim();
    if (!text) return;
    // 자판이 올라와 있었으면 보낸 뒤에도 그대로 (입력창에 다시 초점)
    const keepKeyboard = typeof document !== 'undefined' && !!ta && document.activeElement === ta;
    // 아직 조합 중인 글자(예: 마지막 '다')를 먼저 끝맺는다. 조합 중에 입력창을 비우면
    // 다음에 칠 때 그 글자가 되살아나거나 자음·모음이 흩어지고 글자가 사라진다
    if (keepKeyboard && composingRef.current && ta) { ta.blur(); ta.focus(); composingRef.current = false; }
    // 입력창은 바로 비운다: 보내는 동안 이어서 친 글자가 나중에 지워지지 않게 (못 보내면 되돌림)
    setInput('');
    setSending(true);
    const { data, error: err } = await supabase.from('lounge_messages').insert({ content: text.slice(0, 500) })
      .select('*').single();
    setSending(false);
    if (keepKeyboard) setTimeout(() => inputRef.current?.focus(), 0);
    if (err) {
      setInput(cur => (cur.trim() ? cur : raw));
      alert(isSetupError(err) ? SETUP_HINT : /천천히|제한/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err.message})`);
      return;
    }
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
      .select('*').single();
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

  // 관리자 글(위 칸)과 교우 대화(아래 칸). SQL 실행 전(is_admin 없음)에는 관리자 본인 글만 위로
  const isAdminMsg = (m: LoungeMessage) => m.is_admin === true || (m.is_admin === undefined && isAdmin && m.user_id === user.id);
  const today = messages.filter(m => m.created_at >= dayStart);
  const isEnter = (m: LoungeMessage) => m.content.startsWith(ENTER_MARK) && m.is_admin !== false;
  const adminMsgs = today.filter(m => isAdminMsg(m) && !isEnter(m));
  const shown = today.filter(m => (isEnter(m) || !isAdminMsg(m)) && !blockedIds.has(m.user_id));
  const adminRef = useRef<HTMLDivElement>(null);
  const adminAtBottom = useRef(true);
  useEffect(() => { const el = adminRef.current; if (el) { adminAtBottom.current = true; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); } }, [adminMsgs.length]);
  // 자판이 올라와 화면이 줄어도(폴드·아이패드의 오른쪽 관리자 칸) 최신 말씀이 보이게 맨 아래에 붙여 둔다
  useEffect(() => {
    const el = adminRef.current;
    if (!el) return;
    const onScroll = () => { adminAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    const ro = new ResizeObserver(() => { if (adminAtBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [trash === null]);

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
      {isAdmin && stealth && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-stone-800 text-white">
          <span className="flex-1 min-w-0 text-[0.8125rem] leading-snug">🤫 몰래 보는 중이에요 · 들어왔다는 안내가 없고, 참여 인원에도 안 잡혀요</span>
          <button onClick={reveal} className="shrink-0 px-3 py-1.5 rounded-full bg-white text-stone-900 text-[0.8125rem] font-bold">들어왔다고 알리기</button>
        </div>
      )}

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
      // 휴대폰: 위 칸(관리자) + 아래 칸(교우 대화). 아이패드처럼 넓은 화면: 왼쪽 교우 대화 + 오른쪽 관리자 기둥
      <div className="flex-1 min-h-0 flex flex-col md:flex-row-reverse">
      {/* 관리자 글 (휴대폰은 두 줄 높이, 오른쪽 정렬, 새 글이 오면 아래로 따라감) + 관리자 프로필 */}
      {(() => {
        const adminId = adminMsgs.length > 0 ? adminMsgs[adminMsgs.length - 1].user_id : (isAdmin ? user.id : null);
        const a = adminId ? authors[adminId] : undefined;
        return (
          <div className="shrink-0 bg-gradient-to-b from-[#fff6e0] to-[#fdf0d2] border-b-2 border-amber-200 px-3 py-2 flex items-center gap-2.5
            md:w-[36%] md:max-w-[26rem] md:flex-col-reverse md:items-stretch md:justify-end md:border-b-0 md:border-l-2 md:px-4 md:py-3 md:gap-2">
            <div ref={adminRef} className="flex-1 min-w-0 h-[3.3rem] overflow-y-auto overscroll-contain text-right md:h-auto md:min-h-0 md:flex md:flex-col md:gap-2" aria-label="관리자 말씀">
              {adminMsgs.length === 0 ? (
                <p className="text-[0.875rem] leading-[3.3rem] text-amber-800/60 md:leading-normal md:mt-2">📢 오늘의 관리자 말씀이 여기에 보여요</p>
              ) : adminMsgs.map(m => (
                <p key={m.id} id={`lounge-${m.id}`} className="text-[1rem] leading-[1.65rem] text-stone-900 whitespace-pre-wrap break-words md:bg-white/70 md:rounded-2xl md:rounded-tr-md md:px-3.5 md:py-2 md:shadow-sm md:self-end md:max-w-full">
                  {withCall(m.content, false)}
                  <span className="ml-1.5 text-[0.6875rem] text-amber-800/70 whitespace-nowrap">{timeOf(m.created_at)}</span>
                  {isAdmin && <button onClick={() => remove(m)} className="ml-1 text-stone-400 text-base leading-none align-middle" aria-label="이 말씀 지우기">×</button>}
                </p>
              ))}
            </div>
            <button onClick={() => adminId && onOpenProfile(adminId)} className="shrink-0 w-[3.6rem] flex flex-col items-center md:w-auto md:flex-row md:justify-end md:gap-2 md:pb-2 md:border-b md:border-amber-200" aria-label="관리자 공간">
              {a?.avatar_url
                ? <img src={a.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-amber-300" />
                : <span className="w-11 h-11 rounded-full bg-amber-200 text-amber-900 font-serif font-bold flex items-center justify-center border-2 border-amber-300">{a?.baptismal_name?.[0] || '📢'}</span>}
              <span className="mt-0.5 max-w-full text-[0.6875rem] font-bold text-amber-900 truncate flex items-center gap-0.5 md:order-first md:mt-0 md:text-[0.9375rem]"><span className="hidden md:inline text-amber-700 font-normal mr-1">📢 관리자 말씀 ·</span>{a?.baptismal_name || '관리자'}<RoleBadge type={a?.badge_type} size="xs" showLabel={false} /></span>
            </button>
          </div>
        );
      })()}
      <div ref={listRef} onScroll={e => {
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottomRef.current && newBelow) setNewBelow(0);
      }} className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col" onClick={() => setMenuId(null)}>
        {/* 대화가 적으면 입력창 바로 위에 붙어 보이게 (mt-auto) */}
        <div ref={contentRef} className="mt-auto flex flex-col gap-2">
        <div className="mx-auto max-w-sm text-center text-[0.8125rem] text-stone-500 bg-white/70 rounded-2xl px-4 py-2.5 mb-1 leading-relaxed">
          모든 교우가 함께 보는 대화방이에요 🙏<br />서로 존중하는 말로 나눠 주세요. 대화는 매일 자정에 새로 시작돼요.<br />도움이 필요하면 <b className="text-amber-700">🙋 관리자 부르기</b>를 눌러 주세요.
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
          // 관리자 입장 알림: 가운데 작은 안내
          if (isEnter(m)) return (
            <div key={m.id} id={`lounge-${m.id}`}>
              {newDay && <p className="text-center text-[0.75rem] text-stone-500 my-2"><span className="bg-white/70 rounded-full px-3 py-1">{dayOf(m.created_at)}</span></p>}
              <p className="text-center my-1">
                <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-amber-900 bg-amber-100/80 border border-amber-200 rounded-full px-3.5 py-1">
                  <span>🙋 관리자 {a?.baptismal_name ? <><b>{a.baptismal_name}</b>님이</> : '가'} 들어왔어요</span><span className="text-[0.6875rem] text-amber-800/60">{timeOf(m.created_at)}</span>
                </span>
              </p>
            </div>
          );
          const grouped = !newDay && prev && !isEnter(prev) && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60 * 1000;
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
      </div>
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
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            enterKeyHint={enterSends ? 'send' : 'enter'}
            onKeyDown={e => {
              // 엔터 = 보내기, 쉬프트+엔터 = 줄바꿈 (컴퓨터·아이패드 등 큰 화면). 한글 조합 중인 엔터는 글자 완성이므로 건너뜀
              if (e.key === 'Enter') shiftRef.current = e.shiftKey;
              if (e.key !== 'Enter' || e.shiftKey || !enterSends) return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              const typed = e.currentTarget.value; // 방금 완성된 글자까지 포함 (화면 갱신 전에 읽음)
              setTimeout(() => sendRef.current(typed), 0);
            }}
            rows={1}
            placeholder="사랑방에 한마디..."
            className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[1rem] focus:outline-none focus:border-stone-500"
            aria-label="사랑방에 보낼 말"
          />
          {/* 보내기를 눌러도 입력창 초점을 뺏지 않게 → 자판이 내려가지 않음 */}
          <button type="submit" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} disabled={!input.trim() || sending || !!error} className="shrink-0 h-11 px-4 rounded-2xl bg-[#4d6a45] disabled:bg-stone-300 text-white font-bold text-[0.9375rem]">{sending ? '...' : '보내기'}</button>
        </form>
        </div>
      )}
    </div>
  );
}
