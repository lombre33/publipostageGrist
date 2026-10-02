// Suite "tableCells" - plusieurs cases d'un tableau de document sélectionnées d'un coup (CellSelection de prosemirror-tables, glissé à la souris - js/table-select.js) : la mise en forme
// de la barre d'outils et le copier-coller doivent porter sur TOUTES les cases (Antoine, 02/10 : « dans un module tableau on peut bel et bien sélectionner désormais plusieurs cellules
// d'un coup, par contre j'ai l'impression que je ne peux pas faire d'édition dessus ? Le but serait de pouvoir mettre en forme et/ou C/C la sélection »). Le gras, l'italique, le
// souligné, le barré et l'alignement parcouraient déjà les cases (les `ranges` de la sélection) ; la police, la taille, la couleur et le surlignage rétablissaient la
// sélection en simple texte (la case de tête seule, la sélection de cases éteinte) et les listes ne regardaient que la case de tête. La citation et le retrait suivent (Antoine a choisi
// « Étendre » sur la carte, 02/10) : la citation n'entourait que la case de tête, et les deux boutons du retrait restaient grisés ; les touches des listes (Ctrl+Maj+8 et Ctrl+Maj+7), elles aussi,
// ne changeaient que la case de tête (autre « Étendre », 02/10). Les gestes à la vraie souris et au vrai clavier
// (glisser, cliquer la barre, Ctrl+C / Ctrl+V à 700x400) sont dans dev-tests/verify-table-cells-mouse.mjs : ici les évènements sont synthétiques.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const doc = () => ed().state.doc;
  const ROWS = 3, COLS = 3;
  const TABLE = '<table><tbody>' + Array.from({ length: ROWS }, (_, r) => '<tr>' + Array.from({ length: COLS }, (_, c) => `<td><p>R${r}C${c} texte</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après</p>';

  // Position AVANT la case (ligne, colonne) du premier tableau du document.
  function cellPos(row, col) {
    const t = doc().child(0);
    let pos = 1;
    for (let r = 0; r < row; r++) pos += t.child(r).nodeSize;
    pos += 1;
    const rowNode = t.child(row);
    for (let c = 0; c < col; c++) pos += rowNode.child(c).nodeSize;
    return pos;
  }
  async function withTable(h, body, html) {
    await h.resetEditor();
    Editor.setHTML(html || TABLE);
    await sleep(150);
    try { return await body(); } finally { await sleep(30); }
  }
  async function selectCells(r1, c1, r2, c2) {
    ed().commands.setCellSelection({ anchorCell: cellPos(r1, c1), headCell: cellPos(r2, c2) });
    await sleep(60);
  }
  // Les cases du rectangle (r1,c1)-(r2,c2) et les autres.
  const inRect = (r, c, [r1, c1, r2, c2]) => r >= Math.min(r1, r2) && r <= Math.max(r1, r2) && c >= Math.min(c1, c2) && c <= Math.max(c1, c2);
  const allCells = () => { const list = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) list.push([r, c]); return list; };
  // La forme d'un nœud : son type et, entre parenthèses, ses enfants de bloc (« tableCell(blockquote(paragraph,paragraph)) »).
  function shapeOf(node) {
    const kids = [];
    node.forEach(child => { if (!child.isInline) kids.push(shapeOf(child)); });
    return node.type.name + (kids.length ? '(' + kids.join(',') + ')' : '');
  }
  // Ce que porte une case : ses marques de style (taille, police, couleur, surlignage), ses listes et ses blocs.
  function cellInfo(r, c) {
    const cell = doc().nodeAt(cellPos(r, c));
    const info = { size: [], family: [], color: [], background: [], lists: [], quotes: 0, headings: 0, text: cell.textContent, shape: shapeOf(cell) };
    cell.descendants(node => {
      if (node.isText) {
        node.marks.forEach(mark => {
          if (mark.type.name !== 'textStyle') return;
          if (mark.attrs.fontSize) info.size.push(mark.attrs.fontSize);
          if (mark.attrs.fontFamily) info.family.push(mark.attrs.fontFamily);
          if (mark.attrs.color) info.color.push(mark.attrs.color);
          if (mark.attrs.backgroundColor) info.background.push(mark.attrs.backgroundColor);
        });
      }
      if (['bulletList', 'orderedList', 'taskList'].includes(node.type.name)) info.lists.push({ name: node.type.name, attrs: node.attrs });
      if (node.type.name === 'blockquote') info.quotes++;
      if (node.type.name === 'heading') info.headings++;
      return true;
    });
    return info;
  }
  // Un résultat par case : « sélectionnée et a bien reçu » / « hors de la sélection et intacte ».
  function verdict(rect, has) {
    const reached = [], untouched = [];
    allCells().forEach(([r, c]) => (inRect(r, c, rect) ? reached : untouched).push(has(cellInfo(r, c))));
    return { reached, untouched, pass: reached.every(Boolean) && untouched.every(v => !v) };
  }
  const stillSelected = (rect) => {
    const sel = ed().state.selection;
    return !!sel.$anchorCell && typeof sel.forEachCell === 'function' && sel.$anchorCell.pos === cellPos(rect[0], rect[1]) && sel.$headCell.pos === cellPos(rect[2], rect[3]);
  };
  const press = (el) => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); };
  const pressById = async (id) => { press(document.getElementById(id)); await sleep(40); };
  async function pickFromPanel(openerId, itemSelector) {
    await pressById(openerId);
    const item = document.querySelector(itemSelector);
    if (!item) throw new Error('Entrée du panneau introuvable : ' + itemSelector);
    press(item);
    await sleep(60);
  }
  const RECT = [0, 0, 1, 1];
  const failNotes = (v, extra) => JSON.stringify(Object.assign({ reached: v.reached, untouched: v.untouched }, extra || {}));

  // ---- Mise en forme : police, taille, couleurs - passent par le panneau d'un menu, qui vole le focus et rétablit la sélection ----
  [
    ['taille choisie dans le menu', () => pickFromPanel('v2-size-chip-val', '.v2-format-panel button[data-action="14pt"]'), i => i.size.includes('14pt')],
    ['police choisie dans le menu', () => pickFromPanel('v2-font-chip', '.v2-format-panel button[data-action="Georgia"]'), i => i.family.includes('Georgia')],
    ['couleur de police choisie dans la palette', () => pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown button[data-action="pick:#c0392b"]'), i => i.color.length > 0],
    ['surlignage choisi dans la palette', () => pickFromPanel('v2-btn-highlight-caret', '.v2-color-dropdown button[data-action="pick:#fff2a8"]'), i => i.background.length > 0],
    ['dernière couleur de police (clic direct sur l\'icône)', () => pressById('v2-btn-text-color'), i => i.color.length > 0],
    ['dernier surlignage (clic direct sur l\'icône)', () => pressById('v2-btn-highlight'), i => i.background.length > 0],
    ['bouton « + » de la taille', () => pressById('v2-size-plus'), i => i.size.length > 0],
  ].forEach(([label, act, has], index) => {
    cases.push({
      id: 'cells_format_' + ['size_menu', 'font_menu', 'text_color_palette', 'highlight_palette', 'text_color_icon', 'highlight_icon', 'size_plus'][index] + '_reaches_every_selected_cell_and_keeps_the_selection',
      description: `Quatre cases (2x2) d'un tableau de document sélectionnées : ${label} met en forme les quatre cases, aucune autre, et la sélection de cases reste là pour la mise en forme suivante (avant, seule la case de tête changeait et la sélection devenait un curseur dans son texte)`,
      run: async (h) => withTable(h, async () => {
        await selectCells(...RECT);
        await act();
        const v = verdict(RECT, has);
        const kept = stillSelected(RECT);
        return { pass: v.pass && kept, notes: failNotes(v, { selectionKept: kept, selection: ed().state.selection.constructor.name }) };
      }),
    });
  });

  cases.push({
    id: 'cells_format_two_menus_in_a_row_work_on_the_same_selection',
    description: 'Une taille puis une couleur choisies à la suite sur les mêmes cases sélectionnées : les quatre cases portent les deux (la sélection de cases survit au premier menu)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickFromPanel('v2-size-chip-val', '.v2-format-panel button[data-action="12pt"]');
      await pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown button[data-action="pick:#1e8449"]');
      const v = verdict(RECT, i => i.size.includes('12pt') && i.color.length > 0);
      return { pass: v.pass && stillSelected(RECT), notes: failNotes(v) };
    }),
  });

  cases.push({
    id: 'cells_format_selection_in_one_row_or_one_column_and_reversed',
    description: 'Une ligne entière, une colonne entière et un rectangle sélectionné à l\'envers (de la dernière case à la première) : la taille choisie atteint chacune de leurs cases',
    run: async (h) => withTable(h, async () => {
      const results = [];
      for (const rect of [[1, 0, 1, 2], [0, 2, 2, 2], [2, 2, 0, 1]]) {
        Editor.setHTML(TABLE);
        await sleep(120);
        await selectCells(...rect);
        await pickFromPanel('v2-size-chip-val', '.v2-format-panel button[data-action="16pt"]');
        const v = verdict(rect, i => i.size.includes('16pt'));
        results.push({ rect, pass: v.pass && stillSelected(rect) });
      }
      return { pass: results.every(r => r.pass), notes: JSON.stringify(results) };
    }),
  });

  cases.push({
    id: 'cells_format_single_cell_cursor_keeps_formatting_only_its_text',
    description: 'Un simple curseur dans une case : la taille choisie ne met en forme que le texte sélectionné de cette case (inchangé)',
    run: async (h) => withTable(h, async () => {
      const from = cellPos(1, 1) + 2;
      ed().chain().focus().setTextSelection({ from, to: from + 4 }).run();
      await sleep(60);
      await pickFromPanel('v2-size-chip-val', '.v2-format-panel button[data-action="14pt"]');
      const sized = allCells().filter(([r, c]) => cellInfo(r, c).size.includes('14pt')).map(([r, c]) => r + '' + c);
      const part = doc().nodeAt(cellPos(1, 1)).textContent;
      return { pass: sized.length === 1 && sized[0] === '11' && part === 'R1C1 texte', notes: JSON.stringify({ sized, part }) };
    }),
  });

  // Le niveau de titre (menu au survol du chip « Normal ») portait déjà sur toutes les cases : le choix passe par une commande qui parcourt les `ranges` de la sélection. Garde.
  cases.push({
    id: 'cells_heading_level_reaches_every_selected_cell',
    description: 'Quatre cases sélectionnées, « Titre 1 » choisi dans le menu du chip : chacune des quatre devient un titre, aucune autre, la sélection de cases reste (déjà vrai avant ; la garde empêche qu\'une réécriture des commandes de bloc le perde)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      document.querySelector('#v2-heading-flyout .v2-hover-row[data-level="1"]').click();
      await sleep(80);
      const v = verdict(RECT, i => i.headings === 1);
      return { pass: v.pass && stillSelected(RECT), notes: failNotes(v) };
    }),
  });

  // ---- Listes : la commande de bloc ne regarde que la case de tête, il faut la rejouer case par case ----
  cases.push({
    id: 'cells_bullet_list_goes_in_every_selected_cell_and_comes_out_of_all_on_the_second_click',
    description: 'Quatre cases sélectionnées, un clic sur « Liste à puces » : chacune devient une liste (aucune autre case) et la sélection de cases reste ; un second clic les en sort toutes ; un seul Annuler rend chaque pose',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      const on = verdict(RECT, i => i.lists.length === 1 && i.lists[0].name === 'bulletList' && i.text.length > 0);
      const keptOn = stillSelected(RECT);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      const off = verdict(RECT, i => i.lists.length > 0);
      const offOk = off.reached.every(v => v === false) && off.untouched.every(v => v === false);
      const keptOff = stillSelected(RECT);
      await h.clickButton('v2-btn-undo');
      await sleep(80);
      const undone = verdict(RECT, i => i.lists.length === 1);
      return { pass: on.pass && keptOn && offOk && keptOff && undone.pass, notes: JSON.stringify({ on, keptOn, off, keptOff, afterOneUndo: undone }) };
    }),
  });

  cases.push({
    id: 'cells_bullet_list_with_a_mixed_selection_puts_every_cell_in_a_list',
    description: 'Une des cases sélectionnées est déjà une liste à puces, la case de tête non : un clic sur « Liste à puces » met toutes les cases en liste (aucune n\'en a deux), il ne la retire pas à celle qui l\'avait',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 0, 0);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      await selectCells(0, 0, 1, 1);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      const v = verdict(RECT, i => i.lists.length === 1 && i.lists[0].name === 'bulletList');
      return { pass: v.pass && stillSelected(RECT), notes: failNotes(v) };
    }),
  });

  [
    ['v2-btn-bullet-square', 'bulletList', 'bulletStyle', 'square', 'puce carrée'],
    ['v2-btn-ordered-alpha', 'orderedList', 'numberStyle', 'alpha', 'numérotation a. b. c.'],
    ['v2-btn-checklist-classic', 'taskList', 'taskListStyle', 'classic', 'cases à cocher classiques'],
  ].forEach(([buttonId, listName, attr, value, label]) => {
    cases.push({
      id: 'cells_list_style_' + value + '_goes_in_every_selected_cell',
      description: `Quatre cases sélectionnées, un clic sur « ${label} » (menu au survol des listes) : chaque case devient une liste de ce style, aucune autre, la sélection de cases reste`,
      run: async (h) => withTable(h, async () => {
        await selectCells(...RECT);
        await h.clickButton(buttonId);
        await sleep(60);
        const v = verdict(RECT, i => i.lists.length === 1 && i.lists[0].name === listName && i.lists[0].attrs[attr] === value);
        return { pass: v.pass && stillSelected(RECT), notes: failNotes(v) };
      }),
    });
  });

  cases.push({
    id: 'cells_bullet_list_ordinary_selection_is_unchanged',
    description: 'Hors sélection de cases, « Liste à puces » fait comme avant : un curseur dans une case ne met en liste que cette case, un paragraphe hors tableau seulement lui',
    run: async (h) => withTable(h, async () => {
      ed().chain().focus().setTextSelection(cellPos(1, 2) + 3).run();
      await sleep(40);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      const inCell = allCells().filter(([r, c]) => cellInfo(r, c).lists.length).map(([r, c]) => r + '' + c);
      const after = doc().child(1);
      ed().chain().focus().setTextSelection(doc().child(0).nodeSize + 3).run();
      await sleep(40);
      await h.clickButton('v2-btn-bullet');
      await sleep(60);
      const outside = doc().child(1);
      return { pass: inCell.length === 1 && inCell[0] === '12' && after.type.name === 'paragraph' && outside.type.name === 'bulletList', notes: JSON.stringify({ inCell, before: after.type.name, outside: outside.type.name }) };
    }),
  });

  // ---- Citation et retrait : `toggleBlockquote`, `sinkListItem` et `liftListItem` partent de `$from.blockRange($to)`, donc de la case de tête seule ----
  const para = text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
  const listItem = (text, nested) => ({ type: 'listItem', content: nested ? [para(text), nested] : [para(text)] });
  const bulletList = (...items) => ({ type: 'bulletList', content: items });
  const orderedList = (...items) => ({ type: 'orderedList', content: items });
  const quote = (...blocks) => ({ type: 'blockquote', content: blocks });
  // Un tableau 3x3 dont chaque case reçoit les blocs que `blocksOf(r, c)` renvoie (sinon son paragraphe habituel).
  async function setCells(blocksOf) {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let c = 0; c < COLS; c++) cells.push({ type: 'tableCell', attrs: {}, content: (blocksOf && blocksOf(r, c)) || [para(`R${r}C${c} texte`)] });
      rows.push({ type: 'tableRow', content: cells });
    }
    ed().commands.setContent({ type: 'doc', content: [{ type: 'table', content: rows }, para('Après')] });
    await sleep(120);
    // Sans cela le premier Annuler défait aussi ce contenu de départ (même groupe d'historique : moins de 500 ms plus tôt).
    ed().commands.clearHistory();
    await sleep(60);
  }
  const docJson = () => JSON.stringify(doc().toJSON());
  const shapeAt = (r, c) => shapeOf(doc().nodeAt(cellPos(r, c)));
  const buttonState = id => { const el = document.getElementById(id); return { disabled: el.disabled, pressed: el.classList.contains('is-active') }; };
  const QUOTED = 'tableCell(blockquote(paragraph))', PLAIN = 'tableCell(paragraph)';
  const ABC = () => bulletList(listItem('a'), listItem('b'), listItem('c'));
  const ABC_SHAPE = 'tableCell(bulletList(listItem(paragraph),listItem(paragraph),listItem(paragraph)))';
  const shapesOf = rect => allCells().map(([r, c]) => (inRect(r, c, rect) ? 'in ' : 'out ') + r + c + ' ' + shapeAt(r, c));

  cases.push({
    id: 'cells_quote_wraps_every_selected_cell_and_comes_out_of_all_on_the_second_click',
    description: 'Quatre cases sélectionnées, un clic sur « Citation » : le contenu de chacune entre dans une citation (aucune autre case), le bouton est enfoncé et la sélection de cases reste ; un seul Annuler les en sort toutes ; un nouveau clic puis un second clic les en sortent (avant, seule la case de tête entrait dans une citation et les autres n\'en sortaient jamais)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const on = verdict(RECT, i => i.shape === QUOTED);
      const keptOn = stillSelected(RECT);
      const pressed = buttonState('v2-btn-citation').pressed;
      await h.clickButton('v2-btn-undo');
      await sleep(80);
      const undone = verdict(RECT, i => i.quotes > 0);
      const undoneOk = undone.reached.every(v => v === false) && undone.untouched.every(v => v === false);
      await selectCells(...RECT);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const off = verdict(RECT, i => i.quotes > 0);
      const offOk = off.reached.every(v => v === false) && off.untouched.every(v => v === false);
      return { pass: on.pass && keptOn && pressed && undoneOk && offOk && stillSelected(RECT), notes: JSON.stringify({ on, keptOn, pressed, undone, off, kept: stillSelected(RECT) }) };
    }),
  });

  cases.push({
    id: 'cells_quote_with_a_mixed_selection_puts_every_cell_in_one_quote',
    description: 'Une des cases sélectionnées est déjà une citation, la case de tête non : un clic sur « Citation » met toutes les cases en citation (aucune n\'en a deux l\'une dans l\'autre), il ne la retire pas à celle qui l\'avait',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 0, 0);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      await selectCells(0, 0, 1, 1);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const v = verdict(RECT, i => i.shape === QUOTED);
      return { pass: v.pass && stillSelected(RECT), notes: failNotes(v) };
    }),
  });

  cases.push({
    id: 'cells_quote_wraps_the_whole_content_of_cells_with_several_blocks_and_gives_it_back_unchanged',
    description: 'Une case de trois paragraphes et une case qui ne contient qu\'une liste, sélectionnées avec deux autres : chacune garde tout son contenu dans UNE citation (la liste aussi), un second clic rend le document exactement comme il était',
    run: async (h) => withTable(h, async () => {
      await setCells((r, c) => (r === 0 && c === 0 ? [para('un'), para('deux'), para('trois')] : r === 0 && c === 1 ? [bulletList(listItem('a'), listItem('b'))] : null));
      const before = docJson();
      await selectCells(...RECT);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const shapes = [shapeAt(0, 0), shapeAt(0, 1), shapeAt(1, 0), shapeAt(1, 1)];
      const wanted = ['tableCell(blockquote(paragraph,paragraph,paragraph))', 'tableCell(blockquote(bulletList(listItem(paragraph),listItem(paragraph))))', QUOTED, QUOTED];
      const wrapped = JSON.stringify(shapes) === JSON.stringify(wanted);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const restored = docJson() === before;
      return { pass: wrapped && restored && stillSelected(RECT), notes: JSON.stringify({ shapes, restored }) };
    }),
  });

  cases.push({
    id: 'cells_quote_a_partly_quoted_cell_ends_up_in_a_single_quote_or_out_of_its_quote',
    description: 'Une case dont seul le premier paragraphe est en citation : « Citation » (case de tête sans citation) en fait une seule citation de tout son contenu, pas une citation dans une citation ; avec une case de tête en citation, le clic retire la citation de cette case aussi',
    run: async (h) => withTable(h, async () => {
      await setCells((r, c) => (r === 0 && c === 0 ? [quote(para('un')), para('deux')] : r === 1 && c === 1 ? [quote(para('R1C1 texte'))] : null));
      await selectCells(0, 0, 0, 1);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const wrapped = shapeAt(0, 0) === 'tableCell(blockquote(paragraph,paragraph))' && shapeAt(0, 1) === QUOTED;
      await h.clickButton('v2-btn-undo');
      await sleep(60);
      await selectCells(0, 0, 1, 1);
      const pressed = buttonState('v2-btn-citation').pressed;
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const out = shapeAt(0, 0) === 'tableCell(paragraph,paragraph)' && shapeAt(1, 1) === PLAIN && shapeAt(0, 1) === PLAIN && shapeAt(1, 0) === PLAIN;
      return { pass: wrapped && pressed && out && stillSelected([0, 0, 1, 1]), notes: JSON.stringify({ wrapped, pressed, out, shapes: shapesOf([0, 0, 1, 1]) }) };
    }),
  });

  cases.push({
    id: 'cells_quote_ordinary_selection_is_unchanged',
    description: 'Hors sélection de cases, « Citation » fait comme avant : un curseur dans une case ne met en citation que le paragraphe de cette case, un second clic l\'en sort',
    run: async (h) => withTable(h, async () => {
      ed().chain().focus().setTextSelection(cellPos(1, 2) + 3).run();
      await sleep(40);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const on = allCells().filter(([r, c]) => cellInfo(r, c).quotes).map(([r, c]) => r + '' + c);
      await h.clickButton('v2-btn-citation');
      await sleep(60);
      const off = allCells().filter(([r, c]) => cellInfo(r, c).quotes).length;
      return { pass: on.length === 1 && on[0] === '12' && off === 0, notes: JSON.stringify({ on, off }) };
    }),
  });

  // La touche d'origine de la citation (Ctrl+Maj+B) est celle de TipTap, qui ne regarde que la case de tête : sur une sélection de cases elle passe par le bouton (js/shortcuts.js, `cells`).
  // Comme au clavier : le relâchement de Maj suit. ProseMirror retient « Maj enfoncée » (`view.input.shiftKey`) jusqu'à ce keyup, et colle alors en texte brut : sans lui, le cas de collage
  // qui vient plus loin dans ce groupe perdait son tableau (le texte tabulé arrivait dans la case).
  const pressCtrlShiftB = () => {
    const target = ed().view.dom, init = { bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', code: 'KeyB', keyCode: 66, which: 66, ctrlKey: true, shiftKey: true, ...init }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, ...init }));
  };
  cases.push({
    id: 'cells_quote_shortcut_puts_every_selected_cell_in_a_quote_and_stays_native_elsewhere',
    description: 'Ctrl+Maj+B avec quatre cases sélectionnées : les quatre entrent dans une citation (comme le bouton), une seconde fois elles en sortent ; avec un simple curseur dans une case, la touche reste celle de l\'éditeur (le paragraphe de cette case seulement) - avant, seule la case de tête changeait',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      pressCtrlShiftB();
      await sleep(80);
      const on = verdict(RECT, i => i.shape === QUOTED);
      const keptOn = stillSelected(RECT);
      pressCtrlShiftB();
      await sleep(80);
      const off = verdict(RECT, i => i.quotes > 0);
      const offOk = off.reached.every(v => v === false) && off.untouched.every(v => v === false);
      ed().chain().focus().setTextSelection(cellPos(2, 2) + 3).run();
      await sleep(40);
      pressCtrlShiftB();
      await sleep(80);
      const cursor = allCells().filter(([r, c]) => cellInfo(r, c).quotes).map(([r, c]) => r + '' + c);
      return { pass: on.pass && keptOn && offOk && cursor.length === 1 && cursor[0] === '22', notes: JSON.stringify({ on, keptOn, off, cursor }) };
    }),
  });

  // Les touches d'origine des listes (Ctrl+Maj+8 puces, Ctrl+Maj+7 numérotée) sont celles de TipTap, qui ne regarde que la case de tête : sur une sélection de cases elles posent la liste dans
  // chacune ou l'en retirent (js/shortcuts.js, `cells`) ; avec un simple curseur elles restent à l'éditeur. Le chiffre est lu sur `event.code` (AZERTY) ; Maj se relâche ensuite, comme plus haut.
  const pressCtrlShiftDigit = digit => {
    const target = ed().view.dom, init = { bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', { key: { 7: '&', 8: '*' }[digit], code: 'Digit' + digit, keyCode: 48 + digit, which: 48 + digit, ctrlKey: true, shiftKey: true, ...init }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, ...init }));
  };
  [[8, 'bulletList', 'Ctrl+Maj+8', 'à puces'], [7, 'orderedList', 'Ctrl+Maj+7', 'numérotée']].forEach(([digit, listName, label, kind]) => {
    cases.push({
      id: 'cells_list_shortcut_' + listName + '_puts_the_list_in_every_selected_cell_and_takes_it_out_of_all',
      description: `${label} (liste ${kind}) avec quatre cases sélectionnées : chacune devient une liste (aucune autre case) et la sélection de cases reste ; un seul Annuler rend le geste ; une seconde fois la liste sort de toutes ; avec un simple curseur dans une case, la touche reste celle de l'éditeur (cette case seule) - avant, seule la case de tête changeait`,
      run: async (h) => withTable(h, async () => {
        await setCells();
        await selectCells(...RECT);
        pressCtrlShiftDigit(digit);
        await sleep(80);
        const on = verdict(RECT, i => i.lists.length === 1 && i.lists[0].name === listName && i.text.length > 0);
        const keptOn = stillSelected(RECT);
        await h.clickButton('v2-btn-undo');
        await sleep(80);
        const undone = allCells().every(([r, c]) => cellInfo(r, c).lists.length === 0);
        await selectCells(...RECT);
        pressCtrlShiftDigit(digit);
        await sleep(80);
        pressCtrlShiftDigit(digit);
        await sleep(80);
        const off = verdict(RECT, i => i.lists.length > 0);
        const offOk = off.reached.every(v => v === false) && off.untouched.every(v => v === false);
        const keptOff = stillSelected(RECT);
        ed().chain().focus().setTextSelection(cellPos(2, 2) + 3).run();
        await sleep(40);
        pressCtrlShiftDigit(digit);
        await sleep(80);
        const cursor = allCells().filter(([r, c]) => cellInfo(r, c).lists.length).map(([r, c]) => r + '' + c);
        return { pass: on.pass && keptOn && undone && offOk && keptOff && cursor.length === 1 && cursor[0] === '22', notes: JSON.stringify({ on, keptOn, undone, off, keptOff, cursor }) };
      }),
    });
  });

  // La case de tête commande (comme le bouton) : pas en liste à puces, elle les met toutes en liste à puces - la case qui était en liste numérotée change de type, aucune n'a deux listes ; et en
  // Lecture les deux touches ne font rien, comme le bouton grisé (même garde `usable` que les autres actions : la fonction de « Liste numérotée » comprise).
  cases.push({
    id: 'cells_list_shortcuts_follow_the_head_cell_and_do_nothing_in_reading_mode',
    description: 'Ctrl+Maj+8 avec la case de tête en liste numérotée : les quatre cases passent en liste à puces (aucune n\'a deux listes) ; en mode Lecture, avec des cases sélectionnées, les actions des deux touches répondent faux et ne changent rien au document',
    run: async (h) => withTable(h, async () => {
      await setCells((r, c) => (r === 1 && c === 1 ? [orderedList(listItem('x'))] : null));
      await selectCells(...RECT);
      pressCtrlShiftDigit(8);
      await sleep(80);
      const mixed = verdict(RECT, i => i.lists.length === 1 && i.lists[0].name === 'bulletList');
      const keptMixed = stillSelected(RECT);
      await selectCells(...RECT);
      const before = docJson();
      document.getElementById('btn-mode-read').click();
      await sleep(250);
      const reading = Shortcuts.ACTIONS.filter(a => a.id === 'bulletList' || a.id === 'orderedList').map(a => (typeof a.cells === 'function' ? a.cells() : a.run()));
      const unchanged = docJson() === before;
      document.getElementById('btn-mode-edit').click();
      await sleep(250);
      return { pass: mixed.pass && keptMixed && reading.length === 2 && reading.every(v => v === false) && unchanged, notes: JSON.stringify({ mixed, keptMixed, reading, unchanged }) };
    }),
  });

  // Le retrait : « Retrait » (sinkListItem) emboîte un élément sous celui qui le précède - le premier d'une liste n'a personne avant lui, comme dans une case seule ; « Retrait inverse »
  // (liftListItem) sort une liste de sa liste. Sur une sélection de cases, les deux boutons étaient grisés (`can()` est faux : le début de la sélection est avant la liste).
  cases.push({
    id: 'cells_retrait_buttons_follow_the_lists_of_the_selected_cells',
    description: 'Les deux boutons du retrait sont grisés tant que les cases sélectionnées ne contiennent aucune liste, actifs dès qu\'une d\'elles en contient une (le retrait seulement s\'il y a un deuxième élément à emboîter) - la sélection de cases les laissait toujours grisés',
    run: async (h) => withTable(h, async () => {
      await setCells((r, c) => (r === 0 && c === 0 ? [ABC()] : r === 0 && c === 1 ? [bulletList(listItem('seul'))] : null));
      const state = () => ({ indent: buttonState('v2-btn-indent').disabled, outdent: buttonState('v2-btn-outdent').disabled });
      await selectCells(1, 0, 2, 2);
      const noList = state();
      await selectCells(0, 0, 1, 1);
      const withList = state();
      await selectCells(0, 1, 1, 1);
      const oneItem = state();
      await selectCells(2, 0, 2, 2);
      const noListAgain = state();
      const pass = noList.indent && noList.outdent && !withList.indent && !withList.outdent && oneItem.indent && !oneItem.outdent && noListAgain.indent && noListAgain.outdent;
      return { pass, notes: JSON.stringify({ noList, withList, oneItem, noListAgain }) };
    }),
  });

  cases.push({
    id: 'cells_outdent_takes_the_list_of_every_selected_cell_out_and_one_undo_puts_them_back',
    description: 'Une liste de trois éléments dans chaque case, quatre cases sélectionnées, un clic sur « Retrait inverse » : les éléments de ces quatre listes deviennent des paragraphes (le texte et son ordre intacts), les autres cases gardent leur liste, la sélection de cases reste ; un seul Annuler rend les quatre listes',
    run: async (h) => withTable(h, async () => {
      await setCells(() => [ABC()]);
      const before = docJson();
      await selectCells(...RECT);
      await h.clickButton('v2-btn-outdent');
      await sleep(60);
      const out = verdict(RECT, i => i.shape === 'tableCell(paragraph,paragraph,paragraph)' && i.text === 'abc');
      const kept = stillSelected(RECT);
      await h.clickButton('v2-btn-undo');
      await sleep(80);
      return { pass: out.pass && kept && docJson() === before, notes: JSON.stringify({ out, kept, undone: docJson() === before }) };
    }),
  });

  cases.push({
    id: 'cells_indent_nests_every_item_after_the_first_under_it_in_each_selected_list',
    description: 'Une liste à puces et une liste numérotée de trois éléments, quatre cases sélectionnées, un clic sur « Retrait » : dans chaque liste le deuxième et le troisième éléments passent sous le premier (un niveau de plus, le premier reste), les autres cases sont intactes, la sélection de cases reste, « Retrait » se grise (plus rien à emboîter au premier niveau) et un seul Annuler rend les listes',
    run: async (h) => withTable(h, async () => {
      await setCells((r, c) => (c === 1 ? [orderedList(listItem('a'), listItem('b'), listItem('c'))] : [ABC()]));
      const before = docJson();
      await selectCells(...RECT);
      await h.clickButton('v2-btn-indent');
      await sleep(60);
      const nested = list => `tableCell(${list}(listItem(paragraph,${list}(listItem(paragraph),listItem(paragraph)))))`;
      const shapes = shapesOf(RECT);
      const expected = allCells().map(([r, c]) => (inRect(r, c, RECT) ? 'in ' : 'out ') + r + c + ' ' + (inRect(r, c, RECT) ? nested(c === 1 ? 'orderedList' : 'bulletList') : (c === 1 ? ABC_SHAPE.replace(/bulletList/, 'orderedList') : ABC_SHAPE)));
      const nestedOk = JSON.stringify(shapes) === JSON.stringify(expected);
      const kept = stillSelected(RECT);
      const buttons = { indentDisabled: buttonState('v2-btn-indent').disabled, outdentDisabled: buttonState('v2-btn-outdent').disabled };
      await h.clickButton('v2-btn-undo');
      await sleep(80);
      return { pass: nestedOk && kept && buttons.indentDisabled && !buttons.outdentDisabled && docJson() === before, notes: JSON.stringify({ shapes, expected, kept, buttons, undone: docJson() === before }) };
    }),
  });

  cases.push({
    id: 'cells_retrait_handles_nested_lists_and_several_lists_in_one_cell',
    description: 'Une case avec une liste dont le premier élément porte une sous-liste, une case avec deux listes séparées par un paragraphe : « Retrait » emboîte les éléments suivants de chaque liste sous son premier (les deux listes de la seconde case en même temps), « Retrait inverse » sort chaque liste de sa liste (une sous-liste monte d\'un niveau, le paragraphe du milieu reste entre les deux)',
    run: async (h) => withTable(h, async () => {
      const blocksOf = (r, c) => (r === 0 && c === 0 ? [bulletList(listItem('a', bulletList(listItem('x'), listItem('y'))), listItem('b'), listItem('c'))]
        : r === 0 && c === 1 ? [bulletList(listItem('d'), listItem('e')), para('milieu'), orderedList(listItem('f'), listItem('g'))] : null);
      await setCells(blocksOf);
      const before = docJson();
      const row = [0, 0, 0, 1];
      await selectCells(...row);
      await h.clickButton('v2-btn-indent');
      await sleep(60);
      const indented = [shapeAt(0, 0), shapeAt(0, 1)];
      const wantIndented = [
        'tableCell(bulletList(listItem(paragraph,bulletList(listItem(paragraph),listItem(paragraph),listItem(paragraph),listItem(paragraph)))))',
        'tableCell(bulletList(listItem(paragraph,bulletList(listItem(paragraph)))),paragraph,orderedList(listItem(paragraph,orderedList(listItem(paragraph)))))',
      ];
      const indentOk = JSON.stringify(indented) === JSON.stringify(wantIndented) && stillSelected(row);
      await h.clickButton('v2-btn-undo');
      await sleep(80);
      const undone = docJson() === before;
      await selectCells(...row);
      await h.clickButton('v2-btn-outdent');
      await sleep(60);
      const lifted = [shapeAt(0, 0), shapeAt(0, 1)];
      const wantLifted = [
        'tableCell(paragraph,bulletList(listItem(paragraph),listItem(paragraph)),paragraph,paragraph)',
        'tableCell(paragraph,paragraph,paragraph,paragraph,paragraph)',
      ];
      const liftOk = JSON.stringify(lifted) === JSON.stringify(wantLifted) && stillSelected(row);
      return { pass: indentOk && undone && liftOk, notes: JSON.stringify({ indented, undone, lifted }) };
    }),
  });

  cases.push({
    id: 'cells_retrait_ordinary_selection_is_unchanged',
    description: 'Hors sélection de cases, « Retrait » et « Retrait inverse » font comme avant : le curseur dans le deuxième élément d\'une liste de cellule n\'emboîte que celui-là, les autres cases ne bougent pas, puis « Retrait inverse » le remet au niveau du premier',
    run: async (h) => withTable(h, async () => {
      await setCells(() => [ABC()]);
      let second = null;
      doc().nodeAt(cellPos(1, 1)).descendants((node, offset) => { if (node.isText && node.text === 'b') second = cellPos(1, 1) + 1 + offset; });
      ed().chain().focus().setTextSelection(second + 1).run();
      await sleep(40);
      const inItem = ed().state.selection.$from.parent.textContent;
      await h.clickButton('v2-btn-indent');
      await sleep(60);
      const nested = shapeAt(1, 1) === 'tableCell(bulletList(listItem(paragraph,bulletList(listItem(paragraph))),listItem(paragraph)))';
      const others = allCells().filter(([r, c]) => !(r === 1 && c === 1)).every(([r, c]) => shapeAt(r, c) === ABC_SHAPE);
      await h.clickButton('v2-btn-outdent');
      await sleep(60);
      const back = shapeAt(1, 1) === ABC_SHAPE;
      return { pass: inItem === 'b' && nested && others && back, notes: JSON.stringify({ inItem, nested, others, back, shape: shapeAt(1, 1) }) };
    }),
  });

  // ---- Copier / couper / coller : le texte brut est un tableau tabulé ; le HTML, le collage et la coupe étaient déjà bons ----
  function fireClipboard(type, dt) {
    const event = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event;
  }
  const clipOf = dt => ({ text: dt.getData('text/plain'), html: dt.getData('text/html') });

  cases.push({
    id: 'cells_copy_puts_a_tab_separated_text_in_the_clipboard',
    description: 'Quatre cases sélectionnées puis Ctrl+C : le texte brut est un tableau (cases séparées par une tabulation, lignes par un retour à la ligne) que lisent Grist, un tableur ou un éditeur de texte - avant, chaque case tombait sur sa propre ligne entre deux lignes vides ; le HTML reste un tableau 2x2',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      const clip = clipOf(dt);
      const rows = (clip.html.match(/<tr>/g) || []).length;
      const expected = 'R0C0 texte\tR0C1 texte\nR1C0 texte\tR1C1 texte';
      return { pass: clip.text === expected && rows === 2, notes: JSON.stringify({ text: clip.text, htmlRows: rows }) };
    }),
  });

  cases.push({
    id: 'cells_copy_quotes_a_cell_with_several_lines_a_tab_or_a_quote_like_a_spreadsheet',
    description: 'Une case de deux paragraphes, une qui porte une tabulation et une qui porte un guillemet : le texte brut copié les met entre guillemets (guillemet doublé), une case vide reste un champ vide - une case fusionnée sur deux colonnes laisse un champ vide pour la seconde',
    run: async (h) => withTable(h, async () => {
      // Construit en JSON : l'analyse du HTML replie une tabulation en espace.
      const para = text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
      const cell = (paragraphs, attrs) => ({ type: 'tableCell', attrs: attrs || {}, content: paragraphs.map(para) });
      ed().commands.setContent({ type: 'doc', content: [
        { type: 'table', content: [
          { type: 'tableRow', content: [cell(['un', 'deux']), cell(['a\tb']), cell(['dit "oui"'])] },
          { type: 'tableRow', content: [cell(['']), cell(['large'], { colspan: 2 })] },
        ] },
        para('Après'),
      ] });
      await sleep(120);
      ed().commands.setCellSelection({ anchorCell: cellPos(0, 0), headCell: cellPos(1, 1) });
      await sleep(60);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      const text = clipOf(dt).text;
      const expected = '"un\ndeux"\t"a\tb"\t"dit ""oui"""\n\tlarge\t';
      return { pass: text === expected, notes: JSON.stringify({ text, expected }) };
    }),
  });

  cases.push({
    id: 'cells_copy_keeps_a_forced_line_break_inside_a_cell',
    description: 'Une case dont le texte porte un retour à la ligne forcé (Maj + Entrée) : le texte brut copié le garde, la case est entre guillemets - il ne colle pas les deux lignes en un mot',
    run: async (h) => withTable(h, async () => {
      const text = value => ({ type: 'text', text: value });
      const cell = content => ({ type: 'tableCell', attrs: {}, content: [{ type: 'paragraph', content }] });
      ed().commands.setContent({ type: 'doc', content: [
        { type: 'table', content: [{ type: 'tableRow', content: [cell([text('un'), { type: 'hardBreak' }, text('deux')]), cell([text('trois')])] }] },
        { type: 'paragraph', content: [text('Après')] },
      ] });
      await sleep(120);
      ed().commands.setCellSelection({ anchorCell: cellPos(0, 0), headCell: cellPos(0, 1) });
      await sleep(60);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      const copied = clipOf(dt).text;
      return { pass: copied === '"un\ndeux"\ttrois', notes: JSON.stringify({ text: copied }) };
    }),
  });

  cases.push({
    id: 'cells_copy_of_the_whole_table_is_tab_separated_too',
    description: 'Toutes les cases du tableau sélectionnées (le tableau entier) puis Ctrl+C : même texte tabulé, trois lignes de trois cases',
    run: async (h) => withTable(h, async () => {
      await selectCells(0, 0, 2, 2);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      const text = clipOf(dt).text;
      const lines = text.split('\n');
      return { pass: lines.length === 3 && lines.every((line, r) => line === [0, 1, 2].map(c => `R${r}C${c} texte`).join('\t')), notes: JSON.stringify({ text }) };
    }),
  });

  cases.push({
    id: 'cells_copy_of_ordinary_text_keeps_the_default_plain_text',
    description: 'Hors sélection de cases, Ctrl+C garde le texte brut d\'avant : deux paragraphes entiers sont séparés par une ligne vide, un morceau de phrase est copié tel quel',
    run: async (h) => withTable(h, async () => {
      Editor.setHTML('<p>Premier</p><p>Second</p><p>Un morceau de phrase</p>');
      await sleep(120);
      ed().chain().focus().setTextSelection({ from: 1, to: 17 }).run();
      await sleep(40);
      const dtTwo = new DataTransfer();
      fireClipboard('copy', dtTwo);
      ed().chain().focus().setTextSelection({ from: 19 + 4, to: 19 + 4 + 5 }).run();
      await sleep(40);
      const dtPart = new DataTransfer();
      fireClipboard('copy', dtPart);
      const two = clipOf(dtTwo).text, part = clipOf(dtPart).text;
      return { pass: two === 'Premier\n\nSecond' && part === part.trim() && part.length === 5, notes: JSON.stringify({ two, part }) };
    }),
  });

  cases.push({
    id: 'cells_copy_then_paste_fills_the_cells_from_the_clicked_one_and_cut_empties_them',
    description: 'Copier quatre cases (2x2), placer le curseur dans une autre case et coller : les valeurs et le gras arrivent à partir de cette case, le tableau gagne la ligne qui manque ; couper vide les cases coupées et garde le même tableau dans le presse-papiers',
    run: async (h) => withTable(h, async () => {
      ed().chain().focus().setTextSelection({ from: cellPos(0, 0) + 2, to: cellPos(0, 0) + 8 }).toggleBold().run();
      await selectCells(...RECT);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      ed().chain().focus().setTextSelection(cellPos(2, 1) + 3).run();
      await sleep(40);
      fireClipboard('paste', dt);
      await sleep(120);
      const t = doc().child(0);
      const rows = t.childCount;
      const text = (r, c) => (t.child(r).childCount > c ? t.child(r).child(c).textContent : null);
      const pasted = text(2, 1) === 'R0C0 texte' && text(2, 2) === 'R0C1 texte' && text(3, 1) === 'R1C0 texte' && text(3, 2) === 'R1C1 texte';
      const bold = t.child(2).child(1).firstChild.firstChild.marks.some(m => m.type.name === 'bold');
      await selectCells(0, 0, 0, 1);
      const cutDt = new DataTransfer();
      fireClipboard('cut', cutDt);
      await sleep(100);
      const emptied = doc().child(0).child(0).child(0).textContent === '' && doc().child(0).child(0).child(1).textContent === '' && doc().child(0).child(0).child(2).textContent === 'R0C2 texte';
      return { pass: rows === 4 && pasted && bold && emptied && clipOf(cutDt).text === 'R0C0 texte\tR0C1 texte', notes: JSON.stringify({ rows, pasted, bold, emptied, cut: clipOf(cutDt).text }) };
    }),
  });

  cases.push({
    id: 'cells_paste_a_single_value_fills_every_selected_cell',
    description: 'Copier le texte d\'une seule case puis coller sur quatre cases sélectionnées : les quatre reçoivent la valeur (comme un tableur)',
    run: async (h) => withTable(h, async () => {
      ed().chain().focus().setTextSelection({ from: cellPos(2, 2) + 2, to: cellPos(2, 2) + 12 }).run();
      await sleep(40);
      const dt = new DataTransfer();
      fireClipboard('copy', dt);
      await selectCells(0, 0, 1, 1);
      fireClipboard('paste', dt);
      await sleep(120);
      const reached = [], others = [];
      allCells().forEach(([r, c]) => {
        const text = cellInfo(r, c).text;
        if (inRect(r, c, RECT)) reached.push(text === 'R2C2 texte');
        else if (!(r === 2 && c === 2)) others.push(text === `R${r}C${c} texte`); // la case source porte déjà cette valeur
      });
      return { pass: reached.every(Boolean) && others.every(Boolean), notes: JSON.stringify({ reached, others }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tableCells = cases;
})();
