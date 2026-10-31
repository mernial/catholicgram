'use client';
// 지금 보고 있는 대화방 알리기 (supabase/chat-presence.sql): 대화하는 상대의 메시지는 휴대폰 알림·배너를 보내지 않게 (운영자 요청)
// 대화방이 화면에 보이는 동안 8초마다 '이 방을 보는 중'을 서버 시계로 적고, 방을 나가거나 앱이 뒤로 가면 지운다.
// 서버(/api/push/notify)는 20초 안에 그 방을 보고 있었던 교우에게는 그 방의 알림을 어느 기기로도 보내지 않는다.
// SQL 전이면 아무 일도 하지 않음(예전처럼 이 기기 안에서만 막음: 서비스 워커가 앱에 '보고 있나요?' 물어봄)
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const BEAT_MS = 8000;
let missing = false; // 함수가 없으면(SQL 전) 이번 실행 동안은 다시 부르지 않음

export const presenceRoom = {
  dm: (partnerId: string) => `dm:${partnerId}`,
  group: (chatId: string) => `group:${chatId}`,
  lounge: 'lounge',
};

export function useChatPresence(userId: string | null | undefined, room: string | null) {
  useEffect(() => {
    if (!userId || !room || missing) return;
    let token = '';
    let active = false; // 서버에 '보는 중'이 적혀 있을 수 있음
    let stopped = false;
    const touch = async () => {
      if (missing || document.visibilityState !== 'visible') return;
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || token;
      const { error } = await supabase.rpc('touch_chat_presence', { p_room: room });
      if (error && (error.code === 'PGRST202' || error.code === '42883' || /touch_chat_presence/.test(error.message || ''))) missing = true;
      else if (!error) { active = true; if (stopped || document.visibilityState !== 'visible') leave(); } // 그사이 방을 나갔으면 바로 지움
    };
    // 지우기: 앱이 뒤로 가는 순간에도 끝까지 가도록 keepalive (못 지워도 서버는 20초 지난 것은 안 봄)
    const leave = () => {
      if (!active || !token) return;
      active = false;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      fetch(`${url}/rest/v1/rpc/leave_chat_presence`, {
        method: 'POST', keepalive: true,
        headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_room: room }),
      }).catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === 'visible') touch(); else leave(); };
    touch();
    const timer = setInterval(touch, BEAT_MS);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', leave);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [userId, room]);
}
