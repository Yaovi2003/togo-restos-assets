/**
 * admin-caisse-patch.js — Caisse Tactile (POS)
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE :
 *  • Panneau "🖥️ Caisse" dans la nav admin
 *  • Grille des plats cliquables (chargés depuis Supabase)
 *  • Ticket à droite avec quantités modifiables
 *  • Sélecteur paiement (Espèces / TMoney / Flooz)
 *  • Création commande dans orders + order_items + transactions
 *  • Reçu imprimable après validation
 *  • Recherche plat + filtres catégorie
 *
 * INTÉGRATION :
 *  Ajouter dans admin.html juste avant </body> :
 *    <script src="admin-caisse-patch.js"></script>
 *
 * TABLES SUPABASE NÉCESSAIRES (standard) :
 *  menu_items, orders, order_items, transactions
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

/* ── Layout POS ── */
#panel-caisse .pos-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 16px;
    height: calc(100vh - 140px);
    min-height: 500px;
}
@media(max-width:900px) {
    #panel-caisse .pos-layout {
        grid-template-columns: 1fr;
        height: auto;
    }
}

/* ── Colonne gauche : catalogue ── */
.pos-catalog { display: flex; flex-direction: column; overflow: hidden; }

.pos-search-bar {
    display: flex; gap: 8px; align-items: center;
    margin-bottom: 12px; flex-wrap: wrap;
}
.pos-search-inp {
    flex: 1; min-width: 160px;
    background: var(--surface2); border: 1.5px solid var(--border2);
    color: var(--text); padding: 10px 14px; border-radius: var(--radius);
    font-size: .88rem; outline: none;
    transition: border-color .2s; font-family: inherit;
}
.pos-search-inp:focus { border-color: var(--gold); }

.pos-cat-tabs {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;
}
.pos-cat-tab {
    padding: 5px 12px; border-radius: 50px;
    border: 1px solid var(--border2); background: transparent;
    color: var(--text-dim); font-size: .75rem; font-weight: 600;
    cursor: pointer; transition: all .15s;
}
.pos-cat-tab:hover { border-color: var(--gold); color: var(--gold); }
.pos-cat-tab.on { background: var(--gold); color: #000; border-color: var(--gold); }

.pos-items-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    overflow-y: auto;
    padding-right: 4px;
    flex: 1;
}
.pos-items-grid::-webkit-scrollbar { width: 4px; }
.pos-items-grid::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

.pos-item-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
    cursor: pointer; transition: all .15s;
    display: flex; flex-direction: column;
    user-select: none;
}
.pos-item-card:hover { border-color: var(--gold); transform: translateY(-2px); }
.pos-item-card:active { transform: scale(.97); }
.pos-item-card.out-of-stock { opacity: .45; pointer-events: none; }

.pos-item-img {
    width: 100%; height: 70px; object-fit: cover;
    background: var(--surface2); display: flex;
    align-items: center; justify-content: center;
    font-size: 1.6rem; color: var(--text-muted); flex-shrink: 0;
}
.pos-item-img img { width: 100%; height: 100%; object-fit: cover; display: block; }

.pos-item-body { padding: 8px 10px; flex: 1; }
.pos-item-name {
    font-size: .78rem; font-weight: 600; line-height: 1.3;
    margin-bottom: 4px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
}
.pos-item-price {
    font-family: var(--mono); font-size: .8rem; color: var(--gold); font-weight: 500;
}
.pos-item-add-btn {
    background: var(--gold); color: #000;
    border: none; width: 100%; padding: 6px;
    font-size: .75rem; font-weight: 700;
    cursor: pointer; transition: opacity .15s;
}
.pos-item-add-btn:hover { opacity: .85; }

/* ── Colonne droite : ticket ── */
.pos-ticket {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius-lg); display: flex; flex-direction: column;
    overflow: hidden;
}
.pos-ticket-head {
    padding: 16px 18px 12px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
}
.pos-ticket-title {
    font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700;
}
.pos-ticket-clear {
    background: none; border: 1px solid rgba(231,76,60,.3);
    color: var(--danger); font-size: .72rem; font-weight: 600;
    padding: 4px 10px; border-radius: 6px; cursor: pointer;
    transition: all .15s;
}
.pos-ticket-clear:hover { background: rgba(231,76,60,.1); }

.pos-ticket-items { flex: 1; overflow-y: auto; padding: 8px 0; }
.pos-ticket-items::-webkit-scrollbar { width: 4px; }
.pos-ticket-items::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.pos-ticket-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100%; gap: 10px;
    color: var(--text-muted); font-size: .85rem; padding: 20px;
    text-align: center;
}
.pos-ticket-empty-icon { font-size: 2rem; opacity: .4; }

.pos-line {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 1px solid var(--border);
}
.pos-line:last-child { border-bottom: none; }
.pos-line-name { flex: 1; font-size: .82rem; font-weight: 500; }
.pos-line-qty-ctrl { display: flex; align-items: center; gap: 4px; }
.pos-qty-btn {
    width: 22px; height: 22px; border-radius: 50%;
    border: 1px solid var(--border2); background: var(--surface2);
    color: var(--text); font-size: .85rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .15s; flex-shrink: 0;
    line-height: 1;
}
.pos-qty-btn:hover { border-color: var(--gold); color: var(--gold); }
.pos-qty-val { font-family: var(--mono); font-size: .8rem; min-width: 20px; text-align: center; }
.pos-line-price {
    font-family: var(--mono); font-size: .8rem; color: var(--gold);
    min-width: 80px; text-align: right; flex-shrink: 0;
}

/* ── Pied de ticket ── */
.pos-ticket-foot { padding: 14px 16px; border-top: 1px solid var(--border2); }

.pos-totals { margin-bottom: 12px; }
.pos-total-row {
    display: flex; justify-content: space-between;
    font-size: .82rem; padding: 3px 0;
    color: var(--text-dim);
}
.pos-total-row.big {
    font-size: 1.15rem; font-weight: 700; color: var(--text);
    padding-top: 8px; border-top: 1px solid var(--border2); margin-top: 6px;
}
.pos-total-row.big span:last-child { color: var(--gold); font-family: var(--mono); }

.pos-payment-btns {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 6px; margin-bottom: 10px;
}
.pos-pay-btn {
    padding: 8px 4px; border-radius: 8px; text-align: center;
    font-size: .72rem; font-weight: 600; cursor: pointer;
    border: 1.5px solid var(--border2); background: transparent;
    color: var(--text-dim); transition: all .15s;
}
.pos-pay-btn:hover { border-color: var(--gold); color: var(--gold); }
.pos-pay-btn.on { border-color: var(--gold); background: rgba(197,160,89,.12); color: var(--gold); }

.pos-customer-section { margin-bottom: 10px; }
.pos-customer-inp {
    width: 100%; background: var(--surface2); border: 1.5px solid var(--border2);
    color: var(--text); padding: 9px 12px; border-radius: 8px;
    font-size: .82rem; outline: none; font-family: inherit;
    transition: border-color .2s; margin-bottom: 6px;
}
.pos-customer-inp:focus { border-color: var(--gold); }

.pos-validate-btn {
    width: 100%; background: var(--gold); color: #000;
    border: none; padding: 13px; border-radius: var(--radius);
    font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700;
    cursor: pointer; transition: opacity .2s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
}
.pos-validate-btn:hover { opacity: .88; }
.pos-validate-btn:disabled { opacity: .45; pointer-events: none; }

/* ── Reçu modal ── */
#pos-receipt-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.75);
    backdrop-filter: blur(8px); z-index: 9000;
    display: none; align-items: center; justify-content: center; padding: 20px;
}
#pos-receipt-overlay.show { display: flex; }
.pos-receipt-box {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius-lg); padding: 28px;
    max-width: 360px; width: 100%; max-height: 90vh; overflow-y: auto;
}
.pos-receipt-head { text-align: center; margin-bottom: 20px; }
.pos-receipt-head h3 { font-family: 'Syne', sans-serif; font-size: 1.1rem; color: var(--gold); }
.pos-receipt-head p  { font-size: .8rem; color: var(--text-dim); margin-top: 4px; }
.pos-receipt-divider { border: none; border-top: 1px dashed var(--border2); margin: 14px 0; }
.pos-receipt-row {
    display: flex; justify-content: space-between;
    font-size: .82rem; padding: 4px 0;
}
.pos-receipt-row.total { font-weight: 700; font-size: 1rem; color: var(--gold); padding-top: 8px; }
.pos-receipt-actions {
    display: flex; gap: 8px; margin-top: 20px;
}
.pos-receipt-actions button { flex: 1; }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL CAISSE
══════════════════════════════════════════════════════════════════ */
let posMenuItems   = [];          /* Tous les plats du restaurant */
let posCart        = {};          /* { itemId: { name, price, qty } } */
let posPayMethod   = 'especes';   /* Paiement sélectionné */
let posActiveCat   = 'Tous';      /* Filtre catégorie actif */
let posSearchQ     = '';          /* Recherche texte */
let posLastOrderId = null;

const POS_PAY_LABELS = { especes: '💵 Espèces', tmoney: '📱 TMoney', flooz: '📱 Flooz' };


/* ══════════════════════════════════════════════════════════════════
   INJECTION NAV + PANEL
══════════════════════════════════════════════════════════════════ */
(function injectNavAndPanel() {
    /* ── Nav button ── */
    const nav = document.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('[data-panel="caisse"]')) {
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.panel = 'caisse';
        btn.innerHTML = '<span class="nav-icon">🖥️</span> Caisse';
        const ordersBtn = nav.querySelector('[data-panel="orders-admin"]');
        if (ordersBtn) ordersBtn.insertAdjacentElement('afterend', btn);
        else nav.appendChild(btn);
    }

    /* ── Panel HTML ── */
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('panel-caisse')) {
        const panel = document.createElement('div');
        panel.id        = 'panel-caisse';
        panel.className = 'panel';
        panel.style.display = 'none';
        panel.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">🖥️ Caisse tactile</h2>
                <p class="section-subtitle">Saisie rapide des commandes sur place</p>
            </div>
        </div>

        <div class="pos-layout">
            <!-- CATALOGUE -->
            <div class="pos-catalog">
                <div class="pos-search-bar">
                    <input type="search" class="pos-search-inp" id="pos-search"
                        placeholder="🔍 Rechercher un plat…"
                        oninput="posFilter(this.value)">
                </div>
                <div class="pos-cat-tabs" id="pos-cat-tabs"></div>
                <div class="pos-items-grid" id="pos-items-grid">
                    <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);">
                        <div class="an-spinner" style="margin:0 auto 10px;"></div>
                        Chargement du menu…
                    </div>
                </div>
            </div>

            <!-- TICKET -->
            <div class="pos-ticket">
                <div class="pos-ticket-head">
                    <span class="pos-ticket-title">🧾 Ticket</span>
                    <button class="pos-ticket-clear" onclick="posClearCart()">✕ Vider</button>
                </div>
                <div class="pos-ticket-items" id="pos-ticket-items">
                    <div class="pos-ticket-empty">
                        <div class="pos-ticket-empty-icon">🛒</div>
                        <span>Cliquez sur un plat<br>pour l'ajouter</span>
                    </div>
                </div>
                <div class="pos-ticket-foot">
                    <div class="pos-totals">
                        <div class="pos-total-row">
                            <span>Sous-total</span>
                            <span id="pos-subtotal">0 FCFA</span>
                        </div>
                        <div class="pos-total-row big">
                            <span>TOTAL</span>
                            <span id="pos-total">0 FCFA</span>
                        </div>
                    </div>

                    <div class="pos-payment-btns">
                        <button class="pos-pay-btn on" data-pay="especes" onclick="posSelectPay('especes')">💵<br>Espèces</button>
                        <button class="pos-pay-btn" data-pay="tmoney" onclick="posSelectPay('tmoney')">📱<br>TMoney</button>
                        <button class="pos-pay-btn" data-pay="flooz" onclick="posSelectPay('flooz')">📱<br>Flooz</button>
                    </div>

                    <div class="pos-customer-section">
                        <input type="text" class="pos-customer-inp" id="pos-customer-name"
                            placeholder="👤 Nom du client (optionnel)" maxlength="80">
                        <input type="tel" class="pos-customer-inp" id="pos-customer-phone"
                            placeholder="📞 Téléphone (optionnel)" maxlength="20">
                    </div>

                    <button class="pos-validate-btn" id="pos-validate-btn" onclick="posValidateOrder()">
                        ✅ Valider la commande
                    </button>
                </div>
            </div>
        </div>

        <!-- REÇU MODAL -->
        <div id="pos-receipt-overlay">
            <div class="pos-receipt-box">
                <div class="pos-receipt-head">
                    <div style="font-size:2rem;margin-bottom:8px;">🧾</div>
                    <h3>Commande validée !</h3>
                    <p id="pos-receipt-ref">Réf. —</p>
                </div>
                <hr class="pos-receipt-divider">
                <div id="pos-receipt-items"></div>
                <hr class="pos-receipt-divider">
                <div class="pos-receipt-row total">
                    <span>TOTAL</span>
                    <span id="pos-receipt-total">—</span>
                </div>
                <div class="pos-receipt-row" style="color:var(--text-dim);">
                    <span>Paiement</span>
                    <span id="pos-receipt-pay">—</span>
                </div>
                <div class="pos-receipt-actions">
                    <button class="btn btn-ghost btn-sm" onclick="posPrintReceipt()">🖨️ Imprimer</button>
                    <button class="btn btn-primary btn-sm" onclick="posCloseReceipt()">Nouvelle commande →</button>
                </div>
            </div>
        </div>`;
        main.appendChild(panel);
    }

    /* ── Hook showPanel ── */
    const _orig = window.showPanel;
    window.showPanel = function(id) {
        _orig(id);
        if (id === 'caisse') loadPosMenu();
    };
})();


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT MENU
══════════════════════════════════════════════════════════════════ */
window.loadPosMenu = async function() {
    let tries = 0;
    while ((!window.db || !window.currentRestaurant) && tries++ < 20)
        await new Promise(r => setTimeout(r, 300));
    if (!window.db || !window.currentRestaurant) return;

    try {
        const { data, error } = await db
            .from('menu_items')
            .select('id, name, price, category, image_url, is_available')
            .eq('restaurant_id', currentRestaurant.id)
            .order('category')
            .order('name');
        if (error) throw error;
        posMenuItems = data || [];
        buildCatTabs();
        renderPosGrid();
    } catch (e) {
        const grid = document.getElementById('pos-items-grid');
        if (grid) grid.innerHTML = `<div style="grid-column:1/-1;color:var(--danger);padding:20px;">Erreur : ${e.message}</div>`;
    }
};


/* ── Catégories ── */
function buildCatTabs() {
    const el = document.getElementById('pos-cat-tabs');
    if (!el) return;
    const cats = ['Tous', ...new Set(posMenuItems.map(i => i.category).filter(Boolean))];
    el.innerHTML = cats.map(c => `
        <button class="pos-cat-tab${c === posActiveCat ? ' on' : ''}"
            onclick="posSetCat('${c.replace(/'/g,"\\'")}')">
            ${c}
        </button>`).join('');
}

window.posSetCat = function(cat) {
    posActiveCat = cat;
    buildCatTabs();
    renderPosGrid();
};

window.posFilter = function(q) {
    posSearchQ = q.toLowerCase().trim();
    renderPosGrid();
};


/* ── Rendu grille ── */
function renderPosGrid() {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;

    let items = posMenuItems;
    if (posActiveCat !== 'Tous') items = items.filter(i => i.category === posActiveCat);
    if (posSearchQ) items = items.filter(i => i.name.toLowerCase().includes(posSearchQ));

    if (!items.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);">Aucun plat trouvé.</div>';
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="pos-item-card${item.is_available === false ? ' out-of-stock' : ''}"
            onclick="posAddItem('${item.id}', ${JSON.stringify(item.name).replace(/</g,'&lt;')}, ${item.price})">
            <div class="pos-item-img">
                ${item.image_url
                    ? `<img src="${item.image_url}" alt="${item.name}" loading="lazy">`
                    : '🍽️'}
            </div>
            <div class="pos-item-body">
                <div class="pos-item-name">${item.name}</div>
                <div class="pos-item-price">${Number(item.price).toLocaleString('fr-FR')} FCFA</div>
            </div>
            <button class="pos-item-add-btn" tabindex="-1">+ Ajouter</button>
        </div>`).join('');
}


/* ══════════════════════════════════════════════════════════════════
   GESTION DU PANIER
══════════════════════════════════════════════════════════════════ */
window.posAddItem = function(id, name, price) {
    if (posCart[id]) {
        posCart[id].qty++;
    } else {
        posCart[id] = { name, price, qty: 1 };
    }
    renderTicket();
};

window.posUpdateQty = function(id, delta) {
    if (!posCart[id]) return;
    posCart[id].qty += delta;
    if (posCart[id].qty <= 0) delete posCart[id];
    renderTicket();
};

window.posClearCart = function() {
    posCart = {};
    renderTicket();
};

function renderTicket() {
    const el       = document.getElementById('pos-ticket-items');
    const subtotEl = document.getElementById('pos-subtotal');
    const totalEl  = document.getElementById('pos-total');
    if (!el) return;

    const entries = Object.entries(posCart);
    if (!entries.length) {
        el.innerHTML = `<div class="pos-ticket-empty">
            <div class="pos-ticket-empty-icon">🛒</div>
            <span>Cliquez sur un plat<br>pour l'ajouter</span>
        </div>`;
        if (subtotEl) subtotEl.textContent = '0 FCFA';
        if (totalEl)  totalEl.textContent  = '0 FCFA';
        return;
    }

    let subtotal = 0;
    el.innerHTML = entries.map(([id, item]) => {
        const lineTotal = item.price * item.qty;
        subtotal += lineTotal;
        return `<div class="pos-line">
            <span class="pos-line-name">${item.name}</span>
            <div class="pos-line-qty-ctrl">
                <button class="pos-qty-btn" onclick="posUpdateQty('${id}', -1)">−</button>
                <span class="pos-qty-val">${item.qty}</span>
                <button class="pos-qty-btn" onclick="posUpdateQty('${id}', 1)">+</button>
            </div>
            <span class="pos-line-price">${lineTotal.toLocaleString('fr-FR')} FCFA</span>
        </div>`;
    }).join('');

    if (subtotEl) subtotEl.textContent = subtotal.toLocaleString('fr-FR') + ' FCFA';
    if (totalEl)  totalEl.textContent  = subtotal.toLocaleString('fr-FR') + ' FCFA';
}


/* ── Paiement ── */
window.posSelectPay = function(method) {
    posPayMethod = method;
    document.querySelectorAll('.pos-pay-btn').forEach(b => b.classList.remove('on'));
    const btn = document.querySelector(`.pos-pay-btn[data-pay="${method}"]`);
    if (btn) btn.classList.add('on');
};


/* ══════════════════════════════════════════════════════════════════
   VALIDATION COMMANDE
══════════════════════════════════════════════════════════════════ */
window.posValidateOrder = async function() {
    const entries = Object.entries(posCart);
    if (!entries.length) { toast('Le ticket est vide.', 'warning'); return; }

    const validateBtn = document.getElementById('pos-validate-btn');
    validateBtn.disabled = true;
    validateBtn.innerHTML = '<div class="an-spinner"></div> Enregistrement…';

    const customerName  = (document.getElementById('pos-customer-name')?.value || '').trim() || 'Client caisse';
    const customerPhone = (document.getElementById('pos-customer-phone')?.value || '').replace(/[^0-9+]/g,'') || null;
    const subtotal      = entries.reduce((s, [, i]) => s + i.price * i.qty, 0);

    try {
        /* 1. Créer la commande */
        const { data: order, error: orderErr } = await db
            .from('orders')
            .insert({
                restaurant_id:   currentRestaurant.id,
                customer_name:   customerName,
                customer_phone:  customerPhone,
                delivery_type:   'sur_place',
                delivery_fee:    0,
                subtotal:        subtotal,
                discount:        0,
                total:           subtotal,
                status:          'livré',
                payment_method:  posPayMethod,
                notes:           'Commande caisse tactile'
            })
            .select()
            .single();

        if (orderErr) throw orderErr;

        /* 2. Lignes de commande */
        const orderItems = entries.map(([, item]) => ({
            order_id:   order.id,
            item_name:  item.name,
            item_price: item.price,
            quantity:   item.qty,
        }));
        await db.from('order_items').insert(orderItems);

        /* 3. Transaction comptable */
        await db.from('transactions').insert({
            restaurant_id:  currentRestaurant.id,
            order_id:       order.id,
            amount:         subtotal,
            payment_method: posPayMethod,
            type:           'sur_place',
            description:    `Caisse — ${customerName}`,
        });

        posLastOrderId = order.id;

        /* 4. Afficher le reçu */
        showPosReceipt(order.id, entries, subtotal);
        toast('Commande enregistrée !', 'success');

    } catch (e) {
        toast('Erreur : ' + e.message, 'error');
    } finally {
        validateBtn.disabled = false;
        validateBtn.innerHTML = '✅ Valider la commande';
    }
};


/* ══════════════════════════════════════════════════════════════════
   REÇU
══════════════════════════════════════════════════════════════════ */
function showPosReceipt(orderId, entries, total) {
    const overlay = document.getElementById('pos-receipt-overlay');
    if (!overlay) return;

    document.getElementById('pos-receipt-ref').textContent   = `Réf. #${orderId.substring(0, 8).toUpperCase()}`;
    document.getElementById('pos-receipt-total').textContent  = total.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('pos-receipt-pay').textContent    = POS_PAY_LABELS[posPayMethod] || posPayMethod;
    document.getElementById('pos-receipt-items').innerHTML    = entries.map(([, item]) => `
        <div class="pos-receipt-row">
            <span>${item.name} ×${item.qty}</span>
            <span>${(item.price * item.qty).toLocaleString('fr-FR')} FCFA</span>
        </div>`).join('');

    overlay.classList.add('show');
}

window.posCloseReceipt = function() {
    document.getElementById('pos-receipt-overlay')?.classList.remove('show');
    posClearCart();
    document.getElementById('pos-customer-name').value  = '';
    document.getElementById('pos-customer-phone').value = '';
};

window.posPrintReceipt = function() {
    const content = document.querySelector('.pos-receipt-box');
    if (!content) return;
    const w = window.open('', '_blank', 'width=380,height=600');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Reçu — ${currentRestaurant?.name || ''}</title>
    <style>
        body { font-family: monospace; font-size: 13px; padding: 20px; max-width: 340px; }
        h3   { text-align: center; margin-bottom: 6px; }
        p    { text-align: center; color: #666; font-size: 11px; margin-bottom: 16px; }
        hr   { border: none; border-top: 1px dashed #ccc; margin: 12px 0; }
        .row { display: flex; justify-content: space-between; padding: 3px 0; }
        .total { font-weight: bold; font-size: 15px; }
    </style>
    </head><body>${content.querySelector('.pos-receipt-head').outerHTML.replace(/<button[^>]*>.*?<\/button>/gs,'')}
    <hr>
    ${content.getElementById ? '' : document.getElementById('pos-receipt-items').innerHTML}
    <div>${document.getElementById('pos-receipt-items').innerHTML}</div>
    <hr>
    <div class="row total">
        <span>TOTAL</span>
        <span>${document.getElementById('pos-receipt-total').textContent}</span>
    </div>
    <div class="row" style="color:#666;">
        <span>Paiement</span>
        <span>${document.getElementById('pos-receipt-pay').textContent}</span>
    </div>
    <hr>
    <p style="text-align:center;margin-top:16px;">Merci de votre visite !<br>${currentRestaurant?.name || ''}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 400);
};
// Re-bind du listener sur le nouveau bouton caisse
const caisseBtn = document.querySelector('[data-panel="caisse"]');
if (caisseBtn) {
    caisseBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) window.closeMobileSidebar?.();
        window.showPanel('caisse');
    });
}
console.log('✅ admin-caisse-patch.js chargé — Caisse tactile POS');
