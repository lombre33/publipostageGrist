// Fenêtre « Condition d'affichage » d'une bulle #Variable : la variable n'apparaît en lecture et à l'export que si la condition est remplie
// (js/reader-mode.js, ConditionRules.conditionHolds). La condition vit dans l'attribut `condition` du nœud : { mode: 'all'|'any', rules: [{ column,
// operator, value }] }. Mêmes lignes Colonne / Opérateur / Valeur que les macro-modèles (js/condition-fields.js), avec les colonnes de toutes les
// tables dans une seule liste avec recherche ; une colonne d'une table pas encore liée ouvre le choix de la clé
// (js/variables.js:ensureLinkConfigured). La colonne choisie s'affiche dans le champ comme une variable du document ; un clic sur elle, un bouton à droite de
// la zone de recherche de la liste ou Ctrl+Entrée ouvrent la fenêtre « Autres attributs » pour y choisir la colonne en voyant sa valeur sur la ligne
// sélectionnée, de Référence en Référence (options.attributesWindow, js/variable-linked-attrs.js:pickColumn). Le champ Valeur a un bouton « autre colonne » : la règle compare alors la colonne à une autre colonne de la
// même ligne, { column, operator, valueColumn } (options.compareColumn, js/condition-rules.js:compareOperands), au lieu d'une valeur saisie.
// La combinaison des règles (`mode`, la même pour toutes) se choisit dans la liste « toutes / au moins une » du haut ou en cliquant le « Et » / « Ou » devant
// une règle (js/condition-fields.js:buildConnector) : les deux se suivent. Pour mêler « et » et « ou » - « A et (B ou C) » - « + Groupe » pose un encadré, les
// parenthèses : un élément de `rules` qui est lui-même { mode, rules }, avec sa propre combinaison (js/condition-fields.js:renderItems, ConditionRules.isGroup).
// Aperçu en direct : la ligne sélectionnée, puis combien de lignes de la table remplissent la condition et la
// première d'entre elles. « Copier » / « Coller » recolle la condition d'une fenêtre dans une autre, comme un brouillon : « Enregistrer » l'applique.
// Ouverte depuis la barre flottante (js/floating-toolbars.js:wireVariableFloatingToolbar). La même fenêtre sert aux nœuds conditionnels - bloc de
// texte (js/conditional-text.js), valeur dans la phrase (js/conditional-value.js), case à cocher (js/conditional-checkbox.js) et image d'une colonne
// Pièces jointes (barre de l'image, js/floating-toolbars.js ; la Lecture la retire, js/reader-mode.js:resolveImageConditions) - avec leurs propres phrases ; « Défaire le bloc » / « Défaire la valeur » retire le cadre et la condition, le texte reste.
// Une bulle a en plus deux petits champs, « Avant » et « Après » : le texte collé à sa valeur (une virgule, une parenthèse), écrit seulement quand
// la variable s'affiche avec une valeur (attributs `before` et `after` du nœud, VariableFormat.withAffixes ; js/reader-mode.js les écrit). Ils se règlent
// ici parce que le cas d'usage est la virgule d'une variable conditionnelle, mais valent aussi pour une bulle sans condition.
// Et une ligne « Sinon afficher » : ce que la bulle écrit à sa place quand la condition n'est pas remplie - un champ à variables, le même pour une bulle, une valeur dans la
// phrase et un bloc de texte : du texte et des variables tapées avec « # » (le champ de l'objet d'un e-mail, js/field-editor.js), une ligne pour la bulle et la valeur, plusieurs
// pour le bloc, qui fait un paragraphe de chacune. Il s'enregistre dans l'attribut `otherwise` du nœud d'une valeur ou d'un bloc (js/conditional-text.js:otherwiseText), dans
// `otherwise` ou `otherwiseText` pour une bulle (js/variable-otherwise.js:storedOf). Les variables s'y cliquent et ont leur barre, comme dans le document ; leur condition et leur
// « Avant » / « Après » se règlent dans une seconde fenêtre, la même, ouverte par-dessus (qui grise alors sa propre ligne : un sinon ne se met pas dans un sinon). La ligne est
// grisée sans règle complète, puisqu'un sinon n'a de sens que pour une condition. Elle est la dernière de la fenêtre, sous l'aperçu : à 700 × 400 la fenêtre défile déjà, et rien
// de ce qui s'y voyait à l'ouverture (les règles, « Avant » / « Après », l'aperçu) ne doit descendre. L'aperçu dit ce que la ligne sélectionnée écrit, sinon compris ; une case à
// cocher n'a pas de sinon.
// Ce fichier est la façade (VariableCondition.openAt, .isOpen, .clearClipboard, .describe) et la fenêtre elle-même (createWindow : sa construction, « Enregistrer », « Défaire », la
// fermeture, l'ouverture sur un nœud) ; le reste est servi par cinq morceaux chargés avant lui : js/variable-condition-data.js (les phrases par nœud, les champs du sinon, le résumé
// d'une condition), js/variable-condition-rules.js (les lignes de règles), js/variable-condition-clipboard.js (Copier / Coller), js/variable-condition-otherwise.js (la ligne « Sinon
// afficher ») et js/variable-condition-preview.js (l'aperçu). Une fenêtre partage son état avec eux par `ctx` (ses éléments, son nœud, son recalcul d'aperçu) et ils s'appellent par lui.
const VariableCondition = (function () {
  const { button, el, option } = Dom;
  const { TEXTS, TEXT_OTHERWISE, conditionSummary } = VariableConditionData;

  // Une fenêtre de condition. Il peut y en avoir deux ouvertes, l'une sur l'autre : le « Sinon afficher » d'une bulle, d'une valeur ou d'un bloc est un champ où l'on tape des
  // variables, et la condition de l'une d'elles - ou son « Avant » / « Après » - se règle dans une seconde fenêtre, la même, ouverte par-dessus la première (`level` 1).
  // Chacune a son état, ses champs et ses identifiants (`suffix`) ; la première garde ceux d'avant.
  function createWindow(level) {
    const suffix = level ? '-' + (level + 1) : '';

    // L'état de la fenêtre, partagé avec les morceaux qui la servent (js/variable-condition-{otherwise,clipboard,rules,preview}.js) : ils le lisent et le posent par `ctx`, et s'appellent les
    // uns les autres par lui. `win` : la fenêtre de js/modal-base.js, créée à la première ouverture ; `refs` : ses éléments ; `state` : { editor, pos, node, hadCondition, working: { mode, rules } },
    // `working` étant une copie : rien n'est écrit dans le nœud avant « Enregistrer » ; `previewRun` : le recalcul de l'aperçu ; `copiedFlashTimer` : le « Copiée » du bouton Copier.
    const ctx = { level, suffix, win: null, refs: null, state: null, previewRun: null, copiedFlashTimer: null };
    Object.assign(ctx, VariableConditionOtherwise.create(ctx), VariableConditionClipboard.create(ctx), VariableConditionRules.create(ctx),
      VariableConditionPreview.create(ctx));
    const {
      updatePreview, keepTypedFieldInView, copyCondition, pasteCondition, buildOtherwiseTextFields, redraw, noOtherwise, syncOtherwiseRow, textField,
      draftOtherwiseText, mountTextFields, resetCopyLabel, renderRules, syncClipboardButtons,
    } = ctx;
    ctx.previewRun = VariableModal.previewRunner(async () => {
      try { await updatePreview(); } finally { keepTypedFieldInView(); }
    });

    const isOpen = () => !!ctx.state;
    const texts = () => TEXTS[ctx.state.node.type.name];
    // Seule une bulle a une valeur à montrer dans l'aperçu : un bloc, une valeur conditionnelle ou une case s'affiche, ou se coche, sans valeur à lire.
    const showsValue = () => ctx.state.node.type.name === 'varBadge';
    // Le texte « Avant » / « Après » tel qu'il est tapé dans la fenêtre ({ before, after }), ou null : sans bulle, sans texte ou fenêtre fermée.
    const draftAffixes = () => (ctx.state && ctx.refs && showsValue() ? VariableFormat.affixes(ctx.refs.beforeInput.value, ctx.refs.afterInput.value) : null);

    function ensureModal() {
      if (ctx.win) return;
      // Échap ferme la fenêtre où que soit le focus (sauf si le choix de la clé est ouvert par-dessus : la base lui laisse le clavier) ; le focus
      // revient à l'éditeur (cf. close), pas à l'élément qui l'avait à l'ouverture.
      ctx.win = ModalBase.create({
        id: 'var-condition-modal' + suffix, titleId: 'var-condition-title' + suffix, boxClass: 'var-modal-content var-condition-modal-content', actionsClass: 'var-modal-actions',
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
      const beforeField = VariableModal.labelledInput('var-condition-before' + suffix, 'var-condition-affix-input');
      const afterField = VariableModal.labelledInput('var-condition-after' + suffix, 'var-condition-affix-input');
      afterField.label.className = 'var-condition-affix-after';
      const affixHint = el('span', 'var-loop-hint');
      for (const input of [beforeField.input, afterField.input]) {
        input.maxLength = VariableFormat.AFFIX_MAX;
        input.autocomplete = 'off';
        input.spellcheck = false;
        // L'aperçu montre le texte tel qu'il s'écrira : il se recalcule à chaque saisie, comme pour une règle.
        input.addEventListener('input', () => ctx.previewRun.schedule());
      }
      affixRow.append(beforeField.label, beforeField.input, afterField.label, afterField.input, affixHint);
      // « Sinon afficher » : une seconde grille, la même, tout en bas. L'aperçu garde sa place, entre les deux : à 700 × 400 ce qui se voyait dès l'ouverture - les règles,
      // « Avant » / « Après », la première ligne de l'aperçu - reste où c'était, la ligne nouvelle vient en dessous. Une fenêtre ne montre que la ligne du nœud qu'elle règle.
      const textOtherwise = Object.fromEntries(Object.entries(TEXT_OTHERWISE).map(([type, kind]) => [type, buildOtherwiseTextFields(kind)]));
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
      ctx.win.actions.append(startGroup, endGroup);
      // Copier / Coller : un seul groupe de nœuds, replacé à chaque tracé des règles sur la ligne de « + Ajouter une condition » (cf. renderRules).
      const copyBtn = button('var-condition-clip-btn');
      const pasteBtn = button('var-condition-clip-btn');
      const clipStatus = el('span', 'var-condition-clip-status');
      clipStatus.setAttribute('role', 'status');
      const clip = el('span', 'var-condition-clip');
      clip.append(copyBtn, pasteBtn, clipStatus);
      ctx.win.body.append(intro, modeRow, rulesBox, affixRow, previewArea, ...Object.values(textOtherwise).map(free => free.row));
      ctx.refs = {
        title: ctx.win.title, intro, modeRow, modeBefore, modeSelect, modeAfter, rulesBox, clip, copyBtn, pasteBtn, clipStatus, currentLine, countLine,
        removeBtn, unwrapBtn, cancelBtn, saveBtn,
        affixRow, beforeLabel: beforeField.label, beforeInput: beforeField.input, afterLabel: afterField.label, afterInput: afterField.input, affixHint,
        textOtherwise,
      };

      modeSelect.addEventListener('change', () => {
        if (!ctx.state) return;
        ctx.state.working.mode = modeSelect.value === 'any' ? 'any' : 'all';
        redraw();
      });
      removeBtn.addEventListener('click', () => { if (ctx.state) { applyAttrs(Object.assign({ condition: null }, noOtherwise())); close(); } });
      unwrapBtn.addEventListener('click', unwrapNode);
      cancelBtn.addEventListener('click', close);
      saveBtn.addEventListener('click', save);
      copyBtn.addEventListener('click', copyCondition);
      pasteBtn.addEventListener('click', pasteCondition);
      // Toute saisie dans les lignes (colonne, opérateur, valeur, « au moins une ») relance l'aperçu, et dégrise - ou regrise - tout de suite la ligne « Sinon afficher » selon que
      // les règles sont complètes.
      const edited = () => { syncOtherwiseRow(); ctx.previewRun.schedule(); };
      ctx.win.box.addEventListener('input', edited);
      ctx.win.box.addEventListener('change', edited);
    }

    // Réécrit des attributs du nœud d'origine (`condition`, `otherwise` - et `otherwiseText` pour une bulle -, et pour une bulle `before` et `after`), retrouvé à sa position
    // capturée au clic.
    // Ce que `patch` ne nomme pas reste tel quel.
    function applyAttrs(patch) {
      const { editor, pos } = ctx.state;
      const node = VariableModal.nodeAtOrigin(ctx.state, texts().saveLost, 'VariableCondition');
      if (!node) return;
      const attrs = Object.assign({}, node.attrs, patch);
      // Une valeur garde le curseur là où il était, dans son texte : une NodeSelection posée sur elle ferait remplacer la valeur entière par la
      // prochaine frappe.
      if (node.type.name === 'conditionalValue') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
      else EditorCore.patchNodeAndReselect(editor, pos, attrs);
    }
    function save() {
      if (!ctx.state) return;
      const condition = ConditionRules.plainCondition(ctx.state.working);
      const patch = { condition };
      if (showsValue()) {
        const around = draftAffixes();
        patch.before = around && around.before;
        patch.after = around && around.after;
      }
      // Un sinon n'a de sens que pour une condition : sans règle complète, il s'en va avec elle. La fenêtre du second niveau ne règle pas le sien (sa ligne est grisée) : il reste
      // tel qu'il est tant que la condition reste.
      if (!condition) Object.assign(patch, noOtherwise());
      else if (textField() && !level) {
        const typed = draftOtherwiseText();
        // Une bulle garde l'écriture d'avant tant que son sinon dit la même chose (VariableOtherwise.storedOf).
        Object.assign(patch, showsValue() ? VariableOtherwise.storedOf(typed, ctx.state.node.attrs.format) : { otherwise: typed });
      }
      applyAttrs(patch);
      close();
    }
    // « Défaire le bloc » / « Défaire la valeur » : le cadre et la condition disparaissent, le texte reste (js/conditional-text.js:unwrap,
    // js/conditional-value.js:unwrap). Le brouillon n'est pas enregistré : le nœud n'existe plus. S'il n'est plus à sa position d'origine, la fenêtre
    // le dit.
    function unwrapNode() {
      const unwrap = ctx.state && texts().unwrap;
      if (!unwrap) return;
      const { editor, pos } = ctx.state;
      const done = ctx.state.node.type.name === 'conditionalValue' ? ConditionalValue.unwrap(editor, pos) : ConditionalText.unwrap(editor, pos);
      if (!done) alert(I18n.t(unwrap.lost));
      close();
    }

    function close() {
      if (!ctx.win) return;
      // La barre d'une variable choisie dans un champ du sinon part avec la fenêtre.
      if (ctx.refs) Object.values(ctx.refs.textOtherwise).forEach(free => FieldEditor.hidePanels(free.input));
      VariableModal.closeWindow(ctx.win, ctx.state && ctx.state.editor, ctx.previewRun, () => { ctx.state = null; clearTimeout(ctx.copiedFlashTimer); });
    }

    // `pos` : position de la bulle, du bloc, de la valeur ou de la case dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est
    // une NodeSelection sur elle).
    function openAt(editor, pos) {
      const node = editor && editor.state.doc.nodeAt(pos);
      if (!node || !TEXTS[node.type.name]) return;
      ensureModal();
      mountTextFields();
      const existing = ConditionRules.plainCondition(node.attrs.condition);
      ctx.state = { editor, pos, node, hadCondition: !!existing, working: existing || { mode: 'all', rules: [ConditionFields.emptyRule()] } };
      const t = texts();
      const r = ctx.refs;
      r.title.textContent = I18n.t(t.title);
      if (showsValue()) r.intro.replaceChildren(el('span', 'var-badge', VariableModal.badgeText(node)), document.createTextNode(' ' + I18n.t(t.intro)));
      else r.intro.textContent = I18n.t(t.intro);
      r.modeBefore.textContent = I18n.t(t.modeBefore);
      r.modeAfter.textContent = I18n.t('varCond.modeAfter');
      r.modeSelect.setAttribute('aria-label', I18n.t('varCond.modeAria'));
      r.modeSelect.replaceChildren(option('all', I18n.t('varCond.modeAll')), option('any', I18n.t('varCond.modeAny')));
      r.removeBtn.textContent = I18n.t('varCond.remove');
      r.removeBtn.hidden = !ctx.state.hadCondition;
      r.unwrapBtn.hidden = !t.unwrap;
      if (t.unwrap) {
        r.unwrapBtn.textContent = I18n.t(t.unwrap.label);
        r.unwrapBtn.title = I18n.t(t.unwrap.title);
      }
      r.cancelBtn.textContent = I18n.t('common.cancel');
      r.saveBtn.textContent = I18n.t('common.save');
      r.affixRow.hidden = !showsValue();
      for (const [type, free] of Object.entries(r.textOtherwise)) free.row.hidden = type !== node.type.name;
      r.beforeLabel.textContent = I18n.t('varCond.affixBefore');
      r.afterLabel.textContent = I18n.t('varCond.affixAfter');
      r.beforeInput.title = I18n.t('varCond.affixBeforeTitle');
      r.afterInput.title = I18n.t('varCond.affixAfterTitle');
      r.affixHint.textContent = I18n.t('varCond.affixHint');
      r.beforeInput.value = VariableFormat.affix(node.attrs.before) || '';
      r.afterInput.value = VariableFormat.affix(node.attrs.after) || '';
      const free = textField();
      if (free) {
        free.label.textContent = I18n.t('varCond.otherwiseLabel');
        free.input.placeholder = I18n.t(free.kind.placeholder);
        // Une bulle d'avant les variables montre son sinon comme une bulle du champ (VariableOtherwise.fieldOf).
        free.input.value = (showsValue() ? VariableOtherwise.fieldOf(node.attrs) : ConditionalText.otherwiseText(node.attrs.otherwise)) || '';
      }
      resetCopyLabel();
      r.pasteBtn.textContent = I18n.t('varCond.clip.paste');
      r.clipStatus.textContent = '';
      renderRules();
      syncOtherwiseRow();
      // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte ; elle est sous le voile de toute façon (--z-floating-toolbar,
      // css/style.css).
      EditorCore.hideFloatingContextToolbars();
      ctx.win.show(() => r.rulesBox.querySelector('select.macro-rule-column'));
      updatePreview();
    }

    // Vrai quand `editor` est celui d'un champ « Sinon afficher » de cette fenêtre : la condition d'une variable qu'on y tape s'ouvre dans la fenêtre d'après.
    const owns = editor => !!ctx.refs && Object.values(ctx.refs.textOtherwise).some(free => free.mounted && FieldEditor.of(free.input) === editor);

    Object.assign(ctx, { texts, showsValue, draftAffixes });

    return { openAt, isOpen, owns, syncClipboard: syncClipboardButtons };
  }

  const windows = [];
  const windowAt = level => windows[level] || (windows[level] = createWindow(level));

  // `pos` : position de la bulle, du bloc, de la valeur ou de la case dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  // Un nœud qui est dans le champ « Sinon afficher » d'une fenêtre s'ouvre dans la fenêtre d'après, au-dessus.
  function openAt(editor, pos) {
    windowAt(windows.findIndex(w => w && w.owns(editor)) + 1).openAt(editor, pos);
  }
  // Une fenêtre de condition est ouverte ; `fromLevel` 1 : une fenêtre ouverte par-dessus une autre (celle d'une variable du « Sinon afficher » d'une fenêtre).
  const isOpen = fromLevel => windows.some((w, level) => w && level >= (fromLevel || 0) && w.isOpen());
  function clearClipboard() {
    VariableConditionClipboard.clear();
    windows.forEach(w => w && w.syncClipboard());
  }

  return { openAt, isOpen, clearClipboard, describe: conditionSummary };
})();
