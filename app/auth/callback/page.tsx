'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
      }
    });
  }, [router, supabase]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-stone-600">로그인 처리 중입니다...</p>
    </div>
  );
}