// Suite "viewTemplate" - modèle par défaut de la vue (js/view-template.js, Réglages > Vue > « Modèle par défaut de cette vue »), « 16 bis » d'Antoine du 2026-10-02 :
// « un bouton qui permette de mettre ce modèle par défaut pour la vue dans laquelle il est, comme ça à chaque fois que l'on arrive dans la vue/page on a le même modèle ».
//
// Le choix vit dans les options du widget (clé `modeleDeLaVue`), donc dans SA vue : chaque scénario le lit dans stub.state.options, comme Grist le garderait, et le pose par
// stub.setWidgetOptions comme quelqu'un qui enregistre la vue. L'ouverture au démarrage (ligne > vue > ★) est dans dev-tests/verify-template-startup-mouse.mjs, qui sème le faux
// Grist avant l'init : une fois la page prête, il est trop tard pour la rejouer ici.
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

  let fixture = null;
  async function ensureFixture(h) {
    stub().setVariables(TABLE, { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Autre'] });
    await GristAPI.refreshSchema();
    if (!fixture || !Templates.getCached().some(t => same(t.id, fixture.A))) {
      const A = await createTemplate(h, 'document', 'Vue - A défaut', '<p>Contenu A défaut</p>');
      const B = await createTemplate(h, 'document', 'Vue - B de la vue', '<p>Contenu B vue</p>');
      const M = await createTemplate(h, 'email', 'Vue - M email', '<p>Contenu mail</p>');
      fixture = { A, B, M };
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
  const panel = () => ({
    status: el('settings-viewtemplate-status').textContent,
    setLabel: el('settings-viewtemplate-set').textContent, setDisabled: el('settings-viewtemplate-set').disabled, setTitle: el('settings-viewtemplate-set').title,
    clearDisabled: el('settings-viewtemplate-clear').disabled, locked: !el('settings-viewtemplate-locked').hidden,
    visible: el('settings-viewtemplate-set').getBoundingClientRect().height > 0 && el('settings-viewtemplate-clear').getBoundingClientRect().height > 0,
  });
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
    id: 'view_template_button_is_greyed_for_an_email_a_new_template_and_when_already_chosen',
    description: "Le bouton est grisé, jamais retiré : modèle email (comme l'étoile, avec son explication), nouveau modèle jamais enregistré, ou modèle déjà choisi pour la vue",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.M);
      await openSettings();
      const onEmail = panel();
      await closeSettings();
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
      const pass = onEmail.setDisabled && onEmail.visible && /email/.test(onEmail.setTitle) && onEmail.setLabel === 'Utiliser le modèle ouvert pour cette vue'
        && unsaved.currentId == null && unsaved.setDisabled && unsaved.visible
        && already.setDisabled && !already.clearDisabled && already.visible;
      return { pass, notes: JSON.stringify({ onEmail, unsaved, already }) };
    },
  });

  cases.push({
    id: 'view_template_chosen_elsewhere_shows_up_and_a_missing_template_is_said',
    description: "Un choix enregistré par quelqu'un d'autre (onOptions) apparaît dans l'état ; un choix dont le modèle n'existe plus ou est un email est dit tel quel, le modèle par défaut du document s'ouvre ; ViewTemplate.usableId() les ignore",
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
      const email = { usable: ViewTemplate.usableId() };
      await cleanup();
      const pass = same(chosen.usable, f.B) && chosen.status === 'Modèle de cette vue : « Vue - B de la vue ».'
        && missing.usable === null && /n’existe plus/.test(missing.status) && email.usable === null;
      return { pass, notes: JSON.stringify({ chosen, missing, email }) };
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.viewTemplate = cases;
})();
