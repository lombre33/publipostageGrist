// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l'export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
const Editor = (function () {
  let quill = null;

  const FontSize = Quill.import('formats/size');
  Quill.register(FontSize, true);

  const FontFamily = Quill.import('formats/font');
  Quill.register(FontFamily, true);

  const Embed = Quill.import('blots/embed');
  class VarBadgeBlot extends Embed {
    static create(value) {
      const node = super.create();
      node.setAttribute('data-table', value.table);
      node.setAttribute('data-column', value.column);
      node.setAttribute('data-key', value.key);
      node.setAttribute('contenteditable', 'false');
      node.classList.add('var-badge');
      node.textContent = '#' + value.key;
      return node;
    }
    static value(node) {
      return {
        table: node.getAttribute('data-table'),
        column: node.getAttribute('data-column'),
        key: node.getAttribute('data-key')
      };
    }
  }
  VarBadgeBlot.blotName = 'varbadge';
  VarBadgeBlot.tagName = 'span';
  VarBadgeBlot.className = 'var-badge';
  Quill.register(VarBadgeBlot);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PageBreakBlot extends BlockEmbed {
    static create(value) {
      const node = super.create(value);
      node.setAttribute('contenteditable', 'false');
      node.classList.add('page-break-marker');
      node.dataset.type = 'page-break';
      return node;
    }
    static value(node) { return { type: 'pageBreak' }; }
  }
  PageBreakBlot.blotName = 'pagebreak';
  PageBreakBlot.tagName = 'div';
  PageBreakBlot.className = 'page-break-marker';
  Quill.register(PageBreakBlot);

  const TableBlot = Quill.import('blots/block/embed');
  class EditableTableBlot extends TableBlot {
    static create(value) {
      const node = super.create();
      node.classList.add('editable-table');
      node.setAttribute('contenteditable', 'false');
      let table = node.querySelector('table');
      if (!table) {
        table = document.createElement('table');
        node.appendChild(table);
      }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 2; c += 1) {
            const cell = document.createElement(c === 0 ? 'th' : 'td');
            cell.contentEditable = 'true';
            cell.innerHTML = '&nbsp;';
            tr.appendChild(cell);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }
      ensureTableColumns(table);
      return node;
    }
    static value(node) {
      const table = node.querySelector('table');
      return { html: table ? table.outerHTML : '' };
    }
  }
  EditableTableBlot.blotName = 'editabletable';
  EditableTableBlot.tagName = 'div';
  EditableTableBlot.className = 'editable-table';
  Quill.register(EditableTableBlot);

  const TwoColumnsBlot = BlockEmbed;
  class TwoColumnsBlotClass extends TwoColumnsBlot {
    static create(value) {
      const node = super.create();
      node.classList.add('two-columns-zone');
      node.setAttribute('contenteditable', 'false');
      const build = (html) => { const col = document.createElement('div'); col.className = 'two-columns-column'; col.contentEditable = 'true'; col.innerHTML = html || ''; return col; };
      const cols = (value && value.cols) || ['', ''];
      node.appendChild(build(cols[0])); node.appendChild(build(cols[1]));
      const marker = document.createElement('div'); marker.className = 'two-columns-marker'; marker.textContent = '▥ Zone à 2 colonnes'; marker.contentEditable = 'false'; node.appendChild(marker);
      ensureTwoColumnsGrip(node);
      return node;
    }
    static value(node) {
      const cols = node.querySelectorAll('.two-columns-column');
      return { cols: [cols[0] ? cols[0].innerHTML : '', cols[1] ? cols[1].innerHTML : ''] };
    }
  }
  TwoColumnsBlotClass.blotName = 'twocolumns';
  TwoColumnsBlotClass.tagName = 'div';
  TwoColumnsBlotClass.className = 'two-columns-zone';
  Quill.register(TwoColumnsBlotClass);

  // Appliquer les formats au seul DOM de la colonne contenant la sélection.
  function installTwoColumnsToolbarIsolation(toolbar) {
    if (!toolbar) return;
    let savedRange = null;
    const activeColumn = range => {
      if (!range) return null;
      const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
      const column = start && start.closest('.two-columns-column');
      return column && end && end.closest('.two-columns-column') === column ? column : null;
    };
    const saveSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount && activeColumn(selection.getRangeAt(0))) savedRange = selection.getRangeAt(0).cloneRange();
    };
    quill.root.addEventListener('mouseup', saveSelection, true);
    quill.root.addEventListener('keyup', saveSelection, true);
    toolbar.addEventListener('mousedown', saveSelection, true);
    toolbar.addEventListener('click', event => {
      const control = event.target.closest('button, .ql-picker-item');
      if (!control || !savedRange || !activeColumn(savedRange)) return;
      const value = control.getAttribute('data-value') || '';
      const commands = { 'ql-bold': ['bold'], 'ql-italic': ['italic'], 'ql-underline': ['underline'], 'ql-clean': ['removeFormat'], 'ql-align': [value === 'center' ? 'justifyCenter' : value === 'right' ? 'justifyRight' : value === 'justify' ? 'justifyFull' : 'justifyLeft'], 'ql-size': ['fontSize', { small: '2', large: '4', huge: '6' }[value] || '3'], 'ql-header': ['formatBlock', value ? 'H' + value : 'P'], 'ql-font': ['fontName', value] };
      const key = Object.keys(commands).find(name => control.classList.contains(name) || control.closest('.' + name));
      if (!key) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
      document.execCommand(...commands[key]);
      quill.update(Quill.sources.USER);
      savedRange = selection.getRangeAt(0).cloneRange();
    }, true);
  }

  function ensureTwoColumnsGrip(zone) {
    if (!zone || !zone.matches || !zone.matches('.two-columns-zone')) return;
    let grip = zone.querySelector(':scope > .two-columns-resize-grip');
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'two-columns-resize-grip';
      grip.setAttribute('contenteditable', 'false');
      grip.setAttribute('aria-label', 'Redimensionner les colonnes');
      zone.appendChild(grip);
    }
  }

  function ensureTableColumns(table) {
    if (!table || !table.rows || !table.rows[0]) return;
    const firstRow = table.rows[0];
    const count = firstRow.cells.length;
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) { colgroup = document.createElement('colgroup'); table.insertBefore(colgroup, table.firstChild); }
    while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col'));
    while (colgroup.children.length > count) colgroup.lastElementChild.remove();
    table.querySelectorAll('.table-col-resize-handle').forEach(handle => handle.remove());
    Array.from(firstRow.cells).forEach((cell, index) => {
      if (index === firstRow.cells.length - 1) return;
      const handle = document.createElement('span');
      handle.className = 'table-col-resize-handle';
      handle.setAttribute('aria-label', 'Redimensionner la colonne');
      handle.setAttribute('contenteditable', 'false');
      cell.appendChild(handle);
    });
  }

  function resizeTableColumn(table, index, startX) {
    const firstRow = table.rows[0];
    const startWidth = firstRow.cells[index].getBoundingClientRect().width;
    const onMove = event => {
      const delta = event.clientX - startX;
      const newWidth = Math.max(40, startWidth + delta);
      Array.from(table.rows).forEach(row => {
        if (row.cells[index]) row.cells[index].style.width = `${newWidth}px`;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.body.classList.remove('resizing-table-column');
      quill.update(Quill.sources.USER);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
    document.body.classList.add('resizing-table-column');
  }

  function init() {
    console.log('[Editor][1] Création toolbar...');
    console.log('[Editor][2] Création quill...');
    quill = new Quill('#editor-container', {
      theme: 'snow',
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline'],
            [{ align: [] }],
            [{ size: FontSize.whitelist }],
            [{ font: FontFamily.whitelist }],
            ['undo', 'redo'],
            ['page-break', 'insert-table', 'insert-two-columns'],
            ['clean']
          ],
          handlers: {
            undo: function () { quill.history.undo(); },
            redo: function () { quill.history.redo(); },
            'insert-table': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER);
              quill.setSelection(range.index + 1, 0, Quill.sources.USER);
            },
            'insert-two-columns': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER);
              quill.setSelection(range.index + 1, 0, Quill.sources.USER);
            },
            'page-break': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER);
              quill.setSelection(range.index + 1, 0, Quill.sources.USER);
            }
          }
        },
        history: { delay: 500, maxStack: 100, userOnly: true }
      }
    });

    const toolbar = document.querySelector('.ql-toolbar');
    installTwoColumnsToolbarIsolation(toolbar);
    console.log('[Editor][3] quill.root disponible: ', !!quill.root);
    if (toolbar) {
      const undoBtn = toolbar.querySelector('.ql-undo');
      const redoBtn = toolbar.querySelector('.ql-redo');
      const pageBreakBtn = toolbar.querySelector('.ql-page-break');
      const tableBtn = toolbar.querySelector('.ql-insert-table');
      const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns');
      if (undoBtn) undoBtn.innerHTML = '↶';
      if (redoBtn) redoBtn.innerHTML = '↷';
      if (tableBtn) {
        tableBtn.innerHTML = '▦ Tableau';
        tableBtn.title = 'Insérer un tableau 2×2';
      }
      if (twoColsBtn) {
        twoColsBtn.innerHTML = '▥ Zone 2 colonnes';
        twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)';
      }
      if (pageBreakBtn) {
        pageBreakBtn.innerHTML = '⏎ Saut de page';
        pageBreakBtn.title = 'Insère un saut de page (forcé à l\'export PDF)';
      }
    }

    const tableTools = document.createElement('div');
    tableTools.className = 'table-context-toolbar';
    tableTools.innerHTML =
      '<button data-action="add-row-above">+ ligne au-dessus</button>' +
      '<button data-action="add-row-below">+ ligne en dessous</button>' +
      '<button data-action="remove-row">− ligne</button>' +
      '<button data-action="add-col-left">+ colonne à gauche</button>' +
      '<button data-action="add-col-right">+ colonne à droite</button>' +
      '<button data-action="remove-col">− colonne</button>';
    document.getElementById('editor-container').appendChild(tableTools);

    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns);
    quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip);
    let activeCell = null;

    function positionTableToolbar() {
      if (!activeCell || !tableTools.classList.contains('visible')) return;
      const tableRect = activeCell.closest('.editable-table').getBoundingClientRect();
      const toolbarRect = tableTools.getBoundingClientRect();
      const top = Math.max(8, tableRect.top - toolbarRect.height - 6);
      const left = Math.min(Math.max(8, tableRect.left), window.innerWidth - toolbarRect.width - 8);
      tableTools.style.position = 'fixed';
      tableTools.style.top = `${top}px`;
      tableTools.style.left = `${left}px`;
    }

    quill.root.addEventListener('click', function (event) {
      const cell = event.target.closest && event.target.closest('td,th');
      if (!cell || !cell.closest('.editable-table')) {
        tableTools.classList.remove('visible');
        activeCell = null;
        return;
      }
      activeCell = cell;
      tableTools.classList.add('visible');
      positionTableToolbar();
    });

    document.getElementById('editor-container').addEventListener('scroll', positionTableToolbar);
    window.addEventListener('resize', positionTableToolbar);

    quill.root.addEventListener('mousedown', function (event) {
      const twoColumnsGrip = event.target.closest && event.target.closest('.two-columns-resize-grip');
      if (twoColumnsGrip) {
        const zone = twoColumnsGrip.closest('.two-columns-zone');
        if (!zone) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = zone.getBoundingClientRect();
        const update = moveEvent => {
          const usableWidth = rect.width;
          if (!usableWidth) return;
          const left = ((moveEvent.clientX - rect.left) / usableWidth) * 100;
          zone.style.setProperty('--layout-left', `${Math.max(20, Math.min(80, left))}%`);
        };
        const stop = () => {
          document.removeEventListener('mousemove', update);
          document.removeEventListener('mouseup', stop);
          quill.update(Quill.sources.USER);
        };
        document.addEventListener('mousemove', update);
        document.addEventListener('mouseup', stop, { once: true });
        return;
      }
      const handle = event.target.closest && event.target.closest('.table-col-resize-handle');
      if (!handle) return;
      const cell = handle.closest('th, td');
      const table = handle.closest('table');
      if (!cell || !table) return;
      event.preventDefault();
      event.stopPropagation();
      resizeTableColumn(table, cell.cellIndex, event.clientX);
    });

    // Paste sans saut de ligne parasite : on lit le `text/plain` brut et on insère
    // le texte tel quel via `insertText` (qui préserve les \n existants du source
    // mais n'ajoute rien quand le texte ne contient aucun retour à la ligne).
    quill.root.addEventListener('paste', function (event) {
      const target = event.target;
      const editableContainer = target && target.closest
        && target.closest('.editable-table td, .editable-table th, .two-columns-column');
      if (!editableContainer) return;
      event.preventDefault();
      event.stopPropagation();
      const clipboard = event.clipboardData;
      const text = clipboard ? clipboard.getData('text/plain') : '';
      if (text) document.execCommand('insertText', false, text);
      quill.update(Quill.sources.USER);
    }, true);

    if (toolbar) toolbar.addEventListener('click', function (event) {
      const button = event.target.closest && event.target.closest('.ql-align');
      if (!button || !activeCell) return;
      const value = button.getAttribute('data-value') || 'left';
      activeCell.style.textAlign = value === 'justify' ? 'justify' : value;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    tableTools.addEventListener('click', function (event) {
      const action = event.target.dataset.action;
      if (!action || !activeCell) return;
      const table = activeCell.closest('table');
      const row = activeCell.parentElement;
      const col = activeCell.cellIndex;
      const makeCell = () => {
        const td = document.createElement('td');
        td.innerHTML = '&nbsp;';
        td.contentEditable = 'true';
        return td;
      };
      if (action === 'add-row-above' || action === 'add-row-below') {
        const tr = document.createElement('tr');
        for (let i = 0; i < table.rows[0].cells.length; i += 1) tr.appendChild(makeCell());
        row.parentElement.insertBefore(tr, action.endsWith('above') ? row : row.nextSibling);
      }
      if (action === 'remove-row' && table.rows.length > 1) row.remove();
      if (action === 'add-col-left' || action === 'add-col-right') {
        Array.from(table.rows).forEach(r => r.insertBefore(
          makeCell(),
          action.endsWith('left') ? r.cells[col] : r.cells[col].nextSibling
        ));
      }
      if (action === 'remove-col' && row.cells.length > 1) {
        Array.from(table.rows).forEach(r => { if (r.cells[col]) r.deleteCell(col); });
      }
      ensureTableColumns(table);
      quill.update(Quill.sources.USER);
    });

    Variables.init(quill);
    return quill;
  }

  function getQuill() { return quill; }
  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html || ''; quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); }

  return { init, getQuill, getHTML, setHTML };
})();
