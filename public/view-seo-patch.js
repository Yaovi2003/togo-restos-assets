/**
 * view-seo-patch.js — SEO JSON-LD schema.org pour view.html
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * INJECTE dans le <head> de view.html :
 *  • Schema.org/Restaurant  → nom, adresse, horaires, téléphone, cuisine, image
 *  • Schema.org/Menu        → sections et plats (si disponibles)
 *  • Schema.org/AggregateRating → note moyenne (si table reviews disponible)
 *  • <title> dynamique      → "Akif Fast-Food — Menu & Commande à Lomé | Restos Lomé"
 *  • <meta description>     → description du restaurant
 *  • Open Graph             → og:title, og:description, og:image
 *
 * INTÉGRATION dans view.html — avant </body> :
 *    <script src="view-seo-patch.js"></script>
 *
 * Émettre depuis view.html après chargement du restaurant :
 *    window.dispatchEvent(new CustomEvent('view:seo', {
 *        detail: { restaurant, menuItems, reviews }
 *    }));
 *    // menuItems : tableau de { name, price, category, description }
 *    // reviews   : tableau de { rating } (optionnel)
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════ */
const SEO_SITE_NAME   = 'Restos Lomé';
const SEO_BASE_URL    = location.origin;
const SEO_CITY        = 'Lomé';
const SEO_COUNTRY     = 'TG';
const SEO_REGION      = 'Togo';

/* Mapping jours Supabase → schema.org openingHours */
const DAYS_MAP = {
    lundi:    'Mo', mardi:   'Tu', mercredi: 'We',
    jeudi:    'Th', vendredi:'Fr', samedi:   'Sa', dimanche:'Su',
    monday:   'Mo', tuesday: 'Tu', wednesday:'We',
    thursday: 'Th', friday:  'Fr', saturday: 'Sa', sunday:  'Su',
};


/* ══════════════════════════════════════════════════════════════════
   ÉCOUTE DE L'ÉVÉNEMENT view:seo
══════════════════════════════════════════════════════════════════ */
window.addEventListener('view:seo', (event) => {
    const { restaurant, menuItems = [], reviews = [] } = event.detail || {};
    if (!restaurant) return;
    _applySEO(restaurant, menuItems, reviews);
});

/* Fallback : surveiller window.currentRestaurant */
let _seoApplied = false;
const _seoPoller = setInterval(() => {
    if (_seoApplied) { clearInterval(_seoPoller); return; }
    if (window.currentRestaurant?.id) {
        clearInterval(_seoPoller);
        _applySEO(
            window.currentRestaurant,
            window.currentMenuItems || [],
            window.currentReviews  || []
        );
    }
}, 600);


/* ══════════════════════════════════════════════════════════════════
   FONCTION PRINCIPALE
══════════════════════════════════════════════════════════════════ */
function _applySEO(restaurant, menuItems, reviews) {
    if (_seoApplied) return;
    _seoApplied = true;

    const name        = restaurant.name        || '';
    const description = restaurant.description || `Découvrez le menu de ${name} à ${SEO_CITY}, Togo.`;
    const phone       = restaurant.whatsapp    || restaurant.phone || '';
    const image       = restaurant.logo_url    || restaurant.cover_url || '';
    const slug        = restaurant.slug        || '';
    const cuisine     = restaurant.category    || restaurant.cuisine || 'Togolaise';
    const address     = restaurant.address     || SEO_CITY;
    const pageUrl     = `${SEO_BASE_URL}/view.html?id=${encodeURIComponent(slug)}`;

    /* ── Titre + meta description ── */
    document.title = `${name} — Menu & Commande à ${SEO_CITY} | ${SEO_SITE_NAME}`;

    _setMeta('description', `${description} Commandez en ligne ou sur place.`);

    /* ── Open Graph ── */
    _setOG('og:type',        'restaurant.restaurant');
    _setOG('og:title',       `${name} | ${SEO_SITE_NAME}`);
    _setOG('og:description', description);
    _setOG('og:url',         pageUrl);
    _setOG('og:site_name',   SEO_SITE_NAME);
    if (image) _setOG('og:image', image);

    /* ── Twitter Card ── */
    _setMeta('twitter:card',        'summary_large_image');
    _setMeta('twitter:title',       `${name} | ${SEO_SITE_NAME}`);
    _setMeta('twitter:description', description);
    if (image) _setMeta('twitter:image', image);

    /* ── Canonical URL ── */
    _setLink('canonical', pageUrl);

    /* ── JSON-LD : Restaurant ── */
    const schema = {
        '@context': 'https://schema.org',
        '@type':    'Restaurant',
        '@id':      pageUrl,
        name,
        description,
        url:        pageUrl,
        image:      image || undefined,
        servesCuisine: cuisine,
        priceRange:    restaurant.price_range || '$$',
        address: {
            '@type':           'PostalAddress',
            streetAddress:     address,
            addressLocality:   SEO_CITY,
            addressRegion:     SEO_REGION,
            addressCountry:    SEO_COUNTRY,
        },
    };

    /* Téléphone */
    if (phone) {
        schema.telephone = phone.startsWith('+') ? phone : `+228${phone.replace(/^0/, '')}`;
    }

    /* Horaires d'ouverture */
    const hours = _parseOpeningHours(restaurant.opening_hours);
    if (hours.length) schema.openingHours = hours;

    /* Note moyenne (si reviews disponibles) */
    const validReviews = (reviews || []).filter(r => r.rating >= 1 && r.rating <= 5);
    if (validReviews.length >= 3) {
        const avg = validReviews.reduce((s, r) => s + r.rating, 0) / validReviews.length;
        schema.aggregateRating = {
            '@type':       'AggregateRating',
            ratingValue:   avg.toFixed(1),
            ratingCount:   validReviews.length,
            bestRating:    '5',
            worstRating:   '1',
        };
    }

    /* Menu avec sections et plats */
    if (menuItems?.length) {
        schema.hasMenu = _buildMenuSchema(menuItems, name, pageUrl);
    }

    /* GPS si disponible */
    if (restaurant.lat && restaurant.lng) {
        schema.geo = {
            '@type':    'GeoCoordinates',
            latitude:   restaurant.lat,
            longitude:  restaurant.lng,
        };
    }

    _injectJsonLD(schema);

    /* ── BreadcrumbList ── */
    _injectJsonLD({
        '@context': 'https://schema.org',
        '@type':    'BreadcrumbList',
        itemListElement: [
            { '@type':'ListItem', position:1, name:SEO_SITE_NAME,   item: SEO_BASE_URL          },
            { '@type':'ListItem', position:2, name:'Restaurants',    item: `${SEO_BASE_URL}/`    },
            { '@type':'ListItem', position:3, name,                  item: pageUrl               },
        ],
    });

    console.log('✅ view-seo-patch: JSON-LD injecté pour', name);
}


/* ══════════════════════════════════════════════════════════════════
   PARSING DES HORAIRES
   Entrée attendue (flexible) :
     "Lundi–Vendredi 08:00–22:00, Samedi–Dimanche 10:00–23:00"
     "Tous les jours 08h-22h"
     "7j/7 09:00–23:00"
══════════════════════════════════════════════════════════════════ */
function _parseOpeningHours(raw) {
    if (!raw) return [];
    const results = [];

    /* "7j/7" ou "tous les jours" */
    if (/7j\/7|tous les jours|every day|24h/i.test(raw)) {
        const times = raw.match(/(\d{1,2})[h:](\d{0,2})\s*[-–]\s*(\d{1,2})[h:](\d{0,2})/);
        if (times) {
            const open  = `${times[1].padStart(2,'0')}:${(times[2]||'00').padStart(2,'0')}`;
            const close = `${times[3].padStart(2,'0')}:${(times[4]||'00').padStart(2,'0')}`;
            return [`Mo-Su ${open}-${close}`];
        }
        return ['Mo-Su 08:00-22:00'];
    }

    /* Extraction générique de segments "Jours HH:MM-HH:MM" */
    const segments = raw.split(/[,;]/);
    segments.forEach(seg => {
        seg = seg.trim();
        const timeMatch = seg.match(/(\d{1,2})[h:](\d{0,2})\s*[-–]\s*(\d{1,2})[h:](\d{0,2})/);
        if (!timeMatch) return;

        const open  = `${timeMatch[1].padStart(2,'0')}:${(timeMatch[2]||'00').padStart(2,'0')}`;
        const close = `${timeMatch[3].padStart(2,'0')}:${(timeMatch[4]||'00').padStart(2,'0')}`;

        /* Trouver les jours */
        const daysPart = seg.slice(0, seg.search(/\d/)).toLowerCase();
        const dayAbbrs = [];

        Object.entries(DAYS_MAP).forEach(([fr, schema]) => {
            if (daysPart.includes(fr) && !dayAbbrs.includes(schema)) {
                dayAbbrs.push(schema);
            }
        });

        if (dayAbbrs.length === 0) return;

        /* Construire la plage de jours */
        if (dayAbbrs.length >= 2) {
            results.push(`${dayAbbrs[0]}-${dayAbbrs[dayAbbrs.length-1]} ${open}-${close}`);
        } else {
            results.push(`${dayAbbrs[0]} ${open}-${close}`);
        }
    });

    return results.length ? results : [];
}


/* ══════════════════════════════════════════════════════════════════
   CONSTRUCTION DU SCHEMA MENU
══════════════════════════════════════════════════════════════════ */
function _buildMenuSchema(menuItems, restoName, restoUrl) {
    /* Grouper par catégorie */
    const byCategory = {};
    menuItems.forEach(item => {
        const cat = item.category || 'Menu';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
    });

    const sections = Object.entries(byCategory).map(([catName, items]) => ({
        '@type': 'MenuSection',
        name:    catName,
        hasMenuItem: items.map(item => ({
            '@type':       'MenuItem',
            name:          item.name,
            description:   item.description || undefined,
            offers: {
                '@type': 'Offer',
                price:       String(item.price || 0),
                priceCurrency: 'XOF',
                availability: item.is_available === false
                    ? 'https://schema.org/OutOfStock'
                    : 'https://schema.org/InStock',
            },
            image: item.image_url || undefined,
        })),
    }));

    return {
        '@type':          'Menu',
        name:             `Menu — ${restoName}`,
        url:              restoUrl,
        hasMenuSection:   sections,
    };
}


/* ══════════════════════════════════════════════════════════════════
   HELPERS DOM
══════════════════════════════════════════════════════════════════ */
function _injectJsonLD(schema) {
    const script = document.createElement('script');
    script.type  = 'application/ld+json';
    script.text  = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
}

function _setMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
    el.content = content;
}

function _setOG(property, content) {
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
    el.content = content;
}

function _setLink(rel, href) {
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
    el.href = href;
}

console.log('✅ view-seo-patch.js chargé — JSON-LD schema.org prêt');
