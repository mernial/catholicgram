import { createClient } from '@supabase/supabase-js';

// 글쓰기 음악 고르기: 노래 검색 (YouTube Data API v3)
// 유튜브 뮤직은 따로 검색 API 가 없고, 유튜브 뮤직의 노래도 유튜브 영상(같은 영상 ID)이라 유튜브 검색을 '음악' 분류(10)로 좁혀 찾는다.
// '… - Topic' 채널은 유튜브 뮤직 음원(앨범 곡)이라 topic: true 로 알려 준다.
// 검색 1번에 할당량 100이 들고 하루 기본 10,000(약 100번, 한국 시간 오후 4~5시에 다시 참)이므로,
// 같은 검색어는 6시간 동안 저장해 재사용한다 — 이 서버 칸 안(cache) + 모든 서버가 함께 쓰는 Next.js fetch 저장소(revalidate).

export interface YouTubeResult { videoId: string; title: string; channel: string; thumbnail: string; duration: string; topic?: boolean }

const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; results: YouTubeResult[] }>();

type SearchItem = { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } };
type GoogleError = { error?: { code?: number; message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };

// 구글이 알려 준 실패 이유 → 앱이 알아듣는 말. 관리자가 무엇을 고칠지 알 수 있게 (키는 응답에 들어가지 않는다)
//  quota: 오늘 검색 한도를 다 씀 / key_invalid: 키가 틀렸거나 지워짐 / api_disabled: 구글 클라우드에서 YouTube Data API 가 꺼짐
//  key_blocked: 키 제한(웹사이트·앱·다른 API 로만) 때문에 서버 검색이 막힘
const errorKind = (body: GoogleError) => {
  const reasons = [...(body.error?.details || []), ...(body.error?.errors || [])].map(e => e.reason || '').filter(Boolean);
  const has = (re: RegExp) => reasons.some(r => re.test(r));
  if (has(/quotaExceeded|dailyLimitExceeded|rateLimitExceeded|RATE_LIMIT_EXCEEDED/)) return { error: 'quota', reasons };
  if (has(/API_KEY_INVALID|keyInvalid|API_KEY_EXPIRED|keyExpired/) || /API key (not valid|expired)/i.test(body.error?.message || '')) return { error: 'key_invalid', reasons };
  if (has(/SERVICE_DISABLED|accessNotConfigured/)) return { error: 'api_disabled', reasons };
  if (has(/API_KEY_.*_BLOCKED|ipRefererBlocked|forbidden/)) return { error: 'key_blocked', reasons };
  return { error: 'search_failed', reasons };
};

const youtube = async <T>(path: 'search' | 'videos', params: Record<string, string>, apiKey: string) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([k, v]) => url.searchParams.set(k, v));
  // 성공한 응답(200)만 6시간 저장된다
  const res = await fetch(url, { next: { revalidate: CACHE_MS / 1000 } }).catch(() => null);
  if (!res) return { ok: false as const, status: 0, body: {} as GoogleError };
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, data: body as T } : { ok: false as const, status: res.status, body: body as GoogleError };
};

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

  // 띄어쓰기·대소문자만 다른 검색어는 같은 검색으로 (저장해 둔 결과를 다시 씀)
  const q = new URL(request.url).searchParams.get('q')?.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!q) return Response.json({ results: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json({ results: hit.results });

  const base = {
    part: 'snippet', q: key, type: 'video', videoEmbeddable: 'true', maxResults: '15',
    regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict',
  };
  type SearchList = { items?: SearchItem[] };
  // 노래만 (음악 분류). 성당·개인이 올린 성가는 음악 분류가 아닌 것도 많아, 노래가 3개도 안 나오면 그때만 전체에서 한 번 더
  const music = await youtube<SearchList>('search', { ...base, videoCategoryId: '10' }, apiKey);
  let items = music.ok ? (music.data.items || []).filter(i => i.id?.videoId) : [];
  const failed = music.ok ? null : music;
  if (music.ok && items.length < 3) {
    const all = await youtube<SearchList>('search', base, apiKey);
    if (all.ok) {
      const seen = new Set(items.map(i => i.id.videoId));
      items = [...items, ...(all.data.items || []).filter(i => i.id?.videoId && !seen.has(i.id.videoId))].slice(0, 15);
    }
  }
  if (failed) {
    const kind = errorKind(failed.body);
    console.error('youtube search failed', failed.status, kind.error, kind.reasons.join(','), failed.body.error?.message || '');
    return Response.json({ error: kind.error, reason: kind.reasons[0] || String(failed.status) }, { status: 502 });
  }

  // 재생 시간 (할당량 1)
  const durations = new Map<string, string>();
  if (items.length > 0) {
    const videos = await youtube<{ items?: { id: string; contentDetails: { duration: string } }[] }>(
      'videos', { part: 'contentDetails', id: items.map(i => i.id.videoId).join(',') }, apiKey,
    );
    if (videos.ok) (videos.data.items || []).forEach(v => durations.set(v.id, formatDuration(v.contentDetails?.duration)));
  }

  const results: YouTubeResult[] = items.map(i => {
    const channel = decode(i.snippet.channelTitle);
    const topic = / - Topic$/.test(channel);
    return {
      videoId: i.id.videoId,
      title: decode(i.snippet.title),
      channel: topic ? channel.replace(/ - Topic$/, '') : channel,
      thumbnail: i.snippet.thumbnails.medium?.url || i.snippet.thumbnails.default?.url || `https://img.youtube.com/vi/${i.id.videoId}/mqdefault.jpg`,
      duration: durations.get(i.id.videoId) || '',
      ...(topic ? { topic: true } : {}),
    };
  });

  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return Response.json({ results });
}
