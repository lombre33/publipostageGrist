// Champs d'une règle « Colonne / Opérateur / Valeur » (+ indication de type) - partagés entre la fenêtre des macro-modèles (js/macro-editor.js) et celle
// des variables conditionnelles (maquette du 2026-09-28). Déplacés tel quel depuis js/macro-editor.js (mêmes classes .macro-rule-*, donc mêmes styles de
// css/toolbar-v2.css et mêmes sélecteurs dans dev-tests/scenarios-macro-modeles.js) pour qu'il n'en existe jamais deux copies. Chaque champ mute `rule`
// en place ; la fenêtre appelante décide seule quand l'enregistrer. Opérateurs : ConditionRules.OPERATORS (js/condition-rules.js, chargé avant).
const ConditionFields = (function () {
  // Colonnes de la table Grist courante (celle du Select By, demande d'Antoine 2026-09-28 : "que le champ ... soit une liste des colonnes de la page
  // sur laquelle est le widget" - liste toujours à jour, pas un texte libre où un id de colonne mal recopié cassait silencieusement la condition sans
  // aucun message d'erreur). GristAPI.getColumns/getCurrentTableId (js/grist-api.js) - déjà utilisés ailleurs (ex. l'insertion #Variable).
  function currentTableColumns() {
    const tableId = GristAPI.getCurrentTableId();
    return tableId ? GristAPI.getColumns(tableId) : [];
  }

  // Libellé du type Grist affiché en petit à côté du champ colonne - aide à comprendre le format attendu dans le champ valeur (ex. Antoine, 2026-09-28,
  // condition sans effet sur une colonne Date : la valeur saisie n'était jamais dans le même format que ce que Grist renvoie réellement).
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

  // Remplace l'ancien <input type="text"> libre par un <select> des colonnes réelles de la table courante, plus une option "avancé" qui révèle un champ
  // texte pour le cas rare cross-table ("Table.Colonne", cf. js/condition-rules.js:parseColumnRef) - jamais retiré, pour ne pas régresser sur une
  // capacité déjà là (règle de non-régression du projet), juste sorti du chemin principal. `onTypeChange(type)` : notifie le champ valeur du type Grist
  // de la colonne choisie (ou null), pour adapter son placeholder - le format attendu (ex. une date) est précisément ce qu'Antoine n'arrivait pas à
  // deviner (2026-09-28). Renvoie `{ wrap, typeHint }` (pas juste un élément) : `typeHint` doit être placé par l'appelant en dehors de `wrap`, cf. son
  // commentaire plus bas.
  function buildColumnField(rule, onTypeChange) {
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-column-wrap';

    const select = document.createElement('select');
    select.className = 'macro-rule-column';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = I18n.t('macro.modal.columnChoosePlaceholder');
    select.appendChild(empty);
    const cols = currentTableColumns();
    cols.forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      select.appendChild(o);
    });
    const advancedOpt = document.createElement('option');
    advancedOpt.value = ADVANCED_COLUMN_VALUE;
    advancedOpt.textContent = I18n.t('macro.modal.columnAdvanced');
    select.appendChild(advancedOpt);

    const advancedInput = document.createElement('input');
    advancedInput.type = 'text';
    advancedInput.className = 'macro-rule-column-advanced';
    advancedInput.placeholder = I18n.t('macro.modal.columnAdvancedPlaceholder');

    const typeHint = document.createElement('span');
    typeHint.className = 'macro-rule-column-type';

    // Avertissement visible si la colonne choisie est absente de la ligne actuellement affichée dans le widget (record) : cause probable, colonne pas
    // cochée dans le panneau de droite DE CE WIDGET (grist.onRecord ne la transmet alors pas, même avec un accès complet) - exactement le bug Choice
    // d'Antoine du 2026-09-28, dont la règle "=" échouait sans aucune explication (cf. js/grist-api.js:includeColumns et js/condition-rules.js:
    // matches pour le même garde-fou côté log). Sans ce signal, rien à l'écran n'indique que la règle ne PEUT pas fonctionner tant que la colonne
    // n'est pas cochée là-bas.
    function updateTypeHint() {
      const tableId = GristAPI.getCurrentTableId();
      const col = select.value === ADVANCED_COLUMN_VALUE ? null : select.value;
      const type = (col && tableId) ? GristAPI.getColumnType(tableId, col) : null;
      const record = col ? GristAPI.getCurrentRecord() : null;
      const missingFromRecord = !!(col && record && !(col in record));
      typeHint.textContent = missingFromRecord ? I18n.t('macro.modal.columnMissingFromRecord') : (type ? friendlyTypeLabel(type) : '');
      typeHint.classList.toggle('is-warning', missingFromRecord);
      if (onTypeChange) onTypeChange(type, col);
    }

    const currentValue = rule.column || '';
    // Valeur déjà enregistrée qui ne correspond à aucune colonne de la liste (cross-table "Table.Colonne", ou colonne absente de la table courante) :
    // reprise telle quelle en saisie avancée, jamais silencieusement effacée ni remplacée par la première colonne venue.
    if (currentValue && cols.indexOf(currentValue) === -1) {
      select.value = ADVANCED_COLUMN_VALUE;
      advancedInput.value = currentValue;
      advancedInput.hidden = false;
    } else {
      select.value = currentValue;
      advancedInput.hidden = true;
    }
    updateTypeHint();

    select.addEventListener('change', () => {
      if (select.value === ADVANCED_COLUMN_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule.column = advancedInput.value;
      } else {
        advancedInput.hidden = true;
        rule.column = select.value;
      }
      updateTypeHint();
    });
    advancedInput.addEventListener('input', () => { rule.column = advancedInput.value; });

    wrap.appendChild(select);
    wrap.appendChild(advancedInput);
    // typeHint N'EST PLUS un enfant de `wrap` (donc plus soumis à sa largeur flex:1, ~1/3 de la ligne) :
    // l'avertissement "colonne absente" peut faire 400px+ dans une ligne de ~460px (mesuré par le
    // coordinateur, 2026-09-28) et écrasait tout le reste de la ligne (select réduit à 10px). L'appelant
    // (renderSlots) place `typeHint` en pleine largeur SOUS la ligne (cf. .macro-rule-column-type dans
    // css/toolbar-v2.css : flex-basis:100%, sur .macro-rule-row directement).
    return { wrap, typeHint };
  }

  function valuePlaceholderForType(type) {
    const t = String(type || '');
    if (t === 'Date' || t.indexOf('DateTime') === 0) return I18n.t('macro.modal.valuePlaceholderDate');
    if (t === 'Bool') return I18n.t('macro.modal.valuePlaceholderBool');
    return I18n.t('macro.modal.valuePlaceholder');
  }

  const ADVANCED_VALUE = '__advanced_value__';

  // Remplace le champ Valeur en texte libre par un <select> des choix réels (widgetOptions.choices, GristAPI.getColumnChoices) quand la colonne est de
  // type Choice/ChoiceList - même raison et même patron que buildColumnField pour la colonne : une valeur tapée à la main qui ne correspond pas
  // EXACTEMENT au choix stocké (casse, accent, espace) ne matche jamais, silencieusement (Antoine, 2026-09-28 : "colonne à choix unique, opérateur '='
  // ne fonctionne pas"). Repli sur le texte libre (placeholder adapté au type) pour tout le reste, et pour une colonne Choice/ChoiceList sans
  // widgetOptions.choices connu (colonne pas encore vue par refreshSchema, ou vidée) - jamais un champ qui disparaît.
  function buildValueField(rule, columnType, colId) {
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-value-wrap';
    const type = String(columnType || '');
    const tableId = GristAPI.getCurrentTableId();
    const choices = (type === 'Choice' || type === 'ChoiceList') && colId && tableId ? GristAPI.getColumnChoices(tableId, colId) : null;

    if (choices && choices.length) {
      const select = document.createElement('select');
      select.className = 'macro-rule-value';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = I18n.t('macro.modal.valueChoosePlaceholder');
      select.appendChild(empty);
      choices.forEach(ch => {
        const o = document.createElement('option');
        o.value = ch;
        o.textContent = ch;
        select.appendChild(o);
      });
      const advancedOpt = document.createElement('option');
      advancedOpt.value = ADVANCED_VALUE;
      advancedOpt.textContent = I18n.t('macro.modal.valueAdvanced');
      select.appendChild(advancedOpt);

      const advancedInput = document.createElement('input');
      advancedInput.type = 'text';
      advancedInput.className = 'macro-rule-value-advanced';
      advancedInput.placeholder = I18n.t('macro.modal.valuePlaceholder');

      const currentValue = rule.value || '';
      // Même garde qu'en colonne (buildColumnField) : une valeur déjà enregistrée qui ne correspond à aucun choix connu (choix retiré depuis côté Grist,
      // ou widgetOptions pas encore chargé au moment de la 1ère saisie) reste visible en saisie avancée, jamais silencieusement effacée.
      if (currentValue && choices.indexOf(currentValue) === -1) {
        select.value = ADVANCED_VALUE;
        advancedInput.value = currentValue;
        advancedInput.hidden = false;
      } else {
        select.value = currentValue;
        advancedInput.hidden = true;
      }

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

      wrap.appendChild(select);
      wrap.appendChild(advancedInput);
      return wrap;
    }

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'macro-rule-value';
    valInput.placeholder = valuePlaceholderForType(type);
    valInput.value = rule.value || '';
    valInput.addEventListener('input', () => { rule.value = valInput.value; });
    wrap.appendChild(valInput);
    return wrap;
  }

  // Le champ Valeur dépend du type de la colonne choisie (dropdown des vrais choix pour Choice/ChoiceList, placeholder adapté pour Date/Bool,
  // texte libre sinon - buildValueField) : reconstruit entièrement à chaque changement de colonne plutôt que de juste garder le même <input> et
  // en changer le placeholder, puisque le type de champ lui-même (select vs texte) peut changer. `valueSlot` doit exister AVANT buildColumnField :
  // celui-ci appelle son callback une 1ère fois de façon synchrone, pour la colonne déjà enregistrée de la règle.
  // `typeHint` est à placer par l'appelant en DERNIER enfant de sa ligne (cf. buildColumnField). Même ordre de construction qu'avant le déplacement.
  function buildConditionFields(rule) {
    const valueSlot = document.createElement('span');
    valueSlot.className = 'macro-rule-value-slot';
    function renderValue(type, colId) { valueSlot.replaceChildren(buildValueField(rule, type, colId)); }

    const columnField = buildColumnField(rule, (type, colId) => renderValue(type, colId));

    const operatorSelect = document.createElement('select');
    ConditionRules.OPERATORS.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; operatorSelect.appendChild(o); });
    operatorSelect.value = rule.operator || '=';
    operatorSelect.addEventListener('change', () => { rule.operator = operatorSelect.value; });

    return { columnWrap: columnField.wrap, operatorSelect, valueSlot, typeHint: columnField.typeHint };
  }

  return { friendlyTypeLabel, valuePlaceholderForType, buildColumnField, buildValueField, buildConditionFields };
})();
