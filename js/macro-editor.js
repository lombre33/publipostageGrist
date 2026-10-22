// Écran de création des macro-modèles (planning/feature-macro-modeles.md) : une modale (même patron que #link-rules-modal de js/variables.js : liste
// dynamique de lignes avec ajout et suppression) pour composer une page de garde et des annexes conditionnelles, et un panneau résumé affiché à la
// place de l'éditeur TipTap quand un macro-modèle est le modèle courant (js/main.js:loadMacroIntoEditor).
const MacroEditor = (function () {
  let editingId = null;
  // Le nom que la fenêtre a montré à l'ouverture (null : un macro-modèle neuf). Un nom que la personne n'a pas changé ne repart pas avec « Enregistrer » : GFS renomme un fichier en n'écrivant que sa colonne Nom
  // (consigne GFS 029), et le nom d'avant remis dans le lot le défaisait.
  let nameOnOpen = null;
  // Copie de travail des slots conditionnels (le slot fixe « page de garde » est géré à part par #macro-editor-cover, voir collectSlotsForSave) :
  // jamais la même référence que tpl.macroSlots.slots, pour ne modifier le modèle enregistré qu'au clic sur « Enregistrer ».
  let slots = [];
  // Le macro-modèle dont le résumé est à l'écran et le rappel de js/main.js qui ouvre un de ses modèles dans l'éditeur (stylo d'une ligne du résumé).
  let summaryTpl = null;
  let openTemplate = null;
  // Rappel de js/main.js quand l'œil d'un modèle du résumé a fini d'écrire la composition dans Grist (voir toggleModelHidden) : { name, hidden, ok },
  // pour que le coin d'état le dise.
  let onVisibilityChange = null;
  // La page de garde telle qu'elle était dans la composition quand la fenêtre s'est ouverte : « Enregistrer » reconstruit cette position et lui
  // reporte ses modèles masqués (collectSlotsForSave).
  let coverKept = null;

  // Les types de modèle qu'un macro-modèle assemble : un document, une grille (son tableau devient une page du document, dans le sens de sa propre page - « Selon chaque modèle », cf.
  // js/macro-templates.js) et une présentation (ses diapositives gardent leur page 16:9 dans un macro-modèle « Selon chaque modèle » ; ailleurs, elles coulent sur les pages du macro-modèle).
  // Son contenu s'assemble tel qu'il est enregistré : l'extension des présentations n'est pas nécessaire pour l'assembler, seulement pour l'ouvrir (le stylo du résumé, grisé sans elle).
  const ASSEMBLED_TYPES = ['document', 'grille', 'presentation'];
  const GRID_TYPE = 'grille';
  const SLIDES_TYPE = 'presentation';
  // Les étiquettes que le résumé met à droite du nom d'un modèle (modelTags) : leur clé de texte, dans l'ordre où elles se lisent.
  const TAG_KEYS = { grid: 'macro.summary.tagGrid', slides: 'macro.summary.tagSlides', landscape: 'macro.summary.tagLandscape' };

  function availableTemplates() {
    // Un macro-modèle ne peut pas se référencer lui-même ni un autre macro-modèle (pas d'imbrication), ni un modèle email (pas un contenu de page).
    // Recalculé à chaque ouverture et chaque rendu plutôt que mis en cache : la liste des modèles peut changer pendant que la modale est ouverte.
    return Templates.getCached().filter(t => ASSEMBLED_TYPES.indexOf(t.typeModele || 'document') !== -1);
  }

  function modal() { return document.getElementById('macro-editor-modal'); }
  function nameInput() { return document.getElementById('macro-editor-name'); }
  function coverSelect() { return document.getElementById('macro-editor-cover'); }
  function slotsContainer() { return document.getElementById('macro-editor-slots'); }

  function searchable(select, opts) {
    // Liste avec recherche (js/search-select.js) : un modèle se cherche comme une colonne. Le <select> reste la source de la valeur, et la liste native
    // si le composant est indisponible (rend alors null) ; l'appelant appelle `sync()` après l'avoir rempli à nouveau. Rappelé sur un <select> déjà
    // équipé (la page de garde, posée dans index.html), `attach` rend le même contrôleur : un échec d'une ouverture est retenté à la suivante.
    try { return SearchSelect.attachTemplates(select, opts); }
    catch (e) { console.warn('[MacroEditor] recherche de modèle indisponible, liste native conservée', e); return null; }
  }

  function node(tag, className, text, children) {
    // Un élément avec sa classe, son texte et ses enfants (tous facultatifs).
    const element = Dom.el(tag, className, text);
    (children || []).forEach(child => element.appendChild(child));
    return element;
  }

  function option(value, text) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    return opt;
  }

  function iconButton(className, label, onClick) {
    const btn = node('button', className);
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function fillModeleSelect(select, selectedId) {
    select.innerHTML = '';
    select.appendChild(option('', I18n.t('macro.modal.choosePlaceholder')));
    availableTemplates().forEach(t => select.appendChild(option(String(t.id), t.nom)));
    select.value = selectedId != null ? String(selectedId) : '';
  }

  function ruleRow(slot, rule, ruleIndex) {
    // Une règle de l'annexe : les champs et la mise en page sont ceux de ConditionFields.buildTemplateRule, partagés avec le réglage « Selon la
    // ligne ».
    const connector = I18n.t(ruleIndex === 0 ? 'macro.modal.ruleIf' : 'macro.modal.ruleOrIf');
    const onRemove = () => { slot.rules.splice(ruleIndex, 1); renderSlots(); };
    const { row, modeleSelect } = ConditionFields.buildTemplateRule(rule, { connector, templates: availableTemplates(), onRemove });
    searchable(modeleSelect, { inline: true });
    return row;
  }

  function defaultSelectFor(slot) {
    // Le modèle de « Si aucune règle ne correspond » : un des modèles, ou aucun.
    const select = node('select', 'macro-slot-default-select');
    const skip = option('', I18n.t('macro.modal.defaultSkip'));
    skip.dataset.placeholder = 'false'; // liste avec recherche : « Ne rien inclure » est un vrai choix, pas un « rien » grisé
    select.appendChild(skip);
    availableTemplates().forEach(t => select.appendChild(option(String(t.id), I18n.t('macro.modal.defaultUse', { name: t.nom }))));
    select.value = slot.defaultModeleId != null ? String(slot.defaultModeleId) : '';
    select.addEventListener('change', () => { slot.defaultModeleId = select.value || null; });
    return select;
  }

  function slotCard(slot, slotIndex) {
    const removeSlot = () => { slots.splice(slotIndex, 1); renderSlots(); };
    const title = node('span', 'macro-slot-title', I18n.t('macro.modal.annexeLabel', { n: slotIndex + 1 }));
    const header = node('div', 'macro-slot-header', null, [title, iconButton('macro-slot-remove', I18n.t('macro.modal.removeSlot'), removeSlot)]);
    const rules = node('div', 'macro-slot-rules', null, (slot.rules || []).map((rule, ruleIndex) => ruleRow(slot, rule, ruleIndex)));
    const addRule = node('button', 'macro-rule-add', I18n.t('macro.modal.addRule'));
    addRule.type = 'button';
    addRule.addEventListener('click', () => {
      slot.rules = slot.rules || [];
      slot.rules.push({ column: '', operator: '=', value: '', modeleId: null });
      renderSlots();
    });
    const defaultLabel = node('label', 'macro-slot-default-label', I18n.t('macro.modal.defaultLabel'));
    const defaultSelect = defaultSelectFor(slot);
    const card = node('div', 'macro-slot-card', null, [header, rules, addRule, node('div', 'macro-slot-sep'), defaultLabel, defaultSelect]);
    searchable(defaultSelect);
    return card;
  }

  function renderSlots() {
    const container = slotsContainer();
    if (!container) return;
    container.innerHTML = '';
    if (!slots.length) container.appendChild(node('div', 'macro-slots-empty', I18n.t('macro.modal.noSlots')));
    slots.forEach((slot, slotIndex) => container.appendChild(slotCard(slot, slotIndex)));
  }

  function openModal(tpl) {
    editingId = tpl ? tpl.id : null;
    const existingSlots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    // Copie profonde : la modale ne doit jamais muter tpl.macroSlots tant que "Enregistrer" n'a pas été cliqué (Annuler doit tout jeter).
    slots = JSON.parse(JSON.stringify(existingSlots.filter(s => s.type === 'conditional')));
    const cover = existingSlots.find(s => s.type === 'fixed');
    coverKept = cover ? JSON.parse(JSON.stringify(cover)) : null;
    if (nameInput()) nameInput().value = tpl ? tpl.nom : '';
    nameOnOpen = tpl ? String(tpl.nom == null ? '' : tpl.nom).trim() : null;
    if (coverSelect()) {
      fillModeleSelect(coverSelect(), cover ? cover.modeleId : null);
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
    // Les modèles masqués par leur œil (js/macro-templates.js:isModelHidden) restent masqués à travers cette fenêtre : une position reconstruite
    // reprend ceux de ses modèles qui y sont encore (un modèle retiré ne laisse pas son masquage derrière lui, un modèle mis à sa place repart
    // affiché).
    const result = [];
    const coverId = coverSelect() ? coverSelect().value : '';
    if (coverId) result.push(MacroTemplates.keepHidden({ type: 'fixed', modeleId: coverId }, coverKept));
    slots.forEach(slot => {
      const rules = (slot.rules || []).filter(r => r.column && r.modeleId);
      result.push(MacroTemplates.keepHidden({ type: 'conditional', rules, defaultModeleId: slot.defaultModeleId || null }, slot));
    });
    return { slots: result };
  }

  // Réglages du macro-modèle que cette fenêtre ne montre pas (nom du fichier PDF, en-tête et pied de page, page) : réécrits tels quels avec la
  // composition. Remis à zéro (nom de PDF vide, en-tête retiré, marges par défaut), ils se perdaient à chaque « Enregistrer ». Le macro-modèle chargé
  // donne ceux de l'écran (screenSettings, fourni par js/main.js : modifications pas encore enregistrées comprises), un autre ceux de Grist ; un
  // nouveau macro-modèle repart des réglages par défaut, avec des pages « Selon chaque modèle » (PageLayout.newMacroMarginsMm).
  let screenSettings = null;
  function settingsToKeep(id = editingId) {
    const none = { nomFichierPDF: '', headerFooter: null, marginsMm: PageLayout.newMacroMarginsMm() };
    if (id == null) return none;
    if (screenSettings && Templates.isCurrent(id)) return screenSettings();
    const stored = Templates.byId(id);
    return stored ? { nomFichierPDF: stored.nomFichierPDF || '', headerFooter: stored.headerFooter, marginsMm: stored.marginsMm } : none;
  }

  // Un seul enregistrement à la fois (comme js/main.js:onSave) : avec Grist lent, un deuxième clic sur « Enregistrer » pendant l'écriture d'un
  // macro-modèle tout neuf en créait un deuxième sous le même nom, l'identifiant de la ligne n'arrivant qu'à la fin. La fenêtre se referme dès que la
  // première écriture est revenue : le clic en trop est ignoré. Une écriture qui ne revient jamais (connexion perdue) ne bloque pas le bouton au-delà
  // de SAVE_WATCHDOG_MS, comme celles de js/templates.js.
  const SAVE_WATCHDOG_MS = 60000;
  let savingSince = 0; // 0 : aucun enregistrement en cours
  async function save(onSaved) {
    if (savingSince && Date.now() - savingSince < SAVE_WATCHDOG_MS) return;
    const nom = nameInput() ? nameInput().value.trim() : '';
    if (!nom) { alert(I18n.t('macro.modal.nameRequired')); return; }
    const macroSlots = collectSlotsForSave();
    // Un nom déjà pris par un autre modèle devient « nom (2) », « nom (3) »... (même règle que js/main.js:settleTemplateName) ; un macro-modèle qui
    // garde son nom n'est jamais renommé, même s'il a un doublon d'avant cette règle.
    const stored = editingId != null ? Templates.byId(editingId) : null;
    const renamed = editingId == null || nom !== nameOnOpen;
    const finalName = !renamed || (stored && Templates.sameName(nom, stored.nom)) ? nom : Templates.uniqueName(nom, editingId);
    const startedAt = savingSince = Date.now();
    // L'enregistrement recharge le macro-modèle de l'écran (js/main.js) : la composition d'avant et l'historique d'avant (sa page, ses yeux) sont pris ici, remis ensuite par recordComposition avec le pas de la composition.
    const before = editingId != null && summaryTpl && String(summaryTpl.id) === String(editingId) ? snapshot() : null;
    const history = before ? HistoryMarkers.keep() : null;
    let saved = false;
    try {
      const kept = settingsToKeep();
      const { id } = await Templates.save(editingId, renamed ? finalName : null, JSON.stringify(macroSlots), kept.nomFichierPDF, kept.headerFooter, kept.marginsMm, 'macro', null);
      closeModal();
      if (onSaved) await onSaved(id, finalName !== nom ? finalName : null);
      saved = true;
    } catch (e) {
      // La personne a refusé de créer les tables du widget : la fenêtre reste ouverte, le macro-modèle n'est pas perdu.
      if (GristAPI.isTablesDeclined(e)) { alert(I18n.t('status.saveDeclined')); return; }
      console.error('[MacroEditor] échec de l’enregistrement', e);
      alert(I18n.t('macro.modal.saveError'));
    } finally {
      if (savingSince === startedAt) savingSince = 0;
    }
    if (saved && before) recordComposition(before, history);
  }

  // Deux compositions disent la même chose quand leurs identifiants de modèle s'écrivent pareil en texte : la fenêtre de composition les écrit en texte, Grist les rend en nombre (js/macro-templates.js:isModelHidden).
  function comparable(composition) {
    return JSON.stringify(composition, (key, value) => {
      if (key === 'modeleId' || key === 'defaultModeleId') return value == null || value === '' ? null : String(value);
      return key === 'hiddenModeleIds' && Array.isArray(value) ? value.map(String) : value;
    });
  }

  // Le macro-modèle enregistré par la fenêtre est rechargé : son historique d'avant lui est rendu (sa page, ses yeux), puis le repère de la composition s'y pose, Annuler lui rend la composition d'avant. Pas de repère quand la composition n'a
  // pas changé (le nom seul, ou la fenêtre qui réécrit en texte des identifiants que Grist rendait en nombre) ; rien du tout quand l'écran n'est plus sur ce macro-modèle.
  function recordComposition(before, history) {
    const now = snapshot();
    if (!now || String(now.id) !== String(before.id)) return;
    HistoryMarkers.resume(history);
    if (comparable(now.composition) === comparable(before.composition)) return;
    HistoryMarkers.begin('macro', before).commit({ alone: true });
  }

  function wire(onSaved, getScreenSettings, onOpenTemplate, onModelVisibility) {
    // onSaved(id) : rappel de js/main.js pour rafraîchir la liste des modèles et recharger le macro-modèle enregistré - branché une seule fois à
    // l'init, même patron que les autres modales de ce fichier (js/main.js:wireLinkRulesModal). getScreenSettings() : les réglages du macro-modèle
    // chargé tels qu'ils sont à l'écran (voir settingsToKeep), fournis par js/main.js. onOpenTemplate(id) : ouvre ce modèle dans l'éditeur, depuis le
    // stylo d'une ligne du résumé (js/main.js:openTemplateFromMacro). onModelVisibility({ name, hidden, ok }) : l'œil d'un modèle du résumé a fini
    // d'écrire la composition (ok) ou n'a pas pu (js/main.js:onMacroModelVisibility, le coin d'état).
    screenSettings = typeof getScreenSettings === 'function' ? getScreenSettings : null;
    openTemplate = typeof onOpenTemplate === 'function' ? onOpenTemplate : null;
    onVisibilityChange = typeof onModelVisibility === 'function' ? onModelVisibility : null;
    // Le menu Page du macro-modèle à l'écran (« Selon chaque modèle », Portrait, Paysage) change ce que « Paysage » dit de ses modèles (modelTags) : le résumé suit, sans attendre l'enregistrement.
    document.addEventListener('pp:pageLayoutChanged', () => { if (summaryTpl && Templates.isCurrent(summaryTpl.id)) renderSummary(summaryTpl); });
    const addSlotBtn = document.getElementById('macro-editor-add-slot');
    if (addSlotBtn) addSlotBtn.addEventListener('click', () => {
      slots.push({ type: 'conditional', rules: [{ column: '', operator: '=', value: '', modeleId: null }], defaultModeleId: null });
      renderSlots();
    });
    const cancelBtn = document.getElementById('macro-editor-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    const saveBtn = document.getElementById('macro-editor-save');
    if (saveBtn) saveBtn.addEventListener('click', () => save(onSaved));
    // Entrée dans le nom valide la fenêtre, par la même sortie que le clic sur « Enregistrer » (comme les autres fenêtres du widget), sauf pendant une
    // composition de texte (accent mort, saisie asiatique) : elle ne fait alors que choisir le caractère. Échap garde le sien (js/modal-base.js).
    const nameField = nameInput();
    if (nameField && saveBtn) nameField.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      saveBtn.click();
    });
  }

  function describeSummary(tpl) {
    if (!tpl || !tpl.macroSlots || !Array.isArray(tpl.macroSlots.slots) || !tpl.macroSlots.slots.length) return I18n.t('macro.summary.empty');
    const cover = tpl.macroSlots.slots.find(s => s.type === 'fixed');
    const coverTpl = cover ? Templates.byId(cover.modeleId) : null;
    const annexCount = tpl.macroSlots.slots.filter(s => s.type === 'conditional').length;
    return I18n.t('macro.summary.text', {
      cover: coverTpl ? coverTpl.nom : I18n.t('macro.summary.noCover'),
      count: String(annexCount),
    });
  }

  function currentTemplate(tpl) {
    // Le macro-modèle tel que le cache des modèles le tient maintenant. Le cache est remplacé objet par objet à chaque relecture des modèles
    // (l'enregistrement automatique en fait une toutes les 15 s au repos) : l'objet reçu par showSummary() peut déjà être périmé, alors que la fenêtre
    // de composition et l'œil d'un modèle doivent partir de la composition à jour.
    return (tpl && tpl.id != null && Templates.byId(tpl.id)) || tpl;
  }

  function summaryParts(tpl) {
    // Les modèles de la composition dans l'ordre où on les lit : la page de garde, puis chaque annexe avec le modèle de chacune de ses règles et celui
    // de « Si aucune règle ne correspond » (jamais deux fois le même dans une annexe), sous les mêmes numéros d'annexe que la fenêtre de composition
    // (renderSlots). Une annexe sans aucun modèle garde sa ligne : le numéro suivant ne saute pas. `slot` et `slotIndex` disent de quelle position de
    // la composition vient la ligne : c'est dans cette position que l'œil d'un modèle le masque.
    const slots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    let annexNumber = 0;
    return slots.map((slot, slotIndex) => {
      const isCover = slot.type === 'fixed';
      if (!isCover) annexNumber++;
      return {
        label: isCover ? I18n.t('macro.modal.coverLabel') : I18n.t('macro.modal.annexeLabel', { n: annexNumber }),
        ids: MacroTemplates.slotModelIds(slot),
        slot,
        slotIndex,
      };
    });
  }

  function paintEye(entry, eye, hidden, name) {
    // L'œil d'un modèle : l'icône dit l'état (œil barré = masqué de la Lecture et des exports), `aria-pressed` le dit aux lecteurs d'écran, le nom du
    // modèle se grise. Le nom accessible dit le geste et ne change pas ; l'info-bulle dit l'état et ce que le clic fait. Écrit aussi bien au dessin du
    // résumé qu'au clic : le bouton reste le même, il garde le focus.
    entry.classList.toggle('is-hidden-model', hidden);
    Dom.setMarkup(eye, Icons.svg(hidden ? 'eyeOff' : 'eye'));
    eye.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    eye.setAttribute('aria-label', I18n.t('macro.summary.hide', { name }));
    eye.title = I18n.t(hidden ? 'macro.summary.hiddenTip' : 'macro.summary.hideTip', { name });
  }

  function summaryButton(className, id) {
    const btn = node('button', className);
    btn.type = 'button';
    btn.dataset.templateId = String(id);
    return btn;
  }

  function isPerModelSense(tpl) {
    // Le macro-modèle suit-il le sens de chaque modèle (« Selon chaque modèle ») ? À l'écran, c'est le réglage de sa page tel que le bouton Page l'a posé et tel que l'assemblage le lit (PageLayout,
    // main.js:perModelOption) ; hors écran, celui que sa ligne a gardé.
    if (tpl && tpl.id != null && Templates.isCurrent(tpl.id)) return PageLayout.isOrientationAuto();
    return !!(tpl && tpl.marginsMm && tpl.marginsMm.orientationAuto === true);
  }

  function modelTags(found, perModel) {
    // Les étiquettes d'un modèle de la composition : rien pour un document en portrait ; « Grille » pour un modèle Grille ; « Diapositives » pour une présentation ; « Paysage » pour un modèle dont la page est en paysage
    // (js/macro-templates.js:senseOfTemplate), dans cet ordre. « Grille » et « Diapositives » disent ce qu'est le modèle et restent vrais quel que soit le sens du macro-modèle. « Paysage » dit le sens de ses pages dans
    // le document assemblé : il n'est vrai que si le macro-modèle suit chaque modèle ; sous un sens imposé (Portrait, Paysage), le macro-modèle donne le sien à tous et l'étiquette dirait une page que le modèle n'a pas.
    // Les listes de choix de modèle n'en portent pas.
    const tags = [];
    if (found.typeModele === GRID_TYPE) tags.push('grid');
    if (found.typeModele === SLIDES_TYPE) tags.push('slides');
    if (perModel && MacroTemplates.senseOfTemplate(found) === PageSections.LANDSCAPE) tags.push('landscape');
    return tags;
  }

  function tagNode(tag) {
    const el = node('span', 'macro-summary-model-tag', I18n.t(TAG_KEYS[tag]));
    el.dataset.tag = tag;
    return el;
  }

  function modelEntry(id, found, part, perModel) {
    // Un modèle de la composition : son nom, ses étiquettes (modelTags : « Grille », « Paysage »), puis son stylo qui l'ouvre dans l'éditeur (openTemplate, fourni par js/main.js, qui retient d'où l'on
    // vient pour le bandeau « Revenir au macro-modèle »), puis son œil qui le masque de la Lecture et des exports (toggleModelHidden). Un modèle
    // supprimé depuis reste dit, grisé, avec son stylo et son œil grisés, sans étiquette : rien ne disparaît.
    const name = node('span', 'macro-summary-model-name', found ? found.nom : I18n.t('macro.summary.missing'));
    if (found) name.title = found.nom; // un nom long est coupé par « … » : il se lit en entier au survol
    const tags = found ? modelTags(found, perModel).map(tagNode) : [];
    const edit = summaryButton('macro-summary-edit', id);
    Dom.setMarkup(edit, Icons.svg('edit'));
    const eye = summaryButton('macro-summary-eye', id);
    eye.dataset.slot = String(part.slotIndex);
    const entry = node('span', 'macro-summary-model' + (found ? '' : ' is-missing'), null, [name].concat(tags, [edit, eye]));
    if (found) {
      const label = I18n.t('macro.summary.edit', { name: found.nom });
      edit.setAttribute('aria-label', label);
      edit.title = label;
      edit.addEventListener('click', () => { if (openTemplate) openTemplate(found.id); });
      // Un modèle que ce widget ne peut pas ouvrir (une présentation, extension éteinte) reste assemblé : son stylo est grisé, avec la raison.
      if (!Templates.isOpenableType(found.typeModele)) {
        edit.disabled = true;
        edit.title = Templates.unavailableText(found.typeModele);
      }
      paintEye(entry, eye, MacroTemplates.isModelHidden(part.slot, id), found.nom);
      eye.addEventListener('click', () => toggleModelHidden(entry, eye, part.slotIndex, id, found.nom));
    } else {
      edit.disabled = true;
      edit.setAttribute('aria-label', I18n.t('macro.summary.missing'));
      eye.disabled = true;
      Dom.setMarkup(eye, Icons.svg('eye'));
      eye.setAttribute('aria-label', I18n.t('macro.summary.missing'));
    }
    return entry;
  }

  // Les écritures de composition que les yeux demandent, par macro-modèle : { slots, dirty, last }. Une seule écriture à la fois ; les clics qui
  // arrivent pendant qu'elle dure n'en font qu'une de plus, avec la dernière composition demandée (Grist lent : l'écriture relit toute la table des
  // modèles, des secondes). L'écran et le cache disent l'état voulu dès le clic, l'écriture suit.
  const eyeWrites = new Map();

  async function writeComposition(id, macroSlots) {
    // Écrit la composition d'un macro-modèle dans sa ligne, comme « Enregistrer » de la fenêtre : mêmes réglages gardés (nom du PDF, en-tête et pied,
    // page : ceux de l'écran s'il est chargé, ceux de Grist sinon), jamais une composition vide ni inventée pour un macro-modèle supprimé depuis.
    const stored = Templates.byId(id);
    if (!stored) throw new Error('macro-modèle introuvable');
    const kept = settingsToKeep(id);
    const { dateModif } = await Templates.save(stored.id, null, JSON.stringify(macroSlots), kept.nomFichierPDF, kept.headerFooter, kept.marginsMm, 'macro', null);
    // La date que Grist vient de donner à la ligne : le cache la connaît, comme un enregistrement de la fenêtre.
    const written = Templates.byId(id);
    if (written && dateModif != null) written.dateModif = dateModif;
  }

  function setComposition(tpl, macroSlots) {
    tpl.macroSlots = macroSlots;
    tpl.contenu = JSON.stringify(macroSlots);
  }

  function eyesShow(macroSlots) {
    // Les yeux à l'écran disent-ils cette composition ? Faux seulement quand un redessin du résumé (changement de mise en page, relecture après l'échec d'une
    // autre écriture) les a faits partir d'un cache des modèles qu'une relecture croisant l'écriture avait remis à l'état d'avant.
    const list = document.getElementById('macro-summary-parts');
    if (!list) return true;
    return Array.from(list.querySelectorAll('.macro-summary-eye:not(:disabled)')).every(eye => {
      const slot = macroSlots.slots[Number(eye.dataset.slot)];
      return (eye.getAttribute('aria-pressed') === 'true') === MacroTemplates.isModelHidden(slot, eye.dataset.templateId);
    });
  }

  async function drainEyeWrites(key, id) {
    const state = eyeWrites.get(key);
    let failed = false;
    try {
      while (state.dirty) {
        state.dirty = false;
        await writeComposition(id, state.slots);
      }
    } catch (e) {
      failed = true;
      console.error('[MacroEditor] échec de l’enregistrement d’un modèle masqué ou affiché', e);
    }
    eyeWrites.delete(key); // rien n'a pu s'intercaler depuis la fin de la boucle : aucun clic n'est perdu
    if (failed) {
      // Rien n'est sûr de ce que Grist a gardé : l'écran repart de ce qu'il dit.
      try { await Templates.loadAll(); } catch (e) { console.error('[MacroEditor] relecture des modèles impossible', e); }
      if (summaryTpl && String(summaryTpl.id) === String(id)) renderSummary(summaryTpl);
    } else {
      // Une relecture des modèles qui a croisé l'écriture a pu remettre dans le cache la composition d'avant : il garde celle qui vient d'être
      // écrite.
      const cached = Templates.byId(id);
      if (cached && JSON.stringify(cached.macroSlots) !== JSON.stringify(state.slots)) setComposition(cached, state.slots);
      if (summaryTpl && String(summaryTpl.id) === String(id) && !eyesShow(state.slots)) renderSummary(summaryTpl);
    }
    if (onVisibilityChange) onVisibilityChange(state.last ? { name: state.last.name, hidden: state.last.hidden, ok: !failed } : { ok: !failed });
  }

  function toggleModelHidden(entry, eye, slotIndex, id, name) {
    // Le clic sur l'œil d'un modèle du résumé : le masque de la Lecture et de toutes les sorties du macro-modèle (js/macro-templates.js:pickModeleId),
    // ou le remet. Le modèle reste dans la composition, grisé avec son œil barré (rien ne disparaît) ; la composition est écrite dans sa ligne, avec le
    // reste du macro-modèle.
    if (AccessRights.get().readOnly) return;
    const tpl = currentTemplate(summaryTpl);
    if (!tpl || tpl.id == null || !tpl.macroSlots) return;
    const key = String(tpl.id);
    // La composition la plus récente : celle que l'écriture en cours porte, pas celle du cache, qu'une relecture des modèles a pu remplacer par
    // l'état d'avant.
    const pending = eyeWrites.get(key);
    const base = pending ? pending.slots : tpl.macroSlots;
    const slot = base.slots[slotIndex];
    // Le résumé à l'écran n'est plus celui de la composition (modifiée ailleurs depuis) : on ne masque pas un autre modèle, le résumé est redessiné.
    if (!slot || !MacroTemplates.slotModelIds(slot).some(other => String(other) === String(id))) { renderSummary(tpl); return; }
    const hidden = !MacroTemplates.isModelHidden(slot, id);
    const next = MacroTemplates.withModelHidden(base, slotIndex, id, hidden);
    // Le geste entre dans l'historique d'Annuler et de Rétablir (js/history-markers.js, domaine « macro ») : la composition d'avant, celle d'après.
    HistoryMarkers.track('macro', () => {
      setComposition(tpl, next);
      paintEye(entry, eye, hidden, name);
      queueComposition(tpl, next, { name, hidden });
    });
  }

  // La composition à écrire dans la ligne du macro-modèle, par la file de ses écritures : l'œil d'un modèle, Annuler et Rétablir y passent tous. `last` : { name, hidden } du modèle dont l'œil a changé (le coin d'état le
  // dit une fois l'écriture faite), null quand plusieurs ont changé.
  function queueComposition(tpl, slots, last) {
    const key = String(tpl.id);
    const pending = eyeWrites.get(key);
    if (pending) { pending.slots = slots; pending.dirty = true; pending.last = last; return; }
    eyeWrites.set(key, { slots, dirty: true, last });
    drainEyeWrites(key, tpl.id);
  }

  // L'historique d'Annuler et de Rétablir (js/history-markers.js, domaine « macro ») : la composition du macro-modèle dont le résumé est à l'écran, la plus récente (celle de l'écriture en cours, pas celle du cache), null quand
  // aucun résumé n'est à l'écran.
  function snapshot() {
    const tpl = summaryTpl && currentTemplate(summaryTpl);
    if (!tpl || tpl.id == null || !tpl.macroSlots || !Templates.isCurrent(tpl.id)) return null;
    const pending = eyeWrites.get(String(tpl.id));
    return { id: tpl.id, composition: JSON.parse(JSON.stringify(pending ? pending.slots : tpl.macroSlots)) };
  }

  // Le seul modèle dont l'œil a changé entre deux compositions de mêmes positions : { name, hidden }, pour que le coin d'état le dise ; null quand plusieurs ont changé ou que la composition elle-même a changé.
  function hiddenChange(from, to) {
    const before = from && from.composition && from.composition.slots;
    const after = to && to.composition && to.composition.slots;
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return null;
    const changed = [];
    after.forEach((slot, index) => MacroTemplates.slotModelIds(slot).forEach(id => {
      const hidden = MacroTemplates.isModelHidden(slot, id);
      if (hidden !== MacroTemplates.isModelHidden(before[index], id)) changed.push({ id, hidden });
    }));
    if (changed.length !== 1) return null;
    const found = Templates.byId(changed[0].id);
    return found ? { name: found.nom, hidden: changed[0].hidden } : null;
  }

  // Annuler ou Rétablir rend à l'écran la composition que le repère garde : le résumé la dit, la ligne du macro-modèle la reçoit comme d'un clic sur un œil. Sans effet quand le résumé à l'écran n'est plus celui du repère.
  function restore(next) {
    const tpl = summaryTpl && currentTemplate(summaryTpl);
    const now = snapshot();
    if (!next || !tpl || !now || String(now.id) !== String(next.id) || comparable(now.composition) === comparable(next.composition)) return false;
    setComposition(tpl, next.composition);
    renderSummary(tpl);
    queueComposition(tpl, next.composition, hiddenChange(now, next));
    return true;
  }

  function renderParts(tpl) {
    const list = document.getElementById('macro-summary-parts');
    if (!list) return;
    // Un œil qui avait le focus le garde si le résumé est redessiné (changement de mise en page, relecture après un échec) : le clavier ne repart pas du
    // début de la page.
    const focused = document.activeElement;
    const focusedEye = focused && focused.classList && focused.classList.contains('macro-summary-eye') && list.contains(focused) ? { slot: focused.dataset.slot, id: focused.dataset.templateId } : null;
    list.innerHTML = '';
    const perModel = isPerModelSense(tpl);
    summaryParts(tpl).forEach(part => {
      const entries = part.ids.map(id => modelEntry(id, Templates.byId(id), part, perModel));
      if (!entries.length) entries.push(node('span', 'macro-summary-model-name', I18n.t('macro.summary.noTemplate')));
      const label = node('span', 'macro-summary-part-label', part.label);
      list.appendChild(node('li', 'macro-summary-part', null, [label, node('span', 'macro-summary-models', null, entries)]));
    });
    if (focusedEye) {
      const again = list.querySelector('.macro-summary-eye[data-slot="' + CSS.escape(focusedEye.slot) + '"][data-template-id="' + CSS.escape(focusedEye.id) + '"]');
      if (again && !again.disabled) again.focus();
    }
  }

  function renderSummary(tpl) {
    const shown = currentTemplate(tpl);
    const text = document.getElementById('macro-summary-text');
    if (text) text.textContent = describeSummary(shown);
    renderParts(shown);
  }

  function showSummary(tpl) {
    summaryTpl = tpl;
    renderSummary(tpl);
    const editBtn = document.getElementById('btn-edit-macro');
    if (editBtn) editBtn.onclick = () => openModal(currentTemplate(tpl));
  }

  return { openModal, wire, showSummary, snapshot, restore };
})();
