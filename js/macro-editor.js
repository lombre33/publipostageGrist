// Écran de création dédié pour les macro modèles (planning/feature-macro-modeles.md) : une modale (même patron que #link-rules-modal/js/variables.js -
// liste dynamique de lignes avec ajout/suppression, plutôt qu'un nouveau mécanisme) pour composer une page de garde + des annexes conditionnelles, et un
// panneau résumé affiché à la place de l'éditeur TipTap quand un macro-modèle est le modèle courant (cf. js/main.js:loadMacroIntoEditor).
const MacroEditor = (function () {
  let editingId = null;
  // Copie de travail des slots conditionnels (le slot fixe "page de garde" est géré à part par #macro-editor-cover, cf. collectSlotsForSave) - jamais la
  // même référence que tpl.macroSlots.slots, pour ne modifier le modèle réellement enregistré qu'au clic sur "Enregistrer".
  let slots = [];

  const OPERATORS = ['=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide'];

  // Un macro-modèle ne peut pas se référencer lui-même ni un autre macro-modèle (pas d'imbrication - hors scope V1), ni un modèle email (pas un contenu
  // de page). Recalculé à chaque ouverture/rendu plutôt que mis en cache : la liste des modèles peut changer pendant que la modale est ouverte.
  function availableTemplates() {
    return Templates.getCached().filter(t => (t.typeModele || 'document') === 'document');
  }

  function modal() { return document.getElementById('macro-editor-modal'); }
  function nameInput() { return document.getElementById('macro-editor-name'); }
  function coverSelect() { return document.getElementById('macro-editor-cover'); }
  function slotsContainer() { return document.getElementById('macro-editor-slots'); }

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
  // texte pour le cas rare cross-table ("Table.Colonne", cf. js/macro-templates.js:parseColumnRef) - jamais retiré, pour ne pas régresser sur une
  // capacité déjà là (règle de non-régression du projet), juste sorti du chemin principal. `onTypeChange(type)` : notifie le champ valeur du type Grist
  // de la colonne choisie (ou null), pour adapter son placeholder - le format attendu (ex. une date) est précisément ce qu'Antoine n'arrivait pas à
  // deviner (2026-09-28).
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
    // d'Antoine du 2026-09-28, dont la règle "=" échouait sans aucune explication (cf. js/grist-api.js:includeColumns et js/macro-templates.js:
    // ruleMatches pour le même garde-fou côté log). Sans ce signal, rien à l'écran n'indique que la règle ne PEUT pas fonctionner tant que la colonne
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
    wrap.appendChild(typeHint);
    return wrap;
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

  function fillModeleSelect(select, selectedId, placeholderKey) {
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = I18n.t(placeholderKey);
    select.appendChild(empty);
    availableTemplates().forEach(t => {
      const opt = document.createElement('option');
      opt.value = String(t.id);
      opt.textContent = t.nom;
      select.appendChild(opt);
    });
    select.value = selectedId != null ? String(selectedId) : '';
  }

  function renderSlots() {
    const container = slotsContainer();
    if (!container) return;
    container.innerHTML = '';
    if (!slots.length) {
      const empty = document.createElement('div');
      empty.className = 'macro-slots-empty';
      empty.textContent = I18n.t('macro.modal.noSlots');
      container.appendChild(empty);
    }
    slots.forEach((slot, slotIndex) => {
      const card = document.createElement('div');
      card.className = 'macro-slot-card';

      const header = document.createElement('div');
      header.className = 'macro-slot-header';
      const title = document.createElement('span');
      title.className = 'macro-slot-title';
      title.textContent = I18n.t('macro.modal.annexeLabel', { n: slotIndex + 1 });
      const removeSlotBtn = document.createElement('button');
      removeSlotBtn.type = 'button';
      removeSlotBtn.className = 'macro-slot-remove';
      removeSlotBtn.setAttribute('aria-label', I18n.t('macro.modal.removeSlot'));
      removeSlotBtn.addEventListener('click', () => { slots.splice(slotIndex, 1); renderSlots(); });
      header.appendChild(title);
      header.appendChild(removeSlotBtn);
      card.appendChild(header);

      const rulesBox = document.createElement('div');
      rulesBox.className = 'macro-slot-rules';
      (slot.rules || []).forEach((rule, ruleIndex) => {
        const row = document.createElement('div');
        row.className = 'macro-rule-row';

        const connector = document.createElement('span');
        connector.className = 'macro-rule-connector';
        connector.textContent = I18n.t(ruleIndex === 0 ? 'macro.modal.ruleIf' : 'macro.modal.ruleOrIf');
        row.appendChild(connector);

        // Le champ Valeur dépend du type de la colonne choisie (dropdown des vrais choix pour Choice/ChoiceList, placeholder adapté pour Date/Bool,
        // texte libre sinon - buildValueField) : reconstruit entièrement à chaque changement de colonne plutôt que de juste garder le même <input> et
        // en changer le placeholder, puisque le type de champ lui-même (select vs texte) peut changer. `valueWrap` doit exister AVANT buildColumnField :
        // celui-ci appelle son callback une 1ère fois de façon synchrone, pour la colonne déjà enregistrée de la règle.
        const valueWrap = document.createElement('span');
        valueWrap.className = 'macro-rule-value-slot';
        function renderValue(type, colId) { valueWrap.replaceChildren(buildValueField(rule, type, colId)); }

        row.appendChild(buildColumnField(rule, (type, colId) => renderValue(type, colId)));

        const opSelect = document.createElement('select');
        OPERATORS.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; opSelect.appendChild(o); });
        opSelect.value = rule.operator || '=';
        opSelect.addEventListener('change', () => { rule.operator = opSelect.value; });
        row.appendChild(opSelect);
        row.appendChild(valueWrap);

        const arrow = document.createElement('span');
        arrow.className = 'macro-rule-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        row.appendChild(arrow);

        const modeleSelect = document.createElement('select');
        modeleSelect.className = 'macro-rule-modele';
        fillModeleSelect(modeleSelect, rule.modeleId, 'macro.modal.choosePlaceholder');
        modeleSelect.addEventListener('change', () => { rule.modeleId = modeleSelect.value || null; });
        row.appendChild(modeleSelect);

        const removeRuleBtn = document.createElement('button');
        removeRuleBtn.type = 'button';
        removeRuleBtn.className = 'macro-rule-remove';
        removeRuleBtn.setAttribute('aria-label', I18n.t('macro.modal.removeRule'));
        removeRuleBtn.addEventListener('click', () => { slot.rules.splice(ruleIndex, 1); renderSlots(); });
        row.appendChild(removeRuleBtn);

        rulesBox.appendChild(row);
      });
      card.appendChild(rulesBox);

      const addRuleBtn = document.createElement('button');
      addRuleBtn.type = 'button';
      addRuleBtn.className = 'macro-rule-add';
      addRuleBtn.textContent = I18n.t('macro.modal.addRule');
      addRuleBtn.addEventListener('click', () => {
        slot.rules = slot.rules || [];
        slot.rules.push({ column: '', operator: '=', value: '', modeleId: null });
        renderSlots();
      });
      card.appendChild(addRuleBtn);

      const sep = document.createElement('div');
      sep.className = 'macro-slot-sep';
      card.appendChild(sep);

      const defaultLabel = document.createElement('label');
      defaultLabel.className = 'macro-slot-default-label';
      defaultLabel.textContent = I18n.t('macro.modal.defaultLabel');
      card.appendChild(defaultLabel);
      const defaultSelect = document.createElement('select');
      defaultSelect.className = 'macro-slot-default-select';
      const skipOpt = document.createElement('option');
      skipOpt.value = '';
      skipOpt.textContent = I18n.t('macro.modal.defaultSkip');
      defaultSelect.appendChild(skipOpt);
      availableTemplates().forEach(t => {
        const o = document.createElement('option');
        o.value = String(t.id);
        o.textContent = I18n.t('macro.modal.defaultUse', { name: t.nom });
        defaultSelect.appendChild(o);
      });
      defaultSelect.value = slot.defaultModeleId != null ? String(slot.defaultModeleId) : '';
      defaultSelect.addEventListener('change', () => { slot.defaultModeleId = defaultSelect.value || null; });
      card.appendChild(defaultSelect);

      container.appendChild(card);
    });
  }

  function openModal(tpl) {
    editingId = tpl ? tpl.id : null;
    const existingSlots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    // Copie profonde : la modale ne doit jamais muter tpl.macroSlots tant que "Enregistrer" n'a pas été cliqué (Annuler doit tout jeter).
    slots = JSON.parse(JSON.stringify(existingSlots.filter(s => s.type === 'conditional')));
    const cover = existingSlots.find(s => s.type === 'fixed');
    if (nameInput()) nameInput().value = tpl ? tpl.nom : '';
    if (coverSelect()) fillModeleSelect(coverSelect(), cover ? cover.modeleId : null, 'macro.modal.choosePlaceholder');
    renderSlots();
    const m = modal();
    if (m) m.style.display = 'flex';
    if (nameInput()) nameInput().focus();
  }

  function closeModal() {
    const m = modal();
    if (m) m.style.display = 'none';
  }

  function collectSlotsForSave() {
    const result = [];
    const coverId = coverSelect() ? coverSelect().value : '';
    if (coverId) result.push({ type: 'fixed', modeleId: coverId });
    slots.forEach(slot => {
      const rules = (slot.rules || []).filter(r => r.column && r.modeleId);
      result.push({ type: 'conditional', rules, defaultModeleId: slot.defaultModeleId || null });
    });
    return { slots: result };
  }

  async function save(onSaved) {
    const nom = nameInput() ? nameInput().value.trim() : '';
    if (!nom) { alert(I18n.t('macro.modal.nameRequired')); return; }
    const macroSlots = collectSlotsForSave();
    try {
      const { id } = await Templates.save(editingId, nom, JSON.stringify(macroSlots), '', null, null, 'macro', null);
      closeModal();
      if (onSaved) await onSaved(id);
    } catch (e) {
      console.error('[MacroEditor] échec de l’enregistrement', e);
      alert(I18n.t('macro.modal.saveError'));
    }
  }

  // onSaved(id) : rappel de js/main.js pour rafraîchir la liste des modèles et recharger le macro-modèle enregistré - branché une seule fois à l'init,
  // même patron que les autres modales de ce fichier (js/main.js:wireLinkRulesModal).
  function wire(onSaved) {
    const addSlotBtn = document.getElementById('macro-editor-add-slot');
    if (addSlotBtn) addSlotBtn.addEventListener('click', () => {
      slots.push({ type: 'conditional', rules: [{ column: '', operator: '=', value: '', modeleId: null }], defaultModeleId: null });
      renderSlots();
    });
    const cancelBtn = document.getElementById('macro-editor-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    const saveBtn = document.getElementById('macro-editor-save');
    if (saveBtn) saveBtn.addEventListener('click', () => save(onSaved));
  }

  function describeSummary(tpl) {
    if (!tpl || !tpl.macroSlots || !Array.isArray(tpl.macroSlots.slots) || !tpl.macroSlots.slots.length) return I18n.t('macro.summary.empty');
    const cover = tpl.macroSlots.slots.find(s => s.type === 'fixed');
    const coverTpl = cover ? Templates.getCached().find(t => String(t.id) === String(cover.modeleId)) : null;
    const annexCount = tpl.macroSlots.slots.filter(s => s.type === 'conditional').length;
    return I18n.t('macro.summary.text', {
      cover: coverTpl ? coverTpl.nom : I18n.t('macro.summary.noCover'),
      count: String(annexCount),
    });
  }

  function showSummary(tpl) {
    const text = document.getElementById('macro-summary-text');
    if (text) text.textContent = describeSummary(tpl);
    const editBtn = document.getElementById('btn-edit-macro');
    if (editBtn) editBtn.onclick = () => openModal(tpl);
  }

  return { openModal, wire, showSummary };
})();
