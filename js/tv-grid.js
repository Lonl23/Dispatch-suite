// tv-grid.js — lecture Firebase et rendu TV

const DISPATCH_KEY = 'dispatch_parc_vehicules';
const MISSIONS_KEY = 'dispatch_missions';

let dispatch = {};
let missions = {};
let vehSettings = [];

/* Date + Heure */
function updateClock(){
  const d=new Date(); const z=n=>String(n).padStart(2,'0');
  const jours=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const mois=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  document.getElementById('dateTxt').textContent = `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  document.getElementById('clock').textContent = `${z(d.getHours())}:${z(d.getMinutes())}`;
}
setInterval(updateClock,1000); updateClock();

/* Météo La Hulpe */
async function loadMeteo(){
  try{
    const r=await fetch("https://api.open-meteo.com/v1/forecast?latitude=50.73&longitude=4.48&current=temperature_2m,weather_code&timezone=Europe/Brussels");
    const j=await r.json(); const t=Math.round(j.current.temperature_2m); const c=j.current.weather_code;
    const map={0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",95:"⛈️"};
    document.getElementById('meteo').textContent=`${map[c]||"☁️"} ${t}°C La Hulpe`;
  }catch(e){ console.log('meteo',e); }
}
loadMeteo(); setInterval(loadMeteo,10*60*1000);

/* Helpers */
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

/* Rôles */
function renderRoles(){
  const r=dispatch._roles||{};
  const parts=[
    r.officier_semaine&&`Off semaine: ${esc(r.officier_semaine)}`,
    r.officier_garde&&`Off garde: ${esc(r.officier_garde)}`,
    r.responsable_operations&&`Resp opé: ${esc(r.responsable_operations)}`,
    r.chef_groupe&&`Chef groupe: ${esc(r.chef_groupe)}`,
    r.chef_poste&&`Chef poste: ${esc(r.chef_poste)}`,
    r.centraliste_1&&`1er centr.: ${esc(r.centraliste_1)}`,
    r.centraliste_2&&`2e centr.: ${esc(r.centraliste_2)}`
  ].filter(Boolean);
  document.getElementById('roles').innerHTML = parts.length
    ? parts.map(t=>`<div class="role">${t}</div>`).join('')
    : '<div class="role">Aucun rôle encodé</div>';
}

/* Statut priorisé mission */
function computeVehStatus(vehId){
  const ms = Object.values(missions).filter(m=>!m.done && m.veh===vehId);
  if (ms.length){
    ms.sort((a,b)=>(b.id||'')<(a.id||'')?-1:1);
    const s=ms[0].statuts||{};
    if (s["À l'hôpital"] || s["Arrivé hôpital"]) return 'hopital';
    if (s["En charge"] || s["En charge vers l\'hôpital"] || s["En charge vers hopital"]) return 'encharge';
    if (s["Sur place"]) return 'surplace';
    if (s["Départ"]) return 'depart';
  }
  const d=dispatch[vehId]||{};
  if ((d.statut||'')==='Indisponible') return 'indispo';
  return 'dispo';
}
function statusClass(key){
  switch(key){
    case 'indispo': return 'st-indispo';
    case 'depart': return 'st-depart';
    case 'surplace': return 'st-surplace';
    case 'encharge': return 'st-encharge';
    case 'hopital': return 'st-hopital';
    default: return 'st-dispo';
  }
}

/* Tile builder */
function makeTile(info, statKey){
  const cls=statusClass(statKey);
  if (!info) return `<div class="vtile ${cls}"><div class="line1">LIBRE</div></div>`;
  const l1=[info.name,info.attr,info.plaque].filter(Boolean).join(' - ');
  const crew=[info.XO,info.S,info.PS].filter(Boolean).join(' / ');
  const l2=crew?`<div class="line2">${esc(crew)}</div>`:'';
  const l3=info.km?`<div class="line3">${esc(info.km)} km</div>`:'';
  return `<div class="vtile ${cls}">
    <div class="line1">${esc(l1||info.name)}</div>${l2}${l3}
  </div>`;
}

/* Rendu grilles */
function renderGrid(){
  const slots=["Ext","H1","H2","H3","H4","H5","H6","H7","H8","H9","H10","G1","G2","G3","G4","G5","G6","G7","G8"];
  slots.forEach(s=>{ const el=document.getElementById('slot-'+s); if(el) el.innerHTML=makeTile(null,'dispo'); });

  (vehSettings||[]).forEach(v=>{
    const slot=(v.emplacement||'').replace('Extérieur','Ext');
    const el=document.getElementById('slot-'+slot); if(!el) return;
    const id=v.id, d=dispatch[id]||{};
    const st=computeVehStatus(id);
    el.innerHTML=makeTile({
      name:d.name||v.name||v.id,
      attr:d.attribution||v.attribution||'',
      plaque:d.plaque||v.plaque||'',
      XO:d.XO||'', S:d.S||'', PS:d.PS||'',
      km:d.km||''
    }, st);
  });
}

/* Bannière */
function renderBanner(){
  const notes=dispatch._notes||{};
  const outs=[];
  (dispatch._settings?.vehs||[]).forEach(v=>{
    const d=dispatch[v.id]; if(d?.statut==='Indisponible'){
      let t=(d.name||v.id);
      if(d.attribution||v.attribution) t+=` [${d.attribution||v.attribution}]`;
      if(d.commentaire) t+=` — ${d.commentaire}`;
      outs.push(t);
    }
  });
  const parts=[];
  if(outs.length) parts.push(`VÉHICULE OUT: ${esc(outs.join(' • '))}`);
  if((notes.materiel||'').trim()) parts.push(`MATÉRIEL: ${esc(notes.materiel.replace(/\s+/g,' ').trim())}`);
  if((notes.infos||'').trim()) parts.push(`INFOS: ${esc(notes.infos.replace(/\s+/g,' ').trim())}`);

  const content=(parts.length? parts.join(`<span class="sepchar">|</span>`) : `Aucune information`);
  const b1=document.getElementById('band1'), b2=document.getElementById('band2');
  b1.innerHTML=content+content; b2.innerHTML=b1.innerHTML;
}

/* Subscriptions (polling stable) */
subscribeKey(DISPATCH_KEY, snap=>{
  dispatch=snap||{}; vehSettings=Array.isArray(dispatch._settings?.vehs)?dispatch._settings.vehs:[];
  renderRoles(); renderGrid(); renderBanner();
},{mode:'poll',intervalMs:3000});

subscribeKey(MISSIONS_KEY, snap=>{
  missions=snap||{}; renderGrid();
},{mode:'poll',intervalMs:4000});
