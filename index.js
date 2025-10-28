// index.js — Logique page d’accueil : login + menu + navigation

(function () {
  'use strict';

  const q = (sel) => document.querySelector(sel);

  const loginCard = q('#loginCard');
  const menuCard  = q('#menuCard');
  const userBox   = q('#userBox');
  const errBox    = q('#err');

  const emailEl = q('#email');
  const passEl  = q('#password');
  const btnLogin = q('#btnLogin');
  const btnLoginDemo = q('#btnLoginDemo');
  const btnLogout = q('#btnLogout');

  // Navigation depuis les tuiles
  document.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const href = tile.getAttribute('data-href');
    if (href) location.href = href;
  });

  function showError(msg) {
    errBox.textContent = msg || 'Erreur de connexion';
    errBox.style.display = 'block';
    setTimeout(() => { errBox.style.display = 'none'; }, 6000);
  }

  btnLogin.addEventListener('click', async () => {
    const email = (emailEl.value || '').trim();
    const password = passEl.value || '';
    if (!email || !password) return showError('Email et mot de passe requis.');
    try {
      await Auth.signInEmailPassword(email, password);
      // onAuthStateChanged s’occupera d’afficher le menu
    } catch (e) {
      console.warn(e);
      showError('Identifiants invalides.');
    }
  });

  // Optionnel : connexion démo si tu configures un compte spécifique
  btnLoginDemo.addEventListener('click', async () => {
    try {
      await Auth.signInEmailPassword('centrale@acsrs.be', 'Password01$');
    } catch {
      showError('Compte démo indisponible.');
    }
  });

  btnLogout.addEventListener('click', async () => {
    try { await Auth.signOut(); } catch {}
  });

  // Affichage dynamique selon auth
  Auth.onAuth((user) => {
    if (user) {
      userBox.textContent = `Connecté : ${user.email}`;
      loginCard.style.display = 'none';
      menuCard.style.display = 'block';

      // Si on arrive avec ?next=xxx après redirection guard
      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      if (next) {
        // Nettoie le paramètre pour éviter boucles
        history.replaceState({}, '', 'index.html');
        location.href = next;
      }
    } else {
      userBox.textContent = 'Non connecté';
      menuCard.style.display = 'none';
      loginCard.style.display = 'block';
    }
  });
})();
