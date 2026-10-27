'use client';

import { useEffect, useMemo, useState } from 'react';
import { uploadMedia, uploadPhoto, isVideoUrl, PHOTO_ONLY_TEXT, VIDEO_ONLY_TEXT, photoBundleText } from '@/lib/upload';
import { MAX_VIDEO_MB, SHRINK_OVER_MB, shrinkVideo } from '@/lib/video';

// 대화방(1:1 메시지·단체 채팅방·사랑방) 공통: 사진·동영상 보내기와 보여 주기
//  - 사진을 여러 장 고르면 '묶어서 한 번에'(한 메시지에 바둑판) 또는 '한 장씩 따로' 중 고른다
//  - 동영상은 늘 하나씩 따로 (12MB 넘으면 720p로 줄이고, 45MB 넘으면 못 보냄)
//  - 입력칸에 쓴 글은 첫 번째와 함께, 상대에게 가는 휴대폰 알림은 한 번만

export const MEDIA_SETUP_HINT = '사진 묶음·단체방·사랑방 사진 보내기를 준비 중이에요. (관리자: supabase/chat-media-menu.sql 실행 필요)';
export const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(e.message || ''));

export interface MediaRow { content: string; image_url: string; images?: string[] }
export type InsertMedia = (row: MediaRow) => Promise<{ id: string | number | null; error: { code?: string; message: string } | null }>;

const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
const isPhotoFile = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name);

const uploadVideo = async (file: File, userId: string, onShrink: (ratio: number) => void) => {
  let video: Blob = file;
  if (file.size > SHRINK_OVER_MB * 1024 * 1024) {
    const shrunk = await shrinkVideo(file, onShrink).catch(() => null);
    if (shrunk && shrunk.size < file.size) video = shrunk;
  }
  if (video.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error('too-big');
  const ext = video.type.includes('webm') ? 'webm' : video.type.includes('quicktime') ? 'mov' : 'mp4';
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  return uploadMedia(video, { kind: 'videos', ext, contentType: video.type || 'video/mp4', bucket: 'post-videos', path: `${userId}/dm_${Date.now()}_${rand}.${ext}` });
};

type Progress = { done: number; total: number; note?: string };

export function useChatMedia({ userId, getText, clearText, insert, onSent }: {
  userId: string | null | undefined;
  getText: () => string;           // 입력칸 글 (첫 번째와 함께 보냄)
  clearText: () => void;
  insert: InsertMedia;              // 메시지 한 줄 넣기 (화면 갱신도 여기서)
  onSent?: (firstId: string | number) => void; // 휴대폰 알림 (한 번)
}) {
  const [pending, setPending] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const run = async (files: File[], bundle: boolean) => {
    if (!userId) return;
    setPending(null);
    const photos = files.filter(f => !isVideoFile(f));
    const videos = files.filter(isVideoFile);
    let text = getText().trim();
    let firstId: string | number | null = null;
    const failed: string[] = [];
    let stop = false;   // 사진 칸이 아예 없음 (SQL 실행 전) → 그만
    let hinted = false;
    const total = (bundle && photos.length > 1 ? 1 : photos.length) + videos.length;
    let done = 0;
    const put = async (row: MediaRow): Promise<'ok' | 'missing'> => {
      const { id, error } = await insert({ ...row, content: text || row.content });
      if (error) {
        if (isMissingColumn(error)) { if (!hinted) { hinted = true; alert(MEDIA_SETUP_HINT); } return 'missing'; }
        throw new Error(error.message);
      }
      if (text) { text = ''; clearText(); }
      if (firstId === null && id !== null) firstId = id;
      return 'ok';
    };
    if (bundle && photos.length > 1) {
      // 묶음: 모두 올린 뒤 한 메시지로
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setProgress({ done: 0, total, note: `사진 올리는 중 ${i + 1}/${photos.length}` });
        try { urls.push(await uploadPhoto(photos[i], 'dm')); } catch { failed.push('사진'); }
      }
      if (urls.length) {
        try {
          const r = await put({ content: urls.length > 1 ? photoBundleText(urls.length) : PHOTO_ONLY_TEXT, image_url: urls[0], ...(urls.length > 1 ? { images: urls } : {}) });
          // 묶음 칸이 아직 없으면(SQL 실행 전) 올린 사진을 한 장씩이라도 보낸다
          if (r === 'missing') for (const u of urls) { if (await put({ content: PHOTO_ONLY_TEXT, image_url: u }) === 'missing') { stop = true; break; } }
        } catch { failed.push(`사진 ${urls.length}장 묶음`); }
      }
      done = 1;
    } else {
      for (const f of photos) {
        if (stop) break;
        setProgress({ done, total });
        try { if (await put({ content: PHOTO_ONLY_TEXT, image_url: await uploadPhoto(f, 'dm') }) === 'missing') stop = true; } catch { failed.push('사진'); }
        done++;
      }
    }
    for (const f of videos) {
      if (stop) break;
      setProgress({ done, total, note: '동영상 올리는 중' });
      try {
        const url = await uploadVideo(f, userId, r => setProgress({ done, total, note: `동영상 줄이는 중 ${Math.round(r * 100)}%` }));
        if (await put({ content: VIDEO_ONLY_TEXT, image_url: url }) === 'missing') stop = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        failed.push(msg === 'too-big' ? `동영상 (너무 커요, ${MAX_VIDEO_MB}MB까지)` : /bucket|not found/i.test(msg) ? '동영상 (영상 저장소 준비 중)' : '동영상');
      }
      done++;
    }
    setProgress(null);
    if (firstId !== null) onSent?.(firstId);
    if (failed.length) alert(`보내지 못한 것이 있어요.\n${failed.slice(0, 6).map(f => `· ${f}`).join('\n')}\n잠시 후 다시 보내 주세요.`);
  };

  // 사진첩에서 고른 뒤: 사진이 두 장 넘으면 묶을지 물어보고, 아니면 바로 보낸다
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => isPhotoFile(f) || isVideoFile(f));
    e.target.value = '';
    if (files.length === 0 || progress) return;
    if (files.filter(f => !isVideoFile(f)).length >= 2) setPending(files);
    else run(files, false);
  };

  const choice = pending && <BundleChoice files={pending} onBundle={() => run(pending, true)} onEach={() => run(pending, false)} onClose={() => setPending(null)} />;
  const bar = progress && (
    <div className="shrink-0 px-4 pt-2 pb-1 bg-white border-t border-stone-200" role="status" aria-live="polite">
      <p className="text-[0.8125rem] font-bold text-stone-700">
        📤 {progress.total > 1 ? `${progress.total}개 중 ${Math.min(progress.done + 1, progress.total)}번째 보내는 중` : '보내는 중'}{progress.note ? ` · ${progress.note}` : ''}
      </p>
      <div className="mt-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
      </div>
    </div>
  );
  return { onPick, sending: !!progress, choice, bar };
}

// 사진을 여러 장 골랐을 때: 묶어서 / 한 장씩
function BundleChoice({ files, onBundle, onEach, onClose }: { files: File[]; onBundle: () => void; onEach: () => void; onClose: () => void }) {
  const photos = files.filter(f => !isVideoFile(f));
  const videos = files.length - photos.length;
  const previews = useMemo(() => photos.slice(0, 8).map(f => URL.createObjectURL(f)), [files]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);
  return (
    <div className="fixed inset-0 z-[96] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:w-96 bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-3" onClick={e => e.stopPropagation()} role="dialog" aria-label="사진 보내는 방법">
        <h3 className="font-bold text-[1.125rem] text-stone-900">사진 {photos.length}장을 어떻게 보낼까요?</h3>
        <div className="grid grid-cols-4 gap-1">
          {previews.map((u, i) => (
            <span key={u} className="relative aspect-square rounded-lg overflow-hidden bg-stone-100">
              <img src={u} alt="" className="w-full h-full object-cover" />
              {i === 7 && photos.length > 8 && <span className="absolute inset-0 bg-black/45 text-white font-bold flex items-center justify-center">+{photos.length - 8}</span>}
            </span>
          ))}
        </div>
        <button onClick={onBundle} className="w-full text-left px-4 py-3.5 rounded-2xl bg-stone-900 text-white">
          <span className="block font-bold text-[1rem]">📚 묶어서 한 번에 보내기</span>
          <span className="block text-[0.8125rem] text-white/70 mt-0.5">사진 {photos.length}장을 한 메시지에 바둑판처럼 모아서</span>
        </button>
        <button onClick={onEach} className="w-full text-left px-4 py-3.5 rounded-2xl border-2 border-stone-200">
          <span className="block font-bold text-[1rem] text-stone-900">🖼 한 장씩 따로 보내기</span>
          <span className="block text-[0.8125rem] text-stone-500 mt-0.5">사진마다 메시지 하나씩 크게</span>
        </button>
        {videos > 0 && <p className="text-[0.8125rem] text-stone-500">함께 고른 동영상 {videos}개는 따로따로 보내져요.</p>}
        <button onClick={onClose} className="py-2.5 text-stone-500 font-bold">취소</button>
      </div>
    </div>
  );
}

// 말풍선 안의 사진·동영상: 묶음이면 바둑판(9장까지 보이고 나머지는 +N), 누르면 크게 보며 넘기기
export function ChatMediaView({ imageUrl, images, onOpen, className = '' }: {
  imageUrl?: string | null;
  images?: string[] | null;
  onOpen: (images: string[], index: number) => void;
  className?: string;
}) {
  const list = images && images.length > 1 ? images : null;
  if (list) {
    const n = list.length;
    const cols = n === 2 || n === 4 ? 2 : 3;
    const shown = list.slice(0, 9);
    return (
      <div className={`grid gap-0.5 rounded-xl overflow-hidden w-[min(64vw,16rem)] ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="group" aria-label={`사진 ${n}장`}>
        {shown.map((u, i) => (
          <button key={u + i} type="button" onClick={e => { e.stopPropagation(); onOpen(list, i); }} className="relative aspect-square bg-stone-200" aria-label={`사진 ${i + 1}/${n} 크게 보기`}>
            <img loading="lazy" src={u} alt="" className="w-full h-full object-cover" />
            {i === 8 && n > 9 && <span className="absolute inset-0 bg-black/45 text-white text-xl font-bold flex items-center justify-center">+{n - 9}</span>}
          </button>
        ))}
      </div>
    );
  }
  if (!imageUrl) return null;
  if (isVideoUrl(imageUrl)) {
    return <video src={`${imageUrl}#t=0.1`} controls playsInline preload="metadata" aria-label="동영상" onClick={e => e.stopPropagation()}
      className={`block w-[min(60vw,16rem)] max-h-80 rounded-xl bg-black ${className}`} />;
  }
  return (
    <img loading="lazy" src={imageUrl} alt="사진" onClick={e => { e.stopPropagation(); onOpen([imageUrl], 0); }}
      className={`block max-w-[min(60vw,16rem)] max-h-80 rounded-xl object-cover cursor-zoom-in ${className}`} />
  );
}
