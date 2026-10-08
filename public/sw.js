// 가톨릭그램 서비스 워커: 푸시 알림 수신 및 알림 클릭 처리
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || '가톨릭그램';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-v2-192.png',
      badge: '/icon-v2-192.png',
      tag: data.tag,
      renotify: !!data.tag, // 같은 대화/글의 알림이 또 와도 다시 소리·진동
      silent: false,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      data: { url: data.url || '/' },
    })
  );
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
// 앞으로 가져오지 못하면 새로 연다.
const openInClient = async (client, url) => {
  let focused = null;
  try { focused = 'focus' in client ? await client.focus() : null; } catch { focused = null; }
  if (!focused) return self.clients.openWindow(url);
  const handled = await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 1500);
    channel.port1.onmessage = () => { clearTimeout(timer); resolve(true); };
    try { focused.postMessage({ type: 'open-url', url }, [channel.port2]); } catch { clearTimeout(timer); resolve(false); }
  });
  if (!handled && 'navigate' in focused) await focused.navigate(url).catch(() => {});
  return focused;
};

// 알림으로 가야 할 곳을 잠깐 적어 둔다. 앱이 새 버전으로 다시 열리거나(새로고침) 이동 메시지를 놓쳐도
// 앱이 열린 뒤 이걸 읽어 그 글·댓글·대화로 간다 (2분 안에 한 번만 쓰임).
const writePending = async (url) => {
  try { await (await caches.open(META_CACHE)).put('/__pending', new Response(JSON.stringify({ url, at: Date.now() }))); } catch { /* 무시 */ }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    await writePending(url);
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter((c) => new URL(c.url).origin === self.location.origin);
    const meta = await readMeta();
    // 1) 이미 열려 있는 앱 창 → 2) 앱이 설치된 휴대폰이면 앱을 새로 → 3) 열린 탭 → 4) 새 창
    const appWindow = windows.find((c) => meta.standalone.includes(c.id));
    if (appWindow) return openInClient(appWindow, url);
    if (meta.hasApp || windows.length === 0) return self.clients.openWindow(url);
    return openInClient(windows[0], url);
  })().catch(() => self.clients.openWindow(url)));
});
