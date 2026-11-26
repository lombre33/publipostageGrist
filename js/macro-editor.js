// Écran de création des macro-modèles (planning/feature-macro-modeles.md) : une modale (même patron que #link-rules-modal de js/variables.js : liste
// dynamique de lignes avec ajout et suppression) pour composer une liste de documents, chacun avec sa condition d'inclusion, et un panneau résumé affiché à la
// place de l'éditeur TipTap quand un macro-modèle est le modèle courant (js/main.js:loadMacroIntoEditor).
// Une seule carte pour tous les documents, dans l'ordre où on les lit (rien n'est plus « page de garde » : le premier est un document comme les autres) : « Modèle » et
// « Inclure ce document » (toujours, ou seulement si sa condition est remplie pour la ligne : `condition` { mode, rules }, la même que celle d'une bulle conditionnelle - Et / Ou,
// groupes, autre colonne). Dans « Modèle », deux sortes de position, enregistrées comme avant :
//  - un modèle choisi (`fixed`) ;
//  - « Choisi selon la ligne » (`conditional`, l'ancienne « annexe ») : une cascade « si colonne = valeur, alors ce modèle » et un modèle par défaut, sous la carte.
// Sous chaque carte, « + Ajouter un modèle à la suite » (`followingModeleIds`) : d'autres modèles qui s'assemblent après celui du document, dans l'ordre, tous sous la condition d'inclusion de la carte
// (un bloc de plusieurs modèles qu'une seule condition retient ou laisse de côté). Ils n'ont pas de condition propre et ne choisissent pas selon la ligne.
// Un macro-modèle enregistré avec une page de garde et des annexes s'ouvre tel quel : la page de garde est son premier document, toujours inclus.
const MacroEditor = (function () {
  let editingId = null;
  // Le nom que la fenêtre a montré à l'ouverture (null : un macro-modèle neuf). Un nom que la personne n'a pas changé ne repart pas avec « Enregistrer » : GFS renomme un fichier en n'écrivant que sa colonne Nom
  // (consigne GFS 029), et le nom d'avant remis dans le lot le défaisait.
  let nameOnOpen = null;
  // Copie de travail de TOUTES les positions de la composition, dans leur ordre (voir collectSlotsForSave) : jamais la même référence que tpl.macroSlots.slots, pour ne modifier le
  // modèle enregistré qu'au clic sur « Enregistrer ». Un document porte en plus `_when` ('always' ou 'if' : ce que la liste « Inclure » montre) ; `condition` reste dans son brouillon
  // quand on repasse à « Toujours », pour la retrouver si l'on change d'avis, mais n'est enregistrée que sous « Seulement si ».
  let slots = [];
  // Le macro-modèle dont le résumé est à l'écran et le rappel de js/main.js qui ouvre un de ses modèles dans l'éditeur (stylo d'une ligne du résumé).
  let summaryTpl = null;
  let openTemplate = null;
  // Rappel de js/main.js quand l'œil d'un modèle du résumé a fini d'écrire la composition dans Grist (voir toggleModelHidden) : { name, hidden, ok },
  // pour que le coin d'état le dise.
  let onVisibilityChange = null;

  // Les types de modèle qu'un macro-modèle assemble : un document, une grille (son tableau devient une page du document, dans le sens de sa propre page - « Selon chaque modèle », cf.
  // js/macro-templates.js) et une présentation (ses diapositives gardent leur page 16:9 dans un macro-modèle « Selon chaque modèle » ; ailleurs, elles coulent sur les pages du macro-modèle).
  // Son contenu s'assemble tel qu'il est enregistré : l'extension des présentations n'est pas nécessaire pour l'assembler, seulement pour l'ouvrir (le stylo du résumé, grisé sans elle).
  const ASSEMBLED_TYPES = ['document', 'grille', 'presentation'];
  const GRID_TYPE = 'grille';
  const SLIDES_TYPE = 'presentation';
  const DOCUMENT_KIND = 'fixed';
  const BY_ROW_KIND = 'conditional';
  // La valeur du choix « Choisi selon la ligne » dans la liste « Modèle » d'une carte (jamais un identifiant de modèle).
  const BY_ROW_VALUE = '__by-row__';
  // Les étiquettes que le résumé met à droite du nom d'un modèle (modelTags) : leur clé de texte, dans l'ordre où elles se lisent.
  const TAG_KEYS = { grid: 'macro.summary.tagGrid', slides: 'macro.summary.tagSlides', landscape: 'macro.summary.tagLandscape' };

  function availableTemplates() {
    // Un macro-modèle ne peut pas se référencer lui-même ni un autre macro-modèle (pas d'imbrication), ni un modèle email (pas un contenu de page).
    // Recalculé à chaque ouverture et chaque rendu plutôt que mis en cache : la liste des modèles peut changer pendant que la modale est ouverte.
    return Templates.getCached().filter(t => ASSEMBLED_TYPES.indexOf(t.typeModele || 'document') !== -1);
  }

  function modal() { return document.getElementById('macro-editor-modal'); }
  function nameInput() { return document.getElementById('macro-editor-name'); }
  function slotsContainer() { return document.getElementById('macro-editor-slots'); }

  function searchable(select, opts) {
    // Liste avec recherche (js/search-select.js) : un modèle se cherche comme une colonne. Le <select> reste la source de la valeur, et la liste native
    // si le composant est indisponible (rend alors null) ; l'appelant appelle `sync()` après l'avoir rempli à nouveau. Le <select> doit déjà avoir son
    // parent : la liste se pose juste après lui.
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
    btn.title = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // La liste « Modèle » d'une carte : « — Choisir un modèle — », « Choisi selon la ligne » (toujours proposé, même à la recherche), puis les modèles. `byRow` : la position choisit son modèle.
  // `withByRow` faux pour un modèle « à la suite » : il n'est jamais choisi selon la ligne.
  function fillModeleSelect(select, selectedId, byRow, withByRow = true) {
    select.innerHTML = '';
    select.appendChild(option('', I18n.t('macro.modal.choosePlaceholder')));
    if (withByRow) {
      const choice = option(BY_ROW_VALUE, I18n.t('macro.modal.byRowChoice'));
      choice.dataset.pinned = 'true';
      select.appendChild(choice);
    }
    availableTemplates().forEach(t => select.appendChild(option(String(t.id), t.nom)));
    select.value = byRow && withByRow ? BY_ROW_VALUE : (selectedId != null ? String(selectedId) : '');
  }

  const blankRule = () => ({ column: '', operator: '=', value: '', modeleId: null });
  // Une position qui choisit son modèle selon la ligne, telle que « + Ajouter un document choisi selon la ligne » la pose.
  function blankByRow() {
    return { type: BY_ROW_KIND, rules: [blankRule()], defaultModeleId: null, condition: null, _when: 'always' };
  }

  // Un document dont le modèle n'est pas encore choisi, tel que « + Ajouter un document » le pose.
  function blankDocument() {
    return { type: DOCUMENT_KIND, modeleId: null, condition: null, _when: 'always' };
  }

  // La copie de travail d'une position enregistrée : une copie profonde, et ce que la liste « Inclure » dit d'elle.
  function workingCopy(stored) {
    const slot = JSON.parse(JSON.stringify(stored));
    const condition = ConditionRules.plainCondition(slot.condition);
    slot.condition = condition;
    slot._when = condition ? 'if' : 'always';
    return slot;
  }

  function ruleRow(slot, rule, ruleIndex) {
    // Une règle de la position qui choisit son modèle : les champs et la mise en page sont ceux de ConditionFields.buildTemplateRule, partagés avec le réglage « Selon la
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

  // Déplace la position `index` d'un cran (delta -1 : plus haut, +1 : plus bas) : le focus reste sur le même bouton de la carte déplacée, ou sur son vis-à-vis quand
  // la carte arrive en bout de liste (le bouton y est grisé).
  function moveSlot(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    const [moved] = slots.splice(index, 1);
    slots.splice(target, 0, moved);
    renderSlots();
    const card = slotsContainer() && slotsContainer().children[target];
    const wanted = card && card.querySelector(delta < 0 ? '.macro-slot-move-up' : '.macro-slot-move-down');
    const other = card && card.querySelector(delta < 0 ? '.macro-slot-move-down' : '.macro-slot-move-up');
    if (wanted && !wanted.disabled) wanted.focus(); else if (other && !other.disabled) other.focus();
  }

  function slotHeader(slot, slotIndex) {
    // Le haut d'une carte : « Document n » (et « choisi selon la ligne » pour une position qui choisit son modèle), puis plus haut, plus bas et supprimer. Les numéros
    // sont ceux du résumé (summaryParts) : le rang dans la composition.
    const title = node('span', 'macro-slot-title', I18n.t('macro.modal.docLabel', { n: slotIndex + 1 }));
    const kind = slot.type === BY_ROW_KIND ? node('span', 'macro-slot-kind', I18n.t('macro.modal.byRowTag')) : null;
    const up = iconButton('macro-slot-move macro-slot-move-up', I18n.t('macro.modal.moveUp', { n: slotIndex + 1 }), () => moveSlot(slotIndex, -1));
    const down = iconButton('macro-slot-move macro-slot-move-down', I18n.t('macro.modal.moveDown', { n: slotIndex + 1 }), () => moveSlot(slotIndex, 1));
    up.disabled = slotIndex === 0;
    down.disabled = slotIndex === slots.length - 1;
    const remove = iconButton('macro-slot-remove', I18n.t('macro.modal.removeSlot', { n: slotIndex + 1 }), () => { slots.splice(slotIndex, 1); renderSlots(); });
    const controls = node('span', 'macro-slot-controls', null, [up, down, remove]);
    return node('div', 'macro-slot-header', null, [node('span', 'macro-slot-heading', null, kind ? [title, kind] : [title]), controls]);
  }

  // La condition d'un document : la combinaison (« Inclure si toutes / au moins une des conditions suivantes »), les lignes et les groupes de la fenêtre de condition d'une
  // bulle (ConditionFields.renderItems : « Et » / « Ou » devant une ligne, « + Groupe »), colonne de n'importe quelle table, valeur saisie ou autre colonne. Le tracé n'est
  // refait que dans sa boîte : le reste de la fenêtre garde sa place et son focus. Rend { box, redraw }.
  function conditionBox(slot) {
    const box = node('div', 'macro-doc-condition');
    const modeSelect = node('select');
    modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
    modeSelect.append(option('all', I18n.t('varCond.modeAll')), option('any', I18n.t('varCond.modeAny')));
    const modeRow = node('div', 'var-condition-mode macro-doc-mode', null, [node('span', null, I18n.t('macro.modal.docModeBefore')), modeSelect, node('span', null, I18n.t('varCond.modeAfter'))]);
    const rulesBox = node('div', 'var-condition-rules macro-doc-rules');
    // Une condition sans aucune règle complète ne s'enregistre pas : le document serait alors toujours inclus. La fenêtre le dit tant que c'est le cas.
    const hint = node('p', 'macro-doc-hint', I18n.t('macro.modal.docIncomplete'));
    const syncHint = () => { hint.hidden = !!ConditionRules.normalizeCondition(slot.condition); };
    function redraw() {
      if (!slot.condition) slot.condition = { mode: 'all', rules: [ConditionFields.emptyRule()] };
      const condition = slot.condition;
      modeRow.hidden = condition.rules.length < 2;
      modeSelect.value = condition.mode === 'any' ? 'any' : 'all';
      rulesBox.replaceChildren();
      ConditionFields.renderItems(rulesBox, {
        items: condition.rules,
        mode: condition.mode,
        setMode: next => { condition.mode = next; },
        buildRow: (rule, row) => ConditionFields.buildRuleRow(rule, row.index, Object.assign({}, row, {
          options: { allTables: true, compareColumn: true, typeAsTitle: true, onColumnChosen: ref => ConditionFields.ensureTableLinked(ref, redraw) },
        })),
        removeItem: index => {
          condition.rules.splice(index, 1);
          if (!condition.rules.length) condition.rules.push(ConditionFields.emptyRule());
          redraw();
        },
        redraw,
      });
      const foot = node('div', 'var-condition-foot', null, [
        ConditionFields.buildAddRuleButton(rulesBox, condition.rules, redraw),
        ConditionFields.buildAddGroupButton(rulesBox, condition.rules, () => condition.mode, redraw),
      ]);
      rulesBox.appendChild(foot);
      syncHint();
    }
    modeSelect.addEventListener('change', () => { slot.condition.mode = modeSelect.value === 'any' ? 'any' : 'all'; redraw(); });
    // Chaque champ d'une règle écrit dans la règle en changeant : l'indication suit la saisie.
    rulesBox.addEventListener('change', syncHint);
    rulesBox.addEventListener('input', syncHint);
    box.append(modeRow, rulesBox, hint);
    return { box, redraw };
  }

  let fieldCounter = 0;
  function labelledField(labelText, control, className) {
    // Un champ d'une carte : son libellé (lié au contrôle) au-dessus, le contrôle dessous.
    control.id = 'macro-doc-field-' + (++fieldCounter);
    const label = node('label', 'macro-doc-label', labelText);
    label.htmlFor = control.id;
    return node('div', 'macro-doc-field' + (className ? ' ' + className : ''), null, [label, control]);
  }

  // Le corps d'une position qui choisit son modèle selon la ligne, sous « Modèle » : la première règle remplie donne son modèle, sinon le modèle par défaut, sinon rien.
  function byRowBody(slot) {
    const rules = node('div', 'macro-slot-rules', null, (slot.rules || []).map((rule, ruleIndex) => ruleRow(slot, rule, ruleIndex)));
    const addRule = node('button', 'macro-rule-add', I18n.t('macro.modal.addRule'));
    addRule.type = 'button';
    addRule.addEventListener('click', () => {
      slot.rules = slot.rules || [];
      slot.rules.push(blankRule());
      renderSlots();
    });
    const defaultLabel = node('label', 'macro-slot-default-label', I18n.t('macro.modal.defaultLabel'));
    const defaultSelect = defaultSelectFor(slot);
    const body = node('div', 'macro-by-row', null, [rules, addRule, node('div', 'macro-slot-sep'), defaultLabel, defaultSelect]);
    return { body, defaultSelect };
  }

  // Un choix dans la liste « Modèle » d'une carte : « Choisi selon la ligne » fait de la position une cascade de règles (ses règles d'avant reviennent si l'on a déjà été là), un
  // modèle en fait un document à un seul modèle (ses règles restent dans le brouillon). La carte se redessine, le focus reste sur sa liste « Modèle ».
  function chooseModel(slot, slotIndex, value) {
    if (value === BY_ROW_VALUE) {
      if (slot.type === BY_ROW_KIND) return;
      slot.type = BY_ROW_KIND;
      if (!Array.isArray(slot.rules) || !slot.rules.length) slot.rules = [blankRule()];
    } else if (slot.type === BY_ROW_KIND) {
      slot.type = DOCUMENT_KIND;
      slot.modeleId = value || null;
    } else {
      slot.modeleId = value || null;
      return;
    }
    renderSlots();
    const card = slotsContainer() && slotsContainer().children[slotIndex];
    const again = card && card.querySelector('.macro-doc-model + .ss-wrap .ss-trigger, select.macro-doc-model');
    if (again) again.focus({ preventScroll: true });
  }

  // Les modèles « à la suite » d'une carte : sous le modèle du document, un par ligne (la liste « Modèle » sans « Choisi selon la ligne », et sa croix), puis « + Ajouter un modèle à la suite ». Le brouillon est
  // `slot.followingModeleIds` (un choix pas encore fait y est null ; il n'est pas enregistré). Les listes avec recherche se posent une fois la carte montée (`attach`). Rend { block, attach }.
  function followingBlock(slot, slotIndex) {
    if (!Array.isArray(slot.followingModeleIds)) slot.followingModeleIds = [];
    const list = slot.followingModeleIds;
    const selects = [];
    const rows = list.map((id, index) => {
      const select = node('select', 'macro-following-model');
      fillModeleSelect(select, id, false, false);
      select.setAttribute('aria-label', I18n.t('macro.modal.followingAria', { n: index + 1, doc: slotIndex + 1 }));
      select.addEventListener('change', () => { list[index] = select.value || null; });
      const remove = iconButton('macro-following-remove', I18n.t('macro.modal.followingRemove', { n: index + 1, doc: slotIndex + 1 }), () => {
        list.splice(index, 1);
        renderSlots();
        const card = slotsContainer() && slotsContainer().children[slotIndex];
        const again = card && card.querySelector('.macro-following-add');
        if (again) again.focus({ preventScroll: true });
      });
      selects.push(select);
      return node('div', 'macro-following-row', null, [select, remove]);
    });
    const add = node('button', 'macro-following-add', I18n.t('macro.modal.addFollowing'));
    add.type = 'button';
    add.addEventListener('click', () => {
      list.push(null);
      renderSlots();
      const card = slotsContainer() && slotsContainer().children[slotIndex];
      const last = card && card.querySelector('.macro-following-row:last-of-type .ss-trigger, .macro-following-row:last-of-type select');
      if (last) last.focus({ preventScroll: true });
    });
    const title = list.length ? [node('div', 'macro-following-title', I18n.t('macro.modal.followingTitle'))] : [];
    const block = node('div', 'macro-following', null, title.concat(rows, [add]));
    return { block, attach: () => selects.forEach(select => searchable(select, { inline: true })) };
  }

  function documentCard(slot, slotIndex) {
    // Le même haut de carte pour toutes les positions : « Modèle » (un modèle, ou « Choisi selon la ligne »), puis « Inclure ce document » - « Toujours » ou « Seulement si… » avec la
    // condition (conditionBox) ; sous « Choisi selon la ligne », les règles de la position.
    const byRow = slot.type === BY_ROW_KIND;
    const modelSelect = node('select', 'macro-doc-model');
    fillModeleSelect(modelSelect, slot.modeleId, byRow);
    modelSelect.addEventListener('change', () => chooseModel(slot, slotIndex, modelSelect.value));
    const modelField = labelledField(I18n.t('macro.modal.docModel'), modelSelect);
    const when = node('select', 'macro-doc-when');
    when.append(option('always', I18n.t('macro.modal.docAlways')), option('if', I18n.t('macro.modal.docOnlyIf')));
    when.value = slot._when === 'if' ? 'if' : 'always';
    const whenField = labelledField(I18n.t('macro.modal.docInclude'), when, 'macro-doc-when-field');
    const condition = conditionBox(slot);
    const syncCondition = () => {
      condition.box.hidden = slot._when !== 'if';
      if (!condition.box.hidden) condition.redraw();
    };
    when.addEventListener('change', () => { slot._when = when.value === 'if' ? 'if' : 'always'; syncCondition(); });
    const parts = [slotHeader(slot, slotIndex), node('div', 'macro-doc-row', null, [modelField, whenField]), condition.box];
    const rowsBody = byRow ? byRowBody(slot) : null;
    if (rowsBody) parts.push(rowsBody.body);
    const following = followingBlock(slot, slotIndex);
    parts.push(following.block);
    const card = node('div', 'macro-slot-card macro-doc-card', null, parts);
    card.dataset.kind = byRow ? 'by-row' : 'document';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', I18n.t('macro.modal.docLabel', { n: slotIndex + 1 }) + (byRow ? ' · ' + I18n.t('macro.modal.byRowTag') : ''));
    syncCondition();
    searchable(modelSelect);
    if (rowsBody) searchable(rowsBody.defaultSelect);
    following.attach();
    return card;
  }

  function renderSlots() {
    const container = slotsContainer();
    if (!container) return;
    container.innerHTML = '';
    if (!slots.length) container.appendChild(node('div', 'macro-slots-empty', I18n.t('macro.modal.noSlots')));
    slots.forEach((slot, slotIndex) => container.appendChild(documentCard(slot, slotIndex)));
  }

  function openModal(tpl) {
    // La composition choisit parmi tous les documents : la fenêtre attend la liste entière quand le document s'est ouvert avant elle (js/early-open.js).
    if (!Templates.isComplete()) { Templates.whenComplete().then(() => openModal(tpl)); return; }
    editingId = tpl ? tpl.id : null;
    const existingSlots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    // Copie profonde : la modale ne doit jamais muter tpl.macroSlots tant que "Enregistrer" n'a pas été cliqué (Annuler doit tout jeter). Un macro-modèle neuf s'ouvre sur un
    // premier document à choisir.
    slots = existingSlots.filter(s => s && (s.type === DOCUMENT_KIND || s.type === BY_ROW_KIND)).map(workingCopy);
    if (!tpl) slots.push(blankDocument());
    if (nameInput()) nameInput().value = tpl ? tpl.nom : '';
    nameOnOpen = tpl ? String(tpl.nom == null ? '' : tpl.nom).trim() : null;
    renderSlots();
    const m = modal();
    if (m) m.style.display = 'flex';
    if (nameInput()) nameInput().focus();
    // Une colonne ajoutée ou retypée dans Grist depuis le chargement : relue à l'ouverture, les règles se retracent si quelque chose a changé (consigne 093).
    const opened = slots;
    if (m) ConditionFields.refreshColumnsOnOpen(renderSlots, { box: m, current: () => slots === opened && m.style.display === 'flex' });
  }

  function closeModal() {
    const m = modal();
    if (m) m.style.display = 'none';
  }

  // « + Ajouter un document » / « + Ajouter un document choisi selon la ligne » : la nouvelle carte prend la fin de la liste, se montre et reçoit le focus (son modèle, ou sa première règle).
  function addSlot(slot) {
    slots.push(slot);
    renderSlots();
    const card = slotsContainer() && slotsContainer().lastElementChild;
    if (!card) return;
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' });
    const first = card.querySelector(slot.type === BY_ROW_KIND ? '.macro-slot-rules .ss-trigger, .macro-slot-rules select, .macro-slot-rules input' : '.ss-trigger, select, input, button:not(.macro-slot-move):not(.macro-slot-remove)');
    if (first) first.focus({ preventScroll: true });
  }

  // Les modèles « à la suite » d'une carte, tels qu'ils s'enregistrent : ceux qui sont choisis, dans l'ordre, et aucune clé quand il n'y en a pas (une composition sans modèle à la suite ne porte rien de plus).
  function keepFollowing(saved, slot) {
    const chosen = (Array.isArray(slot.followingModeleIds) ? slot.followingModeleIds : []).filter(id => id != null && id !== '');
    if (chosen.length) saved.followingModeleIds = chosen;
    return saved;
  }

  function collectSlotsForSave() {
    // Les positions, dans l'ordre de la fenêtre. Les modèles masqués par leur œil (js/macro-templates.js:isModelHidden) restent masqués à travers cette fenêtre : une position
    // reconstruite reprend ceux de ses modèles qui y sont encore (un modèle retiré ne laisse pas son masquage derrière lui, un modèle mis à sa place repart affiché). Un document
    // sans modèle choisi n'est pas écrit ; sa condition ne l'est que sous « Seulement si » et avec au moins une règle complète (ConditionRules.plainCondition).
    const result = [];
    slots.forEach(slot => {
      if (slot.type === DOCUMENT_KIND) {
        if (!slot.modeleId) return;
        const saved = { type: DOCUMENT_KIND, modeleId: slot.modeleId };
        keepFollowing(saved, slot);
        const condition = slot._when === 'if' ? ConditionRules.plainCondition(slot.condition) : null;
        if (condition) saved.condition = condition;
        result.push(MacroTemplates.keepHidden(saved, slot));
        return;
      }
      const rules = (slot.rules || []).filter(r => r.column && r.modeleId);
      const saved = { type: BY_ROW_KIND, rules, defaultModeleId: slot.defaultModeleId || null };
      keepFollowing(saved, slot);
      const condition = slot._when === 'if' ? ConditionRules.plainCondition(slot.condition) : null;
      if (condition) saved.condition = condition;
      result.push(MacroTemplates.keepHidden(saved, slot));
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
      return (key === 'hiddenModeleIds' || key === 'followingModeleIds') && Array.isArray(value) ? value.map(String) : value;
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
    // L'extension « polices » (Grist Factory Suite) allumée ou éteinte change ce que le PDF remplace (les polices libres et Marianne) : la ligne des polices suit (js/pdf-font-notice.js).
    if (typeof Extensions !== 'undefined') Extensions.onChange(paintFonts);
    const addDocumentBtn = document.getElementById('macro-editor-add-document');
    if (addDocumentBtn) addDocumentBtn.addEventListener('click', () => addSlot(blankDocument()));
    const addSlotBtn = document.getElementById('macro-editor-add-slot');
    if (addSlotBtn) addSlotBtn.addEventListener('click', () => {
      addSlot(blankByRow());
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

  // Une position qui n'est pas toujours là : un document sous condition, ou une position qui choisit son modèle selon la ligne.
  function isConditionalPosition(slot) {
    return !!slot && (slot.type === BY_ROW_KIND || !!MacroTemplates.slotCondition(slot));
  }

  function describeSummary(tpl) {
    // La phrase du résumé : combien de documents, dont combien sous condition.
    const list = tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots) ? tpl.macroSlots.slots : [];
    if (!list.length) return I18n.t('macro.summary.empty');
    const conditional = list.filter(isConditionalPosition).length;
    return I18n.t(conditional ? 'macro.summary.textSome' : 'macro.summary.textAll', { count: String(list.length), conditional: String(conditional) });
  }

  function currentTemplate(tpl) {
    // Le macro-modèle tel que le cache des modèles le tient maintenant. Le cache est remplacé objet par objet à chaque relecture des modèles
    // (l'enregistrement automatique en fait une toutes les 15 s au repos) : l'objet reçu par showSummary() peut déjà être périmé, alors que la fenêtre
    // de composition et l'œil d'un modèle doivent partir de la composition à jour.
    return (tpl && tpl.id != null && Templates.byId(tpl.id)) || tpl;
  }

  function summaryParts(tpl) {
    // Les modèles de la composition dans l'ordre où on les lit : un « Document n » par position, avec le modèle du document ou celui de chaque règle de la position qui
    // choisit son modèle et celui de « Si aucune règle ne correspond » (jamais deux fois le même dans une position), sous les mêmes numéros que la fenêtre de composition
    // (renderSlots). Une position sans aucun modèle garde sa ligne : le numéro suivant ne saute pas. `slot` et `slotIndex` disent de quelle position de la composition vient
    // la ligne : c'est dans cette position que l'œil d'un modèle le masque. `thenIds` : les modèles « à la suite » de la position.
    const slots = (tpl && tpl.macroSlots && Array.isArray(tpl.macroSlots.slots)) ? tpl.macroSlots.slots : [];
    return slots.map((slot, slotIndex) => ({
      label: I18n.t('macro.modal.docLabel', { n: slotIndex + 1 }),
      ids: MacroTemplates.choiceModelIds(slot),
      // Ceux qui suivent (« + Ajouter un modèle à la suite »), une fois chacun, et sans ceux que la position choisit déjà : la ligne les dit après « puis ».
      thenIds: MacroTemplates.followingModeleIds(slot).filter(id => !MacroTemplates.choiceModelIds(slot).some(other => String(other) === String(id))),
      slot,
      slotIndex,
    }));
  }

  // Ce qui dit, sous les modèles d'une position, d'où vient son modèle et quand elle est incluse : « Le modèle est choisi selon la ligne » pour une position à règles, puis « Seulement si : Statut = Urgent »
  // (la condition en entier dans l'info-bulle) pour un document sous condition. Rien pour un document à un seul modèle toujours inclus : la liste est alors vide.
  function conditionNotes(slot) {
    const notes = [];
    if (slot && slot.type === BY_ROW_KIND) notes.push(node('span', 'macro-summary-condition', I18n.t('macro.summary.byRow')));
    const condition = MacroTemplates.slotCondition(slot);
    if (condition) {
      const text = VariableConditionData.conditionSummary(condition, { full: true });
      const note = node('span', 'macro-summary-condition', I18n.t('macro.summary.onlyIf', { condition: text }));
      note.title = text;
      notes.push(note);
    }
    return notes;
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
    // Sa page n'est pas encore lue (lecture légère de la table, js/templates.js : renderParts la demande et redessine à son arrivée) : pas d'étiquette « Paysage » d'une page inconnue.
    if (perModel && found.chargee !== false && MacroTemplates.senseOfTemplate(found) === PageSections.LANDSCAPE) tags.push('landscape');
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
      paintFonts();
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

  // Les polices que le PDF ne peut pas écrire dans les modèles que le macro-modèle assemble (26/11 : l'éditeur d'un macro-modèle est vide, le bandeau et la pastille de « Police » n'y disent rien ; la fenêtre d'export, elle, lit
  // le document assemblé). Le même relevé et les mêmes mots que l'éditeur (js/pdf-font-notice.js : scanModels) : une ligne sous le résumé qui nomme les polices, ce que le PDF écrit à leur place et le modèle qui les écrit, et sur chaque
  // modèle concerné une étiquette orange « 2 polices ». Un modèle masqué par son œil n'est pas écrit : ni compté ni étiqueté. Le stylo ouvre le modèle, où le bandeau et « Remplacer… » les changent. Un modèle dont la page
  // n'est pas encore lue (lecture légère, js/templates.js) est lu ici, une seule fois, et la ligne vient à son arrivée. Redessinée sur place (pas de redessin du résumé) : le dessin, l'œil et l'extension « polices » l'appellent.
  const fontReads = new Set();   // les modèles dont la lecture a été demandée pour cette ligne : un échec ne la redemande pas en boucle (le résumé suivant, `showSummary`, repart de zéro)
  function paintFonts() {
    const note = document.getElementById('macro-summary-fonts');
    const parts = document.getElementById('macro-summary-parts');
    if (!note || !parts || typeof PdfFontNotice === 'undefined') return;
    const shown = new Map();
    const unread = [];
    parts.querySelectorAll('.macro-summary-model').forEach((entry) => {
      entry.querySelectorAll('.macro-summary-model-tag[data-tag="fonts"]').forEach(tag => tag.remove());
      const edit = entry.querySelector('.macro-summary-edit');
      const found = edit && edit.dataset.templateId ? Templates.byId(edit.dataset.templateId) : null;
      if (!found || entry.classList.contains('is-hidden-model')) return;
      if (found.chargee === false) { if (!fontReads.has(String(found.id)) && unread.indexOf(found.id) === -1) unread.push(found.id); return; }
      shown.set(String(found.id), found);
      const fonts = PdfFontNotice.scanModels([found]);
      if (!fonts.length) return;
      const tag = node('span', 'macro-summary-model-tag macro-summary-fonts-tag', I18n.t('pdfFonts.macro.tag', { n: fonts.length }));
      tag.dataset.tag = 'fonts';
      tag.title = PdfFontNotice.describeFonts(fonts);
      entry.insertBefore(tag, edit);
    });
    const all = PdfFontNotice.scanModels(Array.from(shown.values()));
    note.hidden = !all.length;
    note.textContent = all.length ? PdfFontNotice.describeModels(all) + '. ' + I18n.t('pdfFonts.macro.open', { n: all.length }) : '';
    if (unread.length) {
      unread.forEach(id => fontReads.add(String(id)));
      Templates.ensureLoaded(unread).then((ok) => { if (ok && document.getElementById('macro-summary-parts') === parts) paintFonts(); });
    }
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
    const waiting = [];
    summaryParts(tpl).forEach(part => {
      const entries = part.ids.map(id => modelEntry(id, Templates.byId(id), part, perModel));
      if (!entries.length) entries.push(node('span', 'macro-summary-model-name', I18n.t('macro.summary.noTemplate')));
      // Un modèle « à la suite » se lit après « puis », dans l'ordre du bloc.
      part.thenIds.forEach(id => entries.push(node('span', 'macro-summary-then', I18n.t('macro.summary.then')), modelEntry(id, Templates.byId(id), part, perModel)));
      part.ids.concat(part.thenIds).forEach((id) => { const found = Templates.byId(id); if (perModel && found && found.chargee === false) waiting.push(id); });
      const label = node('span', 'macro-summary-part-label', part.label);
      list.appendChild(node('li', 'macro-summary-part', null, [label, node('span', 'macro-summary-models', null, entries.concat(conditionNotes(part.slot)))]));
    });
    if (focusedEye) {
      const again = list.querySelector('.macro-summary-eye[data-slot="' + CSS.escape(focusedEye.slot) + '"][data-template-id="' + CSS.escape(focusedEye.id) + '"]');
      if (again && !again.disabled) again.focus();
    }
    // Un modèle dont la page n'est pas encore lue (la table est lourde : la liste vient sans les longs textes, js/templates.js) : son étiquette « Paysage » vient à son arrivée, une seule fois (un échec de lecture ne redessine pas).
    // Cette lecture-là redessine tout le résumé (polices comprises) à son arrivée : la ligne des polices ne la demande pas une seconde fois.
    waiting.forEach(id => fontReads.add(String(id)));
    if (waiting.length) Templates.ensureLoaded(waiting).then((ok) => { if (ok && summaryTpl && document.getElementById('macro-summary-parts') === list) renderParts(currentTemplate(summaryTpl)); });
    paintFonts();
  }

  function renderSummary(tpl) {
    const shown = currentTemplate(tpl);
    const text = document.getElementById('macro-summary-text');
    if (text) text.textContent = describeSummary(shown);
    renderParts(shown);
  }

  function showSummary(tpl) {
    summaryTpl = tpl;
    fontReads.clear();
    renderSummary(tpl);
    const editBtn = document.getElementById('btn-edit-macro');
    if (editBtn) editBtn.onclick = () => openModal(currentTemplate(tpl));
  }

  return { openModal, wire, showSummary, snapshot, restore };
})();
