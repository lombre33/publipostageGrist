// Écran de création dédié pour les macro modèles (planning/feature-macro-modeles.md) : une modale (même patron que #link-rules-modal/js/variables.js -
// liste dynamique de lignes avec ajout/suppression, plutôt qu'un nouveau mécanisme) pour composer une page de garde + des annexes conditionnelles, et un
// panneau résumé affiché à la place de l'éditeur TipTap quand un macro-modèle est le modèle courant (cf. js/main.js:loadMacroIntoEditor).
const MacroEditor = (function () {
  let editingId = null;
  // Copie de travail des slots conditionnels (le slot fixe "page de garde" est géré à part par #macro-editor-cover, cf. collectSlotsForSave) - jamais la
  // même référence que tpl.macroSlots.slots, pour ne modifier le modèle réellement enregistré qu'au clic sur "Enregistrer".
  let slots = [];
  // Le macro-modèle dont le résumé est à l'écran (redessiné au changement de langue) et le rappel de js/main.js qui ouvre un de ses modèles dans l'éditeur (stylo d'une ligne du résumé).
  let summaryTpl = null;
  let openTemplate = null;

  // Un macro-modèle ne peut pas se référencer lui-même ni un autre macro-modèle (pas d'imbrication - hors scope V1), ni un modèle email (pas un contenu
  // de page). Recalculé à chaque ouverture/rendu plutôt que mis en cache : la liste des modèles peut changer pendant que la modale est ouverte.
  function availableTemplates() {
    return Templates.getCached().filter(t => (t.typeModele || 'document') === 'document');
  }

  function modal() { return document.getElementById('macro-editor-modal'); }
  function nameInput() { return document.getElementById('macro-editor-name'); }
  function coverSelect() { return document.getElementById('macro-editor-cover'); }
  function slotsContainer() { return document.getElementById('macro-editor-slots'); }

  // Champs Colonne / Opérateur / Valeur d'une règle (liste des colonnes, choix réels d'une colonne Choice, indication de type, avertissement
  // "colonne absente de la ligne") : js/condition-fields.js, partagé avec les variables conditionnelles - jamais recopié ici. La colonne se choisit dans UNE
  // seule liste avec recherche qui réunit celles de TOUTES les tables, à la suite et sans groupes (demande d'Antoine du 2026-10-01 : « trouver avec son nom la
  // colonne dans le champ de recherche, pas besoin de séparer les colonnes de la table en cours et les autres ») : celles de la page en nom nu, les autres en
  // « Table.Colonne ». Choisir une colonne d'une table pas encore liée ouvre la fenêtre de choix de la clé, qui l'enregistre ; Annuler remet la colonne précédente.
  const COLUMN_FIELD_OPTIONS = { allTables: true, onColumnChosen: ref => ConditionFields.ensureTableLinked(ref) };

  // Liste avec recherche (js/search-select.js) : un modèle se cherche comme une colonne (demande d'Antoine du 2026-09-29). Le <select> reste la source de la
  // valeur - et la liste native si le composant est indisponible (rend alors null) ; l'appelant appelle `sync()` après l'avoir rempli à nouveau. Rappelé sur un
  // <select> déjà équipé (la page de garde, posée dans index.html), `attach` rend le même contrôleur : un échec d'une ouverture est retenté à la suivante.
  function searchable(select, opts) {
    try { return SearchSelect.attachTemplates(select, opts); }
    catch (e) { console.warn('[MacroEditor] recherche de modèle indisponible, liste native conservée', e); return null; }
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

        // Une règle sur DEUX lignes (audit UX/UI du 2026-09-29, F8 : cinq contrôles sur une ligne se chevauchaient dans une fenêtre de 520 px, la liste des colonnes
        // recouvrait l'opérateur dont le « = » disparaissait) : « Si », la colonne et l'opérateur ; puis, sous la colonne, la valeur et le modèle choisi (→). La
        // croix, à droite, retire la règle entière. Propre à cette fenêtre : la condition d'une bulle et le filtre d'une boucle (js/variable-condition.js,
        // js/variable-loop.js) construisent leur ligne avec les mêmes classes .macro-rule-* et gardent une seule ligne.
        const body = document.createElement('div');
        body.className = 'macro-rule-body';
        const lineOne = document.createElement('div');
        lineOne.className = 'macro-rule-line';
        const lineTwo = document.createElement('div');
        lineTwo.className = 'macro-rule-line macro-rule-line-detail';
        body.appendChild(lineOne);
        body.appendChild(lineTwo);
        row.appendChild(body);

        const connector = document.createElement('span');
        connector.className = 'macro-rule-connector';
        connector.textContent = I18n.t(ruleIndex === 0 ? 'macro.modal.ruleIf' : 'macro.modal.ruleOrIf');
        lineOne.appendChild(connector);

        const fields = ConditionFields.buildConditionFields(rule, COLUMN_FIELD_OPTIONS);
        lineOne.appendChild(fields.columnWrap);
        lineOne.appendChild(fields.operatorSelect);
        lineTwo.appendChild(fields.valueSlot);

        const arrow = document.createElement('span');
        arrow.className = 'macro-rule-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        lineTwo.appendChild(arrow);

        const modeleSelect = document.createElement('select');
        modeleSelect.className = 'macro-rule-modele';
        fillModeleSelect(modeleSelect, rule.modeleId, 'macro.modal.choosePlaceholder');
        modeleSelect.addEventListener('change', () => { rule.modeleId = modeleSelect.value || null; });
        lineTwo.appendChild(modeleSelect);
        searchable(modeleSelect, { inline: true });

        const removeRuleBtn = document.createElement('button');
        removeRuleBtn.type = 'button';
        removeRuleBtn.className = 'macro-rule-remove';
        removeRuleBtn.setAttribute('aria-label', I18n.t('macro.modal.removeRule'));
        removeRuleBtn.addEventListener('click', () => { slot.rules.splice(ruleIndex, 1); renderSlots(); });
        row.appendChild(removeRuleBtn);

        // Ajouté en DERNIER, pas avec fields.columnWrap : `.macro-rule-column-type` a flex-basis:100% (cf. css/toolbar-v2.css), donc prend TOUJOURS sa
        // propre ligne en pleine largeur de `row`, quelle que soit sa position dans le HTML - mesuré par le coordinateur (2026-09-28) : à l'intérieur du
        // <1/3 de largeur de fields.columnWrap, l'avertissement "colonne absente" (400px+) écrasait tout le reste de la ligne.
        row.appendChild(fields.typeHint);

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
      skipOpt.dataset.placeholder = 'false'; // liste avec recherche : « Ne rien inclure » est un vrai choix, pas un « rien » grisé
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
      searchable(defaultSelect);

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
    if (coverSelect()) {
      fillModeleSelect(coverSelect(), cover ? cover.modeleId : null, 'macro.modal.choosePlaceholder');
      const coverSearch = searchable(coverSelect());
      if (coverSearch) coverSearch.sync();
    }
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

  // Réglages du macro-modèle que cette fenêtre ne montre pas (nom du fichier PDF, en-tête et pied de page, page) : réécrits tels quels avec la composition. Remis à zéro (nom de PDF vide,
  // en-tête retiré, marges par défaut), ils se perdaient à chaque « Enregistrer ». Le macro-modèle chargé donne ceux de l'écran (screenSettings, fourni par js/main.js : modifications
  // pas encore enregistrées comprises), un autre ceux de Grist ; un nouveau macro-modèle repart des réglages par défaut.
  let screenSettings = null;
  function settingsToKeep() {
    const none = { nomFichierPDF: '', headerFooter: null, marginsMm: null };
    if (editingId == null) return none;
    if (screenSettings && String(Templates.getCurrentId()) === String(editingId)) return screenSettings();
    const stored = Templates.getCached().find(t => String(t.id) === String(editingId));
    return stored ? { nomFichierPDF: stored.nomFichierPDF || '', headerFooter: stored.headerFooter, marginsMm: stored.marginsMm } : none;
  }

  // Un seul enregistrement à la fois (même retour d'Antoine du 02/10 que js/main.js:onSave) : Grist lent, un deuxième clic sur « Enregistrer » pendant l'écriture d'un macro-modèle tout neuf
  // en créait un deuxième sous le même nom, l'identifiant de la ligne n'arrivant qu'à la fin. La fenêtre se referme dès que la première écriture est revenue : le clic en trop est ignoré.
  // Une écriture qui ne revient jamais (connexion perdue) ne bloque pas le bouton au-delà de SAVE_WATCHDOG_MS, comme celles de js/templates.js.
  const SAVE_WATCHDOG_MS = 60000;
  let savingSince = 0; // 0 : aucun enregistrement en cours
  async function save(onSaved) {
    if (savingSince && Date.now() - savingSince < SAVE_WATCHDOG_MS) return;
    const nom = nameInput() ? nameInput().value.trim() : '';
    if (!nom) { alert(I18n.t('macro.modal.nameRequired')); return; }
    const macroSlots = collectSlotsForSave();
    // Un nom déjà pris par un autre modèle devient « nom (2) », « nom (3) »... (demande d'Antoine du 01/10, même règle que js/main.js:settleTemplateName) ; un macro-modèle
    // qui garde son nom n'est jamais renommé, même s'il a un doublon d'avant cette règle.
    const stored = editingId != null ? Templates.getCached().find(t => String(t.id) === String(editingId)) : null;
    const finalName = stored && Templates.sameName(nom, stored.nom) ? nom : Templates.uniqueName(nom, editingId);
    const startedAt = savingSince = Date.now();
    try {
      const kept = settingsToKeep();
      const { id } = await Templates.save(editingId, finalName, JSON.stringify(macroSlots), kept.nomFichierPDF, kept.headerFooter, kept.marginsMm, 'macro', null);
      closeModal();
      if (onSaved) await onSaved(id, finalName !== nom ? finalName : null);
    } catch (e) {
      console.error('[MacroEditor] échec de l’enregistrement', e);
      alert(I18n.t('macro.modal.saveError'));
    } finally {
      if (savingSince === startedAt) savingSince = 0;
    }
  }

  // onSaved(id) : rappel de js/main.js pour rafraîchir la liste des modèles et recharger le macro-modèle enregistré - branché une seule fois à l'init,
  // même patron que les autres modales de ce fichier (js/main.js:wireLinkRulesModal).
  // getScreenSettings() : les réglages du macro-modèle chargé tels qu'ils sont à l'écran (voir settingsToKeep), fournis par js/main.js.
  // onOpenTemplate(id) : ouvre ce modèle dans l'éditeur, depuis le stylo d'une ligne du résumé (js/main.js:openTemplateFromMacro).
  function wire(onSaved, getScreenSettings, onOpenTemplate) {
    screenSettings = typeof getScreenSettings === 'function' ? getScreenSettings : null;
    openTemplate = typeof onOpenTemplate === 'function' ? onOpenTemplate : null;
    // Le résumé écrit des textes composés à l'exécution (nom des modèles dans les infobulles, numéro d'annexe) : il suit un changement de langue.
    I18n.onChange(() => { if (summaryTpl) renderSummary(summaryTpl); });
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

  // Les modèles de la composition dans l'ordre où on les lit : la page de garde, puis chaque annexe avec le modèle de chacune de ses règles et celui de « Si aucune règle ne correspond » (jamais
  // deux fois le même dans une annexe), sous les mêmes numéros d'annexe que la fenêtre de composition (renderSlots). Une annexe sans aucun modèle garde sa ligne : le numéro suivant ne saute pas.
  function summaryParts(tpl) {
    const slots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    let annexNumber = 0;
    return slots.map(slot => {
      const isCover = slot.type === 'fixed';
      if (!isCover) annexNumber++;
      const ids = isCover ? [slot.modeleId] : (slot.rules || []).map(rule => rule.modeleId).concat(slot.defaultModeleId);
      return {
        label: isCover ? I18n.t('macro.modal.coverLabel') : I18n.t('macro.modal.annexeLabel', { n: annexNumber }),
        ids: ids.filter((id, index) => id != null && id !== '' && ids.findIndex(other => other != null && String(other) === String(id)) === index),
      };
    });
  }

  // Un modèle de la composition : son nom, puis son stylo qui l'ouvre dans l'éditeur (openTemplate, fourni par js/main.js, qui retient d'où l'on vient pour le bandeau « Revenir au macro-modèle »). Un
  // modèle supprimé depuis reste dit, grisé, avec son stylo grisé : rien ne disparaît.
  function modelEntry(id, found) {
    const entry = document.createElement('span');
    entry.className = 'macro-summary-model' + (found ? '' : ' is-missing');
    const name = document.createElement('span');
    name.className = 'macro-summary-model-name';
    name.textContent = found ? found.nom : I18n.t('macro.summary.missing');
    if (found) name.title = found.nom; // un nom long est coupé par « … » : il se lit en entier au survol
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'macro-summary-edit';
    edit.dataset.templateId = String(id);
    edit.innerHTML = Icons.svg('edit');
    if (found) {
      const label = I18n.t('macro.summary.edit', { name: found.nom });
      edit.setAttribute('aria-label', label);
      edit.title = label;
      edit.addEventListener('click', () => { if (openTemplate) openTemplate(found.id); });
    } else {
      edit.disabled = true;
      edit.setAttribute('aria-label', I18n.t('macro.summary.missing'));
    }
    entry.appendChild(name);
    entry.appendChild(edit);
    return entry;
  }

  function renderParts(tpl) {
    const list = document.getElementById('macro-summary-parts');
    if (!list) return;
    list.innerHTML = '';
    const known = Templates.getCached();
    summaryParts(tpl).forEach(part => {
      const item = document.createElement('li');
      item.className = 'macro-summary-part';
      const label = document.createElement('span');
      label.className = 'macro-summary-part-label';
      label.textContent = part.label;
      const models = document.createElement('span');
      models.className = 'macro-summary-models';
      if (!part.ids.length) {
        const none = document.createElement('span');
        none.className = 'macro-summary-model-name';
        none.textContent = I18n.t('macro.summary.noTemplate');
        models.appendChild(none);
      }
      part.ids.forEach(id => models.appendChild(modelEntry(id, known.find(t => String(t.id) === String(id)))));
      item.appendChild(label);
      item.appendChild(models);
      list.appendChild(item);
    });
  }

  function renderSummary(tpl) {
    const text = document.getElementById('macro-summary-text');
    if (text) text.textContent = describeSummary(tpl);
    renderParts(tpl);
  }

  function showSummary(tpl) {
    summaryTpl = tpl;
    renderSummary(tpl);
    const editBtn = document.getElementById('btn-edit-macro');
    if (editBtn) editBtn.onclick = () => openModal(tpl);
  }

  return { openModal, wire, showSummary };
})();
