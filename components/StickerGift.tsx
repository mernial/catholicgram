'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import BottomSheet from '@/components/BottomSheet';
import { giftablePacks, isGiftHandle } from '@/lib/stickers';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';

// 관리자: 교우에게 전용 이모티콘 선물하기·거두기 (교우 프로필 카드 → '🎁 이모티콘 선물')
//  - 선물은 sticker_grants 표 (supabase/sticker-gifts.sql 실행 필요)
//  - 코드에 적어 둔 선물(giftHandles, 예: 루비로사 → @rubyrosa)은 '기본 선물'로 보이고 여기서 거둘 수 없음
const SETUP_HINT = '선물하기를 준비 중이에요. (관리자: Supabase 에서 supabase/sticker-gifts.sql 을 한 번 실행해 주세요)';
const SETUP_ALERT = { title: '선물하기를 준비 중이에요', message: '관리자: Supabase 에서 supabase/sticker-gifts.sql 을 한 번 실행해 주세요', icon: 'gift' as const };
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

export default function StickerGift({ user, onClose, onGifted, extra }: {
  user: { id: string; name: string; handle?: string | null };
  onClose: () => void;
  onGifted?: (grantId: string) => void; // 받은 교우에게 휴대폰 알림
  extra?: ReactNode;                    // 이모티콘 말고 다른 선물 (사연함: 사연 선물 대상으로 뽑기)
}) {
  const packs = giftablePacks();
  const [granted, setGranted] = useState<Record<string, string>>({}); // pack_id → grant id
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('sticker_grants').select('id, pack_id').eq('user_id', user.id);
    if (isMissing(error)) setSetupNeeded(true);
    else if (!error) setGranted(Object.fromEntries((data || []).map(r => [r.pack_id as string, r.id as string])));
    setLoading(false);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const give = async (packId: string) => {
    setBusy(packId);
    const { data, error } = await supabase.from('sticker_grants').insert({ user_id: user.id, pack_id: packId }).select('id').single();
    setBusy(null);
    if (error) { await showAlert(isMissing(error) ? SETUP_ALERT : { title: '선물하지 못했어요', message: error.message }); return; }
    setGranted(g => ({ ...g, [packId]: data.id as string }));
    onGifted?.(data.id as string);
  };
  const takeBack = async (packId: string) => {
    if (!(await askConfirm(`${user.name}님에게 준 이모티콘을 거둘까요?`))) return;
    setBusy(packId);
    const { error } = await supabase.from('sticker_grants').delete().eq('user_id', user.id).eq('pack_id', packId);
    setBusy(null);
    if (error) { await showAlert({ title: '거두지 못했어요', message: error.message }); return; }
    setGranted(g => { const next = { ...g }; delete next[packId]; return next; });
  };

  const handle = (user.handle || '').toLowerCase();
  return (
    <BottomSheet label="이모티콘 선물" title={`🎁 ${user.name}님에게 이모티콘 선물`} subtitle="선물한 이모티콘은 그 교우가 고르고 보낼 수 있어요" onClose={onClose} z="z-[96]">
      <div className="p-4 flex flex-col gap-3">
        {setupNeeded && <p className="text-[0.875rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">{SETUP_HINT}</p>}
        {packs.map(p => {
          const byCode = isGiftHandle(p, handle);
          const has = byCode || !!granted[p.id];
          return (
            <div key={p.id} className="rounded-2xl border border-stone-200 bg-white p-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <img src={p.stickers[0].src} alt="" className="w-14 h-14 object-contain shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[1.0625rem] text-stone-900">{p.name}</p>
                  <p className="text-[0.8125rem] text-stone-500">{p.access === 'admin' ? '관리자 전용 이모티콘' : '선물용 이모티콘'} · {p.stickers.length}개</p>
                </div>
                {byCode
                  ? <span className="shrink-0 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 text-[0.875rem] font-bold">기본 선물</span>
                  : has
                    ? <button onClick={() => takeBack(p.id)} disabled={busy === p.id} className="shrink-0 px-3 py-2 rounded-xl border border-stone-300 text-stone-600 text-[0.875rem] font-bold disabled:opacity-50">거두기</button>
                    : <button onClick={() => give(p.id)} disabled={loading || busy === p.id || setupNeeded} className="shrink-0 px-4 py-2 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold disabled:opacity-40">선물하기</button>}
              </div>
              {/* 미리 보기 */}
              <div className="grid grid-cols-6 gap-1">
                {p.stickers.slice(0, 12).map(s => <img key={s.id} src={s.src} alt={s.label} loading="lazy" className="w-full aspect-square object-contain" />)}
              </div>
              {has && <p className="text-[0.8125rem] text-emerald-700 font-bold">✓ {user.name}님이 쓸 수 있어요</p>}
            </div>
          );
        })}
        {extra}
      </div>
    </BottomSheet>
  );
}
