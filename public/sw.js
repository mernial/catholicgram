// 가톨릭그램 서비스 워커: 푸시 알림 수신 및 알림 클릭 처리
const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && !/Chrome|CriOS|Android/.test(self.navigator.userAgent);
// 앱 화면에 '이 알림의 대화방을 지금 보고 있나요?' 묻기 (0.5초 안에 답이 없으면 아니라고 봄)
const askViewing = (client, url) => new Promise(resolve => {
  const channel = new MessageChannel();
  const timer = setTimeout(() => resolve(false), 500);
  channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data === true); };
  try { client.postMessage({ type: 'viewing?', url }, [channel.port2]); } catch { clearTimeout(timer); resolve(false); }
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || '가톨릭그램';
  event.waitUntil((async () => {
    // 앱을 보고 있는 중이면: 휴대폰 알림음은 끄고, 앱이 '찬미예수님' 음성으로 알린다
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);
    const visible = windows.filter(c => c.visibilityState === 'visible');
    if (visible.length > 0) {
      // 지금 그 대화방(1:1·단체)을 보고 있으면 휴대폰 알림을 띄우지 않는다 (대화하는 중에 알림이 계속 뜨지 않게).
      // 아이폰·아이패드·맥 사파리는 푸시마다 알림을 꼭 띄워야 해서(안 띄우면 알림 권한을 거둠) 소리 없이 띄웠다가 바로 닫는다
      const viewing = (await Promise.all(visible.map(c => askViewing(c, data.url || '/')))).some(Boolean);
      visible.forEach(c => c.postMessage({ type: 'push-alert', url: data.url || '/', title, body: data.body || '' }));
      if (viewing && !isApple()) return;
      // 알림은 꼭 띄워야 하므로(안 띄우면 아이폰이 알림 권한을 거둬 감) 소리 없이 띄운다.
      // 앱을 보는 중에도 알림을 눌러 그 글·대화로 갈 수 있게 저절로 닫지 않는다 (앱에서 그곳을 열면 앱이 닫음)
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icon-v2-192.png',
        badge: '/icon-v2-192.png',
        tag: data.tag,
        silent: true,
        timestamp: Date.now(),
        data: { url: data.url || '/' },
      });
      if (viewing) {
        const shown = await self.registration.getNotifications(data.tag ? { tag: data.tag } : undefined).catch(() => []);
        shown.forEach(n => n.close());
      }
      return;
    }
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-v2-192.png',
      badge: '/icon-v2-192.png',
      tag: data.tag,
      renotify: !!data.tag, // 같은 대화/글의 알림이 또 와도 다시 소리·진동
      silent: false,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      data: { url: data.url || '/' },
    });
  })());
});

// 사진(게시물·프로필·광고)은 한 번 받으면 휴대폰에 보관해 두고 다시 받지 않는다 (서버 전송량 절약).
// 사진 주소는 올릴 때마다 새 이름이라 내용이 바뀌지 않는다. 영상은 부분 요청이라 제외.
const IMG_CACHE = 'catholicgram-img-v1';
const IMG_MAX = 500;
const IMG_PATH = /\/storage\/v1\/object\/public\/(community-images|avatars|sponsor-banners)\//;
// Cloudflare R2 저장소(Worker)의 사진 경로 (영상·음악 제외)
const R2_IMG_PATH = /^\/(posts|posters|avatars|stories|dm|feedback|sponsor|m\/(community-images|avatars|sponsor-banners))\//;
const isCachedImage = (url) => (url.hostname.endsWith('.supabase.co') && IMG_PATH.test(url.pathname)) || (url.hostname.endsWith('.workers.dev') && R2_IMG_PATH.test(url.pathname));
let trimming = false;
const trimImages = async () => {
  if (trimming) return;
  trimming = true;
  try {
    const cache = await caches.open(IMG_CACHE);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - IMG_MAX; i++) await cache.delete(keys[i]); // 오래된 것부터
  } catch { /* 무시 */ }
  trimming = false;
};
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isCachedImage(url)) return;
  event.respondWith((async () => {
    try {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
      if (res.ok) event.waitUntil(cache.put(req.url, res.clone()).then(trimImages).catch(() => {}));
      return res;
    } catch {
      return fetch(req);
    }
  })());
});

// 새 버전이 바로 적용되도록
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// 어떤 창이 '설치된 앱(홈 화면 앱)'인지 기억해 두었다가, 알림을 누르면 브라우저 탭이 아니라 앱으로 연다
const META_CACHE = 'catholicgram-sw-meta';
const readMeta = async () => {
  try {
    const res = await (await caches.open(META_CACHE)).match('/__meta');
    return res ? await res.json() : { standalone: [], hasApp: false };
  } catch { return { standalone: [], hasApp: false }; }
};
const writeMeta = async (meta) => {
  try { await (await caches.open(META_CACHE)).put('/__meta', new Response(JSON.stringify(meta))); } catch { /* 무시 */ }
};

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'client-info' || !event.source) return;
  event.waitUntil((async () => {
    const meta = await readMeta();
    const ids = new Set(meta.standalone);
    if (data.standalone) { ids.add(event.source.id); meta.hasApp = true; } else ids.delete(event.source.id);
    meta.standalone = Array.from(ids).slice(-20);
    await writeMeta(meta);
  })());
});

// 열려 있는 창을 '먼저' 앞으로 가져오고(휴대폰은 알림을 누른 직후에만 허용), 그다음 해당 화면으로 이동시킨다.
// 앱이 '알겠다'고 답하지 않으면(뒤에서 잠들어 있었거나 예전 버전) 그 창을 그 주소로 새로 연다.
const tellOpen = (client, url, wait) => new Promise((resolve) => {
  const channel = new MessageChannel();
  const timer = setTimeout(() => resolve(false), wait);
  channel.port1.onmessage = () => { clearTimeout(timer); resolve(true); };
  try { client.postMessage({ type: 'open-url', url }, [channel.port2]); } catch { clearTimeout(timer); resolve(false); }
});
const openInClient = async (client, url, log) => {
  let focused = null;
  try { focused = 'focus' in client ? await client.focus() : null; } catch (e) { focused = null; log.focusErr = String(e && e.message || e).slice(0, 60); }
  // 이미 보고 있는 창(앱을 보는 중에 알림을 누름)이면 앞으로 가져오지 못해도 이동 신호를 보낸다
  if (!focused && client.visibilityState === 'visible') focused = client;
  if (!focused) {
    // 앞으로 가져오지 못하면 새로 열고, 그것도 안 되면 그 창을 그 주소로 옮긴다
    const opened = await self.clients.openWindow(url).catch(() => null);
    if (opened) { log.path = 'openWindow'; return opened; }
    if ('navigate' in client) { log.path = 'navigate'; const n = await client.navigate(url).catch(() => null); log.navOk = !!n; return n; }
    log.path = 'none';
    return null;
  }
  if (await tellOpen(focused, url, 1200)) { log.path = 'message-ok'; return focused; }
  log.path = 'message-timeout';
  if ('navigate' in focused) { const n = await focused.navigate(url).catch(() => null); log.navOk = !!n; return n || focused; }
  return focused;
};

// 알림을 눌렀을 때 어떤 길로 열었는지 기록 (알림 목록 맨 아래 '알림 이동 기록'에서 확인, 문제 찾기용)
const logClick = async (entry) => {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match('/__clicklog');
    const list = res ? await res.json() : [];
    list.push({ at: Date.now(), ...entry });
    await cache.put('/__clicklog', new Response(JSON.stringify(list.slice(-15))));
  } catch { /* 무시 */ }
};

// 알림으로 가야 할 곳을 잠깐 적어 둔다. 앱이 새 버전으로 다시 열리거나(새로고침) 이동 메시지를 놓쳐도
// 앱이 열린 뒤 이걸 읽어 그 글·댓글·대화로 간다 (2분 안에 한 번만 쓰임).
const writePending = async (url) => {
  try { await (await caches.open(META_CACHE)).put('/__pending', new Response(JSON.stringify({ url, at: Date.now() }))); } catch { /* 무시 */ }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 알림 주소는 우리 사이트 안만 연다 (다른 사이트 주소면 첫 화면으로)
  const raw = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  const url = raw.origin === self.location.origin ? raw.href : new URL('/', self.location.origin).href;
  event.waitUntil((async () => {
    // 앞으로 가져오기는 누른 직후에만 허용되므로 기다리지 않고 바로. 갈 곳은 그사이에 적어 둔다.
    const saving = writePending(url);
    const [all, meta] = await Promise.all([self.clients.matchAll({ type: 'window', includeUncontrolled: true }), readMeta()]);
    const windows = all.filter((c) => new URL(c.url).origin === self.location.origin);
    // 1) 이미 열려 있는 앱 창 → 2) 지금 보고 있는 창(앱을 보는 중에 누른 경우) → 3) 앱이 설치된 휴대폰이면 앱을 새로 → 4) 열린 탭 → 5) 새 창
    const appWindow = windows.find((c) => meta.standalone.includes(c.id));
    const seen = windows.find((c) => c.focused) || windows.find((c) => c.visibilityState === 'visible');
    const target = appWindow || seen || (!meta.hasApp && windows[0]) || null;
    const log = { url: url.replace(self.location.origin, ''), wins: windows.length, app: !!appWindow, hasApp: !!meta.hasApp, vis: windows.map((c) => c.visibilityState[0]).join('') };
    const done = target ? openInClient(target, url, log) : self.clients.openWindow(url).then((w) => { log.path = w ? 'openWindow-new' : 'openWindow-null'; return w; });
    await Promise.all([saving, done]);
    await logClick(log);
  })().catch(() => self.clients.openWindow(url)));
});
