// Suite "cleanReading" - Lecture épurée (js/clean-reading.js, css/clean-reading.css), retours d'Antoine du 2026-10-02, point 19 : « un mode Lecture épuré qui enlève la toolbar
// etc. pour juste avoir la lecture clean d'un document ». Le mode Lecture sans la barre du haut ni le reste de l'interface, le document seul dans le panneau.
// Ici : la structure et les états, DANS la page (clics et touches synthétiques) ; dev-tests/verify-clean-reading-mouse.mjs en mesure les pixels à 700x400 à la vraie souris et au
// vrai clavier, en clair et en sombre, pour une personne en lecture seule comprise.
// Chaque scénario repart de l'Édition et y revient (finish) : l'état épuré ne doit rien laisser derrière lui.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
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
  // La ligne du menu se clique comme le fait la souris : appui (retenu par la ligne, qui ne prend pas le focus), puis clic.
  async function clickRow() {
    const row = el('v2-btn-clean-reading');
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitFor(() => CleanReading.isActive(), 4000);
    await sleep(250);
  }

  async function setup(h, html) {
    await h.resetEditor();
    I18n.setLang('fr');
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
    I18n.setLang('fr');
    if (!inEdit()) { el('btn-mode-edit').click(); await sleep(400); }
    document.querySelectorAll('#v2-comment-popup[data-test-fake]').forEach(p => p.remove());
  }

  cases.push({
    id: 'clean_reading_row_sits_under_mode_read_and_the_title_keeps_the_key',
    description: 'La ligne « Lecture épurée » est dans le menu du bouton Mode lecture (aucune icône de plus), qui garde son geste, son aspect de bouton segmenté et sa touche Alt+L, dite par le titre du menu ; le bouton de sortie est caché hors de l’état épuré',
    run: async (h) => {
      await setup(h);
      const group = el('v2-read-group');
      const button = el('btn-mode-read');
      const flyout = el('v2-read-flyout');
      const row = el('v2-btn-clean-reading');
      const label = flyout && flyout.querySelector('.v2-hover-flyout-label');
      const structure = { group: !!group, buttonInGroup: !!group && group.querySelector(':scope > #btn-mode-read') === button, flyoutInGroup: !!group && group.querySelector(':scope > #v2-read-flyout') === flyout,
        rowInFlyout: !!flyout && row && row.parentElement === flyout, rowText: row && row.textContent, labelText: label && label.textContent, rowRole: row && row.getAttribute('role'), rowTab: row && row.tabIndex,
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
      const pass = structure.group && structure.buttonInGroup && structure.flyoutInGroup && structure.rowInFlyout && structure.rowText === 'Lecture épurée' && structure.labelText === 'Mode lecture'
        && structure.rowRole === 'menuitem' && structure.rowTab === 0 && structure.noTip && structure.aria === 'Mode lecture' && keytip === expectedKeytip && !!shortcutKeys
        && toolbarIconsAdded === 0 && lookOk && !rest.bodyClass && !rest.exitShown && rest.barShown && !rest.active && ran && toRead;
      return { pass, notes: JSON.stringify({ structure, keytip, expectedKeytip, shortcutKeys, toolbarIconsAdded, look, lookOk, rest, ran, toRead }) };
    },
  });

  cases.push({
    id: 'clean_reading_from_edit_shows_only_the_document_and_leaving_returns_to_edit',
    description: 'Depuis l’Édition, la ligne du menu affiche la Lecture sans la barre du haut : barre cachée, document dans tout le panneau, bouton de sortie seul ; le bouton de sortie rend l’Édition, le curseur dans le document',
    run: async (h) => {
      await setup(h);
      const barBefore = bar().getBoundingClientRect().height;
      await clickRow();
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
      await clickRow();
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
      await clickRow();
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
    id: 'clean_reading_keyboard_entry_gives_the_focus_back_and_texts_follow_the_language',
    description: 'Entrée au clavier (Entrée sur la ligne) : à la sortie, le focus revient au bouton Mode lecture ; entrée à la souris : il n’y revient pas (le menu s’ouvrirait) ; la ligne, le bouton de sortie et son info-bulle suivent la langue',
    run: async (h) => {
      await setup(h);
      el('btn-mode-read').click();
      await waitFor(inRead, 4000);
      await sleep(400);
      // Clavier : le focus est sur la ligne (Tab depuis le bouton), Entrée entre ; Échap sort et rend le focus au bouton Mode lecture.
      const row = el('v2-btn-clean-reading');
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitFor(() => CleanReading.isActive(), 4000);
      await sleep(250);
      const keyboardOn = CleanReading.isActive();
      pressEscape();
      await waitFor(() => !CleanReading.isActive(), 3000);
      await sleep(200);
      const keyboardBack = { active: CleanReading.isActive(), focus: document.activeElement && document.activeElement.id, reading: inRead() };
      // Souris : la ligne ne prend pas le focus et la sortie ne le rend pas au bouton.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      await clickRow();
      const mouseOn = CleanReading.isActive();
      exitButton().click();
      await waitFor(() => !CleanReading.isActive(), 3000);
      await sleep(200);
      const mouseBack = { active: CleanReading.isActive(), focus: document.activeElement && document.activeElement.id, reading: inRead() };
      // Langue : la ligne et le titre du menu, puis le bouton de sortie (aria-label et title).
      I18n.setLang('en');
      await sleep(150);
      const en = { row: el('v2-btn-clean-reading').textContent, exitTitle: exitButton().title, exitAria: exitButton().getAttribute('aria-label') };
      I18n.setLang('fr');
      await sleep(150);
      const fr = { row: el('v2-btn-clean-reading').textContent, exitTitle: exitButton().title, exitAria: exitButton().getAttribute('aria-label') };
      await finish();
      const pass = keyboardOn && !keyboardBack.active && keyboardBack.focus === 'btn-mode-read' && keyboardBack.reading
        && mouseOn && !mouseBack.active && mouseBack.focus !== 'btn-mode-read' && mouseBack.reading
        && en.row === 'Clean reading' && en.exitTitle === 'Exit clean reading (Esc)' && en.exitAria === 'Exit clean reading (Esc)'
        && fr.row === 'Lecture épurée' && fr.exitTitle === 'Quitter la lecture épurée (Échap)' && fr.exitAria === 'Quitter la lecture épurée (Échap)';
      return { pass, notes: JSON.stringify({ keyboardOn, keyboardBack, mouseOn, mouseBack, en, fr }) };
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
      await clickRow();
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
      await clickRow();
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
    description: 'Réglages > Accès : la case est décochée et grisée au départ ; une colonne « Lecture seule » choisie, elle s’active, se coche et écrit cleanReading dans l’option du widget ; retirer la colonne la décoche ; les textes suivent la langue',
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
      I18n.setLang('en');
      await sleep(150);
      const en = texts();
      I18n.setLang('fr');
      await sleep(150);
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
        && startTexts.label === 'Ouvrir les personnes en lecture seule sur la Lecture épurée' && /Choisissez d’abord la colonne « Lecture seule »/.test(startTexts.hint)
        && en.label === 'Open read-only people on Clean reading' && /Choose the “Read-only” column first/.test(en.hint);
      return { pass, notes: JSON.stringify({ start, startTexts, afterTable, afterColumn, ticked, en, unticked, afterRemoval }) };
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
