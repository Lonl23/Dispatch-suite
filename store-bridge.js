// === Bridge Firebase Realtime Database (sans serveur) ===
// Remplace par l'URL de TA base (finissant par .app)
const FIREBASE_DB = "https://console.firebase.google.com/u/0/project/racs-dispatch/database/racs-dispatch-default-rtdb/data/~2F";

// Lecture d'une clé (retourne {} si absent)
async function readKey(key){
  try{
    const r = await fetch(`${FIREBASE_DB}/${encodeURIComponent(key)}.json`, { cache: "no-store" });
    if(!r.ok) throw new Error(r.status);
    return (await r.json()) || {};
  }catch(e){
    console.warn("[firebase] readKey fallback localStorage:", e);
    try{ return JSON.parse(localStorage.getItem(key) || "{}"); }catch{ return {}; }
  }
}

// Écriture d'une clé (PUT remplace la valeur ; passer à PATCH si tu veux fusionner)
async function saveKey(key, obj){
  try{
    const r = await fetch(`${FIREBASE_DB}/${encodeURIComponent(key)}.json`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(obj ?? {})
    });
    if(!r.ok) throw new Error(r.status);
    // miroir local pour résilience
    localStorage.setItem(key, JSON.stringify(obj ?? {}));
  }catch(e){
    console.warn("[firebase] saveKey fallback localStorage:", e);
    localStorage.setItem(key, JSON.stringify(obj ?? {}));
  }
}

// Sync périodique (utile pour la TV)
async function syncKey(key, callback, interval = 5000){
  let last = JSON.stringify(await readKey(key));
  callback(JSON.parse(last));
  setInterval(async ()=>{
    const cur = JSON.stringify(await readKey(key));
    if(cur !== last){ last = cur; callback(JSON.parse(cur)); }
  }, interval);
}

// Expose global si besoin
window.readKey = window.readKey || readKey;
window.saveKey = window.saveKey || saveKey;
window.syncKey = window.syncKey || syncKey;
