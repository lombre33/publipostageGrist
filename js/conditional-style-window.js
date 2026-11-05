// Fenêtre « Mise en forme conditionnelle » d'une bulle de variable, d'un calcul, d'un bloc de texte conditionnel ou d'une valeur dans la phrase (js/conditional-style.js) :
// une liste de règles « quand cette condition est remplie, alors cette couleur de texte, ce fond, ce gras, cet italique, ce souligné, ce barré ». Le réglage vit dans l'attribut
// `condStyle` du nœud : { rules: [{ condition, style }] }. Les règles se lisent dans l'ordre, comme celles de Grist : la couleur du texte et le fond de la dernière règle
// remplie l'emportent, le gras, l'italique, le souligné et le barré s'additionnent.
// Chaque règle est une carte : un en-tête (son numéro, sa condition en une ligne, un échantillon du style) et, pour la carte ouverte seule, le style (deux rangées de pastilles,
// « Aucune », « Autre… » qui ouvre js/color-dialog.js, et les quatre traits) puis la condition (les mêmes lignes Colonne / Opérateur / Valeur et les mêmes groupes que la fenêtre
// « Condition d'affichage », js/condition-fields.js) : le style d'abord, pour qu'il se voie dès l'ouverture dans un panneau de 400 px de haut. Une seule carte ouverte à la fois : à 700 × 400 la fenêtre ne devient pas un long formulaire. Une règle sans condition
// complète ou sans style n'est pas enregistrée (ConditionalStyle.normalize), la fenêtre le dit. L'aperçu lit la ligne sélectionnée dans Grist, puis toutes les lignes de la table
// de la page, comme la fenêtre de condition. Rien n'est écrit dans le nœud avant « Enregistrer ». Ouverte depuis la barre flottante (js/floating-toolbars.js, « var-style »).
const ConditionalStyleWindow = (function () {
  const { el, button } = Dom;
  const { setLine, shorten } = VariableModal;

  // La phrase d'introduction selon le nœud réglé. Les clés s'écrivent en toutes lettres, pour que la recherche des clés sans usage (dev-tests/verify-code-hygiene.mjs) les voie.
  const INTRO = { varBadge: 'condStyle.intro.badge', calcBadge: 'condStyle.intro.calc', conditionalText: 'condStyle.intro.block', conditionalValue: 'condStyle.intro.value' };
  // Les quatre traits, dans l'ordre de la rangée : la clé du style, sa classe, sa lettre (G I S B en français, B I U S en anglais) et sa phrase.
  const MARKS = [
    { key: 'bold', cls: 'cond-style-mark-bold', glyph: 'condStyle.glyph.bold', label: 'condStyle.bold' },
    { key: 'italic', cls: 'cond-style-mark-italic', glyph: 'condStyle.glyph.italic', label: 'condStyle.italic' },
    { key: 'underline', cls: 'cond-style-mark-underline', glyph: 'condStyle.glyph.underline', label: 'condStyle.underline' },
    { key: 'strike', cls: 'cond-style-mark-strike', glyph: 'condStyle.glyph.strike', label: 'condStyle.strike' },
  ];

  // Les pastilles proposées : pour le texte le noir puis le ton foncé des dix teintes (lisible sur la page blanche, js/color-palette.js), pour le fond un gris clair puis les dix
  // pastels. Lues à l'ouverture : la palette se charge avant ce module, mais rien ne la lit avant.
  const textColors = () => ['#000000'].concat(ColorPalette.ROWS[1]);
  const fillColors = () => ['#e5e7eb'].concat(ColorPalette.ROWS[4]);

  let win = null;
  let refs = null;
  // { editor, pos, node, hadStyle, working: [{ condition: { mode, rules }, style }], open } - `working` est une copie : rien n'est écrit dans le nœud avant « Enregistrer ».
  // `open` : l'index de la carte ouverte (-1 : aucune).
  let state = null;

  const isOpen = () => !!state;
  const newRule = () => ({ condition: { mode: 'all', rules: [ConditionFields.emptyRule()] }, style: {} });
  // La règle sous sa forme enregistrée, ou null quand elle est incomplète (sans condition complète ou sans style).
  const savedRule = rule => { const spec = ConditionalStyle.normalize({ rules: [rule] }); return spec ? spec.rules[0] : null; };

  const previewRun = VariableModal.previewRunner(() => updatePreview());

  // La condition d'une règle en une ligne, pour son en-tête ; « Condition à choisir » tant qu'aucune ligne n'est complète.
  function summaryOf(rule) {
    const plain = ConditionRules.plainCondition(rule.condition);
    return plain ? VariableCondition.describe(plain) : I18n.t('condStyle.summaryNone');
  }

  // Pose le style de la règle sur un échantillon : le même style en ligne que la Lecture et les exports écrivent.
  function paintSample(sample, style) {
    sample.removeAttribute('style');
    const css = ConditionalStyle.cssOf(ConditionalStyle.cleanStyle(style));
    if (css) sample.setAttribute('style', css);
  }

  // === Les contrôles de style d'une règle ===
  function swatch(color, onPick) {
    const btn = el('button', 'cp-swatch');
    btn.type = 'button';
    btn.dataset.color = color;
    btn.style.setProperty('--swatch', color);
    btn.style.setProperty('--ink', ColorMath.inkOn(color));
    btn.title = color.toUpperCase();
    btn.setAttribute('aria-label', color.toUpperCase());
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => onPick(color));
    return btn;
  }

  // Une rangée de couleurs : les pastilles de la palette, la couleur actuelle si elle n'en fait pas partie, « Aucune » (retire la couleur : le texte garde celle du document,
  // la case son fond) et « Autre… » (la fenêtre de couleur).
  function colorRow(rule, key, palette, groupLabel) {
    const row = el('div', 'cond-style-colors');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', I18n.t(groupLabel));
    row.dataset.styleKey = key;
    const current = rule.style[key];
    const pick = color => { if (color) rule.style[key] = color; else delete rule.style[key]; paint(); previewRun.schedule(); };
    palette.forEach(color => row.appendChild(swatch(color, pick)));
    if (current && palette.indexOf(current) === -1) row.appendChild(swatch(current, pick));
    // « Aucune » et « Autre… » sont deux boutons carrés, de la taille d'une pastille : les onze pastilles et eux tiennent sur la ligne de la fenêtre.
    const none = el('button', 'cond-style-chip');
    none.type = 'button';
    none.dataset.role = 'none';
    Dom.setMarkup(none, Icons.svg('noColor'));
    none.title = I18n.t(key === 'color' ? 'condStyle.noneTextTitle' : 'condStyle.noneFillTitle');
    none.setAttribute('aria-label', none.title);
    none.addEventListener('click', () => pick(null));
    const custom = el('button', 'cond-style-chip', '+');
    custom.type = 'button';
    custom.dataset.role = 'custom';
    custom.title = I18n.t('condStyle.customTitle');
    custom.setAttribute('aria-label', custom.title);
    custom.addEventListener('click', () => {
      ColorDialog.open({
        initial: rule.style[key] || null,
        keep: false,
        onApply: ({ color }) => { pick(color); renderRules(); },
        onClose: () => { const again = refs && refs.list.querySelector('[data-style-key="' + key + '"] [data-role="custom"]'); if (again) again.focus(); },
      });
    });
    row.append(none, custom);
    return row;
  }

  function marksRow(rule) {
    const row = el('div', 'cond-style-marks');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', I18n.t('condStyle.marksAria'));
    MARKS.forEach(mark => {
      const btn = el('button', 'cond-style-mark ' + mark.cls, I18n.t(mark.glyph));
      btn.type = 'button';
      btn.dataset.mark = mark.key;
      btn.title = I18n.t(mark.label);
      btn.setAttribute('aria-label', I18n.t(mark.label));
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => { if (rule.style[mark.key]) delete rule.style[mark.key]; else rule.style[mark.key] = true; paint(); previewRun.schedule(); });
      row.appendChild(btn);
    });
    return row;
  }

  // Remet à jour, sans retracer la liste (le focus reste où il est), ce qui dépend du style : les échantillons, la pastille et le trait marqués, la note des règles ignorées.
  function paint() {
    if (!state || !refs) return;
    refs.list.querySelectorAll('.cond-style-card').forEach((card, index) => {
      const rule = state.working[index];
      // La condition en une ligne suit la saisie : la colonne et la valeur d'une règle se lisent dans l'en-tête de sa carte, ouverte ou non.
      card.querySelector('.cond-style-summary').textContent = shorten(summaryOf(rule), 70);
      card.querySelectorAll('.cond-style-sample').forEach(sample => paintSample(sample, rule.style));
      card.querySelectorAll('.cond-style-colors').forEach(row => {
        const current = rule.style[row.dataset.styleKey];
        row.querySelectorAll('.cp-swatch').forEach(btn => {
          const on = !!current && btn.dataset.color === current;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
      card.querySelectorAll('.cond-style-mark').forEach(btn => {
        const on = !!rule.style[btn.dataset.mark];
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    refs.ignored.hidden = state.working.every(rule => !!savedRule(rule));
  }

  // === Les cartes ===
  // La condition d'une règle, dans la carte ouverte : les lignes et les groupes de js/condition-fields.js, avec les mêmes options que la fenêtre de condition d'une variable
  // (toutes les tables, « autre colonne », « Autres attributs »). Un retracé refait toute la liste : le focus d'une ligne ajoutée est cherché dans `refs.list`.
  function renderCondition(box, condition) {
    const rules = condition.rules;
    const redraw = () => { renderRules(); previewRun.schedule(); };
    const options = {
      allTables: true,
      compareColumn: true,
      attributesWindow: true,
      onColumnChosen: ref => ConditionFields.ensureTableLinked(ref, redraw, state ? VariableLoop.loopTablesAt(state.editor.state, state.pos) : null),
    };
    ConditionFields.renderItems(box, {
      items: rules,
      mode: condition.mode,
      setMode: next => { condition.mode = next; },
      buildRow: (rule, row) => ConditionFields.buildRuleRow(rule, row.index, Object.assign({}, row, { options })),
      removeItem: index => {
        rules.splice(index, 1);
        if (!rules.length) rules.push(ConditionFields.emptyRule());
        redraw();
      },
      redraw,
      root: refs.list,
    });
    const foot = el('div', 'var-condition-foot');
    foot.append(ConditionFields.buildAddRuleButton(refs.list, rules, redraw), ConditionFields.buildAddGroupButton(refs.list, rules, () => condition.mode, redraw));
    box.appendChild(foot);
  }

  const labelled = textKey => el('div', 'cond-style-label', I18n.t(textKey));

  function buildBody(rule) {
    const body = el('div', 'cond-style-body');
    const rulesBox = el('div', 'var-condition-rules cond-style-when');
    renderCondition(rulesBox, rule.condition);
    const looks = el('div', 'cond-style-looks');
    const sample = el('span', 'cond-style-sample cond-style-sample-big', I18n.t('condStyle.sample'));
    looks.append(
      labelled('condStyle.text'), colorRow(rule, 'color', textColors(), 'condStyle.textAria'),
      labelled('condStyle.fill'), colorRow(rule, 'fill', fillColors(), 'condStyle.fillAria'),
      labelled('condStyle.marks'), (() => { const line = el('div', 'cond-style-marks-line'); line.append(marksRow(rule), sample); return line; })(),
    );
    // Le style d'abord : à 700 × 400 les pastilles se voient dès l'ouverture, sans défiler ; la condition, plus haute, vient dessous.
    body.append(looks, labelled('condStyle.when'), rulesBox);
    return body;
  }

  function buildCard(rule, index) {
    const open = index === state.open;
    const card = el('div', 'cond-style-card' + (open ? ' is-open' : ''));
    const head = el('div', 'cond-style-head');
    const toggle = el('button', 'cond-style-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.append(el('span', 'cond-style-num', I18n.t('condStyle.rule', { n: index + 1 })), el('span', 'cond-style-summary', shorten(summaryOf(rule), 70)), el('span', 'cond-style-sample', 'Aa'));
    toggle.addEventListener('click', () => {
      state.open = open ? -1 : index;
      renderRules();
      const again = refs.list.querySelectorAll('.cond-style-toggle')[index];
      if (again) again.focus();
    });
    const remove = el('button', 'macro-rule-remove cond-style-remove');
    remove.type = 'button';
    remove.title = I18n.t('condStyle.removeRule');
    remove.setAttribute('aria-label', I18n.t('condStyle.removeRule'));
    remove.addEventListener('click', () => {
      state.working.splice(index, 1);
      if (!state.working.length) state.working.push(newRule());
      if (state.open === index) state.open = Math.min(index, state.working.length - 1);
      else if (state.open > index) state.open -= 1;
      renderRules();
      previewRun.schedule();
    });
    head.append(toggle, remove);
    card.appendChild(head);
    if (open) card.appendChild(buildBody(rule));
    return card;
  }

  function renderRules() {
    if (!state || !refs) return;
    refs.list.replaceChildren(...state.working.map(buildCard));
    const full = state.working.length >= ConditionalStyle.MAX_RULES;
    refs.addBtn.disabled = full;
    refs.addBtn.title = full ? I18n.t('condStyle.addRuleMax', { max: ConditionalStyle.MAX_RULES }) : '';
    paint();
  }

  // === Aperçu === La ligne sélectionnée dans Grist, puis toutes les lignes de la table de la page : mêmes règles que la Lecture (ConditionalStyle.evaluate).
  async function updatePreview() {
    if (!state || !refs) return;
    const outdated = previewRun.begin();
    const stale = () => outdated() || !state;
    const { currentLine, countLine } = refs;
    const kept = state.working.filter(savedRule);
    const spec = ConditionalStyle.normalize({ rules: kept });
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    setLine(countLine, '', false);
    if (!spec) { setLine(currentLine, I18n.t('condStyle.debug.chooseCondition'), false); return; }
    if (!record || !tableId) { setLine(currentLine, I18n.t('condStyle.debug.noRecord'), false); return; }
    setLine(currentLine, I18n.t('condStyle.debug.computing'), false);
    try {
      const result = await ConditionalStyle.evaluate(spec, tableId, record);
      if (stale()) return;
      const holding = result.verdicts.map((holds, at) => (holds ? state.working.indexOf(kept[at]) + 1 : 0)).filter(Boolean);
      if (result.style) {
        setLine(currentLine, I18n.t('condStyle.debug.met', { id: record.id, count: holding.length, rules: holding.join(', ') }), true);
        const sample = el('span', 'cond-style-sample', I18n.t('condStyle.sample'));
        paintSample(sample, result.style);
        currentLine.appendChild(sample);
      } else {
        setLine(currentLine, I18n.t('condStyle.debug.none', { id: record.id }), false);
      }
      await previewAllRows(spec, tableId, stale);
    } catch (e) {
      console.warn('[ConditionalStyleWindow] aperçu indisponible', e);
      if (!stale()) setLine(currentLine, I18n.t('linkConfig.previewUnavailable'), false);
    }
  }
  async function previewAllRows(spec, tableId, stale) {
    const { fetchRows } = LoopRules.createContext();
    const rows = await fetchRows(tableId);
    if (stale()) return;
    if (!rows.length) { setLine(refs.countLine, I18n.t('linkConfig.previewTableEmpty', { table: tableId }), false); return; }
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      if ((await ConditionalStyle.evaluate(spec, tableId, rows[i], { fetchRows })).style) count += 1;
      // Rend la main au navigateur de temps en temps sur une grande table, et abandonne si le réglage a changé entre-temps.
      if (i % 250 === 249) { await new Promise(r => setTimeout(r, 0)); if (stale()) return; }
    }
    if (stale()) return;
    setLine(refs.countLine, I18n.t('condStyle.debug.count', { table: tableId, count, total: rows.length }), false);
  }

  // === Enregistrer ===
  // Réécrit l'attribut `condStyle` du nœud d'origine, retrouvé à sa position capturée au clic. Une valeur garde le curseur là où il était, dans son texte : une NodeSelection posée
  // sur elle ferait remplacer la valeur entière par la prochaine frappe.
  function applyStyle(spec) {
    const { editor, pos } = state;
    const node = VariableModal.nodeAtOrigin(state, 'condStyle.saveLost', 'ConditionalStyleWindow');
    if (!node) return;
    const attrs = Object.assign({}, node.attrs, { condStyle: spec });
    if (node.type.name === 'conditionalValue') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
    else EditorCore.patchNodeAndReselect(editor, pos, attrs);
  }
  function save() {
    if (!state) return;
    applyStyle(ConditionalStyle.normalize({ rules: state.working }));
    close();
  }
  function close() {
    if (!win) return;
    VariableModal.closeWindow(win, state && state.editor, previewRun, () => { state = null; });
  }

  function ensureModal() {
    if (win) return;
    win = ModalBase.create({
      id: 'cond-style-modal', titleId: 'cond-style-title', boxClass: 'var-modal-content cond-style-modal-content', actionsClass: 'var-modal-actions', onEscape: close, restoreFocus: false,
    });
    const intro = el('p', 'var-modal-intro');
    const hint = el('p', 'cond-style-order');
    const list = el('div', 'cond-style-list');
    const addBtn = el('button', 'var-condition-add cond-style-add');
    addBtn.type = 'button';
    const ignored = el('p', 'cond-style-ignored');
    ignored.hidden = true;
    const { box: previewArea, lines: [currentLine, countLine] } = VariableModal.previewBox(2);
    const removeBtn = button('var-modal-danger');
    const cancelBtn = button();
    const saveBtn = button('var-modal-primary');
    const startGroup = el('div', 'var-modal-actions-start');
    startGroup.appendChild(removeBtn);
    const endGroup = el('div', 'var-modal-actions-end');
    endGroup.append(cancelBtn, saveBtn);
    win.actions.append(startGroup, endGroup);
    win.body.append(intro, list, addBtn, ignored, previewArea, hint);
    refs = { title: win.title, intro, hint, list, addBtn, ignored, currentLine, countLine, removeBtn, cancelBtn, saveBtn };

    addBtn.addEventListener('click', () => {
      if (!state || state.working.length >= ConditionalStyle.MAX_RULES) return;
      state.working.push(newRule());
      state.open = state.working.length - 1;
      renderRules();
      const select = refs.list.querySelector('select.macro-rule-column');
      if (select) select.focus();
      previewRun.schedule();
    });
    removeBtn.addEventListener('click', () => { if (state) { applyStyle(null); close(); } });
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    // Toute saisie dans les lignes d'une condition (colonne, opérateur, valeur) relance l'aperçu et la note des règles ignorées.
    const edited = () => { paint(); previewRun.schedule(); };
    win.box.addEventListener('input', edited);
    win.box.addEventListener('change', edited);
  }

  // `pos` : position du nœud dans le document, capturée au clic sur le bouton de la barre flottante (la sélection de l'éditeur est une NodeSelection sur lui).
  function openAt(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || !INTRO[node.type.name]) return;
    ensureModal();
    const existing = ConditionalStyle.normalize(node.attrs.condStyle);
    state = { editor, pos, node, hadStyle: !!existing, working: existing ? existing.rules : [newRule()], open: 0 };
    const r = refs;
    r.title.textContent = I18n.t('condStyle.title');
    if (node.type.name === 'varBadge') r.intro.replaceChildren(el('span', 'var-badge', VariableModal.badgeText(node)), document.createTextNode(' ' + I18n.t(INTRO.varBadge)));
    else r.intro.textContent = I18n.t(INTRO[node.type.name]);
    r.hint.textContent = I18n.t('condStyle.order');
    r.addBtn.textContent = I18n.t('condStyle.addRule');
    r.ignored.textContent = I18n.t('condStyle.ignored');
    r.removeBtn.textContent = I18n.t('condStyle.remove');
    r.removeBtn.hidden = !state.hadStyle;
    r.cancelBtn.textContent = I18n.t('common.cancel');
    r.saveBtn.textContent = I18n.t('common.save');
    renderRules();
    // La barre flottante reste masquée tant que la fenêtre est ouverte ; elle est sous le voile de toute façon (--z-floating-toolbar, css/style.css).
    EditorCore.hideFloatingContextToolbars();
    win.show(() => r.list.querySelector('.cond-style-toggle'));
    updatePreview();
  }

  return { openAt, isOpen, close };
})();
