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

  // --- Largeurs de colonnes quand l'éditeur est masqué (Mode lecture, macro-modèle ouvert) ---
  // Bug du 01/10 : charger un modèle, ou changer les marges, pendant que #editor-container est en display:none ramenait toutes les colonnes de ses tableaux à
  // 25 px en Aperçu A4 : la largeur de page mesurée d'un éditeur sans mise en page était négative (clientWidth 0 moins le padding des marges) et
  // clampOverflowingTables en tirait un facteur négatif. Le parcours complet, à la vraie souris, est dans dev-tests/verify-table-widths-mouse.mjs ; ici, les
  // fonctions de js/editor.js et de js/editor-core.js une à une, éditeur masqué en direct.
  const rowOf = widths => '<tr>' + widths.map(w => '<td' + (w ? ` colwidth="${w}"` : '') + '><p>x</p></td>').join('') + '</tr>';
  const tableSeed = widths => '<p>Avant</p><table><tbody>' + rowOf(widths) + rowOf(widths) + '</tbody></table><p>Après</p>';
  // Largeurs de la première ligne lues dans le document (ce qui s'enregistre), pas dans le DOM : masqué, l'éditeur n'a aucune mesure.
  function firstRowWidths() {
    const t = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelector('table');
    return t ? Array.from(t.rows[0].cells).map(c => c.getAttribute('colwidth') || '-') : null;
  }
  // Aperçu A4 posé comme chez Antoine (case cochée d'office), éditeur masqué le temps de `during`, tout remis ensuite.
  async function withEditorHidden(h, during) {
    const container = document.getElementById('editor-container');
    const displayBefore = container.style.display;
    h.setA4Preview(true);
    container.style.display = 'none';
    try { return await during(); }
    finally { container.style.display = displayBefore; h.setA4Preview(false); }
  }

  cases.push({
    id: 'table_content_width_is_zero_when_editor_hidden',
    description: 'EditorCore.editorContentWidthPx rend 0, jamais une largeur négative, quand l\'éditeur est masqué (Lecture, macro-modèle) ; une vraie largeur quand il est affiché',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      let visible, hidden;
      try {
        visible = EditorCore.editorContentWidthPx(EditorCore.getEditor());
        hidden = await withEditorHidden(h, async () => EditorCore.editorContentWidthPx(EditorCore.getEditor()));
      } finally { h.setA4Preview(false); }
      return { pass: visible > 100 && hidden === 0, notes: 'affiché=' + visible + ' masqué=' + hidden };
    },
  });

  cases.push({
    id: 'table_widths_kept_when_template_loads_in_hidden_editor',
    description: 'Un modèle à tableau chargé pendant que l\'éditeur est masqué (Aperçu A4) garde les largeurs de ses colonnes, au chargement et une fois l\'éditeur de retour',
    run: async (h) => {
      await h.resetEditor();
      let whileHidden;
      await withEditorHidden(h, async () => { Editor.setHTML(tableSeed([200, 150])); await h.sleep(150); whileHidden = firstRowWidths(); });
      await h.sleep(150);
      const after = firstRowWidths();
      return { pass: whileHidden.join() === '200,150' && after.join() === '200,150', notes: 'masqué=' + whileHidden + ' de retour=' + after };
    },
  });

  cases.push({
    id: 'table_widths_kept_when_layout_refreshed_in_hidden_editor',
    description: 'Editor.refreshLayout (marges changées depuis Réglages) éditeur masqué ne touche pas aux largeurs des colonnes',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(tableSeed([200, 150]));
      await h.sleep(150);
      let whileHidden;
      await withEditorHidden(h, async () => { Editor.refreshLayout(); await h.sleep(150); whileHidden = firstRowWidths(); });
      return { pass: whileHidden.join() === '200,150', notes: 'masqué=' + whileHidden };
    },
  });

  cases.push({
    id: 'table_auto_columns_not_frozen_at_floor_in_hidden_editor',
    description: 'Colonnes automatiques d\'un modèle chargé éditeur masqué : pas figées à 25 px par une mesure à zéro ; figées à leur largeur affichée dès que l\'éditeur redevient visible (refreshLayout)',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      let whileHidden;
      try {
        await withEditorHidden(h, async () => { Editor.setHTML(tableSeed([200, 0, 0])); await h.sleep(150); whileHidden = firstRowWidths(); });
        h.setA4Preview(true);
        Editor.refreshLayout();
        await h.sleep(150);
        const shown = firstRowWidths();
        return {
          pass: whileHidden.join() === '200,-,-' && shown[0] === '200' && shown.slice(1).every(w => Number(w) > 40),
          notes: 'masqué=' + whileHidden + ' affiché=' + shown,
        };
      } finally { h.setA4Preview(false); }
    },
  });

  cases.push({
    id: 'table_auto_columns_frozen_at_layout_width_on_reduced_sheet',
    description: "Feuille A4 réduite (panneau étroit : ~0,85 à 700 px) : le widget fige les colonnes automatiques à leur largeur de mise en page, pas à celle de l'écran - le tableau garde la largeur de la page au lieu de rétrécir de la réduction de la feuille dès la première largeur posée (15 % de moins à 0,85)",
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      const box = document.getElementById('editor-container');
      const before = box.style.getPropertyValue('--pp-fit-zoom');
      try {
        box.style.setProperty('--pp-fit-zoom', '0.8');
        Editor.setHTML(tableSeed([200, 0, 0]));
        await h.sleep(250);
        const zoom = EditorCore.layoutZoom(h.tiptap());
        const page = Math.floor(EditorCore.editorContentWidthPx(EditorCore.getEditor()));
        const shown = firstRowWidths().map(Number);
        const each = (page - 200) / 2;
        return {
          pass: Math.abs(zoom - 0.8) < 0.001 && shown[0] === 200 && shown.slice(1).every(w => Math.abs(w - each) <= 2),
          notes: 'réduction=' + zoom + ' page=' + page + ' largeurs=' + shown + ' attendu=' + each,
        };
      } finally {
        if (before) box.style.setProperty('--pp-fit-zoom', before); else box.style.removeProperty('--pp-fit-zoom');
        h.setA4Preview(false);
      }
    },
  });

  cases.push({
    id: 'table_wide_table_clamped_once_editor_is_shown',
    description: 'Tableau plus large que la page chargé éditeur masqué : largeurs du modèle gardées tant qu\'il est masqué, ramené dans la page (jamais à 25 px) dès que l\'éditeur redevient visible - comme un chargement éditeur visible',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      try {
        const pageWidth = Math.floor(EditorCore.editorContentWidthPx(EditorCore.getEditor()));
        Editor.setHTML(tableSeed([pageWidth, pageWidth]));
        await h.sleep(150);
        const visibleLoad = firstRowWidths();
        let whileHidden;
        await withEditorHidden(h, async () => { Editor.setHTML(tableSeed([pageWidth, pageWidth])); await h.sleep(150); whileHidden = firstRowWidths(); });
        h.setA4Preview(true);
        Editor.refreshLayout();
        await h.sleep(150);
        const shown = firstRowWidths();
        const total = shown.reduce((s, w) => s + Number(w), 0);
        return {
          pass: whileHidden.join() === pageWidth + ',' + pageWidth && total <= pageWidth + 3 && shown.every(w => Number(w) > 100) && shown.join() === visibleLoad.join(),
          notes: 'page=' + pageWidth + ' chargé visible=' + visibleLoad + ' masqué=' + whileHidden + ' affiché=' + shown,
        };
      } finally { h.setA4Preview(false); }
    },
  });

  // Les largeurs que l'écran montre (celles du DOM, pas celles du document).
  const shownWidths = () => Array.from(document.querySelectorAll('.tiptap tr')).map(tr => Array.from(tr.children).map(cell => Math.round(cell.getBoundingClientRect().width)));
  cases.push({
    id: 'table_automatic_columns_show_their_original_width_again_after_undo',
    description: "Tableau aux largeurs jamais fixées dont on tire un bord (le widget fige aussitôt les autres colonnes) : Annuler rend la largeur d'avant À L'ÉCRAN, pas seulement dans le document - Tiptap posait `min-width` sur le <col> d'une colonne redevenue « automatique » mais gardait son ancien `width` (createTableView, js/editor-nodes.js)",
    run: async (h) => {
      await h.resetEditor();
      if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
      Editor.setHTML(tableSeed([0, 0, 0]));
      await h.sleep(250);
      const ed = EditorCore.getEditor();
      const original = shownWidths();
      // La première colonne tirée à 120 px : la première case de chaque ligne, comme le fait la poignée de bord (prosemirror-tables).
      const firstOfEachRow = [];
      ed.state.doc.descendants((node, pos) => { if (node.type.name === 'tableRow') firstOfEachRow.push(pos + 1); return true; });
      const pull = ed.state.tr;
      firstOfEachRow.forEach(pos => pull.setNodeMarkup(pos, undefined, Object.assign({}, ed.state.doc.nodeAt(pos).attrs, { colwidth: [120] })));
      ed.view.dispatch(pull);
      await h.sleep(700);
      const pulled = shownWidths();
      ed.commands.undo();
      await h.sleep(500);
      const undone = shownWidths();
      const same = (a, b) => a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((w, j) => Math.abs(w - b[i][j]) <= 2));
      return {
        pass: pulled[0][0] === 120 && same(undone, original) && !/colwidth/.test(Editor.getHTML()),
        notes: 'origine=' + JSON.stringify(original) + ' tiré=' + JSON.stringify(pulled) + ' annulé=' + JSON.stringify(undone),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tables = cases;
})();
