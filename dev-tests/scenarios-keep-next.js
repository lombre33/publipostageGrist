// Suite "keepNext" - « Garder avec le suivant » (demande d'Antoine du 04/10, défaut B7 : « les totaux d'une facture se coupent entre deux pages » ; son choix : « Réglage au choix », un réglage des
// paragraphes comme dans Word, js/keep-with-next.js). Trois parties :
//  1) le RÉGLAGE : l'attribut `data-keep-next` et son aller-retour HTML, Entrée, la ligne à cocher du menu Alignement (pose, retrait, plusieurs paragraphes, état mixte, bloc de texte conditionnel, grisage et
//     sa raison, les deux langues, Annuler), le suivi des modifications ;
//  2) l'ÉDITEUR et la LECTURE : la suite de paragraphes gardés et le bloc qui la suit passent ensemble à la page suivante (l'éditeur et la Lecture sont CALIBRÉS sur des mesures : la page est réglée pour que la
//     coupure tombe à la moitié d'un bloc, les verdicts ne dépendent pas des polices de la machine) ;
//  3) les EXPORTS : le PDF (lu par pdf.js, marge du bas balayée de 2 pt en 2 pt : pdfmake est déterministe) et le Word (OOXML dézippé, w:keepNext).
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-keep-next-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const image = extra => `<img class="editor-image" src="${DATA}" style="width: 120px"${extra || ''}>`;
  const KEPT = text => '<p data-keep-next="true">' + text + '</p>';
  const CAP = text => '<p data-caption="true">' + text + '</p>';
  const COND = inner => '<div class="conditional-text">' + inner + '</div>';
  const PAGE_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const row = () => document.getElementById('v2-btn-keep-next');
  // TipTap (StarterKit) garde toujours un paragraphe vide à la fin du document quand le dernier bloc n'en est pas un : on le retire pour lire le document tel qu'on l'a écrit.
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // Les paragraphes du document, un par un, à toute profondeur : « Aa* » quand le réglage est posé, « Aa » sinon.
  function keepList() {
    const out = [];
    ed().state.doc.descendants(node => { if (node.type.name === 'paragraph') out.push(node.textContent + (node.attrs.keepNext ? '*' : '')); });
    return out.join('|');
  }
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  const textPos = text => positionOf(n => n.isText && n.text.indexOf(text) !== -1);
  async function cursorIn(text) {
    ed().commands.setTextSelection(textPos(text) + 1);
    await sleep(150);
  }
  // Une sélection de texte du milieu du premier paragraphe au milieu du dernier.
  async function selectRange(fromText, toText) {
    ed().commands.setTextSelection({ from: textPos(fromText) + 1, to: textPos(toText) + 1 });
    await sleep(150);
  }
  const rowState = () => ({ checked: row().getAttribute('aria-checked') === 'true', disabled: row().getAttribute('aria-disabled') === 'true', greyed: row().classList.contains('v2-hover-row-disabled'), tab: row().tabIndex, title: row().title });
  // Un clic comme la souris le donne : la ligne ne prend pas le focus (mousedown retenu), l'éditeur garde sa sélection.
  async function press() {
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row().click();
    await sleep(150);
  }

  // === 1) Le réglage ===================================================================================================================================================
  cases.push({
    id: 'keepnext_attribute_survives_the_html_round_trip_and_enter_at_the_end_opens_an_ordinary_paragraph',
    description: 'Le réglage est l\'attribut `data-keep-next` du paragraphe : lu depuis le HTML (« false » compte pour rien), réécrit seulement quand il est posé, jamais « false » ; Entrée à la fin d\'un paragraphe gardé ouvre un paragraphe qui ne l\'est pas ; au milieu, les deux moitiés le sont (comme l\'alignement : la seconde moitié reste gardée avec le bloc qui suit)',
    run: async (h) => {
      await setDoc(h, KEPT('Aa') + '<p>Bb</p><p data-keep-next="false">Cc</p>');
      const parsed = keepList();
      const html = written();
      await setDoc(h, KEPT('Dd'));
      ed().commands.setTextSelection(textPos('Dd') + 2);
      ed().commands.splitBlock();
      await sleep(100);
      const atEnd = keepList();
      await setDoc(h, KEPT('EeFf'));
      ed().commands.setTextSelection(textPos('EeFf') + 2);
      ed().commands.splitBlock();
      await sleep(100);
      const inMiddle = keepList();
      const pass = parsed === 'Aa*|Bb|Cc' && html === '<p data-keep-next="true">Aa</p><p>Bb</p><p>Cc</p>' && atEnd === 'Dd*|' && inMiddle === 'Ee*|Ff*';
      return { pass, notes: JSON.stringify({ parsed, html, atEnd, inMiddle }) };
    },
  });

  cases.push({
    id: 'keepnext_menu_row_sets_and_clears_the_setting_on_the_selected_paragraphs_with_one_undo',
    description: 'La ligne « Garder avec le suivant » du menu Alignement : décochée sur un paragraphe ordinaire, un clic pose le réglage (coche) et le suivant le retire ; sur plusieurs paragraphes, un clic les règle tous et un seul Annuler les défait ; état mixte : décochée, un clic pose partout puis retire partout ; le document écrit ne porte que le réglage posé',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Aa</p><p>Bb</p><p>Cc</p>');
      out.where = { inAlignMenu: !!document.querySelector('#v2-align-group .v2-hover-flyout #v2-btn-keep-next'), role: row().getAttribute('role'), label: row().textContent.trim(), tabbable: row().tabIndex === 0 };
      await cursorIn('Bb');
      out.start = rowState();
      await press();
      out.set = { list: keepList(), html: written(), state: rowState() };
      await press();
      out.cleared = { list: keepList(), state: rowState() };
      await selectRange('Aa', 'Cc');
      await press();
      out.many = { list: keepList(), state: rowState() };
      ed().commands.undo();
      await sleep(150);
      out.undone = keepList();
      ed().commands.redo();
      await sleep(150);
      out.redone = keepList();
      await setDoc(h, KEPT('Aa') + '<p>Bb</p><p>Cc</p>');
      await selectRange('Aa', 'Cc');
      out.mixedStart = rowState();
      await press();
      out.mixedSet = keepList();
      await press();
      out.mixedCleared = keepList();
      const pass = out.where.inAlignMenu && out.where.role === 'menuitemcheckbox' && out.where.label === 'Garder avec le suivant' && out.where.tabbable
        && !out.start.checked && !out.start.disabled && !out.start.greyed && out.start.title === ''
        && out.set.list === 'Aa|Bb*|Cc' && out.set.html === '<p>Aa</p><p data-keep-next="true">Bb</p><p>Cc</p>' && out.set.state.checked
        && out.cleared.list === 'Aa|Bb|Cc' && !out.cleared.state.checked
        && out.many.list === 'Aa*|Bb*|Cc*' && out.many.state.checked && out.undone === 'Aa|Bb|Cc' && out.redone === 'Aa*|Bb*|Cc*'
        && !out.mixedStart.checked && !out.mixedStart.disabled && out.mixedSet === 'Aa*|Bb*|Cc*' && out.mixedCleared === 'Aa|Bb|Cc';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'keepnext_menu_row_works_inside_a_conditional_text_block_where_invoice_totals_live',
    description: 'Les lignes de totaux d\'une facture sont dans des blocs de texte conditionnel : la ligne du menu y est active, règle le paragraphe du curseur, et sur le bloc sélectionné en entier (barre flottante) tous ses paragraphes',
    run: async (h) => {
      const out = {};
      await setDoc(h, COND('<p>Xx</p><p>Yy</p>') + '<p>Zz</p>');
      await cursorIn('Xx');
      out.inside = rowState();
      await press();
      out.one = keepList();
      ed().commands.setNodeSelection(positionOf(n => n.type.name === 'conditionalText'));
      await sleep(150);
      out.blockSelected = rowState();
      await press();
      out.whole = keepList();
      await press();
      out.wholeCleared = keepList();
      const pass = !out.inside.disabled && !out.inside.checked && out.one === 'Xx*|Yy|Zz' && !out.blockSelected.disabled && !out.blockSelected.checked
        && out.whole === 'Xx*|Yy*|Zz' && out.wholeCleared === 'Xx|Yy|Zz';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // Là où le réglage n'a pas de sens : la ligne est grisée (jamais retirée), avec sa raison en info-bulle, hors de l'ordre des tabulations, et un clic ne change rien.
  const GREYED = {
    cell: { html: '<table><tbody><tr><td><p>Dd</p></td></tr></tbody></table><p>Ee</p>', at: 'Dd' },
    list: { html: '<ul><li><p>Dd</p></li></ul><p>Ee</p>', at: 'Dd' },
    heading: { html: '<h2>Dd</h2><p>Ee</p>', at: 'Dd' },
    quote: { html: '<blockquote><p>Dd</p></blockquote><p>Ee</p>', at: 'Dd' },
    callout: { html: '<div class="callout" data-color="green" data-icon="check"><p>Dd</p></div><p>Ee</p>', at: 'Dd' },
    column: { html: '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>Dd</p></div><div class="two-columns-column"><p>Ff</p></div></div><p>Ee</p>', at: 'Dd' },
    caption: { html: '<p>Ee</p>' + CAP('Dd'), at: 'Dd' },
  };
  cases.push({
    id: 'keepnext_menu_row_is_greyed_with_its_reason_in_a_table_list_heading_quote_callout_column_and_caption',
    description: 'Dans une case de tableau, une liste, un titre, une citation, un encadré, une colonne et une légende, la ligne est grisée (aria-disabled, hors des tabulations) avec sa raison en info-bulle, et un clic ne change rien ; le curseur de retour dans un paragraphe du texte la rend active',
    run: async (h) => {
      const out = {};
      for (const [name, spec] of Object.entries(GREYED)) {
        await setDoc(h, spec.html);
        const before = written();
        await cursorIn(spec.at);
        const greyed = rowState();
        await press();
        const unchanged = written() === before && !/data-keep-next/.test(written());
        await cursorIn('Ee');
        out[name] = { greyed: greyed.disabled && greyed.greyed && greyed.tab === -1 && greyed.title.indexOf('Seulement pour les paragraphes du texte') === 0 && !greyed.checked, unchanged, back: !rowState().disabled && rowState().tab === 0 && rowState().title === '' };
      }
      const pass = Object.values(out).every(r => r.greyed && r.unchanged && r.back);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'keepnext_menu_row_follows_the_language_label_name_and_reason',
    description: 'La ligne du menu, son nom accessible et la raison de son grisage suivent la langue de l\'interface (« Keep with next » en anglais), y compris quand la langue change pendant que la ligne est grisée',
    run: async (h) => {
      const lang = I18n.getLang();
      const out = {};
      try {
        for (const code of ['fr', 'en']) {
          I18n.setLang(code);
          await setDoc(h, '<table><tbody><tr><td><p>Dd</p></td></tr></tbody></table><p>Ee</p>');
          await cursorIn('Ee');
          const free = { label: row().textContent.trim(), aria: row().getAttribute('aria-label') };
          await cursorIn('Dd');
          const greyedTitle = row().title;
          I18n.setLang(code === 'fr' ? 'en' : 'fr');
          await sleep(150);
          const switched = row().title;
          I18n.setLang(code);
          await sleep(150);
          out[code] = { free, greyedTitle, switchedTitle: switched, backTitle: row().title };
        }
      } finally { I18n.setLang(lang); }
      const pass = out.fr.free.label === 'Garder avec le suivant' && out.fr.free.aria === 'Garder avec le suivant : le paragraphe reste sur la même page que le bloc qui le suit'
        && out.en.free.label === 'Keep with next' && out.en.free.aria === 'Keep with next: the paragraph stays on the same page as the block that follows it'
        && out.fr.greyedTitle.indexOf('Seulement pour les paragraphes du texte') === 0 && out.en.greyedTitle.indexOf('Only for text paragraphs') === 0
        && out.fr.switchedTitle === out.en.greyedTitle && out.en.switchedTitle === out.fr.greyedTitle && out.fr.backTitle === out.fr.greyedTitle && out.en.backTitle === out.en.greyedTitle;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'keepnext_in_track_changes_the_setting_is_a_tracked_modification_accept_all_keeps_it_refusing_it_removes_it',
    description: 'Suivi des modifications actif : poser le réglage est une modification suivie du paragraphe (comme l\'alignement) ; « Tout accepter » la garde, « Refuser » de la barre flottante (la modification que la sélection touche) rend le document d\'origine, sans erreur. (« Tout refuser » sur ces réglages seuls est dans le groupe trackChanges, cas trackchanges_reject_all_*, sous un garde-fou : il ne se termine pas sur l\'ancien code.)',
    run: async (h) => {
      const errors = [];
      const onError = e => errors.push(String(e.message || e));
      window.addEventListener('error', onError);
      const out = {};
      try {
        for (const verdict of ['accept', 'reject']) {
          await setDoc(h, '<p>Aa</p><p>Bb</p>');
          const original = Editor.getHTML();
          if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
          await cursorIn('Bb');
          await press();
          const tracked = { list: keepList(), pending: Editor.hasPendingTrackedChanges() };
          if (verdict === 'accept') await h.clickButton('v2-btn-accept-all');
          else ed().commands.rejectSuggestionsAtSelection();
          await sleep(300);
          out[verdict] = { original, tracked, list: keepList(), html: Editor.getHTML(), pendingAfter: Editor.hasPendingTrackedChanges() };
          if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        }
      } finally {
        window.removeEventListener('error', onError);
        if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      }
      const pass = out.accept.tracked.list === 'Aa|Bb*' && out.accept.tracked.pending && out.accept.list === 'Aa|Bb*' && !/<ins|<del|data-type="modification"/.test(out.accept.html)
        && out.reject.tracked.pending && out.reject.list === 'Aa|Bb' && out.reject.html === out.reject.original && !out.accept.pendingAfter && !out.reject.pendingAfter && errors.length === 0;
      return { pass, notes: JSON.stringify({ out, errors }) };
    },
  });

  // === 2) L'éditeur et la Lecture : la suite passe d'un seul tenant à la page suivante ==============================================================================
  const intro = n => Array.from({ length: n }, (_, i) => '<p>Introduction ' + i + '</p>').join('');
  const token = (rowNumber, line) => 'R' + String(rowNumber).padStart(2, '0') + 'L' + line;
  const tableOf = rows => '<table><tbody>' + Array.from({ length: rows }, (_, i) => '<tr><td><p>' + token(i, 0) + '</p></td><td><p>Valeur ' + i + '</p></td></tr>').join('') + '</tbody></table>';
  const zoomOf = el => {
    const sheet = el.closest('.v2-page-sheet, .reader-content');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / zoomOf(el);
  const topLevel = root => Array.from(root.children).filter(k => k.tagName !== 'STYLE');
  const pageHeightPx = () => PageLayout.getPageSizePx().height;
  function setPageContentHeight(contentPx) {
    const halfMm = (pageHeightPx() - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }
  function restoreLayout() {
    PageLayout.setMarginsMm(null);
    ['editor-container', 'reader-container'].forEach(id => document.getElementById(id).style.removeProperty('--pp-fit-zoom'));
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const labelOf = el => {
    if (el.classList.contains('conditional-text')) return 'COND:' + el.querySelector('p').textContent.trim();
    return el.querySelector('img') ? 'IMG' : (el.hasAttribute('data-caption') ? 'CAPTION:' + el.textContent.trim() : el.textContent.trim());
  };
  // Ce qui ouvre la page 2 : le premier bloc (ou la première ligne d'un tableau, « ROW:R07L0 ») dont le texte est sous la première bande de saut de page.
  function firstOnPage2(containerSelector, root) {
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band'));
    if (!bands.length) return { bands: 0, first: null };
    const bandBottom = bands[0].getBoundingClientRect().bottom;
    const items = [];
    topLevel(root).forEach(el => {
      if (el.classList.contains('tableWrapper') || el.tagName === 'TABLE') {
        Array.from(el.querySelectorAll('tbody > tr')).forEach(tr => items.push({ target: tr.querySelector('p'), label: 'ROW:' + tr.querySelector('p').textContent.trim() }));
      } else {
        items.push({ target: el, label: labelOf(el) });
      }
    });
    const at = items.findIndex(it => it.target.getBoundingClientRect().top >= bandBottom - 1);
    return { bands: bands.length, first: at >= 0 ? items[at].label : null };
  }
  async function loadPaged(h, html) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    Editor.setHTML(html);
    await sleep(450);
  }
  // Charge `html`, règle la page à la hauteur que `editorHeight(kids)` calcule sur les blocs mesurés de l'éditeur (`readerHeight(kids)` sur ceux de la Lecture, qui défait les blocs conditionnels :
  // par défaut la même), puis lit ce qui ouvre la page 2 dans l'éditeur et dans la Lecture : les deux doivent s'accorder.
  async function pagedEditorAndReader(h, html, editorHeight, readerHeight) {
    await loadPaged(h, html);
    const savedHtml = Editor.getHTML();
    const editorPx = editorHeight(topLevel(h.tiptap()));
    const probe = await h.renderReaderMode(savedHtml);
    await sleep(450);
    const readerPx = readerHeight ? readerHeight(topLevel(probe)) : editorPx;
    setPageContentHeight(editorPx);
    Editor.refreshPaginationPreview();
    await sleep(450);
    const editor = firstOnPage2('#editor-container', h.tiptap());
    const unchanged = Editor.getHTML() === savedHtml;
    setPageContentHeight(readerPx);
    const wrapper = await h.renderReaderMode(savedHtml);
    await sleep(450);
    const reader = firstOnPage2('#reader-container', wrapper);
    return { contentPx: Math.round(editorPx), editor, reader, unchanged };
  }
  const sumHeights = kids => kids.reduce((sum, el) => sum + layoutHeight(el), 0);
  const indexOfText = (kids, text) => kids.findIndex(k => k.textContent.indexOf(text) !== -1);
  const indexOfImage = kids => kids.findIndex(k => k.querySelector('img'));

  cases.push({
    id: 'keepnext_editor_and_reader_move_the_whole_run_to_the_next_page_with_the_block_that_follows',
    description: 'Éditeur et Lecture : trois lignes de totaux gardées et « Arrêté… » qui les suit : quand la page se termine au milieu de la troisième ligne, puis au milieu d\'« Arrêté… », la suite entière (« Total 1 » en tête) ouvre la page 2 (avant : la coupure tombait au milieu des totaux, « Arrêté… » seul ou deux totaux sur la page 2) ; le document enregistré n\'est pas modifié',
    run: async (h) => {
      try {
        const html = intro(8) + KEPT('Total 1') + KEPT('Total 2') + KEPT('Total 3') + '<p>Arrêté 1</p><p>Après</p>';
        const insideRun = await pagedEditorAndReader(h, html, kids => sumHeights(kids.slice(0, indexOfText(kids, 'Total 3'))) + layoutHeight(kids[indexOfText(kids, 'Total 3')]) / 2);
        const atTarget = await pagedEditorAndReader(h, html, kids => sumHeights(kids.slice(0, indexOfText(kids, 'Arrêté 1'))) + layoutHeight(kids[indexOfText(kids, 'Arrêté 1')]) / 2);
        const pass = insideRun.editor.bands === 1 && insideRun.editor.first === 'Total 1' && insideRun.reader.bands === 1 && insideRun.reader.first === 'Total 1' && insideRun.unchanged
          && atTarget.editor.bands === 1 && atTarget.editor.first === 'Total 1' && atTarget.reader.bands === 1 && atTarget.reader.first === 'Total 1' && atTarget.unchanged;
        return { pass, notes: JSON.stringify({ insideRun, atTarget }) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'keepnext_editor_and_reader_keep_the_members_together_even_when_nothing_follows_them',
    description: 'Éditeur et Lecture : deux paragraphes gardés à la fin du texte, que rien ne suit (ou que suit un saut de page) : ils restent ensemble, la page 2 s\'ouvre sur le premier quand le second ne tient plus',
    run: async (h) => {
      try {
        const tail = intro(8) + KEPT('Fin 1') + KEPT('Fin 2');
        const atEnd = await pagedEditorAndReader(h, tail, kids => sumHeights(kids.slice(0, indexOfText(kids, 'Fin 2'))) + layoutHeight(kids[indexOfText(kids, 'Fin 2')]) / 2);
        const beforeBreak = await pagedEditorAndReader(h, tail + PAGE_BREAK + '<p>Suite</p>', kids => sumHeights(kids.slice(0, indexOfText(kids, 'Fin 2'))) + layoutHeight(kids[indexOfText(kids, 'Fin 2')]) / 2);
        const pass = atEnd.editor.bands === 1 && atEnd.editor.first === 'Fin 1' && atEnd.reader.bands === 1 && atEnd.reader.first === 'Fin 1'
          && beforeBreak.editor.first === 'Fin 1' && beforeBreak.reader.first === 'Fin 1';
        return { pass, notes: JSON.stringify({ atEnd, beforeBreak }) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'keepnext_editor_and_reader_change_nothing_when_all_fits_or_the_run_is_taller_than_a_page_or_a_single_line_has_no_follower',
    description: 'Éditeur et Lecture : rien ne change quand tout tient dans la page (aucune coupure), pour une suite plus haute que 90 % d\'une page (rien à garder : le PDF ne le pourrait pas, la coupure tombe dans la suite comme avant), pour un seul paragraphe gardé que suit un saut de page ou que rien ne suit, ni pour des lignes vides de fin',
    run: async (h) => {
      try {
        const out = {};
        // 1) tout tient, à 6 px près
        const fits = await pagedEditorAndReader(h, intro(8) + KEPT('Total 1') + KEPT('Total 2') + '<p>Arrêté 1</p><p>Après</p>', kids => sumHeights(kids) + 6);
        out.fits = [fits.editor.bands, fits.reader.bands];
        // 2) une suite de douze lignes gardées sur une page qui n'en tient que sept : la coupure tombe dans la suite, entre « Ligne 06 » et « Ligne 07 »
        const long = Array.from({ length: 12 }, (_, i) => KEPT('Ligne ' + String(i).padStart(2, '0'))).join('');
        const tall = await pagedEditorAndReader(h, '<p>Avant</p>' + long + '<p>Arrêté 1</p>', kids => sumHeights(kids.slice(0, indexOfText(kids, 'Ligne 06'))) + layoutHeight(kids[indexOfText(kids, 'Ligne 06')]) / 2);
        out.tall = { editor: tall.editor.first, reader: tall.reader.first };
        // 3) un seul paragraphe gardé que suit un saut de page : il reste sur la page 1 (la page 2 s'ouvre sur le saut)
        const broken = await pagedEditorAndReader(h, intro(8) + KEPT('Seul') + PAGE_BREAK + '<p>Suite</p>', kids => sumHeights(kids) + 400);
        out.broken = { bands: broken.editor.bands, editorFirst: broken.editor.first, readerFirst: broken.reader.first };
        // 4) un seul paragraphe gardé en fin de texte, suivi de lignes vides : rien à garder, aucune page de plus
        const blank = await pagedEditorAndReader(h, intro(8) + KEPT('Seul') + '<p></p><p></p>', kids => sumHeights(kids.slice(0, indexOfText(kids, 'Seul') + 1)) + 4);
        out.blankTail = blank.editor.bands + blank.reader.bands;
        const pass = out.fits[0] === 0 && out.fits[1] === 0 && out.tall.editor === 'Ligne 06' && out.tall.reader === 'Ligne 06'
          && out.broken.bands === 1 && out.broken.editorFirst !== 'Seul' && out.broken.readerFirst !== 'Seul' && out.blankTail === 0;
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'keepnext_editor_and_reader_keep_the_run_with_the_first_row_of_a_table',
    description: 'Éditeur et Lecture : un paragraphe gardé que suit un tableau reste avec sa première ligne : quand la première ligne ne tient plus sous lui, c\'est le paragraphe qui passe à la page 2 avec elle (avant : le paragraphe restait seul en bas de la page 1) ; le tableau se coupe ensuite comme avant, entre deux lignes',
    run: async (h) => {
      try {
        const html = intro(6) + KEPT('Détail des lignes') + tableOf(8) + '<p>Après</p>';
        const rowHeight = kids => layoutHeight(kids[indexOfText(kids, token(0, 0))].querySelector('tbody > tr, tr'));
        const got = await pagedEditorAndReader(h, html, kids => sumHeights(kids.slice(0, indexOfText(kids, 'Détail des lignes') + 1)) + rowHeight(kids) / 2,
          kids => sumHeights(kids.slice(0, indexOfText(kids, 'Détail des lignes') + 1)) + rowHeight(kids) / 2);
        // Le tableau (huit lignes) ne tient pas sur la page 2 avec le paragraphe : il s'y coupe de nouveau, une deuxième bande est normale ; ce qui compte est ce qui ouvre la page 2.
        const pass = got.editor.bands >= 1 && got.editor.first === 'Détail des lignes' && got.reader.bands >= 1 && got.reader.first === 'Détail des lignes' && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'keepnext_editor_and_reader_keep_the_run_with_an_image_and_its_caption',
    description: 'Éditeur et Lecture : un paragraphe gardé que suit une image et sa légende : quand l\'image tient mais pas sa légende, le paragraphe passe à la page 2 avec l\'image et sa légende (avant : l\'image partait avec sa légende et laissait le paragraphe seul en bas de la page 1)',
    run: async (h) => {
      try {
        const html = intro(6) + KEPT('Avant l\'image') + '<p>' + image() + '</p>' + CAP('Figure un') + '<p>Après</p>';
        const got = await pagedEditorAndReader(h, html, kids => {
          const at = indexOfImage(kids);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        const pass = got.editor.bands === 1 && got.editor.first === 'Avant l\'image' && got.reader.bands === 1 && got.reader.first === 'Avant l\'image' && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'keepnext_invoice_totals_with_conditional_blocks_stay_together_in_the_editor_and_in_the_reader',
    description: 'Les totaux d\'une facture (lignes ordinaires et blocs de texte conditionnel, « Arrêté à la somme de » en dernier) : dans l\'éditeur, où chaque bloc conditionnel est une boîte, et dans la Lecture, où il est défait, la page qui se termine au milieu des totaux passe tous les totaux à la page 2 (avant : « Arrêté… » ou deux lignes de totaux seuls en haut de la page 2)',
    run: async (h) => {
      try {
        const html = intro(6) + KEPT('Total HT') + COND(KEPT('Remise')) + COND(KEPT('TVA 20')) + KEPT('Total TTC') + '<p>Arrêté à la somme de</p><p>Après</p>';
        const editorHeight = kids => sumHeights(kids.slice(0, kids.findIndex(k => k.textContent.indexOf('TVA 20') !== -1))) + layoutHeight(kids.find(k => k.textContent.indexOf('TVA 20') !== -1)) / 2;
        const readerHeight = kids => sumHeights(kids.slice(0, indexOfText(kids, 'TVA 20'))) + layoutHeight(kids[indexOfText(kids, 'TVA 20')]) / 2;
        const got = await pagedEditorAndReader(h, html, editorHeight, readerHeight);
        const pass = got.editor.bands === 1 && got.editor.first === 'Total HT' && got.reader.bands === 1 && got.reader.first === 'Total HT' && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  // === 3) Les exports ===================================================================================================================================================
  // --- PDF : lu par pdf.js ---
  const PDF_MARGIN_PT = 28;
  async function pdfAt(h, html, bottomPt) {
    const result = await h.exportPdfContent(html, null, { top: PDF_MARGIN_PT, right: PDF_MARGIN_PT, bottom: bottomPt, left: PDF_MARGIN_PT });
    return { result, gt: await h.extractPdfGroundTruth(result.base64) };
  }
  const pageOfText = (gt, str) => { let found = -1; gt.pages.forEach((page, p) => page.textItems.forEach(it => { if (found < 0 && it.str === str) found = p; })); return found; };
  const yOfText = (gt, str) => { let found = null; gt.pages.forEach(page => page.textItems.forEach(it => { if (found == null && it.str === str) found = it.y; })); return found; };
  const introLines = n => Array.from({ length: n }, (_, i) => '<p>INTRO' + String(i).padStart(2, '0') + '</p>').join('');
  // Le nombre de lignes d'introduction qui amène la dernière ligne du document (`tail`) juste au-dessus du bas de la page 1, et ce que le PDF y mesure : l'écart entre deux lignes, la page, la base de
  // la dernière ligne (`tailY`) et celle de la première de la suite (`headY`).
  async function packedNearBottom(h, makeHtml, tail, head) {
    const probe = await pdfAt(h, makeHtml(10), PDF_MARGIN_PT);
    const introY = i => yOfText(probe.gt, 'INTRO' + String(i).padStart(2, '0'));
    const pitch = (introY(9) - introY(0)) / 9;
    const pageHeight = probe.gt.pages[0].height;
    let n = 10 + Math.max(0, Math.floor((pageHeight - PDF_MARGIN_PT - 6 - yOfText(probe.gt, tail)) / pitch));
    for (let tries = 0; tries < 6; tries++) {
      const packed = await pdfAt(h, makeHtml(n), PDF_MARGIN_PT);
      if (pageOfText(packed.gt, tail) === 0) return { n, pitch, pageHeight, tailY: yOfText(packed.gt, tail), headY: yOfText(packed.gt, head) };
      n--;
    }
    throw new Error('La dernière ligne repérée ne tient pas sur la page 1, même avec moins d\'introduction');
  }
  // Balaie la marge du bas de 2 pt en 2 pt, de l'endroit où la dernière ligne du document ne tient plus sur la page 1 à celui où même la première de la suite n'y tient plus.
  async function sweepBottomMargin(h, makeHtml, packed, tokens) {
    const from = Math.floor(packed.pageHeight - packed.tailY - 16);
    const to = Math.ceil(packed.pageHeight - packed.headY + 4);
    const samples = [];
    for (let bottom = from; bottom <= to; bottom += 2) {
      const { gt } = await pdfAt(h, makeHtml(packed.n), bottom);
      samples.push({ bottom, pages: gt.pages.length, empty: gt.pages.filter(pg => !pg.textItems.length && !pg.images.length).length, tokens: tokens.map(t => pageOfText(gt, t)) });
    }
    return samples;
  }
  const verdictOfSweep = (samples, maxPages) => {
    const together = samples.every(s => s.tokens.every(p => p === s.tokens[0]) && s.tokens[0] >= 0);
    const onFirst = samples.filter(s => s.tokens[0] === 0).length;
    const onSecond = samples.filter(s => s.tokens[0] === 1).length;
    const clean = samples.every(s => s.empty === 0 && s.pages <= (maxPages || 3));
    return { together, onFirst, onSecond, clean };
  };

  const chainHtml = n => introLines(n) + KEPT('TOT1') + KEPT('TOT2') + KEPT('TOT3') + '<p>ARRETE</p><p>Après</p>';
  cases.push({
    id: 'keepnext_pdf_the_run_and_the_block_that_follows_are_always_on_the_same_page',
    description: 'PDF (lu par pdf.js) : quelle que soit la marge du bas, les trois lignes de totaux gardées et « ARRETE » qui les suit sont sur la même page ; quand « ARRETE » ne tient plus en bas de la page 1, toute la suite passe à la page 2 (avant : « ARRETE » ou une partie des totaux ouvrait la page 2 seule) ; aucune page blanche, rien de perdu',
    run: async (h) => {
      await h.resetEditor();
      const packed = await packedNearBottom(h, chainHtml, 'Après', 'TOT1');
      const samples = await sweepBottomMargin(h, chainHtml, packed, ['TOT1', 'TOT2', 'TOT3', 'ARRETE']);
      const v = verdictOfSweep(samples);
      const pass = samples.length >= 5 && v.together && v.onFirst >= 2 && v.onSecond >= 3 && v.clean;
      return { pass, notes: JSON.stringify({ packed, v, samples: samples.map(s => [s.bottom, s.tokens.join('')]) }) };
    },
  });

  const tableChainHtml = n => introLines(n) + KEPT('TOT1') + KEPT('TOT2') + tableOf(4) + '<p>Après</p>';
  cases.push({
    id: 'keepnext_pdf_the_run_stays_with_the_first_row_of_the_table_that_follows',
    description: 'PDF (lu par pdf.js) : deux paragraphes gardés que suit un tableau restent avec sa première ligne, quelle que soit la marge du bas (le tableau se coupe ensuite comme avant, entre deux lignes) ; aucune page blanche, aucune ligne perdue',
    run: async (h) => {
      await h.resetEditor();
      const first = token(0, 0);
      const packed = await packedNearBottom(h, tableChainHtml, 'Après', 'TOT1');
      const samples = await sweepBottomMargin(h, tableChainHtml, packed, ['TOT1', 'TOT2', first]);
      const v = verdictOfSweep(samples);
      const pass = samples.length >= 5 && v.together && v.onFirst >= 2 && v.onSecond >= 3 && v.clean;
      return { pass, notes: JSON.stringify({ packed, v, samples: samples.map(s => [s.bottom, s.tokens.join('')]) }) };
    },
  });

  const headedTableChainHtml = n => introLines(n) + KEPT('TOT1') + KEPT('TOT2')
    + '<table><tbody><tr><th><p>Entête</p></th><th><p>Valeur</p></th></tr>' + Array.from({ length: 60 }, (_, i) => '<tr><td><p>' + token(i, 0) + '</p></td><td><p>Valeur ' + i + '</p></td></tr>').join('') + '</tbody></table><p>Après</p>';
  cases.push({
    id: 'keepnext_pdf_the_run_stays_with_a_table_that_has_a_header_row',
    description: 'PDF (lu par pdf.js) : deux paragraphes gardés que suit un tableau de soixante lignes à ligne de titres (qui se poursuit sur deux pages, titres repris en haut de chacune) restent avec ses titres et sa première ligne, quelle que soit la marge du bas (pdfmake reprend la ligne de titres en haut de chaque page : sa page ne dit pas où le tableau commence) ; aucune page blanche, aucune ligne perdue',
    run: async (h) => {
      await h.resetEditor();
      const first = token(0, 0);
      const packed = await packedNearBottom(h, headedTableChainHtml, first, 'TOT1');
      const samples = await sweepBottomMargin(h, headedTableChainHtml, packed, ['TOT1', 'TOT2', 'Entête', first]);
      const v = verdictOfSweep(samples, 4);
      const pass = samples.length >= 5 && v.together && v.onFirst >= 2 && v.onSecond >= 3 && v.clean;
      return { pass, notes: JSON.stringify({ packed, v, samples: samples.map(s => [s.bottom, s.tokens.join('')]) }) };
    },
  });

  const calloutChainHtml = n => introLines(n) + KEPT('TOT1') + KEPT('TOT2') + '<div class="callout" data-color="blue" data-icon="info"><p>ENC1</p><p>ENC2</p></div><p>Après</p>';
  cases.push({
    id: 'keepnext_pdf_the_run_stays_with_the_callout_that_follows',
    description: 'PDF (lu par pdf.js) : deux paragraphes gardés que suit un encadré restent avec sa première ligne, quelle que soit la marge du bas ; aucune page blanche, aucune ligne perdue',
    run: async (h) => {
      await h.resetEditor();
      const packed = await packedNearBottom(h, calloutChainHtml, 'Après', 'TOT1');
      const samples = await sweepBottomMargin(h, calloutChainHtml, packed, ['TOT1', 'TOT2', 'ENC1']);
      const v = verdictOfSweep(samples);
      const pass = samples.length >= 5 && v.together && v.onFirst >= 2 && v.onSecond >= 3 && v.clean;
      return { pass, notes: JSON.stringify({ packed, v, samples: samples.map(s => [s.bottom, s.tokens.join('')]) }) };
    },
  });

  cases.push({
    id: 'keepnext_pdf_hook_exists_only_for_a_run_that_fits_in_a_page',
    description: 'PDF : le rappel pageBreakBefore n\'existe que s\'il y a une suite de paragraphes gardés (ou un paragraphe gardé et le bloc qui le suit) qui tient dans 90 % d\'une page : sans réglage, pour un seul paragraphe gardé en fin de texte ou pour une suite plus haute que la page, il n\'y en a pas',
    run: async (h) => {
      await h.resetEditor();
      const hook = async html => typeof (await h.exportPdfContent(html)).docDefinition.pageBreakBefore;
      const long = Array.from({ length: 90 }, (_, i) => KEPT('Ligne ' + i)).join('');
      const got = {
        none: await hook('<p>Avant</p><p>Un</p><p>Deux</p>'),
        run: await hook('<p>Avant</p>' + KEPT('Un') + KEPT('Deux') + '<p>Trois</p>'),
        pair: await hook('<p>Avant</p>' + KEPT('Un') + '<p>Deux</p>'),
        alone: await hook('<p>Avant</p><p>Un</p>' + KEPT('Seul')),
        tooTall: await hook('<p>Avant</p>' + long + '<p>Fin</p>'),
        beforeBreak: await hook('<p>Avant</p>' + KEPT('Seul') + PAGE_BREAK + '<p>Suite</p>'),
      };
      const pass = got.none === 'undefined' && got.run === 'function' && got.pair === 'function' && got.alone === 'undefined' && got.tooTall === 'undefined' && got.beforeBreak === 'undefined';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // --- Word ---
  cases.push({
    id: 'keepnext_docx_keep_next_is_on_the_kept_paragraphs_of_the_text_and_nowhere_else',
    description: 'Word (OOXML dézippé) : « Conserver avec le suivant » (w:keepNext) sur chaque paragraphe gardé du texte courant, jamais sur le bloc qui les suit, sur un paragraphe ordinaire, ni sur un paragraphe d\'une case de tableau ou d\'une liste (le réglage n\'y vaut pas) ; une suite de plusieurs paragraphes les porte tous',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Avant</p>' + KEPT('Total HT') + KEPT('Total TTC') + '<p>Arrêté</p>'
        + '<table><tbody><tr><td>' + KEPT('En case') + '</td></tr></tbody></table>'
        + '<ul><li>' + KEPT('En liste') + '</li></ul>'
        + KEPT('Dernier') + '<p>Après</p>';
      const out = await h.exportDocxParts(html);
      const keepNext = p => !!p.getElementsByTagName('w:pPr')[0] && p.getElementsByTagName('w:pPr')[0].getElementsByTagName('w:keepNext').length > 0;
      const textOf = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const paragraphs = Array.from(out.doc.getElementsByTagName('w:p')).map(p => ({ text: textOf(p), keep: keepNext(p) }));
      const keepOf = text => (paragraphs.find(p => p.text.includes(text)) || { keep: 'absent' }).keep;
      const got = { before: keepOf('Avant'), htTotal: keepOf('Total HT'), ttcTotal: keepOf('Total TTC'), follower: keepOf('Arrêté'), inCell: keepOf('En case'), inList: keepOf('En liste'), last: keepOf('Dernier'), after: keepOf('Après') };
      const pass = got.before === false && got.htTotal === true && got.ttcTotal === true && got.follower === false && got.inCell === false && got.inList === false && got.last === true && got.after === false;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.keepNext = cases;
})();
