/**
 * admin-staff-patch.js — Gestion de l'équipe (serveurs, caissiers, cuisine)
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE dans admin.html :
 *  • Panneau "👥 Mon équipe" dans la sidebar
 *  • Création / désactivation de membres du staff
 *  • Rôles : serveur, caissier, cuisine
 *  • Badge numéro + PIN 4 chiffres
 *  • Lien de connexion staff (staff.html?id=SLUG) + QR code
 *  • Affichage des commandes récentes par membre
 *
 * INTÉGRATION — ajouter dans admin.html avant </body> :
 *   <script src="admin-staff-patch.js"></script>
 *
 * SQL requis : voir migration_staff.sql
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

/* ── Grille staff ── */
.stf-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
    margin-bottom: 24px;
}

/* ── Carte membre ── */
.stf-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px;
    display: flex; flex-direction: column; gap: 12px;
    transition: border-color .15s;
    position: relative;
}
.stf-card:hover { border-color: rgba(197,160,89,.3); }
.stf-card.inactive { opacity: .45; }

.stf-card-head {
    display: flex; align-items: center; gap: 12px;
}
.stf-avatar {
    width: 44px; height: 44px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem; flex-shrink: 0;
}
.stf-avatar.role-server  { background: rgba(52,152,219,.15); }
.stf-avatar.role-cashier { background: rgba(46,204,113,.15); }
.stf-avatar.role-kitchen { background: rgba(231,76,60,.12);  }

.stf-info { flex: 1; min-width: 0; }
.stf-name  { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stf-role  { font-size: .72rem; color: rgba(255,255,255,.4); margin-top: 2px; }

.stf-badge-chip {
    font-family: 'IBM Plex Mono', monospace;
    font-size: .75rem; font-weight: 600;
    background: rgba(197,160,89,.1); border: 1px solid rgba(197,160,89,.2);
    border-radius: 8px; padding: 3px 10px; color: var(--gold, #c5a059);
    white-space: nowrap;
}

.stf-pin-row {
    display: flex; align-items: center; gap: 8px;
    font-size: .78rem; color: rgba(255,255,255,.4);
}
.stf-pin-dots { letter-spacing: 4px; font-size: .9rem; }
.stf-pin-reveal {
    background: none; border: none; color: rgba(255,255,255,.3);
    font-size: .75rem; cursor: pointer; padding: 2px 6px;
    border-radius: 5px; transition: all .15s;
}
.stf-pin-reveal:hover { color: var(--gold, #c5a059); }

.stf-actions {
    display: flex; gap: 6px; margin-top: 4px;
}
.stf-link-btn {
    flex: 1; padding: 7px; border-radius: 8px;
    background: var(--surface2); border: 1px solid var(--border2);
    color: rgba(255,255,255,.5); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
    text-align: center;
}
.stf-link-btn:hover { border-color: rgba(197,160,89,.3); color: var(--gold,#c5a059); }
.stf-link-btn.copied { border-color: rgba(46,204,113,.3); color: #2ecc71; }
.stf-deactivate-btn {
    padding: 7px 10px; border-radius: 8px;
    background: rgba(231,76,60,.08); border: 1px solid rgba(231,76,60,.15);
    color: rgba(231,76,60,.6); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
}
.stf-deactivate-btn:hover { background: rgba(231,76,60,.18); color: #e74c3c; }

/* ── Formulaire ajout ── */
.stf-add-form {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius-lg); padding: 22px 24px; margin-bottom: 24px;
}
.stf-add-form .form-grid-3 {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
    margin-bottom: 12px;
}
@media(max-width:700px) {
    .stf-add-form .form-grid-3 { grid-template-columns: 1fr 1fr; }
}

/* ── QR accès staff ── */
.stf-access-card {
    background: rgba(197,160,89,.05); border: 1px solid rgba(197,160,89,.2);
    border-radius: var(--radius-lg); padding: 18px 20px; margin-bottom: 24px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.stf-access-qr { background: #fff; border-radius: 10px; padding: 8px; flex-shrink: 0; }
.stf-access-text { flex: 1; min-width: 200px; }
.stf-access-title { font-size: .9rem; font-weight: 700; color: var(--gold,#c5a059); margin-bottom: 4px; }
.stf-access-sub   { font-size: .75rem; color: rgba(255,255,255,.4); line-height: 1.6; }
.stf-access-url   { font-family: 'IBM Plex Mono', monospace; font-size: .7rem;
                    color: rgba(197,160,89,.7); word-break: break-all; margin-top: 4px; }

/* ── Stats rapides ── */
.stf-stats-row {
    display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px;
}
.stf-stat {
    flex: 1; min-width: 120px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 16px 18px; text-align: center;
}
.stf-stat-val { font-family: 'Syne', sans-serif; font-size: 1.6rem; font-weight: 800;
                color: var(--gold,#c5a059); }
.stf-stat-lbl { font-size: .7rem; color: rgba(255,255,255,.35); margin-top: 4px; }

/* ── Rôle badge ── */
.role-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 600;
}
.role-badge.server  { background: rgba(52,152,219,.15);  color: #3498db; }
.role-badge.cashier { background: rgba(46,204,113,.15);  color: #2ecc71; }
.role-badge.kitchen { background: rgba(231,76,60,.12);   color: #e74c3c; }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION NAV + PANEL
══════════════════════════════════════════════════════════════════ */
(function injectNavAndPanel() {

    /* ── Bouton nav ── */
    const nav = document.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('[data-panel="staff"]')) {
        const btn = document.createElement('button');
        btn.className     = 'nav-item';
        btn.dataset.panel = 'staff';
        btn.innerHTML     = '<span class="nav-icon">👥</span> Mon équipe';
        /* Insérer après "employees-panel" ou en fin de nav */
        const empBtn = nav.querySelector('[data-panel="employees-panel"]') ||
                       nav.querySelector('[data-panel="stock"]');
        empBtn ? empBtn.insertAdjacentElement('afterend', btn) : nav.appendChild(btn);

        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar-overlay')?.classList.remove('visible');
                document.querySelector('.sidebar')?.classList.remove('mobile-open');
                document.body.style.overflow = '';
            }
            if (typeof showPanel === 'function') showPanel('staff');
        });
    }

    /* ── Panel ── */
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('panel-staff')) {
        const panel = document.createElement('div');
        panel.id        = 'panel-staff';
        panel.className = 'panel';
        panel.style.display = 'none';
        panel.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">👥 Mon équipe</h2>
                <p class="section-subtitle">Gérez vos serveurs, caissiers et cuisiniers</p>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="loadStaff()">🔄 Rafraîchir</button>
        </div>

        <!-- Lien d'accès staff -->
        <div class="stf-access-card" id="stf-access-card">
            <div class="stf-access-qr" id="stf-access-qr-wrap"></div>
            <div class="stf-access-text">
                <div class="stf-access-title">🔗 Page de connexion de votre équipe</div>
                <div class="stf-access-sub">
                    Partagez ce lien ou ce QR à vos employés.<br>
                    Ils se connectent avec leur numéro de badge + PIN.
                </div>
                <div class="stf-access-url" id="stf-access-url">—</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
                <button class="btn btn-ghost btn-sm" onclick="copyStaffUrl()">📋 Copier le lien</button>
                <button class="btn btn-ghost btn-sm" onclick="printStaffQR()">🖨️ Imprimer QR</button>
            </div>
        </div>

        <!-- Stats rapides -->
        <div class="stf-stats-row" id="stf-stats-row">
            <div class="stf-stat"><div class="stf-stat-val" id="stf-count-server">—</div><div class="stf-stat-lbl">🪑 Serveurs</div></div>
            <div class="stf-stat"><div class="stf-stat-val" id="stf-count-cashier">—</div><div class="stf-stat-lbl">💰 Caissiers</div></div>
            <div class="stf-stat"><div class="stf-stat-val" id="stf-count-kitchen">—</div><div class="stf-stat-lbl">🍳 Cuisine</div></div>
        </div>

        <!-- Formulaire ajout ── -->
        <div class="tbl-section-title">Ajouter un membre</div>
        <div class="stf-add-form">
            <div class="form-grid-3">
                <div class="field-group">
                    <label class="field-label">Nom complet *</label>
                    <input type="text" id="stf-name-inp" class="field-input" placeholder="Marie Adjoa" maxlength="40">
                </div>
                <div class="field-group">
                    <label class="field-label">Rôle *</label>
                    <select id="stf-role-inp" class="field-input">
                        <option value="server">🪑 Serveur / Serveuse</option>
                        <option value="cashier">💰 Caissier / Caissière</option>
                        <option value="kitchen">🍳 Cuisine</option>
                    </select>
                </div>
                <div class="field-group">
                    <label class="field-label">N° Badge *</label>
                    <input type="text" id="stf-badge-inp" class="field-input" placeholder="01" maxlength="10">
                </div>
            </div>
            <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
                <div class="field-group" style="width:140px;">
                    <label class="field-label">PIN 4 chiffres *</label>
                    <input type="number" id="stf-pin-inp" class="field-input"
                        placeholder="1234" min="1000" max="9999"
                        onkeydown="if(event.key==='Enter')addStaffMember()">
                </div>
                <button class="btn btn-primary" onclick="addStaffMember()" style="height:42px;">
                    + Ajouter
                </button>
                <button class="btn btn-ghost" onclick="generatePin()" style="height:42px;" title="Générer un PIN aléatoire">
                    🎲 PIN aléatoire
                </button>
            </div>
        </div>

        <!-- Grille membres ── -->
        <div class="tbl-section-title">Membres actifs</div>
        <div class="stf-grid" id="stf-grid">
            <div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(255,255,255,.3);">
                ⏳ Chargement…
            </div>
        </div>`;

        main.appendChild(panel);
    }

    /* ── Patch showPanel ── */
    const _origShow = window.showPanel;
    window.showPanel = function(id) {
        if (typeof _origShow === 'function') _origShow(id);
        if (id === 'staff') loadStaff();
    };
})();


/* ══════════════════════════════════════════════════════════════════
   HELPERS RÔLES
══════════════════════════════════════════════════════════════════ */
const ROLE_CONFIG = {
    server:  { label: 'Serveur',   icon: '🪑', color: '#3498db' },
    cashier: { label: 'Caissier',  icon: '💰', color: '#2ecc71' },
    kitchen: { label: 'Cuisine',   icon: '🍳', color: '#e74c3c' },
};

function _staffUrl() {
    const slug = window.currentRestaurant?.slug || '';
    return `${location.origin}/staff.html?id=${encodeURIComponent(slug)}`;
}

function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DU STAFF
══════════════════════════════════════════════════════════════════ */
window.loadStaff = async function() {
    if (!window.db || !window.currentRestaurant) return;

    /* URL d'accès staff + QR */
    const url = _staffUrl();
    const urlEl = document.getElementById('stf-access-url');
    if (urlEl) urlEl.textContent = url;
    _renderAccessQR(url);

    const grid = document.getElementById('stf-grid');
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(255,255,255,.3);">⏳ Chargement…</div>`;

    try {
        const { data: members, error } = await window.db
            .from('restaurant_staff')
            .select('*')
            .eq('restaurant_id', window.currentRestaurant.id)
            .order('role')
            .order('badge_number');

        if (error) throw error;

        const active = (members || []).filter(m => m.is_active);

        /* Stats */
        document.getElementById('stf-count-server').textContent  = active.filter(m => m.role === 'server').length;
        document.getElementById('stf-count-cashier').textContent = active.filter(m => m.role === 'cashier').length;
        document.getElementById('stf-count-kitchen').textContent = active.filter(m => m.role === 'kitchen').length;

        _renderStaffGrid(members || []);

    } catch (e) {
        if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--danger,#e74c3c);">Erreur : ${_esc(e.message)}</div>`;
    }
};


/* ══════════════════════════════════════════════════════════════════
   RENDU GRILLE
══════════════════════════════════════════════════════════════════ */
function _renderStaffGrid(members) {
    const grid = document.getElementById('stf-grid');
    if (!grid) return;

    const active = members.filter(m => m.is_active);
    if (!active.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:rgba(255,255,255,.25);line-height:1.8;">
            <div style="font-size:2rem;margin-bottom:12px;">👥</div>
            Aucun membre dans l'équipe.<br>
            Utilisez le formulaire ci-dessus pour ajouter vos premiers employés.
        </div>`;
        return;
    }

    grid.innerHTML = '';
    active.forEach(m => {
        const cfg   = ROLE_CONFIG[m.role] || { label: m.role, icon: '👤', color: '#fff' };
        const card  = document.createElement('div');
        card.className  = 'stf-card';
        card.dataset.id = m.id;

        card.innerHTML = `
            <div class="stf-card-head">
                <div class="stf-avatar role-${m.role}">${cfg.icon}</div>
                <div class="stf-info">
                    <div class="stf-name">${_esc(m.name)}</div>
                    <div class="stf-role">
                        <span class="role-badge ${m.role}">${cfg.icon} ${cfg.label}</span>
                    </div>
                </div>
                <div class="stf-badge-chip">Badge #${_esc(m.badge_number)}</div>
            </div>
            <div class="stf-pin-row">
                <span>PIN :</span>
                <span class="stf-pin-dots" id="pin-dots-${m.id}">••••</span>
                <button class="stf-pin-reveal" onclick="togglePin('${m.id}','${_esc(m.pin)}')">
                    👁 Voir
                </button>
            </div>
            <div class="stf-actions">
                <button class="stf-link-btn" onclick="copyStaffMemberInfo('${_esc(m.name)}','${_esc(m.badge_number)}','${_esc(m.pin)}',this)">
                    📋 Copier les accès
                </button>
                <button class="stf-deactivate-btn" onclick="deactivateStaff('${m.id}','${_esc(m.name)}')">
                    🗑
                </button>
            </div>`;
        grid.appendChild(card);
    });
}


/* ══════════════════════════════════════════════════════════════════
   QR CODE ACCÈS STAFF
══════════════════════════════════════════════════════════════════ */
function _renderAccessQR(url) {
    const wrap = document.getElementById('stf-access-qr-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    const _gen = () => {
        try {
            new QRCode(wrap, { text: url, width: 90, height: 90, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
        } catch (_) { wrap.innerHTML = `<span style="font-size:.65rem;color:rgba(255,255,255,.3);">QR</span>`; }
    };

    if (typeof QRCode !== 'undefined') { _gen(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = _gen;
    document.head.appendChild(s);
}


/* ══════════════════════════════════════════════════════════════════
   AJOUT D'UN MEMBRE
══════════════════════════════════════════════════════════════════ */
window.addStaffMember = async function() {
    if (!window.db || !window.currentRestaurant) return;

    const name   = document.getElementById('stf-name-inp')?.value.trim();
    const role   = document.getElementById('stf-role-inp')?.value;
    const badge  = document.getElementById('stf-badge-inp')?.value.trim();
    const pin    = document.getElementById('stf-pin-inp')?.value.trim();

    if (!name)  { toast('Entrez le nom du membre.', 'warning'); return; }
    if (!badge) { toast('Entrez un numéro de badge.', 'warning'); return; }
    if (!/^\d{4}$/.test(pin)) { toast('Le PIN doit être exactement 4 chiffres.', 'error'); return; }
    if (!/^[a-zA-Z0-9\-_]{1,10}$/.test(badge)) { toast('Badge invalide (max 10 caractères, lettres/chiffres).', 'error'); return; }

    try {
        const { error } = await window.db.from('restaurant_staff').insert({
            restaurant_id: window.currentRestaurant.id,
            name, role, badge_number: badge, pin, is_active: true,
        });

        if (error) {
            if (error.code === '23505') { toast(`Le badge "${badge}" est déjà utilisé.`, 'warning'); return; }
            throw error;
        }

        /* Reset form */
        document.getElementById('stf-name-inp').value  = '';
        document.getElementById('stf-badge-inp').value = '';
        document.getElementById('stf-pin-inp').value   = '';

        const cfg = ROLE_CONFIG[role] || { icon: '👤' };
        toast(`${cfg.icon} ${name} ajouté(e) !`, 'success');
        loadStaff();

    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
};


/* ══════════════════════════════════════════════════════════════════
   DÉSACTIVER UN MEMBRE
══════════════════════════════════════════════════════════════════ */
window.deactivateStaff = async function(id, name) {
    if (!confirm(`Désactiver "${name}" ? Il/elle ne pourra plus se connecter.`)) return;
    if (!window.db) return;

    try {
        const { error } = await window.db
            .from('restaurant_staff')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw error;
        toast(`${name} désactivé(e).`, 'info');
        loadStaff();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
};


/* ══════════════════════════════════════════════════════════════════
   UTILITAIRES UI
══════════════════════════════════════════════════════════════════ */
window.togglePin = function(id, pin) {
    const el = document.getElementById(`pin-dots-${id}`);
    if (!el) return;
    el.textContent = el.textContent === '••••' ? pin : '••••';
};

window.generatePin = function() {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const inp = document.getElementById('stf-pin-inp');
    if (inp) { inp.value = pin; toast(`PIN généré : ${pin}`, 'info', 3000); }
};

window.copyStaffUrl = function() {
    const url = _staffUrl();
    navigator.clipboard.writeText(url)
        .then(() => toast('Lien copié !', 'success'))
        .catch(() => toast('Impossible de copier.', 'error'));
};

window.copyStaffMemberInfo = function(name, badge, pin, btn) {
    const url  = _staffUrl();
    const text = `Accès staff — ${name}\nURL : ${url}\nBadge : ${badge}\nPIN : ${pin}`;
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✅ Copié !';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    });
};

window.printStaffQR = function() {
    const url       = _staffUrl();
    const restoName = window.currentRestaurant?.name || 'Restaurant';
    const w = window.open('', '_blank', 'width=500,height=600');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Accès Staff — ${_esc(restoName)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:30px;text-align:center;}
  h1{font-size:1.1rem;margin-bottom:4px;}
  .sub{font-size:.8rem;color:#666;margin-bottom:20px;}
  #qr{background:#fff;padding:8px;border:2px solid #e0e0e0;border-radius:12px;display:inline-block;}
  .url{font-size:.65rem;color:#999;margin-top:14px;word-break:break-all;max-width:300px;}
  .hint{font-size:.75rem;color:#aaa;margin-top:8px;}
  @media print{button{display:none;}}
</style></head><body>
<h1>👥 Accès Staff</h1>
<p class="sub">${_esc(restoName)}</p>
<div id="qr"></div>
<p class="url">${url}</p>
<p class="hint">Scannez pour accéder à la page de connexion staff</p>
<button onclick="window.print()" style="margin-top:20px;padding:10px 24px;background:#c5a059;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨️ Imprimer</button>
<script>new QRCode(document.getElementById('qr'),{text:'${url}',width:220,height:220,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});<\/script>
</body></html>`);
    w.document.close();
};

console.log('✅ admin-staff-patch.js chargé — Gestion équipe staff');
