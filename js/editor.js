const Editor = (function () {
  let quill = null;
  const FontSize = Quill.import('attributors/style/size');
  FontSize.whitelist = ['10px', '12px', '14px', '16px', '18px', '24px', '32px'];
  Quill.register(FontSize, true);
  const FontFamily = Quill.import('attributors/style/font');
  FontFamily.whitelist = ['arial', 'georgia', 'times-new-roman', 'courier-new', 'verdana'];
  Quill.register(FontFamily, true);

  function init() {
    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: { container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['page-break', 'insert-table', 'insert-two-columns'], ['clean']], handlers: { undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); }, 'insert-table': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-two-columns': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'page-break': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); } } }, history: { delay: 500, maxStack: 100, userOnly: true } } });
    const toolbar = document.querySelector('.ql-toolbar');
    if (toolbar) installTwoColumnsToolbarIsolation(toolbar);
    if (toolbar) { const undoBtn = toolbar.querySelector('.ql-undo'); const redoBtn = toolbar.querySelector('.ql-redo'); const pageBreakBtn = toolbar.querySelector('.ql-page-break'); const tableBtn = toolbar.querySelector('.ql-insert-table'); const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns'); if (undoBtn) undoBtn.innerHTML = '↶'; if (redoBtn) redoBtn.innerHTML = '↷'; if (tableBtn) { tableBtn.innerHTML = '▦ Tableau'; tableBtn.title = 'Insérer un tableau 2×2'; } if (twoColsBtn) { twoColsBtn.innerHTML = '▥ Zone 2 colonnes'; twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)'; } if (pageBreakBtn) { pageBreakBtn.innerHTML = '⏎ Saut de page'; pageBreakBtn.title = 'Insère un saut de page (forcé à l’export PDF)'; } }
    const tableTools = document.createElement('div'); tableTools.className = 'table-context-toolbar'; tableTools.innerHTML = '<button data-action="add-row-above">+ ligne au-dessus</button><button data-action="add-row-below">+ ligne en dessous</button><button data-action="remove-row">− ligne</button><button data-action="add-col-left">+ colonne à gauche</button><button data-action="add-col-right">+ colonne à droite</button><button data-action="remove-col">− colonne</button>'; document.getElementById('editor-container').appendChild(tableTools);
    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); let activeCell = null;
    function positionTableToolbar() { if (!activeCell || !tableTools.classList.contains('visible')) return; const tableRect = activeCell.closest('.editable-table').getBoundingClientRect(); const toolbarRect = tableTools.getBoundingClientRect(); tableTools.style.position = 'fixed'; tableTools.style.top = `${Math.max(8, tableRect.top - toolbarRect.height - 6)}px`; tableTools.style.left = `${Math.min(Math.max(8, tableRect.left), window.innerWidth - toolbarRect.width - 8)}px`; }
    quill.root.addEventListener('paste', function (event) { const target = event.target; const editableContainer = target && target.closest && target.closest('.editable-table td, .editable-table th, .two-columns-column'); if (!editableContainer) return; event.preventDefault(); event.stopPropagation(); const clipboard = event.clipboardData; const text = clipboard ? clipboard.getData('text/plain') : ''; if (text) document.execCommand('insertText', false, text); quill.update(Quill.sources.USER); }, true);

    function getRealActiveCell() { const selection = window.getSelection && window.getSelection(); const nodes = []; if (selection && selection.rangeCount) nodes.push(selection.anchorNode, selection.focusNode); nodes.push(document.activeElement); for (const node of nodes) { const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); const cell = element && element.closest && element.closest('.editable-table td, .editable-table th'); if (cell && cell.isContentEditable) return cell; } return null; }

    // --- Alignement isolé par cellule dans les tableaux ---
    // La cellule réellement ciblée est capturée au "mousedown" (avant que
    // Quill ne retire le focus de la cellule au profit de la toolbar).
    // On ne tente JAMAIS de restaurer un Range DOM ni d'appeler .focus()
    // sur la cellule : ces opérations sont fragiles (le DOM peut avoir
    // bougé entre mousedown et click) et provoquaient un fallback du
    // navigateur qui sélectionnait tout le tableau. On applique le style
    // text-align directement sur la référence de cellule capturée.
    let pendingTableCell = null;
    if (toolbar) toolbar.addEventListener('mousedown', function (event) {
      const target = event.target;
      const align = target.closest && target.closest('.ql-align');
      if (!align) { pendingTableCell = null; return; }
      pendingTableCell = getRealActiveCell();
    }, true);
    if (toolbar) toolbar.addEventListener('click', function (event) {
      const target = event.target;
      const button = target.closest && target.closest('.ql-align');
      if (!button) return;
      const pickerItem = target.closest && target.closest('.ql-align .ql-picker-item');
      const cell = pendingTableCell;
      pendingTableCell = null;
      if (!cell) return; // pas de cellule active : laisser Quill gérer l'alignement du texte normal
      if (!pickerItem) return; // clic d'ouverture du picker, pas encore un choix
      activeCell = cell;
      const value = pickerItem.getAttribute('data-value') || 'left';
      cell.style.textAlign = value === 'justify' ? 'justify' : value;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    tableTools.addEventListener('click', function (event) { const action = event.target.dataset.action; if (!action || !activeCell) return; const table = activeCell.closest('table'); const row = activeCell.parentElement; const col = activeCell.cellIndex; const makeCell = () => { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; return td; }; if (action === 'add-row-above' || action === 'add-row-below') { const tr = document.createElement('tr'); for (let i = 0; i < table.rows[0].cells.length; i += 1) tr.appendChild(makeCell()); row.parentElement.insertBefore(tr, action.endsWith('above') ? row : row.nextSibling); } if (action === 'remove-row' && table.rows.length > 1) row.remove(); if (action === 'add-col-left' || action === 'add-col-right') Array.from(table.rows).forEach(r => r.insertBefore(makeCell(), action.endsWith('left') ? r.cells[col] : r.cells[col].nextSibling)); if (action === 'remove-col' && row.cells.length > 1) Array.from(table.rows).forEach(r => { if (r.cells[col]) r.deleteCell(col); }); ensureTableColumns(table); quill.update(Quill.sources.USER); });
    Variables.init(quill); return quill;
  }

  return { init };
})();
