// Fenêtre « Condition d'affichage » d'une bulle #Variable : la variable n'apparaît en lecture et à l'export que si la condition est remplie
// (js/reader-mode.js, ConditionRules.conditionHolds). La condition vit dans l'attribut `condition` du nœud : { mode: 'all'|'any', rules: [{ column,
// operator, value }] }. Mêmes lignes Colonne / Opérateur / Valeur que les macro-modèles (js/condition-fields.js), avec les colonnes de toutes les
// tables dans une seule liste avec recherche ; une colonne d'une table pas encore liée ouvre le choix de la clé
// (js/variables.js:ensureLinkConfigured). La colonne choisie s'affiche dans le champ comme une variable du document ; un clic sur elle, un bouton à droite de
// la zone de recherche de la liste ou Ctrl+Entrée ouvrent la fenêtre « Autres attributs » pour y choisir la colonne en voyant sa valeur sur la ligne
// sélectionnée, de Référence en Référence (options.attributesWindow, js/variable-linked-attrs.js:pickColumn). Le champ Valeur a un bouton « autre colonne » : la règle compare alors la colonne à une autre colonne de la
// même ligne, { column, operator, valueColumn } (options.compareColumn, js/condition-rules.js:compareOperands), au lieu d'une valeur saisie.
// Aperçu en direct : la ligne sélectionnée, puis combien de lignes de la table remplissent la condition et la
// première d'entre elles. « Copier » / « Coller » recolle la condition d'une fenêtre dans une autre, comme un brouillon : « Enregistrer » l'applique.
// Ouverte depuis la barre flottante (js/floating-toolbars.js:wireVariableFloatingToolbar). La même fenêtre sert aux nœuds conditionnels - bloc de
// texte (js/conditional-text.js), valeur dans la phrase (js/conditional-value.js), case à cocher (js/conditional-checkbox.js) - avec leurs propres
// phrases ; « Défaire le bloc » / « Défaire la valeur » retire le cadre et la condition, le texte reste.
// Une bulle a en plus deux petits champs, « Avant » et « Après » : le texte collé à sa valeur (une virgule, une parenthèse), écrit seulement quand
// la variable s'affiche avec une valeur (attributs `before` et `after` du nœud, VariableFormat.withAffixes ; js/reader-mode.js les écrit). Ils se règlent
// ici parce que le cas d'usage est la virgule d'une variable conditionnelle, mais valent aussi pour une bulle sans condition.
// Et une ligne « Sinon afficher » : la variable que la bulle écrit à sa place quand la condition n'est pas remplie, avec son propre « Avant » / « Après »
// (attribut `otherwise` du nœud, js/variable-otherwise.js). La liste est celle de « Colonne… » (js/variable-column.js) ; grisée sans règle complète,
// puisqu'un sinon n'a de sens que pour une condition. Elle est la dernière de la fenêtre, sous l'aperçu : à 700 × 400 la fenêtre défile déjà, et rien de ce qui s'y
// voyait à l'ouverture (les règles, « Avant » / « Après », l'aperçu) ne doit descendre. L'aperçu dit ce que la ligne sélectionnée écrit, sinon compris.
const VariableCondition = (function () {
  const { el, option, button } = Dom;
  const { setLine, shorten } = VariableModal;
  // Les phrases de la fenêtre selon le nœud qui porte la condition. Les clés s'écrivent en toutes lettres, pour que la recherche des clés sans usage
  // (dev-tests/verify-code-hygiene.mjs) les voie. `unwrap` : le bouton « Défaire… », pour les nœuds dont on peut garder le texte.
  const TEXTS = {
    varBadge: {
      title: 'varCond.title', intro: 'varCond.intro', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLost', pasted: 'varCond.clip.pastedStatus',
      met: 'varCond.debug.currentMet', notMet: 'varCond.debug.currentNotMet', first: 'varCond.debug.first',
      notMetOtherwise: 'varCond.debug.currentNotMetOtherwise',
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
  // Le sinon tel que la fenêtre le règle ({ table, column, key, before, after }, js/variable-otherwise.js), ou null : sans bulle, sans variable choisie
  // ou fenêtre fermée.
  const draftOtherwise = () => (state && refs && showsValue() && state.otherwise
    ? VariableOtherwise.normalize(Object.assign({}, state.otherwise, { before: refs.otherwiseBeforeInput.value, after: refs.otherwiseAfterInput.value }))
    : null);

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

  // Les champs de la ligne « Sinon afficher » : l'étiquette, la liste des variables (le <select> ; la liste avec recherche vient dessus à la création de la
  // fenêtre, ses lignes à chaque ouverture : `fillOtherwiseChoices`), l'indication d'une colonne disparue, puis l'« Avant » / « Après » du sinon.
  // `nodes` : ce que sa grille - `otherwiseRow`, sous l'aperçu - reçoit, dans l'ordre.
  function buildOtherwiseFields() {
    const label = el('label');
    label.htmlFor = 'var-condition-otherwise';
    const select = el('select');
    select.id = 'var-condition-otherwise';
    const field = el('div', 'var-condition-otherwise-field');
    field.appendChild(select);
    const hint = el('span', 'var-condition-otherwise-hint');
    hint.hidden = true;
    const before = VariableModal.labelledInput('var-condition-otherwise-before', 'var-condition-affix-input');
    const after = VariableModal.labelledInput('var-condition-otherwise-after', 'var-condition-affix-input');
    after.label.className = 'var-condition-affix-after';
    return {
      label, field, select, hint, beforeLabel: before.label, beforeInput: before.input, afterLabel: after.label, afterInput: after.input,
      nodes: [label, field, hint, before.label, before.input, after.label, after.input],
    };
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
    afterField.label.className = 'var-condition-affix-after';
    const affixHint = el('span', 'var-loop-hint');
    const otherwise = buildOtherwiseFields();
    for (const input of [beforeField.input, afterField.input, otherwise.beforeInput, otherwise.afterInput]) {
      input.maxLength = VariableFormat.AFFIX_MAX;
      input.autocomplete = 'off';
      input.spellcheck = false;
      // L'aperçu montre le texte tel qu'il s'écrira : il se recalcule à chaque saisie, comme pour une règle.
      input.addEventListener('input', () => previewRun.schedule());
    }
    affixRow.append(beforeField.label, beforeField.input, afterField.label, afterField.input, affixHint);
    // « Sinon afficher » (js/variable-otherwise.js) et son propre « Avant » / « Après » : une seconde grille, la même, tout en bas. L'aperçu garde sa place, entre
    // les deux : à 700 × 400 ce qui se voyait dès l'ouverture - les règles, « Avant » / « Après », la première ligne de l'aperçu - reste où c'était, la ligne
    // nouvelle vient en dessous.
    const otherwiseRow = el('div', 'var-condition-affix var-condition-otherwise-row');
    otherwiseRow.append(...otherwise.nodes);
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
    win.body.append(intro, modeRow, rulesBox, affixRow, previewArea, otherwiseRow);
    refs = {
      title: win.title, intro, modeRow, modeBefore, modeSelect, modeAfter, rulesBox, clip, copyBtn, pasteBtn, clipStatus, currentLine, countLine,
      removeBtn, unwrapBtn, cancelBtn, saveBtn,
      affixRow, beforeLabel: beforeField.label, beforeInput: beforeField.input, afterLabel: afterField.label, afterInput: afterField.input, affixHint,
      otherwiseRow, otherwiseLabel: otherwise.label, otherwiseField: otherwise.field, otherwiseSelect: otherwise.select, otherwiseHint: otherwise.hint,
      otherwiseBeforeLabel: otherwise.beforeLabel, otherwiseBeforeInput: otherwise.beforeInput,
      otherwiseAfterLabel: otherwise.afterLabel, otherwiseAfterInput: otherwise.afterInput, otherwiseSearch: null,
    };
    // Liste avec recherche posée par-dessus le <select> (js/search-select.js), une fois la ligne dans la fenêtre : le <select> garde le choix, et son
    // étiquette lui donne son nom. Si le composant échoue, la liste native reste.
    try { refs.otherwiseSearch = SearchSelect.attachColumns(otherwise.select, { inline: true, hintInTrigger: false, expand: VariableColumn.expand }); }
    catch (e) { console.warn('[VariableCondition] recherche de variable indisponible, liste native conservée', e); }
    otherwise.select.addEventListener('change', () => chooseOtherwise(otherwise.select.value));

    modeSelect.addEventListener('change', () => {
      if (!state) return;
      state.working.mode = modeSelect.value === 'any' ? 'any' : 'all';
      redraw();
    });
    removeBtn.addEventListener('click', () => { if (state) { applyAttrs(showsValue() ? { condition: null, otherwise: null } : { condition: null }); close(); } });
    unwrapBtn.addEventListener('click', unwrapNode);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    copyBtn.addEventListener('click', copyCondition);
    pasteBtn.addEventListener('click', pasteCondition);
    // Toute saisie dans les lignes (colonne, opérateur, valeur, « au moins une ») relance l'aperçu, et dégrise - ou regrise - tout de suite la ligne « Sinon
    // afficher » selon que les règles sont complètes.
    const edited = () => { syncOtherwiseRow(); previewRun.schedule(); };
    win.box.addEventListener('input', edited);
    win.box.addEventListener('change', edited);
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
    syncOtherwiseRow();
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
          attributesWindow: true,
          onColumnChosen: ref => ConditionFields.ensureTableLinked(ref, redraw, state ? VariableLoop.loopTablesAt(state.editor.state, state.pos) : null),
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

  // === Sinon afficher === La liste des variables est celle de « Colonne… » (VariableColumn.candidates : la table de la page en tête, sans les colonnes d'aide),
  // relue à chaque ouverture ; un sinon enregistré dont la colonne a disparu y reste sous son nom, avec son indication : jamais effacé en silence.
  function fillOtherwiseChoices() {
    const saved = state.otherwise;
    const choices = VariableColumn.candidates(state.editor);
    state.choices = saved && !choices.some(v => v.key === saved.key) ? choices.concat(saved) : choices;
    // « — Aucune — » est un vrai choix (`data-placeholder`) : la liste le traite comme les autres lignes.
    const none = Dom.option('', I18n.t('varCond.otherwiseNone'));
    none.dataset.placeholder = 'false';
    refs.otherwiseSelect.replaceChildren(none, ...state.choices.map(VariableColumn.optionOf));
    refs.otherwiseSelect.value = saved ? saved.key : '';
    if (refs.otherwiseSearch) refs.otherwiseSearch.sync();
  }
  // L'état de la ligne : grisée tant qu'aucune règle n'est complète (jamais retirée : l'info-bulle dit pourquoi, sur l'étiquette et sur le champ), l'« Avant » /
  // « Après » du sinon visibles une fois une variable choisie, et l'indication quand cette colonne n'existe plus.
  function syncOtherwiseRow() {
    if (!state || !refs || !showsValue()) return;
    const ready = !!ConditionRules.plainCondition(state.working);
    const title = I18n.t(ready ? 'varCond.otherwiseTitle' : 'varCond.otherwiseNeedsRule');
    refs.otherwiseSelect.disabled = !ready;
    if (refs.otherwiseSearch) refs.otherwiseSearch.sync();
    refs.otherwiseLabel.title = title;
    refs.otherwiseField.title = title;
    const chosen = !!state.otherwise;
    [refs.otherwiseBeforeLabel, refs.otherwiseBeforeInput, refs.otherwiseAfterLabel, refs.otherwiseAfterInput].forEach(node => { node.hidden = !chosen; });
    refs.otherwiseBeforeInput.disabled = !ready;
    refs.otherwiseAfterInput.disabled = !ready;
    const problem = chosen ? Editor.badgeProblemText(state.otherwise.table, state.otherwise.column) : '';
    refs.otherwiseHint.textContent = problem;
    refs.otherwiseHint.hidden = !problem;
  }
  // Un choix dans la liste (`key` vide : « — Aucune — », le sinon s'en va). Une variable d'une table pas encore liée ouvre d'abord la fenêtre de la clé
  // (VariableColumn.ensureLinked) ; refusée, la liste revient à son choix d'avant. Un sinon qui vient d'être choisi prend l'« Avant » / « Après » de la
  // bulle : la virgule du cas d'usage suit toute seule, la personne change ensuite l'étiquette (« Payée le », « Échéance : »).
  async function chooseOtherwise(key) {
    if (!state) return;
    const previous = state.otherwise;
    const item = key ? VariableColumn.itemOf(state.choices, key) : null;
    if (key && !item) return;
    // Refusé, le choix d'avant se remet : la liste est refaite d'après `state.otherwise`, qui n'a pas encore bougé.
    if (item && !(await VariableColumn.ensureLinked(state.editor, state.pos, item))) {
      if (state) fillOtherwiseChoices();
      return;
    }
    if (!state) return;
    state.otherwise = item ? { table: item.table, column: item.column, key: item.key } : null;
    if (item && !previous && !refs.otherwiseBeforeInput.value && !refs.otherwiseAfterInput.value) {
      refs.otherwiseBeforeInput.value = refs.beforeInput.value;
      refs.otherwiseAfterInput.value = refs.afterInput.value;
    }
    syncOtherwiseRow();
    previewRun.schedule();
  }

  // === Aperçu === Même évaluation que le mode Lecture (ConditionRules.conditionHolds) : d'abord la ligne sélectionnée dans Grist, puis toutes les
  // lignes de la table de la page, chaque table n'étant lue qu'une fois (LoopRules.createContext : sinon chaque ligne relirait chaque table liée).
  // `shown` : la bulle à lire ({ table, column, format, before, after }) - celle que la fenêtre règle (`shownMain`) ou, condition non remplie, celle de son
  // sinon (VariableOtherwise.whenNotMet).
  async function displayValue(record, tableId, shown) {
    const { table, column, format } = shown;
    if (GristAPI.getColumnType(table, column) === 'Attachments') return I18n.t('varCond.debug.imageValue');
    const value = await Variables.resolveVariable(table, column, tableId, record, format);
    // Avec son texte « Avant » / « Après » comme la Lecture l'écrira ; une valeur vide n'en reçoit pas.
    return value === '' ? I18n.t('varCond.debug.emptyValue') : VariableFormat.withAffixes(value, VariableFormat.affixes(shown.before, shown.after));
  }
  // La bulle telle que la fenêtre la règle : sa variable, son format et son texte « Avant » / « Après » du moment (pas ceux du nœud, qui ne bougent
  // qu'à « Enregistrer »).
  function shownMain() {
    const { table, column, format } = state.node.attrs;
    const around = draftAffixes();
    return { table, column, format, before: around && around.before, after: around && around.after };
  }
  // La bulle du sinon réglé dans la fenêtre, ou null quand il n'y en a pas : ce que la ligne écrit quand la condition n'est pas remplie.
  const shownOtherwise = () => VariableOtherwise.whenNotMet(Object.assign({}, state.node.attrs, { otherwise: draftOtherwise() }));
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
    // Condition non remplie : ce que le sinon réglé dans la fenêtre écrit à la place, quand il y en a un.
    const fallback = !holds && condition && showsValue() ? shownOtherwise() : null;
    const shown = showsValue() && (holds || fallback) ? await displayValue(record, tableId, holds ? shownMain() : fallback) : '';
    if (stale()) return false;
    const key = !condition ? 'varCond.debug.currentShown' : (holds ? t.met : (fallback ? t.notMetOtherwise : t.notMet));
    setLine(currentLine, I18n.t(key, { id: record.id, value: shown }), holds || !!fallback);
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
    // Avec un sinon réglé, les lignes qui ne remplissent pas la condition ne sont plus masquées : la phrase dit qu'elles affichent le sinon.
    const withOtherwise = showsValue() && !!draftOtherwise();
    if (!count) { setLine(countLine, I18n.t(withOtherwise ? 'varCond.debug.noneOtherwise' : 'varCond.debug.none', { table: tableId, total: rows.length }), false); return; }
    const firstValue = showsValue() ? await displayValue(first, tableId, shownMain()) : '';
    if (stale()) return;
    const others = rows.length - count;
    const countKey = withOtherwise && others > 0 ? 'varCond.debug.countOtherwise' : 'varCond.debug.count';
    setLine(countLine, I18n.t(countKey, { table: tableId, count, total: rows.length, others }) + ' '
      + I18n.t(t.first, { id: first.id, label: rowLabel(first, tableId), value: firstValue }), false);
  }
  async function updatePreview() {
    if (!state || !refs) return;
    syncClipboardButtons();
    syncOtherwiseRow();
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

  // Réécrit des attributs du nœud d'origine (`condition`, et pour une bulle `before`, `after` et `otherwise`), retrouvé à sa position capturée au clic.
  // Ce que `patch` ne nomme pas reste tel quel.
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
    const condition = ConditionRules.plainCondition(state.working);
    const patch = { condition };
    if (showsValue()) {
      const around = draftAffixes();
      patch.before = around && around.before;
      patch.after = around && around.after;
      // Un sinon n'a de sens que pour une condition : sans règle complète, il s'en va avec elle.
      patch.otherwise = condition ? draftOtherwise() : null;
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
    const saved = VariableOtherwise.normalize(node.attrs.otherwise);
    state = {
      editor, pos, node, hadCondition: !!existing, working: existing || { mode: 'all', rules: [ConditionFields.emptyRule()] },
      // « Sinon afficher » : la variable choisie ({ table, column, key }, null = aucune) et les variables qui se proposent (fillOtherwiseChoices).
      otherwise: node.type.name === 'varBadge' && saved ? { table: saved.table, column: saved.column, key: saved.key } : null, choices: [],
    };
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
    r.otherwiseRow.hidden = !showsValue();
    r.beforeLabel.textContent = I18n.t('varCond.affixBefore');
    r.afterLabel.textContent = I18n.t('varCond.affixAfter');
    r.beforeInput.title = I18n.t('varCond.affixBeforeTitle');
    r.afterInput.title = I18n.t('varCond.affixAfterTitle');
    r.affixHint.textContent = I18n.t('varCond.affixHint');
    r.beforeInput.value = VariableFormat.affix(node.attrs.before) || '';
    r.afterInput.value = VariableFormat.affix(node.attrs.after) || '';
    r.otherwiseLabel.textContent = I18n.t('varCond.otherwiseLabel');
    r.otherwiseBeforeLabel.textContent = I18n.t('varCond.affixBefore');
    r.otherwiseAfterLabel.textContent = I18n.t('varCond.affixAfter');
    r.otherwiseBeforeInput.setAttribute('aria-label', I18n.t('varCond.otherwiseBeforeAria'));
    r.otherwiseAfterInput.setAttribute('aria-label', I18n.t('varCond.otherwiseAfterAria'));
    r.otherwiseBeforeInput.title = I18n.t('varCond.affixBeforeTitle');
    r.otherwiseAfterInput.title = I18n.t('varCond.affixAfterTitle');
    r.otherwiseBeforeInput.value = (state.otherwise && saved && saved.before) || '';
    r.otherwiseAfterInput.value = (state.otherwise && saved && saved.after) || '';
    if (showsValue()) fillOtherwiseChoices();
    resetCopyLabel();
    r.pasteBtn.textContent = I18n.t('varCond.clip.paste');
    r.clipStatus.textContent = '';
    renderRules();
    syncOtherwiseRow();
    // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte ; elle est sous le voile de toute façon (--z-floating-toolbar,
    // css/style.css).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => r.rulesBox.querySelector('select.macro-rule-column'));
    updatePreview();
  }

  return { open, isOpen, clearClipboard, describe: conditionSummary };
})();
