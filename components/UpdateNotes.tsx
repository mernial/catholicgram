'use client';

// 업데이트 소식 (lib/update-notes): 앱을 열면 뜨는 창 + 설정 → 버전 정보의 지난 소식 목록
import { IconBadge } from '@/components/Icon';
import { noteDateLabel, type UpdateItem, type UpdateNote } from '@/lib/update-notes';

const SECTIONS: { key: 'fixed' | 'added' | 'changed'; title: string; tone: string }[] = [
  { key: 'fixed', title: '🛠 고친 것', tone: 'text-emerald-800' },
  { key: 'added', title: '✨ 새로 생긴 것', tone: 'text-violet-800' },
  { key: 'changed', title: '🔄 바뀐 것', tone: 'text-sky-800' },
];

export function UpdateNoteBody({ note }: { note: UpdateNote }) {
  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map(s => {
        const items = note[s.key] as UpdateItem[] | undefined;
        if (!items?.length) return null;
        return (
          <div key={s.key}>
            <p className={`text-[0.9375rem] font-bold ${s.tone}`}>{s.title}</p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {items.map(i => (
                <li key={i.text} className="flex gap-2 text-[1rem] text-stone-800 leading-relaxed">
                  <span className="text-stone-400 shrink-0" aria-hidden="true">•</span>
                  <span>{i.text}{i.adminOnly && <span className="text-[0.8125rem] text-stone-400"> (관리자)</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// 앱을 열면 뜨는 창: 최근 소식들(가장 최근 것부터). '다시 보지 않기' = 이 소식들은 다시 안 뜸, '닫기' = 이번에만
export function UpdatePopup({ notes, onHide, onClose }: { notes: UpdateNote[]; onHide: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[82dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="업데이트 소식">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="sparkle" tone="violet" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-violet-700">업데이트 소식</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">가톨릭그램이 이렇게 바뀌었어요</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {notes.map(n => (
            <section key={n.id} aria-label={`${noteDateLabel(n)} 업데이트`}>
              {notes.length > 1 && <p className="mb-2 text-[0.8125rem] font-bold text-stone-500">{noteDateLabel(n)}</p>}
              <UpdateNoteBody note={n} />
            </section>
          ))}
          <p className="text-[0.8125rem] text-stone-400">지난 소식은 설정 → 버전 정보에서 다시 볼 수 있어요.</p>
        </div>
        <div className="flex border-t border-stone-200">
          <button onClick={onHide} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>
          <button onClick={onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">닫기</button>
        </div>
      </div>
    </div>
  );
}
