// Le tableau croisé de la grille, côté lecture : lire les lignes de la table choisie, les confier au moteur (js/pivot.js), écrire le tableau obtenu et le dérouler à la place de sa ligne.
//
// Une LIGNE de la grille porte le tableau croisé : l'attribut `pivot` de la ligne (js/pivot-editor.js), écrit `data-pivot` dans le HTML du modèle - la définition de js/pivot.js:normalize, en JSON.
// À la Lecture et à tout export (js/reader-mode.js : resolveReaderBody, avec le déroulé des zones répétées de js/loop-rules.js), `expand` remplace cette ligne par les lignes du tableau : un en-tête, une rangée par valeur
// de la colonne des lignes, une ligne de totaux. Le reste de la grille ne bouge pas, sauf que ses lignes sont complétées de cases vides quand le tableau est plus large qu'elle (sans quoi un export en escalier).
// Le texte de la ligne source n'est jamais lu : la ligne devient le tableau. Chaque case est du texte déjà écrit (un nombre au format d'une bulle) : rien n'est plus à résoudre ensuite.
//
// Les lignes lues : celles que dit la source de la définition, comme les trois sources de la Boucle (js/loop-rules.js:iterate) - les lignes de la table liées à la ligne de la page par la règle de liaison, celles de la vue
// Grist du widget (son filtre et son tri), ou toute la table. Une valeur de regroupement ou de somme se lit dans la ligne elle-même ou plus loin, de référence en référence (« Emplacement.Zone »), comme une bulle ;
// le Calcul d'une valeur lit les variables de sa ligne comme une bulle « Calcul » (Variables.calcOperand, avec la ligne du tour). Rien n'est jamais écrit dans Grist.
const PivotZones = (function () {
  const ATTR = 'data-pivot';
  const ZONE_SELECTOR = 'tr[' + ATTR + ']';
  const HEAD_FILL = '#e8edf3';
  const MAX_NAME_LENGTH = 60;

  // La définition écrite dans l'attribut d'une ligne ; null si elle ne se lit pas (js/pivot.js:normalize).
  function defOf(text) { return text ? Pivot.normalize(text) : null; }

  const trim = text => (text.length > MAX_NAME_LENGTH ? text.slice(0, MAX_NAME_LENGTH - 1) + '…' : text);

  // === Les noms ===

  // Le nom d'un chemin « Emplacement.Zone » comme Grist l'affiche en tête de colonne (libellé, à défaut l'identifiant), les maillons séparés par « ▸ ».
  function pathLabel(table, path) {
    const names = [];
    let current = table;
    String(path).split('.').forEach(hop => {
      names.push(GristAPI.getColumnLabel(current, hop) || hop);
      const reference = GristAPI.referenceOf(GristAPI.getColumnType(current, hop));
      if (reference) current = reference.table;
    });
    return names.join(' ▸ ');
  }
  // Un Calcul enregistré (« {Produits.Stock} * {Produits.PrixAchat} ») écrit comme on le lit : le nom de la colonne seul, × et ÷.
  function formulaLabel(stored) {
    return String(stored).replace(/\{[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z0-9_.]+)\}/g, (all, path) => path.split('.').pop()).replace(/\*/g, '×').replace(/\//g, '÷').replace(/\s+/g, ' ').trim();
  }
  // « Somme de Stock × PrixAchat » : le titre de la valeur (la colonne des valeurs sans colonne en colonnes), « Nombre de lignes » quand rien n'est additionné.
  function valueTitle(def) {
    if (!def.value) return I18n.t('pivot.valueRows');
    const name = def.value.kind === 'formula' ? formulaLabel(def.value.formula) : pathLabel(def.source ? def.source.table : '', def.value.path);
    return I18n.t('pivot.valueTitle.' + def.agg, { name: trim(name) });
  }
  // « Catégorie × Zone · Somme de Stock × PrixAchat » : ce que dit l'étiquette de la ligne dans l'éditeur.
  function describe(def) {
    if (!def || !def.source) return '';
    const table = def.source.table;
    const rows = def.rows.map(path => pathLabel(table, path)).join(' › ');
    const grouped = def.cols.length ? rows + ' × ' + pathLabel(table, def.cols[0]) : rows;
    return trim(grouped) + ' · ' + valueTitle(def);
  }

  // === Les lignes lues ===

  // Un message de la lecture, écrit comme celui d'une bulle (« [ERREUR : … ] »).
  const wrapError = message => I18n.t('variables.error.generic', { message });
  // Le message d'une erreur sans son « [ERREUR : … ] » : celui d'une variable illisible arrive déjà entre crochets (variables.error.*).
  const bare = text => { const wrapped = /^\[[^:\]]+:\s*([\s\S]*)\]$/.exec(String(text)); return wrapped ? wrapped[1] : String(text); };
  // Un message écrit à la place du tableau, entre « [ERREUR : … ] » une seule fois (celui d'une variable illisible arrive déjà entre crochets).
  const errorLine = text => wrapError(bare(text));
  // Le texte d'une erreur du moteur ou du Calcul (même règle que Variables.resolveCalcResult : une variable illisible dit son propre message).
  function errorText(error) {
    if (!error) return wrapError(I18n.t('pivot.error.cell'));
    if (typeof error === 'string') return wrapError(error);
    const message = error.code === 'variable' ? error.message : Variables.formulaErrorText(error);
    const wrapped = /^\[[^:\]]+:\s*([\s\S]*)\]$/.exec(String(message));
    return wrapped ? String(message) : wrapError(String(message));
  }

  // De quoi lire un chemin « Emplacement.Zone » dans une ligne de `table` (lecture brute de fetchTable) : les tables des références rencontrées sont lues UNE fois (la lecture d'une bulle les relit à chaque ligne,
  // ce qui fait un tour de la table liée par ligne lue). { read(row) } rend la valeur telle que Grist l'affiche (Variables.cellValue), une liste quand le chemin traverse une liste de références ; { error } si un maillon
  // ou la colonne a disparu.
  async function pathReader(table, path, fetchRows) {
    const hops = String(path).split('.');
    const column = hops.pop();
    const chain = [];
    let current = table;
    for (const hop of hops) {
      const reference = GristAPI.referenceOf(GristAPI.getColumnType(current, hop));
      if (!reference) return { error: I18n.t('pivot.error.noColumn', { column: hop, table: current }) };
      chain.push({ column: hop, list: reference.list, byId: new Map((await fetchRows(reference.table)).map(r => [r.id, r])) });
      current = reference.table;
    }
    const type = GristAPI.getColumnType(current, column);
    if (!type) return { error: I18n.t('pivot.error.noColumn', { column, table: current }) };
    const unwrap = value => (Array.isArray(value) ? value[1] : value);
    const endTable = current;
    return {
      table: endTable, column, type,
      read(row) {
        let rows = [row];
        let multi = false;
        chain.forEach(hop => {
          const next = [];
          rows.forEach(r => {
            if (!r) { if (!hop.list) next.push(null); return; }
            if (hop.list) { Variables.listItems(r[hop.column]).forEach(id => { if (hop.byId.has(id)) next.push(hop.byId.get(id)); }); multi = true; }
            else next.push(hop.byId.get(unwrap(r[hop.column])) || null);
          });
          rows = next;
        });
        const values = rows.map(r => (r ? Variables.cellValue(endTable, column, r) : null));
        return multi ? values : (values.length ? values[0] : null);
      },
    };
  }

  // L'ordre des lignes d'une table dans Grist (manualSort, à défaut l'identifiant) : le rang d'une fiche référencée, pour ranger les rangées d'une colonne Référence comme la table.
  function rankMap(rows) {
    const rank = r => (typeof r.manualSort === 'number' ? r.manualSort : r.id);
    const map = new Map();
    rows.slice().sort((a, b) => (rank(a) - rank(b)) || (a.id - b.id)).forEach((r, i) => map.set(r.id, i));
    return map;
  }

  // Ce que le moteur reçoit pour une valeur de regroupement : le texte tel que la bulle l'écrit et un rang pour le tri - l'ordre des choix de Grist, celui des lignes de la table référencée, les secondes d'une date,
  // le nombre lui-même. Rien (null) pour une cellule vide ; une liste reste une liste, élément par élément (js/pivot.js : une ligne compte dans chaque élément).
  async function groupReader(table, path, fetchRows) {
    const found = await pathReader(table, path, fetchRows);
    if (found.error) return found;
    const choices = GristAPI.getColumnChoices(found.table, found.column);
    const reference = GristAPI.referenceOf(found.type);
    const ranks = reference ? rankMap(await fetchRows(reference.table)) : null;
    const direct = String(path).indexOf('.') === -1;
    const text = value => Variables.formatValue(value, null, found.table, found.column, {});
    const one = (value, id) => {
      if (value === null || value === undefined || value === '') return null;
      if (VariableFormat.isCellError(value)) return { label: String(value) };
      if (typeof value === 'boolean') return value;
      if (value instanceof Date) return { label: text(value), order: value.getTime() };
      if (typeof value === 'number') return { label: text(value), order: value };
      if (ranks && direct && ranks.has(id)) return { label: String(value), order: ranks.get(id) };
      const index = choices ? choices.indexOf(value) : -1;
      return index >= 0 ? { label: String(value), order: index } : String(value);
    };
    return {
      read(row) {
        const value = found.read(row);
        if (!ranks || !direct) return Array.isArray(value) ? value.map(item => one(item)) : one(value);
        // Une colonne Référence : l'identifiant de la fiche, lu dans la ligne brute, donne le rang ; la valeur affichée donne le texte.
        const raw = row[found.column];
        const ids = Variables.listItems(raw);
        if (Array.isArray(value)) return value.map((item, i) => one(item, ids[i]));
        return one(value, ids[0] !== undefined ? ids[0] : (Array.isArray(raw) ? raw[1] : raw));
      },
    };
  }

  // Lit les lignes de la source de `raw` et les met dans la forme que reçoit js/pivot.js:compute ; rend { def, records, error?, readsAll }.
  // `error` : le texte de ce qui ne se lit pas (table disparue, table plus liée à la page, colonne disparue, Calcul illisible). `ctx` : celui de LoopRules.createContext (lecture mémorisée des tables).
  async function load(raw, tableId, record, ctx) {
    const def = Pivot.normalize(raw);
    if (!def) return { error: I18n.t('pivot.error.badDefinition') };
    if (!def.source) return { def, error: I18n.t('pivot.error.noSource') };
    const need = Pivot.needs(def);
    if (need.error) return { def, error: errorText(need.error) };
    const table = def.source.table;
    if (!GristAPI.getColumns(table).length) return { def, error: I18n.t('pivot.error.noTable', { table }) };
    const context = ctx || LoopRules.createContext();
    // La table de la page n'a pas de « lignes liées à la ligne de la page » : sa propre vue (js/loop-rules.js:allSourceFor).
    const scope = def.source.scope === 'linked' && table === tableId ? 'view' : def.source.scope;
    const loop = { repeat: 'row', table, via: null, within: null, by: null, all: scope === 'linked' ? null : scope, filter: null, sort: { column: null, direction: 'asc' } };
    const found = await LoopRules.iterate(loop, tableId, record, context);
    if (found.error) return { def, error: found.error === 'noLink' ? I18n.t('pivot.error.noLink', { table }) : I18n.t('pivot.error.source', { table, reason: found.error }) };
    const fetchRows = context.fetchRows;
    const groupers = {};
    for (const path of need.dims) {
      const reader = await groupReader(table, path, fetchRows);
      if (reader.error) return { def, error: reader.error };
      groupers[path] = reader;
    }
    let valueReader = null;
    if (need.measure && need.measure.kind === 'column') {
      valueReader = await pathReader(table, need.measure.path, fetchRows);
      if (valueReader.error) return { def, error: valueReader.error };
    }
    const records = [];
    for (const item of found.items) {
      const out = { dims: {}, value: null, vars: {} };
      need.dims.forEach(path => { out.dims[path] = groupers[path].read(item.row); });
      if (valueReader) out.value = valueReader.read(item.row);
      if (need.measure && need.measure.kind === 'formula' && need.measure.variables.length) {
        const opts = { loop: LoopRules.itemBinding(loop, item, null), fetchRows };
        for (const variable of need.measure.variables) out.vars[variable.key] = await Variables.calcOperand(variable, tableId, record, opts);
      }
      records.push(out);
    }
    return { def, records, readsAll: !!found.readsAll || !!context.readsAll || scope !== 'linked' };
  }

  // Le tableau d'une définition pour les lignes de la page : { def, result, error?, readsAll } - `result` est celui de js/pivot.js:compute.
  async function compute(raw, tableId, record, ctx) {
    const loaded = await load(raw, tableId, record, ctx);
    if (loaded.error) return loaded;
    const result = Pivot.compute(loaded.def, loaded.records, { labels: { empty: I18n.t('pivot.empty'), yes: I18n.t('pivot.yes'), no: I18n.t('pivot.no') } });
    if (result.error) return { def: loaded.def, error: errorText(result.error) };
    return { def: loaded.def, result, records: loaded.records.length, readsAll: loaded.readsAll };
  }

  // === Le tableau écrit ===

  // Un nombre du tableau au format d'une bulle (celui de la définition, sinon celui de la colonne ou, pour un Calcul, d'une colonne Numérique) ; « » pour une case sans ligne ; l'erreur d'une ligne, dite.
  function cellText(value, def) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return errorText(value.error);
    const format = def.format && typeof def.format === 'object' ? def.format : null;
    const opts = { keepZero: !!(format && format.zero === 'show') };
    if (def.agg === 'count') return Variables.formatValue(value, { type: 'number', style: 'none', decimals: 0, zero: 'show' }, null, null, Object.assign({ colType: 'Int' }, opts));
    if (def.value && def.value.kind === 'column') return Variables.formatValue(value, format, def.source.table, def.value.path, opts);
    return Variables.formatValue(value, format, null, null, Object.assign({ colType: 'Numeric' }, opts));
  }

  // Les lignes du tableau, à écrire : [{ kind: 'head'|'body'|'total', cells: [{ text, bold?, right?, fill?, error? }] }], et la largeur (le nombre de cases d'une ligne). Rien n'est écrit dans le document ici : l'éditeur en
  // montre le début (js/pivot-editor.js), `toRows` en fait des <tr>.
  function layout(result, def) {
    const table = def.source.table;
    const depth = def.rows.length;
    const rows = [];
    const head = (text, extra) => Object.assign({ text, bold: true, fill: HEAD_FILL }, extra);
    const header = def.rows.map(path => head(trim(pathLabel(table, path))));
    if (def.cols.length) result.cols.forEach(column => header.push(head(column.label, { right: true })));
    else header.push(head(valueTitle(def), { right: true }));
    if (result.rowTotals) header.push(head(I18n.t('pivot.total'), { right: true }));
    rows.push({ kind: 'head', cells: header });
    const number = (value, extra) => {
      const text = cellText(value, def);
      return Object.assign({ text, right: true, error: !!(value && typeof value === 'object') }, extra);
    };
    result.rows.forEach((row, index) => {
      const cells = row.labels.map((label, level) => ({ text: level < row.from ? '' : label }));
      result.cells[index].forEach(value => cells.push(number(value)));
      if (result.rowTotals) cells.push(number(result.rowTotals[index], { bold: true }));
      rows.push({ kind: 'body', cells });
    });
    if (result.colTotals) {
      const cells = [{ text: I18n.t('pivot.total'), bold: true, fill: HEAD_FILL }];
      for (let i = 1; i < depth; i++) cells.push({ text: '', fill: HEAD_FILL });
      result.colTotals.forEach(value => cells.push(number(value, { bold: true, fill: HEAD_FILL })));
      if (result.rowTotals) cells.push(number(result.grand, { bold: true, fill: HEAD_FILL }));
      rows.push({ kind: 'total', cells });
    }
    return { rows, width: rows[0].cells.length };
  }

  // === Le déroulé ===

  // La largeur de chaque colonne de la grille (colwidth des cases de la ligne, une valeur par colonne couverte), null quand une colonne n'en porte pas.
  function widthsOf(tr) {
    const widths = [];
    Array.from(tr.children).forEach(cell => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan'), 10) || 1);
      const known = String(cell.getAttribute('colwidth') || '').split(',').map(w => parseInt(w, 10));
      for (let i = 0; i < span; i++) widths.push(known[i] > 0 ? known[i] : null);
    });
    return widths;
  }
  const spanOf = row => Array.from(row.children).reduce((sum, cell) => sum + Math.max(1, parseInt(cell.getAttribute('colspan'), 10) || 1), 0);
  const gridWidth = table => Array.from(table.rows).reduce((max, row) => Math.max(max, spanOf(row)), 0);

  function makeCell(tag, spec, width) {
    const cell = document.createElement(tag);
    if (width) cell.setAttribute('colwidth', String(width));
    if (spec.fill) cell.style.backgroundColor = spec.fill;
    const paragraph = document.createElement('p');
    if (spec.right) paragraph.style.textAlign = 'right';
    if (spec.bold) { const strong = document.createElement('strong'); strong.textContent = spec.text; paragraph.appendChild(strong); }
    else paragraph.textContent = spec.text;
    cell.appendChild(paragraph);
    return cell;
  }
  // Les <tr> d'un tableau écrit, sur `columns` colonnes (les cases qui manquent sont vides) ; `widths` : les largeurs de la grille, reprises case par case.
  function toRows(rows, columns, widths) {
    return rows.map(row => {
      const tr = document.createElement('tr');
      for (let i = 0; i < columns; i++) {
        const spec = row.cells[i] || { text: '' };
        tr.appendChild(makeCell(row.kind === 'head' ? 'th' : 'td', spec, widths[i]));
      }
      return tr;
    });
  }
  // Une ligne d'une seule case sur toute la largeur, qui dit pourquoi le tableau n'est pas là.
  function messageRow(text, columns) {
    const tr = document.createElement('tr');
    const cell = makeCell('td', { text }, null);
    if (columns > 1) cell.setAttribute('colspan', String(columns));
    tr.appendChild(cell);
    return tr;
  }
  // Les autres lignes de la grille, complétées jusqu'à la nouvelle largeur : une ligne qui n'avait qu'une case sur toute la largeur (un titre fusionné) l'étend, les autres reçoivent des cases vides.
  function padRows(table, oldWidth, newWidth) {
    if (newWidth <= oldWidth) return;
    Array.from(table.rows).forEach(row => {
      const have = spanOf(row);
      if (have >= newWidth) return;
      if (row.children.length === 1 && have === oldWidth && have > 1) {
        row.children[0].setAttribute('colspan', String(newWidth));
        row.children[0].removeAttribute('colwidth');
        return;
      }
      for (let i = have; i < newWidth; i++) row.appendChild(makeCell('td', { text: '' }, null));
    });
  }

  // Remplace chaque ligne de tableau croisé de `root` par son tableau. `ctx` : celui de LoopRules.createContext, partagé avec le déroulé des boucles (lecture mémorisée des tables ; `readsAll` y dit à la Lecture de se redessiner
  // quand la vue de Grist change). Sans ligne de la page (rien à afficher) la ligne est simplement retirée.
  async function expand(root, tableId, record, ctx) {
    if (!root) return;
    for (const tr of Array.from(root.querySelectorAll(ZONE_SELECTOR))) {
      const table = tr.closest('table');
      if (!table) { tr.remove(); continue; }
      if (!record || !tableId) { tr.remove(); continue; }
      const widths = widthsOf(tr);
      const oldWidth = Math.max(gridWidth(table), widths.length, 1);
      let rows;
      let columns = oldWidth;
      try {
        const built = await compute(tr.getAttribute(ATTR), tableId, record, ctx);
        if (ctx && built.readsAll) ctx.readsAll = true;
        if (built.error) rows = [messageRow(errorLine(built.error), oldWidth)];
        else if (!built.result.rows.length) rows = [messageRow(wrapError(I18n.t('pivot.error.noRows')), oldWidth)];
        else {
          const laid = layout(built.result, built.def);
          columns = Math.max(oldWidth, laid.width);
          rows = toRows(laid.rows, columns, widths);
        }
      } catch (e) {
        console.error('[PivotZones] échec du tableau croisé', e);
        rows = [messageRow(wrapError(I18n.t('pivot.error.cell')), oldWidth)];
      }
      tr.replaceWith(...rows);
      padRows(table, oldWidth, columns);
    }
  }

  return { ATTR, ZONE_SELECTOR, defOf, pathLabel, formulaLabel, valueTitle, describe, load, compute, layout, cellText, toRows, expand, errorText, errorLine };
})();
