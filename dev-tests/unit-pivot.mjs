#!/usr/bin/env node
// Tests purs (sans navigateur) de js/pivot.js, le moteur du tableau croisé de la grille (étude d'Antoine du 2026-11-12, choix du 2026-11-13) - cf. dev-tests/unit-harness.mjs.
// Les essais « réels » tournent sur les 48 produits d'Atlas (dev-tests/fixtures/pivot-atlas.json) : la valeur du stock par catégorie et par zone d'entrepôt, valeur = Calcul `Stock × PrixAchat`.
// Lancer : node dev-tests/unit-pivot.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/formula.js');
loadScript(ctx, 'js/pivot.js');

const atlas = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pivot-atlas.json'), 'utf8'));

// Appelle une fonction du module avec des arguments JSON ; le résultat revient en JSON (une erreur du moteur reste un objet { error }).
function call(fn, ...args) {
  ctx.__ARGS = JSON.stringify(args);
  return JSON.parse(evalIn(ctx, `JSON.stringify(Pivot.${fn}(...JSON.parse(__ARGS)))`) || 'null');
}
const compute = (def, records, opts) => call('compute', def, records, opts || {});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
const nearAll = (list, expected) => Array.isArray(list) && list.length === expected.length && list.every((found, i) => near(found, expected[i]));

// Les lignes d'Atlas, telles que celui qui les lit les rendrait : regroupement par catégorie (ordre des choix de Grist) et par zone, valeur = Stock × PrixAchat.
const atlasRecords = atlas.produits.map(p => ({
  dims: {
    categorie: { label: p.categorie, order: atlas.categories.indexOf(p.categorie) },
    zone: { label: p.zone, order: atlas.zones.indexOf(p.zone) },
    fournisseur: p.fournisseur,
  },
  value: p.stock,
  vars: { 'Produits.Stock': p.stock, 'Produits.PrixAchat': p.prixAchat },
}));
const VALUE = { kind: 'formula', formula: '{Produits.Stock} * {Produits.PrixAchat}' };
const atlasDef = { rows: ['categorie'], cols: ['zone'], value: VALUE, agg: 'sum' };

// 1. Une définition lue dans la page : valeurs par défaut, chaîne JSON, refus de ce qui ne tient pas.
const base = call('normalize', { rows: ['A'] });
check('normalize : défauts = somme, tout en choix, totaux des deux côtés, valeur absente -> on compte les lignes',
  base && base.v === 1 && base.agg === 'count' && base.sort === 'choices' && base.totals.rows === true && base.totals.cols === true && same(base.cols, []) && base.value === null && base.source === null, JSON.stringify(base));
const withValue = call('normalize', { rows: [' A '], cols: ['B'], value: { kind: 'column', path: 'Stock' } });
check('normalize : une valeur sans fonction est sommée ; les noms sont rognés', withValue && withValue.agg === 'sum' && withValue.rows[0] === 'A' && withValue.value.path === 'Stock', JSON.stringify(withValue));
check('normalize : accepte la définition écrite en JSON', call('normalize', '{"rows":["A"],"agg":"count"}') && call('normalize', '{"rows":["A"],"agg":"count"}').rows[0] === 'A');
check('normalize : source gardée telle quelle (table + étendue), étendue par défaut = lignes liées',
  same(call('normalize', { rows: ['A'], source: { table: 'Produits' } }).source, { table: 'Produits', scope: 'linked' }) && same(call('normalize', { rows: ['A'], source: { table: 'Produits', scope: 'view' } }).source, { table: 'Produits', scope: 'view' }));
const refused = [
  ['rien en lignes', { rows: [] }],
  ['aucune clé rows', { cols: ['B'] }],
  ['trois colonnes en lignes', { rows: ['A', 'B', 'C'] }],
  ['deux colonnes en colonnes', { rows: ['A'], cols: ['B', 'C'] }],
  ['la même colonne en lignes et en colonnes', { rows: ['A'], cols: ['A'] }],
  ['la même colonne deux fois en lignes', { rows: ['A', 'A'] }],
  ['un nom de colonne vide', { rows: ['A', '  '] }],
  ['une fonction inconnue', { rows: ['A'], value: { kind: 'column', path: 'S' }, agg: 'median' }],
  ['une valeur sans chemin', { rows: ['A'], value: { kind: 'column' } }],
  ['un Calcul vide', { rows: ['A'], value: { kind: 'formula', formula: '  ' } }],
  ['un genre de valeur inconnu', { rows: ['A'], value: { kind: 'x' } }],
  ['un tri inconnu', { rows: ['A'], sort: 'random' }],
  ['une étendue inconnue', { rows: ['A'], source: { table: 'T', scope: 'nope' } }],
  ['une source sans table', { rows: ['A'], source: { scope: 'view' } }],
  ['un texte qui n\'est pas du JSON', 'pas du json'],
  ['un nombre', 7],
  ['un tableau', [1, 2]],
];
check('normalize : refuse ' + refused.map(r => r[0]).join(', '), refused.every(([, def]) => call('normalize', def) === null), refused.filter(([, def]) => call('normalize', def) !== null).map(r => r[0]).join(' / '));
check('compute : une définition refusée rend { error: badDefinition }, jamais un tableau faux', same(compute({ rows: [] }, []), { error: { code: 'badDefinition' } }));

// 2. Ce que celui qui lit les lignes doit lire.
const need = call('needs', atlasDef);
check('needs : les colonnes de regroupement (lignes puis colonnes) et les variables du Calcul', same(need.dims, ['categorie', 'zone']) && need.measure.kind === 'formula'
  && same(need.measure.variables.map(v => v.key).sort(), ['Produits.PrixAchat', 'Produits.Stock']), JSON.stringify(need));
check('needs : une valeur-colonne dit son chemin ; sans valeur, rien à lire', same(call('needs', { rows: ['A'], value: { kind: 'column', path: 'Stock' } }).measure, { kind: 'column', path: 'Stock' }) && call('needs', { rows: ['A'] }).measure === null);
check('needs : un Calcul qui ne se lit pas rend l\'erreur du Calcul (parenthèse oubliée)', call('needs', { rows: ['A'], value: { kind: 'formula', formula: '({Produits.Stock} * 2' } }).error !== undefined);
check('needs : une définition refusée rend badDefinition', call('needs', { rows: [] }).error.code === 'badDefinition');

// 3. Les 48 produits d'Atlas : valeur du stock, catégorie × zone.
const atlasResult = compute(atlasDef, atlasRecords);
check('Atlas : 6 catégories en lignes dans l\'ordre des choix, 4 zones en colonnes dans l\'ordre des choix',
  same(atlasResult.rows.map(r => r.labels[0]), atlas.categories) && same(atlasResult.cols.map(c => c.label), atlas.zones), JSON.stringify(atlasResult.rows.map(r => r.labels)));
check('Atlas : 48 lignes lues, aucun avertissement', atlasResult.records === 48 && atlasResult.warnings.length === 0);
check('Atlas : Visserie & fixation = 2 257,64 / 72,16 / 2 693,60 / 3 087,60 (total 8 111,00)', nearAll(atlasResult.cells[0], [2257.64, 72.16, 2693.6, 3087.6]) && near(atlasResult.rowTotals[0], 8111));
check('Atlas : Électricité = 5 744,50 / 24 651,00 / 7 762,64 / 19 277,30 (total 57 435,44)', nearAll(atlasResult.cells[1], [5744.5, 24651, 7762.64, 19277.3]) && near(atlasResult.rowTotals[1], 57435.44));
check('Atlas : Plomberie = 58 440,80 / 3 041,33 / 329,10 / 103,40 (total 61 914,63)', nearAll(atlasResult.cells[2], [58440.8, 3041.33, 329.1, 103.4]) && near(atlasResult.rowTotals[2], 61914.63));
check('Atlas : Peinture & finition = 28,16 / 876,96 / 77 360,80 / 6 201,64 (total 84 467,56)', nearAll(atlasResult.cells[3], [28.16, 876.96, 77360.8, 6201.64]) && near(atlasResult.rowTotals[3], 84467.56));
check('Atlas : Emballage : la case Réserve existe et vaut 0 (des lignes, mais à valeur nulle) - pas une case vide', atlasResult.cells[4][0] === 0 && nearAll(atlasResult.cells[4], [0, 1656.42, 9949.83, 1327.71]) && near(atlasResult.rowTotals[4], 12933.96));
check('Atlas : Sécurité (EPI) = 301,30 / 6 687,29 / 1 921,90 / 1 294,15 (total 10 204,64)', nearAll(atlasResult.cells[5], [301.3, 6687.29, 1921.9, 1294.15]) && near(atlasResult.rowTotals[5], 10204.64));
check('Atlas : total de chaque zone 66 772,40 / 36 985,16 / 100 017,87 / 31 291,80', nearAll(atlasResult.colTotals, [66772.4, 36985.16, 100017.87, 31291.8]));
check('Atlas : total général 235 067,23', near(atlasResult.grand, 235067.23), String(atlasResult.grand));
check('Atlas : le total général est la somme des totaux de lignes ET des totaux de colonnes',
  near(atlasResult.rowTotals.reduce((a, b) => a + b, 0), atlasResult.grand) && near(atlasResult.colTotals.reduce((a, b) => a + b, 0), atlasResult.grand));
check('Atlas : les 24 cases existent (aucune ligne sans case)', atlasResult.cells.every(row => row.every(cell => typeof cell === 'number')));
check('Atlas : un seul niveau de lignes : chaque rangée repart du niveau 0', atlasResult.rows.every(r => r.from === 0 && r.keys.length === 1 && r.empty[0] === false));

// 4. La valeur est une colonne de Grist (pas un Calcul) : mêmes cases, autre somme.
const stockOnly = compute({ rows: ['categorie'], cols: ['zone'], value: { kind: 'column', path: 'stock' }, agg: 'sum' }, atlasRecords);
const stockByCategory = {};
atlas.produits.forEach(p => { stockByCategory[p.categorie] = (stockByCategory[p.categorie] || 0) + p.stock; });
check('valeur = colonne : la somme du stock par catégorie est celle des produits', atlas.categories.every((name, i) => near(stockOnly.rowTotals[i], stockByCategory[name])));
check('valeur = colonne : total général = stock total des 48 produits', near(stockOnly.grand, atlas.produits.reduce((a, p) => a + p.stock, 0)));

// 5. Sans colonne en colonnes : une colonne de valeur, pas de total par ligne, le total du bas = le total général.
const flat = compute({ rows: ['categorie'], value: VALUE, agg: 'sum' }, atlasRecords);
check('sans colonne en colonnes : une seule colonne sans texte, pas de colonne des totaux', flat.cols.length === 1 && flat.cols[0].label === '' && flat.rowTotals === null);
check('sans colonne en colonnes : les valeurs par catégorie sont celles des totaux de ligne du croisé', nearAll(flat.cells.map(r => r[0]), atlasResult.rowTotals));
check('sans colonne en colonnes : colTotals n\'a que le total général', flat.colTotals.length === 1 && near(flat.colTotals[0], 235067.23) && near(flat.grand, 235067.23));
const noTotals = compute({ rows: ['categorie'], cols: ['zone'], value: VALUE, totals: { rows: false, cols: false } }, atlasRecords);
check('totaux désactivés : ni colonne ni ligne de totaux, mais le total général reste calculé', noTotals.rowTotals === null && noTotals.colTotals === null && near(noTotals.grand, 235067.23));
const onlyRowTotals = compute({ rows: ['categorie'], cols: ['zone'], value: VALUE, totals: { cols: false } }, atlasRecords);
check('totaux : on peut garder la colonne des totaux sans la ligne', onlyRowTotals.rowTotals && onlyRowTotals.colTotals === null);

// 6. Les cinq fonctions.
const rec = (cat, value, extra) => Object.assign({ dims: { cat }, value }, extra);
const sample = [rec('A', 10), rec('A', 20), rec('A', null), rec('A', ''), rec('B', 5), rec('B', 7.5), rec('C', null)];
const column = fn => compute({ rows: ['cat'], value: { kind: 'column', path: 'v' }, agg: fn }, sample);
check('somme : A 30 ; B 12,5 ; C aucune valeur = 0 (des lignes, rien à additionner)', same(column('sum').cells.map(r => r[0]), [30, 12.5, 0]) && column('sum').grand === 42.5);
check('nombre avec valeur : ne compte que les valeurs remplies (A 2, B 2, C 0)', same(column('count').cells.map(r => r[0]), [2, 2, 0]) && column('count').grand === 4);
check('moyenne : A 15 ; B 6,25 ; C rien (pas de nombre à moyenner) ; moyenne générale 42,5/4 = 10,625', same(column('average').cells.map(r => r[0]), [15, 6.25, null]) && column('average').grand === 10.625);
check('minimum : A 10 ; B 5 ; C rien ; général 5', same(column('min').cells.map(r => r[0]), [10, 5, null]) && column('min').grand === 5);
check('maximum : A 20 ; B 7,5 ; C rien ; général 20', same(column('max').cells.map(r => r[0]), [20, 7.5, null]) && column('max').grand === 20);
const countRows = compute({ rows: ['cat'] }, sample);
check('sans valeur : on compte les lignes (A 4, B 2, C 1), même celles dont rien n\'est rempli', same(countRows.cells.map(r => r[0]), [4, 2, 1]) && countRows.grand === 7);
check('la moyenne d\'une rangée n\'est pas la somme des moyennes de ses cases (total pris sur les lignes)',
  (() => {
    const data = [
      { dims: { r: 'X', c: 'p' }, value: 10 }, { dims: { r: 'X', c: 'p' }, value: 20 }, { dims: { r: 'X', c: 'q' }, value: 60 },
    ];
    const out = compute({ rows: ['r'], cols: ['c'], value: { kind: 'column', path: 'v' }, agg: 'average' }, data);
    return same(out.cells[0], [15, 60]) && out.rowTotals[0] === 30 && out.grand === 30;
  })());
check('des nombres écrits en texte (« 12,5 », « 1 234,56 ») sont additionnés', (() => {
  const out = compute({ rows: ['r'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { r: 'X' }, value: '12,5' }, { dims: { r: 'X' }, value: '1 234,56' }]);
  return near(out.cells[0][0], 1247.06);
})());
check('le bruit des nombres à virgule est retiré (0,1 + 0,2 = 0,3)', compute({ rows: ['r'], value: { kind: 'column', path: 'v' } }, [{ dims: { r: 'X' }, value: 0.1 }, { dims: { r: 'X' }, value: 0.2 }]).cells[0][0] === 0.3);
check('jamais de -0 : 5 + -5 s\'écrit 0', Object.is(compute({ rows: ['r'], value: { kind: 'column', path: 'v' } }, [{ dims: { r: 'X' }, value: 5 }, { dims: { r: 'X' }, value: -5 }]).cells[0][0], 0));

// 7. Rangées et colonnes vides, listes, booléens, nombres.
const gaps = compute({ rows: ['cat'], cols: ['z'] }, [
  { dims: { cat: 'B', z: 'p' } }, { dims: { cat: null, z: 'p' } }, { dims: { cat: '', z: null } }, { dims: { cat: '   ', z: 'q' } }, { dims: { cat: 'A', z: 'q' } }, { dims: { cat: [], z: 'p' } },
]);
check('le vide (null, texte vide, espaces, liste vide) est UNE rangée « (vide) », toujours en dernier', same(gaps.rows.map(r => r.labels[0]), ['A', 'B', '(vide)']) && gaps.rows[2].empty[0] === true && gaps.cells[2].reduce((a, b) => a + (b || 0), 0) === 4);
check('une colonne vide est une colonne « (vide) », en dernier', same(gaps.cols.map(c => c.label), ['p', 'q', '(vide)']) && gaps.cols[2].empty === true);
check('les textes du vide, du oui et du non se donnent en option (anglais)', (() => {
  const out = compute({ rows: ['cat'], cols: ['ok'] }, [{ dims: { cat: null, ok: true } }, { dims: { cat: 'A', ok: false } }], { labels: { empty: '(blank)', yes: 'Yes', no: 'No' } });
  return same(out.rows.map(r => r.labels[0]), ['A', '(blank)']) && same(out.cols.map(c => c.label), ['No', 'Yes']);
})());
check('une case sans aucune ligne est null (rien à montrer), pas 0', gaps.cells[0][0] === null && gaps.cells[1][1] === null && gaps.cells[0][1] === 1);

const lists = compute({ rows: ['tag'], value: { kind: 'column', path: 'v' } }, [
  { dims: { tag: ['red', 'blue'] }, value: 10 }, { dims: { tag: ['red'] }, value: 5 }, { dims: { tag: ['blue', 'blue'] }, value: 1 }, { dims: { tag: [] }, value: 100 },
]);
check('une liste de choix met la ligne dans CHAQUE choix (sans doublon dans une même ligne)', same(lists.rows.map(r => r.labels[0]), ['blue', 'red', '(vide)']) && same(lists.cells.map(r => r[0]), [11, 15, 100]));
check('mais le total ne compte une ligne qu\'une fois : 10 + 5 + 1 + 100 = 116, pas 126', lists.grand === 116 && lists.records === 4, String(lists.grand));
check('une liste dans les colonnes : total de la ligne = lignes distinctes', (() => {
  const out = compute({ rows: ['r'], cols: ['tag'], value: { kind: 'column', path: 'v' } }, [{ dims: { r: 'X', tag: ['a', 'b'] }, value: 10 }, { dims: { r: 'X', tag: ['a'] }, value: 5 }]);
  return same(out.cells[0], [15, 10]) && out.rowTotals[0] === 15 && out.colTotals[0] === 15 && out.colTotals[1] === 10 && out.grand === 15;
})());

check('les booléens : « Non » avant « Oui » (faux avant vrai)', same(compute({ rows: ['ok'] }, [{ dims: { ok: true } }, { dims: { ok: false } }, { dims: { ok: true } }]).rows.map(r => r.labels[0]), ['Non', 'Oui']));
check('les nombres se rangent comme des nombres, pas comme du texte (2 avant 10)', same(compute({ rows: ['n'] }, [{ dims: { n: 10 } }, { dims: { n: 2 } }, { dims: { n: 33 } }]).rows.map(r => r.labels[0]), ['2', '10', '33']));
check('un nombre infini ou illisible est une rangée vide', same(compute({ rows: ['n'] }, [{ dims: { n: null } }, { dims: {} }]).rows.map(r => r.labels[0]), ['(vide)']));

// 8. Tris.
const sorting = [rec('banane', 1), rec('Zèbre', 100), rec('citron', 50), rec('Abricot', 7)];
const labelsFor = (sort, data) => compute({ rows: ['cat'], value: { kind: 'column', path: 'v' }, sort }, data || sorting).rows.map(r => r.labels[0]);
check('tri A→Z : insensible à la casse et aux accents (Abricot, banane, citron, Zèbre)', same(labelsFor('az'), ['Abricot', 'banane', 'citron', 'Zèbre']), labelsFor('az').join(','));
check('tri Z→A : l\'inverse', same(labelsFor('za'), ['Zèbre', 'citron', 'banane', 'Abricot']));
check('tri par total : le plus gros d\'abord (Zèbre 100, citron 50, Abricot 7, banane 1)', same(labelsFor('total'), ['Zèbre', 'citron', 'Abricot', 'banane']));
check('tri « ordre des choix » : l\'ordre donné par celui qui lit (order), puis A→Z pour ceux qui n\'en ont pas', same(labelsFor('choices', [
  { dims: { cat: { label: 'Moyen', order: 1 } } }, { dims: { cat: { label: 'Bas', order: 0 } } }, { dims: { cat: { label: 'Haut', order: 2 } } }, { dims: { cat: 'Sans rang' } }, { dims: { cat: { label: 'Avant', order: 0.5 } } },
]), ['Bas', 'Avant', 'Moyen', 'Haut', 'Sans rang']));
check('le vide reste en dernier quel que soit le tri', ['choices', 'az', 'za', 'total'].every(sort => labelsFor(sort, sorting.concat([{ dims: { cat: null }, value: 9999 }])).pop() === '(vide)'));
check('tri par total sur les colonnes aussi (la zone la plus grosse en premier)', (() => {
  const out = compute({ rows: ['r'], cols: ['c'], value: { kind: 'column', path: 'v' }, sort: 'total' }, [
    { dims: { r: 'X', c: 'petit' }, value: 1 }, { dims: { r: 'X', c: 'gros' }, value: 50 }, { dims: { r: 'X', c: 'moyen' }, value: 10 },
  ]);
  return same(out.cols.map(c => c.label), ['gros', 'moyen', 'petit']);
})());
check('Atlas trié par total : Peinture (84 467,56) en premier, Visserie (8 111,00) en dernier ; les zones aussi par total (Quai, Réserve, Picking, Froid) et les cases suivent leur rangée et leur colonne', (() => {
  const out = compute(Object.assign({ sort: 'total' }, atlasDef), atlasRecords);
  return out.rows[0].labels[0] === 'Peinture & finition' && out.rows[5].labels[0] === 'Visserie & fixation' && near(out.rowTotals[5], 8111) && near(out.rowTotals[0], 84467.56)
    && same(out.cols.map(c => c.label), ['Quai', 'Réserve', 'Picking', 'Froid']) && near(out.cells[0][0], 77360.8);
})());

// 9. Deux colonnes en lignes (catégorie, puis zone) : « from » dit où le texte du niveau 1 est écrit.
const two = compute({ rows: ['categorie', 'zone'], value: VALUE }, atlasRecords);
check('deux niveaux : 24 rangées (6 catégories × 4 zones) sans total de colonnes par zone', two.rows.length === 24 && two.cols.length === 1 && two.rowTotals === null);
check('deux niveaux : trié par catégorie puis par zone (Visserie : Réserve, Picking, Quai, Froid)', same(two.rows.slice(0, 4).map(r => r.labels), [['Visserie & fixation', 'Réserve'], ['Visserie & fixation', 'Picking'], ['Visserie & fixation', 'Quai'], ['Visserie & fixation', 'Froid']]));
check('deux niveaux : « from » = 0 à chaque nouvelle catégorie, 1 pour les zones suivantes de la même catégorie', two.rows.slice(0, 6).map(r => r.from).join() === '0,1,1,1,0,1');
check('deux niveaux : la valeur de Visserie × Réserve est celle du croisé', near(two.cells[0][0], 2257.64) && near(two.cells[3][0], 3087.6));
check('deux niveaux : total général identique', near(two.grand, 235067.23));
const twoByTotal = compute({ rows: ['categorie', 'zone'], value: VALUE, sort: 'total' }, atlasRecords);
check('deux niveaux, tri par total : la catégorie la plus grosse d\'abord, puis ses zones par valeur décroissante', twoByTotal.rows[0].labels[0] === 'Peinture & finition' && same(twoByTotal.rows.slice(0, 4).map(r => r.labels[1]), ['Quai', 'Froid', 'Picking', 'Réserve']), JSON.stringify(twoByTotal.rows.slice(0, 4).map(r => r.labels)));
check('deux niveaux : le vide du niveau 2 est en dernier dans sa catégorie', (() => {
  const out = compute({ rows: ['a', 'b'] }, [{ dims: { a: 'X', b: null } }, { dims: { a: 'X', b: 'b1' } }, { dims: { a: 'Y', b: 'b2' } }]);
  return same(out.rows.map(r => r.labels), [['X', 'b1'], ['X', '(vide)'], ['Y', 'b2']]) && out.rows[1].empty[1] === true;
})());
check('deux niveaux avec une colonne en colonnes : les cases croisent bien les trois colonnes', (() => {
  const out = compute({ rows: ['a', 'b'], cols: ['c'], value: { kind: 'column', path: 'v' } }, [
    { dims: { a: 'X', b: 'b1', c: 'k' }, value: 1 }, { dims: { a: 'X', b: 'b1', c: 'l' }, value: 2 }, { dims: { a: 'X', b: 'b2', c: 'k' }, value: 4 },
  ]);
  return same(out.cells, [[1, 2], [4, null]]) && same(out.rowTotals, [3, 4]) && same(out.colTotals, [5, 2]) && out.grand === 7;
})());
check('une clé de rangée ne confond pas (« a », « bc ») et (« ab », « c »)', compute({ rows: ['a', 'b'] }, [{ dims: { a: 'a', b: 'bc' } }, { dims: { a: 'ab', b: 'c' } }]).rows.length === 2);

// 10. Un Calcul qui échoue pour une ligne : la case, la rangée, la colonne et le général disent l'erreur ; les autres cases restent justes.
const broken = atlasRecords.map(r => ({ dims: r.dims, vars: Object.assign({}, r.vars) }));
broken[0].vars['Produits.Stock'] = { error: 'Colonne illisible' };
const brokenResult = compute(atlasDef, broken);
const touched = atlas.produits[0];
const touchedRow = atlas.categories.indexOf(touched.categorie);
const touchedCol = atlas.zones.indexOf(touched.zone);
check('erreur de Calcul sur une ligne : sa case porte { error }', brokenResult.cells[touchedRow][touchedCol] && brokenResult.cells[touchedRow][touchedCol].error !== undefined, JSON.stringify(brokenResult.cells[touchedRow][touchedCol]));
check('erreur : la rangée, la colonne et le général qui la contiennent portent l\'erreur - jamais une somme fausse', brokenResult.rowTotals[touchedRow].error !== undefined && brokenResult.colTotals[touchedCol].error !== undefined && brokenResult.grand.error !== undefined);
check('erreur : les cases, rangées et colonnes sans cette ligne restent justes', brokenResult.cells.every((row, i) => row.every((cell, j) => (i === touchedRow && j === touchedCol) || typeof cell === 'number')) && brokenResult.rowTotals.every((total, i) => i === touchedRow || typeof total === 'number') && brokenResult.colTotals.every((total, j) => j === touchedCol || typeof total === 'number'));
check('erreur : le message de la variable illisible est gardé', JSON.stringify(brokenResult.grand).includes('Colonne illisible'), JSON.stringify(brokenResult.grand));
const notNumber = compute({ rows: ['r'], value: { kind: 'column', path: 'v' } }, [{ dims: { r: 'X' }, value: 5 }, { dims: { r: 'X' }, value: '12 EUR' }, { dims: { r: 'Y' }, value: 3 }]);
check('une valeur qui n\'est pas un nombre (« 12 EUR ») : sa case dit l\'erreur, l\'autre rangée reste juste', notNumber.cells[0][0].error !== undefined && notNumber.cells[1][0] === 3 && notNumber.grand.error !== undefined);
check('en « Nombre », un texte dans la colonne compte comme rempli (pas d\'erreur : on ne l\'additionne pas)', compute({ rows: ['r'], value: { kind: 'column', path: 'v' }, agg: 'count' }, [{ dims: { r: 'X' }, value: 'bonjour' }, { dims: { r: 'X' }, value: null }]).cells[0][0] === 1);
check('un Calcul qui divise par zéro pour une ligne : sa case dit l\'erreur (divZero)', (() => {
  const out = compute({ rows: ['r'], value: { kind: 'formula', formula: '{T.A} / {T.B}' } }, [{ dims: { r: 'X' }, vars: { 'T.A': 4, 'T.B': 0 } }, { dims: { r: 'Y' }, vars: { 'T.A': 4, 'T.B': 2 } }]);
  return out.cells[0][0].error.code === 'divZero' && out.cells[1][0] === 2;
})());
check('un Calcul dont une variable manque dans la ligne : erreur claire (unknownVariable), pas NaN', compute({ rows: ['r'], value: { kind: 'formula', formula: '{T.A} * 2' } }, [{ dims: { r: 'X' }, vars: {} }]).cells[0][0].error.code === 'unknownVariable');
check('un Calcul qui ne se lit pas : compute rend { error } pour tout le tableau', compute({ rows: ['r'], value: { kind: 'formula', formula: '(1 +' } }, [{ dims: { r: 'X' }, vars: {} }]).error !== undefined);
check('un Calcul sur des cellules vides : rien à montrer (case null... pas 0), la somme reste 0 pour le total', (() => {
  const out = compute({ rows: ['r'], value: { kind: 'formula', formula: '{T.A} * 2' } }, [{ dims: { r: 'X' }, vars: { 'T.A': null } }]);
  return out.cells[0][0] === 0 && out.grand === 0;
})());
check('un Calcul sur une liste de valeurs (colonne liée) : la ligne vaut la somme de ses valeurs liées', compute({ rows: ['r'], value: { kind: 'formula', formula: 'SUM({T.A})' } }, [{ dims: { r: 'X' }, vars: { 'T.A': [1, 2, '3'] } }]).cells[0][0] === 6);

// 11. Limites : beaucoup de colonnes, aucune ligne, lignes mal formées.
const wide = compute({ rows: ['r'], cols: ['c'] }, Array.from({ length: 60 }, (_, i) => ({ dims: { r: 'X', c: 'col' + String(i).padStart(2, '0') } })));
check('plus de 50 colonnes : avertissement manyColumns avec le nombre de colonnes', wide.cols.length === 60 && same(wide.warnings, [{ code: 'manyColumns', count: 60 }]));
check('50 colonnes pile : pas d\'avertissement', compute({ rows: ['r'], cols: ['c'] }, Array.from({ length: 50 }, (_, i) => ({ dims: { r: 'X', c: 'c' + i } }))).warnings.length === 0);
const none = compute({ rows: ['r'], cols: ['c'], value: { kind: 'column', path: 'v' } }, []);
check('aucune ligne : tableau vide, total général null, aucun plantage', same(none.rows, []) && same(none.cols, []) && same(none.cells, []) && none.grand === null && none.records === 0);
check('records absent ou pas une liste : traité comme aucune ligne', compute({ rows: ['r'] }, null).records === 0 && compute({ rows: ['r'] }, undefined).records === 0);
check('une ligne sans dims ni valeur : dans la rangée « (vide) », sans plantage', (() => {
  const out = compute({ rows: ['r'], value: { kind: 'column', path: 'v' } }, [{}, null, { dims: null }]);
  return out.records === 3 && same(out.rows.map(r => r.labels[0]), ['(vide)']) && out.cells[0][0] === 0;
})());
check('compute ne modifie pas les lignes reçues', (() => {
  const data = JSON.parse(JSON.stringify(atlasRecords));
  ctx.__COPY = JSON.stringify(data);
  const before = JSON.stringify(data);
  compute(atlasDef, data);
  return before === ctx.__COPY && JSON.stringify(data) === before;
})());
check('compute est déterministe : deux appels, même résultat, lignes données dans un autre ordre comprises', (() => {
  const first = compute(atlasDef, atlasRecords);
  const second = compute(atlasDef, atlasRecords.slice().reverse());
  return same(first.rows, second.rows) && same(first.cols, second.cols) && nearAll(first.colTotals, second.colTotals) && near(first.grand, second.grand);
})());
check('source, filtre et format sont gardés tels quels par normalize (pour les lots suivants)', (() => {
  const def = call('normalize', { rows: ['A'], source: { table: 'Produits', scope: 'table' }, filter: { all: [{ path: 'A', op: 'eq', value: 'x' }] }, format: { decimals: 2, currency: 'EUR' } });
  return same(def.filter, { all: [{ path: 'A', op: 'eq', value: 'x' }] }) && same(def.format, { decimals: 2, currency: 'EUR' }) && def.source.scope === 'table';
})());

summarizeAndExit();
