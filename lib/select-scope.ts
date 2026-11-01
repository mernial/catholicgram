'use client';

// '모두 선택'을 그 글 안으로 (루비로사 건의 2026-11-01: '모두 선택 기능은 보통 그 글묶음을 복사하려고 쓰는데,
// 화면 전체가 골라져서 묵상글만 복사하기가 어려웠어요'): 글을 꾹 눌러 고르기 시작한 칸(data-select-scope)이 있으면,
// 휴대폰의 '모두 선택'처럼 고른 곳이 그 칸 밖으로 넘어가는 순간 그 칸의 글만 고른다.
// 접혀 있던 글('… 더 보기')이면 먼저 펼친 뒤 펼친 글 전체를 고른다 (ClampText 가 registerExpander 로 펼치기를 맡겨 둠).
import { useEffect } from 'react';

const expanders = new Map<string, () => void>();
export function registerExpander(key: string, fn: () => void) {
  expanders.set(key, fn);
  return () => { if (expanders.get(key) === fn) expanders.delete(key); };
}

const scopeOf = (n: Node | null): HTMLElement | null =>
  ((n && (n.nodeType === 1 ? (n as Element) : n.parentElement))?.closest?.('[data-select-scope]') as HTMLElement | null) ?? null;

export function useSelectScope() {
  useEffect(() => {
    let scope: HTMLElement | null = null;
    let busy = false;
    const onChange = () => {
      if (busy) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { scope = null; return; }
      const a = scopeOf(sel.anchorNode), f = scopeOf(sel.focusNode);
      if (a && a === f) { scope = a; return; } // 아직 그 글 안
      if (!scope || !scope.isConnected) return;
      if (!sel.getRangeAt(0).intersectsNode(scope)) { scope = null; return; }
      const key = scope.dataset.selectKey;
      const expand = key && scope.dataset.folded ? expanders.get(key) : undefined;
      if (expand) {
        busy = true;
        expand();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          busy = false;
          const el = document.querySelector<HTMLElement>(`[data-select-key="${CSS.escape(key!)}"]`);
          if (el) { scope = el; document.getSelection()?.selectAllChildren(el); }
        }));
        return;
      }
      sel.selectAllChildren(scope);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);
}
