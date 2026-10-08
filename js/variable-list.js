// Fenêtre « Liste » d'une bulle #Variable dont la colonne est une liste de choix ou de références (ChoiceList, RefList) : toutes les valeurs avec le
// séparateur voulu, ou la première, la dernière, la n-ième. Sans réglage la bulle les écrit toutes, séparées par « , ». Le réglage vit dans le
// `format.list` de la bulle (js/variable-format.js), que Variables.formatValue lit pour tous les rendus : Lecture, PDF, Word, Excel, e-mail, export
// en lot. La case « Un document par valeur » (js/list-split.js) fait sortir un document par valeur aux exports PDF, Word et Excel ; la Lecture et
// l'e-mail gardent l'affichage réglé ici. Même gabarit que la fenêtre de boucle (js/variable-loop.js) ; l'aperçu passe par le vrai
// Variables.formatValue sur la ligne sélectionnée, il ne peut donc pas écrire autre chose que le document. Ouverte depuis la barre flottante de la
// bulle (js/floating-toolbars.js:wireVariableFloatingToolbar).
const VariableList = (function () {
  const el = Dom.el;
  const { setLine, shorten } = VariableModal;
  const PICKS = ['all', 'first', 'last', 'nth'];
  // Valeurs citées dans l'aperçu : les premières seulement, la suite en « … ».
  const PREVIEW_VALUES = 5;

  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, had, working } - `working` est une copie : rien n'est écrit dans la bulle avant « Enregistrer ».
  let state = null;
  const previewRun = VariableModal.previewRunner(updatePreview);

  function isOpen() { return !!state; }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // La colonne de la bulle (ou le bout de son chemin « Responsable.Competences ») est une liste de choix ou une liste de références.
  function isListColumn(attrs) {
    return !!attrs && !!attrs.table && !!attrs.column && VariableFormat.isListType(GristAPI.getColumnType(attrs.table, attrs.column));
  }
  // Les réglages d'une bulle, complets (jamais null) : ce que la fenêtre montre à l'ouverture.
  function listOf(node) { return VariableFormat.normalizeList(node.attrs.format && node.attrs.format.list); }

  // Icône Liste de la barre flottante : active quand un réglage s'écarte du défaut ; grisée, avec l'info-bulle qui dit pourquoi, pour une colonne qui
  // n'est pas une liste, ou quand une boucle écrit déjà chaque valeur (à chaque tour la bulle ne porte plus qu'une valeur : « première » ou
  // « n-ième » n'auraient aucun sens).
  function status(node) {
    if (!isListColumn(node.attrs)) return { active: false, enabled: false, title: I18n.t('varToolbar.listDisabled') };
    if (LoopRules.normalizeLoop(node.attrs.loop)) return { active: false, enabled: false, title: I18n.t('varToolbar.listLoop') };
    return { active: !VariableFormat.isDefaultList(node.attrs.format && node.attrs.format.list), enabled: true, title: I18n.t('varToolbar.list') };
  }

  function ensureModal() {
    if (win) return;
    // Échap ferme la fenêtre où que soit le focus ; le focus revient à l'éditeur (cf. close), pas à l'élément qui l'avait à l'ouverture.
    win = ModalBase.create({
      id: 'var-list-modal', titleId: 'var-list-title', boxClass: 'var-modal-content var-list-modal-content', actionsClass: 'var-modal-actions',
      onEscape: close, restoreFocus: false,
    });
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

    // « Toutes les valeurs » : les deux séparateurs des boucles, le second vide = le même que le premier.
    const separators = VariableModal.separatorFields('var-list', (key, text) => { if (state) state.working[key] = text; });

    // « La n-ième » : le numéro, de 1 à 999.
    const numberRow = el('div', 'var-loop-seps var-list-number');
    const number = VariableModal.labelledInput('var-list-index', 'var-list-index-input', 'number');
    Object.assign(number.input, { min: '1', max: String(VariableFormat.LIST_INDEX_MAX), step: '1' });
    const numberHint = el('span', 'var-loop-hint');
    numberRow.append(number.label, number.input, numberHint);

    // « Un document par valeur » : la case, puis son libellé et ce que le réglage change sur la même ligne (l'indication qui passe à la ligne
    // commence sous le libellé, pas sous la case).
    const split = VariableModal.labelledInput('var-list-split', null, 'checkbox');
    const splitHint = el('span', 'var-loop-hint');
    splitHint.id = 'var-list-split-hint';
    split.input.setAttribute('aria-describedby', 'var-list-split-hint');
    const splitText = el('div', 'var-list-split-text');
    splitText.append(split.label, splitHint);
    const splitBlock = el('div', 'var-list-split');
    splitBlock.append(split.input, splitText);

    // La seconde ligne montre les documents que la ligne sélectionnée sortirait des exports : seulement quand la case est cochée.
    const { box: previewArea, lines: [previewLine, splitLine] } = VariableModal.previewBox(2);
    splitLine.hidden = true;

    const { first: resetBtn, cancel: cancelBtn, ok: saveBtn } = win.addButtons('var-modal-danger');

    win.body.append(intro, pickLabel, pickSeg, separators.row, numberRow, splitBlock, previewArea);
    refs = {
      title: win.title, intro, pickLabel, pickButtons, separators, numberRow, number, numberHint, split, splitHint, previewLine, splitLine, resetBtn, cancelBtn, saveBtn,
    };

    // Le numéro est lu pendant la frappe (le champ peut être vide un instant) et ramené à 1-999 en le quittant, comme l'enregistrement le fera.
    number.input.addEventListener('input', () => { if (state) state.working.index = VariableFormat.normalizeList({ index: number.input.value }).index; });
    number.input.addEventListener('change', () => { if (state) number.input.value = String(state.working.index); });
    // Cochée, la seconde ligne d'aperçu vient en vue : dans un panneau bas elle est sous le pli de la fenêtre.
    split.input.addEventListener('change', async () => {
      if (!state) return;
      state.working.perValue = split.input.checked;
      await updatePreview();
      if (state && split.input.checked && !splitLine.hidden) splitLine.scrollIntoView({ block: 'nearest' });
    });
    resetBtn.addEventListener('click', () => { if (state) { applyList(null); close(); } });
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    win.box.addEventListener('input', previewRun.schedule);
    win.box.addEventListener('change', previewRun.schedule);
  }

  function renderIntro() {
    const { table, column } = state.node.attrs;
    const target = GristAPI.referenceOf(GristAPI.getColumnType(table, column));
    const text = target && target.list ? I18n.t('varList.intro.ref', { table: target.table }) : I18n.t('varList.intro.choice');
    refs.intro.replaceChildren(el('span', 'var-badge', VariableModal.badgeText(state.node)), document.createTextNode(' ' + text));
  }
  // Le bouton du choix en cours est enfoncé ; les champs de « toutes » et de « n-ième » n'apparaissent que pour leur choix.
  function renderPick() {
    const { pickButtons, separators, numberRow } = refs;
    PICKS.forEach(pick => {
      const on = pick === state.working.pick;
      pickButtons[pick].classList.toggle('is-on', on);
      pickButtons[pick].setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    separators.row.hidden = state.working.pick !== 'all';
    numberRow.hidden = state.working.pick !== 'nth';
  }
  function setPick(pick) {
    if (!state || state.working.pick === pick) return;
    state.working.pick = pick;
    renderPick();
    updatePreview();
  }

  // Réglage tel qu'il sera enregistré : seulement les clés utiles (VariableFormat.storedList), null quand tout est par défaut.
  function workingList() { return VariableFormat.storedList(state.working); }

  // Aperçu sur la ligne sélectionnée dans Grist : les valeurs de la liste, puis ce que le document en écrit (le vrai Variables.formatValue, avec le
  // réglage en cours).
  async function updatePreview() {
    if (!state || !refs) return;
    const outdated = previewRun.begin();
    const stale = () => outdated() || !state;
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    const { previewLine, splitLine } = refs;
    if (!record || !tableId) { setLine(previewLine, I18n.t('varCond.debug.noRecord'), false); setLine(splitLine, '', false); return; }
    setLine(previewLine, I18n.t('varCond.debug.computing'), false);
    try {
      const { table, column, format } = state.node.attrs;
      const raw = await Variables.resolveRawValue(table, column, tableId, record, {});
      if (stale()) return;
      if (raw.error) { setLine(previewLine, I18n.t('linkConfig.previewUnavailable'), false); setLine(splitLine, '', false); return; }
      // Les valeurs comptées comme l'export les compte (Variables.listTexts) : celles dont « La n-ième » prend un rang, et un document chacune quand
      // la case est cochée.
      const values = Variables.listTexts(raw.value, format, table, column);
      const shown = values.slice(0, PREVIEW_VALUES).map(v => shorten(v, 40)).join(', ') + (values.length > PREVIEW_VALUES ? ', …' : '');
      if (!state.working.perValue) setLine(splitLine, '', false);
      else if (values.length > 1) setLine(splitLine, I18n.t('varList.split.preview', { count: values.length, values: shown }), true);
      else if (values.length) setLine(splitLine, I18n.t('varList.split.previewSingle'), false);
      else setLine(splitLine, I18n.t('varList.split.previewEmpty'), false);
      if (!values.length) { setLine(previewLine, I18n.t('varList.preview.empty', { id: record.id }), false); return; }
      const written = Variables.formatValue(raw.value, Object.assign({}, format, { list: workingList() }), table, column);
      if (written === '') {
        setLine(previewLine, I18n.t('varList.preview.beyond', { id: record.id, count: values.length, values: shown, index: state.working.index }), false);
        return;
      }
      setLine(previewLine, I18n.t('varList.preview.values', { id: record.id, count: values.length, values: shown, text: shorten(written, 240) }), true);
    } catch (e) {
      console.warn('[VariableList] aperçu indisponible', e);
      if (!stale()) { setLine(previewLine, I18n.t('linkConfig.previewUnavailable'), false); setLine(splitLine, '', false); }
    }
  }

  // Réécrit le `format.list` de la bulle d'origine, retrouvée à sa position capturée au clic, si c'est toujours la même variable. Les autres clés du
  // format restent ; `list` nul retire la clé, et une bulle qui n'a plus aucun réglage retrouve un format vide (plus de point bleu, plus de
  // data-format dans le modèle).
  function applyList(list) {
    const node = VariableModal.nodeAtOrigin(state, 'varList.saveLost', 'VariableList');
    if (!node) return;
    const format = Object.assign({}, node.attrs.format);
    if (list) format.list = list; else delete format.list;
    EditorCore.patchNodeAndReselect(state.editor, state.pos, Object.assign({}, node.attrs, { format: Object.keys(format).length ? format : null }));
  }
  // Rien n'est écrit quand rien n'a changé : pas d'étape d'annulation pour un « Enregistrer » sans modification.
  function save() {
    if (!state) return;
    const list = workingList();
    if (!same(list, VariableFormat.storedList(state.node.attrs.format && state.node.attrs.format.list))) applyList(list);
    close();
  }

  function close() {
    if (!win) return;
    VariableModal.closeWindow(win, state && state.editor, previewRun, () => { state = null; });
  }

  // `pos` : position de la bulle dans le document, capturée au clic sur l'icône (la sélection de l'éditeur est une NodeSelection sur elle).
  // `options.field` : la bulle d'un champ texte (Objet, À, Cc, Cci, nom du PDF) ; « Un document par valeur » n'y a pas d'objet - il se règle sur les
  // bulles du corps du modèle -, la case reste là, grisée et décochée.
  function open(editor, pos, options) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || !status(node).enabled) return;
    ensureModal();
    const inField = !!(options && options.field);
    state = {
      editor, pos, node,
      had: !VariableFormat.isDefaultList(node.attrs.format && node.attrs.format.list),
      working: listOf(node),
    };
    if (inField) state.working.perValue = false;
    const { title, pickLabel, pickButtons, separators, number, numberHint, split, splitHint, resetBtn, cancelBtn, saveBtn } = refs;
    title.textContent = I18n.t('varList.title');
    pickLabel.textContent = I18n.t('varList.section.pick');
    PICKS.forEach(pick => { pickButtons[pick].textContent = I18n.t('varList.pick.' + pick); });
    separators.sepLabel.textContent = I18n.t('varList.separator');
    separators.lastLabel.textContent = I18n.t('varList.lastSeparator');
    separators.lastInput.placeholder = I18n.t('varList.lastSeparatorPlaceholder');
    separators.hint.textContent = I18n.t('varList.separatorHint');
    separators.sepInput.value = state.working.separator;
    separators.lastInput.value = state.working.lastSeparator;
    number.label.textContent = I18n.t('varList.number');
    numberHint.textContent = I18n.t('varList.numberHint');
    number.input.value = String(state.working.index);
    split.label.textContent = I18n.t('varList.split.label');
    splitHint.textContent = I18n.t(inField ? 'varList.split.hintField' : 'varList.split.hint');
    split.input.checked = state.working.perValue;
    split.input.disabled = inField;
    resetBtn.textContent = I18n.t('varList.reset');
    resetBtn.hidden = !state.had;
    cancelBtn.textContent = I18n.t('common.cancel');
    saveBtn.textContent = I18n.t('common.save');
    renderIntro();
    renderPick();
    // La barre flottante de la bulle reste masquée tant que la fenêtre est ouverte ; elle est sous le voile de toute façon (--z-floating-toolbar,
    // css/style.css).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => pickButtons[state.working.pick]);
    updatePreview();
  }

  return { open, isOpen, status };
})();
