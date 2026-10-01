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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.grid = cases;
})();
