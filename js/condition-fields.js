// Champs d'une règle « Colonne / Opérateur / Valeur » partagés par toutes les fenêtres de règles (macro-modèles, conditions, boucles) : mêmes classes
// .macro-rule-* (css/toolbar-v2.css), donc une seule copie des styles et des sélecteurs de test. Chaque champ mute `rule` en place ; l'appelant
// décide quand l'enregistrer.
const ConditionFields = (function () {
  // Colonnes de la table Grist courante (celle de la page où est le widget) : une liste toujours à jour, pas un texte libre où un id de colonne mal
  // recopié casserait la condition sans message. GristAPI.getColumns/getCurrentTableId (js/grist-api.js), déjà utilisés ailleurs (insertion d'une
  // #Variable).
  function currentTableColumns() {
    const tableId = GristAPI.getCurrentTableId();
    return tableId ? GristAPI.getColumns(tableId) : [];
  }

  // Type Grist affiché sous le champ colonne : il dit quel format saisir dans le champ valeur (une date, par exemple).
  function friendlyTypeLabel(type) {
    const t = String(type || '');
    if (t === 'Date') return I18n.t('macro.modal.typeDate');
    if (t.indexOf('DateTime') === 0) return I18n.t('macro.modal.typeDateTime');
    if (t === 'Bool') return I18n.t('macro.modal.typeBool');
    if (t.indexOf('Ref:') === 0 || t.indexOf('RefList:') === 0) return I18n.t('macro.modal.typeRef');
    if (t === 'Numeric' || t === 'Int') return I18n.t('macro.modal.typeNumeric');
    if (t === 'Choice' || t === 'ChoiceList') return I18n.t('macro.modal.typeChoice');
    return '';
  }

  const ADVANCED_COLUMN_VALUE = '__advanced__';

  // Une colonne de la liste : `value` est « Colonne » (table de la page) ou « Table.Colonne », et c'est aussi son nom à l'écran. Le type Grist en est
  // l'indice dans la liste avec recherche (« Date de début (date) »), qui permet de chercher « date » ; le texte de l'<option>, « nom (indice) »,
  // sert à la liste native de repli. Exportée : le tri d'une boucle (js/variable-loop.js) liste ses colonnes pareil.
  function appendColumnOption(parent, value, table, column) {
    const o = document.createElement('option');
    const hint = friendlyTypeLabel(GristAPI.getColumnType(table, column));
    o.value = value;
    o.textContent = hint ? value + ' (' + hint + ')' : value;
    o.dataset.name = value;
    if (hint) o.dataset.hint = hint;
    parent.appendChild(o);
  }
  // Une seule liste à plat, sans groupes : les colonnes de la table de la page en tête et en valeur nue, celles des autres tables en
  // « Table.Colonne » (parseColumnRef), si bien que la table se cherche avec le nom de la colonne. Une colonne d'une table pas encore liée se choisit
  // quand même : l'appelant demande alors la clé du lien (options.onColumnChosen).
  function appendAllTablesOptions(select, currentTableId) {
    const tables = GristAPI.getTables().slice();
    const ordered = currentTableId && tables.indexOf(currentTableId) !== -1 ? [currentTableId].concat(tables.filter(t => t !== currentTableId)) : tables;
    ordered.forEach(table => {
      // Sans les colonnes d'aide « gristHelper_… » (valeur affichée d'une Référence) : la Référence se compare déjà à sa valeur affichée
      // (js/variables.js:cellValue).
      GristAPI.getColumns(table).filter(c => c.indexOf('gristHelper_') !== 0)
        .forEach(c => appendColumnOption(select, table === currentTableId ? c : table + '.' + c, table, c));
    });
  }

  // Avant d'adopter une colonne d'une table pas encore liée à celle de la page, la fenêtre de choix de la clé s'ouvre
  // (js/variables.js:ensureLinkConfigured). Rend `true` tout de suite quand il n'y a rien à demander (colonne de la page ou table déjà liée), sinon
  // une promesse : vraie si le lien est enregistré, fausse si le choix est annulé (options.onColumnChosen remet alors la colonne précédente).
  function ensureTableLinked(ref) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!ref || !ref.table || !currentTableId || ref.table === currentTableId) return true;
    if (GristAPI.getLinkRule(ref.table)) return true;
    return Variables.ensureLinkConfigured({ table: ref.table });
  }

  // Liste des colonnes réelles, plus une option « avancé » (jamais retirée) qui révèle un champ texte pour une colonne absente de la liste
  // (« Table.Colonne », js/condition-rules.js:parseColumnRef). `onTypeChange(type, colonne, table)` prévient le champ Valeur de la colonne choisie,
  // pour son placeholder et ses choix. Renvoie `{ wrap, typeHint }` : l'appelant place `typeHint` hors de `wrap` (voir plus bas). `options` :
  // { allTables: true } liste les colonnes de toutes les tables (appendAllTablesOptions) ; { onColumnChosen(ref, value) } est appelé avant d'adopter
  // une colonne de la liste : `true` l'adopte tout de suite, une promesse qui ne résout pas vrai remet la colonne précédente ; { table } (boucle,
  // js/variable-loop.js) liste les colonnes de cette seule table, en valeur nue, car le filtre d'une boucle lit la table parcourue
  // (js/loop-rules.js:ruleHolds). Sans options : les colonnes de la page seule.
  function buildColumnField(rule, onTypeChange, options) {
    const opts = options || {};
    const baseTable = () => opts.table || GristAPI.getCurrentTableId();
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-column-wrap';

    const select = document.createElement('select');
    select.className = 'macro-rule-column';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = I18n.t('macro.modal.columnChoosePlaceholder');
    select.appendChild(empty);
    if (opts.table) GristAPI.getColumns(opts.table).filter(c => c.indexOf('gristHelper_') !== 0).forEach(c => appendColumnOption(select, c, opts.table, c));
    else if (opts.allTables) appendAllTablesOptions(select, GristAPI.getCurrentTableId());
    else { const tableId = GristAPI.getCurrentTableId(); currentTableColumns().forEach(c => appendColumnOption(select, c, tableId, c)); }
    const listed = Array.from(select.querySelectorAll('option')).map(o => o.value).filter(Boolean);
    const advancedOpt = document.createElement('option');
    advancedOpt.value = ADVANCED_COLUMN_VALUE;
    advancedOpt.textContent = I18n.t('macro.modal.columnAdvanced');
    advancedOpt.dataset.pinned = 'true'; // liste avec recherche : jamais filtrée, toujours en bas
    select.appendChild(advancedOpt);

    const advancedInput = document.createElement('input');
    advancedInput.type = 'text';
    advancedInput.className = 'macro-rule-column-advanced';
    advancedInput.placeholder = I18n.t('macro.modal.columnAdvancedPlaceholder');

    const typeHint = document.createElement('span');
    typeHint.className = 'macro-rule-column-type';

    // Avertissement si la colonne choisie est absente de la ligne affichée (record) : probablement une colonne non cochée dans le panneau de droite
    // du widget, que grist.onRecord ne transmet pas (js/grist-api.js:includeColumns), si bien qu'une règle « = » échouerait sans rien dire
    // (js/condition-rules.js:matches le signale aussi dans le journal). Seule la table de la page est concernée : c'est la seule que grist.onRecord
    // transmet.
    function updateTypeHint() {
      const tableId = GristAPI.getCurrentTableId();
      const value = select.value === ADVANCED_COLUMN_VALUE ? null : select.value;
      const ref = value ? ConditionRules.parseColumnRef(value, baseTable()) : null;
      const col = ref ? ref.column : null;
      const table = ref ? ref.table : null;
      const type = (col && table) ? GristAPI.getColumnType(table, col) : null;
      const record = (col && table === tableId) ? GristAPI.getCurrentRecord() : null;
      const missingFromRecord = !!(col && record && !(col in record));
      typeHint.textContent = missingFromRecord ? I18n.t('macro.modal.columnMissingFromRecord') : (type ? friendlyTypeLabel(type) : '');
      typeHint.classList.toggle('is-warning', missingFromRecord);
      if (onTypeChange) onTypeChange(type, col, table);
    }

    const currentValue = rule.column || '';
    // Valeur enregistrée absente de la liste (« Table.Colonne » d'une autre table, colonne disparue) : reprise telle quelle en saisie avancée, jamais
    // effacée en silence.
    if (currentValue && listed.indexOf(currentValue) === -1) {
      select.value = ADVANCED_COLUMN_VALUE;
      advancedInput.value = currentValue;
      advancedInput.hidden = false;
    } else {
      select.value = currentValue;
      advancedInput.hidden = true;
    }
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
      rule.column = value;
      adoptedSelectValue = value;
      updateTypeHint();
    }
    select.addEventListener('change', () => {
      if (select.value === ADVANCED_COLUMN_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule.column = advancedInput.value;
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
    advancedInput.addEventListener('input', () => { rule.column = advancedInput.value; });

    wrap.appendChild(select);
    wrap.appendChild(advancedInput);
    // L'indice de type est dit dans la liste ouverte, pas dans le champ fermé : il reste sous le champ (typeHint). Si le composant échoue, le
    // <select> natif reste affiché.
    try { search = SearchSelect.attachColumns(select, { inline: true, hintInTrigger: false }); }
    catch (e) { console.warn('[ConditionFields] recherche de colonne indisponible, liste native conservée', e); }
    // typeHint reste hors de `wrap` (largeur flex:1, un tiers de la ligne) : l'avertissement « colonne absente », long, écraserait le reste de la
    // ligne. L'appelant le place en pleine largeur sous la ligne (.macro-rule-column-type, css/toolbar-v2.css : flex-basis:100%).
    return { wrap, typeHint };
  }

  // Texte du champ Valeur libre selon le type de la colonne (une date se tape dans un format précis). Une colonne Oui / Non n'a pas de champ libre :
  // buildBoolList.
  function valuePlaceholderForType(type) {
    const t = String(type || '');
    if (t === 'Date' || t.indexOf('DateTime') === 0) return I18n.t('macro.modal.valuePlaceholderDate');
    return I18n.t('macro.modal.valuePlaceholder');
  }

  const ADVANCED_VALUE = '__advanced_value__';

  function valueOption(value, text) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }

  // Champ Valeur en texte libre (colonne sans valeurs à proposer, et repli si la liste ne peut pas se remplir) ; placeholder adapté au type (date).
  function buildValueText(rule, type) {
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'macro-rule-value';
    valInput.placeholder = valuePlaceholderForType(type);
    valInput.value = rule.value || '';
    valInput.addEventListener('input', () => { rule.value = valInput.value; });
    return valInput;
  }

  // Champ Valeur en liste des valeurs possibles, posé dans `wrap` : un <select> (source de la valeur) dont la dernière option « Autre valeur… »
  // révèle un champ texte, coiffé de la liste avec recherche (js/search-select.js). Renvoie `fill(valeurs)` (choix d'une colonne Choix tout de suite,
  // valeurs de la table liée à leur arrivée), `showLoading()` (texte d'attente) et `toText()` (retour au texte libre).
  function buildValueList(rule, wrap, type) {
    const select = document.createElement('select');
    select.className = 'macro-rule-value';
    const advancedInput = document.createElement('input');
    advancedInput.type = 'text';
    advancedInput.className = 'macro-rule-value-advanced';
    advancedInput.placeholder = I18n.t('macro.modal.valuePlaceholder');
    advancedInput.hidden = true;
    wrap.appendChild(select);
    wrap.appendChild(advancedInput);

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

    let search = null;
    try { search = SearchSelect.attachValues(select, { inline: true }); }
    catch (e) { console.warn('[ConditionFields] recherche de valeur indisponible, liste native conservée', e); }

    // Le panneau ouvert lit ses lignes à l'ouverture : celui qu'on ouvre pendant la lecture n'aurait que l'attente, on le referme au retour.
    function refresh() {
      if (!search) return;
      if (search.isOpen()) search.close(false);
      search.sync();
    }
    return {
      showLoading() {
        select.textContent = '';
        select.appendChild(valueOption('', I18n.t('macro.modal.valueLoading')));
        refresh();
      },
      fill(values) {
        select.textContent = '';
        select.appendChild(valueOption('', I18n.t('macro.modal.valueChoosePlaceholder')));
        values.forEach(v => select.appendChild(valueOption(v, v)));
        const advancedOpt = valueOption(ADVANCED_VALUE, I18n.t('macro.modal.valueAdvanced'));
        advancedOpt.dataset.pinned = 'true'; // liste avec recherche : jamais filtrée, toujours en bas
        select.appendChild(advancedOpt);
        // Même garde qu'en colonne : une valeur enregistrée que la liste ne connaît plus (choix retiré, ligne supprimée de la table liée) reste
        // visible en « Autre valeur… ».
        const currentValue = rule.value == null ? '' : String(rule.value);
        if (currentValue && values.indexOf(currentValue) === -1) {
          select.value = ADVANCED_VALUE;
          advancedInput.value = currentValue;
          advancedInput.hidden = false;
        } else {
          select.value = currentValue;
          advancedInput.hidden = true;
        }
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

  // Champ Valeur d'une colonne Oui / Non : une liste de deux mots, sans saisie libre (un mot tapé de travers ne correspondrait à rien, sans message).
  // Les mots sont ceux que la comparaison lit (ConditionRules.parseBoolExpected), dans la langue de l'interface. Une valeur déjà enregistrée garde sa
  // forme tant qu'on n'y touche pas (« vrai » ou « yes » s'affichent « Oui » sans réécrire la règle) ; une valeur que la comparaison ne lit pas reste
  // visible en dernière ligne avec « valeur non reconnue », jamais effacée en silence, et sort de la liste dès qu'on choisit Oui ou Non.
  function buildBoolList(rule, wrap) {
    const select = document.createElement('select');
    select.className = 'macro-rule-value';
    const yes = I18n.t('macro.modal.valueBoolYes');
    const no = I18n.t('macro.modal.valueBoolNo');
    select.appendChild(valueOption('', I18n.t('macro.modal.valueChoosePlaceholder')));
    select.appendChild(valueOption(yes, yes));
    select.appendChild(valueOption(no, no));
    const saved = rule.value == null ? '' : String(rule.value);
    const word = ConditionRules.parseBoolExpected(saved);
    let unrecognized = null;
    if (saved.trim() !== '' && word === null) {
      const hint = I18n.t('macro.modal.valueUnrecognized');
      unrecognized = valueOption(saved, saved + ' (' + hint + ')');
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
    try { SearchSelect.attachValues(select, { inline: true }); }
    catch (e) { console.warn('[ConditionFields] recherche de valeur indisponible, liste native conservée', e); }
  }

  // Champ Valeur selon la colonne choisie : une liste avec recherche des valeurs possibles quand elle en propose (une valeur tapée à la main qui
  // diffère d'une casse, d'un accent ou d'un espace ne correspondrait jamais, sans message), sinon un texte libre. Sources : les choix d'une colonne
  // Choice/ChoiceList (GristAPI.getColumnChoices), tout de suite ; les valeurs affichées de la table liée pour une Référence ou une liste de
  // références (GristAPI.getReferenceValues), lues de façon asynchrone sous « Chargement… ». « Autre valeur… » garde la saisie libre d'une valeur
  // hors liste ; une table liée illisible ou vide, ou une colonne sans valeur connue (Référence qui montre l'id de la ligne ou une date), retombe sur
  // le texte libre : jamais un champ qui disparaît. Une colonne Oui / Non a sa liste Oui / Non (buildBoolList). `table` : table de la colonne (celle
  // de la page par défaut).
  function buildValueField(rule, columnType, colId, table) {
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-value-wrap';
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

    if ((type.indexOf('Ref:') === 0 || type.indexOf('RefList:') === 0) && colId && tableId && GristAPI.getReferenceColumn(tableId, colId)) {
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
  // reste si l'on revient à un autre opérateur.
  const VALUELESS_OPERATORS = ['vide', 'non vide'];
  function syncValueDisabled(valueSlot, operator) {
    const disabled = VALUELESS_OPERATORS.indexOf(operator) !== -1;
    valueSlot.classList.toggle('is-disabled', disabled);
    valueSlot.querySelectorAll('select, input').forEach(el => {
      el.disabled = disabled;
      // La liste avec recherche ne lit l'état grisé de son <select> masqué qu'à sa demande (aucun évènement ne le lui dit).
      if (el.tagName === 'SELECT' && typeof SearchSelect !== 'undefined') SearchSelect.sync(el);
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

  // Le champ Valeur est reconstruit à chaque changement de colonne (renderValue) : son type, liste ou texte, dépend de celui de la colonne.
  // buildColumnField appelle renderValue tout de suite pour la colonne déjà enregistrée : valueSlot et operatorSelect doivent donc exister avant lui.
  // `options` : transmis à buildColumnField, plus { onColumnResolved(table, colonne, type) } appelé à la construction puis à chaque colonne adoptée
  // (la fenêtre de condition y affiche le lien de la table). `typeHint` est à placer par l'appelant en dernier enfant de sa ligne (voir
  // buildColumnField).
  function buildConditionFields(rule, options) {
    const valueSlot = document.createElement('span');
    valueSlot.className = 'macro-rule-value-slot';
    const operatorSelect = document.createElement('select');
    let columnType = null;
    function renderValue(type, colId, table) {
      columnType = type;
      syncOperatorOptions(operatorSelect, type);
      valueSlot.replaceChildren(buildValueField(rule, type, colId, table));
      syncValueDisabled(valueSlot, operatorSelect.value || rule.operator || '=');
      if (options && options.onColumnResolved) options.onColumnResolved(table, colId, type);
    }

    const columnField = buildColumnField(rule, (type, colId, table) => renderValue(type, colId, table), options);

    ConditionRules.OPERATORS.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; operatorSelect.appendChild(o); });
    operatorSelect.value = rule.operator || '=';
    // La 1re colonne a été rendue avant que les options existent : on grise maintenant, une fois l'opérateur enregistré choisi.
    syncOperatorOptions(operatorSelect, columnType);
    syncValueDisabled(valueSlot, operatorSelect.value);
    operatorSelect.addEventListener('change', () => { rule.operator = operatorSelect.value; syncValueDisabled(valueSlot, operatorSelect.value); });

    return { columnWrap: columnField.wrap, operatorSelect, valueSlot, typeHint: columnField.typeHint };
  }

  return { friendlyTypeLabel, appendColumnOption, ensureTableLinked, valuePlaceholderForType, buildColumnField, buildValueField, buildConditionFields };
})();
