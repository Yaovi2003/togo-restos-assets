// ================================================================
// index.js — Cloudflare Worker · Proxy Sécurisé
// Plateforme Restaurants Togo · Jo D. Digital
// ================================================================

// Rate limiting avec Map (en mémoire, réinitialisé au déploiement)
const rateLimitMap = new Map();

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
                    'Cache-Control': 'public, max-age=3600',
                },
            });
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/db → Proxy DB sécurisé (NOUVEAU)
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
        // ROUTE : /api/csrf-token → Génération token CSRF (NOUVEAU)
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
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/send-report → Rapport journalier WhatsApp
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/send-report' && request.method === 'POST') {
            return handleSendReport(request, env);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /auth → OAuth GitHub (début)
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/auth') {
            const clientId = env.GITHUB_CLIENT_ID;
            if (!clientId) {
                return new Response(JSON.stringify({
                    error: 'GITHUB_CLIENT_ID manquant'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
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
        // ROUTE : /sitemap.xml → Servir le sitemap directement
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/sitemap.xml') {
            return env.ASSETS.fetch(request);
        }
		
		        // ═══════════════════════════════════════════════════════
        // ROUTES PUSH NOTIFICATIONS
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

// ═══════════════════════════════════════════════════════════
// FONCTIONS AUXILIAIRES
// ═══════════════════════════════════════════════════════════

// ================================================================
// VALIDATION MAGIC BYTES POUR IMAGES (NOUVEAU)
// ================================================================

const ALLOWED_MIME_SIGNATURES = {
    'image/webp': { magic: [0x52, 0x49, 0x46, 0x46], description: 'WebP (RIFF)' },
    'image/jpeg': { magic: [0xFF, 0xD8, 0xFF], description: 'JPEG' },
    'image/png':  { magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], description: 'PNG' },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_MIME_SIGNATURES);

function validateImageFile(arrayBuffer, mimeType, fileSize) {
    // Vérifier la taille
    if (fileSize > MAX_FILE_SIZE) {
        return { valid: false, error: `Fichier trop volumineux. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
    }
    if (fileSize < 100) {
        return { valid: false, error: 'Fichier trop petit (< 100 bytes).' };
    }

    // Vérifier le type MIME
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return { valid: false, error: `Type MIME non autorisé : ${mimeType}. Utilisez WebP, JPEG ou PNG.` };
    }

    // Vérifier les magic bytes (signature réelle du fichier)
    const bytes = new Uint8Array(arrayBuffer);
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

// ================================================================
// RATE LIMITING (NOUVEAU)
// ================================================================

function checkRateLimit(ip, action, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const key = `${action}:${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || (now - record.timestamp > windowMs)) {
        return { allowed: true, remaining: maxAttempts };
    }

    if (record.count >= maxAttempts) {
        const resetAt = record.timestamp + windowMs;
        const retryAfter = Math.ceil((resetAt - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining: maxAttempts - record.count };
}

function incrementRateLimit(ip, action, windowMs = 15 * 60 * 1000) {
    const key = `${action}:${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || (now - record.timestamp > windowMs)) {
        rateLimitMap.set(key, { count: 1, timestamp: now });
    } else {
        record.count++;
        rateLimitMap.set(key, record);
    }
}

function resetRateLimit(ip, action) {
    const key = `${action}:${ip}`;
    rateLimitMap.delete(key);
}

// ================================================================
// ESCAPE XML (pour OG Image)
// ================================================================

function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ================================================================
// RÉPONSE JSON STANDARDISÉE
// ================================================================

function jsonResponse(data, status = 200, extraHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...extraHeaders,
    };

    return new Response(JSON.stringify(data), { status, headers });
}

// ================================================================
// ✅ CORRECTION : Conversion base64 par lots (BUG FIX)
// Remplace btoa(String.fromCharCode(...bytes)) qui dépasse la
// pile d'appels pour les fichiers > ~100 Ko
// ================================================================

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000; // 32768 bytes par lot
    let binary = '';
    
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
    }
    
    return btoa(binary);
}

// ================================================================
// UPLOAD IMAGE SÉCURISÉ (CORRIGÉ)
// ================================================================

async function handleImageUpload(request, env) {
    try {
        console.log('📸 Upload démarré');
        console.log('Repo configuré:', env.GITHUB_REPO);
        console.log('Token présent:', !!env.GITHUB_TOKEN);
        
        const formData = await request.formData();
        const file = formData.get('image');
        const filename = formData.get('filename') || 'image';

        if (!file) {
            console.error('❌ Aucun fichier reçu');
            return jsonResponse({ error: 'Aucune image fournie' }, 400);
        }

        console.log('📁 Fichier reçu:', file.name, file.type, file.size);

        // ✅ VALIDATION STRICTE DU FICHIER (NOUVEAU)
        const arrayBuffer = await file.arrayBuffer();
        const validation = validateImageFile(arrayBuffer, file.type, file.size);
        
        if (!validation.valid) {
            console.error('❌ Validation échouée:', validation.error);
            return jsonResponse({ error: validation.error }, 400);
        }

        console.log('✅ Validation réussie');

        // ✅ VALIDATION DU NOM DE FICHIER (NOUVEAU)
        if (typeof filename !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(filename)) {
            return jsonResponse({ error: 'Nom de fichier invalide. Utilisez uniquement lettres, chiffres, - et _' }, 400);
        }

        // ✅ CORRECTION : Conversion base64 par lots (ne dépasse plus la pile d'appels)
        const base64 = arrayBufferToBase64(arrayBuffer);

        const cleanName = filename.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const filePath = `assets/uploads/${cleanName}-${timestamp}-${randomId}.webp`;

        console.log('📤 Upload vers GitHub:', filePath);

        const githubResponse = await fetch(
            `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${env.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Cloudflare-Worker',
                },
                body: JSON.stringify({
                    message: `feat: upload image ${cleanName}`,
                    content: base64,
                    branch: 'main',
                }),
            }
        );

        if (!githubResponse.ok) {
            const err = await githubResponse.json();
            console.error('❌ GitHub Error:', err.status, err.message);
            console.error('Détails:', JSON.stringify(err));
            throw new Error(err.message || 'Erreur GitHub API');
        }

        const result = await githubResponse.json();
        console.log('✅ Upload réussi:', result.content?.name);

        const publicUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${filePath}`;

        return jsonResponse({ success: true, url: publicUrl, path: filePath });

    } catch (err) {
        console.error('❌ Upload error:', err.message);
        return jsonResponse({ error: err.message || 'Erreur lors de l\'upload' }, 500);
    }
}

// ================================================================
// VÉRIFICATION MOT DE PASSE SÉCURISÉE AVEC RATE LIMITING (MODIFIÉ)
// ================================================================

async function handlePasswordCheck(request, env, clientIP) {
    try {
        const { password, type } = await request.json();

        if (!password || !type) {
            return jsonResponse({ error: 'Paramètres manquants' }, 400);
        }

        // ✅ VALIDATION DES TYPES (NOUVEAU)
        if (!['onboarding', 'blog'].includes(type)) {
            return jsonResponse({ error: 'Type de vérification invalide' }, 400);
        }

        // ✅ VALIDATION LONGUEUR MOT DE PASSE (NOUVEAU)
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            // On ne révèle pas les critères exacts, mais on rejette
            return jsonResponse({ error: 'Format de mot de passe invalide' }, 400);
        }

        // ✅ RATE LIMITING (NOUVEAU)
        const action = `pwd-${type}`;
        const rateCheck = checkRateLimit(clientIP, action);
        
        if (!rateCheck.allowed) {
            return jsonResponse({ 
                error: `Trop de tentatives. Réessayez dans ${rateCheck.retryAfter} secondes.`,
                retryAfter: rateCheck.retryAfter
            }, 429, { 'Retry-After': String(rateCheck.retryAfter) });
        }

        incrementRateLimit(clientIP, action);

        // ✅ DÉLAI ARTIFICIEL ANTI-TIMING ATTACK (NOUVEAU)
        const timingDelay = 200 + Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, timingDelay));

        let valid = false;
        
        if (type === 'onboarding') {
            valid = (password === env.ONBOARDING_MASTER_PASSWORD);
        } else if (type === 'blog') {
            valid = (password === env.BLOG_ADMIN_PASSWORD);
        }

        if (valid) {
            // Réinitialiser le compteur en cas de succès
            resetRateLimit(clientIP, action);
        }

        return jsonResponse({ valid });

    } catch (err) {
        console.error('Password check error:', err);
        return jsonResponse({ error: 'Erreur de vérification' }, 400);
    }
}

// ================================================================
// PROXY DB SÉCURISÉ (NOUVEAU)
// ================================================================

async function handleDatabaseProxy(request, env, clientIP) {
    try {
        const body = await request.json();
        const { method, table, filter = {}, data = null, limit = 50, page = 0 } = body;

        // ✅ VALIDATION DES PARAMÈTRES
        if (!method || !table) {
            return jsonResponse({ error: 'Paramètres manquants' }, 400);
        }

        // ✅ WHITELIST DES TABLES
        const ALLOWED_TABLES = [
            'restaurants', 'menu_items', 'orders', 'reservations',
            'blog_articles', 'gallery_photos', 'local_ads', 'events',
            'profiles', 'stats', 'employees', 'inventory', 'transactions',
            'cash_register', 'formula_days'
        ];

        if (!ALLOWED_TABLES.includes(table)) {
            console.warn(`⚠️ Tentative d'accès à une table non autorisée: ${table} par IP: ${clientIP}`);
            return jsonResponse({ error: 'Table non autorisée' }, 403);
        }

        // ✅ WHITELIST DES MÉTHODES
        const ALLOWED_METHODS = ['select', 'insert', 'update', 'delete'];
        if (!ALLOWED_METHODS.includes(method)) {
            return jsonResponse({ error: 'Méthode non autorisée' }, 403);
        }

        // ✅ VALIDATION DES COLONNES DE FILTRE
        const ALLOWED_FILTER_COLUMNS = [
            'id', 'restaurant_id', 'slug', 'category', 'is_active',
            'is_available', 'is_drink', 'is_published', 'display_order'
        ];

        for (const key of Object.keys(filter)) {
            if (!ALLOWED_FILTER_COLUMNS.includes(key)) {
                return jsonResponse({ error: `Colonne de filtre non autorisée: ${key}` }, 400);
            }
        }

        // ✅ CONSTRUIRE LA REQUÊTE SUPABASE
        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_ANON_KEY;

        let queryUrl = `${supabaseUrl}/rest/v1/${table}?`;

        // Ajouter les filtres
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(filter)) {
            queryParams.append(key, `eq.${value}`);
        }

        // Pagination
        const offset = Math.max(0, Math.min(page, 1000)) * limit;
        const safeLimit = Math.min(limit, 100);
        queryParams.append('limit', safeLimit.toString());
        queryParams.append('offset', offset.toString());

        queryUrl += queryParams.toString();

        // ✅ EXÉCUTER LA REQUÊTE
        const response = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            console.error('DB Error:', response.status, response.statusText);
            return jsonResponse({ error: 'Erreur base de données' }, 500);
        }

        const result = await response.json();

        return jsonResponse({
            success: true,
            data: result,
            count: result?.length || 0,
            page,
            limit: safeLimit
        });

    } catch (err) {
        console.error('Database proxy error:', err);
        return jsonResponse({ error: 'Erreur serveur' }, 500);
    }
}

// ================================================================
// CSRF TOKEN (NOUVEAU)
// ================================================================

function handleCSRFToken(request, env) {
    const token = crypto.randomUUID();
    
    return jsonResponse({ token }, 200, {
        'Cache-Control': 'no-store'
    });
}

// ================================================================
// RAPPORT JOURNALIER (MODIFIÉ avec validation)
// ================================================================

async function handleSendReport(request, env) {
    try {
        const { restaurantId } = await request.json();

        // ✅ VALIDATION
        if (!restaurantId || typeof restaurantId !== 'string') {
            return jsonResponse({ error: 'ID restaurant invalide' }, 400);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_ANON_KEY;
        const today = new Date().toISOString().split('T')[0];
        
        const [transRes, ordersRes, restoRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/transactions?restaurant_id=eq.${restaurantId}&created_at=gte.${today}`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            }),
            fetch(`${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${restaurantId}&created_at=gte.${today}`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            }),
            fetch(`${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=whatsapp,name`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            }),
        ]);

        const transactions = await transRes.json();
        const orders = await ordersRes.json();
        const restos = await restoRes.json();
        const resto = restos?.[0];

        const total = transactions.reduce((s, t) => s + t.amount, 0) || 0;
        const nbOrders = orders?.length || 0;

        const message = `📊 *RAPPORT JOURNALIER — ${resto?.name || 'Restaurant'}*\n\n` +
            `📅 Date : ${new Date().toLocaleDateString('fr-FR')}\n` +
            `💰 CA : ${total.toLocaleString()} FCFA\n` +
            `📋 Commandes : ${nbOrders}\n` +
            `📦 Stock à vérifier\n\n` +
            `_Rapport généré automatiquement par Restos Lomé_`;

        if (resto?.whatsapp) {
            const waUrl = `https://wa.me/${resto.whatsapp}?text=${encodeURIComponent(message)}`;
            return new Response(JSON.stringify({ success: true, waUrl }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        return new Response(JSON.stringify({ success: false, error: 'Pas de WhatsApp' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}

// ================================================================
// GITHUB OAUTH (INCHANGÉ)
// ================================================================

async function handleGitHubCallback(request, env, url) {
    const code = url.searchParams.get('code');
    if (!code) {
        return new Response('Code GitHub manquant.', { status: 400 });
    }

    try {
        const tokenRes = await fetch(
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    client_id: env.GITHUB_CLIENT_ID,
                    client_secret: env.GITHUB_CLIENT_SECRET,
                    code,
                }),
            }
        );

        const tokenData = await tokenRes.json();
        const token = tokenData.access_token;

        if (!token) {
            return new Response(
                'Erreur OAuth : ' + (tokenData.error_description || 'Token non reçu'),
                { status: 400 }
            );
        }

        const messagePayload = JSON.stringify({ token, provider: 'github' });

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Connexion en cours...</title></head>
<body>
    <p style="font-family:sans-serif;text-align:center;padding:40px;">Connexion réussie. Fermeture...</p>
    <script>
        (function() {
            function receiveMessage(e) {
                window.opener.postMessage(
                    'authorization:github:success:${messagePayload.replace(/'/g, "\\'")}',
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
// FONCTIONS PUSH NOTIFICATIONS
// ================================================================

/* ══════════════════════════════════════════════════════════════
   SECTION 1 — HELPERS BASE64URL & CRYPTO
══════════════════════════════════════════════════════════════ */

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


/* ── HKDF-Extract : PRK = HMAC-SHA256(salt, IKM) ── */
async function hkdfExtract(salt, ikm) {
    const key = await crypto.subtle.importKey(
        'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

/* ── HKDF-Expand : OKM = HMAC-SHA256(PRK, info || 0x01) [length bytes] ── */
async function hkdfExpand(prk, info, length) {
    const key = await crypto.subtle.importKey(
        'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const input  = concat(info, new Uint8Array([0x01]));
    const result = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
    return result.slice(0, length);
}


/* ══════════════════════════════════════════════════════════════
   SECTION 2 — VAPID JWT (ES256 / ECDSA P-256)
══════════════════════════════════════════════════════════════ */

/**
 * Crée un JWT VAPID signé avec la clé privée P-256.
 *
 * @param {string} endpoint      - URL du push service (ex: https://fcm.googleapis.com/…)
 * @param {string} subject       - "mailto:contact@example.com"
 * @param {string} privateJwkStr - JSON string de la JWK privée (kty,crv,x,y,d)
 */
async function createVapidJWT(endpoint, subject, privateJwkStr) {
    const url      = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;

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


/* ══════════════════════════════════════════════════════════════
   SECTION 3 — CHIFFREMENT PAYLOAD (RFC 8291 / aes128gcm)
══════════════════════════════════════════════════════════════ */

/**
 * Chiffre le payload JSON selon RFC 8291 (Web Push Message Encryption).
 *
 * @param {{ endpoint, keys: { p256dh, auth } }} subscription
 * @param {string} payloadJson - JSON stringifié du payload
 * @returns {Uint8Array} corps HTTP chiffré (aes128gcm content-encoding)
 */
async function encryptWebPush(subscription, payloadJson) {
    const clientPublicKeyBytes = base64urlToUint8Array(subscription.keys.p256dh);
    const authSecretBytes      = base64urlToUint8Array(subscription.keys.auth);
    const plaintextBytes       = utf8(payloadJson);

    /* ── 1. Sel aléatoire 16 octets ── */
    const salt = crypto.getRandomValues(new Uint8Array(16));

    /* ── 2. Paire ECDH éphémère côté serveur ── */
    const serverECDH = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    );
    const serverPublicKeyRaw = new Uint8Array(
        await crypto.subtle.exportKey('raw', serverECDH.publicKey)
    );

    /* ── 3. Clé publique client ── */
    const clientPublicKey = await crypto.subtle.importKey(
        'raw',
        clientPublicKeyBytes,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    );

    /* ── 4. Secret ECDH partagé ── */
    const sharedSecretRaw = new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: 'ECDH', public: clientPublicKey },
            serverECDH.privateKey,
            256
        )
    );

    /* ── 5. PRK_key = HKDF-Extract(auth_secret, shared_secret) ── */
    const prkKey = await hkdfExtract(authSecretBytes, sharedSecretRaw);

    /* ── 6. IKM = HKDF-Expand(PRK_key, "WebPush: info\0" + client_pub + server_pub, 32) ── */
    const keyInfo = concat(
        utf8('WebPush: info\x00'),
        clientPublicKeyBytes,
        serverPublicKeyRaw
    );
    const ikm = await hkdfExpand(prkKey, keyInfo, 32);

    /* ── 7. PRK = HKDF-Extract(salt, IKM) ── */
    const prk = await hkdfExtract(salt, ikm);

    /* ── 8. CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0\1", 16) ── */
    const cek = await hkdfExpand(
        prk,
        concat(utf8('Content-Encoding: aes128gcm\x00'), new Uint8Array([0x01])),
        16
    );

    /* ── 9. Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0\1", 12) ── */
    const nonce = await hkdfExpand(
        prk,
        concat(utf8('Content-Encoding: nonce\x00'), new Uint8Array([0x01])),
        12
    );

    /* ── 10. Chiffrement AES-128-GCM ── */
    /* Padding : plaintext + 0x02 (délimiteur RFC 8188) */
    const paddedPlaintext = concat(plaintextBytes, new Uint8Array([0x02]));

    const aesKey = await crypto.subtle.importKey(
        'raw', cek, { name: 'AES-GCM' }, false, ['encrypt']
    );
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, tagLength: 128 },
            aesKey,
            paddedPlaintext
        )
    );

    /* ── 11. En-tête RFC 8188 ── */
    /* salt(16) + rs(4 big-endian) + idlen(1) + keyid(serverPublicKey) + ciphertext */
    const rs      = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096 en big-endian
    const idlen   = new Uint8Array([serverPublicKeyRaw.length]);  // 65

    return concat(salt, rs, idlen, serverPublicKeyRaw, ciphertext);
}


/* ══════════════════════════════════════════════════════════════
   SECTION 4 — ROUTES
══════════════════════════════════════════════════════════════ */

/** GET /api/vapid-public-key — retourne la clé publique VAPID */
function handleVapidPublicKey(env) {
    if (!env.VAPID_PUBLIC_KEY) {
        return new Response(JSON.stringify({ error: 'VAPID_PUBLIC_KEY non configurée.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
    return new Response(JSON.stringify({ vapidPublicKey: env.VAPID_PUBLIC_KEY }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400',
        }
    });
}


/** POST /api/subscribe — sauvegarde un abonnement push dans Supabase */
async function handleSubscribe(request, env) {
    try {
        const { restaurantId, subscription } = await request.json();

        if (!restaurantId || !subscription?.endpoint || !subscription?.keys?.p256dh) {
            return jsonError('Données invalides.', 400);
        }

        /* Valider que l'endpoint est bien une URL https */
        try {
            const u = new URL(subscription.endpoint);
            if (u.protocol !== 'https:') throw new Error();
        } catch {
            return jsonError('Endpoint invalide.', 400);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY; /* service_role requis (RLS désactivé) */

        const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey':        supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer':        'resolution=merge-duplicates', /* upsert sur restaurant_id+endpoint */
            },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                endpoint:      subscription.endpoint,
                p256dh:        subscription.keys.p256dh,
                auth:          subscription.keys.auth,
                user_agent:    request.headers.get('User-Agent')?.substring(0, 200) || null,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return jsonError('Erreur Supabase : ' + err, 500);
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}


/** DELETE /api/subscribe — supprime un abonnement par endpoint */
async function handleUnsubscribe(request, env) {
    try {
        const { endpoint } = await request.json();
        if (!endpoint) return jsonError('endpoint requis.', 400);

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY;

        const encoded = encodeURIComponent(endpoint);
        await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encoded}`, {
            method: 'DELETE',
            headers: {
                'apikey':        supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            },
        });

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}


/**
 * POST /api/push — envoie une notification push à tous les
 * appareils abonnés pour ce restaurant.
 *
 * Body : { restaurantId, payload: { title, body, url, tag } }
 */
async function handlePush(request, env) {
    try {
        const { restaurantId, payload } = await request.json();

        if (!restaurantId || !payload) return jsonError('restaurantId et payload requis.', 400);
        if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) {
            return jsonError('Secrets VAPID non configurés.', 500);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_KEY;

        /* ── Charger les abonnements pour ce restaurant ── */
        const subsRes = await fetch(
            `${supabaseUrl}/rest/v1/push_subscriptions?restaurant_id=eq.${encodeURIComponent(restaurantId)}`,
            {
                headers: {
                    'apikey':        supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                },
            }
        );

        if (!subsRes.ok) return jsonError('Erreur lecture abonnements.', 500);

        const subscriptions = await subsRes.json();
        if (!subscriptions?.length) {
            return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Aucun abonné.' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const payloadJson = JSON.stringify(payload);
        const expiredEndpoints = [];
        let   sent = 0;

        /* ── Envoyer à chaque abonnement ── */
        await Promise.allSettled(
            subscriptions.map(async (sub) => {
                try {
                    /* Chiffrer le payload */
                    const encryptedBody = await encryptWebPush(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        payloadJson
                    );

                    /* Créer le JWT VAPID pour cet endpoint */
                    const vapidJWT = await createVapidJWT(
                        sub.endpoint,
                        env.VAPID_SUBJECT,
                        env.VAPID_PRIVATE_JWK
                    );

                    /* Envoyer la requête au push service */
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

                    if (pushRes.status === 201 || pushRes.status === 200) {
                        sent++;
                    } else if (pushRes.status === 404 || pushRes.status === 410) {
                        /* Abonnement expiré ou révoqué — à nettoyer */
                        expiredEndpoints.push(sub.endpoint);
                    } else {
                        const errText = await pushRes.text();
                        console.error(`Push failed ${pushRes.status}:`, errText);
                    }
                } catch (e) {
                    console.error('Push send error:', e);
                }
            })
        );

        /* ── Nettoyer les abonnements expirés ── */
        if (expiredEndpoints.length > 0) {
            await Promise.allSettled(
                expiredEndpoints.map(ep =>
                    fetch(
                        `${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`,
                        {
                            method: 'DELETE',
                            headers: {
                                'apikey':        supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`,
                            },
                        }
                    )
                )
            );
        }

        return new Response(JSON.stringify({
            ok:       true,
            sent,
            total:    subscriptions.length,
            expired:  expiredEndpoints.length,
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        return jsonError(e.message, 500);
    }
}


/* ── Helper réponse erreur JSON ── */
function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}


/* ══════════════════════════════════════════════════════════════
   EXPORT (si votre Worker utilise des modules ES)
   Sinon, copier les fonctions directement dans le Worker global.
══════════════════════════════════════════════════════════════ */
// export { handleVapidPublicKey, handleSubscribe, handleUnsubscribe, handlePush };