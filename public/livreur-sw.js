/**
 * livreur-sw.js — Service Worker mode hors-ligne
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * Cache : livreur.html, Leaflet CSS+JS, tuiles OSM de Lomé (bbox élargie)
 * Stratégie : Cache-first pour les assets statiques,
 *             Network-first pour les tuiles (avec fallback cache)
 */

const CACHE_NAME = 'livreur-v1';
const STATIC_ASSETS = [
    '/livreur.html',
    '/config.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

/* Tuiles OSM de Lomé et environs pré-cachées (zoom 10-15) */
/* On ne précache pas les tuiles — trop lourdes — on les cache à la demande */

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    /* Tuiles OSM — Network-first avec fallback cache */
    if (url.hostname === 'tile.openstreetmap.org') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    /* Assets statiques — Cache-first */
    if (
        STATIC_ASSETS.some(a => event.request.url.includes(a)) ||
        url.pathname === '/livreur.html' ||
        url.pathname === '/config.js'
    ) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request))
        );
        return;
    }

    /* Tout le reste — réseau normal */
});
