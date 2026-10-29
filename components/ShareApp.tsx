'use client';

import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { copyText } from '@/lib/chat-actions';

// 가톨릭그램 알리기 (운영자 요청: 사람들이 알 수 있게 공유하는 방법)
//  1) 카카오톡·문자·밴드로 보내기: 휴대폰 공유 창(navigator.share) — 카카오톡에서는 미리 보기 카드(public/og-catholicgram.jpg)로 보임
//  2) 주소 복사: 공유 창이 없으면(컴퓨터 등) 소개 글 + 주소를 복사
//  3) QR 사진: 주보·성당 게시판·단체 사진에 넣기 (public/qr-catholicgram.png — 휴대폰 카메라로 비추면 바로 열림). 공유 창으로 보내거나 저장
export const SITE_URL = 'https://catholicgram-dey7.vercel.app';
const MESSAGE = '가톨릭그램 🙏\n기도와 묵상을 나누는 가톨릭 교우들의 공간이에요. 함께해요!';
const QR = '/qr-catholicgram.png';
const aborted = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

export default function ShareApp({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState('');
  const say = (t: string) => { setNote(t); setTimeout(() => setNote(n => (n === t ? '' : n)), 3500); };

  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: '가톨릭그램', text: MESSAGE, url: SITE_URL }); return; } catch (e) { if (aborted(e)) return; }
    }
    if (await copyText(`${MESSAGE}\n${SITE_URL}`)) say('소개 글과 주소를 복사했어요. 카카오톡 대화방에 붙여 넣어 주세요');
  };
  const copyLink = async () => { if (await copyText(SITE_URL)) say('주소를 복사했어요'); };
  const shareQr = async () => {
    try {
      const blob = await (await fetch(QR)).blob();
      const file = new File([blob], '가톨릭그램-QR.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: '가톨릭그램 QR' }); return; }
    } catch (e) { if (aborted(e)) return; }
    const a = document.createElement('a'); // 공유 창이 사진을 못 받으면 저장
    a.href = QR; a.download = '가톨릭그램-QR.png';
    document.body.appendChild(a); a.click(); a.remove();
    say('QR 사진을 저장했어요');
  };

  return (
    <BottomSheet label="가톨릭그램 알리기" title="📣 가톨릭그램 알리기" subtitle="가족·교우분들께 가톨릭그램을 소개해 주세요" onClose={onClose}>
      <div className="p-5 flex flex-col gap-4">
        <button onClick={shareLink} className="w-full py-4 rounded-2xl bg-amber-400 text-stone-900 text-[1.0625rem] font-bold shadow-sm active:brightness-95">
          💬 카카오톡·문자로 알리기
        </button>
        <button onClick={copyLink} className="w-full py-3.5 rounded-2xl border border-stone-300 bg-white text-stone-800 text-[1rem] font-bold">
          🔗 주소 복사하기
        </button>
        <p className="-mt-2 text-center text-[0.8125rem] text-stone-500 break-all">{SITE_URL}</p>

        <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4 flex flex-col items-center gap-3">
          <p className="font-bold text-[1rem] text-stone-900">⛪ 주보·성당 게시판에는 QR 사진</p>
          <img src={QR} alt="가톨릭그램 QR 코드 (휴대폰 카메라로 비추면 열림)" className="w-56 max-w-full rounded-2xl shadow-sm" />
          <p className="text-[0.8125rem] text-stone-600 text-center leading-relaxed">휴대폰 카메라로 비추기만 하면 바로 열려요.<br />주보·게시판·단체 대화방에 사진으로 넣어 주세요.</p>
          <button onClick={shareQr} className="w-full py-3 rounded-2xl bg-stone-900 text-white text-[0.9375rem] font-bold">📷 QR 사진 보내기·저장하기</button>
        </div>

        <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-[0.875rem] text-stone-700 leading-relaxed">
          <p className="font-bold text-sky-900 mb-1">이렇게 알려 보세요</p>
          <p>· 본당·구역·단체의 카카오톡 대화방이나 밴드에 보내기</p>
          <p>· 주보·성당 게시판에 QR 사진 붙이기</p>
          <p>· 받은 분은 주소를 열고 &lsquo;홈 화면에 추가&rsquo;하면 앱처럼 쓸 수 있어요</p>
        </div>
      </div>
      {note && (
        <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full bg-stone-900/90 text-white text-[0.875rem] shadow-lg" role="status">{note}</div>
      )}
    </BottomSheet>
  );
}
