// === Bridge Google Apps Script (GET/POST) avec fallback localStorage ===
// URL déployée (publique) de ton Apps Script :
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbx2qeQ2Un0ip1ikd7LJ1u5H3tFNj06TsQ5TBIF-njvFL0U7---qG-PkJ-JfV7yxxi1h/exec";

// --- Helpers localStorage (secours) ---
function _localRead(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); }
  catch { return {}; }
}
function _localSave(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj ?? {})); } catch {}
}

// --- Lecture clé ---
async function readKey(key) {
  // Si l’URL est vide (ou bloquée), bascule local
  if (!APPSCRIPT_URL) return _localRead(key);
  try {
    const r = await fetch(`${APPSCRIPT_URL}?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = (await r.json()) || {};
    // miroir local (résilience)
    _localSave(key, data);
    return data;
  } catch (e) {
    console.warn("[store-bridge] readKey -> fallback localStorage:", e?.message || e);
    return _localRead(key);
  }
}

// --- Écriture clé ---
async function saveKey(key, obj) {
  if (!APPSCRIPT_URL) {
    _localSave(key, obj);
    return;
  }
  try {
    const r = await fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: obj ?? {} })
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) throw new Error(j.error || "saveKey failed");
    // miroir local
    _localSave(key, obj);
  } catch (e) {
    console.warn("[store-bridge] saveKey -> fallback localStorage:", e?.message || e);
    // Sauve localement pour ne rien perdre
    _localSave(key, obj);
  }
}

// --- Sync périodique (utile pour TV) ---
// callback reçoit l’objet courant si modifié depuis le dernier tick
async function syncKey(key, callback, interval = 5000) {
  let last = JSON.stringify(await readKey(key));
  callback(JSON.parse(last));
  setInterval(async () => {
    const cur = JSON.stringify(await readKey(key));
    if (cur !== last) {
      last = cur;
      callback(JSON.parse(cur));
    }
  }, interval);
}

// Optionnel : expose aussi les fonctions sur window (compat global)
window.readKey = window.readKey || readKey;
window.saveKey = window.saveKey || saveKey;
window.syncKey = window.syncKey || syncKey;
