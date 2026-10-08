// Fenêtre « Condition d'affichage » d'une bulle #Variable : la variable n'apparaît en lecture et à l'export que si la condition est remplie
// (js/reader-mode.js, ConditionRules.conditionHolds). La condition vit dans l'attribut `condition` du nœud : { mode: 'all'|'any', rules: [{ column,
// operator, value }] }. Mêmes lignes Colonne / Opérateur / Valeur que les macro-modèles (js/condition-fields.js), avec les colonnes de toutes les
// tables dans une seule liste avec recherche ; une colonne d'une table pas encore liée ouvre le choix de la clé
// (js/variables.js:ensureLinkConfigured). Le champ Valeur a un bouton « autre colonne » : la règle compare alors la colonne à une autre colonne de la
// même ligne, { column, operator, valueColumn } (options.compareColumn, js/condition-rules.js:compareOperands), au lieu d'une valeur saisie.
// Aperçu en direct : la ligne sélectionnée, puis combien de lignes de la table remplissent la condition et la
// première d'entre elles. « Copier » / « Coller » recolle la condition d'une fenêtre dans une autre, comme un brouillon : « Enregistrer » l'applique.
// Ouverte depuis la barre flottante (js/floating-toolbars.js:wireVariableFloatingToolbar). La même fenêtre sert aux nœuds conditionnels - bloc de
// texte (js/conditional-text.js), valeur dans la phrase (js/conditional-value.js), case à cocher (js/conditional-checkbox.js) - avec leurs propres
// phrases ; « Défaire le bloc » / « Défaire la valeur » retire le cadre et la condition, le texte reste.
// Une bulle a en plus deux petits champs, « Avant » et « Après » : le texte collé à sa valeur (une virgule, une parenthèse), écrit seulement quand
// la variable s'affiche avec une valeur (attributs `before` et `after` du nœud, VariableFormat.withAffixes ; js/reader-mode.js les écrit). Ils se règlent
// ici parce que le cas d'usage est la virgule d'une variable conditionnelle, mais valent aussi pour une bulle sans condition.
const VariableCondition = (function () {
  const { el, option, button } = Dom;
  const { setLine, shorten } = VariableModal;
  // Les phrases de la fenêtre selon le nœud qui porte la condition. Les clés s'écrivent en toutes lettres, pour que la recherche des clés sans usage
  // (dev-tests/verify-code-hygiene.mjs) les voie. `unwrap` : le bouton « Défaire… », pour les nœuds dont on peut garder le texte.
  const TEXTS = {
    varBadge: {
      title: 'varCond.title', intro: 'varCond.intro', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLost', pasted: 'varCond.clip.pastedStatus',
      met: 'varCond.debug.currentMet', notMet: 'varCond.debug.currentNotMet', first: 'varCond.debug.first',
    },
    conditionalText: {
      title: 'varCond.title', intro: 'varCond.introBlock', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLostBlock', pasted: 'varCond.clip.pastedStatusBlock',
      met: 'varCond.debug.currentMetBlock', notMet: 'varCond.debug.currentNotMetBlock', first: 'varCond.debug.firstBlock',
      unwrap: { label: 'varCond.unwrapBlock', title: 'varCond.unwrapBlockTitle', lost: 'varCond.unwrapLostBlock' },
    },
    conditionalValue: {
      title: 'varCond.title', intro: 'varCond.introValue', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLostValue', pasted: 'varCond.clip.pastedStatusValue',
      met: 'varCond.debug.currentMetValue', notMet: 'varCond.debug.currentNotMetValue', first: 'varCond.debug.firstBlock',
      unwrap: { label: 'varCond.unwrapValue', title: 'varCond.unwrapValueTitle', lost: 'varCond.unwrapLostValue' },
    },
    conditionalCheckbox: {
      title: 'varCond.titleCheckbox', intro: 'varCond.introCheckbox', modeBefore: 'varCond.modeBeforeCheckbox', saveLost: 'varCond.saveLostCheckbox',
      pasted: 'varCond.clip.pastedStatusCheckbox', met: 'varCond.debug.currentMetCheckbox', notMet: 'varCond.debug.currentNotMetCheckbox', first: 'varCond.debug.firstBlock',
    },
  };

  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, hadCondition, working: { mode, rules } } - `working` est une copie : rien n'est écrit dans le nœud avant « Enregistrer ».
  let state = null;
  const previewRun = VariableModal.previewRunner(updatePreview);
  // Presse-papier interne : une copie { mode, rules } gardée le temps de la session du widget, d'une fenêtre et d'un modèle à l'autre. Jamais celui
  // du système : un widget dans l'iframe d'un document Grist n'a pas l'autorisation de le lire.
  let clipboard = null;
  let copiedFlashTimer = null;

  const isOpen = () => !!state;
  const texts = () => TEXTS[state.node.type.name];
  // Seule une bulle a une valeur à montrer dans l'aperçu : un bloc, une valeur conditionnelle ou une case s'affiche, ou se coche, sans valeur à lire.
  const showsValue = () => state.node.type.name === 'varBadge';
  // Le texte « Avant » / « Après » tel qu'il est tapé dans la fenêtre ({ before, after }), ou null : sans bulle, sans texte ou fenêtre fermée.
  const draftAffixes = () => (state && refs && showsValue() ? VariableFormat.affixes(refs.beforeInput.value, refs.afterInput.value) : null);

  // « Statut = Urgent et VcContacts.Role = Avocat » : une condition sur une ligne, sans valeur pour « vide » / « non vide ». Une règle qui compare à une
  // autre colonne la nomme entre accolades, comme une colonne dans un calcul : « Montant = {Paye} », qui ne se lit pas comme la valeur « Paye ». Ce que
  // « Coller » va poser (info-bulle du bouton) et la condition que reprennent les attributs insérés (js/variable-linked-attrs.js), qui la donnent en
  // entier (`full`) ; sinon coupée à 110 caractères.
  function conditionSummary(condition, opts) {
    const glue = ' ' + I18n.t(condition.mode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd').toLowerCase() + ' ';
    const text = condition.rules.map(r => {
      const operator = r.operator || '=';
      const noValue = ConditionRules.VALUELESS_OPERATORS.indexOf(operator) !== -1 || (!ConditionRules.comparesColumn(r) && r.value == null);
      const shown = ConditionRules.comparesColumn(r) ? '{' + r.valueColumn + '}' : r.value;
      return (r.column + ' ' + operator + (noValue ? '' : ' ' + shown)).trim();
    }).join(glue);
    return opts && opts.full ? text : shorten(text, 110);
  }

  function ensureModal() {
    if (win) return;
    // Échap ferme la fenêtre où que soit le focus (sauf si le choix de la clé est ouvert par-dessus : la base lui laisse le clavier) ; le focus
    // revient à l'éditeur (cf. close), pas à l'élément qui l'avait à l'ouverture.
    win = ModalBase.create({
      id: 'var-condition-modal', titleId: 'var-condition-title', boxClass: 'var-modal-content var-condition-modal-content', actionsClass: 'var-modal-actions',
      onEscape: close, restoreFocus: false,
    });
    const intro = el('p', 'var-modal-intro');
    const modeBefore = el('span');
    const modeSelect = el('select');
    const modeAfter = el('span');
    const modeRow = el('div', 'var-condition-mode');
    modeRow.append(modeBefore, modeSelect, modeAfter);
    const rulesBox = el('div', 'var-condition-rules');
    // « Avant » / « Après » : propres à la bulle (cachés pour un bloc, une valeur ou une case, qui n'ont pas de valeur à entourer). Deux champs de
    // texte libre, espaces compris, et une indication qui commence sous le premier (css/variable-actions.css).
    const affixRow = el('div', 'var-condition-affix');
    const beforeField = VariableModal.labelledInput('var-condition-before', 'var-condition-affix-input');
    const afterField = VariableModal.labelledInput('var-condition-after', 'var-condition-affix-input');
    const affixHint = el('span', 'var-loop-hint');
    for (const input of [beforeField.input, afterField.input]) {
      input.maxLength = VariableFormat.AFFIX_MAX;
      input.autocomplete = 'off';
      input.spellcheck = false;
      // L'aperçu montre le texte tel qu'il s'écrira : il se recalcule à chaque saisie, comme pour une règle.
      input.addEventListener('input', () => previewRun.schedule());
    }
    affixRow.append(beforeField.label, beforeField.input, afterField.label, afterField.input, affixHint);
    const { box: previewArea, lines: [currentLine, countLine] } = VariableModal.previewBox(2);
    // « Défaire le bloc » / « Défaire la valeur » vient juste après « Retirer la condition » : le premier `.var-modal-danger` reste celui-ci (les
    // tests et les autres fenêtres trouvent « Annuler » par `button:not(.var-modal-primary):not(.var-modal-danger)`) ; son texte garde la couleur du
    // texte (css/variable-actions.css).
    const removeBtn = button('var-modal-danger');
    const unwrapBtn = button('var-modal-danger var-modal-unwrap');
    const cancelBtn = button();
    const saveBtn = button('var-modal-primary');
    // Deux groupes - les retraits à gauche, Annuler et Enregistrer à droite - qui passent sur deux lignes, chacun entier, quand les quatre boutons ne
    // tiennent pas côte à côte (le français dans les 480 px de la fenêtre) : « Enregistrer » sortirait de la fenêtre.
    const startGroup = el('div', 'var-modal-actions-start');
    startGroup.append(removeBtn, unwrapBtn);
    const endGroup = el('div', 'var-modal-actions-end');
    endGroup.append(cancelBtn, saveBtn);
    win.actions.append(startGroup, endGroup);
    // Copier / Coller : un seul groupe de nœuds, replacé à chaque tracé des règles sur la ligne de « + Ajouter une condition » (cf. renderRules).
    const copyBtn = button('var-condition-clip-btn');
    const pasteBtn = button('var-condition-clip-btn');
    const clipStatus = el('span', 'var-condition-clip-status');
    clipStatus.setAttribute('role', 'status');
    const clip = el('span', 'var-condition-clip');
    clip.append(copyBtn, pasteBtn, clipStatus);
    win.body.append(intro, modeRow, rulesBox, affixRow, previewArea);
    refs = {
      title: win.title, intro, modeRow, modeBefore, modeSelect, modeAfter, rulesBox, clip, copyBtn, pasteBtn, clipStatus, currentLine, countLine,
      removeBtn, unwrapBtn, cancelBtn, saveBtn,
      affixRow, beforeLabel: beforeField.label, beforeInput: beforeField.input, afterLabel: afterField.label, afterInput: afterField.input, affixHint,
    };

    modeSelect.addEventListener('change', () => {
      if (!state) return;
      state.working.mode = modeSelect.value === 'any' ? 'any' : 'all';
      redraw();
    });
    removeBtn.addEventListener('click', () => { if (state) { applyAttrs({ condition: null }); close(); } });
    unwrapBtn.addEventListener('click', unwrapNode);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    copyBtn.addEventListener('click', copyCondition);
    pasteBtn.addEventListener('click', pasteCondition);
    // Toute saisie dans les lignes (colonne, opérateur, valeur, « au moins une ») relance l'aperçu.
    win.box.addEventListener('input', previewRun.schedule);
    win.box.addEventListener('change', previewRun.schedule);
  }

  // « ligne d'Annuaire trouvée via Dossiers.Responsable · Modifier le lien » sous une règle portant sur une autre table déjà liée.
  function updateLinkHint(hint, table) {
    hint.replaceChildren();
    const currentTableId = GristAPI.getCurrentTableId();
    const rule = (table && table !== currentTableId) ? GristAPI.getLinkRule(table) : null;
    hint.hidden = !rule;
    if (!rule) return;
    const text = rule.mode === 'singleton'
      ? I18n.t('varCond.linkHint.singleton', { table })
      : I18n.t('varCond.linkHint.match', { table, via: Variables.describeLinkVia(table, rule, currentTableId) });
    const editBtn = button(null, I18n.t('varCond.linkHint.edit'));
    editBtn.addEventListener('click', async () => {
      if (await Variables.editLinkRule(table)) redraw();
    });
    hint.append(document.createTextNode(text + ' · '), editBtn);
  }

  function redraw() {
    if (!state) return;
    renderRules();
    previewRun.schedule();
  }

  function renderRules() {
    if (!state || !refs) return;
    const { rulesBox, modeRow, modeSelect, clip } = refs;
    const { rules, mode } = state.working;
    modeRow.hidden = rules.length < 2;
    modeSelect.value = mode;
    // Le groupe Copier / Coller est retiré puis replacé à chaque tracé : un de ses boutons qui avait le focus (Coller au clavier) le perdrait sans
    // ça.
    const clipFocus = clip.contains(document.activeElement) ? document.activeElement : null;
    rulesBox.replaceChildren();
    rules.forEach((rule, index) => {
      // Le lien de la table de la colonne de la règle, et celui de l'autre colonne quand la règle en compare une (bouton « autre colonne »).
      const linkHint = el('span', 'var-condition-link-hint');
      linkHint.hidden = true;
      const valueLinkHint = el('span', 'var-condition-link-hint');
      valueLinkHint.hidden = true;
      rulesBox.appendChild(ConditionFields.buildRuleRow(rule, index, {
        mode,
        options: {
          allTables: true,
          compareColumn: true,
          onColumnChosen: ref => ConditionFields.ensureTableLinked(ref, redraw),
          onColumnResolved: table => updateLinkHint(linkHint, table),
          onValueColumnResolved: table => updateLinkHint(valueLinkHint, table),
        },
        onRemove: () => {
          rules.splice(index, 1);
          if (!rules.length) rules.push(ConditionFields.emptyRule());
          redraw();
        },
        extra: [linkHint, valueLinkHint],
      }));
    });
    // Copier / Coller portent sur l'ensemble des règles : sur la même ligne que « + Ajouter », à droite, sans hauteur en plus dans un panneau bas.
    const foot = el('div', 'var-condition-foot');
    foot.append(ConditionFields.buildAddRuleButton(rulesBox, rules, redraw), clip);
    rulesBox.appendChild(foot);
    if (clipFocus) clipFocus.focus();
    syncClipboardButtons();
  }

  // === Copier / Coller === Grisés (aria-disabled plutôt que disabled, pour que l'info-bulle qui explique pourquoi reste visible) : Copier sans règle
  // complète à copier, Coller tant que rien n'a été copié. Le clic revérifie l'état réel : la colonne d'une règle n'est adoptée qu'après le `change`
  // du champ.
  function setClipButton(btn, enabled, title) {
    btn.classList.toggle('is-disabled', !enabled);
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    btn.title = title;
  }
  function syncClipboardButtons() {
    if (!state || !refs) return;
    const canCopy = !!ConditionRules.plainCondition(state.working);
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
    const condition = state && ConditionRules.plainCondition(state.working);
    if (!condition) return;
    clipboard = condition;
    syncClipboardButtons();
    resetCopyLabel();
    refs.copyBtn.textContent = I18n.t('varCond.clip.copied');
    refs.copyBtn.classList.add('is-done');
    refs.clipStatus.textContent = I18n.t('varCond.clip.copiedStatus');
    copiedFlashTimer = setTimeout(resetCopyLabel, 1600);
  }
  // Remplace les règles ET la combinaison (toutes / au moins une) de la fenêtre ; Annuler abandonne.
  function pasteCondition() {
    if (!state || !clipboard) return;
    state.working = ConditionRules.plainCondition(clipboard);
    redraw();
    refs.clipStatus.textContent = I18n.t(texts().pasted);
  }
  function clearClipboard() {
    clipboard = null;
    syncClipboardButtons();
  }

  // === Aperçu === Même évaluation que le mode Lecture (ConditionRules.conditionHolds) : d'abord la ligne sélectionnée dans Grist, puis toutes les
  // lignes de la table de la page, chaque table n'étant lue qu'une fois (LoopRules.createContext : sinon chaque ligne relirait chaque table liée).
  async function displayValue(record, tableId) {
    const { table, column, format } = state.node.attrs;
    if (GristAPI.getColumnType(table, column) === 'Attachments') return I18n.t('varCond.debug.imageValue');
    const value = await Variables.resolveVariable(table, column, tableId, record, format);
    // Avec son texte « Avant » / « Après » comme la Lecture l'écrira ; une valeur vide n'en reçoit pas.
    return value === '' ? I18n.t('varCond.debug.emptyValue') : VariableFormat.withAffixes(value, draftAffixes());
  }
  // Repère lisible de la première ligne trouvée : le texte de la première colonne de la table, s'il y en a un (un identifiant de ligne seul ne se
  // voit pas dans Grist).
  function rowLabel(row, tableId) {
    const firstCol = GristAPI.getColumns(tableId)[0];
    const value = firstCol ? row[firstCol] : null;
    return typeof value !== 'string' || !value.trim() ? '' : ' (' + shorten(value.trim(), 40) + ')';
  }
  // Première ligne de l'aperçu : la condition pour la ligne sélectionnée dans Grist - ou, sans condition mais avec du texte « Avant » / « Après », ce que
  // la variable écrit, toujours. Rend faux quand la fenêtre a changé pendant le calcul.
  async function previewSelectedRow({ condition, tableId, t, stale, currentLine }, record) {
    const holds = await ConditionRules.conditionHolds(condition, tableId, record);
    const shown = holds && showsValue() ? await displayValue(record, tableId) : '';
    if (stale()) return false;
    const key = !condition ? 'varCond.debug.currentShown' : (holds ? t.met : t.notMet);
    setLine(currentLine, I18n.t(key, { id: record.id, value: shown }), holds);
    return true;
  }
  // Combien de lignes remplissent la condition, et la première. Rend null quand la fenêtre a changé pendant le parcours.
  async function countHolding(condition, tableId, rows, fetchRows, stale) {
    let count = 0;
    let first = null;
    for (let i = 0; i < rows.length; i++) {
      if (await ConditionRules.conditionHolds(condition, tableId, rows[i], { fetchRows })) {
        count += 1;
        if (!first) first = rows[i];
      }
      // Rend la main au navigateur de temps en temps sur une grande table, et abandonne si la condition a changé entre-temps.
      if (i % 250 === 249) { await new Promise(r => setTimeout(r, 0)); if (stale()) return null; }
    }
    return { count, first };
  }
  // Seconde ligne de l'aperçu : toutes les lignes de la table de la page, leur nombre et ce que donne la première.
  async function previewAllRows({ condition, tableId, t, stale, countLine }) {
    const { fetchRows } = LoopRules.createContext();
    const rows = await fetchRows(tableId);
    if (stale()) return;
    if (!rows.length) { setLine(countLine, I18n.t('linkConfig.previewTableEmpty', { table: tableId }), false); return; }
    const found = await countHolding(condition, tableId, rows, fetchRows, stale);
    if (!found || stale()) return;
    const { count, first } = found;
    if (!count) { setLine(countLine, I18n.t('varCond.debug.none', { table: tableId, total: rows.length }), false); return; }
    const firstValue = showsValue() ? await displayValue(first, tableId) : '';
    if (stale()) return;
    setLine(countLine, I18n.t('varCond.debug.count', { table: tableId, count, total: rows.length }) + ' '
      + I18n.t(t.first, { id: first.id, label: rowLabel(first, tableId), value: firstValue }), false);
  }
  async function updatePreview() {
    if (!state || !refs) return;
    syncClipboardButtons();
    const outdated = previewRun.begin();
    const stale = () => outdated() || !state;
    const { currentLine, countLine } = refs;
    const condition = ConditionRules.normalizeCondition(state.working);
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    const view = { condition, tableId, t: texts(), stale, currentLine, countLine };
    setLine(countLine, '', false);
    // Sans condition mais avec du texte « Avant » / « Après » : la variable s'affiche toujours, il n'y a pas de lignes à compter.
    const alwaysShown = !condition && !!draftAffixes();
    if (!condition && !alwaysShown) { setLine(currentLine, I18n.t('varCond.debug.chooseColumn'), false); return; }
    if (!record || !tableId) { setLine(currentLine, I18n.t('varCond.debug.noRecord'), false); return; }
    setLine(currentLine, I18n.t('varCond.debug.computing'), false);
    try {
      if ((await previewSelectedRow(view, record)) && !alwaysShown) await previewAllRows(view);
    } catch (e) {
      console.warn('[VariableCondition] aperçu indisponible', e);
      if (!stale()) setLine(currentLine, I18n.t('linkConfig.previewUnavailable'), false);
    }
  }

  // Réécrit des attributs du nœud d'origine (`condition`, et pour une bulle `before` / `after`), retrouvé à sa position capturée au clic. Ce que
  // `patch` ne nomme pas reste tel quel.
  function applyAttrs(patch) {
    const { editor, pos } = state;
    const node = VariableModal.nodeAtOrigin(state, texts().saveLost, 'VariableCondition');
    if (!node) return;
    const attrs = Object.assign({}, node.attrs, patch);
    // Une valeur garde le curseur là où il était, dans son texte : une NodeSelection posée sur elle ferait remplacer la valeur entière par la
    // prochaine frappe.
    if (node.type.name === 'conditionalValue') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
    else EditorCore.patchNodeAndReselect(editor, pos, attrs);
  }
  function save() {
    if (!state) return;
    const patch = { condition: ConditionRules.plainCondition(state.working) };
    if (showsValue()) {
      const around = draftAffixes();
      patch.before = around && around.before;
      patch.after = around && around.after;
    }
    applyAttrs(patch);
    close();
  }
  // « Défaire le bloc » / « Défaire la valeur » : le cadre et la condition disparaissent, le texte reste (js/conditional-text.js:unwrap,
  // js/conditional-value.js:unwrap). Le brouillon n'est pas enregistré : le nœud n'existe plus. S'il n'est plus à sa position d'origine, la fenêtre
  // le dit.
  function unwrapNode() {
    const unwrap = state && texts().unwrap;
    if (!unwrap) return;
    const { editor, pos } = state;
    const done = state.node.type.name === 'conditionalValue' ? ConditionalValue.unwrap(editor, pos) : ConditionalText.unwrap(editor, pos);
    if (!done) alert(I18n.t(unwrap.lost));
    close();
  }

  function close() {
    if (!win) return;
    VariableModal.closeWindow(win, state && state.editor, previewRun, () => { state = null; clearTimeout(copiedFlashTimer); });
  }

  // `pos` : position de la bulle, du bloc, de la valeur ou de la case dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est
  // une NodeSelection sur elle).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || !TEXTS[node.type.name]) return;
    ensureModal();
    const existing = ConditionRules.plainCondition(node.attrs.condition);
    state = { editor, pos, node, hadCondition: !!existing, working: existing || { mode: 'all', rules: [ConditionFields.emptyRule()] } };
    const t = texts();
    const r = refs;
    r.title.textContent = I18n.t(t.title);
    if (showsValue()) r.intro.replaceChildren(el('span', 'var-badge', VariableModal.badgeText(node)), document.createTextNode(' ' + I18n.t(t.intro)));
    else r.intro.textContent = I18n.t(t.intro);
    r.modeBefore.textContent = I18n.t(t.modeBefore);
    r.modeAfter.textContent = I18n.t('varCond.modeAfter');
    r.modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    r.modeSelect.replaceChildren(option('all', I18n.t('varCond.modeAll')), option('any', I18n.t('varCond.modeAny')));
    r.removeBtn.textContent = I18n.t('varCond.remove');
    r.removeBtn.hidden = !state.hadCondition;
    r.unwrapBtn.hidden = !t.unwrap;
    if (t.unwrap) {
      r.unwrapBtn.textContent = I18n.t(t.unwrap.label);
      r.unwrapBtn.title = I18n.t(t.unwrap.title);
    }
    r.cancelBtn.textContent = I18n.t('common.cancel');
    r.saveBtn.textContent = I18n.t('common.save');
    r.affixRow.hidden = !showsValue();
    r.beforeLabel.textContent = I18n.t('varCond.affixBefore');
    r.afterLabel.textContent = I18n.t('varCond.affixAfter');
    r.beforeInput.title = I18n.t('varCond.affixBeforeTitle');
    r.afterInput.title = I18n.t('varCond.affixAfterTitle');
    r.affixHint.textContent = I18n.t('varCond.affixHint');
    r.beforeInput.value = VariableFormat.affix(node.attrs.before) || '';
    r.afterInput.value = VariableFormat.affix(node.attrs.after) || '';
    resetCopyLabel();
    r.pasteBtn.textContent = I18n.t('varCond.clip.paste');
    r.clipStatus.textContent = '';
    renderRules();
    // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte ; elle est sous le voile de toute façon (--z-floating-toolbar,
    // css/style.css).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => r.rulesBox.querySelector('select.macro-rule-column'));
    updatePreview();
  }

  return { open, isOpen, clearClipboard, describe: conditionSummary };
})();
