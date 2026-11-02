// La fenêtre « Créer un graphique » (ligne du menu « Ajouter une image », index.html, js/main-toolbar.js ; ouverte par js/chart-entry.js) : la personne choisit la forme du graphique, la table, la
// colonne des étiquettes et les colonnes à tracer, et le lot de lignes (celles qui sont liées à la ligne du document, ou toute la table) ; l'aperçu se redessine dans la fenêtre. Valider pose le
// graphique à la place du curseur, ou change celui qui est sélectionné ; ses réglages sont gardés sur l'image, dans le modèle (chart-make.js : `chartSpec`), jamais dans Grist.
// Elle est la sœur de la fenêtre « Graphique de la page » (chart-block.js) : mêmes lignes du graphique (liées ou toute la table), même liaison réglée à la validation quand elle manque, même
// aperçu pour la ligne affichée, mêmes textes pour ce qui manque. Le dessin et la lecture des lignes sont ceux de chart-block.js (drawMade) ; les styles, ceux de chart-block.css.
// Tout tient dans le panneau de 700x400, sans défiler : la forme en une rangée de boutons, la table et la colonne des étiquettes côte à côte, les colonnes à tracer en une liste qui défile seule
// quand la table en a beaucoup, et sous elle les deux réglages de forme (empilé, horizontal) qui n'apparaissent que pour les formes qui les ont ; à droite l'aperçu et les lignes.
const ChartMakeUi = (function () {
  const el = Dom.el;

  const DEFAULT_WIDTH_PX = ChartEntry.DEFAULT_WIDTH_PX;
  const DEFAULT_HEIGHT_PX = ChartEntry.DEFAULT_HEIGHT_PX;
  const PREVIEW_DELAY_MS = 120;
  const NUMERIC_TYPES = ['Numeric', 'Int', 'Any'];
  const ONE_VALUE_KINDS = ['pie', 'donut'];

  let win = null;
  let refs = null;
  let state = null;
  let tablePicker = null;
  let labelPicker = null;
  let previewToken = 0;
  let previewTimer = 0;

  // Les tables et les colonnes que Grist a rendues au widget (GristAPI : sans les tables internes du widget ni les colonnes d'aide de Grist).
  const currentTable = () => GristAPI.getCurrentTableId();
  const typeOf = (table, column) => ViewSource.pureTypeOf(GristAPI.getColumnType(table, column) || '');
  const isNumeric = (table, column) => NUMERIC_TYPES.indexOf(typeOf(table, column)) !== -1;
  const nameOfColumn = (table, column) => GristAPI.getColumnLabel(table, column) || column;
  const hasTable = table => GristAPI.getTables().indexOf(table) !== -1;
  const sameTable = table => !!table && table === currentTable();
  const needsLink = table => !!table && !sameTable(table) && !GristAPI.getLinkRule(table);

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas à la ligne du menu - la sélection y est restée.
    win = ModalBase.create({ id: 'pp-chartmake-modal', titleId: 'pp-chartmake-title', size: 'lg', boxClass: 'pp-chart-box pp-chartmake-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const grid = el('div', 'pp-chart-grid');
    const form = el('div', 'pp-chart-form');

    // La forme : sept vrais boutons radio (flèches, Tab) dessinés en boutons.
    const kinds = el('fieldset', 'pp-chartmake-kinds');
    const kindsLegend = el('legend', 'pp-dialog-label');
    const kindRow = el('div', 'pp-chartmake-kind-row');
    const kindInputs = ChartMake.KINDS.map((kind) => {
      const label = el('label', 'pp-chartmake-kind');
      const input = el('input');
      input.type = 'radio';
      input.name = 'pp-chartmake-kind';
      input.value = kind;
      input.addEventListener('change', () => { if (input.checked) pickKind(kind); });
      const text = el('span');
      label.append(input, text);
      kindRow.appendChild(label);
      return { kind, input, text, label };
    });
    kinds.append(kindsLegend, kindRow);

    // La table et la colonne des étiquettes, côte à côte.
    const pair = el('div', 'pp-chartmake-pair');
    const tableField = el('div', 'pp-chartmake-field');
    const tableLabel = el('label', 'pp-dialog-label');
    tableLabel.htmlFor = 'pp-chartmake-table';
    const tableSelect = el('select', 'pp-chart-select');
    tableSelect.id = 'pp-chartmake-table';
    tableSelect.setAttribute('aria-describedby', 'pp-chartmake-error');
    tableField.append(tableLabel, tableSelect);
    const labelField = el('div', 'pp-chartmake-field');
    const labelLabel = el('label', 'pp-dialog-label');
    labelLabel.htmlFor = 'pp-chartmake-label';
    const labelSelect = el('select', 'pp-chart-select');
    labelSelect.id = 'pp-chartmake-label';
    labelSelect.setAttribute('aria-describedby', 'pp-chartmake-error');
    labelField.append(labelLabel, labelSelect);
    pair.append(tableField, labelField);

    // Les colonnes à tracer : une case par colonne numérique de la table.
    const values = el('fieldset', 'pp-chartmake-values');
    const valuesLegend = el('legend', 'pp-dialog-label');
    const valuesList = el('div', 'pp-chartmake-values-list');
    const valuesNote = el('p', 'pp-chart-note');
    valuesNote.hidden = true;
    values.append(valuesLegend, valuesList, valuesNote);

    // Les deux réglages de la forme (empilé, horizontal), sous les colonnes : ils n'apparaissent que pour les formes qui les ont.
    const options = el('div', 'pp-chartmake-options');
    const stack = optionBox('stack');
    const horizontal = optionBox('horizontal');
    options.append(stack.label, horizontal.label);

    const error = el('p', 'pp-chart-note pp-chart-error');
    error.id = 'pp-chartmake-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    form.append(kinds, pair, values, options, error);

    // À droite : l'aperçu et les lignes à tracer.
    const side = el('div', 'pp-chart-side');
    const previewLabel = el('span', 'pp-dialog-label');
    const paper = el('div', 'pp-chart-paper');
    const image = el('img', 'pp-chart-image');
    image.alt = '';
    image.hidden = true;
    const message = el('p', 'pp-chart-message');
    paper.append(image, message);
    const caption = el('p', 'pp-chart-note pp-chart-caption');
    caption.hidden = true;
    const rows = el('fieldset', 'pp-chartmake-rows');
    const rowsLegend = el('legend', 'pp-dialog-label');
    const linked = rowChoice('linked');
    const all = rowChoice('all');
    rows.append(rowsLegend, linked.label, all.label);
    const rowsNote = el('p', 'pp-chart-note');
    rowsNote.hidden = true;
    side.append(previewLabel, paper, caption, rows, rowsNote);
    grid.append(form, side);
    win.body.appendChild(grid);

    const { cancel, ok } = win.addButtons();
    refs = {
      kindsLegend, kindInputs, tableLabel, tableSelect, labelLabel, labelSelect, valuesLegend, valuesList, valuesNote, error, previewLabel, paper, image, message, caption,
      rowsLegend, linked, all, rowsNote, options, stack, horizontal, cancel, ok,
    };
    try { tablePicker = SearchSelect.attachTables(tableSelect); } catch (e) { console.warn('[ChartMakeUi] liste des tables avec recherche indisponible', e); }
    try { labelPicker = SearchSelect.attachColumns(labelSelect); } catch (e) { console.warn('[ChartMakeUi] liste des colonnes avec recherche indisponible', e); }
    tableSelect.addEventListener('change', pickTable);
    labelSelect.addEventListener('change', pickLabel);
    stack.input.addEventListener('change', () => { state.stack = stack.input.checked; changed(); });
    horizontal.input.addEventListener('change', () => { state.horizontal = horizontal.input.checked; changed(); });
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
  }

  function rowChoice(value) {
    const label = el('label', 'pp-chart-option');
    const input = el('input');
    input.type = 'radio';
    input.name = 'pp-chartmake-rows';
    input.value = value;
    input.addEventListener('change', () => { if (input.checked) pickScope(value); });
    const text = el('span', 'pp-chart-option-name');
    label.append(input, text);
    return { label, input, text };
  }
  function optionBox(name) {
    const label = el('label', 'pp-chartmake-option');
    const input = el('input');
    input.type = 'checkbox';
    input.name = 'pp-chartmake-' + name;
    const text = el('span');
    label.append(input, text);
    return { label, input, text };
  }

  function clearError() {
    refs.error.hidden = true;
    refs.error.textContent = '';
    refs.tableSelect.removeAttribute('aria-invalid');
    refs.labelSelect.removeAttribute('aria-invalid');
  }
  function showError(text, select) {
    refs.error.textContent = text;
    refs.error.hidden = false;
    if (select) select.setAttribute('aria-invalid', 'true');
  }

  // Ce que la personne a choisi, sous la forme que garde le modèle (chart-make.js:normalize) ; null tant qu'il manque la table, les étiquettes ou, pour les formes qui en veulent, les valeurs.
  function defOf() {
    if (!state.table || !state.label) return null;
    const values = state.values.filter(column => column !== state.label);
    if (ChartMake.needsValues(state.kind) && !values.length) return null;
    return ChartMake.normalize({ kind: state.kind, table: state.table, label: state.label, values: ONE_VALUE_KINDS.indexOf(state.kind) !== -1 ? values.slice(0, 1) : values, stack: state.stack, horizontal: state.horizontal });
  }

  // Les listes de la fenêtre
  function fillTables(chosen) {
    const { tableSelect } = refs;
    tableSelect.replaceChildren();
    const placeholder = Dom.option('', I18n.t('chart.make.table.placeholder'));
    placeholder.disabled = true;
    tableSelect.appendChild(placeholder);
    GristAPI.getTables().forEach((table) => { const option = Dom.option(table, table); option.dataset.name = table; tableSelect.appendChild(option); });
    tableSelect.value = chosen && hasTable(chosen) ? chosen : '';
    tableSelect.disabled = GristAPI.getTables().length === 0;
    if (tablePicker) tablePicker.sync();
  }
  function fillLabels(table, chosen) {
    const { labelSelect } = refs;
    labelSelect.replaceChildren();
    const placeholder = Dom.option('', I18n.t('chart.make.label.placeholder'));
    placeholder.disabled = true;
    labelSelect.appendChild(placeholder);
    const columns = table && hasTable(table) ? GristAPI.getVisibleColumns(table) : [];
    columns.forEach((column) => {
      const name = nameOfColumn(table, column);
      const option = Dom.option(column, name);
      option.dataset.name = name;
      if (name !== column) option.dataset.hint = column;
      labelSelect.appendChild(option);
    });
    labelSelect.value = chosen && columns.indexOf(chosen) !== -1 ? chosen : '';
    labelSelect.disabled = !columns.length;
    if (labelPicker) labelPicker.sync();
  }
  function fillValues() {
    const { valuesList, valuesNote } = refs;
    valuesList.replaceChildren();
    const columns = state.table && hasTable(state.table) ? GristAPI.getVisibleColumns(state.table).filter(column => column !== state.label && isNumeric(state.table, column)) : [];
    state.values = state.values.filter(column => columns.indexOf(column) !== -1);
    columns.forEach((column) => {
      const label = el('label', 'pp-chartmake-value');
      const input = el('input');
      input.type = 'checkbox';
      input.value = column;
      input.checked = state.values.indexOf(column) !== -1;
      input.addEventListener('change', () => pickValue(column, input.checked));
      const text = el('span');
      text.textContent = nameOfColumn(state.table, column);
      label.append(input, text);
      valuesList.appendChild(label);
    });
    // Une table sans colonne de nombres le dit ; secteurs et anneau, qui comptent les lignes sans valeur choisie, le disent aussi.
    const one = ONE_VALUE_KINDS.indexOf(state.kind) !== -1;
    let note = '';
    if (state.table && !columns.length) note = one ? 'chart.make.values.count' : 'chart.make.values.none';
    else if (one && state.table && !state.values.length) note = 'chart.make.values.count';
    valuesNote.hidden = !note;
    valuesNote.textContent = note ? I18n.t(note) : '';
  }

  // Les choix
  function pickKind(kind) {
    state.kind = kind;
    // Secteurs et anneau ne tracent qu'une colonne : la première cochée reste.
    if (ONE_VALUE_KINDS.indexOf(kind) !== -1 && state.values.length > 1) state.values = state.values.slice(0, 1);
    state.stack = state.stack && (kind === 'bar' || kind === 'area');
    state.horizontal = state.horizontal && kind === 'bar';
    renderKind();
    fillValues();
    changed();
  }
  function pickTable() {
    state.table = refs.tableSelect.value;
    state.label = '';
    state.values = [];
    // Les lignes : « liées » dès qu'une règle de liaison existe entre cette table et celle du document, sinon toute la table (comme la fenêtre « Graphique de la page »).
    state.scope = state.table && !sameTable(state.table) && GristAPI.getLinkRule(state.table) ? 'linked' : 'all';
    fillLabels(state.table, '');
    defaults();
    renderScope();
    fillValues();
    renderKind();
    changed();
  }
  function pickLabel() {
    state.label = refs.labelSelect.value;
    fillValues();
    changed();
  }
  function pickValue(column, checked) {
    const one = ONE_VALUE_KINDS.indexOf(state.kind) !== -1;
    state.values = state.values.filter(name => name !== column && !(checked && one));
    if (checked) state.values.push(column);
    if (one) fillValues();
    changed();
  }
  function pickScope(value) {
    state.scope = value;
    renderScope();
    changed();
  }
  // Une table choisie sans colonne choisie : la première colonne qui n'est pas un nombre donne les étiquettes (à défaut, la première), la première colonne numérique les valeurs.
  function defaults() {
    const columns = state.table && hasTable(state.table) ? GristAPI.getVisibleColumns(state.table) : [];
    if (!columns.length) return;
    const text = columns.find(column => !isNumeric(state.table, column)) || columns[0];
    state.label = text;
    refs.labelSelect.value = text;
    if (labelPicker) labelPicker.sync();
    const numbers = columns.filter(column => column !== text && isNumeric(state.table, column));
    if (numbers.length) state.values = [numbers[0]];
  }

  function renderKind() {
    const { kindInputs, options, stack, horizontal, valuesLegend } = refs;
    kindInputs.forEach((item) => { item.input.checked = item.kind === state.kind; });
    const canStack = state.kind === 'bar' || state.kind === 'area';
    stack.label.hidden = !canStack;
    stack.input.checked = canStack && !!state.stack;
    horizontal.label.hidden = state.kind !== 'bar';
    horizontal.input.checked = state.kind === 'bar' && !!state.horizontal;
    options.hidden = stack.label.hidden && horizontal.label.hidden;
    valuesLegend.textContent = I18n.t(ONE_VALUE_KINDS.indexOf(state.kind) !== -1 ? 'chart.make.values.one' : 'chart.make.values');
    refs.valuesList.dataset.single = ONE_VALUE_KINDS.indexOf(state.kind) !== -1 ? 'true' : 'false';
  }
  function renderScope() {
    const { linked, all, rowsNote } = refs;
    // La table du graphique est celle du document : « liées » ne donnerait que la ligne affichée, un seul point ; seule « toute la table » a un sens.
    const off = sameTable(state.table);
    if (off && state.scope === 'linked') state.scope = 'all';
    linked.input.checked = state.scope === 'linked';
    all.input.checked = state.scope === 'all';
    linked.input.disabled = off;
    linked.label.classList.toggle('is-off', off);
    const note = off ? 'chart.make.rows.sameTable' : (needsLink(state.table) ? 'chart.rows.linked.needsLink' : '');
    rowsNote.hidden = !note || (state.scope === 'all' && !off);
    rowsNote.textContent = rowsNote.hidden ? '' : I18n.t(note);
  }

  // L'aperçu : le graphique pour la ligne en cours (toute la table en mode « toute la table ») ou, à la place, la raison pour laquelle il n'y en a pas.
  function setPreview(kind, uri) {
    const { image, message, paper, caption } = refs;
    paper.dataset.state = kind;
    const shown = kind === 'chart';
    image.hidden = !shown;
    if (shown) image.src = uri; else image.removeAttribute('src');
    message.hidden = shown;
    message.textContent = shown ? '' : I18n.t(kind === 'empty' ? 'chart.make.preview.empty' : 'chart.preview.' + kind, { table: state.table || '' });
    caption.hidden = !(shown && state.scope === 'linked');
    caption.textContent = caption.hidden ? '' : I18n.t('chart.preview.row');
    // Rien à insérer tant que le choix est incomplet ; une ligne sans valeur, une liaison encore à régler ou une bibliothèque qui n'a pas pu se charger n'empêchent rien (une autre ligne a
    // des données, la liaison se règle à la validation, le graphique se dessine à la Lecture).
    refs.ok.disabled = !defOf();
  }
  function changed() {
    clearError();
    refs.ok.disabled = !defOf();
    schedulePreview();
  }
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, delay === undefined ? PREVIEW_DELAY_MS : delay);
  }
  async function refreshPreview() {
    const token = ++previewToken;
    const def = defOf();
    if (!def) { setPreview('empty'); return; }
    if (state.scope === 'linked') {
      if (needsLink(def.table)) { setPreview('needsLink'); return; }
      if (!GristAPI.getCurrentRecord()) { setPreview('noRecord'); return; }
    }
    setPreview('loading');
    try {
      const drawn = await GristAPI.withReadPass(() => ChartBlock.drawMade(def, state.scope, currentTable(), GristAPI.getCurrentRecord(), DEFAULT_WIDTH_PX, DEFAULT_HEIGHT_PX));
      if (token !== previewToken) return;
      if (drawn.empty) setPreview('noRows'); else setPreview('chart', drawn.uri);
    } catch (e) {
      if (token !== previewToken) return;
      console.warn('[ChartMakeUi] aperçu indisponible', e);
      setPreview(e.kind === 'rows' ? 'unresolved' : (e.kind === 'chart' ? 'missing' : 'unavailable'));
    }
  }

  function closeWindow() {
    clearTimeout(previewTimer);
    previewToken += 1;
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Ouvre la fenêtre : pour changer le graphique créé qui est sélectionné s'il y en a un, sinon pour en insérer un à la place du curseur. Faux quand l'éditeur n'est pas modifiable.
  function open() {
    const ed = EditorCore.getEditor();
    if (!ed || !ed.isEditable) return false;
    ensure();
    const found = ChartEntry.selectedNode(ed, 'made');
    const def = found ? ChartMake.parse(found.node.attrs.chartSpec) : null;
    state = {
      editing: !!found, pos: found ? found.pos : null, kind: def ? def.kind : 'bar', table: def ? def.table : '', label: def ? def.label : '', values: def ? def.values.slice() : [],
      stack: !!(def && def.stack), horizontal: !!(def && def.horizontal), scope: found && found.node.attrs.chartScope === 'all' ? 'all' : 'linked',
    };
    const { kindsLegend, kindInputs, tableLabel, labelLabel, previewLabel, rowsLegend, linked, all, stack, horizontal, cancel, ok } = refs;
    win.title.textContent = I18n.t(found ? 'chart.title.edit' : 'chart.make.title.new');
    kindsLegend.textContent = I18n.t('chart.make.kind');
    kindInputs.forEach((item) => { item.text.textContent = I18n.t('chart.make.kind.' + item.kind); item.label.title = I18n.t('chart.type.' + item.kind); });
    tableLabel.textContent = I18n.t('chart.make.table');
    labelLabel.textContent = I18n.t('chart.make.label');
    previewLabel.textContent = I18n.t('chart.preview');
    rowsLegend.textContent = I18n.t('chart.rows.label');
    linked.text.textContent = I18n.t('chart.make.rows.linked');
    all.text.textContent = I18n.t('chart.make.rows.all');
    linked.label.title = I18n.t('chart.rows.linked.detail');
    all.label.title = I18n.t('chart.rows.all.detail');
    stack.text.textContent = I18n.t('chart.make.stack');
    horizontal.text.textContent = I18n.t('chart.make.horizontal');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(found ? 'common.confirm' : 'common.insert');
    clearError();
    if (!found || !def) {
      // Une création : la table du document en premier choix (c'est elle que la personne a sous les yeux), sinon la première.
      const tables = GristAPI.getTables();
      state.table = currentTable() && tables.indexOf(currentTable()) !== -1 ? currentTable() : (tables[0] || '');
      state.scope = state.table && !sameTable(state.table) && GristAPI.getLinkRule(state.table) ? 'linked' : 'all';
    }
    fillTables(state.table);
    fillLabels(state.table, state.label);
    if (!def) { state.label = ''; defaults(); }
    if (def && (!hasTable(def.table) || GristAPI.getVisibleColumns(def.table).indexOf(def.label) === -1)) showError(I18n.t('chart.make.gone'), refs.tableSelect);
    fillValues();
    renderKind();
    renderScope();
    refs.ok.disabled = !defOf();
    setPreview('empty');
    win.show(() => (found ? cancel : refs.tableSelect));
    schedulePreview(0);
    return true;
  }

  // « Insérer » : pose le graphique à la place du curseur (jamais à celle de ce qui est sélectionné : il s'ajoute derrière) ou change celui qui est sélectionné, qui garde sa taille, sa place et
  // son habillage.
  async function apply() {
    const ed = EditorCore.getEditor();
    const def = state && defOf();
    if (!ed || !def) return;
    // Les lignes liées demandent la liaison entre la table du graphique et celle du document : réglée ici si elle ne l'est pas encore, comme à l'insertion d'une bulle d'une autre table ;
    // refusée, la fenêtre reste ouverte.
    if (state.scope === 'linked' && needsLink(def.table) && !(await Variables.ensureLinkConfigured({ table: def.table }))) return;
    const name = ChartMake.nameOf(def);
    const attrs = { src: null, alt: I18n.t('chart.alt', { name }), chartSection: null, chartSpec: ChartMake.stringify(def), chartScope: state.scope, chartName: name };
    const current = state.editing ? ed.state.doc.nodeAt(state.pos) : null;
    if (current && current.type.name === 'editorImage') {
      EditorCore.patchNodeAndReselect(ed, state.pos, Object.assign({}, current.attrs, attrs));
    } else {
      const selection = ed.state.selection;
      const chain = ed.chain().focus();
      if (!selection.empty) chain.setTextSelection(selection.to);
      chain.insertImage(Object.assign({ width: DEFAULT_WIDTH_PX + 'px', height: DEFAULT_HEIGHT_PX + 'px' }, attrs)).run();
    }
    closeWindow();
  }

  return { open };
})();
