// ================================================================
// sw.js — Service Worker v7
// Plateforme Restaurants Togo · Jo D. Digital
//
// NOUVEAUTÉS v7 (par rapport à v6) :
//   • Ajout handler PUSH pour les notifications nouvelles commandes
//   • Ajout handler NOTIFICATIONCLICK pour ouvrir l'admin au clic
//
// STRATÉGIES (inchangées) :
//   • Pages HTML (.html, navigation) → Network-first, JAMAIS en cache
//   • Fichiers locaux JS/CSS       → Network-first, JAMAIS en cache
//   • API Supabase (*.supabase.co) → Network-only, JAMAIS intercepté
//   • API Worker (/api/*)          → Network-only, JAMAIS intercepté
//   • Ressources CDN externes      → Cache-first (fonts, libs)
//   • Manifest / icônes            → Cache-first
// ================================================================

const CACHE_VERSION = 'restos-lome-v7';

// ── Ressources CDN à mettre en cache (ne changent jamais) ──────
const CDN_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
];

// ── Domaines à ne JAMAIS intercepter ──────────────────────────
const BYPASS_DOMAINS = [
  'supabase.co',
  'supabase.in',
];

// ── Chemins locaux à ne JAMAIS mettre en cache ─────────────────
const NO_CACHE_EXTENSIONS = ['.html', '.js', '.css', '.json'];
const NO_CACHE_PATHS = ['/api/'];

// ================================================================
// INSTALL — skipWaiting() immédiat
// ================================================================
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker v7 — Installation');
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

// ================================================================
// ACTIVATE — réclame tous les clients, nettoie les anciens caches
// ================================================================
self.addEventListener('activate', (event) => {
  console.log('🧹 Service Worker v7 — Activation');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => {
              console.log('🗑️ Suppression ancien cache :', name);
              return caches.delete(name);
            })
        );
      }),
    ])
  );
});

// ================================================================
// FETCH — stratégie selon le type de requête
// ================================================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (BYPASS_DOMAINS.some((d) => url.hostname.includes(d))) return;
  if (NO_CACHE_PATHS.some((p) => url.pathname.startsWith(p))) return;

  const isNavigation = request.mode === 'navigate';
  const isLocalFile =
    url.hostname === self.location.hostname &&
    NO_CACHE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (isNavigation || isLocalFile) {
    event.respondWith(networkFirst(request));
    return;
  }

  const isCDN = CDN_DOMAINS.some((d) => url.hostname.includes(d));
  if (isCDN) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

// ================================================================
// HELPERS fetch
// ================================================================
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request, {
      cache: 'no-store',
      headers: mergeNoCacheHeaders(request.headers),
    });
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Hors-ligne — contenu non disponible', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Ressource non disponible hors-ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

function mergeNoCacheHeaders(existingHeaders) {
  const flat =
    existingHeaders instanceof Headers
      ? Object.fromEntries(existingHeaders.entries())
      : {};
  return {
    ...flat,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

// ================================================================
// MESSAGE — réception de SKIP_WAITING depuis les pages
// ================================================================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ================================================================
// PUSH — réception des notifications nouvelles commandes
// ================================================================
self.addEventListener('push', (event) => {
  let data = {
    title: '🍽️ Nouvelle commande !',
    body:  'Une nouvelle commande vient d\'être passée.',
    url:   '/admin.html?panel=orders-admin',
    tag:   'new-order',
  };

  /* Décoder le payload envoyé par le Worker Cloudflare */
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      /* Payload texte brut */
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body:              data.body,
    icon:              '/icons/icon-192.png',
    badge:             '/icons/badge-72.png',
    tag:               data.tag || 'new-order',
    renotify:          true,
    requireInteraction: true,           /* reste visible jusqu'au clic */
    data:              { url: data.url },
    actions: [
      { action: 'view',    title: '👁 Voir la commande' },
      { action: 'dismiss', title: '✕ Ignorer'           },
    ],
    /* Vibration : schéma court-court-long */
    vibrate: [100, 50, 100, 50, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ================================================================
// NOTIFICATIONCLICK — navigation vers l'admin au clic
// ================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  /* Action "Ignorer" → juste fermer, ne rien ouvrir */
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/admin.html?panel=orders-admin';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        /* Réutiliser un onglet admin déjà ouvert si possible */
        for (const client of windowClients) {
          if (client.url.includes('/admin.html') && 'focus' in client) {
            client.postMessage({ type: 'PUSH_OPEN_ORDERS' });
            return client.focus();
          }
        }
        /* Sinon ouvrir un nouvel onglet */
        return clients.openWindow(targetUrl);
      })
  );
});

// ================================================================
// PUSHSUBSCRIPTIONCHANGE — renouvelle automatiquement l'abonnement
// expiré (certains navigateurs l'envoient à l'expiration)
// ================================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((newSub) => {
        /* Notifier la page pour qu'elle sauvegarde le nouvel abonnement */
        return self.clients.matchAll().then((cls) => {
          cls.forEach((c) =>
            c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() })
          );
        });
      })
      .catch((e) => console.error('pushsubscriptionchange error:', e))
  );
});
