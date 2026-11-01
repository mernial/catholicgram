'use client';

// 이용약관·개인정보처리방침을 앱 안의 창으로 (루비로사 건의 2026-11-01: 설정에서 열고 휴대폰 뒤로가기를 누르면
// 앱이 처음부터 다시 떠서 내 공간 첫 화면이 나왔음 — 예전엔 /terms·/privacy 페이지로 아예 나갔다 들어옴).
// 같은 페이지를 창 안에 그대로 띄우고, 그 페이지의 '← 가톨릭그램으로 돌아가기'(창 안에서 앱이 또 뜸)는 숨긴다
import BottomSheet from '@/components/BottomSheet';

export type LegalDoc = 'terms' | 'privacy';
export const LEGAL_TITLE: Record<LegalDoc, string> = { terms: '이용약관 및 커뮤니티 규칙', privacy: '개인정보처리방침' };

export default function LegalSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const d = e.currentTarget.contentDocument;
      d?.querySelectorAll('a[href="/"]').forEach(a => a.remove());
      d?.querySelector('main')?.classList.remove('min-h-screen', 'border-x');
    } catch { /* 다른 주소면 그대로 */ }
  };
  return (
    <BottomSheet label={LEGAL_TITLE[doc]} title={LEGAL_TITLE[doc]} onClose={onClose} z="z-[86]">
      <iframe src={`/${doc}`} title={LEGAL_TITLE[doc]} onLoad={onLoad} className="flex-1 w-full min-h-0 border-0 bg-white" />
    </BottomSheet>
  );
}
