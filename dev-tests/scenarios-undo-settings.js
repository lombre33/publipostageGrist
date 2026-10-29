// Suite "undoSettings" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les RÉGLAGES de la personne (suite de scenarios-undo-links.js : demande du 22/10, « Il doit prendre en compte 100% des actions faites dans le widget »,
// et réponse du 27/10 « Oui, tout, Réglages compris »). Quatre choix de la fenêtre Réglages, gardés par js/person-store.js et appliqués à l'instant, passent par js/settings-history.js : le thème (Clair, Sombre, Système), les bulles et les puces
// de l'éditeur (Par défaut, Mise en forme), le caractère d'insertion (« # », « @ »…) et la messagerie du mode Email (Standard, Zimbra). Un réglage est celui de la personne, pas d'un modèle : il se défait depuis n'importe quel modèle, par la pile de
// js/action-history.js, comme le ★ du document. La langue recharge la page et reste hors de Ctrl + Z.
// Deuxième lot de la fenêtre : les touches du clavier (Réglages > Raccourcis > Touches : une touche choisie, retirée au Retour arrière, rendue par « Par défaut » ou toutes d'un coup par « Tout remettre par défaut ») et le caractère déclencheur des
// abréviations (Réglages > Raccourcis > Abréviations) passent par le même js/settings-history.js.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z rend le réglage tel qu'il était (ce qu'elle voit : l'attribut de <html>, ce que le navigateur garde), UN Ctrl + Y le repose, dans l'ordre des gestes avec le texte ; un réglage changé depuis
// n'est jamais écrasé ; choisir ce qui est déjà choisi ne laisse pas de pas. Le même parcours à la vraie souris dans le panneau de 700x400 : verify-undo-settings-mouse.mjs (undoSettingsMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoSettings = (function () {
  const cases = [];
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function keyEvent(key) { return new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true }); }
  // La réserve d'actions (js/action-history.js) ; les cas échouent sur ce que la personne voit, pas sur un nom inconnu.
  const reserve = () => (typeof ActionHistory === 'undefined' ? { reset() {}, whenIdle: () => Promise.resolve(), count: () => 0 } : ActionHistory);
  const settle = async h => { await reserve().whenIdle(); await h.sleep(120); };
  async function undo(h) { ed().commands.focus('end'); await h.sleep(60); ed().view.dom.dispatchEvent(keyEvent('z')); await settle(h); }
  async function redo(h) { ed().commands.focus('end'); await h.sleep(60); ed().view.dom.dispatchEvent(keyEvent('y')); await settle(h); }
  const text = () => ed().getText();
  const status = () => byId('status-msg').textContent;
  const statusClass = () => byId('status-msg').className;
  const typedAtEnd = value => {
    const state = ed().state;
    const tr = state.tr.insertText(value, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  };

  // Ce que la personne voit et ce que le navigateur garde de chaque réglage.
  const html = document.documentElement;
  const shownTheme = () => html.getAttribute('data-theme') || 'system';
  const shownBubbles = () => (html.getAttribute('data-bubble-marks') === 'marks' ? 'marks' : 'default');
  const KEYS = { theme: 'pp_theme', bubbles: 'pp_bubble_marks', trigger: 'pp_trigger_char', mail: 'pp_mail_client', shortcuts: 'pp_shortcuts', expansion: 'pp_expansion_char' };
  const said = (label, value) => I18n.t('status.settingSet', { setting: label, value });
  const themeSaid = theme => said(I18n.t('settings.tab.theme'), I18n.t('settings.theme.' + theme));
  const bubblesSaid = value => said(I18n.t('settings.bubbleMarks.title'), I18n.t('settings.bubbleMarks.' + value));
  const triggerSaid = char => said(I18n.t('settings.triggerKey.name'), char);
  const mailSaid = client => said(I18n.t('settings.tab.mailClient'), I18n.t('settings.mailClient.' + client));

  // Les réglages de départ sont gardés une fois pour toutes et rendus à la fin de chaque cas : d'autres suites lisent le thème et le reste.
  let saved = null;
  function savePrefs() {
    if (saved) return;
    saved = {};
    Object.keys(KEYS).forEach(name => { saved[name] = PersonStore.get(KEYS[name]); });
  }
  function restorePrefs() {
    if (!saved) return;
    Settings.setTheme(saved.theme === null ? 'system' : saved.theme);
    Settings.setBubbleMarks(saved.bubbles === null ? 'default' : saved.bubbles);
    MailtoExport.setMailClient(saved.mail === null ? 'standard' : saved.mail);
    Object.keys(KEYS).forEach(name => { if (saved[name] === null) PersonStore.remove(KEYS[name]); else PersonStore.set(KEYS[name], saved[name]); });
    Shortcuts.reload();
    ShortcutsPanel.showView('keys', false);
  }

  // Clair, bulles par défaut, « # », Standard, les touches d'origine, « § » pour les abréviations : le départ de chaque cas, l'historique vide.
  async function seed(h) {
    await h.resetEditor();
    savePrefs();
    Settings.setTheme('light');
    Settings.setBubbleMarks('default');
    MailtoExport.setMailClient('standard');
    PersonStore.remove(KEYS.trigger);
    PersonStore.remove(KEYS.expansion);
    Shortcuts.resetAll();
    Editor.setHTML('<p>Texte</p>');
    await h.sleep(100);
    reserve().reset();
  }
  async function leave(h) {
    reserve().reset();
    byId('settings-modal').style.display = 'none';
    restorePrefs();
    await h.sleep(50);
  }

  // Réglages ouvert sur un onglet, le réglage choisi comme le fait la personne (la case cochée d'un clic, la liste changée), puis la fenêtre refermée : Ctrl + Z n'agit pas sous une fenêtre ouverte.
  async function openTab(h, tab) {
    byId('v2-btn-settings').click();
    await h.sleep(80);
    document.querySelector('.settings-tab[data-settings-tab="' + tab + '"]').click();
    await h.sleep(40);
  }
  async function closeSettings(h) { byId('settings-close').click(); await h.sleep(60); }
  const radio = (name, value) => document.querySelector('input[name="' + name + '"][value="' + value + '"]');
  async function pickRadio(h, tab, name, value) {
    await openTab(h, tab);
    radio(name, value).click();
    await h.sleep(60);
    await closeSettings(h);
  }
  async function pickTrigger(h, char) {
    await openTab(h, 'triggerKey');
    const select = byId('settings-trigger-char');
    select.value = char;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(60);
    await closeSettings(h);
  }
  const checkedValue = name => { const found = document.querySelector('input[name="' + name + '"]:checked'); return found ? found.value : null; };

  cases.push({
    id: 'undo_settings_the_theme_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'Le thème choisi dans Réglages (Sombre, la fenêtre refermée) : UN Ctrl + Z rend le thème d\'avant - l\'attribut de <html> et la clé que le navigateur garde -, le coin d\'état le dit, UN Ctrl + Y le repose ; rouverts, les Réglages cochent le thème en vigueur',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        check(problems, 'le thème sombre est posé et gardé, une action en réserve', [shownTheme(), PersonStore.get(KEYS.theme), reserve().count()], ['dark', 'dark', 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : le thème clair revient (page et clé gardée)', [shownTheme(), PersonStore.get(KEYS.theme)], ['light', 'light']);
        check(problems, 'Ctrl + Z : le coin d\'état dit le thème', [status(), statusClass() === 'error-msg'], [themeSaid('light'), false]);
        await openTab(h, 'theme');
        check(problems, 'les Réglages rouverts cochent le thème clair', checkedValue('settings-theme'), 'light');
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : le thème sombre revient (page et clé gardée)', [shownTheme(), PersonStore.get(KEYS.theme)], ['dark', 'dark']);
        check(problems, 'Ctrl + Y : le coin d\'état dit le thème', status(), themeSaid('dark'));
        return verdict(problems, { theme: shownTheme(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_setting_is_a_step_in_the_order_of_the_gestures_with_the_text',
    description: 'Du texte, le thème, les bulles et les puces, du texte : quatre Ctrl + Z défont dans l\'ordre inverse (le texte d\'après, les bulles, le thème, le texte d\'avant), quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        typedAtEnd(' avant');
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        await pickRadio(h, 'theme', 'settings-bubble-marks', 'marks');
        typedAtEnd(' après');
        check(problems, 'deux actions en réserve', reserve().count(), 2);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : le texte d\'après est défait, les réglages restent', [/ après/.test(text()), shownTheme(), shownBubbles()], [false, 'dark', 'marks']);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : les bulles reviennent par défaut, le thème reste sombre', [shownBubbles(), shownTheme()], ['default', 'dark']);
        check(problems, 'Ctrl + Z 2 : le coin d\'état dit les bulles', status(), bubblesSaid('default'));
        await undo(h);
        check(problems, 'Ctrl + Z 3 : le thème clair revient', [shownTheme(), / avant/.test(text())], ['light', true]);
        await undo(h);
        check(problems, 'Ctrl + Z 4 : le texte d\'avant est défait', / avant/.test(text()), false);
        await redo(h);
        check(problems, 'Ctrl + Y 1 : le texte d\'avant', [/ avant/.test(text()), shownTheme()], [true, 'light']);
        await redo(h);
        check(problems, 'Ctrl + Y 2 : le thème sombre, les bulles encore par défaut', [shownTheme(), shownBubbles()], ['dark', 'default']);
        await redo(h);
        check(problems, 'Ctrl + Y 3 : les bulles en mise en forme', [shownBubbles(), status()], ['marks', bubblesSaid('marks')]);
        await redo(h);
        check(problems, 'Ctrl + Y 4 : le texte d\'après', / après/.test(text()), true);
        return verdict(problems, { theme: shownTheme(), bubbles: shownBubbles(), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_bubbles_and_chips_choice_goes_back_by_the_bar_buttons',
    description: 'Le choix des bulles et des puces (Mise en forme) : le bouton Annuler de la barre rend « Par défaut » (l\'attribut data-bubble-marks de <html> retiré, la clé gardée), le bouton Rétablir remet « Mise en forme »',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await pickRadio(h, 'theme', 'settings-bubble-marks', 'marks');
        check(problems, 'la mise en forme est posée et gardée', [shownBubbles(), html.hasAttribute('data-bubble-marks'), PersonStore.get(KEYS.bubbles)], ['marks', true, 'marks']);
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'bouton Annuler : par défaut (attribut retiré, clé gardée)', [shownBubbles(), html.hasAttribute('data-bubble-marks'), PersonStore.get(KEYS.bubbles)], ['default', false, 'default']);
        check(problems, 'bouton Annuler : le coin d\'état dit le choix', status(), bubblesSaid('default'));
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'bouton Rétablir : mise en forme', [shownBubbles(), status()], ['marks', bubblesSaid('marks')]);
        return verdict(problems, { bubbles: shownBubbles(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_insert_character_goes_back_and_forth',
    description: 'Le caractère d\'insertion changé dans Réglages (« @ ») : Ctrl + Z rend « # » (la clé que lit la liste des variables), Ctrl + Y rend « @ », le coin d\'état dit le caractère ; choisir « % » après « @ » est un second pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await pickTrigger(h, '@');
        check(problems, 'le caractère « @ » est gardé, une action en réserve', [Variables.triggerChar(), reserve().count()], ['@', 1]);
        await pickTrigger(h, '%');
        check(problems, 'le caractère « % » est gardé, deux actions', [Variables.triggerChar(), reserve().count()], ['%', 2]);
        await undo(h);
        check(problems, 'Ctrl + Z : « @ » revient, le coin d\'état le dit', [Variables.triggerChar(), status()], ['@', triggerSaid('@')]);
        await undo(h);
        check(problems, 'Ctrl + Z suivant : « # » revient', [Variables.triggerChar(), status()], ['#', triggerSaid('#')]);
        await openTab(h, 'triggerKey');
        check(problems, 'les Réglages rouverts montrent « # »', byId('settings-trigger-char').value, '#');
        await closeSettings(h);
        await redo(h);
        await redo(h);
        check(problems, 'deux Ctrl + Y : « % » revient', [Variables.triggerChar(), status()], ['%', triggerSaid('%')]);
        return verdict(problems, { trigger: Variables.triggerChar(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_mail_client_goes_back_and_the_gauge_is_told',
    description: 'La messagerie du mode Email (Zimbra) : Ctrl + Z rend Standard, Ctrl + Y rend Zimbra ; chaque retour avertit la jauge de l\'email (pp:mailClientChanged), comme le geste',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        let heard = 0;
        const listen = () => { heard++; };
        document.addEventListener('pp:mailClientChanged', listen);
        try {
          await pickRadio(h, 'mailClient', 'settings-mail-client', 'zimbra');
          check(problems, 'Zimbra est posé et gardé, la jauge avertie une fois', [MailtoExport.getMailClient(), PersonStore.get(KEYS.mail), heard], ['zimbra', 'zimbra', 1]);
          await undo(h);
          check(problems, 'Ctrl + Z : Standard (réglage et clé gardée), la jauge avertie', [MailtoExport.getMailClient(), PersonStore.get(KEYS.mail), heard], ['standard', 'standard', 2]);
          check(problems, 'Ctrl + Z : le coin d\'état dit la messagerie', status(), mailSaid('standard'));
          await openTab(h, 'mailClient');
          check(problems, 'les Réglages rouverts cochent Standard', checkedValue('settings-mail-client'), 'standard');
          await closeSettings(h);
          await redo(h);
          check(problems, 'Ctrl + Y : Zimbra, la jauge avertie', [MailtoExport.getMailClient(), heard, status()], ['zimbra', 3, mailSaid('zimbra')]);
        } finally { document.removeEventListener('pp:mailClientChanged', listen); }
        return verdict(problems, { client: MailtoExport.getMailClient(), heard });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_setting_comes_back_from_another_template',
    description: 'Un autre modèle ouvert entre-temps (l\'historique du texte repart de zéro) : Ctrl + Z rend encore le thème d\'avant, Ctrl + Y le repose ; le modèle ouvert ne change pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        Editor.setHTML('<p>Autre modèle</p>');
        await h.sleep(100);
        check(problems, 'le thème reste sombre au changement de modèle', shownTheme(), 'dark');
        await undo(h);
        check(problems, 'Ctrl + Z : le thème clair revient, le modèle ouvert ne change pas', [shownTheme(), text()], ['light', 'Autre modèle']);
        await redo(h);
        check(problems, 'Ctrl + Y : le thème sombre revient', [shownTheme(), text()], ['dark', 'Autre modèle']);
        return verdict(problems, { theme: shownTheme(), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_setting_changed_since_is_not_overwritten_and_the_status_says_so',
    description: 'Le thème changé depuis par un autre geste que le pas (un autre onglet, GFS) : Ctrl + Z n\'écrit rien, ne touche pas au thème en vigueur, et le coin d\'état dit que le réglage a changé',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        Settings.setTheme('system');
        await undo(h);
        check(problems, 'aucune écriture : le thème en vigueur reste', [shownTheme(), PersonStore.get(KEYS.theme)], ['system', 'system']);
        check(problems, 'le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.settingChanged'), 'error-msg']);
        return verdict(problems, { theme: shownTheme(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_choice_that_changes_nothing_leaves_no_step',
    description: 'Choisir ce qui est déjà choisi (le thème clair déjà clair, les bulles par défaut, « # », Standard) ne laisse aucun pas : la réserve reste vide et Ctrl + Z ne touche à aucun réglage',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await openTab(h, 'theme');
        [['settings-theme', 'light'], ['settings-bubble-marks', 'default']].forEach(([name, value]) => {
          const input = radio(name, value);
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await openTab(h, 'mailClient');
        const standard = radio('settings-mail-client', 'standard');
        standard.checked = true;
        standard.dispatchEvent(new Event('change', { bubbles: true }));
        await openTab(h, 'triggerKey');
        const select = byId('settings-trigger-char');
        select.value = '#';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(60);
        await closeSettings(h);
        check(problems, 'aucune action en réserve', reserve().count(), 0);
        typedAtEnd(' texte');
        await undo(h);
        check(problems, 'Ctrl + Z défait le texte, les réglages restent', [/ texte/.test(text()), shownTheme(), shownBubbles(), MailtoExport.getMailClient(), Variables.triggerChar()], [false, 'light', 'default', 'standard', '#']);
        return verdict(problems, { count: reserve().count() });
      } finally { await leave(h); }
    },
  });

  // --- Les touches du clavier : Réglages > Raccourcis > Touches (js/shortcuts-panel.js) ---
  const keyRow = id => document.querySelector('.settings-key-row[data-action="' + id + '"]');
  const keyShown = id => keyRow(id).querySelector('.settings-key-btn').textContent;
  const keyReset = id => keyRow(id).querySelector('.settings-key-reset');
  const keytip = id => document.querySelector(Shortcuts.action(id).hint).getAttribute('data-keytip') || '';
  const tipOf = combo => ' (' + Shortcuts.format(combo) + ')';
  const actionName = id => I18n.t(Shortcuts.action(id).label);
  const keySaid = (id, combo) => (combo ? I18n.t('status.keySet', { action: actionName(id), key: Shortcuts.format(combo) }) : I18n.t('status.keyNone', { action: actionName(id) }));
  const keysSaid = count => I18n.t('status.keysChanged', { count });
  const storedKeys = () => JSON.parse(PersonStore.get(KEYS.shortcuts) || 'null');
  const keyInit = (key, code, extra) => Object.assign({ key, code, bubbles: true, cancelable: true, composed: true }, extra || {});
  const ALT_B = keyInit('b', 'KeyB', { altKey: true });
  const ALT_I = keyInit('i', 'KeyI', { altKey: true });
  const BACKSPACE = keyInit('Backspace', 'Backspace');
  async function openKeys(h) { await openTab(h, 'shortcuts'); ShortcutsPanel.showView('keys', false); }
  // La touche d'une action choisie comme le fait la personne : le bouton de sa touche cliqué, la combinaison tapée (Shortcuts la donne à la liste), la fenêtre refermée.
  async function recordKey(h, id, init) {
    await openKeys(h);
    keyRow(id).querySelector('.settings-key-btn').click();
    await h.sleep(40);
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', init));
    await h.sleep(60);
    await closeSettings(h);
  }
  // Le bouton « Par défaut » d'une ligne, ou « Tout remettre par défaut » (la question de confirmation répond oui), puis la fenêtre refermée.
  async function clickDefault(h, id) {
    await openKeys(h);
    keyReset(id).click();
    await h.sleep(60);
    await closeSettings(h);
  }
  async function clickDefaultAll(h) {
    const confirmed = Dialogs.confirm;
    Dialogs.confirm = async () => true;
    try {
      await openKeys(h);
      byId('settings-keys-reset-all').click();
      await h.sleep(150);
      await closeSettings(h);
    } finally { Dialogs.confirm = confirmed; }
  }

  cases.push({
    id: 'undo_settings_a_key_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'Une touche changée dans Réglages > Raccourcis (le gras prend Alt+B, la fenêtre refermée) : UN Ctrl + Z rend la touche d\'avant - le choix gardé, l\'infobulle du bouton, la ligne de la liste rouverte -, le coin d\'état nomme l\'action et sa touche, UN Ctrl + Y rend Alt+B',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        check(problems, 'au départ le gras garde Ctrl+B et aucun choix n\'est gardé', [Shortcuts.isChanged('bold'), PersonStore.get(KEYS.shortcuts)], [false, null]);
        await recordKey(h, 'bold', ALT_B);
        check(problems, 'Alt+B est prise et gardée, une action en réserve', [Shortcuts.keyFor('bold'), storedKeys(), reserve().count()], ['Alt+b', { bold: 'Alt+b' }, 1]);
        check(problems, 'l\'infobulle du gras dit Alt+B', keytip('bold'), tipOf('Alt+b'));
        await undo(h);
        check(problems, 'Ctrl + Z : le gras reprend Ctrl+B, plus aucun choix gardé', [Shortcuts.keyFor('bold'), Shortcuts.isChanged('bold'), PersonStore.get(KEYS.shortcuts)], ['Mod+b', false, null]);
        check(problems, 'Ctrl + Z : l\'infobulle du gras dit Ctrl+B', keytip('bold'), tipOf('Mod+b'));
        check(problems, 'Ctrl + Z : le coin d\'état nomme l\'action et sa touche', [status(), statusClass() === 'error-msg'], [keySaid('bold', 'Mod+b'), false]);
        await openKeys(h);
        check(problems, 'la liste rouverte montre Ctrl+B et grise « Par défaut »', [keyShown('bold'), keyReset('bold').disabled], [Shortcuts.format('Mod+b'), true]);
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : Alt+B revient (choix gardé, infobulle, coin d\'état)', [Shortcuts.keyFor('bold'), storedKeys(), keytip('bold'), status()], ['Alt+b', { bold: 'Alt+b' }, tipOf('Alt+b'), keySaid('bold', 'Alt+b')]);
        return verdict(problems, { key: Shortcuts.keyFor('bold'), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_removing_a_key_is_a_step',
    description: 'Retirer la touche d\'une action (Retour arrière pendant l\'écoute) est UN pas : Ctrl + Z rend Ctrl+B au gras, Ctrl + Y le laisse sans touche, le coin d\'état dit « aucune touche » et l\'infobulle n\'a plus de touche',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await recordKey(h, 'bold', BACKSPACE);
        check(problems, 'le gras n\'a plus de touche, le choix est gardé, une action en réserve', [Shortcuts.keyFor('bold'), storedKeys(), reserve().count()], ['', { bold: '' }, 1]);
        check(problems, 'l\'infobulle du gras n\'a plus de touche', keytip('bold'), '');
        await undo(h);
        check(problems, 'Ctrl + Z : Ctrl+B revient', [Shortcuts.keyFor('bold'), PersonStore.get(KEYS.shortcuts), keytip('bold'), status()], ['Mod+b', null, tipOf('Mod+b'), keySaid('bold', 'Mod+b')]);
        await redo(h);
        check(problems, 'Ctrl + Y : le gras est de nouveau sans touche, le coin d\'état le dit', [Shortcuts.keyFor('bold'), storedKeys(), keytip('bold'), status()], ['', { bold: '' }, '', keySaid('bold', '')]);
        return verdict(problems, { key: Shortcuts.keyFor('bold'), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_default_button_of_a_key_is_a_step',
    description: 'Le bouton « Par défaut » de la ligne d\'une action qui avait une autre touche est UN pas : Ctrl + Z redonne Alt+I à l\'italique, Ctrl + Y lui rend Ctrl+I',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        Shortcuts.setKey('italic', 'Alt+i');
        reserve().reset();
        await clickDefault(h, 'italic');
        check(problems, 'l\'italique reprend Ctrl+I, plus aucun choix gardé, une action en réserve', [Shortcuts.keyFor('italic'), PersonStore.get(KEYS.shortcuts), reserve().count()], ['Mod+i', null, 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : Alt+I revient (choix gardé, infobulle, coin d\'état)', [Shortcuts.keyFor('italic'), storedKeys(), keytip('italic'), status()], ['Alt+i', { italic: 'Alt+i' }, tipOf('Alt+i'), keySaid('italic', 'Alt+i')]);
        await redo(h);
        check(problems, 'Ctrl + Y : Ctrl+I revient', [Shortcuts.keyFor('italic'), PersonStore.get(KEYS.shortcuts), status()], ['Mod+i', null, keySaid('italic', 'Mod+i')]);
        return verdict(problems, { key: Shortcuts.keyFor('italic'), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_reset_all_keys_is_one_step_and_says_how_many',
    description: '« Tout remettre par défaut » (après sa question) est UN pas : Ctrl + Z redonne les trois touches choisies d\'un coup, le coin d\'état dit combien de touches ont changé, Ctrl + Y les remet par défaut',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        Shortcuts.setKey('bold', 'Alt+b');
        Shortcuts.setKey('italic', 'Alt+i');
        Shortcuts.setKey('underline', 'Alt+u');
        reserve().reset();
        await clickDefaultAll(h);
        check(problems, 'toutes les touches sont d\'origine, plus aucun choix gardé, une action en réserve', [Shortcuts.chosen(), PersonStore.get(KEYS.shortcuts), reserve().count()], [{}, null, 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : les trois touches reviennent d\'un coup', [Shortcuts.chosen(), storedKeys()], [{ bold: 'Alt+b', italic: 'Alt+i', underline: 'Alt+u' }, { bold: 'Alt+b', italic: 'Alt+i', underline: 'Alt+u' }]);
        check(problems, 'Ctrl + Z : le coin d\'état dit trois touches', status(), keysSaid(3));
        await redo(h);
        check(problems, 'Ctrl + Y : tout est de nouveau d\'origine', [Shortcuts.chosen(), status()], [{}, keysSaid(3)]);
        return verdict(problems, { chosen: Shortcuts.chosen(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_key_is_a_step_in_the_order_of_the_gestures_with_the_text_and_the_other_settings',
    description: 'Du texte, une touche, du texte, le thème : quatre Ctrl + Z défont dans l\'ordre inverse (le thème, le texte d\'après, la touche, le texte d\'avant), quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        typedAtEnd(' avant');
        await recordKey(h, 'bold', ALT_B);
        typedAtEnd(' après');
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        check(problems, 'deux actions en réserve', reserve().count(), 2);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : le thème clair revient, la touche et les textes restent', [shownTheme(), Shortcuts.keyFor('bold'), / après/.test(text())], ['light', 'Alt+b', true]);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : le texte d\'après est défait, la touche reste', [/ après/.test(text()), Shortcuts.keyFor('bold')], [false, 'Alt+b']);
        await undo(h);
        check(problems, 'Ctrl + Z 3 : la touche d\'origine revient, le texte d\'avant reste', [Shortcuts.keyFor('bold'), / avant/.test(text())], ['Mod+b', true]);
        await undo(h);
        check(problems, 'Ctrl + Z 4 : le texte d\'avant est défait', / avant/.test(text()), false);
        await redo(h);
        await redo(h);
        check(problems, 'Ctrl + Y 2 : le texte d\'avant et Alt+B', [/ avant/.test(text()), Shortcuts.keyFor('bold'), / après/.test(text())], [true, 'Alt+b', false]);
        await redo(h);
        await redo(h);
        check(problems, 'Ctrl + Y 4 : le texte d\'après et le thème sombre', [/ après/.test(text()), shownTheme(), Shortcuts.keyFor('bold')], [true, 'dark', 'Alt+b']);
        return verdict(problems, { key: Shortcuts.keyFor('bold'), theme: shownTheme(), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_key_comes_back_from_another_template',
    description: 'Un autre modèle ouvert entre-temps (l\'historique du texte repart de zéro) : Ctrl + Z rend encore la touche d\'avant, Ctrl + Y la repose ; le modèle ouvert ne change pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await recordKey(h, 'bold', ALT_B);
        Editor.setHTML('<p>Autre modèle</p>');
        await h.sleep(100);
        await undo(h);
        check(problems, 'Ctrl + Z : Ctrl+B revient, le modèle ouvert ne change pas', [Shortcuts.keyFor('bold'), text()], ['Mod+b', 'Autre modèle']);
        await redo(h);
        check(problems, 'Ctrl + Y : Alt+B revient', [Shortcuts.keyFor('bold'), text()], ['Alt+b', 'Autre modèle']);
        return verdict(problems, { key: Shortcuts.keyFor('bold'), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_key_changed_since_is_not_overwritten_and_the_status_says_so',
    description: 'Une touche changée depuis par un autre geste que le pas (un autre onglet, GFS) : Ctrl + Z n\'écrit rien, laisse les touches en vigueur, et le coin d\'état dit que le réglage a changé',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await recordKey(h, 'bold', ALT_B);
        Shortcuts.setKey('bold', 'Alt+j');
        await undo(h);
        check(problems, 'aucune écriture : Alt+J reste', [Shortcuts.keyFor('bold'), storedKeys()], ['Alt+j', { bold: 'Alt+j' }]);
        check(problems, 'le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.settingChanged'), 'error-msg']);
        return verdict(problems, { key: Shortcuts.keyFor('bold'), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_refused_or_unchanged_key_leaves_no_step',
    description: 'Une combinaison refusée (déjà la touche d\'une autre action), le Retour arrière sur une action qui n\'a déjà plus de touche et la même touche reprise ne laissent aucun pas : la réserve reste vide, Ctrl + Z défait le texte',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        Shortcuts.setKey('bold', 'Alt+b');
        Shortcuts.setKey('underline', '');
        reserve().reset();
        await recordKey(h, 'italic', ALT_B);
        check(problems, 'Alt+B est refusée pour l\'italique : sa touche ne change pas', [Shortcuts.keyFor('italic'), Shortcuts.keyFor('bold')], ['Mod+i', 'Alt+b']);
        await recordKey(h, 'underline', BACKSPACE);
        check(problems, 'le Retour arrière sur une action sans touche ne change rien', Shortcuts.keyFor('underline'), '');
        await recordKey(h, 'bold', ALT_B);
        check(problems, 'reprendre la touche déjà prise ne change rien', Shortcuts.keyFor('bold'), 'Alt+b');
        check(problems, 'aucune action en réserve', reserve().count(), 0);
        typedAtEnd(' texte');
        await undo(h);
        check(problems, 'Ctrl + Z défait le texte, les touches restent', [/ texte/.test(text()), Shortcuts.chosen()], [false, { bold: 'Alt+b', underline: '' }]);
        return verdict(problems, { chosen: Shortcuts.chosen(), count: reserve().count() });
      } finally { await leave(h); }
    },
  });

  // --- Le caractère déclencheur des abréviations : Réglages > Raccourcis > Abréviations (js/text-expansion-settings.js) ---
  const charSaid = char => said(I18n.t('settings.expansion.char'), char);
  async function typeExpansionChar(h, value) {
    await openTab(h, 'shortcuts');
    ShortcutsPanel.showView('expansion', false);
    const input = byId('settings-expansion-char');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.sleep(60);
    await closeSettings(h);
  }

  cases.push({
    id: 'undo_settings_the_expansion_trigger_character_goes_back_and_forth',
    description: 'Le caractère déclencheur des abréviations changé dans Réglages (« § » devient « % ») : Ctrl + Z rend « § » (ce que l\'éditeur écoute et la clé gardée), le coin d\'état le dit, les Réglages rouverts le montrent, Ctrl + Y rend « % »',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        check(problems, 'au départ « § » est le déclencheur', [TextExpansion.storedChar(), TextExpansion.triggerChar()], ['§', '§']);
        await typeExpansionChar(h, '%');
        check(problems, '« % » est posé et gardé, une action en réserve', [TextExpansion.storedChar(), PersonStore.get(KEYS.expansion), TextExpansion.triggerChar(), reserve().count()], ['%', '%', '%', 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : « § » revient (déclencheur écouté et clé gardée)', [TextExpansion.storedChar(), PersonStore.get(KEYS.expansion), TextExpansion.triggerChar()], ['§', '§', '§']);
        check(problems, 'Ctrl + Z : le coin d\'état dit le caractère', [status(), statusClass() === 'error-msg'], [charSaid('§'), false]);
        await openTab(h, 'shortcuts');
        ShortcutsPanel.showView('expansion', false);
        check(problems, 'les Réglages rouverts montrent « § »', byId('settings-expansion-char').value, '§');
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : « % » revient', [TextExpansion.storedChar(), TextExpansion.triggerChar(), status()], ['%', '%', charSaid('%')]);
        return verdict(problems, { char: TextExpansion.storedChar(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_refused_expansion_character_leaves_no_step_and_one_changed_since_is_kept',
    description: 'Un caractère que la liste refuse (une lettre, le déclencheur des variables « # », le même qu\'avant) ne laisse aucun pas ; un déclencheur changé depuis par un autre geste n\'est pas écrasé par Ctrl + Z et le coin d\'état le dit',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await typeExpansionChar(h, 'a');
        await typeExpansionChar(h, '#');
        await typeExpansionChar(h, '§');
        check(problems, 'aucune action en réserve, « § » reste', [reserve().count(), TextExpansion.storedChar()], [0, '§']);
        await typeExpansionChar(h, '%');
        TextExpansion.setTriggerChar('&');
        await undo(h);
        check(problems, 'aucune écriture : « & » reste', [TextExpansion.storedChar(), PersonStore.get(KEYS.expansion)], ['&', '&']);
        check(problems, 'le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.settingChanged'), 'error-msg']);
        return verdict(problems, { char: TextExpansion.storedChar(), status: status() });
      } finally { await leave(h); }
    },
  });

  return cases;
})();
