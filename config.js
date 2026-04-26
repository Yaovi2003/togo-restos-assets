// ================================================================
// config.js — Configuration centrale chargée depuis le Worker
// Plateforme Restaurants Togo · Jo D. Digital
// ================================================================
// AUCUNE CLÉ SECRÈTE DANS CE FICHIER
// Toutes les clés sont stockées dans Cloudflare Secrets
// et accessibles uniquement via le Worker
// ================================================================

const CONFIG = {
    // Données chargées depuis le Worker
    _supabaseUrl: null,
    _supabaseKey: null,
    _loaded: false,

    /**
     * Charge la configuration depuis le Worker Cloudflare
     * Appelé une fois au démarrage de chaque page
     */
    async load() {
        if (this._loaded) return;

        try {
            const response = await fetch(`${location.origin}/api/config`);
            if (!response.ok) {
                throw new Error('Configuration indisponible. Vérifiez votre connexion.');
            }

            const data = await response.json();
            this._supabaseUrl = data.supabaseUrl;
            this._supabaseKey = data.supabaseKey;
            this._loaded = true;

            console.log('✅ Configuration chargée avec succès');
        } catch (err) {
            console.error('❌ Erreur chargement configuration:', err);
            throw err;
        }
    },

    /**
     * URL de l'API Supabase
     */
    get supabaseUrl() {
        if (!this._loaded) {
            throw new Error('CONFIG.load() doit être appelé avant d\'accéder à supabaseUrl');
        }
        return this._supabaseUrl;
    },

    /**
     * Clé Anon Supabase (publique mais plus cachée dans le code)
     */
    get supabaseKey() {
        if (!this._loaded) {
            throw new Error('CONFIG.load() doit être appelé avant d\'accéder à supabaseKey');
        }
        return this._supabaseKey;
    },

    /**
     * Crée un client Supabase configuré
     * @returns {Object} Client Supabase initialisé
     */
    async createClient() {
        await this.load();
        return supabase.createClient(this.supabaseUrl, this.supabaseKey);
    },

    /**
     * Upload une image via le Worker Cloudflare (sécurisé)
     * Le token GitHub est stocké dans Cloudflare Secrets
     * 
     * @param {Blob} file - Le fichier image à uploader
     * @param {string} filename - Nom du fichier
     * @returns {Promise<string>} URL publique de l'image
     */
    async uploadImage(file, filename) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('filename', filename || 'image');

        const response = await fetch(`${location.origin}/api/upload-image`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Erreur lors de l\'upload');
        }

        return result.url;
    },

    /**
     * Vérifie un mot de passe administrateur via le Worker
     * Les mots de passe sont stockés dans Cloudflare Secrets
     * 
     * @param {string} password - Le mot de passe à vérifier
     * @param {string} type - Type d'accès ('onboarding' ou 'blog')
     * @returns {Promise<boolean>} True si le mot de passe est correct
     */
    async verifyPassword(password, type) {
        const response = await fetch(`${location.origin}/api/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, type }),
        });

        const result = await response.json();
        return result.valid === true;
    }
};

// Pour la compatibilité avec d'anciens navigateurs
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}