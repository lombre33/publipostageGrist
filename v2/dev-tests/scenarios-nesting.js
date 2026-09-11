// Suite "nesting" - combinaisons d'imbrication demandées explicitement
// ("une liste dans un tableau lui-même dans un module 2 colonnes") + un cas
// négatif (case à cocher = paragraphes seulement, pas de liste imbriquée).
(function () {
  const cases = [];

  cases.push({
    id: 'nest_table_inside_twocolumns',
    description: 'Un tableau peut être inséré à l\'intérieur d\'une colonne 2-colonnes',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const col = h.tiptap().querySelector('.two-columns-column');
      await h.focusInElement(col.querySelector('p') || col);
      await h.clickButton('v2-btn-table');
      await h.sleep(80);
      const html = Editor.getHTML();
      return { pass: /two-columns-column[^"]*"[^>]*>[\s\S]*<table/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'nest_twocolumns_inside_table_cell',
    description: 'Une zone 2-colonnes peut être insérée à l\'intérieur d\'une cellule de tableau',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cellP = h.tiptap().querySelector('table td p');
      await h.focusInElement(cellP);
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(80);
      const html = Editor.getHTML();
      return { pass: /<table[\s\S]*two-columns-zone[\s\S]*<\/table>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'nest_list_inside_table_inside_twocolumns',
    description: 'Imbrication triple : liste à puces DANS un tableau DANS une colonne 2-colonnes',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const col = h.tiptap().querySelector('.two-columns-column');
      await h.focusInElement(col.querySelector('p') || col);
      await h.clickButton('v2-btn-table');
      await h.sleep(80);
      const cellP = h.tiptap().querySelector('.two-columns-column table td p');
      if (!cellP) return { pass: false, notes: 'cellule introuvable dans la colonne - html=' + Editor.getHTML() };
      await h.focusInElement(cellP);
      await h.typeText('Item imbriqué triple');
      await h.clickButton('v2-btn-bullet-square');
      await h.sleep(60);
      const html = Editor.getHTML();
      const pass = /two-columns-column[\s\S]*<table[\s\S]*<ul[^>]*data-bullet-style="square"[\s\S]*Item imbriqué triple[\s\S]*<\/ul>[\s\S]*<\/table>/.test(html);
      return { pass, notes: html };
    },
  });

  cases.push({
    id: 'nest_heading_inside_table_cell',
    description: 'Un titre (H2) peut être défini à l\'intérieur d\'une cellule de tableau',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const cellP = h.tiptap().querySelector('table td p');
      await h.focusInElement(cellP);
      await h.typeText('Titre en cellule');
      await h.selectAllInElement(cellP);
      const select = document.getElementById('v2-header-select');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /<table[\s\S]*<h2>Titre en cellule<\/h2>[\s\S]*<\/table>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'nest_blockquote_inside_twocolumns',
    description: 'Une citation peut être insérée à l\'intérieur d\'une colonne 2-colonnes',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const col = h.tiptap().querySelector('.two-columns-column');
      const p = col.querySelector('p');
      await h.focusInElement(p);
      // Pas de bouton toolbar dédié pour blockquote dans v2 (vérifié absent
      // du bandeau) - inséré ici via la commande clavier standard ProseMirror
      // (Ctrl+Shift+B, mappée par défaut par @tiptap/starter-kit) pour
      // confirmer que le RACCOURCI marche même en contexte imbriqué, pas
      // seulement dans le flux principal.
      p.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'b', code: 'KeyB', ctrlKey: true, shiftKey: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /two-columns-column[\s\S]*<blockquote/.test(html), notes: 'blockquote inséré ? ' + html.includes('<blockquote') + ' - html=' + html };
    },
  });

  cases.push({
    id: 'nest_checklist_item_no_nested_block',
    description: 'CAS NÉGATIF ATTENDU : une case à cocher ne peut contenir qu\'un paragraphe (nested:false) - insérer un tableau à l\'intérieur ne doit PAS produire de tableau imbriqué dans le <li>',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Tâche');
      await h.clickButton('v2-btn-checklist-classic');
      await h.sleep(60);
      // `data-checked` (pas `data-type="taskItem"`, qui n'existe que dans le
      // HTML SÉRIALISÉ via Editor.getHTML() - absent du DOM VIVANT rendu par
      // la NodeView, constaté en conditions réelles) identifie le <li> dans
      // le DOM réel.
      const taskP = h.tiptap().querySelector('li[data-checked] p');
      await h.focusInElement(taskP);
      await h.clickButton('v2-btn-table');
      await h.sleep(80);
      const html = Editor.getHTML();
      // Comportement attendu (schéma : taskItem content = 'paragraph+' avec
      // nested:false) : soit la commande insertTable est un no-op (aucun
      // <table> nulle part), soit ProseMirror insère le tableau EN DEHORS du
      // <li> (après la liste) plutôt que de casser le schéma - dans les deux
      // cas, PAS de <table> À L'INTÉRIEUR du <li data-type="taskItem">.
      const tableInsideTaskItem = /<li data-checked="[^"]*" data-type="taskItem">(?:(?!<\/li>)[\s\S])*<table/.test(html);
      return { pass: !tableInsideTaskItem, notes: html };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.nesting = cases;
})();
