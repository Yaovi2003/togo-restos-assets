/**
 * view-table-patch.js — Mode table pour view.html
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPORTEMENT :
 *  • Si URL contient ?table=N → mode table activé
 *    - Badge "🪑 Table N" affiché en haut de page
 *    - Numéro de table sauvegardé dans sessionStorage
 *    - Lien "Commander" enrichi avec &table=N
 *  • Si URL sans ?table    → mode normal, rien ne change
 *
 * INTÉGRATION dans view.html :
 *  Ajouter avant </body> :
 *    <script src="view-table-patch.js"></script>
 */

'use strict';

const _TABLE_KEY    = 'resto_table';
const _TABLE_SLUG   = 'resto_table_slug';
const _TABLE_REGEX  = /^[a-zA-Z0-9\-_ ]{1,20}$/;

/* ── Lire le numéro de table depuis l'URL ── */
const _tableNum = new URLSearchParams(location.search).get('table');

/* ── Lire le slug du restaurant depuis l'URL ── */
const _restoSlug = new URLSearchParams(location.search).get('id') || '';

/* ══════════════════════════════════════════════════════════════════
   VALIDATION + ACTIVATION
══════════════════════════════════════════════════════════════════ */
if (_tableNum && _TABLE_REGEX.test(_tableNum)) {

    /* Sauvegarder dans sessionStorage (même onglet) */
    try {
        sessionStorage.setItem(_TABLE_KEY, _tableNum);
        if (_restoSlug) sessionStorage.setItem(_TABLE_SLUG, _restoSlug);
    } catch(_) {}

    /* Attendre que le DOM soit prêt */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _onReady);
    } else {
        _onReady();
    }

} else {
    /* Pas de table dans l'URL → nettoyer et mode normal */
    try { sessionStorage.removeItem(_TABLE_KEY); } catch(_) {}
}


/* ══════════════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════════════ */
function _onReady() {
    _injectBadge(_tableNum);
    _injectStyles();
    _patchCheckoutLinks(_tableNum);
    _watchCartButton(_tableNum);
}


/* ══════════════════════════════════════════════════════════════════
   BADGE TABLE
══════════════════════════════════════════════════════════════════ */
function _injectStyles() {
    if (document.getElementById('table-mode-styles')) return;
    const s = document.createElement('style');
    s.id = 'table-mode-styles';
    s.textContent = `
.table-badge-bar {
    position: sticky; top: 0; z-index: 200;
    background: linear-gradient(135deg, rgba(197,160,89,.18), rgba(197,160,89,.08));
    border-bottom: 1px solid rgba(197,160,89,.3);
    backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    gap: 10px; padding: 10px 20px;
    animation: tableBadgeIn .35s ease;
}
@keyframes tableBadgeIn {
    from { opacity:0; transform:translateY(-10px); }
    to   { opacity:1; transform:translateY(0);      }
}
.table-badge-icon {
    font-size: 1.1rem; flex-shrink: 0;
}
.table-badge-text {
    font-family: 'Syne', 'DM Sans', sans-serif;
    font-size: .9rem; font-weight: 700;
    color: #c5a059; letter-spacing: -.01em;
}
.table-badge-sub {
    font-size: .72rem; color: rgba(197,160,89,.7);
    font-weight: 400; margin-left: 4px;
}
.table-badge-chip {
    background: rgba(197,160,89,.15); border: 1px solid rgba(197,160,89,.3);
    border-radius: 20px; padding: 3px 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: .72rem; font-weight: 500; color: #c5a059;
    letter-spacing: .04em; flex-shrink: 0;
}
`;
    document.head.appendChild(s);
}

function _injectBadge(tableNum) {
    if (document.getElementById('table-badge-bar')) return;

    const bar = document.createElement('div');
    bar.id        = 'table-badge-bar';
    bar.className = 'table-badge-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = `
        <span class="table-badge-icon" aria-hidden="true">🪑</span>
        <span class="table-badge-text">
            Table ${_escHTML(tableNum)}
            <span class="table-badge-sub">— commandez directement</span>
        </span>
        <span class="table-badge-chip">Sur place</span>`;

    /* Insérer avant la première nav ou en tête de body */
    const nav = document.querySelector('nav, .site-nav, header, #header, .top-bar');
    if (nav) {
        nav.parentNode.insertBefore(bar, nav);
    } else {
        document.body.prepend(bar);
    }
}


/* ══════════════════════════════════════════════════════════════════
   PATCH DES LIENS CHECKOUT
   Ajoute &table=N aux URL qui pointent vers la page de commande
══════════════════════════════════════════════════════════════════ */
function _patchCheckoutLinks(tableNum) {
    const encoded = encodeURIComponent(tableNum);

    /* Patch des liens <a> existants */
    function patchAnchors() {
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href') || '';
            if (_isCheckoutHref(href) && !href.includes('table=')) {
                const sep = href.includes('?') ? '&' : '?';
                a.setAttribute('href', `${href}${sep}table=${encoded}`);
            }
        });
    }

    patchAnchors();

    /* Surveiller les liens ajoutés dynamiquement */
    const obs = new MutationObserver(patchAnchors);
    obs.observe(document.body, { childList: true, subtree: true });
}

function _isCheckoutHref(href) {
    return href.includes('checkout') ||
           href.includes('order') ||
           href.includes('commander') ||
           (href.includes('index') && href.includes('id=')) ||
           (href.includes('?id=') && !href.includes('view.html') && !href.includes('blog'));
}


/* ══════════════════════════════════════════════════════════════════
   SURVEILLANCE DU BOUTON PANIER
   Pour les boutons créés dynamiquement (onclick, window.location, etc.)
══════════════════════════════════════════════════════════════════ */
function _watchCartButton(tableNum) {
    const encoded = encodeURIComponent(tableNum);

    /* Intercepter window.location.href et window.location.assign */
    const _origAssign   = window.location.assign.bind(window.location);
    const _origReplace  = window.location.replace.bind(window.location);

    Object.defineProperty(window.location, 'href', {
        set(url) {
            if (_isCheckoutHref(url) && !url.includes('table=')) {
                const sep = url.includes('?') ? '&' : '?';
                url = `${url}${sep}table=${encoded}`;
            }
            window.location.assign(url);
        }
    });

    /* Intercepter les clics sur boutons de commande */
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, a');
        if (!btn) return;

        const text = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
        const isOrderBtn = text.includes('commander') || text.includes('order') ||
                           text.includes('checkout') || text.includes('panier') ||
                           btn.id?.toLowerCase().includes('checkout') ||
                           btn.id?.toLowerCase().includes('order') ||
                           btn.className?.toLowerCase().includes('checkout');

        if (isOrderBtn) {
            /* Stocker table avant la navigation */
            try {
                sessionStorage.setItem(_TABLE_KEY, tableNum);
            } catch(_) {}
        }
    }, true /* capture phase */);
}


/* ── Helpers ── */
function _escHTML(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log(`✅ view-table-patch.js — Mode table : ${_tableNum ? `Table "${_tableNum}" activée` : 'inactif (pas de ?table=)'}`);
