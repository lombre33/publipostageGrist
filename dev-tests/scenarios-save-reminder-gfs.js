// Suite "saveReminderGfs" - le rappel « Enregistrer » et les deux phrases qui demandent d'enregistrer la vue, quand Grist Factory Suite (GFS) héberge l'app (consigne 039 de GFS,
// décision du porteur du 03/11). Dans GFS le « Enregistrer » de Grist n'existe plus pour les réglages de la vue : GFS les écrit lui-même dans la vue, puis le dit à l'app par
// l'événement `reglages` { enregistres } (js/gfs-link.js:applySettings). `true` : la ligne de js/save-reminder.js reste vide et `settings.view.intro` (Réglages > Vue) et
// `settings.access.saveHint` (Réglages > Accès) perdent leur demande d'enregistrer la vue (leurs variantes `…Saved`) ; `false` (GFS s'est replié sur le brouillon de Grist) : la ligne
// et les deux demandes, comme avant ; avant le premier événement : comme avant aussi. L'app seule n'écoute rien (un cas du groupe `saveReminder`).
//
// Joué « hébergé » (HOSTED_GROUPS de dev-tests/run-headless.mjs) : la page s'ouvre avec `?gfs=0` et dev-tests/gfs-stub.js joue GFS (`setReglages` envoie l'événement). L'état de GfsLink
// (le dernier `enregistres`) vit autant que la page, d'un cas à l'autre : le premier cas est celui d'avant tout événement, et chaque cas pose l'état dont il part.
// Le français des textes est celui du HTML ; l'anglais n'est écrit qu'avec la clé que SaveReminder pose (rien ne retraduit la page en route : changer de langue recharge l'app).
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const gfs = () => window.__gfsStub;
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const box = () => el('settings-save-reminder');
  const shown = () => { const b = box(); return !!b && !b.hidden && getComputedStyle(b).display !== 'none' && b.getClientRects().length > 0; };
  const FR_LINE = 'Pour partager vos changements, cliquez sur « Enregistrer » en haut du widget, dans Grist.';
  const EN_LINE = 'To share your changes, click “Save” at the top of the widget, in Grist.';
  const VIEW_ASK = {
    fr: 'Réglages propres à cette vue. Pour les appliquer à tout le monde, enregistrez ensuite la vue dans Grist (bouton Enregistrer en haut du widget).',
    en: 'Settings for this view only. To apply them to everyone, save the view in Grist afterwards (Save button at the top of the widget).',
  };
  const VIEW_SAVED = { fr: 'Réglages propres à cette vue. Ils s’appliquent à tout le monde.', en: 'Settings for this view only. They apply to everyone.' };
  const ACCESS_REST = {
    fr: 'Une personne absente de la table garde tous les droits ; un compte Lecteur de Grist ouvre toujours en lecture seule.',
    en: 'A person missing from the table keeps all rights; a Grist Viewer account always opens read-only.',
  };
  const ACCESS_ASK = {
    fr: 'Pour l’appliquer à tout le monde, enregistrez ensuite la vue dans Grist (bouton Enregistrer en haut du widget). ' + ACCESS_REST.fr,
    en: 'To apply it to everyone, save the view in Grist afterwards (Save button at the top of the widget). ' + ACCESS_REST.en,
  };

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
  // Les deux phrases, par leur place dans les Réglages (la clé de leur `data-i18n` change avec l'état) : le texte affiché et la clé.
  const viewPhrase = () => document.querySelector('[data-settings-panel="rowTemplate"] .settings-panel-intro');
  const accessPhrase = () => document.querySelector('[data-settings-panel="access"] [data-i18n^="settings.access.saveHint"]');
  const textOf = node => (node ? node.textContent : null);
  // Un événement `reglages` de GFS, puis le temps que l'app le prenne.
  const send = async (enregistres) => { gfs().setReglages(enregistres); await sleep(120); };
  // L'état que GfsLink dit tenir (un GFS d'avant la consigne 039 : la fonction n'existe pas).
  const heldState = () => (typeof GfsLink.settingsSaved === 'function' ? GfsLink.settingsSaved() : 'absent');

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
    stub().setWidgetOptions(null);
    await waitFor(() => !SaveReminder.isUnsaved());
    await sleep(120);
  }

  // Avant tout événement : comme avant la consigne. Doit rester le premier cas du fichier (l'état de GfsLink ne revient pas à « aucun événement »).
  cases.push({
    id: 'save_reminder_gfs_before_any_event_the_line_and_both_phrases_still_ask_for_a_save',
    description: 'Hébergée par GFS, tant qu’aucun événement `reglages` n’est arrivé (rien d’écrit depuis l’ouverture, ou un GFS qui ne l’envoie pas), la ligne apparaît après un réglage de la vue et les deux phrases des Réglages (Vue et Accès) demandent d’enregistrer la vue, comme avant',
    run: async (h) => {
      await setup(h);
      const got = { hosted: GfsLink.hosted, state: heldState() };
      await openSettings('rowTemplate');
      got.viewAsk = textOf(viewPhrase());
      await ViewTemplate.set(7); await sleep(300);
      got.lineOnView = shown();
      got.lineText = box().textContent;
      await openSettings('access');
      got.accessAsk = textOf(accessPhrase());
      got.lineOnAccess = shown();
      await finish();
      const pass = got.hosted === true && (got.state === null || got.state === 'absent')
        && got.viewAsk === VIEW_ASK.fr && got.lineOnView === true && got.lineText === FR_LINE && got.accessAsk === ACCESS_ASK.fr && got.lineOnAccess === true;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // `enregistres: true` : GFS a mis le réglage dans la vue.
  cases.push({
    id: 'save_reminder_gfs_saved_settings_leave_the_line_empty_and_drop_the_ask_from_both_phrases',
    description: 'L’événement `reglages` à `true` (GFS a mis le réglage dans la vue) vide la ligne du rappel, sur l’onglet Vue comme sur l’onglet Accès, et retire la demande d’enregistrer des deux phrases (Vue : « Ils s’appliquent à tout le monde » ; Accès : seul le reste de l’aide demeure) ; la ligne ne revient ni après un nouveau réglage ni à la réouverture des Réglages ; un événement sans booléen ne change rien ; en anglais les mêmes phrases sans la demande',
    run: async (h) => {
      await setup(h);
      const got = {};
      await openSettings('rowTemplate');
      await ViewTemplate.set(7); await sleep(300);
      got.beforeEvent = shown();
      await send(true);
      got.state = heldState();
      got.lineAfterTrue = shown();
      got.lineTextAfterTrue = box().textContent;
      got.viewPhrase = textOf(viewPhrase());
      got.viewKey = viewPhrase() && viewPhrase().getAttribute('data-i18n');
      await openSettings('access');
      got.accessPhrase = textOf(accessPhrase());
      got.accessKey = accessPhrase() && accessPhrase().getAttribute('data-i18n');
      got.lineOnAccess = shown();
      // Un autre réglage alors que GFS a déjà tout enregistré : le suivi du brouillon dit « à enregistrer », la ligne se tait.
      await openSettings('rowTemplate');
      await ViewTemplate.clear(); await sleep(250);
      await ViewTemplate.set(8); await sleep(300);
      got.unsavedTracker = SaveReminder.isUnsaved();
      got.lineAfterNewSetting = shown();
      // Un événement dont `enregistres` n'est pas un booléen n'est pas gardé : l'état d'avant vaut toujours.
      gfs().post({ type: 'evenement', nom: 'reglages', data: { enregistres: 'oui' } });
      gfs().post({ type: 'evenement', nom: 'reglages', data: null });
      await sleep(150);
      got.stateAfterJunk = heldState();
      got.lineAfterJunk = shown();
      got.viewPhraseAfterJunk = textOf(viewPhrase());
      // Les Réglages fermés puis rouverts repartent de zéro : toujours rien.
      await closeSettings();
      await openSettings('access');
      got.lineAfterReopen = shown();
      got.accessPhraseAfterReopen = textOf(accessPhrase());
      // En anglais : l'état change (brouillon puis enregistré), les phrases et la ligne sont posées dans la langue de la page.
      I18n.setLang('en');
      await send(false);
      got.enAskAccess = textOf(accessPhrase());
      await openSettings('rowTemplate');
      got.enAskView = textOf(viewPhrase());
      await ViewTemplate.set(9); await sleep(300);
      got.enLineDraftShown = shown();
      got.enLineDraft = box().textContent;
      await send(true);
      got.enSavedView = textOf(viewPhrase());
      got.enLine = shown();
      await openSettings('access');
      got.enSavedAccess = textOf(accessPhrase());
      await finish();
      const pass = got.beforeEvent === true && got.state === true
        && got.lineAfterTrue === false && got.lineTextAfterTrue === '' && got.viewPhrase === VIEW_SAVED.fr && got.viewKey === 'settings.view.introSaved'
        && got.accessPhrase === ACCESS_REST.fr && got.accessKey === 'settings.access.saveHintSaved' && got.lineOnAccess === false
        && got.unsavedTracker === true && got.lineAfterNewSetting === false
        && got.stateAfterJunk === true && got.lineAfterJunk === false && got.viewPhraseAfterJunk === VIEW_SAVED.fr
        && got.lineAfterReopen === false && got.accessPhraseAfterReopen === ACCESS_REST.fr
        && got.enAskAccess === ACCESS_ASK.en && got.enAskView === VIEW_ASK.en && got.enLineDraftShown === true && got.enLineDraft === EN_LINE
        && got.enSavedView === VIEW_SAVED.en && got.enLine === false && got.enSavedAccess === ACCESS_REST.en;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // `enregistres: false` : GFS s'est replié sur le brouillon de Grist, le rappel est de nouveau vrai.
  cases.push({
    id: 'save_reminder_gfs_a_draft_brings_the_line_and_the_asks_back_and_a_saved_one_sends_them_away_again',
    description: 'L’événement `reglages` à `false` (GFS s’est replié sur le brouillon de Grist) rend la ligne du rappel, comme avant, sur les onglets Vue et Accès, et la demande d’enregistrer aux deux phrases ; un `true` qui suit les éteint de nouveau, et le « Retour » de Grist éteint la ligne comme avant sans toucher aux phrases',
    run: async (h) => {
      await setup(h);
      const got = {};
      await openSettings('rowTemplate');
      await ViewTemplate.set(7); await sleep(300);
      await send(true);
      got.hiddenWhenSaved = shown();
      await send(false);
      got.state = heldState();
      got.lineAfterFalse = shown();
      got.lineText = box().textContent;
      got.viewAsk = textOf(viewPhrase());
      await openSettings('access');
      got.lineOnAccess = shown();
      got.accessAsk = textOf(accessPhrase());
      await send(true);
      got.lineAfterTrueAgain = shown();
      got.accessSaved = textOf(accessPhrase());
      await send(false);
      got.lineBack = shown();
      // Le « Retour » de Grist : le brouillon est rendu, la ligne s'éteint comme avant (les phrases suivent l'événement, pas le brouillon).
      stub().revertOptions(); await sleep(200);
      got.lineAfterRevert = shown();
      got.accessAskAfterRevert = textOf(accessPhrase());
      await finish();
      const pass = got.hiddenWhenSaved === false && got.state === false
        && got.lineAfterFalse === true && got.lineText === FR_LINE && got.viewAsk === VIEW_ASK.fr && got.lineOnAccess === true && got.accessAsk === ACCESS_ASK.fr
        && got.lineAfterTrueAgain === false && got.accessSaved === ACCESS_REST.fr
        && got.lineBack === true && got.lineAfterRevert === false && got.accessAskAfterRevert === ACCESS_ASK.fr;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.saveReminderGfs = cases;
})();
