// Suite "undoSettings" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les RÉGLAGES de la personne (suite de scenarios-undo-links.js : demande du 22/10, « Il doit prendre en compte 100% des actions faites dans le widget »,
// et réponse du 27/10 « Oui, tout, Réglages compris »). Quatre choix de la fenêtre Réglages, gardés par js/person-store.js et appliqués à l'instant, passent par js/settings-history.js : le thème (Clair, Sombre, Système), les bulles et les puces
// de l'éditeur (Par défaut, Mise en forme), le caractère d'insertion (« # », « @ »…) et la messagerie du mode Email (Standard, Zimbra). Un réglage est celui de la personne, pas d'un modèle : il se défait depuis n'importe quel modèle, par la pile de
// js/action-history.js, comme le ★ du document. La langue recharge la page et reste hors de Ctrl + Z.
// Deuxième lot de la fenêtre : les touches du clavier (Réglages > Raccourcis > Touches : une touche choisie, retirée au Retour arrière, rendue par « Par défaut » ou toutes d'un coup par « Tout remettre par défaut ») et le caractère déclencheur des
// abréviations (Réglages > Raccourcis > Abréviations) passent par le même js/settings-history.js.
// Troisième lot : la LISTE des abréviations (ajouter, modifier, supprimer une ligne de la table Publipostage_Abreviations) passe par js/expansion-history.js. Une abréviation retirée revient sous son ancien numéro de ligne s'il est libre (la table est
// commune à toutes les personnes du document), sinon sous un numéro neuf que les pas suivants suivent ; une abréviation changée depuis, ou dont le nom est pris par une autre, n'est jamais écrasée.
// Quatrième lot : l'onglet VUE (Réglages > Vue) - le modèle par défaut de la vue, la colonne de la date du dernier export PDF et le modèle selon la ligne (règles, case, « Si aucune règle ne correspond »). Ce sont des options du widget, que Grist ne garde qu'en
// brouillon jusqu'à son « Enregistrer » : le faux Grist les tient dans stub.state.options. Chaque écriture qui change le réglage est UN pas ; la saisie d'un champ de texte (la valeur d'une règle) n'en fait qu'un, de la première frappe à la sortie du champ ;
// une règle vide (« + Ajouter une règle ») n'est pas un réglage et ne laisse pas de pas ; défaire ou rétablir n'ouvre aucun modèle (un modèle qui s'ouvre vide ce qui se rétablit) ; un réglage rendu par le « Retour » de Grist, ou une personne en lecture
// seule, n'est jamais écrasé.
// Cinquième lot : l'onglet ACCÈS (Réglages > Accès) - la table des droits, la colonne email, les colonnes « Lecture seule », « Export autorisé » et « Commentaires autorisés » et la case de la Lecture épurée, l'option du widget `droitsAcces`. Le réglage que
// Ctrl + Z défait est la configuration ENREGISTRÉE (celle de normalizeConfig, ou rien tant qu'elle n'a pas de colonne de droit) : la table et l'email seuls ne laissent pas de pas, la première colonne de droit en fait un ; défaire ou rétablir écrit l'option
// comme le choix de l'onglet puis recalcule les droits sans recharger ; une personne que le réglage met en lecture seule est verrouillée dans l'onglet comme dans Ctrl + Z.
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
    wipeAbbreviations();
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
    wipeAbbreviations();
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

  // --- La liste des abréviations : Réglages > Raccourcis > Abréviations (js/text-expansion-settings.js ; « Ajouter », « Enregistrer » et « Supprimer » passent par js/expansion-history.js) ---
  const ABBR_TABLE = 'Publipostage_Abreviations';
  const ABBR_COLUMNS = [{ id: 'Utilisateur', type: 'Text' }, { id: 'Abreviation', type: 'Text' }, { id: 'Texte', type: 'Text' }];
  const BOB = 'bob@example.fr';
  const gristStub = () => window.__gristStub;
  // Les lignes de la table du document, de toutes les personnes : [{ id, user, abbr, text }].
  const abbrRows = () => {
    const t = gristStub().state.rows[ABBR_TABLE];
    return t ? t.id.map((id, i) => ({ id, user: t.Utilisateur[i], abbr: t.Abreviation[i], text: t.Texte[i] })) : [];
  };
  // Les abréviations de la personne des essais (anonyme : aucune identité, Utilisateur vide), « nom=texte », dans l'ordre de la table ; et le numéro de ligne de chacune.
  const mine = () => abbrRows().filter(r => r.user === '').map(r => r.abbr + '=' + r.text);
  const mineIds = () => abbrRows().filter(r => r.user === '').map(r => r.id);
  // Ce que l'éditeur en connaît (le cache de TextExpansion, que la règle de saisie et la liste « § » lisent), par ordre alphabétique.
  const known = () => TextExpansion.list().map(e => e.abbreviation + '=' + e.text);
  const abbrSaid = (key, abbr) => I18n.t(key, { abbreviation: TextExpansion.storedChar() + abbr });
  const restoredSaid = abbr => abbrSaid('status.abbreviationRestored', abbr);
  const removedSaid = abbr => abbrSaid('status.abbreviationRemoved', abbr);
  const abbrRow = abbr => Array.from(document.querySelectorAll('#settings-expansion-list .settings-expansion-row')).find(r => r.querySelector('.settings-expansion-abbr').textContent === TextExpansion.storedChar() + abbr);
  // Le bouton « Modifier » (0) ou « Supprimer » (1) de la ligne de l'abréviation `abbr`.
  const abbrButton = (abbr, index) => { const row = abbrRow(abbr); return row && row.querySelectorAll('button')[index]; };
  const shownAbbreviations = () => Array.from(document.querySelectorAll('#settings-expansion-list .settings-expansion-row .settings-expansion-abbr')).map(e => e.textContent);
  const formState = () => ({ abbr: byId('settings-expansion-abbr').value, text: byId('settings-expansion-text').value, submit: byId('settings-expansion-submit').textContent, cancelShown: !byId('settings-expansion-cancel').hidden });

  // Document sans table ni abréviation, module vide, formulaire de l'onglet en « Ajouter » et vide (une écriture refusée le laisse sur la ligne qu'il modifiait, avec sa saisie) : le départ de chaque cas, et ce que chacun laisse derrière lui.
  function wipeAbbreviations() {
    const s = gristStub().state;
    s.tables = s.tables.filter(t => t !== ABBR_TABLE);
    delete s.rows[ABBR_TABLE];
    delete s.nextRowId[ABBR_TABLE];
    TextExpansion.reset();
    if (!byId('settings-expansion-cancel').hidden) byId('settings-expansion-cancel').click();
    byId('settings-expansion-abbr').value = '';
    byId('settings-expansion-text').value = '';
  }
  // Table déjà là, comme dans un document où des personnes en ont créé : [[email, abréviation, texte], ...] (email vide : la personne des essais).
  async function seedAbbreviations(rows) {
    const actions = [['AddTable', ABBR_TABLE, ABBR_COLUMNS]];
    rows.forEach(([user, abbr, text]) => actions.push(['AddRecord', ABBR_TABLE, null, { Utilisateur: user, Abreviation: abbr, Texte: text }]));
    await gristStub().applyUserActions(actions);
    TextExpansion.reset();
  }
  // Ce qu'un autre onglet, une autre personne ou la main dans Grist écrit dans la table, sans passer par le widget.
  const writeElsewhere = actions => gristStub().applyUserActions(actions);

  // Réglages > Raccourcis sur la vue Abréviations (la table se relit à l'ouverture de l'onglet), puis les trois gestes de la liste comme la personne les fait, la fenêtre refermée à la fin : Ctrl + Z n'agit pas sous une fenêtre ouverte.
  async function openAbbreviations(h) {
    await openTab(h, 'shortcuts');
    ShortcutsPanel.showView('expansion', false);
    await h.sleep(200);
  }
  async function sendAbbreviation(h, abbr, text) {
    byId('settings-expansion-abbr').value = abbr;
    byId('settings-expansion-text').value = text;
    byId('settings-expansion-form').requestSubmit();
    await h.sleep(250);
  }
  async function addAbbreviation(h, abbr, text) {
    await openAbbreviations(h);
    await sendAbbreviation(h, abbr, text);
    await closeSettings(h);
  }
  async function editAbbreviation(h, abbr, newAbbr, newText) {
    await openAbbreviations(h);
    abbrButton(abbr, 0).click();
    await h.sleep(30);
    await sendAbbreviation(h, newAbbr, newText);
    await closeSettings(h);
  }
  async function deleteAbbreviation(h, abbr) {
    const confirmed = Dialogs.confirm;
    Dialogs.confirm = async () => true;
    try {
      await openAbbreviations(h);
      abbrButton(abbr, 1).click();
      await h.sleep(250);
      await closeSettings(h);
    } finally { Dialogs.confirm = confirmed; }
  }

  cases.push({
    id: 'undo_settings_an_added_abbreviation_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'Une abréviation ajoutée dans Réglages > Raccourcis > Abréviations (« ub », la fenêtre refermée) : UN Ctrl + Z la retire de la table et de la liste de l\'éditeur, le coin d\'état la nomme, les Réglages rouverts ne la montrent plus ; UN Ctrl + Y la rend sous le même numéro de ligne',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        check(problems, 'la ligne est écrite, une action en réserve', [mine(), reserve().count()], [['ub=université de Bordeaux'], 1]);
        const rowId = mineIds()[0];
        await undo(h);
        check(problems, 'Ctrl + Z : l\'abréviation est retirée de la table et de la liste de l\'éditeur', [mine(), known()], [[], []]);
        check(problems, 'Ctrl + Z : le coin d\'état la nomme', [status(), statusClass() === 'error-msg'], [removedSaid('ub'), false]);
        check(problems, 'Ctrl + Z : le coin d\'état est en toutes lettres', status(), 'Abréviation « §ub » retirée.');
        await openAbbreviations(h);
        check(problems, 'les Réglages rouverts ne la montrent plus', shownAbbreviations(), []);
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : elle revient, sous le même numéro de ligne, dans la table et dans la liste de l\'éditeur', [mine(), mineIds(), known()], [['ub=université de Bordeaux'], [rowId], ['ub=université de Bordeaux']]);
        check(problems, 'Ctrl + Y : le coin d\'état la nomme', status(), restoredSaid('ub'));
        await openAbbreviations(h);
        check(problems, 'les Réglages rouverts la montrent', shownAbbreviations(), ['§ub']);
        await closeSettings(h);
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_modified_abbreviation_goes_back_with_its_name_and_its_text',
    description: 'Une abréviation modifiée (« ub » devient « bdx », avec un autre texte) : UN Ctrl + Z rend le nom et le texte d\'avant sur la MÊME ligne, UN Ctrl + Y le nom et le texte d\'après ; les autres abréviations ne bougent pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux'], ['', 'mel', 'bonjour']]);
        await editAbbreviation(h, 'ub', 'bdx', 'Bordeaux');
        check(problems, 'la ligne est modifiée, une action en réserve', [mine(), reserve().count()], [['bdx=Bordeaux', 'mel=bonjour'], 1]);
        const ids = mineIds();
        await undo(h);
        check(problems, 'Ctrl + Z : le nom et le texte d\'avant sont revenus, sur la même ligne', [mine(), mineIds()], [['ub=université de Bordeaux', 'mel=bonjour'], ids]);
        check(problems, 'Ctrl + Z : la liste de l\'éditeur les connaît', known(), ['mel=bonjour', 'ub=université de Bordeaux']);
        check(problems, 'Ctrl + Z : le coin d\'état nomme l\'abréviation rendue', [status(), statusClass() === 'error-msg'], [restoredSaid('ub'), false]);
        await redo(h);
        check(problems, 'Ctrl + Y : le nom et le texte d\'après reviennent, sur la même ligne', [mine(), mineIds(), known()], [['bdx=Bordeaux', 'mel=bonjour'], ids, ['bdx=Bordeaux', 'mel=bonjour']]);
        check(problems, 'Ctrl + Y : le coin d\'état nomme l\'abréviation', status(), restoredSaid('bdx'));
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_deleted_abbreviation_comes_back_under_its_own_row_number',
    description: 'Une abréviation supprimée (après la question) : UN Ctrl + Z la rend sous son ANCIEN numéro de ligne, avec son texte, sans toucher à celles des autres personnes ; UN Ctrl + Y la supprime de nouveau',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux'], ['', 'mel', 'bonjour'], [BOB, 'bob', 'texte de Bob']]);
        const before = abbrRows();
        await deleteAbbreviation(h, 'ub');
        check(problems, 'la ligne est retirée, une action en réserve', [mine(), reserve().count()], [['mel=bonjour'], 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : la table est telle qu\'avant, numéros de ligne compris (celle de Bob aussi)', abbrRows(), before);
        check(problems, 'Ctrl + Z : la liste de l\'éditeur la connaît, pas celle de Bob', known(), ['mel=bonjour', 'ub=université de Bordeaux']);
        check(problems, 'Ctrl + Z : le coin d\'état la nomme', [status(), statusClass() === 'error-msg'], [restoredSaid('ub'), false]);
        await openAbbreviations(h);
        check(problems, 'les Réglages rouverts la montrent', shownAbbreviations(), ['§mel', '§ub']);
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : elle est retirée de nouveau (la ligne de Bob reste)', [mine(), abbrRows().length], [['mel=bonjour'], 2]);
        check(problems, 'Ctrl + Y : le coin d\'état la nomme', status(), removedSaid('ub'));
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_abbreviation_is_a_step_in_the_order_of_the_gestures_with_the_text_and_the_other_settings',
    description: 'Du texte, une abréviation, du texte, le thème : quatre Ctrl + Z défont dans l\'ordre inverse (le thème, le texte d\'après, l\'abréviation, le texte d\'avant), quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        typedAtEnd(' avant');
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        typedAtEnd(' après');
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        check(problems, 'deux actions en réserve', reserve().count(), 2);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : le thème clair revient, l\'abréviation et les textes restent', [shownTheme(), mine(), / après/.test(text())], ['light', ['ub=université de Bordeaux'], true]);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : le texte d\'après est défait, l\'abréviation reste', [/ après/.test(text()), mine()], [false, ['ub=université de Bordeaux']]);
        await undo(h);
        check(problems, 'Ctrl + Z 3 : l\'abréviation est retirée, le texte d\'avant reste', [mine(), / avant/.test(text())], [[], true]);
        await undo(h);
        check(problems, 'Ctrl + Z 4 : le texte d\'avant est défait', / avant/.test(text()), false);
        await redo(h);
        await redo(h);
        check(problems, 'Ctrl + Y 2 : le texte d\'avant et l\'abréviation', [/ avant/.test(text()), mine(), / après/.test(text())], [true, ['ub=université de Bordeaux'], false]);
        await redo(h);
        await redo(h);
        check(problems, 'Ctrl + Y 4 : le texte d\'après et le thème sombre', [/ après/.test(text()), shownTheme(), mine()], [true, 'dark', ['ub=université de Bordeaux']]);
        return verdict(problems, { rows: mine(), theme: shownTheme(), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_abbreviation_comes_back_from_another_template',
    description: 'Un autre modèle ouvert entre-temps (l\'historique du texte repart de zéro) : Ctrl + Z retire encore l\'abréviation ajoutée, Ctrl + Y la rend ; le modèle ouvert ne change pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        Editor.setHTML('<p>Autre modèle</p>');
        await h.sleep(100);
        await undo(h);
        check(problems, 'Ctrl + Z : l\'abréviation est retirée, le modèle ouvert ne change pas', [mine(), text()], [[], 'Autre modèle']);
        await redo(h);
        check(problems, 'Ctrl + Y : elle revient', [mine(), text()], [['ub=université de Bordeaux'], 'Autre modèle']);
        return verdict(problems, { rows: mine(), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_abbreviation_changed_since_is_not_overwritten_and_the_status_says_so',
    description: 'Une abréviation changée depuis par un autre geste que le pas (un autre onglet, la main dans Grist), ou retirée depuis : Ctrl + Z n\'écrit rien, laisse la table telle qu\'elle est, et le coin d\'état dit que l\'abréviation a changé',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        const rowId = mineIds()[0];
        await writeElsewhere([['UpdateRecord', ABBR_TABLE, rowId, { Texte: 'écrit ailleurs' }]]);
        await undo(h);
        check(problems, 'texte changé depuis : aucune écriture, la ligne reste', mine(), ['ub=écrit ailleurs']);
        check(problems, 'texte changé depuis : le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.abbreviationChanged'), 'error-msg']);
        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        await writeElsewhere([['RemoveRecord', ABBR_TABLE, mineIds()[0]]]);
        await undo(h);
        check(problems, 'ligne retirée depuis : aucune écriture, la table reste vide', mine(), []);
        check(problems, 'ligne retirée depuis : le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.abbreviationChanged'), 'error-msg']);
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_name_taken_by_another_abbreviation_is_not_overwritten',
    description: 'Un nom pris depuis par une autre abréviation : rendre « ub » (Ctrl + Z d\'une suppression ou d\'un changement de nom) comme la rétablir (Ctrl + Y d\'un ajout) n\'écrit rien et le coin d\'état dit que le nom est pris',
    async run(h) {
      const problems = [];
      const taken = I18n.t('history.abbreviationTaken');
      try {
        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux']]);
        await deleteAbbreviation(h, 'ub');
        await writeElsewhere([['AddRecord', ABBR_TABLE, null, { Utilisateur: '', Abreviation: 'UB', Texte: 'écrit ailleurs' }]]);
        await undo(h);
        check(problems, 'suppression défaite alors que « UB » existe : la table ne change pas', mine(), ['UB=écrit ailleurs']);
        check(problems, 'le coin d\'état dit que le nom est pris, en erreur', [status(), statusClass()], [taken, 'error-msg']);

        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux']]);
        await editAbbreviation(h, 'ub', 'bdx', 'Bordeaux');
        await writeElsewhere([['AddRecord', ABBR_TABLE, null, { Utilisateur: '', Abreviation: 'ub', Texte: 'écrit ailleurs' }]]);
        await undo(h);
        check(problems, 'changement de nom défait alors que « ub » existe : la table ne change pas', mine(), ['bdx=Bordeaux', 'ub=écrit ailleurs']);
        check(problems, 'le coin d\'état dit que le nom est pris, en erreur', [status(), statusClass()], [taken, 'error-msg']);

        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        await undo(h);
        await writeElsewhere([['AddRecord', ABBR_TABLE, null, { Utilisateur: '', Abreviation: 'ub', Texte: 'écrit ailleurs' }]]);
        await redo(h);
        check(problems, 'ajout rétabli alors que « ub » existe : la table ne change pas', mine(), ['ub=écrit ailleurs']);
        check(problems, 'le coin d\'état dit que le nom est pris, en erreur', [status(), statusClass()], [taken, 'error-msg']);
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_abbreviation_comes_back_under_a_new_row_number_when_its_own_is_taken',
    description: 'Le numéro de ligne d\'une abréviation supprimée est repris depuis par la ligne d\'une AUTRE personne : Ctrl + Z la rend sous un numéro neuf sans toucher à l\'autre ligne, Ctrl + Y la supprime sous ce numéro-là, Ctrl + Z la rend encore',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux'], ['', 'mel', 'bonjour']]);
        const ubRow = mineIds()[0];
        await deleteAbbreviation(h, 'ub');
        await writeElsewhere([['AddRecord', ABBR_TABLE, ubRow, { Utilisateur: BOB, Abreviation: 'bob', Texte: 'texte de Bob' }]]);
        await undo(h);
        const back = abbrRows().find(r => r.abbr === 'ub');
        check(problems, 'Ctrl + Z : « ub » est rendue, sous un autre numéro que l\'ancien', [!!back, back && back.id !== ubRow, back && back.user, back && back.text], [true, true, '', 'université de Bordeaux']);
        check(problems, 'Ctrl + Z : la ligne de l\'autre personne est intacte, à son numéro', abbrRows().find(r => r.id === ubRow), { id: ubRow, user: BOB, abbr: 'bob', text: 'texte de Bob' });
        check(problems, 'Ctrl + Z : le coin d\'état la nomme', status(), restoredSaid('ub'));
        await redo(h);
        check(problems, 'Ctrl + Y : « ub » est supprimée sous son nouveau numéro, la ligne de l\'autre personne reste', [mine(), abbrRows().filter(r => r.user === BOB).length], [['mel=bonjour'], 1]);
        await undo(h);
        check(problems, 'Ctrl + Z de nouveau : « ub » revient', [mine(), status()], [['mel=bonjour', 'ub=université de Bordeaux'], restoredSaid('ub')]);
        return verdict(problems, { rows: abbrRows(), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_refused_or_unchanged_abbreviation_leaves_no_step',
    description: 'Une abréviation déjà prise, un texte vide, une ligne enregistrée telle quelle et une écriture que Grist refuse ne laissent aucun pas : la réserve reste vide, Ctrl + Z défait le texte tapé',
    async run(h) {
      const problems = [];
      const api = grist.docApi;
      const realApply = api.applyUserActions;
      const realWarn = console.warn;
      try {
        await seed(h);
        await seedAbbreviations([['', 'ub', 'université de Bordeaux']]);
        reserve().reset();
        await addAbbreviation(h, 'UB', 'autre texte');
        await addAbbreviation(h, 'zz', '   ');
        await editAbbreviation(h, 'ub', 'ub', 'université de Bordeaux');
        console.warn = () => {};
        api.applyUserActions = async () => { throw new Error('écriture refusée (simulée)'); };
        try { await addAbbreviation(h, 'nouv', 'nouveau texte'); await editAbbreviation(h, 'ub', 'ub', 'autre texte'); await deleteAbbreviation(h, 'ub'); }
        finally { api.applyUserActions = realApply; console.warn = realWarn; }
        check(problems, 'la table est celle du départ', mine(), ['ub=université de Bordeaux']);
        check(problems, 'aucune action en réserve', reserve().count(), 0);
        typedAtEnd(' texte');
        await undo(h);
        check(problems, 'Ctrl + Z défait le texte, l\'abréviation reste', [/ texte/.test(text()), mine()], [false, ['ub=université de Bordeaux']]);
        return verdict(problems, { rows: mine(), count: reserve().count() });
      } finally { api.applyUserActions = realApply; console.warn = realWarn; await leave(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_form_editing_a_line_that_ctrl_z_removed_starts_over',
    description: 'Le formulaire modifiait une ligne (« Enregistrer », champs remplis), la fenêtre est refermée, Ctrl + Z retire cette ligne : à la réouverture, le formulaire repart à zéro (« Ajouter », champs vides, pas d\'« Annuler ») au lieu d\'enregistrer dans le vide',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await addAbbreviation(h, 'ub', 'université de Bordeaux');
        await openAbbreviations(h);
        abbrButton('ub', 0).click();
        await h.sleep(30);
        check(problems, 'le formulaire modifie « ub »', formState(), { abbr: 'ub', text: 'université de Bordeaux', submit: I18n.t('common.save'), cancelShown: true });
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z : « ub » est retirée', mine(), []);
        await openAbbreviations(h);
        check(problems, 'les Réglages rouverts : le formulaire repart à zéro', formState(), { abbr: '', text: '', submit: I18n.t('settings.expansion.add'), cancelShown: false });
        check(problems, 'la liste est vide', shownAbbreviations(), []);
        await closeSettings(h);
        return verdict(problems, { form: formState(), rows: mine() });
      } finally { await leave(h); }
    },
  });


  // --- Quatrième lot : l'onglet Vue de Réglages ---
  const stub = () => window.__gristStub;
  const VIEW_TABLE = 'UvLignes';
  const OPTION = { view: 'modeleDeLaVue', date: 'dateDernierExport', row: 'modeleSelonLigne' };
  // Le brouillon des options du widget, tel que Grist le garderait (le faux Grist) ; null quand le réglage est absent ou retiré.
  const optionOf = key => { const value = (stub().state.options || {})[key]; return value === undefined ? null : value; };
  const idText = id => String(id);
  const fire = (field, type) => field.dispatchEvent(new Event(type, { bubbles: true }));
  async function until(h, fn, ms) {
    const end = Date.now() + (ms || 2500);
    while (Date.now() < end) { if (fn()) return true; await h.sleep(40); }
    return !!fn();
  }

  // Ce que le coin d'état dit : la phrase de l'écran pour le modèle de la vue, « Réglage « … » : … » pour les deux autres.
  const viewSet = name => I18n.t('settings.viewTemplate.status.set', { name });
  const viewNone = () => I18n.t('settings.viewTemplate.status.none');
  const dateSaid = column => said(I18n.t('settings.exportDate.title'), column ? I18n.t('status.exportDateColumn', { column }) : I18n.t('status.exportDateNone'));
  const rowSaid = raw => said(I18n.t('settings.rowTemplate.title'), raw && raw.enabled ? I18n.t('status.rowTemplateOn', { count: raw.rules.length }) : I18n.t('status.rowTemplateOff'));

  // Un modèle neuf, par le vrai chemin (Nouveau, puis Enregistrer), et un modèle ouvert par la liste, comme dans scenarios-undo-library.js.
  async function createTemplate(h, name) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(50);
    Editor.setHTML('<p>Contenu de ' + name + '</p>');
    byId('template-name').value = name;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function openTemplate(h, id) {
    await Templates.loadAll();
    const select = byId('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }

  // Deux modèles A et B (recréés seulement s'ils manquent), sans ★ ni option du widget, une table de lignes dont la première est « Urgent », A ouvert, l'historique vide.
  let viewFixture = null;
  async function seedView(h) {
    await seed(h);
    if (!viewFixture || !Templates.getCached().some(t => idText(t.id) === idText(viewFixture.a))) {
      const a = await createTemplate(h, 'Vue un A');
      const b = await createTemplate(h, 'Vue un B');
      viewFixture = { a, b, nameA: 'Vue un A', nameB: 'Vue un B' };
    }
    stub().setVariables(VIEW_TABLE, { Nom: 'Text', Statut: 'Choice', Envoye: 'Date', Aussi: 'DateTime:Europe/Paris' }, { Statut: ['Urgent', 'Archive'] });
    await GristAPI.refreshSchema();
    stub().setWidgetOptions(null);
    await Templates.setDefault(null);
    await Templates.loadAll();
    stub().fireRecord({ id: 1, Nom: 'Ligne 1', Statut: 'Urgent' }, VIEW_TABLE);
    await h.sleep(150);
    await openTemplate(h, viewFixture.a);
    reserve().reset();
    return viewFixture;
  }
  async function leaveView(h) {
    stub().setWidgetOptions(null);
    await h.sleep(150);
    await leave(h);
  }

  const openView = h => openTab(h, 'rowTemplate');
  // Un bouton de l'onglet cliqué comme le fait la personne (« Utiliser … pour cette vue », « Retirer »), puis la fenêtre refermée.
  async function viewButton(h, id) {
    await openView(h);
    byId(id).click();
    await h.sleep(150);
    await closeSettings(h);
  }
  async function pickDateColumn(h, value) {
    await openView(h);
    const select = byId('settings-exportdate-column');
    select.value = value;
    fire(select, 'change');
    await h.sleep(150);
    await closeSettings(h);
  }

  // Le modèle selon la ligne : la case cochée, les champs d'une règle remplis, comme dans l'onglet.
  const ruleRow = index => document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row')[index || 0];
  const ruleField = (cls, index) => ruleRow(index).querySelector('.' + cls);
  const ruleOperator = index => ruleRow(index).querySelector('.macro-rule-line > select');
  const rowOption = () => optionOf(OPTION.row);
  const rule = (column, value, modeleId, operator) => ({ column, operator: operator || '=', value, modeleId: idText(modeleId) });
  async function tickRowTemplate(h) {
    await openView(h);
    byId('settings-rowtemplate-enabled').click();
    await h.sleep(400); // l'onglet écrit le réglage 250 ms après le geste
  }
  async function fillRule(h, index, spec) {
    const column = ruleField('macro-rule-column', index);
    column.value = spec.column;
    fire(column, 'change');
    await h.sleep(200);
    const value = ruleField('macro-rule-value', index);
    value.value = spec.value;
    fire(value, 'input');
    fire(value, 'change');
    const modele = ruleField('macro-rule-modele', index);
    modele.value = idText(spec.modeleId);
    fire(modele, 'change');
    await h.sleep(400);
  }
  // Un réglage déjà enregistré par la vue, comme Grist le rend : l'historique repart de zéro.
  async function savedRowOption(h, raw) {
    stub().setWidgetOptions({ [OPTION.row]: raw });
    await h.sleep(200);
    reserve().reset();
  }
  // Quitter un champ de texte comme la personne : sa série de frappes est finie.
  function leaveField(field) {
    fire(field, 'change');
    field.blur();
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  cases.push({
    id: 'undo_settings_the_view_template_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'Le modèle par défaut de la vue (Réglages > Vue, « Utiliser … pour cette vue », la fenêtre refermée) : UN Ctrl + Z rend le modèle d\'avant (l\'option du widget et le réglage tenu), puis « aucun » ; le coin d\'état dit ce que la vue ouvre, le modèle ouvert ne change pas ; deux Ctrl + Y rendent B',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await viewButton(h, 'settings-viewtemplate-set');
        await openTemplate(h, f.b);
        await viewButton(h, 'settings-viewtemplate-set');
        check(problems, 'B est le modèle de la vue (option et réglage tenu), deux actions en réserve', [optionOf(OPTION.view), ViewTemplate.getId(), reserve().count()], [idText(f.b), idText(f.b), 2]);
        await undo(h);
        check(problems, 'Ctrl + Z : A redevient le modèle de la vue', [optionOf(OPTION.view), ViewTemplate.getId()], [idText(f.a), idText(f.a)]);
        check(problems, 'Ctrl + Z : le coin d\'état dit le modèle de la vue', [status(), statusClass() === 'error-msg'], [viewSet(f.nameA), false]);
        check(problems, 'Ctrl + Z : le modèle ouvert ne change pas', idText(Templates.getCurrentId()), idText(f.b));
        await openView(h);
        check(problems, 'les Réglages rouverts disent A', byId('settings-viewtemplate-status').textContent, viewSet(f.nameA));
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z suivant : la vue n\'a plus de modèle', [optionOf(OPTION.view), ViewTemplate.getId(), status()], [null, null, viewNone()]);
        await redo(h);
        await redo(h);
        check(problems, 'deux Ctrl + Y : B revient', [optionOf(OPTION.view), ViewTemplate.getId(), status()], [idText(f.b), idText(f.b), viewSet(f.nameB)]);
        return verdict(problems, { option: optionOf(OPTION.view), status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_clearing_the_view_template_goes_back_by_the_bar_buttons',
    description: 'Le bouton « Retirer » de la section : le bouton Annuler de la barre rend le modèle de la vue, le bouton Rétablir le retire de nouveau',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await viewButton(h, 'settings-viewtemplate-set');
        await viewButton(h, 'settings-viewtemplate-clear');
        check(problems, 'la vue n\'a plus de modèle, deux actions en réserve', [optionOf(OPTION.view), ViewTemplate.getId(), reserve().count()], [null, null, 2]);
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'bouton Annuler : A revient', [optionOf(OPTION.view), ViewTemplate.getId(), status()], [idText(f.a), idText(f.a), viewSet(f.nameA)]);
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'bouton Rétablir : le choix est retiré', [optionOf(OPTION.view), ViewTemplate.getId(), status()], [null, null, viewNone()]);
        return verdict(problems, { option: optionOf(OPTION.view), status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_export_date_column_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'La colonne de la date du dernier export PDF (Réglages > Vue) : UN Ctrl + Z rend la colonne d\'avant, puis « aucune » ; le coin d\'état la nomme ; les Réglages rouverts la montrent ; UN Ctrl + Y la rend',
    async run(h) {
      const problems = [];
      try {
        await seedView(h);
        await pickDateColumn(h, 'Envoye');
        await pickDateColumn(h, 'Aussi');
        check(problems, '« Aussi » est choisie (option et réglage tenu), deux actions en réserve', [optionOf(OPTION.date), ExportDate.getColumn(), reserve().count()], ['Aussi', 'Aussi', 2]);
        await undo(h);
        check(problems, 'Ctrl + Z : « Envoye » revient', [optionOf(OPTION.date), ExportDate.getColumn(), status(), statusClass() === 'error-msg'], ['Envoye', 'Envoye', dateSaid('Envoye'), false]);
        await openView(h);
        check(problems, 'les Réglages rouverts montrent « Envoye »', byId('settings-exportdate-column').value, 'Envoye');
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z suivant : aucune colonne', [optionOf(OPTION.date), ExportDate.getColumn(), status()], [null, null, dateSaid(null)]);
        await openView(h);
        check(problems, 'les Réglages rouverts ne montrent aucune colonne', byId('settings-exportdate-column').value, '');
        await closeSettings(h);
        await redo(h);
        await redo(h);
        check(problems, 'deux Ctrl + Y : « Aussi » revient', [optionOf(OPTION.date), ExportDate.getColumn(), status()], ['Aussi', 'Aussi', dateSaid('Aussi')]);
        return verdict(problems, { option: optionOf(OPTION.date), status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_ticking_the_row_template_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'La case « Choisir le modèle selon la ligne » cochée (la fenêtre refermée) : UN Ctrl + Z retire le réglage (option absente, case décochée aux Réglages rouverts), le coin d\'état dit « désactivé » ; UN Ctrl + Y le rend',
    async run(h) {
      const problems = [];
      try {
        await seedView(h);
        await tickRowTemplate(h);
        await closeSettings(h);
        check(problems, 'le réglage est écrit, une action en réserve', [rowOption(), reserve().count()], [{ enabled: true, rules: [], otherwise: 'default' }, 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : le réglage est retiré', [rowOption(), RowTemplate.readRaw().enabled], [null, false]);
        check(problems, 'Ctrl + Z : le coin d\'état le dit', [status(), statusClass() === 'error-msg'], [rowSaid(null), false]);
        await openView(h);
        check(problems, 'les Réglages rouverts : case décochée, onglet grisé', [byId('settings-rowtemplate-enabled').checked, byId('settings-rowtemplate-body').classList.contains('is-off')], [false, true]);
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : le réglage revient', [rowOption(), status()], [{ enabled: true, rules: [], otherwise: 'default' }, rowSaid({ enabled: true, rules: [] })]);
        await openView(h);
        check(problems, 'les Réglages rouverts : case cochée', byId('settings-rowtemplate-enabled').checked, true);
        await closeSettings(h);
        return verdict(problems, { option: rowOption(), status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_row_template_rule_is_one_step_when_it_becomes_complete',
    description: 'Une règle remplie dans l\'onglet (colonne, opérateur, valeur, modèle) : tant qu\'elle est incomplète rien n\'est écrit ni défait ; dès que le modèle est choisi, UN Ctrl + Z la retire (la case reste cochée), puis un deuxième décoche la case ; deux Ctrl + Y rendent la règle',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await tickRowTemplate(h);
        await fillRule(h, 0, { column: 'Nom', value: 'abc', modeleId: f.b });
        await closeSettings(h);
        const wanted = { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' };
        check(problems, 'la règle est écrite, deux actions en réserve (la case, la règle)', [rowOption(), reserve().count()], [wanted, 2]);
        await undo(h);
        check(problems, 'Ctrl + Z : la règle est retirée, la case reste cochée', [rowOption(), status()], [{ enabled: true, rules: [], otherwise: 'default' }, rowSaid({ enabled: true, rules: [] })]);
        await openView(h);
        check(problems, 'les Réglages rouverts : aucune règle, la case cochée', [document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length, byId('settings-rowtemplate-enabled').checked], [0, true]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z suivant : le réglage est retiré', [rowOption(), status()], [null, rowSaid(null)]);
        await redo(h);
        await redo(h);
        check(problems, 'deux Ctrl + Y : la règle revient, avec ses quatre champs', [rowOption(), status()], [wanted, rowSaid(wanted)]);
        await openView(h);
        check(problems, 'les Réglages rouverts montrent la règle', [ruleField('macro-rule-column', 0).value, ruleOperator(0).value, ruleField('macro-rule-value', 0).value, ruleField('macro-rule-modele', 0).value], ['Nom', '=', 'abc', idText(f.b)]);
        await closeSettings(h);
        return verdict(problems, { option: rowOption(), status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_adding_an_empty_rule_leaves_no_step',
    description: '« + Ajouter une règle » seul ne laisse aucun pas : une règle vide n\'est pas un réglage (elle n\'est écrite que complète), elle ne survit pas à la fermeture des Réglages, et Ctrl + Z défait le texte tapé',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await savedRowOption(h, { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' });
        await openView(h);
        byId('settings-rowtemplate-add').click();
        await h.sleep(400);
        check(problems, 'la règle vide est à l\'écran, à côté de la première', document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length, 2);
        await closeSettings(h);
        check(problems, 'aucune action en réserve, le réglage est celui du départ', [reserve().count(), rowOption().rules.length], [0, 1]);
        await openView(h);
        check(problems, 'les Réglages rouverts : la règle vide a disparu', document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length, 1);
        await closeSettings(h);
        typedAtEnd(' texte');
        await undo(h);
        check(problems, 'Ctrl + Z défait le texte, le réglage reste', [/ texte/.test(text()), rowOption().rules.length], [false, 1]);
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_removed_row_template_rule_comes_back_in_its_place',
    description: 'Une règle retirée par sa croix : UN Ctrl + Z la rend, à sa place dans l\'ordre des règles (la première qui correspond gagne), le coin d\'état dit combien il y en a ; UN Ctrl + Y la retire de nouveau',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        const two = { enabled: true, rules: [rule('Nom', 'premier', f.a), rule('Nom', 'second', f.b)], otherwise: 'default' };
        const one = { enabled: true, rules: [rule('Nom', 'second', f.b)], otherwise: 'default' };
        await savedRowOption(h, two);
        await openView(h);
        ruleRow(0).querySelector('.macro-rule-remove').click();
        await h.sleep(400);
        await closeSettings(h);
        check(problems, 'la première règle est retirée, une action en réserve', [rowOption(), reserve().count()], [one, 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : les deux règles, dans leur ordre', [rowOption(), status()], [two, rowSaid(two)]);
        await redo(h);
        check(problems, 'Ctrl + Y : une règle', [rowOption(), status()], [one, rowSaid(one)]);
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_row_template_otherwise_choice_goes_back',
    description: '« Si aucune règle ne correspond » changé (« Laisser le modèle ouvert ») : UN Ctrl + Z rend « Ouvrir le modèle par défaut », UN Ctrl + Y le choix fait',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        const base = { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' };
        await savedRowOption(h, base);
        await openView(h);
        const otherwise = byId('settings-rowtemplate-otherwise');
        otherwise.value = 'keep';
        fire(otherwise, 'change');
        await h.sleep(400);
        await closeSettings(h);
        check(problems, 'le choix est écrit, une action en réserve', [rowOption().otherwise, reserve().count()], ['keep', 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : « Ouvrir le modèle par défaut » revient', rowOption().otherwise, 'default');
        await openView(h);
        check(problems, 'les Réglages rouverts le montrent', byId('settings-rowtemplate-otherwise').value, 'default');
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : « Laisser le modèle ouvert »', rowOption().otherwise, 'keep');
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_typing_a_rule_value_is_one_step_even_with_pauses',
    description: 'La valeur d\'une règle tapée avec des pauses de plus de 250 ms (le réglage s\'écrit à chaque pause) : aucun pas tant que le champ n\'est pas quitté, puis UN seul ; UN Ctrl + Z rend la valeur d\'avant, UN Ctrl + Y la valeur tapée',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await savedRowOption(h, { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' });
        await openView(h);
        const field = ruleField('macro-rule-value', 0);
        check(problems, 'la valeur est un champ de texte', field.tagName, 'INPUT');
        field.focus();
        for (const part of ['abcd', 'abcde', 'abcdef']) { field.value = part; fire(field, 'input'); await h.sleep(400); }
        check(problems, 'le réglage est écrit pendant la frappe', rowOption().rules[0].value, 'abcdef');
        check(problems, 'aucun pas tant que le champ n\'est pas quitté', reserve().count(), 0);
        leaveField(field);
        await h.sleep(60);
        check(problems, 'le champ quitté : UN pas', reserve().count(), 1);
        await closeSettings(h);
        check(problems, 'la fermeture n\'en ajoute pas', reserve().count(), 1);
        await undo(h);
        check(problems, 'UN Ctrl + Z rend la valeur d\'avant', [rowOption().rules[0].value, status()], ['abc', rowSaid(rowOption())]);
        await redo(h);
        check(problems, 'UN Ctrl + Y rend la valeur tapée', rowOption().rules[0].value, 'abcdef');
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_closing_the_settings_inside_a_rule_value_ends_its_step',
    description: 'La fenêtre Réglages fermée alors que le focus est encore dans la valeur d\'une règle (aucune sortie du champ) : ce qui attend est écrit et la saisie est UN pas ; UN Ctrl + Z rend la valeur d\'avant',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await savedRowOption(h, { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' });
        await openView(h);
        const field = ruleField('macro-rule-value', 0);
        field.focus();
        field.value = 'abcdef';
        fire(field, 'input');
        await h.sleep(400);
        field.value = 'abcdefg';
        fire(field, 'input'); // écrit dans les 250 ms qui suivent : la fermeture le fait à leur place
        await closeSettings(h);
        check(problems, 'la fermeture écrit la dernière frappe, UN pas', [rowOption().rules[0].value, reserve().count()], ['abcdefg', 1]);
        await undo(h);
        check(problems, 'UN Ctrl + Z rend la valeur d\'avant', rowOption().rules[0].value, 'abc');
        await redo(h);
        check(problems, 'UN Ctrl + Y rend la valeur tapée', rowOption().rules[0].value, 'abcdefg');
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_rule_value_then_a_list_are_two_steps',
    description: 'La valeur d\'une règle tapée, puis l\'opérateur changé sans quitter le champ : deux pas - UN Ctrl + Z rend l\'opérateur d\'avant et garde la valeur tapée, un deuxième rend la valeur d\'avant ; deux Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await savedRowOption(h, { enabled: true, rules: [rule('Nom', 'abc', f.b)], otherwise: 'default' });
        await openView(h);
        const field = ruleField('macro-rule-value', 0);
        field.focus();
        field.value = 'xyz';
        fire(field, 'input');
        const operator = ruleOperator(0);
        operator.value = '≠';
        fire(operator, 'change');
        await h.sleep(450);
        await closeSettings(h);
        check(problems, 'la valeur et l\'opérateur sont écrits, deux actions en réserve', [rowOption().rules[0].value, rowOption().rules[0].operator, reserve().count()], ['xyz', '≠', 2]);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : l\'opérateur d\'avant, la valeur tapée reste', [rowOption().rules[0].operator, rowOption().rules[0].value], ['=', 'xyz']);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : la valeur d\'avant', [rowOption().rules[0].operator, rowOption().rules[0].value], ['=', 'abc']);
        await redo(h);
        check(problems, 'Ctrl + Y 1 : la valeur tapée, l\'opérateur d\'avant', [rowOption().rules[0].operator, rowOption().rules[0].value], ['=', 'xyz']);
        await redo(h);
        check(problems, 'Ctrl + Y 2 : l\'opérateur changé', [rowOption().rules[0].operator, rowOption().rules[0].value], ['≠', 'xyz']);
        return verdict(problems, { option: rowOption() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_row_template_comes_back_without_opening_a_template',
    description: 'Défaire ou rétablir le modèle selon la ligne n\'ouvre aucun modèle : le modèle ouvert à la main reste, même quand la règle rétablie désigne l\'autre, y compris quand Grist renvoie la même ligne ; Ctrl + Y marche encore après Ctrl + Z (ouvrir un modèle viderait ce qui se rétablit) ; la ligne suivante suit la règle',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        const wanted = { enabled: true, rules: [rule('Statut', 'Urgent', f.b)], otherwise: 'default' };
        await tickRowTemplate(h);
        await fillRule(h, 0, { column: 'Statut', value: 'Urgent', modeleId: f.b });
        await closeSettings(h);
        check(problems, 'la règle est écrite et ouvre B pour la ligne 1 « Urgent »', [rowOption(), await until(h, () => idText(Templates.getCurrentId()) === idText(f.b))], [wanted, true]);
        await openTemplate(h, f.a);
        reserve().reset();
        stub().setWidgetOptions({ [OPTION.row]: wanted });
        await h.sleep(150);
        // Un réglage posé par la personne, puis défait et rétabli, avec A ouvert à la main.
        await openView(h);
        const otherwise = byId('settings-rowtemplate-otherwise');
        otherwise.value = 'keep';
        fire(otherwise, 'change');
        await h.sleep(400);
        await closeSettings(h);
        await until(h, () => idText(Templates.getCurrentId()) === idText(f.b)); // la fermeture applique le réglage à la ligne 1 : B s'ouvre
        await openTemplate(h, f.a);
        check(problems, 'A est ouvert à la main, une action en réserve', [idText(Templates.getCurrentId()), reserve().count()], [idText(f.a), 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : « Ouvrir le modèle par défaut » revient, A reste ouvert', [rowOption().otherwise, idText(Templates.getCurrentId())], ['default', idText(f.a)]);
        await redo(h);
        check(problems, 'Ctrl + Y marche encore : « Laisser le modèle ouvert », A reste ouvert', [rowOption().otherwise, idText(Templates.getCurrentId())], ['keep', idText(f.a)]);
        await undo(h);
        stub().fireRecord({ id: 1, Nom: 'Ligne 1', Statut: 'Urgent' }, VIEW_TABLE); // Grist renvoie la même ligne
        await h.sleep(600);
        check(problems, 'la même ligne reçue de nouveau n\'ouvre pas B par-dessus A', idText(Templates.getCurrentId()), idText(f.a));
        stub().fireRecord({ id: 2, Nom: 'Ligne 2', Statut: 'Urgent' }, VIEW_TABLE);
        check(problems, 'la ligne suivante suit la règle : B s\'ouvre', await until(h, () => idText(Templates.getCurrentId()) === idText(f.b)), true);
        return verdict(problems, { option: rowOption(), open: idText(Templates.getCurrentId()) });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_view_setting_given_back_by_grist_is_never_overwritten',
    description: 'Le « Retour » de Grist rend les options enregistrées, loin de ce que les gestes ont laissé : Ctrl + Z ne les écrase pas - pour le modèle de la vue, la colonne de la date et le modèle selon la ligne -, rien n\'est écrit et le coin d\'état le dit',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        await viewButton(h, 'settings-viewtemplate-set');
        await pickDateColumn(h, 'Envoye');
        await tickRowTemplate(h);
        await closeSettings(h);
        check(problems, 'les trois réglages sont posés, trois actions en réserve', [optionOf(OPTION.view), optionOf(OPTION.date), rowOption() !== null, reserve().count()], [idText(f.a), 'Envoye', true, 3]);
        stub().revertOptions(); // « Retour » : Grist rend les options enregistrées (aucune)
        await h.sleep(200);
        check(problems, 'le « Retour » a rendu les options enregistrées', [ViewTemplate.getId(), ExportDate.getColumn(), RowTemplate.readRaw().enabled], [null, null, false]);
        const writes = [];
        const realSet = grist.setOption;
        grist.setOption = async function (key) { writes.push(key); return realSet.apply(this, arguments); };
        try {
          for (const label of ['modèle selon la ligne', 'colonne de la date', 'modèle de la vue']) {
            byId('status-msg').textContent = '';
            await undo(h);
            check(problems, 'Ctrl + Z (' + label + ') : le coin d\'état dit que le réglage a changé', [status(), statusClass() === 'error-msg'], [I18n.t('history.settingChanged'), true]);
          }
        } finally { grist.setOption = realSet; }
        check(problems, 'rien n\'est écrit dans les options du widget', writes, []);
        return verdict(problems, { writes, status: status() });
      } finally { await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_a_view_setting_is_not_written_for_a_read_only_person',
    description: 'Une personne devenue lecteur (droits changés) : Ctrl + Z ne défait ni le modèle de la vue, ni la colonne de la date, ni le modèle selon la ligne - rien n\'est écrit, le coin d\'état le dit ; rendue à un compte qui modifie, les mêmes pas se défont',
    async run(h) {
      const problems = [];
      const realGet = AccessRights.get;
      try {
        const f = await seedView(h);
        await viewButton(h, 'settings-viewtemplate-set');
        await pickDateColumn(h, 'Envoye');
        await tickRowTemplate(h);
        await closeSettings(h);
        const before = [optionOf(OPTION.view), optionOf(OPTION.date), rowOption()];
        check(problems, 'les trois réglages sont posés, trois actions en réserve', reserve().count(), 3);
        AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
        for (const label of ['modèle selon la ligne', 'colonne de la date', 'modèle de la vue']) {
          byId('status-msg').textContent = '';
          await undo(h);
          check(problems, 'Ctrl + Z (' + label + ') en lecture seule : le coin d\'état le dit', [status(), statusClass() === 'error-msg'], [I18n.t('history.settingLocked'), true]);
        }
        check(problems, 'rien n\'est écrit', [optionOf(OPTION.view), optionOf(OPTION.date), rowOption()], before);
        AccessRights.get = realGet;
        for (let i = 0; i < 3; i++) await redo(h);
        for (let i = 0; i < 3; i++) await undo(h);
        check(problems, 'un compte qui modifie : les trois pas se défont', [optionOf(OPTION.view), optionOf(OPTION.date), rowOption()], [null, null, null]);
        return verdict(problems, { f: idText(f.a), status: status() });
      } finally { AccessRights.get = realGet; await leaveView(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_view_settings_are_steps_in_the_order_of_the_gestures_with_the_text',
    description: 'Du texte, le modèle de la vue, la colonne de la date, la case du modèle selon la ligne, du texte : cinq Ctrl + Z défont dans l\'ordre inverse, cinq Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const f = await seedView(h);
        typedAtEnd(' avant');
        await viewButton(h, 'settings-viewtemplate-set');
        await pickDateColumn(h, 'Envoye');
        await tickRowTemplate(h);
        await closeSettings(h);
        typedAtEnd(' après');
        const state = () => [/ avant/.test(text()), optionOf(OPTION.view), optionOf(OPTION.date), rowOption() !== null, / après/.test(text())];
        check(problems, 'tout est posé', state(), [true, idText(f.a), 'Envoye', true, true]);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : le texte d\'après', state(), [true, idText(f.a), 'Envoye', true, false]);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : la case', state(), [true, idText(f.a), 'Envoye', false, false]);
        await undo(h);
        check(problems, 'Ctrl + Z 3 : la colonne de la date', state(), [true, idText(f.a), null, false, false]);
        await undo(h);
        check(problems, 'Ctrl + Z 4 : le modèle de la vue', state(), [true, null, null, false, false]);
        await undo(h);
        check(problems, 'Ctrl + Z 5 : le texte d\'avant', state(), [false, null, null, false, false]);
        for (let i = 0; i < 5; i++) await redo(h);
        check(problems, 'cinq Ctrl + Y : tout revient', state(), [true, idText(f.a), 'Envoye', true, true]);
        return verdict(problems, { state: state() });
      } finally { await leaveView(h); }
    },
  });


  // --- Cinquième lot : l'onglet Accès de Réglages ---
  // Le réglage des droits (js/access-rights.js) est une option du widget comme les trois de l'onglet Vue : un choix qui change le réglage ENREGISTRÉ - la configuration normalisée, ou rien tant qu'elle est incomplète - est UN pas ;
  // la table et la colonne email d'un réglage pas encore complet ne sont pas enregistrées et ne laissent pas de pas ; défaire ou rétablir écrit l'option comme le choix de l'onglet, recalcule les droits, et reste verrouillé
  // comme l'onglet (une personne en lecture seule ne se déverrouille pas par Ctrl + Z).
  const RIGHTS = { table: 'UaDroits', other: 'UaDroitsBis', email: 'ana@exemple.fr' };
  const ACCESS_KEY = 'droitsAcces';
  const ACCESS_IDS = { table: 'settings-access-table', email: 'settings-access-email', readOnly: 'settings-access-readonly', exportCol: 'settings-access-export', comments: 'settings-access-comments' };
  const accessOption = () => optionOf(ACCESS_KEY);
  // La configuration que l'onglet écrit (js/access-rights.js:normalizeConfig) ; les colonnes non choisies valent ''.
  const accessConfig = (table, columns) => Object.assign({ source: 'personne', table, emailColumn: 'Email', readOnlyColumn: '', exportColumn: '', commentsColumn: '', cleanReading: false }, columns);
  const accessSaid = value => said(I18n.t('settings.tab.access'), value ? I18n.t('status.accessTable', { table: value.table }) : I18n.t('status.accessNone'));
  const openAccess = h => openTab(h, 'access');
  // Un choix de l'onglet comme le fait la personne : la liste cachée prend la valeur, la fenêtre l'entend ; on attend que les droits soient relus.
  async function chooseAccess(h, id, value) {
    const select = byId(id);
    select.value = value;
    fire(select, 'change');
    await h.sleep(250);
    await until(h, () => AccessRights.getStatus().state !== 'pending', 3000);
  }
  async function tickCleanReading(h) {
    byId('settings-access-clean-reading').click();
    await h.sleep(250);
    await until(h, () => AccessRights.getStatus().state !== 'pending', 3000);
  }
  const rightColumns = () => { const option = accessOption(); return option ? [option.exportColumn, option.commentsColumn, option.readOnlyColumn] : null; };

  // Une table des droits de deux lignes (la personne courante, « Ana@Exemple.fr » écrit autrement que son email Grist, et une autre) et une seconde table à autre noms de colonnes, sans réglage ; l'historique vide.
  async function seedAccess(h, flags) {
    await seed(h);
    const own = Object.assign({ readOnly: false, export: true, comments: true }, flags);
    stub().setUserEmail(RIGHTS.email);
    stub().setVariables(RIGHTS.table, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub().setRows(RIGHTS.table, [
      { id: 1, Email: 'autre@exemple.fr', LectureSeule: true, Export: false, Commentaires: false },
      { id: 2, Email: 'Ana@Exemple.fr', LectureSeule: own.readOnly, Export: own.export, Commentaires: own.comments },
    ]);
    stub().setVariables(RIGHTS.other, { Email: 'Text', Modif: 'Bool', Sortie: 'Bool' });
    stub().setRows(RIGHTS.other, [{ id: 1, Email: 'ana@exemple.fr', Modif: false, Sortie: true }]);
    await GristAPI.refreshSchema();
    stub().setWidgetOptions(null);
    await h.sleep(150);
    reserve().reset();
  }
  async function leaveAccess(h) {
    byId('settings-modal').style.display = 'none';
    stub().setWidgetOptions(null);
    await until(h, () => !AccessRights.getConfig() && !AccessRights.get().readOnly, 3000);
    stub().dropTable(RIGHTS.table);
    stub().dropTable(RIGHTS.other);
    await GristAPI.refreshSchema();
    byId('btn-mode-edit').click();
    await h.sleep(300);
    await leave(h);
  }

  cases.push({
    id: 'undo_settings_the_access_setting_goes_back_with_ctrl_z_and_forward_with_ctrl_y',
    description: 'Réglages > Accès : la table des droits et la colonne email ne laissent aucun pas tant que le réglage n\'est pas complet ; la première colonne de droit choisie est UN pas : Ctrl + Z retire le réglage (option du widget, droits recalculés, coin d\'état), Ctrl + Y le rend ; les Réglages rouverts le montrent',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        check(problems, 'la table choisie : l\'email est pré-choisi, rien n\'est enregistré, aucune action en réserve', [byId(ACCESS_IDS.email).value, accessOption(), reserve().count()], ['Email', null, 0]);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        const wanted = accessConfig(RIGHTS.table, { exportColumn: 'Export' });
        check(problems, 'la colonne d\'export complète le réglage : il est écrit, UNE action en réserve', [accessOption(), reserve().count()], [wanted, 1]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z : le réglage est retiré (option du widget, droits)', [accessOption(), AccessRights.getConfig(), AccessRights.getStatus().state], [null, null, 'off']);
        check(problems, 'Ctrl + Z : le coin d\'état le dit', [status(), statusClass() === 'error-msg'], [accessSaid(null), false]);
        await openAccess(h);
        check(problems, 'les Réglages rouverts : aucune table', byId(ACCESS_IDS.table).value, '');
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y : le réglage revient (option du widget, droits relus)', [accessOption(), AccessRights.getConfig(), AccessRights.getStatus().state], [wanted, wanted, 'found']);
        check(problems, 'Ctrl + Y : le coin d\'état nomme la table', status(), accessSaid(wanted));
        await openAccess(h);
        check(problems, 'les Réglages rouverts montrent la table, l\'email et l\'export', [byId(ACCESS_IDS.table).value, byId(ACCESS_IDS.email).value, byId(ACCESS_IDS.exportCol).value], [RIGHTS.table, 'Email', 'Export']);
        await closeSettings(h);
        return verdict(problems, { option: accessOption(), status: status() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_each_access_right_column_is_a_step',
    description: 'Les colonnes « Export autorisé », « Commentaires autorisés » puis « Lecture seule » choisies l\'une après l\'autre : trois pas, trois Ctrl + Z les défont dans l\'ordre inverse (jusqu\'à plus de réglage), trois Ctrl + Y les rendent',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        await chooseAccess(h, ACCESS_IDS.comments, 'Commentaires');
        await chooseAccess(h, ACCESS_IDS.readOnly, 'LectureSeule');
        await closeSettings(h);
        check(problems, 'les trois colonnes sont écrites, trois actions en réserve', [rightColumns(), reserve().count()], [['Export', 'Commentaires', 'LectureSeule'], 3]);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : « Lecture seule » retirée', [rightColumns(), AccessRights.getConfig() && AccessRights.getConfig().readOnlyColumn], [['Export', 'Commentaires', ''], '']);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : « Commentaires » retirée', rightColumns(), ['Export', '', '']);
        await undo(h);
        check(problems, 'Ctrl + Z 3 : plus de réglage', [accessOption(), AccessRights.getConfig()], [null, null]);
        await redo(h);
        check(problems, 'Ctrl + Y 1 : l\'export', [rightColumns(), AccessRights.getConfig() && AccessRights.getConfig().exportColumn], [['Export', '', ''], 'Export']);
        await redo(h);
        await redo(h);
        check(problems, 'Ctrl + Y 2 et 3 : les commentaires puis « Lecture seule »', [rightColumns(), status()], [['Export', 'Commentaires', 'LectureSeule'], accessSaid(accessOption())]);
        return verdict(problems, { option: accessOption() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_access_clean_reading_box_is_a_step',
    description: 'La case « Ouvrir la Lecture épurée aux personnes en lecture seule » (grisée tant qu\'aucune colonne « Lecture seule » n\'est choisie) cochée : UN pas, défait par Ctrl + Z (la colonne reste), rendu par Ctrl + Y ; les Réglages rouverts la montrent',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        check(problems, 'sans colonne « Lecture seule », la case est grisée', byId('settings-access-clean-reading').disabled, true);
        await chooseAccess(h, ACCESS_IDS.readOnly, 'LectureSeule');
        await tickCleanReading(h);
        check(problems, 'la case cochée écrit « cleanReading », deux actions en réserve (la colonne, la case)', [accessOption() && accessOption().cleanReading, reserve().count()], [true, 2]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z : la case est décochée, la colonne reste', [accessOption() && accessOption().cleanReading, accessOption() && accessOption().readOnlyColumn], [false, 'LectureSeule']);
        await openAccess(h);
        check(problems, 'les Réglages rouverts : colonne choisie, case décochée et dégrisée', [byId(ACCESS_IDS.readOnly).value, byId('settings-access-clean-reading').checked, byId('settings-access-clean-reading').disabled], ['LectureSeule', false, false]);
        await closeSettings(h);
        await redo(h);
        await openAccess(h);
        check(problems, 'Ctrl + Y : la case est cochée (option et Réglages rouverts)', [accessOption() && accessOption().cleanReading, byId('settings-access-clean-reading').checked], [true, true]);
        await closeSettings(h);
        await undo(h);
        await undo(h);
        check(problems, 'deux Ctrl + Z de plus : plus de réglage', accessOption(), null);
        return verdict(problems, { option: accessOption() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_changing_the_access_table_is_a_step_that_gives_the_old_setting_back',
    description: 'Une autre table des droits choisie alors qu\'un réglage complet existe retire ce réglage (ses colonnes ne valent rien dans l\'autre table) : UN pas, que Ctrl + Z défait en rendant TOUT le réglage d\'avant (table, email, colonnes) ; la colonne choisie ensuite dans la nouvelle table est un autre pas',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        await chooseAccess(h, ACCESS_IDS.comments, 'Commentaires');
        const first = accessConfig(RIGHTS.table, { exportColumn: 'Export', commentsColumn: 'Commentaires' });
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.other);
        check(problems, 'l\'autre table retire le réglage (il est incomplet), son email est pré-choisi', [accessOption(), byId(ACCESS_IDS.email).value, reserve().count()], [null, 'Email', 3]);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Sortie');
        const second = accessConfig(RIGHTS.other, { exportColumn: 'Sortie' });
        check(problems, 'la colonne de l\'autre table complète un nouveau réglage, quatre actions en réserve', [accessOption(), reserve().count()], [second, 4]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : plus de réglage (le nouveau est retiré)', [accessOption(), AccessRights.getConfig()], [null, null]);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : TOUT le réglage d\'avant revient (table, email, les deux colonnes)', [accessOption(), AccessRights.getConfig()], [first, first]);
        await openAccess(h);
        check(problems, 'les Réglages rouverts montrent la première table et ses deux colonnes', [byId(ACCESS_IDS.table).value, byId(ACCESS_IDS.exportCol).value, byId(ACCESS_IDS.comments).value], [RIGHTS.table, 'Export', 'Commentaires']);
        await closeSettings(h);
        await redo(h);
        check(problems, 'Ctrl + Y 1 : le réglage est retiré de nouveau', accessOption(), null);
        await redo(h);
        check(problems, 'Ctrl + Y 2 : le réglage de l\'autre table', [accessOption(), status()], [second, accessSaid(second)]);
        return verdict(problems, { option: accessOption() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_clearing_the_access_email_column_is_a_step',
    description: 'La colonne email remise à « — Aucune — » rend le réglage incomplet, donc retiré : UN pas ; Ctrl + Z rend le réglage avec son email, Ctrl + Y le retire',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        const wanted = accessConfig(RIGHTS.table, { exportColumn: 'Export' });
        await chooseAccess(h, ACCESS_IDS.email, '');
        check(problems, 'sans email le réglage est retiré, deux actions en réserve', [accessOption(), reserve().count()], [null, 2]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z : le réglage revient avec son email', [accessOption(), AccessRights.getConfig()], [wanted, wanted]);
        await redo(h);
        check(problems, 'Ctrl + Y : le réglage est retiré de nouveau', [accessOption(), AccessRights.getConfig(), status()], [null, null, accessSaid(null)]);
        return verdict(problems, { option: accessOption() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_undoing_the_access_setting_changes_the_rights_at_once',
    description: 'La ligne de la personne dans la table des droits retire l\'export : le réglage choisi la prive d\'export (droits relus), Ctrl + Z lui rend tous les droits, Ctrl + Y la prive de nouveau - les droits suivent le réglage défait ou rétabli, sans recharger',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h, { export: false });
        check(problems, 'sans réglage la personne a tous les droits', [AccessRights.get().canExport, AccessRights.getStatus().state], [true, 'off']);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        check(problems, 'le réglage choisi la prive d\'export', [AccessRights.get().canExport, AccessRights.getStatus().state, reserve().count()], [false, 'found', 1]);
        await closeSettings(h);
        await undo(h);
        check(problems, 'Ctrl + Z : l\'export est rendu', [AccessRights.get().canExport, AccessRights.getStatus().state], [true, 'off']);
        await redo(h);
        check(problems, 'Ctrl + Y : l\'export est retiré de nouveau', [AccessRights.get().canExport, AccessRights.getStatus().state], [false, 'found']);
        return verdict(problems, { rights: AccessRights.get() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_access_setting_that_locks_the_person_is_not_undone_by_ctrl_z',
    description: 'La personne qui se met elle-même en lecture seule par le réglage (sa ligne coche « Lecture seule ») est verrouillée dans l\'onglet, et Ctrl + Z ne la déverrouille pas non plus : rien n\'est écrit, le coin d\'état le dit ; la ligne corrigée dans la table, le même Ctrl + Z défait le réglage',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h, { readOnly: true });
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.readOnly, 'LectureSeule');
        await until(h, () => AccessRights.get().readOnly, 3000);
        const wanted = accessOption();
        check(problems, 'le réglage l\'a mise en lecture seule, onglet verrouillé, une action en réserve', [AccessRights.get().readOnly, byId(ACCESS_IDS.table).disabled, reserve().count()], [true, true, 1]);
        await closeSettings(h);
        byId('status-msg').textContent = '';
        await undo(h);
        check(problems, 'Ctrl + Z : le coin d\'état dit que le réglage est verrouillé', [status(), statusClass() === 'error-msg'], [I18n.t('history.settingLocked'), true]);
        check(problems, 'rien n\'est écrit : le réglage et la lecture seule restent', [accessOption(), AccessRights.get().readOnly], [wanted, true]);
        // La ligne de la personne corrigée dans la table des droits : elle n'est plus en lecture seule, l'onglet est libre.
        stub().setRows(RIGHTS.table, [
          { id: 1, Email: 'autre@exemple.fr', LectureSeule: true, Export: false, Commentaires: false },
          { id: 2, Email: 'Ana@Exemple.fr', LectureSeule: false, Export: true, Commentaires: true },
        ]);
        await AccessRights.refresh();
        await until(h, () => !AccessRights.get().readOnly, 3000);
        // Le Ctrl + Z refusé a rendu son repère à l'historique : Ctrl + Y le reprend (le réglage est déjà fait, rien n'est écrit), et le Ctrl + Z suivant défait.
        await redo(h);
        check(problems, 'Ctrl + Y après le refus : le réglage reste tel quel', accessOption(), wanted);
        await undo(h);
        check(problems, 'Ctrl + Z, la personne n\'étant plus en lecture seule : le réglage est retiré', [accessOption(), AccessRights.getConfig()], [null, null]);
        await redo(h);
        check(problems, 'Ctrl + Y : le réglage revient', accessOption(), wanted);
        return verdict(problems, { status: status(), readOnly: AccessRights.get().readOnly });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_an_access_setting_changed_since_is_never_overwritten',
    description: 'Le « Retour » de Grist rend les options enregistrées, et une autre personne qui enregistre la vue pose un autre réglage : Ctrl + Z ne les écrase pas, rien n\'est écrit dans les options du widget et le coin d\'état dit que le réglage a changé',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        await chooseAccess(h, ACCESS_IDS.comments, 'Commentaires');
        await closeSettings(h);
        check(problems, 'deux actions en réserve', reserve().count(), 2);
        stub().revertOptions(); // « Retour » : Grist rend les options enregistrées (aucune)
        await h.sleep(250);
        check(problems, 'le « Retour » a rendu les options enregistrées : plus de réglage', [accessOption(), AccessRights.getConfig()], [null, null]);
        const writes = [];
        const realSet = grist.setOption;
        grist.setOption = async function (key) { writes.push(key); return realSet.apply(this, arguments); };
        try {
          byId('status-msg').textContent = '';
          await undo(h);
          check(problems, 'Ctrl + Z après le « Retour » : le coin d\'état dit que le réglage a changé', [status(), statusClass() === 'error-msg'], [I18n.t('history.settingChanged'), true]);
          // Une autre personne enregistre la vue avec un autre réglage.
          const foreign = accessConfig(RIGHTS.other, { exportColumn: 'Sortie' });
          stub().setWidgetOptions({ [ACCESS_KEY]: foreign });
          await h.sleep(250);
          byId('status-msg').textContent = '';
          await undo(h);
          check(problems, 'Ctrl + Z après le réglage d\'une autre personne : le même message', [status(), statusClass() === 'error-msg'], [I18n.t('history.settingChanged'), true]);
          check(problems, 'le réglage de l\'autre personne est intact', [accessOption(), AccessRights.getConfig()], [foreign, foreign]);
        } finally { grist.setOption = realSet; }
        check(problems, 'rien n\'est écrit dans les options du widget', writes, []);
        return verdict(problems, { writes, status: status() });
      } finally { await leaveAccess(h); }
    },
  });

  cases.push({
    id: 'undo_settings_the_access_setting_is_a_step_in_the_order_of_the_gestures_with_the_text',
    description: 'Du texte, le réglage des droits, le thème, du texte : quatre Ctrl + Z défont dans l\'ordre inverse, quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await seedAccess(h);
        typedAtEnd(' avant');
        await openAccess(h);
        await chooseAccess(h, ACCESS_IDS.table, RIGHTS.table);
        await chooseAccess(h, ACCESS_IDS.exportCol, 'Export');
        await closeSettings(h);
        await pickRadio(h, 'theme', 'settings-theme', 'dark');
        typedAtEnd(' après');
        const state = () => [/ avant/.test(text()), accessOption() && accessOption().exportColumn, shownTheme(), / après/.test(text())];
        check(problems, 'tout est posé, deux actions en réserve (le réglage, le thème)', [state(), reserve().count()], [[true, 'Export', 'dark', true], 2]);
        await undo(h);
        check(problems, 'Ctrl + Z 1 : le texte d\'après', state(), [true, 'Export', 'dark', false]);
        await undo(h);
        check(problems, 'Ctrl + Z 2 : le thème', state(), [true, 'Export', 'light', false]);
        await undo(h);
        check(problems, 'Ctrl + Z 3 : le réglage des droits', state(), [true, null, 'light', false]);
        await undo(h);
        check(problems, 'Ctrl + Z 4 : le texte d\'avant', state(), [false, null, 'light', false]);
        for (let i = 0; i < 4; i++) await redo(h);
        check(problems, 'quatre Ctrl + Y : tout revient', state(), [true, 'Export', 'dark', true]);
        return verdict(problems, { state: state() });
      } finally { await leaveAccess(h); }
    },
  });

  return cases;
})();
