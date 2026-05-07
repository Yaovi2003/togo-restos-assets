// ================================================================
// Service Worker v5 — Installation et caching robustes
// Plateforme Restaurants Togo · Jo D. Digital
// ================================================================

const CACHE_NAME = 'restos-lome-v5';

const CRITICAL_ASSETS = [
    '/index.html',
    '/manifest.json',
    '/config.js',
];

const OPTIONAL_ASSETS = [
    '/view.html',
    '/admin.html',
    '/blog.html',
    '/checkout.html',
    '/tracking.html',
    '/qrcode.html',
];

// ═══════════════════════════════════════════════════════
// INSTALLATION
// ═══════════════════════════════════════════════════════

self.addEventListener('install', event => {
    console.log('🔄 Service Worker v5 — Installation');

    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);

                // 1. Cacher les assets CRITIQUES (tout doit réussir)
                console.log('📦 Mise en cache des assets critiques...');
                const criticalResults = await Promise.allSettled(
                    CRITICAL_ASSETS.map(url => cache.add(url))
                );

                const criticalFailures = criticalResults
                    .map((r, i) => r.status === 'rejected' ? CRITICAL_ASSETS[i] : null)
                    .filter(Boolean);

                if (criticalFailures.length > 0) {
                    throw new Error(`Assets critiques manquants: ${criticalFailures.join(', ')}`);
                }

                console.log('✅ Assets critiques cachés');

                // 2. Cacher les assets OPTIONNELS (silencieusement)
                console.log('📦 Mise en cache des assets optionnels...');
                Promise.allSettled(
                    OPTIONAL_ASSETS.map(url => cache.add(url))
                ).then(results => {
                    const failed = results
                        .map((r, i) => r.status === 'rejected' ? OPTIONAL_ASSETS[i] : null)
                        .filter(Boolean);
                    if (failed.length > 0) {
                        console.warn('Assets optionnels non cachés:', failed.join(', '));
                    }
                });

                return self.skipWaiting();

            } catch (err) {
                console.error('❌ Installation échouée:', err);
                throw err;
            }
        })()
    );
});

// ═══════════════════════════════════════════════════════
// REQUÊTES (Network-first avec fallback au cache)
// ═══════════════════════════════════════════════════════

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. GET seulement
    if (request.method !== 'GET') {
        return;
    }

    // 2. Pas de cache pour les APIs
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .catch(() => createOfflineResponse('Pas de connexion'))
        );
        return;
    }

    // 3. Pages HTML : Network-first
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(networkFirst(request));
        return;
    }

    // 4. Assets statiques : Cache-first
    event.respondWith(cacheFirst(request));
});

// ═══════════════════════════════════════════════════════
// STRATÉGIES
// ═══════════════════════════════════════════════════════

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        
        if (response.ok && response.status === 200) {
            const responseClone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, responseClone);
        }
        
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        
        return createOfflineResponse('Pas de connexion');
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        
        if (response.ok && response.status === 200) {
            const responseClone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, responseClone);
        }
        
        return response;
    } catch (err) {
        return createOfflineResponse('Ressource non disponible offline');
    }
}

function createOfflineResponse(message) {
    return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Offline</title>
            <style>
                body { 
                    font-family: sans-serif; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    margin: 0;
                    background: #080808;
                    color: #f0ece4;
                }
                div { text-align: center; }
                h1 { margin: 0 0 10px; }
                p { color: #6e6a64; margin: 0; }
            </style>
        </head>
        <body>
            <div>
                <h1>📡 Pas de connexion</h1>
                <p>${message}</p>
            </div>
        </body>
        </html>
    `, {
        status: 503,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

// ═══════════════════════════════════════════════════════
// ACTIVATION (Nettoyage des anciens caches)
// ═══════════════════════════════════════════════════════

self.addEventListener('activate', event => {
    console.log('🧹 Service Worker v5 — Activation');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('🗑 Suppression du cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('✅ Caches nettoyés');
            return self.clients.claim();
        })
    );
});

// ═══════════════════════════════════════════════════════
// MESSAGES (Mise à jour du cache)
// ═══════════════════════════════════════════════════════

self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('✅ Cache nettoyé');
        });
    }
});