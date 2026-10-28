'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { STICKER_PACKS, stripStickerWords, suggestStickers, type Sticker } from '@/lib/stickers';

// 이모티콘 보내기 (1:1 메시지·단체 채팅방·사랑방 공통)
//  - 입력칸 옆 😊 → 입력칸 아래 이모티콘 칸 (캐릭터별 탭: 아멘이·몽글이·딩동이·루)
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

// 입력칸 위 단추를 눌러도 입력칸 초점을 뺏지 않게 → 자판이 내려가지 않음
const keepFocus = { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

// 입력칸 옆 😊 단추 (누르면 이모티콘 칸이 열리고 닫힘)
export function StickerButton({ open, onClick, disabled, className = 'w-10 h-10' }: { open: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={open} aria-label={open ? '이모티콘 닫기' : '이모티콘 보내기'}
      className={`${className} shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 ${open ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
      <Icon name="smiley" className="w-[1.375rem] h-[1.375rem]" />
    </button>
  );
}

// 입력칸 위에 떠 있는 칸 (대화 위에 겹쳐 보임): 고른 이모티콘 미리 보기 + 친 글에 맞는 추천 줄.
// 높이 0인 relative 칸 안에 두면 그 바로 위에 뜬다. onTextChange 를 주면 추천에서 고를 때 이어진 말을 지움
export function StickerAbove({ picker, text, onTextChange }: { picker: StickerPicker; text: string; onTextChange?: (t: string) => void }) {
  const { picked } = picker;
  const pickSuggested = (s: Sticker) => {
    if (picked?.id !== s.id && onTextChange) { const rest = stripStickerWords(text, s); if (rest !== text) onTextChange(rest); }
    picker.pick(s);
  };
  return (
    <div className="absolute left-0 right-0 bottom-0 z-20 px-3 pb-2 flex flex-col items-center gap-2 pointer-events-none">
      {picked && (
        <div className="pointer-events-auto relative rounded-3xl bg-black/65 backdrop-blur-sm p-3 pt-2.5 shadow-xl animate-fade-in" role="region" aria-label="고른 이모티콘">
          <button type="button" {...keepFocus} onClick={picker.sendPicked} aria-label={`${picked.packName} ${picked.label} 보내기`} className="block">
            <img src={picked.src} alt="" draggable={false} className="w-36 h-36 object-contain" />
          </button>
          <p className="mt-1 text-center text-[0.75rem] text-white/85">보내기 단추를 누르면 보내져요</p>
          <button type="button" {...keepFocus} onClick={() => picker.setPicked(null)} className="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-black/70 text-white text-xl leading-none flex items-center justify-center" aria-label="고른 이모티콘 취소">×</button>
        </div>
      )}
      <StickerSuggest text={text} picked={picked} onPick={pickSuggested} />
    </div>
  );
}

// 친 글과 비슷한 이모티콘 추천 (× 를 누르면 글을 다 지울 때까지 숨김)
function StickerSuggest({ text, picked, onPick }: { text: string; picked: Sticker | null; onPick: (s: Sticker) => void }) {
  const [hidden, setHidden] = useState(false);
  const empty = !text.trim();
  useEffect(() => { if (empty) setHidden(false); }, [empty]);
  const list = useMemo(() => suggestStickers(text), [text]);
  if (hidden || list.length === 0) return null;
  return (
    <div className="pointer-events-auto w-full flex items-center gap-1 pl-2 pr-1 py-1.5 rounded-2xl bg-white shadow-[0_4px_18px_rgba(0,0,0,0.16)] border border-stone-200" role="region" aria-label="추천 이모티콘">
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

// 입력칸 아래 이모티콘 칸: 위에 캐릭터 탭, 아래에 그 캐릭터의 이모티콘 (마지막에 본 캐릭터를 기억)
export default function StickerPanel({ picker }: { picker: StickerPicker }) {
  const [packId, setPackId] = useState(() => {
    try { const saved = localStorage.getItem('stickerPack'); if (saved && STICKER_PACKS.some(p => p.id === saved)) return saved; } catch { /* 무시 */ }
    return STICKER_PACKS[0].id;
  });
  const pack = STICKER_PACKS.find(p => p.id === packId) || STICKER_PACKS[0];
  const choose = (id: string) => { setPackId(id); try { localStorage.setItem('stickerPack', id); } catch { /* 무시 */ } };
  return (
    <div className="shrink-0 bg-white border-t border-stone-200 pb-[env(safe-area-inset-bottom)]" role="region" aria-label="이모티콘">
      {/* 캐릭터 탭: 네 칸을 같은 너비로 (그림 위, 이름 아래) */}
      <div className="flex items-stretch gap-1 px-2 pt-2 pb-1 border-b border-stone-100">
        <div className="flex-1 min-w-0 grid grid-cols-4 gap-1" role="tablist" aria-label="이모티콘 캐릭터">
          {STICKER_PACKS.map(p => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === pack.id} onClick={() => choose(p.id)}
              className={`min-w-0 flex flex-col items-center py-1 rounded-xl text-[0.75rem] font-bold transition-colors ${p.id === pack.id ? 'bg-amber-100 text-stone-900' : 'text-stone-500'}`}>
              <img src={p.stickers[0].src} alt="" className="w-9 h-9 object-contain" />
              <span className="max-w-full truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={picker.close} className="shrink-0 w-9 rounded-xl text-stone-400 text-2xl leading-none" aria-label="이모티콘 닫기">×</button>
      </div>
      <div className="h-[14.5rem] overflow-y-auto overscroll-contain grid grid-cols-4 gap-1 px-2 pt-1 pb-2 content-start" role="tabpanel" aria-label={`${pack.name} 이모티콘`}>
        {pack.stickers.map(s => (
          <button key={s.id} type="button" onClick={() => picker.pick(s)} aria-label={s.label}
            className={`aspect-square rounded-xl p-1 active:scale-95 transition-transform ${picker.picked?.id === s.id ? 'bg-amber-100 ring-2 ring-amber-300' : ''}`}>
            <img src={s.src} alt="" loading="lazy" draggable={false} className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
}

// 말풍선 대신 보이는 이모티콘 그림 (누르기·꾹 누르기는 감싼 말풍선이 받는다)
export function StickerImage({ sticker }: { sticker: Sticker }) {
  return <img src={sticker.src} alt={`이모티콘: ${sticker.label}`} draggable={false} className="block w-32 h-32 object-contain pointer-events-none select-none" />;
}
