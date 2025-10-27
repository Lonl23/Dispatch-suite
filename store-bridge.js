/* store-bridge.js
   Gestion unifiée des données Firebase
   Utilisé par : dispatch.html, tv-grid.html, tv-missions.html, etc.
*/

const firebaseConfig = {
  apiKey: "TA_CLE_API_FIREBASE",
  authDomain: "TON_PROJET.firebaseapp.com",
  databaseURL: "https://TON_PROJET.firebaseio.com",
  projectId: "TON_PROJET",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXX:web:XXXXXXXXXXXXXX"
};

// Initialisation Firebase (évite le double chargement)
if (typeof firebase === 'undefined') {
  console.error("⚠️ Firebase SDK manquant : ajoute <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'></script> et firebase-database.js avant store-bridge.js");
}

if (!firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Petite fonction utilitaire
function now() { return Date.now(); }

/* ---- LECTURE D’UNE CLÉ ----
   Exemple : const missions = await readKey('missions_actives');
*/
async function readKey(key) {
  try {
    const snapshot = await db.ref(key).get();
    return snapshot.exists() ? snapshot.val() : {};
  } catch (err) {
    console.error("Erreur lecture Firebase :", err);
    return {};
  }
}

/* ---- ÉCRITURE D’UNE CLÉ ----
   Exemple : await writeKey('dispatch_parc_vehicules', data);
*/
async function writeKey(key, data) {
  try {
    await db.ref(key).set(data);
    console.log(`✅ Données enregistrées dans ${key}`);
  } catch (err) {
    console.error("Erreur écriture Firebase :", err);
  }
}

/* ---- MISE À JOUR PARTIELLE ----
   Exemple : await updateKey('missions_actives', { mission123: {...} });
*/
async function updateKey(key, partialData) {
  try {
    await db.ref(key).update(partialData);
  } catch (err) {
    console.error("Erreur update Firebase :", err);
  }
}

/* ---- SYNCHRO TEMPS RÉEL (optionnelle) ----
   Exemple :
   subscribeKey('missions_actives', data => { render(data); });
*/
function subscribeKey(key, callback) {
  db.ref(key).on('value', (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });
}

/* ---- Suppression ---- */
async function deleteKey(key) {
  try {
    await db.ref(key).remove();
  } catch (err) {
    console.error("Erreur suppression Firebase :", err);
  }
}

/* Export global */
window.readKey = readKey;
window.writeKey = writeKey;
window.updateKey = updateKey;
window.subscribeKey = subscribeKey;
window.deleteKey = deleteKey;
