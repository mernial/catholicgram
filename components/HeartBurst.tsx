'use client';

// 두 번 눌러 공감했을 때 가운데에 잠깐 떠오르는 큰 하트
export default function HeartBurst({ show }: { show: number }) {
  if (!show) return null;
  return (
    <span key={show} className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
      <span className="heart-burst text-[6rem] drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">❤️</span>
    </span>
  );
}
