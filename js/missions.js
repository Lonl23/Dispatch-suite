// missions.js — Missions complètes (wizard, statuts, renforts, ordre TV, hôpitaux)

const DISPATCH_KEY = 'dispatch_parc_vehicules';
const MISSIONS_KEY = 'dispatch_missions';
const ARCHIVE_KEY  = 'dispatch_missions_archive';
const ADMIN_PASSWORD = 'Admin01';

let dispatch = {};
let missions = {};
let archive = {};
let vehSettings = [];
let POSTAL_MAP = {}; // optionnel via localStorage.BE_POSTAL_MAP
let HOSP_CACHE = JSON.parse(localStorage.getItem('KNOWN_HOSPS')||'{}'); // name -> {name,addr,lat,lon}

// Utils
const $  = (s)=>document.querySelector(s);
const esc= (s)=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const now= ()=> new Date();
const hhmm=(d)=> String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const todayKey=()=>{const d=now();const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;};

// Load optional BE postal map from localStorage (if previously loaded by un script dédié)
try{ POSTAL_MAP = JSON.parse(localStorage.getItem('BE_POSTAL_MAP')||'{}'); }catch{ POSTAL_MAP = {}; }

// Subscribe data (polling pour stabilité)
subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap||{};
  vehSettings = Array.isArray(dispatch._settings?.vehs)? dispatch._settings.vehs : [];
  fillVehSelect();
}, {mode:'poll', intervalMs:3000});

subscribeKey(MISSIONS_KEY, snap=>{
  missions = snap||{};
  renderActive();
  renderDone();
}, {mode:'poll', intervalMs:3000});

subscribeKey(ARCHIVE_KEY, snap=>{
  archive = snap||{};
}, {mode:'poll', intervalMs:10000});

// ====== UI wiring ======
$('#btnNew').onclick = openWizard;
$('#wizClose').onclick = closeWizard;
$('#wizPrev').onclick = ()=> setStep(curStep-1);
$('#wizNext').onclick = ()=> setStep(curStep+1);
$('#wizCreate').onclick = createMissionWizard;

// CP -> ville auto
$('#w_cp').addEventListener('input', (e)=>{
  const cp = (e.target.value||'').trim();
  if (POSTAL_MAP[cp]) $('#w_ville').value = POSTAL_MAP[cp];
});

// Type -> bloc 112
$('#w_type').addEventListener('change', ()=>{
  $('#blk112').style.display = ($('#w_type').value==='112') ? 'block' : 'none';
});

// Select véhicule -> attrib
function fillVehSelect(){
  const sel = $('#w_veh');
  const prev = sel.value;
  sel.innerHTML = `<option value="">—</option>`;
  vehSettings.forEach(v=>{
    sel.insertAdjacentHTML('beforeend', `<option>${esc(v.id)}</option>`);
  });
  sel.value = prev || '';
  updateAttrFromVeh();
}
$('#w_veh').addEventListener('change', updateAttrFromVeh);
function updateAttrFromVeh(){
  const id = $('#w_veh').value;
  const s  = vehSettings.find(x=>x.id===id);
  const dyn= dispatch[id]||{};
  $('#w_attr').value = (dyn.attribution || s?.attribution || '') || '';
}

// ====== Wizard ======
let curStep = 1;
function openWizard(){
  resetWizard();
  $('#modalBack').style.display='flex';
  setStep(1);
}
function closeWizard(){
  $('#modalBack').style.display='none';
}
function resetWizard(){
  ['w_type','w_veh','w_attr','w_motif','w_rue','w_num','w_cp','w_ville','w_centrale','w_num112','w_depart112']
    .forEach(id=>{ const el=$('#'+id); if(el) el.value=''; });
  ['rf_pompiers','rf_police','rf_smur','rf_ambu112','rf_racs'].forEach(id=> $('#'+id).checked=false );
  $('#blk112').style.display='none';
  $('#w_recap').innerHTML='—';
  $('#wizMsg').textContent='';
}
function setStep(n){
  n=Math.max(1,Math.min(4,n));
  curStep=n;
  document.querySelectorAll('.wiz').forEach(w=> w.style.display = (parseInt(w.dataset.step,10)===n?'grid':'none'));
  document.querySelectorAll('.step').forEach(s=> s.classList.toggle('active', parseInt(s.dataset.step,10)===n));
  $('#wizPrev').style.display = (n>1)?'inline-block':'none';
  $('#wizNext').style.display = (n<4)?'inline-block':'none';
  $('#wizCreate').style.display = (n===4)?'inline-block':'none';
  if(n===4) buildRecap();
}

// Build recap
function buildRecap(){
  const recap = `
    <div><b>Type:</b> ${esc($('#w_type').value||'—')}</div>
    <div><b>Véhicule:</b> ${esc($('#w_veh').value||'—')} ${($('#w_attr').value)?`<span class="badge">${esc($('#w_attr').value)}</span>`:''}</div>
    <div><b>Motif:</b> ${esc($('#w_motif').value||'—')}</div>
    <div><b>PEC:</b> ${esc([$('#w_rue').value,$('#w_num').value,$('#w_cp').value,$('#w_ville').value].filter(Boolean).join(', ')||'—')}</div>
    ${$('#w_type').value==='112' ? `<div><b>CU112:</b> ${esc($('#w_centrale').value||'—')} — <b>N°:</b> ${esc($('#w_num112').value||'—')} — <b>Départ:</b> ${esc($('#w_depart112').value||'—')}</div>`:''}
    <div><b>Renforts:</b> ${['rf_pompiers','rf_police','rf_smur','rf_ambu112','rf_racs'].filter(id=>$('#'+id).checked).map(id=>id.replace('rf_','').toUpperCase()).join(', ')||'—'}</div>
  `;
  $('#w_recap').innerHTML = recap;
}

// ====== Création ======
function pickDisplayOrder(){
  // plus petit entier >=1 non utilisé par les missions actives
  const used = new Set(Object.values(missions).filter(m=>!m.done).map(m=>m.displayOrder).filter(Boolean));
  for(let i=1;i<=999;i++){ if(!used.has(i)) return i; }
  return 999;
}

async function createMissionWizard(){
  const type = $('#w_type').value;
  const veh  = $('#w_veh').value;
  const attr = $('#w_attr').value || '';
  const motif= ($('#w_motif').value||'').trim();
  if(!veh || !type || !motif){
    $('#wizMsg').textContent='Type, véhicule et motif obligatoires.'; return;
  }
  const address = {
    rue: $('#w_rue').value||'',
    num: $('#w_num').value||'',
    cp:  $('#w_cp').value||'',
    ville: $('#w_ville').value||''
  };
  // Appel à la création
  const appelTime = hhmm(now());

  // Renforts cochés -> statut Appel dès création
  const renforts = {};
  [['pompiers','rf_pompiers'],['police','rf_police'],['smur','rf_smur'],['ambu112','rf_ambu112'],['racs','rf_racs']].forEach(([k,id])=>{
    if($('#'+id).checked){
      renforts[k] = { appel: appelTime, surplace: '', note: '' };
    }
  });

  const id = String(Date.now());
  const plaque = (dispatch?.[veh]?.plaque) || (vehSettings.find(v=>v.id===veh)?.plaque) || '';
  const m = {
    id, day: todayKey(),
    veh, attr, type, motif,
    plaque,
    adresse: address,
    statuts: { 'Appel': appelTime }, // horaire “Appel” à la création (112 et TMS)
    renforts,
    kmDep:'', kmRet:'',
    displayOrder: pickDisplayOrder(),
    done:false
  };

  if(type==='112'){
    m.centrale = $('#w_centrale').value||'';
    m.num112   = $('#w_num112').value||'';
    m.depart112= $('#w_depart112').value||'Normal';
  }

  try{
    await updateKey(MISSIONS_KEY, { [id]: m });
    // Passe le véhicule en "Sorti"
    const dpatch = dispatch[veh] || {};
    dpatch.statut = 'Sorti';
    await updateKey(DISPATCH_KEY, { [veh]: dpatch });
    closeWizard();
  }catch(e){
    console.error(e);
    $('#wizMsg').textContent='Erreur de création (réseau/permissions).';
  }
}

// ====== Rendu liste missions ======
function renderActive(){
  const tb = $('#tblActive tbody'); tb.innerHTML='';
  const active = Object.values(missions).filter(m=>!m.done);
  // ordre par displayOrder (croissant)
  active.sort((a,b)=> (a.displayOrder||999)-(b.displayOrder||999) || (b.id||'')<(a.id||'')?-1:1);

  active.forEach(m=>{
    const cpVille = [m?.adresse?.cp, m?.adresse?.ville].filter(Boolean).join(' ');
    const renfStr = renderRenfortInline(m.renforts);
    const statBtns = renderStatusButtons(m);
    const kmCell = `
      <div><label class="small">Départ</label><input data-id="${m.id}" data-k="kmDep" value="${esc(m.kmDep||'')}" style="width:110px"></div>
      <div><label class="small">Retour</label><input data-id="${m.id}" data-k="kmRet" value="${esc(m.kmRet||'')}" style="width:110px"></div>
    `;
    const actBtns = `
      <div class="kp" style="gap:6px">
        <button class="btn ghost" onclick="editMission('${m.id}')">Éditer</button>
        <button class="btn warn" onclick="editRenforts('${m.id}')">Renforts</button>
        <button class="btn" onclick="closeMission('${m.id}')">Clôturer</button>
      </div>
    `;
    tb.insertAdjacentHTML('beforeend', `
      <tr>
        <td><b>${m.displayOrder||'—'}</b></td>
        <td>${esc(m.veh)} ${m.attr?`<span class="badge">${esc(m.attr)}</span>`:''}</td>
        <td>${esc(m.motif||'—')}</td>
        <td>${esc(cpVille||'—')}</td>
        <td>${renfStr}</td>
        <td>${statBtns}</td>
        <td>${kmCell}</td>
        <td>${actBtns}</td>
      </tr>
    `);
  });

  // bind KM changes
  tb.querySelectorAll('input[data-id]').forEach(inp=>{
    inp.oninput = ()=> {
      const id=inp.dataset.id, k=inp.dataset.k; const v=inp.value.replace(/[^\d]/g,'');
      missions[id][k]=v; updateKey(MISSIONS_KEY, { [id]: { ...missions[id] }});
    };
  });
}

function renderRenfortInline(rf={}){
  const tags=[];
  const push=(k,label)=>{
    const r=rf[k]; if(!r) return;
    const status = r.surplace ? 'Sur place' : (r.appel ? 'Appel' : '—');
    const cls = r.surplace ? 'r-ok' : (r.appel ? 'r-warn' : '');
    tags.push(`<span>${label}</span><span class="rstat ${cls}">${status}</span>${r.note?` <span class="small">(${esc(r.note)})</span>`:''}`);
  };
  push('pompiers','Pompiers');
  push('police','Police');
  push('smur','SMUR');
  push('ambu112','Ambu112');
  push('racs','RACS');
  return tags.length? tags.join('<br>') : '—';
}

function renderStatusButtons(m){
  // 112: Appel, Départ, Sur place, En charge vers hôpital, Arrivé hôpital, Retour dispo/indispo, Rentré poste
  // TMS: Appel, Départ, Sur place, En charge vers destination, À destination, Retour dispo/indispo, Rentré poste
  const type=m.type;
  const S = m.statuts||{};
  const b = (label)=>`<button class="${S[label]?'active':''}" onclick="setStatus('${m.id}','${label}')">${label}${S[label]?` (${esc(S[label])})`:''}</button>`;
  if(type==='112'){
    return `<div class="kp">${b('Appel')}${b('Départ')}${b('Sur place')}
      <button class="${S['En charge vers hôpital']?'active':''}" onclick="setStatus('${m.id}','En charge vers hôpital', true)">${S['En charge vers hôpital']?`En charge vers hôpital (${esc(S['En charge vers hôpital'])})`:'En charge vers hôpital'}</button>
      ${b('Arrivé hôpital')}
      ${b('Retour dispo')}${b('Retour indisponible')}${b('Rentré poste')}
    </div>`;
  }else{
    return `<div class="kp">${b('Appel')}${b('Départ')}${b('Sur place')}
      ${b('En charge vers destination')}${b('À destination')}
      ${b('Retour dispo')}${b('Retour indisponible')}${b('Rentré poste')}
    </div>`;
  }
}

// ====== Statuts ======
window.setStatus = async function(id, label, needHosp=false){
  const m = missions[id]; if(!m) return;
  if(!m.statuts) m.statuts = {};
  if(m.statuts[label]) return; // pas de double encodage
  // Hôpital requis
  if(needHosp){
    const h = await promptHospital();
    if(!h) return;
    m.hopital = h; // {name, addr, lat, lon}
  }
  m.statuts[label] = hhmm(now());
  // Log statuts only (audit minimal)
  m.log = m.log||[]; m.log.push({t:Date.now(), action:'statut', label});

  // Effets : si Retour dispo -> véhicule reste Sorti jusqu’à "Rentré poste"
  // Si Retour indispo -> véhicule Indisponible immédiat
  try{
    await updateKey(MISSIONS_KEY, { [id]: m });
    if(label==='Retour indisponible'){
      const v = m.veh; const d = dispatch[v]||{}; d.statut='Indisponible'; await updateKey(DISPATCH_KEY,{[v]:d});
    }
    if(label==='Rentré poste'){
      const v = m.veh; const d = dispatch[v]||{}; if(d.statut!=='Indisponible') d.statut='Disponible'; await updateKey(DISPATCH_KEY,{[v]:d});
    }
  }catch(e){ console.error(e); }
  renderActive();
};

// ====== Renforts (édition) ======
window.editRenforts = function(id){
  const m = missions[id]; if(!m) return;
  const rf = m.renforts || {};
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${renderRfBlock('pompiers','Pompiers',rf.pompiers)}
      ${renderRfBlock('police','Police',rf.police)}
      ${renderRfBlock('smur','SMUR',rf.smur)}
      ${renderRfBlock('ambu112','Ambu 112',rf.ambu112)}
      ${renderRfBlock('racs','RACS',rf.racs)}
    </div>`;
  quickModal('Renforts', html, async ()=>{
    const keys=['pompiers','police','smur','ambu112','racs'];
    m.renforts = m.renforts || {};
    keys.forEach(k=>{
      const on  = $('#rf_on_'+k).checked;
      const app = $('#rf_app_'+k).checked;
      const sp  = $('#rf_sp_'+k).checked;
      const nt  = $('#rf_nt_'+k).value;
      if(on){
        m.renforts[k] = m.renforts[k]||{};
        if(app) m.renforts[k].appel = m.renforts[k].appel || hhmm(now());
        if(sp)  m.renforts[k].surplace = m.renforts[k].surplace || hhmm(now());
        m.renforts[k].note = nt;
      }else{
        delete m.renforts[k];
      }
    });
    m.log = m.log||[]; m.log.push({t:Date.now(), action:'renforts_edit'});
    await updateKey(MISSIONS_KEY, { [id]: m });
    renderActive();
  });
};
function renderRfBlock(key,label,o={}){
  return `
  <fieldset style="border:1px solid #2c3d52;border-radius:10px;padding:10px">
    <legend>${label}</legend>
    <label><input type="checkbox" id="rf_on_${key}" ${o.appel||o.surplace||o.note?'checked':''}> Activer</label>
    <div class="kp" style="margin-top:6px">
      <label><input type="checkbox" id="rf_app_${key}" ${o.appel?'checked':''}> Appel</label>
      <label><input type="checkbox" id="rf_sp_${key}" ${o.surplace?'checked':''}> Sur place</label>
    </div>
    <label>Commentaire</label>
    <input id="rf_nt_${key}" value="${esc(o.note||'')}">
  </fieldset>`;
}

// ====== Édition mission (motif/PEC/hôpital…) ======
window.editMission = function(id){
  const m = missions[id]; if(!m) return;
  const cpv = [m?.adresse?.cp, m?.adresse?.ville].filter(Boolean).join(' ');
  const hosp = m.hopital?.name || '';
  const html = `
    <label>Motif</label><input id="em_motif" value="${esc(m.motif||'')}">
    <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:12px">
      <div><label>Rue</label><input id="em_rue" value="${esc(m.adresse?.rue||'')}"></div>
      <div><label>N° / Boîte</label><input id="em_num" value="${esc(m.adresse?.num||'')}"></div>
      <div><label>Code postal</label><input id="em_cp" value="${esc(m.adresse?.cp||'')}" maxlength="4"></div>
      <div><label>Localité</label><input id="em_ville" value="${esc(m.adresse?.ville||'')}"></div>
    </div>
    <label>Hôpital destination</label>
    <div style="display:flex;gap:8px">
      <input id="em_hosp" value="${esc(hosp)}" placeholder="Rechercher un hôpital…">
      <button class="btn" type="button" id="em_hSearch">Rechercher</button>
    </div>
    <div id="em_hResults" class="small" style="margin-top:6px"></div>
  `;
  quickModal('Éditer la mission', html, async ()=>{
    m.motif = $('#em_motif').value||'';
    m.adresse = { rue:$('#em_rue').value||'', num:$('#em_num').value||'', cp:$('#em_cp').value||'', ville:$('#em_ville').value||'' };
    const chosen = $('#em_hosp').getAttribute('data-json');
    if(chosen){ try{ m.hopital = JSON.parse(chosen); }catch{} }
    m.log = m.log||[]; m.log.push({t:Date.now(), action:'edit'});
    await updateKey(MISSIONS_KEY, { [id]: m });
    renderActive();
  });
  // CP auto
  $('#em_cp').addEventListener('input', (e)=>{ const cp=(e.target.value||'').trim(); if(POSTAL_MAP[cp]) $('#em_ville').value=POSTAL_MAP[cp]; });
  // Hosp search
  $('#em_hSearch').onclick = async ()=>{
    const q = ($('#em_hosp').value||'').trim(); if(!q) return;
    const res = await searchHospital(q);
    const box = $('#em_hResults');
    if(!res.length){ box.textContent='Aucun résultat'; return; }
    box.innerHTML = res.map(r=>`<div><a href="#" data-h='${JSON.stringify(r)}'>${esc(r.name)}</a><br><span class="small">${esc(r.addr)}</span></div>`).join('<hr style="border-color:#223044">');
    box.querySelectorAll('a[data-h]').forEach(a=>{
      a.onclick=(e)=>{e.preventDefault(); const data=a.getAttribute('data-h'); $('#em_hosp').value=JSON.parse(data).name; $('#em_hosp').setAttribute('data-json', data); box.innerHTML='Choisi: '+esc(JSON.parse(data).name);};
    });
  };
};

// ====== Clôture ======
window.closeMission = async function(id){
  const m = missions[id]; if(!m) return;
  // km requis
  const dep = parseInt(m.kmDep||'',10);
  const ret = parseInt(m.kmRet||'',10);
  if(!(dep>0 && ret>0)){ alert('Indique les kilomètres départ et retour.'); return; }
  // règles: Retour dispo/indispo OU Rentré poste obligatoire selon choix
  const hasReturn = m.statuts?.['Retour dispo'] || m.statuts?.['Retour indisponible'] || m.statuts?.['Rentré poste'];
  if(!hasReturn){ alert('Pose au moins Retour dispo / indisponible (et Rentré poste si dispo).'); return; }

  m.diffKm = ret - dep;
  m.heures = { ...m.statuts };
  m.done = true;

  try{
    await updateKey(MISSIONS_KEY, { [id]: m });
    // Archive (sans displayOrder)
    const { displayOrder, ...archObj } = m;
    await updateKey(ARCHIVE_KEY, { [id]: archObj });
    // Cleanup: véhicule dispo si pas indispo
    const v = m.veh; const d = dispatch[v]||{};
    if(!m.statuts['Retour indisponible']) d.statut='Disponible';
    await updateKey(DISPATCH_KEY, { [v]: d });
  }catch(e){ console.error(e); }
};

// ====== Missions du jour (done) ======
function renderDone(){
  const tb=$('#tblDone tbody'); tb.innerHTML='';
  const today=todayKey();
  const done=Object.values(missions).filter(m=>m.done && m.day===today);
  done.sort((a,b)=> (b.statuts?.['Appel']||'') < (a.statuts?.['Appel']||'') ? -1 : 1);
  done.forEach(m=>{
    const hrs=Object.entries(m.heures||{}).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join('<br>');
    tb.insertAdjacentHTML('beforeend',`
      <tr>
        <td><input type="checkbox" class="selDone" data-id="${esc(m.id)}"></td>
        <td>${esc(m.veh)} ${m.attr?`<span class="badge">${esc(m.attr)}</span>`:''}</td>
        <td>${esc(m.type||'—')}</td>
        <td>${esc(m.motif||'—')}</td>
        <td>${esc(m.diffKm??'')}</td>
        <td>${hrs}</td>
      </tr>
    `);
  });
}

// Suppression missions du jour sélectionnées -> archive déjà rempli; on supprime de MISSIONS
$('#btnDeleteDone').onclick = async ()=>{
  const pw = prompt('Mot de passe administrateur :'); if(pw===null) return;
  if(pw!==ADMIN_PASSWORD){ alert('Mot de passe incorrect.'); return; }
  const ids = Array.from(document.querySelectorAll('.selDone:checked')).map(x=>x.dataset.id);
  if(!ids.length){ alert('Sélectionne au moins une mission.'); return; }
  const patch={}; ids.forEach(id=> patch[id]=null);
  try{ await updateKey(MISSIONS_KEY, patch); renderDone(); }catch(e){ console.error(e); }
};

// ====== Quick modal (réutilisé) ======
function quickModal(title, html, onValidate){
  const back=document.createElement('div'); back.className='modal-back'; back.style.display='flex';
  back.innerHTML=`
  <div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><h2>${esc(title)}</h2><button class="btn bad" type="button" id="qm_close">Fermer</button></div>
    <div class="mc">${html}</div>
    <div class="mf"><span></span><button class="btn" id="qm_ok" type="button">Valider</button></div>
  </div>`;
  document.body.appendChild(back);
  $('#qm_close').onclick=()=>document.body.removeChild(back);
  $('#qm_ok').onclick=async ()=>{ try{ await onValidate?.(); } finally{ document.body.removeChild(back); } };
}

// ====== Hôpital search via Nominatim + cache ======
async function searchHospital(q){
  const key=q.toLowerCase().trim();
  // suggestions du cache si nom déjà connu
  const cacheMatches = Object.values(HOSP_CACHE).filter(x=> x.name.toLowerCase().includes(key));
  if(cacheMatches.length>=5) return cacheMatches.slice(0,8);

  // fallback API
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q+' hospital Belgium')}&limit=8&email=noreply@acsrs.be`;
  const res = await fetch(url, {headers:{'Accept':'application/json'}});
  const js = await res.json();
  const out = js.map(r=>{
    const name = r.display_name.split(',')[0];
    const addr = r.display_name;
    return { name, addr, lat:r.lat, lon:r.lon };
  });
  // enregistre dans le cache
  out.forEach(o=> HOSP_CACHE[o.name]=o);
  localStorage.setItem('KNOWN_HOSPS', JSON.stringify(HOSP_CACHE));
  return out;
}

// ====== Hospital prompt (utilisé par setStatus En charge vers hôpital) ======
function promptHospital(){
  return new Promise((resolve)=>{
    quickModal('Hôpital de destination', `
      <div style="display:flex;gap:8px">
        <input id="ph_q" placeholder="Nom d’hôpital…">
        <button class="btn" id="ph_go" type="button">Rechercher</button>
      </div>
      <div id="ph_res" class="small" style="margin-top:8px"></div>
    `, ()=>{ /* validate sans choix -> none */ resolve(null); });
    $('#ph_go').onclick = async ()=>{
      const q = ($('#ph_q').value||'').trim(); if(!q) return;
      const res = await searchHospital(q);
      const box = $('#ph_res');
      if(!res.length){ box.textContent='Aucun résultat'; return; }
      box.innerHTML = res.map(r=>`<div><a href="#" data-h='${JSON.stringify(r)}'>${esc(r.name)}</a><br><span class="small">${esc(r.addr)}</span></div>`).join('<hr style="border-color:#223044">');
      box.querySelectorAll('a[data-h]').forEach(a=>{
        a.onclick=(e)=>{e.preventDefault(); const data=JSON.parse(a.getAttribute('data-h')); resolve(data); document.querySelector('.modal-back:last-of-type')?.remove(); };
      });
    };
  });
}
