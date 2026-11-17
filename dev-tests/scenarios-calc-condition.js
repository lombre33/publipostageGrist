// Suite "calcCondition" - la condition d'affichage d'un calcul (demande d'Antoine du 17/11 : « y a-t-il une raison pour laquelle un calcul ne pourrait pas avoir une condition ? Si non, le
// faire »). L'icône « Condition d'affichage » de la barre d'une bulle « Calcul » était grisée (« Disponible pour une variable, pas pour un calcul ») sans raison technique : le nœud calcBadge
// (js/editor-nodes.js) n'avait pas d'attribut `condition`. Il l'a maintenant, comme une bulle de variable : même fenêtre (js/variable-condition.js, texte propre au calcul dans
// js/variable-condition-data.js, sans « Avant » / « Après » ni sinon), même évaluation sur la ligne affichée ou le tour d'une zone répétée (js/reader-mode.js:badgeConditionHolds, avant le calcul :
// un calcul caché n'est pas évalué), mêmes sorties - Lecture, PDF, Word, e-mail, en-têtes et pieds, Excel (la case d'un calcul caché est vide : suite `xlsx`), info-bulle de valeur
// (ReaderMode.peek), contrôle d'avant lot (ReaderMode.inspect) - et mêmes pointillés bleus dans l'éditeur (css/variable-calc.css).
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'CcFactures';
  const LINES = 'CcLignes';
  const NBSP = ' ';
  const RECORD = { id: 1, Ref: 'F-001', HT: 1000, Taux: 20, Remise: 0 };
  const RECORD_2 = { id: 2, Ref: 'F-002', HT: 500, Taux: 20, Remise: 0 };
  const COND_F001 = { mode: 'all', rules: [{ column: 'Ref', operator: '=', value: 'F-001' }] };
  const COND_F002 = { mode: 'all', rules: [{ column: 'Ref', operator: '=', value: 'F-002' }] };
  const RATE = '{CcFactures.Taux} + 1';

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const esc = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const calc = (formula, condition) => `<span class="calc-badge" data-formula="${esc(formula)}"${condition ? attr('data-condition', condition) : ''}></span>`;
  function badge(column, table, loop) {
    const t = table || PAGE;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${t}" data-column="${column}" data-key="${t}.${column}"${loopAttrs}></span>`;
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Ref: 'Text', HT: 'Numeric', Taux: 'Numeric', Remise: 'Numeric' });
    stub.setVariables(LINES, { Facture: 'Ref:' + PAGE, Libelle: 'Text', Prix: 'Numeric', Qte: 'Int', manualSort: 'ManualSortPos' });
    stub.setRows(PAGE, [Object.assign({}, RECORD), Object.assign({}, RECORD_2)]);
    stub.setRows(LINES, [
      { id: 1, Facture: 1, Libelle: 'Livret', Prix: 1500, Qte: 2, manualSort: 1 },
      { id: 2, Facture: 1, Libelle: 'Envoi', Prix: 25, Qte: 4, manualSort: 2 },
      { id: 3, Facture: 1, Libelle: 'Suivi', Prix: 3, Qte: 7, manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    window.__gristStub.fireRecord(Object.assign({}, RECORD), PAGE);
    await h.sleep(40);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), PAGE);
    await h.sleep(40);
  }
  async function renderReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, NO_HF);
    return reader;
  }
  async function previewBox(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, record);
    return box;
  }
  const resolvedTexts = root => Array.from(root.querySelectorAll('.resolved-var')).map(e => e.textContent);
  const paragraphs = root => Array.from(root.querySelectorAll('p')).map(p => p.textContent.replace(/\s+/g, ' ').trim());
  const rowTexts = table => Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join(' | '));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);

  function ed() { return EditorCore.getEditor(); }
  function calcNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'calcBadge') out.push({ node, pos }); });
    return out;
  }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  function setSelect(select, value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const toolbarButton = action => toolbar().querySelector(`button[data-action="${action}"]`);
  const pressToolbarButton = action => toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  async function selectNode(h, pos) {
    document.querySelector('.tiptap').focus();
    ed().commands.setNodeSelection(pos);
    await h.sleep(150);
  }
  const conditionModal = () => document.getElementById('var-condition-modal');
  const windowButton = (modal, label) => Array.from(modal.querySelectorAll('.var-modal-actions button')).find(b => b.textContent === label);
  const debugLines = modal => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => (l.hidden ? '' : l.textContent));

  // Une page avec un calcul, sélectionné : sa barre est affichée.
  async function placeCalc(h, condition) {
    await seed(h);
    Editor.setHTML(`<p>Taux : ${calc(RATE, condition)} fin</p>`);
    await h.sleep(80);
    const placed = calcNodes()[0];
    await selectNode(h, placed.pos);
    return placed;
  }

  // === Le nœud ===
  cases.push({
    id: 'calccond_condition_survives_the_html_round_trip_and_a_calc_without_one_stays_plain',
    description: 'La condition d’un calcul survit à l’aller-retour HTML (data-condition), à l’enregistrement puis à la relecture du HTML enregistré (collage compris) ; un calcul sans condition n’écrit pas l’attribut',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${calc(RATE, COND_F001)} et ${calc(RATE)}</p>`);
      await h.sleep(60);
      const nodes = calcNodes();
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const spans = box.querySelectorAll('span.calc-badge');
      let parsed = null;
      try { parsed = JSON.parse(spans[0].getAttribute('data-condition')); } catch (e) { /* verdict ci-dessous */ }
      Editor.setHTML('<p></p>');
      await h.sleep(30);
      Editor.setHTML(html);
      await h.sleep(60);
      const again = calcNodes();
      const checks = {
        two: nodes.length === 2 && again.length === 2,
        conditionKept: same(nodes[0].node.attrs.condition, COND_F001) && nodes[1].node.attrs.condition == null,
        written: same(parsed, COND_F001) && !spans[1].hasAttribute('data-condition'),
        readBack: same(again[0].node.attrs.condition, COND_F001) && again[1].node.attrs.condition == null && again[0].node.attrs.formula === RATE,
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, html }) };
    },
  });

  // === La barre et la fenêtre ===
  cases.push({
    id: 'calccond_toolbar_condition_is_available_on_a_calc_and_the_window_is_the_one_of_a_variable_without_affixes_or_otherwise',
    description: 'Bulle « Calcul » sélectionnée : « Condition d’affichage » n’est plus grisée (nom d’origine, éteinte), « Autres attributs » et « Boucle » restent grisés avec leur raison ; un clic ouvre la fenêtre de condition avec la phrase du calcul, sans « Avant » / « Après », sans sinon, sans « Défaire » ni « Retirer la condition » ; la barre se cache sous la fenêtre',
    run: async (h) => {
      await placeCalc(h);
      const btn = toolbarButton('var-condition');
      const bar = {
        enabled: !btn.classList.contains('is-disabled') && btn.getAttribute('aria-disabled') !== 'true', title: btn.title, aria: btn.getAttribute('aria-label'), off: !btn.classList.contains('is-active'),
        linked: toolbarButton('var-linked').classList.contains('is-disabled') && toolbarButton('var-linked').title === I18n.t('varToolbar.notForCalc'),
        loop: toolbarButton('var-loop').classList.contains('is-disabled') && toolbarButton('var-loop').title === I18n.t('varToolbar.notForCalc'),
        list: toolbarButton('var-list').classList.contains('is-disabled') && toolbarButton('var-list').title === I18n.t('varToolbar.notForCalc'),
        edit: visible(toolbarButton('calc-edit')),
      };
      pressToolbarButton('var-condition');
      await h.sleep(120);
      const modal = conditionModal();
      const win = modal && visible(modal) ? {
        title: modal.querySelector('#var-condition-title').textContent, intro: modal.querySelector('.var-modal-intro').textContent,
        affixes: visible(modal.querySelector('.var-condition-affix')), otherwise: Array.from(modal.querySelectorAll('[class*="var-condition-otherwise"]')).filter(visible).length,
        unwrap: visible(modal.querySelector('.var-modal-unwrap')), remove: visible(modal.querySelector('.var-modal-danger:not(.var-modal-unwrap)')),
        rows: modal.querySelectorAll('.macro-rule-row').length, barHidden: !toolbar().classList.contains('visible'), open: VariableCondition.isOpen(),
        lines: debugLines(modal),
      } : null;
      if (modal) windowButton(modal, I18n.t('common.cancel')).click();
      await h.sleep(60);
      const checks = {
        barEnabled: bar.enabled && bar.title === I18n.t('varToolbar.condition') && bar.aria === I18n.t('varToolbar.condition') && bar.off,
        otherButtonsStayGreyed: bar.linked && bar.loop && bar.list && bar.edit,
        windowOpens: !!win && win.open && win.title === I18n.t('varCond.title') && win.rows === 1 && win.barHidden,
        calcSentence: !!win && win.intro === I18n.t('varCond.introCalc') && win.intro.indexOf('calcul') !== -1,
        noAffixesNoOtherwiseNoUnwrap: !!win && !win.affixes && win.otherwise === 0 && !win.unwrap && !win.remove,
        previewAsksForARule: !!win && win.lines[0] === I18n.t('varCond.debug.chooseColumn'),
        closedByCancel: !visible(conditionModal()) && ed().state.doc.firstChild.childCount > 0 && calcNodes()[0].node.attrs.condition == null,
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, bar, win }) };
    },
  });

  cases.push({
    id: 'calccond_window_saves_previews_and_removes_the_condition_of_a_calc_and_ctrl_z_undoes_it',
    description: 'La fenêtre pose la condition sur la bulle « Calcul » (aperçu : la ligne sélectionnée « le calcul s’affiche », « 1 ligne sur 2 »), Enregistrer l’écrit dans le nœud et dans le HTML, le bouton s’allume, pointillés bleus dans l’éditeur ; Ctrl+Z la retire, Retirer la condition aussi ; interface en anglais : titre, phrase et aperçu en anglais',
    run: async (h) => {
      const placed = await placeCalc(h);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      let modal = conditionModal();
      const row = modal.querySelector('.macro-rule-row');
      setSelect(row.querySelector('select.macro-rule-column'), 'Ref');
      await h.sleep(30);
      setInput(row.querySelector('.macro-rule-value'), 'F-001');
      await h.sleep(700);
      const lines = debugLines(modal);
      windowButton(modal, I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = calcNodes()[0].node.attrs.condition;
      const html = Editor.getHTML();
      const dashed = getComputedStyle(document.querySelector('.tiptap .calc-badge')).borderTopStyle;
      await selectNode(h, placed.pos);
      const lit = toolbarButton('var-condition').classList.contains('is-active');
      // Ctrl+Z : la condition s'en va, la formule reste.
      ed().commands.undo();
      await h.sleep(120);
      const undone = { condition: calcNodes()[0].node.attrs.condition, formula: calcNodes()[0].node.attrs.formula };
      ed().commands.redo();
      await h.sleep(120);
      const redone = calcNodes()[0].node.attrs.condition;
      // Rouverte : les règles sont là, « Retirer la condition » enlève.
      await selectNode(h, calcNodes()[0].pos);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      modal = conditionModal();
      const reopened = { column: modal.querySelector('select.macro-rule-column').value, value: modal.querySelector('.macro-rule-value').value, remove: visible(modal.querySelector('.var-modal-danger:not(.var-modal-unwrap)')) };
      modal.querySelector('.var-modal-danger:not(.var-modal-unwrap)').click();
      await h.sleep(100);
      const removed = calcNodes()[0].node.attrs.condition;
      const htmlRemoved = Editor.getHTML();
      // En anglais.
      const before = I18n.getLang();
      let english = null;
      I18n.setLang('en');
      try {
        await selectNode(h, calcNodes()[0].pos);
        pressToolbarButton('var-condition');
        await h.sleep(80);
        const en = conditionModal();
        const enRow = en.querySelector('.macro-rule-row');
        setSelect(enRow.querySelector('select.macro-rule-column'), 'Ref');
        await h.sleep(30);
        setInput(enRow.querySelector('.macro-rule-value'), 'F-001');
        await h.sleep(700);
        english = { title: en.querySelector('#var-condition-title').textContent, intro: en.querySelector('.var-modal-intro').textContent, lines: debugLines(en), toolbar: toolbarButton('var-condition').title };
        windowButton(en, I18n.t('common.cancel')).click();
        await h.sleep(60);
      } finally { I18n.setLang(before); }
      const checks = {
        preview: lines[0] === I18n.t('varCond.debug.currentMetCalc', { id: 1 }) && lines[0].indexOf('le calcul s’affiche') !== -1
          && lines[1].indexOf(I18n.t('varCond.debug.count', { table: PAGE, count: 1, total: 2 })) === 0 && lines[1].indexOf('1 ligne sur 2 remplit la condition') !== -1,
        saved: same(saved, COND_F001) && html.indexOf('data-condition') !== -1 && html.indexOf('data-formula="' + RATE + '"') !== -1 && !visible(conditionModal()),
        lit, dashed: dashed === 'dashed',
        undone: undone.condition == null && undone.formula === RATE && same(redone, COND_F001),
        reopened: reopened.column === 'Ref' && reopened.value === 'F-001' && reopened.remove,
        removed: removed == null && htmlRemoved.indexOf('data-condition') === -1,
        english: !!english && english.title === 'Display condition' && english.intro === 'This calculation only appears in Read mode and in exports when the condition is met. While editing, the bubble stays visible with a dashed border.'
          && english.lines[0] === 'Selected row (#1): condition met, the calculation is shown.' && english.toolbar === 'Display condition',
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, lines, saved, dashed, undone, reopened, removed, english }) };
    },
  });

  cases.push({
    id: 'calccond_editing_the_formula_keeps_the_condition',
    description: 'Modifier le calcul (« Modifier le calcul », fenêtre de la formule) change la formule sans perdre la condition d’affichage ni le format de la bulle',
    run: async (h) => {
      const withFormat = `<span class="calc-badge" data-formula="${esc(RATE)}"${attr('data-condition', COND_F001)}${attr('data-format', { type: 'number', style: 'us', decimals: 1 })}></span>`;
      await seed(h);
      Editor.setHTML(`<p>Taux : ${withFormat}</p>`);
      await h.sleep(80);
      await selectNode(h, calcNodes()[0].pos);
      pressToolbarButton('calc-edit');
      await h.sleep(120);
      const modal = document.getElementById('pp-calc-modal');
      setInput(document.getElementById('pp-calc-formula'), '#CcFactures.HT * 0,5');
      await h.sleep(500);
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(150);
      const node = calcNodes()[0].node;
      const checks = {
        formula: node.attrs.formula === '{CcFactures.HT} * 0.5',
        condition: same(node.attrs.condition, COND_F001),
        format: same(node.attrs.format, { type: 'number', style: 'us', decimals: 1 }),
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, attrs: node.attrs }) };
    },
  });

  // === La Lecture et les exports ===
  cases.push({
    id: 'calccond_reader_and_exports_hide_the_calc_the_condition_rejects_and_keep_the_text_around',
    description: 'Mode Lecture, aperçu commun du PDF, du Word et de l’e-mail, en-tête et pied : le calcul dont la condition est remplie écrit son résultat, celui dont elle ne l’est pas disparaît (le texte autour reste) ; un calcul sans condition s’écrit toujours ; la ligne affichée décide',
    run: async (h) => {
      await seed(h);
      const html = `<p>Taux : ${calc(RATE, COND_F001)} fin</p><p>Toujours : ${calc(RATE)} fin</p>`;
      const reading1 = await renderReader(html, RECORD);
      const read1 = { texts: resolvedTexts(reading1), paragraphs: paragraphs(reading1.querySelector('.reader-content')) };
      await setRecord(h, RECORD_2);
      const reading2 = await renderReader(html, RECORD_2);
      const read2 = { texts: resolvedTexts(reading2), paragraphs: paragraphs(reading2.querySelector('.reader-content')) };
      const preview1 = paragraphs(await previewBox(html, RECORD));
      const preview2 = paragraphs(await previewBox(html, RECORD_2));
      const hf = { enabled: true, differentFirstPage: false, header: { default: `<p>En-tête ${calc(RATE, COND_F001)}</p>`, first: '' }, footer: { default: `<p>Pied ${calc(RATE, COND_F002)}</p>`, first: '' } };
      const zoneText = zone => { const d = document.createElement('div'); d.innerHTML = zone; return d.textContent.replace(/\s+/g, ' ').trim(); };
      const zones1 = await ExportCommon.resolveHeaderFooterVariables(hf, PAGE, RECORD);
      const zones2 = await ExportCommon.resolveHeaderFooterVariables(hf, PAGE, RECORD_2);
      const checks = {
        readingMet: same(read1.texts, ['21', '21']) && read1.paragraphs[0] === 'Taux : 21 fin' && read1.paragraphs[1] === 'Toujours : 21 fin',
        readingNotMet: same(read2.texts, ['21']) && read2.paragraphs[0] === 'Taux : fin' && read2.paragraphs[1] === 'Toujours : 21 fin',
        previewMet: same(preview1, ['Taux : 21 fin', 'Toujours : 21 fin']),
        previewNotMet: same(preview2, ['Taux : fin', 'Toujours : 21 fin']),
        headerAndFooter: zoneText(zones1.header.default) === 'En-tête 21' && zoneText(zones1.footer.default) === 'Pied'
          && zoneText(zones2.header.default) === 'En-tête' && zoneText(zones2.footer.default) === 'Pied 21',
      };
      document.getElementById('reader-container').style.display = '';
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, read1, read2, preview1, preview2, zones: [zoneText(zones1.header.default), zoneText(zones1.footer.default), zoneText(zones2.header.default), zoneText(zones2.footer.default)] }) };
    },
  });

  cases.push({
    id: 'calccond_in_a_repeated_row_each_turn_is_judged_on_its_own_row',
    description: 'Dans une ligne de tableau répétée par ligne liée, la condition d’un calcul lit la ligne du tour : « Libellé ≠ Envoi » masque le total de la ligne « Envoi » seulement (Lecture et aperçu commun du PDF et du Word), les autres lignes écrivent le leur',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'row', table: LINES, empty: 'header' };
      const condition = { mode: 'all', rules: [{ column: LINES + '.Libelle', operator: '≠', value: 'Envoi' }] };
      const cell = content => `<td><p>${content}</p></td>`;
      const html = '<table><tbody><tr><th><p>Libellé</p></th><th><p>Somme</p></th></tr>'
        + `<tr>${cell(badge('Libelle', LINES, loop))}${cell(calc('{CcLignes.Prix} + {CcLignes.Qte}', condition))}</tr></tbody></table>`;
      const expected = ['Libellé | Somme', 'Livret | 1' + NBSP + '502', 'Envoi | ', 'Suivi | 10'];
      const read = (await renderReader(html, RECORD)).querySelector('.reader-content table');
      const preview = (await previewBox(html, RECORD)).querySelector('table');
      document.getElementById('reader-container').style.display = '';
      const checks = { reading: same(rowTexts(read), expected), preview: same(rowTexts(preview), expected) };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, reading: rowTexts(read), preview: rowTexts(preview) }) };
    },
  });

  cases.push({
    id: 'calccond_a_hidden_calc_is_not_evaluated_so_its_error_is_not_reported_before_a_batch',
    description: 'Le contrôle d’avant lot (ReaderMode.inspect) ne signale pas l’erreur d’un calcul que sa condition cache (division par zéro sur une ligne qui ne l’affiche pas), et la signale pour la ligne où il s’affiche',
    run: async (h) => {
      await seed(h);
      const html = `<p>${calc('{CcFactures.HT} / {CcFactures.Remise}', COND_F002)}</p>`;
      const hidden = await ReaderMode.inspect(html, PAGE, RECORD);
      const shown = await ReaderMode.inspect(html, PAGE, RECORD_2);
      const reading = await previewBox(html, RECORD_2);
      const checks = {
        hiddenNoError: hidden.errors.length === 0,
        shownReported: shown.errors.length === 1 && shown.errors[0].calc === true && shown.errors[0].text.indexOf('[ERREUR') === 0,
        previewWritesTheError: reading.textContent.indexOf('[ERREUR') === 0,
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, hidden: hidden.errors, shown: shown.errors }) };
    },
  });

  cases.push({
    id: 'calccond_hover_tip_says_the_calc_is_hidden_for_a_row_its_condition_rejects',
    description: 'L’info-bulle de valeur d’une bulle « Calcul » (ReaderMode.peek) dit « masquée » pour la ligne que sa condition refuse et donne le résultat pour la ligne qu’elle accepte, sans rien écrire dans le document',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${calc(RATE, COND_F001)}</p>`);
      await h.sleep(80);
      const el = document.querySelector('.tiptap .calc-badge');
      const before = ed().getHTML();
      const met = await ReaderMode.peek(el, PAGE, RECORD, { root: ed().view.dom, max: 5 });
      const notMet = await ReaderMode.peek(el, PAGE, RECORD_2, { root: ed().view.dom, max: 5 });
      const checks = {
        met: met.turns.length === 1 && met.turns[0].text === '21',
        notMet: notMet.turns.length === 1 && notMet.turns[0].hidden === true,
        documentUntouched: ed().getHTML() === before,
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, met: met.turns, notMet: notMet.turns }) };
    },
  });

  cases.push({
    id: 'calccond_pdf_file_of_a_row_leaves_out_the_calc_the_condition_rejects',
    description: 'Le vrai PDF d’une ligne écrit le calcul dont la condition est remplie et laisse de côté celui dont elle ne l’est pas, avec le texte autour',
    run: async (h) => {
      await seed(h);
      const html = `<p>Taux : ${calc(RATE, COND_F001)} fin de ligne</p><p>Marge : ${calc('{CcFactures.HT} * 3', COND_F002)} euros</p>`;
      await PdfExport.ensurePdfLibsLoaded();
      await h.ensurePdfJsLoaded();
      async function textOf(record) {
        const blob = (await PdfExport.getNativePdfBlobForRecord(html, PAGE, record, '', NO_HF, undefined)).blob;
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        let text = '';
        for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(it => it.str).join(' ');
        return text.replace(/\s+/g, ' ').trim();
      }
      const one = await textOf(RECORD);
      const two = await textOf(RECORD_2);
      const checks = {
        first: /Taux : ?21 ?fin de ligne/.test(one) && /Marge : ?euros/.test(one),
        second: /Taux : ?fin de ligne/.test(two) && /Marge : ?1 ?500 ?euros/.test(two),
      };
      const failed = failedOf(checks);
      return { pass: !failed.length, notes: JSON.stringify({ failed, one, two }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.calcCondition = cases;
})();
