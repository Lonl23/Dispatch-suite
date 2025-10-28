// auth-guard.js — Protection des pages (redirige vers index si non connecté)
// À inclure en haut de TOUTES les pages sensibles (dispatch, missions, tv-*, parametres)

(function (global) {
  'use strict';
  if (!global.firebase?.auth) {
    console.warn('[auth-guard] Firebase Auth non chargé (page publique ?)');
    return;
  }

  const auth = firebase.auth();

  // Appeler ceci au chargement de chaque page protégée
  function ensureAuthOrRedirect() {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        // Redirection propre : on garde l’URL cible pour retour post-login si besoin
        const target = encodeURIComponent(location.pathname.replace(/^\//,''));
        location.replace(`index.html?next=${target}`);
      }
    });
  }

  // Permet aussi de vérifier dans le code si besoin
  function isAuthenticated() {
    return !!auth.currentUser;
  }

  global.AuthGuard = {
    ensureAuthOrRedirect,
    isAuthenticated
  };

  console.log('[auth-guard] prêt');
})(window);
