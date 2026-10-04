'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // 로그인이 완료되면 메인으로 이동
    const timer = setTimeout(() => {
      router.push('/');
    }, 1000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-stone-800">로그인 완료 중...</h2>
        <p className="text-sm text-stone-500 mt-2">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}