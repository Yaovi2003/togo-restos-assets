// ================================================================
// security.spec.js — Tests de sécurité et pages critiques
// Vérifie que les corrections restent effectives dans le temps
// ================================================================

const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://togo-restos-assets.lome-restaurant.workers.dev';

test.describe('Sécurité API', () => {

    test('Insert sans token → 401', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: { method: 'insert', table: 'restaurants', data: { name: 'Hack' } },
        });
        expect(res.status()).toBe(401);
    });

    test('Update sans token → 401', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: { method: 'update', table: 'orders', data: { status: 'livré' }, filter: { id: '00000000-0000-0000-0000-000000000000' } },
        });
        expect(res.status()).toBe(401);
    });

    test('Delete sans token → 401', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: { method: 'delete', table: 'orders', filter: { id: '00000000-0000-0000-0000-000000000000' } },
        });
        expect(res.status()).toBe(401);
    });

    test('Select sans token → 200 (lecture publique autorisée)', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: { method: 'select', table: 'restaurants', filter: {} },
        });
        expect(res.status()).toBe(200);
    });

    test('Insert avec token bidon → 401', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            headers: { 'Authorization': 'Bearer token_bidon_invalide' },
            data: { method: 'insert', table: 'orders', data: { test: true } },
        });
        expect(res.status()).toBe(401);
    });

    test('Méthode non autorisée → 403', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: { method: 'drop', table: 'restaurants', data: {} },
        });
        expect(res.status()).toBe(403);
    });
});

test.describe('Pages publiques accessibles', () => {

    test('Page accueil charge', async ({ page }) => {
        const res = await page.goto(`${BASE_URL}/`);
        expect(res.status()).toBe(200);
        await expect(page).toHaveTitle(/.+/);
    });

    test('Page blog charge', async ({ page }) => {
        const res = await page.goto(`${BASE_URL}/blog.html`);
        expect(res.status()).toBe(200);
    });

    test('Config API retourne supabaseUrl et supabaseKey', async ({ request }) => {
        const res = await request.get(`${BASE_URL}/api/config`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('supabaseUrl');
        expect(body).toHaveProperty('supabaseKey');
        // La clé service ne doit jamais être exposée
        expect(JSON.stringify(body)).not.toContain('service_role');
    });

    test('CSRF token endpoint retourne un UUID', async ({ request }) => {
        const res = await request.get(`${BASE_URL}/api/csrf-token`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.token).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
    });

    test('Manifest PWA contient les icônes PNG', async ({ request }) => {
        const res = await request.get(`${BASE_URL}/manifest.json`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const types = body.icons.map(i => i.type);
        // Doit contenir au moins une icône PNG (pas seulement SVG)
        expect(types).toContain('image/png');
        // Doit avoir 192x192 et 512x512
        const sizes = body.icons.map(i => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
    });
});

test.describe('Rate limiting', () => {

    test('6 mauvais mots de passe déclenchent le rate limit', async ({ request }) => {
        const payload = {
            action:   'blog_admin',
            password: 'mauvais_mot_de_passe_test',
        };

        let lastStatus = 200;
        for (let i = 0; i < 7; i++) {
            const res = await request.post(`${BASE_URL}/api/verify-password`, {
                data: payload,
            });
            lastStatus = res.status();
            if (lastStatus === 429) break;
        }

        // Au bout de 6 tentatives, doit retourner 429
        expect(lastStatus).toBe(429);
    });
});