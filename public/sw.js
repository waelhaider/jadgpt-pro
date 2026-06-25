// Simple service worker for PWA installation and Share Target support
const CACHE_NAME = 'jadgpt-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept the Share Target POST request
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const urlParam = formData.get('url') || '';
          
          // Get shared files (images). The name attribute in manifest.json is "images"
          const files = formData.getAll('images');
          
          const cache = await caches.open('shared-data');
          
          // Create metadata object
          const metadata = {
            title: String(title),
            text: String(text || urlParam),
            hasFile: files.length > 0 && files[0] instanceof File,
            timestamp: Date.now()
          };
          
          // Save metadata
          await cache.put('shared-meta', new Response(JSON.stringify(metadata)));
          
          // Save file if present
          if (files.length > 0 && files[0] instanceof File) {
            await cache.put('shared-file', new Response(files[0]));
          } else {
            await cache.delete('shared-file');
          }
          
          // Redirect using 303 (See Other) to convert POST to GET on '/'
          return Response.redirect('/?shared=true', 303);
        } catch (error) {
          console.error('Error handling share_target in Service Worker:', error);
          return Response.redirect('/?shared-error=true', 303);
        }
      })()
    );
    return;
  }

  // Simple pass-through fetch handler (required for PWA status)
  event.respondWith(
    fetch(event.request).catch(() => {
      // In case of offline, return from cache if needed
      return caches.match(event.request);
    })
  );
});
