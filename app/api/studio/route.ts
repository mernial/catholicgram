import { createHash, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 설명 영상 녹음실 (app/studio · components/NarrationStudio) 의 녹음 보관소
//  - 관리자(로그인 토큰): 녹음 조각 올리기(POST ?name=) · 목록(GET) · 받기(GET ?name=) · 한 녹음 지우기(DELETE ?take=)
//  - 가져가는 쪽(x-studio-key 머리글): 목록·받기만. 코드에는 열쇠의 지문(SHA-256)만 둔다 — 지문으로는 열쇠를 알 수 없음
// 녹음은 Supabase 저장소의 비공개 칸 'narration' 에 조각으로 둔다 (Vercel 은 요청·응답 본문이 4.5MB 를 넘으면 거절 → 조각 하나 3MB)
// 이름: t<시각 13자리>_c<시작 장>-<끝 장>_d<길이 초>_p<몇 번째>of<모두>.<webm|m4a|ogg|bin> · t<시각>.json(장을 넘긴 때·형식 등)
export const maxDuration = 60;

const BUCKET = 'narration';
const PULL_KEY_SHA256 = '7d73d03bdc0ad39d03317dfef608033268c5c80f7c859c784edd9d7cb0314ab0';
const PART = /^t\d{13}_c\d{2}-\d{2}_d\d{1,5}_p\d{2}of\d{2}\.(webm|m4a|ogg|bin)$/;
const META = /^t\d{13}\.json$/;
const TAKE = /^t\d{13}$/;
const MAX_BYTES = 4 * 1024 * 1024;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const missing = (message?: string) => /not found|does not exist/i.test(message || '');

function server(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

async function who(request: Request, admin: SupabaseClient): Promise<'admin' | 'puller' | null> {
  const key = request.headers.get('x-studio-key');
  if (key) {
    const got = createHash('sha256').update(key, 'utf8').digest();
    return timingSafeEqual(got, Buffer.from(PULL_KEY_SHA256, 'hex')) ? 'puller' : null;
  }
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  return user?.email && ADMIN_EMAILS.includes(user.email) ? 'admin' : null;
}

async function listAll(admin: SupabaseClient): Promise<{ files: { name: string; size: number; at: string }[] } | { error: string }> {
  const { data, error } = await admin.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) return missing(error.message) ? { files: [] } : { error: error.message };
  return {
    files: (data || []).filter(f => PART.test(f.name) || META.test(f.name))
      .map(f => ({ name: f.name, size: Number((f.metadata as { size?: number } | null)?.size) || 0, at: f.created_at || '' })),
  };
}

export async function GET(request: Request) {
  const admin = server();
  if (!admin) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 503);
  if (!(await who(request, admin))) return json({ error: 'forbidden' }, 403);
  const name = new URL(request.url).searchParams.get('name');
  if (!name) {
    const r = await listAll(admin);
    return 'error' in r ? json({ error: r.error }, 500) : json(r);
  }
  if (!PART.test(name) && !META.test(name)) return json({ error: 'bad name' }, 400);
  const { data, error } = await admin.storage.from(BUCKET).download(name);
  if (error || !data) return json({ error: error?.message || 'not found' }, missing(error?.message) ? 404 : 500);
  return new Response(data, { headers: { 'content-type': META.test(name) ? 'application/json' : 'application/octet-stream', 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const admin = server();
  if (!admin) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 503);
  if ((await who(request, admin)) !== 'admin') return json({ error: 'forbidden' }, 403);
  const name = new URL(request.url).searchParams.get('name') || '';
  if (!PART.test(name) && !META.test(name)) return json({ error: 'bad name' }, 400);
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length) return json({ error: 'empty' }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: 'too large' }, 413);
  const put = () => admin.storage.from(BUCKET).upload(name, bytes, { contentType: META.test(name) ? 'application/json' : 'application/octet-stream', upsert: true });
  let { error } = await put();
  if (error && missing(error.message)) {
    // 처음 한 번: 비공개 저장 칸을 만든다
    const made = await admin.storage.createBucket(BUCKET, { public: false });
    if (made.error && !/already exists|duplicate/i.test(made.error.message)) return json({ error: '저장 칸을 만들지 못했어요: ' + made.error.message }, 500);
    ({ error } = await put());
  }
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, name, size: bytes.length });
}

export async function DELETE(request: Request) {
  const admin = server();
  if (!admin) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 503);
  if ((await who(request, admin)) !== 'admin') return json({ error: 'forbidden' }, 403);
  const take = new URL(request.url).searchParams.get('take') || '';
  if (!TAKE.test(take)) return json({ error: 'bad take' }, 400);
  const r = await listAll(admin);
  if ('error' in r) return json({ error: r.error }, 500);
  const names = r.files.map(f => f.name).filter(n => n.startsWith(take + '_') || n === take + '.json');
  if (names.length) {
    const { error } = await admin.storage.from(BUCKET).remove(names);
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ok: true, removed: names.length });
}
