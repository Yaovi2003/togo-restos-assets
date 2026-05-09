// ================================================================
// sw.js — Service Worker v6
// Plateforme Restaurants Togo · Jo D. Digital
//
// STRATÉGIES :
//   • Pages HTML (.html, navigation) → Network-first, JAMAIS en cache
//   • Fichiers locaux JS/CSS       → Network-first, JAMAIS en cache
//   • API Supabase (*.supabase.co) → Network-only, JAMAIS intercepté
//   • API Worker (/api/*)          → Network-only, JAMAIS intercepté
//   • Ressources CDN externes      → Cache-first (fonts, libs)
//   • Manifest / icônes            → Cache-first
//
// POURQUOI v6 ?
//   L'ancien SW (v5) mettait en cache les pages HTML et les fichiers
//   JS locaux (config.js, admin.html, view.html...). Résultat :
//   les mises à jour du menu et de l'admin étaient invisibles jusqu'à
//   ce que l'utilisateur vide manuellement le cache. Ce SW corrige
//   ce comportement en n'appliquant le cache QUE sur les ressources
//   qui ne changent jamais (libs CDN, polices Google Fonts).
// ================================================================

const CACHE_VERSION = 'restos-lome-v6';

// ── Ressources CDN à mettre en cache (ne changent jamais) ──────
const CDN_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
];

// ── Domaines à ne JAMAIS intercepter ──────────────────────────
const BYPASS_DOMAINS = [
  'supabase.co',   // API données restaurant
  'supabase.in',
];

// ── Chemins locaux à ne JAMAIS mettre en cache ─────────────────
// Toute navigation, toute page HTML, tout fichier JS/CSS local
// doit toujours venir du réseau pour refléter les mises à jour.
const NO_CACHE_EXTENSIONS = ['.html', '.js', '.css', '.json'];
const NO_CACHE_PATHS = ['/api/']; // Worker endpoints

// ================================================================
// INSTALL — skipWaiting() immédiat pour remplacer l'ancien SW
// ================================================================
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker v6 — Installation');
  // Active immédiatement sans attendre la fermeture des onglets ouverts
  self.skipWaiting();
  // Aucun pré-cache des pages HTML — on ne veut PAS mettre admin.html
  // ou view.html en cache (ils doivent toujours être frais)
  event.waitUntil(Promise.resolve());
});

// ================================================================
// ACTIVATE — réclame tous les clients, nettoie les anciens caches
// ================================================================
self.addEventListener('activate', (event) => {
  console.log('🧹 Service Worker v6 — Activation');
  event.waitUntil(
    Promise.all([
      // Prendre le contrôle de tous les onglets ouverts immédiatement
      self.clients.claim(),
      // Supprimer TOUS les anciens caches (v1, v2, … v5)
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

  // ── 1. Ignorer les requêtes non-GET ──────────────────────────
  // POST, PUT, DELETE, PATCH → toujours réseau direct
  if (request.method !== 'GET') {
    return; // laisse passer sans interception
  }

  // ── 2. Ignorer les domaines Supabase ─────────────────────────
  // Les requêtes vers l'API de données ne doivent JAMAIS passer
  // par le cache — sinon les mises à jour de plats ne s'affichent pas.
  if (BYPASS_DOMAINS.some((d) => url.hostname.includes(d))) {
    return; // réseau direct, pas d'interception
  }

  // ── 3. Ignorer les endpoints /api/ du Worker ─────────────────
  if (NO_CACHE_PATHS.some((p) => url.pathname.startsWith(p))) {
    return; // réseau direct
  }

  // ── 4. Pages HTML & ressources locales → Network-first ───────
  // On ne met JAMAIS en cache les pages HTML ni les fichiers JS/CSS
  // locaux pour que les mises à jour soient visibles immédiatement.
  const isNavigation = request.mode === 'navigate';
  const isLocalFile =
    url.hostname === self.location.hostname &&
    NO_CACHE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (isNavigation || isLocalFile) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── 5. Ressources CDN → Cache-first ──────────────────────────
  // Les polices Google, les libs (Supabase JS, etc.) ne changent pas.
  // On les met en cache pour la performance et le mode hors-ligne.
  const isCDN = CDN_DOMAINS.some((d) => url.hostname.includes(d));
  if (isCDN) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── 6. Tout le reste → Network-first avec fallback cache ─────
  event.respondWith(networkFirst(request));
});

// ================================================================
// HELPERS
// ================================================================

/**
 * Network-first : tente le réseau, repli sur le cache si hors-ligne.
 * Toujours utiliser no-store pour ne pas laisser le navigateur
 * décider de mettre en cache la réponse HTTP.
 */
async function networkFirst(request) {
  try {
    // Fetch sans cache HTTP (évite la double mise en cache)
    const networkResponse = await fetch(request, {
      cache: 'no-store',
      headers: mergeNoCacheHeaders(request.headers),
    });
    return networkResponse;
  } catch {
    // Hors-ligne : essayer le cache comme dernier recours
    const cached = await caches.match(request);
    if (cached) return cached;
    // Pas de fallback possible
    return new Response('Hors-ligne — contenu non disponible', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Cache-first : sert depuis le cache si disponible, sinon réseau.
 * Utilisé pour les ressources CDN qui ne changent jamais.
 */
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

/**
 * Fusionne les headers existants avec les directives no-cache.
 * Gère le cas où headers est un objet Headers natif.
 */
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