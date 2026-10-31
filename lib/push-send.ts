// 서버 전용: 휴대폰 알림 보내기 (사람마다 알림 내용 하나). /api/autopost 처럼 로그인한 교우가 부르지 않는 서버 일에서 쓴다.
// (앱이 부르는 /api/push/notify 는 메시지 알림의 '애플 기기 잠깐 기다리기'까지 있어 따로 둔다 — 보내는 방식은 같음)
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { extractMentions } from '@/lib/mentions';
import { postPlainText } from '@/lib/stickers';
import { onePerDevice, type PushSub } from '@/lib/push-devices';

export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushTarget = { recipientId: string; payload: PushPayload };

export const truncatePush = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max)}…` : text);

// 새 글에서 @태그된 교우에게 갈 알림 (글쓴이 빼고) — 앱에서 글을 올릴 때(/api/push/notify type=post)와 같은 알림
export async function postMentionTargets(
  admin: SupabaseClient,
  post: { id: string; user_id: string; author_name: string | null; content: string | null },
): Promise<PushTarget[]> {
  const handles = extractMentions(post.content);
  if (handles.length === 0) return [];
  const { data } = await admin.from('profiles').select('id').in('handle', handles.slice(0, 20));
  return (data || []).map(p => p.id as string).filter(pid => pid !== post.user_id).map(pid => ({
    recipientId: pid,
    payload: {
      title: '🏷️ 글에서 회원님을 언급했어요',
      body: `${post.author_name || '교우'}님: ${truncatePush(postPlainText(post.content))}`,
      url: `/?view=${post.id}`,
      tag: `mention-${post.id}`,
    },
  }));
}

// 알림 보내기 (알림 설정이 없으면 아무 일도 안 함, 실패해도 던지지 않음) → 보낸 개수
export async function sendPushTargets(admin: SupabaseClient, targets: PushTarget[]): Promise<number> {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (targets.length === 0 || !VAPID_PUBLIC_KEY || !privateKey) return 0;
  // 알림마다 주소에 고유 표시(n) — 앱이 같은 알림 주소로 두 번 열리지 않게 (/api/push/notify 와 같음)
  const nonce = Date.now().toString(36);
  const payloadByUser = new Map(targets.map(t => [t.recipientId, { ...t.payload, url: `${t.payload.url}${t.payload.url.includes('?') ? '&' : '?'}n=${nonce}` }]));
  const { data: rows } = await admin.from('push_subscriptions').select('*').in('user_id', [...payloadByUser.keys()]);
  const subs = onePerDevice((rows || []) as (PushSub & { user_id: string })[]); // 같은 기기에는 한 번만
  if (subs.length === 0) return 0;
  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, privateKey);
  const results = await Promise.allSettled(subs.map(sub =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payloadByUser.get(sub.user_id)))));
  // 만료되었거나 해지된 구독은 정리
  const expired = subs.filter((_, i) => {
    const r = results[i];
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return status === 404 || status === 410;
  });
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired.map(s => s.id));
  return results.filter(r => r.status === 'fulfilled').length;
}
