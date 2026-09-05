// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l'export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + poignée de redimensionnement pour .two-columns-zone (v1.8.3)
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
      if (value && value.html) { node.innerHTML = value.html; table = node.querySelector('table'); }
      if (!table) { table = document.createElement('table'); node.appendChild(table); }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 2; c += 1) { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; tr.appendChild(td); }
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

  // Quill sees the whole two-column BlockEmbed as one atomic blot. Keep the
  // browser selection and apply toolbar formats to the selected column's DOM
  // range instead of letting Toolbar#format target the whole embed.
  function installTwoColumnsToolbarIsolation(toolbar) {
    if (!toolbar) return;
    let savedRange = null;
    const columnForRange = range => {
      if (!range || !range.commonAncestorContainer) return null;
      const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      const column = node && node.closest ? node.closest('.two-columns-column') : null;
      if (!column || !column.closest('.two-columns-zone')) return null;
      const endNode = range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer : range.endContainer.parentElement;
      return endNode && endNode.closest && endNode.closest('.two-columns-column') === column ? column : null;
    };
    const rememberSelection = () => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (columnForRange(range)) savedRange = range.cloneRange();
    };
    quill.root.addEventListener('mouseup', rememberSelection, true);
    quill.root.addEventListener('keyup', rememberSelection, true);
    toolbar.addEventListener('mousedown', rememberSelection, true);

    toolbar.addEventListener('click', event => {
      const control = event.target.closest('button, .ql-picker-item');
      if (!control || !savedRange) return;
      const column = columnForRange(savedRange);
      if (!column) return;
      const range = savedRange;
      const value = control.getAttribute('data-value') || '';
      let command = null;
      let commandValue = null;
      if (control.classList.contains('ql-bold')) command = 'bold';
      else if (control.classList.contains('ql-italic')) command = 'italic';
      else if (control.classList.contains('ql-underline')) command = 'underline';
      else if (control.classList.contains('ql-clean')) command = 'removeFormat';
      else if (control.closest('.ql-align')) {
        const align = value || control.closest('.ql-align').getAttribute('data-value') || '';
        command = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : align === 'justify' ? 'justifyFull' : 'justifyLeft';
      } else if (control.closest('.ql-color')) { command = 'foreColor'; commandValue = value || control.style.backgroundColor; }
      else if (control.closest('.ql-background')) { command = 'backColor'; commandValue = value || control.style.backgroundColor; }
      else if (control.closest('.ql-font')) { command = 'fontName'; commandValue = value || control.textContent.trim(); }
      else if (control.closest('.ql-size')) {
        const sizes = { small: '2', large: '4', huge: '6' };
        command = 'fontSize'; commandValue = sizes[value] || '3';
      } else if (control.closest('.ql-header')) {
        command = 'formatBlock'; commandValue = value ? 'H' + value : 'P';
      }
      if (!command) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      document.execCommand(command, false, commandValue);
      quill.update(Quill.sources.USER);
      savedRange = range.cloneRange();
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
    let colgroup = table.querySelector(':scope > colgroup');
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
    const colgroup = table.querySelector(':scope > colgroup');
    if (!firstRow || !colgroup || !colgroup.children[index]) return;
    const startWidth = firstRow.cells[index].getBoundingClientRect().width;
    const tableWidth = table.getBoundingClientRect().width;
    const onMove = event => {
      const width = Math.max(40, startWidth + event.clientX - startX);
      const widthPercent = tableWidth > 0 ? (width / tableWidth) * 100 : width;
      colgroup.children[index].style.width = `${widthPercent}%`;
      table.querySelectorAll('tr').forEach(row => {
        if (row.cells[index]) row.cells[index].style.width = `${widthPercent}%`;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      quill.update(Quill.sources.USER);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
        twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables';
      }
      if (pageBreakBtn) {
        pageBreakBtn.innerHTML = '⏎ Saut de page';
        pageBreakBtn.title = 'Insérer un saut de page';
      }
    }

    const tableTools = document.createElement('div');
    tableTools.className = 'table-context-toolbar';
    tableTools.innerHTML = `
      <button type="button" data-action="add-row-before" title="Ajouter une ligne au-dessus">＋Ligne ↑</button>
      <button type="button" data-action="add-row-after" title="Ajouter une ligne en dessous">＋Ligne ↓</button>
      <button type="button" data-action="delete-row" title="Supprimer la ligne">−Ligne</button>
      <button type="button" data-action="add-col-before" title="Ajouter une colonne à gauche">＋Col ←</button>
      <button type="button" data-action="add-col-after" title="Ajouter une colonne à droite">＋Col →</button>
      <button type="button" data-action="delete-col" title="Supprimer la colonne">−Col</button>
    `;
    document.body.appendChild(tableTools);

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
        if (!event.target.closest('.table-context-toolbar')) {
          tableTools.classList.remove('visible');
          activeCell = null;
        }
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
          const offset = moveEvent.clientX - rect.left;
          const percent = Math.min(80, Math.max(20, (offset / usableWidth) * 100));
          zone.style.setProperty('--layout-left', `${percent}%`);
        };
        const stop = () => {
          document.removeEventListener('mousemove', update);
          document.removeEventListener('mouseup', stop);
          quill.update(Quill.sources.USER);
        };
        document.addEventListener('mousemove', update);
        document.addEventListener('mouseup', stop);
        return;
      }
      const handle = event.target.closest && event.target.closest('.table-col-resize-handle');
      if (!handle) return;
      const cell = handle.closest('th, td');
      const table = handle.closest('table');
      if (!cell || !table) return;
      const index = cell.cellIndex;
      event.preventDefault();
      event.stopPropagation();
      resizeTableColumn(table, index, event.clientX);
    });

    quill.root.addEventListener('paste', function (event) {
      const editableContainer = event.target.closest && event.target.closest('#editor-container');
      if (!editableContainer) return;
      event.preventDefault();
      event.stopPropagation();
      const clipboard = event.clipboardData;
      const html = clipboard ? clipboard.getData('text/html') : '';
      const text = clipboard ? clipboard.getData('text/plain') : '';
      const range = quill.getSelection(true);
      if (!range) return;
      if (html) quill.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
      else if (text) quill.insertText(range.index, text.replace(/\r\n?/g, '\n'), 'user');
      quill.update(Quill.sources.USER);
    }, true);

    quill.on('text-change', function (delta, _old, source) {
      if (source !== Quill.sources.USER) return;
      quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns);
      quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip);
    });

    return {
      getQuill() { return quill; },
      insertVarBadge(tableId, column, key) {
        const range = quill.getSelection(true);
        if (!range) return;
        quill.insertEmbed(range.index, 'varbadge', { table: tableId, column, key }, Quill.sources.USER);
      }
    };
  }

  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html || ''; quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); }

  return { init, getQuill, getHTML, setHTML };
})();

if (typeof window !== 'undefined') window.Editor = Editor;
