'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SignInComplete() {
  const [blockedMessage, setBlockedMessage] = useState('');

  useEffect(() => {
    // 이용 정지된 계정이면 로그인 대신 안내를 보여준다
    const params = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`);
    const errorText = `${params.get('error_description') || ''} ${params.get('error_code') || ''}`;
    if (/banned/i.test(errorText)) {
      setTimeout(() => setBlockedMessage('운영 정책에 따라 이용이 정지된 계정입니다.'), 0);
      return;
    }

    // URL의 토큰을 세션에 저장한 뒤 메인 페이지('/')로 자동 이동
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.location.replace('/');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.replace('/');
      }
    });

    // 로그인 처리가 끝나기 전에 넘어가면 세션이 사라지므로 넉넉히 기다린 뒤에만 복귀
    // (아이폰 등 느린 환경 대비)
    const fallback = setTimeout(() => {
      window.location.replace('/');
    }, 6000);

    return () => {
      clearTimeout(fallback);
      authListener?.subscription.unsubscribe();
    };
  }, []);

  if (blockedMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center">
        <p className="text-3xl">🚫</p>
        <p className="text-stone-800 font-bold">{blockedMessage}</p>
        <p className="text-stone-500 text-sm">문의: yunho-jo@casuwon.or.kr</p>
        <a href="/" className="mt-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-bold">처음으로</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <p className="text-stone-600 text-sm font-medium">로그인을 완료하는 중입니다...</p>
    </div>
  );
}