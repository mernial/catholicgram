'use client';

import { useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { CelebrateBand } from '@/components/CelebrateAvatar';
import RoleBadge from '@/components/RoleBadge';
import { initial } from '@/lib/fancy-name';
import BottomSheet from '@/components/BottomSheet';
import { clipText } from '@/lib/clip-text';

// 새 채팅: @아이디나 이름으로 교우를 찾아 1:1 메시지를 보내거나, 여러 명을 골라 단체 채팅방을 만든다.
// 단체 채팅방 안에서 '교우 초대하기'에도 쓴다 (supabase/group-chats.sql)
export interface ChatPerson { id: string; baptismal_name: string; handle?: string | null; avatar_url?: string | null; badge_type?: string | null }

export const GROUP_SETUP_HINT = '단체 채팅방을 준비 중이에요. (관리자: supabase/group-chats.sql 실행 필요)';
export const isGroupSetupError = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883' || /does not exist|schema cache|Could not find the function/i.test(e.message || ''));
// 서버가 보낸 안내(예: '초대할 교우를 한 명 이상 골라 주세요')는 그대로, 나머지는 쉬운 말로
const friendly = (e: { code?: string; message?: string }, fallback: string) =>
  isGroupSetupError(e) ? GROUP_SETUP_HINT : /[가-힣]/.test(e.message || '') ? (e.message || '').replace(/^.*?: /, '') : fallback;

// 검색어에서 PostgREST 거르기 문법을 깨는 글자(쉼표·괄호·별표 등)는 뺀다
const cleanQuery = (q: string) => q.trim().replace(/^@+/, '').replace(/[^0-9A-Za-z_.가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '').slice(0, 30);

// 찾은 교우 순서: 이름·@아이디가 똑같음 → 이름이 그 말로 시작 → @아이디가 그 말로 시작 → 이름에 들어 있음 → @아이디에 들어 있음
// (같으면 최근 대화한 교우 먼저, 그다음 짧은 이름) — 찾은 사람이 맨 위 추천으로 보이게 (운영자 2026-11-03)
const squash = (t: string | null | undefined) => (t || '').toLowerCase().replace(/\s+/g, '');
export function rankPeople(rows: ChatPerson[], q: string, known: Set<string>) {
  const k = squash(q);
  const score = (p: ChatPerson) => {
    const n = squash(p.baptismal_name), h = squash(p.handle);
    if (n === k || h === k) return 0;
    if (n.startsWith(k)) return 1;
    if (h.startsWith(k)) return 2;
    if (n.includes(k)) return 3;
    return 4;
  };
  return rows
    .map(p => ({ p, s: score(p), known: known.has(p.id) ? 0 : 1 }))
    .sort((a, b) => a.s - b.s || a.known - b.known || a.p.baptismal_name.length - b.p.baptismal_name.length || a.p.baptismal_name.localeCompare(b.p.baptismal_name, 'ko'))
    .map(x => x.p);
}

const Avatar = ({ p, size = 'w-11 h-11' }: { p: ChatPerson; size?: string }) => <CelebrateBand id={p.id}>{p.avatar_url
  ? <img loading="lazy" src={p.avatar_url} alt="" className={`${size} rounded-full object-cover border border-stone-200 shrink-0`} />
  : <span className={`${size} rounded-full bg-stone-200 text-stone-700 font-serif font-bold flex items-center justify-center shrink-0`}>{initial(p.baptismal_name, '교')}</span>}</CelebrateBand>;

export default function NewChat({ user, mode, chatId, excludeIds = [], blockedIds, suggestions = [], onClose, onOpenDM, onCreated, onInvited }: {
  user: User;
  mode: 'start' | 'invite';             // start: 새 채팅(1:1 또는 단체 만들기) · invite: 이 단체방에 초대
  chatId?: string;                      // invite 일 때 그 방
  excludeIds?: string[];                // invite 일 때 이미 들어와 있는 교우
  blockedIds: Set<string>;
  suggestions?: ChatPerson[];           // 검색 전에 보여 줄 교우 (최근 대화한 교우)
  onClose: () => void;
  onOpenDM?: (p: ChatPerson) => void;
  onCreated?: (chatId: string) => void;
  onInvited?: (count: number) => void;
}) {
  const [kind, setKind] = useState<'dm' | 'group'>(mode === 'invite' ? 'group' : 'dm');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const skip = new Set([user.id, ...excludeIds, ...blockedIds]);
  const knownRef = useRef(new Set<string>()); // 최근 대화한 교우 (같은 순위면 먼저)
  useEffect(() => { knownRef.current = new Set(suggestions.map(p => p.id)); }, [suggestions]);

  // 글자를 칠 때마다가 아니라 잠깐 멈추면 찾는다
  useEffect(() => {
    const q = cleanQuery(query);
    if (!q) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url, badge_type')
        .or(`handle.ilike.%${q}%,baptismal_name.ilike.%${q}%`).neq('id', user.id).limit(50);
      if (cleanQuery(inputRef.current?.value || '') !== q) return; // 그 사이 다른 걸 쳤으면 버림
      setResults(rankPeople(((data || []) as ChatPerson[]).filter(p => p.baptismal_name), q, knownRef.current));
      setSearching(false);
      if (listRef.current) listRef.current.scrollTop = 0; // 가장 잘 맞는 교우가 보이게 맨 위부터
    }, 300);
    return () => clearTimeout(t);
  }, [query, user.id]);

  const list = (results ?? suggestions).filter(p => !skip.has(p.id));
  const typing = !!cleanQuery(query);
  const isPicked = (id: string) => picked.some(p => p.id === id);
  const toggle = (p: ChatPerson) => setPicked(prev => prev.some(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : prev.length >= 49 ? prev : [...prev, p]);
  const defaultName = picked.slice(0, 3).map(p => p.baptismal_name).join(', ') + (picked.length > 3 ? ` 외 ${picked.length - 3}명` : '');

  const create = async () => {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('create_group_chat', { p_name: clipText(defaultName, 40), p_members: picked.map(p => p.id) });
    setSaving(false);
    if (error || !data) { alert(error ? friendly(error, `채팅방을 만들지 못했어요.\n(${error.message})`) : '채팅방을 만들지 못했어요.'); return; }
    onCreated?.(data as string);
  };

  const invite = async () => {
    if (!chatId || picked.length === 0 || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('invite_to_group_chat', { p_chat: chatId, p_members: picked.map(p => p.id) });
    setSaving(false);
    if (error) { alert(friendly(error, `초대하지 못했어요.\n(${error.message})`)); return; }
    const n = Number(data) || 0;
    if (n === 0) alert('초대할 수 있는 교우가 없어요.\n(이미 들어와 있거나, 서로 차단한 교우는 초대할 수 없어요)');
    onInvited?.(n);
  };

  const title = mode === 'invite' ? '교우 초대하기' : '새 채팅';
  return (
    <BottomSheet bare label={title} onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100 flex flex-col gap-3">
          {/* 단체방: 만들기·초대 단추는 머리줄 오른쪽에 (아래 칸이 목록을 가려 고른 교우가 안 보였음 — 운영자 2026-11-03).
              방 이름은 고른 교우 이름으로 정하고, 만든 뒤 방 안 ☰ → 방 이름 바꾸기 */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-[1.125rem] text-stone-900 truncate">{title}</h2>
            <span className="flex items-center gap-1 shrink-0">
              {kind === 'group' && (
                <button onClick={mode === 'invite' ? invite : create} disabled={picked.length === 0 || saving}
                  className="h-9 px-4 rounded-full bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-[0.9375rem] font-bold">
                  {saving ? '잠시만요…' : `${mode === 'invite' ? '초대' : '만들기'}${picked.length ? ` ${picked.length}` : ''}`}
                </button>
              )}
              <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
            </span>
          </div>
          {/* 찾는 중엔 1:1·단체 칸을 접어 찾은 교우 자리를 넓힘 (자판이 올라온 태블릿 가로 화면 — 루비로사) */}
          {mode === 'start' && !typing && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-stone-100" role="tablist">
              {([['dm', '✉️ 1:1 메시지'], ['group', '👥 단체 채팅방 만들기']] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                  className={`py-2.5 rounded-xl text-[0.9375rem] font-bold ${kind === k ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>{label}</button>
              ))}
            </div>
          )}
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} type="search" inputMode="search" autoComplete="off"
            placeholder="@아이디 또는 이름으로 찾기" aria-label="교우 찾기"
            className="w-full px-4 py-3 rounded-2xl border border-stone-300 bg-stone-50 text-[1rem] focus:outline-none focus:border-stone-500" />
          {kind === 'group' && picked.length > 0 && (
            <div className={`flex gap-1.5 ${typing ? 'overflow-x-auto [scrollbar-width:none] -mx-4 px-4' : 'flex-wrap'}`} aria-label="고른 교우">
              {picked.map(p => (
                <button key={p.id} onClick={() => toggle(p)} className="shrink-0 pl-2.5 pr-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[0.875rem] font-bold text-emerald-900" aria-label={`${p.baptismal_name} 빼기`}>
                  {p.baptismal_name} <span className="text-emerald-600">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {results === null && list.length > 0 && <p className="px-4 pt-3 text-[0.8125rem] font-bold text-stone-500">최근 대화한 교우</p>}
          {!searching && results !== null && list.length > 0 && <p className="px-4 pt-3 pb-1 text-[0.8125rem] font-bold text-stone-500">&lsquo;{cleanQuery(query)}&rsquo; 찾은 교우 {list.length}명</p>}
          {results === null && list.length === 0 && (
            <p className="p-8 text-center text-[0.9375rem] text-stone-500 leading-relaxed">
              {kind === 'dm' ? '메시지를 보낼 교우의' : '함께할 교우의'} <b>@아이디</b>나 <b>이름</b>을<br />위 칸에 적어 찾아 주세요.
              {kind === 'group' && <span className="block mt-2 text-[0.8125rem] text-stone-400">교우를 고르고 위의 <b>{mode === 'invite' ? '초대' : '만들기'}</b>를 눌러 주세요.{mode === 'start' && <> 방 이름은 만든 뒤 방 안 ☰ 에서 바꿀 수 있어요.</>}</span>}
            </p>
          )}
          {searching && <p className="p-6 text-center text-sm text-stone-400">찾는 중...</p>}
          {!searching && results !== null && list.length === 0 && <p className="p-8 text-center text-sm text-stone-500">&lsquo;{cleanQuery(query)}&rsquo;(으)로 찾은 교우가 없어요.</p>}
          {!searching && list.map(p => {
            const on = isPicked(p.id);
            return (
              <button key={p.id} onClick={() => (kind === 'dm' ? onOpenDM?.(p) : toggle(p))}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left border-b border-stone-100 ${on ? 'bg-emerald-50/60' : 'hover:bg-stone-50'}`}
                aria-pressed={kind === 'group' ? on : undefined}>
                <Avatar p={p} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 font-bold text-[0.9375rem] text-stone-900"><span className="truncate">{p.baptismal_name}</span><RoleBadge type={p.badge_type} size="xs" showLabel={false} /></span>
                  {p.handle && <span className="block text-[0.8125rem] text-stone-500 truncate">@{p.handle}</span>}
                </span>
                {kind === 'dm'
                  ? <span className="shrink-0 px-3 py-1.5 rounded-full bg-stone-900 text-white text-[0.8125rem] font-bold">메시지</span>
                  : <span className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-white text-sm font-bold ${on ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>{on ? '✓' : ''}</span>}
              </button>
            );
          })}
        </div>

      </div>
    </BottomSheet>
  );
}
