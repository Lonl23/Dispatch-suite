// store-bridge.js
// Pont de communication avec la base Firebase Realtime Database

const FIREBASE_DB_URL =
  "https://racs-dispatch-default-rtdb.europe-west1.firebasedatabase.app";

/**
 * Lit une clé dans la base Firebase (GET)
 * @param {string} key - nom de la clé (ex: "dispatch_parc_vehicules")
 */
async function readKey(key) {
  const res = await fetch(`${FIREBASE_DB_URL}/${key}.json`);
  if (!res.ok) throw new Error(`Erreur lecture ${key}: ${res.status}`);
  return await res.json();
}

/**
 * Écrit une clé dans la base Firebase (PUT)
 * @param {string} key - nom de la clé
 * @param {Object} value - données à sauvegarder
 */
async function saveKey(key, value) {
  const res = await fetch(`${FIREBASE_DB_URL}/${key}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!res.ok) throw new Error(`Erreur écriture ${key}: ${res.status}`);
  return await res.json();
}
