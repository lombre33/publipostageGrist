// Champs d'une règle « Colonne / Opérateur / Valeur » partagés par toutes les fenêtres de règles (macro-modèles, conditions, boucles) : mêmes classes
// .macro-rule-* (css/toolbar-v2.css), donc une seule copie des styles et des sélecteurs de test. Chaque champ mute `rule` en place ; l'appelant
// décide quand l'enregistrer.
const ConditionFields = (function () {
  const el = Dom.el;

  const ADVANCED_COLUMN_VALUE = '__advanced__';
  const ADVANCED_VALUE = '__advanced_value__';

  function textInput(className, placeholder) {
    const input = el('input', className);
    input.type = 'text';
    input.placeholder = placeholder;
    return input;
  }

  function pinnedOption(value, text) {
    // Dernière ligne d'une liste avec recherche : jamais filtrée.
    const option = Dom.option(value, text);
    option.dataset.pinned = 'true';
    return option;
  }

  const savedValue = rule => (rule.value == null ? '' : String(rule.value));
  const isReference = type => !!GristAPI.referenceOf(type);

  function friendlyTypeLabel(type) {
    // Type Grist affiché sous le champ colonne : il dit quel format saisir dans le champ valeur (une date, par exemple).
    const t = String(type || '');
    if (t === 'Date') return I18n.t('macro.modal.typeDate');
    if (t.indexOf('DateTime') === 0) return I18n.t('macro.modal.typeDateTime');
    if (t === 'Bool') return I18n.t('macro.modal.typeBool');
    if (isReference(t)) return I18n.t('macro.modal.typeRef');
    if (t === 'Numeric' || t === 'Int') return I18n.t('macro.modal.typeNumeric');
    if (t === 'Choice' || t === 'ChoiceList') return I18n.t('macro.modal.typeChoice');
    return '';
  }

  function appendColumnOption(parent, value, table, column) {
    // Une colonne de la liste : `value` est « Colonne » (table de la page) ou « Table.Colonne », et c'est aussi son nom à l'écran. Le type Grist en est
    // l'indice dans la liste avec recherche (« Date de début (date) »), qui permet de chercher « date » ; le texte de l'<option>, « nom (indice) »,
    // sert à la liste native de repli. Sa table et son libellé Grist se cherchent aussi (`data-search`). Exportée : le tri d'une boucle
    // (js/variable-loop.js) liste ses colonnes pareil.
    const hint = friendlyTypeLabel(GristAPI.getColumnType(table, column));
    const option = Dom.option(value, hint ? value + ' (' + hint + ')' : value);
    option.dataset.name = value;
    option.dataset.search = Variables.columnSearchText(table, column);
    if (hint) option.dataset.hint = hint;
    parent.appendChild(option);
  }

  function appendAllTablesOptions(select, currentTableId) {
    // Une seule liste à plat, sans groupes : les colonnes de la table de la page en tête et en valeur nue, celles des autres tables en
    // « Table.Colonne » (parseColumnRef), si bien que la table se cherche avec le nom de la colonne. Une colonne d'une table pas encore liée se choisit
    // quand même : l'appelant demande alors la clé du lien (options.onColumnChosen).
    const tables = GristAPI.getTables();
    const ordered = tables.includes(currentTableId) ? [currentTableId, ...tables.filter(t => t !== currentTableId)] : tables;
    ordered.forEach(table => GristAPI.getVisibleColumns(table).forEach(c => appendColumnOption(select, table === currentTableId ? c : table + '.' + c, table, c)));
  }

  function ensureTableLinked(ref, onLinked) {
    // Avant d'adopter une colonne d'une table pas encore liée à celle de la page, la fenêtre de choix de la clé s'ouvre
    // (js/variables.js:ensureLinkConfigured). Rend `true` tout de suite quand il n'y a rien à demander (colonne de la page ou table déjà liée), sinon
    // une promesse : vraie si le lien est enregistré, fausse si le choix est annulé (options.onColumnChosen remet alors la colonne précédente).
    // `onLinked`, facultatif : appelé une fois le lien enregistré et la colonne adoptée (le setTimeout laisse passer l'adoption, qui suit la résolution
    // de la promesse).
    const currentTableId = GristAPI.getCurrentTableId();
    if (!ref || !ref.table || !currentTableId || ref.table === currentTableId) return true;
    if (GristAPI.getLinkRule(ref.table)) return true;
    const linking = Variables.ensureLinkConfigured({ table: ref.table });
    return onLinked ? linking.then(ok => { if (ok) setTimeout(() => onLinked(), 0); return ok; }) : linking;
  }

  function fillColumnList(select, opts) {
    // Liste des colonnes selon les options de buildColumnField : celles de `table` seule, de toutes les tables, ou de la page.
    select.appendChild(Dom.option('', I18n.t('macro.modal.columnChoosePlaceholder')));
    const pageTable = GristAPI.getCurrentTableId();
    if (opts.table) GristAPI.getVisibleColumns(opts.table).forEach(c => appendColumnOption(select, c, opts.table, c));
    else if (opts.allTables) appendAllTablesOptions(select, pageTable);
    else if (pageTable) GristAPI.getColumns(pageTable).forEach(c => appendColumnOption(select, c, pageTable, c));
  }

  function showSavedChoice(select, advancedInput, advancedValue, saved, known) {
    // Valeur enregistrée : choisie dans la liste si elle y figure, sinon reprise telle quelle en saisie avancée, jamais effacée en silence
    // (« Table.Colonne » d'une autre table, colonne disparue, choix retiré, ligne supprimée de la table liée).
    const unknown = !!saved && known.indexOf(saved) === -1;
    select.value = unknown ? advancedValue : saved;
    advancedInput.hidden = !unknown;
    if (unknown) advancedInput.value = saved;
  }

  function columnFacts(value, baseTable) {
    // Ce que la ligne affichée sait de la colonne choisie (`value`, nue ou « Table.Colonne ») : sa colonne, sa table, son type, et si la ligne affichée
    // ne la porte pas (colonne non transmise par grist.onRecord). `baseTable` : la table d'une colonne nue.
    const ref = value ? ConditionRules.parseColumnRef(value, baseTable()) : null;
    const col = ref ? ref.column : null;
    const table = ref ? ref.table : null;
    const type = (col && table) ? GristAPI.getColumnType(table, col) : null;
    const record = (col && table === GristAPI.getCurrentTableId()) ? GristAPI.getCurrentRecord() : null;
    return { col, table, type, missingFromRecord: !!(col && record && !(col in record)) };
  }

  // Liste des colonnes réelles, plus une option « avancé » (jamais retirée) qui révèle un champ texte pour une colonne absente de la liste
  // (« Table.Colonne », js/condition-rules.js:parseColumnRef). `onTypeChange(type, colonne, table)` prévient le champ Valeur de la colonne choisie,
  // pour son placeholder et ses choix. Renvoie `{ wrap, typeHint }` : l'appelant place `typeHint` hors de `wrap` (voir plus bas). `options` :
  // { allTables: true } liste les colonnes de toutes les tables (appendAllTablesOptions) ; { onColumnChosen(ref, value) } est appelé avant d'adopter
  // une colonne de la liste : `true` l'adopte tout de suite, une promesse qui ne résout pas vrai remet la colonne précédente ; { table } (boucle,
  // js/variable-loop.js) liste les colonnes de cette seule table, en valeur nue, car le filtre d'une boucle lit la table parcourue
  // (js/loop-rules.js:ruleHolds). Sans options : les colonnes de la page seule. Le même champ sert à choisir l'AUTRE colonne d'une règle qui compare
  // deux colonnes (buildOtherColumnField) : { property: 'valueColumn' } range alors le choix dans `rule.valueColumn` au lieu de `rule.column`,
  // { typeHint } est la ligne d'indication que l'appelant garde (cachée tant qu'elle est vide) et { warningOnly: true } n'y écrit que l'avertissement
  // « absente de la ligne affichée », pas le type de la colonne.
  function buildColumnField(rule, onTypeChange, options) {
    const opts = options || {};
    const prop = opts.property || 'column';
    const baseTable = () => opts.table || GristAPI.getCurrentTableId();
    const wrap = el('span', 'macro-rule-column-wrap');
    const select = el('select', prop === 'column' ? 'macro-rule-column' : 'macro-rule-column macro-rule-value-column');
    fillColumnList(select, opts);
    const listed = Array.from(select.options).map(o => o.value).filter(Boolean);
    select.appendChild(pinnedOption(ADVANCED_COLUMN_VALUE, I18n.t('macro.modal.columnAdvanced')));
    const advancedInput = textInput('macro-rule-column-advanced', I18n.t('macro.modal.columnAdvancedPlaceholder'));
    const typeHint = opts.typeHint || el('span', 'macro-rule-column-type');

    // Avertissement si la colonne choisie est absente de la ligne affichée (record) : probablement une colonne non cochée dans le panneau de droite
    // du widget, que grist.onRecord ne transmet pas (js/grist-api.js:includeColumns), si bien qu'une règle « = » échouerait sans rien dire
    // (js/condition-rules.js:matches le signale aussi dans le journal). Seule la table de la page est concernée : c'est la seule que grist.onRecord
    // transmet.
    function updateTypeHint() {
      const facts = columnFacts(select.value === ADVANCED_COLUMN_VALUE ? null : select.value, baseTable);
      const label = facts.type && !opts.warningOnly ? friendlyTypeLabel(facts.type) : '';
      typeHint.textContent = facts.missingFromRecord ? I18n.t('macro.modal.columnMissingFromRecord') : label;
      typeHint.classList.toggle('is-warning', facts.missingFromRecord);
      // Une ligne d'indication confiée par l'appelant n'occupe de place sous la règle que quand elle dit quelque chose.
      if (opts.typeHint) typeHint.hidden = !typeHint.textContent;
      if (onTypeChange) onTypeChange(facts.type, facts.col, facts.table);
    }

    showSavedChoice(select, advancedInput, ADVANCED_COLUMN_VALUE, rule[prop] || '', listed);
    updateTypeHint();

    // Liste avec recherche (js/search-select.js) posée plus bas par-dessus le <select>, qui reste la source de la valeur et des évènements `change`.
    // Déclarée ici : restoreAdopted doit rafraîchir son champ.
    let search = null;
    // Dernière valeur réellement adoptée par la liste (pas la saisie avancée) : remise si options.onColumnChosen refuse le nouveau choix.
    let adoptedSelectValue = select.value;
    function restoreAdopted() {
      select.value = adoptedSelectValue;
      advancedInput.hidden = adoptedSelectValue !== ADVANCED_COLUMN_VALUE;
      if (search) search.sync();
    }
    function adopt(value) {
      advancedInput.hidden = true;
      rule[prop] = value;
      adoptedSelectValue = value;
      updateTypeHint();
    }
    select.addEventListener('change', () => {
      if (select.value === ADVANCED_COLUMN_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule[prop] = advancedInput.value;
        adoptedSelectValue = ADVANCED_COLUMN_VALUE;
        updateTypeHint();
        return;
      }
      const chosen = select.value;
      if (!opts.onColumnChosen || !chosen) { adopt(chosen); return; }
      const answer = opts.onColumnChosen(ConditionRules.parseColumnRef(chosen, baseTable()), chosen);
      // `true` rendu tel quel : rien à demander, la colonne est adoptée dans l'évènement même (une promesse, elle, ne répond qu'après).
      if (answer === true) { adopt(chosen); return; }
      Promise.resolve(answer).then(ok => {
        if (ok) { adopt(chosen); return; }
        restoreAdopted();
      }, e => {
        console.error('[ConditionFields] choix de colonne interrompu', e);
        restoreAdopted();
      });
    });
    advancedInput.addEventListener('input', () => { rule[prop] = advancedInput.value; });

    wrap.append(select, advancedInput);
    // L'indice de type est dit dans la liste ouverte, pas dans le champ fermé : il reste sous le champ (typeHint). Si le composant échoue, le
    // <select> natif reste affiché.
    try { search = SearchSelect.attachColumns(select, { inline: true, hintInTrigger: false }); }
    catch (e) { console.warn('[ConditionFields] recherche de colonne indisponible, liste native conservée', e); }
    // typeHint reste hors de `wrap` (largeur flex:1, un tiers de la ligne) : l'avertissement « colonne absente », long, écraserait le reste de la
    // ligne. L'appelant le place en pleine largeur sous la ligne (.macro-rule-column-type, css/toolbar-v2.css : flex-basis:100%).
    return { wrap, typeHint };
  }

  function buildValueText(rule, type) {
    // Champ Valeur en texte libre (colonne sans valeurs à proposer, et repli si la liste ne peut pas se remplir) ; une date se tape dans un format
    // précis, d'où son placeholder.
    const isDate = type === 'Date' || type.indexOf('DateTime') === 0;
    const input = textInput('macro-rule-value', I18n.t(isDate ? 'macro.modal.valuePlaceholderDate' : 'macro.modal.valuePlaceholder'));
    input.value = rule.value || '';
    input.addEventListener('input', () => { rule.value = input.value; });
    return input;
  }

  function attachValueSearch(select) {
    // Liste avec recherche sur le <select> d'une liste de valeurs ; si le composant échoue, le <select> natif reste affiché et la règle marche pareil.
    try { return SearchSelect.attachValues(select, { inline: true }); }
    catch (e) { console.warn('[ConditionFields] recherche de valeur indisponible, liste native conservée', e); return null; }
  }

  function buildValueList(rule, wrap, type) {
    // Champ Valeur en liste des valeurs possibles, posé dans `wrap` : un <select> (source de la valeur) dont la dernière option « Autre valeur… »
    // révèle un champ texte, coiffé de la liste avec recherche (js/search-select.js). Renvoie `fill(valeurs)` (choix d'une colonne Choix tout de suite,
    // valeurs de la table liée à leur arrivée), `showLoading()` (texte d'attente) et `toText()` (retour au texte libre).
    const select = el('select', 'macro-rule-value');
    const advancedInput = textInput('macro-rule-value-advanced', I18n.t('macro.modal.valuePlaceholder'));
    advancedInput.hidden = true;
    wrap.append(select, advancedInput);

    select.addEventListener('change', () => {
      if (select.value === ADVANCED_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule.value = advancedInput.value;
      } else {
        advancedInput.hidden = true;
        rule.value = select.value;
      }
    });
    advancedInput.addEventListener('input', () => { rule.value = advancedInput.value; });

    const search = attachValueSearch(select);

    // Le panneau ouvert lit ses lignes à l'ouverture : celui qu'on ouvre pendant la lecture n'aurait que l'attente, on le referme au retour.
    function refresh() {
      if (!search) return;
      if (search.isOpen()) search.close(false);
      search.sync();
    }
    return {
      showLoading() {
        select.textContent = '';
        select.appendChild(Dom.option('', I18n.t('macro.modal.valueLoading')));
        refresh();
      },
      fill(values) {
        select.textContent = '';
        select.appendChild(Dom.option('', I18n.t('macro.modal.valueChoosePlaceholder')));
        values.forEach(v => select.appendChild(Dom.option(v, v)));
        select.appendChild(pinnedOption(ADVANCED_VALUE, I18n.t('macro.modal.valueAdvanced')));
        showSavedChoice(select, advancedInput, ADVANCED_VALUE, savedValue(rule), values);
        refresh();
      },
      toText() {
        if (search) search.destroy();
        const input = buildValueText(rule, type);
        input.disabled = select.disabled; // grisé ou non par l'opérateur (syncValueDisabled), pas par ce champ
        wrap.replaceChildren(input);
      },
    };
  }

  function buildBoolList(rule, wrap) {
    // Champ Valeur d'une colonne Oui / Non : une liste de deux mots, sans saisie libre (un mot tapé de travers ne correspondrait à rien, sans message).
    // Les mots sont ceux que la comparaison lit (ConditionRules.parseBoolExpected), dans la langue de l'interface. Une valeur déjà enregistrée garde sa
    // forme tant qu'on n'y touche pas (« vrai » ou « yes » s'affichent « Oui » sans réécrire la règle) ; une valeur que la comparaison ne lit pas reste
    // visible en dernière ligne avec « valeur non reconnue », jamais effacée en silence, et sort de la liste dès qu'on choisit Oui ou Non.
    const select = el('select', 'macro-rule-value');
    const yes = I18n.t('macro.modal.valueBoolYes');
    const no = I18n.t('macro.modal.valueBoolNo');
    select.append(Dom.option('', I18n.t('macro.modal.valueChoosePlaceholder')), Dom.option(yes, yes), Dom.option(no, no));
    const saved = savedValue(rule);
    const word = ConditionRules.parseBoolExpected(saved);
    let unrecognized = null;
    if (saved.trim() !== '' && word === null) {
      const hint = I18n.t('macro.modal.valueUnrecognized');
      unrecognized = Dom.option(saved, saved + ' (' + hint + ')');
      unrecognized.dataset.name = saved;
      unrecognized.dataset.hint = hint;
      select.appendChild(unrecognized);
    }
    select.value = unrecognized ? saved : word === true ? yes : word === false ? no : '';
    select.addEventListener('change', () => {
      rule.value = select.value;
      if (unrecognized && select.value !== unrecognized.value) { unrecognized.remove(); unrecognized = null; }
    });
    wrap.appendChild(select);
    attachValueSearch(select);
  }

  function buildValueField(rule, columnType, colId, table) {
    // Champ Valeur selon la colonne choisie : une liste avec recherche des valeurs possibles quand elle en propose (une valeur tapée à la main qui
    // diffère d'une casse, d'un accent ou d'un espace ne correspondrait jamais, sans message), sinon un texte libre. Sources : les choix d'une colonne
    // Choice/ChoiceList (GristAPI.getColumnChoices), tout de suite ; les valeurs affichées de la table liée pour une Référence ou une liste de
    // références (GristAPI.getReferenceValues), lues de façon asynchrone sous « Chargement… ». « Autre valeur… » garde la saisie libre d'une valeur
    // hors liste ; une table liée illisible ou vide, ou une colonne sans valeur connue (Référence qui montre l'id de la ligne ou une date), retombe sur
    // le texte libre : jamais un champ qui disparaît. Une colonne Oui / Non a sa liste Oui / Non (buildBoolList). `table` : table de la colonne (celle
    // de la page par défaut).
    const wrap = el('span', 'macro-rule-value-wrap');
    const type = String(columnType || '');
    const tableId = table || GristAPI.getCurrentTableId();

    if (type === 'Bool') {
      buildBoolList(rule, wrap);
      return wrap;
    }

    const choices = (type === 'Choice' || type === 'ChoiceList') && colId && tableId ? GristAPI.getColumnChoices(tableId, colId) : null;

    if (choices && choices.length) {
      buildValueList(rule, wrap, type).fill(choices);
      return wrap;
    }

    if (isReference(type) && colId && tableId && GristAPI.getReferenceColumn(tableId, colId)) {
      const list = buildValueList(rule, wrap, type);
      list.showLoading();
      GristAPI.getReferenceValues(tableId, colId).then(values => {
        if (values.length) list.fill(values); else list.toText();
      }, e => {
        console.warn('[ConditionFields] valeurs de la table liée illisibles, texte libre conservé', e);
        list.toText();
      });
      return wrap;
    }

    wrap.appendChild(buildValueText(rule, type));
    return wrap;
  }

  // « vide » / « non vide » ne lisent jamais la valeur (js/condition-rules.js:compareValues) : le champ Valeur est grisé, pas retiré, et sa valeur
  // reste si l'on revient à un autre opérateur. Le bouton « autre colonne » (buildCompareButton) l'est avec lui : il n'y a rien à comparer.
  function syncValueDisabled(valueSlot, operator) {
    const disabled = ConditionRules.VALUELESS_OPERATORS.indexOf(operator) !== -1;
    valueSlot.classList.toggle('is-disabled', disabled);
    valueSlot.querySelectorAll('select, input, .macro-rule-compare').forEach(field => {
      field.disabled = disabled;
      // La liste avec recherche ne lit l'état grisé de son <select> masqué qu'à sa demande (aucun évènement ne le lui dit).
      if (field.tagName === 'SELECT') SearchSelect.sync(field);
    });
  }

  // Sur une colonne Oui / Non, seuls « = », « ≠ », « vide » et « non vide » ont un sens : compareValues (js/condition-rules.js) lit les autres en
  // texte, donc « > » et « ≥ » retiennent toutes les lignes et « < », « ≤ » et « contient » aucune, sans message. Ces cinq lignes sont grisées,
  // jamais retirées ; l'opérateur déjà choisi reste affiché même grisé : une règle n'est jamais réécrite à la place de l'utilisateur.
  const BOOL_MEANINGLESS_OPERATORS = ['>', '<', '≥', '≤', 'contient'];
  function syncOperatorOptions(operatorSelect, columnType) {
    const bool = String(columnType || '') === 'Bool';
    Array.from(operatorSelect.options).forEach(option => { option.disabled = bool && BOOL_MEANINGLESS_OPERATORS.indexOf(option.value) !== -1; });
  }

  function buildCompareButton() {
    // Le bouton qui fait passer le champ Valeur de « une valeur saisie » à « une autre colonne de la même ligne », et inversement. Un bouton à deux
    // états (aria-pressed, enfoncé = on compare à une colonne) dont le nom ne change pas : c'est l'état qui le dit.
    const label = I18n.t('macro.modal.compareToColumn');
    const button = Dom.button('macro-rule-compare');
    button.innerHTML = Icons.svg('compareColumns');
    button.title = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  function buildOtherColumnField(rule, options, valueHint) {
    // Le champ Valeur d'une règle qui compare à une autre colonne : la même liste avec recherche que celle de la colonne de la règle (buildColumnField, qui
    // range le choix dans `rule.valueColumn`), avec les mêmes colonnes et la même clé de correspondance pour une table pas encore liée. Seul son
    // avertissement « absente de la ligne affichée » est dit, dans `valueHint`, sous la règle ; `options.onValueColumnResolved(table)` y affiche le
    // lien de sa table.
    const onChosen = (type, colId, table) => { if (options.onValueColumnResolved) options.onValueColumnResolved(table, colId, type); };
    const field = buildColumnField(rule, onChosen, Object.assign({}, options, { property: 'valueColumn', typeHint: valueHint, warningOnly: true }));
    return field.wrap;
  }

  function buildConditionFields(rule, options) {
    // Le champ Valeur est reconstruit à chaque changement de colonne (fillValueSlot) : son type, liste ou texte, dépend de celui de la colonne.
    // buildColumnField appelle renderValue tout de suite pour la colonne déjà enregistrée : valueSlot et operatorSelect doivent donc exister avant lui.
    // `options` : transmis à buildColumnField, plus { onColumnResolved(table, colonne, type) } appelé à la construction puis à chaque colonne adoptée
    // (la fenêtre de condition y affiche le lien de la table). `typeHint` est à placer par l'appelant en dernier enfant de sa ligne (voir
    // buildColumnField).
    // { compareColumn: true } (la fenêtre de condition d'une bulle, d'un bloc, d'une valeur ou d'une case) ajoute, dans le champ Valeur, le bouton
    // « autre colonne » (buildCompareButton) : enfoncé, la règle compare la colonne à une autre colonne de la même ligne (`rule.valueColumn`, choisie
    // dans la même liste avec recherche ; js/condition-rules.js:compareOperands) au lieu d'une valeur saisie, qui reste là pour quand on revient. Les
    // macro-modèles, « Modèle selon la ligne » et le filtre d'une boucle ne le demandent pas : leur évaluation ne lit qu'une valeur saisie. Il rend
    // alors aussi `valueHint`, la ligne d'indication de l'autre colonne, à placer sous celle de la colonne, et `options.onValueColumnResolved(table)`
    // est appelé quand l'autre colonne change (le lien de sa table).
    const compare = !!(options && options.compareColumn);
    const valueSlot = el('span', 'macro-rule-value-slot');
    const operatorSelect = el('select');
    const compareButton = compare ? buildCompareButton() : null;
    const valueHint = compare ? el('span', 'macro-rule-column-type') : null;
    if (valueHint) valueHint.hidden = true;
    let columnType = null;
    let columnId = null;
    let columnTable = null;
    function fillValueSlot() {
      // La valeur saisie (liste ou texte selon la colonne) ou, en mode « autre colonne », la liste des colonnes ; le bouton reste le même élément, il
      // garde donc son focus au clavier.
      const otherColumn = compare && ConditionRules.inColumnMode(rule);
      if (valueHint && !otherColumn) {
        valueHint.textContent = '';
        valueHint.hidden = true;
        if (options.onValueColumnResolved) options.onValueColumnResolved(null);
      }
      const field = otherColumn ? buildOtherColumnField(rule, options, valueHint) : buildValueField(rule, columnType, columnId, columnTable);
      valueSlot.replaceChildren(...(compare ? [compareButton, field] : [field]));
      valueSlot.classList.toggle('has-compare', compare);
      if (compare) {
        compareButton.classList.toggle('is-on', otherColumn);
        compareButton.setAttribute('aria-pressed', otherColumn ? 'true' : 'false');
      }
      syncValueDisabled(valueSlot, operatorSelect.value || rule.operator || '=');
    }
    function renderValue(type, colId, table) {
      columnType = type;
      columnId = colId;
      columnTable = table;
      syncOperatorOptions(operatorSelect, type);
      fillValueSlot();
      if (options && options.onColumnResolved) options.onColumnResolved(table, colId, type);
    }

    const columnField = buildColumnField(rule, renderValue, options);

    ConditionRules.OPERATORS.forEach(op => operatorSelect.appendChild(Dom.option(op, op)));
    operatorSelect.value = rule.operator || '=';
    // La 1re colonne a été rendue avant que les options existent : on grise maintenant, une fois l'opérateur enregistré choisi.
    syncOperatorOptions(operatorSelect, columnType);
    syncValueDisabled(valueSlot, operatorSelect.value);
    operatorSelect.addEventListener('change', () => { rule.operator = operatorSelect.value; syncValueDisabled(valueSlot, operatorSelect.value); });
    if (compareButton) {
      // Comme la valeur saisie, qui reste dans la règle pendant qu'on compare à une colonne, l'autre colonne choisie est gardée par la ligne tant qu'on est en mode
      // « valeur » : un second clic sur le bouton, fait par erreur ou pour y regarder, la retrouve au lieu d'un champ vide.
      let rememberedColumn = '';
      compareButton.addEventListener('click', () => {
        if (ConditionRules.inColumnMode(rule)) { rememberedColumn = rule.valueColumn; delete rule.valueColumn; } else rule.valueColumn = rememberedColumn;
        fillValueSlot();
        compareButton.focus();
        // Aucun champ n'a parlé : la fenêtre relance son aperçu sur ce `change`, comme à toute saisie dans une règle.
        valueSlot.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    return { columnWrap: columnField.wrap, operatorSelect, valueSlot, typeHint: columnField.typeHint, valueHint };
  }

  // Une règle sans colonne, telle que « + Ajouter une condition » la pose.
  const emptyRule = () => ({ column: '', operator: '=', value: '' });

  function buildRuleRow(rule, index, { mode, options, onRemove, extra = [] }) {
    // La ligne d'une règle de la condition d'une bulle ou du filtre d'une boucle (js/variable-condition.js, js/variable-loop.js), en une seule ligne :
    // le connecteur (« Si », puis « et » ou « ou » selon `mode`), la colonne, l'opérateur, la valeur, la croix qui retire la règle (`onRemove`), puis
    // l'indication de type (puis celle de l'autre colonne, quand la règle peut en comparer une) et les nœuds `extra` : en dernier, pour la raison donnée à
    // buildTemplateRule. `options` : celles de buildConditionFields.
    const connectorKey = index === 0 ? 'macro.modal.ruleIf' : (mode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd');
    const fields = buildConditionFields(rule, options);
    const remove = el('button', 'macro-rule-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', I18n.t('varCond.removeRule'));
    remove.title = I18n.t('varCond.removeRule');
    remove.addEventListener('click', onRemove);
    const row = el('div', 'macro-rule-row');
    row.append(el('span', 'macro-rule-connector', I18n.t(connectorKey)), fields.columnWrap, fields.operatorSelect, fields.valueSlot, remove, fields.typeHint,
      ...(fields.valueHint ? [fields.valueHint] : []), ...extra);
    return row;
  }

  function buildAddRuleButton(box, rules, redraw) {
    // « + Ajouter une condition » : ajoute une règle vide à `rules`, `redraw` redessine la fenêtre, puis la colonne de la dernière ligne de `box` prend
    // le focus.
    const button = el('button', 'var-condition-add', I18n.t('varCond.addRule'));
    button.type = 'button';
    button.addEventListener('click', () => {
      rules.push(emptyRule());
      redraw();
      const selects = box.querySelectorAll('select.macro-rule-column:not(.macro-rule-value-column)');
      if (selects.length) selects[selects.length - 1].focus();
    });
    return button;
  }

  // Options de buildConditionFields pour une règle « condition → modèle » : la colonne se choisit dans une seule liste avec recherche qui réunit
  // celles de toutes les tables, à la suite et sans groupes (celles de la page en nom nu, les autres en « Table.Colonne »). Choisir une colonne d'une
  // table pas encore liée ouvre la fenêtre de choix de la clé, qui l'enregistre ; Annuler remet la colonne précédente.
  const TEMPLATE_RULE_OPTIONS = { allTables: true, onColumnChosen: ref => ensureTableLinked(ref) };

  function buildTemplateRule(rule, { connector, templates, onRemove }) {
    // La règle « condition → modèle » des macro-modèles et du réglage « Selon la ligne », sur deux lignes (cinq contrôles sur une seule se
    // chevauchaient dans une fenêtre de 520 px : la liste des colonnes recouvrait l'opérateur) : `connector` (« Si », « Sinon si »), la colonne et
    // l'opérateur ; puis, sous la colonne, la valeur et, après une flèche, le modèle choisi parmi `templates`. La croix à droite retire la règle
    // (`onRemove`). La condition d'une bulle et le filtre d'une boucle gardent une seule ligne (buildRuleRow). Rend la ligne et la liste des modèles,
    // que l'appelant coiffe de sa liste avec recherche.
    const fields = buildConditionFields(rule, TEMPLATE_RULE_OPTIONS);
    const label = el('span', 'macro-rule-connector');
    label.textContent = connector;
    const arrow = el('span', 'macro-rule-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    const modeleSelect = el('select', 'macro-rule-modele');
    modeleSelect.append(Dom.option('', I18n.t('macro.modal.choosePlaceholder')), ...templates.map(t => Dom.option(String(t.id), t.nom)));
    modeleSelect.value = rule.modeleId != null ? String(rule.modeleId) : '';
    modeleSelect.addEventListener('change', () => { rule.modeleId = modeleSelect.value || null; });
    const lineOne = el('div', 'macro-rule-line');
    lineOne.append(label, fields.columnWrap, fields.operatorSelect);
    const lineTwo = el('div', 'macro-rule-line macro-rule-line-detail');
    lineTwo.append(fields.valueSlot, arrow, modeleSelect);
    const body = el('div', 'macro-rule-body');
    body.append(lineOne, lineTwo);
    const remove = el('button', 'macro-rule-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', I18n.t('macro.modal.removeRule'));
    remove.addEventListener('click', onRemove);
    // fields.typeHint vient en dernier : `.macro-rule-column-type` a flex-basis:100% (css/toolbar-v2.css), il prend toujours sa propre ligne en
    // pleine largeur de la règle, où qu'il soit dans le HTML ; dans le tiers de largeur de fields.columnWrap, l'avertissement « colonne absente »
    // écrasait le reste de la ligne.
    const row = el('div', 'macro-rule-row');
    row.append(body, remove, fields.typeHint);
    return { row, modeleSelect };
  }

  return { appendColumnOption, ensureTableLinked, emptyRule, buildRuleRow, buildAddRuleButton, buildTemplateRule };
})();
