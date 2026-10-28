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
type Request = ConfirmOptions & { resolve: (ok: boolean) => void; alert?: boolean };

// 예전 window.confirm 글('…할까요?\n자세한 설명')을 그대로 넘겨도 된다: 첫 줄은 제목, 나머지는 설명,
// 단추 글자·빨간 단추·그림은 글에 든 말로 고른다 (먼저 맞는 것). 따로 정하려면 extra 로 덮어쓴다
const RULES: [RegExp, Partial<ConfirmOptions>][] = [
  [/해제|풀까요/, { ok: '해제', icon: 'unlock' }],
  [/탈퇴|영구 삭제/, { ok: '탈퇴하기', danger: true, icon: 'warning' }],
  [/차단/, { ok: '차단', danger: true, icon: 'prohibit' }],
  [/정지할까요/, { ok: '정지', danger: true, icon: 'prohibit' }],
  [/못하게 할까요/, { ok: '막기', danger: true, icon: 'prohibit' }],
  [/로그아웃/, { ok: '로그아웃', icon: 'signout' }],
  [/나갈까요/, { ok: '나가기', danger: true, icon: 'signout' }],
  [/얼릴까요/, { ok: '얼리기', icon: 'lock' }],
  [/삭제/, { ok: '삭제', danger: true, icon: 'trash' }],
  [/지울까요/, { ok: '지우기', danger: true, icon: 'trash' }],
  [/내릴까요/, { ok: '내리기', danger: true, icon: 'trash' }],
  [/거둘까요/, { ok: '거두기', danger: true, icon: 'gift' }],
  [/뗄까요/, { ok: '떼기', danger: true, icon: 'tag' }],
  [/보낼까요/, { ok: '보내기', icon: 'send' }],
  [/뽑을까요/, { ok: '뽑기', icon: 'gift' }],
  [/옮길까요/, { ok: '옮기기' }],
  [/닫을까요/, { ok: '닫기', cancel: '계속 고치기', danger: true, icon: 'pencil' }],
  [/하셨나요/, { ok: '네, 했어요', cancel: '아직이요', icon: 'check' }],
];
const fromText = (text: string): ConfirmOptions => {
  const [title, ...rest] = text.split('\n');
  const rule = RULES.find(([re]) => re.test(text));
  return { title, message: rest.join('\n').trim() || undefined, ...(rule ? rule[1] : {}) };
};

let show: ((r: Request) => void) | null = null;
// 앱 모양 안내 창 (단추 하나, window.alert 대신): `await showAlert('못 했어요.\n자세한 설명')` — 첫 줄 제목, 나머지 설명
export function showAlert(input: string | ConfirmOptions, extra?: Partial<ConfirmOptions>): Promise<void> {
  const [title, ...rest] = typeof input === 'string' ? input.split('\n') : [];
  const options = { ...(typeof input === 'string' ? { title, message: rest.join('\n').trim() || undefined } : input), ...extra };
  if (!show) { window.alert([options.title, options.message].filter(Boolean).join('\n')); return Promise.resolve(); }
  const open = show;
  return new Promise(resolve => open({ ...options, alert: true, resolve: () => resolve() }));
}
export function askConfirm(input: string | ConfirmOptions, extra?: Partial<ConfirmOptions>): Promise<boolean> {
  const options = { ...(typeof input === 'string' ? fromText(input) : input), ...extra };
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
    // Esc 는 이 창만 닫는다 (아래에 열린 다른 창까지 닫히지 않게 먼저 받아 멈춤)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); req.resolve(false); setReq(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
          {!req.alert && <button type="button" onClick={() => close(false)} className="flex-1 py-3.5 rounded-2xl bg-stone-100 text-stone-700 text-[1rem] font-bold active:scale-[0.98] transition-transform">{req.cancel || '취소'}</button>}
          <button type="button" ref={okRef} onClick={() => close(true)}
            className={`flex-1 py-3.5 rounded-2xl text-white text-[1rem] font-bold active:scale-[0.98] transition-transform ${req.danger ? 'bg-red-500' : 'bg-stone-900'}`}>{req.ok || '확인'}</button>
        </div>
      </div>
    </div>
  );
}
