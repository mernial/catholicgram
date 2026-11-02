// 알림 '확인함'을 여러 기기에서 함께 (운영자 2026-11-02: '하나의 기기에서 확인했으면 다른 기기에서도 확인한 것으로')
// 이 기기에 저장해 두던 값(localStorage)을 서버 한 줄(supabase/alert-sync.sql — user_alert_state)과 합친다:
//   알림 목록을 연 때(종 옆 숫자) · 모두 지우기 · 오늘 생일·축일 안내 접음 · 사랑방을 본 때 · 확인한 알림 · 지운 알림
// 합치는 규칙은 서버 함수 merge_alert_state: 시각은 늦은 쪽, 알림 표시는 합집합(4일 지난 것은 빠짐).
// 앱은 1분마다·다시 열 때(fetchNotifications·fetchLoungeNew 앞) 합치고, 이 기기에서 확인하면 곧바로(0.4초 뒤) 올린다.
// SQL 전이면(함수 없음) 조용히 예전처럼 이 기기에만.
import { supabase } from '@/lib/supabase';

/** 다른 기기에서 확인한 것이 들어와 이 기기 값이 바뀌면 (page 가 숫자·목록을 다시 읽음) */
export const ALERT_SYNC_EVENT = 'alert-state-synced';

const keysFor = (uid: string) => ({
  seen: `notificationsLastSeen:${uid}`,
  cleared: `notificationsClearedAt:${uid}`,
  feast: `feastClearedAt:${uid}`,
  lounge: `loungeSeenAt:${uid}`,
  read: `notificationsRead:${uid}`,
  hidden: `notificationsHidden:${uid}`,
});

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } };
const list = (k: string): string[] => { try { const v = JSON.parse(get(k) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } };
const iso = (v: string | null) => { if (!v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);

let unsupported = false;           // SQL 전 (함수 없음) → 이 기기에만
let inflight: Promise<boolean> | null = null;
let lastAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

type Row = {
  last_seen_at: string | null; cleared_at: string | null; feast_cleared_at: string | null; lounge_seen_at: string | null;
  read_keys: Record<string, number> | null; hidden_keys: Record<string, number> | null;
};

/** 이 기기 값과 서버 값을 합쳐 양쪽에 둔다. 이 기기 값이 바뀌었으면 true */
export function syncAlertState(uid: string, force = false): Promise<boolean> {
  if (unsupported || typeof window === 'undefined') return Promise.resolve(false);
  if (inflight && !force) return inflight;
  if (!force && Date.now() - lastAt < 1500) return Promise.resolve(false); // 같은 순간 여러 곳에서 부르면 한 번만
  const run = (async () => {
    const k = keysFor(uid);
    const local = {
      seen: iso(get(k.seen)), cleared: iso(get(k.cleared)), feast: iso(get(k.feast)), lounge: iso(get(k.lounge)),
      read: list(k.read), hidden: list(k.hidden),
    };
    const { data, error } = await supabase.rpc('merge_alert_state', {
      p_last_seen: local.seen, p_cleared: local.cleared, p_feast_cleared: local.feast, p_lounge_seen: local.lounge,
      p_read: local.read.slice(-600), p_hidden: local.hidden.slice(-600),
    });
    if (error) {
      // 함수가 아직 없음(SQL 전) → 이번 실행 동안은 다시 묻지 않음. 인터넷 끊김 등은 다음에 다시
      if (error.code === 'PGRST202' || error.code === '42883' || /merge_alert_state/.test(error.message || '')) unsupported = true;
      return false;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    if (!row) return false;
    let changed = false;
    const putTime = (key: string, mine: string | null, server: string | null) => {
      const v = iso(later(mine, server));
      if (v && v !== mine) { set(key, v); changed = true; }
    };
    putTime(k.seen, local.seen, row.last_seen_at);
    putTime(k.cleared, local.cleared, row.cleared_at);
    putTime(k.feast, local.feast, row.feast_cleared_at);
    putTime(k.lounge, local.lounge, row.lounge_seen_at);
    const putKeys = (key: string, mine: string[], server: Record<string, number> | null) => {
      const have = new Set(mine);
      const add = Object.keys(server || {}).filter(x => !have.has(x));
      if (add.length) { set(key, JSON.stringify([...mine, ...add].slice(-800))); changed = true; }
    };
    putKeys(k.read, local.read, row.read_keys);
    putKeys(k.hidden, local.hidden, row.hidden_keys);
    if (changed) window.dispatchEvent(new CustomEvent(ALERT_SYNC_EVENT));
    return changed;
  })().catch(() => false).finally(() => { if (inflight === run) inflight = null; lastAt = Date.now(); });
  inflight = run;
  return run;
}

/** 이 기기에서 확인·지움·목록 열기·사랑방 보기를 했을 때: 잠깐 모아서 서버에 올림 (다른 기기는 1분 안에·다시 열 때 받음) */
export function queueAlertSync(uid: string) {
  if (unsupported || typeof window === 'undefined') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncAlertState(uid, true); }, 400);
}
