const CACHE_VERSION = 'v' + Date.now();
const CACHE_NAME = 'laundry-' + CACHE_VERSION;
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const scopedPath = (path) => `${scopePath}${path}`;
const urlsToCache = [
  scopedPath('/offline.html')
];

// Install event - cache only offline page
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch event - Network first strategy
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Don't cache, always return fresh content
        return response;
      })
      .catch(() => {
        // Only use cache for offline page
        if (event.request.destination === 'document') {
          return caches.match(scopedPath('/offline.html'));
        }
      })
  );
});

// Activate event - clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
