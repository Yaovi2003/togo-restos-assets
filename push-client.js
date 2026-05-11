/**
 * push-client.js — Gestion côté client des notifications push PWA
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * UTILISATION (admin.html uniquement) :
 *  <script src="push-client.js"></script>
 *  Puis appeler pushClient.init(restaurantId) après connexion admin.
 *
 * FONCTIONS EXPOSÉES :
 *  pushClient.init(restaurantId)   → vérifie et rétablit l'abonnement
 *  pushClient.subscribe()          → demande la permission et s'abonne
 *  pushClient.unsubscribe()        → se désabonne et supprime de Supabase
 *  pushClient.sendTest()           → envoie une notification de test
 *  pushClient.getStatus()          → { supported, permission, subscribed }
 */

'use strict';

const pushClient = (() => {

    let _restaurantId = null;

    /* ── Helpers base64url ── */
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw     = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    /* ── Récupère la VAPID public key depuis le Worker ── */
    async function getVapidPublicKey() {
        const res = await fetch(`${location.origin}/api/vapid-public-key`);
        if (!res.ok) throw new Error('Impossible de récupérer la clé VAPID.');
        const { vapidPublicKey } = await res.json();
        return vapidPublicKey;
    }

    /* ── Sauvegarde l'abonnement dans Supabase via le Worker ── */
    async function saveSubscription(subscription) {
        const res = await fetch(`${location.origin}/api/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurantId: _restaurantId,
                subscription: subscription.toJSON(),
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erreur sauvegarde abonnement.');
        }
        return res.json();
    }

    /* ── Supprime l'abonnement de Supabase via le Worker ── */
    async function deleteSubscription(endpoint) {
        const res = await fetch(`${location.origin}/api/subscribe`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
        });
        return res.ok;
    }

    /* ═══════════════════════════════════════════════════════════
       API PUBLIQUE
    ═══════════════════════════════════════════════════════════ */

    /**
     * Initialise le client push.
     * À appeler après connexion admin, avec l'ID du restaurant.
     */
    async function init(restaurantId) {
        _restaurantId = restaurantId;

        if (!isSupported()) return;

        /* Écouter les messages du SW (abonnement expiré, PUSH_OPEN_ORDERS) */
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
                saveSubscription(event.data.subscription).catch(console.error);
            }
            if (event.data?.type === 'PUSH_OPEN_ORDERS') {
                /* L'admin est déjà ouvert — switcher sur le panneau commandes */
                if (typeof showPanel === 'function') showPanel('orders-admin');
            }
        });

        /* Si déjà abonné, on s'assure que Supabase est à jour */
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) await saveSubscription(existing);
        } catch (_) { /* silencieux */ }
    }

    /**
     * Vérifie si les notifications push sont supportées.
     */
    function isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    /**
     * Retourne l'état courant du push.
     * @returns {{ supported, permission, subscribed }}
     */
    async function getStatus() {
        if (!isSupported()) return { supported: false, permission: 'denied', subscribed: false };

        const permission = Notification.permission;
        let subscribed   = false;

        try {
            const reg  = await navigator.serviceWorker.ready;
            const sub  = await reg.pushManager.getSubscription();
            subscribed = !!sub;
        } catch (_) {}

        return { supported: true, permission, subscribed };
    }

    /**
     * Demande la permission et crée l'abonnement push.
     * @returns {boolean} true si l'abonnement a réussi
     */
    async function subscribe() {
        if (!isSupported()) throw new Error('Notifications push non supportées sur ce navigateur.');
        if (!_restaurantId) throw new Error('pushClient.init(restaurantId) doit être appelé d\'abord.');

        /* 1. Demander la permission */
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Permission refusée. Activez les notifications dans les paramètres du navigateur.');
        }

        /* 2. Récupérer la clé VAPID */
        const vapidPublicKey    = await getVapidPublicKey();
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

        /* 3. Créer l'abonnement */
        const reg          = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
        });

        /* 4. Sauvegarder dans Supabase */
        await saveSubscription(subscription);

        console.log('✅ Push subscription créée et sauvegardée.');
        return true;
    }

    /**
     * Se désabonne et supprime l'abonnement de Supabase.
     * @returns {boolean} true si réussi
     */
    async function unsubscribe() {
        if (!isSupported()) return false;

        const reg  = await navigator.serviceWorker.ready;
        const sub  = await reg.pushManager.getSubscription();
        if (!sub) return true;

        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await deleteSubscription(endpoint);

        console.log('✅ Push subscription supprimée.');
        return true;
    }

    /**
     * Envoie une notification de test via le Worker.
     */
    async function sendTest() {
        if (!_restaurantId) throw new Error('pushClient.init(restaurantId) requis.');

        const res = await fetch(`${location.origin}/api/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurantId: _restaurantId,
                payload: {
                    title: '🧪 Test notifications',
                    body:  'Les notifications fonctionnent correctement !',
                    url:   '/admin.html?panel=orders-admin',
                    tag:   'test-push',
                },
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erreur envoi notification test.');
        }
        return res.json();
    }

    return { init, isSupported, getStatus, subscribe, unsubscribe, sendTest };

})();

/* Exposer globalement */
window.pushClient = pushClient;
