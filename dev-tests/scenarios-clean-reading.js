// Suite "cleanReading" - Lecture épurée (js/clean-reading.js, css/clean-reading.css), retours d'Antoine du 2026-10-02, point 19 : « un mode Lecture épuré qui enlève la toolbar
// etc. pour juste avoir la lecture clean d'un document ». Le mode Lecture sans la barre du haut ni le reste de l'interface, le document seul dans le panneau.
// Le menu du bouton Mode lecture a deux lignes à cocher comme celui du bouton Exporter - « Lecture simple » (cochée au départ) puis « Lecture épurée » - et le bouton fait ce que la ligne
// cochée dit (demande d'Antoine du 2026-11-02) : cocher une ligne ne fait que la cocher.
// Ici : la structure et les états, DANS la page (clics et touches synthétiques) ; dev-tests/verify-clean-reading-mouse.mjs en mesure les pixels à 700x400 à la vraie souris et au
// vrai clavier, en clair et en sombre, pour une personne en lecture seule comprise.
// Chaque scénario repart de l'Édition, de « Lecture simple » cochée, et y revient (finish) : l'état épuré ne doit rien laisser derrière lui.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  // La langue de la page au chargement du fichier : la française, ou l'anglaise pour un cas `lang: 'en'` (la page démarre alors en anglais). Aucun scénario ne change la langue en route.
  const PAGE_LANG = I18n.getLang();
  const TABLE = 'PpClientsEpure';
  const SHORT_HTML = '<p>Bonjour <span class="var-badge" data-table="' + TABLE + '" data-column="Nom" data-key="' + TABLE + '.Nom"></span>, voici le contrat de location.</p><p>Second paragraphe.</p>';
  const LONG_HTML = '<p>Bonjour <span class="var-badge" data-table="' + TABLE + '" data-column="Nom" data-key="' + TABLE + '.Nom"></span>.</p>'
    + Array.from({ length: 60 }, (_, i) => '<p>Paragraphe ' + (i + 1) + ' du contrat de location, assez long pour occuper une ligne entière de la feuille.</p>').join('');

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const el = id => document.getElementById(id);
  const bar = () => el('toolbar-top');
  const barShown = () => getComputedStyle(bar()).display !== 'none' && bar().getClientRects().length > 0;
  const reader = () => el('reader-container');
  const inRead = () => reader().style.display === 'block' && el('editor-container').style.display === 'none';
  const inEdit = () => el('editor-container').style.display !== 'none' && reader().style.display === 'none';
  const readerText = () => { const c = reader().querySelector('.reader-content'); return c ? c.textContent : ''; };
  const exitButton = () => el('btn-exit-clean-reading');
  const exitShown = () => { const b = exitButton(); return getComputedStyle(b).display !== 'none' && b.getClientRects().length > 0; };
  const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  const ROW_SIMPLE = 'v2-btn-read-simple';
  const ROW_CLEAN = 'v2-btn-clean-reading';
  const rowsState = () => [ROW_SIMPLE, ROW_CLEAN].map(id => el(id).getAttribute('aria-checked')).join(',');
  // Une ligne du menu se clique comme le fait la souris : appui (retenu par la ligne, qui ne prend pas le focus), puis clic. Le clic ne fait que cocher la ligne.
  function pickRow(id) {
    const row = el(id);
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  // Le clic du bouton Mode lecture à la souris : `detail` à 1. Un `.click()` nu part comme du clavier (`detail` à 0) : Entrée ou Espace sur le bouton, et Alt+L qui le clique.
  const mouseClickReadButton = () => el('btn-mode-read').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  // Entrer dans la Lecture épurée comme la personne : cocher « Lecture épurée », puis cliquer le bouton Mode lecture.
  async function enterClean() {
    pickRow(ROW_CLEAN);
    mouseClickReadButton();
    await waitFor(() => CleanReading.isActive(), 4000);
    await sleep(250);
  }
  // Tout ce que la page garde dans le navigateur : le choix du menu n'en écrit rien (un état d'affichage de la session, comme le zoom).
  function storageDump() {
    const dump = {};
    ['localStorage', 'sessionStorage'].forEach(name => {
      try { const store = window[name]; dump[name] = Object.keys(store).sort().map(key => key + '=' + store.getItem(key)); } catch (e) { dump[name] = 'illisible'; }
    });
    return JSON.stringify(dump);
  }

  async function setup(h, html) {
    await h.resetEditor();
    CleanReading.choose('simple');
    I18n.setLang(PAGE_LANG);
    stub().setVariables(TABLE, { Nom: 'Text' });
    stub().setRows(TABLE, [{ id: 1, Nom: 'Dupont' }, { id: 2, Nom: 'Martin' }]);
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: 'Dupont' }, TABLE);
    Editor.setHTML(html || SHORT_HTML);
    await sleep(300);
    if (CleanReading.isActive()) await CleanReading.exit();
    if (!inEdit()) { el('btn-mode-edit').click(); await sleep(400); }
  }

  async function finish() {
    if (CleanReading.isActive()) await CleanReading.exit();
    CleanReading.choose('simple');
    I18n.setLang(PAGE_LANG);
    if (!inEdit()) { el('btn-mode-edit').click(); await sleep(400); }
    document.querySelectorAll('#v2-comment-popup[data-test-fake]').forEach(p => p.remove());
  }

  cases.push({
    id: 'clean_reading_row_sits_under_mode_read_and_the_title_keeps_the_key',
    description: 'Le menu du bouton Mode lecture a deux lignes à cocher, « Lecture simple » au-dessus de « Lecture épurée » (aucune icône de plus), la première cochée au départ, comme les lignes du menu Exporter ; le bouton garde son geste, son aspect de bouton segmenté et sa touche Alt+L, dite par le titre du menu ; le bouton de sortie est caché hors de l’état épuré',
    run: async (h) => {
      await setup(h);
      const group = el('v2-read-group');
      const button = el('btn-mode-read');
      const flyout = el('v2-read-flyout');
      const simple = el(ROW_SIMPLE);
      const row = el(ROW_CLEAN);
      const label = flyout && flyout.querySelector('.v2-hover-flyout-label');
      const rows = flyout ? Array.from(flyout.querySelectorAll(':scope > .v2-hover-row')) : [];
      const structure = { group: !!group, buttonInGroup: !!group && group.querySelector(':scope > #btn-mode-read') === button, flyoutInGroup: !!group && group.querySelector(':scope > #v2-read-flyout') === flyout,
        rowInFlyout: !!flyout && row && row.parentElement === flyout, simpleInFlyout: !!flyout && simple && simple.parentElement === flyout, order: rows.map(r => r.id).join(','),
        rowTexts: rows.map(r => r.textContent).join('|'), labelText: label && label.textContent, rowRoles: rows.map(r => r.getAttribute('role')).join(','), rowTabs: rows.map(r => r.tabIndex).join(','),
        checkClass: rows.map(r => r.classList.contains('v2-hover-row-check-start')).join(','), checked: rowsState(), choice: CleanReading.getChoice(), labelBeforeRows: !!label && label.nextElementSibling === simple,
        noTip: button && !button.hasAttribute('data-tip'), aria: button && button.getAttribute('aria-label') };
      const expectedKeytip = ' (' + Shortcuts.format(Shortcuts.keyFor('modeRead')) + ')';
      const keytip = label && label.getAttribute('data-keytip');
      const shortcutKeys = button.getAttribute('aria-keyshortcuts');
      const toolbarIconsAdded = Array.from(document.querySelectorAll('#toolbar-top .bar-row > button, #v2-toolbar > button')).filter(b => /clean/i.test(b.id)).length;
      // Le groupe n'ajoute rien à la mise en page : les deux boutons de mode restent côte à côte, de même hauteur, arrondis aux deux bouts seulement.
      const edit = el('btn-mode-edit');
      const re = edit.getBoundingClientRect();
      const rr = button.getBoundingClientRect();
      const csE = getComputedStyle(edit);
      const csR = getComputedStyle(button);
      const look = { sameTop: Math.abs(re.top - rr.top) < 0.5, sameHeight: Math.abs(re.height - rr.height) < 0.5, adjacent: Math.abs(re.right - rr.left) < 1.5,
        editRadius: csE.borderTopLeftRadius + '/' + csE.borderTopRightRadius, readRadius: csR.borderTopLeftRadius + '/' + csR.borderTopRightRadius };
      const lookOk = look.sameTop && look.sameHeight && look.adjacent && parseFloat(csE.borderTopLeftRadius) > 0 && parseFloat(csE.borderTopRightRadius) === 0
        && parseFloat(csR.borderTopLeftRadius) === 0 && parseFloat(csR.borderTopRightRadius) > 0;
      // Au repos : rien d'épuré, le bouton de sortie est caché.
      const rest = { bodyClass: document.body.classList.contains('pp-clean-reading'), exitShown: exitShown(), barShown: barShown(), active: CleanReading.isActive() };
      // Le raccourci Alt+L va toujours en Lecture (le bouton reste utilisable) ; le clic du bouton aussi.
      const ran = Shortcuts.run('modeRead') === true;
      await sleep(400);
      const toRead = inRead() && !CleanReading.isActive();
      el('btn-mode-edit').click();
      await sleep(300);
      await finish();
      const pass = structure.group && structure.buttonInGroup && structure.flyoutInGroup && structure.rowInFlyout && structure.simpleInFlyout && structure.order === ROW_SIMPLE + ',' + ROW_CLEAN
        && structure.rowTexts === 'Lecture simple|Lecture épurée' && structure.labelText === 'Mode lecture' && structure.labelBeforeRows && structure.rowRoles === 'menuitemradio,menuitemradio' && structure.rowTabs === '0,0'
        && structure.checkClass === 'true,true' && structure.checked === 'true,false' && structure.choice === 'simple' && structure.noTip && structure.aria === 'Mode lecture' && keytip === expectedKeytip && !!shortcutKeys
        && toolbarIconsAdded === 0 && lookOk && !rest.bodyClass && !rest.exitShown && rest.barShown && !rest.active && ran && toRead;
      return { pass, notes: JSON.stringify({ structure, keytip, expectedKeytip, shortcutKeys, toolbarIconsAdded, look, lookOk, rest, ran, toRead }) };
    },
  });

  // Le menu fait comme celui du bouton Exporter (js/main.js:wireExportMenus) : une ligne se coche, c'est le bouton qui agit. Rien de ce choix n'est gardé ni annulable (un état d'affichage de la session).
  cases.push({
    id: 'clean_reading_a_row_only_ticks_itself_and_nothing_else_moves',
    description: 'Comme dans le menu Exporter, cocher une ligne (clic, Entrée, Espace) ne fait que la cocher : une seule ligne l’est à la fois, depuis l’Édition comme depuis la Lecture ; ni le mode, ni la barre, ni l’état épuré, ni Annuler et Rétablir, ni ce que le navigateur garde ne bougent ; une autre touche ne coche rien',
    run: async (h) => {
      await setup(h);
      await sleep(500); // ce que le chargement du modèle fait encore (écritures différées) est fini avant de regarder ce que le menu écrit
      const editor = EditorCore.getEditor();
      const world = () => ({ active: CleanReading.isActive(), bodyClass: document.body.classList.contains('pp-clean-reading'), editing: inEdit(), reading: inRead(), barShown: barShown(), exitShown: exitShown(),
        canUndo: editor.can().undo(), canRedo: editor.can().redo(), storage: storageDump() });
      const snap = () => ({ choice: CleanReading.getChoice(), rows: rowsState(), world: world() });
      const unmoved = (a, b) => JSON.stringify(a.world) === JSON.stringify(b.world);
      const key = (id, name) => { const row = el(id); row.focus(); return !row.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); };
      // Depuis l'Édition : un clic coche la ligne et décoche l'autre ; recocher la même ligne ne change rien.
      const start = snap();
      pickRow(ROW_CLEAN);
      await sleep(200);
      const clickClean = snap();
      pickRow(ROW_CLEAN);
      const clickCleanAgain = snap();
      pickRow(ROW_SIMPLE);
      const clickSimple = snap();
      // Le clavier : Entrée et Espace sur une ligne la cochent aussi (la touche est retenue : la page ne défile pas) ; une autre touche ne coche rien.
      const heldEnter = key(ROW_CLEAN, 'Enter');
      const enterKey = snap();
      const heldSpace = key(ROW_SIMPLE, ' ');
      const spaceKey = snap();
      const heldOther = key(ROW_CLEAN, 'a');
      const otherKey = snap();
      // Un choix inconnu est refusé et ne change rien.
      const unknown = { refused: CleanReading.choose('autre') === false, after: snap() };
      // Depuis la Lecture : la même chose.
      el('btn-mode-read').click();
      await waitFor(inRead, 4000);
      await sleep(500);
      const readStart = snap();
      pickRow(ROW_CLEAN);
      await sleep(200);
      const readClick = snap();
      await finish();
      const pass = start.choice === 'simple' && start.rows === 'true,false' && start.world.editing && !start.world.active && start.world.barShown
        && clickClean.choice === 'clean' && clickClean.rows === 'false,true' && unmoved(start, clickClean)
        && clickCleanAgain.choice === 'clean' && clickCleanAgain.rows === 'false,true' && unmoved(start, clickCleanAgain)
        && clickSimple.choice === 'simple' && clickSimple.rows === 'true,false' && unmoved(start, clickSimple)
        && heldEnter && enterKey.choice === 'clean' && enterKey.rows === 'false,true' && unmoved(start, enterKey)
        && heldSpace && spaceKey.choice === 'simple' && spaceKey.rows === 'true,false' && unmoved(start, spaceKey)
        && !heldOther && otherKey.choice === 'simple' && otherKey.rows === 'true,false' && unmoved(start, otherKey)
        && unknown.refused && unknown.after.choice === 'simple' && unknown.after.rows === 'true,false'
        && readStart.world.reading && !readStart.world.active && readStart.world.barShown
        && readClick.choice === 'clean' && readClick.rows === 'false,true' && unmoved(readStart, readClick);
      return { pass, notes: JSON.stringify({ start, clickClean, clickCleanAgain, clickSimple, heldEnter, enterKey, heldSpace, spaceKey, heldOther, otherKey, unknown, readStart, readClick }) };
    },
  });

  cases.push({
    id: 'clean_reading_the_button_and_alt_l_do_what_the_ticked_row_says',
    description: 'Le bouton Mode lecture fait ce que la ligne cochée dit, comme le bouton Exporter : « Lecture simple » (au départ) la Lecture ordinaire, « Lecture épurée » la Lecture sans la barre, depuis l’Édition comme depuis la Lecture, et Alt+L, qui clique le bouton, fait de même ; la sortie rend le mode d’où l’on venait et le choix est gardé, d’une entrée à l’autre',
    run: async (h) => {
      await setup(h);
      const snap = () => ({ choice: CleanReading.getChoice(), rows: rowsState(), active: CleanReading.isActive(), reading: inRead(), editing: inEdit(), barShown: barShown(), exitShown: exitShown() });
      const toRead = async () => { await waitFor(inRead, 4000); await sleep(400); };
      const toEdit = async () => { el('btn-mode-edit').click(); await waitFor(() => inEdit() && !CleanReading.isActive(), 4000); await sleep(350); };
      const toClean = async () => { await waitFor(() => CleanReading.isActive(), 4000); await sleep(300); };
      const leaveClean = async () => { exitButton().click(); await waitFor(() => !CleanReading.isActive(), 4000); await sleep(350); };
      // « Lecture simple », cochée au départ : le bouton (à la souris) puis Alt+L font la Lecture ordinaire depuis l'Édition.
      mouseClickReadButton();
      await toRead();
      const simpleButton = snap();
      await toEdit();
      const ranSimple = Shortcuts.run('modeRead') === true;
      await toRead();
      const simpleAlt = snap();
      await toEdit();
      // « Lecture épurée » cochée : le bouton fait la Lecture épurée depuis l'Édition, la sortie rend l'Édition, le choix reste coché ; Alt+L fait de même.
      pickRow(ROW_CLEAN);
      mouseClickReadButton();
      await toClean();
      const cleanButton = snap();
      await leaveClean();
      const cleanLeft = snap();
      const ranClean = Shortcuts.run('modeRead') === true;
      await toClean();
      const cleanAlt = snap();
      // Pendant l'état épuré, un second appel (Alt+L, la barre est cachée) ne change rien.
      Shortcuts.run('modeRead');
      await sleep(300);
      const cleanAgain = snap();
      await leaveClean();
      // Depuis la Lecture, « Lecture épurée » cochée : la Lecture épurée, la sortie rend la Lecture.
      pickRow(ROW_SIMPLE);
      mouseClickReadButton();
      await toRead();
      pickRow(ROW_CLEAN);
      mouseClickReadButton();
      await toClean();
      const fromRead = snap();
      await leaveClean();
      const fromReadLeft = snap();
      // Revenue à « Lecture simple » dans la Lecture : le bouton reste dans la Lecture ordinaire.
      pickRow(ROW_SIMPLE);
      mouseClickReadButton();
      await sleep(400);
      const backToSimple = snap();
      await finish();
      const pass = simpleButton.choice === 'simple' && simpleButton.reading && !simpleButton.active && simpleButton.barShown && !simpleButton.exitShown
        && ranSimple && simpleAlt.reading && !simpleAlt.active && simpleAlt.barShown
        && cleanButton.choice === 'clean' && cleanButton.rows === 'false,true' && cleanButton.active && cleanButton.reading && !cleanButton.barShown && cleanButton.exitShown
        && cleanLeft.choice === 'clean' && cleanLeft.rows === 'false,true' && !cleanLeft.active && cleanLeft.editing && cleanLeft.barShown && !cleanLeft.exitShown
        && ranClean && cleanAlt.active && cleanAlt.reading && !cleanAlt.barShown
        && cleanAgain.active && cleanAgain.reading && !cleanAgain.barShown
        && fromRead.choice === 'clean' && fromRead.active && fromRead.reading && !fromRead.barShown
        && fromReadLeft.choice === 'clean' && !fromReadLeft.active && fromReadLeft.reading && fromReadLeft.barShown
        && backToSimple.choice === 'simple' && backToSimple.rows === 'true,false' && backToSimple.reading && !backToSimple.active && backToSimple.barShown;
      return { pass, notes: JSON.stringify({ simpleButton, ranSimple, simpleAlt, cleanButton, cleanLeft, ranClean, cleanAlt, cleanAgain, fromRead, fromReadLeft, backToSimple }) };
    },
  });

  cases.push({
    id: 'clean_reading_from_edit_shows_only_the_document_and_leaving_returns_to_edit',
    description: 'Depuis l’Édition, « Lecture épurée » cochée, le bouton Mode lecture affiche la Lecture sans la barre du haut : barre cachée, document dans tout le panneau, bouton de sortie seul ; le bouton de sortie rend l’Édition, le curseur dans le document',
    run: async (h) => {
      await setup(h);
      const barBefore = bar().getBoundingClientRect().height;
      await enterClean();
      const on = {
        active: CleanReading.isActive(), bodyClass: document.body.classList.contains('pp-clean-reading'), reading: inRead(), readActive: el('btn-mode-read').classList.contains('active'),
        barShown: barShown(), barHeight: bar().getBoundingClientRect().height, exitShown: exitShown(), readerTop: reader().getBoundingClientRect().top,
        readerBottom: reader().getBoundingClientRect().bottom, viewport: window.innerHeight, text: readerText().indexOf('Bonjour Dupont') !== -1,
      };
      const exit = exitButton();
      const exitTexts = { title: exit.title, aria: exit.getAttribute('aria-label') };
      const exitRect = exit.getBoundingClientRect();
      const exitInside = exitRect.left >= 0 && exitRect.top >= 0 && exitRect.right <= window.innerWidth && exitRect.bottom <= window.innerHeight;
      exit.click();
      await waitFor(() => !CleanReading.isActive() && inEdit(), 4000);
      await sleep(300);
      const off = {
        active: CleanReading.isActive(), bodyClass: document.body.classList.contains('pp-clean-reading'), editing: inEdit(), editActive: el('btn-mode-edit').classList.contains('active'),
        barShown: barShown(), barHeight: bar().getBoundingClientRect().height, exitShown: exitShown(),
        caretInEditor: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.ProseMirror'),
      };
      await finish();
      const pass = on.active && on.bodyClass && on.reading && on.readActive && !on.barShown && on.barHeight === 0 && on.exitShown && on.readerTop === 0 && Math.abs(on.readerBottom - on.viewport) < 1 && on.text
        && exitTexts.title === 'Quitter la lecture épurée (Échap)' && exitTexts.aria === 'Quitter la lecture épurée (Échap)' && exitInside
        && !off.active && !off.bodyClass && off.editing && off.editActive && off.barShown && Math.abs(off.barHeight - barBefore) < 0.5 && !off.exitShown && off.caretInEditor;
      return { pass, notes: JSON.stringify({ barBefore, on, exitTexts, exitInside, off }) };
    },
  });

  cases.push({
    id: 'clean_reading_from_read_keeps_the_scroll_and_escape_waits_for_windows_and_threads',
    description: 'Depuis la Lecture : le défilement est gardé à l’entrée comme à la sortie, qui rend la Lecture ; Échap ne sort pas tant qu’une fenêtre ou un fil de commentaire est ouvert, puis sort',
    run: async (h) => {
      await setup(h, LONG_HTML);
      el('btn-mode-read').click();
      await waitFor(inRead, 4000);
      await sleep(500);
      reader().scrollTop = 240;
      await sleep(150);
      const scrolled = reader().scrollTop;
      await enterClean();
      const entered = { active: CleanReading.isActive(), scroll: reader().scrollTop, reading: inRead(), tall: reader().scrollHeight > reader().clientHeight };
      // Un fil de commentaire ouvert prend son Échap d'abord : la sortie attend.
      const thread = document.createElement('div');
      thread.id = 'v2-comment-popup';
      thread.setAttribute('data-test-fake', '1');
      thread.style.display = 'block';
      document.body.appendChild(thread);
      pressEscape();
      await sleep(150);
      const stillWithThread = CleanReading.isActive();
      thread.remove();
      // Une fenêtre ouverte (base commune, js/modal-base.js) ferme avec son Échap : la sortie attend aussi.
      const asked = Dialogs.confirm({ title: 'Test', message: 'Une fenêtre ouverte sur la Lecture épurée.' });
      await sleep(300);
      const windowOpen = Array.from(document.querySelectorAll('.pp-modal')).some(m => getComputedStyle(m).display !== 'none');
      pressEscape();
      const closedByEscape = await Promise.race([asked.then(() => true), sleep(1500).then(() => false)]);
      await sleep(150);
      const stillWithWindow = CleanReading.isActive();
      const windowGone = !Array.from(document.querySelectorAll('.pp-modal')).some(m => getComputedStyle(m).display !== 'none');
      // Plus rien d'ouvert : Échap sort, et rend la Lecture (on y était) au même défilement.
      pressEscape();
      await waitFor(() => !CleanReading.isActive(), 3000);
      await sleep(300);
      const left = { active: CleanReading.isActive(), reading: inRead(), barShown: barShown(), exitShown: exitShown(), scroll: reader().scrollTop };
      await finish();
      const pass = scrolled === 240 && entered.active && entered.reading && entered.tall && Math.abs(entered.scroll - 240) <= 1 && stillWithThread && windowOpen && closedByEscape && stillWithWindow && windowGone
        && !left.active && left.reading && left.barShown && !left.exitShown && Math.abs(left.scroll - 240) <= 1;
      return { pass, notes: JSON.stringify({ scrolled, entered, stillWithThread, windowOpen, closedByEscape, stillWithWindow, windowGone, left }) };
    },
  });

  cases.push({
    id: 'clean_reading_follows_the_row_and_another_mode_leaves_it',
    description: 'Dans la Lecture épurée, une autre ligne de la table met le document à jour sans quitter l’état ; une demande d’un autre mode (js/main.js:switchMode) en sort sans autre geste, la barre revient avec l’Édition',
    run: async (h) => {
      await setup(h);
      await enterClean();
      const first = readerText().indexOf('Bonjour Dupont') !== -1;
      stub().fireRecord({ id: 2, Nom: 'Martin' }, TABLE);
      await waitFor(() => readerText().indexOf('Bonjour Martin') !== -1, 4000);
      const followed = { text: readerText().indexOf('Bonjour Martin') !== -1, still: CleanReading.isActive(), barShown: barShown() };
      // Le bouton Édition est caché avec la barre, mais un autre code (une touche, un droit qui change) peut encore demander le mode : il sort de l'état épuré.
      el('btn-mode-edit').click();
      await waitFor(() => !CleanReading.isActive() && inEdit(), 4000);
      await sleep(300);
      const out = { active: CleanReading.isActive(), bodyClass: document.body.classList.contains('pp-clean-reading'), editing: inEdit(), barShown: barShown(), exitShown: exitShown() };
      await finish();
      const pass = first && followed.text && followed.still && !followed.barShown && !out.active && !out.bodyClass && out.editing && out.barShown && !out.exitShown;
      return { pass, notes: JSON.stringify({ first, followed, out }) };
    },
  });

  cases.push({
    id: 'clean_reading_keyboard_entry_gives_the_focus_back_and_texts_are_in_french',
    description: 'Au clavier : Entrée ou Espace sur une ligne la coche seulement (la touche ne défile pas la page), Entrée sur le bouton Mode lecture fait ce que la ligne cochée dit, et à la sortie le focus revient au bouton ; à la souris : il n’y revient pas (le menu s’ouvrirait) ; les lignes, le bouton de sortie et son info-bulle sont en français (l’anglais : page qui démarre en anglais, plus bas)',
    run: async (h) => {
      await setup(h);
      el('btn-mode-read').click();
      await waitFor(inRead, 4000);
      await sleep(400);
      // Clavier : le focus est sur une ligne (Tab depuis le bouton), Entrée ou Espace la coche, rien de plus ; le bouton Mode lecture (un `click()` nu : `detail` à 0, comme Entrée) fait alors la Lecture épurée ;
      // Échap sort et rend le focus au bouton Mode lecture.
      const simple = el(ROW_SIMPLE);
      const row = el(ROW_CLEAN);
      const press = (target, key) => { target.focus(); return !target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }; // vrai : la touche est retenue (preventDefault)
      const enterTicked = press(row, 'Enter');
      await sleep(250);
      const afterEnter = { held: enterTicked, choice: CleanReading.getChoice(), rows: rowsState(), active: CleanReading.isActive(), reading: inRead(), barShown: barShown() };
      const spaceTicked = press(simple, ' ');
      await sleep(150);
      const afterSpace = { held: spaceTicked, choice: CleanReading.getChoice(), rows: rowsState(), active: CleanReading.isActive() };
      press(row, 'Enter');
      el('btn-mode-read').focus();
      el('btn-mode-read').click();
      await waitFor(() => CleanReading.isActive(), 4000);
      await sleep(250);
      const keyboardOn = CleanReading.isActive();
      pressEscape();
      await waitFor(() => !CleanReading.isActive(), 3000);
      await sleep(200);
      const keyboardBack = { active: CleanReading.isActive(), focus: document.activeElement && document.activeElement.id, reading: inRead() };
      // Souris : la ligne ne prend pas le focus et la sortie ne le rend pas au bouton.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      await enterClean();
      const mouseOn = CleanReading.isActive();
      exitButton().click();
      await waitFor(() => !CleanReading.isActive(), 3000);
      await sleep(200);
      const mouseBack = { active: CleanReading.isActive(), focus: document.activeElement && document.activeElement.id, reading: inRead() };
      // Langue : les lignes et le titre du menu, puis le bouton de sortie (aria-label et title).
      const fr = { simple: el(ROW_SIMPLE).textContent, row: el(ROW_CLEAN).textContent, exitTitle: exitButton().title, exitAria: exitButton().getAttribute('aria-label') };
      await finish();
      const pass = afterEnter.held && afterEnter.choice === 'clean' && afterEnter.rows === 'false,true' && !afterEnter.active && afterEnter.reading && afterEnter.barShown
        && afterSpace.held && afterSpace.choice === 'simple' && afterSpace.rows === 'true,false' && !afterSpace.active
        && keyboardOn && !keyboardBack.active && keyboardBack.focus === 'btn-mode-read' && keyboardBack.reading
        && mouseOn && !mouseBack.active && mouseBack.focus !== 'btn-mode-read' && mouseBack.reading
        && fr.simple === 'Lecture simple' && fr.row === 'Lecture épurée' && fr.exitTitle === 'Quitter la lecture épurée (Échap)' && fr.exitAria === 'Quitter la lecture épurée (Échap)';
      return { pass, notes: JSON.stringify({ afterEnter, afterSpace, keyboardOn, keyboardBack, mouseOn, mouseBack, fr }) };
    },
  });

  // Le bouton de sortie reçoit son info-bulle quand la page se bâtit : l'anglais se lit dans une page qui démarre en anglais.
  cases.push({
    id: 'clean_reading_texts_are_in_english_on_a_page_that_starts_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : les lignes du menu (« Standard reading », « Clean reading »), le bouton de sortie, son info-bulle et son nom accessible (« Exit clean reading (Esc) ») sont en anglais',
    run: async (h) => {
      await setup(h);
      const en = { simple: el(ROW_SIMPLE).textContent, row: el(ROW_CLEAN).textContent, exitTitle: exitButton().title, exitAria: exitButton().getAttribute('aria-label') };
      await finish();
      const pass = I18n.getLang() === 'en' && en.simple === 'Standard reading' && en.row === 'Clean reading' && en.exitTitle === 'Exit clean reading (Esc)' && en.exitAria === 'Exit clean reading (Esc)';
      return { pass, notes: JSON.stringify({ en }) };
    },
  });

  cases.push({
    id: 'clean_reading_hides_the_macro_return_bar_and_gives_it_back_on_exit',
    description: 'Le bandeau « Revenir au macro-modèle » (hors de la barre du haut) se cache avec elle dans la Lecture épurée et revient à la sortie : le document seul, rien d’autre au-dessus du texte',
    run: async (h) => {
      await setup(h);
      const banner = el('macro-return-bar');
      const shown = () => getComputedStyle(banner).display !== 'none' && banner.getClientRects().length > 0;
      banner.hidden = false; // ce que js/main.js:syncMacroReturnBar fait quand le modèle à l'écran a été ouvert par le stylo du résumé d'un macro-modèle
      await sleep(80);
      const before = shown();
      await enterClean();
      const during = { shown: shown(), active: CleanReading.isActive() };
      await CleanReading.exit();
      await sleep(300);
      const after = shown();
      banner.hidden = true;
      await finish();
      const pass = before && during.active && !during.shown && after;
      return { pass, notes: JSON.stringify({ before, during, after }) };
    },
  });

  cases.push({
    id: 'clean_reading_hides_the_linked_return_bar_and_gives_it_back_on_exit',
    description: 'Le bandeau « Revenir au document » (#linked-return-bar, hors de la barre du haut : un modèle Grille ouvert depuis un tableau lié) se cache avec la barre dans la Lecture épurée et revient à la sortie, comme celui du macro-modèle',
    run: async (h) => {
      await setup(h);
      const banner = el('linked-return-bar');
      const shown = () => getComputedStyle(banner).display !== 'none' && banner.getClientRects().length > 0;
      banner.hidden = false; // ce que js/main.js:syncLinkedReturnBar fait quand le modèle à l'écran a été ouvert par « Ouvrir le modèle » du menu du lien d'un tableau lié
      await sleep(80);
      const before = shown();
      await enterClean();
      const during = { shown: shown(), active: CleanReading.isActive() };
      await CleanReading.exit();
      await sleep(300);
      const after = shown();
      banner.hidden = true;
      await finish();
      const pass = before && during.active && !during.shown && after;
      return { pass, notes: JSON.stringify({ before, during, after }) };
    },
  });

  // Réglages > Accès : la case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (choix d'Antoine du 2026-10-02, carte « Un réglage »).
  cases.push({
    id: 'clean_reading_access_checkbox_is_off_greyed_then_follows_the_read_only_column',
    description: 'Réglages > Accès : la case est décochée et grisée au départ ; une colonne « Lecture seule » choisie, elle s’active, se coche et écrit cleanReading dans l’option du widget ; retirer la colonne la décoche ; ses textes sont en français (l’anglais : cas suivant)',
    run: async (h) => {
      await setup(h);
      const RIGHTS = 'PpDroitsEpure';
      stub().setVariables(RIGHTS, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub().setRows(RIGHTS, [{ id: 1, Email: 'lecteur@exemple.fr', LectureSeule: false, Export: true, Commentaires: true }]);
      stub().setUserEmail('lecteur@exemple.fr');
      await GristAPI.refreshSchema();
      el('v2-btn-settings').click();
      await sleep(300);
      const box = el('settings-access-clean-reading');
      const texts = () => ({ label: box.parentElement.querySelector('span').textContent, hint: box.parentElement.nextElementSibling.textContent });
      const choose = async (id, value) => { const select = el(id); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); };
      const option = () => stub().state.options && stub().state.options.droitsAcces;
      const state = () => ({ checked: box.checked, disabled: box.disabled, stored: option() ? option().cleanReading : null, config: AccessRights.getConfig() ? AccessRights.getConfig().cleanReading : null });
      const start = state();
      const startTexts = texts();
      await choose('settings-access-table', RIGHTS);
      const afterTable = state();
      await choose('settings-access-readonly', 'LectureSeule');
      const afterColumn = state();
      box.click();
      await sleep(450);
      const ticked = state();
      box.click();
      await sleep(450);
      const unticked = state();
      box.click();
      await sleep(450);
      await choose('settings-access-readonly', '');
      const afterRemoval = state();
      el('settings-close').click();
      stub().setWidgetOptions(null);
      await waitFor(() => !AccessRights.getConfig());
      await finish();
      const pass = start.checked === false && start.disabled === true && afterTable.disabled === true && afterTable.checked === false
        && afterColumn.disabled === false && afterColumn.checked === false && afterColumn.stored === false
        && ticked.checked === true && ticked.stored === true && ticked.config === true
        && unticked.checked === false && unticked.stored === false && unticked.config === false
        && afterRemoval.disabled === true && afterRemoval.checked === false && afterRemoval.stored == null
        && startTexts.label === 'Ouvrir la Lecture épurée aux personnes en lecture seule' && /Choisissez d’abord la colonne « Lecture seule »/.test(startTexts.hint);
      return { pass, notes: JSON.stringify({ start, startTexts, afterTable, afterColumn, ticked, unticked, afterRemoval }) };
    },
  });

  // La case et son indication sont écrites dans la langue de la page : l'anglais se lit dans une page qui démarre en anglais.
  cases.push({
    id: 'clean_reading_access_checkbox_texts_are_in_english_on_a_page_that_starts_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : Réglages > Accès écrit la case « Open Clean reading for read-only people » et son indication (« Choose the “Read-only” column first ») en anglais',
    run: async (h) => {
      await setup(h);
      el('v2-btn-settings').click();
      await sleep(300);
      const box = el('settings-access-clean-reading');
      const en = { label: box.parentElement.querySelector('span').textContent, hint: box.parentElement.nextElementSibling.textContent };
      el('settings-close').click();
      await finish();
      const pass = I18n.getLang() === 'en' && en.label === 'Open Clean reading for read-only people' && /Choose the “Read-only” column first/.test(en.hint);
      return { pass, notes: JSON.stringify({ en }) };
    },
  });

  cases.push({
    id: 'clean_reading_opens_by_itself_only_for_a_confirmed_read_only_row_when_asked',
    description: 'Ouverture d’emblée : seule une ligne de la table des droits qui dit « lecture seule », la case cochée et une réponse confirmée des droits, ouvre la Lecture épurée ; une personne qui a tous les droits, absente de la table, sans réglage, une réponse qui tarde, une table illisible (verrou par précaution) ou une case décochée n’ouvrent rien, et ni l’attente ni la table illisible ne comptent comme une réponse',
    run: async () => {
      // `state` est AccessRights.getStatus().state ; readOnly vaut AccessRights.get().readOnly (vrai aussi pour le verrou par précaution) ; enabled, la case cochée.
      const base = { state: 'found', readOnly: true, enabled: true };
      const would = patch => CleanReading.wouldOpenForReadOnly(Object.assign({}, base, patch));
      const got = {
        yes: CleanReading.wouldOpenForReadOnly(base),
        off: would({ enabled: false }),
        fullRights: would({ readOnly: false }),
        notInTable: would({ state: 'notFound' }),
        noEmail: would({ state: 'noEmail' }),
        noSetting: would({ state: 'off' }),
        waiting: would({ state: 'pending' }),
        unreadable: would({ state: 'error' }),
        nothing: CleanReading.wouldOpenForReadOnly(null),
        // Une réponse « confirmée » : ce qui décide une fois pour la session. L'attente et la table illisible n'en sont pas (AccessRights relit toutes les 10 s : la réponse peut encore venir).
        answered: ['pending', 'error', 'found', 'notFound', 'noEmail', 'off'].map(st => st + ':' + CleanReading.isAnswered(st)).join(' '),
        none: CleanReading.isAnswered(undefined),
      };
      const pass = got.yes === true && !got.off && !got.fullRights && !got.notInTable && !got.noEmail && !got.noSetting && !got.waiting && !got.unreadable && !got.nothing
        && got.answered === 'pending:false error:false found:true notFound:true noEmail:true off:true' && got.none === false;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.cleanReading = cases;
})();
