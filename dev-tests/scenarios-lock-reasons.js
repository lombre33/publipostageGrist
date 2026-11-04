// Suite "lockReasons" - la raison d'un grisé (js/lock-reasons.js). Audit UI/UX du 04/11, carte « Faire dire pourquoi un bouton ou une ligne est grisé ? », réponse : « Oui, au survol et au clic ».
//
// Un bouton, un groupe ou une ligne de menu grisé dit POURQUOI : son `title` (le survol) est la raison, et son clic - arrêté en capture, avant tout gestionnaire - l'écrit dans le coin d'état, comme la lecture d'un PDF
// (js/main.js:applyPdfLocks). Ces cas jouent la raison de chaque mode (email, macro-modèle, grille, en-tête, Lecture), les menus (Page, Type d'export), les boutons `disabled` du navigateur (qui ne reçoivent aucun clic :
// leur info-bulle seule), Réglages > Raccourcis, et les deux pièges du mécanisme : l'appui sur la police grisée n'ouvre pas son volet, le groupe grisé n'ouvre pas son menu au survol (aria-expanded reste « false »).
// Les droits par personne (lecture seule) et la souris réelle à 700 x 400 : le script Node verify-lock-reasons-mouse.mjs (groupe lockReasonsMouse).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const byId = id => document.getElementById(id);
  const say = () => byId('status-msg').textContent.trim();
  const clearSaid = () => { byId('status-msg').textContent = ''; };
  const titleOf = id => { const el = byId(id); return el ? el.getAttribute('title') : null; };
  const blocks = id => { const el = byId(id); return !!el && el.hasAttribute('data-pp-lock-blocks'); };

  async function goToNewDocument(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(250);
  }
  async function goToNewEmail(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-email');
    await sleep(250);
  }
  async function goToNewGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(300);
  }
  async function goToNewMacro(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-macro');
    await sleep(200);
    byId('macro-editor-name').value = 'Macro des raisons';
    byId('macro-editor-save').click();
    await sleep(400);
  }
  // Les volets ouverts de force par h.openFlyout gardent leurs styles : rendus au CSS.
  function closeForced(selector) {
    const flyout = document.querySelector(selector + ' .v2-hover-flyout');
    if (flyout) { flyout.style.display = ''; flyout.style.opacity = ''; flyout.style.visibility = ''; flyout.style.pointerEvents = ''; }
  }

  // Ce que la barre grise en email (js/main-toolbar.js:syncLocks, groupe « mailOrMacro » puis les lignes propres à l'email).
  const EMAIL_IDS = ['v2-btn-bold', 'v2-btn-italic', 'v2-btn-underline', 'v2-btn-strike', 'v2-heading-group', 'v2-align-group', 'v2-size-stepper', 'v2-font-chip', 'v2-text-color-split', 'v2-highlight-split',
    'v2-painter-group', 'v2-btn-table', 'v2-btn-two-columns', 'v2-image-group', 'v2-btn-toc', 'v2-btn-page-break', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-chart', 'v2-btn-chart-make', 'v2-btn-qr', 'v2-btn-slide-text'];

  cases.push({
    id: 'lock_reasons_module_says_the_most_general_cause_and_hands_the_title_back',
    description: 'LockReasons : un contrôle grisé par plusieurs causes dit la plus générale (droits, PDF, mode, grille, tableau lié, puis ce qui explique, enfin un bouton désactivé), n\'arrête le clic que pour les cinq premières, et rend à son dégrisé le `title` qu\'il avait',
    run: async () => {
      const el = document.createElement('button');
      el.setAttribute('title', 'Titre d’origine');
      document.body.appendChild(el);
      const read = () => ({ title: el.getAttribute('title'), reason: el.getAttribute('data-pp-lock-reason'), blocks: el.hasAttribute('data-pp-lock-blocks') });
      const steps = {};
      try {
        LockReasons.set(el, 'state', 'raison état');
        steps.state = read();
        LockReasons.set(el, 'explain', 'raison explication');
        steps.explain = read();
        LockReasons.set(el, 'mode', 'raison mode');
        steps.mode = read();
        LockReasons.set(el, 'access', 'raison droits');
        steps.access = read();
        LockReasons.set(el, 'access', '');
        steps.backToMode = read();
        LockReasons.set(el, 'mode', '');
        steps.backToExplain = read();
        LockReasons.set(el, 'explain', '');
        LockReasons.set(el, 'state', '');
        steps.none = read();
      } finally { el.remove(); }
      const pass = steps.state.title === 'raison état' && !steps.state.blocks
        && steps.explain.title === 'raison explication' && !steps.explain.blocks
        && steps.mode.title === 'raison mode' && steps.mode.blocks
        && steps.access.title === 'raison droits' && steps.access.reason === 'raison droits' && steps.access.blocks
        && steps.backToMode.title === 'raison mode' && steps.backToMode.blocks
        && steps.backToExplain.title === 'raison explication' && !steps.backToExplain.blocks
        && steps.none.title === 'Titre d’origine' && steps.none.reason === null && !steps.none.blocks;
      return { pass, notes: JSON.stringify(steps) };
    },
  });

  cases.push({
    id: 'lock_reasons_email_controls_say_why_on_hover_and_click_and_give_it_back',
    description: 'Un modèle email grise la mise en forme, le tableau, l\'image, le sommaire, le saut de page, l\'encadré, la signature, le graphique et le QR code : chacun a pour info-bulle la raison de l\'email, son clic la dit dans le coin d\'état et ne fait rien (le document ne bouge pas) ; en repassant à un document, ils n\'ont plus de raison et retrouvent leur info-bulle d\'avant',
    run: async (h) => {
      await h.resetEditor();
      await goToNewDocument(h);
      const before = Object.fromEntries(EMAIL_IDS.map(id => [id, titleOf(id)]));
      const quietInDocument = EMAIL_IDS.filter(id => blocks(id));
      await goToNewEmail(h);
      const reason = I18n.t('lock.email');
      const silent = EMAIL_IDS.filter(id => titleOf(id) !== reason || byId(id).getAttribute('data-pp-lock-reason') !== reason || !blocks(id));
      Editor.setHTML('<p>Bonjour</p>');
      await sleep(60);
      const docBefore = Editor.getHTML();
      clearSaid();
      byId('v2-btn-bold').click();
      const saidByBold = say();
      clearSaid();
      byId('v2-btn-table').click();
      const saidByTable = say();
      const docAfter = Editor.getHTML();
      // Un contrôle qu'un email laisse actif ne dit rien.
      const activeQuiet = ['v2-btn-undo', 'v2-btn-link', 'v2-btn-insert-variable'].filter(id => blocks(id) || byId(id).hasAttribute('data-pp-lock-reason'));
      await goToNewDocument(h);
      const stuck = EMAIL_IDS.filter(id => blocks(id) || titleOf(id) !== before[id]);
      const pass = quietInDocument.length === 0 && silent.length === 0 && saidByBold === reason && saidByTable === reason && docAfter === docBefore && activeQuiet.length === 0 && stuck.length === 0;
      return { pass, notes: JSON.stringify({ quietInDocument, silent, saidByBold, saidByTable, unchangedDoc: docAfter === docBefore, activeQuiet, stuck }) };
    },
  });

  cases.push({
    id: 'lock_reasons_email_en_says_the_english_reason',
    lang: 'en',
    description: 'La page qui démarre en anglais : la raison d\'un bouton grisé par l\'email est le texte anglais, au survol et au clic',
    run: async (h) => {
      await h.resetEditor();
      await goToNewEmail(h);
      const reason = I18n.t('lock.email');
      clearSaid();
      byId('v2-btn-bold').click();
      const said = say();
      const title = titleOf('v2-btn-bold');
      await goToNewDocument(h);
      const pass = I18n.getLang() === 'en' && /^Unavailable in an email template/.test(reason) && title === reason && said === reason && !blocks('v2-btn-bold');
      return { pass, notes: JSON.stringify({ lang: I18n.getLang(), title, said }) };
    },
  });

  cases.push({
    id: 'lock_reasons_email_font_press_and_group_menus_stay_shut',
    description: 'Un email grise la police et le groupe Titre : l\'appui sur la police n\'ouvre pas son volet (il s\'ouvre à l\'appui, avant le clic), le survol réel du groupe Titre n\'ouvre pas son menu et laisse aria-expanded à « false » ; l\'appui sur un bouton grisé (Gras) n\'est pas annulé (`preventDefault`) : la souris lui fait perdre le focus à l\'éditeur comme avant le grisé, faute de quoi la barre flottante d\'un tableau ne revient pas au clic suivant dans la même case ; en document, les deux s\'ouvrent',
    run: async (h) => {
      const press = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      const enter = el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
      const leave = el => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      const probe = () => {
        const chip = byId('v2-font-chip');
        press(chip);
        const fontOpen = chip.getAttribute('aria-expanded') === 'true';
        press(chip); // referme ce qui s'est ouvert
        const heading = byId('v2-heading-chip');
        enter(heading);
        h.openFlyout('#v2-heading-group');
        const flyout = byId('v2-heading-flyout');
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        byId('v2-btn-bold').dispatchEvent(down);
        const out = { fontOpen, headingExpanded: heading.getAttribute('aria-expanded') === 'true', flyoutDisplay: getComputedStyle(flyout).display, boldPressCancelled: down.defaultPrevented };
        leave(heading);
        closeForced('#v2-heading-group');
        return out;
      };
      await h.resetEditor();
      await goToNewDocument(h);
      const inDocument = probe();
      await goToNewEmail(h);
      const inEmail = probe();
      await goToNewDocument(h);
      const pass = inDocument.fontOpen && inDocument.headingExpanded && inDocument.flyoutDisplay !== 'none' && !inEmail.fontOpen && !inEmail.headingExpanded && inEmail.flyoutDisplay === 'none' && !inEmail.boldPressCancelled;
      return { pass, notes: JSON.stringify({ inDocument, inEmail }) };
    },
  });

  cases.push({
    id: 'lock_reasons_macro_template_says_macro_and_keeps_undo_free',
    description: 'Un macro-modèle grise le texte, la recherche, le suivi des modifications et le menu « Lien et blocs » : la raison est celle du macro-modèle ; Annuler et Rétablir restent actifs et muets',
    run: async (h) => {
      await h.resetEditor();
      await goToNewMacro(h);
      const reason = I18n.t('lock.macro');
      const ids = ['v2-btn-bold', 'v2-heading-group', 'v2-btn-table', 'v2-btn-find', 'v2-btn-track-changes', 'v2-blocks-group', 'v2-collab-group', 'v2-btn-superscript', 'v2-btn-insert-variable', 'v2-btn-comment'];
      const silent = ids.filter(id => titleOf(id) !== reason || !blocks(id));
      clearSaid();
      byId('v2-btn-find').click();
      const said = say();
      const undoQuiet = ['v2-btn-undo', 'v2-btn-redo'].filter(id => blocks(id) || byId(id).hasAttribute('data-pp-lock-reason'));
      await goToNewDocument(h);
      const stuck = ids.filter(id => blocks(id) && titleOf(id) === reason);
      const pass = silent.length === 0 && said === reason && undoQuiet.length === 0 && stuck.length === 0;
      return { pass, notes: JSON.stringify({ silent, said, undoQuiet, stuck }) };
    },
  });

  cases.push({
    id: 'lock_reasons_grid_says_grid_on_the_toolbar_and_the_a4_preview_and_gives_it_back',
    description: 'Une grille grise le tableau, les colonnes, le sommaire, la citation, le bloc de code, l\'encadré, la signature, le suivi et l\'aperçu A4 : chacun dit « dans une grille » (l\'aperçu A4 : « pas de feuille »), le clic l\'écrit dans le coin d\'état malgré la garde de la grille ; hors grille, plus rien',
    run: async (h) => {
      await h.resetEditor();
      await goToNewGrid(h);
      const reason = I18n.t('lock.grid');
      const ids = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all', 'v2-collab-group'];
      const silent = ids.filter(id => titleOf(id) !== reason || !blocks(id));
      const a4 = byId('v2-a4-toggle');
      const a4Title = a4.getAttribute('title');
      clearSaid();
      byId('v2-btn-table').click();
      const saidByTable = say();
      clearSaid();
      a4.click();
      const saidByA4 = say();
      const a4Checked = byId('v2-toggle-a4-preview').checked;
      // Ce que la grille laisse actif ne dit rien.
      const activeQuiet = ['v2-btn-bold', 'v2-btn-link', 'v2-btn-undo'].filter(id => blocks(id) || byId(id).hasAttribute('data-pp-lock-reason'));
      await goToNewDocument(h);
      const stuck = ids.concat(['v2-a4-toggle']).filter(id => blocks(id));
      const pass = silent.length === 0 && a4Title === I18n.t('lock.gridSheet') && saidByTable === reason && saidByA4 === I18n.t('lock.gridSheet') && a4Checked && activeQuiet.length === 0 && stuck.length === 0 && !a4.hasAttribute('title');
      return { pass, notes: JSON.stringify({ silent, a4Title, saidByTable, saidByA4, a4Checked, activeQuiet, stuck }) };
    },
  });

  cases.push({
    id: 'lock_reasons_header_footer_zone_says_why_toc_and_page_break_are_grey',
    description: 'Dans une zone d\'en-tête ou de pied ouverte, « Sommaire », « Saut de page » et la numérotation des titres sont grisés avec la raison de la zone, que leur clic dit ; la zone fermée, plus rien',
    run: async (h) => {
      await h.resetEditor();
      await goToNewDocument(h);
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await sleep(300);
      const reason = I18n.t('lock.hf');
      const ids = ['v2-btn-toc', 'v2-btn-page-break', 'v2-numbering-seg'];
      const silent = ids.filter(id => byId(id) && (titleOf(id) !== reason || !blocks(id)));
      clearSaid();
      byId('v2-btn-toc').click();
      const said = say();
      const tableQuiet = !blocks('v2-btn-table');
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await sleep(200);
      const stuck = ids.filter(id => byId(id) && blocks(id));
      const pass = silent.length === 0 && said === reason && tableQuiet && stuck.length === 0;
      return { pass, notes: JSON.stringify({ silent, said, tableQuiet, stuck }) };
    },
  });

  cases.push({
    id: 'lock_reasons_reading_mode_says_read_mode_on_every_bar_child_and_edit_gives_it_back',
    description: 'En Lecture, chaque groupe et bouton grisé de la barre dit « mode lecture » et le clic l\'écrit dans le coin d\'état ; en repassant en Édition, plus rien',
    run: async (h) => {
      await h.resetEditor();
      await goToNewDocument(h);
      const reason = I18n.t('lock.readMode');
      const bar = byId('v2-toolbar');
      const children = () => Array.from(bar.children).filter(c => !c.classList.contains('v2-sep') && c.id !== 'v2-btn-comment');
      byId('btn-mode-read').click();
      await sleep(500);
      const silent = children().filter(c => c.getAttribute('title') !== reason || !c.hasAttribute('data-pp-lock-blocks')).map(c => c.id || c.className);
      const count = children().length;
      clearSaid();
      byId('v2-btn-bold').click();
      const said = say();
      byId('btn-mode-edit').click();
      await sleep(500);
      const stuck = children().filter(c => c.hasAttribute('data-pp-lock-blocks') || c.getAttribute('title') === reason).map(c => c.id || c.className);
      const pass = count > 20 && silent.length === 0 && said === reason && stuck.length === 0;
      return { pass, notes: JSON.stringify({ count, silent, said, stuck }) };
    },
  });

  cases.push({
    id: 'lock_reasons_page_button_and_menu_say_why_in_an_email_and_during_an_export',
    description: 'Le bouton Page (désactivé par le navigateur : info-bulle seule) et chaque ligne de son menu disent pourquoi en email, puis pendant un export ; les lignes grisées disent leur raison à leur clic ; en document, plus rien',
    run: async (h) => {
      await h.resetEditor();
      await goToNewEmail(h);
      const reason = I18n.t('lock.email');
      const button = byId('btn-page-orientation');
      const buttonOk = button.disabled && button.getAttribute('title') === reason;
      const rows = Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check'));
      const silent = rows.filter(r => r.getAttribute('title') !== reason || !r.hasAttribute('data-pp-lock-blocks')).map(r => r.id || r.textContent.trim().slice(0, 20));
      clearSaid();
      rows[0].click();
      const said = say();
      await goToNewDocument(h);
      const quiet = rows.concat([button]).filter(r => r.hasAttribute('data-pp-lock-blocks') || r.getAttribute('title') === reason).length;
      OrientationToggle.setBusy(true);
      const busyReason = I18n.t('lock.pageBusy');
      const busyButton = button.disabled && button.getAttribute('title') === busyReason;
      const busyRows = Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).filter(r => r.getAttribute('title') !== busyReason).length;
      OrientationToggle.setBusy(false);
      const free = !button.hasAttribute('data-pp-lock-reason') && rows.every(r => !r.hasAttribute('data-pp-lock-reason'));
      const pass = rows.length >= 6 && buttonOk && silent.length === 0 && said === reason && quiet === 0 && busyButton && busyRows === 0 && free;
      return { pass, notes: JSON.stringify({ rows: rows.length, buttonOk, silent, said, quiet, busyButton, busyRows, free }) };
    },
  });

  cases.push({
    id: 'lock_reasons_export_type_rows_say_why_for_a_document_a_macro_template_and_a_grid',
    description: 'Le menu « Type d\'export » : PowerPoint dit « une présentation seulement », Excel « une grille seulement », Markdown (modèle) dit « pas dans un macro-modèle », Word dit « pas dans une grille », les lignes de qualité disent « PDF seulement » hors PDF ; le clic dit la raison et ne change pas le type',
    run: async (h) => {
      const row = type => document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type="' + type + '"]');
      const quality = q => document.querySelector('#v2-quality-flyout .v2-hover-row[data-quality="' + q + '"]');
      const grey = r => r.classList.contains('v2-hover-row-disabled');
      const out = {};
      await h.resetEditor();
      await goToNewDocument(h);
      out.docPptx = row('pptx').getAttribute('title') === I18n.t('lock.exportPptx') && row('pptx').hasAttribute('data-pp-lock-blocks');
      out.docXlsx = row('xlsx').getAttribute('title') === I18n.t('lock.exportXlsx');
      out.docQuiet = ['pdf', 'pdfProtected', 'docx', 'md', 'mdTemplate', 'html', 'htmlFragment'].filter(t => grey(row(t)) || row(t).hasAttribute('data-pp-lock-reason'));
      clearSaid();
      row('xlsx').click();
      out.xlsxSaid = say() === I18n.t('lock.exportXlsx');
      out.typeKept = byId('v2-export-type').value === 'pdf';
      // Hors PDF, les trois lignes de qualité sont grisées : « PDF seulement ».
      row('docx').click();
      await sleep(100);
      out.qualityInDocx = ['native', 'browser-print', 'light'].filter(q => quality(q).getAttribute('title') !== I18n.t('lock.exportPdfOnly'));
      row('pdf').click();
      await sleep(100);
      out.qualityInPdf = ['native', 'light'].filter(q => quality(q).hasAttribute('data-pp-lock-reason'));
      await goToNewMacro(h);
      out.macroMd = row('mdTemplate').getAttribute('title') === I18n.t('lock.exportMacroMd');
      await goToNewGrid(h);
      out.gridDocx = row('docx').getAttribute('title') === I18n.t('lock.exportNotGrid') && row('md').getAttribute('title') === I18n.t('lock.exportNotGrid');
      out.gridXlsxFree = !grey(row('xlsx')) && !row('xlsx').hasAttribute('data-pp-lock-reason');
      await goToNewDocument(h);
      out.backDocx = !row('docx').hasAttribute('data-pp-lock-reason') && !row('mdTemplate').hasAttribute('data-pp-lock-reason');
      const pass = out.docPptx && out.docXlsx && out.docQuiet.length === 0 && out.xlsxSaid && out.typeKept && out.qualityInDocx.length === 0 && out.qualityInPdf.length === 0 && out.macroMd && out.gridDocx && out.gridXlsxFree && out.backDocx;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_reasons_disabled_buttons_say_why_by_title_and_lose_it_when_free',
    description: 'Les boutons que le navigateur désactive (retrait et retrait inverse hors d\'une liste, Tout accepter et Tout refuser sans modification suivie, ★ sans modèle enregistré ou sur un email) ont pour info-bulle ce qui les rendrait utiles ; actifs, ils n\'en ont plus',
    run: async (h) => {
      const ed = () => EditorCore.getEditor();
      const posOf = text => { let found = -1; ed().state.doc.descendants((node, pos) => { if (found < 0 && node.isText && node.text.indexOf(text) !== -1) found = pos + 1; }); return found; };
      await h.resetEditor();
      await goToNewDocument(h);
      Editor.setHTML('<p>Un texte</p>');
      await sleep(80);
      ed().commands.setTextSelection(posOf('Un'));
      MainToolbar.syncToolbarState();
      const out = {};
      out.plain = { indent: byId('v2-btn-indent').disabled && titleOf('v2-btn-indent') === I18n.t('lock.indent'), outdent: byId('v2-btn-outdent').disabled && titleOf('v2-btn-outdent') === I18n.t('lock.outdent') };
      out.nothingPending = ['v2-btn-accept-all', 'v2-btn-reject-all'].every(id => byId(id).disabled && titleOf(id) === I18n.t('lock.noPending'));
      Editor.setHTML('<ul><li><p>Premier</p></li><li><p>Second</p></li></ul>');
      await sleep(80);
      ed().commands.setTextSelection(posOf('Second'));
      MainToolbar.syncToolbarState();
      out.secondItem = { indentFree: !byId('v2-btn-indent').disabled && titleOf('v2-btn-indent') === null && !byId('v2-btn-indent').hasAttribute('data-pp-lock-reason'), outdentFree: !byId('v2-btn-outdent').disabled && titleOf('v2-btn-outdent') === null };
      ed().commands.setTextSelection(posOf('Premier'));
      MainToolbar.syncToolbarState();
      out.firstItem = { indent: byId('v2-btn-indent').disabled && titleOf('v2-btn-indent') === I18n.t('lock.indent'), outdentFree: !byId('v2-btn-outdent').disabled };
      // ★ : sans modèle enregistré, puis sur un email enregistré, puis sur un document enregistré.
      const star = byId('btn-set-default-template');
      await goToNewDocument(h);
      out.starNone = star.disabled && star.getAttribute('title') === I18n.t('lock.defaultNone');
      await goToNewEmail(h);
      byId('template-name').hidden = false;
      byId('template-name').value = 'EmailDesRaisons';
      await h.clickButton('btn-save');
      await sleep(250);
      out.starEmail = star.disabled && star.getAttribute('title') === I18n.t('lock.defaultType');
      await goToNewDocument(h);
      byId('template-name').hidden = false;
      byId('template-name').value = 'DocDesRaisons';
      await h.clickButton('btn-save');
      await sleep(250);
      out.starFree = !star.disabled && !star.hasAttribute('title') && !star.hasAttribute('data-pp-lock-reason');
      const pass = out.plain.indent && out.plain.outdent && out.nothingPending && out.secondItem.indentFree && out.secondItem.outdentFree && out.firstItem.indent && out.firstItem.outdentFree && out.starNone && out.starEmail && out.starFree;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_reasons_shortcuts_default_buttons_say_there_is_nothing_to_restore_until_a_key_changes',
    description: 'Réglages > Raccourcis : chaque « Par défaut » et « Tout remettre par défaut » désactivés ont pour info-bulle « rien à remettre » ; une touche changée libère sa ligne et le bouton du bas, sans info-bulle',
    run: async (h) => {
      Shortcuts.resetAll();
      byId('v2-btn-settings').click();
      document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click();
      ShortcutsPanel.showView('keys');
      await sleep(250);
      const resets = () => Array.from(document.querySelectorAll('#settings-keys-list .settings-key-row .settings-key-reset'));
      const resetAll = byId('settings-keys-reset-all');
      const out = {};
      out.rows = resets().length;
      out.allQuiet = resets().filter(b => !b.disabled || b.getAttribute('title') !== I18n.t('lock.keyDefault')).length;
      out.resetAll = resetAll.disabled && resetAll.getAttribute('title') === I18n.t('lock.keysAllDefault');
      Shortcuts.setKey('modeRead', 'Alt+r');
      await sleep(80);
      const row = document.querySelector('.settings-key-row[data-action="modeRead"] .settings-key-reset');
      out.changedFree = !row.disabled && !row.hasAttribute('title') && !resetAll.disabled && !resetAll.hasAttribute('title');
      out.othersStillSay = resets().filter(b => b !== row && b.getAttribute('title') !== I18n.t('lock.keyDefault')).length;
      Shortcuts.resetAll();
      await sleep(80);
      out.backToQuiet = row.disabled && row.getAttribute('title') === I18n.t('lock.keyDefault') && resetAll.disabled && resetAll.getAttribute('title') === I18n.t('lock.keysAllDefault');
      byId('settings-close').click();
      const pass = out.rows > 30 && out.allQuiet === 0 && out.resetAll && out.changedFree && out.othersStillSay === 0 && out.backToQuiet;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.lockReasons = cases;
})();
