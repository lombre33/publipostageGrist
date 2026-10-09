// Suite "templatePack" - les modèles de la galerie qui s'installent AVEC leurs tables (js/template-pack.js, js/template-gallery-modal.js : « Créer avec ses tables »).
//
// Un modèle à pack apporte ses tables (types, choix, colonnes de calcul, « Colonne à afficher » des Références), ses règles de liaison et sa page. L'installation les crée VIDES :
// les lignes d'exemple n'existent que dans les captures de l'aperçu (Antoine, 09/10 : « le modèle crée les tables mais sans les données » ; l'aperçu « peut passer par des screenshots »).
// Les actions que l'installateur envoie ont été essayées dans un vrai Grist (labo grist-static, 09/10) ; le faux Grist de dev-tests/grist-stub.js les rejoue comme lui (noms de
// table, métadonnées, colonne d'aide des Références, RemoveTable) - ces scénarios ne prouvent rien de plus que ce que le stub a appris du vrai.
//
// Les tables d'essai portent un préfixe tiré par scénario (« Pk1x… ») : le stub garde ses tables d'un scénario à l'autre, et AddTable renomme un nom pris, comme Grist.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let seq = 0;
  const nextPrefix = () => 'Pk' + (++seq) + 'x';
  const rowCount = tableId => (stub().state.rows[tableId] ? stub().state.rows[tableId].id.length : -1);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 4000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }

  // Le pack tel que le fichier le donne : deux tables, une Référence et une liste de références qui montrent « Nom », des choix, un format monétaire, deux colonnes de calcul,
  // une règle de liaison (le document est celui d'un invité, l'événement est lié) et une page A6 en paysage.
  function rawPack(p) {
    return {
      version: 1,
      main: p + 'Invites',
      tables: [
        { id: p + 'Evenements', columns: [
          { id: 'Nom', type: 'Text', label: 'Nom de l’événement' },
          { id: 'Date', type: 'Date' },
          { id: 'Statut', type: 'Choice', choices: ['Brouillon', 'Publié'] },
          { id: 'Prix', type: 'Numeric', options: { numMode: 'currency', currency: 'EUR' } },
          { id: 'NbInvites', type: 'Int', label: 'Nombre d’invités', formula: 'len(' + p + 'Invites.lookupRecords(Evenement=$id))' },
          { id: 'Invites', type: 'RefList:' + p + 'Invites', show: 'Nom', formula: p + 'Invites.lookupRecords(Evenement=$id)' },
        ] },
        { id: p + 'Invites', columns: [
          { id: 'Nom', type: 'Text' },
          { id: 'Evenement', type: 'Ref:' + p + 'Evenements', show: 'Nom' },
        ] },
      ],
      links: [{ table: p + 'Evenements', mode: 'match', target: 'id', source: 'Evenement' }],
      template: { type: 'document', pdfName: 'Badge #' + p + 'Invites.Nom', page: { format: 'A6', orientation: 'landscape', margins: [8, 8, 8, 8] } },
    };
  }

  // Remet le document de test comme avant : les tables du pack, leur règle de liaison.
  async function removeTables(ids) {
    const present = ids.filter(id => stub().state.tables.indexOf(id) !== -1);
    if (present.length) await stub().applyUserActions(present.map(id => ['RemoveTable', id]));
  }
  async function cleanPack(p) {
    await removeTables([p + 'Evenements', p + 'Invites']);
    try { await GristAPI.deleteLinkRule(p + 'Evenements'); } catch (e) { /* aucune règle : rien à retirer */ }
  }

  // Les actions que le stub a reçues pour les tables d'un préfixe.
  const logFor = p => stub().getActionLog().filter(a => typeof a[1] === 'string' && a[1].indexOf(p) === 0);

  // ---- normalize ----

  cases.push({
    id: 'pack_normalize_completes_the_pack_and_reads_the_family_file',
    description: 'normalize rend un pack complet (table principale, règles, page, e-mail) avec des valeurs de départ pour ce que le fichier ne dit pas, lit les tables d’une famille, ne modifie pas le fichier lu et ne partage rien avec lui',
    run: async () => {
      const p = 'Zz';
      const full = rawPack(p);
      const family = { tables: clone(full.tables) };
      const raw = { version: 1, family: 'evt', main: p + 'Invites', tables: [p + 'Evenements', p + 'Invites'], links: clone(full.links).concat([{ table: p + 'Invites', mode: 'singleton' }]), template: { pdfName: 'x' } };
      const before = clone([raw, family]);
      const pack = TemplatePack.normalize(raw, family);
      const noMain = TemplatePack.normalize({ version: 1, tables: [p + 'Evenements', p + 'Invites'] }, family);
      const events = pack.tables[0];
      const statut = events.columns.find(c => c.id === 'Statut');
      const calc = events.columns.find(c => c.id === 'NbInvites');
      events.columns.find(c => c.id === 'Statut').choices.push('copie');
      const checks = {
        tables: same(pack.tables.map(t => t.id), [p + 'Evenements', p + 'Invites']),
        columns: events.columns.length === 6 && statut.type === 'Choice' && same(calc, { id: 'NbInvites', type: 'Int', label: 'Nombre d’invités', formula: calc.formula, choices: null, show: '', options: null }),
        main: pack.main === p + 'Invites' && noMain.main === p + 'Evenements' && noMain.links.length === 0,
        singleton: same(pack.links[1], { table: p + 'Invites', mode: 'singleton', target: '', source: '' }),
        match: same(pack.links[0], { table: p + 'Evenements', mode: 'match', target: 'id', source: 'Evenement' }),
        template: pack.template.type === 'document' && pack.template.pdfName === 'x' && pack.template.page.format === 'A4' && pack.template.page.orientation === 'portrait' && pack.template.page.margins === null
          && same(pack.template.email, { destinataires: '', cc: '', cci: '', objet: '' }),
        rawUntouched: same(raw, before[0]) && same(family, before[1]),
        independent: family.tables[0].columns[2].choices.length === 2,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'pack_normalize_refuses_each_defect_with_a_message_that_names_it',
    description: 'normalize lève, avec une phrase qui dit le défaut, pour chaque oubli d’un fichier de pack (version, table, colonne, type, choix, Référence, colonne à afficher, table principale, règle de liaison, type de modèle, sens, marges, famille) ; le pack sans défaut passe',
    run: async () => {
      const p = 'Zz';
      const defects = [
        ['version inconnue', r => { r.version = 2; }, 'version'],
        ['aucune table', r => { r.tables = []; }, 'aucune table'],
        ['identifiant de table en minuscule', r => { r.tables[0].id = 'evenements'; }, 'identifiant invalide'],
        ['table sans colonne', r => { r.tables[0].columns = []; }, 'aucune colonne'],
        ['colonne en double (casse)', r => { r.tables[1].columns.push({ id: 'nom', type: 'Text' }); }, 'en double'],
        ['table en double', r => { r.tables.push(clone(r.tables[0])); }, 'en double'],
        ['type inconnu', r => { r.tables[1].columns[0].type = 'Texte'; }, 'type inconnu'],
        ['identifiant de colonne avec accent', r => { r.tables[1].columns[0].id = 'Prénom'; }, 'identifiant invalide'],
        ['choix sur une colonne qui n’en est pas une', r => { r.tables[1].columns[0].choices = ['a']; }, 'choix'],
        ['choix qui ne sont pas des textes', r => { r.tables[0].columns[2].choices = [1]; }, 'choix'],
        ['Référence sans colonne à afficher', r => { delete r.tables[1].columns[1].show; }, 'colonne à afficher'],
        ['Référence vers une table absente', r => { r.tables[1].columns[1].type = 'Ref:Absente'; }, 'pas dans le modèle'],
        ['colonne à afficher inconnue', r => { r.tables[1].columns[1].show = 'Rien'; }, 'n’existe pas'],
        ['colonne à afficher sur autre chose qu’une Référence', r => { r.tables[1].columns[0].show = 'Nom'; }, 'sans être une Référence'],
        ['table principale inconnue', r => { r.main = 'Absente'; }, 'table principale'],
        ['règle vers une table absente', r => { r.links[0].table = 'Absente'; }, 'pas dans le modèle'],
        ['mode de règle inconnu', r => { r.links[0].mode = 'autre'; }, 'mode inconnu'],
        ['règle de correspondance sans colonnes', r => { r.links[0].target = ''; }, 'colonne cible'],
        ['règle sur une colonne absente', r => { r.links[0].source = 'Rien'; }, 'colonne qui n’existe pas'],
        ['type de modèle inconnu', r => { r.template.type = 'macro'; }, 'type inconnu'],
        ['sens de page inconnu', r => { r.template.page.orientation = 'diagonale'; }, 'sens inconnu'],
        ['marges illisibles', r => { r.template.page.margins = [1, 2, 3]; }, 'marges'],
        ['famille inconnue', r => { r.tables = ['Inconnue']; }, 'famille'],
      ];
      const problems = [];
      try { TemplatePack.normalize(rawPack(p), null); } catch (e) { problems.push('le pack sans défaut est refusé : ' + e.message); }
      defects.forEach(([name, mutate, expected]) => {
        const raw = rawPack(p);
        let message = null;
        mutate(raw);
        try { TemplatePack.normalize(raw, { tables: [] }); } catch (e) { message = e.message; }
        if (message === null) problems.push(name + ' : accepté');
        else if (message.indexOf(expected) === -1) problems.push(name + ' : « ' + message + ' » ne dit pas « ' + expected + ' »');
      });
      let unreadable = null;
      try { TemplatePack.normalize(null, null); } catch (e) { unreadable = e.message; }
      if (!unreadable || unreadable.indexOf('illisible') === -1) problems.push('fichier illisible : ' + unreadable);
      return { pass: problems.length === 0, notes: problems.length ? problems.join(' | ') : defects.length + ' défauts refusés, le pack sans défaut passe' };
    },
  });

  // ---- plan ----

  cases.push({
    id: 'pack_plan_sorts_tables_into_create_reuse_and_conflict',
    description: 'plan lit le document : table absente = à créer ; même nom et toutes les colonnes du même genre (entier/décimal, texte/choix, « Any ») = gardée telle quelle ; colonne manquante, type d’un autre genre ou nom qui ne diffère que par la casse = conflit ; les colonnes d’aide de Grist ne comptent pas',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const ev = p + 'Evenements';
      const inv = p + 'Invites';
      const evColumns = { Nom: 'Text', Date: 'Date', Statut: 'Choice', Prix: 'Numeric', NbInvites: 'Int', Invites: 'RefList:' + inv };
      const invColumns = { Nom: 'Text', Evenement: 'Ref:' + ev };
      const planNow = async () => TemplatePack.plan(pack, await TemplatePack.readDocumentSchema());
      const out = {};
      try {
        out.empty = await planNow();
        stub().setVariables(ev, Object.assign({}, evColumns, { manualSort: 'ManualSortPos', gristHelper_Display: 'Any' }));
        stub().setVariables(inv, invColumns);
        out.same = await planNow();
        const schema = await TemplatePack.readDocumentSchema();
        out.helpersIgnored = !('gristhelper_display' in schema.tables[ev.toLowerCase()].columns) && !('manualsort' in schema.tables[ev.toLowerCase()].columns);
        stub().setVariables(ev, Object.assign({}, evColumns, { Prix: 'Int', Statut: 'Text', Nom: 'Any', Date: 'DateTime' }));
        out.compatible = await planNow();
        stub().setVariables(ev, Object.assign({}, evColumns, { NbInvites: 'Text' }));
        stub().setVariables(inv, { Nom: 'Text' });
        out.broken = await planNow();
        stub().dropTable(inv);
        stub().setVariables(p + 'INVITES', invColumns);
        out.casing = await planNow();
      } finally {
        await removeTables([ev, inv, p + 'INVITES']);
      }
      const checks = {
        empty: same(out.empty, { create: [ev, inv], reuse: [], conflicts: [] }),
        same: same(out.same, { create: [], reuse: [ev, inv], conflicts: [] }) && out.helpersIgnored,
        compatible: same(out.compatible, { create: [], reuse: [ev, inv], conflicts: [] }),
        broken: out.broken.create.length === 0 && out.broken.reuse.length === 0 && out.broken.conflicts.length === 2
          && same(out.broken.conflicts[0], { table: ev, problems: [{ kind: 'type', column: 'NbInvites', wanted: 'Int', found: 'Text' }] })
          && same(out.broken.conflicts[1], { table: inv, problems: [{ kind: 'missing', column: 'Evenement' }] }),
        casing: out.casing.create.length === 0 && out.casing.conflicts.some(c => c.table === inv && c.problems.some(x => x.kind === 'name' && x.found === p + 'INVITES')),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, out }) };
    },
  });

  // ---- les actions ----

  cases.push({
    id: 'pack_actions_send_the_tables_alone_then_the_calculated_columns_and_never_a_row',
    description: 'Les actions : le premier lot ne porte que des AddTable (colonnes de donnée seules, avec libellé, choix et format), le second un AddColumn par colonne de calcul ; aucune ligne ; seules les tables demandées ; les « Colonnes à afficher » ne partent qu’avec les identifiants relus après coup',
    run: async () => {
      const p = 'Zz';
      const pack = TemplatePack.normalize(rawPack(p), null);
      const ev = p + 'Evenements';
      const inv = p + 'Invites';
      const addTables = TemplatePack.tableActions(pack, [ev, inv]);
      const calculated = TemplatePack.formulaActions(pack, [ev, inv]);
      const onlyInvites = TemplatePack.tableActions(pack, [inv]);
      const onlyInvitesCalculated = TemplatePack.formulaActions(pack, [inv]);
      const evSpec = addTables[0][2];
      const nb = calculated.find(a => a[2] === 'NbInvites');
      const list = calculated.find(a => a[2] === 'Invites');
      // Un schéma comme readDocumentSchema le rend après la création : les identifiants de ligne des colonnes.
      const schema = { tables: {} };
      let ref = 100;
      pack.tables.forEach(table => { schema.tables[table.id.toLowerCase()] = { ref: ++ref, id: table.id, columns: {} }; table.columns.forEach(column => { schema.tables[table.id.toLowerCase()].columns[column.id.toLowerCase()] = { ref: ++ref, id: column.id, type: column.type }; }); });
      const display = TemplatePack.displayActions(pack, [ev, inv], schema);
      const refOf = (table, column) => schema.tables[table.toLowerCase()].columns[column.toLowerCase()].ref;
      let displayError = null;
      try { TemplatePack.displayActions(pack, [inv], { tables: {} }); } catch (e) { displayError = e; }
      const checks = {
        lots: addTables.length === 2 && addTables.every(a => a[0] === 'AddTable') && calculated.length === 2 && calculated.every(a => a[0] === 'AddColumn'),
        names: same(addTables.map(a => a[1]), [ev, inv]),
        dataColumnsOnly: same(evSpec.map(c => c.id), ['Nom', 'Date', 'Statut', 'Prix']),
        label: evSpec[0].label === 'Nom de l’événement' && !('label' in evSpec[1]),
        choices: JSON.parse(evSpec[2].widgetOptions).choices.join('|') === 'Brouillon|Publié',
        format: same(JSON.parse(evSpec[3].widgetOptions), { numMode: 'currency', currency: 'EUR' }),
        typed: same(addTables[1][2], [{ id: 'Nom', type: 'Text' }, { id: 'Evenement', type: 'Ref:' + ev }]),
        calculated: same(nb, ['AddColumn', ev, 'NbInvites', { type: 'Int', isFormula: true, formula: 'len(' + inv + '.lookupRecords(Evenement=$id))', label: 'Nombre d’invités' }])
          && list[3].type === 'RefList:' + inv && list[3].isFormula === true,
        onlyTheTablesAsked: same(onlyInvites.map(a => a[0] + ' ' + a[1]), ['AddTable ' + inv]) && onlyInvitesCalculated.length === 0,
        display: same(display, [
          ['UpdateRecord', '_grist_Tables_column', refOf(ev, 'Invites'), { visibleCol: refOf(inv, 'Nom') }], ['SetDisplayFormula', ev, null, refOf(ev, 'Invites'), '$Invites.Nom'],
          ['UpdateRecord', '_grist_Tables_column', refOf(inv, 'Evenement'), { visibleCol: refOf(ev, 'Nom') }], ['SetDisplayFormula', inv, null, refOf(inv, 'Evenement'), '$Evenement.Nom'],
        ]),
        displayError: !!displayError && TemplatePack.isPackError(displayError) && displayError.packCode === 'display',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  // ---- apply ----

  cases.push({
    id: 'pack_apply_creates_the_tables_empty_with_types_calculations_displays_and_the_link_rule',
    description: 'apply crée les tables du pack dans le document : colonnes typées, libellés, choix, colonnes de calcul, « Colonne à afficher » des Références et des listes, règle de liaison ; aucune ligne n’est écrite ; le widget relit le schéma',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const ev = p + 'Evenements';
      const inv = p + 'Invites';
      stub().clearActionLog();
      try {
        const result = await TemplatePack.apply(pack);
        const st = stub().state;
        const log = logFor(p);
        const writes = log.map(a => a[0]);
        const rule = GristAPI.getLinkRule(ev);
        const checks = {
          result: same(result, { created: [ev, inv], reused: [], linksSaved: [ev], linksKept: [] }),
          tables: st.tables.indexOf(ev) !== -1 && st.tables.indexOf(inv) !== -1,
          types: st.columns[ev].Statut === 'Choice' && st.columns[ev].Prix === 'Numeric' && st.columns[ev].NbInvites === 'Int' && st.columns[ev].Invites === 'RefList:' + inv && st.columns[inv].Evenement === 'Ref:' + ev,
          labels: st.labels[ev].Nom === 'Nom de l’événement' && st.labels[ev].NbInvites === 'Nombre d’invités' && !(st.labels[inv] && st.labels[inv].Nom),
          choices: same(st.choices[ev].Statut, ['Brouillon', 'Publié']),
          formulas: st.formulas[ev].NbInvites === 'len(' + inv + '.lookupRecords(Evenement=$id))' && st.formulas[ev].Invites === inv + '.lookupRecords(Evenement=$id)',
          shown: st.visibleCols[inv].Evenement === 'Nom' && st.visibleCols[ev].Invites === 'Nom' && /^gristHelper_Display/.test(st.displayCols[inv].Evenement) && /^gristHelper_Display/.test(st.displayCols[ev].Invites),
          empty: rowCount(ev) === 0 && rowCount(inv) === 0 && Object.keys(st.rows[ev]).every(k => st.rows[ev][k].length === 0),
          noRowWritten: !log.some(a => /Record$/.test(a[0])),
          order: writes.indexOf('AddTable') === 0 && writes.lastIndexOf('AddTable') < writes.indexOf('AddColumn') && writes.indexOf('AddColumn') < writes.indexOf('SetDisplayFormula'),
          schemaRead: GristAPI.getTables().indexOf(ev) !== -1 && GristAPI.getColumns(inv).indexOf('Evenement') !== -1 && GristAPI.getColumnType(inv, 'Evenement') === 'Ref:' + ev && GristAPI.getColumnChoices(ev, 'Statut').length === 2,
          referenceShown: same(GristAPI.getReferenceColumn(inv, 'Evenement'), { table: ev, column: 'Nom' }),
          rule: !!rule && rule.mode === 'match' && rule.colonneCible === 'id' && rule.colonneSource === 'Evenement',
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, writes: writes.join(',') }) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_a_second_time_reuses_the_tables_and_creates_nothing',
    description: 'Un pack déjà installé (mêmes tables, mêmes colonnes) : apply ne crée rien, ne réécrit ni les tables ni la règle de liaison, et le dit (created vide, reused)',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      try {
        await TemplatePack.apply(pack);
        stub().clearActionLog();
        const second = await TemplatePack.apply(pack);
        const log = logFor(p);
        const checks = {
          result: same(second, { created: [], reused: [p + 'Evenements', p + 'Invites'], linksSaved: [], linksKept: [] }),
          noWrite: log.length === 0 && stub().countActions('AddTable') === 0 && stub().countActions('AddRecord', 'Publipostage_LiensTables') === 0,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, log: log.map(a => a[0]) }) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_refuses_a_table_that_exists_with_other_columns_and_touches_nothing',
    description: 'Une table du même nom à laquelle il manque des colonnes du pack : apply lève un conflit (codes et tables dits) et ne crée, ne modifie, ne lie rien — pas même l’autre table du pack',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const inv = p + 'Invites';
      stub().setVariables(inv, { Nom: 'Text', Telephone: 'Text' });
      stub().clearActionLog();
      let error = null;
      try { await TemplatePack.apply(pack); } catch (e) { error = e; }
      try {
        const checks = {
          conflict: !!error && TemplatePack.isPackError(error) && error.packCode === 'conflict'
            && same(error.details.conflicts, [{ table: inv, problems: [{ kind: 'missing', column: 'Evenement' }] }]),
          nothingWritten: logFor(p).length === 0 && stub().countActions('AddTable') === 0,
          otherTable: stub().state.tables.indexOf(p + 'Evenements') === -1,
          existingKept: same(Object.keys(stub().state.columns[inv]), ['Nom', 'Telephone']),
          noRule: GristAPI.getLinkRule(p + 'Evenements') === null,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, error: error && error.message }) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_removes_what_it_created_when_a_table_name_was_taken_in_between',
    description: 'Un nom de table pris entre la lecture du document et la création (une autre fenêtre) : Grist renomme en silence (« …2 »), apply retire tout ce que le lot vient de créer, lève « renamed » et laisse la table de l’autre fenêtre',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const ev = p + 'Evenements';
      const realFetch = grist.docApi.fetchTable;
      let injected = false;
      grist.docApi.fetchTable = async function (tableId) {
        const out = await realFetch.apply(this, arguments);
        if (tableId === '_grist_Tables_column' && !injected) {
          injected = true;
          await stub().applyUserActions([['AddTable', ev, [{ id: 'Autre', type: 'Text' }]]]); // l'autre fenêtre crée la table juste après notre lecture
        }
        return out;
      };
      let error = null;
      try { await TemplatePack.apply(pack); } catch (e) { error = e; } finally { grist.docApi.fetchTable = realFetch; }
      try {
        const st = stub().state;
        const checks = {
          injected,
          renamed: !!error && TemplatePack.isPackError(error) && error.packCode === 'renamed' && same(error.details.wanted, [ev, p + 'Invites']) && error.details.given[0] === ev + '2',
          removed: st.tables.indexOf(ev + '2') === -1 && st.tables.indexOf(p + 'Invites') === -1 && !(ev + '2' in st.columns),
          otherWindowKept: st.tables.indexOf(ev) !== -1 && same(Object.keys(st.columns[ev]), ['Autre']),
          noRule: GristAPI.getLinkRule(ev) === null,
          pagesGone: stub().readPages().every(page => page.table !== ev + '2' && page.table !== p + 'Invites'),
          // Le point qui compte : les colonnes de calcul visent leur table par son nom ; aucune n'est partie vers la table de l'autre fenêtre.
          noCalculatedColumnSent: logFor(p).every(a => a[0] !== 'AddColumn'),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, error: error && error.message, given: error && error.details && error.details.given }) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_removes_what_it_created_when_the_calculated_columns_cannot_be_added',
    description: 'Le lot des colonnes de calcul qui échoue : les tables créées par le premier lot sont retirées, l’erreur remonte, aucune règle de liaison n’est écrite',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const real = grist.docApi.applyUserActions;
      grist.docApi.applyUserActions = function (actions) {
        if (actions.some(a => a[0] === 'AddColumn')) return Promise.reject(new Error('formule refusée (essai)'));
        return real.apply(this, arguments);
      };
      let error = null;
      try { await TemplatePack.apply(pack); } catch (e) { error = e; } finally { grist.docApi.applyUserActions = real; }
      try {
        const st = stub().state;
        const checks = {
          error: !!error && error.message === 'formule refusée (essai)',
          removed: st.tables.indexOf(p + 'Evenements') === -1 && st.tables.indexOf(p + 'Invites') === -1,
          noRule: GristAPI.getLinkRule(p + 'Evenements') === null,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_removes_what_it_created_when_the_displays_cannot_be_set',
    description: 'Le second appel (les « Colonnes à afficher ») qui échoue : les tables créées par le premier sont retirées, l’erreur remonte, aucune règle de liaison n’est écrite — le document ne garde pas de tables à moitié réglées',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const real = grist.docApi.applyUserActions;
      grist.docApi.applyUserActions = function (actions) {
        if (actions.some(a => a[0] === 'SetDisplayFormula')) return Promise.reject(new Error('refusé par Grist (essai)'));
        return real.apply(this, arguments);
      };
      let error = null;
      try { await TemplatePack.apply(pack); } catch (e) { error = e; } finally { grist.docApi.applyUserActions = real; }
      try {
        const st = stub().state;
        const checks = {
          error: !!error && error.message === 'refusé par Grist (essai)',
          removed: st.tables.indexOf(p + 'Evenements') === -1 && st.tables.indexOf(p + 'Invites') === -1,
          noRule: GristAPI.getLinkRule(p + 'Evenements') === null,
          created: logFor(p).filter(a => a[0] === 'AddTable').length === 2,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_apply_keeps_a_link_rule_that_already_exists_for_the_table',
    description: 'Une règle de liaison déjà posée pour la table liée (une seule par table, valable pour tout le document) : une règle différente reste telle quelle et est signalée (linksKept) ; la même règle ne fait rien',
    run: async () => {
      const p = nextPrefix();
      const pack = TemplatePack.normalize(rawPack(p), null);
      const ev = p + 'Evenements';
      try {
        await GristAPI.saveLinkRule(ev, { mode: 'singleton' });
        const different = await TemplatePack.apply(pack);
        const keptRule = GristAPI.getLinkRule(ev);
        await cleanPack(p);
        await GristAPI.saveLinkRule(ev, { mode: 'match', colonneCible: 'id', colonneSource: 'Evenement' });
        stub().clearActionLog();
        const identical = await TemplatePack.apply(pack);
        const checks = {
          differentKept: same(different.linksKept, [ev]) && same(different.linksSaved, []) && keptRule.mode === 'singleton',
          identicalQuiet: same(identical.linksKept, []) && same(identical.linksSaved, []) && stub().countActions('UpdateRecord', 'Publipostage_LiensTables') === 0,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
      } finally { await cleanPack(p); }
    },
  });

  cases.push({
    id: 'pack_page_settings_follow_the_packs_format_orientation_and_margins',
    description: 'marginsOf donne à loadTemplateIntoEditor le format, le sens et les marges du pack (en mm) ; une marge que le pack ne dit pas reste absente',
    run: async () => {
      const p = 'Zz';
      const withMargins = TemplatePack.normalize(rawPack(p), null);
      const raw = rawPack(p);
      delete raw.template.page.margins;
      raw.template.page.format = 'A4';
      raw.template.page.orientation = 'portrait';
      const withoutMargins = TemplatePack.normalize(raw, null);
      const checks = {
        withMargins: same(TemplatePack.marginsOf(withMargins), { top: 8, right: 8, bottom: 8, left: 8, orientation: 'landscape', format: 'A6' }),
        withoutMargins: same(TemplatePack.marginsOf(withoutMargins), { orientation: 'portrait', format: 'A4' }),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  // ---- la galerie ----

  const FIXTURE_ID = 'test-tables';
  const DEV_BASE = 'templates-gallery-dev/';
  function setSearch(search) {
    const before = window.location.search;
    history.replaceState(null, '', window.location.pathname + search + window.location.hash);
    return () => history.replaceState(null, '', window.location.pathname + before + window.location.hash);
  }
  // Une copie de l'entrée d'essai (templates-gallery-dev/test-tables) dans le manifeste de la fenêtre (le tableau gardé en cache par TemplateGallery), le temps d'un scénario.
  async function withFixtureEntry(overrides, work) {
    const restore = setSearch('');
    const list = await TemplateGallery.loadManifest();
    const entry = Object.assign({
      id: 'essai-' + (++seq), name: 'Essai — Modèle avec ses tables', tags: ['essai'], screenshot: 'test-tables/capture-1.png', html: 'test-tables/template.html', pack: 'test-tables/pack.json',
      shows: ['qr', 'condition', 'pageFormat'], preview: [{ src: 'test-tables/capture-1.png', w: 148, h: 105 }], __base: DEV_BASE,
    }, overrides || {});
    list.push(entry);
    try { return await work(entry); }
    finally {
      list.splice(list.indexOf(entry), 1);
      closeGallery();
      restore();
    }
  }
  const galleryOpen = () => document.getElementById('template-gallery-modal').style.display !== 'none';
  const previewOpen = () => document.getElementById('template-preview-modal').style.display !== 'none';
  function closeGallery() {
    const closePreview = document.getElementById('tpl-preview-close');
    if (previewOpen() && closePreview) closePreview.click();
    document.getElementById('template-gallery-modal').style.display = 'none';
    document.getElementById('template-preview-modal').style.display = 'none';
  }
  // Ouvre la galerie, clique la carte de ce nom et attend l'aperçu (nom posé, pack lu quand l'entrée en a un).
  async function openPreviewOf(entry) {
    document.getElementById('v2-btn-new-from-template').click();
    await waitFor(() => Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card-name')).some(n => n.textContent === entry.name), 5000);
    const card = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find(c => c.querySelector('.tpl-gallery-card-name').textContent === entry.name);
    if (!card) return null;
    card.click();
    await waitFor(() => previewOpen() && document.getElementById('tpl-preview-name').textContent === entry.name, 3000);
    // Le pack et le HTML arrivent après l'ouverture : le bouton « Créer avec ses tables » ou l'aperçu prêt disent que la lecture est finie.
    await waitFor(() => (!entry.pack || !document.getElementById('tpl-preview-use-pack').hidden) && (document.getElementById('tpl-preview-tiptap').innerHTML.length > 0 || !document.getElementById('tpl-preview-captures').hidden), 5000);
    return card;
  }
  const el = id => document.getElementById(id);
  const visible = id => !el(id).hidden && el(id).style.display !== 'none';

  cases.push({
    id: 'gallery_dev_test_tables_fixture_is_a_valid_pack_with_its_files',
    description: 'Le modèle d’essai « Test — Modèle avec ses tables » (templates-gallery-dev, visible avec ?dev) est un pack valide, son HTML ne nomme que ses tables, sa capture et sa vignette existent',
    run: async () => {
      const restore = setSearch('?dev');
      try {
        const entry = (await TemplateGallery.loadManifest()).find(e => e.id === FIXTURE_ID);
        if (!entry) return { pass: false, notes: 'l’entrée « ' + FIXTURE_ID + ' » manque au catalogue de dev' };
        const pack = await TemplateGallery.fetchPack(entry);
        const html = await TemplateGallery.fetchHtml(entry);
        const tables = pack.tables.map(t => t.id);
        const used = Array.from(new Set((html.match(/data-table="[^"]+"/g) || []).map(s => s.slice(12, -1))));
        const image = await fetch(TemplateGallery.resolveUrl(entry.preview[0].src, entry), { cache: 'no-store' });
        const shot = await fetch(TemplateGallery.resolveUrl(entry.screenshot, entry), { cache: 'no-store' });
        const checks = {
          pack: same(tables, ['TestEvenements', 'TestInvites']) && pack.main === 'TestInvites' && pack.template.page.format === 'A6' && pack.template.page.orientation === 'landscape',
          htmlTables: used.length > 0 && used.every(t => tables.indexOf(t) !== -1),
          capture: image.ok && /image\/png/.test(image.headers.get('content-type') || ''),
          thumbnail: shot.ok,
          shows: same(entry.shows, ['qr', 'condition', 'pageFormat']),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, used }) };
      } finally { restore(); }
    },
  });

  cases.push({
    id: 'gallery_pack_preview_shows_the_captures_the_tables_the_page_and_the_features_in_both_languages',
    description: 'L’aperçu d’un modèle à pack montre le document rempli en images (taille donnée par le catalogue), la ligne des tables et de la page, une pastille par fonction montrée (dans la langue de l’interface, y compris si elle change pendant l’aperçu) et le bouton « Créer avec ses tables » ; l’aperçu en lecture seule est caché',
    run: async (h) => {
      await h.resetEditor();
      const wasLang = I18n.getLang();
      I18n.setLang('fr');
      try {
        return await withFixtureEntry({}, async (entry) => {
          const card = await openPreviewOf(entry);
          if (!card) return { pass: false, notes: 'la carte du modèle n’est pas dans la grille' };
          const imgs = Array.from(document.querySelectorAll('#tpl-preview-captures img'));
          const fr = Array.from(document.querySelectorAll('#tpl-preview-shows .tpl-preview-chip')).map(c => c.textContent);
          const note = el('tpl-preview-note').textContent;
          const frButton = el('tpl-preview-use-pack').textContent;
          I18n.setLang('en');
          await sleep(60);
          const en = Array.from(document.querySelectorAll('#tpl-preview-shows .tpl-preview-chip')).map(c => c.textContent);
          const enButton = el('tpl-preview-use-pack').textContent;
          const enNote = el('tpl-preview-note').textContent;
          const checks = {
            cardCapture: card.querySelector(':scope > img').classList.contains('is-capture'),
            captures: imgs.length === 1 && /test-tables\/capture-1\.png$/.test(imgs[0].getAttribute('src')) && imgs[0].width > 0 && imgs[0].getAttribute('width') === '148' && imgs[0].getAttribute('height') === '105' && /Essai/.test(imgs[0].alt),
            capturesVisible: visible('tpl-preview-captures') && visible('tpl-preview-capture-note') && !visible('tpl-preview-sheet'),
            noteFr: /TestEvenements, TestInvites/.test(note) && /A6/.test(note) && /paysage/.test(note),
            chipsFr: same(fr, ['Code QR', 'Texte conditionnel', 'Format de page']),
            chipsEn: same(en, ['QR code', 'Conditional text', 'Page size']),
            buttons: frButton === 'Créer avec ses tables' && enButton === 'Create with its tables' && !visible('tpl-preview-use-data') && visible('tpl-preview-use-empty'),
            noteEn: /TestEvenements, TestInvites/.test(enNote) && /landscape/.test(enNote),
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, note, enNote, fr, en }) };
        });
      } finally { I18n.setLang(wasLang); }
    },
  });

  cases.push({
    id: 'gallery_pack_preview_falls_back_to_the_read_only_preview_when_a_capture_does_not_load',
    description: 'Une capture qui ne charge pas (fichier absent d’un déploiement) : l’aperçu rend la main à l’aperçu en lecture seule du modèle, sans image cassée ; un modèle sans captures ni pack garde son aperçu habituel et aucun bouton de tables',
    run: async (h) => {
      await h.resetEditor();
      const out = {};
      await withFixtureEntry({ preview: [{ src: 'test-tables/absente.png', w: 148, h: 105 }] }, async (entry) => {
        await openPreviewOf(entry);
        await waitFor(() => visible('tpl-preview-sheet'), 4000);
        out.fallback = { sheet: visible('tpl-preview-sheet'), captures: visible('tpl-preview-captures'), note: visible('tpl-preview-capture-note'), text: el('tpl-preview-tiptap').textContent.indexOf('TEST') !== -1 || el('tpl-preview-tiptap').innerHTML.length > 20 };
      });
      await withFixtureEntry({ pack: undefined, preview: undefined, shows: undefined, schema: 'test-tables/schema.py' }, async (entry) => {
        await openPreviewOf(entry);
        out.plain = { sheet: visible('tpl-preview-sheet'), captures: visible('tpl-preview-captures'), pack: visible('tpl-preview-use-pack'), data: visible('tpl-preview-use-data'), chips: visible('tpl-preview-shows'), note: visible('tpl-preview-note') };
      });
      const pass = out.fallback.sheet && !out.fallback.captures && !out.fallback.note && out.fallback.text
        && out.plain.sheet && !out.plain.captures && !out.plain.pack && out.plain.data && !out.plain.chips && !out.plain.note;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // Les réponses toutes faites des fenêtres de question, et ce qu'elles ont reçu.
  function packFlow(h, answers) {
    // Les fenêtres « Enregistrer / Abandonner / Annuler » (avant de quitter un modèle modifié : le choix a des boutons) reçoivent « Abandonner » ; celle qui dit un refus (aucun choix, un seul bouton « Fermer ») reçoit null.
    return h.stubDialogs(Object.assign({ confirm: async () => true, choose: async opts => (opts.choices && opts.choices.length ? 'discard' : null) }, answers || {}));
  }
  const newestModel = () => {
    const rows = stub().state.rows.Publipostage_Modeles;
    const i = rows.id.length - 1;
    return i < 0 ? null : stub().getRow('Publipostage_Modeles', rows.id[i]);
  };
  const FIXTURE_TABLES = ['TestEvenements', 'TestInvites'];
  async function cleanFixture() {
    await removeTables(FIXTURE_TABLES);
    try { await GristAPI.deleteLinkRule('TestEvenements'); } catch (e) { /* aucune règle */ }
  }

  cases.push({
    id: 'gallery_pack_use_asks_then_creates_the_empty_tables_the_template_and_its_page',
    description: '« Créer avec ses tables » : la question dit les tables (colonnes, calculs) et les règles de liaison ; après « Créer », les tables existent vides, la règle de liaison est posée, le modèle est enregistré avec sa page (A6 paysage, marges), son nom de PDF et le coin d’état dit ce qui a été créé ; la galerie se ferme',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      const dialogs = packFlow(h);
      const wasLang = I18n.getLang();
      I18n.setLang('fr');
      try {
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          el('tpl-preview-use-pack').click();
          const done = await waitFor(() => !previewOpen() && stub().state.rows.Publipostage_Modeles.id.length === modelsBefore + 1, 8000);
          await sleep(300);
          const asked = dialogs.asked.filter(a => a.kind === 'confirm');
          const message = asked[0] ? asked[0].message : '';
          const model = newestModel();
          const margins = model && model.Margins ? JSON.parse(model.Margins) : {};
          const st = stub().state;
          const rule = GristAPI.getLinkRule('TestEvenements');
          const status = el('status-msg').textContent;
          const checks = {
            done,
            asked: asked.length === 1 && /TestEvenements \(4 colonnes, dont 1 de calcul\)/.test(message) && /TestInvites \(4 colonnes\)/.test(message) && /règles de liaison/.test(message) && /2 tables vides/.test(message) && asked[0].title === 'Créer les tables du modèle ?',
            tables: FIXTURE_TABLES.every(t => st.tables.indexOf(t) !== -1) && rowCount('TestEvenements') === 0 && rowCount('TestInvites') === 0,
            rule: !!rule && rule.mode === 'match' && rule.colonneCible === 'id' && rule.colonneSource === 'Evenement',
            model: !!model && model.NomFichierPDF === 'Badge #TestInvites.Code' && /TestInvites/.test(model.Contenu) && margins.format === 'A6' && margins.orientation === 'landscape' && margins.top === 8 && margins.left === 8,
            status: /TestEvenements, TestInvites/.test(status) && /ses tables vides/.test(status),
            galleryClosed: !galleryOpen() && !previewOpen(),
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, message, status, margins }) };
        });
      } finally { dialogs.restore(); I18n.setLang(wasLang); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_pack_cancel_at_the_question_creates_neither_tables_nor_template',
    description: '« Annuler » à la question de « Créer avec ses tables » : aucune table, aucune règle, aucun modèle ; l’aperçu reste ouvert',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      const dialogs = packFlow(h, { confirm: async () => false });
      try {
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          el('tpl-preview-use-pack').click();
          await waitFor(() => dialogs.asked.some(a => a.kind === 'confirm'), 3000);
          await sleep(500);
          const checks = {
            asked: dialogs.asked.filter(a => a.kind === 'confirm').length === 1,
            noTable: stub().countActions('AddTable') === 0 && FIXTURE_TABLES.every(t => stub().state.tables.indexOf(t) === -1),
            noRule: GristAPI.getLinkRule('TestEvenements') === null,
            noModel: stub().state.rows.Publipostage_Modeles.id.length === modelsBefore,
            stillThere: previewOpen(),
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
        });
      } finally { dialogs.restore(); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_pack_conflicting_table_is_told_and_nothing_is_created',
    description: 'Une table du document porte déjà le nom d’une table du modèle avec d’autres colonnes : la fenêtre le dit (la table, les colonnes qui manquent, quoi faire), la question de création n’est pas posée, rien n’est créé ni modifié',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      stub().setVariables('TestInvites', { Nom: 'Text' });
      const dialogs = packFlow(h);
      const wasLang = I18n.getLang();
      I18n.setLang('fr');
      try {
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          el('tpl-preview-use-pack').click();
          await waitFor(() => dialogs.asked.some(a => a.kind === 'choose' && !(a.choices && a.choices.length)), 4000);
          await sleep(300);
          const told = dialogs.asked.find(a => a.kind === 'choose' && !(a.choices && a.choices.length));
          const message = told ? told.message : '';
          const checks = {
            told: !!told && told.title === 'Ce modèle ne peut pas être créé ici' && /TestInvites/.test(message) && /Code, Categorie, Evenement/.test(message) && /Rien n’a été créé ni modifié/.test(message) && /Renomme ou complète/.test(message),
            noQuestion: dialogs.asked.every(a => a.kind !== 'confirm'),
            nothing: stub().countActions('AddTable') === 0 && stub().state.tables.indexOf('TestEvenements') === -1 && same(Object.keys(stub().state.columns.TestInvites), ['Nom']),
            noModel: stub().state.rows.Publipostage_Modeles.id.length === modelsBefore,
            stillThere: previewOpen(),
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, message }) };
        });
      } finally { dialogs.restore(); I18n.setLang(wasLang); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_pack_with_all_its_tables_already_there_creates_only_the_template_without_asking',
    description: 'Toutes les tables du modèle sont déjà dans le document, telles que le modèle les veut : aucune question, aucune table touchée ; le modèle et la règle de liaison sont posés et le coin d’état dit que les tables du document sont utilisées',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      const dialogs = packFlow(h);
      const wasLang = I18n.getLang();
      I18n.setLang('fr');
      try {
        // Les tables comme le modèle les veut, posées par un premier « Créer avec ses tables » puis laissées dans le document.
        const pack = await TemplateGallery.fetchPack({ pack: 'test-tables/pack.json', __base: DEV_BASE });
        await TemplatePack.apply(pack);
        await GristAPI.deleteLinkRule('TestEvenements');
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          el('tpl-preview-use-pack').click();
          const done = await waitFor(() => !previewOpen() && stub().state.rows.Publipostage_Modeles.id.length === modelsBefore + 1, 8000);
          await sleep(300);
          const status = el('status-msg').textContent;
          const checks = {
            done,
            noQuestion: dialogs.asked.every(a => a.kind !== 'confirm'),
            noTable: stub().countActions('AddTable') === 0,
            rule: !!GristAPI.getLinkRule('TestEvenements'),
            status: /avec les tables du document/.test(status) && /TestEvenements, TestInvites/.test(status),
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, status }) };
        });
      } finally { dialogs.restore(); I18n.setLang(wasLang); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_pack_double_click_creates_the_tables_and_the_template_once',
    description: 'Deux clics sur « Créer avec ses tables » (Grist met du temps à répondre) : une seule question, un seul lot de tables, un seul modèle',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      const dialogs = packFlow(h, { confirm: async () => { await sleep(250); return true; } });
      try {
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          const button = el('tpl-preview-use-pack');
          button.click();
          await sleep(60);
          button.click();
          await waitFor(() => !previewOpen() && stub().state.rows.Publipostage_Modeles.id.length >= modelsBefore + 1, 8000);
          await sleep(800);
          const checks = {
            oneQuestion: dialogs.asked.filter(a => a.kind === 'confirm').length === 1,
            oneBatch: stub().getActionLog().filter(a => a[0] === 'AddTable' && a[1] === 'TestEvenements').length === 1,
            oneModel: stub().state.rows.Publipostage_Modeles.id.length === modelsBefore + 1,
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
        });
      } finally { dialogs.restore(); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_pack_use_without_tables_keeps_the_page_but_no_variables_and_no_file_names',
    description: '« Utiliser ce modèle » sur un modèle à pack : le texte seul, sans les variables ni les tables, mais avec la page du modèle (A6 paysage) ; ni nom de fichier PDF ni champ d’e-mail qui parleraient de variables absentes',
    run: async (h) => {
      await h.resetEditor();
      await cleanFixture();
      const dialogs = packFlow(h);
      try {
        return await withFixtureEntry({}, async (entry) => {
          const modelsBefore = stub().state.rows.Publipostage_Modeles.id.length;
          stub().clearActionLog();
          await openPreviewOf(entry);
          el('tpl-preview-use-empty').click();
          const done = await waitFor(() => !previewOpen() && stub().state.rows.Publipostage_Modeles.id.length === modelsBefore + 1, 8000);
          await sleep(300);
          const model = newestModel();
          const margins = model && model.Margins ? JSON.parse(model.Margins) : {};
          const checks = {
            done,
            noTable: stub().countActions('AddTable') === 0 && FIXTURE_TABLES.every(t => stub().state.tables.indexOf(t) === -1),
            noQuestion: dialogs.asked.every(a => a.kind !== 'confirm'),
            textOnly: !!model && model.Contenu.indexOf('var-badge') === -1 && /VIP/.test(model.Contenu),
            page: margins.format === 'A6' && margins.orientation === 'landscape',
            noFileName: !!model && !model.NomFichierPDF,
          };
          return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, margins }) };
        });
      } finally { dialogs.restore(); await cleanFixture(); await h.resetEditor(); }
    },
  });

  cases.push({
    id: 'gallery_every_feature_a_template_shows_has_a_label_in_both_languages',
    description: 'Chaque clé de `shows` des catalogues (templates-gallery et ?dev) a son libellé en français et en anglais, sans doublon dans une entrée',
    run: async () => {
      const restore = setSearch('?dev');
      const wasLang = I18n.getLang();
      const problems = [];
      try {
        const entries = await TemplateGallery.loadManifest();
        const keys = new Set();
        entries.forEach(entry => {
          const shows = entry.shows || [];
          if (!Array.isArray(shows)) { problems.push(entry.id + ' : shows n’est pas une liste'); return; }
          if (new Set(shows).size !== shows.length) problems.push(entry.id + ' : une fonction est nommée deux fois');
          shows.forEach(key => keys.add(key));
        });
        ['fr', 'en'].forEach(lang => {
          I18n.setLang(lang);
          keys.forEach(key => { if (I18n.t('gallery.shows.' + key) === 'gallery.shows.' + key) problems.push('« ' + key + ' » sans libellé en ' + lang); });
        });
        return { pass: problems.length === 0 && keys.size >= 3, notes: problems.length ? problems.join(' | ') : keys.size + ' fonctions, toutes libellées' };
      } finally { I18n.setLang(wasLang); restore(); }
    },
  });

  // Ce que les fichiers d'un pack disent, recoupé : les variables du texte visent des tables et des colonnes du pack, les formules ne nomment que des tables et des colonnes du pack.
  // (Un pack sans cette fermeture se paie en cellules d'erreur dans Grist : les formules d'une table inconnue échouent en silence, essai du 09/10.)
  function closureProblems(entry, pack, html) {
    const problems = [];
    const tableById = {};
    pack.tables.forEach(table => { tableById[table.id] = table; });
    const hasColumn = (table, id) => id === 'id' || table.columns.some(column => column.id === id);
    const root = document.createElement('template');
    root.innerHTML = html;
    root.content.querySelectorAll('[data-table][data-column], [data-var-table][data-var-column]').forEach(node => {
      const tableId = node.getAttribute('data-table') || node.getAttribute('data-var-table');
      const columnId = node.getAttribute('data-column') || node.getAttribute('data-var-column');
      const table = tableById[tableId];
      if (!table) problems.push(entry.id + ' : le texte nomme la table « ' + tableId + ' », absente du pack');
      else if (!hasColumn(table, columnId)) problems.push(entry.id + ' : le texte nomme « ' + tableId + '.' + columnId + ' », absente du pack');
    });
    pack.tables.forEach(table => table.columns.forEach(column => {
      if (!column.formula) return;
      const where = entry.id + ' : ' + table.id + '.' + column.id;
      (column.formula.match(/\b[A-Z][A-Za-z0-9_]*(?=\.(?:lookupRecords|lookupOne|all)\b)/g) || []).forEach(name => { if (!tableById[name]) problems.push(where + ' nomme la table « ' + name + ' », absente du pack'); });
      (column.formula.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) || []).forEach(ref => { const id = ref.slice(1); if (!hasColumn(table, id)) problems.push(where + ' lit « ' + ref + ' », colonne absente de la table'); });
      (column.formula.match(/\b[A-Z][A-Za-z0-9_]*\.lookup(?:Records|One)\(([^)]*)\)/g) || []).forEach(call => {
        const target = tableById[call.slice(0, call.indexOf('.'))];
        if (!target) return;
        (call.match(/\b[A-Za-z_][A-Za-z0-9_]*(?==)/g) || []).forEach(id => { if (!hasColumn(target, id)) problems.push(where + ' cherche dans « ' + target.id + ' » la colonne « ' + id + ' », absente'); });
      });
    }));
    return problems;
  }

  cases.push({
    id: 'gallery_every_pack_in_the_catalogues_is_valid_closed_and_has_its_images',
    description: 'Chaque modèle à pack des catalogues (templates-gallery et ?dev) : pack valide, variables du texte et formules qui ne nomment que ses tables et ses colonnes, vignette et captures présentes avec leur taille, fonctions montrées libellées',
    run: async () => {
      const restore = setSearch('?dev');
      const problems = [];
      let count = 0;
      try {
        const entries = (await TemplateGallery.loadManifest()).filter(entry => entry.pack);
        for (const entry of entries) {
          count++;
          try {
            const [pack, html] = await Promise.all([TemplateGallery.fetchPack(entry), TemplateGallery.fetchHtml(entry)]);
            closureProblems(entry, pack, html).forEach(p => problems.push(p));
            const pages = entry.preview || [];
            if (!Array.isArray(pages)) problems.push(entry.id + ' : preview n’est pas une liste');
            for (const shot of Array.isArray(pages) ? pages : []) {
              if (!(shot.w > 0 && shot.h > 0)) problems.push(entry.id + ' : une capture sans taille (w, h)');
              const res = await fetch(TemplateGallery.resolveUrl(shot.src, entry), { cache: 'no-store' });
              if (!res.ok) problems.push(entry.id + ' : capture absente ' + shot.src);
            }
            const thumb = await fetch(TemplateGallery.resolveUrl(entry.screenshot, entry), { cache: 'no-store' });
            if (!thumb.ok) problems.push(entry.id + ' : vignette absente ' + entry.screenshot);
          } catch (e) { problems.push(entry.id + ' : ' + e.message); }
        }
        return { pass: problems.length === 0 && count >= 1, notes: problems.length ? problems.join(' | ') : count + ' modèle(s) à pack vérifiés' };
      } finally { restore(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templatePack = cases;
})();
