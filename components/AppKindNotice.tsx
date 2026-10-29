'use client';

import { ANDROID_PACKAGE } from '@/lib/android-test';

// 한 휴대폰에 가톨릭그램이 둘(Play 스토어 테스트 앱 + 홈 화면에 추가한 예전 앱)이면 아이콘·이름이 똑같아 어느 쪽인지 모른다(운영자: 테스터들 문의).
// 홈 화면 아이콘은 바꿀 수 없어서(Play 앱 아이콘은 앱 파일에, 예전 앱은 휴대폰 브라우저가 만든 것) 앱을 열자마자 보이게 표시한다:
//  - 맨 위 이름 아래 작은 표: Play 앱 '✓ Play 테스트 앱'(초록) / 예전 앱 '예전 앱'(주황)
//  - 홈 첫머리 안내 카드: Play 앱은 '이 앱이 테스터 앱이에요'(확인하면 숨김), 예전 앱은 'Play 테스트 앱 열기'·'이 앱 지우는 방법'
// 어느 앱인지는 lib/app-kind (Play 앱은 열릴 때 document.referrer 가 android-app://패키지).
// 예전 앱 카드의 첫 단추는 'Play 테스트 앱 열기'(intent) — 혹시 Play 앱을 예전 앱으로 잘못 알았어도 누르면 Play 앱으로 다시 열려 바로잡힌다
export type AppMark = 'play' | 'old';

export const playAppIntent = () => `intent://${location.host}/#Intent;scheme=https;package=${ANDROID_PACKAGE};end`;

export function AppKindPill({ mark }: { mark: AppMark }) {
  return mark === 'play'
    ? <span className="mt-0.5 px-2 py-px rounded-full bg-emerald-100 text-emerald-800 text-[0.6875rem] font-bold leading-tight whitespace-nowrap">✓ Play 테스트 앱</span>
    : <span className="mt-0.5 px-2 py-px rounded-full bg-amber-100 text-amber-900 text-[0.6875rem] font-bold leading-tight whitespace-nowrap">예전 앱</span>;
}

export function AppKindCard({ mark, onClose, onHowToDelete }: { mark: AppMark; onClose: () => void; onHowToDelete: () => void }) {
  if (mark === 'play') {
    return (
      <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300">
        <p className="font-bold text-emerald-900 text-[1rem]">✅ 이 앱이 Play 스토어 테스터 앱이에요</p>
        <p className="mt-1 text-[0.875rem] text-stone-700 leading-relaxed">
          맨 위 이름 아래에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보이면 이 앱이에요. 앞으로 이 앱을 써 주세요.<br />
          휴대폰에 가톨릭그램 아이콘이 하나 더 있다면 그건 <b>예전 앱</b>이에요 (열면 위에 <b className="text-amber-800">예전 앱</b>이라고 나와요). 예전 앱은 지워도 글·메시지는 그대로예요.
        </p>
        <div className="mt-2.5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-emerald-700 text-white text-[0.9375rem] font-bold">확인했어요</button>
          <button onClick={onHowToDelete} className="flex-1 py-2.5 rounded-xl border border-emerald-300 bg-white text-emerald-900 text-[0.9375rem] font-bold">예전 앱 지우는 방법</button>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 relative">
      <button onClick={onClose} className="absolute top-2 right-2 w-8 h-8 text-stone-400 text-xl leading-none" aria-label="닫기">×</button>
      <p className="font-bold text-amber-900 text-[1rem] pr-6">⚠️ 지금 보고 계신 것은 예전 앱이에요</p>
      <p className="mt-1 text-[0.875rem] text-stone-700 leading-relaxed">
        테스터 앱은 <b>Play 스토어에서 받은 가톨릭그램</b>이에요. 그 앱을 열면 맨 위에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보여요.<br />
        그 앱이 잘 열리면, <b>방금 누르신 이 아이콘(예전 앱)</b>은 홈 화면에서 꾹 눌러 <b>삭제</b>해 주세요. 글·메시지는 그대로예요.
      </p>
      <div className="mt-2.5 flex gap-2">
        <a href={playAppIntent()} className="flex-1 py-2.5 rounded-xl bg-emerald-700 text-white text-[0.9375rem] font-bold text-center">Play 테스트 앱 열기</a>
        <button onClick={onHowToDelete} className="flex-1 py-2.5 rounded-xl border border-amber-300 bg-white text-amber-900 text-[0.9375rem] font-bold">이 앱 지우는 방법</button>
      </div>
    </div>
  );
}
