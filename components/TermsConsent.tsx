'use client';

// 이용약관·커뮤니티 규칙 동의 창 — 이미 가입한 교우가 처음 글·댓글·메시지를 쓰려 할 때 한 번 (구글 플레이 UGC 정책)
// 새로 가입하는 교우는 프로필 설정 화면의 필수 체크로 동의한다. 동의 없이는 콘텐츠를 올릴 수 없다(닫기만 가능).
import { useState } from 'react';
import { IconBadge } from '@/components/Icon';
import { useBackLayer } from '@/lib/back-layers';
import { TERMS_SUMMARY } from '@/lib/terms-consent';

export function TermsLinks({ onOpenLegal, className = '' }: { onOpenLegal: (doc: 'terms' | 'privacy') => void; className?: string }) {
  const link = 'underline underline-offset-2 font-bold text-blue-700';
  return (
    <span className={className}>
      <button type="button" className={link} onClick={e => { e.preventDefault(); e.stopPropagation(); onOpenLegal('terms'); }}>이용약관 및 커뮤니티 규칙</button>
      {' · '}
      <button type="button" className={link} onClick={e => { e.preventDefault(); e.stopPropagation(); onOpenLegal('privacy'); }}>개인정보처리방침</button>
    </span>
  );
}

/** 가입 화면·동의 창 공통 체크 줄 */
export function TermsCheck({ checked, onChange, onOpenLegal }: { checked: boolean; onChange: (v: boolean) => void; onOpenLegal: (doc: 'terms' | 'privacy') => void }) {
  return (
    <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-left cursor-pointer select-none ${checked ? 'border-blue-300 bg-blue-50' : 'border-stone-300 bg-stone-50'}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4.5 h-4.5 accent-blue-600 shrink-0" required aria-required="true" />
      <span className="text-[0.8125rem] text-stone-700 leading-snug">
        <TermsLinks onOpenLegal={onOpenLegal} />에 동의합니다 <span className="text-red-500 font-bold">(필수)</span>
      </span>
    </label>
  );
}

export function TermsConsentDialog({ onAccept, onClose, onOpenLegal, saving }: { onAccept: () => void; onClose: () => void; onOpenLegal: (doc: 'terms' | 'privacy') => void; saving?: boolean }) {
  const [checked, setChecked] = useState(false);
  useBackLayer(true, onClose);
  return (
    <div className="fixed inset-0 z-[89] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[88dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="커뮤니티 규칙 동의">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="scroll" tone="gold" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-amber-700">글을 올리기 전에 한 번만</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">커뮤니티 규칙에 동의해 주세요</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <p className="text-[0.875rem] text-stone-600 leading-relaxed">가톨릭그램에서 글·사진·댓글·메시지를 올리려면 이용약관과 커뮤니티 규칙에 동의해야 해요. 요약하면 이래요.</p>
          <ul className="flex flex-col gap-2">
            {TERMS_SUMMARY.map(t => <li key={t} className="flex gap-2 text-[0.875rem] text-stone-800 leading-relaxed"><span className="text-amber-600 shrink-0">✔</span><span>{t}</span></li>)}
          </ul>
          <p className="text-[0.8125rem] text-stone-500">전문은 <TermsLinks onOpenLegal={onOpenLegal} />에서 볼 수 있어요.</p>
          <TermsCheck checked={checked} onChange={setChecked} onOpenLegal={onOpenLegal} />
        </div>
        <div className="flex border-t border-stone-200">
          <button onClick={onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">나중에</button>
          <button onClick={onAccept} disabled={!checked || saving} className="flex-1 py-4 text-[0.9375rem] font-bold text-blue-700 disabled:opacity-40">{saving ? '저장 중…' : '동의하고 계속'}</button>
        </div>
      </div>
    </div>
  );
}
