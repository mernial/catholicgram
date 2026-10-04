'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function SignInCompletePage() {
  const router = useRouter();

  useEffect(() => {
    const handleAuth = async () => {
      // URL의 해시 토큰을 읽고 세션을 등록할 때까지 잠시 대기 후 이동
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace('/');
      } else {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            window.location.replace('/');
          }
        });
        setTimeout(() => {
          window.location.replace('/');
        }, 1500);
      }
    };

    handleAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 text-stone-600 gap-3">
      <span className="text-3xl animate-bounce">🕊️</span>
      <p className="text-sm font-medium">로그인을 완료하는 중입니다...</p>
    </div>
  );
}