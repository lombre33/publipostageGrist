// Le moteur du tableau croisé (TCD) de la grille : regrouper des lignes, les croiser (une ou deux colonnes de Grist en lignes, une en colonnes) et
// additionner une valeur dans chaque case. Un module PUR : aucune dépendance au DOM, à Grist ni à l'éditeur ; seul js/formula.js est lu, pour la
// valeur qui est un Calcul comme celui d'une bulle (`Stock × PrixAchat`, évalué ligne par ligne puis additionné). Il ne crée aucune valeur dans Grist
// et n'écrit rien : il reçoit des lignes déjà lues, il rend une matrice. La zone, sa fenêtre, la Lecture et les exports (lots suivants) lisent cette
// matrice ; aucun autre fichier ne connaît encore ce module.
//
// La définition d'un tableau croisé (`normalize`) - ce que la zone portera, en JSON, dans la page :
//   { v: 1, source: null | { table, scope: 'linked'|'view'|'table' }, rows: [chemin] | [chemin, chemin], cols: [] | [chemin],
//     value: null | { kind: 'column', path } | { kind: 'formula', formula }, agg: 'sum'|'count'|'average'|'min'|'max',
//     totals: { rows, cols }, sort: 'choices'|'az'|'za'|'total', filter: null | { mode, rules }, format: null | { type: 'number', style?, decimals?, currency?, percent?, zero? } }
// - Un `chemin` est le nom d'une colonne de la table source, ou un chemin par références (« Emplacement.Zone ») : le moteur ne le suit pas, c'est celui qui
//   lit les lignes qui le fait (`needs` dit quoi lire).
// - `source` (quelles lignes lire), `filter` (lesquelles retenir : la condition d'une bulle, `{ mode: 'all'|'any', rules }`, dont les règles se lisent dans js/condition-rules.js) et
//   `format` (comment écrire un nombre : celui d'une bulle, réduit à ce que le tableau règle - séparateurs, décimales, devise, pourcentage, zéro) ne sont pas lus par le moteur : il
//   garde le filtre tel quel (celui qui lit les lignes le retient) et ramène le format à ses seules clés connues (`normalizeFormat`). Sans `value`, le tableau compte les lignes (agg vaut 'count').
// - `totals.rows` : la colonne des totaux de chaque ligne ; `totals.cols` : la ligne des totaux de chaque colonne. Un total est calculé sur les LIGNES de la
//   rangée (une moyenne de la rangée, pas la somme de ses moyennes) et une ligne n'y compte qu'une fois, même quand une liste de choix la met dans plusieurs
//   cases.
//
// Une ligne source, pour `compute` : { dims: { [chemin]: valeur }, value: valeur brute, vars: { 'Table.Colonne': valeur brute } }.
// - `dims` : la valeur de chaque colonne de regroupement. Une chaîne, un nombre ou un booléen ; vide (null, '', texte d'espaces, liste vide) = la rangée
//   « (vide) », toujours en dernier ; une liste (Liste de choix, Liste de références) met la ligne dans chacun de ses éléments ; un objet
//   `{ label, order }` donne le texte montré et un rang de tri (l'ordre des choix de Grist, l'ordre des lignes d'une référence, une date en secondes) :
//   c'est celui qui lit la ligne qui connaît le format d'affichage de la colonne, le moteur ne formate rien.
// - `value` : la valeur de la colonne sommée (`value.kind === 'column'`). `vars` : les valeurs des variables du Calcul (`kind === 'formula'`) ; une
//   variable illisible se donne `{ error: texte }`, comme `calcOperand` de js/variables.js.
//
// Ce que rend `compute` : { rows: [{ labels, keys, empty, from }], cols: [{ label, key, empty }], cells: [rangées de valeurs], rowTotals, colTotals, grand, records,
// warnings } - ou { error } quand la définition ou le Calcul ne se lit pas. Une valeur de case est un nombre, `null` (aucune ligne dans la case) ou
// `{ error }` : une ligne dont la valeur n'est pas un nombre, ou dont le Calcul échoue, fait dire son erreur à la case qu'elle touche et à tous les totaux
// qui la contiennent, au lieu de fausser une somme sans que personne le voie. `from` : le premier niveau de la rangée qui change par rapport à la rangée
// d'avant (0 pour la première) : avec deux colonnes en lignes, on n'écrit le texte du niveau 1 qu'à partir de là. Sans colonne en colonnes, `cols` n'a
// qu'une colonne sans texte, `rowTotals` vaut `null` et `colTotals` n'a que le total général (la ligne du bas).
// `flat` met les mêmes lignes à plat (une ligne par ligne source, le texte de chaque colonne de regroupement, la valeur) pour le vrai tableau croisé d'Excel que l'export Excel écrit (js/xlsx-pivot.js).
const Pivot = (function () {
  const VERSION = 1;
  const AGGREGATES = ['sum', 'count', 'average', 'min', 'max'];
  const SORTS = ['choices', 'az', 'za', 'total'];
  const SCOPES = ['linked', 'view', 'table'];
  const MAX_ROW_LEVELS = 2;
  // Au-delà de ce nombre de colonnes, le résultat porte l'avertissement `manyColumns` (comme les 1 000 lignes de la Boucle) : un PDF ne tient plus qu'en lettres minuscules.
  const COLUMN_WARNING = 50;
  const EMPTY_KEY = '\u0000vide';
  const KEY_SEPARATOR = '\u0001';

  const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const pathOf = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const isBlank = raw => raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()) || (Array.isArray(raw) && !raw.length);
  // Le bruit des nombres à virgule (0,1 + 0,2) : quinze chiffres significatifs, comme js/formula.js ; jamais de « -0 ».
  function clean(n) {
    const rounded = Number(n.toPrecision(15));
    return rounded === 0 ? 0 : rounded;
  }
  const detached = value => (isPlain(value) ? JSON.parse(JSON.stringify(value)) : null);

  // Le format d'écriture d'un nombre (celui des bulles : js/variable-format.js:formatNumber), réduit à ce que le tableau règle : `style` ('fr', 'us' ou 'none' : les séparateurs ; absent = ceux de la langue
  // de l'interface), `decimals` (0 à 3 ; absent = automatique), `currency` (un symbole ou un mot de six signes au plus), `percent` (vrai : 0,256 s'écrit 25,6 %) et `zero: 'show'` (le zéro s'écrit ; sans
  // lui, une valeur nulle ne s'écrit pas, comme dans une bulle). Une clé inconnue ou hors limites est retirée ; sans aucun réglage, null (l'écriture par défaut).
  function normalizeFormat(raw) {
    if (!isPlain(raw)) return null;
    const format = { type: 'number' };
    if (raw.style === 'fr' || raw.style === 'us' || raw.style === 'none') format.style = raw.style;
    if (Number.isInteger(raw.decimals) && raw.decimals >= 0 && raw.decimals <= 3) format.decimals = raw.decimals;
    const currency = typeof raw.currency === 'string' ? raw.currency.trim() : '';
    if (currency && currency.length <= 6) format.currency = currency;
    if (raw.percent === true) format.percent = true;
    if (raw.zero === 'show') format.zero = 'show';
    return Object.keys(format).length > 1 ? format : null;
  }

  // La forme sûre d'une définition lue dans la page (objet ou JSON) ; null si elle ne tient pas : rien en lignes, plus de deux colonnes en lignes ou
  // plus d'une en colonnes, une colonne posée deux fois, une valeur ou une fonction inconnue.
  function normalize(raw) {
    let def = raw;
    if (typeof def === 'string') {
      try { def = JSON.parse(def); } catch (e) { return null; }
    }
    if (!isPlain(def)) return null;
    const rows = Array.isArray(def.rows) ? def.rows.map(pathOf) : [];
    const cols = Array.isArray(def.cols) ? def.cols.map(pathOf) : [];
    if (!rows.length || rows.length > MAX_ROW_LEVELS || cols.length > 1) return null;
    const all = rows.concat(cols);
    if (all.some(path => path === null) || new Set(all).size !== all.length) return null;
    let value = null;
    if (def.value !== null && def.value !== undefined) {
      if (!isPlain(def.value)) return null;
      if (def.value.kind === 'column' && pathOf(def.value.path)) value = { kind: 'column', path: pathOf(def.value.path) };
      else if (def.value.kind === 'formula' && typeof def.value.formula === 'string' && def.value.formula.trim()) value = { kind: 'formula', formula: def.value.formula.trim() };
      else return null;
    }
    let agg = def.agg === undefined ? 'sum' : def.agg;
    if (AGGREGATES.indexOf(agg) < 0) return null;
    if (!value) agg = 'count';
    const sort = def.sort === undefined ? 'choices' : def.sort;
    if (SORTS.indexOf(sort) < 0) return null;
    let source = null;
    if (def.source !== null && def.source !== undefined) {
      const scope = def.source.scope === undefined ? 'linked' : def.source.scope;
      if (!isPlain(def.source) || !pathOf(def.source.table) || SCOPES.indexOf(scope) < 0) return null;
      source = { table: pathOf(def.source.table), scope };
    }
    const totals = isPlain(def.totals) ? { rows: def.totals.rows !== false, cols: def.totals.cols !== false } : { rows: true, cols: true };
    return { v: VERSION, source, rows, cols, value, agg, totals, sort, filter: detached(def.filter), format: normalizeFormat(def.format) };
  }

  // Ce que celui qui lit les lignes doit lire pour chacune : `dims` (les chemins de regroupement, lignes puis colonnes) et `measure` - null, `{ kind:
  // 'column', path }` ou `{ kind: 'formula', variables: [{ key, table, column }] }` (Formula.variablesOf). { error } quand la définition ou le Calcul ne se lit pas.
  function needs(raw) {
    const def = normalize(raw);
    if (!def) return { error: { code: 'badDefinition' } };
    const out = { dims: def.rows.concat(def.cols), measure: null };
    if (def.value && def.value.kind === 'column') out.measure = { kind: 'column', path: def.value.path };
    if (def.value && def.value.kind === 'formula') {
      const parsed = Formula.parse(def.value.formula);
      if (parsed.error) return { error: parsed.error };
      out.measure = { kind: 'formula', variables: Formula.variablesOf(parsed.ast) };
    }
    return out;
  }

  // Comment lire la valeur d'une ligne : rend { read(record) -> { n, filled, error? } } ou { error } (Calcul illisible). `n` : le nombre (null s'il n'y en a pas),
  // `filled` : la ligne compte pour « Nombre » (une valeur non vide, ou un Calcul qui rend un nombre ; sans valeur, toute ligne compte).
  function measureReader(def) {
    if (!def.value) return { read: () => ({ n: null, filled: true }) };
    if (def.value.kind === 'column') {
      return {
        read(record) {
          const raw = record.value;
          if (def.agg === 'count') return { n: null, filled: !isBlank(raw) };
          const found = Formula.toNumber(raw);
          return found.error ? { error: found.error } : { n: found.value, filled: found.value !== null };
        },
      };
    }
    const parsed = Formula.parse(def.value.formula);
    if (parsed.error) return { error: parsed.error };
    const variables = Formula.variablesOf(parsed.ast);
    return {
      read(record) {
        const vars = record.vars || {};
        const values = {};
        for (const variable of variables) {
          const raw = vars[variable.key];
          if (raw === undefined) continue;
          if (isPlain(raw) && 'error' in raw) { values[variable.key] = { error: raw.error }; continue; }
          const items = Array.isArray(raw) ? raw : [raw];
          const numbers = [];
          for (const item of items) {
            const found = Formula.toNumber(item);
            if (found.error) return { error: Object.assign({ key: variable.key }, found.error) };
            numbers.push(found.value);
          }
          values[variable.key] = Array.isArray(raw) ? numbers : numbers[0];
        }
        const result = Formula.evaluate(parsed.ast, values);
        if (result.error) return { error: result.error };
        return { n: result.value, filled: result.value !== null };
      },
    };
  }

  // Les rangées (ou colonnes) où tombe une valeur de regroupement : [{ key, label, order, empty }] ; une liste en donne une par élément (sans doublon).
  function bucketsOf(raw, labels) {
    const found = [];
    const seen = new Set();
    const add = (label, order) => {
      const key = label === null ? EMPTY_KEY : label;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ key, label: label === null ? labels.empty : label, order, empty: label === null });
    };
    const one = item => {
      if (item === null || item === undefined) return add(null);
      if (typeof item === 'boolean') return add(item ? labels.yes : labels.no, item ? 1 : 0);
      if (typeof item === 'number') return Number.isFinite(item) ? add(String(item), item) : add(null);
      if (isPlain(item) && 'label' in item) {
        const text = item.label === null || item.label === undefined ? '' : String(item.label);
        return text.trim() ? add(text, Number.isFinite(item.order) ? item.order : undefined) : add(null);
      }
      const text = String(item);
      return text.trim() ? add(text) : add(null);
    };
    if (Array.isArray(raw)) {
      if (!raw.length) add(null);
      else raw.forEach(one);
    } else {
      one(raw);
    }
    return found;
  }

  const compareText = (function () {
    if (typeof Intl !== 'undefined' && Intl.Collator) return new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare;
    return (a, b) => (a < b ? -1 : (a > b ? 1 : 0));
  })();

  // Rangs d'une rangée entre deux entrées d'un même niveau : le vide toujours en dernier, puis selon le tri.
  function compareBuckets(mode, x, y, totalOf) {
    if (x.empty !== y.empty) return x.empty ? 1 : -1;
    const byLabel = () => compareText(x.label, y.label);
    if (mode === 'az') return byLabel();
    if (mode === 'za') return -byLabel();
    if (mode === 'total') {
      const tx = totalOf(x);
      const ty = totalOf(y);
      return tx === ty ? byLabel() : (ty > tx ? 1 : -1);
    }
    const ox = x.order;
    const oy = y.order;
    if ((ox === undefined) !== (oy === undefined)) return ox === undefined ? 1 : -1;
    if (ox !== undefined && ox !== oy) return ox - oy;
    return byLabel();
  }

  // Le tableau croisé de `records` selon la définition `raw`. `opts.labels` : les textes de la rangée vide et des booléens ({ empty, yes, no }, en français par défaut).
  function compute(raw, records, opts) {
    const def = normalize(raw);
    if (!def) return { error: { code: 'badDefinition' } };
    const labels = Object.assign({ empty: '(vide)', yes: 'Oui', no: 'Non' }, opts && opts.labels);
    const measure = measureReader(def);
    if (measure.error) return { error: measure.error };
    const list = Array.isArray(records) ? records : [];
    const contributions = list.map(record => measure.read(record || {}));
    const depth = def.rows.length;
    const columnPath = def.cols[0] || null;

    // Où tombe chaque ligne : sa rangée, sa colonne, leur case - par numéro de ligne, une ligne une seule fois par ensemble.
    const rowMap = new Map();
    const columnMap = new Map();
    const outerMap = new Map();
    const cellMap = new Map();
    const all = [];
    const NO_COLUMN = { key: '', label: '', order: undefined, empty: false };
    const into = (map, key, make, index) => {
      if (!map.has(key)) map.set(key, make());
      map.get(key).recs.add(index);
    };
    list.forEach((record, index) => {
      const dims = (record && record.dims) || {};
      all.push(index);
      let tuples = [[]];
      def.rows.forEach(path => { tuples = tuples.reduce((acc, tuple) => acc.concat(bucketsOf(dims[path], labels).map(bucket => tuple.concat([bucket]))), []); });
      const columns = columnPath ? bucketsOf(dims[columnPath], labels) : [NO_COLUMN];
      for (const column of columns) into(columnMap, column.key, () => ({ levels: column, recs: new Set() }), index);
      for (const tuple of tuples) {
        const rowKey = tuple.map(level => level.key).join(KEY_SEPARATOR);
        into(rowMap, rowKey, () => ({ key: rowKey, levels: tuple, recs: new Set() }), index);
        if (depth > 1) into(outerMap, tuple[0].key, () => ({ recs: new Set() }), index);
        for (const column of columns) into(cellMap, rowKey + KEY_SEPARATOR + KEY_SEPARATOR + column.key, () => ({ recs: new Set() }), index);
      }
    });

    // Additionner (ou compter, moyenner, minimer, maximer) les lignes d'un ensemble : un nombre, null (rien à montrer), ou { error } dès qu'une ligne en porte une.
    function aggregate(indices) {
      let count = 0;
      let filled = 0;
      let numbers = 0;
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const index of indices) {
        const found = contributions[index];
        if (found.error) return { error: found.error };
        count++;
        if (found.filled) filled++;
        if (found.n !== null && found.n !== undefined) {
          numbers++;
          sum += found.n;
          if (found.n < min) min = found.n;
          if (found.n > max) max = found.n;
        }
      }
      if (def.agg === 'count') return def.value ? filled : count;
      if (def.agg === 'sum') return clean(sum);
      if (!numbers) return null;
      if (def.agg === 'average') return clean(sum / numbers);
      return clean(def.agg === 'min' ? min : max);
    }
    const asNumber = found => (typeof found === 'number' ? found : -Infinity);
    const memo = new Map();
    const totalOfSet = (cacheKey, set) => {
      if (!memo.has(cacheKey)) memo.set(cacheKey, asNumber(aggregate(set)));
      return memo.get(cacheKey);
    };

    const rowList = Array.from(rowMap.values());
    rowList.sort((a, b) => {
      for (let level = 0; level < depth; level++) {
        const x = a.levels[level];
        const y = b.levels[level];
        if (x.key === y.key) continue;
        const totalOf = level === depth - 1
          ? () => 0
          : bucket => totalOfSet('o' + bucket.key, outerMap.get(bucket.key).recs);
        if (def.sort === 'total' && level === depth - 1) {
          if (x.empty !== y.empty) return x.empty ? 1 : -1;
          const tx = totalOfSet('r' + a.key, a.recs);
          const ty = totalOfSet('r' + b.key, b.recs);
          return tx === ty ? compareText(x.label, y.label) : (ty > tx ? 1 : -1);
        }
        return compareBuckets(def.sort, x, y, totalOf);
      }
      return 0;
    });
    const columnList = Array.from(columnMap.values());
    columnList.sort((a, b) => compareBuckets(def.sort, a.levels, b.levels, bucket => totalOfSet('c' + bucket.key, columnMap.get(bucket.key).recs)));

    const cells = rowList.map(row => columnList.map(column => {
      const found = cellMap.get(row.key + KEY_SEPARATOR + KEY_SEPARATOR + column.levels.key);
      return found ? aggregate(found.recs) : null;
    }));
    const grand = list.length ? aggregate(all) : null;
    const rowTotals = def.totals.rows && columnPath ? rowList.map(row => aggregate(row.recs)) : null;
    let colTotals = null;
    if (def.totals.cols) colTotals = columnPath ? columnList.map(column => aggregate(column.recs)) : [grand];

    const warnings = [];
    if (columnList.length > COLUMN_WARNING) warnings.push({ code: 'manyColumns', count: columnList.length });
    return {
      rows: rowList.map((row, at) => {
        const before = at ? rowList[at - 1].levels : null;
        let from = 0;
        while (before && from < depth - 1 && before[from].key === row.levels[from].key) from++;
        return { labels: row.levels.map(level => level.label), keys: row.levels.map(level => level.key), empty: row.levels.map(level => level.empty), from };
      }),
      cols: columnList.map(column => ({ label: column.levels.label, key: column.levels.key, empty: column.levels.empty })),
      cells, rowTotals, colTotals, grand, records: list.length, warnings,
    };
  }

  // Les lignes lues À PLAT, pour un tableau croisé que le tableur calcule lui-même (le vrai tableau croisé d'Excel, js/xlsx-pivot.js) : une ligne par ligne source, avec le texte de chaque colonne de regroupement
  // (lignes puis colonnes, ceux de `compute`) et la valeur qu'elle apporte. Rend { dims: [chemin], rows: [{ labels: [texte], n: nombre|null, filled }] }, ou { unsupported: 'list' | 'error' } : une liste de choix
  // met une ligne dans plusieurs rangées (le total d'un tableur compterait deux fois), et une valeur en erreur n'a pas de nombre à additionner - le tableau écrit en texte, lui, sait le dire.
  function flat(raw, records, opts) {
    const def = normalize(raw);
    if (!def) return { unsupported: 'error' };
    const labels = Object.assign({ empty: '(vide)', yes: 'Oui', no: 'Non' }, opts && opts.labels);
    const measure = measureReader(def);
    if (measure.error) return { unsupported: 'error' };
    const paths = def.rows.concat(def.cols);
    const rows = [];
    for (const record of Array.isArray(records) ? records : []) {
      const dims = (record && record.dims) || {};
      const found = measure.read(record || {});
      if (found.error) return { unsupported: 'error' };
      const texts = [];
      for (const path of paths) {
        const buckets = bucketsOf(dims[path], labels);
        if (buckets.length > 1) return { unsupported: 'list' };
        texts.push(buckets[0].label);
      }
      rows.push({ labels: texts, n: found.n === undefined ? null : found.n, filled: !!found.filled });
    }
    return { dims: paths, rows };
  }

  return { VERSION, AGGREGATES, SORTS, SCOPES, MAX_ROW_LEVELS, COLUMN_WARNING, normalize, normalizeFormat, needs, compute, flat };
})();
