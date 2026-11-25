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
// Le renommage des documents d'avant se fait par la fenêtre commune de mise à jour des noms du kit (consigne 104 de GFS ; js/names-update.js la lance, `migrate` ci-dessous la prépare), JAMAIS en silence (consigne 105) : dès que le
// traducteur apprend qu'une table du widget porte son nom d'avant, il la demande. Elle ne s'ouvre que pour le propriétaire du document, dit « quelques secondes, vos données ne changent pas, seuls les noms changent », envoie UN seul lot (RenameTable,
// RenameColumn, puis le libellé de chaque colonne, qui ne suit pas le renommage dans Grist) que Grist rejoue en entier ou pas du tout, et relit les noms pour le vérifier. Une table que Sync+ utilise (sa colonne `id_sync`) garde son nom d'avant, et
// ses colonnes aussi. Tout ce que la fenêtre ne fait pas (pas propriétaire, compte Lecteur, nom d'arrivée déjà pris, deux jeux de noms à la fois, refus, « Continuer sans mettre à jour ») laisse le document à ses noms d'avant, et le traducteur
// continue de le lire et de l'écrire sous les noms qu'il a : le renommage est une commodité, jamais une condition. Il se demande une fois par page, jamais deux.
// Deux interrupteurs : englishOnDisk (les noms que prend une table ou une colonne créée, et celui que l'on préfère quand un document porte les deux) et renameDocuments (la fenêtre ci-dessus ; allumé dans le widget tel qu'il est servi).
// Les essais posent `globalThis.__schemaNames` avant le chargement (dev-tests/grist-stub.js, dev-tests/unit-harness.mjs) : 'legacy' éteint les deux (le faux Grist porte les noms d'avant),
// 'english' allume le premier seul, 'migrate' les deux (pour essayer la fenêtre elle-même) ; absent (le widget en vrai), les deux sont allumés.
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
  // Vrai : un document d'avant dont une table du widget porte son nom d'avant passe par la fenêtre commune de mise à jour des noms (migrate ; js/names-update.js, consigne 104 de GFS) : elle renomme ses tables et ses colonnes, avec l'accord de la
  // personne. Faux : il garde ses noms, lus tels quels. Allumé dans le widget tel qu'il est servi et par le mode d'essai « migrate » ; éteint par « legacy » et « english », dont les documents ne doivent rien voir de la fenêtre.
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
        // La notice du modèle (js/template-notice.js) : née en anglais (rien d'avant à renommer), son nom d'avant est donc le même.
        ['Notice', 'Notice'],
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
  // Le nombre de fois que ce qui a été lu du document a été oublié (un renommage, une réunion de tables) : une lecture qui échoue et dont le document a changé depuis se retente.
  let documentEpoch = 0;

  function real() { return grist.docApi; }

  function setEnglishOnDisk(on) { englishOnDisk = !!on; }
  function setRenameDocuments(on) { renameDocuments = !!on; }
  // Oublie ce qui a été lu du document (le document a changé sous nos pieds : un renommage, une autre fenêtre).
  function forgetDocument() { tableNames = null; columnsByTable = new Map(); namesRead = null; documentEpoch++; }
  // Oublie aussi la reprise du document (essais : chaque scénario repart d'un widget qui n'a rien lu ni renommé).
  function reset() { forgetDocument(); migration = null; migrationResult = null; lastPlan = null; }

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

  // Les noms réels des tables du document : une lecture à la fois, partagée par tous ceux qui la demandent en même temps. Dès qu'ils sont lus, un document qui porte une table du widget sous son nom d'avant passe par la fenêtre de mise à jour
  // des noms (updateIfNeeded) : tout ce qui attend les noms attend donc aussi la fenêtre, et la liste est relue quand elle a changé le document.
  function readTableNames() {
    if (!namesRead) {
      namesRead = (async () => {
        let list = (await real().listTables()) || [];
        tableNames = new Set(list);
        await updateIfNeeded();
        if (!tableNames) { list = (await real().listTables()) || []; tableNames = new Set(list); }
        return list;
      })().finally(() => { namesRead = null; });
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

  // Les noms du document tels que le kit les lit (`{ tables: { table: [colonnes] } }`, les noms que Grist leur donne maintenant), avec en plus `labels` (table -> colonne -> libellé) pour le lot de l'app : les métadonnées de Grist,
  // quelques Ko, jamais les tables. Une lecture qui échoue rejette, et le kit la tient pour « pas de mise à jour pour cette personne » (état `wait`).
  async function readNamesSchema() {
    const [list, tables, columns] = await Promise.all([real().listTables(), real().fetchTable('_grist_Tables'), real().fetchTable('_grist_Tables_column')]);
    const byRef = new Map();
    (tables.tableId || []).forEach((tableId, i) => byRef.set(tables.id[i], tableId));
    const schema = { tables: Object.create(null), labels: new Map() };
    (list || []).forEach(name => { schema.tables[name] = []; schema.labels.set(name, new Map()); });
    (columns.colId || []).forEach((colId, i) => {
      const tableId = byRef.get(columns.parentId[i]);
      if (!schema.labels.has(tableId)) return;
      schema.tables[tableId].push(colId);
      schema.labels.get(tableId).set(colId, columns.label ? columns.label[i] : undefined);
    });
    return schema;
  }

  // Le lot de l'app d'après les noms que le document a MAINTENANT (le kit le recalcule sur des noms relus juste avant d'envoyer : un autre onglet a pu passer avant). Des libellés seuls ne sont pas des noms : la fenêtre, qui dit « les
  // noms de vos tables changent », ne s'ouvre pas pour eux.
  let lastPlan = null;
  function planNamesUpdate(schema) {
    const plan = planRenames(new Set(Object.keys(schema.tables)), tableId => schema.labels.get(tableId) || null);
    lastPlan = plan;
    return plan.tables || plan.columns ? plan.actions : [];
  }

  // UN seul lot, par grist.docApi et non par le traducteur : ses actions portent déjà les noms que le document aura (ou a) au moment de chacune, le traducteur les prendrait pour des noms anglais d'une table qui n'a pas encore ce nom.
  async function applyNamesUpdate(actions) {
    await real().applyUserActions(actions);
  }

  function isReadOnlyDocument() {
    return typeof GristAPI !== 'undefined' && typeof GristAPI.isDocumentReadOnly === 'function' && GristAPI.isDocumentReadOnly();
  }

  // Ce que la reprise a fait, pour que js/main.js le dise : { tables, columns, labels, skipped, held, failed } ; null tant qu'elle n'a pas fini ou quand elle n'avait rien à faire.
  let migration = null;
  let migrationResult = null;
  const migratedListeners = [];

  // La fenêtre commune de mise à jour des noms (js/names-update.js, consigne 104 de GFS) : elle ne s'ouvre que pour le propriétaire du document, et seulement s'il y a des noms à changer. Dans GFS comme seul, le widget ne renomme rien sans elle.
  // L'état qu'elle rend : none, wait (cette personne ne peut pas : pas propriétaire, compte Lecteur, noms illisibles), blocked (un nom d'arrivée est déjà pris), already (un autre onglet est passé), done, skipped (refus, puis « Continuer sans
  // mettre à jour »). Quel qu'il soit, le widget continue sur les noms que le document a : le traducteur les lit et les écrit tels quels, y compris ceux des tables que Sync+ garde (`held`).
  async function migrate() {
    if (!renameDocuments || !englishOnDisk || typeof NamesUpdateBridge === 'undefined') return null;
    let outcome;
    try {
      outcome = await NamesUpdateBridge.run({ readSchema: readNamesSchema, plan: planNamesUpdate, apply: applyNamesUpdate, readOnly: isReadOnlyDocument });
    } catch (e) {
      console.warn('[SchemaColumns] la mise à jour des noms a échoué, les noms d\'avant sont gardés', e);
      forgetDocument();
      return null;
    }
    const state = outcome && outcome.state;
    const held = (outcome && outcome.held) || [];
    // Rien n'a changé dans le document : les noms qui ont été lus restent valables.
    if (!state || state === 'none' || state === 'wait' || state === 'blocked') return null;
    // Le document a pu changer sous nos pieds (renommé, par la fenêtre ou par un autre onglet) : les noms et les colonnes lus ne valent plus.
    forgetDocument();
    if (state === 'already') return null;
    if (state !== 'done') {
      migrationResult = { tables: 0, columns: 0, labels: 0, skipped: [], held, failed: true, state };
      return migrationResult;
    }
    const result = outcome.result || {};
    migrationResult = { tables: result.tables || 0, columns: result.columns || 0, labels: lastPlan ? lastPlan.labels : 0, skipped: lastPlan ? lastPlan.skipped : [], held, failed: false };
    migratedListeners.splice(0).forEach(listener => { try { listener(migrationResult); } catch (e) { /* un écouteur qui échoue n'arrête pas les autres */ } });
    return migrationResult;
  }

  // Lancée une seule fois par page, par le premier qui apprend que le document porte une table du widget sous son nom d'avant ; tout appel suivant attend la même reprise.
  function ensureMigrated() {
    if (!migration) migration = migrate().catch(() => null);
    return migration;
  }
  // Une table du widget sous son nom d'avant, parmi les noms que le document porte ?
  function needsUpdate(names) {
    return !!names && TABLES.some(table => table.legacyId !== table.id && names.has(table.legacyId));
  }
  // Appelée dès que les noms des tables sont lus : un document d'avant passe par la fenêtre, et tout ce qui attendait les noms l'attend avec elle. Ne coûte rien à un document aux noms anglais : aucune lecture de plus, le module du kit n'est pas chargé.
  async function updateIfNeeded() {
    if (!renameDocuments || !englishOnDisk || !needsUpdate(tableNames)) return;
    await ensureMigrated();
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
      if (migration) await migration;
      let list = await real().listTables(...rest);
      tableNames = new Set(list || []);
      // Un document d'avant passe par la fenêtre de mise à jour des noms (une fois par page) ; renommé, il est relu.
      await updateIfNeeded();
      if (!tableNames) { list = await real().listTables(...rest); tableNames = new Set(list || []); }
      const seen = new Set();
      return (list || []).map(name => (byLegacy.has(name) ? byLegacy.get(name).id : name)).filter(name => (seen.has(name) ? false : (seen.add(name), true)));
    },

    // Une table de la liste lue sous le nom qu'elle a dans le document : sans liste des tables lue, le nom de l'interrupteur d'abord (un aller-retour de moins à
    // l'ouverture) et l'autre quand le document ne connaît pas le premier.
    async fetchTable(name, ...rest) {
      const table = byEnglish.get(name);
      if (!table) return real().fetchTable(name, ...rest);
      // La fenêtre de mise à jour des noms est ouverte (ou vient de l'être) : on attend le nom que la table aura.
      if (migration) await migration;
      const epoch = documentEpoch;
      let actual = actualTableIn(table, tableNames);
      let columns;
      try {
        columns = await real().fetchTable(actual, ...rest);
      } catch (e) {
        if (tableNames) throw e;
        await readTableNames();
        const other = actualTableIn(table, tableNames);
        // Les noms viennent d'être lus : sous l'autre nom, ou sous le même quand la fenêtre a renommé le document entre-temps (le document a changé depuis le départ), on retente une fois.
        if (other === actual && epoch === documentEpoch) throw e;
        actual = other;
        columns = await real().fetchTable(actual, ...rest);
      }
      if (columns && typeof columns === 'object') columnsByTable.set(actual, new Set(Object.keys(columns)));
      return toEnglishColumns(table, columns);
    },

    async applyUserActions(actions, ...rest) {
      if (migration && (actions || []).some(action => byEnglish.has(action[1]))) await migration;
      const learned = [];
      const translated = [];
      for (const action of actions || []) translated.push(await translate(action, learned));
      let result;
      try { result = await real().applyUserActions(translated, ...rest); }
      catch (error) {
        // Un refus d'une règle d'accès (« Blocked by full structure access rules »…) se garde pour le constat d'une icône grisée (js/lock-diagnostic.js), même quand l'appelant l'avale (une colonne à ajouter qu'on retentera).
        if (typeof GristAPI !== 'undefined' && typeof GristAPI.noteRefusal === 'function') GristAPI.noteRefusal(error);
        throw error;
      }
      learned.forEach(learn => learn());
      return result;
    },
  };

  return { docApi, actualTable, whereIs, setEnglishOnDisk, setRenameDocuments, reset, TABLES, planRenames, lastMigration, onMigrated };
})();
