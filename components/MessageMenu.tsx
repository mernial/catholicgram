'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { SWIPE_REPLY } from '@/lib/use-press-gestures';

// 메시지·댓글을 꾹 누르면 그 자리에 뜨는 메뉴: 바로 위에 감정 표시 줄, 바로 아래에 할 일(답장·고치기·삭제 …)
// 자리가 없으면 둘 다 아래로 또는 둘 다 위로, 그래도 없으면(긴 말풍선) 둘을 붙여 화면 안에 — 감정 줄과 메뉴는 서로 가리지 않는다.
// 내 것은 오른쪽, 남의 것은 왼쪽에 맞춘다. 메뉴 높이는 글씨 크기에 따라 달라서 그려 본 뒤 잰다.
// 꾹 눌러 고르는 감정 (1:1 메시지·단체 채팅방·댓글 같은 줄). 하트가 기본(두 번 누르기)
export const REACTION_EMOJIS = ['❤️', '👍', '😊', '😂', '😮', '😢', '🙏'] as const;
// 감정 줄 끝의 ＋ 를 누르면 더 고를 수 있는 감정 (메시지·단체방·사랑방. 서버도 이 목록만 받음 — supabase/chat-media-menu.sql)
export const MORE_EMOJIS = ['✅', '👏', '🙌', '🥰', '😍', '😆', '🤗', '🙂', '😭', '😥', '😡', '😱', '🎉', '🌹', '🌸', '💐', '🎂', '🍀', '⛪', '✝️', '🕊️', '📿', '💪', '👌'] as const;

export interface MenuAnchor { top: number; bottom: number; left: number; right: number }
export interface MenuAction { label: string; run: () => void; danger?: boolean }

export const anchorOf = (el: Element | null | undefined): MenuAnchor | null => {
  const r = el?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
};

export default function MessageMenu({ anchor, alignRight, emojis, moreEmojis, selected = [], onEmoji, actions, onClose, label = '메시지 메뉴' }: {
  anchor: MenuAnchor | null;
  alignRight: boolean;
  emojis?: readonly string[];
  moreEmojis?: readonly string[];  // 있으면 감정 줄 끝에 ＋ (누르면 더 많은 감정)
  selected?: string[];          // 내가 이미 고른 감정 (다시 누르면 취소)
  onEmoji?: (emoji: string) => void;
  actions: MenuAction[];
  onClose: () => void;
  label?: string;
}) {
  const [more, setMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuH, setMenuH] = useState(actions.length * 49); // 그려 본 뒤 실제 높이로
  useLayoutEffect(() => { const h = menuRef.current?.scrollHeight; if (h && h !== menuH) setMenuH(h); });
  const vw = window.innerWidth, vh = window.innerHeight, gap = 8, edge = 12;
  const a = anchor || { top: vh / 2 - 24, bottom: vh / 2 + 24, left: edge, right: vw - edge };
  const showBar = !!emojis?.length && !!onEmoji;
  const plus = showBar && !!moreEmojis?.length;
  // 감정 줄은 글씨 크기와 상관없이 같은 크기 (px)
  const barW = Math.min(vw - edge * 2, ((emojis?.length || 0) + (plus ? 1 : 0)) * 44 + 16), barH = showBar ? 52 : 0;
  const menuW = Math.min(vw - edge * 2, 220);
  const fitX = (w: number) => Math.max(edge, Math.min(vw - w - edge, alignRight ? a.right - w : a.left));
  const fits = (top: number, h: number) => top >= edge && top + h <= vh - edge;
  const below = a.bottom + gap;
  let barTop = a.top - gap - barH, menuTop = below, menuMax: number | undefined;
  if (!showBar) {
    if (!fits(below, menuH)) menuTop = fits(a.top - gap - menuH, menuH) ? a.top - gap - menuH : Math.max(edge, vh - edge - menuH);
  } else if (fits(barTop, barH) && fits(below, menuH)) {
    // 감정 줄은 말풍선 위, 메뉴는 아래
  } else if (fits(below, barH + gap + menuH)) {
    barTop = below; menuTop = below + barH + gap;                       // 둘 다 아래
  } else if (fits(a.top - gap - menuH - gap - barH, barH + gap + menuH)) {
    menuTop = a.top - gap - menuH; barTop = menuTop - gap - barH;      // 둘 다 위
  } else {
    // 긴 말풍선이라 위아래 어디에도 자리가 없으면: 감정 줄 바로 아래에 메뉴를 붙여 화면 안에 (말풍선은 조금 가려도 둘은 겹치지 않게)
    const group = barH + gap + menuH;
    barTop = Math.max(edge, Math.min(vh - edge - group, barTop));
    menuTop = barTop + barH + gap;
    if (group > vh - edge * 2) menuMax = vh - edge - menuTop;
  }
  const emojiButton = (e: string, big = false) => {
    const on = selected.includes(e);
    return (
      <button key={e} onClick={() => { onClose(); onEmoji!(e); }} aria-pressed={on} aria-label={`${e} 표시${on ? ' 취소' : ''}`}
        className={`${big ? 'w-[44px] h-[44px]' : 'w-[40px] h-[40px]'} rounded-full text-[24px] leading-none flex items-center justify-center active:scale-110 ${on ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}>{e}</button>
    );
  };
  // ＋ 를 누르면: 모든 감정을 바둑판으로 (메뉴 대신)
  if (more && showBar) {
    const all = [...(emojis || []), ...(moreEmojis || [])];
    const cols = Math.min(6, Math.floor((vw - edge * 2 - 16) / 48));
    const gridW = cols * 48 + 16, gridH = Math.ceil(all.length / cols) * 48 + 56;
    const top = Math.max(edge, Math.min(vh - gridH - edge, a.top - barH - gap));
    return (
      <div className="fixed inset-0 z-[95]" onClick={onClose} role="dialog" aria-label="감정 더 고르기">
        <div className="absolute inset-0 bg-black/25" />
        <div onClick={e => e.stopPropagation()} className="absolute bg-white rounded-3xl shadow-xl p-2" style={{ top, left: Math.max(edge, Math.min(vw - gridW - edge, alignRight ? a.right - gridW : a.left)), width: gridW }}>
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[0.9375rem] font-bold text-stone-700">감정 고르기</span>
            <button onClick={() => setMore(false)} className="h-9 px-3 rounded-full text-[0.875rem] text-stone-500" aria-label="감정 고르기 닫기">‹ 돌아가기</button>
          </div>
          <div role="group" aria-label="감정 표시" className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 48px)` }}>
            {all.map(e => <span key={e} className="w-[48px] h-[48px] flex items-center justify-center">{emojiButton(e, true)}</span>)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[95]" onClick={onClose} role="dialog" aria-label={label}>
      <div className="absolute inset-0 bg-black/25" />
      {anchor && <div aria-hidden="true" className="absolute rounded-2xl ring-4 ring-white/90 pointer-events-none" style={{ top: a.top, left: a.left, width: a.right - a.left, height: a.bottom - a.top }} />}
      {showBar && (
        <div role="group" aria-label="감정 표시" onClick={e => e.stopPropagation()}
          className="absolute flex items-center justify-between bg-white rounded-full shadow-xl px-[8px] py-[6px]"
          style={{ top: barTop, left: fitX(barW), width: barW, height: barH }}>
          {emojis!.map(e => emojiButton(e))}
          {plus && (
            <button onClick={() => setMore(true)} aria-label="감정 더 보기"
              className={`w-[40px] h-[40px] rounded-full text-[24px] leading-none flex items-center justify-center bg-stone-100 text-stone-600 ${moreEmojis!.some(e => selected.includes(e)) ? 'ring-2 ring-blue-400' : ''}`}>＋</button>
          )}
        </div>
      )}
      {actions.length > 0 && (
        <div ref={menuRef} onClick={e => e.stopPropagation()} className={`absolute bg-white rounded-2xl shadow-xl flex flex-col divide-y divide-stone-100 ${menuMax ? 'overflow-y-auto' : 'overflow-hidden'}`}
          style={{ top: menuTop, left: fitX(menuW), width: menuW, maxHeight: menuMax }}>
          {actions.map(act => (
            <button key={act.label} onClick={act.run} className={`w-full px-4 py-3 text-left text-[1rem] font-bold active:bg-stone-50 ${act.danger ? 'text-red-600' : 'text-stone-800'}`}>{act.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// 미는 동안 말풍선 뒤에서 드러나는 답장 표시 (말풍선을 감싼 relative 칸 안에 둔다)
export function SwipeHint({ dx }: { dx: number }) {
  const ready = Math.abs(dx) >= SWIPE_REPLY;
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${dx > 0 ? 'left-1' : 'right-1'} w-8 h-8 rounded-full flex items-center justify-center text-base ${ready ? 'bg-blue-500 text-white' : 'bg-white text-stone-500 shadow'}`}
      style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_REPLY) }}>↩</span>
  );
}
