'use client';

// 삼성 인터넷으로 열린 가톨릭그램 안내 (운영자 요청 2026-11-01: '삼성 브라우저로 열려서 자꾸 알림이 안 되거나 화면이 어두워지는 사람들에게 수정 방법을 알려 주는 공지')
// 삼성 인터넷은 ① Play 앱에 알림을 넘겨주는 기능(알림 위임)이 없어 휴대폰 알림 허용이 저절로 풀리고(루비로사·율리T)
// ② 휴대폰이 다크 모드면 밝은 화면을 억지로 어둡게 칠한다 → 크롬으로 열리게 바꾸면 둘 다 해결.
// 어떤 앱으로 보고 있는지(lib/app-kind)에 따라 할 일이 다르다:
//  - Play 테스트 앱: Play 스토어에서 업데이트(1.0.1 부터 크롬으로 열림) → 그래도 삼성 인터넷이면 크롬이 꺼져 있거나 없음
//  - 홈 화면 아이콘(삼성 인터넷으로 만든 것)·인터넷 창: 크롬으로 열어 홈 화면에 다시 추가, 예전 아이콘 지우기
// 삼성 인터넷이 아니면(크롬으로 바꾸면) 이 안내는 저절로 안 뜬다. '다시 보지 않기'는 이 휴대폰에만(page 가 localStorage 에)
import { IconBadge } from '@/components/Icon';
import { ANDROID_PACKAGE } from '@/lib/android-test';
import type { AppKind } from '@/lib/app-kind';

export const isSamsungInternet = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && /SamsungBrowser/i.test(navigator.userAgent);
export const samsungGuideKey = (userId: string) => `samsungGuideHidden:${userId}`;

// Play 스토어의 가톨릭그램 (업데이트 단추가 있는 곳)
const openPlayStore = () => { window.location.href = `market://details?id=${ANDROID_PACKAGE}`; };
// 지금 보던 주소를 크롬으로 (크롬이 없으면 Play 스토어의 크롬)
const openInChrome = () => {
  const { host, pathname } = window.location;
  window.location.href = `intent://${host}${pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('market://details?id=com.android.chrome')};end`;
};

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-2.5">
    <span className="w-6 h-6 shrink-0 rounded-full bg-sky-700 text-white text-[0.8125rem] font-bold flex items-center justify-center mt-0.5">{n}</span>
    <span className="text-[0.9375rem] text-stone-800 leading-relaxed">{children}</span>
  </li>
);

export function SamsungGuidePopup({ kind, onHide, onClose, preview }: { kind: AppKind; onHide?: () => void; onClose: () => void; preview?: boolean }) {
  const play = kind === 'play';
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[86dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="삼성 인터넷 안내">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <IconBadge name="phone" tone="sky" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-sky-700">공지{preview ? ' · 미리 보기' : ''}</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">알림이 자꾸 꺼지거나 화면이 어두워지나요?</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <p className="text-[0.9375rem] text-stone-700 leading-relaxed">
            지금 가톨릭그램이 <b className="text-stone-900">삼성 인터넷</b>으로 열려 있어요. 삼성 인터넷에서는
            <b className="text-stone-900"> 휴대폰 알림이 저절로 꺼지거나</b>, 휴대폰이 어두운 화면(다크 모드)일 때
            <b className="text-stone-900"> 가톨릭그램 화면이 검게</b> 바뀔 수 있어요.
          </p>
          <p className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-[0.9375rem] font-bold text-sky-900 leading-relaxed">👉 크롬(Chrome)으로 열리게 바꾸면 둘 다 해결돼요.</p>
          {/* 할 일 단추는 바로 보이게 위에 (스크롤하지 않아도) */}
          <button type="button" onClick={play ? openPlayStore : openInChrome} className="w-full py-3.5 rounded-2xl bg-sky-700 text-white text-[1rem] font-bold active:bg-sky-800">
            {play ? 'Play 스토어에서 업데이트' : '크롬으로 열기'}
          </button>
          {play ? (
            <ol className="flex flex-col gap-3">
              <Step n={1}>위 <b>Play 스토어에서 업데이트</b>를 눌러 가톨릭그램을 <b>업데이트</b>해 주세요. (&lsquo;열기&rsquo;만 보이면 이미 최신이에요)</Step>
              <Step n={2}>가톨릭그램을 다시 열면 크롬으로 열려요. 처음 한 번은 <b>다시 로그인</b>하고, 알림 허용을 물으면 <b>허용</b>, 알림창 위 <b>휴대폰 알림</b>을 켜 주세요.</Step>
              <Step n={3}>그래도 이 안내가 또 보이면 크롬이 꺼져 있거나 없는 거예요. <b>휴대폰 설정 → 애플리케이션 → Chrome → &lsquo;사용&rsquo;</b>을 누르거나, Play 스토어에서 <b>Chrome</b>을 설치해 주세요.</Step>
            </ol>
          ) : (
            <ol className="flex flex-col gap-3">
              <Step n={1}>위 <b>크롬으로 열기</b>를 눌러 주세요. (크롬이 없으면 Play 스토어에서 Chrome 을 설치해 주세요)</Step>
              <Step n={2}>크롬 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>(또는 &lsquo;앱 설치&rsquo;)를 눌러 새 아이콘을 만들어 주세요.</Step>
              <Step n={3}>이제 새 아이콘으로 들어와 알림을 켜 주세요. 예전 아이콘(삼성 인터넷으로 만든 것)은 꾹 눌러 <b>삭제</b>해도 글·메시지는 그대로예요.</Step>
            </ol>
          )}
          <p className="text-[0.8125rem] text-stone-500 leading-relaxed">
            바꾸기 전까지 화면이 너무 어두우면: 가톨릭그램 <b>설정 → 화면 색</b>에서 <b>&lsquo;차콜&amp;샴페인&rsquo;</b>(어두운 화면)을 고르면 글씨가 또렷하게 보여요.
          </p>
        </div>
        <div className="flex border-t border-stone-200">
          {onHide && <button onClick={onHide} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>}
          <button onClick={onClose} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">닫기</button>
        </div>
      </div>
    </div>
  );
}
