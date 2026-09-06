// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l’export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + module image (upload PJ Grist dédiée par image, URL, resize, opacité, calque devant/derrière) (v1.10.0)

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

  // --- Blot Image custom (sécurisé : accepte objet OU string src) ---
  class ImageBlot extends Embed {
    static create(value) {
      const data = (value && typeof value === 'object' && !(value instanceof Node)) ? value : { src: typeof value === 'string' ? value : '' };
      const node = super.create(data);
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
      node.dataset.layer = data.layer || 'normal';
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
        wrap: node.dataset.wrap || 'inline',
        layer: node.dataset.layer || 'normal'
      };
    }
  }
  ImageBlot.blotName = 'imagex';
  ImageBlot.tagName = 'img';
  ImageBlot.className = 'editor-image';
  Quill.register(ImageBlot);

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

  // --- Insertion d'image (upload + URL) ---
  function insertImage(value) {
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range || !value || !value.src) return;
    quill.insertEmbed(range.index, 'imagex', value, Quill.sources.USER);
    // Force Quill à matérialiser l'embed dans le DOM AVANT tout findBlot/update interne.
    // Sans ce update explicite, Quill peut appeler scroll.update avec un MutationRecord
    // dont la cible (e) n'est pas encore définie -> erreur "can't access property
    // 'readOnly', e is undefined".
    quill.update(Quill.sources.USER);
    // Les poignées de redimensionnement ne sont sinon posées que sur les images déjà
    // présentes au chargement (setHTML) : une image insérée en direct doit aussi les recevoir
    // (ensureImageHandles est idempotente via un contrôle du DOM réel, donc un balayage
    // complet reste bon marché et évite toute ambiguïté d'index/leaf juste après l'insertion).
    quill.root.querySelectorAll('.editor-image').forEach(ensureImageHandles);
    // Repositionne la sélection après l'image au prochain tick pour éviter le même
    // parcours findBlot sur un DOM en cours de mise à jour.
    const newIndex = range.index + 1;
    setTimeout(function () { if (quill) quill.setSelection(newIndex, 0, Quill.sources.SILENT); }, 0);
  }

  // Upload réel via l'API REST Grist : jeton d'accès -> POST /attachments -> colonne PJ
  // dédiée créée sur la table des modèles -> rattachement de la pièce jointe à la ligne
  // du modèle courant (nécessaire pour que Grist ne purge pas la pièce jointe comme
  // "orpheline" et pour que l'utilisateur la retrouve dans son document Grist).
  async function uploadImage(file) {
    if (!file || !window.grist || !grist.docApi || !grist.docApi.getAccessToken) {
      throw new Error('API Grist d’upload indisponible.');
    }
    const templateId = Templates.getCurrentId();
    if (!templateId) {
      throw new Error('Enregistrez d’abord le modèle (bouton « Enregistrer ») avant d’ajouter une image : la pièce jointe doit être rattachée à une ligne du modèle.');
    }
    const attachmentId = await GristAPI.uploadAttachment(file);
    const column = await Templates.createImageColumn();
    await Templates.attachImage(templateId, column, attachmentId);
    const src = await GristAPI.getAttachmentDownloadUrl(attachmentId);
    insertImage({ src, source: 'attachment', attachmentId, column, alt: file.name });
    return { src, attachmentId, column };
  }

  // --- UI resize/drag pour les images (upload ET URL, même blot .editor-image) ---
  let imageToolbar = null;

  // Idempotente sur l'état RÉEL du DOM (pas seulement sur data-handle-ready) : un
  // quill.update() reconcilie .ql-editor avec le modèle interne de Quill et supprime
  // silencieusement les nœuds qu'il ne reconnaît pas (nos poignées), alors que
  // l'attribut data-handle-ready, lui, reste posé sur l'image — sans cette vérification
  // les poignées ne réapparaîtraient jamais après la première action sur l'image.
  function ensureImageHandles(img) {
    if (!img || !img.parentNode) return;
    if (img.parentNode.querySelectorAll(':scope > .editor-image-handle').length >= 4) {
      img.dataset.handleReady = '1';
      return;
    }
    img.dataset.handleReady = '1';
    img.setAttribute('contenteditable', 'false');
    const isFloating = img.dataset.layer === 'front' || img.dataset.layer === 'behind';
    if (isFloating) img.classList.add('editor-image-floating');
    img.draggable = !isFloating;
    ['nw', 'ne', 'sw', 'se'].forEach(corner => {
      const handle = document.createElement('span');
      handle.className = 'editor-image-handle editor-image-handle-' + corner;
      handle.dataset.corner = corner;
      handle.contentEditable = 'false';
      handle.style.display = 'none';
      img.parentNode && img.parentNode.appendChild
        ? img.parentNode.appendChild(handle)
        : img.appendChild(handle);
    });
  }

  // Les poignées de coin sont positionnées en absolu par rapport au conteneur
  // Quill (.ql-editor, position:relative) car le paragraphe hôte de l'image
  // ne l'est pas nécessairement — c'est aussi ce conteneur qui sert de repère
  // pour les images en calque devant/derrière le texte.
  function positionImageHandles(img) {
    if (!img || !img.parentNode) return;
    const container = img.closest('.ql-editor') || img.parentNode;
    const handles = img.parentNode.querySelectorAll(':scope > .editor-image-handle');
    if (!handles.length) return;
    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = imgRect.top - containerRect.top + container.scrollTop;
    const left = imgRect.left - containerRect.left + container.scrollLeft;
    handles.forEach(h => {
      const corner = h.dataset.corner;
      h.style.top = (corner === 'nw' || corner === 'ne' ? top : top + imgRect.height) + 'px';
      h.style.left = (corner === 'nw' || corner === 'sw' ? left : left + imgRect.width) + 'px';
    });
  }

  function setImageHandlesVisible(img, visible) {
    if (!img || !img.parentNode) return;
    if (visible) ensureImageHandles(img); // auto-guérison si un quill.update() ailleurs les a effacées
    img.parentNode.querySelectorAll(':scope > .editor-image-handle').forEach(h => { h.style.display = visible ? 'block' : 'none'; });
    if (visible) positionImageHandles(img);
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

  // Bascule une image en calque "devant" / "derrière" le texte (position:absolute
  // + z-index, ancrée à sa position actuelle dans .ql-editor) ou la remet dans le
  // flux normal ("normal"). Le glisser-déposer prend ensuite le relais pour la
  // repositionner librement (cf. le mousedown sur .editor-image-floating).
  function setImageLayer(img, layer) {
    if (!img) return;
    if (layer === 'normal') {
      img.style.position = '';
      img.style.left = '';
      img.style.top = '';
      img.style.zIndex = '';
      img.dataset.layer = 'normal';
      img.classList.remove('editor-image-floating');
      img.draggable = true;
      return;
    }
    if (img.style.position !== 'absolute') {
      const container = img.closest('.ql-editor') || img.parentNode;
      const imgRect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      img.style.left = Math.round(imgRect.left - containerRect.left + container.scrollLeft) + 'px';
      img.style.top = Math.round(imgRect.top - containerRect.top + container.scrollTop) + 'px';
      img.style.position = 'absolute';
    }
    img.style.zIndex = layer === 'front' ? '5' : '-1';
    img.dataset.layer = layer;
    img.classList.add('editor-image-floating');
    img.draggable = false;
  }

  function updateImageToolbarState(img) {
    if (!imageToolbar) return;
    const opacityInput = imageToolbar.querySelector('input[data-act="opacity"]');
    if (opacityInput) {
      const raw = img && img.style.opacity !== '' ? parseFloat(img.style.opacity) : 1;
      opacityInput.value = String(Math.round((isNaN(raw) ? 1 : raw) * 100));
    }
    const layer = img ? (img.dataset.layer || 'normal') : 'normal';
    const front = imageToolbar.querySelector('button[data-act="layer-front"]');
    const behind = imageToolbar.querySelector('button[data-act="layer-behind"]');
    if (front) front.classList.toggle('active', layer === 'front');
    if (behind) behind.classList.toggle('active', layer === 'behind');
  }

  function applyImageAction(act) {
    const img = quill.root.querySelector('img.editor-image.editor-image-active');
    if (!img) return;
    const currentPx = parseInt(img.style.width, 10) || img.naturalWidth || 320;
    if (act === 'zoom-in') img.style.width = Math.round(currentPx * 1.25) + 'px';
    else if (act === 'zoom-out') img.style.width = Math.max(40, Math.round(currentPx * 0.75)) + 'px';
    else if (act === 'reset') { img.style.width = ''; img.removeAttribute('data-align'); }
    else if (act === 'align-left') img.dataset.align = 'left';
    else if (act === 'align-center') img.dataset.align = 'center';
    else if (act === 'align-right') img.dataset.align = 'right';
    else if (act === 'wrap') img.dataset.wrap = img.dataset.wrap === 'block' ? 'inline' : 'block';
    else if (act === 'layer-front') setImageLayer(img, img.dataset.layer === 'front' ? 'normal' : 'front');
    else if (act === 'layer-behind') setImageLayer(img, img.dataset.layer === 'behind' ? 'normal' : 'behind');
    else if (act === 'delete') {
      const blot = Quill.find(img);
      if (blot) quill.deleteText(blot.offset(quill.scroll), 1, Quill.sources.USER);
      if (imageToolbar) imageToolbar.classList.remove('visible');
      quill.update(Quill.sources.USER);
      return;
    }
    quill.update(Quill.sources.USER);
    ensureImageHandles(img);
    setImageHandlesVisible(img, true);
    positionImageToolbar();
    positionImageHandles(img);
    updateImageToolbarState(img);
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
        '<span class="editor-image-toolbar-sep"></span>' +
        '<button data-act="align-left" title="Aligner à gauche">⇤</button>' +
        '<button data-act="align-center" title="Centrer">⇔</button>' +
        '<button data-act="align-right" title="Aligner à droite">⇥</button>' +
        '<button data-act="wrap" title="Wrap bloc/en ligne">⏎</button>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<label class="editor-image-opacity" title="Transparence">◐<input type="range" data-act="opacity" min="0" max="100" step="5" value="100"></label>' +
        '<span class="editor-image-toolbar-sep"></span>' +
        '<button data-act="layer-front" title="Devant le texte">▲</button>' +
        '<button data-act="layer-behind" title="Derrière le texte">▼</button>' +
        '<button data-act="delete" title="Supprimer">✕</button>';
      document.body.appendChild(imageToolbar);
      imageToolbar.addEventListener('mousedown', function (event) {
        const btn = event.target.closest && event.target.closest('button[data-act]');
        if (!btn) return;
        event.preventDefault();
        applyImageAction(btn.dataset.act);
      });
      imageToolbar.addEventListener('input', function (event) {
        if (event.target.dataset.act !== 'opacity') return;
        const img = quill.root.querySelector('img.editor-image.editor-image-active');
        if (!img) return;
        img.style.opacity = (parseInt(event.target.value, 10) / 100).toFixed(2);
        quill.update(Quill.sources.USER);
        ensureImageHandles(img);
        setImageHandlesVisible(img, true);
      });
    }
    updateImageToolbarState(quill.root.querySelector('img.editor-image.editor-image-active'));
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
    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: { container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['page-break', 'insert-table', 'insert-two-columns', 'insert-image', 'insert-image-url'], ['clean']], handlers: { align: alignHandler, undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); }, 'insert-table': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'editabletable', {}, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-two-columns': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'twocolumns', { cols: ['', ''] }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); }, 'insert-image': function () { chooseImageFile(); }, 'insert-image-url': function () { const url = window.prompt('URL de l’image :'); if (url) insertImage({ src: url, source: 'url' }); }, 'page-break': function () { const range = quill.getSelection(true); if (!range) return; quill.insertEmbed(range.index, 'pagebreak', { type: 'pageBreak' }, Quill.sources.USER); quill.setSelection(range.index + 1, 0, Quill.sources.USER); } } }, history: { delay: 500, maxStack: 100, userOnly: true } } });
    const toolbar = document.querySelector('.ql-toolbar');
    if (toolbar) installTwoColumnsToolbarIsolation(toolbar);
    if (toolbar) { const undoBtn = toolbar.querySelector('.ql-undo'); const redoBtn = toolbar.querySelector('.ql-redo'); const pageBreakBtn = toolbar.querySelector('.ql-page-break'); const tableBtn = toolbar.querySelector('.ql-insert-table'); const twoColsBtn = toolbar.querySelector('.ql-insert-two-columns'); const imageBtn = toolbar.querySelector('.ql-insert-image'); const imageUrlBtn = toolbar.querySelector('.ql-insert-image-url'); if (undoBtn) undoBtn.innerHTML = '↶'; if (redoBtn) redoBtn.innerHTML = '↷'; if (tableBtn) { tableBtn.innerHTML = '▦ Tableau'; tableBtn.title = 'Insérer un tableau 2×2'; } if (twoColsBtn) { twoColsBtn.innerHTML = '▥ Zone 2 colonnes'; twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)'; } if (pageBreakBtn) { pageBreakBtn.innerHTML = '⏎ Saut de page'; pageBreakBtn.title = 'Insère un saut de page (forcé à l’export PDF)'; } if (imageBtn) { imageBtn.innerHTML = '🖼 Image'; imageBtn.title = 'Insérer une image (upload en pièce jointe Grist)'; } if (imageUrlBtn) { imageUrlBtn.innerHTML = '🔗 Image URL'; imageUrlBtn.title = 'Insérer une image depuis une URL externe'; } }
    const tableTools = document.createElement('div'); tableTools.className = 'table-context-toolbar'; tableTools.innerHTML = '<button data-action="add-row-above">+ ligne au-dessus</button><button data-action="add-row-below">+ ligne en dessous</button><button data-action="remove-row">− ligne</button><button data-action="add-col-left">+ colonne à gauche</button><button data-action="add-col-right">+ colonne à droite</button><button data-action="remove-col">− colonne</button>'; document.getElementById('editor-container').appendChild(tableTools);
    quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns); quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip); quill.root.querySelectorAll('.editor-image').forEach(ensureImageHandles); let activeCell = null;
    function positionTableToolbar() { if (!activeCell || !tableTools.classList.contains('visible')) return; const tableRect = activeCell.closest('.editable-table').getBoundingClientRect(); const toolbarRect = tableTools.getBoundingClientRect(); tableTools.style.position = 'fixed'; tableTools.style.top = `${Math.max(8, tableRect.top - toolbarRect.height - 6)}px`; tableTools.style.left = `${Math.min(Math.max(8, tableRect.left), window.innerWidth - toolbarRect.width - 8)}px`; }
    quill.root.addEventListener('click', function (event) { const cell = event.target.closest && event.target.closest('td,th'); if (!cell || !cell.closest('.editable-table')) { tableTools.classList.remove('visible'); activeCell = null; return; } activeCell = cell; tableTools.classList.add('visible'); positionTableToolbar(); });
    quill.root.addEventListener('click', function (event) {
      const img = event.target.closest && event.target.closest('img.editor-image');
      if (img) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { if (i !== img) { i.classList.remove('editor-image-active'); setImageHandlesVisible(i, false); } });
        img.classList.add('editor-image-active');
        setImageHandlesVisible(img, true);
        showImageToolbar();
      } else if (!event.target.closest || !event.target.closest('.editor-image-toolbar')) {
        quill.root.querySelectorAll('img.editor-image.editor-image-active').forEach(i => { i.classList.remove('editor-image-active'); setImageHandlesVisible(i, false); });
        if (imageToolbar) imageToolbar.classList.remove('visible');
      }
    });
    document.getElementById('editor-container').addEventListener('scroll', positionTableToolbar);
    window.addEventListener('resize', positionTableToolbar);
    document.getElementById('editor-container').addEventListener('scroll', function () {
      positionImageToolbar();
      const activeImg = quill.root.querySelector('img.editor-image.editor-image-active');
      if (activeImg) positionImageHandles(activeImg);
    });
    window.addEventListener('resize', function () {
      positionImageToolbar();
      const activeImg = quill.root.querySelector('img.editor-image.editor-image-active');
      if (activeImg) positionImageHandles(activeImg);
    });
    quill.root.addEventListener('mousedown', function (event) {
      const imgHandle = event.target.closest && event.target.closest('.editor-image-handle');
      if (imgHandle) {
        const img = imgHandle.parentNode && imgHandle.parentNode.querySelector ? imgHandle.parentNode.querySelector('img.editor-image') : null;
        if (!img) return;
        event.preventDefault(); event.stopPropagation();
        const corner = imgHandle.dataset.corner;
        const startX = event.clientX, startY = event.clientY;
        const rect = img.getBoundingClientRect();
        const startW = rect.width, startH = rect.height;
        const aspect = startW / startH;
        document.body.classList.add('resizing-editor-image');
        const onMove = moveEvent => {
          let dx = moveEvent.clientX - startX;
          let dy = moveEvent.clientY - startY;
          if (corner === 'nw') { dx = -dx; dy = -dy; }
          else if (corner === 'ne') { dy = -dy; }
          else if (corner === 'sw') { dx = -dx; }
          let w = Math.max(40, startW + dx);
          let h = Math.max(20, startH + dy);
          if (moveEvent.shiftKey) h = w / aspect;
          img.style.width = Math.round(w) + 'px';
          img.style.height = Math.round(h) + 'px';
          positionImageToolbar();
          positionImageHandles(img);
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.classList.remove('resizing-editor-image');
          quill.update(Quill.sources.USER);
          ensureImageHandles(img);
          setImageHandlesVisible(img, true);
          positionImageHandles(img);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp, { once: true });
        return;
      }
      const floatingImg = event.target.closest && event.target.closest('.editor-image.editor-image-floating');
      if (floatingImg) {
        event.preventDefault();
        const startX = event.clientX, startY = event.clientY;
        const startLeft = parseFloat(floatingImg.style.left) || 0;
        const startTop = parseFloat(floatingImg.style.top) || 0;
        const onMove = moveEvent => {
          floatingImg.style.left = Math.round(startLeft + (moveEvent.clientX - startX)) + 'px';
          floatingImg.style.top = Math.round(startTop + (moveEvent.clientY - startY)) + 'px';
          positionImageToolbar();
          positionImageHandles(floatingImg);
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          quill.update(Quill.sources.USER);
          ensureImageHandles(floatingImg);
          setImageHandlesVisible(floatingImg, true);
          positionImageHandles(floatingImg);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp, { once: true });
        return;
      }
      const twoColumnsGrip = event.target.closest && event.target.closest('.two-columns-resize-grip'); if (twoColumnsGrip) { const zone = twoColumnsGrip.closest('.two-columns-zone'); if (!zone) return; event.preventDefault(); event.stopPropagation(); const rect = zone.getBoundingClientRect(); const update = moveEvent => { const usableWidth = rect.width; if (!usableWidth) return; const left = ((moveEvent.clientX - rect.left) / usableWidth) * 100; zone.style.setProperty('--layout-left', `${Math.max(20, Math.min(80, left))}%`); }; const stop = () => { document.removeEventListener('mousemove', update); document.removeEventListener('mouseup', stop); quill.update(Quill.sources.USER); }; document.addEventListener('mousemove', update); document.addEventListener('mouseup', stop, { once: true }); return; } const handle = event.target.closest && event.target.closest('.table-col-resize-handle'); if (!handle) return; const cell = handle.closest('th, td'); const table = handle.closest('table'); if (!cell || !table) return; event.preventDefault(); event.stopPropagation(); resizeTableColumn(table, cell.cellIndex, event.clientX);
    });
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
  function getQuill() { return quill; }
  // Les poignées de redimensionnement, la poignée 2-colonnes et les poignées de
  // colonnes de tableau sont de simples enfants DOM injectés pour l'édition : elles
  // ne doivent jamais polluer le HTML persisté (ni bloquer leur recréation au
  // prochain chargement via data-handle-ready).
  function getHTML() {
    const clone = quill.root.cloneNode(true);
    clone.querySelectorAll('.editor-image-handle, .two-columns-resize-grip, .table-col-resize-handle').forEach(el => el.remove());
    clone.querySelectorAll('.editor-image').forEach(img => img.removeAttribute('data-handle-ready'));
    return clone.innerHTML;
  }
  function setHTML(html) {
    quill.root.innerHTML = html || '';
    quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip);
    quill.root.querySelectorAll('.editor-image').forEach(ensureImageHandles);
    // Le src des pièces jointes n'est jamais fiable dans le HTML enregistré (le jeton
    // d'accès expire après quelques minutes) : on le régénère à chaque chargement.
    GristAPI.hydrateAttachmentImages(quill.root).catch(function (e) { console.warn('[Editor] hydratation des images échouée', e); });
  }
  return { init, getQuill, getHTML, setHTML, insertImage, uploadImage };
})();
