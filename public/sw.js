// MailBoard Service Worker - FINAL ROBUST VERSION
const CACHE_NAME = 'mailboard-v3';
const OFFLINE_URL = '/~offline';

const PRECACHE_URLS = [
  '/',
  '/login',
  '/manifest.json',
  OFFLINE_URL
];

// Emergency HTML in case the cache fails
const EMERGENCY_OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - MailBoard</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f4f6; color: #374151; }
        .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
        button { background: #667eea; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>You're Offline</h1>
        <p>MailBoard is currently unable to connect to the server. Please check your internet connection.</p>
        <button onclick="window.location.reload()">Try Again</button>
    </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core assets...');
      return Promise.all(
        PRECACHE_URLS.map(url => {
          return fetch(url, { cache: 'no-cache' })
            .then(response => {
              if (response.ok) return cache.put(url, response);
              throw new Error(`Response not OK for ${url}`);
            })
            .then(() => console.log(`[SW] Cached: ${url}`))
            .catch(err => console.warn(`[SW] Skip cache for ${url}: ${err.message}`));
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map(key => {
            console.log('[SW] Clean old cache:', key);
            return caches.delete(key).catch(err => console.warn('[SW] Delete fail:', key, err.message));
          })
      );
    }).then(() => {
      console.log('[SW] Now controlling all clients');
      return self.clients.claim().catch(err => {
        console.warn('[SW] clients.claim() ignored:', err.message);
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Service Workers can only cache GET requests
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with latest version
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          console.log('[SW] Navigation failed, searching cache...');
          const cache = await caches.open(CACHE_NAME);

          // 1. Try to find the exact page in cache (e.g., /inbox)
          const matchedResponse = await cache.match(event.request);
          if (matchedResponse) return matchedResponse;

          // 2. Fallback to the dedicated offline page
          const offlineResponse = await cache.match(OFFLINE_URL);
          if (offlineResponse) return offlineResponse;

          // 3. Last resort: Emergency HTML
          return new Response(EMERGENCY_OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
  } else {
    // Stale-While-Revalidate for assets & API
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networked = fetch(event.request)
          .then((res) => {
            // Only cache successful GET responses
            if (res && res.status === 200 && res.type === 'basic') {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            return res;
          })
          .catch(() => {
            // If offline and not in cache, return a null response that the browser can handle
            // or a 404 equivalent
            return null;
          });

        // CRITICAL FIX: If both are null/undefined, we MUST return a valid Response or 
        // the browser throws TypeError: Failed to convert value to 'Response'
        return cached || networked || new Response('Not found', { status: 404, statusText: 'Offline and not cached' });
      })
    );
  }
});
