'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadMedia } from '@/lib/upload';
import type { BgmTrack } from '@/lib/music';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';
import { isSunoLink, sunoAudioUrl, sunoSongId } from '@/lib/suno';

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
  // 🔗 Suno 노래 주소로 넣기 (운영자 요청): 공유 주소를 붙여 넣고 '노래 찾기' → 미리 듣고 '배경음악 추가'
  const [link, setLink] = useState('');
  const [linkAudio, setLinkAudio] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');

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
    setLinkAudio(null); setLinkMsg('');
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  // 노래 파일을 실제로 열 수 있는지 (12초 안에 길이 정보가 오면 됨)
  const canPlay = (src: string) => new Promise<boolean>(resolve => {
    const audio = new Audio();
    const done = (ok: boolean) => { clearTimeout(timer); audio.onloadedmetadata = audio.onerror = null; audio.removeAttribute('src'); audio.load(); resolve(ok); };
    const timer = setTimeout(() => done(false), 12000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(true);
    audio.onerror = () => done(false);
    audio.src = src;
  });

  const findLink = async () => {
    const text = link.trim();
    if (!text) return;
    if (!isSunoLink(text)) { setLinkMsg('Suno 노래 주소가 아니에요. (예: https://suno.com/s/… 또는 https://suno.com/song/…)'); return; }
    setLinkBusy(true); setLinkMsg(''); setLinkAudio(null);
    const direct = sunoSongId(text);
    let audio: string | null = direct ? sunoAudioUrl(direct) : null;
    let found: { title?: string; artist?: string | null } = {};
    try {
      // 짧은 공유 주소(suno.com/s/…)는 서버가 열어 노래 번호를 찾고, 제목도 함께 읽어 온다
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/suno?url=${encodeURIComponent(text)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json().catch(() => null) as { audio?: string; title?: string; artist?: string | null } | null;
      if (res.ok && json?.audio) { audio = json.audio; found = json; }
    } catch { /* 주소에 노래 번호가 있으면 그것으로 */ }
    if (!audio) {
      setLinkBusy(false);
      setLinkMsg('노래를 찾지 못했어요. Suno에서 노래를 열고, 주소창의 전체 주소(suno.com/song/…)를 복사해 붙여 넣어 주세요.');
      return;
    }
    const ok = await canPlay(audio);
    setLinkBusy(false);
    if (!ok) { setLinkMsg('노래 파일을 열지 못했어요. Suno에서 그 노래가 공개(Public)로 되어 있는지 확인해 주세요.'); return; }
    setLinkAudio(audio);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setTitle(prev => prev.trim() || found.title || '');
    setArtist(prev => prev.trim() || found.artist || 'Suno');
    setLinkMsg(found.title ? '✅ 노래를 찾았어요. ▶ 로 들어 보고 아래 \'배경음악 추가\'를 눌러 주세요.' : '✅ 노래를 찾았어요. 곡 제목을 적고 아래 \'배경음악 추가\'를 눌러 주세요.');
  };

  const upload = async () => {
    if ((!file && !linkAudio) || !title.trim()) return;
    setUploading(true);
    const ext = file ? (file.name.split('.').pop() || 'mp3').toLowerCase() : 'mp3';
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    let publicUrl: string;
    if (file) {
      try {
        publicUrl = await uploadMedia(file, { kind: 'bgm', ext, contentType: file.type || 'audio/mpeg', bucket: 'bgm', path });
      } catch { setUploading(false); alert('파일을 올리지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
    } else {
      // Suno 노래: 받아 올 수 있으면 앱 저장소에 한 벌 두고(Suno 에서 지워져도 그대로), 안 되면 Suno 주소 그대로 (그대로도 잘 나옴)
      publicUrl = linkAudio!;
      try {
        const res = await fetch(linkAudio!);
        const blob = res.ok ? await res.blob() : null;
        if (blob && blob.size > 0 && blob.size <= MAX_MB * 1024 * 1024) publicUrl = await uploadMedia(blob, { kind: 'bgm', ext, contentType: 'audio/mpeg', bucket: 'bgm', path });
      } catch { /* Suno 주소 그대로 */ }
    }
    const { error: insError } = await supabase.from('bgm_tracks').insert({ title: title.trim(), artist: artist.trim() || null, url: publicUrl, sort: tracks?.length || 0 });
    setUploading(false);
    if (insError) { alert('저장하지 못했어요.'); return; }
    setFile(null); setTitle(''); setArtist('');
    setLink(''); setLinkAudio(null); setLinkMsg('');
    if (fileRef.current) fileRef.current.value = '';
    load(); onChanged();
  };

  const toggleActive = async (t: BgmTrack) => {
    await supabase.from('bgm_tracks').update({ active: !t.active }).eq('id', t.id);
    setTracks(prev => prev?.map(x => x.id === t.id ? { ...x, active: !t.active } : x) || prev);
    onChanged();
  };

  const remove = async (t: BgmTrack) => {
    if (!(await askConfirm(`'${t.title}'을(를) 삭제할까요?\n이 음악을 쓴 게시물에서는 음악이 나오지 않게 됩니다.\n(잠시 숨기려면 '숨기기'를 쓰세요)`))) return;
    const path = t.url.includes('/storage/v1/') ? t.url.split('/bgm/')[1] : null; // 수파베이스 저장소 파일만 (R2 파일은 남겨 둠)
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
    <BottomSheet bare label="음악 관리" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
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
            {/* 🔗 Suno 노래 주소로 넣기 */}
            <div className="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-2.5">
              <p className="text-xs font-bold text-stone-700">🔗 또는 Suno 노래 주소로 넣기</p>
              <div className="flex gap-1.5">
                <input value={link} onChange={e => { setLink(e.target.value); setLinkMsg(''); setLinkAudio(null); }} placeholder="https://suno.com/s/…" inputMode="url" autoComplete="off"
                  className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" aria-label="Suno 노래 주소" />
                {linkAudio && (
                  <button type="button" onClick={() => togglePreview({ id: 'link', title: title || 'Suno', url: linkAudio })} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${previewId === 'link' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`} aria-label="찾은 노래 미리 듣기">
                    {previewId === 'link' ? '❚❚' : '▶'}
                  </button>
                )}
                <button type="button" onClick={findLink} disabled={!link.trim() || linkBusy} className="shrink-0 px-3.5 rounded-xl bg-stone-800 text-white text-sm font-bold disabled:opacity-40">{linkBusy ? '찾는 중…' : '노래 찾기'}</button>
              </div>
              {linkMsg && <p className={`text-xs leading-relaxed ${linkMsg.startsWith('✅') ? 'text-emerald-700' : 'text-red-600'}`}>{linkMsg}</p>}
              <p className="text-[0.6875rem] text-stone-400 leading-snug">직접 만든 곡을 넣어 주세요. Suno 무료 요금제로 만든 곡은 Suno 약관상 비상업 용도로만 쓸 수 있어요.</p>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="곡 제목 (예: 아베 마리아)" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="연주자 / 출처 (선택)" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <button onClick={upload} disabled={(!file && !linkAudio) || !title.trim() || uploading} className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">
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
    </BottomSheet>
  );
}
