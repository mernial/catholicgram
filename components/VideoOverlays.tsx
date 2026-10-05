'use client';

import { useRef, useState } from 'react';

// 숏폼 영상 꾸미기: 영상 위에 글자·이모티콘을 올려 손가락으로 옮긴다.
// 영상 파일은 그대로 두고 위치 정보만 posts.video_overlays 에 저장해, 재생할 때 영상 위에 겹쳐 보여준다.
// 위치(x, y)는 화면 비율(0~1), 크기(size)는 화면 너비 대비 비율이라 어떤 휴대폰에서도 같은 자리에 보인다.

export interface OverlayItem {
  id: string;
  type: 'text' | 'emoji';
  text: string;
  x: number;
  y: number;
  size: number;
  rotation?: number; // 도(°)
  color?: string;
  bg?: boolean;
}
export interface VideoOverlays { items: OverlayItem[]; muteOriginal?: boolean }

export const hasOverlays = (o?: VideoOverlays | null) => !!o && (o.items.length > 0 || !!o.muteOriginal);

const COLORS = ['#ffffff', '#fbe7b0', '#f43f5e', '#38bdf8', '#4ade80', '#111827'];
const SIZE_RANGE = { text: [0.03, 0.3], emoji: [0.05, 0.6] } as const;
const clampSize = (type: OverlayItem['type'], size: number) => Math.min(SIZE_RANGE[type][1], Math.max(SIZE_RANGE[type][0], size));
const normAngle = (deg: number) => ((deg + 540) % 360) - 180;

const EMOJIS = ['🙏', '✝️', '⛪', '🕊️', '🕯️', '📿', '👼', '😇', '❤️', '💕', '🌹', '🌸', '✨', '🌈', '☀️', '🎉', '🎄', '🥰', '😊', '👍'];

// 재생 화면 위에 겹쳐 보여주는 층 (보기 전용)
export function OverlayLayer({ overlays }: { overlays?: VideoOverlays | null }) {
  if (!overlays?.items?.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden [container-type:inline-size]">
      {overlays.items.map(item => <OverlayView key={item.id} item={item} />)}
    </div>
  );
}

function OverlayView({ item, selected, onHandleDown }: { item: OverlayItem; selected?: boolean; onHandleDown?: (e: React.PointerEvent) => void }) {
  return (
    <span
      className={`absolute whitespace-pre-wrap text-center font-bold leading-tight select-none ${item.type === 'text' && item.bg ? 'px-[0.35em] py-[0.15em] rounded-[0.3em]' : ''} ${selected ? 'outline outline-2 outline-dashed outline-white/90 outline-offset-4' : ''}`}
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
        fontSize: `${item.size * 100}cqw`,
        maxWidth: '90cqw',
        color: item.type === 'text' ? (item.bg ? (item.color === '#ffffff' ? '#111827' : '#ffffff') : item.color) : undefined,
        background: item.type === 'text' && item.bg ? item.color : undefined,
        textShadow: item.type === 'text' && !item.bg ? '0 1px 4px rgba(0,0,0,0.6)' : undefined,
      }}
    >
      {item.text}
      {selected && onHandleDown && (
        // 한 손가락으로 끌면 돌리기 + 키우기
        <span
          onPointerDown={onHandleDown}
          className="absolute -right-4 -bottom-4 w-8 h-8 rounded-full bg-white text-stone-900 shadow-lg flex items-center justify-center text-base not-italic font-bold touch-none cursor-grab"
          style={{ fontSize: 18, lineHeight: 1 }}
          aria-label="돌리기·크기"
        >↻</span>
      )}
    </span>
  );
}

const newId = () => Math.random().toString(36).slice(2, 9);

// 꾸미기 화면
export default function VideoEditor({ src, initial, musicTitle, onOpenMusic, onRemoveMusic, onDone, onCancel }: {
  src: string;
  initial?: VideoOverlays | null;
  musicTitle?: string | null;
  onOpenMusic: () => void;
  onRemoveMusic: () => void;
  onDone: (overlays: VideoOverlays) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<OverlayItem[]>(initial?.items || []);
  const [muteOriginal, setMuteOriginal] = useState(!!initial?.muteOriginal);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'text' | 'emoji'>('none');
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState(COLORS[0]);
  const [textBg, setTextBg] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // 손가락 위치들과 지금 하고 있는 동작 (옮기기 / 두 손가락 돌리기·키우기 / 손잡이로 돌리기·키우기)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { mode: 'drag'; id: string; dx: number; dy: number }
    | { mode: 'pinch'; id: string; dist: number; angle: number; size: number; rotation: number }
    | { mode: 'handle'; id: string; cx: number; cy: number; dist: number; angle: number; size: number; rotation: number }
    | null
  >(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const selected = items.find(i => i.id === selectedId) || null;
  const update = (id: string, patch: Partial<OverlayItem>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));

  const rel = (clientX: number, clientY: number) => {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };
  const twoFingers = () => {
    const [a, b] = Array.from(pointers.current.values());
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  const startPinch = (id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item || pointers.current.size < 2) return;
    const { dist, angle } = twoFingers();
    gesture.current = { mode: 'pinch', id, dist, angle, size: item.size, rotation: item.rotation || 0 };
  };
  const startDrag = (id: string, clientX: number, clientY: number) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    const p = rel(clientX, clientY);
    gesture.current = { mode: 'drag', id, dx: item.x - p.x, dy: item.y - p.y };
  };

  const capture = (e: React.PointerEvent) => {
    try { boxRef.current?.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  // 글자/이모티콘을 눌렀을 때
  const onItemDown = (e: React.PointerEvent, item: OverlayItem) => {
    e.stopPropagation();
    capture(e);
    setSelectedId(item.id);
    if (pointers.current.size >= 2) startPinch(item.id);
    else startDrag(item.id, e.clientX, e.clientY);
  };

  // 빈 곳을 눌렀을 때: 두 번째 손가락이면 고른 항목 돌리기·키우기, 아니면 선택 해제
  const onBoxDown = (e: React.PointerEvent) => {
    capture(e);
    if (pointers.current.size >= 2 && selectedId) startPinch(selectedId);
    else if (pointers.current.size === 1) { setSelectedId(null); gesture.current = null; }
  };

  // ↻ 손잡이: 항목 가운데를 기준으로 돌리고 키운다
  const onHandleDown = (e: React.PointerEvent, item: OverlayItem) => {
    e.stopPropagation();
    capture(e);
    const rect = boxRef.current!.getBoundingClientRect();
    const cx = rect.left + item.x * rect.width;
    const cy = rect.top + item.y * rect.height;
    gesture.current = {
      mode: 'handle', id: item.id, cx, cy,
      dist: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)),
      angle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
      size: item.size, rotation: item.rotation || 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const item = itemsRef.current.find(i => i.id === g.id);
    if (!item) return;
    if (g.mode === 'drag') {
      const p = rel(e.clientX, e.clientY);
      update(g.id, { x: Math.min(0.97, Math.max(0.03, p.x + g.dx)), y: Math.min(0.97, Math.max(0.03, p.y + g.dy)) });
    } else if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const { dist, angle } = twoFingers();
      update(g.id, { size: clampSize(item.type, g.size * dist / g.dist), rotation: normAngle(g.rotation + angle - g.angle) });
    } else if (g.mode === 'handle') {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI;
      update(g.id, { size: clampSize(item.type, g.size * dist / g.dist), rotation: normAngle(g.rotation + angle - g.angle) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.mode === 'pinch' && pointers.current.size === 1) {
      // 한 손가락만 남으면 다시 옮기기
      const [rest] = Array.from(pointers.current.values());
      startDrag(g.id, rest.x, rest.y);
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  const openTextPanel = (item?: OverlayItem) => {
    setEditingTextId(item?.id || null);
    setTextInput(item?.text || '');
    setTextColor(item?.color || COLORS[0]);
    setTextBg(!!item?.bg);
    setPanel('text');
  };

  const saveText = () => {
    const text = textInput.trim().slice(0, 60);
    if (!text) { setPanel('none'); return; }
    if (editingTextId) update(editingTextId, { text, color: textColor, bg: textBg });
    else {
      const id = newId();
      setItems(prev => [...prev, { id, type: 'text', text, x: 0.5, y: 0.5, size: 0.08, color: textColor, bg: textBg }]);
      setSelectedId(id);
    }
    setPanel('none');
  };

  const addEmoji = (emoji: string) => {
    const id = newId();
    setItems(prev => [...prev, { id, type: 'emoji', text: emoji, x: 0.5, y: 0.4, size: 0.16 }]);
    setSelectedId(id);
    setPanel('none');
  };

  const tool = 'flex flex-col items-center gap-0.5 text-white text-[0.75rem] font-bold px-2';

  return (
    <div className="fixed inset-0 z-[84] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 text-white">
        <button onClick={onCancel} className="text-sm text-white/80">취소</button>
        <p className="font-bold">✨ 영상 꾸미기</p>
        <button onClick={() => onDone({ items, muteOriginal })} className="text-sm font-bold text-[#fbe7b0]">완료</button>
      </div>

      <div className="flex-1 flex items-center justify-center px-3 min-h-0">
        <div
          ref={boxRef}
          className="relative w-full max-w-sm aspect-[4/5] max-h-full bg-stone-900 rounded-xl overflow-hidden [container-type:inline-size] touch-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={onBoxDown}
        >
          <video src={src} muted autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />
          {items.map(item => (
            <div
              key={item.id}
              onPointerDown={e => onItemDown(e, item)}
              onDoubleClick={() => item.type === 'text' && openTextPanel(item)}
              className="absolute inset-0 pointer-events-none"
            >
              <span className="pointer-events-auto cursor-move">
                <OverlayView item={item} selected={item.id === selectedId} onHandleDown={e => onHandleDown(e, item)} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 고른 글자/이모티콘: 크기, 고치기, 지우기 */}
      {selected && panel === 'none' && (
        <div className="px-4 py-2 flex flex-col gap-2 text-white">
          <div className="flex items-center gap-2">
            <span className="text-xs shrink-0 w-7">크기</span>
            <input
              type="range" min={SIZE_RANGE[selected.type][0]} max={SIZE_RANGE[selected.type][1]} step={0.005}
              value={selected.size}
              onChange={e => update(selected.id, { size: Number(e.target.value) })}
              className="flex-1 min-w-0 accent-[#e8b85a]"
            />
            {selected.type === 'text' && <button onClick={() => openTextPanel(selected)} className="text-xs px-2.5 py-1.5 rounded-lg border border-white/40 shrink-0">고치기</button>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs shrink-0 w-7">회전</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={selected.rotation || 0}
              onChange={e => update(selected.id, { rotation: Number(e.target.value) })}
              className="flex-1 min-w-0 accent-[#e8b85a]"
            />
            <button onClick={() => { setItems(prev => prev.filter(i => i.id !== selected.id)); setSelectedId(null); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-300 text-red-300 shrink-0">지우기</button>
          </div>
        </div>
      )}

      {panel === 'text' && (
        <div className="px-4 py-3 flex flex-col gap-2.5 bg-stone-900">
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value.slice(0, 60))}
            placeholder="영상에 넣을 문구"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl bg-white text-stone-900 text-sm focus:outline-none"
          />
          <div className="flex items-center gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setTextColor(c)} className={`w-8 h-8 rounded-full border-2 ${textColor === c ? 'border-[#e8b85a] scale-110' : 'border-white/30'}`} style={{ background: c }} aria-label="글자색" />
            ))}
            <button onClick={() => setTextBg(v => !v)} className={`ml-auto text-xs px-2.5 py-1.5 rounded-lg border ${textBg ? 'bg-white text-stone-900 border-white' : 'text-white border-white/40'}`}>배경</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPanel('none')} className="flex-1 py-2.5 rounded-xl border border-white/30 text-white text-sm">닫기</button>
            <button onClick={saveText} className="flex-1 py-2.5 rounded-xl bg-[#e8b85a] text-[#101a3f] text-sm font-bold">{editingTextId ? '고치기' : '넣기'}</button>
          </div>
        </div>
      )}

      {panel === 'emoji' && (
        <div className="px-3 py-3 bg-stone-900 grid grid-cols-10 gap-1">
          {EMOJIS.map(e => <button key={e} onClick={() => addEmoji(e)} className="text-2xl py-1">{e}</button>)}
          <button onClick={() => setPanel('none')} className="col-span-10 mt-1 py-2 rounded-xl border border-white/30 text-white text-sm">닫기</button>
        </div>
      )}

      {musicTitle && panel === 'none' && (
        <div className="mx-4 mb-1 flex items-center gap-2 text-xs text-white bg-white/10 rounded-full px-3 py-1.5">
          <span>🎵</span><span className="flex-1 min-w-0 truncate">{musicTitle}</span>
          <button onClick={onRemoveMusic} className="text-white/60 px-1" aria-label="음악 빼기">×</button>
        </div>
      )}

      {panel === 'none' && (
        <div className="flex items-center justify-around px-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-white/10">
          <button onClick={() => openTextPanel()} className={tool}><span className="text-2xl leading-none">Aa</span>글자</button>
          <button onClick={() => setPanel('emoji')} className={tool}><span className="text-2xl leading-none">😊</span>이모티콘</button>
          <button onClick={onOpenMusic} className={tool}><span className="text-2xl leading-none">🎵</span>배경음악</button>
          <button onClick={() => setMuteOriginal(v => !v)} className={tool}>
            <span className="text-2xl leading-none">{muteOriginal ? '🔇' : '🔊'}</span>{muteOriginal ? '원래 소리 끔' : '원래 소리 켬'}
          </button>
        </div>
      )}
      <p className="text-center text-[0.6875rem] text-white/50 pb-2">끌어서 옮기고, 두 손가락이나 ↻ 손잡이로 돌리고 키워요</p>
    </div>
  );
}
