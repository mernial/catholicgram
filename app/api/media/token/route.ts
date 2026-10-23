import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { mediaEnabled, mediaToken, mediaUrl, newMediaKey } from '@/lib/media-server';

// 사진·영상 올리기 허가증 (Cloudflare R2)
// GET  → { enabled } : R2 설정 여부
// POST { kind, ext } (로그인 필요) → { key, uploadUrl, token, publicUrl } — 받은 허가증으로 uploadUrl 에 PUT
const KINDS = ['posts', 'videos', 'posters', 'avatars', 'stories', 'dm', 'feedback', 'letters'];
const ADMIN_KINDS = ['sponsor', 'bgm'];
// 종류별로 올릴 수 있는 파일 형식 (html·svg·js 같은 파일은 받지 않음 — 저장소 Worker 도 확장자로 형식을 정함)
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const EXTS: Record<string, string[]> = {
  videos: ['mp4', 'mov', 'webm', 'm4v'],
  bgm: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga'],
};

export async function GET() {
  return Response.json({ enabled: mediaEnabled() });
}

export async function POST(request: Request) {
  if (!mediaEnabled()) return Response.json({ enabled: false });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { kind, ext } = ((await request.json().catch(() => ({}))) ?? {}) as { kind?: string; ext?: string };
  const isAdmin = !!user.email && ADMIN_EMAILS.includes(user.email);
  if (!kind || !(KINDS.includes(kind) || (isAdmin && ADMIN_KINDS.includes(kind)))) return Response.json({ error: 'bad kind' }, { status: 400 });
  const cleanExt = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!(EXTS[kind] || IMAGE_EXTS).includes(cleanExt)) return Response.json({ error: '올릴 수 없는 파일 형식이에요.' }, { status: 400 });
  const key = newMediaKey(kind, user.id, cleanExt);
  return Response.json({ enabled: true, key, uploadUrl: mediaUrl(key), token: mediaToken('PUT', key), publicUrl: mediaUrl(key) });
}
