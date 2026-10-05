import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용 접속 통계 (한국 시간 기준)
//  - 지금 접속 중: 최근 2분 안에 '아직 보고 있음' 신호가 온 사람
//  - 들어온 횟수: 앱을 연 횟수 / 나간 횟수: 그중 이미 나간(2분 넘게 신호 없음) 횟수
//  - 방문자 수: 같은 사람(로그인) 또는 같은 기기는 하루 한 명으로 셈

const ONLINE_MS = 2 * 60 * 1000;
const DAYS = 14;
const KST = 9 * 3600 * 1000;
const kstDay = (iso: string | number) => new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 10);

type Row = { user_id: string | null; device_id: string | null; standalone: boolean; started_at: string; last_seen_at: string };

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const now = Date.now();
  const todayKey = kstDay(now);
  const since = new Date(Date.parse(`${kstDay(now - (DAYS - 1) * 86400000)}T00:00:00+09:00`)).toISOString();

  const rows: Row[] = [];
  for (let page = 0; page < 60; page++) {
    const { data, error } = await admin.from('app_sessions')
      .select('user_id, device_id, standalone, started_at, last_seen_at')
      .gte('started_at', since).order('started_at', { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) {
      if (/app_sessions/.test(error.message)) return Response.json({ setupNeeded: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const who = (r: Row) => r.user_id ? `u:${r.user_id}` : `d:${r.device_id || Math.random()}`;
  const isOnline = (r: Row) => now - Date.parse(r.last_seen_at) < ONLINE_MS;

  const online = rows.filter(isOnline);
  const onlineMembers = new Set(online.filter(r => r.user_id).map(who)).size;
  const onlineGuests = new Set(online.filter(r => !r.user_id).map(who)).size;

  const days = Array.from({ length: DAYS }, (_, i) => kstDay(now - (DAYS - 1 - i) * 86400000));
  const byDay = new Map(days.map(d => [d, { visitors: new Set<string>(), members: new Set<string>(), entries: 0, exits: 0, staySum: 0, stayCount: 0 }]));
  const hours = Array(24).fill(0) as number[];
  rows.forEach(r => {
    const d = byDay.get(kstDay(r.started_at));
    if (!d) return;
    d.visitors.add(who(r));
    if (r.user_id) d.members.add(who(r));
    d.entries++;
    if (!isOnline(r)) {
      d.exits++;
      const stay = Date.parse(r.last_seen_at) - Date.parse(r.started_at);
      if (stay >= 0 && stay < 6 * 3600 * 1000) { d.staySum += stay; d.stayCount++; }
    }
    if (kstDay(r.started_at) === todayKey) hours[new Date(Date.parse(r.started_at) + KST).getUTCHours()]++;
  });

  const daily = days.map(day => {
    const d = byDay.get(day)!;
    return {
      day,
      visitors: d.visitors.size,
      members: d.members.size,
      entries: d.entries,
      exits: d.exits,
      avgStayMin: d.stayCount ? Math.round(d.staySum / d.stayCount / 60000 * 10) / 10 : 0,
    };
  });
  const weekVisitors = new Set(rows.filter(r => Date.parse(r.started_at) >= now - 7 * 86400000).map(who)).size;
  const appUsers = new Set(rows.filter(r => r.standalone && kstDay(r.started_at) === todayKey).map(who)).size;

  return Response.json({
    online: onlineMembers + onlineGuests, onlineMembers, onlineGuests,
    today: daily[daily.length - 1], yesterday: daily[daily.length - 2],
    weekVisitors, appUsers, hours, daily,
  });
}
