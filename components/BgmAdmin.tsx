'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BgmTrack } from '@/lib/music';

const MAX_MB = 20;

// 관리자 전용: 게시물에 넣을 수 있는 배경음악 목록 관리
export default function BgmAdmin({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase.from('bgm_tracks').select('*').order('sort').order('created_at');
    if (error) { setError('배경음악 목록을 불러오지 못했어요. supabase/music.sql 을 실행했는지 확인해주세요.'); return; }
    setTracks((data || []) as BgmTrack[]);
  };

  useEffect(() => {
    load();
    return () => { audioRef.current?.pause(); };
  }, []);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { alert(`${MAX_MB}MB 이하의 파일만 올릴 수 있어요.`); e.target.value = ''; return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const upload = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upError } = await supabase.storage.from('bgm').upload(path, file, { contentType: file.type || 'audio/mpeg' });
    if (upError) { setUploading(false); alert('파일을 올리지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
    const { data: { publicUrl } } = supabase.storage.from('bgm').getPublicUrl(path);
    const { error: insError } = await supabase.from('bgm_tracks').insert({ title: title.trim(), artist: artist.trim() || null, url: publicUrl, sort: tracks?.length || 0 });
    setUploading(false);
    if (insError) { alert('저장하지 못했어요.'); return; }
    setFile(null); setTitle(''); setArtist('');
    if (fileRef.current) fileRef.current.value = '';
    load(); onChanged();
  };

  const toggleActive = async (t: BgmTrack) => {
    await supabase.from('bgm_tracks').update({ active: !t.active }).eq('id', t.id);
    setTracks(prev => prev?.map(x => x.id === t.id ? { ...x, active: !t.active } : x) || prev);
    onChanged();
  };

  const remove = async (t: BgmTrack) => {
    if (!window.confirm(`'${t.title}'을(를) 삭제할까요?\n이 음악을 쓴 게시물에서는 음악이 나오지 않게 됩니다.\n(잠시 숨기려면 '숨기기'를 쓰세요)`)) return;
    const path = t.url.split('/bgm/')[1];
    if (path) await supabase.storage.from('bgm').remove([path]);
    await supabase.from('bgm_tracks').delete().eq('id', t.id);
    setTracks(prev => prev?.filter(x => x.id !== t.id) || prev);
    onChanged();
  };

  const togglePreview = (t: BgmTrack) => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewId === t.id) { audioRef.current.pause(); setPreviewId(null); return; }
    audioRef.current.src = t.url;
    audioRef.current.play().catch(() => {});
    setPreviewId(t.id);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-96 max-h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-bold text-stone-900">🎵 배경음악 관리</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>
        <div className="overflow-y-auto">
          <div className="p-4 flex flex-col gap-2.5 border-b border-stone-100 bg-stone-50">
            <p className="text-xs text-stone-600 leading-relaxed">
              저작권 걱정 없는 곡만 올려주세요. (예: <b>Pixabay Music</b>, <b>YouTube 오디오 보관함</b>의 무료 곡, 저작권이 끝난 성가·클래식 연주)
            </p>
            <input ref={fileRef} type="file" accept="audio/*" onChange={pickFile} className="text-sm" />
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="곡 제목 (예: 아베 마리아)" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="연주자 / 출처 (선택)" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <button onClick={upload} disabled={!file || !title.trim() || uploading} className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">
              {uploading ? '올리는 중...' : '배경음악 추가'}
            </button>
          </div>
          {error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : !tracks ? (
            <div className="p-8 text-center text-sm text-stone-400">불러오는 중...</div>
          ) : tracks.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-400">등록된 배경음악이 없어요.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {tracks.map(t => (
                <div key={t.id} className={`p-3.5 flex items-center gap-3 ${t.active ? '' : 'opacity-50'}`}>
                  <button onClick={() => togglePreview(t)} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${previewId === t.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label="미리 듣기">
                    {previewId === t.id ? '❚❚' : '▶'}
                  </button>
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
        </div>
      </div>
    </div>
  );
}
