 /**
 * admin-patch.js — Améliorations admin
 * Plateforme Restaurants Togo · Jo D. Digital
 *
 * CORRECTIONS / NOUVELLES FONCTIONNALITÉS :
 *  1. Événements  — Upload image via Worker (plus d'URL manuelle cassée)
 *  2. Pub locale  — Upload image via Worker
 *  3. Stock       — Version avancée : mouvements, catégories, historique, valeur totale
 *  4. Comptabilité — Version avancée : dépenses, P&L, graphique paiements, filtres
 *
 * INTÉGRATION :
 *  Ajouter juste avant </body> dans admin.html :
 *    <script src="admin-patch.js"></script>
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   CSS COMMUN
══════════════════════════════════════════════════════════════════ */
(function(){
const s=document.createElement('style');
s.textContent=`
/* Upload zone réutilisable */
.ap-upload-zone{border:2px dashed rgba(255,255,255,.12);border-radius:12px;padding:22px;text-align:center;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;background:rgba(255,255,255,.02);}
.ap-upload-zone:hover,.ap-upload-zone.dragover{border-color:#c5a059;background:rgba(197,160,89,.08);}
.ap-upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;}
.ap-upload-zone p{font-size:.82rem;color:#7a7570;margin-top:6px;}
.ap-upload-zone strong{color:#c5a059;}
.ap-preview-wrap{margin-top:10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden;}
.ap-preview-wrap img{width:100%;max-height:180px;object-fit:cover;display:block;}
.ap-preview-info{padding:6px 12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.03);font-size:.72rem;color:#7a7570;}
.ap-progress{margin-top:8px;}
.ap-progress-bar{height:5px;background:#222;border-radius:3px;overflow:hidden;}
.ap-progress-fill{height:100%;background:#c5a059;border-radius:3px;transition:width .3s;width:0%;}
.ap-progress-lbl{font-size:.7rem;color:#7a7570;margin-top:4px;}

/* Stock avancé */
.stock-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}
.stock-kpi{background:#141414;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:16px;}
.stock-kpi-lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.07em;color:#7a7570;margin-bottom:6px;}
.stock-kpi-val{font-family:'IBM Plex Mono',monospace;font-size:1.4rem;font-weight:700;color:#c5a059;}
.stock-kpi-sub{font-size:.68rem;color:#4a4642;margin-top:3px;}
.stock-alert-banner{background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:.82rem;}
.movement-type-btn{padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.12);font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;}
.movement-type-btn.in{background:rgba(46,204,113,.12);color:#2ecc71;border-color:rgba(46,204,113,.25);}
.movement-type-btn.in.active{background:rgba(46,204,113,.25);}
.movement-type-btn.out{background:rgba(231,76,60,.1);color:#e74c3c;border-color:rgba(231,76,60,.2);}
.movement-type-btn.out.active{background:rgba(231,76,60,.2);}
.history-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.78rem;}
.history-badge{padding:2px 8px;border-radius:4px;font-size:.68rem;font-weight:600;}
.history-badge.in{background:rgba(46,204,113,.12);color:#2ecc71;}
.history-badge.out{background:rgba(231,76,60,.1);color:#e74c3c;}

/* Comptabilité avancée */
.acc-tabs{display:flex;gap:4px;background:#141414;border-radius:10px;padding:4px;margin-bottom:20px;}
.acc-tab{flex:1;padding:8px;text-align:center;border-radius:7px;font-size:.75rem;font-weight:600;cursor:pointer;border:none;background:transparent;color:#7a7570;transition:all .2s;}
.acc-tab.active{background:#c5a059;color:#000;}
.acc-section{display:none;}
.acc-section.active{display:block;}
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:80px;margin:12px 0;}
.bar-chart-bar{flex:1;border-radius:4px 4px 0 0;transition:height .5s ease;min-height:3px;position:relative;}
.bar-chart-bar span{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.55rem;color:#7a7570;white-space:nowrap;}
.payment-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.payment-bar-row span:first-child{width:60px;font-size:.72rem;color:#7a7570;}
.payment-bar-track{flex:1;height:8px;background:#222;border-radius:4px;overflow:hidden;}
.payment-bar-fill{height:100%;border-radius:4px;transition:width .5s ease;}
.expense-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.8rem;}
.expense-row-lbl{flex:1;}
.expense-row-amt{font-family:'IBM Plex Mono',monospace;color:#e74c3c;font-size:.82rem;}
@media(max-width:768px){.stock-kpi-grid{grid-template-columns:1fr 1fr;}}
`;
document.head.appendChild(s);
})();

/* ══════════════════════════════════════════════════════════════════
   HELPERS UPLOAD IMAGE (partagés)
══════════════════════════════════════════════════════════════════ */
function buildUploadZone(containerId,previewId,progressId,urlFieldId,accept='image/jpeg,image/png,image/webp'){
    const zone=document.getElementById(containerId);
    if(!zone)return null;
    const preview=document.getElementById(previewId);
    const progress=document.getElementById(progressId);
    const urlField=document.getElementById(urlFieldId);
    let pendingFile=null;

    function handleFile(f){
        if(!f.type.startsWith('image/')){toast('Format non supporté','error');return;}
        if(f.size>5*1024*1024){toast('Image trop lourde (max 5 MB)','error');return;}
        pendingFile=f;
        const r=new FileReader();
        r.onload=e=>{
            preview.querySelector('img').src=e.target.result;
            preview.querySelector('span').textContent=f.name;
            preview.style.display='block';
        };
        r.readAsDataURL(f);
    }

    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');const f=e.dataTransfer.files[0];if(f)handleFile(f);});
    zone.querySelector('input[type=file]').addEventListener('change',function(){if(this.files[0])handleFile(this.files[0]);});

    return{
        hasPending:()=>!!pendingFile,
        doUpload:async()=>{
            if(!pendingFile)return null;
            progress.style.display='block';
            progress.querySelector('.ap-progress-fill').style.width='30%';
            progress.querySelector('.ap-progress-lbl').textContent='Upload en cours…';
            try{
                const safeName=pendingFile.name.replace(/\.[^/.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').substring(0,60)||'image';
                const url=await CONFIG.uploadImage(pendingFile,safeName);
                progress.querySelector('.ap-progress-fill').style.width='100%';
                progress.querySelector('.ap-progress-lbl').textContent='✅ Upload terminé !';
                if(urlField)urlField.value=url;
                return url;
            }catch(err){
                progress.querySelector('.ap-progress-lbl').textContent='❌ '+err.message;
                toast('Erreur upload : '+err.message,'error');
                return null;
            }finally{setTimeout(()=>{progress.style.display='none';progress.querySelector('.ap-progress-fill').style.width='0%';},2500);}
        }
    };
}

/* ══════════════════════════════════════════════════════════════════
   1. ÉVÉNEMENTS — openEventModal avec upload image
══════════════════════════════════════════════════════════════════ */
let _editingEventId=null;
let _eventUploader=null;

function openEventModal(ev=null){
    _editingEventId=ev?.id||null;
    const old=document.getElementById('event-modal-overlay');if(old)old.remove();

    const modal=document.createElement('div');
    modal.className='modal-overlay';
    modal.id='event-modal-overlay';
    modal.innerHTML=`<div class="modal-box">
        <div class="modal-head">
            <h3 class="modal-title">${_editingEventId?'Modifier':'Nouvel'} Événement</h3>
            <button class="modal-close" onclick="document.getElementById('event-modal-overlay').classList.remove('visible')">✕</button>
        </div>
        <div class="field-group"><label class="field-label">Titre *</label><input type="text" class="field-input" id="ev-title" value="${escapeHTML(ev?.title||'')}"></div>
        <div class="field-group"><label class="field-label">Description</label><textarea class="field-input" id="ev-desc" rows="3">${escapeHTML(ev?.description||'')}</textarea></div>

        <div class="field-group">
            <label class="field-label">🖼️ Affiche / Photo</label>
            ${ev?.poster_url?`<div class="ap-preview-wrap" id="ev-img-preview" style="margin-bottom:10px;"><img src="${escapeHTML(ev.poster_url)}" alt="Affiche actuelle"><div class="ap-preview-info"><span>Affiche actuelle</span><button class="btn btn-ghost btn-sm" onclick="document.getElementById('ev-img-preview').style.display='none';document.getElementById('ev-poster-url').value=''">✕ Retirer</button></div></div>`:`<div class="ap-preview-wrap" id="ev-img-preview" style="display:none;"><img src="" alt=""><div class="ap-preview-info"><span id="ev-img-fname">—</span><button class="btn btn-ghost btn-sm" id="ev-img-remove">✕ Retirer</button></div></div>`}
            <div class="ap-upload-zone" id="ev-upload-zone">
                <input type="file" accept="image/jpeg,image/png,image/webp">
                <div style="font-size:1.8rem;margin-bottom:6px;">📁</div>
                <p><strong>Cliquer ou glisser l'affiche</strong><br>JPG / PNG / WEBP — max 5 MB</p>
            </div>
            <div class="ap-progress" id="ev-upload-progress" style="display:none;"><div class="ap-progress-bar"><div class="ap-progress-fill"></div></div><p class="ap-progress-lbl"></p></div>
            <div class="field-group" style="margin-top:8px;"><label class="field-label" style="font-size:.68rem;">Ou coller une URL d'image déjà hébergée</label><input type="url" class="field-input" id="ev-poster-url" value="${escapeHTML(ev?.poster_url||'')}" placeholder="https://..."></div>
        </div>

        <div class="form-grid-2">
            <div class="field-group"><label class="field-label">Date *</label><input type="date" class="field-input" id="ev-date" value="${ev?.event_date?.split('T')[0]||''}"></div>
            <div class="field-group"><label class="field-label">Heure</label><input type="time" class="field-input" id="ev-time" value="${ev?.event_date?new Date(ev.event_date).toTimeString().slice(0,5):'19:00'}"></div>
        </div>
        <div class="field-group"><label class="field-label">Lien billetterie (optionnel)</label><input type="url" class="field-input" id="ev-ticket" value="${escapeHTML(ev?.ticket_url||'')}" placeholder="https://..."></div>
        <label class="toggle-wrap" style="margin-bottom:16px;">
            <div class="toggle"><input type="checkbox" id="ev-published" ${ev?.is_published?'checked':''}><div class="toggle-track"></div></div>
            <span style="font-size:.8rem;">Publié (visible sur le menu)</span>
        </label>
        <button class="btn btn-primary btn-full" id="ev-save-btn" onclick="saveEventPatched()">💾 ${_editingEventId?'Modifier':'Créer'}</button>
    </div>`;
    document.body.appendChild(modal);

    _eventUploader=buildUploadZone('ev-upload-zone','ev-img-preview','ev-upload-progress','ev-poster-url');
    modal.querySelector('#ev-img-remove')?.addEventListener('click',()=>{
        const pw=modal.querySelector('#ev-img-preview');
        pw.style.display='none';
        modal.querySelector('#ev-poster-url').value='';
    });

    requestAnimationFrame(()=>modal.classList.add('visible'));
}

async function saveEventPatched(){
    const btn=document.getElementById('ev-save-btn');
    btn.disabled=true;btn.innerHTML='⏳ Sauvegarde…';
    try{
        let posterUrl=document.getElementById('ev-poster-url').value.trim()||null;
        if(_eventUploader?.hasPending()){
            btn.innerHTML='⏳ Upload affiche…';
            const up=await _eventUploader.doUpload();
            if(up)posterUrl=up;
        }
        const title=document.getElementById('ev-title').value.trim();
        const date=document.getElementById('ev-date').value;
        const time=document.getElementById('ev-time').value||'19:00';
        if(!title||!date){toast('Titre et date requis.','error');return;}
        const evData={
            restaurant_id:currentRestaurant.id,
            title,
            description:document.getElementById('ev-desc').value.trim()||null,
            event_date:new Date(date+'T'+time).toISOString(),
            is_published:document.getElementById('ev-published').checked,
            poster_url:posterUrl,
            ticket_url:document.getElementById('ev-ticket').value.trim()||null
        };
        if(_editingEventId){await db.from('events').update(evData).eq('id',_editingEventId);}
        else{await db.from('events').insert(evData);}
        document.getElementById('event-modal-overlay').classList.remove('visible');
        setTimeout(()=>{const m=document.getElementById('event-modal-overlay');if(m)m.remove();},300);
        toast('Événement enregistré !','success');
        loadEventsAdmin();
    }finally{btn.disabled=false;btn.innerHTML='💾 Sauvegarder';}
}

// Réassigner les boutons d'ajout
document.getElementById('open-add-event-btn')?.addEventListener('click',()=>openEventModal(),'once');
// Override sans once car l'event original est déjà là — on retire et réattache
(function(){
    const btn=document.getElementById('open-add-event-btn');
    if(!btn)return;
    const newBtn=btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn,btn);
    newBtn.addEventListener('click',()=>openEventModal());
})();

/* ══════════════════════════════════════════════════════════════════
   2. PUB LOCALE — openAdModal avec upload image
══════════════════════════════════════════════════════════════════ */
let _editingAdId=null;
let _adUploader=null;

function openAdModal(ad=null){
    _editingAdId=ad?.id||null;
    const old=document.getElementById('ad-modal-overlay');if(old)old.remove();

    const modal=document.createElement('div');
    modal.className='modal-overlay';
    modal.id='ad-modal-overlay';
    modal.innerHTML=`<div class="modal-box">
        <div class="modal-head">
            <h3 class="modal-title">${_editingAdId?'Modifier':'Nouvelle'} Publicité</h3>
            <button class="modal-close" onclick="document.getElementById('ad-modal-overlay').classList.remove('visible')">✕</button>
        </div>
        <div class="field-group"><label class="field-label">Nom de la pub *</label><input type="text" class="field-input" id="ad-label" value="${escapeHTML(ad?.label||'')}"></div>

        <div class="field-group">
            <label class="field-label">🖼️ Bannière publicitaire *</label>
            ${ad?.banner_url?`<div class="ap-preview-wrap" id="ad-img-preview" style="margin-bottom:10px;"><img src="${escapeHTML(ad.banner_url)}" alt="Bannière actuelle"><div class="ap-preview-info"><span>Bannière actuelle</span><button class="btn btn-ghost btn-sm" onclick="document.getElementById('ad-img-preview').style.display='none';document.getElementById('ad-banner-url').value=''">✕ Retirer</button></div></div>`:`<div class="ap-preview-wrap" id="ad-img-preview" style="display:none;"><img src="" alt=""><div class="ap-preview-info"><span id="ad-img-fname">—</span><button class="btn btn-ghost btn-sm" id="ad-img-remove">✕</button></div></div>`}
            <div class="ap-upload-zone" id="ad-upload-zone">
                <input type="file" accept="image/jpeg,image/png,image/webp">
                <div style="font-size:1.8rem;margin-bottom:6px;">📁</div>
                <p><strong>Cliquer ou glisser la bannière</strong><br>Recommandé : 800×200 px — max 5 MB</p>
            </div>
            <div class="ap-progress" id="ad-upload-progress" style="display:none;"><div class="ap-progress-bar"><div class="ap-progress-fill"></div></div><p class="ap-progress-lbl"></p></div>
            <div class="field-group" style="margin-top:8px;"><label class="field-label" style="font-size:.68rem;">Ou URL image déjà hébergée</label><input type="url" class="field-input" id="ad-banner-url" value="${escapeHTML(ad?.banner_url||'')}" placeholder="https://..."></div>
        </div>

        <div class="field-group"><label class="field-label">Lien de redirection (clic sur la pub)</label><input type="url" class="field-input" id="ad-redirect" value="${escapeHTML(ad?.redirect_url||'')}" placeholder="https://..."></div>
        <div class="field-group"><label class="field-label">Expire le</label><input type="date" class="field-input" id="ad-expires" value="${ad?.expires_at?.split('T')[0]||''}"></div>
        <button class="btn btn-primary btn-full" id="ad-save-btn" onclick="saveAdPatched()">💾 Enregistrer</button>
    </div>`;
    document.body.appendChild(modal);

    _adUploader=buildUploadZone('ad-upload-zone','ad-img-preview','ad-upload-progress','ad-banner-url');
    modal.querySelector('#ad-img-remove')?.addEventListener('click',()=>{
        modal.querySelector('#ad-img-preview').style.display='none';
        modal.querySelector('#ad-banner-url').value='';
    });

    requestAnimationFrame(()=>modal.classList.add('visible'));
}

async function saveAdPatched(){
    const btn=document.getElementById('ad-save-btn');
    btn.disabled=true;btn.innerHTML='⏳ Sauvegarde…';
    try{
        let bannerUrl=document.getElementById('ad-banner-url').value.trim()||null;
        if(_adUploader?.hasPending()){
            btn.innerHTML='⏳ Upload bannière…';
            const up=await _adUploader.doUpload();
            if(up)bannerUrl=up;
        }
        const label=document.getElementById('ad-label').value.trim();
        if(!label||!bannerUrl){toast('Nom et image requis.','error');return;}
        const data={
            restaurant_id:currentRestaurant.id,
            label,
            banner_url:bannerUrl,
            redirect_url:document.getElementById('ad-redirect').value.trim()||null,
            expires_at:document.getElementById('ad-expires').value||null
        };
        if(_editingAdId){await db.from('local_ads').update(data).eq('id',_editingAdId);}
        else{await db.from('local_ads').insert(data);}
        document.getElementById('ad-modal-overlay').classList.remove('visible');
        setTimeout(()=>{const m=document.getElementById('ad-modal-overlay');if(m)m.remove();},300);
        toast('Publicité enregistrée !','success');
        loadAds();
    }finally{btn.disabled=false;btn.innerHTML='💾 Enregistrer';}
}

// Réassigner bouton pub
(function(){
    const btn=document.getElementById('open-add-ad-btn');
    if(!btn)return;
    const newBtn=btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn,btn);
    newBtn.addEventListener('click',()=>openAdModal());
})();

async function editAd(adId){
    const{data:ad}=await db.from('local_ads').select('*').eq('id',adId).single();
    if(ad)openAdModal(ad);
}

/* ══════════════════════════════════════════════════════════════════
   3. STOCK AVANCÉ
══════════════════════════════════════════════════════════════════ */
let _stockMovHistory=[];
let _stockCategory='__all__';

async function loadStock(){
    // Injecter le HTML avancé si pas encore fait
    const panel=document.getElementById('panel-stock');
    if(!panel.querySelector('.stock-kpi-grid')){
        injectStockHTML(panel);
    }
    await refreshStockData();
}

function injectStockHTML(panel){
    // Remplacer le contenu du panel par la version avancée
    panel.innerHTML=`
    <div class="section-header">
        <div><h2 class="section-title">📦 Stock</h2><p class="section-subtitle">Gestion des inventaires et mouvements</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="exportStockCSV()">📊 Exporter CSV</button>
            <button class="btn btn-primary" id="open-add-stock-btn2">+ Ajouter article</button>
        </div>
    </div>

    <!-- KPIs -->
    <div class="stock-kpi-grid">
        <div class="stock-kpi"><div class="stock-kpi-lbl">Valeur totale</div><div class="stock-kpi-val" id="sk-total-val">—</div><div class="stock-kpi-sub">FCFA en stock</div></div>
        <div class="stock-kpi"><div class="stock-kpi-lbl">Articles</div><div class="stock-kpi-val" id="sk-total-items">—</div><div class="stock-kpi-sub">références actives</div></div>
        <div class="stock-kpi"><div class="stock-kpi-lbl">Alertes</div><div class="stock-kpi-val" id="sk-alerts" style="color:#e74c3c;">—</div><div class="stock-kpi-sub">sous le seuil</div></div>
    </div>

    <!-- Alerte seuil -->
    <div id="sk-alert-banner" style="display:none;" class="stock-alert-banner">
        ⚠️ <span id="sk-alert-text"></span>
    </div>

    <!-- Filtre catégorie + mouvement -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <select id="sk-cat-filter" class="field-input" style="width:auto;min-width:160px;font-size:.82rem;" onchange="filterStock(this.value)">
            <option value="__all__">Toutes catégories</option>
        </select>
        <button class="movement-type-btn in active" id="sk-btn-mouvement" onclick="openMouvementModal()">📥 Entrée / Sortie</button>
        <button class="btn btn-ghost btn-sm" onclick="loadStockHistory()">📋 Historique</button>
    </div>

    <!-- Tableau -->
    <div class="menu-table-wrap">
        <p class="table-scroll-hint">← Faites défiler →</p>
        <table>
            <thead><tr>
                <th>Article</th><th>Catégorie</th><th>Unité</th>
                <th>Qté</th><th>Seuil</th><th>Prix/U</th><th>Valeur</th><th></th>
            </tr></thead>
            <tbody id="stock-tbody-adv"></tbody>
        </table>
    </div>

    <!-- Historique mouvements -->
    <div class="menu-table-wrap" id="sk-history-wrap" style="margin-top:20px;display:none;">
        <div class="menu-table-header"><span class="menu-table-title">📋 Historique des mouvements</span></div>
        <div id="sk-history-list" style="padding:0 16px 8px;max-height:280px;overflow-y:auto;"></div>
    </div>
    `;

    document.getElementById('open-add-stock-btn2')?.addEventListener('click',openAddStockModal);
}

async function refreshStockData(){
    const{data:items}=await db.from('inventory').select('*').eq('restaurant_id',currentRestaurant.id).order('item_name');
    if(!items){return;}

    // KPIs
    const totalVal=items.reduce((s,i)=>(s+(i.quantity||0)*(i.unit_price||0)),0);
    const alerts=items.filter(i=>i.quantity<=i.min_threshold);
    document.getElementById('sk-total-val').textContent=totalVal.toLocaleString('fr-FR');
    document.getElementById('sk-total-items').textContent=items.length;
    document.getElementById('sk-alerts').textContent=alerts.length;

    // Bannière alerte
    const banner=document.getElementById('sk-alert-banner');
    if(alerts.length){
        banner.style.display='flex';
        document.getElementById('sk-alert-text').textContent=`${alerts.length} article(s) en rupture ou seuil critique : ${alerts.map(a=>a.item_name).join(', ')}`;
    } else { banner.style.display='none'; }

    // Filtre catégories
    const cats=[...new Set(items.map(i=>i.category||'Sans catégorie').sort())];
    const sel=document.getElementById('sk-cat-filter');
    if(sel){
        const current=sel.value;
        sel.innerHTML='<option value="__all__">Toutes catégories</option>'+cats.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
        sel.value=current;
    }

    // Tableau
    const filtered=_stockCategory==='__all__'?items:items.filter(i=>(i.category||'Sans catégorie')===_stockCategory);
    const tbody=document.getElementById('stock-tbody-adv');
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-dim);">Aucun article.</td></tr>';return;}

    tbody.innerHTML=filtered.map(i=>{
        const qty=i.quantity||0;
        const threshold=i.min_threshold||0;
        const val=(qty*(i.unit_price||0));
        const isLow=qty<=threshold;
        return`<tr>
            <td><strong>${escapeHTML(i.item_name)}</strong></td>
            <td style="color:var(--text-dim);font-size:.78rem;">${escapeHTML(i.category||'—')}</td>
            <td style="color:var(--text-dim);">${escapeHTML(i.unit||'—')}</td>
            <td style="color:${isLow?'var(--danger)':'var(--text)'};font-weight:${isLow?700:400};">${qty}${isLow?' ⚠️':''}</td>
            <td style="color:var(--text-muted);">${threshold}</td>
            <td class="price-mono">${(i.unit_price||0).toLocaleString('fr-FR')}</td>
            <td class="price-mono" style="color:${val>0?'var(--gold)':'var(--text-dim)'};">${val.toLocaleString('fr-FR')}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn btn-ghost btn-sm" onclick="editStockItem('${i.id.replace(/'/g,"\\'")}')">✏️</button>
                    <button class="btn btn-ghost btn-sm" onclick="quickMovement('${i.id.replace(/'/g,"\\'")}','${escapeHTML(i.item_name).replace(/'/g,"\\'")}')">📦</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteStockAdv('${i.id.replace(/'/g,"\\'")}')">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterStock(cat){
    _stockCategory=cat;
    refreshStockData();
}

function openAddStockModal(item=null){
    const old=document.getElementById('stock-modal');if(old)old.remove();
    const modal=document.createElement('div');
    modal.className='modal-overlay';
    modal.id='stock-modal';
    modal.innerHTML=`<div class="modal-box">
        <div class="modal-head">
            <h3 class="modal-title">${item?'Modifier':'Ajouter'} un article</h3>
            <button class="modal-close" onclick="document.getElementById('stock-modal').classList.remove('visible')">✕</button>
        </div>
        <div class="form-grid-2">
            <div class="field-group"><label class="field-label">Nom *</label><input type="text" class="field-input" id="sk-name" value="${escapeHTML(item?.item_name||'')}"></div>
            <div class="field-group"><label class="field-label">Catégorie</label><input type="text" class="field-input" id="sk-cat" value="${escapeHTML(item?.category||'')}" placeholder="Boissons, Épices…"></div>
        </div>
        <div class="form-grid-2">
            <div class="field-group"><label class="field-label">Unité</label><input type="text" class="field-input" id="sk-unit" value="${escapeHTML(item?.unit||'kg')}" placeholder="kg, litre, bouteille…"></div>
            <div class="field-group"><label class="field-label">Quantité initiale</label><input type="number" class="field-input" id="sk-qty" value="${item?.quantity||0}" step="0.1" min="0"></div>
        </div>
        <div class="form-grid-2">
            <div class="field-group"><label class="field-label">Seuil d'alerte</label><input type="number" class="field-input" id="sk-thresh" value="${item?.min_threshold||5}" min="0"></div>
            <div class="field-group"><label class="field-label">Prix unitaire (FCFA)</label><input type="number" class="field-input" id="sk-price" value="${item?.unit_price||0}" min="0"></div>
        </div>
        <div class="field-group"><label class="field-label">Fournisseur</label><input type="text" class="field-input" id="sk-supplier" value="${escapeHTML(item?.supplier||'')}" placeholder="Nom du fournisseur"></div>
        <button class="btn btn-primary btn-full" onclick="saveStockItem('${item?.id||''}')">💾 Enregistrer</button>
    </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(()=>modal.classList.add('visible'));
}

async function saveStockItem(existingId){
    const name=document.getElementById('sk-name').value.trim();
    if(!name){toast('Nom requis.','error');return;}
    const data={
        restaurant_id:currentRestaurant.id,
        item_name:name,
        category:document.getElementById('sk-cat').value.trim()||null,
        unit:document.getElementById('sk-unit').value.trim()||'unité',
        quantity:parseFloat(document.getElementById('sk-qty').value)||0,
        min_threshold:parseFloat(document.getElementById('sk-thresh').value)||0,
        unit_price:parseInt(document.getElementById('sk-price').value)||0,
        supplier:document.getElementById('sk-supplier').value.trim()||null,
        last_updated:new Date().toISOString()
    };
    if(existingId){await db.from('inventory').update(data).eq('id',existingId);}
    else{await db.from('inventory').insert(data);}
    document.getElementById('stock-modal').classList.remove('visible');
    setTimeout(()=>{const m=document.getElementById('stock-modal');if(m)m.remove();},300);
    toast(existingId?'Article mis à jour !':'Article ajouté !','success');
    refreshStockData();
}

async function editStockItem(id){
    const{data}=await db.from('inventory').select('*').eq('id',id).single();
    if(data)openAddStockModal(data);
}

function openMouvementModal(preselectedId=null,preselectedName=null){
    const old=document.getElementById('mouvement-modal');if(old)old.remove();
    // Charger la liste des articles pour le select
    db.from('inventory').select('id,item_name,quantity,unit').eq('restaurant_id',currentRestaurant.id).order('item_name').then(({data:items})=>{
        if(!items?.length){toast('Aucun article en stock.','info');return;}
        const modal=document.createElement('div');
        modal.className='modal-overlay';
        modal.id='mouvement-modal';
        modal.innerHTML=`<div class="modal-box">
            <div class="modal-head">
                <h3 class="modal-title">📦 Mouvement de stock</h3>
                <button class="modal-close" onclick="document.getElementById('mouvement-modal').classList.remove('visible')">✕</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
                <button class="movement-type-btn in active" id="mv-type-in" onclick="setMvType('in')">📥 Entrée (réception)</button>
                <button class="movement-type-btn out" id="mv-type-out" onclick="setMvType('out')">📤 Sortie (utilisation)</button>
            </div>
            <input type="hidden" id="mv-type-val" value="in">
            <div class="field-group"><label class="field-label">Article *</label>
                <select class="field-input" id="mv-item-select">
                    ${items.map(i=>`<option value="${i.id}" data-qty="${i.quantity}" data-unit="${escapeHTML(i.unit||'')}"${i.id===preselectedId?' selected':''}>${escapeHTML(i.item_name)} (stock: ${i.quantity} ${i.unit||''})</option>`).join('')}
                </select>
            </div>
            <div class="form-grid-2">
                <div class="field-group"><label class="field-label">Quantité *</label><input type="number" class="field-input" id="mv-qty" value="1" min="0.1" step="0.1"></div>
                <div class="field-group"><label class="field-label">Coût total (FCFA)</label><input type="number" class="field-input" id="mv-cost" value="0" min="0"></div>
            </div>
            <div class="field-group"><label class="field-label">Raison / Note</label><input type="text" class="field-input" id="mv-note" placeholder="Ex: Achat marché, Commande client 12…"></div>
            <button class="btn btn-primary btn-full" onclick="saveMouvement()">✅ Enregistrer le mouvement</button>
        </div>`;
        document.body.appendChild(modal);
        requestAnimationFrame(()=>modal.classList.add('visible'));
    });
}

function setMvType(type){
    document.getElementById('mv-type-val').value=type;
    document.getElementById('mv-type-in').classList.toggle('active',type==='in');
    document.getElementById('mv-type-out').classList.toggle('active',type==='out');
}

async function saveMouvement(){
    const itemId=document.getElementById('mv-item-select').value;
    const qty=parseFloat(document.getElementById('mv-qty').value);
    const type=document.getElementById('mv-type-val').value;
    const cost=parseInt(document.getElementById('mv-cost').value)||0;
    const note=document.getElementById('mv-note').value.trim();
    if(!itemId||!qty||qty<=0){toast('Article et quantité requis.','error');return;}

    // Récupérer la quantité actuelle
    const{data:item}=await db.from('inventory').select('quantity,item_name').eq('id',itemId).single();
    if(!item){toast('Article introuvable.','error');return;}

    const newQty=type==='in'?item.quantity+qty:Math.max(0,item.quantity-qty);
    await db.from('inventory').update({quantity:newQty,last_updated:new Date().toISOString()}).eq('id',itemId);

    // Enregistrer dans l'historique (table stock_movements si elle existe, sinon log local)
    try{
        await db.from('stock_movements').insert({
            restaurant_id:currentRestaurant.id,
            item_id:itemId,
            item_name:item.item_name,
            movement_type:type,
            quantity:qty,
            cost_total:cost,
            note:note||null,
            created_at:new Date().toISOString()
        });
    }catch(e){/* table peut ne pas exister encore */}

    document.getElementById('mouvement-modal').classList.remove('visible');
    setTimeout(()=>{const m=document.getElementById('mouvement-modal');if(m)m.remove();},300);
    toast(`${type==='in'?'Entrée':'Sortie'} de ${qty} enregistrée !`,'success');
    refreshStockData();
}

function quickMovement(itemId,itemName){
    openMouvementModal(itemId,itemName);
}

async function loadStockHistory(){
    const wrap=document.getElementById('sk-history-wrap');
    if(!wrap)return;
    wrap.style.display=wrap.style.display==='none'?'block':'none';
    if(wrap.style.display==='none')return;

    const listEl=document.getElementById('sk-history-list');
    listEl.innerHTML='<p style="color:var(--text-dim);padding:16px 0;">Chargement…</p>';

    try{
        const{data}=await db.from('stock_movements').select('*').eq('restaurant_id',currentRestaurant.id).order('created_at',{ascending:false}).limit(50);
        if(!data?.length){listEl.innerHTML='<p style="color:var(--text-dim);padding:16px 0;">Aucun mouvement enregistré.</p>';return;}
        listEl.innerHTML=data.map(m=>`<div class="history-row">
            <span class="history-badge ${m.movement_type}">${m.movement_type==='in'?'📥 Entrée':'📤 Sortie'}</span>
            <span style="flex:1;"><strong>${escapeHTML(m.item_name||'—')}</strong>${m.note?` — ${escapeHTML(m.note)}`:''}</span>
            <span style="color:${m.movement_type==='in'?'var(--success)':'var(--danger)'};">${m.movement_type==='in'?'+':'−'}${m.quantity}</span>
            <span style="color:var(--text-muted);font-size:.7rem;">${new Date(m.created_at).toLocaleDateString('fr-FR')} ${new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>`).join('');
    }catch(e){listEl.innerHTML='<p style="color:var(--text-dim);padding:16px 0;">Historique non disponible (table stock_movements requise).</p>';}
}

async function deleteStockAdv(id){
    if(!confirm('Supprimer cet article ?'))return;
    await db.from('inventory').delete().eq('id',id);
    toast('Supprimé.','success');
    refreshStockData();
}

function exportStockCSV(){
    db.from('inventory').select('*').eq('restaurant_id',currentRestaurant.id).order('item_name').then(({data:items})=>{
        if(!items?.length){toast('Aucun article à exporter.','info');return;}
        const headers=['Article','Catégorie','Unité','Quantité','Seuil','Prix/U (FCFA)','Valeur (FCFA)','Fournisseur'];
        const rows=items.map(i=>[
            i.item_name,i.category||'',i.unit||'',i.quantity,i.min_threshold,i.unit_price||0,
            (i.quantity||0)*(i.unit_price||0),i.supplier||''
        ]);
        const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const a=document.createElement('a');
        a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
        a.download=`stock-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        toast('Export CSV téléchargé !','success');
    });
}

/* ══════════════════════════════════════════════════════════════════
   4. COMPTABILITÉ AVANCÉE
══════════════════════════════════════════════════════════════════ */
let _accTab='transactions';

async function loadAccounting(){
    const panel=document.getElementById('panel-accounting');
    if(!panel.querySelector('.acc-tabs')){
        injectAccountingHTML(panel);
    }
    await refreshAccountingData();
}

function injectAccountingHTML(panel){
    panel.innerHTML=`
    <div class="section-header">
        <div><h2 class="section-title">💰 Comptabilité</h2><p class="section-subtitle">Caisse, dépenses et rapports financiers</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="exportAccountingCSV()">📊 CSV</button>
            <button class="btn btn-primary btn-sm" onclick="sendDailyReport()">📧 Rapport WhatsApp</button>
        </div>
    </div>

    <!-- KPIs revenus -->
    <div class="stats-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-label">💰 CA du jour</div><div class="stat-value" id="acc-ca-day">—</div><div class="stat-unit">FCFA</div></div>
        <div class="stat-card"><div class="stat-label">📅 CA semaine</div><div class="stat-value" id="acc-ca-week">—</div><div class="stat-unit">FCFA</div></div>
        <div class="stat-card"><div class="stat-label">📆 CA mois</div><div class="stat-value" id="acc-ca-month">—</div><div class="stat-unit">FCFA</div></div>
    </div>

    <!-- KPIs P&L -->
    <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-label">📉 Dépenses du jour</div><div class="stat-value" id="acc-exp-day" style="color:var(--danger);">—</div><div class="stat-unit">FCFA</div></div>
        <div class="stat-card"><div class="stat-label">📈 Bénéfice net</div><div class="stat-value" id="acc-profit">—</div><div class="stat-unit">FCFA (jour)</div></div>
        <div class="stat-card"><div class="stat-label">🧾 Commandes</div><div class="stat-value" id="acc-orders-count">—</div><div class="stat-unit">transactions</div></div>
    </div>

    <!-- Onglets -->
    <div class="acc-tabs">
        <button class="acc-tab active" onclick="switchAccTab('transactions',this)">🧾 Transactions</button>
        <button class="acc-tab" onclick="switchAccTab('paiements',this)">💳 Paiements</button>
        <button class="acc-tab" onclick="switchAccTab('depenses',this)">📉 Dépenses</button>
        <button class="acc-tab" onclick="switchAccTab('caisse',this)">🔒 Caisse</button>
    </div>

    <!-- Onglet Transactions -->
    <div class="acc-section active" id="acc-tab-transactions">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <select id="acc-filter-pay" class="field-input" style="width:auto;font-size:.8rem;" onchange="refreshAccountingData()">
                <option value="">Tous modes</option>
                <option value="espèces">💵 Espèces</option>
                <option value="tmoney">📱 TMoney</option>
                <option value="flooz">📱 Flooz</option>
            </select>
            <select id="acc-filter-type" class="field-input" style="width:auto;font-size:.8rem;" onchange="refreshAccountingData()">
                <option value="">Tous types</option>
                <option value="sur_place">🏪 Sur place</option>
                <option value="livraison">🛵 Livraison</option>
            </select>
            <input type="date" id="acc-filter-date" class="field-input" style="width:auto;font-size:.8rem;" value="${new Date().toISOString().split('T')[0]}" onchange="refreshAccountingData()">
        </div>
        <div class="menu-table-wrap">
            <table><thead><tr><th>N°</th><th>Description</th><th>Montant</th><th>Paiement</th><th>Type</th><th>Heure</th></tr></thead>
            <tbody id="transactions-tbody"></tbody></table>
        </div>
    </div>

    <!-- Onglet Paiements -->
    <div class="acc-section" id="acc-tab-paiements">
        <div class="info-card">
            <h3 class="info-card-title">💳 Répartition des paiements (jour)</h3>
            <div id="acc-payment-chart" style="margin-top:12px;"></div>
            <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">
                <div style="flex:1;min-width:80px;background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--gold);" id="acc-cash">—</div>
                    <div style="font-size:.68rem;color:var(--text-dim);">💵 Espèces</div>
                </div>
                <div style="flex:1;min-width:80px;background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--gold);" id="acc-tmoney">—</div>
                    <div style="font-size:.68rem;color:var(--text-dim);">📱 TMoney</div>
                </div>
                <div style="flex:1;min-width:80px;background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--gold);" id="acc-flooz">—</div>
                    <div style="font-size:.68rem;color:var(--text-dim);">📱 Flooz</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Onglet Dépenses -->
    <div class="acc-section" id="acc-tab-depenses">
        <div class="info-card">
            <h3 class="info-card-title">➕ Ajouter une dépense</h3>
            <div class="form-grid-2">
                <div class="field-group"><label class="field-label">Description *</label><input type="text" class="field-input" id="exp-label" placeholder="Achat épices, Électricité…"></div>
                <div class="field-group"><label class="field-label">Montant (FCFA) *</label><input type="number" class="field-input" id="exp-amount" min="0"></div>
            </div>
            <div class="form-grid-2">
                <div class="field-group"><label class="field-label">Catégorie</label>
                    <select class="field-input" id="exp-cat">
                        <option>Approvisionnement</option><option>Personnel</option><option>Charges fixes</option>
                        <option>Équipement</option><option>Marketing</option><option>Autre</option>
                    </select>
                </div>
                <div class="field-group"><label class="field-label">Date</label><input type="date" class="field-input" id="exp-date" value="${new Date().toISOString().split('T')[0]}"></div>
            </div>
            <button class="btn btn-primary" onclick="addExpense()">+ Enregistrer la dépense</button>
        </div>
        <div class="menu-table-wrap" style="margin-top:16px;">
            <div class="menu-table-header"><span class="menu-table-title">📉 Dépenses du jour</span></div>
            <table><thead><tr><th>Description</th><th>Catégorie</th><th>Montant</th><th>Heure</th><th></th></tr></thead>
            <tbody id="expenses-tbody"></tbody></table>
        </div>
    </div>

    <!-- Onglet Caisse -->
    <div class="acc-section" id="acc-tab-caisse">
        <div class="info-card">
            <h3 class="info-card-title">🔒 Clôture de caisse</h3>
            <p style="font-size:.85rem;color:var(--text-dim);margin-bottom:16px;line-height:1.6;">La clôture enregistre définitivement le total de la journée et réinitialise le compteur quotidien.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="closeCashRegister()">🔒 Clôturer la caisse</button>
                <button class="btn btn-ghost" onclick="loadCashRegisterHistory()">📋 Historique des clôtures</button>
            </div>
        </div>
        <div id="cash-register-history" style="margin-top:16px;"></div>
    </div>
    `;
}

function switchAccTab(tab,btn){
    _accTab=tab;
    document.querySelectorAll('.acc-tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.acc-section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active');
    const section=document.getElementById('acc-tab-'+tab);
    if(section)section.classList.add('active');
    if(tab==='depenses')loadExpenses();
    if(tab==='caisse')loadCashRegisterHistory();
}

async function refreshAccountingData(){
    const filterDate=document.getElementById('acc-filter-date')?.value||new Date().toISOString().split('T')[0];
    const filterPay=document.getElementById('acc-filter-pay')?.value||'';
    const filterType=document.getElementById('acc-filter-type')?.value||'';

    const weekStart=new Date();weekStart.setDate(weekStart.getDate()-weekStart.getDay());
    const monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);

    // ✅ Helper pour gérer les erreurs de requête
    async function safeQuery(queryBuilder) {
        try {
            const result = await queryBuilder;
            return result;
        } catch (error) {
            console.warn('⚠️ Requête échouée (table peut ne pas exister):', error.message);
            return { data: [] };
        }
    }

    let transQuery=db.from('transactions').select('*').eq('restaurant_id',currentRestaurant.id).gte('created_at',filterDate).order('created_at',{ascending:false});
    if(filterPay)transQuery=transQuery.eq('payment_method',filterPay);
    if(filterType)transQuery=transQuery.eq('type',filterType);

    // ✅ Utiliser safeQuery pour chaque appel
    const[dayRes,weekRes,monthRes,expDay]=await Promise.all([
        safeQuery(transQuery),
        safeQuery(db.from('transactions').select('amount').eq('restaurant_id',currentRestaurant.id).gte('created_at',weekStart.toISOString().split('T')[0])),
        safeQuery(db.from('transactions').select('amount').eq('restaurant_id',currentRestaurant.id).gte('created_at',monthStart.toISOString().split('T')[0])),
        safeQuery(db.from('expenses').select('amount').eq('restaurant_id',currentRestaurant.id).gte('created_at',filterDate))
    ]);

    const trans=dayRes.data||[];
    const caWeek=(weekRes.data||[]).reduce((s,t)=>s+(t.amount||0),0);
    const caMonth=(monthRes.data||[]).reduce((s,t)=>s+(t.amount||0),0);
    const totalExpDay=(expDay.data||[]).reduce((s,e)=>s+(e.amount||0),0);

    let total=0,tm=0,fl=0,ca=0;
    trans.forEach(t=>{
        const amount=t.amount||0;
        total+=amount;
        if(t.payment_method==='tmoney')tm+=amount;
        else if(t.payment_method==='flooz')fl+=amount;
        else ca+=amount;
    });

    // KPIs
    const setEl=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
    setEl('acc-ca-day',total.toLocaleString('fr-FR'));
    setEl('acc-ca-week',caWeek.toLocaleString('fr-FR'));
    setEl('acc-ca-month',caMonth.toLocaleString('fr-FR'));
    setEl('acc-exp-day',totalExpDay.toLocaleString('fr-FR'));
    const profit=total-totalExpDay;
    const profEl=document.getElementById('acc-profit');
    if(profEl){profEl.textContent=profit.toLocaleString('fr-FR');profEl.style.color=profit>=0?'var(--success)':'var(--danger)';}
    setEl('acc-orders-count',trans.length);
    setEl('acc-cash',ca.toLocaleString('fr-FR'));
    setEl('acc-tmoney',tm.toLocaleString('fr-FR'));
    setEl('acc-flooz',fl.toLocaleString('fr-FR'));

    // Graphique paiements
    const chartEl=document.getElementById('acc-payment-chart');
    if(chartEl&&total>0){
        const pct=v=>Math.round(v/total*100);
        chartEl.innerHTML=`
        <div class="payment-bar-row"><span>💵 Espèces</span><div class="payment-bar-track"><div class="payment-bar-fill" style="width:${pct(ca)}%;background:#c5a059;"></div></div><span style="font-size:.75rem;color:var(--text-dim);min-width:40px;text-align:right;">${pct(ca)}%</span></div>
        <div class="payment-bar-row"><span>📱 TMoney</span><div class="payment-bar-track"><div class="payment-bar-fill" style="width:${pct(tm)}%;background:#2ecc71;"></div></div><span style="font-size:.75rem;color:var(--text-dim);min-width:40px;text-align:right;">${pct(tm)}%</span></div>
        <div class="payment-bar-row"><span>📱 Flooz</span><div class="payment-bar-track"><div class="payment-bar-fill" style="width:${pct(fl)}%;background:#3498db;"></div></div><span style="font-size:.75rem;color:var(--text-dim);min-width:40px;text-align:right;">${pct(fl)}%</span></div>`;
    }

    // Tableau transactions
    const tbody=document.getElementById('transactions-tbody');
    if(!tbody)return;
    if(!trans.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim);">Aucune transaction.</td></tr>';return;}
    tbody.innerHTML=trans.map(t=>`<tr>
        <td style="font-family:var(--mono);font-size:.72rem;">#${escapeHTML(t.id?.substring(0,6)||'')}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(t.description||'—')}</td>
        <td class="price-mono">${(t.amount||0).toLocaleString('fr-FR')} FCFA</td>
        <td>${t.payment_method==='tmoney'?'📱 TMoney':t.payment_method==='flooz'?'📱 Flooz':'💵 Espèces'}</td>
        <td>${t.type==='livraison'?'🛵':'🏪'}</td>
        <td style="font-size:.72rem;color:var(--text-dim);">${new Date(t.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`).join('');
}

async function addExpense(){
    const label=document.getElementById('exp-label').value.trim();
    const amount=parseInt(document.getElementById('exp-amount').value);
    const cat=document.getElementById('exp-cat').value;
    const date=document.getElementById('exp-date').value;
    if(!label||!amount){toast('Description et montant requis.','error');return;}
    try{
        await db.from('expenses').insert({restaurant_id:currentRestaurant.id,label,amount,category:cat,date:date||new Date().toISOString().split('T')[0],created_at:new Date().toISOString()});
        toast('Dépense enregistrée !','success');
        document.getElementById('exp-label').value='';
        document.getElementById('exp-amount').value='';
        loadExpenses();
        refreshAccountingData();
    }catch(e){toast('Erreur : vérifiez que la table "expenses" existe dans Supabase.','error');}
}

async function loadExpenses(){
    const today=new Date().toISOString().split('T')[0];
    const tbody=document.getElementById('expenses-tbody');
    if(!tbody)return;
    try{
        const{data}=await db.from('expenses').select('*').eq('restaurant_id',currentRestaurant.id).gte('created_at',today).order('created_at',{ascending:false});
        if(!data?.length){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim);">Aucune dépense aujourd\'hui.</td></tr>';return;}
        tbody.innerHTML=data.map(e=>`<tr>
            <td><strong>${escapeHTML(e.label)}</strong></td>
            <td style="color:var(--text-dim);font-size:.78rem;">${escapeHTML(e.category||'—')}</td>
            <td class="price-mono" style="color:var(--danger);">−${e.amount.toLocaleString('fr-FR')} FCFA</td>
            <td style="font-size:.72rem;color:var(--text-dim);">${new Date(e.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">🗑️</button></td>
        </tr>`).join('');
    }catch(e){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim);">Table "expenses" non disponible.</td></tr>';}
}

async function deleteExpense(id){
    if(!confirm('Supprimer cette dépense ?'))return;
    await db.from('expenses').delete().eq('id',id);
    toast('Supprimée.','success');
    loadExpenses();
    refreshAccountingData();
}

async function loadCashRegisterHistory(){
    const el=document.getElementById('cash-register-history');
    if(!el)return;
    const{data}=await db.from('cash_register').select('*').eq('restaurant_id',currentRestaurant.id).order('date',{ascending:false}).limit(14);
    if(!data?.length){el.innerHTML='<p style="color:var(--text-dim);text-align:center;padding:20px;">Aucune clôture enregistrée.</p>';return;}
    el.innerHTML=`<div class="menu-table-wrap"><div class="menu-table-header"><span class="menu-table-title">📋 Dernières clôtures (14 jours)</span></div><table>
        <thead><tr><th>Date</th><th>Total</th><th>Espèces</th><th>TMoney</th><th>Flooz</th><th>Commandes</th></tr></thead>
        <tbody>${data.map(r=>`<tr>
            <td style="font-family:var(--mono);font-size:.8rem;">${r.date}</td>
            <td class="price-mono">${(r.total_revenue||0).toLocaleString('fr-FR')}</td>
            <td style="color:var(--text-dim);">${(r.total_cash||0).toLocaleString('fr-FR')}</td>
            <td style="color:var(--text-dim);">${(r.total_tmoney||0).toLocaleString('fr-FR')}</td>
            <td style="color:var(--text-dim);">${(r.total_flooz||0).toLocaleString('fr-FR')}</td>
            <td style="text-align:center;">${r.total_orders||0}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

async function exportAccountingCSV(){
    const today=new Date().toISOString().split('T')[0];
    const{data:trans}=await db.from('transactions').select('*').eq('restaurant_id',currentRestaurant.id).gte('created_at',today).order('created_at',{ascending:false});
    if(!trans?.length){toast('Aucune transaction à exporter.','info');return;}
    const headers=['N°','Description','Montant','Paiement','Type','Heure'];
    const rows=trans.map(t=>[t.id?.substring(0,8)||'',t.description||'',t.amount,t.payment_method,t.type,new Date(t.created_at).toLocaleTimeString('fr-FR')]);
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download=`comptabilite-${today}.csv`;
    a.click();
    toast('Export CSV téléchargé !','success');
}

console.log('✅ admin-patch.js chargé — Événements upload, Pub upload, Stock avancé, Comptabilité avancée');