'use client';

import { useCallback, useEffect, useState } from 'react';

// 대화방(1:1 메시지·단체 채팅방·사랑방) 공통: 복사 · 잠깐 뜨는 안내 · 책갈피 · 내 화면에서만 지우기
// 책갈피와 '내 화면에서만 지우기'는 이 휴대폰에만 저장한다 (서버에 남기지 않음)

// 잠깐 떴다 사라지는 안내 (예: '복사했어요')
export function toast(message: string, ms = 1300) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(6rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:200;'
    + 'background:rgba(28,25,23,.9);color:#fff;font-size:15px;font-weight:700;padding:10px 18px;border-radius:999px;pointer-events:none;'
    + 'transition:opacity .3s;max-width:80vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, ms);
  setTimeout(() => el.remove(), ms + 400);
}

// 글 복사 (클립보드를 못 쓰는 브라우저는 예전 방식으로)
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* 무시 */ }
    ta.remove();
    return ok;
  }
}

const readJson = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

// 책갈피: 대화방마다 표시해 둔 메시지 (누르면 그 메시지로)
export interface Bookmark { id: string; text: string; name: string; at: string }
export function useBookmarks(userId: string | null | undefined, room: string | null) {
  const key = userId && room ? `chatBookmarks:${userId}:${room}` : null;
  const [list, setList] = useState<Bookmark[]>([]);
  useEffect(() => { setList(key ? readJson<Bookmark[]>(key, []) : []); }, [key]);
  const save = useCallback((next: Bookmark[]) => { setList(next); if (key) writeJson(key, next); }, [key]);
  const has = (id: string) => list.some(b => b.id === id);
  const toggle = (b: Bookmark) => {
    if (has(b.id)) { save(list.filter(x => x.id !== b.id)); toast('책갈피를 뺐어요'); }
    else { save([...list, b].sort((x, y) => x.at.localeCompare(y.at)).slice(-200)); toast('🔖 책갈피를 꽂았어요'); }
  };
  const remove = (id: string) => save(list.filter(x => x.id !== id));
  return { list, has, toggle, remove };
}

// 남이 보낸 메시지를 내 화면에서만 지우기
export function useHiddenMessages(userId: string | null | undefined, room: string | null) {
  const key = userId && room ? `chatHidden:${userId}:${room}` : null;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => { setHidden(new Set(key ? readJson<string[]>(key, []) : [])); }, [key]);
  const hide = (id: string) => {
    const next = new Set(hidden); next.add(id);
    setHidden(next);
    if (key) writeJson(key, Array.from(next).slice(-1000));
  };
  return { hidden, hide };
}
