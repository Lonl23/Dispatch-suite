// tv-grid.js — rendu TV (Hall, Garage, Rôles, Bannière) sans modifier le HTML à la main

const DISPATCH_KEY = 'dispatch_parc_vehicules';
const MISSIONS_KEY = 'dispatch_missions';

let dispatch = {};
let missions = {};
let vehSettings = [];

/* ================== Injection de styles (sans toucher au HTML) ================== */
(function injectDynamicStyles(){
  const css = `
  /* RÔLES plus grands en capsules */
  .roles { display:flex; flex-wrap:wrap; gap:16px; padding:8px 0; }
  .roles .role{
    font-size:22px; font-weight:800;
    background:#0f1520; border:1px solid #2c3d52;
    border-radius:12px; padding:8px 12px; color:#cfe1ff;
  }

  /* BANNIÈRE + gros espacement */
  .ticker{ height:56px; background:#b00020; color:#fff; display:flex; align-items:center; overflow:hidden; border-top:1px solid #7a0016; font-size:24px; }
  .marquee{ white-space:nowrap; display:flex; gap:96px; width:100%; }
  .scroll{ display:flex; gap:96px; will-change:transform; animation:scroll 40s linear infinite; }
  @keyframes scroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
  .sepchar{ display:inline-block; padding:0 36px; color:#ffdede; opacity:.9; }

  /* TUILES (communes Hall + Garage) */
  .vtile{
    width:100%; border-radius:14px;
    box-shadow: inset 0 0 0 2px rgba(0,0,0,.22), 0 8px 16px rgba(0,0,0,.5);
    padding:10px 12px; display:flex; flex-direction:column; justify-content:center; text-align:center; line-height:1.3;
  }
  .vtile .line1{ font-weight:800; font-size:16px; letter-spacing:.2px; }
  .vtile .line2{ margin-top:4px; font-size:14px; opacity:.95; }
  .vtile .line3{ margin-top:3px; font-size:13px; opacity:.9; }

  /* Slots vides et statuts (contraste texte inclus) */
  .st-empty{ background:#d3d3d3; color:#000; border:2px solid #c6c6c6; }
  .st-dispo{ background:#00a032; color:#fff; }
  .st-indispo{ background:#c00000; color:#fff; }
  @keyframes blinkDepart{ 0%,49%{background:#005DFF} 50%,100%{background:#003EAD} }
  .st-depart{ animation:blinkDepart 1.2s linear infinite; color:#fff; }
  .st-surplace{ background:#ffd500; color:#000; }
  .st-encharge{ background:#ff75a0; color:#000; }
  .st-hopital{ background:#ff7f00; color:#000; }

  /* --- AMÉLIORATION GARAGE (créée dynamiquement par JS) --- */
  .garage-enhanced{
    display:grid; grid-template-columns: 1fr 1fr 1fr;
    gap:16px; background:#0f1520; border:1px solid #2c3d52; border-radius:14px; padding:16px;
    box-shadow:0 20px 40px rgba(0,0,0,.4) inset;
    margin-top:8px;
  }
  .gar-block{
    background:#101926; border:1px solid #2c3d52; border-radius:12px; padding:12px;
    display:flex; flex-direction:column; justify-content:flex-start; gap:12px;
    box-shadow:0 8px 20px rgba(0,0,0,.6);
  }
  .gar-slot{ min-height:180px; display:flex; align-items:center; justify-content:center; }
  .small-slot{ min-height:90px; }
  .mid-slot{ min-height:130px; }

  /* Positionnement logique sans dépendre du HTML initial */
  .gar-pos-tall-left { grid-column:1; grid-row:1 / span 2; }
  .gar-pos-tall-mid  { grid-column:2; grid-row:1 / span 2; }
  .gar-pos-stack-r   { grid-column:3; grid-row:1; }
  .gar-pos-wide-mid  { grid-column:3; grid-row:2; }
  .gar-bottom        { grid-column:1 / span 3; grid-row:3; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .gar-bottom .gar-block{ height:100%; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ================== Horloge & Date ================== */
function updateClock(){
  const d = new Date();
  const z = n => String(n).padStart(2,'0');
  const jours=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const mois=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const dateTxt = `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  const timeTxt = `${z(d.getHours())}:${z(d.getMinutes())}`;
  const dateEl = document.getElementById('dateTxt');
  const clockEl = document.getElementById('clock');
  if (dateEl) dateEl.textContent = dateTxt;
  if (clockEl) clockEl.textContent = timeTxt;
}
setInterval(updateClock, 1000);
updateClock();

/* ================== Météo (La Hulpe) ================== */
async function loadMeteo(){
  try{
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=50.73&longitude=4.48&current=temperature_2m,weather_code&timezone=Europe/Brussels");
    const j = await r.json();
    const t = Math.round(j?.current?.temperature_2m ?? 0);
    const c = j?.current?.weather_code ?? 3;
    const map={0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",95:"⛈️"};
    const meteoEl = document.getElementById('meteo');
    if (meteoEl) meteoEl.textContent = `${map[c]||"☁️"} ${t}°C La Hulpe`;
  }catch(e){ console.log('meteo error',e); }
}
loadMeteo();
setInterval(loadMeteo, 10*60*1000);

/* ================== Utils ================== */
function esc(s){
  return String(s??'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function norm(s){
  return String(s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/['’"]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

/* ================== Rôles de commandement ================== */
function renderRoles(){
  const r = dispatch._roles || {};
  const parts = [
    r.officier_semaine && `Off semaine: ${esc(r.officier_semaine)}`,
    r.officier_garde && `Off garde: ${esc(r.officier_garde)}`,
    r.responsable_operations && `Resp opé: ${esc(r.responsable_operations)}`,
    r.chef_groupe && `Chef groupe: ${esc(r.chef_groupe)}`,
    r.chef_poste && `Chef poste: ${esc(r.chef_poste)}`,
    r.centraliste_1 && `1er centr.: ${esc(r.centraliste_1)}`,
    r.centraliste_2 && `2e centr.: ${esc(r.centraliste_2)}`
  ].filter(Boolean);
  const box = document.getElementById('roles');
  if (!box) return;
  box.innerHTML = parts.length
    ? parts.map(t=>`<div class="role">${t}</div>`).join('')
    : '<div class="role">Aucun rôle encodé</div>';
}

/* ================== Statut affiché (missions > dispatch) ================== */
function statusClass(key){
  switch(key){
    case 'indispo':  return 'st-indispo';
    case 'depart':   return 'st-depart';
    case 'surplace': return 'st-surplace';
    case 'encharge': return 'st-encharge';
    case 'hopital':  return 'st-hopital';
    case 'dispo':
    default:         return 'st-dispo';
  }
}

function computeVehStatus(vehId){
  const ms = Object.values(missions).filter(m=>!m.done && m.veh===vehId);
  if (ms.length){
    ms.sort((a,b)=>(b.id||"")<(a.id||"")?-1:1);
    const s = ms[0].statuts || {};
    const keys = Object.keys(s).map(norm);

    // Priorités
    if (keys.includes("retour indisponible") || keys.includes("mise indispo")){
      return "indispo";        // Rouge immédiat
    }
    if (keys.includes("retour dispo") || keys.includes("retour disponible")){
      return "dispo";          // Vert immédiat
    }
    if (keys.includes("arrive hopital") || keys.includes("a l hopital")){
      return "hopital";        // Orange
    }
    if (keys.some(k => k.startsWith("en charge"))){
      return "encharge";       // Rose
    }
    if (keys.includes("sur place")){
      return "surplace";       // Jaune
    }
    if (keys.includes("depart")){
      return "depart";         // Bleu clignotant
    }
  }

  // Sinon, statut dispatch
  const d = dispatch[vehId] || {};
  if ((d.statut||"") === "Indisponible") return "indispo";
  return "dispo";
}

/* ================== Tuile véhicule ================== */
function makeTile(info, statKey){
  if (!info){
    // Slot libre → gris neutre
    return `<div class="vtile st-empty"><div class="line1">LIBRE</div></div>`;
  }
  const cls = statusClass(statKey);
  const l1 = [info.name, info.attr, info.plaque].filter(Boolean).join(' - ');
  const crew = [info.XO, info.S, info.PS].filter(Boolean).join(' / ');
  const l2 = crew ? `<div class="line2">${esc(crew)}</div>` : '';
  const l3 = info.km ? `<div class="line3">${esc(info.km)} km</div>` : '';
  return `<div class="vtile ${cls}">
    <div class="line1">${esc(l1||info.name)}</div>${l2}${l3}
  </div>`;
}

/* ================== AMÉLIORATION GARAGE sans modifier le HTML ================== */
/* On crée dynamiquement une grille "garage-enhanced" et on y déplace les slots G1..G8
   Si on ne trouve pas de point d'ancrage dédié, on insère juste après le parent du premier slot G. */
function enhanceGaragePresentation(){
  const ids = ["slot-G1","slot-G8","slot-G2","slot-G3","slot-G4","slot-G5","slot-G6","slot-G7"];
  const nodes = ids.map(id=>document.getElementById(id)).filter(Boolean);
  if (!nodes.length) return; // rien à faire si pas de slots G*

  // Cherche une ancre explicite si elle existe
  let anchor = document.getElementById('garage-anchor');
  // Sinon, prend le parent commun du premier slot
  if (!anchor){
    anchor = nodes[0].parentElement || document.body;
  }

  // Évite de doubler si déjà construit
  if (document.querySelector('.garage-enhanced')) return;

  // Crée la grille garage
  const grid = document.createElement('div');
  grid.className = 'garage-enhanced';

  // Crée les blocs conformément au plan demandé (sans changer les IDs des slots)
  // G1 (colonne gauche haute)
  const bG1 = document.createElement('div');
  bG1.className = 'gar-block gar-pos-tall-left';
  const sG1 = wrapSlot('slot-G1', 'gar-slot');
  if (sG1) bG1.appendChild(sG1);

  // G8 (colonne milieu haute)
  const bG8 = document.createElement('div');
  bG8.className = 'gar-block gar-pos-tall-mid';
  const sG8 = wrapSlot('slot-G8', 'gar-slot');
  if (sG8) bG8.appendChild(sG8);

  // Stack G2-G4 (droite haute)
  const bStack = document.createElement('div');
  bStack.className = 'gar-block gar-pos-stack-r';
  ['slot-G2','slot-G3','slot-G4'].forEach(id=>{
    const node = wrapSlot(id, 'gar-slot small-slot');
    if (node) bStack.appendChild(node);
  });

  // G5 (sous la pile)
  const bG5 = document.createElement('div');
  bG5.className = 'gar-block gar-pos-wide-mid';
  const sG5 = wrapSlot('slot-G5', 'gar-slot mid-slot');
  if (sG5) bG5.appendChild(sG5);

  // Bas: G6 / G7 côte à côte
  const bottom = document.createElement('div');
  bottom.className = 'gar-bottom';
  ['slot-G6','slot-G7'].forEach(id=>{
    const b = document.createElement('div');
    b.className = 'gar-block';
    const s = wrapSlot(id, 'gar-slot');
    if (s) b.appendChild(s);
    bottom.appendChild(b);
  });

  // Ajoute les blocs présents
  [bG1,bG8,bStack,bG5,bottom].forEach(b=>{ if (b && b.childNodes.length) grid.appendChild(b); });

  // Insère la grille juste après l'ancre / parent
  if (anchor.nextSibling){
    anchor.parentNode.insertBefore(grid, anchor.nextSibling);
  }else{
    anchor.parentNode.appendChild(grid);
  }
}

/* Déplace le slot existant dans un conteneur décoratif et renvoie ce conteneur */
function wrapSlot(slotId, cls){
  const el = document.getElementById(slotId);
  if (!el) return null;

  // Crée un conteneur visuel, et y place le slot (en conservant l'ID du slot)
  const holder = document.createElement('div');
  holder.className = cls;

  // On garde l'élément slot tel quel (avec son ID), on le déplace simplement dans holder
  // Si le slot a déjà un parent avec classes gar-slot/gar-block (reconstruit), on ne duplique pas
  if (el.parentElement && el.parentElement.classList.contains('gar-slot')) {
    return el.parentElement; // déjà wrap
  }

  // Déplacement : on insère le holder à la place du slot, puis on y met le slot
  const parent = el.parentElement;
  if (parent){
    parent.replaceChild(holder, el);
    holder.appendChild(el);
  }else{
    holder.appendChild(el);
  }
  return holder;
}

/* ================== Rendu Hall + Garage ================== */
function renderGrid(){
  // Réinitialise tous les slots en LIBRE
  const slots = ["Ext","H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","G1","G2","G3","G4","G5","G6","G7","G8"];
  slots.forEach(s=>{
    const el = document.getElementById('slot-'+s);
    if (el) el.innerHTML = makeTile(null, 'dispo');
  });

  // Place chaque véhicule connu à son slot
  (vehSettings||[]).forEach(v=>{
    const raw = v.emplacement || '';
    const slot = raw.replace('Extérieur','Ext');
    const el = document.getElementById('slot-'+slot);
    if (!el) return;
    const id = v.id;
    const d  = dispatch[id] || {};
    const st = computeVehStatus(id);
    el.innerHTML = makeTile({
      name: d.name || v.name || v.id,
      attr: d.attribution || v.attribution || '',
      plaque: d.plaque || v.plaque || '',
      XO: d.XO || '', S: d.S || '', PS: d.PS || '',
      km: d.km || ''
    }, st);
  });
}

/* ================== Bannière bas ================== */
function renderBanner(){
  const notes = dispatch._notes || {};
  const outs = [];
  (dispatch._settings?.vehs||[]).forEach(v=>{
    const d = dispatch[v.id];
    if (d?.statut === 'Indisponible'){
      let t = (d.name||v.id);
      if (d.attribution||v.attribution) t += ` [${d.attribution||v.attribution}]`;
      if (d.commentaire) t += ` — ${d.commentaire}`;
      outs.push(t);
    }
  });
  const parts=[];
  if ((notes.infos||'').trim()){
    parts.push(`INFOS: ${esc(notes.infos.replace(/\s+/g,' ').trim())}`);
  }
  if (outs.length){
    parts.push(`VÉHICULE OUT: ${esc(outs.join(' • '))}`);
  }
  if ((notes.materiel||'').trim()){
    parts.push(`MATÉRIEL: ${esc(notes.materiel.replace(/\s+/g,' ').trim())}`);
  }

  const html = parts.length
    ? parts.join(`<span class="sepchar">|</span>`)
    : `Aucune information`;

  const b1 = document.getElementById('band1');
  const b2 = document.getElementById('band2');
  if (b1 && b2){
    b1.innerHTML = html + html; // doublé pour scroll sans couture
    b2.innerHTML = b1.innerHTML;
  }
}

/* ================== Subscriptions (via store-bridge.js) ================== */
subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  vehSettings = Array.isArray(dispatch._settings?.vehs) ? dispatch._settings.vehs : [];
  renderRoles();
  // Améliore le garage au premier passage (crée la grille et wrap les slots existants)
  enhanceGaragePresentation();
  renderGrid();
  renderBanner();
},{ mode:'poll', intervalMs:3000 });

subscribeKey(MISSIONS_KEY, snap=>{
  missions = snap || {};
  renderGrid(); // met à jour les couleurs selon le statut mission
},{ mode:'poll', intervalMs:4000 });
