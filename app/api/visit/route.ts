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
  const { data, error } = await admin.from('app_sessions')
    .insert({ user_id: userId, device_id: deviceId, standalone: !!body.standalone }).select('id').single();
  if (error) return Response.json({ skipped: error.message });
  return Response.json({ id: data.id });
}
