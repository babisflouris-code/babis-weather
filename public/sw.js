const STATIC_CACHE = 'babis-weather-static-v2';
const SHELL_ASSETS = ['/', '/manifest.webmanifest?v=2', '/icon.svg?v=2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  if (
    request.url.includes('/manifest.webmanifest') ||
    request.url.includes('/icon.svg') ||
    request.url.includes('/favicon.svg')
  ) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (
    request.url.includes('/v1/forecast') ||
    request.url.includes('/v1/search') ||
    request.url.includes('/v1/reverse')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
