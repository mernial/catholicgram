'use client';

import { useSheetDrag } from '@/lib/sheet-drag';

// 아래에서 올라오는 창 (사연함·익명 고민상담과 같은 모양·높이). 아래로 끌어내리거나 바깥·× 를 누르면 닫힌다
// bare: 손잡이만 그리고 제목·×·스크롤은 안의 화면이 직접 (각 화면의 머리줄을 그대로 쓰는 창들: 설정·공지·건의함 등)
export default function BottomSheet({ label, onClose, children, title, subtitle, tone = 'bg-white', head = '', z = 'z-[78]', bare = false }: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  tone?: string;   // 바탕색
  head?: string;   // 손잡이 줄 꾸밈 (안의 머리줄이 어두우면 같은 색으로 이어 붙임)
  z?: string;
  bare?: boolean;
}) {
  const { sheetRef, handleProps } = useSheetDrag(onClose);
  return (
    <div className={`fixed inset-0 ${z} bg-black/50 flex items-end sm:items-center justify-center`} onClick={onClose}>
      <div ref={sheetRef} className={`w-full max-w-xl tablet:max-w-3xl h-[92dvh] sm:h-[88dvh] ${tone} rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl`}
        onClick={e => e.stopPropagation()} role="dialog" aria-label={label}>
        <div {...handleProps} className={`relative shrink-0 cursor-grab touch-none ${head}`}>
          <div className="pt-2.5 pb-1 flex justify-center" aria-hidden="true"><span className="w-12 h-1.5 rounded-full bg-stone-300" /></div>
          {!title && !bare && <button onClick={onClose} className="absolute right-2 top-1 w-10 h-10 flex items-center justify-center text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>}
          {title && (
            <div className="px-5 pb-3 pt-1 flex items-start gap-3 border-b border-stone-200/70">
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-[1.125rem] text-stone-900">{title}</h2>
                {subtitle && <p className="text-[0.8125rem] text-stone-500 mt-0.5">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="w-10 h-10 -mr-2 -mt-1 flex items-center justify-center text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
            </div>
          )}
        </div>
        {bare
          ? <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          : <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col">{children}</div>}
      </div>
    </div>
  );
}
