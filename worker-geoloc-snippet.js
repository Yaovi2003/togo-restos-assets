/**
 * worker-geoloc-snippet.js — Route /api/reverse-geocode
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * POURQUOI un proxy Worker ?
 *  Le CSP du checkout bloque les appels directs à nominatim.openstreetmap.org.
 *  Ce Worker fait l'appel côté serveur et retourne l'adresse proprement.
 *
 * AJOUTER dans le handler fetch du Worker :
 *
 *   const url = new URL(request.url);
 *   const path = url.pathname;
 *
 *   if (path === '/api/reverse-geocode') return handleReverseGeocode(request);
 *   if (path === '/api/distance')        return handleDistance(request);
 *
 * AUCUNE VARIABLE D'ENVIRONNEMENT REQUISE — Nominatim est gratuit.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   GET /api/reverse-geocode?lat=X&lng=Y
   Retourne { address: "Rue Tokoin, Lomé, Togo" }
══════════════════════════════════════════════════════════════════ */
async function handleReverseGeocode(request) {
    const url  = new URL(request.url);
    const lat  = parseFloat(url.searchParams.get('lat'));
    const lng  = parseFloat(url.searchParams.get('lng'));

    /* Validation des coordonnées */
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return _jsonError('Coordonnées invalides.', 400);
    }

    /* Vérification approximative : Togo + zones limitrophes (bbox élargie) */
    const inRegion = lat >= 5.5 && lat <= 11.5 && lng >= -0.2 && lng <= 2.0;
    /* On laisse passer même hors-région pour les tests */

    try {
        const nominatimUrl =
            `https://nominatim.openstreetmap.org/reverse?` +
            `format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr`;

        const res = await fetch(nominatimUrl, {
            headers: {
                'User-Agent':  'RestosLome/1.0 (contact@restos-lome.tg)',
                'Accept':      'application/json',
                'Referer':     'https://restos-lome.tg',
            },
        });

        if (!res.ok) throw new Error(`Nominatim ${res.status}`);

        const data = await res.json();
        const a    = data.address || {};

        /* Construire une adresse lisible pour Lomé / Togo */
        const parts = [
            a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || a.pedestrian,
            a.neighbourhood || a.suburb || a.quarter,
            a.city || a.town || a.village || 'Lomé',
            a.country || 'Togo',
        ].filter(Boolean);

        const address = parts.join(', ');

        return new Response(JSON.stringify({ address, raw: data.display_name }), {
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control':               'private, max-age=3600',
            },
        });

    } catch (e) {
        /* Fallback : retourner les coordonnées formatées */
        return new Response(JSON.stringify({
            address: `${lat.toFixed(5)}°N, ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? 'E' : 'W'} (Lomé)`,
            error:   e.message,
        }), {
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}


/* ══════════════════════════════════════════════════════════════════
   GET /api/distance?rLat=X&rLng=Y&cLat=A&cLng=B
   Retourne { distanceKm, fee, duration }
   Utile pour recalculer les frais côté serveur (validation)
══════════════════════════════════════════════════════════════════ */
async function handleDistance(request) {
    const url  = new URL(request.url);
    const rLat = parseFloat(url.searchParams.get('rLat'));
    const rLng = parseFloat(url.searchParams.get('rLng'));
    const cLat = parseFloat(url.searchParams.get('cLat'));
    const cLng = parseFloat(url.searchParams.get('cLng'));

    if ([rLat, rLng, cLat, cLng].some(isNaN)) {
        return _jsonError('Paramètres manquants.', 400);
    }

    const distKm   = _haversine(rLat, rLng, cLat, cLng);
    const RATE     = 100;   /* FCFA/km */
    const BASE     = 300;
    const FREE_KM  = 1.5;
    const raw      = (distKm - FREE_KM) * RATE + BASE;
    const fee      = distKm > FREE_KM ? Math.ceil(raw / 100) * 100 : 0;
    const duration = Math.round(distKm / 25 * 60); /* 25 km/h moyen à Lomé */

    return new Response(JSON.stringify({
        distanceKm: Math.round(distKm * 10) / 10,
        fee,
        duration,
        durationLabel: duration < 60
            ? `${duration} min`
            : `${Math.floor(duration/60)}h${String(duration%60).padStart(2,'0')}`,
    }), {
        headers: {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

function _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toR = d => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLng = toR(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng/2)**2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function _jsonError(msg, status=400) {
    return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export { handleReverseGeocode, handleDistance };
