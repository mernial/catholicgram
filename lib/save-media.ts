'use client';

import { isVideoUrl } from '@/lib/upload';
import { copyText, toast } from '@/lib/chat-actions';

// 대화(1:1·단체방·사랑방)에서 받은 사진·동영상을 휴대폰에 저장하거나 다른 앱(카카오톡·문자 등)으로 보내기
//  - 저장: 안드로이드·컴퓨터는 바로 내려받기(다운로드 폴더 → 갤러리에도 보임),
//          아이폰·아이패드는 내려받기가 사진첩으로 가지 않아 공유 창을 열어 '이미지 저장'·'비디오 저장'을 누르게 한다
//  - 공유: 휴대폰 공유 창에 파일 그대로. 파일을 못 보내는 곳은 주소로, 그것도 안 되면 주소 복사
// 사진 저장소(R2 워커·수파베이스)는 누구나 읽을 수 있게(CORS *) 열려 있어 앱에서 파일로 받아 올 수 있다.
// 아이폰은 공유 창을 누른 순간에 바로 열어야 해서(파일을 받는 동안 기다리면 막힘) 크게 보기를 열 때 미리 받아 둔다(prepareMedia)
export type MediaResult = 'saved' | 'shared' | 'cancelled' | 'opened' | 'copied' | 'retry' | 'failed';

export const isAppleDevice = () => typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const EXT: [RegExp, string][] = [[/png/, 'png'], [/webp/, 'webp'], [/gif/, 'gif'], [/quicktime/, 'mov'], [/webm/, 'webm'], [/^video/, 'mp4']];
const files = new Map<string, Promise<File | null>>();
const ready = new Map<string, File>();

const load = (url: string, n: number) => {
  let p = files.get(url);
  if (!p) {
    p = fetch(url, { mode: 'cors' }).then(async res => {
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : isVideoUrl(url) ? 'video/mp4' : 'image/jpeg';
      const ext = EXT.find(([re]) => re.test(type))?.[1] || 'jpg';
      const stamp = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 19).replace(/\D/g, '');
      const file = new File([blob], `catholicgram-${stamp}${n ? `-${n + 1}` : ''}.${ext}`, { type });
      ready.set(url, file);
      return file;
    }).catch(() => { files.delete(url); return null; });
    files.set(url, p);
  }
  return p;
};

// 미리 받아 두기 (크게 보기를 열 때·꾹 누르기 메뉴를 열 때)
export function prepareMedia(urls: string[]) { urls.forEach((u, i) => { void load(u, i); }); }

// 받아 둔 게 있으면 기다리지 않고 바로 (아이폰 공유 창이 열리게)
const getFiles = async (urls: string[]) => {
  const now = urls.map(u => ready.get(u));
  if (now.every(Boolean)) return now as File[];
  const got = await Promise.all(urls.map((u, i) => load(u, i)));
  return got.every(Boolean) ? got as File[] : null;
};

const canShareFiles = (list: File[]) => typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: list });
const aborted = (e: unknown) => (e as { name?: string })?.name === 'AbortError';
// 파일을 받는 동안 '누른 순간'이 지나 공유 창이 막힘(아이폰) → 이제 받아 두었으니 한 번 더 누르면 열림
const blocked = (e: unknown) => (e as { name?: string })?.name === 'NotAllowedError';

const download = (file: File) => {
  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
};

export async function saveMedia(urls: string[]): Promise<MediaResult> {
  const list = await getFiles(urls);
  if (!list) { window.open(urls[0], '_blank', 'noopener'); return 'opened'; } // 받지 못하면 새 창에서 꾹 눌러 저장
  if (isAppleDevice() && canShareFiles(list)) {
    try { await navigator.share({ files: list }); return 'shared'; }
    catch (e) { if (aborted(e)) return 'cancelled'; if (blocked(e)) return 'retry'; }
  }
  list.forEach((f, i) => setTimeout(() => download(f), i * 400)); // 여러 장은 조금씩 띄워서
  return 'saved';
}

export async function shareMedia(urls: string[]): Promise<MediaResult> {
  const list = await getFiles(urls);
  if (list && canShareFiles(list)) {
    try { await navigator.share({ files: list, title: '가톨릭그램' }); return 'shared'; }
    catch (e) { if (aborted(e)) return 'cancelled'; if (blocked(e)) return 'retry'; }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ title: '가톨릭그램', url: urls[0] }); return 'shared'; }
    catch (e) { if (aborted(e)) return 'cancelled'; }
  }
  return (await copyText(urls.join('\n'))) ? 'copied' : 'failed';
}

// 결과 안내 한 줄 (없으면 말 없음)
export const mediaResultText = (r: MediaResult, kind: '사진' | '동영상' = '사진') => ({
  saved: `${kind}을 저장했어요. 갤러리(사진첩)나 다운로드 폴더에서 볼 수 있어요`,
  opened: `${kind}을 새 창에 열었어요. 꾹 눌러 저장해 주세요`,
  copied: `${kind} 주소를 복사했어요. 보낼 곳에 붙여 넣어 주세요`,
  retry: '준비됐어요. 한 번 더 눌러 주세요',
  failed: `${kind}을 보내지 못했어요. 잠시 뒤에 다시 해 주세요`,
  shared: '', cancelled: '',
} as Record<MediaResult, string>)[r];

// 꾹 누르기 메뉴(1:1·단체방·사랑방)의 '사진 저장'·'사진 공유' (묶음은 '사진 N장 …', 동영상은 '동영상 …')
type Media = { image_url?: string | null; images?: string[] | null };
export const mediaUrls = (m: Media) => (m.images && m.images.length > 1 ? m.images : m.image_url ? [m.image_url] : m.images ?? []);
export function mediaMenuActions(m: Media, close: () => void) {
  const urls = mediaUrls(m);
  if (!urls.length) return [];
  const video = urls.length === 1 && isVideoUrl(urls[0]);
  if (!video && urls.length <= 10) prepareMedia(urls); // 사진은 메뉴가 뜰 때 미리 (동영상은 커서 누를 때)
  const what = video ? '동영상' : urls.length > 1 ? `사진 ${urls.length}장` : '사진';
  const run = (act: (u: string[]) => Promise<MediaResult>) => async () => {
    close();
    if (video) toast('동영상을 받는 중이에요. 잠시만 기다려 주세요', 2500);
    const text = mediaResultText(await act(urls), video ? '동영상' : '사진');
    if (text) toast(text, 2800);
  };
  return [{ label: `${what} 저장`, run: run(saveMedia) }, { label: `${what} 공유`, run: run(shareMedia) }];
}
