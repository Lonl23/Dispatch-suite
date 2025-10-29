// tv-grid.js — rendu TV (Hall, Garage style "comme le hall", Rôles, Bannière)

const DISPATCH_KEY = 'dispatch_parc_vehicules';
const MISSIONS_KEY = 'dispatch_missions';

let dispatch = {};
let missions = {};
let vehSettings = [];

/* ================== Injection CSS (sans changer le HTML) ================== */
(function injectStyles(){
  const css = `
  /* Rôles plus grands */
  .roles { display:flex; flex-wrap:wrap; gap:16px; padding:8px 0; }
  .roles .role{
    font-size:22px; font-weight:800;
    background:#0f1520; border:1px solid #2c3d52;
    border-radius:12px; padding:8px 12px; color:#cfe1ff;
  }

  /* Bannière + gros espacement entre blocs */
  .ticker{ height:56px; background:#b00020; color:#fff; display:flex; align-items:center; overflow:hidden; border-top:1px solid #7a0016; font-size:24px; }
  .marquee{ white-space:nowrap; display:flex; gap:96px; width:100%; }
  .scroll{ display:flex; gap:96px; will-change:transform; animation:scroll 40s linear infinite; }
  @keyframes scroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
  .sepchar{ display:inline-block; padding:0 36px; color:#ffdede; opacity:.9; }

  /* Tuiles communes Hall + Garage */
  .vtile{
    width:100%; border-radius:14px;
    box-shadow: inset 0 0 0 2px rgba(0,0,0,.22), 0 8px 16px rgba(0,0,0,.5);
    padding:10px 12px; display:flex; flex-direction:column; justify-content:center; text-align:center; line-height:1.3;
  }
  .vtile .line1{ font-weight:800; font-size:16px; letter-spacing:.2px; }
  .vtile .line2{ margin-top:4px; font-size:14px; opacity:.95; }
  .vtile .line3{ margin-top:3px; font-size:13px; opacity:.9; }

  /* Slot vide (gris neutre) et statuts avec contraste texte */
  .st-empty{ background:#d3d3d3; color:#000; border:2px solid #c6c6c6; }
  .st-dispo{ background:#00a032; color:#fff; }
  .st-indispo{ background:#c00000; color:#fff; }
  @keyframes blinkDepart{ 0%,49%{background:#005DFF} 50%,100%{background:#003EAD} }
  .st-depart{ animation:blinkDepart 1.2s linear infinite; color:#fff; }
  .st-surplace{ background:#ffd500; color:#000; }
  .st-encharge{ background:#ff75a0; color:#000; }
  .st-hopital{ background:#ff7f00; color:#000; }

  /* ==== GARAGE "comme le hall" (grille uniforme) ==== */
  /* On applique cette classe au parent commun des slots G1..G8 */
  .garage-like-hall{
    display:grid;
    grid-template-columns: repeat(3, 1fr);
    gap:16px;
    background:#0f1520;
    border:1px solid #2c3d52;
    border-radius:14px;
    padding:16px;
    box-shadow:0 20px 40px rgba(0,0,0,.4) inset;
    margin-top:8px;
  }
  /* Chaque slot G* prend la même taille visuelle (comme une tuile du hall) */
  .garage-like-hall > div[id^="slot-G"]{
    min-height:180px; /* uniforme */
    display:flex;
    align-items:center;
    justify-content:center;
  }

  /* Option: si besoin, adapter hauteur sur écrans plus petits */
  @media (max-height:1000px){
    .garage-like-hall > div[id^="slot-G"]{ min-height:150px; }
  }
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

/* ================== Rôles ================== */
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

/* ================== Tuile ================== */
function makeTile(info, statKey){
  if (!info){
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

/* ================== Garage style "comme le hall" (sans toucher HTML) ================== */
function applyGarageLikeHall(){
  // Trouve un parent commun pour G1..G8
  const gids = ["slot-G1","slot-G2","slot-G3","slot-G4","slot-G5","slot-G6","slot-G7","slot-G8"];
  const nodes = gids.map(id=>document.getElementById(id)).filter(Boolean);
  if (!nodes.length) return;

  // On prend le parent du premier slot G* comme conteneur garage
  const parent = nodes[0].parentElement;
  if (!parent) return;

  // Si un ancien layout "enhanced" existe, on ne l'utilise plus
  const old = document.querySelector('.garage-enhanced');
  if (old && old.parentNode) old.parentNode.removeChild(old);

  // Applique la classe grille uniforme (comme hall)
  parent.classList.add('garage-like-hall');
}

/* ================== Rendu Hall + Garage ================== */
function renderGrid(){
  // Réinitialise
  const slots = ["Ext","H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","G1","G2","G3","G4","G5","G6","G7","G8"];
  slots.forEach(s=>{
    const el = document.getElementById('slot-'+s);
    if (el) el.innerHTML = makeTile(null, 'dispo');
  });

  // Place véhicules
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

/* ================== Bannière ================== */
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
    b1.innerHTML = html + html; // doublé = défilement sans couture
    b2.innerHTML = b1.innerHTML;
  }
}

/* ================== Subscriptions (store-bridge.js) ================== */
subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  vehSettings = Array.isArray(dispatch._settings?.vehs) ? dispatch._settings.vehs : [];
  renderRoles();
  applyGarageLikeHall();   // <- style garage comme hall (grille uniforme)
  renderGrid();
  renderBanner();
},{ mode:'poll', intervalMs:3000 });

subscribeKey(MISSIONS_KEY, snap=>{
  missions = snap || {};
  renderGrid(); // met à jour les couleurs selon statuts mission
},{ mode:'poll', intervalMs:4000 });
