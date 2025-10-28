// js/auth.js — Auth Firebase Email/Password (persistante)
(function (global) {
  'use strict';
  if (!global.firebase?.auth) {
    console.error('[auth] Firebase Auth SDK manquant.');
    return;
  }
  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

  async function signInEmailPassword(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }
  async function signOut() { return auth.signOut(); }
  function onAuth(cb) { return auth.onAuthStateChanged(cb); }
  function currentUser() { return auth.currentUser || null; }

  global.Auth = { signInEmailPassword, signOut, onAuth, currentUser };
  console.log('[auth] prêt');
})(window);
