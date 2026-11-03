'use client';

// '모두 선택'을 그 글 안으로 (루비로사 건의 2026-11-01: '모두 선택 기능은 보통 그 글묶음을 복사하려고 쓰는데,
// 화면 전체가 골라져서 묵상글만 복사하기가 어려웠어요'): 글을 꾹 눌러 고르기 시작한 칸(data-select-scope)이 있으면,
// 휴대폰의 '모두 선택'처럼 고른 곳이 그 칸 밖으로 넘어가는 순간 그 칸의 글만 고른다.
// 접혀 있던 글('… 더 보기')이면 먼저 펼친 뒤 펼친 글 전체를 고른다 (ClampText 가 registerExpander 로 펼치기를 맡겨 둠).
// 고르고 있는 글의 id(data-select-id)를 돌려준다 → page 가 그동안만 '글 복사·글만 사진으로' 막대를 띄움
// (루비로사 건의 2026-11-03: '글 복사와 글만 사진으로 버튼은 직접 글을 꾹 눌러 복사를 원할 때 보이게')
// 막대 자리(place): 휴대폰이 띄우는 복사·모두 선택 메뉴는 고른 글 바로 위(자리가 없으면 아래)에 뜨므로,
// 막대는 그 메뉴와 화면의 반대쪽에 둔다 — 메뉴가 화면 아래쪽이면 막대는 위, 위쪽이면 아래
// (운영자 2026-11-03: 크게 보기에서 글을 고르니 휴대폰 메뉴와 막대가 같은 자리에 겹쳐 '창이 이중으로 떠')
import { useEffect, useState } from 'react';

export type SelectBarPlace = 'top' | 'bottom';
export type SelectScopeState = { id: string; place: SelectBarPlace } | null;

// 휴대폰 메뉴가 뜰 높이를 짐작해 막대 자리를 정한다
function barPlace(): SelectBarPlace {
  try {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return 'bottom';
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const h = window.visualViewport?.height || window.innerHeight;
    const ROOM = 90; // 메뉴 높이 + 여백
    const menuY = r.top > ROOM ? r.top : r.bottom < h - ROOM ? r.bottom : h / 2;
    return menuY > h * 0.5 ? 'top' : 'bottom';
  } catch { return 'bottom'; }
}

const expanders = new Map<string, () => void>();
export function registerExpander(key: string, fn: () => void) {
  expanders.set(key, fn);
  return () => { if (expanders.get(key) === fn) expanders.delete(key); };
}

const scopeOf = (n: Node | null): HTMLElement | null =>
  ((n && (n.nodeType === 1 ? (n as Element) : n.parentElement))?.closest?.('[data-select-scope]') as HTMLElement | null) ?? null;

export function useSelectScope(): SelectScopeState {
  const [state, setState] = useState<SelectScopeState>(null);
  useEffect(() => {
    let current: string | null = null;
    const put = (id: string | null) => {
      current = id;
      const next: SelectScopeState = id ? { id, place: barPlace() } : null;
      setState(prev => (prev?.id === next?.id && prev?.place === next?.place ? prev : next));
    };
    let scope: HTMLElement | null = null;
    let busy = false;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    // 고르기가 풀리면 조금 뒤에 숨김 — 막대의 단추를 누르는 순간 고르기가 먼저 풀려도 그 누름은 받게
    const show = (el: HTMLElement | null) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const id = el?.dataset.selectId || null;
      if (id) put(id);
      else hideTimer = setTimeout(() => { hideTimer = null; put(null); }, 700);
    };
    // 고른 채로 화면을 올리고 내리면 휴대폰 메뉴도 따라 움직이므로 막대 자리도 다시 정함
    let raf = 0;
    const onScroll = () => {
      if (!current || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (current) put(current); });
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
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
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (hideTimer) clearTimeout(hideTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return state;
}
