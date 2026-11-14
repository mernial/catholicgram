'use client';

// 휴대폰 알림 끄기 고르기 (운영자 2026-11-14: '휴대폰 알림은 켜 놓고 알림 자체를 끄거나 진동으로 바꾸는 기능으로').
// 예전엔 알림창 '휴대폰 알림'을 끄면 이 휴대폰의 알림 받기(구독)를 지웠다 → 다시 켤 때 허용을 또 받아야 하고, 휴대폰이 허용을 풀면 못 켰다.
// 이제 알림 받기는 그대로 두고 '언제까지 끔'만 서버에 적는다 (push_subscriptions.paused_until, lib/push-devices).
// 진동만: 웹 알림은 소리와 진동을 따로 정할 수 없어서, 휴대폰 설정에서 이 앱 알림 소리를 '무음'으로 바꾸는 법을 보여 준다.
import { useEffect } from 'react';
import Icon, { type IconName } from './Icon';
import { useBackLayer } from '@/lib/back-layers';
import { PAUSE_FOREVER } from '@/lib/push-devices';

export type PauseChoice = { until: string } | { vibrate: true };

const kstParts = (t: number) => {
  const d = new Date(t + 9 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
};
// 내일(지금이 새벽 7시 전이면 오늘) 아침 7시 (한국 시간)
export const nextMorning = (now = Date.now()) => {
  const p = kstParts(now);
  const base = Date.UTC(p.y, p.m, p.day, 7) - 9 * 3600e3;
  return new Date(p.h < 7 ? base : base + 86400e3).toISOString();
};

const inOneHour = () => new Date(Date.now() + 3600e3).toISOString();

export function pauseLabel(until: string, now = Date.now()) {
  if (until.startsWith('9999')) return '다시 켤 때까지';
  const t = Date.parse(until);
  const p = kstParts(t);
  const today = kstParts(now);
  const ampm = p.h < 12 ? '오전' : '오후';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const time = `${ampm} ${h12}시${p.min ? ` ${p.min}분` : ''}`;
  const sameDay = p.y === today.y && p.m === today.m && p.day === today.day;
  return `${sameDay ? '' : '내일 '}${time}까지`;
}

export default function PushPauseSheet({ onPick, onClose }: { onPick: (c: PauseChoice) => void; onClose: () => void }) {
  useBackLayer(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const row = (icon: IconName, title: string, sub: string, choice: () => PauseChoice, tone = 'bg-stone-100 text-stone-700') => (
    <button type="button" onClick={() => onPick(choice())}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-stone-200 text-left active:scale-[0.99] transition-transform">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone}`} aria-hidden="true"><Icon name={icon} className="w-5 h-5" /></span>
      <span className="min-w-0">
        <b className="block text-[0.9375rem] text-stone-900">{title}</b>
        <span className="block text-xs text-stone-500 mt-0.5">{sub}</span>
      </span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-[120] bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="휴대폰 알림 끄기"
        className="w-full max-w-[23rem] bg-white rounded-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[1.125rem] font-bold text-stone-900">휴대폰 알림</h2>
          <button type="button" onClick={onClose} className="text-stone-400 text-xl font-bold px-1" aria-label="닫기">×</button>
        </div>
        <p className="text-[0.8125rem] text-stone-500 mb-4 leading-relaxed">알림 받기는 그대로 두고, 고른 동안만 이 휴대폰에 알림을 보내지 않아요. 다시 켜면 바로 와요.</p>
        <div className="flex flex-col gap-2">
          {row('phone', '진동만 받기', '소리 없이 진동으로 오게 하는 방법', () => ({ vibrate: true }), 'bg-sky-50 text-sky-700')}
          {row('pause', '1시간 끄기', '미사·모임 중에', () => ({ until: inOneHour() }))}
          {row('bellSlash', '내일 아침까지 끄기', '아침 7시에 다시 와요', () => ({ until: nextMorning() }))}
          {row('bellSlash', '끄기', '다시 켤 때까지 오지 않아요', () => ({ until: PAUSE_FOREVER }), 'bg-red-50 text-red-600')}
        </div>
      </div>
    </div>
  );
}

// 진동만 받는 법: 웹 알림은 소리·진동을 앱에서 따로 못 정해 휴대폰 설정에서 이 앱 알림 소리를 '무음'으로 (진동은 그대로)
export function vibrateSteps(kind: 'play' | 'home' | 'browser' | string, apple: boolean, browser: string) {
  if (apple) return '아이폰·아이패드: 설정 → 알림 → 가톨릭그램 → \'사운드\'를 끄세요.\n(아이폰은 앱마다 진동만 따로 정할 수 없어서, 휴대폰 옆 무음 단추로 무음 모드를 켜면 모든 알림이 진동으로 와요)';
  const where = kind === 'play' ? "가톨릭그램 아이콘을 꾹 → ⓘ 애플리케이션 정보" : `휴대폰 설정 → 애플리케이션 → ${browser || 'Chrome'}`;
  const cat = kind === 'play' ? "'가톨릭그램 알림'" : "가톨릭그램(catholicgram-dey7.vercel.app)";
  return `① ${where} → 알림\n② 맨 아래 '알림 카테고리' → ${cat} 글자를 누르기\n③ 소리 → '무음' (진동은 켜 둔 채로)\n\n이제 가톨릭그램 알림은 소리 없이 진동으로 와요. 다시 소리가 나게 하려면 같은 곳에서 소리를 고르세요.`;
}
