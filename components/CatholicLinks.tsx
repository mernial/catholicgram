'use client';

import { useMemo } from 'react';
import BottomSheet from '@/components/BottomSheet';
import Icon, { IconBadge, type IconName, type IconTone } from '@/components/Icon';

// 가톨릭 바로가기 (루비로사 건의 2026-11-02: '가톨릭 앱 아래의 여러 앱 바로가기처럼 도움 될 만한 아이콘들',
// 운영자가 고른 셋: 매일미사·오늘의 복음 / 성경 / 가톨릭평화방송) — 내 공간 '가톨릭 바로가기' 단추로 연다.
// 주소는 클라우드 세션에서 막혀 있어 GitHub Actions(scripts/link-check)로 확인함 (2026-11-02):
//  - 매일미사: 처음 넣은 maria.catholic.or.kr/mi_pr/missa/missa.asp 는 PC 화면이었음(운영자) → 굿뉴스 휴대폰 화면 '오늘의 미사'
//    (/mobile/missa/missa_view.asp?today=on — 그날 미사·독서·복음, viewport 있음)
//  - 매일미사 앱(굿뉴스·서울대교구 전산정보실): 안드로이드 pk.catholic.missa(100만+), 아이폰 App Store id346753847.
//    앱을 바로 여는 주소는 없어(크롬은 BROWSABLE 인 화면만 열어 줌) 스토어 화면으로 — 깔려 있으면 '열기'
//  - 성경·cpbc 는 휴대폰 화면(viewport) 있음
type Platform = 'android' | 'ios' | 'other';
type Link = {
  title: string; sub: string; from: string; url: string; icon: IconName; tone: IconTone;
  app?: { label: string; android: string; ios: string };
};
export const CATHOLIC_LINKS: Link[] = [
  {
    title: '매일미사 · 오늘의 복음', sub: '오늘 미사의 독서와 복음 말씀', from: '굿뉴스 (서울대교구)',
    url: 'https://maria.catholic.or.kr/mobile/missa/missa_view.asp?today=on', icon: 'candle', tone: 'gold',
    app: {
      label: '매일미사 앱으로 보기',
      android: 'https://play.google.com/store/apps/details?id=pk.catholic.missa',
      ios: 'https://apps.apple.com/kr/app/id346753847',
    },
  },
  { title: '성경', sub: '주교회의 가톨릭 성경 읽기', from: '한국천주교주교회의', url: 'https://bible.cbck.or.kr/Knb', icon: 'scroll', tone: 'sky' },
  { title: '가톨릭평화방송', sub: 'cpbc TV · 라디오 · 신문', from: 'cpbc', url: 'https://www.cpbc.co.kr/', icon: 'video', tone: 'violet' },
];

function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export default function CatholicLinks({ onClose }: { onClose: () => void }) {
  const os = useMemo(() => platform(), []);
  return (
    <BottomSheet label="가톨릭 바로가기" title="✝️ 가톨릭 바로가기" subtitle="누르면 그 화면이 열려요 · 다 보시면 뒤로 가기로 가톨릭그램에 돌아와요" onClose={onClose}>
      <div className="p-4 flex flex-col gap-3">
        {CATHOLIC_LINKS.map(l => (
          <div key={l.url} className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3.5 p-4 active:bg-stone-50">
              <IconBadge name={l.icon} tone={l.tone} size="lg" />
              <span className="flex-1 min-w-0">
                <span className="block text-[1.0625rem] font-bold text-stone-900 leading-snug">{l.title}</span>
                <span className="block text-[0.875rem] text-stone-600 leading-snug mt-0.5">{l.sub}</span>
                <span className="block text-[0.75rem] text-stone-400 mt-0.5">{l.from}</span>
              </span>
              <span className="text-stone-300 text-xl shrink-0" aria-hidden="true">›</span>
            </a>
            {l.app && os !== 'other' && (
              <a href={os === 'ios' ? l.app.ios : l.app.android} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 border-t border-stone-100 bg-stone-50 active:bg-stone-100 text-[0.875rem] font-bold text-stone-700">
                <Icon name="download" className="w-[1.1em] h-[1.1em] shrink-0 text-stone-500" />
                <span className="flex-1">{l.app.label}</span>
                <span className="text-[0.75rem] font-normal text-stone-500">{os === 'ios' ? 'App Store' : 'Play 스토어'} · 깔려 있으면 &lsquo;열기&rsquo;</span>
              </a>
            )}
          </div>
        ))}
        <p className="text-center text-[0.8125rem] text-stone-500 leading-relaxed pt-1">
          가톨릭그램 밖의 사이트예요. 도움이 될 다른 바로가기가 있으면<br />건의함으로 알려 주세요 🙏
        </p>
      </div>
    </BottomSheet>
  );
}
