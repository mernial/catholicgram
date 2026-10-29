'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { STICKER_PACKS, STICKERS, canUseSticker, onStickerAccess, stripStickerWords, suggestStickers, usablePacks, type Sticker } from '@/lib/stickers';
import { toast } from '@/lib/chat-actions';

// 이모티콘 보내기 (1:1 메시지·단체 채팅방·사랑방 공통)
//  - 입력칸 옆 😊 → 입력칸 아래 이모티콘 칸 (★ 즐겨찾기 + 캐릭터별 탭, 탭 순서는 꾹 눌러 끌거나 '순서' 단추로)
//  - 글을 치면 입력칸 위에 비슷한 뜻의 이모티콘 추천 (카카오톡처럼 대화 위에 떠 있어 대화창이 줄어들지 않음)
//  - 이모티콘을 고르면 그 위에 크게 미리 보기 → 보내기 단추(또는 같은 이모티콘을 한 번 더)로 전송.
//    추천에서 고르면 그 뜻과 이어진 말은 입력칸에서 지우고, 남은 글은 보내기 때 이모티콘 다음에 함께 보냄
export function useStickerPicker(send: (s: Sticker) => void | Promise<void>) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Sticker | null>(null);
  const sendPicked = async () => { const s = picked; setPicked(null); if (s) await send(s); };
  const pick = (s: Sticker) => { if (picked?.id === s.id) sendPicked(); else setPicked(s); };
  return { open, setOpen, picked, setPicked, pick, sendPicked, close: () => { setOpen(false); setPicked(null); } };
}
export type StickerPicker = ReturnType<typeof useStickerPicker>;

// 이모티콘 칸(또는 고른 이모티콘 미리 보기)이 떠 있을 때 대화 칸을 톡 누르면 닫는다 (카카오톡처럼) — 고른 이모티콘도 취소.
// 밀어서 대화를 올려 보거나 꾹 누르는 것은 그대로 두고, 닫으려고 누른 그 한 번은 말풍선·사진에 전하지 않는다.
// 대화 목록 칸에 {...useCloseStickersOnTap(picker)} 로 붙인다 (1:1·단체방·사랑방)
export function useCloseStickersOnTap(picker: StickerPicker) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const swallowClick = useRef(false);
  const active = picker.open || !!picker.picked;
  return {
    onPointerDownCapture: (e: React.PointerEvent) => { start.current = active ? { x: e.clientX, y: e.clientY, at: Date.now() } : null; },
    onPointerUpCapture: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10 || Date.now() - s.at > 400) return;
      picker.close();
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 500);
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}

// 쓸 수 있는 이모티콘이 바뀌면(로그인·관리자·선물) 다시 그림
export function useStickerAccess() {
  const [, setTick] = useState(0);
  useEffect(() => onStickerAccess(() => setTick(t => t + 1)), []);
  return usablePacks();
}

// 즐겨찾기 이모티콘: 이 휴대폰에만 저장 (localStorage 'stickerFavorites', 최근에 넣은 것이 앞).
// 이모티콘 칸의 이모티콘을 꾹 누르거나, 고른 이모티콘 미리 보기의 ☆ 를 누르면 넣고 빼기. 여러 칸(메시지·댓글 등)이 함께 바뀜
const FAV_KEY = 'stickerFavorites';
const FAV_EVENT = 'sticker-favorites';
const readFavs = (): string[] => {
  try { const v: unknown = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
};
export function useStickerFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const load = () => setIds(readFavs());
    load();
    window.addEventListener(FAV_EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(FAV_EVENT, load); window.removeEventListener('storage', load); };
  }, []);
  const toggle = (s: Sticker) => {
    const cur = readFavs();
    const on = cur.includes(s.id);
    const next = on ? cur.filter(x => x !== s.id) : [s.id, ...cur].slice(0, 96);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* 저장 불가 */ }
    window.dispatchEvent(new Event(FAV_EVENT));
    try { navigator.vibrate?.(15); } catch { /* 무시 */ }
    toast(on ? '즐겨찾기에서 뺐어요' : '⭐ 즐겨찾기에 넣었어요');
  };
  useStickerAccess();
  const list = ids.map(id => STICKERS.find(s => s.id === id)).filter((s): s is Sticker => !!s && canUseSticker(s)); // 선물이 거둬진 전용 이모티콘은 빼고
  return { has: (s: Sticker) => ids.includes(s.id), list, toggle };
}

// 입력칸 위 단추를 눌러도 입력칸 초점을 뺏지 않게 → 자판이 내려가지 않음
const keepFocus = { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

// 입력칸 옆 😊 단추 (누르면 이모티콘 칸이 열리고 닫힘). 눌러도 입력칸 초점을 뺏지 않음 — 화면 자판을 내릴지는 onClick 이 정함
// (실제 자판이면 입력칸에 그대로 두어 이모티콘 칸을 연 채 계속 칠 수 있게, lib/use-enter-send leaveInputForPanel)
export function StickerButton({ open, onClick, disabled, className = 'w-10 h-10' }: { open: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" {...keepFocus} onClick={onClick} disabled={disabled} aria-pressed={open} aria-label={open ? '이모티콘 닫기' : '이모티콘 보내기'}
      className={`${className} shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 ${open ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
      <Icon name="smiley" className="w-[1.375rem] h-[1.375rem]" />
    </button>
  );
}

// 입력칸 위에 떠 있는 칸 (대화 위에 겹쳐 보임): 고른 이모티콘 미리 보기 + 친 글에 맞는 추천 줄.
// 높이 0인 relative 칸 안에 두면 그 바로 위에 뜬다. onTextChange 를 주면 낱말 하나에서 뜬 추천을 고를 때 그 낱말을 지움
// 자판이 올라와 위쪽 자리가 모자라면(글씨를 크게 한 휴대폰도) 미리 보기가 대화 칸 위로 넘어가 잘리지 않게
// 자리에 맞춰 줄인다: 그림을 줄이고 → 추천 줄을 잠시 숨기고 → 안내 글을 빼고 → 그림을 더 줄임
type Fit = { img: number | null; strip: boolean; caption: boolean };
const FULL_FIT: Fit = { img: null, strip: true, caption: true };
const MIN_IMG = 48;
// 이 칸이 덮어도 되는 높이: 바로 위의 늘어나는 칸(대화·댓글 목록)의 꼭대기까지
function roomAbove(anchor: HTMLElement) {
  const bottom = anchor.getBoundingClientRect().top;
  for (let el = anchor.previousElementSibling; el; el = el.previousElementSibling) {
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' || cs.position === 'fixed') continue;
    if (parseFloat(cs.flexGrow) > 0 || cs.overflowY === 'auto' || cs.overflowY === 'scroll') return bottom - el.getBoundingClientRect().top;
  }
  const parent = anchor.parentElement;
  return bottom - (parent ? parent.getBoundingClientRect().top : 0);
}
export function StickerAbove({ picker, text, onTextChange, sendLabel = '보내기' }: { picker: StickerPicker; text: string; onTextChange?: (t: string) => void; sendLabel?: string }) {
  const { picked } = picker;
  const favs = useStickerFavorites();
  const pickSuggested = (s: Sticker) => {
    // 낱말 하나만 쳐서 뜬 추천이면(예: '축하해요', '좋은 아침') 그 글을 지우고 이모티콘만, 문장을 쓰는 중이면 글은 그대로
    if (picked?.id !== s.id && onTextChange && text.trim() && !stripStickerWords(text, s)) onTextChange('');
    picker.pick(s);
  };
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState<Fit>(FULL_FIT);
  const [tick, setTick] = useState(0); // 화면 높이가 바뀌면(자판이 오르내리면) 처음부터 다시 맞춤
  useEffect(() => {
    const on = () => setTick(t => t + 1);
    const vv = window.visualViewport;
    window.addEventListener('resize', on); vv?.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); vv?.removeEventListener('resize', on); };
  }, []);
  const fitKey = `${picked?.id || ''}|${tick}|${suggestStickers(text, 1).length > 0}|${text.split('\n').length}`;
  const fitKeyRef = useRef(fitKey);
  const fitSteps = useRef(0); // 한 번 맞출 때 몇 단계까지만 (소수점 픽셀 등으로 끝없이 다시 그리지 않게)
  useLayoutEffect(() => {
    if (fitKeyRef.current !== fitKey) { fitKeyRef.current = fitKey; fitSteps.current = 0; if (fit !== FULL_FIT) { setFit(FULL_FIT); return; } }
    const box = boxRef.current, anchor = box?.parentElement;
    if (!picked || !box || !anchor || fitSteps.current >= 6) return;
    const over = Math.ceil(box.offsetHeight + 4 - roomAbove(anchor));
    if (over <= 1) return;
    const cur = imgRef.current?.offsetHeight || 0;
    const next: Fit = cur - over >= 96 ? { ...fit, img: Math.floor(cur - over) }
      : fit.strip && box.querySelector('[data-sticker-suggest]') ? { ...fit, strip: false }
      : fit.caption ? { ...fit, caption: false }
      : cur > MIN_IMG ? { ...fit, img: Math.max(MIN_IMG, Math.floor(cur - over)) }
      : fit;
    if (next.img === fit.img && next.strip === fit.strip && next.caption === fit.caption) return; // 더 줄일 것이 없음
    fitSteps.current += 1;
    setFit(next);
  });
  const imgStyle = fit.img ? { width: fit.img, height: fit.img } : undefined;
  return (
    <div ref={boxRef} className="absolute left-0 right-0 bottom-0 z-20 px-3 pb-2 flex flex-col items-center gap-2 pointer-events-none">
      {picked && (
        <div className="pointer-events-auto relative rounded-3xl bg-black/65 backdrop-blur-sm p-3 pt-2.5 shadow-xl animate-fade-in" role="region" aria-label="고른 이모티콘">
          <button type="button" {...keepFocus} onClick={picker.sendPicked} aria-label={`${picked.packName} ${picked.label} 보내기`} className="block">
            <img ref={imgRef} src={picked.src} alt="" draggable={false} className="w-28 h-28 object-contain" style={imgStyle} />
          </button>
          {fit.caption && <p className="mt-1 text-center text-[0.75rem] text-white/85">{sendLabel === '보내기' ? '보내기 단추를 누르면 보내져요' : `${sendLabel}를 누르면 올라가요`}</p>}
          <button type="button" {...keepFocus} onClick={() => picker.setPicked(null)} className="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-black/70 text-white text-xl leading-none flex items-center justify-center" aria-label="고른 이모티콘 취소">×</button>
          <button type="button" {...keepFocus} onClick={() => favs.toggle(picked)} aria-pressed={favs.has(picked)} aria-label={favs.has(picked) ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'}
            className="absolute -top-1 -left-1 w-9 h-9 rounded-full bg-black/70 text-amber-300 text-xl leading-none flex items-center justify-center">{favs.has(picked) ? '★' : '☆'}</button>
        </div>
      )}
      <StickerSuggest text={text} picked={picked} onPick={pickSuggested} collapsed={!!picked && !fit.strip} />
    </div>
  );
}

// 지금 치는 낱말과 비슷한 이모티콘 추천 (× 를 누르면 다른 낱말을 칠 때까지 숨김)
function StickerSuggest({ text, picked, onPick, collapsed }: { text: string; picked: Sticker | null; onPick: (s: Sticker) => void; collapsed?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const list = useMemo(() => suggestStickers(text), [text]);
  // × 로 숨겨도 새 낱말에 맞는 추천(목록이 바뀜)은 다시 보여 줌
  const listKey = list.map(s => s.id).join(',');
  useEffect(() => { setHidden(false); }, [listKey]);
  if (hidden || collapsed || list.length === 0) return null; // collapsed: 미리 보기 자리가 모자라 잠시 숨김
  return (
    <div data-sticker-suggest className="pointer-events-auto w-full flex items-center gap-1 pl-2 pr-1 py-1.5 rounded-2xl bg-white shadow-[0_4px_18px_rgba(0,0,0,0.16)] border border-stone-200" role="region" aria-label="추천 이모티콘">
      <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map(s => (
          <button key={s.id} type="button" {...keepFocus} onClick={() => onPick(s)} aria-label={`${s.packName} ${s.label}`} aria-pressed={picked?.id === s.id}
            className={`shrink-0 w-[4.25rem] h-[4.25rem] rounded-xl p-0.5 active:bg-amber-50 ${picked?.id === s.id ? 'bg-amber-100 ring-2 ring-amber-300' : ''}`}>
            <img src={s.src} alt="" draggable={false} className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
      <span className="shrink-0 w-px self-stretch my-1 bg-stone-200" aria-hidden="true" />
      <button type="button" {...keepFocus} onClick={() => setHidden(true)} className="shrink-0 w-9 h-9 rounded-full border border-stone-300 text-stone-500 text-lg leading-none flex items-center justify-center" aria-label="추천 이모티콘 숨기기">×</button>
    </div>
  );
}

// 이모티콘 한 칸: 누르면 고르기, 꾹 누르면(컴퓨터는 오른쪽 단추) 즐겨찾기에 넣기/빼기
function StickerCell({ s, active, fav, onPick, onToggleFav }: { s: Sticker; active: boolean; fav: boolean; onPick: () => void; onToggleFav: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const at = useRef({ x: 0, y: 0 });
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return (
    <button type="button" aria-label={`${s.label}${fav ? ' (즐겨찾기)' : ''}`}
      onPointerDown={e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fired.current = false; at.current = { x: e.clientX, y: e.clientY }; stop();
        timer.current = setTimeout(() => { timer.current = null; fired.current = true; onToggleFav(); }, 450);
      }}
      onPointerMove={e => { if (timer.current && Math.hypot(e.clientX - at.current.x, e.clientY - at.current.y) > 10) stop(); }}
      onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onContextMenu={e => { e.preventDefault(); if (!fired.current) { fired.current = true; stop(); onToggleFav(); } }}
      onClick={() => { if (fired.current) { fired.current = false; return; } onPick(); }}
      className={`relative aspect-square rounded-xl p-1 active:scale-95 transition-transform select-none [-webkit-touch-callout:none] ${active ? 'bg-amber-100 ring-2 ring-amber-300' : ''}`}>
      <img src={s.src} alt="" loading="lazy" draggable={false} className="w-full h-full object-contain pointer-events-none" />
      {fav && <span className="absolute top-0.5 right-1 text-amber-400 text-base leading-none drop-shadow" aria-hidden="true">★</span>}
    </button>
  );
}

// 이모티콘 칸 크기: 휴대폰은 한 줄에 다섯. 넓은 화면(아이패드·컴퓨터)은 다섯으로 나누면 한 칸이 너무 커져(아이패드 160~230px)
// 한눈에 안 보이므로 한 칸 5.25rem 안팎으로 여러 개씩, 키가 큰 화면(아이패드)은 칸 높이도 조금 높여 한 캐릭터가 거의 다 보이게
const PANEL_H = 'h-[14.5rem] [@media(min-width:640px)_and_(min-height:700px)]:h-[18.5rem]';

// 탭 순서: 이 휴대폰에만 저장 (localStorage 'stickerTabOrder'). 나중에 캐릭터가 늘면 저장된 순서 뒤에 붙는다
const FAV_TAB = 'fav';
const ALL_TABS = [FAV_TAB, ...STICKER_PACKS.map(p => p.id)]; // 전용 이모티콘까지 모두 (보이는 것은 쓸 수 있는 것만)
const ORDER_KEY = 'stickerTabOrder';
const ORDER_EVENT = 'sticker-tab-order';
const readOrder = (): string[] => {
  let saved: string[] = [];
  try { const v: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); if (Array.isArray(v)) saved = v.filter((x): x is string => typeof x === 'string' && ALL_TABS.includes(x)); } catch { /* 무시 */ }
  saved = Array.from(new Set(saved));
  return [...saved, ...ALL_TABS.filter(id => !saved.includes(id))];
};
const saveOrder = (shown: string[]) => {
  const order = [...shown, ...readOrder().filter(id => !shown.includes(id))]; // 지금 안 보이는 탭(전용 이모티콘)은 뒤에 그대로
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* 저장 불가 */ }
  window.dispatchEvent(new Event(ORDER_EVENT));
};
const moveTo = (order: string[], id: string, to: number) => {
  const next = order.filter(x => x !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
};

// 입력칸 아래 이모티콘 칸: 위에 탭(★ 즐겨찾기 + 캐릭터들, 옆으로 밀어 보기), 아래에 그 탭의 이모티콘 (마지막에 본 탭을 기억)
//  - 탭 순서 바꾸기: 탭을 꾹 누른 채 옆으로 끌기, 또는 '순서' 단추 → ▲▼
export default function StickerPanel({ picker }: { picker: StickerPicker }) {
  const favs = useStickerFavorites();
  const packs = useStickerAccess(); // 쓸 수 있는 캐릭터만 (전용 이모티콘은 관리자·선물받은 교우에게만)
  const visible = [FAV_TAB, ...packs.map(p => p.id)];
  const visibleKey = visible.join();
  const [savedPack, setPackId] = useState(() => {
    try { const saved = localStorage.getItem('stickerPack'); if (saved && ALL_TABS.includes(saved)) return saved; } catch { /* 무시 */ }
    return STICKER_PACKS[0].id;
  });
  const packId = visible.includes(savedPack) ? savedPack : STICKER_PACKS[0].id;
  const [order, setOrder] = useState<string[]>(visible);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => {
    const shown = visibleKey.split(',');
    const load = () => setOrder(readOrder().filter(id => shown.includes(id)));
    load();
    window.addEventListener(ORDER_EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(ORDER_EVENT, load); window.removeEventListener('storage', load); };
  }, [visibleKey]);
  const [arranging, setArranging] = useState(false); // '순서' 단추로 연 ▲▼ 목록
  const isFav = packId === FAV_TAB;
  const pack = STICKER_PACKS.find(p => p.id === packId) || STICKER_PACKS[0];
  const shown = isFav ? favs.list : pack.stickers;
  const choose = (id: string) => { setPackId(id); try { localStorage.setItem('stickerPack', id); } catch { /* 무시 */ } };
  // 늘 첫 줄부터: 열 때·탭을 바꿀 때·고른 이모티콘을 보낸 뒤 (마지막에 쓴 이모티콘 자리에 머물러 있지 않게)
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (gridRef.current) gridRef.current.scrollTop = 0; }, [packId]);
  const hadPicked = useRef(false);
  useEffect(() => {
    if (picker.picked) { hadPicked.current = true; return; }
    if (!hadPicked.current) return;
    hadPicked.current = false;
    gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [picker.picked]);
  // 고른 탭이 보이게 (탭이 많아 옆으로 밀려 있을 때)
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rowRef.current?.querySelector<HTMLElement>(`[data-tab="${packId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [packId]);

  // 탭 꾹 눌러 옆으로 끌기 (끄는 동안에는 탭 줄이 스크롤되지 않게)
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  dragRef.current = dragId;
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    row.addEventListener('touchmove', stop, { passive: false });
    return () => row.removeEventListener('touchmove', stop);
  }, []);
  const startDrag = (id: string) => {
    setDragId(id);
    try { navigator.vibrate?.(15); } catch { /* 무시 */ }
    const onMove = (e: PointerEvent) => {
      const row = rowRef.current;
      if (!row) return;
      const r = row.getBoundingClientRect();
      if (e.clientX < r.left + 28) row.scrollLeft -= 10; else if (e.clientX > r.right - 28) row.scrollLeft += 10; // 끝에 닿으면 밀어 줌
      const cells = Array.from(row.querySelectorAll<HTMLElement>('[data-tab]'));
      let to = cells.findIndex(c => e.clientX < c.getBoundingClientRect().left + c.offsetWidth / 2);
      if (to < 0) to = cells.length;
      const cur = orderRef.current;
      const from = cur.indexOf(id);
      if (to > from) to -= 1; // 끄는 탭이 빠진 자리만큼 당겨짐
      if (to !== from) setOrder(moveTo(cur, id, to));
    };
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      setDragId(null);
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 400);
      saveOrder(orderRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };
  const tabHandlers = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (press.current) clearTimeout(press.current.timer);
      const p = { id, x: e.clientX, y: e.clientY, timer: setTimeout(() => { press.current = null; startDrag(id); }, 400) };
      press.current = p;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { clearTimeout(p.timer); press.current = null; } // 옆으로 밀어 보는 중
    },
    onPointerUp: () => { if (press.current) { clearTimeout(press.current.timer); press.current = null; } },
    onPointerCancel: () => { if (press.current) { clearTimeout(press.current.timer); press.current = null; } },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => { if (suppressClick.current) return; choose(id); },
  });
  const move = (id: string, by: number) => { const next = moveTo(order, id, order.indexOf(id) + by); setOrder(next); saveOrder(next); };

  const tabClass = (on: boolean, dragging: boolean) => `shrink-0 w-14 flex flex-col items-center py-1 rounded-xl text-[0.75rem] font-bold transition-[background-color,transform] select-none [-webkit-touch-callout:none] ${on ? 'bg-amber-100 text-stone-900' : 'text-stone-500'} ${dragging ? 'scale-110 bg-white shadow-lg ring-2 ring-amber-300 z-10' : ''}`;
  const tabIcon = (id: string) => id === FAV_TAB
    ? <span className="w-8 h-8 flex items-center justify-center text-[1.625rem] leading-none text-amber-400" aria-hidden="true">★</span>
    : <img src={STICKER_PACKS.find(p => p.id === id)!.stickers[0].src} alt="" draggable={false} className="w-8 h-8 object-contain pointer-events-none" />;
  const tabName = (id: string) => (id === FAV_TAB ? '즐겨찾기' : STICKER_PACKS.find(p => p.id === id)!.name);

  return (
    <div data-no-sheet-drag className="shrink-0 bg-white border-t border-stone-200 pb-[env(safe-area-inset-bottom)]" role="region" aria-label="이모티콘">
      {/* 탭: 즐겨찾기 + 캐릭터들 (그림 위, 이름 아래). 꾹 눌러 옆으로 끌면 순서 바꾸기 */}
      <div className="flex items-stretch gap-1 pl-2 pr-1 pt-2 pb-1 border-b border-stone-100">
        <div ref={rowRef} className="flex-1 min-w-0 flex gap-1 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x' }} role="tablist" aria-label="이모티콘 캐릭터">
          {order.map(id => (
            <button key={id} type="button" role="tab" data-tab={id} aria-selected={id === packId} {...tabHandlers(id)} className={tabClass(id === packId, dragId === id)}>
              {tabIcon(id)}
              <span className="max-w-full truncate">{tabName(id)}</span>
            </button>
          ))}
          <button type="button" onClick={() => setArranging(a => !a)} aria-pressed={arranging} className={`shrink-0 w-11 rounded-xl text-[0.6875rem] font-bold leading-tight flex flex-col items-center justify-center gap-0.5 ${arranging ? 'bg-stone-900 text-white' : 'text-stone-500'}`} aria-label="탭 순서 바꾸기">
            <span className="text-base leading-none" aria-hidden="true">⇄</span>순서
          </button>
        </div>
        <button type="button" onClick={picker.close} className="shrink-0 w-9 rounded-xl text-stone-400 text-2xl leading-none" aria-label="이모티콘 닫기">×</button>
      </div>
      {arranging ? (
        // 탭 순서 바꾸기: ▲▼ 로 옮기기 (탭을 꾹 눌러 옆으로 끌어도 됨)
        <div className={`${PANEL_H} overflow-y-auto overscroll-contain px-3 pt-2 pb-2`} role="list" aria-label="탭 순서">
          <div className="flex items-center gap-2 pb-2">
            <p className="flex-1 text-[0.8125rem] text-stone-500 leading-snug">자주 쓰는 탭을 위로 올려 앞에 두세요<br />(탭을 꾹 눌러 옆으로 끌어도 돼요)</p>
            <button type="button" onClick={() => setArranging(false)} className="shrink-0 px-4 py-2 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold">완료</button>
          </div>
          {order.map((id, i) => (
            <div key={id} role="listitem" className="flex items-center gap-3 py-1.5 border-t border-stone-100">
              <span className="w-6 text-center text-[0.875rem] font-bold text-stone-400">{i + 1}</span>
              {tabIcon(id)}
              <span className="flex-1 min-w-0 truncate text-[1rem] font-bold text-stone-800">{tabName(id)}</span>
              <button type="button" onClick={() => move(id, -1)} disabled={i === 0} className="w-11 h-11 rounded-xl border border-stone-200 text-lg text-stone-700 disabled:opacity-30" aria-label={`${tabName(id)} 앞으로`}>▲</button>
              <button type="button" onClick={() => move(id, 1)} disabled={i === order.length - 1} className="w-11 h-11 rounded-xl border border-stone-200 text-lg text-stone-700 disabled:opacity-30" aria-label={`${tabName(id)} 뒤로`}>▼</button>
            </div>
          ))}
        </div>
      ) : (
        <div ref={gridRef} className={`${PANEL_H} overflow-y-auto overscroll-contain grid grid-cols-5 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-0.5 px-2 pt-1 pb-2 content-start`} role="tabpanel" aria-label={isFav ? '즐겨찾기 이모티콘' : `${pack.name} 이모티콘`}>
          {isFav && (
            <p className={`col-span-full text-center text-stone-500 leading-relaxed ${shown.length ? 'text-[0.75rem] py-1' : 'text-[0.9375rem] py-8'}`}>
              {shown.length ? '꾹 누르면 즐겨찾기에서 빠져요' : <>자주 쓰는 이모티콘을 <b className="text-stone-700">꾹 누르면</b><br />⭐ 여기에 모여요</>}
            </p>
          )}
          {shown.map(s => (
            <StickerCell key={s.id} s={s} active={picker.picked?.id === s.id} fav={!isFav && favs.has(s)} onPick={() => picker.pick(s)} onToggleFav={() => favs.toggle(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

// 게시글·댓글에 붙은 이모티콘 줄 (글쓰기·고치기에서는 × 로 빼기)
export function PostStickers({ stickers, size = 'w-28 h-28', onRemove }: { stickers: Sticker[]; size?: string; onRemove?: (index: number) => void }) {
  if (stickers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="이모티콘">
      {stickers.map((s, i) => (
        <span key={`${s.id}-${i}`} className="relative">
          <img src={s.src} alt={`이모티콘: ${s.label}`} draggable={false} className={`${size} object-contain select-none pointer-events-none`} />
          {onRemove && <button type="button" onClick={() => onRemove(i)} className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-black/60 text-white text-base leading-none flex items-center justify-center" aria-label={`${s.label} 이모티콘 빼기`}>×</button>}
        </span>
      ))}
    </div>
  );
}

// 말풍선 대신 보이는 이모티콘 그림 (누르기·꾹 누르기는 감싼 말풍선이 받는다)
// 대화 속 이모티콘 크기 (휴대폰 144px, 넓은 화면 160px — 운영자: 예전 128px 보다 조금 크게)
const CHAT_STICKER = 'w-36 h-36 sm:w-40 sm:h-40';
export function StickerImage({ sticker, size = CHAT_STICKER }: { sticker: Sticker; size?: string }) {
  return <img src={sticker.src} alt={`이모티콘: ${sticker.label}`} draggable={false} className={`block ${size} object-contain pointer-events-none select-none`} />;
}
// 글과 함께 보낸 이모티콘 (lib/stickers chatStickerParts): 한 메시지라 숫자 1·시간은 하나, 그림은 이모티콘만 보낼 때처럼
// 말풍선 없이(위) + 글은 자기 말풍선(아래, bubble = 그 대화의 말풍선 모양) — 카카오톡처럼 붙어서 보임
export function StickerWithText({ parts, bubble, children }: { parts: { text: string; sticker: Sticker }; bubble: string; children?: React.ReactNode }) {
  return <><StickerImage sticker={parts.sticker} size={`${CHAT_STICKER} mb-1`} /><div className={bubble}>{children ?? parts.text}</div></>;
}
