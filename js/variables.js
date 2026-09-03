// Module de gestion des variables : autocomplétion, badges, résolution des valeurs
const Variables = (function () {
  let activeQuill = null;
  let acBox = null;
  let acItems = [];
  let acSelectedIndex = 0;
  let acRange = null; // {index, length} du texte '#...' à remplacer

  function init(quillInstance) {
    activeQuill = quillInstance;
    acBox = document.getElementById('autocomplete-box');
    activeQuill.on('text-change', function (delta, oldDelta, source) {
      if (source !== 'user') return;
      checkForTrigger();
    });
    activeQuill.root.addEventListener('keydown', function (e) {
      if (acBox.style.display === 'block') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelection(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelection(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          confirmSelection();
        } else if (e.key === 'Escape') {
          hideAutocomplete();
        }
      }
    });
    document.addEventListener('click', function (e) {
      if (acBox && !acBox.contains(e.target)) hideAutocomplete();
    });
  }

  function checkForTrigger() {
    const range = activeQuill.getSelection();
    if (!range) {
      hideAutocomplete();
      return;
    }
    const textBefore = activeQuill.getText(0, range.index);
    const match = textBefore.match(/#([A-Za-z0-9_]*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const startIndex = range.index - match[0].length;
      acRange = { index: startIndex, length: match[0].length };
      showAutocomplete(query, range);
    } else {
      hideAutocomplete();
    }
  }

  function showAutocomplete(query, range) {
    const allVars = GristAPI.getAllVariables();
    acItems = allVars.filter(v => v.key.toLowerCase().includes(query));
    if (acItems.length === 0) {
      hideAutocomplete();
      return;
    }
    acSelectedIndex = 0;
    renderAutocomplete();
    positionAutocomplete(range);
    acBox.style.display = 'block';
  }

  function renderAutocomplete() {
    acBox.innerHTML = '';
    acItems.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'ac-item' + (idx === acSelectedIndex ? ' selected' : '');
      div.textContent = item.key;
      div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        acSelectedIndex = idx;
        confirmSelection();
      });
      acBox.appendChild(div);
    });
  }

  function moveSelection(delta) {
    acSelectedIndex = (acSelectedIndex + delta + acItems.length) % acItems.length;
    renderAutocomplete();
  }

  function positionAutocomplete(range) {
    const bounds = activeQuill.getBounds(range.index);
    const containerRect = activeQuill.root.getBoundingClientRect();
    acBox.style.left = (containerRect.left + bounds.left + window.scrollX) + 'px';
    acBox.style.top = (containerRect.top + bounds.top + bounds.height + window.scrollY + 4) + 'px';
  }

  function hideAutocomplete() {
    if (acBox) acBox.style.display = 'none';
    acRange = null;
  }

  function confirmSelection() {
    if (!acRange || acItems.length === 0) return;
    const item = acItems[acSelectedIndex];
    insertBadge(item);
    hideAutocomplete();
  }

  function insertBadge(item) {
    activeQuill.deleteText(acRange.index, acRange.length);
    activeQuill.insertEmbed(acRange.index, 'varbadge', { table: item.table, column: item.column, key: item.key });
    activeQuill.setSelection(acRange.index + 1, 0);
  }

  // Résout la valeur d'une variable pour un enregistrement de la table courante
  // currentTableId: table sur laquelle le widget est actuellement lié
  // record: enregistrement courant (grist.onRecord)
  async function resolveVariable(varTable, varColumn, currentTableId, record) {
    // Ne jamais lancer la résolution avec un contexte incomplet : un rendu
    // déclenché en parallèle peut sinon transmettre le currentTableId obsolète.
    const resolvedTableId = currentTableId || GristAPI.getCurrentTableId();
    console.log('[Variables] resolveVariable:', { varTable, varColumn, currentTableId: resolvedTableId, record: record ? Object.keys(record) : null });
    try {
      if (!record) return '';
      if (!resolvedTableId) {
        console.warn('[Variables] table courante absente pour', varTable + '_' + varColumn);
        return '[ERREUR: table courante indisponible]';
      }
      if (varTable === resolvedTableId) {
        const val = record[varColumn];
        console.log('[Variables] valeur locale:', varTable + '_' + varColumn, val);
        return formatValue(val);
      }
      // Colonne d'une autre table : chercher une colonne de référence
      const refCols = await GristAPI.findReferenceColumns(resolvedTableId, varTable);
      if (refCols.length === 0) {
        console.warn('[Variables] aucune référence:', { from: resolvedTableId, to: varTable, record });
        return `[ERREUR: aucune référence vers ${varTable} trouvée dans ${resolvedTableId}]`;
      }
      let refCol = refCols[0];
      if (refCols.length > 1) {
        refCol = await askUserForRefColumn(refCols, varTable);
        if (!refCol) return '[Sélection annulée]';
      }
      const refId = record[refCol];
      if (!refId) return '';
      const rowId = Array.isArray(refId) ? refId[1] : refId; // gestion RefList basique
      const linkedRow = await GristAPI.fetchRowById(varTable, rowId);
      if (!linkedRow) return `[ERREUR: ligne introuvable dans ${varTable}]`;
      const value = formatValue(linkedRow[varColumn]);
      console.log('[Variables] valeur liée:', varTable + '_' + varColumn, value);
      return value;
    } catch (e) {
      console.error('[Variables] échec résolution:', { varTable, varColumn, currentTableId: resolvedTableId, record }, e);
      return `[ERREUR: résolution de ${varTable}_${varColumn} impossible]`;
    }
  }

  function formatValue(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }

  function askUserForRefColumn(refCols, targetTable) {
    return new Promise((resolve) => {
      const modal = document.getElementById('ref-choice-modal');
      const text = document.getElementById('ref-choice-text');
      const select = document.getElementById('ref-choice-select');
      const btnOk = document.getElementById('ref-choice-confirm');
      const btnCancel = document.getElementById('ref-choice-cancel');
      text.textContent = `Plusieurs colonnes de référence vers "${targetTable}" existent. Laquelle utiliser ?`;
      select.innerHTML = '';
      refCols.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
      });
      modal.style.display = 'flex';
      function cleanup() {
        modal.style.display = 'none';
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
      }
      function onOk() {
        const v = select.value;
        cleanup();
        resolve(v);
      }
      function onCancel() {
        cleanup();
        resolve(null);
      }
      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
    });
  }

  return { init, resolveVariable, hideAutocomplete };
})();
