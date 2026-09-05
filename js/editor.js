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
      if (!table) { table = document.createElement('table'); node.appendChild(table); }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 2; c += 1) {
            const td = document.createElement('td');
            td.innerHTML = '&nbsp;';
            td.setAttribute('contenteditable', 'true');
            tr.appendChild(td);
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
      node.innerHTML = '';
      const cols = (value && value.cols) || ['', ''];
      cols.forEach(function (html) {
        const col = document.createElement('div');
        col.className = 'two-columns-column';
        col.setAttribute('contenteditable', 'true');
        col.innerHTML = html || '<p><br></p>';
        node.appendChild(col);
      });
      ensureTwoColumnsGrip(node);
      return node;
    }
    static value(node) {
      return { html: node.innerHTML };
    }
  }
  TwoColumnsBlotClass.blotName = 'twocolumns';
  TwoColumnsBlotClass.tagName = 'div';
  TwoColumnsBlotClass.className = 'two-columns-zone';
  Quill.register(TwoColumnsBlotClass);

  function ensureTwoColumnsGrip(zone) {
    let grip = zone.querySelector('.two-columns-resize-grip');
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'two-columns-resize-grip';
      grip.setAttribute('contenteditable', 'false');
      grip.innerHTML = '⋮';
      zone.appendChild(grip);
    }
  }

  function setTwoColumnsWidths(zone, leftPct) {
    const cols = zone.querySelectorAll('.two-columns-column');
    if (cols.length < 2) return;
    const left = Math.max(5, Math.min(95, leftPct));
    cols[0].style.flex = '0 0 ' + left + '%';
    cols[1].style.flex = '0 0 ' + (100 - left) + '%';
  }

  function ensureTableColumns(table) {
    if (!table || !table.rows || !table.rows.length) return;
    const firstRow = table.rows[0];
    const count = firstRow.cells.length;
    Array.from(firstRow.cells).forEach(function (cell, index) {
      if (index === firstRow.cells.length - 1) return;
      const handle = document.createElement('span');
      handle.className = 'table-col-resize-handle';
      handle.textContent = '⋮';
      handle.setAttribute('contenteditable', 'false');
      cell.appendChild(handle);
    });
  }

  function resizeTableColumn(table, index, startX) {
    const firstRow = table.rows[0];
    const startWidth = firstRow.cells[index].getBoundingClientRect().width;
    const onMove = event => {
      const dx = event.clientX - startX;
      const newWidth = Math.max(30, startWidth + dx);
      Array.from(table.rows).forEach(row => {
        if (row.cells[index]) row.cells[index].style.width = newWidth + 'px';
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

  function installTwoColumnsToolbarIsolation(toolbar) {
    toolbar.addEventListener('mousedown', function (event) {
      const target = event.target;
      const button = target.closest && target.closest('button');
      const alignOption = target.closest && target.closest('.ql-align .ql-picker-item');
      if (!button && !alignOption) return;
      const selection = document.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const column = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer.closest('.two-columns-column')
        : range.commonAncestorContainer.parentElement.closest('.two-columns-column');
      if (!column) return;
      if (alignOption) {
        const value = alignOption.getAttribute('data-value') || '';
        const alignPicker = alignOption.closest('.ql-align');
        const label = alignPicker && alignPicker.querySelector('.ql-picker-label');
        column.style.textAlign = value || 'left';
        if (alignPicker) {
          alignPicker.querySelectorAll('.ql-picker-item').forEach(item => item.classList.toggle('ql-active', item === alignOption));
          if (label) label.setAttribute('data-value', value);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const command = button.classList.contains('ql-bold') ? 'bold'
        : button.classList.contains('ql-italic') ? 'italic'
          : button.classList.contains('ql-underline') ? 'underline'
            : button.classList.contains('ql-strike') ? 'strikeThrough' : null;
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      column.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand(command, false, null);
    }, true);
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
            [{ 'insert-table': '▦ Tableau' }, { 'insert-two-columns': '▥ Zone 2 colonnes' }, { 'page-break': '⏎ Saut de page' }],
            ['clean']
          ],
          handlers: {
            'undo': function () { quill.history.undo(); },
            'redo': function () { quill.history.redo(); },
            'insert-table': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER);
            },
            'insert-two-columns': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER);
            },
            'page-break': function () {
              const range = quill.getSelection(true);
              if (!range) return;
              quill.insertEmbed(range.index, 'pagebreak', true, Quill.sources.USER);
            }
          }
        }
      }
    });

    const toolbar = quill.getModule('toolbar').container;
    if (toolbar) {
      const undoBtn = toolbar.querySelector('.ql-undo');
      const redoBtn = toolbar.querySelector('.ql-redo');
      const tableBtn = toolbar.querySelector('.ql-insert-table');
      const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns');
      const pageBreakBtn = toolbar.querySelector('.ql-page-break');
      if (undoBtn) undoBtn.innerHTML = '↶';
      if (redoBtn) redoBtn.innerHTML = '↷';
      if (tableBtn) {
        tableBtn.innerHTML = '▦ Tableau';
        tableBtn.title = 'Insérer un tableau 2×2';
      }
      if (twoColsBtn) {
        twoColsBtn.innerHTML = '▥ Zone 2 colonnes';
        twoColsBtn.title = 'Insérer une zone à 2 colonnes';
      }
      if (pageBreakBtn) {
        pageBreakBtn.innerHTML = '⏎ Saut de page';
        pageBreakBtn.title = 'Insérer un saut de page (export PDF)';
      }
    }

    const tableTools = document.createElement('div');
    tableTools.className = 'table-context-toolbar';
    tableTools.innerHTML =
      '<button data-action="add-row">+ Ligne</button>' +
      '<button data-action="add-col">+ Col.</button>' +
      '<button data-action="del-row">− Ligne</button>' +
      '<button data-action="del-col">− Col.</button>' +
      '<button data-action="del-table">× Tableau</button>';
    document.body.appendChild(tableTools);

    let activeCell = null;

    function positionTableToolbar() {
      const tableRect = activeCell.closest('.editable-table').getBoundingClientRect();
      const top = window.scrollY + tableRect.top - 36;
      const left = window.scrollX + tableRect.left;
      tableTools.style.position = 'fixed';
      tableTools.style.top = `${top}px`;
      tableTools.style.left = `${left}px`;
    }

    document.addEventListener('selectionchange', function () {
      const sel = window.getSelection && window.getSelection();
      const node = sel && sel.anchorNode;
      const cell = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      const td = cell && cell.closest && cell.closest('.editable-table td, .editable-table th');
      if (!td || !td.closest('.editable-table')) {
        tableTools.classList.remove('visible');
        activeCell = null;
        return;
      }
      activeCell = td;
      tableTools.classList.add('visible');
      positionTableToolbar();
    });


    document.addEventListener('mousedown', function (event) {
      const target = event.target;
      const twoColumnsGrip = target.closest && target.closest('.two-columns-resize-grip');
      const handle = target.closest && target.closest('.table-col-resize-handle');
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
          const pct = (offset / usableWidth) * 100;
          setTwoColumnsWidths(zone, pct);
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
      if (!handle) return;
      const cell = handle.closest('th, td');
      const table = handle.closest('table');
      if (!cell || !table) return;
      event.preventDefault();
      event.stopPropagation();
      const colIndex = cell.cellIndex;
      resizeTableColumn(table, colIndex, event.clientX);
    });

    document.addEventListener('paste', function (event) {
      const target = event.target;
      const editableContainer = target.closest && target.closest('.ql-editor');
      if (!editableContainer) return;
      event.preventDefault();
      event.stopPropagation();
      const clipboard = event.clipboardData;
      const text = clipboard && clipboard.getData && clipboard.getData('text/plain');
      if (typeof text === 'string') {
        const clean = text.replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
        document.execCommand('insertText', false, clean);
      }
      quill.update(Quill.sources.USER);
    }, true);

    function getRealActiveCell() {
      const selection = window.getSelection && window.getSelection();
      const nodes = [];
      if (selection && selection.rangeCount) {
        nodes.push(selection.anchorNode, selection.focusNode);
      }
      nodes.push(document.activeElement);
      for (const node of nodes) {
        const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
        const cell = element && element.closest && element.closest('.editable-table td, .editable-table th');
        if (cell && cell.isContentEditable) return cell;
      }
      return null;
    }

    if (toolbar) toolbar.addEventListener('click', function (event) {
      const button = event.target.closest && event.target.closest('.ql-align');
      const cell = getRealActiveCell();
      if (!button || !cell) return;
      activeCell = cell;
      const pickerItem = event.target.closest && event.target.closest('.ql-align .ql-picker-item');
      const pickerLabel = button.querySelector && button.querySelector('.ql-picker-label');
      const value = (pickerItem && pickerItem.getAttribute('data-value'))
        || (pickerLabel && pickerLabel.getAttribute('data-value'))
        || (button.getAttribute('data-value'))
        || 'left';
      const normalized = value === 'justify' ? 'justify' : value;
      cell.style.textAlign = normalized;
      if (pickerLabel) pickerLabel.setAttribute('data-value', normalized);
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
      if (action === 'add-row') {
        const tr = document.createElement('tr');
        for (let c = 0; c < table.rows[0].cells.length; c += 1) tr.appendChild(makeCell());
        table.querySelector('tbody').appendChild(tr);
      }
      if (action === 'add-col') {
        Array.from(table.rows).forEach(r => r.insertBefore(makeCell(), r.cells[r.cells.length - 1] || null));
      }
      if (action === 'del-row') {
        if (table.rows.length > 1) row.parentElement.removeChild(row);
      }
      if (action === 'del-col') {
        if (table.rows[0].cells.length > 1) Array.from(table.rows).forEach(r => r.deleteCell(col));
      }
      if (action === 'del-table') {
        const wrap = table.closest('.editable-table');
        if (wrap) wrap.parentElement.removeChild(wrap);
      }
      ensureTableColumns(table);
      quill.update(Quill.sources.USER);
    });

    Variables.init(quill);
    return quill;
  }

  function getQuill() { return quill; }
  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html; }

  return { init, getQuill, getHTML, setHTML };
})();
