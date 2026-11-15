import { createClient } from '@supabase/supabase-js';
import { deleteAccountData } from '@/lib/account-delete';

// 회원 탈퇴: 로그인한 본인의 계정과 작성한 데이터를 모두 삭제한다.
// (구글 플레이·앱스토어 정책: 앱 안에서 계정 삭제가 가능해야 함)

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: '서버 설정이 완료되지 않았습니다. 운영자에게 문의해주세요.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const uid = user.id;

  const result = await deleteAccountData(admin, uid);
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ deleted: true });
}
