/**
 * view-patch.js — Corrections ciblées pour view.html
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * CORRECTIONS :
 *  1. loadEventsView()  — Images plein-format + carte cliquable avec modal détail
 *  2. openEventDetail() — Nouveau : modal de détail événement (image HD + infos)
 *  3. fillMap()         — Itinéraire basé sur GPS ou embed code (pas le nom du resto)
 *  4. CSS              — Pub locale plus haute (220px) + curseur pointer
 *
 * INTÉGRATION :
 *  Ajouter juste avant </body> dans view.html :
 *    <script src="view-patch.js"></script>
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   CSS — Pub locale plus haute
══════════════════════════════════════════════════════════════ */
(function injectAdCSS() {
    const style = document.createElement('style');
    style.textContent = `
        #local-ad img {
            max-height: 220px !important;
            cursor: pointer !important;
            transition: transform .2s, opacity .2s !important;
        }
        #local-ad img:hover { opacity: .92; transform: scale(1.01); }

        /* Carte événement */
        .ev-card {
            background: var(--walnut);
            border: 1px solid var(--gold-border);
            border-radius: var(--r2);
            overflow: hidden;
            margin-bottom: 14px;
            cursor: pointer;
            transition: border-color .2s, transform .2s;
        }
        .ev-card:hover { border-color: var(--gold); transform: translateY(-2px); }
        .ev-card-img  { width: 100%; height: 200px; object-fit: cover; display: block; }
        .ev-card-ph   { width: 100%; height: 80px; background: var(--sepia); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
        .ev-card-img-wrap { position: relative; }
        .ev-card-img-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(to top, rgba(5,4,2,.85) 0%, transparent 55%);
            pointer-events: none;
        }
        .ev-card-badge {
            position: absolute; bottom: 12px; right: 12px;
            background: rgba(5,4,2,.7); border: 1px solid var(--gold-border);
            color: var(--gold); font-size: .62rem; padding: 4px 10px;
            border-radius: 50px; font-family: var(--mono); letter-spacing: .1em;
        }
        .ev-card-body  { padding: 14px 16px 16px; }
        .ev-card-title { font-size: .95rem; color: var(--gold); display: block; margin-bottom: 6px; font-weight: 600; }
        .ev-card-date  { font-size: .76rem; color: var(--ivory-dim); margin-bottom: 4px; }
        .ev-card-desc  {
            font-size: .78rem; color: var(--ivory-muted); line-height: 1.5; margin-top: 6px;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }

        /* Modal détail événement */
        #event-detail-overlay { opacity: 0; transition: opacity .3s; }
        #event-detail-overlay.open { opacity: 1; }
        #event-detail-sheet {
            transform: translateY(100%);
            transition: transform .36s cubic-bezier(.34, 1.56, .64, 1);
        }
        #event-detail-overlay.open #event-detail-sheet { transform: translateY(0); }
    `;
    document.head.appendChild(style);
})();


/* ══════════════════════════════════════════════════════════════
   1. loadEventsView — Images plein-format + click pour détail
══════════════════════════════════════════════════════════════ */
async function loadEventsView() {
    try {
        const { data: events } = await supabaseClient
            .from('events')
            .select('*')
            .eq('restaurant_id', resto.id)
            .eq('is_published', true)
            .gte('event_date', new Date().toISOString())
            .order('event_date', { ascending: true });

        const badge = document.getElementById('badge-events');
        const list  = document.getElementById('events-list-view');

        if (!events?.length) {
            badge.textContent = '0';
            badge.classList.remove('show');
            list.innerHTML = '<p style="color:var(--ivory-muted);text-align:center;padding:20px;">Aucun événement à venir.</p>';
            return;
        }

        badge.textContent = events.length;
        badge.classList.add('show');

        list.innerHTML = events.map(ev => {
            const evDate  = new Date(ev.event_date);
            const dateStr = evDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const timeStr = evDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            // Sérialiser les données pour l'attribut onclick (safe : pas d'exécution de code)
            const evData = encodeURIComponent(JSON.stringify({
                title:       ev.title,
                description: ev.description || '',
                event_date:  ev.event_date,
                poster_url:  ev.poster_url  || '',
                ticket_url:  ev.ticket_url  || ''
            }));

            const imgHtml = ev.poster_url
                ? `<div class="ev-card-img-wrap">
                     <img class="ev-card-img" src="${sanitizeURL(ev.poster_url)}" alt="${escapeHTML(ev.title)}" loading="lazy">
                     <div class="ev-card-img-overlay"></div>
                     <span class="ev-card-badge">🔍 Voir détails</span>
                   </div>`
                : `<div class="ev-card-ph">🎭</div>`;

            return `<div class="ev-card" onclick="openEventDetail('${evData}')">
                ${imgHtml}
                <div class="ev-card-body">
                    <strong class="ev-card-title">${escapeHTML(ev.title)}</strong>
                    <p class="ev-card-date">📅 ${dateStr} &nbsp;·&nbsp; 🕐 ${timeStr}</p>
                    ${ev.description ? `<p class="ev-card-desc">${escapeHTML(ev.description)}</p>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('loadEventsView error:', e);
    }
}


/* ══════════════════════════════════════════════════════════════
   2. openEventDetail — Modal image HD + informations complètes
══════════════════════════════════════════════════════════════ */
function openEventDetail(evJson) {
    try {
        const ev = JSON.parse(decodeURIComponent(evJson));

        // Nettoyer l'éventuelle ancienne modale
        const old = document.getElementById('event-detail-overlay');
        if (old) old.remove();

        const evDate  = new Date(ev.event_date);
        const dateStr = evDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = evDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        const overlay = document.createElement('div');
        overlay.id = 'event-detail-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(5,4,2,.94)',
            backdropFilter: 'blur(12px)',
            zIndex: '1500',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
        });

        const imgSection = ev.poster_url
            ? `<div style="position:relative;width:100%;flex-shrink:0;">
                 <img src="${sanitizeURL(ev.poster_url)}" alt="${escapeHTML(ev.title)}"
                      style="width:100%;max-height:340px;object-fit:cover;display:block;border-radius:24px 24px 0 0;"
                      loading="eager">
                 <div style="position:absolute;inset:0;background:linear-gradient(to top,var(--walnut2) 0%,transparent 55%);
                      border-radius:24px 24px 0 0;pointer-events:none;"></div>
               </div>`
            : '';

        const ticketBtn = ev.ticket_url
            ? `<a href="${sanitizeURL(ev.ticket_url)}" target="_blank" rel="noopener noreferrer"
                  style="flex:1;background:var(--gold);color:var(--ebony);border:none;padding:14px;
                  border-radius:50px;font-family:var(--sans);font-weight:700;font-size:.85rem;
                  letter-spacing:.06em;text-transform:uppercase;text-align:center;
                  display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;">
                  🎟️ Réserver ma place
               </a>`
            : '';

        overlay.innerHTML = `
            <div id="event-detail-sheet"
                 style="background:var(--walnut2);border:1px solid var(--gold-border);border-bottom:none;
                        border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:92vh;
                        overflow-y:auto;display:flex;flex-direction:column;">
                ${imgSection}
                <div style="padding:22px 22px 40px;flex:1;">
                    <div style="width:36px;height:3px;background:var(--line2);border-radius:2px;margin:0 auto 18px;"></div>
                    <h2 style="font-family:var(--serif);font-size:1.65rem;font-weight:300;letter-spacing:.03em;
                                margin-bottom:12px;color:var(--ivory);">
                        ${escapeHTML(ev.title)}
                    </h2>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">
                        <span style="background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold);
                                     padding:5px 13px;border-radius:50px;font-size:.72rem;font-family:var(--mono);">
                            📅 ${dateStr}
                        </span>
                        <span style="background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold);
                                     padding:5px 13px;border-radius:50px;font-size:.72rem;font-family:var(--mono);">
                            🕐 ${timeStr}
                        </span>
                    </div>
                    ${ev.description
                        ? `<p style="font-family:var(--serif);font-size:1.05rem;font-style:italic;font-weight:300;
                                     color:var(--ivory-dim);line-height:1.9;margin-bottom:22px;">
                               ${escapeHTML(ev.description)}
                           </p>`
                        : ''}
                    <div style="display:flex;gap:10px;">
                        ${ticketBtn}
                        <button onclick="document.getElementById('event-detail-overlay').remove();document.body.style.overflow='';"
                                style="flex:${ev.ticket_url ? '0' : '1'};background:var(--sepia);
                                       border:1px solid var(--line);color:var(--ivory-muted);
                                       padding:14px ${ev.ticket_url ? '20px' : '14px'};border-radius:50px;
                                       font-size:.85rem;cursor:pointer;">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>`;

        // Fermer en cliquant l'overlay (en dehors du sheet)
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.remove();
                document.body.style.overflow = '';
            }
        });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        // Animation d'entrée
        requestAnimationFrame(() => {
            overlay.classList.add('open');
        });

    } catch (e) {
        console.error('openEventDetail error:', e);
    }
}


/* ══════════════════════════════════════════════════════════════
   3. fillMap — Itinéraire GPS-first (coords > embed > adresse)
══════════════════════════════════════════════════════════════ */
function fillMap() {
    const r = resto;

    // ── Calcul de l'URL d'itinéraire ────────────────────────────
    // Priorité : coords GPS → embed code → adresse texte
    const lat = r.maps_lat ? parseFloat(r.maps_lat).toFixed(6) : null;
    const lng = r.maps_lng ? parseFloat(r.maps_lng).toFixed(6) : null;
    let mapsUrl = null;

    if (lat && lng) {
        // Coordonnées saisies dans l'admin → itinéraire précis
        mapsUrl = sanitizeURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    } else if (r.maps_embed_code) {
        // Extraire les coordonnées encodées dans l'URL de l'iframe Google Maps
        // Format classique : !3d<lat>!4d<lng>
        const pbMatch = r.maps_embed_code.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
        // Format query string : q=<lat>,<lng>  ou  q=<adresse>
        const qMatch  = r.maps_embed_code.match(/[?&]q=([^&"'\s<>]+)/);
        if (pbMatch) {
            mapsUrl = sanitizeURL(`https://www.google.com/maps/dir/?api=1&destination=${pbMatch[1]},${pbMatch[2]}`);
        } else if (qMatch) {
            mapsUrl = sanitizeURL(`https://www.google.com/maps/dir/?api=1&destination=${qMatch[1]}`);
        }
    }

    // Fallback : adresse texte si aucune coordonnée disponible
    if (!mapsUrl && r.address) {
        mapsUrl = sanitizeURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.address + ', Lomé, Togo')}`);
    }

    // ── Rendu de la carte ────────────────────────────────────────
    const mapCard = document.getElementById('map-card');
    const gpsText = lat && lng ? `GPS : ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : '';

    mapCard.innerHTML = `
        <div class="map-card-inner">
            <div class="map-pin-row">
                <div class="map-pin-ico">📍</div>
                <div>
                    <p class="map-info-name">${escapeHTML(r.name)}</p>
                    <p class="map-info-addr">${escapeHTML(r.address || 'Lomé, Togo')}</p>
                    ${gpsText ? `<p class="map-gps">${escapeHTML(gpsText)}</p>` : ''}
                </div>
            </div>
            <div class="map-actions">
                ${mapsUrl ? `<a class="map-btn-primary" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
                    🗺 Itinéraire →
                </a>` : ''}
                ${r.whatsapp ? `<button class="map-btn-secondary"
                    onclick="window.open('${sanitizeURL('https://wa.me/' + sanitizePhone(r.whatsapp))}','_blank','noopener,noreferrer')">
                    💬 WhatsApp
                </button>` : ''}
            </div>
        </div>`;

    // ── Iframe Google Maps (embed code saisi dans l'admin) ───────
    if (r.maps_embed_code) {
        const raw = r.maps_embed_code.trim();
        if (raw.startsWith('<iframe') && raw.includes('google.com/maps')) {
            const wrap = document.createElement('div');
            wrap.className = 'map-iframe-wrap';
            const tmp = document.createElement('div');
            tmp.innerHTML = raw
                .replace('width="600"', 'width="100%"')
                .replace(/height="[^"]*"/, 'height="240px"');
            const iframeEl = tmp.querySelector('iframe');
            if (iframeEl) {
                iframeEl.removeAttribute('onload');
                iframeEl.removeAttribute('onerror');
                wrap.appendChild(iframeEl);
                mapCard.appendChild(wrap);
            }
        }
    }
}