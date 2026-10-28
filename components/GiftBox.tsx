'use client';

import { useEffect, useState } from 'react';
import { STICKER_PACKS } from '@/lib/stickers';

// 관리자가 보낸 선물이 도착하면 뜨는 선물 상자 (전용 이모티콘 선물 · 사연 선물 · 앞으로 더할 선물).
// 상자를 누르면 반짝 열리며 무슨 선물인지 보여 준다. 연 선물은 page 가 기억한다(localStorage giftsOpened:아이디)
// 그림은 운영자가 준 선물 상자(public/gift-box.webp). 휴대폰 알림 그림 gift-icon-192.png·gift-banner.jpg 도 같은 그림
export type Gift =
  | { key: string; kind: 'sticker'; packId: string }
  | { key: string; kind: 'letter'; letterId: string };

const BOX = '/gift-box.webp';

export default function GiftBox({ gift, onOpened, onClose, onShowLetters }: {
  gift: Gift;
  onOpened: (key: string) => void;   // 상자를 열었음 (다시 띄우지 않게 기억)
  onClose: () => void;               // 닫기 (열지 않고 닫으면 다음에 앱을 열 때 다시)
  onShowLetters?: () => void;        // 사연 선물: 내 사연 보기
}) {
  const [stage, setStage] = useState<'closed' | 'opening' | 'open'>('closed');
  useEffect(() => { setStage('closed'); }, [gift.key]);
  const openBox = () => {
    if (stage !== 'closed') return;
    setStage('opening');
    onOpened(gift.key);
    setTimeout(() => setStage('open'), 700);
  };
  const pack = gift.kind === 'sticker' ? STICKER_PACKS.find(p => p.id === gift.packId) : undefined;

  return (
    <div className="fixed inset-0 z-[97] bg-[rgba(18,14,10,.86)] flex flex-col items-center justify-center p-6 [animation:confirmFade_.2s_ease-out]" role="dialog" aria-modal="true" aria-label="관리자의 선물">
      <button type="button" onClick={onClose} className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 w-11 h-11 text-white/80 text-3xl leading-none" aria-label="닫기">×</button>
      {stage !== 'open' ? (
        <>
          <p className="text-white text-[1.5rem] font-bold text-center leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,.5)]">🎁 관리자의 선물이<br />도착했습니다</p>
          <button type="button" onClick={openBox} aria-label="선물 상자 열기"
            className={`relative mt-7 w-60 max-w-[68vw] aspect-square rounded-[2.25rem] bg-white shadow-[0_0_60px_rgba(255,214,120,.55)] overflow-hidden
              ${stage === 'closed' ? '[animation:giftWiggle_2.2s_ease-in-out_infinite]' : '[animation:giftBurst_.7s_ease-in_forwards]'}`}>
            <img src={BOX} alt="" className="w-full h-full object-contain" draggable={false} />
          </button>
          <p className={`mt-5 text-white/85 text-[1rem] font-bold transition-opacity ${stage === 'closed' ? 'animate-pulse' : 'opacity-0'}`}>상자를 눌러 열어 보세요</p>
        </>
      ) : (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 pt-0 flex flex-col items-center text-center gap-3 [animation:confirmPop_.25s_ease-out]">
          <img src={BOX} alt="" className="w-24 h-24 -mt-12 rounded-3xl bg-white shadow-lg object-contain" />
          <p className="text-[0.9375rem] font-bold text-rose-600">관리자의 선물</p>
          {gift.kind === 'sticker' && (
            <>
              <h2 className="text-[1.25rem] font-bold text-stone-900 leading-snug">&lsquo;{pack?.name || '전용'}&rsquo; 이모티콘{pack ? ` ${pack.stickers.length}개` : ''}</h2>
              {pack && (
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  {pack.stickers.slice(0, 8).map(s => <img key={s.id} src={s.src} alt={s.label} className="w-full aspect-square object-contain" />)}
                </div>
              )}
              <p className="text-[0.9375rem] text-stone-600 leading-relaxed">이제 메시지·댓글 입력칸 옆 <b>😊</b> 에서<br />바로 쓸 수 있어요</p>
            </>
          )}
          {gift.kind === 'letter' && (
            <>
              <h2 className="text-[1.25rem] font-bold text-stone-900 leading-snug">보내 주신 사연이<br />선물 대상으로 뽑혔어요! 🎉</h2>
              <p className="text-[0.9375rem] text-stone-600 leading-relaxed">운영자가 곧 메시지로 연락드릴게요 🙏</p>
              {onShowLetters && <button type="button" onClick={onShowLetters} className="w-full py-3 rounded-2xl border border-stone-300 text-stone-800 font-bold">내 사연 보기</button>}
            </>
          )}
          <button type="button" onClick={onClose} className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-[1.0625rem] font-bold">확인</button>
        </div>
      )}
    </div>
  );
}
