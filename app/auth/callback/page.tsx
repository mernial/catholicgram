'useEffect'
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // 인증 코드를 처리하고 메인 페이지로 이동
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