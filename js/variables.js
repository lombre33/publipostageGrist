// Module de gestion des variables : autocomplétion, badges, résolution des valeurs
const Variables = (function () {
  let activeQuill = null;
  let acBox = null;
  let acItems = [];
  let acSelectedIndex = 0;
  let acRange = null;
  let activeTableCell = null;
  function init(quillInstance) {
    activeQuill = quillInstance; acBox = document.getElementById('autocomplete-box');
    activeQuill.on('text-change', function (delta, oldDelta, source) { if (source !== 'user') return; checkForTrigger(); });
    function cellFromEvent(event) { let target = event.target; if (target && target.nodeType !== 1) target = target.parentElement; return target && target.closest ? target.closest('.editable-table td, .editable-table th, .two-columns-column') : null; }
    function handleCellInput(event) { const cell = cellFromEvent(event); if (!cell) return; activeTableCell = cell; checkForCellTrigger(cell); }
    document.addEventListener('input', handleCellInput, true);
    document.addEventListener('keyup', handleCellInput, true);
    activeQuill.root.addEventListener('input', handleCellInput);
    activeQuill.root.addEventListener('keyup', handleCellInput);
    activeQuill.root.addEventListener('focusin', function (event) { const cell = event.target && event.target.closest && event.target.closest('.editable-table td, .editable-table th'); activeTableCell = cell || null; if (cell) checkForCellTrigger(cell); });
    document.addEventListener('keydown', function (e) { const cell = cellFromEvent(e); if (cell) activeTableCell = cell; if (acBox.style.display === 'block') { if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); } else if (e.key === 'Enter') { e.preventDefault(); confirmSelection(); } else if (e.key === 'Escape') hideAutocomplete(); } });
    document.addEventListener('click', function (e) { if (acBox && !acBox.contains(e.target)) hideAutocomplete(); });
  }
  function checkForTrigger() { const range = activeQuill.getSelection(); if (!range) { hideAutocomplete(); return; } const textBefore = activeQuill.getText(0, range.index); const match = textBefore.match(/#([A-Za-z0-9_]*)$/); if (match) { const query = match[1].toLowerCase(); const startIndex = range.index - match[0].length; acRange = { index: startIndex, length: match[0].length }; showAutocomplete(query, range); } else hideAutocomplete(); }
  function showAutocomplete(query, range) { const allVars = GristAPI.getAllVariables(); acItems = allVars.filter(v => v.key.toLowerCase().includes(query)); if (acItems.length === 0) { hideAutocomplete(); return; } acSelectedIndex = 0; renderAutocomplete(); positionAutocomplete(range); acBox.style.display = 'block'; }
  function renderAutocomplete() { acBox.innerHTML = ''; acItems.forEach((item, idx) => { const div = document.createElement('div'); div.className = 'ac-item' + (idx === acSelectedIndex ? ' selected' : ''); div.textContent = item.key; div.addEventListener('mousedown', function (e) { e.preventDefault(); acSelectedIndex = idx; confirmSelection(); }); acBox.appendChild(div); }); }
  function moveSelection(delta) { acSelectedIndex = (acSelectedIndex + delta + acItems.length) % acItems.length; renderAutocomplete(); }
  function positionAutocomplete(range) { const bounds = activeQuill.getBounds(range.index); const containerRect = activeQuill.root.getBoundingClientRect(); acBox.style.left = (containerRect.left + bounds.left + window.scrollX) + 'px'; acBox.style.top = (containerRect.top + bounds.top + bounds.height + window.scrollY + 4) + 'px'; }
  function hideAutocomplete() { if (acBox) acBox.style.display = 'none'; acRange = null; }
  function confirmSelection() {
    if (acItems.length === 0) return;
    const item = acItems[acSelectedIndex];
    if (acRange && acRange.tableCell) {
      insertTableCellBadge(item, acRange);
      hideAutocomplete();
      return;
    }
    if (!acRange) return;
    insertBadge(item);
    hideAutocomplete();
  }
  function insertBadge(item) {
    activeQuill.deleteText(acRange.index, acRange.length);
    activeQuill.insertEmbed(acRange.index, 'varbadge', { table: item.table, column: item.column, key: item.key });
    activeQuill.setSelection(acRange.index + 1, 0);
  }
  function nativeCaretOffset(cell) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !cell.contains(selection.anchorNode)) return null;
    const before = document.createRange();
    before.selectNodeContents(cell);
    before.setEnd(selection.anchorNode, selection.anchorOffset);
    return before.toString().length;
  }
  function nativeRangeAtOffset(cell, start, end) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let node; let position = 0; let startPoint = null; let endPoint = null;
    while ((node = walker.nextNode())) {
      const next = position + node.nodeValue.length;
      if (!startPoint && start <= next) startPoint = [node, Math.max(0, start - position)];
      if (!endPoint && end <= next) { endPoint = [node, Math.max(0, end - position)]; break; }
      position = next;
    }
    if (!startPoint) { startPoint = [cell, cell.childNodes.length]; }
    if (!endPoint) endPoint = [cell, cell.childNodes.length];
    const range = document.createRange();
    range.setStart(startPoint[0], startPoint[1]);
    range.setEnd(endPoint[0], endPoint[1]);
    return range;
  }
  function insertTableCellBadge(item, state) {
    const cell = state.tableCell;
    const range = nativeRangeAtOffset(cell, state.start, state.end);
    range.deleteContents();
    const badge = document.createElement('span');
    badge.setAttribute('data-table', item.table);
    badge.setAttribute('data-column', item.column);
    badge.setAttribute('data-key', item.key);
    badge.setAttribute('contenteditable', 'false');
    badge.className = 'var-badge';
    badge.textContent = '#' + item.key;
    range.insertNode(badge);
    const caret = document.createRange();
    caret.setStartAfter(badge); caret.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(caret);
    activeTableCell = cell;
    activeQuill.update(Quill.sources.USER);
  }
  function checkForCellTrigger(cell) {
    const caret = nativeCaretOffset(cell);
    if (caret === null) { hideAutocomplete(); return; }
    const text = (cell.textContent || '').slice(0, caret);
    const match = text.match(/#([A-Za-z0-9_]*)$/);
    if (!match) { hideAutocomplete(); return; }
    const query = match[1].toLowerCase();
    const allVars = GristAPI.getAllVariables();
    acItems = allVars.filter(v => v.key.toLowerCase().includes(query));
    if (acItems.length === 0) { hideAutocomplete(); return; }
    acSelectedIndex = 0;
    acRange = { tableCell: cell, start: caret - match[0].length, end: caret };
    renderAutocomplete(); positionAutocompleteForCell(cell); acBox.style.display = 'block';
  }
  function positionAutocompleteForCell(cell) {
    const cellRect = cell.getBoundingClientRect();
    acBox.style.left = (cellRect.left + window.scrollX) + 'px';
    acBox.style.top = (cellRect.bottom + window.scrollY + 4) + 'px';
  }
  async function resolveVariable(varTable, varColumn, currentTableId, record) { const resolvedTableId = currentTableId || GristAPI.getCurrentTableId(); try { if (!record) return ''; if (!resolvedTableId) return '[ERREUR: table courante indisponible]'; if (varTable === resolvedTableId) return formatValue(record[varColumn]); const refCols = await GristAPI.findReferenceColumns(resolvedTableId, varTable); if (refCols.length === 0) return `[ERREUR: aucune référence vers ${varTable} trouvée dans ${resolvedTableId}]`; let refCol = refCols[0]; if (refCols.length > 1) { refCol = await askUserForRefColumn(refCols, varTable); if (!refCol) return '[Sélection annulée]'; } const refId = record[refCol]; if (!refId) return ''; const rowId = Array.isArray(refId) ? refId[1] : refId; const linkedRow = await GristAPI.fetchRowById(varTable, rowId); if (!linkedRow) return `[ERREUR: ligne introuvable dans ${varTable}]`; return formatValue(linkedRow[varColumn]); } catch (e) { console.error('[variables] échec résolution', e); return `[ERREUR: résolution de ${varTable}_${varColumn} impossible]`; } }
  function formatValue(val) { if (val === null || val === undefined) return ''; if (Array.isArray(val)) return val.join(', '); return String(val); }
  function askUserForRefColumn(refCols, targetTable) { return new Promise((resolve) => { const modal = document.getElementById('ref-choice-modal'); const text = document.getElementById('ref-choice-text'); const select = document.getElementById('ref-choice-select'); const btnOk = document.getElementById('ref-choice-confirm'); const btnCancel = document.getElementById('ref-choice-cancel'); text.textContent = `Plusieurs colonnes de référence vers "${targetTable}" existent. Laquelle utiliser ?`; select.innerHTML = ''; refCols.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; select.appendChild(opt); }); modal.style.display = 'flex'; function cleanup() { modal.style.display = 'none'; btnOk.removeEventListener('click', onOk); btnCancel.removeEventListener('click', onCancel); } function onOk() { const v = select.value; cleanup(); resolve(v); } function onCancel() { cleanup(); resolve(null); } btnOk.addEventListener('click', onOk); btnCancel.addEventListener('click', onCancel); }); }
  return { init, resolveVariable, hideAutocomplete };
})();
