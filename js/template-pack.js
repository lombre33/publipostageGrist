// Modèles de la galerie qui s'installent AVEC leurs tables (« Créer avec ses tables », js/template-gallery-modal.js). Le pack.json d'un modèle de
// templates-gallery/ dit les tables et leurs colonnes (types, choix, colonnes à formule, « Colonne à afficher » des Références), les règles de liaison
// et la page du modèle ; une famille de tables partagée par plusieurs modèles (templates-gallery/_tables/<famille>.json) évite de redire les mêmes
// colonnes dans chacun. Les tables sont créées VIDES : les lignes d'exemple n'existent que dans les captures de l'aperçu, jamais dans le document.
//
// Trois temps, chacun lisible seul :
//  - normalize(raw, family) : le pack tel que le fichier le donne -> un pack complet et validé (jamais d'objet à moitié valide plus loin) ;
//  - plan(pack, schema) : ce que l'installation ferait dans CE document (tables à créer, déjà là et compatibles, en conflit) ; pur, sans lecture de Grist ;
//  - apply(pack) : l'installation elle-même, en trois appels. Les tables partent seules dans un premier lot (Grist le rejoue en entier ou pas du tout :
//    essai du 09/10 dans un vrai Grist, une action invalide du lot n'en laisse aucune). Le nom que Grist leur a donné est vérifié avant d'écrire quoi que
//    ce soit d'autre : un nom pris entre-temps est renommé en silence (« Clients2 »), et les colonnes de calcul, qui visent leur table par son nom,
//    se seraient posées sur une table qui n'est pas la nôtre. Puis les colonnes de calcul, puis les « Colonnes à afficher » (les identifiants de colonnes
//    n'existent qu'après coup). Si l'un des deux derniers appels échoue, les tables créées sont retirées : le document ne garde pas des tables à moitié réglées.
// Les règles de liaison passent par les fonctions publiques de js/grist-api.js, auquel ce fichier n'ajoute rien.
const TemplatePack = (function () {
  const VERSION = 1;
  const SIMPLE_TYPES = ['Text', 'Numeric', 'Int', 'Bool', 'Date', 'DateTime', 'Choice', 'ChoiceList', 'Attachments', 'Any'];
  const TABLE_ID_RE = /^[A-Z][A-Za-z0-9_]*$/;
  const COLUMN_ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
  const LINK_MODES = ['match', 'singleton'];
  const MODEL_TYPES = ['document', 'email', 'grille'];
  const ORIENTATIONS = ['portrait', 'landscape'];
  // Le format d'une page : A3 à A6, ou « LARGEURxHAUTEUR » en millimètres, côté court d'abord (le format libre de js/page-layout.js : « 55x85 » est une carte de
  // visite, que `orientation: landscape` met en 85 x 55). Une autre écriture serait lue comme A4 en silence : le fichier est refusé.
  const FREE_FORMAT_RE = /^(\d+(?:\.\d)?)x(\d+(?:\.\d)?)$/;
  function isPageFormat(format) {
    if (/^A[3-6]$/.test(format)) return true;
    const free = FREE_FORMAT_RE.exec(format);
    return !!free && Number(free[1]) <= Number(free[2]) && Number(free[1]) >= 20 && Number(free[2]) <= 558.8; // les bornes de PageLayout (CUSTOM_MIN_MM, CUSTOM_MAX_MM)
  }
  const lower = text => String(text).toLowerCase();

  // Erreur d'installation : `code` dit laquelle (conflict, renamed, display), `details` ce qu'il faut pour l'écrire à la personne.
  function packError(code, details) {
    const error = new Error('Installation du modèle : ' + code);
    error.packCode = code;
    error.details = details || {};
    return error;
  }
  const isPackError = error => !!error && typeof error.packCode === 'string';

  function fail(where, why) { throw new Error('pack : ' + where + ' ' + why); }
  function text(value, where, { required = false } = {}) {
    if (value == null || value === '') { if (required) fail(where, 'manque'); return ''; }
    if (typeof value !== 'string') fail(where, 'doit être un texte');
    return value;
  }

  // « Ref:Clients » -> { kind: 'Ref', target: 'Clients' } ; un type simple -> { kind: 'Text' } ; sinon null.
  function parseType(type) {
    if (SIMPLE_TYPES.indexOf(type) !== -1) return { kind: type, target: null };
    const ref = /^(Ref|RefList):([A-Z][A-Za-z0-9_]*)$/.exec(String(type));
    return ref ? { kind: ref[1], target: ref[2] } : null;
  }
  const isReference = type => { const parsed = parseType(type); return !!parsed && !!parsed.target; };

  function normalizeColumn(raw, tableId) {
    const where = tableId + '.' + (raw && raw.id);
    if (!raw || typeof raw !== 'object') fail(tableId, 'a une colonne illisible');
    const id = text(raw.id, tableId + ' : colonne sans identifiant', { required: true });
    if (!COLUMN_ID_RE.test(id)) fail(where, 'a un identifiant invalide');
    const type = text(raw.type, where + ' (type)', { required: true });
    if (!parseType(type)) fail(where, 'a un type inconnu : ' + type);
    const choices = raw.choices == null ? null : raw.choices;
    if (choices && (!Array.isArray(choices) || choices.some(choice => typeof choice !== 'string'))) fail(where, 'a des choix qui ne sont pas des textes');
    if (choices && type !== 'Choice' && type !== 'ChoiceList') fail(where, 'a des choix sans être une colonne à choix');
    const options = raw.options == null ? null : raw.options;
    if (options && (typeof options !== 'object' || Array.isArray(options))) fail(where, 'a des options illisibles');
    return { id, type, label: text(raw.label, where + ' (libellé)'), formula: text(raw.formula, where + ' (formule)'), choices: choices ? choices.slice() : null, show: text(raw.show, where + ' (colonne à afficher)'), options: options ? JSON.parse(JSON.stringify(options)) : null };
  }

  function normalizeTable(raw) {
    if (!raw || typeof raw !== 'object') fail('une table', 'est illisible');
    const id = text(raw.id, 'une table (identifiant)', { required: true });
    if (!TABLE_ID_RE.test(id)) fail(id, 'a un identifiant invalide');
    if (!Array.isArray(raw.columns) || !raw.columns.length) fail(id, 'n’a aucune colonne');
    const columns = raw.columns.map(column => normalizeColumn(column, id));
    const seen = {};
    columns.forEach(column => { const key = lower(column.id); if (seen[key]) fail(id + '.' + column.id, 'est en double'); seen[key] = true; });
    return { id, columns };
  }

  function normalizeLink(raw, tables) {
    if (!raw || typeof raw !== 'object') fail('une règle de liaison', 'est illisible');
    const table = text(raw.table, 'une règle de liaison (table)', { required: true });
    if (!tables.some(t => t.id === table)) fail('la règle de liaison de ' + table, 'vise une table qui n’est pas dans le modèle');
    const mode = text(raw.mode, 'la règle de ' + table + ' (mode)', { required: true });
    if (LINK_MODES.indexOf(mode) === -1) fail('la règle de ' + table, 'a un mode inconnu : ' + mode);
    const target = text(raw.target, 'la règle de ' + table + ' (colonne cible)');
    const source = text(raw.source, 'la règle de ' + table + ' (colonne source)');
    if (mode === 'match' && (!target || !source)) fail('la règle de ' + table, 'doit dire sa colonne cible et sa colonne source');
    return { table, mode, target: mode === 'match' ? target : '', source: mode === 'match' ? source : '' };
  }

  function normalizeTemplate(raw) {
    raw = raw || {};
    const type = text(raw.type, 'le modèle (type)') || 'document';
    if (MODEL_TYPES.indexOf(type) === -1) fail('le modèle', 'a un type inconnu : ' + type);
    const page = raw.page || {};
    const orientation = text(page.orientation, 'la page (sens)') || 'portrait';
    if (ORIENTATIONS.indexOf(orientation) === -1) fail('la page', 'a un sens inconnu : ' + orientation);
    const margins = page.margins == null ? null : page.margins;
    if (margins && (!Array.isArray(margins) || margins.length !== 4 || margins.some(m => typeof m !== 'number' || !isFinite(m) || m < 0 || m > 100))) fail('la page', 'a des marges illisibles (quatre nombres, en mm)');
    const format = text(page.format, 'la page (format)') || 'A4';
    if (!isPageFormat(format)) fail('la page', 'a un format inconnu : ' + format);
    const email = raw.email || {};
    return {
      type,
      pdfName: text(raw.pdfName, 'le modèle (nom du fichier PDF)'),
      page: { format, orientation, margins: margins ? { top: margins[0], right: margins[1], bottom: margins[2], left: margins[3] } : null },
      email: { destinataires: text(email.to, 'l’e-mail (à)'), cc: text(email.cc, 'l’e-mail (cc)'), cci: text(email.bcc, 'l’e-mail (cci)'), objet: text(email.subject, 'l’e-mail (objet)') },
    };
  }

  // `raw` : le contenu de pack.json ; `family` : le contenu du fichier de famille qu'il nomme (ou null). Rend le pack complet, ou lève une Error qui dit
  // le défaut (le fichier est écrit par nous : un défaut est un oubli à corriger, pas un cas à contourner).
  function normalize(raw, family) {
    if (!raw || typeof raw !== 'object') fail('le fichier', 'est illisible');
    if (raw.version !== VERSION) fail('la version', 'est inconnue : ' + raw.version);
    if (!Array.isArray(raw.tables) || !raw.tables.length) fail('le fichier', 'ne dit aucune table');
    const known = {};
    if (family && Array.isArray(family.tables)) family.tables.forEach(table => { known[table.id] = table; });
    const tables = raw.tables.map(entry => {
      if (typeof entry === 'string') {
        if (!known[entry]) fail(entry, 'n’est pas dans la famille de tables');
        return normalizeTable(known[entry]);
      }
      return normalizeTable(entry);
    });
    const byId = {};
    tables.forEach(table => { const key = lower(table.id); if (byId[key]) fail(table.id, 'est en double'); byId[key] = table; });
    tables.forEach(table => table.columns.forEach(column => {
      const parsed = parseType(column.type);
      if (parsed.target) {
        const target = tables.find(t => t.id === parsed.target);
        if (!target) fail(table.id + '.' + column.id, 'vise une table qui n’est pas dans le modèle : ' + parsed.target);
        if (!column.show) fail(table.id + '.' + column.id, 'doit dire la colonne à afficher de ' + parsed.target);
        if (!target.columns.some(c => c.id === column.show)) fail(table.id + '.' + column.id, 'affiche une colonne qui n’existe pas : ' + parsed.target + '.' + column.show);
      } else if (column.show) fail(table.id + '.' + column.id, 'a une colonne à afficher sans être une Référence');
    }));
    const main = text(raw.main, 'le fichier (table principale)') || tables[0].id;
    if (!tables.some(table => table.id === main)) fail('la table principale', 'n’est pas dans le modèle : ' + main);
    const links = (raw.links || []).map(link => normalizeLink(link, tables));
    links.forEach(link => {
      const linked = tables.find(table => table.id === link.table);
      const mainTable = tables.find(table => table.id === main);
      const has = (table, id) => id === 'id' || table.columns.some(column => column.id === id);
      if (link.mode === 'match' && (!has(linked, link.target) || !has(mainTable, link.source))) fail('la règle de ' + link.table, 'nomme une colonne qui n’existe pas');
    });
    return { version: VERSION, tables, main, links, template: normalizeTemplate(raw.template) };
  }

  // ---- Le document tel qu'il est ----

  const SKIPPED_COLUMN = /^(gristHelper_|manualSort$)/;
  // Les tables du document et leurs colonnes, par nom en minuscules (Grist refuse deux noms qui ne diffèrent que par la casse : AddTable « clients »
  // quand « Clients » existe rend « clients2 »). `ref` : l'identifiant de ligne dans les métadonnées, dont les « Colonnes à afficher » ont besoin.
  async function readDocumentSchema() {
    const [tables, columns] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]);
    const byRef = {};
    const schema = { tables: {} };
    tables.id.forEach((ref, i) => { const table = { ref, id: tables.tableId[i], columns: {} }; byRef[ref] = table; schema.tables[lower(table.id)] = table; });
    columns.id.forEach((ref, i) => {
      const table = byRef[columns.parentId[i]];
      const id = columns.colId[i];
      if (!table || SKIPPED_COLUMN.test(id)) return;
      table.columns[lower(id)] = { ref, id, type: columns.type[i] };
    });
    return schema;
  }

  // Deux types « du même genre » : un nombre entier ou décimal, un texte libre ou à choix, une date avec ou sans heure ; une colonne « Any » prend tout.
  // Une Référence n'est celle d'une autre table que si le nom est le même (Ref:Clients).
  const KIND_GROUPS = [['Numeric', 'Int'], ['Text', 'Choice'], ['Date', 'DateTime']];
  function sameKind(wanted, have) {
    const baseOf = type => String(type || '').replace(/^DateTime:.*$/, 'DateTime');
    const w = baseOf(wanted);
    const h = baseOf(have);
    if (w === h || h === 'Any') return true;
    return KIND_GROUPS.some(group => group.indexOf(w) !== -1 && group.indexOf(h) !== -1);
  }

  // Ce que l'installation ferait dans ce document : { create, reuse, conflicts }. Une table du même nom dont toutes les colonnes du pack existent (du même
  // genre) est gardée telle quelle ; sinon c'est un conflit, et rien n'est touché (le widget n'ajoute jamais une colonne à une table qui n'est pas la sienne).
  function plan(pack, schema) {
    const create = [];
    const reuse = [];
    const conflicts = [];
    pack.tables.forEach(table => {
      const found = schema.tables[lower(table.id)];
      if (!found) { create.push(table.id); return; }
      const problems = [];
      if (found.id !== table.id) problems.push({ kind: 'name', found: found.id });
      table.columns.forEach(column => {
        const have = found.columns[lower(column.id)];
        if (!have || have.id !== column.id) problems.push({ kind: 'missing', column: column.id });
        else if (!sameKind(column.type, have.type)) problems.push({ kind: 'type', column: column.id, wanted: column.type, found: have.type });
      });
      if (problems.length) conflicts.push({ table: table.id, problems });
      else reuse.push(table.id);
    });
    return { create, reuse, conflicts };
  }

  // ---- Les actions ----

  function widgetOptionsOf(column) {
    const options = Object.assign({}, column.options || {});
    if (column.choices) options.choices = column.choices;
    return Object.keys(options).length ? JSON.stringify(options) : '';
  }

  // Une colonne de donnée pour AddTable : l'identifiant, le type, le libellé et les options (choix, format) quand il y en a.
  function dataColumnSpec(column) {
    const spec = { id: column.id, type: column.type };
    if (column.label) spec.label = column.label;
    const options = widgetOptionsOf(column);
    if (options) spec.widgetOptions = options;
    return spec;
  }

  // Le premier lot : toutes les tables ensemble (une Référence peut viser une table créée plus loin dans le lot : essayé dans un vrai Grist), avec leurs seules
  // colonnes de donnée. Aucune ligne.
  function tableActions(pack, tableIds) {
    return pack.tables.filter(table => tableIds.indexOf(table.id) !== -1)
      .map(table => ['AddTable', table.id, table.columns.filter(column => !column.formula).map(dataColumnSpec)]);
  }

  // Le second lot : les colonnes à formule, une fois les tables là sous le nom voulu (elles nomment d'autres tables et colonnes : leur ordre ne compte pas,
  // Grist recalcule ce qui attendait une colonne).
  function formulaActions(pack, tableIds) {
    const actions = [];
    pack.tables.filter(table => tableIds.indexOf(table.id) !== -1).forEach(table => table.columns.filter(column => column.formula).forEach(column => {
      const spec = { type: column.type, isFormula: true, formula: column.formula };
      if (column.label) spec.label = column.label;
      const options = widgetOptionsOf(column);
      if (options) spec.widgetOptions = options;
      actions.push(['AddColumn', table.id, column.id, spec]);
    }));
    return actions;
  }

  // « Colonne à afficher » des Références des tables créées : le réglage (visibleCol) et la colonne d'aide que Grist en tire (SetDisplayFormula). `schema`
  // est lu APRÈS la création : les identifiants de colonnes n'existent pas avant.
  function displayActions(pack, tableIds, schema) {
    const actions = [];
    pack.tables.filter(table => tableIds.indexOf(table.id) !== -1).forEach(table => table.columns.forEach(column => {
      const parsed = parseType(column.type);
      if (!parsed.target || !column.show) return;
      const own = schema.tables[lower(table.id)];
      const target = schema.tables[lower(parsed.target)];
      const col = own && own.columns[lower(column.id)];
      const shown = target && target.columns[lower(column.show)];
      if (!col || !shown) throw packError('display', { table: table.id, column: column.id });
      actions.push(['UpdateRecord', '_grist_Tables_column', col.ref, { visibleCol: shown.ref }]);
      actions.push(['SetDisplayFormula', table.id, null, col.ref, '$' + column.id + '.' + column.show]);
    }));
    return actions;
  }

  // Le nom que Grist a donné à chaque table du lot, dans l'ordre des AddTable (retValues : { id, table_id, columns, views } ; les noms « tableId » du
  // faux Grist de dev-tests/ ne sont pas ceux du vrai).
  function givenTableIds(result, count) {
    const values = (result && result.retValues) || [];
    return Array.from({ length: count }, (_, i) => { const value = values[i] || {}; return value.table_id || value.tableId || null; });
  }

  async function removeTables(tableIds) {
    if (!tableIds.length) return;
    try { await grist.docApi.applyUserActions(tableIds.map(id => ['RemoveTable', id])); }
    catch (e) { console.error('[template-pack] impossible de retirer les tables créées', e); }
  }

  // L'installation. Rend { created, reused, linksSaved, linksKept } ; lève une erreur d'installation (isPackError) pour un conflit ou un nom pris entre-temps.
  // Les règles de liaison déjà posées pour la même table sont gardées telles quelles (une seule règle par table, valable pour tout le document : la
  // changer casserait les autres modèles qui s'en servent).
  async function apply(pack) {
    const schema = await readDocumentSchema();
    const found = plan(pack, schema);
    if (found.conflicts.length) throw packError('conflict', { conflicts: found.conflicts });
    const created = found.create;
    if (created.length) {
      const result = await grist.docApi.applyUserActions(tableActions(pack, created));
      const given = givenTableIds(result, created.length);
      // Un nom pris entre la lecture du document et le lot (une autre fenêtre) : Grist renomme en silence (« Clients2 »), et les variables du modèle
      // viseraient une autre table. Tout ce que le lot vient de créer est retiré, avant qu'une colonne de calcul ne soit posée.
      if (given.some((id, i) => id && id !== created[i])) {
        await removeTables(given.map((id, i) => id || created[i]));
        throw packError('renamed', { wanted: created, given });
      }
      try {
        const calculated = formulaActions(pack, created);
        if (calculated.length) await grist.docApi.applyUserActions(calculated);
        const shown = displayActions(pack, created, await readDocumentSchema());
        if (shown.length) await grist.docApi.applyUserActions(shown);
      } catch (e) {
        await removeTables(created);
        throw e;
      }
    }
    const linksSaved = [];
    const linksKept = [];
    for (const link of pack.links) {
      const wanted = { mode: link.mode, colonneCible: link.target, colonneSource: link.source };
      const existing = GristAPI.getLinkRule(link.table);
      if (existing) {
        const same = existing.mode === wanted.mode && (wanted.mode !== 'match' || (existing.colonneCible === wanted.colonneCible && existing.colonneSource === wanted.colonneSource));
        if (!same) linksKept.push(link.table);
        continue;
      }
      await GristAPI.saveLinkRule(link.table, wanted);
      linksSaved.push(link.table);
    }
    if (created.length) await GristAPI.refreshSchema();
    return { created, reused: found.reuse, linksSaved, linksKept };
  }

  // La page du modèle telle que loadTemplateIntoEditor l'attend (`marginsMm` : millimètres, sens et format). Une marge que le pack ne dit pas reste absente :
  // PageLayout.setMarginsMm la remplace par sa valeur de départ, clé par clé.
  function marginsOf(pack) {
    const page = pack.template.page;
    return Object.assign({}, page.margins || {}, { orientation: page.orientation, format: page.format });
  }

  return { VERSION, normalize, readDocumentSchema, plan, tableActions, formulaActions, displayActions, apply, marginsOf, isPackError, parseType, isReference, sameKind };
})();
