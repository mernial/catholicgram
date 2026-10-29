'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/chat-actions';

// 게시글 음악 즐겨찾기: 이 휴대폰에만 저장 (localStorage 'musicFavorites', 최근에 넣은 것이 앞, 60곡까지).
// 가톨릭그램 음악(배경음악 id)과 유튜브 뮤직 노래(영상 id·제목) 둘 다. 음악 고르기(MusicPicker)의 ☆ 로 넣고 빼기
export type MusicFavorite =
  | { kind: 'bgm'; id: string; title: string }
  | { kind: 'yt'; videoId: string; title: string; channel?: string };

const KEY = 'musicFavorites';
const EVENT = 'music-favorites';
const MAX = 60;

export const musicFavKey = (f: MusicFavorite) => (f.kind === 'bgm' ? `bgm:${f.id}` : `yt:${f.videoId}`);

export function readMusicFavorites(): MusicFavorite[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is MusicFavorite => !!x && typeof x === 'object' && typeof x.title === 'string'
      && ((x.kind === 'bgm' && typeof x.id === 'string') || (x.kind === 'yt' && typeof x.videoId === 'string')));
  } catch { return []; }
}

export function useMusicFavorites() {
  const [list, setList] = useState<MusicFavorite[]>(() => (typeof window === 'undefined' ? [] : readMusicFavorites()));
  useEffect(() => {
    const load = () => setList(readMusicFavorites());
    window.addEventListener(EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(EVENT, load); window.removeEventListener('storage', load); };
  }, []);
  const keys = new Set(list.map(musicFavKey));
  const toggle = (f: MusicFavorite) => {
    const cur = readMusicFavorites();
    const k = musicFavKey(f);
    const on = cur.some(x => musicFavKey(x) === k);
    const next = on ? cur.filter(x => musicFavKey(x) !== k) : [f, ...cur].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 불가 */ }
    window.dispatchEvent(new Event(EVENT));
    try { navigator.vibrate?.(15); } catch { /* 무시 */ }
    toast(on ? '즐겨찾기에서 뺐어요' : '⭐ 즐겨찾기에 넣었어요');
  };
  return { list, has: (f: MusicFavorite) => keys.has(musicFavKey(f)), toggle };
}

// 같은 노래가 둘이라 하나를 지우고 다른 곡으로 합쳤을 때(관리자 음악 중복 정리) 즐겨찾기도 남긴 곡으로
export function replaceMusicFavorite(dropId: string, keepId: string, keepTitle: string) {
  const cur = readMusicFavorites();
  if (!cur.some(f => f.kind === 'bgm' && f.id === dropId)) return;
  const keepKey = `bgm:${keepId}`;
  const hasKeep = cur.some(f => musicFavKey(f) === keepKey);
  const next = cur.flatMap(f => (f.kind === 'bgm' && f.id === dropId ? (hasKeep ? [] : [{ kind: 'bgm' as const, id: keepId, title: keepTitle }]) : [f]));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 불가 */ }
  window.dispatchEvent(new Event(EVENT));
}
