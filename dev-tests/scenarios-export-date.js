// Suite "exportDate" - date du dernier export PDF (js/export-date.js, Réglages > Vue > « Date du dernier export PDF » ; demande du 09/10 : « une option où tu choisis
// une colonne qui gardera la date du dernier export PDF »). Le choix est l'option du widget `dateDernierExport` (le nom d'une colonne de la table de la page) ; chaque scénario la
// lit dans stub.state.options, comme Grist la garderait, et la pose par stub.setWidgetOptions comme quelqu'un qui enregistre la vue.
// Les colonnes sont celles d'un vrai document : Date, Date et heure, Texte, une colonne à formule (que Grist refuse d'écrire) et une colonne « vide » (formule vide : l'état d'une
// colonne que l'on vient d'ajouter dans Grist). Les faits du faux Grist viennent d'un essai dans un vrai Grist (09/10, labo-grist-reel/probe-export-date.mjs) : une date s'écrit en
// secondes (minuit UTC pour une Date), une colonne à formule, une colonne inconnue et une ligne qui n'existe plus font refuser TOUT le lot.
// Les exports eux-mêmes (PDF seul, ZIP, PDF unique, planche, lignes en échec, Word) sont dans la suite pdfBatch ; la section de Réglages à la souris à 700x400 dans
// verify-export-date-mouse.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'EdClients';
  const KEY = 'dateDernierExport';
  const SELECT_ID = 'settings-exportdate-column';
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const verdict = checks => { const failed = Object.keys(checks).filter(k => !checks[k]); return { pass: failed.length === 0, failed }; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  // Les colonnes de la table : l'ordre est celui de la liste. `Calcul` est une vraie colonne à formule, `Vide` une colonne ajoutée dans Grist et pas encore remplie.
  const COLUMNS = { Nom: 'Text', Dernier: 'DateTime:Europe/Paris', Jour: 'Date', Quand: 'Text', Montant: 'Numeric', Calcul: 'DateTime:Europe/Paris', Vide: 'Date' };
  const ROWS = [1, 2, 3, 4].map(id => ({ id, Nom: 'Client ' + id, Montant: id * 10 }));

  async function seed(h) {
    await h.resetEditor();
    const s = stub();
    s.setVariables(TABLE, COLUMNS);
    s.setFormulaColumn(TABLE, 'Calcul', '$Dernier');
    s.setFormulaColumn(TABLE, 'Vide', '');
    s.setRows(TABLE, ROWS);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Nom: 'Client 1' }, TABLE);
    await sleep(50);
  }
  async function closeSettings() {
    if (el('settings-modal').style.display === 'flex') { el('settings-close').click(); await sleep(400); }
  }
  async function cleanup() {
    await closeSettings();
    stub().setViewer(false);
    stub().setWidgetOptions(null);
    await sleep(80);
    stub().dropTable(TABLE);
    await GristAPI.refreshSchema();
  }
  function scenario(id, description, body) {
    cases.push({
      id, description,
      run: async (h) => {
        await seed(h);
        try { return await body(h); } finally { await cleanup(); }
      },
    });
  }
  async function openSettings() {
    el('v2-btn-settings').click();
    await sleep(200);
    document.querySelector('.settings-tab[data-settings-tab="rowTemplate"]').click();
    await sleep(250);
  }
  const optionNow = () => (stub().state.options || {})[KEY];
  const choose = async value => {
    const select = el(SELECT_ID);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
  };
  const statusBox = () => el('settings-exportdate-status');
  const bulkWrites = () => stub().getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === TABLE);
  const rowOf = id => stub().getRow(TABLE, id);

  scenario(
    'exportdate_panel_lists_only_the_columns_that_can_receive_the_date',
    'Réglages > Vue > « Date du dernier export PDF » : la liste propose les colonnes Date, Date et heure et Texte (type en indice, dans l’ordre de la table), la colonne « vide » comprise, sans les colonnes à formule ni les autres types ; « — Aucune — » en tête, choisie au départ',
    async () => {
      await openSettings();
      const select = el(SELECT_ID);
      const listed = () => Array.from(select.options).map(o => o.value + '|' + o.textContent);
      const fr = listed();
      const en = await inLang('en', async () => { await sleep(150); return listed(); });
      const visible = el('settings-exportdate-section').getBoundingClientRect().height > 0 && select.parentElement.getBoundingClientRect().height > 0;
      const checks = {
        french: same(fr, ['|— Aucune —', 'Nom|Nom (texte)', 'Dernier|Dernier (date et heure)', 'Jour|Jour (date)', 'Quand|Quand (texte)', 'Vide|Vide (date)']),
        english: same(en, ['|— None —', 'Nom|Nom (text)', 'Dernier|Dernier (date and time)', 'Jour|Jour (date)', 'Quand|Quand (text)', 'Vide|Vide (date)']),
        noneChosen: select.value === '' && !ExportDate.getColumn(),
        noStatusWithoutChoice: statusBox().hidden && statusBox().textContent === '',
        sectionShown: visible,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'exportdate_panel_choosing_a_column_writes_the_option_and_says_what_will_be_written',
    'Choisir une colonne écrit l’option `dateDernierExport` et dit ce qui s’écrira (le jour, le jour et l’heure, ou le texte) ; « — Aucune — » retire le réglage ; l’écho de Grist ne défait pas un choix plus récent',
    async () => {
      await openSettings();
      const statusFor = (kind, column) => I18n.t('settings.exportDate.status.' + kind, { column });
      await choose('Dernier');
      const afterDatetime = { option: optionNow(), column: ExportDate.getColumn(), text: statusBox().textContent, shown: !statusBox().hidden, problem: statusBox().classList.contains('is-problem') };
      await choose('Jour');
      const afterDate = { option: optionNow(), text: statusBox().textContent };
      await choose('Quand');
      const afterText = { option: optionNow(), text: statusBox().textContent };
      // Deux choix coup sur coup : l'écho du premier revient après le second (le faux Grist rend toujours la dernière valeur : l'écho périmé est rejoué à la main, avant les siens)
      // et ne défait pas le dernier choix ; un vrai changement venu de Grist ensuite s'applique bien, les échos attendus étant consommés.
      const select = el(SELECT_ID);
      select.value = 'Dernier'; select.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = 'Jour'; select.dispatchEvent(new Event('change', { bubbles: true }));
      stub().state.optionsCallback({ [KEY]: 'Dernier' }, { accessLevel: stub().state.accessLevel, linking: {} });
      const afterStaleEcho = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      await sleep(300);
      const afterTwo = { option: optionNow(), column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      stub().setWidgetOptions({ [KEY]: 'Quand' });
      await sleep(150);
      const afterOther = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      await choose('');
      const afterNone = { option: optionNow(), column: ExportDate.getColumn(), hidden: statusBox().hidden };
      const checks = {
        datetime: afterDatetime.option === 'Dernier' && afterDatetime.column === 'Dernier' && afterDatetime.text === statusFor('datetime', 'Dernier') && afterDatetime.shown && !afterDatetime.problem,
        date: afterDate.option === 'Jour' && afterDate.text === statusFor('date', 'Jour'),
        text: afterText.option === 'Quand' && afterText.text === statusFor('text', 'Quand'),
        staleEchoIgnored: afterStaleEcho.column === 'Jour' && afterStaleEcho.selected === 'Jour',
        lastChoiceKept: afterTwo.option === 'Jour' && afterTwo.column === 'Jour' && afterTwo.selected === 'Jour',
        otherPersonsChangeApplies: afterOther.column === 'Quand' && afterOther.selected === 'Quand',
        none: afterNone.option == null && afterNone.column === null && afterNone.hidden,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ afterDatetime, afterStaleEcho, afterTwo, afterOther, afterNone }) };
    },
  );

  scenario(
    'exportdate_panel_keeps_a_vanished_or_unusable_column_visible_and_says_so',
    'Une colonne choisie qui n’existe plus, ou devenue une colonne à formule ou un autre type, reste visible dans la liste (pas remplacée en silence par « — Aucune — ») et l’état le dit, en rouge ; le réglage n’est pas réécrit pour autant',
    async () => {
      stub().setWidgetOptions({ [KEY]: 'Disparue' });
      await sleep(100);
      await openSettings();
      const select = el(SELECT_ID);
      const missing = { selected: select.value, listed: Array.from(select.options).some(o => o.value === 'Disparue'), text: statusBox().textContent, problem: statusBox().classList.contains('is-problem') };
      // La colonne choisie devient une colonne à formule dans Grist, Réglages rouverts.
      await closeSettings();
      stub().setWidgetOptions({ [KEY]: 'Dernier' });
      stub().setFormulaColumn(TABLE, 'Dernier', '$Nom');
      await sleep(100);
      await openSettings();
      const formula = { selected: select.value, listed: Array.from(select.options).some(o => o.value === 'Dernier'), text: statusBox().textContent, problem: statusBox().classList.contains('is-problem') };
      // ... puis un nombre.
      await closeSettings();
      stub().setFormulaColumn(TABLE, 'Dernier', null);
      stub().setVariables(TABLE, Object.assign({}, COLUMNS, { Dernier: 'Numeric' }));
      await GristAPI.refreshSchema();
      await openSettings();
      const numeric = { selected: select.value, text: statusBox().textContent, problem: statusBox().classList.contains('is-problem') };
      const checks = {
        missingKept: missing.selected === 'Disparue' && missing.listed,
        missingSays: missing.text === I18n.t('settings.exportDate.status.missing', { column: 'Disparue' }) && missing.problem,
        formulaKept: formula.selected === 'Dernier' && formula.listed,
        formulaSays: formula.text === I18n.t('settings.exportDate.status.unusable', { column: 'Dernier' }) && formula.problem,
        numericSays: numeric.selected === 'Dernier' && numeric.text === I18n.t('settings.exportDate.status.unusable', { column: 'Dernier' }) && numeric.problem,
        optionUntouched: optionNow() === 'Dernier',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ missing, formula, numeric }) };
    },
  );

  scenario(
    'exportdate_panel_without_a_usable_column_says_so_and_stays_greyed_for_a_read_only_account',
    'Une table sans colonne utilisable le dit (et comment en ajouter une) ; en lecture seule, la liste est grisée, le message de verrou paraît et un changement venu de la liste n’écrit rien',
    async () => {
      stub().setVariables(TABLE, { Montant: 'Numeric', Calcul: 'Date' });
      stub().setRows(TABLE, [{ id: 1, Montant: 1 }]);
      stub().setFormulaColumn(TABLE, 'Calcul', '$Montant');
      await GristAPI.refreshSchema();
      await openSettings();
      const select = el(SELECT_ID);
      const empty = { listed: Array.from(select.options).map(o => o.value), text: statusBox().textContent };
      await closeSettings();
      stub().setVariables(TABLE, COLUMNS);
      stub().setRows(TABLE, ROWS);
      await GristAPI.refreshSchema();
      const realGet = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: true, canComment: false });
      try {
        await openSettings();
        const locked = { disabled: select.disabled, hint: !el('settings-exportdate-locked').hidden };
        select.value = 'Dernier';
        select.disabled = false; // un clavier ou un script qui passerait outre le grisage
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(150);
        const afterTry = { option: optionNow(), column: ExportDate.getColumn(), selected: select.value };
        const checks = {
          emptyList: same(empty.listed, ['']),
          emptySays: empty.text === I18n.t('settings.exportDate.status.noColumns', { table: TABLE }),
          greyed: locked.disabled && locked.hint,
          nothingWritten: afterTry.option === undefined && afterTry.column === null && afterTry.selected === '',
        };
        const v = verdict(checks);
        return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ empty, locked, afterTry }) };
      } finally { AccessRights.get = realGet; }
    },
  );

  scenario(
    'exportdate_option_follows_grist_saving_and_going_back',
    'L’option est relue quand Grist la change (une autre personne enregistre la vue, « Retour ») : la colonne du module et la liste ouverte la suivent ; une option illisible vaut « aucune »',
    async () => {
      await openSettings();
      stub().setWidgetOptions({ [KEY]: 'Jour' });
      await sleep(150);
      const first = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      stub().setWidgetOptions({ [KEY]: 'Quand' });
      await sleep(150);
      const second = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      stub().setWidgetOptions({ [KEY]: 42 });
      await sleep(150);
      const garbage = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      stub().setWidgetOptions(null);
      await sleep(150);
      const back = { column: ExportDate.getColumn(), selected: el(SELECT_ID).value };
      const checks = {
        first: first.column === 'Jour' && first.selected === 'Jour',
        second: second.column === 'Quand' && second.selected === 'Quand',
        garbage: garbage.column === null && garbage.selected === '',
        back: back.column === null && back.selected === '',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ first, second, garbage, back }) };
    },
  );

  // === Ce qui s'écrit ===
  // Une instant dont les accesseurs « locaux » disent un autre jour que celui du méridien de Greenwich : sans getUTC*, toute lecture UTC lèverait ou rendrait NaN.
  const localNow = () => ({
    getTime: () => Date.UTC(2026, 9, 9, 22, 30, 41, 500),
    getFullYear: () => 2026, getMonth: () => 9, getDate: () => 10, getHours: () => 0, getMinutes: () => 30,
  });

  scenario(
    'exportdate_value_follows_the_column_type_and_the_day_of_the_device',
    'Date : le jour de l’appareil (pas celui du méridien de Greenwich), en secondes à minuit UTC comme Grist le garde ; Date et heure : l’instant en secondes ; Texte : « AAAA-MM-JJ HH:mm » à l’heure de l’appareil',
    async () => {
      const now = localNow();
      const got = { date: ExportDate.valueFor('date', now), datetime: ExportDate.valueFor('datetime', now), text: ExportDate.valueFor('text', now) };
      const checks = {
        date: got.date === Date.UTC(2026, 9, 10) / 1000,
        datetime: got.datetime === Date.UTC(2026, 9, 9, 22, 30, 41) / 1000,
        text: got.text === '2026-10-10 00:30',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  // Les bornes d'une valeur lue juste après une écriture : l'instant exact n'est pas maîtrisé, le jour peut changer entre deux lectures de l'horloge.
  const between = (read, lo, hi) => typeof read === 'number' && read >= lo && read <= hi;
  scenario(
    'exportdate_stamp_writes_each_type_for_the_given_rows_only_in_one_write',
    'Pour les lignes données, une seule écriture (BulkUpdateRecord) met la date dans la colonne choisie : un nombre de secondes dans une colonne Date et heure, le jour à minuit UTC dans une colonne Date, le texte dans une colonne Texte ; les autres lignes ne bougent pas',
    async () => {
      const results = {};
      for (const [column, kind] of [['Dernier', 'datetime'], ['Jour', 'date'], ['Quand', 'text']]) {
        stub().setWidgetOptions({ [KEY]: column });
        await sleep(80);
        stub().clearActionLog();
        const t0 = new Date();
        const outcome = await ExportDate.stamp(TABLE, [1, 3, 3]);
        const t1 = new Date();
        results[kind] = { outcome, writes: bulkWrites(), rows: [1, 2, 3, 4].map(id => rowOf(id)[column]), t0, t1 };
      }
      const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000;
      const dt = results.datetime;
      const dd = results.date;
      const tx = results.text;
      const two = n => String(n).padStart(2, '0');
      const textOf = d => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
      const checks = {
        datetimeOne: dt.outcome === null && dt.writes.length === 1 && same(dt.writes[0][2], [1, 3]) && same(Object.keys(dt.writes[0][3]), ['Dernier']),
        datetimeValue: between(dt.rows[0], Math.floor(dt.t0.getTime() / 1000), Math.floor(dt.t1.getTime() / 1000)) && dt.rows[0] === dt.rows[2],
        datetimeOthers: dt.rows[1] == null && dt.rows[3] == null,
        dateOne: dd.outcome === null && dd.writes.length === 1 && same(dd.writes[0][2], [1, 3]),
        dateValue: (dd.rows[0] === day(dd.t0) || dd.rows[0] === day(dd.t1)) && dd.rows[0] === dd.rows[2] && dd.rows[1] == null && dd.rows[3] == null,
        textOne: tx.outcome === null && tx.writes.length === 1,
        textValue: (tx.rows[0] === textOf(tx.t0) || tx.rows[0] === textOf(tx.t1)) && tx.rows[0] === tx.rows[2] && tx.rows[1] == null && tx.rows[3] == null,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ dt: dt.rows, dd: dd.rows, tx: tx.rows }) };
    },
  );

  scenario(
    'exportdate_stamp_asks_grist_nothing_without_a_column_rows_or_the_right_to_write',
    'Sans colonne choisie, sans ligne, ou pour un compte Lecteur de Grist : rien n’est écrit ni lu (aucun appel à Grist), aucun message ; un compte Lecteur n’essaie même pas d’écrire (aucune écriture refusée)',
    async () => {
      const calls = { fetchTable: 0, applyUserActions: 0 };
      // Les compteurs ne couvrent que les appels à stamp : ce que les autres modules font quand l'option change n'entre pas dans la mesure.
      const counted = async fn => {
        const { fetchTable, applyUserActions } = grist.docApi;
        grist.docApi.fetchTable = function () { calls.fetchTable++; return fetchTable.apply(this, arguments); };
        grist.docApi.applyUserActions = function () { calls.applyUserActions++; return applyUserActions.apply(this, arguments); };
        try { return await fn(); } finally { grist.docApi.fetchTable = fetchTable; grist.docApi.applyUserActions = applyUserActions; }
      };
      const outcomes = {};
      outcomes.noColumn = await counted(() => ExportDate.stamp(TABLE, [1, 2]));
      stub().setWidgetOptions({ [KEY]: 'Dernier' });
      await sleep(120);
      await counted(async () => {
        outcomes.noRows = await ExportDate.stamp(TABLE, []);
        outcomes.noRowsAtAll = await ExportDate.stamp(TABLE, undefined);
        outcomes.noTable = await ExportDate.stamp('', [1]);
      });
      stub().setViewer(true);
      outcomes.viewer = await counted(() => ExportDate.stamp(TABLE, [1, 2]));
      const checks = {
        allNull: Object.keys(outcomes).every(k => outcomes[k] === null),
        askedNothing: calls.fetchTable === 0 && calls.applyUserActions === 0,
        noDeniedWrite: stub().state.deniedWrites.length === 0,
        nothingWritten: [1, 2, 3, 4].every(id => rowOf(id).Dernier == null),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ outcomes, calls }) };
    },
  );

  scenario(
    'exportdate_stamp_names_a_missing_unusable_or_refused_column_without_writing_blindly',
    'Une colonne disparue, devenue à formule ou d’un autre type : « missing » / « unusable » sans tenter d’écrire (Grist refuserait le lot entier) ; une écriture refusée par Grist pour une autre raison : « failed » ; les trois disent la colonne',
    async () => {
      const out = {};
      stub().setWidgetOptions({ [KEY]: 'Disparue' });
      await sleep(80);
      stub().clearActionLog();
      out.missing = await ExportDate.stamp(TABLE, [1]);
      // La colonne choisie devient une colonne à formule dans Grist APRÈS la dernière lecture du schéma du widget : l'écriture relit les métadonnées avant d'écrire.
      stub().setWidgetOptions({ [KEY]: 'Dernier' });
      await sleep(80);
      stub().setFormulaColumn(TABLE, 'Dernier', '$Nom');
      out.formula = await ExportDate.stamp(TABLE, [1]);
      stub().setFormulaColumn(TABLE, 'Dernier', null);
      stub().setVariables(TABLE, Object.assign({}, COLUMNS, { Dernier: 'Numeric' }));
      out.numeric = await ExportDate.stamp(TABLE, [1]);
      stub().setVariables(TABLE, COLUMNS);
      stub().setFormulaColumn(TABLE, 'Calcul', '$Dernier');
      stub().setFormulaColumn(TABLE, 'Vide', '');
      const writesBefore = bulkWrites().length;
      // Refus de Grist sans ligne manquante (règle d'accès sur la colonne) : on le dit, une fois les lignes vérifiées.
      const apply = grist.docApi.applyUserActions;
      let refused = 0;
      grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(a => a[0] === 'BulkUpdateRecord')) { refused++; throw new Error('Blocked by access rules (simulé)'); }
        return apply.apply(this, arguments);
      };
      try { out.refused = await ExportDate.stamp(TABLE, [1, 2]); } finally { grist.docApi.applyUserActions = apply; }
      const checks = {
        missing: same(out.missing, { reason: 'missing', column: 'Disparue' }),
        formula: same(out.formula, { reason: 'unusable', column: 'Dernier' }),
        numeric: same(out.numeric, { reason: 'unusable', column: 'Dernier' }),
        noBlindWrite: bulkWrites().length === 0 && writesBefore === 0,
        refused: same(out.refused, { reason: 'failed', column: 'Dernier' }) && refused === 1,
        nothingChanged: [1, 2, 3, 4].every(id => rowOf(id).Dernier == null),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out) };
    },
  );

  scenario(
    'exportdate_stamp_keeps_the_other_rows_when_one_was_deleted_during_the_export',
    'Une ligne supprimée pendant l’export fait refuser tout le lot par Grist : les lignes qui restent sont datées quand même, sans message ; si toutes ont disparu, rien à dire',
    async () => {
      stub().setWidgetOptions({ [KEY]: 'Dernier' });
      await sleep(80);
      await grist.docApi.applyUserActions([['RemoveRecord', TABLE, 2]]);
      stub().clearActionLog();
      const partial = await ExportDate.stamp(TABLE, [1, 2, 3]);
      const writes = bulkWrites().map(a => a[2]);
      const rowsNow = [1, 3, 4].map(id => rowOf(id).Dernier);
      await grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE, [1, 3]]]);
      stub().clearActionLog();
      const allGone = await ExportDate.stamp(TABLE, [1, 3]);
      const goneWrites = bulkWrites().map(a => a[2]);
      const checks = {
        partialSilent: partial === null,
        twoTries: same(writes, [[1, 2, 3], [1, 3]]),
        keptRowsDated: typeof rowsNow[0] === 'number' && rowsNow[0] === rowsNow[1] && rowsNow[2] == null,
        allGoneSilent: allGone === null && same(goneWrites, [[1, 3]]),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ writes, rowsNow, goneWrites }) };
    },
  );

  scenario(
    'exportdate_stamp_turns_an_empty_column_into_a_data_column',
    'Une colonne « vide » (ajoutée dans Grist, type Date posé, aucune donnée) est proposée et reçoit la date ; Grist en fait une colonne de données, et l’export suivant l’écrit encore',
    async () => {
      stub().setWidgetOptions({ [KEY]: 'Vide' });
      await sleep(80);
      const first = await ExportDate.stamp(TABLE, [1]);
      const afterFirst = { value: rowOf(1).Vide, formula: GristAPI.isFormulaColumn(TABLE, 'Vide') };
      const second = await ExportDate.stamp(TABLE, [2]);
      const checks = {
        silent: first === null && second === null,
        written: typeof afterFirst.value === 'number' && afterFirst.value === Math.floor(afterFirst.value),
        dataColumn: afterFirst.formula === false,
        stillWorks: typeof rowOf(2).Vide === 'number',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(afterFirst) };
    },
  );

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.exportDate = cases;
})();
