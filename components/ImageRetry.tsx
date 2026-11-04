'use client';

import { useEffect } from 'react';

// 사진을 받다가 한 번 실패하면(앱이 뒤에 있는 동안 받다 끊김·인터넷이 잠깐 끊김 등) 브라우저는 그 사진을 다시 받지 않아
// 깨진 그림 + '게시물 사진' 글자로 계속 남는다 — 당겨서 새로고침해도 같은 주소라 그대로 (운영자 2026-11-04, 폴드8:
// 홈의 콜라주 사진이 깨져 보이는데 눌러서 크게 보면 잘 나옴 = 사진 파일은 멀쩡하고 그 자리의 그림만 처음 받기에 실패한 것).
// → 앱 안의 모든 <img> 를 지켜보다가 실패하면 조금 기다렸다 다시 받는다(최대 3번, 주소 끝에 cgr=번호). 그래도 안 되면
// 인터넷이 다시 연결되거나 앱으로 돌아올 때 한 번 더. React 는 주소(prop)가 바뀔 때만 src 를 다시 쓰므로 여기서 바꿔도 그대로 둔다.
const DELAYS = [1500, 4000, 10000];
const TRIES = 'cgRetry';     // dataset: 몇 번 다시 받았는지
const BASE = 'cgRetrySrc';   // dataset: 처음 주소 (다시 받기 표시를 붙이기 전)

const retryable = (src: string) => /^https?:\/\//.test(src);
const withMark = (src: string, n: number) => {
  try {
    const u = new URL(src);
    u.searchParams.set('cgr', String(n));
    return u.toString();
  } catch { return src; }
};

export default function ImageRetry() {
  useEffect(() => {
    const timers = new Set<number>();
    const retry = (img: HTMLImageElement) => {
      const base = img.dataset[BASE] || img.getAttribute('src') || '';
      if (!retryable(base)) return;
      const n = Number(img.dataset[TRIES] || 0) + 1;
      img.dataset[BASE] = base;
      img.dataset[TRIES] = String(n);
      img.src = withMark(base, n);
    };
    const onError = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const src = img.getAttribute('src') || '';
      // 다른 사진으로 바뀌었으면(React 가 새 주소를 씀) 처음부터 다시 셈
      if (img.dataset[BASE] && !src.startsWith(img.dataset[BASE]!.split('?')[0])) { delete img.dataset[BASE]; delete img.dataset[TRIES]; }
      if (!retryable(img.dataset[BASE] || src)) return;
      const n = Number(img.dataset[TRIES] || 0);
      if (n >= DELAYS.length) { img.dataset.cgFailed = '1'; return; }
      const t = window.setTimeout(() => { timers.delete(t); if (img.isConnected) retry(img); }, DELAYS[n]);
      timers.add(t);
    };
    // 인터넷이 다시 연결되거나 앱으로 돌아오면, 끝내 못 받은 사진을 한 번씩 더
    const retryFailed = () => {
      if (document.visibilityState === 'hidden') return;
      document.querySelectorAll<HTMLImageElement>('img[data-cg-failed]').forEach(img => {
        delete img.dataset.cgFailed;
        img.dataset[TRIES] = String(DELAYS.length - 1); // 이번에도 실패하면 다시 '실패'로 표시
        retry(img);
      });
    };
    document.addEventListener('error', onError, true); // img 의 error 는 위로 올라오지 않아 잡는 단계(capture)에서
    window.addEventListener('online', retryFailed);
    document.addEventListener('visibilitychange', retryFailed);
    return () => {
      document.removeEventListener('error', onError, true);
      window.removeEventListener('online', retryFailed);
      document.removeEventListener('visibilitychange', retryFailed);
      timers.forEach(t => clearTimeout(t));
    };
  }, []);
  return null;
}
