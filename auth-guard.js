<script>
// Vérifie l’authentification et le mode avant d’autoriser la page
(function(){
  const current = location.pathname.split('/').pop(); // ex: dispatch.html
  let s = null;
  try {
    s = JSON.parse(sessionStorage.getItem('auth_session') || 'null');
  } catch(e){}

  // Si pas connecté → retour page login
  if(!s || !s.username){
    alert("Veuillez vous connecter avant d'accéder à cette page.");
    location.replace("index.html");
    return;
  }

  // Vérifie le mode selon la page
  const mode = s.mode;
  const affichagePages = ["tv-grid.html", "tv-missions.html"];
  const encodagePages = ["dispatch.html", "missions.html", "parametres.html"];

  if (affichagePages.includes(current) && mode !== "affichage") {
    alert("Cette page est réservée au mode AFFICHAGE. Retour à l’accueil.");
    location.replace("index.html");
    return;
  }
  if (encodagePages.includes(current) && mode !== "encodage") {
    alert("Cette page est réservée au mode ENCODAGE. Retour à l’accueil.");
    location.replace("index.html");
    return;
  }

  // Si tout est bon → autorise la page
  console.log("✅ Accès autorisé :", current, "Mode:", mode);
})();
</script>
