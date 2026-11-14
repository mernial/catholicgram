'use client';

// 비공개 테스트 다시 14일 (운영자 2026-11-14: 구글이 프로덕션 신청을 '추가 테스트 필요'로 돌려보냄).
// 구글은 Play 스토어로 깐 테스트 앱을 연 기록만 본다. 그래서 테스터에게 'Play 테스트 앱으로 매일 열어 달라'고 알리되,
// 잘 깔아 둔 분이 엉뚱하게 Play 앱을 지우지 않게 — 어느 앱으로 열었는지에 따라 다른 말을 보여 준다.
//  - Play 테스트 앱: '이 앱이 맞아요, 지우지 마세요' (지우기 이야기 없음)
//  - 예전 홈 화면 아이콘·인터넷 창: 먼저 'Play 테스트 앱 열기'(intent — 잘못 알아봤어도 누르면 Play 앱으로 다시 열려 바로잡힘)
//      · Play 앱을 연 적이 있는 분(홈 화면 아이콘)만: '아이콘을 열어 맨 위가 예전 앱인 것만 지우기'
//      · 아직 설치 확인 전: 설치 방법만 (지우라는 말 없음)
// 구글 '등록함' 안드로이드 테스터에게만, 정한 날까지만.
import { useState } from 'react';
import { IconBadge } from '@/components/Icon';
import { playAppIntent } from '@/components/AppKindNotice';
import type { AppKind } from '@/lib/app-kind';

export const TESTER_RESTART_ID = 'tester-restart-2026-11-14';
export const TESTER_RESTART_UNTIL = Date.parse('2026-11-30T00:00:00+09:00'); // 이날부터는 저절로 안 뜸
export const testerRestartHiddenKey = (uid: string) => `testerRestartHidden:${uid}:${TESTER_RESTART_ID}`;

export type TesterRestartVariant = 'play' | 'old' | 'browser' | 'install';

// 어느 말을 보여 줄지: kind = 지금 앱, installed = Play 테스트 앱을 연 적이 있는지(모르면 null)
export function testerRestartVariant(kind: AppKind | null, installed: boolean | null): TesterRestartVariant {
  if (kind === 'play') return 'play';
  if (installed !== true) return 'install';
  return kind === 'home' ? 'old' : 'browser';
}

function Steps({ items, tone }: { items: React.ReactNode[]; tone: string }) {
  return (
    <ol className="mt-2 flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`w-6 h-6 shrink-0 rounded-full ${tone} text-white text-[0.8125rem] font-bold flex items-center justify-center mt-0.5`}>{i + 1}</span>
          <span className="text-[0.9375rem] text-stone-700 leading-relaxed">{it}</span>
        </li>
      ))}
    </ol>
  );
}

export function TesterRestartPopup({ variant, preview, onClose, onHide, onInstallGuide }: {
  variant: TesterRestartVariant;
  preview?: boolean;
  onClose: () => void;           // 이번에만 닫기
  onHide?: () => void;           // 다시 보지 않기
  onInstallGuide: () => void;    // 테스터 설치 안내 창
}) {
  const [pv, setPv] = useState<TesterRestartVariant>(variant);
  const v = preview ? pv : variant;
  const keepRule = (
    <p className="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-[0.875rem] text-emerald-950 leading-relaxed">
      <b>지우기 전에 꼭 확인!</b> 가톨릭그램 아이콘을 눌러 열어 보고, 맨 위 이름 아래에 <b className="text-amber-800">예전 앱</b>이라고 나오는 것만 지워 주세요.
      <b className="text-emerald-800"> ✓ Play 테스트 앱</b>이라고 나오는 앱은 지우면 안 돼요. 헷갈리시면 <b>아무것도 지우지 말고</b> 두 개 다 두셔도 괜찮아요.
    </p>
  );
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[86dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="테스트 안내">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="phone" tone="green" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-emerald-700">{preview ? '테스터 안내 미리 보기 (관리자)' : '안드로이드 테스터 교우님께'}</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">테스트가 14일 더 이어져요 🙏</h2>
          </div>
        </div>
        {preview && (
          <div className="px-5 pt-3 flex flex-wrap gap-1.5">
            {([['play', 'Play 앱으로 연 분'], ['old', '예전 아이콘'], ['browser', '인터넷 창'], ['install', '설치 전']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPv(k)}
                className={`px-2.5 py-1 rounded-full text-[0.75rem] font-bold border ${pv === k ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-300'}`}>{label}</button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <p className="text-[0.9375rem] text-stone-700 leading-relaxed">
            구글이 정식 출시 전에 <b className="text-stone-900">14일 더 테스트</b>하라고 했어요. 구글은 <b className="text-stone-900">Play 스토어에서 받은 가톨릭그램</b>을 여신 기록만 세어요.
          </p>

          {v === 'play' && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300">
              <p className="font-bold text-emerald-900 text-[1rem]">✅ 지금 보고 계신 이 앱이 맞아요</p>
              <p className="mt-1 text-[0.9375rem] text-stone-700 leading-relaxed">
                맨 위 이름 아래에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보이지요? <b className="text-stone-900">이 앱은 지우지 마세요.</b>
              </p>
              <Steps tone="bg-emerald-700" items={[
                <>11월 29일까지 <b className="text-stone-900">하루 한 번만</b> 이 앱을 열어 주세요. 글을 보거나 기도·공감을 눌러 주시면 더 좋아요.</>,
                <>여유가 되시면 Play 스토어에서 가톨릭그램을 찾아 <b className="text-stone-900">의견(비공개 피드백)</b>을 한 줄 남겨 주세요.</>,
              ]} />
            </div>
          )}

          {v === 'old' && (
            <div className="mt-4 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300">
              <p className="font-bold text-amber-900 text-[1rem]">⚠️ 지금은 예전 아이콘으로 보고 계세요</p>
              <p className="mt-1 text-[0.9375rem] text-stone-700 leading-relaxed">예전 아이콘으로 여시면 구글이 세지 않아요.</p>
              <Steps tone="bg-amber-600" items={[
                <>아래 <b className="text-stone-900">Play 테스트 앱 열기</b>를 눌러 주세요.</>,
                <>열린 앱 맨 위에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보이면, 앞으로는 그 앱으로 써 주세요 (하루 한 번).</>,
                <>예전 아이콘은 <b className="text-stone-900">그냥 두셔도 괜찮아요.</b> 정리하고 싶으시면 아래를 꼭 확인한 뒤에만 지워 주세요. 글·메시지는 그대로예요.</>,
              ]} />
              {keepRule}
            </div>
          )}

          {v === 'browser' && (
            <div className="mt-4 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300">
              <p className="font-bold text-amber-900 text-[1rem]">⚠️ 지금은 인터넷 창으로 보고 계세요</p>
              <p className="mt-1 text-[0.9375rem] text-stone-700 leading-relaxed">인터넷 창으로 보시면 구글이 세지 않아요.</p>
              <Steps tone="bg-amber-600" items={[
                <>아래 <b className="text-stone-900">Play 테스트 앱 열기</b>를 눌러 주세요.</>,
                <>열린 앱 맨 위에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보이면, 앞으로는 그 앱으로 써 주세요 (하루 한 번).</>,
              ]} />
              {keepRule}
            </div>
          )}

          {v === 'install' && (
            <div className="mt-4 p-3.5 rounded-2xl bg-sky-50 border-2 border-sky-300">
              <p className="font-bold text-sky-900 text-[1rem]">📱 Play 테스트 앱을 설치해 주세요</p>
              <p className="mt-1 text-[0.9375rem] text-stone-700 leading-relaxed">아직 Play 스토어 테스트 앱을 여신 기록이 없어요. 이미 설치하셨다면 아래 <b className="text-stone-900">Play 테스트 앱 열기</b>를 눌러 한 번 열어 주세요.</p>
              <Steps tone="bg-sky-700" items={[
                <><b className="text-stone-900">설치 방법 보기</b>를 눌러 차례대로 설치해 주세요.</>,
                <>설치한 앱을 열면 맨 위에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보여요. 11월 29일까지 하루 한 번만 열어 주세요.</>,
              ]} />
              <p className="mt-3 text-[0.8125rem] text-stone-500 leading-relaxed">지금 쓰시는 아이콘은 Play 테스트 앱이 잘 열린 다음에 정리하셔도 돼요.</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {v !== 'play' && (
              <a href={playAppIntent()} className="w-full py-3.5 rounded-2xl bg-emerald-700 text-white text-[1rem] font-bold text-center active:bg-emerald-800">Play 테스트 앱 열기</a>
            )}
            {v === 'install' && (
              <button type="button" onClick={onInstallGuide} className="w-full py-3.5 rounded-2xl border-2 border-sky-300 bg-white text-sky-900 text-[1rem] font-bold">설치 방법 보기</button>
            )}
          </div>
        </div>
        <div className="flex border-t border-stone-200">
          {onHide && <button onClick={onHide} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>}
          <button onClick={v === 'play' && onHide ? onHide : onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">{v === 'play' && onHide ? '확인했어요' : '닫기'}</button>
        </div>
      </div>
    </div>
  );
}
