import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { mediaBase, mediaEnabled, mediaKeyFromUrl, mediaToken, mediaUrl } from '@/lib/media-server';

// 관리자 전용 데이터 사용량
//  - Supabase: 회원·DB 크기·예전 사진 저장소·표 크기 (supabase/admin-usage.sql 의 admin_usage 함수)
//  - Cloudflare R2: 지금 사진·영상 저장소 크기
//      사진 저장소 Worker 에 /__usage 가 있으면 그것으로(모든 파일),
//      없으면 앱이 쓰는 파일 주소를 모아 파일마다 크기를 물어서 더한다 (Worker 코드를 바꾸지 않아도 됨)
// Vercel 사용량은 Vercel 화면에서만 볼 수 있어 앱에서는 바로 가기만 보여 준다.
export const maxDuration = 60;

type Kinds = Record<string, { bytes: number; files: number }>;
type R2Usage = { bytes: number; files: number; byKind: Kinds; estimated?: boolean };

// 사진·영상 주소가 들어 있는 칸 (app/api/admin/migrate-media 와 같은 표 + 지운 메시지 보관)
const MEDIA_COLUMNS: { table: string; cols: string[]; arrayCol?: string }[] = [
  { table: 'posts', cols: ['video_url', 'video_poster'], arrayCol: 'images' },
  { table: 'profiles', cols: ['avatar_url'] },
  { table: 'messages', cols: ['image_url'] },
  { table: 'deleted_messages', cols: ['image_url'] },
  // 대화방 사진 묶음·단체방·사랑방 사진 (supabase/chat-media-menu.sql 뒤에 생기는 칸 — 따로 읽어 없으면 그것만 건너뜀)
  { table: 'messages', cols: [], arrayCol: 'images' },
  { table: 'deleted_messages', cols: [], arrayCol: 'images' },
  { table: 'group_chat_messages', cols: ['image_url'], arrayCol: 'images' },
  { table: 'lounge_messages', cols: ['image_url'], arrayCol: 'images' },
  { table: 'feedback', cols: ['image_url'] },
  { table: 'feedback', cols: [], arrayCol: 'images' }, // 건의 사진 여러 장 (supabase/feedback-photos.sql)
  { table: 'letters', cols: ['image_url'] },
  { table: 'sponsor_banners', cols: ['image_url'] },
  { table: 'bgm_tracks', cols: ['url'] },
];

// 파일 크기: 첫 1바이트만 받아 Content-Range(전체 크기)를 읽는다
async function fileSize(key: string): Promise<number | null> {
  const res = await fetch(mediaUrl(key), { headers: { Range: 'bytes=0-0' }, cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const total = Number(res.headers.get('content-range')?.split('/')[1]);
  res.body?.cancel().catch(() => {});
  if (Number.isFinite(total) && total > 0) return total;
  const length = Number(res.headers.get('content-length'));
  return Number.isFinite(length) && res.status === 200 ? length : null;
}

async function estimateR2(admin: SupabaseClient): Promise<R2Usage> {
  const keys = new Set<string>();
  const add = (u: unknown) => { const k = typeof u === 'string' ? mediaKeyFromUrl(u) : null; if (k) keys.add(k); };
  for (const t of MEDIA_COLUMNS) {
    const { data, error } = await admin.from(t.table).select([...t.cols, ...(t.arrayCol ? [t.arrayCol] : [])].join(',')).limit(20000);
    if (error || !data) continue; // 표나 칸이 없으면 건너뜀
    for (const row of data as unknown as Record<string, unknown>[]) {
      t.cols.forEach(c => add(row[c]));
      const arr = t.arrayCol ? row[t.arrayCol] : null;
      if (Array.isArray(arr)) arr.forEach(add);
    }
  }
  const list = Array.from(keys);
  const sizes: (number | null)[] = new Array(list.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < list.length) { const i = next++; sizes[i] = await fileSize(list[i]); }
  }));
  const byKind: Kinds = {};
  let bytes = 0, files = 0;
  list.forEach((key, i) => {
    const size = sizes[i];
    if (size === null) return; // 지워졌거나 못 읽은 파일
    const kind = key.split('/')[0] || '기타';
    byKind[kind] = byKind[kind] || { bytes: 0, files: 0 };
    byKind[kind].bytes += size; byKind[kind].files += 1;
    bytes += size; files += 1;
  });
  return { bytes, files, byKind, estimated: true };
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const [db, r2] = await Promise.all([
    admin.rpc('admin_usage'),
    (async (): Promise<R2Usage | null> => {
      if (!mediaBase()) return null;
      if (mediaEnabled()) {
        const res = await fetch(`${mediaBase()}/__usage`, {
          headers: { Authorization: `Bearer ${mediaToken('USAGE', '__usage', 60)}` }, cache: 'no-store',
        }).catch(() => null);
        const json = res?.ok ? await res.json().catch(() => null) : null;
        if (json && typeof json.bytes === 'number') return json as R2Usage;
      }
      return estimateR2(admin); // Worker 가 예전 코드면 파일마다 크기를 물어서
    })(),
  ]);

  return Response.json({
    supabase: db.error ? { setupNeeded: true } : db.data,
    r2,
    checkedAt: new Date().toISOString(),
  });
}
