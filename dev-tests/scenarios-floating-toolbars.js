// Suite "floatingToolbars" - les barres flottantes de js/floating-toolbars.js, bouton par bouton : celle d'un tableau (menu du fond, commandes), celle d'une image (taille, calque,
// habillage, « Sur toutes les pages », curseur d'opacité) et celle d'une bulle #Variable (écriture d'un nombre ou d'une date). Les autres suites touchent aussi ces barres
// (images, tables, layers, pageLayer, varFormat, varZero, varBool, condText, condValue, condCheckbox, trackChanges) ; ce groupe ne reprend que ce que leurs scénarios ne jouent pas : les
// lignes de js/floating-toolbars.js qu'aucun groupe ni aucun script souris n'exécutait (relevé de couverture du 05/10), écrites AVANT le rangement de ce fichier en modules (vertes
// avant et après).
(function () {
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const cases = [];
  const ed = () => EditorCore.getEditor();
  const press = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // La barre (parmi les barres flottantes de la page) qui porte ce bouton : « Agrandir » est à l'image seule, « Ligne avant » au tableau seul.
  const barWith = action => [...document.querySelectorAll('.v2-floating-toolbar')].find(el => el.querySelector('button[data-action="' + action + '"]')) || null;
  const buttonOf = (bar, action) => (bar && bar.querySelector('button[data-action="' + action + '"]')) || null;
  const shown = bar => !!bar && bar.classList.contains('visible');
  async function press_(h, bar, action) {
    const btn = buttonOf(bar, action);
    if (!btn) throw new Error('bouton « ' + action + ' » introuvable');
    press(btn);
    await h.sleep(120);
    return btn;
  }
  const imageNode = () => { let found = null; ed().state.doc.descendants((n, p) => { if (!found && n.type.name === 'editorImage') found = { node: n, pos: p }; }); return found; };
  const imageAttrs = () => imageNode().node.attrs;
  const selectedNaturalSize = () => { const img = ed().view.nodeDOM(imageNode().pos).querySelector('img'); return { w: img.naturalWidth, h: img.naturalHeight }; };
  const imageHtml = (o) => '<img class="editor-image" src="' + DATA_PNG + '" alt=""' + (o && o.style ? ' style="' + o.style + '"' : '')
    + (o && o.layer ? ' data-layer="' + o.layer + '"' : '') + (o && o.wrap ? ' data-wrap="' + o.wrap + '"' : '') + '>';
  // L'image `n` (0 pour la première) sélectionnée comme un clic la sélectionne : le focus d'abord, la barre se met à jour sur la transaction de sélection.
  async function selectImage(h, n) {
    ed().view.focus();
    let seen = 0;
    let pos = -1;
    ed().state.doc.descendants((node, p) => { if (node.type.name === 'editorImage' && seen++ === (n || 0)) pos = p; });
    if (pos < 0) throw new Error('image introuvable');
    ed().commands.setNodeSelection(pos);
    await h.sleep(120);
    return barWith('zoom-in');
  }
  // Les attributs de l'image changés dans le modèle, comme le fait un chargement ancien ou une autre fonction.
  async function setImageAttrs(h, patch) {
    const f = imageNode();
    ed().view.dispatch(ed().state.tr.setNodeMarkup(f.pos, undefined, Object.assign({}, f.node.attrs, patch)));
    await h.sleep(60);
  }

  // === La barre du tableau : le menu du fond ===
  async function tableWithCursor(h) {
    await h.resetEditor();
    Editor.setHTML('<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table><p>Après</p>');
    await h.sleep(200);
    ed().view.focus();
    let pos = -1;
    ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === 'Alpha') pos = p + 2; });
    ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
    await h.sleep(150);
    return barWith('row-before');
  }
  const openMenus = () => [...document.querySelectorAll('.v2-color-dropdown.visible')];

  cases.push({
    id: 'ft_table_fill_button_opens_its_menu_and_a_second_press_closes_it',
    description: 'Le bouton « Fond de cellule » de la barre du tableau ouvre le menu de nuances ; un second appui sur le même bouton le referme (sans rien changer) ; un appui sur une nuance pose le fond et referme',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      if (!shown(bar)) return { pass: false, notes: 'barre du tableau fermée, curseur dans une case' };
      const out = {};
      await press_(h, bar, 'fill-open');
      out.opened = openMenus().length === 1 && openMenus()[0].querySelectorAll('.cp-grid button[data-action^="pick:"]').length === ColorPalette.ROWS.flat().length;
      const before = Editor.getHTML();
      await press_(h, bar, 'fill-open');
      out.closed = openMenus().length === 0;
      out.unchanged = Editor.getHTML() === before;
      await press_(h, bar, 'fill-open');
      const swatch = openMenus()[0] && openMenus()[0].querySelector('button[data-action="pick:#c8f7c5"]');
      if (swatch) press(swatch);
      await h.sleep(150);
      out.picked = openMenus().length === 0 && /background-color: rgb\(200, 247, 197\)/.test(Editor.getHTML());
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_table_toolbar_buttons_run_their_commands',
    description: 'Les boutons de la barre du tableau : ligne avant, ligne après, colonne avant, colonne après, supprimer la ligne, la colonne, le tableau ; chacun fait ce que dit son bouton',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      if (!shown(bar)) return { pass: false, notes: 'barre du tableau fermée, curseur dans une case' };
      const dims = () => { const t = h.tiptap().querySelector('table'); return t ? t.rows.length + 'x' + t.rows[0].cells.length : 'aucun'; };
      const out = { start: dims() === '2x2' };
      await press_(h, bar, 'row-before'); out.rowBefore = dims() === '3x2';
      await press_(h, bar, 'row-after'); out.rowAfter = dims() === '4x2';
      await press_(h, bar, 'row-del'); out.rowDel = dims() === '3x2';
      await press_(h, bar, 'col-before'); out.colBefore = dims() === '3x3';
      await press_(h, bar, 'col-after'); out.colAfter = dims() === '3x4';
      await press_(h, bar, 'col-del'); out.colDel = dims() === '3x3';
      await press_(h, bar, 'table-del'); out.tableDel = dims() === 'aucun' && /Après/.test(Editor.getHTML());
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_table_bar_shows_in_a_cell_only_and_closes_when_the_editor_loses_the_focus_or_a_click_lands_elsewhere',
    description: 'La barre du tableau s\'ouvre curseur dans une case, se ferme curseur dans le paragraphe d\'après, quand l\'éditeur perd le focus et à un clic hors de l\'éditeur et de la barre, et se rouvre au retour dans la case',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      const out = { inCell: shown(bar) };
      const caretAt = async (text, off) => {
        ed().view.focus();
        let pos = -1;
        ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === text) pos = p + off; });
        ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
        await h.sleep(150);
      };
      await caretAt('Après', 2);
      out.outside = !shown(bar);
      await caretAt('Delta', 2);
      out.backInCell = shown(bar);
      ed().view.dom.blur();
      await h.sleep(60);
      ed().view.dispatch(ed().state.tr);
      await h.sleep(120);
      out.blurred = !shown(bar);
      await caretAt('Gamma', 2);
      out.again = shown(bar);
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(120);
      out.clickElsewhere = !shown(bar);
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_table_bar_greys_delete_row_and_column_through_a_merged_cell_only_while_tracking',
    description: 'Avec le suivi des modifications, « Supprimer la colonne » (la colonne passe par une case fusionnée sur deux colonnes) et « Supprimer la ligne » (la ligne passe par une case fusionnée sur deux lignes) sont grisés avec leur raison et ne font rien ; sans suivi, ils sont libres et suppriment',
    run: async (h) => {
      const out = {};
      const MERGED_COLUMNS = '<table><tbody><tr><td colspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
      const MERGED_ROWS = '<table><tbody><tr><td rowspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
      const cursorIn = async (text) => {
        ed().view.focus();
        let pos = -1;
        ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === text) pos = p + 1; });
        ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
        await h.sleep(150);
        return barWith('row-before');
      };
      try {
        // Le curseur est dans une case que la case fusionnée domine : la colonne (ou la ligne) à supprimer la traverse.
        for (const [name, html, which, cell, keys] of [['columns', MERGED_COLUMNS, 'col-del', 'a2', ['table.colDel', 'table.colDelMerged']], ['rows', MERGED_ROWS, 'row-del', 'c1', ['table.rowDel', 'table.rowDelMerged']]]) {
          await h.resetEditor();
          Editor.setHTML(html);
          await h.sleep(250);
          let bar = await cursorIn(cell);
          const free = buttonOf(bar, which);
          out[name + 'Free'] = !free.classList.contains('is-disabled') && free.getAttribute('aria-disabled') === 'false' && free.title === I18n.t(keys[0]);
          Editor.setTrackChanges(true);
          await h.sleep(200);
          bar = await cursorIn(cell);
          const tracked = buttonOf(bar, which);
          out[name + 'Blocked'] = tracked.classList.contains('is-disabled') && tracked.getAttribute('aria-disabled') === 'true' && tracked.title === I18n.t(keys[1]);
          const before = Editor.getHTML();
          await press_(h, bar, which);
          out[name + 'PressNothing'] = Editor.getHTML() === before;
          Editor.setTrackChanges(false);
          await h.sleep(200);
          bar = await cursorIn(cell);
          const back = buttonOf(bar, which);
          out[name + 'FreeAgain'] = !back.classList.contains('is-disabled') && back.getAttribute('aria-disabled') === 'false' && back.title === I18n.t(keys[0]);
          await press_(h, bar, which);
          out[name + 'Deletes'] = Editor.getHTML() !== before;
        }
      } finally { Editor.setTrackChanges(false); await h.sleep(150); }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_table_bar_fill_stripe_shows_the_background_of_the_cell_under_the_cursor',
    description: 'Le trait de couleur du bouton « Fond de cellule » prend la nuance posée sur la case et redevient transparent sur une case sans fond (et après « Aucune couleur »)',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      const stripe = () => document.getElementById('v2-table-fill-bar').style.background;
      const out = { start: stripe() === 'transparent' || stripe() === '' };
      await press_(h, bar, 'fill-open');
      const swatch = openMenus()[0].querySelector('button[data-action="pick:#c8f7c5"]');
      press(swatch);
      await h.sleep(200);
      out.picked = /rgb\(200, 247, 197\)/.test(stripe());
      // Une case sans fond : le trait se vide.
      ed().view.focus();
      let pos = -1;
      ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === 'Delta') pos = p + 2; });
      ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
      await h.sleep(150);
      out.otherCell = stripe() === 'transparent';
      ed().view.focus();
      pos = -1;
      ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === 'Alpha') pos = p + 2; });
      ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
      await h.sleep(150);
      out.back = /rgb\(200, 247, 197\)/.test(stripe());
      await press_(h, bar, 'fill-open');
      press(openMenus()[0].querySelector('button[data-action="none"]'));
      await h.sleep(200);
      out.none = stripe() === 'transparent' && !/background-color/.test(Editor.getHTML());
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' stripe=' + stripe() };
    },
  });

  cases.push({
    id: 'ft_table_bar_in_a_grid_docks_in_the_grid_band_greys_what_has_no_sense_and_sets_the_vertical_alignment',
    description: 'Dans une grille, la barre du tableau est fixée dans la bande de la grille : « Supprimer le tableau » grisé, « Fusionner » et « Scinder » grisés tant qu\'ils n\'ont pas de sens, « Légende » grisé ; l\'alignement vertical posé (haut, milieu, bas) allume son seul bouton ; la barre d\'un tableau du document, ensuite, n\'a aucun grisé de grille et montre aussi « Bordures » et l\'alignement vertical',
    run: async (h) => {
      const out = {};
      const notes = {};
      const locked = (bar, action) => { const b = buttonOf(bar, action); return b.classList.contains('v2-hf-locked') && b.getAttribute('aria-disabled') === 'true'; };
      const free = (bar, action) => { const b = buttonOf(bar, action); return !b.classList.contains('v2-hf-locked') && b.getAttribute('aria-disabled') === 'false'; };
      const aligned = bar => ['top', 'middle', 'bottom'].map(v => { const b = buttonOf(bar, 'valign-' + v); return (b.classList.contains('is-active') ? '*' : '') + b.getAttribute('aria-pressed'); }).join(' ');
      try {
        await h.resetEditor();
        GridEditor.setActive(true);
        await h.sleep(400);
        let cellParagraph = -1;
        ed().state.doc.descendants((node, p) => { if (cellParagraph < 0 && node.type.name === 'paragraph') cellParagraph = p; });
        ed().view.focus();
        ed().commands.setTextSelection(cellParagraph + 1);
        await h.sleep(200);
        const bar = barWith('row-before');
        const slot = GridEditor.barSlot();
        out.docked = !!slot && slot.contains(bar) && shown(bar);
        const settingDisplays = target => ['borders-open', 'valign-top', 'valign-middle', 'valign-bottom'].map(a => getComputedStyle(buttonOf(target, a)).display);
        out.gridButtonsShown = settingDisplays(bar).every(d => d !== 'none');
        out.tableDel = locked(bar, 'table-del');
        out.oneCell = locked(bar, 'cell-merge') && locked(bar, 'cell-split');
        const caption = buttonOf(bar, 'caption');
        out.caption = caption.classList.contains('is-disabled') && caption.getAttribute('aria-disabled') === 'true' && caption.title !== I18n.t('caption.addTable');
        out.mergeNotDisabled = !buttonOf(bar, 'cell-merge').classList.contains('is-disabled');
        notes.start = aligned(bar);
        for (const [action, want] of [['valign-bottom', '*true'], ['valign-middle', '*true'], ['valign-top', '*true']]) {
          await press_(h, bar, action);
          const state = aligned(bar).split(' ');
          const at = ['top', 'middle', 'bottom'].indexOf(action.replace('valign-', ''));
          out[action] = GridEditor.selectedVerticalAlign(ed()) === action.replace('valign-', '') && state.every((s, i) => s === (i === at ? '*true' : 'false'));
          notes[action] = state.join(' ');
        }
        // Deux cases voisines : « Fusionner » est libre, « Scinder » reste grisé ; une fois fusionnées, l'inverse.
        const cells = [];
        ed().state.doc.descendants((node, p) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells.push(p); });
        ed().view.focus();
        ed().commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
        await h.sleep(200);
        out.twoCells = free(bar, 'cell-merge') && locked(bar, 'cell-split');
        await press_(h, bar, 'cell-merge');
        out.merged = locked(bar, 'cell-merge') && free(bar, 'cell-split');
        await press_(h, bar, 'cell-split');
        out.split = free(bar, 'cell-merge') || locked(bar, 'cell-split');
        GridEditor.setActive(false);
        await h.sleep(300);
        const docBar = await tableWithCursor(h);
        out.documentBarShowsSettings = settingDisplays(docBar).every(d => d !== 'none');
        out.documentBar = shown(docBar) && !GridEditor.isActive() && !(slot && slot.contains(docBar)) && free(docBar, 'table-del') && !buttonOf(docBar, 'cell-merge').classList.contains('v2-hf-locked') && !buttonOf(docBar, 'cell-split').classList.contains('v2-hf-locked');
      } finally {
        GridEditor.setActive(false);
        await h.sleep(250);
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  // === La barre du tableau d'un document : alignement vertical et bordures (lot 3 sur 6 de « le tableau d'un document est un tableau de grille ») ===
  // Les attributs de la case dont le texte est `text` ; la case est choisie ou le curseur y est posé par `cursorInCell`.
  const cellNodeOf = (text) => {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (!found && (node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.textContent === text) found = { node, pos }; });
    return found;
  };
  const cellAttr = (text, name) => { const cell = cellNodeOf(text); return cell ? cell.node.attrs[name] : undefined; };
  async function cursorInCell(h, text) {
    ed().view.focus();
    ed().commands.setTextSelection(cellNodeOf(text).pos + 2);
    await h.sleep(150);
    return barWith('row-before');
  }
  async function selectCellsFrom(h, from, to) {
    ed().view.focus();
    ed().commands.setCellSelection({ anchorCell: cellNodeOf(from).pos, headCell: cellNodeOf(to).pos });
    await h.sleep(150);
    return barWith('row-before');
  }
  const pressedAlign = bar => ['top', 'middle', 'bottom'].filter((v) => { const b = buttonOf(bar, 'valign-' + v); return b.classList.contains('is-active') && b.getAttribute('aria-pressed') === 'true'; }).join();
  const settingButtons = ['borders-open', 'valign-top', 'valign-middle', 'valign-bottom'];

  cases.push({
    id: 'ft_table_bar_in_a_document_shows_the_vertical_alignment_of_the_cells_and_sets_it',
    description: 'La barre d\'un tableau de document porte « Bordures » et les trois boutons d\'alignement vertical, visibles ; l\'alignement des cases visées est enfoncé (« en haut » pour une case que personne n\'a réglée, aucun quand la sélection en mêle plusieurs) ; un appui règle les cases visées seulement, et « en haut » efface la marque',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      if (!shown(bar)) return { pass: false, notes: 'barre du tableau fermée, curseur dans une case' };
      const out = {};
      out.visible = settingButtons.every(a => buttonOf(bar, a).offsetWidth > 0 && buttonOf(bar, a).offsetHeight > 0);
      out.start = pressedAlign(bar) === 'top';
      await press_(h, bar, 'valign-bottom');
      out.bottom = cellAttr('Alpha', 'verticalAlign') === 'bottom' && !cellAttr('Beta', 'verticalAlign') && pressedAlign(bar) === 'bottom';
      await press_(h, bar, 'valign-middle');
      out.middle = cellAttr('Alpha', 'verticalAlign') === 'middle' && pressedAlign(bar) === 'middle';
      await press_(h, bar, 'valign-top');
      out.topErases = !cellAttr('Alpha', 'verticalAlign') && pressedAlign(bar) === 'top' && !/data-valign|vertical-align/.test(Editor.getHTML());
      // Deux cases en colonne : le réglage vise les deux, pas les voisines.
      const two = await selectCellsFrom(h, 'Alpha', 'Gamma');
      await press_(h, two, 'valign-middle');
      out.twoCells = cellAttr('Alpha', 'verticalAlign') === 'middle' && cellAttr('Gamma', 'verticalAlign') === 'middle' && !cellAttr('Beta', 'verticalAlign') && !cellAttr('Delta', 'verticalAlign') && pressedAlign(two) === 'middle';
      // Une case « au milieu » et sa voisine « en haut » : aucun bouton enfoncé.
      const mixed = await selectCellsFrom(h, 'Alpha', 'Beta');
      out.mixed = pressedAlign(mixed) === '';
      // Le curseur revient dans une case : la barre relit son alignement.
      const back = await cursorInCell(h, 'Delta');
      out.readsAgain = pressedAlign(back) === 'top';
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_table_bar_in_a_document_opens_the_borders_menu_sets_the_borders_and_toggles_the_gridlines',
    description: 'Le bouton « Bordures » de la barre d\'un tableau de document ouvre le menu (huit réglages, couleur du trait, « Quadrillage ») ; un réglage pose les traits sur la case visée et sur les cases voisines qui les partagent, en un seul Annuler, et referme le menu ; « Quadrillage » se coche et se décoche sans le refermer et ne touche que le tableau du curseur ; la barre reste affichée pendant que le menu est ouvert (choisir une couleur n\'est pas un appui hors de la barre)',
    run: async (h) => {
      const bar = await tableWithCursor(h);
      if (!shown(bar)) return { pass: false, notes: 'barre du tableau fermée, curseur dans une case' };
      const out = {};
      const chip = buttonOf(bar, 'borders-open');
      const menu = () => openMenus().find(m => m.querySelector('button[data-action="borders:all"]')) || null;
      const edges = text => ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].map(n => cellAttr(text, n) || '-').join(',');
      out.chipShown = chip.offsetWidth > 0 && chip.offsetHeight > 0;
      await press_(h, bar, 'borders-open');
      out.opened = !!menu() && chip.getAttribute('aria-expanded') === 'true' && menu().querySelectorAll('.v2-borders-presets button').length === 8
        && menu().querySelector('button[data-action="gridlines"]').getAttribute('aria-checked') === 'true';
      // Le stylo : un rouge de la palette, puis « Toutes les bordures » sur la case Alpha seule.
      const pen = menu().querySelector('button[data-action^="pen:"]');
      const penColor = pen && pen.dataset.action.slice('pen:'.length).toLowerCase();
      if (pen) press(pen);
      await h.sleep(120);
      // Un appui dans le menu n'est pas un appui hors de la barre : elle reste affichée, sinon le bouton du menu disparaît et le menu perd son ancre.
      out.penKeepsMenu = !!menu();
      out.penKeepsBar = shown(bar);
      press(menu().querySelector('button[data-action="borders:all"]'));
      await h.sleep(150);
      out.closed = !menu() && chip.getAttribute('aria-expanded') === 'false';
      out.alpha = !!penColor && edges('Alpha') === [penColor, penColor, penColor, penColor].join(',');
      out.sharedEdges = cellAttr('Beta', 'borderLeft') === penColor && cellAttr('Gamma', 'borderTop') === penColor && edges('Delta') === '-,-,-,-';
      out.html = /data-border-top/.test(Editor.getHTML()) && /border-top: 1px solid/.test(Editor.getHTML());
      // Un seul Annuler défait tout le réglage.
      await h.sleep(700);
      ed().commands.undo();
      await h.sleep(150);
      out.oneUndo = edges('Alpha') === '-,-,-,-' && edges('Beta') === '-,-,-,-' && edges('Gamma') === '-,-,-,-';
      // Le quadrillage : la coche, sans refermer le menu.
      await cursorInCell(h, 'Alpha');
      await press_(h, bar, 'borders-open');
      const row = () => menu().querySelector('button[data-action="gridlines"]');
      press(row());
      await h.sleep(150);
      out.linesOff = !!menu() && row().getAttribute('aria-checked') === 'false' && /<table[^>]*data-grid-lines="off"/.test(Editor.getHTML()) && shown(bar);
      press(row());
      await h.sleep(150);
      out.linesOn = row().getAttribute('aria-checked') === 'true' && !/data-grid-lines/.test(Editor.getHTML());
      press(buttonOf(bar, 'borders-open'));
      await h.sleep(120);
      out.closesOnSecondPress = !menu();
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' pen=' + penColor };
    },
  });

  cases.push({
    id: 'ft_table_bar_in_a_document_greys_the_alignment_and_the_borders_while_tracking',
    description: 'Avec le suivi des modifications, « Bordures » et les trois alignements verticaux de la barre d\'un tableau de document sont grisés (jamais retirés) avec leur raison pour info-bulle, aucun n\'est enfoncé, un appui ne fait rien et n\'ouvre pas le menu ; le suivi éteint, ils reprennent leur libellé',
    run: async (h) => {
      const out = {};
      const names = { 'borders-open': 'table.bordersOpen', 'valign-top': 'table.valignTop', 'valign-middle': 'table.valignMiddle', 'valign-bottom': 'table.valignBottom' };
      const state = bar => settingButtons.map((a) => { const b = buttonOf(bar, a); return b.classList.contains('is-disabled') + ':' + b.getAttribute('aria-disabled') + ':' + (b.title === I18n.t(b.classList.contains('is-disabled') ? 'table.settingTracked' : names[a])); });
      try {
        let bar = await tableWithCursor(h);
        out.free = state(bar).every(s => s === 'false:false:true');
        Editor.setTrackChanges(true);
        await h.sleep(200);
        bar = await cursorInCell(h, 'Alpha');
        out.greyed = state(bar).every(s => s === 'true:true:true') && settingButtons.every(a => buttonOf(bar, a).offsetWidth > 0);
        out.noneEnabled = pressedAlign(bar) === '';
        const before = Editor.getHTML();
        for (const a of ['valign-bottom', 'valign-middle', 'borders-open']) await press_(h, bar, a);
        out.pressNothing = Editor.getHTML() === before && openMenus().length === 0 && buttonOf(bar, 'borders-open').getAttribute('aria-expanded') !== 'true';
        out.noSuggestion = !Editor.hasPendingTrackedChanges();
        Editor.setTrackChanges(false);
        await h.sleep(200);
        bar = await cursorInCell(h, 'Alpha');
        out.freeAgain = state(bar).every(s => s === 'false:false:true');
        await press_(h, bar, 'valign-bottom');
        out.works = cellAttr('Alpha', 'verticalAlign') === 'bottom' && pressedAlign(bar) === 'bottom';
      } finally { Editor.setTrackChanges(false); await h.sleep(150); }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  // === La barre d'une image ===
  async function imageDocument(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await h.sleep(250);
  }

  cases.push({
    id: 'ft_image_zoom_and_reset_start_from_320_px_when_the_image_has_no_width',
    description: 'Une image sans largeur écrite : « Réduire » part de 320 px (240 px), « Agrandir » aussi (400 px), « Taille d\'origine » pose 320 px et retire l\'alignement',
    run: async (h) => {
      await imageDocument(h, '<p>Avant ' + imageHtml() + ' après</p>');
      const out = {};
      await setImageAttrs(h, { width: null });
      const bar = await selectImage(h, 0);
      out.noWidth = imageAttrs().width == null;
      await press_(h, bar, 'zoom-out'); out.out = imageAttrs().width === '240px';
      await setImageAttrs(h, { width: null });
      await selectImage(h, 0);
      out.noWidthAgain = imageAttrs().width == null;
      await press_(h, bar, 'zoom-in'); out.in = imageAttrs().width === '400px';
      await setImageAttrs(h, { width: '77px', align: 'right' });
      await selectImage(h, 0);
      await press_(h, bar, 'reset'); out.reset = imageAttrs().width === '320px' && imageAttrs().align == null;
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(imageAttrs()) };
    },
  });

  cases.push({
    id: 'ft_image_in_text_button_brings_a_layered_image_back_to_the_flow',
    description: 'Le bouton « Dans le texte » ramène une image devant ou derrière le texte dans le flux (calque normal, case « Sur toutes les pages » effacée), et son bouton s\'allume',
    run: async (h) => {
      await imageDocument(h, '<p>Texte ' + imageHtml() + ' autour</p>');
      const bar = await selectImage(h, 0);
      const out = {};
      await press_(h, bar, 'layer-behind');
      out.behind = imageAttrs().layer === 'behind' && buttonOf(bar, 'layer-behind').classList.contains('is-active');
      await press_(h, bar, 'layer-normal');
      out.normal = imageAttrs().layer === 'normal' && buttonOf(bar, 'layer-normal').classList.contains('is-active') && !buttonOf(bar, 'layer-behind').classList.contains('is-active');
      await press_(h, bar, 'layer-front');
      out.front = imageAttrs().layer === 'front' && buttonOf(bar, 'layer-front').classList.contains('is-active');
      await press_(h, bar, 'layer-normal');
      out.normalAgain = imageAttrs().layer === 'normal' && imageAttrs().repeat === false;
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(imageAttrs()) };
    },
  });

  cases.push({
    id: 'ft_image_layer_buttons_read_the_rendered_place_once_and_keep_it_afterwards',
    description: 'Les boutons « Devant » et « Derrière » : une image du flux garde la place où elle s\'affiche (left et top lus sur le rendu, à l\'unité près, au zoom de la feuille et dans une case de tableau), une place déjà écrite est gardée en changeant de calque, une place à moitié écrite (left sans top) est relue en entier, et un second appui sur le calque déjà posé ne crée aucune étape d\'annulation',
    run: async (h) => {
      const out = {};
      const notes = {};
      // La place que la barre doit écrire : le bord de l'image depuis celui du bloc qui la porte, en pixels de mise en page.
      const rendered = () => {
        const dom = ed().view.nodeDOM(imageNode().pos);
        const img = dom.querySelector('img');
        const rootRect = (dom.offsetParent || ed().view.dom).getBoundingClientRect();
        const zoom = EditorCore.layoutZoom(img);
        const r = img.getBoundingClientRect();
        return { left: Math.round((r.left - rootRect.left) / zoom), top: Math.round((r.top - rootRect.top) / zoom) };
      };
      const sheet = ed().view.dom.closest('.v2-page-sheet');
      const sheetZoom = sheet ? sheet.style.getPropertyValue('--pp-fit-zoom') : '';
      try {
        for (const zoom of ['', '0.8']) {
          if (sheet) { zoom ? sheet.style.setProperty('--pp-fit-zoom', zoom) : sheet.style.removeProperty('--pp-fit-zoom'); await h.sleep(150); }
          const z = zoom || '1';
          for (const target of ['front', 'behind']) {
            await imageDocument(h, '<p>Texte ' + imageHtml({ style: 'width: 120px' }) + ' autour</p>');
            const bar = await selectImage(h, 0);
            const want = rendered();
            await press_(h, bar, 'layer-' + target);
            const got = imageAttrs();
            out[target + '@' + z] = got.layer === target && got.left === want.left && got.top === want.top && got.repeat === false;
            notes[target + '@' + z] = { want, left: got.left, top: got.top, layer: got.layer };
          }
        }
        if (sheet) { sheetZoom ? sheet.style.setProperty('--pp-fit-zoom', sheetZoom) : sheet.style.removeProperty('--pp-fit-zoom'); await h.sleep(150); }
        // Une place déjà écrite : changer de calque la garde.
        await imageDocument(h, '<p>Texte ' + imageHtml({ style: 'width: 120px', layer: 'front' }) + ' autour</p>');
        let bar = await selectImage(h, 0);
        await setImageAttrs(h, { left: 7, top: 11 });
        await selectImage(h, 0);
        await press_(h, bar, 'layer-behind');
        out.kept = imageAttrs().layer === 'behind' && imageAttrs().left === 7 && imageAttrs().top === 11;
        // Une place à moitié écrite (left sans top) : relue en entier.
        await setImageAttrs(h, { layer: 'front', left: 7, top: null });
        await selectImage(h, 0);
        const half = rendered();
        await press_(h, bar, 'layer-behind');
        out.half = imageAttrs().layer === 'behind' && imageAttrs().left === half.left && imageAttrs().top === half.top && imageAttrs().top != null;
        notes.half = { want: half, left: imageAttrs().left, top: imageAttrs().top };
        // Dans une case de tableau, la place se compte depuis la case, pas depuis la page.
        await imageDocument(h, '<table><tbody><tr><td><p>Case</p></td><td><p>Texte ' + imageHtml({ style: 'width: 60px' }) + ' fin</p></td></tr></tbody></table>');
        bar = await selectImage(h, 0);
        const inCell = rendered();
        await press_(h, bar, 'layer-front');
        out.inCell = imageAttrs().layer === 'front' && imageAttrs().left === inCell.left && imageAttrs().top === inCell.top;
        notes.inCell = { want: inCell, left: imageAttrs().left, top: imageAttrs().top };
        // Un second appui sur le calque déjà posé ne crée aucune étape d'annulation : un Annuler défait le premier appui.
        await imageDocument(h, '<p>Texte ' + imageHtml({ style: 'width: 120px' }) + ' autour</p>');
        bar = await selectImage(h, 0);
        await h.sleep(700);
        await press_(h, bar, 'layer-front');
        await h.sleep(700);
        await press_(h, bar, 'layer-front');
        await h.sleep(700);
        ed().commands.undo();
        await h.sleep(150);
        out.noExtraStep = imageAttrs().layer === 'normal';
        notes.noExtraStep = imageAttrs().layer;
      } finally {
        if (sheet) { sheetZoom ? sheet.style.setProperty('--pp-fit-zoom', sheetZoom) : sheet.style.removeProperty('--pp-fit-zoom'); await h.sleep(150); }
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  cases.push({
    id: 'ft_image_toolbar_state_for_an_image_without_layer_or_opacity',
    description: 'Une image sans calque ni opacité écrits (document ancien) : la barre la montre dans le texte, opacité 100, alignement éteint ; avec un calque et une opacité écrits elle les montre',
    run: async (h) => {
      await imageDocument(h, '<p>Texte ' + imageHtml() + ' autour</p>');
      await setImageAttrs(h, { layer: null, opacity: null, align: null });
      const bar = await selectImage(h, 0);
      const slider = bar.querySelector('input[data-role="opacity"]');
      const out = {};
      out.old = slider.value === '100' && buttonOf(bar, 'layer-normal').classList.contains('is-active') && !buttonOf(bar, 'layer-front').classList.contains('is-active')
        && !buttonOf(bar, 'layer-behind').classList.contains('is-active') && ['left', 'center', 'right'].every(side => !buttonOf(bar, 'align-' + side).classList.contains('is-active'));
      await setImageAttrs(h, { layer: 'front', opacity: 0.35, align: null });
      await selectImage(h, 0);
      out.written = slider.value === '35' && buttonOf(bar, 'layer-front').classList.contains('is-active') && !buttonOf(bar, 'layer-normal').classList.contains('is-active');
      await setImageAttrs(h, { layer: 'normal', opacity: 1, align: 'center' });
      await selectImage(h, 0);
      out.aligned = buttonOf(bar, 'align-center').classList.contains('is-active') && !buttonOf(bar, 'align-left').classList.contains('is-active') && !buttonOf(bar, 'align-right').classList.contains('is-active');
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' valeur=' + slider.value };
    },
  });

  cases.push({
    id: 'ft_image_wrap_button_counts_any_other_content_of_the_line',
    description: 'Le bouton « en ligne / bloc » : une autre image du flux, un saut de ligne ou une bulle comptent comme du contenu (bouton actif) ; un espace seul ou une image en calque n\'en sont pas (grisé, avec sa raison)',
    run: async (h) => {
      const probe = async (html) => {
        await imageDocument(h, html);
        const bar = await selectImage(h, 0);
        const btn = buttonOf(bar, 'wrap');
        return { disabled: btn.classList.contains('is-disabled'), aria: btn.getAttribute('aria-disabled'), title: btn.title };
      };
      const BADGE = '<span class="var-badge" data-table="FtTable" data-column="Nom" data-key="Nom"></span>';
      window.__gristStub.setVariables('FtTable', { Nom: 'Text' });
      await GristAPI.refreshSchema();
      const twoFlow = await probe('<p>' + imageHtml() + imageHtml() + '</p>');
      const lineBreak = await probe('<p>' + imageHtml() + '<br></p>');
      const badge = await probe('<p>' + imageHtml() + BADGE + '</p>');
      const space = await probe('<p>' + imageHtml() + ' </p>');
      const layered = await probe('<p>' + imageHtml() + imageHtml({ layer: 'front' }) + '</p>');
      const text = await probe('<p>Du texte ' + imageHtml() + '</p>');
      const reason = I18n.t('imgToolbar.wrapNeedsText');
      const out = {
        twoFlow: !twoFlow.disabled && twoFlow.aria === 'false' && twoFlow.title === I18n.t('imgToolbar.inlineToggle'),
        lineBreak: !lineBreak.disabled && lineBreak.aria === 'false',
        badge: !badge.disabled && badge.aria === 'false',
        space: space.disabled && space.aria === 'true' && space.title === reason,
        layered: layered.disabled && layered.aria === 'true' && layered.title === reason,
        text: !text.disabled && text.aria === 'false',
      };
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify({ twoFlow, lineBreak, badge, space, layered, text }) };
    },
  });

  cases.push({
    id: 'ft_image_opacity_slider_does_nothing_when_no_image_is_selected',
    description: 'Le curseur d\'opacité de la barre de l\'image, bougé quand plus aucune image n\'est sélectionnée (barre fermée), ne change rien dans le document',
    run: async (h) => {
      await imageDocument(h, '<p>Texte ' + imageHtml() + ' autour</p><p>Suite</p>');
      const bar = await selectImage(h, 0);
      await press_(h, bar, 'layer-front');
      const opened = shown(bar);
      ed().commands.setTextSelection(3);
      await h.sleep(150);
      const closed = !shown(bar);
      const before = Editor.getHTML();
      const slider = bar.querySelector('input[data-role="opacity"]');
      slider.value = '20';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(100);
      const unchanged = Editor.getHTML() === before && imageAttrs().opacity !== 0.2;
      return { pass: opened && closed && unchanged, notes: JSON.stringify({ opened, closed, unchanged, opacity: imageAttrs().opacity }) };
    },
  });

  // === « Sur toutes les pages » : pourquoi le bouton est grisé, et la place de la page d'une image qui n'en a pas ===
  const layerImage = (o) => '<p>Texte</p><p><img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 120px; height: 120px; position: absolute; left: 30px; top: 40px; z-index: -1;"'
    + ' data-layer="behind" data-wrap="inline"' + (o && o.grid === false ? '' : ' data-page-index="0" data-page-left-pt="-10" data-page-top-pt="-20"') + '></p><p>Suite</p>';

  cases.push({
    id: 'ft_image_repeat_is_greyed_in_header_footer_editing_and_in_a_grid_with_its_reason',
    description: 'Une image derrière le texte : « Sur toutes les pages » est grisée avec la raison « derrière le texte » quand on édite un en-tête ou un pied, et dans une grille ; elle ne l\'est pas dans le document',
    run: async (h) => {
      const out = {};
      let gridLayer = null;
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        Editor.setHTML(layerImage());
        await h.sleep(300);
        let bar = await selectImage(h, 0);
        const reasonOf = () => { const b = buttonOf(bar, 'repeat'); return { disabled: b.classList.contains('is-disabled'), title: b.title }; };
        const plain = reasonOf();
        out.plain = imageAttrs().layer === 'behind' && !plain.disabled && plain.title === I18n.t('imgToolbar.repeat');
        // L'édition d'un en-tête garde les images dans le flux : celle-ci passe derrière le texte dans le modèle, comme le ferait un document ancien.
        HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
        await h.sleep(250);
        ed().commands.setContent('<p>Texte ' + imageHtml({ style: 'width: 20px;' }) + ' fin</p>');
        await h.sleep(300);
        await setImageAttrs(h, { layer: 'behind' });
        bar = await selectImage(h, 0);
        const inHf = reasonOf();
        out.header = !!HeaderFooterPreview.getHfMode() && imageAttrs().layer === 'behind' && inHf.disabled && inHf.title === I18n.t('imgToolbar.repeatNeedsBehind');
        out.headerLocksLayers = ['layer-front', 'layer-behind'].every(a => buttonOf(bar, a).classList.contains('v2-hf-locked'));
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        await h.sleep(250);
        Editor.setHTML(layerImage());
        await h.sleep(300);
        const free = await selectImage(h, 0);
        out.freeAgain = !HeaderFooterPreview.getHfMode() && !buttonOf(free, 'repeat').classList.contains('is-disabled') && !['layer-front', 'layer-behind'].some(a => buttonOf(free, a).classList.contains('v2-hf-locked'));
        // Une grille remplace le document par son tableau : l'image est posée dans sa première case, puis passe derrière le texte dans le modèle.
        GridEditor.setActive(true);
        await h.sleep(300);
        let cellParagraph = -1;
        ed().state.doc.descendants((node, p) => { if (cellParagraph < 0 && node.type.name === 'paragraph') cellParagraph = p; });
        ed().view.focus();
        ed().commands.insertContentAt(cellParagraph + 1, { type: 'editorImage', attrs: { src: DATA_PNG } });
        await h.sleep(300);
        await setImageAttrs(h, { layer: 'behind' });
        bar = await selectImage(h, 0);
        const inGrid = reasonOf();
        out.grid = GridEditor.isActive() && inGrid.disabled && inGrid.title === I18n.t('imgToolbar.repeatNeedsBehind');
        // Dit pour le lecteur de la note : une grille ramène le calque à « normal » (js/grid-editor.js) ; la raison affichée vient alors du calque, pas du mode grille.
        gridLayer = imageAttrs().layer;
        out.gridLocksLayers = ['layer-front', 'layer-behind'].every(a => buttonOf(bar, a).classList.contains('v2-hf-locked'));
      } finally {
        GridEditor.setActive(false);
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        h.setA4Preview(false);
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' calque dans la grille : ' + gridLayer };
    },
  });

  cases.push({
    id: 'ft_image_repeat_reads_the_page_place_of_an_image_that_has_none',
    description: 'Une image derrière le texte sans place de page, dans l\'Aperçu A4 : cocher « Sur toutes les pages » mesure sa place (grille page) puis coche ; sans place mesurable rien ne change',
    run: async (h) => {
      const out = {};
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        Editor.setHTML(layerImage({ grid: false }));
        await h.sleep(300);
        const bar = await selectImage(h, 0);
        // La mise en page de l'Aperçu A4 a pu poser la place de la page : on la retire du modèle, comme un document que personne n'a encore mis en page.
        await setImageAttrs(h, { pageIndex: null, pageLeftPt: null, pageTopPt: null, repeat: false });
        await selectImage(h, 0);
        out.noGrid = !Number.isFinite(imageAttrs().pageLeftPt) && !PageLayer.isRepeatedAttrs(Object.assign({}, imageAttrs(), { repeat: true }));
        const btn = buttonOf(bar, 'repeat');
        out.enabled = !btn.classList.contains('is-disabled');
        await press_(h, bar, 'repeat');
        const a = imageAttrs();
        out.captured = a.repeat === true && Number.isFinite(a.pageLeftPt) && Number.isFinite(a.pageTopPt) && PageLayer.isRepeatedAttrs(a);
        await press_(h, bar, 'repeat');
        out.off = imageAttrs().repeat === false;
      } finally { h.setA4Preview(false); }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(imageAttrs()) };
    },
  });

  cases.push({
    id: 'ft_image_align_buttons_set_the_alignment_of_a_flowing_image',
    description: 'Les boutons « Aligner à gauche / au centre / à droite » de la barre d\'une image dans le texte posent son alignement (un seul des trois est allumé), et « Taille d\'origine » le retire',
    run: async (h) => {
      await imageDocument(h, '<p>Texte ' + imageHtml({ style: 'width: 200px' }) + ' autour</p>');
      const bar = await selectImage(h, 0);
      const lit = () => ['left', 'center', 'right'].map(side => buttonOf(bar, 'align-' + side).classList.contains('is-active')).join();
      const out = { start: imageAttrs().align == null && lit() === 'false,false,false' };
      await press_(h, bar, 'align-center'); out.center = imageAttrs().align === 'center' && lit() === 'false,true,false';
      await press_(h, bar, 'align-left'); out.left = imageAttrs().align === 'left' && lit() === 'true,false,false';
      await press_(h, bar, 'align-right'); out.right = imageAttrs().align === 'right' && lit() === 'false,false,true';
      await press_(h, bar, 'reset'); out.reset = imageAttrs().align == null && lit() === 'false,false,false';
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(imageAttrs()) };
    },
  });

  cases.push({
    id: 'ft_image_align_buttons_snap_a_layered_image_to_the_edges_of_the_text',
    description: 'Une image devant le texte : « à gauche », « au centre » et « à droite » la calent sur le bord gauche du texte, au milieu et sur le bord droit (left = marge gauche de la page + l\'écart), sans toucher son alignement ; une image plus large que le texte ne passe jamais avant le bord gauche',
    run: async (h) => {
      const out = {};
      const notes = {};
      for (const a4 of [false, true]) {
        await imageDocument(h, '<p>Texte ' + imageHtml({ style: 'width: 150px', layer: 'front' }) + ' autour</p>');
        h.setA4Preview(a4);
        await h.sleep(250);
        try {
          const bar = await selectImage(h, 0);
          await setImageAttrs(h, { left: 7, top: 11 });
          await selectImage(h, 0);
          const dom = () => ed().view.nodeDOM(imageNode().pos);
          const img = () => dom().querySelector('img');
          const measure = () => {
            const imgWidth = img().getBoundingClientRect().width / EditorCore.layoutZoom(img());
            const content = EditorCore.editorContentWidthPx(ed());
            const pad = parseFloat(getComputedStyle(ed().view.dom).paddingLeft) || 0;
            return { imgWidth, content, pad };
          };
          const m = measure();
          const key = a4 ? 'a4' : 'flux';
          const want = { left: m.pad, center: m.pad + Math.max(0, (m.content - m.imgWidth) / 2), right: m.pad + Math.max(0, m.content - m.imgWidth) };
          for (const side of ['left', 'center', 'right']) {
            await press_(h, bar, 'align-' + side);
            const got = imageAttrs();
            out[key + '_' + side] = got.left === Math.round(want[side]) && got.align == null && got.layer === 'front';
            notes[key + '_' + side] = { got: got.left, want: Math.round(want[side]) };
          }
          notes[key + '_mesure'] = m;
          out[key + '_pageGrid'] = a4 ? imageAttrs().pageIndex != null : true;
          // Plus large que le texte : le bord gauche du texte, jamais en deçà.
          await setImageAttrs(h, { width: Math.round(m.content + 200) + 'px', left: 3 });
          await selectImage(h, 0);
          const wide = measure();
          await press_(h, bar, 'align-right');
          notes[key + '_large'] = { got: imageAttrs().left, pad: wide.pad, imgWidth: wide.imgWidth, content: wide.content };
          out[key + '_large'] = imageAttrs().left === Math.round(wide.pad);
          await press_(h, bar, 'align-center');
          out[key + '_largeCenter'] = imageAttrs().left === Math.round(wide.pad);
          // Un écart qui tombe entre deux pixels s'arrondit : avec une largeur de 151 px ou de 152 px, l'un des deux tombe sur un demi-pixel.
          for (const width of [151, 152]) {
            await setImageAttrs(h, { width: width + 'px', left: 3 });
            await selectImage(h, 0);
            const odd = measure();
            await press_(h, bar, 'align-center');
            const wantOdd = Math.round(odd.pad + Math.max(0, (odd.content - odd.imgWidth) / 2));
            out[key + '_center' + width] = imageAttrs().left === wantOdd && Number.isInteger(imageAttrs().left);
            notes[key + '_center' + width] = { got: imageAttrs().left, want: wantOdd, pad: odd.pad, content: odd.content, imgWidth: odd.imgWidth };
          }
        } finally { h.setA4Preview(false); }
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  cases.push({
    id: 'ft_image_wrap_button_is_greyed_with_its_reason_for_an_aligned_or_layered_image',
    description: 'Le bouton « en ligne / bloc » d\'une image avec du texte autour : actif quand elle est en bloc ; grisé (jamais allumé, même en bloc) et sa raison en info-bulle dès qu\'elle est alignée ou en calque',
    run: async (h) => {
      await imageDocument(h, '<p>Texte ' + imageHtml({ wrap: 'block' }) + ' autour</p>');
      const bar = await selectImage(h, 0);
      const btn = buttonOf(bar, 'wrap');
      const reason = I18n.t('imgToolbar.wrapNeedsText');
      const state = () => ({ disabled: btn.classList.contains('is-disabled'), aria: btn.getAttribute('aria-disabled'), active: btn.classList.contains('is-active'), title: btn.title });
      const out = {};
      const free = state();
      out.block = !free.disabled && free.aria === 'false' && free.active && free.title === I18n.t('imgToolbar.inlineToggle');
      await press_(h, bar, 'wrap');
      out.toInline = imageAttrs().wrap === 'inline' && !state().active && !state().disabled;
      await press_(h, bar, 'wrap');
      out.backToBlock = imageAttrs().wrap === 'block' && state().active;
      await setImageAttrs(h, { align: 'center' });
      await selectImage(h, 0);
      const aligned = state();
      out.aligned = imageAttrs().wrap === 'block' && aligned.disabled && aligned.aria === 'true' && !aligned.active && aligned.title === reason;
      await press_(h, bar, 'wrap');
      out.alignedPressNothing = imageAttrs().wrap === 'block';
      await setImageAttrs(h, { align: null, layer: 'behind', left: 20, top: 20 });
      await selectImage(h, 0);
      const layered = state();
      out.layered = layered.disabled && layered.aria === 'true' && !layered.active && layered.title === reason;
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify({ free, aligned, layered }) };
    },
  });

  cases.push({
    id: 'ft_image_layer_buttons_do_nothing_in_header_footer_editing_and_in_a_grid',
    description: 'Les boutons « Devant le texte » et « Derrière le texte » ne font rien quand on édite un en-tête ou un pied de page, ni dans une grille (le PDF n\'y sait pas placer une image en calque) ; « Dans le texte » reste possible',
    run: async (h) => {
      const out = {};
      const tryLayers = async (bar) => {
        const seen = [];
        for (const action of ['layer-front', 'layer-behind']) { press(buttonOf(bar, action)); await h.sleep(200); seen.push(imageAttrs().layer); }
        return seen.join();
      };
      try {
        await h.resetEditor();
        Editor.setHTML('<p>Texte ' + imageHtml({ style: 'width: 20px;' }) + ' fin</p>');
        await h.sleep(300);
        let bar = await selectImage(h, 0);
        press(buttonOf(bar, 'layer-front')); await h.sleep(200);
        out.freeFront = imageAttrs().layer === 'front';
        press(buttonOf(bar, 'layer-behind')); await h.sleep(200);
        out.freeBehind = imageAttrs().layer === 'behind';
        press(buttonOf(bar, 'layer-normal')); await h.sleep(200);
        out.freeNormal = imageAttrs().layer === 'normal';
        HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
        await h.sleep(250);
        ed().commands.setContent('<p>Texte ' + imageHtml({ style: 'width: 20px;' }) + ' fin</p>');
        await h.sleep(300);
        bar = await selectImage(h, 0);
        out.header = !!HeaderFooterPreview.getHfMode() && await tryLayers(bar) === 'normal,normal';
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        await h.sleep(250);
        await h.resetEditor();
        GridEditor.setActive(true);
        await h.sleep(300);
        let cellParagraph = -1;
        ed().state.doc.descendants((node, p) => { if (cellParagraph < 0 && node.type.name === 'paragraph') cellParagraph = p; });
        ed().view.focus();
        ed().commands.insertContentAt(cellParagraph + 1, { type: 'editorImage', attrs: { src: DATA_PNG } });
        await h.sleep(300);
        bar = await selectImage(h, 0);
        out.grid = GridEditor.isActive() && await tryLayers(bar) === 'normal,normal';
      } finally {
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        GridEditor.setActive(false);
        await h.sleep(250);
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_image_zoom_and_reset_keep_a_header_footer_image_within_its_band',
    description: 'Dans un en-tête ou un pied de page, « Agrandir » et « Taille d\'origine » plafonnent la largeur à ce que la bande de la page autorise pour les dimensions réelles de l\'image (une image deux fois plus haute que large ne dépasse pas, en largeur, la moitié de la hauteur de la bande) ; dans le document, rien ne la plafonne',
    run: async (h) => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 200;
      canvas.getContext('2d').fillRect(0, 0, 100, 200);
      const tall = canvas.toDataURL('image/png');
      const html = width => '<p>Texte <img class="editor-image" src="' + tall + '" alt="" style="width: ' + width + 'px;"> fin</p>';
      const out = {};
      const notes = {};
      try {
        await imageDocument(h, html(100));
        let bar = await selectImage(h, 0);
        await press_(h, bar, 'zoom-in');
        out.freeGrow = imageAttrs().width === '125px';
        await press_(h, bar, 'reset');
        out.freeReset = imageAttrs().width === '320px';
        HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
        await h.sleep(250);
        // La largeur que la bande autorise à cette image (100 x 200) ; une image qui la remplit presque, pour que « Agrandir » la dépasse.
        const cap = HeaderFooterPreview.clampWidthForHfMaxSize(1000, 100, 200);
        const start = Math.max(2, Math.floor(cap * 0.9));
        ed().commands.setContent(html(start));
        await h.sleep(300);
        bar = await selectImage(h, 0);
        const natural = selectedNaturalSize();
        const capped = w => Math.round(HeaderFooterPreview.clampWidthForHfMaxSize(w, natural.w, natural.h)) + 'px';
        notes.natural = natural;
        notes.cap = cap;
        notes.start = start;
        notes.grown = Math.round(start * 1.25) + 'px';
        notes.cappedGrow = capped(start * 1.25);
        out.hfInserted = !!HeaderFooterPreview.getHfMode() && natural.w === 100 && natural.h === 200;
        out.hfCaps = cap > 10 && cap < 100 && capped(start * 1.25) !== notes.grown && capped(320) !== '320px';
        await press_(h, bar, 'zoom-in');
        out.hfGrow = imageAttrs().width === capped(start * 1.25);
        await press_(h, bar, 'reset');
        out.hfReset = imageAttrs().width === capped(320);
        await press_(h, bar, 'zoom-out');
        out.hfShrink = imageAttrs().width === Math.round(parseFloat(capped(320)) * 0.75) + 'px';
        notes.final = imageAttrs().width;
      } finally {
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        await h.sleep(250);
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  cases.push({
    id: 'ft_image_arrow_keys_nudge_a_layered_image_but_not_with_ctrl_alt_or_meta',
    description: 'Les flèches du clavier déplacent d\'un pixel (de dix avec Maj) une image devant ou derrière le texte sélectionnée ; avec Ctrl, Alt ou Méta, pendant une composition de texte, quand un autre écouteur a déjà pris la touche, dans un éditeur qui n\'est pas modifiable ou pour une autre touche, elles ne la bougent pas et gardent leur sens ordinaire ; une image dans le texte garde les flèches de l\'éditeur',
    run: async (h) => {
      await imageDocument(h, '<p>Texte avant</p><p>' + imageHtml({ style: 'width: 40px;', layer: 'front' }) + '</p><p>Texte après</p>');
      await setImageAttrs(h, { left: 100, top: 100 });
      await selectImage(h, 0);
      const key = async (k, mods) => {
        const event = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
        ed().view.dom.dispatchEvent(event);
        await h.sleep(80);
        return { prevented: event.defaultPrevented, at: imageAttrs().left + ',' + imageAttrs().top };
      };
      const out = {};
      const notes = {};
      const run = async (name, k, mods, want) => {
        const got = await key(k, mods);
        notes[name] = got;
        out[name] = got.prevented === want.prevented && got.at === want.at;
      };
      await run('right', 'ArrowRight', null, { prevented: true, at: '101,100' });
      await run('shiftRight', 'ArrowRight', { shiftKey: true }, { prevented: true, at: '111,100' });
      await run('down', 'ArrowDown', null, { prevented: true, at: '111,101' });
      await run('shiftUp', 'ArrowUp', { shiftKey: true }, { prevented: true, at: '111,91' });
      await run('left', 'ArrowLeft', null, { prevented: true, at: '110,91' });
      await run('ctrl', 'ArrowLeft', { ctrlKey: true }, { prevented: false, at: '110,91' });
      await run('alt', 'ArrowUp', { altKey: true }, { prevented: false, at: '110,91' });
      await run('meta', 'ArrowLeft', { metaKey: true }, { prevented: false, at: '110,91' });
      await run('letter', 'a', null, { prevented: false, at: '110,91' });
      // Pendant une composition de texte, ou quand un autre écouteur a déjà pris la touche, l'image ne bouge pas non plus.
      await run('composing', 'ArrowRight', { isComposing: true }, { prevented: false, at: '110,91' });
      const alreadyHandled = event => event.preventDefault();
      document.addEventListener('keydown', alreadyHandled, true);
      try { await run('alreadyHandled', 'ArrowRight', null, { prevented: true, at: '110,91' }); } finally { document.removeEventListener('keydown', alreadyHandled, true); }
      await setImageAttrs(h, { layer: 'normal' });
      await selectImage(h, 0);
      await run('flowing', 'ArrowRight', null, { prevented: false, at: '110,91' });
      // Un éditeur qui n'est pas modifiable ne bouge aucune image.
      await setImageAttrs(h, { layer: 'front' });
      await selectImage(h, 0);
      ed().setEditable(false);
      try { await run('readOnly', 'ArrowRight', null, { prevented: false, at: '110,91' }); } finally { ed().setEditable(true); }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  cases.push({
    id: 'ft_image_caption_button_adds_the_caption_under_the_image_and_greys_for_a_layered_or_floated_image',
    description: 'Le bouton « Légende » de la barre d\'une image pose une légende vide sous le paragraphe de l\'image et y met le curseur, puis s\'allume (« Aller à la légende ») ; grisé avec sa raison pour une image devant ou derrière le texte ou alignée à gauche ou à droite, il n\'écrit rien',
    run: async (h) => {
      await imageDocument(h, '<p>Avant</p><p>' + imageHtml() + '</p><p>Après</p>');
      const out = {};
      const notes = {};
      const bar = await selectImage(h, 0);
      const caption = buttonOf(bar, 'caption');
      const captions = () => { let n = 0; ed().state.doc.descendants(node => { if (node.type.name === 'paragraph' && node.attrs.caption) n++; }); return n; };
      const state = () => ({ active: caption.classList.contains('is-active'), disabled: caption.getAttribute('aria-disabled') === 'true' && caption.classList.contains('is-disabled'), title: caption.title });
      notes.start = state();
      out.start = !notes.start.active && !notes.start.disabled && notes.start.title === I18n.t('caption.addImage');
      await press_(h, bar, 'caption');
      out.added = captions() === 1 && ed().state.selection.$from.parent.attrs.caption === true;
      await selectImage(h, 0);
      notes.lit = state();
      out.lit = notes.lit.active && !notes.lit.disabled && notes.lit.title === I18n.t('caption.goTo');
      await setImageAttrs(h, { layer: 'front' });
      await selectImage(h, 0);
      notes.layered = state();
      out.layered = !notes.layered.active && notes.layered.disabled && notes.layered.title === I18n.t('caption.imageLayer');
      await press_(h, bar, 'caption');
      out.layeredWrites = captions() === 1;
      await setImageAttrs(h, { layer: 'normal', align: 'left' });
      await selectImage(h, 0);
      notes.floated = state();
      out.floated = !notes.floated.active && notes.floated.disabled && notes.floated.title === I18n.t('caption.imageFloat');
      await setImageAttrs(h, { align: null });
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  // === La barre d'une bulle : nombre en toutes lettres, parties d'une date, date en toutes lettres ===
  const varBadge = (table, column) => '<span class="var-badge" data-table="' + table + '" data-column="' + column + '" data-key="' + column + '"></span>';
  async function selectBadge(h) {
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed().state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
    if (pos < 0) throw new Error('bulle #Variable introuvable');
    ed().commands.setNodeSelection(pos);
    await h.sleep(150);
    return document.querySelector('.v2-varfmt-toolbar');
  }
  const badgeFormat = () => { let f; ed().state.doc.descendants(n => { if (n.type.name === 'varBadge') f = n.attrs.format; }); return f; };

  cases.push({
    id: 'ft_var_number_in_words_button_toggles_words',
    description: 'La colonne Nombre : « En toutes lettres » écrit le format {nombre, en toutes lettres}, un second appui le retire (words: false), et le bouton et le panneau suivent',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('FtTable', { Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Total : ' + varBadge('FtTable', 'Montant') + '</p>');
      const bar = await selectBadge(h);
      const section = bar.querySelector('[data-var-panel="number"]');
      const out = { open: shown(bar) && !section.hidden };
      await press_(h, bar, 'num-words');
      const on = badgeFormat();
      out.on = !!on && on.type === 'number' && on.words === true && buttonOf(bar, 'num-words').classList.contains('is-active') && section.classList.contains('v2-varfmt-words-active');
      await press_(h, bar, 'num-words');
      const off = badgeFormat();
      out.off = !!off && off.type === 'number' && off.words === false && !buttonOf(bar, 'num-words').classList.contains('is-active') && !section.classList.contains('v2-varfmt-words-active');
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify({ on, off }) };
    },
  });

  cases.push({
    id: 'ft_var_date_part_buttons_switch_day_month_year_but_keep_one',
    description: 'La colonne Date : J, M, A cachent ou montrent le jour, le mois, l\'année ; le dernier composant montré ne peut pas être éteint ; les boutons suivent',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('FtTable', { Naissance: 'Date' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Né le ' + varBadge('FtTable', 'Naissance') + '</p>');
      const bar = await selectBadge(h);
      const active = () => ['day', 'month', 'year'].map(p => buttonOf(bar, 'date-part:' + p).classList.contains('is-active')).join();
      const out = { open: shown(bar) && !bar.querySelector('[data-var-panel="date"]').hidden, all: active() === 'true,true,true' };
      await press_(h, bar, 'date-part:day');
      out.noDay = badgeFormat().type === 'date' && badgeFormat().day === false && active() === 'false,true,true';
      await press_(h, bar, 'date-part:month');
      out.noMonth = badgeFormat().month === false && active() === 'false,false,true';
      const before = JSON.stringify(badgeFormat());
      await press_(h, bar, 'date-part:year');
      out.lastKept = JSON.stringify(badgeFormat()) === before && active() === 'false,false,true';
      await press_(h, bar, 'date-part:day');
      out.dayBack = badgeFormat().day === true && active() === 'true,false,true';
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(badgeFormat()) };
    },
  });

  cases.push({
    id: 'ft_var_date_in_words_button_toggles_words',
    description: 'La colonne Date : « En toutes lettres » écrit le format {date, en toutes lettres}, un second appui le retire, et le bouton suit',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('FtTable', { Naissance: 'Date' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Né le ' + varBadge('FtTable', 'Naissance') + '</p>');
      const bar = await selectBadge(h);
      const out = { open: shown(bar) };
      await press_(h, bar, 'date-words');
      out.on = badgeFormat().type === 'date' && badgeFormat().words === true && buttonOf(bar, 'date-words').classList.contains('is-active');
      await press_(h, bar, 'date-words');
      out.off = badgeFormat().words === false && !buttonOf(bar, 'date-words').classList.contains('is-active');
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(badgeFormat()) };
    },
  });

  // === La barre d'une bulle : l'état de ses boutons selon ce que la sélection désigne ===
  // `varBarState` : un relevé en une ligne. Pour chaque bouton de gauche, ^ caché, ! grisé, * allumé, puis la raison ou le nom de son info-bulle (la clé de js/i18n.js, pour ne pas dépendre de
  // la langue) ; les trois sous-panneaux (+ montré, - caché) ; et, pour ceux qui sont montrés seulement, leurs réglages (un panneau caché garde les valeurs d'une sélection d'avant).
  const BAR_TITLE_KEYS = ['calcEdit', 'columnBroken', 'condition', 'conditionCheckbox', 'linked', 'linkedBlock', 'linkedCheckbox', 'linkedDisabled', 'list', 'listBlock', 'listCheckbox', 'listDisabled', 'listLoop',
    'loop', 'loopBlock', 'loopCheckbox', 'loopDisabled', 'loopValue', 'notForCalc', 'notForValue'];
  function varBarState(bar) {
    const btn = action => bar.querySelector('button[data-action="' + action + '"]');
    const flags = action => { const b = btn(action); return !b ? '?' : (b.hidden ? '^' : '') + (b.classList.contains('is-disabled') ? '!' : '') + (b.classList.contains('is-active') ? '*' : ''); };
    const titleKey = action => { const b = btn(action); if (!b || b.hidden) return ''; const key = BAR_TITLE_KEYS.find(k => I18n.t('varToolbar.' + k) === b.title); return ':' + (key || '"' + b.title + '"'); };
    const field = role => { const f = bar.querySelector('[data-role="' + role + '"]'); return f ? f.value : '?'; };
    const shownPanel = name => !bar.querySelector('[data-var-panel="' + name + '"]').hidden;
    const left = ['calc-edit', 'var-condition', 'var-linked', 'var-loop', 'var-list', 'var-column'].map(a => a.replace(/^(calc|var)-/, '') + flags(a) + titleKey(a)).join(' ');
    const panels = ['number', 'date', 'bool'].map(n => (shownPanel(n) ? '+' : '-') + n).join(' ') + (bar.querySelector('[data-var-sep]').hidden ? ' sep-' : ' sep+');
    const parts = [left, panels];
    if (shownPanel('number')) parts.push(['num-style:fr', 'num-style:us', 'num-style:none', 'num-words', 'num-zero'].map(a => a.replace(/^num-/, '') + flags(a)).join(' ') + ' dec=' + field('num-decimals') + ' cur=' + field('num-currency'));
    if (shownPanel('date')) parts.push(['date-part:day', 'date-part:month', 'date-part:year', 'date-words'].map(a => a.replace(/^date-/, '') + flags(a)).join(' ') + ' preset=' + field('date-preset'));
    if (shownPanel('bool')) parts.push(['accentStrike', 'classic', 'accentPlain', 'text'].map(s => s + flags('bool-style:' + s)).join(' '));
    return parts.join(' | ');
  }
  const varNodeOf = type => { const found = []; ed().state.doc.descendants((n, p) => { if (n.type.name === type) found.push({ n, p }); }); return found; };
  const COND = ' data-condition=\'{"mode":"all","rules":[{"column":"Nom","op":"eq","value":"x"}]}\'';
  const VAR_COLUMNS = { Nom: 'Text', Montant: 'Numeric', Quantite: 'Int', Naissance: 'Date', Instant: 'DateTime', Actif: 'Bool', Tags: 'ChoiceList' };
  const VAR_SITUATIONS = (() => {
    const fmt = f => ' data-format=\'' + JSON.stringify(f) + '\'';
    const badge = (column, f, extra) => '<span class="var-badge" data-table="FtPage" data-column="' + column + '" data-key="' + column + '"' + (f ? fmt(f) : '') + (extra || '') + '></span>';
    return [
      { id: 'text', type: 'varBadge', html: '<p>Avant ' + badge('Nom') + ' après</p>' },
      { id: 'number', type: 'varBadge', html: '<p>' + badge('Montant') + '</p>' },
      { id: 'number-set', type: 'varBadge', html: '<p>' + badge('Montant', { type: 'number', style: 'us', decimals: 2, currency: '€', words: true, zero: 'show' }) + '</p>' },
      { id: 'number-none', type: 'varBadge', html: '<p>' + badge('Montant', { type: 'number', style: 'none', decimals: 0 }) + '</p>' },
      { id: 'int', type: 'varBadge', html: '<p>' + badge('Quantite') + '</p>' },
      { id: 'date-set', type: 'varBadge', html: '<p>' + badge('Naissance', { type: 'date', day: false, preset: 'PRESET', words: true }) + '</p>' },
      { id: 'datetime', type: 'varBadge', html: '<p>' + badge('Instant') + '</p>' },
      { id: 'bool-set', type: 'varBadge', html: '<p>' + badge('Actif', { type: 'bool', style: 'classic' }) + '</p>' },
      { id: 'bool-plain', type: 'varBadge', html: '<p>' + badge('Actif') + '</p>' },
      { id: 'list', type: 'varBadge', html: '<p>' + badge('Tags') + '</p>' },
      { id: 'list-set', type: 'varBadge', html: '<p>' + badge('Tags', { list: { pick: 'first' } }) + '</p>' },
      { id: 'broken', type: 'varBadge', html: '<p>' + badge('Disparue') + '</p>' },
      { id: 'calc', type: 'calcBadge', html: '<p>Calcul <span class="calc-badge" data-formula="1+2"></span></p>' },
      { id: 'calc-set', type: 'calcBadge', html: '<p><span class="calc-badge" data-formula="" data-format=\'{"type":"number","decimals":2}\'></span></p>' },
      { id: 'block', type: 'conditionalText', html: '<p>Début</p><div class="conditional-text"><p>Bloc</p></div>' },
      { id: 'block-cond', type: 'conditionalText', html: '<p>Début</p><div class="conditional-text"' + COND + '><p>Bloc</p></div>' },
      { id: 'value', type: 'conditionalValue', html: '<p>Entre <span class="conditional-value">valeur</span> et</p>' },
      { id: 'value-cond', type: 'conditionalValue', html: '<p>Entre <span class="conditional-value"' + COND + '>valeur</span> et</p>' },
      { id: 'checkbox', type: 'conditionalCheckbox', html: '<p>Case <span class="conditional-checkbox" data-checkbox-style="accentPlain"></span></p>' },
      { id: 'checkbox-cond', type: 'conditionalCheckbox', html: '<p>Case <span class="conditional-checkbox" data-checkbox-style="classic"' + COND + '></span></p>' },
    ];
  })();
  async function selectVarSituation(h, s) {
    await h.resetEditor();
    Editor.setHTML(s.html.replace('PRESET', VariableFormat.DATE_PRESETS[2].key));
    await h.sleep(250);
    document.querySelector('.tiptap').focus();
    const found = varNodeOf(s.type)[0];
    if (!found) throw new Error('nœud ' + s.type + ' introuvable pour ' + s.id);
    // Une valeur conditionnelle se désigne par le curseur dans son texte, les autres par le nœud sélectionné.
    if (s.type === 'conditionalValue') ed().commands.setTextSelection(found.p + 2); else ed().commands.setNodeSelection(found.p);
    await h.sleep(150);
    return document.querySelector('.v2-varfmt-toolbar');
  }
  const VAR_BAR_EXPECTED = {
    'fr:text': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number -date -bool sep-',
    'fr:number': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr* style:us style:none words zero* dec= cur=',
    'fr:number-set': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr style:us* style:none words* zero dec=2 cur=€',
    'fr:number-none': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr style:us style:none* words zero* dec=0 cur=',
    'fr:int': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr* style:us style:none words zero* dec= cur=',
    'fr:date-set': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number +date -bool sep+ | part:day part:month* part:year* words* preset=iso',
    'fr:datetime': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number +date -bool sep+ | part:day* part:month* part:year* words preset=dmy_slash_full',
    'fr:bool-set': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number -date +bool sep+ | accentStrike classic* accentPlain text',
    'fr:bool-plain': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number -date +bool sep+ | accentStrike classic accentPlain text*',
    'fr:list': 'edit^ condition:condition linked:linked loop!:loopDisabled list:list column^ | -number -date -bool sep-',
    'fr:list-set': 'edit^ condition:condition linked:linked loop!:loopDisabled list*:list column^ | -number -date -bool sep-',
    'fr:broken': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column:columnBroken | -number -date -bool sep-',
    'fr:calc': 'edit:calcEdit condition!:notForCalc linked!:notForCalc loop!:notForCalc list!:notForCalc column^ | +number -date -bool sep+ | style:fr* style:us style:none words zero* dec= cur=',
    'fr:calc-set': 'edit:calcEdit condition!:notForCalc linked!:notForCalc loop!:notForCalc list!:notForCalc column^ | +number -date -bool sep+ | style:fr* style:us style:none words zero* dec=2 cur=',
    'fr:block': 'edit^ condition:condition linked!:linkedBlock loop!:loopBlock list!:linkedBlock column^ | -number -date -bool sep-',
    'fr:block-cond': 'edit^ condition*:condition linked!:linkedBlock loop!:loopBlock list!:linkedBlock column^ | -number -date -bool sep-',
    'fr:value': 'edit^ condition:condition linked!:notForValue loop!:loopValue list!:notForValue column^ | -number -date -bool sep-',
    'fr:value-cond': 'edit^ condition*:condition linked!:notForValue loop!:loopValue list!:notForValue column^ | -number -date -bool sep-',
    'fr:checkbox': 'edit^ condition:conditionCheckbox linked!:linkedCheckbox loop!:loopCheckbox list!:linkedCheckbox column^ | -number -date +bool sep+ | accentStrike classic accentPlain* text^',
    'fr:checkbox-cond': 'edit^ condition*:conditionCheckbox linked!:linkedCheckbox loop!:loopCheckbox list!:linkedCheckbox column^ | -number -date +bool sep+ | accentStrike classic* accentPlain text^',
    'en:text': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | -number -date -bool sep-',
    'en:number': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr style:us* style:none words zero* dec= cur=',
    'en:number-none': 'edit^ condition:condition linked:linked loop!:loopDisabled list!:listDisabled column^ | +number -date -bool sep+ | style:fr style:us style:none* words zero* dec=0 cur=',
    'en:checkbox': 'edit^ condition:conditionCheckbox linked!:linkedCheckbox loop!:loopCheckbox list!:linkedCheckbox column^ | -number -date +bool sep+ | accentStrike classic accentPlain* text^',
  };
  const VAR_BAR_LANGS = { en: ['number', 'number-none', 'text', 'checkbox'] };
  cases.push({
    id: 'ft_var_bar_state_per_kind_of_bubble',
    description: 'La barre d\'une bulle selon ce que la sélection désigne : texte, nombre (réglé ou non), entier, date, Oui / Non, liste, variable cassée, calcul, bloc, valeur et case conditionnels, avec ou sans condition - boutons grisés (et leur raison), allumés, cachés, sous-panneaux montrés et leurs réglages ; en français, puis les cas qui changent en anglais (style du nombre par défaut)',
    run: async (h) => {
      window.__gristStub.setVariables('FtPage', VAR_COLUMNS);
      await GristAPI.refreshSchema();
      const wrong = {};
      let checked = 0;
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          await h.sleep(100);
          for (const s of VAR_SITUATIONS) {
            if (lang === 'en' && !VAR_BAR_LANGS.en.includes(s.id)) continue;
            const bar = await selectVarSituation(h, s);
            const got = (shown(bar) ? '' : 'FERMÉE ') + varBarState(bar);
            checked++;
            if (got !== VAR_BAR_EXPECTED[lang + ':' + s.id]) wrong[lang + ':' + s.id] = got;
          }
        }
      } finally { I18n.setLang('fr'); }
      return { pass: checked === Object.keys(VAR_BAR_EXPECTED).length && Object.keys(wrong).length === 0, notes: checked + ' situations relevées ; écarts : ' + JSON.stringify(wrong) };
    },
  });

  const VAR_BAR_OPENS = {
    text: 'condition=cond linked=linked loop=- list=-',
    list: 'condition=cond linked=linked loop=- list=list',
    broken: 'condition=cond linked=linked loop=- list=- column=column',
    calc: 'edit=calc condition=- linked=- loop=- list=-',
    block: 'condition=cond linked=- loop=- list=-',
    value: 'condition=cond linked=- loop=- list=-',
    checkbox: 'condition=cond linked=- loop=- list=-',
  };
  cases.push({
    id: 'ft_var_bar_buttons_open_the_window_of_their_kind_and_greyed_ones_do_nothing',
    description: 'Un appui sur chaque bouton montré de la barre d\'une bulle ouvre la fenêtre de sa sorte (condition, autres attributs, liste, choix de la colonne, modification du calcul) ; un bouton grisé (boucle d\'une variable seule, liste d\'une colonne texte, tout ce qui est sans objet pour un calcul, un bloc, une valeur ou une case) ne fait rien',
    run: async (h) => {
      window.__gristStub.setVariables('FtPage', VAR_COLUMNS);
      await GristAPI.refreshSchema();
      const windows = { cond: VariableCondition, linked: VariableLinkedAttrs, loop: VariableLoop, list: VariableList, calc: VariableCalc };
      const open = () => Object.keys(windows).filter(k => windows[k].isOpen()).concat(document.getElementById('v2-var-column-search') ? ['column'] : []).join('+') || '-';
      const escape = async () => { for (let i = 0; i < 6 && open() !== '-'; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await h.sleep(120); } };
      const wrong = {};
      for (const id of Object.keys(VAR_BAR_OPENS)) {
        const s = VAR_SITUATIONS.find(x => x.id === id);
        const line = [];
        for (const action of ['calc-edit', 'var-condition', 'var-linked', 'var-loop', 'var-list', 'var-column']) {
          const bar = await selectVarSituation(h, s);
          const btn = buttonOf(bar, action);
          if (!btn || btn.hidden) continue;
          const before = Editor.getHTML();
          press(btn);
          await h.sleep(250);
          const opened = open();
          // Une fenêtre ouverte sur la bulle garde la barre masquée : une transaction qui arrive alors (même sans changement) ne la rouvre pas. Le choix
          // de la colonne est une liste sous le bouton, pas une fenêtre : la barre y reste.
          let barBack = '';
          if (opened !== '-' && opened !== 'column') {
            ed().view.dispatch(ed().state.tr);
            await h.sleep(80);
            if (shown(bar)) barBack = '(barre)';
          }
          line.push(action.replace(/^(calc|var)-/, '') + '=' + opened + barBack + (Editor.getHTML() === before ? '' : '(doc)'));
          await escape();
        }
        if (line.join(' ') !== VAR_BAR_OPENS[id]) wrong[id] = line.join(' ');
      }
      return { pass: Object.keys(wrong).length === 0, notes: 'écarts : ' + JSON.stringify(wrong) };
    },
  });

  cases.push({
    id: 'ft_var_bar_case_styles_set_the_style_of_a_conditional_checkbox',
    description: 'La barre d\'une case conditionnelle : chaque style de case posé change le style du nœud et allume son bouton ',
    run: async (h) => {
      window.__gristStub.setVariables('FtPage', VAR_COLUMNS);
      await GristAPI.refreshSchema();
      const bar = await selectVarSituation(h, VAR_SITUATIONS.find(x => x.id === 'checkbox'));
      const out = { start: varNodeOf('conditionalCheckbox')[0].n.attrs.style === 'accentPlain' };
      for (const style of ['classic', 'accentStrike', 'accentPlain']) {
        press(buttonOf(bar, 'bool-style:' + style));
        await h.sleep(200);
        const lit = ['accentStrike', 'classic', 'accentPlain'].filter(x => buttonOf(bar, 'bool-style:' + x).classList.contains('is-active'));
        out[style] = varNodeOf('conditionalCheckbox')[0].n.attrs.style === style && lit.join() === style;
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ft_var_bar_number_and_date_fields_write_decimals_currency_and_date_format',
    description: 'La colonne Nombre : le choix des décimales (vide = automatique) et la devise saisie (espaces de bord retirés) s\'écrivent dans le format de la bulle ; la colonne Date : le choix du format de date',
    run: async (h) => {
      window.__gristStub.setVariables('FtPage', VAR_COLUMNS);
      await GristAPI.refreshSchema();
      const out = {};
      const type = async (bar, role, value) => {
        const field = bar.querySelector('[data-role="' + role + '"]');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await h.sleep(150);
        return field;
      };
      let bar = await selectVarSituation(h, VAR_SITUATIONS.find(x => x.id === 'number'));
      await type(bar, 'num-decimals', '3');
      out.decimals = badgeFormat().type === 'number' && badgeFormat().decimals === 3;
      await type(bar, 'num-decimals', '');
      out.decimalsAuto = badgeFormat().decimals === null;
      await type(bar, 'num-currency', ' $ ');
      out.currency = badgeFormat().currency === '$';
      bar = await selectVarSituation(h, VAR_SITUATIONS.find(x => x.id === 'date-set'));
      const preset = VariableFormat.DATE_PRESETS[1].key;
      await type(bar, 'date-preset', preset);
      out.preset = badgeFormat().type === 'date' && badgeFormat().preset === preset && badgeFormat().words === true && badgeFormat().day === false;
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(badgeFormat()) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.floatingToolbars = cases;
})();
