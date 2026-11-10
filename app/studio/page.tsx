import type { Metadata } from 'next';
import NarrationStudio from '@/components/NarrationStudio';

// 설명 영상 녹음실 (관리자만): 대본을 보며 내레이션을 녹음하면 서버에 저장된다 — components/NarrationStudio · app/api/studio
export const metadata: Metadata = { title: '설명 영상 녹음실', robots: { index: false, follow: false } };

export default function StudioPage() {
  return <NarrationStudio />;
}
