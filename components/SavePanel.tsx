'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { download, savePanelStore } from '@/lib/save-media';
import Icon from '@/components/Icon';

// 대화의 묶음 사진(여러 장) 저장 창. 크롬은 한 번 누를 때 파일 하나만 내려받게 해서(나머지는 '허용'을 묻거나 막음)
// 첫 장은 이미 저장하고, 나머지는 사진마다 '저장'을 누르게 한다 (누를 때마다 하나씩은 늘 허용됨). '남은 사진 모두 저장'도 있음
export default function SavePanelHost() {
  const state = useSyncExternalStore(savePanelStore.subscribe, savePanelStore.get, () => null);
  const urls = useMemo(() => state?.files.map(f => URL.createObjectURL(f)) ?? [], [state?.files]);
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') savePanelStore.close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);
  if (!state) return null;
  const { files, saved } = state;
  const left = files.map((_, i) => i).filter(i => !saved.includes(i));
  const save = (i: number) => { download(files[i]); savePanelStore.markSaved([i]); };
  const saveRest = () => {
    left.forEach((i, k) => setTimeout(() => download(files[i]), k * 300));
    savePanelStore.markSaved(left);
  };
  return (
    <div className="fixed inset-0 z-[150] bg-black/55 flex items-end sm:items-center justify-center" onClick={() => savePanelStore.close()} role="dialog" aria-label={`사진 ${files.length}장 저장`}>
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88dvh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[1.125rem] text-stone-900">사진 {files.length}장 저장</h2>
          <button onClick={() => savePanelStore.close()} className="w-10 h-10 -mr-2 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
        <p className="mt-1 text-[0.875rem] text-stone-600 leading-relaxed">
          {left.length === 0
            ? '모두 저장했어요. 갤러리(사진첩)나 \'내 파일 → 다운로드\'에서 볼 수 있어요.'
            : <>첫 번째 사진을 저장했어요. 나머지는 사진 아래 <b>저장</b>을 하나씩 눌러 주세요.</>}
        </p>
        <div className={`mt-3 grid gap-2.5 ${files.length === 2 || files.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {files.map((f, i) => {
            const done = saved.includes(i);
            return (
              <div key={f.name + i} className="flex flex-col gap-1.5">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-100">
                  <img src={urls[i]} alt={`사진 ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 min-w-6 h-6 px-1.5 rounded-full bg-black/55 text-white text-[0.75rem] font-bold flex items-center justify-center">{i + 1}</span>
                </div>
                <button onClick={() => save(i)} className={`h-10 rounded-xl text-[0.875rem] font-bold flex items-center justify-center gap-1 ${done ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-stone-900 text-white'}`}
                  aria-label={done ? `${i + 1}번 사진 다시 저장` : `${i + 1}번 사진 저장`}>
                  {done ? '✓ 저장함' : <><Icon name="download" className="w-4 h-4" />저장</>}
                </button>
              </div>
            );
          })}
        </div>
        {left.length > 1 && (
          <button onClick={saveRest} className="mt-3 w-full h-12 rounded-xl border-2 border-stone-300 text-stone-800 text-[0.9375rem] font-bold">남은 {left.length}장 한꺼번에 저장</button>
        )}
        {left.length > 1 && <p className="mt-1.5 text-[0.75rem] text-stone-400 leading-snug text-center">한꺼번에 저장할 때 휴대폰이 &lsquo;여러 파일 다운로드&rsquo;를 물으면 &lsquo;허용&rsquo;을 눌러 주세요</p>}
        <button onClick={() => savePanelStore.close()} className="mt-3 w-full h-12 rounded-xl bg-stone-100 text-stone-700 text-[0.9375rem] font-bold">닫기</button>
      </div>
    </div>
  );
}
