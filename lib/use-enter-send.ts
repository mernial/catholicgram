'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// 채팅 입력칸(1:1 메시지·단체 채팅방·사랑방·댓글)의 엔터
//  - 휴대폰·태블릿(화면 자판): 엔터 = 줄바꿈, 보내기 단추를 눌러야 전송
//  - 컴퓨터(마우스·실제 자판): 엔터 = 보내기, 쉬프트+엔터 = 줄바꿈
//  - 아이패드·휴대폰에 실제 자판(매직 키보드·블루투스 자판)을 붙여 쓰면 컴퓨터처럼 엔터 = 보내기
//    (자판이 붙었는지는 브라우저가 알려 주지 않으므로, 엔터를 누른 순간 화면 자판이 떠 있지 않으면 실제 자판으로 본다)
// 한글 조합 중인 엔터는 글자 완성이므로 건너뛰고, 조합 중 엔터로 들어오려는 줄바꿈은 막고 보낸다.
// send 에는 방금 완성된 글자까지 포함한 입력칸 내용을 넘긴다 (화면 갱신 전에 읽음). 한 번 엔터에 두 번 불릴 수 있으니 send 쪽에서 걸러야 함.
// value 를 넘기면 입력칸이 글에 맞춰 늘어난다 (최대 높이는 입력칸의 max-h 로).
// 화면 자판이 떠 있는지: 보이는 화면 높이가 자판 없이 본 가장 큰 높이(같은 너비)보다 150px 넘게 줄었거나
// 화면 높이의 60%보다 낮으면 떠 있다. 실제 자판을 붙이면 화면 자판이 안 뜨고(아이패드는 작은 단축 막대만) 높이가 그대로.
// 모르면(화면을 나눠 쓰는 등) 떠 있다고 봐서 예전처럼 줄바꿈
const tallest = new Map<number, number>(); // 화면 너비별로 본 가장 큰 높이 (앱을 연 뒤 계속 기록)
const viewH = () => window.visualViewport?.height ?? window.innerHeight;
const noteHeight = () => {
  const w = Math.round(window.innerWidth);
  tallest.set(w, Math.max(tallest.get(w) || 0, viewH()));
};
if (typeof window !== 'undefined') {
  noteHeight();
  window.addEventListener('resize', noteHeight);
  window.visualViewport?.addEventListener('resize', noteHeight);
}
function softKeyboardUp() {
  noteHeight();
  const h = viewH();
  const { width, height } = window.screen;
  const screenH = window.matchMedia('(orientation: landscape)').matches ? Math.min(width, height) : Math.max(width, height); // 아이폰·아이패드는 돌려도 screen 값이 그대로
  return h < (tallest.get(Math.round(window.innerWidth)) || h) - 150 || h < screenH * 0.6;
}

export function useEnterSend(send: (typed: string) => void, value?: string) {
  const [enterSends, setEnterSends] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setEnterSends(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const sendRef = useRef(send);
  sendRef.current = send;
  const enterRef = useRef(enterSends);
  enterRef.current = enterSends;
  const shiftRef = useRef(false);
  const sends = () => enterRef.current || !softKeyboardUp(); // 컴퓨터이거나, 화면 자판 없이 친 엔터(실제 자판)

  // 한글 조합 중에 엔터를 누르면 keydown 없이 줄바꿈이 들어오려 함 → 그 줄바꿈을 막고 보낸다 (컴퓨터·실제 자판만)
  const onBeforeInput = useCallback((ev: Event) => {
    const ie = ev as InputEvent;
    if (shiftRef.current) return;
    if (ie.inputType !== 'insertLineBreak' && ie.inputType !== 'insertParagraph') return;
    if (!sends()) return;
    ev.preventDefault();
    const typed = (ev.target as HTMLTextAreaElement).value;
    setTimeout(() => sendRef.current(typed), 0);
  }, []);
  const attached = useRef<HTMLTextAreaElement | null>(null);
  const grows = value !== undefined;
  const fit = useCallback((ta: HTMLTextAreaElement | null) => {
    if (!ta || !grows) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + ta.offsetHeight - ta.clientHeight}px`;
  }, [grows]);
  const ref = useCallback((el: HTMLTextAreaElement | null) => {
    attached.current?.removeEventListener('beforeinput', onBeforeInput);
    attached.current = el;
    el?.addEventListener('beforeinput', onBeforeInput);
    fit(el);
  }, [onBeforeInput, fit]);
  useLayoutEffect(() => { fit(attached.current); }, [value, fit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') shiftRef.current = e.shiftKey;
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (!sends()) return;
    e.preventDefault();
    const typed = e.currentTarget.value;
    setTimeout(() => sendRef.current(typed), 0);
  };
  return { ref, onKeyDown, enterKeyHint: (enterSends ? 'send' : 'enter') as 'send' | 'enter' };
}
