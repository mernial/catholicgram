import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { mediaBase, mediaEnabled, mediaToken } from '@/lib/media-server';

// 관리자 전용 데이터 사용량
//  - Supabase: 회원·DB 크기·예전 사진 저장소·표 크기 (supabase/admin-usage.sql 의 admin_usage 함수)
//  - Cloudflare R2: 지금 사진·영상 저장소 크기 (사진 저장소 Worker 의 /__usage, 관리 허가증 필요)
// Vercel 사용량은 Vercel 화면에서만 볼 수 있어 앱에서는 바로 가기만 보여 준다.

type R2Usage = { bytes: number; files: number; byKind: Record<string, { bytes: number; files: number }> };

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
    (async (): Promise<R2Usage | { needsWorkerUpdate: true } | null> => {
      if (!mediaEnabled()) return null;
      const res = await fetch(`${mediaBase()}/__usage`, {
        headers: { Authorization: `Bearer ${mediaToken('USAGE', '__usage', 60)}` }, cache: 'no-store',
      }).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      return json && typeof json.bytes === 'number' ? json as R2Usage : { needsWorkerUpdate: true };
    })(),
  ]);

  return Response.json({
    supabase: db.error ? { setupNeeded: true } : db.data,
    r2,
    checkedAt: new Date().toISOString(),
  });
}
