// Suite "calloutSignature" - l'encadré (Note, Attention, Important, couleur et icône au choix) et le bloc de signature (ligne, nom, date), deuxième lot du menu « Lien et blocs
// de contenu » (demande d'Antoine, 2026-10-01, réponse « Les deux » à la carte des suites possibles). Deux moitiés, comme linksBlocks :
//  1) l'ÉDITEUR : les deux lignes du menu (js/main-toolbar.js, index.html), la fenêtre « Insérer / Modifier l'encadré » et son aperçu (js/callout.js, css/callout.css), l'insertion
//     autour d'un ou de plusieurs blocs, d'une liste, dans une colonne ou une cellule, la modification, le retrait, l'annulation, le bloc de signature, le suivi des modifications ;
//  2) les RENDUS : Lecture, PDF, Word, e-mail - lus sur la sortie réelle (pixels et texte peints du PDF décodé par pdf.js, OOXML du .docx dézippé, texte du mailto).
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-callout-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const modal = () => document.getElementById('pp-callout-modal');
  const modalOpen = () => { const m = modal(); return !!m && m.style.display !== 'none'; };
  const okButton = () => document.querySelector('#pp-callout-modal .var-modal-primary');
  const removeButton = () => document.querySelector('#pp-callout-modal .var-modal-danger');
  const cancelButton = () => document.querySelector('#pp-callout-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const choose = (kind, value) => document.querySelector('#pp-callout-modal .pp-callout-' + kind + '[data-value="' + value + '"]').click();
  const checked = kind => { const b = document.querySelector('#pp-callout-modal .pp-callout-' + kind + '[aria-checked="true"]'); return b ? b.dataset.value : null; };
  const calloutRow = () => document.getElementById('v2-btn-callout');
  const signatureRow = () => document.getElementById('v2-btn-signature');
  // TipTap (StarterKit) garde toujours un paragraphe vide à la fin du document quand le dernier bloc n'en est pas un : on le retire pour lire le document tel qu'on l'a écrit.
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const near = (a, b, tolerance) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

  // Sélection réelle du navigateur sur `text` (première occurrence), que ProseMirror rejoint ensuite ; `collapseAt` : curseur à ce décalage dans le texte au lieu d'une sélection.
  async function selectText(text, collapseAt) {
    const walker = document.createTreeWalker(tiptap(), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(text);
      if (i === -1) continue;
      tiptap().focus();
      const range = document.createRange();
      range.setStart(node, i + (collapseAt || 0));
      if (collapseAt !== undefined) range.collapse(true); else range.setEnd(node, i + text.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      await sleep(120);
      return;
    }
    throw new Error('texte introuvable dans l\'éditeur : ' + text);
  }
  // Sélection ProseMirror couvrant les blocs de premier niveau d'indices `from` à `to` (inclus).
  async function selectBlocks(from, to) {
    const ed = EditorCore.getEditor();
    const doc = ed.state.doc;
    let start = 0;
    for (let i = 0; i < from; i++) start += doc.child(i).nodeSize;
    let end = start;
    for (let i = from; i <= to; i++) end += doc.child(i).nodeSize;
    ed.commands.setTextSelection({ from: start + 1, to: end - 1 });
    await sleep(100);
  }
  async function openWindow() {
    calloutRow().click();
    await sleep(200);
  }
  async function closeWindowIfOpen() {
    if (modalOpen()) cancelButton().click();
    await sleep(60);
  }
  // Un document de départ : `html` dans l'éditeur, curseur dans le texte `at` (ou sélection de ce texte).
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  async function wrapWith(preset, attrs) {
    await openWindow();
    if (preset) choose('type', preset);
    if (attrs && attrs.color) choose('swatch', attrs.color);
    if (attrs && attrs.icon) choose('icon-option', attrs.icon);
    okButton().click();
    await sleep(200);
  }

  // Les pixels d'une page de PDF rendue par pdf.js (pt depuis le haut-gauche) : ce que le lecteur de PDF peint vraiment (fond, barre), que ni le texte ni la définition pdfmake ne disent.
  async function renderPdfPage(base64, pageNumber) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(pageNumber || 1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { width: viewport.width / scale, pixel: (xPt, yPt) => Array.from(ctx.getImageData(Math.round(xPt * scale), Math.round(yPt * scale), 1, 1).data.slice(0, 3)) };
  }
  const WHITE = [255, 255, 255];
  const itemOf = (truth, str, pageIndex) => truth.pages[pageIndex || 0].textItems.find(i => i.str === str);
  const tableCells = xml => Array.from(xml.getElementsByTagName('w:tc'));

  // === 1) Le menu de la barre ===============================================================================================================================

  cases.push({
    id: 'co_menu_has_five_rows_with_callout_and_signature_after_the_code_block',
    description: 'Le volet de l\'icône unique porte cinq lignes (lien, citation, bloc de code, encadré, bloc de signature), chacune avec son icône ; aucune n\'est dans la barre elle-même ; l\'encadré ouvre une fenêtre (points de suspension), la signature agit tout de suite',
    run: async (h) => {
      await h.resetEditor();
      const flyout = document.getElementById('v2-blocks-flyout');
      const rows = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.id);
      const labels = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.textContent.replace(/(Ctrl\+K|⌘K)$/, '').trim());
      const iconOk = ['v2-btn-callout', 'v2-btn-signature'].every(id => document.getElementById(id).querySelector('svg'));
      const toolbarLevel = ['v2-btn-callout', 'v2-btn-signature'].filter(id => document.getElementById(id).parentElement === document.getElementById('v2-toolbar'));
      const aria = [calloutRow().getAttribute('aria-label'), signatureRow().getAttribute('aria-label')];
      const flyoutLabel = flyout.querySelector('.v2-hover-flyout-label').textContent;
      return {
        pass: JSON.stringify(rows) === JSON.stringify(['v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature']) && iconOk && toolbarLevel.length === 0
          && labels[3] === 'Encadré…' && labels[4] === 'Bloc de signature' && aria[0] === 'Insérer un encadré' && aria[1] === 'Insérer un bloc de signature' && flyoutLabel === 'Lien et blocs de contenu',
        notes: JSON.stringify({ rows, labels, iconOk, toolbarLevel, aria, flyoutLabel }),
      };
    },
  });

  cases.push({
    id: 'co_menu_and_window_texts_follow_the_interface_language',
    description: 'Les deux lignes, la fenêtre (titre, libellés, types, couleurs, icônes, aperçu, boutons) et les légendes de la signature passent en anglais avec l\'interface, puis reviennent en français',
    run: async (h) => {
      await setDoc(h, '<p>Hello world</p>');
      await selectText('world');
      I18n.setLang('en');
      await sleep(100);
      let en;
      try {
        const labels = [calloutRow().textContent.trim(), signatureRow().textContent.trim()];
        await openWindow();
        const text = sel => (document.querySelector(sel) || {}).textContent;
        const names = kind => Array.from(document.querySelectorAll('#pp-callout-modal .pp-callout-' + kind)).map(b => b.getAttribute('aria-label') || b.textContent.trim());
        en = {
          labels, title: text('#pp-callout-title'), field: ['#pp-callout-type-label', '#pp-callout-color-label', '#pp-callout-icon-label'].map(text),
          types: names('type'), colors: names('swatch'), icons: names('icon-option'), sample: text('.pp-callout-paper .callout p'),
          buttons: Array.from(document.querySelectorAll('#pp-callout-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
        };
        await closeWindowIfOpen();
        signatureRow().click();
        await sleep(200);
        en.signature = Array.from(tiptap().querySelectorAll('.two-columns-column > p:last-child')).map(p => p.textContent);
      } finally {
        await closeWindowIfOpen();
        I18n.setLang('fr');
        await sleep(100);
      }
      return {
        pass: JSON.stringify(en.labels) === JSON.stringify(['Callout…', 'Signature block']) && en.title === 'Insert a callout' && JSON.stringify(en.field) === JSON.stringify(['Type', 'Color', 'Icon'])
          && JSON.stringify(en.types) === JSON.stringify(['Note', 'Warning', 'Important']) && JSON.stringify(en.colors) === JSON.stringify(['Blue', 'Green', 'Orange', 'Red', 'Purple', 'Gray'])
          && en.icons.length === 6 && en.icons.includes('Light bulb') && en.sample === 'Your text will appear here.' && JSON.stringify(en.buttons) === JSON.stringify(['Cancel', 'Insert'])
          && JSON.stringify(en.signature) === JSON.stringify(['Name and signature', 'Date']),
        notes: JSON.stringify(en),
      };
    },
  });

  cases.push({
    id: 'co_rows_are_greyed_in_email_and_header_modes_and_with_the_macro_group_never_removed',
    description: 'Mode e-mail et en-tête/pied : les deux lignes se grisent (jamais retirées), comme le groupe entier pour un macro-modèle ; elles redeviennent actives en quittant le mode',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      await selectText('Texte', 1);
      MainToolbar.syncToolbarState();
      const free = !isLocked('v2-btn-callout') && !isLocked('v2-btn-signature');
      MainToolbar.setEmailMode(true);
      MainToolbar.syncToolbarState();
      const inEmail = isLocked('v2-btn-callout') && isLocked('v2-btn-signature');
      MainToolbar.setEmailMode(false);
      MainToolbar.syncToolbarState();
      const afterEmail = !isLocked('v2-btn-callout') && !isLocked('v2-btn-signature');
      const realGetHfMode = HeaderFooterPreview.getHfMode;
      HeaderFooterPreview.getHfMode = () => 'header';
      let inHf;
      try { MainToolbar.syncToolbarState(); inHf = isLocked('v2-btn-callout') && isLocked('v2-btn-signature'); }
      finally { HeaderFooterPreview.getHfMode = realGetHfMode; }
      MainToolbar.syncToolbarState();
      const afterHf = !isLocked('v2-btn-callout') && !isLocked('v2-btn-signature');
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const inMacro = isLocked('v2-blocks-group');
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      return {
        pass: free && inEmail && afterEmail && inHf && afterHf && inMacro && !!calloutRow() && !!signatureRow(),
        notes: JSON.stringify({ free, inEmail, afterEmail, inHf, afterHf, inMacro }),
      };
    },
  });

  cases.push({
    id: 'co_row_says_edit_and_is_active_inside_a_callout_and_goes_back_outside',
    description: 'Le curseur dans un encadré : la ligne devient « Modifier l\'encadré… » et s\'allume ; hors de l\'encadré elle redevient « Encadré… » ; le libellé suit aussi la langue',
    run: async (h) => {
      await setDoc(h, '<p>Dehors</p><div class="callout" data-color="green" data-icon="check"><p>Dedans</p></div>');
      await selectText('Dehors', 1);
      const outside = { label: calloutRow().textContent.trim(), active: calloutRow().classList.contains('is-active') };
      await selectText('Dedans', 1);
      const inside = { label: calloutRow().textContent.trim(), active: calloutRow().classList.contains('is-active') };
      I18n.setLang('en');
      await sleep(100);
      const insideEn = calloutRow().textContent.trim();
      I18n.setLang('fr');
      await sleep(100);
      const insideFr = calloutRow().textContent.trim();
      await selectText('Dehors', 1);
      const outsideAgain = calloutRow().textContent.trim();
      return {
        pass: outside.label === 'Encadré…' && !outside.active && inside.label === 'Modifier l’encadré…' && inside.active && insideEn === 'Edit callout…' && insideFr === 'Modifier l’encadré…' && outsideAgain === 'Encadré…',
        notes: JSON.stringify({ outside, inside, insideEn, insideFr, outsideAgain }),
      };
    },
  });

  // === 2) Insérer, modifier, retirer ========================================================================================================================

  cases.push({
    id: 'co_insert_wraps_the_cursor_block_in_a_blue_note_with_the_info_icon_and_keeps_the_text',
    description: 'Sans sélection, « Encadré… » ouvre la fenêtre sur Note (bleu, information) ; « Insérer » met le paragraphe du curseur dans un encadré, texte et curseur gardés, fenêtre fermée, clavier rendu à l\'éditeur ; une annulation défait tout',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p>Le texte de la note</p><p>Après</p>');
      await selectText('texte de la note', 3);
      await openWindow();
      const opened = { open: modalOpen(), title: document.getElementById('pp-callout-title').textContent, type: checked('type'), color: checked('swatch'), icon: checked('icon-option'), ok: okButton().textContent, removeHidden: removeButton().hidden, preview: { color: document.querySelector('.pp-callout-paper .callout').dataset.color, icon: document.querySelector('.pp-callout-paper .callout').dataset.icon } };
      okButton().click();
      await sleep(250);
      const out = parse(Editor.getHTML());
      const callout = out.querySelector('.callout');
      const caret = EditorCore.getEditor().state.selection.$from;
      const focusInEditor = !!document.activeElement && !!document.activeElement.closest('.tiptap');
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = Editor.getHTML();
      return {
        pass: opened.open && opened.title === 'Insérer un encadré' && opened.type === 'note' && opened.color === 'blue' && opened.icon === 'info' && opened.ok === 'Insérer' && opened.removeHidden
          && opened.preview.color === 'blue' && opened.preview.icon === 'info' && !modalOpen()
          && !!callout && callout.dataset.color === 'blue' && callout.dataset.icon === 'info' && callout.getAttribute('role') === 'note' && callout.children.length === 1 && callout.textContent === 'Le texte de la note'
          && out.body === undefined && Array.from(out.children).map(c => c.tagName).join() === 'P,DIV,P' && caret.parent.textContent === 'Le texte de la note' && caret.parentOffset === 6 && focusInEditor
          && undone === '<p>Avant</p><p>Le texte de la note</p><p>Après</p>',
        notes: JSON.stringify({ opened, html: Editor.getHTML(), caret: caret.parentOffset, focusInEditor, undone }),
      };
    },
  });

  cases.push({
    id: 'co_insert_wraps_all_selected_blocks_and_one_undo_removes_the_callout',
    description: 'Plusieurs blocs sélectionnés entrent ensemble dans un seul encadré (type Important : rouge, point d\'exclamation) ; les blocs voisins restent dehors ; un seul Annuler rend le document d\'origine',
    run: async (h) => {
      await setDoc(h, '<p>Un</p><p>Deux</p><h2>Trois</h2><p>Quatre</p>');
      await selectBlocks(1, 2);
      await wrapWith('important');
      const html = Editor.getHTML();
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = Editor.getHTML();
      return {
        pass: html === '<p>Un</p><div data-color="red" data-icon="alert" class="callout" role="note"><p>Deux</p><h2>Trois</h2></div><p>Quatre</p>' && undone === '<p>Un</p><p>Deux</p><h2>Trois</h2><p>Quatre</p>',
        notes: JSON.stringify({ html, undone }),
      };
    },
  });

  cases.push({
    id: 'co_insert_inside_a_list_wraps_the_whole_list_and_inside_column_and_cell_wraps_there',
    description: 'Le curseur dans un élément de liste : la liste entière entre dans l\'encadré (un encadré ne peut pas prendre la place d\'un paragraphe d\'élément) ; dans une colonne ou une cellule de tableau, l\'encadré s\'y insère',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><ul><li><p>Un</p></li><li><p>Deux</p></li></ul><p>Après</p>');
      await selectText('Deux', 1);
      await wrapWith('attention');
      const list = Editor.getHTML();
      await setDoc(h, '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div><p>Fin</p>');
      await selectText('Gauche', 2);
      await wrapWith('note');
      const column = parse(Editor.getHTML());
      await setDoc(h, '<table><tbody><tr><td><p>Cellule</p></td><td><p>Autre</p></td></tr></tbody></table><p>Fin</p>');
      await selectText('Cellule', 2);
      await wrapWith('note');
      const cell = parse(Editor.getHTML());
      return {
        pass: list === '<p>Avant</p><div data-color="amber" data-icon="warning" class="callout" role="note"><ul><li><p>Un</p></li><li><p>Deux</p></li></ul></div><p>Après</p>'
          && !!column.querySelector('.two-columns-column:first-child > .callout') && column.querySelector('.two-columns-column:last-child > .callout') === null
          && !!cell.querySelector('td:first-child > .callout') && cell.querySelector('td:last-child > .callout') === null,
        notes: JSON.stringify({ list, column: column.innerHTML.slice(0, 260), cell: cell.innerHTML.slice(0, 260) }),
      };
    },
  });

  cases.push({
    id: 'co_presets_set_color_and_icon_together_then_each_can_be_chosen_alone',
    description: 'Note, Attention et Important choisissent couleur et icône ensemble ; choisir ensuite une couleur ou une icône ne touche pas à l\'autre et ne laisse plus de type coché ; l\'aperçu suit chaque choix ; Insérer écrit exactement ce qui est choisi',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      await selectText('Texte', 1);
      await openWindow();
      const preview = () => { const c = document.querySelector('.pp-callout-paper .callout'); return c.dataset.color + '/' + c.dataset.icon; };
      const state = () => [String(checked('type')), checked('swatch'), checked('icon-option'), preview()].join(' ');
      const steps = [];
      steps.push(state());
      choose('type', 'attention'); steps.push(state());
      choose('type', 'important'); steps.push(state());
      choose('swatch', 'purple'); steps.push(state());
      choose('icon-option', 'bulb'); steps.push(state());
      choose('type', 'note'); steps.push(state());
      choose('icon-option', 'star'); choose('swatch', 'green'); steps.push(state());
      okButton().click();
      await sleep(200);
      const wrote = written();
      return {
        pass: JSON.stringify(steps) === JSON.stringify(['note blue info blue/info', 'attention amber warning amber/warning', 'important red alert red/alert', 'null purple alert purple/alert', 'null purple bulb purple/bulb', 'note blue info blue/info', 'null green star green/star'])
          && wrote === '<div data-color="green" data-icon="star" class="callout" role="note"><p>Texte</p></div>',
        notes: JSON.stringify({ steps, wrote }),
      };
    },
  });

  cases.push({
    id: 'co_edit_prefills_changes_color_and_icon_keeps_the_content_and_the_caret',
    description: 'Dans un encadré, la fenêtre s\'ouvre en « Modifier l\'encadré » avec sa couleur et son icône cochées et « Retirer » visible ; « Valider » change les deux sans toucher au contenu ni à la place du curseur',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><div class="callout" data-color="green" data-icon="check"><p>Un</p><p>Deux</p></div><p>Après</p>');
      await selectText('Deux', 1);
      await openWindow();
      const opened = { title: document.getElementById('pp-callout-title').textContent, type: checked('type'), color: checked('swatch'), icon: checked('icon-option'), ok: okButton().textContent, removeShown: !removeButton().hidden, preview: document.querySelector('.pp-callout-paper .callout').dataset.color };
      choose('swatch', 'purple');
      choose('icon-option', 'star');
      okButton().click();
      await sleep(200);
      const html = Editor.getHTML();
      const caret = EditorCore.getEditor().state.selection.$from;
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = Editor.getHTML();
      return {
        pass: opened.title === 'Modifier l’encadré' && opened.type === null && opened.color === 'green' && opened.icon === 'check' && opened.ok === 'Valider' && opened.removeShown && opened.preview === 'green'
          && html === '<p>Avant</p><div data-color="purple" data-icon="star" class="callout" role="note"><p>Un</p><p>Deux</p></div><p>Après</p>' && caret.parent.textContent === 'Deux' && caret.parentOffset === 1
          && undone === '<p>Avant</p><div data-color="green" data-icon="check" class="callout" role="note"><p>Un</p><p>Deux</p></div><p>Après</p>',
        notes: JSON.stringify({ opened, html, caret: caret.parentOffset, undone }),
      };
    },
  });

  cases.push({
    id: 'co_remove_unwraps_the_blocks_keeps_the_text_and_the_caret_and_one_undo_restores',
    description: '« Retirer l\'encadré » fait remonter tous ses blocs d\'un niveau, sans toucher au texte et à la place du curseur, sans avertissement dans la console ; un Annuler remet l\'encadré (couleur et icône comprises)',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><div class="callout" data-color="purple" data-icon="bulb"><p>Un</p><ul><li><p>Deux</p></li></ul></div><p>Après</p>');
      await selectText('Deux', 1);
      const warnings = [];
      const realWarn = console.warn;
      console.warn = (...args) => { warnings.push(args.join(' ')); realWarn.apply(console, args); };
      let html, caret, undone, redone;
      try {
        await openWindow();
        removeButton().click();
        await sleep(200);
        html = Editor.getHTML();
        caret = EditorCore.getEditor().state.selection.$from;
        await h.clickButton('v2-btn-undo');
        await sleep(150);
        undone = Editor.getHTML();
        await h.clickButton('v2-btn-redo');
        await sleep(150);
        redone = Editor.getHTML();
      } finally { console.warn = realWarn; }
      return {
        pass: html === '<p>Avant</p><p>Un</p><ul><li><p>Deux</p></li></ul><p>Après</p>' && caret.parent.textContent === 'Deux' && caret.parentOffset === 1 && !modalOpen()
          && undone === '<p>Avant</p><div data-color="purple" data-icon="bulb" class="callout" role="note"><p>Un</p><ul><li><p>Deux</p></li></ul></div><p>Après</p>' && redone === html && warnings.length === 0,
        notes: JSON.stringify({ html, caret: caret && caret.parentOffset, undone, redone, warnings }),
      };
    },
  });

  cases.push({
    id: 'co_remove_keeps_a_selected_image_and_a_text_range_selected_where_they_were',
    description: '« Retirer l\'encadré » garde la sélection telle quelle : une image du cadre reste sélectionnée, une plage de texte sur deux blocs du cadre garde le même texte sélectionné',
    run: async (h) => {
      const img = '<img class="editor-image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" style="width: 40px">';
      const ed = () => EditorCore.getEditor();
      await setDoc(h, '<p>Avant</p><div class="callout" data-color="blue" data-icon="info"><p>Un' + img + '</p><p>Deux</p></div><p>Après</p>');
      let imagePos = null;
      ed().state.doc.descendants((node, pos) => { if (imagePos == null && node.type.name === 'editorImage') imagePos = pos; });
      ed().commands.setNodeSelection(imagePos);
      await sleep(120);
      await openWindow();
      removeButton().click();
      await sleep(200);
      const node = ed().state.selection.node;
      const imageKept = !!node && node.type.name === 'editorImage' && !Editor.getHTML().includes('callout');
      await setDoc(h, '<p>Avant</p><div class="callout" data-color="blue" data-icon="info"><p>Premier bloc</p><p>Second bloc</p></div><p>Après</p>');
      let from = null;
      ed().state.doc.descendants((n, pos) => { if (from == null && n.isText && n.text === 'Premier bloc') from = pos + 3; });
      let to = null;
      ed().state.doc.descendants((n, pos) => { if (to == null && n.isText && n.text === 'Second bloc') to = pos + 6; });
      ed().commands.setTextSelection({ from, to });
      await sleep(120);
      const selectedBefore = ed().state.doc.textBetween(ed().state.selection.from, ed().state.selection.to, '|');
      await openWindow();
      removeButton().click();
      await sleep(200);
      const sel = ed().state.selection;
      const selectedAfter = ed().state.doc.textBetween(sel.from, sel.to, '|');
      const rangeKept = selectedBefore === selectedAfter && selectedAfter === 'mier bloc|Second' && Editor.getHTML() === '<p>Avant</p><p>Premier bloc</p><p>Second bloc</p><p>Après</p>';
      return { pass: imageKept && rangeKept, notes: JSON.stringify({ imageKept, selectedBefore, selectedAfter, html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'co_remove_in_track_changes_accept_all_leaves_the_text_without_a_frame_and_reject_all_restores_it',
    description: 'Suivi des modifications actif : « Retirer l\'encadré » montre le cadre barré et son texte inséré à la place ; « Tout accepter » rend le texte seul, sans encadré vide ; « Tout refuser » rend l\'encadré d\'origine, couleur et icône comprises',
    run: async (h) => {
      const html = '<p>Alpha</p><div class="callout" data-color="purple" data-icon="bulb"><p>Beta</p><p>Gamma</p></div><p>Delta</p>';
      const results = {};
      const errors = [];
      const onError = e => errors.push(String(e.message || e));
      window.addEventListener('error', onError);
      try {
        for (const verdict of ['accept', 'reject']) {
          await setDoc(h, html);
          const original = Editor.getHTML();
          if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
          await selectText('Gamma', 2);
          await openWindow();
          removeButton().click();
          await sleep(250);
          const tracked = Editor.getHTML();
          await h.clickButton(verdict === 'accept' ? 'v2-btn-accept-all' : 'v2-btn-reject-all');
          await sleep(300);
          results[verdict] = { original, tracked, html: Editor.getHTML() };
          if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        }
      } finally {
        window.removeEventListener('error', onError);
        if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      }
      const tracked = parse(results.accept.tracked);
      // Le cadre ENTIER est barré (le suivi voit un remplacement, pas une levée) et son contenu est inséré juste derrière.
      const struck = !!tracked.querySelector('del > .callout');
      const inserted = !!tracked.querySelector('del + ins') && tracked.querySelector('del + ins').textContent === 'BetaGamma';
      const acceptOk = results.accept.html === '<p>Alpha</p><p>Beta</p><p>Gamma</p><p>Delta</p>';
      const rejectOk = results.reject.html === results.reject.original;
      return { pass: struck && inserted && acceptOk && rejectOk && errors.length === 0, notes: JSON.stringify({ struck, inserted, acceptOk, rejectOk, accepted: results.accept.html, rejected: results.reject.html, tracked: results.accept.tracked, errors }) };
    },
  });

  cases.push({
    id: 'co_cancel_escape_and_enter_on_a_choice',
    description: 'Annuler et Échap ferment la fenêtre sans rien changer et rendent le clavier à l\'éditeur ; Entrée sur un choix (type, couleur ou icône) valide la fenêtre ; les flèches changent le choix avec le focus',
    run: async (h) => {
      await setDoc(h, '<p>Un texte</p>');
      await selectText('texte', 1);
      await openWindow();
      choose('type', 'important');
      cancelButton().click();
      await sleep(150);
      const afterCancel = Editor.getHTML();
      const focusAfterCancel = !!document.activeElement && !!document.activeElement.closest('.tiptap');
      await openWindow();
      choose('swatch', 'gray');
      modal().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(150);
      const afterEscape = Editor.getHTML();
      const stillOpen = modalOpen();
      await openWindow();
      const swatch = document.querySelector('#pp-callout-modal .pp-callout-swatch[data-value="blue"]');
      swatch.focus();
      swatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await sleep(50);
      const afterArrow = { color: checked('swatch'), focused: document.activeElement && document.activeElement.dataset.value };
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(200);
      const afterEnter = written();
      return {
        pass: afterCancel === '<p>Un texte</p>' && focusAfterCancel && afterEscape === '<p>Un texte</p>' && !stillOpen && afterArrow.color === 'green' && afterArrow.focused === 'green' && !modalOpen()
          && afterEnter === '<div data-color="green" data-icon="info" class="callout" role="note"><p>Un texte</p></div>',
        notes: JSON.stringify({ afterCancel, focusAfterCancel, afterEscape, stillOpen, afterArrow, afterEnter }),
      };
    },
  });

  cases.push({
    id: 'co_unknown_color_or_icon_in_a_saved_document_falls_back_to_the_note_look',
    description: 'Un document dont l\'encadré porte une couleur ou une icône inconnue (modifié à la main) garde l\'encadré, au bleu et à l\'icône information, sans erreur ; la fenêtre s\'ouvre dessus avec ces valeurs',
    run: async (h) => {
      await setDoc(h, '<div class="callout" data-color="pink" data-icon="rocket"><p>Texte</p></div>');
      await sleep(100);
      const html = written();
      const el = tiptap().querySelector('.callout');
      const styles = getComputedStyle(el);
      await selectText('Texte', 1);
      await openWindow();
      const opened = [checked('swatch'), checked('icon-option')];
      await closeWindowIfOpen();
      return {
        pass: html === '<div data-color="blue" data-icon="info" class="callout" role="note"><p>Texte</p></div>' && styles.backgroundColor === 'rgb(239, 246, 255)' && styles.borderLeftColor === 'rgb(37, 99, 235)'
          && JSON.stringify(opened) === JSON.stringify(['blue', 'info']),
        notes: JSON.stringify({ html, bg: styles.backgroundColor, bar: styles.borderLeftColor, opened }),
      };
    },
  });

  cases.push({
    id: 'co_window_controls_have_names_and_roles',
    description: 'La fenêtre est lisible au lecteur d\'écran : trois groupes de choix à une réponse (radiogroup) étiquetés, chaque choix un bouton radio avec son nom, un seul arrêt de Tab par groupe, l\'encadré du document est une « note »',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      await selectText('Texte', 1);
      await openWindow();
      const groups = Array.from(document.querySelectorAll('#pp-callout-modal [role="radiogroup"]'));
      const labelOf = g => { const id = g.getAttribute('aria-labelledby'); const l = id && document.getElementById(id); return l ? l.textContent : null; };
      const info = groups.map(g => ({ label: labelOf(g), radios: Array.from(g.querySelectorAll('[role="radio"]')).length, named: Array.from(g.querySelectorAll('[role="radio"]')).every(b => !!(b.getAttribute('aria-label') || b.textContent.trim())), tabStops: Array.from(g.querySelectorAll('[role="radio"]')).filter(b => b.tabIndex === 0).length, checkedCount: Array.from(g.querySelectorAll('[aria-checked="true"]')).length }));
      const dialog = document.querySelector('#pp-callout-modal .pp-modal-box');
      const dialogLabel = dialog.getAttribute('role') === 'dialog' && document.getElementById(dialog.getAttribute('aria-labelledby')).textContent;
      await closeWindowIfOpen();
      return {
        pass: info.length === 3 && info.map(i => i.label).join() === 'Type,Couleur,Icône' && info.map(i => i.radios).join() === '3,6,6' && info.every(i => i.named && i.tabStops === 1 && i.checkedCount <= 1) && dialogLabel === 'Insérer un encadré',
        notes: JSON.stringify({ info, dialogLabel }),
      };
    },
  });

  // === 3) Le bloc de signature ==============================================================================================================================

  cases.push({
    id: 'co_signature_inserts_a_two_column_block_below_the_cursor_block_with_lines_and_captions',
    description: 'Le bloc de signature est une zone 2 colonnes : trois lignes vides pour signer, une ligne de tirets bas, puis « Nom et signature » à gauche et « Date » à droite ; il se pose sous le bloc du curseur (sous la liste ou l\'encadré où il se trouve, jamais dedans) ; le curseur est dans la légende de gauche',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p>Texte</p><p>Après</p>');
      await selectText('Texte', 2);
      signatureRow().click();
      await sleep(250);
      const html = Editor.getHTML();
      const caret = EditorCore.getEditor().state.selection.$from;
      const columns = Array.from(tiptap().querySelectorAll('.two-columns-column')).map(c => Array.from(c.children).map(p => p.textContent));
      const line = '_'.repeat(30);
      await setDoc(h, '<p>Avant</p><div class="callout" data-color="blue" data-icon="info"><p>Dans</p><p>Encadré</p></div><p>Après</p>');
      await selectText('Dans', 1);
      signatureRow().click();
      await sleep(250);
      const afterCallout = parse(Editor.getHTML());
      await setDoc(h, '<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>');
      await selectText('Un', 1);
      signatureRow().click();
      await sleep(250);
      const afterList = parse(Editor.getHTML());
      return {
        pass: html.indexOf('<p>Texte</p><div class="two-columns-zone"') > -1 && html.indexOf('</div></div><p>Après</p>') > -1
          && JSON.stringify(columns) === JSON.stringify([['', '', '', line, 'Nom et signature'], ['', '', '', line, 'Date']]) && caret.parent.textContent === 'Nom et signature' && caret.parentOffset === 'Nom et signature'.length
          && Array.from(afterCallout.children).map(c => c.className || c.tagName).join() === 'P,callout,two-columns-zone,P' && afterCallout.querySelector('.callout .two-columns-zone') === null
          && Array.from(afterList.children).map(c => c.className || c.tagName).join() === 'UL,two-columns-zone,P' && afterList.querySelector('li .two-columns-zone') === null,
        notes: JSON.stringify({ html, caret: caret.parentOffset, columns, afterCallout: Array.from(afterCallout.children).map(c => c.className || c.tagName), afterList: Array.from(afterList.children).map(c => c.className || c.tagName) }),
      };
    },
  });

  cases.push({
    id: 'co_signature_replaces_an_empty_paragraph_and_is_plain_editable_text',
    description: 'Sur un paragraphe vide, le bloc de signature prend sa place (pas de ligne vide devant) ; chaque ligne et légende est du texte ordinaire qui se modifie (une variable à la place du nom, une autre légende) ; un Annuler retire le bloc en une fois',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p></p>');
      const ed = EditorCore.getEditor();
      ed.commands.setTextSelection(ed.state.doc.content.size - 1);
      await sleep(100);
      signatureRow().click();
      await sleep(250);
      const kinds = Array.from(parse(Editor.getHTML()).children).map(c => c.className || c.tagName);
      // La légende devient « Signature du client » en la retapant (texte ordinaire).
      const caption = ed.state.selection.$from;
      ed.chain().focus().command(({ tr }) => { tr.insertText('Signature du client', caption.start(), caption.end()); return true; }).run();
      await sleep(100);
      const retyped = Array.from(tiptap().querySelectorAll('.two-columns-column:first-child > p')).map(p => p.textContent).pop();
      await h.clickButton('v2-btn-undo');
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      return {
        pass: JSON.stringify(kinds.slice(0, 3)) === JSON.stringify(['P', 'two-columns-zone', 'P']) && kinds.length === 3 && retyped === 'Signature du client' && Editor.getHTML() === '<p>Avant</p><p></p>',
        notes: JSON.stringify({ kinds, retyped, after: Editor.getHTML() }),
      };
    },
  });

  // === 4) Les rendus : Lecture =============================================================================================================================

  cases.push({
    id: 'co_reader_callout_has_the_same_box_colors_and_icon_as_the_editor',
    description: 'Lecture : l\'encadré a exactement la boîte de l\'éditeur (position, largeur, hauteur, début du texte au pixel près), le même fond, la même barre, la même icône et la même couleur d\'icône, pour les six couleurs',
    run: async (h) => {
      const colors = ['blue', 'green', 'amber', 'red', 'purple', 'gray'];
      const icons = ['info', 'warning', 'alert', 'check', 'bulb', 'star'];
      const html = '<p>Avant</p>' + colors.map((c, i) => '<div class="callout" data-color="' + c + '" data-icon="' + icons[i] + '"><p>Texte assez long pour passer à la ligne dans l\'encadré et vérifier le même retour à la ligne partout, ' + c + '.</p><ul><li><p>Un point</p></li></ul></div>').join('') + '<p>Après</p>';
      await h.resetEditor();
      Editor.setHTML(html);
      await sleep(200);
      const reader = await h.renderReaderMode(html);
      // Même largeur de papier des deux côtés (A4), comme les autres scénarios de fidélité éditeur / Lecture : sans cela les deux conteneurs ont leur propre largeur.
      h.setA4Preview(true);
      await sleep(150);
      const measure = root => Array.from(root.querySelectorAll('.callout')).map(c => {
        const base = root.getBoundingClientRect();
        const r = c.getBoundingClientRect();
        const text = c.querySelector('p').getBoundingClientRect();
        const cs = getComputedStyle(c);
        const before = getComputedStyle(c, '::before');
        return { left: +(r.left - base.left).toFixed(1), top: +(r.top - base.top).toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1), textLeft: +(text.left - base.left).toFixed(1), bg: cs.backgroundColor, bar: cs.borderLeftColor, barWidth: cs.borderLeftWidth, iconColor: before.backgroundColor, mask: before.maskImage || before.webkitMaskImage, box: [before.left, before.top, before.width, before.height].join() };
      });
      const editorBoxes = measure(tiptap());
      const readerBoxes = measure(reader);
      h.setA4Preview(false);
      const same = editorBoxes.length === 6 && readerBoxes.length === 6 && editorBoxes.every((e, i) => JSON.stringify(e) === JSON.stringify(readerBoxes[i]));
      const distinctMasks = new Set(readerBoxes.map(b => b.mask)).size === 6;
      const palette = colors.every((c, i) => readerBoxes[i].bg === 'rgb(' + rgb(Callout.COLORS[c].tint).join(', ') + ')' && readerBoxes[i].bar === 'rgb(' + rgb(Callout.COLORS[c].accent).join(', ') + ')' && readerBoxes[i].iconColor === readerBoxes[i].bar);
      return { pass: same && distinctMasks && palette, notes: JSON.stringify({ same, distinctMasks, palette, first: [editorBoxes[0], readerBoxes[0]] }) };
    },
  });

  cases.push({
    id: 'co_palette_is_the_single_source_of_the_css_and_the_exports',
    description: 'La palette de js/callout.js est la seule source : chaque couleur et chaque icône a sa règle CSS générée, une icône exportée est un PNG carré de la bonne couleur, et le fond/la barre du CSS sont ceux que lisent le PDF et le Word',
    run: async (h) => {
      const sheet = document.getElementById('pp-callout-style').textContent;
      const colorRules = Callout.COLOR_ORDER.every(k => sheet.includes('.callout[data-color="' + k + '"]') && sheet.includes(Callout.COLORS[k].accent) && sheet.includes(Callout.COLORS[k].tint));
      const iconRules = Callout.ICON_ORDER.every(k => sheet.includes('.callout[data-icon="' + k + '"]'));
      const pngs = Callout.ICON_ORDER.map(k => Callout.iconPng(k, '#dc2626', 48));
      const isPng = pngs.every(u => /^data:image\/png;base64,/.test(u));
      const sizes = await Promise.all(pngs.map(u => new Promise(resolve => { const i = new Image(); i.onload = () => resolve([i.naturalWidth, i.naturalHeight]); i.src = u; })));
      // Le dessin n'est pas vide, et il est de la couleur demandée (rouge, pas du noir).
      const painted = await Promise.all(pngs.map(u => new Promise(resolve => {
        const i = new Image();
        i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, 48, 48).data; let n = 0, red = 0; for (let p = 0; p < d.length; p += 4) { if (d[p + 3] > 200) { n++; if (d[p] > 200 && d[p + 1] < 80) red++; } } resolve({ n, red }); };
        i.src = u;
      })));
      const presets = Callout.PRESET_ORDER.map(k => Callout.PRESETS[k].color + '/' + Callout.PRESETS[k].icon).join();
      return {
        pass: colorRules && iconRules && isPng && sizes.every(s => s[0] === 48 && s[1] === 48) && painted.every(p => p.n > 20 && p.red / p.n > 0.9) && presets === 'blue/info,amber/warning,red/alert' && Callout.colorOf('inconnue') === Callout.COLORS.blue,
        notes: JSON.stringify({ colorRules, iconRules, isPng, sizes, painted, presets }),
      };
    },
  });

  cases.push({
    id: 'co_hidden_paragraph_leaves_no_empty_callout',
    description: 'Lecture, PDF et Word : quand « masquer le paragraphe » retire le dernier paragraphe d\'un encadré, l\'encadré part avec lui (plus de barre et de fond vides) ; s\'il reste un autre bloc, il reste',
    run: async (h) => {
      const only = parse('<p>Avant</p><div class="callout" data-color="blue" data-icon="info"><p>Seul<span class="pp-loop-hide-block"></span></p></div><p>Après</p>');
      LoopRules.removeHiddenBlocks(only);
      const some = parse('<div class="callout" data-color="blue" data-icon="info"><p>Reste</p><p>Part<span class="pp-loop-hide-block"></span></p></div>');
      LoopRules.removeHiddenBlocks(some);
      const inList = parse('<div class="callout" data-color="red" data-icon="alert"><ul><li><p>Seul<span class="pp-loop-hide-block"></span></p></li></ul></div>');
      LoopRules.removeHiddenBlocks(inList);
      return {
        pass: only.innerHTML === '<p>Avant</p><p>Après</p>' && some.innerHTML === '<div class="callout" data-color="blue" data-icon="info"><p>Reste</p></div>' && inList.innerHTML === '',
        notes: JSON.stringify({ only: only.innerHTML, some: some.innerHTML, inList: inList.innerHTML }),
      };
    },
  });

  // === 5) Les rendus : PDF ==================================================================================================================================

  cases.push({
    id: 'co_pdf_callout_is_painted_with_its_tint_its_bar_and_its_icon_with_the_text_inside',
    description: 'PDF : l\'encadré est un fond teinté jusqu\'à la marge de droite, une barre de la couleur d\'accent à gauche et l\'icône de cette couleur, texte à 33pt de la marge ; rien n\'est peint hors de la boîte ; chacune des six couleurs porte sa teinte et sa barre',
    run: async (h) => {
      await h.resetEditor();
      const colors = ['blue', 'green', 'amber', 'red', 'purple', 'gray'];
      const icons = ['info', 'warning', 'alert', 'check', 'bulb', 'star'];
      const out = await h.exportPdfContent('<p>Avant</p>' + colors.map((c, i) => '<div class="callout" data-color="' + c + '" data-icon="' + icons[i] + '"><p>Encadre' + c + ' avec du texte</p></div>').join('') + '<p>Après</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const view = await renderPdfPage(out.base64, 1);
      const page = truth.pages[0];
      const right = view.width - 28;
      const rows = colors.map(c => {
        const t = itemOf(truth, 'Encadre' + c) || page.textItems.find(i => i.str.startsWith('Encadre' + c));
        const y = t ? t.y - 3 : 0;
        return { c, x: t && t.x, y, bar: view.pixel(29.5, y), tint: view.pixel(right - 30, y), edge: view.pixel(right - 2, y), outsideRight: view.pixel(right + 5, y), outsideLeft: view.pixel(24, y) };
      });
      const ok = rows.every(r => r.x && Math.abs(r.x - 61) < 1.5 && near(r.bar, rgb(Callout.COLORS[r.c].accent), 6) && near(r.tint, rgb(Callout.COLORS[r.c].tint), 3) && near(r.edge, rgb(Callout.COLORS[r.c].tint), 3)
        && near(r.outsideRight, WHITE, 2) && near(r.outsideLeft, WHITE, 2));
      // L'icône : une image de 15pt, à 12px (9pt) après la barre ; de la couleur d'accent (un pixel du trait n'est ni blanc ni teinte).
      const iconImages = page.images.filter(i => Math.abs(i.width - 15) < 0.6 && Math.abs(i.height - 15) < 0.6);
      const iconsAt = iconImages.every(i => Math.abs(i.x - 40) < 1.2);
      const first = rows[0];
      const iconBox = iconImages[0];
      let accentPixels = 0;
      for (let dy = 0; dy < 15; dy += 1) for (let dx = 0; dx < 15; dx += 1) { if (near(view.pixel(iconBox.x + dx, iconBox.y + dy), rgb(Callout.COLORS.blue.accent), 40)) accentPixels += 1; }
      return {
        pass: ok && iconImages.length === 6 && iconsAt && accentPixels > 12,
        notes: JSON.stringify({ rows, icons: iconImages.length, iconXs: iconImages.map(i => Math.round(i.x * 10) / 10), accentPixels, first }),
      };
    },
  });

  cases.push({
    id: 'co_pdf_callout_text_wraps_inside_the_box_and_the_box_grows_with_it',
    description: 'PDF : un long texte passe à la ligne dans l\'encadré (jamais sur l\'icône ni au-delà de la marge de droite moins le retrait), le fond couvre toutes les lignes, le texte d\'après commence sous la boîte',
    run: async (h) => {
      await h.resetEditor();
      const long = 'mot '.repeat(60).trim();
      const out = await h.exportPdfContent('<p>Avant</p><div class="callout" data-color="amber" data-icon="warning"><p>' + long + '</p><p>Fin de la note</p></div><p>Sous la boîte</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const view = await renderPdfPage(out.base64, 1);
      const page = truth.pages[0];
      const words = page.textItems.filter(i => i.str === 'mot');
      const lines = new Set(words.map(i => Math.round(i.y)));
      const rightMost = Math.max(...words.map(i => i.x + i.width));
      const leftMost = Math.min(...words.map(i => i.x));
      const last = itemOf(truth, 'Fin');
      const after = itemOf(truth, 'Sous');
      const tintAtLast = view.pixel(view.width - 28 - 3, last.y - 3);
      const tintAtFirstLine = view.pixel(view.width - 28 - 3, words[0].y - 3);
      return {
        pass: words.length === 60 && lines.size >= 3 && leftMost >= 60 && rightMost <= view.width - 28 - 9 + 1 && near(tintAtLast, rgb(Callout.COLORS.amber.tint), 3) && near(tintAtFirstLine, rgb(Callout.COLORS.amber.tint), 3)
          && after.y > last.y + 8 && near(view.pixel(view.width - 28 - 3, after.y - 3), WHITE, 2),
        notes: JSON.stringify({ words: words.length, lines: lines.size, leftMost, rightMost, limit: view.width - 28 - 9, tintAtLast, tintAtFirstLine, lastY: last.y, afterY: after.y }),
      };
    },
  });

  cases.push({
    id: 'co_pdf_long_callout_splits_across_pages_keeps_every_line_and_paints_on_each_page',
    description: 'PDF : un encadré plus haut qu\'une page passe d\'une page à l\'autre sans perdre ni répéter une ligne, et le fond et la barre sont peints sur la page suivante aussi',
    run: async (h) => {
      await h.resetEditor();
      const lines = Array.from({ length: 90 }, (_, i) => '<p>L' + String(i + 1).padStart(3, '0') + ' ligne de la note</p>').join('');
      const out = await h.exportPdfContent('<p>Avant</p><div class="callout" data-color="green" data-icon="check">' + lines + '</div><p>Après</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const tokens = truth.pages.flatMap(p => p.textItems.map(i => i.str));
      const missing = Array.from({ length: 90 }, (_, i) => 'L' + String(i + 1).padStart(3, '0')).filter(t => tokens.filter(x => x === t).length !== 1);
      const lastPage = truth.pages.length;
      const view2 = await renderPdfPage(out.base64, 2);
      const lastItem = truth.pages[1].textItems.find(i => i.str === 'L090');
      return {
        pass: lastPage >= 2 && missing.length === 0 && tokens.includes('Après') && !!lastItem && near(view2.pixel(29.5, lastItem.y - 3), rgb(Callout.COLORS.green.accent), 6) && near(view2.pixel(500, lastItem.y - 3), rgb(Callout.COLORS.green.tint), 3),
        notes: JSON.stringify({ pages: lastPage, missing: missing.slice(0, 5), bar: lastItem && view2.pixel(29.5, lastItem.y - 3) }),
      };
    },
  });

  cases.push({
    id: 'co_pdf_callout_in_a_column_takes_the_column_width_and_a_list_inside_keeps_its_bullets',
    description: 'PDF : l\'encadré d\'une colonne commence au bord de sa colonne et son fond s\'arrête avant la colonne voisine (largeur de la colonne, pas celle de la page) ; une liste dans un encadré garde ses puces et ses lignes séparées',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportPdfContent('<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>Repère</p><div class="callout" data-color="blue" data-icon="info"><p>Dans la colonne de gauche</p></div></div><div class="two-columns-column"><p>Colonne de droite</p></div></div>'
        + '<div class="callout" data-color="red" data-icon="alert"><ul><li><p>Premier point</p></li><li><p>Second point</p></li></ul></div>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const view = await renderPdfPage(out.base64, 1);
      const mark = itemOf(truth, 'Repère');
      const left = itemOf(truth, 'Dans');
      const rightCol = itemOf(truth, 'Colonne');
      const y = left.y - 3;
      // Le bord droit du fond : premier pixel blanc à droite de l'encadré (le texte et la teinte ne sont pas blancs).
      let edge = left.x;
      while (edge < view.width && !near(view.pixel(edge + 1, y), WHITE, 3)) edge += 1;
      const first = itemOf(truth, 'Premier');
      const second = itemOf(truth, 'Second');
      const bullets = truth.pages[0].textItems.filter(i => /^•$/.test(i.str)).length;
      return {
        pass: Math.abs(left.x - mark.x - 33) < 1.5 && edge - left.x > 150 && edge < rightCol.x - 4 && near(view.pixel((edge + rightCol.x) / 2, y), WHITE, 2) && near(view.pixel(left.x - 2, y), rgb(Callout.COLORS.blue.tint), 3)
          && first.y < second.y && near(view.pixel(view.width - 28 - 3, second.y - 3), rgb(Callout.COLORS.red.tint), 3) && bullets === 2,
        notes: JSON.stringify({ mark: mark.x, left: left.x, edge, rightCol: rightCol.x, bullets, first: first && first.y, second: second && second.y }),
      };
    },
  });

  cases.push({
    id: 'co_pdf_signature_has_room_to_sign_the_line_on_one_line_and_captions_below',
    description: 'PDF : le bloc de signature garde ses deux lignes de tirets bas chacune sur une seule ligne dans sa colonne (aux largeurs par défaut), de l\'espace au-dessus pour signer, « Nom et signature » à gauche et « Date » à droite sous la ligne',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p></p>');
      const ed = EditorCore.getEditor();
      ed.commands.setTextSelection(ed.state.doc.content.size - 1);
      signatureRow().click();
      await sleep(250);
      const out = await h.exportPdfContent(Editor.getHTML());
      const truth = await h.extractPdfGroundTruth(out.base64);
      const items = truth.pages[0].textItems;
      const lines = items.filter(i => /^_+$/.test(i.str));
      const before = itemOf(truth, 'Avant');
      const name = items.find(i => i.str === 'Nom');
      const date = itemOf(truth, 'Date');
      const columnWidth = (truth.pages[0].width - 56 - 16) / 2;
      return {
        pass: lines.length === 2 && lines.every(l => l.str.length === 30 && l.width < columnWidth - 10) && lines[0].x < lines[1].x && lines[1].x > 28 + columnWidth && lines[0].y - before.y > 30 && name.y > lines[0].y + 5 && date.y > lines[1].y + 5 && Math.abs(date.x - lines[1].x) < 2 && Math.abs(name.x - lines[0].x) < 2,
        notes: JSON.stringify({ lines, before: before.y, name, date, columnWidth }),
      };
    },
  });

  // === 6) Les rendus : Word ================================================================================================================================

  cases.push({
    id: 'co_docx_callout_is_a_shaded_two_cell_row_with_a_colored_left_bar_icon_and_text',
    description: 'Word : l\'encadré est un tableau à une ligne et deux cellules - icône à gauche, texte à droite - au fond teinté sur les deux cellules, avec une barre de la couleur d\'accent (3pt) pour seul filet ; largeurs du <w:tblGrid> = largeur du texte ; l\'icône est une image en ligne de 20px avec son texte alternatif',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<p>Avant</p><div class="callout" data-color="amber" data-icon="warning"><p>Premier paragraphe de la note</p><p>Second paragraphe</p></div><p>Après</p>');
      const body = out.doc.getElementsByTagName('w:body')[0];
      const kinds = Array.from(body.children).map(n => n.nodeName);
      const tables = h.docxTables(out.doc);
      const sect = h.docxSectionProps(out.doc);
      const tbl = Array.from(body.children).find(n => n.nodeName === 'w:tbl');
      const cells = Array.from(tbl.getElementsByTagName('w:tc'));
      const border = (tc, side) => { const e = tc.getElementsByTagName('w:tcBorders')[0].getElementsByTagName('w:' + side)[0]; return { val: e.getAttribute('w:val'), color: e.getAttribute('w:color'), sz: e.getAttribute('w:sz') }; };
      const fill = tc => tc.getElementsByTagName('w:shd')[0].getAttribute('w:fill');
      const drawings = h.docxDrawings(out.doc);
      const docPr = Array.from(out.doc.getElementsByTagName('wp:docPr')).map(d => ({ id: d.getAttribute('id'), descr: d.getAttribute('descr') }));
      const contentWidth = sect.widthTwip - sect.margins.left - sect.margins.right;
      return {
        pass: tables.length === 1 && tables[0].rows.length === 1 && tables[0].rows[0].cells.length === 2 && kinds.join() === 'w:p,w:p,w:tbl,w:p,w:p,w:sectPr'
          && tables[0].gridCols.join() === [600, contentWidth - 600].join() && tables[0].rows[0].cells.map(c => c.widthTwip).join() === tables[0].gridCols.join()
          && border(cells[0], 'left').val === 'single' && border(cells[0], 'left').color === 'B45309' && border(cells[0], 'left').sz === '24' && ['top', 'bottom', 'right'].every(s => border(cells[0], s).val === 'none')
          && ['top', 'bottom', 'left', 'right'].every(s => border(cells[1], s).val === 'none') && fill(cells[0]) === 'FFFBEB' && fill(cells[1]) === 'FFFBEB'
          && tables[0].rows[0].cells[1].text === 'Premier paragraphe de la noteSecond paragraphe' && drawings.length === 1 && drawings[0].kind === 'inline' && docPr.length === 1 && docPr[0].descr === 'Triangle d’avertissement' && /^\d+$/.test(docPr[0].id)
          && out.names.some(n => /^word\/media\/.+\.png$/.test(n)),
        notes: JSON.stringify({ kinds, grid: tables[0] && tables[0].gridCols, contentWidth, left: border(cells[0], 'left'), fills: [fill(cells[0]), fill(cells[1])], drawings, docPr }),
      };
    },
  });

  cases.push({
    id: 'co_docx_callouts_in_a_row_stay_two_tables_and_every_cell_ends_with_a_paragraph',
    description: 'Word : deux encadrés qui se suivent restent deux tableaux (un paragraphe les sépare, sans quoi Word les fusionne), chaque icône a un identifiant d\'image unique, et toute cellule du document finit par un paragraphe (Word refuse un fichier dont une cellule finit par un tableau)',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<div class="callout" data-color="blue" data-icon="info"><p>Un</p></div><div class="callout" data-color="red" data-icon="alert"><p>Deux</p></div>'
        + '<div class="callout" data-color="green" data-icon="check"><table><tbody><tr><td><p>Cellule dans un encadré</p></td></tr></tbody></table></div>');
      const body = out.doc.getElementsByTagName('w:body')[0];
      const kinds = Array.from(body.children).map(n => n.nodeName);
      const noAdjacentTables = kinds.every((k, i) => !(k === 'w:tbl' && kinds[i + 1] === 'w:tbl'));
      const ids = Array.from(out.doc.getElementsByTagName('wp:docPr')).map(d => d.getAttribute('id'));
      const cellsEndWithParagraph = tableCells(out.doc).every(tc => tc.lastElementChild && tc.lastElementChild.nodeName === 'w:p');
      return {
        pass: kinds.filter(k => k === 'w:tbl').length === 3 && noAdjacentTables && new Set(ids).size === 3 && ids.length === 3 && cellsEndWithParagraph,
        notes: JSON.stringify({ kinds, ids, cellsEndWithParagraph }),
      };
    },
  });

  cases.push({
    id: 'co_docx_callout_in_a_column_and_in_a_cell_takes_the_width_of_its_container',
    description: 'Word : un encadré dans une colonne ou une cellule de tableau a la largeur de ce conteneur (pas celle de la page), et son texte la largeur restante',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><div class="callout" data-color="blue" data-icon="info"><p>Dans la colonne</p></div></div><div class="two-columns-column"><p>Droite</p></div></div>'
        + '<table><tbody><tr><td><div class="callout" data-color="purple" data-icon="star"><p>Dans la cellule</p></div></td><td><p>Autre</p></td></tr></tbody></table>');
      const nested = Array.from(out.doc.getElementsByTagName('w:tbl')).filter(t => t.parentNode.nodeName === 'w:tc');
      const widths = nested.map(t => ({ total: Number(t.getElementsByTagName('w:tblW')[0].getAttribute('w:w')), grid: Array.from(t.getElementsByTagName('w:tblGrid')[0].children).map(g => Number(g.getAttribute('w:w'))), outer: Number(t.parentNode.getElementsByTagName('w:tcW')[0].getAttribute('w:w')) }));
      const sect = h.docxSectionProps(out.doc);
      const contentWidth = sect.widthTwip - sect.margins.left - sect.margins.right;
      const column = widths[0];
      const cell = widths[widths.length - 1];
      return {
        pass: nested.length === 2 && column.total < contentWidth / 2 + 5 && column.total > contentWidth / 2 - 400 && column.grid.reduce((a, b) => a + b, 0) === column.total && column.grid[0] === 600
          && cell.total <= cell.outer && cell.total >= cell.outer - 300 && cell.grid.reduce((a, b) => a + b, 0) === cell.total && cell.total < contentWidth - 1000,
        notes: JSON.stringify({ widths, contentWidth }),
      };
    },
  });

  // === 7) Les rendus : e-mail ===============================================================================================================================

  cases.push({
    id: 'co_mailto_text_writes_the_callout_blocks_and_lists_like_the_body',
    description: 'E-mail (texte brut) : un encadré n\'a ni fond ni barre, ses blocs s\'écrivent comme ceux du corps - un paragraphe par bloc, une ligne vide entre deux, listes à puces comprises - sans titre ni mot ajouté',
    run: async (h) => {
      const text = MailtoExport.plainTextFromHtml('<p>Avant</p><div class="callout" data-color="amber" data-icon="warning"><p>Première ligne</p><p>Seconde ligne</p><ul><li><p>Un</p></li><li><p>Deux</p></li></ul></div><p>Après</p>');
      return { pass: text === 'Avant\n\nPremière ligne\n\nSeconde ligne\n\n- Un\n- Deux\n\nAprès', notes: JSON.stringify({ text }) };
    },
  });

  // === 8) Suivi des modifications ==========================================================================================================================

  cases.push({
    id: 'co_track_changes_wrap_remove_and_reject_keep_a_valid_document',
    description: 'Suivi des modifications actif : entourer, retirer, insérer une signature, puis tout refuser rend le document d\'origine, sans erreur (« Invalid content ») ; accepter garde l\'encadré',
    run: async (h) => {
      const errors = [];
      const onError = e => errors.push(String(e.message || e));
      window.addEventListener('error', onError);
      let originalOk = false, acceptedHasCallout = false, rejected = '';
      try {
        await setDoc(h, '<p>Avant</p><p>Cible</p><p>Après</p>');
        if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        await selectText('Cible', 1);
        await wrapWith('attention');
        const wrapped = Editor.getHTML();
        const pending = Editor.hasPendingTrackedChanges();
        await h.clickButton('v2-btn-accept-all');
        await sleep(300);
        const accepted = parse(Editor.getHTML());
        acceptedHasCallout = !!accepted.querySelector('.callout[data-color="amber"] > p') && accepted.querySelector('ins, del') === null && wrapped.includes('<ins') && pending;
        await selectText('Cible', 1);
        await openWindow();
        removeButton().click();
        await sleep(300);
        signatureRow().click();
        await sleep(300);
        await h.clickButton('v2-btn-reject-all');
        await sleep(300);
        rejected = Editor.getHTML();
        originalOk = !rejected.includes('two-columns-zone') && !rejected.includes('<ins') && !rejected.includes('<del') && rejected.includes('Cible');
      } finally {
        window.removeEventListener('error', onError);
        if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      }
      return { pass: acceptedHasCallout && originalOk && errors.length === 0, notes: JSON.stringify({ acceptedHasCallout, originalOk, rejected: rejected.slice(0, 300), errors }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.calloutSignature = cases;
})();
