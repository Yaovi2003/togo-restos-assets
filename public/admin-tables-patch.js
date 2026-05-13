/**
 * admin-tables-patch.js — Gestion des tables et QR codes par table
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE :
 *  • Panneau "🪑 Tables" dans la nav admin
 *  • Création / suppression de tables (Table 1, VIP, Terrasse A…)
 *  • QR code unique généré par table (view.html?id=SLUG&table=N)
 *  • Copie de l'URL par table
 *  • Bouton "Imprimer tous les QR codes" → page A4 prête à imprimer
 *  • Séparation claire QR Table vs QR général (pour la livraison)
 *
 * INTÉGRATION dans admin.html — avant </body> :
 *    <script src="admin-tables-patch.js"></script>
 *
 * SQL À EXÉCUTER UNE FOIS DANS SUPABASE :
 *    ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number text;
 *
 *    CREATE TABLE IF NOT EXISTS restaurant_tables (
 *      id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
 *      restaurant_id uuid        REFERENCES restaurants(id) ON DELETE CASCADE,
 *      number        text        NOT NULL,
 *      label         text,
 *      capacity      integer     DEFAULT 4,
 *      is_active     boolean     DEFAULT true,
 *      created_at    timestamptz DEFAULT now(),
 *      UNIQUE(restaurant_id, number)
 *    );
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

/* ── Layout tables ── */
#panel-tables .tbl-header {
    display: flex; gap: 12px; align-items: flex-start;
    flex-wrap: wrap; margin-bottom: 20px;
}
#panel-tables .tbl-add-form {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius-lg); padding: 20px 22px; margin-bottom: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 10px; align-items: end;
}
@media(max-width:700px) {
    #panel-tables .tbl-add-form { grid-template-columns: 1fr 1fr; }
}

/* ── Info QR général ── */
.tbl-general-card {
    background: rgba(197,160,89,.06); border: 1px solid rgba(197,160,89,.2);
    border-radius: var(--radius-lg); padding: 16px 18px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.tbl-general-icon { font-size: 1.4rem; flex-shrink: 0; }
.tbl-general-text { flex: 1; min-width: 200px; }
.tbl-general-title { font-size: .88rem; font-weight: 600; color: var(--gold, #c5a059); margin-bottom: 3px; }
.tbl-general-sub   { font-size: .75rem; color: rgba(255,255,255,.45); line-height: 1.5; }

/* ── Grille des tables ── */
.tbl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
}

/* ── Carte table ── */
.tbl-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden;
    display: flex; flex-direction: column;
    transition: border-color .15s;
}
.tbl-card:hover { border-color: rgba(197,160,89,.3); }

.tbl-card-head {
    padding: 12px 14px 8px;
    display: flex; align-items: center; justify-content: space-between;
}
.tbl-name  { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; }
.tbl-cap   { font-size: .72rem; color: rgba(255,255,255,.35); }
.tbl-del-btn {
    background: none; border: none; color: rgba(255,255,255,.25);
    font-size: .85rem; cursor: pointer; padding: 2px 6px;
    border-radius: 5px; transition: all .15s;
}
.tbl-del-btn:hover { background: rgba(231,76,60,.15); color: #e74c3c; }

/* ── Zone QR ── */
.tbl-qr-wrap {
    background: #fff; margin: 0 14px 10px;
    border-radius: 10px; padding: 10px;
    display: flex; align-items: center; justify-content: center;
    min-height: 160px;
}
.tbl-qr-wrap canvas, .tbl-qr-wrap img {
    display: block; border-radius: 4px;
}

/* ── URL + actions ── */
.tbl-url {
    padding: 0 14px 4px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: .62rem; color: rgba(197,160,89,.6);
    word-break: break-all; line-height: 1.4;
}
.tbl-actions {
    padding: 8px 14px 12px;
    display: flex; gap: 6px;
}
.tbl-copy-btn {
    flex: 1; padding: 6px; border-radius: 8px;
    background: var(--surface2); border: 1px solid var(--border2);
    color: rgba(255,255,255,.5); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
}
.tbl-copy-btn:hover { border-color: rgba(197,160,89,.3); color: var(--gold, #c5a059); }
.tbl-copy-btn.copied { border-color: rgba(46,204,113,.3); color: #2ecc71; }

/* ── État vide ── */
.tbl-empty {
    grid-column: 1/-1; text-align: center; padding: 40px 20px;
    color: rgba(255,255,255,.3); font-size: .88rem; line-height: 1.7;
}
.tbl-empty-icon { font-size: 2.2rem; display: block; margin-bottom: 10px; }

/* ── Séparateur titre ── */
.tbl-section-title {
    font-family: 'Syne', sans-serif; font-size: .82rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: .08em;
    color: rgba(255,255,255,.35); margin-bottom: 14px;
    display: flex; align-items: center; gap: 10px;
}
.tbl-section-title::after {
    content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.07);
}

/* ── Print modal note ── */
.tbl-print-note {
    font-size: .75rem; color: rgba(255,255,255,.35);
    margin-top: 10px; text-align: center; line-height: 1.6;
}
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION NAV + PANEL
══════════════════════════════════════════════════════════════════ */
(function injectNavAndPanel() {
    const nav = document.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('[data-panel="tables"]')) {
        const btn = document.createElement('button');
        btn.className    = 'nav-item';
        btn.dataset.panel = 'tables';
        btn.innerHTML    = '<span class="nav-icon">🪑</span> Tables';
        const ordersBtn  = nav.querySelector('[data-panel="caisse"]') ||
                           nav.querySelector('[data-panel="orders-admin"]');
        ordersBtn
            ? ordersBtn.insertAdjacentElement('afterend', btn)
            : nav.appendChild(btn);
		btn.addEventListener('click', () => {
			if (window.innerWidth <= 768) {
				const overlay = document.getElementById('sidebar-overlay');
				if (overlay) overlay.classList.remove('visible');
				document.querySelector('.sidebar')?.classList.remove('mobile-open');
				document.body.style.overflow = '';
		   }
		   if (typeof showPanel === 'function') showPanel('tables');
		});   
    }

    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('panel-tables')) {
        const panel = document.createElement('div');
        panel.id        = 'panel-tables';
        panel.className = 'panel';
        panel.style.display = 'none';
        panel.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">🪑 Gestion des tables</h2>
                <p class="section-subtitle">Un QR code unique par table — commande directe sur place</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" onclick="loadTables()">🔄 Rafraîchir</button>
                <button class="btn btn-primary btn-sm" onclick="printAllQR()">🖨️ Imprimer tous les QR</button>
            </div>
        </div>

        <!-- QR général (livraison / à emporter) -->
        <div class="tbl-general-card">
            <span class="tbl-general-icon">📱</span>
            <div class="tbl-general-text">
                <div class="tbl-general-title">QR Code général (livraison & à emporter)</div>
                <div class="tbl-general-sub">
                    Ce QR ouvre le menu sans numéro de table → le client choisit librement Sur place ou Livraison.<br>
                    URL : <span id="tbl-general-url" style="font-family:monospace;color:rgba(197,160,89,.8);">—</span>
                </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="copyGeneralUrl()">📋 Copier</button>
        </div>

        <!-- Formulaire ajout table -->
        <div class="tbl-section-title">Tables de l'établissement</div>
        <div class="tbl-add-form" id="tbl-add-form">
            <div>
                <label class="field-label" style="margin-bottom:5px;display:block;">Numéro / Nom *</label>
                <input type="text" id="tbl-num-inp" class="field-input"
                    placeholder="1, 2, VIP, Terrasse A…" maxlength="20"
                    onkeydown="if(event.key==='Enter')addTable()">
            </div>
            <div>
                <label class="field-label" style="margin-bottom:5px;display:block;">Capacité</label>
                <input type="number" id="tbl-cap-inp" class="field-input"
                    placeholder="4" min="1" max="50" value="4">
            </div>
            <button class="btn btn-primary" onclick="addTable()" style="height:40px;">
                + Ajouter
            </button>
            <button class="btn btn-ghost" onclick="addDefaultTables()" style="height:40px;white-space:nowrap;">
                📋 Ajouter 1→10
            </button>
        </div>

        <!-- Grille des tables -->
        <div class="tbl-grid" id="tbl-grid">
            <div class="tbl-empty">
                <span class="tbl-empty-icon">⏳</span>
                Chargement…
            </div>
        </div>

        <p class="tbl-print-note" id="tbl-print-note" style="display:none;">
            💡 Imprimez les QR codes, plastifiez-les et posez-les sur chaque table.
            Les clients scannent et commandent directement — aucune app à télécharger.
        </p>`;
        main.appendChild(panel);
    }

    const _orig = window.showPanel;
    window.showPanel = function(id) {
        _orig(id);
        if (id === 'tables') loadTables();
    };
})();


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT QR CODE.JS (depuis le CDN)
══════════════════════════════════════════════════════════════════ */
let _qrLibReady = typeof QRCode !== 'undefined';

function _loadQRLib(callback) {
    if (_qrLibReady) { callback(); return; }

    const script = document.createElement('script');
    script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload  = () => { _qrLibReady = true; callback(); };
    script.onerror = () => console.error('QRCode.js non chargé');
    document.head.appendChild(script);
}


/* ══════════════════════════════════════════════════════════════════
   URL PAR TABLE
══════════════════════════════════════════════════════════════════ */
function _tableUrl(tableNumber) {
    const slug = window.currentRestaurant?.slug || '';
    return `${location.origin}/view.html?id=${encodeURIComponent(slug)}&table=${encodeURIComponent(tableNumber)}`;
}

function _generalUrl() {
    const slug = window.currentRestaurant?.slug || '';
    return `${location.origin}/view.html?id=${encodeURIComponent(slug)}`;
}


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DES TABLES
══════════════════════════════════════════════════════════════════ */
window.loadTables = async function() {
    if (!window.db || !window.currentRestaurant) return;

    /* URL générale */
    const genUrl = _generalUrl();
    const genEl  = document.getElementById('tbl-general-url');
    if (genEl) genEl.textContent = genUrl;

    const grid = document.getElementById('tbl-grid');
    if (grid) grid.innerHTML = '<div class="tbl-empty"><span class="tbl-empty-icon">⏳</span>Chargement…</div>';

    try {
        const { data: tables, error } = await db
            .from('restaurant_tables')
            .select('id, number, label, capacity, is_active, created_at')
            .eq('restaurant_id', currentRestaurant.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            /* La table n'existe pas encore */
            if (error.code === '42P01') {
                if (grid) grid.innerHTML = `<div class="tbl-empty">
                    <span class="tbl-empty-icon">⚠️</span>
                    Table Supabase manquante.<br>Exécutez le SQL fourni dans la doc puis rechargez.
                </div>`;
                return;
            }
            throw error;
        }

        _renderTables(tables || []);

    } catch (e) {
        if (grid) grid.innerHTML = `<div class="tbl-empty" style="color:var(--danger,#e74c3c);">
            Erreur : ${_esc(e.message)}
        </div>`;
    }
};


/* ══════════════════════════════════════════════════════════════════
   RENDU GRILLE
══════════════════════════════════════════════════════════════════ */
function _renderTables(tables) {
    const grid     = document.getElementById('tbl-grid');
    const printNote = document.getElementById('tbl-print-note');
    if (!grid) return;

    if (!tables.length) {
        grid.innerHTML = `<div class="tbl-empty">
            <span class="tbl-empty-icon">🪑</span>
            Aucune table configurée.<br>
            Utilisez le formulaire ci-dessus pour ajouter vos tables.
        </div>`;
        if (printNote) printNote.style.display = 'none';
        return;
    }

    grid.innerHTML = '';
    if (printNote) printNote.style.display = 'block';

    _loadQRLib(() => {
        tables.forEach(t => {
            const url  = _tableUrl(t.number);
            const card = document.createElement('div');
            card.className   = 'tbl-card';
            card.dataset.num = t.number;
            card.dataset.url = url;

            const label = t.label || `Table ${t.number}`;
            const qrId  = `qr-${t.id.replace(/-/g,'')}`;

            card.innerHTML = `
                <div class="tbl-card-head">
                    <div>
                        <div class="tbl-name">${_esc(label)}</div>
                        <div class="tbl-cap">👥 ${t.capacity || 4} places</div>
                    </div>
                    <button class="tbl-del-btn" title="Supprimer"
                        onclick="deleteTable('${t.id}', '${_esc(label)}')">🗑</button>
                </div>
                <div class="tbl-qr-wrap" id="${qrId}"></div>
                <div class="tbl-url">${url}</div>
                <div class="tbl-actions">
                    <button class="tbl-copy-btn" onclick="copyTableUrl('${_esc(url)}', this)">
                        📋 Copier l'URL
                    </button>
                </div>`;

            grid.appendChild(card);

            /* Générer le QR dans le conteneur */
            try {
                new QRCode(document.getElementById(qrId), {
                    text:         url,
                    width:        160,
                    height:       160,
                    colorDark:    '#000000',
                    colorLight:   '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M,
                });
            } catch (e) {
                const wrap = document.getElementById(qrId);
                if (wrap) wrap.innerHTML = `<span style="font-size:.72rem;color:rgba(255,255,255,.3);">QR indisponible</span>`;
            }
        });
    });
}


/* ══════════════════════════════════════════════════════════════════
   AJOUT DE TABLE
══════════════════════════════════════════════════════════════════ */
window.addTable = async function() {
    const numInp = document.getElementById('tbl-num-inp');
    const capInp = document.getElementById('tbl-cap-inp');
    if (!numInp || !window.db || !window.currentRestaurant) return;

    const number   = numInp.value.trim();
    const capacity = parseInt(capInp?.value || '4', 10) || 4;

    if (!number) {
        numInp.focus();
        if (typeof toast === 'function') toast('Entrez un numéro ou nom de table.', 'warning');
        return;
    }
    if (!/^[a-zA-Z0-9\-_ ]{1,20}$/.test(number)) {
        if (typeof toast === 'function') toast('Nom invalide (max 20 caractères, lettres, chiffres, tirets).', 'error');
        return;
    }

    try {
        const { error } = await db.from('restaurant_tables').insert({
            restaurant_id: currentRestaurant.id,
            number,
            label:    `Table ${number}`,
            capacity: Math.min(Math.max(capacity, 1), 50),
            is_active: true,
        });

        if (error) {
            if (error.code === '23505') {
                if (typeof toast === 'function') toast(`La table "${number}" existe déjà.`, 'warning');
            } else {
                throw error;
            }
            return;
        }

        numInp.value    = '';
        if (capInp) capInp.value = '4';
        if (typeof toast === 'function') toast(`Table "${number}" ajoutée !`, 'success');
        loadTables();

    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};


/* ── Ajout rapide Tables 1→10 ── */
window.addDefaultTables = async function() {
    if (!window.db || !window.currentRestaurant) return;
    if (!confirm('Ajouter les Tables 1 à 10 (celles qui existent déjà seront ignorées) ?')) return;

    const rows = Array.from({ length: 10 }, (_, i) => ({
        restaurant_id: currentRestaurant.id,
        number:        String(i + 1),
        label:         `Table ${i + 1}`,
        capacity:      4,
        is_active:     true,
    }));

    try {
        const { error } = await db
            .from('restaurant_tables')
            .insert(rows, { onConflict: 'restaurant_id,number', ignoreDuplicates: true });

        if (error) throw error;
        if (typeof toast === 'function') toast('Tables 1→10 ajoutées !', 'success');
        loadTables();
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};


/* ══════════════════════════════════════════════════════════════════
   SUPPRESSION DE TABLE
══════════════════════════════════════════════════════════════════ */
window.deleteTable = async function(id, label) {
    if (!confirm(`Supprimer "${label}" ? Le QR code associé ne fonctionnera plus.`)) return;
    if (!window.db) return;

    try {
        /* Soft delete — on désactive plutôt que supprimer */
        const { error } = await db
            .from('restaurant_tables')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw error;
        if (typeof toast === 'function') toast(`"${label}" supprimée.`, 'info');
        loadTables();
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur : ' + e.message, 'error');
    }
};


/* ══════════════════════════════════════════════════════════════════
   COPIER URL
══════════════════════════════════════════════════════════════════ */
window.copyTableUrl = function(url, btn) {
    navigator.clipboard.writeText(url).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✅ Copié !';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    }).catch(() => {
        if (typeof toast === 'function') toast('Impossible de copier.', 'error');
    });
};

window.copyGeneralUrl = function() {
    const url = _generalUrl();
    navigator.clipboard.writeText(url).then(() => {
        if (typeof toast === 'function') toast('URL générale copiée !', 'success');
    });
};


/* ══════════════════════════════════════════════════════════════════
   IMPRESSION DE TOUS LES QR CODES
══════════════════════════════════════════════════════════════════ */
window.printAllQR = function() {
    const cards = document.querySelectorAll('.tbl-card');
    if (!cards.length) {
        if (typeof toast === 'function') toast('Aucune table à imprimer.', 'warning');
        return;
    }

    const restoName = window.currentRestaurant?.name || 'Restaurant';

    /* Collecter URLs et noms des tables */
    const tableData = [];
    cards.forEach(card => {
        tableData.push({
            label: card.querySelector('.tbl-name')?.textContent?.trim() || '',
            url:   card.dataset.url || '',
        });
    });

    /* Ouvrir une fenêtre d'impression avec QR codes en CSS Grid */
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>QR Codes Tables — ${_esc(restoName)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #fff; padding: 20px; }
  h1   { text-align: center; font-size: 1.2rem; margin-bottom: 6px; }
  .sub { text-align: center; font-size: .78rem; color: #666; margin-bottom: 24px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 20px;
  }
  .card {
    border: 1.5px solid #e0e0e0; border-radius: 12px;
    padding: 14px; text-align: center; page-break-inside: avoid;
  }
  .card-name { font-size: .95rem; font-weight: 700; margin-bottom: 10px; }
  .qr-wrap   { background: #fff; padding: 4px; display: inline-block; border-radius: 6px; }
  .card-url  {
    font-size: .52rem; color: #999; margin-top: 8px;
    word-break: break-all; line-height: 1.3;
  }
  .card-hint { font-size: .68rem; color: #aaa; margin-top: 6px; }
  @media print {
    body { padding: 10px; }
    .no-print { display: none; }
    .card { border-color: #ccc; }
  }
</style>
</head>
<body>
<h1>🪑 QR Codes — ${_esc(restoName)}</h1>
<p class="sub">Scannez pour commander directement depuis votre table</p>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#c5a059;color:#000;border:none;border-radius:8px;font-size:.9rem;font-weight:700;cursor:pointer;">
    🖨️ Imprimer
  </button>
</div>
<div class="grid" id="print-grid"></div>
<script>
const tableData = ${JSON.stringify(tableData)};
const grid = document.getElementById('print-grid');
tableData.forEach((t, i) => {
  const card = document.createElement('div');
  card.className = 'card';
  const qrId = 'pqr' + i;
  card.innerHTML = \`<div class="card-name">\${t.label}</div>
    <div class="qr-wrap" id="\${qrId}"></div>
    <div class="card-url">\${t.url}</div>
    <div class="card-hint">Scanner pour commander</div>\`;
  grid.appendChild(card);
  new QRCode(document.getElementById(qrId), {
    text: t.url, width: 150, height: 150,
    colorDark: '#000', colorLight: '#fff',
    correctLevel: QRCode.CorrectLevel.M
  });
});
<\/script>
</body>
</html>`);
    w.document.close();
};


/* ── Helpers ── */
function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log('✅ admin-tables-patch.js chargé — panneau Tables + QR par table');
