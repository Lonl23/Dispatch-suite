// js/index.js — Logique page d’accueil
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const loginCard = $('#loginCard');
  const menuCard  = $('#menuCard');
  const userBox   = $('#userBox');
  const errBox    = $('#err');
  const emailEl = $('#email');
  const passEl  = $('#password');
  const btnLogin = $('#btnLogin');
  const btnLoginDemo = $('#btnLoginDemo');
  const btnLogout = $('#btnLogout');

  document.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const href = tile.getAttribute('data-href');
    if (href) location.href = href;
  });

  function showError(msg) {
    errBox.textContent = msg || 'Erreur de connexion';
    errBox.style.display = 'block';
    setTimeout(() => errBox.style.display = 'none', 6000);
  }

  btnLogin.addEventListener('click', async () => {
    const email = (emailEl.value || '').trim();
    const password = passEl.value || '';
    if (!email || !password) return showError('Email et mot de passe requis.');
    btnLogin.disabled = true;
    try {
      await Auth.signInEmailPassword(email, password);
    } catch (e) {
      console.warn('[login error]', e);
      showError(`${e.code || 'auth/error'} — ${e.message || 'Erreur de connexion'}`);
    } finally {
      btnLogin.disabled = false;
    }
  });

  btnLoginDemo.addEventListener('click', async () => {
    try {
      await Auth.signInEmailPassword('centrale@acsrs.be', 'Password01$');
    } catch (e) {
      showError('Compte démo indisponible ou mot de passe invalide.');
    }
  });

  btnLogout.addEventListener('click', async () => {
    try { await Auth.signOut(); } catch {}
  });

  Auth.onAuth((user) => {
    if (user) {
      userBox.textContent = `Connecté : ${user.email}`;
      loginCard.style.display = 'none';
      menuCard.style.display = 'block';

      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      if (next) {
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
