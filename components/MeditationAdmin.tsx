'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// 관리자: 「오늘의 묵상」 자동 올리기 (매일 저녁 8시에 다음 날 묵상이 저절로 올라감)
// 여기서는 미리 보기와 지금 바로 올리기를 할 수 있다.
const tomorrow = () => new Date(Date.now() + 9 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);

export default function MeditationAdmin({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [date, setDate] = useState(tomorrow());
  const [busy, setBusy] = useState<'' | 'preview' | 'post'>('');
  const [preview, setPreview] = useState<{ content: string; image: string } | null>(null);
  const [message, setMessage] = useState('');

  const run = async (mode: 'preview' | 'post') => {
    if (mode === 'post' && !window.confirm(`${date} 묵상을 지금 만들어 올릴까요?\n(이미 올라간 날짜면 다시 올리지 않아요)`)) return;
    setBusy(mode); setMessage(''); if (mode === 'post') setPreview(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/cron/daily-meditation?date=${date}${mode === 'preview' ? '&preview=1' : ''}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy('');
    if (!res?.ok) { setMessage(`⚠️ ${json.error || '실패했어요. 잠시 후 다시 해 주세요.'}`); return; }
    if (mode === 'preview') { setPreview({ content: json.content, image: json.image }); return; }
    if (json.skipped) { setMessage(`ℹ️ ${json.skipped}`); return; }
    setMessage(`✅ 올렸어요: ${json.theme}`);
    onPosted();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[30rem] h-[94dvh] sm:h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900">✝️ 오늘의 묵상 자동 올리기</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-1" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          <p className="text-sm text-stone-600 leading-relaxed bg-amber-50 border border-amber-100 rounded-xl p-3">
            매일 <b>저녁 8시</b>에 <b>다음 날</b> 매일미사 독서·복음으로 묵상글(1500자 내외)과 포토카드를 만들어 관리자 계정으로 자동으로 올립니다.
          </p>
          <label className="text-sm text-stone-700 flex items-center gap-2">
            날짜
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-stone-300 rounded-lg px-2.5 py-1.5" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => run('preview')} disabled={!!busy} className="flex-1 py-3 rounded-xl border border-stone-300 text-sm font-bold text-stone-700 disabled:opacity-40">{busy === 'preview' ? '만드는 중... (1~3분)' : '👀 미리 보기'}</button>
            <button onClick={() => run('post')} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">{busy === 'post' ? '올리는 중... (1~3분)' : '📤 지금 올리기'}</button>
          </div>
          {message && <p className="text-sm text-stone-700 bg-stone-50 rounded-xl p-3">{message}</p>}
          {preview && (
            <div className="flex flex-col gap-3">
              <img src={preview.image} alt="포토카드 미리 보기" className="w-full rounded-xl border border-stone-200" />
              <p className="text-[0.9375rem] text-stone-800 whitespace-pre-wrap leading-relaxed bg-stone-50 rounded-xl p-3.5">{preview.content}</p>
              <p className="text-xs text-stone-400">미리 보기는 올라가지 않아요. 같은 날짜로 &apos;지금 올리기&apos;를 누르면 새로 만들어 올립니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
