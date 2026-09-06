// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l’export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + module image (upload PJ Grist + URL, resize, opacité) (v1.9.0)

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
      return { table: node.getAttribute('data-table'), column: node.getAttribute('data-column'), key: node.getAttribute('data-key') };
    }
  }
  VarBadgeBlot.blotName = 'varbadge';
  VarBadgeBlot.tagName = 'span';
  VarBadgeBlot.className = 'var-badge';
  Quill.register(VarBadgeBlot);

  class ImageBlot extends Embed {
    static create(value) {
      const node = super.create();
      const data = value || {};
      node.setAttribute('src', data.src || '');
      node.setAttribute('alt', data.alt || 'Image');
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('draggable', 'true');
      node.dataset.source = data.source || 'url';
      if (data.attachmentId) node.dataset.attachmentId = String(data.attachmentId);
      if (data.column) node.dataset.column = data.column;
      node.style.width = data.width || '320px';
      node.style.opacity = data.opacity == null ? '1' : String(data.opacity);
      node.dataset.wrap = data.wrap || 'inline';
      node.classList.add('editor-image');
      return node;
    }
    static value(node) {
      return { src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '', source: node.dataset.source || 'url', attachmentId: node.dataset.attachmentId || '', column: node.dataset.column || '', width: node.style.width || '', opacity: node.style.opacity || '1', wrap: node.dataset.wrap || 'inline' };
    }
  }
  ImageBlot.blotName = 'imagex'; ImageBlot.tagName = 'img'; ImageBlot.className = 'editor-image'; Quill.register(ImageBlot);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PageBreakBlot extends BlockEmbed {
    static create(value) { const node = super.create(value); node.setAttribute('contenteditable', 'false'); node.classList.add('page-break-marker'); node.dataset.type = 'page-break'; return node; }
    static value(node) { return { type: 'pageBreak' }; }
  }
  PageBreakBlot.blotName = 'pagebreak'; PageBreakBlot.tagName = 'div'; PageBreakBlot.className = 'page-break-marker'; Quill.register(PageBreakBlot);

  const TableBlot = Quill.import('blots/block/embed');
  class EditableTableBlot extends TableBlot {
    static create(value) {
      const node = super.create(); node.classList.add('editable-table'); node.setAttribute('contenteditable', 'false');
      let table = node.querySelector('table');
      if (value && value.html) { node.innerHTML = value.html; table = node.querySelector('table'); }
      if (!table) { table = document.createElement('table'); node.appendChild(table); }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) { const tr = document.createElement('tr'); for (let c = 0; c < 2; c += 1) { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; tr.appendChild(td); } tbody.appendChild(tr); }
        table.appendChild(tbody);
      }
      ensureTableColumns(table); return node;
    }
    static value(node) { const table = node.querySelector('table'); return { html: table ? table.outerHTML : '' }; }
  }
  EditableTableBlot.blotName = 'editabletable'; EditableTableBlot.tagName = 'div'; EditableTableBlot.className = 'editable-table'; Quill.register(EditableTableBlot);

  const TwoColumnsBlot = BlockEmbed;
  class TwoColumnsBlotClass extends TwoColumnsBlot {
    static create(value) { const node = super.create(); node.classList.add('two-columns-zone'); node.setAttribute('contenteditable', 'false'); const build = html => { const col = document.createElement('div'); col.className = 'two-columns-column'; col.contentEditable = 'true'; col.innerHTML = html || ''; return col; }; node.appendChild(build(value && value.cols ? value.cols[0] : '')); node.appendChild(build(value && value.cols ? value.cols[1] : '')); return node; }
    static value(node) { const cols = node.querySelectorAll('.two-columns-column'); return { cols: [cols[0] ? cols[0].innerHTML : '', cols[1] ? cols[1].innerHTML : ''] }; }
  }
  TwoColumnsBlotClass.blotName = 'twocolumns'; TwoColumnsBlotClass.tagName = 'div'; TwoColumnsBlotClass.className = 'two-columns-zone'; Quill.register(TwoColumnsBlotClass);

  function ensureTwoColumnsGrip(zone) { if (!zone || !zone.matches || !zone.matches('.two-columns-zone')) return; let grip = zone.querySelector(':scope > .two-columns-resize-grip'); if (!grip) { grip = document.createElement('div'); grip.className = 'two-columns-resize-grip'; grip.contentEditable = 'false'; zone.appendChild(grip); } }
  function ensureTableColumns(table) { if (!table || !table.rows || !table.rows[0]) return; const firstRow = table.rows[0]; const count = firstRow.cells.length; let colgroup = table.querySelector(':scope > colgroup'); if (!colgroup) { colgroup = document.createElement('colgroup'); table.insertBefore(colgroup, table.firstChild); } while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col')); while (colgroup.children.length > count) colgroup.lastElementChild.remove(); Array.from(colgroup.children).forEach((col, index) => { if (!col.style.width) col.style.width = `${100 / count}%`; col.dataset.index = index; }); }
  function resizeTableColumn(table, index, startX) { const firstRow = table.rows[0]; const colgroup = table.querySelector(':scope > colgroup'); if (!firstRow || !colgroup || !colgroup.children[index]) return; const rect = table.getBoundingClientRect(); const widths = Array.from(colgroup.children).map(col => parseFloat(col.style.width) || 100 / firstRow.cells.length); const start = ((startX - rect.left) / rect.width) * 100; const current = widths[index]; const next = index + 1 < widths.length ? widths[index + 1] : null; const onMove = event => { const delta = ((event.clientX - startX) / rect.width) * 100; if (next !== null) { widths[index] = Math.max(5, current + delta); widths[index + 1] = Math.max(5, next - delta); } else widths[index] = Math.max(5, current + delta); widths.forEach((width, i) => { if (colgroup.children[i]) colgroup.children[i].style.width = `${width}%`; }); }; const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, { once: true }); }

  function installTwoColumnsToolbarIsolation(toolbar) { toolbar.addEventListener('mousedown', function (event) { const button = event.target.closest && event.target.closest('button'); if (!button) return; const selection = document.getSelection(); if (!selection || !selection.rangeCount) return; const range = selection.getRangeAt(0); const column = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer.closest('.two-columns-column') : range.commonAncestorContainer.parentElement.closest('.two-columns-column'); if (!column) return; const command = button.classList.contains('ql-bold') ? 'bold' : button.classList.contains('ql-italic') ? 'italic' : button.classList.contains('ql-underline') ? 'underline' : button.classList.contains('ql-strike') ? 'strikeThrough' : null; if (!command) return; event.preventDefault(); event.stopPropagation(); column.focus(); selection.removeAllRanges(); selection.addRange(range); document.execCommand(command, false, null); }, true); }

  function insertImage(value) { const range = quill.getSelection(true); if (!range || !value || !value.src) return; quill.insertEmbed(range.index, 'imagex', value, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }

  async function uploadImage(file) {
    if (!file || !window.grist || !grist.docApi || !grist.docApi.getAccessToken) throw new Error('API Grist d\u2019upload indisponible.');
    const tokenInfo = await grist.docApi.getAccessToken();
    const form = new FormData(); form.append('upload', file, file.name);
    const response = await fetch(tokenInfo.baseUrl + '/attachments', { method: 'POST', headers: { Authorization: 'Bearer ' + tokenInfo.token }, body: form });
    if (!response.ok) throw new Error('Échec upload image (' + response.status + ').');
    const result = await response.json(); const attachmentId = result.id || result.attachmentId || (result.attachments && result.attachments[0] && result.attachments[0].id); if (!attachmentId) throw new Error('Réponse upload sans identifiant.');
    const column = await Templates.ensureImageColumn(); const record = GristAPI.getCurrentRecord(); if (!record || record.id == null) throw new Error('Sélectionnez une ligne de modèle avant l\u2019upload.');
    await grist.docApi.applyUserActions([['UpdateRecord', Templates.TABLE_NAME, record.id, { [column]: [attachmentId] }]]);
    const src = tokenInfo.baseUrl + '/attachments/' + attachmentId + '/download?auth=' + encodeURIComponent(tokenInfo.token);
    insertImage({ src, source: 'attachment', attachmentId, column, alt: file.name });
  }
  function chooseImageFile() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = function () { const file = input.files && input.files[0]; if (file) uploadImage(file).catch(e => { console.error(e); window.alert(e.message); }); }; input.click(); }

  function init() {
    let pendingAlignmentCell = null;
    let pendingAlignmentColumn = null;
    const alignHandler = function (value) {
      const cell = pendingAlignmentCell;
      const column = pendingAlignmentColumn;
      pendingAlignmentCell = null;
      pendingAlignmentColumn = null;
      const alignment = value || 'left';
      if (column && column.closest('.two-columns-zone')) {
        column.style.textAlign = alignment === 'justify' ? 'justify' : alignment;
        column.querySelectorAll('p, div, li, blockquote, pre').forEach(function (node) {
          node.style.textAlign = column.style.textAlign;
        });
        return false;
      }
      if (!cell || !cell.closest('.editable-table')) {
        quill.format('align', alignment, Quill.sources.USER);
        return;
      }
      cell.style.textAlign = alignment === 'justify' ? 'justify' : alignment;
      cell.querySelectorAll('p, div, li, blockquote, pre').forEach(function (node) {
        node.style.textAlign = cell.style.textAlign;
      });
      activeCell = cell;
      return false;
    };
    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: { container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['page-break', 'insert-table', 'insert-two-columns', 'insert-image', 'insert-image-url'], ['clean']], handlers: { align: alignHandler, undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); }, 'insert-table': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-two-columns': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-image': function () { chooseImageFile(); }, 'insert-image-url': function () { const url = window.prompt('URL de l\u2019image :'); if (url) insertImage({ src: url, source: 'url' }); }, 'page-break': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); } } }, history: { delay: 500, maxStack: 100, userOnly: true } } });
    const toolbar = document.querySelector('.ql-toolbar');
    if (toolbar) installTwoColumnsToolbarIsolation(toolbar);
    if (toolbar) { const undoBtn = toolbar.querySelector('.ql-undo'); const redoBtn = toolbar.querySelector('.ql-redo'); const pageBreakBtn = toolbar.querySelector('.ql-page-break'); const tableBtn = toolbar.querySelector('.ql-insert-table'); const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns'); const imageBtn = toolbar.querySelector('.ql-insert-image'); const imageUrlBtn = toolbar.querySelector('.ql-insert-image-url'); if (undoBtn) undoBtn.innerHTML = '↶'; if (redoBtn) redoBtn.innerHTML = '↷'; if (tableBtn) { tableBtn.innerHTML = '▦ Tableau'; tableBtn.title = 'Insérer un tableau 2×2'; } if (twoColsBtn) { twoColsBtn.innerHTML = '▥ Zone 2 colonnes'; twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)'; } if (imageBtn) { imageBtn.innerHTML = '▧ Image'; imageBtn.title = 'Importer une image dans une pièce jointe Grist'; } if (imageUrlBtn) { imageUrlBtn.innerHTML = '🔗 Image URL'; imageUrlBtn.title = 'Insérer une image depuis une URL'; } if (pageBreakBtn) { pageBreakBtn.innerHTML = '⏎ Saut de page'; pageBreakBtn.title = 'Insère un saut de page (forcé à l’export PDF)'; } }
    const tableTools = document.createElement('div'); tableTools.className = 'table-context-toolbar'; tableTools.innerHTML = '<button data-action="add-row-above">+ ligne au-dessus</button><button data-action="add-row-below">+ ligne en dessous</button><button data-action="remove-row">− ligne</button><button data-action="add-col-left">+ colonne à gauche</button><button data-action="add-col-right">+ colonne à droite</button><button data-action="remove-col">− colonne</button>'; document.getElementById('editor-container').appendChild(tableTools);
    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); let activeCell = null;
    function positionTableToolbar() { if (!activeCell || !tableTools.classList.contains('visible')) return; const tableRect = activeCell.closest('.editable-table').getBoundingClientRect(); const toolbarRect = tableTools.getBoundingClientRect(); tableTools.style.position = 'fixed'; tableTools.style.top = `${Math.max(8, tableRect.top - toolbarRect.height - 6)}px`; tableTools.style.left = `${Math.min(Math.max(8, tableRect.left), window.innerWidth - toolbarRect.width - 8)}px`; }
    quill.root.addEventListener('click', function (event) { const cell = event.target.closest && event.target.closest('td,th'); if (!cell || !cell.closest('.editable-table')) { tableTools.classList.remove('visible'); activeCell = null; return; } activeCell = cell; tableTools.classList.add('visible'); positionTableToolbar(); });
    document.getElementById('editor-container').addEventListener('scroll', positionTableToolbar); window.addEventListener('resize', positionTableToolbar);
    quill.root.addEventListener('mousedown', function (event) { const twoColumnsGrip = event.target.closest && event.target.closest('.two-columns-resize-grip'); if (twoColumnsGrip) { const zone = twoColumnsGrip.closest('.two-columns-zone'); if (!zone) return; event.preventDefault(); event.stopPropagation(); const rect = zone.getBoundingClientRect(); const update = moveEvent => { const usableWidth = rect.width; if (!usableWidth) return; const left = ((moveEvent.clientX - rect.left) / usableWidth) * 100; zone.style.setProperty('--layout-left', `${Math.max(20, Math.min(80, left))}%`); }; const stop = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', stop); quill.update(Quill.sources.USER); }; document.addEventListener('mousemove', update); document.addEventListener('mouseup', stop, { once: true }); return; } const handle = event.target.closest && event.target.closest('.table-col-resize-handle'); if (!handle) return; const cell = handle.closest('th, td'); const table = handle.closest('table'); if (!cell || !table) return; event.preventDefault(); event.stopPropagation(); resizeTableColumn(table, cell.cellIndex, event.clientX); });
    quill.root.addEventListener('paste', function (event) { const target = event.target; const editableContainer = target && target.closest && target.closest('.editable-table td, .editable-table th, .two-columns-column'); if (!editableContainer) return; event.preventDefault(); event.stopPropagation(); const clipboard = event.clipboardData; const text = clipboard ? clipboard.getData('text/plain') : ''; if (text) document.execCommand('insertText', false, text); quill.update(Quill.sources.USER); }, true);

    function getRealActiveCell() { const selection = window.getSelection && window.getSelection(); const nodes = []; if (selection && selection.rangeCount) nodes.push(selection.anchorNode, selection.focusNode); nodes.push(document.activeElement); for (const node of nodes) { const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); const cell = element && element.closest && element.closest('.editable-table td, .editable-table th'); if (cell && cell.isContentEditable) return cell; } return null; }
    function getRealActiveColumn() { const selection = window.getSelection && window.getSelection(); const nodes = []; if (selection && selection.rangeCount) nodes.push(selection.anchorNode, selection.focusNode); nodes.push(document.activeElement); for (const node of nodes) { const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); const column = element && element.closest && element.closest('.two-columns-column'); if (column && column.isContentEditable) return column; } return null; }
    if (toolbar) toolbar.addEventListener('mousedown', function (event) {
      const target = event.target;
      const button = target.closest && target.closest('button');
      const pickerItem = target.closest && target.closest('.ql-picker-item');
      const cell = getRealActiveCell();
      if (cell && cell.closest('.editable-table')) {
        const formatButton = button && (button.classList.contains('ql-bold') || button.classList.contains('ql-italic') || button.classList.contains('ql-underline') || button.classList.contains('ql-strike') || button.classList.contains('ql-clean'));
        const formatPicker = pickerItem && (pickerItem.closest('.ql-size') || pickerItem.closest('.ql-font') || pickerItem.closest('.ql-header'));
        if (formatButton || formatPicker) {
          const selection = window.getSelection && window.getSelection();
          if (selection && selection.rangeCount) {
            const range = selection.getRangeAt(0).cloneRange();
            event.preventDefault();
            event.stopPropagation();
            cell.focus();
            selection.removeAllRanges();
            selection.addRange(range);
            if (formatButton) {
              const command = button.classList.contains('ql-bold') ? 'bold' : button.classList.contains('ql-italic') ? 'italic' : button.classList.contains('ql-underline') ? 'underline' : button.classList.contains('ql-strike') ? 'strikeThrough' : 'removeFormat';
              document.execCommand(command, false, null);
            } else if (formatPicker.closest('.ql-size')) {
              const value = pickerItem.getAttribute('data-value');
              document.execCommand('fontSize', false, value ? (value === 'small' ? '2' : value === 'large' ? '5' : value === 'huge' ? '7' : '3') : '3');
            } else if (formatPicker.closest('.ql-font')) {
              document.execCommand('fontName', false, pickerItem.getAttribute('data-value') || 'sans-serif');
            } else {
              document.execCommand('formatBlock', false, pickerItem.getAttribute('data-value') || 'p');
            }
            quill.update(Quill.sources.USER);
          }
          return;
        }
      }
      const alignButton = target.closest && target.closest('.ql-align');
      if (!alignButton) return;
      const column = getRealActiveColumn();
      if (cell) { pendingAlignmentCell = cell; activeCell = cell; }
      if (column) pendingAlignmentColumn = column;
    }, true);
    tableTools.addEventListener('click', function (event) { const action = event.target.dataset.action; if (!action || !activeCell) return; const table = activeCell.closest('table'); const row = activeCell.parentElement; const col = activeCell.cellIndex; const makeCell = () => { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; return td; }; if (action === 'add-row-above' || action === 'add-row-below') { const tr = document.createElement('tr'); for (let i = 0; i < table.rows[0].cells.length; i += 1) tr.appendChild(makeCell()); row.parentElement.insertBefore(tr, action.endsWith('above') ? row : row.nextSibling); } if (action === 'remove-row' && table.rows.length > 1) row.remove(); if (action === 'add-col-left' || action === 'add-col-right') Array.from(table.rows).forEach(r => r.insertBefore(makeCell(), action.endsWith('left') ? r.cells[col] : r.cells[col].nextSibling)); if (action === 'remove-col' && row.cells.length > 1) Array.from(table.rows).forEach(r => { if (r.cells[col]) r.deleteCell(col); }); ensureTableColumns(table); quill.update(Quill.sources.USER); });
    Variables.init(quill); return quill;
  }
  function getQuill() { return quill; } function getHTML() { return quill.root.innerHTML; } function setHTML(html) { quill.root.innerHTML = html || ''; quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); }
  return { init, getQuill, getHTML, setHTML, insertImage, uploadImage };
})();
