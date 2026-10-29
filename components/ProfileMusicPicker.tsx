'use client';

import { useEffect, useRef, useState } from 'react';
import type { BgmTrack } from '@/lib/music';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';

// '내 공간 → 🎵 공간 음악': 교우가 내 공간·프로필을 누르면 흐를 곡 고르기
//  - 관리자: '가톨릭그램 음악'(앱에 들어 있는 곡 + 관리자가 올린 곡)에서 — 유튜브 곡은 휴대폰이 저절로 트는 것을 자주 막아서
//  - 교우: 관리자에게 선물받은 노래에서만 (gifts: 곡 id → 선물하며 남긴 말)
export default function ProfileMusicPicker({ tracks, current, onPick, onAddMusic, gifts, onClose }: {
  tracks: BgmTrack[];
  current: string | null;                 // 지금 정해 둔 곡 id
  onPick: (track: BgmTrack | null) => Promise<boolean>; // null = 음악 없이
  onAddMusic?: () => void;                // 음악 파일 올리기 (BgmAdmin, 관리자)
  gifts?: Record<string, string>;         // 선물받은 노래만 고를 때
  onClose: () => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stopPreview = () => { audioRef.current?.pause(); setPreviewId(null); };
  const togglePreview = (t: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewId === t.id) { stopPreview(); return; }
    audioRef.current.src = t.url;
    audioRef.current.onended = () => setPreviewId(null);
    audioRef.current.play().catch(() => {});
    setPreviewId(t.id);
  };
  const pick = async (t: BgmTrack | null) => {
    stopPreview();
    setSaving(t?.id || 'none');
    const ok = await onPick(t);
    setSaving(null);
    if (ok) onClose();
  };

  return (
    <BottomSheet bare label="배경음악" onClose={onClose} z="z-[85]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe">
        <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900 flex items-center gap-1.5"><Icon name="music" className="w-5 h-5 text-violet-700" />내 공간 배경음악</h2>
            <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">{gifts ? '🎁 선물받은 노래 중에서 골라요. ' : ''}교우가 내 공간에 들어오면 이 곡이 흘러요. 듣는 분은 ❚❚ 로 멈출 수 있어요.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1 shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="overflow-y-auto divide-y divide-stone-100">
          {onAddMusic && (
            <button type="button" onClick={() => { stopPreview(); onAddMusic(); }} className="w-full p-3.5 flex items-center gap-3 text-left bg-violet-50/60 active:bg-violet-100">
              <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Icon name="plus" className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-violet-900">음악 파일 올리기</span>
                <span className="block text-xs text-violet-700/80">올리면 아래 목록에 바로 나와요</span>
              </span>
            </button>
          )}
          {tracks.map(t => {
            const chosen = current === t.id;
            return (
              <div key={t.id} className={`p-3.5 flex items-center gap-3 ${chosen ? 'bg-emerald-50/70' : ''}`}>
                <button onClick={() => togglePreview(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label={previewId === t.id ? '멈추기' : '미리 듣기'}>
                  <Icon name={previewId === t.id ? 'pause' : 'play'} fill className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
                  {gifts?.[t.id] ? <p className="text-xs text-amber-700 truncate">🎁 {gifts[t.id]}</p> : t.artist && <p className="text-xs text-stone-500 truncate">{t.artist}</p>}
                </div>
                {chosen
                  ? <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0">✓ 지금 곡</span>
                  : <button onClick={() => pick(t)} disabled={!!saving} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0 disabled:opacity-40">{saving === t.id ? '저장 중…' : '이 곡으로'}</button>}
              </div>
            );
          })}
          {current && (
            <button onClick={() => pick(null)} disabled={!!saving} className="w-full p-4 text-sm text-red-600 font-bold disabled:opacity-40">
              {saving === 'none' ? '저장 중…' : '배경음악 끄기 (음악 없이)'}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
