'use client';

import { useEffect, useRef, useState } from 'react';
import MusicSegmentPicker from '@/components/MusicSegmentPicker';
import { type BgmTrack, type MusicMood, MUSIC_MOODS, bySeason, encodeBgm } from '@/lib/music';
import Icon from '@/components/Icon';
import BottomSheet from '@/components/BottomSheet';
import { type MusicFavorite, readMusicFavorites, useMusicFavorites } from '@/lib/music-favorites';

export interface SelectedMusic { value: string; title: string }
// 구간 고르기 대상: 가톨릭그램 음악(trackId + audioUrl)
export interface MusicSegmentTarget { trackId: string; audioUrl: string; title: string; start: number; clip?: number }

// 글쓰기: 배경음악 고르기 (★ 즐겨찾기 / 가톨릭그램 음악)
// 유튜브 음악 넣기(검색·링크)는 아예 없앰 (운영자 요청 2026-11-01) — 예전에 유튜브 음악을 넣은 글은 그대로 재생되고,
// 예전에 즐겨찾기한 유튜브 곡은 목록에서 보이지 않음
// 즐겨찾기: 곡마다 ☆ 를 누르면 넣고 빼기 (이 휴대폰에만, lib/music-favorites). 즐겨찾기가 있으면 그 탭부터 열림
export default function MusicPicker({ tracks, giftTracks = [], initialSegment, onSelect, onClose, onAddMusic }: {
  tracks: BgmTrack[];
  giftTracks?: BgmTrack[]; // 내가 선물받은 노래 (관리자의 보관 음악 → 나만 고를 수 있음, 글을 보는 교우는 누구나 들음)
  onAddMusic?: () => void; // 관리자에게만: '가톨릭그램 음악'에 음악 파일 올리기 (BgmAdmin)
  initialSegment?: MusicSegmentTarget | null; // 이미 고른 곡의 구간만 다시 고치기
  onSelect: (music: SelectedMusic) => void;
  onClose: () => void;
}) {
  // 즐겨찾기가 있으면 그것부터, 없으면 가톨릭그램 음악(관리자가 넣은 곡·앱 기본 곡)부터
  const favs = useMusicFavorites();
  const [mood, setMood] = useState<MusicMood | 'all'>('all'); // '가톨릭그램 음악'의 분위기 나누기 (CC0·CC BY 곡)
  const [tab, setTab] = useState<'fav' | 'bgm'>(() =>
    readMusicFavorites().some(f => f.kind === 'bgm') ? 'fav' : 'bgm');
  const favList = favs.list.filter(f => f.kind === 'bgm'); // 예전에 넣은 유튜브 곡은 빼고
  // 곡을 고른 뒤 구간 고르기
  const [segmentFor, setSegmentFor] = useState<MusicSegmentTarget | null>(initialSegment || null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePreview = (track: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (previewId === track.id) { audio.pause(); setPreviewId(null); return; }
    audio.src = track.url;
    audio.play().catch(() => {});
    setPreviewId(track.id);
  };
  // ☆ 즐겨찾기에 넣기 / ★ 빼기
  const starBtn = (f: MusicFavorite) => {
    const on = favs.has(f);
    return (
      <button type="button" onClick={() => favs.toggle(f)} aria-pressed={on} aria-label={on ? `${f.title} 즐겨찾기에서 빼기` : `${f.title} 즐겨찾기에 넣기`}
        className={`w-9 h-9 -mx-1 rounded-full flex items-center justify-center text-[1.5rem] leading-none shrink-0 ${on ? 'text-amber-400' : 'text-stone-300 hover:text-amber-400'}`}>{on ? '★' : '☆'}</button>
    );
  };
  // '가톨릭그램 음악' 한 줄 (선물받은 노래도 같은 모양, 아래에 🎁)
  const trackRow = (t: BgmTrack, gift = false) => (
    <div key={`${gift ? 'g' : 't'}-${t.id}`} className={`p-3.5 flex items-center gap-3 ${gift ? 'bg-amber-50/40' : ''}`}>
      <button onClick={() => togglePreview(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label="미리 듣기">
        <Icon name={previewId === t.id ? 'pause' : 'play'} fill className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-stone-800 truncate">{t.season === 'christmas' && <span aria-label="성탄 곡">🎄 </span>}{t.title}</p>
        {gift ? <p className="text-xs text-amber-700 truncate">🎁 선물받은 노래</p>
          : t.credit ? (
            // CC0·CC BY 곡: 분위기 말 + 출처 표시 (CC BY 는 곡 이름·작곡가·라이선스를 꼭 보여야 해서 줄여 자르지 않음)
            <p className="text-[0.75rem] leading-snug text-stone-500">{t.feel && <span className="font-bold text-stone-600">{t.feel} · </span>}{t.credit}</p>
          ) : t.artist && <p className="text-xs text-stone-500 truncate">{t.artist}</p>}
      </div>
      {starBtn({ kind: 'bgm', id: t.id, title: t.title })}
      <button onClick={() => { audioRef.current?.pause(); setPreviewId(null); setSegmentFor({ trackId: t.id, audioUrl: t.url, title: t.title, start: 0 }); }} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">선택</button>
    </div>
  );

  // 즐겨찾기 한 줄: 가톨릭그램 음악은 지금 목록의 곡으로(제목·주소가 바뀌었어도), 지워졌거나 숨겨진 곡은 흐리게 + ★ 로 빼기
  const allTracks = [...giftTracks, ...tracks];
  const giftIds = new Set(giftTracks.map(t => t.id));
  const favRow = (f: MusicFavorite) => {
    if (f.kind !== 'bgm') return null;
    const t = allTracks.find(x => x.id === f.id);
    if (t) return trackRow(t, giftIds.has(t.id));
    return (
      <div key={`x-${f.id}`} className="p-3.5 flex items-center gap-3 opacity-60">
        <span className="w-10 h-10 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center shrink-0"><Icon name="music" className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-700 truncate">{f.title}</p>
          <p className="text-xs text-stone-500 truncate">지금은 쓸 수 없는 곡이에요</p>
        </div>
        {starBtn(f)}
      </div>
    );
  };



  const tabBtn = (key: 'fav' | 'bgm', label: React.ReactNode) => (
    <button onClick={() => setTab(key)} aria-pressed={tab === key} className={`flex-auto px-1.5 py-2.5 text-[0.8125rem] min-[400px]:text-sm font-bold whitespace-nowrap border-b-2 ${tab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>{label}</button>
  );

  return (
    <BottomSheet bare label="음악 고르기" onClose={onClose} z="z-[85]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-bold text-stone-900"><Icon name="music" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-violet-700" />음악 추가</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>
        {segmentFor ? (
          <div className="overflow-y-auto">
            <MusicSegmentPicker
              key={segmentFor.trackId}
              audioUrl={segmentFor.audioUrl}
              title={segmentFor.title}
              initialStart={segmentFor.start}
              initialClip={segmentFor.clip}
              onBack={() => setSegmentFor(null)}
              onConfirm={(start, clip) => onSelect({
                value: encodeBgm(segmentFor.trackId, start, clip),
                title: segmentFor.title,
              })}
            />
          </div>
        ) : (<>
        <div className="flex border-b border-stone-100">
          {tabBtn('fav', <><span className="text-amber-400">★</span> 즐겨찾기{favList.length > 0 && <span className="ml-0.5 font-normal">{favList.length}</span>}</>)}
          {tabBtn('bgm', '가톨릭그램 음악')}
        </div>

        {tab === 'fav' ? (
          <div className="overflow-y-auto divide-y divide-stone-100">
            {favList.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-stone-500 leading-relaxed">
                <span className="block text-5xl leading-none text-amber-300 mb-3" aria-hidden="true">☆</span>
                자주 쓰는 음악의 <b className="text-amber-500">☆</b> 를 누르면 여기에 모여요.<br />
                &lsquo;가톨릭그램 음악&rsquo;에서 넣을 수 있어요.
              </div>
            ) : (
              <>
                <p className="px-4 pt-3 pb-1.5 text-xs text-stone-500">최근에 넣은 곡이 위에 있어요 · ★ 를 누르면 빠져요</p>
                {favList.map(favRow)}
              </>
            )}
          </div>
        ) : tab === 'bgm' ? (
          <div className="overflow-y-auto divide-y divide-stone-100">
            {onAddMusic && (
              <button type="button" onClick={() => { audioRef.current?.pause(); setPreviewId(null); onAddMusic(); }} className="w-full p-3.5 flex items-center gap-3 text-left bg-violet-50/60 active:bg-violet-100">
                <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Icon name="plus" className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-violet-900">음악 파일 올리기</span>
                  <span className="block text-xs text-violet-700/80">관리자 · 올리면 이 목록에 바로 나와요</span>
                </span>
              </button>
            )}
            {giftTracks.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1.5 text-xs font-bold text-amber-700 bg-amber-50/60">🎁 선물받은 노래 <span className="font-normal text-amber-700/70">· 나만 고를 수 있어요</span></p>
                {giftTracks.map(t => trackRow(t, true))}
                <p className="px-4 pt-3 pb-1.5 text-xs font-bold text-stone-500">가톨릭그램 음악</p>
              </>
            )}
            {/* 분위기 나누기: 전체 · 고요 · 희망 · 위로 · 기쁨 · 장엄·성가 (운영자가 올린 곡은 '전체'에) */}
            {tracks.some(t => t.mood) && (
              <div className="px-3 py-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="분위기로 고르기">
                {[{ key: 'all' as const, label: '전체' }, ...MUSIC_MOODS].map(m => (
                  <button key={m.key} type="button" onClick={() => setMood(m.key)} aria-pressed={mood === m.key}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[0.8125rem] font-bold ${mood === m.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{m.label}</button>
                ))}
              </div>
            )}
            {tracks.length === 0 ? (
              <div className="p-10 text-center text-sm text-stone-400 leading-relaxed">아직 등록된 배경음악이 없어요.<br />(관리자: 설정 › 게시글 음악 추가·관리)</div>
            ) : bySeason(mood === 'all' ? tracks : tracks.filter(t => t.mood === mood)).map(t => trackRow(t))}
          </div>
        ) : null}
        </>)}
      </div>
    </BottomSheet>
  );
}
