'use client';

import BottomSheet from '@/components/BottomSheet';
import { IconBadge, type IconName, type IconTone } from '@/components/Icon';

// 가톨릭 바로가기 (루비로사 건의 2026-11-02: '가톨릭 앱 아래의 여러 앱 바로가기처럼 도움 될 만한 아이콘들',
// 운영자가 고른 셋: 매일미사·오늘의 복음 / 성경 / 가톨릭평화방송) — 내 공간 '가톨릭 바로가기' 단추로 연다.
// 주소는 클라우드 세션에서 막혀 있어 GitHub Actions(scripts/link-check)로 열리는지 확인함 (2026-11-02, 모두 200)
export const CATHOLIC_LINKS: { title: string; sub: string; from: string; url: string; icon: IconName; tone: IconTone }[] = [
  { title: '매일미사 · 오늘의 복음', sub: '오늘 미사의 독서와 복음 말씀', from: '굿뉴스 (서울대교구)', url: 'https://maria.catholic.or.kr/mi_pr/missa/missa.asp', icon: 'candle', tone: 'gold' },
  { title: '성경', sub: '주교회의 가톨릭 성경 읽기', from: '한국천주교주교회의', url: 'https://bible.cbck.or.kr/Knb', icon: 'scroll', tone: 'sky' },
  { title: '가톨릭평화방송', sub: 'cpbc TV · 라디오 · 신문', from: 'cpbc', url: 'https://www.cpbc.co.kr/', icon: 'video', tone: 'violet' },
];

export default function CatholicLinks({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet label="가톨릭 바로가기" title="✝️ 가톨릭 바로가기" subtitle="누르면 그 화면이 열려요 · 다 보시면 뒤로 가기로 가톨릭그램에 돌아와요" onClose={onClose}>
      <div className="p-4 flex flex-col gap-3">
        {CATHOLIC_LINKS.map(l => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl border border-stone-200 bg-white active:bg-stone-50 shadow-sm">
            <IconBadge name={l.icon} tone={l.tone} size="lg" />
            <span className="flex-1 min-w-0">
              <span className="block text-[1.0625rem] font-bold text-stone-900 leading-snug">{l.title}</span>
              <span className="block text-[0.875rem] text-stone-600 leading-snug mt-0.5">{l.sub}</span>
              <span className="block text-[0.75rem] text-stone-400 mt-0.5">{l.from}</span>
            </span>
            <span className="text-stone-300 text-xl shrink-0" aria-hidden="true">›</span>
          </a>
        ))}
        <p className="text-center text-[0.8125rem] text-stone-500 leading-relaxed pt-1">
          가톨릭그램 밖의 사이트예요. 도움이 될 다른 바로가기가 있으면<br />건의함으로 알려 주세요 🙏
        </p>
      </div>
    </BottomSheet>
  );
}
