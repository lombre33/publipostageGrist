#!/usr/bin/env node
// Tests purs (sans navigateur) de js/xlsx-pivot.js, le vrai tableau croisé d'Excel pour l'export Excel d'une grille (lot 5 de l'étude du tableau croisé, 2026-11-16) et de `Pivot.flat` (js/pivot.js) qui lui lit les lignes à plat - cf. dev-tests/unit-harness.mjs.
// Les essais « réels » tournent sur les 48 produits d'Atlas (dev-tests/fixtures/pivot-atlas.json) : la valeur du stock par catégorie et par zone d'entrepôt. Le fichier lui-même (dézippé, relu par LibreOffice) est essayé dans le navigateur par le groupe `pivotExport`.
// Lancer : node dev-tests/unit-xlsx-pivot.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/formula.js');
loadScript(ctx, 'js/pivot.js');
loadScript(ctx, 'js/xlsx-pivot.js');

const atlas = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pivot-atlas.json'), 'utf8'));

// Appelle une fonction d'un module avec des arguments JSON ; le résultat revient en JSON.
function call(path, ...args) {
  ctx.__ARGS = JSON.stringify(args);
  return JSON.parse(evalIn(ctx, `JSON.stringify(${path}(...JSON.parse(__ARGS)))`) || 'null');
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;

const LABELS = { total: 'Total', line: 'Ligne', filled: name => name + ' (renseigné)' };
// Le plan et les parties d'une définition pour des lignes lues comme PivotZones les lit : le moteur calcule le tableau, `flat` lit les lignes à plat, `names` donne le nom des colonnes (lignes, colonne, valeur).
function build(def, records, names, valueTitle) {
  const result = call('Pivot.compute', def, records, {});
  const flat = call('Pivot.flat', def, records, {});
  const info = { def: call('Pivot.normalize', def), result, flat, title: 'Titre', names, valueTitle: valueTitle || 'Somme de valeur' };
  ctx.__INFO = JSON.stringify(info);
  ctx.__LABELS = JSON.stringify({ total: LABELS.total, line: LABELS.line, filledSuffix: ' (renseigné)' });
  const plan = evalIn(ctx, `(function () { const labels = JSON.parse(__LABELS); return XlsxPivot.plan(JSON.parse(__INFO), { total: labels.total, line: labels.line, filled: name => name + labels.filledSuffix }); })()`);
  return { info, result, flat, plan };
}
function parts(plan, place) {
  ctx.__PLAN = plan;
  ctx.__PLACE = JSON.stringify(Object.assign({ sourceSheet: 'Données', sourceTop: 2, pivotTop: 3, cacheId: 1, name: 'Tableau croisé 1', numFmtId: 0, totalLabel: 'Total', valuesCaption: 'Valeurs', refreshed: 46000.5, relationId: 'rId1' }, place || {}));
  return JSON.parse(evalIn(ctx, 'JSON.stringify(XlsxPivot.xml(__PLAN, JSON.parse(__PLACE)))'));
}
// Un XML bien formé (balises appariées, attributs entre guillemets) : ce qu'Excel exige avant tout.
function wellFormed(xml) {
  const stack = [];
  for (const m of xml.replace(/^<\?xml[^>]*\?>\s*/, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  const leftovers = xml.replace(/^<\?xml[^>]*\?>\s*/, '').replace(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g, '');
  return stack.length === 0 && !/[<>]/.test(leftovers);
}
const count = (xml, tag) => (xml.match(new RegExp('<' + tag + '\\b', 'g')) || []).length;

const atlasRecords = atlas.produits.map(p => ({
  dims: { categorie: { label: p.categorie, order: atlas.categories.indexOf(p.categorie) }, zone: { label: p.zone, order: atlas.zones.indexOf(p.zone) }, fournisseur: p.fournisseur },
  value: p.stock, vars: { 'Produits.Stock': p.stock, 'Produits.PrixAchat': p.prixAchat },
}));
const VALUE = { kind: 'formula', formula: '{Produits.Stock} * {Produits.PrixAchat}' };
const atlasDef = { rows: ['categorie'], cols: ['zone'], value: VALUE, agg: 'sum' };

// 1. Les petits outils.
check('columnLetters : A, Z, AA, AZ, BA', ['A', 'Z', 'AA', 'AZ', 'BA'].every((l, i) => call('XlsxPivot.columnLetters', [0, 25, 26, 51, 52][i]) === l));
check('tidy : signes de commande retirés, espaces réduites, 255 signes au plus', call('XlsxPivot.tidy', 'a\u0000b\n\tc  d') === 'a b c d' && call('XlsxPivot.tidy', 'x'.repeat(400)).length === 255 && call('XlsxPivot.tidy', null) === '');

// 2. Pivot.flat : une ligne par ligne source, un texte par colonne de regroupement.
const flat = call('Pivot.flat', atlasDef, atlasRecords, {});
check('flat : une ligne par ligne source, le texte de la catégorie puis de la zone, le nombre calculé',
  flat.rows.length === 48 && same(flat.dims, ['categorie', 'zone']) && flat.rows[0].labels[0] === atlas.produits[0].categorie && flat.rows[0].labels[1] === atlas.produits[0].zone
  && near(flat.rows[0].n, atlas.produits[0].stock * atlas.produits[0].prixAchat) && flat.rows.every(r => r.filled === true));
check('flat : une cellule vide est la rangée « (vide) » (les mots du moteur, réglables)',
  call('Pivot.flat', { rows: ['a'], agg: 'count' }, [{ dims: { a: null } }, { dims: { a: '  ' } }], {}).rows.every(r => r.labels[0] === '(vide)')
  && call('Pivot.flat', { rows: ['a'], agg: 'count' }, [{ dims: { a: null } }], { labels: { empty: 'vacío' } }).rows[0].labels[0] === 'vacío');
check('flat : une liste de choix en regroupement ne se met pas à plat (une ligne compterait deux fois dans les totaux)',
  call('Pivot.flat', { rows: ['a'], agg: 'count' }, [{ dims: { a: ['x', 'y'] } }], {}).unsupported === 'list');
check('flat : une valeur qui n\'est pas un nombre ne se met pas à plat',
  call('Pivot.flat', { rows: ['a'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { a: 'x' }, value: 'abc' }], {}).unsupported === 'error');
check('flat : une définition illisible ne se met pas à plat', call('Pivot.flat', 'pas du json', [], {}).unsupported === 'error');

// 3. Le plan : les données à plat, les champs, la grille.
const atlasBuilt = build(atlasDef, atlasRecords, ['categorie', 'zone', 'Stock × PrixAchat'], 'Somme de Stock × PrixAchat');
const plan = atlasBuilt.plan;
check('plan : un plan pour le tableau d\'Atlas ; ses champs sont les colonnes de regroupement (lignes puis colonne) puis la valeur', !!plan);
ctx.__PLAN = plan;
const view = JSON.parse(evalIn(ctx, 'JSON.stringify({ headers: __PLAN.source.headers, rows: __PLAN.source.rows.length, depth: __PLAN.depth, hasCols: __PLAN.hasCols, width: __PLAN.sheet.width, height: __PLAN.sheet.height, dataName: __PLAN.dataName, measureName: __PLAN.measureName, first: __PLAN.source.rows[0], items0: __PLAN.fields[0].list, items1: __PLAN.fields[1].list })'));
check('plan : les en-têtes des données, une ligne de données par ligne source, la valeur à la fin', same(view.headers, ['categorie', 'zone', 'Stock × PrixAchat']) && view.rows === 48 && view.first.length === 3);
check('plan : les éléments de chaque champ dans l\'ordre du tableau (les choix de Grist), pas dans celui des lignes', same(view.items0, atlas.categories.filter(c => atlas.produits.some(p => p.categorie === c))) && same(view.items1, atlas.zones.filter(z => atlas.produits.some(p => p.zone === z))));
check('plan : la grille du tableau (en-têtes sur deux lignes avec une colonne, rangées, total) a la largeur et la hauteur du tableau écrit',
  view.hasCols && view.width === 1 + view.items1.length + 1 && view.height === 2 + atlasBuilt.result.rows.length + 1 && view.dataName === 'Somme de Stock × PrixAchat');

// 4. Les parties : bien formées, cohérentes entre elles, les mêmes sommes que le moteur.
const xml = parts(plan);
check('xml : les trois parties sont du XML bien formé', wellFormed(xml.cacheDefinition) && wellFormed(xml.cacheRecords) && wellFormed(xml.table));
check('xml : la définition du cache pointe la feuille et les cases des données (en-têtes compris), refreshOnLoad, autant de champs que de colonnes',
  xml.sourceRef === 'A2:C50' && /worksheetSource ref="A2:C50" sheet="Données"/.test(xml.cacheDefinition) && /refreshOnLoad="1"/.test(xml.cacheDefinition) && count(xml.cacheDefinition, 'cacheField') === 3 && /recordCount="48"/.test(xml.cacheDefinition));
check('xml : un enregistrement par ligne source, le nombre de champs de chacun est celui du cache', count(xml.cacheRecords, 'r') === 48 && /count="48"/.test(xml.cacheRecords) && xml.cacheRecords.match(/<r>.*?<\/r>/g).every(r => (r.match(/<(x|n|m)\b/g) || []).length === 3));
const unescaped = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const sharedItems = field => Array.from(xml.cacheDefinition.matchAll(/<cacheField name="([^"]*)"[^>]*>(.*?)<\/cacheField>/g)).map(m => ({ name: m[1], items: Array.from(m[2].matchAll(/<s v="([^"]*)"/g), s => unescaped(s[1])) }))[field];
const cacheSums = {};
xml.cacheRecords.match(/<r>.*?<\/r>/g).forEach(r => {
  const x = Array.from(r.matchAll(/<x v="(\d+)"/g), m => Number(m[1]));
  const key = sharedItems(0).items[x[0]] + '|' + sharedItems(1).items[x[1]];
  cacheSums[key] = (cacheSums[key] || 0) + Number(/<n v="([^"]*)"/.exec(r)[1]);
});
check('xml : les enregistrements du cache redonnent chaque somme du tableau que le moteur a calculé',
  atlasBuilt.result.rows.every((row, i) => atlasBuilt.result.cols.every((col, j) => (atlasBuilt.result.cells[i][j] === null ? cacheSums[row.labels[0] + '|' + col.label] === undefined : near(cacheSums[row.labels[0] + '|' + col.label], atlasBuilt.result.cells[i][j])))));
check('xml : le tableau - champ en rangées, champ en colonnes, valeur, fonction par défaut (somme) sans `subtotal`, les deux totaux, le nom du champ « Valeurs »',
  /<rowFields count="1"><field x="0"\/>/.test(xml.table) && /<colFields count="1"><field x="1"\/>/.test(xml.table) && /<dataField name="Somme de Stock × PrixAchat" fld="2" baseField="0" baseItem="0"\/>/.test(xml.table)
  && /rowGrandTotals="1" colGrandTotals="1"/.test(xml.table) && /dataCaption="Valeurs"/.test(xml.table) && /grandTotalCaption="Total"/.test(xml.table) && /cacheId="1"/.test(xml.table));
check('xml : l\'emplacement du tableau (première ligne 3, en-têtes sur deux lignes, donnée dès la colonne 1)',
  new RegExp(`<location ref="A3:[A-Z]+${3 + view.height - 1}" firstHeaderRow="1" firstDataRow="2" firstDataCol="1"/>`).test(xml.table) && xml.ref === 'A3:' + 'ABCDEFGHIJ'[view.width - 1] + (3 + view.height - 1));
const rowItems = /<rowItems count="(\d+)">(.*?)<\/rowItems>/.exec(xml.table);
const colItems = /<colItems count="(\d+)">(.*?)<\/colItems>/.exec(xml.table);
check('xml : une ligne par rangée plus le total général ; une colonne par colonne plus le total général',
  Number(rowItems[1]) === atlasBuilt.result.rows.length + 1 && /<i t="grand"><x\/><\/i>$/.test(rowItems[2]) && Number(colItems[1]) === atlasBuilt.result.cols.length + 1 && /<i t="grand"><x\/><\/i>$/.test(colItems[2]));
check('xml : les éléments de chaque champ se suivent dans l\'ordre des éléments partagés (un `item x` par élément, sans sous-total par défaut)',
  count(xml.table, 'item') === view.items0.length + view.items1.length && /defaultSubtotal="0"/.test(xml.table) && !/t="default"/.test(xml.table));

// 5. Les variantes : deux niveaux sans colonne, nombre, moyenne, minimum, maximum, rien d'additionné.
const two = build({ rows: ['categorie', 'zone'], agg: 'count' }, atlasRecords, ['categorie', 'zone', ''], 'Nombre de lignes');
const twoXml = parts(two.plan);
const twoRows = /<rowItems count="(\d+)">(.*?)<\/rowItems>/.exec(twoXml.table);
check('variante : deux niveaux de rangées sans colonne qui compte les lignes - le champ « Ligne » compte, `subtotal="count"`, le niveau d\'avant repris (`r="1"`), une seule colonne de données',
  wellFormed(twoXml.table) && wellFormed(twoXml.cacheDefinition) && /subtotal="count"/.test(twoXml.table) && !/colFields/.test(twoXml.table) && /<colItems count="1"><i\/><\/colItems>/.test(twoXml.table)
  && /<cacheField name="Ligne"/.test(twoXml.cacheDefinition) && /<rowFields count="2"><field x="0"\/><field x="1"\/>/.test(twoXml.table) && /<i r="1"><x v="\d+"\/><\/i>/.test(twoRows[2])
  && Number(twoRows[1]) === two.result.rows.length + 1 && /firstDataRow="1" firstDataCol="2"/.test(twoXml.table) && /rowGrandTotals="1" colGrandTotals="1"/.test(twoXml.table));
const noTotals = build({ rows: ['categorie'], agg: 'count', totals: { rows: false, cols: false } }, atlasRecords, ['categorie', ''], 'Nombre de lignes');
const noTotalsXml = parts(noTotals.plan);
check('variante : sans total, ni ligne « grand » ni les deux réglages de totaux généraux', /rowGrandTotals="0" colGrandTotals="0"/.test(noTotalsXml.table) && !/t="grand"/.test(noTotalsXml.table));
const bottomOnly = build({ rows: ['categorie'], agg: 'count', totals: { rows: true, cols: true } }, atlasRecords, ['categorie', ''], 'Nombre de lignes');
check('variante : sans colonne en colonnes, le total du bas est demandé par les deux réglages (la colonne de droite n\'existe pas)', /rowGrandTotals="1" colGrandTotals="1"/.test(parts(bottomOnly.plan).table));
const aggs = {};
for (const agg of ['average', 'min', 'max']) {
  const built = build({ rows: ['categorie'], value: { kind: 'column', path: 'v' }, agg }, atlasRecords.map(r => Object.assign({}, r, { value: r.value })), ['categorie', 'Stock'], agg);
  aggs[agg] = parts(built.plan).table;
}
check('variante : moyenne, minimum et maximum donnent leur `subtotal`', /subtotal="average"/.test(aggs.average) && /subtotal="min"/.test(aggs.min) && /subtotal="max"/.test(aggs.max));

// 6. La valeur : bornes, entiers, cases vides.
const blanks = build({ rows: ['a'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { a: 'x' }, value: 3 }, { dims: { a: 'x' }, value: null }, { dims: { a: 'y' }, value: 5 }], ['a', 'v'], 'Somme de v');
const blanksXml = parts(blanks.plan);
check('valeur : une case vide est `<m/>` dans le cache et `containsBlank` dans sa description, les bornes sont celles des nombres',
  /<m\/>/.test(blanksXml.cacheRecords) && /containsBlank="1"/.test(blanksXml.cacheDefinition) && /minValue="3" maxValue="5"/.test(blanksXml.cacheDefinition) && /containsInteger="1"/.test(blanksXml.cacheDefinition) && wellFormed(blanksXml.cacheDefinition));
const decimals = build({ rows: ['a'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { a: 'x' }, value: 1.5 }, { dims: { a: 'y' }, value: 2 }], ['a', 'v'], 'Somme de v');
check('valeur : un nombre à virgule n\'est pas `containsInteger`, et sans case vide la description le dit (`containsSemiMixedTypes="0"`)', !/containsInteger/.test(parts(decimals.plan).cacheDefinition) && /containsSemiMixedTypes="0"/.test(parts(decimals.plan).cacheDefinition));
const filled = build({ rows: ['a'], value: { kind: 'column', path: 'v' }, agg: 'count' }, [{ dims: { a: 'x' }, value: 'texte' }, { dims: { a: 'x' }, value: '' }, { dims: { a: 'y' }, value: 'autre' }], ['a', 'v'], 'Nombre de v');
check('valeur : compter les valeurs d\'une colonne écrit un champ « renseigné » (1 pour une valeur, vide sinon), pas les valeurs elles-mêmes', same(filled.plan && JSON.parse(evalIn(ctx, '(p => JSON.stringify([p.source.headers[1], p.source.rows.map(r => r[1])]))')(filled.plan)), ['v (renseigné)', [1, null, 1]]));

// 7. Ce qu'Excel ne saurait pas refaire : pas de plan.
const withError = build({ rows: ['a'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { a: 'x' }, value: 'abc' }], ['a', 'v'], 'Somme de v');
check('refus : une valeur qui n\'est pas un nombre (case en erreur dans le tableau écrit) : pas de plan', withError.plan === null);
const listed = build({ rows: ['a'], agg: 'count' }, [{ dims: { a: ['x', 'y'] } }], ['a', ''], 'Nombre de lignes');
check('refus : une liste de choix en regroupement : pas de plan', listed.plan === null);
const caseClash = build({ rows: ['a'], agg: 'count' }, [{ dims: { a: 'Paris' } }, { dims: { a: 'paris' } }], ['a', ''], 'Nombre de lignes');
check('refus : deux textes qui ne diffèrent que par la casse (un seul élément pour Excel) : pas de plan', caseClash.plan === null);
ctx.__INFO = JSON.stringify({ def: { rows: ['a'], cols: [], agg: 'count' }, result: { rows: [], cells: [] }, flat: { rows: [] } });
check('refus : un tableau sans rangée : pas de plan', evalIn(ctx, 'XlsxPivot.plan(JSON.parse(__INFO), {})') === null);

// 8. Les noms : uniques pour Excel (sans tenir compte de la casse), écrits sans risque dans le XML.
const names = build({ rows: ['a'], cols: ['b'], value: { kind: 'column', path: 'v' }, agg: 'sum' }, [{ dims: { a: 'x', b: 'y' }, value: 1 }], ['Même', 'même', 'même'], 'même');
ctx.__PLAN = names.plan;
check('noms : trois colonnes de même nom et un titre de valeur de même nom donnent quatre noms différents', same(JSON.parse(evalIn(ctx, 'JSON.stringify(__PLAN.source.headers.concat([__PLAN.dataName]))')).map(n => n.toLowerCase()).filter((n, i, all) => all.indexOf(n) === i).length, 4));
const dirty = build({ rows: ['a'], agg: 'count' }, [{ dims: { a: 'R&D <"équipe">' } }], ['Zone "A" & <B>', ''], 'Nombre');
const dirtyXml = parts(dirty.plan, { name: 'T & "1"', sourceSheet: 'D\'onnées & <x>' });
check('échappement : & < > " dans un nom, un élément ou une feuille restent du XML bien formé', wellFormed(dirtyXml.cacheDefinition) && wellFormed(dirtyXml.table) && /v="R&amp;D &lt;&quot;équipe&quot;&gt;"/.test(dirtyXml.cacheDefinition) && /sheet="D'onnées &amp; &lt;x&gt;"/.test(dirtyXml.cacheDefinition));

summarizeAndExit();
