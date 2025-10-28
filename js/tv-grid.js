// tv-grid.js — Lecture Firebase + rendu TV (Hall/Ext/Garage, Rôles, Météo, Bannière)

const DISPATCH_KEY = 'dispatch_parc_vehicules';
const MISSIONS_KEY = 'dispatch_missions';

let dispatch = {};
let missions = {};
let vehSettings = [];

/* ======= Horloge & Date ======= */
function updateClock(){
  const d = new Date();
  const z = n => String(n).padStart(2,'0');
  const jours=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const mois=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const dateTxt = `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  const dateEl = document.getElementById('dateTxt');
  const clockEl = document.getElementById('clock');
  if (dateEl) dateEl.textContent = dateTxt;
  if (clockEl) clockEl.textContent = `${z(d.getHours())}:${z(d.getMinutes())}`;
}
setInterval(updateClock, 1000);
updateClock();

/* ======= Météo (La Hulpe) ======= */
async function loadMeteo(){
  try{
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=50.73&longitude=4.48&current=temperature_2m,weather_code&timezone=Europe/Brussels");
    const j = await r.json();
    const t = Math.round(j.current.temperature_2m);
    const c = j.current.weather_code;
    const map={0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",95:"⛈️"};
    const el = document.getElementById('meteo');
    if (el) el.textContent = `${map[c]||"☁️"} ${t}°C La Hulpe`;
  }catch(e){ console.log('meteo error',e); }
}
loadMeteo();
setInterval(loadMeteo, 10*60*1000);

/* ======= Helpers ======= */
function esc(s){
  return String(s??'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
// Normalisation des clés de statuts pour matching robuste
function norm(s){
  return String(s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/['’"]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

/* ======= Rôles ======= */
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

/* ======= Statut TV (missions > dispatch) ======= */
function computeVehStatus(vehId){
  // mission active ?
  const ms = Object.values(missions).filter(m=>!m.done && m.veh===vehId);
  if (ms.length){
    ms.sort((a,b)=>(b.id||"")<(a.id||"")?-1:1); // plus récent
    const s = ms[0].statuts || {};
    const keys = Object.keys(s).map(norm);

    // PRIORITÉS TV
    // 1) Retour indisponible / Mise indispo => rouge immédiat
    if (keys.includes("retour indisponible") || keys.includes("mise indispo")){
      return "indispo";
    }
    // 2) Retour dispo => vert immédiat (même sans "Rentré poste")
    if (keys.includes("retour dispo") || keys.includes("retour disponible")){
      return "dispo";
    }
    // 3) À l’hôpital
    if (keys.includes("arrive hopital") || keys.includes("a l hopital")){
      return "hopital";
    }
    // 4) En charge (toutes variantes)
    if (keys.some(k => k.startsWith("en charge"))){
      return "encharge";
    }
    // 5) Sur place
    if (keys.includes("sur place")){
      return "surplace";
    }
    // 6) Départ
    if (keys.includes("depart")){
      return "depart";
    }
  }

  // Sinon, statut dispatch
  const d = dispatch[vehId] || {};
  if ((d.statut||"") === "Indisponible") return "indispo";
  return "dispo";
}

function statusClass(key){
  switch(key){
    case 'indispo': return 'st-indispo';
    case 'depart': return 'st-depart';
    case 'surplace': return 'st-surplace';
    case 'encharge': return 'st-encharge';
    case 'hopital': return 'st-hopital';
    default: return 'st-dispo'; // disponible
  }
}

/* ======= Tuiles (slots) ======= */
function makeTile(info, statKey){
  if (!info){
    // Slot libre → gris neutre (inline style si .st-empty non défini en CSS)
    return `<div class="vtile st-empty" style="background:#555;color:#fff;border:2px solid #666;border-radius:10px;display:flex;align-items:center;justify-content:center;">
      <div class="line1">LIBRE</div>
    </div>`;
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

/* ======= Rendu Hall + Garage ======= */
function renderGrid(){
  const slots = ["Ext","H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","G1","G2","G3","G4","G5","G6","G7","G8"];
  // par défaut: LIBRE (gris)
  slots.forEach(s=>{
    const el = document.getElementById('slot-'+s);
    if (el) el.innerHTML = makeTile(null, 'dispo');
  });

  // Place les véhicules connus à leur emplacement
  (vehSettings||[]).forEach(v=>{
    const slotRaw = v.emplacement || '';
    const slot = slotRaw.replace('Extérieur','Ext');
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

/* ======= Bannière (défilement continu) ======= */
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
  if (outs.length) parts.push(`VÉHICULE OUT: ${esc(outs.join(' • '))}`);
  if ((notes.materiel||'').trim()) parts.push(`MATÉRIEL: ${esc(notes.materiel.replace(/\s+/g,' ').trim())}`);
  if ((notes.infos||'').trim()) parts.push(`INFOS: ${esc(notes.infos.replace(/\s+/g,' ').trim())}`);

  const content = parts.length ? parts.join(`<span class="sepchar">|</span>`) : `Aucune information`;
  const b1 = document.getElementById('band1'), b2 = document.getElementById('band2');
  if (b1 && b2){
    b1.innerHTML = content + content; // doublé pour loop fluide
    b2.innerHTML = b1.innerHTML;
  }
}

/* ======= Subscriptions (polling stable) ======= */
subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  vehSettings = Array.isArray(dispatch._settings?.vehs) ? dispatch._settings.vehs : [];
  renderRoles();
  renderGrid();
  renderBanner();
},{ mode:'poll', intervalMs:3000 });

subscribeKey(MISSIONS_KEY, snap=>{
  missions = snap || {};
  renderGrid(); // met à jour les couleurs selon statuts mission
},{ mode:'poll', intervalMs:4000 });
