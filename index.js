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
// UPLOAD IMAGE SÉCURISÉ (MODIFIÉ)
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

        const bytes = new Uint8Array(arrayBuffer);
        const base64 = btoa(String.fromCharCode(...bytes));

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