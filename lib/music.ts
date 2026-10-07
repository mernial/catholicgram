// 게시물 배경음악
// posts.music 에 다음 형식으로 저장한다.
//   'yt:<영상ID>', 'yt:<영상ID>@<시작초>', 'yt:<영상ID>@<시작초>+<구간초>' → 유튜브
//   'bgm:<트랙ID>', 'bgm:<트랙ID>@<시작초>+<구간초>'  → 앱 배경음악 목록 (bgm_tracks, 저작권 걱정 없는 곡)

export interface BgmTrack { id: string; title: string; artist?: string | null; url: string; active?: boolean; sort?: number }

export type PostMusic =
  | { kind: 'youtube'; videoId: string; start: number; clip?: number }
  | { kind: 'bgm'; trackId: string; start: number; clip?: number };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

const parseStart = (t: string | null) => {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
};

// 유튜브 주소에서 영상 ID와 시작 시간을 꺼낸다 (youtu.be, watch?v=, shorts, live, music.youtube.com 등)
export const parseYouTubeUrl = (input: string): { videoId: string; start: number } | null => {
  const text = input.trim();
  if (YT_ID.test(text)) return { videoId: text, start: 0 };
  let url: URL;
  try { url = new URL(text.startsWith('http') ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?]+)/);
      if (m) id = m[1];
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  return { videoId: id, start: parseStart(url.searchParams.get('t') || url.searchParams.get('start')) };
};

export const encodeYouTube = (videoId: string, start = 0, clip?: number) =>
  `yt:${videoId}${start > 0 || clip ? `@${start}` : ''}${clip ? `+${clip}` : ''}`;

export const CLIP_SECONDS = 30;  // 고를 수 있는 가장 긴 구간
export const DEFAULT_CLIP = 15;  // 처음 고를 때 구간 길이

export const encodeBgm = (trackId: string, start = 0, clip?: number) =>
  `bgm:${trackId}${start > 0 || clip ? `@${start}` : ''}${clip ? `+${clip}` : ''}`;

export const parsePostMusic = (value?: string | null): PostMusic | null => {
  if (!value) return null;
  if (value.startsWith('yt:')) {
    const [videoId, range = ''] = value.slice(3).split('@');
    const [start, clip] = range.split('+');
    return YT_ID.test(videoId) ? { kind: 'youtube', videoId, start: Number(start) || 0, clip: Number(clip) || undefined } : null;
  }
  if (value.startsWith('bgm:')) {
    const [trackId, range = ''] = value.slice(4).split('@');
    const [start, clip] = range.split('+');
    return { kind: 'bgm', trackId, start: Number(start) || 0, clip: Number(clip) || undefined };
  }
  return null;
};

export const youTubeEmbedUrl = (videoId: string, start = 0, autoplay = true) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&loop=1&playlist=${videoId}${autoplay ? '&autoplay=1' : ''}${start ? `&start=${start}` : ''}`;

// 유튜브 영상 제목 (실패하면 null)
export const fetchYouTubeTitle = async (videoId: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.title === 'string' ? json.title : null;
  } catch {
    return null;
  }
};
