// Ce que l'hôte donne au module graphique du kit (celui que Grist BI écrit : décision du porteur du 18/11, « Module du kit, comme le calendrier » ; le module ne parle jamais à Grist). Publipostage+ lit Grist,
// le module demande : `source = { tables, charger(table) }`, où `charger` rend une promesse de { colonnes, lignes }. Ce fichier est la SEULE chose que Publipostage+ écrit pour que le module trace ses
// lignes : il ne dessine rien, ne définit aucun graphique (la définition est celle de Grist BI) et n'est pas la lecture d'un graphique de la page (chart-source.js, qui reste telle quelle).
//  - les COLONNES, avec le type que Grist leur donne (Grist BI le devinait de la première valeur non vide) : { id, libelle, type, genre, element, format }. `genre` dit ce que la colonne peut être
//    (text, number, bool, date, list, any, other) ; `element` le genre des éléments d'une liste ; `format` les réglages d'affichage de la colonne (devise, décimales, pourcentage), null sans ;
//  - les LIGNES, déjà prêtes à tracer : { id, [colonne]: valeur } dans l'ordre de la table dans Grist. Une Référence porte la valeur que Grist montre (jamais l'identifiant de la ligne liée), une date
//    son texte AAAA-MM-JJ (date et heure : AAAA-MM-JJTHH:MM:SS, l'heure du mur dans le fuseau de la colonne), une liste ses éléments. Une cellule en erreur, en attente ou que Grist n'a pas
//    pu donner, une valeur qui n'est pas du type de sa colonne (du texte dans un nombre) : null, jamais 0 ;
//  - la PORTÉE : « all » (toute la table, comme la page de Grist) ou « linked » (les lignes que trouve la règle de liaison de la table pour la ligne du document, comme une bulle ; une seule si le
//    graphique est de la table du document). Un document en lot refait la source pour chaque destinataire (`record`) : les lignes lues sont partagées par la passe de lecture de GristAPI.
// `reports` lit la table des rapports de Grist BI (`BI_Dashboard_Config`, la seule voie : GFS ne la rend pas, le manifeste de Publipostage+ lit déjà toutes les tables) et rend ses lignes TELLES QUELLES à la
// fonction de lecture que Grist BI écrit dans le module (`lireRapport` : elle seule connaît les trois formats historiques de la configuration) ; sans cette table, l'insertion d'un rapport est grisée avec sa raison. Le
// texte de la configuration est NON FIABLE (une autre personne du document peut avoir écrit la ligne) : ce fichier n'en lit rien, et ce que le module en tire n'est jamais écrit comme du balisage.
// `planReport` et `aliasColumns` font le remappage d'un rapport importé sans toucher à sa définition : le plan dit, tuile par tuile, ce qui se retrouve, ce qui change de colonne et ce qui demande un choix ; la source est ensuite
// vue sous les identifiants que la définition cite. `matchColumns` est la moitié « données » du remappage : les colonnes qu'un graphique ou un rapport demande (identifiant, libellé, genre) retrouvées dans une table du document, par leur identifiant puis par
// leur libellé, sans jamais en choisir une qui ne peut pas porter le genre demandé (un nombre à mesurer dans une colonne de texte) ni deviner entre deux.
// Les noms qui franchissent la frontière (tables, charger, colonnes, lignes) sont ceux de la réponse de Grist BI du 18/11 ; le reste est écrit ici, en un seul endroit, et se corrige ici.
const ChartHostSource = (function () {
  const { pureTypeOf, isoInTimezone } = ViewSource;
  const REFERENCE = /^(Ref|RefList):/;
  // Les tables que Grist BI crée dans le document pour lui-même (sa configuration, ses commentaires, sa sonde d'utilisateur) : jamais des données à tracer, il ne les propose pas non plus.
  const REPORT_TABLE = 'BI_Dashboard_Config';
  const BI_TABLES = [REPORT_TABLE, 'BI_Dashboard_Comments', 'BI_Dashboard_UserProbe'];
  const TEXT_TYPES = ['Text', 'Choice'];
  const NUMBER_TYPES = ['Numeric', 'Int'];

  // Le genre d'une colonne de type Grist `type` : ce qu'elle peut tracer. Une colonne dont Grist n'a pas fixé le type (une formule) est « any » : ses nombres et ses textes passent tels quels.
  function genreOf(type) {
    const pure = pureTypeOf(type);
    if (TEXT_TYPES.indexOf(pure) !== -1) return 'text';
    if (NUMBER_TYPES.indexOf(pure) !== -1) return 'number';
    if (pure === 'Bool') return 'bool';
    if (pure === 'Date' || pure === 'DateTime') return 'date';
    if (pure === 'ChoiceList' || pure === 'RefList') return 'list';
    if (pure === 'Attachments') return 'other';
    return 'any';
  }

  // Une date de Grist (des secondes) écrite comme le module la lit : le jour, ou le jour et l'heure du mur dans le fuseau de la colonne. 0 n'est pas une date (une case vide de Grist).
  function dateText(seconds, timezone, withTime) {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds === 0) return null;
    return isoInTimezone(seconds * 1000, timezone || 'UTC').slice(0, withTime ? 19 : 10);
  }

  // Comment lire la colonne `colId` de `table` : { source (la colonne des lignes qui porte la valeur : celle d'affichage d'une Référence), type, genre, element, isRef, isList, timezone, withTime }.
  function readerOf(deps, table, colId) {
    const type = deps.type(table, colId) || '';
    const isRef = REFERENCE.test(type);
    const display = isRef ? deps.display(table, colId) : null;
    // Une Référence montre une autre colonne : son type dit ce qu'on trace. Sans colonne d'affichage elle montre l'identifiant de la ligne liée, une étiquette et non un nombre à mesurer.
    const shownType = isRef ? (display ? (deps.type(table, display) || 'Text') : 'Text') : type;
    const isList = pureTypeOf(type) === 'ChoiceList' || pureTypeOf(type) === 'RefList';
    const shownGenre = genreOf(shownType);
    return {
      source: display || colId, isRef, isList, type,
      genre: isList ? 'list' : (shownGenre === 'list' ? 'text' : shownGenre),
      element: isList ? (isRef ? (shownGenre === 'list' ? 'text' : shownGenre) : 'text') : undefined,
      withTime: pureTypeOf(shownType) === 'DateTime',
      timezone: (String(shownType).indexOf('DateTime:') === 0 && shownType.slice(9)) || 'UTC',
    };
  }

  // Une valeur lue de Grist, ramenée à ce que le module trace pour le genre `genre` (voir l'en-tête).
  function scalarOf(reader, genre, raw) {
    if (raw === null || raw === undefined) return null;
    if (genre === 'number') return typeof raw === 'number' && isFinite(raw) ? raw : null;
    if (genre === 'bool') return typeof raw === 'boolean' ? raw : null;
    if (genre === 'date') return dateText(raw, reader.timezone, reader.withTime);
    if (genre === 'text') return typeof raw === 'string' ? raw : (typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null);
    if (genre === 'any') return typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean' ? raw : null;
    return null;
  }
  function cellOf(reader, raw) {
    if (reader.genre === 'other') return null;
    if (Array.isArray(raw)) {
      const tag = raw[0];
      const itemGenre = reader.genre === 'list' ? reader.element : reader.genre;
      if (tag === 'L') return raw.slice(1).map(item => (Array.isArray(item) ? cellOf(reader, item) : scalarOf(reader, itemGenre, item))).filter(item => item !== null);
      // Une date que la colonne d'affichage rend sous une étiquette (['d', secondes], ['D', secondes, fuseau]) ; toute autre cellule codée (erreur, attente, censurée) ne se trace pas.
      if ((tag === 'd' || tag === 'D') && typeof raw[1] === 'number') return dateText(raw[1], tag === 'D' ? raw[2] : 'UTC', tag === 'D');
      return null;
    }
    // Une liste dont la cellule n'en est pas une n'est pas une liste de un.
    if (reader.genre === 'list') return null;
    return scalarOf(reader, reader.genre, raw);
  }

  // Les colonnes de `table` : leur description pour le module (`colonnes`) et leur lecture (`readers`, jamais montrée au module), dans l'ordre de la table.
  function columnsOf(deps, table) {
    const readers = {};
    const colonnes = deps.columns(table).map((id) => {
      const reader = readerOf(deps, table, id);
      readers[id] = reader;
      const format = deps.format(table, id);
      const colonne = { id, libelle: deps.label(table, id) || id, type: reader.type, genre: reader.genre, format: format && Object.keys(format).length ? format : null };
      if (reader.element) colonne.element = reader.element;
      return colonne;
    });
    return { colonnes, readers };
  }

  // Les lignes `found` (celles de Grist, brutes) ; chaque ligne rendue : { id, [colonne]: valeur }.
  // Une Référence vide (0) ne montre rien, même quand la colonne d'affichage rend la valeur par défaut de son type (0 pour un nombre) ; elle est lue sur la colonne elle-même.
  const rawOf = (reader, colId, row) => (reader.isRef && !reader.isList && row[colId] === 0 ? null : row[reader.source]);
  const linesOf = (colonnes, readers, found) => found.map((row) => {
    const line = { id: row.id };
    colonnes.forEach((colonne) => { line[colonne.id] = cellOf(readers[colonne.id], rawOf(readers[colonne.id], colonne.id, row)); });
    return line;
  });

  // Les lignes de `table` pour la portée : toutes, ou celles que la règle de liaison de la table trouve pour `record` de `tableId`.
  async function rowsFor(deps, scope, table, tableId, record) {
    if (scope === 'all') return deps.allRows(table);
    const resolved = await deps.linkedRows(table, tableId, record);
    if (resolved.error) throw new Error(resolved.error);
    return resolved.rows.filter(Boolean);
  }

  async function load(deps, scope, table, tableId, record) {
    if (deps.tables().indexOf(table) === -1 || BI_TABLES.indexOf(table) !== -1) throw new Error(I18n.t('chart.host.noTable', { table }));
    const found = await rowsFor(deps, scope, table, tableId, record);
    const { colonnes, readers } = columnsOf(deps, table);
    return { colonnes, lignes: linesOf(colonnes, readers, deps.arrange(found)) };
  }

  // Les liens de Publipostage+ avec Grist, tels que le code les prend dans chaque fichier ; un essai en donne d'autres.
  function gristDeps() {
    return {
      tables: () => GristAPI.getTables(),
      columns: table => GristAPI.getVisibleColumns(table),
      type: (table, colId) => GristAPI.getColumnType(table, colId),
      label: (table, colId) => GristAPI.getColumnLabel(table, colId),
      display: (table, colId) => GristAPI.getDisplayColumn(table, colId),
      format: (table, colId) => GristAPI.getColumnFormatOptions(table, colId),
      settings: () => GristAPI.getDocumentSettings(),
      allRows: table => GristAPI.fetchTableRows(table),
      linkedRows: (table, tableId, record) => Variables.resolveRows(table, [], tableId, record),
      // Une table se lit « liée » quand c'est celle du document, qu'une règle de liaison la relie à elle, ou qu'une colonne Référence de la table du document y mène (js/variables.js:baseRows).
      isLinkable: async (table, tableId) => !!tableId && (table === tableId || !!GristAPI.getLinkRule(table, tableId) || (await GristAPI.findReferenceColumns(tableId, table)).length > 0),
      arrange: found => ViewSource.arrange(found, [], []),
    };
  }

  // La source de lignes du module : { scope, tables: [{ id, libelle, accessible }], reglages, charger(table) }. `options` : `scope` (« all » par défaut), `tableId` et `record` (la table et la ligne
  // du document, pour « linked » ; sans ligne, une table liée n'a aucune ligne, comme une bulle sans ligne). Une table que la portée « linked » ne sait pas relier à celle du document est `accessible: false`
  // et son `charger` dit pourquoi (le message de js/variables.js).
  async function make(options, deps) {
    const use = deps || gristDeps();
    const scope = options && options.scope === 'linked' ? 'linked' : 'all';
    const tableId = options && options.tableId;
    const record = options && options.record;
    const names = use.tables().filter(name => BI_TABLES.indexOf(name) === -1);
    const reach = scope === 'all' ? names.map(() => true) : await Promise.all(names.map(name => use.isLinkable(name, tableId)));
    return {
      scope,
      tables: names.map((id, i) => ({ id, libelle: id, accessible: reach[i] })),
      reglages: use.settings() || {},
      charger: table => load(use, scope, table, tableId, record),
    };
  }

  // Les rapports de Grist BI : { available, reason, rows: [{ id, table, config, tableExists }] }. `config` est le texte de la colonne `ConfigJSON` (jamais lu ici) ; `table` la table de travail du rapport (`TableId`),
  // `tableExists` dit si le document l'a encore. Une ligne sans texte de configuration n'est pas un rapport. `reason` (le texte du grisé) n'est dit que sans table de rapports.
  async function reports(deps) {
    const use = deps || gristDeps();
    if (use.tables().indexOf(REPORT_TABLE) === -1) return { available: false, reason: I18n.t('chart.report.noBi'), rows: [] };
    const names = use.tables();
    const lines = (await use.allRows(REPORT_TABLE)).filter(row => typeof row.ConfigJSON === 'string' && row.ConfigJSON.trim() !== '');
    return { available: true, reason: '', rows: lines.map(row => ({ id: row.id, table: typeof row.TableId === 'string' ? row.TableId : '', config: row.ConfigJSON, tableExists: names.indexOf(row.TableId) !== -1 })) };
  }

  // Le remappage des colonnes
  const ACCEPTS = {
    number: ['number', 'any'], date: ['date', 'any'], bool: ['bool', 'any'], list: ['list'],
    text: ['text', 'number', 'date', 'bool', 'list', 'any'],
  };
  // Un nom comparé sans accents, sans casse ni ponctuation : « Date d'envoi », « date_d_envoi » et « Date d’envoi » se retrouvent.
  const nameKey = name => String(name == null ? '' : name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const canCarry = (wanted, colonne) => !wanted.genre || (ACCEPTS[wanted.genre] || []).indexOf(colonne.genre) !== -1;

  // Les colonnes `wanted` ([{ id, libelle?, genre? }], ce qu'un graphique ou un rapport demande) retrouvées parmi `colonnes` (celles de `charger`) : { mapping: { [id demandé]: id de la colonne },
  // how: { [id demandé]: 'id' | 'libelle' }, missing, incompatible, ambiguous } (des listes d'identifiants demandés). Par identifiant d'abord ; une colonne de même identifiant qui ne peut pas porter le genre
  // demandé est `incompatible` (jamais une autre prise à sa place) ; à défaut par libellé ou identifiant sans accents ni casse, s'il n'y en a qu'une.
  function matchColumns(wanted, colonnes) {
    const result = { mapping: {}, how: {}, missing: [], incompatible: [], ambiguous: [] };
    (wanted || []).forEach((ask) => {
      const same = colonnes.find(colonne => colonne.id === ask.id);
      if (same) {
        if (canCarry(ask, same)) { result.mapping[ask.id] = same.id; result.how[ask.id] = 'id'; } else result.incompatible.push(ask.id);
        return;
      }
      const keys = [nameKey(ask.id), nameKey(ask.libelle)].filter(Boolean);
      const found = colonnes.filter(colonne => canCarry(ask, colonne) && (keys.indexOf(nameKey(colonne.id)) !== -1 || keys.indexOf(nameKey(colonne.libelle)) !== -1));
      if (found.length === 1) { result.mapping[ask.id] = found[0].id; result.how[ask.id] = 'libelle'; } else if (found.length > 1) result.ambiguous.push(ask.id); else result.missing.push(ask.id);
    });
    return result;
  }

  // Le plan d'un rapport importé : ce que chaque tuile demande, retrouvé dans les colonnes de la table choisie. `lu` est ce que `lireRapport` du module rend, `colonnes` celles de `charger`, `module` porte
  // `colonnesDeDefinition` (le module se donne à l'hôte, il n'est jamais importé ici). Par tuile : `status` « grisee » (le module la grise : jointure, forme à venir…, sa raison est gardée telle quelle),
  // « ok » (toutes ses colonnes y sont, sous leur identifiant), « remapped » (retrouvées sous un autre : `mapping` ne dit que celles qui changent) ou « blocked » (`problems` : missing, incompatible,
  // ambiguous : la personne choisit). La définition n'est jamais modifiée : le remappage se joue sur la source (`aliasColumns`).
  function planTile(tile, colonnes, module) {
    if (tile.grisee) return { id: tile.id, status: 'grisee', grisee: tile.grisee, mapping: {}, problems: null };
    const found = matchColumns(module.colonnesDeDefinition(tile.definition), colonnes);
    const problems = { missing: found.missing, incompatible: found.incompatible, ambiguous: found.ambiguous };
    const mapping = {};
    Object.keys(found.mapping).forEach((ask) => { if (found.mapping[ask] !== ask) mapping[ask] = found.mapping[ask]; });
    if (problems.missing.length || problems.incompatible.length || problems.ambiguous.length) return { id: tile.id, status: 'blocked', mapping, problems, grisee: null };
    return { id: tile.id, status: Object.keys(mapping).length ? 'remapped' : 'ok', mapping, problems: null, grisee: null };
  }
  const planReport = (lu, colonnes, module) => (!lu || !lu.ok ? { ok: false, raison: lu ? lu.raison : 'invalide', pages: [] }
    : { ok: true, pages: lu.pages.map(page => ({ id: page.id, nom: page.nom, tuiles: page.tuiles.map(tile => planTile(tile, colonnes, module)) })) });

  // Les colonnes d'une table lue (`charger`) sous les identifiants que la définition attend : `mapping` { identifiant attendu : colonne de la table }. La définition de Grist BI reste celle qu'elle est,
  // le module lit les identifiants qu'elle cite. Une colonne de la table qu'une entrée vise est montrée sous l'identifiant attendu (son libellé, son type et ses réglages restent les siens) ; une
  // colonne dont l'identifiant est pris ainsi n'est plus montrée sous le sien (elle ne peut pas être deux colonnes à la fois). Rien d'autre ne change : les lignes lues ne sont pas modifiées.
  function aliasColumns(loaded, mapping) {
    const moved = Object.keys(mapping || {}).filter(ask => mapping[ask] !== ask);
    const shown = [];
    loaded.colonnes.forEach((colonne) => {
      moved.filter(ask => mapping[ask] === colonne.id).forEach(ask => shown.push({ from: colonne.id, colonne: Object.assign({}, colonne, { id: ask }) }));
      if (moved.indexOf(colonne.id) === -1) shown.push({ from: colonne.id, colonne });
    });
    return {
      colonnes: shown.map(entry => entry.colonne),
      lignes: loaded.lignes.map((row) => { const line = { id: row.id }; shown.forEach((entry) => { line[entry.colonne.id] = row[entry.from]; }); return line; }),
    };
  }

  return { make, reports, matchColumns, planReport, aliasColumns, genreOf, cellOf, columnsOf, linesOf };
})();
