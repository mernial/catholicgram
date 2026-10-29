'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BgmTrack } from '@/lib/music';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';

// 관리자: 교우 한 사람에게 노래 선물하기·거두기 (교우 프로필 카드 → '🎵 노래 선물')
//  - 고르는 곡은 '🔒 보관 음악'(bgm_tracks.private)에 올려 둔 곡. 선물은 music_grants (supabase/profile-music.sql)
//  - 받은 교우는 선물 상자 + 휴대폰 알림을 받고, 그 노래를 내 공간 배경음악·게시글 음악으로 쓸 수 있다
//  - 곡 쪽에서 여러 교우에게 주는 것은 components/MusicGift ('🔒 보관 음악' → 곡의 '🎁 선물하기')
const SETUP = { title: '노래 선물을 준비 중이에요', message: '먼저 supabase/profile-music.sql 을 Supabase SQL Editor 에서 한 번 실행해 주세요.', icon: 'gift' as const };

export default function MemberMusicGift({ user, onClose, onGifted, onOpenVault }: {
  user: { id: string; name: string; handle?: string | null };
  onClose: () => void;
  onGifted?: (grantId: string) => void; // 받은 교우에게 휴대폰 알림
  onOpenVault?: () => void;             // 보관 음악에 노래 올리러 가기
}) {
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [granted, setGranted] = useState<Record<string, string>>({}); // 곡 id → 선물 id
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    const [{ data: rows, error }, { data: grants, error: grantError }] = await Promise.all([
      supabase.from('bgm_tracks').select('id, title, artist, url, active, sort, private').eq('private', true).order('sort').order('created_at'),
      supabase.from('music_grants').select('id, track_id').eq('user_id', user.id),
    ]);
    if (error || grantError) { setSetupNeeded(true); setTracks([]); return; }
    setTracks((rows || []) as BgmTrack[]);
    setGranted(Object.fromEntries((grants || []).map(g => [g.track_id as string, g.id as string])));
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePreview = (t: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewId === t.id) { audioRef.current.pause(); setPreviewId(null); return; }
    audioRef.current.src = t.url;
    audioRef.current.onended = () => setPreviewId(null);
    audioRef.current.play().catch(() => {});
    setPreviewId(t.id);
  };

  const give = async (t: BgmTrack) => {
    if (!(await askConfirm({ title: `${user.name}님께 노래를 선물할까요?`, message: `'${t.title}'\n받은 교우는 내 공간 배경음악·게시글 음악으로 쓸 수 있고, 선물 상자와 알림이 가요.`, ok: '선물하기', icon: 'gift' }))) return;
    setBusy(t.id);
    const { data, error } = await supabase.from('music_grants').insert({ user_id: user.id, track_id: t.id, note: note.trim() || null }).select('id').single();
    setBusy(null);
    if (error) { await showAlert(error.code === '23505' ? { title: '이미 선물한 노래예요' } : { title: '선물하지 못했어요', message: error.message }); return; }
    if (data?.id) onGifted?.(data.id as string);
    load();
  };
  const take = async (t: BgmTrack) => {
    if (!(await askConfirm({ title: `${user.name}님께 준 노래를 거둘까요?`, message: `'${t.title}'\n그 교우의 공간·게시글에서 이 노래가 더 이상 나오지 않아요.`, ok: '거두기', danger: true }))) return;
    setBusy(t.id);
    const { error } = await supabase.from('music_grants').delete().eq('id', granted[t.id]);
    setBusy(null);
    if (error) { await showAlert({ title: '거두지 못했어요', message: error.message }); return; }
    load();
  };

  return (
    <BottomSheet bare label="노래 선물" onClose={onClose} z="z-[96]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900">🎵 {user.name}님께 노래 선물</h2>
            <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">🔒 보관 음악에 올려 둔 노래 중에서 골라요. 받은 교우는 내 공간 배경음악·게시글 음악으로 쓸 수 있어요.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1 shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="overflow-y-auto flex flex-col">
          {setupNeeded ? (
            <p className="p-8 text-center text-sm text-red-600 leading-relaxed">{SETUP.message}</p>
          ) : !tracks ? (
            <p className="p-8 text-center text-sm text-stone-400">불러오는 중...</p>
          ) : tracks.length === 0 ? (
            <div className="p-8 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-stone-500 leading-relaxed">🔒 보관 음악에 올려 둔 노래가 아직 없어요.<br />노래를 먼저 보관 음악에 올려 주세요.</p>
              {onOpenVault && <button onClick={onOpenVault} className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold">🔒 보관 음악에 노래 올리기</button>}
            </div>
          ) : (
            <>
              <label className="p-4 flex flex-col gap-1 bg-stone-50 border-b border-stone-100">
                <span className="text-xs font-bold text-stone-600">선물하며 남길 말 (선택 · 받는 분 화면에 보여요)</span>
                <input value={note} onChange={e => setNote(e.target.value.slice(0, 100))} placeholder="예: 보이는 라디오 사연 선물 🎵" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
              </label>
              <div className="divide-y divide-stone-100">
                {tracks.map(t => (
                  <div key={t.id} className={`p-3.5 flex items-center gap-3 ${granted[t.id] ? 'bg-emerald-50/50' : ''}`}>
                    <button onClick={() => togglePreview(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label={previewId === t.id ? '멈추기' : '미리 듣기'}>
                      <Icon name={previewId === t.id ? 'pause' : 'play'} fill className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
                      <p className={`text-xs truncate ${granted[t.id] ? 'text-emerald-700 font-bold' : 'text-stone-400'}`}>{granted[t.id] ? '✓ 선물했어요' : '🔒 보관 음악'}</p>
                    </div>
                    {granted[t.id]
                      ? <button onClick={() => take(t)} disabled={!!busy} className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 shrink-0 disabled:opacity-40">거두기</button>
                      : <button onClick={() => give(t)} disabled={!!busy} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold shrink-0 disabled:opacity-40">{busy === t.id ? '보내는 중…' : '🎁 선물하기'}</button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
