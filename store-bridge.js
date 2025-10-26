// === Bridge Firebase Realtime Database (client-side, sans serveur) ===
// 1) Remplace par l'URL de TA base (menu Database → Realtime Database).
//    Exemple: https://ton-projet-default-rtdb.europe-west1.firebasedatabase.app
const FIREBASE_DB = "https://racs-dispatch-default-rtdb.europe-west1.firebasedatabase.app";

// --- Helpers fallback local (au cas où la DB est temporairement inaccessible) ---
function _localRead(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function _localSave(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj ?? {})); } catch {}
}

// --- Lecture d'une clé JSON (ex: "dispatch_parc_vehicules") ---
async function readKey(key) {
  if (!FIREBASE_DB || FIREBASE_DB.includes("TON-PROJET")) return _localRead(key);
  try {
    const r = await fetch(`${FIREBASE_DB}/${encodeURIComponent(key)}.json`, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = (await r.json()) || {};
    _localSave(key, data);  // miroir local pour résilience
    return data;
  } catch (e) {
    console.warn("[firebase] readKey -> fallback localStorage:", e?.message || e);
    return _localRead(key);
  }
}

// --- Écriture d'une clé JSON (remplace entièrement la valeur de la clé) ---
async function saveKey(key, obj) {
  if (!FIREBASE_DB || FIREBASE_DB.includes("TON-PROJET")) { _localSave(key, obj); return; }
  try {
    const r = await fetch(`${FIREBASE_DB}/${encodeURIComponent(key)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj ?? {})
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    _localSave(key, obj); // miroir local
  } catch (e) {
    console.warn("[firebase] saveKey -> fallback localStorage:", e?.message || e);
    _localSave(key, obj);
  }
}

// --- Sync périodique (utile pour les pages TV pour suivre en “live”) ---
async function syncKey(key, callback, interval = 5000) {
  let last = JSON.stringify(await readKey(key));
  callback(JSON.parse(last));
  setInterval(async () => {
    const cur = JSON.stringify(await readKey(key));
    if (cur !== last) { last = cur; callback(JSON.parse(cur)); }
  }, interval);
}

// Exposer globalement si besoin
window.readKey = window.readKey || readKey;
window.saveKey = window.saveKey || saveKey;
window.syncKey = window.syncKey || syncKey;
