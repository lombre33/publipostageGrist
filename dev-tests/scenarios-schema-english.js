// Suite "schemaEnglish" - le widget sur un document dont les tables et les colonnes du widget portent les NOMS ANGLAIS (colonnes et tables en anglais, lot 3 sur 5 ; demande d'Antoine du 16/11 :
// « mettre toutes les colonnes en anglais, un ID et un nom de colonne identiques »). La page est posée par dev-tests/run-headless.mjs (ENGLISH_DISK_GROUPS) : le faux Grist (dev-tests/grist-stub.js,
// `window.__schemaNames = 'english'`) porte d'avance Publipostage_Templates, _TableLinks et _Comments aux colonnes anglaises, et l'interrupteur englishOnDisk de js/schema-columns.js est
// allumé : les tables et les colonnes que le widget crée ensuite naissent elles aussi sous leurs noms anglais, sans libellé (l'identifiant fait le libellé).
//
// Chaque scénario fait écrire un module du widget (les modèles, les commentaires, les préférences de rangement, les abréviations, les formats de page, les règles de liaison, les versions) par ses
// VRAIES fonctions, puis lit le faux Grist en direct : une ligne là où le module l'a rangée, sous les colonnes anglaises, et aucun nom d'avant nulle part (ni table Publipostage_Modeles, ni colonne
// Nom, Contenu, Jeton...). Le dernier scénario passe tout le document en revue. La même passe sur un document d'avant (noms français) est celle de tous les autres groupes, dont le faux Grist garde
// les anciens noms par défaut ; le traducteur lui-même (tous les mélanges de noms) est dans dev-tests/unit-schema-columns.mjs.
(function () {
  const stub = () => window.__gristStub;
  const cases = [];

  // Les noms d'avant des tables du widget et de leurs colonnes : rien de cela ne doit apparaître dans un document en anglais.
  const LEGACY_TABLES = ['Publipostage_Modeles', 'Publipostage_Commentaires', 'Publipostage_LiensTables', 'Publipostage_PreferencesModeles', 'Publipostage_Abreviations', 'Publipostage_FormatsPage'];
  const LEGACY_COLUMNS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cci', 'Objet', 'PJ', 'SuiviModifications', 'Jeton', 'ModifiePar', 'MotDePassePdf', 'EmailLie',
    'ModeleId', 'Auteur', 'Texte', 'CreeLe', 'LectureId', 'Debut', 'Fin', 'Citation', 'Avant', 'Apres', 'Resolu', 'Genre', 'Donnees', 'Utilisateur', 'Epingle', 'Dossier', 'Replie', 'TypeExport', 'QualitePdf',
    'LignesExport', 'Abreviation', 'Largeur', 'Hauteur', 'TableCible', 'ColonneCible', 'ColonneSource', 'TableSource'];

  const widgetTables = () => stub().state.tables.filter(t => /^Publipostage_/.test(t));
  const columnsOf = table => Object.keys((stub().state.rows[table]) || {}).filter(k => k !== 'id');
  const rowsOf = table => {
    const t = stub().state.rows[table];
    if (!t) return [];
    return t.id.map((id, i) => { const row = { id }; Object.keys(t).forEach(k => { if (k !== 'id') row[k] = t[k][i]; }); return row; });
  };
  // Les noms d'avant qui traînent dans le document : tables et colonnes des tables du widget.
  function legacyNamesIn() {
    const found = [];
    widgetTables().forEach(table => {
      if (LEGACY_TABLES.indexOf(table) !== -1) found.push(table);
      columnsOf(table).forEach(column => { if (LEGACY_COLUMNS.indexOf(column) !== -1) found.push(table + '.' + column); });
    });
    return found;
  };
  // Un libellé posé par le widget sur une colonne de ses tables : il n'en pose plus (l'identifiant fait le libellé).
  function labelsSet() {
    const labels = stub().state.labels || {};
    const found = [];
    widgetTables().forEach(table => Object.keys(labels[table] || {}).forEach(column => { if (labels[table][column] !== column) found.push(table + '.' + column + ' = ' + labels[table][column]); }));
    return found;
  }
  const json = JSON.stringify;
  const has = (list, names) => names.every(n => list.indexOf(n) !== -1);
  const result = problems => ({ pass: problems.length === 0, notes: json(problems) });

  async function savedTemplate(h, name, html) {
    await h.resetEditor();
    Templates.setCurrentId && Templates.setCurrentId(null);
    const saved = await Templates.save(null, name, html || '<p>Bonjour</p>', '', null, PageLayout.getMarginsMm(), 'document', null);
    await Templates.loadAll();
    return saved;
  }

  cases.push({
    id: 'schemaenglish_the_page_starts_on_a_document_with_english_names_and_the_switch_on',
    description: 'Le document de la page porte Publipostage_Templates, _TableLinks et _Comments aux colonnes anglaises, SchemaColumns les reconnaît sous ces noms, et son interrupteur est allumé',
    run: async () => {
      const problems = [];
      const names = stub().names;
      if (names.models !== 'Publipostage_Templates') problems.push('le faux Grist n\'est pas en anglais : ' + names.models);
      if (!has(widgetTables(), ['Publipostage_Templates', 'Publipostage_TableLinks', 'Publipostage_Comments'])) problems.push('tables : ' + widgetTables().join());
      if (SchemaColumns.actualTable('Publipostage_Templates') !== 'Publipostage_Templates') problems.push('actualTable : ' + SchemaColumns.actualTable('Publipostage_Templates'));
      const listed = await SchemaColumns.docApi.listTables();
      if (!has(listed, ['Publipostage_Templates', 'Publipostage_Comments', 'Publipostage_TableLinks'])) problems.push('listTables : ' + listed.join());
      // Une table que rien ne porte encore naît sous son nom anglais : la liste des tables du document le dit après la première écriture (scénarios suivants).
      const where = SchemaColumns.whereIs('Publipostage_Templates', 'PdfPassword');
      if (where.table !== 'Publipostage_Templates' || where.column !== 'PdfPassword' || where.label !== 'PdfPassword') problems.push('whereIs : ' + json(where));
      const location = Templates.PDF_PASSWORD_LOCATION;
      if (location.table !== 'Publipostage_Templates' || location.column !== 'PdfPassword' || location.label !== 'PdfPassword') problems.push('PDF_PASSWORD_LOCATION : ' + json(location));
      return result(problems);
    },
  });

  cases.push({
    id: 'schemaenglish_a_saved_template_is_written_and_read_under_english_names_with_its_token',
    description: 'Enregistrer un modèle écrit une ligne de Publipostage_Templates (Name, Content, ModifiedAt, Margins...), une nouvelle colonne (Token, PdfPassword, TrackedChanges...) naît sous son nom anglais, et le modèle se relit',
    run: async (h) => {
      const problems = [];
      const saved = await savedTemplate(h, 'Facture anglaise', '<p>Total : 42</p>');
      const token = await Templates.ensureToken(saved.id);
      await Templates.loadAll();
      await Templates.ensureLoaded([saved.id]); // en lecture légère, le texte d'un modèle se lit à la demande
      const row = rowsOf('Publipostage_Templates').find(r => r.id === saved.id);
      if (!row) problems.push('la ligne du modèle est introuvable');
      else {
        if (row.Name !== 'Facture anglaise') problems.push('Name : ' + row.Name);
        if (!/Total : 42/.test(row.Content || '')) problems.push('Content : ' + row.Content);
        if (!row.ModifiedAt) problems.push('ModifiedAt vide');
        if (row.Token !== token) problems.push('colonne du jeton : ' + row.Token + ' au lieu de ' + token);
      }
      const cached = Templates.getCached().find(t => t.id === saved.id);
      if (!cached || cached.nom !== 'Facture anglaise' || !/Total : 42/.test(cached.contenu || '')) problems.push('le modèle ne se relit pas : ' + json(cached && { nom: cached.nom }));
      if (!has(columnsOf('Publipostage_Templates'), ['Name', 'Content', 'Token'])) problems.push('colonnes : ' + columnsOf('Publipostage_Templates').join());
      return result(problems);
    },
  });

  cases.push({
    id: 'schemaenglish_comments_preferences_expansion_formats_links_and_versions_each_write_their_own_english_table',
    description: 'Un commentaire, un épinglage, un dossier replié, un réglage d\'export, une abréviation, un format de page, une règle de liaison et une version : chaque module écrit sa table sous des noms anglais, créée au besoin, colonnes ajoutées comprises',
    run: async (h) => {
      const problems = [];
      const saved = await savedTemplate(h, 'Modèle tous modules', '<p>Texte</p>');
      stub().clearActionLog();

      // Les commentaires : un fil importé que le modèle adopte (la table est déjà là, en anglais).
      Comments.stageImported([{ id: 'c-en-1', messages: [{ auteur: 'Alice', texte: 'Bonjour', creeLe: '2026-01-01T10:00:00Z' }] }]);
      await Comments.adoptStaged(saved.id);
      const comment = rowsOf('Publipostage_Comments').find(r => r.CommentId === 'c-en-1');
      if (!comment || comment.TemplateId !== saved.id || comment.Author !== 'Alice' || comment.Text !== 'Bonjour' || !comment.CreatedAt) problems.push('commentaire : ' + json(comment));

      // Les préférences de rangement : la table naît en anglais, puis ses colonnes ajoutées après coup (Collapsed, ExportType...).
      TemplatePreferences.reset && TemplatePreferences.reset();
      await TemplatePreferences.loadForCurrentUser();
      await TemplatePreferences.setPinned(saved.id, true);
      await TemplatePreferences.setFolder(saved.id, 'Factures/2026');
      await TemplatePreferences.setFolderCollapsed('Factures/2026', true);
      await TemplatePreferences.setExportChoices(saved.id, { type: 'pdf', quality: 'high', lines: 'all' });
      const prefs = rowsOf('Publipostage_TemplatePreferences');
      const mine = prefs.find(r => r.TemplateId === saved.id);
      const folder = prefs.find(r => r.TemplateId === 0);
      if (!mine || mine.Pinned !== true || mine.Folder !== 'Factures/2026') problems.push('préférences du modèle : ' + json(mine));
      if (!folder || folder.Collapsed !== true) problems.push('état du dossier : ' + json(folder));
      if (!has(columnsOf('Publipostage_TemplatePreferences'), ['User', 'TemplateId', 'Pinned', 'Folder', 'Collapsed', 'ExportType', 'PdfQuality', 'ExportLines'])) problems.push('colonnes des préférences : ' + columnsOf('Publipostage_TemplatePreferences').join());
      if (mine && (mine.ExportType !== 'pdf' || mine.PdfQuality !== 'high' || mine.ExportLines !== 'all')) problems.push('réglages d\'export : ' + json(mine));

      // Les abréviations, les formats de page.
      TextExpansion.reset();
      await TextExpansion.add('bj', 'bonjour à tous');
      const abbreviation = rowsOf('Publipostage_Abbreviations').find(r => r.Abbreviation === 'bj');
      if (!abbreviation || abbreviation.Text !== 'bonjour à tous' || abbreviation.User === undefined) problems.push('abréviation : ' + json(abbreviation));
      SavedPageFormats.reset();
      await SavedPageFormats.add('Carte anglaise', 85, 55);
      const format = rowsOf('Publipostage_PageFormats').find(r => r.Name === 'Carte anglaise');
      if (!format || format.Width !== 85 || format.Height !== 55) problems.push('format de page : ' + json(format));

      // Tout se relit : ce que les modules ont écrit sous des noms anglais, ils le lisent sous ces mêmes noms (document relu à neuf).
      TemplatePreferences.reset && TemplatePreferences.reset();
      await TemplatePreferences.loadForCurrentUser();
      if (!TemplatePreferences.isPinned(saved.id) || TemplatePreferences.getFolder(saved.id) !== 'Factures/2026') problems.push('préférences relues : ' + json({ pinned: TemplatePreferences.isPinned(saved.id), folder: TemplatePreferences.getFolder(saved.id) }));
      if (!TemplatePreferences.isFolderCollapsed('Factures/2026')) problems.push('dossier replié relu : faux');
      const choices = TemplatePreferences.getExportChoices(saved.id);
      if (!choices || choices.type !== 'pdf' || choices.quality !== 'high' || choices.lines !== 'all') problems.push('réglages d\'export relus : ' + json(choices));
      TextExpansion.reset();
      await TextExpansion.load();
      if (!TextExpansion.list().some(e => e.abbreviation === 'bj' && e.text === 'bonjour à tous')) problems.push('abréviations relues : ' + json(TextExpansion.list()));
      SavedPageFormats.reset();
      await SavedPageFormats.load();
      if (!SavedPageFormats.list().some(e => e.name === 'Carte anglaise' && e.widthMm === 85 && e.heightMm === 55)) problems.push('formats relus : ' + json(SavedPageFormats.list()));

      // Une règle de liaison avec sa table de page : la colonne SourceTable est ajoutée au premier lien propre à une table.
      await GristAPI.saveLinkRule('Clients', { mode: 'match', colonneCible: 'Code', colonneSource: 'Ref', tableSource: 'Factures' });
      const link = rowsOf('Publipostage_TableLinks').find(r => r.TargetTable === 'Clients');
      if (!link || link.Mode !== 'match' || link.TargetColumn !== 'Code' || link.SourceColumn !== 'Ref' || link.SourceTable !== 'Factures') problems.push('règle de liaison : ' + json(link));
      await GristAPI.refreshSchema();
      const rule = GristAPI.findLinkRule('Clients', 'Factures');
      if (!rule || rule.colonneCible !== 'Code' || rule.colonneSource !== 'Ref') problems.push('règle relue du document : ' + json(rule));

      // Une version nommée.
      await VersionsStore.keepNamed({ modelRowId: saved.id, state: { html: '<p>v1</p>' }, at: Date.now(), author: 'Alice <a@x.fr>', name: 'Avant envoi', tokenFor: () => Templates.ensureToken(saved.id) });
      const version = rowsOf('Publipostage_Versions').find(r => r.Name === 'Avant envoi');
      if (!version || version.Author !== 'Alice <a@x.fr>' || !version.Token || version.Kind !== '' || !version.Data) problems.push('version : ' + json(version && { Name: version.Name, Author: version.Author, Kind: version.Kind }));
      const read = await VersionsStore.readAll();
      if (!read.entries.some(e => e.name === 'Avant envoi' && e.token === version.Token)) problems.push('la version ne se relit pas : ' + json(read.entries.map(e => e.name)));
      return result(problems);
    },
  });

  cases.push({
    id: 'schemaenglish_no_french_name_and_no_label_reach_the_document',
    description: 'Après tout ce qui précède, aucune table Publipostage_Modeles, _Commentaires, _LiensTables, _PreferencesModeles, _Abreviations ni _FormatsPage, aucune colonne d\'avant (Nom, Contenu, Jeton, ModeleId...) et aucun libellé différent de l\'identifiant',
    run: async () => {
      const problems = [];
      const legacy = legacyNamesIn();
      if (legacy.length) problems.push('noms d\'avant : ' + legacy.join());
      const labels = labelsSet();
      if (labels.length) problems.push('libellés posés : ' + labels.join());
      const english = ['Publipostage_Templates', 'Publipostage_Comments', 'Publipostage_TableLinks', 'Publipostage_TemplatePreferences', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_Versions'];
      english.forEach(table => { if (widgetTables().indexOf(table) === -1) problems.push('table absente : ' + table); });
      const listed = await SchemaColumns.docApi.listTables();
      LEGACY_TABLES.forEach(table => { if (listed.indexOf(table) !== -1) problems.push('listTables rend ' + table); });
      return result(problems);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.schemaEnglish = cases;
})();
