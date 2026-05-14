// ================================================================
// index.js — Cloudflare Worker · Proxy Sécurisé
// Plateforme Restaurants Togo · Jo D. Digital
// ================================================================

// Rate limiting avec Map (en mémoire, réinitialisé au déploiement)
// ⚠️ NOTE : chaque instance Worker a son propre Map — le rate limit
//    est donc par-instance, pas global. Pour un rate limit réel,
//    migrer vers Cloudflare KV ou Durable Objects.
const rateLimitMap = new Map();
// Sitemap & robots.txt
import { handleSitemap, handleRobots } from './worker-sitemap-snippet.js';
import { handleReverseGeocode, handleDistance } from './worker-geoloc-snippet.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/config → Fournit la config Supabase
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/config') {
            return new Response(JSON.stringify({
                supabaseUrl: env.SUPABASE_URL,
                supabaseKey: env.SUPABASE_ANON_KEY,
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    // ✅ FIX-1 : était 'public, max-age=3600' — un CDN intermédiaire pouvait
                    //    mettre en cache la clé Supabase. On passe en no-store.
                    'Cache-Control': 'private, no-store',
                },
            });
        }


        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/db → Proxy DB sécurisé
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/db' && request.method === 'POST') {
            return handleDatabaseProxy(request, env, clientIP);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/upload-image → Upload sécurisé vers GitHub
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/upload-image' && request.method === 'POST') {
            return handleImageUpload(request, env);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/verify-password → Vérification admin sécurisée
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/verify-password' && request.method === 'POST') {
            return handlePasswordCheck(request, env, clientIP);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/csrf-token → Génération token CSRF
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/csrf-token') {
            return handleCSRFToken(request, env);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/og-image → Image de prévisualisation
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/og-image') {
            const name = url.searchParams.get('name') || 'Restaurant';
            const color = url.searchParams.get('color') || '#c5a059';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
                <rect width="1200" height="630" fill="#0a0a0a"/>
                <rect x="20" y="20" width="1160" height="590" rx="20" fill="none" stroke="${escapeXML(color)}" stroke-width="4"/>
                <text x="600" y="180" font-family="serif" font-size="64" font-weight="bold" fill="${escapeXML(color)}" text-anchor="middle">🍽️ ${escapeXML(name)}</text>
                <text x="600" y="260" font-family="sans-serif" font-size="32" fill="#f0ece4" text-anchor="middle">Menu Digital — Restos Lomé</text>
                <text x="600" y="330" font-family="sans-serif" font-size="24" fill="#6e6a64" text-anchor="middle">Scannez, commandez, savourez !</text>
                <rect x="475" y="390" width="250" height="50" rx="25" fill="${escapeXML(color)}"/>
                <text x="600" y="423" font-family="sans-serif" font-size="20" font-weight="bold" fill="#000" text-anchor="middle">🍽️ Voir le menu</text>
                <text x="600" y="540" font-family="monospace" font-size="18" fill="#6e6a64" text-anchor="middle">Restos Lomé — Les saveurs du Togo</text>
            </svg>`;
            return new Response(svg, {
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/send-report → Rapport journalier WhatsApp
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/send-report' && request.method === 'POST') {
            return handleSendReport(request, env);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/proxy-image → Proxy images GitHub (CORS)
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/proxy-image') {
            let imageUrl = url.searchParams.get('url');
            if (!imageUrl) return new Response('Missing url', { status: 400 });

            let parsed;
            try { parsed = new URL(imageUrl); }
            catch { return new Response('Invalid url', { status: 400 }); }

            // Bloquer les URLs internes (protection SSRF)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return new Response('Forbidden', { status: 403 });
            }
            const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'];
            if (blockedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.local'))) {
                return new Response('Forbidden', { status: 403 });
            }

            // Convertir github.com/.../blob/BRANCH/PATH → raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH
            // Les URLs stockées en base sont souvent au format blob au lieu de raw
            if (parsed.hostname === 'github.com') {
                // /owner/repo/blob/branch/path/to/file → raw.githubusercontent.com/owner/repo/branch/path/to/file
                imageUrl = imageUrl
                    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
                    .replace('/blob/', '/');
                parsed = new URL(imageUrl);
            }

            // Whitelist des domaines autorisés (GitHub CDN)
            const ALLOWED_DOMAINS = [
                'raw.githubusercontent.com',
                'user-images.githubusercontent.com',
                'objects.githubusercontent.com',
            ];
            if (!ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
                return new Response('Domain not allowed', { status: 403 });
            }

            // User-Agent requis par GitHub sinon 403
            const resp = await fetch(imageUrl, {
                headers: { 'User-Agent': 'Cloudflare-Worker/1.0' },
                cf: { cacheTtl: 86400 },
            });
            if (!resp.ok) {
                console.error('proxy-image: GitHub ' + resp.status + ' pour ' + imageUrl);
                return new Response('Fetch failed: ' + resp.status, { status: 502 });
            }

            const blob = await resp.arrayBuffer();
            const contentType = resp.headers.get('content-type') || 'image/jpeg';

            // Vérifier que c'est bien une image
            if (!contentType.startsWith('image/')) {
                return new Response('Not an image', { status: 403 });
            }

            return new Response(blob, {
                headers: {
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /auth → OAuth GitHub (début)
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/auth') {
            const clientId = env.GITHUB_CLIENT_ID;
            if (!clientId) {
                return new Response(JSON.stringify({
                    error: 'GITHUB_CLIENT_ID manquant',
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            const githubAuthUrl =
                `https://github.com/login/oauth/authorize` +
                `?client_id=${clientId}` +
                `&scope=repo,user` +
                `&redirect_uri=${encodeURIComponent(url.origin + '/callback')}`;
            return Response.redirect(githubAuthUrl, 302);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /callback → OAuth GitHub (retour)
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/callback') {
            return handleGitHubCallback(request, env, url);
        }

        // ═══════════════════════════════════════════════════════
        // CORRECTION : Rediriger les URLs sans .html vers .html
        // ═══════════════════════════════════════════════════════
        const htmlFiles = ['/set-password', '/admin', '/view', '/blog', '/onboarding', '/qrcode'];
        if (htmlFiles.includes(url.pathname)) {
            const newUrl = new URL(url);
            newUrl.pathname = url.pathname + '.html';
            return Response.redirect(newUrl.toString(), 301);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /sitemap.xml → Site dynamique
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/sitemap.xml') {
            return handleSitemap(request, env);
        }
		// ═══════════════════════════════════════════════════════════
        // ROUTE : /robots.txt
        // ═══════════════════════════════════════════════════════════
        if (url.pathname === '/robots.txt') {
            return handleRobots(request, env);
        }
		
		// ═══════════════════════════════════════════════════════
		// ROUTES : Géolocalisation (reverse geocode + distance)
		// ═══════════════════════════════════════════════════════
		if (url.pathname === '/api/reverse-geocode' && request.method === 'GET') {
			return handleReverseGeocode(request);
		}
		if (url.pathname === '/api/distance' && request.method === 'GET') {
			return handleDistance(request);
		}	

        // ═══════════════════════════════════════════════════════
        // ROUTES : Push notifications
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/vapid-public-key' && request.method === 'GET')
            return handleVapidPublicKey(env);
        if (url.pathname === '/api/subscribe' && request.method === 'POST')
            return handleSubscribe(request, env);
        if (url.pathname === '/api/subscribe' && request.method === 'DELETE')
            return handleUnsubscribe(request, env);
        if (url.pathname === '/api/push' && request.method === 'POST')
            return handlePush(request, env);

        // ═══════════════════════════════════════════════════════
        // ROUTE PAR DÉFAUT → Fichiers statiques
        // ═══════════════════════════════════════════════════════
        return env.ASSETS.fetch(request);
    },
};

// ================================================================
// FONCTIONS AUXILIAIRES
// ================================================================

// ----------------------------------------------------------------
// Validation magic bytes pour images
// ----------------------------------------------------------------

const ALLOWED_MIME_SIGNATURES = {
    'image/webp': { magic: [0x52, 0x49, 0x46, 0x46], description: 'WebP (RIFF)' },
    'image/jpeg': { magic: [0xFF, 0xD8, 0xFF],        description: 'JPEG'        },
    'image/png':  { magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], description: 'PNG' },
};

const MAX_FILE_SIZE   = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_MIME_SIGNATURES);

function validateImageFile(arrayBuffer, mimeType, fileSize) {
    if (fileSize > MAX_FILE_SIZE) {
        return { valid: false, error: `Fichier trop volumineux. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
    }
    if (fileSize < 100) {
        return { valid: false, error: 'Fichier trop petit (< 100 bytes).' };
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return { valid: false, error: `Type MIME non autorisé : ${mimeType}. Utilisez WebP, JPEG ou PNG.` };
    }

    const bytes     = new Uint8Array(arrayBuffer);
    const signature = ALLOWED_MIME_SIGNATURES[mimeType];
    if (!signature) {
        return { valid: false, error: 'Type de fichier non supporté.' };
    }

    const magicMatch = signature.magic.every((byte, i) => bytes[i] === byte);
    if (!magicMatch) {
        return { valid: false, error: `Le contenu du fichier ne correspond pas à ${signature.description}. Fichier corrompu ou déguisé.` };
    }

    return { valid: true };
}

// ----------------------------------------------------------------
// Rate limiting
// ----------------------------------------------------------------

function checkRateLimit(ip, action, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const key    = `${action}:${ip}`;
    const now    = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || (now - record.timestamp > windowMs)) {
        return { allowed: true, remaining: maxAttempts };
    }
    if (record.count >= maxAttempts) {
        const retryAfter = Math.ceil((record.timestamp + windowMs - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
    }
    return { allowed: true, remaining: maxAttempts - record.count };
}

function incrementRateLimit(ip, action, windowMs = 15 * 60 * 1000) {
    const key    = `${action}:${ip}`;
    const now    = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || (now - record.timestamp > windowMs)) {
        rateLimitMap.set(key, { count: 1, timestamp: now });
    } else {
        record.count++;
        rateLimitMap.set(key, record);
    }
}

function resetRateLimit(ip, action) {
    rateLimitMap.delete(`${action}:${ip}`);
}

// ----------------------------------------------------------------
// Escape XML (pour OG Image)
// ----------------------------------------------------------------

function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ----------------------------------------------------------------
// Réponse JSON standardisée
// ----------------------------------------------------------------

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            ...extraHeaders,
        },
    });
}

// ----------------------------------------------------------------
// Conversion base64 par lots (évite le dépassement de pile > 100 Ko)
// ----------------------------------------------------------------

function arrayBufferToBase64(buffer) {
    const bytes      = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000; // 32 768 bytes par lot
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

// ----------------------------------------------------------------
// Upload image sécurisé vers GitHub
// ----------------------------------------------------------------

async function handleImageUpload(request, env) {
    try {
        console.log('📸 Upload démarré');
        console.log('Repo configuré:', env.GITHUB_REPO);
        console.log('Token présent:', !!env.GITHUB_TOKEN);

        const formData = await request.formData();
        const file     = formData.get('image');
        const filename = formData.get('filename') || 'image';

        if (!file) {
            console.error('❌ Aucun fichier reçu');
            return jsonResponse({ error: 'Aucune image fournie' }, 400);
        }

        console.log('📁 Fichier reçu:', file.name, file.type, file.size);

        const arrayBuffer  = await file.arrayBuffer();
        const validation   = validateImageFile(arrayBuffer, file.type, file.size);
        if (!validation.valid) {
            console.error('❌ Validation échouée:', validation.error);
            return jsonResponse({ error: validation.error }, 400);
        }
        console.log('✅ Validation réussie');

        if (typeof filename !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(filename)) {
            return jsonResponse({ error: 'Nom de fichier invalide. Utilisez uniquement lettres, chiffres, - et _' }, 400);
        }

        const base64    = arrayBufferToBase64(arrayBuffer);
        const cleanName = filename.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
        const timestamp = Date.now();
        const randomId  = Math.random().toString(36).substring(2, 8);
        const filePath  = `assets/uploads/${cleanName}-${timestamp}-${randomId}.webp`;

        console.log('📤 Upload vers GitHub:', filePath);

        const githubResponse = await fetch(
            `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${env.GITHUB_TOKEN}`,
                    'Content-Type':  'application/json',
                    'Accept':        'application/vnd.github.v3+json',
                    'User-Agent':    'Cloudflare-Worker',
                },
                body: JSON.stringify({
                    message: `feat: upload image ${cleanName}`,
                    content: base64,
                    branch:  'main',
                }),
            }
        );

        if (!githubResponse.ok) {
            const err = await githubResponse.json();
            console.error('❌ GitHub Error:', err.status, err.message);
            console.error('Détails:', JSON.stringify(err));
            throw new Error(err.message || 'Erreur GitHub API');
        }

        const result    = await githubResponse.json();
        console.log('✅ Upload réussi:', result.content?.name);

        const publicUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${filePath}`;
        return jsonResponse({ success: true, url: publicUrl, path: filePath });

    } catch (err) {
        console.error('❌ Upload error:', err.message);
        return jsonResponse({ error: err.message || 'Erreur lors de l\'upload' }, 500);
    }
}

// ----------------------------------------------------------------
// Vérification mot de passe avec rate limiting
// ----------------------------------------------------------------

async function handlePasswordCheck(request, env, clientIP) {
    try {
        const { password, type } = await request.json();

        if (!password || !type) {
            return jsonResponse({ error: 'Paramètres manquants' }, 400);
        }
        if (!['onboarding', 'blog'].includes(type)) {
            return jsonResponse({ error: 'Type de vérification invalide' }, 400);
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return jsonResponse({ error: 'Format de mot de passe invalide' }, 400);
        }

        const action    = `pwd-${type}`;
        const rateCheck = checkRateLimit(clientIP, action);
        if (!rateCheck.allowed) {
            return jsonResponse({
                error:      `Trop de tentatives. Réessayez dans ${rateCheck.retryAfter} secondes.`,
                retryAfter: rateCheck.retryAfter,
            }, 429, { 'Retry-After': String(rateCheck.retryAfter) });
        }

        incrementRateLimit(clientIP, action);

        // Délai artificiel anti-timing attack
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        let valid = false;
        if (type === 'onboarding') valid = (password === env.ONBOARDING_MASTER_PASSWORD);
        else if (type === 'blog')  valid = (password === env.BLOG_ADMIN_PASSWORD);

        if (valid) resetRateLimit(clientIP, action);

        return jsonResponse({ valid });

    } catch (err) {
        console.error('Password check error:', err);
        return jsonResponse({ error: 'Erreur de vérification' }, 400);
    }
}

// ----------------------------------------------------------------
// Proxy DB sécurisé
// ----------------------------------------------------------------

async function handleDatabaseProxy(request, env, clientIP) {
    try {
        const body = await request.json();
        const { method, table, filter = {}, data, limit = 50, page = 0 } = body;

        if (!method || !table) {
            return jsonResponse({ error: 'Paramètres manquants' }, 400);
        }

        const ALLOWED_TABLES = [
            'restaurants', 'menu_items', 'orders', 'reservations',
            'blog_articles', 'gallery_photos', 'local_ads', 'events',
            'profiles', 'stats', 'employees', 'inventory', 'transactions',
            'cash_register', 'formula_days',
        ];
        if (!ALLOWED_TABLES.includes(table)) {
            console.warn(`⚠️ Table non autorisée: ${table} — IP: ${clientIP}`);
            return jsonResponse({ error: 'Table non autorisée' }, 403);
        }

        const ALLOWED_METHODS = ['select', 'insert', 'update', 'delete'];
        if (!ALLOWED_METHODS.includes(method)) {
            return jsonResponse({ error: 'Méthode non autorisée' }, 403);
        }

        const ALLOWED_FILTER_COLUMNS = [
            'id', 'restaurant_id', 'slug', 'category', 'is_active',
            'is_available', 'is_drink', 'is_published', 'display_order',
        ];
        for (const key of Object.keys(filter)) {
            if (!ALLOWED_FILTER_COLUMNS.includes(key)) {
                return jsonResponse({ error: `Colonne de filtre non autorisée: ${key}` }, 400);
            }
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_ANON_KEY;

        // ✅ FIX-2a : safeLimit calculé une seule fois et utilisé partout
        const safeLimit = Math.min(limit, 100);
        // ✅ FIX-2b : offset utilisait `limit` (brut) au lieu de `safeLimit` — le plafond de 100 ne s'appliquait pas
        const offset    = Math.max(0, Math.min(page, 1000)) * safeLimit;

        // Paramètres de filtre pour GET/PATCH/DELETE
        const filterParams = new URLSearchParams();
        for (const [key, value] of Object.entries(filter)) {
            filterParams.append(key, `eq.${value}`);
        }

        let fetchUrl, fetchMethod, fetchBody, extraHeaders = {};

        if (method === 'select') {
            // ✅ FIX-2c : avant cette correction, insert/update/delete finissaient ici aussi (toujours GET)
            filterParams.append('limit', safeLimit.toString());
            filterParams.append('offset', offset.toString());
            fetchUrl    = `${supabaseUrl}/rest/v1/${table}?${filterParams}`;
            fetchMethod = 'GET';
            fetchBody   = undefined;

        } else if (method === 'insert') {
            if (!data || typeof data !== 'object') {
                return jsonResponse({ error: 'Paramètre data manquant pour insert' }, 400);
            }
            fetchUrl    = `${supabaseUrl}/rest/v1/${table}`;
            fetchMethod = 'POST';
            fetchBody   = JSON.stringify(data);
            extraHeaders = { 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

        } else if (method === 'update') {
            if (!data || typeof data !== 'object') {
                return jsonResponse({ error: 'Paramètre data manquant pour update' }, 400);
            }
            if (Object.keys(filter).length === 0) {
                return jsonResponse({ error: 'Un filtre est obligatoire pour update (protection full-table)' }, 400);
            }
            fetchUrl    = `${supabaseUrl}/rest/v1/${table}?${filterParams}`;
            fetchMethod = 'PATCH';
            fetchBody   = JSON.stringify(data);
            extraHeaders = { 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

        } else if (method === 'delete') {
            if (Object.keys(filter).length === 0) {
                return jsonResponse({ error: 'Un filtre est obligatoire pour delete (protection full-table)' }, 400);
            }
            fetchUrl    = `${supabaseUrl}/rest/v1/${table}?${filterParams}`;
            fetchMethod = 'DELETE';
            fetchBody   = undefined;
        }

        const response = await fetch(fetchUrl, {
            method: fetchMethod,
            headers: {
                'apikey':        supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Accept':        'application/json',
                ...extraHeaders,
            },
            body: fetchBody,
        });

        if (!response.ok) {
            console.error('DB Error:', response.status, response.statusText);
            return jsonResponse({ error: 'Erreur base de données' }, 500);
        }

        const result = await response.json();
        return jsonResponse({ success: true, data: result, count: result?.length || 0, page, limit: safeLimit });

    } catch (err) {
        console.error('Database proxy error:', err);
        return jsonResponse({ error: 'Erreur serveur' }, 500);
    }
}

// ----------------------------------------------------------------
// CSRF token
// ----------------------------------------------------------------

function handleCSRFToken(request, env) {
    return jsonResponse({ token: crypto.randomUUID() }, 200, { 'Cache-Control': 'no-store' });
}

// ----------------------------------------------------------------
// Rapport journalier WhatsApp
// ----------------------------------------------------------------

async function handleSendReport(request, env) {
    try {
        const { restaurantId } = await request.json();

        if (!restaurantId || typeof restaurantId !== 'string') {
            return jsonResponse({ error: 'ID restaurant invalide' }, 400);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_ANON_KEY;
        const today       = new Date().toISOString().split('T')[0];

        const [transRes, ordersRes, restoRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/transactions?restaurant_id=eq.${restaurantId}&created_at=gte.${today}`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            }),
            fetch(`${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${restaurantId}&created_at=gte.${today}`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            }),
            fetch(`${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=whatsapp,name`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            }),
        ]);

        const transactions = await transRes.json();
        const orders       = await ordersRes.json();
        const resto        = (await restoRes.json())?.[0];

        const total    = transactions.reduce((s, t) => s + t.amount, 0) || 0;
        const nbOrders = orders?.length || 0;

        const message =
            `📊 *RAPPORT JOURNALIER — ${resto?.name || 'Restaurant'}*\n\n` +
            `📅 Date : ${new Date().toLocaleDateString('fr-FR')}\n` +
            `💰 CA : ${total.toLocaleString()} FCFA\n` +
            `📋 Commandes : ${nbOrders}\n` +
            `📦 Stock à vérifier\n\n` +
            `_Rapport généré automatiquement par Restos Lomé_`;

        if (resto?.whatsapp) {
            const waUrl = `https://wa.me/${resto.whatsapp}?text=${encodeURIComponent(message)}`;
            return new Response(JSON.stringify({ success: true, waUrl }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        return new Response(JSON.stringify({ success: false, error: 'Pas de WhatsApp' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}

// ----------------------------------------------------------------
// GitHub OAuth
// ----------------------------------------------------------------

async function handleGitHubCallback(request, env, url) {
    const code = url.searchParams.get('code');
    if (!code) {
        return new Response('Code GitHub manquant.', { status: 400 });
    }

    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
            },
            body: JSON.stringify({
                client_id:     env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json();
        const token     = tokenData.access_token;

        if (!token) {
            return new Response(
                'Erreur OAuth : ' + (tokenData.error_description || 'Token non reçu'),
                { status: 400 }
            );
        }

        // ✅ FIX-3 : le token était injecté brut dans un template JS — si le token contenait
        //    des caractères spéciaux (</script>, guillemets, etc.) il pouvait briser le HTML.
        //    On utilise JSON.stringify pour produire un littéral JS valide et sûr.
        const messagePayload = JSON.stringify({ token, provider: 'github' });
        // La chaîne complète postMessageée, sérialisée comme littéral JS propre
        const safePostMessage = JSON.stringify(`authorization:github:success:${messagePayload}`);

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Connexion en cours...</title></head>
<body>
    <p style="font-family:sans-serif;text-align:center;padding:40px;">Connexion réussie. Fermeture...</p>
    <script>
        (function() {
            function receiveMessage(e) {
                window.opener.postMessage(
                    ${safePostMessage},
                    e.origin
                );
            }
            window.addEventListener('message', receiveMessage, false);
            window.opener.postMessage('authorizing:github', '*');
        })();
    </script>
</body>
</html>`;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });

    } catch (err) {
        console.error('Callback error:', err);
        return new Response('Erreur serveur : ' + err.message, { status: 500 });
    }
}

// ================================================================
// Push Notifications
// ================================================================

// ----------------------------------------------------------------
// Section 1 — Helpers base64url & crypto
// ----------------------------------------------------------------

function base64urlToUint8Array(b64) {
    const padding = '='.repeat((4 - (b64.length % 4)) % 4);
    const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const binary  = atob(base64);
    return Uint8Array.from([...binary].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(arr) {
    return btoa(String.fromCharCode(...arr))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concat(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out   = new Uint8Array(total);
    let offset  = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
}

function utf8(str) { return new TextEncoder().encode(str); }

async function hkdfExtract(salt, ikm) {
    const key = await crypto.subtle.importKey(
        'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

async function hkdfExpand(prk, info, length) {
    const key   = await crypto.subtle.importKey(
        'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const input  = concat(info, new Uint8Array([0x01]));
    const result = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
    return result.slice(0, length);
}

// ----------------------------------------------------------------
// Section 2 — VAPID JWT (ES256 / ECDSA P-256)
// ----------------------------------------------------------------

async function createVapidJWT(endpoint, subject, privateJwkStr) {
    const u          = new URL(endpoint);
    const audience   = `${u.protocol}//${u.host}`;
    const headerB64  = uint8ArrayToBase64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payloadB64 = uint8ArrayToBase64url(utf8(JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 43200, // 12 h
        sub: subject,
    })));
    const signingInput = `${headerB64}.${payloadB64}`;

    const privateKey = await crypto.subtle.importKey(
        'jwk',
        JSON.parse(privateJwkStr),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        utf8(signingInput)
    );
    return `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
}

// ----------------------------------------------------------------
// Section 3 — Chiffrement payload (RFC 8291 / aes128gcm)
// ----------------------------------------------------------------

async function encryptWebPush(subscription, payloadJson) {
    const clientPublicKeyBytes = base64urlToUint8Array(subscription.keys.p256dh);
    const authSecretBytes      = base64urlToUint8Array(subscription.keys.auth);
    const plaintextBytes       = utf8(payloadJson);

    const salt       = crypto.getRandomValues(new Uint8Array(16));
    const serverECDH = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    const serverPublicKeyRaw = new Uint8Array(
        await crypto.subtle.exportKey('raw', serverECDH.publicKey)
    );
    const clientPublicKey = await crypto.subtle.importKey(
        'raw', clientPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
    const sharedSecretRaw = new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: 'ECDH', public: clientPublicKey }, serverECDH.privateKey, 256
        )
    );

    const prkKey = await hkdfExtract(authSecretBytes, sharedSecretRaw);
    const ikm    = await hkdfExpand(prkKey, concat(utf8('WebPush: info\x00'), clientPublicKeyBytes, serverPublicKeyRaw), 32);
    const prk    = await hkdfExtract(salt, ikm);
    const cek    = await hkdfExpand(prk, concat(utf8('Content-Encoding: aes128gcm\x00'), new Uint8Array([0x01])), 16);
    const nonce  = await hkdfExpand(prk, concat(utf8('Content-Encoding: nonce\x00'),     new Uint8Array([0x01])), 12);

    const aesKey     = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, tagLength: 128 },
            aesKey,
            concat(plaintextBytes, new Uint8Array([0x02]))
        )
    );

    // En-tête RFC 8188 : salt(16) + rs(4 big-endian) + idlen(1) + keyid + ciphertext
    return concat(
        salt,
        new Uint8Array([0x00, 0x00, 0x10, 0x00]), // rs = 4096
        new Uint8Array([serverPublicKeyRaw.length]),
        serverPublicKeyRaw,
        ciphertext
    );
}

// ----------------------------------------------------------------
// Section 4 — Routes push
// ----------------------------------------------------------------

function handleVapidPublicKey(env) {
    if (!env.VAPID_PUBLIC_KEY) {
        return new Response(JSON.stringify({ error: 'VAPID_PUBLIC_KEY non configurée.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
    return new Response(JSON.stringify({ vapidPublicKey: env.VAPID_PUBLIC_KEY }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    });
}

async function handleSubscribe(request, env) {
    try {
        const { restaurantId, subscription } = await request.json();

        if (!restaurantId || !subscription?.endpoint || !subscription?.keys?.p256dh) {
            return jsonError('Données invalides.', 400);
        }
        try {
            const u = new URL(subscription.endpoint);
            if (u.protocol !== 'https:') throw new Error();
        } catch {
            return jsonError('Endpoint invalide.', 400);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

        const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer':        'resolution=merge-duplicates, return=minimal',
            },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                endpoint:      subscription.endpoint,
                p256dh:        subscription.keys.p256dh,
                auth:          subscription.keys.auth,
                user_agent:    request.headers.get('User-Agent')?.substring(0, 200) || null,
            }),
        });

        if (!res.ok) return jsonError('Erreur Supabase : ' + await res.text(), 500);

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleUnsubscribe(request, env) {
    try {
        const { endpoint } = await request.json();
        if (!endpoint) return jsonError('endpoint requis.', 400);

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

        await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        });

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handlePush(request, env) {
    try {
        const { restaurantId, payload } = await request.json();

        if (!restaurantId || !payload) return jsonError('restaurantId et payload requis.', 400);
        if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) {
            return jsonError('Secrets VAPID non configurés.', 500);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

        const subsRes = await fetch(
            `${supabaseUrl}/rest/v1/push_subscriptions?restaurant_id=eq.${encodeURIComponent(restaurantId)}`,
            { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        if (!subsRes.ok) return jsonError('Erreur lecture abonnements.', 500);

        const subscriptions = await subsRes.json();
        if (!subscriptions?.length) {
            return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Aucun abonné.' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const payloadJson      = JSON.stringify(payload);
        const expiredEndpoints = [];
        let sent = 0;

        await Promise.allSettled(subscriptions.map(async (sub) => {
            try {
                const encryptedBody = await encryptWebPush(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payloadJson
                );
                const vapidJWT = await createVapidJWT(sub.endpoint, env.VAPID_SUBJECT, env.VAPID_PRIVATE_JWK);

                const pushRes = await fetch(sub.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type':     'application/octet-stream',
                        'Content-Encoding': 'aes128gcm',
                        'Authorization':    `vapid t=${vapidJWT},k=${env.VAPID_PUBLIC_KEY}`,
                        'TTL':              '60',
                        'Urgency':          'high',
                    },
                    body: encryptedBody,
                });

                if (pushRes.status === 200 || pushRes.status === 201) {
                    sent++;
                } else if (pushRes.status === 404 || pushRes.status === 410) {
                    expiredEndpoints.push(sub.endpoint);
                } else {
                    console.error(`Push failed ${pushRes.status}:`, await pushRes.text());
                }
            } catch (e) {
                console.error('Push send error:', e);
            }
        }));

        if (expiredEndpoints.length > 0) {
            await Promise.allSettled(expiredEndpoints.map(ep =>
                fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
                    method: 'DELETE',
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
                })
            ));
        }

        return new Response(JSON.stringify({
            ok: true, sent, total: subscriptions.length, expired: expiredEndpoints.length,
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}

function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}