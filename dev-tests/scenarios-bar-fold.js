// Suite "barFold" - le panneau du haut replié par une languette (js/bar-fold.js, css/bar-fold.css), demande d'Antoine du 10/11 : « pouvoir, y compris en mode éditeur, replier le
// panneau d'en haut, n'avoir que le texte pour gagner de la place en hauteur » ; ses choix : une languette sous la barre (plutôt qu'une ligne « Édition épurée » du menu du bouton
// Mode édition, ou la touche seule), qui replie TOUT le panneau (plutôt que la seule mise en forme).
// Ici : la structure et les états, DANS la page (clics et touches synthétiques) ; dev-tests/verify-bar-fold-mouse.mjs en mesure les pixels à 700x400 à la vraie souris et au vrai
// clavier (clair et sombre, la barre de GFS en haut).
// Chaque scénario repart de l'Édition, panneau déplié, et y revient (finish) : l'état replié ne doit rien laisser derrière lui.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = id => document.getElementById(id);
  const tab = () => el('v2-bar-fold-tab');
  const bar = () => el('toolbar-top');
  const editorBox = () => el('editor-container');
  const inEdit = () => editorBox().style.display !== 'none' && el('reader-container').style.display === 'none';
  const hidden = e => getComputedStyle(e).visibility === 'hidden';
  // Le clic de la souris sur la languette : l'appui (retenu par elle, qui ne prend pas le focus) puis le clic.
  function mouseClick(button) {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  }
  // Une frappe « Ctrl+Maj+F » telle que le navigateur la fabrique.
  // Rend l'évènement : `defaultPrevented` dit si une action a pris la touche.
  function pressFold(target) {
    const event = new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, composed: true });
    (target || document.activeElement || document.body).dispatchEvent(event);
    return event;
  }
  function storageDump() {
    const dump = {};
    ['localStorage', 'sessionStorage'].forEach(name => {
      try { const store = window[name]; dump[name] = Object.keys(store).sort().map(key => key + '=' + store.getItem(key)); } catch (e) { dump[name] = 'illisible'; }
    });
    return JSON.stringify(dump);
  }
  const SHORT_HTML = '<p>Bonjour monde, voici le contrat de location.</p><p>Second paragraphe.</p>';

  async function setup(h) {
    await h.resetEditor();
    I18n.setLang('fr');
    Shortcuts.resetAll();
    Editor.setHTML(SHORT_HTML);
    await sleep(300);
    if (CleanReading.isActive()) await CleanReading.exit();
    CleanReading.choose('simple');
    BarFold.set(false);
    if (!inEdit()) { el('btn-mode-edit').click(); await sleep(400); }
    await sleep(100);
  }
  async function finish() {
    if (CleanReading.isActive()) await CleanReading.exit();
    CleanReading.choose('simple');
    BarFold.set(false);
    const status = el('status-msg');
    if (status) { status.className = ''; }
    if (!inEdit()) { el('btn-mode-edit').click(); await sleep(400); }
  }
  // Un scénario qui échoue ne doit pas laisser le panneau replié au suivant.
  const guarded = fn => async (h) => { try { const r = await fn(h); return r && typeof r.pass === 'boolean' ? r : { pass: false, notes: 'verdict illisible : ' + JSON.stringify(r) }; } catch (e) { return { pass: false, notes: 'exception : ' + (e && e.stack || e) }; } finally { await finish(); } };

  cases.push({
    id: 'bar_fold_tab_hangs_outside_the_frozen_bar_and_the_panel_starts_open',
    description: 'La languette est hors de la barre d’outils (aucune icône de plus : la barre reste gelée), juste avant le document, dans une ligne de hauteur nulle ; elle porte son rôle (aria-expanded, aria-controls vers le panneau) et son nom, qui dit l’action et la touche ; le panneau est déplié au départ.',
    run: guarded(async (h) => {
      await setup(h);
      const t = tab();
      const wrapper = el('v2-bar-fold');
      const keytip = ' (' + Shortcuts.format(Shortcuts.keyFor('barFold')) + ')';
      const got = {
        exists: !!t, outsideBar: !!t && !bar().contains(t), inWrapper: !!t && t.parentElement === wrapper, wrapperHeight: wrapper && Math.round(wrapper.getBoundingClientRect().height),
        wrapperBeforeDocument: !!wrapper && wrapper.nextElementSibling === editorBox(),
        iconsAdded: Array.from(document.querySelectorAll('#toolbar-top .bar-row > button, #v2-toolbar > button')).filter(b => /fold/i.test(b.id)).length,
        controls: t && t.getAttribute('aria-controls'), expanded: t && t.getAttribute('aria-expanded'), label: t && t.getAttribute('aria-label'), title: t && t.title, expectedLabel: I18n.t('barFold.fold') + keytip,
        folded: BarFold.isFolded(), bodyClass: document.body.classList.contains('pp-bar-folded'), barHidden: hidden(bar()),
        barTop: Math.round(bar().getBoundingClientRect().top), tabTop: t && Math.round(t.getBoundingClientRect().top), barBottom: Math.round(bar().getBoundingClientRect().bottom),
        keyTitle: t && t.getAttribute('aria-keyshortcuts'),
      };
      const pass = got.exists && got.outsideBar && got.inWrapper && got.wrapperHeight === 0 && got.wrapperBeforeDocument && got.iconsAdded === 0 && got.controls === 'toolbar-top' && got.expanded === 'true'
        && got.label === got.expectedLabel && got.title === got.expectedLabel && !got.folded && !got.bodyClass && !got.barHidden && got.tabTop >= got.barBottom - 1 && !!got.keyTitle;
      return { pass, notes: JSON.stringify(got) };
    }),
  });

  cases.push({
    id: 'bar_fold_click_folds_the_whole_panel_and_gives_its_height_to_the_text',
    description: 'Un clic sur la languette replie tout le panneau (la barre du haut et la barre de mise en forme, avec les champs de l’email) : plus rien de visible, plus de place prise, le document gagne toute sa hauteur ; la languette est restée en haut du document, chevron retourné, nom « Déplier… » ; un second clic rend exactement l’état d’avant.',
    run: guarded(async (h) => {
      await setup(h);
      const rect = e => e.getBoundingClientRect();
      const before = { barHeight: Math.round(rect(bar()).height), editorTop: Math.round(rect(editorBox()).top), editorHeight: Math.round(rect(editorBox()).height), tabTop: Math.round(rect(tab()).top) };
      mouseClick(tab());
      await sleep(250);
      const rows = ['#toolbar-top .bar-row', '#toolbar-top #v2-toolbar'].map(sel => document.querySelector(sel));
      const folded = {
        state: BarFold.isFolded(), bodyClass: document.body.classList.contains('pp-bar-folded'), expanded: tab().getAttribute('aria-expanded'), label: tab().getAttribute('aria-label'),
        barHidden: hidden(bar()), rowsHidden: rows.map(hidden).join(','), barPosition: getComputedStyle(bar()).position, editorTop: Math.round(rect(editorBox()).top),
        editorHeight: Math.round(rect(editorBox()).height), tabTop: Math.round(rect(tab()).top), tabShown: getComputedStyle(tab()).display !== 'none' && tab().getClientRects().length > 0,
        hitTab: (() => { const r = rect(tab()); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && (at === tab() || tab().contains(at)); })(),
      };
      mouseClick(tab());
      await sleep(250);
      const after = { state: BarFold.isFolded(), bodyClass: document.body.classList.contains('pp-bar-folded'), expanded: tab().getAttribute('aria-expanded'), barHeight: Math.round(rect(bar()).height), barHidden: hidden(bar()),
        editorTop: Math.round(rect(editorBox()).top), editorHeight: Math.round(rect(editorBox()).height), tabTop: Math.round(rect(tab()).top), label: tab().getAttribute('aria-label') };
      const gain = folded.editorHeight - before.editorHeight;
      const pass = before.barHeight > 60 && folded.state && folded.bodyClass && folded.expanded === 'false' && /^Déplier le panneau du haut/.test(folded.label) && folded.barHidden && folded.rowsHidden === 'true,true' && folded.barPosition === 'absolute'
        && folded.editorTop === 0 && Math.abs(gain - before.barHeight) <= 1 && folded.tabTop === 0 && folded.tabShown && folded.hitTab
        && !after.state && !after.bodyClass && after.expanded === 'true' && !after.barHidden && after.barHeight === before.barHeight && after.editorTop === before.editorTop && after.editorHeight === before.editorHeight && after.tabTop === before.tabTop
        && /^Replier le panneau du haut/.test(after.label);
      return { pass, notes: JSON.stringify({ before, folded, after, gain }) };
    }),
  });

  cases.push({
    id: 'bar_fold_keeps_the_keys_that_click_a_toolbar_button_working_on_the_text',
    description: 'Replié, le panneau garde ses boutons en place (visibility, pas display:none) : une touche d’action qui clique un bouton de la barre (Gras par js/shortcuts.js, Alt+Maj+H...) agit toujours sur le texte, comme le panneau déplié.',
    run: guarded(async (h) => {
      await setup(h);
      const editor = EditorCore.getEditor();
      editor.chain().focus().selectAll().run();
      BarFold.set(true);
      await sleep(150);
      const clicked = Shortcuts.run('bold');
      await sleep(150);
      const boldWhileFolded = editor.getHTML().includes('<strong>');
      // La preuve inverse : le même appel qui trouverait le bouton sans boîte (display: none) rendrait faux sans rien faire.
      const bold = el('v2-btn-bold');
      const box = bold.getClientRects().length > 0;
      BarFold.set(false);
      editor.chain().focus().selectAll().run();
      Shortcuts.run('bold');
      await sleep(150);
      const boldRemoved = !editor.getHTML().includes('<strong>');
      const pass = clicked === true && boldWhileFolded && box && boldRemoved;
      return { pass, notes: JSON.stringify({ clicked, boldWhileFolded, box, boldRemoved }) };
    }),
  });

  cases.push({
    id: 'bar_fold_ctrl_shift_f_toggles_it_and_the_key_is_an_action_of_the_shortcut_list',
    description: 'Ctrl+Maj+F (la touche de Google Docs) replie puis déplie, depuis le texte ; c’est une action de la liste de Réglages > Raccourcis (groupe Affichage, nommée en français et en anglais), qu’on peut retirer ou changer : la touche retirée ne fait plus rien et le nom de la languette ne la dit plus.',
    run: guarded(async (h) => {
      await setup(h);
      const editor = EditorCore.getEditor();
      editor.chain().focus('end').run();
      const action = Shortcuts.action('barFold');
      const e1 = pressFold(editor.view.dom);
      await sleep(150);
      const foldedByKey = BarFold.isFolded();
      const e2 = pressFold(editor.view.dom);
      await sleep(150);
      const unfoldedByKey = !BarFold.isFolded();
      // Les textes anglais se lisent dans la table, sans changer la langue de la page (qui la rechargerait).
      const frName = I18n.t('shortcuts.action.barFold');
      // Retirée : plus rien ne part, et le nom de la languette ne dit plus la touche.
      Shortcuts.setKey('barFold', '');
      await sleep(50);
      pressFold(editor.view.dom);
      await sleep(150);
      const idleWithoutKey = !BarFold.isFolded();
      const nameWithoutKey = tab().getAttribute('aria-label');
      Shortcuts.resetKey('barFold');
      await sleep(50);
      const got = { exists: !!action, group: action && action.group, scope: action && action.scope, key: Shortcuts.keyFor('barFold'), handled: e1.defaultPrevented && e2.defaultPrevented, foldedByKey, unfoldedByKey,
        frName, enName: I18nTextsSettings['shortcuts.action.barFold'].en, enFold: I18nTextsTemplates['barFold.fold'].en, enUnfold: I18nTextsTemplates['barFold.unfold'].en, idleWithoutKey, nameWithoutKey, nameBack: tab().getAttribute('aria-label') };
      const pass = got.exists && got.group === 'view' && got.key === 'Mod+Shift+f' && got.handled && foldedByKey && unfoldedByKey && frName === 'Replier le panneau du haut' && got.enName === 'Collapse the top panel' && got.enFold === 'Collapse the top panel' && got.enUnfold === 'Expand the top panel'
        && idleWithoutKey && nameWithoutKey === 'Replier le panneau du haut' && /\(.+\)$/.test(got.nameBack);
      return { pass, notes: JSON.stringify(got) };
    }),
  });

  cases.push({
    id: 'bar_fold_state_goes_through_modes_and_the_clean_reading_gives_it_back',
    description: 'L’état est celui du panneau, pas d’un mode : replié, il reste replié en passant à la Lecture et en revenant à l’Édition ; la Lecture épurée, qui cache tout, cache aussi la languette (la touche n’y fait rien) et rend à sa sortie l’état d’avant, replié comme déplié.',
    run: guarded(async (h) => {
      await setup(h);
      const shown = e => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
      BarFold.set(true);
      await sleep(150);
      el('btn-mode-read').click();
      await sleep(500);
      const inRead = el('reader-container').style.display === 'block';
      const readFolded = { state: BarFold.isFolded(), barHidden: hidden(bar()), tabShown: shown(tab()), readerTop: Math.round(el('reader-container').getBoundingClientRect().top) };
      el('btn-mode-edit').click();
      await sleep(500);
      const backFolded = { state: BarFold.isFolded(), barHidden: hidden(bar()), tabShown: shown(tab()), editing: inEdit() };
      // La Lecture épurée depuis l'Édition, panneau replié.
      CleanReading.choose('clean');
      el('btn-mode-read').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      for (let i = 0; i < 30 && !CleanReading.isActive(); i += 1) await sleep(100);
      await sleep(250);
      const clean = { active: CleanReading.isActive(), folded: BarFold.isFolded(), barDisplay: getComputedStyle(bar()).display, tabShown: shown(tab()), keyIgnored: (() => { pressFold(document.body); return BarFold.isFolded(); })() };
      await CleanReading.exit();
      CleanReading.choose('simple');
      await sleep(400);
      const out = { active: CleanReading.isActive(), folded: BarFold.isFolded(), tabShown: shown(tab()), barHidden: hidden(bar()), editing: inEdit() };
      BarFold.set(false);
      await sleep(100);
      // Panneau déplié : la Lecture épurée rend un panneau déplié.
      CleanReading.choose('clean');
      el('btn-mode-read').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      for (let i = 0; i < 30 && !CleanReading.isActive(); i += 1) await sleep(100);
      await CleanReading.exit();
      CleanReading.choose('simple');
      await sleep(400);
      const open = { folded: BarFold.isFolded(), tabShown: shown(tab()), barShown: !hidden(bar()) && getComputedStyle(bar()).display !== 'none' };
      const pass = inRead && readFolded.state && readFolded.barHidden && readFolded.tabShown && readFolded.readerTop === 0
        && backFolded.state && backFolded.barHidden && backFolded.tabShown && backFolded.editing
        && clean.active && clean.folded && clean.barDisplay === 'none' && !clean.tabShown && clean.keyIgnored
        && !out.active && out.folded && out.tabShown && out.barHidden && out.editing
        && !open.folded && open.tabShown && open.barShown;
      return { pass, notes: JSON.stringify({ inRead, readFolded, backFolded, clean, out, open }) };
    }),
  });

  cases.push({
    id: 'bar_fold_shows_an_error_or_unsaved_alert_of_the_status_corner_in_the_tab_when_folded',
    description: 'Ce que le coin d’état de la barre dit d’urgent ne se perd pas panneau replié : une erreur (rouge) ou « modifications non enregistrées » (enregistrement automatique coupé) s’écrit dans la languette et dans son nom ; un message passager, non ; l’alerte effacée, la languette redevient seule ; panneau déplié, jamais de note.',
    run: guarded(async (h) => {
      await setup(h);
      const status = el('status-msg');
      const note = el('v2-bar-fold-note');
      const state = () => ({ has: tab().classList.contains('has-note'), error: tab().classList.contains('is-error'), noteHidden: note.hidden, noteText: note.textContent, label: tab().getAttribute('aria-label'),
        width: Math.round(tab().getBoundingClientRect().width), height: Math.round(tab().getBoundingClientRect().height), colour: getComputedStyle(tab()).color });
      const write = (text, cls) => { status.textContent = text; status.className = cls; };
      write('Grist a refusé d’écrire dans ce modèle.', 'error-msg');
      await sleep(100);
      const openWithError = state();
      BarFold.set(true);
      await sleep(150);
      const foldedError = state();
      write('Modifications non enregistrées.', 'is-unsaved');
      await sleep(100);
      const unsaved = state();
      write('Enregistré à 10:00:00.', '');
      await sleep(100);
      const passing = state();
      write('Erreur de génération du PDF.', 'error-msg');
      await sleep(100);
      const errorAgain = state();
      write('', '');
      await sleep(100);
      const cleared = state();
      write('Erreur de génération du PDF.', 'error-msg');
      await sleep(100);
      BarFold.set(false);
      await sleep(100);
      const reopened = state();
      const pass = !openWithError.has && openWithError.noteHidden
        && foldedError.has && foldedError.error && !foldedError.noteHidden && foldedError.noteText === 'Grist a refusé d’écrire dans ce modèle.' && foldedError.label.endsWith(' - Grist a refusé d’écrire dans ce modèle.') && foldedError.width > 100 && foldedError.height === 20
        && unsaved.has && !unsaved.error && unsaved.noteText === 'Modifications non enregistrées.'
        && !passing.has && passing.noteHidden && passing.noteText === '' && passing.width === 48
        && errorAgain.has && errorAgain.error
        && !cleared.has && cleared.noteHidden && cleared.width === 48
        && !reopened.has && reopened.noteHidden;
      return { pass, notes: JSON.stringify({ openWithError, foldedError, unsaved, passing, errorAgain, cleared, reopened }) };
    }),
  });

  cases.push({
    id: 'bar_fold_moves_the_focus_to_the_text_when_it_was_in_the_panel',
    description: 'Un focus resté sur un bouton ou un champ du panneau (que le panneau replié rend invisible) revient dans le texte, où l’on tape tout de suite ; un focus déjà dans le texte n’en bouge pas.',
    run: guarded(async (h) => {
      await setup(h);
      const editor = EditorCore.getEditor();
      const dom = editor.view.dom;
      el('v2-btn-bold').focus();
      const focusInBar = bar().contains(document.activeElement);
      BarFold.set(true);
      await sleep(150);
      const afterFold = { inEditor: dom.contains(document.activeElement) || document.activeElement === dom, insideBar: bar().contains(document.activeElement) };
      BarFold.set(false);
      await sleep(100);
      editor.chain().focus('end').run();
      BarFold.set(true);
      await sleep(100);
      const stays = dom.contains(document.activeElement) || document.activeElement === dom;
      const pass = focusInBar && afterFold.inEditor && !afterFold.insideBar && stays;
      return { pass, notes: JSON.stringify({ focusInBar, afterFold, stays }) };
    }),
  });

  cases.push({
    id: 'bar_fold_tab_never_covers_the_text_the_page_brings_into_view',
    description: 'La languette pend sur les 14 px du haut du document (20 px quand elle porte une alerte) : un élément que la page ramène dans la fenêtre (recherche, ancre, commentaire, champ) est posé en dessous, jamais collé sous le panneau où la languette prendrait le clic au lieu du texte - panneau ouvert, replié, replié avec une alerte ; le document de la Lecture a le même dégagement.',
    run: guarded(async (h) => {
      await setup(h);
      const long = Array.from({ length: 40 }, (_, i) => '<p>Paragraphe numéro ' + (i + 1) + ' du contrat de location.</p>').join('');
      Editor.setHTML(long);
      await sleep(400);
      const box = editorBox();
      const measure = async (label) => {
        const paras = box.querySelectorAll('.tiptap p');
        const p = paras[20];
        box.scrollTop = 0;
        await sleep(50);
        // Le paragraphe est d'abord au-dessus de la fenêtre (défilé), puis ramené à la plus courte distance : il se colle au haut du document sans le dégagement.
        box.scrollTop = p.offsetTop + 400;
        await sleep(80);
        p.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        await sleep(120);
        const r = p.getBoundingClientRect();
        const t = tab().getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return { label, paraTop: Math.round(r.top), tabBottom: Math.round(t.bottom), clear: r.top >= t.bottom, hitIsText: !!hit && p.contains(hit) };
      };
      const open = await measure('ouvert');
      BarFold.set(true);
      await sleep(150);
      const folded = await measure('replié');
      const status = el('status-msg');
      status.className = 'error-msg';
      status.textContent = 'Grist a refusé d’écrire';
      await sleep(200);
      const alerted = await measure('replié avec alerte');
      const alertHeight = Math.round(tab().getBoundingClientRect().height);
      status.className = '';
      status.textContent = '';
      await sleep(100);
      const padding = { editor: getComputedStyle(box).scrollPaddingTop, reader: getComputedStyle(el('reader-container')).scrollPaddingTop };
      const paddingOk = parseFloat(padding.editor) >= 22 && parseFloat(padding.reader) >= 22;
      const pass = [open, folded, alerted].every(m => m.clear && m.hitIsText) && alertHeight === 20 && paddingOk;
      await finish();
      return { pass, notes: JSON.stringify({ open, folded, alerted, alertHeight, padding }) };
    }),
  });

  cases.push({
    id: 'bar_fold_writes_nothing_and_is_not_an_undo_step',
    description: 'Un état d’affichage de la session, comme la Lecture épurée : replier et déplier n’écrivent rien dans le navigateur (stockage), ne touchent ni Annuler ni Rétablir, ne changent pas le document, et le widget repart déplié (rien ne l’a gardé).',
    run: guarded(async (h) => {
      await setup(h);
      await sleep(500);
      const editor = EditorCore.getEditor();
      const world = () => ({ html: editor.getHTML(), canUndo: editor.can().undo(), canRedo: editor.can().redo(), storage: storageDump() });
      const start = world();
      mouseClick(tab());
      await sleep(150);
      const folded = world();
      mouseClick(tab());
      await sleep(150);
      const end = world();
      const stored = JSON.stringify(start.storage) === JSON.stringify(folded.storage) && JSON.stringify(start.storage) === JSON.stringify(end.storage);
      const mentions = /fold|replie|bar/i.test(end.storage.replace(/pp_shortcuts_view/g, '').replace(/toolbar/gi, ''));
      const pass = stored && start.html === folded.html && start.html === end.html && start.canUndo === folded.canUndo && start.canUndo === end.canUndo && start.canRedo === folded.canRedo && start.canRedo === end.canRedo && !mentions;
      return { pass, notes: JSON.stringify({ stored, mentions, start: { canUndo: start.canUndo, canRedo: start.canRedo }, folded: { canUndo: folded.canUndo, canRedo: folded.canRedo } }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.barFold = cases;
})();
