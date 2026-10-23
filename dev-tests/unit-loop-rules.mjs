#!/usr/bin/env node
// Tests purs (sans navigateur) de js/loop-rules.js : ce qu'une bulle peut parcourir (`sourceFor`, dans la page comme dans une zone répétée), la forme
// d'une boucle imbriquée (`within`, `by`), la colonne qui la rattache (`nestedColumn`) et la ligne où elle lit (`scopeFor`). Le vrai js/grist-api.js
// (lecture du type d'une Référence), dont seuls le schéma et les règles de liaison sont simulés. cf. dev-tests/unit-harness.mjs.
// Lancer : node dev-tests/unit-loop-rules.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const TYPES = {
  'Factures.Lignes': 'RefList:Lignes',
  'Factures.Soi': 'RefList:Factures',
  'Factures.Client': 'Ref:Clients',
  'Factures.Nom': 'Text',
  'Factures.Vide': 'RefList:',
  'Factures.Casse': 'reflist:Lignes',
  // Une boucle dans la zone répétée d'une facture : les tables qui se rattachent à une facture par une colonne Référence.
  'Lignes.Facture': 'Ref:Factures',
  'Lignes.Prix': 'Numeric',
  'Lignes.Options': 'RefList:Options',
  'Options.Ligne': 'Ref:Lignes',
  'Options.Nom': 'Text',
  'Seances.Facture': 'Ref:Factures',
  'Seances.Facturee': 'Ref:Factures',
  'Seances.gristHelper_Display': 'Any',
  'Seances.Duree': 'Numeric',
  'Notes.Factures': 'RefList:Factures',
  'Notes.Texte': 'Text',
  'Clients.Nom': 'Text',
};
const COLUMNS = {};
Object.keys(TYPES).forEach(key => { const [table, column] = key.split('.'); (COLUMNS[table] = COLUMNS[table] || []).push(column); });
const RULES = {
  Lignes: { mode: 'match', colonneCible: 'Facture' },
  Clients: { mode: 'match', colonneCible: 'id' },
  Taches: { mode: 'row' },
};

const ctx = createContext({ grist: { docApi: {} } });
loadScript(ctx, 'js/grist-api.js');
const api = evalIn(ctx, 'GristAPI');
api.getColumnType = (table, column) => TYPES[table + '.' + column];
api.getLinkRule = table => RULES[table] || null;
api.getVisibleColumns = table => (COLUMNS[table] || []).filter(column => !api.isHelperColumn(column));
loadScript(ctx, 'js/condition-rules.js'); // normalizeLoop lit le filtre
loadScript(ctx, 'js/batch-scope.js'); // iterate lit les lignes de la vue (viewRowsOf, linkedViewRows)
loadScript(ctx, 'js/loop-rules.js');
const rules = evalIn(ctx, 'LoopRules');
const sourceFor = (attrs, page, enclosing) => JSON.parse(JSON.stringify(rules.sourceFor(attrs, page, enclosing)));
const plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Une colonne Liste de références de la page : la boucle parcourt la table visée, en lisant la liste dans la ligne courante.
check('liste de références de la page : la table visée, avec la colonne qui porte la liste',
  same(sourceFor({ table: 'Factures', column: 'Lignes' }, 'Factures'), { table: 'Lignes', via: { table: 'Factures', column: 'Lignes' } }));
check('liste de références vers la table de la page elle-même : écartée', sourceFor({ table: 'Factures', column: 'Soi' }, 'Factures') === null);
check('référence simple (pas une liste) : écartée', sourceFor({ table: 'Factures', column: 'Client' }, 'Factures') === null);
check('liste de références sans table visée : écartée', sourceFor({ table: 'Factures', column: 'Vide' }, 'Factures') === null);
check('type écrit autrement (casse) : écarté', sourceFor({ table: 'Factures', column: 'Casse' }, 'Factures') === null);
check('colonne ordinaire de la page : écartée', sourceFor({ table: 'Factures', column: 'Nom' }, 'Factures') === null);
check('colonne inconnue de la page : écartée', sourceFor({ table: 'Factures', column: 'Inconnue' }, 'Factures') === null);
check('colonne en chemin (Ref.Colonne) : écartée', sourceFor({ table: 'Factures', column: 'Client.Nom' }, 'Factures') === null);

// Une autre table liée par une règle « match » qui peut trouver plusieurs lignes.
check('autre table liée par « match » sur une colonne : parcourue, sans colonne de liste', same(sourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures'), { table: 'Lignes', via: null }));
check('autre table liée par « match » sur l\'identifiant de ligne (une seule ligne) : écartée', sourceFor({ table: 'Clients', column: 'Nom' }, 'Factures') === null);
check('autre table liée sans « match » : écartée', sourceFor({ table: 'Taches', column: 'Nom' }, 'Factures') === null);
check('autre table sans règle : écartée', sourceFor({ table: 'Autre', column: 'Nom' }, 'Factures') === null);

check('attributs ou page absents : écarté', sourceFor(null, 'Factures') === null && sourceFor({ column: 'Lignes' }, 'Factures') === null
  && sourceFor({ table: 'Factures', column: 'Lignes' }, '') === null);

// === Une boucle dans une zone répétée (« les lignes de chaque facture ») : la zone englobante remplace la page ===
// Une table qui se rattache à la table de la zone par une colonne Référence : parcourue, sans règle de liaison à configurer.
check('zone de factures : les lignes se rattachent par Lignes.Facture, sans règle de liaison pour Lignes',
  same(sourceFor({ table: 'Lignes', column: 'Prix' }, 'Clients', 'Factures'), { table: 'Lignes', via: null, within: 'Factures', by: 'Facture', columns: ['Facture'] }) && RULES.Lignes !== undefined);
check('une table sans règle de liaison se rattache quand même (Seances n\'a pas de règle)', RULES.Seances === undefined
  && same(sourceFor({ table: 'Seances', column: 'Duree' }, 'Clients', 'Factures'), { table: 'Seances', via: null, within: 'Factures', by: 'Facture', columns: ['Facture', 'Facturee'] }));
check('deux colonnes Référence vers la table de la zone : toutes proposées, la première par défaut',
  sourceFor({ table: 'Seances', column: 'Duree' }, 'Clients', 'Factures').columns.length === 2);
check('colonne Liste de références de la table de la zone : les fiches qu\'elle désigne, lues dans la ligne de la zone',
  same(sourceFor({ table: 'Factures', column: 'Lignes' }, 'Clients', 'Factures'), { table: 'Lignes', via: { table: 'Factures', column: 'Lignes' } }));
check('liste de références de la zone vers sa propre table : écartée', sourceFor({ table: 'Factures', column: 'Soi' }, 'Clients', 'Factures') === null);
check('référence simple de la table de la zone (une seule fiche) : écartée', sourceFor({ table: 'Factures', column: 'Client' }, 'Clients', 'Factures') === null);
check('colonne ordinaire ou chemin de la table de la zone : écartés',
  sourceFor({ table: 'Factures', column: 'Nom' }, 'Clients', 'Factures') === null && sourceFor({ table: 'Factures', column: 'Client.Nom' }, 'Clients', 'Factures') === null);
check('table sans colonne Référence vers la table de la zone : écartée', sourceFor({ table: 'Clients', column: 'Nom' }, 'Clients', 'Factures') === null);
check('liste de références vers la table de la zone (Notes.Factures) : pas un rattachement, écartée', sourceFor({ table: 'Notes', column: 'Texte' }, 'Clients', 'Factures') === null);
check('table liée à la page par une règle (Lignes) mais sans colonne Référence vers la table de la zone (Options) : écartée dans la zone',
  RULES.Lignes !== undefined && sourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures', 'Options') === null);
check('zone en dehors d\'une zone (sans table englobante) : les règles de la page, comme avant',
  same(sourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures'), { table: 'Lignes', via: null }));
check('deux niveaux : dans une zone de lignes, les options se rattachent à la ligne (Options.Ligne) ou sont listées (Lignes.Options)',
  same(sourceFor({ table: 'Options', column: 'Nom' }, 'Clients', 'Lignes'), { table: 'Options', via: null, within: 'Lignes', by: 'Ligne', columns: ['Ligne'] })
  && same(sourceFor({ table: 'Lignes', column: 'Options' }, 'Clients', 'Lignes'), { table: 'Options', via: { table: 'Lignes', column: 'Options' } }));

// La forme enregistrée d'une boucle imbriquée.
const nested = { repeat: 'row', table: 'Lignes', within: 'Factures', by: 'Facture' };
check('boucle imbriquée : within et by sont gardés', same(plain(rules.normalizeLoop(nested)).within, 'Factures') && same(plain(rules.normalizeLoop(nested)).by, 'Facture'));
check('boucle ordinaire : ni within ni by', plain(rules.normalizeLoop({ repeat: 'row', table: 'Lignes' })).within === null && plain(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', by: 'Facture' })).by === null);
check('by sans within : écarté', plain(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', by: 'Facture' })).by === null);
check('within avec via : écarté (via nomme déjà la table de la zone)',
  plain(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', via: { table: 'Factures', column: 'Lignes' }, within: 'Factures', by: 'Facture' })).within === null);
check('within sans by : gardé (la colonne se déduit tant qu\'une seule mène à la table)', plain(rules.normalizeLoop({ repeat: 'item', table: 'Lignes', within: 'Factures' })).within === 'Factures');

// La colonne qui rattache : celle qui est enregistrée tant qu'elle mène encore à la table, sinon la seule qui y mène.
const column = loop => rules.nestedColumn(rules.normalizeLoop(loop));
check('colonne enregistrée valide : elle', column({ repeat: 'row', table: 'Seances', within: 'Factures', by: 'Facturee' }) === 'Facturee');
check('colonne enregistrée qui ne mène plus à la table : aucune', column({ repeat: 'row', table: 'Seances', within: 'Factures', by: 'Duree' }) === null);
check('aucune colonne enregistrée, une seule colonne qui y mène : elle', column({ repeat: 'row', table: 'Lignes', within: 'Factures' }) === 'Facture');
check('aucune colonne enregistrée, deux colonnes qui y mènent : aucune (le choix a été perdu)', column({ repeat: 'row', table: 'Seances', within: 'Factures' }) === null);
check('aucune colonne ne mène à la table : aucune', column({ repeat: 'row', table: 'Clients', within: 'Factures' }) === null);

// Où la boucle lit ses lignes : la page, ou la ligne de la zone qui l'entoure.
const page = { id: 1, Nom: 'page' };
const invoiceRow = { id: 7, Numero: 'F-7' };
const lineRow = { id: 9, Designation: 'L-9' };
const scope = (loop, rows) => plain(rules.scopeFor(rules.normalizeLoop(loop), rows, 'Clients', page));
check('boucle de la page : la page, même dans une zone', same(scope({ repeat: 'row', table: 'Factures' }, { Factures: invoiceRow }), { tableId: 'Clients', record: page }));
check('boucle de la page par une liste de références de la page : la page', same(scope({ repeat: 'row', table: 'Lignes', via: { table: 'Clients', column: 'Lignes' } }, { Factures: invoiceRow }), { tableId: 'Clients', record: page }));
check('boucle imbriquée : la ligne de la zone englobante', same(scope(nested, { Factures: invoiceRow }), { tableId: 'Factures', record: invoiceRow }));
check('boucle imbriquée par une liste de références : la ligne de la table de la liste',
  same(scope({ repeat: 'item', table: 'Options', via: { table: 'Lignes', column: 'Options' } }, { Factures: invoiceRow, Lignes: lineRow }), { tableId: 'Lignes', record: lineRow }));
check('boucle imbriquée sans la ligne de sa table (zone qui ne se déroule pas) : retombe sur la page', same(scope(nested, {}), { tableId: 'Clients', record: page })
  && same(scope(nested, null), { tableId: 'Clients', record: page }) && same(scope(nested, { Lignes: lineRow }), { tableId: 'Clients', record: page }));
check('boucle dont la table englobante est celle de la page : la page', same(plain(rules.scopeFor(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', within: 'Factures' }), { Factures: invoiceRow }, 'Factures', invoiceRow)), { tableId: 'Factures', record: invoiceRow }));
check('zone dans une zone de la même table que la page (liste de références vers soi-même) : la ligne de la zone, pas celle de la page',
  same(plain(rules.scopeFor(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', within: 'Factures' }), { Factures: invoiceRow }, 'Factures', page)), { tableId: 'Factures', record: invoiceRow }));
check('zone englobante d\'une boucle imbriquée : sa table, rien pour une boucle de la page',
  rules.enclosingOf(rules.normalizeLoop(nested), 'Clients') === 'Factures'
  && rules.enclosingOf(rules.normalizeLoop({ repeat: 'item', table: 'Options', via: { table: 'Lignes', column: 'Options' } }), 'Clients') === 'Lignes'
  && rules.enclosingOf(rules.normalizeLoop({ repeat: 'row', table: 'Lignes', via: { table: 'Clients', column: 'Lignes' } }), 'Clients') === null
  && rules.enclosingOf(rules.normalizeLoop({ repeat: 'row', table: 'Factures' }), 'Clients') === null);
check('table englobante d\'une boucle', rules.parentTable(rules.normalizeLoop(nested)) === 'Factures'
  && rules.parentTable(rules.normalizeLoop({ repeat: 'item', table: 'Options', via: { table: 'Lignes', column: 'Options' } })) === 'Lignes'
  && rules.parentTable(rules.normalizeLoop({ repeat: 'row', table: 'Lignes' })) === null);

// === Toutes les lignes d'une table : la table de la bulle, sans règle de liaison ni lien avec la ligne de la page ===
const allSourceFor = (attrs, page, enclosing) => JSON.parse(JSON.stringify(rules.allSourceFor(attrs, page, enclosing)));
check('toutes les lignes, table de la page : la vue Grist du widget (son filtre et son tri)',
  same(allSourceFor({ table: 'Factures', column: 'Nom' }, 'Factures'), { table: 'Factures', via: null, all: 'view' }));
check('toutes les lignes, autre table liée par « match » : toute la table',
  same(allSourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures'), { table: 'Lignes', via: null, all: 'table' }));
check('toutes les lignes, autre table liée par une règle d\'une seule ligne, ou par « match » sur l\'identifiant : toute la table (la boucle liée y est grisée)',
  same(allSourceFor({ table: 'Taches', column: 'Nom' }, 'Factures'), { table: 'Taches', via: null, all: 'table' })
  && same(allSourceFor({ table: 'Clients', column: 'Nom' }, 'Factures'), { table: 'Clients', via: null, all: 'table' }) && sourceFor({ table: 'Clients', column: 'Nom' }, 'Factures') === null);
check('toutes les lignes, autre table sans règle de liaison : toute la table', same(allSourceFor({ table: 'Autre', column: 'Nom' }, 'Factures'), { table: 'Autre', via: null, all: 'table' }));
check('toutes les lignes : quelle que soit la colonne (ordinaire, liste de références, référence, chemin), c\'est la table de la bulle qui est parcourue',
  ['Nom', 'Lignes', 'Client', 'Client.Nom', 'Inconnue'].every(column => same(allSourceFor({ table: 'Factures', column }, 'Factures'), { table: 'Factures', via: null, all: 'view' })));
check('toutes les lignes, dans une zone répétée par une autre bulle : aucune (la zone suit la ligne de celle qui l\'entoure)',
  allSourceFor({ table: 'Clients', column: 'Nom' }, 'Factures', 'Lignes') === null && allSourceFor({ table: 'Factures', column: 'Nom' }, 'Factures', 'Factures') === null);
check('toutes les lignes : sans attributs, table, colonne ou page, aucune',
  allSourceFor(null, 'Factures') === null && allSourceFor({ column: 'Nom' }, 'Factures') === null && allSourceFor({ table: 'Factures' }, 'Factures') === null
  && allSourceFor({ table: 'Factures', column: 'Nom' }, '') === null);
check('les lignes rattachées et toutes les lignes se proposent ensemble pour une table liée : deux sources, deux tables possibles',
  rules.sourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures') !== null && rules.allSourceFor({ table: 'Lignes', column: 'Prix' }, 'Factures') !== null
  && same(sourceFor({ table: 'Factures', column: 'Lignes' }, 'Factures').table, 'Lignes') && same(allSourceFor({ table: 'Factures', column: 'Lignes' }, 'Factures').table, 'Factures'));

// La forme enregistrée : `all` ne vaut que sans via ni within.
const allOf = loop => plain(rules.normalizeLoop(loop)).all;
check('boucle sur toutes les lignes : « view », « table » et « linked » (la vue d\'à côté) gardés, tout autre mot écarté, absent : null',
  allOf({ repeat: 'row', table: 'Factures', all: 'view' }) === 'view' && allOf({ repeat: 'row', table: 'Lignes', all: 'table' }) === 'table'
  && allOf({ repeat: 'row', table: 'Factures', all: 'linked' }) === 'linked'
  && allOf({ repeat: 'row', table: 'Factures', all: 'tout' }) === null && allOf({ repeat: 'row', table: 'Factures', all: 'lié' }) === null
  && allOf({ repeat: 'row', table: 'Factures', all: true }) === null && allOf({ repeat: 'row', table: 'Factures' }) === null);
check('boucle sur toutes les lignes avec une colonne de liste ou une zone englobante : la source la plus ancienne l\'emporte, `all` est écarté',
  allOf({ repeat: 'row', table: 'Lignes', all: 'table', via: { table: 'Factures', column: 'Lignes' } }) === null
  && allOf({ repeat: 'row', table: 'Lignes', all: 'table', within: 'Factures' }) === null
  && allOf({ repeat: 'row', table: 'Lignes', all: 'linked', via: { table: 'Factures', column: 'Lignes' } }) === null
  && allOf({ repeat: 'row', table: 'Lignes', all: 'linked', within: 'Factures' }) === null);
check('boucle sur la vue d\'à côté : le reste de la boucle se lit comme pour les autres lignes',
  same(plain(rules.normalizeLoop({ repeat: 'row', table: 'Factures', all: 'linked', sort: { column: 'Nom', direction: 'desc' } })),
    { repeat: 'row', table: 'Factures', via: null, within: null, by: null, all: 'linked', filter: null, sort: { column: 'Nom', direction: 'desc' }, empty: 'header', emptyText: '', separator: ', ', lastSeparator: null }));
check('boucle sur toutes les lignes : le reste de la boucle (répétition, filtre, tri, si aucune ligne) est lu comme pour les lignes rattachées',
  same(plain(rules.normalizeLoop({ repeat: 'item', table: 'Lignes', all: 'table', sort: { column: 'Prix', direction: 'desc' }, empty: 'text', emptyText: 'Rien' })),
    { repeat: 'item', table: 'Lignes', via: null, within: null, by: null, all: 'table', filter: null, sort: { column: 'Prix', direction: 'desc' }, empty: 'text', emptyText: 'Rien', separator: ', ', lastSeparator: null }));

// === Pourquoi une boucle ne trouve aucune ligne : le diagnostic de linkedItems, que l'éditeur lit sans rien charger (VariableLoop.feedsAt) ===
const failure = (loop, tableId) => rules.sourceError(rules.normalizeLoop(loop), tableId);
check('source perdue : table liée par une règle, aucune erreur ; table sans règle, « noLink »',
  failure({ repeat: 'row', table: 'Lignes' }, 'Factures') === null && failure({ repeat: 'row', table: 'Autre' }, 'Factures') === 'noLink');
check('source perdue : liste de références de la table de la portée, aucune erreur ; d\'une autre table, « via »',
  failure({ repeat: 'row', table: 'Lignes', via: { table: 'Factures', column: 'Lignes' } }, 'Factures') === null
  && failure({ repeat: 'row', table: 'Lignes', via: { table: 'Clients', column: 'Lignes' } }, 'Factures') === 'via');
check('source perdue : boucle imbriquée, aucune erreur dans la table englobante quand une colonne la rattache ; « within » dans une autre portée (zone qui ne se déroule pas : la page) ou sans colonne',
  failure({ repeat: 'item', table: 'Lignes', within: 'Factures' }, 'Factures') === null
  && failure({ repeat: 'item', table: 'Lignes', within: 'Factures' }, 'Clients') === 'within'
  && failure({ repeat: 'item', table: 'Seances', within: 'Factures' }, 'Factures') === 'within'
  && failure({ repeat: 'item', table: 'Lignes', within: 'Factures', by: 'Duree' }, 'Factures') === 'within');
check('source perdue : une boucle sur toutes les lignes n\'en manque jamais, même sans règle ni lien',
  failure({ repeat: 'row', table: 'Autre', all: 'table' }, 'Factures') === null && failure({ repeat: 'inline', table: 'Factures', all: 'view' }, 'Clients') === null);
// Le diagnostic est celui que rend la lecture : iterate rend la même erreur avant de lire la moindre table.
const iterateError = async (loop, tableId) => (await rules.iterate(rules.normalizeLoop(loop), tableId, page, rules.createContext())).error || null;
const cases = [
  [{ repeat: 'row', table: 'Autre' }, 'Factures'],
  [{ repeat: 'row', table: 'Lignes', via: { table: 'Clients', column: 'Lignes' } }, 'Factures'],
  [{ repeat: 'item', table: 'Lignes', within: 'Factures' }, 'Clients'],
  [{ repeat: 'item', table: 'Seances', within: 'Factures' }, 'Factures'],
];
const sameDiagnosis = [];
for (const [loop, tableId] of cases) sameDiagnosis.push((await iterateError(loop, tableId)) === failure(loop, tableId) && failure(loop, tableId) !== null);
check('source perdue : iterate rend la même erreur (noLink, via, within, within sans colonne)', sameDiagnosis.every(Boolean));

// === Une boucle sur toutes les lignes : celles du widget, celles de la vue d'à côté (`all: 'linked'`) ou toute la table ===
// Tout est simulé : la table, ce que le widget montre (`viewRowIds`) et ce que la vue d'à côté dit (`linkedRows`, js/view-source.js, essayé à part).
const FACTURES = [1, 2, 3, 4, 5, 6].map(id => ({ id, Nom: 'F' + id }));
const OWN = [5, 4, 3, 2, 1]; // le widget cache la ligne 6 et montre les autres à l'envers
const LINKED_IDS = [4, 6, 2, 1]; // la vue d'à côté : son ordre, la ligne 6 que le widget ne montre pas, la ligne 3 et 5 qu'elle filtre
const spied = { fetch: 0, view: 0, linked: 0 };
const context = ({ own = OWN, linked = { name: 'Clients de Lyon', ids: LINKED_IDS } } = {}) => {
  const c = rules.createContext();
  c.fetchRows = async () => { spied.fetch++; return FACTURES; };
  c.viewRowIds = async () => { spied.view++; return own; };
  c.linkedRows = async () => { spied.linked++; return linked; };
  return c;
};
const run = async (loop, c) => {
  const result = await rules.iterate(rules.normalizeLoop(Object.assign({ repeat: 'row', table: 'Factures' }, loop)), 'Factures', page, c || context());
  return { ids: result.items.map(item => item.row.id), total: result.total, tableTotal: result.tableTotal, linked: result.linked, error: result.error };
};
const stats = () => JSON.stringify(spied);
const reset = () => { spied.fetch = 0; spied.view = 0; spied.linked = 0; };

reset();
const ownRun = await run({ all: 'view' });
check('toutes les lignes, celles du widget : son ordre et son filtre, la vue d\'à côté n\'est pas lue, rien de plus dans le résultat',
  same(ownRun.ids, OWN) && ownRun.total === 5 && ownRun.tableTotal === 6 && ownRun.linked === undefined && spied.linked === 0, stats());
reset();
const tableRun = await run({ all: 'table' });
check('toute la table : l\'ordre de la table, ni la vue du widget ni celle d\'à côté ne sont lues',
  same(tableRun.ids, [1, 2, 3, 4, 5, 6]) && tableRun.total === 6 && tableRun.linked === undefined && spied.view === 0 && spied.linked === 0, stats());
reset();
const linkedRun = await run({ all: 'linked' });
check('la vue d\'à côté : ses lignes dans SON ordre, moins celle que le widget ne montre pas ; la table en compte 6, la vue 3, son nom est rendu',
  same(linkedRun.ids, [4, 2, 1]) && linkedRun.total === 3 && linkedRun.tableTotal === 6 && same(linkedRun.linked, { name: 'Clients de Lyon' }), JSON.stringify(linkedRun));
ctx.Variables = { cellValue: (table, column, row) => row[column] }; // le tri lit la valeur affichée de la cellule
ctx.I18n = { getLang: () => 'fr' }; // et compare selon la langue
check('la vue d\'à côté : le tri de la boucle passe après, comme pour toute autre source',
  same((await run({ all: 'linked', sort: { column: 'Nom', direction: 'asc' } })).ids, [1, 2, 4]) && same((await run({ all: 'linked', sort: { column: 'Nom', direction: 'desc' } })).ids, [4, 2, 1]));
check('la vue d\'à côté, widget qui ne dit pas ce qu\'il montre (aucune ligne connue) : toutes les lignes de la vue d\'à côté, dans son ordre',
  same((await run({ all: 'linked' }, context({ own: null }))).ids, LINKED_IDS));
check('la vue d\'à côté qui ne montre aucune ligne : aucune ligne (rien n\'est repris du widget), sa lecture est dite bonne',
  same(await run({ all: 'linked' }, context({ linked: { name: 'Vide', ids: [] } })), { ids: [], total: 0, tableTotal: 6, linked: { name: 'Vide' }, error: undefined }));
const unreadable = await run({ all: 'linked' }, context({ linked: { name: 'Clients de Lyon', unreadable: 'relative' } }));
check('la vue d\'à côté qui ne se lit pas (dates relatives) : les lignes du widget dans son ordre, et le résultat dit pourquoi',
  same(unreadable.ids, OWN) && same(unreadable.linked, { name: 'Clients de Lyon', unreadable: 'relative' }), JSON.stringify(unreadable));
check('la vue d\'à côté qui ne se lit pas : chaque raison (upstream, ambiguous) est rendue telle quelle',
  same((await run({ all: 'linked' }, context({ linked: { name: 'X', unreadable: 'upstream' } }))).linked, { name: 'X', unreadable: 'upstream' })
  && same((await run({ all: 'linked' }, context({ linked: { unreadable: 'ambiguous' } }))).linked, { name: undefined, unreadable: 'ambiguous' }));
const absent = await run({ all: 'linked' }, context({ linked: null }));
check('plus aucune vue reliée : les lignes du widget dans son ordre, le résultat dit « absent » (jamais toute la table en silence)',
  same(absent.ids, OWN) && same(absent.linked, { absent: true }), JSON.stringify(absent));
const absentNoView = await run({ all: 'linked' }, context({ own: null, linked: null }));
check('plus aucune vue reliée, et la vue du widget inconnue : toute la table, dans l\'ordre de la table, avec « absent »',
  same(absentNoView.ids, [1, 2, 3, 4, 5, 6]) && same(absentNoView.linked, { absent: true }), JSON.stringify(absentNoView));

// Un rendu lit la vue d'à côté une fois par table : plusieurs boucles de la même fiche ne la relisent pas, un autre rendu la relit.
let reads = 0;
ctx.ViewSource = { linkedRows: async (table, rows) => { reads++; return { name: 'Lue ' + reads + ' sur ' + table + ' (' + rows.length + ' lignes)', ids: [2, 1] }; } };
const shared = rules.createContext();
shared.fetchRows = async () => FACTURES;
shared.viewRowIds = async () => OWN;
const first = await run({ all: 'linked' }, shared);
const second = await run({ all: 'linked', repeat: 'item' }, shared);
check('la vue d\'à côté est lue une seule fois par rendu et par table (ViewSource.linkedRows reçoit les lignes de la table)',
  reads === 1 && same(first.ids, [2, 1]) && same(second.ids, [2, 1]) && first.linked.name === 'Lue 1 sur Factures (6 lignes)' && second.linked.name === first.linked.name, JSON.stringify([reads, first.linked, second.linked]));
const other = await run({ all: 'linked' }, (() => { const c = rules.createContext(); c.fetchRows = async () => FACTURES; c.viewRowIds = async () => OWN; return c; })());
check('un autre rendu relit la vue d\'à côté (un filtre enregistré entre-temps se retrouve)', reads === 2 && other.linked.name.startsWith('Lue 2'), JSON.stringify([reads, other.linked]));
reads = 0;
const widgetOnly = rules.createContext();
widgetOnly.fetchRows = async () => FACTURES;
widgetOnly.viewRowIds = async () => OWN;
await run({ all: 'view' }, widgetOnly);
await run({ all: 'table' }, widgetOnly);
check('une boucle sur les lignes du widget ou sur toute la table ne lit jamais la vue d\'à côté', reads === 0);
const aside = rules.createContext();
aside.fetchRows = async () => FACTURES;
aside.viewRowIds = async () => OWN;
const before = aside.readsAll;
await run({ all: 'linked' }, aside);
check('une boucle sur la vue d\'à côté est signalée au contexte comme les autres boucles sur toutes les lignes (la Lecture se redessine quand les lignes de la vue changent)',
  before === false && aside.readsAll === true);

summarizeAndExit();
