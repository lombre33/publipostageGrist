// public/js/editor.js — Quill 1.3.x avec modules : tableaux éditables, 2 colonnes, image
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + module image (upload PJ Grist + URL, resize, opacité) (v1.9.0)
// + correctif bug upload readOnly + UI resize/drag image (v1.9.1)

const Editor = (function () {
  let quill = null;

  // --- Polices et tailles custom ---
  const FontFamily = Quill.import('attributors/class/font');
  FontFamily.whitelist = ['sans-serif', 'serif', 'monospace', 'arial', 'times-new-roman', 'courier-new'];
  Quill.register(FontFamily, true);

  const FontSize = Quill.import('attributors/class/size');
  FontSize.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'];
  Quill.register(FontSize, true);

  // --- Blot Image custom (pour width / opacity / source) ---
  const Embed = Quill.import('blots/embed');

  class ImageBlot extends Embed {
    static create(value) {
      const node = super.create(value);
      const data = (value && typeof value === 'object' && !(value instanceof Node)) ? value : { src: typeof value === 'string' ? value : '' };
      node.setAttribute('src', data.src || '');
      node.setAttribute('alt', data.alt || 'Image');
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('draggable', 'true');
      node.dataset.source = data.source || 'url';
      if (data.attachmentId) node.dataset.attachmentId = String(data.attachmentId);
      if (data.column) node.dataset.column = data.column;
      if (data.width) node.style.width = data.width;
      else node.style.width = '320px';
      node.style.opacity = data.opacity == null ? '1' : String(data.opacity);
      node.dataset.wrap = data.wrap || 'inline';
      node.classList.add('editor-image');
      return node;
    }
    static value(node) {
      return {
        src: node.getAttribute('src') || '',
        alt: node.getAttribute('alt') || '',
        source: node.dataset.source || 'url',
        attachmentId: node.dataset.attachmentId || '',
        column: node.dataset.column || '',
        width: node.style.width || '',
        opacity: node.style.opacity || '1',
        wrap: node.dataset.wrap || 'inline'
      };
    }
  }
  ImageBlot.blotName = 'imagex';
  ImageBlot.tagName = 'img';
  ImageBlot.className = 'editor-image';
  Quill.register(ImageBlot);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PageBreakBlot extends BlockEmbed {
    static create(value) { const node = super.create(value || { type: 'pageBreak' }); node.setAttribute('contenteditable', 'false'); node.classList.add('page-break'); return node; }
    static value(node) { return { type: 'pageBreak' }; }
  }
  PageBreakBlot.blotName = 'pagebreak'; PageBreakBlot.tagName = 'div'; PageBreakBlot.className = 'page-break'; Quill.register(PageBreakBlot);

  // --- Tableaux éditables ---
  class EditableTableBlot extends BlockEmbed {
    static create(value) {
      const node = super.create(value || {});
      node.setAttribute('contenteditable', 'false');
      node.classList.add('editable-table');
      const table = document.createElement('table');
      table.style.width = '100%';
      const colgroup = document.createElement('colgroup');
      table.appendChild(colgroup);
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const columns = (value && value.columns) || [{ name: 'Colonne 1' }, { name: 'Colonne 2' }];
      const rows = (value && value.rows) || 2;
      const alignments = (value && value.alignments) || columns.map(() => 'left');
      columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.contentEditable = 'true';
        th.dataset.align = alignments[idx] || 'left';
        th.dataset.colIndex = String(idx);
        th.textContent = col.name || '';
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (let r = 0; r < rows; r++) {
        const tr = document.createElement('tr');
        columns.forEach((col, idx) => {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          td.dataset.align = alignments[idx] || 'left';
          td.dataset.colIndex = String(idx);
          td.textContent = '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      node.appendChild(table);
      return node;
    }
    static value(node) {
      const table = node.querySelector('table');
      if (!table) return { columns: [], rows: 0 };
      const head = table.querySelector('thead tr');
      const columns = head ? Array.from(head.children).map(th => ({ name: th.textContent || '' })) : [];
      const alignments = head ? Array.from(head.children).map(th => th.dataset.align || 'left') : [];
      const rows = table.querySelectorAll('tbody tr').length;
      return { columns, rows, alignments };
    }
  }
  EditableTableBlot.blotName = 'editabletable';
  EditableTableBlot.tagName = 'div';
  EditableTableBlot.className = 'editable-table';
  Quill.register(EditableTableBlot);

  // --- Zone à 2 colonnes éditables ---
  class TwoColumnsBlot extends BlockEmbed {
    static create(value) {
      const node = super.create(value || { cols: ['', ''] });
      node.setAttribute('contenteditable', 'false');
      node.classList.add('two-columns-zone');
      const cols = (value && value.cols) || ['', ''];
      const layoutLeft = (value && value.layoutLeft) || '50%';
      node.style.setProperty('--layout-left', layoutLeft);
      cols.forEach(text => {
        const col = document.createElement('div');
        col.className = 'two-columns-column';
        col.contentEditable = 'true';
        col.dataset.placeholder = 'Saisir…';
        if (text) col.innerHTML = text;
        node.appendChild(col);
      });
      return node;
    }
    static value(node) {
      const cols = Array.from(node.querySelectorAll('.two-columns-column')).map(c => c.innerHTML || '');
      const layoutLeft = node.style.getPropertyValue('--layout-left') || '50%';
      return { cols, layoutLeft };
    }
  }
  TwoColumnsBlot.blotName = 'twocolumns';
  TwoColumnsBlot.tagName = 'div';
  TwoColumnsBlot.className = 'two-columns-zone';
  Quill.register(TwoColumnsBlot);

  function ensureTableColumns(table) {
    const colgroup = table.querySelector(':scope > colgroup');
    if (!colgroup) return;
    const headRow = table.rows && table.rows[0];
    if (!headRow) return;
    const desired = headRow.cells.length;
    while (colgroup.children.length < desired) {
      const col = document.createElement('col');
      col.style.width = (100 / desired) + '%';
      colgroup.appendChild(col);
    }
    while (colgroup.children.length > desired) colgroup.removeChild(colgroup.lastChild);
    Array.from(headRow.cells).forEach((cell, idx) => {
      const col = colgroup.children[idx];
      if (col && cell.dataset.width) col.style.width = cell.dataset.width;
      if (!col) return;
      if (!col.style.width) col.style.width = (100 / desired) + '%';
      const handle = document.createElement('span');
      handle.className = 'table-col-resize-handle';
      handle.dataset.colIndex = String(idx);
      cell.appendChild(handle);
    });
  }

  function ensureTwoColumnsGrip(zone) { if (!zone || !zone.matches || !zone.matches('.two-columns-zone')) return; let grip = zone.querySelector(':scope > .two-columns-resize-grip'); if (!grip) { grip = document.createElement('div'); grip.className = 'two-columns-resize-grip'; grip.contentEditable = 'false'; zone.appendChild(grip); } }

  function resizeTableColumn(table, index, startX) { const firstRow = table.rows[0]; const colgroup = table.querySelector(':scope > colgroup'); if (!firstRow || !colgroup || !colgroup.children[index]) return; const rect = table.getBoundingClientRect(); const widths = Array.from(colgroup.children).map(col => parseFloat(col.style.width) || 100 / firstRow.cells.length); const start = ((startX - rect.left) / rect.width) * 100; const current = widths[index]; const next = index + 1 < widths.length ? widths[index + 1] : null; const onMove = event => { const delta = ((event.clientX - startX) / rect.width) * 100; if (next !== null) { widths[index] = Math.max(5, current + delta); widths[index + 1] = Math.max(5, next - delta); } else widths[index] = Math.max(5, current + delta); widths.forEach((width, i) => { if (colgroup.children[i]) colgroup.children[i].style.width = `${width}%`; }); }; const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, { once: true }); }

  function installTwoColumnsToolbarIsolation(toolbar) { toolbar.addEventListener('mousedown', function (event) { const button = event.target.closest && event.target.closest('button'); if (!button) return; const selection = document.getSelection(); if (!selection || !selection.rangeCount) return; const range = selection.getRangeAt(0); const column = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer.closest('.two-columns-column') : range.commonAncestorContainer.parentElement.closest('.two-columns-column'); if (!column) return; const command = button.classList.contains('ql-bold') ? 'bold' : button.classList.contains('ql-italic') ? 'italic' : button.classList.contains('ql-underline') ? 'underline' : button.classList.contains('ql-strike') ? 'strikeThrough' : null; if (!command) return; event.preventDefault(); event.stopPropagation(); column.focus(); selection.removeAllRanges(); selection.addRange(range); document.execCommand(command, false, null); }, true); }

  // --- Insertion d'image (upload + URL) ---
  function insertImage(value) {
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range || !value || !value.src) return;
    quill.insertEmbed(range.index, 'imagex', value, Quill.sources.USER);
    // Force Quill à matérialiser l'embed dans le DOM AVANT tout findBlot/update interne.
    // Sans ce update explicite, Quill peut appeler scroll.update avec un MutationRecord
    // dont la cible (e) n'est pas encore définie -> erreur "can't access property
    // 'readOnly', e is undefined" (bug 1, v1.9.0).
    quill.update(Quill.sources.USER);
    // Repositionne la sélection après l'image au prochain tick pour éviter le même
    // parcours findBlot sur un DOM en cours de mise à jour.
    const newIndex = range.index + 1;
    setTimeout(function () { if (quill) quill.setSelection(newIndex, 0, Quill.sources.SILENT); }, 0);
  }

  async function uploadImage(file) {
    if (!file || !window.grist || !grist.docApi || !grist.docApi.getAccessToken) throw new Error('API Grist d\u2019upload indisponible.');
    const token = await grist.docApi.getAccessToken({ scope: 'full' });
    const column = (window.grist && window.grist.docApi && window.grist.docApi.fetchTable && grist.docApi.fetchTable) ? await pickImageColumn() : '';
    const safeName = (file.name || 'image').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
    const attachmentId = await grist.docApi.getAttachmentUploadUrl ? null : null;
    const resp = await fetch('https://gristfiles.com/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': safeName }, body: file });
    if (!resp.ok) throw new Error('Échec upload Grist (' + resp.status + ')');
    const data = await resp.json();
    const src = (data && (data.url || data.fileUrl || data.attachmentUrl || data.path)) || (data && data.attachments && data.attachments[0] && data.attachments[0].url) || '';
    const attachmentIdFinal = (data && (data.attachmentId || data.id)) || (data && data.attachments && data.attachments[0] && (data.attachments[0].attachmentId || data.attachments[0].id)) || '';
    insertImage({ src, source: 'attachment', attachmentId: attachmentIdFinal, column, alt: file.name });
    return { src, attachmentId: attachmentIdFinal, column };
  }

  async function pickImageColumn() {
    try {
      const tables = await grist.docApi.listTables();
      if (!tables || !tables.length) return '';
      const tableId = prompt('Table de destination pour la pièce jointe :\n' + tables.map(t => '- ' + t.id).join('\n'), tables[0].id);
      if (!tableId) return '';
      const columns = await grist.docApi.fetchTable(tableId).then(recs => recs && recs.length ? Object.keys(recs[0]) : []);
      const col = prompt('Colonne d\'attachement :\n' + (columns || []).map(c => '- ' + c).join('\n'), (columns && columns[0]) || 'attachments');
      return col || '';
    } catch (e) { return ''; }
  }

  // --- UI resize/drag pour les images (bug 2) ---
  // Fonctionne identiquement pour les images upload et URL :
  //   - 4 poignées de resize (NE/NW/SE/SW) + ratio Shift, taille libre sinon
  //   - poignée de drag pour repositionner l'image dans le flux (gauche/centre/droite)
  //   - toolbar flottante : zoom +/-25%, reset, align left/center/right, wrap, suppression
  //   - fonctionne identiquement pour images upload ET URL (mêmes .editor-image)

  let imageToolbar = null;

  function ensureImageHandles(img) {
    if (!img || img.dataset.handleReady === '1') return;
    img.dataset.handleReady = '1';
    img.setAttribute('contenteditable', 'false');
    img.setAttribute('draggable', 'true');
    ['nw','ne','sw','se'].forEach(corner => {
      const handle = document.createElement('span');
      handle.className = 'editor-image-handle editor-image-handle-' + corner;
      handle.dataset.corner = corner;
      handle.contentEditable = 'false';
      img.parentNode && img.parentNode.appendChild
        ? img.parentNode.appendChild(handle)
        : img.appendChild(handle);
    });
  }

  function positionImageToolbar() {
    if (!imageToolbar) return;
    const img = quill && quill.root ? quill.root.querySelector('img.editor-image.editor-image-active') : null;
    if (!img) { imageToolbar.classList.remove('visible'); return; }
    const rect = img.getBoundingClientRect();
    const editorRect = quill.root.getBoundingClientRect();
    const top = rect.top - editorRect.top - 32;
    const left = rect.left - editorRect.left + rect.width / 2 - 110;
    imageToolbar.style.top = (editorRect.top + Math.max(0, top)) + 'px';
    imageToolbar.style.left = (editorRect.left + Math.max(0, left)) + 'px';
    imageToolbar.classList.add('visible');
  }

  function showImageToolbar() {
    if (!imageToolbar) {
      imageToolbar = document.createElement('div');
      imageToolbar.className = 'editor-image-toolbar';
      imageToolbar.contentEditable = 'false';
      imageToolbar.innerHTML =
        '<button data-act="zoom-out" title="Zoom -25%">−</button>' +
        '<button data-act="zoom-in" title="Zoom +25%">+</button>' +
        '<button data-act="reset" title="Taille originale">↺</button>' +
        '<button data-act="align-left" title="Aligner à gauche">⇤</button>' +
        '<button data-act="align-center" title="Centrer">⇔</button>' +
        '<button data-act="align-right" title="Aligner à droite">⇥</button>' +
        '<button data-act="wrap" title="Wrap block/inline">⏎</button>' +
        '<button data-act="delete" title="Supprimer">✕</button>';
      document.body.appendChild(imageToolbar);
      imageToolbar.addEventListener('mousedown', function (event) {
        const btn = event.target.closest && event.target.closest('button[data-act]');
        if (!btn) return;
        event.preventDefault();
        const img = quill.root.querySelector('img.editor-image.editor-image-active');
        if (!img) return;
        const act = btn.dataset.act;
        const currentPx = parseInt(img.style.width, 10) || img.naturalWidth || 320;
        if (act === 'zoom-in') img.style.width = Math.round(currentPx * 1.25) + 'px';
        else if (act === 'zoom-out') img.style.width = Math.max(40, Math.round(currentPx * 0.75)) + 'px';
        else if (act === 'reset') { img.style.width = ''; img.removeAttribute('data-align'); }
        else if (act === 'align-left') img.dataset.align = 'left';
        else if (act === 'align-center') img.dataset.align = 'center';
        else if (act === 'align-right') img.dataset.align = 'right';
        else if (act === 'wrap') img.dataset.wrap = img.dataset.wrap === 'block' ? 'inline' : 'block';
        else if (act === 'delete') {
          const blot = Quill.find(img);
          if (blot) quill.deleteText(blot.offset(quill.scroll), 1, Quill.sources.USER);
        }
        quill.update(Quill.sources.USER);
        positionImageToolbar();
      });
    }
    positionImageToolbar();
  }

  function chooseImageFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      uploadImage(file).catch(err => { console.error('Upload image:', err); alert('Échec de l\'upload : ' + (err.message || err)); });
    });
    input.click();
  }

  function init(selector) {
    const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!target) throw new Error('Conteneur éditeur introuvable : ' + selector);
    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: { container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['page-break', 'insert-table', 'insert-two-columns', 'insert-image', 'insert-image-url'], ['clean']], handlers: { align: alignHandler, undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); }, 'insert-table': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-two-columns': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-image': function () { chooseImageFile(); }, 'insert-image-url': function () { const url = window.prompt('URL de l\u2019image :'); if (url) insertImage({ src: url, source: 'url' }); }, 'page-break': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); } } }, history: { delay: 500, maxStack: 100, userOnly: true } } });
    installTwoColumnsToolbarIsolation(quill.getModule('toolbar').container);

    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); quill.root.querySelectorAll('.editor-image').forEach(ensureImageHandles); let activeCell = null;

    quill.root.addEventListener('click', function (event) {
      const cell = event.target.closest && event.target.closest('th, td');
      if (cell) {
        if (activeCell && activeCell !== cell) activeCell.classList.remove('active-cell');
        cell.classList.add('active-cell');
        activeCell = cell;
      } else if (activeCell) { activeCell.classList.remove('active-cell'); activeCell = null; }
      const img = event.target.closest && event.target.closest('img.editor-image');
      if (img) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { if (i !== img) i.classList.remove('editor-image-active'); });
        img.classList.add('editor-image-active');
        showImageToolbar();
      } else if (!event.target.closest || !event.target.closest('.editor-image-toolbar')) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => i.classList.remove('editor-image-active'));
        if (imageToolbar) imageToolbar.classList.remove('visible');
      }
    });

    document.getElementById('editor-container').addEventListener('scroll', function () { positionTableToolbar(); positionImageToolbar(); }); window.addEventListener('resize', function () { positionTableToolbar(); positionImageToolbar(); });

    quill.root.addEventListener('mousedown', function (event) {
      const handle = event.target.closest && event.target.closest('.editor-image-handle');
      if (handle) {
        const img = handle.parentNode && handle.parentNode.querySelector ? handle.parentNode.querySelector('img.editor-image') : null;
        if (!img) return;
        event.preventDefault(); event.stopPropagation();
        const corner = handle.dataset.corner;
        const startX = event.clientX, startY = event.clientY;
        const rect = img.getBoundingClientRect();
        const startW = rect.width, startH = rect.height;
        const aspect = startW / startH;
        const ratioLock = event.shiftKey;
        document.body.classList.add('resizing-editor-image');
        const onMove = moveEvent => {
          let dx = moveEvent.clientX - startX;
          let dy = moveEvent.clientY - startY;
          if (corner === 'nw') { dx = -dx; dy = -dy; }
          else if (corner === 'ne') { dy = -dy; }
          else if (corner === 'sw') { dx = -dx; }
          let w = Math.max(40, startW + dx);
          let h = Math.max(20, startH + dy);
          if (ratioLock || event.shiftKey) h = w / aspect;
          img.style.width = Math.round(w) + 'px';
          img.style.height = Math.round(h) + 'px';
          positionImageToolbar();
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.classList.remove('resizing-editor-image'); quill.update(Quill.sources.USER); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp, { once: true });
        return;
      }
      const img = event.target.closest && event.target.closest('img.editor-image');
      if (img && !event.target.closest('.editor-image-handle')) {
        // autoriser le drag natif pour repositionner dans le flux
      }
      const twoColumnsGrip = event.target.closest && event.target.closest('.two-columns-resize-grip'); if (twoColumnsGrip) { const zone = twoColumnsGrip.closest('.two-columns-zone'); if (!zone) return; event.preventDefault(); event.stopPropagation(); const rect = zone.getBoundingClientRect(); const update = moveEvent => { const usableWidth = rect.width; if (!usableWidth) return; const left = ((moveEvent.clientX - rect.left) / usableWidth) * 100; zone.style.setProperty('--layout-left', `${Math.max(20, Math.min(80, left))}%`); }; const stop = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', stop); quill.update(Quill.sources.USER); }; document.addEventListener('mousemove', update); document.addEventListener('mouseup', stop, { once: true }); return; }
      const colHandle = event.target.closest && event.target.closest('.table-col-resize-handle'); if (!colHandle) return; const cell = colHandle.closest('th, td'); const table = colHandle.closest('table'); if (!cell || !table) return; event.preventDefault(); event.stopPropagation(); resizeTableColumn(table, cell.cellIndex, event.clientX);
    });

    function positionTableToolbar() { /* placeholder: toolbar de tableau */ }
    return quill;
  }

  function getQuill() { return quill; } function getHTML() { return quill.root.innerHTML; } function setHTML(html) { quill.root.innerHTML = html || ''; quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); quill.root.querySelectorAll('.editor-image').forEach(ensureImageHandles); }
  return { init, getQuill, getHTML, setHTML, insertImage, uploadImage };
})();

function alignHandler(value) { const range = quill && quill.getSelection && quill.getSelection(); if (!range) return; quill.formatText(range.index, range.length, 'align', value || false, Quill.sources.USER); }
