/**
 * checkout-geoloc-patch.js — Géolocalisation GPS ultra-précise au checkout
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * FONCTIONNALITÉS :
 *  • Détection GPS automatique (haute précision, erreur < 10 m)
 *  • Géocodage inverse via /api/reverse-geocode (Worker → Nominatim)
 *  • Mini-carte Leaflet avec pin déplaçable (correction manuelle possible)
 *  • Frais de livraison dynamiques selon distance GPS réelle (Haversine)
 *  • Champ adresse pré-rempli + override manuel si livraison ailleurs
 *  • Coordonnées GPS sauvegardées dans orders.customer_lat / customer_lng
 *
 * INTÉGRATION — dans la page checkout, dans <head> :
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css">
 *   <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"></script>
 *   <script src="checkout-geoloc-patch.js"></script>
 *
 * CONFIG (optionnelle, avant le script) :
 *   window.GEOLOC_RATE = 100;    // FCFA par km (défaut 100)
 *   window.GEOLOC_BASE = 300;    // Frais fixe minimum (défaut 300)
 *   window.GEOLOC_FREE_KM = 1.5; // Rayon gratuit en km (défaut 1.5)
 */

'use strict';

/* ── Configuration ── */
const _GEO = {
    rate:    window.GEOLOC_RATE    || 100,    /* FCFA / km */
    base:    window.GEOLOC_BASE    || 300,    /* frais minimum */
    freeKm:  window.GEOLOC_FREE_KM || 1.5,   /* km gratuits autour du resto */
    timeout: 12000,
    maxAge:  0,
};

let _geoMap       = null;    /* instance Leaflet */
let _geoMarker    = null;    /* marqueur client */
let _customerLat  = null;
let _customerLng  = null;
let _restoLat     = null;
let _restoLng     = null;


/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
.geo-zone {
    background: rgba(197,160,89,.06); border: 1px solid rgba(197,160,89,.2);
    border-radius: 12px; padding: 14px 16px; margin-top: 10px;
}
.geo-detect-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--gold, #c5a059); color: #000;
    border: none; padding: 10px 18px; border-radius: 8px;
    font-family: inherit; font-size: .85rem; font-weight: 700;
    cursor: pointer; transition: opacity .2s; margin-bottom: 10px;
}
.geo-detect-btn:hover { opacity: .88; }
.geo-detect-btn:disabled { opacity: .45; pointer-events: none; }

.geo-status {
    font-size: .78rem; color: rgba(255,255,255,.5);
    margin-bottom: 8px; min-height: 18px; display: flex; align-items: center; gap: 6px;
}
.geo-status.ok   { color: #2ecc71; }
.geo-status.err  { color: #e74c3c; }
.geo-status.load { color: rgba(197,160,89,.8); }

.geo-spin { width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(197,160,89,.3);border-top-color:var(--gold,#c5a059);animation:geoSpin .7s linear infinite;flex-shrink:0; }
@keyframes geoSpin{to{transform:rotate(360deg)}}

.geo-map-wrap {
    height: 180px; border-radius: 10px; overflow: hidden;
    margin-bottom: 10px; display: none; border: 1px solid rgba(255,255,255,.1);
}
.geo-map-wrap.show { display: block; }

.geo-addr-row { display: flex; gap: 8px; align-items: flex-start; }
.geo-addr-inp {
    flex: 1; background: rgba(255,255,255,.06);
    border: 1.5px solid rgba(255,255,255,.12); color: #f0ece4;
    padding: 10px 12px; border-radius: 8px;
    font-family: inherit; font-size: .88rem; outline: none;
    transition: border-color .2s; resize: none;
}
.geo-addr-inp:focus { border-color: var(--gold, #c5a059); }

.geo-clear-btn {
    background: none; border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.3);
    padding: 10px 12px; border-radius: 8px; font-size: .75rem; cursor: pointer;
    font-family: inherit; transition: all .15s; white-space: nowrap;
}
.geo-clear-btn:hover { border-color: #e74c3c; color: #e74c3c; }

.geo-fee-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(197,160,89,.1); border: 1px solid rgba(197,160,89,.25);
    border-radius: 20px; padding: 4px 12px;
    font-family: 'IBM Plex Mono', monospace; font-size: .72rem; color: var(--gold, #c5a059);
    margin-top: 6px;
}
.geo-alt-toggle {
    font-size: .75rem; color: rgba(255,255,255,.35); cursor: pointer;
    text-decoration: underline; margin-top: 6px; display: inline-block;
    background: none; border: none; font-family: inherit;
}
.geo-alt-toggle:hover { color: rgba(255,255,255,.6); }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION DANS LE FORMULAIRE
══════════════════════════════════════════════════════════════════ */
function _injectGeoZone() {
    if (document.getElementById('geo-zone')) return;

    const addrCard = document.getElementById('address-field') ||
                     document.querySelector('.card:has(#customer-address)');
    if (!addrCard) return;

    /* Cacher le champ adresse existant (on le remplace) */
    const origAddrInp = document.getElementById('customer-address');
    if (origAddrInp) origAddrInp.closest('.field')?.style?.setProperty('display','none');

    const zone = document.createElement('div');
    zone.id        = 'geo-zone';
    zone.className = 'geo-zone';
    zone.innerHTML = `
        <button class="geo-detect-btn" id="geo-btn" onclick="geoDetect()">
            📍 Détecter ma position automatiquement
        </button>

        <div class="geo-status" id="geo-status"></div>

        <!-- Mini carte Leaflet -->
        <div class="geo-map-wrap" id="geo-map-wrap">
            <div id="geo-map" style="height:100%;"></div>
        </div>

        <!-- Adresse géocodée -->
        <div class="geo-addr-row" id="geo-addr-row" style="display:none;">
            <textarea class="geo-addr-inp" id="geo-addr-inp" rows="2"
                placeholder="Adresse détectée…"
                oninput="_syncGeoAddress(this.value)"></textarea>
            <button class="geo-clear-btn" onclick="geoClear()">✕ Effacer</button>
        </div>

        <div id="geo-fee-wrap" style="display:none;">
            <div class="geo-fee-badge" id="geo-fee-badge">📍 — FCFA · — km</div>
        </div>

        <button class="geo-alt-toggle" id="geo-alt-btn"
            onclick="geoToggleManual()" style="display:none;">
            ✏️ Livrer à une autre adresse
        </button>

        <!-- Champ adresse manuelle (masqué par défaut) -->
        <div id="geo-manual-wrap" style="display:none;margin-top:8px;">
            <textarea class="geo-addr-inp" id="geo-manual-inp" rows="2"
                placeholder="Entrez l'adresse de livraison…" maxlength="200"></textarea>
            <div style="font-size:.72rem;color:rgba(255,255,255,.35);margin-top:4px;">
                Les frais seront calculés manuellement par le livreur.
            </div>
        </div>`;

    addrCard.appendChild(zone);
}


/* ══════════════════════════════════════════════════════════════════
   GÉOLOCALISATION GPS HAUTE PRÉCISION
══════════════════════════════════════════════════════════════════ */
window.geoDetect = async function() {
    const btn    = document.getElementById('geo-btn');
    const status = document.getElementById('geo-status');

    if (!navigator.geolocation) {
        _geoStatus('Géolocalisation non supportée sur cet appareil.', 'err');
        return;
    }

    btn.disabled = true;
    _geoStatus('Localisation en cours…', 'load', true);

    try {
        const pos = await _getHighAccuracyPosition();
        _customerLat = pos.coords.latitude;
        _customerLng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        _geoStatus(`Position détectée — précision ±${accuracy} m`, 'ok');
        _showMap(_customerLat, _customerLng);

        /* Géocodage inverse → adresse lisible */
        await _reverseGeocode(_customerLat, _customerLng);

        /* Calcul frais de livraison */
        if (_restoLat && _restoLng) {
            _updateDeliveryFee(_customerLat, _customerLng);
        }

        document.getElementById('geo-alt-btn').style.display = 'inline-block';

    } catch (err) {
        const msg = err.code === 1 ? 'Permission refusée. Autorisez la localisation dans votre navigateur.'
                  : err.code === 2 ? 'Position indisponible. Vérifiez votre GPS.'
                  : 'Délai dépassé. Réessayez en extérieur.';
        _geoStatus(msg, 'err');
        btn.disabled = false;
    }
};

function _getHighAccuracyPosition() {
    return new Promise((resolve, reject) => {
        /* Première tentative : GPS natif haute précision */
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout:            _GEO.timeout,
            maximumAge:         _GEO.maxAge,
        });
    });
}


/* ══════════════════════════════════════════════════════════════════
   MINI CARTE LEAFLET
══════════════════════════════════════════════════════════════════ */
function _showMap(lat, lng) {
    const wrap = document.getElementById('geo-map-wrap');
    if (!wrap) return;
    wrap.classList.add('show');

    if (!window.L) { console.warn('checkout-geoloc: Leaflet non chargé'); return; }

    if (!_geoMap) {
        _geoMap = L.map('geo-map', { zoomControl: true, attributionControl: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
        }).addTo(_geoMap);
    }

    _geoMap.setView([lat, lng], 17);

    /* Marqueur client (draggable pour correction manuelle) */
    const icon = L.divIcon({
        html: '<div style="background:#c5a059;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
        className: '',
    });

    if (_geoMarker) {
        _geoMarker.setLatLng([lat, lng]);
    } else {
        _geoMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(_geoMap);

        /* Mise à jour sur déplacement du pin */
        _geoMarker.on('dragend', async (e) => {
            const pos = e.target.getLatLng();
            _customerLat = pos.lat;
            _customerLng = pos.lng;
            _geoStatus('Mise à jour de l\'adresse…', 'load', true);
            await _reverseGeocode(_customerLat, _customerLng);
            if (_restoLat && _restoLng) _updateDeliveryFee(_customerLat, _customerLng);
        });
    }

    /* Marqueur restaurant (fixe, bleu) */
    if (_restoLat && _restoLng) {
        const restoIcon = L.divIcon({
            html: '<div style="background:#3498db;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>',
            iconSize: [12, 12], iconAnchor: [6, 6], className: '',
        });
        L.marker([_restoLat, _restoLng], { icon: restoIcon }).addTo(_geoMap)
            .bindTooltip('Restaurant', { permanent: false });

        /* Tracer la ligne entre restaurant et client */
        L.polyline([[_restoLat, _restoLng], [lat, lng]], {
            color: '#c5a059', weight: 1.5, dashArray: '5,5', opacity: .5,
        }).addTo(_geoMap);

        /* Fit bounds */
        _geoMap.fitBounds([[_restoLat, _restoLng], [lat, lng]], { padding: [20, 20] });
    }
}


/* ══════════════════════════════════════════════════════════════════
   GÉOCODAGE INVERSE (via Worker pour contourner le CSP)
══════════════════════════════════════════════════════════════════ */
async function _reverseGeocode(lat, lng) {
    const addrRow = document.getElementById('geo-addr-row');
    const addrInp = document.getElementById('geo-addr-inp');

    try {
        const res = await fetch(
            `${location.origin}/api/reverse-geocode?lat=${lat}&lng=${lng}`
        );
        if (!res.ok) throw new Error('geocode failed');
        const { address } = await res.json();

        if (addrInp) addrInp.value = address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (addrRow) addrRow.style.display = 'flex';

        /* Synchroniser avec le champ original */
        _syncGeoAddress(addrInp?.value || '');
    } catch (_) {
        /* Fallback : coordonnées brutes */
        const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        if (addrInp) addrInp.value = fallback;
        if (addrRow) addrRow.style.display = 'flex';
        _syncGeoAddress(fallback);
    }
}


/* ══════════════════════════════════════════════════════════════════
   CALCUL DES FRAIS DE LIVRAISON
══════════════════════════════════════════════════════════════════ */
function _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const d = (a, b) => (b - a) * Math.PI / 180;
    const a = Math.sin(d(lat1,lat2)/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(d(lng1,lng2)/2)**2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function _updateDeliveryFee(cLat, cLng) {
    const dist    = _haversine(cLat, cLng, _restoLat, _restoLng);
    const distKm  = dist.toFixed(1);
    let   fee     = 0;

    if (dist > _GEO.freeKm) {
        fee = Math.round(_GEO.base + (dist - _GEO.freeKm) * _GEO.rate);
        fee = Math.ceil(fee / 100) * 100; /* Arrondir au 100 FCFA supérieur */
    }

    /* Mettre à jour le badge */
    const badge = document.getElementById('geo-fee-badge');
    const wrap  = document.getElementById('geo-fee-wrap');
    if (badge) badge.textContent = `📍 ${fee > 0 ? fee.toLocaleString('fr-FR') + ' FCFA' : 'Gratuit'} · ${distKm} km`;
    if (wrap) wrap.style.display = 'block';

    /* Mettre à jour les variables globales du checkout */
    try {
        window.deliveryFee = fee;
        const subtotal = Object.values(window.cartData || {})
            .reduce((s, i) => s + i.price * i.qty, 0);
        if (typeof updateTotals === 'function') updateTotals(subtotal);
        if (typeof displaySummary === 'function') displaySummary();
        const dlvDisp = document.getElementById('delivery-display');
        if (dlvDisp) dlvDisp.textContent = fee > 0 ? fee.toLocaleString('fr-FR') + ' FCFA' : 'Gratuit';
    } catch(_) {}
}


/* ══════════════════════════════════════════════════════════════════
   HELPERS UI
══════════════════════════════════════════════════════════════════ */
window._syncGeoAddress = function(val) {
    /* Synchroniser avec le champ original du checkout */
    const orig = document.getElementById('customer-address');
    if (orig) orig.value = val;

    /* Exposer pour le patch Supabase */
    window._geoAddress = val;
};

function _geoStatus(msg, type='', spinner=false) {
    const el = document.getElementById('geo-status');
    if (!el) return;
    el.className = `geo-status ${type}`;
    el.innerHTML = spinner
        ? `<div class="geo-spin"></div>${msg}`
        : msg;
}

window.geoClear = function() {
    _customerLat = null; _customerLng = null;
    document.getElementById('geo-status').textContent = '';
    document.getElementById('geo-addr-row').style.display = 'none';
    document.getElementById('geo-fee-wrap').style.display = 'none';
    document.getElementById('geo-map-wrap').classList.remove('show');
    document.getElementById('geo-alt-btn').style.display = 'none';
    document.getElementById('geo-btn').disabled = false;
    _syncGeoAddress('');
    window.deliveryFee = 0;
};

window.geoToggleManual = function() {
    const manualWrap = document.getElementById('geo-manual-wrap');
    const altBtn     = document.getElementById('geo-alt-btn');
    const isOpen     = manualWrap.style.display !== 'none';
    manualWrap.style.display = isOpen ? 'none' : 'block';
    altBtn.textContent = isOpen ? '✏️ Livrer à une autre adresse' : '← Utiliser ma position GPS';

    if (!isOpen) {
        /* Override : utiliser l'adresse manuelle */
        const manualInp = document.getElementById('geo-manual-inp');
        if (manualInp) {
            manualInp.addEventListener('input', function() {
                _syncGeoAddress(this.value);
                window.deliveryFee = 0; /* Frais manuels */
            }, { once: false });
        }
    } else {
        /* Revenir au GPS */
        _syncGeoAddress(document.getElementById('geo-addr-inp')?.value || '');
        if (_restoLat && _restoLng && _customerLat && _customerLng) {
            _updateDeliveryFee(_customerLat, _customerLng);
        }
    }
};


/* ══════════════════════════════════════════════════════════════════
   PATCH SUPABASE — Injecter lat/lng dans orders.insert()
══════════════════════════════════════════════════════════════════ */
function _patchSupabaseForGeo() {
    const client = window.supabaseClient;
    if (!client || client.__geoPatchApplied) return;
    client.__geoPatchApplied = true;

    const _origFrom = client.from.bind(client);
    client.from = function(tableName) {
        const builder = _origFrom(tableName);
        if (tableName === 'orders') {
            const _origInsert = builder.insert.bind(builder);
            builder.insert = function(data, opts) {
                if (_customerLat && _customerLng) {
                    const patch = { customer_lat: _customerLat, customer_lng: _customerLng };
                    if (Array.isArray(data)) {
                        data = data.map(d => ({ ...d, ...patch }));
                    } else if (data && typeof data === 'object') {
                        data = { ...data, ...patch };
                    }
                }
                return _origInsert(data, opts);
            };
        }
        return builder;
    };
}

/* Attente de supabaseClient */
(function waitAndPatch() {
    let n = 0;
    const t = setInterval(() => {
        n++;
        if (n > 80) { clearInterval(t); return; }
        if (window.supabaseClient) {
            clearInterval(t);
            _patchSupabaseForGeo();
            _loadRestoCoords();
        }
    }, 150);
})();


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DES COORDONNÉES DU RESTAURANT
══════════════════════════════════════════════════════════════════ */
async function _loadRestoCoords() {
    try {
        const params = new URLSearchParams(location.search);
        const slug   = params.get('id') || params.get('slug');
        if (!slug) return;

        const { data } = await window.supabaseClient
            .from('restaurants')
            .select('lat, lng')
            .eq('slug', slug)
            .single();

        if (data?.lat && data?.lng) {
            _restoLat = data.lat;
            _restoLng = data.lng;
        }
    } catch(_) {}
}


/* ══════════════════════════════════════════════════════════════════
   INIT — Uniquement si type de commande = livraison
══════════════════════════════════════════════════════════════════ */
function _onReady() {
    /* Injecter la zone GPS dans le formulaire de livraison */
    _injectGeoZone();

    /* Observer le sélecteur livraison/sur place */
    const observer = new MutationObserver(() => _toggleGeoZone());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    /* Première évaluation */
    _toggleGeoZone();
}

function _toggleGeoZone() {
    const zone       = document.getElementById('geo-zone');
    const addrField  = document.getElementById('address-field');
    if (!zone) return;

    const isLivraison = (window.deliveryType === 'livraison') ||
        document.querySelector('.delivery-option.selected[data-type="livraison"]') !== null;

    zone.style.display  = isLivraison ? 'block' : 'none';
    if (addrField) addrField.style.display = isLivraison ? 'none' : 'block';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _onReady);
} else {
    _onReady();
}

console.log('✅ checkout-geoloc-patch.js chargé — GPS haute précision + frais dynamiques');
