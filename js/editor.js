// Éditeur Quill (snow theme) – publipostage Grist.
// + variables #badge (v1.3.0)
// + saut de page forcé à l'export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
// + paste sans saut de ligne parasite (v1.8.1)
// + poignée de redimensionnement pour .two-columns-zone (v1.8.3)
// + alignement indépendant par colonne (v1.8.4) — la toolbar .ql-align
//   cible désormais la colonne où se trouve la sélection, et le walker
//   d'alignement de pdf-export.js suit l'ordre exact des blocs émis par
//   htmlToPdfContent (en incluant les embeds .editable-table / .two-columns-zone).
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

  // S'assure qu'un <colgroup> reflète le nombre de colonnes et que chaque cellule
  // de la première ligne (sauf la dernière) reçoit une poignée de redimensionnement.
  function ensureTableColumns(table) {
    if (!table || !table.rows || !table.rows[0]) return;
    const firstRow = table.rows[0];
    const count = firstRow.cells.length;
    let colgroup = table.querySelector(':scope > colgroup');
    if (!colgroup) { colgroup = document.createElement('colgroup'); table.insertBefore(colgroup, table.firstChild); }
    while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col'));
    while (colgroup.children.length > count) colgroup.lastElementChild.remove();
    // Nettoie les anciennes poignées puis en ajoute une par colonne sauf la dernière,
    // uniquement sur la première ligne (qui sert de référence visuelle aux en-têtes).
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
      document.body.classList.remove('resizing-table-column');
      quill.update(Quill.sources.USER);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
    document.body.classList.add('resizing-table-column');
  }

  // Résout la colonne (.two-columns-column) qui contient la sélection courante.
  // Utilisé par le handler toolbar .ql-align pour ne cibler que la colonne où
  // se trouve le curseur (jamais les deux ni le conteneur global).
  function columnFromSelection() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    if (!node) return null;
    const candidate = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return candidate && candidate.closest ? candidate.closest('.two-columns-column') : null;
  }

  // Renvoie les blocs éditables directs d'une colonne (paragraphes et titres).
  // Sert à appliquer l'alignement uniquement à l'intérieur d'une colonne.
  function columnBlocks(column) {
    const sel = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre';
    return Array.from(column.querySelectorAll(':scope > ' + sel))
      .filter(n => !n.classList.contains('two-columns-marker'));
  }

  // Applique un alignement à tous les blocs de la colonne cible, sans toucher
  // à l'autre colonne ni à la racine du document. Efface les classes
  // ql-align-* et force un style inline text-align pour rester
  // indépendant du style hérité du conteneur (corrige la perte du justify).
  function applyColumnAlignment(column, value) {
    const v = value || 'left';
    columnBlocks(column).forEach(block => {
      block.classList.remove('ql-align-center', 'ql-align-right', 'ql-align-justify');
      if (v === 'center' || v === 'right' || v === 'justify') {
        block.classList.add('ql-align-' + v);
        block.style.textAlign = v;
      } else {
        block.style.textAlign = v;
      }
    });
    quill.update(Quill.sources.USER);
  }

  function init() {
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
            },
            // CORRECTIF bug 1 : handler natif Quill pour .ql-align neutralisé.
            // Quill posait le format `align` sur le bloc racine de l'éditeur
            // (à l'intérieur d'une .two-columns-zone c'est la zone entière,
            // donc les deux colonnes étaient affectées en même temps).
            // On délègue à applyColumnAlignment() quand la sélection est dans
            // une colonne, à activeCell.style.textAlign si cellule de tableau,
            // sinon on laisse Quill appliquer sur le bloc courant.
            align: function (value) {
              if (activeCell) {
                activeCell.style.textAlign = value === 'justify' ? 'justify' : (value || 'left');
                quill.update(Quill.sources.USER);
                return false;
              }
              const column = activeTwoColumnsColumn || columnFromSelection();
              if (column) {
                applyColumnAlignment(column, value);
                return false; // bloque le handler natif Quill
              }
              const range = quill.getSelection(true);
              if (!range) return false;
              quill.format('align', value || false, Quill.sources.USER);
              return false;
            }
          }
        },
        history: { delay: 500, maxStack: 100, userOnly: true }
      }
    });

    const toolbar = document.querySelector('.ql-toolbar');
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
    let activeTwoColumnsColumn = null;

    quill.root.addEventListener('click', function (event) {
      const cell = event.target.closest && event.target.closest('td,th');
      if (!cell || !cell.closest('.editable-table')) {
        tableTools.classList.remove('visible');
        activeCell = null;
        return;
      }
      activeCell = cell;
      tableTools.classList.add('visible');
    });

    quill.root.addEventListener('mousedown', function (event) {
      // Mémorise la colonne cliquée : la toolbar .ql-align s'appuiera dessus
      // si l'utilisateur n'a pas bougé la sélection avant de cliquer.
      const colTarget = event.target.closest && event.target.closest('.two-columns-column');
      if (colTarget) activeTwoColumnsColumn = colTarget;
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

    // Handler capture-phase sur .ql-align conservé UNIQUEMENT pour le cas
    // cellule de tableau (le handler natif Quill ne traite pas les td/th).
    // Le cas colonne est géré par toolbar.handlers.align (au niveau du
    // bouton, avant Quill) — voir handler `align` ci-dessus.
    if (toolbar) toolbar.addEventListener('click', function (event) {
      const button = event.target.closest && event.target.closest('.ql-align');
      if (!button) return;
      if (!activeCell) return;
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
