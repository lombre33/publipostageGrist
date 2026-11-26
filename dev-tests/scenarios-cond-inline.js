// Suite "condInline" - « Mettre dans la phrase » (un bloc de texte conditionnel devient une valeur conditionnelle, au bout de la ligne d'avant) et son inverse « Mettre sur sa
// ligne » (demande d'Antoine du 2026-11-26 : « un bloc de texte conditionnel qui puisse commencer en cours de ligne », sans bloquer le texte JUSTIFIÉ - la ligne d'avant d'un bloc est
// la dernière de son paragraphe, jamais étirée ; carte « Comment faire commencer ton texte conditionnel en cours de ligne ? », réponse « Bouton « Mettre dans la phrase » »).
// js/conditional-text.js (toValue, inlineObstacle), js/conditional-value.js (toBlock, blockObstacle), le bouton de la fenêtre de condition (js/variable-condition.js :
// draftPatch, switchNode, syncInlineButton), ses phrases (js/i18n-texts-variables.js : varCond.toValue*, varCond.toBlock*), la Lecture et les exports qui lisent le même HTML résolu
// (js/reader-mode.js -> ConditionalValue.resolve). Jeu de données de la suite condText, sous d'autres noms de tables. La vraie souris est dans verify-cond-inline-mouse.mjs.
(function () {
  const cases = [];

  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TABLE = 'CiDossiers';
  const JUSTIFY = ' style="text-align: justify"';

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  const escapeAttr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function block(inner, condition, otherwise, style) {
    return `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}${otherwise != null ? ` data-otherwise="${escapeAttr(otherwise)}"` : ''}${style ? attr('data-cond-style', style) : ''}>${inner}</div>`;
  }
  function val(inner, condition, otherwise) {
    return `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}${otherwise != null ? ` data-otherwise="${escapeAttr(otherwise)}"` : ''}>${inner}</span>`;
  }
  function badgeHtml(column, condition) {
    return `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Responsable: 'Text', Montant: 'Numeric' });
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  async function previewBox(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  // La forme d'un conteneur : « p:Avant | ul » (texte des paragraphes, tag des autres blocs).
  const shape = root => Array.from(root.children).filter(c => c.tagName !== 'STYLE').map(c => (c.tagName === 'P' ? 'p:' + c.textContent.trim() : c.tagName.toLowerCase())).join(' | ');

  function ed() { return EditorCore.getEditor(); }
  function nodesOf(type) {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === type) out.push({ node, pos }); });
    return out;
  }
  const blockNodes = () => nodesOf('conditionalText');
  const valueNodes = () => nodesOf('conditionalValue');
  // Le document d'un coup d'œil : « paragraph[justify]("Avant " conditionalValue("texte")) | paragraph("Fin") ».
  function describe(node) {
    if (node.isText) return '"' + node.text + '"';
    const head = node.type.name + (node.attrs.textAlign === 'justify' ? '[justify]' : '');
    return node.childCount ? head + '(' + outline(node) + ')' : head;
  }
  function outline(node) {
    const parts = [];
    node.forEach(child => parts.push(describe(child)));
    return parts.join(' ');
  }
  const docOutline = () => outline(ed().state.doc);
  // Les blocs du haut du document, séparés par « | » ; le paragraphe vide que l'éditeur ajoute à la fin d'un document qui finit par un bloc n'en fait pas partie.
  function tops() {
    const out = [];
    ed().state.doc.forEach(node => out.push(describe(node)));
    if (out.length > 1 && out[out.length - 1] === 'paragraph') out.pop();
    return out.join(' | ');
  }

  function tags() { return Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')); }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function pressToolbarButton(action) { toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  function conditionModal() { return document.getElementById('var-condition-modal'); }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const footerLabels = modal => Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent);
  const switchButton = modal => modal.querySelector('.var-modal-actions .var-modal-switch');
  const areaOf = modal => modal.querySelector('#var-condition-otherwise-area');
  function cancelWindow(modal) { modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click(); }
  async function clickTag(h, index) {
    document.querySelector('.tiptap').focus();
    const tag = tags()[index || 0];
    if (!tag) return null;
    tag.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(120);
    return tag;
  }
  async function openBlockWindow(h, index) {
    await clickTag(h, index || 0);
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }
  async function openValueWindow(h, index) {
    const found = valueNodes()[index || 0];
    ed().commands.setTextSelection(found.pos + 1 + found.node.content.size);
    ed().view.focus();
    await h.sleep(120);
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }
  const attrsOf = node => ({ condition: node.attrs.condition, otherwise: node.attrs.otherwise, condStyle: node.attrs.condStyle });
  // La sélection : dans quel nœud, à quel décalage, et au bout du texte ?
  function caret() {
    const s = ed().state.selection;
    return { empty: s.empty, parent: s.$from.parent.type.name, atEnd: s.$from.parentOffset === s.$from.parent.content.size };
  }
  const FIRST_LINE = 'Suite au Comité Thématique Opérationnel Innovation du 16/11/2026 de ';
  const SENTENCE = 'financer dans le cadre de ses investissements d’avenir, via le programme ';

  // === Bloc -> valeur ===
  cases.push({
    id: 'condinline_block_becomes_a_value_at_the_end_of_the_justified_line_before_with_its_settings_and_one_undo_brings_it_back',
    description: '« Mettre dans la phrase » : le bloc d’un paragraphe devient une valeur conditionnelle au bout du paragraphe justifié qui le précède (le paragraphe garde son alignement, les deux textes ne font plus qu’un), avec sa condition et son sinon, une seule transaction, curseur au bout du texte dans la valeur, fenêtre fermée ; un Annuler rend le bloc',
    run: async (h) => {
      await seed(h);
      const original = `<p${JUSTIFY}>${FIRST_LINE}</p>` + block(`<p>${SENTENCE}${badgeHtml('Titre')} mois.</p>`, COND_URGENT, 'à confirmer') + '<p>Fin</p>';
      Editor.setHTML(original);
      await h.sleep(650);
      const before = Editor.getHTML();
      const modal = await openBlockWindow(h, 0);
      const button = switchButton(modal);
      const opened = { label: button && button.textContent, title: button && button.title, disabled: button && button.disabled, footer: footerLabels(modal) };
      if (!button) return { pass: false, notes: JSON.stringify({ opened }) };
      button.click();
      await h.sleep(120);
      const after = {
        outline: tops(), blocks: blockNodes().length, values: valueNodes().length, closed: !VariableCondition.isOpen() && !visible(conditionModal()),
        attrs: valueNodes()[0] && attrsOf(valueNodes()[0].node), caret: caret(), focus: !!document.activeElement && !!document.activeElement.closest('.tiptap'),
      };
      await h.clickButton('v2-btn-undo');
      await h.sleep(120);
      const undone = Editor.getHTML();
      await h.clickButton('v2-btn-redo');
      await h.sleep(120);
      const redone = tops();
      const pass = opened.label === I18n.t('varCond.toValue') && opened.title === I18n.t('varCond.toValueTitle') && opened.disabled === false
        && JSON.stringify(opened.footer) === JSON.stringify([I18n.t('varCond.remove'), I18n.t('varCond.unwrapBlock'), I18n.t('varCond.toValue'), I18n.t('common.cancel'), I18n.t('common.save')])
        && after.outline === `paragraph[justify]("${FIRST_LINE}" conditionalValue("${SENTENCE}" varBadge " mois.")) | paragraph("Fin")`
        && after.blocks === 0 && after.values === 1 && after.closed
        && JSON.stringify(after.attrs.condition) === JSON.stringify(COND_URGENT) && after.attrs.otherwise === 'à confirmer'
        && after.caret.empty && after.caret.parent === 'conditionalValue' && after.caret.atEnd && after.focus
        && undone === before && redone === after.outline;
      return { pass, notes: JSON.stringify({ opened, after, undoneIsBefore: undone === before, redone }) };
    },
  });

  cases.push({
    id: 'condinline_a_space_is_added_between_the_line_before_and_the_value_only_when_it_has_none',
    description: 'Le bloc commençait une ligne : c’était un autre mot. « de » + « financer » ne doit pas faire « definancer » - une espace se pose au bout de la ligne d’avant quand elle n’en a pas (texte, bulle de variable au bout), pas après un retour à la ligne, pas devant un paragraphe vide, pas quand le texte du bloc commence lui-même par une espace',
    run: async (h) => {
      await seed(h);
      const run = async (before, inner, leadingSpace) => {
        Editor.setHTML(before + block(inner, COND_URGENT) + '<p>Fin</p>');
        await h.sleep(60);
        // L'analyse du HTML retire l'espace qui commence un paragraphe : celle du texte du bloc est tapée dans le document.
        if (leadingSpace) ed().view.dispatch(ed().state.tr.insertText(' ', blockNodes()[0].pos + 2));
        const result = ConditionalText.toValue(ed(), blockNodes()[0].pos, {});
        return { ok: result.ok, outline: tops() };
      };
      const results = {
        bare: await run('<p>Texte de</p>', '<p>financer</p>'),
        spaced: await run('<p>Texte de </p>', '<p>financer</p>'),
        afterBadge: await run(`<p>Dossier ${badgeHtml('Titre')}</p>`, '<p>financer</p>'),
        afterBreak: await run('<p>Texte de<br></p>', '<p>financer</p>'),
        emptyBefore: await run('<p></p>', '<p>financer</p>'),
        startsWithSpace: await run('<p>Texte de</p>', '<p>financer</p>', true),
        emptyBlock: await run('<p>Texte de</p>', '<p></p>'),
      };
      const pass = results.bare.outline === 'paragraph("Texte de " conditionalValue("financer")) | paragraph("Fin")'
        && results.spaced.outline === 'paragraph("Texte de " conditionalValue("financer")) | paragraph("Fin")'
        && results.afterBadge.outline === 'paragraph("Dossier " varBadge " " conditionalValue("financer")) | paragraph("Fin")'
        && results.afterBreak.outline === 'paragraph("Texte de" hardBreak conditionalValue("financer")) | paragraph("Fin")'
        && results.emptyBefore.outline === 'paragraph(conditionalValue("financer")) | paragraph("Fin")'
        && results.startsWithSpace.outline === 'paragraph("Texte de" conditionalValue(" financer")) | paragraph("Fin")'
        && results.emptyBlock.outline === 'paragraph("Texte de " conditionalValue) | paragraph("Fin")'
        && Object.values(results).every(r => r.ok);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condinline_without_a_paragraph_right_before_it_the_block_becomes_a_paragraph_with_the_value',
    description: 'Un bloc sans paragraphe juste devant lui (premier du document, après un titre, une liste ou un autre bloc) devient un paragraphe qui porte la valeur : le titre, la liste et l’autre bloc ne sont pas touchés ; dans une case de tableau et un élément de liste, le texte rejoint le paragraphe d’avant',
    run: async (h) => {
      await seed(h);
      const results = {};
      const run = async (key, html) => {
        Editor.setHTML(html);
        await h.sleep(60);
        const done = ConditionalText.toValue(ed(), blockNodes()[0].pos, {});
        results[key] = { ok: done.ok, outline: docOutline() };
      };
      await run('first', block('<p>Un</p>', COND_URGENT) + '<p>Fin</p>');
      await run('afterHeading', '<h2>Titre</h2>' + block('<p>Un</p>', COND_URGENT));
      await run('afterList', '<ul><li><p>Item</p></li></ul>' + block('<p>Un</p>', COND_URGENT));
      await run('afterBlock', block('<p>Premier</p>', COND_URGENT) + block('<p>Second</p>', COND_URGENT) + '<p>Fin</p>');
      await run('inCell', '<table><tbody><tr><td><p>Case de </p>' + block('<p>texte</p>', COND_URGENT) + '</td><td><p>Autre</p></td></tr></tbody></table>');
      await run('inItem', '<ul><li><p>Item de </p>' + block('<p>suite</p>', COND_URGENT) + '</li></ul>');
      const pass = Object.values(results).every(r => r.ok)
        && results.first.outline.startsWith('paragraph(conditionalValue("Un")) paragraph("Fin")')
        && results.afterHeading.outline.startsWith('heading("Titre") paragraph(conditionalValue("Un"))')
        && results.afterList.outline.startsWith('bulletList(listItem(paragraph("Item"))) paragraph(conditionalValue("Un"))')
        && results.afterBlock.outline.startsWith('paragraph(conditionalValue("Premier")) conditionalText(paragraph("Second")) paragraph("Fin")')
        && results.inCell.outline.includes('tableCell(paragraph("Case de " conditionalValue("texte")))') && !results.inCell.outline.includes('conditionalText')
        && results.inItem.outline.startsWith('bulletList(listItem(paragraph("Item de " conditionalValue("suite"))))');
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condinline_blocks_that_do_not_fit_in_a_line_are_refused_with_their_reason_and_the_button_is_greyed',
    description: 'Un bloc qui n’est pas UN paragraphe (deux paragraphes, titre, liste, tableau, bloc emboîté) ne se met pas dans la phrase : le bouton de la fenêtre est grisé, son info-bulle dit pourquoi, un clic dessus ne change rien ; la fonction refuse aussi, sans rien changer, et rend la raison',
    run: async (h) => {
      await seed(h);
      const variants = {
        twoParagraphs: '<p>Un</p><p>Deux</p>',
        heading: '<h2>Un</h2>',
        list: '<ul><li><p>Un</p></li></ul>',
        table: '<table><tbody><tr><td><p>Un</p></td></tr></tbody></table>',
        nested: block('<p>Un</p>', COND_URGENT),
      };
      const results = {};
      for (const [key, inner] of Object.entries(variants)) {
        Editor.setHTML('<p>Avant </p>' + block(inner, COND_URGENT) + '<p>Fin</p>');
        await h.sleep(80);
        const html = Editor.getHTML();
        const direct = ConditionalText.toValue(ed(), blockNodes()[0].pos, {});
        const unchanged = Editor.getHTML() === html;
        const modal = await openBlockWindow(h, 0);
        const button = switchButton(modal);
        const state = { disabled: button.disabled, hidden: button.hidden, title: button.title };
        button.click();
        await h.sleep(60);
        const stillOpen = VariableCondition.isOpen();
        cancelWindow(modal);
        await h.sleep(40);
        results[key] = { direct, unchanged, state, stillOpen, unchangedAfterClick: Editor.getHTML() === html };
      }
      const reason = I18n.t('varCond.toValueNotOneParagraph');
      const pass = Object.values(results).every(r => r.direct.ok === false && r.direct.reason === 'varCond.toValueNotOneParagraph' && r.unchanged && r.state.disabled === true && r.state.hidden === false
        && r.state.title === reason && r.stillOpen === true && r.unchangedAfterClick);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condinline_otherwise_of_several_lines_or_over_200_signs_greys_the_button_until_the_field_is_short_enough',
    description: 'Le sinon d’un bloc peut avoir plusieurs lignes et 1000 signes, celui d’une valeur une ligne et 200 : bloc à sinon de deux lignes ou de plus de 200 signes - bouton grisé avec sa raison (le maximum est dit) ; ce que la personne tape dans la fenêtre compte tout de suite : une seule ligne dégrise le bouton, et le clic met le bloc dans la phrase AVEC ce sinon',
    run: async (h) => {
      await seed(h);
      const long = 'x'.repeat(201);
      Editor.setHTML('<p>Avant </p>' + block('<p>Texte</p>', COND_URGENT, 'ligne 1\nligne 2') + '<p>Fin</p>');
      await h.sleep(80);
      const saved = { lines: ConditionalText.inlineObstacle(blockNodes()[0].node, blockNodes()[0].node.attrs) };
      const modal = await openBlockWindow(h, 0);
      const states = { lines: { disabled: switchButton(modal).disabled, title: switchButton(modal).title } };
      setInput(areaOf(modal), long);
      await h.sleep(60);
      states.long = { disabled: switchButton(modal).disabled, title: switchButton(modal).title };
      setInput(areaOf(modal), 'une ligne');
      await h.sleep(60);
      states.short = { disabled: switchButton(modal).disabled, title: switchButton(modal).title };
      switchButton(modal).click();
      await h.sleep(120);
      const after = { outline: tops(), attrs: valueNodes()[0] && attrsOf(valueNodes()[0].node) };
      const pass = saved.lines === 'varCond.toValueOtherwiseLines'
        && states.lines.disabled === true && states.lines.title === I18n.t('varCond.toValueOtherwiseLines')
        && states.long.disabled === true && states.long.title === I18n.t('varCond.toValueOtherwiseLong', { max: 200 }) && states.long.title.includes('200')
        && states.short.disabled === false && states.short.title === I18n.t('varCond.toValueTitle')
        && after.outline === 'paragraph("Avant " conditionalValue("Texte")) | paragraph("Fin")' && after.attrs.otherwise === 'une ligne' && JSON.stringify(after.attrs.condition) === JSON.stringify(COND_URGENT);
      return { pass, notes: JSON.stringify({ saved, states, after }) };
    },
  });

  cases.push({
    id: 'condinline_the_draft_of_the_window_goes_with_the_switch_like_save_does',
    description: 'Le brouillon de la fenêtre (une condition choisie mais pas enregistrée) n’est pas perdu : « Mettre dans la phrase » l’enregistre avec le changement, comme « Enregistrer » ; un bloc sans condition en prend une',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant </p>' + block('<p>Texte</p>') + '<p>Fin</p>');
      await h.sleep(80);
      const modal = await openBlockWindow(h, 0);
      const row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Statut');
      setInput(row.querySelector('.macro-rule-value'), 'Urgent');
      await h.sleep(700);
      switchButton(modal).click();
      await h.sleep(120);
      const asValue = valueNodes()[0] && valueNodes()[0].node.attrs.condition;
      const modal2 = await openValueWindow(h, 0);
      const row2 = modal2.querySelector('.macro-rule-row');
      setInput(row2.querySelector('.macro-rule-value'), 'Normal');
      await h.sleep(700);
      switchButton(modal2).click();
      await h.sleep(120);
      const backAsBlock = blockNodes()[0] && blockNodes()[0].node.attrs.condition;
      const pass = JSON.stringify(asValue) === JSON.stringify(COND_URGENT) && backAsBlock && backAsBlock.rules[0].value === 'Normal' && backAsBlock.rules[0].column === 'Statut' && valueNodes().length === 0;
      return { pass, notes: JSON.stringify({ asValue, backAsBlock }) };
    },
  });

  // === Valeur -> bloc ===
  cases.push({
    id: 'condinline_value_becomes_a_block_the_paragraph_is_split_before_and_after_and_keeps_its_alignment',
    description: '« Mettre sur sa ligne » : la valeur devient un bloc, le paragraphe est coupé avant et après elle (au milieu, au bout, au début, seule), le texte d’avant et d’après garde son paragraphe, le bloc garde l’alignement justifié, la condition et le sinon (une ligne) ; curseur au bout du texte dans le bloc ; un Annuler rend la valeur',
    run: async (h) => {
      await seed(h);
      const results = {};
      const run = async (key, html) => {
        Editor.setHTML(html);
        await h.sleep(650);
        const before = Editor.getHTML();
        const modal = await openValueWindow(h, 0);
        const button = switchButton(modal);
        const opened = { label: button.textContent, title: button.title, disabled: button.disabled, footer: footerLabels(modal) };
        button.click();
        await h.sleep(120);
        const after = { outline: tops(), attrs: blockNodes()[0] && attrsOf(blockNodes()[0].node), caret: caret(), closed: !VariableCondition.isOpen() && !visible(conditionModal()) };
        await h.clickButton('v2-btn-undo');
        await h.sleep(120);
        results[key] = { opened, after, undone: Editor.getHTML() === before };
      };
      await run('middle', `<p${JUSTIFY}>Avant ${val('milieu', COND_URGENT, 'ailleurs')} après.</p>`);
      await run('end', `<p${JUSTIFY}>Avant ${val('fin', COND_URGENT)}</p><p>Fin</p>`);
      await run('start', `<p>${val('début', COND_URGENT)} puis le reste</p>`);
      await run('alone', `<p>${val('seule', COND_URGENT)}</p>`);
      const ok = key => results[key].undone && results[key].after.closed && results[key].after.caret.parent === 'paragraph' && results[key].after.caret.atEnd
        && results[key].opened.label === I18n.t('varCond.toBlock') && results[key].opened.title === I18n.t('varCond.toBlockTitle') && results[key].opened.disabled === false;
      const pass = ['middle', 'end', 'start', 'alone'].every(ok)
        && results.middle.after.outline === 'paragraph[justify]("Avant ") | conditionalText(paragraph[justify]("milieu")) | paragraph[justify](" après.")' && results.middle.after.attrs.otherwise === 'ailleurs'
        && JSON.stringify(results.middle.after.attrs.condition) === JSON.stringify(COND_URGENT)
        && results.end.after.outline === 'paragraph[justify]("Avant ") | conditionalText(paragraph[justify]("fin")) | paragraph("Fin")'
        && results.start.after.outline === 'conditionalText(paragraph("début")) | paragraph(" puis le reste")'
        && results.alone.after.outline === 'conditionalText(paragraph("seule"))'
        && JSON.stringify(results.middle.opened.footer) === JSON.stringify([I18n.t('varCond.remove'), I18n.t('varCond.unwrapValue'), I18n.t('varCond.toBlock'), I18n.t('common.cancel'), I18n.t('common.save')]);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condinline_value_in_a_heading_or_a_code_block_cannot_go_into_a_block_and_the_button_says_why',
    description: 'Une valeur dans un titre ou un bloc de code ne passe pas dans un bloc (le titre serait coupé en trois) : bouton grisé avec sa raison, un clic ne change rien, la fonction refuse et rend la raison',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h2>Titre ${val('conditionnel', COND_URGENT)}</h2><p>Fin</p>`);
      await h.sleep(80);
      const html = Editor.getHTML();
      const direct = ConditionalValue.toBlock(ed(), valueNodes()[0].pos, {});
      const modal = await openValueWindow(h, 0);
      const button = switchButton(modal);
      const state = { disabled: button.disabled, title: button.title };
      button.click();
      await h.sleep(60);
      const result = { direct, state, open: VariableCondition.isOpen(), unchanged: Editor.getHTML() === html };
      cancelWindow(modal);
      const pass = direct.ok === false && direct.reason === 'varCond.toBlockNotInParagraph' && state.disabled === true && state.title === I18n.t('varCond.toBlockNotInParagraph') && result.open && result.unchanged;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'condinline_round_trip_block_value_block_gives_back_the_same_block_with_all_its_settings',
    description: 'Bloc -> phrase -> bloc : le même bloc revient (condition, sinon, mise en forme conditionnelle), à l’espace près que la ligne d’avant n’avait pas (le deuxième aller-retour ne change plus rien) ; sans alignement ni avec le texte justifié',
    run: async (h) => {
      await seed(h);
      const STYLE = { rules: [{ condition: COND_URGENT, style: { color: '#c00000', bold: true } }] };
      const results = {};
      for (const key of ['plain', 'justified']) {
        const open = key === 'justified' ? JUSTIFY : '';
        const original = `<p${open}>Avant </p>` + block(`<p${open}>Texte ${badgeHtml('Titre')}.</p>`, COND_URGENT, 'à confirmer', STYLE) + `<p${open}>Après</p>`;
        Editor.setHTML(original);
        await h.sleep(80);
        const before = Editor.getHTML();
        const toValue = ConditionalText.toValue(ed(), blockNodes()[0].pos, {});
        const middle = { outline: tops(), attrs: valueNodes()[0] && attrsOf(valueNodes()[0].node) };
        const toBlock = ConditionalValue.toBlock(ed(), valueNodes()[0].pos, {});
        const after = Editor.getHTML();
        // L'analyse du HTML a retiré l'espace de « Avant » : le premier aller-retour la pose (le bloc commençait une ligne), le second laisse tout tel quel.
        const second = ConditionalText.toValue(ed(), blockNodes()[0].pos, {}).ok && ConditionalValue.toBlock(ed(), valueNodes()[0].pos, {}).ok;
        results[key] = { toValue, toBlock, middle, spaceOnly: after.replace('Avant </p>', 'Avant</p>') === before, stable: second && Editor.getHTML() === after, after, before };
      }
      const pass = Object.values(results).every(r => r.toValue.ok && r.toBlock.ok && r.spaceOnly && r.stable && JSON.stringify(r.middle.attrs.condStyle) === JSON.stringify(STYLE) && r.middle.attrs.otherwise === 'à confirmer' && !!r.middle.attrs.condition);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condinline_window_lost_node_is_said_and_nothing_changes',
    description: 'Le bloc ou la valeur déplacé ou supprimé pendant que la fenêtre était ouverte : la fonction refuse (raison « perdu »), la fenêtre le dit et reste ouverte, rien n’est changé',
    run: async (h) => {
      await seed(h);
      const alerts = [];
      const realAlert = window.alert;
      window.alert = message => { alerts.push(message); };
      try {
        Editor.setHTML('<p>Avant </p>' + block('<p>Texte</p>', COND_URGENT) + '<p>Fin</p>');
        await h.sleep(80);
        const refusals = [ConditionalText.toValue(ed(), 0, {}), ConditionalText.toValue(ed(), ed().state.doc.content.size, {}), ConditionalValue.toBlock(ed(), 0, {}), ConditionalValue.toBlock(ed(), 9999, {})];
        const modal = await openBlockWindow(h, 0);
        ed().commands.deleteRange({ from: blockNodes()[0].pos, to: blockNodes()[0].pos + blockNodes()[0].node.nodeSize });
        await h.sleep(60);
        const html = Editor.getHTML();
        switchButton(modal).click();
        await h.sleep(60);
        const state = { alerts: alerts.slice(), open: VariableCondition.isOpen(), unchanged: Editor.getHTML() === html };
        cancelWindow(modal);
        const pass = refusals.every(r => r.ok === false) && refusals[0].reason === 'varCond.toValueLostBlock' && refusals[2].reason === 'varCond.toBlockLostValue'
          && state.alerts.length === 1 && state.alerts[0] === I18n.t('varCond.toValueLostBlock') && state.open && state.unchanged;
        return { pass, notes: JSON.stringify({ refusals, state }) };
      } finally { window.alert = realAlert; }
    },
  });

  // === Lecture et exports ===
  cases.push({
    id: 'condinline_reader_and_exports_read_one_justified_paragraph_where_the_block_made_two',
    description: 'Ce que reçoivent la Lecture, le PDF, le Word, l’ODT, le HTML et l’e-mail (le même HTML résolu, ReaderMode.preview) : avec le bloc, deux paragraphes - la ligne d’avant est la dernière du sien - ; une fois mis dans la phrase, UN paragraphe justifié qui porte la phrase d’un bout à l’autre. Condition non remplie : le texte d’avant seul, ou le sinon au même endroit',
    run: async (h) => {
      await seed(h);
      const original = `<p${JUSTIFY}>${FIRST_LINE}</p>` + block(`<p>${SENTENCE}${badgeHtml('Titre')} mois.</p>`, COND_URGENT, 'à confirmer') + '<p>Fin</p>';
      Editor.setHTML(original);
      await h.sleep(80);
      const blockForm = await previewBox(Editor.getHTML());
      const blockShape = shape(blockForm);
      ConditionalText.toValue(ed(), blockNodes()[0].pos, {});
      await h.sleep(80);
      const html = Editor.getHTML();
      const met = await previewBox(html);
      await setRecord(h, RECORD_2);
      const notMet = await previewBox(html);
      const html2 = html.replace(/ data-otherwise="[^"]*"/, '');
      const notMetBare = await previewBox(html2);
      await setRecord(h, RECORD_1);
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), NO_HF);
      const readerShape = shape(reader.querySelector('.reader-content'));
      reader.style.display = 'none';
      const firstParagraph = met.querySelector('p');
      const pass = blockShape === `p:${FIRST_LINE.trim()} | p:${SENTENCE}Dossier A mois. | p:Fin`
        && shape(met) === `p:${FIRST_LINE}${SENTENCE}Dossier A mois. | p:Fin`.replace(/\s+/g, ' ')
        && /text-align:\s*justify/.test(firstParagraph.getAttribute('style') || '') && met.querySelectorAll('.conditional-value, .conditional-text').length === 0
        && shape(notMet) === `p:${FIRST_LINE}à confirmer | p:Fin` && shape(notMetBare) === `p:${FIRST_LINE.trim()} | p:Fin`
        && readerShape === shape(met);
      return { pass, notes: JSON.stringify({ blockShape, met: shape(met), notMet: shape(notMet), notMetBare: shape(notMetBare), readerShape, style: firstParagraph.getAttribute('style') }) };
    },
  });

  // === Suivi des modifications ===
  cases.push({
    id: 'condinline_suggest_mode_both_ways_are_tracked_accepting_gives_the_result_and_refusing_the_original',
    description: 'En mode suivi, mettre dans la phrase et mettre sur sa ligne se suivent : « Tout accepter » rend le document transformé sans reste du bloc ou de la valeur, « Tout refuser » rend l’original',
    run: async (h) => {
      await seed(h);
      const ed0 = ed();
      const cases2 = {
        toValue: { original: `<p>Avant </p>` + block('<p>Texte</p>', COND_URGENT) + '<p>Fin</p>', run: () => ConditionalText.toValue(ed0, blockNodes()[0].pos, {}), expected: 'paragraph("Avant " conditionalValue("Texte")) | paragraph("Fin")' },
        toBlock: { original: `<p>Avant ${val('Texte', COND_URGENT)} fin</p>`, run: () => ConditionalValue.toBlock(ed0, valueNodes()[0].pos, {}), expected: 'paragraph("Avant ") | conditionalText(paragraph("Texte")) | paragraph(" fin")' },
      };
      const results = {};
      let suggest = false;
      try {
        for (const [key, one] of Object.entries(cases2)) {
          for (const verdict of ['accept', 'reject']) {
            ed0.commands.loadTrackedDocument(one.original);
            if (!suggest) { ed0.commands.toggleSuggestMode(); suggest = true; }
            await h.sleep(80);
            const before = Editor.getHTML();
            const done = one.run();
            await h.sleep(80);
            const tracked = Editor.getHTML();
            if (verdict === 'accept') ed0.commands.acceptAllSuggestionsChunked(); else ed0.commands.rejectAllSuggestionsChunked();
            await h.sleep(150);
            results[key + '_' + verdict] = { ok: done.ok, suggested: /<ins|<del/.test(tracked), outline: tops(), html: Editor.getHTML(), original: before };
          }
        }
      } finally { if (suggest) ed0.commands.toggleSuggestMode(); }
      const pass = ['toValue', 'toBlock'].every(key => results[key + '_accept'].ok && results[key + '_accept'].suggested && results[key + '_accept'].outline === cases2[key].expected
        && results[key + '_reject'].ok && results[key + '_reject'].html === results[key + '_reject'].original);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  // === Les autres fenêtres, les phrases ===
  cases.push({
    id: 'condinline_other_windows_do_not_get_the_button_and_their_footers_do_not_move',
    description: 'La fenêtre d’une bulle de variable n’a pas le bouton (caché, ses boutons ne bougent pas) ; celle d’un bloc sans condition l’a, grisée seulement par une raison',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Dossier ${badgeHtml('Titre', COND_URGENT)}</p>` + block('<p>Un</p>') + '<p>Fin</p>');
      await h.sleep(80);
      let selected = false;
      ed().state.doc.descendants((node, pos) => {
        if (selected || node.type.name !== 'varBadge') return;
        ed().commands.setNodeSelection(pos);
        selected = true;
      });
      ed().view.focus();
      await h.sleep(120);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      let modal = conditionModal();
      const forBadge = { footer: footerLabels(modal), hidden: switchButton(modal).hidden };
      cancelWindow(modal);
      await h.sleep(40);
      modal = await openBlockWindow(h, 0);
      const forBlock = { footer: footerLabels(modal), disabled: switchButton(modal).disabled };
      cancelWindow(modal);
      const pass = JSON.stringify(forBadge.footer) === JSON.stringify([I18n.t('varCond.remove'), I18n.t('common.cancel'), I18n.t('common.save')]) && forBadge.hidden === true
        && JSON.stringify(forBlock.footer) === JSON.stringify([I18n.t('varCond.unwrapBlock'), I18n.t('varCond.toValue'), I18n.t('common.cancel'), I18n.t('common.save')]) && forBlock.disabled === false;
      return { pass, notes: JSON.stringify({ forBadge, forBlock }) };
    },
  });

  const KEYS = ['varCond.toValue', 'varCond.toValueTitle', 'varCond.toValueNotOneParagraph', 'varCond.toValueOtherwiseLines', 'varCond.toValueOtherwiseLong', 'varCond.toValueLostBlock',
    'varCond.toBlock', 'varCond.toBlockTitle', 'varCond.toBlockNotInParagraph', 'varCond.toBlockLostValue'];
  const textsCase = {
    id: 'condinline_french_interface_texts_and_keys',
    description: 'Interface en français : le bouton d’un bloc (« Mettre dans la phrase ») et celui d’une valeur (« Mettre sur sa ligne ») avec leur info-bulle, les raisons - sans clé manquante ; la même chose en anglais dans la page qui démarre en anglais',
    run: async (h) => {
      await seed(h);
      const en = I18n.getLang() === 'en';
      const want = en ? { toValue: 'Put in the sentence', toBlock: 'Put on its own line', title: /^The block’s text continues the line before it/ } : { toValue: 'Mettre dans la phrase', toBlock: 'Mettre sur sa ligne', title: /^Le texte du bloc continue la ligne qui le précède/ };
      Editor.setHTML('<p>Avant </p>' + block('<p>Texte</p>', COND_URGENT) + `<p>Autre ${val('valeur', COND_URGENT)}</p>`);
      await h.sleep(80);
      const modal = await openBlockWindow(h, 0);
      const forBlock = { text: switchButton(modal).textContent, title: switchButton(modal).title };
      cancelWindow(modal);
      await h.sleep(40);
      const modal2 = await openValueWindow(h, 0);
      const forValue = { text: switchButton(modal2).textContent };
      cancelWindow(modal2);
      const missing = KEYS.filter(k => I18n.t(k) === k || !I18n.t(k, { max: 200 }));
      const pass = forBlock.text === want.toValue && want.title.test(forBlock.title) && forValue.text === want.toBlock && missing.length === 0 && I18n.t('varCond.toValueOtherwiseLong', { max: 200 }).includes('200');
      return { pass, notes: JSON.stringify({ forBlock, forValue, missing }) };
    },
  };
  cases.push(textsCase, Object.assign({}, textsCase, {
    id: 'condinline_english_interface_texts_and_keys',
    lang: 'en',
    description: 'Page qui démarre en anglais : le bouton d’un bloc (« Put in the sentence ») et celui d’une valeur (« Put on its own line ») avec leur info-bulle, les raisons - sans clé manquante',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condInline = cases;
})();
