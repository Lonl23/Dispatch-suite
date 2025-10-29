// tv-missions.js — Colonne missions + Carte OSM + Ticker
const MISSIONS_KEY = "dispatch_missions";
const DISPATCH_KEY = "dispatch_parc_vehicules";

// Base (La Hulpe — Avenue René Soyer 3)
const BASE = { lat: 50.730716, lon: 4.494684, label: "Base ACSRS" };

let missions = {};
let dispatch = {};
let map, baseMarker, missionLayer;

function z2(n){ return String(n).padStart(2,'0'); }
function nowHHMM(){ const d=new Date(); return `${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`; }
function esc(s){ return String(s??"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function norm(s){
  return String(s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/['’"]/g,"")
    .replace(/\s+/g," ").trim();
}

/* Horloge */
setInterval(()=>{ document.getElementById('clock').textContent = nowHHMM(); }, 1000);
document.getElementById('clock').textContent = nowHHMM();

/* Leaflet Map */
function initMap(){
  map = L.map('map',{ zoomControl:false, attributionControl:false }).setView([BASE.lat, BASE.lon], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19
  }).addTo(map);
  baseMarker = L.circleMarker([BASE.lat, BASE.lon], { radius:8, color:'#3a8bf2', fillColor:'#3a8bf2', fillOpacity:1 })
    .addTo(map)
    .bindTooltip(BASE.label, { direction:'top' });
  missionLayer = L.layerGroup().addTo(map);
}
initMap();

/* Geocache simple (localStorage) pour Nominatim */
const GEO_CACHE_KEY = "geo_cache";
function geoCacheGet(key){
  try{ const c=JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||"{}"); return c[key]; }catch{ return undefined; }
}
function geoCacheSet(key,val){
  try{ const c=JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||"{}"); c[key]=val; localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c)); }catch{}
}

/* Détermine statut courant + heure affichable */
const FLOW_ORDER = ["depart","sur place","en charge","a l hopital","retour dispo","retour indisponible","rentre poste","retour au poste"];
function currentStatus(m){
  const s = m.statuts || {};
  // Normalise et trouve le plus “avancé” selon FLOW_ORDER
  let bestKey = "depart", bestTime = "";
  const entries = Object.entries(s);
  if (!entries.length) return { key:"depart", time:"" };

  // map entries -> normalized key
  const normed = entries.map(([k,v])=>[norm(k),v]);
  for(const wanted of FLOW_ORDER){
    const hit = normed.find(([k])=>{
      if (wanted==="en charge") return k.startsWith("en charge");
      if (wanted==="a l hopital") return (k.includes("hopital") || k.includes("hôpital"));
      if (wanted==="retour dispo") return (k.includes("retour dispo") || k.includes("retour disponible"));
      if (wanted==="retour indisponible") return (k.includes("retour indispo") || k.includes("mise indispo"));
      if (wanted==="rentre poste" || wanted==="retour au poste") return k.includes("poste");
      return k===wanted;
    });
    if (hit){ bestKey=wanted; bestTime=hit[1]; }
  }
  return { key:bestKey, time:bestTime };
}

/* Classe couleur statut pour pill */
function statusClass(key){
  switch(key){
    case "retour indisponible": return "st-indispo";
    case "a l hopital": return "st-hopital";
    case "en charge": return "st-encharge";
    case "sur place": return "st-surplace";
    case "depart": return "st-depart";
    case "retour dispo": return "st-dispo";
    default: return "st-dispo";
  }
}

/* Attribution ordre: plus petit entier libre, stable tant que non clos */
function ensureOrderNumbers(){
  const active = Object.values(missions).filter(m=>!m.done);
  // Occupés
  const used = new Set(active.map(m=>m.ordre).filter(x=>Number.isInteger(x)));
  function nextFree(){
    let n=1; while(used.has(n)) n++; return n;
  }
  // Assigne si manquant
  active.sort((a,b)=>(+a.id)-(+b.id)); // stable
  let changed=false;
  active.forEach(m=>{
    if (!Number.isInteger(m.ordre)){
      m.ordre = nextFree();
      used.add(m.ordre);
      changed=true;
    }
  });
  if (changed){
    // Sauve dans store pour persister
    writeKey(MISSIONS_KEY, missions);
  }
}

/* Rendu liste gauche */
function renderList(){
  ensureOrderNumbers();
  const list = document.getElementById('list');
  const sub = document.getElementById('subTitle');

  const active = Object.values(missions).filter(m=>!m.done);
  // tri par ordre croissant (numéro fixe)
  active.sort((a,b)=> (a.ordre||999) - (b.ordre||999));

  document.getElementById('count').textContent = `${active.length} mission(s)`;
  sub.textContent = active.length ? "Dernières missions actives" : "Aucune mission en cours";

  list.innerHTML = "";
  active.forEach(m=>{
    const stat = currentStatus(m);
    const cls  = statusClass(stat.key);
    const veh  = m.veh || "—";
    const attr = m.attr ? ` • ${m.attr}` : "";
    const motif = m.motif || "—";
    const cpVille = [m?.adresse?.cp, m?.adresse?.ville].filter(Boolean).join(" ");
    const statusLabelMap = {
      "depart":"Départ",
      "sur place":"Sur place",
      "en charge":"En charge",
      "a l hopital":"À l'hôpital",
      "retour dispo":"Retour dispo",
      "retour indisponible":"Retour indispo"
    };
    const stLabel = statusLabelMap[stat.key] || "—";

    const div = document.createElement('div');
    div.className = "card";
    div.innerHTML = `
      <div class="order">${esc(m.ordre)}</div>
      <div class="info">
        <div class="line"><strong>${esc(veh)}${esc(attr)}</strong> <span class="badge">${esc(m.type||"")}</span></div>
        <div class="line"><span class="label">Motif:</span> ${esc(motif)}</div>
        <div class="line"><span class="label">Lieu:</span> ${esc(cpVille||"—")}</div>
        <div class="line"><span class="st ${cls}">${esc(stLabel)}</span> <span class="label">${esc(stat.time||"")}</span></div>
      </div>
    `;
    list.appendChild(div);
  });
}

/* Carte: placer marqueurs missions (si lat/lon connus). Sinon géocoder (Nominatim) en cache local */
function boundsFor(points){
  const b = L.latLngBounds(points);
  return b;
}
function renderMap(){
  missionLayer.clearLayers();
  const active = Object.values(missions).filter(m=>!m.done);
  const pts = [];

  active.forEach(m=>{
    let lat = m.lat, lon = m.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number'){
      // essaie de récupérer du cache par "cp ville"
      const key = `${m?.adresse?.cp||""} ${m?.adresse?.ville||""}`.trim();
      if (key){
        const cached = geoCacheGet(key);
        if (cached){ lat=cached.lat; lon=cached.lon; }
      }
    }
    if (typeof lat === 'number' && typeof lon === 'number'){
      const marker = L.circleMarker([lat,lon], { radius:7, color:'#ffea00', fillColor:'#ffea00', fillOpacity:0.9 });
      marker.bindTooltip(`${esc(m.ordre||"?")}. ${esc(m.veh||"—")} — ${esc(m.motif||"")}`, { direction:'top' });
      missionLayer.addLayer(marker);
      pts.push([lat,lon]);
    }else{
      // tente géocodage léger par CP+ville (throttling par cache)
      const key = `${m?.adresse?.cp||""} ${m?.adresse?.ville||""}`.trim();
      if (key && !geoCacheGet(key)){
        // Nominatim (respecte la charte: inclure 'format=json', 'countrycodes=be')
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&countrycodes=be&format=json&limit=1`)
          .then(r=>r.json())
          .then(arr=>{
            if (Array.isArray(arr) && arr.length){
              const p = { lat:+arr[0].lat, lon:+arr[0].lon };
              geoCacheSet(key, p);
              // on re-rendera au prochain tick de données
            }
          }).catch(()=>{});
      }
    }
  });

  // Ajuster la vue si on a des points; sinon centrer base
  if (pts.length){
    const b = boundsFor(pts.concat([[BASE.lat,BASE.lon]]));
    map.fitBounds(b.pad(0.2));
  }else{
    map.setView([BASE.lat, BASE.lon], 12);
  }
}

/* Ticker (notes + OUT depuis dispatch) */
function renderTicker(){
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

  const html = parts.length ? parts.join(`<span class="sepchar">|</span>`) : `Aucune information`;
  const b1 = document.getElementById('band1');
  const b2 = document.getElementById('band2');
  if (b1 && b2){
    b1.innerHTML = html + html; // doublage = défilement sans couture
    b2.innerHTML = b1.innerHTML;
  }
}

/* Subscriptions */
subscribeKey(MISSIONS_KEY, snap=>{
  missions = snap || {};
  renderList();
  renderMap();
},{ mode:'poll', intervalMs: 4000 });

subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  renderTicker();
},{ mode:'poll', intervalMs: 4000 });

// Première passe
renderList();
renderMap();
renderTicker();
