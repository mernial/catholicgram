import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용: 테스터마다 정한 날(since, 기본 14일 전)부터 앱에 들어온 날·활동
// GET ?since=ISO → { since, kindTracked, testers: { [user_id]: { lastSeen, days, playDays, playDayList, lastPlay, posts, comments, reactions, messages } } }
// playDayList: Play 앱으로 들어온 한국 날짜들(출석 도장, lib/tester-attendance) — 접속 기록 + tester_signups.play_opened_at
// 접속은 app_sessions(서버만 읽음), 'Play 앱으로 들어온 날'은 app_sessions.app_kind = 'play'(supabase/app-sessions-kind.sql 뒤부터 쌓임)

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function fetchAll(admin: SupabaseClient, table: string, cols: string, apply: (q: any) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await apply(admin.from(table).select(cols)).range(page * 1000, page * 1000 + 999);
    if (error) return { rows, error };
    rows.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const asked = Date.parse(url.searchParams.get('since') || '');
  const sinceMs = Number.isFinite(asked) ? Math.max(asked, Date.now() - 60 * 86400e3) : Date.now() - 14 * 86400e3;
  const since = new Date(sinceMs).toISOString();

  const withOpen = await admin.from('tester_signups').select('user_id, play_opened_at');
  const { data: signups } = withOpen.error ? await admin.from('tester_signups').select('user_id') : withOpen; // 설치 확인 칸 전
  const opened = new Map<string, string>();
  (signups || []).forEach(s => { const o = (s as { play_opened_at?: string | null }).play_opened_at; if (o) opened.set(s.user_id as string, o); });
  const ids = [...new Set((signups || []).map(s => s.user_id as string))];
  if (ids.length === 0) return Response.json({ since, kindTracked: false, testers: {} });

  // 접속: app_kind 칸이 없으면(SQL 전) 빼고 다시
  let kindTracked = true;
  let sessions = await fetchAll(admin, 'app_sessions', 'user_id, started_at, last_seen_at, app_kind', q => q.in('user_id', ids).gte('last_seen_at', since));
  if (sessions.error) {
    kindTracked = false;
    sessions = await fetchAll(admin, 'app_sessions', 'user_id, started_at, last_seen_at', q => q.in('user_id', ids).gte('last_seen_at', since));
  }
  const count = async (table: string, col: string) => {
    const { rows } = await fetchAll(admin, table, col, q => q.in(col, ids).gte('created_at', since));
    const m = new Map<string, number>();
    rows.forEach(r => { const k = r[col] as string; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  };
  const [posts, comments, reactions, messages, lounge, groups] = await Promise.all([
    count('posts', 'user_id'), count('comments', 'user_id'), count('post_reactions', 'user_id'),
    count('messages', 'sender_id'), count('lounge_messages', 'user_id'), count('group_chat_messages', 'user_id'),
  ]);

  const out: Record<string, { lastSeen: string | null; days: number; playDays: number | null; playDayList: string[]; lastPlay: string | null; posts: number; comments: number; reactions: number; messages: number }> = {};
  for (const id of ids) {
    const mine = sessions.rows.filter(s => s.user_id === id);
    const days = new Set<string>(); const playDays = new Set<string>();
    let lastSeen: string | null = null; let lastPlay: string | null = null;
    for (const s of mine) {
      const seen = (s.last_seen_at || s.started_at) as string;
      days.add(kstDay(seen)); days.add(kstDay(s.started_at as string));
      if (!lastSeen || seen > lastSeen) lastSeen = seen;
      if (s.app_kind === 'play') {
        playDays.add(kstDay(seen)); playDays.add(kstDay(s.started_at as string));
        if (!lastPlay || seen > lastPlay) lastPlay = seen;
      }
    }
    const op = opened.get(id);
    if (op && op >= since) { playDays.add(kstDay(op)); if (!lastPlay || op > lastPlay) lastPlay = op; }
    const startDay = kstDay(since);
    const inRange = (set: Set<string>) => [...set].filter(d => d >= startDay).length;
    out[id] = {
      lastSeen, days: inRange(days), playDays: kindTracked ? inRange(playDays) : null, playDayList: [...playDays].filter(d => d >= startDay).sort(), lastPlay,
      posts: posts.get(id) || 0, comments: comments.get(id) || 0, reactions: reactions.get(id) || 0,
      messages: (messages.get(id) || 0) + (lounge.get(id) || 0) + (groups.get(id) || 0),
    };
  }
  return Response.json({ since, kindTracked, testers: out });
}
