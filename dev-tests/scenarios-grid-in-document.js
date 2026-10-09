// Suite "gridInDocument" - les réglages de la grille sur le tableau d'un DOCUMENT (09/10, demande d'Antoine : le module d'insertion de tableau d'un document classique
// devient un tableau du mode grille ; lot 2 sur 6 : la grille « à portée de tableau »). Dans une grille, le modèle n'a qu'un tableau et `GridEditor` le prend en tête du
// document ; dans un document les réglages de la barre du tableau - alignement vertical, bordures, quadrillage - visent le tableau qui porte la sélection (`tableInfo`,
// `scopedTable` de js/grid-editor.js), les autres restent comme ils étaient. Ici, sans bouton (ceux de la barre du tableau sont au groupe floatingToolbars et au script à la
// souris verify-doc-table-tools-mouse.mjs) : les fonctions de `GridEditor` appelées sur l'éditeur d'un document à deux tableaux, un tableau dans une case, un curseur hors des tableaux, le suivi des modifications
// allumé, puis le tableau réglé dans le Word (OOXML dézippé) : « ce que je règle sort pareil ». La grille elle-même (un seul tableau) garde sa suite "grid".
// Lot 3 (b) : `tableSettingsBlocked`, ce qui grise les boutons sous le suivi. Lot 3 (a) : la structure - « Ligne / Colonne avant / après » sur toute la sélection, la ligne ou la colonne ajoutée qui reprend le cadre et la hauteur de sa
// voisine, la fusion et la scission qui gardent le pourtour (`insertLines`, `repairDocumentTables`, `mergeSelected`, `splitSelected`). Lot 3 (c) : Entrée qui descend d'une
// case, comme dans la grille (`enterGoesDown`, `enterCellPos`). Lot 4 (a) : les bandeaux A, B, C / 1, 2, 3 posés par-dessus la page quand le curseur est dans un tableau du premier niveau
// (`documentStrips` : étiquettes, sélection d'une colonne, d'une ligne ou du tableau par un appui, allumage, rien laissé dans la page hors d'un tableau) ; leur place à l'écran est mesurée par
// dev-tests/verify-doc-strips-mouse.mjs (groupe docStripsMouse).
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

  // ---------- Lot 4 (a) : les bandeaux d'un tableau de document ----------
  const STRIPS = '.pp-doc-strips';
  const stripCount = () => document.querySelectorAll(STRIPS).length;
  const stripsShown = () => { const root = document.querySelector(STRIPS); return !!root && !root.hidden && getComputedStyle(root).display !== 'none'; };
  const stripLabels = kind => Array.from(document.querySelectorAll(STRIPS + ' .v2-grid-' + kind + 'head')).map(head => head.textContent).join('');
  const litHeads = kind => Array.from(document.querySelectorAll(STRIPS + ' .v2-grid-' + kind + 'head')).map((head, i) => (head.classList.contains('sel') ? i : -1)).filter(i => i >= 0).join(',');
  const stripsNow = () => JSON.stringify([stripCount(), stripsShown(), stripLabels('col'), stripLabels('row')]);
  // Un appui sur un bandeau, comme le pointeur le ferait (au centre de la lettre, du numéro ou du coin).
  function pressStrip(selector, extra) {
    const node = document.querySelector(selector);
    if (!node) throw new Error('bandeau introuvable : ' + selector);
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }, extra || {})));
  }
  const selectedCellTexts = () => { const out = []; const sel = ed().state.selection; if (sel.forEachCell) sel.forEachCell(node => out.push(node.textContent)); return out.join(','); };
  async function cursorInParagraph(text) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && node.type.name === 'paragraph' && node.textContent === text) found = pos + 1; return found == null; });
    ed().commands.setTextSelection(found);
    await sleep(150);
  }
  const colHead = n => STRIPS + ' .v2-grid-colhead:nth-child(' + n + ')';
  const rowHead = n => STRIPS + ' .v2-grid-rowhead:nth-child(' + n + ')';

  cases.push({
    id: 'docstrips_follow_the_cursor_in_a_top_level_table_and_leave_nothing_behind',
    description: 'Le curseur dans un tableau du premier niveau : les lettres et les numéros de CE tableau, en un seul jeu ; dans l\'autre tableau, ils le suivent ; hors des tableaux, la page n\'en garde aucun (ni caché ni vide)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorInParagraph('avant');
      if (stripCount()) bad.push('curseur hors tableau : ' + stripsNow());
      await cursorIn(0, 0, 0);
      if (stripCount() !== 1 || !stripsShown() || stripLabels('col') !== 'AB' || stripLabels('row') !== '12') bad.push('tableau A : ' + stripsNow());
      await cursorIn(1, 2, 1);
      if (stripCount() !== 1 || !stripsShown() || stripLabels('col') !== 'AB' || stripLabels('row') !== '123') bad.push('tableau B : ' + stripsNow());
      await cursorInParagraph('entre');
      if (stripCount()) bad.push('entre les tableaux : ' + stripsNow());
      await cursorIn(0, 1, 1);
      await cursorInParagraph('après');
      if (stripCount()) bad.push('sous les tableaux : ' + stripsNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_none_for_a_table_in_a_cell_or_in_a_column',
    description: 'Pas de bandeaux pour un tableau posé dans une case ni dans une colonne (la place manque) ; le tableau extérieur, lui, garde les siens depuis sa case voisine',
    run: async (h) => {
      const bad = [];
      await withDoc(h, '<p>avant</p><table><tbody><tr><td><p>dehors</p>' + tableHtml('N', 2, 2) + '</td><td><p>voisine</p></td></tr></tbody></table><p>après</p>', async () => {
        await cursorIn(1, 0, 0);
        if (stripCount()) bad.push('tableau dans une case : ' + stripsNow());
        await cursorIn(0, 0, 1);
        if (!stripsShown() || stripLabels('col') !== 'AB' || stripLabels('row') !== '1') bad.push('tableau extérieur : ' + stripsNow());
      });
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await sleep(60);
      const column = h.tiptap().querySelector('.two-columns-column');
      await h.focusInElement(column.querySelector('p') || column);
      await h.clickButton('v2-btn-table');
      await sleep(250);
      if (!h.tiptap().querySelector('.two-columns-column table')) bad.push('le tableau n\'est pas dans la colonne');
      else if (stripCount()) bad.push('tableau dans une colonne : ' + stripsNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'docstrips_click_a_letter_a_number_or_the_corner_to_choose_cells',
    description: 'Un appui sur une lettre choisit la colonne, sur un numéro la ligne, sur le coin tout le tableau ; Maj étend ; l\'éditeur garde le focus et les bandeaux restent',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 0, 0);
      pressStrip(colHead(2));
      await sleep(150);
      if (selectedCellTexts() !== 'B1B,B2B,B3B' || !ed().view.hasFocus() || !stripsShown()) bad.push('lettre B : ' + JSON.stringify([selectedCellTexts(), ed().view.hasFocus(), stripsShown()]));
      pressStrip(rowHead(2));
      await sleep(150);
      if (selectedCellTexts() !== 'B2A,B2B') bad.push('numéro 2 : ' + selectedCellTexts());
      pressStrip(rowHead(3), { shiftKey: true });
      await sleep(150);
      if (selectedCellTexts() !== 'B2A,B2B,B3A,B3B') bad.push('Maj + numéro 3 : ' + selectedCellTexts());
      pressStrip(colHead(1));
      await sleep(150);
      pressStrip(colHead(2), { shiftKey: true });
      await sleep(150);
      if (selectedCellTexts().split(',').length !== 6) bad.push('lettre A puis Maj + lettre B : ' + selectedCellTexts());
      pressStrip(STRIPS + ' .v2-grid-corner');
      await sleep(150);
      if (selectedCellTexts().split(',').length !== 6 || litHeads('col') !== '0,1' || litHeads('row') !== '0,1,2') bad.push('coin : ' + JSON.stringify([selectedCellTexts(), litHeads('col'), litHeads('row')]));
      // Les cases choisies sont celles du tableau B : le tableau A n'a pas bougé.
      const otherCells = tablesOf()[0].node.textContent;
      if (otherCells !== 'A1AA1BA2AA2B') bad.push('tableau A : ' + otherCells);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_light_up_the_columns_and_rows_the_selection_covers',
    description: 'Les lettres et les numéros des cases touchées par le curseur ou par la sélection s\'allument, comme dans la grille',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 1, 1);
      if (litHeads('col') !== '1' || litHeads('row') !== '1') bad.push('curseur : ' + JSON.stringify([litHeads('col'), litHeads('row')]));
      await selectCells(1, 0, 0, 1, 1);
      if (litHeads('col') !== '0,1' || litHeads('row') !== '0,1') bad.push('quatre cases : ' + JSON.stringify([litHeads('col'), litHeads('row')]));
      await selectCells(1, 2, 0, 2, 1);
      if (litHeads('col') !== '0,1' || litHeads('row') !== '2') bad.push('dernière ligne : ' + JSON.stringify([litHeads('col'), litHeads('row')]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_follow_a_structure_change_and_hide_when_the_editor_loses_focus',
    description: 'Une ligne ajoutée ou retirée : un numéro de plus ou de moins ; l\'éditeur sans focus : plus aucun bandeau, et ils reviennent avec lui',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(0, 1, 0);
      ed().chain().focus().addRowAfter().run();
      await sleep(200);
      if (stripLabels('row') !== '123' || stripLabels('col') !== 'AB') bad.push('ligne de plus : ' + stripsNow());
      await undo();
      await sleep(150);
      if (stripLabels('row') !== '12') bad.push('annulé : ' + stripsNow());
      ed().chain().focus().addColumnAfter().run();
      await sleep(200);
      if (stripLabels('col') !== 'ABC') bad.push('colonne de plus : ' + stripsNow());
      ed().commands.blur();
      await sleep(200);
      if (stripCount()) bad.push('sans focus : ' + stripsNow());
      ed().commands.focus();
      await sleep(200);
      if (!stripsShown() || stripLabels('col') !== 'ABC') bad.push('focus rendu : ' + stripsNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_stay_with_track_changes_and_choosing_changes_nothing',
    description: 'Suivi des modifications allumé : les bandeaux sont là, une lettre choisit sa colonne et le document ne change pas (aucune suggestion)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 0, 0);
      Editor.setTrackChanges(true);
      await sleep(100);
      const before = docJson();
      pressStrip(colHead(2));
      await sleep(150);
      if (!stripsShown() || selectedCellTexts() !== 'B1B,B2B,B3B' || docJson() !== before || Editor.hasPendingTrackedChanges()) bad.push(JSON.stringify({ shown: stripsShown(), selected: selectedCellTexts(), unchanged: docJson() === before, pending: Editor.hasPendingTrackedChanges() }));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_offset_keeps_the_table_bar_off_the_letters',
    description: 'La barre du tableau laisse la hauteur des lettres libre au-dessus du tableau quand elles se montrent, et 0 sinon (hors d\'un tableau, tableau dans une case, éditeur sans focus)',
    run: async (h) => withDoc(h, '<p>avant</p>' + tableHtml('A', 2, 2) + '<p>entre</p><table><tbody><tr><td><p>dehors</p>' + tableHtml('N', 2, 2) + '</td></tr></tbody></table><p>après</p>', async () => {
      const bad = [];
      const strip = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-strip-h')) || 22;
      await cursorInParagraph('avant');
      if (GridEditor.documentStripsOffset() !== 0) bad.push('hors tableau : ' + GridEditor.documentStripsOffset());
      await cursorIn(0, 0, 0);
      if (GridEditor.documentStripsOffset() !== strip) bad.push('dans le tableau : ' + GridEditor.documentStripsOffset() + ' pour ' + strip);
      await cursorIn(2, 0, 0);
      if (GridEditor.documentStripsOffset() !== 0) bad.push('tableau dans une case : ' + GridEditor.documentStripsOffset());
      await cursorIn(0, 0, 0);
      ed().commands.blur();
      await sleep(100);
      if (GridEditor.documentStripsOffset() !== 0) bad.push('sans focus : ' + GridEditor.documentStripsOffset());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // ---------- Lot 4 (b) : la hauteur d'une ligne, réglée par la poignée de son numéro ----------
  // Le glissé d'une poignée de numéro avec des évènements de pointeur simulés (le vrai pointeur, la capture et le curseur sont au script docStripsResizeMouse) : l'appui sur la poignée,
  // un déplacement de `dy` px, `during` regarde la page en plein glissé, puis le relâcher.
  async function dragRowHandle(n, dy, during, release = true) {
    const selector = rowHead(n) + ' .v2-grid-handle';
    const handle = document.querySelector(selector);
    if (!handle) throw new Error('poignée introuvable : numéro ' + n + ' parmi ' + stripLabels('row'));
    const r = handle.getBoundingClientRect();
    const point = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 + dy, pointerId: 1, isPrimary: true };
    pressStrip(selector);
    document.dispatchEvent(new PointerEvent('pointermove', point));
    await sleep(60);
    const mid = during ? await during() : null;
    if (release) { document.dispatchEvent(new PointerEvent('pointerup', point)); await sleep(200); }
    return mid;
  }
  const docTables = () => Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  const rowRects = table => Array.from(table.querySelectorAll(':scope > tbody > tr')).map(tr => tr.getBoundingClientRect().height);
  const tipNow = () => { const t = document.querySelector('.v2-grid-tip'); return t ? t.textContent : null; };
  // Rien ne reste d'un glissé : la marque du tableau, la feuille d'aperçu, la bulle, le curseur de glissé.
  const dragLeftovers = () => ({ marked: document.querySelectorAll('[data-pp-sizing]').length, preview: !!document.getElementById('pp-grid-resize-preview'), tip: !!document.querySelector('.v2-grid-tip'), cursor: document.body.classList.contains('pp-grid-resizing-row') });
  const clean = left => !left.marked && !left.preview && !left.tip && !left.cursor;
  const rowHeights = t => Array.from({ length: rowCount(t) }, (_, r) => rowAttrs(t, r).rowHeight || null);

  cases.push({
    id: 'docstrips_numbers_carry_a_height_handle_and_letters_none_yet',
    description: 'Chaque numéro des bandeaux d\'un tableau de document porte sa poignée de hauteur (une ligne de plus : une poignée de plus), les lettres n\'en ont pas encore (la largeur d\'une colonne se règle par le bord de ses cases) ; le survol de la poignée dit « Régler la hauteur de la ligne »',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      const handles = kind => Array.from(document.querySelectorAll(STRIPS + ' .v2-grid-' + kind + 'head')).map(head => head.querySelectorAll('.v2-grid-handle').length).join(',');
      await cursorIn(1, 0, 0);
      if (handles('row') !== '1,1,1' || handles('col') !== '0,0') bad.push('tableau B : numéros ' + handles('row') + ', lettres ' + handles('col'));
      await cursorIn(0, 0, 0);
      if (handles('row') !== '1,1' || handles('col') !== '0,0') bad.push('tableau A : numéros ' + handles('row') + ', lettres ' + handles('col'));
      ed().chain().focus().addRowAfter().run();
      await sleep(200);
      if (handles('row') !== '1,1,1') bad.push('ligne de plus : numéros ' + handles('row'));
      await undo();
      const title = (document.querySelector(rowHead(1) + ' .v2-grid-handle') || {}).title;
      if (title !== I18n.t('grid.resizeRow')) bad.push('info-bulle de la poignée : ' + title);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'docstrips_dragging_a_number_sets_that_row_height_in_layout_pixels_and_word_follows',
    description: 'Tirer la poignée du numéro 2 du tableau B (deux tableaux) : la bulle dit la hauteur en centimètres, la ligne suit en direct (le tableau A garde ses lignes), le document ne bouge qu\'au relâcher, puis UNE transaction pose la hauteur en pixels de mise en page sur cette ligne seule (un seul Annuler) ; le Word écrit un <w:trHeight> « au moins » pour cette ligne et pour elle seule',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 1, 0);
      const [tableA, tableB] = docTables();
      const zoom = EditorCore.layoutZoom(tableB);
      const aBefore = rowRects(tableA);
      const bBefore = rowRects(tableB);
      const before = docJson();
      const DY = 60;
      const expected = Math.round(bBefore[1] / zoom + DY / zoom);
      const expectedTip = PageLayout.cmText(expected * 25.4 / 96) + ' cm';
      const mid = await dragRowHandle(2, DY, async () => ({
        tip: tipNow(), rows: rowRects(tableB), a: rowRects(tableA), json: docJson(), marked: docTables().map(t => t.hasAttribute('data-pp-sizing')).join(),
        preview: (document.getElementById('pp-grid-resize-preview') || {}).textContent || '', cursor: document.body.classList.contains('pp-grid-resizing-row'),
      }));
      if (mid.tip !== expectedTip) bad.push('bulle : ' + mid.tip + ' pour ' + expectedTip);
      if (Math.abs(mid.rows[1] - expected * zoom) > 0.8 || Math.abs(mid.rows[0] - bBefore[0]) > 0.3 || Math.abs(mid.rows[2] - bBefore[2]) > 0.3) bad.push('lignes de B en plein glissé : ' + JSON.stringify({ avant: bBefore, pendant: mid.rows, expected }));
      if (mid.a.some((height, i) => Math.abs(height - aBefore[i]) > 0.3)) bad.push('le tableau A a bougé en plein glissé : ' + JSON.stringify({ avant: aBefore, pendant: mid.a }));
      if (mid.json !== before || mid.marked !== 'false,true' || !mid.cursor || !/table\[data-pp-sizing\] > tbody > tr:nth-child\(2\)/.test(mid.preview)) bad.push('en plein glissé : ' + JSON.stringify({ documentInchange: mid.json === before, marked: mid.marked, cursor: mid.cursor, preview: mid.preview }));
      const left = dragLeftovers();
      if (!clean(left)) bad.push('rien ne devait rester du glissé : ' + JSON.stringify(left));
      const heightsB = rowHeights(1);
      const heightsA = rowHeights(0);
      if (JSON.stringify(heightsB) !== JSON.stringify([null, expected, null]) || heightsA.some(v => v !== null)) bad.push('hauteurs posées : B ' + JSON.stringify(heightsB) + ', A ' + JSON.stringify(heightsA) + ' (attendu B ' + expected + ' sur la ligne 2)');
      const html = Editor.getHTML();
      if (!html.includes('data-row-height="' + expected + '"') || (html.match(/data-row-height/g) || []).length !== 1) bad.push('HTML : ' + (html.match(/data-row-height="\d+"/g) || []).join());
      const afterB = rowRects(docTables()[1]);
      if (Math.abs(afterB[1] - expected * zoom) > 0.8) bad.push('ligne 2 après le relâcher : ' + afterB[1] + ' pour ' + expected * zoom);
      // Le Word : un <w:trHeight> « au moins » (15 twips par pixel) sur la ligne 2 du second tableau, aucun ailleurs.
      const parts = await h.exportDocxParts(html);
      const word = Array.from(parts.doc.getElementsByTagName('w:tbl')).map(tbl => Array.from(tbl.getElementsByTagName('w:tr')).map((tr) => {
        const node = tr.getElementsByTagName('w:trHeight')[0];
        return node ? node.getAttribute('w:val') + ':' + node.getAttribute('w:hRule') : '-';
      }).join());
      const wantedWord = ['-,-', '-,' + expected * 15 + ':atLeast,-'];
      if (JSON.stringify(word) !== JSON.stringify(wantedWord)) bad.push('Word : ' + JSON.stringify(word) + ' (attendu ' + JSON.stringify(wantedWord) + ')');
      await undo();
      if (rowHeights(1).some(v => v !== null)) bad.push('un Annuler doit rendre la ligne : ' + JSON.stringify(rowHeights(1)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ expected, tip: mid.tip, word }) };
    }),
  });

  cases.push({
    id: 'docstrips_row_drag_stops_at_the_text_height_escape_cancels_and_chosen_rows_share_one_height',
    description: 'Une ligne ne descend pas sous la hauteur de son texte (tirée jusqu\'en haut, elle s\'arrête là) ; Échap annule le glissé sans rien laisser ; des lignes choisies par leurs numéros prennent toutes la hauteur de la poignée tirée (un seul Annuler)',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      await cursorIn(1, 1, 0);
      const zoom = EditorCore.layoutZoom(docTables()[1]);
      const natural = rowRects(docTables()[1])[1] / zoom;
      await dragRowHandle(2, 80);
      const tall = rowHeights(1)[1];
      await sleep(GROUP_GAP_MS);
      await dragRowHandle(2, -500);
      const floor = rowHeights(1)[1];
      if (!(tall > natural + 30) || floor == null || floor < Math.floor(natural) || floor > Math.ceil(natural) + 1) bad.push('plancher : haute ' + tall + ', tirée en haut ' + floor + ', texte ' + Math.round(natural * 10) / 10);
      await sleep(GROUP_GAP_MS);
      await undo();
      await undo();
      if (rowHeights(1).some(v => v !== null)) bad.push('deux Annuler devaient tout rendre : ' + JSON.stringify(rowHeights(1)));
      // Échap en plein glissé.
      const docBefore = docJson();
      const rowsBefore = rowRects(docTables()[1]);
      const midEscape = await dragRowHandle(2, 50, async () => rowRects(docTables()[1]), false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
      await sleep(250);
      const left = dragLeftovers();
      if (!(midEscape[1] > rowsBefore[1] + 20) || docJson() !== docBefore || !clean(left) || Math.abs(rowRects(docTables()[1])[1] - rowsBefore[1]) > 0.5) bad.push('Échap : ' + JSON.stringify({ avant: rowsBefore, pendant: midEscape, apres: rowRects(docTables()[1]), documentInchange: docJson() === docBefore, left }));
      // Les trois lignes de B choisies par leurs numéros : tirer le bas de la troisième les règle toutes à la même hauteur.
      await sleep(GROUP_GAP_MS);
      await selectCells(1, 0, 0, 2, 1);
      const rows3 = rowRects(docTables()[1]);
      const expected = Math.round(rows3[2] / zoom + 30 / zoom);
      await dragRowHandle(3, 30);
      if (rowHeights(1).some(v => v !== expected)) bad.push('trois lignes choisies : ' + JSON.stringify(rowHeights(1)) + ' (attendu ' + expected + ' partout)');
      await sleep(GROUP_GAP_MS);
      await undo();
      if (rowHeights(1).some(v => v !== null)) bad.push('un Annuler devait rendre les trois lignes : ' + JSON.stringify(rowHeights(1)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ tall, floor, natural: Math.round(natural * 10) / 10, expected }) };
    }),
  });

  cases.push({
    id: 'docstrips_row_drag_in_a_table_with_a_nested_table_sets_the_outer_row_only',
    description: 'Tableau posé dans une case : tirer le numéro de la ligne 1 du tableau extérieur règle cette ligne et pas celle du tableau intérieur, ni pendant le glissé ni après (le glissé ne vise que le tableau des bandeaux)',
    run: async (h) => withDoc(h, '<p>avant</p><table><tbody><tr><td><p>dehors</p>' + tableHtml('N', 2, 2) + '</td><td><p>voisine</p></td></tr><tr><td><p>bas</p></td><td><p>bas droite</p></td></tr></tbody></table><p>après</p>', async () => {
      const bad = [];
      await cursorIn(0, 0, 1);
      const innerHeights = () => Array.from(document.querySelectorAll('.tiptap table table tr')).map(tr => tr.getBoundingClientRect().height);
      const inner0 = innerHeights();
      const outerNames = stripLabels('row');
      const mid = await dragRowHandle(1, 40, async () => ({ inner: innerHeights(), outer: rowRects(docTables()[0]) }));
      if (outerNames !== '12') bad.push('numéros du tableau extérieur : ' + outerNames);
      if (mid.inner.some((height, i) => Math.abs(height - inner0[i]) > 0.3)) bad.push('tableau intérieur en plein glissé : ' + JSON.stringify({ avant: inner0, pendant: mid.inner }));
      if (JSON.stringify(rowHeights(0)).replace(/[0-9]+/, 'N') !== '[N,null]' || rowHeights(1).some(v => v !== null)) bad.push('hauteurs posées : extérieur ' + JSON.stringify(rowHeights(0)) + ', intérieur ' + JSON.stringify(rowHeights(1)));
      if (innerHeights().some((height, i) => Math.abs(height - inner0[i]) > 0.3)) bad.push('tableau intérieur après le relâcher : ' + JSON.stringify({ avant: inner0, apres: innerHeights() }));
      if (!clean(dragLeftovers())) bad.push('restes : ' + JSON.stringify(dragLeftovers()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // ---------- « Égaliser » : la hauteur des lignes, la largeur des colonnes que les cases choisies couvrent prennent leur moyenne ----------
  // Les tailles de chaque ligne et de chaque colonne du tableau de rang `t`, en pixels de mise en page (le rendu, divisé par la réduction de la feuille).
  const layoutSizes = (t) => {
    const table = docTables()[t];
    const zoom = EditorCore.layoutZoom(table);
    return {
      // Sous le suivi des modifications une ligne proposée est enveloppée d'un <span> dans le <tbody>.
      rows: Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tbody > span > tr')).map(tr => Math.round(tr.getBoundingClientRect().height / zoom * 10) / 10),
      cols: Array.from(table.querySelectorAll(':scope > colgroup > col')).map(col => Math.round(col.getBoundingClientRect().width / zoom * 10) / 10),
    };
  };
  const colWidths = t => tablesOf()[t].node.child(0).content.content.map(cell => (cell.attrs.colwidth || [null])[0]);
  function setRowHeights(t, list) { list.forEach((px, row) => setRowHeight(t, row, px)); }
  // Trois colonnes aux largeurs réglées (140, 190, 120 px), trois lignes.
  const SIZED = '<p>avant</p><table><tbody>' + [1, 2, 3].map(r => '<tr>' + [140, 190, 120].map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${r}</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>après</p>';

  cases.push({
    id: 'equalize_rows_gives_the_chosen_rows_their_mean_height_in_one_undo',
    description: 'Trois lignes de 40, 80 et 160 px choisies (un tableau parmi deux) : « Égaliser » leur donne à toutes la moyenne (93 px) en une seule transaction ; l\'autre tableau ne bouge pas ; le HTML et le Word reprennent la hauteur ; un Annuler rend les trois hauteurs ; sans deux lignes choisies (curseur, une seule ligne) rien ne se passe',
    run: async (h) => withDoc(h, TWO_TABLES, async () => {
      const bad = [];
      setRowHeights(1, [40, 80, 160]);
      await sleep(GROUP_GAP_MS);
      await cursorIn(1, 1, 0);
      if (GridEditor.canEqualize(ed(), 'row') || GridEditor.canEqualize(ed(), 'col') || GridEditor.equalizeLines(ed(), 'row')) bad.push('un curseur ne couvre rien à égaliser');
      await selectCells(1, 1, 0, 1, 1);
      if (GridEditor.canEqualize(ed(), 'row') || !GridEditor.canEqualize(ed(), 'col')) bad.push('une ligne choisie : ' + JSON.stringify([GridEditor.canEqualize(ed(), 'row'), GridEditor.canEqualize(ed(), 'col')]));
      const same = docJson();
      if (GridEditor.equalizeLines(ed(), 'row') || docJson() !== same) bad.push('une seule ligne choisie : rien ne doit changer');
      await selectCells(1, 0, 0, 2, 1);
      if (!GridEditor.canEqualize(ed(), 'row')) bad.push('trois lignes choisies : égalisable');
      const before = layoutSizes(1).rows;
      const mean = Math.round(before.reduce((a, b) => a + b, 0) / before.length);
      await sleep(GROUP_GAP_MS);
      if (!GridEditor.equalizeLines(ed(), 'row')) bad.push('equalizeLines devait réussir');
      await sleep(100);
      if (JSON.stringify(rowHeights(1)) !== JSON.stringify([mean, mean, mean]) || mean !== 93) bad.push('hauteurs posées : ' + JSON.stringify(rowHeights(1)) + ' (attendu 93 partout, mesuré ' + JSON.stringify(before) + ')');
      if (rowHeights(0).some(v => v !== null)) bad.push('l\'autre tableau a bougé : ' + JSON.stringify(rowHeights(0)));
      if (layoutSizes(1).rows.some(v => Math.abs(v - mean) > 0.6)) bad.push('rendu : ' + JSON.stringify(layoutSizes(1).rows));
      if (!ed().state.selection.$anchorCell || tablesOf()[1].node.childCount !== 3) bad.push('la sélection de cases doit rester');
      const html = Editor.getHTML();
      if ((html.match(/data-row-height="93"/g) || []).length !== 3) bad.push('HTML : ' + (html.match(/data-row-height="\d+"/g) || []).join());
      const parts = await h.exportDocxParts(html);
      const word = Array.from(parts.doc.getElementsByTagName('w:tbl')).map(tbl => Array.from(tbl.getElementsByTagName('w:tr')).map((tr) => {
        const node = tr.getElementsByTagName('w:trHeight')[0];
        return node ? node.getAttribute('w:val') + ':' + node.getAttribute('w:hRule') : '-';
      }).join());
      const wantedWord = ['-,-', '1395:atLeast,1395:atLeast,1395:atLeast'];
      if (JSON.stringify(word) !== JSON.stringify(wantedWord)) bad.push('Word : ' + JSON.stringify(word) + ' (attendu ' + JSON.stringify(wantedWord) + ')');
      await undo();
      if (JSON.stringify(rowHeights(1)) !== '[40,80,160]') bad.push('un Annuler devait rendre [40,80,160] : ' + JSON.stringify(rowHeights(1)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ avant: before, moyenne: mean, word }) };
    }),
  });

  cases.push({
    id: 'equalize_measures_in_page_pixels_when_the_sheet_is_shrunk_on_screen',
    description: 'La feuille réduite à l\'écran (0,8, comme dans un panneau étroit) : des lignes de 40, 80 et 160 px prennent la moyenne en pixels de MISE EN PAGE (93 px, rendus 74,4 à l\'écran) et non celle de l\'écran (74), des colonnes de 140, 190 et 120 px prennent 150 px (non 120) : sans la division par le facteur de la feuille chaque appui réduirait le tableau',
    run: async (h) => {
      const bad = [];
      const wasA4 = document.getElementById('editor-container').classList.contains('a4-preview');
      // Le facteur se pose sur la feuille elle-même (le conteneur le réécrit à chaque rafraîchissement de la mise en page), et ne compte qu'avec l'Aperçu A4.
      try {
        await withDoc(h, SIZED, async () => {
          h.setA4Preview(true);
          ed().view.dom.closest('.v2-page-sheet').style.setProperty('--pp-fit-zoom', '0.8');
          await sleep(250);
          const zoom = EditorCore.layoutZoom(docTables()[0]);
          if (Math.abs(zoom - 0.8) > 0.01) { bad.push('la feuille devait être réduite à 0,8 : ' + zoom); return; }
          setRowHeights(0, [40, 80, 160]);
          await sleep(GROUP_GAP_MS);
          await selectCells(0, 0, 0, 2, 2);
          GridEditor.equalizeLines(ed(), 'row');
          await sleep(150);
          if (JSON.stringify(rowHeights(0)) !== '[93,93,93]') bad.push('hauteurs posées : ' + JSON.stringify(rowHeights(0)) + ' (attendu 93 partout, la moyenne en pixels de mise en page)');
          const onScreen = Array.from(docTables()[0].querySelectorAll(':scope > tbody > tr')).map(tr => tr.getBoundingClientRect().height);
          if (onScreen.some(v => Math.abs(v - 93 * 0.8) > 0.8)) bad.push('rendu à l\'écran : ' + JSON.stringify(onScreen) + ' (attendu ' + (93 * 0.8) + ')');
          await undo();
          await sleep(GROUP_GAP_MS);
          GridEditor.equalizeLines(ed(), 'col');
          await sleep(150);
          if (JSON.stringify(colWidths(0)) !== '[150,150,150]') bad.push('largeurs posées : ' + JSON.stringify(colWidths(0)) + ' (attendu 150 partout)');
          const cols = layoutSizes(0).cols;
          if (cols.some(v => Math.abs(v - 150) > 0.8)) bad.push('rendu des colonnes en pixels de mise en page : ' + JSON.stringify(cols));
        });
      } finally {
        const sheet = ed().view.dom.closest('.v2-page-sheet');
        if (sheet) sheet.style.removeProperty('--pp-fit-zoom');
        h.setA4Preview(wasA4);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'equalize_columns_gives_the_chosen_columns_their_mean_width_and_keeps_the_table_width',
    description: 'Trois colonnes de 140, 190 et 120 px choisies : « Égaliser » leur donne la moyenne (150 px) en une seule transaction, la largeur du tableau ne change pas (la somme est conservée) ; une case fusionnée sur deux colonnes reçoit les deux parts ; deux colonnes sur trois : la troisième garde sa largeur ; un Annuler rend les largeurs',
    run: async (h) => withDoc(h, SIZED, async () => {
      const bad = [];
      await cursorIn(0, 1, 1);
      await selectCells(0, 0, 0, 2, 2);
      if (!GridEditor.canEqualize(ed(), 'col')) bad.push('trois colonnes choisies : égalisables');
      const before = layoutSizes(0);
      await sleep(GROUP_GAP_MS);
      GridEditor.equalizeLines(ed(), 'col');
      await sleep(100);
      const widths = [0, 1, 2].map(r => JSON.stringify(Array.from({ length: 3 }, (_, c) => cellAttrs(0, r, c).colwidth)));
      if (widths.some(w => w !== '[[150],[150],[150]]')) bad.push('largeurs posées : ' + widths.join(' '));
      const after = layoutSizes(0);
      if (after.cols.some(v => Math.abs(v - 150) > 0.6) || Math.abs(after.cols.reduce((a, b) => a + b, 0) - before.cols.reduce((a, b) => a + b, 0)) > 1.5) bad.push('rendu : avant ' + JSON.stringify(before.cols) + ', après ' + JSON.stringify(after.cols));
      await undo();
      if (JSON.stringify(colWidths(0)) !== '[140,190,120]') bad.push('un Annuler devait rendre [140,190,120] : ' + JSON.stringify(colWidths(0)));
      // Deux colonnes sur trois (A et B) : leur moyenne (165), C garde la sienne.
      await sleep(GROUP_GAP_MS);
      await selectCells(0, 0, 0, 2, 1);
      GridEditor.equalizeLines(ed(), 'col');
      await sleep(100);
      if (JSON.stringify(colWidths(0)) !== '[165,165,120]') bad.push('deux colonnes sur trois : ' + JSON.stringify(colWidths(0)) + ' (attendu [165,165,120])');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ avant: before.cols, apres: after.cols }) };
    }),
  });

  cases.push({
    id: 'equalize_merged_cell_gets_both_shares_and_auto_columns_are_measured',
    description: 'Une case fusionnée sur deux colonnes reçoit les parts des deux colonnes égalisées ; des colonnes automatiques (sans largeur posée) sont égalisées sur leur largeur de mise en page, la colonne laissée garde la sienne et le tableau garde sa largeur',
    run: async (h) => {
      const bad = [];
      await withDoc(h, '<p>avant</p><table><tbody><tr><td colspan="2" colwidth="100,200"><p>Fusion</p></td><td colwidth="90"><p>C1</p></td></tr><tr><td colwidth="100"><p>A2</p></td><td colwidth="200"><p>B2</p></td><td colwidth="90"><p>C2</p></td></tr></tbody></table>', async () => {
        // Une case fusionnée sur deux colonnes, choisie seule, n'est pas « plusieurs colonnes choisies » (la règle de `chosenLines`) : rien à égaliser.
        await selectCells(0, 0, 0, 0, 0);
        const lone = docJson();
        if (GridEditor.canEqualize(ed(), 'col') || GridEditor.equalizeLines(ed(), 'col') || docJson() !== lone) bad.push('une case fusionnée choisie seule ne doit rien égaliser');
        await sleep(GROUP_GAP_MS);
        await selectCells(0, 1, 0, 1, 2);
        GridEditor.equalizeLines(ed(), 'col');
        await sleep(100);
        const merged = JSON.stringify(cellAttrs(0, 0, 0).colwidth), second = JSON.stringify([cellAttrs(0, 1, 0).colwidth, cellAttrs(0, 1, 1).colwidth, cellAttrs(0, 1, 2).colwidth]);
        if (merged !== '[130,130]' || second !== '[[130],[130],[130]]') bad.push('fusionnée ' + merged + ', seconde ligne ' + second);
      });
      await withDoc(h, '<p>avant</p>' + tableHtml('Z', 2, 3), async () => {
        const before = layoutSizes(0);
        await selectCells(0, 0, 0, 1, 1);
        GridEditor.equalizeLines(ed(), 'col');
        await sleep(300);
        const after = layoutSizes(0);
        if (Math.abs(after.cols[0] - after.cols[1]) > 1.5 || Math.abs(after.cols[2] - before.cols[2]) > 1.5 || Math.abs(after.cols.reduce((a, b) => a + b, 0) - before.cols.reduce((a, b) => a + b, 0)) > 2.5) bad.push('colonnes automatiques : avant ' + JSON.stringify(before.cols) + ', après ' + JSON.stringify(after.cols));
      });
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'equalize_rows_never_goes_below_the_text_height',
    description: 'Une ligne dont le texte est plus haut que la moyenne ne peut pas descendre : toutes les lignes choisies prennent alors sa hauteur (égales plutôt qu\'à la moyenne), le texte n\'est jamais rogné ; la moyenne est celle des hauteurs rendues (une hauteur posée plus basse que le texte compte pour celle du texte)',
    run: async (h) => withDoc(h, '<p>avant</p><table><tbody><tr><td><p>' + 'mot '.repeat(70) + '</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr><tr><td><p>A3</p></td><td><p>B3</p></td></tr></tbody></table>', async () => {
      const bad = [];
      const natural = layoutSizes(0).rows;
      await selectCells(0, 0, 0, 2, 1);
      GridEditor.equalizeLines(ed(), 'row');
      await sleep(150);
      const set = rowHeights(0);
      const after = layoutSizes(0).rows;
      if (new Set(set).size !== 1 || set[0] < natural[0] - 0.5 || set[0] > natural[0] + 1.5 || after.some(v => Math.abs(v - set[0]) > 0.6)) bad.push('lignes : texte ' + JSON.stringify(natural) + ', posées ' + JSON.stringify(set) + ', rendu ' + JSON.stringify(after));
      await undo();
      await sleep(GROUP_GAP_MS);
      // Les lignes 2 et 3 : 10 px posés (sous le texte, qui en fait ~29) et 70 px. La moyenne est celle du rendu.
      setRowHeight(0, 1, 10);
      setRowHeight(0, 2, 70);
      await sleep(GROUP_GAP_MS);
      await selectCells(0, 1, 0, 2, 1);
      const rendered = layoutSizes(0).rows;
      const mean = Math.round((rendered[1] + rendered[2]) / 2);
      GridEditor.equalizeLines(ed(), 'row');
      await sleep(150);
      const h2 = rowHeights(0);
      if (h2[0] !== null || Math.abs(h2[1] - mean) > 1 || h2[1] !== h2[2]) bad.push('lignes 2 et 3 : ' + JSON.stringify(h2) + ' (rendu avant ' + JSON.stringify(rendered) + ', moyenne ' + mean + ')');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ natural, set, h2 }) };
    }),
  });

  cases.push({
    id: 'equalize_with_track_changes_is_suggested_and_refusable',
    description: 'Suivi des modifications allumé : la hauteur des lignes et la largeur des colonnes égalisées sont proposées comme modifications (une marque par ligne ou par case touchée) et « Tout refuser » rend les tailles d\'origine',
    run: async (h) => withDoc(h, SIZED, async () => {
      const bad = [];
      setRowHeights(0, [40, 80, 160]);
      await sleep(GROUP_GAP_MS);
      Editor.setTrackChanges(true);
      await sleep(100);
      await selectCells(0, 0, 0, 2, 2);
      GridEditor.equalizeLines(ed(), 'row');
      await sleep(GROUP_GAP_MS);
      GridEditor.equalizeLines(ed(), 'col');
      await sleep(200);
      const rowMarks = tablesOf()[0].node.content.content.map(row => row.marks.map(mark => mark.type.name + ':' + mark.attrs.attrName).join());
      if (JSON.stringify(rowHeights(0)) !== '[93,93,93]' || rowMarks.some(m => m !== 'modification:rowHeight')) bad.push('hauteurs : ' + JSON.stringify(rowHeights(0)) + ' marques ' + JSON.stringify(rowMarks));
      if (JSON.stringify(colWidths(0)) !== '[150,150,150]' || !Editor.hasPendingTrackedChanges()) bad.push('largeurs : ' + JSON.stringify(colWidths(0)) + ', en attente : ' + Editor.hasPendingTrackedChanges());
      ed().chain().focus().rejectAllSuggestionsChunked().run();
      await sleep(600);
      if (JSON.stringify(rowHeights(0)) !== '[40,80,160]' || JSON.stringify(colWidths(0)) !== '[140,190,120]') bad.push('Tout refuser : ' + JSON.stringify(rowHeights(0)) + ' ' + JSON.stringify(colWidths(0)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridInDocument = cases;
})();
