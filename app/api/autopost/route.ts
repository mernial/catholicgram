import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deleteMedia, mediaEnabled, newMediaKey, putMedia } from '@/lib/media-server';
import { postMentionTargets, sendPushTargets } from '@/lib/push-send';
import { ADMIN_EMAILS } from '@/lib/admin';

// 외부 자동 게시: 운영자의 '인스타 자동 업로더'가 텔레그램 승인 뒤 같은 묵상 카드 글을 가톨릭그램에도 올린다.
// POST /api/autopost   헤더 Authorization: Bearer <비밀값>
// 비밀값: 코드에는 지문(SHA-256)만 둔다(AUTOPOST_SECRET_SHA256 — 지문으로는 비밀값을 알 수 없음, 비밀값은 운영자가 업로더에만 넣음).
//   Vercel 환경 변수 AUTOPOST_SECRET(32자 이상)을 넣으면 그 값도 받음. 비밀값을 바꾸려면 새 값의 지문으로 바꿔 배포
// 본문 { content, image_urls: [https://mernial.github.io/… (최대 10장, jpeg·png, 장당 10MB)], visibility?: public|followers|private,
//        client_key?: '2026-11-02' (같은 열쇠로 이미 올린 글이 있으면 새로 만들지 않고 그 글), dry_run?: true (확인만, 글은 안 만듦) }
// → { ok: true, id, url }   (같은 열쇠의 글이 이미 있으면 duplicate: true)
// 글쓴이 = 환경 변수 AUTOPOST_USER_ID 의 교우, 없으면 관리자 계정(ADMIN_EMAILS 첫 번째). 사진은 서버가 받아 가톨릭그램 저장소(R2)에 다시 올린다.
// 앱에서 글을 올릴 때처럼 @태그된 교우에게 휴대폰 알림 (평소 글쓰기에는 팔로워 알림이 없음 — 피드에 보임)
// client_key 를 쓰려면 supabase/autopost.sql 실행 필요

export const maxDuration = 60;

const SITE = 'https://catholicgram-dey7.vercel.app';
// 업로더 비밀값의 지문 (openssl rand -hex 32 로 만든 64자 → sha256). 비밀값 자체는 저장소에 없음
const AUTOPOST_SECRET_SHA256 = '9d98077a0116247f30f7d95e22550554765fe7e1937c93712f09c985d22c49a1';
const ALLOWED_PREFIX = 'https://mernial.github.io/';
const MAX_IMAGES = 10; // 앱의 MAX_PHOTOS 와 같음
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CONTENT = 5000; // 글 고치기(/api/posts)와 같음
const VISIBILITIES = ['public', 'followers', 'private'] as const;
const KEY_SQL_HINT = '같은 글 막기(client_key)를 쓰려면 Supabase 에서 supabase/autopost.sql 을 먼저 실행해 주세요.';

class Fail extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

// 비밀값 비교: 길이와 상관없이 같은 시간 (SHA-256 지문끼리 같은 길이로 비교)
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();
function secretOk(given: string) {
  const g = sha256(given);
  const env = process.env.AUTOPOST_SECRET || '';
  const byCode = timingSafeEqual(g, Buffer.from(AUTOPOST_SECRET_SHA256, 'hex'));
  const byEnv = env.length >= 32 && timingSafeEqual(g, sha256(env));
  return byCode || byEnv;
}

// https://mernial.github.io/ 로 시작하는 주소만 (사용자 이름·포트·다른 호스트가 끼면 거절)
function allowedUrl(raw: string) {
  if (!raw.startsWith(ALLOWED_PREFIX) || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'mernial.github.io' && !u.port && !u.username && !u.password;
  } catch { return false; }
}

type Image = { bytes: Uint8Array<ArrayBuffer>; ext: 'jpg' | 'png'; type: 'image/jpeg' | 'image/png' };

// 사진 하나 받기: 다른 곳으로 넘기는 주소는 같은 사이트 안에서만(3번까지), jpeg·png(파일 앞부분으로 확인), 10MB 까지
async function fetchImage(url: string, n: number): Promise<Image> {
  const label = `${n}번째 사진`;
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    res = await fetch(current, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'catholicgram-autopost' } })
      .catch(e => { throw new Fail(502, `${label}을 받지 못했어요 (${e instanceof Error ? e.message : e}): ${url}`); });
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get('location') ? new URL(res.headers.get('location')!, current).toString() : '';
    if (!next || !allowedUrl(next)) throw new Fail(400, `${label} 주소가 다른 곳으로 넘어가요: ${url}`);
    if (hop === 3) throw new Fail(400, `${label} 주소가 너무 여러 번 넘어가요: ${url}`);
    current = next;
  }
  if (!res || !res.ok) throw new Fail(502, `${label}을 받지 못했어요 (${res?.status}): ${url}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/jpg') throw new Fail(415, `${label}이 jpeg·png 가 아니에요 (${type}): ${url}`);
  if (Number(res.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) throw new Fail(413, `${label}이 10MB 보다 커요: ${url}`);
  // 받으면서 크기 재기 (크기를 안 알려 주는 경우도 10MB 넘으면 멈춤)
  const reader = res.body?.getReader();
  if (!reader) throw new Fail(502, `${label}이 비어 있어요: ${url}`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) { await reader.cancel().catch(() => null); throw new Fail(413, `${label}이 10MB 보다 커요: ${url}`); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  const isJpeg = total > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = total > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (!isJpeg && !isPng) throw new Fail(415, `${label}이 jpeg·png 사진이 아니에요: ${url}`);
  return isJpeg ? { bytes, ext: 'jpg', type: 'image/jpeg' } : { bytes, ext: 'png', type: 'image/png' };
}

// 가톨릭그램 저장소에 올리기: R2 가 설정돼 있으면 R2(앱과 같은 posts/<글쓴이>/… 경로), 아니면 예전 수파베이스 저장소
async function storeImage(admin: SupabaseClient, userId: string, img: Image) {
  if (mediaEnabled()) return { url: await putMedia(newMediaKey('posts', userId, img.ext), img.bytes.buffer, img.type), path: null as string | null };
  const path = `${Date.now()}_${randomBytes(12).toString('hex')}.${img.ext}`;
  const { error } = await admin.storage.from('community-images').upload(path, img.bytes, { contentType: img.type, cacheControl: '31536000' });
  if (error) throw new Fail(502, `사진을 저장하지 못했어요 (${error.message})`);
  return { url: admin.storage.from('community-images').getPublicUrl(path).data.publicUrl, path };
}
async function removeStored(admin: SupabaseClient, stored: { url: string; path: string | null }[]) {
  const paths = stored.map(s => s.path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from('community-images').remove(paths).catch(() => null);
  await deleteMedia(stored.filter(s => !s.path).map(s => s.url));
}

const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /autopost_key/.test(e.message || ''));

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return fail(503, '서버 설정이 완료되지 않았습니다.');

  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1]?.trim() || '';
  if (!given || !secretOk(given)) return fail(401, 'unauthorized');

  const envUser = (process.env.AUTOPOST_USER_ID || '').trim();
  if (envUser && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(envUser)) return fail(503, 'Vercel 환경 변수 AUTOPOST_USER_ID 가 교우 id 모양이 아니에요.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail(400, 'JSON 본문이 필요해요.');
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (body.content !== undefined && typeof body.content !== 'string') return fail(400, 'content 는 글자여야 해요.');
  if (content.length > MAX_CONTENT) return fail(400, `글이 너무 길어요 (${content.length}자, ${MAX_CONTENT}자까지).`);
  const urls = body.image_urls === undefined ? [] : body.image_urls;
  if (!Array.isArray(urls) || urls.some(u => typeof u !== 'string')) return fail(400, 'image_urls 는 주소 목록이어야 해요.');
  if (urls.length > MAX_IMAGES) return fail(400, `사진은 ${MAX_IMAGES}장까지예요.`);
  const bad = (urls as string[]).find(u => !allowedUrl(u));
  if (bad) return fail(400, `${ALLOWED_PREFIX} 로 시작하는 주소만 받아요: ${bad.slice(0, 200)}`);
  if (!content && urls.length === 0) return fail(400, '글이나 사진이 있어야 해요.');
  const visibility = body.visibility === undefined ? 'public' : body.visibility;
  if (typeof visibility !== 'string' || !(VISIBILITIES as readonly string[]).includes(visibility)) return fail(400, 'visibility 는 public·followers·private 중 하나예요.');
  const clientKey = body.client_key === undefined || body.client_key === null || body.client_key === '' ? null : body.client_key;
  if (clientKey !== null && (typeof clientKey !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(clientKey))) return fail(400, 'client_key 는 영문·숫자·.-_: 100자까지예요 (예: 2026-11-02).');
  const dryRun = body.dry_run === true;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // 글쓴이: AUTOPOST_USER_ID, 없으면 관리자 계정 (ADMIN_EMAILS 순서대로 처음 찾은 것)
  let author: { id: string; baptismal_name: string | null } | null = null;
  if (envUser) {
    const { data } = await admin.from('profiles').select('id, baptismal_name').eq('id', envUser).maybeSingle();
    author = data;
    if (!author) return fail(503, 'AUTOPOST_USER_ID 의 교우를 찾지 못했어요.');
  } else {
    const { data } = await admin.from('profiles').select('id, baptismal_name, email').in('email', ADMIN_EMAILS);
    const found = (data || []).sort((a, b) => ADMIN_EMAILS.indexOf(a.email) - ADMIN_EMAILS.indexOf(b.email))[0];
    if (!found) return fail(503, '관리자 계정을 찾지 못했어요. (Vercel 환경 변수 AUTOPOST_USER_ID 로 글쓴이를 정해 주세요)');
    author = { id: found.id, baptismal_name: found.baptismal_name };
  }
  const userId = author.id;

  const existing = async () => {
    const { data, error } = await admin.from('posts').select('id').eq('user_id', userId).eq('autopost_key', clientKey).limit(1).maybeSingle();
    if (error) throw new Fail(isMissingColumn(error) ? 503 : 500, isMissingColumn(error) ? KEY_SQL_HINT : `글을 확인하지 못했어요 (${error.message})`);
    return data?.id as string | undefined;
  };
  const done = (id: string, duplicate = false) => Response.json({ ok: true, id, url: `${SITE}/?view=${id}`, ...(duplicate ? { duplicate: true } : {}) });

  const stored: { url: string; path: string | null }[] = [];
  try {
    // 같은 열쇠로 이미 올린 글이 있으면 그 글 (사진도 받지 않음)
    if (clientKey) {
      const id = await existing();
      if (id) return done(id, true);
    }
    const images = await Promise.all((urls as string[]).map((u, i) => fetchImage(u, i + 1)));
    if (dryRun) return Response.json({ ok: true, dry_run: true, author: author.baptismal_name || '교우', images: images.length, bytes: images.map(i => i.bytes.byteLength) });

    for (const img of images) stored.push(await storeImage(admin, userId, img));
    const row: Record<string, unknown> = {
      content, images: stored.map(s => s.url), user_id: userId, author_name: author.baptismal_name || '교우',
      ...(visibility !== 'public' ? { visibility } : {}), // 앱과 같게: 전체 공개면 칸을 비움(기본값)
      ...(clientKey ? { autopost_key: clientKey } : {}),
    };
    const { data: created, error } = await admin.from('posts').insert(row).select('id, user_id, author_name, content').single();
    if (error || !created) {
      await removeStored(admin, stored.splice(0));
      // 같은 열쇠의 글이 그사이 생겼으면(동시에 두 번 부름) 그 글
      if (error?.code === '23505' && clientKey) {
        const id = await existing();
        if (id) return done(id, true);
      }
      if (isMissingColumn(error) && clientKey) return fail(503, KEY_SQL_HINT);
      return fail(500, `글을 올리지 못했어요 (${error?.message || '알 수 없음'})`);
    }
    // 앱에서 글을 올릴 때처럼 @태그된 교우에게 휴대폰 알림 (실패해도 글은 그대로)
    await sendPushTargets(admin, await postMentionTargets(admin, created)).catch(() => 0);
    return done(created.id as string);
  } catch (e) {
    if (stored.length) await removeStored(admin, stored.splice(0));
    if (e instanceof Fail) return fail(e.status, e.message);
    console.error('autopost failed', e);
    return fail(500, '글을 올리지 못했어요.');
  }
}
