// ===========================================================
// store-bridge.js — Pont REST pour Firebase Realtime Database
// ===========================================================
//
// ➤ Prérequis côté app : index.html doit stocker le token Firebase dans
//    localStorage.setItem("dispatch_idToken", idToken)
//
// ➤ URL de base (à vérifier dans la console Firebase > Realtime Database)
const FIREBASE_DB_URL = "https://racs-dispatch-default-rtdb.europe-west1.firebasedatabase.app";

// --- Options globales ---
const BRIDGE = {
  baseUrl: FIREBASE_DB_URL.replace(/\/+$/, ""),
  // clé locale où est stocké le token (par index.html après login Firebase)
  tokenKey: "dispatch_idToken",
  // nombre de retries sur erreurs transitoires (429/5xx)
  retries: 3,
  // délai initial pour backoff (ms)
  backoffMs: 300,
};

// -----------------------------------------------------------
// Utilitaires
// -----------------------------------------------------------

/** Construit l’URL REST complète vers une clé (ex: "dispatch_parc_vehicules") */
function _url(key, params = "") {
  const cleanKey = (key || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const auth = _authQS();
  const qs = params ? (auth ? `${auth}&${params}` : `?${params}`) : auth;
  return `${BRIDGE.baseUrl}/${cleanKey}.json${qs || ""}`;
}

/** Récupère le token d’auth depuis localStorage */
function _getToken() {
  try { return localStorage.getItem(BRIDGE.tokenKey) || ""; } catch { return ""; }
}

/** Paramètre d’auth pour l’URL */
function _authQS() {
  const t = _getToken();
  return t ? `?auth=${encodeURIComponent(t)}` : "";
}

/** Attend ms (promesse) */
function _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

/** Détermine si on doit retenter la requête */
function _isRetriable(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/** fetch avec retries + no-cache, pour éviter les états différents */
async function _safeFetch(input, init = {}) {
  const options = Object.assign({
    // éviter tout cache navigateur/proxy
    cache: "no-store",
    headers: {
      "Accept": "application/json",
      // "Content-Type" ajouté quand body JSON
      "Pragma": "no-cache",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  }, init);

  let attempt = 0;
  let lastErr;

  while (attempt <= BRIDGE.retries) {
    try {
      const res = await fetch(input, options);
      if (!res.ok) {
        if (_isRetriable(res.status) && attempt < BRIDGE.retries) {
          attempt++;
          await _sleep(BRIDGE.backoffMs * attempt);
          continue;
        }
        const txt = await res.text().catch(()=> "");
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt || "no body"}`);
      }
      return res;
    } catch (e) {
      lastErr = e;
      // réseau transitoire → retry
      if (attempt < BRIDGE.retries) {
        attempt++;
        await _sleep(BRIDGE.backoffMs * attempt);
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error("fetch failed");
}

/** Ajoute/écrase l’en-tête JSON si body fourni */
function _withJson(init, bodyObj) {
  const headers = Object.assign({}, (init && init.headers) || {}, { "Content-Type": "application/json" });
  return Object.assign({}, init, { headers, body: JSON.stringify(bodyObj) });
}

// -----------------------------------------------------------
// API publique
// -----------------------------------------------------------

/** Change dynamiquement l’URL de base (si besoin) */
function setBaseUrl(url) {
  BRIDGE.baseUrl = (url || "").replace(/\/+$/, "");
}

/** Force un token (rarement utile, en général index.html gère déjà) */
function setAuthToken(token) {
  try { localStorage.setItem(BRIDGE.tokenKey, token || ""); } catch {}
}

/** Lecture GET d’une clé (ex: "dispatch_parc_vehicules") */
async function readKey(key) {
  const res = await _safeFetch(_url(key), { method: "GET" });
  return await res.json();
}

/** Écriture PUT (remplace entièrement la clé) */
async function saveKey(key, value) {
  const res = await _safeFetch(_url(key), _withJson({ method: "PUT" }, value));
  return await res.json();
}

/** Écriture PATCH (merge partiel, non destructif) */
async function patchKey(key, value) {
  const res = await _safeFetch(_url(key), _withJson({ method: "PATCH" }, value));
  return await res.json();
}

/** Suppression d’une clé */
async function deleteKey(key) {
  const res = await _safeFetch(_url(key), { method: "DELETE" });
  // DELETE renvoie souvent null → on renvoie true si ok
  try { await res.json(); } catch {}
  return true;
}

/** Récupère l’ETag d’une clé (pour écriture optimiste) */
async function getETag(key) {
  const res = await _safeFetch(_url(key, "print=silent"), {
    method: "GET",
    headers: { "X-Firebase-ETag": "true" },
  });
  const etag = res.headers.get("ETag");
  return etag;
}

/** PUT conditionnel avec ETag (optimistic concurrency) */
async function saveWithETag(key, value, etag) {
  const res = await _safeFetch(_url(key), _withJson({
    method: "PUT",
    headers: { "X-Firebase-ETag": etag || "*" }, // "*" = force, sinon etag précis
  }, value));
  const newEtag = res.headers.get("ETag");
  const json = await res.json().catch(() => null);
  return { etag: newEtag, value: json };
}

/** Transaction simple : lit, applique une fonction, sauvegarde (avec ETag) */
async function transact(key, mutatorFn) {
  // 1) lire ETag + valeur
  const etag = await getETag(key);
  const current = await readKey(key) || {};
  // 2) muter
  const next = await Promise.resolve(mutatorFn(JSON.parse(JSON.stringify(current))));
  // 3) sauvegarde conditionnelle
  try {
    const { etag: newTag, value } = await saveWithETag(key, next, etag);
    return { ok: true, etag: newTag, value };
  } catch (e) {
    // Conflit probable (412 Precondition Failed) → à gérer côté appelant si besoin
    return { ok: false, error: e };
  }
}

/** Ping de santé : /.info/connected (true/false) */
async function pingDB() {
  const res = await _safeFetch(_url(".info/connected".replace(/\.json$/, "")), { method: "GET" })
    .catch(() => null);
  return res ? await res.json() : null;
}

// -----------------------------------------------------------
// Helpers fréquents pour ton projet (optionnels, mais pratiques)
// -----------------------------------------------------------

/** Initialise la structure de base si absente (idempotent) */
async function ensureDispatchRoot() {
  const ROOT = "dispatch_parc_vehicules";
  const cur = await readKey(ROOT);
  if (cur && typeof cur === "object" && (cur._settings || cur._roles || cur._notes)) {
    return cur; // déjà présent
  }
  const base = {
    _settings: { vehs: [] },            // liste des véhicules (id, name, attrib, plaque)
    _roles: {
      officier_semaine:"", officier_garde:"",
      responsable_operations:"", chef_groupe:"",
      chef_poste:"", centraliste_1:"", centraliste_2:""
    },
    _notes: { materiel:"", infos:"" }
  };
  await saveKey(ROOT, base);
  return base;
}

/** Ajoute/maj un véhicule dans _settings.vehs ET crée/maj sa fiche */
async function upsertVehicle({ id, name, attrib, plaque }) {
  const ROOT = "dispatch_parc_vehicules";
  return await transact(ROOT, (cur) => {
    cur._settings = cur._settings || { vehs: [] };
    cur._roles    = cur._roles    || {};
    cur._notes    = cur._notes    || { materiel:"", infos:"" };

    const list = cur._settings.vehs || [];
    const idx = list.findIndex(v => v.id === id);
    const item = { id, name, attrib, plaque };
    if (idx >= 0) list[idx] = item; else list.push(item);

    cur[id] = Object.assign({
      XO:"", S:"", PS:"", km:"", statut:"Disponible", commentaire:"",
      attribution: attrib || "", plaque: plaque || "", name: name || id
    }, cur[id] || {});

    cur._settings.vehs = list;
    return cur;
  });
}

/** Supprime un véhicule (de la liste et de sa fiche) */
async function removeVehicle(id) {
  const ROOT = "dispatch_parc_vehicules";
  return await transact(ROOT, (cur) => {
    if (!cur) return {};
    if (cur._settings && Array.isArray(cur._settings.vehs)) {
      cur._settings.vehs = cur._settings.vehs.filter(v => v.id !== id);
    }
    if (cur[id]) { delete cur[id]; }
    return cur;
  });
}

// -----------------------------------------------------------
// Expose à window (navigateur)
// -----------------------------------------------------------
window.setBaseUrl      = setBaseUrl;
window.setAuthToken    = setAuthToken;
window.readKey         = readKey;
window.saveKey         = saveKey;
window.patchKey        = patchKey;
window.deleteKey       = deleteKey;
window.getETag         = getETag;
window.saveWithETag    = saveWithETag;
window.transact        = transact;
window.pingDB          = pingDB;

// Helpers projet
window.ensureDispatchRoot = ensureDispatchRoot;
window.upsertVehicle      = upsertVehicle;
window.removeVehicle      = removeVehicle;
