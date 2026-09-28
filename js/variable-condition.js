// Fenêtre « Condition d'affichage » d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) : la variable n'apparaît en lecture et à l'export
// que si la condition est remplie (évaluée par js/reader-mode.js avec ConditionRules.conditionHolds). Mêmes lignes Colonne / Opérateur / Valeur que les
// macro-modèles (js/condition-fields.js, jamais recopiées ici), avec les colonnes de toutes les tables ; une colonne d'une table pas encore liée ouvre la
// fenêtre existante de choix de la clé (js/variables.js:ensureLinkConfigured). Aperçu en direct pour déboguer : la ligne sélectionnée, puis combien de
// lignes de la table remplissent la condition et la première d'entre elles. La condition vit dans l'attribut `condition` du nœud varBadge
// (js/editor-nodes.js) : { mode: 'all'|'any', rules: [{ column, operator, value }] }. Ouverte depuis la barre flottante de la bulle
// (js/floating-toolbars.js:wireVariableFloatingToolbar).
const VariableCondition = (function () {
  let modalEl = null;
  let refs = null;
  // { editor, pos, node, hadCondition, working: { mode, rules } } - `working` est une copie : rien n'est écrit dans la bulle avant « Enregistrer ».
  let state = null;
  let debugGeneration = 0;
  let debugTimer = null;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function emptyRule() { return { column: '', operator: '=', value: '' }; }
  function isOpen() { return !!state; }

  function ensureModal() {
    if (modalEl) return;
    modalEl = el('div');
    modalEl.id = 'var-condition-modal';
    modalEl.style.display = 'none';
    modalEl.tabIndex = -1;
    const box = el('div', 'modal-content var-modal-content var-condition-modal-content');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'var-condition-title');
    const title = el('h3');
    title.id = 'var-condition-title';
    const intro = el('p', 'var-modal-intro');
    const modeRow = el('div', 'var-condition-mode');
    const modeBefore = el('span');
    const modeSelect = el('select');
    const modeAfter = el('span');
    modeRow.append(modeBefore, modeSelect, modeAfter);
    const rulesBox = el('div', 'var-condition-rules');
    const debug = el('div', 'var-condition-debug');
    debug.setAttribute('aria-live', 'polite');
    const debugCurrent = el('div', 'var-condition-debug-line');
    const debugCount = el('div', 'var-condition-debug-line');
    debug.append(debugCurrent, debugCount);
    const actions = el('div', 'var-modal-actions');
    const removeBtn = el('button', 'var-modal-danger');
    removeBtn.type = 'button';
    const spacer = el('span', 'var-modal-spacer');
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'var-modal-primary');
    saveBtn.type = 'button';
    actions.append(removeBtn, spacer, cancelBtn, saveBtn);
    box.append(title, intro, modeRow, rulesBox, debug, actions);
    modalEl.appendChild(box);
    document.body.appendChild(modalEl);
    refs = { title, intro, modeRow, modeBefore, modeSelect, modeAfter, rulesBox, debugCurrent, debugCount, removeBtn, cancelBtn, saveBtn };

    modeSelect.addEventListener('change', () => {
      if (!state) return;
      state.working.mode = modeSelect.value === 'any' ? 'any' : 'all';
      renderRules();
      scheduleDebug();
    });
    removeBtn.addEventListener('click', () => { if (state) { applyCondition(null); close(); } });
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    // Toute saisie dans les lignes (colonne, opérateur, valeur, « au moins une ») relance l'aperçu, avec un court délai pour ne pas recalculer à chaque touche.
    box.addEventListener('input', scheduleDebug);
    box.addEventListener('change', scheduleDebug);
    modalEl.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state) return;
      // Échap appartient à la fenêtre de choix de la clé tant qu'elle est ouverte par-dessus (elle garde son propre Annuler).
      const linkModal = document.getElementById('link-config-modal');
      if (linkModal && linkModal.style.display !== 'none') return;
      event.preventDefault();
      close();
    });
  }

  // Colonne d'une table pas encore liée : la fenêtre de choix de la clé s'ouvre avant d'adopter la colonne (Annuler remet la précédente, via
  // ConditionFields). Une fois liée, les libellés des groupes et l'indication de lien sont redessinés.
  async function ensureTableLinked(ref) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!ref || !ref.table || !currentTableId || ref.table === currentTableId) return true;
    if (GristAPI.getLinkRule(ref.table)) return true;
    const ok = await Variables.ensureLinkConfigured({ table: ref.table });
    // setTimeout : ConditionFields n'adopte la colonne (rule.column) qu'APRÈS la résolution de cette promesse - redessiner avant la perdrait.
    if (ok) setTimeout(() => { if (state) { renderRules(); scheduleDebug(); } }, 0);
    return ok;
  }

  // « ligne d'Annuaire trouvée via Dossiers.Responsable · Modifier le lien » sous une règle portant sur une autre table déjà liée.
  function updateLinkHint(hint, table) {
    hint.replaceChildren();
    const currentTableId = GristAPI.getCurrentTableId();
    const rule = (table && table !== currentTableId) ? GristAPI.getLinkRule(table) : null;
    if (!rule) { hint.hidden = true; return; }
    hint.hidden = false;
    const text = rule.mode === 'singleton'
      ? I18n.t('varCond.linkHint.singleton', { table })
      : I18n.t('varCond.linkHint.match', { table, via: Variables.describeLinkVia(table, rule, currentTableId) });
    hint.appendChild(document.createTextNode(text + ' · '));
    const editBtn = el('button', null, I18n.t('varCond.linkHint.edit'));
    editBtn.type = 'button';
    editBtn.addEventListener('click', async () => {
      const changed = await Variables.editLinkRule(table);
      if (changed && state) { renderRules(); scheduleDebug(); }
    });
    hint.appendChild(editBtn);
  }

  function renderRules() {
    if (!state || !refs) return;
    const { rulesBox, modeRow, modeSelect } = refs;
    const rules = state.working.rules;
    modeRow.hidden = rules.length < 2;
    modeSelect.value = state.working.mode;
    rulesBox.replaceChildren();
    rules.forEach((rule, index) => {
      const row = el('div', 'macro-rule-row');
      const connectorKey = index === 0 ? 'macro.modal.ruleIf' : (state.working.mode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd');
      row.appendChild(el('span', 'macro-rule-connector', I18n.t(connectorKey)));
      const linkHint = el('span', 'var-condition-link-hint');
      linkHint.hidden = true;
      const fields = ConditionFields.buildConditionFields(rule, {
        allTables: true,
        onColumnChosen: ref => ensureTableLinked(ref),
        onColumnResolved: table => updateLinkHint(linkHint, table),
      });
      row.append(fields.columnWrap, fields.operatorSelect, fields.valueSlot);
      const removeBtn = el('button', 'macro-rule-remove');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', I18n.t('varCond.removeRule'));
      removeBtn.title = I18n.t('varCond.removeRule');
      removeBtn.addEventListener('click', () => {
        rules.splice(index, 1);
        if (!rules.length) rules.push(emptyRule());
        renderRules();
        scheduleDebug();
      });
      row.appendChild(removeBtn);
      // En DERNIER, comme dans la fenêtre des macro-modèles : ces deux lignes d'indication prennent chacune toute la largeur sous la règle.
      row.append(fields.typeHint, linkHint);
      rulesBox.appendChild(row);
    });
    const addBtn = el('button', 'var-condition-add', I18n.t('varCond.addRule'));
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      rules.push(emptyRule());
      renderRules();
      scheduleDebug();
      const selects = rulesBox.querySelectorAll('select.macro-rule-column');
      if (selects.length) selects[selects.length - 1].focus();
    });
    rulesBox.appendChild(addBtn);
  }

  // === Aperçu === Même évaluation que le mode Lecture (ConditionRules.conditionHolds) : d'abord la ligne sélectionnée dans Grist, puis toutes les lignes
  // de la table de la page, lues une seule fois par table (fetchRows mémorisé, sinon chaque ligne relirait chaque table liée).
  function memoFetchRows() {
    const cache = new Map();
    return tableId => {
      if (!cache.has(tableId)) cache.set(tableId, GristAPI.fetchTableRows(tableId));
      return cache.get(tableId);
    };
  }
  async function displayValue(record, tableId) {
    const { table, column, format } = state.node.attrs;
    if (GristAPI.getColumnType(table, column) === 'Attachments') return I18n.t('varCond.debug.imageValue');
    const value = await Variables.resolveVariable(table, column, tableId, record, format);
    return value === '' ? I18n.t('varCond.debug.emptyValue') : value;
  }
  // Repère lisible de la première ligne trouvée : texte de la première colonne de la table, s'il y en a un (un identifiant de ligne seul ne se voit pas
  // dans Grist).
  function rowLabel(row, tableId) {
    const firstCol = GristAPI.getColumns(tableId)[0];
    const v = firstCol ? row[firstCol] : null;
    if (typeof v !== 'string' || !v.trim()) return '';
    const text = v.trim();
    return ' (' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + ')';
  }
  function setDebugLine(line, text, good) {
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
  function scheduleDebug() {
    clearTimeout(debugTimer);
    debugTimer = setTimeout(updateDebug, 250);
  }
  async function updateDebug() {
    if (!state || !refs) return;
    const gen = ++debugGeneration;
    const stale = () => gen !== debugGeneration || !state;
    const { debugCurrent, debugCount } = refs;
    const condition = ConditionRules.normalizeCondition(state.working);
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    setDebugLine(debugCount, '', false);
    if (!condition) { setDebugLine(debugCurrent, I18n.t('varCond.debug.chooseColumn'), false); return; }
    if (!record || !tableId) { setDebugLine(debugCurrent, I18n.t('varCond.debug.noRecord'), false); return; }
    setDebugLine(debugCurrent, I18n.t('varCond.debug.computing'), false);
    try {
      const holds = await ConditionRules.conditionHolds(condition, tableId, record);
      const shown = holds ? await displayValue(record, tableId) : '';
      if (stale()) return;
      setDebugLine(debugCurrent, holds
        ? I18n.t('varCond.debug.currentMet', { id: record.id, value: shown })
        : I18n.t('varCond.debug.currentNotMet', { id: record.id }), holds);

      const fetchRows = memoFetchRows();
      const rows = await fetchRows(tableId);
      if (stale()) return;
      if (!rows.length) { setDebugLine(debugCount, I18n.t('linkConfig.previewTableEmpty', { table: tableId }), false); return; }
      let count = 0;
      let first = null;
      for (let i = 0; i < rows.length; i++) {
        if (await ConditionRules.conditionHolds(condition, tableId, rows[i], { fetchRows })) {
          count += 1;
          if (!first) first = rows[i];
        }
        // Rend la main au navigateur de temps en temps sur une grande table, et abandonne si la condition a changé entre-temps.
        if (i % 250 === 249) { await new Promise(r => setTimeout(r, 0)); if (stale()) return; }
      }
      if (stale()) return;
      if (!count) { setDebugLine(debugCount, I18n.t('varCond.debug.none', { table: tableId, total: rows.length }), false); return; }
      const firstValue = await displayValue(first, tableId);
      if (stale()) return;
      setDebugLine(debugCount, I18n.t('varCond.debug.count', { table: tableId, count, total: rows.length }) + ' '
        + I18n.t('varCond.debug.first', { id: first.id, label: rowLabel(first, tableId), value: firstValue }), false);
    } catch (e) {
      console.warn('[VariableCondition] aperçu indisponible', e);
      if (!stale()) setDebugLine(debugCurrent, I18n.t('linkConfig.previewUnavailable'), false);
    }
  }

  // Réécrit l'attribut `condition` de la bulle d'origine, retrouvée à sa position capturée au clic - seulement si c'est toujours la même variable.
  function applyCondition(condition) {
    const { editor, pos, node: original } = state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || node.attrs.table !== original.attrs.table || node.attrs.column !== original.attrs.column) {
      console.warn('[VariableCondition] bulle introuvable à sa position d\'origine - condition non enregistrée.');
      alert(I18n.t('varCond.saveLost'));
      return false;
    }
    EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { condition }));
    return true;
  }
  function save() {
    if (!state) return;
    const normalized = ConditionRules.normalizeCondition(state.working);
    const condition = normalized ? {
      mode: normalized.mode,
      rules: normalized.rules.map(r => ({ column: r.column, operator: r.operator || '=', value: r.value == null ? '' : String(r.value) })),
    } : null;
    applyCondition(condition);
    close();
  }

  function close() {
    if (!modalEl) return;
    const editor = state && state.editor;
    modalEl.style.display = 'none';
    state = null;
    debugGeneration += 1;
    clearTimeout(debugTimer);
    // La bulle est toujours sélectionnée : rendre le focus à l'éditeur fait réapparaître sa barre flottante.
    if (editor) editor.view.focus();
  }

  // `pos` : position de la bulle dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge') return;
    ensureModal();
    const existing = ConditionRules.normalizeCondition(node.attrs.condition);
    state = {
      editor, pos, node,
      hadCondition: !!existing,
      working: existing ? JSON.parse(JSON.stringify({ mode: existing.mode, rules: existing.rules })) : { mode: 'all', rules: [emptyRule()] },
    };
    const { title, intro, modeBefore, modeSelect, modeAfter, removeBtn, cancelBtn, saveBtn } = refs;
    title.textContent = I18n.t('varCond.title');
    const badge = el('span', 'var-badge', Variables.triggerChar() + (node.attrs.key || ''));
    intro.replaceChildren(badge, document.createTextNode(' ' + I18n.t('varCond.intro')));
    modeBefore.textContent = I18n.t('varCond.modeBefore');
    modeAfter.textContent = I18n.t('varCond.modeAfter');
    modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    modeSelect.replaceChildren(el('option', null, I18n.t('varCond.modeAll')), el('option', null, I18n.t('varCond.modeAny')));
    modeSelect.options[0].value = 'all';
    modeSelect.options[1].value = 'any';
    removeBtn.textContent = I18n.t('varCond.remove');
    removeBtn.hidden = !state.hadCondition;
    cancelBtn.textContent = I18n.t('common.cancel');
    saveBtn.textContent = I18n.t('common.save');
    renderRules();
    // La barre flottante (z-index 2000) passerait sinon par-dessus le voile de cette fenêtre (1990, sous la fenêtre de choix de la clé).
    EditorCore.hideFloatingContextToolbars();
    modalEl.style.display = 'flex';
    const firstSelect = refs.rulesBox.querySelector('select.macro-rule-column');
    if (firstSelect) firstSelect.focus();
    updateDebug();
  }

  return { open, close, isOpen };
})();
