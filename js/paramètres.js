// js/parametres.js — Uniquement véhicules (CRUD), plaques, attributions, emplacements (unicité + échange)
(function () {
  'use strict';

  const DISPATCH_KEY = 'dispatch_parc_vehicules';
  let data = {};        // snapshot complet
  let vehs = [];        // _settings.vehs (array)
  let saving = false;

  const $ = (s) => document.querySelector(s);
  const tb = () => document.querySelector('#vehTable tbody');

  // Form
  const v_id = $('#v_id');
  const v_name = $('#v_name');
  const v_plaque = $('#v_plaque');
  const v_attr = $('#v_attr');
  const v_slot = $('#v_slot');

  $('#btnAddVeh').addEventListener('click', addOrUpdateVeh);
  $('#btnResetVehForm').addEventListener('click', resetVehForm);

  // Lecture en polling (stable pendant édition)
  subscribeKey(DISPATCH_KEY, (snap) => {
    if (!snap) snap = {};
    data = snap;
    vehs = Array.isArray(snap?._settings?.vehs) ? snap._settings.vehs : [];
    renderVehTable();
    $('#debug').textContent = `Véhicules: ${vehs.length}`;
  }, { mode: 'poll', intervalMs: 3000 });

  function renderVehTable() {
    const body = tb();
    body.innerHTML = '';
    vehs.forEach((v, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${esc(v.id)}</b><br><span class="small">${esc(v.name||'—')}</span></td>
        <td>${esc(v.plaque||'—')}</td>
        <td>
          <select data-idx="${idx}" data-k="attribution">
            ${['','LH1','LH2','LH3','LH4','LH5','LH6','LH7','LH8','TMS','OFF','PREV'].map(x =>
              `<option value="${x}" ${x === (v.attribution||'') ? 'selected':''}>${x||'—'}</option>`
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

    // Bind selects
    body.querySelectorAll('select[data-idx]').forEach(sel => {
      sel.onchange = async () => {
        const idx = parseInt(sel.dataset.idx, 10);
        const key = sel.dataset.k;
        const val = sel.value;

        if (key === 'emplacement') {
          await setEmplacementWithSwap(idx, val);
        } else {
          vehs[idx][key] = val || '';
          await saveVehs();
        }
      };
    });

    // Bind boutons
    body.querySelectorAll('button[data-act]').forEach(btn => {
      btn.onclick = async () => {
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
      };
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
    if (newSlot === oldSlot) return;

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
        // Annule visuel
        renderVehTable();
        return;
      }
      vehs[otherIdx].emplacement = oldSlot || '';
      me.emplacement = newSlot;
      await saveVehs();
      return;
    }

    me.emplacement = newSlot;
    await saveVehs();
  }

  function editVehToForm(idx) {
    const v = vehs[idx];
    v_id.value = v.id;
    v_id.disabled = true; // ID non modifiable
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
    $('#saveInfo').textContent = '';
  }

  async function addOrUpdateVeh() {
    const id = (v_id.value || '').trim();
    if (!id) return toast('Un identifiant est requis.', true);

    const existsIdx = vehs.findIndex(v => (v.id||'') === id);
    const obj = {
      id,
      name: (v_name.value||'').trim(),
      plaque: (v_plaque.value||'').trim(),
      attribution: v_attr.value || '',
      emplacement: v_slot.value || ''
    };

    // Unicité d’emplacement
    if (obj.emplacement) {
      const otherIdx = vehs.findIndex((v,i)=> (v.emplacement||'')===obj.emplacement && (existsIdx<0 || i!==existsIdx));
      if (otherIdx >= 0) {
        const other = vehs[otherIdx];
        const ok = confirm(`L’emplacement ${obj.emplacement} est occupé par ${other.id}. Échanger les emplacements ?`);
        if (ok) {
          const prevSlot = (existsIdx>=0 ? (vehs[existsIdx].emplacement||'') : '') || '';
          vehs[otherIdx].emplacement = prevSlot;
        } else {
          // annule l’emplacement si refus
          obj.emplacement = existsIdx>=0 ? (vehs[existsIdx].emplacement||'') : '';
        }
      }
    }

    if (existsIdx >= 0) {
      vehs[existsIdx] = Object.assign({}, vehs[existsIdx], obj);
    } else {
      if (vehs.some(v => (v.id||'') === id)) return toast('Cet identifiant existe déjà.', true);
      vehs.push(obj);
    }

    await saveVehs();
    resetVehForm();
    toast('Véhicule enregistré.', false);
  }

  async function saveVehs() {
    if (!data._settings) data._settings = {};
    // On force un tri stable par id pour cohérence (optionnel)
    vehs.sort((a,b)=> (a.id||'').localeCompare(b.id||''));
    data._settings.vehs = vehs;
    saving = true;
    try {
      await updateKey(DISPATCH_KEY, { _settings: data._settings });
    } catch (e) {
      console.error(e);
      toast('Erreur de sauvegarde (réseau/permissions).', true);
    } finally {
      saving = false;
      renderVehTable();
    }
  }

  function toast(msg, error=false) {
    const el = $('#saveInfo');
    el.textContent = msg;
    el.className = 'small ' + (error?'err':'ok');
    setTimeout(()=>{ el.textContent=''; el.className='small'; }, 3000);
  }

  function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
