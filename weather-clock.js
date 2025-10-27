<!-- weather-clock.js -->
<script>
(function(){
  const WMO = {
    0:"Ciel clair", 1:"Peu nuageux", 2:"Partiellement nuageux", 3:"Couvert",
    45:"Brouillard", 48:"Brouillard givrant",
    51:"Bruine légère", 53:"Bruine", 55:"Bruine forte",
    61:"Pluie faible", 63:"Pluie", 65:"Pluie forte",
    66:"Pluie verglaçante faible", 67:"Pluie verglaçante forte",
    71:"Neige faible", 73:"Neige", 75:"Neige forte",
    77:"Grains de neige",
    80:"Averses faibles", 81:"Averses", 82:"Averses fortes",
    95:"Orage", 96:"Orage grêle légère", 99:"Orage grêle forte"
  };

  function pad2(n){ return n<10 ? "0"+n : n; }

  // Horloge
  window.startClock = function(clockElId="now"){
    const el = document.getElementById(clockElId);
    if(!el) return;
    function tick(){
      const d = new Date();
      el.textContent = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} — ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    }
    tick();
    setInterval(tick, 1000);
  };

  // Météo (Open-Meteo, sans clé)
  window.startWeather = async function(opts = {}){
    const {
      lat = 50.729, lon = 4.486,  // La Hulpe (B-1310)
      tz = "Europe/Brussels",
      targetId = "weather"
    } = opts;
    const el = document.getElementById(targetId);
    if(!el) return;

    async function load(){
      try{
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=${encodeURIComponent(tz)}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        const c = j.current || {};
        const t = Math.round(c.temperature_2m ?? 0);
        const w = Math.round(c.wind_speed_10m ?? 0);
        const p = c.precipitation ?? 0;
        const code = c.weather_code;
        const label = WMO[code] || "—";

        el.innerHTML = `🌡️ ${t}°C • 💨 ${w} km/h • 🌧️ ${p} mm • ${label} (La Hulpe)`;
      }catch(e){
        el.textContent = "Météo: indisponible";
      }
    }
    await load();
    // rafraîchi toutes les 5 minutes
    setInterval(load, 5*60*1000);
  };
})();
</script>
