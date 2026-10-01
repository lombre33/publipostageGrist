// Suite "grid" - mode grille (js/grid-editor.js, css/grid.css, planning/feature-mode-grille-excel.md) : un modèle de type « grille » est UN tableau sans feuille A4,
// aux colonnes et aux lignes réglables par des bandeaux A, B, C / 1, 2, 3. Lot A1 = l'éditeur ; la Lecture, le PDF, les cellules fusionnées et l'export Excel viennent
// aux lots suivants (leurs cas rejoindront cette suite ou celle de leur rendu). Les gestes à la vraie souris (tirer un trait, cliquer un bandeau à 700x400) sont dans
// dev-tests/verify-grid-mouse.mjs : une page.evaluate ne déclenche pas de geste « trusted », ici les évènements de pointeur sont synthétiques.
(function () {
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const doc = () => ed().state.doc;
  const tableNode = () => doc().child(0);
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const editorBox = () => document.getElementById('editor-container');
  const colEls = () => Array.from(document.querySelectorAll('.tiptap table > colgroup > col'));
  const rowEls = () => Array.from(document.querySelectorAll('.tiptap table > tbody > tr'));
  const colHeads = () => Array.from(document.querySelectorAll('.v2-grid-colhead'));
  const rowHeads = () => Array.from(document.querySelectorAll('.v2-grid-rowhead'));
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.6 : tolerance);

  // Les mêmes gestes qu'une personne : « + » puis « Nouvelle grille », puis « Nouveau document » pour en sortir.
  async function enterGrid(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(150);
  }
  async function inGrid(h, body) {
    await enterGrid(h);
    try { return await body(); } finally { await leaveGrid(h); }
  }

  // Position AVANT la case (ligne, colonne) : `+ 2` = dans son premier paragraphe.
  function cellPos(row, col) {
    const t = tableNode();
    let pos = 1;
    for (let r = 0; r < row; r++) pos += t.child(r).nodeSize;
    pos += 1;
    const rowNode = t.child(row);
    for (let c = 0; c < col; c++) pos += rowNode.child(c).nodeSize;
    return pos;
  }
  async function typeInCell(row, col, text) {
    ed().chain().focus().setTextSelection(cellPos(row, col) + 2).insertContent(text).run();
    await sleep(60);
  }
  async function placeCursor(row, col) {
    ed().chain().focus().setTextSelection(cellPos(row, col) + 2).run();
    await sleep(60);
  }
  const key = (name, options) => {
    const ev = new KeyboardEvent('keydown', Object.assign({ key: name, bubbles: true, cancelable: true }, options || {}));
    ed().view.dom.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const cellCount = () => { let n = 0; tableNode().descendants(node => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') n++; return true; }); return n; };
  const insideTable = sel => !!sel.$anchorCell || (sel.$from.depth >= 1 && sel.$to.depth >= 1 && sel.$from.node(1).type.name === 'table' && sel.$to.node(1).type.name === 'table');
  const pointer = (type, x, y, extra) => new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7, pointerType: 'mouse', isPrimary: true }, extra || {}));
  const centerOf = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  // Tire la poignée d'un bandeau (pointerdown dessus, quelques pointermove sur le document, pointerup) ; `cancel` : Échap à la place du relâcher. `probe` est appelé
  // pendant le geste, après le dernier déplacement.
  async function dragHandle(handle, dx, dy, options) {
    const opts = options || {};
    const [x, y] = centerOf(handle);
    handle.dispatchEvent(pointer('pointerdown', x, y));
    for (let i = 1; i <= 4; i++) { document.dispatchEvent(pointer('pointermove', x + dx * i / 4, y + dy * i / 4)); await sleep(10); }
    const during = opts.probe ? opts.probe() : null;
    if (opts.cancel) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else document.dispatchEvent(pointer('pointerup', x + dx, y + dy));
    await sleep(80);
    return during;
  }

  // === 1) Entrée, forme de départ, pas de feuille ===================================================================================================================

  cases.push({
    id: 'grid_entry_is_in_the_new_menu_without_any_parameter_in_the_address',
    description: '« Nouvelle grille » est dans le menu « + » de tout widget, sans « ?dev » dans l\'adresse : ni cachée par un attribut, ni sans affichage, et un clic dessus ouvre une grille ; une adresse qui porte « ?dev » n\'y change rien',
    run: async (h) => {
      await h.resetEditor();
      const row = document.getElementById('v2-btn-new-grid');
      const address = window.location.search;
      h.openFlyout('#v2-new-template-group');
      // Le menu ouvert : l'entrée y a une taille (fermé, tout le menu est sans affichage).
      const visible = !row.hidden && getComputedStyle(row).display !== 'none' && row.getBoundingClientRect().width > 0;
      const inFlyout = !!row.closest('#v2-new-template-group .v2-hover-flyout');
      await h.clickButton('v2-btn-new-grid');
      await sleep(250);
      const opened = GridEditor.isActive() && rowEls().length === 15;
      await leaveGrid(h);
      return { pass: !/(^|[?&])dev\b/.test(address) && visible && inFlyout && opened, notes: JSON.stringify({ address, visible, inFlyout, opened, hasDevApi: typeof GridEditor.isDevEnabled !== 'undefined' || typeof GridEditor.syncEntryVisibility !== 'undefined' }) };
    },
  });

  cases.push({
    id: 'grid_new_gives_a_default_table_and_no_a4_sheet',
    description: 'Nouvelle grille : un seul tableau de 15 lignes x 6 colonnes (case de 100 px, ligne de 28 px), sans feuille A4 ni zone d\'en-tête/pied, quelle que soit la case « Aperçu A4 » ; retour à un document : la feuille revient',
    run: async (h) => {
      await h.resetEditor();
      const box = editorBox();
      box.classList.add('a4-preview'); // l'état de production (case Aperçu A4 cochée) : le harnais le retire entre deux scénarios
      const toggle = document.getElementById('v2-toggle-a4-preview');
      let inside = null;
      try {
        await enterGrid(h);
        const t = tableNode();
        const widths = new Set(); const heights = new Set();
        t.forEach(row => { heights.add(row.attrs.rowHeight); row.forEach(cell => widths.add(String(cell.attrs.colwidth))); });
        inside = {
          active: GridEditor.isActive(),
          gridClass: box.classList.contains('v2-grid-mode') && document.body.classList.contains('pp-grid-mode'),
          noSheet: !box.classList.contains('a4-preview'),
          toggleKeepsItsValue: toggle.checked,
          toggleGreyed: toggle.disabled,
          shape: t.childCount + 'x' + t.firstChild.childCount,
          widths: Array.from(widths).join('|'),
          heights: Array.from(heights).join('|'),
          children: Array.from({ length: doc().childCount }, (_, i) => doc().child(i).type.name).join(','),
          zones: document.querySelectorAll('.v2-hf-zone').length,
        };
      } finally { await leaveGrid(h); }
      const after = { gridClass: box.classList.contains('v2-grid-mode') || document.body.classList.contains('pp-grid-mode'), sheetBack: box.classList.contains('a4-preview'), toggleFree: !toggle.disabled, active: GridEditor.isActive() };
      box.classList.remove('a4-preview');
      const pass = inside.active && inside.gridClass && inside.noSheet && inside.toggleKeepsItsValue && inside.toggleGreyed && inside.shape === '15x6' && inside.widths === '100'
        && inside.heights === '28' && /^table(,paragraph)?$/.test(inside.children) && inside.zones === 0
        && !after.gridClass && after.sheetBack && after.toggleFree && !after.active;
      return { pass, notes: JSON.stringify({ inside, after }) };
    },
  });

  cases.push({
    id: 'grid_a_new_grid_opens_at_the_top_left_even_when_the_workbench_had_scrolled',
    description: 'Une grille s\'ouvre en haut à gauche : le plan de travail est le même que celui du modèle précédent et en gardait le défilement (une grille neuve apparaissait descendue, bandeaux et première ligne hors de vue - vu à la vraie souris après un Annuler qui avait fait défiler jusqu\'à la dernière ligne)',
    run: async (h) => {
      await h.resetEditor();
      const box = editorBox();
      const saved = box.style.cssText;
      let result = null;
      try {
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-grid');
        await sleep(250);
        // Un plan de travail étroit et bas, quelle que soit la fenêtre du test : la grille (600 x 420 px) y défile dans les deux sens.
        box.style.cssText = saved + ';width:320px;max-width:320px;height:160px;max-height:160px;overflow:auto';
        box.scrollTop = 200; box.scrollLeft = 120;
        await sleep(60);
        const before = { top: box.scrollTop, left: box.scrollLeft };
        // Même sortie puis rentrée que loadTemplateIntoEditor : le contenu (même grille, même hauteur) ne change pas, donc rien ne ramène le défilement tout seul.
        GridEditor.setActive(false);
        GridEditor.setActive(true);
        await sleep(120);
        const cell = document.querySelector('.tiptap table td').getBoundingClientRect();
        const strip = document.querySelector('.v2-grid-corner').getBoundingClientRect();
        result = { before, top: box.scrollTop, left: box.scrollLeft, firstCellBelowStrips: cell.top >= strip.bottom - 1 && cell.left >= strip.right - 1 };
      } finally {
        box.style.cssText = saved;
        await leaveGrid(h);
      }
      const pass = result.before.top > 100 && result.before.left > 50 && result.top === 0 && result.left === 0 && result.firstCellBelowStrips;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'grid_cells_are_laid_out_from_the_corner_with_strips_around',
    description: 'Le tableau part du coin haut gauche du plan de travail (sous le bandeau des colonnes, à droite du bandeau des lignes) et ne s\'étire pas : sa largeur est la somme de ses colonnes',
    run: async (h) => inGrid(h, async () => {
      const table = document.querySelector('.tiptap table');
      const tr = table.getBoundingClientRect();
      const cols = colHeads().map(c => c.getBoundingClientRect());
      const rows = rowHeads().map(r => r.getBoundingClientRect());
      const sumCols = colEls().reduce((s, c) => s + c.getBoundingClientRect().width, 0);
      const pass = cols.length === 6 && rows.length === 15 && near(cols[0].left, tr.left, 1) && near(cols[0].bottom, tr.top, 1.5) && near(rows[0].top, tr.top, 1.5)
        && near(rows[0].right, tr.left, 1) && near(tr.width, sumCols, 2.5) && cols.every((c, i) => near(c.width, colEls()[i].getBoundingClientRect().width))
        && rows.every((r, i) => near(r.height, rowEls()[i].getBoundingClientRect().height));
      return { pass, notes: JSON.stringify({ table: [tr.left, tr.top, tr.width, tr.height], col0: cols[0] && [cols[0].left, cols[0].bottom], row0: rows[0] && [rows[0].top, rows[0].right], sumCols, nCols: cols.length, nRows: rows.length }) };
    }),
  });

  cases.push({
    id: 'grid_column_names_follow_the_spreadsheet_scheme',
    description: 'Bandeau des colonnes : A à Z, puis AA, AB... AZ, BA... comme dans un tableur ; bandeau des lignes : 1, 2, 3...',
    run: async (h) => inGrid(h, async () => {
      const names = [0, 1, 25, 26, 27, 51, 52, 701, 702].map(GridEditor.colName).join(',');
      const shown = colHeads().map(c => c.querySelector('.v2-grid-label').textContent).join('');
      const rowsShown = rowHeads().slice(0, 3).map(r => r.querySelector('.v2-grid-label').textContent).join(',');
      return { pass: names === 'A,B,Z,AA,AB,AZ,BA,ZZ,AAA' && shown === 'ABCDEF' && rowsShown === '1,2,3', notes: JSON.stringify({ names, shown, rowsShown }) };
    }),
  });

  // === 2) La barre d'outils : grisé, jamais retiré ====================================================================================================================

  const GREYED_IN_GRID = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc', 'v2-btn-page-break', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all'];
  const STILL_ACTIVE_IN_GRID = ['v2-btn-bold', 'v2-btn-italic', 'v2-btn-underline', 'v2-btn-strike', 'v2-align-group', 'v2-size-stepper', 'v2-font-chip', 'v2-text-color-split', 'v2-highlight-split',
    'v2-image-group', 'v2-heading-group', 'v2-blocks-group', 'v2-btn-link', 'v2-row-link', 'v2-btn-comment', 'v2-btn-insert-variable', 'v2-btn-undo', 'v2-btn-redo'];

  cases.push({
    id: 'grid_toolbar_greys_what_has_no_meaning_in_a_table_and_gives_it_back',
    description: 'En grille : Tableau, Deux colonnes, Sommaire, Saut de page, Citation, Bloc de code, Encadré, Bloc de signature et le suivi des modifications (x3) sont grisés (jamais retirés), l\'aperçu A4 aussi ; Lien, mise en forme, image, variable, annuler restent actifs ; hors grille tout est rendu',
    run: async (h) => {
      await h.resetEditor();
      let during = null;
      try {
        await enterGrid(h);
        await placeCursor(0, 0);
        MainToolbar.syncToolbarState();
        during = {
          greyed: GREYED_IN_GRID.filter(id => !isLocked(id)),
          stillInDom: GREYED_IN_GRID.every(id => !!document.getElementById(id)),
          active: STILL_ACTIVE_IN_GRID.filter(id => isLocked(id)),
          a4Opacity: getComputedStyle(document.getElementById('v2-a4-toggle')).opacity,
          a4Events: getComputedStyle(document.getElementById('v2-a4-toggle')).pointerEvents,
        };
      } finally { await leaveGrid(h); }
      await h.resetEditor();
      MainToolbar.syncToolbarState();
      const stuck = GREYED_IN_GRID.filter(id => isLocked(id));
      const pass = during.greyed.length === 0 && during.stillInDom && during.active.length === 0 && during.a4Opacity === '0.35' && during.a4Events === 'none' && stuck.length === 0;
      return { pass, notes: JSON.stringify({ during, stuckAfter: stuck }) };
    },
  });

  cases.push({
    id: 'grid_greyed_buttons_do_nothing_even_from_the_keyboard',
    description: 'Un bouton grisé de la grille ne fait rien : ni au clic ni au clavier (Entrée sur un bouton qui a le focus déclenche un clic) - le clic est arrêté avant le bouton, alors qu\'un bouton actif le reçoit',
    run: async (h) => inGrid(h, async () => {
      await placeCursor(1, 1);
      const reached = id => {
        const btn = document.getElementById(id);
        let got = false;
        const spy = () => { got = true; };
        btn.addEventListener('click', spy);
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.click(); // un clic au clavier (Entrée, Espace) arrive comme celui-ci : pointer-events:none ne l'arrête pas
        btn.removeEventListener('click', spy);
        return got;
      };
      const before = doc();
      const stopped = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc', 'v2-btn-page-break', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-track-changes'].filter(id => reached(id));
      await sleep(40);
      const control = reached('v2-btn-bold'); // témoin : un bouton actif reçoit bien son clic
      return { pass: stopped.length === 0 && control && doc().eq(before), notes: JSON.stringify({ reachedDespiteGrey: stopped, control }) };
    }),
  });

  // === 3) Un seul tableau : le garde-fou ============================================================================================================================

  cases.push({
    id: 'grid_guard_refuses_whatever_would_stop_it_being_one_table',
    description: 'Par les commandes de l\'éditeur (pas seulement les boutons) : un second tableau, deux colonnes, sommaire, saut de page, citation, encadré, bloc de signature, bloc de code et trait horizontal sont refusés, le document reste inchangé - alors que sans le garde-fou chacune de ces commandes agit ; on ne supprime ni le tableau ni sa dernière ligne ou colonne',
    run: async (h) => inGrid(h, async () => {
      await placeCursor(2, 2);
      const original = Editor.getHTML();
      const commands = {
        insertTable: () => ed().chain().focus().insertTable({ rows: 2, cols: 2 }).run(),
        insertTwoColumns: () => ed().chain().focus().insertTwoColumns().run(),
        insertToc: () => ed().chain().focus().insertToc().run(),
        insertPageBreak: () => ed().chain().focus().insertPageBreak().run(),
        toggleBlockquote: () => ed().chain().focus().toggleBlockquote().run(),
        wrapCallout: () => Callout.wrapSelection(ed(), {}),
        insertSignature: () => Callout.insertSignature(ed()),
        toggleCodeBlock: () => ed().chain().focus().toggleCodeBlock().run(),
        horizontalRule: () => ed().chain().focus().insertContent({ type: 'horizontalRule' }).run(),
      };
      // Le même document, garde-fou levé puis posé : à chaque tour on repart de la grille d'origine.
      const reload = async guarded => {
        GridEditor.setActive(false);
        Editor.setHTML(original);
        GridEditor.setActive(guarded);
        await placeCursor(2, 2);
      };
      const verdicts = [];
      for (const name of Object.keys(commands)) {
        await reload(false);
        const reference = doc();
        commands[name]();
        await sleep(30);
        if (doc().eq(reference)) verdicts.push(name + ': sans effet même sans garde-fou (le test ne prouverait rien)');
        await reload(true);
        const before = doc();
        commands[name]();
        await sleep(30);
        if (!doc().eq(before)) verdicts.push(name + ': document modifié malgré le garde-fou');
      }
      await reload(true);
      for (let i = 0; i < 20; i++) ed().chain().focus().deleteRow().run();
      for (let i = 0; i < 10; i++) ed().chain().focus().deleteColumn().run();
      ed().chain().focus().deleteTable().run();
      await sleep(40);
      const left = doc().child(0).type.name === 'table' && tableNode().childCount === 1 && tableNode().firstChild.childCount === 1;
      return { pass: verdicts.length === 0 && left, notes: verdicts.join(' | ') + ' reste=' + tableNode().childCount + 'x' + tableNode().firstChild.childCount };
    }),
  });

  cases.push({
    id: 'grid_guard_refuses_a_calque_image_but_keeps_an_image_on_its_cell',
    description: 'Une image se pose sur sa case (en ligne) ; passer en calque devant/derrière est refusé, et les deux boutons de calque de la barre de l\'image sont grisés',
    run: async (h) => inGrid(h, async () => {
      await placeCursor(0, 0);
      ed().chain().focus().insertImage({ src: DATA_PNG, width: '40px' }).run();
      await sleep(120);
      let imgPos = -1; let imgNode = null;
      doc().descendants((n, pos) => { if (n.type.name === 'editorImage') { imgPos = pos; imgNode = n; } return true; });
      if (!imgNode) return { pass: false, notes: 'image non insérée dans la case : ' + Editor.getHTML().slice(0, 300) };
      const dom = h.tiptap().querySelector('img.editor-image');
      await h.selectAtomNode(dom.closest('.editor-image-view') || dom);
      await sleep(120);
      const front = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      const behind = document.querySelector('.v2-floating-toolbar button[data-action="layer-behind"]');
      const greyed = !!front && !!behind && front.classList.contains('v2-hf-locked') && behind.classList.contains('v2-hf-locked');
      front.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(80);
      EditorCore.patchNodeAndReselect(ed(), imgPos, Object.assign({}, imgNode.attrs, { layer: 'behind' }));
      await sleep(80);
      let layer = null; doc().descendants(n => { if (n.type.name === 'editorImage') layer = n.attrs.layer; return true; });
      return { pass: greyed && layer === 'normal', notes: JSON.stringify({ greyed, layer }) };
    }),
  });

  cases.push({
    id: 'grid_selection_never_leaves_the_cells',
    description: 'Curseur forcé en fin de document (focus(\'end\')) ou sorti du tableau par les flèches : il revient dans une case, jamais dans le paragraphe vide que TipTap range sous le tableau (caché)',
    run: async (h) => inGrid(h, async () => {
      const notes = {};
      ed().chain().focus('end').run();
      await sleep(80);
      notes.afterFocusEnd = insideTable(ed().state.selection);
      await placeCursor(14, 5);
      key('ArrowDown'); await sleep(80);
      notes.afterArrowDown = insideTable(ed().state.selection);
      key('ArrowRight'); await sleep(80);
      notes.afterArrowRight = insideTable(ed().state.selection);
      await placeCursor(0, 0);
      key('ArrowUp'); await sleep(80);
      notes.afterArrowUp = insideTable(ed().state.selection);
      ed().commands.setTextSelection(doc().content.size - 1);
      await sleep(80);
      notes.afterTrailingParagraph = insideTable(ed().state.selection);
      const trailing = h.tiptap().querySelector(':scope > p:last-child');
      notes.trailingHidden = !trailing || getComputedStyle(trailing).display === 'none';
      return { pass: Object.values(notes).every(Boolean), notes: JSON.stringify(notes) };
    }),
  });

  cases.push({
    id: 'grid_select_all_then_delete_empties_the_cells_and_keeps_the_table',
    description: 'Ctrl+A sélectionne toutes les cases (pas le document), Retour arrière ou Suppr les vident sans supprimer le tableau - comme un tableur',
    run: async (h) => inGrid(h, async () => {
      await typeInCell(0, 0, 'abc');
      await typeInCell(3, 4, 'def');
      ed().view.focus();
      const consumed = key('a', { ctrlKey: true });
      await sleep(80);
      const sel = ed().state.selection;
      let selected = 0; if (sel.forEachCell) sel.forEachCell(() => { selected++; });
      const allCells = !!sel.$anchorCell && selected === cellCount();
      const bs = key('Backspace');
      await sleep(80);
      const emptied = doc().textContent === '' && tableNode().childCount === 15 && tableNode().firstChild.childCount === 6;
      await typeInCell(1, 1, 'xyz');
      ed().view.focus();
      key('a', { ctrlKey: true }); await sleep(60);
      const del = key('Delete'); await sleep(80);
      const emptiedAgain = doc().textContent === '' && tableNode().childCount === 15;
      return { pass: consumed && allCells && bs && emptied && del && emptiedAgain, notes: JSON.stringify({ consumed, selected, cells: cellCount(), bs, emptied, del, emptiedAgain }) };
    }),
  });

  cases.push({
    id: 'grid_paste_of_a_table_fills_the_cells_instead_of_nesting',
    description: 'Coller un tableau (copie d\'un tableur) remplit les cases à partir de la case courante au lieu d\'imbriquer un second tableau, que le garde-fou refuserait',
    run: async (h) => inGrid(h, async () => {
      await placeCursor(1, 1);
      ed().view.pasteHTML('<table><tbody><tr><td>un</td><td>deux</td></tr><tr><td>trois</td><td>quatre</td></tr></tbody></table>');
      await sleep(150);
      const text = (r, c) => tableNode().child(r).child(c).textContent;
      let nested = false; tableNode().descendants(n => { if (n.type.name === 'table') nested = true; return !nested; });
      const pass = !nested && text(1, 1) === 'un' && text(1, 2) === 'deux' && text(2, 1) === 'trois' && text(2, 2) === 'quatre' && tableNode().childCount >= 15;
      return { pass, notes: JSON.stringify({ nested, row1: [text(1, 1), text(1, 2)], row2: [text(2, 1), text(2, 2)], rows: tableNode().childCount }) };
    }),
  });

  cases.push({
    id: 'grid_undo_never_empties_the_grid',
    description: 'Annuler à répétition après une saisie ne retire jamais la grille de départ : sa création n\'est pas un pas d\'historique',
    run: async (h) => inGrid(h, async () => {
      await typeInCell(0, 0, 'a');
      await typeInCell(0, 1, 'b');
      for (let i = 0; i < 8; i++) { ed().commands.undo(); await sleep(15); }
      const pass = doc().child(0).type.name === 'table' && tableNode().childCount === 15 && tableNode().firstChild.childCount === 6 && doc().textContent === '';
      return { pass, notes: Editor.getHTML().slice(0, 200) };
    }),
  });

  // === 4) Largeurs, hauteurs et bandeaux ============================================================================================================================

  cases.push({
    id: 'grid_added_rows_and_columns_get_a_size_like_their_neighbours',
    description: 'Une colonne ajoutée par la barre de la case prend 100 px, une ligne ajoutée prend la hauteur de la ligne du dessus (du dessous pour la première) ; les bandeaux suivent',
    run: async (h) => inGrid(h, async () => {
      await placeCursor(0, 0);
      ed().chain().focus().addColumnAfter().run();
      await sleep(120);
      const widthsOk = Array.from({ length: tableNode().childCount }, (_, r) => Array.from({ length: tableNode().child(r).childCount }, (_, c) => String(tableNode().child(r).child(c).attrs.colwidth)).join('|')).every(line => line === new Array(7).fill('100').join('|'));
      // ligne 0 à 40 px, puis une ligne ajoutée sous elle et une avant elle
      const rowPos0 = 1;
      ed().view.dispatch(ed().state.tr.setNodeMarkup(rowPos0, undefined, Object.assign({}, tableNode().child(0).attrs, { rowHeight: 40 })));
      await placeCursor(0, 0);
      ed().chain().focus().addRowAfter().run();
      await sleep(80);
      const below = tableNode().child(1).attrs.rowHeight;
      await placeCursor(0, 0);
      ed().chain().focus().addRowBefore().run();
      await sleep(120);
      const above = tableNode().child(0).attrs.rowHeight;
      const rows = tableNode().childCount;
      const pass = widthsOk && below === 40 && above === 40 && rows === 17 && colHeads().length === 7 && rowHeads().length === 17;
      return { pass, notes: JSON.stringify({ widthsOk, below, above, rows, colHeads: colHeads().length, rowHeads: rowHeads().length }) };
    }),
  });

  cases.push({
    id: 'grid_a_long_text_grows_its_row_and_the_strip_follows',
    description: 'Un texte long dans une case étroite agrandit sa ligne (la hauteur réglée est un minimum) et le bandeau de la ligne reprend la hauteur réelle',
    run: async (h) => inGrid(h, async () => {
      const before = rowEls()[0].getBoundingClientRect().height;
      await typeInCell(0, 0, 'Un texte beaucoup plus long que cent pixels de large, qui doit passer à la ligne');
      await sleep(150);
      const after = rowEls()[0].getBoundingClientRect().height;
      const head = rowHeads()[0].getBoundingClientRect().height;
      const other = rowEls()[1].getBoundingClientRect().height;
      const attr = tableNode().child(0).attrs.rowHeight;
      return { pass: after > before + 20 && near(head, after, 1) && attr === 28 && near(rowHeads()[1].getBoundingClientRect().height, other, 1), notes: JSON.stringify({ before, after, head, attr }) };
    }),
  });

  cases.push({
    id: 'grid_dragging_a_column_handle_previews_live_and_commits_one_undo_step',
    description: 'Tirer le trait entre A et B : la colonne change en direct (le document ne bouge pas encore), puis UNE transaction à la fin - un seul Annuler la rend ; toutes les cases de la colonne reçoivent la largeur',
    run: async (h) => inGrid(h, async () => {
      await typeInCell(0, 0, 'x');
      await sleep(600); // hors du groupe d'historique de la frappe
      const startDoc = doc();
      let docTransactions = 0;
      const count = ({ transaction }) => { if (transaction.docChanged) docTransactions++; };
      ed().on('transaction', count);
      const handle = colHeads()[0].querySelector('.v2-grid-handle');
      const live = await dragHandle(handle, 60, 0, {
        probe: () => ({ domWidth: colEls()[0].getBoundingClientRect().width, headWidth: colHeads()[0].getBoundingClientRect().width, docWidth: tableNode().child(0).child(0).attrs.colwidth, docSame: doc().eq(startDoc), transactions: docTransactions }),
      });
      ed().off('transaction', count);
      const widths = new Set(); tableNode().forEach(row => widths.add(String(row.child(0).attrs.colwidth)));
      const colAfter = near(colEls()[0].getBoundingClientRect().width, 160, 1);
      ed().commands.undo();
      await sleep(120);
      const undone = new Set(); tableNode().forEach(row => undone.add(String(row.child(0).attrs.colwidth)));
      const typed = doc().textContent === 'x'; // l'annulation n'a défait que le geste
      const pass = near(live.domWidth, 160, 1) && near(live.headWidth, 160, 1) && String(live.docWidth) === '100' && live.docSame && live.transactions === 0 && docTransactions === 1
        && Array.from(widths).join() === '160' && colAfter && Array.from(undone).join() === '100' && typed && near(colEls()[0].getBoundingClientRect().width, 100, 1) && near(colHeads()[0].getBoundingClientRect().width, 100, 1);
      return { pass, notes: JSON.stringify({ live, docTransactions, widths: Array.from(widths), undone: Array.from(undone), typed }) };
    }),
  });

  cases.push({
    id: 'grid_dragging_a_handle_never_goes_under_the_minimum_and_escape_cancels',
    description: 'Une colonne ne passe pas sous 24 px ; Échap pendant le geste rend la largeur d\'avant sans rien enregistrer',
    run: async (h) => inGrid(h, async () => {
      const handle = colHeads()[1].querySelector('.v2-grid-handle');
      await dragHandle(handle, -500, 0);
      const min = tableNode().child(0).child(1).attrs.colwidth[0];
      const startDoc = doc();
      await dragHandle(colHeads()[2].querySelector('.v2-grid-handle'), 80, 0, { cancel: true });
      const cancelled = doc().eq(startDoc) && near(colEls()[2].getBoundingClientRect().width, 100, 1) && near(colHeads()[2].getBoundingClientRect().width, 100, 1);
      return { pass: min === 24 && cancelled, notes: JSON.stringify({ min, cancelled, col2: colEls()[2].getBoundingClientRect().width }) };
    }),
  });

  cases.push({
    id: 'grid_row_handle_resizes_a_row_and_stops_at_its_text_height',
    description: 'Tirer le trait sous le numéro d\'une ligne règle sa hauteur ; on ne descend pas sous la hauteur de son texte (la ligne 1 contient trois lignes de texte)',
    run: async (h) => inGrid(h, async () => {
      await dragHandle(rowHeads()[2].querySelector('.v2-grid-handle'), 0, 30);
      const grown = tableNode().child(2).attrs.rowHeight;
      await typeInCell(0, 0, 'Un texte beaucoup plus long que cent pixels de large, qui doit passer à la ligne');
      await sleep(150);
      const natural = rowEls()[0].getBoundingClientRect().height;
      await dragHandle(rowHeads()[0].querySelector('.v2-grid-handle'), 0, -200);
      const floor = tableNode().child(0).attrs.rowHeight;
      const shown = rowEls()[0].getBoundingClientRect().height;
      return { pass: grown > 40 && floor >= Math.floor(natural) - 1 && floor > 28 && near(shown, natural, 2), notes: JSON.stringify({ grown, natural, floor, shown }) };
    }),
  });

  cases.push({
    id: 'grid_clicking_a_strip_selects_the_whole_column_row_or_grid',
    description: 'Un clic sur une lettre sélectionne la colonne, sur un numéro la ligne, sur le coin toute la grille ; Maj + clic étend ; les bandeaux des lignes et colonnes touchées s\'allument',
    run: async (h) => inGrid(h, async () => {
      const count = () => { let n = 0; const sel = ed().state.selection; if (sel.forEachCell) sel.forEachCell(() => { n++; }); return n; };
      const down = (el, extra) => { const [x, y] = centerOf(el); el.dispatchEvent(pointer('pointerdown', x - 8, y, extra)); };
      down(colHeads()[1]); await sleep(80);
      const column = count();
      const columnLit = colHeads().map((c, i) => c.classList.contains('sel') ? i : -1).filter(i => i >= 0).join();
      down(rowHeads()[2]); await sleep(80);
      const row = count();
      const rowLit = rowHeads().map((c, i) => c.classList.contains('sel') ? i : -1).filter(i => i >= 0).join();
      down(colHeads()[3], { shiftKey: false }); await sleep(60);
      down(colHeads()[5], { shiftKey: true }); await sleep(80);
      const extended = count();
      const [cx, cy] = centerOf(document.querySelector('.v2-grid-corner'));
      document.querySelector('.v2-grid-corner').dispatchEvent(pointer('pointerdown', cx, cy)); await sleep(80);
      const all = count();
      return { pass: column === 15 && columnLit === '1' && row === 6 && rowLit === '2' && extended === 45 && all === 90, notes: JSON.stringify({ column, columnLit, row, rowLit, extended, all }) };
    }),
  });

  // === 5) Cellule courante, barre flottante de la case ===============================================================================================================

  cases.push({
    id: 'grid_cell_bar_is_docked_above_the_grid_and_cannot_delete_the_table',
    description: 'La barre de la case est fixée dans sa bande, entre la barre d\'outils et le plan de travail : jamais posée sur une case (elle recouvrait les cases voisines de la case courante, un glissé de souris y tombait sur ses boutons), la même quelle que soit la case courante ; « Supprimer le tableau » y est grisé, et la case courante a son cadre',
    run: async (h) => inGrid(h, async () => {
      const report = [];
      for (const [row, col] of [[9, 3], [0, 0], [1, 5]]) {
        await placeCursor(row, col);
        await sleep(250);
        const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
        const bar = del && del.closest('.v2-floating-toolbar');
        const dock = document.getElementById('v2-cell-bar-dock');
        const cell = GridEditor.currentCellDom();
        if (!bar || !cell || !dock) return { pass: false, notes: 'barre, bande ou case introuvable' };
        const b = bar.getBoundingClientRect();
        const box = document.getElementById('editor-container').getBoundingClientRect();
        const covered = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).filter(td => { const c = td.getBoundingClientRect(); return c.width > 0 && c.right > b.left && c.left < b.right && c.bottom > b.top && c.top < b.bottom; }).length;
        const framed = cell.classList.contains('v2-grid-cur') && getComputedStyle(cell).outlineStyle === 'solid';
        report.push({ at: row + ',' + col, visible: bar.classList.contains('visible') && b.width > 0, docked: bar.classList.contains('docked') && dock.contains(bar), aboveGrid: b.bottom <= box.top + 1, covered, framed, delLocked: del.classList.contains('v2-hf-locked'), top: Math.round(b.top) });
      }
      const sameSpot = report.every(r => r.top === report[0].top);
      return { pass: report.every(r => r.visible && r.docked && r.aboveGrid && r.covered === 0 && r.framed && r.delLocked) && sameSpot, notes: JSON.stringify(report) };
    }),
  });

  // === 6) Le suivi des modifications est coupé ======================================================================================================================

  cases.push({
    id: 'grid_turns_track_changes_off_and_nothing_turns_it_back_on',
    description: 'Une grille s\'ouvre sans suivi des modifications même si le document d\'avant l\'avait allumé : une frappe n\'y devient pas une suggestion (alors qu\'elle en est une dans le document), et le bouton grisé ne le rallume pas',
    run: async (h) => {
      await h.resetEditor();
      Editor.setTrackChanges(true);
      await sleep(60);
      const wasOn = Editor.isTrackChangesOn();
      await h.focusAtEnd();
      ed().chain().focus().insertContent('document').run(); // témoin : dans un document, une frappe devient une suggestion
      await sleep(60);
      const marker = /<ins |<del |data-type="modification"/;
      const controlSuggests = marker.test(Editor.getHTML());
      let notes = null;
      try {
        await enterGrid(h);
        const offInGrid = !Editor.isTrackChangesOn();
        await typeInCell(0, 0, 'saisie');
        const suggestions = marker.test(Editor.getHTML());
        const btn = document.getElementById('v2-btn-track-changes');
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.click();
        await sleep(60);
        notes = { wasOn, controlSuggests, offInGrid, suggestions, stillOff: !Editor.isTrackChangesOn(), greyed: btn.classList.contains('v2-hf-locked') };
      } finally { await leaveGrid(h); }
      Editor.setTrackChanges(false);
      return { pass: notes.wasOn && notes.controlSuggests && notes.offInGrid && !notes.suggestions && notes.stillOff && notes.greyed, notes: JSON.stringify(notes) };
    },
  });

  // === 7) Contenu qui n'est pas une grille, enregistrement, Lecture ===================================================================================================

  cases.push({
    id: 'grid_normalizes_a_model_that_is_not_one_table',
    description: 'Un modèle de type grille dont le contenu n\'est pas un tableau (texte seul, tableau suivi de texte, tableau dans un tableau, colonnes sans largeur) devient une grille valable : la grille de départ, ou le premier tableau valable avec ses largeurs posées',
    run: async (h) => {
      await h.resetEditor();
      const shape = () => doc().childCount + ':' + tableNode().childCount + 'x' + tableNode().firstChild.childCount;
      const results = {};
      try {
        GridEditor.setActive(false);
        Editor.setHTML('<p>bonjour</p>');
        GridEditor.setActive(true);
        results.textOnly = shape() + ' ' + (doc().textContent === '');
        GridEditor.setActive(false);
        Editor.setHTML('<table><tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody></table><p>texte en trop</p>');
        GridEditor.setActive(true);
        const widths = []; tableNode().forEach(row => row.forEach(cell => widths.push(String(cell.attrs.colwidth))));
        const heights = []; tableNode().forEach(row => heights.push(row.attrs.rowHeight));
        results.tableThenText = { rows: tableNode().childCount, cols: tableNode().firstChild.childCount, text: doc().textContent, extraParagraph: Array.from({ length: doc().childCount }, (_, i) => doc().child(i).textContent).join('|'), widths: widths.join(), heights: heights.join() };
        GridEditor.setActive(false);
        Editor.setHTML('<table><tbody><tr><td><table><tbody><tr><td>dedans</td></tr></tbody></table></td></tr></tbody></table>');
        GridEditor.setActive(true);
        results.nested = shape() + ' ' + (doc().textContent === '');
      } finally {
        GridEditor.setActive(false);
        MainToolbar.setGridMode(false);
        Editor.setHTML('<p></p>');
      }
      const t = results.tableThenText;
      const pass = results.textOnly === '2:15x6 true' && t.rows === 2 && t.cols === 2 && t.text === 'a1b1a2b2' && t.extraParagraph === 'a1b1a2b2|' && t.widths === '100,100,100,100'
        && t.heights === '28,28' && results.nested === '2:15x6 true';
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'grid_save_and_reopen_keeps_the_type_the_widths_and_the_heights',
    description: 'Enregistrer une grille (type « grille » en base), passer à un document, rouvrir la grille : même type, mêmes largeurs de colonnes, mêmes hauteurs de lignes, mêmes textes ; le document, lui, n\'a ni bandeaux ni garde-fou',
    run: async (h) => {
      await h.resetEditor();
      let saved = null;
      let record = null;
      try {
        await enterGrid(h);
        await typeInCell(0, 0, 'Nom');
        await typeInCell(0, 1, 'Montant');
        ed().view.dispatch(ed().state.tr.setNodeMarkup(1, undefined, Object.assign({}, tableNode().child(0).attrs, { rowHeight: 44 })));
        await dragHandle(colHeads()[1].querySelector('.v2-grid-handle'), 50, 0);
        document.getElementById('template-name').value = 'Grille de test';
        await h.clickButton('btn-save');
        await sleep(500);
        saved = Templates.getCurrentId();
        record = Templates.getCached().find(t => String(t.id) === String(saved));
      } finally { await leaveGrid(h); }
      const documentIsPlain = !GridEditor.isActive() && !document.querySelector('.v2-grid-colhead') && !editorBox().classList.contains('v2-grid-mode');
      let reopened = null;
      try {
        const select = document.getElementById('template-select');
        select.value = String(saved);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);
        const first = tableNode().child(0);
        reopened = {
          active: GridEditor.isActive(), shape: tableNode().childCount + 'x' + first.childCount, texts: first.child(0).textContent + '/' + first.child(1).textContent,
          widths: Array.from({ length: first.childCount }, (_, i) => first.child(i).attrs.colwidth[0]).join(','), heights: [tableNode().child(0).attrs.rowHeight, tableNode().child(1).attrs.rowHeight].join(','),
          strips: colHeads().length + 'x' + rowHeads().length, a4: editorBox().classList.contains('a4-preview'),
        };
      } finally { await leaveGrid(h); }
      const pass = !!record && record.typeModele === 'grille' && documentIsPlain && reopened.active && reopened.shape === '15x6' && reopened.texts === 'Nom/Montant' && reopened.widths === '100,150,100,100,100,100'
        && reopened.heights === '44,28' && reopened.strips === '6x15' && !reopened.a4;
      return { pass, notes: JSON.stringify({ type: record && record.typeModele, documentIsPlain, reopened }) };
    },
  });

  cases.push({
    id: 'grid_back_to_a_document_restores_the_normal_editor',
    description: 'Quitter la grille rend l\'éditeur normal : plus de bandeaux, de classe ni de garde-fou (un tableau s\'insère de nouveau), barre d\'outils et aperçu A4 rendus',
    run: async (h) => {
      await h.resetEditor();
      await enterGrid(h);
      await leaveGrid(h);
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await sleep(80);
      const tables = h.tiptap().querySelectorAll('table').length;
      const pass = !GridEditor.isActive() && !document.querySelector('.v2-grid-corner, .v2-grid-cols, .v2-grid-rows') && tables === 1 && !document.getElementById('v2-toggle-a4-preview').disabled
        && !isLocked('v2-btn-table') && !isLocked('v2-btn-citation') && !isLocked('v2-btn-track-changes') && !document.body.classList.contains('pp-grid-mode');
      return { pass, notes: JSON.stringify({ tables, locks: GREYED_IN_GRID.filter(id => isLocked(id)) }) };
    },
  });

  cases.push({
    id: 'grid_survives_reading_mode_and_back_with_its_strips',
    description: 'Passer en Lecture puis revenir en Édition ne casse pas la grille : le bandeau des colonnes et des lignes est de nouveau aligné sur le tableau',
    run: async (h) => inGrid(h, async () => {
      await typeInCell(0, 0, 'texte');
      await h.clickButton('btn-mode-read');
      await sleep(400);
      await h.clickButton('btn-mode-edit');
      await sleep(400);
      const table = document.querySelector('.tiptap table');
      const tr = table.getBoundingClientRect();
      const aligned = colHeads().length === 6 && rowHeads().length === 15 && near(colHeads()[0].getBoundingClientRect().left, tr.left, 1) && near(rowHeads()[0].getBoundingClientRect().top, tr.top, 1.5)
        && colHeads().every((c, i) => near(c.getBoundingClientRect().width, colEls()[i].getBoundingClientRect().width));
      return { pass: aligned && GridEditor.isActive() && tr.width > 0, notes: JSON.stringify({ table: [tr.left, tr.top, tr.width], cols: colHeads().length, rows: rowHeads().length }) };
    }),
  });

  // === 8) Lot A2 : alignement vertical des cases, Lecture et PDF d'une grille ========================================================================================

  // Un enregistrement de test et des bulles pour le lire : la Lecture et le PDF remplacent les bulles par les valeurs, l'éditeur les montre en pastilles.
  const READ_TABLE = 'GrilleLecture';
  const READ_RECORD = { id: 1, Nom: 'Alpha Durand', Montant: 1234.5 };
  const badge = col => `<span class="var-badge" data-table="${READ_TABLE}" data-column="${col}" data-key="${READ_TABLE}.${col}"></span>`;
  async function useReadRecord() {
    const stub = window.__gristStub;
    stub.setVariables(READ_TABLE, { Nom: 'Text', Montant: 'Numeric' });
    stub.setRows(READ_TABLE, [READ_RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(READ_RECORD, READ_TABLE);
    await sleep(100);
  }
  // Une grille aux dimensions connues, chargée comme un modèle enregistré : `widths` (px, par colonne), `heights` (px, par ligne), `cells` = le HTML de chaque case ligne
  // par ligne, ou { html, valign } pour une case alignée en haut, au milieu ou en bas.
  function gridHtml(widths, heights, cells) {
    const total = widths.reduce((sum, w) => sum + w, 0);
    const cellHtml = (cell, k) => { const c = typeof cell === 'string' ? { html: cell } : cell; return `<td colwidth="${widths[k]}"${c.valign ? ` data-valign="${c.valign}"` : ''}><p>${c.html}</p></td>`; };
    return `<table style="width: ${total}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
      + cells.map((row, r) => `<tr data-row-height="${heights[r]}" style="height: ${heights[r]}px">${row.map(cellHtml).join('')}</tr>`).join('') + '</tbody></table>';
  }
  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await sleep(250);
  }
  const SAMPLE_WIDTHS = [120, 80, 200];
  const SAMPLE_HEIGHTS = [40, 28, 60, 28, 70];
  const SAMPLE_CELLS = [
    ['Nom', 'Montant', 'Remarque'],
    [badge('Nom'), badge('Montant'), 'Un texte assez long pour passer sur plusieurs lignes dans cette case étroite'],
    ['milieu', '', ''],
    ['fin', '', ''],
    [{ html: 'haut', valign: 'top' }, { html: 'centre', valign: 'middle' }, { html: 'bas', valign: 'bottom' }],
  ];
  // Ce que voit une personne d'un tableau rendu (éditeur ou Lecture) : sa largeur, celle des colonnes, la hauteur et le haut de chaque ligne, le centre du texte de chaque
  // case dans sa ligne, son alignement vertical et son texte.
  function measureTable(root) {
    const table = root.querySelector('table');
    const box = table.getBoundingClientRect();
    const rows = Array.from(table.rows);
    const center = (td, tr) => { const range = document.createRange(); range.selectNodeContents(td); const r = range.getBoundingClientRect(); return (r.top + r.bottom) / 2 - tr.top; };
    return {
      width: box.width,
      cols: Array.from(rows[0].cells).map(td => td.getBoundingClientRect().width),
      rows: rows.map(tr => tr.getBoundingClientRect().height),
      tops: rows.map(tr => tr.getBoundingClientRect().top - box.top),
      centers: rows.map(tr => Array.from(tr.cells).map(td => center(td, tr.getBoundingClientRect()))),
      aligns: rows.map(tr => Array.from(tr.cells).map(td => getComputedStyle(td).verticalAlign)),
      texts: rows.map(tr => Array.from(tr.cells).map(td => td.textContent.trim())),
    };
  }
  const allNear = (xs, ys, tolerance) => xs.length === ys.length && xs.every((x, i) => near(x, ys[i], tolerance));

  cases.push({
    id: 'grid_cells_keep_a_vertical_alignment_saved_with_the_model',
    description: 'Chaque case d\'une grille porte son alignement vertical (au milieu au départ) : enregistré avec le modèle (data-valign), relu au rechargement ; un ancien modèle de grille (cases sans alignement, ligne vide finale) est lu « au milieu » et enregistré sans ligne vide ; une valeur inconnue devient « au milieu »',
    run: async (h) => inGrid(h, async () => {
      const cells = () => { const list = []; tableNode().descendants(node => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') list.push(node); return true; }); return list; };
      const aligns = () => cells().map(c => c.attrs.verticalAlign);
      const count = (text, re) => (text.match(re) || []).length;
      const freshAligns = aligns();
      const fresh = freshAligns.length === 90 && freshAligns.every(v => v === 'middle');
      const savedFresh = Editor.getHTML();
      const marked = count(savedFresh, /<td\b[^>]*data-valign="middle"[^>]*style="[^"]*vertical-align: middle/g);
      // Une case en haut : enregistrée, puis relue ; les autres restent au milieu.
      const topPos = cellPos(1, 2);
      ed().view.dispatch(ed().state.tr.setNodeMarkup(topPos, null, Object.assign({}, doc().nodeAt(topPos).attrs, { verticalAlign: 'top' })));
      await sleep(80);
      const savedTop = Editor.getHTML();
      await loadGrid(savedTop);
      const reloaded = aligns();
      const topCells = count(savedTop, /data-valign="top"/g);
      // Un modèle de grille enregistré avant ce lot, et une valeur inconnue.
      const oldHtml = '<table style="width: 200px;"><colgroup><col style="width: 100px;"><col style="width: 100px;"></colgroup><tbody><tr data-row-height="28" style="height: 28px"><td colwidth="100"><p>a</p></td><td colwidth="100" data-valign="diagonal"><p>b</p></td></tr></tbody></table><p></p>';
      await loadGrid(oldHtml);
      const oldAligns = aligns();
      const oldSaved = Editor.getHTML();
      // Un tableau de document : ni alignement ajouté, ni ligne vide retirée, même collé d'Excel avec un vertical-align.
      GridEditor.setActive(false);
      Editor.setHTML('<table><tbody><tr><td style="vertical-align: bottom"><p>x</p></td><td><p>y</p></td></tr></tbody></table><p></p>');
      await sleep(150);
      const classicSaved = Editor.getHTML();
      const pass = fresh && marked === 90 && !/<\/table><p>/.test(savedFresh) && savedFresh.endsWith('</table>')
        && topCells === 1 && reloaded.indexOf('top') === 8 && reloaded.filter(v => v === 'middle').length === 89 && savedTop.endsWith('</table>')
        && oldAligns.join() === 'middle,middle' && oldSaved.endsWith('</table>') && !/data-valign="diagonal"/.test(oldSaved)
        && !/data-valign|vertical-align/.test(classicSaved) && classicSaved.endsWith('</table><p></p>');
      return { pass, notes: JSON.stringify({ fresh, marked, savedFreshTail: savedFresh.slice(-30), topCells, topAt: reloaded.indexOf('top'), middles: reloaded.filter(v => v === 'middle').length, oldAligns, oldSavedTail: oldSaved.slice(-30), classicSaved }) };
    }),
  });

  cases.push({
    id: 'grid_reading_mode_shows_the_grid_as_the_editor_does',
    description: 'Lecture d\'une grille (vrai bouton Lecture) : même largeur de tableau, mêmes colonnes et mêmes lignes que dans l\'éditeur, texte à la même hauteur dans sa case (au milieu, en haut, en bas), bulles remplacées par leur valeur, aucune ligne vide sous le tableau',
    run: async (h) => inGrid(h, async () => {
      await useReadRecord();
      await loadGrid(gridHtml(SAMPLE_WIDTHS, SAMPLE_HEIGHTS, SAMPLE_CELLS));
      const inEditor = measureTable(document.querySelector('.tiptap'));
      let inReader = null; let lastBlock = ''; let badgesLeft = -1;
      await h.clickButton('btn-mode-read');
      try {
        await sleep(600);
        const reader = document.getElementById('reader-container');
        inReader = measureTable(reader);
        const content = reader.querySelector('.reader-content');
        lastBlock = content.lastElementChild.tagName;
        badgesLeft = content.querySelectorAll('.var-badge').length;
      } finally {
        await h.clickButton('btn-mode-edit');
        await sleep(300);
      }
      const centersFirst = rows => rows.map(r => r[0]);
      const pass = !!inReader && near(inReader.width, inEditor.width, 1) && allNear(inReader.cols, inEditor.cols, 1) && allNear(inReader.rows, inEditor.rows, 1)
        && allNear(centersFirst(inReader.centers), centersFirst(inEditor.centers), 1.5) && allNear(inReader.centers[4], inEditor.centers[4], 1.5)
        && inReader.aligns.every((row, r) => row.every((a, k) => a === (r === 4 ? ['top', 'middle', 'bottom'][k] : 'middle')))
        && inReader.texts[1][0] === 'Alpha Durand' && inReader.texts[1][1].includes('234,5') && badgesLeft === 0 && lastBlock === 'TABLE';
      return { pass, notes: JSON.stringify({ inEditor, inReader, lastBlock, badgesLeft }) };
    }),
  });

  cases.push({
    id: 'grid_pdf_keeps_row_heights_and_centers_the_text_like_the_editor',
    description: 'PDF d\'une grille : chaque ligne garde sa hauteur de l\'éditeur (une ligne plus haute que son texte reste haute) et le texte de chaque case est à la même hauteur que dans l\'éditeur (au milieu, en haut, en bas), le tout sur une seule page',
    run: async (h) => inGrid(h, async () => {
      await useReadRecord();
      await loadGrid(gridHtml(SAMPLE_WIDTHS, SAMPLE_HEIGHTS, SAMPLE_CELLS));
      const inEditor = measureTable(document.querySelector('.tiptap'));
      const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined, { tableId: READ_TABLE, record: READ_RECORD });
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const items = truth.pages[0].textItems;
      const yOf = str => { const item = items.find(i => i.str === str); return item ? item.y : null; };
      const tableBlock = pdf.content.find(b => b.table);
      // Le baseline du texte de la 1re case de chaque ligne, depuis celui de la 1re ligne : ce que l'éditeur donne, en pt (1 px = 0,75 pt).
      const firstTexts = ['Nom', 'Alpha', 'milieu', 'fin', 'haut']; // pdfmake peint chaque mot à part : « Alpha » et « Durand » sont deux éléments de texte
      const ys = firstTexts.map(yOf);
      const wanted = firstTexts.map((_, i) => ((inEditor.tops[i] + inEditor.centers[i][0]) - (inEditor.tops[0] + inEditor.centers[0][0])) * 0.75);
      const rowGaps = ys.map((y, i) => (y === null || ys[0] === null) ? null : Math.round(((y - ys[0]) - wanted[i]) * 100) / 100);
      // La dernière ligne : haut, centre, bas.
      const zs = ['haut', 'centre', 'bas'].map(yOf);
      const wantedZ = [0, 1, 2].map(k => (inEditor.centers[4][k] - inEditor.centers[4][0]) * 0.75);
      const alignGaps = zs.map((y, k) => (y === null || zs[0] === null) ? null : Math.round(((y - zs[0]) - wantedZ[k]) * 100) / 100);
      const text = items.map(i => i.str).join(' ');
      const pass = truth.pages.length === 1 && !!tableBlock && Array.isArray(tableBlock.table.heights) && tableBlock.table.heights.length === SAMPLE_HEIGHTS.length
        && rowGaps.every(g => g !== null && Math.abs(g) <= 1) && alignGaps.every(g => g !== null && Math.abs(g) <= 1) && wantedZ[2] > wantedZ[1] && wantedZ[1] > 0
        && text.includes('Alpha Durand') && text.includes('234,5');
      return { pass, notes: JSON.stringify({ pages: truth.pages.length, heights: tableBlock && tableBlock.table.heights, rowGaps, alignGaps, wanted, wantedZ, ys, zs }) };
    }),
  });

  cases.push({
    id: 'grid_pdf_fits_a_wide_grid_on_the_page',
    description: 'PDF d\'une grille plus large que la page (12 colonnes de 100 px) : réduite à la largeur de la page, sans déborder à droite ni passer sur une deuxième page',
    run: async (h) => inGrid(h, async () => {
      const widths = Array(12).fill(100);
      await loadGrid(gridHtml(widths, [28, 28, 28], [0, 1, 2].map(r => widths.map((_, c) => 'r' + r + 'c' + c))));
      const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const page = truth.pages[0];
      const right = Math.max.apply(null, page.textItems.map(i => i.x + i.width));
      const first = page.textItems.find(i => i.str === 'r0c0');
      const pass = truth.pages.length === 1 && right <= page.width - 28 + 1 && right > page.width / 2 && !!first && first.x >= 28 - 1;
      return { pass, notes: JSON.stringify({ pages: truth.pages.length, right, pageWidth: page.width, firstX: first && first.x }) };
    }),
  });

  cases.push({
    id: 'grid_pdf_leaves_a_document_table_as_before',
    description: 'Un tableau de document (hors grille) n\'a pas de hauteur de ligne imposée dans le PDF ni de centrage vertical : seul un tableau de grille, aux lignes réglées une à une, en a',
    run: async (h) => {
      await h.resetEditor();
      GridEditor.setActive(false);
      Editor.setHTML('<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td></tr><tr><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table><p>après</p>');
      await sleep(200);
      const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
      const tableBlock = pdf.content.find(b => b.table);
      const cellMargins = tableBlock ? tableBlock.table.body.map(row => row.map(cell => (cell.margin || []).join(','))) : null;
      const pass = !!tableBlock && tableBlock.table.heights === undefined && cellMargins.every(row => row.every(m => m === '' || m === '0,0,0,0'));
      return { pass, notes: JSON.stringify({ heights: tableBlock && tableBlock.table.heights, cellMargins }) };
    },
  });

  // === 9) Lot B1 : fusion et alignement vertical dans la barre de la case, cases fusionnées dans la Lecture et le PDF ==============================================================
  // Les gestes à la vraie souris (glisser sur un bloc, cliquer « Fusionner », Ctrl+Z, tirer le bord d'une colonne sous une case fusionnée) : dev-tests/verify-grid-cells-mouse.mjs.

  const barButton = action => document.querySelector(`.v2-cell-bar-dock .v2-floating-toolbar button[data-action="${action}"]`);
  const barLocked = action => barButton(action).classList.contains('v2-hf-locked');
  // Le clic d'une personne sur un bouton de la barre de la case : appui, relâchement, clic (la barre agit à l'appui et ignore le clic qui le suit).
  async function pressBar(action) {
    const btn = barButton(action);
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(60);
  }
  async function selectCells(r1, c1, r2, c2) {
    ed().chain().focus().setCellSelection({ anchorCell: cellPos(r1, c1), headCell: cellPos(r2, c2) }).run();
    await sleep(60);
  }
  const allCells = () => { const list = []; tableNode().forEach((row, _o, r) => row.forEach(cell => list.push({ row: r, cell }))); return list; };
  const mergedCell = () => { const found = allCells().find(c => c.cell.attrs.colspan > 1 || c.cell.attrs.rowspan > 1); return found ? found.cell : null; };
  const colWidthsNow = () => colEls().map(c => Math.round(c.getBoundingClientRect().width * 10) / 10);
  const rowHeightsNow = () => rowEls().map(r => Math.round(r.getBoundingClientRect().height * 10) / 10);

  cases.push({
    id: 'grid_cell_bar_merge_and_split_follow_the_selection_and_are_greyed_never_removed',
    description: 'Barre de la case d\'une grille : « Fusionner les cases » n\'est actif que si plusieurs cases sont choisies, « Scinder la case » que sur une case fusionnée - grisés (jamais retirés) le reste du temps ; fusionner fait une case de 2 colonnes x 2 lignes qui garde le texte des deux cases, scinder rend les cases ; chacun est annulé par un seul Annuler',
    run: async (h) => inGrid(h, async () => {
      const labels = {};
      ['cell-merge', 'cell-split', 'valign-top', 'valign-middle', 'valign-bottom'].forEach(a => { labels[a] = barButton(a) ? barButton(a).title : null; });
      await placeCursor(0, 0);
      const cursor = { merge: barLocked('cell-merge'), split: barLocked('cell-split'), shown: ['cell-merge', 'cell-split'].every(a => barButton(a).getBoundingClientRect().width > 0) };
      await typeInCell(1, 1, 'x1');
      await typeInCell(1, 2, 'x2');
      await sleep(650); // deux gestes à moins de 500 ms sont UN évènement d'historique
      await selectCells(1, 1, 2, 2);
      const block = { merge: barLocked('cell-merge'), split: barLocked('cell-split'), canMerge: GridEditor.canMerge(ed()), canSplit: GridEditor.canSplit(ed()) };
      const before = { widths: colWidthsNow(), heights: rowHeightsNow(), count: cellCount() };
      await pressBar('cell-merge');
      const merged = mergedCell();
      const afterMerge = { count: cellCount(), colspan: merged && merged.attrs.colspan, rowspan: merged && merged.attrs.rowspan, text: merged && Array.from({ length: merged.childCount }, (_, i) => merged.child(i).textContent).join('|'),
        merge: barLocked('cell-merge'), split: barLocked('cell-split'), widths: colWidthsNow(), heights: rowHeightsNow(), selected: ed().state.selection.$anchorCell ? document.querySelectorAll('.tiptap .selectedCell').length : 0 };
      await sleep(650);
      await pressBar('cell-split');
      const afterSplit = { count: cellCount(), merged: !!mergedCell(), second: Array.from({ length: tableNode().child(1).childCount }, (_, i) => tableNode().child(1).child(i).textContent).join('|'), valigns: new Set(allCells().map(c => c.cell.attrs.verticalAlign)).size };
      await sleep(650);
      ed().commands.undo();
      await sleep(80);
      const undoSplit = { count: cellCount(), merged: !!mergedCell() };
      await sleep(650);
      ed().commands.undo();
      await sleep(80);
      const undoMerge = { count: cellCount(), merged: !!mergedCell(), second: Array.from({ length: tableNode().child(1).childCount }, (_, i) => tableNode().child(1).child(i).textContent).join('|') };
      // Rien ne se fusionne quand ce n'est pas possible (la commande est refusée, pas ignorée en silence : elle répond faux).
      await placeCursor(3, 3);
      const refused = !GridEditor.mergeCells(ed()) && !GridEditor.splitCell(ed()) && cellCount() === 90;
      const pass = ['cell-merge', 'cell-split', 'valign-top', 'valign-middle', 'valign-bottom'].every(a => !!labels[a])
        && cursor.merge && cursor.split && cursor.shown && !block.merge && block.split && block.canMerge && !block.canSplit
        && afterMerge.count === 87 && afterMerge.colspan === 2 && afterMerge.rowspan === 2 && afterMerge.text === 'x1|x2' && afterMerge.merge && !afterMerge.split && afterMerge.selected === 1
        && JSON.stringify(afterMerge.widths) === JSON.stringify(before.widths) && JSON.stringify(afterMerge.heights) === JSON.stringify(before.heights)
        && afterSplit.count === 90 && !afterSplit.merged && afterSplit.second === '|x1x2||||' && afterSplit.valigns === 1
        && undoSplit.count === 87 && undoSplit.merged && undoMerge.count === 90 && !undoMerge.merged && undoMerge.second === '|x1|x2|||' && refused;
      return { pass, notes: JSON.stringify({ labels, cursor, block, before, afterMerge, afterSplit, undoSplit, undoMerge, refused }) };
    }),
  });

  cases.push({
    id: 'grid_merging_whole_columns_keeps_their_widths_and_a_split_gives_them_back',
    description: 'Fusionner toutes les lignes de deux colonnes de largeurs différentes (150 px et 60 px) ne remet aucune des deux à la largeur par défaut (la case fusionnée porte 150 et 60), scinder rend à chaque colonne la sienne ; tirer le trait d\'une de ces colonnes ne règle que la sienne',
    run: async (h) => inGrid(h, async () => {
      await loadGrid(gridHtml([100, 150, 60, 100], [28, 28, 28, 28], [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => String.fromCharCode(65 + c) + (r + 1)))));
      const before = colWidthsNow();
      await selectCells(0, 1, 3, 2);
      await pressBar('cell-merge');
      const merged = mergedCell();
      const afterMerge = { widths: colWidthsNow(), span: merged && [merged.attrs.colspan, merged.attrs.rowspan], colwidth: merged && String(merged.attrs.colwidth) };
      // Le trait du bandeau C (la colonne de 60 px, recouverte par la case fusionnée) de 25 px vers la droite : seule la colonne C change, la case fusionnée en porte les deux parts.
      await dragHandle(colHeads()[2].querySelector('.v2-grid-handle'), 25, 0);
      const resized = { widths: colWidthsNow(), colwidth: String(mergedCell().attrs.colwidth) };
      await sleep(650);
      await pressBar('cell-split');
      const afterSplit = { widths: colWidthsNow(), row1: Array.from({ length: tableNode().child(0).childCount }, (_, i) => String(tableNode().child(0).child(i).attrs.colwidth)).join('|') };
      const pass = JSON.stringify(before) === JSON.stringify([100, 150, 60, 100]) && JSON.stringify(afterMerge.widths) === JSON.stringify(before) && afterMerge.span.join() === '2,4' && afterMerge.colwidth === '150,60'
        && allNear(resized.widths, [100, 150, 85, 100], 1.5) && resized.colwidth === '150,85'
        && allNear(afterSplit.widths, [100, 150, 85, 100], 1.5) && afterSplit.row1 === '100|150|85|100';
      return { pass, notes: JSON.stringify({ before, afterMerge, resized, afterSplit }) };
    }),
  });

  cases.push({
    id: 'grid_cell_bar_vertical_alignment_buttons_apply_to_every_chosen_cell_in_one_undo',
    description: 'Barre de la case : « Aligner en haut / au milieu / en bas » change toutes les cases choisies d\'un coup (un seul Annuler), le bouton enfoncé dit l\'alignement des cases choisies - aucun quand elles diffèrent -, l\'alignement est enregistré avec le modèle et suivi par la Lecture',
    run: async (h) => inGrid(h, async () => {
      await useReadRecord();
      await loadGrid(gridHtml([100, 100, 100], [28, 90, 28], [['A1', 'B1', 'C1'], ['Haut', 'Milieu', 'Bas'], ['A3', 'B3', 'C3']]));
      const pressed = () => ['valign-top', 'valign-middle', 'valign-bottom'].filter(a => barButton(a).classList.contains('is-active') && barButton(a).getAttribute('aria-pressed') === 'true').join();
      const valigns = () => allCells().map(c => c.cell.attrs.verticalAlign).join();
      await placeCursor(0, 0);
      const start = pressed();
      await selectCells(1, 0, 1, 1);
      await pressBar('valign-top');
      const afterTop = { pressed: pressed(), valigns: valigns() };
      await selectCells(0, 0, 1, 0);
      const mixed = pressed();
      await sleep(650);
      await pressBar('valign-bottom');
      const afterBottom = { pressed: pressed(), valigns: valigns() };
      await sleep(650);
      ed().commands.undo();
      await sleep(80);
      const undone = valigns();
      await placeCursor(1, 0);
      await pressBar('valign-top');
      await placeCursor(1, 1);
      await pressBar('valign-middle');
      await placeCursor(1, 2);
      await pressBar('valign-bottom');
      const editor = Array.from(document.querySelectorAll('.tiptap table tr:nth-child(2) > td')).map(td => { const range = document.createRange(); range.selectNodeContents(td); const r = range.getBoundingClientRect(); return (r.top + r.bottom) / 2 - td.getBoundingClientRect().top; });
      const saved = Editor.getHTML();
      await h.clickButton('btn-mode-read');
      let reader = [];
      try {
        await sleep(600);
        reader = Array.from(document.querySelectorAll('#reader-container table tr:nth-child(2) > td')).map(td => { const range = document.createRange(); range.selectNodeContents(td); const r = range.getBoundingClientRect(); return (r.top + r.bottom) / 2 - td.getBoundingClientRect().top; });
      } finally { await h.clickButton('btn-mode-edit'); await sleep(300); }
      const pass = start === 'valign-middle' && afterTop.pressed === 'valign-top' && afterTop.valigns === 'middle,middle,middle,top,top,middle,middle,middle,middle' && mixed === ''
        && afterBottom.pressed === 'valign-bottom' && afterBottom.valigns === 'bottom,middle,middle,bottom,top,middle,middle,middle,middle'
        && undone === 'middle,middle,middle,top,top,middle,middle,middle,middle'
        && editor[0] < editor[1] - 15 && editor[1] < editor[2] - 15 && allNear(reader, editor, 1.5)
        && (saved.match(/data-valign="top"/g) || []).length === 1 && (saved.match(/data-valign="bottom"/g) || []).length === 1 && (saved.match(/data-valign="middle"/g) || []).length === 7;
      return { pass, notes: JSON.stringify({ start, afterTop, mixed, afterBottom, undone, editor, reader }) };
    }),
  });

  // Une grille avec une ligne de titre fusionnée sur toute la largeur et un bloc de deux lignes : le HTML d'un modèle enregistré (cases fusionnées : colspan, rowspan, colwidth par colonne).
  const MERGE_WIDTHS = [120, 200, 80];
  const mergedTd = (inner, width, attrs) => `<td colwidth="${width}"${attrs || ''}><p>${inner}</p></td>`;
  const MERGED_GRID = '<table style="width: 400px;"><colgroup>' + MERGE_WIDTHS.map(w => `<col style="width: ${w}px;">`).join('') + '</colgroup><tbody>'
    + `<tr data-row-height="40" style="height: 40px">${mergedTd('Titre', '120,200,80', ' colspan="3" data-valign="middle"')}</tr>`
    + `<tr data-row-height="28" style="height: 28px">${mergedTd('a', 120, ' data-valign="middle"')}${mergedTd('b', 200, ' data-valign="middle"')}${mergedTd('c', 80, ' data-valign="middle"')}</tr>`
    + `<tr data-row-height="28" style="height: 28px">${mergedTd('bloc', 120, ' rowspan="2" data-valign="middle"')}${mergedTd('d', 200, ' data-valign="middle"')}${mergedTd('e', 80, ' data-valign="middle"')}</tr>`
    + `<tr data-row-height="60" style="height: 60px">${mergedTd('f', 200, ' data-valign="bottom"')}${mergedTd('g', 80, ' data-valign="top"')}</tr>`
    + '</tbody></table>';
  // Où le texte d'une case est dans un tableau rendu : abscisse de son début, ordonnée de son milieu, depuis le coin du tableau.
  function textSpot(root, text) {
    const table = root.querySelector('table');
    const td = Array.from(table.querySelectorAll('td')).find(c => c.textContent.trim() === text);
    const range = document.createRange(); range.selectNodeContents(td);
    const r = range.getBoundingClientRect(), t = table.getBoundingClientRect();
    return { x: r.left - t.left, y: (r.top + r.bottom) / 2 - t.top };
  }

  cases.push({
    id: 'grid_pdf_merged_cells_keep_the_layout_of_the_editor',
    description: 'PDF d\'une grille aux cases fusionnées (titre sur 3 colonnes, bloc de 2 lignes, trois largeurs différentes) : la case fusionnée sur plusieurs lignes laisse un emplacement vide dans les lignes d\'après (rien ne se décale), les colonnes ont la largeur de l\'éditeur (pas des parts égales parce que la 1re ligne est fusionnée), le texte est à la même hauteur que dans l\'éditeur - au milieu d\'un bloc de 2 lignes, en haut, en bas - sur une page',
    run: async (h) => inGrid(h, async () => {
      await loadGrid(MERGED_GRID);
      const names = ['Titre', 'a', 'b', 'c', 'bloc', 'd', 'e', 'f', 'g'];
      const inEditor = {}; names.forEach(n => { inEditor[n] = textSpot(document.querySelector('.tiptap'), n); });
      const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const items = truth.pages[0].textItems;
      const spot = str => { const item = items.find(i => i.str === str); return item ? { x: item.x, y: item.y } : null; };
      const tableBlock = pdf.content.find(b => b.table);
      const body = tableBlock ? tableBlock.table.body : [];
      const shape = body.map(row => row.map(cell => (cell.rowSpan || cell.colSpan ? `${cell.colSpan || 1}x${cell.rowSpan || 1}` : (cell.text !== undefined || cell.stack ? 'c' : '-'))).join(','));
      // Horizontalement : l'écart entre les débuts de texte de a, b, c est celui des colonnes de l'éditeur (en pt, à quelques points près : la largeur de contenu retire une marge de cellule).
      const gapsPdf = [spot('b').x - spot('a').x, spot('c').x - spot('b').x];
      const gapsEditor = [inEditor.b.x - inEditor.a.x, inEditor.c.x - inEditor.b.x].map(v => v * 0.75);
      // Verticalement : chaque texte, depuis celui de « Titre », à la hauteur de l'éditeur (1 px = 0,75 pt).
      const gapsY = names.map(n => (spot(n) ? Math.round(((spot(n).y - spot('Titre').y) - (inEditor[n].y - inEditor.Titre.y) * 0.75) * 100) / 100 : null));
      const pass = truth.pages.length === 1 && !!tableBlock && body.length === 4 && body.every(row => row.length === 3)
        && shape.join(' / ') === '3x1,-,- / c,c,c / 1x2,c,c / -,c,c'
        && names.every(n => !!spot(n)) && Math.abs(gapsPdf[0] - gapsEditor[0]) <= 6 && Math.abs(gapsPdf[1] - gapsEditor[1]) <= 6 && gapsPdf[1] > gapsPdf[0] * 1.2
        && gapsY.every(g => g !== null && Math.abs(g) <= 1.2);
      return { pass, notes: JSON.stringify({ pages: truth.pages.length, shape, gapsPdf, gapsEditor, gapsY }) };
    }),
  });

  cases.push({
    id: 'grid_reading_mode_shows_merged_cells_as_the_editor_does',
    description: 'Lecture d\'une grille aux cases fusionnées : même largeur de tableau, même hauteur de chaque ligne, cases fusionnées (titre sur 3 colonnes, bloc de 2 lignes) de la même taille que dans l\'éditeur',
    run: async (h) => inGrid(h, async () => {
      await loadGrid(MERGED_GRID);
      const sizes = root => {
        const table = root.querySelector('table');
        return { table: table.getBoundingClientRect().width, rows: Array.from(table.rows).map(tr => tr.getBoundingClientRect().height),
          title: table.querySelector('td[colspan="3"]').getBoundingClientRect().width, block: (() => { const r = table.querySelector('td[rowspan="2"]').getBoundingClientRect(); return [r.width, r.height]; })() };
      };
      const inEditor = sizes(document.querySelector('.tiptap'));
      let inReader = null;
      await h.clickButton('btn-mode-read');
      try { await sleep(600); inReader = sizes(document.getElementById('reader-container')); }
      finally { await h.clickButton('btn-mode-edit'); await sleep(300); }
      const pass = !!inReader && near(inReader.table, inEditor.table, 1) && allNear(inReader.rows, inEditor.rows, 1) && near(inReader.title, inEditor.title, 1) && allNear(inReader.block, inEditor.block, 1) && inEditor.title > 395;
      return { pass, notes: JSON.stringify({ inEditor, inReader }) };
    }),
  });

  cases.push({
    id: 'pdf_a_document_table_with_a_merged_first_row_keeps_its_unequal_columns',
    description: 'PDF d\'un tableau de document dont la 1re ligne est une case fusionnée sur 3 colonnes : les colonnes (120, 200 et 80 px) gardent leurs largeurs de l\'éditeur au lieu de parts égales (la largeur d\'une colonne se lit sur la première case d\'une seule colonne qui la couvre)',
    run: async (h) => {
      await h.resetEditor();
      GridEditor.setActive(false);
      Editor.setHTML(MERGED_GRID.replace(/ data-row-height="\d+" style="height: \d+px"/g, '').replace(/ data-valign="\w+"/g, '') + '<p>après</p>');
      await sleep(300);
      const inEditor = {}; ['a', 'b', 'c'].forEach(n => { inEditor[n] = textSpot(document.querySelector('.tiptap'), n); });
      // La feuille peut être réduite à la largeur du panneau (zoom CSS) : les mesures de l'éditeur sont ramenées à la taille de la page.
      const zoom = parseFloat(getComputedStyle(document.querySelector('.v2-page-sheet')).zoom) || 1;
      const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const items = truth.pages[0].textItems;
      const spot = str => { const item = items.find(i => i.str === str); return item ? item.x : null; };
      const gapsPdf = [spot('b') - spot('a'), spot('c') - spot('b')];
      const gapsEditor = [inEditor.b.x - inEditor.a.x, inEditor.c.x - inEditor.b.x].map(v => v * 0.75 / zoom);
      const widths = (pdf.content.find(b => b.table) || { table: {} }).table.widths;
      const pass = !!widths && Math.abs(gapsPdf[0] - gapsEditor[0]) <= 6 && Math.abs(gapsPdf[1] - gapsEditor[1]) <= 6 && gapsPdf[1] > gapsPdf[0] * 1.2;
      return { pass, notes: JSON.stringify({ gapsPdf, gapsEditor, widths }) };
    },
  });

  // === 10) Lot B2 : bordures des cases (menu « Bordures » de la barre), Lecture, PDF ================================================================================================
  // La règle (js/table-borders.js), les réglages du menu écrits sur les deux cases d'un trait, la fusion et la scission, les lignes et colonnes ajoutées, l'enregistrement et la Lecture, le PDF
  // lu sur ses traits tracés. L'Excel est dans la suite xlsx ; le menu à la vraie souris (dev-tests/verify-grid-borders-mouse.mjs).
  const RED = '#c0392b';
  const GREEN = '#1e8449';
  const BORDER_NAMES = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'];
  // Les quatre bords de la case (ligne, rang dans la ligne), dans l'ordre haut, droite, bas, gauche : « - » = le trait de départ.
  const sidesOf = (r, c) => BORDER_NAMES.map(n => tableNode().child(r).child(c).attrs[n] || '-').join(',');
  const apply = async (preset, color) => { const done = GridEditor.applyBorders(ed(), preset, color === undefined ? null : color); await sleep(650); return done; }; // 650 ms : un évènement d'historique de plus
  const cellOf = (r, c) => document.querySelectorAll('.tiptap table > tbody > tr')[r].cells[c];

  cases.push({
    id: 'grid_borders_rule_hidden_wins_then_the_first_color_and_a_merged_side_is_one_group',
    description: 'La règle des bords (js/table-borders.js) : deux cases qui se partagent un trait n\'ont qu\'une valeur - pas de trait devant tout, sinon la première couleur, sinon le trait de départ ; une case fusionnée n\'a qu\'une valeur par côté (ses voisines suivent) ; un trait à l\'intérieur d\'une case fusionnée n\'existe pas ; les réglages du menu visent les bons traits ; une valeur abîmée vaut le trait de départ',
    run: async () => {
      const cell = (row, col, extra) => Object.assign({ row, col, rowspan: 1, colspan: 1, top: null, right: null, bottom: null, left: null }, extra);
      const show = sides => sides.map(x => [x.top, x.right, x.bottom, x.left].map(v => v || '-').join(',')).join(' | ');
      const pair = (a, b) => show(TableBorders.resolve({ width: 2, height: 1, cells: [cell(0, 0, { right: a }), cell(0, 1, { left: b })] }));
      const block = (right, topLeft, bottomLeft) => ({ width: 2, height: 2, cells: [cell(0, 0, { rowspan: 2, right }), cell(0, 1, { left: topLeft }), cell(1, 1, { left: bottomLeft })] });
      const rect = { left: 0, top: 0, right: 3, bottom: 2 };
      const got = {
        colorOverDefault: pair(RED, null),
        hiddenOverColor: pair('none', RED),
        hiddenAfterColor: pair(RED, 'none'),
        firstColor: pair(RED, GREEN),
        mergedSideIsOneGroup: show(TableBorders.resolve(block(null, RED, null))),
        forcedOverHidden: show(TableBorders.set(block('none', 'none', 'none'), [{ kind: 'v', row: 1, col: 1 }], GREEN)),
        usableInner: TableBorders.usableEdges(block(null, null, null), TableBorders.presetEdges('inner', { left: 0, top: 0, right: 2, bottom: 2 })).length,
        usableInnerInsideOneMergedCell: TableBorders.usableEdges(block(null, null, null), TableBorders.presetEdges('inner', { left: 0, top: 0, right: 1, bottom: 2 })).length,
        presetCounts: ['all', 'outer', 'inner', 'top', 'bottom', 'left', 'right', 'none'].map(p => TableBorders.presetEdges(p, rect).length).join(','),
        normalized: [TableBorders.normalizeValue('NONE'), TableBorders.normalizeValue('#C0392B'), TableBorders.normalizeValue('red'), TableBorders.normalizeValue('#fff'), TableBorders.normalizeValue(undefined)].map(v => v || '-').join(','),
        values: [TableBorders.valueFor('none', RED), TableBorders.valueFor('all', RED), TableBorders.valueFor('outer', null)].map(v => v || '-').join(','),
      };
      const want = {
        colorOverDefault: `-,${RED},-,- | -,-,-,${RED}`,
        hiddenOverColor: '-,none,-,- | -,-,-,none',
        hiddenAfterColor: '-,none,-,- | -,-,-,none',
        firstColor: `-,${RED},-,- | -,-,-,${RED}`,
        mergedSideIsOneGroup: `-,${RED},-,- | -,-,-,${RED} | -,-,-,${RED}`,
        forcedOverHidden: `-,${GREEN},-,- | -,-,-,${GREEN} | -,-,-,${GREEN}`,
        usableInner: 3, usableInnerInsideOneMergedCell: 0,
        presetCounts: '17,10,7,3,3,2,2,17',
        normalized: `none,${RED},-,-,-`,
        values: `none,${RED},-`,
      };
      const bad = Object.keys(want).filter(k => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
      return { pass: !bad.length, notes: bad.length ? bad.map(k => `${k}: ${JSON.stringify(got[k])} (attendu ${JSON.stringify(want[k])})`).join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'grid_borders_each_setting_writes_both_cells_of_a_shared_edge_and_is_one_undo',
    description: 'Menu « Bordures » : chaque réglage (toutes, extérieures, intérieures, un côté, aucune) pose la couleur du stylo sur les traits qu\'il vise ET sur la case voisine de chaque trait (sinon le trait partagé se contredit), en une seule transaction - un seul Annuler ; « Aucune » cache aussi les traits partagés avec les cases d\'à côté ; la couleur par défaut rend le trait de départ ; « Intérieures » n\'a rien à tracer pour une seule case',
    run: async (h) => inGrid(h, async () => {
      const read = () => ({ corner: sidesOf(1, 1), centre: sidesOf(2, 2), lowerRight: sidesOf(3, 3), above: sidesOf(0, 1), leftOf: sidesOf(1, 0), below: sidesOf(4, 3), rightOf: sidesOf(3, 4), far: sidesOf(0, 0) });
      await selectCells(1, 1, 3, 3);
      const single = await (async () => { await selectCells(2, 2, 2, 2); const r = { can: GridEditor.canApplyBorders(ed(), 'inner'), done: GridEditor.applyBorders(ed(), 'inner', RED) }; await selectCells(1, 1, 3, 3); return r; })();
      const got = { start: read() };
      await apply('outer', RED); got.outer = read();
      await apply('inner', GREEN); got.inner = read();
      await apply('top', null); got.top = read();
      await apply('none'); got.none = read();
      ed().commands.undo(); await sleep(80); got.undoNone = read();
      await apply('all'); got.all = read();
      const dash = '-,-,-,-';
      const want = {
        start: { corner: dash, centre: dash, lowerRight: dash, above: dash, leftOf: dash, below: dash, rightOf: dash, far: dash },
        outer: { corner: `${RED},-,-,${RED}`, centre: dash, lowerRight: `-,${RED},${RED},-`, above: `-,-,${RED},-`, leftOf: `-,${RED},-,-`, below: `${RED},-,-,-`, rightOf: `-,-,-,${RED}`, far: dash },
        inner: { corner: `${RED},${GREEN},${GREEN},${RED}`, centre: `${GREEN},${GREEN},${GREEN},${GREEN}`, lowerRight: `${GREEN},${RED},${RED},${GREEN}`, above: `-,-,${RED},-`, leftOf: `-,${RED},-,-`, below: `${RED},-,-,-`, rightOf: `-,-,-,${RED}`, far: dash },
        top: { corner: `-,${GREEN},${GREEN},${RED}`, centre: `${GREEN},${GREEN},${GREEN},${GREEN}`, lowerRight: `${GREEN},${RED},${RED},${GREEN}`, above: dash, leftOf: `-,${RED},-,-`, below: `${RED},-,-,-`, rightOf: `-,-,-,${RED}`, far: dash },
        none: { corner: 'none,none,none,none', centre: 'none,none,none,none', lowerRight: 'none,none,none,none', above: '-,-,none,-', leftOf: '-,none,-,-', below: 'none,-,-,-', rightOf: '-,-,-,none', far: dash },
        all: { corner: dash, centre: dash, lowerRight: dash, above: dash, leftOf: dash, below: dash, rightOf: dash, far: dash },
      };
      want.undoNone = want.top;
      const bad = Object.keys(want).filter(k => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
      const pass = !bad.length && single.can === false && single.done === false;
      return { pass, notes: JSON.stringify({ bad: bad.map(k => ({ step: k, got: got[k], want: want[k] })), single }) };
    }),
  });

  cases.push({
    id: 'grid_borders_a_merged_cell_has_one_value_per_side_and_no_line_inside',
    description: 'Une case fusionnée n\'a pas de trait à l\'intérieur (« Intérieures » est grisé pour elle seule) et une valeur par côté : tracer le trait entre elle et ses voisines les met toutes d\'accord, et choisir ce trait pour une seule de ses voisines le change pour toutes les autres de ce côté',
    run: async (h) => inGrid(h, async () => {
      await selectCells(0, 0, 1, 1);
      GridEditor.mergeCells(ed()); await sleep(650);
      await selectCells(0, 0, 0, 0); // la case fusionnée seule
      const alone = { can: GridEditor.canApplyBorders(ed(), 'inner'), done: GridEditor.applyBorders(ed(), 'inner', RED), changed: sidesOf(0, 0) };
      await selectCells(0, 0, 1, 1); // sa case, puis jusqu'à la 2e case de la ligne 1 : les colonnes 0 à 3, lignes 0 et 1
      const withNeighbours = { can: GridEditor.canApplyBorders(ed(), 'inner') };
      await apply('inner', RED);
      const lines = { merged: sidesOf(0, 0), upperRight: sidesOf(0, 1), lowerRight: sidesOf(1, 0), farRight: sidesOf(0, 2) };
      await placeCursor(1, 0); // la voisine du bas : « Gauche » en vert
      await apply('left', GREEN);
      const spill = { merged: sidesOf(0, 0), upperRight: sidesOf(0, 1), lowerRight: sidesOf(1, 0) };
      const want = {
        alone: { can: false, done: false, changed: '-,-,-,-' },
        withNeighbours: { can: true },
        lines: { merged: `-,${RED},-,-`, upperRight: `-,${RED},${RED},${RED}`, lowerRight: `${RED},${RED},-,${RED}`, farRight: `-,-,${RED},${RED}` },
        spill: { merged: `-,${GREEN},-,-`, upperRight: `-,${RED},${RED},${GREEN}`, lowerRight: `${RED},${RED},-,${GREEN}` },
      };
      const got = { alone, withNeighbours, lines, spill };
      const bad = Object.keys(want).filter(k => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
      return { pass: !bad.length, notes: JSON.stringify({ bad: bad.map(k => ({ step: k, got: got[k], want: want[k] })) }) };
    }),
  });

  cases.push({
    id: 'grid_borders_merging_keeps_the_outline_of_the_cells_and_splitting_gives_it_back',
    description: 'Fusionner deux cases dont le trait du milieu est caché garde le trait de droite de la case de droite (le pourtour des cases fusionnées), pas celui du milieu qui disparaît ; scinder rend les bords du pourtour aux cases du pourtour et laisse le trait de départ entre les nouvelles cases',
    run: async (h) => inGrid(h, async () => {
      await selectCells(1, 1, 1, 2);
      await apply('none');
      await placeCursor(1, 2);
      await apply('right', RED);
      const before = { left: sidesOf(1, 1), right: sidesOf(1, 2), next: sidesOf(1, 3) };
      await selectCells(1, 1, 1, 2);
      GridEditor.mergeCells(ed()); await sleep(650);
      const merged = { cell: sidesOf(1, 1), next: sidesOf(1, 2), above: sidesOf(0, 1) };
      await selectCells(1, 1, 1, 1);
      GridEditor.splitCell(ed()); await sleep(300);
      const split = { left: sidesOf(1, 1), right: sidesOf(1, 2), next: sidesOf(1, 3) };
      const want = {
        before: { left: 'none,none,none,none', right: `none,${RED},none,none`, next: `-,-,-,${RED}` },
        merged: { cell: `none,${RED},none,none`, next: `-,-,-,${RED}`, above: '-,-,none,-' },
        split: { left: 'none,-,none,none', right: `none,${RED},none,-`, next: `-,-,-,${RED}` },
      };
      const got = { before, merged, split };
      const bad = Object.keys(want).filter(k => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
      return { pass: !bad.length, notes: JSON.stringify({ bad: bad.map(k => ({ step: k, got: got[k], want: want[k] })) }) };
    }),
  });

  cases.push({
    id: 'grid_borders_a_row_or_column_added_at_an_end_keeps_the_frame_outside_and_the_inner_lines_inside',
    description: 'Une grille sans cadre (bords extérieurs cachés, traits intérieurs de départ) : une colonne ou une ligne ajoutée au bout ou au début garde le cadre caché à l\'extérieur et un trait intérieur visible entre l\'ancienne case et la nouvelle (le trait qui était extérieur devient intérieur) ; au milieu, la nouvelle ligne ou colonne prolonge le trait coloré qu\'elle coupe',
    run: async (h) => inGrid(h, async () => {
      await selectCells(0, 0, 14, 5);
      await apply('none');
      await apply('inner', null);
      const got = { frame: [sidesOf(0, 0), sidesOf(3, 5), sidesOf(14, 5), sidesOf(3, 3)].join(' ') };
      await placeCursor(3, 5);
      ed().chain().focus().addColumnAfter().run(); await sleep(250);
      got.columnAtEnd = [sidesOf(3, 5), sidesOf(3, 6), sidesOf(0, 6), sidesOf(14, 6)].join(' ');
      await placeCursor(14, 0);
      ed().chain().focus().addRowAfter().run(); await sleep(250);
      got.rowAtEnd = [sidesOf(14, 0), sidesOf(15, 0), sidesOf(15, 3), sidesOf(15, 6)].join(' ');
      await placeCursor(3, 0);
      ed().chain().focus().addColumnBefore().run(); await sleep(250);
      got.columnAtStart = [sidesOf(3, 0), sidesOf(3, 1), sidesOf(0, 0)].join(' ');
      await placeCursor(0, 3);
      ed().chain().focus().addRowBefore().run(); await sleep(250);
      got.rowAtStart = [sidesOf(0, 3), sidesOf(1, 3), sidesOf(0, 0)].join(' ');
      const rows = tableNode().childCount; const cols = tableNode().child(0).childCount;
      // au milieu : les traits intérieurs en rouge, une colonne coupée en deux les prolonge
      await selectCells(0, 0, rows - 1, cols - 1);
      await apply('inner', RED);
      await placeCursor(3, 2);
      ed().chain().focus().addColumnAfter().run(); await sleep(250);
      got.middle = [sidesOf(3, 2), sidesOf(3, 3), sidesOf(3, 4)].join(' ');
      const dash = '-,-,-,-';
      const want = {
        frame: `none,-,-,none -,none,-,- -,none,none,- ${dash}`,
        columnAtEnd: `${dash} -,none,-,- none,none,-,- -,none,none,-`,
        rowAtEnd: `-,-,-,none -,-,none,none -,-,none,- -,none,none,-`,
        columnAtStart: `-,-,-,none ${dash} none,-,-,none`,
        rowAtStart: `none,-,-,- ${dash} none,-,-,none`,
        middle: `${RED},${RED},${RED},${RED} ${RED},${RED},${RED},${RED} ${RED},${RED},${RED},${RED}`,
      };
      const bad = Object.keys(want).filter(k => got[k] !== want[k]);
      return { pass: !bad.length, notes: JSON.stringify({ bad: bad.map(k => ({ step: k, got: got[k], want: want[k] })) }) };
    }),
  });

  cases.push({
    id: 'grid_borders_are_saved_with_the_model_and_shown_by_the_editor_and_reading_mode',
    description: 'Les bords sont enregistrés avec le modèle (un attribut par côté, relu à l\'ouverture) et l\'éditeur comme la Lecture montrent la même chose : le trait de la couleur choisie sur les deux cases d\'un trait partagé, « pas de trait » en bordure cachée',
    run: async (h) => inGrid(h, async () => {
      await useReadRecord(); // la Lecture a besoin d'un enregistrement : ce cas ne compte pas sur ceux d'avant
      await selectCells(0, 0, 2, 2);
      await apply('outer', RED);
      await selectCells(1, 1, 1, 1);
      await apply('none');
      const grid = () => [0, 1, 2].map(r => [0, 1, 2].map(c => sidesOf(r, c)).join(' ')).join(' / ');
      const before = grid();
      const html = Editor.getHTML();
      await loadGrid(html);
      const after = grid();
      const look = (root) => {
        const rows = root.querySelectorAll('table > tbody > tr');
        const cs = (r, c, side) => { const style = getComputedStyle(rows[r].cells[c]); return style['border' + side + 'Style'] + ' ' + style['border' + side + 'Color']; };
        return { topLeft: [cs(0, 0, 'Top'), cs(0, 0, 'Left')], middle: [cs(1, 1, 'Top'), cs(1, 1, 'Left'), cs(1, 1, 'Right'), cs(1, 1, 'Bottom')], aboveMiddle: cs(0, 1, 'Bottom'), plain: cs(5, 5, 'Top') };
      };
      const inEditor = look(document.querySelector('.tiptap'));
      let inReader = null;
      await h.clickButton('btn-mode-read');
      try {
        // La première Lecture d'une page peut tarder (chargements à la demande) : on attend le tableau lu plutôt qu'un délai fixe.
        for (let waited = 0; waited < 8000 && document.querySelectorAll('#reader-container table > tbody > tr').length < 6; waited += 100) await sleep(100);
        await sleep(200);
        inReader = look(document.getElementById('reader-container'));
      }
      finally { await h.clickButton('btn-mode-edit'); await sleep(300); }
      const red = 'solid rgb(192, 57, 43)';
      const hidden = c => c.startsWith('hidden');
      const sameLook = a => !!a && a.topLeft[0] === red && a.topLeft[1] === red && a.middle.every(hidden) && hidden(a.aboveMiddle) && /^solid/.test(a.plain);
      const attrs = ['data-border-top="' + RED + '"', 'data-border-left="none"'].every(t => html.includes(t));
      const pass = before === after && before.includes('none') && before.includes(RED) && attrs && sameLook(inEditor) && sameLook(inReader);
      return { pass, notes: JSON.stringify({ before, after, attrs, inEditor, inReader }) };
    }),
  });

  // Les traits peints d'un PDF de la grille courante : les longueurs par couleur et par sens, et leur place.
  async function pdfStrokes(h) {
    const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
    const lines = (await h.extractPdfLines(pdf.base64)).pages[0].lines.filter(l => l.width < 1);
    const horizontal = l => Math.abs(l.y1 - l.y2) < 0.01;
    const sorted = list => Array.from(new Set(list.map(v => Math.round(v * 10) / 10))).sort((a, b) => a - b);
    return {
      lines, horizontal,
      byColor: color => lines.filter(l => l.color === color),
      xs: sorted(lines.filter(l => !horizontal(l)).map(l => l.x1)),
      ys: sorted(lines.filter(horizontal).map(l => l.y1)),
    };
  }
  // La longueur peinte, chaque trait compté une fois : pdfmake prolonge de la moitié de l'épaisseur chaque segment d'un côté fait de plusieurs cases, ces bouts se recouvrent.
  const lengthOf = (list) => {
    const groups = new Map();
    list.forEach((l) => {
      const horizontal = Math.abs(l.y1 - l.y2) < 0.01;
      const key = (horizontal ? 'h' : 'v') + Math.round((horizontal ? l.y1 : l.x1) * 2);
      const span = horizontal ? [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)] : [Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)];
      groups.set(key, (groups.get(key) || []).concat([span]));
    });
    let total = 0;
    groups.forEach((spans) => {
      let [from, to] = [null, null];
      spans.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => {
        if (to === null || a > to + 0.01) { if (to !== null) total += to - from; from = a; to = b; } else to = Math.max(to, b);
      });
      if (to !== null) total += to - from;
    });
    return Math.round(total);
  };

  cases.push({
    id: 'grid_pdf_borders_draw_only_the_chosen_lines_in_their_color',
    description: 'PDF d\'une grille, lu sur les traits peints : sans réglage, tous les traits sont le filet gris de départ ; un cadre rouge sur une grille sans autre trait ne peint que les quatre côtés du cadre, en rouge ; des traits verticaux seuls (les cinq traits entre les six cases d\'une ligne) ne peignent aucun trait horizontal',
    run: async (h) => inGrid(h, async () => {
      const plain = await pdfStrokes(h);
      await selectCells(0, 0, 14, 5);
      await apply('none');
      await apply('outer', RED);
      const frame = await pdfStrokes(h);
      await apply('none');
      await selectCells(0, 0, 0, 5); // la première ligne seule : ses traits intérieurs sont des traits verticaux
      await apply('inner', null);
      const verticals = await pdfStrokes(h);
      // le cadre : les quatre côtés, rien à l'intérieur
      const x0 = frame.xs[0]; const x1 = frame.xs[frame.xs.length - 1]; const y0 = frame.ys[0]; const y1 = frame.ys[frame.ys.length - 1];
      const on = (l) => (frame.horizontal(l) ? (Math.abs(l.y1 - y0) < 0.6 || Math.abs(l.y1 - y1) < 0.6) : (Math.abs(l.x1 - x0) < 0.6 || Math.abs(l.x1 - x1) < 0.6));
      const reds = frame.byColor(RED);
      const sides = {
        top: lengthOf(reds.filter(l => frame.horizontal(l) && Math.abs(l.y1 - y0) < 0.6)), bottom: lengthOf(reds.filter(l => frame.horizontal(l) && Math.abs(l.y1 - y1) < 0.6)),
        left: lengthOf(reds.filter(l => !frame.horizontal(l) && Math.abs(l.x1 - x0) < 0.6)), right: lengthOf(reds.filter(l => !frame.horizontal(l) && Math.abs(l.x1 - x1) < 0.6)),
      };
      const width = x1 - x0; const height = y1 - y0;
      const framed = frame.lines.length > 0 && frame.lines.every(l => l.color === RED && on(l)) && frame.xs.length === 2 && frame.ys.length === 2
        && Math.abs(sides.top - width) <= 2 && Math.abs(sides.bottom - width) <= 2 && Math.abs(sides.left - height) <= 2 && Math.abs(sides.right - height) <= 2;
      const onlyVertical = verticals.lines.length > 0 && verticals.lines.every(l => l.color === '#777777' && !verticals.horizontal(l)) && verticals.xs.length === 5;
      const pass = plain.lines.length > 0 && plain.lines.every(l => l.color === '#777777') && framed && onlyVertical;
      return { pass, notes: JSON.stringify({ plain: plain.lines.length, frame: { lines: frame.lines.length, xs: frame.xs, ys: frame.ys, sides }, verticals: { lines: verticals.lines.length, xs: verticals.xs, ys: verticals.ys.length, colors: Array.from(new Set(verticals.lines.map(l => l.color))) } }) };
    }),
  });

  cases.push({
    id: 'grid_pdf_borders_of_a_merged_cell_are_its_outline_only',
    description: 'PDF d\'une grille dont une case fusionnée sur deux colonnes et deux lignes a un cadre rouge : les quatre côtés de la case fusionnée sont rouges, sans trait rouge à l\'intérieur, et le reste de la grille garde son filet gris',
    run: async (h) => inGrid(h, async () => {
      await selectCells(0, 0, 1, 1);
      GridEditor.mergeCells(ed()); await sleep(650);
      await selectCells(0, 0, 0, 0);
      await apply('outer', RED);
      const view = await pdfStrokes(h);
      const reds = view.byColor(RED);
      const grey = view.byColor('#777777');
      const x0 = view.xs[0]; const x1 = view.xs[1]; const x2 = view.xs[2]; const y0 = view.ys[0]; const y1 = view.ys[1]; const y2 = view.ys[2];
      const near = (a, b) => Math.abs(a - b) < 0.8;
      const at = (list, horizontal, value) => list.filter(l => view.horizontal(l) === horizontal && near(horizontal ? l.y1 : l.x1, value));
      // la case fusionnée couvre les deux premières colonnes (x0 à x2) et les deux premières lignes (y0 à y2)
      const got = {
        top: lengthOf(at(reds, true, y0)), bottom: lengthOf(at(reds, true, y2)), left: lengthOf(at(reds, false, x0)), right: lengthOf(at(reds, false, x2)),
        inside: lengthOf(at(reds, true, y1)) + lengthOf(at(reds, false, x1)),
        redTotal: lengthOf(reds), greyAround: grey.length,
      };
      const w = x2 - x0; const hgt = y2 - y0;
      const pass = reds.length > 0 && Math.abs(got.top - w) <= 2 && Math.abs(got.bottom - w) <= 2 && Math.abs(got.left - hgt) <= 2 && Math.abs(got.right - hgt) <= 2
        && got.inside === 0 && Math.abs(got.redTotal - (2 * w + 2 * hgt)) <= 6 && got.greyAround > 20;
      return { pass, notes: JSON.stringify({ got, w, hgt, xs: view.xs.slice(0, 4), ys: view.ys.slice(0, 4) }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.grid = cases;
})();
