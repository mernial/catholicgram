'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { STICKER_PACKS, suggestStickers, type Sticker } from '@/lib/stickers';

// 이모티콘 보내기 (1:1 메시지·단체 채팅방·사랑방 공통)
//  - 입력칸 옆 😊 → 입력칸 아래 이모티콘 칸 (캐릭터별 탭: 아멘이·몽글이·딩동이·루)
//  - 글을 치면 입력칸 위에 비슷한 뜻의 이모티콘 추천
//  - 이모티콘을 고르면 입력칸 위에 크게 미리 보기 → '보내기' (같은 것을 한 번 더 눌러도 보냄). 쓰던 글은 그대로
export function useStickerPicker(send: (s: Sticker) => void) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Sticker | null>(null);
  const sendPicked = () => { const s = picked; setPicked(null); if (s) send(s); };
  const pick = (s: Sticker) => { if (picked?.id === s.id) sendPicked(); else setPicked(s); };
  return { open, setOpen, picked, setPicked, pick, sendPicked, close: () => { setOpen(false); setPicked(null); } };
}
export type StickerPicker = ReturnType<typeof useStickerPicker>;

// 입력칸 옆 😊 단추 (누르면 이모티콘 칸이 열리고 닫힘)
export function StickerButton({ open, onClick, disabled, className = 'w-10 h-10' }: { open: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={open} aria-label={open ? '이모티콘 닫기' : '이모티콘 보내기'}
      className={`${className} shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 ${open ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
      <Icon name="smiley" className="w-[1.375rem] h-[1.375rem]" />
    </button>
  );
}

// 입력칸 위: 고른 이모티콘 미리 보기, 아니면 친 글에 맞는 추천 줄
export function StickerAbove({ picker, text, sendClass = 'bg-stone-900' }: { picker: StickerPicker; text: string; sendClass?: string }) {
  const { picked } = picker;
  if (picked) return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-white/95 border-t border-stone-200" role="region" aria-label="고른 이모티콘">
      <img src={picked.src} alt={picked.label} className="w-24 h-24 object-contain" />
      <span className="flex-1 min-w-0 text-[0.875rem] text-stone-500 truncate">{picked.packName} · {picked.label}</span>
      <button type="button" onClick={() => picker.setPicked(null)} className="w-10 h-10 rounded-full text-stone-400 text-2xl leading-none" aria-label="고른 이모티콘 취소">×</button>
      <button type="button" onClick={picker.sendPicked} className={`shrink-0 h-11 px-5 rounded-full text-white font-bold text-[0.9375rem] ${sendClass}`}>보내기</button>
    </div>
  );
  return <StickerSuggest text={text} onPick={picker.pick} />;
}

// 친 글과 비슷한 이모티콘 추천 (× 를 누르면 글을 다 지울 때까지 숨김)
function StickerSuggest({ text, onPick }: { text: string; onPick: (s: Sticker) => void }) {
  const [hidden, setHidden] = useState(false);
  const empty = !text.trim();
  useEffect(() => { if (empty) setHidden(false); }, [empty]);
  const list = useMemo(() => suggestStickers(text), [text]);
  if (hidden || list.length === 0) return null;
  return (
    <div className="shrink-0 flex items-center gap-1 pl-2 pr-1 py-1 bg-white/95 border-t border-stone-200" role="region" aria-label="추천 이모티콘">
      <span className="shrink-0 px-2 py-1 rounded-full bg-amber-100 text-[0.75rem] font-bold text-amber-800">추천</span>
      <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map(s => (
          <button key={s.id} type="button" onClick={() => onPick(s)} aria-label={`${s.packName} ${s.label}`}
            className="shrink-0 w-16 h-16 rounded-xl p-0.5 active:bg-amber-50">
            <img src={s.src} alt="" draggable={false} className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setHidden(true)} className="shrink-0 w-8 h-8 rounded-full text-stone-400 text-xl leading-none" aria-label="추천 이모티콘 숨기기">×</button>
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
