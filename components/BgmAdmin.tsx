'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadMedia } from '@/lib/upload';
import { BUILTIN_BGM, type BgmTrack } from '@/lib/music';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';

const MAX_MB = 40;
// 올릴 수 있는 음악 파일 (저장소 허가증 app/api/media/token 의 bgm 과 같게)
const EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga'];
const TYPE_EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg' };
const CONTENT_TYPE: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg' };
const DEFAULT_ARTIST = '가톨릭그램';

// 고른 파일 하나 (올리기 전)
interface Picked { key: string; file: File; ext: string; title: string; artist: string; url: string; seconds: number | null; bad?: boolean }

const fileExt = (f: File) => {
  const byName = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
  return EXTS.includes(byName) ? byName : TYPE_EXT[f.type] || byName;
};
// 파일 이름 → 곡 제목 ('잔잔한_피아노 (1).mp3' → '잔잔한 피아노')
const titleFromName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s*\(\d+\)$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const lengthText = (s: number) => `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;

// mp3 안의 꼬리표(ID3: 만든 사람·만든 프로그램의 계정 이름 등)를 빼고 소리만 올린다 — 올린 파일은 누구나 받아 볼 수 있으므로
// (Suno 에서 받은 파일에는 Suno 사용자 이름이 들어 있다). 소리 부분이 바로 이어지지 않는 이상한 파일이면 그대로 올린다
async function stripMp3Tags(file: File): Promise<Blob> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let start = 0;
    while (start + 10 <= buf.length && buf[start] === 0x49 && buf[start + 1] === 0x44 && buf[start + 2] === 0x33) { // 'ID3'
      const size = ((buf[start + 6] & 0x7f) << 21) | ((buf[start + 7] & 0x7f) << 14) | ((buf[start + 8] & 0x7f) << 7) | (buf[start + 9] & 0x7f);
      start += 10 + size + (buf[start + 5] & 0x10 ? 10 : 0);
    }
    let end = buf.length;
    if (end - start > 128 && buf[end - 128] === 0x54 && buf[end - 127] === 0x41 && buf[end - 126] === 0x47) end -= 128; // 끝의 'TAG'
    if (start === 0 && end === buf.length) return file;
    if (start >= end || buf[start] !== 0xff || (buf[start + 1] & 0xe0) !== 0xe0) return file;
    return new Blob([buf.subarray(start, end)], { type: 'audio/mpeg' });
  } catch { return file; }
}

// 관리자 전용 음악 올리기 — 어디서 올리느냐로 공개·비공개가 나뉜다 (운영자 요청)
//  - 공개('게시글 음악 추가·관리'): 게시글 음악 고르기의 '가톨릭그램 음악'에 바로 나와 모든 교우가 씀 (숨기기·지우기)
//  - 비공개(vault, '🔒 보관 음악'): 교우들에게는 안 보이고(bgm_tracks.private + active=false), 나중에 곡마다
//    🎁 선물하기(받은 교우만 내 공간 음악·게시글 음악으로 — components/MusicGift) 또는 📢 공개하기(공개 목록으로 옮김)
// 음악 파일을 고르면(여러 곡도) 제목이 파일 이름으로 채워지고, '추가하기'/'보관하기'를 누르면 올라간다
const VAULT_SETUP = { title: '보관 음악을 준비 중이에요', message: '먼저 supabase/profile-music.sql 을 Supabase SQL Editor 에서 한 번 실행해 주세요.' };
export default function BgmAdmin({ onClose, onChanged, vault = false, onGift, refreshKey = 0 }: {
  onClose: () => void;
  onChanged: () => void;
  vault?: boolean;                     // 비공개 보관 음악
  onGift?: (track: BgmTrack) => void;  // 보관 음악: 🎁 선물하기 (MusicGift)
  refreshKey?: number;                 // 선물하기 창을 닫으면 '선물한 교우 수'를 다시
}) {
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [error, setError] = useState('');
  const [giftCounts, setGiftCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Picked[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef<Picked[]>([]);
  pickedRef.current = picked;

  const load = async () => {
    const { data, error } = await supabase.from('bgm_tracks').select('*').order('sort').order('created_at');
    if (error) { setError('배경음악 목록을 불러오지 못했어요. supabase/music.sql 을 실행했는지 확인해주세요.'); return; }
    const rows = (data || []) as BgmTrack[];
    if (vault) {
      // 보관 음악 칸(private)이 아직 없으면(SQL 전) 올리지 못하게
      const { error: colError } = await supabase.from('bgm_tracks').select('private').limit(1);
      if (colError) { setError(VAULT_SETUP.message); setTracks([]); return; }
      const { data: grants } = await supabase.from('music_grants').select('track_id');
      const counts: Record<string, number> = {};
      (grants || []).forEach(g => { counts[g.track_id as string] = (counts[g.track_id as string] || 0) + 1; });
      setGiftCounts(counts);
    }
    setTracks(rows.filter(t => (vault ? t.private === true : t.private !== true)));
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      pickedRef.current.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, []);
  useEffect(() => { load(); }, [refreshKey]);

  const update = (key: string, patch: Partial<Picked>) => setPicked(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p));

  const addFiles = (list: FileList | File[] | null) => {
    const files = [...(list || [])];
    if (!files.length) return;
    const skipped: string[] = [];
    const added: Picked[] = [];
    for (const file of files) {
      const ext = fileExt(file);
      if (!EXTS.includes(ext)) { skipped.push(`${file.name}: 음악 파일(mp3·m4a·wav)이 아니에요`); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { skipped.push(`${file.name}: ${MAX_MB}MB 넘는 파일은 올릴 수 없어요`); continue; }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const url = URL.createObjectURL(file);
      added.push({ key, file, ext, title: titleFromName(file.name), artist: DEFAULT_ARTIST, url, seconds: null });
      // 길이를 읽어 보며 실제로 틀 수 있는 파일인지도 본다
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => update(key, { seconds: Number.isFinite(probe.duration) ? probe.duration : null });
      probe.onerror = () => update(key, { bad: true });
      probe.src = url;
    }
    setNotice('');
    setPicked(prev => [...prev, ...added]);
    if (fileRef.current) fileRef.current.value = '';
    if (skipped.length) showAlert({ title: '올릴 수 없는 파일이 있어요', message: skipped.join('\n') });
  };

  const unpick = (p: Picked) => {
    if (previewId === p.key) { audioRef.current?.pause(); setPreviewId(null); }
    URL.revokeObjectURL(p.url);
    setPicked(prev => prev.filter(x => x.key !== p.key));
  };

  const upload = async () => {
    const list = picked.filter(p => !p.bad);
    if (!list.length || list.some(p => !p.title.trim())) return;
    audioRef.current?.pause(); setPreviewId(null);
    setUploading({ done: 0, total: list.length });
    const failed: string[] = [];
    // 새로 올린 곡이 맨 위에 (고른 순서대로)
    const top = Math.min(0, ...(tracks || []).map(t => t.sort ?? 0));
    for (const [i, p] of list.entries()) {
      try {
        const body = p.ext === 'mp3' ? await stripMp3Tags(p.file) : p.file;
        const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${p.ext}`;
        const url = await uploadMedia(body, { kind: 'bgm', ext: p.ext, contentType: CONTENT_TYPE[p.ext] || p.file.type || 'audio/mpeg', bucket: 'bgm', path });
        const row: Partial<BgmTrack> = { title: p.title.trim(), artist: p.artist.trim() || null, url, sort: top - list.length + i };
        if (vault) Object.assign(row, { active: false, private: true });
        const { error: insError } = await supabase.from('bgm_tracks').insert(row);
        if (insError) throw insError;
        URL.revokeObjectURL(p.url);
        setPicked(prev => prev.filter(x => x.key !== p.key));
      } catch {
        failed.push(p.title.trim());
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    const ok = list.length - failed.length;
    if (ok) {
      setNotice(vault
        ? `🔒 ${ok}곡을 보관했어요. 교우들에게는 보이지 않아요 — 아래에서 🎁 선물하거나 📢 공개할 수 있어요.`
        : `✅ ${ok}곡을 넣었어요. 글쓰기 › 음악 › '가톨릭그램 음악' 맨 위에 바로 나와요.`);
      load(); onChanged();
    }
    if (failed.length) showAlert({ title: '올리지 못한 곡이 있어요', message: `${failed.join(', ')}\n잠시 후 '${vault ? '보관하기' : '추가하기'}'를 다시 눌러 주세요.` });
  };

  const toggleActive = async (t: BgmTrack) => {
    await supabase.from('bgm_tracks').update({ active: !t.active }).eq('id', t.id);
    setTracks(prev => prev?.map(x => x.id === t.id ? { ...x, active: !t.active } : x) || prev);
    onChanged();
  };

  // 보관 음악 → 공개 목록으로 (모든 교우가 게시글 음악으로 쓸 수 있게)
  const publish = async (t: BgmTrack) => {
    if (!(await askConfirm({ title: `'${t.title}'을(를) 공개할까요?`, message: '모든 교우가 게시글 음악(가톨릭그램 음악)으로 쓸 수 있게 돼요. 선물한 것은 그대로예요.', ok: '공개하기', icon: 'megaphone' }))) return;
    const { error } = await supabase.from('bgm_tracks').update({ private: false, active: true }).eq('id', t.id);
    if (error) { await showAlert({ title: '공개하지 못했어요', message: error.message }); return; }
    setTracks(prev => prev?.filter(x => x.id !== t.id) || prev);
    setNotice(`📢 '${t.title}'을(를) 공개했어요. 이제 '게시글 음악 추가·관리' 목록에 있어요.`);
    onChanged();
  };

  const remove = async (t: BgmTrack) => {
    const gifted = giftCounts[t.id] || 0;
    if (!(await askConfirm(vault
      ? `'${t.title}'을(를) 삭제할까요?\n${gifted ? `선물받은 교우 ${gifted}명의 공간·게시글에서도 ` : ''}이 노래가 나오지 않게 됩니다.`
      : `'${t.title}'을(를) 삭제할까요?\n이 음악을 쓴 게시물에서는 음악이 나오지 않게 됩니다.\n(잠시 숨기려면 '숨기기'를 쓰세요)`))) return;
    const path = t.url.includes('/storage/v1/') ? t.url.split('/bgm/')[1] : null; // 수파베이스 저장소 파일만 (R2 파일은 남겨 둠)
    if (path) await supabase.storage.from('bgm').remove([path]);
    await supabase.from('bgm_tracks').delete().eq('id', t.id);
    setTracks(prev => prev?.filter(x => x.id !== t.id) || prev);
    onChanged();
  };

  const togglePreview = (id: string, url: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewId === id) { audioRef.current.pause(); setPreviewId(null); return; }
    audioRef.current.src = url;
    audioRef.current.onended = () => setPreviewId(null);
    audioRef.current.play().catch(() => {});
    setPreviewId(id);
  };

  const playBtn = (id: string, url: string, size = 'w-9 h-9') => (
    <button type="button" onClick={() => togglePreview(id, url)} className={`${size} rounded-full flex items-center justify-center shrink-0 ${previewId === id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label={previewId === id ? '멈추기' : '미리 듣기'}>
      <Icon name={previewId === id ? 'pause' : 'play'} fill className="w-4 h-4" />
    </button>
  );
  const field = 'w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400';
  const ready = picked.filter(p => !p.bad);

  return (
    <BottomSheet bare label={vault ? '보관 음악' : '음악 관리'} onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900">{vault ? '🔒 보관 음악 (비공개 · 선물용)' : '🎵 게시글 음악 추가·관리 (공개)'}</h2>
            <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">
              {vault
                ? '여기에 올린 곡은 교우들에게 보이지 않아요. 곡마다 🎁 선물하면 받은 교우만 내 공간 배경음악·게시글 음악으로 쓰고, 📢 공개하면 모두가 써요.'
                : '여기에 올린 곡은 모든 교우가 게시글 음악으로 바로 쓸 수 있어요. 나만 보관하려면 내 공간의 🔒 보관 음악에서 올려 주세요.'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1 shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="overflow-y-auto flex flex-col">
          <div className={`p-4 flex flex-col gap-3 border-b border-stone-100 ${vault ? 'bg-amber-50/60' : 'bg-stone-50'}`}>
            {/* 음악 파일 고르기 (컴퓨터는 끌어다 놓아도 됨) */}
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" multiple onChange={e => addFiles(e.target.files)} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              disabled={!!uploading || (vault && !!error)}
              className={`w-full rounded-2xl border-2 border-dashed px-4 py-5 flex flex-col items-center gap-1.5 transition-colors disabled:opacity-50 ${dragOver ? 'border-violet-500 bg-violet-50' : vault ? 'border-amber-300 bg-white active:bg-amber-50' : 'border-violet-300 bg-white active:bg-violet-50'}`}
            >
              <span className={`w-12 h-12 rounded-full flex items-center justify-center ${vault ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}><Icon name={vault ? 'lock' : 'music'} className="w-6 h-6" /></span>
              <span className="text-base font-bold text-stone-900">{picked.length ? '＋ 음악 파일 더 고르기' : vault ? '보관할 음악 파일 고르기' : '음악 파일 고르기'}</span>
              <span className="text-xs text-stone-500">mp3·m4a·wav · 한 번에 여러 곡도 돼요 · 한 곡 {MAX_MB}MB까지</span>
            </button>

            {picked.map(p => (
              <div key={p.key} className={`rounded-xl border bg-white p-3 flex flex-col gap-2 ${p.bad ? 'border-red-200' : 'border-stone-200'}`}>
                <div className="flex items-center gap-2.5">
                  {p.bad ? <span className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0 font-bold">!</span> : playBtn(p.key, p.url)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-500 truncate">{p.file.name}</p>
                    <p className={`text-xs ${p.bad ? 'text-red-600 font-bold' : 'text-stone-400'}`}>
                      {p.bad ? '이 파일은 재생할 수 없어요. 다른 파일을 골라 주세요.' : `${p.seconds ? lengthText(p.seconds) + ' · ' : ''}${(p.file.size / 1024 / 1024).toFixed(1)}MB`}
                    </p>
                  </div>
                  <button type="button" onClick={() => unpick(p)} disabled={!!uploading} className="w-8 h-8 rounded-full text-stone-400 hover:text-stone-700 font-bold text-lg shrink-0 disabled:opacity-40" aria-label="빼기">×</button>
                </div>
                {!p.bad && (
                  <>
                    <label className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs font-bold text-stone-600">곡 제목</span>
                      <input value={p.title} onChange={e => update(p.key, { title: e.target.value })} placeholder="예: 잔잔한 피아노" maxLength={60} className={field} />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs font-bold text-stone-600">만든 이</span>
                      <input value={p.artist} onChange={e => update(p.key, { artist: e.target.value })} placeholder="비워 두어도 돼요" maxLength={40} className={field} />
                    </label>
                  </>
                )}
              </div>
            ))}

            {ready.length > 0 && (
              <button onClick={upload} disabled={!!uploading || ready.some(p => !p.title.trim())} className="w-full py-3.5 rounded-xl bg-stone-900 text-white text-base font-bold disabled:opacity-40">
                {uploading ? `올리는 중… (${uploading.done}/${uploading.total})` : `${ready.length > 1 ? `${ready.length}곡 ` : ''}${vault ? '보관하기 (비공개)' : '추가하기 (공개)'}`}
              </button>
            )}
            {notice && <p className="text-sm font-bold text-emerald-700 leading-relaxed">{notice}</p>}
            <p className="text-[0.6875rem] text-stone-400 leading-snug">직접 만든 곡이나 쓸 수 있는 곡(저작권이 끝난 성가·클래식 연주, 무료 음원)만 올려 주세요. mp3 파일 안의 만든 사람·계정 정보는 빼고 올려요.</p>
          </div>

          <p className="px-4 pt-4 pb-1 text-xs font-bold text-stone-500">{vault ? '보관한 음악' : '올린 음악'} {tracks?.length ? `${tracks.length}곡` : ''}</p>
          {error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : !tracks ? (
            <div className="p-8 text-center text-sm text-stone-400">불러오는 중...</div>
          ) : tracks.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-stone-400">{vault ? '아직 보관한 음악이 없어요.' : '아직 올린 음악이 없어요.'}</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {tracks.map(t => vault ? (
                <div key={t.id} className="p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    {playBtn(t.id, t.url)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{t.title}</p>
                      <p className="text-xs text-stone-500 truncate">{giftCounts[t.id] ? `🎁 ${giftCounts[t.id]}명에게 선물함` : '🔒 아직 아무에게도 안 보여요'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 pl-12">
                    <button onClick={() => onGift?.(t)} className="flex-1 text-xs py-2 rounded-lg bg-rose-500 text-white font-bold">🎁 선물하기</button>
                    <button onClick={() => publish(t)} className="flex-1 text-xs py-2 rounded-lg border border-violet-200 text-violet-800 font-bold">📢 공개하기</button>
                    <button onClick={() => remove(t)} className="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600">삭제</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className={`p-3.5 flex items-center gap-3 ${t.active ? '' : 'opacity-50'}`}>
                  {playBtn(t.id, t.url)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-800 truncate">{t.title}{!t.active && ' (숨김)'}</p>
                    {t.artist && <p className="text-xs text-stone-500 truncate">{t.artist}</p>}
                  </div>
                  <button onClick={() => toggleActive(t)} className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 shrink-0">{t.active ? '숨기기' : '보이기'}</button>
                  <button onClick={() => remove(t)} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 shrink-0">삭제</button>
                </div>
              ))}
            </div>
          )}
          {!vault && (
            <p className="px-4 pt-3 pb-5 text-xs text-stone-400 leading-relaxed">
              앱에 기본으로 들어 있는 곡: {BUILTIN_BGM.map(t => t.title).join(' · ')} (올린 음악 아래에 나와요)
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
