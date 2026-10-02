// Suite "settingsColumns" - avertissement d'ouverture quand Réglages > Accès ou Réglages > Selon la ligne cite une colonne (ou la table des droits) qui n'existe plus dans Grist
// (js/settings-columns.js ; point 11 d'Antoine du 2026-10-02, carte « Prévenir quand Accès ou Selon la ligne cite une colonne renommée ou supprimée ? » : « Prévenir »).
// Les réglages sont des options du widget, posées comme Grist le ferait (stub.setWidgetOptions -> onOptions) ; une colonne renommée, supprimée ou une table retirée l'est comme Grist le
// fait (stub.renameColumn / deleteColumn / renameTable / dropTable : les identifiants de ligne des métadonnées restent stables, le schéma est relu ensuite). Chaque scénario part d'un schéma
// neuf (tables « Sc… »), sans réglage, et remet les options à zéro en partant.
// Le démarrage réel (appel de js/main.js, après l'affichage du modèle, message entier dans le coin d'état à 700x400) est dans verify-settings-columns-open.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const verdict = checks => { const failed = Object.keys(checks).filter(k => !checks[k]); return { pass: failed.length === 0, failed }; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const EMAIL = 'responsable@exemple.fr';
  const RIGHTS = 'ScDroits';
  const PAGE = 'ScDossiers';
  const LINKED = 'ScProjets';
  const ACCESS = { table: RIGHTS, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  // Un modèle « 999 » n'existe pas : la règle est sautée et « Sinon : garder » n'ouvre rien - le réglage est lu sans que le widget change de modèle.
  const rule = column => ({ column, operator: '=', value: 'x', modeleId: '999' });
  const byRow = rules => ({ enabled: true, rules, otherwise: 'keep' });
  const HINT_FR = ' À re-choisir dans les Réglages.';

  function purge() { stub().state.tables.filter(t => /^Sc[A-Z]/.test(t)).forEach(t => stub().dropTable(t)); }
  async function seed() {
    const s = stub();
    s.setVariables(LINKED, { Nom: 'Text', Budget: 'Numeric' });
    s.setVariables(PAGE, { Titre: 'Text', Statut: 'Text', Projet: 'Ref:' + LINKED });
    s.setVariables(RIGHTS, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    s.setRows(LINKED, [{ id: 1, Nom: 'Projet Alpha', Budget: 5000 }]);
    s.setRows(PAGE, [{ id: 1, Titre: 'Dossier 1', Statut: 'Ouvert', Projet: 1 }]);
    s.setRows(RIGHTS, [{ id: 1, Email: EMAIL, LectureSeule: false, Export: true, Commentaires: true }]);
    s.setUserEmail(EMAIL);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Titre: 'Dossier 1', Statut: 'Ouvert', Projet: 1 }, PAGE);
  }
  // Réglages posés, droits recalculés (la minuterie de 10 s n'est pas attendue).
  async function configure(options) {
    stub().setWidgetOptions(options);
    await sleep(80);
    await AccessRights.refresh();
    await sleep(40);
  }
  async function cleanup() {
    stub().setWidgetOptions(null);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && (AccessRights.getConfig() || AccessRights.get().readOnly)) await sleep(40);
    await sleep(120);
    document.getElementById('btn-mode-edit').click();
    await sleep(200);
  }
  function scenario(id, description, body) {
    cases.push({
      id, description,
      run: async (h) => {
        await h.resetEditor();
        purge();
        await seed();
        try { return await body(h); }
        finally { await cleanup(); purge(); await GristAPI.refreshSchema(); }
      },
    });
  }
  const renamed = async fn => { fn(stub()); await GristAPI.refreshSchema(); };
  // La vérification comme js/main.js l'appelle : ce qu'elle dit au coin d'état, et ce qu'elle rend.
  async function open(hooks) {
    const messages = [];
    const result = await SettingsColumns.checkAfterOpen(Object.assign({ isUntouched: () => true, notify: (text, isError) => messages.push({ text, isError }) }, hooks || {}));
    return { messages, result };
  }
  const fr = (access, rowTemplate) => (access ? 'Accès : ' + access + ' ' : '') + (rowTemplate ? 'Modèle selon la ligne : ' + rowTemplate + ' ' : '');

  scenario(
    'settingscolumns_nothing_set_says_nothing_and_asks_grist_nothing',
    'Sans réglage Accès ni Selon la ligne (le cas général) : aucun message, et pas un appel de plus à Grist (ni lecture de table, ni détection de la table de la page)',
    async () => {
      const calls = { fetchTable: 0, getTable: 0 };
      const fetchTable = grist.docApi.fetchTable;
      const getTable = grist.getTable;
      grist.docApi.fetchTable = function () { calls.fetchTable++; return fetchTable.apply(this, arguments); };
      if (typeof getTable === 'function') grist.getTable = function () { calls.getTable++; return getTable.apply(this, arguments); };
      let out;
      try { out = await open(); } finally { grist.docApi.fetchTable = fetchTable; if (typeof getTable === 'function') grist.getTable = getTable; }
      const found = await SettingsColumns.problems();
      const checks = {
        noMessage: out.messages.length === 0 && out.result.message === '',
        askedNothing: calls.fetchTable === 0 && calls.getTable === 0,
        nothingFound: found.access === null && found.rowTemplate === null && SettingsColumns.message(found) === '',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_healthy_settings_say_nothing',
    'Des réglages dont toutes les colonnes existent (Accès complet ; règles sur une colonne de la page, une colonne d’une autre table et un chemin de références) : aucun message',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule('Statut'), rule(LINKED + '.Nom'), rule(PAGE + '.Projet.Nom')]) });
      const out = await open();
      const found = await SettingsColumns.problems();
      const checks = {
        reallySet: !!AccessRights.getConfig() && RowTemplate.readRaw().enabled && RowTemplate.readRaw().rules.length === 3,
        noMessage: out.messages.length === 0 && out.result.message === '',
        nothingFound: found.access === null && found.rowTemplate === null,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_access_names_the_renamed_column',
    'Accès : la colonne Email renommée « Courriel » dans Grist - le message dit « Accès : la colonne « Email » n’existe plus. À re-choisir dans les Réglages. », en erreur, une seule fois, et rien d’autre n’est cité',
    async () => {
      await configure({ droitsAcces: ACCESS });
      await renamed(s => s.renameColumn(RIGHTS, 'Email', 'Courriel'));
      const out = await open();
      const found = await SettingsColumns.problems();
      const checks = {
        found: same(found.access, { columns: ['Email'] }) && found.rowTemplate === null,
        oneMessage: out.messages.length === 1 && out.messages[0].isError === true,
        text: out.messages.length === 1 && out.messages[0].text === fr('la colonne « Email » n’existe plus.') + HINT_FR.trim(),
        returned: out.result.message === (out.messages[0] && out.messages[0].text),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out.messages) };
    },
  );

  scenario(
    'settingscolumns_access_lists_every_missing_column_in_the_order_of_the_tab',
    'Accès : une colonne de droit renommée et une supprimée - le message les nomme dans l’ordre de l’onglet (e-mail, lecture seule, export, commentaires), au pluriel ; une colonne jamais choisie n’est pas « manquante »',
    async () => {
      await configure({ droitsAcces: Object.assign({}, ACCESS, { exportColumn: '' }) });
      await renamed(s => { s.renameColumn(RIGHTS, 'LectureSeule', 'ModeLecture'); s.deleteColumn(RIGHTS, 'Commentaires'); });
      const out = await open();
      const found = await SettingsColumns.problems();
      const checks = {
        found: same(found.access, { columns: ['LectureSeule', 'Commentaires'] }),
        text: out.messages.length === 1 && out.messages[0].text === fr('les colonnes « LectureSeule », « Commentaires » n’existent plus.') + HINT_FR.trim(),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out.messages) };
    },
  );

  scenario(
    'settingscolumns_access_table_gone_names_the_table_only',
    'Accès : la table des droits renommée (ou supprimée) dans Grist - le message nomme la TABLE, pas ses colonnes, qui n’ont plus de sens sans elle',
    async () => {
      await configure({ droitsAcces: ACCESS });
      await renamed(s => s.renameTable(RIGHTS, 'ScDroitsBis'));
      const out = await open();
      const found = await SettingsColumns.problems();
      const checks = {
        found: same(found.access, { table: RIGHTS }),
        text: out.messages.length === 1 && out.messages[0].text === 'Accès : la table « ' + RIGHTS + ' » n’existe plus.' + HINT_FR,
      };
      await renamed(s => { s.dropTable('ScDroitsBis'); });
      const dropped = await SettingsColumns.problems();
      checks.droppedToo = same(dropped.access, { table: RIGHTS });
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out.messages) };
    },
  );

  scenario(
    'settingscolumns_row_template_names_bare_qualified_and_path_columns',
    'Selon la ligne : une colonne de la page renommée, une colonne d’une autre table renommée et un chemin de références dont la dernière colonne a disparu - nommées comme la règle les cite, dans l’ordre des règles ; une colonne saine n’est pas citée',
    async () => {
      await configure({ modeleSelonLigne: byRow([rule('Statut'), rule('Titre'), rule(LINKED + '.Nom'), rule(PAGE + '.Projet.Nom')]) });
      await renamed(s => { s.renameColumn(PAGE, 'Statut', 'Etat'); s.renameColumn(LINKED, 'Nom', 'Intitule'); });
      const out = await open();
      const found = await SettingsColumns.problems();
      const wanted = ['Statut', LINKED + '.Nom', PAGE + '.Projet.Nom'];
      const checks = {
        found: found.access === null && same(found.rowTemplate, { columns: wanted }),
        text: out.messages.length === 1 && out.messages[0].text === fr('', 'les colonnes « Statut », « ' + LINKED + '.Nom », « ' + PAGE + '.Projet.Nom » n’existent plus.') + HINT_FR.trim(),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out.messages) };
    },
  );

  scenario(
    'settingscolumns_row_template_column_of_a_table_gone_is_gone_too',
    'Selon la ligne : une règle sur « Table.Colonne » dont la table a été supprimée dans Grist est signalée (la colonne n’existe plus non plus), une même colonne citée par deux règles n’est dite qu’une fois',
    async () => {
      await configure({ modeleSelonLigne: byRow([rule(LINKED + '.Nom'), rule(LINKED + '.Nom'), rule('Titre')]) });
      await renamed(s => s.dropTable(LINKED));
      const found = await SettingsColumns.problems();
      const checks = { found: same(found.rowTemplate, { columns: [LINKED + '.Nom'] }) };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(found) };
    },
  );

  scenario(
    'settingscolumns_row_template_switched_off_or_incomplete_says_nothing',
    'Selon la ligne coupé (ses règles gardées ne comptent pas) ou dont les règles sont incomplètes : aucun message, même si la colonne citée n’existe pas',
    async () => {
      await configure({ modeleSelonLigne: { enabled: false, rules: [rule('Disparue')], otherwise: 'keep' } });
      const off = await open();
      await configure({ modeleSelonLigne: { enabled: true, rules: [{ column: 'Disparue', operator: '=', value: 'x', modeleId: '' }, { column: '', operator: '=', value: 'x', modeleId: '999' }], otherwise: 'keep' } });
      const incomplete = await open();
      // Coupé pendant que l'Accès, lui, cite une colonne disparue : seul l'Accès est dit, la règle gardée ne compte pas.
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: { enabled: false, rules: [rule('Disparue')], otherwise: 'keep' } });
      await renamed(s => s.renameColumn(RIGHTS, 'Email', 'Courriel'));
      const accessOnly = await open();
      const checks = {
        off: off.messages.length === 0 && off.result.message === '',
        incomplete: incomplete.messages.length === 0 && incomplete.result.message === '',
        accessOnly: accessOnly.messages.length === 1 && accessOnly.messages[0].text === fr('la colonne « Email » n’existe plus.') + HINT_FR.trim() && accessOnly.messages[0].text.indexOf('Disparue') === -1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_both_settings_make_one_message_with_the_hint_once',
    'Les deux réglages citent une colonne disparue : un seul message, Accès d’abord puis Modèle selon la ligne, « À re-choisir dans les Réglages. » une seule fois à la fin',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule('Statut')]) });
      await renamed(s => { s.renameColumn(RIGHTS, 'Export', 'Telechargement'); s.renameColumn(PAGE, 'Statut', 'Etat'); });
      const out = await open();
      const text = out.messages.length === 1 ? out.messages[0].text : '';
      const checks = {
        oneMessage: out.messages.length === 1,
        text: text === fr('la colonne « Export » n’existe plus.', 'la colonne « Statut » n’existe plus.') + HINT_FR.trim(),
        hintOnce: text.split('À re-choisir').length === 2 && text.endsWith('À re-choisir dans les Réglages.'),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || text };
    },
  );

  scenario(
    'settingscolumns_english_interface_says_it_in_english',
    'Interface en anglais : « Access: the column “Email” no longer exists. Template by row: the columns “A”, “B” no longer exist. Choose again in Settings. », titres des onglets et guillemets compris',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule('Statut'), rule('Titre')]) });
      await renamed(s => { s.renameColumn(RIGHTS, 'Email', 'Courriel'); s.renameColumn(PAGE, 'Statut', 'Etat'); s.renameColumn(PAGE, 'Titre', 'Intitule'); });
      const out = await inLang('en', () => open());
      const checks = {
        text: out.messages.length === 1 && out.messages[0].text === 'Access: the column “Email” no longer exists. Template by row: the columns “Statut”, “Titre” no longer exist. Choose again in Settings.',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(out.messages) };
    },
  );

  scenario(
    'settingscolumns_unknown_schema_says_nothing',
    'Schéma illisible (aucune table connue) ou colonnes d’une table pas encore lues : on ne sait pas, donc on ne dit rien - jamais un faux message ; le même réglage, schéma lu, est bien signalé',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule('Statut'), rule(LINKED + '.Nom')]) });
      await renamed(s => { s.renameColumn(RIGHTS, 'Email', 'Courriel'); s.renameColumn(PAGE, 'Statut', 'Etat'); });
      const tables = GristAPI.getTables;
      const columns = GristAPI.getColumns;
      let noTables; let noColumns;
      try {
        GristAPI.getTables = () => [];
        noTables = await open();
        GristAPI.getTables = tables;
        GristAPI.getColumns = () => [];
        noColumns = await open();
      } finally { GristAPI.getTables = tables; GristAPI.getColumns = columns; }
      const read = await open();
      const checks = {
        noTables: noTables.messages.length === 0 && noTables.result.message === '',
        noColumns: noColumns.messages.length === 0 && noColumns.result.message === '',
        readSchemaTellsIt: read.messages.length === 1 && /« Email »/.test(read.messages[0].text) && /« Statut »/.test(read.messages[0].text),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_unknown_page_table_skips_bare_columns_only',
    'Table de la page inconnue : une règle sur une colonne NUE (de la page) ne se vérifie pas, celle d’une autre table (« Table.Colonne ») se vérifie toujours',
    async () => {
      await configure({ modeleSelonLigne: byRow([rule('Disparue'), rule(LINKED + '.Disparue')]) });
      const current = GristAPI.getCurrentTableId;
      const detect = GristAPI.detectTableId;
      let found;
      try {
        GristAPI.getCurrentTableId = () => null;
        GristAPI.detectTableId = async () => null;
        found = await SettingsColumns.problems();
      } finally { GristAPI.getCurrentTableId = current; GristAPI.detectTableId = detect; }
      const known = await SettingsColumns.problems();
      const checks = {
        qualifiedOnly: same(found.rowTemplate, { columns: [LINKED + '.Disparue'] }),
        bothWithThePage: same(known.rowTemplate, { columns: ['Disparue', LINKED + '.Disparue'] }),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(found) };
    },
  );

  scenario(
    'settingscolumns_a_person_restricted_by_her_row_is_not_told_but_the_owner_is',
    'Une personne que sa ligne de droits met en lecture seule ne reçoit pas un message qui ne regarde que qui règle l’Accès ; la personne qui n’est pas restreinte, si : même réglage, même colonne manquante',
    async () => {
      await configure({ droitsAcces: ACCESS });
      await renamed(s => s.deleteColumn(RIGHTS, 'Export'));
      const owner = await open();
      stub().state.rows[RIGHTS].LectureSeule[0] = true;
      await AccessRights.refresh();
      await sleep(80);
      const restrictedNow = AccessRights.get().readOnly && AccessRights.getStatus().state === 'found';
      const restricted = await open();
      const checks = {
        ownerTold: owner.messages.length === 1 && /« Export »/.test(owner.messages[0].text),
        reallyRestricted: restrictedNow,
        restrictedSilent: restricted.messages.length === 0 && restricted.result.skipped === 'restricted',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_waits_for_rights_still_being_computed_before_telling',
    'Les droits se calculent encore (état « pending », la table des droits met du temps à répondre) : on attend leur résultat avant de parler - une personne que sa ligne met en lecture seule ne reçoit pas le message, même quand le widget s’ouvre avant la fin du calcul',
    async () => {
      stub().state.rows[RIGHTS].LectureSeule[0] = true;
      await renamed(s => s.deleteColumn(RIGHTS, 'Export'));
      stub().setLatency({ fetchTable: 250 });
      let during; let out;
      try {
        stub().setWidgetOptions({ droitsAcces: ACCESS });
        await sleep(60);
        during = AccessRights.getStatus().state;
        out = await open();
      } finally { stub().setLatency({}); }
      const checks = {
        wasPending: during === 'pending',
        nowRestricted: AccessRights.getStatus().state === 'found' && AccessRights.get().readOnly,
        silent: out.messages.length === 0 && out.result.skipped === 'restricted',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_cannot_tell_hidden_from_gone_says_nothing',
    'La liste des tables (_grist_Tables) elle-même illisible : on ne peut pas savoir si la table des droits est supprimée ou cachée, donc on ne dit rien - jamais un faux « n’existe plus »',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule(LINKED + '.Nom')]) });
      await renamed(s => { s.dropTable(RIGHTS); s.dropTable(LINKED); });
      const fetchTable = grist.docApi.fetchTable;
      grist.docApi.fetchTable = async function (name) { if (name === '_grist_Tables') throw new Error('réseau coupé'); return fetchTable.apply(this, arguments); };
      let unreadable;
      try { unreadable = await open(); } finally { grist.docApi.fetchTable = fetchTable; }
      const readable = await open();
      const checks = {
        unreadableSilent: unreadable.messages.length === 0 && unreadable.result.message === '',
        goneSaysIt: readable.messages.length === 1 && /la table « ScDroits » n’existe plus/.test(readable.messages[0].text) && /« ScProjets\.Nom »/.test(readable.messages[0].text),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_locked_by_an_unreadable_rights_table_is_still_told',
    'La table des droits illisible (état « error » : tout le monde est verrouillé, la personne qui a réglé l’Accès aussi) : le message est dit quand même, c’est lui qui explique le verrou',
    async () => {
      await configure({ droitsAcces: ACCESS });
      await renamed(s => s.renameTable(RIGHTS, 'ScDroitsBis'));
      const fetchTable = grist.docApi.fetchTable;
      grist.docApi.fetchTable = async function (name) { if (name === RIGHTS) throw new Error('table introuvable'); return fetchTable.apply(this, arguments); };
      let out; let locked;
      try {
        await AccessRights.refresh();
        await sleep(60);
        locked = AccessRights.get().readOnly && AccessRights.getStatus().state === 'error';
        out = await open();
      } finally { grist.docApi.fetchTable = fetchTable; }
      const checks = {
        reallyLocked: locked === true,
        told: out.messages.length === 1 && out.messages[0].text === 'Accès : la table « ' + RIGHTS + ' » n’existe plus.' + HINT_FR,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  // Une table que Grist cache à cette personne (règle d'accès), comme il la rend (WidgetFrame.ts:listTables, vérifié à la source) : absente de la liste des tables, sa ligne de _grist_Tables
  // reste au nom blanchi, sa lecture est refusée. Rend de quoi la remettre en place pour le nettoyage du scénario.
  function hideTables(names) {
    const s = stub().state;
    names.forEach(name => {
      const at = s.rows._grist_Tables.tableId.indexOf(name);
      s.tables.splice(s.tables.indexOf(name), 1);
      s.rows._grist_Tables.tableId[at] = '';
    });
    return () => names.forEach(name => { if (s.tables.indexOf(name) === -1) s.tables.push(name); });
  }

  scenario(
    'settingscolumns_a_table_hidden_by_an_access_rule_is_not_said_to_be_gone',
    'Une table que Grist cache à cette personne (règle d’accès : absente de la liste, ligne de _grist_Tables au nom blanchi, lecture refusée) n’est pas dite « disparue » - ni la table des droits, ni celle d’une règle Selon la ligne - alors qu’une colonne disparue d’une table visible, elle, l’est toujours',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule(LINKED + '.Nom'), rule('Disparue')]) });
      const unhide = hideTables([RIGHTS, LINKED]);
      const fetchTable = grist.docApi.fetchTable;
      grist.docApi.fetchTable = async function (name) { if (name === RIGHTS || name === LINKED) throw new Error('accès refusé'); return fetchTable.apply(this, arguments); };
      let out; let found; let locked;
      try {
        await GristAPI.refreshSchema();
        await AccessRights.refresh();
        await sleep(60);
        locked = AccessRights.get().readOnly && AccessRights.getStatus().state === 'error';
        found = await SettingsColumns.problems();
        out = await open();
      } finally { grist.docApi.fetchTable = fetchTable; unhide(); }
      const checks = {
        reallyHidden: GristAPI.getTables().indexOf(RIGHTS) === -1 || locked === true,
        lockedButNotAccused: locked === true && found.access === null,
        hiddenTableSilent: !!found.rowTemplate && same(found.rowTemplate, { columns: ['Disparue'] }),
        visibleTableStillTold: out.messages.length === 1 && out.messages[0].text === fr('', 'la colonne « Disparue » n’existe plus.') + HINT_FR.trim(),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ found, messages: out.messages }) };
    },
  );

  // SettingsColumns.tableGone, que js/access-rights.js appelle pour laisser l'onglet Accès modifiable quand la table des droits n'existe plus (choix d'Antoine du 2026-10-02 : « Rendre
  // modifiable »). Les scénarios de l'onglet lui-même sont dans scenarios-access-rights.js ; ici, le test de « vraiment disparue » seul.
  scenario(
    'settingscolumns_table_gone_is_true_only_when_certain',
    'SettingsColumns.tableGone : vrai pour une table renommée ou supprimée, faux pour une table qui existe, un schéma encore inconnu, une liste des tables (_grist_Tables) illisible, un nom vide - et pour une table cachée par une règle d’accès (rien n’est dit « disparu » pour qui n’a pas le droit de la lire)',
    async () => {
      const exists = await SettingsColumns.tableGone(RIGHTS);
      await renamed(s => s.renameTable(RIGHTS, 'ScDroitsBis'));
      const renamedAway = await SettingsColumns.tableGone(RIGHTS);
      const newName = await SettingsColumns.tableGone('ScDroitsBis');
      await renamed(s => s.dropTable('ScDroitsBis'));
      const dropped = await SettingsColumns.tableGone('ScDroitsBis');
      const tables = GristAPI.getTables;
      const fetchTable = grist.docApi.fetchTable;
      let unknownSchema; let unreadableList;
      try {
        GristAPI.getTables = () => [];
        unknownSchema = await SettingsColumns.tableGone(RIGHTS);
        GristAPI.getTables = tables;
        grist.docApi.fetchTable = async function (name) { if (name === '_grist_Tables') throw new Error('réseau coupé'); return fetchTable.apply(this, arguments); };
        unreadableList = await SettingsColumns.tableGone(RIGHTS);
      } finally { GristAPI.getTables = tables; grist.docApi.fetchTable = fetchTable; }
      const noName = [await SettingsColumns.tableGone(''), await SettingsColumns.tableGone(undefined), await SettingsColumns.tableGone(null)];
      const unhide = hideTables([LINKED]);
      let hidden; let hiddenElsewhere;
      try {
        hidden = await SettingsColumns.tableGone(LINKED);
        hiddenElsewhere = await SettingsColumns.tableGone(RIGHTS);
      } finally { unhide(); }
      const checks = {
        existsIsNotGone: exists === false,
        renamedIsGone: renamedAway === true && newName === false,
        droppedIsGone: dropped === true,
        unknownSchemaCannotTell: unknownSchema === false,
        unreadableListCannotTell: unreadableList === false,
        noNameIsNotGone: noName.every(v => v === false),
        hiddenIsNotGone: hidden === false && hiddenElsewhere === false,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_not_written_over_unsaved_changes',
    'Quand la personne a déjà commencé à modifier (le coin d’état dit « Modifications non enregistrées »), le message ne le remplace pas : rien n’est écrit au coin d’état, le résultat garde le message',
    async () => {
      await configure({ droitsAcces: ACCESS });
      await renamed(s => s.renameColumn(RIGHTS, 'Email', 'Courriel'));
      const out = await open({ isUntouched: () => false });
      const checks = {
        silent: out.messages.length === 0,
        kept: out.result.skipped === 'edited' && /« Email »/.test(out.result.message),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'settingscolumns_writes_nothing_and_leaves_the_settings_as_they_are',
    'L’avertissement ne réécrit rien : ni le document Grist, ni les options du widget - la personne re-choisit elle-même',
    async () => {
      await configure({ droitsAcces: ACCESS, modeleSelonLigne: byRow([rule('Statut')]) });
      await renamed(s => { s.renameColumn(RIGHTS, 'Email', 'Courriel'); s.renameColumn(PAGE, 'Statut', 'Etat'); });
      const optionsBefore = JSON.stringify(stub().state.options);
      stub().clearActionLog();
      const out = await open();
      const checks = {
        told: out.messages.length === 1,
        noAction: stub().getActionLog().length === 0,
        optionsKept: JSON.stringify(stub().state.options) === optionsBefore && JSON.stringify(GristAPI.getWidgetOptions()) === optionsBefore,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.settingsColumns = cases;
})();
