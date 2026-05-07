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

        console.log('📤 Upload vers:', `${location.origin}/api/upload-image`);
        console.log('📁 Fichier:', filename, file.type, file.size);

        const response = await fetch(`${location.origin}/api/upload-image`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        console.log('📥 Réponse:', response.status, result);

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