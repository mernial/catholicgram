import { supabase } from '@/lib/supabase';

// 접속 통계용 기록: 앱을 열면 '접속 1회', 보고 있는 동안 1분마다 '아직 있음'.
// 15초 넘게 다른 앱에 있다가 돌아오면 새 접속으로 센다.

const PING_MS = 60 * 1000;
const NEW_VISIT_AFTER_MS = 15 * 1000;

const deviceId = () => {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
    return id;
  } catch { return null; }
};

const post = async (body: object, keepalive = false) => {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch('/api/visit', {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => ({}));
};

export function startVisitTracking() {
  let visitId: string | null = null;
  let hiddenAt = 0;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const start = async () => {
    const res = await post({ action: 'start', deviceId: deviceId(), standalone });
    visitId = typeof res.id === 'string' ? res.id : null;
  };
  const ping = (keepalive = false) => { if (visitId) post({ action: 'ping', id: visitId }, keepalive); };

  start();
  const timer = setInterval(() => { if (document.visibilityState === 'visible') ping(); }, PING_MS);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); ping(true); return; }
    if (hiddenAt && Date.now() - hiddenAt > NEW_VISIT_AFTER_MS) start(); else ping();
    hiddenAt = 0;
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
}
