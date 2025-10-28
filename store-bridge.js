/* store-bridge.js
   Pont unique Firebase RTDB pour tout le site (dispatch, paramètres, tv-grid, missions, tv-missions).
   ⚠️ Prérequis (dans chaque page AVANT ce fichier) :
   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
*/

/* ========= 1) Configuration ========= */
let _fbConfig = {
  apiKey:        "TA_CLE_API",
  authDomain:    "TON_PROJET.firebaseapp.com",
  databaseURL:   "https://TON_PROJET-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:     "TON_PROJET",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId:         "1:XXXXXXXXXXXX:web:XXXXXXXXXXXX"
};

// Permet de définir/mettre à jour la config dynamiquement si besoin AVANT init()
function setFirebaseConfig(cfg){
  if (firebase.apps?.length) {
    console.warn("Firebase déjà initialisé. Ignorer setFirebaseConfig() tardif.");
    return;
  }
  _fbConfig = { ..._fbConfig, ...cfg };
}

/* ========= 2) Initialisation ========= */
if (typeof firebase === "undefined") {
  console.error("Firebase SDK manquant. Ajoute les scripts compat avant store-bridge.js");
}

if (!firebase.apps?.length) {
  firebase.initializeApp(_fbConfig);
}

const auth = firebase.auth();
const db   = firebase.database();

// État
let _currentUser = null;
let _connected = false;

// Surveille la connexion réseau RTDB
db.ref(".info/connected").on("value", (snap)=>{
  _connected = !!snap.val();
  if(!_connected){
    console.warn("[store-bridge] Déconnecté de RTDB");
  } else {
    console.log("[store-bridge] Connecté à RTDB");
  }
});

// Surveille la session auth
auth.onIdTokenChanged((user)=>{
  _currentUser = user || null;
  if(!_currentUser){
    console.warn("[store-bridge] Utilisateur déconnecté");
  }else{
    console.log("[store-bridge] Connecté en tant que", _currentUser.email || _currentUser.uid);
  }
});

/* ========= 3) Auth helpers ========= */
async function signInWithEmailPassword(email, password){
  return auth.signInWithEmailAndPassword(email, password);
}
async function signOut(){
  return auth.signOut();
}
function getCurrentUser(){
  return _currentUser;
}
function isConnected(){
  return _connected;
}

/* ========= 4) RTDB helpers ========= */
// Lecture d’une clé entière (objet) – renvoie {} si absent
async function readKey(path){
  try{
    const snap = await db.ref(path).get();
    return snap.exists() ? snap.val() : {};
  }catch(e){
    console.error("[store-bridge] readKey erreur", path, e);
    return {};
  }
}

// Écriture TOTALE (remplace le nœud) – à éviter sauf cas contrôlé
async function writeKey(path, data){
  try{
    await db.ref(path).set(data);
    console.log("[store-bridge] writeKey OK", path);
  }catch(e){
    console.error("[store-bridge] writeKey erreur", path, e);
  }
}

// Mise à jour PARTIELLE (recommandée) – patch objet avec chemins imbriqués
// Ex: updateKey("dispatch_parc_vehicules", { "_settings/vehs": array, "AS 55/statut": "Sorti" })
async function updateKey(path, partial){
  try{
    if (!partial || typeof partial !== "object"){
      console.warn("[store-bridge] updateKey ignoré: payload invalide", partial);
      return;
    }
    await db.ref(path).update(partial);
    // console.log("[store-bridge] updateKey OK", path, Object.keys(partial));
  }catch(e){
    console.error("[store-bridge] updateKey erreur", path, e);
  }
}

// Suppression de nœud (enfant ou parent)
async function deleteKey(path){
  try{
    await db.ref(path).remove();
    console.log("[store-bridge] deleteKey OK", path);
  }catch(e){
    console.error("[store-bridge] deleteKey erreur", path, e);
  }
}

// Transaction (pour compteurs, réservations d’ordres, etc.)
async function transact(path, updater){
  try{
    const ref = db.ref(path);
    const res = await ref.transaction((cur)=>updater(cur));
    return res;
  }catch(e){
    console.error("[store-bridge] transact erreur", path, e);
    throw e;
  }
}

// Timestamp serveur
function serverTimestamp(){
  return firebase.database.ServerValue.TIMESTAMP;
}

/* ========= 5) Subscriptions ========= */
// Gestion de plusieurs abonnements avec possibilité d’annuler
const _subs = new Map(); // keyPath -> { ref, handler, callbacks: Set }

function subscribeKey(path, callback){
  if(!_subs.has(path)){
    const ref = db.ref(path);
    const callbacks = new Set();
    const handler = ref.on("value", (snap)=>{
      const val = snap.exists()? snap.val() : {};
      callbacks.forEach(cb=>{
        try{ cb(val); }catch(e){ console.error("[store-bridge] callback sub erreur", e); }
      });
    });
    _subs.set(path, { ref, handler, callbacks });
  }
  const entry = _subs.get(path);
  entry.callbacks.add(callback);

  // retourne une fonction d’unsubscribe
  return ()=> {
    const ent = _subs.get(path);
    if(!ent) return;
    ent.callbacks.delete(callback);
    if(ent.callbacks.size === 0){
      ent.ref.off("value", ent.handler);
      _subs.delete(path);
    }
  };
}

// Force un resubscribe global (utile après reconnexion/auth)
function resubscribeAll(){
  // On ré-attache en recréant les listeners
  const snapshot = Array.from(_subs.entries());
  // Détacher tout
  snapshot.forEach(([path, ent])=>{
    ent.ref.off("value", ent.handler);
  });
  _subs.clear();
  // Recréer avec les anciennes callbacks
  snapshot.forEach(([path, ent])=>{
    ent.callbacks.forEach(cb => subscribeKey(path, cb));
  });
  console.log("[store-bridge] Resubscribe effectué");
}

/* ========= 6) Backups locaux (optionnel) ========= */
function localBackupSave(key, data){
  try{ localStorage.setItem(key+"_backup", JSON.stringify(data)); }
  catch(e){ console.warn("[store-bridge] backup local échoué", e); }
}
function localBackupLoad(key){
  try{
    const raw = localStorage.getItem(key+"_backup");
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

/* ========= 7) Exports globaux ========= */
window.setFirebaseConfig   = setFirebaseConfig;
window.signInWithEmailPassword = signInWithEmailPassword;
window.signOut             = signOut;
window.getCurrentUser      = getCurrentUser;
window.isConnected         = isConnected;

window.readKey             = readKey;
window.writeKey            = writeKey;   // ⚠️ à utiliser prudemment
window.updateKey           = updateKey;  // ✅ recommandé
window.deleteKey           = deleteKey;
window.transact            = transact;
window.serverTimestamp     = serverTimestamp;

window.subscribeKey        = subscribeKey;
window.resubscribeAll      = resubscribeAll;

window.localBackupSave     = localBackupSave;
window.localBackupLoad     = localBackupLoad;
