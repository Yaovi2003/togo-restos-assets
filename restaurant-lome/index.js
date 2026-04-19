export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ─── ROUTE 1 : /auth ─────────────────────────────────────────
    // Déclenché quand le gérant clique "Login with GitHub" dans l'admin
    // Redirige vers GitHub pour demander l'autorisation
    if (url.pathname === '/auth') {
      const clientId = env.GITHUB_CLIENT_ID;

      if (!clientId) {
        return new Response(
          JSON.stringify({ error: 'GITHUB_CLIENT_ID manquant dans Cloudflare Variables' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Permissions : repo = lire/écrire le dépôt (pour uploader les images)
      const githubAuthUrl =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}` +
        `&scope=repo,user` +
        `&redirect_uri=${encodeURIComponent(url.origin + '/callback')}`;

      return Response.redirect(githubAuthUrl, 302);
    }

    // ─── ROUTE 2 : /callback ─────────────────────────────────────
    // GitHub redirige ici après que le gérant a cliqué "Authorize"
    // On échange le "code" temporaire contre un vrai token d'accès
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');

      if (!code) {
        return new Response('Code GitHub manquant.', { status: 400 });
      }

      try {
        // Échange du code contre le token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id    : env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
          }),
        });

        const tokenData = await tokenRes.json();
        const token = tokenData.access_token;

        if (!token) {
          return new Response(
            'Erreur OAuth : ' + (tokenData.error_description || 'token non reçu'),
            { status: 400 }
          );
        }

        // ────────────────────────────────────────────────────────
        // IMPORTANT : Ce format de message est celui que Decap CMS
        // et notre admin personnalisé attendent pour finaliser la connexion.
        // Le format doit être EXACTEMENT ce string.
        // ────────────────────────────────────────────────────────
        const messagePayload = JSON.stringify({
          token   : token,
          provider: 'github',
        });

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Connexion en cours...</title></head>
<body>
  <p style="font-family:sans-serif;text-align:center;padding:40px;">
    Connexion réussie. Fermeture...
  </p>
  <script>
    (function() {
      function receiveMessage(e) {
        window.opener.postMessage(
          'authorization:github:success:${messagePayload.replace(/'/g, "\\'")}',
          e.origin
        );
      }
      window.addEventListener('message', receiveMessage, false);
      // Signale à la fenêtre parente que l'autorisation est en cours
      window.opener.postMessage('authorizing:github', '*');
    })();
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });

      } catch (err) {
        return new Response('Erreur serveur : ' + err.message, { status: 500 });
      }
    }

    // ─── ROUTE 3 : Tout le reste → Fichiers statiques ────────────
    // Cloudflare sert automatiquement tes fichiers HTML, CSS, JS, images
    // depuis le dossier défini dans wrangler.toml [assets]
    return env.ASSETS.fetch(request);
  },
};
