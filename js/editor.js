// Module éditeur Quill : configuration, formats étendus (taille de police, police), undo/redo, badge de variable
// + saut de page forcé à l'export PDF (v1.4.0)
// + zone à 2 colonnes éditables (v1.8.0)
const Editor = (function () {
  let quill = null;

  const FontSize = Quill.import('attributors/style/size');
  FontSize.whitelist = ['10px','12px','14px','16px','18px','20px','24px','28px','32px','36px','48px'];
  Quill.register(FontSize, true);

  const FontFamily = Quill.import('attributors/style/font');
  FontFamily.whitelist = ['Arial','Georgia','Times New Roman','Courier New','Verdana','Tahoma','Trebuchet MS'];
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
      node.innerHTML = '<span class="page-break-label">— Saut de page —</span>';
      return node;
    }
    static value(node) {
      return { type: 'pageBreak' };
    }
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
      if (value && value.html) {
        node.innerHTML = value.html;
        table = node.querySelector('table');
      }
      if (!table) {
        table = document.createElement('table');
        node.appendChild(table);
      }
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 2; r += 1) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 2; c += 1) {
            const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }
      node.querySelectorAll('td,th').forEach(cell => { cell.contentEditable = 'true'; });
      return node;
    }
    static value(node) { return { html: node.innerHTML }; }
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
      const build = (html) => {
        const col = document.createElement('div');
        col.className = 'two-columns-column';
        col.contentEditable = 'true';
        col.innerHTML = html || '';
        return col;
      };
      const cols = (value && value.cols) || ['', ''];
      node.appendChild(build(cols[0]));
      node.appendChild(build(cols[1]));
      const marker = document.createElement('div');
      marker.className = 'two-columns-marker';
      marker.textContent = '▥ Zone à 2 colonnes';
      marker.contentEditable = 'false';
      node.appendChild(marker);
      return node;
    }
    static value(node) {
      const cols = node.querySelectorAll('.two-columns-column');
      return {
        cols: [
          cols[0] ? cols[0].innerHTML : '',
          cols[1] ? cols[1].innerHTML : ''
        ]
      };
    }
  }
  TwoColumnsBlotClass.blotName = 'twocolumns';
  TwoColumnsBlotClass.tagName = 'div';
  TwoColumnsBlotClass.className = 'two-columns-zone';
  Quill.register(TwoColumnsBlotClass);

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
              quill.insertEmbed(
                range.index,
                'pagebreak',
                { type: 'pageBreak' },
                Quill.sources.USER
              );
              quill.setSelection(range.index + 1, 0, Quill.sources.USER);
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
      if (tableBtn) { tableBtn.innerHTML = '▦ Tableau'; tableBtn.title = 'Insérer un tableau 2×2'; }
      if (twoColsBtn) { twoColsBtn.innerHTML = '▥ Zone 2 colonnes'; twoColsBtn.title = 'Insérer une zone à 2 colonnes éditables (v1.8.0)'; }
      if (pageBreakBtn) {
        pageBreakBtn.innerHTML = '⏎ Saut de page';
        pageBreakBtn.title = 'Insère un saut de page (forcé à l\'export PDF)';
      }
    }

    const tableTools = document.createElement('div');
    tableTools.className = 'table-context-toolbar';
    tableTools.innerHTML = '<button data-action="add-row-above">+ ligne au-dessus</button><button data-action="add-row-below">+ ligne en dessous</button><button data-action="remove-row">− ligne</button><button data-action="add-col-left">+ colonne à gauche</button><button data-action="add-col-right">+ colonne à droite</button><button data-action="remove-col">− colonne</button>';
    document.getElementById('editor-container').appendChild(tableTools);
    let activeCell = null;
    quill.root.addEventListener('click', function (event) {
      const cell = event.target.closest && event.target.closest('td,th');
      if (!cell || !cell.closest('.editable-table')) { tableTools.classList.remove('visible'); activeCell = null; return; }
      activeCell = cell; tableTools.classList.add('visible');
    });
    tableTools.addEventListener('click', function (event) {
      const action = event.target.dataset.action; if (!action || !activeCell) return;
      const table = activeCell.closest('table'); const row = activeCell.parentElement; const col = activeCell.cellIndex;
      const makeCell = () => { const td = document.createElement('td'); td.innerHTML = '&nbsp;'; td.contentEditable = 'true'; return td; };
      if (action === 'add-row-above' || action === 'add-row-below') { const tr = document.createElement('tr'); for (let i = 0; i < table.rows[0].cells.length; i += 1) tr.appendChild(makeCell()); row.parentElement.insertBefore(tr, action.endsWith('above') ? row : row.nextSibling); }
      if (action === 'remove-row' && table.rows.length > 1) row.remove();
      if (action === 'add-col-left' || action === 'add-col-right') Array.from(table.rows).forEach(r => r.insertBefore(makeCell(), action.endsWith('left') ? r.cells[col] : r.cells[col].nextSibling));
      if (action === 'remove-col' && row.cells.length > 1) Array.from(table.rows).forEach(r => { if (r.cells[col]) r.deleteCell(col); });
      quill.update(Quill.sources.USER);
    });

    Variables.init(quill);
    return quill;
  }

  function getQuill() { return quill; }
  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html || ''; }

  return { init, getQuill, getHTML, setHTML };
})();
