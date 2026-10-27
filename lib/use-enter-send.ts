'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// 채팅 입력칸(1:1 메시지·단체 채팅방·사랑방)의 엔터
//  - 휴대폰·태블릿(화면 자판): 엔터 = 줄바꿈, 보내기 단추를 눌러야 전송
//  - 컴퓨터(마우스·실제 자판): 엔터 = 보내기, 쉬프트+엔터 = 줄바꿈
// 한글 조합 중인 엔터는 글자 완성이므로 건너뛰고, 조합 중 엔터로 들어오려는 줄바꿈은 막고 보낸다.
// send 에는 방금 완성된 글자까지 포함한 입력칸 내용을 넘긴다 (화면 갱신 전에 읽음). 한 번 엔터에 두 번 불릴 수 있으니 send 쪽에서 걸러야 함.
// value 를 넘기면 입력칸이 글에 맞춰 늘어난다 (최대 높이는 입력칸의 max-h 로).
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

  // 한글 조합 중에 엔터를 누르면 keydown 없이 줄바꿈이 들어오려 함 → 그 줄바꿈을 막고 보낸다 (컴퓨터만)
  const onBeforeInput = useCallback((ev: Event) => {
    const ie = ev as InputEvent;
    if (!enterRef.current || shiftRef.current) return;
    if (ie.inputType !== 'insertLineBreak' && ie.inputType !== 'insertParagraph') return;
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
    if (e.key !== 'Enter' || e.shiftKey || !enterRef.current) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const typed = e.currentTarget.value;
    setTimeout(() => sendRef.current(typed), 0);
  };
  return { ref, onKeyDown, enterKeyHint: (enterSends ? 'send' : 'enter') as 'send' | 'enter' };
}
