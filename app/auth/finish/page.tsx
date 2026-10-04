'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthFinishPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-stone-800">로그인 완료 중...</h2>
      </div>
    </div>
  );
}