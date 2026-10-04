'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SignInComplete() {
  useEffect(() => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <p className="text-stone-600 text-sm font-medium">로그인을 완료하는 중입니다...</p>
    </div>
  );
}