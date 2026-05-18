// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir:   './tests',
    timeout:   30000,
    retries:   1,

    use: {
        // Navigateur headless par défaut
        headless: true,
        // Viewport mobile (contexte Togo)
        viewport: { width: 390, height: 844 },
        // Ralentir si on veut voir ce qui se passe : slowMo: 500
    },

    projects: [
        {
            name:    'chromium',
            use:     { browserName: 'chromium' },
        },
    ],

    // Reporter lisible dans le terminal
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
});
