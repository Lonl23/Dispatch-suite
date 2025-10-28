/* store-bridge.js
   Pont unique Firebase <-> UI
   - Mixte: missions en temps réel, dispatch en polling par défaut
   - Cache local & anti-écho pour ne pas éjecter l’utilisateur pendant la saisie
   Expose: readKey, setKey, updateKey, removeKey, subscribeKey, unsubscribeAll
*/
(function (global) {
  'use strict';

  /*********** Config Firebase ***********/
  // 1) Priorité: window.FIREBASE_CONFIG si défini par la page
  // 2) Sinon: <meta name="firebase-config" content='{...}'>
  // 3) Sinon: fallback = TA CONFIG fournie ci-dessous
  function getConfigFromMeta() {
    try {
      const tag = document.querySelector('meta[name="firebase-config"]');
      if (!tag) return null;
      return JSON.parse(tag.getAttribute('content') || '{}');
    } catch (e) {
      console.error('[store-bridge] Meta firebase-config JSON invalide', e);
      return null;
    }
  }

  const FALLBACK_CONFIG = {
    apiKey: "AIzaSyCP6ZClAectP8OPneAeoYGYdRYO0CvnbnQ",
    authDomain: "racs-dispatch.firebaseapp.com",
    databaseURL: "https://racs-dispatch-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "racs-dispatch",
    storageBucket: "racs-dispatch.firebasestorage.app",
    messagingSenderId: "589135271261",
    appId: "1:589135271261:web:d080a5da49a061929b84b4"
  };

  const fbCfg =
    global.FIREBASE_CONFIG ||
    getConfigFromMeta() ||
    FALLBACK_CONFIG;

  if (!global.firebase || !global.firebase.initializeApp) {
    console.error('[store-bridge] Firebase SDK manquant. Ajoute les scripts compat: app, auth, database.');
  }

  if (!global.firebase?.apps?.length) {
    try {
      global.firebase.initializeApp(fbCfg);
      console.log('[store-bridge] Firebase initialisé:', (global.firebase.app().options || {}).projectId);
    } catch (e) {
      console.error('[store-bridge] Erreur init Firebase', e);
    }
  }

  const db = () => global.firebase.database();

  /*********** Chemins standards ***********/
  const PATHS = {
    DISPATCH: 'dispatch_parc_vehicules',    // parc + rôles + notes + settings + emplacements
    MISSIONS_CANON: 'missions_canon',       // détails complets (géocodés)
    MISSIONS_ACTIVE: 'missions_actives',    // résumé live TV
    MISSIONS_ORDER: 'missions_order',       // mapping missionId -> numéro d’ordre
    GEO_CACHE: 'missions_geo_cache'         // optionnel si tu veux cacher des géos
  };

  function keyToPath(key) {
    if (!key) throw new Error('key required');
    if (key.startsWith('/')) return key.replace(/^\//, '');
    switch (key) {
      case 'DISPATCH': return PATHS.DISPATCH;
      case 'MISSIONS_CANON':
      case 'missions_canon': return PATHS.MISSIONS_CANON;
      case 'MISSIONS_ACTIVE':
      case 'missions_actives': return PATHS.MISSIONS_ACTIVE;
      case 'MISSIONS_ORDER':
      case 'missions_order': return PATHS.MISSIONS_ORDER;
      case 'GEO_CACHE':
      case 'missions_geo_cache': return PATHS.GEO_CACHE;
      case 'dispatch_parc_vehicules': return PATHS.DISPATCH;
      default: return key;
    }
  }
  const refFor = (key) => db().ref(keyToPath(key));

  /*********** Utilitaires ***********/
  function deepEqual(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch { return a === b; }
  }

  // Anti-écho: ignore l’évènement 'value' immédiatement après notre propre écriture
  const lastWrites = new Map(); // path -> { ts, json }
  const ECHO_MS = 1000;

  function rememberWrite(path, value) {
    try { lastWrites.set(path, { ts: Date.now(), json: JSON.stringify(value) }); }
    catch { lastWrites.set(path, { ts: Date.now(), json: null }); }
  }
  function ignoreIfJustWritten(path, snapshotVal) {
    const m = lastWrites.get(path);
    if (!m) return false;
    if (Date.now() - m.ts > ECHO_MS) return false;
    try { return JSON.stringify(snapshotVal) === m.json; }
    catch { return false; }
  }

  /*********** API publique ***********/
  async function readKey(key) {
    const p = keyToPath(key);
    const snap = await refFor(p).get();
    return snap.exists() ? snap.val() : null;
  }
  async function setKey(key, value) {
    const p = keyToPath(key);
    rememberWrite(p, value);
    await refFor(p).set(value);
    return true;
  }
  async function updateKey(key, patch) {
    const p = keyToPath(key);
    rememberWrite(p, patch); // on mémorise le patch (suffisant pour l’anti-écho)
    await refFor(p).update(patch);
    return true;
  }
  async function removeKey(key) {
    const p = keyToPath(key);
    await refFor(p).remove();
    return true;
  }

  // Abonnements (mixte: missions en realtime, dispatch en polling par défaut)
  const subscriptions = new Set();

  /**
   * subscribeKey(key, callback, options?)
   * options.mode: 'realtime' | 'poll'
   * options.intervalMs: nombre (def 3000)
   * options.debounceMs: nombre (def 200)
   */
  function subscribeKey(key, callback, options) {
    const path = keyToPath(key);
    const modeDefault =
      (path === PATHS.MISSIONS_CANON || path === PATHS.MISSIONS_ACTIVE || path === PATHS.MISSIONS_ORDER)
        ? 'realtime'
        : 'poll';

    const opts = Object.assign(
      { mode: modeDefault, intervalMs: 3000, debounceMs: 200 },
      options || {}
    );

    let lastSent = undefined;
    let debounceTimer = null;
    const emit = (val) => {
      if (deepEqual(val, lastSent)) return;
      lastSent = val;
      try { callback(val || null); } catch (e) { console.error('[store-bridge] callback error', e); }
    };

    let unsub;
    if (opts.mode === 'realtime') {
      const handler = (snap) => {
        if (ignoreIfJustWritten(path, snap.val())) return;
        if (opts.debounceMs > 0) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => emit(snap.val()), opts.debounceMs);
        } else {
          emit(snap.val());
        }
      };
      refFor(path).on('value', handler);
      unsub = () => { clearTimeout(debounceTimer); refFor(path).off('value', handler); };

    } else {
      // Polling
      let killed = false;
      async function tick() {
        if (killed) return;
        try {
          const snap = await refFor(path).get();
          if (!ignoreIfJustWritten(path, snap.val())) emit(snap.val());
        } catch (e) {
          console.warn('[store-bridge] poll read error', path, e);
        } finally {
          if (!killed) setTimeout(tick, opts.intervalMs);
        }
      }
      tick();
      unsub = () => { killed = true; };
    }

    subscriptions.add(unsub);
    return function unsubscribe() {
      try { unsub && unsub(); } catch {}
      subscriptions.delete(unsub);
    };
  }

  function unsubscribeAll() {
    subscriptions.forEach((u) => { try { u(); } catch {} });
    subscriptions.clear();
  }

  // Expose global
  global.readKey = readKey;
  global.setKey = setKey;
  global.updateKey = updateKey;
  global.removeKey = removeKey;
  global.subscribeKey = subscribeKey;
  global.unsubscribeAll = unsubscribeAll;

  console.log('[store-bridge] prêt — mixte (missions realtime, dispatch poll).');
})(window);
