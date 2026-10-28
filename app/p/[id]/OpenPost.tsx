'use client';

import { useEffect } from 'react';

// 공유 주소를 열면 곧바로 앱의 그 글 크게 보기로 (미리 보기 정보는 page.tsx 가 서버에서 채움)
export default function OpenPost({ id }: { id: string }) {
  const href = `/?view=${encodeURIComponent(id)}`;
  useEffect(() => { window.location.replace(href); }, [href]);
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center bg-stone-100">
      <img src="/icon-v2-192.png" alt="" className="w-20 h-20 rounded-3xl shadow" />
      <p className="text-[1.0625rem] font-bold text-stone-800">가톨릭그램에서 글을 여는 중이에요…</p>
      <a href={href} className="px-5 py-3 rounded-2xl bg-stone-900 text-white font-bold">열리지 않으면 여기를 누르세요</a>
    </main>
  );
}
