'use client';

// 게시글 글쓰기·글 고치기에서 내 이모티콘 넣기 (운영자 2026-11-14 다시 요청).
// 예전엔 이모티콘 칸이 글쓰기 화면 스크롤 안에 있어서(칸 안은 overscroll-contain) 칸 위에서 밀면 글쓰기 화면이 안 내려갔음 → 없앴다가,
// 이번에는 글쓰기 화면 위에 따로 뜨는 창으로: 창 안에서만 스크롤, 고르면 글에 붙고(최대 MAX_POST_STICKERS) 창은 그대로 → '완료'·바깥·뒤로가기로 닫기.
// 즐겨찾기·탭 순서·관리자 전용·선물받은 이모티콘은 채팅 이모티콘 칸과 같음 (StickerPanel)
import { useEffect, useState } from 'react';
import StickerPanel, { PostStickers, type StickerPicker } from './StickerPanel';
import { useBackLayer } from '@/lib/back-layers';
import { MAX_POST_STICKERS, type Sticker } from '@/lib/stickers';

export default function PostStickerSheet({ stickers, onChange, onClose }: { stickers: Sticker[]; onChange: (next: Sticker[]) => void; onClose: () => void }) {
  useBackLayer(true, onClose);
  const [note, setNote] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const full = stickers.length >= MAX_POST_STICKERS;
  const add = (s: Sticker) => {
    if (full) { setNote(`이모티콘은 한 글에 ${MAX_POST_STICKERS}개까지 넣을 수 있어요`); return; }
    setNote('');
    onChange([...stickers, s]);
  };
  // 고르면 바로 글에 붙임 (채팅처럼 미리 보기 → 한 번 더 누르기 없이)
  const picker: StickerPicker = {
    open: true, setOpen: () => {}, picked: null, setPicked: () => {},
    pick: add, sendPicked: async () => {}, close: onClose,
  };
  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="이모티콘 넣기" data-no-pinch
        className="w-full max-w-xl bg-white rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)] [animation:confirmPop_.18s_ease-out]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <h2 className="text-[1.0625rem] font-bold text-stone-900">이모티콘 넣기</h2>
          <span className={`text-[0.8125rem] font-bold ${full ? 'text-rose-600' : 'text-stone-400'}`}>{stickers.length}/{MAX_POST_STICKERS}</span>
          <button type="button" onClick={onClose} className="ml-auto px-4 py-1.5 rounded-full bg-stone-900 text-white text-[0.875rem] font-bold">완료</button>
        </div>
        {stickers.length > 0 ? (
          <div className="px-4 pb-2 max-h-28 overflow-y-auto">
            <PostStickers stickers={stickers} size="w-16 h-16" onRemove={i => { setNote(''); onChange(stickers.filter((_, j) => j !== i)); }} />
          </div>
        ) : (
          <p className="px-4 pb-2 text-[0.8125rem] text-stone-500">누르면 글에 붙어요. 꾹 누르면 ⭐ 즐겨찾기</p>
        )}
        {note && <p className="px-4 pb-2 text-[0.8125rem] font-bold text-rose-600" role="status">{note}</p>}
        <StickerPanel picker={picker} closable={false} />
      </div>
    </div>
  );
}
