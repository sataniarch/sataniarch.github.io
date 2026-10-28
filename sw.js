const VERSION = 'sa-v8';
const CORE = `${VERSION}-core`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/player.css',
  'css/audio.css',
  'js/main.js',
  'js/util.js',
  'js/store.js',
  'js/data.js',
  'js/ui.js',
  'js/player.js',
  'js/controls.js',
  'js/motion.js',
  'js/seekbar.js',
  'js/views.js',
  'js/router.js',
  'js/settings.js',
  'js/pwa.js',
  'fonts/forum-400.woff2',
  'fonts/garamond-400.woff2',
  'fonts/garamond-500.woff2',
  'fonts/garamond-400i.woff2',
  'fonts/mono-400.woff2',
  'fonts/mono-500.woff2',
  'assets/satania-logo.webp',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/satania-banner.webp',
  'meditations.json',
  'webarchive.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const hit = (await cache.match(request)) || (await caches.match(request));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, CORE).catch(() => caches.match('index.html'))
    );
    return;
  }

  if (/\.(?:woff2?|webp|png|jpe?g|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME));
    return;
  }

  event.respondWith(networkFirst(request, CORE));
});
