'use client';

import { useEffect } from 'react';

// 보통 브라우저·설치한 앱(홈 화면 앱·Play 앱)에서 공유 주소를 열면 곧바로 앱의 그 글 크게 보기로.
// 카카오톡·네이버·밴드 같은 앱 안의 창에서는 넘기지 않고 이 쪽(서버가 그린 글)을 그대로 보여 준다 —
// 앱 화면은 그런 창에서 다른 브라우저로 넘어가려다 막힐 수 있어서 (아이패드 카카오톡 등)
const IN_APP = /KAKAOTALK|NAVER\(inapp|NAVER|Line\/|FBAN|FBAV|Instagram|BAND\/|DaumApps|everytimeApp|; wv\)/i;

export default function OpenPost({ href }: { href: string }) {
  useEffect(() => {
    if (!IN_APP.test(navigator.userAgent)) window.location.replace(href);
  }, [href]);
  return null;
}
