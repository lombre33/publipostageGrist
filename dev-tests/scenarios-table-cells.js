// Suite "tableCells" - plusieurs cases d'un tableau de document sélectionnées d'un coup (CellSelection de prosemirror-tables, glissé à la souris - js/table-select.js) : la mise en forme
// de la barre d'outils et le copier-coller doivent porter sur TOUTES les cases (Antoine, 02/10 : « dans un module tableau on peut bel et bien sélectionner désormais plusieurs cellules
// d'un coup, par contre j'ai l'impression que je ne peux pas faire d'édition dessus ? Le but serait de pouvoir mettre en forme et/ou C/C la sélection »). Le gras, l'italique, le
// souligné, le barré et l'alignement parcouraient déjà les cases (les `ranges` de la sélection) ; la police, la taille, la couleur et le surlignage rétablissaient la
// sélection en simple texte (la case de tête seule, la sélection de cases éteinte) et les listes ne regardaient que la case de tête. Les gestes à la vraie souris et au vrai clavier
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
  // Ce que porte une case : ses marques de style (taille, police, couleur, surlignage), ses listes et ses blocs.
  function cellInfo(r, c) {
    const cell = doc().nodeAt(cellPos(r, c));
    const info = { size: [], family: [], color: [], background: [], lists: [], quotes: 0, headings: 0, text: cell.textContent };
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
