import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';

// 올린 파일은 이름이 매번 새로 정해지고 바뀌지 않으므로 휴대폰이 1년 동안 다시 받지 않게 한다 (전송량 절약)
export const UPLOAD_CACHE = '31536000';
// 휴대폰 화면(폭 약 1200px)에 충분한 크기로 줄인다
export const PHOTO_OPTIONS = { maxSizeMB: 0.6, maxWidthOrHeight: 1440, initialQuality: 0.82, useWebWorker: true };

export type MediaKind = 'posts' | 'videos' | 'posters' | 'avatars' | 'stories' | 'dm' | 'feedback' | 'letters' | 'sponsor' | 'bgm';

// 파일 하나 올리기 → 공개 주소.
// Cloudflare R2 가 설정돼 있으면 R2 로(내려받는 전송량 무료), 아니면 예전처럼 수파베이스 저장소(bucket/path)로.
export async function uploadMedia(file: Blob, opts: { kind: MediaKind; ext: string; contentType: string; bucket: string; path: string }): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/media/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ kind: opts.kind, ext: opts.ext }),
  }).catch(() => null);
  const ticket = res?.ok ? await res.json().catch(() => null) as { enabled?: boolean; uploadUrl?: string; token?: string; publicUrl?: string } | null : null;
  if (ticket?.enabled && ticket.uploadUrl && ticket.token && ticket.publicUrl) {
    const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${ticket.token}`, 'Content-Type': opts.contentType }, body: file });
    if (!put.ok) throw new Error(`upload failed (${put.status})`);
    return ticket.publicUrl;
  }
  const { error } = await supabase.storage.from(opts.bucket).upload(opts.path, file, { contentType: opts.contentType, cacheControl: UPLOAD_CACHE });
  if (error) throw error;
  return supabase.storage.from(opts.bucket).getPublicUrl(opts.path).data.publicUrl;
}

// 사진 한 장을 줄여서(0.6MB, 긴 쪽 1440px 이하) 공개 사진 저장소에 올리고 주소를 돌려준다.
// prefix: 파일 이름 앞부분 (예: 'dm', 'feedback'). 주소는 무작위 이름이라 링크를 아는 사람만 볼 수 있다.
export async function uploadPhoto(file: File, prefix: string): Promise<string> {
  const compressed = await imageCompression(file, PHOTO_OPTIONS);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); // 짐작할 수 없는 이름
  const name = `${prefix}_${Date.now()}_${rand}.jpg`;
  return uploadMedia(compressed, { kind: prefix === 'dm' ? 'dm' : prefix === 'letters' ? 'letters' : 'feedback', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: name });
}

// 사진만 보낸 메시지·건의의 글 자리 표시 (목록 미리보기·알림에 '📷 사진'으로 보임)
export const PHOTO_ONLY_TEXT = '📷 사진';
