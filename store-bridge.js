// === Bridge Google Apps Script (GET/POST) ===
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbx2qeQ2Un0ip1ikd7LJ1u5H3tFNj06TsQ5TBIF-njvFL0U7---qG-PkJ-JfV7yxxi1h/exec"; // ex: https://script.google.com/macros/s/XXX/exec

// Lit une clé (retourne {} si absent)
async function readKey(key){
  try{
    const r = await fetch(`${APPSCRIPT_URL}?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    return r.ok ? (await r.json() || {}) : {};
  }catch{ return {}; }
}

// Écrit une clé (remplace la valeur par l'objet fourni)
async function saveKey(key, obj){
  const r = await fetch(APPSCRIPT_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ key, value: obj||{} })
  });
  const j = await r.json().catch(()=>({}));
  if(!j.ok) throw new Error(j.error||'saveKey failed');
}

// Sync périodique (utile pour les pages TV)
async function syncKey(key, callback, interval=5000){
  let last = JSON.stringify(await readKey(key));
  callback(JSON.parse(last));
  setInterval(async ()=>{
    const cur = JSON.stringify(await readKey(key));
    if(cur !== last){ last = cur; callback(JSON.parse(cur)); }
  }, interval);
}
