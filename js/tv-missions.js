/* =====================  ANNONCE DÉPART 112 ===================== */

/* 1) Audio & TTS helpers */
let audioCtx;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Tentative de déblocage sur premier clic si besoin
    document.addEventListener('click', ()=>audioCtx.resume(), {once:true});
  }
}
function beep(freq=650, durMs=250, vol=0.4) {
  ensureAudio();
  if (!audioCtx) return Promise.resolve();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain).connect(audioCtx.destination);
  const t0 = audioCtx.currentTime;
  osc.start(t0);
  osc.stop(t0 + durMs/1000);
  return new Promise(r=> osc.onended = r);
}
async function tonePattern(kind) {
  // motifs -> patterns (brefs pour la TV)
  switch(kind){
    case 'critical': // ARCA/RÉA/décès
      await beep(1000,250,0.5); await beep(700,250,0.5);
      await beep(1000,250,0.5); await beep(700,250,0.5);
      break;
    case 'avp': // accident voie publique
      await beep(600,180,0.45); await beep(800,180,0.45); await beep(1000,220,0.5);
      break;
    case 'trauma':
      await beep(850,400,0.45);
      break;
    case 'noResponse': // personne ne répondant pas à l'appel
      await beep(550,220,0.4); await new Promise(r=>setTimeout(r,150)); await beep(550,220,0.4); await new Promise(r=>setTimeout(r,150)); await beep(550,220,0.4);
      break;
    case 'pmd': // problème mal défini
      await beep(700,350,0.4);
      break;
    case 'assist': // relève / assistance physique
      await beep(500,300,0.35);
      break;
    default:
      await beep(650,250,0.35);
  }
}

// Web Speech API
function pickFrenchVoice() {
  const vs = speechSynthesis.getVoices();
  // Privilégie FR-BE si dispo, sinon FR-FR
  return vs.find(v=>/fr.*(BE)/i.test(v.lang)) || vs.find(v=>/fr/i.test(v.lang)) || vs[0];
}
function speakFr(text, rate=1.02, pitch=1, volume=1){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-BE';
    const v = pickFrenchVoice(); if (v) u.voice = v;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    speechSynthesis.speak(u);
  }catch{}
}

/* 2) Catégorisation du motif -> sonnerie */
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

/* 3) Traduction attribution -> annonce */
function spokenAttribution(attr){
  if (!attr) return '';
  const m = attr.match(/^LH\s*([1-8])$/i);
  if (m){
    const n = parseInt(m[1],10);
    if (n===5) return 'bariatrique';
    const words = ['une','deux','trois','quatre','cinq','six','sept','huit'];
    return `la hulpe ${words[n-1]}`;
  }
  return attr; // ex. autres attributions "TMS", "OFF", etc.
}

/* 4) Construction du message vocal demandé */
function buildAnnouncement(m){
  const amb = m.veh ? `ambulance ${m.veh}` : `ambulance`;
  const attr = spokenAttribution(m.attr);
  const city = (m?.adresse?.ville || '').trim();
  const motif = (m.motif || '').trim();
  // ordre demandé: ambulance, attribution, localité (x2), motif
  const parts = [amb];
  if (attr) parts.push(attr);
  if (city) { parts.push(city); parts.push(city); }
  if (motif) parts.push(motif);
  return parts.join(', ') + '.';
}

/* 5) Détection des nouveaux départs 112 + anti-doublon */
const ANNOUNCED_KEY = 'tv_112_announced_ids';
function getAnnounced(){ try{ return new Set(JSON.parse(localStorage.getItem(ANNOUNCED_KEY)||'[]')); }catch{ return new Set(); } }
function setAnnounced(set){
  try{ localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(Array.from(set))); }catch{}
}
let announcedSet = getAnnounced();
let prevMissionsSnapshot = {};

async function maybeAnnounceNew112(prev, curr){
  // curr = missions (objet complet)
  const ids = Object.keys(curr||{});
  for (const id of ids){
    const m = curr[id];
    if (!m || m.done) continue;
    if ((m.type||'').toUpperCase() !== '112') continue;

    const was = prev[id];

    // Conditions d’annonce :
    //  - nouvelle mission 112 (id absent avant), ou
    //  - statut "Départ" vient d’apparaître
    const hasDepartNow  = !!(m.statuts && (m.statuts['Départ'] || m.statuts['depart']));
    const hadDepartBefore = !!(was && was.statuts && (was.statuts['Départ'] || was.statuts['depart']));
    const isNew = !was;
    const departJustSet = (!hadDepartBefore && hasDepartNow);

    if ((isNew || departJustSet) && !announcedSet.has(id)){
      announcedSet.add(id); setAnnounced(announcedSet);
      const kind = motifCategory(m.motif);
      try {
        await tonePattern(kind);
      } catch {}
      const msg = buildAnnouncement(m);
      speakFr(msg, 1.02, 1, 1);
    }
  }
  // nettoie les annonces si mission clôturée (optionnel)
  for (const oldId of Object.keys(prev)){
    if (!curr[oldId]) announcedSet.delete(oldId);
  }
  setAnnounced(announcedSet);
  prevMissionsSnapshot = JSON.parse(JSON.stringify(curr||{}));
}

/* 6) Raccordement aux mises à jour existantes */
(async function hookAnnouncementsOnBoot(){
  // prépare le snapshot initial
  prevMissionsSnapshot = JSON.parse(JSON.stringify(missions||{}));
  // on déclenche aussi à chaque refresh missions
  // (ajoute ceci là où tu reçois les updates missions)
})();

// Si tu as déjà des subscribeKey ci-dessous, complète-les :
subscribeKey(MISSIONS_KEY, async snap=>{
  missions = snap || {};
  await ensureOrderNumbers();
  renderList();
  renderMap();
  // >>> ajoute l’appel annonce :
  maybeAnnounceNew112(prevMissionsSnapshot, missions);
},{ mode:'poll', intervalMs: 3000 });
