// Graphique de la page : un graphique que la personne a réglé dans Grist (type, colonnes, tri, filtres : le panneau de Grist, rien n'est recopié ici) posé
// dans le document. Grist ne laisse pas un widget afficher ou capturer un autre widget de la page, et un cadre ne sort ni en PDF ni en Word : le graphique
// est donc redessiné d'après ses réglages (js/chart-source.js les lit, js/chart-plot.js trace avec le même moteur que Grist). C'est une image
// `img.editor-image` comme les autres (taille, alignement, calque, opacité, exports PDF et Word : rien de nouveau), qui porte en plus ses références :
// `data-chart-section` (le numéro de la section de Grist), `data-chart-scope` (« linked » : les lignes liées à la ligne du document, par la règle de liaison
// des tables ; « all » : toute la table) et `data-chart-name` (le nom montré dans le cadre) - attributs `chartSection`, `chartScope` et `chartName` du nœud,
// js/editor-nodes.js. Comme le QR code d'une colonne, l'éditeur montre un cadre sans image ; le graphique est dessiné à la Lecture et à l'export pour la
// ligne affichée (resolveImage, appelé par js/reader-mode.js), jamais enregistré dans le modèle. Le document suit donc le graphique de Grist : changer son
// type ou ses colonnes là-bas change le document ; un graphique supprimé laisse « [Graphique indisponible] ». Sans ligne à tracer, il disparaît comme une
// image sans pièce jointe.
// La fenêtre « Graphique de la page… » s'ouvre depuis le menu « Lien et blocs de contenu » (index.html, js/main-toolbar.js) ; styles dans
// css/chart-block.css.
const ChartBlock = (function () {
  const el = Dom.el;

  const DEFAULT_WIDTH_PX = 480;   // la taille d'un graphique posé : 8 cm de large environ, de quoi lire les axes sans prendre la page
  const DEFAULT_HEIGHT_PX = 300;
  const MIN_SIDE_PX = 40;
  const MAX_SIDE_PX = 4000;
  const PREVIEW_DELAY_MS = 120;
  const TYPE_KEYS = ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'kaplan_meier', 'custom'];

  // À la Lecture et à l'export
  function noteInPlaceOf(img, key) {
    const span = document.createElement('span');
    span.className = 'resolved-var error-msg';
    span.textContent = I18n.t(key);
    img.replaceWith(span);
  }
  // `needsImage` : un graphique n'a jamais d'image dans le modèle ; une image qui a déjà la sienne (redessinée plus tôt dans le même rendu) est laissée.
  const needsImage = img => !!img.getAttribute('data-chart-section') && !img.getAttribute('src');
  // La taille de l'image, en pixels de mise en page : sa largeur et sa hauteur réglées dans l'éditeur, sinon celles d'un graphique posé.
  function sizeOf(img) {
    const px = value => (/px\s*$/.test(value || '') ? parseFloat(value) : NaN);
    const clamp = value => Math.max(MIN_SIDE_PX, Math.min(MAX_SIDE_PX, Math.round(value)));
    const width = px(img.style.width);
    const height = px(img.style.height);
    const wide = width > 0 ? width : DEFAULT_WIDTH_PX;
    return { width: clamp(wide), height: clamp(height > 0 ? height : wide * DEFAULT_HEIGHT_PX / DEFAULT_WIDTH_PX) };
  }
  function problem(kind, message) {
    const error = new Error(message);
    error.kind = kind;
    return error;
  }

  // Dessine le graphique de la section `id` pour la ligne `record` : { uri } (le PNG, adresse `data:`) ou { empty: true } quand il n'y a aucune ligne à
  // tracer. Lève une erreur dont `kind` dit ce qui manque : « chart » (graphique supprimé ou plus redessinable), « rows » (lignes illisibles), sinon la
  // bibliothèque ou le dessin.
  async function draw(id, scope, tableId, record, width, height) {
    const spec = await ChartSource.read(id);
    if (!spec) throw problem('chart', 'Graphique introuvable : ' + id);
    if (spec.unsupported) throw problem('chart', 'Graphique non redessiné : ' + spec.unsupported);
    let found;
    try { found = await ChartSource.rows(spec, scope, tableId, record); }
    catch (e) { throw problem('rows', e && e.message ? e.message : 'Lignes illisibles'); }
    if (!found.length) return { empty: true };
    const figure = ChartPlot.figure(spec.type, ChartSource.series(spec, found), spec.options);
    return { uri: await ChartPlot.toImage(figure, width, height) };
  }

  // Dessine le graphique de `img` (un cadre sans image du modèle) pour la ligne `record`. Dans une zone répétée il n'est pas lié à la ligne du tour (il n'est pas
  // dans BOUND_SELECTOR de js/loop-rules.js) : à chaque tour, c'est le graphique de la ligne affichée.
  // Sans ligne à tracer il disparaît ; supprimé, illisible ou sans bibliothèque, il laisse une note dans la langue de l'interface (la Lecture et les exports
  // écrivent ce message, pas une image cassée).
  async function resolveImage(img, tableId, record) {
    if (!needsImage(img)) return;
    const size = sizeOf(img);
    const scope = img.getAttribute('data-chart-scope') === 'all' ? 'all' : 'linked';
    let drawn;
    try { drawn = await draw(Number(img.getAttribute('data-chart-section')), scope, tableId, record, size.width, size.height); }
    catch (e) {
      console.warn('[ChartBlock] graphique indisponible', e);
      noteInPlaceOf(img, 'chart.doc.unavailable');
      return;
    }
    if (drawn.empty) { img.remove(); return; }
    img.setAttribute('src', drawn.uri);
    // Le PNG a exactement les proportions réglées : sans hauteur fixe, un graphique plus large que sa case rétrécit sans se déformer.
    img.style.width = size.width + 'px';
    img.style.height = '';
    img.style.setProperty('aspect-ratio', size.width + ' / ' + size.height);
  }

  // Dans l'éditeur
  // Le nœud « image » sélectionné quand c'est un graphique : { node, pos }, sinon null.
  function selectedNode(ed) {
    const node = ed && ed.state.selection.node;
    return node && node.type && node.type.name === 'editorImage' && node.attrs.chartSection && !node.attrs.src ? { node, pos: ed.state.selection.from } : null;
  }
  const isSelected = ed => !!selectedNode(ed);

  // La fenêtre
  let win = null;
  let refs = null;
  let state = null;
  let picker = null;
  let previewToken = 0;
  let previewTimer = 0;

  const radioOf = (name, value, onPick) => {
    const label = el('label', 'pp-chart-option');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.addEventListener('change', () => { if (input.checked) onPick(value); });
    const text = el('span', 'pp-chart-option-name');
    const detail = el('span', 'pp-chart-option-detail');
    label.append(input, text, detail);
    return { label, input, text, detail };
  };

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas à la ligne du menu - la sélection y est restée.
    win = ModalBase.create({ id: 'pp-chart-modal', titleId: 'pp-chart-title', size: 'lg', boxClass: 'pp-chart-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const grid = el('div', 'pp-chart-grid');
    const form = el('div', 'pp-chart-form');
    const pickLabel = el('label', 'pp-dialog-label');
    pickLabel.htmlFor = 'pp-chart-pick';
    const select = el('select', 'pp-chart-select');
    select.id = 'pp-chart-pick';
    select.setAttribute('aria-describedby', 'pp-chart-hint pp-chart-error');
    const hint = el('p', 'pp-chart-note');
    hint.id = 'pp-chart-hint';
    const rows = el('fieldset', 'pp-chart-rows');
    const rowsLegend = el('legend', 'pp-dialog-label');
    const linked = radioOf('pp-chart-rows', 'linked', pickScope);
    const all = radioOf('pp-chart-rows', 'all', pickScope);
    rows.append(rowsLegend, linked.label, all.label);
    const selectBy = el('p', 'pp-chart-note');
    selectBy.hidden = true;
    const error = el('p', 'pp-chart-note pp-chart-error');
    error.id = 'pp-chart-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    form.append(pickLabel, select, hint, rows, selectBy, error);
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
    side.append(previewLabel, paper, caption);
    grid.append(form, side);
    win.body.appendChild(grid);

    const { cancel, ok } = win.addButtons();
    refs = { pickLabel, select, hint, rows, rowsLegend, linked, all, selectBy, error, previewLabel, paper, image, message, caption, cancel, ok };
    try {
      picker = SearchSelect.attachCharts(select);
    } catch (e) {
      console.warn('[ChartBlock] liste avec recherche indisponible', e);
    }
    select.addEventListener('change', pickChart);
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
  }

  function clearError() {
    refs.error.hidden = true;
    refs.error.textContent = '';
    refs.select.removeAttribute('aria-invalid');
  }
  function showError(text) {
    refs.error.textContent = text;
    refs.error.hidden = false;
    refs.select.setAttribute('aria-invalid', 'true');
  }

  // Le texte d'une ligne de la liste : le nom du graphique, puis (type · table).
  function typeLabel(spec) { return TYPE_KEYS.indexOf(spec.type) === -1 ? spec.type : I18n.t('chart.type.' + spec.type); }
  function hintOf(spec) { return spec.title ? typeLabel(spec) + ' · ' + spec.tableLabel : typeLabel(spec); }

  // Les graphiques du document en lignes du <select>, rangés par page ; ceux que le widget ne sait pas redessiner sont grisés, avec la raison.
  function fillList(specs, chosenId) {
    const { select } = refs;
    select.replaceChildren();
    const placeholder = Dom.option('', I18n.t('chart.pick.placeholder'));
    placeholder.disabled = true;
    select.appendChild(placeholder);
    let group = null;
    let groupId = null;
    specs.forEach((spec) => {
      if (group === null || spec.pageId !== groupId) {
        group = el('optgroup');
        group.label = I18n.t('chart.pick.page', { name: spec.page });
        groupId = spec.pageId;
        select.appendChild(group);
      }
      const hint = hintOf(spec);
      const option = Dom.option(String(spec.id), spec.name + ' (' + hint + ')');
      option.dataset.name = spec.name;
      option.dataset.hint = hint;
      option.dataset.search = [spec.page, spec.tableLabel, typeLabel(spec), spec.title].join(' ');
      if (spec.unsupported) option.dataset.unavailable = I18n.t(spec.unsupported);
      group.appendChild(option);
    });
    select.value = chosenId != null && specs.some(spec => spec.id === chosenId) ? String(chosenId) : '';
    if (picker) picker.sync();
  }

  // Le choix des lignes : « liées » demande un graphique d'une autre table que celle du document ; la liaison entre les deux tables se règle à la
  // validation si elle ne l'est pas encore (comme une bulle d'une autre table).
  const currentTable = () => GristAPI.getCurrentTableId();
  function sameTable(spec) { return !!spec && spec.table === currentTable(); }
  function needsLink(spec) { return !!spec && !sameTable(spec) && !GristAPI.getLinkRule(spec.table); }

  function pickScope(value) {
    state.scope = value;
    clearError();
    renderScope();
    schedulePreview(0);
  }
  function renderScope() {
    const { linked, all, selectBy } = refs;
    const spec = state.spec;
    // La table du graphique est celle du document : « liées » ne donnerait que la ligne affichée, un seul point ; seule « toute la table » a un sens.
    const off = !!spec && sameTable(spec);
    if (off && state.scope === 'linked') state.scope = 'all';
    linked.input.checked = state.scope === 'linked';
    all.input.checked = state.scope === 'all';
    linked.input.disabled = off;
    linked.label.classList.toggle('is-off', off);
    linked.detail.textContent = !spec ? I18n.t('chart.rows.linked.detail') : (sameTable(spec) ? I18n.t('chart.rows.linked.sameTable') : (needsLink(spec) ? I18n.t('chart.rows.linked.needsLink') : I18n.t('chart.rows.linked.detail')));
    selectBy.hidden = !(spec && spec.linkedInGrist);
    selectBy.textContent = selectBy.hidden ? '' : I18n.t('chart.rows.selectBy');
  }

  // Un graphique choisi : le mode par défaut est « liées » dès qu'une règle de liaison existe entre les deux tables, sinon toute la table.
  function pickChart() {
    const spec = state.specs.get(Number(refs.select.value)) || null;
    state.spec = spec;
    state.scope = spec && !sameTable(spec) && GristAPI.getLinkRule(spec.table) ? 'linked' : 'all';
    clearError();
    renderScope();
    schedulePreview(0);
  }

  // L'aperçu : le graphique pour la ligne en cours (toute la table en mode « toute la table ») ou, à la place, la raison pour laquelle il n'y en a pas.
  function setPreview(kind, uri) {
    const { image, message, paper, caption } = refs;
    paper.dataset.state = kind;
    const shown = kind === 'chart';
    image.hidden = !shown;
    if (shown) image.src = uri; else image.removeAttribute('src');
    message.hidden = shown;
    message.textContent = shown ? '' : I18n.t('chart.preview.' + kind, { table: state.spec ? state.spec.table : '' });
    caption.hidden = !(shown && state.scope === 'linked');
    caption.textContent = caption.hidden ? '' : I18n.t('chart.preview.row');
    // Rien à insérer sans graphique redessinable ; une ligne sans valeur, une liaison encore à régler ou une bibliothèque qui n'a pas pu se charger n'empêchent
    // rien (une autre ligne a des données, la liaison se règle à la validation, le graphique se dessine à la Lecture).
    refs.ok.disabled = !state.spec || !!state.spec.unsupported;
  }
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, delay === undefined ? PREVIEW_DELAY_MS : delay);
  }
  async function refreshPreview() {
    const token = ++previewToken;
    const spec = state.spec;
    if (!spec) { setPreview('empty'); return; }
    if (spec.unsupported) { setPreview('unsupported'); return; }
    if (state.scope === 'linked') {
      if (needsLink(spec)) { setPreview('needsLink'); return; }
      if (!GristAPI.getCurrentRecord()) { setPreview('noRecord'); return; }
    }
    setPreview('loading');
    try {
      const drawn = await GristAPI.withReadPass(() => draw(spec.id, state.scope, currentTable(), GristAPI.getCurrentRecord(), DEFAULT_WIDTH_PX, DEFAULT_HEIGHT_PX));
      if (token !== previewToken) return;
      if (drawn.empty) setPreview('noRows'); else setPreview('chart', drawn.uri);
    } catch (e) {
      if (token !== previewToken) return;
      console.warn('[ChartBlock] aperçu indisponible', e);
      setPreview(e.kind === 'rows' ? 'unresolved' : (e.kind === 'chart' ? 'missing' : 'unavailable'));
    }
  }

  function closeWindow() {
    clearTimeout(previewTimer);
    previewToken += 1;
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Ouvre la fenêtre : pour changer le graphique sélectionné s'il y en a un, sinon pour en insérer un à la place du curseur. Faux quand l'éditeur n'est pas
  // modifiable.
  function open() {
    const ed = EditorCore.getEditor();
    if (!ed || !ed.isEditable) return false;
    ensure();
    const found = selectedNode(ed);
    state = {
      editing: !!found, pos: found ? found.pos : null, specs: new Map(), spec: null,
      scope: found && found.node.attrs.chartScope === 'all' ? 'all' : 'linked', chosenId: found ? Number(found.node.attrs.chartSection) : null,
    };
    const { pickLabel, hint, rowsLegend, linked, all, previewLabel, cancel, ok, select } = refs;
    win.title.textContent = I18n.t(found ? 'chart.title.edit' : 'chart.title.new');
    pickLabel.textContent = I18n.t('chart.pick.label');
    hint.textContent = I18n.t('chart.pick.hint');
    rowsLegend.textContent = I18n.t('chart.rows.label');
    linked.text.textContent = I18n.t('chart.rows.linked');
    all.text.textContent = I18n.t('chart.rows.all');
    all.detail.textContent = I18n.t('chart.rows.all.detail');
    previewLabel.textContent = I18n.t('chart.preview');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(found ? 'common.confirm' : 'common.insert');
    clearError();
    renderScope();
    setPreview('empty');
    ok.disabled = true;
    select.replaceChildren(Dom.option('', I18n.t('chart.pick.loading')));
    select.disabled = true;
    if (picker) picker.sync();
    win.show(() => cancel);
    load();
    return true;
  }

  // Lit les graphiques de la page et remplit la liste. Une lecture qui échoue ou une page sans graphique le dit sous le champ.
  async function load() {
    const mine = state;
    const { select } = refs;
    let specs;
    try { specs = await GristAPI.withReadPass(() => ChartSource.list()); }
    catch (e) {
      console.warn('[ChartBlock] graphiques illisibles', e);
      if (state === mine) { select.replaceChildren(Dom.option('', I18n.t('chart.pick.placeholder'))); if (picker) picker.sync(); showError(I18n.t('chart.pick.error')); }
      return;
    }
    if (state !== mine) return;
    mine.specs = new Map(specs.map(spec => [spec.id, spec]));
    select.disabled = !specs.length;
    fillList(specs, mine.chosenId);
    if (!specs.length) refs.hint.textContent = I18n.t('chart.pick.none');
    const spec = mine.specs.get(mine.chosenId) || null;
    if (mine.editing && !spec) showError(I18n.t('chart.pick.gone'));
    mine.spec = spec;
    // Un graphique déjà posé garde ses lignes ; un nouveau choix prend le mode par défaut (pickChart).
    renderScope();
    schedulePreview(0);
    // Le focus passe à la liste, sauf si la personne est déjà allée ailleurs dans la fenêtre pendant la lecture.
    if (document.activeElement === refs.cancel || !win.box.contains(document.activeElement)) win.show(() => select);
  }

  // « Insérer » : pose le graphique à la place du curseur (jamais à celle de ce qui est sélectionné : il s'ajoute derrière) ou change celui qui est
  // sélectionné, qui garde sa taille, sa place et son habillage.
  async function apply() {
    const ed = EditorCore.getEditor();
    const spec = state && state.spec;
    if (!ed || !spec || spec.unsupported) return;
    // Les lignes liées demandent la liaison entre la table du graphique et celle du document : réglée ici si elle ne l'est pas encore, comme à
    // l'insertion d'une bulle d'une autre table ; refusée, la fenêtre reste ouverte.
    if (state.scope === 'linked' && needsLink(spec) && !(await Variables.ensureLinkConfigured({ table: spec.table }))) return;
    const attrs = { src: null, alt: I18n.t('chart.alt', { name: spec.name }), chartSection: String(spec.id), chartScope: state.scope, chartName: spec.name };
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

  return { DEFAULT_WIDTH_PX, DEFAULT_HEIGHT_PX, needsImage, resolveImage, isSelected, open };
})();
