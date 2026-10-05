'use client';

import { useEffect, useRef, useState } from 'react';
import { type BgmTrack, encodeYouTube, fetchYouTubeTitle, parseYouTubeUrl } from '@/lib/music';

export interface SelectedMusic { value: string; title: string }

// 글쓰기: 배경음악 고르기 (앱 배경음악 목록 / 유튜브 링크)
export default function MusicPicker({ tracks, onSelect, onClose }: {
  tracks: BgmTrack[];
  onSelect: (music: SelectedMusic) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'bgm' | 'youtube'>(tracks.length > 0 ? 'bgm' : 'youtube');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [link, setLink] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [checking, setChecking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [found, setFound] = useState<{ videoId: string; start: number } | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePreview = (track: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (previewId === track.id) { audio.pause(); setPreviewId(null); return; }
    audio.src = track.url;
    audio.play().catch(() => {});
    setPreviewId(track.id);
  };

  const checkLink = async () => {
    setLinkError('');
    const parsed = parseYouTubeUrl(link);
    if (!parsed) { setFound(null); setLinkError('유튜브 주소가 아니에요. 유튜브 앱에서 [공유] → [링크 복사] 후 붙여넣어 주세요.'); return; }
    setFound(parsed);
    setChecking(true);
    setYtTitle((await fetchYouTubeTitle(parsed.videoId)) || '');
    setChecking(false);
  };

  const tabBtn = (key: 'bgm' | 'youtube', label: string) => (
    <button onClick={() => setTab(key)} className={`flex-1 py-2.5 text-sm font-bold border-b-2 ${tab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-96 max-h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-bold text-stone-900">🎵 음악 추가</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>
        <div className="flex border-b border-stone-100">
          {tabBtn('bgm', '추천 배경음악')}
          {tabBtn('youtube', '유튜브 링크')}
        </div>

        {tab === 'bgm' ? (
          <div className="overflow-y-auto divide-y divide-stone-100">
            {tracks.length === 0 ? (
              <div className="p-10 text-center text-sm text-stone-400 leading-relaxed">아직 등록된 배경음악이 없어요.<br />유튜브 링크로 음악을 추가해보세요.</div>
            ) : tracks.map(t => (
              <div key={t.id} className="p-3.5 flex items-center gap-3">
                <button onClick={() => togglePreview(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label="미리 듣기">
                  {previewId === t.id ? '❚❚' : '▶'}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
                  {t.artist && <p className="text-xs text-stone-500 truncate">{t.artist}</p>}
                </div>
                <button onClick={() => onSelect({ value: `bgm:${t.id}`, title: t.title })} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">선택</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            <p className="text-sm text-stone-600 leading-relaxed">유튜브에서 듣고 싶은 곡을 찾아 <b>공유 → 링크 복사</b> 후 아래에 붙여넣어 주세요.</p>
            <div className="flex gap-2">
              <input
                value={link}
                onChange={e => { setLink(e.target.value); setFound(null); setLinkError(''); }}
                placeholder="https://youtu.be/..."
                inputMode="url"
                className="flex-1 px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <button onClick={checkLink} disabled={!link.trim() || checking} className="px-4 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40 shrink-0">확인</button>
            </div>
            {linkError && <p className="text-xs text-red-600">{linkError}</p>}
            {found && (
              <div className="flex flex-col gap-2.5 bg-stone-50 border border-stone-200 rounded-2xl p-3">
                <img src={`https://img.youtube.com/vi/${found.videoId}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover rounded-xl bg-stone-200" />
                <label className="text-xs font-bold text-stone-500">곡 제목</label>
                <input
                  value={checking ? '제목 불러오는 중...' : ytTitle}
                  onChange={e => setYtTitle(e.target.value)}
                  placeholder="예: 주님의 기도 (성가)"
                  disabled={checking}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
                <button
                  onClick={() => onSelect({ value: encodeYouTube(found.videoId, found.start), title: ytTitle.trim() || '유튜브 음악' })}
                  disabled={checking}
                  className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40"
                >
                  이 음악 추가하기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
