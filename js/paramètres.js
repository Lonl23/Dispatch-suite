// js/parametres.js — Paramétrages (véhicules, rôles, emplacements) avec Firebase via store-bridge
(function () {
  'use strict';

  const DISPATCH_KEY = 'dispatch_parc_vehicules';
  let data = {};                // snapshot complet dispatch
  let vehs = [];                // liste _settings.vehs (array d’objets)
  let isSaving = false;         // anti-rebond affichage

  const $ = (s) => document.querySelector(s);
  const tb = () => document.querySelector('#vehTable tbody');

  // Champs rôles
  const R_FIELDS = {
    officier_semaine:  $('#r_off_sem'),
    officier_garde:    $('#r_off_gar'),
    responsable_operations: $('#r_resp_ops'),
    chef_groupe:       $('#r_chef_grp'),
    chef_poste:        $('#r_chef_poste'),
    centraliste_1:     $('#r_cent1'),
    centraliste_2:     $('#r_cent2')
  };

  // Form véhicule
  const v_id = $('#v_id');
  const v_name = $('#v_name');
  const v_plaque = $('#v_plaque');
  const v_attr = $('#v_attr');
  const v_slot = $('#v_slot');

  $('#btnSaveRoles').addEventListener('click', saveRoles);
  $('#btnAddVeh').addEventListener('click', addOrUpdateVeh);
  $('#btnResetVehForm').addEventListener('click', resetVehForm);

  // Subscribe: polling (stable pendant édition)
  subscribeKey(DISPATCH_KEY, (snap) => {
    if (!snap) snap = {};
    data = snap;
    vehs = Array.isArray(snap?._settings?.vehs) ? snap._settings.vehs : [];
    renderRoles();
    renderVehTable();
    $('#debug').textContent = `Véhicules: ${vehs.length}`;
  }, { mode: 'poll', intervalMs: 3000 });

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
      isSaving = true;
      await updateKey(DISPATCH_KEY, payload);
      $('#rolesInfo').textContent = 'Enregistré.';
      setTimeout(()=>$('#rolesInfo').textContent='', 2000);
    } catch (e) {
      alert('Erreur sauvegarde rôles');
    } finally {
      isSaving = false;
    }
  }

  function renderVehTable() {
    const body = tb();
    body.innerHTML = '';
    vehs.forEach((v, idx) => {
      const id = esc(v.id);
      const name = esc(v.name || '');
      const plaque = esc(v.plaque || '');
      const attr = esc(v.attribution || '');
      const slot = esc(v.emplacement || '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${id}</b><br><span class="small">${name||'—'}</span></td>
        <td>${plaque||'—'}</td>
        <td>
          <select data-idx="${idx}" data-k="attribution">
            ${['','LH1','LH2','LH3','LH4','LH5','LH6','LH7','LH8','TMS','OFF','PREV'].map(x =>
              `<option value="${x}" ${x=== (v.attribution||'') ? 'selected':''}>${x||'—'}</option>`
            ).join('')}
          </select>
        </td>
        <td>
          <select data-idx="${idx}" data-k="emplacement">
            ${slotOptions(v.emplacement||'')}
          </select>
        </td>
        <td>
          <button class="btn ghost" data-act="edit" data-idx="${idx}">Éditer</button>
          <button class="btn danger" data-act="del" data-idx="${idx}">Supprimer</button>
        </td>
      `;
      body.appendChild(tr);
    });

    // Bind change select (attribution/emplacement)
    body.querySelectorAll('select[data-idx]').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const idx = parseInt(sel.dataset.idx, 10);
        const key = sel.dataset.k;
        const val = sel.value;
        if (key === 'emplacement') {
          await setEmplacementWithSwap(idx, val);
        } else {
          vehs[idx][key] = val || '';
          await saveVehs();
        }
      });
    });

    // Bind actions
    body.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        const idx = parseInt(btn.dataset.idx, 10);
        if (act === 'edit') {
          editVehToForm(idx);
        } else if (act === 'del') {
          const v = vehs[idx];
          if (!confirm(`Supprimer le véhicule ${v.id} ?`)) return;
          vehs.splice(idx, 1);
          await saveVehs();
        }
      });
    });
  }

  function slotOptions(selected) {
    const opts = [
      { label:'—', value:'' },
      ...['H1','H2','H3','H4','H5','H6','H7','H8','H9','H10'].map(x=>({label:x,value:x})),
      ...['G1','G2','G3','G4','G5','G6','G7','G8'].map(x=>({label:x,value:x})),
      { label:'Extérieur', value:'Extérieur' }
    ];
    return opts.map(o => `<option value="${o.value}" ${o.value===selected?'selected':''}>${o.label}</option>`).join('');
  }

  async function setEmplacementWithSwap(idx, newSlot) {
    const me = vehs[idx];
    const oldSlot = me.emplacement || '';
    if (newSlot === oldSlot) return; // rien à faire

    if (!newSlot) {
      me.emplacement = '';
      await saveVehs();
      return;
    }

    // Cherche s’il est déjà occupé
    const otherIdx = vehs.findIndex((v,i)=> i!==idx && (v.emplacement||'')===newSlot);
    if (otherIdx >= 0) {
      const other = vehs[otherIdx];
      const ok = confirm(`L’emplacement ${newSlot} est occupé par ${other.id}. Échanger les emplacements ?`);
      if (!ok) {
        // Annule le changement visuel
        renderVehTable();
        return;
      }
      // Swap
      vehs[otherIdx].emplacement = oldSlot || '';
      me.emplacement = newSlot;
      await saveVehs();
      return;
    }

    // Libre → on assigne
    me.emplacement = newSlot;
    await saveVehs();
  }

  function editVehToForm(idx) {
    const v = vehs[idx];
    v_id.value = v.id;
    v_id.disabled = true; // id non éditable pour garder la cohérence
    v_name.value = v.name || '';
    v_plaque.value = v.plaque || '';
    v_attr.value = v.attribution || '';
    v_slot.value = v.emplacement || '';
    $('#btnAddVeh').textContent = 'Mettre à jour';
  }

  function resetVehForm() {
    v_id.value=''; v_id.disabled=false;
    v_name.value=''; v_plaque.value='';
    v_attr.value=''; v_slot.value='';
    $('#btnAddVeh').textContent = 'Ajouter';
  }

  async function addOrUpdateVeh() {
    const id = (v_id.value || '').trim();
    if (!id) return alert('Un identifiant de véhicule est requis (ex: AS 55).');

    const existsIdx = vehs.findIndex(v => (v.id||'') === id);
    const obj = {
      id,
      name: (v_name.value||'').trim(),
      plaque: (v_plaque.value||'').trim(),
      attribution: v_attr.value || '',
      emplacement: v_slot.value || ''
    };

    // Vérifie unicité d’emplacement côté ajout/màj
    if (obj.emplacement) {
      const otherIdx = vehs.findIndex((v,i)=> (v.emplacement||'')===obj.emplacement && (existsIdx<0 || i!==existsIdx));
      if (otherIdx >= 0) {
        const other = vehs[otherIdx];
        const ok = confirm(`L’emplacement ${obj.emplacement} est occupé par ${other.id}. Échanger les emplacements ?`);
        if (ok) {
          // swap
          const tmp = other.emplacement || '';
          vehs[otherIdx].emplacement = (existsIdx>=0 ? (vehs[existsIdx].emplacement||'') : '') || '';
        } else {
          // abandonner l’emplacement si refus
          obj.emplacement = existsIdx>=0 ? (vehs[existsIdx].emplacement||'') : '';
        }
      }
    }

    if (existsIdx >= 0) {
      vehs[existsIdx] = Object.assign({}, vehs[existsIdx], obj);
    } else {
      // À la création: empêche ID dupliqué
      if (vehs.some(v => (v.id||'') === id)) {
        return alert('Cet identifiant existe déjà.');
      }
      vehs.push(obj);
    }

    await saveVehs();
    resetVehForm();
  }

  async function saveVehs() {
    if (!data._settings) data._settings = {};
    data._settings.vehs = vehs;
    try {
      isSaving = true;
      await updateKey(DISPATCH_KEY, { _settings: data._settings });
    } catch (e) {
      alert('Erreur de sauvegarde des véhicules.');
    } finally {
      isSaving = false;
      renderVehTable();
    }
  }

  function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
