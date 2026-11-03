'use client';

// '모두 선택'을 그 글 안으로 (루비로사 건의 2026-11-01: '모두 선택 기능은 보통 그 글묶음을 복사하려고 쓰는데,
// 화면 전체가 골라져서 묵상글만 복사하기가 어려웠어요'): 글을 꾹 눌러 고르기 시작한 칸(data-select-scope)이 있으면,
// 휴대폰의 '모두 선택'처럼 고른 곳이 그 칸 밖으로 넘어가는 순간 그 칸의 글만 고른다.
// 접혀 있던 글('… 더 보기')이면 먼저 펼친 뒤 펼친 글 전체를 고른다 (ClampText 가 registerExpander 로 펼치기를 맡겨 둠).
// 고르고 있는 글의 id(data-select-id)를 돌려준다 → page 가 그동안만 '글 복사·글만 사진으로' 막대를 띄움
// (루비로사 건의 2026-11-03: '글 복사와 글만 사진으로 버튼은 직접 글을 꾹 눌러 복사를 원할 때 보이게')
import { useEffect, useState } from 'react';

const expanders = new Map<string, () => void>();
export function registerExpander(key: string, fn: () => void) {
  expanders.set(key, fn);
  return () => { if (expanders.get(key) === fn) expanders.delete(key); };
}

const scopeOf = (n: Node | null): HTMLElement | null =>
  ((n && (n.nodeType === 1 ? (n as Element) : n.parentElement))?.closest?.('[data-select-scope]') as HTMLElement | null) ?? null;

export function useSelectScope(): string | null {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let scope: HTMLElement | null = null;
    let busy = false;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    // 고르기가 풀리면 조금 뒤에 숨김 — 막대의 단추를 누르는 순간 고르기가 먼저 풀려도 그 누름은 받게
    const show = (el: HTMLElement | null) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const id = el?.dataset.selectId || null;
      if (id) setSelectedId(id);
      else hideTimer = setTimeout(() => { hideTimer = null; setSelectedId(null); }, 700);
    };
    const onChange = () => {
      if (busy) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { scope = null; show(null); return; }
      const a = scopeOf(sel.anchorNode), f = scopeOf(sel.focusNode);
      if (a && a === f) { scope = a; show(a); return; } // 아직 그 글 안
      if (!scope || !scope.isConnected) { show(null); return; }
      if (!sel.getRangeAt(0).intersectsNode(scope)) { scope = null; show(null); return; }
      const key = scope.dataset.selectKey;
      const expand = key && scope.dataset.folded ? expanders.get(key) : undefined;
      if (expand) {
        busy = true;
        expand();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          busy = false;
          const el = document.querySelector<HTMLElement>(`[data-select-key="${CSS.escape(key!)}"]`);
          if (el) { scope = el; document.getSelection()?.selectAllChildren(el); show(el); }
        }));
        return;
      }
      sel.selectAllChildren(scope);
      show(scope);
    };
    document.addEventListener('selectionchange', onChange);
    return () => { document.removeEventListener('selectionchange', onChange); if (hideTimer) clearTimeout(hideTimer); };
  }, []);
  return selectedId;
}
