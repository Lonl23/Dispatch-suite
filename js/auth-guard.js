// js/auth-guard.js — À inclure en haut de toute page protégée
(function (global) {
  'use strict';
  if (!global.firebase?.auth) {
    console.warn('[auth-guard] Firebase Auth non chargé (page publique ?)');
    return;
  }
  const auth = firebase.auth();

  function ensureAuthOrRedirect() {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        const target = encodeURIComponent(location.pathname.replace(/^\//,''));
        location.replace(`index.html?next=${target}`);
      }
    });
  }
  function isAuthenticated() { return !!auth.currentUser; }

  global.AuthGuard = { ensureAuthOrRedirect, isAuthenticated };
  console.log('[auth-guard] prêt');
})(window);
