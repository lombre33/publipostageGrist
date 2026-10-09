// Bulle « Calcul » : la ligne « Calcul » du menu des variables (onglet Chips, js/variables.js) ouvre la fenêtre de ce fichier ; la bulle qui en sort
// (nœud `calcBadge`, js/editor-nodes.js) porte une formule que js/formula.js sait lire et évaluer, et que js/reader-mode.js remplace par son résultat
// en Lecture, en PDF et en Word. Ici : la fenêtre « Insérer / Modifier le calcul », un champ où la touche de déclenchement complète les colonnes
// comme dans le nom du PDF (Variables.initFilenameInput), une rangée de fonctions, et le résultat du calcul pour la ligne courante, mis à jour à la
// frappe.
//
// La formule saisie (« #Facture.SousTotal * 0,2 + SOMME(#Lignes.Prix) ») n'est jamais enregistrée telle quelle : Formula.fromDisplay la ramène à
// l'écriture enregistrée, que la bulle relit dans la langue et avec la touche de déclenchement du moment. À l'enregistrement, chaque table citée qui
// n'est ni celle de la page ni celle d'une zone répétée est liée à la table de la page - la fenêtre de la clé de correspondance s'ouvre pour celles
// qui ne le sont pas encore, comme à l'insertion d'une variable d'une autre table.
//
// Le nœud est inséré à la validation, pas à l'ouverture : « Annuler » ne laisse rien dans le document, et l'historique garde une seule étape.
// Styles : css/variable-calc.css.
const VariableCalc = (function () {
  const { el, button } = Dom;
  let win = null;
  let refs = null;
  let ctx = null; // { editor, pos, isNew, format, loopTables, attempted }
  const previewRun = VariableModal.previewRunner(refreshPreview);
  const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lang = () => I18n.getLang();
  const trigger = () => Variables.triggerChar();

  // === Du texte saisi à la formule enregistrée === Une touche de déclenchement suivie d'un nom que la saisie ne reconnaît pas comme colonne (faute
  // de frappe, colonne supprimée) : le mot tapé, ou null.
  function unknownVariableIn(text, spans) {
    const re = new RegExp(escapeRegExp(trigger()) + '[A-Za-z0-9_.]*', 'g');
    let found;
    while ((found = re.exec(text))) {
      if (!spans.some(span => span.start <= found.index && found.index < span.end)) return found[0];
    }
    return null;
  }
  // { stored, ast } ou { error: message } : ce que dit le champ, lu par le moteur.
  function compile(text) {
    const spans = Variables.findTextVariables(text);
    const unknown = unknownVariableIn(text, spans);
    if (unknown) return { error: I18n.t('calc.error.unknownColumn', { text: unknown, trigger: trigger() }) };
    const stored = Formula.fromDisplay(text, spans, { lang: lang() });
    const parsed = Formula.parse(stored);
    if (parsed.error) return { error: Variables.formulaErrorText(parsed.error) };
    return { stored, ast: parsed.ast };
  }
  const typedFormula = stored => Formula.toDisplay(stored, { trigger: trigger(), lang: lang() });

  // Les tables de la formule qui ne sont ni celle de la page ni celle de la zone répétée où se pose la bulle (elle y lit la ligne du tour :
  // js/loop-rules.js).
  function otherTables(ast) {
    const current = GristAPI.getCurrentTableId();
    return [...new Set(Formula.variablesOf(ast).map(variable => variable.table))].filter(table => table !== current);
  }

  // === Résultat sous le champ === `state` : 'hint' (texte discret : un calcul pas fini, un calcul qui n'a rien à montrer), 'ok' (le résultat) ou
  // 'error' (rouge, après une validation refusée).
  function showStatus(text, state) {
    refs.status.textContent = text;
    refs.status.dataset.state = state;
  }
  async function refreshPreview() {
    if (!win || !win.isOpen()) return;
    const outdated = previewRun.begin();
    const text = refs.input.value;
    if (!text.trim()) { showStatus(I18n.t('calc.status.empty'), 'hint'); return; }
    const compiled = compile(text);
    if (compiled.error) { showStatus(compiled.error, ctx.attempted ? 'error' : 'hint'); return; }
    const tableId = GristAPI.getCurrentTableId();
    const unlinked = otherTables(compiled.ast).filter(table => !GristAPI.getLinkRule(table));
    if (unlinked.length) {
      const inLoop = unlinked.find(table => ctx.loopTables.indexOf(table) !== -1);
      showStatus(inLoop ? I18n.t('calc.status.inLoop', { table: inLoop }) : I18n.t('calc.status.notLinked', { table: unlinked[0], current: tableId }), 'hint');
      return;
    }
    const record = GristAPI.getCurrentRecord();
    if (!record) { showStatus(I18n.t('calc.status.noRow'), 'hint'); return; }
    // keepZero : le zéro s'affiche ici, la fenêtre dit ensuite que le document ne l'écrit pas.
    const result = await Variables.resolveCalcResult(compiled.stored, tableId, record, ctx.format, { keepZero: true });
    if (outdated()) return;
    if (result.isError) showStatus(result.message, ctx.attempted ? 'error' : 'hint');
    else if (result.value === null) showStatus(I18n.t('calc.status.blank'), 'hint');
    else if (result.value === 0 && Variables.zeroHidden(ctx.format, 'Numeric')) showStatus(I18n.t('calc.status.zero'), 'hint');
    else showStatus(I18n.t('calc.status.result', { value: result.text }), 'ok');
  }

  // === La fenêtre ===
  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas à l'élément qui l'avait - la bulle y reste sélectionnée.
    win = ModalBase.create({ id: 'pp-calc-modal', titleId: 'pp-calc-title', size: 'md', boxClass: 'pp-calc-box', actionsClass: 'var-modal-actions', onEscape: closeWindow, restoreFocus: false });
    const { label, input } = VariableModal.labelledInput('pp-calc-formula', 'pp-dialog-input');
    label.className = 'pp-dialog-label';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-calc-hint pp-calc-status');
    // L'indication et le résultat commencent sous le champ, pas sous son libellé.
    const hint = el('p', 'pp-link-note');
    hint.id = 'pp-calc-hint';
    const functions = el('div', 'pp-calc-functions');
    const functionsLabel = el('span', 'pp-calc-functions-label');
    functions.appendChild(functionsLabel);
    const functionButtons = Formula.FUNCTION_ORDER.map(canonical => {
      const fn = button('pp-calc-function');
      fn.dataset.fn = canonical;
      // mousedown sans effet sur le focus : le curseur et la sélection restent dans le champ, que le clic complète.
      fn.addEventListener('mousedown', event => event.preventDefault());
      fn.addEventListener('click', () => insertFunction(canonical));
      functions.appendChild(fn);
      return fn;
    });
    const functionsHint = el('p', 'pp-link-note');
    const status = el('p', 'pp-calc-status');
    status.id = 'pp-calc-status';
    status.setAttribute('role', 'status');
    win.body.append(label, input, hint, functions, functionsHint, status);
    const { cancel, ok } = win.addButtons();
    refs = { label, input, hint, functionsLabel, functionButtons, functionsHint, status, cancel, ok };

    // La liste des colonnes s'ouvre sous le champ après la touche de déclenchement, comme dans le nom du PDF ; Entrée y choisit une colonne avant de
    // valider la fenêtre (son écouteur passe le premier et prend l'évènement : `defaultPrevented`).
    Variables.initFilenameInput(input);
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); previewRun.schedule(); });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      ok.click();
    });
    cancel.addEventListener('click', closeWindow);
    ok.addEventListener('click', apply);
  }

  function closeWindow() {
    previewRun.cancel();
    if (win) win.hide();
    if (ctx && ctx.editor) ctx.editor.commands.focus();
  }

  // Une fonction posée au curseur du champ : « SOMME() » le curseur entre les parenthèses, ou autour du texte sélectionné.
  function insertFunction(canonical) {
    const input = refs.input;
    const typed = Formula.FUNCTIONS[canonical][lang() === 'en' ? 'en' : 'fr'];
    const start = input.selectionStart == null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd == null ? start : input.selectionEnd;
    const wrapped = input.value.slice(start, end);
    input.setRangeText(typed + '(' + wrapped + ')', start, end, 'end');
    const caret = wrapped ? start + typed.length + 2 + wrapped.length : start + typed.length + 1;
    input.focus();
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function openWindow(editor, opts) {
    ensure();
    ctx = { editor, pos: opts.pos, isNew: opts.isNew, format: opts.format || null, loopTables: VariableLoop.loopTablesAt(editor.state, opts.pos), attempted: false };
    // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte ; elle revient avec la sélection à la fermeture.
    EditorCore.hideFloatingContextToolbars();
    const { label, input, hint, functionsLabel, functionButtons, functionsHint, cancel, ok } = refs;
    win.title.textContent = I18n.t(opts.isNew ? 'calc.title.new' : 'calc.title.edit');
    label.textContent = I18n.t('calc.formula.label');
    input.placeholder = I18n.t('calc.formula.placeholder', { trigger: trigger() });
    input.value = opts.formula ? typedFormula(opts.formula) : '';
    input.removeAttribute('aria-invalid');
    hint.textContent = I18n.t('calc.formula.hint', { trigger: trigger() });
    functionsLabel.textContent = I18n.t('calc.functions.label');
    const names = Formula.functionNames(lang());
    functionButtons.forEach((fn, i) => {
      fn.textContent = names[i];
      fn.title = I18n.t('calc.fn.' + fn.dataset.fn);
    });
    functionsHint.textContent = I18n.t('calc.functions.hint', { trigger: trigger() });
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(opts.isNew ? 'common.insert' : 'common.confirm');
    showStatus('', 'hint');
    win.show(input);
    input.setSelectionRange(input.value.length, input.value.length);
    refreshPreview();
  }

  // Valide : la formule doit se lire, puis chaque table citée doit être liée à celle de la page. Une erreur reste dans la fenêtre, rouge, le champ au
  // premier plan.
  async function apply() {
    const { input } = refs;
    const here = ctx;
    const refuse = message => {
      here.attempted = true;
      showStatus(message, 'error');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    };
    if (!input.value.trim()) { refuse(I18n.t('formula.error.empty')); return; }
    const compiled = compile(input.value);
    if (compiled.error) { refuse(compiled.error); return; }
    for (const table of otherTables(compiled.ast)) {
      if (here.loopTables.indexOf(table) !== -1) continue;
      // Annulée, la fenêtre de la clé laisse celle-ci ouverte : la personne peut corriger la formule ou réessayer.
      if (!(await Variables.ensureLinkConfigured({ table }))) { input.focus(); return; }
    }
    if (ctx !== here || !win.isOpen()) return;
    const editor = here.editor;
    if (here.isNew) {
      editor.chain().focus().insertContentAt(here.pos, { type: 'calcBadge', attrs: { formula: compiled.stored, format: null } }).run();
    } else {
      const node = editor.state.doc.nodeAt(here.pos);
      // La bulle a bougé ou disparu pendant que la fenêtre était ouverte : rien à écrire à cette place.
      if (!node || node.type.name !== 'calcBadge') { closeWindow(); return; }
      EditorCore.patchNodeAndReselect(editor, here.pos, Object.assign({}, node.attrs, { formula: compiled.stored }));
    }
    closeWindow();
  }

  // === Entrées === Pose d'un nouveau calcul à la place de « #calc » (le texte tapé après la touche de déclenchement) : le texte part, la fenêtre
  // s'ouvre, la bulle n'entre qu'à la validation.
  function insertFromPanel(editor, range) {
    editor.chain().focus().deleteRange(range).run();
    openWindow(editor, { pos: range.from, isNew: true, formula: '', format: null });
  }
  // Modification de la bulle qui est à `pos` (barre flottante, double-clic, Entrée sur la bulle sélectionnée).
  function openAt(editor, pos) {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'calcBadge') return;
    openWindow(editor, { pos, isNew: false, formula: node.attrs.formula, format: node.attrs.format });
  }
  const isOpen = () => !!win && win.isOpen();

  return { insertFromPanel, openAt, isOpen };
})();
