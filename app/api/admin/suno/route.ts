import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { sunoAudioUrl, sunoIdFromPage, sunoShortCode, sunoSongId, sunoTitleFromHtml } from '@/lib/suno';

// 관리자 전용: Suno 노래 주소(짧은 공유 주소 suno.com/s/… 도) → 노래 번호·mp3 주소·제목 (배경음악 관리 '🔗 Suno 노래 주소로 넣기')
// 짧은 주소는 페이지를 열어 봐야 노래 번호를 알 수 있어서 서버가 대신 연다. 제목은 노래 페이지의 og:title (못 읽으면 비워 둠)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const openPage = async (url: string) => {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, signal: AbortSignal.timeout(8000) });
  const html = res.ok ? (await res.text()).slice(0, 400_000) : '';
  return { finalUrl: res.url || url, html };
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const link = new URL(request.url).searchParams.get('url') || '';
  let id = sunoSongId(link);
  const code = sunoShortCode(link);
  if (!id && !code) return Response.json({ error: 'not_suno' }, { status: 400 });

  let info: { title: string; artist: string | null } | null = null;
  try {
    const page = await openPage(code && !id ? `https://suno.com/s/${code}` : `https://suno.com/song/${id}`);
    id = id || sunoIdFromPage(page.finalUrl, page.html);
    info = sunoTitleFromHtml(page.html);
  } catch (e) {
    console.error('suno page failed', link, e instanceof Error ? e.message : e);
  }
  if (!id) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ id, audio: sunoAudioUrl(id), title: info?.title || '', artist: info?.artist || null });
}
