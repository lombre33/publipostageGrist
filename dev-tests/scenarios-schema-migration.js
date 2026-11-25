// Suite "schemaMigration" - le widget ouvre un document D'AVANT (les tables et les colonnes du widget sous leurs noms français, avec les libellés que l'ancien code leur donnait) et le renomme PAR LA FENÊTRE COMMUNE
// de mise à jour des noms du kit (consigne 104 de GFS : js/names-update.js ; js/schema-columns.js, migrate ; colonnes et tables en anglais, lot 5). La page est posée par dev-tests/run-headless.mjs (SCHEMA_MODES :
// `window.__schemaNames = 'migrate'`, et SCHEMA_PRESEED : deux modèles, un commentaire, une règle de liaison et les libellés d'avant, semés dans le faux Grist avant que le widget ne lise quoi que ce soit). La fenêtre
// bloque le démarrage jusqu'au clic : le lanceur clique pour la personne (NAMES_WINDOW_GROUPS : « Mettre à jour », puis « Continuer ») et garde ce qu'elle a montré (`window.__namesWindow.shown`) ; `GET /webhooks`
// répond « propriétaire ». Le faux Grist (dev-tests/grist-stub.js) rejoue ce que le vrai Grist fait de RenameTable, RenameColumn et ModifyColumn (mesuré dans grist-static 0.1.6 le 18/11 : un lot est rejoué en
// entier ou pas du tout, le libellé ne suit pas le renommage, un nom de table pris est numéroté) ; le traducteur lui-même, avec tous ses cas limites, est dans dev-tests/unit-schema-columns.mjs, la fenêtre à la
// vraie souris (dans GFS et hors GFS, pas propriétaire, table de Sync+, anglais) dans dev-tests/verify-names-update.mjs.
(function () {
  const stub = () => window.__gristStub;
  const cases = [];

  const LEGACY_TABLES = ['Publipostage_Modeles', 'Publipostage_Commentaires', 'Publipostage_LiensTables', 'Publipostage_PreferencesModeles', 'Publipostage_Abreviations', 'Publipostage_FormatsPage'];
  const LEGACY_COLUMNS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cci', 'Objet', 'PJ', 'SuiviModifications', 'Jeton', 'ModifiePar', 'MotDePassePdf', 'EmailLie',
    'ModeleId', 'Auteur', 'Texte', 'CreeLe', 'TableCible', 'ColonneCible', 'ColonneSource'];
  const widgetTables = () => stub().state.tables.filter(t => /^Publipostage_/.test(t));
  const columnsOf = table => Object.keys((stub().state.rows[table]) || {}).filter(k => k !== 'id');
  const rowsOf = table => {
    const t = stub().state.rows[table];
    if (!t) return [];
    return t.id.map((id, i) => { const row = { id }; Object.keys(t).forEach(k => { if (k !== 'id') row[k] = t[k][i]; }); return row; });
  };
  function legacyNamesIn() {
    const found = [];
    widgetTables().forEach(table => {
      if (LEGACY_TABLES.indexOf(table) !== -1) found.push(table);
      columnsOf(table).forEach(column => { if (LEGACY_COLUMNS.indexOf(column) !== -1) found.push(table + '.' + column); });
    });
    return found;
  }
  // Ce que Grist montre comme en-tête d'une colonne du widget : son libellé (les métadonnées _grist_Tables_column), à comparer à son identifiant.
  function labelsDifferingFromIds() {
    const meta = stub().state.rows._grist_Tables_column;
    const tables = stub().state.rows._grist_Tables;
    const found = [];
    meta.id.forEach((_, i) => {
      const table = tables.tableId[tables.id.indexOf(meta.parentId[i])];
      if (/^Publipostage_/.test(table) && meta.label[i] !== meta.colId[i]) found.push(table + '.' + meta.colId[i] + ' = ' + meta.label[i]);
    });
    return found;
  }
  const json = JSON.stringify;
  const result = problems => ({ pass: problems.length === 0, notes: json(problems) });

  cases.push({
    id: 'schemamigration_the_window_opens_once_before_any_read_and_the_person_validates_it',
    description: 'La fenêtre commune du kit s\'ouvre une fois : elle nomme l\'app et dit que les données ne changent pas, la personne clique « Mettre à jour » puis « Continuer », et le widget n\'a lu aucune table du widget sous son nom d\'avant',
    run: async () => {
      const problems = [];
      const shown = (window.__namesWindow && window.__namesWindow.shown) || [];
      if (shown.length !== 2) problems.push('étapes montrées : ' + shown.length + ' ' + json(shown));
      const first = shown[0], second = shown[1];
      if (!first || first.button !== 'Mettre à jour' || first.text.indexOf('Publipostage+ range désormais ses données sous des noms anglais') === -1 || first.text.indexOf('Vos données ne changent pas') === -1 || !/3 tables/.test(first.text)) problems.push('première étape : ' + json(first));
      if (!second || second.button !== 'Continuer' || !/Terminé : 3 tables mises à jour/.test(second.text)) problems.push('seconde étape : ' + json(second));
      const order = stub().state.callOrder;
      const oldRead = order.filter(call => /^fetchTable Publipostage_(Modeles|Commentaires|LiensTables|PreferencesModeles|Abreviations|FormatsPage)$/.test(call));
      if (oldRead.length) problems.push('lectures sous un nom d\'avant : ' + oldRead.join());
      const proofs = stub().state.tokenCalls.filter(call => !call.readOnly).length;
      if (proofs !== 1) problems.push('jetons capables d\'écrire demandés : ' + proofs + ' (un seul : la preuve de propriété)');
      if (document.getElementById('nu-modal')) problems.push('la fenêtre est encore là');
      return result(problems);
    },
  });

  cases.push({
    id: 'schemamigration_the_first_reading_renames_the_widget_tables_and_columns_once',
    description: 'Le document d\'avant est repris à la première lecture : un RenameTable par table du widget, des RenameColumn, plus aucun nom d\'avant, et la reprise le dit',
    run: async () => {
      const problems = [];
      const log = stub().getActionLog();
      const tableRenames = log.filter(a => a[0] === 'RenameTable').map(a => a[1] + ' > ' + a[2]);
      ['Publipostage_Modeles > Publipostage_Templates', 'Publipostage_LiensTables > Publipostage_TableLinks', 'Publipostage_Commentaires > Publipostage_Comments'].forEach(rename => {
        if (tableRenames.indexOf(rename) === -1) problems.push('renommage manquant : ' + rename);
      });
      if (tableRenames.length !== 3) problems.push('RenameTable : ' + tableRenames.length + ' au lieu de 3 : ' + json(tableRenames));
      const legacy = legacyNamesIn();
      if (legacy.length) problems.push('noms d\'avant restés : ' + legacy.join());
      const done = SchemaColumns.lastMigration();
      if (!done || done.failed || done.tables !== 3 || done.columns < 10) problems.push('lastMigration : ' + json(done));
      if (stub().state.tables.indexOf('Publipostage_Templates') === -1) problems.push('Publipostage_Templates absente');
      return result(problems);
    },
  });

  cases.push({
    id: 'schemamigration_every_column_label_is_its_identifier_after_the_rename',
    description: 'Le libellé ne suit pas le renommage dans Grist : la reprise le pose, et plus aucune colonne du widget ne montre « Marges de page », « Dernière modification » ou un nom d\'avant',
    run: async () => {
      const differing = labelsDifferingFromIds();
      return result(differing.length ? ['libellé différent de l\'identifiant : ' + differing.join(' ; ')] : []);
    },
  });

  cases.push({
    id: 'schemamigration_the_templates_and_their_row_numbers_survive',
    description: 'Les deux modèles semés sont lus par le widget après la reprise : mêmes numéros de ligne, même nom, même contenu, même jeton',
    run: async () => {
      const problems = [];
      const rows = rowsOf('Publipostage_Templates');
      const byId = id => rows.find(r => r.id === id);
      if (rows.length < 2) problems.push('lignes : ' + rows.length);
      if (!byId(1) || byId(1).Name !== 'Facture' || byId(1).Content !== '<p>Bonjour {{Nom}}</p>' || byId(1).Token !== 'tok-facture') problems.push('ligne 1 : ' + json(byId(1)));
      if (!byId(2) || byId(2).Name !== 'Devis' || byId(2).Token !== 'tok-devis') problems.push('ligne 2 : ' + json(byId(2)));
      const loaded = await Templates.loadAll();
      const names = loaded.map(t => t.nom).sort();
      if (names.indexOf('Facture') === -1 || names.indexOf('Devis') === -1) problems.push('loadAll : ' + json(names));
      return result(problems);
    },
  });

  cases.push({
    id: 'schemamigration_the_other_tables_keep_their_rows',
    description: 'Le commentaire et la règle de liaison semés sont dans les tables renommées, colonnes anglaises, avec leurs valeurs',
    run: async () => {
      const problems = [];
      const comment = rowsOf('Publipostage_Comments')[0];
      if (!comment || comment.TemplateId !== 1 || comment.Text !== 'à relire' || comment.Author !== 'Alice') problems.push('commentaire : ' + json(comment));
      const link = rowsOf('Publipostage_TableLinks')[0];
      if (!link || link.TargetTable !== 'Factures' || link.TargetColumn !== 'Client' || link.SourceColumn !== 'Nom') problems.push('règle de liaison : ' + json(link));
      return result(problems);
    },
  });

  cases.push({
    id: 'schemamigration_saving_after_the_rename_writes_english_names_and_recreates_nothing',
    description: 'Enregistrer un modèle neuf écrit dans Publipostage_Templates sous les colonnes anglaises ; aucune table ni colonne d\'avant ne renaît',
    run: async () => {
      const problems = [];
      await Templates.save(null, 'Contrat', '<p>Contrat</p>', '', null, PageLayout.getMarginsMm(), 'document', null);
      const saved = rowsOf('Publipostage_Templates').find(r => r.Name === 'Contrat');
      if (!saved || saved.Content !== '<p>Contrat</p>') problems.push('modèle enregistré : ' + json(saved));
      const legacy = legacyNamesIn();
      if (legacy.length) problems.push('noms d\'avant revenus : ' + legacy.join());
      const differing = labelsDifferingFromIds();
      if (differing.length) problems.push('libellés : ' + differing.join(' ; '));
      return result(problems);
    },
  });

  cases.push({
    id: 'schemamigration_reading_again_renames_nothing',
    description: 'Un widget qui relit le document déjà repris (nouvelle fenêtre, nouvel onglet) ne renomme plus rien : aucune action de plus',
    run: async () => {
      const before = stub().getActionLog().filter(a => a[0] === 'RenameTable' || a[0] === 'RenameColumn' || a[0] === 'ModifyColumn').length;
      SchemaColumns.reset();
      await SchemaColumns.docApi.listTables();
      await SchemaColumns.docApi.fetchTable('Publipostage_Templates');
      const after = stub().getActionLog().filter(a => a[0] === 'RenameTable' || a[0] === 'RenameColumn' || a[0] === 'ModifyColumn').length;
      const problems = [];
      if (after !== before) problems.push('actions de renommage : ' + before + ' puis ' + after);
      if (SchemaColumns.lastMigration() !== null) problems.push('lastMigration : ' + json(SchemaColumns.lastMigration()));
      const windows = (window.__namesWindow && window.__namesWindow.shown.length) || 0;
      if (windows !== 2) problems.push('la fenêtre s\'est rouverte : ' + windows + ' étapes montrées au lieu de 2');
      return result(problems);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.schemaMigration = cases;
})();
