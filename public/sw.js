/**
 * MacroAI service worker — offline app shell.
 *
 * Strategy:
 *  - /_next/static/ assets are content-hashed and immutable → cache-first.
 *  - Page navigations and other same-origin GETs (RSC payloads, fonts,
 *    manifest) → network-first, falling back to the last cached response,
 *    and for navigations ultimately to the cached dashboard ('/').
 *  - Everything else (POSTs, GraphQL, server actions, cross-origin APIs)
 *    is never cached.
 *
 * Bump VERSION to invalidate all runtime caches on deploy of SW changes.
 */

const VERSION = 'v1';
const STATIC_CACHE = `macroai-static-${VERSION}`;
const RUNTIME_CACHE = `macroai-runtime-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) =>
      // Pre-warm the dashboard so a first offline launch after install works.
      cache.add('/').catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('macroai-') && !name.endsWith(`-${VERSION}`))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, { isNavigation }) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigation) {
      // Unvisited route while offline: serve the cached app shell.
      const shell = await caches.match('/');
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Never cache API routes or the service worker itself.
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  event.respondWith(networkFirst(request, { isNavigation: request.mode === 'navigate' }));
});
