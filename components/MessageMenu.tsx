'use client';

import { SWIPE_REPLY } from '@/lib/use-press-gestures';

// 메시지·댓글을 꾹 누르면 그 자리에 뜨는 메뉴: 바로 위에 감정 표시 줄, 바로 아래에 할 일(답장·고치기·삭제 …)
// 위에 자리가 없으면 둘 다 아래로, 아래에 자리가 없으면 메뉴를 위로. 내 것은 오른쪽, 남의 것은 왼쪽에 맞춘다.
// 꾹 눌러 고르는 감정 (1:1 메시지·단체 채팅방·댓글 같은 줄). 하트가 기본(두 번 누르기)
export const REACTION_EMOJIS = ['❤️', '👍', '😊', '😂', '😮', '😢', '🙏'] as const;

export interface MenuAnchor { top: number; bottom: number; left: number; right: number }
export interface MenuAction { label: string; run: () => void; danger?: boolean }

export const anchorOf = (el: Element | null | undefined): MenuAnchor | null => {
  const r = el?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
};

export default function MessageMenu({ anchor, alignRight, emojis, selected = [], onEmoji, actions, onClose, label = '메시지 메뉴' }: {
  anchor: MenuAnchor | null;
  alignRight: boolean;
  emojis?: readonly string[];
  selected?: string[];          // 내가 이미 고른 감정 (다시 누르면 취소)
  onEmoji?: (emoji: string) => void;
  actions: MenuAction[];
  onClose: () => void;
  label?: string;
}) {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 8, edge = 12;
  const a = anchor || { top: vh / 2 - 24, bottom: vh / 2 + 24, left: edge, right: vw - edge };
  const showBar = !!emojis?.length && !!onEmoji;
  const barW = Math.min(vw - edge * 2, (emojis?.length || 0) * 44 + 16), barH = showBar ? 56 : 0;
  const menuW = Math.min(vw - edge * 2, 220), menuH = actions.length * 53;
  const fitX = (w: number) => Math.max(edge, Math.min(vw - w - edge, alignRight ? a.right - w : a.left));
  let barTop = a.top - barH - gap;
  let menuTop = a.bottom + gap;
  if (showBar && barTop < edge) { barTop = Math.min(a.bottom + gap, vh - barH - menuH - gap - edge); menuTop = barTop + barH + gap; }
  else if (menuTop + menuH > vh - edge) menuTop = Math.max(edge, (showBar ? barTop : a.top) - menuH - gap);
  return (
    <div className="fixed inset-0 z-[95]" onClick={onClose} role="dialog" aria-label={label}>
      <div className="absolute inset-0 bg-black/25" />
      {anchor && <div aria-hidden="true" className="absolute rounded-2xl ring-4 ring-white/90 pointer-events-none" style={{ top: a.top, left: a.left, width: a.right - a.left, height: a.bottom - a.top }} />}
      {showBar && (
        <div role="group" aria-label="감정 표시" onClick={e => e.stopPropagation()}
          className="absolute flex items-center justify-between bg-white rounded-full shadow-xl px-2 py-1.5"
          style={{ top: barTop, left: fitX(barW), width: barW }}>
          {emojis!.map(e => {
            const on = selected.includes(e);
            return (
              <button key={e} onClick={() => { onClose(); onEmoji!(e); }} aria-pressed={on} aria-label={`${e} 표시${on ? ' 취소' : ''}`}
                className={`w-10 h-10 rounded-full text-[1.5rem] leading-none flex items-center justify-center active:scale-110 ${on ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}>{e}</button>
            );
          })}
        </div>
      )}
      {actions.length > 0 && (
        <div onClick={e => e.stopPropagation()} className="absolute bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col divide-y divide-stone-100"
          style={{ top: menuTop, left: fitX(menuW), width: menuW }}>
          {actions.map(act => (
            <button key={act.label} onClick={act.run} className={`w-full px-4 py-3.5 text-left text-[1rem] font-bold active:bg-stone-50 ${act.danger ? 'text-red-600' : 'text-stone-800'}`}>{act.label}</button>
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
