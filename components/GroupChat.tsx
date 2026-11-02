'use client';

import { useBackLayer } from '@/lib/back-layers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { mediaMenuActions } from '@/lib/save-media';
import { CelebrateBand } from '@/components/CelebrateAvatar';
import Icon from '@/components/Icon';
import RoleBadge from '@/components/RoleBadge';
import type { ReportTarget } from '@/components/ReportDialog';
import NewChat, { GROUP_SETUP_HINT, isGroupSetupError, type ChatPerson } from '@/components/NewChat';
import MessageMenu, { REACTION_EMOJIS, MORE_EMOJIS, SwipeHint, anchorOf, type MenuAnchor } from '@/components/MessageMenu';
import { useChatMedia, ChatMediaView, QuoteThumb, quoteLabel } from '@/components/ChatMedia';
import { renderCapture, visibleIds, CaptureChoice, CaptureBar, CapturePreview, type CaptureItem } from '@/components/ChatCapture';
import { SelectCopySheet, BookmarkSheet, JumpToLatest, TypingIndicator } from '@/components/ChatSheets';
import { useTyping } from '@/lib/typing';
import { copyText, toast, useBookmarks, useHiddenMessages } from '@/lib/chat-actions';
import { useQuietSend } from '@/components/QuietSend';
import { isMediaOnlyText, isVideoUrl } from '@/lib/upload';
import { initial } from '@/lib/fancy-name';
import { usePressGestures } from '@/lib/use-press-gestures';
import { closePanelOnInputFocus, leaveInputForPanel, useEnterSend, useTypeToInput } from '@/lib/use-enter-send';
import StickerPanel, { StickerAbove, StickerButton, StickerImage, StickerWithText, useCloseStickersOnTap, useStickerPicker } from '@/components/StickerPanel';
import { chatPreview, chatStickerParts, chatText, hasStickerSuggestion, joinChatSticker, parseSticker, stickerText, type Sticker } from '@/lib/stickers';
import { askConfirm } from '@/components/ConfirmDialog';
import { same } from '@/lib/typing-guard';
import { ChatSearchBar, ChatSearchButton, HighlightText, chatSearchText, likePattern, useChatSearch } from '@/components/ChatSearch';
import { ChatDayDivider, isNewChatDay } from '@/components/ChatDayDivider';
import { clipText } from '@/lib/clip-text';

// 단체 채팅방 (supabase/group-chats.sql)
// 들어와 있는 교우만 읽고 쓴다. 새 대화는 Supabase 실시간으로 바로 받고, 연결이 안 되면 5초마다 확인한다.
// 관리자 보기(adminView): 모든 방을 읽기만 한다 — 글쓰기·읽음 표시·입장 안내·감정 표시가 없어 교우들에게 보이지 않는다.
// 손동작은 1:1 메시지와 같다: 꾹 누르기 = 그 자리 메뉴(위에 감정, 아래에 답장·고치기…), 두 번 누르기 = 하트, 옆으로 밀기 = 답장
interface GroupMessage { id: string; chat_id: string; user_id: string | null; content: string; kind: 'text' | 'system'; created_at: string; reply_to?: string | null; edited_at?: string | null; image_url?: string | null; images?: string[] | null }
const ALL_EMOJIS = [...REACTION_EMOJIS, ...MORE_EMOJIS];
interface Member { user_id: string; joined_at: string }
interface Reaction { user_id: string; emoji: string }

const EXTRAS_HINT = '단체 채팅방 답장·감정 표시·고치기를 준비 중이에요. (관리자: supabase/group-chats.sql 다시 실행 필요)';
const isMissing = (e: { code?: string; message?: string } | null) => !!e && ['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(e.code || '');

const PAGE = 80;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

export default function GroupChat({ user, chatId, adminView = false, blockedIds, onClose, onOpenProfile, onReport, onSent, onChanged, onZoom }: {
  user: User;
  chatId: string;
  adminView?: boolean;                       // 관리자: 몰래 읽기만
  blockedIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  onSent?: (messageId: string) => void;      // 휴대폰 알림 보내기
  onChanged?: () => void;                    // 방 이름·인원·나가기 → 목록 새로 고침
  onZoom?: (images: string[], index: number) => void; // 사진 크게 보기
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
  const [menuMsg, setMenuMsg] = useState<GroupMessage | null>(null);   // 꾹 누른 메시지 (그 자리 메뉴)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editing, setEditing] = useState<GroupMessage | null>(null);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [heartPop, setHeartPop] = useState<{ id: string; emoji: string } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
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

  // 엔터: 휴대폰·태블릿은 줄바꿈(보내기 단추로 전송), 컴퓨터는 보내기 (lib/use-enter-send, 1:1 메시지·사랑방과 같음)
  const composingRef = useRef(false);
  const sendRef = useRef<(typed: string) => void>(() => {});
  const enter = useEnterSend(typed => sendRef.current(typed), input);
  const enterRef = enter.ref;
  const setInputEl = useCallback((el: HTMLTextAreaElement | null) => { inputRef.current = el; enterRef(el); }, [enterRef]);

  const loadPeople = async (ids: (string | null)[]) => {
    const need = Array.from(new Set(ids.filter((x): x is string => !!x))).filter(id => !peopleRef.current[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type').in('id', need);
    if (data) setPeople(prev => ({ ...prev, ...Object.fromEntries((data as ChatPerson[]).map(p => [p.id, p])) }));
  };

  // 감정 표시 불러오기 (저장 중인 것은 덮지 않음). 실시간 대신 5초마다 다시 확인
  const savingReactions = useRef<Set<string>>(new Set());
  const reactionsMissing = useRef(false);
  const loadReactions = async (ids: string[]) => {
    if (ids.length === 0 || reactionsMissing.current) return;
    const { data, error: err } = await supabase.from('group_chat_reactions').select('message_id, user_id, emoji').in('message_id', ids);
    if (err && isMissing(err)) reactionsMissing.current = true; // SQL 다시 실행 전이면 조용히, 더 묻지 않음
    if (err || !data) return;
    setReactions(prev => {
      const next = { ...prev };
      ids.forEach(id => { if (!savingReactions.current.has(id)) delete next[id]; });
      (data as (Reaction & { message_id: string })[]).forEach(r => {
        if (savingReactions.current.has(r.message_id)) return;
        next[r.message_id] = [...(next[r.message_id] || []), { user_id: r.user_id, emoji: r.emoji }];
      });
      return same(prev, next); // 5초마다 다시 받을 때 바뀐 게 없으면 다시 그리지 않음 (치는 글자를 지키려고)
    });
  };
  const textIds = (rows: GroupMessage[]) => rows.filter(r => r.kind === 'text').map(r => r.id);
  // 고친 메시지 내용 바꿔 넣기
  const applyEdits = (rows: { id: string; content: string; edited_at: string | null }[]) => {
    if (rows.length === 0) return;
    const byId = new Map(rows.map(r => [r.id, r]));
    setMessages(prev => prev.some(m => byId.has(m.id) && (byId.get(m.id)!.content !== m.content || byId.get(m.id)!.edited_at !== m.edited_at))
      ? prev.map(m => (byId.has(m.id) ? { ...m, content: byId.get(m.id)!.content, edited_at: byId.get(m.id)!.edited_at } : m))
      : prev);
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
  // 화면에 보일 때만 읽음 표시 (앱이 뒤에 있는데 읽음이 되면, 서버가 '보고 있다'고 여겨 아이폰·아이패드 알림을 보내지 않음 — push/notify VIEW_WAIT_MS)
  const readLater = useRef(false);
  const markReadSoon = () => {
    if (adminView || readTimer.current) return;
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      if (document.visibilityState === 'visible') markRead(); else readLater.current = true;
    }, 1500);
  };
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && readLater.current) { readLater.current = false; markRead(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [chatId]);

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
      loadReactions(textIds(rows));
      markRead();
      setTimeout(() => scrollToBottom(), 50);
    })();
    setReplyTo(null); setEditing(null); setMenuMsg(null);
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        const r = payload.new as GroupMessage;
        if (r?.id) applyEdits([{ id: r.id, content: r.content, edited_at: r.edited_at ?? null }]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_chat_messages' }, payload => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages(prev => prev.filter(m => m.id !== id));
      })
      .subscribe(status => { live = status === 'SUBSCRIBED'; });
    const poll = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      const shown = textIds(messagesRef.current).slice(-PAGE);
      loadReactions(shown);
      if (live) return;
      const last = messagesRef.current[messagesRef.current.length - 1];
      let q = supabase.from('group_chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(50);
      if (last) q = q.gt('created_at', last.created_at);
      const { data } = await q;
      if (data && data.length) { addMessages(data as GroupMessage[]); markReadSoon(); }
      // 실시간이 안 될 때: 고친 메시지도 확인
      if (shown.length) {
        const { data: edited } = await supabase.from('group_chat_messages').select('id, content, edited_at').in('id', shown).not('edited_at', 'is', null);
        if (edited) applyEdits(edited as { id: string; content: string; edited_at: string | null }[]);
      }
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
    loadReactions(textIds(rows));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  const lastSendRef = useRef({ text: '', at: 0 });
  sendRef.current = (typed: string) => {
    const now = Date.now();
    if (typed.trim() === lastSendRef.current.text && now - lastSendRef.current.at < 1000) return; // 엔터 한 번에 두 번 가지 않게
    lastSendRef.current = { text: typed.trim(), at: now };
    if (stickerPick.picked && !editing) { submit(); return; }
    send(undefined, typed);
  };
  // 조용히 보내기(보내기 단추 꾹 → 🔕): 보내는 함수가 시작할 때 읽고, 보낸 뒤 휴대폰 알림을 보내지 않음
  const quietRef = useRef(false);
  const quietDone = () => toast('🔕 조용히 보냈어요 · 알림이 울리지 않아요', 2200);
  const send = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    if (sending || adminView) return;
    const quiet = quietRef.current;
    const ta = inputRef.current;
    const raw = typed ?? ta?.value ?? input;
    const text = raw.trim();
    if (!text) return;
    const keepKeyboard = !!ta && document.activeElement === ta;
    // 조합 중인 마지막 글자를 먼저 끝맺어야 입력창을 비워도 글자가 되살아나지 않는다
    if (keepKeyboard && composingRef.current && ta) { ta.blur(); ta.focus(); composingRef.current = false; }
    setInput('');
    setSending(true);
    // 내 메시지 고치기
    if (editing) {
      const target = editing;
      const keep = chatStickerParts(target.content)?.sticker; // 함께 보낸 이모티콘은 그대로
      const content = keep ? joinChatSticker(text.slice(0, 950), keep) : text.slice(0, 1000);
      const { error: err } = await supabase.rpc('edit_group_message', { p_id: target.id, p_content: content });
      setSending(false);
      if (keepKeyboard) setTimeout(() => inputRef.current?.focus(), 0);
      if (err) {
        setInput(cur => (cur.trim() ? cur : chatText(raw)));
        alert(isMissing(err) ? EXTRAS_HINT : /[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : `고치지 못했어요.\n(${err.message})`);
        return;
      }
      setEditing(null);
      applyEdits([{ id: target.id, content, edited_at: new Date().toISOString() }]);
      return;
    }
    const reply = replyTo;
    setReplyTo(null);
    typing.stop();
    const row = { chat_id: chatId, content: text.slice(0, 1000), ...(reply ? { reply_to: reply.id } : {}) };
    let { data, error: err } = await supabase.from('group_chat_messages').insert(row).select('*').single();
    // 답장 칸이 아직 없으면(SQL 다시 실행 전) 답장 표시 없이라도 보낸다
    if (err && reply && isMissing(err)) {
      ({ data, error: err } = await supabase.from('group_chat_messages').insert({ chat_id: chatId, content: text.slice(0, 1000) }).select('*').single());
      if (!err) alert(EXTRAS_HINT);
    }
    setSending(false);
    if (keepKeyboard) setTimeout(() => inputRef.current?.focus(), 0);
    if (err || !data) {
      setInput(cur => (cur.trim() ? cur : chatText(raw)));
      setReplyTo(reply);
      alert(err && isGroupSetupError(err) ? GROUP_SETUP_HINT : err && /[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err?.message || ''})`);
      return;
    }
    atBottomRef.current = true;
    addMessages([data as GroupMessage]);
    if (quiet) quietDone(); else onSent?.((data as GroupMessage).id);
  };

  // 이모티콘 보내기. 입력칸에 쓰던 글이 있으면(미리 보기를 누르거나 같은 이모티콘을 한 번 더 눌러도) 글과 함께 한 메시지로 (알림·시간 한 번)
  const sendSticker = async (s: Sticker) => {
    if (sending || adminView) return;
    const quiet = quietRef.current;
    const typed = (inputRef.current?.value ?? input).trim();
    if (typed && !editing) { await send(undefined, joinChatSticker(typed.slice(0, 950), s)); return; }
    setSending(true);
    const reply = replyTo;
    setReplyTo(null);
    const content = stickerText(s);
    let { data, error: err } = await supabase.from('group_chat_messages').insert({ chat_id: chatId, content, ...(reply ? { reply_to: reply.id } : {}) }).select('*').single();
    if (err && reply && isMissing(err)) ({ data, error: err } = await supabase.from('group_chat_messages').insert({ chat_id: chatId, content }).select('*').single());
    setSending(false);
    if (err || !data) {
      setReplyTo(reply);
      alert(err && isGroupSetupError(err) ? GROUP_SETUP_HINT : err && /[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : `보내지 못했어요.\n(${err?.message || ''})`);
      return;
    }
    atBottomRef.current = true;
    addMessages([data as GroupMessage]);
    if (quiet) quietDone(); else onSent?.((data as GroupMessage).id);
  };
  const stickerPick = useStickerPicker(sendSticker);
  const stickerTap = useCloseStickersOnTap(stickerPick); // 이모티콘 칸이 떠 있을 때 대화 칸을 톡 누르면 닫힘
  // 보내기: 고른 이모티콘이 있으면 입력칸의 글과 함께 한 메시지로(한 말풍선에 이모티콘 + 글), 글이 없으면 이모티콘만
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const picked = stickerPick.picked;
    if (picked && !editing) {
      const rest = (inputRef.current?.value ?? input).trim();
      if (!rest) { await stickerPick.sendPicked(); return; }
      stickerPick.setPicked(null);
      send(undefined, joinChatSticker(rest.slice(0, 950), picked));
      return;
    }
    send();
  };
  const quietSend = useQuietSend(() => {
    quietRef.current = true;
    try { submit(); } finally { quietRef.current = false; }
  });

  const remove = async (m: GroupMessage) => {
    setMenuMsg(null);
    if (!(await askConfirm('이 메시지를 지울까요?\n다른 교우들에게도 보이지 않게 돼요.'))) return;
    const { error: err } = await supabase.from('group_chat_messages').delete().eq('id', m.id);
    if (err) { alert('지우지 못했어요.'); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  };

  // 감정 표시: 같은 것을 다시 고르면 취소, 다른 것을 고르면 바꿈 (한 사람이 한 메시지에 하나)
  const react = async (m: GroupMessage, emoji: string) => {
    const before = reactions[m.id] || [];
    const mineBefore = before.find(r => r.user_id === user.id)?.emoji;
    const off = mineBefore === emoji;
    setReactions(prev => ({ ...prev, [m.id]: [...(prev[m.id] || []).filter(r => r.user_id !== user.id), ...(off ? [] : [{ user_id: user.id, emoji }])] }));
    if (!off) { setHeartPop({ id: m.id, emoji }); setTimeout(() => setHeartPop(p => (p?.id === m.id ? null : p)), 700); }
    savingReactions.current.add(m.id);
    const { error: err } = off
      ? await supabase.from('group_chat_reactions').delete().eq('message_id', m.id).eq('user_id', user.id)
      : await supabase.from('group_chat_reactions').upsert({ message_id: m.id, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
    savingReactions.current.delete(m.id);
    if (err) {
      setReactions(prev => ({ ...prev, [m.id]: before }));
      alert(isMissing(err) ? EXTRAS_HINT : '감정 표시를 하지 못했어요. 잠시 후 다시 해 주세요.');
    }
  };

  const canEdit = (m: GroupMessage) => m.user_id === user.id && m.kind === 'text' && !isMediaOnlyText(m.content) && !parseSticker(m.content) && Date.now() - new Date(m.created_at).getTime() < 24 * 3600e3;
  const startReply = (m: GroupMessage) => { setMenuMsg(null); setEditing(null); setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); };
  const startEdit = (m: GroupMessage) => { setMenuMsg(null); setReplyTo(null); setEditing(m); setInput(chatText(m.content)); /* 이모티콘과 함께 보낸 글은 글만 고침 */ setTimeout(() => inputRef.current?.focus(), 50); };
  const cancelEdit = () => { setEditing(null); setInput(''); };
  // 답장 표시를 누르면 원래 메시지로 옮겨 잠깐 강조
  const jumpTo = (id: string) => {
    const el = document.getElementById(`gm-${id}`);
    if (!el) return;
    atBottomRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashId(id);
    setTimeout(() => setFlashId(f => (f === id ? null : f)), 1600);
  };

  const openMenu = (m: GroupMessage, el: Element | null) => {
    if (adminView && m.user_id === user.id) return; // 관리자 보기: 할 일이 없음
    setMenuAnchor(anchorOf(el)); setMenuMsg(m);
  };
  // 관리자 보기에서는 하트·답장 없이 메뉴(프로필)만
  const gestures = usePressGestures<GroupMessage>({
    keyOf: m => m.id,
    // 한 번 누르기: 답장 말풍선이면 원래 메시지로 (메뉴는 꾹 누를 때만 — 루비로사 건의), 관리자 보기는 예전처럼 메뉴(프로필)
    onTap: (m, el) => { if (adminView) openMenu(m, el); else if (m.reply_to && document.getElementById(`gm-${m.reply_to}`)) jumpTo(m.reply_to); },
    onDoubleTap: adminView ? undefined : m => { if (canWriteRef.current) react(m, '❤️'); },
    onLongPress: (m, el) => openMenu(m, el),
    onSwipe: adminView ? undefined : m => { if (canWriteRef.current) startReply(m); },
  });

  const rename = async () => {
    const next = window.prompt('새 방 이름을 적어 주세요 (40자까지)', name);
    if (next === null || !next.trim() || next.trim() === name) return;
    const { error: err } = await supabase.rpc('rename_group_chat', { p_chat: chatId, p_name: clipText(next.trim(), 40) });
    if (err) { alert(/[가-힣]/.test(err.message) ? err.message.replace(/^.*?: /, '') : '이름을 바꾸지 못했어요.'); return; }
    setName(clipText(next.trim(), 40));
    onChanged?.();
  };

  const leave = async () => {
    if (!(await askConfirm(`'${name}' 채팅방에서 나갈까요?\n나가면 이 방의 대화를 더 볼 수 없어요.`))) return;
    const { error: err } = await supabase.rpc('leave_group_chat', { p_chat: chatId });
    if (err) { alert('나가지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    onChanged?.();
    onClose();
  };

  const me = members.some(m => m.user_id === user.id);
  const canWrite = !adminView && me && !error;
  useTypeToInput(() => inputRef.current, !!canWrite); // 실제 자판: 입력칸 밖에서 엔터·글자 → 입력칸으로
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;
  const nameOf = (id: string | null) => (id === user.id ? '나' : (id && people[id]?.baptismal_name) || '교우');
  const preview = (m: GroupMessage) => (m.user_id && blockedIds.has(m.user_id) ? '차단한 교우의 메시지' : quoteLabel(m));

  // 입력 중 표시 (관리자 보기는 보기만, 알리지 않음)
  const typing = useTyping(`group:${chatId}`, user.id, !adminView);
  // 사진·동영상 보내기 (여러 장이면 묶어서 / 한 장씩)
  const media = useChatMedia({
    userId: user.id,
    getText: () => inputRef.current?.value ?? input,
    clearText: () => setInput(''),
    insert: async row => {
      const { data, error: err } = await supabase.from('group_chat_messages').insert({ chat_id: chatId, ...row }).select('*').single();
      if (!err && data) { atBottomRef.current = true; addMessages([data as GroupMessage]); }
      return { id: (data as GroupMessage | null)?.id ?? null, error: err };
    },
    onSent: id => onSent?.(String(id)),
  });
  // 사진 단추를 꾹 → '🔕 조용히 사진 보내기' (따로 숨긴 고르기 칸 — 고른 사진·동영상은 알림 없이)
  const quietFileRef = useRef<HTMLInputElement>(null);
  const photoQuiet = useQuietSend(() => quietFileRef.current?.click(), { label: '조용히 사진 보내기', align: 'left', disabled: media.sending });

  // 카톡식 메뉴: 복사 · 선택 복사 · 책갈피 · 캡처 · 내 화면에서만 지우기 (이 휴대폰에만 저장)
  const [selectCopy, setSelectCopy] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const bookmarks = useBookmarks(user.id, `group:${chatId}`);
  const hiddenMsgs = useHiddenMessages(user.id, `group:${chatId}`);
  // 대화 내용 찾기 (머리줄 🔍, components/ChatSearch): 최근 대화만 불러와 있어 서버에서도 찾고, 찾은 옛 대화까지 불러와서 보여 줌
  const searchable = (m: { id: string; user_id: string | null; content: string; image_url?: string | null }) =>
    hiddenMsgs.hidden.has(m.id) || (!!m.user_id && blockedIds.has(m.user_id)) ? '' : chatSearchText(m);
  const search = useChatSearch({
    items: messages,
    getId: m => m.id,
    getAt: m => m.created_at,
    getText: m => (m.kind === 'text' ? searchable(m) : ''),
    findElement: id => document.getElementById(`gm-${id}`),
    remote: async q => {
      const { data } = await supabase.from('group_chat_messages').select('id, user_id, content, image_url, created_at')
        .eq('chat_id', chatId).eq('kind', 'text').ilike('content', likePattern(q)).order('created_at', { ascending: false }).limit(200);
      const needle = q.toLowerCase();
      return ((data || []) as { id: string; user_id: string | null; content: string; image_url: string | null; created_at: string }[])
        .filter(r => searchable(r).toLowerCase().includes(needle)).map(r => ({ id: r.id, at: r.created_at }));
    },
    // 찾은 대화가 아직 안 불러온 옛 대화면 그 대화부터 지금 불러온 것 앞까지 한 번에
    ensureLoaded: async hit => {
      const first = messagesRef.current[0];
      if (!first || hit.at >= first.created_at) return;
      const { data } = await supabase.from('group_chat_messages').select('*')
        .eq('chat_id', chatId).gte('created_at', hit.at).lt('created_at', first.created_at).order('created_at', { ascending: true }).limit(1000);
      const rows = (data || []) as GroupMessage[];
      if (!rows.length) return;
      atBottomRef.current = false;
      setMessages(prev => [...rows.filter(r => !prev.some(p => p.id === r.id)), ...prev]);
      loadPeople(rows.map(r => r.user_id));
      loadReactions(textIds(rows));
      await new Promise(r => setTimeout(r, 80));
    },
    onJump: () => { atBottomRef.current = false; },
  });
  const [captureAsk, setCaptureAsk] = useState<string | null>(null);
  const [capturePick, setCapturePick] = useState<Set<string> | null>(null);
  const [captured, setCaptured] = useState<Blob | null>(null);
  // 단체방 안의 작은 창은 휴대폰 뒤로가기로 그것만 닫는다 (단체방은 그대로, lib/back-layers)
  useBackLayer(!!menuMsg, () => setMenuMsg(null));
  useBackLayer(showMembers, () => setShowMembers(false));
  useBackLayer(selectCopy !== null, () => setSelectCopy(null));
  useBackLayer(showBookmarks, () => setShowBookmarks(false));
  useBackLayer(!!captureAsk, () => setCaptureAsk(null));
  useBackLayer(!!capturePick, () => setCapturePick(null));
  useBackLayer(!!captured, () => setCaptured(null));
  const [capturing, setCapturing] = useState(false);
  const makeCapture = async (ids: string[]) => {
    const pick = messages.filter(m => ids.includes(m.id) && !hiddenMsgs.hidden.has(m.id));
    if (pick.length === 0) { alert('캡처할 메시지가 없어요.'); return; }
    setCapturing(true);
    try {
      const items: CaptureItem[] = pick.map(m => {
        const blockedMsg = !!m.user_id && blockedIds.has(m.user_id);
        return {
          id: m.id, system: m.kind === 'system', mine: m.user_id === user.id, name: m.user_id === user.id ? undefined : nameOf(m.user_id), time: m.created_at,
          text: blockedMsg ? '차단한 교우의 메시지예요' : isMediaOnlyText(m.content) ? '' : chatPreview(m.content),
          photos: blockedMsg ? undefined : m.images?.length ? m.images : m.image_url && !isVideoUrl(m.image_url) ? [m.image_url] : undefined,
          video: !blockedMsg && isVideoUrl(m.image_url),
        };
      });
      setCaptured(await renderCapture(items, `👥 ${name || '단체 채팅방'}`, { mine: '#047857', bg: '#eef1ea' }));
      setCapturePick(null);
    } catch { alert('캡처하지 못했어요. 잠시 후 다시 해 주세요.'); }
    finally { setCapturing(false); }
  };

  return (
    // 실제로 보이는 화면에 딱 맞춤 (아이패드에서 자판·단축 막대가 올라오거나 화면이 옆으로 밀려도 위의 방 이름이 늘 보이고 치우치지 않게, `.fit-visual`)
    <div className="fit-visual z-[75] bg-blue-50 flex flex-col" role="dialog" aria-label={`단체 채팅방 ${name}`}>
      <div className="shrink-0 bg-white border-b border-stone-200 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 flex items-center gap-1">
        {search.open ? <ChatSearchBar s={search} /> : (<>
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-stone-700" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => setShowMembers(true)} className="flex-1 min-w-0 text-left" aria-label="참여한 교우 보기">
          <h2 className="font-bold text-[1.0625rem] text-stone-900 truncate">👥 {name || '단체 채팅방'}</h2>
          <p className="text-[0.8125rem] text-stone-500">{members.length}명 함께하는 중 <span className="text-stone-400">▾ 누구?</span></p>
        </button>
        <ChatSearchButton onClick={() => search.setOpen(true)} className="w-11 h-11 text-stone-600" />
        {bookmarks.list.length > 0 && <button onClick={() => setShowBookmarks(true)} className="w-11 h-11 flex items-center justify-center text-lg" aria-label={`책갈피 ${bookmarks.list.length}개 보기`}><Icon name="bookmark" fill className="w-6 h-6 text-amber-600" /></button>}
        <button onClick={() => setShowMembers(true)} className="w-11 h-11 flex items-center justify-center text-stone-600" aria-label="채팅방 메뉴">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        </>)}
      </div>
      {adminView && (
        <p className="shrink-0 bg-stone-800 text-white px-4 py-2 text-[0.8125rem] leading-snug">🔒 관리자 보기 · 읽기만 할 수 있어요. 교우들에게는 관리자가 본다는 표시가 나타나지 않아요.</p>
      )}

      <div ref={listRef} {...stickerTap} onScroll={e => {
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottomRef.current && newBelow) setNewBelow(0);
      }} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col">
        <div ref={contentRef} className="mt-auto flex flex-col gap-2">
          {hasOlder && <button onClick={loadOlder} className="self-center text-[0.8125rem] text-stone-600 bg-white border border-stone-200 rounded-full px-4 py-1.5">이전 대화 더 보기</button>}
          {loading && <p className="text-center text-stone-400 text-sm py-10">불러오는 중...</p>}
          {error && <p className="text-center text-stone-500 text-sm py-10 px-6">{error}</p>}
          {!loading && !error && messages.length === 0 && <p className="text-center text-stone-400 text-sm py-10">아직 대화가 없어요. 먼저 인사를 건네 보세요 😊</p>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = isNewChatDay(messages, i, x => hiddenMsgs.hidden.has(x.id));
            const dayLine = newDay && <ChatDayDivider iso={m.created_at} />;
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
            const rs = reactions[m.id] || [];
            const counts = ALL_EMOJIS.map(e => ({ e, n: rs.filter(r => r.emoji === e).length })).filter(x => x.n > 0);
            const quoted = m.reply_to ? messages.find(x => x.id === m.reply_to) : undefined;
            const sticker = parseSticker(m.content);
            const withSticker = chatStickerParts(m.content); // 글과 함께 보낸 이모티콘 → 이모티콘(말풍선 없이) + 글 말풍선, 숫자·시간은 하나
            const tone = mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-stone-900 rounded-bl-md shadow-sm';
            if (hiddenMsgs.hidden.has(m.id)) return null; // 내 화면에서만 지운 메시지
            const picked = !!capturePick?.has(m.id);
            return (
              <div key={m.id} id={`gm-${m.id}`}>
                {dayLine}
                <div className={`relative flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '-mt-1' : ''} ${picked ? 'bg-amber-200/50 rounded-2xl -mx-2 px-2 py-1' : ''}`}>
                  {/* 대화 골라서 캡처하는 중: 줄을 누르면 고르기 */}
                  {capturePick && (
                    <button type="button" onClick={() => setCapturePick(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                      className="absolute inset-0 z-10 flex items-center" aria-pressed={picked} aria-label={picked ? '캡처에서 빼기' : '캡처할 메시지로 고르기'}>
                      <span className={`ml-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[0.8125rem] font-bold ${picked ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white/90 border-stone-400'}`}>{picked ? '✓' : ''}</span>
                    </button>
                  )}
                  {!mine && (grouped ? <span className="w-10 shrink-0" /> : (
                    <button onClick={() => m.user_id && onOpenProfile(m.user_id)} className="shrink-0 self-start" aria-label={`${a?.baptismal_name || '교우'}님 공간`}>
                      <CelebrateBand id={m.user_id}>{a?.avatar_url
                        ? <img loading="lazy" src={a.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                        : <span className="w-10 h-10 rounded-full bg-stone-300 text-stone-700 font-serif font-bold flex items-center justify-center">{initial(a?.baptismal_name, '교')}</span>}</CelebrateBand>
                    </button>
                  ))}
                  <div className={`min-w-0 max-w-[78%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && !grouped && (
                      <span className="flex items-center gap-1 text-[0.8125rem] font-bold text-stone-700 mb-0.5 ml-1">
                        {a?.baptismal_name || '교우'}<RoleBadge type={a?.badge_type} size="xs" showLabel={false} />
                      </span>
                    )}
                    <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''} ${counts.length ? 'mb-4' : ''}`}>
                      <div className="relative min-w-0">
                        {/* 옆으로 미는 중: 드러나는 답장 표시 */}
                        {gestures.swipe?.id === m.id && <SwipeHint dx={gestures.swipe.dx} />}
                        <div data-bubble role="button" tabIndex={0} aria-haspopup="dialog"
                          {...gestures.bind(m)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(m, e.currentTarget); } }}
                          className={`relative text-left px-3.5 py-2 rounded-2xl text-[1rem] leading-relaxed whitespace-pre-wrap break-words select-none [-webkit-touch-callout:none] [touch-action:pan-y] cursor-pointer ${flashId === m.id ? 'ring-4 ring-amber-300' : ''} ${search.currentId === m.id ? 'ring-4 ring-yellow-300' : ''} ${blocked ? 'bg-white/60 text-stone-400 italic' : sticker || withSticker ? `!px-0 !py-0 bg-transparent flex flex-col ${mine ? 'items-end' : 'items-start'}` : tone}`}>
                          {/* 답장: 어떤 메시지에 대한 답인지 (누르면 그 메시지로) */}
                          {m.reply_to && (
                            <button type="button" onClick={e => { e.stopPropagation(); jumpTo(m.reply_to!); }}
                              aria-label={`${quoted ? nameOf(quoted.user_id) : '이전 메시지'}에게 답장 · 눌러서 원래 메시지 보기`}
                              className={`flex max-w-full items-center gap-1 text-left not-italic mb-0.5 text-[0.8125rem] leading-snug ${mine && !sticker && !withSticker ? 'text-white/70' : 'text-stone-400'}`}>
                              {quoted && !(quoted.user_id && blockedIds.has(quoted.user_id)) && <QuoteThumb m={quoted} />}
                              <span className="min-w-0 truncate">{quoted ? preview(quoted) : '이전 대화의 메시지'}</span>
                              <span aria-hidden="true" className="shrink-0">↵</span>
                            </button>
                          )}
                          {/* 사진(묶음이면 바둑판)·동영상 */}
                          {!blocked && <ChatMediaView imageUrl={m.image_url} images={m.images} onOpen={(imgs, i) => onZoom?.(imgs, i)} className="-mx-1.5 mt-0.5 mb-1" />}
                          {blocked ? '차단한 교우의 메시지예요' : sticker ? <StickerImage sticker={sticker} /> : withSticker ? <StickerWithText parts={withSticker} bubble={`px-3.5 py-2 rounded-2xl ${tone}`} /> : (m.image_url || m.images?.length) && isMediaOnlyText(m.content) ? null : search.q ? <HighlightText text={m.content} q={search.q} /> : m.content}
                        </div>
                        {/* 감정을 고르면 잠깐 크게 */}
                        {heartPop?.id === m.id && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center animate-[heartBurst_0.7s_ease-out_forwards]">
                            {heartPop.emoji === '❤️' ? <Icon name="heart" fill className="w-10 h-10 text-rose-500 drop-shadow" /> : <span className="text-4xl drop-shadow">{heartPop.emoji}</span>}
                          </span>
                        )}
                        {/* 메시지 밑 감정 표시 (누르면 고르기) */}
                        {counts.length > 0 && (
                          <button onClick={e => openMenu(m, e.currentTarget.parentElement?.querySelector('[data-bubble]') ?? e.currentTarget)}
                            aria-label={`감정 표시 ${counts.map(c => `${c.e} ${c.n}`).join(', ')}${adminView ? '' : ' · 눌러서 고르기'}`}
                            className={`absolute -bottom-4 ${mine ? 'right-2' : 'left-2'} flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-stone-200 shadow-sm text-[0.8125rem] leading-none text-stone-600`}>
                            {counts.map(c => <span key={c.e} className="inline-flex items-center">{c.e === '❤️' ? <Icon name="heart" fill className="w-3.5 h-3.5 text-rose-500" /> : c.e}{c.n > 1 && <span className="ml-0.5 text-[0.75rem]">{c.n}</span>}</span>)}
                          </button>
                        )}
                      </div>
                      <span className="shrink-0 text-[0.6875rem] leading-tight text-stone-500 pb-0.5 flex flex-col items-center">{m.edited_at && <span className="text-stone-400">수정됨</span>}{bookmarks.has(m.id) && <span aria-label="책갈피">🔖</span>}<span>{timeOf(m.created_at)}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 위로 올려 보는 중: 오른쪽 아래 '최근 대화로' (새 대화 수와 함께) */}
      {!stickerPick.open && !stickerPick.picked && !hasStickerSuggestion(input) && <JumpToLatest listRef={listRef} newCount={newBelow} onJump={() => scrollToBottom(true)} />}

      <TypingIndicator typers={typing.typers} lookup={id => (people[id] ? { name: people[id].baptismal_name, avatar: people[id].avatar_url ?? null } : undefined)} />
      {media.bar}
      {media.choice}
      {capturePick && <CaptureBar count={capturePick.size} busy={capturing} onCancel={() => setCapturePick(null)} onDone={() => makeCapture(Array.from(capturePick))} />}
      {/* 추천 이모티콘·고른 이모티콘: 대화 위에 떠서 보임 (대화창이 줄어들지 않게) */}
      {canWrite && !capturePick && !editing && <div className="relative h-0 shrink-0 z-20"><StickerAbove picker={stickerPick} text={input} onTextChange={setInput} /></div>}
      {canWrite && !capturePick && (replyTo || editing) && (() => {
        const m = (editing || replyTo)!;
        return (
          <div className="shrink-0 px-3 pt-2 bg-white border-t border-stone-200 flex items-start gap-2">
            <div className="flex-1 min-w-0 border-l-4 border-emerald-500 pl-2.5 py-0.5">
              <p className="text-[0.8125rem] font-bold text-emerald-800">{editing ? '✏️ 메시지 고치는 중' : `↩️ ${m.user_id === user.id ? '내 메시지' : `${nameOf(m.user_id)}님 메시지`}에 답장`}</p>
              <p className="text-[0.8125rem] text-stone-500 line-clamp-1">{preview(m)}</p>
            </div>
            {!editing && !(m.user_id && blockedIds.has(m.user_id)) && <QuoteThumb m={m} size="w-11 h-11" />}
            <button type="button" onClick={() => { if (editing) cancelEdit(); else { setReplyTo(null); stickerPick.setPicked(null); } }} className="w-9 h-9 shrink-0 flex items-center justify-center text-stone-400 text-2xl leading-none" aria-label={editing ? '고치기 그만두기' : '답장 그만두기'}>×</button>
          </div>
        );
      })()}
      {canWrite && !capturePick && (
        <>
        <form onSubmit={submit} className={`shrink-0 bg-white ${replyTo || editing ? '' : 'border-t border-stone-200'} px-3 pt-2.5 ${stickerPick.open ? 'pb-2.5' : 'pb-[calc(0.625rem+env(safe-area-inset-bottom))]'} flex items-end gap-2`}>
          {/* 사진·동영상 보내기 (여러 개 한꺼번에, 꾹 누르면 '🔕 조용히 사진 보내기') */}
          <div className="relative shrink-0">
            {!editing && photoQuiet.menu}
            <label {...(editing ? {} : photoQuiet.buttonProps)} className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer select-none [-webkit-touch-callout:none] ${media.sending ? 'bg-stone-200 text-stone-400' : 'bg-stone-100 text-stone-700'}`} aria-label="사진·동영상 보내기 (여러 개 한꺼번에 고를 수 있어요, 꾹 누르면 조용히 보내기)">
              {media.sending ? <span className="w-4 h-4 rounded-full border-2 border-stone-400 border-t-transparent animate-spin" /> : <Icon name="camera" className="w-5 h-5" />}
              <input type="file" accept="image/*,video/*" multiple className="hidden" disabled={media.sending || !!editing} onChange={media.onPick} />
            </label>
            <input ref={quietFileRef} type="file" accept="image/*,video/*" multiple className="hidden" disabled={media.sending || !!editing} onChange={media.onPickQuiet} aria-hidden tabIndex={-1} />
          </div>
          <StickerButton open={stickerPick.open} disabled={!!editing} className="w-11 h-11" onClick={() => { stickerPick.setOpen(!stickerPick.open); leaveInputForPanel(inputRef.current); }} />
          <textarea
            ref={setInputEl}
            value={input}
            onChange={e => { setInput(clipText(e.target.value, 1000)); typing.notify(e.target.value); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            enterKeyHint={enter.enterKeyHint}
            onKeyDown={enter.onKeyDown}
            rows={1}
            autoCorrect="on" autoCapitalize="sentences" spellCheck
            placeholder={editing ? '고칠 내용을 적어 주세요' : '메시지 입력...'}
            className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-[1rem] text-stone-900 focus:outline-none focus:border-stone-500"
            aria-label="단체 채팅방에 보낼 말"
            onFocus={() => closePanelOnInputFocus(() => stickerPick.setOpen(false))}
          />
          {/* 보내기 (꾹 누르면 '🔕 조용히 보내기') */}
          <div className="relative shrink-0">
            {!editing && quietSend.menu}
            <button type="submit" {...(editing ? { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() } : quietSend.buttonProps)} disabled={(!input.trim() && !stickerPick.picked) || sending} className="h-11 px-4 rounded-2xl bg-blue-600 disabled:bg-stone-300 text-white font-bold text-[0.9375rem] select-none [-webkit-touch-callout:none]">{sending ? '...' : editing ? '고치기' : '보내기'}</button>
          </div>
        </form>
        {stickerPick.open && !editing && <StickerPanel picker={stickerPick} />}
        </>
      )}

      {/* 메시지를 꾹 누르면(내 메시지는 한 번 눌러도): 그 메시지 바로 위에 감정 표시, 아래에 답장 · 고치기 · 프로필 · 신고 · 지우기 */}
      {menuMsg && (() => {
        const m = menuMsg;
        const mine = m.user_id === user.id;
        const myEmoji = (reactions[m.id] || []).find(r => r.user_id === user.id)?.emoji;
        const close = () => setMenuMsg(null);
        const blockedMsg = !!m.user_id && blockedIds.has(m.user_id);
        const text = blockedMsg || isMediaOnlyText(m.content) || parseSticker(m.content) ? '' : chatText(m.content);
        return (
          <MessageMenu anchor={menuAnchor} alignRight={mine} onClose={close}
            emojis={canWrite ? REACTION_EMOJIS : undefined} moreEmojis={MORE_EMOJIS} selected={myEmoji ? [myEmoji] : []} onEmoji={e => react(m, e)}
            actions={[
              ...(text ? [
                { label: '복사', run: async () => { close(); toast((await copyText(text)) ? '복사했어요' : '복사하지 못했어요'); } },
                { label: '선택 복사', run: () => { close(); setSelectCopy(text); } },
              ] : []),
              ...(blockedMsg ? [] : mediaMenuActions(m, close)),
              ...(canWrite ? [{ label: '답장', run: () => startReply(m) }] : []),
              ...(canWrite && canEdit(m) ? [{ label: '고치기', run: () => startEdit(m) }] : []),
              { label: bookmarks.has(m.id) ? '책갈피 해제' : '책갈피 설정', run: () => { close(); bookmarks.toggle({ id: m.id, text: text || (parseSticker(m.content) ? m.content : isVideoUrl(m.image_url) ? '🎬 동영상' : '📷 사진'), name: nameOf(m.user_id), at: m.created_at }); } },
              { label: '캡처', run: () => { close(); setCaptureAsk(m.id); } },
              ...(adminView && !mine && m.user_id ? [{ label: '프로필 보기', run: () => { close(); onOpenProfile(m.user_id!); } }] : []),
              ...(!mine && !adminView && m.user_id ? [{ label: '신고', run: () => { close(); onReport({ type: 'user', id: m.user_id!, userId: m.user_id!, userName: people[m.user_id!]?.baptismal_name, preview: `[단체 채팅방 '${name}'] ${m.content}` }); } }] : []),
              ...(mine && !adminView
                ? [{ label: '삭제', run: () => remove(m), danger: true }]
                : [{ label: '삭제 (내 화면에서만)', run: async () => { close(); if ((await askConfirm('이 메시지를 내 화면에서 지울까요?\n다른 교우들 화면에는 그대로 남아요.'))) hiddenMsgs.hide(m.id); }, danger: true }]),
            ]} />
        );
      })()}

      {captureAsk && (
        <CaptureChoice onClose={() => setCaptureAsk(null)}
          onPick={() => { setCapturePick(new Set([captureAsk])); setCaptureAsk(null); }}
          onScreen={() => { setCaptureAsk(null); makeCapture(visibleIds(listRef.current, 'gm-')); }} />
      )}
      {captured && <CapturePreview blob={captured} title={`단체 채팅방 ${name}`} onClose={() => setCaptured(null)} />}
      {selectCopy !== null && <SelectCopySheet text={selectCopy} onClose={() => setSelectCopy(null)} />}
      {showBookmarks && (
        <BookmarkSheet items={bookmarks.list} onClose={() => setShowBookmarks(false)} onRemove={bookmarks.remove}
          onJump={id => { setShowBookmarks(false); if (document.getElementById(`gm-${id}`)) setTimeout(() => jumpTo(id), 50); else alert('지금 불러온 대화에 없는 메시지예요. 위로 올려 \'이전 대화 더 보기\'를 눌러 주세요.'); }} />
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
                <button onClick={() => { setShowMembers(false); setShowInvite(true); }} className="py-2.5 rounded-xl bg-blue-600 text-white text-[0.9375rem] font-bold">➕ 교우 초대</button>
                <button onClick={rename} className="py-2.5 rounded-xl border border-stone-300 text-stone-700 text-[0.9375rem] font-bold">✏️ 방 이름 바꾸기</button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {members.map(m => {
                const p = people[m.user_id];
                return (
                  <button key={m.user_id} onClick={() => { setShowMembers(false); onOpenProfile(m.user_id); }} className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-stone-50">
                    <CelebrateBand id={m.user_id}>{p?.avatar_url
                      ? <img loading="lazy" src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                      : <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-700 font-serif font-bold flex items-center justify-center">{initial(p?.baptismal_name, '교')}</span>}</CelebrateBand>
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
