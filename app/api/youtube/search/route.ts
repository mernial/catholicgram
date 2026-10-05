import { createClient } from '@supabase/supabase-js';

// 글쓰기 음악 고르기: 유튜브 검색 (YouTube Data API v3)
// 검색 1번에 할당량 100이 들고 하루 기본 10,000 이므로, 같은 검색어는 6시간 동안 서버에 저장해 재사용한다.

export interface YouTubeResult { videoId: string; title: string; channel: string; thumbnail: string; duration: string }

const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; results: YouTubeResult[] }>();

const decode = (text: string) => text
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 'PT1H2M3S' → '1:02:03'
const formatDuration = (iso?: string) => {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const [h, min, s] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  return h > 0 ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${min}:${String(s).padStart(2, '0')}`;
};

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return Response.json({ error: 'not_configured' }, { status: 503 });

  // 로그인한 회원만 (검색 할당량 보호)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !serviceRoleKey || !token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100);
  if (!q) return Response.json({ results: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json({ results: hit.results });

  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  Object.entries({
    part: 'snippet', q, type: 'video', videoEmbeddable: 'true', maxResults: '15',
    regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict', key: apiKey,
  }).forEach(([k, v]) => searchUrl.searchParams.set(k, v));
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const quota = searchRes.status === 403;
    return Response.json({ error: quota ? 'quota' : 'search_failed' }, { status: 502 });
  }
  const search = await searchRes.json() as {
    items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } }[];
  };
  const items = (search.items || []).filter(i => i.id?.videoId);

  // 재생 시간 (할당량 1)
  const durations = new Map<string, string>();
  if (items.length > 0) {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.set('part', 'contentDetails');
    videosUrl.searchParams.set('id', items.map(i => i.id.videoId).join(','));
    videosUrl.searchParams.set('key', apiKey);
    const videosRes = await fetch(videosUrl).catch(() => null);
    if (videosRes?.ok) {
      const videos = await videosRes.json() as { items?: { id: string; contentDetails: { duration: string } }[] };
      (videos.items || []).forEach(v => durations.set(v.id, formatDuration(v.contentDetails?.duration)));
    }
  }

  const results: YouTubeResult[] = items.map(i => ({
    videoId: i.id.videoId,
    title: decode(i.snippet.title),
    channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails.medium?.url || i.snippet.thumbnails.default?.url || `https://img.youtube.com/vi/${i.id.videoId}/mqdefault.jpg`,
    duration: durations.get(i.id.videoId) || '',
  }));

  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return Response.json({ results });
}
