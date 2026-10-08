'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';

interface Item { id: string; sender_name: string; receiver_name: string; content: string | null; image_url: string | null; sent_at: string | null; deleted_at: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');

// 관리자 전용: 회원이 지운 메시지의 원래 내용 (supabase/message-delete.sql, /api/admin/deleted-messages)
export default function DeletedMessages({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/deleted-messages', { headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) { setError(json.error === 'setup' ? '준비 중이에요. (supabase/message-delete.sql 실행 필요)' : (json.error || '불러오지 못했어요.')); return; }
      setItems(json.items || []);
    })();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      {zoom && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setZoom(null); }}>
          <img src={zoom} alt="지운 사진" className="max-w-full max-h-[90dvh] object-contain rounded-lg" />
        </div>
      )}
      <div className="bg-white w-full sm:w-[28rem] h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-stone-900"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />삭제된 메시지</h2>
            <p className="text-xs text-stone-400 mt-0.5">회원이 지운 메시지의 원래 내용 · 관리자만 보여요</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100">
          {error && <p className="p-10 text-center text-sm text-stone-500">{error}</p>}
          {!error && !items && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
          {items && items.length === 0 && <p className="p-10 text-center text-sm text-stone-400">지워진 메시지가 없어요.</p>}
          {items?.map(it => (
            <div key={it.id} className="p-4 flex flex-col gap-1.5">
              <p className="text-[0.8125rem] text-stone-500"><b className="text-stone-800">{it.sender_name}</b> → {it.receiver_name}</p>
              {it.content && <p className="text-[0.9375rem] text-stone-900 whitespace-pre-wrap bg-stone-50 rounded-xl px-3 py-2">{it.content}</p>}
              {it.image_url && (
                <button onClick={() => setZoom(it.image_url)} className="self-start"><img src={it.image_url} alt="지운 사진" className="max-h-40 rounded-xl border border-stone-200 object-cover" /></button>
              )}
              <p className="text-xs text-stone-400">보낸 때 {when(it.sent_at)} · 지운 때 {when(it.deleted_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
