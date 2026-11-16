// La fenêtre « Tableau croisé » : régler le tableau que porte une ligne de la grille (js/pivot-editor.js) - la table lue, ses lignes, ce qu'on met en lignes, en colonnes et dans les cases, les totaux, l'ordre - et voir le
// résultat tout de suite sur la ligne de la page. Ouverte par le bouton « Tableau croisé… » de la barre du tableau et par le bouton « Modifier » du cadre de la ligne.
//
// Les colonnes se choisissent dans la liste avec recherche des autres fenêtres (js/search-select.js) et, comme elles, on y descend de Référence en Référence (« Emplacement ▸ Zone ») : le chemin choisi s'enregistre
// « Emplacement.Zone » (js/pivot.js). La valeur des cases est « Nombre de lignes », une colonne de Grist qu'on additionne (ou compte, moyenne, minimum, maximum), ou un Calcul écrit comme celui d'une bulle
// (js/variable-calc.js : « #Produits.Stock * #Produits.PrixAchat », évalué pour chaque ligne puis additionné). Les lignes lues se filtrent comme celles d'une Boucle (« Lignes retenues » : les mêmes règles et groupes,
// js/condition-fields.js) et les nombres s'écrivent comme ceux d'une bulle (séparateurs, décimales, devise, pourcentage, zéro). Rien n'est écrit dans Grist : la définition ne vit que dans la ligne de la grille.
//
// Rien n'est écrit avant « Valider » : « Annuler » laisse la ligne telle qu'elle était, et le tableau croisé posé ou modifié n'est qu'un seul pas d'Annuler (PivotEditor.apply). Styles : css/pivot.css.
const PivotWindow = (function () {
  const { el, option, button } = Dom;
  // L'aperçu : les premières rangées et colonnes seulement, le reste se dit en une ligne.
  const PREVIEW_ROWS = 8;
  const PREVIEW_COLUMNS = 10;
  const VALUE_KINDS = ['rows', 'calc', 'column'];

  let win = null;
  let refs = null;
  // { editor, pos, had, working, attempted } - `working` est une copie : rien n'est écrit dans la ligne avant « Valider ».
  let state = null;
  const previewRun = VariableModal.previewRunner(refreshPreview);

  // === Ce qui se choisit ===

  // Les tables proposées : celle de la page d'abord, puis celles qui lui sont liées, puis les autres dans l'ordre du document.
  function tableChoices() {
    const page = GristAPI.getCurrentTableId();
    const all = GristAPI.getTables().slice();
    const rank = table => (table === page ? 0 : linkedOk(table) ? 1 : 2);
    return all.map((table, index) => ({ table, index })).sort((a, b) => rank(a.table) - rank(b.table) || a.index - b.index).map(item => item.table);
  }
  // Les lignes de `table` se rattachent-elles à la ligne de la page par une règle de liaison (la même condition que la Boucle : js/loop-rules.js:sourceFor) ?
  function linkedOk(table) {
    const page = GristAPI.getCurrentTableId();
    return !!page && table !== page && !!LoopRules.sourceFor({ table, column: 'id' }, page, null);
  }
  // Les trois sources d'une table : [{ value, ok, reason }] - `reason` : le texte qui dit pourquoi une source est grisée (jamais retirée).
  function scopesFor(table) {
    const page = GristAPI.getCurrentTableId();
    const same = table === page;
    return [
      { value: 'linked', ok: linkedOk(table), reason: same ? I18n.t('pivot.window.linkedSame') : I18n.t('pivot.window.linkedNone', { table, page: page || '' }) },
      { value: 'view', ok: same, reason: I18n.t('pivot.window.viewOther', { page: page || '' }) },
      { value: 'table', ok: true, reason: '' },
    ];
  }
  const firstScope = table => scopesFor(table).find(scope => scope.ok).value;

  function defaultTable() {
    const choices = tableChoices();
    return choices.find(linkedOk) || GristAPI.getCurrentTableId() || choices[0] || '';
  }
  // Les réglages de départ : ceux de la définition enregistrée, ou ceux d'un tableau neuf.
  function workingFrom(def) {
    const base = def || null;
    const table = base && base.source ? base.source.table : defaultTable();
    const scope = base && base.source && scopesFor(table).some(item => item.value === base.source.scope && item.ok) ? base.source.scope : firstScope(table);
    const value = base ? base.value : null;
    const filter = base && base.filter ? ConditionRules.plainCondition(base.filter) : null;
    const format = base ? base.format : null;
    return {
      table,
      scope,
      rows: base ? base.rows.slice() : [''],
      cols: base && base.cols.length ? base.cols[0] : '',
      kind: !value ? 'rows' : value.kind === 'formula' ? 'calc' : 'column',
      valuePath: value && value.kind === 'column' ? value.path : '',
      calc: value && value.kind === 'formula' ? VariableCalc.typedFormula(value.formula) : '',
      agg: base && base.value ? base.agg : 'sum',
      totalRows: base ? base.totals.rows : true,
      totalCols: base ? base.totals.cols : true,
      sort: base ? base.sort : 'choices',
      // Le filtre : une copie des règles (la fenêtre les modifie en place, rien n'est écrit avant « Valider »).
      filterMode: filter ? filter.mode : 'all',
      rules: filter ? filter.rules : [],
      // L'écriture des nombres : les champs de la fenêtre. Le zéro se cache sauf `zero: 'show'`, comme dans une bulle.
      fmtStyle: format && format.style ? format.style : '',
      fmtDecimals: format && format.decimals !== undefined ? String(format.decimals) : '',
      fmtCurrency: format && format.currency ? format.currency : '',
      fmtPercent: !!(format && format.percent),
      fmtHideZero: !(format && format.zero === 'show'),
    };
  }

  // Le format que disent les champs d'écriture des nombres (Pivot.normalize le ramène à ses seules clés, et à rien quand tout est laissé par défaut).
  const formatOf = w => ({
    type: 'number', style: w.fmtStyle || undefined, decimals: w.fmtDecimals === '' ? undefined : Number(w.fmtDecimals),
    currency: w.fmtCurrency, percent: w.fmtPercent || undefined, zero: w.fmtHideZero ? undefined : 'show',
  });

  // La définition que disent les champs : { def } ou { missing } (la clé du texte qui dit ce qui manque).
  function definition() {
    const w = state.working;
    if (!w.table) return { missing: 'pivot.window.needTable' };
    const rows = w.rows.filter(Boolean);
    if (!rows.length) return { missing: 'pivot.window.needRows' };
    let value = null;
    if (w.kind === 'column') {
      if (!w.valuePath) return { missing: 'pivot.window.needValue' };
      value = { kind: 'column', path: w.valuePath };
    } else if (w.kind === 'calc') {
      if (!w.calc.trim()) return { missing: 'pivot.window.needValue' };
      const compiled = VariableCalc.compile(w.calc);
      if (compiled.error) return { error: compiled.error };
      value = { kind: 'formula', formula: compiled.stored };
    }
    const def = Pivot.normalize({
      v: 1, source: { table: w.table, scope: w.scope }, rows, cols: w.cols ? [w.cols] : [], value, agg: value ? w.agg : 'count',
      totals: { rows: w.totalRows, cols: w.totalCols }, sort: w.sort, filter: ConditionRules.plainCondition({ mode: w.filterMode, rules: w.rules }), format: formatOf(w),
    });
    return def ? { def } : { missing: 'pivot.window.needDifferent' };
  }

  // === Les listes de colonnes ===

  const columnPath = value => (String(value).indexOf('.') === -1 ? String(value) : String(value).split('.').slice(1).join('.'));
  const columnValue = (table, path) => (String(path).indexOf('.') === -1 ? String(path) : table + '.' + path);

  // Les colonnes qu'on peut regrouper : toutes celles de la table, sauf les pièces jointes (rien à regrouper).
  const groupable = (table, column) => GristAPI.getColumnType(table, column) !== 'Attachments';
  function fillColumns(select, table, opts) {
    select.textContent = '';
    const first = option('', I18n.t(opts.none ? 'pivot.window.none' : 'pivot.window.choose'));
    if (!opts.none) first.disabled = true;
    select.appendChild(first);
    GristAPI.getVisibleColumns(table).filter(column => !opts.groupOnly || groupable(table, column)).forEach(column => ConditionFields.appendColumnOption(select, column, table, column, true));
  }
  // Pose le chemin enregistré dans la liste : une colonne de la table est déjà une ligne de la liste, un chemin par références reçoit la sienne (comme dans les fenêtres de règles, js/condition-fields.js).
  function selectPath(select, table, path) {
    if (!path) { select.value = ''; return; }
    const value = columnValue(table, path);
    if (path.indexOf('.') !== -1) {
      const end = GristAPI.resolveColumnPath(table, path);
      if (end) SearchSelect.addDynamicOption(select, { value, name: path, hint: ConditionFields.friendlyTypeLabel(end.type), search: Variables.columnSearchText(table, path) }, path.split('.')[0]);
    }
    select.value = value;
    if (select.value !== value) select.value = '';
  }
  const belowOf = table => item => Variables.columnsBelow(item.value.indexOf('.') === -1 ? table + '.' + item.value : item.value, (target, column) => ConditionFields.friendlyTypeLabel(GristAPI.getColumnType(target, column)));
  function attachColumns(select) {
    return SearchSelect.attachColumns(select, { hintInTrigger: false, expand: item => belowOf(state.working.table)(item) });
  }

  // === Lecture des champs ===

  function readFields() {
    const w = state.working;
    w.table = refs.table.value;
    w.rows = [columnPath(refs.row1.value), refs.rowBox.hidden ? '' : columnPath(refs.row2.value)].filter(Boolean);
    w.cols = columnPath(refs.cols.value);
    w.valuePath = columnPath(refs.valueColumn.value);
    w.calc = refs.calc.value;
    w.agg = refs.agg.value;
    w.totalRows = refs.totalRows.checked;
    w.totalCols = refs.totalCols.checked;
    w.sort = refs.sort.value;
    w.fmtStyle = refs.fmtStyle.value;
    w.fmtDecimals = refs.fmtDecimals.value;
    w.fmtCurrency = refs.fmtCurrency.value.trim();
    w.fmtPercent = refs.fmtPercent.checked;
    w.fmtHideZero = refs.fmtHideZero.checked;
  }

  // === Dessin ===

  function field(labelText, control, id) {
    const label = el('label', 'pp-pivot-label', labelText);
    if (id) label.htmlFor = id;
    const box = el('div', 'pp-pivot-field');
    box.append(label, control);
    return { box, label };
  }
  function select(id) {
    const node = el('select', 'pp-dialog-input');
    node.id = id;
    return node;
  }

  // Une série de choix à une seule réponse (Dom.radioGroup) dont on peut griser certains choix, avec leur raison en info-bulle.
  function choices(labelId, className, buttonClass, values, onPick) {
    const group = Dom.radioGroup({
      className, labelId, onEnter: apply,
      options: values.map(value => ({ value, className: buttonClass })),
      onPick: (value) => { if (group.disabled && group.disabled.has(value)) { group.check(state.working[group.key]); return; } onPick(value); },
    });
    group.disabled = new Set();
    return group;
  }
  function markDisabled(group, value, disabled, reason) {
    const found = group.buttons.find(item => item.dataset.value === value);
    if (!found) return;
    if (disabled) group.disabled.add(value); else group.disabled.delete(value);
    found.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    found.title = disabled ? reason : '';
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton qui a ouvert la fenêtre.
    win = ModalBase.create({ id: 'pp-pivot-modal', titleId: 'pp-pivot-title', size: 'lg', boxClass: 'pp-pivot-box', actionsClass: 'var-modal-actions', onEscape: closeWindow, restoreFocus: false });
    const intro = el('p', 'var-modal-intro');

    const table = select('pp-pivot-table');
    const tableField = field('', table, 'pp-pivot-table');

    const sourceLabel = el('span', 'pp-pivot-label');
    sourceLabel.id = 'pp-pivot-source-label';
    const source = choices('pp-pivot-source-label', 'pp-pivot-source', 'pp-pivot-source-option', Pivot.SCOPES, (value) => { state.working.scope = value; syncSource(); previewRun.schedule(); });
    source.key = 'scope';

    const row1 = select('pp-pivot-row1');
    const row2 = select('pp-pivot-row2');
    const rowAdd = button('pp-pivot-link');
    const rowRemove = button('pp-pivot-link');
    const rowBox = el('div', 'pp-pivot-second');
    rowBox.append(row2, rowRemove);
    const rowsField = field('', row1, 'pp-pivot-row1');
    rowsField.box.append(rowBox, rowAdd);

    const cols = select('pp-pivot-cols');
    const colsField = field('', cols, 'pp-pivot-cols');

    const kindLabel = el('span', 'pp-pivot-label');
    kindLabel.id = 'pp-pivot-kind-label';
    const kind = choices('pp-pivot-kind-label', 'pp-pivot-seg', 'pp-pivot-seg-button', VALUE_KINDS, (value) => { state.working.kind = value; syncKind(); previewRun.schedule(); });
    kind.key = 'kind';
    const valueColumn = select('pp-pivot-value-column');
    const valueColumnField = field('', valueColumn, 'pp-pivot-value-column');
    const calc = el('input', 'pp-dialog-input');
    calc.id = 'pp-pivot-calc';
    calc.type = 'text';
    calc.autocomplete = 'off';
    calc.spellcheck = false;
    calc.setAttribute('aria-describedby', 'pp-pivot-calc-help');
    const calcHelp = el('p', 'pp-link-note');
    calcHelp.id = 'pp-pivot-calc-help';
    const calcField = field('', calc, 'pp-pivot-calc');
    calcField.box.appendChild(calcHelp);
    const agg = select('pp-pivot-agg');
    Pivot.AGGREGATES.forEach(name => agg.appendChild(option(name, '')));
    const aggField = field('', agg, 'pp-pivot-agg');

    const totalsLabel = el('span', 'pp-pivot-label');
    totalsLabel.id = 'pp-pivot-totals-label';
    const totalRowsLabel = el('label', 'pp-pivot-check');
    const totalRows = el('input');
    totalRows.type = 'checkbox';
    const totalRowsText = el('span');
    totalRowsLabel.append(totalRows, totalRowsText);
    const totalColsLabel = el('label', 'pp-pivot-check');
    const totalCols = el('input');
    totalCols.type = 'checkbox';
    const totalColsText = el('span');
    totalColsLabel.append(totalCols, totalColsText);
    const totalsBox = el('div', 'pp-pivot-totals');
    totalsBox.setAttribute('role', 'group');
    totalsBox.setAttribute('aria-labelledby', 'pp-pivot-totals-label');
    totalsBox.append(totalRowsLabel, totalColsLabel);
    const sort = select('pp-pivot-sort');
    Pivot.SORTS.forEach(name => sort.appendChild(option(name, '')));
    const sortField = field('', sort, 'pp-pivot-sort');

    // Les lignes retenues : le filtre d'une Boucle (« Garder les lignes où toutes les conditions sont remplies »), dessiné par renderFilter.
    const filterLabel = el('span', 'pp-pivot-label');
    filterLabel.id = 'pp-pivot-filter-label';
    const filterBox = el('div', 'pp-pivot-filter');
    filterBox.setAttribute('role', 'group');
    filterBox.setAttribute('aria-labelledby', 'pp-pivot-filter-label');

    // L'écriture des nombres : celle d'une bulle, réduite à ce que le tableau règle.
    const fmtStyle = select('pp-pivot-fmt-style');
    ['', 'fr', 'us', 'none'].forEach(value => fmtStyle.appendChild(option(value, '')));
    const fmtStyleField = field('', fmtStyle, 'pp-pivot-fmt-style');
    const fmtDecimals = select('pp-pivot-fmt-decimals');
    ['', '0', '1', '2', '3'].forEach(value => fmtDecimals.appendChild(option(value, '')));
    const fmtDecimalsField = field('', fmtDecimals, 'pp-pivot-fmt-decimals');
    const fmtCurrency = el('input', 'pp-dialog-input');
    fmtCurrency.id = 'pp-pivot-fmt-currency';
    fmtCurrency.type = 'text';
    fmtCurrency.maxLength = 6;
    fmtCurrency.autocomplete = 'off';
    const fmtCurrencyField = field('', fmtCurrency, 'pp-pivot-fmt-currency');
    // « Écriture des nombres » titre les quatre champs ; les deux cases à cocher ont leur propre intitulé.
    const fmtLabel = el('span', 'pp-pivot-label');
    fmtLabel.id = 'pp-pivot-fmt-label';
    const fmtMoreLabel = el('span', 'pp-pivot-label');
    fmtMoreLabel.id = 'pp-pivot-fmt-more-label';
    const fmtPercentLabel = el('label', 'pp-pivot-check');
    const fmtPercent = el('input');
    fmtPercent.type = 'checkbox';
    const fmtPercentText = el('span');
    fmtPercentLabel.append(fmtPercent, fmtPercentText);
    const fmtZeroLabel = el('label', 'pp-pivot-check');
    const fmtHideZero = el('input');
    fmtHideZero.type = 'checkbox';
    const fmtZeroText = el('span');
    fmtZeroLabel.append(fmtHideZero, fmtZeroText);
    const fmtChecks = el('div', 'pp-pivot-totals');
    fmtChecks.setAttribute('role', 'group');
    fmtChecks.setAttribute('aria-labelledby', 'pp-pivot-fmt-more-label');
    fmtChecks.append(fmtPercentLabel, fmtZeroLabel);
    const fmtField = el('div', 'pp-pivot-field');
    fmtField.append(fmtMoreLabel, fmtChecks);

    const previewLabel = el('span', 'pp-pivot-label');
    const previewNote = el('p', 'pp-pivot-status');
    previewNote.setAttribute('role', 'status');
    const previewBody = el('div', 'pp-pivot-window-preview');
    const previewStats = el('p', 'pp-link-note');

    const fieldsTop = el('div', 'pp-pivot-grid');
    fieldsTop.append(tableField.box, rowsField.box, colsField.box);
    const valueBlock = el('div', 'pp-pivot-grid');
    valueBlock.append(valueColumnField.box, calcField.box, aggField.box);
    const optionsRow = el('div', 'pp-pivot-grid');
    const totalsField = el('div', 'pp-pivot-field');
    totalsField.append(totalsLabel, totalsBox);
    optionsRow.append(totalsField, sortField.box);
    const formatRow = el('div', 'pp-pivot-grid');
    formatRow.append(fmtStyleField.box, fmtDecimalsField.box, fmtCurrencyField.box, fmtField);
    win.body.append(intro, fieldsTop, sourceLabel, source.group, filterLabel, filterBox, kindLabel, kind.group, valueBlock, optionsRow, fmtLabel, formatRow, previewLabel, previewNote, previewBody, previewStats);
    const { first: remove, cancel, ok } = win.addButtons('var-modal-danger');

    refs = {
      intro, table, tableLabel: tableField.label, sourceLabel, source, row1, row2, rowBox, rowAdd, rowRemove, rowsLabel: rowsField.label, cols, colsLabel: colsField.label,
      kindLabel, kind, valueColumn, valueColumnField, valueColumnLabel: valueColumnField.label, calc, calcField, calcLabel: calcField.label, calcHelp, agg, aggField, aggLabel: aggField.label,
      filterLabel, filterBox, fmtStyle, fmtStyleLabel: fmtStyleField.label, fmtDecimals, fmtDecimalsLabel: fmtDecimalsField.label, fmtCurrency, fmtCurrencyLabel: fmtCurrencyField.label,
      fmtLabel, fmtMoreLabel, fmtPercent, fmtPercentText, fmtHideZero, fmtZeroText,
      totalsLabel, totalRows, totalCols, totalRowsText, totalColsText, sort, sortLabel: sortField.label, previewLabel, previewNote, previewBody, previewStats, remove, cancel, ok,
    };

    // Les listes avec recherche : si le composant échoue, le <select> natif reste et marche pareil.
    refs.search = {};
    try {
      refs.search.table = SearchSelect.attachTables(table);
      [['row1', row1], ['row2', row2], ['cols', cols], ['valueColumn', valueColumn]].forEach(([name, node]) => { refs.search[name] = attachColumns(node); });
    } catch (e) { console.warn('[PivotWindow] recherche dans les listes indisponible, listes natives conservées', e); }

    Variables.initFilenameInput(calc);
    wire();
  }

  function wire() {
    const changed = () => { readFields(); previewRun.schedule(); };
    refs.table.addEventListener('change', () => {
      readFields();
      const scopes = scopesFor(state.working.table);
      if (!scopes.some(scope => scope.value === state.working.scope && scope.ok)) state.working.scope = firstScope(state.working.table);
      state.working.rows = [''];
      state.working.cols = '';
      state.working.valuePath = '';
      // Les règles du filtre portent sur les colonnes de l'ancienne table : elles ne valent plus rien.
      state.working.rules = [];
      state.working.filterMode = 'all';
      renderTable();
      previewRun.schedule();
    });
    [refs.row1, refs.row2, refs.cols, refs.valueColumn, refs.agg, refs.sort, refs.totalRows, refs.totalCols].forEach(node => node.addEventListener('change', () => { changed(); syncTotals(); }));
    // Une valeur ou un opérateur d'une condition change la règle en place (js/condition-fields.js) : seul le regard sur la boîte des règles voit le tableau à refaire.
    refs.filterBox.addEventListener('input', previewRun.schedule);
    refs.filterBox.addEventListener('change', previewRun.schedule);
    [refs.fmtStyle, refs.fmtDecimals, refs.fmtPercent, refs.fmtHideZero].forEach(node => node.addEventListener('change', changed));
    refs.fmtCurrency.addEventListener('input', changed);
    refs.fmtCurrency.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      apply();
    });
    refs.calc.addEventListener('input', () => { refs.calc.removeAttribute('aria-invalid'); changed(); });
    refs.calc.addEventListener('keydown', (event) => {
      // La liste des colonnes qui s'ouvre sous le champ prend Entrée avant la fenêtre (son écouteur a déjà pris l'évènement).
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      apply();
    });
    refs.rowAdd.addEventListener('click', () => { refs.rowBox.hidden = false; refs.rowAdd.hidden = true; refs.row2.focus(); });
    refs.rowRemove.addEventListener('click', () => {
      refs.row2.value = '';
      refs.rowBox.hidden = true;
      refs.rowAdd.hidden = false;
      if (refs.search.row2) refs.search.row2.sync();
      changed();
      refs.rowAdd.focus();
    });
    refs.cancel.addEventListener('click', closeWindow);
    refs.ok.addEventListener('click', apply);
    refs.remove.addEventListener('click', removeTable);
  }

  // === Les textes (relus à chaque ouverture : la langue peut changer) ===

  function writeTexts() {
    win.title.textContent = I18n.t('pivot.window.title');
    refs.intro.textContent = I18n.t('pivot.window.intro');
    refs.tableLabel.textContent = I18n.t('pivot.window.table');
    refs.sourceLabel.textContent = I18n.t('pivot.window.source');
    refs.rowsLabel.textContent = I18n.t('pivot.window.rows');
    refs.rowAdd.textContent = I18n.t('pivot.window.addRow');
    refs.rowRemove.textContent = I18n.t('pivot.window.removeRow');
    refs.row2.setAttribute('aria-label', I18n.t('pivot.window.secondRow'));
    refs.colsLabel.textContent = I18n.t('pivot.window.cols');
    refs.kindLabel.textContent = I18n.t('pivot.window.values');
    refs.valueColumnLabel.textContent = I18n.t('pivot.window.valueColumn');
    refs.calcLabel.textContent = I18n.t('pivot.window.calcLabel');
    refs.calc.placeholder = I18n.t('pivot.window.calcPlaceholder', { trigger: Variables.triggerChar() });
    refs.calcHelp.textContent = I18n.t('pivot.window.calcHelp', { trigger: Variables.triggerChar() });
    refs.aggLabel.textContent = I18n.t('pivot.window.agg');
    Array.from(refs.agg.options).forEach(item => { item.textContent = I18n.t('pivot.window.agg.' + item.value); });
    refs.totalsLabel.textContent = I18n.t('pivot.window.totals');
    refs.totalRowsText.textContent = I18n.t('pivot.window.totalRows');
    refs.totalColsText.textContent = I18n.t('pivot.window.totalCols');
    refs.sortLabel.textContent = I18n.t('pivot.window.order');
    Array.from(refs.sort.options).forEach(item => { item.textContent = I18n.t('pivot.window.sort.' + item.value); });
    refs.filterLabel.textContent = I18n.t('pivot.window.filter');
    refs.fmtLabel.textContent = I18n.t('pivot.window.format');
    refs.fmtMoreLabel.textContent = I18n.t('pivot.window.format.more');
    refs.fmtStyleLabel.textContent = I18n.t('pivot.window.format.style');
    ['', 'fr', 'us', 'none'].forEach((value, index) => { refs.fmtStyle.options[index].textContent = I18n.t(value ? 'varFmt.style' + value.charAt(0).toUpperCase() + value.slice(1) : 'pivot.window.format.auto'); });
    refs.fmtDecimalsLabel.textContent = I18n.t('varFmt.decimals');
    ['', '0', '1', '2', '3'].forEach((value, index) => { refs.fmtDecimals.options[index].textContent = value ? value : I18n.t('varFmt.decimalsAuto'); });
    refs.fmtCurrencyLabel.textContent = I18n.t('varFmt.currencyPlaceholder');
    refs.fmtCurrency.title = I18n.t('varFmt.currencyTitle');
    refs.fmtCurrency.placeholder = '€';
    refs.fmtPercentText.textContent = I18n.t('varFmt.percentTitle');
    refs.fmtZeroText.textContent = I18n.t('varFmt.zero');
    refs.previewLabel.textContent = I18n.t('pivot.window.preview');
    refs.kind.buttons.forEach((item) => { item.textContent = I18n.t('pivot.window.kind.' + item.dataset.value); });
    refs.remove.textContent = I18n.t('pivot.window.remove');
    refs.remove.title = I18n.t('pivot.window.removeTitle');
    refs.cancel.textContent = I18n.t('pivot.window.cancel');
    refs.ok.textContent = I18n.t('pivot.window.save');
  }

  // === Ce que dit chaque partie des réglages ===

  // La liste des tables, puis tout ce qui en dépend : les sources, les listes de colonnes.
  function renderTable() {
    const w = state.working;
    refs.table.textContent = '';
    tableChoices().forEach((name) => { const item = option(name, name); item.dataset.name = name; refs.table.appendChild(item); });
    refs.table.value = w.table;
    if (refs.search.table) refs.search.table.sync();
    syncSource();
    [['row1', false], ['row2', true], ['cols', true], ['valueColumn', false]].forEach(([name, none]) => {
      const node = refs[name];
      fillColumns(node, w.table, { none, groupOnly: name !== 'valueColumn' });
      const path = name === 'row1' ? w.rows[0] : name === 'row2' ? w.rows[1] : name === 'cols' ? w.cols : w.valuePath;
      selectPath(node, w.table, path || '');
      if (refs.search[name]) refs.search[name].sync();
    });
    const second = !!w.rows[1];
    refs.rowBox.hidden = !second;
    refs.rowAdd.hidden = second;
    syncKind();
    syncTotals();
    renderFilter();
    syncFormat();
  }

  // Les lignes retenues, comme le filtre d'une Boucle (js/variable-loop.js:renderFilter) : sans règle, le bouton d'ajout et « toutes les lignes lues » ; avec, « Garder les lignes où toutes / au moins une des conditions
  // sont remplies », les lignes Colonne / Opérateur / Valeur sur les colonnes de la table lue, et des groupes (« + Groupe ») pour mêler « et » et « ou ».
  function renderFilter() {
    const w = state.working;
    const { filterBox } = refs;
    const rules = w.rules;
    const redraw = () => { renderFilter(); previewRun.schedule(); };
    filterBox.replaceChildren();
    if (!rules.length) {
      const row = el('div', 'var-loop-filter-empty');
      row.append(ConditionFields.buildAddRuleButton(filterBox, rules, redraw), el('span', 'var-loop-hint', I18n.t('pivot.window.filterNone')));
      filterBox.appendChild(row);
      return;
    }
    const modeRow = el('div', 'var-condition-mode');
    const modeSelect = el('select');
    modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    modeSelect.append(option('all', I18n.t('varCond.modeAll')), option('any', I18n.t('varCond.modeAny')));
    modeSelect.value = w.filterMode;
    modeSelect.addEventListener('change', () => { w.filterMode = modeSelect.value === 'any' ? 'any' : 'all'; redraw(); });
    modeRow.append(el('span', null, I18n.t('varLoop.filter.before')), modeSelect, el('span', null, I18n.t('varCond.modeAfter')));
    const rulesBox = el('div', 'var-condition-rules');
    ConditionFields.renderItems(rulesBox, {
      items: rules,
      mode: w.filterMode,
      setMode: (next) => { w.filterMode = next; },
      buildRow: (rule, row) => ConditionFields.buildRuleRow(rule, row.index, Object.assign({}, row, { options: { table: w.table } })),
      removeItem: (index) => { rules.splice(index, 1); redraw(); },
      redraw,
      root: filterBox,
    });
    const foot = el('div', 'var-condition-foot');
    foot.append(ConditionFields.buildAddRuleButton(filterBox, rules, redraw), ConditionFields.buildAddGroupButton(filterBox, rules, () => w.filterMode, redraw));
    rulesBox.appendChild(foot);
    filterBox.append(modeRow, rulesBox);
  }
  // Les champs d'écriture des nombres relus dans les réglages.
  function syncFormat() {
    const w = state.working;
    refs.fmtStyle.value = w.fmtStyle;
    refs.fmtDecimals.value = w.fmtDecimals;
    refs.fmtCurrency.value = w.fmtCurrency;
    refs.fmtPercent.checked = w.fmtPercent;
    refs.fmtHideZero.checked = w.fmtHideZero;
  }

  function syncSource() {
    const w = state.working;
    const scopes = scopesFor(w.table);
    refs.source.buttons.forEach((item) => {
      const scope = scopes.find(found => found.value === item.dataset.value);
      item.textContent = I18n.t('pivot.window.source.' + scope.value, { table: w.table, page: GristAPI.getCurrentTableId() || '' });
      markDisabled(refs.source, scope.value, !scope.ok, scope.reason);
    });
    refs.source.check(w.scope);
  }
  function syncKind() {
    const w = state.working;
    refs.kind.check(w.kind);
    refs.valueColumnField.box.hidden = w.kind !== 'column';
    refs.calcField.box.hidden = w.kind !== 'calc';
    refs.aggField.box.hidden = w.kind === 'rows';
    refs.agg.value = w.agg;
  }
  // « Total de chaque ligne » n'a de sens qu'avec une colonne en colonnes : sans elle, il se grise et dit pourquoi (jamais retiré).
  function syncTotals() {
    const w = state.working;
    const needsColumn = !w.cols;
    refs.totalRows.checked = w.totalRows;
    refs.totalCols.checked = w.totalCols;
    refs.totalRows.disabled = needsColumn;
    refs.totalRows.parentElement.title = needsColumn ? I18n.t('pivot.window.totalRowsNeed') : '';
    refs.sort.value = w.sort;
  }

  // === L'aperçu, sur la ligne de la page ===

  function say(text, kind) {
    refs.previewNote.textContent = text;
    refs.previewNote.dataset.state = kind;
    refs.previewBody.textContent = '';
    refs.previewStats.textContent = '';
  }
  async function refreshPreview() {
    if (!win || !win.isOpen() || !state) return;
    const outdated = previewRun.begin();
    const found = definition();
    if (found.error) { say(found.error, state.attempted ? 'error' : 'hint'); return; }
    if (found.missing) { say(I18n.t(found.missing), state.attempted ? 'error' : 'hint'); return; }
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    if (!tableId || !record) { say(I18n.t('pivot.window.noRow'), 'hint'); return; }
    say(I18n.t('pivot.window.previewWait'), 'hint');
    let built;
    try { built = await PivotZones.compute(JSON.stringify(found.def), tableId, record); } catch (e) {
      console.warn('[PivotWindow] aperçu du tableau croisé', e);
      built = { error: I18n.t('pivot.error.cell') };
    }
    if (outdated()) return;
    refs.previewNote.textContent = '';
    refs.previewNote.dataset.state = 'ok';
    PivotEditor.drawTable(refs.previewBody, built, { rows: PREVIEW_ROWS, columns: PREVIEW_COLUMNS });
    if (built.error || !built.result.rows.length) { refs.previewStats.textContent = ''; return; }
    const manyColumns = built.result.warnings.some(item => item.code === 'manyColumns');
    refs.previewStats.textContent = manyColumns
      ? I18n.t('pivot.window.previewManyColumns', { limit: Pivot.COLUMN_WARNING })
      : I18n.t('pivot.window.previewStats', { records: built.records, rows: built.result.rows.length, cols: built.result.cols.length });
  }

  // === Valider, retirer, fermer ===

  function closeWindow() {
    previewRun.cancel();
    const editor = state && state.editor;
    state = null;
    if (win) win.hide();
    if (editor && !editor.isDestroyed) editor.commands.focus();
  }
  function apply() {
    if (!state) return;
    readFields();
    const found = definition();
    if (found.error || found.missing) {
      state.attempted = true;
      refs.calc.setAttribute('aria-invalid', found.error ? 'true' : 'false');
      refreshPreview();
      return;
    }
    const { editor, pos } = state;
    PivotEditor.apply(editor, pos, found.def);
    closeWindow();
  }
  function removeTable() {
    if (!state) return;
    const { editor, pos } = state;
    PivotEditor.apply(editor, pos, null);
    closeWindow();
  }

  // Ouvre la fenêtre sur la ligne de la grille à `rowPos` : son tableau croisé s'il en porte un, sinon un tableau neuf.
  function open(editor, rowPos) {
    const row = editor.state.doc.nodeAt(rowPos);
    if (!row || row.type.name !== 'tableRow') return;
    ensure();
    const had = !!row.attrs[PivotEditor.ATTR];
    state = { editor, pos: rowPos, had, working: workingFrom(PivotEditor.defAt(editor.state, rowPos)), attempted: false };
    writeTexts();
    refs.remove.hidden = !had;
    refs.ok.textContent = I18n.t(had ? 'pivot.window.save' : 'pivot.window.add');
    refs.calc.removeAttribute('aria-invalid');
    refs.calc.value = state.working.calc;
    refs.agg.value = state.working.agg;
    renderTable();
    win.show(() => (state.working.rows[0] ? refs.table : refs.row1));
    refreshPreview();
  }
  const isOpen = () => !!win && win.isOpen();

  return { open, isOpen };
})();
