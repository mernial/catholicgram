'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import RoleBadge from '@/components/RoleBadge';
import type { ReportTarget } from '@/components/ReportDialog';
import MentionSuggest from '@/components/MentionSuggest';
import { extractMentions } from '@/lib/mentions';
import { initial } from '@/lib/fancy-name';
import MessageMenu, { REACTION_EMOJIS, MORE_EMOJIS, SwipeHint, anchorOf, type MenuAnchor } from '@/components/MessageMenu';
import { usePressGestures } from '@/lib/use-press-gestures';
import { closePanelOnInputFocus, leaveInputForPanel, useEnterSend, useTypeToInput } from '@/lib/use-enter-send';
import StickerPanel, { StickerAbove, StickerButton, StickerImage, StickerWithText, useCloseStickersOnTap, useStickerPicker } from '@/components/StickerPanel';
import { chatPreview, chatStickerParts, chatText, hasStickerSuggestion, joinChatSticker, parseSticker, stickerText, type Sticker } from '@/lib/stickers';
import { useChatMedia, ChatMediaView, MEDIA_SETUP_HINT, isMissingColumn, QuoteThumb, quoteLabel } from '@/components/ChatMedia';
import { renderCapture, visibleIds, CaptureChoice, CaptureBar, CapturePreview, type CaptureItem } from '@/components/ChatCapture';
import { SelectCopySheet, BookmarkSheet, JumpToLatest, TypingIndicator } from '@/components/ChatSheets';
import { useTyping } from '@/lib/typing';
import { copyText, toast, useBookmarks, useHiddenMessages } from '@/lib/chat-actions';
import { isMediaOnlyText, isVideoUrl } from '@/lib/upload';
import { askConfirm } from '@/components/ConfirmDialog';

// 모두의 사랑방 (supabase/lounge.sql)
// 모든 교우가 세례명으로 함께하는 실시간 대화방. 대화는 매일 자정(한국 시간)에 새로 시작한다.
// 관리자 글은 위쪽 칸(두 줄 높이, 오른쪽 정렬, 관리자 프로필과 함께)에, 교우들의 대화는 아래 칸에 따로 보인다.
// 새 대화·지운 대화는 Supabase 실시간으로 바로 받고, 실시간 연결이 안 되면 5초마다 확인한다.
// 사랑방 대화는 휴대폰 알림·알림음이 없다. 다만 '@관리자'로 부르면 관리자에게만, '@아이디'로 부르면 그 교우에게만 휴대폰 알림이 간다.
// 관리자는 기본으로 몰래 들어오고(위쪽 '들어왔다고 알리기'), 대화 얼리기·모두 지우기·교우 뱃지를 쓸 수 있다 (supabase/lounge-admin.sql).

interface LoungeMessage { id: string; user_id: string; content: string; created_at: string; is_admin?: boolean; reply_to?: string | null; image_url?: string | null; images?: string[] | null }
interface Reaction { user_id: string; emoji: string }
const ALL_EMOJIS = [...REACTION_EMOJIS, ...MORE_EMOJIS];
interface Author { id: string; baptismal_name: string; avatar_url?: string | null; badge_type?: string | null }
interface Trashed { id: string; user_id: string | null; content: string | null; created_at: string | null; deleted_at: string; deleted_by: string | null; image_url?: string | null; images?: string[] | null }

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
// 관리자 안내(대화 칸 가운데 작은 글): 보이지 않는 표시 문자 + 종류 글자 (교우 글에서는 서버가 이 표시를 지운다)
const SYS_MARK = '\u2064';
const SYS = { freeze: `${SYS_MARK}F`, unfreeze: `${SYS_MARK}U`, clear: `${SYS_MARK}C` };
const SYS_TEXT = { freeze: '❄️ 관리자가 대화를 잠시 멈췄어요', unfreeze: '🌤 대화를 다시 나눌 수 있어요', clear: '🧹 관리자가 대화를 모두 정리했어요' };
type SysKind = 'enter' | 'freeze' | 'unfreeze' | 'clear';
const sysKind = (m: { content: string; is_admin?: boolean }): SysKind | null => {
  if (m.is_admin === false) return null;
  if (m.content.startsWith(ENTER_MARK)) return 'enter';
  if (m.content.startsWith(SYS.freeze)) return 'freeze';
  if (m.content.startsWith(SYS.unfreeze)) return 'unfreeze';
  if (m.content.startsWith(SYS.clear)) return 'clear';
  return null;
};
// '모두 지우기' 안내가 오면 그 앞의 대화는 화면에서도 뺀다 (얼림 상태 표시는 남김)
const applyClear = <T extends { content: string; is_admin?: boolean; created_at: string }>(list: T[]) => {
  const last = [...list].reverse().find(m => sysKind(m) === 'clear');
  if (!last) return list;
  return list.filter(m => m.created_at >= last.created_at || sysKind(m) === 'freeze' || sysKind(m) === 'unfreeze');
};
// 자정부터 아침 8시(한국 시간)까지는 관리자를 부를 수 없다
const callQuietNow = () => new Date(Date.now() + 9 * 3600e3).getUTCHours() < 8;
const QUIET_NOTICE = '자정부터 아침 8시까지는 관리자를 부를 수 없어요.\n아침 8시 이후에 다시 불러 주세요 🙏';
// '@관리자'·'@아이디' 부분을 눈에 띄게
const withCall = (text: string, mine: boolean) => text.split(/(@[0-9A-Za-z_가-힣][0-9A-Za-z_.가-힣]{0,29})/g).map((part, i) =>
  part === CALL_ADMIN ? <b key={i} className={mine ? 'text-amber-200' : 'text-amber-700'}>{part}</b>
    : i % 2 === 1 ? <b key={i} className={mine ? 'text-sky-200' : 'text-sky-700'}>{part}</b> : part);

export const loungeSeenKey = (userId: string) => `loungeSeenAt:${userId}`;

export default function Lounge({ user, isAdmin, blockedIds, focusId, online = 0, onlineIds = [], stealth = false, onReveal, onClose, onOpenProfile, onReport, onCallAdmin, onMention, onAnnounce, onZoom }: {
  user: User;
  isAdmin: boolean;
  blockedIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  focusId?: string | null;
  online?: number;
  onlineIds?: string[];                  // 지금 들어와 있는 교우 (관리자는 누가 있는지 볼 수 있음)                       // 지금 사랑방에 들어와 있는 교우 수 (화면(page)이 실시간으로 셈)               // 관리자 부름 알림으로 들어왔을 때 그 대화로
  onCallAdmin: (messageId: string) => void;
  onMention?: (messageId: string) => void; // '@아이디'로 부른 교우에게 알림
  onAnnounce?: (messageId: string) => Promise<string>; // 관리자: 모든 교우에게 휴대폰 알림 → 결과 문구
  stealth?: boolean;                     // 관리자 몰래 들어가기: 들어왔다는 안내 없이, 참여 인원에도 안 잡힘
  onReveal?: () => void;                 // 몰래 보다가 '들어왔다고 알리기'
  onZoom?: (images: string[], index: number) => void; // 사진 크게 보기
}) {
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuMsg, setMenuMsg] = useState<LoungeMessage | null>(null);   // 꾹 누른 글 (그 자리 메뉴)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const setMenuId = (id: null) => { void id; setMenuMsg(null); };        // 메뉴 닫기 (예전 이름)
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [heartPop, setHeartPop] = useState<{ id: string; emoji: string } | null>(null);
  const [selectCopy, setSelectCopy] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const bookmarks = useBookmarks(user.id, 'lounge');
  const hiddenMsgs = useHiddenMessages(user.id, 'lounge');
  const [captureAsk, setCaptureAsk] = useState<string | null>(null);
  const [capturePick, setCapturePick] = useState<Set<string> | null>(null);
  const [captured, setCaptured] = useState<Blob | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [newBelow, setNewBelow] = useState(0);         // 위로 올려 보는 중에 새로 온 대화 수
  const [banned, setBanned] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState<Trashed[] | null>(null);
  const [badges, setBadges] = useState<Record<string, string>>({}); // 관리자가 단 교우 뱃지
  const [badgeEdit, setBadgeEdit] = useState<string | null>(null);   // 관리자: 뱃지를 고치는 교우
  const [badgeText, setBadgeText] = useState('');
  const [showBadgeList, setShowBadgeList] = useState(false);         // 관리자: 뱃지 단 교우 모아 보기
  const [showWho, setShowWho] = useState(false);                     // 관리자: 지금 들어와 있는 교우
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 엔터: 휴대폰·태블릿은 줄바꿈(보내기 단추로 전송), 컴퓨터는 보내기 (lib/use-enter-send, 1:1 메시지·단체방과 같음)
  const composingRef = useRef(false); // 한글 자음·모음을 조합하는 중인지
  const sendRef = useRef<(typed: string) => void>(() => {});
  const enter = useEnterSend(typed => sendRef.current(typed), input);
  const enterRef = enter.ref;
  const setInputEl = useCallback((el: HTMLTextAreaElement | null) => { inputRef.current = el; enterRef(el); }, [enterRef]);
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
      return applyClear([...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    });
    loadAuthors(rows.map(r => r.user_id));
  };

  // 관리자가 들어왔다고 대화에 작게 알림 (10분 안에 이미 알렸으면 생략 — 들락날락해도 도배되지 않게)
  const postEnterNotice = (rows: LoungeMessage[], force = false) => {
    const recent = rows.some(r => r.user_id === user.id && r.content.startsWith(ENTER_MARK) && Date.now() - new Date(r.created_at).getTime() < 10 * 60 * 1000);
    if (recent && !force) return;
    supabase.from('lounge_messages').insert({ content: ENTER_MARK + ENTER_TEXT }).select('*').single()
      .then(({ data: d, error: err }) => { if (d) addMessages([d as LoungeMessage]); else if (err) alert(`알리지 못했어요.\n(${err.message})`); });
  };
  const reveal = () => { postEnterNotice(messagesRef.current, true); onReveal?.(); };

  const markSeen = () => { try { localStorage.setItem(loungeSeenKey(user.id), new Date().toISOString()); } catch { /* 무시 */ } };

  // 처음 불러오기
  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.from('lounge_messages').select('*')
        .gte('created_at', todayStartIso()).order('created_at', { ascending: false }).limit(PAGE);
      setLoading(false);
      if (e) { setError(isSetupError(e) ? SETUP_HINT : '대화를 불러오지 못했어요.'); return; }
      const rows = applyClear((data || []).reverse());
      setMessages(rows);
      setHasOlder((data || []).length === PAGE);
      loadAuthors(rows.map(r => r.user_id));
      markSeen();
      supabase.from('lounge_badges').select('user_id, label')
        .then(({ data: bd }) => { if (bd) setBadges(Object.fromEntries(bd.map(x => [x.user_id, x.label]))); });
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
    if (stickerPick.picked) { submit(); return; }
    send(undefined, typed);
  };
  const send = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    if (sending) return;
    const ta = inputRef.current;
    const raw = typed ?? ta?.value ?? input;
    const text = raw.trim();
    if (!text) return;
    if (!isAdmin && text.includes(CALL_ADMIN) && callQuietNow()) { alert(QUIET_NOTICE); return; }
    // 자판이 올라와 있었으면 보낸 뒤에도 그대로 (입력창에 다시 초점)
    const keepKeyboard = typeof document !== 'undefined' && !!ta && document.activeElement === ta;
    // 아직 조합 중인 글자(예: 마지막 '다')를 먼저 끝맺는다. 조합 중에 입력창을 비우면
    // 다음에 칠 때 그 글자가 되살아나거나 자음·모음이 흩어지고 글자가 사라진다
    if (keepKeyboard && composingRef.current && ta) { ta.blur(); ta.focus(); composingRef.current = false; }
    // 입력창은 바로 비운다: 보내는 동안 이어서 친 글자가 나중에 지워지지 않게 (못 보내면 되돌림)
    setInput('');
    setSending(true);
    const reply = replyTo;
    setReplyTo(null);
    typing.stop();
    let { data, error: err } = await supabase.from('lounge_messages').insert({ content: text.slice(0, 500), ...(reply ? { reply_to: reply.id } : {}) })
      .select('*').single();
    // 답장 칸이 아직 없으면(SQL 실행 전) 답장 표시 없이라도 보낸다
    if (err && reply && isMissingColumn(err)) {
      ({ data, error: err } = await supabase.from('lounge_messages').insert({ content: text.slice(0, 500) }).select('*').single());
      if (!err) alert(MEDIA_SETUP_HINT);
    }
    setSending(false);
    if (keepKeyboard) setTimeout(() => inputRef.current?.focus(), 0);
    if (err) {
      setReplyTo(reply);
      setInput(cur => (cur.trim() ? cur : chatText(raw)));
      alert(isSetupError(err) ? SETUP_HINT : /천천히|제한|멈췄/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err.message})`);
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
    // '@아이디'로 부른 교우에게만 휴대폰 알림 (누르면 사랑방 이 대화로)
    if (data && onMention && extractMentions(text).some(h => h !== '관리자')) {
      onMention(data.id);
      setNotice('🔔 부른 교우에게 알림을 보냈어요');
      setTimeout(() => setNotice(''), 4000);
    }
  };

  // 이모티콘 보내기 (입력칸에 쓰던 글은 그대로)
  const sendSticker = async (s: Sticker) => {
    if (sending || error || (frozen && !isAdmin)) return;
    setSending(true);
    const reply = replyTo;
    setReplyTo(null);
    const content = stickerText(s);
    let { data, error: err } = await supabase.from('lounge_messages').insert({ content, ...(reply ? { reply_to: reply.id } : {}) }).select('*').single();
    if (err && reply && isMissingColumn(err)) ({ data, error: err } = await supabase.from('lounge_messages').insert({ content }).select('*').single());
    setSending(false);
    if (err) {
      setReplyTo(reply);
      alert(isSetupError(err) ? SETUP_HINT : /천천히|제한|멈췄/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err.message})`);
      return;
    }
    atBottomRef.current = true;
    if (data) addMessages([data]);
  };
  const stickerPick = useStickerPicker(sendSticker);
  const stickerTap = useCloseStickersOnTap(stickerPick); // 이모티콘 칸이 떠 있을 때 대화 칸을 톡 누르면 닫힘
  // 보내기: 고른 이모티콘이 있으면 입력칸의 글과 함께 한 메시지로(한 말풍선에 이모티콘 + 글), 글이 없으면 이모티콘만
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const picked = stickerPick.picked;
    if (picked) {
      const rest = (inputRef.current?.value ?? input).trim();
      if (!rest) { await stickerPick.sendPicked(); return; }
      stickerPick.setPicked(null);
      send(undefined, joinChatSticker(rest.slice(0, 450), picked));
      return;
    }
    send();
  };

  // 관리자: '관리자가 사랑방에 왔어요' — 사랑방에 📢 안내 글을 올리고 모든 교우에게 휴대폰 알림
  const announce = async () => {
    if (!onAnnounce || sending) return;
    const text = input.trim() || '관리자가 사랑방에 왔어요! 함께 이야기 나눠요 😊';
    if (!(await askConfirm(`모든 교우의 휴대폰으로 알림을 보낼까요?\n\n"${text}"\n\n(사랑방에도 안내 글로 올라가요 · 30분에 한 번)`))) return;
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
    if (!(await askConfirm('이 대화를 지울까요?'))) return;
    const { error: err } = await supabase.from('lounge_messages').delete().eq('id', m.id);
    if (err) { alert(`지우지 못했어요.\n(${err.message})`); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  };

  const toggleBan = async (userId: string) => {
    setMenuId(null);
    const name = authors[userId]?.baptismal_name || '이 교우';
    if (banned.has(userId)) {
      if (!(await askConfirm(`${name}님의 사랑방 대화 금지를 풀까요?`))) return;
      const { error: err } = await supabase.from('lounge_bans').delete().eq('user_id', userId);
      if (err) { alert(err.message); return; }
      setBanned(prev => { const n = new Set(prev); n.delete(userId); return n; });
    } else {
      if (!(await askConfirm(`${name}님이 사랑방에 글을 쓰지 못하게 할까요?\n(읽기는 할 수 있어요. 나중에 풀 수 있어요)`))) return;
      const { error: err } = await supabase.from('lounge_bans').insert({ user_id: userId });
      if (err) { alert(err.message); return; }
      setBanned(prev => new Set(prev).add(userId));
    }
  };

  // 관리자: 대화 얼리기 / 다시 열기 (얼리면 교우는 읽기만, 서버도 막음)
  const toggleFreeze = async () => {
    if (!frozen && !(await askConfirm('사랑방 대화를 잠시 얼릴까요?\n교우들은 읽기만 하고 글을 쓸 수 없어요. (관리자는 쓸 수 있어요)'))) return;
    const kind = frozen ? 'unfreeze' : 'freeze';
    const { data, error: err } = await supabase.from('lounge_messages').insert({ content: SYS[kind] + SYS_TEXT[kind] }).select('*').single();
    if (err || !data) { alert(`바꾸지 못했어요.\n(${err?.message || ''})`); return; }
    atBottomRef.current = true;
    addMessages([data as LoungeMessage]);
  };
  // 관리자: 오늘 대화를 한꺼번에 지우기 (지운 대화 보관함에는 남음)
  const clearAll = async () => {
    if (!(await askConfirm('오늘 사랑방 대화를 모두 지울까요?\n(지운 대화는 위의 \u2018지운 대화\u2019에서 볼 수 있어요)'))) return;
    const { error: err } = await supabase.from('lounge_messages').delete().gte('created_at', todayStartIso())
      .not('content', 'like', `${SYS.freeze}%`).not('content', 'like', `${SYS.unfreeze}%`);
    if (err) { alert(`지우지 못했어요.\n(${err.message})`); return; }
    const { data } = await supabase.from('lounge_messages').insert({ content: SYS.clear + SYS_TEXT.clear }).select('*').single();
    setMessages(prev => applyClear(data ? [...prev, data as LoungeMessage] : prev.filter(m => sysKind(m) === 'freeze' || sysKind(m) === 'unfreeze')));
    setHasOlder(false);
  };
  // 관리자: 교우 뱃지 달기·바꾸기·떼기 (이름을 누르거나, 대화를 누르거나, 위쪽 '뱃지 목록'에서)
  const BADGE_SETUP = '뱃지 기능을 준비 중이에요. (관리자: supabase/lounge-admin.sql 실행 필요)';
  const openBadgeEdit = (userId: string) => {
    setMenuId(null);
    setBadgeText(badges[userId] || '⭐ 사랑방 지기');
    setBadgeEdit(userId);
  };
  const saveBadge = async () => {
    if (!badgeEdit) return;
    const label = badgeText.trim().slice(0, 20);
    if (!label) return;
    const { error: err } = await supabase.from('lounge_badges').upsert({ user_id: badgeEdit, label });
    if (err) { alert(isSetupError(err) ? BADGE_SETUP : err.message); return; }
    setBadges(prev => ({ ...prev, [badgeEdit]: label }));
    setBadgeEdit(null);
  };
  const removeBadge = async (userId: string) => {
    const name = authors[userId]?.baptismal_name || '이 교우';
    if (!(await askConfirm(`${name}님의 뱃지 '${badges[userId]}'를 뗄까요?`))) return;
    const { error: err } = await supabase.from('lounge_badges').delete().eq('user_id', userId);
    if (err) { alert(isSetupError(err) ? BADGE_SETUP : err.message); return; }
    setBadges(prev => { const n = { ...prev }; delete n[userId]; return n; });
    setBadgeEdit(null);
  };
  const openBadgeList = () => { loadAuthors(Object.keys(badges)); setShowBadgeList(true); };

  const openTrash = async () => {
    if (trash) { setTrash(null); return; }
    const { data, error: err } = await supabase.from('lounge_trash').select('*').order('deleted_at', { ascending: false }).limit(100);
    if (err) { alert(err.message); return; }
    setTrash((data || []) as Trashed[]);
    loadAuthors((data || []).map(t => t.user_id).filter(Boolean) as string[]);
  };

  // ── 꾹 누르기 메뉴 · 감정 표시 · 답장 · 사진 · 책갈피 · 캡처 (1:1 메시지·단체방과 같게) ──
  // 감정 표시: 5초마다 오늘 대화의 감정을 다시 읽는다 (SQL 실행 전이면 조용히 그만)
  const reactionsMissing = useRef(false);
  const savingReactions = useRef<Set<string>>(new Set());
  const loadReactions = async (ids: string[]) => {
    if (ids.length === 0 || reactionsMissing.current) return;
    const { data, error: err } = await supabase.from('lounge_reactions').select('message_id, user_id, emoji').in('message_id', ids);
    if (err) { if (isSetupError(err) || isMissingColumn(err)) reactionsMissing.current = true; return; }
    setReactions(prev => {
      const next = { ...prev };
      ids.forEach(id => { if (!savingReactions.current.has(id)) delete next[id]; });
      (data as (Reaction & { message_id: string })[]).forEach(r => {
        if (savingReactions.current.has(r.message_id)) return;
        next[r.message_id] = [...(next[r.message_id] || []), { user_id: r.user_id, emoji: r.emoji }];
      });
      return next;
    });
  };
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== 'hidden') loadReactions(messagesRef.current.slice(-PAGE).map(m => m.id)); };
    const first = setTimeout(tick, 600);
    const t = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const react = async (m: LoungeMessage, emoji: string) => {
    const before = reactions[m.id] || [];
    const off = before.find(r => r.user_id === user.id)?.emoji === emoji;
    setReactions(prev => ({ ...prev, [m.id]: [...(prev[m.id] || []).filter(r => r.user_id !== user.id), ...(off ? [] : [{ user_id: user.id, emoji }])] }));
    if (!off) { setHeartPop({ id: m.id, emoji }); setTimeout(() => setHeartPop(p => (p?.id === m.id ? null : p)), 700); }
    savingReactions.current.add(m.id);
    const { error: err } = off
      ? await supabase.from('lounge_reactions').delete().eq('message_id', m.id).eq('user_id', user.id)
      : await supabase.from('lounge_reactions').upsert({ message_id: m.id, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
    savingReactions.current.delete(m.id);
    if (err) {
      setReactions(prev => ({ ...prev, [m.id]: before }));
      alert(isSetupError(err) || isMissingColumn(err) ? MEDIA_SETUP_HINT : '감정 표시를 하지 못했어요. (대화가 멈췄거나 제한됐을 수 있어요)');
    }
  };
  const startReply = (m: LoungeMessage) => { setMenuMsg(null); setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); };
  const jumpTo = (id: string) => {
    const el = document.getElementById(`lounge-${id}`);
    if (!el) { alert('지금 화면에 없는 대화예요.'); return; }
    atBottomRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(h => (h === id ? null : h)), 1600);
  };
  const openMenu = (m: LoungeMessage, el: Element | null) => { setMenuAnchor(anchorOf(el)); setMenuMsg(m); };
  const canWriteRef = useRef(true);
  const gestures = usePressGestures<LoungeMessage>({
    keyOf: m => m.id,
    onTap: (m, el) => { if (m.user_id === user.id) openMenu(m, el); },
    onDoubleTap: m => { if (canWriteRef.current && !stealth) react(m, '❤️'); },
    onLongPress: (m, el) => openMenu(m, el),
    onSwipe: m => { if (canWriteRef.current) startReply(m); },
  });
  // 입력 중 표시 (관리자가 몰래 보는 중이면 알리지 않음)
  const typing = useTyping('lounge', user.id, !stealth);
  // 사진·동영상 보내기 (여러 장이면 묶어서 / 한 장씩)
  const media = useChatMedia({
    userId: user.id,
    getText: () => inputRef.current?.value ?? input,
    clearText: () => setInput(''),
    insert: async row => {
      const { data, error: err } = await supabase.from('lounge_messages').insert(row).select('*').single();
      if (!err && data) { atBottomRef.current = true; addMessages([data as LoungeMessage]); }
      return { id: (data as LoungeMessage | null)?.id ?? null, error: err };
    },
  });
  const authorName = (id: string) => (id === user.id ? '나' : authors[id]?.baptismal_name || '교우');
  const makeCapture = async (ids: string[]) => {
    const pick = messages.filter(m => ids.includes(m.id) && !hiddenMsgs.hidden.has(m.id) && !blockedIds.has(m.user_id));
    if (pick.length === 0) { alert('캡처할 대화가 없어요.'); return; }
    setCapturing(true);
    try {
      const items: CaptureItem[] = pick.map(m => {
        const sk = sysKind(m);
        return {
          id: m.id, system: !!sk, mine: m.user_id === user.id, name: m.user_id === user.id ? undefined : authorName(m.user_id), time: m.created_at,
          text: sk === 'enter' ? `🙋 관리자 ${authorName(m.user_id)}님이 들어왔어요` : sk ? SYS_TEXT[sk] : isMediaOnlyText(m.content) ? '' : chatPreview(m.content),
          photos: m.images?.length ? m.images : m.image_url && !isVideoUrl(m.image_url) ? [m.image_url] : undefined,
          video: isVideoUrl(m.image_url),
        };
      });
      setCaptured(await renderCapture(items, '💬 모두의 사랑방', { mine: '#4d6a45', bg: '#f4efe6' }));
      setCapturePick(null);
    } catch { alert('캡처하지 못했어요. 잠시 후 다시 해 주세요.'); }
    finally { setCapturing(false); }
  };

  // 관리자 글(위 칸)과 교우 대화(아래 칸). SQL 실행 전(is_admin 없음)에는 관리자 본인 글만 위로
  const isAdminMsg = (m: LoungeMessage) => m.is_admin === true || (m.is_admin === undefined && isAdmin && m.user_id === user.id);
  const today = messages.filter(m => m.created_at >= dayStart);
  const isEnter = (m: LoungeMessage) => sysKind(m) !== null; // 관리자 안내 (들어옴·얼림·다시 엶·모두 지움)
  const adminMsgs = today.filter(m => isAdminMsg(m) && !isEnter(m));
  // 얼림: 오늘 마지막 얼림/다시 엶 안내가 '얼림'이면
  const lastFreeze = [...today].reverse().find(m => sysKind(m) === 'freeze' || sysKind(m) === 'unfreeze');
  const frozen = !!lastFreeze && sysKind(lastFreeze) === 'freeze';
  useTypeToInput(() => inputRef.current, !(frozen && !isAdmin)); // 실제 자판: 입력칸 밖에서 엔터·글자 → 입력칸으로
  canWriteRef.current = !frozen || isAdmin;
  const lastClearAt = [...today].reverse().find(m => sysKind(m) === 'clear')?.created_at || '';
  const shown = today.filter(m => (isEnter(m) || !isAdminMsg(m)) && !blockedIds.has(m.user_id) && !(isEnter(m) && m.created_at < lastClearAt));
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
    // 실제로 보이는 화면에 딱 맞춤 (아이패드에서 자판·단축 막대가 올라오거나 화면이 옆으로 밀려도 위의 방 이름이 늘 보이고 치우치지 않게, `.fit-visual`)
    <div className="fit-visual z-[75] bg-stone-100 flex flex-col" role="dialog" aria-label="모두의 사랑방">
      {/* 맨 위 */}
      <div className="shrink-0 bg-white border-b border-stone-200 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 flex items-center gap-1">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-stone-700" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-[1.0625rem] text-stone-900 truncate">💬 모두의 사랑방</h2>
          {/* 지금 들어와 있는 인원 (관리자는 눌러서 누가 있는지) */}
          {isAdmin ? (
            <button onClick={() => { if (!showWho) loadAuthors(onlineIds); setShowWho(v => !v); }} className="text-[0.8125rem] font-bold text-emerald-700" aria-expanded={showWho}>
              <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${online > 0 ? 'bg-emerald-500' : 'bg-stone-300'}`} />👥 지금 {online}명 함께하는 중 <span className="font-normal text-stone-400">{showWho ? '▴' : '▾ 누구?'}</span>
            </button>
          ) : (
            <p className="text-[0.8125rem] font-bold text-emerald-700"><span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${online > 0 ? 'bg-emerald-500' : 'bg-stone-300'}`} />👥 지금 {online}명 함께하는 중</p>
          )}
        </div>
        {bookmarks.list.length > 0 && !trash && <button onClick={() => setShowBookmarks(true)} className="w-11 h-11 flex items-center justify-center text-lg" aria-label={`책갈피 ${bookmarks.list.length}개 보기`}><Icon name="bookmark" fill className="w-6 h-6 text-amber-600" /></button>}
        {isAdmin && <button onClick={openTrash} className="px-2.5 py-1.5 mr-1 rounded-lg border border-stone-200 text-[0.75rem] text-stone-600">{trash ? '대화로' : '지운 대화'}</button>}
      </div>
      {isAdmin && showWho && (
        <div className="shrink-0 bg-white border-b border-stone-200 px-4 py-2.5 text-[0.875rem] text-stone-700">
          {onlineIds.length === 0 ? '지금 들어와 있는 교우가 없어요.' : (
            <span className="flex flex-wrap gap-1.5">
              {onlineIds.map(id => (
                <button key={id} onClick={() => onOpenProfile(id)} className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  {authors[id]?.baptismal_name || '교우'}{id === user.id ? ' (나)' : ''}
                </button>
              ))}
            </span>
          )}
          {stealth && <span className="block mt-1 text-[0.75rem] text-stone-400">몰래 보는 중인 관리자님은 인원에 들어가지 않아요</span>}
        </div>
      )}
      {/* 관리자: 몰래 보는 중이면 '들어왔다고 알리기', 대화 얼리기·모두 지우기 */}
      {isAdmin && !trash && (
        <div className="shrink-0 bg-stone-800 text-white px-2.5 py-2 flex flex-col gap-2">
          {stealth ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[0.8125rem] leading-snug">🤫 몰래 보는 중이에요 · 교우들은 관리자가 온 줄 몰라요</span>
              <button onClick={reveal} className="shrink-0 px-3.5 py-2 rounded-full bg-amber-300 text-stone-900 text-[0.875rem] font-bold">🙋 들어왔다고 알리기</button>
            </div>
          ) : <p className="text-[0.8125rem] text-amber-200 font-bold px-1">👋 들어왔다고 알렸어요</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={toggleFreeze} className={`shrink-0 px-3 py-1.5 rounded-full text-[0.8125rem] font-bold ${frozen ? 'bg-sky-300 text-stone-900' : 'bg-white/15'}`}>{frozen ? '🌤 대화 다시 열기' : '❄️ 대화 얼리기'}</button>
            <button onClick={clearAll} className="shrink-0 px-3 py-1.5 rounded-full bg-white/15 text-[0.8125rem] font-bold">🧹 모두 지우기</button>
            <button onClick={openBadgeList} className="shrink-0 px-3 py-1.5 rounded-full bg-white/15 text-[0.8125rem] font-bold">🏅 뱃지 목록{Object.keys(badges).length > 0 ? ` ${Object.keys(badges).length}` : ''}</button>
          </div>
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
              {(t.image_url || t.images?.length) && <ChatMediaView imageUrl={t.image_url} images={t.images} onOpen={(imgs, i) => onZoom?.(imgs, i)} className="mt-1.5" />}
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
          <div className="shrink-0 bg-gradient-to-b from-amber-50 to-amber-100 border-b-2 border-amber-200 px-3 py-2 flex items-center gap-2.5
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
                : <span className="w-11 h-11 rounded-full bg-amber-200 text-amber-900 font-serif font-bold flex items-center justify-center border-2 border-amber-300">{initial(a?.baptismal_name, '📢')}</span>}
              <span className="mt-0.5 max-w-full text-[0.6875rem] font-bold text-amber-900 truncate flex items-center gap-0.5 md:order-first md:mt-0 md:text-[0.9375rem]"><span className="hidden md:inline text-amber-700 font-normal mr-1">📢 관리자 말씀 ·</span>{a?.baptismal_name || '관리자'}<RoleBadge type={a?.badge_type} size="xs" showLabel={false} /></span>
            </button>
          </div>
        );
      })()}
      <div ref={listRef} {...stickerTap} onScroll={e => {
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottomRef.current && newBelow) setNewBelow(0);
      }} className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col">
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
          // 관리자 안내(들어옴·얼림·다시 엶·모두 지움): 가운데 작은 글
          const sk = sysKind(m);
          if (sk) return (
            <div key={m.id} id={`lounge-${m.id}`}>
              {newDay && <p className="text-center text-[0.75rem] text-stone-500 my-2"><span className="bg-white/70 rounded-full px-3 py-1">{dayOf(m.created_at)}</span></p>}
              <p className="text-center my-1">
                <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] rounded-full px-3.5 py-1 border ${sk === 'freeze' ? 'text-sky-900 bg-sky-100 border-sky-200' : sk === 'enter' ? 'text-amber-900 bg-amber-100/80 border-amber-200' : 'text-stone-700 bg-white/80 border-stone-200'}`}>
                  {sk === 'enter'
                    ? <span>🙋 관리자 {a?.baptismal_name ? <><b>{a.baptismal_name}</b>님이</> : '가'} 들어왔어요</span>
                    : <span>{SYS_TEXT[sk]}</span>}
                  <span className="text-[0.6875rem] opacity-60">{timeOf(m.created_at)}</span>
                </span>
              </p>
            </div>
          );
          const grouped = !newDay && prev && !isEnter(prev) && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60 * 1000;
          if (hiddenMsgs.hidden.has(m.id)) return null; // 내 화면에서만 지운 글
          const rs = reactions[m.id] || [];
          const counts = ALL_EMOJIS.map(e => ({ e, n: rs.filter(r => r.emoji === e).length })).filter(x => x.n > 0);
          const quoted = m.reply_to ? messages.find(x => x.id === m.reply_to) : undefined;
          const sticker = parseSticker(m.content);
          const withSticker = chatStickerParts(m.content); // 글과 함께 보낸 이모티콘 → 이모티콘(말풍선 없이) + 글 말풍선, 숫자·시간은 하나
          const tone = mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-stone-900 rounded-bl-md shadow-sm';
          const picked = !!capturePick?.has(m.id);
          const announceMsg = m.content.startsWith('📢') && m.is_admin;
          return (
            <div key={m.id} id={`lounge-${m.id}`} className={highlightId === m.id ? 'rounded-2xl ring-4 ring-amber-300/70 bg-amber-50/60 transition-all' : ''}>
              {newDay && <p className="text-center text-[0.75rem] text-stone-500 my-2"><span className="bg-white/70 rounded-full px-3 py-1">{dayOf(m.created_at)}</span></p>}
              <div className={`relative flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '-mt-1' : ''} ${picked ? 'bg-amber-200/50 rounded-2xl -mx-2 px-2 py-1' : ''}`}>
                {/* 대화 골라서 캡처하는 중: 줄을 누르면 고르기 */}
                {capturePick && (
                  <button type="button" onClick={() => setCapturePick(p => { const n = new Set(p); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                    className="absolute inset-0 z-10 flex items-center" aria-pressed={picked} aria-label={picked ? '캡처에서 빼기' : '캡처할 대화로 고르기'}>
                    <span className={`ml-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[0.8125rem] font-bold ${picked ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white/90 border-stone-400'}`}>{picked ? '✓' : ''}</span>
                  </button>
                )}
                {!mine && (
                  grouped ? <span className="w-10 shrink-0" /> : (
                    <button onClick={() => onOpenProfile(m.user_id)} className="shrink-0 self-start" aria-label={`${a?.baptismal_name || '교우'}님 공간`}>
                      {a?.avatar_url
                        ? <img loading="lazy" src={a.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                        : <span className="w-10 h-10 rounded-full bg-stone-300 text-stone-700 font-serif font-bold flex items-center justify-center">{initial(a?.baptismal_name, '교')}</span>}
                    </button>
                  )
                )}
                <div className={`min-w-0 max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && !grouped && (
                    <span className="flex items-center gap-1 text-[0.8125rem] font-bold text-stone-700 mb-0.5 ml-1">
                      {/* 관리자: 이름을 누르면 뱃지 달기·바꾸기·떼기 */}
                      {isAdmin
                        ? <button onClick={e => { e.stopPropagation(); openBadgeEdit(m.user_id); }} className="underline decoration-dotted decoration-stone-400 underline-offset-2" aria-label={`${a?.baptismal_name || '교우'}님 뱃지 ${badges[m.user_id] ? '바꾸기' : '달기'}`}>{a?.baptismal_name || '교우'}</button>
                        : (a?.baptismal_name || '교우')}
                      <RoleBadge type={a?.badge_type} size="xs" showLabel={false} />
                      {badges[m.user_id] && <span className="text-[0.6875rem] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-px">{badges[m.user_id]}</span>}
                      {isAdmin && !badges[m.user_id] && <button onClick={e => { e.stopPropagation(); openBadgeEdit(m.user_id); }} className="text-[0.6875rem] font-normal text-amber-700 border border-dashed border-amber-300 rounded-full px-1.5 py-px" aria-hidden="true" tabIndex={-1}>🏅+</button>}
                      {isAdmin && banned.has(m.user_id) && <span className="text-[0.6875rem] text-red-500 font-normal">(대화 금지)</span>}
                    </span>
                  )}
                  <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''} ${counts.length ? 'mb-4' : ''}`}>
                    <div className="relative min-w-0">
                      {/* 옆으로 미는 중: 드러나는 답장 표시 */}
                      {gestures.swipe?.id === m.id && <SwipeHint dx={gestures.swipe.dx} />}
                      <div data-bubble role="button" tabIndex={0} aria-haspopup="dialog"
                        {...gestures.bind(m)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(m, e.currentTarget); } }}
                        className={`relative text-left px-3.5 py-2 rounded-2xl text-[1rem] leading-relaxed whitespace-pre-wrap break-words select-none [-webkit-touch-callout:none] [touch-action:pan-y] cursor-pointer ${announceMsg ? 'bg-sky-50 border-2 border-sky-300 text-stone-900 font-bold' : sticker || withSticker ? `!px-0 !py-0 bg-transparent flex flex-col ${mine ? 'items-end' : 'items-start'}` : tone}`}>
                        {/* 답장: 원래 글 한 줄 + ↵ (누르면 그 글로) */}
                        {m.reply_to && (
                          <button type="button" onClick={e => { e.stopPropagation(); jumpTo(m.reply_to!); }}
                            aria-label={`${quoted ? authorName(quoted.user_id) : '이전 대화'}에게 답장 · 눌러서 원래 글 보기`}
                            className={`flex max-w-full items-center gap-1 text-left font-normal mb-0.5 text-[0.8125rem] leading-snug ${mine && !announceMsg && !sticker && !withSticker ? 'text-white/70' : 'text-stone-400'}`}>
                            {quoted && !blockedIds.has(quoted.user_id) && <QuoteThumb m={quoted} />}
                            <span className="min-w-0 truncate">{quoted ? (blockedIds.has(quoted.user_id) ? '차단한 교우의 글' : quoteLabel(quoted)) : '이전 대화의 글'}</span>
                            <span aria-hidden="true" className="shrink-0">↵</span>
                          </button>
                        )}
                        <ChatMediaView imageUrl={m.image_url} images={m.images} onOpen={(imgs, i) => onZoom?.(imgs, i)} className="-mx-1.5 mt-0.5 mb-1" />
                        {sticker && !announceMsg ? <StickerImage sticker={sticker} /> : withSticker && !announceMsg ? <StickerWithText parts={withSticker} bubble={`px-3.5 py-2 rounded-2xl ${tone}`}>{withCall(withSticker.text, mine)}</StickerWithText> : (m.image_url || m.images?.length) && isMediaOnlyText(m.content) ? null : withCall(m.content, mine && !announceMsg)}
                      </div>
                      {heartPop?.id === m.id && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center animate-[heartBurst_0.7s_ease-out_forwards]">
                          {heartPop.emoji === '❤️' ? <Icon name="heart" fill className="w-10 h-10 text-rose-500 drop-shadow" /> : <span className="text-4xl drop-shadow">{heartPop.emoji}</span>}
                        </span>
                      )}
                      {counts.length > 0 && (
                        <button onClick={e => openMenu(m, e.currentTarget.parentElement?.querySelector('[data-bubble]') ?? e.currentTarget)}
                          aria-label={`감정 표시 ${counts.map(c => `${c.e} ${c.n}`).join(', ')} · 눌러서 고르기`}
                          className={`absolute -bottom-4 ${mine ? 'right-2' : 'left-2'} flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-stone-200 shadow-sm text-[0.8125rem] leading-none text-stone-600`}>
                          {counts.map(c => <span key={c.e} className="inline-flex items-center">{c.e === '❤️' ? <Icon name="heart" fill className="w-3.5 h-3.5 text-rose-500" /> : c.e}{c.n > 1 && <span className="ml-0.5 text-[0.75rem]">{c.n}</span>}</span>)}
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 text-[0.6875rem] leading-tight text-stone-500 pb-0.5 flex flex-col items-center">{bookmarks.has(m.id) && <span aria-label="책갈피">🔖</span>}<span>{timeOf(m.created_at)}</span></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
      </div>
      )}

      {/* 위로 올려 보는 중: 오른쪽 아래 '최근 대화로' (새 대화 수와 함께) */}
      {!trash && !stickerPick.open && !stickerPick.picked && !hasStickerSuggestion(input) && <JumpToLatest listRef={listRef} newCount={newBelow} onJump={() => scrollToBottom(true)} className="bottom-[calc(8rem+env(safe-area-inset-bottom))]" />}

      {!trash && <TypingIndicator typers={typing.typers.filter(t => !blockedIds.has(t.id))} lookup={id => (authors[id] ? { name: authors[id].baptismal_name, avatar: authors[id].avatar_url ?? null } : undefined)} />}
      {!trash && media.bar}
      {media.choice}
      {!trash && capturePick && <CaptureBar count={capturePick.size} busy={capturing} onCancel={() => setCapturePick(null)} onDone={() => makeCapture(Array.from(capturePick))} />}
      {/* 추천 이모티콘·고른 이모티콘: 대화 위에 떠서 보임 (대화창이 줄어들지 않게) */}
      {!trash && !capturePick && !(frozen && !isAdmin) && <div className="relative h-0 shrink-0 z-20"><StickerAbove picker={stickerPick} text={input} onTextChange={setInput} /></div>}
      {/* 입력 */}
      {!trash && !capturePick && (
        <div className="shrink-0 bg-white border-t border-stone-200">
        {replyTo && (
          <div className="px-3 pt-2 flex items-start gap-2">
            <div className="flex-1 min-w-0 border-l-4 border-blue-600 pl-2.5 py-0.5">
              <p className="text-[0.8125rem] font-bold text-blue-700">↩️ {replyTo.user_id === user.id ? '내 글' : `${authorName(replyTo.user_id)}님 글`}에 답장</p>
              <p className="text-[0.8125rem] text-stone-500 line-clamp-1">{quoteLabel(replyTo)}</p>
            </div>
            <QuoteThumb m={replyTo} size="w-11 h-11" />
            <button type="button" onClick={() => { setReplyTo(null); stickerPick.setPicked(null); }} className="w-9 h-9 shrink-0 flex items-center justify-center text-stone-400 text-2xl leading-none" aria-label="답장 그만두기">×</button>
          </div>
        )}
        {notice && <p className="px-4 pt-2 text-[0.8125rem] font-bold text-amber-700">{notice}</p>}
        {isAdmin && onAnnounce && (
          <div className="px-3 pt-2 flex items-center gap-2">
            <button type="button" onClick={announce} disabled={sending || !!error} className="px-3 py-1.5 rounded-full border border-sky-300 bg-sky-50 text-sky-800 text-[0.8125rem] font-bold disabled:opacity-50">📢 모두에게 알리기</button>
            <span className="text-[0.75rem] text-stone-400">모든 교우 휴대폰으로 &lsquo;관리자가 왔어요&rsquo;</span>
          </div>
        )}
        {!isAdmin && (
          <div className="px-3 pt-2 flex items-center gap-2">
            <button type="button" disabled={frozen} onClick={() => {
              if (callQuietNow()) { alert(QUIET_NOTICE); return; }
              setInput(v => (v.includes(CALL_ADMIN) ? v : `${CALL_ADMIN} ${v}`));
              setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
            }} className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-[0.8125rem] font-bold disabled:opacity-50">🙋 관리자 부르기</button>
            <span className="min-w-0 text-[0.75rem] leading-snug text-stone-400">@아이디로 부르면 그분께만 알림이 가요</span>
          </div>
        )}
        {frozen && !isAdmin && <p className="mx-3 mt-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-[0.875rem] font-bold text-sky-900">❄️ 관리자가 대화를 잠시 멈췄어요. 지금은 읽기만 할 수 있어요.</p>}
        {!(frozen && !isAdmin) && <div className="px-3 pt-2 empty:hidden"><MentionSuggest value={input} onChange={setInput} excludeId={user.id} label="부르기" /></div>}
        <form onSubmit={submit} className={`px-3 pt-2.5 ${stickerPick.open ? 'pb-2.5' : 'pb-[calc(0.625rem+env(safe-area-inset-bottom))]'} flex items-end gap-2`}>
          {/* 사진·동영상 보내기 (여러 개 한꺼번에) */}
          <label className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${media.sending || (frozen && !isAdmin) ? 'bg-stone-200 text-stone-400' : 'bg-stone-100 text-stone-700'}`} aria-label="사진·동영상 보내기 (여러 개 한꺼번에 고를 수 있어요)">
            {media.sending ? <span className="w-4 h-4 rounded-full border-2 border-stone-400 border-t-transparent animate-spin" /> : <Icon name="camera" className="w-5 h-5" />}
            <input type="file" accept="image/*,video/*" multiple className="hidden" disabled={media.sending || (frozen && !isAdmin) || !!error} onChange={media.onPick} />
          </label>
          <StickerButton open={stickerPick.open} disabled={(frozen && !isAdmin) || !!error} className="w-11 h-11" onClick={() => { stickerPick.setOpen(!stickerPick.open); leaveInputForPanel(inputRef.current); }} />
          <textarea
            ref={setInputEl}
            value={input}
            onChange={e => { setInput(e.target.value.slice(0, 500)); typing.notify(e.target.value); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            enterKeyHint={enter.enterKeyHint}
            onKeyDown={enter.onKeyDown}
            rows={1}
            disabled={frozen && !isAdmin}
            placeholder={frozen && !isAdmin ? '❄️ 잠시 멈춘 대화예요' : '사랑방에 한마디...'}
            className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[1rem] focus:outline-none focus:border-stone-500"
            aria-label="사랑방에 보낼 말"
            onFocus={() => closePanelOnInputFocus(() => stickerPick.setOpen(false))}
          />
          {/* 보내기를 눌러도 입력창 초점을 뺏지 않게 → 자판이 내려가지 않음 */}
          <button type="submit" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} disabled={(!input.trim() && !stickerPick.picked) || sending || !!error || (frozen && !isAdmin)} className="shrink-0 h-11 px-4 rounded-2xl bg-blue-600 disabled:bg-stone-300 text-white font-bold text-[0.9375rem]">{sending ? '...' : '보내기'}</button>
        </form>
        {stickerPick.open && !(frozen && !isAdmin) && <StickerPanel picker={stickerPick} />}
        </div>
      )}

      {/* 대화를 꾹 누르면(내 글은 한 번 눌러도): 그 글 바로 위에 감정 표시, 아래에 복사 · 선택 복사 · 답장 · 책갈피 · 캡처 · 신고 · 삭제 */}
      {menuMsg && (() => {
        const m = menuMsg;
        const mine = m.user_id === user.id;
        const close = () => setMenuMsg(null);
        const myEmoji = (reactions[m.id] || []).find(r => r.user_id === user.id)?.emoji;
        const text = isMediaOnlyText(m.content) || parseSticker(m.content) ? '' : chatText(m.content);
        const writable = !frozen || isAdmin;
        return (
          <MessageMenu anchor={menuAnchor} alignRight={mine} onClose={close} label="사랑방 메뉴"
            emojis={writable && !stealth ? REACTION_EMOJIS : undefined} moreEmojis={MORE_EMOJIS} selected={myEmoji ? [myEmoji] : []} onEmoji={e => react(m, e)}
            actions={[
              ...(text ? [
                { label: '복사', run: async () => { close(); toast((await copyText(text)) ? '복사했어요' : '복사하지 못했어요'); } },
                { label: '선택 복사', run: () => { close(); setSelectCopy(text); } },
              ] : []),
              ...(writable ? [{ label: '답장', run: () => startReply(m) }] : []),
              { label: bookmarks.has(m.id) ? '책갈피 해제' : '책갈피 설정', run: () => { close(); bookmarks.toggle({ id: m.id, text: text || (parseSticker(m.content) ? m.content : isVideoUrl(m.image_url) ? '🎬 동영상' : '📷 사진'), name: authorName(m.user_id), at: m.created_at }); } },
              { label: '캡처', run: () => { close(); setCaptureAsk(m.id); } },
              ...(!mine ? [{ label: '신고', run: () => { close(); onReport({ type: 'lounge', id: m.id, userId: m.user_id, userName: authors[m.user_id]?.baptismal_name, preview: m.content }); } }] : []),
              ...(isAdmin && !mine ? [
                { label: `🏅 ${badges[m.user_id] ? '뱃지 바꾸기' : '뱃지 달기'}`, run: () => { close(); openBadgeEdit(m.user_id); } },
                { label: banned.has(m.user_id) ? '대화 금지 풀기' : '대화 금지', run: () => { close(); toggleBan(m.user_id); } },
              ] : []),
              ...(mine || isAdmin
                ? [{ label: mine ? '삭제' : '삭제 (관리자)', run: () => { close(); remove(m); }, danger: true }]
                : [{ label: '삭제 (내 화면에서만)', run: async () => { close(); if ((await askConfirm('이 글을 내 화면에서 지울까요?\n다른 교우들 화면에는 그대로 남아요.'))) hiddenMsgs.hide(m.id); }, danger: true }]),
            ]} />
        );
      })()}
      {captureAsk && (
        <CaptureChoice onClose={() => setCaptureAsk(null)}
          onPick={() => { setCapturePick(new Set([captureAsk])); setCaptureAsk(null); }}
          onScreen={() => { setCaptureAsk(null); makeCapture(visibleIds(listRef.current, 'lounge-')); }} />
      )}
      {captured && <CapturePreview blob={captured} title="모두의 사랑방" onClose={() => setCaptured(null)} />}
      {selectCopy !== null && <SelectCopySheet text={selectCopy} onClose={() => setSelectCopy(null)} />}
      {showBookmarks && (
        <BookmarkSheet items={bookmarks.list} onClose={() => setShowBookmarks(false)} onRemove={bookmarks.remove}
          onJump={id => { setShowBookmarks(false); if (document.getElementById(`lounge-${id}`)) setTimeout(() => jumpTo(id), 50); else alert('오늘 대화에 없는 글이에요. 사랑방 대화는 매일 자정에 새로 시작돼요.'); }} />
      )}

      {/* 관리자: 뱃지 달기·바꾸기·떼기 */}
      {badgeEdit && (() => {
        const cur = badges[badgeEdit];
        const name = authors[badgeEdit]?.baptismal_name || '교우';
        const presets = ['⭐ 사랑방 지기', '🌹 레지오', '🙏 기도 지기', '🎵 성가대', '💐 봉사자', '📖 성경 공부'];
        return (
          <div className="fixed inset-0 z-[5] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setBadgeEdit(null)}>
            <div className="w-full sm:w-96 bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${name}님 뱃지`}>
              <h3 className="font-bold text-[1.125rem] text-stone-900">🏅 {name}님 뱃지</h3>
              <p className="mt-1 text-[0.875rem] text-stone-500">{cur ? <>지금 뱃지: <b className="text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">{cur}</b></> : '아직 뱃지가 없어요.'}</p>
              <input value={badgeText} onChange={e => setBadgeText(e.target.value.slice(0, 20))} placeholder="뱃지에 쓸 말 (20자까지)" aria-label="뱃지에 쓸 말"
                className="mt-3 w-full px-4 py-3 rounded-xl border border-stone-300 bg-stone-50 text-[1rem] focus:outline-none focus:border-stone-500" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presets.map(p => <button key={p} onClick={() => setBadgeText(p)} className={`px-2.5 py-1 rounded-full border text-[0.8125rem] ${badgeText === p ? 'bg-amber-200 border-amber-300 text-amber-900 font-bold' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{p}</button>)}
              </div>
              <div className="mt-4 flex gap-2">
                {cur && <button onClick={() => removeBadge(badgeEdit)} className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold">🗑 뱃지 떼기</button>}
                <button onClick={saveBadge} disabled={!badgeText.trim() || badgeText.trim() === cur} className="flex-1 py-3 rounded-xl bg-blue-600 disabled:bg-stone-300 text-white font-bold">{cur ? '✏️ 바꾸기' : '🏅 달기'}</button>
              </div>
              <button onClick={() => setBadgeEdit(null)} className="mt-2 w-full py-2.5 text-stone-500 font-bold">취소</button>
            </div>
          </div>
        );
      })()}

      {/* 관리자: 뱃지 단 교우 모아 보기 */}
      {showBadgeList && (
        <div className="fixed inset-0 z-[4] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowBadgeList(false)}>
          <div className="w-full sm:w-96 max-h-[80dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl pb-[env(safe-area-inset-bottom)]" onClick={e => e.stopPropagation()} role="dialog" aria-label="뱃지 목록">
            <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between border-b border-stone-100">
              <h3 className="font-bold text-[1.125rem] text-stone-900">🏅 뱃지 단 교우 {Object.keys(badges).length}명</h3>
              <button onClick={() => setShowBadgeList(false)} className="w-10 h-10 flex items-center justify-center text-stone-500 text-2xl" aria-label="닫기">×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {Object.keys(badges).length === 0 && <p className="p-8 text-center text-stone-400 text-sm">아직 뱃지를 단 교우가 없어요.<br />대화에서 교우 이름을 누르면 달 수 있어요.</p>}
              {Object.entries(badges).map(([uid, label]) => (
                <div key={uid} className="px-5 py-3 flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    <b className="text-stone-900">{authors[uid]?.baptismal_name || '교우'}</b>
                    <span className="ml-1.5 text-[0.75rem] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-px">{label}</span>
                  </span>
                  <button onClick={() => openBadgeEdit(uid)} className="shrink-0 px-3 py-1.5 rounded-lg border border-stone-300 text-[0.8125rem] font-bold text-stone-700">바꾸기</button>
                  <button onClick={() => removeBadge(uid)} className="shrink-0 px-3 py-1.5 rounded-lg border border-red-200 text-[0.8125rem] font-bold text-red-600">떼기</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
