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

    // 혹시 처리가 늦어져도 1.5초 뒤에 무조건 메인으로 복귀
    setTimeout(() => {
      window.location.replace('/');
    }, 1500);

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <p className="text-stone-600 text-sm font-medium">로그인을 완료하는 중입니다...</p>
    </div>
  );
}