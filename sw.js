// Service worker: bewaart de app-schil zodat de app snel opent en installeerbaar is.
// Gegevens (Supabase) gaan altijd via het netwerk en worden nooit gecachet.
const CACHE = 'urenbank-v5';
const SCHIL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/api.js', 'js/config.js', 'js/demo.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Netwerk eerst, cache als terugval: zo krijg je na een update direct de nieuwe versie.
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); } return res; })
      .catch(() => caches.match(e.request))
  );
});
