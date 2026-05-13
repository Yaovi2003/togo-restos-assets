/**
 * worker-sitemap-snippet.js — Routes /sitemap.xml et /robots.txt
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE AU WORKER CLOUDFLARE :
 *  • GET /sitemap.xml → XML dynamique lu depuis Supabase (restaurants actifs)
 *  • GET /robots.txt  → directive Sitemap + allow toutes les pages publiques
 *
 * INTÉGRATION :
 *  Copier les fonctions ci-dessous dans votre worker.js et ajouter dans
 *  le handler fetch :
 *
 *    if (path === '/sitemap.xml') return handleSitemap(env);
 *    if (path === '/robots.txt')  return handleRobots(env);
 *
 * VARIABLES D'ENVIRONNEMENT REQUISES (déjà présentes dans votre Worker) :
 *  SUPABASE_URL        → URL de votre projet Supabase
 *  SUPABASE_ANON_KEY   → Clé publique anon (lecture seule)
 *
 * PAGES INCLUSES DANS LE SITEMAP :
 *  • / (index — annuaire des restaurants)
 *  • /blog.html (blog gastronomie)
 *  • /view.html?id=<slug> pour chaque restaurant actif
 *  • Articles de blog (si table blog_articles disponible)
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   HELPER : Requête Supabase REST depuis le Worker
══════════════════════════════════════════════════════════════════ */
async function supabaseGet(env, table, select, filter = '') {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=${select}${filter ? '&' + filter : ''}`;
    const res = await fetch(url, {
        headers: {
            'apikey':        env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
    });
    if (!res.ok) return [];
    return res.json();
}


/* ══════════════════════════════════════════════════════════════════
   GET /sitemap.xml
══════════════════════════════════════════════════════════════════ */
async function handleSitemap(request, env) {
    const baseUrl   = new URL(request.url).origin;
    const todayISO  = new Date().toISOString().split('T')[0];

    /* ── Pages statiques ── */
    const staticUrls = [
        { loc: `${baseUrl}/`,          changefreq: 'daily',  priority: '1.0', lastmod: todayISO },
        { loc: `${baseUrl}/blog.html`, changefreq: 'weekly', priority: '0.7', lastmod: todayISO },
    ];

    /* ── Restaurants actifs ── */
    let restaurantUrls = [];
    try {
        const restaurants = await supabaseGet(
            env,
            'restaurants',
            'slug,updated_at',
            'is_active=eq.true&order=name.asc&limit=500'
        );

        restaurantUrls = (restaurants || [])
            .filter(r => r.slug && /^[a-z0-9-]+$/.test(r.slug))
            .map(r => ({
                loc:        `${baseUrl}/view.html?id=${encodeURIComponent(r.slug)}`,
                changefreq: 'weekly',
                priority:   '0.8',
                lastmod:    r.updated_at
                    ? r.updated_at.split('T')[0]
                    : todayISO,
            }));
    } catch (_) {}

    /* ── Articles de blog ── */
    let blogUrls = [];
    try {
        const articles = await supabaseGet(
            env,
            'blog_articles',
            'slug,created_at',
            'published=eq.true&order=created_at.desc&limit=200'
        );

        blogUrls = (articles || [])
            .filter(a => a.slug)
            .map(a => ({
                loc:        `${baseUrl}/blog.html?article=${encodeURIComponent(a.slug)}`,
                changefreq: 'monthly',
                priority:   '0.6',
                lastmod:    a.created_at
                    ? a.created_at.split('T')[0]
                    : todayISO,
            }));
    } catch (_) {}

    /* ── Construction du XML ── */
    const allUrls = [...staticUrls, ...restaurantUrls, ...blogUrls];

    const urlEntries = allUrls.map(u => `  <url>
    <loc>${_xmlEsc(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries}
</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type':  'application/xml; charset=UTF-8',
            'Cache-Control': 'public, max-age=3600', /* Re-généré toutes les heures */
            'X-Sitemap-Count': String(allUrls.length),
        },
    });
}


/* ══════════════════════════════════════════════════════════════════
   GET /robots.txt
══════════════════════════════════════════════════════════════════ */
function handleRobots(request, env) {
    const baseUrl = new URL(request.url).origin;

    const body = `User-agent: *
Allow: /

# Pages privées — ne pas indexer
Disallow: /admin.html
Disallow: /onboarding.html
Disallow: /set-password.html
Disallow: /api/
Disallow: /qr.html

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay recommandé
Crawl-delay: 1
`;

    return new Response(body, {
        headers: {
            'Content-Type':  'text/plain; charset=UTF-8',
            'Cache-Control': 'public, max-age=86400',
        },
    });
}


/* ══════════════════════════════════════════════════════════════════
   HELPER XML
══════════════════════════════════════════════════════════════════ */
function _xmlEsc(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&apos;');
}


/* ══════════════════════════════════════════════════════════════════
   SOUMETTRE LE SITEMAP À GOOGLE (à faire UNE FOIS manuellement)
   ou automatiquement depuis le Worker lors du premier déploiement.

   URL à visiter dans un navigateur (remplacer VOTRE_DOMAINE) :
   https://www.google.com/ping?sitemap=https://VOTRE_DOMAINE/sitemap.xml
══════════════════════════════════════════════════════════════════ */

// Export pour le Worker
// export { handleSitemap, handleRobots };
