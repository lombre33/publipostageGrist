// Suite "viewTemplate" - modèle par défaut de la vue (js/view-template.js, Réglages > Vue > « Modèle par défaut de cette vue »), « 16 bis » d'Antoine du 2026-10-02 :
// « un bouton qui permette de mettre ce modèle par défaut pour la vue dans laquelle il est, comme ça à chaque fois que l'on arrive dans la vue/page on a le même modèle ».
//
// Le choix vit dans les options du widget (clé `modeleDeLaVue`), donc dans SA vue : chaque scénario le lit dans stub.state.options, comme Grist le garderait, et le pose par
// stub.setWidgetOptions comme quelqu'un qui enregistre la vue. L'ouverture au démarrage (ligne > vue > ★) est dans dev-tests/verify-template-startup-mouse.mjs, qui sème le faux
// Grist avant l'init : une fois la page prête, il est trop tard pour la rejouer ici.
// Demande du 2026-10-08 : le modèle de la vue peut être un email ou un macro-modèle (« mail et macro modèle peuvent être des modèles par défaut d'une vue »). Le ★ du document
// n'a pas changé : il reste réservé aux modèles ordinaires, et l'étoile de la barre reste grisée sur un email ou un macro-modèle.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'PpVues';
  const KEY = 'modeleDeLaVue';
  const ROW_KEY = 'modeleSelonLigne';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const same = (a, b) => String(a) === String(b);
  const optionNow = () => (stub().state.options || {})[KEY];
  const el = id => document.getElementById(id);

  async function createTemplate(h, typeModele, nom, html) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton(typeModele === 'email' ? 'v2-btn-new-email' : 'v2-btn-new-document');
    await sleep(50);
    Editor.setHTML(html);
    el('template-name').value = nom;
    await h.clickButton('btn-save');
    await sleep(400);
    return Templates.getCurrentId();
  }

  // Un macro-modèle par la vraie fenêtre de composition (page de garde = `coverId`) : il est enregistré, sélectionné et chargé comme par une personne.
  async function createMacro(h, nom, coverId) {
    await h.resetEditor();
    MacroEditor.openModal(null);
    el('macro-editor-name').value = nom;
    const cover = el('macro-editor-cover');
    cover.value = String(coverId);
    cover.dispatchEvent(new Event('change', { bubbles: true }));
    el('macro-editor-save').click();
    await sleep(700);
    return Templates.getCurrentId();
  }

  let fixture = null;
  async function ensureFixture(h) {
    stub().setVariables(TABLE, { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Autre'] });
    await GristAPI.refreshSchema();
    if (!fixture || !Templates.getCached().some(t => same(t.id, fixture.A))) {
      const A = await createTemplate(h, 'document', 'Vue - A défaut', '<p>Contenu A défaut</p>');
      const B = await createTemplate(h, 'document', 'Vue - B de la vue', '<p>Contenu B vue</p>');
      const M = await createTemplate(h, 'email', 'Vue - M email', '<p>Contenu mail</p>');
      const N = await createMacro(h, 'Vue - N macro', B);
      fixture = { A, B, M, N };
    }
    const rows = stub().state.rows.Publipostage_Modeles;
    rows.id.forEach((rowId, i) => { rows.EstParDefaut[i] = same(rowId, fixture.A); }); // ★ sur A seul
    await Templates.loadAll();
    return fixture;
  }

  async function openByHand(id) {
    const select = el('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => same(Templates.getCurrentId(), id), 2500);
    await sleep(150);
  }
  async function openSettings() {
    el('v2-btn-settings').click();
    await sleep(150);
    document.querySelector('.settings-tab[data-settings-tab="rowTemplate"]').click();
    await sleep(150);
  }
  async function closeSettings() {
    el('settings-close').click();
    await sleep(400);
  }
  // Grisé par aria-disabled, jamais par `disabled` (consigne 088 de GFS) : l'état d'un bouton est lu là.
  const greyed = id => el(id).getAttribute('aria-disabled') === 'true';
  const panel = () => ({
    status: el('settings-viewtemplate-status').textContent,
    setLabel: el('settings-viewtemplate-set').textContent, setDisabled: greyed('settings-viewtemplate-set'), setTitle: el('settings-viewtemplate-set').title,
    clearDisabled: greyed('settings-viewtemplate-clear'), locked: !el('settings-viewtemplate-locked').hidden,
    visible: el('settings-viewtemplate-set').getBoundingClientRect().height > 0 && el('settings-viewtemplate-clear').getBoundingClientRect().height > 0,
  });
  // Ce que dit chaque bouton de lui-même (088) : sa raison en info-bulle, sa description, le natif `disabled`, et la phrase visible sous l'état. `described` : le texte de l'élément que `aria-describedby` désigne.
  const shown = id => { const node = el(id); return !!node && !node.hidden && node.getBoundingClientRect().height > 0; };
  const buttonSays = id => {
    const button = el(id);
    const target = button.getAttribute('aria-describedby');
    const described = target && el(target) ? el(target).textContent : null;
    return { greyed: button.getAttribute('aria-disabled') === 'true', nativeDisabled: button.disabled, title: button.title, describedBy: target, described, tabbable: button.tabIndex >= 0 };
  };
  const reasonPanel = () => ({ set: buttonSays('settings-viewtemplate-set'), clear: buttonSays('settings-viewtemplate-clear'), sentence: shown('settings-viewtemplate-unsaved') ? el('settings-viewtemplate-unsaved').textContent : null, lockedShown: shown('settings-viewtemplate-locked') });
  // Les phrases de la consigne 088, mot pour mot, dans les deux langues.
  const SAYS = {
    fr: {
      unsaved: 'Ce modèle n’est pas encore enregistré : donnez-lui un nom et cliquez sur Enregistrer, il pourra alors devenir celui de cette vue.',
      already: 'Ce modèle est déjà celui de cette vue.',
      nothing: 'Aucun modèle n’est choisi pour cette vue : il n’y a rien à retirer.',
      locked: 'Vous êtes en lecture seule : ce réglage est verrouillé.',
    },
    en: {
      unsaved: 'This template is not saved yet: give it a name and click Save, then it can become the one for this view.',
      already: 'This template is already the one for this view.',
      nothing: 'No template is chosen for this view: there is nothing to remove.',
      locked: 'You are read-only: this setting is locked.',
    },
  };
  // Un clic sur un bouton grisé n'écrit rien : les écritures de l'option du widget se comptent par la fonction même que ViewTemplate appelle.
  async function clickCountingWrites(...ids) {
    const original = GristAPI.setWidgetOption;
    let writes = 0;
    GristAPI.setWidgetOption = function () { writes++; return original.apply(this, arguments); };
    try { ids.forEach(id => el(id).click()); await sleep(250); } finally { GristAPI.setWidgetOption = original; }
    return writes;
  }
  async function openNewUnsaved(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document'); // nouveau modèle, jamais enregistré : aucun id à choisir
    await sleep(150);
  }
  async function cleanup() {
    await ViewTemplate.clear();
    stub().setWidgetOptions(null);
    await sleep(100);
    if (el('settings-modal').style.display === 'flex') await closeSettings();
    if (fixture && !same(Templates.getCurrentId(), fixture.A)) await openByHand(fixture.A);
  }

  cases.push({
    id: 'view_template_button_sets_then_clears_the_default_of_this_view',
    description: "Le bouton « Utiliser « X » pour cette vue » choisit le modèle ouvert (option du widget `modeleDeLaVue`, l'état le dit), il se grise une fois choisi ; « Retirer » enlève le choix et le modèle par défaut du document redevient celui qui s'ouvre",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.B);
      await openSettings();
      const before = Object.assign({ option: optionNow() || null }, panel());
      el('settings-viewtemplate-set').click();
      await sleep(250);
      const afterSet = Object.assign({ option: optionNow() }, panel());
      el('settings-viewtemplate-clear').click();
      await sleep(250);
      const afterClear = Object.assign({ option: optionNow() || null }, panel());
      await closeSettings();
      await cleanup();
      const pass = before.option === null && /Vue - A défaut/.test(before.status) && /par défaut du document/.test(before.status)
        && !before.setDisabled && before.setLabel === 'Utiliser « Vue - B de la vue » pour cette vue' && before.clearDisabled && before.visible
        && same(afterSet.option, f.B) && afterSet.status === 'Modèle de cette vue : « Vue - B de la vue ».' && afterSet.setDisabled && !afterSet.clearDisabled && afterSet.visible
        && afterClear.option === null && /par défaut du document/.test(afterClear.status) && afterClear.clearDisabled && !afterClear.setDisabled;
      return { pass, notes: JSON.stringify({ before, afterSet, afterClear }) };
    },
  });

  cases.push({
    id: 'view_template_button_is_greyed_for_a_new_template_and_when_already_chosen',
    description: "Le bouton est grisé, jamais retiré : nouveau modèle jamais enregistré (aucun id à choisir), ou modèle déjà choisi pour la vue",
    run: async (h) => {
      const f = await ensureFixture(h);
      await h.resetEditor();
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-document'); // nouveau modèle, jamais enregistré : aucun id à choisir
      await sleep(150);
      await openSettings();
      const unsaved = Object.assign({ currentId: Templates.getCurrentId() }, panel());
      await closeSettings();
      await openByHand(f.A);
      await ViewTemplate.set(f.A);
      await openSettings();
      const already = panel();
      await closeSettings();
      await cleanup();
      const pass = unsaved.currentId == null && unsaved.setDisabled && unsaved.visible
        && already.setDisabled && !already.clearDisabled && already.visible;
      return { pass, notes: JSON.stringify({ unsaved, already }) };
    },
  });

  // Demande du 2026-10-08 : un email et un macro-modèle se choisissent comme n'importe quel modèle. Avant, le bouton restait grisé (infobulle « ne peut pas s'ouvrir au démarrage »).
  cases.push({
    id: 'view_template_button_chooses_an_email_or_a_macro_template_then_clears_it',
    description: "Un email ou un macro-modèle ouvert : « Utiliser « X » pour cette vue » est actif et sans infobulle d'interdit, il choisit ce modèle (option du widget, état, bouton grisé une fois choisi), « Retirer » le défait ; l'étoile ★ de la barre reste grisée",
    run: async (h) => {
      const f = await ensureFixture(h);
      const seen = {};
      for (const [label, id, nom] of [['email', f.M, 'Vue - M email'], ['macro', f.N, 'Vue - N macro']]) {
        await openByHand(id);
        const starGreyed = ((el) => el.disabled || el.hasAttribute('data-pp-lock-soft'))(el('btn-set-default-template'));
        await openSettings();
        const before = Object.assign({ option: optionNow() || null }, panel());
        el('settings-viewtemplate-set').click();
        await sleep(250);
        const afterSet = Object.assign({ option: optionNow(), usable: ViewTemplate.usableId() }, panel());
        el('settings-viewtemplate-clear').click();
        await sleep(250);
        const afterClear = Object.assign({ option: optionNow() || null }, panel());
        await closeSettings();
        seen[label] = { starGreyed, before, afterSet, afterClear };
        const ok = starGreyed
          && !before.setDisabled && before.visible && before.setTitle === '' && before.setLabel === 'Utiliser « ' + nom + ' » pour cette vue' && before.option === null
          && same(afterSet.option, id) && same(afterSet.usable, id) && afterSet.status === 'Modèle de cette vue : « ' + nom + ' ».' && afterSet.setDisabled && !afterSet.clearDisabled
          && afterClear.option === null && afterClear.clearDisabled && !afterClear.setDisabled;
        seen[label].ok = ok;
      }
      await cleanup();
      const pass = seen.email.ok && seen.macro.ok;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'view_template_chosen_elsewhere_shows_up_and_a_missing_template_is_said',
    description: "Un choix enregistré par quelqu'un d'autre (onOptions) apparaît dans l'état ; un choix dont le modèle n'existe plus est dit tel quel, le modèle par défaut du document s'ouvre, et ViewTemplate.usableId() l'ignore ; un email ou un macro-modèle choisi est utilisable comme les autres",
    run: async (h) => {
      const f = await ensureFixture(h);
      stub().setWidgetOptions({ [KEY]: String(f.B) });
      await sleep(150);
      await openSettings();
      const chosen = Object.assign({ usable: ViewTemplate.usableId() }, panel());
      await closeSettings();
      stub().setWidgetOptions({ [KEY]: '999999' });
      await sleep(150);
      await openSettings();
      const missing = Object.assign({ usable: ViewTemplate.usableId() }, panel());
      await closeSettings();
      stub().setWidgetOptions({ [KEY]: String(f.M) });
      await sleep(150);
      await openSettings();
      const email = Object.assign({ usable: ViewTemplate.usableId() }, panel());
      await closeSettings();
      stub().setWidgetOptions({ [KEY]: String(f.N) });
      await sleep(150);
      await openSettings();
      const macro = Object.assign({ usable: ViewTemplate.usableId() }, panel());
      await closeSettings();
      await cleanup();
      const pass = same(chosen.usable, f.B) && chosen.status === 'Modèle de cette vue : « Vue - B de la vue ».'
        && missing.usable === null && /n’existe plus/.test(missing.status) && !/s’ouvrir seul/.test(missing.status)
        && same(email.usable, f.M) && email.status === 'Modèle de cette vue : « Vue - M email ».'
        && same(macro.usable, f.N) && macro.status === 'Modèle de cette vue : « Vue - N macro ».';
      return { pass, notes: JSON.stringify({ chosen, missing, email, macro }) };
    },
  });

  cases.push({
    id: 'view_template_is_the_default_that_a_row_rule_falls_back_to',
    description: "« Si aucune règle ne correspond : ouvrir le modèle par défaut » ouvre le modèle de la vue quand il y en a un, le ★ du document sinon",
    run: async (h) => {
      const f = await ensureFixture(h);
      const rule = { column: 'Statut', operator: '=', value: 'Urgent', modeleId: String(f.M) };
      await RowTemplate.save({ enabled: true, rules: [rule], otherwise: 'default' });
      await openByHand(f.M);
      stub().fireRecord({ id: 1, Nom: 'Ligne 1', Statut: 'Autre' }, TABLE);
      await waitFor(() => same(Templates.getCurrentId(), f.A), 2500);
      const withoutView = Templates.getCurrentId();
      await ViewTemplate.set(f.B);
      await openByHand(f.M);
      stub().fireRecord({ id: 2, Nom: 'Ligne 2', Statut: 'Autre' }, TABLE);
      await waitFor(() => same(Templates.getCurrentId(), f.B), 2500);
      const withView = Templates.getCurrentId();
      await RowTemplate.save(null);
      await cleanup();
      const pass = same(withoutView, f.A) && same(withView, f.B);
      return { pass, notes: JSON.stringify({ withoutView, withView }) };
    },
  });

  cases.push({
    id: 'view_template_macro_is_the_default_that_a_row_rule_falls_back_to',
    description: "« Si aucune règle ne correspond : ouvrir le modèle par défaut » ouvre le macro-modèle choisi pour la vue (avant, il était ignoré et le ★ s'ouvrait)",
    run: async (h) => {
      const f = await ensureFixture(h);
      const rule = { column: 'Statut', operator: '=', value: 'Urgent', modeleId: String(f.B) };
      await RowTemplate.save({ enabled: true, rules: [rule], otherwise: 'default' });
      await ViewTemplate.set(f.N);
      await openByHand(f.B);
      stub().fireRecord({ id: 3, Nom: 'Ligne 3', Statut: 'Autre' }, TABLE);
      await waitFor(() => same(Templates.getCurrentId(), f.N), 2500);
      const opened = { id: Templates.getCurrentId(), type: (Templates.byId(Templates.getCurrentId()) || {}).typeModele, summary: el('macro-summary-container').style.display };
      await RowTemplate.save(null);
      await cleanup();
      const pass = same(opened.id, f.N) && opened.type === 'macro' && opened.summary === 'block';
      return { pass, notes: JSON.stringify(opened) };
    },
  });

  cases.push({
    id: 'view_template_panel_is_locked_for_a_read_only_person',
    description: "En lecture seule la section est verrouillée : « Utiliser » et « Retirer » grisés, message affiché, et un clic n'écrit rien",
    run: async (h) => {
      const f = await ensureFixture(h);
      await ViewTemplate.set(f.B);
      await openByHand(f.A);
      const savedRights = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
      try {
        await openSettings();
        const locked = panel();
        const writesBefore = JSON.stringify(optionNow());
        el('settings-viewtemplate-clear').click();
        el('settings-viewtemplate-set').click();
        await sleep(250);
        const untouched = JSON.stringify(optionNow()) === writesBefore;
        await closeSettings();
        const pass = locked.setDisabled && locked.clearDisabled && locked.locked && locked.visible && untouched && same(ViewTemplate.getId(), f.B);
        return { pass, notes: JSON.stringify({ locked, untouched }) };
      } finally { AccessRights.get = savedRights; await cleanup(); }
    },
  });

  // Droits qui changent Réglages ouverts (choix d'Antoine du 2026-10-02, « Dégriser tout de suite ») : le vrai calcul des droits (js/access-rights.js) sur une table de droits du faux Grist, la
  // personne y est repérée par son email ; AccessRights.refresh() fait ce que fait la minuterie de 10 s. Le même email que dev-tests/scenarios-access-rights.js (GristAPI le garde en cache).
  const RIGHTS_TABLE = 'PpDroitsVues';
  const RIGHTS_CONFIG = { table: RIGHTS_TABLE, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  const rightsRow = readOnly => [{ id: 1, Email: 'Lecteur@Exemple.fr', LectureSeule: !!readOnly, Export: true, Commentaires: true }];
  async function changeRights(readOnly) {
    stub().setRows(RIGHTS_TABLE, rightsRow(readOnly));
    await AccessRights.refresh();
    const ok = await waitFor(() => AccessRights.get().readOnly === !!readOnly, 3000);
    await sleep(150);
    return ok;
  }

  cases.push({
    id: 'view_template_panel_follows_rights_that_change_while_the_settings_are_open',
    description: "Réglages ouverts, un changement de droits (en lecture seule, puis plus, puis de nouveau) grise ou dégrise « Utiliser » et « Retirer » tout de suite, sans fermer ni rouvrir les Réglages ; le choix de la vue n'est pas touché",
    run: async (h) => {
      const f = await ensureFixture(h);
      await ViewTemplate.set(f.B);
      await openByHand(f.A);
      try {
        stub().setUserEmail('lecteur@exemple.fr');
        stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
        stub().setRows(RIGHTS_TABLE, rightsRow(true));
        await GristAPI.refreshSchema();
        stub().setWidgetOptions({ droitsAcces: RIGHTS_CONFIG, [KEY]: String(f.B) });
        await sleep(120);
        await AccessRights.refresh();
        const started = await waitFor(() => AccessRights.get().readOnly === true, 3000);
        await sleep(200);
        await openSettings();
        const lockedAtOpen = panel();
        const freeNow = await changeRights(false);
        const stillOpen = el('settings-modal').style.display === 'flex';
        const freed = panel();
        const lockedNow = await changeRights(true);
        const lockedAgain = panel();
        const freeAgainNow = await changeRights(false);
        const freedAgain = panel();
        const choiceKept = same(ViewTemplate.getId(), f.B) && same(optionNow(), f.B);
        await closeSettings();
        const isLocked = p => p.locked && p.setDisabled && p.clearDisabled && p.visible;
        // Libre : le modèle ouvert (A) n'est pas celui de la vue (B), donc « Utiliser » s'offre ; un choix existe, donc « Retirer » aussi.
        const isFree = p => !p.locked && !p.setDisabled && !p.clearDisabled && p.visible;
        const pass = started && freeNow && lockedNow && freeAgainNow && stillOpen && choiceKept && isLocked(lockedAtOpen) && isFree(freed) && isLocked(lockedAgain) && isFree(freedAgain);
        return { pass, notes: JSON.stringify({ started, lockedAtOpen, freed, lockedAgain, freedAgain, stillOpen, choiceKept }) };
      } finally {
        await cleanup();
        stub().dropTable(RIGHTS_TABLE);
        await GristAPI.refreshSchema();
      }
    },
  });

  // Consigne 088 de GFS (demande du porteur du 19/11 : « indiquer pourquoi à chaque fois qu'une option est grisée ») : chaque état grisé dit sa raison - au survol (`title`), en phrase visible
  // quand le modèle ouvert n'est pas enregistré, au lecteur d'écran (`aria-describedby`) - et le bouton est grisé par aria-disabled, jamais par `disabled` (il garde le survol et le focus).
  cases.push({
    id: 'view_template_unsaved_template_says_why_both_buttons_are_greyed_then_names_itself_once_saved',
    description: "Modèle ouvert pas encore enregistré : « Utiliser… » grisé par aria-disabled (pas `disabled`, atteignable), sa raison en info-bulle ET en phrase visible sous l'état (aria-describedby vers elle) ; « Retirer » dit qu'il n'y a rien à retirer ; un clic n'écrit rien. Après « Enregistrer » sous un nom : la phrase disparaît, le bouton porte le nom, sans info-bulle",
    run: async (h) => {
      await ensureFixture(h);
      await openNewUnsaved(h);
      await openSettings();
      const unsaved = Object.assign({ currentId: Templates.getCurrentId() }, reasonPanel());
      const writes = await clickCountingWrites('settings-viewtemplate-set', 'settings-viewtemplate-clear');
      await closeSettings();
      Editor.setHTML('<p>Contenu Z</p>');
      el('template-name').value = 'Vue - Z enregistré';
      await h.clickButton('btn-save');
      await sleep(400);
      const savedId = Templates.getCurrentId();
      await openSettings();
      const saved = Object.assign({ label: el('settings-viewtemplate-set').textContent }, reasonPanel());
      await closeSettings();
      if (savedId != null) await Templates.remove(savedId);
      await cleanup();
      const says = SAYS.fr;
      const pass = unsaved.currentId == null
        && unsaved.set.greyed && !unsaved.set.nativeDisabled && unsaved.set.tabbable && unsaved.set.title === says.unsaved
        && unsaved.sentence === says.unsaved && unsaved.set.describedBy === 'settings-viewtemplate-unsaved' && unsaved.set.described === says.unsaved
        && unsaved.clear.greyed && !unsaved.clear.nativeDisabled && unsaved.clear.tabbable && unsaved.clear.title === says.nothing && unsaved.clear.describedBy === null
        && !unsaved.lockedShown && writes === 0
        && savedId != null && !saved.set.greyed && !saved.set.nativeDisabled && saved.set.title === '' && saved.set.describedBy === null && saved.sentence === null
        && saved.label === 'Utiliser « Vue - Z enregistré » pour cette vue' && saved.clear.greyed && saved.clear.title === says.nothing;
      return { pass, notes: JSON.stringify({ unsaved, writes, saved }) };
    },
  });

  cases.push({
    id: 'view_template_greyed_buttons_say_why_when_already_chosen_and_when_nothing_is_chosen',
    description: "Sans choix pour la vue : « Utiliser « X » » est actif (sans info-bulle ni phrase), « Retirer » grisé dit qu'il n'y a rien à retirer. Modèle ouvert déjà celui de la vue : « Utiliser… » grisé dit « déjà celui de cette vue » (info-bulle seule, pas de phrase visible), « Retirer » devient actif sans info-bulle ; un clic sur le grisé n'écrit rien",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.B);
      await openSettings();
      const noChoice = reasonPanel();
      await closeSettings();
      await ViewTemplate.set(f.B);
      await openSettings();
      const already = reasonPanel();
      const writes = await clickCountingWrites('settings-viewtemplate-set');
      const stillChosen = same(optionNow(), f.B);
      await closeSettings();
      await cleanup();
      const says = SAYS.fr;
      const pass = !noChoice.set.greyed && !noChoice.set.nativeDisabled && noChoice.set.title === '' && noChoice.set.describedBy === null && noChoice.sentence === null
        && noChoice.clear.greyed && !noChoice.clear.nativeDisabled && noChoice.clear.tabbable && noChoice.clear.title === says.nothing && noChoice.clear.describedBy === null
        && already.set.greyed && !already.set.nativeDisabled && already.set.tabbable && already.set.title === says.already && already.set.describedBy === null && already.sentence === null
        && !already.clear.greyed && already.clear.title === '' && writes === 0 && stillChosen;
      return { pass, notes: JSON.stringify({ noChoice, already, writes, stillChosen }) };
    },
  });

  cases.push({
    id: 'view_template_read_only_says_the_lock_on_both_buttons_even_for_an_unsaved_template',
    description: "En lecture seule, les deux boutons sont grisés par aria-disabled avec la phrase du verrou pour info-bulle et description (la ligne du verrou, déjà visible) ; la phrase « pas encore enregistré » ne paraît pas, même pour un modèle neuf ; un clic n'écrit rien",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openNewUnsaved(h);
      const savedRights = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
      try {
        await openSettings();
        const readOnly = reasonPanel();
        const writes = await clickCountingWrites('settings-viewtemplate-set', 'settings-viewtemplate-clear');
        await closeSettings();
        const says = SAYS.fr;
        const pass = readOnly.set.greyed && !readOnly.set.nativeDisabled && readOnly.set.tabbable && readOnly.set.title === says.locked && readOnly.set.describedBy === 'settings-viewtemplate-locked' && readOnly.set.described === says.locked
          && readOnly.clear.greyed && !readOnly.clear.nativeDisabled && readOnly.clear.tabbable && readOnly.clear.title === says.locked && readOnly.clear.describedBy === 'settings-viewtemplate-locked'
          && readOnly.lockedShown && readOnly.sentence === null && writes === 0 && f.A != null;
        return { pass, notes: JSON.stringify({ readOnly, writes }) };
      } finally { AccessRights.get = savedRights; await cleanup(); }
    },
  });

  // Les mêmes raisons en anglais : le HTML statique (la phrase visible) est traduit au chargement, donc ce cas se rejoue dans la seconde page, qui démarre en anglais.
  cases.push({
    id: 'view_template_greyed_buttons_say_why_in_english',
    lang: 'en',
    description: "En anglais : la phrase « pas encore enregistré » (visible, info-bulle, description), « déjà celui de cette vue », « rien à retirer » et le verrou sont dits en anglais, sur les mêmes boutons grisés par aria-disabled",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openNewUnsaved(h);
      await openSettings();
      const unsaved = reasonPanel();
      await closeSettings();
      await openByHand(f.B);
      await ViewTemplate.set(f.B);
      await openSettings();
      const already = reasonPanel();
      await closeSettings();
      const savedRights = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
      let readOnly;
      try { await openSettings(); readOnly = reasonPanel(); await closeSettings(); } finally { AccessRights.get = savedRights; }
      await cleanup();
      const says = SAYS.en;
      const pass = I18n.getLang() === 'en'
        && unsaved.set.greyed && !unsaved.set.nativeDisabled && unsaved.set.title === says.unsaved && unsaved.sentence === says.unsaved && unsaved.set.described === says.unsaved
        && unsaved.clear.greyed && unsaved.clear.title === says.nothing
        && already.set.greyed && already.set.title === says.already && already.sentence === null
        && readOnly.set.greyed && readOnly.set.title === says.locked && readOnly.clear.title === says.locked && readOnly.lockedShown && readOnly.sentence === null;
      return { pass, notes: JSON.stringify({ lang: I18n.getLang(), unsaved, already, readOnly }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.viewTemplate = cases;
})();
