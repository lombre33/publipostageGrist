#!/usr/bin/env node
// Tests purs (sans navigateur) de ce que l'hôte donne au module graphique du kit - extensions/graphique/chart-host.js (ChartHostSource), cf. dev-tests/unit-harness.mjs pour le contexte général.
// Le module que Grist BI écrit ne parle jamais à Grist : il demande `source.charger(table)` et reçoit { colonnes, lignes }. Ce que Publipostage+ doit lui donner, et que ces essais fixent :
//  - les colonnes avec LE TYPE QUE GRIST LEUR DONNE (Grist BI le devinait de la première valeur non vide : une date en secondes passait pour un nombre) et leur genre, y compris celui d'une Référence
//    (la colonne qu'elle montre), d'une liste et d'une colonne à formule sans type ;
//  - les lignes prêtes à tracer : la valeur que Grist MONTRE (jamais l'identifiant de la ligne liée), les dates en texte (le jour, ou le jour et l'heure du mur dans le fuseau de la colonne), les listes
//    en tableaux, null pour une cellule en erreur, en attente, vide ou qui n'est pas du type de sa colonne (jamais 0), dans l'ordre de la table dans Grist, sans modifier les lignes lues ;
//  - la portée : toute la table, ou les lignes liées à la ligne du document (une source par destinataire), l'erreur de liaison dite telle quelle, une table sans lien « non accessible » ;
//  - le branchement sur GristAPI et Variables avec les bons arguments (et les noms que ces modules exportent vraiment) ;
//  - le remappage des colonnes : par identifiant, puis par libellé sans accents ni casse, jamais une colonne qui ne peut pas porter le genre demandé, jamais un choix entre deux.
// Lancer : node dev-tests/unit-chart-host.mjs
import { readFileSync } from 'node:fs';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const json = value => JSON.stringify(value);
const same = (a, b) => json(a) === json(b);

// Un faux document : des tables, leurs colonnes (type, libellé, colonne d'affichage, réglages), leurs lignes brutes comme `fetchTable` les donne.
const SEC = iso => Date.parse(iso) / 1000;
const DOC = {
  Commandes: {
    columns: {
      Client: { type: 'Ref:Clients', label: 'Client', display: 'gristHelper_Display' },
      Montant: { type: 'Numeric', label: 'Montant HT', format: { numMode: 'currency', currency: 'EUR', decimals: 2 } },
      Quantite: { type: 'Int', label: '' },
      Statut: { type: 'Choice', label: 'Statut' },
      Etiquettes: { type: 'ChoiceList', label: 'Étiquettes' },
      Le: { type: 'Date', label: 'Date d’envoi', format: {} },
      A: { type: 'DateTime:Europe/Paris', label: 'Horodatage' },
      Payee: { type: 'Bool', label: 'Payée' },
      Calcul: { type: 'Any', label: 'Calcul' },
      Pieces: { type: 'Attachments', label: 'Pièces' },
      Equipe: { type: 'RefList:Clients', label: 'Équipe', display: 'gristHelper_Display2' },
      Region: { type: 'Ref:Regions', label: 'Région' },
      Cible: { type: 'Ref:Clients', label: 'Cible', display: 'gristHelper_Display3' },
      gristHelper_Display: { type: 'Text' }, gristHelper_Display2: { type: 'Any' }, gristHelper_Display3: { type: 'Numeric' },
    },
    visible: ['Client', 'Montant', 'Quantite', 'Statut', 'Etiquettes', 'Le', 'A', 'Payee', 'Calcul', 'Pieces', 'Equipe', 'Region', 'Cible'],
    rows: [
      { id: 3, manualSort: 3, Client: 2, gristHelper_Display: 'Durand', Montant: 120.5, Quantite: 2, Statut: 'Payée', Etiquettes: ['L', 'a', 'b'], Le: SEC('2026-03-01T00:00:00Z'), A: SEC('2026-01-15T23:30:00Z'), Payee: true, Calcul: 7, Pieces: ['L', 4], Equipe: ['L', 1, 2], gristHelper_Display2: ['L', 'Martin', 'Durand'], Region: 5, Cible: 2, gristHelper_Display3: 42 },
      { id: 1, manualSort: 1, Client: 0, gristHelper_Display: '', Montant: 'abc', Quantite: null, Statut: '', Etiquettes: null, Le: 0, A: 0, Payee: false, Calcul: ['E', 'ZeroDivisionError'], Pieces: null, Equipe: null, gristHelper_Display2: null, Region: 0, Cible: 0, gristHelper_Display3: 0 },
      { id: 2, manualSort: 2, Client: 1, gristHelper_Display: 'Martin', Montant: ['E', 'ValueError'], Quantite: 5, Statut: 'En attente', Etiquettes: ['L'], Le: SEC('2026-02-10T00:00:00Z'), A: SEC('2026-07-01T10:00:00Z'), Payee: 'oui', Calcul: 'texte', Pieces: null, Equipe: ['L', 1], gristHelper_Display2: ['L', ['d', SEC('2026-02-10T00:00:00Z')]], Region: 8, Cible: 1, gristHelper_Display3: 17 },
    ],
  },
  Clients: {
    columns: { Nom: { type: 'Text', label: 'Nom' } }, visible: ['Nom'],
    rows: [{ id: 1, manualSort: 1, Nom: 'Martin' }, { id: 2, manualSort: 2, Nom: 'Durand' }],
  },
  Factures: {
    columns: { Numero: { type: 'Text', label: 'Numéro' }, Commande: { type: 'Ref:Commandes', label: 'Commande' } }, visible: ['Numero', 'Commande'],
    rows: [{ id: 1, manualSort: 1, Numero: 'F1', Commande: 3 }, { id: 2, manualSort: 2, Numero: 'F2', Commande: 3 }, { id: 3, manualSort: 3, Numero: 'F3', Commande: 1 }],
  },
  Isolee: { columns: { Note: { type: 'Text', label: 'Note' } }, visible: ['Note'], rows: [{ id: 1, manualSort: 1, Note: 'x' }] },
  // Les tables que Grist BI crée pour lui-même : sa configuration (une ligne par table de travail), ses commentaires, sa sonde d'utilisateur.
  BI_Dashboard_Config: {
    columns: { TableId: { type: 'Text', label: 'TableId' }, ConfigJSON: { type: 'Text', label: 'ConfigJSON' } }, visible: ['TableId', 'ConfigJSON'],
    rows: [
      { id: 1, manualSort: 1, TableId: 'Commandes', ConfigJSON: '{"pages":[{"id":"p1","name":"Ventes","tiles":[]}]}' },
      { id: 2, manualSort: 2, TableId: 'Disparue', ConfigJSON: '[{"id":"t1"}]' },
      { id: 3, manualSort: 3, TableId: 'Clients', ConfigJSON: '' },
      { id: 4, manualSort: 4, TableId: 'Clients', ConfigJSON: '{"tiles":[{"id":"x\\"><img src=x onerror=alert(1)>"}]}' },
      { id: 5, manualSort: 5, TableId: null, ConfigJSON: null },
    ],
  },
  BI_Dashboard_Comments: { columns: { Text: { type: 'Text', label: 'Text' } }, visible: ['Text'], rows: [] },
};
const rowsCopy = table => DOC[table].rows.map(row => Object.assign({}, row));

const calls = [];
const fakeGristApi = {
  getTables: () => Object.keys(DOC),
  getVisibleColumns: table => DOC[table].visible.slice(),
  getColumnType: (table, col) => (DOC[table].columns[col] || {}).type || null,
  getColumnLabel: (table, col) => (DOC[table].columns[col] || {}).label || '',
  getDisplayColumn: (table, col) => (DOC[table].columns[col] || {}).display || null,
  getColumnFormatOptions: (table, col) => (DOC[table].columns[col] || {}).format || null,
  getDocumentSettings: () => ({ locale: 'fr-FR', currency: 'EUR' }),
  fetchTableRows: async (table) => { calls.push(['fetchTableRows', table]); return rowsCopy(table); },
  getLinkRule: (table, tableId) => { calls.push(['getLinkRule', table, tableId]); return table === 'Factures' && tableId === 'Commandes' ? { mode: 'match' } : null; },
  findReferenceColumns: async (tableId, table) => { calls.push(['findReferenceColumns', tableId, table]); return tableId === 'Commandes' && table === 'Clients' ? ['Client'] : []; },
};
const fakeVariables = {
  resolveRows: async (table, hops, tableId, record) => {
    calls.push(['resolveRows', table, hops.length, tableId, record && record.id]);
    if (!record) return { table, rows: [], multi: false };
    if (table === tableId) return { table, rows: [rowsCopy(table).find(row => row.id === record.id) || null], multi: false };
    if (table === 'Factures') return { table, rows: rowsCopy('Factures').filter(row => row.Commande === record.id).concat([null]), multi: true };
    return { error: 'Aucune règle de liaison pour ' + table };
  },
};
const context = createContext({
  I18n: { t: (key, vars) => key + (vars ? json(vars) : '') },
  GristAPI: fakeGristApi,
  Variables: fakeVariables,
});
loadScript(context, 'js/view-source.js');
loadScript(context, 'extensions/graphique/chart-host.js');
context.__doc = DOC;
const run = expression => evalIn(context, expression);
const plain = value => JSON.parse(JSON.stringify(value));

console.log('Les genres : ce que Grist dit de la colonne');
{
  const genres = plain(run(`['Text', 'Choice', 'Numeric', 'Int', 'Bool', 'Date', 'DateTime:Europe/Paris', 'ChoiceList', 'RefList:Clients', 'Attachments', 'Any', 'Ref:Clients', ''].map(type => ChartHostSource.genreOf(type))`));
  check('texte, choix, nombre, entier, booléen, date, date et heure, listes, pièces jointes, sans type, ni connu', same(genres, ['text', 'text', 'number', 'number', 'bool', 'date', 'date', 'list', 'list', 'other', 'any', 'any', 'any']), json(genres));
}

console.log('Les colonnes d\'une table');
const all = run('ChartHostSource.make({ scope: "all" })');
const orders = await all;
const loaded = plain(await orders.charger('Commandes'));
const byId = Object.fromEntries(loaded.colonnes.map(colonne => [colonne.id, colonne]));
{
  check('les colonnes visibles, dans l\'ordre de la table, sans colonne d\'aide ni identifiant', same(loaded.colonnes.map(colonne => colonne.id), DOC.Commandes.visible), loaded.colonnes.map(colonne => colonne.id).join(','));
  check('le libellé de Grist, à défaut l\'identifiant', byId.Montant.libelle === 'Montant HT' && byId.Quantite.libelle === 'Quantite' && byId.Le.libelle === 'Date d’envoi');
  check('le type de Grist est gardé tel quel (la date et heure garde son fuseau, la Référence sa table)', byId.A.type === 'DateTime:Europe/Paris' && byId.Client.type === 'Ref:Clients' && byId.Equipe.type === 'RefList:Clients');
  check('le genre : nombre pour un nombre et un entier, date pour une date et une date et heure, bool, texte, liste, pièces jointes « other », colonne à formule sans type « any »',
    byId.Montant.genre === 'number' && byId.Quantite.genre === 'number' && byId.Le.genre === 'date' && byId.A.genre === 'date' && byId.Payee.genre === 'bool' && byId.Statut.genre === 'text' && byId.Etiquettes.genre === 'list' && byId.Pieces.genre === 'other' && byId.Calcul.genre === 'any');
  check('une Référence prend le genre de la colonne qu\'elle montre : du texte ; un nombre quand elle en montre un ; sans colonne montrée, une étiquette (l\'identifiant de la ligne liée n\'est pas une mesure)', byId.Client.genre === 'text' && byId.Cible.genre === 'number' && byId.Region.genre === 'text');
  check('une liste dit le genre de ses éléments (texte pour les choix, celui de la colonne montrée pour une liste de références)', byId.Etiquettes.element === 'text' && byId.Equipe.element === 'any' && byId.Montant.element === undefined);
  check('les réglages d\'affichage de la colonne (devise, décimales) passent ; une colonne qui n\'en a pas, ou dont les réglages sont vides, n\'en a pas (null)', same(byId.Montant.format, { numMode: 'currency', currency: 'EUR', decimals: 2 }) && byId.Le.format === null && byId.Statut.format === null);
}

console.log('Les lignes : la valeur que Grist montre');
{
  const lines = Object.fromEntries(loaded.lignes.map(line => [line.id, line]));
  check('l\'ordre de la table dans Grist (manualSort), pas celui de la lecture', same(loaded.lignes.map(line => line.id), [1, 2, 3]), loaded.lignes.map(line => line.id).join(','));
  check('une Référence porte la valeur montrée, jamais l\'identifiant de la ligne liée', lines[3].Client === 'Durand' && lines[2].Client === 'Martin');
  check('une Référence vide (0) ne montre rien, même quand la colonne montrée rend 0 pour un nombre ; une montrée de 0 réel vaut 0', lines[1].Client === null && lines[1].Cible === null && lines[3].Cible === 42 && lines[2].Cible === 17);
  check('une Référence sans colonne montrée : l\'identifiant en texte, vide = null', lines[3].Region === '5' && lines[1].Region === null);
  check('un nombre est un nombre : le texte d\'un nombre, une erreur de formule, du texte dans la colonne : null (jamais 0)', lines[3].Montant === 120.5 && lines[1].Montant === null && lines[2].Montant === null && lines[1].Quantite === null);
  check('une date en secondes devient AAAA-MM-JJ ; 0 est une case vide', lines[3].Le === '2026-03-01' && lines[2].Le === '2026-02-10' && lines[1].Le === null);
  check('une date et heure : l\'heure du mur dans le fuseau de la colonne (23:30 UTC en janvier = 00:30 le lendemain à Paris ; 10:00 UTC en juillet = 12:00 à Paris)', lines[3].A === '2026-01-16T00:30:00' && lines[2].A === '2026-07-01T12:00:00' && lines[1].A === null, json([lines[3].A, lines[2].A]));
  check('un booléen n\'est que vrai ou faux : « oui » dans une colonne booléenne : null', lines[3].Payee === true && lines[1].Payee === false && lines[2].Payee === null);
  check('une liste ["L", …] devient un tableau, une cellule vide null, une liste vide []', same(lines[3].Etiquettes, ['a', 'b']) && lines[1].Etiquettes === null && same(lines[2].Etiquettes, []));
  check('une liste de références porte les valeurs montrées ; une date montrée sous son étiquette ["d", secondes] devient son jour', same(lines[3].Equipe, ['Martin', 'Durand']) && same(lines[2].Equipe, ['2026-02-10']) && lines[1].Equipe === null, json(lines[2].Equipe));
  check('une colonne à formule sans type : nombres et textes passent, une erreur est null', lines[3].Calcul === 7 && lines[2].Calcul === 'texte' && lines[1].Calcul === null);
  check('une pièce jointe ne se trace pas : null', loaded.lignes.every(line => line.Pieces === null));
  check('chaque ligne porte son identifiant, et rien d\'autre que ses colonnes visibles', loaded.lignes.every(line => same(Object.keys(line), ['id'].concat(DOC.Commandes.visible))));
  check('les lignes lues ne sont pas modifiées (la lecture est partagée par la passe de rendu)', same(DOC.Commandes.rows.map(row => row.id), [3, 1, 2]) && DOC.Commandes.rows[0].Client === 2);
}

console.log('La source : tables et portée');
{
  const names = plain(orders.tables);
  check('toutes les tables du document, accessibles en portée « all » (libellé = identifiant)', same(names, [{ id: 'Commandes', libelle: 'Commandes', accessible: true }, { id: 'Clients', libelle: 'Clients', accessible: true }, { id: 'Factures', libelle: 'Factures', accessible: true }, { id: 'Isolee', libelle: 'Isolee', accessible: true }]), json(names));
  check('les tables que Grist BI crée pour lui-même (configuration, commentaires, sonde) ne sont jamais des données à tracer : ni dans la liste, ni lisibles par `charger`',
    !names.some(table => /^BI_Dashboard_/.test(table.id)) && await orders.charger('BI_Dashboard_Config').then(() => false, error => /chart\.host\.noTable/.test(error.message)));
  check('les réglages du document (langue et devise) accompagnent la source', same(plain(orders.reglages), { locale: 'fr-FR', currency: 'EUR' }) && orders.scope === 'all');
  check('une table que le document n\'a pas : le message dit laquelle', await orders.charger('Fantome').then(() => false, error => /chart\.host\.noTable/.test(error.message) && /Fantome/.test(error.message)));
  const factures = plain(await orders.charger('Factures'));
  check('toute la table en portée « all » : les trois factures', same(factures.lignes.map(line => line.Numero), ['F1', 'F2', 'F3']) && factures.lignes[0].Commande === '3', json(factures.lignes[0]));
}
{
  const record = { id: 3 };
  const linked = await run('ChartHostSource.make({ scope: "linked", tableId: "Commandes", record: { id: 3 } })');
  check('en portée « linked » : la table du document, une table liée par une règle, une table que la colonne Référence du document atteint sont accessibles ; une table sans lien ne l\'est pas',
    same(plain(linked.tables).map(table => [table.id, table.accessible]), [['Commandes', true], ['Clients', true], ['Factures', true], ['Isolee', false]]), json(plain(linked.tables)));
  const own = plain(await linked.charger('Commandes'));
  check('la table du document : la seule ligne du document', same(own.lignes.map(line => line.id), [3]) && own.lignes[0].Client === 'Durand');
  const bills = plain(await linked.charger('Factures'));
  check('une table liée : les lignes que trouve la règle de liaison pour cette ligne (les deux factures de la commande 3, une ligne vide écartée)', same(bills.lignes.map(line => line.Numero), ['F1', 'F2']), json(bills.lignes));
  check('l\'erreur de liaison est dite telle quelle (une table sans règle ni Référence)', await linked.charger('Isolee').then(() => false, error => error.message === 'Aucune règle de liaison pour Isolee'));
  const other = await run('ChartHostSource.make({ scope: "linked", tableId: "Commandes", record: { id: 1 } })');
  check('une source par destinataire : la même table, d\'autres lignes', same(plain(await other.charger('Factures')).lignes.map(line => line.Numero), ['F3']));
  const none = await run('ChartHostSource.make({ scope: "linked", tableId: "Commandes" })');
  check('sans ligne de document, une table liée n\'a aucune ligne (comme une bulle)', same(plain(await none.charger('Factures')).lignes, []) && same(plain(await none.charger('Commandes')).lignes, []));
  const without = await run('ChartHostSource.make({ scope: "linked" })');
  check('sans table de document, aucune table n\'est accessible en portée « linked »', plain(without.tables).every(table => table.accessible === false));
  check('la portée inconnue est « all »', (await run('ChartHostSource.make({ scope: "nimporte" })')).scope === 'all' && (await run('ChartHostSource.make()')).scope === 'all');
  void record;
}

console.log('Le branchement sur GristAPI et Variables');
{
  calls.length = 0;
  const linked = await run('ChartHostSource.make({ scope: "linked", tableId: "Commandes", record: { id: 3 } })');
  await linked.charger('Factures');
  check('la règle de liaison est demandée (table lue, table du document) puis les lignes par Variables.resolveRows(table, [], tableDuDocument, ligne)', calls.some(call => json(call) === json(['getLinkRule', 'Factures', 'Commandes'])) && calls.some(call => json(call) === json(['resolveRows', 'Factures', 0, 'Commandes', 3])), json(calls));
  check('la colonne Référence du document est cherchée (table du document, table lue)', calls.some(call => json(call) === json(['findReferenceColumns', 'Commandes', 'Clients'])));
  calls.length = 0;
  await (await run('ChartHostSource.make({ scope: "all" })')).charger('Clients');
  check('en portée « all » : la lecture partagée de GristAPI, rien d\'autre', same(calls, [['fetchTableRows', 'Clients']]), json(calls));
  const grist = readFileSync(new URL('../js/grist-api.js', import.meta.url), 'utf8');
  const variables = readFileSync(new URL('../js/variables.js', import.meta.url), 'utf8');
  const exportedBy = (code, anchor) => (code.slice(code.lastIndexOf(anchor)).match(/\{[^}]*\}/) || [''])[0];
  const gristExports = exportedBy(grist, '  return { init,');
  const used = ['getTables', 'getVisibleColumns', 'getColumnType', 'getColumnLabel', 'getDisplayColumn', 'getColumnFormatOptions', 'getDocumentSettings', 'fetchTableRows', 'getLinkRule', 'findReferenceColumns'];
  check('chaque fonction de GristAPI que l\'hôte appelle est bien exportée par js/grist-api.js', used.every(name => new RegExp('\\b' + name + '\\b').test(gristExports)), used.filter(name => !new RegExp('\\b' + name + '\\b').test(gristExports)).join(','));
  check('Variables.resolveRows est exportée par js/variables.js', /\bresolveRows\b/.test(variables.slice(variables.lastIndexOf('resolveLinkedRows, resolveRows'))));
}

console.log('Les rapports de Grist BI');
{
  const found = plain(await run('ChartHostSource.reports()'));
  check('la table des rapports est lue ; une ligne sans texte de configuration (vide, null) n\'est pas un rapport', found.available === true && same(found.rows.map(row => row.id), [1, 2, 4]), json(found.rows.map(row => row.id)));
  check('chaque rapport : sa table de travail et si le document l\'a encore (une table disparue le dit)', same(found.rows.map(row => [row.table, row.tableExists]), [['Commandes', true], ['Disparue', false], ['Clients', true]]), json(found.rows));
  check('le texte de la configuration est rendu TEL QUEL, jamais lu ni nettoyé ici (celui d\'une ligne hostile reste une chaîne)', found.rows[0].config === DOC.BI_Dashboard_Config.rows[0].ConfigJSON && typeof found.rows[2].config === 'string' && /onerror/.test(found.rows[2].config));
  check('sans la table de Grist BI : indisponible, avec la raison à écrire dans le grisé (jamais masqué), et aucune lecture de table', await (async () => {
    const saved = DOC.BI_Dashboard_Config; delete DOC.BI_Dashboard_Config; calls.length = 0;
    const none = plain(await run('ChartHostSource.reports()'));
    DOC.BI_Dashboard_Config = saved;
    return none.available === false && /chart\.report\.noBi/.test(none.reason) && same(none.rows, []) && calls.length === 0;
  })());
}

console.log('Le remappage des colonnes');
{
  const colonnes = loaded.colonnes;
  const matchOf = (wanted) => plain(run('ChartHostSource.matchColumns')(wanted, colonnes));
  const exact = matchOf([{ id: 'Montant', genre: 'number' }, { id: 'Statut', genre: 'text' }, { id: 'Le', genre: 'date' }]);
  check('par identifiant, quand la colonne peut porter le genre demandé', same(exact.mapping, { Montant: 'Montant', Statut: 'Statut', Le: 'Le' }) && same(exact.how, { Montant: 'id', Statut: 'id', Le: 'id' }) && !exact.missing.length && !exact.incompatible.length, json(exact));
  const byLabel = matchOf([{ id: 'Montant_HT', libelle: 'Montant HT', genre: 'number' }, { id: 'date_d_envoi', genre: 'date' }, { id: 'Horodatage', genre: 'date' }, { id: 'equipe', libelle: 'ÉQUIPE', genre: 'list' }]);
  check('à défaut par libellé ou identifiant, sans accents, casse ni ponctuation (« Date d’envoi », « date_d_envoi », « ÉQUIPE » / « Équipe »)', same(byLabel.mapping, { Montant_HT: 'Montant', date_d_envoi: 'Le', Horodatage: 'A', equipe: 'Equipe' }) && same(Object.values(byLabel.how), ['libelle', 'libelle', 'libelle', 'libelle']), json(byLabel));
  const wrong = matchOf([{ id: 'Statut', genre: 'number' }, { id: 'Region', genre: 'date' }, { id: 'Pieces', genre: 'text' }]);
  check('une colonne de même identifiant qui ne peut pas porter le genre (un nombre à mesurer dans du texte) est « incompatible » : jamais une autre prise à sa place', same(wrong.incompatible, ['Statut', 'Region', 'Pieces']) && !Object.keys(wrong.mapping).length, json(wrong));
  const absent = matchOf([{ id: 'Remise', genre: 'number' }, { id: 'Volume_commande', libelle: 'Volume', genre: 'number' }]);
  check('une colonne que la table n\'a pas : « missing » (un libellé qui n\'est celui de personne n\'en trouve aucune) ; « Quantité » trouve « Quantite » (sans accent)', same(absent.missing, ['Remise', 'Volume_commande']) && same(matchOf([{ id: 'Q', libelle: 'Quantité', genre: 'number' }]).mapping, { Q: 'Quantite' }), json(absent));
  const twice = plain(run('ChartHostSource.matchColumns')([{ id: 'Total', libelle: 'Montant', genre: 'number' }, { id: 'Total2', libelle: 'Montant', genre: 'number' }], [{ id: 'Montant', libelle: 'Montant', genre: 'number' }, { id: 'MontantTTC', libelle: 'Montant', genre: 'number' }]));
  check('deux colonnes qui répondent au même libellé : « ambiguous », jamais un choix au hasard', same(twice.ambiguous, ['Total', 'Total2']) && !Object.keys(twice.mapping).length, json(twice));
  const free = matchOf([{ id: 'Nom_inconnu' }, { id: 'Statut' }]);
  check('sans genre demandé, toute colonne de même identifiant convient ; la liste est vide quand rien n\'est demandé', same(free.mapping, { Statut: 'Statut' }) && same(free.missing, ['Nom_inconnu']) && same(matchOf([]).mapping, {}) && same(plain(run('ChartHostSource.matchColumns')(undefined, colonnes)).missing, []));
  const priority = plain(run('ChartHostSource.matchColumns')([{ id: 'A', libelle: 'B', genre: 'number' }], [{ id: 'B', libelle: 'B', genre: 'number' }, { id: 'A', libelle: 'Autre', genre: 'number' }]));
  check('l\'identifiant l\'emporte sur le libellé quand les deux existent', priority.mapping.A === 'A' && priority.how.A === 'id');
}

summarizeAndExit();
