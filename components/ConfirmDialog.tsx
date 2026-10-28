'use client';

import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';

// 앱 모양의 확인 창 (브라우저 기본 창 'catholicgram-dey7.vercel.app 내용:' 대신).
// 어디서든 `if (!(await askConfirm({ title: '…' }))) return;` 처럼 쓴다. 창은 app/layout.tsx 의 <ConfirmHost /> 가 그린다
export type ConfirmOptions = {
  title: string;
  message?: string;   // 줄바꿈(\n) 그대로 보임
  ok?: string;        // 기본 '확인'
  cancel?: string;    // 기본 '취소'
  danger?: boolean;   // 지우기처럼 되돌릴 수 없는 일: 빨간 단추
  icon?: IconName;
};
type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((r: Request) => void) | null = null;
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n'))); // 창이 아직 없으면 기본 창
  const open = show;
  return new Promise(resolve => open({ ...options, resolve }));
}

export default function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    show = r => setReq(prev => { prev?.resolve(false); return r; }); // 앞의 창이 열려 있으면 취소로 닫고 새 창
    return () => { show = null; };
  }, []);
  const close = (ok: boolean) => { req?.resolve(ok); setReq(null); };
  useEffect(() => {
    if (!req) return;
    okRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); req.resolve(false); setReq(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  if (!req) return null;
  const tone = req.danger ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-700';
  return (
    <div className="fixed inset-0 z-[300] bg-black/45 flex items-center justify-center p-6 [animation:confirmFade_.15s_ease-out]" onClick={() => close(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.message ? 'confirm-message' : undefined}
        className="w-full max-w-[21rem] bg-white rounded-3xl shadow-2xl p-6 pt-7 flex flex-col items-center text-center [animation:confirmPop_.18s_ease-out]"
        onClick={e => e.stopPropagation()}>
        {(req.icon || req.danger) && (
          <span className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${tone}`} aria-hidden="true">
            <Icon name={req.icon || 'trash'} className="w-7 h-7" />
          </span>
        )}
        <h2 id="confirm-title" className="text-[1.1875rem] font-bold text-stone-900 leading-snug">{req.title}</h2>
        {req.message && <p id="confirm-message" className="mt-2 text-[0.9375rem] text-stone-500 leading-relaxed whitespace-pre-line">{req.message}</p>}
        <div className="mt-6 w-full flex gap-2.5">
          <button type="button" onClick={() => close(false)} className="flex-1 py-3.5 rounded-2xl bg-stone-100 text-stone-700 text-[1rem] font-bold active:scale-[0.98] transition-transform">{req.cancel || '취소'}</button>
          <button type="button" ref={okRef} onClick={() => close(true)}
            className={`flex-1 py-3.5 rounded-2xl text-white text-[1rem] font-bold active:scale-[0.98] transition-transform ${req.danger ? 'bg-red-500' : 'bg-stone-900'}`}>{req.ok || '확인'}</button>
        </div>
      </div>
    </div>
  );
}
