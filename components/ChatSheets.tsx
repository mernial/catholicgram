'use client';

import { useEffect, useRef, useState } from 'react';
import { copyText, toast, type Bookmark } from '@/lib/chat-actions';

// 선택 복사: 메시지 글을 크게 띄워 필요한 부분만 골라 복사 (아무것도 고르지 않으면 전부)
export function SelectCopySheet({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const ta = ref.current; if (ta) { ta.focus(); ta.select(); } }, []);
  const copy = async () => {
    const ta = ref.current;
    const part = ta && ta.selectionEnd > ta.selectionStart ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : text;
    if (await copyText(part)) { toast('복사했어요'); onClose(); }
    else alert('복사하지 못했어요. 글을 꾹 눌러 직접 복사해 주세요.');
  };
  return (
    <div className="fixed inset-0 z-[96] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:w-[28rem] bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-3" onClick={e => e.stopPropagation()} role="dialog" aria-label="선택 복사">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[1.125rem] text-stone-900">선택 복사</h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
        <p className="text-[0.8125rem] text-stone-500">복사할 부분을 손가락으로 끌어 고른 뒤 &lsquo;복사하기&rsquo;를 누르세요. 고르지 않으면 전부 복사해요.</p>
        <textarea ref={ref} readOnly value={text} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
          className="w-full shrink-0 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-3 text-[1.0625rem] leading-relaxed text-stone-900 resize-none focus:outline-none select-text" />
        <button onClick={copy} className="py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-[1rem]">📋 복사하기</button>
      </div>
    </div>
  );
}

// 책갈피 모아 보기: 누르면 그 메시지로
export function BookmarkSheet({ items, onJump, onRemove, onClose }: { items: Bookmark[]; onJump: (id: string) => void; onRemove: (id: string) => void; onClose: () => void }) {
  const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="fixed inset-0 z-[96] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:w-96 max-h-[80dvh] bg-white rounded-t-3xl sm:rounded-3xl flex flex-col pb-[env(safe-area-inset-bottom)]" onClick={e => e.stopPropagation()} role="dialog" aria-label="책갈피">
        <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between border-b border-stone-100">
          <h3 className="font-bold text-[1.125rem] text-stone-900">🔖 책갈피 {items.length}개</h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
        {items.length === 0
          ? <p className="p-8 text-center text-stone-500 text-[0.9375rem]">아직 책갈피가 없어요.<br />메시지를 꾹 눌러 &lsquo;책갈피 설정&rsquo;을 고르세요.</p>
          : (
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {[...items].reverse().map(b => (
                <div key={b.id} className="flex items-center gap-2 pr-3">
                  <button onClick={() => onJump(b.id)} className="flex-1 min-w-0 text-left px-5 py-3">
                    <span className="block text-[0.8125rem] text-stone-500">{b.name} · {when(b.at)}</span>
                    <span className="block text-[0.9375rem] text-stone-900 line-clamp-2 break-words">{b.text}</span>
                  </button>
                  <button onClick={() => onRemove(b.id)} className="shrink-0 w-9 h-9 text-stone-300 text-xl leading-none" aria-label="이 책갈피 빼기">×</button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// 대화를 위로 올려 보는 중이면 오른쪽 아래에 '맨 아래(최근 대화)로' 단추. 새 대화가 오면 그 수를 함께
export function JumpToLatest({ listRef, newCount = 0, onJump, className = 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' }: {
  listRef: React.RefObject<HTMLElement | null>;
  newCount?: number;
  onJump: () => void;
  className?: string;   // 놓을 높이 (입력칸 위)
}) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setUp(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [listRef]);
  if (!up) return null;
  return (
    <button type="button" onClick={onJump} aria-label={newCount > 0 ? `새 대화 ${newCount}개 · 최근 대화로 가기` : '최근 대화로 가기'}
      className={`absolute right-4 z-20 w-12 h-12 rounded-full bg-white/95 border border-stone-200 shadow-lg text-stone-700 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-6 h-6" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" /></svg>
      {newCount > 0 && <span className="absolute -top-1.5 -right-1 min-w-[1.375rem] h-[1.375rem] px-1 rounded-full bg-red-500 text-white text-[0.75rem] font-bold flex items-center justify-center">{newCount > 99 ? '99+' : newCount}</span>}
    </button>
  );
}
