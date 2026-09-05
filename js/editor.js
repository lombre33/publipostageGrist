// Éditeur Quill (snow theme) – publipostage Grist.
// v1.5.0 — nettoyage du collage + tableau éditable 2×2 + resize colonnes +
// + saut de page forcé à l'export PDF (v1.4.0)
// + alignement indépendant par colonne (v1.8.4) — la toolbar .ql-align
//   cible désormais la colonne où se trouve la sélection, et le walker
//   d'alignement de pdf-export.js suit l'ordre exact des blocs émis par
//   htmlToPdfContent (en incluant les embeds .editable-table / .two-columns-zone).

const Editor = (function () {
  function registerFormats() {
  const FontSize = Quill.import('formats/size');
  FontSize.whitelist = ['small', false, 'large', 'huge'];
  Quill.register(FontSize, true);

  const FontFamily = Quill.import('formats/font');
  FontFamily.whitelist = ['arial', 'times-new-roman', 'georgia', 'verdana', 'courier-new'];
  Quill.register(FontFamily, true);

  const Embed = Quill.import('blots/embed');
  class PageBreakBlot extends Embed {
    static create() {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.className = 'page-break-blot';
      return node;
    }
    static value() { return true; }
  }
  PageBreakBlot.blotName = 'pageBreak';
  PageBreakBlot.tagName = 'div';
  Quill.register(PageBreakBlot);

  const BlockEmbed = Quill.import('blots/block/embed');
  class TableBlock extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.className = 'editable-table';
      node.innerHTML = value && value.html ? value.html : '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>';
      return node;
    }
    static value(node) { return { html: node.innerHTML }; }
  }
  TableBlock.blotName = 'tableBlock';
  TableBlock.tagName = 'div';
  Quill.register(TableBlock);

  const TableBlot = Quill.import('blots/block/embed');
  class TwoColumnsZone extends TableBlot {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.className = 'two-columns-zone';
      node.innerHTML = value && value.html ? value.html : '<div class="two-columns-column"><p><br></p></div><div class="two-columns-column"><p><br></p></div>';
      return node;
    }
    static value(node) { return { html: node.innerHTML }; }
  }
  TwoColumnsZone.blotName = 'twoColumnsZone';
  TwoColumnsZone.tagName = 'div';
  Quill.register(TwoColumnsZone);
  }

  function ensureTableColumns(table) {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      while (row.children.length < 2) row.insertAdjacentHTML('beforeend', '<td><br></td>');
      while (row.children.length > 2) row.lastElementChild.remove();
    });
  }

  function ensureTwoColumnsGrip(zone) {
    if (!zone || zone.querySelector('.two-columns-resize-grip')) return;
    const grip = document.createElement('div');
    grip.className = 'two-columns-resize-grip';
    grip.setAttribute('contenteditable', 'false');
    grip.setAttribute('title', 'Redimensionner les colonnes');
    zone.appendChild(grip);
  }

  function init() {
    registerFormats();
    const quill = new Quill('#editor', {
      theme: 'snow',
      modules: {
        toolbar: {
          container: [
            [{ font: FontFamily.whitelist }],
            [{ size: FontSize.whitelist }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean'],
            ['pageBreak', 'tableBlock', 'twoColumnsZone']
          ],
          handlers: {
            pageBreak: function () { this.quill.insertEmbed(this.quill.getSelection(true).index, 'pageBreak', true, 'user'); },
            tableBlock: function () { this.quill.insertEmbed(this.quill.getSelection(true).index, 'tableBlock', { html: '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>' }, 'user'); },
            twoColumnsZone: function () { this.quill.insertEmbed(this.quill.getSelection(true).index, 'twoColumnsZone', { html: '<div class="two-columns-column"><p><br></p></div><div class="two-columns-column"><p><br></p></div>' }, 'user'); }
          }
        }
      }
    });

    const toolbar = quill.getModule('toolbar');
    const pageBreakBtn = toolbar.container.querySelector('.ql-pageBreak');
    const tableBtn = toolbar.container.querySelector('.ql-tableBlock');
    const twoColsBtn = toolbar.container.querySelector('.ql-twoColumnsZone');
    if (pageBreakBtn) {
      pageBreakBtn.innerHTML = '⏎ Saut de page';
      pageBreakBtn.title = 'Insère un saut de page (forcé à l\'export PDF)';
    }
    if (tableBtn) {
      tableBtn.innerHTML = '▦ Tableau';
      tableBtn.title = 'Insérer un tableau 2×2';
    }
    if (twoColsBtn) {
      twoColsBtn.innerHTML = '▥ Zone 2 colonnes';
      twoColsBtn.title = 'Insère une zone à 2 colonnes éditables (v1.8.0)';
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
          const x = Math.max(120, Math.min(usableWidth - 120, moveEvent.clientX - rect.left));
          const ratio = (x / usableWidth) * 100;
          zone.style.gridTemplateColumns = `${ratio}% ${100 - ratio}%`;
        };
        const stop = () => {
          document.removeEventListener('mousemove', update);
          document.removeEventListener('mouseup', stop);
        };
        document.addEventListener('mousemove', update);
        document.addEventListener('mouseup', stop);
      }
    });

    tableTools.addEventListener('click', function (event) {
      if (!activeCell) return;
      const action = event.target.dataset.action;
      const row = activeCell.parentElement;
      const table = row && row.closest('table');
      if (!table) return;
      if (action === 'add-row-above' || action === 'add-row-below') {
        const newRow = row.cloneNode(true);
        newRow.querySelectorAll('td,th').forEach(cell => cell.innerHTML = '<br>');
        action === 'add-row-above' ? row.before(newRow) : row.after(newRow);
      } else if (action === 'remove-row') {
        if (table.rows.length > 1) row.remove();
      } else if (action === 'add-col-left' || action === 'add-col-right') {
        const index = Array.from(row.children).indexOf(activeCell);
        table.querySelectorAll('tr').forEach(r => {
          const cell = document.createElement('td'); cell.innerHTML = '<br>';
          action === 'add-col-left' ? r.children[index].before(cell) : r.children[index].after(cell);
        });
      } else if (action === 'remove-col') {
        const index = Array.from(row.children).indexOf(activeCell);
        if (row.children.length > 1) table.querySelectorAll('tr').forEach(r => r.children[index] && r.children[index].remove());
      }
      ensureTableColumns(table);
    });

    toolbar.addHandler('align', function (value) {
      const range = quill.getSelection();
      if (activeCell) {
        activeCell.style.textAlign = value === 'justify' ? 'justify' : (value || 'left');
      } else if (activeTwoColumnsColumn) {
        activeTwoColumnsColumn.style.textAlign = value === 'justify' ? 'justify' : (value || 'left');
      } else if (range) {
        quill.formatLine(range.index, range.length, 'align', value || false, 'user');
      }
    });

    quill.on('text-change', function () {
      quill.root.querySelectorAll('.editable-table table').forEach(ensureTableColumns);
      quill.root.querySelectorAll('.two-columns-zone').forEach(ensureTwoColumnsGrip);
    });

    return quill;
  }

  return { init };
})();
