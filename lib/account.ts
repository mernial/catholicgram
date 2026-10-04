import { supabase } from '@/lib/supabase';

// 회원 탈퇴 요청 (app/api/account/delete). 성공하면 로그아웃까지 처리한다.
export async function deleteMyAccount(): Promise<{ ok: boolean; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: '로그인이 필요합니다.' };
  const res = await fetch('/api/account/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  }).catch(() => null);
  if (!res) return { ok: false, message: '네트워크 오류가 발생했습니다.' };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: body.error || '탈퇴 처리 중 오류가 발생했습니다.' };
  await supabase.auth.signOut().catch(() => {});
  return { ok: true };
}
