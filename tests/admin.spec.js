// ================================================================
// admin.spec.js — Parcours admin
// Teste la protection de l'accès et les opérations critiques
// ================================================================

const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://togo-restos-assets.lome-restaurant.workers.dev';

// ⚠️ Remplace par un vrai compte de test dédié (pas le compte de prod)
const TEST_EMAIL    = process.env.TEST_ADMIN_EMAIL    || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'motdepasse_test';

test.describe('Protection de l\'admin', () => {

    test('L\'admin non connecté affiche le formulaire de connexion', async ({ page }) => {
        await page.goto(`${BASE_URL}/admin.html`);

        // Le panneau de login doit être visible
        await expect(page.locator('#auth-panel, #login-panel, #login-form, [id*="login"]')
            .first()).toBeVisible({ timeout: 8000 });

        // Le contenu admin ne doit PAS être visible sans connexion
        await expect(page.locator('#admin-panel, #main-panel, #dashboard')
            .first()).not.toBeVisible();
    });

    test('/api/db refuse les écritures sans token', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: {
                method: 'insert',
                table:  'orders',
                data:   { test: true },
            },
        });

        // Doit retourner 401
        expect(res.status()).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('Authentification');
    });

    test('/api/db autorise les lectures publiques sans token', async ({ request }) => {
        const res = await request.post(`${BASE_URL}/api/db`, {
            data: {
                method: 'select',
                table:  'restaurants',
                filter: {},
            },
        });

        // Les lectures publiques doivent passer (200)
        expect(res.status()).toBe(200);
    });
});

test.describe('Opérations admin connecté', () => {

    // Se connecter une fois et réutiliser la session pour tous les tests du groupe
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE_URL}/admin.html`);

        // Remplir le formulaire de connexion
        const emailField = page.locator('input[type="email"], #email, #admin-email').first();
        const passField  = page.locator('input[type="password"], #password, #admin-password').first();

        await emailField.fill(TEST_EMAIL);
        await passField.fill(TEST_PASSWORD);
        await page.locator('button[type="submit"], #login-btn, #submit-login').first().click();

        // Attendre que le dashboard soit visible
        await expect(
            page.locator('#admin-panel, #main-panel, #dashboard, #panel-dashboard').first()
        ).toBeVisible({ timeout: 10000 });
    });

    test('Le dashboard affiche les commandes du jour', async ({ page }) => {
        // Au moins un compteur de commandes est visible
        await expect(
            page.locator('[id*="count"], [id*="orders"], [id*="commandes"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('L\'onglet Analytics charge les graphiques', async ({ page }) => {
        // Cliquer sur l'onglet Analytics
        await page.locator('[data-panel="analytics"], #nav-analytics, button:has-text("Analytiques")').first().click();

        // Le panneau analytics doit être visible
        await expect(
            page.locator('#panel-analytics, #analytics-panel').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('L\'onglet Caisse charge le POS', async ({ page }) => {
        await page.locator('[data-panel="caisse"], #nav-caisse, button:has-text("Caisse")').first().click();

        await expect(
            page.locator('#panel-caisse, #caisse-panel, #pos-grid').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('L\'onglet Livraison charge les livreurs', async ({ page }) => {
        await page.locator('[data-panel="delivery"], #nav-delivery, button:has-text("Livraison")').first().click();

        await expect(
            page.locator('#panel-delivery, #delivery-panel, #delivery-persons-list').first()
        ).toBeVisible({ timeout: 8000 });
    });
});
