import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { mediaEnabled, putMedia } from '@/lib/media-server';

// 관리자 전용: 수파베이스 저장소에 있는 사진·영상을 Cloudflare R2 로 옮기고 주소를 바꾼다.
// GET  → { enabled, remaining: { 표: 남은 파일 수 } }
// POST → 한 번에 몇 개씩 옮김 { moved, failed: [...], remaining } — 관리자 화면이 다 옮길 때까지 반복해서 부른다.
// 수파베이스 파일은 지우지 않는다 (확인 후 대시보드에서 직접 지우면 저장 공간이 비워짐).
export const maxDuration = 60;

type Table = { table: string; cols: string[]; arrayCol?: string };
const TABLES: Table[] = [
  { table: 'posts', cols: ['video_url', 'video_poster'], arrayCol: 'images' },
  { table: 'profiles', cols: ['avatar_url'] },
  { table: 'messages', cols: ['image_url'] },
  { table: 'feedback', cols: ['image_url'] },
  { table: 'sponsor_banners', cols: ['image_url'] },
  { table: 'bgm_tracks', cols: ['url'] },
];

const isSupabaseFile = (u: unknown, base: string): u is string =>
  typeof u === 'string' && u.startsWith(`${base}/storage/v1/object/public/`);

async function authAdmin(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return null;
  return { admin, base: supabaseUrl.replace(/\/+$/, '') };
}

// 표마다 아직 수파베이스 주소를 가진 줄
async function pending(admin: SupabaseClient, base: string) {
  const out: { t: Table; rows: Record<string, unknown>[] }[] = [];
  for (const t of TABLES) {
    const cols = ['id', ...t.cols, ...(t.arrayCol ? [t.arrayCol] : [])].join(', ');
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t.table).select(cols).range(from, from + 999);
      if (error || !data) break; // 표나 칸이 없으면 건너뜀
      rows.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < 1000) break;
    }
    out.push({
      t,
      rows: rows.filter(r => t.cols.some(c => isSupabaseFile(r[c], base)) || (t.arrayCol && Array.isArray(r[t.arrayCol]) && (r[t.arrayCol] as unknown[]).some(u => isSupabaseFile(u, base)))),
    });
  }
  return out;
}

const countFiles = (list: Awaited<ReturnType<typeof pending>>, base: string) =>
  Object.fromEntries(list.map(({ t, rows }) => [t.table, rows.reduce((n, r) =>
    n + t.cols.filter(c => isSupabaseFile(r[c], base)).length + (t.arrayCol && Array.isArray(r[t.arrayCol]) ? (r[t.arrayCol] as unknown[]).filter(u => isSupabaseFile(u, base)).length : 0), 0)]));

export async function GET(request: Request) {
  const ctx = await authAdmin(request);
  if (!ctx) return Response.json({ error: 'forbidden' }, { status: 403 });
  return Response.json({ enabled: mediaEnabled(), remaining: countFiles(await pending(ctx.admin, ctx.base), ctx.base) });
}

export async function POST(request: Request) {
  const ctx = await authAdmin(request);
  if (!ctx) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!mediaEnabled()) return Response.json({ error: 'R2 설정(NEXT_PUBLIC_MEDIA_URL, R2_UPLOAD_SECRET)이 아직 없어요.' }, { status: 400 });
  const { admin, base } = ctx;
  const started = Date.now();
  const failed: string[] = [];
  let moved = 0;
  const copied = new Map<string, string>();

  // 파일 하나 복사: 수파베이스 → R2 (경로는 m/버킷/원래경로)
  const copy = async (url: string) => {
    if (copied.has(url)) return copied.get(url)!;
    const path = url.slice(`${base}/storage/v1/object/public/`.length).split('?')[0];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const type = res.headers.get('content-type') || 'application/octet-stream';
    const next = await putMedia(`m/${decodeURIComponent(path)}`, await res.arrayBuffer(), type);
    copied.set(url, next);
    moved += 1;
    return next;
  };

  outer: for (const { t, rows } of await pending(admin, base)) {
    for (const r of rows) {
      if (Date.now() - started > 40_000) break outer; // 시간 안에 끝내고 다음 번에 이어서
      const changes: Record<string, unknown> = {};
      try {
        for (const c of t.cols) if (isSupabaseFile(r[c], base)) changes[c] = await copy(r[c] as string);
        if (t.arrayCol && Array.isArray(r[t.arrayCol])) {
          const arr = r[t.arrayCol] as unknown[];
          if (arr.some(u => isSupabaseFile(u, base))) changes[t.arrayCol] = await Promise.all(arr.map(u => isSupabaseFile(u, base) ? copy(u) : u));
        }
      } catch (err) {
        failed.push(`${t.table}:${String(r.id)} (${err instanceof Error ? err.message : err})`);
        continue;
      }
      if (Object.keys(changes).length) {
        const { error } = await admin.from(t.table).update(changes).eq('id', r.id as string);
        if (error) failed.push(`${t.table}:${String(r.id)} (${error.message})`);
      }
    }
  }
  return Response.json({ moved, failed, remaining: countFiles(await pending(admin, base), base) });
}
