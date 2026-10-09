// Suite "gridInDocument" - les réglages de la grille sur le tableau d'un DOCUMENT (09/10, demande d'Antoine : le module d'insertion de tableau d'un document classique
// devient un tableau du mode grille ; lot 2 sur 6 : la grille « à portée de tableau »). Dans une grille, le modèle n'a qu'un tableau et `GridEditor` le prend en tête du
// document ; dans un document les réglages de la barre du tableau - alignement vertical, bordures, quadrillage - visent le tableau qui porte la sélection (`tableInfo`,
// `scopedTable` de js/grid-editor.js), les autres restent comme ils étaient. Ici, sans aucun bouton (la barre du tableau d'un document ne les montre pas encore) : les
// fonctions de `GridEditor` appelées sur l'éditeur d'un document à deux tableaux, un tableau dans une case, un curseur hors des tableaux, le suivi des modifications
// allumé, puis le tableau réglé dans le Word (OOXML dézippé) : « ce que je règle sort pareil ». La grille elle-même (un seul tableau) garde sa suite "grid".
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
      };
      const unchanged = JSON.stringify(ed().state.doc.toJSON()) === before;
      Editor.setTrackChanges(false);
      await sleep(100);
      const free = GridEditor.setVerticalAlign(ed(), 'bottom');
      await sleep(60);
      const pass = tracked.valign === false && tracked.borders === false && tracked.lines === false && tracked.read === null && unchanged
        && free === true && cellAttrs(1, 1, 0).verticalAlign === 'bottom';
      return { pass, notes: JSON.stringify({ tracked, unchanged, free }) };
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridInDocument = cases;
})();
