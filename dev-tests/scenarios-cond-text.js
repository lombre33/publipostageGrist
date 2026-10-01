// Suite "condText" - bloc de texte conditionnel (demande d'Antoine du 2026-10-01 : « un bloc de texte conditionnel » dans le menu des variables, onglet Chips, délimité
// sobrement dans la direction artistique des bulles, avec la barre flottante des variables pour atteindre le même menu de condition, des variables - conditionnelles
// comprises - dans son texte, et des blocs emboîtés). Nœud conditionalText (js/editor-nodes.js), entrée du panneau et pose du bloc (js/variables.js, js/conditional-text.js),
// barre flottante (js/floating-toolbars.js), fenêtre de condition partagée avec les bulles (js/variable-condition.js), résolution à la Lecture et aux exports
// (js/reader-mode.js -> ConditionalText.resolve). Jeu de données de la suite varCondition, sous d'autres noms de tables.
(function () {
  const cases = [];

  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TABLE = 'CtDossiers';

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  function block(inner, condition) { return `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}>${inner}</div>`; }
  function badgeHtml(column, condition) {
    return `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('CtAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CtAnnuaire', Montant: 'Numeric' });
    stub.setVariables('CtLignes', { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows('CtAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }, { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88' }]);
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
    ]);
    stub.setRows('CtLignes', [
      { id: 1, Dossier: 1, Designation: 'Audit', Qte: 1 },
      { id: 2, Dossier: 1, Designation: 'Livret', Qte: 12 },
      { id: 3, Dossier: 1, Designation: 'Déplacement', Qte: 1 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('CtAnnuaire');
    await GristAPI.deleteLinkRule('CtLignes');
    await GristAPI.saveLinkRule('CtLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
  }

  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  // Ce que la Lecture écrit pour ce HTML : le conteneur .reader-content, une fois résolu.
  async function renderReader(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), hf || NO_HF);
    return reader.querySelector('.reader-content');
  }
  // Ce que reçoivent le PDF, le Word et l'e-mail : ReaderMode.preview, le même HTML résolu que la Lecture.
  async function previewHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  // La forme d'un conteneur, lisible d'un coup d'œil : « p:Avant | ul | p:Après » (texte des paragraphes, tag des autres blocs).
  function shape(root) {
    return Array.from(root.children).filter(c => c.tagName !== 'STYLE').map(c => (c.tagName === 'P' ? 'p:' + c.textContent.trim() : c.tagName.toLowerCase())).join(' | ');
  }

  function ed() { return EditorCore.getEditor(); }
  function blockNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'conditionalText') out.push({ node, pos }); });
    return out;
  }
  function tags() { return Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')); }
  function panelBox() { return document.getElementById('autocomplete-box'); }
  function panelOpen() { const b = panelBox(); return !!b && b.style.display !== 'none'; }
  function panelItems() { return panelOpen() ? Array.from(panelBox().querySelectorAll('.ac-item')).map(i => i.textContent) : []; }
  function panelSelected() { const i = panelBox() && panelBox().querySelector('.ac-item.selected'); return i ? i.textContent : null; }
  function activeTab() { const t = panelBox() && panelBox().querySelector('.ac-tab.active'); return t ? t.dataset.tab : null; }
  async function openChipsTab(h) {
    document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await h.sleep(30);
  }
  async function pickEntry(h) {
    // Une liste fermée garde ses lignes dans le DOM : sans cette garde, un « # » que le panneau n'a pas reconnu se choisirait quand même, sur la plage de la fois d'avant.
    if (!panelOpen()) return false;
    const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(i => i.textContent === I18n.t('chips.conditionalText'));
    if (!item) return false;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(80);
    return true;
  }
  // Frappe du « # » au curseur - derrière une espace quand `afterSpace` (un « # » collé à un mot n'ouvre pas la liste) -, puis choix de l'entrée dans l'onglet Chips.
  async function insertViaPanel(h, afterSpace) {
    if (afterSpace) ed().commands.insertContent({ type: 'text', text: ' ' });
    await h.typeText('#');
    await h.sleep(60);
    await openChipsTab(h);
    return pickEntry(h);
  }
  // Place le curseur dans le paragraphe qui contient `needle`, à `offset` caractères de son début.
  function cursorIn(needle, offset) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (!found && node.isTextblock && node.textContent.indexOf(needle) !== -1) found = pos + 1 + (offset == null ? node.content.size : offset); });
    if (found == null) return false;
    ed().commands.setTextSelection(found);
    ed().view.focus();
    return true;
  }
  function selectText(needle) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(needle);
      if (i !== -1) found = { from: pos + i, to: pos + i + needle.length };
    });
    if (!found) return false;
    ed().commands.setTextSelection(found);
    ed().view.focus();
    return true;
  }
  function pressKey(key) {
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function toolbarButton(action) { return toolbar().querySelector(`button[data-action="${action}"]`); }
  function pressToolbarButton(action) { toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  function conditionModal() { return document.getElementById('var-condition-modal'); }
  function setSelect(select, value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  // Un clic sur l'étiquette, comme une personne : mousedown sur l'étiquette du n-ième bloc.
  async function clickTag(h, index) {
    document.querySelector('.tiptap').focus();
    const tag = tags()[index || 0];
    if (!tag) return null;
    tag.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(120);
    return tag;
  }
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
  async function saveCondition(h, column, value) {
    const modal = conditionModal();
    const row = modal.querySelector('.macro-rule-row');
    await pickColumn(h, row, column);
    setInput(row.querySelector('.macro-rule-value'), value);
    await h.sleep(700);
    const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
    modal.querySelector('.var-modal-actions .var-modal-primary').click();
    await h.sleep(80);
    return debug;
  }

  // === Éditeur : entrée du panneau, pose du bloc ===
  cases.push({
    id: 'condtext_chips_tab_lists_the_block_entry_in_both_languages',
    description: 'L’onglet Chips du panneau « # » propose « Texte conditionnel » (« Conditional text » en anglais), après les quatre chips existants',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      await h.typeText('#');
      await h.sleep(60);
      await openChipsTab(h);
      const fr = panelItems();
      const lang = I18n.getLang();
      let en = null;
      try {
        I18n.setLang('en');
        en = panelItems();
        // Le panneau est reconstruit à chaque rendu : la liste anglaise se lit après un nouvel onglet.
        await openChipsTab(h);
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'variables') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
        await h.sleep(30);
        await openChipsTab(h);
        en = panelItems();
      } finally { I18n.setLang(lang); }
      const pass = fr.length === 5 && fr[4] === 'Texte conditionnel' && fr.slice(0, 4).join('|') === 'Note de bas de page|Date du jour|Heure actuelle|Email de l’utilisateur'
        && en.length === 5 && en[4] === 'Conditional text';
      return { pass, notes: JSON.stringify({ fr, en }) };
    },
  });

  cases.push({
    id: 'condtext_empty_block_replaces_the_hash_and_the_cursor_goes_inside',
    description: 'Sans sélection, « Texte conditionnel » pose un bloc vide à la place de « # », le curseur dans son premier paragraphe : la frappe suivante est dans le bloc',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      const picked = await insertViaPanel(h);
      const htmlAfterPick = Editor.getHTML();
      const sel = ed().state.selection;
      const insideBlock = sel.empty && sel.$from.node(sel.$from.depth - 1).type.name === 'conditionalText' && sel.$from.parent.type.name === 'paragraph';
      await h.typeText('Texte du bloc');
      const html = Editor.getHTML();
      const pass = picked && htmlAfterPick === block('<p></p>') + '<p></p>' && insideBlock && html === block('<p>Texte du bloc</p>') + '<p></p>' && !panelOpen();
      return { pass, notes: JSON.stringify({ picked, htmlAfterPick, insideBlock, html }) };
    },
  });

  cases.push({
    id: 'condtext_empty_block_in_the_middle_of_a_paragraph_splits_it',
    description: 'Le bloc posé dans un paragraphe qui a du texte avant et après « # » le coupe en deux et se place entre les deux moitiés ; en fin ou en début de paragraphe, il se place après ou avant',
    run: async (h) => {
      const results = {};
      for (const where of ['middle', 'end', 'start']) {
        await seed(h);
        Editor.setHTML('<p>Bonjour monsieur</p>');
        await h.sleep(40);
        cursorIn('Bonjour', where === 'middle' ? 'Bonjour '.length : where === 'end' ? undefined : 0);
        const picked = await insertViaPanel(h, where === 'end');
        results[where] = { picked, html: Editor.getHTML() };
      }
      // La requête « # » (et l'espace tapée devant) disparaît ; l'espace, elle, reste dans le texte qu'elle sépare.
      const pass = results.middle.picked && results.middle.html === '<p>Bonjour </p>' + block('<p></p>') + '<p>monsieur</p>'
        && results.end.picked && results.end.html === '<p>Bonjour monsieur </p>' + block('<p></p>') + '<p></p>'
        && results.start.picked && results.start.html === block('<p></p>') + '<p>Bonjour monsieur</p>';
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condtext_empty_block_goes_in_a_table_cell_a_list_item_and_a_column',
    description: 'Le bloc se pose aussi dans une case de tableau, derrière le premier paragraphe d’un élément de liste, et dans une colonne de zone 2 colonnes',
    run: async (h) => {
      const results = {};
      await seed(h);
      Editor.setHTML('<table><tbody><tr><td><p></p></td><td><p>x</p></td></tr></tbody></table>');
      await h.sleep(40);
      ed().commands.setTextSelection(4);
      ed().view.focus();
      results.cellPicked = await insertViaPanel(h);
      results.cell = Editor.getHTML().replace(/<table[^>]*>.*<\/table>/, m => (m.indexOf('<td colspan="1" rowspan="1"><div class="conditional-text"><p></p></div></td>') !== -1 ? 'CELL_OK' : m));
      await seed(h);
      Editor.setHTML('<ul><li><p>un</p></li><li><p>deux</p></li></ul>');
      await h.sleep(40);
      cursorIn('un');
      results.itemPicked = await insertViaPanel(h, true);
      results.item = Editor.getHTML();
      await seed(h);
      Editor.setHTML('<div class="two-columns-zone"><div class="two-columns-column"><p></p></div><div class="two-columns-column"><p>b</p></div></div>');
      await h.sleep(40);
      ed().commands.setTextSelection(3);
      ed().view.focus();
      results.columnPicked = await insertViaPanel(h);
      results.column = Editor.getHTML().indexOf('<div class="two-columns-column">' + block('<p></p>') + '</div>') !== -1;
      const pass = results.cellPicked && results.cell.indexOf('CELL_OK') !== -1
        && results.itemPicked && results.item === '<ul><li><p>un </p>' + block('<p></p>') + '</li><li><p>deux</p></li></ul><p></p>'
        && results.columnPicked && results.column;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condtext_block_nests_inside_a_block_at_any_depth',
    description: 'Dans un bloc, « Texte conditionnel » pose un second bloc, puis un troisième : le HTML garde l’emboîtement et chaque bloc sa propre condition',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      await insertViaPanel(h);
      await h.typeText('Dehors ');
      const second = await insertViaPanel(h);
      await h.typeText('Dedans ');
      const third = await insertViaPanel(h);
      await h.typeText('Tout dedans');
      const html = Editor.getHTML();
      const nodes = blockNodes();
      const depths = nodes.map(n => ed().state.doc.resolve(n.pos).depth);
      const domNested = !!document.querySelector('.tiptap .conditional-text .conditional-text .conditional-text');
      const pass = second && third && nodes.length === 3 && domNested && depths.join(',') === '0,1,2' && html.split('class="conditional-text"').length === 4
        && html.indexOf('Tout dedans') > html.indexOf('Dedans') && html.indexOf('Dedans') > html.indexOf('Dehors');
      return { pass, notes: JSON.stringify({ second, third, depths, domNested, html }) };
    },
  });

  // === Éditeur : entourer un texte sélectionné ===
  cases.push({
    id: 'condtext_selection_is_wrapped_via_the_variable_button_not_replaced_by_the_hash',
    description: 'Le bouton « Insérer une variable » avec du texte sélectionné ne le remplace plus par « # » : la liste s’ouvre sur Chips, « Texte conditionnel » surligné, Entrée entoure le paragraphe et la sélection reste',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Alpha</p><p>Beta gamma</p><p>Delta</p>');
      await h.sleep(40);
      selectText('gamma');
      await h.sleep(60);
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(120);
      const afterClick = Editor.getHTML();
      const opened = { open: panelOpen(), tab: activeTab(), selected: panelSelected() };
      pressKey('Enter');
      await h.sleep(100);
      const html = Editor.getHTML();
      const sel = ed().state.selection;
      const pass = afterClick === '<p>Alpha</p><p>#Beta gamma</p><p>Delta</p>' && opened.open && opened.tab === 'chips' && opened.selected === 'Texte conditionnel'
        && html === '<p>Alpha</p>' + block('<p>Beta gamma</p>') + '<p>Delta</p>' && ed().state.doc.textBetween(sel.from, sel.to) === 'gamma' && !panelOpen();
      return { pass, notes: JSON.stringify({ afterClick, opened, html, selected: ed().state.doc.textBetween(sel.from, sel.to) }) };
    },
  });

  cases.push({
    id: 'condtext_selection_over_two_paragraphs_wraps_both_and_a_list_item_wraps_its_list',
    description: 'Une sélection sur deux paragraphes entoure les deux ; dans un élément de liste, où un bloc ne peut pas être le premier enfant, c’est la liste entière qui est entourée ; dans une case, le paragraphe de la case',
    run: async (h) => {
      const results = {};
      await seed(h);
      Editor.setHTML('<p>Alpha</p><p>Beta</p><p>Gamma</p><p>Delta</p>');
      await h.sleep(40);
      ed().commands.setTextSelection({ from: 3, to: 12 });
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      pressKey('Enter');
      await h.sleep(100);
      results.two = Editor.getHTML();
      await seed(h);
      Editor.setHTML('<p>Avant</p><ul><li><p>un</p></li><li><p>deux</p></li></ul><p>Après</p>');
      await h.sleep(40);
      selectText('deux');
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      pressKey('Enter');
      await h.sleep(100);
      results.list = Editor.getHTML();
      await seed(h);
      Editor.setHTML('<table><tbody><tr><td><p>cellule</p></td><td><p>x</p></td></tr></tbody></table>');
      await h.sleep(40);
      selectText('cellule');
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      pressKey('Enter');
      await h.sleep(100);
      results.cellOk = Editor.getHTML().indexOf('<td colspan="1" rowspan="1">' + block('<p>cellule</p>') + '</td>') !== -1;
      const pass = results.two === block('<p>Alpha</p><p>Beta</p>') + '<p>Gamma</p><p>Delta</p>'
        && results.list === '<p>Avant</p>' + block('<ul><li><p>un</p></li><li><p>deux</p></li></ul>') + '<p>Après</p>' && results.cellOk;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condtext_closing_the_list_without_choosing_leaves_no_pending_wrap',
    description: 'Échap sur la liste ouverte par le bouton laisse « # » (comme un « # » tapé) et n’entoure rien ; la liste suivante, ouverte sans sélection, pose un bloc vide et n’entoure pas l’ancien texte',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Alpha</p><p>Beta gamma</p>');
      await h.sleep(40);
      selectText('gamma');
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      pressKey('Escape');
      await h.sleep(60);
      const afterEscape = Editor.getHTML();
      const stillOpen = panelOpen();
      // « # » effacé, puis une liste ouverte sans sélection, à la fin du document.
      Editor.setHTML('<p>Alpha</p><p>Beta gamma</p><p></p>');
      await h.sleep(40);
      ed().commands.setTextSelection(ed().state.doc.content.size - 1);
      ed().view.focus();
      const picked = await insertViaPanel(h);
      const html = Editor.getHTML();
      const pass = afterEscape === '<p>Alpha</p><p>#Beta gamma</p>' && !stillOpen && picked && html === '<p>Alpha</p><p>Beta gamma</p>' + block('<p></p>') + '<p></p>';
      return { pass, notes: JSON.stringify({ afterEscape, stillOpen, picked, html }) };
    },
  });

  cases.push({
    id: 'condtext_variable_button_without_selection_keeps_its_old_behaviour',
    description: 'Sans texte sélectionné (ou avec une bulle sélectionnée), le bouton « Insérer une variable » garde son comportement : il insère « # » et ouvre la liste sur l’onglet Variables',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Alpha</p>');
      await h.sleep(40);
      cursorIn('Alpha');
      ed().commands.insertContent({ type: 'text', text: ' ' });
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      const html = Editor.getHTML();
      const pass = html === '<p>Alpha #</p>' && panelOpen() && activeTab() === 'variables';
      return { pass, notes: JSON.stringify({ html, open: panelOpen(), tab: activeTab() }) };
    },
  });

  cases.push({
    id: 'condtext_html_round_trip_keeps_conditions_nesting_and_variables',
    description: 'Le HTML d’un bloc (data-condition, blocs emboîtés, bulle conditionnelle dedans) survit à un aller-retour dans l’éditeur ; sans condition, aucun attribut',
    run: async (h) => {
      await seed(h);
      const source = '<p>Avant</p>'
        + block('<p>Dossier ' + badgeHtml('Titre') + ' ' + badgeHtml('Montant', COND_NORMAL) + '</p>'
          + block('<p>Intérieur</p>', COND_NORMAL), COND_URGENT)
        + block('<p>Libre</p>') + '<p>Après</p>';
      Editor.setHTML(source);
      await h.sleep(60);
      const nodes = blockNodes();
      const html = Editor.getHTML();
      const again = (() => { Editor.setHTML(html); return Editor.getHTML(); })();
      const conditions = nodes.map(n => n.node.attrs.condition);
      // Trois conditions dans le HTML : les deux blocs conditionnés et la bulle ; le bloc « Libre » n'en porte aucune.
      const count = html.split('data-condition').length - 1;
      const pass = nodes.length === 3 && JSON.stringify(conditions[0]) === JSON.stringify(COND_URGENT) && JSON.stringify(conditions[1]) === JSON.stringify(COND_NORMAL) && conditions[2] === null
        && html.indexOf('<div class="conditional-text">') !== -1 && count === 3 && again === html;
      return { pass, notes: JSON.stringify({ conditions, count, same: again === html, html }) };
    },
  });

  // === Étiquette et barre flottante d'un bloc ===
  function badgePos(column) {
    let found = -1;
    ed().state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === 'varBadge' && node.attrs.column === column) found = pos; });
    return found;
  }
  async function selectBadge(h, column) {
    document.querySelector('.tiptap').focus();
    ed().commands.setNodeSelection(badgePos(column));
    await h.sleep(120);
  }
  function barButton(action) {
    const b = toolbar().querySelector(`button[data-action="${action}"]`);
    return b ? { disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), active: b.classList.contains('is-active'), title: b.title } : null;
  }
  function barState() {
    const bar = toolbar();
    return {
      visible: visible(bar), condition: barButton('var-condition'), linked: barButton('var-linked'), loop: barButton('var-loop'),
      numberHidden: bar.querySelector('[data-var-panel="number"]').hidden, dateHidden: bar.querySelector('[data-var-panel="date"]').hidden, sepHidden: bar.querySelector('[data-var-sep]').hidden,
    };
  }
  const isBlockSelected = () => { const n = ed().state.selection.node; return !!n && n.type.name === 'conditionalText'; };

  cases.push({
    id: 'condtext_tag_shows_the_condition_and_a_click_selects_the_block',
    description: 'L’étiquette du bloc dit sa condition (« Si Statut = Urgent », « Texte conditionnel · sans condition » sans condition), a une info-bulle ; un clic dessus sélectionne le bloc entier, sans déplacer le texte',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Premier</p>', COND_URGENT) + block('<p>Second</p>') + '<p>Après</p>');
      await h.sleep(80);
      const [first, second] = tags();
      const labels = { first: first.textContent, second: second.textContent };
      const titles = { first: first.title, second: second.title };
      const classes = { first: first.closest('.conditional-text').classList.contains('has-condition'), second: second.closest('.conditional-text').classList.contains('has-condition') };
      const htmlBefore = Editor.getHTML();
      await clickTag(h, 1);
      const secondSelected = isBlockSelected() && ed().state.selection.node.textContent === 'Second';
      await clickTag(h, 0);
      const firstSelected = isBlockSelected() && ed().state.selection.node.textContent === 'Premier';
      const pass = labels.first === 'Si Statut = Urgent' && labels.second === I18n.t('condText.tag.none') && labels.second === 'Texte conditionnel · sans condition'
        && titles.first === I18n.t('condText.tag.titleIf', { condition: 'Statut = Urgent' }) && titles.second === I18n.t('condText.tag.titleNone')
        && classes.first && !classes.second && secondSelected && firstSelected && Editor.getHTML() === htmlBefore
        && first.getAttribute('contenteditable') === 'false' && first.getAttribute('role') === 'button';
      return { pass, notes: JSON.stringify({ labels, titles, classes, secondSelected, firstSelected }) };
    },
  });

  cases.push({
    id: 'condtext_block_selected_opens_the_variable_toolbar_with_two_buttons_greyed',
    description: 'Bloc sélectionné : la barre des variables s’ouvre au-dessus de son étiquette, condition active (bleue) si posée, « Autres attributs » et « Boucle » grisés - pas retirés - avec leur raison en info-bulle, sans réglage nombre/date',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Texte du bloc</p>', COND_URGENT) + block('<p>Libre</p>') + '<p>Après</p>');
      await h.sleep(80);
      const hiddenBefore = !visible(toolbar());
      const tag = await clickTag(h, 0);
      const withCondition = barState();
      const tagRect = tag.getBoundingClientRect();
      const barRect = toolbar().getBoundingClientRect();
      // Posée au-dessus de l'étiquette, centrée dessus (pas au milieu de la largeur du bloc).
      const anchored = Math.abs((barRect.left + barRect.width / 2) - (tagRect.left + tagRect.width / 2)) <= 12 && barRect.bottom <= tagRect.top + 2;
      const selectedFirst = isBlockSelected();
      await clickTag(h, 1);
      const withoutCondition = barState();
      const grey = s => s.linked.disabled && s.linked.aria === 'true' && !s.linked.active && s.loop.disabled && s.loop.aria === 'true' && !s.loop.active
        && s.linked.title === I18n.t('varToolbar.linkedBlock') && s.loop.title === I18n.t('varToolbar.loopBlock') && s.numberHidden && s.dateHidden && s.sepHidden;
      const pass = hiddenBefore && selectedFirst && withCondition.visible && withCondition.condition.active && !withCondition.condition.disabled && withCondition.condition.title === I18n.t('varToolbar.condition')
        && grey(withCondition) && withoutCondition.visible && !withoutCondition.condition.active && grey(withoutCondition) && anchored
        && !!toolbar().querySelector('button[data-action="var-linked"]') && !!toolbar().querySelector('button[data-action="var-loop"]');
      return { pass, notes: JSON.stringify({ hiddenBefore, withCondition, withoutCondition, anchored, bar: barRect.toJSON(), tag: tagRect.toJSON() }) };
    },
  });

  cases.push({
    id: 'condtext_greyed_toolbar_buttons_open_nothing_on_a_block',
    description: 'Un clic sur « Autres attributs » ou « Boucle » grisés d’un bloc n’ouvre aucune fenêtre, ne change ni le bloc ni la sélection, et la barre reste là',
    run: async (h) => {
      await seed(h);
      const source = '<p>Avant</p>' + block('<p>Texte</p>') + '<p>Après</p>';
      Editor.setHTML(source);
      await h.sleep(80);
      await clickTag(h, 0);
      pressToolbarButton('var-linked');
      await h.sleep(60);
      pressToolbarButton('var-loop');
      await h.sleep(60);
      const open = { linked: VariableLinkedAttrs.isOpen(), loop: VariableLoop.isOpen(), condition: VariableCondition.isOpen() };
      const pass = !open.linked && !open.loop && !open.condition && isBlockSelected() && visible(toolbar()) && Editor.getHTML() === source;
      return { pass, notes: JSON.stringify({ open, selected: isBlockSelected(), html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'condtext_toolbar_goes_back_to_normal_for_a_variable_after_a_block',
    description: 'La barre revient à la normale sur une bulle après un bloc (Autres attributs et titre habituel, réglage nombre pour une colonne nombre) et se grise à nouveau en revenant au bloc : aucun état d’un bloc ne reste sur une bulle',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Responsable') + ' ' + badgeHtml('Montant') + '</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      await clickTag(h, 0);
      const onBlock = barState();
      await selectBadge(h, 'Responsable');
      const onRef = barState();
      await selectBadge(h, 'Montant');
      const onNumber = barState();
      await clickTag(h, 0);
      const backOnBlock = barState();
      const pass = onBlock.linked.disabled && onBlock.linked.title === I18n.t('varToolbar.linkedBlock') && onBlock.numberHidden
        && onRef.visible && !onRef.linked.disabled && onRef.linked.aria === 'false' && onRef.linked.title === I18n.t('varToolbar.linked') && onRef.loop.title !== I18n.t('varToolbar.loopBlock')
        && onNumber.visible && !onNumber.numberHidden && onNumber.dateHidden && !onNumber.sepHidden && onNumber.linked.title !== I18n.t('varToolbar.linkedBlock')
        && backOnBlock.visible && backOnBlock.linked.disabled && backOnBlock.loop.disabled && backOnBlock.numberHidden && backOnBlock.sepHidden && backOnBlock.loop.title === I18n.t('varToolbar.loopBlock');
      return { pass, notes: JSON.stringify({ onBlock, onRef, onNumber, backOnBlock }) };
    },
  });

  cases.push({
    id: 'condtext_toolbar_closes_when_the_selection_leaves_the_block_or_a_window_opens',
    description: 'La barre se ferme quand la sélection quitte le bloc et pendant que la fenêtre de condition est ouverte (comme pour une bulle)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      await clickTag(h, 0);
      const opened = visible(toolbar());
      ed().commands.setTextSelection(3);
      await h.sleep(80);
      const closedAfterLeaving = !visible(toolbar());
      await clickTag(h, 0);
      const reopened = visible(toolbar());
      pressToolbarButton('var-condition');
      await h.sleep(80);
      const windowOpen = !!conditionModal() && VariableCondition.isOpen();
      const hiddenUnderWindow = !visible(toolbar());
      conditionModal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(60);
      const pass = opened && closedAfterLeaving && reopened && windowOpen && hiddenUnderWindow && !VariableCondition.isOpen();
      return { pass, notes: JSON.stringify({ opened, closedAfterLeaving, reopened, windowOpen, hiddenUnderWindow }) };
    },
  });

  // === Fenêtre de condition d'un bloc ===
  function windowRulesOf(modal) {
    return Array.from(modal.querySelectorAll('.macro-rule-row')).map(row => ({
      column: row.querySelector('select.macro-rule-column').value,
      operator: row.querySelector(':scope > select').value,
      value: row.querySelector('.macro-rule-value').value,
    }));
  }
  function cancelWindow(modal) { modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click(); }
  async function openBlockWindow(h, index) {
    await clickTag(h, index || 0);
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }

  cases.push({
    id: 'condtext_condition_window_on_a_block_saves_edits_and_removes',
    description: 'La fenêtre de condition (la même que celle d’une bulle) s’ouvre sur un bloc avec son introduction, dit si le bloc s’affiche pour la ligne courante, enregistre sur le bloc (étiquette, bleu de la barre, HTML), se rouvre sur ce qui est posé, et « Retirer la condition » la supprime',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      let modal = await openBlockWindow(h);
      const opened = {
        open: VariableCondition.isOpen(), intro: modal.querySelector('.var-modal-intro').textContent, pill: !!modal.querySelector('.var-modal-intro .var-badge'),
        removeHidden: modal.querySelector('.var-modal-danger').hidden, rows: windowRulesOf(modal).length,
      };
      const debug = await saveCondition(h, 'Statut', 'Urgent');
      const saved = blockNodes()[0].node.attrs.condition;
      const afterSave = {
        closed: !VariableCondition.isOpen(), label: tags()[0].textContent, has: tags()[0].closest('.conditional-text').classList.contains('has-condition'),
        selected: isBlockSelected(), htmlHasCondition: Editor.getHTML().indexOf('data-condition') !== -1,
      };
      await h.sleep(60);
      const barActive = visible(toolbar()) && barButton('var-condition').active;
      // Plus de 500 ms entre les deux modifications : l'historique les groupe sinon en une seule (un seul « Annuler » reviendrait avant l'enregistrement).
      await h.sleep(650);
      modal = await openBlockWindow(h);
      const reopened = { rules: windowRulesOf(modal), removeHidden: modal.querySelector('.var-modal-danger').hidden };
      modal.querySelector('.var-modal-danger').click();
      await h.sleep(80);
      const afterRemove = { condition: blockNodes()[0].node.attrs.condition, label: tags()[0].textContent, html: Editor.getHTML(), closed: !VariableCondition.isOpen() };
      ed().commands.undo();
      await h.sleep(60);
      const afterUndo = blockNodes()[0].node.attrs.condition;
      const pass = opened.open && opened.intro === I18n.t('varCond.introBlock') && !opened.pill && opened.removeHidden && opened.rows === 1
        && debug[0] === I18n.t('varCond.debug.currentMetBlock', { id: 1 }) && JSON.stringify(saved) === JSON.stringify(COND_URGENT)
        && afterSave.closed && afterSave.label === 'Si Statut = Urgent' && afterSave.has && afterSave.selected && afterSave.htmlHasCondition && barActive
        && reopened.rules.length === 1 && reopened.rules[0].column === 'Statut' && reopened.rules[0].operator === '=' && reopened.rules[0].value === 'Urgent' && !reopened.removeHidden
        && afterRemove.condition == null && afterRemove.label === I18n.t('condText.tag.none') && afterRemove.html.indexOf('data-condition') === -1 && afterRemove.closed
        && JSON.stringify(afterUndo) === JSON.stringify(COND_URGENT);
      return { pass, notes: JSON.stringify({ opened, debug, saved, afterSave, barActive, reopened, afterRemove, afterUndo }) };
    },
  });

  cases.push({
    id: 'condtext_condition_window_on_a_block_says_when_the_block_is_hidden',
    description: 'Pour une ligne qui ne remplit pas la condition, l’aperçu de la fenêtre dit que le bloc est masqué (et non plus « valeur »)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      await openBlockWindow(h);
      const debug = await saveCondition(h, 'Statut', 'Normal');
      const pass = debug[0] === I18n.t('varCond.debug.currentNotMetBlock', { id: 1 }) && debug[0] === 'Ligne sélectionnée (n° 1) : condition non remplie, le bloc est masqué.'
        && /^Première : n° 2/.test(debug[1] ? debug[1].replace(/^.*?(?=Première)/, '') : '');
      return { pass, notes: JSON.stringify({ debug }) };
    },
  });

  cases.push({
    id: 'condtext_condition_window_offers_the_same_columns_as_a_variable',
    description: 'Les colonnes proposées dans la fenêtre d’un bloc sont celles de la fenêtre d’une bulle de la même page (table de la page, tables liées), dans le même ordre',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Titre') + '</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      const optionsOf = modal => Array.from(modal.querySelectorAll('.macro-rule-row select.macro-rule-column option')).map(o => o.value);
      await selectBadge(h, 'Titre');
      pressToolbarButton('var-condition');
      await h.sleep(80);
      const forBadge = optionsOf(conditionModal());
      cancelWindow(conditionModal());
      await h.sleep(40);
      const modal = await openBlockWindow(h);
      const forBlock = optionsOf(modal);
      cancelWindow(modal);
      const pass = forBadge.length > 3 && JSON.stringify(forBadge) === JSON.stringify(forBlock) && forBlock.indexOf('Statut') !== -1 && forBlock.some(c => /^CtLignes\./.test(c));
      return { pass, notes: JSON.stringify({ forBadge, forBlock }) };
    },
  });

  cases.push({
    id: 'condtext_condition_copy_and_paste_between_a_variable_and_a_block',
    description: 'Copier la condition d’une bulle et la coller dans la fenêtre d’un bloc (et l’inverse) : la phrase de « Coller » parle du bloc ou de la variable, rien n’est écrit avant « Enregistrer »',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Titre', COND_URGENT) + ' ' + badgeHtml('Statut') + '</p>' + block('<p>Texte</p>') + '<p>Après</p>');
      await h.sleep(80);
      const clipButtons = modal => { const b = Array.from(modal.querySelectorAll('.var-condition-clip button')); return { copy: b[0], paste: b[1] }; };
      await selectBadge(h, 'Titre');
      pressToolbarButton('var-condition');
      await h.sleep(80);
      clipButtons(conditionModal()).copy.click();
      cancelWindow(conditionModal());
      await h.sleep(40);
      let modal = await openBlockWindow(h);
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toBlock = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent, stored: blockNodes()[0].node.attrs.condition };
      modal.querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(80);
      const blockSaved = blockNodes()[0].node.attrs.condition;
      // Du bloc vers une autre bulle.
      modal = await openBlockWindow(h);
      clipButtons(modal).copy.click();
      cancelWindow(modal);
      await h.sleep(40);
      await selectBadge(h, 'Statut');
      pressToolbarButton('var-condition');
      await h.sleep(80);
      modal = conditionModal();
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toBadge = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent };
      cancelWindow(modal);
      const pass = JSON.stringify(toBlock.rules) === JSON.stringify(COND_URGENT.rules) && toBlock.status === I18n.t('varCond.clip.pastedStatusBlock') && toBlock.stored == null
        && JSON.stringify(blockSaved) === JSON.stringify(COND_URGENT)
        && JSON.stringify(toBadge.rules) === JSON.stringify(COND_URGENT.rules) && toBadge.status === I18n.t('varCond.clip.pastedStatus');
      return { pass, notes: JSON.stringify({ toBlock, blockSaved, toBadge }) };
    },
  });

  cases.push({
    id: 'condtext_english_interface_tag_toolbar_and_window',
    description: 'Interface en anglais : étiquette (« If Statut = Urgent », « Conditional text · no condition »), info-bulles de la barre et fenêtre de condition en anglais - sans clé manquante - puis retour au français',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Texte</p>', COND_URGENT) + block('<p>Libre</p>') + '<p>Après</p>');
      await h.sleep(80);
      const lang = I18n.getLang();
      let seen = null;
      try {
        I18n.setLang('en');
        await h.sleep(80);
        const labels = tags().map(t => t.textContent);
        const modal = await openBlockWindow(h, 0);
        const intro = modal.querySelector('.var-modal-intro').textContent;
        const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
        cancelWindow(modal);
        await h.sleep(40);
        await clickTag(h, 0);
        const bar = barState();
        seen = { labels, intro, debug, linked: bar.linked.title, loop: bar.loop.title, titleIf: tags()[0].title };
      } finally { I18n.setLang(lang); }
      await h.sleep(80);
      const labelsFr = tags().map(t => t.textContent);
      const missing = ['chips.conditionalText', 'varToolbar.linkedBlock', 'varToolbar.loopBlock', 'varCond.introBlock', 'varCond.debug.currentMetBlock', 'varCond.debug.currentNotMetBlock', 'varCond.debug.firstBlock',
        'varCond.saveLostBlock', 'varCond.clip.pastedStatusBlock', 'condText.tag.none', 'condText.tag.if', 'condText.tag.titleNone', 'condText.tag.titleIf'].filter(k => I18n.t(k) === k);
      const pass = seen && seen.labels[0] === 'If Statut = Urgent' && seen.labels[1] === 'Conditional text · no condition'
        && /^This text block only appears in read mode/.test(seen.intro) && seen.debug[0] === 'Selected row (#1): condition met, the block is shown.' && /^$|Selected row/.test(seen.debug[0])
        && seen.linked === 'Available for a variable, not for a text block' && /^Available for a variable linked to several rows/.test(seen.loop)
        && /^Shown if Statut = Urgent\./.test(seen.titleIf)
        && labelsFr[0] === 'Si Statut = Urgent' && labelsFr[1] === 'Texte conditionnel · sans condition' && missing.length === 0;
      return { pass: !!pass, notes: JSON.stringify({ seen, labelsFr, missing }) };
    },
  });

  // === Clavier ===
  cases.push({
    id: 'condtext_keyboard_enter_twice_leaves_the_block_and_the_selected_block_is_deleted_whole',
    description: 'Entrée sur un paragraphe vide en fin de bloc en sort (comme une citation ou une liste) ; Retour arrière sur le bloc sélectionné par son étiquette le supprime avec son contenu',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>' + block('<p>Dedans</p>', COND_URGENT) + '<p>Après</p>');
      await h.sleep(80);
      cursorIn('Dedans');
      pressKey('Enter');
      await h.sleep(40);
      const afterFirstEnter = Editor.getHTML();
      pressKey('Enter');
      await h.sleep(40);
      const afterSecondEnter = Editor.getHTML();
      await clickTag(h, 0);
      pressKey('Backspace');
      await h.sleep(60);
      const afterDelete = Editor.getHTML();
      const pass = afterFirstEnter === '<p>Avant</p>' + block('<p>Dedans</p><p></p>', COND_URGENT) + '<p>Après</p>'
        && afterSecondEnter === '<p>Avant</p>' + block('<p>Dedans</p>', COND_URGENT) + '<p></p><p>Après</p>'
        && afterDelete === '<p>Avant</p><p></p><p>Après</p>';
      return { pass, notes: JSON.stringify({ afterFirstEnter, afterSecondEnter, afterDelete }) };
    },
  });

  // === Lecture, aperçu d'export, PDF et Word ===
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const textsOf = nodes => Array.from(nodes).map(n => n.textContent.trim());
  const framesIn = root => root.querySelectorAll('.conditional-text, .conditional-text-tag, [data-condition]:not(.var-badge)').length;

  cases.push({
    id: 'condtext_reader_true_condition_unwraps_the_block_false_removes_it_without_blank_line',
    description: 'Lecture et aperçu d’export : condition remplie, le cadre disparaît et le texte reste tel quel, sans rien ajouter autour ; non remplie, le bloc et tout son contenu disparaissent sans laisser de ligne vide',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Avant</p>' + block('<p>Urgent</p><p>Suite</p>', COND_URGENT) + block('<p>Normal</p>', COND_NORMAL) + '<p>Après</p>';
        const reader1 = await renderReader(html);
        const read1 = { shape: shape(reader1), frames: framesIn(reader1) };
        const prev1 = await previewHtml(html);
        await setRecord(h, RECORD_2);
        const reader2 = await renderReader(html);
        const read2 = { shape: shape(reader2), frames: framesIn(reader2) };
        const prev2 = await previewHtml(html);
        const pass = read1.shape === 'p:Avant | p:Urgent | p:Suite | p:Après' && read1.frames === 0 && shape(prev1) === read1.shape && framesIn(prev1) === 0
          && read2.shape === 'p:Avant | p:Normal | p:Après' && read2.frames === 0 && shape(prev2) === read2.shape && framesIn(prev2) === 0;
        return { pass, notes: JSON.stringify({ read1, read2, prev1: shape(prev1), prev2: shape(prev2) }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reader_nested_blocks_follow_their_own_condition_and_a_hidden_outer_hides_all',
    description: 'Blocs emboîtés : chacun suit sa condition ; un bloc extérieur masqué emporte les blocs qu’il contient, même dont la condition est remplie ; un bloc extérieur affiché laisse chaque bloc intérieur à son verdict',
    run: async (h) => {
      try {
        await seed(h);
        const html = block('<p>Dehors normal</p>' + block('<p>Dedans urgent</p>', COND_URGENT) + '<p>Fin normal</p>', COND_NORMAL)
          + block('<p>X</p>' + block('<p>Y normal</p>', COND_NORMAL) + block('<p>Z urgent</p>' + block('<p>Tout dedans libre</p>'), COND_URGENT), COND_URGENT);
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const pass = read1 === 'p:X | p:Z urgent | p:Tout dedans libre' && read2 === 'p:Dehors normal | p:Fin normal';
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reader_block_without_condition_is_shown_and_an_unreadable_one_is_hidden_like_a_variable',
    description: 'Sans condition (ou sans règle complète) le bloc s’affiche toujours ; une condition illisible ou sur une colonne qui n’existe pas le masque, comme une bulle',
    run: async (h) => {
      try {
        await seed(h);
        const unknown = { mode: 'all', rules: [{ column: 'Inexistante', operator: '=', value: 'x' }] };
        const html = block('<p>Libre</p>') + block('<p>Sans règle</p>', { mode: 'all', rules: [] })
          + '<div class="conditional-text" data-condition="{pas du json"><p>Illisible</p></div>' + block('<p>Colonne inconnue</p>', unknown)
          + '<p>Bulle ' + badgeHtml('Titre', unknown) + '|</p>';
        const read = shape(await renderReader(html));
        const pass = read === 'p:Libre | p:Sans règle | p:Bulle |';
        return { pass, notes: JSON.stringify({ read }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reader_variables_and_conditional_variables_inside_a_block',
    description: 'Un bloc contient des variables, y compris à condition : la valeur de chaque variable est écrite, une variable à condition non remplie disparaît, indépendamment de la condition du bloc',
    run: async (h) => {
      try {
        await seed(h);
        const html = block('<p>[' + badgeHtml('Titre') + '][' + badgeHtml('Titre', COND_URGENT) + '][' + badgeHtml('Titre', COND_NORMAL) + ']</p>', COND_URGENT)
          + block('<p>{' + badgeHtml('Titre') + '}</p>', COND_NORMAL)
          + block('<p>(' + badgeHtml('Statut', COND_NORMAL) + ')</p>' + block('<p>&lt;' + badgeHtml('Responsable') + '&gt;</p>'));
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const pass = read1 === 'p:[Dossier A][Dossier A][] | p:() | p:<Dupont Jean>' && read2 === 'p:{Dossier B} | p:(Normal) | p:<Martin Anne>';
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reader_block_in_a_table_cell_a_list_item_and_a_column',
    description: 'Un bloc dans une case de tableau, un élément de liste ou une colonne de zone 2 colonnes : affiché, il se défait en place ; masqué, la case ou la colonne reste vide et le tableau, la liste, la zone gardent leur forme',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<table><tbody><tr><td>' + block('<p>Case vraie</p>', COND_URGENT) + '</td><td>' + block('<p>Case fausse</p>', COND_NORMAL) + '</td></tr></tbody></table>'
          + '<ul><li><p>un</p>' + block('<p>sous-texte faux</p>', COND_NORMAL) + '</li><li><p>deux</p>' + block('<p>sous-texte vrai</p>', COND_URGENT) + '</li></ul>'
          + '<div class="two-columns-zone"><div class="two-columns-column">' + block('<p>Gauche fausse</p>', COND_NORMAL) + '</div><div class="two-columns-column"><p>Droite</p></div></div>';
        const reader = await renderReader(html);
        const cells = textsOf(reader.querySelectorAll('td'));
        const items = Array.from(reader.querySelectorAll('li')).map(li => li.textContent.trim());
        const columns = textsOf(reader.querySelectorAll('.two-columns-column'));
        const pass = JSON.stringify(cells) === JSON.stringify(['Case vraie', '']) && JSON.stringify(items) === JSON.stringify(['un', 'deuxsous-texte vrai'])
          && JSON.stringify(columns) === JSON.stringify(['', 'Droite']) && framesIn(reader) === 0;
        return { pass, notes: JSON.stringify({ cells, items, columns, frames: framesIn(reader) }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_block_and_callout_nest_in_either_order',
    description: 'Un encadré dans un bloc et un bloc dans un encadré : l’éditeur garde les deux emboîtements, la Lecture et l’aperçu défont le bloc vrai, retirent le bloc faux avec l’encadré qu’il contient, et un bloc faux dans un encadré ne retire que le bloc',
    run: async (h) => {
      try {
        await seed(h);
        const callout = inner => '<div class="callout">' + inner + '</div>';
        Editor.setHTML(block(callout('<p>Encadré dans un bloc vrai</p>'), COND_URGENT) + block(callout('<p>Encadré dans un bloc faux</p>'), COND_NORMAL)
          + callout('<p>Titre</p>' + block('<p>Bloc vrai dans l’encadré</p>', COND_URGENT) + block('<p>Bloc faux dans l’encadré</p>', COND_NORMAL)));
        await h.sleep(60);
        const nesting = [];
        ed().state.doc.descendants((node, pos) => {
          if (node.type.name === 'conditionalText' || node.type.name === 'callout') nesting.push(node.type.name + '>' + ed().state.doc.resolve(pos).parent.type.name);
        });
        const html = Editor.getHTML();
        const reader = await renderReader(html);
        const callouts = textsOf(reader.querySelectorAll('.callout'));
        const preview = await previewHtml(html);
        const previewCallouts = textsOf(preview.querySelectorAll('.callout'));
        const expected = ['Encadré dans un bloc vrai', 'TitreBloc vrai dans l’encadré'];
        const pass = JSON.stringify(nesting) === JSON.stringify(['conditionalText>doc', 'callout>conditionalText', 'conditionalText>doc', 'callout>conditionalText', 'callout>doc',
          'conditionalText>callout', 'conditionalText>callout'])
          && JSON.stringify(callouts) === JSON.stringify(expected) && JSON.stringify(previewCallouts) === JSON.stringify(expected)
          && framesIn(reader) === 0 && framesIn(preview) === 0;
        return { pass, notes: JSON.stringify({ nesting, callouts, previewCallouts, frames: framesIn(reader) + framesIn(preview) }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reader_block_inside_a_repeated_row_reads_the_row_of_its_turn',
    description: 'Un bloc dans une ligne de tableau répétée (boucle sur une table liée) lit la ligne de son tour : une condition sur une colonne de la table parcourue n’affiche son texte que pour les lignes qui la remplissent',
    run: async (h) => {
      try {
        await seed(h);
        const loop = { repeat: 'row', table: 'CtLignes', empty: 'header' };
        const designation = `<span class="var-badge" data-table="CtLignes" data-column="Designation" data-key="CtLignes.Designation"${attr('data-loop', loop)} data-loop-repeat="row"></span>`;
        const bigQuantity = { mode: 'all', rules: [{ column: 'CtLignes.Qte', operator: '>', value: '5' }] };
        const html = '<table><tbody><tr><th><p>Désignation</p></th><th><p>Remarque</p></th></tr>'
          + '<tr><td><p>' + designation + '</p></td><td>' + block('<p>Gros volume</p>', bigQuantity) + '</td></tr></tbody></table>';
        const reader = await renderReader(html);
        const rows = Array.from(reader.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()).join(' | '));
        const pass = JSON.stringify(rows) === JSON.stringify(['Désignation | Remarque', 'Audit | ', 'Livret | Gros volume', 'Déplacement | ']) && framesIn(reader) === 0;
        return { pass, notes: JSON.stringify({ rows }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_condition_on_a_linked_table_column_holds_if_any_linked_row_does',
    description: 'Condition d’un bloc sur une colonne d’une table liée : remplie si une des lignes liées la remplit (même règle que pour une bulle), fausse pour une ligne sans ligne liée',
    run: async (h) => {
      try {
        await seed(h);
        const big = { mode: 'all', rules: [{ column: 'CtLignes.Qte', operator: '>', value: '10' }] };
        const huge = { mode: 'all', rules: [{ column: 'CtLignes.Qte', operator: '>', value: '100' }] };
        const html = block('<p>Gros</p>', big) + block('<p>Énorme</p>', huge) + '<p>Fin</p>';
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const pass = read1 === 'p:Gros | p:Fin' && read2 === 'p:Fin';
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_header_and_footer_blocks_are_resolved_in_reading_and_in_exports',
    description: 'Un bloc dans l’en-tête ou le pied de page se résout comme dans le corps : affichage en Lecture (aperçu A4) et zones préparées pour le PDF et le Word',
    run: async (h) => {
      try {
        await seed(h);
        h.setA4Preview(true);
        const hf = {
          enabled: true, differentFirstPage: false,
          header: { default: block('<p>En-tête urgent</p>', COND_URGENT) + block('<p>En-tête normal</p>', COND_NORMAL), first: '' },
          footer: { default: '<p>Pied</p>' + block('<p>Pied normal</p>', COND_NORMAL) + block('<p>Pied urgent</p>', COND_URGENT), first: '' },
        };
        await renderReader('<p>Corps</p>', hf);
        const header = document.querySelector('#reader-container .v2-page-edge-top');
        const headerText = header ? header.textContent.trim() : null;
        const headerFrames = header ? framesIn(header) : -1;
        const zones = await ExportCommon.resolveHeaderFooterVariables(hf, TABLE, GristAPI.getCurrentRecord());
        const box = document.createElement('div');
        box.innerHTML = zones.footer.default;
        const headerBox = document.createElement('div');
        headerBox.innerHTML = zones.header.default;
        const pass = headerText === 'En-tête urgent' && headerFrames === 0 && shape(box) === 'p:Pied | p:Pied urgent' && shape(headerBox) === 'p:En-tête urgent' && framesIn(box) === 0 && framesIn(headerBox) === 0;
        return { pass, notes: JSON.stringify({ headerText, headerFrames, footer: shape(box), header: shape(headerBox) }) };
      } finally { h.setA4Preview(false); closeReader(); }
    },
  });

  async function pdfText(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(it => it.str).join(' ');
    return text.replace(/\s+/g, ' ').trim();
  }
  async function docxBodyParagraphs(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    return Array.from(xml.getElementsByTagName('w:p')).map(p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join(''));
  }
  cases.push({
    id: 'condtext_pdf_and_word_files_follow_the_block_condition_of_each_row',
    description: 'Les vrais fichiers : le PDF et le Word d’une ligne ne contiennent que les blocs dont la condition est remplie pour cette ligne, sans cadre, sans paragraphe vide à la place d’un bloc masqué, case de tableau comprise (Word : une case vide garde son paragraphe)',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Début</p>' + block('<p>Bloc urgent</p>', COND_URGENT) + block('<p>Bloc normal</p>', COND_NORMAL)
          + '<table><tbody><tr><td>' + block('<p>Case urgente</p>', COND_URGENT) + '</td><td>' + block('<p>Case normale</p>', COND_NORMAL) + '</td></tr></tbody></table><p>Fin</p>';
        await PdfExport.ensurePdfLibsLoaded();
        await DocxExport.ensureDocxLibLoaded();
        const out = {};
        for (const [key, record] of [['urgent', RECORD_1], ['normal', RECORD_2]]) {
          out['pdf_' + key] = await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, TABLE, record, '', NO_HF, undefined)).blob);
          out['docx_' + key] = await docxBodyParagraphs((await DocxExport.getDocxBlobForRecord(html, TABLE, record, '', NO_HF, null)).blob);
        }
        const nonEmpty = list => list.filter(t => t !== '');
        const pass = out.pdf_urgent === 'Début Bloc urgent Case urgente Fin' && out.pdf_normal === 'Début Bloc normal Case normale Fin'
          && JSON.stringify(nonEmpty(out.docx_urgent)) === JSON.stringify(['Début', 'Bloc urgent', 'Case urgente', 'Fin'])
          && JSON.stringify(nonEmpty(out.docx_normal)) === JSON.stringify(['Début', 'Bloc normal', 'Case normale', 'Fin'])
          && out.docx_urgent[0] === 'Début' && out.docx_urgent[1] === 'Bloc urgent' && out.docx_normal[1] === 'Bloc normal';
        return { pass, notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condtext_reading_keeps_comment_positions_of_the_text_in_a_shown_block',
    description: 'Commentaires en Lecture : le texte d’un bloc affiché garde ses repères de position (le texte retrouvé à ces positions est le bon), celui d’un bloc masqué disparaît avec lui',
    run: async (h) => {
      try {
        await seed(h);
        Editor.setHTML('<p>Avant</p>' + block('<p>Dedans visible</p>', COND_URGENT) + block('<p>Dedans masqué</p>', COND_NORMAL) + '<p>Après</p>');
        await h.sleep(80);
        const tagged = await Comments.buildReaderHtml();
        const reader = await renderReader(tagged);
        const marks = Array.from(reader.querySelectorAll('[data-pp-pos]')).map(span => {
          const raw = span.getAttribute('data-pp-pos');
          const pos = Number(raw.slice(raw.indexOf(':') + 1));
          return { text: span.textContent, found: ed().state.doc.textBetween(pos, pos + span.textContent.length) };
        });
        const pass = marks.length === 3 && marks.every(m => m.text === m.found) && marks.map(m => m.text).join('|') === 'Avant|Dedans visible|Après' && framesIn(reader) === 0;
        return { pass, notes: JSON.stringify({ marks, shape: shape(reader) }) };
      } finally { closeReader(); }
    },
  });

  // === Éditeur : géométrie, pagination, copier-coller, mode suivi ===
  const A4_HEIGHT_PX = 841.89 * 96 / 72;
  const sheetZoom = () => {
    const sheet = document.querySelector('#editor-container .v2-page-sheet');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / sheetZoom();
  function setPageContentHeight(contentPx) {
    const halfMm = (A4_HEIGHT_PX - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }

  cases.push({
    id: 'condtext_frame_does_not_change_the_text_width_so_the_editor_wraps_like_the_export',
    description: 'Le cadre pointillé n’occupe aucune largeur : un paragraphe dans un bloc, dans un bloc d’un bloc, a la même position et la même largeur qu’un paragraphe hors bloc (les retours à la ligne sont ceux de la Lecture et de l’export)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dehors</p>' + block('<p>Dedans</p>' + block('<p>Tout dedans</p>', COND_URGENT)) + '<p>Fin</p>');
      await h.sleep(100);
      const rect = text => { const p = Array.from(document.querySelectorAll('.tiptap p')).find(x => x.textContent === text); const r = p.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, width: Math.round(r.width * 10) / 10 }; };
      const outside = rect('Dehors');
      const inside = rect('Dedans');
      const deeper = rect('Tout dedans');
      const same = (a, b) => Math.abs(a.left - b.left) <= 0.5 && Math.abs(a.width - b.width) <= 0.5;
      const pass = same(outside, inside) && same(outside, deeper) && outside.width > 100;
      return { pass, notes: JSON.stringify({ outside, inside, deeper }) };
    },
  });

  cases.push({
    id: 'condtext_editor_pagination_keeps_a_long_block_on_its_page_like_a_list_or_a_table',
    description: 'Pagination de l’aperçu A4 : un bloc long qui déborde de peu reste sur sa page (son texte coule d’une page à l’autre à l’export), un bloc dont moins de la moitié tient passe en entier à la page suivante',
    run: async (h) => {
      const overshoot = async (px, factor) => {
        await h.resetEditor();
        h.setA4Preview(true);
        PageLayout.setMarginsMm(null);
        Editor.setHTML('<p>Titre du document</p><p></p>' + block(Array.from({ length: 38 }, (_, i) => '<p>Ligne ' + i + ' du bloc conditionnel</p>').join('')));
        await h.sleep(500);
        const kids = () => Array.from(h.tiptap().children);
        const target = kids().find(k => k.classList.contains('conditional-text'));
        const before = kids().slice(0, kids().indexOf(target)).reduce((sum, k) => sum + layoutHeight(k), 0);
        const blockPx = layoutHeight(target);
        setPageContentHeight(before + blockPx - (factor ? blockPx * factor : px));
        Editor.refreshPaginationPreview();
        await h.sleep(350);
        const top = target.getBoundingClientRect().top;
        const bands = Array.from(document.querySelectorAll('#editor-container .v2-page-band'));
        return { blockPx, bandsAbove: bands.filter(b => b.getBoundingClientRect().top < top).length };
      };
      try {
        const small = await overshoot(30, 0);
        const large = await overshoot(0, 0.7);
        const pass = small.bandsAbove === 0 && small.blockPx > 300 && large.bandsAbove === 1;
        return { pass, notes: JSON.stringify({ small, large }) };
      } finally { PageLayout.setMarginsMm(null); h.setA4Preview(false); }
    },
  });

  cases.push({
    id: 'condtext_copy_and_paste_of_a_block_keeps_its_condition_and_content',
    description: 'Copier un bloc sélectionné par son étiquette et le coller ailleurs recrée le bloc avec sa condition, ses variables et ses blocs emboîtés',
    run: async (h) => {
      await seed(h);
      const source = block('<p>Dossier ' + badgeHtml('Titre') + '</p>' + block('<p>Intérieur</p>', COND_NORMAL), COND_URGENT);
      Editor.setHTML(source + '<p>Suite</p><p></p>');
      await h.sleep(80);
      await clickTag(h, 0);
      const { dom } = ed().view.serializeForClipboard(ed().state.selection.content());
      const copied = dom.innerHTML;
      const last = ed().state.doc.content.size - 1;
      ed().commands.setTextSelection(last);
      ed().view.focus();
      ed().view.pasteHTML(copied);
      await h.sleep(120);
      const nodes = blockNodes();
      const conditions = nodes.map(n => JSON.stringify(n.node.attrs.condition));
      const pass = nodes.length === 4 && conditions[0] === JSON.stringify(COND_URGENT) && conditions[1] === JSON.stringify(COND_NORMAL)
        && conditions[2] === JSON.stringify(COND_URGENT) && conditions[3] === JSON.stringify(COND_NORMAL)
        && Editor.getHTML().split('data-key="CtDossiers.Titre"').length === 3;
      return { pass, notes: JSON.stringify({ count: nodes.length, conditions, copied: copied.slice(0, 200), html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'condtext_suggest_mode_wrap_is_tracked_and_accepting_all_gives_the_block',
    description: 'En mode suivi, entourer un texte d’un bloc se suit (ancien texte barré, bloc inséré) et « Tout accepter » rend exactement le document avec le bloc',
    run: async (h) => {
      await seed(h);
      const ed0 = ed();
      let suggest = false;
      try {
        ed0.commands.loadTrackedDocument('<p>Alpha</p><p>Beta gamma</p><p>Delta</p>');
        ed0.commands.toggleSuggestMode();
        suggest = true;
        await h.sleep(60);
        selectText('gamma');
        const started = ConditionalText.startFromSelection(ed0);
        await h.sleep(100);
        const picked = await pickEntry(h);
        const tracked = Editor.getHTML();
        ed0.commands.acceptAllSuggestionsChunked();
        await h.sleep(120);
        const accepted = Editor.getHTML();
        const pass = started && picked && /<ins|<del/.test(tracked) && accepted === '<p>Alpha</p>' + block('<p>Beta gamma</p>') + '<p>Delta</p>';
        return { pass, notes: JSON.stringify({ started, picked, tracked: tracked.slice(0, 400), accepted }) };
      } finally { if (suggest) ed0.commands.toggleSuggestMode(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condText = cases;
})();
