// La fenêtre « Créer un graphique » (ligne du menu « Ajouter une image », index.html, js/main-toolbar.js ; ouverte par js/chart-entry.js) : la personne choisit la forme du graphique, la table, la
// colonne des étiquettes et les colonnes à tracer, et le lot de lignes (celles qui sont liées à la ligne du document, ou toute la table) ; l'aperçu se redessine dans la fenêtre. Valider pose le
// graphique à la place du curseur, ou change celui qui est sélectionné ; ses réglages sont gardés sur l'image, dans le modèle (chart-make.js : `chartSpec`), jamais dans Grist.
// Elle est la sœur de la fenêtre « Graphique de la page » (chart-block.js) : mêmes lignes du graphique (liées ou toute la table), même liaison réglée à la validation quand elle manque, même
// aperçu pour la ligne affichée, mêmes textes pour ce qui manque. Le dessin et la lecture des lignes sont ceux de chart-block.js (drawMade) ; les styles, ceux de chart-block.css.
// Tout tient dans le panneau de 700x400, sans défiler. À gauche, deux onglets (à droite du titre, dans l'en-tête de la fenêtre) : « Données » (la forme en une rangée de boutons, la table et la colonne des étiquettes côte à côte, les colonnes
// à tracer en une liste qui défile seule quand la table en a beaucoup, et sous elle les deux réglages de forme - empilé, horizontal - qui n'apparaissent que pour les formes qui les ont) et « Aspect »
// (le titre, le jeu de couleurs, la couleur et le type - barres ou courbe - de chaque série, les valeurs affichées) ; à droite, sur les deux onglets, l'aperçu et les lignes. Le choix d'une couleur
// de série prend la place des onglets le temps d'un choix (la palette de tous les menus de couleur, les couleurs gardées, « Personnalisé… »), puis rend la main : pas de menu volant, qui ne
// tiendrait pas dans la hauteur du panneau. Les onglets sont de vrais onglets (flèches, Début, Fin) ; Échap ferme d'abord le choix d'une couleur, puis la fenêtre.
const ChartMakeUi = (function () {
  const el = Dom.el;

  const DEFAULT_WIDTH_PX = ChartEntry.DEFAULT_WIDTH_PX;
  const DEFAULT_HEIGHT_PX = ChartEntry.DEFAULT_HEIGHT_PX;
  const PREVIEW_DELAY_MS = 120;
  const NUMERIC_TYPES = ['Numeric', 'Int', 'Any'];
  const ONE_VALUE_KINDS = ['pie', 'donut'];
  const TABS = ['data', 'aspect'];
  const GRID_COLUMNS = 10;          // les colonnes de la palette (js/color-palette.js) : haut et bas d'une pastille à celle de la rangée d'à côté
  const SAMPLE_STRIP = 4;           // les couleurs d'un jeu montrées sur son bouton

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
  const isOneValue = kind => ONE_VALUE_KINDS.indexOf(kind) !== -1;

  // Une pastille de la palette : celle de js/color-palette.js (mêmes classes, donc même dessin, même coche et même marque que ColorPalette.mark). `role` : le nom du réglage d'une couleur du thème
  // (« Accent 1 »), devant son code dans l'infobulle, comme dans les autres menus de couleur.
  function swatchHtml(color, role) {
    const name = (role ? role + ' · ' : '') + color.toUpperCase();
    return `<button type="button" class="cp-swatch" data-color="${color}" style="--swatch:${color};--ink:${ColorMath.inkOn(color)}" title="${name}" aria-label="${name}" aria-pressed="false"></button>`;
  }
  // Les rangées de couleurs de js/color-store.js, une chacune quand elle en a : celle du thème d'abord quand la présentation en a un (sans croix, ses pastilles portent le nom de leur réglage), puis les couleurs
  // gardées ; relues à chaque ouverture du choix et après « Personnalisé… », qui en garde une de plus.
  function savedHtml() {
    return ColorStore.rows().filter(row => row.colors.length).map(row => `<div class="cp-row" role="group" aria-label="${row.label}"><div class="cp-row-label" title="${row.hint}">${row.label}</div>`
      + `<div class="cp-row-list pp-chartmake-swatches">${row.colors.map((color, at) => swatchHtml(color, row.names && row.names[at])).join('')}</div></div>`).join('');
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas à la ligne du menu - la sélection y est restée.
    win = ModalBase.create({ id: 'pp-chartmake-modal', titleId: 'pp-chartmake-title', size: 'lg', boxClass: 'pp-chart-box pp-chartmake-box', actionsClass: 'var-modal-actions', onEscape: onEscape, restoreFocus: false });
    const grid = el('div', 'pp-chart-grid');
    const form = el('div', 'pp-chart-form');

    // Les deux onglets : le commutateur de css/shortcuts.css, avec de vrais rôles (tablist, tab, tabpanel) et les flèches.
    const tabsBar = el('div', 'settings-switch pp-chartmake-tabs');
    tabsBar.setAttribute('role', 'tablist');
    const tabs = TABS.map((name) => {
      const button = Dom.button('settings-switch-btn');
      button.id = 'pp-chartmake-tab-' + name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'pp-chartmake-panel-' + name);
      button.addEventListener('click', () => showTab(name));
      tabsBar.appendChild(button);
      const panel = el('div', 'pp-chartmake-panel');
      panel.id = 'pp-chartmake-panel-' + name;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      return { name, button, panel };
    });
    tabsBar.addEventListener('keydown', onTabKey);
    const dataPanel = tabs[0].panel;
    const aspectPanel = tabs[1].panel;

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
    dataPanel.append(kinds, pair, values, options, error);

    // L'onglet « Aspect » : le titre, le jeu de couleurs (cinq vrais boutons radio dessinés en boutons, chacun avec un échantillon de ses couleurs), les séries (leur couleur et leur type) et les valeurs.
    const titleField = el('div', 'pp-chartmake-field');
    const titleLabel = el('label', 'pp-dialog-label');
    titleLabel.htmlFor = 'pp-chartmake-title-input';
    const titleInput = el('input', 'pp-dialog-input');
    titleInput.id = 'pp-chartmake-title-input';
    titleInput.type = 'text';
    titleInput.maxLength = ChartMake.MAX_TITLE;
    titleInput.autocomplete = 'off';
    titleField.append(titleLabel, titleInput);

    const palettes = el('fieldset', 'pp-chartmake-palettes');
    const palettesLegend = el('legend', 'pp-dialog-label');
    const paletteRow = el('div', 'pp-chartmake-palette-row');
    const paletteInputs = ChartMake.PALETTE_IDS.map((id) => {
      const label = el('label', 'pp-chartmake-palette');
      const input = el('input');
      input.type = 'radio';
      input.name = 'pp-chartmake-palette';
      input.value = id;
      input.addEventListener('change', () => { if (input.checked) pickPalette(id); });
      const face = el('span');
      const text = el('span', 'pp-chartmake-palette-name');
      const strip = el('span', 'pp-chartmake-palette-strip');
      strip.setAttribute('aria-hidden', 'true');
      ChartMake.PALETTES[id].slice(0, SAMPLE_STRIP).forEach((color) => { const dot = el('i'); dot.style.background = color; strip.appendChild(dot); });
      face.append(text, strip);
      label.append(input, face);
      paletteRow.appendChild(label);
      return { id, input, text, label };
    });
    palettes.append(palettesLegend, paletteRow);

    const series = el('fieldset', 'pp-chartmake-series');
    const seriesLegend = el('legend', 'pp-dialog-label');
    const seriesList = el('div', 'pp-chartmake-series-list');
    const seriesNote = el('p', 'pp-chart-note');
    seriesNote.hidden = true;
    series.append(seriesLegend, seriesList, seriesNote);
    // Secteurs et anneau n'ont pas de séries : chaque secteur prend une couleur du jeu choisi.
    const slicesNote = el('p', 'pp-chart-note');
    slicesNote.hidden = true;
    const labelsBox = optionBox('labels');
    labelsBox.label.classList.add('pp-chartmake-labels');
    aspectPanel.append(titleField, palettes, series, slicesNote, labelsBox.label);

    // Le choix de la couleur d'une série : il prend la place des onglets (un retour, la palette, les couleurs gardées, « Couleur de la palette » et « Personnalisé… »).
    const colors = el('div', 'pp-chartmake-colors');
    colors.setAttribute('role', 'group');
    colors.hidden = true;
    const colorsHead = el('div', 'pp-chartmake-colors-head');
    const back = Dom.button('pp-chartmake-back');
    const backArrow = el('span', null, '‹');
    backArrow.setAttribute('aria-hidden', 'true');
    const backText = el('span');
    back.append(backArrow, backText);
    const colorsTitle = el('span', 'pp-chartmake-colors-title');
    colorsHead.append(back, colorsTitle);
    const body = el('div', 'cp-body');
    const main = el('div', 'cp-main');
    const palette = el('div', 'cp-grid pp-chartmake-swatches');
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', I18n.t('color.palette'));
    Dom.setMarkup(palette, ColorPalette.ROWS.map(row => row.map(color => swatchHtml(color)).join('')).join(''));
    main.appendChild(palette);
    const saved = el('div', 'cp-rows');
    const tools = el('div', 'v2-color-dropdown-footer pp-chartmake-tools');
    const auto = Dom.button('pp-chartmake-tool');
    auto.setAttribute('aria-pressed', 'false');
    const custom = Dom.button('pp-chartmake-tool cp-custom');
    tools.append(auto, custom);
    body.append(main, saved, tools);
    colors.append(colorsHead, body);

    // Les onglets sont dans l'en-tête de la fenêtre, à droite du titre : sur la même ligne, ils ne prennent aucune hauteur au contenu (la liste des séries y gagne trois lignes).
    const header = win.box.querySelector('.pp-modal-header');
    header.classList.add('pp-chartmake-header');
    header.appendChild(tabsBar);
    form.append(dataPanel, aspectPanel, colors);

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
      tabsBar, tabs, kindsLegend, kindInputs, tableLabel, tableSelect, labelLabel, labelSelect, valuesLegend, valuesList, valuesNote, error, previewLabel, paper, image, message, caption,
      rowsLegend, linked, all, rowsNote, options, stack, horizontal,
      titleLabel, titleInput, palettesLegend, paletteInputs, series, seriesLegend, seriesList, seriesNote, slicesNote, labels: labelsBox,
      colors, back, backText, colorsTitle, palette, saved, auto, custom, cancel, ok,
    };
    try { tablePicker = SearchSelect.attachTables(tableSelect); } catch (e) { console.warn('[ChartMakeUi] liste des tables avec recherche indisponible', e); }
    try { labelPicker = SearchSelect.attachColumns(labelSelect); } catch (e) { console.warn('[ChartMakeUi] liste des colonnes avec recherche indisponible', e); }
    tableSelect.addEventListener('change', pickTable);
    labelSelect.addEventListener('change', pickLabel);
    stack.input.addEventListener('change', () => { state.stack = stack.input.checked; changed(); });
    horizontal.input.addEventListener('change', () => { state.horizontal = horizontal.input.checked; changed(); });
    labelsBox.input.addEventListener('change', () => { state.labels = labelsBox.input.checked; changed(); });
    titleInput.addEventListener('input', () => { state.title = titleInput.value; changed(); });
    // Entrée dans le titre valide la fenêtre, comme dans les autres saisies ; pendant une composition (accents, saisie japonaise), elle ne fait que valider le caractère.
    titleInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!refs.ok.disabled) apply();
    });
    palette.addEventListener('click', onSwatchClick);
    saved.addEventListener('click', onSwatchClick);
    colors.addEventListener('keydown', onSwatchKey);
    back.addEventListener('click', () => closeColors());
    auto.addEventListener('click', () => chooseColor(''));
    custom.addEventListener('click', openCustom);
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

  // Ce que la personne a réglé, tel que le modèle le garde une fois normalisé (chart-make.js:normalize) : l'aspect y est dès qu'il y a quelque chose à garder.
  function shape() {
    const values = state.values.filter(column => column !== state.label);
    return {
      kind: state.kind, table: state.table, label: state.label, values: isOneValue(state.kind) ? values.slice(0, 1) : values, stack: state.stack, horizontal: state.horizontal,
      title: state.title, palette: state.palette, colors: state.colors, labels: state.labels, mix: state.mix,
    };
  }
  // Ce que la personne a choisi, sous la forme que garde le modèle ; null tant qu'il manque la table, les étiquettes ou, pour les formes qui en veulent, les valeurs.
  function defOf() {
    if (!state.table || !state.label) return null;
    const raw = shape();
    if (ChartMake.needsValues(state.kind) && !raw.values.length) return null;
    return ChartMake.normalize(raw);
  }
  // Les séries et leurs couleurs montrées dans l'onglet « Aspect », même quand le choix est incomplet (pas encore d'étiquettes : les couleurs se règlent déjà).
  const displayDef = () => ChartMake.normalize(Object.assign(shape(), { table: state.table || '-', label: state.label || '-' }));

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
    const one = isOneValue(state.kind);
    let note = '';
    if (state.table && !columns.length) note = one ? 'chart.make.values.count' : 'chart.make.values.none';
    else if (one && state.table && !state.values.length) note = 'chart.make.values.count';
    valuesNote.hidden = !note;
    valuesNote.textContent = note ? I18n.t(note) : '';
  }

  // Les onglets
  function showTab(name, focus) {
    state.tab = name;
    refs.tabs.forEach((tab) => {
      const on = tab.name === name;
      tab.button.classList.toggle('active', on);
      tab.button.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.button.tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
    });
    if (name === 'aspect') renderSeries();
    if (focus) refs.tabs[TABS.indexOf(name)].button.focus();
  }
  // Les flèches passent d'un onglet à l'autre (le choix suit le focus), Début et Fin vont aux bouts.
  function onTabKey(event) {
    const at = TABS.indexOf(state.tab);
    let to = -1;
    if (event.key === 'ArrowRight') to = (at + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') to = (at + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = TABS.length - 1;
    if (to < 0) return;
    event.preventDefault();
    showTab(TABS[to], true);
  }

  // Les choix
  function pickKind(kind) {
    state.kind = kind;
    // Secteurs et anneau ne tracent qu'une colonne : la première cochée reste.
    if (isOneValue(kind) && state.values.length > 1) state.values = state.values.slice(0, 1);
    state.stack = state.stack && (kind === 'bar' || kind === 'area');
    state.horizontal = state.horizontal && kind === 'bar';
    // Le type de chaque série se compte à partir de la forme (barres pour des barres, courbe pour une courbe) : une autre forme repart de zéro, toutes les séries à son type.
    state.mix = {};
    renderKind();
    fillValues();
    changed();
  }
  function pickTable() {
    state.table = refs.tableSelect.value;
    state.label = '';
    state.values = [];
    // Les couleurs et les types sont ceux des colonnes de l'ancienne table.
    state.colors = {};
    state.mix = {};
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
    const one = isOneValue(state.kind);
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
  function pickPalette(id) {
    state.palette = id;
    renderSeries();
    changed();
  }
  // Le type d'une série : celui de la forme (barres pour des barres, courbe pour une courbe) n'est pas écrit, seul l'écart l'est.
  function pickType(column, type) {
    if (type === ChartMake.baseTypeOf(state.kind)) delete state.mix[column];
    else state.mix[column] = type;
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
    valuesLegend.textContent = I18n.t(isOneValue(state.kind) ? 'chart.make.values.one' : 'chart.make.values');
    refs.valuesList.dataset.single = isOneValue(state.kind) ? 'true' : 'false';
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

  // L'onglet « Aspect » : les séries, une ligne chacune (la pastille de sa couleur, qui ouvre le choix, son nom, son type quand la forme se mêle). Relu quand l'onglet s'ouvre et après chaque réglage
  // qui change ce qu'il montre (le jeu de couleurs, une couleur) : un changement de type ne le redessine pas, pour que le focus reste sur la liste.
  function renderSeries() {
    const { series, seriesList, seriesNote, slicesNote, palettesLegend, paletteInputs } = refs;
    paletteInputs.forEach((item) => { item.input.checked = item.id === (state.palette || ChartMake.PALETTE_IDS[0]); });
    palettesLegend.textContent = I18n.t('chart.make.palette');
    const slices = !ChartMake.hasSeries(state.kind);
    series.hidden = slices;
    slicesNote.hidden = !slices;
    slicesNote.textContent = slices ? I18n.t('chart.make.series.slices') : '';
    seriesList.replaceChildren();
    if (slices) return;
    const def = displayDef();
    const mixable = ChartMake.MIXABLE.indexOf(state.kind) !== -1;
    const flat = !!def.horizontal;
    if (!def.values.length) {
      const none = el('p', 'pp-chart-note');
      none.textContent = I18n.t('chart.make.series.none');
      seriesList.appendChild(none);
    }
    def.values.forEach((column) => {
      const name = nameOfColumn(state.table, column);
      const color = ChartMake.seriesColor(def, column);
      const row = el('div', 'pp-chartmake-serie');
      const swatch = Dom.button('cp-swatch pp-chartmake-swatch');
      swatch.dataset.column = column;
      swatch.style.setProperty('--swatch', color);
      swatch.style.setProperty('--ink', ColorMath.inkOn(color));
      const colorText = I18n.t('chart.make.series.color', { name, color: color.toUpperCase() });
      swatch.title = colorText;
      swatch.setAttribute('aria-label', colorText);
      swatch.addEventListener('click', () => openColors(column));
      const label = el('span', 'pp-chartmake-serie-name');
      label.textContent = name;
      label.title = name;
      row.append(swatch, label);
      if (mixable) {
        const select = el('select', 'pp-chartmake-serie-type');
        select.dataset.column = column;
        select.setAttribute('aria-label', I18n.t('chart.make.series.type', { name }));
        select.appendChild(Dom.option('bar', I18n.t('chart.make.series.bar')));
        select.appendChild(Dom.option('line', I18n.t(state.kind === 'area' ? 'chart.make.series.area' : 'chart.make.series.line')));
        select.value = ChartMake.seriesType(def, column);
        // Des barres horizontales ne se mêlent pas à une courbe : le choix se grise, avec sa raison dessous.
        select.disabled = flat;
        select.addEventListener('change', () => pickType(column, select.value));
        row.appendChild(select);
      }
      seriesList.appendChild(row);
    });
    seriesNote.hidden = !(mixable && flat);
    seriesNote.textContent = seriesNote.hidden ? '' : I18n.t('chart.make.series.noMix');
  }

  // Le choix de la couleur d'une série
  // Il remplace les onglets : ni eux ni leur contenu ne sont à l'écran (ni au clavier) tant qu'il est ouvert ; les onglets gardent leur place dans l'en-tête (invisibles), pour que la fenêtre ne change pas de hauteur.
  function showColors(open) {
    win.box.classList.toggle('is-picking-color', open);
    refs.tabs.forEach((tab) => { tab.panel.hidden = open || tab.name !== state.tab; });
    refs.colors.hidden = !open;
  }
  function openColors(column) {
    const { colors, colorsTitle, backText, saved, auto, custom, palette } = refs;
    state.colorFor = column;
    const name = nameOfColumn(state.table, column);
    const title = I18n.t('chart.make.color.title', { name });
    colorsTitle.textContent = title;
    colors.setAttribute('aria-label', title);
    backText.textContent = I18n.t('chart.make.color.back');
    auto.textContent = I18n.t('chart.make.color.auto');
    custom.textContent = I18n.t('colorDropdown.customLabel');
    custom.title = I18n.t('colorDropdown.custom');
    Dom.setMarkup(saved, savedHtml());
    saved.hidden = !saved.firstChild;
    markColors();
    showColors(true);
    // Le clavier entre dans la palette par la couleur choisie (ou la première).
    const stop = palette.querySelector('.cp-swatch[tabindex="0"]');
    (stop || auto).focus();
  }
  // La couleur choisie est marquée dans la palette et les couleurs gardées ; sans couleur propre à la série (celle du jeu), c'est « Couleur de la palette » qui l'est.
  function markColors() {
    const { colors, auto } = refs;
    const own = state.colors[state.colorFor] || '';
    ColorPalette.mark(colors, own);
    auto.setAttribute('aria-pressed', own ? 'false' : 'true');
    auto.classList.toggle('is-active', !own);
    // Une seule pastille par rangée est atteinte par Tab : la choisie, ou à défaut la première.
    colors.querySelectorAll('.pp-chartmake-swatches').forEach((group) => {
      const buttons = Array.from(group.querySelectorAll('.cp-swatch'));
      const stop = buttons.find(button => button.classList.contains('is-active')) || buttons[0];
      buttons.forEach((button) => { button.tabIndex = button === stop ? 0 : -1; });
    });
  }
  function closeColors() {
    const column = state.colorFor;
    if (column === null || column === undefined) return;
    state.colorFor = null;
    showColors(false);
    renderSeries();
    const back = Array.from(refs.seriesList.querySelectorAll('.pp-chartmake-swatch')).find(button => button.dataset.column === column);
    (back || refs.tabs[TABS.indexOf(state.tab)].button).focus();
  }
  // `color` vide : la couleur du jeu, la série n'a plus de couleur à elle.
  function chooseColor(color) {
    const column = state.colorFor;
    if (column === null || column === undefined) return;
    if (color) state.colors[column] = color; else delete state.colors[column];
    closeColors();
    changed();
  }
  function onSwatchClick(event) {
    const button = event.target.closest('.cp-swatch');
    if (button && refs.colors.contains(button)) chooseColor(button.dataset.color);
  }
  // Une rangée de pastilles : les flèches vont d'une pastille à l'autre, haut et bas d'une rangée à l'autre de la palette, Début et Fin aux bouts.
  function onSwatchKey(event) {
    const group = event.target.closest ? event.target.closest('.pp-chartmake-swatches') : null;
    if (!group || !event.target.classList.contains('cp-swatch')) return;
    const buttons = Array.from(group.querySelectorAll('.cp-swatch'));
    const at = buttons.indexOf(event.target);
    const grid = group.classList.contains('cp-grid');
    const steps = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: grid ? GRID_COLUMNS : 0, ArrowUp: grid ? -GRID_COLUMNS : 0 };
    let to = -1;
    if (event.key in steps) to = steps[event.key] ? at + steps[event.key] : -1;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = buttons.length - 1;
    if (to < 0 || to >= buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[to].focus();
  }
  // « Personnalisé… » : la fenêtre de couleur s'ouvre sur la couleur de la série ; « Appliquer » y garde la couleur dans les rangées cochées (un pas de Ctrl+Z, comme dans le menu de couleur), puis la
  // prend pour la série. Annulée, elle rend le clavier au bouton.
  function openCustom() {
    const column = state.colorFor;
    ColorDialog.open({
      initial: state.colors[column] || ChartMake.seriesColor(displayDef(), column),
      onApply: ({ color, scopes }) => {
        if (scopes && scopes.length) HistoryMarkers.track('page', () => ColorStore.addTo(scopes, color));
        chooseColor(color);
      },
      onClose: () => { if (win && win.isOpen() && !refs.colors.hidden) refs.custom.focus(); },
    });
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
  // Échap ferme d'abord le choix d'une couleur (retour à la liste des séries), puis la fenêtre.
  function onEscape() {
    if (state && state.colorFor !== null && state.colorFor !== undefined) closeColors();
    else closeWindow();
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
      title: def && def.title ? def.title : '', palette: def && def.palette ? def.palette : ChartMake.PALETTE_IDS[0], colors: def && def.colors ? Object.assign({}, def.colors) : {},
      labels: !!(def && def.labels), mix: def && def.mix ? Object.assign({}, def.mix) : {}, tab: 'data', colorFor: null,
    };
    const { kindsLegend, kindInputs, tableLabel, labelLabel, previewLabel, rowsLegend, linked, all, stack, horizontal, labels, cancel, ok, tabs, titleLabel, titleInput, seriesLegend, paletteInputs } = refs;
    win.title.textContent = I18n.t(found ? 'chart.title.edit' : 'chart.make.title.new');
    refs.tabsBar.setAttribute('aria-label', I18n.t('chart.make.tabs'));
    tabs.forEach((tab) => { tab.button.textContent = I18n.t('chart.make.tab.' + tab.name); });
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
    titleLabel.textContent = I18n.t('chart.make.heading');
    titleInput.placeholder = I18n.t('chart.make.heading.placeholder');
    titleInput.value = state.title;
    seriesLegend.textContent = I18n.t('chart.make.series');
    paletteInputs.forEach((item) => { item.text.textContent = I18n.t('chart.make.palette.' + item.id); });
    labels.text.textContent = I18n.t('chart.make.labels');
    labels.input.checked = state.labels;
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
    showColors(false);
    showTab('data');
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
