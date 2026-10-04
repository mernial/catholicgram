'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    handleAuth();
  }, [router, supabase]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-stone-800">로그인 처리 중입니다...</h2>
        <p className="text-sm text-stone-500 mt-2">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}