// Fenêtre « Boucle » d'une bulle #Variable (maquette validée par Antoine le 2026-09-28, « nickel pour implémentation ») : répéter la ligne du tableau,
// l'élément de liste ou le paragraphe qui contient la bulle - ou la bulle seule, dans la phrase - pour chaque ligne liée à la ligne de la page. La boucle
// vit dans l'attribut `loop` de la bulle (js/editor-nodes.js) ; son moteur (lignes parcourues, filtre, tri, déroulé en lecture et à l'export) est
// js/loop-rules.js. Même gabarit que la fenêtre de condition (js/variable-condition.js), mêmes lignes de filtre (js/condition-fields.js, sur les colonnes
// de la table parcourue), aperçu en direct sur la ligne sélectionnée puis sur toutes les lignes de la page. Ouverte depuis la barre flottante de la bulle
// (js/floating-toolbars.js:wireVariableFloatingToolbar) ; les repères de la zone répétée dans l'éditeur sont en CSS seul (css/variable-actions.css).
const VariableLoop = (function () {
  // Nœuds ProseMirror qui forment une zone répétée, pour chaque `repeat` : les mêmes que js/loop-rules.js:zoneOf côté HTML (tr, li, p et h1-h6).
  const ZONE_NODES = { row: ['tableRow'], item: ['listItem', 'taskItem'], paragraph: ['paragraph', 'heading'] };
  // Valeurs citées dans l'aperçu d'une zone répétée : les premières seulement, la suite en « … ».
  const PREVIEW_VALUES = 3;

  let modalEl = null;
  let refs = null;
  // { editor, pos, node, had, place, source, working } - `working` est une copie : rien n'est écrit dans la bulle avant « Enregistrer ».
  let state = null;
  let previewGeneration = 0;
  let previewTimer = null;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function option(value, label) {
    const o = el('option', null, label);
    o.value = value;
    return o;
  }
  function emptyRule() { return { column: '', operator: '=', value: '' }; }
  function isOpen() { return !!state; }

  // === Lecture du document de l'éditeur ===
  function nearestDepth($pos, names) {
    for (let d = $pos.depth; d > 0; d--) if (names.indexOf($pos.node(d).type.name) !== -1) return d;
    return -1;
  }
  // Bulle qui répète ce nœud (`start` : sa position) : la première, dans l'ordre du document, qui porte une boucle `repeat` dont ce nœud est la zone - la
  // même que retient js/loop-rules.js:expandZones en lecture.
  function zoneOwner(doc, start, zoneNode, repeat) {
    let owner = null;
    zoneNode.descendants((child, rel) => {
      if (owner) return false;
      if (child.type.name !== 'varBadge') return true;
      const loop = LoopRules.normalizeLoop(child.attrs.loop);
      if (loop && loop.repeat === repeat) {
        const $badge = doc.resolve(start + 1 + rel);
        const depth = nearestDepth($badge, ZONE_NODES[repeat]);
        if (depth !== -1 && $badge.before(depth) === start) owner = { pos: start + 1 + rel, node: child, loop };
      }
      return false;
    });
    return owner;
  }
  // Zones répétées qui contiennent `pos`, de la plus proche à la plus large : [{ repeat, owner }].
  function zonesAt(editorState, pos) {
    const $pos = editorState.doc.resolve(pos);
    const zones = [];
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      const repeat = Object.keys(ZONE_NODES).find(r => ZONE_NODES[r].indexOf(node.type.name) !== -1);
      if (!repeat) continue;
      const owner = zoneOwner(editorState.doc, $pos.before(d), node, repeat);
      if (owner) zones.push({ repeat, owner });
    }
    return zones;
  }
  // Table parcourue par la zone répétée qui contient `pos` (la plus proche) - l'autocomplétion # propose ses colonnes en premier, sans demander de lien
  // (js/variables.js). Null hors d'une zone répétée.
  function loopTableAt(editorState, pos) {
    try {
      const zones = zonesAt(editorState, pos);
      return zones.length ? zones[0].owner.loop.table : null;
    } catch (e) {
      return null;
    }
  }
  // Icône Boucle de la barre flottante pour la bulle à `pos` : active quand une boucle est posée ; grisée, avec l'info-bulle qui dit pourquoi, quand la
  // variable n'a qu'une ligne à montrer ou qu'elle est déjà dans une zone répétée par une autre bulle (pas de boucle dans une boucle en V1).
  function status(editor, pos, node) {
    if (LoopRules.normalizeLoop(node.attrs.loop)) return { active: true, enabled: true, title: I18n.t('varToolbar.loop') };
    const outer = zonesAt(editor.state, pos).find(z => z.owner.pos !== pos);
    if (outer) return { active: false, enabled: false, title: I18n.t('varToolbar.loopNested', { table: outer.owner.loop.table }) };
    const source = LoopRules.sourceFor(node.attrs, GristAPI.getCurrentTableId());
    return { active: false, enabled: !!source, title: I18n.t(source ? 'varToolbar.loop' : 'varToolbar.loopDisabled') };
  }
  // Où est la bulle : décide des choix « Ce qui se répète » (le plus proche l'emporte : une liste dans une cellule propose l'élément de liste).
  function placeOf(editorState, pos) {
    const $pos = editorState.doc.resolve(pos);
    const rowDepth = nearestDepth($pos, ZONE_NODES.row);
    const itemDepth = nearestDepth($pos, ZONE_NODES.item);
    if (rowDepth !== -1 && rowDepth > itemDepth) return { kind: 'table', repeats: ['row', 'inline'], inCell: true };
    if (itemDepth !== -1) return { kind: 'list', repeats: ['item', 'inline'], inCell: rowDepth !== -1 };
    return { kind: $pos.parent.type.name === 'heading' ? 'heading' : 'paragraph', repeats: ['inline', 'paragraph'], inCell: false };
  }

  // === Libellés ===
  function repeatLabel(repeat, place) {
    if (repeat === 'inline') return I18n.t(place.kind === 'table' ? 'varLoop.repeat.cell' : 'varLoop.repeat.inline');
    if (repeat === 'paragraph') return I18n.t(place.kind === 'heading' ? 'varLoop.repeat.heading' : 'varLoop.repeat.paragraph');
    return I18n.t('varLoop.repeat.' + repeat);
  }
  function emptyLabel(mode, repeat, place) {
    if (repeat === 'row') return I18n.t(mode === 'text' ? 'varLoop.empty.rowText' : 'varLoop.empty.header');
    if (repeat === 'item') return I18n.t(mode === 'text' ? 'varLoop.empty.itemText' : 'varLoop.empty.none');
    if (mode === 'hide') return I18n.t(place.kind === 'heading' ? 'varLoop.empty.hideHeading' : 'varLoop.empty.hide');
    return I18n.t(mode === 'text' ? 'varLoop.empty.text' : 'varLoop.empty.blank');
  }
  // Ce que montre la lecture quand aucune ligne n'est retenue (même règle que js/loop-rules.js:applyEmptyZone et emptyInlineNode).
  function emptyEffect(loop, place) {
    const text = loop.emptyText;
    if (loop.repeat === 'row') return loop.empty === 'text' ? I18n.t('varLoop.effect.rowText', { text }) : I18n.t('varLoop.effect.header');
    if (loop.repeat === 'item') return loop.empty === 'text' ? I18n.t('varLoop.effect.itemText', { text }) : I18n.t('varLoop.effect.none');
    if (loop.empty === 'hide') return I18n.t(place.kind === 'heading' ? 'varLoop.effect.hideHeading' : 'varLoop.effect.hide');
    if (loop.repeat === 'inline') return loop.empty === 'text' && text ? I18n.t('varLoop.preview.inline', { text }) : I18n.t('varLoop.effect.inlineBlank');
    return loop.empty === 'text' ? I18n.t('varLoop.effect.text', { text }) : I18n.t('varLoop.effect.blank');
  }
  // Tri d'une colonne de texte (ou de choix, de référence) : A → Z ; nombres, dates, cases à cocher : croissant.
  function isTextual(table, column) {
    if (!column) return false;
    const type = GristAPI.getColumnType(table, column) || '';
    return type === 'Text' || type === 'Choice' || type === 'ChoiceList' || type.indexOf('Ref:') === 0 || type.indexOf('RefList:') === 0;
  }

  // === Fenêtre ===
  function ensureModal() {
    if (modalEl) return;
    modalEl = el('div');
    modalEl.id = 'var-loop-modal';
    modalEl.style.display = 'none';
    modalEl.tabIndex = -1;
    const box = el('div', 'modal-content var-modal-content var-loop-modal-content');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'var-loop-title');
    const title = el('h3');
    title.id = 'var-loop-title';
    const intro = el('p', 'var-modal-intro');

    const sourceLabel = el('div', 'var-loop-label');
    const sourceBox = el('div', 'var-loop-source');
    const sourceText = el('span');
    const sourceEdit = el('button', 'var-loop-link');
    sourceEdit.type = 'button';
    sourceBox.append(sourceText, sourceEdit);

    const repeatLabelEl = el('div', 'var-loop-label');
    repeatLabelEl.id = 'var-loop-repeat-label';
    const repeatSeg = el('div', 'var-loop-seg');
    repeatSeg.setAttribute('role', 'group');
    repeatSeg.setAttribute('aria-labelledby', 'var-loop-repeat-label');
    const separatorRow = el('div', 'var-loop-seps');
    const sepLabel = el('label');
    sepLabel.htmlFor = 'var-loop-sep';
    const sepInput = el('input');
    sepInput.type = 'text';
    sepInput.id = 'var-loop-sep';
    sepInput.className = 'var-loop-sep-input';
    const lastLabel = el('label');
    lastLabel.htmlFor = 'var-loop-last';
    const lastInput = el('input');
    lastInput.type = 'text';
    lastInput.id = 'var-loop-last';
    lastInput.className = 'var-loop-last-input';
    const sepHint = el('span', 'var-loop-hint');
    separatorRow.append(sepLabel, sepInput, lastLabel, lastInput, sepHint);

    const filterLabel = el('div', 'var-loop-label');
    const filterBox = el('div', 'var-loop-filter');

    const two = el('div', 'var-loop-two');
    const sortCol = el('div');
    const sortLabel = el('label', 'var-loop-label');
    sortLabel.htmlFor = 'var-loop-sort';
    const sortRow = el('div', 'var-loop-sort-row');
    const sortColumn = el('select');
    sortColumn.id = 'var-loop-sort';
    const sortDirection = el('select');
    sortRow.append(sortColumn, sortDirection);
    sortCol.append(sortLabel, sortRow);
    const emptyCol = el('div');
    const emptyLabelEl = el('label', 'var-loop-label');
    emptyLabelEl.htmlFor = 'var-loop-empty';
    const emptySelect = el('select', 'var-loop-empty-select');
    emptySelect.id = 'var-loop-empty';
    emptyCol.append(emptyLabelEl, emptySelect);
    two.append(sortCol, emptyCol);
    const emptyTextRow = el('div', 'var-loop-empty-text');
    const emptyTextLabel = el('label');
    emptyTextLabel.htmlFor = 'var-loop-empty-text';
    const emptyTextInput = el('input');
    emptyTextInput.type = 'text';
    emptyTextInput.id = 'var-loop-empty-text';
    emptyTextRow.append(emptyTextLabel, emptyTextInput);

    const preview = el('div', 'var-condition-debug');
    preview.setAttribute('aria-live', 'polite');
    const currentLine = el('div', 'var-condition-debug-line');
    const statsLine = el('div', 'var-condition-debug-line');
    preview.append(currentLine, statsLine);

    const actions = el('div', 'var-modal-actions');
    const removeBtn = el('button', 'var-modal-danger');
    removeBtn.type = 'button';
    const spacer = el('span', 'var-modal-spacer');
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'var-modal-primary');
    saveBtn.type = 'button';
    actions.append(removeBtn, spacer, cancelBtn, saveBtn);

    box.append(title, intro, sourceLabel, sourceBox, repeatLabelEl, repeatSeg, separatorRow, filterLabel, filterBox, two, emptyTextRow, preview, actions);
    modalEl.appendChild(box);
    document.body.appendChild(modalEl);
    refs = {
      title, intro, sourceLabel, sourceText, sourceEdit, repeatLabelEl, repeatSeg, separatorRow, sepLabel, sepInput, lastLabel, lastInput, sepHint,
      filterLabel, filterBox, sortLabel, sortColumn, sortSearch: null, sortDirection, emptyLabelEl, emptySelect, emptyTextRow, emptyTextLabel, emptyTextInput,
      currentLine, statsLine, removeBtn, cancelBtn, saveBtn,
    };

    sourceEdit.addEventListener('click', async () => {
      if (!state) return;
      const changed = await Variables.editLinkRule(state.source.table);
      if (changed && state) { renderSource(); schedulePreview(); }
    });
    sepInput.addEventListener('input', () => { if (state) state.working.separator = sepInput.value; });
    lastInput.addEventListener('input', () => { if (state) state.working.lastSeparator = lastInput.value; });
    sortColumn.addEventListener('change', () => {
      if (!state) return;
      state.working.sortColumn = sortColumn.value;
      renderSortDirection();
    });
    sortDirection.addEventListener('change', () => { if (state) state.working.sortDirection = sortDirection.value === 'desc' ? 'desc' : 'asc'; });
    emptySelect.addEventListener('change', () => {
      if (!state) return;
      state.working.empty = emptySelect.value;
      renderEmpty();
    });
    emptyTextInput.addEventListener('input', () => { if (state) state.working.emptyText = emptyTextInput.value; });
    removeBtn.addEventListener('click', () => { if (state) { applyLoop(null); close(); } });
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    // Toute saisie (séparateurs, filtre, tri, choix « si aucune ligne ») relance l'aperçu, avec un court délai pour ne pas recalculer à chaque touche.
    box.addEventListener('input', schedulePreview);
    box.addEventListener('change', schedulePreview);
    modalEl.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state) return;
      // Échap appartient à la fenêtre de choix de la clé tant qu'elle est ouverte par-dessus (« Modifier le lien », elle garde son propre Annuler).
      const linkModal = document.getElementById('link-config-modal');
      if (linkModal && linkModal.style.display !== 'none') return;
      event.preventDefault();
      close();
    });
  }

  function renderIntro() {
    const badge = el('span', 'var-badge', Variables.triggerChar() + (state.node.attrs.key || ''));
    const inline = state.working.repeat === 'inline';
    if (inline) badge.setAttribute('data-loop-repeat', 'inline');
    refs.intro.replaceChildren(badge, document.createTextNode(' ' + I18n.t(inline ? 'varLoop.intro.inline' : 'varLoop.intro.zone', { table: state.source.table })));
  }
  // « Lignes de « Lignes » trouvées via Lignes.Facture · Modifier le lien » - le lien de la table (un par table et par document, js/variables.js), ou la
  // colonne Liste de références qui fournit les lignes (rien à modifier : c'est la cellule de la page).
  function renderSource() {
    const { sourceText, sourceEdit } = refs;
    const { table, via } = state.source;
    sourceEdit.hidden = !!via;
    if (via) { sourceText.textContent = I18n.t('varLoop.source.refList', { table, via: via.table + '.' + via.column }); return; }
    const rule = GristAPI.getLinkRule(table);
    if (!rule) sourceText.textContent = I18n.t('varLoop.source.noLink', { table });
    else if (rule.mode === 'singleton') sourceText.textContent = I18n.t('varLoop.source.singleton', { table });
    else sourceText.textContent = I18n.t('varLoop.source.link', { table, via: Variables.describeLinkVia(table, rule, GristAPI.getCurrentTableId()) });
  }
  function renderRepeat() {
    const { repeatSeg, separatorRow } = refs;
    repeatSeg.replaceChildren();
    state.place.repeats.forEach(repeat => {
      const on = repeat === state.working.repeat;
      const btn = el('button', on ? 'is-on' : '', repeatLabel(repeat, state.place));
      btn.type = 'button';
      btn.dataset.repeat = repeat;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.addEventListener('click', () => setRepeat(repeat));
      repeatSeg.appendChild(btn);
    });
    separatorRow.hidden = state.working.repeat !== 'inline';
  }
  function setRepeat(repeat) {
    if (!state || state.working.repeat === repeat) return;
    state.working.repeat = repeat;
    // « Masquer », « Afficher un texte », « Laisser vide » valent pour la phrase comme pour le paragraphe ; sinon, le choix par défaut de la nouvelle zone.
    if (LoopRules.EMPTY_MODES[repeat].indexOf(state.working.empty) === -1) state.working.empty = LoopRules.defaultEmpty(repeat, state.place.inCell);
    renderIntro();
    renderRepeat();
    renderEmpty();
    schedulePreview();
    const pressed = refs.repeatSeg.querySelector('button[aria-pressed="true"]');
    if (pressed) pressed.focus();
  }
  function addRuleButton() {
    const addBtn = el('button', 'var-condition-add', I18n.t('varCond.addRule'));
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      if (!state) return;
      state.working.rules.push(emptyRule());
      renderFilter();
      schedulePreview();
      const selects = refs.filterBox.querySelectorAll('select.macro-rule-column');
      if (selects.length) selects[selects.length - 1].focus();
    });
    return addBtn;
  }
  // Sans condition : le bouton d'ajout et « toutes les lignes liées ». Avec : « Garder les lignes où toutes / au moins une les conditions sont remplies »,
  // puis les lignes Colonne / Opérateur / Valeur sur les colonnes de la table parcourue.
  function renderFilter() {
    const { filterBox } = refs;
    filterBox.replaceChildren();
    const rules = state.working.rules;
    if (!rules.length) {
      const row = el('div', 'var-loop-filter-empty');
      row.append(addRuleButton(), el('span', 'var-loop-hint', I18n.t('varLoop.filter.none')));
      filterBox.appendChild(row);
      return;
    }
    const modeRow = el('div', 'var-condition-mode');
    const modeSelect = el('select');
    modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    modeSelect.append(option('all', I18n.t('varCond.modeAll')), option('any', I18n.t('varCond.modeAny')));
    modeSelect.value = state.working.filterMode;
    modeSelect.addEventListener('change', () => {
      state.working.filterMode = modeSelect.value === 'any' ? 'any' : 'all';
      renderFilter();
      schedulePreview();
    });
    modeRow.append(el('span', null, I18n.t('varLoop.filter.before')), modeSelect, el('span', null, I18n.t('varCond.modeAfter')));
    const rulesBox = el('div', 'var-condition-rules');
    rules.forEach((rule, index) => {
      const row = el('div', 'macro-rule-row');
      const connectorKey = index === 0 ? 'macro.modal.ruleIf' : (state.working.filterMode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd');
      row.appendChild(el('span', 'macro-rule-connector', I18n.t(connectorKey)));
      const fields = ConditionFields.buildConditionFields(rule, { table: state.source.table });
      row.append(fields.columnWrap, fields.operatorSelect, fields.valueSlot);
      const removeBtn = el('button', 'macro-rule-remove');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', I18n.t('varCond.removeRule'));
      removeBtn.title = I18n.t('varCond.removeRule');
      removeBtn.addEventListener('click', () => {
        rules.splice(index, 1);
        renderFilter();
        schedulePreview();
      });
      row.append(removeBtn, fields.typeHint);
      rulesBox.appendChild(row);
    });
    rulesBox.appendChild(addRuleButton());
    filterBox.append(modeRow, rulesBox);
  }
  function renderSort() {
    const { sortColumn } = refs;
    const table = state.source.table;
    const tableOrder = option('', I18n.t(state.source.via ? 'varLoop.sort.listOrder' : 'varLoop.sort.tableOrder'));
    tableOrder.dataset.placeholder = 'false'; // un vrai choix de la liste avec recherche, pas un « rien » grisé
    sortColumn.replaceChildren(tableOrder);
    GristAPI.getColumns(table).filter(c => c.indexOf('gristHelper_') !== 0).forEach(c => ConditionFields.appendColumnOption(sortColumn, c, table, c));
    // Colonne de tri retirée de la table depuis : gardée dans la liste plutôt que remplacée en silence par l'ordre de la table.
    const current = state.working.sortColumn;
    if (current && !Array.from(sortColumn.options).some(o => o.value === current)) sortColumn.appendChild(option(current, current));
    sortColumn.value = current;
    // Liste avec recherche, comme les colonnes du filtre (attach() ne fait rien de plus si elle est déjà posée) ; si le composant est indisponible, la liste
    // native reste, inchangée. Le champ visible relit le <select> après chaque remplissage (`sync`) ; le type reste dans la liste, le champ étant étroit.
    try { refs.sortSearch = SearchSelect.attachColumns(sortColumn, { inline: true, hintInTrigger: false }); } catch (e) { console.warn('[VariableLoop] recherche de colonne indisponible, liste native conservée', e); }
    if (refs.sortSearch) refs.sortSearch.sync();
    renderSortDirection();
  }
  function renderSortDirection() {
    const { sortDirection } = refs;
    const textual = isTextual(state.source.table, state.working.sortColumn);
    sortDirection.setAttribute('aria-label', I18n.t('varLoop.sort.directionAria'));
    sortDirection.replaceChildren(
      option('asc', I18n.t(textual ? 'varLoop.sort.az' : 'varLoop.sort.asc')),
      option('desc', I18n.t(textual ? 'varLoop.sort.za' : 'varLoop.sort.desc')));
    sortDirection.value = state.working.sortDirection;
  }
  function renderEmpty() {
    const { emptySelect, emptyTextRow, emptyTextInput } = refs;
    const repeat = state.working.repeat;
    emptySelect.replaceChildren(...LoopRules.EMPTY_MODES[repeat].map(mode => option(mode, emptyLabel(mode, repeat, state.place))));
    emptySelect.value = state.working.empty;
    emptyTextRow.hidden = state.working.empty !== 'text';
    if (document.activeElement !== emptyTextInput) emptyTextInput.value = state.working.emptyText;
  }

  // Boucle telle qu'elle sera enregistrée : seulement les champs utiles à sa zone (js/loop-rules.js:normalizeLoop complète le reste à la lecture).
  function workingLoop() {
    const w = state.working;
    const loop = { repeat: w.repeat, table: state.source.table };
    if (state.source.via) loop.via = { table: state.source.via.table, column: state.source.via.column };
    const filter = ConditionRules.normalizeCondition({ mode: w.filterMode, rules: w.rules });
    if (filter) {
      loop.filter = {
        mode: filter.mode,
        rules: filter.rules.map(r => ({ column: r.column, operator: r.operator || '=', value: r.value == null ? '' : String(r.value) })),
      };
    }
    if (w.sortColumn || w.sortDirection === 'desc') loop.sort = { column: w.sortColumn, direction: w.sortDirection };
    loop.empty = w.empty;
    if (w.empty === 'text') loop.emptyText = w.emptyText;
    if (w.repeat === 'inline') { loop.separator = w.separator; loop.lastSeparator = w.lastSeparator; }
    return loop;
  }

  // === Aperçu === Même calcul que la lecture (LoopRules.iterate) : la ligne sélectionnée dans Grist, puis toutes les lignes de la table de la page, en ne
  // lisant chaque table qu'une fois (LoopRules.createContext).
  function setLine(line, text, good) {
    line.replaceChildren();
    line.hidden = !text;
    line.classList.toggle('is-good', !!good);
    if (!text) return;
    if (good) {
      const icon = el('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex:none; display:inline-flex; width:14px; height:14px; margin-top:2px;';
      icon.innerHTML = Icons.svg('acceptAll');
      line.appendChild(icon);
    }
    line.appendChild(el('span', null, text));
  }
  function shorten(text, max) { return text.length > max ? text.slice(0, max - 1) + '…' : text; }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 250);
  }
  // Valeur de la bulle pour une ligne parcourue, telle que la lecture l'affichera (format compris).
  async function badgeValue(loop, item, tableId, record) {
    const { table, column, format } = state.node.attrs;
    if (GristAPI.getColumnType(table, column) === 'Attachments') return I18n.t('varCond.debug.imageValue');
    return Variables.resolveVariable(table, column, tableId, record, format, { loop: LoopRules.itemBinding(loop, item, null) });
  }
  async function currentSummary(loop, tableId, record, result) {
    const count = result.items.length;
    const total = result.total;
    let head;
    if (!total) head = I18n.t('varLoop.preview.noneLinked', { id: record.id });
    else if (!count) head = I18n.t('varLoop.preview.noneKept', { id: record.id, total });
    else if (loop.filter) head = I18n.t('varLoop.preview.kept', { id: record.id, count, total });
    else head = I18n.t('varLoop.preview.linked', { id: record.id, count });
    if (!count) return { text: head + ' ' + emptyEffect(loop, state.place), good: false };
    if (loop.repeat === 'inline') {
      const values = [];
      for (const item of result.items) {
        const value = await badgeValue(loop, item, tableId, record);
        if (value !== '' && value != null) values.push(String(value));
      }
      if (!values.length) return { text: head + ' ' + emptyEffect(loop, state.place), good: true };
      const text = LoopRules.joinValues(values, loop.separator, loop.lastSeparator);
      return { text: head + ' ' + I18n.t('varLoop.preview.inline', { text: shorten(text, 240) }), good: true };
    }
    const shown = [];
    for (const item of result.items.slice(0, PREVIEW_VALUES)) {
      const value = await badgeValue(loop, item, tableId, record);
      shown.push(value === '' || value == null ? I18n.t('varCond.debug.emptyValue') : shorten(String(value), 60));
    }
    const values = shown.join(', ') + (count > PREVIEW_VALUES ? ', …' : '');
    const key = loop.repeat === 'paragraph' && state.place.kind === 'heading' ? 'varLoop.preview.heading' : 'varLoop.preview.' + loop.repeat;
    return { text: head + ' ' + I18n.t(key, { count, values }), good: true };
  }
  async function statsSummary(loop, tableId, ctx, stale) {
    const rows = await ctx.fetchRows(tableId);
    if (stale()) return null;
    if (!rows.length) return I18n.t('linkConfig.previewTableEmpty', { table: tableId });
    let withRows = 0;
    let min = Infinity;
    let max = 0;
    let firstEmpty = null;
    for (let i = 0; i < rows.length; i++) {
      const result = await LoopRules.iterate(loop, tableId, rows[i], ctx);
      if (result.error) return null;
      const n = result.items.length;
      if (n) { withRows += 1; min = Math.min(min, n); max = Math.max(max, n); } else if (!firstEmpty) firstEmpty = rows[i];
      // Rend la main au navigateur de temps en temps sur une grande table, et abandonne si la boucle a changé entre-temps.
      if (i % 250 === 249) { await new Promise(r => setTimeout(r, 0)); if (stale()) return null; }
    }
    if (!withRows) return I18n.t('varLoop.stats.none', { table: tableId, total: rows.length });
    if (withRows === rows.length) {
      return min === max ? I18n.t('varLoop.stats.same', { table: tableId, count: min }) : I18n.t('varLoop.stats.all', { table: tableId, min, max });
    }
    const effect = emptyEffect(loop, state.place);
    return I18n.t('varLoop.stats.some', {
      table: tableId, count: withRows, total: rows.length, id: firstEmpty.id, effect: effect.charAt(0).toLowerCase() + effect.slice(1),
    });
  }
  async function updatePreview() {
    if (!state || !refs) return;
    const gen = ++previewGeneration;
    const stale = () => gen !== previewGeneration || !state;
    const { currentLine, statsLine } = refs;
    const loop = LoopRules.normalizeLoop(workingLoop());
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    setLine(statsLine, '', false);
    if (!record || !tableId) { setLine(currentLine, I18n.t('varCond.debug.noRecord'), false); return; }
    setLine(currentLine, I18n.t('varCond.debug.computing'), false);
    try {
      const ctx = LoopRules.createContext();
      const result = await LoopRules.iterate(loop, tableId, record, ctx);
      if (stale()) return;
      if (result.error) { setLine(currentLine, I18n.t('varLoop.preview.noSource', { id: record.id }), false); return; }
      const current = await currentSummary(loop, tableId, record, result);
      if (stale()) return;
      setLine(currentLine, current.text, current.good);
      const stats = await statsSummary(loop, tableId, ctx, stale);
      if (stale() || !stats) return;
      setLine(statsLine, stats, false);
    } catch (e) {
      console.warn('[VariableLoop] aperçu indisponible', e);
      if (!stale()) setLine(currentLine, I18n.t('linkConfig.previewUnavailable'), false);
    }
  }

  // Réécrit l'attribut `loop` de la bulle d'origine, retrouvée à sa position capturée au clic - seulement si c'est toujours la même variable.
  function applyLoop(loop) {
    const { editor, pos, node: original } = state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || node.attrs.table !== original.attrs.table || node.attrs.column !== original.attrs.column) {
      console.warn('[VariableLoop] bulle introuvable à sa position d\'origine - boucle non enregistrée.');
      alert(I18n.t('varLoop.saveLost'));
      return false;
    }
    EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { loop }));
    return true;
  }
  function save() {
    if (!state) return;
    applyLoop(workingLoop());
    close();
  }

  function close() {
    if (!modalEl) return;
    const editor = state && state.editor;
    modalEl.style.display = 'none';
    state = null;
    previewGeneration += 1;
    clearTimeout(previewTimer);
    // La bulle est toujours sélectionnée : rendre le focus à l'éditeur fait réapparaître sa barre flottante.
    if (editor) editor.view.focus();
  }

  // `pos` : position de la bulle dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge') return;
    const existing = LoopRules.normalizeLoop(node.attrs.loop);
    const source = existing ? { table: existing.table, via: existing.via } : LoopRules.sourceFor(node.attrs, GristAPI.getCurrentTableId());
    if (!source) return;
    ensureModal();
    const place = placeOf(editor.state, pos);
    // Une boucle déplacée depuis (d'un tableau vers un paragraphe, par exemple) reprend le premier choix de son nouvel endroit.
    const repeat = existing && place.repeats.indexOf(existing.repeat) !== -1 ? existing.repeat : place.repeats[0];
    const keepEmpty = existing && LoopRules.EMPTY_MODES[repeat].indexOf(existing.empty) !== -1;
    state = {
      editor, pos, node, place, source,
      had: !!existing,
      working: {
        repeat,
        filterMode: existing && existing.filter ? existing.filter.mode : 'all',
        rules: existing && existing.filter ? JSON.parse(JSON.stringify(existing.filter.rules)) : [],
        sortColumn: existing ? existing.sort.column : '',
        sortDirection: existing ? existing.sort.direction : 'asc',
        empty: keepEmpty ? existing.empty : LoopRules.defaultEmpty(repeat, place.inCell),
        emptyText: existing ? existing.emptyText : '',
        separator: existing ? existing.separator : ', ',
        lastSeparator: existing ? (existing.lastSeparator == null ? '' : existing.lastSeparator) : I18n.t('varLoop.lastSeparatorDefault'),
      },
    };
    const r = refs;
    r.title.textContent = I18n.t('varLoop.title', { table: source.table });
    r.sourceLabel.textContent = I18n.t('varLoop.section.source');
    r.sourceEdit.textContent = I18n.t('varCond.linkHint.edit');
    r.repeatLabelEl.textContent = I18n.t('varLoop.section.repeat');
    r.sepLabel.textContent = I18n.t('varLoop.separator');
    r.lastLabel.textContent = I18n.t('varLoop.lastSeparator');
    r.sepHint.textContent = I18n.t('varLoop.separatorHint');
    r.sepInput.value = state.working.separator;
    r.lastInput.value = state.working.lastSeparator;
    r.filterLabel.textContent = I18n.t('varLoop.section.filter');
    r.sortLabel.textContent = I18n.t('varLoop.section.sort');
    r.emptyLabelEl.textContent = I18n.t('varLoop.section.empty');
    r.emptyTextLabel.textContent = I18n.t('varLoop.empty.textLabel');
    r.emptyTextInput.placeholder = I18n.t('varLoop.empty.textPlaceholder');
    r.emptyTextInput.value = state.working.emptyText;
    r.removeBtn.textContent = I18n.t('varLoop.remove');
    r.removeBtn.hidden = !state.had;
    r.cancelBtn.textContent = I18n.t('common.cancel');
    r.saveBtn.textContent = I18n.t('common.save');
    renderIntro();
    renderSource();
    renderRepeat();
    renderFilter();
    renderSort();
    renderEmpty();
    // La barre flottante (z-index 2000) passerait sinon par-dessus le voile de cette fenêtre (1990, sous la fenêtre de choix de la clé).
    EditorCore.hideFloatingContextToolbars();
    modalEl.style.display = 'flex';
    const pressed = r.repeatSeg.querySelector('button[aria-pressed="true"]');
    if (pressed) pressed.focus();
    updatePreview();
  }

  return { open, close, isOpen, status, loopTableAt };
})();
