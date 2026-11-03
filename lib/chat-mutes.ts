'use client';

// 채팅방 알림 끄기 (1:1·단체방, supabase/chat-settings.sql 의 chat_mutes — 본인 것만 읽고 씀)
// 서버(/api/push/notify)가 끈 방의 새 메시지는 휴대폰 알림을 보내지 않고, 앱 화면 배너·소리도 띄우지 않는다.
// 안 읽은 숫자는 그대로 (카카오톡처럼). 끈 방은 목록·대화방 머리줄에 🔕.
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

export const dmRoom = (partnerId: string) => `dm:${partnerId}`;
export const groupRoom = (chatId: string) => `group:${chatId}`;
export const MUTE_SETUP_HINT = '채팅방 알림 끄기를 준비 중이에요.';
export const MUTE_SETUP_ADMIN = '채팅방 알림 끄기를 쓰려면 Supabase 에서 supabase/chat-settings.sql 을 실행해 주세요.';

type State = { rooms: ReadonlySet<string>; missing: boolean };
let state: State = { rooms: new Set(), missing: false };
let owner: string | null = null;
const subs = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; subs.forEach(f => f()); };
const cacheKey = (userId: string) => `chatMutes:${userId}`;
const isMissing = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205', 'PGRST204', '42703'].includes(e.code || '');

function saveCache() {
  if (!owner) return;
  try { localStorage.setItem(cacheKey(owner), JSON.stringify(Array.from(state.rooms))); } catch { /* 저장 못 함 */ }
}

/** 로그인한 교우의 끈 방 목록 불러오기 (먼저 이 기기에 기억해 둔 것으로 바로 보여 주고 서버 것으로 맞춤) */
export async function loadChatMutes(userId: string) {
  if (owner !== userId) {
    owner = userId;
    let cached: string[] = [];
    try { cached = JSON.parse(localStorage.getItem(cacheKey(userId)) || '[]'); } catch { /* 없음 */ }
    set({ rooms: new Set(Array.isArray(cached) ? cached : []), missing: false });
  }
  const { data, error } = await supabase.from('chat_mutes').select('room').eq('user_id', userId).limit(1000);
  if (owner !== userId) return;
  if (error) { if (isMissing(error)) set({ missing: true, rooms: new Set() }); return; }
  set({ rooms: new Set((data || []).map(r => r.room as string)), missing: false });
  saveCache();
}

export function clearChatMutes() { owner = null; set({ rooms: new Set(), missing: false }); }

export const isRoomMuted = (room: string) => state.rooms.has(room);

/** 알림 끄기·켜기 → 'ok' | 'missing'(SQL 전) | 'error' */
export async function setRoomMuted(room: string, muted: boolean): Promise<'ok' | 'missing' | 'error'> {
  const userId = owner;
  if (!userId) return 'error';
  const before = state.rooms;
  const next = new Set(before);
  if (muted) next.add(room); else next.delete(room);
  set({ rooms: next });
  const { error } = muted
    ? await supabase.from('chat_mutes').upsert({ user_id: userId, room }, { onConflict: 'user_id,room', ignoreDuplicates: true })
    : await supabase.from('chat_mutes').delete().eq('user_id', userId).eq('room', room);
  if (error) {
    set({ rooms: before, ...(isMissing(error) ? { missing: true } : {}) });
    return isMissing(error) ? 'missing' : 'error';
  }
  saveCache();
  return 'ok';
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => state;
const empty: State = { rooms: new Set(), missing: false };

/** 화면에서 쓰기: { rooms, missing } — 바뀌면 다시 그림 */
export function useChatMutes(): State {
  return useSyncExternalStore(subscribe, snap, () => empty);
}
