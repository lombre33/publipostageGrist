// Suite "tableMerge" - fusionner et scinder des cases dans un tableau de DOCUMENT (js/table-merge.js, boutons « Fusionner les cases » et « Scinder la case » de la barre du tableau,
// js/floating-toolbars.js ; Antoine, 04/10 : « fusion de cellules dans les documents » à coder pour la bêta, carte « Complète »). La grille a les siennes (suite "grid"). Ici : les
// commandes (texte gardé à la suite, largeurs des colonnes rendues, un seul Annuler, scission), leurs gardes (une seule case choisie, case déjà fusionnée qui dépasse, suivi des
// modifications, ligne répétée par une boucle) et le grisé de la barre avec sa raison, puis le même tableau fusionné dans la Lecture, le PDF (relu par pdf.js) et le Word (OOXML
// dézippé) : « ce qui dépasse dans l'éditeur dépasse partout ». Les gestes à la vraie souris (glisser, cliquer la barre à 700x400) sont dans dev-tests/verify-table-merge-mouse.mjs :
// ici les évènements sont synthétiques.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const WIDTHS = [100, 150, 60];
  // Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement (un Annuler défait alors les deux).
  const GROUP_GAP_MS = 700;

  // Un tableau de `rows` lignes et trois colonnes, textes A1, B1, C1, A2... ; `widths` : les largeurs posées par le tirage d'un trait de colonne (colwidth), null pour des colonnes qui se règlent seules.
  function tableHtml(rows, widths) {
    const w = widths === undefined ? WIDTHS : widths;
    return '<p>avant</p><table><tbody>' + Array.from({ length: rows }, (_, r) => '<tr>' + [0, 1, 2].map(c => `<td${w ? ` colwidth="${w[c]}"` : ''}><p>${'ABC'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>après</p>';
  }
  function firstTable() {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (!found && node.type.name === 'table') found = { node, pos }; return !found; });
    return found;
  }
  // Les cases du premier tableau telles que le document les porte : place dans la grille (une case fusionnée sur plusieurs lignes décale celles d'en dessous), forme, un texte par paragraphe,
  // largeur enregistrée, fond. Lues sur le document, jamais sur prosemirror-tables : le test juge ce que le module a écrit.
  function cellsOfTable() {
    const table = firstTable();
    const taken = [];
    const out = [];
    table.node.forEach((row, rowOffset, r) => {
      let c = 0;
      row.forEach((cell, cellOffset) => {
        while (taken[r] && taken[r][c]) c++;
        const colspan = cell.attrs.colspan || 1, rowspan = cell.attrs.rowspan || 1;
        for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) (taken[r + dr] = taken[r + dr] || [])[c + dc] = true;
        out.push({
          row: r, col: c, colspan, rowspan, pos: table.pos + 1 + rowOffset + 1 + cellOffset, type: cell.type.name, colwidth: cell.attrs.colwidth, bg: cell.attrs.backgroundColor || null,
          paragraphs: Array.from({ length: cell.childCount }, (_, i) => cell.child(i).textContent),
        });
        c += colspan;
      });
    });
    return out;
  }
  const cellAt = (row, col) => cellsOfTable().find(c => c.row === row && c.col === col);
  const shape = cells => cells.map(c => `${c.row},${c.col}:${c.colspan}x${c.rowspan}`).join(' ');
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function withTable(h, body, html) {
    await h.resetEditor();
    Editor.setHTML(html || tableHtml(3));
    await sleep(200);
    ed().commands.focus();
    try { return await body(); } finally { Editor.setTrackChanges(false); await sleep(30); }
  }
  async function selectCells(r1, c1, r2, c2) {
    ed().commands.setCellSelection({ anchorCell: cellAt(r1, c1).pos, headCell: cellAt(r2, c2).pos });
    await sleep(120);
  }
  async function putCursor(row, col) {
    ed().commands.setTextSelection(cellAt(row, col).pos + 2);
    await sleep(120);
  }
  // La barre flottante du tableau et ses deux boutons : grisé (classe, aria-disabled), info-bulle, présence à l'écran.
  const bar = () => document.querySelector('.v2-floating-toolbar button[data-action="table-del"]').closest('.v2-floating-toolbar');
  function buttonState(action) {
    const b = bar().querySelector(`button[data-action="${action}"]`);
    return b ? { disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title, shown: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0, locked: b.classList.contains('v2-hf-locked') } : null;
  }
  const press = action => bar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // Une boucle « La ligne du tableau » posée sur une bulle (le format de js/loop-rules.js) : la ligne qui la contient est répétée.
  function loopBadge(repeat) {
    const loop = JSON.stringify({ repeat, table: 'Lignes', empty: 'header' }).replace(/"/g, '&quot;');
    return `<span class="var-badge" data-table="Lignes" data-column="Designation" data-key="Lignes.Designation" data-loop="${loop}" data-loop-repeat="${repeat}"></span>`;
  }

  cases.push({
    id: 'merge_square_makes_one_cell_and_keeps_every_text',
    description: 'Quatre cases choisies (2x2) : une seule case de 2 colonnes et 2 lignes, le texte des autres à la suite du sien dans l\'ordre de lecture, la largeur de ses deux colonnes gardée, les autres cases intactes',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      const reason = TableMerge.mergeBlock(ed());
      const done = TableMerge.mergeCells(ed());
      await sleep(120);
      const cells = cellsOfTable();
      const merged = cellAt(0, 0);
      const others = cells.filter(c => c !== merged && !(c.row === merged.row && c.col === merged.col));
      const untouched = others.every(c => sameJson(c.paragraphs, [`${'ABC'[c.col]}${c.row + 1}`]) && sameJson(c.colwidth, [WIDTHS[c.col]]) && c.colspan === 1 && c.rowspan === 1);
      const pass = reason === null && done === true && cells.length === 6 && merged.colspan === 2 && merged.rowspan === 2
        && sameJson(merged.paragraphs, ['A1', 'B1', 'A2', 'B2']) && sameJson(merged.colwidth, [100, 150]) && untouched
        && shape(cells) === '0,0:2x2 0,2:1x1 1,2:1x1 2,0:1x1 2,1:1x1 2,2:1x1';
      return { pass, notes: JSON.stringify({ reason, done, shape: shape(cells), merged }) };
    }),
  });

  cases.push({
    id: 'merge_title_row_across_the_columns',
    description: 'Une ligne de titre : les trois cases de la première ligne en une seule sur 3 colonnes, le texte à la suite, les largeurs des trois colonnes gardées, les lignes d\'en dessous intactes',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 0, 2);
      const done = TableMerge.mergeCells(ed());
      await sleep(120);
      const merged = cellAt(0, 0);
      const below = cellsOfTable().filter(c => c.row > 0);
      const html = Editor.getHTML();
      const pass = done === true && merged.colspan === 3 && merged.rowspan === 1 && sameJson(merged.paragraphs, ['A1', 'B1', 'C1']) && sameJson(merged.colwidth, [100, 150, 60])
        && below.length === 6 && below.every(c => c.colspan === 1 && c.rowspan === 1) && /colspan="3"/.test(html) && !/rowspan="[2-9]"/.test(html);
      return { pass, notes: JSON.stringify({ done, merged, below: below.length }) };
    }),
  });

  cases.push({
    id: 'merge_whole_columns_keeps_their_widths',
    description: 'Fusionner toutes les lignes de deux colonnes de largeurs réglées (100 et 150 px) : plus aucune autre case ne porte ces largeurs, la case fusionnée les garde (sinon le tableau s\'étire : 100/150/60 devenait 175/263/105)',
    run: async (h) => withTable(h, async () => {
      const width = () => Math.round(document.querySelector('.tiptap table').getBoundingClientRect().width);
      const colStyles = () => Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => c.style.width);
      const before = { width: width(), cols: colStyles() };
      await selectCells(0, 0, 2, 1);
      const done = TableMerge.mergeCells(ed());
      await sleep(200);
      const merged = cellAt(0, 0);
      const after = { width: width(), cols: colStyles() };
      const pass = done === true && merged.colspan === 2 && merged.rowspan === 3 && sameJson(merged.colwidth, [100, 150])
        && sameJson(before.cols, ['100px', '150px', '60px']) && sameJson(after.cols, before.cols) && Math.abs(after.width - before.width) <= 1.5;
      return { pass, notes: JSON.stringify({ done, colwidth: merged && merged.colwidth, before, after }) };
    }),
  });

  cases.push({
    id: 'merge_columns_that_size_themselves_get_no_invented_width',
    description: 'Un tableau dont les colonnes se règlent seules (aucune largeur posée) : la case fusionnée n\'en reçoit pas non plus (aucun 0 ni largeur inventée dans le document)',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      const done = TableMerge.mergeCells(ed());
      await sleep(120);
      const merged = cellAt(0, 0);
      const html = Editor.getHTML();
      const pass = done === true && merged.colspan === 2 && merged.rowspan === 2 && (merged.colwidth == null) && !/colwidth/.test(html);
      return { pass, notes: JSON.stringify({ done, colwidth: merged && merged.colwidth }) };
    }, tableHtml(3, null)),
  });

  cases.push({
    id: 'merge_is_one_undo_step_and_redoes',
    description: 'Un seul Annuler rend le tableau tel qu\'il était (cases, textes, largeurs), un seul Rétablir refait la fusion',
    run: async (h) => withTable(h, async () => {
      const original = JSON.stringify(cellsOfTable());
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(GROUP_GAP_MS);
      const mergedState = JSON.stringify(cellsOfTable());
      ed().commands.undo();
      await sleep(120);
      const undone = JSON.stringify(cellsOfTable());
      ed().commands.redo();
      await sleep(120);
      const redone = JSON.stringify(cellsOfTable());
      const pass = mergedState !== original && undone === original && redone === mergedState;
      return { pass, notes: JSON.stringify({ shapeMerged: shape(JSON.parse(mergedState)), shapeUndone: shape(JSON.parse(undone)), shapeRedone: shape(JSON.parse(redone)) }) };
    }),
  });

  cases.push({
    id: 'split_gives_every_cell_back_with_its_column_width',
    description: 'Scinder la case fusionnée 2x2 : quatre cases, la première garde tout le texte, les trois autres naissent vides, chacune à la largeur de sa colonne ; un Annuler remet la case fusionnée',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(GROUP_GAP_MS);
      const mergedState = JSON.stringify(cellsOfTable());
      await putCursor(0, 0);
      const reason = TableMerge.splitBlock(ed());
      const done = TableMerge.splitCell(ed());
      await sleep(120);
      const cells = cellsOfTable();
      const piece = (r, c) => cells.find(x => x.row === r && x.col === c);
      const emptyPieces = [[0, 1], [1, 0], [1, 1]].every(([r, c]) => sameJson(piece(r, c).paragraphs, ['']));
      const widthsOk = sameJson(piece(0, 0).colwidth, [100]) && sameJson(piece(0, 1).colwidth, [150]) && sameJson(piece(1, 0).colwidth, [100]) && sameJson(piece(1, 1).colwidth, [150]);
      await sleep(GROUP_GAP_MS);
      ed().commands.undo();
      await sleep(120);
      const pass = reason === null && done === true && cells.length === 9 && cells.every(c => c.colspan === 1 && c.rowspan === 1)
        && sameJson(piece(0, 0).paragraphs, ['A1', 'B1', 'A2', 'B2']) && emptyPieces && widthsOk && JSON.stringify(cellsOfTable()) === mergedState;
      return { pass, notes: JSON.stringify({ reason, done, count: cells.length, widthsOk, emptyPieces }) };
    }),
  });

  cases.push({
    id: 'split_title_row_back_into_columns',
    description: 'Scinder une ligne de titre fusionnée sur 3 colonnes : trois cases, la première garde le texte, chaque case reprend la largeur de sa colonne',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 0, 2);
      TableMerge.mergeCells(ed());
      await sleep(GROUP_GAP_MS);
      await putCursor(0, 0);
      const done = TableMerge.splitCell(ed());
      await sleep(120);
      const cells = cellsOfTable().filter(c => c.row === 0);
      const pass = done === true && cells.length === 3 && sameJson(cells.map(c => c.colwidth), [[100], [150], [60]]) && sameJson(cells[0].paragraphs, ['A1', 'B1', 'C1']) && sameJson(cells[1].paragraphs, ['']);
      return { pass, notes: JSON.stringify({ done, cells: cells.map(c => [c.colspan, c.colwidth, c.paragraphs]) }) };
    }),
  });

  cases.push({
    id: 'merge_first_cell_gives_the_background_and_the_type',
    description: 'La case fusionnée garde le fond et le type (case ou titre) de la première',
    run: async (h) => withTable(h, async () => {
      const first = cellAt(0, 0), second = cellAt(0, 1);
      const tr = ed().state.tr;
      tr.setNodeMarkup(first.pos, ed().state.schema.nodes.tableHeader, Object.assign({}, ed().state.doc.nodeAt(first.pos).attrs, { backgroundColor: '#fff2a8' }));
      tr.setNodeMarkup(second.pos, undefined, Object.assign({}, ed().state.doc.nodeAt(second.pos).attrs, { backgroundColor: '#c8f7c5' }));
      ed().view.dispatch(tr);
      await sleep(GROUP_GAP_MS);
      await selectCells(0, 0, 0, 1);
      const done = TableMerge.mergeCells(ed());
      await sleep(120);
      const merged = cellAt(0, 0);
      const pass = done === true && merged.type === 'tableHeader' && merged.bg === '#fff2a8' && merged.colspan === 2;
      return { pass, notes: JSON.stringify({ done, type: merged && merged.type, bg: merged && merged.bg }) };
    }),
  });

  cases.push({
    id: 'merge_guards_one_cell_overlap_tracking_and_loops',
    description: 'Les gardes, une par une : un simple curseur, une case fusionnée qui dépasse de la sélection, le suivi des modifications, une ligne répétée par une boucle dans une fusion sur plusieurs lignes (celle dans une seule ligne reste permise) ; chaque refus sa raison, le document intact',
    run: async (h) => {
      const html = tableHtml(3).replace('<p>A2</p>', `<p>A2 ${loopBadge('row')}</p>`);
      return withTable(h, async () => {
        const out = {};
        const untouched = JSON.stringify(cellsOfTable());
        await putCursor(0, 0);
        out.cursor = [TableMerge.mergeBlock(ed()), TableMerge.splitBlock(ed())];
        await selectCells(0, 0, 0, 0);
        out.single = TableMerge.mergeBlock(ed());
        // La ligne 2 (rang 1) porte la boucle : fusionner A1 et A2 la traverse, A2 et A3 aussi ; A2 et B2 (une seule ligne) non.
        await selectCells(0, 0, 1, 0);
        out.loopAbove = TableMerge.mergeBlock(ed());
        await selectCells(1, 1, 2, 1);
        out.loopBelow = TableMerge.mergeBlock(ed());
        await selectCells(1, 0, 1, 1);
        out.loopSameRow = TableMerge.mergeBlock(ed());
        await selectCells(0, 1, 0, 2);
        out.noLoopRow = TableMerge.mergeBlock(ed());
        const refused = TableMerge.mergeCells(ed()) === true; // la ligne 1 n'a pas de boucle : cette fusion-là passe
        await sleep(GROUP_GAP_MS);
        ed().commands.undo();
        await sleep(120);
        // Suivi des modifications : la forme du tableau changerait entre une proposition et son acceptation.
        await selectCells(0, 1, 0, 2);
        Editor.setTrackChanges(true);
        await sleep(100);
        out.tracked = TableMerge.mergeBlock(ed());
        const trackedRefusal = TableMerge.mergeCells(ed());
        Editor.setTrackChanges(false);
        await sleep(100);
        out.untracked = TableMerge.mergeBlock(ed());
        const unchanged = JSON.stringify(cellsOfTable()) === untouched;
        const pass = sameJson(out.cursor, ['table.cellMergeNeedsCells', 'table.cellSplitNeedsMerged']) && out.single === 'table.cellMergeNeedsCells'
          && out.loopAbove === 'table.cellMergeLoop' && out.loopBelow === 'table.cellMergeLoop' && out.loopSameRow === null && out.noLoopRow === null && refused
          && out.tracked === 'table.cellTracked' && trackedRefusal === false && out.untracked === null && unchanged;
        return { pass, notes: JSON.stringify({ out, refused, trackedRefusal, unchanged }) };
      }, html);
    },
  });

  cases.push({
    id: 'merge_refuses_a_selection_that_cuts_an_already_merged_cell',
    description: 'Une sélection qui ne contient qu\'une partie d\'une case déjà fusionnée : « Fusionner » refuse (la case dépasse du rectangle), avec sa raison ; en l\'incluant en entier la fusion passe',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(GROUP_GAP_MS);
      // C1 (ligne 0, colonne 2) jusqu'à B3 (ligne 2, colonne 1) : le rectangle prend la colonne 1 de la case fusionnée mais pas sa colonne 0.
      await selectCells(0, 2, 2, 1);
      const overlap = TableMerge.mergeBlock(ed());
      const refused = TableMerge.mergeCells(ed());
      // A3 jusqu'à C1 : le rectangle prend toute la case fusionnée.
      await selectCells(2, 0, 0, 2);
      const whole = TableMerge.mergeBlock(ed());
      const pass = overlap === 'table.cellMergeOverlap' && refused === false && whole === null;
      return { pass, notes: JSON.stringify({ overlap, refused, whole }) };
    }),
  });

  cases.push({
    id: 'merge_row_crossed_by_a_merge_is_found',
    description: 'TableMerge.rowCrossedByMerge : vrai pour la ligne où une case fusionnée commence et pour celles qu\'elle recouvre, faux pour les autres ; faux aussi hors tableau',
    run: async (h) => withTable(h, async () => {
      await selectCells(1, 0, 2, 0);
      TableMerge.mergeCells(ed());
      await sleep(120);
      const table = firstTable().node;
      const found = [0, 1, 2].map(r => TableMerge.rowCrossedByMerge(table, r));
      const pass = sameJson(found, [false, true, true]) && TableMerge.rowCrossedByMerge(null, 0) === false && TableMerge.rowCrossedByMerge(table, 9) === false;
      return { pass, notes: JSON.stringify({ found }) };
    }),
  });

  cases.push({
    id: 'merge_bar_buttons_follow_the_selection_with_their_reason',
    description: 'Barre du tableau d\'un document : les deux boutons sont toujours là, grisés (jamais retirés) avec leur raison en info-bulle, dégrisés quand ils servent ; un appui sur chacun fait le travail, un appui sur un bouton grisé ne fait rien',
    run: async (h) => withTable(h, async () => {
      const out = {};
      await putCursor(1, 1);
      out.cursor = { merge: buttonState('cell-merge'), split: buttonState('cell-split') };
      const noop = JSON.stringify(cellsOfTable());
      press('cell-split'); press('cell-merge');
      await sleep(120);
      out.noopHeld = JSON.stringify(cellsOfTable()) === noop;
      await selectCells(0, 0, 1, 1);
      out.selected = { merge: buttonState('cell-merge'), split: buttonState('cell-split') };
      press('cell-merge');
      await sleep(GROUP_GAP_MS);
      out.merged = { merge: buttonState('cell-merge'), split: buttonState('cell-split'), cells: cellsOfTable().length };
      press('cell-split');
      await sleep(150);
      out.split = { cells: cellsOfTable().length, merge: buttonState('cell-merge'), split: buttonState('cell-split') };
      const s = out;
      const pass = s.cursor.merge.shown && s.cursor.split.shown && s.cursor.merge.disabled && s.cursor.split.disabled && !s.cursor.merge.locked
        && s.cursor.merge.title === I18n.t('table.cellMergeNeedsCells') && s.cursor.split.title === I18n.t('table.cellSplitNeedsMerged') && s.noopHeld
        && !s.selected.merge.disabled && s.selected.merge.title === I18n.t('table.cellMerge') && s.selected.merge.aria === 'false' && s.selected.split.disabled
        && s.merged.cells === 6 && s.merged.merge.disabled && !s.merged.split.disabled && s.merged.split.title === I18n.t('table.cellSplit')
        && s.split.cells === 9 && s.split.split.disabled;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  cases.push({
    id: 'merge_bar_buttons_say_why_in_english_and_with_tracking_on',
    description: 'Les raisons du grisé suivent la langue de l\'interface (anglais) ; avec le suivi des modifications les deux boutons sont grisés avec leur raison, et se dégrisent quand il s\'éteint',
    run: async (h) => withTable(h, async () => {
      const lang = I18n.getLang();
      try {
        I18n.setLang('en');
        await putCursor(0, 0);
        const cursor = { merge: buttonState('cell-merge'), split: buttonState('cell-split') };
        await selectCells(0, 0, 1, 1);
        Editor.setTrackChanges(true);
        await sleep(150);
        const tracked = { merge: buttonState('cell-merge') };
        Editor.setTrackChanges(false);
        await sleep(150);
        const freed = { merge: buttonState('cell-merge') };
        const pass = cursor.merge.title === 'Merge cells: select at least two, by dragging across the table' && cursor.split.title === 'Split cell: place the cursor in a merged cell'
          && tracked.merge.disabled && tracked.merge.title === 'Unavailable with track changes on: the shape of the table would change' && !freed.merge.disabled && freed.merge.title === 'Merge cells';
        return { pass, notes: JSON.stringify({ cursor, tracked, freed }) };
      } finally { I18n.setLang(lang); }
    }),
  });

  cases.push({
    id: 'merged_cells_in_the_reader_keep_their_shape_and_place',
    description: 'La Lecture écrit la même case fusionnée (colspan 2, rowspan 2) et pose les cases voisines au même endroit que l\'éditeur (largeurs réglées 100, 150 et 60 px)',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(200);
      h.setA4Preview(true);
      await sleep(250);
      const reader = await h.renderReaderMode(Editor.getHTML());
      await sleep(250);
      const mergedCell = reader.querySelector('td[colspan="2"][rowspan="2"]');
      const comparisons = ['C1', 'C2', 'A3', 'B3', 'C3'].map(text => h.compareEditorReaderPosition(text, { selector: 'p', tolerancePx: 2.5 }));
      h.setA4Preview(false);
      const pass = !!mergedCell && mergedCell.textContent.replace(/\s+/g, '') === 'A1B1A2B2' && comparisons.every(c => c.found && c.pass);
      return { pass, notes: JSON.stringify({ mergedCell: !!mergedCell, comparisons: comparisons.map(c => [c.found, c.pass, c.deltaLeft, c.deltaTop, c.deltaWidth]) }) };
    }),
  });

  cases.push({
    id: 'merged_cells_in_the_pdf_keep_the_columns',
    description: 'PDF relu par pdf.js : fusionner 2x2 ne déplace aucune autre case (C1, C2, C3 restent à la colonne d\'avant, B3 à la place d\'avant), le texte fusionné est à la colonne de gauche, en haut de sa case, et la colonne de droite garde ses trois cases alignées',
    run: async (h) => withTable(h, async () => {
      const textsOf = async () => {
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
        const truth = await h.extractPdfGroundTruth(pdf.base64);
        const byText = {};
        truth.pages[0].textItems.forEach(i => { byText[i.str] = i; });
        return { byText, content: pdf.content };
      };
      const control = (await textsOf()).byText;
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(200);
      const merged = await textsOf();
      const now = merged.byText;
      const near = (x, y, tolerance) => Math.abs(x - y) <= tolerance;
      const names = ['A1', 'B1', 'A2', 'B2', 'C1', 'C2', 'A3', 'B3', 'C3'];
      const found = names.every(n => control[n] && now[n]);
      const mergedCellNode = JSON.stringify(merged.content).match(/"colSpan":2,"rowSpan":2/);
      const pass = found && !!mergedCellNode
        && ['C1', 'C2', 'C3', 'A3', 'B3'].every(n => near(now[n].x, control[n].x, 0.6))
        && ['A1', 'A2'].every(n => near(now[n].x, control.A3.x, 0.6)) && near(now.B1.x, now.A1.x, 0.6)
        && near(now.A1.y, now.C1.y, 1.5) && now.C2.y > now.C1.y && now.A3.y > now.C2.y && now.A2.y > now.A1.y;
      return { pass, notes: JSON.stringify({ found, mergedCellNode: !!mergedCellNode, control: names.map(n => [n, control[n] && Math.round(control[n].x * 10) / 10, control[n] && Math.round(control[n].y * 10) / 10]), now: names.map(n => [n, now[n] && Math.round(now[n].x * 10) / 10, now[n] && Math.round(now[n].y * 10) / 10]) }) };
    }),
  });

  // Les cases du premier <w:tbl> du Word : largeur, fusion sur plusieurs lignes ('restart' ou 'continue'), colonnes couvertes, texte.
  function wordRows(parts) {
    const tbl = parts.doc.getElementsByTagName('w:tbl')[0];
    const grid = Array.from(tbl.getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).map(g => Number(g.getAttribute('w:w')));
    const rows = Array.from(tbl.children).filter(n => n.nodeName === 'w:tr').map(tr => Array.from(tr.children).filter(n => n.nodeName === 'w:tc').map(tc => {
      const pr = tc.getElementsByTagName('w:tcPr')[0];
      const prop = tag => (pr ? pr.getElementsByTagName(tag)[0] : null);
      const width = prop('w:tcW'), vMerge = prop('w:vMerge'), span = prop('w:gridSpan');
      return {
        w: width ? Number(width.getAttribute('w:w')) : null, vMerge: vMerge ? (vMerge.getAttribute('w:val') || 'continue') : null, span: span ? Number(span.getAttribute('w:val')) : 1,
        text: Array.from(tc.getElementsByTagName('w:t')).map(t => t.textContent).join(''),
      };
    }));
    return { grid, rows };
  }

  cases.push({
    id: 'merged_cells_in_word_keep_the_columns_of_the_cells_below',
    description: 'Word : sous une case fusionnée en hauteur, la case suivante garde SA colonne (largeur de B2 = celle de B1, de C2 = celle de C1 ; avant, elle prenait la largeur de la colonne d\'à côté), la fusion s\'écrit (restart puis continue sur 2 colonnes)',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(200);
      const parts = await h.exportDocxParts(Editor.getHTML(), null, null);
      const { grid, rows } = wordRows(parts);
      const [r0, r1, r2] = rows;
      const pass = grid.length === 3 && r0.length === 2 && r0[0].vMerge === 'restart' && r0[0].span === 2 && r0[0].text === 'A1B1A2B2' && r0[1].text === 'C1'
        && r1.length === 2 && r1[0].vMerge === 'continue' && r1[0].span === 2 && r1[1].text === 'C2' && r1[1].w === r0[1].w
        && r2.length === 3 && r2[0].w === r2[0].w && r2[1].w === grid[1] && r2[2].w === grid[2] && r2[0].w === grid[0] && r0[0].w === grid[0] + grid[1];
      return { pass, notes: JSON.stringify({ grid, rows }) };
    }),
  });

  cases.push({
    id: 'merged_cell_down_a_column_in_word_does_not_shift_the_next_columns',
    description: 'Word : une case fusionnée sur deux lignes dans la première colonne (A1+A2) : B2 et C2 gardent les largeurs de B1 et de C1 (le cas qui décalait toutes les cases d\'une colonne)',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 1, 0);
      TableMerge.mergeCells(ed());
      await sleep(200);
      const parts = await h.exportDocxParts(Editor.getHTML(), null, null);
      const { grid, rows } = wordRows(parts);
      const [r0, r1] = rows;
      const pass = r0.length === 3 && r0[0].vMerge === 'restart' && r0[0].text === 'A1A2' && r1.length === 3 && r1[0].vMerge === 'continue'
        && r1[1].text === 'B2' && r1[1].w === r0[1].w && r1[1].w === grid[1] && r1[2].text === 'C2' && r1[2].w === r0[2].w && r1[2].w === grid[2];
      return { pass, notes: JSON.stringify({ grid, rows }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tableMerge = cases;
})();
