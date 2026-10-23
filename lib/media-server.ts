// 서버 전용: Cloudflare R2 저장소(Worker) 허가증 만들기·파일 올리기/지우기
// 환경 변수 (Vercel): NEXT_PUBLIC_MEDIA_URL = Worker 주소, R2_UPLOAD_SECRET = Worker 의 UPLOAD_SECRET 과 같은 값
import { createHmac, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const mediaBase = () => (process.env.NEXT_PUBLIC_MEDIA_URL || '').replace(/\/+$/, '');
export const mediaEnabled = () => !!(mediaBase() && process.env.R2_UPLOAD_SECRET);

// 허가증: "만료시각.서명" (서명 = HMAC(방법\n경로\n만료시각))
export function mediaToken(method: 'PUT' | 'DELETE', key: string, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', process.env.R2_UPLOAD_SECRET || '').update(`${method}\n${key}\n${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export const mediaUrl = (key: string) => `${mediaBase()}/${key.split('/').map(encodeURIComponent).join('/')}`;

// 새 파일 경로: 종류/사용자/시각_무작위.확장자 (서버가 정하므로 남의 파일을 덮어쓸 수 없음)
export const newMediaKey = (kind: string, userId: string, ext: string) =>
  `${kind}/${userId}/${Date.now()}_${randomBytes(5).toString('hex')}.${ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'}`;

// R2 주소 → 경로 (우리 저장소 주소가 아니면 null)
export const mediaKeyFromUrl = (url: string | null | undefined) => {
  const base = mediaBase();
  if (!url || !base || !url.startsWith(base + '/')) return null;
  return url.slice(base.length + 1).split('?')[0].split('/').map(decodeURIComponent).join('/');
};

export async function putMedia(key: string, body: ArrayBuffer | Blob, contentType: string) {
  const res = await fetch(mediaUrl(key), { method: 'PUT', headers: { Authorization: `Bearer ${mediaToken('PUT', key)}`, 'Content-Type': contentType }, body });
  if (!res.ok) throw new Error(`R2 올리기 실패 (${res.status}) ${await res.text().catch(() => '')}`);
  return mediaUrl(key);
}

// 글·프로필의 사진 주소는 사용자가 아무 주소나 넣을 수 있으므로, 그 주소의 파일을 지우기 전에 지워도 되는 것만 고른다
// (남의 사진 주소를 내 글에 넣었다가 글을 지워 남의 파일을 지우지 못하게).
// - R2: 경로(종류/사용자/파일)의 사용자가 ownerId 인 것만
// - 예전 저장소(Supabase) post-videos: 경로 앞(사용자 폴더)이 ownerId 인 것만
// - 그리고 다른 글·프로필 사진으로 쓰이고 있으면 지우지 않는다 (경로에 주인이 없는 예전 사진도 이것으로 보호)
export async function filesSafeToDelete(
  admin: SupabaseClient,
  urls: (string | null | undefined)[],
  ownerId: string,
  except: { postId?: string; userId?: string },
) {
  const safe: string[] = [];
  for (const url of new Set(urls.filter((u): u is string => !!u))) {
    const key = mediaKeyFromUrl(url);
    if (key && key.split('/')[1] !== ownerId) continue;
    const video = url.split('/post-videos/')[1];
    if (video && decodeURIComponent(video.split('?')[0]).split('/')[0] !== ownerId) continue;
    if (await usedElsewhere(admin, url, except)) continue;
    safe.push(url);
  }
  return safe;
}

// 이 주소를 다른 글(사진·영상·미리보기), 다른 교우의 프로필 사진, 메시지·사연·건의 사진이 쓰고 있는지
// (확인이 안 되면 쓰는 것으로 본다. 탈퇴할 때는 본인 것은 빼고 센다)
async function usedElsewhere(admin: SupabaseClient, url: string, except: { postId?: string; userId?: string }) {
  const posts = () => {
    let q = admin.from('posts').select('id', { count: 'exact', head: true });
    if (except.postId) q = q.neq('id', except.postId);
    if (except.userId) q = q.neq('user_id', except.userId);
    return q;
  };
  let avatars = admin.from('profiles').select('id', { count: 'exact', head: true }).eq('avatar_url', url);
  if (except.userId) avatars = avatars.neq('id', except.userId);
  const attached = (table: string, owner: string) => {
    let q = admin.from(table).select('id', { count: 'exact', head: true }).eq('image_url', url);
    if (except.userId) q = q.neq(owner, except.userId);
    return q;
  };
  const results = await Promise.all([
    posts().contains('images', [url]), posts().eq('video_url', url), posts().eq('video_poster', url), avatars,
    attached('messages', 'sender_id'), attached('letters', 'user_id'), attached('feedback', 'user_id'),
  ]);
  return results.some(r => !!r.error || (r.count || 0) > 0);
}

// 지운 메시지 보관함(관리자 확인용)은 30일까지만: 지난 것과 그 사진(보낸 사람의 R2 파일)을 정리한다 (실패해도 무시)
export const DELETED_MESSAGE_DAYS = 30;
export async function purgeOldDeletedMessages(admin: SupabaseClient) {
  const before = new Date(Date.now() - DELETED_MESSAGE_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: old, error } = await admin.from('deleted_messages').select('id, sender_id, image_url').lt('deleted_at', before).limit(500);
  if (error || !old || old.length === 0) return;
  const images = old.filter(o => o.image_url && mediaKeyFromUrl(o.image_url)?.split('/')[1] === o.sender_id).map(o => o.image_url as string);
  await deleteMedia(images);
  await admin.from('deleted_messages').delete().in('id', old.map(o => o.id));
}

// R2 에 있는 파일들 지우기 (다른 주소는 무시, 실패해도 무시). 지울 주소는 filesSafeToDelete 로 고른 것만 넘긴다
export async function deleteMedia(urls: (string | null | undefined)[]) {
  if (!mediaEnabled()) return;
  await Promise.all(urls.map(mediaKeyFromUrl).filter((k): k is string => !!k).map(key =>
    fetch(mediaUrl(key), { method: 'DELETE', headers: { Authorization: `Bearer ${mediaToken('DELETE', key)}` } }).catch(() => null)));
}
