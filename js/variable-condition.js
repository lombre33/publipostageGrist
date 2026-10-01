// Fenêtre « Condition d'affichage » d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) : la variable n'apparaît en lecture et à l'export
// que si la condition est remplie (évaluée par js/reader-mode.js avec ConditionRules.conditionHolds). Mêmes lignes Colonne / Opérateur / Valeur que les
// macro-modèles (js/condition-fields.js, jamais recopiées ici), avec les colonnes de toutes les tables dans UNE seule liste avec recherche, sans groupes (choix
// « À plat » d'Antoine, 2026-10-01) ; une colonne d'une table pas encore liée ouvre la fenêtre existante de choix de la clé
// (js/variables.js:ensureLinkConfigured). Aperçu en direct pour déboguer : la ligne sélectionnée, puis combien de
// lignes de la table remplissent la condition et la première d'entre elles. La condition vit dans l'attribut `condition` du nœud varBadge
// (js/editor-nodes.js) : { mode: 'all'|'any', rules: [{ column, operator, value }] }. Ouverte depuis la barre flottante de la bulle
// (js/floating-toolbars.js:wireVariableFloatingToolbar). « Copier » / « Coller » (demande d'Antoine, 2026-09-29) : la condition affichée dans la fenêtre
// d'une variable se recolle dans la fenêtre d'une autre - Coller remplace les règles de la fenêtre comme un brouillon, « Enregistrer » les applique.
// La même fenêtre sert à un bloc de texte conditionnel (nœud conditionalText, js/conditional-text.js) : même condition { mode, rules } dans son attribut `condition`, mêmes
// colonnes, mêmes liens entre tables ; seuls changent l'introduction, les phrases de l'aperçu (le bloc s'affiche ou non, plutôt qu'une valeur) et celle de « Coller » - et, pour le
// bloc seul, le bouton « Défaire le bloc » à côté de « Retirer la condition » (demande d'Antoine, 2026-10-01 : le cadre et la condition partent, le texte reste).
const VariableCondition = (function () {
  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, hadCondition, working: { mode, rules } } - `working` est une copie : rien n'est écrit dans la bulle avant « Enregistrer ».
  let state = null;
  let debugGeneration = 0;
  let debugTimer = null;
  // Presse-papier interne : une copie { mode, rules } gardée le temps de la session du widget, d'une fenêtre et d'un modèle à l'autre. Jamais celui du
  // système : un widget dans l'iframe d'un document Grist n'a pas l'autorisation de le lire.
  let clipboard = null;
  let copiedFlashTimer = null;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function emptyRule() { return { column: '', operator: '=', value: '' }; }
  function isOpen() { return !!state; }
  // Le nœud dont la fenêtre est ouverte : un bloc de texte conditionnel ou, par défaut, une bulle #Variable.
  function isBlock() { return !!state && state.node.type.name === 'conditionalText'; }
  // Clé d'une phrase de la fenêtre : celle de la bulle, ou celle du bloc de texte (js/i18n.js, section « Bloc de texte conditionnel »). Les deux s'écrivent en
  // toutes lettres à l'appel, pour que la recherche des clés sans usage (dev-tests/verify-code-hygiene.mjs) les voie.
  function textKey(bubbleKey, blockKey) { return isBlock() ? blockKey : bubbleKey; }
  // La forme enregistrée dans la bulle : règles sans colonne écartées, valeurs en texte, copie neuve (jamais un lien vers les règles que la fenêtre modifie
  // en place) ; null sans aucune règle complète.
  function plainCondition(condition) {
    const normalized = ConditionRules.normalizeCondition(condition);
    return normalized ? {
      mode: normalized.mode,
      rules: normalized.rules.map(r => ({ column: r.column, operator: r.operator || '=', value: r.value == null ? '' : String(r.value) })),
    } : null;
  }
  // « Statut = Urgent et VcContacts.Role = Avocat » : une condition sur une ligne - ce que « Coller » va poser (info-bulle du bouton), la condition que
  // reprennent les attributs insérés (js/variable-linked-attrs.js). Sans valeur pour « vide » / « non vide ». Coupée à 110 caractères, sauf `full` (la ligne
  // des attributs insérés la tronque elle-même à l'écran et la donne en entier dans son info-bulle).
  function conditionSummary(condition, opts) {
    const glue = ' ' + I18n.t(condition.mode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd').toLowerCase() + ' ';
    const text = condition.rules.map(r => {
      const operator = r.operator || '=';
      return (r.column + ' ' + operator + ((operator === 'vide' || operator === 'non vide' || r.value == null) ? '' : ' ' + r.value)).trim();
    }).join(glue);
    return (opts && opts.full) || text.length <= 110 ? text : text.slice(0, 109) + '…';
  }

  function ensureModal() {
    if (win) return;
    // Cadre, titre, zone qui défile et ligne de boutons : js/modal-base.js. Échap ferme la fenêtre où que soit le focus (sauf si le choix de la clé est ouvert
    // par-dessus : la base lui laisse le clavier) ; le focus revient à l'éditeur (cf. close), pas à l'élément qui l'avait à l'ouverture.
    win = ModalBase.create({
      id: 'var-condition-modal', titleId: 'var-condition-title', boxClass: 'var-modal-content var-condition-modal-content', actionsClass: 'var-modal-actions',
      onEscape: close, restoreFocus: false,
    });
    const box = win.box;
    const title = win.title;
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
    const removeBtn = el('button', 'var-modal-danger');
    removeBtn.type = 'button';
    // « Défaire le bloc » : pour un bloc de texte seulement, juste après « Retirer la condition » (le premier `.var-modal-danger` reste celui-ci ; les tests et les autres fenêtres
    // trouvent « Annuler » par `button:not(.var-modal-primary):not(.var-modal-danger)`). Même famille de boutons de retrait, mais le texte garde la couleur du texte (css/variable-actions.css).
    const unwrapBtn = el('button', 'var-modal-danger var-modal-unwrap');
    unwrapBtn.type = 'button';
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'var-modal-primary');
    saveBtn.type = 'button';
    // Deux groupes - les retraits à gauche, Annuler et Enregistrer à droite - qui passent sur deux lignes, chacun entier, quand les quatre boutons ne tiennent pas côte à côte
    // (le français dans les 480 px de la fenêtre) : sans cela, « Enregistrer » sortait de la fenêtre.
    const startGroup = el('div', 'var-modal-actions-start');
    startGroup.append(removeBtn, unwrapBtn);
    const endGroup = el('div', 'var-modal-actions-end');
    endGroup.append(cancelBtn, saveBtn);
    win.actions.append(startGroup, endGroup);
    // Copier / Coller : un seul groupe de nœuds, replacé à chaque tracé des règles sur la ligne de « + Ajouter une condition » (cf. renderRules).
    const clip = el('span', 'var-condition-clip');
    const copyBtn = el('button', 'var-condition-clip-btn');
    copyBtn.type = 'button';
    const pasteBtn = el('button', 'var-condition-clip-btn');
    pasteBtn.type = 'button';
    const clipStatus = el('span', 'var-condition-clip-status');
    clipStatus.setAttribute('role', 'status');
    clip.append(copyBtn, pasteBtn, clipStatus);
    win.body.append(intro, modeRow, rulesBox, debug);
    refs = { title, intro, modeRow, modeBefore, modeSelect, modeAfter, rulesBox, clip, copyBtn, pasteBtn, clipStatus, debugCurrent, debugCount, removeBtn, unwrapBtn, cancelBtn, saveBtn };

    modeSelect.addEventListener('change', () => {
      if (!state) return;
      state.working.mode = modeSelect.value === 'any' ? 'any' : 'all';
      renderRules();
      scheduleDebug();
    });
    removeBtn.addEventListener('click', () => { if (state) { applyCondition(null); close(); } });
    unwrapBtn.addEventListener('click', unwrapBlock);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    copyBtn.addEventListener('click', copyCondition);
    pasteBtn.addEventListener('click', pasteCondition);
    // Toute saisie dans les lignes (colonne, opérateur, valeur, « au moins une ») relance l'aperçu, avec un court délai pour ne pas recalculer à chaque touche.
    box.addEventListener('input', scheduleDebug);
    box.addEventListener('change', scheduleDebug);
  }

  // Colonne d'une table pas encore liée : la fenêtre de choix de la clé s'ouvre avant d'adopter la colonne (Annuler remet la précédente, via
  // ConditionFields). Une fois liée, l'indication de lien sous la règle et l'aperçu sont redessinés.
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
    // Le groupe Copier / Coller est retiré puis replacé à chaque tracé : un de ses boutons qui avait le focus (Coller au clavier) le perdrait sans ça.
    const clipFocus = refs.clip.contains(document.activeElement) ? document.activeElement : null;
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
    // Copier / Coller portent sur l'ensemble des règles de cette boîte : sur la même ligne que « + Ajouter », à droite, sans hauteur en plus dans un panneau bas.
    const foot = el('div', 'var-condition-foot');
    foot.append(addBtn, refs.clip);
    rulesBox.appendChild(foot);
    if (clipFocus) clipFocus.focus();
    syncClipboardButtons();
  }

  // === Copier / Coller ===
  // Grisés (pas retirés, aria-disabled plutôt que disabled pour que l'info-bulle qui explique pourquoi reste visible) : Copier sans règle complète à copier,
  // Coller tant que rien n'a été copié. Le clic revérifie l'état réel : la colonne d'une règle n'est adoptée qu'après le `change` du champ.
  function setClipButton(btn, enabled, title) {
    btn.classList.toggle('is-disabled', !enabled);
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    btn.title = title;
  }
  function syncClipboardButtons() {
    if (!state || !refs) return;
    const canCopy = !!plainCondition(state.working);
    setClipButton(refs.copyBtn, canCopy, I18n.t(canCopy ? 'varCond.clip.copyTitle' : 'varCond.clip.copyEmpty'));
    setClipButton(refs.pasteBtn, !!clipboard, clipboard ? I18n.t('varCond.clip.pasteTitle', { summary: conditionSummary(clipboard) }) : I18n.t('varCond.clip.pasteEmpty'));
  }
  // « Copiée » pendant un instant : seul retour visible d'une copie, qui ne change rien d'autre à l'écran.
  function resetCopyLabel() {
    clearTimeout(copiedFlashTimer);
    if (!refs) return;
    refs.copyBtn.textContent = I18n.t('varCond.clip.copy');
    refs.copyBtn.classList.remove('is-done');
  }
  function copyCondition() {
    if (!state || !refs) return;
    const condition = plainCondition(state.working);
    if (!condition) return;
    clipboard = condition;
    syncClipboardButtons();
    resetCopyLabel();
    refs.copyBtn.textContent = I18n.t('varCond.clip.copied');
    refs.copyBtn.classList.add('is-done');
    refs.clipStatus.textContent = I18n.t('varCond.clip.copiedStatus');
    copiedFlashTimer = setTimeout(resetCopyLabel, 1600);
  }
  // Remplace les règles ET la combinaison (toutes / au moins une) de la fenêtre : rien n'est écrit dans la bulle avant « Enregistrer », Annuler abandonne.
  function pasteCondition() {
    if (!state || !refs || !clipboard) return;
    state.working = plainCondition(clipboard);
    renderRules();
    scheduleDebug();
    refs.clipStatus.textContent = I18n.t(textKey('varCond.clip.pastedStatus', 'varCond.clip.pastedStatusBlock'));
  }
  function clearClipboard() {
    clipboard = null;
    syncClipboardButtons();
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
    syncClipboardButtons();
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
      // Un bloc de texte n'a pas de valeur à montrer : l'aperçu dit seulement s'il s'affiche.
      const shown = holds && !isBlock() ? await displayValue(record, tableId) : '';
      if (stale()) return;
      setDebugLine(debugCurrent, holds
        ? I18n.t(textKey('varCond.debug.currentMet', 'varCond.debug.currentMetBlock'), { id: record.id, value: shown })
        : I18n.t(textKey('varCond.debug.currentNotMet', 'varCond.debug.currentNotMetBlock'), { id: record.id }), holds);

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
      const firstValue = isBlock() ? '' : await displayValue(first, tableId);
      if (stale()) return;
      setDebugLine(debugCount, I18n.t('varCond.debug.count', { table: tableId, count, total: rows.length }) + ' '
        + I18n.t(textKey('varCond.debug.first', 'varCond.debug.firstBlock'), { id: first.id, label: rowLabel(first, tableId), value: firstValue }), false);
    } catch (e) {
      console.warn('[VariableCondition] aperçu indisponible', e);
      if (!stale()) setDebugLine(debugCurrent, I18n.t('linkConfig.previewUnavailable'), false);
    }
  }

  // Réécrit l'attribut `condition` du nœud d'origine (bulle ou bloc de texte), retrouvé à sa position capturée au clic - seulement si c'est toujours le même : la même
  // variable, ou un bloc de texte conditionnel.
  function applyCondition(condition) {
    const { editor, pos, node: original } = state;
    const node = editor.state.doc.nodeAt(pos);
    const sameNode = node && node.type.name === original.type.name
      && (isBlock() || (node.attrs.table === original.attrs.table && node.attrs.column === original.attrs.column));
    if (!sameNode) {
      console.warn('[VariableCondition] nœud introuvable à sa position d\'origine - condition non enregistrée.');
      alert(I18n.t(textKey('varCond.saveLost', 'varCond.saveLostBlock')));
      return false;
    }
    EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { condition }));
    return true;
  }
  function save() {
    if (!state) return;
    applyCondition(plainCondition(state.working));
    close();
  }
  // « Défaire le bloc » (bloc de texte seulement) : le cadre et la condition disparaissent, le texte reste (js/conditional-text.js:unwrap). Le brouillon de la fenêtre n'est pas
  // enregistré : le bloc n'existe plus. Le bloc retrouvé à sa position capturée au clic ; s'il n'y est plus, même avertissement que pour une condition qu'on ne peut plus écrire.
  function unwrapBlock() {
    if (!state || !isBlock()) return;
    if (!ConditionalText.unwrap(state.editor, state.pos)) alert(I18n.t('varCond.unwrapLostBlock'));
    close();
  }

  function close() {
    if (!win) return;
    const editor = state && state.editor;
    win.hide();
    state = null;
    debugGeneration += 1;
    clearTimeout(debugTimer);
    clearTimeout(copiedFlashTimer);
    // La bulle est toujours sélectionnée : rendre le focus à l'éditeur fait réapparaître sa barre flottante.
    if (editor) editor.view.focus();
  }

  // `pos` : position de la bulle ou du bloc dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || (node.type.name !== 'varBadge' && node.type.name !== 'conditionalText')) return;
    ensureModal();
    const existing = ConditionRules.normalizeCondition(node.attrs.condition);
    state = {
      editor, pos, node,
      hadCondition: !!existing,
      working: existing ? JSON.parse(JSON.stringify({ mode: existing.mode, rules: existing.rules })) : { mode: 'all', rules: [emptyRule()] },
    };
    const { title, intro, modeBefore, modeSelect, modeAfter, removeBtn, unwrapBtn, cancelBtn, saveBtn } = refs;
    title.textContent = I18n.t('varCond.title');
    if (isBlock()) {
      intro.replaceChildren(document.createTextNode(I18n.t('varCond.introBlock')));
    } else {
      const badge = el('span', 'var-badge', Variables.triggerChar() + (node.attrs.key || ''));
      intro.replaceChildren(badge, document.createTextNode(' ' + I18n.t('varCond.intro')));
    }
    modeBefore.textContent = I18n.t('varCond.modeBefore');
    modeAfter.textContent = I18n.t('varCond.modeAfter');
    modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    modeSelect.replaceChildren(el('option', null, I18n.t('varCond.modeAll')), el('option', null, I18n.t('varCond.modeAny')));
    modeSelect.options[0].value = 'all';
    modeSelect.options[1].value = 'any';
    removeBtn.textContent = I18n.t('varCond.remove');
    removeBtn.hidden = !state.hadCondition;
    unwrapBtn.textContent = I18n.t('varCond.unwrapBlock');
    unwrapBtn.title = I18n.t('varCond.unwrapBlockTitle');
    unwrapBtn.hidden = !isBlock();
    cancelBtn.textContent = I18n.t('common.cancel');
    saveBtn.textContent = I18n.t('common.save');
    resetCopyLabel();
    refs.pasteBtn.textContent = I18n.t('varCond.clip.paste');
    refs.clipStatus.textContent = '';
    renderRules();
    // La barre flottante (z-index 2000) passerait sinon par-dessus le voile de cette fenêtre (1990, sous la fenêtre de choix de la clé).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => refs.rulesBox.querySelector('select.macro-rule-column'));
    updateDebug();
  }

  return { open, close, isOpen, clearClipboard, describe: conditionSummary };
})();
