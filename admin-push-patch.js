/**
 * admin-push-patch.js — Panneau Notifications Push (admin)
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE :
 *  • Widget "🔔 Notifications" dans le panneau Restaurant
 *  • Bouton Activer / Désactiver les notifications
 *  • Bouton Tester une notification
 *  • Statut en temps réel (permission, abonnement actif)
 *  • Écoute PUSH_OPEN_ORDERS du SW pour switcher sur les commandes
 *
 * INTÉGRATION :
 *  Dans admin.html, ajouter dans <head> :
 *    <script src="push-client.js"></script>
 *  Et avant </body> :
 *    <script src="admin-push-patch.js"></script>
 *
 * PRÉREQUIS :
 *  • sw.js v7 déployé (avec handlers push / notificationclick)
 *  • Routes /api/vapid-public-key, /api/subscribe, /api/push dans le Worker
 *  • Secrets VAPID_PUBLIC_KEY et VAPID_PRIVATE_JWK dans le Worker
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

.push-widget {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius-lg);
    padding: 20px 22px;
    margin-top: 20px;
}
.push-widget-title {
    font-family: 'Syne', sans-serif;
    font-size: .95rem; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 16px;
}

/* ── Statut badge ── */
.push-status {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px; border-radius: 50px;
    font-size: .78rem; font-weight: 600; margin-bottom: 16px;
    border: 1px solid transparent;
}
.push-status.ok {
    background: rgba(46,204,113,.1); border-color: rgba(46,204,113,.3);
    color: #2ecc71;
}
.push-status.off {
    background: rgba(255,255,255,.05); border-color: var(--border);
    color: var(--text-dim);
}
.push-status.warn {
    background: rgba(241,196,15,.1); border-color: rgba(241,196,15,.3);
    color: #f1c40f;
}
.push-status-dot {
    width: 7px; height: 7px; border-radius: 50%; background: currentColor;
    flex-shrink: 0;
}
.push-status.ok .push-status-dot { animation: pushPulse 2s ease-in-out infinite; }

@keyframes pushPulse {
    0%,100% { opacity: 1; transform: scale(1);   }
    50%      { opacity: .4; transform: scale(.7); }
}

/* ── Boutons actions ── */
.push-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ── Info card ── */
.push-info-card {
    background: var(--surface2); border-radius: var(--radius);
    padding: 12px 14px; margin-top: 14px;
    font-size: .78rem; color: var(--text-dim); line-height: 1.6;
}
.push-info-card strong { color: var(--text); }

/* ── Compteur abonnements ── */
.push-sub-count {
    font-family: var(--mono);
    font-size: .72rem; color: var(--text-dim);
    margin-top: 10px;
}

/* ── Toast push-widget ── */
.push-toast {
    position: fixed; bottom: 24px; left: 50%;
    transform: translateX(-50%);
    background: var(--surface2); border: 1px solid rgba(197,160,89,.3);
    color: var(--text); padding: 10px 20px; border-radius: 50px;
    font-size: .82rem; font-weight: 600; white-space: nowrap;
    z-index: 9999; animation: pushToastIn .3s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
}
@keyframes pushToastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
}
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION DU WIDGET
   On l'ajoute dans le panneau "restaurant" (infos du restaurant)
   S'il n'existe pas, on crée un panneau dédié.
══════════════════════════════════════════════════════════════════ */
function injectPushWidget() {
    /* Chercher où insérer — panneau restaurant ou profil */
    const targets = [
        '#panel-restaurant .section-body',
        '#panel-restaurant',
        '#panel-profile',
        '.main-content',
    ];

    let container = null;
    for (const sel of targets) {
        const el = document.querySelector(sel);
        if (el) { container = el; break; }
    }
    if (!container) return;

    /* Ne pas dupliquer */
    if (document.getElementById('push-widget')) return;

    const widget = document.createElement('div');
    widget.id        = 'push-widget';
    widget.className = 'push-widget';
    widget.innerHTML = `
        <div class="push-widget-title">
            🔔 Notifications nouvelles commandes
        </div>

        <div class="push-status off" id="push-status-badge">
            <div class="push-status-dot"></div>
            <span id="push-status-text">Vérification…</span>
        </div>

        <div class="push-actions" id="push-actions">
            <button class="btn btn-primary btn-sm" id="push-enable-btn"
                onclick="pushAction('toggle')" style="display:none;">
                🔔 Activer les notifications
            </button>
            <button class="btn btn-ghost btn-sm" id="push-test-btn"
                onclick="pushAction('test')" style="display:none;">
                🧪 Tester
            </button>
            <button class="btn btn-danger btn-sm" id="push-disable-btn"
                onclick="pushAction('disable')" style="display:none;">
                🔕 Désactiver
            </button>
        </div>

        <p class="push-sub-count" id="push-sub-count" style="display:none;"></p>

        <div class="push-info-card" id="push-info-card">
            <strong>Comment ça fonctionne :</strong> Activez les notifications pour recevoir
            une alerte instantanée sur cet appareil dès qu'une nouvelle commande arrive,
            même si l'écran est verrouillé — comme WhatsApp.
        </div>`;

    container.appendChild(widget);
}


/* ══════════════════════════════════════════════════════════════════
   MISE À JOUR DU STATUT
══════════════════════════════════════════════════════════════════ */
async function refreshPushStatus() {
    const badge  = document.getElementById('push-status-badge');
    const text   = document.getElementById('push-status-text');
    const btnEn  = document.getElementById('push-enable-btn');
    const btnTst = document.getElementById('push-test-btn');
    const btnDis = document.getElementById('push-disable-btn');
    const info   = document.getElementById('push-info-card');

    if (!badge || !window.pushClient) return;

    const { supported, permission, subscribed } = await pushClient.getStatus();

    if (!supported) {
        badge.className  = 'push-status warn';
        text.textContent = 'Non supporté sur ce navigateur';
        if (info) info.innerHTML = '⚠️ Votre navigateur ne supporte pas les notifications push. Utilisez Chrome ou Firefox.';
        return;
    }

    if (permission === 'denied') {
        badge.className  = 'push-status warn';
        text.textContent = 'Notifications bloquées par le navigateur';
        if (info) info.innerHTML = '⚠️ Les notifications sont <strong>bloquées</strong> dans les paramètres du navigateur. Cliquez sur 🔒 dans la barre d\'adresse → Notifications → Autoriser, puis rechargez.';
        return;
    }

    if (subscribed) {
        badge.className  = 'push-status ok';
        text.textContent = 'Notifications actives sur cet appareil';
        if (btnEn)  btnEn.style.display  = 'none';
        if (btnTst) btnTst.style.display = 'inline-flex';
        if (btnDis) btnDis.style.display = 'inline-flex';
        if (info) info.style.display     = 'none';
        loadSubCount();
    } else {
        badge.className  = 'push-status off';
        text.textContent = 'Notifications désactivées';
        if (btnEn)  { btnEn.style.display = 'inline-flex'; btnEn.textContent = '🔔 Activer les notifications'; }
        if (btnTst) btnTst.style.display = 'none';
        if (btnDis) btnDis.style.display = 'none';
        if (info) info.style.display = 'block';
    }
}


/* ── Compte les abonnements actifs pour ce restaurant (optionnel) ── */
async function loadSubCount() {
    const el = document.getElementById('push-sub-count');
    if (!el || !window.db || !window.currentRestaurant) return;

    try {
        const { count } = await db
            .from('push_subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', currentRestaurant.id);

        if (count !== null) {
            el.style.display = 'block';
            el.textContent   = `${count} appareil${count > 1 ? 's' : ''} abonné${count > 1 ? 's' : ''}`;
        }
    } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════
   ACTIONS BOUTONS
══════════════════════════════════════════════════════════════════ */
window.pushAction = async function(action) {
    const btnEn = document.getElementById('push-enable-btn');

    try {
        if (action === 'toggle') {
            if (btnEn) { btnEn.disabled = true; btnEn.textContent = '⏳ Connexion…'; }
            await pushClient.subscribe();
            showPushToast('✅ Notifications activées !');
            await refreshPushStatus();

        } else if (action === 'test') {
            const btn = document.getElementById('push-test-btn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
            await pushClient.sendTest();
            showPushToast('🧪 Notification de test envoyée !');
            if (btn) { btn.disabled = false; btn.textContent = '🧪 Tester'; }

        } else if (action === 'disable') {
            const btn = document.getElementById('push-disable-btn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Désactivation…'; }
            await pushClient.unsubscribe();
            showPushToast('🔕 Notifications désactivées.');
            await refreshPushStatus();
            if (btn) { btn.disabled = false; }
        }

    } catch (e) {
        if (btnEn) { btnEn.disabled = false; btnEn.textContent = '🔔 Activer les notifications'; }
        showPushToast('❌ ' + e.message);
        console.error('Push action error:', e);
    }
};


/* ── Toast léger ── */
function showPushToast(msg, duration = 4000) {
    const existing = document.querySelector('.push-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className   = 'push-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
}


/* ══════════════════════════════════════════════════════════════════
   INIT — Attend que l'app admin soit prête
══════════════════════════════════════════════════════════════════ */
function waitForAdminReady() {
    /* Écouter l'événement custom dispatché par admin.html après connexion */
    window.addEventListener('admin:ready', async (event) => {
        const restaurantId = event.detail?.restaurantId || window.currentRestaurant?.id;
        if (!restaurantId || !window.pushClient) return;

        injectPushWidget();
        await pushClient.init(restaurantId);
        await refreshPushStatus();
    });

    /* Fallback : si admin:ready n'est jamais émis, on pool */
    let attempts = 0;
    const poller = setInterval(async () => {
        attempts++;
        if (attempts > 30) { clearInterval(poller); return; }

        if (window.currentRestaurant?.id && window.pushClient) {
            clearInterval(poller);
            injectPushWidget();
            await pushClient.init(window.currentRestaurant.id);
            await refreshPushStatus();
        }
    }, 1000);
}

waitForAdminReady();

/* ── Émettre admin:ready depuis admin.html ──
   Ajouter cette ligne dans la fonction initApp() de admin.html,
   juste après avoir assigné currentRestaurant :

   window.dispatchEvent(new CustomEvent('admin:ready', {
       detail: { restaurantId: profile.restaurant_id }
   }));
── */

console.log('✅ admin-push-patch.js chargé — widget notifications push');
