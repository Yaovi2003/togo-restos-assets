// ================================================================
// index.js — Cloudflare Worker · Proxy Sécurisé
// Plateforme Restaurants Togo · Jo D. Digital
// ================================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

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
        // ROUTE : /api/upload-image → Upload sécurisé vers GitHub
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/upload-image' && request.method === 'POST') {
            return handleImageUpload(request, env);
        }

        // ═══════════════════════════════════════════════════════
        // ROUTE : /api/verify-password → Vérification admin
        // ═══════════════════════════════════════════════════════
        if (url.pathname === '/api/verify-password' && request.method === 'POST') {
            return handlePasswordCheck(request, env);
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
        // Cela permet aux emails de fonctionner même sans .html
        // tout en conservant le hash (#) et les query params (?)
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

async function handleImageUpload(request, env) {
    try {
        const formData = await request.formData();
        const file = formData.get('image');
        const filename = formData.get('filename') || 'image';

        if (!file) {
            return jsonResponse({ error: 'Aucune image fournie' }, 400);
        }

        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const base64 = btoa(String.fromCharCode(...bytes));

        const cleanName = filename.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
        const timestamp = Date.now();
        const filePath = `assets/uploads/${cleanName}-${timestamp}.webp`;

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
            console.error('GitHub API Error:', err);
            throw new Error(err.message || 'Erreur GitHub API');
        }

        const publicUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${filePath}`;

        return jsonResponse({ success: true, url: publicUrl, path: filePath });

    } catch (err) {
        console.error('Upload error:', err);
        return jsonResponse({ error: err.message || 'Erreur lors de l\'upload' }, 500);
    }
}

async function handlePasswordCheck(request, env) {
    try {
        const { password, type } = await request.json();

        if (!password || !type) {
            return jsonResponse({ error: 'Paramètres manquants' }, 400);
        }

        let valid = false;
        if (type === 'onboarding') {
            valid = (password === env.ONBOARDING_MASTER_PASSWORD);
        } else if (type === 'blog') {
            valid = (password === env.BLOG_ADMIN_PASSWORD);
        }

        return jsonResponse({ valid });

    } catch (err) {
        console.error('Password check error:', err);
        return jsonResponse({ error: 'Erreur de vérification' }, 400);
    }
}

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

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}