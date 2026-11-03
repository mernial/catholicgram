'use client';

// 개인 안내 창 (lib/personal-notices): 받는 교우에게만, 홈에서 뜬다.
// '다시 보지 않기' = 이 안내 끝, '닫기' = 이번에만. 관리자 미리 보기는 받는 교우(@아이디)를 함께 보여 주고 '닫기'만.
import { Fragment } from 'react';
import { IconBadge } from '@/components/Icon';
import type { PersonalNotice } from '@/lib/personal-notices';

// '**굵게**' → 굵은 글씨
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((s, i) => (i % 2 ? <b key={i} className="text-stone-900">{s}</b> : <Fragment key={i}>{s}</Fragment>))}</>;
}

export function PersonalNoticePopup({ notices, preview, onHide, onClose, onAction }: {
  notices: PersonalNotice[];
  preview?: boolean;
  onHide?: () => void;
  onClose: () => void;
  onAction?: (action: NonNullable<PersonalNotice['action']>) => void;
}) {
  const first = notices[0];
  if (!first) return null;
  const action = notices.find(n => n.action)?.action;
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[86dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="개인 안내">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="loveLetter" tone="rose" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-rose-700">
              {preview ? `개인 안내 미리 보기 · 받는 분 ${Array.from(new Set(notices.flatMap(n => n.handles))).map(h => `@${h}`).join(', ')}` : `개인 안내 · ${first.to}님께만 보여요`}
            </p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">{first.to}님, {first.title}</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {notices.map((n, ni) => (
            <section key={n.id} className="flex flex-col gap-4" aria-label={n.title}>
              {ni > 0 && <h3 className="pt-3 border-t border-stone-200 text-[1rem] font-bold text-stone-900">{n.to}님, {n.title}</h3>}
              {n.intro && <p className="text-[0.9375rem] text-stone-700 leading-relaxed"><Rich text={n.intro} /></p>}
              {n.sections.map(s => (
                <div key={s.heading}>
                  <p className="text-[0.9375rem] font-bold text-stone-900">{s.heading}</p>
                  {s.text && <p className="mt-1 text-[0.9375rem] text-stone-700 leading-relaxed"><Rich text={s.text} /></p>}
                  {s.bullets && (
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {s.bullets.map(b => (
                        <li key={b} className="flex gap-2 text-[0.9375rem] text-stone-700 leading-relaxed">
                          <span className="text-rose-400 shrink-0" aria-hidden="true">•</span>
                          <span><Rich text={b} /></span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.steps && (
                    <ol className="mt-2 flex flex-col gap-2">
                      {s.steps.map((st, i) => (
                        <li key={st} className="flex gap-2.5">
                          <span className="w-6 h-6 shrink-0 rounded-full bg-rose-600 text-white text-[0.8125rem] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                          <span className="text-[0.9375rem] text-stone-700 leading-relaxed"><Rich text={st} /></span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {s.note && <p className="mt-2 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-[0.875rem] text-rose-950 leading-relaxed"><Rich text={s.note} /></p>}
                </div>
              ))}
              {n.sign && <p className="text-right text-[0.875rem] font-bold text-stone-500">— {n.sign}</p>}
            </section>
          ))}
          {action === 'sound' && onAction && (
            <button type="button" onClick={() => onAction('sound')} className="w-full py-3.5 rounded-2xl bg-rose-600 text-white text-[1rem] font-bold active:bg-rose-700">알림 소리 설정 열기</button>
          )}
        </div>
        <div className="flex border-t border-stone-200">
          {onHide && <button onClick={onHide} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>}
          <button onClick={onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">닫기</button>
        </div>
      </div>
    </div>
  );
}
