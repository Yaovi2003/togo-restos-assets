// ================================================================
// admin-delivery-unified.js
// Domaine : Livraison — livreurs, PIN, chat
// Fusion de : admin-delivery-patch.js + admin-delivery-pin-patch.js + admin-delivery-chat-patch.js
// ================================================================

// ────────────────────────────────────────────────────────────────
// SECTION 1 — Gestion des livreurs (admin-delivery-patch.js)
// ────────────────────────────────────────────────────────────────

/**
 * admin-delivery-patch.js — Gestion des livreurs
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE :
 *  • Panneau "🛵 Livreurs" dans la nav admin
 *  • Création / suppression de livreurs (nom + téléphone)
 *  • Lien unique par livreur → /livreur.html?id=UUID
 *  • Dans le panneau commandes, bouton "Assigner" sur les commandes en livraison
 *  • Tableau de bord : courses du jour par livreur
 *  • Notification WhatsApp au livreur à chaque nouvelle assignation
 *
 * SQL À EXÉCUTER UNE FOIS DANS SUPABASE :
 *
 *   CREATE TABLE delivery_persons (
 *     id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
 *     restaurant_id uuid        REFERENCES restaurants(id) ON DELETE CASCADE,
 *     name          text        NOT NULL CHECK (length(name) <= 80),
 *     phone         text        CHECK (length(phone) <= 20),
 *     is_active     boolean     DEFAULT true,
 *     created_at    timestamptz DEFAULT now()
 *   );
 *
 *   ALTER TABLE orders
 *     ADD COLUMN IF NOT EXISTS delivery_person_id uuid
 *     REFERENCES delivery_persons(id) ON DELETE SET NULL;
 *
 * INTÉGRATION dans admin.html — avant </body> :
 *   <script src="admin-delivery-patch.js"></script>
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

/* ── Panel livreurs ── */
.dlv-add-form {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius-lg); padding: 18px 20px; margin-bottom: 20px;
    display: grid; grid-template-columns: 1fr 150px auto; gap: 10px; align-items: end;
}
@media(max-width:600px) { .dlv-add-form { grid-template-columns: 1fr 1fr; } }

/* ── Carte livreur ── */
.dlv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px; margin-bottom: 20px;
}
.dlv-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 16px 18px;
    transition: border-color .15s;
}
.dlv-card:hover { border-color: rgba(197,160,89,.25); }

.dlv-card-head {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
}
.dlv-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(197,160,89,.3), rgba(197,160,89,.1));
    color: var(--gold, #c5a059); font-weight: 700; font-size: .95rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dlv-name  { font-size: .92rem; font-weight: 600; }
.dlv-phone { font-size: .75rem; color: rgba(255,255,255,.4); margin-top: 2px; }
.dlv-del-btn {
    margin-left: auto; background: none; border: none;
    color: rgba(255,255,255,.2); font-size: .85rem;
    cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: all .15s;
}
.dlv-del-btn:hover { color: #e74c3c; background: rgba(231,76,60,.12); }

.dlv-stats {
    display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
}
.dlv-stat-pill {
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 3px 12px;
    font-size: .72rem; font-weight: 500; color: rgba(255,255,255,.45);
}
.dlv-stat-pill.active { background: rgba(197,160,89,.1); border-color: rgba(197,160,89,.25); color: var(--gold, #c5a059); }

.dlv-link {
    font-family: 'IBM Plex Mono', monospace; font-size: .62rem;
    color: rgba(197,160,89,.45); word-break: break-all; margin-bottom: 10px;
}
.dlv-actions { display: flex; gap: 6px; }
.dlv-action-btn {
    flex: 1; padding: 6px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,.1); background: transparent;
    color: rgba(255,255,255,.45); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
}
.dlv-action-btn:hover { border-color: rgba(197,160,89,.3); color: var(--gold, #c5a059); }
.dlv-action-btn.wa    { border-color: rgba(37,211,102,.2); color: #25d366; }
.dlv-action-btn.wa:hover { background: rgba(37,211,102,.08); }

/* ── Bouton assigner dans les commandes ── */
.btn-assign-delivery {
    background: rgba(197,160,89,.1); border: 1px solid rgba(197,160,89,.25);
    color: var(--gold, #c5a059); padding: 5px 12px; border-radius: 6px;
    font-size: .72rem; font-weight: 600; cursor: pointer; white-space: nowrap;
    flex-shrink: 0; font-family: inherit; transition: all .15s;
}
.btn-assign-delivery:hover { background: rgba(197,160,89,.2); }
.btn-assign-delivery.assigned { background: rgba(46,204,113,.1); border-color: rgba(46,204,113,.25); color: #2ecc71; }

/* ── Dropdown assignation ── */
.dlv-dropdown-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,.7); backdrop-filter: blur(6px);
    display: none; align-items: center; justify-content: center; padding: 20px;
}
.dlv-dropdown-overlay.show { display: flex; }
.dlv-dropdown-box {
    background: var(--surface, #141414); border: 1px solid rgba(255,255,255,.14);
    border-radius: 16px; padding: 22px; width: 100%; max-width: 340px;
    animation: dlvIn .25s ease;
}
@keyframes dlvIn { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }
.dlv-dropdown-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; margin-bottom: 14px; }
.dlv-person-option {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 12px; border-radius: 10px; cursor: pointer;
    transition: background .15s; margin-bottom: 6px;
    border: 1px solid rgba(255,255,255,.07);
}
.dlv-person-option:hover { background: rgba(255,255,255,.05); border-color: rgba(197,160,89,.2); }
.dlv-person-option .dlv-av-sm {
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(197,160,89,.15); color: var(--gold, #c5a059);
    font-weight: 700; font-size: .82rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dlv-person-option .dlv-opt-name { font-size: .88rem; font-weight: 600; }
.dlv-person-option .dlv-opt-courses { font-size: .72rem; color: rgba(255,255,255,.35); margin-top: 2px; }
.dlv-close-btn {
    width: 100%; background: transparent; border: 1px solid rgba(255,255,255,.1);
    color: rgba(255,255,255,.4); padding: 10px; border-radius: 8px;
    font-size: .82rem; font-weight: 600; cursor: pointer; font-family: inherit;
    margin-top: 8px; transition: all .15s;
}
.dlv-close-btn:hover { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.6); }

/* ── Vide ── */
.dlv-empty {
    text-align: center; padding: 40px 20px;
    color: rgba(255,255,255,.3); font-size: .88rem; line-height: 1.7;
}
.dlv-empty-icon { font-size: 2.2rem; display: block; margin-bottom: 10px; }
`;
    document.head.appendChild(s);
})();

/* ══════════════════════════════════════════════════════════════════
   INJECTION NAV + PANEL
══════════════════════════════════════════════════════════════════ */
(function injectNavAndPanel() {
    // Attendre que le DOM soit prêt
    const waitForNav = setInterval(() => {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        clearInterval(waitForNav);

        if (!nav.querySelector('[data-panel="livreurs"]')) {
            const btn = document.createElement('button');
            btn.className     = 'nav-item';
            btn.dataset.panel = 'livreurs';
            btn.innerHTML     = '<span class="nav-icon">🛵</span> Livreurs';
            
            // Trouver la position après le panneau Commandes
            const ordersBtn = nav.querySelector('[data-panel="orders-admin"]') ||
                              nav.querySelector('[data-panel="caisse"]');
            
            if (ordersBtn) {
                ordersBtn.insertAdjacentElement('afterend', btn);
            } else {
                nav.appendChild(btn);
            }
            
            // Attacher l'événement click
            btn.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    const overlay = document.getElementById('sidebar-overlay');
                    if (overlay) overlay.classList.remove('visible');
                    document.querySelector('.sidebar')?.classList.remove('mobile-open');
                    document.body.style.overflow = '';
                }
                if (typeof showPanel === 'function') showPanel('livreurs');
            });
        }
    }, 100);

    // Création du panneau (ne change pas)
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('panel-livreurs')) {
        const panel = document.createElement('div');
        panel.id        = 'panel-livreurs';
        panel.className = 'panel';
        panel.style.display = 'none';
        panel.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">🛵 Gestion des livreurs</h2>
                <p class="section-subtitle">Assignez les commandes et suivez les courses en temps réel</p>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="loadDeliveryPersons()">🔄 Rafraîchir</button>
        </div>

        <!-- Formulaire ajout livreur -->
        <div class="dlv-add-form">
            <div>
                <label class="field-label" style="margin-bottom:5px;display:block;">Nom du livreur *</label>
                <input type="text" id="dlv-name-inp" class="field-input"
                    placeholder="Kofi Mensah" maxlength="80"
                    onkeydown="if(event.key==='Enter')addDeliveryPerson()">
            </div>
            <div>
                <label class="field-label" style="margin-bottom:5px;display:block;">Téléphone</label>
                <input type="tel" id="dlv-phone-inp" class="field-input"
                    placeholder="22890010203" maxlength="20"
                    onkeydown="if(event.key==='Enter')addDeliveryPerson()">
            </div>
            <button class="btn btn-primary" onclick="addDeliveryPerson()" style="height:40px;">
                + Ajouter
            </button>
        </div>

        <!-- Grille des livreurs -->
        <div class="dlv-grid" id="dlv-grid">
            <div class="dlv-empty">
                <span class="dlv-empty-icon">⏳</span>Chargement…
            </div>
        </div>`;
        main.appendChild(panel);
    }

    /* Dropdown d'assignation (global, réutilisé) */
    if (!document.getElementById('dlv-dropdown-overlay')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="dlv-dropdown-overlay" id="dlv-dropdown-overlay">
            <div class="dlv-dropdown-box">
                <div class="dlv-dropdown-title">🛵 Assigner à un livreur</div>
                <div id="dlv-dropdown-list"></div>
                <button class="dlv-close-btn" onclick="closeDlvDropdown()">Annuler</button>
            </div>
        </div>`);
    }

    const _orig = window.showPanel;
    window.showPanel = function(id) {
        _orig(id);
        if (id === 'livreurs')     loadDeliveryPersons();
        if (id === 'orders-admin') setTimeout(_injectAssignButtons, 500);
    };
})();


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DES LIVREURS
══════════════════════════════════════════════════════════════════ */
let _deliveryPersons = [];

window.loadDeliveryPersons = async function() {
    if (!window.db || !window.currentRestaurant) return;
    const grid = document.getElementById('dlv-grid');
    if (grid) grid.innerHTML = '<div class="dlv-empty"><span class="dlv-empty-icon">⏳</span>Chargement…</div>';

    try {
        const { data, error } = await db
            .from('delivery_persons')
            .select('id, name, phone, is_active, created_at')
            .eq('restaurant_id', currentRestaurant.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                if (grid) grid.innerHTML = `<div class="dlv-empty">⚠️ Table manquante — exécutez le SQL de la doc.</div>`;
                return;
            }
            throw error;
        }

        _deliveryPersons = data || [];
        await _renderDeliveryPersons(_deliveryPersons);

    } catch (e) {
        if (grid) grid.innerHTML = `<div class="dlv-empty" style="color:var(--danger,#e74c3c);">Erreur : ${_esc(e.message)}</div>`;
    }
};


async function _renderDeliveryPersons(persons) {
    const grid = document.getElementById('dlv-grid');
    if (!grid) return;

    if (!persons.length) {
        grid.innerHTML = `<div class="dlv-empty" style="grid-column:1/-1;">
            <span class="dlv-empty-icon">🛵</span>
            Aucun livreur configuré.<br>
            Ajoutez votre premier livreur ci-dessus.
        </div>`;
        return;
    }

    /* Charger les courses du jour par livreur */
    const today = new Date().toISOString().split('T')[0];
    const ids   = persons.map(p => p.id);
    let coursesByPerson = {};

    try {
        const { data: orders } = await db
            .from('orders')
            .select('delivery_person_id, status')
            .in('delivery_person_id', ids)
            .gte('created_at', today);

        (orders || []).forEach(o => {
            if (!coursesByPerson[o.delivery_person_id]) {
                coursesByPerson[o.delivery_person_id] = { total: 0, done: 0 };
            }
            coursesByPerson[o.delivery_person_id].total++;
            if (o.status === 'livré') coursesByPerson[o.delivery_person_id].done++;
        });
    } catch(_) {}

    grid.innerHTML = '';
    persons.forEach(p => {
        const stats    = coursesByPerson[p.id] || { total: 0, done: 0 };
        const initials = p.name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
        const link     = `${location.origin}/livreur.html?id=${p.id}`;

        const card = document.createElement('div');
        card.className = 'dlv-card';
        card.innerHTML = `
            <div class="dlv-card-head">
                <div class="dlv-avatar">${initials}</div>
                <div>
                    <div class="dlv-name">${_esc(p.name)}</div>
                    <div class="dlv-phone">${p.phone ? `📞 ${_esc(p.phone)}` : 'Pas de téléphone'}</div>
                </div>
                <button class="dlv-del-btn" onclick="deleteDeliveryPerson('${p.id}','${_esc(p.name)}')" title="Désactiver">🗑</button>
            </div>
            <div class="dlv-stats">
                <span class="dlv-stat-pill ${stats.total > 0 ? 'active' : ''}">
                    📦 ${stats.total} course${stats.total > 1 ? 's' : ''} aujourd'hui
                </span>
                <span class="dlv-stat-pill">✅ ${stats.done} livrée${stats.done > 1 ? 's' : ''}</span>
            </div>
            <div class="dlv-link">${link}</div>
            <div class="dlv-actions">
                <button class="dlv-action-btn" onclick="copyDlvLink('${link}', this)">📋 Copier le lien</button>
                ${p.phone ? `<button class="dlv-action-btn wa" onclick="openDlvWA('${_esc(p.phone)}','${_esc(p.name)}','${link}')">📲 Envoyer</button>` : ''}
            </div>`;
        grid.appendChild(card);
    });
}


/* ══════════════════════════════════════════════════════════════════
   AJOUT / SUPPRESSION
══════════════════════════════════════════════════════════════════ */
window.addDeliveryPerson = async function() {
    const nameInp  = document.getElementById('dlv-name-inp');
    const phoneInp = document.getElementById('dlv-phone-inp');
    const name     = nameInp?.value.trim();
    const phone    = phoneInp?.value.trim().replace(/[^0-9+]/g,'') || null;

    if (!name) { nameInp?.focus(); if (typeof toast === 'function') toast('Nom requis.', 'warning'); return; }

    try {
        const { error } = await db.from('delivery_persons').insert({
            restaurant_id: currentRestaurant.id,
            name, phone, is_active: true,
        });
        if (error) throw error;
        if (nameInp)  nameInp.value  = '';
        if (phoneInp) phoneInp.value = '';
        if (typeof toast === 'function') toast(`"${name}" ajouté !`, 'success');
        loadDeliveryPersons();
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};

window.deleteDeliveryPerson = async function(id, name) {
    if (!confirm(`Désactiver "${name}" ? Ses commandes en cours resteront assignées.`)) return;
    try {
        await db.from('delivery_persons').update({ is_active: false }).eq('id', id);
        if (typeof toast === 'function') toast(`"${name}" désactivé.`, 'info');
        loadDeliveryPersons();
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};


/* ══════════════════════════════════════════════════════════════════
   COPIER LIEN / WHATSAPP
══════════════════════════════════════════════════════════════════ */
window.copyDlvLink = function(link, btn) {
    navigator.clipboard.writeText(link).then(() => {
        const o = btn.textContent; btn.textContent = '✅ Copié !';
        setTimeout(() => btn.textContent = o, 2000);
    });
};

window.openDlvWA = function(phone, name, link) {
    const msg = `Bonjour ${name} 👋\n\nVoici votre lien livreur Restos Lomé :\n👉 ${link}\n\nOuvrez ce lien pour voir vos courses et mettre à jour les statuts.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};


/* ══════════════════════════════════════════════════════════════════
   BOUTONS "ASSIGNER" DANS LE PANNEAU COMMANDES
══════════════════════════════════════════════════════════════════ */
let _assignTarget = null; /* order row en cours */
let _dlvObserver  = null;

function _injectAssignButtons() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel) return;

    setTimeout(() => {
        const tbody = document.getElementById('orders-admin-tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.querySelector('.btn-assign-delivery')) return;

            // Colonne 3 : Type (🛵 = livraison)
            const typeCell = row.cells[3];
            const typeIcon = typeCell?.textContent?.trim() || '';
            if (typeIcon !== '🛵') return;

            // Récupérer l'ID complet depuis data-order-id (ajouté dans admin.html)
            const orderId = row.dataset.orderId;
            if (!orderId) return;

            // Colonne 5 : Statut (select)
            const statusSelect = row.cells[5].querySelector('select');
            const status = statusSelect?.value?.toLowerCase() || '';
            if (status === 'livré') return;

            const existing = row.dataset.deliveryPersonId;

            const btn = document.createElement('button');
            btn.className = `btn-assign-delivery${existing ? ' assigned' : ''}`;
            btn.textContent = existing ? '🛵 Assigné' : '🛵 Assigner';
            btn.style.marginLeft = '8px';
            btn.style.padding = '5px 12px';
            btn.style.borderRadius = '6px';
            btn.style.fontSize = '0.72rem';
            btn.style.fontWeight = '600';
            btn.style.cursor = 'pointer';
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                openDlvDropdown(orderId, row); 
            };

            const actionsCell = row.cells[6];
            if (actionsCell) {
                actionsCell.appendChild(btn);
            }
        });
    }, 500);
}

function _startAssignObserver() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel || _dlvObserver) return;
    _dlvObserver = new MutationObserver(() => _injectAssignButtons());
    _dlvObserver.observe(panel, { childList: true, subtree: true });
}


/* ══════════════════════════════════════════════════════════════════
   DROPDOWN D'ASSIGNATION
══════════════════════════════════════════════════════════════════ */
window.openDlvDropdown = async function(orderId, row) {
    _assignTarget = { orderId, row };

    /* Recharger les livreurs si besoin */
    if (!_deliveryPersons.length) await loadDeliveryPersons();

    const list = document.getElementById('dlv-dropdown-list');
    if (!list) return;

    if (!_deliveryPersons.length) {
        list.innerHTML = '<p style="font-size:.82rem;color:rgba(255,255,255,.4);text-align:center;padding:12px;">Aucun livreur disponible.<br>Ajoutez des livreurs dans le panneau Livreurs.</p>';
    } else {
        list.innerHTML = _deliveryPersons.map(p => {
            const initials = p.name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
            return `<div class="dlv-person-option" onclick="assignOrder('${orderId}','${p.id}','${_esc(p.name)}','${p.phone || ''}')">
                <div class="dlv-av-sm">${initials}</div>
                <div>
                    <div class="dlv-opt-name">${_esc(p.name)}</div>
                    <div class="dlv-opt-courses">📞 ${p.phone || '—'}</div>
                </div>
            </div>`;
        }).join('');
    }

    document.getElementById('dlv-dropdown-overlay')?.classList.add('show');
};

window.closeDlvDropdown = function() {
    document.getElementById('dlv-dropdown-overlay')?.classList.remove('show');
    _assignTarget = null;
};

window.assignOrder = async function(orderId, personId, personName, personPhone) {
    closeDlvDropdown();

    try {
        /* Mettre à jour la commande */
        const { error } = await db
            .from('orders')
            .update({ delivery_person_id: personId, status: 'préparé' })
            .eq('id', orderId);
        if (error) throw error;

        /* Mettre à jour le bouton dans la liste */
        if (_assignTarget?.row) {
            const btn = _assignTarget.row.querySelector('.btn-assign-delivery');
            if (btn) { btn.textContent = `🛵 ${personName}`; btn.classList.add('assigned'); }
            _assignTarget.row.dataset.deliveryPersonId = personId;
        }

        /* Notifier le livreur par WhatsApp */
        if (personPhone) {
            const link = `${location.origin}/livreur.html?id=${personId}`;
            const msg  = `🛵 *Nouvelle course !*\n\nBonjour ${personName}, vous avez une nouvelle commande assignée.\n👉 ${link}`;
            window.open(`https://wa.me/${personPhone.replace(/[^0-9+]/g,'')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
        }

        if (typeof toast === 'function') toast(`Commande assignée à ${personName} !`, 'success');

    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};


/* ══════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════ */
window.addEventListener('admin:ready', () => {
    setTimeout(() => { _injectAssignButtons(); _startAssignObserver(); }, 800);
});

/* Fermer le dropdown sur clic dehors */
document.addEventListener('click', (e) => {
    const overlay = document.getElementById('dlv-dropdown-overlay');
    if (overlay?.classList.contains('show') && e.target === overlay) closeDlvDropdown();
});

function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log('✅ admin-delivery-patch.js chargé — gestion livreurs + assignation commandes');

// ────────────────────────────────────────────────────────────────
// SECTION 2 — Gestion des PIN livreurs (admin-delivery-pin-patch.js)
// ────────────────────────────────────────────────────────────────

/**
 * admin-delivery-pin-patch.js — Gestion PIN livreurs
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPLÈTE admin-delivery-patch.js :
 *  • Bouton "🔒 PIN" sur chaque carte livreur
 *  • Modal pour définir/modifier/supprimer le PIN
 *  • Hash côté client (identique à livreur.html)
 *  • Bouton "📲 Envoyer PIN" → WhatsApp avec le PIN en clair
 *
 * INTÉGRATION dans admin.html — APRÈS admin-delivery-patch.js :
 *   <script src="admin-delivery-pin-patch.js"></script>
 *
 * PRÉREQUIS :
 *   • Migration SQL exécutée (colonne pin_hash sur delivery_persons)
 *   • admin-delivery-patch.js déjà chargé
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    if (document.getElementById('pin-patch-styles')) return;
    const s = document.createElement('style');
    s.id = 'pin-patch-styles';
    s.textContent = `

/* ── Bouton PIN sur la carte livreur ── */
.dlv-pin-btn {
    flex: 1; padding: 6px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,.1); background: transparent;
    color: rgba(255,255,255,.45); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
}
.dlv-pin-btn:hover {
    border-color: rgba(197,160,89,.3);
    color: var(--gold, #c5a059);
    background: rgba(197,160,89,.06);
}
.dlv-pin-btn.has-pin {
    border-color: rgba(46,204,113,.25);
    color: #2ecc71;
    background: rgba(46,204,113,.06);
}

/* ── Modal PIN ── */
#pin-modal-overlay {
    position: fixed; inset: 0; z-index: 9800;
    background: rgba(0,0,0,.75); backdrop-filter: blur(8px);
    display: none; align-items: center; justify-content: center; padding: 20px;
}
#pin-modal-overlay.show { display: flex; }

.pin-modal-box {
    background: var(--surface, #141414);
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 18px; padding: 26px 24px;
    width: 100%; max-width: 360px;
    animation: pinBoxIn .25s ease;
}
@keyframes pinBoxIn {
    from { opacity:0; transform: scale(.95) translateY(8px); }
    to   { opacity:1; transform: scale(1)  translateY(0);    }
}

.pin-modal-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
}
.pin-modal-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(197,160,89,.3), rgba(197,160,89,.1));
    color: var(--gold, #c5a059); font-weight: 700; font-size: .95rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.pin-modal-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; }
.pin-modal-sub   { font-size: .75rem; color: rgba(255,255,255,.4); margin-top: 3px; }

.pin-modal-label {
    font-size: .75rem; font-weight: 600; color: rgba(255,255,255,.5);
    text-transform: uppercase; letter-spacing: .07em;
    margin-bottom: 8px; display: block;
}

.pin-modal-input {
    width: 100%; background: rgba(255,255,255,.06);
    border: 1.5px solid rgba(255,255,255,.12); color: #f0ece4;
    padding: 13px; border-radius: 10px;
    font-size: 1.6rem; text-align: center; letter-spacing: .4em;
    font-family: 'IBM Plex Mono', monospace;
    outline: none; transition: border-color .2s; margin-bottom: 6px;
}
.pin-modal-input:focus { border-color: var(--gold, #c5a059); }

.pin-modal-hint {
    font-size: .72rem; color: rgba(255,255,255,.3);
    margin-bottom: 16px; line-height: 1.5;
}

.pin-modal-actions {
    display: flex; gap: 8px; flex-direction: column;
}
.pin-modal-btn {
    width: 100%; padding: 12px; border-radius: 10px;
    font-size: .88rem; font-weight: 700; cursor: pointer;
    font-family: inherit; border: none; transition: opacity .15s;
}
.pin-modal-btn:hover { opacity: .88; }
.pin-modal-btn.primary { background: var(--gold, #c5a059); color: #000; }
.pin-modal-btn.wa      { background: rgba(37,211,102,.12); border: 1px solid rgba(37,211,102,.25); color: #25d366; }
.pin-modal-btn.danger  { background: rgba(231,76,60,.1); border: 1px solid rgba(231,76,60,.2); color: #e74c3c; }
.pin-modal-btn.ghost   { background: transparent; border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.4); }

.pin-modal-err {
    font-size: .78rem; color: #e74c3c;
    min-height: 18px; margin-bottom: 8px; text-align: center;
}

.pin-current-status {
    background: rgba(46,204,113,.08); border: 1px solid rgba(46,204,113,.2);
    border-radius: 8px; padding: 8px 12px; margin-bottom: 14px;
    font-size: .78rem; color: #2ecc71; text-align: center;
}
.pin-no-status {
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px; padding: 8px 12px; margin-bottom: 14px;
    font-size: .78rem; color: rgba(255,255,255,.35); text-align: center;
}
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION DU MODAL
══════════════════════════════════════════════════════════════════ */
(function injectModal() {
    if (document.getElementById('pin-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="pin-modal-overlay">
        <div class="pin-modal-box">
            <div class="pin-modal-header">
                <div class="pin-modal-avatar" id="pin-modal-avatar">?</div>
                <div>
                    <div class="pin-modal-title" id="pin-modal-title">Code PIN</div>
                    <div class="pin-modal-sub"   id="pin-modal-sub">Livreur</div>
                </div>
            </div>

            <!-- Statut PIN actuel -->
            <div id="pin-current-status-wrap"></div>

            <!-- Saisie nouveau PIN -->
            <label class="pin-modal-label" for="pin-modal-input">Nouveau code PIN (4 chiffres)</label>
            <input  class="pin-modal-input" id="pin-modal-input"
                    type="tel" maxlength="4" placeholder="••••" autocomplete="off"
                    oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            <div class="pin-modal-hint">
                Le livreur devra saisir ce code à chaque ouverture de l'application.<br>
                Laissez vide et cliquez "Supprimer" pour désactiver le PIN.
            </div>

            <div class="pin-modal-err" id="pin-modal-err"></div>

            <div class="pin-modal-actions">
                <button class="pin-modal-btn primary" id="pin-save-btn">🔒 Enregistrer le PIN</button>
                <button class="pin-modal-btn wa"      id="pin-wa-btn"  style="display:none;">📲 Envoyer par WhatsApp</button>
                <button class="pin-modal-btn danger"  id="pin-del-btn" style="display:none;">🗑️ Supprimer le PIN</button>
                <button class="pin-modal-btn ghost"   onclick="closePinModal()">Annuler</button>
            </div>
        </div>
    </div>`);

    /* Fermer sur clic overlay */
    document.getElementById('pin-modal-overlay').addEventListener('click', e => {
        if (e.target.id === 'pin-modal-overlay') closePinModal();
    });

    /* Boutons */
    document.getElementById('pin-save-btn').addEventListener('click', _savePIN);
    document.getElementById('pin-del-btn').addEventListener('click', _deletePIN);
    document.getElementById('pin-wa-btn').addEventListener('click', _sendPINviaWA);

    /* Fermer avec Échap */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePinModal();
    });
})();


/* ══════════════════════════════════════════════════════════════════
   ÉTAT DU MODAL
══════════════════════════════════════════════════════════════════ */
let _pinTarget = null; /* { id, name, phone, pin_hash } */
let _pendingPin = null; /* PIN en clair après save, pour WhatsApp */


/* ══════════════════════════════════════════════════════════════════
   HASH — IDENTIQUE À livreur.html
══════════════════════════════════════════════════════════════════ */
function _simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}


/* ══════════════════════════════════════════════════════════════════
   OUVERTURE DU MODAL
══════════════════════════════════════════════════════════════════ */
window.openPinModal = async function(personId) {
    /* Recharger les données fraîches du livreur depuis Supabase */
    let person = null;
    try {
        const { data, error } = await window.db
            .from('delivery_persons')
            .select('id, name, phone, pin_hash')
            .eq('id', personId)
            .single();
        if (error) throw error;
        person = data;
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur chargement livreur : ' + e.message, 'error');
        return;
    }

    _pinTarget  = person;
    _pendingPin = null;

    /* Remplir le header */
    const initials = person.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('pin-modal-avatar').textContent = initials;
    document.getElementById('pin-modal-title').textContent  = person.name;
    document.getElementById('pin-modal-sub').textContent    = person.phone || 'Livreur';

    /* Statut PIN actuel */
    const wrap = document.getElementById('pin-current-status-wrap');
    if (person.pin_hash) {
        wrap.innerHTML = '<div class="pin-current-status">🔒 PIN actif — le livreur doit saisir son code au démarrage</div>';
        document.getElementById('pin-del-btn').style.display = 'block';
    } else {
        wrap.innerHTML = '<div class="pin-no-status">🔓 Aucun PIN — accès libre au lien livreur</div>';
        document.getElementById('pin-del-btn').style.display = 'none';
    }

    /* Reset */
    document.getElementById('pin-modal-input').value = '';
    document.getElementById('pin-modal-err').textContent  = '';
    document.getElementById('pin-wa-btn').style.display   = 'none';

    document.getElementById('pin-modal-overlay').classList.add('show');
    setTimeout(() => document.getElementById('pin-modal-input').focus(), 200);
};

window.closePinModal = function() {
    document.getElementById('pin-modal-overlay')?.classList.remove('show');
    _pinTarget  = null;
    _pendingPin = null;
};


/* ══════════════════════════════════════════════════════════════════
   ENREGISTRER LE PIN
══════════════════════════════════════════════════════════════════ */
async function _savePIN() {
    const errEl = document.getElementById('pin-modal-err');
    errEl.textContent = '';

    const raw = document.getElementById('pin-modal-input').value.trim();
    if (!raw) { errEl.textContent = 'Saisissez un code à 4 chiffres.'; return; }
    if (!/^\d{4}$/.test(raw)) { errEl.textContent = 'Le PIN doit être exactement 4 chiffres.'; return; }
    if (!_pinTarget) return;

    const hash = _simpleHash(raw);

    const btn = document.getElementById('pin-save-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement…';

    try {
        const { error } = await window.db
            .from('delivery_persons')
            .update({ pin_hash: hash })
            .eq('id', _pinTarget.id);
        if (error) throw error;

        /* Mettre à jour l'état local */
        _pinTarget.pin_hash = hash;
        _pendingPin = raw;

        /* Afficher le bouton WhatsApp si numéro disponible */
        if (_pinTarget.phone) {
            document.getElementById('pin-wa-btn').style.display = 'block';
        }
        document.getElementById('pin-del-btn').style.display = 'block';

        /* Mettre à jour le statut dans le modal */
        document.getElementById('pin-current-status-wrap').innerHTML =
            '<div class="pin-current-status">✅ PIN enregistré — envoyez-le au livreur par WhatsApp</div>';

        document.getElementById('pin-modal-input').value = '';

        /* Mettre à jour le bouton PIN sur la carte */
        _refreshCardPinBtn(_pinTarget.id, true);

        if (typeof toast === 'function') toast(`PIN de ${_pinTarget.name} enregistré !`, 'success');

    } catch (e) {
        errEl.textContent = 'Erreur : ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔒 Enregistrer le PIN';
    }
}


/* ══════════════════════════════════════════════════════════════════
   SUPPRIMER LE PIN
══════════════════════════════════════════════════════════════════ */
async function _deletePIN() {
    if (!_pinTarget) return;
    if (!confirm(`Supprimer le PIN de ${_pinTarget.name} ? Le lien livreur sera accessible sans code.`)) return;

    try {
        const { error } = await window.db
            .from('delivery_persons')
            .update({ pin_hash: null })
            .eq('id', _pinTarget.id);
        if (error) throw error;

        _pinTarget.pin_hash = null;
        _pendingPin = null;

        document.getElementById('pin-current-status-wrap').innerHTML =
            '<div class="pin-no-status">🔓 PIN supprimé — accès libre</div>';
        document.getElementById('pin-del-btn').style.display = 'none';
        document.getElementById('pin-wa-btn').style.display  = 'none';

        _refreshCardPinBtn(_pinTarget.id, false);

        if (typeof toast === 'function') toast(`PIN de ${_pinTarget.name} supprimé.`, 'info');

    } catch (e) {
        document.getElementById('pin-modal-err').textContent = 'Erreur : ' + e.message;
    }
}


/* ══════════════════════════════════════════════════════════════════
   ENVOYER LE PIN PAR WHATSAPP
══════════════════════════════════════════════════════════════════ */
function _sendPINviaWA() {
    if (!_pinTarget?.phone || !_pendingPin) return;
    const phone = _pinTarget.phone.replace(/[^0-9+]/g, '');
    const link  = `${location.origin}/livreur.html?id=${_pinTarget.id}`;
    const msg   =
        `🔒 *Code PIN Restos Lomé*\n\n` +
        `Bonjour ${_pinTarget.name} 👋\n\n` +
        `Votre nouveau code PIN pour accéder à vos courses :\n\n` +
        `*${_pendingPin}*\n\n` +
        `Gardez ce code confidentiel.\n` +
        `👉 Votre lien : ${link}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}


/* ══════════════════════════════════════════════════════════════════
   MISE À JOUR DU BOUTON PIN SUR LA CARTE
   Sans rechargement complet de la grille
══════════════════════════════════════════════════════════════════ */
function _refreshCardPinBtn(personId, hasPin) {
    const btn = document.querySelector(`.dlv-pin-btn[data-person-id="${personId}"]`);
    if (!btn) return;
    if (hasPin) {
        btn.textContent = '🔒 PIN actif';
        btn.classList.add('has-pin');
    } else {
        btn.textContent = '🔓 Définir PIN';
        btn.classList.remove('has-pin');
    }
}


/* ══════════════════════════════════════════════════════════════════
   HOOK _renderDeliveryPersons
   On surcharge la fonction après son exécution pour injecter
   le bouton PIN dans chaque carte sans modifier admin-delivery-patch.js
══════════════════════════════════════════════════════════════════ */
let _pinHookAttempts = 0;
const _pinHookPoller = setInterval(() => {
    _pinHookAttempts++;
    if (_pinHookAttempts > 40) { clearInterval(_pinHookPoller); return; }

    /* Attendre que loadDeliveryPersons soit défini */
    if (typeof window.loadDeliveryPersons !== 'function') return;
    if (window.loadDeliveryPersons.__pinPatched) { clearInterval(_pinHookPoller); return; }

    const _origLoad = window.loadDeliveryPersons;
    window.loadDeliveryPersons = async function() {
        await _origLoad();
        /* Après le rendu des cartes, injecter les boutons PIN */
        _injectPinButtons();
    };
    window.loadDeliveryPersons.__pinPatched = true;
    clearInterval(_pinHookPoller);

}, 250);


/* ══════════════════════════════════════════════════════════════════
   INJECTION DES BOUTONS PIN DANS LES CARTES EXISTANTES
══════════════════════════════════════════════════════════════════ */
async function _injectPinButtons() {
    const grid = document.getElementById('dlv-grid');
    if (!grid) return;

    /* Récupérer les pin_hash actuels */
    const ids = (_deliveryPersons || []).map(p => p.id);
    if (!ids.length) return;

    let pinMap = {}; /* { personId: pin_hash|null } */
    try {
        const { data } = await window.db
            .from('delivery_persons')
            .select('id, pin_hash')
            .in('id', ids);
        (data || []).forEach(p => { pinMap[p.id] = p.pin_hash; });
    } catch (_) {}

    /* Injecter dans chaque carte */
    const cards = grid.querySelectorAll('.dlv-card');
    cards.forEach(card => {
        /* Retrouver l'ID depuis le bouton supprimer déjà présent */
        const delBtn = card.querySelector('.dlv-del-btn');
        if (!delBtn) return;

        /* Extraire l'ID depuis onclick="deleteDeliveryPerson('UUID',...)" */
        const match = delBtn.getAttribute('onclick')?.match(/deleteDeliveryPerson\('([^']+)'/);
        if (!match) return;
        const personId = match[1];

        /* Ne pas injecter deux fois */
        if (card.querySelector('.dlv-pin-btn')) return;

        const hasPin = !!pinMap[personId];
        const pinBtn = document.createElement('button');
        pinBtn.className = `dlv-action-btn dlv-pin-btn${hasPin ? ' has-pin' : ''}`;
        pinBtn.dataset.personId = personId;
        pinBtn.textContent = hasPin ? '🔒 PIN actif' : '🔓 Définir PIN';
        pinBtn.addEventListener('click', () => openPinModal(personId));

        /* Ajouter dans .dlv-actions */
        const actions = card.querySelector('.dlv-actions');
        if (actions) actions.appendChild(pinBtn);
    });
}


console.log('✅ admin-delivery-pin-patch.js chargé — Gestion PIN livreurs');

// ────────────────────────────────────────────────────────────────
// SECTION 3 — Chat livraison (admin-delivery-chat-patch.js)
// ────────────────────────────────────────────────────────────────

/**
 * admin-delivery-chat-patch.js — Chat Staff ↔ Livreur dans l'admin
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPLÈTE le système de chat livraison :
 *  • Bouton "💬" sur chaque commande avec livreur assigné
 *  • Badge rouge avec le nombre de messages non lus
 *  • Tiroir de chat (drawer) latéral avec l'historique complet
 *  • Envoi de messages avec sender_role = 'staff'
 *  • Supabase Realtime — messages apparaissent instantanément
 *  • Notification toast + vibration sur nouveau message livreur
 *  • Persistance des messages lus via localStorage
 *
 * INTÉGRATION dans admin.html — avant </body> :
 *   <script src="admin-delivery-chat-patch.js"></script>
 *
 * PRÉREQUIS :
 *   • Table delivery_chats créée (SQL du module logistique)
 *   • admin-delivery-patch.js chargé (pour les boutons d'assignation)
 *   • CSP admin.html doit contenir wss://*.supabase.co dans connect-src
 *   • window.db = supabase.createClient(...) exposé globalement dans admin.html
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   CORRECTIF A — AudioContext et son listener HORS de _init()
   pour éviter l'accumulation de listeners en cas d'appels multiples
══════════════════════════════════════════════════════════════════ */
let _audioCtx = null;
document.addEventListener('click', () => {
    if (!_audioCtx) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) {}
    }
}, { once: false });


/* ══════════════════════════════════════════════════════════════════
   GUARD — BUG 1 : window.db doit exister avant d'initialiser
   Polling toutes les 500 ms, abandon après 30 s
══════════════════════════════════════════════════════════════════ */
(function waitForDB() {
    let attempts = 0;
    const t = setInterval(() => {
        attempts++;
        if (attempts > 60) {
            clearInterval(t);
            console.error('admin-delivery-chat-patch: window.db non disponible après 30 s — vérifiez que supabaseClient est exposé en window.db dans admin.html');
            return;
        }
        if (window.db) {
            clearInterval(t);
            _init();
        }
    }, 500);
})();


/* ══════════════════════════════════════════════════════════════════
   FONCTION PRINCIPALE
   Tout le code applicatif est à l'intérieur pour s'assurer que
   window.db existe. Les variables d'état sont locales à _init()
   sauf _audioCtx (ci-dessus) et les fonctions exposées sur window.
══════════════════════════════════════════════════════════════════ */
function _init() {

/* ── Styles ── */
(function injectCSS() {
    if (document.getElementById('scd-styles')) return;
    const s = document.createElement('style');
    s.id = 'scd-styles';
    s.textContent = `

/* ── Bouton chat sur la ligne de commande ── */
.btn-order-chat {
    position: relative;
    background: rgba(197,160,89,.08);
    border: 1px solid rgba(197,160,89,.2);
    color: var(--gold, #c5a059);
    padding: 5px 10px; border-radius: 6px;
    font-size: .72rem; font-weight: 600;
    cursor: pointer; white-space: nowrap;
    flex-shrink: 0; font-family: inherit;
    transition: all .15s;
}
.btn-order-chat:hover { background: rgba(197,160,89,.16); }

.chat-unread-badge {
    position: absolute; top: -6px; right: -6px;
    background: var(--danger, #e74c3c); color: #fff;
    width: 16px; height: 16px; border-radius: 50%;
    font-size: .6rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--surface, #141414);
    animation: badgePop .3s ease;
    pointer-events: none;
}
@keyframes badgePop {
    0%   { transform: scale(0); }
    60%  { transform: scale(1.3); }
    100% { transform: scale(1); }
}

/* ── Drawer chat ── */
#staff-chat-overlay {
    position: fixed; inset: 0; z-index: 9500;
    background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
    display: none; justify-content: flex-end;
    animation: overlayIn .2s ease;
}
#staff-chat-overlay.show { display: flex; }
@keyframes overlayIn { from{opacity:0} to{opacity:1} }

.staff-chat-drawer {
    width: 100%; max-width: 400px; height: 100%;
    background: var(--surface, #141414);
    border-left: .5px solid rgba(255,255,255,.1);
    display: flex; flex-direction: column;
    animation: drawerIn .25s ease;
    box-shadow: -8px 0 40px rgba(0,0,0,.5);
}
@keyframes drawerIn {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
}

/* ── Header du drawer ── */
.scd-head {
    padding: 16px 18px 14px;
    border-bottom: .5px solid rgba(255,255,255,.08);
    display: flex; align-items: flex-start; gap: 12px;
    flex-shrink: 0;
}
.scd-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(197,160,89,.3), rgba(197,160,89,.1));
    color: var(--gold, #c5a059); font-weight: 700; font-size: .9rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.scd-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; }
.scd-sub   { font-size: .72rem; color: rgba(255,255,255,.4); margin-top: 3px; }
.scd-close {
    margin-left: auto; background: none; border: none;
    color: rgba(255,255,255,.3); font-size: 1.1rem;
    cursor: pointer; padding: 4px 8px; border-radius: 6px;
    transition: all .15s; flex-shrink: 0;
}
.scd-close:hover { color: rgba(255,255,255,.7); background: rgba(255,255,255,.06); }

/* ── Infos commande dans le header ── */
.scd-order-info {
    display: flex; gap: 6px; flex-wrap: wrap;
    padding: 10px 18px; border-bottom: .5px solid rgba(255,255,255,.06);
    flex-shrink: 0; background: rgba(255,255,255,.02);
}
.scd-info-pill {
    background: rgba(255,255,255,.05); border: .5px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 3px 10px;
    font-size: .68rem; color: rgba(255,255,255,.45);
}
.scd-info-pill strong { color: rgba(255,255,255,.7); }

/* ── Zone messages ── */
.scd-messages {
    flex: 1; overflow-y: auto; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
}
.scd-messages::-webkit-scrollbar { width: 3px; }
.scd-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }

.scd-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    color: rgba(255,255,255,.25); font-size: .85rem; text-align: center;
}
.scd-empty-icon { font-size: 2rem; }

/* ── Bulles de messages ── */
.scd-msg {
    max-width: 82%; padding: 8px 12px; border-radius: 10px;
    font-size: .82rem; line-height: 1.5;
}
.scd-msg.staff {
    background: rgba(197,160,89,.12); border: 1px solid rgba(197,160,89,.25);
    color: #f0ece4; align-self: flex-end; border-radius: 10px 10px 2px 10px;
}
.scd-msg.livreur {
    background: rgba(255,255,255,.06); border: .5px solid rgba(255,255,255,.1);
    color: #f0ece4; align-self: flex-start; border-radius: 10px 10px 10px 2px;
}
.scd-msg-meta {
    font-size: .62rem; color: rgba(255,255,255,.3); margin-top: 4px;
    display: flex; align-items: center; gap: 6px;
}
.scd-msg.staff .scd-msg-meta { justify-content: flex-end; }

/* ── Date séparateur ── */
.scd-date-sep {
    text-align: center; font-size: .65rem; color: rgba(255,255,255,.25);
    padding: 4px 0; position: relative;
}
.scd-date-sep::before, .scd-date-sep::after {
    content: ''; position: absolute; top: 50%;
    width: 30%; height: .5px; background: rgba(255,255,255,.08);
}
.scd-date-sep::before { left: 0; }
.scd-date-sep::after  { right: 0; }

/* ── Raccourcis rapides ── */
.scd-shortcuts {
    display: flex; gap: 6px; padding: 8px 16px 4px;
    flex-wrap: wrap; flex-shrink: 0;
    border-top: .5px solid rgba(255,255,255,.05);
}
.scd-shortcut {
    background: rgba(255,255,255,.05); border: .5px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 4px 12px; font-size: .7rem;
    color: rgba(255,255,255,.45); cursor: pointer; font-family: inherit;
    transition: all .15s; white-space: nowrap;
}
.scd-shortcut:hover {
    background: rgba(197,160,89,.1);
    border-color: rgba(197,160,89,.25);
    color: var(--gold, #c5a059);
}

/* ── Input zone ── */
.scd-input-zone {
    padding: 10px 14px 14px; border-top: .5px solid rgba(255,255,255,.08);
    flex-shrink: 0; background: var(--surface, #141414);
}
.scd-inp-row { display: flex; gap: 8px; }
.scd-inp {
    flex: 1; background: rgba(255,255,255,.06);
    border: 1.5px solid rgba(255,255,255,.1); color: #f0ece4;
    padding: 10px 13px; border-radius: 10px;
    font-family: 'DM Sans', inherit; font-size: .88rem;
    outline: none; transition: border-color .2s; resize: none;
    max-height: 100px;
}
.scd-inp:focus { border-color: var(--gold, #c5a059); }
.scd-send {
    background: var(--gold, #c5a059); color: #000;
    border: none; padding: 10px 16px; border-radius: 10px;
    font-weight: 700; font-size: .88rem; cursor: pointer;
    font-family: inherit; transition: opacity .2s;
    display: flex; align-items: center; gap: 5px; align-self: flex-end;
}
.scd-send:hover { opacity: .88; }
.scd-send:disabled { opacity: .4; pointer-events: none; }

/* ── Notification de nouveau message ── */
.scd-notif-banner {
    background: rgba(197,160,89,.12); border: 1px solid rgba(197,160,89,.3);
    border-radius: 10px; padding: 10px 14px;
    display: flex; align-items: center; gap: 10px;
    margin: 6px 16px; font-size: .8rem; cursor: pointer;
    animation: bannerIn .3s ease; flex-shrink: 0;
}
@keyframes bannerIn {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0);    }
}
.scd-notif-banner:hover { background: rgba(197,160,89,.18); }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL (local à _init — une seule exécution garantie)
══════════════════════════════════════════════════════════════════ */
let _currentOrderId     = null;
let _currentDriverName  = null;
let _currentDriverPhone = null;
let _chatChannel        = null;
let _globalChannel      = null;
let _globalListenerStarted = false; /* CORRECTIF B — anti-doublon */
let _unreadCounts       = {};
let _lastReadAt         = {};
let _staffName          = '';
let _readKey            = 'staff_chat_read_default'; /* BUG 3 — préfixé par resto */

/* CORRECTIF A — raccourcis sans apostrophes inline dangereuses (BUG A) */
const SHORTCUTS = [
    'En route \u2705',
    'O\u00f9 \u00eates-vous\u00a0?',
    'Le client attend',
    'Probl\u00e8me\u00a0?',
    'Commande pr\u00eate',
    'Reviens au restaurant',
    'Appelle le client',
];

function _updateReadKey() {
    _readKey = `staff_chat_read_${window.currentRestaurant?.id || 'default'}`;
}


/* ══════════════════════════════════════════════════════════════════
   INJECTION DU DRAWER HTML
   CORRECTIF A — les raccourcis utilisent addEventListener,
   pas onclick inline, pour éviter tout problème d'échappement
══════════════════════════════════════════════════════════════════ */
function _injectDrawer() {
    if (document.getElementById('staff-chat-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'staff-chat-overlay';
    overlay.innerHTML = `
        <div class="staff-chat-drawer">

            <!-- Header -->
            <div class="scd-head">
                <div class="scd-avatar" id="scd-avatar">?</div>
                <div>
                    <div class="scd-title" id="scd-title">Chat livreur</div>
                    <div class="scd-sub"   id="scd-sub">—</div>
                </div>
                <button class="scd-close" id="scd-close-btn">✕</button>
            </div>

            <!-- Infos commande -->
            <div class="scd-order-info" id="scd-order-info"></div>

            <!-- Raccourcis -->
            <div class="scd-shortcuts" id="scd-shortcuts"></div>

            <!-- Messages -->
            <div class="scd-messages" id="scd-messages">
                <div class="scd-empty">
                    <div class="scd-empty-icon">💬</div>
                    Chargement…
                </div>
            </div>

            <!-- Zone de saisie -->
            <div class="scd-input-zone">
                <div class="scd-inp-row">
                    <textarea class="scd-inp" id="scd-inp" rows="1"
                        placeholder="Message au livreur…" maxlength="500"></textarea>
                    <button class="scd-send" id="scd-send">↑ Envoyer</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    /* CORRECTIF A — raccourcis via addEventListener, jamais via onclick inline */
    const shortcutsEl = document.getElementById('scd-shortcuts');
    SHORTCUTS.forEach(text => {
        const btn = document.createElement('button');
        btn.className   = 'scd-shortcut';
        btn.textContent = text;
        btn.addEventListener('click', () => staffChatShortcut(text));
        shortcutsEl.appendChild(btn);
    });

    /* Auto-resize textarea */
    const inp = document.getElementById('scd-inp');
    inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            staffChatSend();
        }
    });

    /* Bouton envoyer */
    document.getElementById('scd-send').addEventListener('click', staffChatSend);

    /* Bouton fermer */
    document.getElementById('scd-close-btn').addEventListener('click', staffChatClose);

    /* Fermer sur clic overlay (hors drawer) */
    overlay.addEventListener('click', e => {
        if (e.target === overlay) staffChatClose();
    });
}


/* ══════════════════════════════════════════════════════════════════
   INJECTION DES BOUTONS CHAT SUR LES COMMANDES
   BUG 6 — sélecteur précis sur [data-order-id] uniquement
══════════════════════════════════════════════════════════════════ */
function _injectChatButtons() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel) return;

    /* BUG 6 — sélecteur ciblé, pas de .order-row générique */
    const rows = panel.querySelectorAll('[data-order-id]');
    rows.forEach(row => {
        if (row.querySelector('.btn-order-chat')) return;

        const orderId       = row.dataset.orderId;
        const driverAssigned = row.dataset.deliveryPersonId
            || row.querySelector('[data-driver-id]')?.dataset.driverId;
        if (!orderId || !driverAssigned) return;

        const driverName   = row.querySelector('.driver-name, [data-driver-name]')?.textContent?.trim() || 'Livreur';
        const driverPhone  = row.querySelector('[data-driver-phone]')?.dataset.driverPhone || '';
        const customerName = row.querySelector('.customer-name, [data-customer]')?.textContent?.trim() || 'Client';
        const amount       = row.querySelector('.order-amount, [data-amount]')?.textContent?.trim() || '';

        const btn = document.createElement('button');
        btn.className = 'btn-order-chat';
        btn.dataset.orderId     = orderId;
        btn.dataset.driverName  = driverName;
        btn.dataset.driverPhone = driverPhone;
        btn.dataset.customer    = customerName;
        btn.dataset.amount      = amount;
        btn.textContent = '💬 Chat';

        /* Badge non-lus existants */
        const count = _unreadCounts[orderId] || 0;
        if (count > 0) _setBadgeOnBtn(btn, count);

        btn.addEventListener('click', e => {
            e.stopPropagation();
            staffChatOpen(orderId, driverName, driverPhone, customerName, amount);
        });

        const actions = row.querySelector('.order-actions, .row-actions, td:last-child, .actions');
        (actions || row).appendChild(btn);
    });
}

/* Helper — badge sur un bouton donné */
function _setBadgeOnBtn(btn, count) {
    let badge = btn.querySelector('.chat-unread-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-unread-badge';
            btn.appendChild(badge);
        }
        badge.textContent = count > 9 ? '9+' : count;
    } else {
        badge?.remove();
    }
}


/* ══════════════════════════════════════════════════════════════════
   OUVERTURE DU CHAT
══════════════════════════════════════════════════════════════════ */
window.staffChatOpen = async function(orderId, driverName, driverPhone, customerName, amount) {
    _currentOrderId     = orderId;
    _currentDriverName  = driverName || 'Livreur';
    _currentDriverPhone = driverPhone || '';

    /* Header */
    const initials = _currentDriverName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('scd-avatar').textContent = initials || '🛵';
    document.getElementById('scd-title').textContent  = _currentDriverName;
    document.getElementById('scd-sub').textContent    = driverPhone || 'Chat en direct';

    /* Infos commande */
    const infoEl = document.getElementById('scd-order-info');
    infoEl.innerHTML = [
        customerName && `<span class="scd-info-pill">👤 <strong>${_esc(customerName)}</strong></span>`,
        amount       && `<span class="scd-info-pill">💰 <strong>${_esc(amount)}</strong></span>`,
        `<span class="scd-info-pill">🆔 <strong>#${orderId.substring(0, 8).toUpperCase()}</strong></span>`,
    ].filter(Boolean).join('');

    /* Ouvrir le drawer */
    document.getElementById('staff-chat-overlay').classList.add('show');
    document.getElementById('scd-inp').focus();

    /* Marquer comme lu + vider badge */
    _lastReadAt[orderId] = new Date().toISOString();
    _saveReadAt();
    _updateBadge(orderId, 0);
    delete _unreadCounts[orderId];

    /* Charger les messages */
    await _loadMessages(orderId);

    /* Realtime pour cette commande — unsub précédent d'abord */
    if (_chatChannel) {
        window.db.removeChannel(_chatChannel);
        _chatChannel = null;
    }
    _chatChannel = window.db
        .channel(`staff-chat-${orderId}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public',
            table: 'delivery_chats',
            filter: `order_id=eq.${orderId}`,
        }, payload => {
            _appendMessage(payload.new);
            _lastReadAt[orderId] = new Date().toISOString();
            _saveReadAt();
        })
        .subscribe();
};


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DES MESSAGES
══════════════════════════════════════════════════════════════════ */
async function _loadMessages(orderId) {
    const el = document.getElementById('scd-messages');
    el.innerHTML = '<div class="scd-empty"><div class="scd-empty-icon">⏳</div>Chargement…</div>';

    try {
        const { data, error } = await window.db
            .from('delivery_chats')
            .select('id, sender_role, sender_name, message, created_at')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
            .limit(80);

        if (error) throw error;

        el.innerHTML = '';

        if (!data?.length) {
            el.innerHTML = `<div class="scd-empty">
                <div class="scd-empty-icon">💬</div>
                Aucun message. Démarrez la conversation avec le livreur !
            </div>`;
            return;
        }

        let lastDate = null;
        data.forEach(msg => {
            const msgDate = new Date(msg.created_at).toLocaleDateString('fr-FR', {
                weekday: 'short', day: 'numeric', month: 'short',
            });
            if (msgDate !== lastDate) {
                const sep = document.createElement('div');
                sep.className   = 'scd-date-sep';
                sep.textContent = msgDate;
                el.appendChild(sep);
                lastDate = msgDate;
            }
            el.appendChild(_buildMsgEl(msg));
        });

        el.scrollTop = el.scrollHeight;

    } catch (e) {
        el.innerHTML = `<div class="scd-empty" style="color:var(--danger,#e74c3c);">
            <div class="scd-empty-icon">❌</div>Erreur : ${_esc(e.message)}
        </div>`;
    }
}

function _appendMessage(msg) {
    const el = document.getElementById('scd-messages');
    if (!el) return;
    el.querySelector('.scd-empty')?.remove();
    el.appendChild(_buildMsgEl(msg));
    el.scrollTop = el.scrollHeight;
}

function _buildMsgEl(msg) {
    const isStaff = msg.sender_role === 'staff';
    const time    = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const div     = document.createElement('div');
    div.className = `scd-msg ${isStaff ? 'staff' : 'livreur'}`;
    div.innerHTML = `
        <div>${_esc(msg.message)}</div>
        <div class="scd-msg-meta">
            <span>${_esc(msg.sender_name || (isStaff ? 'Staff' : 'Livreur'))}</span>
            <span>${time}</span>
        </div>`;
    return div;
}


/* ══════════════════════════════════════════════════════════════════
   ENVOI DE MESSAGE
══════════════════════════════════════════════════════════════════ */
window.staffChatSend = async function() {
    const inp = document.getElementById('scd-inp');
    const btn = document.getElementById('scd-send');
    const msg = inp.value.trim();
    if (!msg || !_currentOrderId) return;

    const backup = inp.value;
    inp.value = '';
    inp.style.height = 'auto';
    btn.disabled = true;

    try {
        await window.db.from('delivery_chats').insert({
            order_id:    _currentOrderId,
            sender_role: 'staff',
            sender_name: _staffName || window.currentRestaurant?.name || 'Gérant',
            message:     msg,
        });
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur envoi : ' + e.message, 'error');
        inp.value = backup; /* Restituer en cas d'échec */
    } finally {
        btn.disabled = false;
        inp.focus();
    }
};

window.staffChatShortcut = function(text) {
    const inp = document.getElementById('scd-inp');
    if (!inp) return;
    inp.value = text;
    inp.focus();
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
};


/* ══════════════════════════════════════════════════════════════════
   FERMETURE
══════════════════════════════════════════════════════════════════ */
window.staffChatClose = function() {
    document.getElementById('staff-chat-overlay')?.classList.remove('show');
    if (_chatChannel) {
        window.db.removeChannel(_chatChannel);
        _chatChannel = null;
    }
    _currentOrderId = null;
};


/* ══════════════════════════════════════════════════════════════════
   BADGES NON-LUS — écoute globale
   BUG 5  — filtre sender_role côté serveur
   BUG 4  — filtre par order_ids du restaurant (via _adminOrderIds)
   CORRECTIF B — flag _globalListenerStarted contre double abonnement
══════════════════════════════════════════════════════════════════ */
function _startGlobalListener() {
    if (_globalListenerStarted || !window.db) return;
    _globalListenerStarted = true; /* CORRECTIF B */

    _loadUnreadCounts();

    /* BUG 5 — filtre Supabase côté serveur, pas seulement côté client */
    _globalChannel = window.db
        .channel('staff-global-chat')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'delivery_chats',
            filter: 'sender_role=eq.livreur', /* messages livreurs uniquement */
        }, payload => {
            const msg = payload.new;

            /* Drawer ouvert sur cette commande → déjà visible, pas de badge */
            if (msg.order_id === _currentOrderId) return;

            /* BUG 4 — ignorer les commandes d'autres restaurants */
            const knownIds = window._adminOrderIds || [];
            if (knownIds.length && !knownIds.includes(msg.order_id)) return;

            _unreadCounts[msg.order_id] = (_unreadCounts[msg.order_id] || 0) + 1;
            _updateBadge(msg.order_id, _unreadCounts[msg.order_id]);

            if (typeof toast === 'function') {
                toast(`💬 ${_esc(msg.sender_name || 'Livreur')} : ${msg.message.substring(0, 50)}`, 'info', 5000);
            }

            if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);

            _playNotifSound();
        })
        .subscribe();
}

/* BUG 4 — charger les order_ids du restaurant depuis Supabase
   si admin.html ne les expose pas déjà via window._adminOrderIds */
async function _bootstrapAdminOrderIds() {
    if (window._adminOrderIds?.length) return; /* Déjà peuplé par admin.html */
    if (!window.currentRestaurant?.id) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await window.db
            .from('orders')
            .select('id')
            .eq('restaurant_id', window.currentRestaurant.id)
            .gte('created_at', today);
        window._adminOrderIds = (data || []).map(o => o.id);
    } catch (_) {}
}

async function _loadUnreadCounts() {
    try {
        /* S'assurer que les IDs du restaurant sont disponibles */
        await _bootstrapAdminOrderIds();

        const today = new Date().toISOString().split('T')[0];
        const { data } = await window.db
            .from('delivery_chats')
            .select('order_id, created_at')
            .eq('sender_role', 'livreur')
            .gte('created_at', today)
            .order('created_at', { ascending: false });

        _loadReadAt();

        /* BUG 4 — ignorer les commandes hors restaurant courant */
        const knownIds = new Set(window._adminOrderIds || []);

        (data || []).forEach(msg => {
            if (knownIds.size && !knownIds.has(msg.order_id)) return;
            const lastRead = _lastReadAt[msg.order_id];
            if (!lastRead || msg.created_at > lastRead) {
                _unreadCounts[msg.order_id] = (_unreadCounts[msg.order_id] || 0) + 1;
            }
        });

        Object.entries(_unreadCounts).forEach(([orderId, count]) => {
            if (count > 0) _updateBadge(orderId, count);
        });

    } catch (_) {}
}

function _updateBadge(orderId, count) {
    const btn = document.querySelector(`.btn-order-chat[data-order-id="${orderId}"]`);
    if (!btn) return;
    _setBadgeOnBtn(btn, count);
}

/* CORRECTIF A — AudioContext réutilisé, déclaré hors de _init() */
function _playNotifSound() {
    if (!_audioCtx) return; /* Pas encore d'interaction utilisateur */
    try {
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, _audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.3);
    } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════
   PERSISTANCE DES MESSAGES LUS
   BUG 3 — clé localStorage préfixée par l'ID du restaurant
══════════════════════════════════════════════════════════════════ */
function _saveReadAt() {
    try {
        localStorage.setItem(_readKey, JSON.stringify(_lastReadAt));
    } catch (_) {}
}

function _loadReadAt() {
    try {
        _updateReadKey(); /* S'assurer que la clé est à jour */
        const raw = localStorage.getItem(_readKey);
        if (raw) _lastReadAt = JSON.parse(raw);
    } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════
   OBSERVER — surveille les nouvelles lignes de commandes injectées
══════════════════════════════════════════════════════════════════ */
let _chatObserver = null;

function _startObserver() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel || _chatObserver) return;
    _chatObserver = new MutationObserver(() => _injectChatButtons());
    _chatObserver.observe(panel, { childList: true, subtree: true });
    _injectChatButtons(); /* Injection initiale */
}


/* ══════════════════════════════════════════════════════════════════
   HOOK showPanel
   BUG 7  — hook initial + poller de rattrapage
   CORRECTIF C — flag __patched appliqué dès le hook initial
               pour que le poller ne l'enveloppe pas une 2e fois
══════════════════════════════════════════════════════════════════ */
function _patchShowPanel(fn) {
    const patched = function(id) {
        fn(id);
        if (id === 'orders-admin') {
            setTimeout(_startObserver, 400);
        }
    };
    patched.__patched = true; /* CORRECTIF C */
    return patched;
}

/* Tentative immédiate si showPanel existe déjà */
if (typeof window.showPanel === 'function' && !window.showPanel.__patched) {
    window.showPanel = _patchShowPanel(window.showPanel);
}

/* Poller de rattrapage si showPanel est défini après ce script */
let _hookAttempts = 0;
const _hookPoller = setInterval(() => {
    _hookAttempts++;
    if (_hookAttempts > 40) { clearInterval(_hookPoller); return; }
    if (typeof window.showPanel === 'function' && !window.showPanel.__patched) {
        window.showPanel = _patchShowPanel(window.showPanel);
        clearInterval(_hookPoller);
    }
}, 250);


/* ══════════════════════════════════════════════════════════════════
   INIT FINAL
   CORRECTIF B — guard contre double appel via admin:ready + poller
══════════════════════════════════════════════════════════════════ */
let _fullyInited = false;

function _doInit() {
    if (_fullyInited) return;
    _fullyInited = true;

    _staffName = window.currentRestaurant?.name || 'Gérant';
    _updateReadKey();
    _injectDrawer();
    _loadReadAt();

    setTimeout(async () => {
        await _bootstrapAdminOrderIds();
        _startGlobalListener();
        _startObserver();
    }, 600);
}

/* Voie 1 — événement admin:ready */
window.addEventListener('admin:ready', _doInit);

/* Voie 2 — fallback polling si admin:ready n'est jamais dispatché */
let _initAttempts = 0;
const _initPoller = setInterval(() => {
    _initAttempts++;
    if (_initAttempts > 30) { clearInterval(_initPoller); return; }
    if (window.currentRestaurant?.id && window.db) {
        clearInterval(_initPoller);
        _doInit();
    }
}, 800);

/* Fermer avec Échap */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') staffChatClose();
});

/* Helper XSS */
function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log('✅ admin-delivery-chat-patch.js v3 chargé — Chat Staff ↔ Livreur complet');

} // fin _init()