import { createClient } from '@supabase/supabase-js';

// 접속 기록: { action: 'start' } → 새 접속 id, { action: 'ping', id } → 아직 보고 있음
// 로그인했으면 Authorization 헤더로 누구인지 함께 기록한다.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ skipped: true });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string; deviceId?: string; standalone?: boolean };
  if (body.action === 'ping') {
    if (!body.id || !UUID.test(body.id)) return Response.json({ error: 'bad request' }, { status: 400 });
    await admin.from('app_sessions').update({ last_seen_at: new Date().toISOString() })
      .eq('id', body.id).gte('started_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    return Response.json({ ok: true });
  }
  if (body.action !== 'start') return Response.json({ error: 'bad request' }, { status: 400 });

  let userId: string | null = null;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    userId = user?.id || null;
  }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : null;
  // 앱은 늘 기기 표시를 함께 보낸다 — 없으면 앱 밖에서 보낸 요청이라 기록하지 않음
  if (!deviceId) return Response.json({ skipped: 'no device' });
  // 같은 기기가 1분 안에 다시 시작하면 새로 쌓지 않고 방금 것을 이어 쓴다 (기록을 마구 쌓는 공격 막기)
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent } = await admin.from('app_sessions').select('id').eq('device_id', deviceId).gte('started_at', minuteAgo).limit(1).maybeSingle();
  if (recent) return Response.json({ id: recent.id });
  // 1분에 300번이 넘게 들어오면 잠시 멈춤 (작은 공동체 앱에서는 정상 이용으로 나올 수 없는 양)
  const { count: lastMinute } = await admin.from('app_sessions').select('id', { count: 'exact', head: true }).gte('started_at', minuteAgo);
  if ((lastMinute || 0) > 300) return Response.json({ skipped: 'busy' });
  // 접속 기록은 1년까지만 둔다 (가끔 한 번씩 정리)
  if (Math.random() < 0.02) await admin.from('app_sessions').delete().lt('started_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString());
  const { data, error } = await admin.from('app_sessions')
    .insert({ user_id: userId, device_id: deviceId, standalone: !!body.standalone }).select('id').single();
  if (error) return Response.json({ skipped: error.message });
  return Response.json({ id: data.id });
}
