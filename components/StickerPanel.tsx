'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import { STICKERS, STICKER_PACK, type Sticker } from '@/lib/stickers';

// 입력칸 옆 😊 단추 (누르면 이모티콘 칸이 열리고 닫힘)
export function StickerButton({ open, onClick, disabled, className = 'w-10 h-10' }: { open: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={open} aria-label={open ? '이모티콘 닫기' : '이모티콘 보내기'}
      className={`${className} shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 ${open ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
      <Icon name="smiley" className="w-[1.375rem] h-[1.375rem]" />
    </button>
  );
}

// 입력칸 아래 이모티콘 칸: 한 번 누르면 위에 크게 미리 보기, 미리 보기의 '보내기'(또는 같은 이모티콘을 한 번 더)로 전송
export default function StickerPanel({ onSend, onClose, sendClass = 'bg-stone-900' }: {
  onSend: (s: Sticker) => void;
  onClose: () => void;
  sendClass?: string; // 보내기 단추 색 (대화방 색에 맞춤)
}) {
  const [picked, setPicked] = useState<Sticker | null>(null);
  const send = (s: Sticker) => { setPicked(null); onSend(s); };
  return (
    <div className="shrink-0 bg-white border-t border-stone-200 pb-[env(safe-area-inset-bottom)]" role="region" aria-label="이모티콘">
      {picked ? (
        <div className="flex items-center gap-3 px-4 py-2 bg-stone-50 border-b border-stone-100">
          <img src={picked.src} alt={picked.label} className="w-24 h-24 object-contain" />
          <span className="flex-1 min-w-0 text-[0.875rem] text-stone-500 truncate">{picked.label}</span>
          <button type="button" onClick={() => setPicked(null)} className="w-10 h-10 rounded-full text-stone-400 text-2xl leading-none" aria-label="고른 이모티콘 취소">×</button>
          <button type="button" onClick={() => send(picked)} className={`shrink-0 h-11 px-5 rounded-full text-white font-bold text-[0.9375rem] ${sendClass}`}>보내기</button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <span className="text-[0.8125rem] font-bold text-stone-600">🐑 {STICKER_PACK}</span>
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-full text-[0.8125rem] text-stone-500" aria-label="이모티콘 닫기">닫기</button>
        </div>
      )}
      <div className="h-[14.5rem] overflow-y-auto overscroll-contain grid grid-cols-4 gap-1 px-2 pb-2 content-start">
        {STICKERS.map(s => (
          <button key={s.id} type="button" onClick={() => (picked?.id === s.id ? send(s) : setPicked(s))} aria-label={s.label}
            className={`aspect-square rounded-xl p-1 active:scale-95 transition-transform ${picked?.id === s.id ? 'bg-amber-100 ring-2 ring-amber-300' : ''}`}>
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
