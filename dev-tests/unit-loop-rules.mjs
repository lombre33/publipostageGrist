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

summarizeAndExit();
