'use client';

// 관리자 내 공간 '🎵 음악 목록' (운영자 요청 2026-11-01: '관리자 공간에 지금 저장되어 있는 음악 목록을 볼 수 있는 아이콘'):
// 가톨릭그램에 있는 음악을 한곳에서 — 관리자가 올린 공개 곡·🔒 보관 음악(선물용)·앱 기본 곡·무료 음악(CC0·CC BY)·쉬는 곡.
// 곡마다 ▶ 미리 듣기, 숨김·보관 표시, 몇 명이 배경음악으로 쓰는지·몇 명에게 선물했는지. 올리기·고치기는 위 두 단추(BgmAdmin)
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BUILTIN_BGM, RETIRED_BGM, MUSIC_MOODS, type BgmTrack } from '@/lib/music';
import { CC_BGM } from '@/lib/music-cc';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';

type Row = BgmTrack & { private?: boolean | null; created_at?: string };

export default function MusicLibrary({ usage, refreshKey = 0, onOpenBgm, onOpenVault, onClose }: {
  usage: Record<string, number>;   // 곡 id → 내 공간 배경음악으로 쓰는 교우 수
  refreshKey?: number;             // 올리기·보관 창을 닫으면 다시 불러옴
  onOpenBgm: () => void;           // 공개 음악 올리기·관리 (BgmAdmin)
  onOpenVault: () => void;         // 🔒 보관 음악 관리 (BgmAdmin vault)
  onClose: () => void;
}) {
  const [uploaded, setUploaded] = useState<Row[] | null>(null);
  const [gifts, setGifts] = useState<Record<string, number>>({});
  const [showRetired, setShowRetired] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cols = 'id, title, artist, url, active, sort, created_at';
      let res: { data: unknown[] | null; error: unknown } = await supabase.from('bgm_tracks').select(`${cols}, private`).order('sort').order('created_at');
      if (res.error) res = await supabase.from('bgm_tracks').select(cols).order('sort').order('created_at'); // 보관 음악 칸 전
      const { data: g } = await supabase.from('music_grants').select('track_id');
      if (!alive) return;
      setUploaded((res.data || []) as Row[]);
      const count: Record<string, number> = {};
      (g || []).forEach(r => { const id = String((r as { track_id: string }).track_id); count[id] = (count[id] || 0) + 1; });
      setGifts(count);
    })();
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggle = (t: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewId === t.id) { audioRef.current.pause(); setPreviewId(null); return; }
    audioRef.current.src = t.url;
    audioRef.current.onended = () => setPreviewId(null);
    audioRef.current.play().catch(() => {});
    setPreviewId(t.id);
  };
  const stop = () => { audioRef.current?.pause(); setPreviewId(null); };

  const pub = (uploaded || []).filter(t => !t.private);
  const vault = (uploaded || []).filter(t => t.private);
  const builtin = BUILTIN_BGM.filter(t => t.active !== false);
  const total = pub.length + vault.length + builtin.length + CC_BGM.length;
  const moodLabel = (m?: string) => MUSIC_MOODS.find(x => x.key === m)?.label;

  const row = (t: Row) => {
    const used = usage[t.id] || 0;
    const gifted = gifts[t.id] || 0;
    const playing = previewId === t.id;
    return (
      <div key={t.id} className="px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => toggle(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${playing ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label={playing ? `${t.title} 멈추기` : `${t.title} 미리 듣기`}>
          <Icon name={playing ? 'pause' : 'play'} fill className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
          <p className="text-xs text-stone-500 truncate">{t.artist || '가톨릭그램'}{moodLabel(t.mood) ? ` · ${moodLabel(t.mood)}` : ''}</p>
          {(used > 0 || gifted > 0 || (t.active === false && !t.private)) && (
            <p className="mt-0.5 flex flex-wrap gap-1 text-[0.6875rem] font-bold">
              {t.active === false && !t.private && <span className="px-1.5 py-px rounded bg-stone-100 text-stone-500">목록에서 숨김</span>}
              {used > 0 && <span className="px-1.5 py-px rounded bg-violet-50 text-violet-700">배경음악 {used}명</span>}
              {gifted > 0 && <span className="px-1.5 py-px rounded bg-amber-50 text-amber-700">🎁 {gifted}명에게 선물</span>}
            </p>
          )}
        </div>
      </div>
    );
  };
  const section = (title: string, hint: string, list: Row[]) => (
    <section aria-label={title}>
      <div className="sticky top-0 z-[1] px-4 py-2 bg-stone-50 border-y border-stone-100">
        <p className="text-[0.8125rem] font-bold text-stone-800">{title} <span className="text-stone-500">{list.length}곡</span></p>
        <p className="text-[0.6875rem] text-stone-500">{hint}</p>
      </div>
      {list.length === 0 ? <p className="px-4 py-4 text-xs text-stone-400">아직 없어요</p> : <div className="divide-y divide-stone-100">{list.map(row)}</div>}
    </section>
  );

  return (
    <BottomSheet bare label="음악 목록" onClose={() => { stop(); onClose(); }} z="z-[84]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe">
        <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900 flex items-center gap-1.5"><Icon name="music" className="w-5 h-5 text-violet-700" />음악 목록 <span className="text-sm text-stone-500 font-bold">· 모두 {uploaded ? total : '…'}곡</span></h2>
            <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">가톨릭그램에 지금 들어 있는 음악이에요. ▶ 로 들어 볼 수 있어요.</p>
          </div>
          <button onClick={() => { stop(); onClose(); }} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1 shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="shrink-0 px-4 py-2.5 flex gap-2 border-b border-stone-100">
          <button type="button" onClick={() => { stop(); onOpenBgm(); }} className="flex-1 py-2 rounded-xl bg-violet-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1"><Icon name="plus" className="w-3.5 h-3.5" />공개 음악 올리기·관리</button>
          <button type="button" onClick={() => { stop(); onOpenVault(); }} className="flex-1 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 text-xs font-bold inline-flex items-center justify-center gap-1"><Icon name="lock" className="w-3.5 h-3.5" />보관 음악 관리</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!uploaded ? <p className="p-8 text-center text-sm text-stone-400">불러오는 중…</p> : (
            <>
              {section('올린 음악 · 공개', '관리자가 올린 곡 — 글쓰기 음악·배경음악 목록에 나와요', pub)}
              {section('🔒 보관 음악 · 선물용', '목록에는 안 나오고, 선물한 교우만 쓸 수 있어요', vault)}
              {section('앱 기본 음악', '앱에 들어 있는 가톨릭그램 곡', builtin)}
              {section('무료 음악 (CC0·CC BY)', '저작권 걱정 없는 30초 곡 — 출처는 곡마다 표시돼요', CC_BGM)}
              <div className="px-4 py-3">
                <button type="button" onClick={() => setShowRetired(v => !v)} className="text-xs font-bold text-stone-500">{showRetired ? '▾' : '▸'} 쉬는 곡 {RETIRED_BGM.length}곡 (예전 기본 곡 — 목록에는 안 나오고, 그 곡을 쓴 예전 글에서만 나와요)</button>
              </div>
              {showRetired && <div className="divide-y divide-stone-100 opacity-70">{RETIRED_BGM.map(row)}</div>}
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
