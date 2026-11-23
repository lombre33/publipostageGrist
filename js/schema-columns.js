// Les noms des tables et des colonnes que le widget range dans le document de la personne : tout le code les écrit en anglais, identifiant égal au libellé
// (« Publipostage_Templates », « Content », « Margins »). Ce fichier est le SEUL endroit du code où les noms français d'avant (« Publipostage_Modeles »,
// « Contenu », « DateModif »...) restent écrits : ceux des documents que la bêta et les versions d'avant ont créés, qui les portent encore.
//
// Le widget parle au document par SchemaColumns.docApi, qui a les trois appels dont les modules du widget se servent pour leurs tables (listTables, fetchTable,
// applyUserActions, comme grist.docApi ; getAccessToken et le reste restent à grist.docApi) et traduit au passage, dans les deux sens, les tables et les colonnes de la liste ci-dessous :
//  - listTables et fetchTable rendent les noms anglais, que le document porte les anciens ou les nouveaux ;
//  - applyUserActions reçoit les noms anglais et écrit ceux que le document a : une colonne qui existe sous son ancien nom est écrite sous cet ancien nom, une colonne
//    qui n'existe pas encore est créée sous le nom que dit l'interrupteur (englishOnDisk), avec, sous l'ancien nom, le libellé que l'ancien code lui donnait ;
//  - une table ou une colonne qui n'est pas dans la liste passe telle quelle : les tables de la personne, les métadonnées de Grist, et les deux tables du widget qui
//    s'appelaient déjà en anglais (Publipostage_Direct, Publipostage_UserProbe).
// Le renommage des documents d'avant se fait ICI, à la première lecture ou écriture d'une table du widget (migrate) : un seul lot d'actions (RenameTable, RenameColumn, puis le
// libellé de chaque colonne, qui ne suit pas le renommage dans Grist), que Grist rejoue en entier ou pas du tout. Un document qui ne s'y prête pas (lecteur, deux jeux de noms à la fois,
// nom déjà pris) garde ses noms d'avant, et le traducteur continue de le lire et de l'écrire sous ces noms : le renommage est une commodité, jamais une condition.
// Deux interrupteurs : englishOnDisk (les noms que prend une table ou une colonne créée, et celui que l'on préfère quand un document porte les deux) et renameDocuments (le renommage ci-dessus).
// Les essais posent `globalThis.__schemaNames` avant le chargement (dev-tests/grist-stub.js, dev-tests/unit-harness.mjs) : 'legacy' éteint les deux (le faux Grist porte les noms d'avant),
// 'english' allume le premier seul, 'migrate' les deux ; absent (le widget en vrai), les deux sont allumés.
//
// Pourquoi un traducteur et pas `grist.docApi = ...` : le paquet de Grist (grist-plugin-api.js) exporte `docApi` par un accesseur sans écriture ; on ne peut pas
// le remplacer. Les modules qui lisent ou écrivent les tables du widget passent donc ici ; ce que la personne a dans ses tables passe toujours par grist.docApi.
//
//   SchemaColumns.docApi.listTables() / .fetchTable(table) / .applyUserActions(actions) -> comme grist.docApi, noms anglais
//   SchemaColumns.actualTable(nom anglais) -> le nom que la table a (ou aura) dans le document : page-tree.js le compare aux métadonnées de Grist
//   SchemaColumns.whereIs(table, colonne) -> { table, column, label } : où la colonne est dans CE document, avec les noms que la personne voit dans Grist
//   SchemaColumns.setEnglishOnDisk(vrai | faux), SchemaColumns.reset() -> l'interrupteur, et l'oubli de ce qui a été lu du document (essais)
const SchemaColumns = (function () {
  // Faux : le document garde (et reçoit) les noms français d'avant. Vrai : les noms anglais.
  const testMode = typeof globalThis !== 'undefined' ? globalThis.__schemaNames : undefined;
  let englishOnDisk = testMode !== 'legacy';
  // Vrai : les tables et les colonnes d'un document d'avant sont renommées à leur première lecture (migrate). Faux : il garde ses noms, lus tels quels.
  let renameDocuments = testMode === undefined || testMode === 'migrate';

  // [nom anglais, nom d'avant, libellé que l'ancien code donnait à la colonne en l'ajoutant (absent : celui de Grist, c'est-à-dire l'identifiant)]. Les trois colonnes
  // dont le nom n'a pas changé (HeaderFooter, Margins, Cc) n'avaient que le libellé français.
  const TABLES = [
    {
      id: 'Publipostage_Templates',
      legacyId: 'Publipostage_Modeles',
      columns: [
        ['Name', 'Nom'],
        ['Content', 'Contenu'],
        ['PdfFileName', 'NomFichierPDF'],
        ['ModifiedAt', 'DateModif', 'Dernière modification'],
        ['HeaderFooter', 'HeaderFooter', 'En-tête / pied de page'],
        ['Margins', 'Margins', 'Marges de page'],
        ['IsDefault', 'EstParDefaut', 'Modèle par défaut'],
        ['TemplateType', 'TypeModele', 'Type de modèle'],
        ['To', 'Destinataires', 'Destinataires (À)'],
        ['Cc', 'Cc', 'Copie (Cc)'],
        ['Bcc', 'Cci', 'Copie cachée (Cci)'],
        ['Subject', 'Objet', 'Objet de l\'email'],
        ['Attachments', 'PJ', 'Pièces jointes (PJ)'],
        ['TrackedChanges', 'SuiviModifications', 'Suivi des modifications'],
        ['Token', 'Jeton', 'Identité du modèle'],
        ['ModifiedBy', 'ModifiePar', 'Modifié par'],
        ['PdfPassword', 'MotDePassePdf', 'Mot de passe des PDF protégés'],
        ['LinkedEmail', 'EmailLie', 'Email lié'],
      ],
    },
    {
      id: 'Publipostage_Comments',
      legacyId: 'Publipostage_Commentaires',
      columns: [
        ['TemplateId', 'ModeleId'],
        ['Author', 'Auteur'],
        ['Text', 'Texte'],
        ['CreatedAt', 'CreeLe'],
        ['PdfId', 'LectureId'],
        ['Start', 'Debut'],
        ['End', 'Fin'],
        ['Quote', 'Citation'],
        ['Before', 'Avant'],
        ['After', 'Apres'],
        ['Resolved', 'Resolu'],
      ],
    },
    {
      id: 'Publipostage_Versions',
      legacyId: 'Publipostage_Versions',
      columns: [
        ['Token', 'Jeton'],
        ['Author', 'Auteur'],
        ['Name', 'Nom'],
        ['Kind', 'Genre'],
        ['Data', 'Donnees'],
      ],
    },
    {
      id: 'Publipostage_TemplatePreferences',
      legacyId: 'Publipostage_PreferencesModeles',
      columns: [
        ['User', 'Utilisateur'],
        ['TemplateId', 'ModeleId'],
        ['Pinned', 'Epingle'],
        ['Folder', 'Dossier'],
        ['Collapsed', 'Replie', 'Dossier replié par défaut'],
        ['ExportType', 'TypeExport', 'Type d\'export'],
        ['PdfQuality', 'QualitePdf', 'Qualité du PDF'],
        ['ExportLines', 'LignesExport', 'Lignes exportées'],
      ],
    },
    {
      id: 'Publipostage_Abbreviations',
      legacyId: 'Publipostage_Abreviations',
      columns: [
        ['User', 'Utilisateur'],
        ['Abbreviation', 'Abreviation'],
        ['Text', 'Texte'],
      ],
    },
    {
      id: 'Publipostage_PageFormats',
      legacyId: 'Publipostage_FormatsPage',
      columns: [
        ['Name', 'Nom'],
        ['Width', 'Largeur'],
        ['Height', 'Hauteur'],
      ],
    },
    {
      id: 'Publipostage_TableLinks',
      legacyId: 'Publipostage_LiensTables',
      columns: [
        ['TargetTable', 'TableCible'],
        ['TargetColumn', 'ColonneCible'],
        ['SourceColumn', 'ColonneSource'],
        ['SourceTable', 'TableSource', 'Table de la page'],
      ],
    },
  ];

  const byEnglish = new Map();
  const byLegacy = new Map();
  TABLES.forEach(table => {
    table.pairs = table.columns.map(([id, legacy, legacyLabel]) => ({ id, legacy, legacyLabel }));
    table.byId = new Map(table.pairs.map(pair => [pair.id, pair]));
    byEnglish.set(table.id, table);
    byLegacy.set(table.legacyId, table);
  });

  // Ce qui a été lu du document : les noms réels de ses tables (null : jamais lus) et, pour chaque table de la liste, ses colonnes (lues par fetchTable, ou par les
  // métadonnées de Grist quand une écriture arrive avant toute lecture de la table).
  let tableNames = null;
  let columnsByTable = new Map();
  let namesRead = null;

  function real() { return grist.docApi; }

  function setEnglishOnDisk(on) { englishOnDisk = !!on; }
  function setRenameDocuments(on) { renameDocuments = !!on; }
  // Oublie ce qui a été lu du document (le document a changé sous nos pieds : un renommage, une autre fenêtre).
  function forgetDocument() { tableNames = null; columnsByTable = new Map(); namesRead = null; }
  // Oublie aussi la reprise du document (essais : chaque scénario repart d'un widget qui n'a rien lu ni renommé).
  function reset() { forgetDocument(); migration = null; migrationResult = null; }

  // Le nom réel d'une table de la liste : celui que le document porte ; quand il porte les deux, celui que l'interrupteur préfère ; quand il n'en porte aucun
  // (ou qu'on ne sait pas encore), celui que l'interrupteur dit pour une table à créer.
  function actualTableIn(table, names) {
    const hasEnglish = !!names && names.has(table.id);
    const hasLegacy = !!names && names.has(table.legacyId);
    if (hasEnglish && hasLegacy) return englishOnDisk ? table.id : table.legacyId;
    if (hasEnglish) return table.id;
    if (hasLegacy) return table.legacyId;
    return englishOnDisk ? table.id : table.legacyId;
  }
  function actualTable(name) {
    const table = byEnglish.get(name);
    return table ? actualTableIn(table, tableNames) : name;
  }

  // Le nom réel d'une colonne : celui que la table porte ; les deux, celui que l'interrupteur préfère ; aucun, celui que l'interrupteur dit pour une colonne à créer.
  function columnIn(pair, columns) {
    const hasEnglish = !!columns && columns.has(pair.id);
    const hasLegacy = !!columns && columns.has(pair.legacy);
    if (hasEnglish && hasLegacy) return englishOnDisk ? pair.id : pair.legacy;
    if (hasEnglish) return pair.id;
    if (hasLegacy) return pair.legacy;
    return englishOnDisk ? pair.id : pair.legacy;
  }

  // Les noms réels des tables du document : une lecture à la fois, partagée par tous ceux qui la demandent en même temps.
  function readTableNames() {
    if (!namesRead) {
      namesRead = Promise.resolve(real().listTables()).then(list => {
        tableNames = new Set(list || []);
        return list || [];
      }).finally(() => { namesRead = null; });
    }
    return namesRead;
  }

  // Les colonnes d'une table de la liste quand aucune lecture de la table ne les a données : les métadonnées de Grist (quelques Ko), jamais la table entière, qui peut peser des dizaines de Mo.
  async function columnsOf(actual) {
    if (columnsByTable.has(actual)) return columnsByTable.get(actual);
    const found = new Set();
    try {
      const [tables, columns] = await Promise.all([real().fetchTable('_grist_Tables'), real().fetchTable('_grist_Tables_column')]);
      const row = (tables.tableId || []).indexOf(actual);
      // Une table absente (pas encore créée) ou des métadonnées illisibles : aucune colonne connue, et rien de gardé - la table peut naître juste après.
      if (row === -1) return found;
      (columns.colId || []).forEach((colId, i) => { if (columns.parentId[i] === tables.id[row]) found.add(colId); });
    } catch (e) { return found; }
    columnsByTable.set(actual, found);
    return found;
  }

  // --- La reprise des documents d'avant ---------------------------------------------------------------------------------------------------------------------------------------

  // Le lot d'actions qui met à l'anglais les tables et les colonnes que le document porte sous leurs noms d'avant. `names` : les tables du document ; `labelsOf(table)` : les colonnes d'une
  // table (nom -> libellé), absente quand la table n'existe pas. Rien n'est renommé quand le nom anglais est déjà pris (à la casse près : Grist numéroterait « …2 » au lieu de refuser) ni
  // quand le document porte les deux noms (le traducteur les départage) ; une colonne ou une table qui n'est pas dans la liste n'est jamais touchée. Grist ne change PAS le libellé d'une
  // colonne qu'il renomme (mesuré dans grist-static 0.1.6 : « Nom » devient « Name », libellé « Nom ») : chaque colonne de la liste reçoit donc le libellé de son identifiant.
  function planRenames(names, labelsOf) {
    const actions = [];
    const plan = { actions, tables: 0, columns: 0, labels: 0, skipped: [] };
    const takenTables = new Set([...names].map(name => name.toLowerCase()));
    TABLES.forEach(table => {
      const hasLegacy = names.has(table.legacyId);
      const hasEnglish = names.has(table.id);
      if (!hasLegacy && !hasEnglish) return;
      const renamed = hasLegacy && table.legacyId !== table.id;
      if (renamed && (hasEnglish || takenTables.has(table.id.toLowerCase()))) { plan.skipped.push(table.id); return; }
      const before = hasEnglish ? table.id : table.legacyId;
      const columns = labelsOf(before);
      if (!columns) return;
      if (renamed) { actions.push(['RenameTable', table.legacyId, table.id]); plan.tables++; }
      const takenColumns = new Set([...columns.keys()].map(column => column.toLowerCase()));
      table.pairs.forEach(pair => {
        const hasOld = columns.has(pair.legacy);
        const hasNew = columns.has(pair.id);
        if (!hasOld && !hasNew) return;
        const renamedColumn = hasOld && !hasNew && pair.legacy !== pair.id;
        if (renamedColumn && takenColumns.has(pair.id.toLowerCase())) { plan.skipped.push(table.id + '.' + pair.id); return; }
        if (hasOld && hasNew && pair.legacy !== pair.id) return;
        if (renamedColumn) { actions.push(['RenameColumn', table.id, pair.legacy, pair.id]); plan.columns++; }
        const label = columns.get(hasNew ? pair.id : pair.legacy);
        if (label !== undefined && label !== null && label !== pair.id) { actions.push(['ModifyColumn', table.id, pair.id, { label: pair.id }]); plan.labels++; }
      });
    });
    return plan;
  }

  // Les tables du document et, pour chacune de la liste, ses colonnes avec leur libellé, lus dans les métadonnées de Grist (quelques Ko, jamais les tables).
  async function readSchema() {
    const list = await real().listTables();
    const names = new Set(list || []);
    const registered = TABLES.some(table => names.has(table.id) || names.has(table.legacyId));
    if (!registered) return { names, labelsOf: () => null };
    const [tables, columns] = await Promise.all([real().fetchTable('_grist_Tables'), real().fetchTable('_grist_Tables_column')]);
    const byRef = new Map();
    (tables.tableId || []).forEach((tableId, i) => byRef.set(tables.id[i], tableId));
    const labelsByTable = new Map();
    (columns.colId || []).forEach((colId, i) => {
      const tableId = byRef.get(columns.parentId[i]);
      if (!tableId) return;
      if (!labelsByTable.has(tableId)) labelsByTable.set(tableId, new Map());
      labelsByTable.get(tableId).set(colId, columns.label ? columns.label[i] : undefined);
    });
    return { names, labelsOf: tableId => labelsByTable.get(tableId) || null };
  }

  // Hébergé par Grist Factory Suite, le widget n'écrit pas la structure lui-même : le courtier de GFS refuse RenameColumn et ModifyColumn (consigne 080), un lot qui en porte serait refusé en entier. Le
  // document garde alors ses noms - GFS lit les deux jeux de noms - et la reprise se fait à la première ouverture hors de GFS.
  function isHostedByGfs() {
    return typeof GfsLink !== 'undefined' && !!GfsLink.hosted;
  }

  function isReadOnlyDocument() {
    return typeof GristAPI !== 'undefined' && typeof GristAPI.isDocumentReadOnly === 'function' && GristAPI.isDocumentReadOnly();
  }

  // Ce que la reprise a fait, pour que js/main.js le dise : { tables, columns, labels, skipped, failed } ; null tant qu'elle n'a pas fini ou quand elle n'avait rien à faire.
  let migration = null;
  let migrationResult = null;
  const migratedListeners = [];

  async function migrate() {
    if (!renameDocuments || !englishOnDisk) return null;
    // Un compte Lecteur n'écrit rien : le renommage attend le premier compte qui peut modifier le document, et le traducteur lit les noms d'avant en attendant.
    if (isReadOnlyDocument() || isHostedByGfs()) return null;
    let schema;
    try { schema = await readSchema(); } catch (e) { return null; } // accès à la table seule, ou métadonnées illisibles : rien n'est lu ni renommé
    tableNames = new Set(schema.names);
    const plan = planRenames(schema.names, schema.labelsOf);
    if (!plan.actions.length) { if (plan.skipped.length) console.warn('[SchemaColumns] noms d\'avant gardés', plan.skipped); return null; }
    try {
      await real().applyUserActions(plan.actions);
    } catch (e) {
      // Un autre widget du même document a pu renommer entre-temps, ou Grist refuse : tout est refusé ensemble, le document garde ses noms, lus tels quels.
      console.warn('[SchemaColumns] renommage des tables du widget refusé, les noms d\'avant sont gardés', e);
      forgetDocument();
      migrationResult = { tables: 0, columns: 0, labels: 0, skipped: plan.skipped, failed: true };
      return migrationResult;
    }
    forgetDocument();
    migrationResult = { tables: plan.tables, columns: plan.columns, labels: plan.labels, skipped: plan.skipped, failed: false };
    migratedListeners.splice(0).forEach(listener => { try { listener(migrationResult); } catch (e) { /* un écouteur qui échoue n'arrête pas les autres */ } });
    return migrationResult;
  }

  // Lancée par la première lecture ou écriture d'une table du widget (docApi), une fois par document ; tout appel suivant attend la même reprise.
  function ensureMigrated() {
    if (!migration) migration = migrate().catch(() => null);
    return migration;
  }
  function lastMigration() { return migrationResult; }
  // `listener(result)` quand la reprise a renommé quelque chose ; tout de suite quand elle l'a déjà fait.
  function onMigrated(listener) {
    if (migrationResult && !migrationResult.failed) listener(migrationResult);
    else migratedListeners.push(listener);
  }

  // Les colonnes d'une lecture complète, rendues sous leurs noms anglais (les noms que le document porte, sauf une colonne de la personne qui aurait déjà le nom anglais).
  function toEnglishColumns(table, columnsData) {
    if (!columnsData || typeof columnsData !== 'object' || Array.isArray(columnsData)) return columnsData;
    const keys = new Set(Object.keys(columnsData));
    const chosen = new Map();
    table.pairs.forEach(pair => {
      const actual = columnIn(pair, keys);
      if (keys.has(actual)) chosen.set(actual, pair.id);
    });
    const out = {};
    Object.keys(columnsData).forEach(key => { if (!chosen.has(key)) out[key] = columnsData[key]; });
    chosen.forEach((english, actual) => { out[english] = columnsData[actual]; });
    return out;
  }

  function toActualFields(table, fields, columns) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return fields;
    const out = {};
    Object.keys(fields).forEach(key => {
      const pair = table.byId.get(key);
      out[pair ? columnIn(pair, columns) : key] = fields[key];
    });
    return out;
  }

  // La description d'une colonne qu'on crée (AddTable, AddVisibleColumn) : sous son ancien nom, elle reçoit le libellé que l'ancien code lui donnait ; sous son nom
  // anglais, celui de Grist, c'est-à-dire l'identifiant.
  function withLegacyLabel(pair, actual, info) {
    if (!pair || actual !== pair.legacy || !pair.legacyLabel || (info && info.label !== undefined)) return info;
    return Object.assign({}, info, { label: pair.legacyLabel });
  }

  function noteColumn(actualName, column) {
    const set = columnsByTable.get(actualName);
    if (set) set.add(column);
  }

  // Une action traduite, et ce qu'elle apprend sur le document une fois appliquée (`learn`).
  async function translate(action, learned) {
    const verb = action[0];
    const table = byEnglish.get(action[1]);
    if (!table) return action;
    if (!tableNames) await readTableNames();
    const actual = actualTableIn(table, tableNames);
    if (verb === 'AddTable') {
      const none = new Set();
      const columns = (action[2] || []).map(spec => {
        const pair = table.byId.get(spec.id);
        return pair ? Object.assign({}, spec, { id: columnIn(pair, none) }) : spec;
      });
      learned.push(() => { tableNames.add(actual); columnsByTable.set(actual, new Set(columns.map(spec => spec.id))); });
      return [verb, actual, columns, ...action.slice(3)];
    }
    const known = await columnsOf(actual);
    if (verb === 'AddColumn' || verb === 'AddVisibleColumn') {
      const pair = table.byId.get(action[2]);
      const column = pair ? columnIn(pair, known) : action[2];
      learned.push(() => noteColumn(actual, column));
      return [verb, actual, column, pair ? withLegacyLabel(pair, column, action[3]) : action[3], ...action.slice(4)];
    }
    if (verb === 'UpdateRecord' || verb === 'AddRecord') return [verb, actual, action[2], toActualFields(table, action[3], known), ...action.slice(4)];
    if (verb === 'BulkUpdateRecord' || verb === 'BulkAddRecord') return [verb, actual, action[2], toActualFields(table, action[3], known), ...action.slice(4)];
    if (verb === 'BulkAddOrUpdateRecord' || verb === 'AddOrUpdateRecord') return [verb, actual, toActualFields(table, action[2], known), toActualFields(table, action[3], known), ...action.slice(4)];
    return [verb, actual, ...action.slice(2)];
  }

  // Où se trouve une colonne dans CE document, tel que la personne le voit dans Grist : { table, column, label }. Les fenêtres qui disent où le widget range quelque chose
  // (le mot de passe commun des PDF) le disent avec les noms que le document porte.
  function whereIs(tableName, columnName) {
    const table = byEnglish.get(tableName);
    const pair = table && table.byId.get(columnName);
    const tableId = actualTable(tableName);
    if (!pair) return { table: tableId, column: columnName, label: columnName };
    const column = columnIn(pair, columnsByTable.get(tableId));
    return { table: tableId, column, label: column === pair.legacy && pair.legacyLabel ? pair.legacyLabel : column };
  }

  const docApi = {
    // Les tables du document, sous leurs noms anglais : une table portée sous l'ancien nom et sous le nouveau n'est rendue qu'une fois.
    async listTables(...rest) {
      await ensureMigrated();
      const list = await real().listTables(...rest);
      tableNames = new Set(list || []);
      const seen = new Set();
      return (list || []).map(name => (byLegacy.has(name) ? byLegacy.get(name).id : name)).filter(name => (seen.has(name) ? false : (seen.add(name), true)));
    },

    // Une table de la liste lue sous le nom qu'elle a dans le document : sans liste des tables lue, le nom de l'interrupteur d'abord (un aller-retour de moins à
    // l'ouverture) et l'autre quand le document ne connaît pas le premier.
    async fetchTable(name, ...rest) {
      const table = byEnglish.get(name);
      if (!table) return real().fetchTable(name, ...rest);
      await ensureMigrated();
      let actual = actualTableIn(table, tableNames);
      let columns;
      try {
        columns = await real().fetchTable(actual, ...rest);
      } catch (e) {
        if (tableNames) throw e;
        await readTableNames();
        const other = actualTableIn(table, tableNames);
        if (other === actual) throw e;
        actual = other;
        columns = await real().fetchTable(actual, ...rest);
      }
      if (columns && typeof columns === 'object') columnsByTable.set(actual, new Set(Object.keys(columns)));
      return toEnglishColumns(table, columns);
    },

    async applyUserActions(actions, ...rest) {
      if ((actions || []).some(action => byEnglish.has(action[1]))) await ensureMigrated();
      const learned = [];
      const translated = [];
      for (const action of actions || []) translated.push(await translate(action, learned));
      const result = await real().applyUserActions(translated, ...rest);
      learned.forEach(learn => learn());
      return result;
    },
  };

  return { docApi, actualTable, whereIs, setEnglishOnDisk, setRenameDocuments, reset, TABLES, planRenames, lastMigration, onMigrated };
})();
