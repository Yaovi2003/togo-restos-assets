// ================================================================
// config.js — Configuration centrale chargée depuis le Worker
// Plateforme Restaurants Togo · Jo D. Digital
// AUCUNE CLÉ EXPOSÉE DANS LE CODE SOURCE
// ================================================================

const CONFIG = {
    _supabaseUrl: null,
    _supabaseKey: null,
    _loaded: false,

    async load() {
        if (this._loaded) return;

        try {
            const response = await fetch(`${location.origin}/api/config`);
            if (!response.ok) throw new Error('Configuration indisponible');

            const data = await response.json();
            this._supabaseUrl = data.supabaseUrl;
            this._supabaseKey = data.supabaseKey;
            this._loaded = true;

            console.log('✅ Configuration chargée avec succès');
        } catch (err) {
            console.error('❌ Erreur chargement config:', err);
            throw err;
        }
    },

    get supabaseUrl() {
        if (!this._loaded) throw new Error('CONFIG.load() doit être appelé avant');
        return this._supabaseUrl;
    },

    get supabaseKey() {
        if (!this._loaded) throw new Error('CONFIG.load() doit être appelé avant');
        return this._supabaseKey;
    },

    async createClient() {
        await this.load();
        return supabase.createClient(this.supabaseUrl, this.supabaseKey);
    },

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

    async verifyPassword(password, type) {
        const res = await fetch(`${location.origin}/api/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, type }),
        });
        const data = await res.json();
        return data.valid;
    },

    // ================================================================
    // FONCTIONS DE NOTIFICATION & RAPPORTS
    // ================================================================

    /**
     * Envoie une notification WhatsApp au gérant
     * @param {string} restaurantId - ID du restaurant
     * @param {string} message - Message à envoyer
     */
    async sendNotification(restaurantId, message) {
        try {
            // Récupérer le WhatsApp du restaurant
            const client = await this.createClient();
            const { data: resto } = await client
                .from('restaurants')
                .select('whatsapp, name')
                .eq('id', restaurantId)
                .single();

            if (resto?.whatsapp) {
                const waUrl = `https://wa.me/${resto.whatsapp}?text=${encodeURIComponent(message)}`;
                // Ouvrir WhatsApp (ne fonctionne que si appelé depuis le navigateur)
                if (typeof window !== 'undefined') {
                    window.open(waUrl, '_blank');
                }
                return true;
            }
            return false;
        } catch (e) {
            console.error('Notification error:', e);
            return false;
        }
    },

    /**
     * Envoie un rapport journalier via le Worker
     * @param {string} restaurantId - ID du restaurant
     */
    async sendReport(restaurantId) {
        const res = await fetch(`${location.origin}/api/send-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantId }),
        });
        const data = await res.json();
        if (data.waUrl && typeof window !== 'undefined') {
            window.open(data.waUrl, '_blank');
        }
        return data;
    },

    /**
     * Génère un rapport journalier (données structurées)
     * @param {string} restaurantId - ID du restaurant
     */
    async generateDailyReport(restaurantId) {
        const client = await this.createClient();
        const today = new Date().toISOString().split('T')[0];
        
        const { data: transactions } = await client
            .from('transactions')
            .select('amount, payment_method, type')
            .eq('restaurant_id', restaurantId)
            .gte('created_at', today);

        const { data: orders } = await client
            .from('orders')
            .select('id, total, status')
            .eq('restaurant_id', restaurantId)
            .gte('created_at', today);

        const total = transactions?.reduce((s, t) => s + t.amount, 0) || 0;
        const nbOrders = orders?.length || 0;
        const cashPayment = transactions?.filter(t => t.payment_method === 'espèces').reduce((s, t) => s + t.amount, 0) || 0;
        const tmoneyPayment = transactions?.filter(t => t.payment_method === 'tmoney').reduce((s, t) => s + t.amount, 0) || 0;
        const floozPayment = transactions?.filter(t => t.payment_method === 'flooz').reduce((s, t) => s + t.amount, 0) || 0;
        const deliveries = transactions?.filter(t => t.type === 'livraison').length || 0;

        return {
            date: today,
            total,
            nbOrders,
            cashPayment,
            tmoneyPayment,
            floozPayment,
            deliveries,
            avgOrder: nbOrders > 0 ? Math.round(total / nbOrders) : 0,
        };
    },

    /**
     * Vérifie les stocks bas et envoie une alerte
     * @param {string} restaurantId - ID du restaurant
     */
    async checkLowStock(restaurantId) {
        const client = await this.createClient();
        const { data: items } = await client
            .from('inventory')
            .select('item_name, quantity, min_threshold')
            .eq('restaurant_id', restaurantId);

        const lowStock = items?.filter(i => i.quantity <= i.min_threshold) || [];
        
        if (lowStock.length > 0) {
            const names = lowStock.map(i => `${i.item_name} (${i.quantity} restants)`).join(', ');
            const message = `⚠️ *ALERTE STOCK BAS*\n\n${names}\n\n_Pensez à réapprovisionner !_`;
            await this.sendNotification(restaurantId, message);
        }
        
        return lowStock;
    }
};

// Compatibilité navigateur
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// ================================================================
// AUTH HELPERS
// Fonctions utilitaires pour authentifier les appels /api/db
// A utiliser dans toutes les pages qui font des ecritures en BD
// ================================================================

/**
 * Recupere le token JWT de la session Supabase active.
 * Retourne null si l'utilisateur n'est pas connecte.
 */
async function getAuthToken() {
    try {
        const client = await CONFIG.createClient();
        const { data: { session } } = await client.auth.getSession();
        return session?.access_token || null;
    } catch (err) {
        console.error('getAuthToken error:', err);
        return null;
    }
}

/**
 * Token CSRF - recupere et met en cache le token pour la session.
 */
let _csrfToken = null;
async function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    try {
        const res = await fetch(`${location.origin}/api/csrf-token`);
        if (!res.ok) throw new Error('CSRF fetch failed');
        const { token } = await res.json();
        _csrfToken = token;
        return token;
    } catch (err) {
        console.error('getCsrfToken error:', err);
        return null;
    }
}

/**
 * Wrapper pour tous les appels d'ECRITURE vers /api/db.
 * Ajoute automatiquement le token JWT et le header CSRF.
 *
 * @param {string} method  - 'insert' | 'update' | 'delete'
 * @param {string} table   - nom de la table Supabase
 * @param {object} data    - donnees a ecrire
 * @param {object} filter  - filtre WHERE (requis pour update/delete)
 */
async function apiWrite(method, table, data = {}, filter = {}) {
    const [token, csrf] = await Promise.all([getAuthToken(), getCsrfToken()]);

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (csrf)  headers['X-CSRF-Token']  = csrf;

    const res = await fetch(`${location.origin}/api/db`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method, table, data, filter }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `apiWrite error ${res.status}`);
    }
    return res.json();
}

/**
 * Wrapper pour les LECTURES publiques vers /api/db.
 * Pas besoin de token - les selects restent publics.
 *
 * @param {string} method  - 'select'
 * @param {string} table   - nom de la table
 * @param {object} filter  - filtre WHERE optionnel
 * @param {object} options - options supplementaires
 */
async function apiRead(method = 'select', table, filter = {}, options = {}) {
    const res = await fetch(`${location.origin}/api/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, table, filter, ...options }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `apiRead error ${res.status}`);
    }
    return res.json();
}

// Exposer les helpers globalement
if (typeof window !== 'undefined') {
    window.getAuthToken = getAuthToken;
    window.getCsrfToken = getCsrfToken;
    window.apiWrite     = apiWrite;
    window.apiRead      = apiRead;
}