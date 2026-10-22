// Suite "tableCells" - plusieurs cases d'un tableau de document sélectionnées d'un coup (CellSelection de prosemirror-tables, glissé à la souris - js/table-select.js) : la mise en forme
// de la barre d'outils et le copier-coller doivent porter sur TOUTES les cases (Antoine, 02/10 : « dans un module tableau on peut bel et bien sélectionner désormais plusieurs cellules
// d'un coup, par contre j'ai l'impression que je ne peux pas faire d'édition dessus ? Le but serait de pouvoir mettre en forme et/ou C/C la sélection »). Le gras, l'italique, le
// souligné, le barré et l'alignement parcouraient déjà les cases (les `ranges` de la sélection) ; la police, la taille, la couleur et le surlignage rétablissaient la
// sélection en simple texte (la case de tête seule, la sélection de cases éteinte) et les listes ne regardaient que la case de tête. La citation et le retrait suivent (Antoine a choisi
// « Étendre » sur la carte, 02/10) : la citation n'entourait que la case de tête, et les deux boutons du retrait restaient grisés ; les touches des listes (Ctrl+Maj+8, Ctrl+Maj+7 et Ctrl+Maj+9), elles aussi,
// ne changeaient que la case de tête (autres « Étendre », 02/10). Les gestes à la vraie souris et au vrai clavier
// (glisser, cliquer la barre, Ctrl+C / Ctrl+V à 700x400) sont dans dev-tests/verify-table-cells-mouse.mjs : ici les évènements sont synthétiques.
// Cases VIDES (Antoine, 22/10 : « changer la couleur de police dans un tableau où j'ai utilisé la feature pour remplir le fond des cellules ne fonctionne pas ») : une marque ne se pose que
// sur du texte, la couleur choisie sur des cases sans texte ne laissait rien (le texte tapé ensuite restait noir sur un fond foncé, une bulle posée ensuite aussi). Elle est gardée dans le
// style de frappe du paragraphe de la case (js/typing-style.js) : la frappe, une bulle, Tab, un enregistrement, un Annuler la retrouvent ou la défont.
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
    ['couleur de police choisie dans la palette', () => pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#b91c1c"]'), i => i.color.length > 0],
    ['surlignage choisi dans la palette', () => pickFromPanel('v2-btn-highlight-caret', '.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]'), i => i.background.length > 0],
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
      await pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#15803d"]');
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

  // Les touches d'origine des listes (Ctrl+Maj+8 puces, Ctrl+Maj+7 numérotée, Ctrl+Maj+9 tâches) sont celles de TipTap, qui ne regarde que la case de tête : sur une sélection de cases elles posent la liste dans
  // chacune ou l'en retirent (js/shortcuts.js, `cells`) ; avec un simple curseur elles restent à l'éditeur. Le chiffre est lu sur `event.code` (AZERTY) ; Maj se relâche ensuite, comme plus haut.
  const pressCtrlShiftDigit = digit => {
    const target = ed().view.dom, init = { bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', { key: { 7: '&', 8: '*', 9: '(' }[digit], code: 'Digit' + digit, keyCode: 48 + digit, which: 48 + digit, ctrlKey: true, shiftKey: true, ...init }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, ...init }));
  };
  [[8, 'bulletList', 'Ctrl+Maj+8', 'à puces'], [7, 'orderedList', 'Ctrl+Maj+7', 'numérotée'], [9, 'taskList', 'Ctrl+Maj+9', 'de tâches']].forEach(([digit, listName, label, kind]) => {
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
  // Lecture les touches ne font rien, comme le bouton grisé (même garde `usable` que les autres actions : les fonctions de « Liste numérotée » et de « Liste de tâches » comprises).
  cases.push({
    id: 'cells_list_shortcuts_follow_the_head_cell_and_do_nothing_in_reading_mode',
    description: 'Ctrl+Maj+8 avec la case de tête en liste numérotée : les quatre cases passent en liste à puces (aucune n\'a deux listes) ; en mode Lecture, avec des cases sélectionnées, les actions des trois touches répondent faux et ne changent rien au document',
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
      const reading = Shortcuts.ACTIONS.filter(a => ['bulletList', 'orderedList', 'taskList'].includes(a.id)).map(a => (typeof a.cells === 'function' ? a.cells() : a.run()));
      const unchanged = docJson() === before;
      document.getElementById('btn-mode-edit').click();
      await sleep(250);
      return { pass: mixed.pass && keptMixed && reading.length === 3 && reading.every(v => v === false) && unchanged, notes: JSON.stringify({ mixed, keptMixed, reading, unchanged }) };
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

  // ---- Cases vides : la couleur de police choisie est gardée pour ce qu'on y écrira (js/typing-style.js) ----
  const EMPTY = '<table><tbody>' + Array.from({ length: ROWS }, () => '<tr>' + Array.from({ length: COLS }, () => '<td><p></p></td>').join('') + '</tr>').join('') + '</tbody></table><p>Après</p>';
  const RED = '#b91c1c';
  const pickRed = () => pickFromPanel('v2-btn-text-color-caret', `.v2-color-dropdown.visible button[data-action="pick:${RED}"]`);
  // Le style de frappe du paragraphe de tête d'une case (null : aucun).
  const styleOf = (r, c) => { const p = doc().nodeAt(cellPos(r, c)).firstChild; return p.attrs.typingStyle === undefined ? 'absent' : p.attrs.typingStyle; };
  const hasStyle = (r, c) => { const style = styleOf(r, c); return !!style && style !== 'absent' && style.color === RED; };
  const cursorIn = async (r, c) => { ed().chain().focus().setTextSelection(cellPos(r, c) + 2).run(); await sleep(40); };
  // Le texte tapé au clavier sur un curseur : ProseMirror l'écrit avec les marques en attente (`insertText`).
  const typeText = (text) => { const v = ed().view; v.dispatch(v.state.tr.insertText(text)); };
  // Le clavier sur une sélection de cases (ni curseur ni texte dans une seule case) : ProseMirror demande d'abord aux plugins (handleTextInput), puis écrit.
  const typeOnSelection = (text) => {
    const v = ed().view;
    const { from, to } = v.state.selection;
    if (!v.someProp('handleTextInput', f => f(v, from, to, text))) v.dispatch(v.state.tr.insertText(text));
  };
  const redCells = () => allCells().filter(([r, c]) => cellInfo(r, c).color.includes(RED)).map(([r, c]) => r + ',' + c);
  const styledCells = () => allCells().filter(([r, c]) => hasStyle(r, c)).map(([r, c]) => r + ',' + c);
  const RECT_KEYS = ['0,0', '0,1', '1,0', '1,1'];

  cases.push({
    id: 'cells_empty_text_color_is_kept_for_the_text_typed_next',
    description: 'Quatre cases VIDES (2x2) sélectionnées, couleur de police choisie dans la palette : le style de frappe des quatre cases (et d\'elles seules) porte la couleur ; le curseur posé dans l\'une d\'elles, le texte tapé est de cette couleur (avant : rien ne restait, le texte tapé était noir) ; une case vide hors de la sélection reste noire',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      const styled = styledCells();
      const kept = stillSelected(RECT);
      await cursorIn(0, 0);
      typeText('Titre');
      await cursorIn(2, 2);
      typeText('Hors');
      const typed = cellInfo(0, 0);
      const outside = cellInfo(2, 2);
      return {
        pass: JSON.stringify(styled) === JSON.stringify(RECT_KEYS) && kept && typed.text === 'Titre' && typed.color.includes(RED) && outside.text === 'Hors' && outside.color.length === 0,
        notes: JSON.stringify({ styled, kept, typed: [typed.text, typed.color], outside: [outside.text, outside.color] }),
      };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_survives_moving_between_cells',
    description: 'Couleur choisie sur quatre cases vides, puis Tab de case en case (ProseMirror perd la marque en attente à chaque déplacement du curseur) : le texte tapé dans chaque case sélectionnée est de la couleur choisie, celui de la case suivante qui ne l\'était pas reste noir',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      await cursorIn(0, 0);
      typeText('A');
      ed().commands.goToNextCell();
      await sleep(40);
      typeText('B');
      ed().commands.goToNextCell();
      await sleep(40);
      typeText('C');
      ed().commands.goToNextCell();
      await sleep(40);
      typeText('D');
      const got = ['0,0', '0,1', '0,2', '1,0'].map((k) => { const [r, c] = k.split(',').map(Number); return [cellInfo(r, c).text, cellInfo(r, c).color.includes(RED)]; });
      return { pass: JSON.stringify(got) === JSON.stringify([['A', true], ['B', true], ['C', false], ['D', true]]), notes: JSON.stringify(got) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_typed_on_the_selection_goes_to_one_cell_in_that_color',
    description: 'Couleur choisie sur quatre cases vides qui restent sélectionnées, puis du texte tapé sans cliquer : il arrive dans la case de tête de la sélection (comme avant) et prend la couleur choisie',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      typeOnSelection('Zéro');
      const filled = allCells().filter(([r, c]) => cellInfo(r, c).text === 'Zéro');
      const info = filled.length === 1 ? cellInfo(...filled[0]) : null;
      return { pass: filled.length === 1 && !!info && info.color.includes(RED) && !!info.color.length, notes: JSON.stringify({ filled, color: info && info.color }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_is_saved_with_the_template_and_read_back',
    description: 'Couleur choisie sur trois cases vides d\'une ligne : le HTML enregistré porte le style de frappe de ces trois cases seules ; le modèle rouvert, le texte tapé dans l\'une d\'elles est de la couleur choisie',
    run: async (h) => withTable(h, async () => {
      await selectCells(1, 0, 1, 2);
      await pickRed();
      const saved = ed().getHTML();
      const attrs = (saved.match(/data-typing-style=/g) || []).length;
      Editor.setHTML(saved);
      await sleep(150);
      const styled = styledCells();
      await cursorIn(1, 1);
      typeText('Rouvert');
      const info = cellInfo(1, 1);
      return { pass: attrs === 3 && JSON.stringify(styled) === JSON.stringify(['1,0', '1,1', '1,2']) && info.text === 'Rouvert' && info.color.includes(RED), notes: JSON.stringify({ attrs, styled, typed: [info.text, info.color] }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_one_undo_removes_it_and_keeps_the_fill',
    description: 'Fond posé sur quatre cases vides, puis (plus tard) une couleur de police : un seul Annuler retire la couleur gardée des quatre cases et laisse le fond (avant, la couleur ne laissait aucun pas d\'historique : Annuler défaisait le fond) ; Rétablir la rend',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      const sel = ed().state.selection;
      const tr = ed().state.tr;
      sel.forEachCell((cell, pos) => tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: '#1d4ed8' })));
      ed().view.dispatch(tr);
      await sleep(700); // l'historique groupe les pas de moins de 500 ms
      await pickRed();
      const fills = () => allCells().filter(([r, c]) => doc().nodeAt(cellPos(r, c)).attrs.backgroundColor === '#1d4ed8').length;
      const before = { styled: styledCells().length, fills: fills() };
      ed().commands.undo();
      await sleep(60);
      const undone = { styled: styledCells().length, fills: fills() };
      ed().commands.redo();
      await sleep(60);
      const redone = { styled: styledCells().length, fills: fills() };
      return { pass: before.styled === 4 && before.fills === 4 && undone.styled === 0 && undone.fills === 4 && redone.styled === 4 && redone.fills === 4, notes: JSON.stringify({ before, undone, redone }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_automatic_removes_it',
    description: 'Couleur choisie sur quatre cases vides, puis « Automatique » : le style de frappe des quatre cases disparaît et le texte tapé ensuite est sans couleur',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      const had = styledCells().length;
      await pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="none"]');
      const left = styledCells().length;
      const attr = (ed().getHTML().match(/data-typing-style=/g) || []).length;
      await cursorIn(0, 0);
      typeText('Noir');
      const info = cellInfo(0, 0);
      return { pass: had === 4 && left === 0 && attr === 0 && info.text === 'Noir' && info.color.length === 0, notes: JSON.stringify({ had, left, attr, typed: [info.text, info.color] }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_cursor_in_one_empty_cell_survives_leaving_it',
    description: 'Le curseur dans UNE case vide, couleur choisie : la couleur reste quand le curseur part puis revient (avant : la marque en attente tombait au premier déplacement) et le texte tapé au retour est colorié',
    run: async (h) => withTable(h, async () => {
      await cursorIn(1, 1);
      await pickRed();
      await cursorIn(2, 2);
      await cursorIn(1, 1);
      typeText('Retour');
      const info = cellInfo(1, 1);
      const other = styleOf(2, 2);
      return { pass: info.text === 'Retour' && info.color.includes(RED) && !hasStyle(2, 2), notes: JSON.stringify({ typed: [info.text, info.color], other }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_a_variable_put_in_the_cell_takes_it',
    description: 'Couleur choisie sur des cases vides, puis « # » tapé dans l\'une d\'elles et remplacé par une bulle de variable (le chemin de la liste des variables) : la bulle porte la couleur choisie, comme le texte qui la suit (avant, la bulle n\'avait aucune marque : noire à la Lecture, au PDF et au Word)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      await cursorIn(0, 1);
      typeText('#');
      const { from, to } = ed().state.selection;
      ed().chain().focus().insertContentAt({ from: from - 1, to }, { type: 'varBadge', attrs: { table: 'Tbl', column: 'Nom', key: 'Tbl.Nom' } }).run();
      await sleep(40);
      typeText(' fin');
      let bubble = null;
      doc().descendants((node) => { if (node.type.name === 'varBadge') bubble = node; return true; });
      const colorOf = node => (node ? node.marks.filter(m => m.type.name === 'textStyle').map(m => m.attrs.color) : null);
      const tail = cellInfo(0, 1);
      return { pass: !!bubble && colorOf(bubble).includes(RED) && tail.text.endsWith(' fin') && tail.color.includes(RED), notes: JSON.stringify({ bubble: colorOf(bubble), tail: [tail.text, tail.color] }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_a_variable_put_in_a_cell_without_color_stays_plain',
    description: 'Une bulle posée dans une case vide dont aucune couleur n\'a été choisie ne reçoit aucune marque (rien ne change pour ce qui n\'a pas de style de frappe)',
    run: async (h) => withTable(h, async () => {
      await cursorIn(0, 1);
      ed().chain().focus().insertContent({ type: 'varBadge', attrs: { table: 'Tbl', column: 'Nom', key: 'Tbl.Nom' } }).run();
      await sleep(40);
      let bubble = null;
      doc().descendants((node) => { if (node.type.name === 'varBadge') bubble = node; return true; });
      return { pass: !!bubble && bubble.marks.length === 0, notes: JSON.stringify({ marks: bubble && bubble.marks.map(m => m.type.name) }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_text_color_on_cells_with_text_is_unchanged_and_leaves_no_typing_style',
    description: 'Quatre cases qui ont du texte : la couleur choisie colorie ce texte comme avant et n\'écrit aucun style de frappe (il ne sert qu\'aux paragraphes vides)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await pickRed();
      const v = verdict(RECT, i => i.color.includes(RED));
      const attr = (ed().getHTML().match(/data-typing-style=/g) || []).length;
      return { pass: v.pass && attr === 0, notes: failNotes(v, { typingStyles: attr }) };
    }),
  });

  cases.push({
    id: 'cells_empty_text_color_outside_a_table_writes_no_typing_style',
    description: 'Le curseur dans une ligne vide hors tableau, couleur choisie : aucun style de frappe n\'est écrit (il ne vaut que dans une case) et le texte tapé est colorié comme avant',
    run: async (h) => withTable(h, async () => {
      const last = doc().content.size - 1;
      ed().chain().focus().setTextSelection(last).run();
      await sleep(40);
      ed().chain().focus().setTextSelection(doc().content.size - 1).run();
      await pickRed();
      typeText('Hors tableau');
      const attr = (ed().getHTML().match(/data-typing-style=/g) || []).length;
      const tail = doc().lastChild;
      const colored = tail.textContent.includes('Hors tableau') && tail.firstChild.marks.some(m => m.type.name === 'textStyle' && m.attrs.color === RED);
      return { pass: attr === 0 && colored, notes: JSON.stringify({ attr, text: tail.textContent, marks: tail.firstChild && tail.firstChild.marks.map(m => m.type.name) }) };
    }, '<table><tbody><tr><td><p>A</p></td></tr></tbody></table><p></p>'),
  });

  cases.push({
    id: 'cells_empty_text_color_under_track_changes_writes_nothing_to_track',
    description: 'Suivi des modifications actif, couleur choisie sur des cases vides : aucun style de frappe n\'est écrit et le suivi ne garde aucune modification (un attribut de paragraphe n\'a rien à proposer à accepter ou refuser)',
    run: async (h) => withTable(h, async () => {
      const wasOn = Editor.isTrackChangesOn();
      if (!wasOn) await h.clickButton('v2-btn-track-changes');
      try {
        await selectCells(...RECT);
        await pickRed();
        const html = ed().getHTML();
        return { pass: !/data-typing-style|data-tc-|<ins|<del/.test(html), notes: html.slice(0, 300) };
      } finally {
        if (Editor.isTrackChangesOn() !== wasOn) await h.clickButton('v2-btn-track-changes');
      }
    }, EMPTY),
  });

  cases.push({
    id: 'cells_typing_style_is_read_back_only_with_known_safe_values',
    description: 'Un HTML enregistré (ou collé) dont le style de frappe n\'est pas un JSON, porte un réglage inconnu ou une couleur qui glisse une autre déclaration CSS : ces styles sont ignorés ; une couleur correcte est gardée',
    run: async (h) => withTable(h, async () => {
      const cell = style => `<td><p data-typing-style="${style}"></p></td>`;
      Editor.setHTML('<table><tbody><tr>'
        + cell('{&quot;color&quot;:&quot;red; background: url(https://exemple.test/x.png)&quot;}')
        + cell('pas du json')
        + cell('{&quot;position&quot;:&quot;fixed&quot;}')
        + cell('{&quot;color&quot;:&quot;#ffffff&quot;}')
        + '</tr></tbody></table><p></p>');
      await sleep(150);
      const styles = [0, 1, 2, 3].map(c => styleOf(0, c));
      return { pass: styles[0] === null && styles[1] === null && styles[2] === null && !!styles[3] && styles[3].color === '#ffffff' && Object.keys(styles[3]).length === 1, notes: JSON.stringify(styles) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_text_color_typed_text_reaches_reader_pdf_and_word',
    description: 'Fond foncé et couleur de police blanche sur des cases vides, puis du texte tapé : la Lecture, le PDF et le Word le montrent blanc sur le fond (avant, noir sur noir)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      const sel = ed().state.selection;
      const tr = ed().state.tr;
      sel.forEachCell((cell, pos) => tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: '#1d4ed8' })));
      ed().view.dispatch(tr);
      await pickFromPanel('v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#ffffff"]');
      await cursorIn(0, 0);
      typeText('Nom');
      const saved = ed().getHTML();
      const reader = await h.renderReaderMode(saved, null);
      const cellEl = reader.querySelector('td');
      const span = Array.from(cellEl.querySelectorAll('span')).find(e => e.textContent === 'Nom');
      const readerOk = !!span && getComputedStyle(span).color === 'rgb(255, 255, 255)' && getComputedStyle(cellEl).backgroundColor === 'rgb(29, 78, 216)';
      const pdf = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
      const runs = [];
      (function walk(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (typeof n.text === 'string' && n.text.includes('Nom')) runs.push(n); Object.keys(n).forEach(k => { if (k !== 'positions') walk(n[k]); }); })(pdf.docDefinition.content);
      const pdfOk = runs.some(r => r.color === '#ffffff');
      const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
      const xml = word.parts['word/document.xml'];
      const wordOk = /<w:color w:val="FFFFFF"\/>[^]*?Nom|Nom[^]*?<w:color w:val="FFFFFF"\/>/i.test(xml) && /w:fill="1D4ED8"/i.test(xml);
      return { pass: readerOk && pdfOk && wordOk, notes: JSON.stringify({ readerOk, pdfOk, wordOk, runs: runs.map(r => [r.text, r.color]) }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_typing_style_changes_nothing_in_reader_pdf_and_word_until_text_is_typed',
    description: 'Un tableau aux cases vides qui portent un style de frappe se lit, s\'imprime et s\'exporte exactement comme le même tableau sans style : mêmes blocs de PDF, même XML Word, même hauteur de tableau à la Lecture, et aucune trace de l\'attribut dans le PDF et le Word',
    run: async (h) => {
      const plain = EMPTY;
      const styled = EMPTY.replace(/<td><p><\/p><\/td>/g, '<td><p data-typing-style="{&quot;color&quot;:&quot;#b91c1c&quot;}"></p></td>');
      const margins = PageLayout.getMarginsPt();
      const pdfPlain = await h.exportPdfContent(plain, null, margins);
      const pdfStyled = await h.exportPdfContent(styled, null, margins);
      const wordPlain = await h.exportDocxParts(plain, null, PageLayout.getMarginsTwip());
      const wordStyled = await h.exportDocxParts(styled, null, PageLayout.getMarginsTwip());
      const readerPlain = await h.renderReaderMode(plain, null);
      const heightPlain = readerPlain.querySelector('table').getBoundingClientRect().height;
      const textPlain = readerPlain.textContent;
      const readerStyled = await h.renderReaderMode(styled, null);
      const heightStyled = readerStyled.querySelector('table').getBoundingClientRect().height;
      const pdfSame = JSON.stringify(pdfPlain.docDefinition.content) === JSON.stringify(pdfStyled.docDefinition.content);
      const wordSame = wordPlain.parts['word/document.xml'] === wordStyled.parts['word/document.xml'];
      const traces = JSON.stringify(pdfStyled.docDefinition.content).includes('typing') || wordStyled.parts['word/document.xml'].includes('typing');
      const readerSame = Math.abs(heightPlain - heightStyled) < 0.5 && textPlain === readerStyled.textContent;
      return { pass: pdfSame && wordSame && !traces && readerSame, notes: JSON.stringify({ pdfSame, wordSame, traces, heightPlain, heightStyled }) };
    },
  });

  // ---- Cases vides : le reste de la mise en forme de caractère est gardé comme la couleur (gras, italique, souligné, barré, exposant, indice, taille, police, surlignage) ----
  // Antoine, 22/10, dans la foulée : « le gras ne fct pas non plus ? » - « mise en forme* ». Sur des cases vides aucune marque n'a de texte où se poser : rien ne restait, quel que soit le réglage.
  const markNames = text => (text ? text.marks.map(m => m.type.name) : []);
  const textStyleOf = text => { const mark = text && text.marks.find(m => m.type.name === 'textStyle'); return mark ? mark.attrs : {}; };
  // Le premier texte d'une case.
  const firstText = (r, c) => { let found = null; doc().nodeAt(cellPos(r, c)).descendants((node) => { if (!found && node.isText) found = node; return !found; }); return found; };
  const styledBy = key => allCells().filter(([r, c]) => { const s = styleOf(r, c); return !!s && s !== 'absent' && !!s[key]; }).map(([r, c]) => r + ',' + c);
  const typingStyleAttrs = () => (ed().getHTML().match(/data-typing-style=/g) || []).length;
  const pressed = id => document.getElementById(id).classList.contains('is-active');
  const GEORGIA = () => pickFromPanel('v2-font-chip', '.v2-format-panel button[data-action="Georgia"]');
  const SIZE_24 = () => pickFromPanel('v2-size-chip-val', '.v2-format-panel button[data-action="24pt"]');
  // Chaque réglage : la clé du style de frappe qui le garde, comment le choisir dans la barre d'outils (clic sur son bouton, entrée de son menu), et ce que le texte tapé ensuite doit porter.
  const FORMATS = [
    { key: 'bold', act: h => h.clickButton('v2-btn-bold'), has: t => markNames(t).includes('bold') },
    { key: 'italic', act: h => h.clickButton('v2-btn-italic'), has: t => markNames(t).includes('italic') },
    { key: 'underline', act: h => h.clickButton('v2-btn-underline'), has: t => markNames(t).includes('underline') },
    { key: 'strike', act: h => h.clickButton('v2-btn-strike'), has: t => markNames(t).includes('strike') },
    { key: 'superscript', act: h => h.clickButton('v2-btn-superscript'), has: t => markNames(t).includes('superscript') },
    { key: 'subscript', act: h => h.clickButton('v2-btn-subscript'), has: t => markNames(t).includes('subscript') },
    { key: 'fontSize', act: SIZE_24, has: t => textStyleOf(t).fontSize === '24pt' },
    { key: 'fontFamily', act: GEORGIA, has: t => textStyleOf(t).fontFamily === 'Georgia' },
    { key: 'backgroundColor', act: () => pickFromPanel('v2-btn-highlight-caret', '.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]'), has: t => textStyleOf(t).backgroundColor === '#fff2a8' },
  ];

  cases.push({
    id: 'cells_empty_every_character_format_is_kept_for_the_text_typed_next',
    description: 'Quatre cases VIDES (2x2) sélectionnées, puis, tour à tour, gras, italique, souligné, barré, exposant, indice, taille, police et surlignage choisis dans la barre d\'outils : le style de frappe des quatre cases (et d\'elles seules) porte le réglage ; le texte tapé ensuite dans l\'une d\'elles le porte, celui d\'une case vide hors de la sélection non (avant : sur des cases vides, aucun réglage ne restait)',
    run: async (h) => {
      const results = [];
      for (const f of FORMATS) {
        results.push(await withTable(h, async () => {
          await selectCells(...RECT);
          await f.act(h);
          const styled = styledBy(f.key);
          const kept = stillSelected(RECT);
          await cursorIn(0, 0);
          typeText('Abc');
          await cursorIn(2, 2);
          typeText('Hors');
          return { key: f.key, ok: JSON.stringify(styled) === JSON.stringify(RECT_KEYS) && kept && f.has(firstText(0, 0)) && !f.has(firstText(2, 2)), styled: styled.length, kept };
        }, EMPTY));
      }
      return { pass: results.every(r => r.ok), notes: JSON.stringify(results.filter(r => !r.ok)) || 'ok' };
    },
  });

  cases.push({
    id: 'cells_empty_bold_second_click_turns_it_off_and_the_toolbar_shows_it',
    description: 'Gras sur quatre cases vides sélectionnées : le bouton Gras est enfoncé (jamais, sans texte à lire) ; un second clic l\'éteint (le style de frappe disparaît, le bouton se relève) et le texte tapé ensuite n\'est pas en gras ; Ctrl+B, lui, fait de même',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-bold');
      await sleep(60);
      const on = { styled: styledBy('bold').length, pressed: pressed('v2-btn-bold') };
      await h.clickButton('v2-btn-bold');
      await sleep(60);
      const off = { styled: styledBy('bold').length, pressed: pressed('v2-btn-bold'), attrs: typingStyleAttrs() };
      ed().commands.toggleBold();
      await sleep(60);
      const key = { styled: styledBy('bold').length, pressed: pressed('v2-btn-bold') };
      ed().commands.toggleBold();
      await sleep(60);
      const keyOff = { styled: styledBy('bold').length, pressed: pressed('v2-btn-bold') };
      await cursorIn(0, 0);
      typeText('Maigre');
      const names = markNames(firstText(0, 0));
      return {
        pass: on.styled === 4 && on.pressed && off.styled === 0 && !off.pressed && off.attrs === 0 && key.styled === 4 && key.pressed && keyOff.styled === 0 && !keyOff.pressed && !names.includes('bold'),
        notes: JSON.stringify({ on, off, key, keyOff, names }),
      };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_superscript_and_subscript_exclude_each_other',
    description: 'Exposant puis indice sur quatre cases vides : le style de frappe des cases passe de l\'un à l\'autre (jamais les deux, comme les deux marques du texte) et le texte tapé est en indice seulement',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-superscript');
      const first = styleOf(0, 0);
      await h.clickButton('v2-btn-subscript');
      const second = styleOf(0, 0);
      await cursorIn(0, 0);
      typeText('x');
      const names = markNames(firstText(0, 0));
      const ok = !!first && first !== 'absent' && !!second && second !== 'absent' && first.superscript === true && !first.subscript && second.subscript === true && !second.superscript;
      return { pass: ok && names.includes('subscript') && !names.includes('superscript'), notes: JSON.stringify({ first, second, names }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_size_and_font_chips_show_what_the_selected_cells_keep',
    description: 'Taille 24 pt et police Georgia choisies sur quatre cases vides sélectionnées : les deux cases de la barre d\'outils montrent « 24pt » et « Georgia » (avant : « 10.5pt » et « Roboto », comme si rien n\'avait été choisi)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await SIZE_24();
      await GEORGIA();
      await sleep(80);
      const size = document.getElementById('v2-size-chip-val').textContent.trim();
      const font = document.getElementById('v2-font-chip-val').textContent.trim();
      return { pass: size === '24pt' && font === 'Georgia', notes: JSON.stringify({ size, font }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_formats_stack_and_each_one_is_its_own_undo',
    description: 'Gras, puis (700 ms plus tard) une couleur, puis une taille, sur quatre cases vides : les trois réglages sont dans le style de frappe des quatre cases ; chaque Annuler défait le dernier seul (la taille, puis la couleur, puis le gras) et Rétablir les rend',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-bold');
      await sleep(700);
      await pickRed();
      await sleep(700);
      await SIZE_24();
      const shape = () => { const s = styleOf(0, 0); return !s || s === 'absent' ? '' : Object.keys(s).join('+'); };
      const all = shape();
      ed().commands.undo(); await sleep(60);
      const one = shape();
      ed().commands.undo(); await sleep(60);
      const two = shape();
      ed().commands.undo(); await sleep(60);
      const three = shape();
      ed().commands.redo(); ed().commands.redo(); ed().commands.redo(); await sleep(60);
      const redone = shape();
      return { pass: all === 'bold+color+fontSize' && one === 'bold+color' && two === 'bold' && three === '' && redone === 'bold+color+fontSize', notes: JSON.stringify({ all, one, two, three, redone }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_bold_with_the_cursor_in_one_cell_survives_leaving_it_and_toggles_off',
    description: 'Le curseur dans UNE case vide, Gras : le bouton est enfoncé ; le gras reste quand le curseur part puis revient (avant : la marque en attente tombait au premier déplacement) et le texte tapé au retour est en gras ; revenu dans la case, un clic sur Gras l\'éteint',
    run: async (h) => withTable(h, async () => {
      await cursorIn(1, 1);
      await h.clickButton('v2-btn-bold');
      await sleep(60);
      const first = pressed('v2-btn-bold');
      await cursorIn(2, 2);
      await sleep(60);
      const elsewhere = pressed('v2-btn-bold');
      await cursorIn(1, 1);
      await sleep(60);
      const back = pressed('v2-btn-bold');
      await h.clickButton('v2-btn-bold');
      await sleep(60);
      const off = { pressed: pressed('v2-btn-bold'), styled: styledBy('bold').length };
      typeText('Maigre');
      const names = markNames(firstText(1, 1));
      await cursorIn(0, 0);
      await h.clickButton('v2-btn-bold');
      await cursorIn(1, 2);
      await cursorIn(0, 0);
      typeText('Retour');
      const returned = markNames(firstText(0, 0));
      return {
        pass: first && !elsewhere && back && !off.pressed && off.styled === 0 && !names.includes('bold') && returned.includes('bold') && !styleOf(2, 2),
        notes: JSON.stringify({ first, elsewhere, back, off, names, returned }),
      };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_bold_and_color_a_variable_put_in_the_cell_takes_both',
    description: 'Gras et couleur choisis sur des cases vides, puis « # » tapé dans l\'une d\'elles et remplacé par une bulle de variable : la bulle porte le gras et la couleur, comme le texte qui la suit (avant, la bulle n\'avait aucune marque)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      await h.clickButton('v2-btn-bold');
      await pickRed();
      await cursorIn(0, 1);
      typeText('#');
      const { from, to } = ed().state.selection;
      ed().chain().focus().insertContentAt({ from: from - 1, to }, { type: 'varBadge', attrs: { table: 'Tbl', column: 'Nom', key: 'Tbl.Nom' } }).run();
      await sleep(40);
      typeText(' fin');
      let bubble = null;
      doc().descendants((node) => { if (node.type.name === 'varBadge') bubble = node; return true; });
      const tail = firstText(0, 1);
      const bubbleOk = !!bubble && markNames({ marks: bubble.marks }).includes('bold') && textStyleOf({ marks: bubble.marks }).color === RED;
      const tailText = cellInfo(0, 1).text;
      return { pass: bubbleOk && tailText.endsWith(' fin') && !!tail, notes: JSON.stringify({ bubble: bubble && bubble.marks.map(m => m.type.name), text: tailText }) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_format_on_cells_with_text_is_unchanged_and_leaves_no_typing_style',
    description: 'Quatre cases qui ont du texte : gras, italique, souligné, barré, exposant, indice, taille, police et surlignage mettent en forme ce texte comme avant (les quatre cases, aucune autre) et n\'écrivent aucun style de frappe (il ne sert qu\'aux paragraphes vides)',
    run: async (h) => {
      const results = [];
      for (const f of FORMATS) {
        results.push(await withTable(h, async () => {
          await selectCells(...RECT);
          await f.act(h);
          const reached = allCells().filter(([r, c]) => inRect(r, c, RECT)).map(([r, c]) => f.has(firstText(r, c)));
          const untouched = allCells().filter(([r, c]) => !inRect(r, c, RECT)).map(([r, c]) => f.has(firstText(r, c)));
          return { key: f.key, ok: reached.every(Boolean) && untouched.every(v => !v) && typingStyleAttrs() === 0 };
        }));
      }
      return { pass: results.every(r => r.ok), notes: JSON.stringify(results.filter(r => !r.ok)) || 'ok' };
    },
  });

  cases.push({
    id: 'cells_empty_bold_under_track_changes_writes_nothing_to_track',
    description: 'Suivi des modifications actif, gras puis taille choisis sur des cases vides : aucun style de frappe n\'est écrit et le suivi ne garde aucune modification (un attribut de paragraphe n\'a rien à proposer à accepter ou refuser)',
    run: async (h) => withTable(h, async () => {
      const wasOn = Editor.isTrackChangesOn();
      if (!wasOn) await h.clickButton('v2-btn-track-changes');
      try {
        await selectCells(...RECT);
        await h.clickButton('v2-btn-bold');
        await SIZE_24();
        const html = ed().getHTML();
        return { pass: !/data-typing-style|data-tc-|<ins|<del/.test(html), notes: html.slice(0, 300) };
      } finally {
        if (Editor.isTrackChangesOn() !== wasOn) await h.clickButton('v2-btn-track-changes');
      }
    }, EMPTY),
  });

  cases.push({
    id: 'cells_typing_style_formats_are_read_back_only_with_known_safe_values',
    description: 'Un HTML enregistré (ou collé) dont le style de frappe porte un gras vrai, une taille ou une police sûres : gardés ; une marque qui n\'est pas `true`, une taille ou une police qui glissent une autre déclaration CSS, un exposant et un indice à la fois (un seul reste) : ignorés ou réduits',
    run: async (h) => withTable(h, async () => {
      const cell = style => `<td><p data-typing-style="${style}"></p></td>`;
      Editor.setHTML('<table><tbody><tr>'
        + cell('{&quot;bold&quot;:true,&quot;fontSize&quot;:&quot;24pt&quot;,&quot;fontFamily&quot;:&quot;Times New Roman&quot;}')
        + cell('{&quot;bold&quot;:&quot;true&quot;,&quot;italic&quot;:false}')
        + cell('{&quot;fontSize&quot;:&quot;1px; position: fixed&quot;,&quot;fontFamily&quot;:&quot;a; background: url(x)&quot;}')
        + cell('{&quot;superscript&quot;:true,&quot;subscript&quot;:true}')
        + '</tr></tbody></table><p></p>');
      await sleep(150);
      const styles = [0, 1, 2, 3].map(c => styleOf(0, c));
      const ok = !!styles[0] && JSON.stringify(styles[0]) === JSON.stringify({ bold: true, fontSize: '24pt', fontFamily: 'Times New Roman' })
        && styles[1] === null && styles[2] === null && !!styles[3] && JSON.stringify(styles[3]) === JSON.stringify({ superscript: true });
      return { pass: ok, notes: JSON.stringify(styles) };
    }, EMPTY),
  });

  cases.push({
    id: 'cells_empty_bold_italic_underline_typed_text_reaches_reader_pdf_and_word',
    description: 'Fond sur des cases vides, puis gras, italique et souligné, puis du texte tapé : la Lecture, le PDF et le Word le montrent gras, italique et souligné (avant, rien ne restait : texte ordinaire dans les trois)',
    run: async (h) => withTable(h, async () => {
      await selectCells(...RECT);
      const sel = ed().state.selection;
      const tr = ed().state.tr;
      sel.forEachCell((cell, pos) => tr.setNodeMarkup(pos, undefined, Object.assign({}, cell.attrs, { backgroundColor: '#fde68a' })));
      ed().view.dispatch(tr);
      await h.clickButton('v2-btn-bold');
      await h.clickButton('v2-btn-italic');
      await h.clickButton('v2-btn-underline');
      await cursorIn(0, 0);
      typeText('Nom');
      const saved = ed().getHTML();
      const reader = await h.renderReaderMode(saved, null);
      const leaf = h.findByText(reader, 'Nom');
      const style = leaf ? getComputedStyle(leaf) : null;
      const readerOk = !!style && Number(style.fontWeight) >= 600 && style.fontStyle === 'italic' && style.textDecorationLine.includes('underline');
      const pdf = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
      const runs = [];
      (function walk(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (typeof n.text === 'string' && n.text.includes('Nom')) runs.push(n); Object.keys(n).forEach(k => { if (k !== 'positions') walk(n[k]); }); })(pdf.docDefinition.content);
      const pdfOk = runs.some(r => r.bold === true && r.italics === true && [].concat(r.decoration || []).includes('underline'));
      const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
      const run = (word.parts['word/document.xml'].match(/<w:r>[^]*?<\/w:r>/g) || []).find(r => r.includes('>Nom<')) || '';
      const wordOk = /<w:b\/>/.test(run) && /<w:i\/>/.test(run) && /<w:u w:val="single"\/>/.test(run);
      return { pass: readerOk && pdfOk && wordOk, notes: JSON.stringify({ readerOk, pdfOk, wordOk, runs: runs.map(r => [r.text, r.bold, r.italics, r.decoration]) }) };
    }, EMPTY),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tableCells = cases;
})();
