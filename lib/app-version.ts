// 지금 쓰는 앱 버전 (설정 → 버전 정보). 값은 배포할 때 next.config.ts 가 넣음
// - 버전 번호: main 에 합친 PR 번호 (예: 337) — 없으면(직접 올린 배포·내 컴퓨터) 코드 앞 7자리
// - 나온 때: 배포를 만든 때, 이번 업데이트: 합친 PR 의 제목

export type AppVersion = { version: string; release: string; builtAt: string };

export const CURRENT_VERSION: AppVersion = {
  version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  release: process.env.NEXT_PUBLIC_APP_RELEASE || '',
  builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT || '',
};
export const CURRENT_NOTE = process.env.NEXT_PUBLIC_APP_NOTE || '';

export const versionLabel = (v: AppVersion) => `버전 ${v.release || v.version.slice(0, 7)}`;

// '2026년 10월 30일 오후 4:12' (한국 시간)
export const builtAtLabel = (v: AppVersion) => {
  const t = Date.parse(v.builtAt);
  return Number.isFinite(t)
    ? new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
};

// 지금 서버에 올라가 있는 버전 (새 버전이 나왔는지 볼 때)
export async function fetchLatestVersion(): Promise<AppVersion | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return null;
    const v = await res.json();
    return typeof v?.version === 'string' ? { version: v.version, release: v.release || '', builtAt: v.builtAt || '' } : null;
  } catch {
    return null;
  }
}

export const isNewerVersion = (latest: AppVersion | null) =>
  !!latest && latest.version !== 'dev' && latest.version !== CURRENT_VERSION.version;
