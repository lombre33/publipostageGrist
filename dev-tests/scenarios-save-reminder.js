// Suite "saveReminder" - le rappel « Enregistrer » des Réglages > Vue et Accès (js/save-reminder.js, css/save-reminder.css), choisi par Antoine le 2026-10-09
// (carte « Rendre le rappel « Enregistrer » plus visible dans les Réglages Accès et Vue ? ») après qu'un compte sans le réglage a montré l'onglet Accès
// vide : ces réglages sont les options du widget, un brouillon tant que « Enregistrer » de Grist n'est pas cliqué.
//
// Les messages de Grist sont ceux mesurés dans un vrai Grist le 09/10 (labo-grist-reel/probe-messages.mjs) : un rappel (écho) par réglage qui change
// vraiment, aucun pour un réglage qui ne change rien, les options enregistrées après « Retour », et RIEN du tout après « Enregistrer » (le widget ne sait
// donc pas qu'on a enregistré : la ligne reste jusqu'à la fermeture des Réglages). Le faux Grist de dev-tests/grist-stub.js les rejoue avec
// `echoOnlyChanges`, `saveOptions` (silencieux) et `revertOptions` ; il est remis à son état d'avant à la fin de chaque cas.
// Les pixels (700x400, clair, sombre, français, anglais) sont dans dev-tests/verify-save-reminder-mouse.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const box = () => el('settings-save-reminder');
  const shown = () => { const b = box(); return !!b && !b.hidden && getComputedStyle(b).display !== 'none' && b.getClientRects().length > 0; };
  const FR_TEXT = 'Pour partager vos changements, cliquez sur «\u00a0Enregistrer\u00a0» en haut du widget, dans Grist.';
  const EN_TEXT = 'To share your changes, click “Save” at the top of the widget, in Grist.';

  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const tab = name => document.querySelector('[data-settings-tab="' + name + '"]');
  const openSettings = async (name) => {
    if (el('settings-modal').style.display !== 'flex') el('v2-btn-settings').click();
    await sleep(250);
    tab(name).click();
    await sleep(150);
  };
  const closeSettings = async () => { el('settings-close').click(); await sleep(250); };

  // Repart de zéro : des options enregistrées vides, un suivi sans rien en attente, le faux Grist qui ne rappelle que les vrais changements.
  async function setup(h) {
    await h.resetEditor();
    I18n.setLang('fr');
    stub().state.echoOnlyChanges = true;
    stub().setWidgetOptions(null);
    await sleep(120);
  }
  async function finish() {
    if (el('settings-modal').style.display === 'flex') await closeSettings();
    I18n.setLang('fr');
    stub().state.echoOnlyChanges = false;
    stub().setAccessLevel('full');
    stub().setWidgetOptions(null);
    await waitFor(() => !SaveReminder.isUnsaved());
    await sleep(120);
  }

  // Le suivi seul, sans DOM ni Grist, avec une horloge à la main.
  cases.push({
    id: 'save_reminder_tracker_follows_the_echo_and_the_revert_of_grist_and_knows_nothing_of_the_save',
    description: 'Le suivi du brouillon : une écriture réelle attend son écho ; un message qui n’est pas cet écho rend les options enregistrées (« Retour ») ; `null` vaut « absent » ; un message qui porte aussi un changement de lien ou d’accès n’est pas un « Retour » ; un écho qui ne vient pas n’en cache pas un autre ; « Enregistrer » ne dit rien : le réglage reste à enregistrer',
    run: async () => {
      let t = 0;
      const tracker = () => SaveReminder.createTracker(() => t);
      const got = {};

      // Écriture et son écho, une autre écriture (« Enregistrer » n'envoie rien entre les deux), puis « Retour » : les options enregistrées reviennent.
      let k = tracker(); t = 0; k.start({});
      got.start = k.isUnsaved();
      k.wrote({}, { a: 1 });
      got.written = k.isUnsaved();
      k.received({ a: 1 });
      got.echo = k.isUnsaved();
      k.wrote({ a: 1 }, { a: 2 });
      k.received({ a: 2 });
      got.secondWrite = k.isUnsaved();
      k.received({ a: 1 });
      got.reverted = k.isUnsaved();
      // Après « Retour », les options du widget sont celles que Grist a rendues : une nouvelle écriture repart d'elles.
      k.wrote({ a: 1 }, { a: 1, b: 3 });
      k.received({ a: 1, b: 3 });
      got.afterRevertWrite = k.isUnsaved();

      // `null` vaut « absent » : retirer un réglage qui n'existe pas n'est rien à enregistrer, et l'écho de cette écriture ne se prend pas pour un « Retour ».
      k = tracker(); k.start({ a: 1 });
      k.wrote({ a: 1 }, { a: 1, b: null });
      got.nullIsAbsent = k.isUnsaved();
      k.received({ a: 1, b: null });
      got.nullEcho = k.isUnsaved();
      k.wrote({ a: 1, b: null }, { a: 1, b: { x: 1 } });
      k.received({ a: 1, b: { x: 1 } });
      got.objectWrite = k.isUnsaved();
      k.wrote({ a: 1, b: { x: 1 } }, { a: 1, b: null });
      k.received({ a: 1, b: null });
      got.writtenBack = k.isUnsaved();

      // L'ordre des clés ne compte pas : les options enregistrées reviennent dans un autre ordre.
      k = tracker(); k.start({});
      k.wrote({}, { b: 1, a: 2 });
      k.received({ b: 1, a: 2 });
      k.received({ a: 2, b: 1 });
      got.keyOrder = k.isUnsaved();

      // Un message qui porte aussi un changement de lien ou d'accès ne dit rien du brouillon.
      k = tracker(); k.start({});
      k.wrote({}, { a: 1 });
      k.received({ a: 1 });
      k.received({ a: 1 }, true);
      got.settingsMessage = k.isUnsaved();
      k.received({}, false);
      got.revertAfterSettings = k.isUnsaved();

      // Une écriture qui ne change rien n'attend pas d'écho : le « Retour » qui suit tout de suite est reconnu.
      k = tracker(); k.start({});
      k.wrote({}, { a: 1 });
      k.received({ a: 1 });
      k.wrote({ a: 1 }, { a: 1 });
      k.received({});
      got.noopWrite = k.isUnsaved();

      // Un écho qui ne revient pas (délai écoulé) ne cache pas un « Retour » ; deux écritures rapprochées attendent deux échos.
      k = tracker(); t = 0; k.start({});
      k.wrote({}, { a: 1 });
      t = SaveReminder.ECHO_WAIT_MS + 500;
      k.received({});
      got.lostEcho = k.isUnsaved();
      k = tracker(); t = 0; k.start({});
      k.wrote({}, { a: 1 });
      k.wrote({ a: 1 }, { a: 2 });
      k.received({ a: 1 });
      k.received({ a: 2 });
      got.twoEchoes = k.isUnsaved();
      k.received({});
      got.twoEchoesThenRevert = k.isUnsaved();

      // Une ouverture des Réglages repart de zéro : les options du moment sont tenues pour enregistrées.
      k = tracker(); t = 0; k.start({});
      k.wrote({}, { a: 1 });
      k.received({ a: 1 });
      k.start({ a: 1 });
      got.restart = k.isUnsaved();
      k.wrote({ a: 1 }, { a: 1, c: 2 });
      got.afterRestartWrite = k.isUnsaved();

      const pass = got.start === false && got.written === true && got.echo === true
        && got.secondWrite === true && got.reverted === false && got.afterRevertWrite === true
        && got.nullIsAbsent === false && got.nullEcho === false && got.objectWrite === true && got.writtenBack === false
        && got.keyOrder === false && got.settingsMessage === true && got.revertAfterSettings === false
        && got.noopWrite === false && got.lostEcho === false && got.twoEchoes === true && got.twoEchoesThenRevert === false
        && got.restart === false && got.afterRestartWrite === true;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // La ligne dans la fenêtre : un réglage de l'onglet Accès, puis « Enregistrer » ou « Retour » de Grist.
  cases.push({
    id: 'save_reminder_line_shows_on_the_view_and_access_tabs_after_a_setting_and_goes_with_revert_or_a_new_opening',
    description: 'Après un réglage de l’onglet Accès, la ligne apparaît à gauche de « Fermer » dans les Réglages (Vue et Accès seulement, pas Langue), dit de cliquer sur « Enregistrer » en français puis en anglais, reste après « Enregistrer » (Grist ne dit rien), disparaît au « Retour » de Grist et à la prochaine ouverture des Réglages',
    run: async (h) => {
      await setup(h);
      const RIGHTS = 'PpDroitsRappel';
      stub().setVariables(RIGHTS, { Email: 'Text', LectureSeule: 'Bool' });
      stub().setRows(RIGHTS, [{ id: 1, Email: 'autre@exemple.fr', LectureSeule: true }]);
      await GristAPI.refreshSchema();
      const choose = async (id, value) => { const s = el(id); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(450); };
      const got = {};
      await openSettings('access');
      got.atStart = shown();
      got.hiddenText = box().textContent;
      // Un brouillon incomplet (table sans colonne de droit) est retiré, pas enregistré à moitié : rien à enregistrer, pas de rappel.
      await choose('settings-access-table', RIGHTS);
      await choose('settings-access-email', 'Email');
      got.incomplete = shown();
      await choose('settings-access-readonly', 'LectureSeule');
      got.afterSetting = shown();
      got.text = box().textContent;
      got.inFooter = !!box().closest('.pp-modal-actions') && !!box().closest('#settings-modal') && !!box().nextElementSibling && box().nextElementSibling.id === 'settings-close';
      got.role = box().getAttribute('role');
      tab('language').click(); await sleep(150);
      got.onLanguage = shown();
      tab('rowTemplate').click(); await sleep(150);
      got.onView = shown();
      tab('access').click(); await sleep(150);
      got.backOnAccess = shown();
      I18n.setLang('en'); await sleep(150);
      got.english = box().textContent;
      I18n.setLang('fr'); await sleep(150);
      got.french = box().textContent;
      // « Enregistrer » dans Grist : aucun message, la ligne reste (une consigne, vraie aussi après le clic).
      stub().saveOptions(); await sleep(150);
      got.afterSave = shown();
      got.textAfterSave = box().textContent;
      // Un autre réglage, puis « Retour ».
      await choose('settings-access-export', '');
      got.afterNoopChoice = shown();
      el('settings-access-clean-reading').click(); await sleep(450);
      got.afterClean = shown();
      stub().revertOptions(); await sleep(150);
      got.afterRevert = shown();
      got.optionsAfterRevert = JSON.stringify(stub().state.options && stub().state.options.droitsAcces && stub().state.options.droitsAcces.cleanReading);
      // Un réglage de plus, les Réglages fermés puis rouverts : on repart de zéro, la ligne n'est plus là (et le réglage, lui, est toujours dans le brouillon).
      await choose('settings-access-comments', 'LectureSeule');
      got.beforeClose = shown();
      await closeSettings();
      await openSettings('access');
      got.afterReopen = shown();
      got.textAfterReopen = box().textContent;
      got.optionKept = JSON.stringify(stub().state.options && stub().state.options.droitsAcces && stub().state.options.droitsAcces.commentsColumn);
      await finish();
      const pass = got.atStart === false && got.hiddenText === '' && got.incomplete === false && got.afterSetting === true && got.text === FR_TEXT
        && got.inFooter === true && got.role === 'status' && got.onLanguage === false && got.onView === true && got.backOnAccess === true
        && got.english === EN_TEXT && got.french === FR_TEXT && got.afterSave === true && got.textAfterSave === FR_TEXT
        && got.afterNoopChoice === true && got.afterClean === true && got.afterRevert === false && got.optionsAfterRevert === 'false'
        && got.beforeClose === true && got.afterReopen === false && got.textAfterReopen === '' && got.optionKept === '"LectureSeule"';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // Les Réglages ouverts puis fermés sans rien toucher n'écrivent rien : sans cela Grist montre « Enregistrer » pour rien (constaté dans un vrai Grist le
  // 09/10 : le réglage « Selon la ligne » écrivait `null` à la fermeture, un brouillon `{"modeleSelonLigne":null}`).
  cases.push({
    id: 'save_reminder_opening_and_closing_the_settings_writes_no_option',
    description: 'Ouvrir les Réglages, passer par chaque onglet puis les fermer sans rien changer n’écrit aucune option du widget (aucun brouillon pour Grist, aucun rappel) ; cocher « Selon la ligne » écrit bien le réglage et fait apparaître le rappel sur l’onglet Vue',
    run: async (h) => {
      await setup(h);
      let writes = 0;
      const realSetOption = grist.setOption;
      grist.setOption = function () { writes++; return realSetOption.apply(this, arguments); };
      try {
        const got = {};
        el('v2-btn-settings').click(); await sleep(250);
        for (const name of ['language', 'theme', 'triggerKey', 'shortcuts', 'pageMargins', 'rowTemplate', 'access', 'credits']) { tab(name).click(); await sleep(80); }
        await closeSettings();
        await sleep(400);
        got.writesAfterClose = writes;
        got.optionsAfterClose = JSON.stringify(stub().state.options);
        got.unsaved = SaveReminder.isUnsaved();
        // La même ouverture, avec « Selon la ligne » coché : le réglage est bien écrit (rien n'est perdu par la garde), le rappel apparaît.
        await openSettings('rowTemplate');
        el('settings-rowtemplate-enabled').click();
        await sleep(600);
        got.writesAfterTick = writes;
        got.keyAfterTick = Object.keys(stub().state.options || {}).join(',');
        got.shownAfterTick = shown();
        // Rouvrir puis refermer sans rien changer, le réglage étant là : toujours rien d'écrit en plus, et plus de ligne (on repart de zéro).
        await closeSettings();
        const before = writes;
        await openSettings('rowTemplate');
        got.shownWhenReopened = shown();
        await closeSettings();
        await sleep(400);
        got.writesWhenReopened = writes - before;
        await finish();
        const pass = got.writesAfterClose === 0 && got.optionsAfterClose === 'null' && got.unsaved === false
          && got.writesAfterTick >= 1 && /modeleSelonLigne/.test(got.keyAfterTick) && got.shownAfterTick === true && got.shownWhenReopened === false
          && got.writesWhenReopened === 0;
        return { pass, notes: JSON.stringify(got) };
      } finally {
        grist.setOption = realSetOption;
      }
    },
  });

  // Les réglages de la vue passent par le même suivi : le modèle de la vue, son retrait qui revient à l'état enregistré, puis « Retour ».
  cases.push({
    id: 'save_reminder_view_template_choice_asks_for_a_save_and_removing_it_again_or_reverting_asks_for_nothing',
    description: 'Choisir le modèle de la vue fait apparaître le rappel sur l’onglet Vue ; le retirer avant d’enregistrer revient à l’état enregistré (plus de rappel) ; « Retour » de Grist l’éteint aussi',
    run: async (h) => {
      await setup(h);
      const got = {};
      await openSettings('rowTemplate');
      await ViewTemplate.set(7); await sleep(300);
      got.afterSet = shown();
      await ViewTemplate.clear(); await sleep(300);
      got.afterClear = shown();
      await ViewTemplate.set(7); await sleep(300);
      got.afterSecondSet = shown();
      stub().revertOptions(); await sleep(200);
      got.afterRevert = shown();
      got.idAfterRevert = ViewTemplate.getId();
      await finish();
      const pass = got.afterSet === true && got.afterClear === false && got.afterSecondSet === true && got.afterRevert === false && got.idAfterRevert === null;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // Un message de Grist qui porte un changement d'accès ne dit rien du brouillon : le rappel reste.
  cases.push({
    id: 'save_reminder_stays_when_grist_resends_the_options_for_an_access_level_change',
    description: 'Le niveau d’accès du widget change pendant qu’un réglage attend d’être enregistré : Grist renvoie les mêmes options avec le nouvel accès, ce n’est pas un « Retour » et le rappel reste ; un vrai « Retour » l’éteint ensuite',
    run: async (h) => {
      await setup(h);
      const got = {};
      try {
        await openSettings('rowTemplate');
        await ViewTemplate.set(9); await sleep(300);
        got.before = shown();
        stub().setAccessLevel('read table'); await sleep(200);
        got.afterAccess = shown();
        stub().setAccessLevel('full'); await sleep(200);
        got.afterBack = shown();
        stub().revertOptions(); await sleep(150);
        got.afterRevert = shown();
      } finally {
        stub().setAccessLevel('full');
      }
      await finish();
      const pass = got.before === true && got.afterAccess === true && got.afterBack === true && got.afterRevert === false;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.saveReminder = cases;
})();
