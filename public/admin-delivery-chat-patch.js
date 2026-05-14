/**
 * admin-delivery-chat-patch.js — Chat Staff ↔ Livreur dans l'admin
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPLÈTE le système de chat livraison :
 *  • Bouton "💬" sur chaque commande avec livreur assigné
 *  • Badge rouge avec le nombre de messages non lus
 *  • Tiroir de chat (drawer) latéral avec l'historique complet
 *  • Envoi de messages avec sender_role = 'staff'
 *  • Supabase Realtime — messages apparaissent instantanément
 *  • Notification toast + vibration sur nouveau message livreur
 *  • Persistance des messages lus via localStorage
 *
 * INTÉGRATION dans admin.html — avant </body> :
 *   <script src="admin-delivery-chat-patch.js"></script>
 *
 * PRÉREQUIS :
 *   • Table delivery_chats créée (SQL du module logistique)
 *   • admin-delivery-patch.js chargé (pour les boutons d'assignation)
 *   • CSP admin.html doit contenir wss://*.supabase.co dans connect-src
 *   • window.db = supabase.createClient(...) exposé globalement dans admin.html
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   CORRECTIF A — AudioContext et son listener HORS de _init()
   pour éviter l'accumulation de listeners en cas d'appels multiples
══════════════════════════════════════════════════════════════════ */
let _audioCtx = null;
document.addEventListener('click', () => {
    if (!_audioCtx) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) {}
    }
}, { once: false });


/* ══════════════════════════════════════════════════════════════════
   GUARD — BUG 1 : window.db doit exister avant d'initialiser
   Polling toutes les 500 ms, abandon après 30 s
══════════════════════════════════════════════════════════════════ */
(function waitForDB() {
    let attempts = 0;
    const t = setInterval(() => {
        attempts++;
        if (attempts > 60) {
            clearInterval(t);
            console.error('admin-delivery-chat-patch: window.db non disponible après 30 s — vérifiez que supabaseClient est exposé en window.db dans admin.html');
            return;
        }
        if (window.db) {
            clearInterval(t);
            _init();
        }
    }, 500);
})();


/* ══════════════════════════════════════════════════════════════════
   FONCTION PRINCIPALE
   Tout le code applicatif est à l'intérieur pour s'assurer que
   window.db existe. Les variables d'état sont locales à _init()
   sauf _audioCtx (ci-dessus) et les fonctions exposées sur window.
══════════════════════════════════════════════════════════════════ */
function _init() {

/* ── Styles ── */
(function injectCSS() {
    if (document.getElementById('scd-styles')) return;
    const s = document.createElement('style');
    s.id = 'scd-styles';
    s.textContent = `

/* ── Bouton chat sur la ligne de commande ── */
.btn-order-chat {
    position: relative;
    background: rgba(197,160,89,.08);
    border: 1px solid rgba(197,160,89,.2);
    color: var(--gold, #c5a059);
    padding: 5px 10px; border-radius: 6px;
    font-size: .72rem; font-weight: 600;
    cursor: pointer; white-space: nowrap;
    flex-shrink: 0; font-family: inherit;
    transition: all .15s;
}
.btn-order-chat:hover { background: rgba(197,160,89,.16); }

.chat-unread-badge {
    position: absolute; top: -6px; right: -6px;
    background: var(--danger, #e74c3c); color: #fff;
    width: 16px; height: 16px; border-radius: 50%;
    font-size: .6rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--surface, #141414);
    animation: badgePop .3s ease;
    pointer-events: none;
}
@keyframes badgePop {
    0%   { transform: scale(0); }
    60%  { transform: scale(1.3); }
    100% { transform: scale(1); }
}

/* ── Drawer chat ── */
#staff-chat-overlay {
    position: fixed; inset: 0; z-index: 9500;
    background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
    display: none; justify-content: flex-end;
    animation: overlayIn .2s ease;
}
#staff-chat-overlay.show { display: flex; }
@keyframes overlayIn { from{opacity:0} to{opacity:1} }

.staff-chat-drawer {
    width: 100%; max-width: 400px; height: 100%;
    background: var(--surface, #141414);
    border-left: .5px solid rgba(255,255,255,.1);
    display: flex; flex-direction: column;
    animation: drawerIn .25s ease;
    box-shadow: -8px 0 40px rgba(0,0,0,.5);
}
@keyframes drawerIn {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
}

/* ── Header du drawer ── */
.scd-head {
    padding: 16px 18px 14px;
    border-bottom: .5px solid rgba(255,255,255,.08);
    display: flex; align-items: flex-start; gap: 12px;
    flex-shrink: 0;
}
.scd-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(197,160,89,.3), rgba(197,160,89,.1));
    color: var(--gold, #c5a059); font-weight: 700; font-size: .9rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.scd-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; }
.scd-sub   { font-size: .72rem; color: rgba(255,255,255,.4); margin-top: 3px; }
.scd-close {
    margin-left: auto; background: none; border: none;
    color: rgba(255,255,255,.3); font-size: 1.1rem;
    cursor: pointer; padding: 4px 8px; border-radius: 6px;
    transition: all .15s; flex-shrink: 0;
}
.scd-close:hover { color: rgba(255,255,255,.7); background: rgba(255,255,255,.06); }

/* ── Infos commande dans le header ── */
.scd-order-info {
    display: flex; gap: 6px; flex-wrap: wrap;
    padding: 10px 18px; border-bottom: .5px solid rgba(255,255,255,.06);
    flex-shrink: 0; background: rgba(255,255,255,.02);
}
.scd-info-pill {
    background: rgba(255,255,255,.05); border: .5px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 3px 10px;
    font-size: .68rem; color: rgba(255,255,255,.45);
}
.scd-info-pill strong { color: rgba(255,255,255,.7); }

/* ── Zone messages ── */
.scd-messages {
    flex: 1; overflow-y: auto; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
}
.scd-messages::-webkit-scrollbar { width: 3px; }
.scd-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }

.scd-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    color: rgba(255,255,255,.25); font-size: .85rem; text-align: center;
}
.scd-empty-icon { font-size: 2rem; }

/* ── Bulles de messages ── */
.scd-msg {
    max-width: 82%; padding: 8px 12px; border-radius: 10px;
    font-size: .82rem; line-height: 1.5;
}
.scd-msg.staff {
    background: rgba(197,160,89,.12); border: 1px solid rgba(197,160,89,.25);
    color: #f0ece4; align-self: flex-end; border-radius: 10px 10px 2px 10px;
}
.scd-msg.livreur {
    background: rgba(255,255,255,.06); border: .5px solid rgba(255,255,255,.1);
    color: #f0ece4; align-self: flex-start; border-radius: 10px 10px 10px 2px;
}
.scd-msg-meta {
    font-size: .62rem; color: rgba(255,255,255,.3); margin-top: 4px;
    display: flex; align-items: center; gap: 6px;
}
.scd-msg.staff .scd-msg-meta { justify-content: flex-end; }

/* ── Date séparateur ── */
.scd-date-sep {
    text-align: center; font-size: .65rem; color: rgba(255,255,255,.25);
    padding: 4px 0; position: relative;
}
.scd-date-sep::before, .scd-date-sep::after {
    content: ''; position: absolute; top: 50%;
    width: 30%; height: .5px; background: rgba(255,255,255,.08);
}
.scd-date-sep::before { left: 0; }
.scd-date-sep::after  { right: 0; }

/* ── Raccourcis rapides ── */
.scd-shortcuts {
    display: flex; gap: 6px; padding: 8px 16px 4px;
    flex-wrap: wrap; flex-shrink: 0;
    border-top: .5px solid rgba(255,255,255,.05);
}
.scd-shortcut {
    background: rgba(255,255,255,.05); border: .5px solid rgba(255,255,255,.09);
    border-radius: 20px; padding: 4px 12px; font-size: .7rem;
    color: rgba(255,255,255,.45); cursor: pointer; font-family: inherit;
    transition: all .15s; white-space: nowrap;
}
.scd-shortcut:hover {
    background: rgba(197,160,89,.1);
    border-color: rgba(197,160,89,.25);
    color: var(--gold, #c5a059);
}

/* ── Input zone ── */
.scd-input-zone {
    padding: 10px 14px 14px; border-top: .5px solid rgba(255,255,255,.08);
    flex-shrink: 0; background: var(--surface, #141414);
}
.scd-inp-row { display: flex; gap: 8px; }
.scd-inp {
    flex: 1; background: rgba(255,255,255,.06);
    border: 1.5px solid rgba(255,255,255,.1); color: #f0ece4;
    padding: 10px 13px; border-radius: 10px;
    font-family: 'DM Sans', inherit; font-size: .88rem;
    outline: none; transition: border-color .2s; resize: none;
    max-height: 100px;
}
.scd-inp:focus { border-color: var(--gold, #c5a059); }
.scd-send {
    background: var(--gold, #c5a059); color: #000;
    border: none; padding: 10px 16px; border-radius: 10px;
    font-weight: 700; font-size: .88rem; cursor: pointer;
    font-family: inherit; transition: opacity .2s;
    display: flex; align-items: center; gap: 5px; align-self: flex-end;
}
.scd-send:hover { opacity: .88; }
.scd-send:disabled { opacity: .4; pointer-events: none; }

/* ── Notification de nouveau message ── */
.scd-notif-banner {
    background: rgba(197,160,89,.12); border: 1px solid rgba(197,160,89,.3);
    border-radius: 10px; padding: 10px 14px;
    display: flex; align-items: center; gap: 10px;
    margin: 6px 16px; font-size: .8rem; cursor: pointer;
    animation: bannerIn .3s ease; flex-shrink: 0;
}
@keyframes bannerIn {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0);    }
}
.scd-notif-banner:hover { background: rgba(197,160,89,.18); }
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL (local à _init — une seule exécution garantie)
══════════════════════════════════════════════════════════════════ */
let _currentOrderId     = null;
let _currentDriverName  = null;
let _currentDriverPhone = null;
let _chatChannel        = null;
let _globalChannel      = null;
let _globalListenerStarted = false; /* CORRECTIF B — anti-doublon */
let _unreadCounts       = {};
let _lastReadAt         = {};
let _staffName          = '';
let _readKey            = 'staff_chat_read_default'; /* BUG 3 — préfixé par resto */

/* CORRECTIF A — raccourcis sans apostrophes inline dangereuses (BUG A) */
const SHORTCUTS = [
    'En route \u2705',
    'O\u00f9 \u00eates-vous\u00a0?',
    'Le client attend',
    'Probl\u00e8me\u00a0?',
    'Commande pr\u00eate',
    'Reviens au restaurant',
    'Appelle le client',
];

function _updateReadKey() {
    _readKey = `staff_chat_read_${window.currentRestaurant?.id || 'default'}`;
}


/* ══════════════════════════════════════════════════════════════════
   INJECTION DU DRAWER HTML
   CORRECTIF A — les raccourcis utilisent addEventListener,
   pas onclick inline, pour éviter tout problème d'échappement
══════════════════════════════════════════════════════════════════ */
function _injectDrawer() {
    if (document.getElementById('staff-chat-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'staff-chat-overlay';
    overlay.innerHTML = `
        <div class="staff-chat-drawer">

            <!-- Header -->
            <div class="scd-head">
                <div class="scd-avatar" id="scd-avatar">?</div>
                <div>
                    <div class="scd-title" id="scd-title">Chat livreur</div>
                    <div class="scd-sub"   id="scd-sub">—</div>
                </div>
                <button class="scd-close" id="scd-close-btn">✕</button>
            </div>

            <!-- Infos commande -->
            <div class="scd-order-info" id="scd-order-info"></div>

            <!-- Raccourcis -->
            <div class="scd-shortcuts" id="scd-shortcuts"></div>

            <!-- Messages -->
            <div class="scd-messages" id="scd-messages">
                <div class="scd-empty">
                    <div class="scd-empty-icon">💬</div>
                    Chargement…
                </div>
            </div>

            <!-- Zone de saisie -->
            <div class="scd-input-zone">
                <div class="scd-inp-row">
                    <textarea class="scd-inp" id="scd-inp" rows="1"
                        placeholder="Message au livreur…" maxlength="500"></textarea>
                    <button class="scd-send" id="scd-send">↑ Envoyer</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    /* CORRECTIF A — raccourcis via addEventListener, jamais via onclick inline */
    const shortcutsEl = document.getElementById('scd-shortcuts');
    SHORTCUTS.forEach(text => {
        const btn = document.createElement('button');
        btn.className   = 'scd-shortcut';
        btn.textContent = text;
        btn.addEventListener('click', () => staffChatShortcut(text));
        shortcutsEl.appendChild(btn);
    });

    /* Auto-resize textarea */
    const inp = document.getElementById('scd-inp');
    inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            staffChatSend();
        }
    });

    /* Bouton envoyer */
    document.getElementById('scd-send').addEventListener('click', staffChatSend);

    /* Bouton fermer */
    document.getElementById('scd-close-btn').addEventListener('click', staffChatClose);

    /* Fermer sur clic overlay (hors drawer) */
    overlay.addEventListener('click', e => {
        if (e.target === overlay) staffChatClose();
    });
}


/* ══════════════════════════════════════════════════════════════════
   INJECTION DES BOUTONS CHAT SUR LES COMMANDES
   BUG 6 — sélecteur précis sur [data-order-id] uniquement
══════════════════════════════════════════════════════════════════ */
function _injectChatButtons() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel) return;

    /* BUG 6 — sélecteur ciblé, pas de .order-row générique */
    const rows = panel.querySelectorAll('[data-order-id]');
    rows.forEach(row => {
        if (row.querySelector('.btn-order-chat')) return;

        const orderId       = row.dataset.orderId;
        const driverAssigned = row.dataset.deliveryPersonId
            || row.querySelector('[data-driver-id]')?.dataset.driverId;
        if (!orderId || !driverAssigned) return;

        const driverName   = row.querySelector('.driver-name, [data-driver-name]')?.textContent?.trim() || 'Livreur';
        const driverPhone  = row.querySelector('[data-driver-phone]')?.dataset.driverPhone || '';
        const customerName = row.querySelector('.customer-name, [data-customer]')?.textContent?.trim() || 'Client';
        const amount       = row.querySelector('.order-amount, [data-amount]')?.textContent?.trim() || '';

        const btn = document.createElement('button');
        btn.className = 'btn-order-chat';
        btn.dataset.orderId     = orderId;
        btn.dataset.driverName  = driverName;
        btn.dataset.driverPhone = driverPhone;
        btn.dataset.customer    = customerName;
        btn.dataset.amount      = amount;
        btn.textContent = '💬 Chat';

        /* Badge non-lus existants */
        const count = _unreadCounts[orderId] || 0;
        if (count > 0) _setBadgeOnBtn(btn, count);

        btn.addEventListener('click', e => {
            e.stopPropagation();
            staffChatOpen(orderId, driverName, driverPhone, customerName, amount);
        });

        const actions = row.querySelector('.order-actions, .row-actions, td:last-child, .actions');
        (actions || row).appendChild(btn);
    });
}

/* Helper — badge sur un bouton donné */
function _setBadgeOnBtn(btn, count) {
    let badge = btn.querySelector('.chat-unread-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-unread-badge';
            btn.appendChild(badge);
        }
        badge.textContent = count > 9 ? '9+' : count;
    } else {
        badge?.remove();
    }
}


/* ══════════════════════════════════════════════════════════════════
   OUVERTURE DU CHAT
══════════════════════════════════════════════════════════════════ */
window.staffChatOpen = async function(orderId, driverName, driverPhone, customerName, amount) {
    _currentOrderId     = orderId;
    _currentDriverName  = driverName || 'Livreur';
    _currentDriverPhone = driverPhone || '';

    /* Header */
    const initials = _currentDriverName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('scd-avatar').textContent = initials || '🛵';
    document.getElementById('scd-title').textContent  = _currentDriverName;
    document.getElementById('scd-sub').textContent    = driverPhone || 'Chat en direct';

    /* Infos commande */
    const infoEl = document.getElementById('scd-order-info');
    infoEl.innerHTML = [
        customerName && `<span class="scd-info-pill">👤 <strong>${_esc(customerName)}</strong></span>`,
        amount       && `<span class="scd-info-pill">💰 <strong>${_esc(amount)}</strong></span>`,
        `<span class="scd-info-pill">🆔 <strong>#${orderId.substring(0, 8).toUpperCase()}</strong></span>`,
    ].filter(Boolean).join('');

    /* Ouvrir le drawer */
    document.getElementById('staff-chat-overlay').classList.add('show');
    document.getElementById('scd-inp').focus();

    /* Marquer comme lu + vider badge */
    _lastReadAt[orderId] = new Date().toISOString();
    _saveReadAt();
    _updateBadge(orderId, 0);
    delete _unreadCounts[orderId];

    /* Charger les messages */
    await _loadMessages(orderId);

    /* Realtime pour cette commande — unsub précédent d'abord */
    if (_chatChannel) {
        window.db.removeChannel(_chatChannel);
        _chatChannel = null;
    }
    _chatChannel = window.db
        .channel(`staff-chat-${orderId}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public',
            table: 'delivery_chats',
            filter: `order_id=eq.${orderId}`,
        }, payload => {
            _appendMessage(payload.new);
            _lastReadAt[orderId] = new Date().toISOString();
            _saveReadAt();
        })
        .subscribe();
};


/* ══════════════════════════════════════════════════════════════════
   CHARGEMENT DES MESSAGES
══════════════════════════════════════════════════════════════════ */
async function _loadMessages(orderId) {
    const el = document.getElementById('scd-messages');
    el.innerHTML = '<div class="scd-empty"><div class="scd-empty-icon">⏳</div>Chargement…</div>';

    try {
        const { data, error } = await window.db
            .from('delivery_chats')
            .select('id, sender_role, sender_name, message, created_at')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
            .limit(80);

        if (error) throw error;

        el.innerHTML = '';

        if (!data?.length) {
            el.innerHTML = `<div class="scd-empty">
                <div class="scd-empty-icon">💬</div>
                Aucun message. Démarrez la conversation avec le livreur !
            </div>`;
            return;
        }

        let lastDate = null;
        data.forEach(msg => {
            const msgDate = new Date(msg.created_at).toLocaleDateString('fr-FR', {
                weekday: 'short', day: 'numeric', month: 'short',
            });
            if (msgDate !== lastDate) {
                const sep = document.createElement('div');
                sep.className   = 'scd-date-sep';
                sep.textContent = msgDate;
                el.appendChild(sep);
                lastDate = msgDate;
            }
            el.appendChild(_buildMsgEl(msg));
        });

        el.scrollTop = el.scrollHeight;

    } catch (e) {
        el.innerHTML = `<div class="scd-empty" style="color:var(--danger,#e74c3c);">
            <div class="scd-empty-icon">❌</div>Erreur : ${_esc(e.message)}
        </div>`;
    }
}

function _appendMessage(msg) {
    const el = document.getElementById('scd-messages');
    if (!el) return;
    el.querySelector('.scd-empty')?.remove();
    el.appendChild(_buildMsgEl(msg));
    el.scrollTop = el.scrollHeight;
}

function _buildMsgEl(msg) {
    const isStaff = msg.sender_role === 'staff';
    const time    = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const div     = document.createElement('div');
    div.className = `scd-msg ${isStaff ? 'staff' : 'livreur'}`;
    div.innerHTML = `
        <div>${_esc(msg.message)}</div>
        <div class="scd-msg-meta">
            <span>${_esc(msg.sender_name || (isStaff ? 'Staff' : 'Livreur'))}</span>
            <span>${time}</span>
        </div>`;
    return div;
}


/* ══════════════════════════════════════════════════════════════════
   ENVOI DE MESSAGE
══════════════════════════════════════════════════════════════════ */
window.staffChatSend = async function() {
    const inp = document.getElementById('scd-inp');
    const btn = document.getElementById('scd-send');
    const msg = inp.value.trim();
    if (!msg || !_currentOrderId) return;

    const backup = inp.value;
    inp.value = '';
    inp.style.height = 'auto';
    btn.disabled = true;

    try {
        await window.db.from('delivery_chats').insert({
            order_id:    _currentOrderId,
            sender_role: 'staff',
            sender_name: _staffName || window.currentRestaurant?.name || 'Gérant',
            message:     msg,
        });
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur envoi : ' + e.message, 'error');
        inp.value = backup; /* Restituer en cas d'échec */
    } finally {
        btn.disabled = false;
        inp.focus();
    }
};

window.staffChatShortcut = function(text) {
    const inp = document.getElementById('scd-inp');
    if (!inp) return;
    inp.value = text;
    inp.focus();
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
};


/* ══════════════════════════════════════════════════════════════════
   FERMETURE
══════════════════════════════════════════════════════════════════ */
window.staffChatClose = function() {
    document.getElementById('staff-chat-overlay')?.classList.remove('show');
    if (_chatChannel) {
        window.db.removeChannel(_chatChannel);
        _chatChannel = null;
    }
    _currentOrderId = null;
};


/* ══════════════════════════════════════════════════════════════════
   BADGES NON-LUS — écoute globale
   BUG 5  — filtre sender_role côté serveur
   BUG 4  — filtre par order_ids du restaurant (via _adminOrderIds)
   CORRECTIF B — flag _globalListenerStarted contre double abonnement
══════════════════════════════════════════════════════════════════ */
function _startGlobalListener() {
    if (_globalListenerStarted || !window.db) return;
    _globalListenerStarted = true; /* CORRECTIF B */

    _loadUnreadCounts();

    /* BUG 5 — filtre Supabase côté serveur, pas seulement côté client */
    _globalChannel = window.db
        .channel('staff-global-chat')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'delivery_chats',
            filter: 'sender_role=eq.livreur', /* messages livreurs uniquement */
        }, payload => {
            const msg = payload.new;

            /* Drawer ouvert sur cette commande → déjà visible, pas de badge */
            if (msg.order_id === _currentOrderId) return;

            /* BUG 4 — ignorer les commandes d'autres restaurants */
            const knownIds = window._adminOrderIds || [];
            if (knownIds.length && !knownIds.includes(msg.order_id)) return;

            _unreadCounts[msg.order_id] = (_unreadCounts[msg.order_id] || 0) + 1;
            _updateBadge(msg.order_id, _unreadCounts[msg.order_id]);

            if (typeof toast === 'function') {
                toast(`💬 ${_esc(msg.sender_name || 'Livreur')} : ${msg.message.substring(0, 50)}`, 'info', 5000);
            }

            if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);

            _playNotifSound();
        })
        .subscribe();
}

/* BUG 4 — charger les order_ids du restaurant depuis Supabase
   si admin.html ne les expose pas déjà via window._adminOrderIds */
async function _bootstrapAdminOrderIds() {
    if (window._adminOrderIds?.length) return; /* Déjà peuplé par admin.html */
    if (!window.currentRestaurant?.id) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await window.db
            .from('orders')
            .select('id')
            .eq('restaurant_id', window.currentRestaurant.id)
            .gte('created_at', today);
        window._adminOrderIds = (data || []).map(o => o.id);
    } catch (_) {}
}

async function _loadUnreadCounts() {
    try {
        /* S'assurer que les IDs du restaurant sont disponibles */
        await _bootstrapAdminOrderIds();

        const today = new Date().toISOString().split('T')[0];
        const { data } = await window.db
            .from('delivery_chats')
            .select('order_id, created_at')
            .eq('sender_role', 'livreur')
            .gte('created_at', today)
            .order('created_at', { ascending: false });

        _loadReadAt();

        /* BUG 4 — ignorer les commandes hors restaurant courant */
        const knownIds = new Set(window._adminOrderIds || []);

        (data || []).forEach(msg => {
            if (knownIds.size && !knownIds.has(msg.order_id)) return;
            const lastRead = _lastReadAt[msg.order_id];
            if (!lastRead || msg.created_at > lastRead) {
                _unreadCounts[msg.order_id] = (_unreadCounts[msg.order_id] || 0) + 1;
            }
        });

        Object.entries(_unreadCounts).forEach(([orderId, count]) => {
            if (count > 0) _updateBadge(orderId, count);
        });

    } catch (_) {}
}

function _updateBadge(orderId, count) {
    const btn = document.querySelector(`.btn-order-chat[data-order-id="${orderId}"]`);
    if (!btn) return;
    _setBadgeOnBtn(btn, count);
}

/* CORRECTIF A — AudioContext réutilisé, déclaré hors de _init() */
function _playNotifSound() {
    if (!_audioCtx) return; /* Pas encore d'interaction utilisateur */
    try {
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, _audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.3);
    } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════
   PERSISTANCE DES MESSAGES LUS
   BUG 3 — clé localStorage préfixée par l'ID du restaurant
══════════════════════════════════════════════════════════════════ */
function _saveReadAt() {
    try {
        localStorage.setItem(_readKey, JSON.stringify(_lastReadAt));
    } catch (_) {}
}

function _loadReadAt() {
    try {
        _updateReadKey(); /* S'assurer que la clé est à jour */
        const raw = localStorage.getItem(_readKey);
        if (raw) _lastReadAt = JSON.parse(raw);
    } catch (_) {}
}


/* ══════════════════════════════════════════════════════════════════
   OBSERVER — surveille les nouvelles lignes de commandes injectées
══════════════════════════════════════════════════════════════════ */
let _chatObserver = null;

function _startObserver() {
    const panel = document.getElementById('panel-orders-admin');
    if (!panel || _chatObserver) return;
    _chatObserver = new MutationObserver(() => _injectChatButtons());
    _chatObserver.observe(panel, { childList: true, subtree: true });
    _injectChatButtons(); /* Injection initiale */
}


/* ══════════════════════════════════════════════════════════════════
   HOOK showPanel
   BUG 7  — hook initial + poller de rattrapage
   CORRECTIF C — flag __patched appliqué dès le hook initial
               pour que le poller ne l'enveloppe pas une 2e fois
══════════════════════════════════════════════════════════════════ */
function _patchShowPanel(fn) {
    const patched = function(id) {
        fn(id);
        if (id === 'orders-admin') {
            setTimeout(_startObserver, 400);
        }
    };
    patched.__patched = true; /* CORRECTIF C */
    return patched;
}

/* Tentative immédiate si showPanel existe déjà */
if (typeof window.showPanel === 'function' && !window.showPanel.__patched) {
    window.showPanel = _patchShowPanel(window.showPanel);
}

/* Poller de rattrapage si showPanel est défini après ce script */
let _hookAttempts = 0;
const _hookPoller = setInterval(() => {
    _hookAttempts++;
    if (_hookAttempts > 40) { clearInterval(_hookPoller); return; }
    if (typeof window.showPanel === 'function' && !window.showPanel.__patched) {
        window.showPanel = _patchShowPanel(window.showPanel);
        clearInterval(_hookPoller);
    }
}, 250);


/* ══════════════════════════════════════════════════════════════════
   INIT FINAL
   CORRECTIF B — guard contre double appel via admin:ready + poller
══════════════════════════════════════════════════════════════════ */
let _fullyInited = false;

function _doInit() {
    if (_fullyInited) return;
    _fullyInited = true;

    _staffName = window.currentRestaurant?.name || 'Gérant';
    _updateReadKey();
    _injectDrawer();
    _loadReadAt();

    setTimeout(async () => {
        await _bootstrapAdminOrderIds();
        _startGlobalListener();
        _startObserver();
    }, 600);
}

/* Voie 1 — événement admin:ready */
window.addEventListener('admin:ready', _doInit);

/* Voie 2 — fallback polling si admin:ready n'est jamais dispatché */
let _initAttempts = 0;
const _initPoller = setInterval(() => {
    _initAttempts++;
    if (_initAttempts > 30) { clearInterval(_initPoller); return; }
    if (window.currentRestaurant?.id && window.db) {
        clearInterval(_initPoller);
        _doInit();
    }
}, 800);

/* Fermer avec Échap */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') staffChatClose();
});

/* Helper XSS */
function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log('✅ admin-delivery-chat-patch.js v3 chargé — Chat Staff ↔ Livreur complet');

} // fin _init()