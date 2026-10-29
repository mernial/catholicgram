'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// 입력 중 표시 (1:1 메시지·단체 채팅방·사랑방): 글을 치는 동안 2초마다 '치는 중'을 알리고(Supabase 실시간 방송, 저장 안 함),
// 받는 쪽은 마지막 알림 뒤 4초가 지나면 지운다. 보내면 바로 '그만'을 알린다.
export interface Typer { id: string; name: string; avatar: string | null }

export function useTyping(room: string | null, userId: string | null | undefined, enabled = true) {
  const [typers, setTypers] = useState<Typer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meRef = useRef<{ name: string; avatar: string | null } | null>(null);
  const lastSent = useRef(0);
  const until = useRef<Map<string, number>>(new Map());

  // 내 이름·사진 (받는 쪽에 함께 보낸다)
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('baptismal_name, avatar_url').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (data) meRef.current = { name: data.baptismal_name || '교우', avatar: data.avatar_url || null }; });
  }, [userId]);

  useEffect(() => {
    if (!room || !userId) return;
    const people = new Map<string, Typer>();
    const sync = () => {
      const now = Date.now();
      until.current.forEach((t, id) => { if (t < now) { until.current.delete(id); people.delete(id); } });
      // 1초마다 확인하지만 누가 치는지 바뀌었을 때만 다시 그린다 (예전엔 1초마다 화면 전체를 다시 그려 아이폰 한글 자판이 조합 중이던 글자를 잃기도 함)
      setTypers(prev => {
        const next = Array.from(people.values());
        return prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.name === next[i].name && t.avatar === next[i].avatar) ? prev : next;
      });
    };
    const channel = supabase.channel(`typing:${room}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { id?: string; name?: string; avatar?: string | null; stop?: boolean };
        if (!p?.id || p.id === userId) return;
        if (p.stop) { until.current.delete(p.id); people.delete(p.id); }
        else { people.set(p.id, { id: p.id, name: p.name || '교우', avatar: p.avatar || null }); until.current.set(p.id, Date.now() + 4500); }
        sync();
      })
      .subscribe();
    channelRef.current = channel;
    const t = setInterval(sync, 1000);
    return () => { clearInterval(t); supabase.removeChannel(channel); channelRef.current = null; setTypers([]); until.current.clear(); };
  }, [room, userId]);

  // 입력칸이 바뀔 때 부른다 (2초에 한 번만 알림). 글을 다 지우면 '그만'
  const notify = (text: string) => {
    const ch = channelRef.current;
    if (!ch || !userId || !enabled) return;
    if (!text.trim()) { stop(); return; }
    const now = Date.now();
    if (now - lastSent.current < 2000) return;
    lastSent.current = now;
    ch.send({ type: 'broadcast', event: 'typing', payload: { id: userId, name: meRef.current?.name, avatar: meRef.current?.avatar } }).catch(() => {});
  };
  const stop = () => {
    const ch = channelRef.current;
    if (!ch || !userId || !lastSent.current) return;
    lastSent.current = 0;
    ch.send({ type: 'broadcast', event: 'typing', payload: { id: userId, stop: true } }).catch(() => {});
  };
  return { typers, notify, stop };
}
