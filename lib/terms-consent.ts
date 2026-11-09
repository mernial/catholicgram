// 이용약관·커뮤니티 규칙 동의 (구글 플레이 UGC 정책: 콘텐츠를 올리기 전에 약관 동의, 건너뛸 수 없음)
// 동의한 때는 서버 profiles.terms_accepted_at(supabase/terms-consent.sql)에 적고, 칸이 아직 없으면 이 기기에만 적는다.
import type { SupabaseClient } from '@supabase/supabase-js';

const key = (uid: string) => `termsAccepted:${uid}`;

export const termsAcceptedLocally = (uid: string) => { try { return !!localStorage.getItem(key(uid)); } catch { return false; } };

/** 동의한 때를 서버에 적는다. 칸이 없으면(SQL 전) 이 기기에만. 돌려주는 값: 'server' | 'local' | 'error' */
export async function saveTermsAccepted(supabase: SupabaseClient, uid: string): Promise<'server' | 'local' | 'error'> {
  const now = new Date().toISOString();
  try { localStorage.setItem(key(uid), now); } catch {}
  const { error } = await supabase.from('profiles').update({ terms_accepted_at: now }).eq('id', uid);
  if (!error) return 'server';
  if (error.code === 'PGRST204' || error.code === '42703') return 'local';
  return 'error';
}

/** 동의가 필요한가: 서버 칸이 비어 있고(또는 칸이 없고) 이 기기에도 동의 기록이 없을 때 */
export const needsTermsConsent = (uid: string | undefined, acceptedAt: string | null | undefined) =>
  !!uid && !acceptedAt && !termsAcceptedLocally(uid);

/** 가입·동의 창에 보여 주는 핵심 규칙 (이용약관 2·3조 요약) */
export const TERMS_SUMMARY = [
  '음란물·폭력·혐오·괴롭힘·타인 비방, 미성년자를 해치는 모든 콘텐츠는 올릴 수 없어요 (발견 즉시 삭제, 계정 정지)',
  '게시글·댓글·대화는 🚨 신고할 수 있고, 운영자가 확인해 조치해요. 불편한 교우는 🚫 차단할 수 있어요',
  '내가 올린 글·사진의 책임은 나에게 있고, 다른 사람의 저작물·개인정보는 허락 없이 올릴 수 없어요',
  '만 14세 이상만 가입할 수 있어요',
];
