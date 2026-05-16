/**
 * admin-delivery-pin-patch.js — Gestion PIN livreurs
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * COMPLÈTE admin-delivery-patch.js :
 *  • Bouton "🔒 PIN" sur chaque carte livreur
 *  • Modal pour définir/modifier/supprimer le PIN
 *  • Hash côté client (identique à livreur.html)
 *  • Bouton "📲 Envoyer PIN" → WhatsApp avec le PIN en clair
 *
 * INTÉGRATION dans admin.html — APRÈS admin-delivery-patch.js :
 *   <script src="admin-delivery-pin-patch.js"></script>
 *
 * PRÉREQUIS :
 *   • Migration SQL exécutée (colonne pin_hash sur delivery_persons)
 *   • admin-delivery-patch.js déjà chargé
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    if (document.getElementById('pin-patch-styles')) return;
    const s = document.createElement('style');
    s.id = 'pin-patch-styles';
    s.textContent = `

/* ── Bouton PIN sur la carte livreur ── */
.dlv-pin-btn {
    flex: 1; padding: 6px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,.1); background: transparent;
    color: rgba(255,255,255,.45); font-size: .72rem; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all .15s;
}
.dlv-pin-btn:hover {
    border-color: rgba(197,160,89,.3);
    color: var(--gold, #c5a059);
    background: rgba(197,160,89,.06);
}
.dlv-pin-btn.has-pin {
    border-color: rgba(46,204,113,.25);
    color: #2ecc71;
    background: rgba(46,204,113,.06);
}

/* ── Modal PIN ── */
#pin-modal-overlay {
    position: fixed; inset: 0; z-index: 9800;
    background: rgba(0,0,0,.75); backdrop-filter: blur(8px);
    display: none; align-items: center; justify-content: center; padding: 20px;
}
#pin-modal-overlay.show { display: flex; }

.pin-modal-box {
    background: var(--surface, #141414);
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 18px; padding: 26px 24px;
    width: 100%; max-width: 360px;
    animation: pinBoxIn .25s ease;
}
@keyframes pinBoxIn {
    from { opacity:0; transform: scale(.95) translateY(8px); }
    to   { opacity:1; transform: scale(1)  translateY(0);    }
}

.pin-modal-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
}
.pin-modal-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(197,160,89,.3), rgba(197,160,89,.1));
    color: var(--gold, #c5a059); font-weight: 700; font-size: .95rem;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.pin-modal-title { font-family: 'Syne', sans-serif; font-size: .95rem; font-weight: 700; }
.pin-modal-sub   { font-size: .75rem; color: rgba(255,255,255,.4); margin-top: 3px; }

.pin-modal-label {
    font-size: .75rem; font-weight: 600; color: rgba(255,255,255,.5);
    text-transform: uppercase; letter-spacing: .07em;
    margin-bottom: 8px; display: block;
}

.pin-modal-input {
    width: 100%; background: rgba(255,255,255,.06);
    border: 1.5px solid rgba(255,255,255,.12); color: #f0ece4;
    padding: 13px; border-radius: 10px;
    font-size: 1.6rem; text-align: center; letter-spacing: .4em;
    font-family: 'IBM Plex Mono', monospace;
    outline: none; transition: border-color .2s; margin-bottom: 6px;
}
.pin-modal-input:focus { border-color: var(--gold, #c5a059); }

.pin-modal-hint {
    font-size: .72rem; color: rgba(255,255,255,.3);
    margin-bottom: 16px; line-height: 1.5;
}

.pin-modal-actions {
    display: flex; gap: 8px; flex-direction: column;
}
.pin-modal-btn {
    width: 100%; padding: 12px; border-radius: 10px;
    font-size: .88rem; font-weight: 700; cursor: pointer;
    font-family: inherit; border: none; transition: opacity .15s;
}
.pin-modal-btn:hover { opacity: .88; }
.pin-modal-btn.primary { background: var(--gold, #c5a059); color: #000; }
.pin-modal-btn.wa      { background: rgba(37,211,102,.12); border: 1px solid rgba(37,211,102,.25); color: #25d366; }
.pin-modal-btn.danger  { background: rgba(231,76,60,.1); border: 1px solid rgba(231,76,60,.2); color: #e74c3c; }
.pin-modal-btn.ghost   { background: transparent; border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.4); }

.pin-modal-err {
    font-size: .78rem; color: #e74c3c;
    min-height: 18px; margin-bottom: 8px; text-align: center;
}

.pin-current-status {
    background: rgba(46,204,113,.08); border: 1px solid rgba(46,204,113,.2);
    border-radius: 8px; padding: 8px 12px; margin-bottom: 14px;
    font-size: .78rem; color: #2ecc71; text-align: center;
}
.pin-no-status {
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px; padding: 8px 12px; margin-bottom: 14px;
    font-size: .78rem; color: rgba(255,255,255,.35); text-align: center;
}
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   INJECTION DU MODAL
══════════════════════════════════════════════════════════════════ */
(function injectModal() {
    if (document.getElementById('pin-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="pin-modal-overlay">
        <div class="pin-modal-box">
            <div class="pin-modal-header">
                <div class="pin-modal-avatar" id="pin-modal-avatar">?</div>
                <div>
                    <div class="pin-modal-title" id="pin-modal-title">Code PIN</div>
                    <div class="pin-modal-sub"   id="pin-modal-sub">Livreur</div>
                </div>
            </div>

            <!-- Statut PIN actuel -->
            <div id="pin-current-status-wrap"></div>

            <!-- Saisie nouveau PIN -->
            <label class="pin-modal-label" for="pin-modal-input">Nouveau code PIN (4 chiffres)</label>
            <input  class="pin-modal-input" id="pin-modal-input"
                    type="tel" maxlength="4" placeholder="••••" autocomplete="off"
                    oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            <div class="pin-modal-hint">
                Le livreur devra saisir ce code à chaque ouverture de l'application.<br>
                Laissez vide et cliquez "Supprimer" pour désactiver le PIN.
            </div>

            <div class="pin-modal-err" id="pin-modal-err"></div>

            <div class="pin-modal-actions">
                <button class="pin-modal-btn primary" id="pin-save-btn">🔒 Enregistrer le PIN</button>
                <button class="pin-modal-btn wa"      id="pin-wa-btn"  style="display:none;">📲 Envoyer par WhatsApp</button>
                <button class="pin-modal-btn danger"  id="pin-del-btn" style="display:none;">🗑️ Supprimer le PIN</button>
                <button class="pin-modal-btn ghost"   onclick="closePinModal()">Annuler</button>
            </div>
        </div>
    </div>`);

    /* Fermer sur clic overlay */
    document.getElementById('pin-modal-overlay').addEventListener('click', e => {
        if (e.target.id === 'pin-modal-overlay') closePinModal();
    });

    /* Boutons */
    document.getElementById('pin-save-btn').addEventListener('click', _savePIN);
    document.getElementById('pin-del-btn').addEventListener('click', _deletePIN);
    document.getElementById('pin-wa-btn').addEventListener('click', _sendPINviaWA);

    /* Fermer avec Échap */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePinModal();
    });
})();


/* ══════════════════════════════════════════════════════════════════
   ÉTAT DU MODAL
══════════════════════════════════════════════════════════════════ */
let _pinTarget = null; /* { id, name, phone, pin_hash } */
let _pendingPin = null; /* PIN en clair après save, pour WhatsApp */


/* ══════════════════════════════════════════════════════════════════
   HASH — IDENTIQUE À livreur.html
══════════════════════════════════════════════════════════════════ */
function _simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}


/* ══════════════════════════════════════════════════════════════════
   OUVERTURE DU MODAL
══════════════════════════════════════════════════════════════════ */
window.openPinModal = async function(personId) {
    /* Recharger les données fraîches du livreur depuis Supabase */
    let person = null;
    try {
        const { data, error } = await window.db
            .from('delivery_persons')
            .select('id, name, phone, pin_hash')
            .eq('id', personId)
            .single();
        if (error) throw error;
        person = data;
    } catch (e) {
        if (typeof toast === 'function') toast('Erreur chargement livreur : ' + e.message, 'error');
        return;
    }

    _pinTarget  = person;
    _pendingPin = null;

    /* Remplir le header */
    const initials = person.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('pin-modal-avatar').textContent = initials;
    document.getElementById('pin-modal-title').textContent  = person.name;
    document.getElementById('pin-modal-sub').textContent    = person.phone || 'Livreur';

    /* Statut PIN actuel */
    const wrap = document.getElementById('pin-current-status-wrap');
    if (person.pin_hash) {
        wrap.innerHTML = '<div class="pin-current-status">🔒 PIN actif — le livreur doit saisir son code au démarrage</div>';
        document.getElementById('pin-del-btn').style.display = 'block';
    } else {
        wrap.innerHTML = '<div class="pin-no-status">🔓 Aucun PIN — accès libre au lien livreur</div>';
        document.getElementById('pin-del-btn').style.display = 'none';
    }

    /* Reset */
    document.getElementById('pin-modal-input').value = '';
    document.getElementById('pin-modal-err').textContent  = '';
    document.getElementById('pin-wa-btn').style.display   = 'none';

    document.getElementById('pin-modal-overlay').classList.add('show');
    setTimeout(() => document.getElementById('pin-modal-input').focus(), 200);
};

window.closePinModal = function() {
    document.getElementById('pin-modal-overlay')?.classList.remove('show');
    _pinTarget  = null;
    _pendingPin = null;
};


/* ══════════════════════════════════════════════════════════════════
   ENREGISTRER LE PIN
══════════════════════════════════════════════════════════════════ */
async function _savePIN() {
    const errEl = document.getElementById('pin-modal-err');
    errEl.textContent = '';

    const raw = document.getElementById('pin-modal-input').value.trim();
    if (!raw) { errEl.textContent = 'Saisissez un code à 4 chiffres.'; return; }
    if (!/^\d{4}$/.test(raw)) { errEl.textContent = 'Le PIN doit être exactement 4 chiffres.'; return; }
    if (!_pinTarget) return;

    const hash = _simpleHash(raw);

    const btn = document.getElementById('pin-save-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement…';

    try {
        const { error } = await window.db
            .from('delivery_persons')
            .update({ pin_hash: hash })
            .eq('id', _pinTarget.id);
        if (error) throw error;

        /* Mettre à jour l'état local */
        _pinTarget.pin_hash = hash;
        _pendingPin = raw;

        /* Afficher le bouton WhatsApp si numéro disponible */
        if (_pinTarget.phone) {
            document.getElementById('pin-wa-btn').style.display = 'block';
        }
        document.getElementById('pin-del-btn').style.display = 'block';

        /* Mettre à jour le statut dans le modal */
        document.getElementById('pin-current-status-wrap').innerHTML =
            '<div class="pin-current-status">✅ PIN enregistré — envoyez-le au livreur par WhatsApp</div>';

        document.getElementById('pin-modal-input').value = '';

        /* Mettre à jour le bouton PIN sur la carte */
        _refreshCardPinBtn(_pinTarget.id, true);

        if (typeof toast === 'function') toast(`PIN de ${_pinTarget.name} enregistré !`, 'success');

    } catch (e) {
        errEl.textContent = 'Erreur : ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔒 Enregistrer le PIN';
    }
}


/* ══════════════════════════════════════════════════════════════════
   SUPPRIMER LE PIN
══════════════════════════════════════════════════════════════════ */
async function _deletePIN() {
    if (!_pinTarget) return;
    if (!confirm(`Supprimer le PIN de ${_pinTarget.name} ? Le lien livreur sera accessible sans code.`)) return;

    try {
        const { error } = await window.db
            .from('delivery_persons')
            .update({ pin_hash: null })
            .eq('id', _pinTarget.id);
        if (error) throw error;

        _pinTarget.pin_hash = null;
        _pendingPin = null;

        document.getElementById('pin-current-status-wrap').innerHTML =
            '<div class="pin-no-status">🔓 PIN supprimé — accès libre</div>';
        document.getElementById('pin-del-btn').style.display = 'none';
        document.getElementById('pin-wa-btn').style.display  = 'none';

        _refreshCardPinBtn(_pinTarget.id, false);

        if (typeof toast === 'function') toast(`PIN de ${_pinTarget.name} supprimé.`, 'info');

    } catch (e) {
        document.getElementById('pin-modal-err').textContent = 'Erreur : ' + e.message;
    }
}


/* ══════════════════════════════════════════════════════════════════
   ENVOYER LE PIN PAR WHATSAPP
══════════════════════════════════════════════════════════════════ */
function _sendPINviaWA() {
    if (!_pinTarget?.phone || !_pendingPin) return;
    const phone = _pinTarget.phone.replace(/[^0-9+]/g, '');
    const link  = `${location.origin}/livreur.html?id=${_pinTarget.id}`;
    const msg   =
        `🔒 *Code PIN Restos Lomé*\n\n` +
        `Bonjour ${_pinTarget.name} 👋\n\n` +
        `Votre nouveau code PIN pour accéder à vos courses :\n\n` +
        `*${_pendingPin}*\n\n` +
        `Gardez ce code confidentiel.\n` +
        `👉 Votre lien : ${link}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}


/* ══════════════════════════════════════════════════════════════════
   MISE À JOUR DU BOUTON PIN SUR LA CARTE
   Sans rechargement complet de la grille
══════════════════════════════════════════════════════════════════ */
function _refreshCardPinBtn(personId, hasPin) {
    const btn = document.querySelector(`.dlv-pin-btn[data-person-id="${personId}"]`);
    if (!btn) return;
    if (hasPin) {
        btn.textContent = '🔒 PIN actif';
        btn.classList.add('has-pin');
    } else {
        btn.textContent = '🔓 Définir PIN';
        btn.classList.remove('has-pin');
    }
}


/* ══════════════════════════════════════════════════════════════════
   HOOK _renderDeliveryPersons
   On surcharge la fonction après son exécution pour injecter
   le bouton PIN dans chaque carte sans modifier admin-delivery-patch.js
══════════════════════════════════════════════════════════════════ */
let _pinHookAttempts = 0;
const _pinHookPoller = setInterval(() => {
    _pinHookAttempts++;
    if (_pinHookAttempts > 40) { clearInterval(_pinHookPoller); return; }

    /* Attendre que loadDeliveryPersons soit défini */
    if (typeof window.loadDeliveryPersons !== 'function') return;
    if (window.loadDeliveryPersons.__pinPatched) { clearInterval(_pinHookPoller); return; }

    const _origLoad = window.loadDeliveryPersons;
    window.loadDeliveryPersons = async function() {
        await _origLoad();
        /* Après le rendu des cartes, injecter les boutons PIN */
        _injectPinButtons();
    };
    window.loadDeliveryPersons.__pinPatched = true;
    clearInterval(_pinHookPoller);

}, 250);


/* ══════════════════════════════════════════════════════════════════
   INJECTION DES BOUTONS PIN DANS LES CARTES EXISTANTES
══════════════════════════════════════════════════════════════════ */
async function _injectPinButtons() {
    const grid = document.getElementById('dlv-grid');
    if (!grid) return;

    /* Récupérer les pin_hash actuels */
    const ids = (_deliveryPersons || []).map(p => p.id);
    if (!ids.length) return;

    let pinMap = {}; /* { personId: pin_hash|null } */
    try {
        const { data } = await window.db
            .from('delivery_persons')
            .select('id, pin_hash')
            .in('id', ids);
        (data || []).forEach(p => { pinMap[p.id] = p.pin_hash; });
    } catch (_) {}

    /* Injecter dans chaque carte */
    const cards = grid.querySelectorAll('.dlv-card');
    cards.forEach(card => {
        /* Retrouver l'ID depuis le bouton supprimer déjà présent */
        const delBtn = card.querySelector('.dlv-del-btn');
        if (!delBtn) return;

        /* Extraire l'ID depuis onclick="deleteDeliveryPerson('UUID',...)" */
        const match = delBtn.getAttribute('onclick')?.match(/deleteDeliveryPerson\('([^']+)'/);
        if (!match) return;
        const personId = match[1];

        /* Ne pas injecter deux fois */
        if (card.querySelector('.dlv-pin-btn')) return;

        const hasPin = !!pinMap[personId];
        const pinBtn = document.createElement('button');
        pinBtn.className = `dlv-action-btn dlv-pin-btn${hasPin ? ' has-pin' : ''}`;
        pinBtn.dataset.personId = personId;
        pinBtn.textContent = hasPin ? '🔒 PIN actif' : '🔓 Définir PIN';
        pinBtn.addEventListener('click', () => openPinModal(personId));

        /* Ajouter dans .dlv-actions */
        const actions = card.querySelector('.dlv-actions');
        if (actions) actions.appendChild(pinBtn);
    });
}


console.log('✅ admin-delivery-pin-patch.js chargé — Gestion PIN livreurs');
