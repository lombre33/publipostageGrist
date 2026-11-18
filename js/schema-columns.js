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
// Ce que le document porte ne change PAS tant que englishOnDisk est faux (le défaut) : un document neuf naît sous les anciens noms, un document d'avant garde les siens.
// L'interrupteur ne s'allume qu'avec le renommage réel des documents, à la demande du porteur du projet et une fois GFS prévenu (GFS écrit lui-même la colonne `Nom` des modèles et les lignes d'état de dossier des préférences, et lit le `Jeton` des versions) ;
// il décide alors des noms des tables et des colonnes créées ensuite, et de celui que l'on prend quand un document porte les deux.
//
// Pourquoi un traducteur et pas `grist.docApi = ...` : le paquet de Grist (grist-plugin-api.js) exporte `docApi` par un accesseur sans écriture ; on ne peut pas
// le remplacer. Les modules qui lisent ou écrivent les tables du widget passent donc ici ; ce que la personne a dans ses tables passe toujours par grist.docApi.
//
//   SchemaColumns.docApi.listTables() / .fetchTable(table) / .applyUserActions(actions) -> comme grist.docApi, noms anglais
//   SchemaColumns.actualTable(nom anglais) -> le nom que la table a (ou aura) dans le document : page-tree.js le compare aux métadonnées de Grist
//   SchemaColumns.whereIs(table, colonne) -> { table, column, label } : où la colonne est dans CE document, avec les noms que la personne voit dans Grist
//   SchemaColumns.setEnglishOnDisk(vrai | faux), SchemaColumns.reset() -> l'interrupteur, et l'oubli de ce qui a été lu du document (essais)
const SchemaColumns = (function () {
  // Faux : le document garde (et reçoit) les noms français d'avant. Vrai : les noms anglais. Un seul réglage, posé par le renommage des documents.
  let englishOnDisk = false;

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
  function reset() { tableNames = null; columnsByTable = new Map(); namesRead = null; }

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
      const learned = [];
      const translated = [];
      for (const action of actions || []) translated.push(await translate(action, learned));
      const result = await real().applyUserActions(translated, ...rest);
      learned.forEach(learn => learn());
      return result;
    },
  };

  return { docApi, actualTable, whereIs, setEnglishOnDisk, reset, TABLES };
})();
