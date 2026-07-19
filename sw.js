const CACHE_NAME = 'github-planet-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/front/css/home.css',
  '/front/css/responsive.css',
  '/front/img/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
