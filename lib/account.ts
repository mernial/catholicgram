import { supabase } from '@/lib/supabase';

// 로그아웃·탈퇴 때: 이 기기에 남은 사진(메시지·건의 사진 포함) 캐시와 화면 기록을 지운다 (같은 기기를 다른 사람이 쓸 때를 대비)
export async function clearPrivateData() {
  try { if (typeof caches !== 'undefined') await Promise.all(['catholicgram-img-v1', 'catholicgram-sw-meta'].map(n => caches.delete(n))); } catch { /* 무시 */ }
  try { ['linkLog', 'handledLinks', 'chatUserId', 'viewingUserId', 'activeTab'].forEach(k => localStorage.removeItem(k)); } catch { /* 무시 */ }
}
export async function signOutAndClear() {
  await supabase.auth.signOut().catch(() => {});
  await clearPrivateData();
}

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
  await signOutAndClear();
  return { ok: true };
}
