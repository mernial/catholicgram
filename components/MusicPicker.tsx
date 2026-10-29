'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import MusicSegmentPicker from '@/components/MusicSegmentPicker';
import { type BgmTrack, encodeBgm, encodeYouTube, fetchYouTubeTitle, parseYouTubeUrl, youTubeEmbedUrl } from '@/lib/music';
import Icon from '@/components/Icon';
import BottomSheet from '@/components/BottomSheet';
import { ADMIN_EMAILS } from '@/lib/admin';

interface YouTubeResult { videoId: string; title: string; channel: string; thumbnail: string; duration: string; topic?: boolean }

// 노래 검색이 안 될 때 관리자에게만 보이는 고칠 곳 (/api/youtube/search 의 error)
const ADMIN_FIX: Record<string, string> = {
  not_configured: 'Vercel 환경 변수에 YOUTUBE_API_KEY 가 없어요. 넣은 뒤 Redeploy 해 주세요.',
  key_invalid: 'Vercel 의 YOUTUBE_API_KEY 가 틀렸거나 지워진 키예요. 구글 클라우드 → 사용자 인증 정보에서 키를 확인해 다시 넣고 Redeploy 해 주세요.',
  api_disabled: '구글 클라우드에서 YouTube Data API v3 가 꺼져 있어요. API 라이브러리에서 [사용]을 눌러 주세요.',
  key_blocked: '키의 \'애플리케이션 제한사항\'이 웹사이트·앱으로 걸려 있어 서버 검색이 막혀요. \'없음\'으로 바꿔 주세요. (API 제한은 YouTube Data API v3 만 두면 돼요)',
  quota: '하루 검색 한도(10,000, 검색 약 100번)를 다 썼어요. 구글 클라우드 → 할당량에서 사용량을 볼 수 있어요.',
};

const QUICK_SEARCHES = ['가톨릭 성가', '생활성가', '묵상 음악', '떼제 성가', '그레고리오 성가', '아베 마리아'];

export interface SelectedMusic { value: string; title: string }
// 구간 고르기 대상: 유튜브 곡(videoId) 또는 앱 배경음악(trackId + audioUrl)
export interface MusicSegmentTarget { videoId?: string; trackId?: string; audioUrl?: string; title: string; start: number; clip?: number }

// 글쓰기: 배경음악 고르기 (앱 배경음악 목록 / 노래 검색 · 유튜브 뮤직 링크)
export default function MusicPicker({ tracks, initialSegment, onSelect, onClose, onAddMusic }: {
  tracks: BgmTrack[];
  onAddMusic?: () => void; // 관리자에게만: '가톨릭그램 음악'에 음악 파일 올리기 (BgmAdmin)
  initialSegment?: MusicSegmentTarget | null; // 이미 고른 곡의 구간만 다시 고치기
  onSelect: (music: SelectedMusic) => void;
  onClose: () => void;
}) {
  // 가톨릭그램 음악(관리자가 넣은 곡·앱 기본 곡)이 있으면 그것부터
  const [tab, setTab] = useState<'bgm' | 'youtube'>(tracks.length > 0 ? 'bgm' : 'youtube');

  // 노래 검색 (유튜브 뮤직·유튜브의 음악)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [adminFix, setAdminFix] = useState('');
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  // 유튜브 곡을 고른 뒤 구간 고르기
  const [segmentFor, setSegmentFor] = useState<MusicSegmentTarget | null>(initialSegment || null);
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

  const search = async (text = query) => {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setSearching(true); setSearchError(''); setAdminFix(''); setPreviewVideo(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSearching(false);
    if (res?.ok) { setResults(json.results || []); return; }
    setResults(null);
    // 검색이 안 되면 유튜브 뮤직 링크로 넣는 칸을 바로 펼친다
    setShowLinkInput(true);
    const error: string = json.error || '';
    if (session?.user.email && ADMIN_EMAILS.includes(session.user.email)) {
      setAdminFix(ADMIN_FIX[error] || `구글 응답: ${json.reason || error || (res ? res.status : '연결 안 됨')}`);
    }
    if (error === 'not_configured') { setSearchUnavailable(true); return; }
    setSearchError(
      error === 'quota' ? '오늘 노래 검색 한도를 다 썼어요. 한국 시간 오후 4~5시에 다시 채워져요. 그동안은 아래 유튜브 뮤직 링크로 넣어 주세요.'
        : error === 'unauthorized' ? '로그인이 풀렸어요. 다시 로그인한 뒤 검색해 주세요.'
        : error && error !== 'search_failed' ? '지금은 노래 검색이 안 돼요. 아래 유튜브 뮤직 링크로 넣어 주세요.'
        : '검색하지 못했어요. 잠시 후 다시 해 보시거나 아래 유튜브 뮤직 링크로 넣어 주세요.');
  };

  const checkLink = async (text = link) => {
    setLinkError('');
    const parsed = parseYouTubeUrl(text);
    if (!parsed) {
      setFound(null);
      setLinkError(/[?&]list=/.test(text)
        ? '노래 하나의 링크를 넣어 주세요. 앨범·재생목록 링크는 안 돼요. (노래 옆 ⋮ → 공유 → 링크 복사)'
        : '유튜브 뮤직(또는 유튜브) 주소가 아니에요. 노래 옆 ⋮ → 공유 → 링크 복사 후 붙여넣어 주세요.');
      return;
    }
    setFound(parsed);
    setChecking(true);
    setYtTitle((await fetchYouTubeTitle(parsed.videoId)) || '');
    setChecking(false);
  };

  // 유튜브 뮤직에서 복사해 온 링크를 한 번에 붙여넣기 (안 되면 입력칸을 꾹 눌러 붙여넣기)
  const linkInputRef = useRef<HTMLInputElement>(null);
  const pasteLink = async () => {
    const text = await navigator.clipboard?.readText?.().catch(() => '') || '';
    if (!text.trim()) {
      setLinkError('입력칸을 꾹 눌러 [붙여넣기]를 눌러 주세요.');
      linkInputRef.current?.focus();
      return;
    }
    setLink(text.trim());
    checkLink(text.trim());
  };
  const musicSearchUrl = `https://music.youtube.com/${query.trim() ? `search?q=${encodeURIComponent(query.trim())}` : ''}`;

  const tabBtn = (key: 'bgm' | 'youtube', label: string) => (
    <button onClick={() => setTab(key)} className={`flex-1 py-2.5 text-sm font-bold border-b-2 ${tab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>{label}</button>
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
              key={segmentFor.trackId || segmentFor.videoId}
              videoId={segmentFor.videoId}
              audioUrl={segmentFor.audioUrl}
              title={segmentFor.title}
              initialStart={segmentFor.start}
              initialClip={segmentFor.clip}
              onBack={() => setSegmentFor(null)}
              onConfirm={(start, clip) => onSelect({
                value: segmentFor.trackId ? encodeBgm(segmentFor.trackId, start, clip) : encodeYouTube(segmentFor.videoId!, start, clip),
                title: segmentFor.title,
              })}
            />
          </div>
        ) : (<>
        <div className="flex border-b border-stone-100">
          {tabBtn('bgm', '가톨릭그램 음악')}
          {tabBtn('youtube', '유튜브 뮤직에서 찾기')}
        </div>

        {tab === 'bgm' ? (
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
            {tracks.length === 0 ? (
              <div className="p-10 text-center text-sm text-stone-400 leading-relaxed">아직 등록된 배경음악이 없어요.<br />(관리자: 설정 › 게시글 음악 추가·관리)<br />유튜브 뮤직에서 찾아 넣을 수도 있어요.</div>
            ) : tracks.map(t => (
              <div key={t.id} className="p-3.5 flex items-center gap-3">
                <button onClick={() => togglePreview(t)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label="미리 듣기">
                  <Icon name={previewId === t.id ? 'pause' : 'play'} fill className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
                  {t.artist && <p className="text-xs text-stone-500 truncate">{t.artist}</p>}
                </div>
                <button onClick={() => { audioRef.current?.pause(); setPreviewId(null); setSegmentFor({ trackId: t.id, audioUrl: t.url, title: t.title, start: 0 }); }} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">선택</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto flex flex-col">
            {!searchUnavailable && (
              <div className="p-4 flex flex-col gap-2.5 border-b border-stone-100">
                <form onSubmit={e => { e.preventDefault(); search(); }} className="flex gap-2">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="노래 제목, 성가, 가수 검색"
                    type="search"
                    autoComplete="off"
                    enterKeyHint="search"
                    className="flex-1 px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  <button type="submit" disabled={!query.trim() || searching} className="px-4 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40 shrink-0">검색</button>
                </form>
                {!results && (
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SEARCHES.map(q => (
                      <button key={q} onClick={() => search(q)} className="text-xs px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-800 border border-violet-100">{q}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {searching && <div className="p-8 text-center text-sm text-stone-400">검색 중...</div>}
            {searchError && <p className="p-4 text-sm text-red-600 leading-relaxed">{searchError}</p>}
            {adminFix && <p className="mx-4 mb-1 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed"><b>관리자에게만 보여요</b> · {adminFix}</p>}
            {!searching && results && results.length === 0 && <div className="p-8 text-center text-sm text-stone-400">검색 결과가 없어요.</div>}
            {!searching && results && results.length > 0 && (
              <div className="divide-y divide-stone-100">
                {results.map(r => (
                  <div key={r.videoId} className="p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPreviewVideo(previewVideo === r.videoId ? null : r.videoId)} className="relative w-28 shrink-0 rounded-lg overflow-hidden bg-stone-200" aria-label="미리 듣기">
                        <img loading="lazy" src={r.thumbnail} alt="" className="w-full aspect-video object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg bg-black/25"><Icon name={previewVideo === r.videoId ? 'pause' : 'play'} fill className="w-6 h-6" /></span>
                        {r.duration && <span className="absolute bottom-1 right-1 text-[0.6875rem] text-white bg-black/70 rounded px-1">{r.duration}</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-800 line-clamp-2 leading-snug">{r.title}</p>
                        <p className="text-xs text-stone-500 truncate mt-0.5">
                          {r.topic && <span className="inline-block mr-1 px-1.5 py-px rounded bg-red-50 text-red-700 font-bold align-[0.05em]">유튜브 뮤직 음원</span>}
                          {r.channel}
                        </p>
                      </div>
                      <button onClick={() => { setPreviewVideo(null); setSegmentFor({ videoId: r.videoId, title: r.title, start: 0 }); }} className="text-xs px-3 py-2 rounded-lg bg-stone-900 text-white font-bold shrink-0">선택</button>
                    </div>
                    {previewVideo === r.videoId && (
                      <iframe src={youTubeEmbedUrl(r.videoId)} title={r.title} allow="autoplay; encrypted-media" className="w-full aspect-video rounded-lg" />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 flex flex-col gap-3 border-t border-stone-100">
              {!showLinkInput ? (
                <button onClick={() => setShowLinkInput(true)} className="w-full py-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-bold text-stone-700 flex items-center justify-center gap-1.5">
                  <Icon name="music" className="w-4 h-4 text-red-600" />유튜브 뮤직 앱에서 고른 노래 넣기
                </button>
              ) : (
                <>
                  <p className="text-sm font-bold text-stone-800">유튜브 뮤직에서 고른 노래 넣기</p>
                  <ol className="text-sm text-stone-600 leading-relaxed list-decimal pl-5 flex flex-col gap-0.5">
                    <li>아래 <b>유튜브 뮤직 열기</b>를 눌러 노래를 찾아요</li>
                    <li>노래 옆 <b>⋮ → 공유 → 링크 복사</b></li>
                    <li>여기로 돌아와 <b>붙여넣기</b>를 눌러요</li>
                  </ol>
                  <div className="flex gap-2">
                    <a href={musicSearchUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold text-center">유튜브 뮤직 열기 ↗</a>
                    <button onClick={pasteLink} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold">📋 붙여넣기</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={linkInputRef}
                      value={link}
                      onChange={e => { setLink(e.target.value); setFound(null); setLinkError(''); }}
                      placeholder="https://music.youtube.com/watch?v=..."
                      inputMode="url"
                      autoComplete="off"
                      className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
                    />
                    <button onClick={() => checkLink()} disabled={!link.trim() || checking} className="px-4 rounded-xl bg-stone-200 text-stone-800 text-sm font-bold disabled:opacity-40 shrink-0">확인</button>
                  </div>
                  {linkError && <p className="text-xs text-red-600">{linkError}</p>}
                  {found && (
                    <div className="flex flex-col gap-2.5 bg-stone-50 border border-stone-200 rounded-2xl p-3">
                      <img loading="lazy" src={`https://img.youtube.com/vi/${found.videoId}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover rounded-xl bg-stone-200" />
                      <label className="text-xs font-bold text-stone-500">곡 제목</label>
                      <input
                        value={checking ? '제목 불러오는 중...' : ytTitle}
                        onChange={e => setYtTitle(e.target.value)}
                        placeholder="예: 주님의 기도 (성가)"
                        disabled={checking}
                        className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
                      />
                      <button
                        onClick={() => setSegmentFor({ videoId: found.videoId, title: ytTitle.trim() || '유튜브 뮤직 노래', start: found.start })}
                        disabled={checking}
                        className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40"
                      >
                        다음: 30초 구간 고르기
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        </>)}
      </div>
    </BottomSheet>
  );
}
