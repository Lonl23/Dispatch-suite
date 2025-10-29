// tv-missions.js — Colonne missions + Carte OSM + Ticker (aligné TV-Grid)
const MISSIONS_KEY = "dispatch_missions";
const DISPATCH_KEY = "dispatch_parc_vehicules";

// Base précise fournie
const BASE = { lat: 50.730716, lon: 4.494684, label: "Base ACSRS" };

let missions = {};
let dispatch = {};
let map, missionLayer, baseMarker;

/* Utils */
const z2 = n => String(n).padStart(2,'0');
const nowHHMM = () => { const d=new Date(); return `${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const esc = s => String(s??"").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/['’"]/g,"").replace(/\s+/g," ").trim();

/* Horloge */
const clockEl = document.getElementById('clock');
if (clockEl){ clockEl.textContent = nowHHMM(); setInterval(()=>clockEl.textContent = nowHHMM(), 1000); }

/* Map Leaflet */
function initMap(){
  map = L.map('map',{ zoomControl:false, attributionControl:false }).setView([BASE.lat, BASE.lon], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(map);
  baseMarker = L.circleMarker([BASE.lat, BASE.lon], { radius:8, color:'#3a8bf2', fillColor:'#3a8bf2', fillOpacity:1 })
    .addTo(map)
    .bindTooltip(BASE.label, { direction:'top' });
  missionLayer = L.layerGroup().addTo(map);
}
initMap();

/* Geo cache (local) */
const GEO_CACHE_KEY = "geo_cache";
function geoCacheGet(k){ try{ return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||"{}")[k]; }catch{return undefined;} }
function geoCacheSet(k,v){ try{ const c=JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||"{}"); c[k]=v; localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c)); }catch{} }

/* Statut courant */
const FLOW_ORDER = ["depart","sur place","en charge","a l hopital","retour dispo","retour indisponible","rentre poste","retour au poste"];
function currentStatus(m){
  const s = m?.statuts || {};
  const entries = Object.entries(s);
  if (!entries.length) return { key:"depart", time:"" };
  const normed = entries.map(([k,v])=>[norm(k), v]);

  let bestKey="depart", bestTime="";
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
function statusClass(key){
  switch(key){
    case "retour indisponible": return "st-indispo";
    case "a l hopital":         return "st-hopital";
    case "en charge":           return "st-encharge";
    case "sur place":           return "st-surplace";
    case "depart":              return "st-depart";
    case "retour dispo":        return "st-dispo";
    default:                    return "st-dispo";
  }
}
function labelFor(k){
  const map = {
    "depart":"Départ","sur place":"Sur place","en charge":"En charge",
    "a l hopital":"À l'hôpital","retour dispo":"Retour dispo","retour indisponible":"Retour indispo"
  };
  return map[k] || "—";
}

/* Numéro d'ordre stable tant que non clôturée */
async function ensureOrderNumbers(){
  const active = Object.values(missions||{}).filter(m=>!m.done);
  const used = new Set(active.map(m=>m.ordre).filter(n=>Number.isInteger(n)));
  const next = ()=>{ let n=1; while(used.has(n)) n++; return n; };
  let changed=false;
  active.sort((a,b)=>(+a.id)-(+b.id));
  for (const m of active){
    if (!Number.isInteger(m.ordre)){
      m.ordre = next(); used.add(m.ordre); changed=true;
    }
  }
  if (changed){ await writeKey(MISSIONS_KEY, missions); }
}

/* Liste missions (colonne gauche) */
function renderList(){
  const list = document.getElementById('list');
  const sub  = document.getElementById('subTitle');
  const cnt  = document.getElementById('count');

  const active = Object.values(missions||{}).filter(m=>!m.done);
  active.sort((a,b)=> (a.ordre||999) - (b.ordre||999));

  if (cnt) cnt.textContent = `${active.length} mission(s)`;
  if (sub) sub.textContent = active.length ? "Dernières missions actives" : "Aucune mission en cours";

  list.innerHTML = "";
  active.forEach(m=>{
    const st = currentStatus(m);
    const cls = statusClass(st.key);
    const veh = m.veh || "—";
    const attr = m.attr ? ` • ${m.attr}` : "";
    const motif = m.motif || "—";
    const cpVille = [m?.adresse?.cp, m?.adresse?.ville].filter(Boolean).join(" ");

    const div = document.createElement('div');
    div.className = "card";
    div.innerHTML = `
      <div class="order">${esc(m.ordre)}</div>
      <div class="info">
        <div class="line"><strong>${esc(veh)}${esc(attr)}</strong> <span class="badge">${esc(m.type||"")}</span></div>
        <div class="line"><span class="label">Motif:</span> ${esc(m.motif||"—")}</div>
        <div class="line"><span class="label">Lieu:</span> ${esc(cpVille||"—")}</div>
        <div class="line"><span class="st ${cls}">${esc(labelFor(st.key))}</span> <span class="label">${esc(st.time||"")}</span></div>
      </div>
    `;
    list.appendChild(div);
  });
}

/* Carte missions (droite) */
function renderMap(){
  missionLayer.clearLayers();
  const active = Object.values(missions||{}).filter(m=>!m.done);
  const pts = [];

  active.forEach(m=>{
    let { lat, lon } = m;
    if (typeof lat !== 'number' || typeof lon !== 'number'){
      const key = `${m?.adresse?.cp||""} ${m?.adresse?.ville||""}`.trim();
      const cached = key ? geoCacheGet(key) : undefined;
      if (cached){ lat=cached.lat; lon=cached.lon; }
      else if (key){
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&countrycodes=be&format=json&limit=1`)
          .then(r=>r.json()).then(arr=>{
            if (Array.isArray(arr) && arr.length){
              const p = { lat:+arr[0].lat, lon:+arr[0].lon };
              geoCacheSet(key, p);
            }
          }).catch(()=>{});
      }
    }
    if (typeof lat === 'number' && typeof lon === 'number'){
      const marker = L.circleMarker([lat,lon], { radius:7, color:'#ffea00', fillColor:'#ffea00', fillOpacity:0.9 });
      marker.bindTooltip(`${esc(m.ordre||"?")}. ${esc(m.veh||"—")} — ${esc(m.motif||"")}`, { direction:'top' });
      missionLayer.addLayer(marker);
      pts.push([lat,lon]);
    }
  });

  if (pts.length){
    const b = L.latLngBounds(pts.concat([[BASE.lat,BASE.lon]]));
    map.fitBounds(b.pad(0.2));
  }else{
    map.setView([BASE.lat, BASE.lon], 12);
  }
}

/* Bannière — identique à TV-Grid */
function renderTicker(){
  const notes = dispatch?._notes || {};
  const outs = [];
  (dispatch?._settings?.vehs||[]).forEach(v=>{
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
    parts.push(`INFOS: ${String(notes.infos).replace(/\s+/g,' ').trim()}`);
  }
  if (outs.length){
    parts.push(`VÉHICULE OUT: ${outs.join(' • ')}`);
  }
  if ((notes.materiel||'').trim()){
    parts.push(`MATÉRIEL: ${String(notes.materiel).replace(/\s+/g,' ').trim()}`);
  }

  const html = parts.length ? parts.join(`<span class="sepchar">|</span>`) : `Aucune information`;
  const b1 = document.getElementById('band1');
  const b2 = document.getElementById('band2');
  if (b1 && b2){
    b1.innerHTML = html + html; // duplication pour scroll sans couture
    b2.innerHTML = b1.innerHTML;
  }
}

/* Chargement initial (après auth & store-bridge injectés) */
(async function initialLoad(){
  try{
    const [dSnap, mSnap] = await Promise.all([readKey(DISPATCH_KEY), readKey(MISSIONS_KEY)]);
    dispatch = dSnap || {};
    missions = mSnap || {};
  }catch{/* ignore */}
  await ensureOrderNumbers();
  renderList();
  renderMap();
  renderTicker();
})();

/* Subscriptions (poll) */
subscribeKey(MISSIONS_KEY, async snap=>{
  missions = snap || {};
  await ensureOrderNumbers();
  renderList();
  renderMap();
},{ mode:'poll', intervalMs: 3000 });

subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  renderTicker();
},{ mode:'poll', intervalMs: 3000 });
