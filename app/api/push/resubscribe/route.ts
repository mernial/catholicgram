import { createClient } from '@supabase/supabase-js';

// 휴대폰·브라우저가 알림 구독 주소를 새로 바꿨을 때(서비스 워커의 pushsubscriptionchange) 새 주소로 옮겨 적기.
// 예전엔 이 처리가 없어, 주소가 바뀐 뒤 보낸 알림은 옛 주소로 가서 실패(410 → 구독 지움)하고 앱을 다시 열어야 새로 적혔음
// → 그동안 온 알림은 앱을 열어야 보였음 (운영자 2026-11-21 '앱을 열어야 알림이 뒤늦게' 전수조사).
// 서비스 워커에는 로그인 정보가 없으므로, 옛 주소(그 기기와 서버만 아는 긴 주소)를 가진 구독만 바꿀 수 있게 한다.
type Keys = { p256dh?: string; auth?: string };
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ skipped: 'not configured' });
  const body = await request.json().catch(() => null) as { oldEndpoint?: string; endpoint?: string; keys?: Keys } | null;
  const oldEndpoint = body?.oldEndpoint, endpoint = body?.endpoint, keys = body?.keys;
  const ok = (u?: string) => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 2000;
  if (!ok(oldEndpoint) || !ok(endpoint) || !keys?.p256dh || !keys?.auth) return Response.json({ error: 'bad request' }, { status: 400 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: old } = await admin.from('push_subscriptions').select('id').eq('endpoint', oldEndpoint!).maybeSingle();
  if (!old) return Response.json({ skipped: 'unknown' });
  if (oldEndpoint !== endpoint) await admin.from('push_subscriptions').delete().eq('endpoint', endpoint!); // 새 주소가 이미 있으면 겹치지 않게
  const { error } = await admin.from('push_subscriptions').update({ endpoint, p256dh: keys.p256dh, auth: keys.auth }).eq('id', old.id);
  return Response.json(error ? { error: error.message } : { updated: true });
}
