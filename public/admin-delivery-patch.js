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
