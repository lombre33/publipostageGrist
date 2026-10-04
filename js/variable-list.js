// Fenêtre « Liste » d'une bulle #Variable dont la colonne est une liste (demande d'Antoine du 2026-10-04 : « une UI simple et efficace pour gérer les listes - tout afficher avec le séparateur voulu,
// comme les boucles, ou afficher le n-ième en laissant choisir n, avec premier et dernier déjà prêts »). Une colonne Liste de choix ou Liste de références (ChoiceList, RefList) livre plusieurs valeurs :
// sans réglage la bulle les écrit toutes, séparées par « , » (le seul rendu d'avant cette fenêtre, qui reste celui d'une bulle déjà posée). Le réglage vit dans le `format.list` de la bulle
// (js/variable-format.js : pick, index, separator, lastSeparator) ; Variables.formatValue le lit pour tous les chemins de rendu - Lecture, PDF, Word, Excel, e-mail, export en lot.
// Même gabarit que la fenêtre de boucle (js/variable-loop.js) et mêmes champs de séparateur ; l'aperçu est calculé sur la ligne sélectionnée avec le vrai Variables.formatValue, il ne peut donc pas
// écrire autre chose que le document. Ouverte depuis la barre flottante de la bulle (js/floating-toolbars.js:wireVariableFloatingToolbar).
const VariableList = (function () {
  const PICKS = ['all', 'first', 'last', 'nth'];
  // Valeurs citées dans l'aperçu : les premières seulement, la suite en « … ».
  const PREVIEW_VALUES = 5;

  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, had, working } - `working` est une copie : rien n'est écrit dans la bulle avant « Enregistrer ».
  let state = null;
  let previewGeneration = 0;
  let previewTimer = null;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function isOpen() { return !!state; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function shorten(text, max) { return text.length > max ? text.slice(0, max - 1) + '…' : text; }

  // La colonne de la bulle (ou le bout de son chemin « Responsable.Competences ») est une liste de choix ou une liste de références.
  function isListColumn(attrs) {
    return !!attrs && !!attrs.table && !!attrs.column && VariableFormat.isListType(GristAPI.getColumnType(attrs.table, attrs.column));
  }
  // Les réglages d'une bulle, complets (jamais null) : ce que la fenêtre montre à l'ouverture.
  function listOf(node) { return VariableFormat.normalizeList(node.attrs.format && node.attrs.format.list); }

  // Icône Liste de la barre flottante pour une bulle : active quand un réglage s'écarte du défaut ; grisée, avec l'info-bulle qui dit pourquoi, pour une colonne qui n'est pas une liste, ou quand une
  // boucle écrit déjà chaque valeur de la liste (à chaque tour la bulle ne porte plus qu'une valeur : « première » ou « n-ième » n'auraient aucun sens).
  function status(node) {
    if (!isListColumn(node.attrs)) return { active: false, enabled: false, title: I18n.t('varToolbar.listDisabled') };
    if (LoopRules.normalizeLoop(node.attrs.loop)) return { active: false, enabled: false, title: I18n.t('varToolbar.listLoop') };
    return { active: !VariableFormat.isDefaultList(node.attrs.format && node.attrs.format.list), enabled: true, title: I18n.t('varToolbar.list') };
  }

  // === Fenêtre ===
  function ensureModal() {
    if (win) return;
    // Cadre, titre, zone qui défile et ligne de boutons : js/modal-base.js. Échap ferme la fenêtre où que soit le focus ; le focus revient à l'éditeur (cf. close), pas à l'élément qui l'avait à l'ouverture.
    win = ModalBase.create({
      id: 'var-list-modal', titleId: 'var-list-title', boxClass: 'var-modal-content var-list-modal-content', actionsClass: 'var-modal-actions',
      onEscape: close, restoreFocus: false,
    });
    const box = win.box;
    const intro = el('p', 'var-modal-intro');

    const pickLabel = el('div', 'var-loop-label');
    pickLabel.id = 'var-list-pick-label';
    const pickSeg = el('div', 'var-loop-seg');
    pickSeg.setAttribute('role', 'group');
    pickSeg.setAttribute('aria-labelledby', 'var-list-pick-label');
    // Les quatre boutons sont posés une fois : un clic ne les remplace pas, le focus reste sur celui qu'on vient d'enfoncer.
    const pickButtons = {};
    PICKS.forEach(pick => {
      const btn = el('button');
      btn.type = 'button';
      btn.dataset.pick = pick;
      btn.addEventListener('click', () => setPick(pick));
      pickSeg.appendChild(btn);
      pickButtons[pick] = btn;
    });

    // « Toutes les valeurs » : les deux séparateurs des boucles (js/variable-loop.js), le second vide = le même que le premier.
    const separatorRow = el('div', 'var-loop-seps var-list-seps');
    const sepLabel = el('label');
    sepLabel.htmlFor = 'var-list-sep';
    const sepInput = el('input', 'var-loop-sep-input');
    sepInput.type = 'text';
    sepInput.id = 'var-list-sep';
    const lastLabel = el('label');
    lastLabel.htmlFor = 'var-list-last';
    const lastInput = el('input', 'var-list-last-input');
    lastInput.type = 'text';
    lastInput.id = 'var-list-last';
    const sepHint = el('span', 'var-loop-hint');
    separatorRow.append(sepLabel, sepInput, lastLabel, lastInput, sepHint);

    // « La n-ième » : le numéro, de 1 à 999.
    const numberRow = el('div', 'var-loop-seps var-list-number');
    const numberLabel = el('label');
    numberLabel.htmlFor = 'var-list-index';
    const numberInput = el('input', 'var-list-index-input');
    numberInput.type = 'number';
    numberInput.id = 'var-list-index';
    numberInput.min = '1';
    numberInput.max = String(VariableFormat.LIST_INDEX_MAX);
    numberInput.step = '1';
    const numberHint = el('span', 'var-loop-hint');
    numberRow.append(numberLabel, numberInput, numberHint);

    const preview = el('div', 'var-condition-debug');
    preview.setAttribute('aria-live', 'polite');
    const previewLine = el('div', 'var-condition-debug-line');
    preview.appendChild(previewLine);

    const resetBtn = el('button', 'var-modal-danger');
    resetBtn.type = 'button';
    const spacer = el('span', 'var-modal-spacer');
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'var-modal-primary');
    saveBtn.type = 'button';
    win.actions.append(resetBtn, spacer, cancelBtn, saveBtn);

    win.body.append(intro, pickLabel, pickSeg, separatorRow, numberRow, preview);
    refs = {
      title: win.title, intro, pickLabel, pickButtons, separatorRow, sepLabel, sepInput, lastLabel, lastInput, sepHint,
      numberRow, numberLabel, numberInput, numberHint, previewLine, resetBtn, cancelBtn, saveBtn,
    };

    sepInput.addEventListener('input', () => { if (state) state.working.separator = sepInput.value; });
    lastInput.addEventListener('input', () => { if (state) state.working.lastSeparator = lastInput.value; });
    // Le numéro est lu pendant la frappe (le champ peut être vide un instant) et ramené à 1-999 en le quittant, comme l'enregistrement le fera.
    numberInput.addEventListener('input', () => { if (state) state.working.index = VariableFormat.normalizeList({ index: numberInput.value }).index; });
    numberInput.addEventListener('change', () => { if (state) numberInput.value = String(state.working.index); });
    resetBtn.addEventListener('click', () => { if (state) { applyList(null); close(); } });
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    // Toute saisie (séparateurs, numéro) relance l'aperçu, avec un court délai pour ne pas recalculer à chaque touche.
    box.addEventListener('input', schedulePreview);
    box.addEventListener('change', schedulePreview);
  }

  function renderIntro() {
    const { table, column } = state.node.attrs;
    const badge = el('span', 'var-badge', Variables.triggerChar() + (state.node.attrs.key || ''));
    const type = GristAPI.getColumnType(table, column) || '';
    const text = type.indexOf('RefList:') === 0 ? I18n.t('varList.intro.ref', { table: type.slice(8) }) : I18n.t('varList.intro.choice');
    refs.intro.replaceChildren(badge, document.createTextNode(' ' + text));
  }
  // Le bouton du choix en cours est enfoncé ; les champs de « toutes » et de « n-ième » n'apparaissent que pour leur choix (le numéro, ni pour la première ni pour la dernière).
  function renderPick() {
    const { pickButtons, separatorRow, numberRow } = refs;
    PICKS.forEach(pick => {
      const on = pick === state.working.pick;
      pickButtons[pick].classList.toggle('is-on', on);
      pickButtons[pick].setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    separatorRow.hidden = state.working.pick !== 'all';
    numberRow.hidden = state.working.pick !== 'nth';
  }
  function setPick(pick) {
    if (!state || state.working.pick === pick) return;
    state.working.pick = pick;
    renderPick();
    updatePreview();
  }

  // Réglage tel qu'il sera enregistré : seulement les clés utiles (js/variable-format.js:storedList), null quand tout est par défaut.
  function workingList() { return VariableFormat.storedList(state.working); }

  // === Aperçu === La ligne sélectionnée dans Grist : les valeurs de la liste, puis ce que le document en écrit - le vrai Variables.formatValue avec le réglage en cours.
  function setLine(text, good) {
    const line = refs.previewLine;
    line.replaceChildren();
    line.hidden = !text;
    line.classList.toggle('is-good', !!good);
    if (!text) return;
    if (good) {
      const icon = el('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex:none; display:inline-flex; width:14px; height:14px; margin-top:2px;';
      icon.innerHTML = Icons.svg('acceptAll');
      line.appendChild(icon);
    }
    line.appendChild(el('span', null, text));
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 250);
  }
  async function updatePreview() {
    if (!state || !refs) return;
    clearTimeout(previewTimer);
    const gen = ++previewGeneration;
    const stale = () => gen !== previewGeneration || !state;
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    if (!record || !tableId) { setLine(I18n.t('varCond.debug.noRecord'), false); return; }
    setLine(I18n.t('varCond.debug.computing'), false);
    try {
      const { table, column, format } = state.node.attrs;
      const raw = await Variables.resolveRawValue(table, column, tableId, record, {});
      if (stale()) return;
      if (raw.error) { setLine(I18n.t('linkConfig.previewUnavailable'), false); return; }
      const values = VariableFormat.flattenList(raw.value == null ? [] : raw.value)
        .map(v => Variables.formatValue(v, format, table, column))
        .filter(text => text !== '' && text != null);
      if (!values.length) { setLine(I18n.t('varList.preview.empty', { id: record.id }), false); return; }
      const list = workingList();
      const written = Variables.formatValue(raw.value, Object.assign({}, format, list ? { list } : { list: null }), table, column);
      const shown = values.slice(0, PREVIEW_VALUES).map(v => shorten(v, 40)).join(', ') + (values.length > PREVIEW_VALUES ? ', …' : '');
      if (written === '') {
        setLine(I18n.t('varList.preview.beyond', { id: record.id, count: values.length, values: shown, index: state.working.index }), false);
        return;
      }
      setLine(I18n.t('varList.preview.values', { id: record.id, count: values.length, values: shown, text: shorten(written, 240) }), true);
    } catch (e) {
      console.warn('[VariableList] aperçu indisponible', e);
      if (!stale()) setLine(I18n.t('linkConfig.previewUnavailable'), false);
    }
  }

  // Réécrit le `format.list` de la bulle d'origine, retrouvée à sa position capturée au clic - seulement si c'est toujours la même variable. Les autres clés du format restent ; `list` nul retire la clé,
  // et une bulle qui n'a plus aucun réglage retrouve un format vide (plus de point bleu, plus de data-format dans le modèle).
  function applyList(list) {
    const { editor, pos, node: original } = state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || node.attrs.table !== original.attrs.table || node.attrs.column !== original.attrs.column) {
      console.warn('[VariableList] bulle introuvable à sa position d\'origine - réglage non enregistré.');
      alert(I18n.t('varList.saveLost'));
      return false;
    }
    const format = Object.assign({}, node.attrs.format);
    if (list) format.list = list; else delete format.list;
    EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, node.attrs, { format: Object.keys(format).length ? format : null }));
    return true;
  }
  // Rien n'est écrit quand rien n'a changé : pas d'étape d'annulation pour un « Enregistrer » sans modification.
  function save() {
    if (!state) return;
    const list = workingList();
    const before = VariableFormat.storedList(state.node.attrs.format && state.node.attrs.format.list);
    if (!same(list, before)) applyList(list);
    close();
  }

  function close() {
    if (!win) return;
    const editor = state && state.editor;
    win.hide();
    state = null;
    previewGeneration += 1;
    clearTimeout(previewTimer);
    // La bulle est toujours sélectionnée : rendre le focus à l'éditeur fait réapparaître sa barre flottante.
    if (editor) editor.view.focus();
  }

  // `pos` : position de la bulle dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || !status(node).enabled) return;
    ensureModal();
    state = {
      editor, pos, node,
      had: !VariableFormat.isDefaultList(node.attrs.format && node.attrs.format.list),
      working: listOf(node),
    };
    const r = refs;
    r.title.textContent = I18n.t('varList.title');
    r.pickLabel.textContent = I18n.t('varList.section.pick');
    PICKS.forEach(pick => { r.pickButtons[pick].textContent = I18n.t('varList.pick.' + pick); });
    r.sepLabel.textContent = I18n.t('varList.separator');
    r.lastLabel.textContent = I18n.t('varList.lastSeparator');
    r.lastInput.placeholder = I18n.t('varList.lastSeparatorPlaceholder');
    r.sepHint.textContent = I18n.t('varList.separatorHint');
    r.numberLabel.textContent = I18n.t('varList.number');
    r.numberHint.textContent = I18n.t('varList.numberHint');
    r.sepInput.value = state.working.separator;
    r.lastInput.value = state.working.lastSeparator;
    r.numberInput.value = String(state.working.index);
    r.resetBtn.textContent = I18n.t('varList.reset');
    r.resetBtn.hidden = !state.had;
    r.cancelBtn.textContent = I18n.t('common.cancel');
    r.saveBtn.textContent = I18n.t('common.save');
    renderIntro();
    renderPick();
    // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte (règle d'Antoine) ; elle est sous le voile de toute façon (--z-floating-toolbar, css/style.css).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => r.pickButtons[state.working.pick]);
    updatePreview();
  }

  return { open, close, isOpen, status, isListColumn };
})();
