// Fenêtre « Condition d'affichage » : ses données et son résumé - les phrases de la fenêtre selon le nœud qui porte la condition (TEXTS), les champs de son « Sinon afficher »
// (TEXT_OTHERWISE) et le résumé d'une condition sur une ligne (conditionSummary). Rien d'une fenêtre ouverte : des tables et une fonction pure. Façade : js/variable-condition.js.
const VariableConditionData = (function () {
  const { shorten } = VariableModal;

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
      notMetOtherwise: 'varCond.debug.currentNotMetBlockOtherwise',
      unwrap: { label: 'varCond.unwrapBlock', title: 'varCond.unwrapBlockTitle', lost: 'varCond.unwrapLostBlock' },
    },
    conditionalValue: {
      title: 'varCond.title', intro: 'varCond.introValue', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLostValue', pasted: 'varCond.clip.pastedStatusValue',
      met: 'varCond.debug.currentMetValue', notMet: 'varCond.debug.currentNotMetValue', first: 'varCond.debug.firstBlock',
      notMetOtherwise: 'varCond.debug.currentNotMetValueOtherwise',
      unwrap: { label: 'varCond.unwrapValue', title: 'varCond.unwrapValueTitle', lost: 'varCond.unwrapLostValue' },
    },
    // L'image d'une colonne Pièces jointes (barre de l'image, js/floating-toolbars.js) : comme un bloc, sans sinon ni « Défaire » - l'image disparaît en lecture quand la condition
    // n'est pas remplie.
    editorImage: {
      title: 'varCond.title', intro: 'varCond.introImage', modeBefore: 'varCond.modeBefore', saveLost: 'varCond.saveLostImage', pasted: 'varCond.clip.pastedStatusImage',
      met: 'varCond.debug.currentMetImage', notMet: 'varCond.debug.currentNotMetImage', first: 'varCond.debug.firstBlock',
    },
    conditionalCheckbox: {
      title: 'varCond.titleCheckbox', intro: 'varCond.introCheckbox', modeBefore: 'varCond.modeBeforeCheckbox', saveLost: 'varCond.saveLostCheckbox',
      pasted: 'varCond.clip.pastedStatusCheckbox', met: 'varCond.debug.currentMetCheckbox', notMet: 'varCond.debug.currentNotMetCheckbox', first: 'varCond.debug.firstBlock',
    },
  };

  // Les nœuds dont le sinon est un champ de texte et de variables (js/conditional-text.js:otherwiseText, js/variable-otherwise.js) : la bulle de variable et la valeur dans la
  // phrase, un champ d'une ligne, et le bloc de texte, un champ de plusieurs lignes dont chacune fait un paragraphe. `id`, `row` et `input` nomment le champ et sa ligne, en toutes
  // lettres pour que les règles de css/variable-actions.css se retrouvent dans le code (la bulle et la valeur ont le même aspect, donc les mêmes classes) ; `max` : les caractères
  // qu'il accepte (lus à la création de la fenêtre : ces modules se chargent après celui-ci) ; `title` et `placeholder` : ses phrases ; `keepSpaces` : les espaces des deux bouts
  // comptent (celles du sinon d'une bulle ou d'une valeur, écrit tel qu'il est tapé).
  const TEXT_OTHERWISE = {
    varBadge: {
      id: 'var-condition-otherwise-bubble', row: 'var-condition-otherwise-text-row', input: 'var-condition-otherwise-text-input', multiline: false, keepSpaces: true,
      max: () => VariableOtherwise.TEXT_MAX, title: 'varCond.otherwiseBubbleTitle', placeholder: 'varCond.otherwiseBubblePlaceholder',
    },
    conditionalValue: {
      id: 'var-condition-otherwise-text', row: 'var-condition-otherwise-text-row', input: 'var-condition-otherwise-text-input', multiline: false, keepSpaces: true,
      max: () => ConditionalValue.OTHERWISE_MAX, title: 'varCond.otherwiseTextTitle', placeholder: 'varCond.otherwiseTextPlaceholder',
    },
    conditionalText: {
      id: 'var-condition-otherwise-area', row: 'var-condition-otherwise-area-row', input: 'var-condition-otherwise-area-input', multiline: true, keepSpaces: false,
      max: () => ConditionalText.OTHERWISE_MAX, title: 'varCond.otherwiseBlockTitle', placeholder: 'varCond.otherwiseBlockPlaceholder',
    },
  };

  // « Statut = Urgent et VcContacts.Role = Avocat » : une condition sur une ligne, sans valeur pour « vide » / « non vide ». Une règle qui compare à une
  // autre colonne la nomme entre accolades, comme une colonne dans un calcul : « Montant = {Paye} », qui ne se lit pas comme la valeur « Paye ». Un groupe
  // s'écrit entre parenthèses : « Statut = Urgent et (Montant ≥ 100 ou Client = Dupont) » (sans elles quand il n'a qu'une ligne). Ce que « Coller » va poser
  // (info-bulle du bouton) et la condition que reprennent les attributs insérés (js/variable-linked-attrs.js), qui la donnent en entier (`full`) ; sinon coupée
  // à 110 caractères.
  function conditionSummary(condition, opts) {
    const ruleText = r => {
      const operator = r.operator || '=';
      const noValue = ConditionRules.VALUELESS_OPERATORS.indexOf(operator) !== -1 || (!ConditionRules.comparesColumn(r) && r.value == null);
      const shown = ConditionRules.comparesColumn(r) ? '{' + r.valueColumn + '}' : r.value;
      return (r.column + ' ' + operator + (noValue ? '' : ' ' + shown)).trim();
    };
    const itemsText = (mode, items) => {
      const glue = ' ' + I18n.t(mode === 'any' ? 'varCond.ruleOr' : 'varCond.ruleAnd').toLowerCase() + ' ';
      return items.map(item => {
        if (!ConditionRules.isGroup(item)) return ruleText(item);
        const inner = itemsText(item.mode, item.rules);
        return item.rules.length > 1 ? '(' + inner + ')' : inner;
      }).join(glue);
    };
    const text = itemsText(condition.mode, condition.rules);
    return opts && opts.full ? text : shorten(text, 110);
  }

  return { TEXTS, TEXT_OTHERWISE, conditionSummary };
})();
