// Simple service worker for PWA installation and Share Target support
const CACHE_NAME = 'jadgpt-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through fetch handler (required for PWA status)
  event.respondWith(
    fetch(event.request).catch(() => {
      // In case of offline, return from cache if needed
      return caches.match(event.request);
    })
  );
});
