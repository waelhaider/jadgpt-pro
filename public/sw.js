// Core service worker for PWA caching, performance optimization, and Share Target support
const CACHE_NAME = 'jadgpt-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/admin.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Pre-caching core application shell assets...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME, 'shared-data'];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old Service Worker cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept the Share Target POST request
  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const urlParam = formData.get('url') || '';
          
          // Get shared files (images). The name attribute in manifest.json is "media"
          const files = formData.getAll('media');
          
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

  // Optimize load performance: Stale-While-Revalidate caching for static assets
  if (event.request.method === 'GET') {
    const isStaticAsset = 
      url.origin === self.location.origin && 
      !url.pathname.startsWith('/api/') &&
      (
        url.pathname === '/' ||
        url.pathname === '/index.html' ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.jpeg') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.ico') ||
        url.pathname.endsWith('.json') ||
        url.pathname.endsWith('.woff') ||
        url.pathname.endsWith('.woff2')
      );

    const isExternalFontOrIcon = 
      url.hostname.includes('fonts.googleapis.com') || 
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('unpkg.com');

    if (isStaticAsset || isExternalFontOrIcon) {
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            }).catch((err) => {
              console.log('Fetch failed, returning offline cache if available:', err);
            });

            // Return cached resource instantly if it exists, otherwise fall back to network fetch
            return cachedResponse || fetchPromise;
          });
        })
      );
      return;
    }
  }

  // For any other requests (like external APIs, Firestore, or /api/download),
  // we do NOT call event.respondWith(), allowing the browser to handle them natively.
});

// Background push notification event listener
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'منشور جديد مضاف! 📣', body: event.data.text() };
    }
  }

  const title = data.title || 'منشور جديد مضاف! 📣';
  const options = {
    body: data.body || 'قم بزيارة التطبيق لرؤية آخر التحديثات والصور المولدة.',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click behavior (opening or focusing the PWA window)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const targetUrl = event.notification.data ? event.notification.data.url : '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

