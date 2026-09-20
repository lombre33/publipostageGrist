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

        const colInput = document.createElement('input');
        colInput.type = 'text';
        colInput.className = 'macro-rule-column';
        colInput.placeholder = I18n.t('macro.modal.columnPlaceholder');
        colInput.value = rule.column || '';
        colInput.addEventListener('input', () => { rule.column = colInput.value; });
        row.appendChild(colInput);

        const opSelect = document.createElement('select');
        OPERATORS.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; opSelect.appendChild(o); });
        opSelect.value = rule.operator || '=';
        opSelect.addEventListener('change', () => { rule.operator = opSelect.value; });
        row.appendChild(opSelect);

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'macro-rule-value';
        valInput.placeholder = I18n.t('macro.modal.valuePlaceholder');
        valInput.value = rule.value || '';
        valInput.addEventListener('input', () => { rule.value = valInput.value; });
        row.appendChild(valInput);

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
