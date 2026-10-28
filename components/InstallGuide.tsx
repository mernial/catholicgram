'use client';

import { useEffect, useState } from 'react';
import { copyText } from '@/lib/chat-actions';

// 홈 화면에 추가하기 안내 (링크를 받아 처음 들어온 분들이 바로 따라 할 수 있게)
//  - 지금 쓰는 브라우저를 알아내서 그 브라우저의 단계만 크게 보여 준다 (삼성 인터넷 / 크롬 / 아이폰)
//  - 그 브라우저의 메뉴 단추가 있는 곳(화면 밖)을 화살표로 가리킨다: 삼성 인터넷은 오른쪽 아래 ≡, 크롬은 오른쪽 위 ⋮
//  - 크롬이 '설치' 창을 열어 줄 수 있으면(canInstall) 단추 하나로 끝
//  - 다른 앱(네이버·밴드 등) 안의 화면이면 홈 화면에 추가가 안 되므로 크롬·삼성 인터넷으로 여는 단추
type Kind = 'ios' | 'samsung' | 'chrome' | 'inapp' | 'other';

const detect = (isIOS: boolean): Kind => {
  const ua = navigator.userAgent;
  if (isIOS) return 'ios';
  if (/KAKAOTALK|NAVER\(inapp|NAVER|Line\/|FBAN|FBAV|Instagram|BAND\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return 'inapp';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Chrome\//.test(ua) && !/Edg|OPR|Whale|Firefox/i.test(ua)) return 'chrome';
  return 'other';
};
// 안드로이드: 이 주소를 크롬·삼성 인터넷으로 열기 (없으면 Play 스토어로)
const openIn = (pkg: string) => {
  const { host, pathname } = window.location;
  window.location.href = `intent://${host}${pathname}#Intent;scheme=https;package=${pkg};end`;
};
const CHROME = 'com.android.chrome';
const SAMSUNG = 'com.sec.android.app.sbrowser';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-8 h-8 rounded-full bg-stone-900 text-white font-bold flex items-center justify-center">{n}</span>
      <p className="pt-0.5 text-[1.0625rem] leading-relaxed text-stone-800">{children}</p>
    </li>
  );
}
// 단추 모양을 글 안에 그대로 그려 보여 줌
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 mx-0.5 rounded-lg border-2 border-stone-300 bg-white font-bold text-stone-900 align-middle leading-none">{children}</span>
);
// 화살표 (글꼴에 따라 모양이 달라지지 않게 직접 그림)
const Arrow = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 32" className={`w-6 h-8 text-yellow-400 drop-shadow ${up ? '' : 'rotate-180'}`} fill="currentColor" aria-hidden="true"><path d="M12 0 24 14h-7v18H7V14H0z" /></svg>
);
const Pick = ({ children }: { children: React.ReactNode }) => <b className="text-blue-700 bg-blue-50 rounded px-1">{children}</b>;

export default function InstallGuide({ isIOS, canInstall, onInstall, onClose }: { isIOS: boolean; canInstall: boolean; onInstall: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setKind(detect(isIOS)); }, [isIOS]);
  if (!kind) return null;
  const oneTap = canInstall && kind !== 'ios';
  const arrow = oneTap ? null : kind === 'samsung' ? 'bottom' : kind === 'chrome' ? 'top' : null;
  const copyLink = async () => { if (await copyText(window.location.origin)) { setCopied(true); setTimeout(() => setCopied(false), 2500); } };

  return (
    <div className="fixed inset-0 bg-black/60 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      {/* 크롬: 메뉴 ⋮ 는 화면 오른쪽 위 (주소창 옆) */}
      {arrow === 'top' && (
        <div className="pointer-events-none fixed top-3 right-2 z-[76] flex flex-col items-end gap-1 animate-bounce" aria-hidden="true">
          <span className="mr-2"><Arrow up /></span>
          <span className="rounded-xl bg-yellow-300 text-stone-900 text-sm font-bold px-3 py-1.5 shadow-lg">위 ⋮ 를 누르세요</span>
        </div>
      )}
      <div className="relative bg-white w-full sm:w-[26rem] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-safe flex flex-col gap-4" onClick={e => e.stopPropagation()} role="dialog" aria-label="홈 화면에 추가하기">
        <div className="flex items-center gap-3">
          <img src="/icon-v2-192.png" alt="" className="w-14 h-14 rounded-2xl shadow" />
          <div className="min-w-0">
            <h2 className="font-bold text-[1.1875rem] text-stone-900">{oneTap ? '가톨릭그램 앱 설치하기' : '홈 화면에 가톨릭그램 추가하기'}</h2>
            <p className="text-[0.875rem] text-stone-500 leading-snug">한 번만 해 두면 휴대폰 첫 화면의 아이콘으로 바로 열려요{isIOS ? ' (휴대폰 알림도 받을 수 있어요)' : ''}</p>
          </div>
        </div>

        {oneTap ? (
          <>
            <button onClick={onInstall} className="w-full bg-stone-900 text-white py-4 rounded-2xl text-[1.125rem] font-bold">📲 지금 설치하기</button>
            <p className="text-center text-[0.9375rem] text-stone-600 -mt-2">단추를 누르고 나오는 창에서 <b>설치</b>를 누르면 끝이에요</p>
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-[0.9375rem] text-stone-800 leading-relaxed">
              <b className="text-amber-800">⚠️ &lsquo;Play 프로텍트&rsquo; 경고가 뜨면</b><br />
              큰 <b>[확인]</b>은 설치가 취소돼요. 아래쪽 작은 글씨 <b className="text-red-700">무시하고 설치</b>를 눌러 주세요 (안 보이면 <b>자세히</b>를 먼저)
            </div>
          </>
        ) : kind === 'samsung' ? (
          <ol className="flex flex-col gap-3.5">
            <Step n={1}>화면 <b>맨 아래 오른쪽</b>의 <Key>≡</Key> (줄 세 개) 단추를 누르세요</Step>
            <Step n={2}><Pick>＋ 페이지 추가</Pick> 또는 <Pick>현재 페이지 추가</Pick>를 누르세요</Step>
            <Step n={3}><Pick>홈 화면</Pick>을 누르고 <Pick>추가</Pick>를 누르면 끝!</Step>
            <li className="text-[0.875rem] text-stone-500 leading-relaxed pl-11">주소창 옆에 <Key>⬇</Key> 모양 <b>앱 설치</b> 단추가 보이면 그것을 눌러도 돼요</li>
          </ol>
        ) : kind === 'chrome' || kind === 'other' ? (
          <ol className="flex flex-col gap-3.5">
            <Step n={1}>화면 <b>오른쪽 위</b>의 <Key>⋮</Key> (점 세 개) 단추를 누르세요</Step>
            <Step n={2}><Pick>홈 화면에 추가</Pick> 또는 <Pick>앱 설치</Pick>를 누르세요<br /><span className="text-[0.875rem] text-stone-500">(안 보이면 목록을 아래로 조금 내려 보세요)</span></Step>
            <Step n={3}>나오는 창에서 <Pick>설치</Pick>(또는 <Pick>추가</Pick>)를 누르면 끝!</Step>
          </ol>
        ) : kind === 'inapp' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[1.0625rem] text-stone-800 leading-relaxed">
              지금은 <b>다른 앱 안의 화면</b>이라 홈 화면에 추가할 수 없어요.<br />
              아래 단추로 <b>인터넷 앱</b>에서 열어 주세요.
            </p>
            <button onClick={() => openIn(CHROME)} className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-[1.0625rem] font-bold">크롬으로 열기</button>
            <button onClick={() => openIn(SAMSUNG)} className="w-full py-3.5 rounded-2xl border-2 border-stone-300 text-stone-800 text-[1.0625rem] font-bold">삼성 인터넷으로 열기</button>
            <p className="text-[0.875rem] text-stone-500 leading-relaxed">열리지 않으면 화면 오른쪽 위·아래의 <Key>⋮</Key> 또는 <Key>⋯</Key> 단추 → <b>다른 브라우저로 열기</b>를 누르세요</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3.5">
            <Step n={1}><b>Safari</b>(사파리)로 열어 주세요. 화면 아래의 <Key>⬆︎</Key> <b>공유</b> 단추를 누르세요<br /><span className="text-[0.875rem] text-stone-500">(안 보이면 <Key>⋯</Key> 단추 → <b>공유</b>)</span></Step>
            <Step n={2}>목록을 위로 올려 <Pick>홈 화면에 추가</Pick>를 누르세요</Step>
            <Step n={3}>오른쪽 위 <Pick>추가</Pick>를 누르면 끝!</Step>
          </ol>
        )}

        {/* 잘 안 될 때 */}
        {!oneTap && (kind === 'samsung' || kind === 'other') && (
          <div className="rounded-2xl bg-stone-100 p-3.5 flex flex-col gap-2">
            <p className="text-[0.9375rem] text-stone-700">메뉴를 못 찾겠으면 <b>크롬</b>에서 단추 하나로 설치할 수 있어요</p>
            <button onClick={() => openIn(CHROME)} className="w-full py-3 rounded-xl bg-white border-2 border-stone-300 text-stone-900 font-bold">크롬으로 열어 설치하기</button>
            <p className="text-[0.8125rem] text-stone-500">크롬에서는 로그인을 한 번 더 해 주세요</p>
          </div>
        )}
        {kind !== 'inapp' && !oneTap && (
          <button onClick={copyLink} className="text-[0.875rem] text-stone-500 underline underline-offset-2 self-center">{copied ? '주소를 복사했어요 ✓' : '가톨릭그램 주소 복사하기'}</button>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className={`${oneTap ? 'px-5' : 'flex-1'} py-3.5 rounded-2xl text-[1rem] font-bold ${oneTap ? 'text-stone-500 border border-stone-200' : 'bg-stone-900 text-white'}`}>{oneTap ? '나중에' : '알겠어요'}</button>
        </div>

        {/* 삼성 인터넷: 메뉴 ≡ 는 화면 맨 아래 오른쪽 (이 창 바로 아래) */}
        {arrow === 'bottom' && (
          <div className="pointer-events-none -mt-2 flex items-end justify-end gap-2 animate-bounce" aria-hidden="true">
            <span className="rounded-xl bg-yellow-300 text-stone-900 text-sm font-bold px-3 py-1.5 shadow-lg">맨 아래 ≡ 를 누르세요</span>
            <span className="mr-1"><Arrow /></span>
          </div>
        )}
      </div>
    </div>
  );
}
