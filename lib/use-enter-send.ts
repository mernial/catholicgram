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
const shrunk = () => {
  const h = viewH();
  const { width, height } = window.screen;
  const screenH = window.matchMedia('(orientation: landscape)').matches ? Math.min(width, height) : Math.max(width, height); // 아이폰·아이패드는 돌려도 screen 값이 그대로
  return h < (tallest.get(Math.round(window.innerWidth)) || h) - 150 || h < screenH * 0.6;
};
function softKeyboardUp() {
  noteHeight();
  return shrunk();
}

// 실제 자판으로 치는 중인지: 화면 자판 없이 입력칸에 글자를 친 적이 있으면(아이패드·휴대폰 + 블루투스·매직 키보드) 켜지고,
// 화면 자판으로 치거나 입력 중에 화면 자판이 올라오면 꺼진다. 다음에 앱을 열어도 기억 (localStorage 'realKeyboard')
const REAL_KEY = 'realKeyboard';
let realKeys = false;
const setRealKeys = (v: boolean) => {
  if (realKeys === v) return;
  realKeys = v;
  try { localStorage.setItem(REAL_KEY, v ? '1' : '0'); } catch { /* 저장 못 해도 이번엔 씀 */ }
};
const isTextInput = (el: Element | null) => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
if (typeof window !== 'undefined') {
  try { realKeys = localStorage.getItem(REAL_KEY) === '1'; } catch { /* 없으면 화면 자판으로 봄 */ }
  noteHeight();
  const onResize = () => { noteHeight(); if (realKeys && isTextInput(document.activeElement) && shrunk()) setRealKeys(false); };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('keydown', e => { if (e.isTrusted && isTextInput(e.target as Element)) setRealKeys(!softKeyboardUp()); }, true);
}
const isComputer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// 이모티콘 칸과 입력칸 (1:1·단체방·사랑방·댓글 공통)
//  - 휴대폰(화면 자판): 입력칸을 누르면 화면 자판이 그 자리를 차지하므로 이모티콘 칸을 닫고, 😊 를 누르면 입력칸에서 빠져 화면 자판을 내린다
//  - 실제 자판(아이패드+자판·컴퓨터): 이모티콘 칸을 연 채 입력칸을 눌러 계속 칠 수 있게 닫지 않고, 😊 를 눌러도 입력칸에 그대로 둔다
//    (예전엔 입력칸을 다시 누르는 순간 이모티콘 칸이 닫혀서 이모티콘 칸이 안 뜨는 것처럼 보였음)
export function closePanelOnInputFocus(close: () => void) {
  if (isComputer()) return;
  if (!realKeys) { close(); return; }
  setTimeout(() => { if (softKeyboardUp()) close(); }, 600); // 자판을 뗐는데 화면 자판이 올라오면 그때 닫음
}
export function leaveInputForPanel(input: HTMLElement | null) {
  if (isComputer()) return;
  if (!realKeys || softKeyboardUp()) input?.blur();
}

// 실제 자판(아이패드+매직 키보드·블루투스 자판·컴퓨터)으로 대화방을 보는 중: 입력칸 밖에서 엔터를 누르거나 글자를 치면
// 입력칸으로 들어가 바로 쓸 수 있게 (운영자 요청 — 예전엔 입력칸을 손으로 눌러야 했음). 화면 자판은 입력칸을 눌러야 뜨므로
// 입력칸 밖의 키 입력은 실제 자판에서만 온다. 대화방 위에 다른 창(꾹 누르기 메뉴·사진 크게 보기·프로필 카드 등)이 떠 있거나
// 단추에 초점이 있을 때의 엔터(그 단추 누르기)는 그대로 둔다
export function useTypeToInput(getInput: () => HTMLTextAreaElement | null, enabled = true) {
  const getRef = useRef(getInput);
  getRef.current = getInput;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const input = getRef.current();
      if (!input || input.disabled || input.readOnly || !input.isConnected) return;
      const active = document.activeElement as HTMLElement | null;
      if (active === input || (active && (isTextInput(active) || active.isContentEditable || active.tagName === 'SELECT'))) return;
      if (Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).some(d => !d.contains(input))) return;
      const enter = e.key === 'Enter';
      const typing = e.key.length === 1 || e.key === 'Process' || e.keyCode === 229; // 글자 (한글 조합 시작 포함)
      if (!enter && !typing) return;
      const onControl = !!active && active !== document.body && !!active.closest('button, a, [role="button"], [role="tab"]');
      if (onControl && (enter || e.key === ' ')) return;
      if (enter) e.preventDefault(); // 엔터는 입력칸으로 들어가기만 (보내거나 줄을 바꾸지 않음)
      setRealKeys(true);
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch { /* 무시 */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
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
