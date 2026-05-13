/**
 * checkout-table-patch.js — Mode table dans le checkout
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPORTEMENT :
 *  • Lit ?table=N depuis l'URL (priorité) ou sessionStorage
 *  • Si table trouvée :
 *    - Bannière "🪑 Table N" dans le résumé
 *    - Carte "Type de commande" remplacée par badge sur-place fixe
 *    - Champ adresse masqué
 *    - Patch de supabaseClient.from('orders').insert() pour ajouter table_number
 *    - deliveryType forcé sur 'sur_place', frais livraison = 0
 *  • Si pas de table → comportement 100% identique à avant
 *
 * INTÉGRATION dans la page checkout (index.html ou checkout.html) :
 *  Ajouter dans <head> :
 *    <script src="checkout-table-patch.js"></script>
 *  (Doit être chargé AVANT config.js et le reste du JS)
 */

'use strict';

const _TABLE_KEY   = 'resto_table';
const _TABLE_REGEX = /^[a-zA-Z0-9\-_ ]{1,20}$/;

/* ── Lire le numéro de table ── */
const _urlTable  = new URLSearchParams(location.search).get('table');
let   tableNumber = null;

if (_urlTable && _TABLE_REGEX.test(_urlTable)) {
    tableNumber = _urlTable;
    try { sessionStorage.setItem(_TABLE_KEY, tableNumber); } catch(_) {}
} else {
    try {
        const stored = sessionStorage.getItem(_TABLE_KEY);
        if (stored && _TABLE_REGEX.test(stored)) tableNumber = stored;
    } catch(_) {}
}

/* Si pas de table → sortir immédiatement, rien ne change */
if (!tableNumber) {
    console.log('checkout-table-patch: mode livraison normal (pas de table)');
    /* Export vide pour éviter les erreurs de référence */
    window._tableMode = null;
} else {
    console.log(`✅ checkout-table-patch: mode Table "${tableNumber}" activé`);
    window._tableMode = tableNumber;
    _init();
}


/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
function _injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
/* ── Bannière table ── */
.ct-table-banner {
    background: linear-gradient(135deg, rgba(197,160,89,.14), rgba(197,160,89,.06));
    border: 1px solid rgba(197,160,89,.3);
    border-radius: 12px; padding: 14px 18px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 12px;
    animation: ctBannerIn .3s ease;
}
@keyframes ctBannerIn {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0); }
}
.ct-table-icon { font-size: 1.5rem; flex-shrink: 0; }
.ct-table-label {
    font-family: 'Syne', 'DM Sans', sans-serif;
    font-size: .88rem; font-weight: 700; color: #c5a059;
}
.ct-table-sub { font-size: .75rem; color: rgba(197,160,89,.65); margin-top: 2px; }
.ct-table-chip {
    margin-left: auto; background: rgba(197,160,89,.15);
    border: 1px solid rgba(197,160,89,.3); border-radius: 20px;
    padding: 4px 12px; font-size: .72rem; font-weight: 600;
    color: #c5a059; white-space: nowrap; flex-shrink: 0;
}

/* ── Remplacement du sélecteur livraison ── */
.ct-on-site-lock {
    background: rgba(197,160,89,.07);
    border: 1px solid rgba(197,160,89,.2);
    border-radius: 10px; padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: .88rem; font-weight: 600; color: #c5a059;
}
.ct-on-site-lock span { font-size: .78rem; color: rgba(255,255,255,.45); font-weight: 400; margin-left: 4px; }
`;
    document.head.appendChild(s);
}


/* ══════════════════════════════════════════════════════════════════
   INIT — Attendre le DOM puis appliquer
══════════════════════════════════════════════════════════════════ */
function _init() {
    _injectStyles();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _applyTableMode);
    } else {
        _applyTableMode();
    }

    /* Patcher Supabase dès qu'il est disponible */
    _waitForSupabase(_patchSupabaseInsert);
}


/* ══════════════════════════════════════════════════════════════════
   APPLICATION DU MODE TABLE DANS L'UI
══════════════════════════════════════════════════════════════════ */
function _applyTableMode() {

    /* ── 1. Bannière en tête de page ── */
    _insertTableBanner();

    /* ── 2. Masquer / remplacer le sélecteur Sur place / Livraison ── */
    _replaceDeliverySelector();

    /* ── 3. Masquer le champ adresse (s'il est visible) ── */
    const addressField = document.getElementById('address-field') ||
                         document.querySelector('[id*="address"]');
    if (addressField) addressField.style.display = 'none';

    /* ── 4. Forcer deliveryType = 'sur_place' via la fonction existante ── */
    if (typeof selectDelivery === 'function') {
        selectDelivery('sur_place');
    } else {
        /* Fallback : écrire directement la variable globale */
        try { window.deliveryType = 'sur_place'; } catch(_) {}
        try { window.deliveryFee  = 0;           } catch(_) {}
    }

    /* ── 5. Forcer le recalcul du total (sans frais de livraison) ── */
    if (typeof updateTotals === 'function' || typeof displaySummary === 'function') {
        setTimeout(() => {
            try { displaySummary(); } catch(_) {}
        }, 200);
    }

    /* ── 6. Pré-remplir le type de commande dans l'affichage ── */
    const deliveryDisplay = document.getElementById('delivery-display');
    if (deliveryDisplay) deliveryDisplay.textContent = 'Gratuit (sur place)';
}


/* ── Bannière table dans le formulaire ── */
function _insertTableBanner() {
    if (document.getElementById('ct-table-banner')) return;

    const banner = document.createElement('div');
    banner.id        = 'ct-table-banner';
    banner.className = 'ct-table-banner';
    banner.innerHTML = `
        <span class="ct-table-icon">🪑</span>
        <div>
            <div class="ct-table-label">Table ${_escHTML(tableNumber)}</div>
            <div class="ct-table-sub">Commande sur place — le serveur apporte à votre table</div>
        </div>
        <span class="ct-table-chip">Sur place</span>`;

    /* Insérer avant le premier .card ou en tête du formulaire */
    const form      = document.getElementById('checkout-form');
    const firstCard = form?.querySelector('.card') ||
                      document.querySelector('.card, .checkout-card, form');

    if (firstCard) {
        firstCard.parentNode.insertBefore(banner, firstCard);
    } else if (form) {
        form.prepend(banner);
    } else {
        const container = document.querySelector('.container, main, body');
        container?.prepend(banner);
    }
}


/* ── Remplacer le sélecteur livraison par un badge "Sur place" verrouillé ── */
function _replaceDeliverySelector() {
    /* Chercher la carte de sélection livraison (plusieurs sélecteurs possibles) */
    const selectors = [
        '.card:has(.delivery-option)',      /* Moderne — CSS :has() */
        '#delivery-card',
        '.delivery-card',
        '[data-section="delivery"]',
    ];

    let deliveryCard = null;
    for (const sel of selectors) {
        try {
            deliveryCard = document.querySelector(sel);
            if (deliveryCard) break;
        } catch (_) {}
    }

    /* Fallback : chercher la card qui contient "livraison" dans son texte */
    if (!deliveryCard) {
        document.querySelectorAll('.card, section, .card-section').forEach(el => {
            if ((el.textContent || '').toLowerCase().includes('livraison') &&
                (el.textContent || '').toLowerCase().includes('sur place')) {
                deliveryCard = el;
            }
        });
    }

    if (deliveryCard) {
        /* Masquer les options cliquables et afficher un badge fixe */
        deliveryCard.querySelectorAll('.delivery-option').forEach(opt => {
            opt.style.display = 'none';
        });

        /* Injecter le badge "Sur place" verrouillé */
        if (!deliveryCard.querySelector('.ct-on-site-lock')) {
            const lock = document.createElement('div');
            lock.className = 'ct-on-site-lock';
            lock.innerHTML = `
                🪑 Sur place — Table ${_escHTML(tableNumber)}
                <span>(livraison indisponible depuis ce QR)</span>`;
            deliveryCard.appendChild(lock);
        }
    }

    /* Masquer aussi les options de paiement mobile si livraison seulement */
    /* Non applicable — TMoney/Flooz fonctionnent sur place aussi */
}


/* ══════════════════════════════════════════════════════════════════
   PATCH SUPABASE — Injecter table_number dans orders.insert()
══════════════════════════════════════════════════════════════════ */
function _patchSupabaseInsert() {
    const client = window.supabaseClient;
    if (!client || client.__tablePatchApplied) return;
    client.__tablePatchApplied = true;

    const _origFrom = client.from.bind(client);

    client.from = function(tableName) {
        const builder = _origFrom(tableName);

        /* Patcher uniquement la table "orders" */
        if (tableName === 'orders') {
            const _origInsert = builder.insert.bind(builder);

            builder.insert = function(data, opts) {
                const tNum = window._tableMode;
                if (tNum) {
                    if (Array.isArray(data)) {
                        data = data.map(row => ({
                            ...row,
                            table_number:  tNum,
                            delivery_type: 'sur_place',
                            delivery_fee:  0,
                        }));
                    } else if (data && typeof data === 'object') {
                        data = {
                            ...data,
                            table_number:  tNum,
                            delivery_type: 'sur_place',
                            delivery_fee:  0,
                        };
                    }
                    console.log(`✅ checkout-table-patch: table_number="${tNum}" injecté dans orders.insert()`);
                }
                return _origInsert(data, opts);
            };
        }

        return builder;
    };

    console.log('✅ checkout-table-patch: supabaseClient.from() patché pour orders');
}


/* ══════════════════════════════════════════════════════════════════
   ATTENTE SUPABASE
   supabaseClient est défini après CONFIG.load() dans init()
══════════════════════════════════════════════════════════════════ */
function _waitForSupabase(callback, attempts) {
    attempts = attempts || 0;
    if (attempts > 60) {
        console.warn('checkout-table-patch: supabaseClient jamais trouvé après 6s');
        return;
    }
    if (window.supabaseClient) {
        callback();
    } else {
        setTimeout(() => _waitForSupabase(callback, attempts + 1), 100);
    }
}


/* ── Helper ── */
function _escHTML(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}
