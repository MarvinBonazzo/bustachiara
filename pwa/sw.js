/* BustaChiara — service worker: tutto in cache, tutto offline.
   Alza la versione quando pubblichi un aggiornamento. */
const CACHE = 'bustachiara-v7-verifica-visuale';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first: l'app funziona anche in aereo. La rete si usa solo
   per scaricare eventuali aggiornamenti quando disponibile. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const navigazione = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((resp) => {
        if (resp.ok && new URL(e.request.url).origin === location.origin) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      }).catch((err) => {
        if (navigazione) return caches.match('./index.html');
        throw err;
      });
    })
  );
});
