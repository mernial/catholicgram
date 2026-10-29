// Suno(AI 음악) 노래 주소 → 노래 번호와 mp3 주소 (관리자 배경음악 관리 '🔗 Suno 노래 주소로 넣기', app/api/admin/suno)
//   https://suno.com/song/<번호>            → 바로 앎
//   https://suno.com/s/<짧은 코드>          → 서버가 열어 봐야 앎 (그 페이지가 /song/<번호> 로 넘어감)
//   https://cdn1.suno.ai/<번호>.mp3         → 바로 앎
// 노래 파일은 Suno 저장소(cdn1.suno.ai)에 있고, 앱의 배경음악은 <audio> 로 그대로 틀 수 있다.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const sunoUrl = (input: string): URL | null => {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return /(^|\.)suno\.(com|ai)$/i.test(url.hostname) ? url : null;
  } catch { return null; }
};

export const isSunoLink = (input: string) => !!sunoUrl(input);

// 주소만 보고 알 수 있는 노래 번호 (짧은 주소 /s/… 는 null → 서버에 물어봄)
export const sunoSongId = (input: string): string | null => {
  const url = sunoUrl(input);
  if (!url) return null;
  const m = (url.pathname + url.search).match(UUID);
  return m ? m[0].toLowerCase() : null;
};

export const sunoShortCode = (input: string): string | null => {
  const url = sunoUrl(input);
  const m = url?.pathname.match(/^\/s\/([A-Za-z0-9_-]{4,40})\/?$/);
  return m ? m[1] : null;
};

export const sunoAudioUrl = (id: string) => `https://cdn1.suno.ai/${id}.mp3`;

// 노래 페이지 HTML 에서 제목·만든 사람 (og:title 은 보통 '제목 by 만든 사람 | Suno')
export const sunoTitleFromHtml = (html: string): { title: string; artist: string | null } | null => {
  const meta = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
    return m ? decode(m[1]).trim() : '';
  };
  const raw = meta('og:title') || (html.match(/<title>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title>([^<]*)<\/title>/i)![1]).trim() : '');
  const text = raw.replace(/\s*[|·-]\s*Suno\s*$/i, '').trim();
  if (!text || /^suno$/i.test(text)) return null;
  const by = text.match(/^(.+?)\s+by\s+(.+)$/i);
  return by ? { title: by[1].trim(), artist: by[2].trim() } : { title: text, artist: null };
};

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// 노래 페이지 HTML·넘어간 주소에서 노래 번호 찾기 (og:audio·og:url·canonical 등에 들어 있음)
export const sunoIdFromPage = (finalUrl: string, html: string): string | null => {
  const fromUrl = finalUrl.match(UUID)?.[0];
  if (fromUrl) return fromUrl.toLowerCase();
  const audio = html.match(new RegExp(`cdn\\d*\\.suno\\.ai/(${UUID.source})`, 'i'))?.[1]
    || html.match(new RegExp(`/song/(${UUID.source})`, 'i'))?.[1];
  return audio ? audio.toLowerCase() : null;
};
