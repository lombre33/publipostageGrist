// Suite "tables" - insertion, ajout/suppression de ligne/colonne,
// suppression du tableau, fond de cellule, formatage à l'intérieur d'une
// cellule (execCommand, pas les commandes chain()).
(function () {
  const cases = [];

  cases.push({
    id: 'table_insert_basic',
    description: 'Insertion d\'un tableau 2x2 via le bouton toolbar',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const html = Editor.getHTML();
      const rows = h.tiptap().querySelectorAll('table tr').length;
      return { pass: html.includes('<table') && rows === 2, notes: 'rows=' + rows + ' html=' + html };
    },
  });

  cases.push({
    id: 'table_add_row_after',
    description: 'Ajouter une ligne après via la toolbar flottante de tableau',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cell = h.tiptap().querySelector('table td, table th');
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await h.sleep(60);
      const btn = document.querySelector('.v2-floating-toolbar button[data-action="row-after"]');
      if (!btn) return { pass: false, notes: 'toolbar de tableau non trouvée après clic dans une cellule - html=' + Editor.getHTML() };
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const rows = h.tiptap().querySelectorAll('table tr').length;
      return { pass: rows === 3, notes: 'rows=' + rows };
    },
  });

  cases.push({
    id: 'table_add_col_after',
    description: 'Ajouter une colonne après via la toolbar flottante',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cell = h.tiptap().querySelector('table td, table th');
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await h.sleep(60);
      const btn = document.querySelector('.v2-floating-toolbar button[data-action="col-after"]');
      if (!btn) return { pass: false, notes: 'toolbar de tableau non trouvée' };
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const cols = h.tiptap().querySelector('table tr').children.length;
      return { pass: cols === 3, notes: 'cols=' + cols };
    },
  });

  cases.push({
    id: 'table_delete_row',
    description: 'Supprimer une ligne (tableau 2x2 -> 1 ligne restante)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cell = h.tiptap().querySelector('table td, table th');
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await h.sleep(60);
      const btn = document.querySelector('.v2-floating-toolbar button[data-action="row-del"]');
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const rows = h.tiptap().querySelectorAll('table tr').length;
      return { pass: rows === 1, notes: 'rows=' + rows };
    },
  });

  cases.push({
    id: 'table_delete_table',
    description: 'Supprimer le tableau entier',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cell = h.tiptap().querySelector('table td, table th');
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await h.sleep(60);
      const btn = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: !html.includes('<table'), notes: html };
    },
  });

  cases.push({
    id: 'table_cell_text_formatting',
    description: 'Gras appliqué à l\'intérieur d\'une cellule (même bouton toolbar que le flux principal - un document ProseMirror unique, pas de cellule isolée)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cellP = h.tiptap().querySelector('table td p, table th p');
      await h.focusInElement(cellP);
      await h.typeText('Cellule grasse');
      await h.selectAllInElement(cellP);
      await h.clickButton('v2-btn-bold');
      const html = Editor.getHTML();
      return { pass: /<table[\s\S]*<strong>Cellule grasse<\/strong>[\s\S]*<\/table>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'table_cell_list',
    description: 'Une liste à puces peut être insérée à l\'intérieur d\'une cellule',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cell = h.tiptap().querySelector('table td, table th');
      await h.focusInElement(cell.querySelector('p') || cell);
      await h.typeText('Item de liste en cellule');
      await h.clickButton('v2-btn-bullet-disc');
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /<table[\s\S]*<ul>[\s\S]*<\/table>/.test(html), notes: html };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tables = cases;
})();
