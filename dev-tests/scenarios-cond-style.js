// Suite "condStyle" - mise en forme conditionnelle (demande d'Antoine du 2026-11-05 : couleur du texte, fond, gras, italique, souligné, barré selon des conditions, sur une variable, un calcul,
// un bloc de texte conditionnel ou une valeur dans la phrase ; choix « sur main, sortie dans une V1.1 », « un bouton sur la barre flottante », « variables, calculs, blocs, valeurs » en premier lot).
// Module js/conditional-style.js (l'attribut `condStyle` / `data-cond-style`, les règles, leur lecture ligne par ligne), nœuds js/editor-nodes.js, résolution à la Lecture et aux exports
// (js/reader-mode.js : ConditionalStyle.prepare avant les conditions d'affichage, ConditionalStyle.carry quand une bulle est remplacée par sa valeur), bouton de la barre flottante
// (js/floating-toolbars.js, « var-style »), fenêtre (js/conditional-style-window.js), suivi des renommages de colonnes (js/schema-renames.js). Le vrai clavier et la vraie souris, à 700 × 400,
// sont dans verify-cond-style-mouse.mjs (script condStyleMouse).
(function () {
  const cases = [];

  const TABLE = 'CsDossiers';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const ROWS = [
    { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 },
    { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 },
    { id: 3, Titre: 'Dossier C', Statut: 'Urgent', Montant: 10 },
    { id: 4, Titre: '', Statut: 'Normal', Montant: 5 },
  ];
  const RED = '#b91c1c';
  const BLUE = '#1d4ed8';
  const FILL = '#fff2a8';
  const rule = (column, operator, value) => ({ mode: 'all', rules: [{ column, operator, value }] });
  const BIG = rule('Montant', '>', '1000');
  const URGENT = rule('Statut', '=', 'Urgent');
  const NORMAL = rule('Statut', '=', 'Normal');
  const spec = (...rules) => ({ rules: rules.map(([condition, style]) => ({ condition, style })) });
  const BIG_RED = spec([BIG, { color: RED, bold: true }]);

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  const badgeHtml = (column, style, condition) =>
    `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}${style ? attr('data-cond-style', style) : ''}></span>`;
  const calcHtml = (formula, style) => `<span class="calc-badge" data-formula="${formula}"${style ? attr('data-cond-style', style) : ''}></span>`;
  const blockHtml = (inner, condition, style) => `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}${style ? attr('data-cond-style', style) : ''}>${inner}</div>`;
  const valueHtml = (inner, condition, style) => `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}${style ? attr('data-cond-style', style) : ''}>${inner}</span>`;
  const checkboxHtml = condition => `<span class="conditional-checkbox"${condition ? attr('data-condition', condition) : ''}>☐</span>`;

  async function seed(h, rowId) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setRows(TABLE, ROWS.map(row => Object.assign({}, row)));
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, ROWS[(rowId || 1) - 1]), TABLE);
    await h.sleep(50);
  }
  async function setRow(h, rowId) {
    window.__gristStub.fireRecord(Object.assign({}, ROWS[rowId - 1]), TABLE);
    await h.sleep(50);
  }
  // Ce que la Lecture écrit pour ce HTML : le conteneur .reader-content, une fois résolu.
  async function renderReader(html) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  // Ce que reçoivent le PDF, le Word et l'e-mail : ReaderMode.preview, le même HTML résolu que la Lecture.
  async function previewBox(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  const styled = root => Array.from(root.querySelectorAll('span[style]')).filter(span => /color|font-weight|font-style|text-decoration/.test(span.getAttribute('style')));
  // Le style d'un <span> posé par la mise en forme : { text, color, fill, bold, italic, underline, strike } lu sur l'attribut, indépendant du navigateur.
  function styleOf(span) {
    const css = span.getAttribute('style') || '';
    const get = name => { const m = new RegExp('(?:^|;)\\s*' + name + ':\\s*([^;]+)').exec(css); return m ? m[1].trim() : null; };
    const lines = get('text-decoration') || '';
    return { text: span.textContent, color: get('color'), fill: get('background-color'), bold: get('font-weight') === 'bold', italic: get('font-style') === 'italic', underline: /underline/.test(lines), strike: /line-through/.test(lines) };
  }
  const digits = text => text.replace(/\D/g, '');

  function ed() { return EditorCore.getEditor(); }
  function nodesOf(name) {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === name) out.push({ node, pos }); });
    return out;
  }
  async function selectNode(h, name, index) {
    document.querySelector('.tiptap').focus();
    const found = nodesOf(name)[index || 0];
    if (!found) return null;
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(140);
    return found;
  }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function barButton(action) {
    const b = toolbar().querySelector(`button[data-action="${action}"]`);
    return b ? { disabled: b.classList.contains('is-disabled'), active: b.classList.contains('is-active'), title: b.title, aria: b.getAttribute('aria-label') } : null;
  }
  function pressToolbarButton(action) { toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  const modal = () => document.getElementById('cond-style-modal');
  const cards = () => Array.from(modal().querySelectorAll('.cond-style-card'));
  const openCard = () => modal().querySelector('.cond-style-card.is-open');
  function swatchIn(card, key, color) { return card.querySelector(`.cond-style-colors[data-style-key="${key}"] .cp-swatch[data-color="${color}"]`); }
  const markBtn = (card, key) => card.querySelector(`.cond-style-mark[data-mark="${key}"]`);
  const saveBtn = () => modal().querySelector('.var-modal-actions .var-modal-primary');
  const cancelBtn = () => modal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
  const removeBtn = () => modal().querySelector('.var-modal-actions .var-modal-danger');
  const savedStyle = (name, index) => { const found = nodesOf(name)[index || 0]; return found ? found.node.attrs.condStyle : undefined; };
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  // Colonne choisie comme une personne, dans le champ avec recherche (cf. suite varCondition).
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }

  // === La résolution : Lecture et exports ===
  cases.push({
    id: 'condstyle_variable_takes_the_style_of_a_met_rule_in_reader_and_exports',
    description: 'Une bulle dont la règle est remplie s’écrit dans un <span style> (couleur et gras) à la Lecture et dans le HTML des exports (PDF, Word, e-mail : ReaderMode.preview) ; sur une ligne où la règle ne tient pas, rien n’est enveloppé - un modèle sans mise en forme garde exactement sa sortie d’avant',
    run: async (h) => {
      const html = `<p>Montant : ${badgeHtml('Montant', BIG_RED)} euros</p>`;
      await seed(h, 1);
      const reader1 = await renderReader(html);
      const spans1 = styled(reader1).map(styleOf);
      const preview1 = styled(await previewBox(html)).map(styleOf);
      const text1 = reader1.textContent.trim();
      closeReader();
      await setRow(h, 2);
      const reader2 = await renderReader(html);
      const spans2 = styled(reader2);
      const text2 = reader2.textContent.trim();
      closeReader();
      const plain = await renderReader(`<p>Montant : ${badgeHtml('Montant', null)} euros</p>`);
      const plainHtml = plain.innerHTML;
      closeReader();
      const pass = spans1.length === 1 && spans1[0].color === RED && spans1[0].bold === true && !spans1[0].italic && digits(spans1[0].text) === '1200'
        && preview1.length === 1 && preview1[0].color === RED && preview1[0].bold === true
        && /^Montant : .*1\D?200.* euros$/.test(text1) && spans2.length === 0 && /^Montant : .*50.* euros$/.test(text2) && plainHtml.indexOf('<span style') === -1;
      return { pass, notes: JSON.stringify({ spans1, preview1, text1, spans2: spans2.length, text2 }) };
    },
  });

  cases.push({
    id: 'condstyle_rules_are_read_in_order_last_color_wins_and_marks_add_up',
    description: 'Comme dans Grist : les règles se lisent dans l’ordre, la couleur du texte et le fond de la DERNIÈRE règle remplie l’emportent, le gras, l’italique, le souligné et le barré de toutes s’additionnent ; aucune règle remplie, aucune mise en forme',
    run: async (h) => {
      const style = spec(
        [URGENT, { color: RED, fill: FILL, bold: true }],
        [BIG, { color: BLUE, italic: true, underline: true }],
        [NORMAL, { strike: true }],
      );
      const html = `<p>${badgeHtml('Montant', style)}</p>`;
      const seen = {};
      for (const id of [1, 2, 3]) {
        await seed(h, id);
        const reader = await renderReader(html);
        seen[id] = styled(reader).map(styleOf);
        closeReader();
      }
      const one = seen[1][0] || {};
      const two = seen[2][0] || {};
      const three = seen[3][0] || {};
      // Ligne 1 : Urgent + Montant > 1000 -> bleu (la dernière), fond jaune (seule à en avoir), gras + italique + souligné, pas de barré.
      // Ligne 2 : Normal seulement -> barré. Ligne 3 : Urgent seulement -> rouge, fond, gras.
      const pass = seen[1].length === 1 && one.color === BLUE && one.fill === FILL && one.bold && one.italic && one.underline && !one.strike
        && seen[2].length === 1 && two.strike === true && !two.color && !two.bold
        && seen[3].length === 1 && three.color === RED && three.fill === FILL && three.bold && !three.italic;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'condstyle_a_value_that_writes_nothing_is_not_wrapped_and_a_hidden_variable_leaves_nothing',
    description: 'Une bulle qui n’écrit rien (colonne vide, condition d’affichage non remplie) n’est pas enveloppée : pas de <span style> vide, et les espaces autour d’elle se règlent comme avant',
    run: async (h) => {
      const style = spec([NORMAL, { color: RED }]);
      const empty = `<p>A ${badgeHtml('Titre', style)} B</p>`;
      const hidden = `<p>A ${badgeHtml('Titre', style, URGENT)} B</p>`;
      await seed(h, 4);
      const readerEmpty = await renderReader(empty);
      const emptySpans = styled(readerEmpty).length;
      const emptyText = readerEmpty.textContent.replace(/\s+/g, ' ').trim();
      closeReader();
      await setRow(h, 2);
      const readerHidden = await renderReader(hidden);
      const hiddenSpans = styled(readerHidden).length;
      const hiddenText = readerHidden.textContent.replace(/\s+/g, ' ').trim();
      const plainHidden = await renderReader(`<p>A ${badgeHtml('Titre', null, URGENT)} B</p>`);
      const sameAsPlain = plainHidden.textContent.replace(/\s+/g, ' ').trim() === hiddenText;
      closeReader();
      const pass = emptySpans === 0 && hiddenSpans === 0 && emptyText === 'A B' && hiddenText === 'A B' && sameAsPlain;
      return { pass, notes: JSON.stringify({ emptySpans, emptyText, hiddenSpans, hiddenText, sameAsPlain }) };
    },
  });

  cases.push({
    id: 'condstyle_text_block_keeps_its_style_after_the_frame_is_removed',
    description: 'Un bloc de texte conditionnel dont la condition est remplie perd son cadre à la Lecture mais garde sa mise en forme : le texte de chaque paragraphe, titre, élément de liste et case de tableau est enveloppé ; condition non remplie, le bloc disparaît sans rien laisser',
    run: async (h) => {
      const style = spec([BIG, { color: RED, fill: FILL, bold: true }]);
      const inner = '<p>Alerte <b>vive</b></p><ul><li>un</li><li>deux</li></ul><table><tbody><tr><td>cellule</td></tr></tbody></table>';
      const html = `<p>Avant</p>${blockHtml(inner, URGENT, style)}<p>Après</p>`;
      await seed(h, 1);
      const reader = await renderReader(html);
      const blockGone = reader.querySelector('.conditional-text') === null;
      const spans = styled(reader).map(styleOf);
      const texts = spans.map(s => s.text);
      const para = Array.from(reader.querySelectorAll('p')).find(p => p.textContent.indexOf('Alerte') === 0);
      const liSpans = Array.from(reader.querySelectorAll('li > span[style]')).length;
      const cellSpans = Array.from(reader.querySelectorAll('td > span[style]')).length;
      closeReader();
      // Condition de style non remplie (ligne 3, Montant 10) : le bloc est affiché sans style.
      await setRow(h, 3);
      const reader3 = await renderReader(html);
      const unstyled = styled(reader3).length === 0 && reader3.textContent.indexOf('Alerte') !== -1;
      closeReader();
      // Condition d'affichage non remplie (ligne 2, Normal) : plus rien.
      await setRow(h, 2);
      const reader2 = await renderReader(html);
      const gone = reader2.textContent.indexOf('Alerte') === -1 && styled(reader2).length === 0;
      closeReader();
      const pass = blockGone && para && styled(para).length >= 1 && styled(para).every(s => styleOf(s).color === RED && styleOf(s).fill === FILL && styleOf(s).bold)
        && texts.join('|').indexOf('Alerte') !== -1 && texts.join('|').indexOf('vive') !== -1 && liSpans === 2 && cellSpans === 1 && unstyled && gone;
      return { pass, notes: JSON.stringify({ blockGone, texts, liSpans, cellSpans, unstyled, gone }) };
    },
  });

  cases.push({
    id: 'condstyle_inline_value_keeps_its_style_inside_the_sentence',
    description: 'Une valeur dans la phrase dont la condition est remplie s’écrit dans son <span style> au milieu du paragraphe (le paragraphe reste un seul) ; condition d’affichage non remplie : elle disparaît',
    run: async (h) => {
      const style = spec([BIG, { color: BLUE, underline: true }]);
      const html = `<p>Le dossier est ${valueHtml('prioritaire', URGENT, style)} aujourd’hui.</p>`;
      await seed(h, 1);
      const reader = await renderReader(html);
      const spans = styled(reader).map(styleOf);
      const paragraphs = reader.querySelectorAll('p').length;
      const text = reader.textContent.replace(/\s+/g, ' ').trim();
      closeReader();
      await setRow(h, 3);
      const reader3 = await renderReader(html);
      const spans3 = styled(reader3).length;
      const text3 = reader3.textContent.replace(/\s+/g, ' ').trim();
      closeReader();
      await setRow(h, 2);
      const reader2 = await renderReader(html);
      const text2 = reader2.textContent.replace(/\s+/g, ' ').trim();
      closeReader();
      const pass = spans.length === 1 && spans[0].text === 'prioritaire' && spans[0].color === BLUE && spans[0].underline && paragraphs === 1
        && text === 'Le dossier est prioritaire aujourd’hui.' && spans3 === 0 && text3 === 'Le dossier est prioritaire aujourd’hui.' && text2 === 'Le dossier est aujourd’hui.';
      return { pass, notes: JSON.stringify({ spans, paragraphs, text, spans3, text3, text2 }) };
    },
  });

  cases.push({
    id: 'condstyle_calculation_takes_the_style_of_a_met_rule',
    description: 'Une bulle « Calcul » prend sa mise en forme comme une variable : le résultat du calcul est enveloppé quand la règle est remplie',
    run: async (h) => {
      const html = `<p>Total : ${calcHtml('{' + TABLE + '.Montant} * 2', BIG_RED)}</p>`;
      await seed(h, 1);
      const reader = await renderReader(html);
      const spans = styled(reader).map(styleOf);
      closeReader();
      await setRow(h, 2);
      const reader2 = await renderReader(html);
      const spans2 = styled(reader2).length;
      const text2 = reader2.textContent.trim();
      closeReader();
      const pass = spans.length === 1 && spans[0].color === RED && spans[0].bold && digits(spans[0].text) === '2400' && spans2 === 0 && digits(text2) === '100';
      return { pass, notes: JSON.stringify({ spans, spans2, text2 }) };
    },
  });

  // === L'attribut ===
  cases.push({
    id: 'condstyle_attribute_round_trips_on_the_four_nodes_and_an_unreadable_one_is_ignored',
    description: 'Le réglage s’écrit dans data-cond-style sur la bulle, le calcul, le bloc et la valeur, et se relit à l’identique ; un attribut illisible ou sans règle complète est ignoré (le nœud s’ouvre sans réglage)',
    run: async (h) => {
      await seed(h, 1);
      const full = spec([BIG, { color: RED, fill: FILL, bold: true, italic: true, underline: true, strike: true }], [URGENT, { color: BLUE }]);
      Editor.setHTML(`<p>${badgeHtml('Montant', full)} ${calcHtml('{' + TABLE + '.Montant} + 1', full)} ${valueHtml('mot', null, full)}</p>${blockHtml('<p>texte</p>', null, full)}`
        + `<p>${badgeHtml('Titre', '{oops')} ${badgeHtml('Statut', { rules: [{ condition: { mode: 'all', rules: [{ column: '', operator: '=', value: '' }] }, style: { color: RED } }] })}</p>`);
      await h.sleep(60);
      const html = Editor.getHTML();
      const back = name => { const found = nodesOf(name).map(n => n.node.attrs.condStyle); return found; };
      const badges = back('varBadge');
      const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const written = html.split('data-cond-style="').length - 1;
      // Un second tour par l'éditeur ne change rien.
      Editor.setHTML(html);
      await h.sleep(60);
      const again = Editor.getHTML() === html;
      const pass = sameJson(badges[0], full) && sameJson(back('calcBadge')[0], full) && sameJson(back('conditionalValue')[0], full) && sameJson(back('conditionalText')[0], full)
        && !badges[1] && !badges[2] && written === 4 && again;
      return { pass, notes: JSON.stringify({ badges, written, again }) };
    },
  });

  // === Le bouton de la barre flottante ===
  cases.push({
    id: 'condstyle_toolbar_button_is_next_to_condition_lit_when_set_and_greyed_with_its_reason_on_a_checkbox',
    description: 'Un bouton « Mise en forme conditionnelle » à côté de « Condition d’affichage » sur la barre d’une bulle, d’un calcul, d’un bloc et d’une valeur : éteint sans réglage, allumé avec ; grisé - jamais retiré - avec sa raison sur une case conditionnelle',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(`<p>${badgeHtml('Montant', null)} ${badgeHtml('Titre', BIG_RED)} ${calcHtml('{' + TABLE + '.Montant} + 1', null)} ${valueHtml('mot', null, BIG_RED)} ${checkboxHtml(null)}</p>${blockHtml('<p>texte</p>', null, null)}`);
      await h.sleep(60);
      const seen = {};
      await selectNode(h, 'varBadge', 0); seen.badge = barButton('var-style');
      const order = Array.from(toolbar().querySelectorAll('.v2-varbadge-actions button')).map(b => b.dataset.action);
      await selectNode(h, 'varBadge', 1); seen.badgeSet = barButton('var-style');
      await selectNode(h, 'calcBadge', 0); seen.calc = barButton('var-style');
      await selectNode(h, 'conditionalValue', 0); seen.valueSet = barButton('var-style');
      await selectNode(h, 'conditionalText', 0); seen.block = barButton('var-style');
      await selectNode(h, 'conditionalCheckbox', 0); seen.checkbox = barButton('var-style');
      const reasonFr = I18n.t('varToolbar.styleCheckbox');
      const pass = order.indexOf('var-style') === order.indexOf('var-condition') + 1
        && seen.badge && !seen.badge.disabled && !seen.badge.active && seen.badge.title === I18n.t('varToolbar.style')
        && seen.badgeSet && !seen.badgeSet.disabled && seen.badgeSet.active
        && seen.calc && !seen.calc.disabled && !seen.calc.active
        && seen.valueSet && !seen.valueSet.disabled && seen.valueSet.active
        && seen.block && !seen.block.disabled && !seen.block.active
        && seen.checkbox && seen.checkbox.disabled && !seen.checkbox.active && seen.checkbox.title === reasonFr && seen.checkbox.aria === reasonFr;
      return { pass, notes: JSON.stringify({ order, seen }) };
    },
  });

  // === La fenêtre ===
  cases.push({
    id: 'condstyle_window_opens_on_the_rules_and_writes_nothing_until_save',
    description: 'La fenêtre s’ouvre depuis le bouton sur les règles du nœud (une carte par règle, la première ouverte, sa condition en une ligne) ; changer une couleur ou un trait ne touche pas le nœud avant « Enregistrer » ; « Annuler » ne l’écrit pas ; « Enregistrer » écrit la couleur et les traits choisis',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(`<p>${badgeHtml('Montant', BIG_RED)}</p>`);
      await h.sleep(60);
      await selectNode(h, 'varBadge', 0);
      pressToolbarButton('var-style');
      await h.sleep(150);
      const opened = !!modal() && getComputedStyle(modal()).display !== 'none';
      const first = cards();
      const summary = first.length ? first[0].querySelector('.cond-style-summary').textContent : '';
      const isOpen = !!openCard() && first[0] === openCard();
      const redOn = !!openCard() && swatchIn(openCard(), 'color', RED).classList.contains('is-active') && markBtn(openCard(), 'bold').classList.contains('is-active') && !markBtn(openCard(), 'italic').classList.contains('is-active');
      const title = modal().querySelector('h3').textContent;
      // Un clic sur une autre couleur et sur « Italique » : le nœud ne bouge pas.
      swatchIn(openCard(), 'color', BLUE).click();
      markBtn(openCard(), 'italic').click();
      swatchIn(openCard(), 'fill', FILL).click();
      await h.sleep(40);
      const untouched = JSON.stringify(savedStyle('varBadge')) === JSON.stringify(BIG_RED);
      const repainted = swatchIn(openCard(), 'color', BLUE).classList.contains('is-active') && !swatchIn(openCard(), 'color', RED).classList.contains('is-active');
      cancelBtn().click();
      await h.sleep(60);
      const afterCancel = JSON.stringify(savedStyle('varBadge')) === JSON.stringify(BIG_RED) && getComputedStyle(modal()).display === 'none';
      // Même chose, puis « Enregistrer ».
      await selectNode(h, 'varBadge', 0);
      pressToolbarButton('var-style');
      await h.sleep(120);
      swatchIn(openCard(), 'color', BLUE).click();
      markBtn(openCard(), 'italic').click();
      markBtn(openCard(), 'bold').click();
      swatchIn(openCard(), 'fill', FILL).click();
      saveBtn().click();
      await h.sleep(80);
      const saved = savedStyle('varBadge');
      const html = Editor.getHTML();
      const pass = opened && first.length === 1 && /Montant/.test(summary) && isOpen && redOn && title === I18n.t('condStyle.title') && untouched && repainted && afterCancel
        && saved && saved.rules.length === 1 && JSON.stringify(saved.rules[0].style) === JSON.stringify({ color: BLUE, fill: FILL, italic: true }) && JSON.stringify(saved.rules[0].condition) === JSON.stringify(BIG)
        && html.indexOf('data-cond-style=') !== -1;
      return { pass, notes: JSON.stringify({ opened, summary, isOpen, redOn, title, untouched, repainted, afterCancel, saved }) };
    },
  });

  cases.push({
    id: 'condstyle_window_add_rule_remove_rule_and_remove_the_whole_formatting',
    description: 'Dans la fenêtre : « + Ajouter une règle » ouvre une carte neuve (la précédente se replie), une règle sans condition complète n’est pas enregistrée (et la fenêtre le dit), la croix d’une carte la retire, « Retirer la mise en forme » vide le réglage du nœud ; on ne dépasse pas 8 règles',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(`<p>${badgeHtml('Montant', BIG_RED)}</p>`);
      await h.sleep(60);
      await selectNode(h, 'varBadge', 0);
      pressToolbarButton('var-style');
      await h.sleep(150);
      const addBtn = modal().querySelector('.cond-style-add');
      addBtn.click();
      await h.sleep(60);
      const two = cards().length === 2 && cards()[1] === openCard() && !cards()[0].classList.contains('is-open');
      // La carte neuve n'a ni condition complète ni style : la note des règles ignorées apparaît.
      const noteShown = !modal().querySelector('.cond-style-ignored').hidden;
      saveBtn().click();
      await h.sleep(80);
      const keptOnlyComplete = savedStyle('varBadge') && savedStyle('varBadge').rules.length === 1 && JSON.stringify(savedStyle('varBadge').rules[0].style) === JSON.stringify(BIG_RED.rules[0].style);
      // 8 règles au plus : le bouton se grise, avec sa raison.
      await selectNode(h, 'varBadge', 0);
      pressToolbarButton('var-style');
      await h.sleep(120);
      for (let i = 0; i < 9; i++) modal().querySelector('.cond-style-add').click();
      await h.sleep(60);
      const capped = cards().length === 8 && modal().querySelector('.cond-style-add').disabled && modal().querySelector('.cond-style-add').title === I18n.t('condStyle.addRuleMax', { max: 8 });
      // Retirer une règle (la croix de la dernière carte), puis tout retirer.
      cards()[7].querySelector('.cond-style-remove').click();
      await h.sleep(40);
      const sevenLeft = cards().length === 7 && !modal().querySelector('.cond-style-add').disabled;
      const removeShown = !removeBtn().hidden;
      removeBtn().click();
      await h.sleep(80);
      const cleared = savedStyle('varBadge') == null && Editor.getHTML().indexOf('data-cond-style') === -1;
      const pass = two && noteShown && keptOnlyComplete && capped && sevenLeft && removeShown && cleared;
      return { pass, notes: JSON.stringify({ two, noteShown, keptOnlyComplete, capped, sevenLeft, removeShown, cleared }) };
    },
  });

  cases.push({
    id: 'condstyle_window_builds_a_rule_from_scratch_on_a_block_and_a_value',
    description: 'Sur un bloc de texte et sur une valeur sans réglage : la fenêtre s’ouvre sur une carte vide, on y choisit une colonne et une valeur dans les lignes de condition, une couleur de fond et le gras ; « Enregistrer » écrit la règle dans le nœud (le bloc et la valeur gardent leur texte et leur condition d’affichage) ; la phrase d’aperçu cite la ligne sélectionnée',
    run: async (h) => {
      const out = {};
      for (const kind of ['conditionalText', 'conditionalValue']) {
        await seed(h, 1);
        Editor.setHTML(kind === 'conditionalText' ? `<p>Avant</p>${blockHtml('<p>texte du bloc</p>', URGENT, null)}<p>Après</p>` : `<p>Le dossier est ${valueHtml('prioritaire', URGENT, null)}.</p>`);
        await h.sleep(60);
        await selectNode(h, kind, 0);
        pressToolbarButton('var-style');
        await h.sleep(150);
        const emptyCard = cards().length === 1 && /./.test(cards()[0].querySelector('.cond-style-summary').textContent) && cards()[0].querySelector('.cond-style-summary').textContent === I18n.t('condStyle.summaryNone');
        const row = modal().querySelector('.macro-rule-row');
        await pickColumn(h, row, 'Montant');
        row.querySelector('select:not(.macro-rule-column)').value = '>';
        row.querySelector('select:not(.macro-rule-column)').dispatchEvent(new Event('change', { bubbles: true }));
        setInput(row.querySelector('.macro-rule-value'), '1000');
        swatchIn(openCard(), 'fill', FILL).click();
        markBtn(openCard(), 'bold').click();
        await h.sleep(700);
        const lines = Array.from(modal().querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent);
        const summary = cards()[0].querySelector('.cond-style-summary').textContent;
        saveBtn().click();
        await h.sleep(80);
        const saved = savedStyle(kind);
        const node = nodesOf(kind)[0].node;
        out[kind] = { emptyCard, summary, lines, saved, text: node.textContent, display: node.attrs.condition };
      }
      const good = kind => out[kind].emptyCard && /Montant/.test(out[kind].summary) && out[kind].saved && out[kind].saved.rules.length === 1
        && JSON.stringify(out[kind].saved.rules[0].style) === JSON.stringify({ fill: FILL, bold: true }) && out[kind].saved.rules[0].condition.rules[0].column === 'Montant' && out[kind].saved.rules[0].condition.rules[0].value === '1000'
        && JSON.stringify(out[kind].display) === JSON.stringify(URGENT) && /Ligne 1/.test(out[kind].lines[0] || '') && /Dossier|^$|Sur les/.test(out[kind].lines[1] || '');
      const pass = good('conditionalText') && good('conditionalValue') && out.conditionalText.text.indexOf('texte du bloc') !== -1 && out.conditionalValue.text === 'prioritaire';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Les renommages de colonnes ===
  const OLD = { f: 1, t: { 1: ['Dossiers', { 1: 'Titre', 2: 'Montant', 3: 'Statut' }], 3: ['Annuaire', { 8: 'NomPrenom', 9: 'Email' }] } };
  const NEW = { f: 1, t: { 1: ['Dossiers', { 1: 'Titre', 2: 'Total', 3: 'Statut' }], 3: ['Annuaire', { 8: 'NomPrenom', 9: 'Courriel' }] } };
  cases.push({
    id: 'condstyle_rules_follow_a_column_rename_on_the_four_nodes',
    description: 'Une colonne renommée dans Grist est réécrite dans les conditions de la mise en forme (js/schema-renames.js) - bulle, calcul, bloc, valeur, colonne d’une autre table et groupe de conditions compris - et les autres colonnes, valeurs et styles restent tels quels',
    run: async () => {
      const m = SchemaRenames.createMapper(OLD, NEW, {});
      const ctx = { page: m.tableContext('Dossiers'), trigger: Variables.triggerChar() };
      const group = { mode: 'any', rules: [{ column: 'Montant', operator: '>', value: '1' }, { column: 'Annuaire.Email', operator: '=', value: 'x' }] };
      const style = { rules: [
        { condition: { mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '100' }, group] }, style: { color: RED, bold: true } },
        { condition: { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] }, style: { fill: FILL } },
      ] };
      // Le modèle nomme la table « Dossiers » (celle de la page pour cet ancien schéma), comme dans la suite schemaRenames.
      const named = `<span class="var-badge" data-table="Dossiers" data-column="Titre" data-key="Dossiers.Titre"${attr('data-cond-style', style)}></span>`;
      const html = `<p>${named}${calcHtml('1', style)}${valueHtml('mot', null, style)}</p>${blockHtml('<p>texte</p>', null, style)}`;
      const out = SchemaRenames.rewriteHtml(html, m, ctx);
      const tpl = document.createElement('template');
      tpl.innerHTML = out.html;
      const specs = Array.from(tpl.content.querySelectorAll('[data-cond-style]')).map(el => JSON.parse(el.getAttribute('data-cond-style')));
      const one = specs[0];
      const pass = specs.length === 4 && out.count >= 4 && specs.every(s => JSON.stringify(s) === JSON.stringify(one))
        && one.rules[0].condition.rules[0].column === 'Total' && one.rules[0].condition.rules[0].value === '100' && one.rules[0].condition.rules[1].rules[0].column === 'Total'
        && one.rules[0].condition.rules[1].rules[1].column === 'Annuaire.Courriel' && one.rules[1].condition.rules[0].column === 'Statut'
        && JSON.stringify(one.rules[0].style) === JSON.stringify({ color: RED, bold: true }) && JSON.stringify(one.rules[1].style) === JSON.stringify({ fill: FILL });
      // Le HTML de départ n'est pas touché.
      const unchanged = SchemaRenames.rewriteHtml(`<p><span class="var-badge" data-table="Dossiers" data-column="Titre" data-key="Dossiers.Titre"${attr('data-cond-style', spec([URGENT, { color: RED }]))}></span></p>`, m, ctx);
      return { pass: pass && unchanged.count === 0, notes: JSON.stringify({ count: out.count, one, unchangedCount: unchanged.count }) };
    },
  });

  // === Français et anglais ===
  const KEYS = [
    'varToolbar.style', 'varToolbar.styleInField', 'varToolbar.styleCheckbox', 'condStyle.title', 'condStyle.intro.badge', 'condStyle.intro.calc', 'condStyle.intro.block', 'condStyle.intro.value',
    'condStyle.order', 'condStyle.rule', 'condStyle.summaryNone', 'condStyle.when', 'condStyle.text', 'condStyle.textAria', 'condStyle.fill', 'condStyle.fillAria', 'condStyle.marks', 'condStyle.marksAria', 'condStyle.noneTextTitle',
    'condStyle.noneFillTitle', 'condStyle.customTitle', 'condStyle.bold', 'condStyle.italic', 'condStyle.underline', 'condStyle.strike', 'condStyle.glyph.bold',
    'condStyle.glyph.italic', 'condStyle.glyph.underline', 'condStyle.glyph.strike', 'condStyle.sample', 'condStyle.addRule', 'condStyle.addRuleMax', 'condStyle.removeRule', 'condStyle.remove',
    'condStyle.ignored', 'condStyle.saveLost', 'condStyle.debug.chooseCondition', 'condStyle.debug.noRecord', 'condStyle.debug.computing', 'condStyle.debug.met', 'condStyle.debug.none', 'condStyle.debug.count',
  ];
  const stylePassCase = {
    id: 'condstyle_texts_exist_in_both_languages_and_the_window_speaks_the_page_language',
    lang: 'fr',
    description: 'Chaque phrase de la mise en forme conditionnelle existe en français et en anglais (aucune clé nue), et la barre, la fenêtre, son aperçu et ses boutons parlent la langue de la page',
    run: async (h) => {
      const missing = { fr: [], en: [] };
      for (const lang of ['fr', 'en']) await inLang(lang, () => KEYS.forEach(key => { if (!I18n.has(key) || I18n.t(key) === key || !I18n.t(key).trim()) missing[lang].push(key); }));
      const lang = I18n.getLang();
      await seed(h, 1);
      Editor.setHTML(`<p>${badgeHtml('Montant', BIG_RED)}</p>`);
      await h.sleep(60);
      await selectNode(h, 'varBadge', 0);
      const barTitle = barButton('var-style').title;
      pressToolbarButton('var-style');
      await h.sleep(700);
      const seen = {
        barTitle, title: modal().querySelector('h3').textContent, add: modal().querySelector('.cond-style-add').textContent, save: saveBtn().textContent, remove: removeBtn().textContent,
        cancel: cancelBtn().textContent, rule: cards()[0].querySelector('.cond-style-num').textContent, glyphs: Array.from(modal().querySelectorAll('.cond-style-mark')).map(b => b.textContent).join(''),
        line: Array.from(modal().querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent)[0],
      };
      cancelBtn().click();
      await h.sleep(40);
      const want = lang === 'en'
        ? { barTitle: 'Conditional formatting', title: 'Conditional formatting', add: '+ Add a rule', save: 'Save', remove: 'Remove formatting', cancel: 'Cancel', rule: 'Rule 1', glyphs: 'BIUS', line: /^Row 1: rule 1 is met\. Result:/ }
        : { barTitle: 'Mise en forme conditionnelle', title: 'Mise en forme conditionnelle', add: '+ Ajouter une règle', save: 'Enregistrer', remove: 'Retirer la mise en forme', cancel: 'Annuler', rule: 'Règle 1', glyphs: 'GISB', line: /^Ligne 1 : règle n° 1 remplie\. Résultat :/ };
      const pass = missing.fr.length === 0 && missing.en.length === 0 && Object.keys(want).every(key => (want[key] instanceof RegExp ? want[key].test(seen[key] || '') : want[key] === seen[key]));
      return { pass, notes: JSON.stringify({ lang, seen, missing }) };
    },
  };
  cases.push(stylePassCase, Object.assign({}, stylePassCase, {
    id: 'condstyle_texts_exist_in_both_languages_and_the_window_speaks_the_page_language_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la barre, la fenêtre, son aperçu et ses boutons de la mise en forme conditionnelle sont en anglais - sans clé manquante dans les deux langues',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condStyle = cases;
})();
