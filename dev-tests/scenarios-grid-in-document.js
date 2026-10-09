// Suite "gridInDocument" - les réglages de la grille sur le tableau d'un DOCUMENT (09/10, demande d'Antoine : le module d'insertion de tableau d'un document classique
// devient un tableau du mode grille ; lot 2 sur 6 : la grille « à portée de tableau »). Dans une grille, le modèle n'a qu'un tableau et `GridEditor` le prend en tête du
// document ; dans un document les réglages de la barre du tableau - alignement vertical, bordures, quadrillage - visent le tableau qui porte la sélection (`tableInfo`,
// `scopedTable` de js/grid-editor.js), les autres restent comme ils étaient. Ici, sans bouton (ceux de la barre du tableau sont au groupe floatingToolbars et au script à la
// souris verify-doc-table-tools-mouse.mjs) : les fonctions de `GridEditor` appelées sur l'éditeur d'un document à deux tableaux, un tableau dans une case, un curseur hors des tableaux, le suivi des modifications
// allumé, puis le tableau réglé dans le Word (OOXML dézippé) : « ce que je règle sort pareil ». La grille elle-même (un seul tableau) garde sa suite "grid".
// Lot 3 (b) : `tableSettingsBlocked`, ce qui grise les boutons sous le suivi. Lot 3 (a) : la structure - « Ligne / Colonne avant / après » sur toute la sélection, la ligne ou la colonne ajoutée qui reprend le cadre et la hauteur de sa
// voisine, la fusion et la scission qui gardent le pourtour (`insertLines`, `repairDocumentTables`, `mergeSelected`, `splitSelected`). Lot 3 (c) : Entrée qui descend d'une
// case, comme dans la grille (`enterGoesDown`, `enterCellPos`).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  // Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement (un Annuler défait alors les deux).
  const GROUP_GAP_MS = 700;

  const tableHtml = (label, rows, cols) => '<table><tbody>' + Array.from({ length: rows }, (_, r) => '<tr>' + Array.from({ length: cols }, (_, c) => `<td><p>${label}${r + 1}${'ABC'[c]}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';
  // Un paragraphe, le tableau A (2 lignes, 2 colonnes), un paragraphe, le tableau B (3 lignes, 2 colonnes), un paragraphe.
  const TWO_TABLES = '<p>avant</p>' + tableHtml('A', 2, 2) + '<p>entre</p>' + tableHtml('B', 3, 2) + '<p>après</p>';

  // Les tableaux du document, dans l'ordre de lecture (un tableau dans une case vient après celui qui le contient).
  function tablesOf() {
    const list = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'table') list.push({ node, pos }); return true; });
    return list;
  }
  // La position AVANT la case (ligne, colonne) du tableau de rang `t`.
  function cellPos(t, row, col) {
    const table = tablesOf()[t];
    let pos = table.pos + 1;
    for (let r = 0; r < row; r++) pos += table.node.child(r).nodeSize;
    pos += 1;
    const rowNode = table.node.child(row);
    for (let c = 0; c < col; c++) pos += rowNode.child(c).nodeSize;
    return pos;
  }
  const cellAttrs = (t, row, col) => ed().state.doc.nodeAt(cellPos(t, row, col)).attrs;
  const tableJson = t => JSON.stringify(tablesOf()[t].node.toJSON());
  // Un attribut posé sur au moins une case du tableau de rang `t` ?
  function anyCellAttr(t, names) {
    let found = false;
    tablesOf()[t].node.descendants((node) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') names.forEach((name) => { if (node.attrs[name]) found = true; });
      return !found;
    });
    return found;
  }
  const BORDERS = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'];

  const rowAttrs = (t, row) => tablesOf()[t].node.child(row).attrs;
  const rowCount = t => tablesOf()[t].node.childCount;
  const colCount = t => tablesOf()[t].node.child(0).childCount;
  // Les quatre bords d'une case, « haut,droite,bas,gauche », '-' pour le trait de départ.
  const borderLine = (t, row, col) => BORDERS.map(side => cellAttrs(t, row, col)[side] || '-').join(',');
  function setRowHeight(t, row, px) {
    const table = tablesOf()[t];
    let pos = table.pos + 1;
    for (let r = 0; r < row; r++) pos += table.node.child(r).nodeSize;
    ed().view.dispatch(ed().state.tr.setNodeMarkup(pos, undefined, Object.assign({}, table.node.child(row).attrs, { rowHeight: px })));
  }
  const RED = '#ff0000';

  async function withDoc(h, html, body) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(200);
    ed().commands.focus();
    try { return await body(); } finally { Editor.setTrackChanges(false); await sleep(30); }
  }
  async function cursorIn(t, row, col) {
    ed().commands.setTextSelection(cellPos(t, row, col) + 2);
    await sleep(100);
  }
  async function selectCells(t, r1, c1, r2, c2) {
    ed().commands.setCellSelection({ anchorCell: cellPos(t, r1, c1), headCell: cellPos(t, r2, c2) });
    await sleep(100);
  }
  const undo = async () => { ed().commands.undo(); await sleep(100); };

  cases.push({
    id: 'gridscope_vertical_align_acts_on_the_table_under_the_cursor_only',
    description: 'Alignement vertical dans un document à deux tableaux : la case du curseur (tableau B) passe en bas, le tableau A ne change pas d\'un octet ; sans réglage une case est « en haut » ; « en haut » efface la marque ; plusieurs cases choisies prennent la même valeur ; un seul Annuler',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      const aBefore = tableJson(0);
      await cursorIn(1, 1, 1);
      const unset = GridEditor.selectedVerticalAlign(ed());
      const set = GridEditor.setVerticalAlign(ed(), 'bottom');
      await sleep(60);
      const bottom = { b11: cellAttrs(1, 1, 1).verticalAlign, read: GridEditor.selectedVerticalAlign(ed()) };
      const html = Editor.getHTML();
      const marks = (html.match(/data-valign="bottom"/g) || []).length;
      if (unset !== 'top') bad.push('case sans réglage : ' + unset + ' (attendu top)');
      if (!set || bottom.b11 !== 'bottom' || bottom.read !== 'bottom' || marks !== 1) bad.push('réglage : ' + JSON.stringify({ set, bottom, marks }));
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé');
      if (anyCellAttr(1, BORDERS) || [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]].some(([r, c]) => cellAttrs(1, r, c).verticalAlign)) bad.push('une autre case de B a changé');
      // « En haut » est l'état de départ d'une case de document : la marque s'efface, le HTML n'en porte plus.
      await sleep(GROUP_GAP_MS);
      GridEditor.setVerticalAlign(ed(), 'top');
      await sleep(60);
      if (cellAttrs(1, 1, 1).verticalAlign !== null || /data-valign/.test(Editor.getHTML())) bad.push('« en haut » doit effacer la marque');
      // Plusieurs cases choisies : la même valeur partout, lue comme une seule ; une sélection mêlée n'en lit aucune.
      await sleep(GROUP_GAP_MS);
      await selectCells(1, 0, 0, 1, 1);
      GridEditor.setVerticalAlign(ed(), 'middle');
      await sleep(60);
      const quad = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([r, c]) => cellAttrs(1, r, c).verticalAlign);
      if (quad.some(v => v !== 'middle') || GridEditor.selectedVerticalAlign(ed()) !== 'middle') bad.push('2x2 choisies : ' + JSON.stringify(quad));
      await selectCells(1, 0, 0, 2, 1);
      if (GridEditor.selectedVerticalAlign(ed()) !== null) bad.push('une sélection mêlée doit lire null');
      // Un seul Annuler défait le réglage de la sélection.
      await undo();
      if (cellAttrs(1, 0, 0).verticalAlign !== null || cellAttrs(1, 1, 1).verticalAlign !== null) bad.push('un Annuler doit défaire les quatre cases');
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé après Annuler');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ unset, bottom, marks, quad }) };
    }),
  });

  cases.push({
    id: 'gridscope_borders_act_on_the_selected_cells_of_the_cursor_table_and_come_out_in_word',
    description: 'Bordures dans un document à deux tableaux : le pourtour du tableau A (rouge) ne touche pas B ; « Intérieures » n\'a rien à tracer sur une seule case ; le réglage survit à l\'enregistrement du modèle ; le Word le lit (w:tcBorders) pour A et pour A seul',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      const bBefore = tableJson(1);
      await cursorIn(0, 0, 0);
      const innerOnOne = GridEditor.canApplyBorders(ed(), 'inner');
      await selectCells(0, 0, 0, 1, 1);
      const innerOnFour = GridEditor.canApplyBorders(ed(), 'inner');
      const applied = GridEditor.applyBorders(ed(), 'outer', '#ff0000');
      await sleep(60);
      const a = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([r, c]) => BORDERS.map(side => cellAttrs(0, r, c)[side] || '-').join(','));
      // A(0,0) : haut et gauche rouges ; A(0,1) : haut et droite ; A(1,0) : bas et gauche ; A(1,1) : bas et droite ; rien à l'intérieur.
      const wanted = ['#ff0000,-,-,#ff0000', '#ff0000,#ff0000,-,-', '-,-,#ff0000,#ff0000', '-,#ff0000,#ff0000,-'];
      if (innerOnOne || !innerOnFour) bad.push('« Intérieures » : ' + JSON.stringify({ innerOnOne, innerOnFour }));
      if (!applied || JSON.stringify(a) !== JSON.stringify(wanted)) bad.push('pourtour de A : ' + JSON.stringify(a) + ' (attendu ' + JSON.stringify(wanted) + ')');
      if (tableJson(1) !== bBefore || anyCellAttr(1, BORDERS)) bad.push('le tableau B a changé');
      // Enregistrer puis rouvrir le modèle : les marques font l'aller-retour.
      const saved = Editor.getHTML();
      Editor.setHTML(saved);
      await sleep(200);
      const reread = [[0, 0], [1, 1]].map(([r, c]) => BORDERS.map(side => cellAttrs(0, r, c)[side] || '-').join(','));
      if (JSON.stringify(reread) !== JSON.stringify([wanted[0], wanted[3]])) bad.push('après réouverture : ' + JSON.stringify(reread));
      // Le Word : les cases de A portent leurs traits rouges, celles de B n'ont aucun trait propre (les traits de départ de Word, sur le tableau, ne sont coupés que pour A).
      const parts = await h.exportDocxParts(saved);
      const tables = Array.from(parts.doc.getElementsByTagName('w:tbl')).map(tbl => Array.from(tbl.getElementsByTagName('w:tc')).map(tc => ({
        text: tc.textContent,
        borders: Array.from(tc.getElementsByTagName('w:tcBorders')[0] ? tc.getElementsByTagName('w:tcBorders')[0].children : []).map(b => b.nodeName.slice(2) + '=' + b.getAttribute('w:val') + (b.getAttribute('w:val') === 'single' ? ':' + b.getAttribute('w:color') : '')).join(','),
      })));
      const first = tables[0] && tables[0].find(c => c.text === 'A1A');
      const last = tables[0] && tables[0].find(c => c.text === 'A2B');
      if (tables.length !== 2 || !first || !last) bad.push('tableaux Word : ' + tables.length);
      else {
        if (first.borders !== 'top=single:FF0000,left=single:FF0000,bottom=single:auto,right=single:auto') bad.push('A1A dans le Word : ' + first.borders);
        if (last.borders !== 'top=single:auto,left=single:auto,bottom=single:FF0000,right=single:FF0000') bad.push('A2B dans le Word : ' + last.borders);
        if (tables[1].some(c => c.borders)) bad.push('une case de B porte des traits dans le Word : ' + JSON.stringify(tables[1].filter(c => c.borders)));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ a, first: first && first.borders }) };
    }),
  });

  cases.push({
    id: 'gridscope_grid_lines_follow_the_table_under_the_cursor',
    description: 'Quadrillage dans un document à deux tableaux : masqué sur le tableau B depuis une case de B, lu « montré » depuis A et « masqué » depuis B ; A ne change pas ; un seul Annuler',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      const aBefore = tableJson(0);
      await cursorIn(1, 0, 0);
      const shownBefore = GridEditor.gridLinesShown(ed());
      const set = GridEditor.setGridLinesShown(ed(), false);
      await sleep(60);
      const marks = (Editor.getHTML().match(/data-grid-lines="off"/g) || []).length;
      const fromB = GridEditor.gridLinesShown(ed());
      await cursorIn(0, 0, 0);
      const fromA = GridEditor.gridLinesShown(ed());
      if (!shownBefore || !set || marks !== 1 || fromB || !fromA) bad.push('lecture : ' + JSON.stringify({ shownBefore, set, marks, fromB, fromA }));
      if (tablesOf()[1].node.attrs.gridLines !== 'off' || tablesOf()[0].node.attrs.gridLines) bad.push('attributs : ' + JSON.stringify(tablesOf().map(t => t.node.attrs.gridLines)));
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé');
      await cursorIn(1, 2, 1);
      const again = GridEditor.setGridLinesShown(ed(), true);
      await sleep(60);
      if (!again || tablesOf()[1].node.attrs.gridLines || /data-grid-lines/.test(Editor.getHTML())) bad.push('« montré » doit effacer la marque');
      await sleep(GROUP_GAP_MS);
      GridEditor.setGridLinesShown(ed(), false);
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tablesOf()[1].node.attrs.gridLines) bad.push('un Annuler doit défaire le masquage');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ marks, fromB, fromA }) };
    }),
  });

  cases.push({
    id: 'gridscope_outside_a_table_nothing_is_set',
    description: 'Curseur hors des tableaux (le document COMMENCE par un tableau : la grille d\'un modèle prendrait celui-là) : alignement vertical, bordures et quadrillage ne font rien (faux), ne lisent rien, et le document reste le même',
    run: async (h) => withDoc(h, tableHtml('A', 2, 2) + '<p>entre</p>' + tableHtml('B', 2, 2) + '<p>après</p>', async () => {
      const gap = ed().state.doc.child(1);
      if (gap.type.name !== 'paragraph' || gap.textContent !== 'entre') return { pass: false, notes: 'document de départ inattendu : ' + gap.type.name };
      ed().commands.setTextSelection(tablesOf()[0].pos + tablesOf()[0].node.nodeSize + 2);
      await sleep(100);
      const before = JSON.stringify(ed().state.doc.toJSON());
      const got = {
        valign: GridEditor.setVerticalAlign(ed(), 'bottom'),
        borders: GridEditor.applyBorders(ed(), 'all', '#00ff00'),
        canBorders: GridEditor.canApplyBorders(ed(), 'all'),
        lines: GridEditor.setGridLinesShown(ed(), false),
        read: GridEditor.selectedVerticalAlign(ed()),
        shown: GridEditor.gridLinesShown(ed()),
      };
      const pass = got.valign === false && got.borders === false && got.canBorders === false && got.lines === false && got.read === null && got.shown === true
        && JSON.stringify(ed().state.doc.toJSON()) === before;
      return { pass, notes: JSON.stringify(got) };
    }),
  });

  cases.push({
    id: 'gridscope_track_changes_on_refuses_the_settings',
    description: 'Suivi des modifications allumé : ces réglages ne sont pas suivis, ils sont donc refusés (faux) et le document ne change pas ; le suivi éteint, ils marchent de nouveau',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      await cursorIn(1, 1, 0);
      Editor.setTrackChanges(true);
      await sleep(100);
      const before = JSON.stringify(ed().state.doc.toJSON());
      const tracked = {
        valign: GridEditor.setVerticalAlign(ed(), 'bottom'),
        borders: GridEditor.applyBorders(ed(), 'all', null),
        lines: GridEditor.setGridLinesShown(ed(), false),
        read: GridEditor.selectedVerticalAlign(ed()),
        blocked: GridEditor.tableSettingsBlocked(),
      };
      const unchanged = JSON.stringify(ed().state.doc.toJSON()) === before;
      Editor.setTrackChanges(false);
      await sleep(100);
      const blockedAgain = GridEditor.tableSettingsBlocked();
      const free = GridEditor.setVerticalAlign(ed(), 'bottom');
      await sleep(60);
      const pass = tracked.valign === false && tracked.borders === false && tracked.lines === false && tracked.read === null && tracked.blocked === true && unchanged
        && blockedAgain === false && free === true && cellAttrs(1, 1, 0).verticalAlign === 'bottom';
      return { pass, notes: JSON.stringify({ tracked, unchanged, blockedAgain, free }) };
    }),
  });

  cases.push({
    id: 'gridscope_table_in_a_cell_is_set_on_its_own',
    description: 'Un tableau dans une case d\'un autre tableau : depuis une de ses cases, l\'alignement vertical et le quadrillage visent le tableau intérieur, jamais la case qui le contient ni le tableau extérieur',
    run: async (h) => withDoc(h, '<p>avant</p><table><tbody><tr><td><p>dehors</p>' + tableHtml('N', 2, 2) + '</td><td><p>voisine</p></td></tr></tbody></table><p>après</p>', async () => {
      const bad = [];
      const list = tablesOf();
      if (list.length !== 2) return { pass: false, notes: 'tableaux trouvés : ' + list.length };
      await cursorIn(1, 1, 1);
      GridEditor.setVerticalAlign(ed(), 'bottom');
      GridEditor.setGridLinesShown(ed(), false);
      await sleep(60);
      const outer = tablesOf()[0];
      const inner = tablesOf()[1];
      const outerCell = outer.node.child(0).child(0).attrs.verticalAlign;
      const neighbour = outer.node.child(0).child(1).attrs.verticalAlign;
      if (cellAttrs(1, 1, 1).verticalAlign !== 'bottom') bad.push('la case de N2B devait passer en bas');
      if (outerCell || neighbour) bad.push('le tableau extérieur a changé : ' + JSON.stringify({ outerCell, neighbour }));
      if (inner.node.attrs.gridLines !== 'off' || outer.node.attrs.gridLines) bad.push('quadrillage : ' + JSON.stringify([outer.node.attrs.gridLines, inner.node.attrs.gridLines]));
      // Depuis la case voisine, hors du tableau intérieur, c'est le tableau extérieur qui est visé.
      await cursorIn(0, 0, 1);
      GridEditor.setGridLinesShown(ed(), false);
      await sleep(60);
      if (tablesOf()[0].node.attrs.gridLines !== 'off') bad.push('depuis la case voisine, le tableau extérieur devait être visé');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_insert_lines_adds_as_many_as_chosen_in_a_document_table',
    description: 'Dans un tableau de document, « Ligne / Colonne avant / après » ajoute autant de lignes ou de colonnes que les cases choisies en couvrent (un simple curseur en ajoute une), sur le tableau du curseur seul (l\'autre ne change pas d\'un octet), en un seul Annuler',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      const aBefore = tableJson(0);
      const bBefore = tableJson(1);
      await selectCells(1, 1, 0, 2, 1); // les lignes 2 et 3 de B
      const rowsDone = GridEditor.insertLines(ed(), 'addRowAfter');
      await sleep(60);
      if (!rowsDone || rowCount(1) !== 5) bad.push('deux lignes choisies : ' + JSON.stringify({ rowsDone, rows: rowCount(1) }));
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé');
      await undo();
      if (tableJson(1) !== bBefore) bad.push('un Annuler doit rendre B tel qu\'il était');
      await sleep(GROUP_GAP_MS);
      await selectCells(1, 0, 0, 1, 0); // la colonne de gauche, deux lignes
      const before = GridEditor.insertLines(ed(), 'addRowBefore');
      await sleep(60);
      if (!before || rowCount(1) !== 5) bad.push('avant, deux lignes : ' + rowCount(1));
      await sleep(GROUP_GAP_MS);
      await undo();
      await sleep(GROUP_GAP_MS);
      await selectCells(1, 0, 0, 0, 1); // les deux colonnes
      const colsDone = GridEditor.insertLines(ed(), 'addColumnAfter');
      await sleep(60);
      if (!colsDone || colCount(1) !== 4) bad.push('deux colonnes choisies : ' + JSON.stringify({ colsDone, cols: colCount(1) }));
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== bBefore) bad.push('B doit revenir tel qu\'il était après les deux Annuler');
      await sleep(GROUP_GAP_MS);
      await cursorIn(1, 0, 0);
      GridEditor.insertLines(ed(), 'addColumnBefore');
      await sleep(60);
      if (colCount(1) !== 3) bad.push('un curseur ajoute une colonne : ' + colCount(1));
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé à la fin');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_added_line_takes_the_frame_and_the_height_of_its_neighbour',
    description: 'Un tableau de document encadré en rouge, dont la dernière ligne a une hauteur : la ligne ajoutée dessous reprend le cadre (bas, gauche, droite) et la hauteur, l\'ancien bas devient un trait intérieur ; la colonne ajoutée à droite reprend le cadre (haut, bas, droite) ; un seul Annuler et Rétablir exacts ; l\'autre tableau ne bouge pas',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await selectCells(1, 0, 0, 2, 1);
      GridEditor.applyBorders(ed(), 'outer', RED);
      setRowHeight(1, 2, 50);
      await sleep(GROUP_GAP_MS);
      const aBefore = tableJson(0);
      const framed = tableJson(1);
      await cursorIn(1, 2, 0);
      const done = GridEditor.insertLines(ed(), 'addRowAfter');
      await sleep(60);
      const added = [0, 1].map(c => borderLine(1, 3, c));
      const oldLast = [0, 1].map(c => borderLine(1, 2, c));
      const afterRow = tableJson(1);
      if (!done || rowCount(1) !== 4) bad.push('ligne ajoutée : ' + rowCount(1));
      if (JSON.stringify(added) !== JSON.stringify(['-,-,' + RED + ',' + RED, '-,' + RED + ',' + RED + ',-'])) bad.push('bords de la ligne ajoutée : ' + JSON.stringify(added));
      if (JSON.stringify(oldLast) !== JSON.stringify(['-,-,-,' + RED, '-,' + RED + ',-,-'])) bad.push('bords de l\'ancienne dernière ligne : ' + JSON.stringify(oldLast));
      if (rowAttrs(1, 3).rowHeight !== 50) bad.push('hauteur de la ligne ajoutée : ' + rowAttrs(1, 3).rowHeight);
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== framed) bad.push('un Annuler doit rendre le tableau exact');
      ed().commands.redo(); await sleep(100);
      if (tableJson(1) !== afterRow) bad.push('un Rétablir doit rendre la ligne et ses bords exacts');
      // Une colonne à droite, sur le tableau tel qu'il était.
      await sleep(GROUP_GAP_MS);
      await undo();
      await sleep(GROUP_GAP_MS);
      await cursorIn(1, 1, 1);
      GridEditor.insertLines(ed(), 'addColumnAfter');
      await sleep(60);
      const column = [0, 1, 2].map(r => borderLine(1, r, 2));
      const oldColumn = [0, 1, 2].map(r => borderLine(1, r, 1));
      if (colCount(1) !== 3) bad.push('colonne ajoutée : ' + colCount(1));
      if (JSON.stringify(column) !== JSON.stringify([RED + ',' + RED + ',-,-', '-,' + RED + ',-,-', '-,' + RED + ',' + RED + ',-'])) bad.push('bords de la colonne ajoutée : ' + JSON.stringify(column));
      if (JSON.stringify(oldColumn) !== JSON.stringify([RED + ',-,-,-', '-,-,-,-', '-,-,' + RED + ',-'])) bad.push('bords de l\'ancienne dernière colonne : ' + JSON.stringify(oldColumn));
      if (tableJson(0) !== aBefore) bad.push('le tableau A a changé');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ added, oldLast, column }) };
    }),
  });

  cases.push({
    id: 'gridscope_lines_added_to_a_table_without_marks_write_nothing',
    description: 'Un tableau de document que personne n\'a réglé reste sans marque : une ligne, deux colonnes ajoutées, une case fusionnée puis scindée ne posent ni trait, ni hauteur, ni alignement, et le HTML enregistré n\'a aucun data-border, data-row-height ni data-valign',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(0, 0, 0);
      GridEditor.insertLines(ed(), 'addRowAfter');
      await selectCells(0, 0, 0, 0, 1);
      GridEditor.insertLines(ed(), 'addColumnAfter');
      await selectCells(0, 0, 0, 1, 1);
      const merged = TableMerge.mergeCells(ed());
      await sleep(60);
      const split = TableMerge.splitCell(ed());
      await sleep(60);
      const html = Editor.getHTML();
      const marks = html.match(/data-(border|row-height|valign|grid-lines|page-break)[a-z-]*=/g) || [];
      if (!merged || !split) bad.push('fusion / scission : ' + JSON.stringify({ merged, split }));
      if (rowCount(0) !== 3 || colCount(0) !== 4) bad.push('forme de A : ' + rowCount(0) + ' x ' + colCount(0));
      if (marks.length) bad.push('marques écrites : ' + marks.join(' '));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_merge_and_split_keep_the_frame_and_the_widths',
    description: 'Fusion et scission dans un tableau de document encadré : la case fusionnée porte le pourtour des cases fusionnées (le trait du dedans disparaît), garde la largeur de chaque colonne qu\'elle couvre, la scission rend les bords d\'avant ; un seul Annuler chacune ; le Word écrit les traits de la case fusionnée',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      // Colonnes de 200 et 100 px, cadre rouge.
      const table = tablesOf()[1];
      const tr = ed().state.tr;
      table.node.forEach((row, rowOffset) => row.forEach((cell, cellOffset, index) => {
        tr.setNodeMarkup(table.pos + 1 + rowOffset + 1 + cellOffset, undefined, Object.assign({}, cell.attrs, { colwidth: [index === 0 ? 200 : 100] }));
      }));
      ed().view.dispatch(tr);
      await selectCells(1, 0, 0, 2, 1);
      GridEditor.applyBorders(ed(), 'outer', RED);
      await sleep(GROUP_GAP_MS);
      const framed = tableJson(1);
      const lines = () => [0, 1, 2].map(r => [0, 1].map(c => borderLine(1, r, c)));
      const framedLines = lines();
      // Les deux dernières cases de la colonne de gauche.
      await selectCells(1, 1, 0, 2, 0);
      const merged = TableMerge.mergeCells(ed());
      await sleep(60);
      const piece = cellAttrs(1, 1, 0);
      if (!merged || piece.rowspan !== 2) bad.push('fusion verticale : ' + JSON.stringify({ merged, rowspan: piece.rowspan }));
      if (borderLine(1, 1, 0) !== '-,-,' + RED + ',' + RED) bad.push('pourtour de la case fusionnée : ' + borderLine(1, 1, 0));
      if (JSON.stringify(piece.colwidth) !== '[200]') bad.push('largeur de la case fusionnée : ' + JSON.stringify(piece.colwidth));
      // Le Word : la case fusionnée porte le trait rouge à gauche et en bas.
      const parts = await h.exportDocxParts(Editor.getHTML());
      const cellsOfB = Array.from(parts.doc.getElementsByTagName('w:tbl'))[1];
      const mergedCell = cellsOfB && Array.from(cellsOfB.getElementsByTagName('w:tc')).find(tc => tc.textContent.includes('B2A'));
      const wordBorders = mergedCell ? Array.from(mergedCell.getElementsByTagName('w:tcBorders')[0] ? mergedCell.getElementsByTagName('w:tcBorders')[0].children : []).map(b => b.nodeName.slice(2) + '=' + b.getAttribute('w:val') + ':' + b.getAttribute('w:color')).join(',') : 'absente';
      if (!/left=single:FF0000/.test(wordBorders) || !/bottom=single:FF0000/.test(wordBorders)) bad.push('traits de la case fusionnée dans le Word : ' + wordBorders);
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== framed) bad.push('un Annuler doit défaire la fusion en entier');
      // Un bloc 2x2 en haut, puis scindé : le pourtour retrouve ses traits, le dedans les siens.
      await sleep(GROUP_GAP_MS);
      await selectCells(1, 0, 0, 1, 1);
      TableMerge.mergeCells(ed());
      await sleep(60);
      const whole = borderLine(1, 0, 0);
      if (whole !== RED + ',' + RED + ',-,' + RED) bad.push('pourtour du bloc 2x2 : ' + whole);
      if (JSON.stringify(cellAttrs(1, 0, 0).colwidth) !== '[200,100]') bad.push('largeurs du bloc 2x2 : ' + JSON.stringify(cellAttrs(1, 0, 0).colwidth));
      await sleep(GROUP_GAP_MS);
      const split = TableMerge.splitCell(ed());
      await sleep(60);
      if (!split || JSON.stringify(lines()) !== JSON.stringify(framedLines)) bad.push('bords après la scission : ' + JSON.stringify(lines()) + ' (attendu ' + JSON.stringify(framedLines) + ')');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ whole, wordBorders }) };
    }),
  });

  cases.push({
    id: 'gridscope_load_undo_and_typing_leave_a_marked_table_alone',
    description: 'Un tableau de document qui porte ses traits n\'est jamais « réparé » en passant : le charger, taper dans une case, supprimer une ligne puis Annuler le laissent exactement comme il était (le HTML enregistré se relit à l\'identique)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await selectCells(1, 0, 0, 2, 1);
      GridEditor.applyBorders(ed(), 'outer', RED);
      setRowHeight(1, 1, 40);
      await sleep(GROUP_GAP_MS);
      const html = Editor.getHTML();
      Editor.setHTML(html);
      await sleep(200);
      if (Editor.getHTML() !== html) bad.push('le HTML relu diffère de celui enregistré');
      const framed = tableJson(1);
      await cursorIn(1, 1, 0);
      ed().commands.insertContent('x');
      await sleep(60);
      if (tableJson(1) === framed) bad.push('la frappe doit changer le texte');
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== framed) bad.push('annuler la frappe doit rendre le tableau exact');
      await sleep(GROUP_GAP_MS);
      await cursorIn(1, 2, 1);
      ed().chain().focus().deleteRow().run();
      await sleep(60);
      if (rowCount(1) !== 2) bad.push('suppression de ligne : ' + rowCount(1));
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== framed) bad.push('annuler la suppression doit rendre le tableau exact');
      // Une case seule porte un trait à gauche : la ligne du milieu, supprimée puis rendue par Annuler, ne doit pas le reprendre (une ligne ajoutée, elle,
      // le reprend ; Annuler rend ce qui était).
      Editor.setHTML(TWO_TABLES);
      await sleep(200);
      await cursorIn(1, 0, 0);
      GridEditor.applyBorders(ed(), 'left', RED);
      await sleep(GROUP_GAP_MS);
      const partial = tableJson(1);
      await cursorIn(1, 1, 0);
      ed().chain().focus().deleteRow().run();
      await sleep(GROUP_GAP_MS);
      await undo();
      if (tableJson(1) !== partial) bad.push('annuler la suppression d\'une ligne vierge ne doit rien lui faire reprendre : ' + borderLine(1, 1, 0));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_lines_added_under_track_changes_are_the_plain_command',
    description: 'Suivi des modifications allumé : ajouter plusieurs lignes se fait comme la commande d\'une ligne (les lignes arrivent, le suivi les voit) et rien d\'autre n\'est écrit dans le tableau (ni trait repris, ni hauteur : ces écritures ne seraient pas suivies)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await selectCells(1, 0, 0, 2, 1);
      GridEditor.applyBorders(ed(), 'outer', RED);
      setRowHeight(1, 2, 50);
      await sleep(GROUP_GAP_MS);
      Editor.setTrackChanges(true);
      await sleep(100);
      await selectCells(1, 1, 0, 2, 1);
      const done = GridEditor.insertLines(ed(), 'addRowAfter');
      await sleep(100);
      const tracked = [3, 4].map(r => ({ line: [0, 1].map(c => borderLine(1, r, c)).join(' '), height: rowAttrs(1, r).rowHeight || null }));
      if (!done || rowCount(1) !== 5) bad.push('lignes sous le suivi : ' + JSON.stringify({ done, rows: rowCount(1) }));
      if (tracked.some(row => row.line !== '-,-,-,- -,-,-,-' || row.height)) bad.push('rien ne devait être repris sous le suivi : ' + JSON.stringify(tracked));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify(tracked) };
    }),
  });

  // === Lot 3 (c) : Entrée descend d'une case (choix « Comme la grille » d'Antoine, 09/10) ===
  const key = (name, options) => {
    const ev = new KeyboardEvent('keydown', Object.assign({ key: name, bubbles: true, cancelable: true }, options || {}));
    ed().view.dom.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const selectedText = () => { const sel = ed().state.selection; return ed().state.doc.textBetween(sel.from, sel.to, ' '); };
  const docJson = () => JSON.stringify(ed().state.doc.toJSON());
  // Le curseur à la fin du texte `text` (le premier trouvé).
  function cursorAtEndOf(text) {
    let at = -1;
    ed().state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text === text) at = pos + node.nodeSize; return at < 0; });
    ed().commands.setTextSelection(at);
    return at;
  }

  cases.push({
    id: 'gridscope_enter_goes_down_one_cell_in_a_document_table',
    description: 'Dans une case d\'un tableau de document, Entrée descend d\'une case (même colonne) comme dans la grille : le document ne change pas (aucun paragraphe ajouté), la case d\'en dessous est sélectionnée, la touche est prise ; des cases choisies : sous la case d\'où la sélection est partie ; sous une case fusionnée sur plusieurs lignes : la case qui suit sa dernière ligne',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 0, 1);
      const before = docJson();
      const handled = key('Enter');
      if (!handled || selectedText() !== 'B2B' || docJson() !== before) bad.push('Entrée depuis B1B : ' + JSON.stringify({ handled, selected: selectedText(), unchanged: docJson() === before }));
      key('Enter');
      if (selectedText() !== 'B3B') bad.push('seconde Entrée : ' + selectedText());
      // Des cases choisies : Entrée repart de la case où la sélection a commencé.
      await selectCells(1, 0, 0, 2, 1);
      const range = !!ed().state.selection.$anchorCell;
      key('Enter');
      if (!range || selectedText() !== 'B2A' || ed().state.selection.$anchorCell) bad.push('cases choisies : ' + JSON.stringify({ range, selected: selectedText() }));
      // Une case fusionnée sur deux lignes : on se range sous sa dernière ligne.
      Editor.setHTML('<table><tbody><tr><td rowspan="2"><p>fus</p></td><td><p>x1</p></td></tr><tr><td><p>x2</p></td></tr><tr><td><p>y1</p></td><td><p>y2</p></td></tr></tbody></table><p>fin</p>');
      await sleep(150);
      ed().commands.focus();
      cursorAtEndOf('fus');
      key('Enter');
      if (selectedText() !== 'y1') bad.push('sous la case fusionnée : ' + selectedText());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_enter_on_the_last_row_of_a_document_table_does_nothing',
    description: 'Sur la dernière ligne d\'un tableau de document, Entrée est prise sans rien faire : ni ligne de tableau ni paragraphe ajoutés, le curseur ne bouge pas ; Maj+Entrée ajoute un retour à la ligne dans la case et ne descend pas',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 2, 0);
      const at = ed().state.selection.from;
      const before = docJson();
      const handled = key('Enter');
      if (!handled || ed().state.selection.from !== at || docJson() !== before) bad.push('Entrée sur la dernière ligne : ' + JSON.stringify({ handled, moved: ed().state.selection.from !== at, unchanged: docJson() === before }));
      // Maj+Entrée : un retour à la ligne dans la même case.
      await cursorIn(1, 0, 0);
      const handledShift = key('Enter', { shiftKey: true });
      const cell = ed().state.doc.nodeAt(cellPos(1, 0, 0));
      let breaks = 0;
      cell.descendants((node) => { if (node.type.name === 'hardBreak') breaks++; });
      if (!handledShift || breaks !== 1 || rowCount(1) !== 3) bad.push('Maj+Entrée : ' + JSON.stringify({ handledShift, breaks, rows: rowCount(1) }));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_enter_keeps_its_meaning_in_a_list_a_code_block_a_quote_and_outside_a_table',
    description: 'Entrée garde son sens quand le texte n\'est pas un paragraphe ou un titre posé directement dans la case : dans une liste elle ajoute un point, dans un bloc de code un retour à la ligne, dans une citation elle coupe son paragraphe ; hors d\'un tableau elle coupe le paragraphe',
    run: async (h) => {
      const bad = [];
      const cellWith = inner => '<p>avant</p><table><tbody><tr><td>' + inner + '</td><td><p>côté</p></td></tr><tr><td><p>bas</p></td><td><p>bas côté</p></td></tr></tbody></table><p>après</p>';
      const count = name => { let n = 0; ed().state.doc.descendants((node) => { if (node.type.name === name) n++; }); return n; };
      await withDoc(h, cellWith('<ul><li><p>un</p></li></ul>'), async () => {
        cursorAtEndOf('un');
        key('Enter');
        if (count('listItem') !== 2 || selectedText() === 'bas') bad.push('liste : ' + JSON.stringify({ items: count('listItem'), selected: selectedText() }));
      });
      await withDoc(h, cellWith('<pre><code>ab</code></pre>'), async () => {
        cursorAtEndOf('ab');
        key('Enter');
        let code = '';
        ed().state.doc.descendants((node) => { if (node.type.name === 'codeBlock') code = node.textContent; });
        if (!/\n/.test(code) || selectedText() === 'bas') bad.push('bloc de code : ' + JSON.stringify(code));
      });
      await withDoc(h, cellWith('<blockquote><p>cite</p></blockquote>'), async () => {
        cursorAtEndOf('cite');
        key('Enter');
        let quoted = 0;
        ed().state.doc.descendants((node) => { if (node.type.name === 'blockquote') quoted = node.childCount; });
        if (quoted !== 2) bad.push('citation : ' + quoted + ' paragraphe(s)');
      });
      await withDoc(h, cellWith('<p>texte</p>'), async () => {
        const paragraphs = () => count('paragraph');
        const n = paragraphs();
        cursorAtEndOf('avant');
        key('Enter');
        if (paragraphs() !== n + 1) bad.push('hors d\'un tableau : ' + (paragraphs() - n) + ' paragraphe(s) de plus');
      });
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'gridscope_enter_in_an_inner_table_stays_in_the_inner_table',
    description: 'Un tableau dans une case : Entrée descend dans le tableau intérieur, et sur sa dernière ligne elle ne fait rien (elle ne saute pas dans la ligne du tableau extérieur)',
    run: async (h) => withDoc(h, '<p>avant</p><table><tbody><tr><td><p>dehors</p>' + tableHtml('N', 2, 1) + '</td></tr><tr><td><p>dessous</p></td></tr></tbody></table><p>après</p>', async () => {
      const bad = [];
      await cursorIn(1, 0, 0);
      key('Enter');
      if (selectedText() !== 'N2A') bad.push('depuis N1A : ' + selectedText());
      const before = docJson();
      const handled = key('Enter');
      if (!handled || selectedText() !== 'N2A' || docJson() !== before) bad.push('dernière ligne du tableau intérieur : ' + JSON.stringify({ handled, selected: selectedText() }));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'gridscope_enter_goes_down_under_track_changes_without_a_suggestion',
    description: 'Suivi des modifications allumé : Entrée descend d\'une case sans rien proposer (la sélection seule bouge)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 0, 0);
      Editor.setTrackChanges(true);
      await sleep(100);
      const before = docJson();
      const handled = key('Enter');
      await sleep(60);
      if (!handled || selectedText() !== 'B2A' || docJson() !== before || Editor.hasPendingTrackedChanges()) bad.push(JSON.stringify({ handled, selected: selectedText(), unchanged: docJson() === before, pending: Editor.hasPendingTrackedChanges() }));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridInDocument = cases;
})();
