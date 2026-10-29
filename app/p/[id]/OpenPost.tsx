'use client';

import { useEffect, useState } from 'react';
import { inAppBrowser, outsideHref } from '@/lib/open-outside';

// 보통 브라우저·설치한 앱(홈 화면 앱·Play 앱)에서 공유 주소를 열면 곧바로 앱의 그 글 크게 보기로.
// 카카오톡·네이버·밴드 같은 앱 안의 창에서는 넘기지 않고 이 쪽(서버가 그린 글)을 그대로 보여 준다 —
// 앱 화면은 그런 창에서 다른 브라우저로 넘어가려다 막힐 수 있어서 (아이패드 카카오톡 등)
export default function OpenPost({ href }: { href: string }) {
  useEffect(() => {
    if (!inAppBrowser()) window.location.replace(href);
  }, [href]);
  return null;
}

// '가톨릭그램에서 보기' 단추: 앱 안의 창에서는 이미 로그인해 둔 곳(Play 앱·휴대폰 브라우저)으로 열어
// 다시 로그인하지 않고 바로 댓글을 달 수 있게 (루비로사 건의). 밖으로 못 여는 곳(아이패드 카카오톡)은 안내 + 여기서 열기
export function OpenInAppButton({ href, hasPost }: { href: string; hasPost: boolean }) {
  const [outside, setOutside] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const o = outsideHref(href);
    setOutside(o);
    setStuck(inAppBrowser() && !o);
  }, [href]);
  const label = hasPost ? '가톨릭그램에서 보기 · 댓글 달기' : '가톨릭그램 열기';
  return (
    <>
      <a href={outside || href} className="mt-5 w-full max-w-md py-4 rounded-2xl bg-stone-900 text-white text-center text-[1.0625rem] font-bold">{label}</a>
      {outside && (
        <>
          <p className="mt-2 text-[0.8125rem] text-stone-500 text-center leading-relaxed">로그인해 둔 가톨릭그램 앱(또는 인터넷 창)에서 열려요</p>
          <a href={href} className="mt-1 text-[0.875rem] text-stone-500 underline underline-offset-2">열리지 않으면 여기에서 보기</a>
        </>
      )}
      {stuck && (
        <p className="mt-2 max-w-md text-[0.8125rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center leading-relaxed">
          여기(앱 안의 창)에서는 다시 로그인해야 해요.<br />오른쪽 아래 <b>⋯</b> → <b>다른 브라우저로 열기</b>를 누르면 로그인해 둔 그대로 볼 수 있어요.
        </p>
      )}
    </>
  );
}
