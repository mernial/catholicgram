'use client';

// 운영자가 사연함에서 보낸 답장을 받는 교우의 홈에 공지처럼 띄우는 창 (운영자 2026-11-09: '사연함에서 바로 보내면 공지처럼 상대방에게')
// 닫으면 본 것으로 기억(giftsOpened 와 같은 길 — 다른 기기에도 lib/alert-sync). '사연함에서 보기'는 보낸 사연 화면으로.
import { IconBadge } from '@/components/Icon';

export interface LetterReply { id: string; content: string; reply: string; replied_at: string; created_at: string }
export const letterReplyKey = (l: LetterReply) => `letterreply:${l.id}:${l.replied_at}`;

const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

export function LetterReplyPopup({ letters, name, onClose, onOpen }: { letters: LetterReply[]; name: string; onClose: () => void; onOpen: () => void }) {
  if (letters.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[86dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="운영자 답장">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="loveLetter" tone="rose" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-rose-700">사연함 · {name}님께만 보여요</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">운영자가 사연에 답장했어요</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {letters.map(l => (
            <section key={l.id} className="flex flex-col gap-2" aria-label={`${fmt(l.created_at)} 사연의 답장`}>
              <p className="text-[0.75rem] text-stone-400">{fmt(l.created_at)}에 보낸 사연</p>
              <p className="text-[0.875rem] text-stone-500 leading-relaxed line-clamp-3 whitespace-pre-wrap break-words bg-stone-50 border border-stone-200 rounded-2xl px-3 py-2">{l.content}</p>
              <p className="text-[0.8125rem] font-bold text-rose-700 mt-1">💌 운영자 답장 · {fmt(l.replied_at)}</p>
              <p className="text-[1rem] text-stone-900 leading-relaxed whitespace-pre-wrap break-words">{l.reply}</p>
            </section>
          ))}
        </div>
        <div className="flex border-t border-stone-200">
          <button onClick={onOpen} className="flex-1 py-4 text-[0.9375rem] font-bold text-rose-700 border-r border-stone-200">사연함에서 보기</button>
          <button onClick={onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">닫기</button>
        </div>
      </div>
    </div>
  );
}
