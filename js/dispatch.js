// js/dispatch.js — Saisie Dispatch (équipages, statuts, km, notes, rôles) avec anti-éjection
(function () {
  'use strict';

  const DISPATCH_KEY = 'dispatch_parc_vehicules';
  const $ = (s) => document.querySelector(s);

  let data = {};          // snapshot complet
  let vehs = [];          // settings vehs
  let isFocused = false;  // anti-éjection si un champ est actif
  let saveTimers = new Map(); // debounce par champ

  // Rôles fields
  const R_FIELDS = {
    officier_semaine:  $('#r_off_sem'),
    officier_garde:    $('#r_off_gar'),
    responsable_operations: $('#r_resp_ops'),
    chef_groupe:       $('#r_chef_grp'),
    chef_poste:        $('#r_chef_poste'),
    centraliste_1:     $('#r_cent1'),
    centraliste_2:     $('#r_cent2')
  };

  // Notes fields
  const noteMateriel = $('#note_materiel');
  const noteInfos    = $('#note_infos');

  // Boutons
  $('#btnSaveRoles').addEventListener('click', saveRoles);
  $('#btnSaveNotes').addEventListener('click', saveNotes);

  // Focus tracking (anti rerender pendant édition)
  document.addEventListener('focusin', (e)=>{ if (e.target.matches('input,select,textarea')) isFocused = true; });
  document.addEventListener('focusout', (e)=>{ if (e.target.matches('input,select,textarea')) setTimeout(()=>{ isFocused = false; }, 150); });

  // Abonnement en polling pour stabilité saisie
  subscribeKey(DISPATCH_KEY, (snap) => {
    data = snap || {};
    vehs = Array.isArray(data?._settings?.vehs) ? data._settings.vehs.slice() : [];

    // Alimenter Rôles + Notes si pas en édition
    renderRoles();
    renderNotes();

    // Table: si on tape, ne rerender pas pour éviter l’éjection
    if (!isFocused) {
      renderTable();
    } else {
      // tu peux mettre à jour les badges statut/kms passifs si tu veux, mais on garde simple
    }
    $('#dbg').textContent = `Véhicules: ${vehs.length}`;
  }, { mode: 'poll', intervalMs: 3000 });

  /* ====== Tri véhicules ======
   * 1) LH1..LH8
   * 2) TMS, PREV, OFF
   * 3) sans attribution
   * À l’intérieur: tri alpha par id
   */
  function sortVehs(list) {
    const orderLH = ['LH1','LH2','LH3','LH4','LH5','LH6','LH7','LH8'];
    const blockWeight = (v) => {
      const a = (v.attribution||'').toUpperCase();
      const i = orderLH.indexOf(a);
      if (i >= 0) return 0 + i; // 0..7
      if (a === 'TMS') return 20;
      if (a === 'PREV') return 21;
      if (a === 'OFF') return 22;
      return 30; // sans attribution / autres
    };
    return list.slice().sort((a,b) => {
      const wa = blockWeight(a), wb = blockWeight(b);
      if (wa !== wb) return wa - wb;
      return (a.id||'').localeCompare(b.id||'');
    });
  }

  function renderRoles() {
    const r = data._roles || {};
    R_FIELDS.officier_semaine.value = r.officier_semaine || '';
    R_FIELDS.officier_garde.value = r.officier_garde || '';
    R_FIELDS.responsable_operations.value = r.responsable_operations || '';
    R_FIELDS.chef_groupe.value = r.chef_groupe || '';
    R_FIELDS.chef_poste.value = r.chef_poste || '';
    R_FIELDS.centraliste_1.value = r.centraliste_1 || '';
    R_FIELDS.centraliste_2.value = r.centraliste_2 || '';
  }

  async function saveRoles() {
    const payload = {
      _roles: {
        officier_semaine:  R_FIELDS.officier_semaine.value.trim(),
        officier_garde:    R_FIELDS.officier_garde.value.trim(),
        responsable_operations: R_FIELDS.responsable_operations.value.trim(),
        chef_groupe:       R_FIELDS.chef_groupe.value.trim(),
        chef_poste:        R_FIELDS.chef_poste.value.trim(),
        centraliste_1:     R_FIELDS.centraliste_1.value.trim(),
        centraliste_2:     R_FIELDS.centraliste_2.value.trim()
      }
    };
    try {
      await updateKey(DISPATCH_KEY, payload);
      toast('Rôles enregistrés.');
    } catch (e) {
      console.error(e);
      toast('Erreur enregistrement rôles.', true);
    }
  }

  function renderNotes() {
    const n = data._notes || {};
    noteMateriel.value = n.materiel || '';
    noteInfos.value = n.infos || '';
  }

  async function saveNotes() {
    const payload = {
      _notes: {
        materiel: (noteMateriel.value||'').trim(),
        infos: (noteInfos.value||'').trim()
      }
    };
    try {
      await updateKey(DISPATCH_KEY, payload);
      toast('Notes enregistrées.');
    } catch (e) {
      console.error(e);
      toast('Erreur enregistrement notes.', true);
    }
  }

  function renderTable() {
    const body = $('#tblBody');
    body.innerHTML = '';

    const list = sortVehs(vehs);
    list.forEach(v => {
      const id = v.id;
      const d  = data[id] || {}; // état dynamique (XO, S, PS, statut, km, commentaire)
      const name = esc(d.name || v.name || v.id);
      const plaque = esc(d.plaque || v.plaque || '');
      const attr = esc(d.attribution || v.attribution || '');

      const statut = d.statut || 'Disponible';
      const stDotClass =
        statut === 'Disponible' ? 'st-Dispo' :
        statut === 'Sorti'      ? 'st-Sorti' :
        'st-Indispo';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${name}</b><br><span class="small">${plaque || '—'}</span></td>
        <td>${attr ? `<span class="badge">${attr}</span>` : '<span class="mut">—</span>'}</td>

        <td><input data-v="${id}" data-k="XO" value="${esc(d.XO||'')}" placeholder="Chauffeur"></td>
        <td><input data-v="${id}" data-k="S" value="${esc(d.S||'')}" placeholder="Soins"></td>
        <td><input data-v="${id}" data-k="PS" value="${esc(d.PS||'')}" placeholder="3ᵉ homme"></td>

        <td>
          <span class="status-dot ${stDotClass}"></span>
          <select data-v="${id}" data-k="statut">
            ${['Disponible','Sorti','Indisponible'].map(s =>
              `<option ${s===(d.statut||'Disponible')?'selected':''}>${s}</option>`
            ).join('')}
          </select>
        </td>

        <td><input data-v="${id}" data-k="km" value="${esc(d.km||'')}" inputmode="numeric" placeholder="Km"></td>
        <td><input data-v="${id}" data-k="commentaire" value="${esc(d.commentaire||'')}" placeholder="Remarque"></td>
      `;
      body.appendChild(tr);
    });

    // Bind inputs/selects avec debounce
    body.querySelectorAll('input[data-v],select[data-v]').forEach(el => {
      el.oninput = () => queueSave(el);
      el.onchange = () => queueSave(el);
    });
  }

  function queueSave(el) {
    const id = el.dataset.v;
    const k  = el.dataset.k;
    let val = el.value;
    if (k === 'km') val = val.replace(/[^\d]/g,''); // km numérique
    // patch léger
    const patch = {};
    patch[id] = Object.assign({}, data[id]||{}, { [k]: val });

    // Debounce par champ
    const key = id+'::'+k;
    clearTimeout(saveTimers.get(key));
    const t = setTimeout(async ()=>{
      try {
        await updateKey(DISPATCH_KEY, patch);
        // met à jour local pour éviter “echo”
        data[id] = patch[id];
        // pas de re-render immédiat pour ne pas perdre le focus
      } catch (e) {
        console.error(e);
        toast('Erreur de sauvegarde champ.', true);
      }
    }, 400);
    saveTimers.set(key, t);
  }

  function toast(msg, error=false) {
    const el = $('#toaster');
    el.textContent = msg;
    el.className = 'small toast ' + (error?'err':'ok');
    setTimeout(()=>{ el.textContent=''; el.className='small toast'; }, 2500);
  }

  function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

})();
