/* オフラインでも遊べるように、アプリ本体をキャッシュする。
 * ファイルを変えたら VERSION を上げること。 */
const CACHE_PREFIX = 'leopa-preview-codex-';
const VERSION = CACHE_PREFIX + 'cd7b24f2a9a2';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/vendor/three.min.js', 'js/genetics.js', 'js/art.js', 'js/scene3d.js', 'js/music.js', 'js/kids.js', 'js/photo-save.js', 'js/app.js',
  'assets/gecko.glb', 'assets/decor-kit.bin', 'assets/logo.webp',
  'assets/expo/hero.webp', 'assets/expo/banner.webp', 'assets/expo/booth.webp', 'assets/expo/ticket.webp', 'assets/expo/trophy1.webp', 'assets/expo/trophy2.webp', 'assets/expo/trophy3.webp', 'assets/img/room-day.webp', 'assets/img/room-night.webp', 'assets/img/cage-gold-back.webp', 'assets/img/cage-gold-floor.webp', 'assets/img/cage-night-back.webp', 'assets/img/cage-night-floor.webp', 'assets/img/license.webp', 'assets/logo.png', 'icons/favicon-64.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(c => c.match(e.request)).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && e.request.url.startsWith(self.registration.scope)) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => hit)));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
