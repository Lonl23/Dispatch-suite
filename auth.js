// auth.js — Auth Firebase Email/Password (persistante)

(function (global) {
  'use strict';

  if (!global.firebase?.auth) {
    console.error('[auth] Firebase Auth SDK manquant.');
    return;
  }

  const auth = firebase.auth();

  // Persistance par défaut (LOCAL)
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

  async function signInEmailPassword(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  async function signOut() {
    return auth.signOut();
  }

  function onAuth(callback) {
    return auth.onAuthStateChanged(callback);
  }

  function currentUser() {
    return auth.currentUser || null;
  }

  // Expose
  global.Auth = {
    signInEmailPassword,
    signOut,
    onAuth,
    currentUser,
  };

  console.log('[auth] prêt');
})(window);
