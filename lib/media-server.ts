// 서버 전용: Cloudflare R2 저장소(Worker) 허가증 만들기·파일 올리기/지우기
// 환경 변수 (Vercel): NEXT_PUBLIC_MEDIA_URL = Worker 주소, R2_UPLOAD_SECRET = Worker 의 UPLOAD_SECRET 과 같은 값
import { createHmac, randomBytes } from 'crypto';

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

// R2 에 있는 파일들 지우기 (다른 주소는 무시, 실패해도 무시)
export async function deleteMedia(urls: (string | null | undefined)[]) {
  if (!mediaEnabled()) return;
  await Promise.all(urls.map(mediaKeyFromUrl).filter((k): k is string => !!k).map(key =>
    fetch(mediaUrl(key), { method: 'DELETE', headers: { Authorization: `Bearer ${mediaToken('DELETE', key)}` } }).catch(() => null)));
}
