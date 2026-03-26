// Custom Service Worker with NetworkFirst Strategy
// This service worker implements offline caching for the AI Email Box PWA

const CACHE_VERSION = 'v1';
const CACHE_NAME = `ai-emailbox-${CACHE_VERSION}`;
const API_CACHE_NAME = `ai-emailbox-api-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_CACHE_URLS = [
  '/',
  '/login',
  '/inbox',
  '/offline',
];

// API endpoints to cache with NetworkFirst strategy
const API_CACHE_PATTERNS = [
  /\/api\/emails/,
  /\/api\/kanban/,
  /\/api\/search/,
  /\/api\/auth\/me/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_CACHE_URLS.map(url => new Request(url, { cache: 'no-cache' })));
    }).then(() => {
      console.log('[SW] Static assets cached successfully');
      return self.skipWaiting();
    }).catch((error) => {
      console.error('[SW] Failed to cache static assets:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - implement NetworkFirst strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests - POST/PUT/DELETE cannot be cached
  if (request.method !== 'GET') return;

  // Check if request is for API
  const isApiRequest = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));

  if (isApiRequest) {
    // NetworkFirst strategy for API requests
    event.respondWith(networkFirstStrategy(request));
  } else {
    // CacheFirst strategy for static assets
    event.respondWith(cacheFirstStrategy(request));
  }
});

/**
 * NetworkFirst Strategy
 * Try network first, fall back to cache if offline
 * Perfect for API calls where fresh data is preferred
 */
async function networkFirstStrategy(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try to fetch from network
    const networkResponse = await fetch(request);
    
    // Only cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      // Clone the response before caching
      const responseToCache = networkResponse.clone();
      
      // Cache the fresh response
      cache.put(request, responseToCache).catch((error) => {
        console.warn('[SW] Failed to cache API response:', error);
      });
      
      console.log('[SW] Serving fresh data from network:', request.url);
    }
    
    return networkResponse;
  } catch {
    // Network failed, try cache
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Serving cached data:', request.url);
      // Add custom header to indicate this is cached data
      const headers = new Headers(cachedResponse.headers);
      headers.append('X-From-Cache', 'true');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers
      });
    }
    
    // No cache available, return offline response
    console.log('[SW] No cache available for:', request.url);
    return new Response(
      JSON.stringify({ 
        error: 'Offline',
        message: 'You are currently offline. Please check your internet connection.',
        cached: false
      }), 
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * CacheFirst Strategy
 * Try cache first, fall back to network
 * Perfect for static assets
 */
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Serving from cache:', request.url);
    return cachedResponse;
  }
  
  // Cache miss, fetch from network
  try {
    console.log('[SW] Cache miss, fetching from network:', request.url);
    const networkResponse = await fetch(request);
    
    // Cache the response for future use
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache).catch((error) => {
        console.warn('[SW] Failed to cache response:', error);
      });
    }
    
    return networkResponse;
  } catch {
    console.error('[SW] Network request failed');
    
    // Return offline page if available
    const offlinePage = await cache.match('/offline');
    if (offlinePage) {
      return offlinePage;
    }
    
    return new Response('Offline - No cached version available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    console.log('[SW] Received request to cache URLs:', event.data.urls);
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Received request to clear cache');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Background sync for failed requests (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-emails') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncEmails());
  }
});

async function syncEmails() {
  try {
    // This would sync any pending email operations when back online
    console.log('[SW] Syncing emails...');
    // Implementation depends on your specific needs
  } catch {
    console.error('[SW] Sync failed');
  }
}

console.log('[SW] Service Worker loaded');
