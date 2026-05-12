/**
 * admin-analytics-patch.js — Tableau de bord Analytics
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AJOUTE :
 *  • Panneau "📈 Analytiques" dans la nav admin
 *  • Graphique CA sur 30 jours glissants (barres CSS)
 *  • Heatmap des heures de pointe (7 jours × 24 h)
 *  • Top 5 plats commandés
 *  • Indicateurs : ticket moyen, meilleur jour, meilleure heure
 *  • Export CSV plage de dates configurable (correction BUG exportAccountingCSV)
 *
 * INTÉGRATION :
 *  Ajouter dans admin.html juste avant </body> :
 *    <script src="admin-analytics-patch.js"></script>
 *    <script src="admin-patch.js"></script>
 *
 * TABLES SUPABASE NÉCESSAIRES :
 *  • transactions (id, restaurant_id, amount, created_at, payment_method, type)
 *  • order_items  (id, order_id, item_name, quantity)         ← pour top plats
 *  • orders       (id, restaurant_id, created_at)             ← jointure order_items
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `

/* ── Layout analytics ── */
#panel-analytics .an-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
}
@media(max-width:768px){ #panel-analytics .an-grid { grid-template-columns: 1fr; } }

#panel-analytics .an-kpi {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
}
#panel-analytics .an-kpi-lbl {
    font-size: .68rem; text-transform: uppercase;
    letter-spacing: .08em; color: var(--text-dim); margin-bottom: 8px;
    font-weight: 600;
}
#panel-analytics .an-kpi-val {
    font-family: var(--mono); font-size: 1.6rem; font-weight: 700;
    color: var(--gold); line-height: 1;
}
#panel-analytics .an-kpi-sub {
    font-size: .72rem; color: var(--text-muted); margin-top: 5px;
}

/* ── Card générique ── */
#panel-analytics .an-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px 22px;
    margin-bottom: 16px;
}
#panel-analytics .an-card-title {
    font-family: 'Syne', sans-serif;
    font-size: .95rem; font-weight: 700;
    margin-bottom: 18px;
    display: flex; align-items: center; justify-content: space-between;
}
#panel-analytics .an-period-badge {
    font-size: .68rem; font-family: var(--mono);
    background: var(--surface2); border: 1px solid var(--border);
    color: var(--text-dim); padding: 3px 10px; border-radius: 6px;
}

/* ── Graphique barres 30 jours ── */
.an-chart-wrap {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 110px;
    width: 100%;
    overflow: hidden;
}
.an-bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
    position: relative;
    cursor: pointer;
}
.an-bar {
    width: 100%;
    border-radius: 3px 3px 0 0;
    min-height: 3px;
    background: var(--gold);
    opacity: .55;
    transition: opacity .15s, transform .15s;
    position: relative;
}
.an-bar-col:hover .an-bar { opacity: 1; transform: scaleX(1.05); }
.an-bar-col.today .an-bar { opacity: 1; background: var(--gold); }

.an-bar-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%; transform: translateX(-50%);
    background: var(--surface2); border: 1px solid var(--border2);
    color: var(--text); font-size: .68rem; font-family: var(--mono);
    padding: 4px 8px; border-radius: 6px; white-space: nowrap;
    pointer-events: none; opacity: 0; transition: opacity .15s;
    z-index: 10;
}
.an-bar-col:hover .an-bar-tooltip { opacity: 1; }

.an-x-labels {
    display: flex; gap: 3px; margin-top: 4px;
    overflow: hidden;
}
.an-x-label {
    flex: 1; font-size: .55rem; color: var(--text-muted);
    text-align: center; white-space: nowrap; overflow: hidden;
    font-family: var(--mono);
}
.an-x-label.today { color: var(--gold); font-weight: 700; }

/* ── Heatmap ── */
.an-heatmap-wrap {
    overflow-x: auto;
}
.an-heatmap {
    display: grid;
    grid-template-columns: 32px repeat(24, 1fr);
    gap: 2px;
    min-width: 480px;
}
.an-heat-cell {
    height: 18px; border-radius: 3px;
    transition: opacity .15s;
    position: relative; cursor: pointer;
}
.an-heat-cell:hover .an-heat-tip {
    opacity: 1;
}
.an-heat-tip {
    position: absolute; bottom: calc(100% + 6px); left: 50%;
    transform: translateX(-50%);
    background: var(--surface2); border: 1px solid var(--border2);
    color: var(--text); font-size: .65rem; font-family: var(--mono);
    padding: 3px 7px; border-radius: 5px; white-space: nowrap;
    pointer-events: none; opacity: 0; z-index: 10;
}
.an-heat-row-lbl {
    display: flex; align-items: center; justify-content: flex-end;
    padding-right: 6px;
    font-size: .65rem; color: var(--text-dim); font-family: var(--mono);
}
.an-heat-hour-lbl {
    font-size: .55rem; color: var(--text-muted);
    text-align: center; font-family: var(--mono); padding-top: 4px;
}
.an-heatmap-legend {
    display: flex; align-items: center; gap: 8px;
    margin-top: 12px; font-size: .72rem; color: var(--text-dim);
}
.an-legend-grad {
    flex: 1; max-width: 120px; height: 8px; border-radius: 4px;
    background: linear-gradient(to right, var(--surface3), var(--gold));
}

/* ── Top items ── */
.an-top-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
}
.an-top-item:last-child { border-bottom: none; }
.an-top-rank {
    font-family: var(--mono); font-size: .75rem; color: var(--text-dim);
    width: 18px; flex-shrink: 0; text-align: right;
}
.an-top-name { flex: 1; font-size: .88rem; }
.an-top-bar-wrap {
    width: 80px; height: 5px; background: var(--surface3);
    border-radius: 3px; overflow: hidden; flex-shrink: 0;
}
.an-top-bar-fill { height: 100%; background: var(--gold); border-radius: 3px; }
.an-top-qty {
    font-family: var(--mono); font-size: .78rem; color: var(--gold);
    width: 42px; text-align: right; flex-shrink: 0;
}

/* ── Export CSV étendu ── */
.an-export-row {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    background: var(--surface2); border-radius: var(--radius);
    padding: 12px 16px; margin-bottom: 16px;
}
.an-export-row label {
    font-size: .72rem; color: var(--text-dim); font-weight: 600;
    text-transform: uppercase; letter-spacing: .06em;
}

/* ── Loader inline ── */
.an-loader {
    display: flex; align-items: center; gap: 10px;
    padding: 40px; justify-content: center; color: var(--text-dim);
    font-size: .9rem;
}
.an-spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid rgba(197,160,89,.2); border-top-color: var(--gold);
    animation: anSpin .7s linear infinite; flex-shrink: 0;
}
@keyframes anSpin { to { transform: rotate(360deg); } }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION NAV + PANEL
══════════════════════════════════════════════════════════════════ */
(function injectNavAndPanel() {
    /* ── Nav button ── */
    const nav = document.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('[data-panel="analytics"]')) {
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.panel = 'analytics';
        btn.innerHTML = '<span class="nav-icon">📈</span> Analytiques';
        /* Insérer après Comptabilité */
        const accBtn = nav.querySelector('[data-panel="accounting"]');
        if (accBtn) accBtn.insertAdjacentElement('afterend', btn);
        else nav.appendChild(btn);
    }

    /* ── Panel ── */
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('panel-analytics')) {
        const panel = document.createElement('div');
        panel.id    = 'panel-analytics';
        panel.className = 'panel';
        panel.style.display = 'none';
        panel.innerHTML = `
        <div class="section-header">
            <div>
                <h2 class="section-title">📈 Analytiques</h2>
                <p class="section-subtitle">Performances sur 30 jours glissants</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" onclick="loadAnalytics()">🔄 Rafraîchir</button>
                <button class="btn btn-primary btn-sm" onclick="showAnalyticsExport()">📊 Exporter CSV</button>
            </div>
        </div>
        <div id="analytics-body">
            <div class="an-loader"><div class="an-spinner"></div> Chargement des données…</div>
        </div>`;
        main.appendChild(panel);
    }

    /* ── Hook showPanel ── */
    const _orig = window.showPanel;
    window.showPanel = function(id) {
        _orig(id);
        if (id === 'analytics') loadAnalytics();
    };
})();


/* ══════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════ */
const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function fmtMoney(n) {
    return Math.round(n).toLocaleString('fr-FR').replace(/\u202F/g,' ') + ' FCFA';
}
function fmtDate(d) {
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
}
function fmtDateShort(d) {
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0');
}

/* Génère un tableau des 30 derniers jours (yyyy-mm-dd) */
function last30Days() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT PRINCIPAL
══════════════════════════════════════════════════════════════════ */
window.loadAnalytics = async function() {
    const body = document.getElementById('analytics-body');
    if (!body) return;
    if (!window.db || !window.currentRestaurant) {
        body.innerHTML = '<div class="an-loader">⚠️ Données restaurant non disponibles.</div>';
        return;
    }

    body.innerHTML = '<div class="an-loader"><div class="an-spinner"></div> Chargement…</div>';

    try {
        const from30 = new Date();
        from30.setDate(from30.getDate() - 29);
        const fromISO = from30.toISOString().split('T')[0];

        /* Requêtes parallèles */
        const [transRes, itemsRes] = await Promise.all([
            db.from('transactions')
              .select('amount, created_at, payment_method, type')
              .eq('restaurant_id', currentRestaurant.id)
              .gte('created_at', fromISO)
              .order('created_at', { ascending: true }),

            db.from('order_items')
              .select('item_name, quantity, orders!inner(restaurant_id, created_at)')
              .eq('orders.restaurant_id', currentRestaurant.id)
              .gte('orders.created_at', fromISO)
              .limit(2000),
        ]);

        const transactions = transRes.data || [];
        const orderItems   = itemsRes.error ? [] : (itemsRes.data || []);

        renderAnalytics(body, transactions, orderItems);

    } catch (e) {
        body.innerHTML = `<div class="an-loader" style="color:var(--danger);">❌ Erreur : ${escapeHTML ? escapeHTML(e.message) : e.message}</div>`;
    }
};


/* ══════════════════════════════════════════════════════════════════
   RENDU
══════════════════════════════════════════════════════════════════ */
function renderAnalytics(body, transactions, orderItems) {

    /* ── 1. Agrégation par jour ── */
    const days = last30Days();
    const byDay = {};
    days.forEach(d => byDay[d] = 0);
    transactions.forEach(t => {
        const day = t.created_at.split('T')[0];
        if (byDay[day] !== undefined) byDay[day] += (t.amount || 0);
    });
    const dailyValues = days.map(d => byDay[d]);
    const maxDay = Math.max(...dailyValues, 1);

    /* ── 2. KPIs globaux ── */
    const total30     = dailyValues.reduce((s, v) => s + v, 0);
    const today       = new Date().toISOString().split('T')[0];
    const todayCA     = byDay[today] || 0;
    const nbTrans     = transactions.length;
    const avgTicket   = nbTrans > 0 ? total30 / nbTrans : 0;
    const bestDayVal  = Math.max(...dailyValues);
    const bestDayIdx  = dailyValues.indexOf(bestDayVal);
    const bestDayDate = days[bestDayIdx] || today;

    /* ── 3. Heatmap (jour×heure) ── */
    const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
    transactions.forEach(t => {
        const dt = new Date(t.created_at);
        heatmap[dt.getDay()][dt.getHours()] += (t.amount || 0);
    });
    const heatMax = Math.max(...heatmap.flat(), 1);

    /* Meilleure heure */
    let bestHour = 0, bestHourVal = 0;
    for (let h = 0; h < 24; h++) {
        const total = heatmap.reduce((s, row) => s + row[h], 0);
        if (total > bestHourVal) { bestHourVal = total; bestHour = h; }
    }

    /* ── 4. Top plats ── */
    const itemCount = {};
    orderItems.forEach(oi => {
        const k = oi.item_name || 'Inconnu';
        itemCount[k] = (itemCount[k] || 0) + (oi.quantity || 1);
    });
    const topItems = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const maxQty = topItems[0]?.[1] || 1;

    /* ── Rendu HTML ── */
    body.innerHTML = `

    <!-- KPIs -->
    <div class="an-grid">
        <div class="an-kpi">
            <div class="an-kpi-lbl">CA 30 jours</div>
            <div class="an-kpi-val">${fmtMoney(total30)}</div>
            <div class="an-kpi-sub">Sur les 30 derniers jours</div>
        </div>
        <div class="an-kpi">
            <div class="an-kpi-lbl">Aujourd'hui</div>
            <div class="an-kpi-val">${fmtMoney(todayCA)}</div>
            <div class="an-kpi-sub">${nbTrans} transaction${nbTrans > 1 ? 's' : ''} au total</div>
        </div>
        <div class="an-kpi">
            <div class="an-kpi-lbl">Ticket moyen</div>
            <div class="an-kpi-val">${fmtMoney(avgTicket)}</div>
            <div class="an-kpi-sub">Par transaction</div>
        </div>
        <div class="an-kpi">
            <div class="an-kpi-lbl">Meilleur jour</div>
            <div class="an-kpi-val">${fmtMoney(bestDayVal)}</div>
            <div class="an-kpi-sub">Le ${fmtDate(bestDayDate)}</div>
        </div>
    </div>

    <!-- Export CSV étendu -->
    <div class="an-export-row">
        <label>Du</label>
        <input type="date" id="an-export-from" class="field-input" style="width:auto;font-size:.8rem;" value="${new Date(Date.now() - 29*86400000).toISOString().split('T')[0]}">
        <label>au</label>
        <input type="date" id="an-export-to" class="field-input" style="width:auto;font-size:.8rem;" value="${today}">
        <button class="btn btn-ghost btn-sm" onclick="exportCSVRange()">📥 Télécharger CSV</button>
    </div>

    <!-- Graphique 30 jours -->
    <div class="an-card">
        <div class="an-card-title">
            Chiffre d'affaires quotidien
            <span class="an-period-badge">30 derniers jours</span>
        </div>
        <div class="an-chart-wrap" id="an-chart"></div>
        <div class="an-x-labels" id="an-xlabels"></div>
    </div>

    <!-- Heatmap heures de pointe -->
    <div class="an-card">
        <div class="an-card-title">
            Heures de pointe
            <span class="an-period-badge">Meilleure heure : ${bestHour}h</span>
        </div>
        <div class="an-heatmap-wrap">
            <div class="an-heatmap" id="an-heatmap"></div>
        </div>
        <div class="an-heatmap-legend">
            <span>Faible</span>
            <div class="an-legend-grad"></div>
            <span>Élevé</span>
        </div>
    </div>

    <!-- Top plats -->
    <div class="an-card">
        <div class="an-card-title">
            Top 5 plats commandés
            <span class="an-period-badge">30 jours</span>
        </div>
        <div id="an-top-items">
            ${topItems.length === 0
                ? '<p style="color:var(--text-dim);font-size:.85rem;">Données non disponibles (table order_items requise).</p>'
                : topItems.map(([name, qty], i) => `
                    <div class="an-top-item">
                        <span class="an-top-rank">${i + 1}</span>
                        <span class="an-top-name">${name.substring(0, 40)}</span>
                        <div class="an-top-bar-wrap">
                            <div class="an-top-bar-fill" style="width:${Math.round(qty/maxQty*100)}%"></div>
                        </div>
                        <span class="an-top-qty">×${qty}</span>
                    </div>`).join('')
            }
        </div>
    </div>`;

    /* ── Barres graphique ── */
    const chartEl   = document.getElementById('an-chart');
    const xlabelsEl = document.getElementById('an-xlabels');

    days.forEach((day, i) => {
        const val  = dailyValues[i];
        const pct  = maxDay > 0 ? Math.round(val / maxDay * 100) : 0;
        const isToday = day === today;

        const col = document.createElement('div');
        col.className = `an-bar-col${isToday ? ' today' : ''}`;
        col.innerHTML = `
            <div class="an-bar" style="height:${Math.max(pct, val > 0 ? 4 : 0)}%">
                <span class="an-bar-tooltip">${fmtDateShort(day)}<br>${fmtMoney(val)}</span>
            </div>`;
        chartEl.appendChild(col);

        const lbl = document.createElement('div');
        lbl.className = `an-x-label${isToday ? ' today' : ''}`;
        /* N'afficher que tous les 5 jours pour lisibilité */
        lbl.textContent = (i % 5 === 0 || isToday) ? fmtDateShort(day) : '';
        xlabelsEl.appendChild(lbl);
    });

    /* ── Heatmap ── */
    buildHeatmap(heatmap, heatMax);

    /* Animation des barres */
    requestAnimationFrame(() => {
        document.querySelectorAll('.an-bar').forEach((bar, i) => {
            bar.style.transition = `height .5s ease ${i * 20}ms`;
        });
    });
}


/* ══════════════════════════════════════════════════════════════════
   HEATMAP
══════════════════════════════════════════════════════════════════ */
function buildHeatmap(heatmap, heatMax) {
    const el = document.getElementById('an-heatmap');
    if (!el) return;

    /* Ligne d'en-tête des heures */
    el.appendChild(Object.assign(document.createElement('div'), { className: 'an-heat-row-lbl' }));
    for (let h = 0; h < 24; h++) {
        const lbl = document.createElement('div');
        lbl.className = 'an-heat-hour-lbl';
        lbl.textContent = h % 3 === 0 ? `${String(h).padStart(2,'0')}h` : '';
        el.appendChild(lbl);
    }

    /* Lignes par jour */
    for (let d = 0; d < 7; d++) {
        const rowLbl = document.createElement('div');
        rowLbl.className = 'an-heat-row-lbl';
        rowLbl.textContent = DAYS_FR[d];
        el.appendChild(rowLbl);

        for (let h = 0; h < 24; h++) {
            const val = heatmap[d][h];
            const intensity = val > 0 ? 0.1 + 0.9 * (val / heatMax) : 0;
            const cell = document.createElement('div');
            cell.className = 'an-heat-cell';
            cell.style.background = `rgba(197,160,89,${intensity.toFixed(2)})`;
            cell.innerHTML = `<span class="an-heat-tip">${DAYS_FR[d]} ${String(h).padStart(2,'0')}h : ${fmtMoney(val)}</span>`;
            el.appendChild(cell);
        }
    }
}


/* ══════════════════════════════════════════════════════════════════
   EXPORT CSV PLAGE DE DATES (corrige le bug "aujourd'hui seulement")
══════════════════════════════════════════════════════════════════ */
window.exportCSVRange = async function() {
    const fromEl = document.getElementById('an-export-from');
    const toEl   = document.getElementById('an-export-to');

    if (!fromEl || !toEl) { toast('Sélectionnez une plage de dates.', 'error'); return; }

    const from = fromEl.value;
    const to   = toEl.value;

    if (!from || !to || from > to) {
        toast('Plage de dates invalide.', 'error');
        return;
    }

    /* toISO inclut toute la journée "to" */
    const toFull = to + 'T23:59:59.999Z';

    toast('Préparation du CSV…', 'info', 2000);

    try {
        const { data: trans, error } = await db
            .from('transactions')
            .select('id, description, amount, payment_method, type, created_at')
            .eq('restaurant_id', currentRestaurant.id)
            .gte('created_at', from)
            .lte('created_at', toFull)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!trans?.length) { toast('Aucune transaction sur cette période.', 'info'); return; }

        const headers = ['N°', 'Description', 'Montant (FCFA)', 'Paiement', 'Type', 'Date', 'Heure'];
        const rows = trans.map(t => [
            t.id?.substring(0, 8) || '',
            t.description || '',
            t.amount,
            t.payment_method,
            t.type,
            t.created_at.split('T')[0],
            new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        ]);

        const csv = [headers, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
        a.download = `transactions-${from}-au-${to}.csv`;
        a.click();
        toast(`✅ ${trans.length} transactions exportées !`, 'success');

    } catch (e) {
        toast('Erreur export : ' + e.message, 'error');
    }
};

/* Exposer showAnalyticsExport pour le bouton du header */
window.showAnalyticsExport = function() {
    /* Scroller jusqu'à la section export */
    const row = document.querySelector('.an-export-row');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
// Re-bind du listener sur le nouveau bouton analytics
const analyticsBtn = document.querySelector('[data-panel="analytics"]');
if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) window.closeMobileSidebar?.();
        window.showPanel('analytics');
    });
}

console.log('✅ admin-analytics-patch.js chargé — Panneau Analytiques, heatmap, graphique 30j, export CSV étendu');
