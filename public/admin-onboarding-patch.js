/**
 * admin-onboarding-patch.js — Wizard d'onboarding première connexion
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * AFFICHE UN WIZARD EN 4 ÉTAPES lors de la première connexion :
 *  Étape 1 : Infos restaurant (nom, catégorie, téléphone, horaires)
 *  Étape 2 : Logo (upload via CONFIG.uploadImage)
 *  Étape 3 : Ajouter 3 plats minimum
 *  Étape 4 : QR code généré + félicitations
 *
 * DÉCLENCHEMENT :
 *  Le wizard s'affiche si localStorage['onboarding_done_<restaurantId>'] est absent.
 *  Une fois terminé, la clé est créée et le wizard ne se réaffiche plus jamais.
 *
 * INTÉGRATION dans admin.html — avant </body> :
 *    <script src="admin-onboarding-patch.js"></script>
 *  Et dans initApp(), après currentRestaurant = ... :
 *    window.dispatchEvent(new CustomEvent('admin:ready', {
 *        detail: { restaurantId: profile.restaurant_id }
 *    }));
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
#ob-overlay {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,.85); backdrop-filter: blur(10px);
    display: none; align-items: center; justify-content: center; padding: 20px;
}
#ob-overlay.show { display: flex; }

.ob-box {
    background: var(--surface, #141414);
    border: 1px solid var(--border2, rgba(255,255,255,.14));
    border-radius: 20px; padding: 32px;
    width: 100%; max-width: 480px;
    max-height: 90vh; overflow-y: auto;
    position: relative;
    animation: obIn .35s ease;
}
@keyframes obIn {
    from { opacity:0; transform:translateY(20px) scale(.97); }
    to   { opacity:1; transform:translateY(0)   scale(1);    }
}

.ob-progress {
    display: flex; gap: 6px; margin-bottom: 24px;
}
.ob-dot {
    flex: 1; height: 4px; border-radius: 2px;
    background: rgba(255,255,255,.1); transition: background .3s;
}
.ob-dot.done    { background: var(--gold, #c5a059); }
.ob-dot.current { background: rgba(197,160,89,.5); }

.ob-step { display: none; }
.ob-step.active { display: block; }

.ob-icon   { font-size: 2rem; margin-bottom: 12px; }
.ob-title  {
    font-family: 'Syne', sans-serif; font-size: 1.3rem; font-weight: 700;
    margin-bottom: 6px;
}
.ob-sub    { font-size: .85rem; color: rgba(255,255,255,.5); margin-bottom: 22px; line-height: 1.5; }

.ob-field  { margin-bottom: 14px; }
.ob-field label {
    display: block; font-size: .72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: .07em;
    color: rgba(255,255,255,.4); margin-bottom: 6px;
}
.ob-field input, .ob-field select, .ob-field textarea {
    width: 100%; background: rgba(255,255,255,.05);
    border: 1.5px solid rgba(255,255,255,.1); color: #f0ece4;
    padding: 11px 13px; border-radius: 10px;
    font-family: 'DM Sans', sans-serif; font-size: .9rem; outline: none;
    transition: border-color .2s; resize: none;
}
.ob-field input:focus, .ob-field select:focus, .ob-field textarea:focus {
    border-color: var(--gold, #c5a059);
}
.ob-field select option { background: #1a1715; }

.ob-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media(max-width:420px) { .ob-2col { grid-template-columns: 1fr; } }

/* Logo upload */
.ob-logo-zone {
    border: 2px dashed rgba(255,255,255,.15); border-radius: 12px;
    padding: 24px; text-align: center; cursor: pointer;
    transition: border-color .2s; position: relative;
    min-height: 120px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px;
}
.ob-logo-zone:hover  { border-color: rgba(197,160,89,.4); }
.ob-logo-zone.over   { border-color: var(--gold, #c5a059); background: rgba(197,160,89,.05); }
.ob-logo-zone input  { position:absolute; inset:0; opacity:0; cursor:pointer; }
.ob-logo-preview     { width: 80px; height: 80px; border-radius: 12px; object-fit: cover; display: none; }
.ob-logo-hint        { font-size: .8rem; color: rgba(255,255,255,.35); }
.ob-logo-hint strong { color: var(--gold, #c5a059); }

/* Plats step 3 */
.ob-dish-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.ob-dish-row {
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09);
    border-radius: 10px; padding: 12px 14px;
    display: grid; grid-template-columns: 1fr auto auto;
    gap: 8px; align-items: center;
}
.ob-dish-name  { font-size: .88rem; font-weight: 600; }
.ob-dish-price { font-family: 'IBM Plex Mono', monospace; font-size: .82rem; color: var(--gold, #c5a059); }
.ob-dish-del   {
    background: none; border: none; color: rgba(255,255,255,.2);
    font-size: .85rem; cursor: pointer; padding: 2px 5px; border-radius: 5px;
    transition: all .15s;
}
.ob-dish-del:hover { color: #e74c3c; background: rgba(231,76,60,.12); }

.ob-add-dish-form {
    display: grid; grid-template-columns: 1fr 110px auto;
    gap: 8px; margin-bottom: 8px;
}
@media(max-width:420px) { .ob-add-dish-form { grid-template-columns: 1fr 1fr; } }

/* QR step 4 */
.ob-qr-wrap {
    background: #fff; border-radius: 12px; padding: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    margin: 0 auto 14px; display: flex;
}
.ob-qr-url { font-family: monospace; font-size: .7rem; color: rgba(197,160,89,.6);
    word-break: break-all; text-align: center; margin-bottom: 14px; }

/* Nav buttons */
.ob-nav {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 22px; gap: 10px;
}
.ob-btn-back {
    background: none; border: 1px solid rgba(255,255,255,.12);
    color: rgba(255,255,255,.4); padding: 10px 20px; border-radius: 10px;
    font-size: .85rem; font-weight: 600; cursor: pointer; font-family: inherit;
    transition: all .2s;
}
.ob-btn-back:hover { border-color: rgba(255,255,255,.25); color: rgba(255,255,255,.7); }
.ob-btn-next {
    flex: 1; background: var(--gold, #c5a059); color: #000;
    border: none; padding: 12px 20px; border-radius: 10px;
    font-family: 'Syne', sans-serif; font-size: .92rem; font-weight: 700;
    cursor: pointer; transition: opacity .2s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
}
.ob-btn-next:hover    { opacity: .88; }
.ob-btn-next:disabled { opacity: .4; pointer-events: none; }
.ob-skip {
    text-align: center; margin-top: 12px;
}
.ob-skip-btn {
    background: none; border: none; color: rgba(255,255,255,.25);
    font-size: .75rem; cursor: pointer; font-family: inherit;
    text-decoration: underline; transition: color .2s;
}
.ob-skip-btn:hover { color: rgba(255,255,255,.45); }
.ob-err {
    color: #e74c3c; font-size: .78rem; margin-top: 6px; min-height: 16px;
}
`;
    document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════════
   HTML DU WIZARD
══════════════════════════════════════════════════════════════════ */
function _buildWizardHTML() {
    return `
<div id="ob-overlay">
  <div class="ob-box">

    <!-- Barre de progression -->
    <div class="ob-progress">
        <div class="ob-dot current" id="ob-dot-1"></div>
        <div class="ob-dot"         id="ob-dot-2"></div>
        <div class="ob-dot"         id="ob-dot-3"></div>
        <div class="ob-dot"         id="ob-dot-4"></div>
    </div>

    <!-- ÉTAPE 1 : Infos restaurant -->
    <div class="ob-step active" id="ob-step-1">
        <div class="ob-icon">🍽️</div>
        <h2 class="ob-title">Bienvenue sur Restos Lomé !</h2>
        <p class="ob-sub">Configurez votre restaurant en 4 étapes pour commencer à recevoir des commandes.</p>

        <div class="ob-field">
            <label>Nom du restaurant *</label>
            <input type="text" id="ob-name" placeholder="Ex: Akif Fast-Food" maxlength="100">
        </div>
        <div class="ob-2col">
            <div class="ob-field">
                <label>Catégorie *</label>
                <select id="ob-category">
                    <option value="">— Choisir —</option>
                    <option value="Cuisine togolaise">Cuisine togolaise</option>
                    <option value="Fast-food">Fast-food</option>
                    <option value="Grillades">Grillades</option>
                    <option value="Cuisine internationale">Cuisine internationale</option>
                    <option value="Pizzeria">Pizzeria</option>
                    <option value="Brasserie">Brasserie</option>
                    <option value="Sandwicherie">Sandwicherie</option>
                    <option value="Traiteur">Traiteur</option>
                </select>
            </div>
            <div class="ob-field">
                <label>WhatsApp *</label>
                <input type="tel" id="ob-phone" placeholder="22890010203" maxlength="20">
            </div>
        </div>
        <div class="ob-field">
            <label>Horaires d'ouverture</label>
            <input type="text" id="ob-hours" placeholder="Lundi–Samedi 8h–22h, Dimanche 10h–20h">
        </div>
        <div class="ob-field">
            <label>Description courte</label>
            <textarea id="ob-description" rows="2" placeholder="Spécialités, ambiance, quartier…" maxlength="300"></textarea>
        </div>
        <p class="ob-err" id="ob-err-1"></p>
        <div class="ob-nav">
            <button class="ob-btn-next" onclick="obNext(1)">Continuer → Logo</button>
        </div>
        <div class="ob-skip">
            <button class="ob-skip-btn" onclick="obSkip()">Passer l'assistant pour l'instant</button>
        </div>
    </div>

    <!-- ÉTAPE 2 : Logo -->
    <div class="ob-step" id="ob-step-2">
        <div class="ob-icon">🖼️</div>
        <h2 class="ob-title">Votre logo</h2>
        <p class="ob-sub">Un logo reconnaissable augmente la confiance. Formats acceptés : JPG, PNG, WebP (max 2 Mo).</p>

        <div class="ob-logo-zone" id="ob-logo-zone"
            ondragover="event.preventDefault();this.classList.add('over')"
            ondragleave="this.classList.remove('over')"
            ondrop="obHandleDrop(event)">
            <input type="file" id="ob-logo-file" accept="image/*" onchange="obHandleFile(this.files[0])">
            <img id="ob-logo-preview" class="ob-logo-preview" src="" alt="Preview logo">
            <div id="ob-logo-placeholder">
                <div style="font-size:1.8rem;margin-bottom:8px;">📷</div>
                <p class="ob-logo-hint"><strong>Cliquez ou glissez</strong> votre logo ici</p>
                <p class="ob-logo-hint" style="font-size:.72rem;">JPG, PNG, WebP — max 2 Mo</p>
            </div>
        </div>
        <p class="ob-err" id="ob-err-2"></p>
        <p id="ob-upload-progress" style="font-size:.78rem;color:rgba(197,160,89,.7);margin-top:6px;min-height:18px;"></p>

        <div class="ob-nav">
            <button class="ob-btn-back" onclick="obBack(2)">← Retour</button>
            <button class="ob-btn-next" id="ob-btn-2" onclick="obNext(2)">Continuer → Menu</button>
        </div>
        <div class="ob-skip">
            <button class="ob-skip-btn" onclick="obGoStep(3)">Passer le logo pour l'instant →</button>
        </div>
    </div>

    <!-- ÉTAPE 3 : 3 plats -->
    <div class="ob-step" id="ob-step-3">
        <div class="ob-icon">📋</div>
        <h2 class="ob-title">Ajoutez vos plats</h2>
        <p class="ob-sub">Minimum 3 plats pour activer votre page. Vous pourrez tout modifier dans l'admin.</p>

        <div class="ob-dish-list" id="ob-dish-list"></div>

        <div class="ob-add-dish-form">
            <input type="text" id="ob-dish-name" class="ob-field input" placeholder="Nom du plat *" maxlength="80"
                style="background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.1);color:#f0ece4;padding:10px 12px;border-radius:10px;font-family:inherit;font-size:.88rem;outline:none;width:100%;"
                onkeydown="if(event.key==='Enter')obAddDish()">
            <input type="number" id="ob-dish-price" class="ob-field input" placeholder="Prix FCFA" min="0" max="99999"
                style="background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.1);color:#f0ece4;padding:10px 12px;border-radius:10px;font-family:inherit;font-size:.88rem;outline:none;width:100%;"
                onkeydown="if(event.key==='Enter')obAddDish()">
            <button onclick="obAddDish()"
                style="background:var(--gold,#c5a059);color:#000;border:none;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit;font-size:.85rem;white-space:nowrap;">
                + Ajouter
            </button>
        </div>

        <p class="ob-err" id="ob-err-3"></p>
        <div style="font-size:.72rem;color:rgba(255,255,255,.3);margin-bottom:10px;" id="ob-dish-count">0 / 3 plats ajoutés</div>

        <div class="ob-nav">
            <button class="ob-btn-back" onclick="obBack(3)">← Retour</button>
            <button class="ob-btn-next" id="ob-btn-3" onclick="obNext(3)" disabled>Continuer → QR Code</button>
        </div>
    </div>

    <!-- ÉTAPE 4 : QR Code + succès -->
    <div class="ob-step" id="ob-step-4">
        <div style="text-align:center;">
            <div class="ob-icon">🎉</div>
            <h2 class="ob-title" style="text-align:center;">Votre restaurant est en ligne !</h2>
            <p class="ob-sub" style="text-align:center;">
                Partagez ce QR code ou ce lien avec vos clients pour qu'ils puissent commander.
            </p>

            <div class="ob-qr-wrap" id="ob-qr-wrap">
                <div style="font-size:.8rem;color:#999;">Génération du QR…</div>
            </div>
            <p class="ob-qr-url" id="ob-qr-url">—</p>

            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;">
                <button onclick="obCopyUrl()"
                    style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);padding:8px 18px;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;"
                    id="ob-copy-btn">📋 Copier le lien</button>
                <button onclick="obShareWA()"
                    style="background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.25);color:#25d366;padding:8px 18px;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;">
                    📲 Partager WhatsApp</button>
            </div>
        </div>
        <div class="ob-nav" style="justify-content:center;">
            <button class="ob-btn-next" style="max-width:240px;" onclick="obFinish()">
                🚀 Accéder au tableau de bord
            </button>
        </div>
    </div>

  </div>
</div>`;
}


/* ══════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL DU WIZARD
══════════════════════════════════════════════════════════════════ */
let _obState = {
    step:        1,
    restaurantId: null,
    logoUrl:     null,
    dishes:      [],  /* [{ name, price }] */
    menuUrl:     '',
};


/* ══════════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════════ */
window.obGoStep = function(step) {
    const prev = _obState.step;
    _obState.step = step;

    /* Mettre à jour les steps */
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    const stepEl = document.getElementById(`ob-step-${step}`);
    if (stepEl) stepEl.classList.add('active');

    /* Mettre à jour les dots */
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`ob-dot-${i}`);
        if (!dot) continue;
        dot.className = 'ob-dot ' + (i < step ? 'done' : i === step ? 'current' : '');
    }

    /* Générer QR à l'étape 4 */
    if (step === 4) _generateQR();
};

window.obBack = function(currentStep) { obGoStep(currentStep - 1); };

window.obSkip = function() {
    if (confirm('Vous pouvez configurer votre restaurant plus tard depuis l\'admin. Continuer ?')) {
        _markOnboardingDone();
        document.getElementById('ob-overlay')?.classList.remove('show');
    }
};

window.obFinish = function() {
    _markOnboardingDone();
    document.getElementById('ob-overlay')?.classList.remove('show');
    if (typeof toast === 'function') toast('🎉 Votre restaurant est prêt !', 'success', 5000);
};


/* ══════════════════════════════════════════════════════════════════
   ÉTAPE 1 — Validation et sauvegarde des infos
══════════════════════════════════════════════════════════════════ */
window.obNext = async function(step) {
    const errEl = document.getElementById(`ob-err-${step}`);
    if (errEl) errEl.textContent = '';

    if (step === 1) {
        const name     = document.getElementById('ob-name')?.value.trim();
        const category = document.getElementById('ob-category')?.value;
        const phone    = document.getElementById('ob-phone')?.value.trim().replace(/[^0-9+]/g,'');
        const hours    = document.getElementById('ob-hours')?.value.trim();
        const desc     = document.getElementById('ob-description')?.value.trim();

        if (!name)     { if (errEl) errEl.textContent = 'Nom requis.'; document.getElementById('ob-name')?.focus(); return; }
        if (!category) { if (errEl) errEl.textContent = 'Catégorie requise.'; return; }
        if (!phone || phone.length < 8) { if (errEl) errEl.textContent = 'Téléphone requis (min 8 chiffres).'; return; }

        const btn = document.querySelector('#ob-step-1 .ob-btn-next');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Sauvegarde…'; }

        try {
            const updates = {
                name,
                category,
                whatsapp:      phone,
                opening_hours: hours || null,
                description:   desc  || null,
            };
            const { error } = await db.from('restaurants').update(updates).eq('id', _obState.restaurantId);
            if (error) throw error;

            /* Mettre à jour currentRestaurant localement */
            if (window.currentRestaurant) Object.assign(window.currentRestaurant, updates);

            obGoStep(2);
        } catch (e) {
            if (errEl) errEl.textContent = 'Erreur : ' + e.message;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Continuer → Logo'; }
        }

    } else if (step === 2) {
        /* Logo — sauvegardé en temps réel via obHandleFile */
        obGoStep(3);

    } else if (step === 3) {
        if (_obState.dishes.length < 3) {
            const errEl3 = document.getElementById('ob-err-3');
            if (errEl3) errEl3.textContent = 'Ajoutez au moins 3 plats avant de continuer.';
            return;
        }
        /* Sauvegarder les plats */
        const btn = document.getElementById('ob-btn-3');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Sauvegarde…'; }

        try {
            const rows = _obState.dishes.map(d => ({
                restaurant_id: _obState.restaurantId,
                name:          d.name,
                price:         d.price,
                category:      'Menu',
                is_available:  true,
            }));
            const { error } = await db.from('menu_items').insert(rows);
            if (error) throw error;
            obGoStep(4);
        } catch (e) {
            const errEl3 = document.getElementById('ob-err-3');
            if (errEl3) errEl3.textContent = 'Erreur : ' + e.message;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Continuer → QR Code'; }
        }
    }
};


/* ══════════════════════════════════════════════════════════════════
   LOGO UPLOAD
══════════════════════════════════════════════════════════════════ */
window.obHandleDrop = function(event) {
    event.preventDefault();
    document.getElementById('ob-logo-zone')?.classList.remove('over');
    const file = event.dataTransfer?.files?.[0];
    if (file) obHandleFile(file);
};

window.obHandleFile = async function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
        document.getElementById('ob-err-2').textContent = 'Image trop lourde (max 2 Mo).';
        return;
    }

    /* Preview immédiat */
    const preview = document.getElementById('ob-logo-preview');
    const placeholder = document.getElementById('ob-logo-placeholder');
    if (preview) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    const progress = document.getElementById('ob-upload-progress');
    const btn      = document.getElementById('ob-btn-2');
    if (progress) progress.textContent = '⏳ Upload en cours…';
    if (btn) btn.disabled = true;

    try {
        const logoUrl = await CONFIG.uploadImage(file, `logo-${_obState.restaurantId}`);
        _obState.logoUrl = logoUrl;

        /* Sauvegarder dans Supabase */
        await db.from('restaurants').update({ logo_url: logoUrl }).eq('id', _obState.restaurantId);
        if (window.currentRestaurant) window.currentRestaurant.logo_url = logoUrl;

        if (progress) progress.textContent = '✅ Logo sauvegardé !';
        document.getElementById('ob-err-2').textContent = '';
    } catch (e) {
        if (progress) progress.textContent = '';
        document.getElementById('ob-err-2').textContent = 'Erreur upload : ' + e.message;
    } finally {
        if (btn) btn.disabled = false;
    }
};


/* ══════════════════════════════════════════════════════════════════
   GESTION DES PLATS (Étape 3)
══════════════════════════════════════════════════════════════════ */
window.obAddDish = function() {
    const nameInp  = document.getElementById('ob-dish-name');
    const priceInp = document.getElementById('ob-dish-price');
    const name     = nameInp?.value.trim();
    const price    = parseInt(priceInp?.value || '0', 10);

    if (!name)        { document.getElementById('ob-err-3').textContent = 'Nom du plat requis.'; nameInp?.focus(); return; }
    if (name.length > 80) { document.getElementById('ob-err-3').textContent = 'Nom trop long (max 80 car.).'; return; }
    if (isNaN(price) || price < 0) { document.getElementById('ob-err-3').textContent = 'Prix invalide.'; priceInp?.focus(); return; }
    if (_obState.dishes.length >= 20) { document.getElementById('ob-err-3').textContent = 'Maximum 20 plats dans l\'assistant.'; return; }

    _obState.dishes.push({ name, price });
    if (nameInp) nameInp.value  = '';
    if (priceInp) priceInp.value = '';
    nameInp?.focus();
    document.getElementById('ob-err-3').textContent = '';
    _renderDishes();
};

window.obRemoveDish = function(idx) {
    _obState.dishes.splice(idx, 1);
    _renderDishes();
};

function _renderDishes() {
    const list = document.getElementById('ob-dish-list');
    const count = document.getElementById('ob-dish-count');
    const btn   = document.getElementById('ob-btn-3');
    if (!list) return;

    list.innerHTML = _obState.dishes.map((d, i) => `
        <div class="ob-dish-row">
            <span class="ob-dish-name">${_esc(d.name)}</span>
            <span class="ob-dish-price">${d.price.toLocaleString('fr-FR')} FCFA</span>
            <button class="ob-dish-del" onclick="obRemoveDish(${i})">🗑</button>
        </div>`).join('');

    const n = _obState.dishes.length;
    if (count) count.textContent = `${n} / 3 plats ajoutés${n >= 3 ? ' ✅' : ''}`;
    if (btn)   btn.disabled = n < 3;
}


/* ══════════════════════════════════════════════════════════════════
   QR CODE (Étape 4)
══════════════════════════════════════════════════════════════════ */
function _generateQR() {
    const slug = window.currentRestaurant?.slug || '';
    if (!slug) return;

    const url   = `${location.origin}/view.html?id=${encodeURIComponent(slug)}`;
    _obState.menuUrl = url;

    const urlEl = document.getElementById('ob-qr-url');
    if (urlEl) urlEl.textContent = url;

    const wrap = document.getElementById('ob-qr-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    const loadQR = () => {
        try {
            new QRCode(wrap, {
                text: url, width: 180, height: 180,
                colorDark: '#000000', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M,
            });
        } catch(e) {
            wrap.innerHTML = `<p style="font-size:.75rem;color:#999;">QR indisponible</p>`;
        }
    };

    if (typeof QRCode !== 'undefined') {
        loadQR();
    } else {
        const sc = document.createElement('script');
        sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        sc.onload = loadQR;
        document.head.appendChild(sc);
    }
}

window.obCopyUrl = function() {
    navigator.clipboard.writeText(_obState.menuUrl).then(() => {
        const btn = document.getElementById('ob-copy-btn');
        if (btn) { const o = btn.textContent; btn.textContent = '✅ Copié !'; setTimeout(() => btn.textContent = o, 2000); }
    });
};

window.obShareWA = function() {
    const msg = `🍽️ Commandez chez ${window.currentRestaurant?.name || 'nous'} en ligne !\n👉 ${_obState.menuUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};


/* ══════════════════════════════════════════════════════════════════
   PERSISTANCE
══════════════════════════════════════════════════════════════════ */
function _isOnboardingDone(restaurantId) {
    try { return !!localStorage.getItem(`onboarding_done_${restaurantId}`); } catch(_) { return true; }
}

function _markOnboardingDone() {
    try { localStorage.setItem(`onboarding_done_${_obState.restaurantId}`, '1'); } catch(_) {}
}


/* ══════════════════════════════════════════════════════════════════
   INIT — Écouter admin:ready
══════════════════════════════════════════════════════════════════ */
window.addEventListener('admin:ready', (event) => {
    const restaurantId = event.detail?.restaurantId || window.currentRestaurant?.id;
    if (!restaurantId) return;
    if (_isOnboardingDone(restaurantId)) return;

    _obState.restaurantId = restaurantId;

    /* Injecter le HTML */
    if (!document.getElementById('ob-overlay')) {
        document.body.insertAdjacentHTML('beforeend', _buildWizardHTML());
    }

    /* Pré-remplir avec les données existantes si disponibles */
    const r = window.currentRestaurant;
    if (r) {
        const nameInp = document.getElementById('ob-name');
        const catInp  = document.getElementById('ob-category');
        const phoneInp = document.getElementById('ob-phone');
        if (nameInp  && r.name)     nameInp.value  = r.name;
        if (catInp   && r.category) catInp.value   = r.category;
        if (phoneInp && r.whatsapp) phoneInp.value = r.whatsapp;

        /* Si le restaurant a déjà un logo, passer l'étape 2 */
        if (r.logo_url) {
            _obState.logoUrl = r.logo_url;
            const preview = document.getElementById('ob-logo-preview');
            const placeholder = document.getElementById('ob-logo-placeholder');
            if (preview) { preview.src = r.logo_url; preview.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        }

        /* Si le restaurant a déjà des plats, passer l'étape 3 */
        if (r.menu_count > 0 || r.has_menu) _obState.dishes = [null,null,null]; /* fictif pour bypass */
    }

    /* Afficher le wizard */
    setTimeout(() => {
        document.getElementById('ob-overlay')?.classList.add('show');
    }, 1200);
});


/* ── Helpers ── */
function _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
}

console.log('✅ admin-onboarding-patch.js chargé — wizard 4 étapes');
