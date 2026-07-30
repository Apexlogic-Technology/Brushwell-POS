const CACHE_NAME = 'brushwell-pos-v3';

// Install: immediate skipWaiting for instant updates
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: clean up all old caches to prevent stale script traps on iOS
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network-First strategy so iOS standalone webview never hangs on old hashes
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (url.includes('/supabase.co/') || url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
