// tv-missions.js — colonne missions, carte OSM, ticker, annonces vocales 112

const MISSIONS_KEY = "dispatch_missions";
const DISPATCH_KEY = "dispatch_parc_vehicules";

// Base (La Hulpe)
const BASE = { lat: 50.730716, lon: 4.494684, label: "Base ACSRS" };

let missions = {};
let dispatch = {};
let map, missionLayer, baseMarker;

/* ============== Réglages Annonce vocale ============== */
const TTS_RATE   = 0.88;  // <1 = plus lent
const TTS_PITCH  = 0.95;
const TTS_VOLUME = 1.0;

/* ============== Fallback persistance (si writeKey manquant) ============== */
function persistKey(key, value){
  if (typeof window.writeKey === 'function') {
    return window.writeKey(key, value);
  }
  try{
    if (window.firebase && firebase.apps && firebase.apps.length && firebase.database){
      return firebase.database().ref(key).set(value);
    }
  }catch(e){
    console.warn('[tv-missions] persist via firebase échoué', e);
  }
  try{ localStorage.setItem(key, JSON.stringify(value||{})); }catch{}
  return Promise.resolve();
}

/* ========================= Utils ========================= */
const z2 = n => String(n).padStart(2,'0');
const nowHHMM = () => { const d=new Date(); return `${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const esc = s => String(s??"").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/['’"]/g,"").replace(/\s+/g," ").trim();

/* Horloge */
const clockEl = document.getElementById('clock');
if (clockEl){ clockEl.textContent = nowHHMM(); setInterval(()=>clockEl.textContent = nowHHMM(), 1000); }

/* ========================= Carte Leaflet (OSM) ========================= */
function initMap(){
  map = L.map('map',{ zoomControl:false, attributionControl:false }).setView([BASE.lat, BASE.lon], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(map);
  baseMarker = L.circleMarker([BASE.lat, BASE.lon], { radius:8, color:'#3a8bf2', fillColor:'#3a8bf2', fillOpacity:1 })
    .addTo(map)
    .bindTooltip(BASE.label, { direction:'top' });
  missionLayer = L.layerGroup().addTo(map);
}
initMap();

/* ====== Style icône: carré rouge avec numéro d’ordre ====== */
(function injectMarkerCss(){
  const css = `
    .ord-ico{
      width:24px;height:24px;line-height:24px;
      background:#c00000;border:2px solid #7a0000;border-radius:4px;
      color:#fff;font-weight:800;font-size:12px;text-align:center;
      box-shadow:0 0 0 2px rgba(0,0,0,.25);
    }
    .ord-ico.small{ width:20px;height:20px;line-height:20px;font-size:11px }
    .ord-ico-wrap{ background:transparent !important; border:none !important; }
  `;
  const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
})();
function makeOrderIcon(n){
  const cls = (String(n).length >= 3) ? 'ord-ico small' : 'ord-ico';
  return L.divIcon({
    html: `<div class="${cls}">${n ?? "?"}</div>`,
    className: 'ord-ico-wrap',
    iconSize: [24,24],
    iconAnchor: [12,12]
  });
}

/* ========================= Statut courant ========================= */
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
    "a l hopital":"À l'hôpital","retour dispo":"Retour dispo","retour indispo":"Retour indispo","retour indisponible":"Retour indispo"
  };
  return map[k] || "—";
}

/* ========================= Ordre de mission stable ========================= */
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
  if (changed){
    await persistKey(MISSIONS_KEY, missions);
  }
}

/* ========================= Liste missions (gauche) ========================= */
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

/* ========================= Géocodage précis (fallback TV) ========================= */
function toDMS(dec, isLat = true) {
  const dir = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  const abs = Math.abs(dec);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  const pad2 = n => String(n).padStart(2, '0');
  return `${deg}°${pad2(min)}′${pad2(sec.toFixed(2))}″ ${dir}`;
}
function fullAddress(a){
  const parts = [];
  if (a?.rue) parts.push(a.rue);
  if (a?.num) parts.push(String(a.num));
  const right=[]; if (a?.cp) right.push(String(a.cp)); if (a?.ville) right.push(a.ville);
  const rightStr = right.filter(Boolean).join(' ');
  if (rightStr) parts.push(rightStr);
  return parts.filter(Boolean).join(', ');
}

/* ========================= Carte missions (droite) ========================= */
function renderMap(){
  missionLayer.clearLayers();
  const active = Object.values(missions||{}).filter(m=>!m.done);
  const pts = [];

  active.forEach(async (m)=>{
    let lat = (typeof m.lat === 'number') ? m.lat : undefined;
    let lon = (typeof m.lon === 'number') ? m.lon : undefined;

    if (lat === undefined || lon === undefined) {
      // Fallback : géocode adresse complète une fois
      const q = fullAddress(m.adresse||{});
      if (q){
        try{
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=be&q=${encodeURIComponent(q)}`);
          if (res.ok){
            const arr = await res.json();
            if (Array.isArray(arr) && arr.length){
              lat = +arr[0].lat; lon = +arr[0].lon;
              m.lat = lat; m.lon = lon;
              m.latDMS = toDMS(lat, true);
              m.lonDMS = toDMS(lon, false);
              m.geoAt = new Date().toISOString();
              await persistKey(MISSIONS_KEY, missions);
            }
          }
        }catch{}
      }
    }

    if (typeof lat === 'number' && typeof lon === 'number'){
      const icon = makeOrderIcon(m.ordre || "?");
      const marker = L.marker([lat, lon], {
        icon, keyboard:false, riseOnHover:true,
        zIndexOffset: (m.ordre || 0) * 5
      });
      marker.bindTooltip(
        `${esc(m.ordre||"?")}. ${esc(m.veh||"—")} — ${esc(m.motif||"")}`,
        { direction:'top', offset:[0,-14], opacity:0.95 }
      );
      missionLayer.addLayer(marker);
      pts.push([lat,lon]);
    }

    setTimeout(()=>{
      if (pts.length){
        const b = L.latLngBounds(pts.concat([[BASE.lat,BASE.lon]]));
        map.fitBounds(b.pad(0.2));
      } else {
        map.setView([BASE.lat, BASE.lon], 12);
      }
    }, 50);
  });
}

/* ========================= Ticker (comme TV-Grid) ========================= */
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
    b1.innerHTML = html + html;
    b2.innerHTML = b1.innerHTML;
  }
}

/* ========================= Annonces vocales départ 112 ========================= */
// Audio / TTS
let audioCtx;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    document.addEventListener('click', ()=>audioCtx.resume(), {once:true});
  }
}
// BIP LONG (≈3,5 sec)
async function tonePatternLong(){
  const duration = 3500; // ms
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 820;      // tonalité d’alerte
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);

    osc.start();
    setTimeout(()=>{ osc.stop(); ctx.close(); }, duration);
  }catch(e){}
  await new Promise(r=>setTimeout(r, duration+150));
}
// BIP COURT (avant 2e annonce)
async function toneShort(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    osc.start();
    setTimeout(()=>{ osc.stop(); ctx.close(); }, 350);
  }catch(e){}
  await new Promise(r=>setTimeout(r, 380));
}
function pickFrenchVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v=>/fr.*(BE)/i.test(v.lang)) || vs.find(v=>/fr/i.test(v.lang)) || vs[0];
}
function speakFr(text, rate=TTS_RATE, pitch=TTS_PITCH, volume=TTS_VOLUME){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-BE';
    const v = pickFrenchVoice(); if (v) u.voice = v;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    speechSynthesis.speak(u);
  }catch{}
}
function motifCategory(motifRaw){
  const s = (motifRaw||'').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,'');
  if (/(arca|arre[t ]?cardio|rea|reanimation|deces|mort appar)/.test(s)) return 'critical';
  if (/(avp|accident|collision|voie publique)/.test(s)) return 'avp';
  if (/(trauma|fract|chute|plaie|contusion|luxation)/.test(s)) return 'trauma';
  if (/(personne.*ne.*repond)/.test(s)) return 'noResponse';
  if (/(pmd|probleme mal defini)/.test(s)) return 'pmd';
  if (/(releve|assistance physique)/.test(s)) return 'assist';
  return 'default';
}
function spokenAttribution(attr){
  if (!attr) return '';
  const m = attr.match(/^LH\s*([1-8])$/i);
  if (m){
    const n = parseInt(m[1],10);
    if (n===5) return 'bariatrique';
    const words = ['une','deux','trois','quatre','cinq','six','sept','huit'];
    return `la hulpe ${words[n-1]}`;
  }
  return attr;
}
function buildAnnouncement(m){
  const amb = m.veh ? `ambulance ${m.veh}` : `ambulance`;
  const attr = spokenAttribution(m.attr);
  const city = (m?.adresse?.ville || '').trim();
  const motif = (m.motif || '').trim();
  const parts = [amb];
  if (attr) parts.push(attr);
  if (city) { parts.push(city); parts.push(city); }
  if (motif) parts.push(motif);
  return parts.join(', ') + '.';
}

// Lance l’annonce: bip long + message, puis à +10s bip court + message
async function announceMission(m){
  ensureAudio();
  const kind = motifCategory(m.motif);
  // pour l’instant, un bip long unique quel que soit le motif (tonalité uniforme)
  await tonePatternLong();
  const msg = buildAnnouncement(m);
  speakFr(msg);

  // Répétition à +10 s avec bip court avant
  setTimeout(async ()=>{
    await toneShort();
    speakFr(msg);
  }, 10000);
}

/* ========================= Détection annonces 112 ========================= */
const ANNOUNCED_KEY = 'tv_112_announced_ids';
function getAnnounced(){ try{ return new Set(JSON.parse(localStorage.getItem(ANNOUNCED_KEY)||'[]')); }catch{ return new Set(); } }
function setAnnounced(set){ try{ localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(Array.from(set))); }catch{} }
let announcedSet = getAnnounced();
let prevMissionsSnapshot = {};

async function maybeAnnounceNew112(prev, curr){
  const ids = Object.keys(curr||{});
  for (const id of ids){
    const m = curr[id];
    if (!m || m.done) continue;
    if ((m.type||'').toUpperCase() !== '112') continue;

    const was = prev[id];
    const hasDepartNow  = !!(m.statuts && (m.statuts['Départ'] || m.statuts['depart']));
    const hadDepartBefore = !!(was && was.statuts && (was.statuts['Départ'] || was.statuts['depart']));
    const isNew = !was;
    const departJustSet = (!hadDepartBefore && hasDepartNow);

    // Déclenche: à la création OU dès que "Départ" apparaît
    if ((isNew || departJustSet) && !announcedSet.has(id)){
      announcedSet.add(id); setAnnounced(announcedSet);
      announceMission(m);
    }
  }
  for (const oldId of Object.keys(prev)){
    if (!curr[oldId]) announcedSet.delete(oldId);
  }
  setAnnounced(announcedSet);
  prevMissionsSnapshot = JSON.parse(JSON.stringify(curr||{}));
}

/* ========================= Boot initial ========================= */
(async function initialLoad(){
  try{
    const [dSnap, mSnap] = await Promise.all([readKey(DISPATCH_KEY), readKey(MISSIONS_KEY)]);
    dispatch = dSnap || {};
    missions = mSnap || {};
  }catch{/* ignore */}
  await ensureOrderNumbers();
  prevMissionsSnapshot = JSON.parse(JSON.stringify(missions||{}));
  renderList();
  renderMap();
  renderTicker();
})();

/* ========================= Subscriptions (poll) ========================= */
subscribeKey(MISSIONS_KEY, async snap=>{
  missions = snap || {};
  await ensureOrderNumbers();
  renderList();
  renderMap();
  maybeAnnounceNew112(prevMissionsSnapshot, missions);
},{ mode:'poll', intervalMs: 3000 });

subscribeKey(DISPATCH_KEY, snap=>{
  dispatch = snap || {};
  renderTicker();
},{ mode:'poll', intervalMs: 3000 });
