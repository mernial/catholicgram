'use client';

import { useEffect, useRef } from 'react';

// 채팅창: 열면 최신 글(맨 아래)에서 시작하고, 사진·프로필이 늦게 불러와져 내용이 길어져도
// 맨 아래를 보고 있던 중이면 계속 맨 아래에 붙어 있게 한다. 위로 올려 읽는 중에는 건드리지 않는다.
// resetKey 가 바뀌면(다른 대화방을 열면) 다시 맨 아래부터.
export function useStickToBottom(resetKey: unknown) {
  const listRef = useRef<HTMLDivElement>(null);     // 스크롤되는 칸
  const contentRef = useRef<HTMLDivElement>(null);  // 그 안의 내용 (높이가 바뀌는 것)
  const atBottom = useRef(true);

  useEffect(() => {
    const list = listRef.current, content = contentRef.current;
    if (!list || !content) return;
    atBottom.current = true;
    const stick = () => { if (atBottom.current) list.scrollTop = list.scrollHeight; };
    const onScroll = () => { atBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; };
    const ro = new ResizeObserver(stick);
    ro.observe(content); ro.observe(list); // 내용이 길어지거나, 키보드가 올라와 칸이 줄어들 때
    list.addEventListener('scroll', onScroll, { passive: true });
    stick();
    return () => { ro.disconnect(); list.removeEventListener('scroll', onScroll); };
  }, [resetKey]);

  // 새 글이 왔을 때: 맨 아래를 보고 있었거나 내가 보낸 글이면 부드럽게 맨 아래로
  const toBottom = (smooth = true) => {
    const list = listRef.current; if (!list) return;
    atBottom.current = true;
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  return { listRef, contentRef, atBottom, toBottom };
}
