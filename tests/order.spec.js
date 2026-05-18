// ================================================================
// order.spec.js — Parcours commande client
// Teste le flux complet : menu → panier → checkout → confirmation
// ================================================================

const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://togo-restos-assets.lome-restaurant.workers.dev';

// Slug d'un restaurant de test existant en base
// ⚠️ Remplace par un vrai slug de ton environnement
const TEST_SLUG = 'jo-resto-phase-test';

test.describe('Parcours commande client', () => {

    test('La page menu charge correctement', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);

        // Le loader disparaît et le hero s'affiche
        await expect(page.locator('#hero-name')).not.toBeEmpty({ timeout: 10000 });

        // La barre de navigation des onglets est visible
        await expect(page.locator('#tab-bar')).toBeVisible();

        // Le bouton panier est présent
        await expect(page.locator('#cart-fab')).toBeVisible();
    });

    test('Ajouter un plat au panier', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);

        // Attendre que les plats soient chargés
        await page.waitForSelector('.dish', { timeout: 10000 });

        // Cliquer sur le premier plat disponible
        const firstDish = page.locator('.dish').first();
        await firstDish.click();

        // Le badge du panier passe à 1
        await expect(page.locator('#fab-count')).toHaveText('1', { timeout: 5000 });
    });

    test('Ouvrir le panier et accéder au checkout', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);
        await page.waitForSelector('.dish', { timeout: 10000 });

        // Ajouter un plat
        await page.locator('.dish').first().click();
        await expect(page.locator('#fab-count')).toHaveText('1');

        // Ouvrir le panier
        await page.locator('#cart-fab').click();
        await expect(page.locator('#cart-sheet')).toBeVisible();

        // Vérifier que le total est affiché
        await expect(page.locator('#cart-total')).not.toHaveText('0 FCFA');

        // Aller au checkout
        await page.locator('#checkout-btn').click();
        await expect(page).toHaveURL(/checkout\.html/, { timeout: 5000 });
    });

    test('Remplir le formulaire et confirmer une commande sur place', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);
        await page.waitForSelector('.dish', { timeout: 10000 });

        // Ajouter un plat et aller au checkout
        await page.locator('.dish').first().click();
        await page.locator('#cart-fab').click();
        await page.locator('#checkout-btn').click();
        await page.waitForURL(/checkout\.html/);

        // Sélectionner "Sur place" (déjà sélectionné par défaut)
        await expect(
            page.locator('.delivery-option[data-type="sur_place"]')
        ).toHaveClass(/selected/);

        // Remplir le nom et le téléphone
        await page.fill('#customer-name', 'Client Test Playwright');
        await page.fill('#customer-phone', '22890000001');

        // Soumettre
        await page.locator('#submit-order-btn').click();

        // Le message de succès doit apparaître
        await expect(page.locator('#success-state')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#success-msg')).not.toBeEmpty();
    });

    test('Le checkout bloque si le nom est vide', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);
        await page.waitForSelector('.dish', { timeout: 10000 });

        await page.locator('.dish').first().click();
        await page.locator('#cart-fab').click();
        await page.locator('#checkout-btn').click();
        await page.waitForURL(/checkout\.html/);

        // Laisser le nom vide, remplir seulement le téléphone
        await page.fill('#customer-phone', '22890000001');
        await page.locator('#submit-order-btn').click();

        // Le succès ne doit PAS apparaître
        await expect(page.locator('#success-state')).not.toBeVisible();
    });

    test('Sélectionner le mode livraison ajoute les frais', async ({ page }) => {
        await page.goto(`${BASE_URL}/view.html?slug=${TEST_SLUG}`);
        await page.waitForSelector('.dish', { timeout: 10000 });
        await page.locator('.dish').first().click();
        await page.locator('#cart-fab').click();
        await page.locator('#checkout-btn').click();
        await page.waitForURL(/checkout\.html/);

        // Cliquer sur "Livraison"
        await page.locator('.delivery-option[data-type="livraison"]').click();

        // Les frais de livraison doivent s'afficher (500 FCFA)
        await expect(page.locator('#delivery-display')).not.toHaveText('0 FCFA');
    });
});
