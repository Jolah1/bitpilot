/**
 * BitPilot service worker: offline app shell.
 *
 * Strategy, deliberately boring:
 *   - Navigations are network-first with the cached shell ('/') as the
 *     offline fallback, so deploys are picked up on the next online load
 *     and the app still opens in a dead spot.
 *   - '/assets/*' files carry a content hash in the name and are immutable,
 *     so they are cache-first forever; old versions are swept when the
 *     cache version rotates.
 *   - '/api/*' is NEVER touched. Progress, sessions, and challenges must
 *     always reflect the server, a stale mission completion is worse than
 *     an error message.
 *
 * Bump VERSION when the caching logic itself changes; asset churn does not
 * need a bump because hashed names never collide.
 */
const VERSION = 'bitpilot-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(VERSION)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
            )
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', (event) => {
    const req = event.request
    if (req.method !== 'GET') return
    const url = new URL(req.url)
    if (url.origin !== self.location.origin) return
    if (url.pathname.startsWith('/api/')) return

    // App navigations: network first, shell fallback when offline.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone()
                    caches.open(VERSION).then((cache) => cache.put('/', copy))
                    return res
                })
                .catch(() => caches.match('/')),
        )
        return
    }

    // Hashed immutable assets: cache first.
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(req).then(
                (hit) =>
                    hit ??
                    fetch(req).then((res) => {
                        const copy = res.clone()
                        caches.open(VERSION).then((cache) => cache.put(req, copy))
                        return res
                    }),
            ),
        )
        return
    }

    // Everything else same-origin (icons, manifest): cache with network
    // refresh so icon updates land without a version bump.
    event.respondWith(
        caches.match(req).then((hit) => {
            const refresh = fetch(req)
                .then((res) => {
                    const copy = res.clone()
                    caches.open(VERSION).then((cache) => cache.put(req, copy))
                    return res
                })
                .catch(() => hit)
            return hit ?? refresh
        }),
    )
})
