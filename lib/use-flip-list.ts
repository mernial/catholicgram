'use client';

import { useLayoutEffect, useRef } from 'react';

// 목록에서 한 줄이 지워지면 그 아래 줄들이 순간이동하지 않고 스르륵 올라오게 한다 (알림창).
// 줄마다 data-flip-key 를 붙여 두면, 화면이 바뀔 때 예전 자리에서 새 자리로 미끄러지듯 옮긴다.
export function useFlipList<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || !active) { prev.current.clear(); return; }
    const next = new Map<string, number>();
    for (const child of Array.from(list.children) as HTMLElement[]) {
      const key = child.dataset.flipKey;
      if (!key) continue;
      const top = child.offsetTop;
      next.set(key, top);
      const old = prev.current.get(key);
      if (old === undefined || old === top) continue;
      child.style.transition = 'none';
      child.style.transform = `translateY(${old - top}px)`;
      void child.offsetHeight; // 예전 자리를 먼저 그리게 한 뒤
      child.style.transition = 'transform 0.28s ease';
      child.style.transform = '';
    }
    prev.current = next;
  });
  return ref;
}
