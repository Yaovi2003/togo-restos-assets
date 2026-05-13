/**
 * view-skeleton-patch.js — Skeleton loading pour view.html
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * REMPLACE "Chargement…" PAR :
 *  • Skeleton de l'en-tête restaurant (logo + nom + stats)
 *  • Skeleton des onglets de catégories
 *  • Grille de 6 cartes de plats animées
 *
 * UTILISATION :
 *  1. Ajouter dans view.html avant </body> :
 *       <script src="view-skeleton-patch.js"></script>
 *
 *  2. Dans view.html, au début du chargement (avant le fetch Supabase) :
 *       viewSkeleton.show();
 *
 *  3. Quand les données sont prêtes :
 *       viewSkeleton.hide();
 *
 *  OU : Le patch détecte automatiquement les conteneurs connus
 *       (#restaurant-header, #menu-grid, #items-grid, .menu-items…)
 *       et les remplace pendant le chargement.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
const _skeletonCSS = `
@keyframes skShimmer {
    0%   { background-position: -600px 0; }
    100% { background-position:  600px 0; }
}

.sk-base {
    background: linear-gradient(
        90deg,
        rgba(255,255,255,.05) 25%,
        rgba(255,255,255,.10) 50%,
        rgba(255,255,255,.05) 75%
    );
    background-size: 600px 100%;
    animation: skShimmer 1.6s infinite linear;
    border-radius: 6px;
}

/* ── Header skeleton ── */
.sk-header {
    display: flex; align-items: center; gap: 14px;
    padding: 20px; margin-bottom: 16px;
    background: rgba(255,255,255,.03); border-radius: 12px;
    border: 1px solid rgba(255,255,255,.07);
}
.sk-logo   { width: 64px; height: 64px; border-radius: 12px; flex-shrink: 0; }
.sk-info   { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.sk-title  { height: 20px; width: 60%; }
.sk-sub    { height: 13px; width: 40%; }
.sk-stats  { display: flex; gap: 8px; margin-top: 4px; }
.sk-stat   { height: 24px; width: 70px; border-radius: 20px; }

/* ── Tabs skeleton ── */
.sk-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.sk-tab  { height: 32px; border-radius: 20px; }

/* ── Grille de cartes ── */
.sk-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
}
.sk-card {
    background: rgba(255,255,255,.03); border-radius: 12px; overflow: hidden;
    border: 1px solid rgba(255,255,255,.07);
}
.sk-card-img  { width: 100%; height: 120px; }
.sk-card-body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.sk-card-name { height: 14px; width: 80%; }
.sk-card-desc { height: 11px; width: 60%; }
.sk-card-price{ height: 16px; width: 40%; border-radius: 10px; }

/* ── Search skeleton ── */
.sk-search { height: 40px; border-radius: 20px; margin-bottom: 16px; max-width: 300px; }

/* ── Transition de disparition ── */
.sk-container {
    transition: opacity .3s ease;
}
.sk-container.hiding {
    opacity: 0;
    pointer-events: none;
}
`;

(function injectStyles() {
    if (document.getElementById('sk-styles')) return;
    const s    = document.createElement('style');
    s.id       = 'sk-styles';
    s.textContent = _skeletonCSS;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   TEMPLATES
══════════════════════════════════════════════════════════════════ */
function _headerSkeleton() {
    return `<div class="sk-header sk-container" id="sk-header">
    <div class="sk-logo sk-base"></div>
    <div class="sk-info">
        <div class="sk-title sk-base"></div>
        <div class="sk-sub   sk-base"></div>
        <div class="sk-stats">
            <div class="sk-stat sk-base"></div>
            <div class="sk-stat sk-base"></div>
        </div>
    </div>
</div>`;
}

function _tabsSkeleton(count = 5) {
    const widths = [80, 100, 70, 90, 75];
    return `<div class="sk-tabs sk-container" id="sk-tabs">
    ${Array.from({ length: count }, (_, i) =>
        `<div class="sk-tab sk-base" style="width:${widths[i % widths.length]}px"></div>`
    ).join('')}
</div>`;
}

function _searchSkeleton() {
    return `<div class="sk-search sk-base sk-container" id="sk-search"></div>`;
}

function _gridSkeleton(count = 6) {
    return `<div class="sk-grid sk-container" id="sk-grid">
    ${Array.from({ length: count }, () => `
    <div class="sk-card">
        <div class="sk-card-img  sk-base"></div>
        <div class="sk-card-body">
            <div class="sk-card-name  sk-base"></div>
            <div class="sk-card-desc  sk-base"></div>
            <div class="sk-card-price sk-base"></div>
        </div>
    </div>`).join('')}
</div>`;
}


/* ══════════════════════════════════════════════════════════════════
   API PUBLIQUE
══════════════════════════════════════════════════════════════════ */
const viewSkeleton = {

    _targets: [],

    /**
     * Affiche les skeletons dans les conteneurs identifiés.
     * @param {Object} opts - { header, tabs, search, grid, gridCount }
     */
    show(opts = {}) {
        const {
            header     = true,
            tabs       = true,
            search     = false,
            grid       = true,
            gridCount  = 6,
        } = opts;

        /* Chercher le conteneur principal */
        const wrap = _findContainer();
        if (!wrap) { console.warn('view-skeleton: conteneur non trouvé'); return; }

        /* Mémoriser le contenu original et le vider */
        this._targets = [];
        const children = Array.from(wrap.children);

        /* Insérer les skeletons au même endroit */
        const frag = document.createDocumentFragment();

        if (header) {
            const el = document.createElement('div');
            el.innerHTML = _headerSkeleton();
            frag.appendChild(el.firstElementChild);
        }
        if (search) {
            const el = document.createElement('div');
            el.innerHTML = _searchSkeleton();
            frag.appendChild(el.firstElementChild);
        }
        if (tabs) {
            const el = document.createElement('div');
            el.innerHTML = _tabsSkeleton();
            frag.appendChild(el.firstElementChild);
        }
        if (grid) {
            const el = document.createElement('div');
            el.innerHTML = _gridSkeleton(gridCount);
            frag.appendChild(el.firstElementChild);
        }

        /* Masquer le contenu réel sans le supprimer */
        children.forEach(child => {
            this._targets.push({ el: child, display: child.style.display });
            child.style.display = 'none';
        });

        wrap.appendChild(frag);
    },

    /** Retire les skeletons et réaffiche le contenu réel. */
    hide() {
        /* Animation de disparition */
        ['sk-header','sk-search','sk-tabs','sk-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('hiding');
            setTimeout(() => el.remove(), 320);
        });

        /* Réafficher le contenu réel */
        setTimeout(() => {
            this._targets.forEach(({ el, display }) => {
                el.style.display = display || '';
            });
            this._targets = [];
        }, 150);
    },

    /**
     * Remplace directement le contenu d'un élément par un skeleton,
     * puis le restaure. Usage autonome sans besoin de conteneur principal.
     *
     * @param {string} selector  - CSS selector de l'élément cible
     * @param {'header'|'grid'|'tabs'} type
     */
    inject(selector, type = 'grid', opts = {}) {
        const el = document.querySelector(selector);
        if (!el) return;

        const original = el.innerHTML;
        el.innerHTML = type === 'header' ? _headerSkeleton()
                     : type === 'tabs'   ? _tabsSkeleton()
                     : _gridSkeleton(opts.count || 6);

        return () => {
            /* Appeler le retour de fonction pour restaurer */
            const skEl = el.querySelector('.sk-container');
            if (skEl) { skEl.classList.add('hiding'); }
            setTimeout(() => { el.innerHTML = original; }, 320);
        };
    },
};

/* Trouver le conteneur de contenu principal */
function _findContainer() {
    const selectors = [
        '#restaurant-content',
        '#view-content',
        '.restaurant-detail',
        '.menu-container',
        '#main-content',
        'main',
        '.container',
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
    }
    return null;
}


/* ══════════════════════════════════════════════════════════════════
   AUTO-DÉTECTION
   Si view.html expose des fonctions connues, on s'y greffe.
══════════════════════════════════════════════════════════════════ */
(function autoHook() {
    /* Intercepter les fonctions de chargement connues */
    const fnNames = ['loadRestaurant', 'initView', 'loadMenu', 'init'];
    fnNames.forEach(name => {
        if (typeof window[name] !== 'function') return;

        const _orig = window[name];
        window[name] = async function(...args) {
            viewSkeleton.show();
            try {
                const result = await _orig.apply(this, args);
                viewSkeleton.hide();
                return result;
            } catch (e) {
                viewSkeleton.hide();
                throw e;
            }
        };
        console.log(`view-skeleton-patch: hook sur window.${name}`);
    });

    /* Intercepter les mutations du DOM pour détecter le contenu chargé */
    const observer = new MutationObserver(() => {
        const skHeader = document.getElementById('sk-header');
        if (!skHeader) return;

        /* Vérifier si du vrai contenu est apparu */
        const realContent = document.querySelector(
            '#restaurant-name, .resto-name, [data-restaurant-name], h1.name'
        );
        if (realContent?.textContent?.trim()) {
            viewSkeleton.hide();
            observer.disconnect();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const target = _findContainer() || document.body;
            observer.observe(target, { childList: true, subtree: true });
        });
    }
})();


/* Exposer globalement */
window.viewSkeleton = viewSkeleton;

console.log('✅ view-skeleton-patch.js chargé — skeleton loading prêt (window.viewSkeleton)');
