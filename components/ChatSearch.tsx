'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { chatText, parseSticker } from '@/lib/stickers';
import { isMediaOnlyText } from '@/lib/upload';

// 대화방 대화 내용 찾기 (운영자 요청 '카카오톡 참고', 1:1·단체방·사랑방 공통)
//  - 머리줄 🔍 → 머리줄 자리에 찾기 칸. 치는 대로 찾고(0.25초 쉬면), 찾은 말은 노랗게 칠함
//  - 처음엔 가장 최근 것부터, ▲ = 더 오래된 것, ▼ = 더 최근 것, '2/7' 처럼 몇 번째인지. 지금 것은 말풍선 둘레를 노랗게
//  - 단체방·사랑방은 최근 대화만 불러와 있어서 서버에서도 찾고(remote), 아직 안 불러온 옛 대화면 거기까지 불러온 뒤(ensureLoaded) 보여 줌
export interface SearchHit { id: string; at: string } // at: 보낸 때 (오래된 → 최근 순서)

// 서버에서 찾을 때 ilike 의 특수 글자(% _ \)는 글자 그대로
export const likePattern = (q: string) => `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;

// 찾을 글: 이모티콘만·사진/동영상 자리 글·지운 메시지는 빼고, 이모티콘과 함께 보낸 글은 글만
export function chatSearchText(m: { content?: string | null; image_url?: string | null; deleted_at?: string | null }): string {
  if (m.deleted_at || !m.content || parseSticker(m.content)) return '';
  if (m.image_url && isMediaOnlyText(m.content)) return '';
  return chatText(m.content);
}

// 찾은 말을 노랗게 (대소문자 가리지 않음)
export function HighlightText({ text, q }: { text: string; q: string }) {
  const needle = q.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, i)) {
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={at} className="bg-yellow-300 text-stone-900 rounded-sm">{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

export function useChatSearch<T>({ items, getId, getAt, getText, findElement, remote, ensureLoaded, onJump }: {
  items: T[];
  getId: (m: T) => string;
  getAt: (m: T) => string;
  getText: (m: T) => string;
  findElement: (id: string) => HTMLElement | null;         // 그 메시지의 화면 칸
  remote?: (q: string) => Promise<SearchHit[]>;            // 아직 안 불러온 옛 대화에서도 찾기
  ensureLoaded?: (hit: SearchHit) => Promise<void>;        // 그 대화까지 불러오기
  onJump?: () => void;                                     // 맨 아래에 붙어 있지 않게 (새 메시지가 와도 보던 곳 그대로)
}) {
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(-1);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;

  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => {
    if (!q || !remoteRef.current) { setRemoteHits([]); setBusy(false); return; }
    let alive = true;
    setBusy(true);
    remoteRef.current(q).then(h => { if (alive) setRemoteHits(h); }).catch(() => {}).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [q]);

  const hits = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    const map = new Map<string, SearchHit>();
    for (const m of items) {
      const t = getText(m);
      if (t && t.toLowerCase().includes(needle)) map.set(getId(m), { id: getId(m), at: getAt(m) });
    }
    for (const h of remoteHits) if (!map.has(h.id)) map.set(h.id, h);
    return [...map.values()].sort((a, b) => a.at.localeCompare(b.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, remoteHits]);

  // 새로 찾으면 가장 최근 것부터
  useEffect(() => { setIndex(hits.length ? hits.length - 1 : -1); }, [q, hits.length]);
  const current = index >= 0 ? hits[index] ?? null : null;

  // 지금 것으로 가기 (안 불러온 옛 대화면 불러온 뒤)
  useEffect(() => {
    if (!current) return;
    let alive = true;
    (async () => {
      onJump?.();
      if (!findElement(current.id) && ensureLoaded) await ensureLoaded(current);
      [60, 300].forEach(ms => setTimeout(() => {
        if (alive) findElement(current.id)?.scrollIntoView({ block: 'center', behavior: ms === 60 ? 'smooth' : 'auto' });
      }, ms));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) { setQuery(''); setQ(''); setRemoteHits([]); }
  };
  return {
    open, setOpen, query, setQuery, q: open ? q : '', hits, index, busy,
    currentId: open ? current?.id ?? null : null,
    prev: () => setIndex(i => Math.max(0, i - 1)),
    next: () => setIndex(i => Math.min(hits.length - 1, i + 1)),
  };
}
export type ChatSearch = ReturnType<typeof useChatSearch<unknown>>;

// 머리줄 자리에 들어가는 찾기 칸: ‹ 닫기 · 🔍 [찾을 말] × · 2/7 · ▲ ▼
export function ChatSearchBar({ s, dark = false }: { s: ChatSearch; dark?: boolean }) {
  const count = !s.q ? '' : s.hits.length ? `${s.index + 1}/${s.hits.length}` : s.busy ? '찾는 중' : '없음';
  const btn = `w-9 h-9 shrink-0 rounded-full flex items-center justify-center disabled:opacity-30 ${dark ? 'text-white' : 'text-stone-700'}`;
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1" role="search">
      <button type="button" onClick={() => s.setOpen(false)} className={btn} aria-label="찾기 닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <label className={`flex-1 min-w-0 h-10 rounded-full pl-3 pr-1 flex items-center gap-1.5 ${dark ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-800'}`}>
        <Icon name="search" className="w-4 h-4 shrink-0 opacity-60" />
        <input autoFocus value={s.query} onChange={e => s.setQuery(e.target.value)} placeholder="대화 내용 찾기" enterKeyHint="search" autoComplete="off"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); s.prev(); } }}
          aria-label="대화 내용 찾기" className="flex-1 min-w-0 bg-transparent text-[1rem] outline-none placeholder:opacity-60" />
        {s.query && <button type="button" onClick={() => s.setQuery('')} className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center opacity-60 text-lg leading-none" aria-label="찾을 말 지우기">×</button>}
      </label>
      <span className={`shrink-0 min-w-[2.75rem] text-center text-[0.8125rem] tabular-nums ${dark ? 'text-white/80' : 'text-stone-500'}`} aria-live="polite">{count}</span>
      <button type="button" onClick={s.prev} disabled={s.index <= 0} className={btn} aria-label="더 오래된 대화">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      <button type="button" onClick={s.next} disabled={s.index < 0 || s.index >= s.hits.length - 1} className={btn} aria-label="더 최근 대화">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>
  );
}

// 머리줄의 🔍 단추
export function ChatSearchButton({ onClick, className = 'w-10 h-10 text-stone-700' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center ${className}`} aria-label="대화 내용 찾기">
      <Icon name="search" className="w-6 h-6" />
    </button>
  );
}
