// Suite "condValue" - valeur conditionnelle (demande d'Antoine du 2026-10-02, point 5 : « une valeur - un ou plusieurs mots, un nombre, etc. - qui s'affiche de manière conditionnelle »,
// choix « Dans la phrase » : une ligne « Valeur conditionnelle » à part dans le menu des variables, onglet Chips, EN LIGNE, petite, son cadre grandissant avec le texte et les retours à la
// ligne). Nœud conditionalValue (js/editor-nodes.js : le nœud et ses touches), entrée du panneau et pose (js/variables.js, js/conditional-value.js), barre flottante (js/floating-toolbars.js),
// fenêtre de condition partagée avec les bulles et les blocs (js/variable-condition.js), résolution à la Lecture et aux exports (js/reader-mode.js -> ConditionalValue.resolve).
// Jeu de données de la suite condText, sous d'autres noms de tables. Le vrai clavier et la vraie souris sont dans verify-cond-value-mouse.mjs (script condValueMouse).
(function () {
  const cases = [];

  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TABLE = 'CvDossiers';

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  // Le HTML enregistré d'une valeur : exactement ce que renderHTML écrit.
  function val(inner, condition) { return `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}>${inner}</span>`; }
  function block(inner, condition) { return `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}>${inner}</div>`; }
  function badgeHtml(column, condition) {
    return `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('CvAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CvAnnuaire', Montant: 'Numeric' });
    stub.setVariables('CvLignes', { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows('CvAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }, { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88' }]);
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
    ]);
    stub.setRows('CvLignes', [
      { id: 1, Dossier: 1, Designation: 'Audit', Qte: 1 },
      { id: 2, Dossier: 1, Designation: 'Livret', Qte: 12 },
      { id: 3, Dossier: 1, Designation: 'Déplacement', Qte: 1 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('CvAnnuaire');
    await GristAPI.deleteLinkRule('CvLignes');
    await GristAPI.saveLinkRule('CvLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
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
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const framesIn = root => root.querySelectorAll('.conditional-value, .conditional-text, [data-condition]:not(.var-badge)').length;

  function ed() { return EditorCore.getEditor(); }
  function valueNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'conditionalValue') out.push({ node, pos }); });
    return out;
  }
  function valueEls() { return Array.from(document.querySelectorAll('.tiptap .conditional-value')); }
  const stripConditions = html => html.replace(/ data-condition="[^"]*"/g, ' data-condition=…');
  function panelBox() { return document.getElementById('autocomplete-box'); }
  function panelOpen() { const b = panelBox(); return !!b && b.style.display !== 'none'; }
  function panelItems() { return panelOpen() ? Array.from(panelBox().querySelectorAll('.ac-item')).map(i => i.textContent) : []; }
  function panelSelected() { const i = panelBox() && panelBox().querySelector('.ac-item.selected'); return i ? i.textContent : null; }
  async function openChipsTab(h) {
    document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await h.sleep(30);
  }
  async function pickEntry(h) {
    // Une liste fermée garde ses lignes dans le DOM : sans cette garde, un « # » que le panneau n'a pas reconnu se choisirait quand même, sur la plage de la fois d'avant.
    if (!panelOpen()) return false;
    const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(i => i.textContent === I18n.t('chips.conditionalValue'));
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
  // Le curseur DANS la n-ième valeur (dans l'ordre du document), à `offset` caractères du début de son contenu (par défaut : à la fin).
  function caretInValue(index, offset) {
    const found = valueNodes()[index || 0];
    if (!found) return false;
    ed().commands.setTextSelection(found.pos + 1 + (offset == null ? found.node.content.size : offset));
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
  // La sélection qui va du début de `startNeedle` à la fin de `endNeedle` (le premier texte qui la contient, puis le suivant), marques et nœuds en ligne compris.
  function selectBetween(startNeedle, endNeedle) {
    let from = -1;
    let to = -1;
    ed().state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      if (from < 0) { const i = node.text.indexOf(startNeedle); if (i !== -1) from = pos + i; }
      if (from >= 0 && to < 0) { const j = node.text.indexOf(endNeedle); if (j !== -1 && pos + j >= from) to = pos + j + endNeedle.length; }
    });
    if (from < 0 || to < 0) return false;
    ed().commands.setTextSelection({ from, to });
    ed().view.focus();
    return true;
  }
  function pressKey(key) {
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function pressToolbarButton(action) { toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  function conditionModal() { return document.getElementById('var-condition-modal'); }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  function barButton(action) {
    const b = toolbar().querySelector(`button[data-action="${action}"]`);
    return b ? { disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), active: b.classList.contains('is-active'), title: b.title, hidden: b.hidden && b.getClientRects().length === 0 } : null;
  }
  function barState() {
    const bar = toolbar();
    return {
      visible: visible(bar), condition: barButton('var-condition'), linked: barButton('var-linked'), loop: barButton('var-loop'), column: barButton('var-column'),
      numberHidden: bar.querySelector('[data-var-panel="number"]').hidden, dateHidden: bar.querySelector('[data-var-panel="date"]').hidden, boolHidden: bar.querySelector('[data-var-panel="bool"]').hidden,
    };
  }
  const selectionInValue = () => { const s = ed().state.selection; return s.toJSON().type === 'text' && s.$from.parent.type.name === 'conditionalValue' && s.$to.parent === s.$from.parent; };
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
  function windowRulesOf(modal) {
    return Array.from(modal.querySelectorAll('.macro-rule-row')).map(row => ({
      column: row.querySelector('select.macro-rule-column').value,
      operator: row.querySelector(':scope > select').value,
      value: row.querySelector('.macro-rule-value').value,
    }));
  }
  function cancelWindow(modal) { modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click(); }
  const unwrapButton = modal => modal.querySelector('.var-modal-actions .var-modal-unwrap');
  const footerLabels = modal => Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent);
  // La fenêtre de condition de la n-ième valeur, ouverte comme une personne : le curseur dans la valeur, puis le bouton de condition de la barre.
  async function openValueWindow(h, index, offset) {
    caretInValue(index || 0, offset);
    await h.sleep(120);
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }

  // === Éditeur : entrée du panneau, pose de la valeur ===
  cases.push({
    id: 'condvalue_empty_value_replaces_the_hash_and_typing_stays_inside',
    description: '« Valeur conditionnelle » (onglet Chips) pose une valeur vide à la place de « # », au fil de la phrase et le curseur dedans : la frappe suivante est dans la valeur, qui montre son texte d’attente (« valeur ») et son info-bulle tant qu’elle est vide',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Contrat signé</p>');
      await h.sleep(40);
      cursorIn('Contrat signé');
      const picked = await insertViaPanel(h, true);
      const htmlAfterPick = Editor.getHTML();
      const inside = ed().state.selection.empty && selectionInValue();
      const el = valueEls()[0];
      const placeholder = el ? getComputedStyle(el, '::before').content : null;
      const emptyTitle = el ? el.title : null;
      await h.typeText('urgent');
      const html = Editor.getHTML();
      const typed = valueEls()[0];
      const pass = picked && htmlAfterPick === '<p>Contrat signé ' + val('') + '</p>' && inside && placeholder === '"valeur"' && emptyTitle === I18n.t('condValue.titleNone')
        && html === '<p>Contrat signé ' + val('urgent') + '</p>' && /^(none|normal)$/.test(getComputedStyle(typed, '::before').content) && !panelOpen();
      return { pass, notes: JSON.stringify({ picked, htmlAfterPick, inside, placeholder, emptyTitle, html }) };
    },
  });

  cases.push({
    id: 'condvalue_value_in_a_sentence_stays_inline_and_does_not_split_the_paragraph',
    description: 'Posée au milieu, au début ou à la fin d’un paragraphe, la valeur reste dans la phrase : un seul paragraphe, la valeur à la place du « # » (un bloc, lui, couperait le paragraphe)',
    run: async (h) => {
      const results = {};
      for (const where of ['middle', 'end', 'start']) {
        await seed(h);
        Editor.setHTML('<p>Bonjour monsieur</p>');
        await h.sleep(40);
        cursorIn('Bonjour', where === 'middle' ? 'Bonjour '.length : where === 'end' ? undefined : 0);
        const picked = await insertViaPanel(h, where === 'end');
        results[where] = { picked, html: Editor.getHTML(), inside: selectionInValue() };
      }
      // La requête « # » (et l'espace tapée devant) disparaît ; l'espace, elle, reste dans le texte qu'elle sépare.
      const pass = results.middle.picked && results.middle.html === '<p>Bonjour ' + val('') + 'monsieur</p>'
        && results.end.picked && results.end.html === '<p>Bonjour monsieur ' + val('') + '</p>'
        && results.start.picked && results.start.html === '<p>' + val('') + 'Bonjour monsieur</p>'
        && results.middle.inside && results.end.inside && results.start.inside;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condvalue_value_goes_in_a_list_item_a_table_cell_a_heading_a_column_and_a_callout_not_in_code',
    description: 'La valeur se pose dans un élément de liste, une case de tableau, un titre, une colonne de zone 2 colonnes et un encadré, dans leur paragraphe ; dans un bloc de code, rien ne se pose (l’appel rend faux et ne change rien)',
    run: async (h) => {
      const contexts = [
        ['listItem', '<ul><li><p>un</p></li><li><p>deux</p></li></ul><p>Fin</p>', 'un', 'paragraph'],
        ['tableCell', '<table><tbody><tr><td><p>cellule</p></td><td><p>x</p></td></tr></tbody></table><p>Fin</p>', 'cellule', 'paragraph'],
        ['heading', '<h2>Titre</h2><p>Fin</p>', 'Titre', 'heading'],
        ['twoColumnsColumn', '<div class="two-columns-zone"><div class="two-columns-column"><p>gauche</p></div><div class="two-columns-column"><p>droite</p></div></div><p>Fin</p>', 'gauche', 'paragraph'],
        ['callout', '<div class="callout"><p>Titre</p></div><p>Fin</p>', 'Titre', 'paragraph'],
      ];
      const results = {};
      for (const [ancestor, html, needle, parent] of contexts) {
        await seed(h);
        Editor.setHTML(html);
        await h.sleep(40);
        cursorIn(needle);
        const picked = await insertViaPanel(h, true);
        const found = valueNodes();
        const chain = found.length ? (() => { const $pos = ed().state.doc.resolve(found[0].pos); return Array.from({ length: $pos.depth + 1 }, (_, d) => $pos.node(d).type.name); })() : [];
        results[ancestor] = { picked, count: found.length, parent: chain[chain.length - 1], inChain: chain.indexOf(ancestor) !== -1, hash: ed().state.doc.textContent.indexOf('#') !== -1, inside: selectionInValue() };
      }
      await seed(h);
      Editor.setHTML('<pre><code>abc #</code></pre><p>Fin</p>');
      await h.sleep(40);
      let hashPos = -1;
      ed().state.doc.descendants((node, pos) => { if (hashPos < 0 && node.isText && node.text.indexOf('#') !== -1) hashPos = pos + node.text.indexOf('#'); });
      const before = Editor.getHTML();
      const realWarn = console.warn;
      let warned = 0;
      console.warn = () => { warned++; };
      let refused;
      try { refused = ConditionalValue.insertFromPanel(ed(), { from: hashPos, to: hashPos + 1 }); } finally { console.warn = realWarn; }
      const pass = contexts.every(([ancestor, , , parent]) => { const r = results[ancestor]; return r.picked && r.count === 1 && r.parent === parent && r.inChain && !r.hash && r.inside; })
        && hashPos > 0 && refused === false && Editor.getHTML() === before && warned === 1;
      return { pass, notes: JSON.stringify({ results, hashPos, refused, warned }) };
    },
  });

  cases.push({
    id: 'condvalue_selection_is_wrapped_via_the_variable_button_with_its_marks_and_stays_selected',
    description: 'Du texte sélectionné dans un paragraphe, « Insérer une variable » (la liste s’ouvre sur Chips, « Texte conditionnel » en surbrillance comme avant) puis une flèche vers le bas et Entrée sur « Valeur conditionnelle » : le texte - gras compris - est entouré, sans « # », et la sélection reste sur lui',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Alpha</p><p>Beta <strong>gamma</strong> delta</p><p>Epsilon</p>');
      await h.sleep(40);
      selectBetween('ta ', ' de');
      await h.sleep(60);
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(120);
      const afterClick = Editor.getHTML();
      const opened = { open: panelOpen(), first: panelSelected() };
      pressKey('ArrowDown');
      await h.sleep(30);
      const moved = panelSelected();
      pressKey('Enter');
      await h.sleep(100);
      const html = Editor.getHTML();
      const sel = ed().state.selection;
      const pass = afterClick === '<p>Alpha</p><p>#Beta <strong>gamma</strong> delta</p><p>Epsilon</p>' && opened.open && opened.first === I18n.t('chips.conditionalText') && moved === I18n.t('chips.conditionalValue')
        && html === '<p>Alpha</p><p>Be' + val('ta <strong>gamma</strong> de') + 'lta</p><p>Epsilon</p>' && !sel.empty && selectionInValue() && ed().state.doc.textBetween(sel.from, sel.to) === 'ta gamma de'
        && !ConditionalText.hasPending() && !panelOpen();
      return { pass, notes: JSON.stringify({ afterClick, opened, moved, html, selected: ed().state.doc.textBetween(sel.from, sel.to) }) };
    },
  });

  cases.push({
    id: 'condvalue_selection_over_two_paragraphs_puts_an_empty_value_at_its_start_not_at_the_paragraph_start',
    description: 'Une valeur ne tient pas sur deux paragraphes : avec un texte sélectionné sur plusieurs paragraphes, « Valeur conditionnelle » ne l’entoure pas, pose une valeur vide au DÉBUT de la sélection (pas au début du paragraphe où le « # » s’est posé), le curseur dedans, et le texte reste intact',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Alpha</p><p>Beta</p><p>Gamma</p>');
      await h.sleep(40);
      ed().commands.setTextSelection({ from: 3, to: 12 });
      await h.clickButton('v2-btn-insert-variable');
      await h.sleep(100);
      pressKey('ArrowDown');
      await h.sleep(30);
      pressKey('Enter');
      await h.sleep(100);
      const html = Editor.getHTML();
      const pass = html === '<p>Al' + val('') + 'pha</p><p>Beta</p><p>Gamma</p>' && selectionInValue() && ed().state.selection.empty && !ConditionalText.hasPending() && !panelOpen();
      return { pass, notes: JSON.stringify({ html }) };
    },
  });

  cases.push({
    id: 'condvalue_html_round_trip_keeps_conditions_nesting_marks_and_variables',
    description: 'Le HTML d’une valeur (data-condition, valeur dans une valeur, gras, bulle conditionnelle dedans, valeur vide) survit à un aller-retour dans l’éditeur ; sans condition, aucun attribut',
    run: async (h) => {
      await seed(h);
      const source = '<p>Avant ' + val('Dossier ' + badgeHtml('Titre') + ' <strong>urgent</strong>' + val(' (voir ' + badgeHtml('Montant', COND_NORMAL) + ')', COND_NORMAL), COND_URGENT)
        + ' et ' + val('libre') + ' puis ' + val('') + ' après' + val(' fin ') + '</p>';
      Editor.setHTML(source);
      await h.sleep(60);
      const nodes = valueNodes();
      const html = Editor.getHTML();
      const again = (() => { Editor.setHTML(html); return Editor.getHTML(); })();
      const conditions = nodes.map(n => n.node.attrs.condition);
      // Trois conditions dans le HTML : les deux valeurs conditionnées et la bulle ; les valeurs « libre » et vide n'en portent aucune.
      const count = html.split('data-condition').length - 1;
      // Les espaces du début et de la fin d'une valeur sont les siens (ProseMirror les retirait au chargement, comme dans un bloc) : « Dossier<valeur> urgent</valeur> » les garde.
      const spaces = html.indexOf('<span class="conditional-value"> fin </span>') !== -1 && html.indexOf('> (voir ') !== -1;
      const pass = nodes.length === 5 && JSON.stringify(conditions[0]) === JSON.stringify(COND_URGENT) && JSON.stringify(conditions[1]) === JSON.stringify(COND_NORMAL) && conditions[2] === null && conditions[3] === null
        && html.indexOf('<span class="conditional-value">libre</span>') !== -1 && html.indexOf('<span class="conditional-value"></span>') !== -1 && html.indexOf('<strong>urgent</strong>') !== -1
        && count === 3 && again === html && spaces;
      return { pass, notes: JSON.stringify({ count, same: again === html, spaces, conditions, html }) };
    },
  });

  // === Clavier ===
  cases.push({
    id: 'condvalue_enter_in_a_value_is_a_line_break_not_a_new_paragraph',
    description: 'Entrée dans une valeur est un retour à la ligne DANS la valeur (le cadre grandit d’une ligne), le curseur reste dedans ; hors valeur, Entrée coupe toujours le paragraphe',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Premier second', COND_URGENT) + ' après</p><p>Fin</p>');
      await h.sleep(60);
      caretInValue(0, 'Premier'.length);
      pressKey('Enter');
      await h.sleep(60);
      const html = Editor.getHTML();
      const paragraphs = ed().state.doc.childCount;
      const insideAfter = selectionInValue() && ed().state.selection.$from.parentOffset === 'Premier'.length + 1;
      const brInside = !!document.querySelector('.tiptap .conditional-value br');
      cursorIn('Fin');
      pressKey('Enter');
      await h.sleep(60);
      const pass = html === '<p>Avant ' + val('Premier<br> second', COND_URGENT) + ' après</p><p>Fin</p>' && paragraphs === 2 && insideAfter && brInside && ed().state.doc.childCount === 3;
      return { pass, notes: JSON.stringify({ html, paragraphs, insideAfter, brInside, after: ed().state.doc.childCount }) };
    },
  });

  cases.push({
    id: 'condvalue_backspace_at_the_start_and_delete_at_the_end_leave_the_neighbouring_text_alone',
    description: 'Retour arrière au début de la valeur et Suppr à sa fin ne mangent pas le texte voisin (« Avant » entier disparaissait, « après » entrait dans la valeur) : le curseur passe de l’autre côté du bord, la touche suit son cours ; au milieu de la valeur, rien ne bouge ; au début d’un paragraphe, Retour arrière rejoint le paragraphe précédent comme pour un texte',
    run: async (h) => {
      await seed(h);
      const source = '<p>Avant ' + val('mot', COND_URGENT) + ' après</p>';
      Editor.setHTML(source);
      await h.sleep(60);
      const start = valueNodes()[0].pos;
      const size = valueNodes()[0].node.nodeSize;
      caretInValue(0, 0);
      pressKey('Backspace');
      await h.sleep(40);
      const back = { html: Editor.getHTML(), at: ed().state.selection.from, expected: start, insideValue: selectionInValue() };
      caretInValue(0);
      pressKey('Delete');
      await h.sleep(40);
      const forward = { html: Editor.getHTML(), at: ed().state.selection.from, expected: start + size, insideValue: selectionInValue() };
      caretInValue(0, 1);
      pressKey('Backspace');
      pressKey('Delete');
      await h.sleep(40);
      const middle = { html: Editor.getHTML(), at: ed().state.selection.from, expected: start + 2, insideValue: selectionInValue() };
      Editor.setHTML('<p>Avant</p><p>' + val('mot') + ' fin</p>');
      await h.sleep(60);
      caretInValue(0, 0);
      pressKey('Backspace');
      await h.sleep(60);
      const joined = Editor.getHTML();
      const pass = back.html === source && back.at === back.expected && !back.insideValue
        && forward.html === source && forward.at === forward.expected && !forward.insideValue
        && middle.html === source && middle.at === middle.expected && middle.insideValue
        && joined === '<p>Avant' + val('mot') + ' fin</p>';
      return { pass, notes: JSON.stringify({ back, forward, middle, joined }) };
    },
  });

  cases.push({
    id: 'condvalue_backspace_and_delete_in_an_empty_value_remove_it',
    description: 'Dans une valeur vide, Retour arrière et Suppr la retirent (rien d’autre ne l’ôterait une fois son texte effacé) et laissent le curseur à sa place, dans le paragraphe ; une valeur seule dans son paragraphe le laisse vide',
    run: async (h) => {
      await seed(h);
      const results = {};
      for (const key of ['Backspace', 'Delete']) {
        Editor.setHTML('<p>Avant ' + val('', COND_URGENT) + ' après</p>');
        await h.sleep(60);
        const start = valueNodes()[0].pos;
        caretInValue(0);
        pressKey(key);
        await h.sleep(40);
        results[key] = { html: Editor.getHTML(), count: valueNodes().length, at: ed().state.selection.from, expected: start, parent: ed().state.selection.$from.parent.type.name };
      }
      Editor.setHTML('<p>' + val('') + '</p><p>Suite</p>');
      await h.sleep(60);
      caretInValue(0);
      pressKey('Backspace');
      await h.sleep(40);
      const alone = { html: Editor.getHTML(), count: valueNodes().length };
      const pass = ['Backspace', 'Delete'].every(k => results[k].html === '<p>Avant  après</p>' && results[k].count === 0 && results[k].at === results[k].expected && results[k].parent === 'paragraph')
        && alone.count === 0 && alone.html === '<p></p><p>Suite</p>';
      return { pass, notes: JSON.stringify({ results, alone }) };
    },
  });

  cases.push({
    id: 'condvalue_deleting_all_the_text_keeps_the_empty_value_and_its_condition',
    description: 'Une suppression qui vide la valeur (le dernier caractère, un mot entier) la laisse vide, avec sa condition et son texte d’attente - le navigateur, sinon, retirait la balise vide : l’événement est repris (beforeinput) quand sa cible est tout le contenu d’une valeur, jamais pour une partie',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('mot <strong>gras</strong>', COND_URGENT) + ' après</p>');
      await h.sleep(60);
      ed().commands.focus();
      const root = document.querySelector('.tiptap');
      const span = () => document.querySelector('.tiptap .conditional-value');
      const fire = (inputType, ranges) => {
        const ev = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'getTargetRanges', { value: () => ranges });
        root.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      // Une partie du contenu : le navigateur fait comme d'habitude (rien n'est repris ici).
      const text = span().firstChild;
      const partial = { prevented: fire('deleteContentBackward', [{ startContainer: text, startOffset: 0, endContainer: text, endOffset: 2 }]), html: Editor.getHTML() };
      // Tout le contenu, borné par l'élément : repris, la valeur reste vide, le curseur dedans (la sélection était sur le contenu, comme avant un Retour arrière).
      const content = valueNodes()[0];
      ed().commands.setTextSelection({ from: content.pos + 1, to: content.pos + 1 + content.node.content.size });
      const whole = { prevented: fire('deleteContentBackward', [{ startContainer: span(), startOffset: 0, endContainer: span(), endOffset: span().childNodes.length }]) };
      await h.sleep(40);
      whole.html = Editor.getHTML();
      whole.count = valueNodes().length;
      whole.inside = selectionInValue() && ed().state.selection.empty && ed().state.selection.from === valueNodes()[0].pos + 1;
      whole.placeholder = getComputedStyle(span(), '::before').content;
      // Tout le contenu, borné par ses textes (la forme que prend Retour arrière sur le dernier caractère).
      Editor.setHTML('<p>Avant ' + val('x', COND_URGENT) + ' après</p>');
      await h.sleep(60);
      const lone = span().firstChild;
      const last = { prevented: fire('deleteContentBackward', [{ startContainer: lone, startOffset: 0, endContainer: lone, endOffset: 1 }]) };
      await h.sleep(40);
      last.html = Editor.getHTML();
      // Une suppression qui déborde de la valeur ou qui n'en est pas une : laissée au navigateur.
      Editor.setHTML('<p>Avant ' + val('mot', COND_URGENT) + ' après</p>');
      await h.sleep(60);
      const before = document.querySelector('.tiptap p').firstChild;
      const outside = { prevented: fire('deleteContentBackward', [{ startContainer: before, startOffset: 3, endContainer: span(), endOffset: span().childNodes.length }]) };
      const typed = { prevented: fire('insertText', [{ startContainer: span(), startOffset: 0, endContainer: span(), endOffset: span().childNodes.length }]) };
      const pass = !partial.prevented && partial.html === '<p>Avant ' + val('mot <strong>gras</strong>', COND_URGENT) + ' après</p>'
        && whole.prevented && whole.html === '<p>Avant ' + val('', COND_URGENT) + ' après</p>' && whole.count === 1 && whole.inside && whole.placeholder === '"valeur"'
        && last.prevented && last.html === '<p>Avant ' + val('', COND_URGENT) + ' après</p>'
        && !outside.prevented && !typed.prevented;
      return { pass, notes: JSON.stringify({ partial, whole, last, outside, typed }) };
    },
  });

  cases.push({
    id: 'condvalue_arrow_right_at_the_end_and_arrow_left_at_the_start_leave_the_value_and_typing_goes_next_to_it',
    description: 'Flèche droite à la fin d’une valeur et flèche gauche à son début font sortir le curseur de la valeur (sans bouger à l’écran) : la frappe suivante se pose derrière ou devant son cadre, Entrée coupe le paragraphe derrière elle - la flèche passait au paragraphe suivant et un point tapé pour finir la phrase entrait dans la valeur ; au milieu, avec une sélection ou avec Maj, la flèche suit son cours',
    run: async (h) => {
      await seed(h);
      const root = document.querySelector('.tiptap');
      const arrow = (key, init) => { const ev = new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, init)); root.dispatchEvent(ev); return ev.defaultPrevented; };
      // La frappe du navigateur, par sa seule voie `beforeinput` : reprise (le texte entre dans le document, le navigateur n'y touche pas) ou laissée à lui.
      const type = text => { const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }); root.dispatchEvent(ev); return ev.defaultPrevented; };
      const where = () => { const s = ed().state.selection; return { from: s.from, parent: s.$from.parent.type.name, before: s.$from.nodeBefore ? s.$from.nodeBefore.type.name : null, after: s.$from.nodeAfter ? s.$from.nodeAfter.type.name : null }; };
      const out = {};

      // Une valeur en fin de paragraphe : flèche droite, puis un point.
      const end = '<p>Merci de régler ' + val('avant ce soir', COND_URGENT) + '</p><p>Suite</p>';
      Editor.setHTML(end);
      await h.sleep(60);
      const endAt = valueNodes()[0].pos + valueNodes()[0].node.nodeSize;
      caretInValue(0);
      out.rightEnd = { consumed: arrow('ArrowRight'), at: where(), expected: endAt };
      out.rightEnd.typed = type('.');
      await h.sleep(40);
      out.rightEnd.html = Editor.getHTML();
      out.rightEnd.next = type('!');
      out.rightEnd.caret = ed().state.selection.from;
      // Entrée derrière la valeur coupe le paragraphe : la valeur reste dans le premier, aucun retour à la ligne n'y entre.
      Editor.setHTML(end);
      await h.sleep(60);
      caretInValue(0);
      arrow('ArrowRight');
      pressKey('Enter');
      await h.sleep(60);
      out.enter = Editor.getHTML();

      // Au milieu d'une phrase : la virgule se pose juste derrière le cadre, avant l'espace qui suit.
      Editor.setHTML('<p>Avant ' + val('mot', COND_URGENT) + ' après</p>');
      await h.sleep(60);
      caretInValue(0);
      out.rightMiddle = { consumed: arrow('ArrowRight'), typed: type(',') };
      await h.sleep(40);
      out.rightMiddle.html = Editor.getHTML();

      // Au début : flèche gauche, puis un texte devant le cadre (la valeur ouvre le paragraphe).
      Editor.setHTML('<p>' + val('Urgent', COND_URGENT) + ' : dossier</p>');
      await h.sleep(60);
      caretInValue(0, 0);
      out.leftStart = { consumed: arrow('ArrowLeft'), at: where(), expected: 1, typed: type('Note ') };
      await h.sleep(40);
      out.leftStart.html = Editor.getHTML();

      // Ailleurs la flèche suit son cours : au milieu, avec Maj, avec une sélection, à l'autre bord (flèche gauche à la fin, flèche droite au début), hors valeur.
      Editor.setHTML('<p>Avant ' + val('mot', COND_URGENT) + ' après</p>');
      await h.sleep(60);
      const valueAt = valueNodes()[0].pos;
      caretInValue(0, 1);
      const middle = { right: arrow('ArrowRight'), left: arrow('ArrowLeft'), at: ed().state.selection.from, inside: selectionInValue() };
      caretInValue(0);
      const shift = { right: arrow('ArrowRight', { shiftKey: true }) };
      const farEnd = { left: arrow('ArrowLeft'), inside: selectionInValue() };
      caretInValue(0, 0);
      const farStart = { right: arrow('ArrowRight'), inside: selectionInValue() };
      const content = valueNodes()[0];
      ed().commands.setTextSelection({ from: content.pos + 2, to: content.pos + 1 + content.node.content.size });
      const selected = { right: arrow('ArrowRight') };
      cursorIn('Avant', 2);
      const outside = { right: arrow('ArrowRight'), left: arrow('ArrowLeft'), typed: type('x') };
      out.elsewhere = { middle, shift, farEnd, farStart, selected, outside };

      // Dans une valeur dans une valeur : la sortie se fait d'un cadre à la fois, la frappe suivante reste dans le cadre extérieur.
      Editor.setHTML('<p>' + val('Dehors ' + val('dedans', COND_NORMAL), COND_URGENT) + '</p>');
      await h.sleep(60);
      const inner = valueNodes()[1];
      ed().commands.setTextSelection(inner.pos + 1 + inner.node.content.size);
      out.nested = { consumed: arrow('ArrowRight'), at: where(), typed: type('!') };
      await h.sleep(40);
      out.nested.html = Editor.getHTML();

      // Deux valeurs côte à côte : sortir de la première, c'est être entre elles.
      Editor.setHTML('<p>' + val('a', COND_URGENT) + val('b', COND_NORMAL) + '</p>');
      await h.sleep(60);
      caretInValue(0);
      out.between = { consumed: arrow('ArrowRight'), at: where(), typed: type('-') };
      await h.sleep(40);
      out.between.html = Editor.getHTML();

      const pass = out.rightEnd.consumed && out.rightEnd.at.parent === 'paragraph' && out.rightEnd.at.before === 'conditionalValue' && out.rightEnd.at.from === out.rightEnd.expected
        && out.rightEnd.typed && out.rightEnd.html === '<p>Merci de régler ' + val('avant ce soir', COND_URGENT) + '.</p><p>Suite</p>'
        // La frappe d'après n'est plus reprise : le curseur n'est plus contre la valeur, le navigateur tape comme d'habitude.
        && out.rightEnd.next === false
        && out.enter === '<p>Merci de régler ' + val('avant ce soir', COND_URGENT) + '</p><p></p><p>Suite</p>'
        && out.rightMiddle.consumed && out.rightMiddle.typed && out.rightMiddle.html === '<p>Avant ' + val('mot', COND_URGENT) + ', après</p>'
        && out.leftStart.consumed && out.leftStart.at.parent === 'paragraph' && out.leftStart.at.after === 'conditionalValue' && out.leftStart.at.from === out.leftStart.expected
        && out.leftStart.typed && out.leftStart.html === '<p>Note ' + val('Urgent', COND_URGENT) + ' : dossier</p>'
        && middle.right === false && middle.left === false && middle.inside && middle.at === valueAt + 2
        && shift.right === false
        && farEnd.left === false && farEnd.inside
        && farStart.right === false && farStart.inside
        && selected.right === false
        && outside.right === false && outside.left === false && outside.typed === false
        && out.nested.consumed && out.nested.at.parent === 'conditionalValue' && out.nested.at.before === 'conditionalValue' && out.nested.typed
        && out.nested.html === '<p>' + val('Dehors ' + val('dedans', COND_NORMAL) + '!', COND_URGENT) + '</p>'
        && out.between.consumed && out.between.at.before === 'conditionalValue' && out.between.at.after === 'conditionalValue' && out.between.typed
        && out.between.html === '<p>' + val('a', COND_URGENT) + '-' + val('b', COND_NORMAL) + '</p>';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Barre flottante d'une valeur ===
  cases.push({
    id: 'condvalue_caret_in_a_value_opens_the_variable_toolbar_with_three_buttons_greyed',
    description: 'Le curseur dans une valeur - ou la valeur sélectionnée - ouvre la barre des variables au-dessus d’elle : condition active (bleue) si posée, « Autres attributs » et « Boucle » grisés - pas retirés - avec leur raison en info-bulle, « Colonne » absente (elle n’est là que sur une variable cassée), sans réglage nombre, date ni case ; elle se ferme quand la sélection quitte la valeur ou la déborde',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Début</p><p>Avant ' + val('Premier mot', COND_URGENT) + ' et ' + val('libre') + ' après</p><p>Fin</p>');
      await h.sleep(80);
      const hiddenBefore = !visible(toolbar());
      caretInValue(0, 3);
      await h.sleep(120);
      const withCondition = barState();
      const valueRect = valueEls()[0].getBoundingClientRect();
      const barRect = toolbar().getBoundingClientRect();
      // Posée au-dessus de la valeur, en face d'elle.
      const anchored = barRect.bottom <= valueRect.top + 2 && barRect.left <= valueRect.right && barRect.right >= valueRect.left;
      caretInValue(1, 2);
      await h.sleep(120);
      const withoutCondition = barState();
      const grey = s => s.linked.disabled && s.linked.aria === 'true' && !s.linked.active && s.loop.disabled && s.loop.aria === 'true' && !s.loop.active && s.column.hidden
        && s.linked.title === I18n.t('varToolbar.notForValue') && s.loop.title === I18n.t('varToolbar.loopValue')
        && s.numberHidden && s.dateHidden && s.boolHidden;
      // La valeur sélectionnée en entier ouvre la même barre.
      ed().commands.setNodeSelection(valueNodes()[0].pos);
      await h.sleep(120);
      const nodeSelected = barState();
      // Un curseur hors des valeurs, puis une sélection qui part du paragraphe et entre dans la valeur : barre fermée.
      cursorIn('Fin');
      await h.sleep(100);
      const closedOutside = !visible(toolbar());
      const first = valueNodes()[0];
      ed().commands.setTextSelection({ from: first.pos - 3, to: first.pos + 4 });
      await h.sleep(100);
      const closedOverflow = !visible(toolbar());
      const pass = hiddenBefore && withCondition.visible && withCondition.condition.active && !withCondition.condition.disabled && withCondition.condition.title === I18n.t('varToolbar.condition')
        && grey(withCondition) && withoutCondition.visible && !withoutCondition.condition.active && grey(withoutCondition) && anchored
        && nodeSelected.visible && nodeSelected.condition.active && grey(nodeSelected) && closedOutside && closedOverflow;
      return { pass, notes: JSON.stringify({ hiddenBefore, withCondition, withoutCondition, nodeSelected, anchored, closedOutside, closedOverflow, bar: barRect.toJSON(), value: valueRect.toJSON() }) };
    },
  });

  cases.push({
    id: 'condvalue_greyed_toolbar_buttons_open_nothing_and_a_variable_inside_a_value_keeps_its_own_toolbar',
    description: 'Un clic sur « Autres attributs » ou « Boucle » grisés d’une valeur n’ouvre aucune fenêtre et ne change ni la valeur ni la sélection ; une bulle de variable DANS une valeur, sélectionnée, garde sa barre à elle (réglage nombre pour une colonne nombre, boutons actifs, sans « Colonne » tant qu’elle n’est pas cassée), puis la barre de la valeur revient au curseur dans son texte',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + val('Montant ' + badgeHtml('Montant') + ' et ' + badgeHtml('Responsable'), COND_URGENT) + '</p><p>Fin</p>');
      await h.sleep(80);
      const source = Editor.getHTML();
      caretInValue(0, 2);
      await h.sleep(120);
      const selectionBefore = ed().state.selection.from;
      ['var-linked', 'var-loop'].forEach(pressToolbarButton);
      await h.sleep(80);
      const open = { linked: VariableLinkedAttrs.isOpen(), loop: VariableLoop.isOpen(), condition: VariableCondition.isOpen() };
      const unchanged = Editor.getHTML() === source && ed().state.selection.from === selectionBefore && visible(toolbar());
      const badgePos = column => { let found = -1; ed().state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === 'varBadge' && node.attrs.column === column) found = pos; }); return found; };
      ed().commands.setNodeSelection(badgePos('Montant'));
      await h.sleep(120);
      const onNumber = barState();
      ed().commands.setNodeSelection(badgePos('Responsable'));
      await h.sleep(120);
      const onRef = barState();
      caretInValue(0, 2);
      await h.sleep(120);
      const backOnValue = barState();
      const pass = !open.linked && !open.loop && !open.condition && unchanged
        && onNumber.visible && !onNumber.numberHidden && onNumber.linked.title !== I18n.t('varToolbar.notForValue') && onNumber.column.hidden
        && onRef.visible && !onRef.linked.disabled && onRef.linked.title === I18n.t('varToolbar.linked') && onRef.column.hidden
        && backOnValue.visible && backOnValue.numberHidden && backOnValue.linked.disabled && backOnValue.linked.title === I18n.t('varToolbar.notForValue') && backOnValue.condition.active && backOnValue.column.hidden;
      return { pass, notes: JSON.stringify({ open, unchanged, onNumber, onRef, backOnValue }) };
    },
  });

  // === Fenêtre de condition d'une valeur ===
  cases.push({
    id: 'condvalue_condition_window_saves_keeps_the_caret_in_the_value_and_removes',
    description: 'La fenêtre de condition (la même que celle d’une bulle) s’ouvre sur une valeur avec son introduction, dit si la valeur s’affiche pour la ligne courante, enregistre sur la valeur (info-bulle, bleu de la barre, HTML) en laissant le curseur dedans et la barre ouverte, se rouvre sur ce qui est posé ; « Retirer la condition » la supprime et un Annuler la rend',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>');
      await h.sleep(80);
      let modal = await openValueWindow(h, 0, 2);
      const opened = {
        open: VariableCondition.isOpen(), intro: modal.querySelector('.var-modal-intro').textContent, pill: !!modal.querySelector('.var-modal-intro .var-badge'),
        removeHidden: modal.querySelector('.var-modal-danger').hidden, rows: windowRulesOf(modal).length,
      };
      const debug = await saveCondition(h, 'Statut', 'Urgent');
      const saved = valueNodes()[0].node.attrs.condition;
      const el = valueEls()[0];
      const afterSave = {
        closed: !VariableCondition.isOpen(), has: el.classList.contains('has-condition'), title: el.title, caret: selectionInValue() && ed().state.selection.empty && ed().state.selection.$from.parentOffset === 2,
        htmlHasCondition: Editor.getHTML().indexOf('data-condition') !== -1,
      };
      await h.sleep(60);
      const barActive = visible(toolbar()) && barButton('var-condition').active;
      // Plus de 500 ms entre les deux modifications : l'historique les groupe sinon en une seule (un seul « Annuler » reviendrait avant l'enregistrement).
      await h.sleep(650);
      modal = await openValueWindow(h, 0, 2);
      const reopened = { rules: windowRulesOf(modal), removeHidden: modal.querySelector('.var-modal-danger').hidden };
      modal.querySelector('.var-modal-danger').click();
      await h.sleep(80);
      const afterRemove = { condition: valueNodes()[0].node.attrs.condition, html: Editor.getHTML(), closed: !VariableCondition.isOpen(), title: valueEls()[0].title };
      ed().commands.undo();
      await h.sleep(60);
      const afterUndo = valueNodes()[0].node.attrs.condition;
      const pass = opened.open && opened.intro === I18n.t('varCond.introValue') && !opened.pill && opened.removeHidden && opened.rows === 1
        && debug[0] === I18n.t('varCond.debug.currentMetValue', { id: 1 }) && JSON.stringify(saved) === JSON.stringify(COND_URGENT)
        && afterSave.closed && afterSave.has && afterSave.title === I18n.t('condValue.titleIf', { condition: 'Statut = Urgent' }) && afterSave.caret && afterSave.htmlHasCondition && barActive
        && reopened.rules.length === 1 && reopened.rules[0].column === 'Statut' && reopened.rules[0].operator === '=' && reopened.rules[0].value === 'Urgent' && !reopened.removeHidden
        && afterRemove.condition == null && afterRemove.html.indexOf('data-condition') === -1 && afterRemove.closed && afterRemove.title === I18n.t('condValue.titleNone')
        && JSON.stringify(afterUndo) === JSON.stringify(COND_URGENT);
      return { pass, notes: JSON.stringify({ opened, debug, saved, afterSave, barActive, reopened, afterRemove, afterUndo }) };
    },
  });

  cases.push({
    id: 'condvalue_condition_window_says_when_the_value_is_hidden_and_offers_the_columns_of_a_variable',
    description: 'Pour une ligne qui ne remplit pas la condition, l’aperçu de la fenêtre dit que la valeur est masquée (« la valeur s’affiche » sinon) ; les colonnes proposées sont celles de la fenêtre d’une bulle de la même page, dans le même ordre',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Titre') + ' ' + val('Texte') + '</p>');
      await h.sleep(80);
      const optionsOf = modal => Array.from(modal.querySelectorAll('.macro-rule-row select.macro-rule-column option')).map(o => o.value);
      let badge = -1;
      ed().state.doc.descendants((node, pos) => { if (badge < 0 && node.type.name === 'varBadge') badge = pos; });
      ed().commands.setNodeSelection(badge);
      await h.sleep(120);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      const forBadge = optionsOf(conditionModal());
      cancelWindow(conditionModal());
      await h.sleep(40);
      const modal = await openValueWindow(h, 0, 1);
      const forValue = optionsOf(modal);
      const debug = await saveCondition(h, 'Statut', 'Normal');
      const pass = forBadge.length > 3 && JSON.stringify(forBadge) === JSON.stringify(forValue) && forValue.indexOf('Statut') !== -1 && forValue.some(c => /^CvLignes\./.test(c))
        && debug[0] === I18n.t('varCond.debug.currentNotMetValue', { id: 1 }) && debug[0] === 'Ligne sélectionnée (n° 1) : condition non remplie, la valeur est masquée.'
        && /^Première : n° 2/.test(debug[1] ? debug[1].replace(/^.*?(?=Première)/, '') : '');
      return { pass, notes: JSON.stringify({ forBadge, forValue, debug }) };
    },
  });

  cases.push({
    id: 'condvalue_condition_copy_and_paste_between_a_variable_and_a_value',
    description: 'Copier la condition d’une bulle et la coller dans la fenêtre d’une valeur (et l’inverse) : la phrase de « Coller » parle de la valeur ou de la variable, rien n’est écrit avant « Enregistrer »',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Titre', COND_URGENT) + ' ' + badgeHtml('Statut') + ' ' + val('Texte') + '</p>');
      await h.sleep(80);
      const clipButtons = modal => { const b = Array.from(modal.querySelectorAll('.var-condition-clip button')); return { copy: b[0], paste: b[1] }; };
      const badgePos = column => { let found = -1; ed().state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === 'varBadge' && node.attrs.column === column) found = pos; }); return found; };
      const openBadgeWindow = async column => { ed().commands.setNodeSelection(badgePos(column)); await h.sleep(120); pressToolbarButton('var-condition'); await h.sleep(80); return conditionModal(); };
      let modal = await openBadgeWindow('Titre');
      clipButtons(modal).copy.click();
      cancelWindow(modal);
      await h.sleep(40);
      modal = await openValueWindow(h, 0, 1);
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toValue = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent, stored: valueNodes()[0].node.attrs.condition };
      modal.querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(80);
      const valueSaved = valueNodes()[0].node.attrs.condition;
      // De la valeur vers une autre bulle.
      modal = await openValueWindow(h, 0, 1);
      clipButtons(modal).copy.click();
      cancelWindow(modal);
      await h.sleep(40);
      modal = await openBadgeWindow('Statut');
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toBadge = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent };
      cancelWindow(modal);
      const pass = JSON.stringify(toValue.rules) === JSON.stringify(COND_URGENT.rules) && toValue.status === I18n.t('varCond.clip.pastedStatusValue') && toValue.stored == null
        && JSON.stringify(valueSaved) === JSON.stringify(COND_URGENT)
        && JSON.stringify(toBadge.rules) === JSON.stringify(COND_URGENT.rules) && toBadge.status === I18n.t('varCond.clip.pastedStatus');
      return { pass, notes: JSON.stringify({ toValue, valueSaved, toBadge }) };
    },
  });

  cases.push({
    id: 'condvalue_english_interface_placeholder_title_toolbar_and_window',
    description: 'Interface en anglais : texte d’attente (« value »), info-bulle (« Shown if Statut = Urgent. »), barre et fenêtre de condition en anglais - sans clé manquante, dans les deux langues - puis retour au français',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte', COND_URGENT) + ' et ' + val('') + ' après</p>');
      await h.sleep(80);
      const lang = I18n.getLang();
      let seen = null;
      const keys = ['chips.conditionalValue', 'condValue.placeholder', 'condValue.titleNone', 'condValue.titleIf', 'varToolbar.notForValue', 'varToolbar.loopValue', 'varCond.introValue',
        'varCond.debug.currentMetValue', 'varCond.debug.currentNotMetValue', 'varCond.saveLostValue', 'varCond.unwrapValue', 'varCond.unwrapValueTitle', 'varCond.unwrapLostValue', 'varCond.clip.pastedStatusValue'];
      const missing = { fr: keys.filter(k => I18n.t(k) === k) };
      try {
        I18n.setLang('en');
        await h.sleep(80);
        missing.en = keys.filter(k => I18n.t(k) === k);
        const placeholder = getComputedStyle(valueEls()[1], '::before').content;
        const titles = valueEls().map(v => v.title);
        const modal = await openValueWindow(h, 0, 1);
        const intro = modal.querySelector('.var-modal-intro').textContent;
        const unwrap = { text: unwrapButton(modal) ? unwrapButton(modal).textContent : null, title: unwrapButton(modal) ? unwrapButton(modal).title : null };
        const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
        cancelWindow(modal);
        await h.sleep(40);
        caretInValue(0, 1);
        await h.sleep(120);
        const bar = barState();
        seen = { placeholder, titles, intro, debug, linked: bar.linked.title, loop: bar.loop.title, unwrap };
      } finally { I18n.setLang(lang); }
      await h.sleep(80);
      const titlesFr = valueEls().map(v => v.title);
      const pass = seen && seen.placeholder === '"value"' && /^Shown if Statut = Urgent\./.test(seen.titles[0]) && /^Conditional value with no condition/.test(seen.titles[1])
        && /^This value only appears in read mode/.test(seen.intro) && seen.debug[0] === 'Selected row (#1): condition met, the value is shown.'
        && seen.linked === 'Available for a variable, not for a conditional value' && /^Available for a variable linked to several rows/.test(seen.loop)
        && seen.unwrap.text === 'Unwrap value' && /^Removes the frame and the condition/.test(seen.unwrap.title)
        && /^S’affiche si Statut = Urgent\./.test(titlesFr[0]) && /^Valeur conditionnelle sans condition/.test(titlesFr[1])
        && missing.fr.length === 0 && missing.en.length === 0;
      return { pass: !!pass, notes: JSON.stringify({ seen, titlesFr, missing }) };
    },
  });

  // === « Défaire la valeur » (fenêtre de condition : le texte reste, le cadre et la condition partent) ===
  const afterFirstParagraph = html => html.slice(html.indexOf('</p>') + 4);
  cases.push({
    id: 'condvalue_window_unwrap_button_keeps_the_text_drops_the_frame_and_one_undo_brings_it_back',
    description: '« Défaire la valeur » (à côté de « Retirer la condition », avec une info-bulle) : le cadre et la condition disparaissent, tout le texte reste à sa place - les valeurs emboîtées gardent leur condition -, la fenêtre se ferme, le curseur est au début du texte libéré, et un Annuler rend la valeur avec sa condition',
    run: async (h) => {
      await seed(h);
      const inner = val(' (urgent)', COND_NORMAL);
      const original = '<p>Avant ' + val('Un <strong>mot</strong>' + inner, COND_URGENT) + ' après</p><p>Fin</p>';
      Editor.setHTML(original);
      // Plus de 500 ms avant la modification : l'historique la groupe sinon avec le chargement du document (un seul « Annuler » reviendrait avant lui).
      await h.sleep(650);
      const modal = await openValueWindow(h, 0, 1);
      const button = unwrapButton(modal);
      const opened = { footer: footerLabels(modal), title: button && button.title, firstDanger: modal.querySelector('.var-modal-danger').textContent };
      if (!button) return { pass: false, notes: JSON.stringify({ opened }) };
      button.click();
      await h.sleep(100);
      const selection = ed().state.selection;
      const after = {
        html: Editor.getHTML(), closed: !VariableCondition.isOpen() && !visible(conditionModal()), values: valueNodes().length,
        caret: selection.empty && selection.toJSON().type === 'text' && selection.$from.parent.type.name === 'paragraph' && selection.$from.parentOffset === 'Avant '.length,
        focus: !!document.activeElement && !!document.activeElement.closest('.tiptap'),
      };
      await h.clickButton('v2-btn-undo');
      await h.sleep(120);
      const undone = { html: Editor.getHTML(), condition: valueNodes()[0] && valueNodes()[0].node.attrs.condition };
      await h.clickButton('v2-btn-redo');
      await h.sleep(120);
      const redone = Editor.getHTML();
      const pass = JSON.stringify(opened.footer) === JSON.stringify([I18n.t('varCond.remove'), I18n.t('varCond.unwrapValue'), I18n.t('common.cancel'), I18n.t('common.save')])
        && opened.firstDanger === I18n.t('varCond.remove') && opened.title === I18n.t('varCond.unwrapValueTitle')
        && after.html === '<p>Avant Un <strong>mot</strong>' + inner + ' après</p><p>Fin</p>' && after.closed && after.values === 1 && after.caret && after.focus
        && undone.html === original && JSON.stringify(undone.condition) === JSON.stringify(COND_URGENT) && redone === after.html;
      return { pass, notes: JSON.stringify({ opened, after, undone, redone }) };
    },
  });

  cases.push({
    id: 'condvalue_window_unwrap_button_is_only_for_values_and_needs_no_condition',
    description: 'La fenêtre d’une bulle n’a pas « Défaire la valeur » (ses boutons ne bougent pas) ; celle d’une valeur sans condition l’a, sans « Retirer la condition » ; défaire une valeur emboîtée laisse la valeur qui l’entoure, puis défaire celle-ci ne laisse que le texte',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Dossier ' + badgeHtml('Titre', COND_URGENT) + '</p><p>Un ' + val('deux ' + val('trois')) + ' fin</p>');
      await h.sleep(80);
      let badge = -1;
      ed().state.doc.descendants((node, pos) => { if (badge < 0 && node.type.name === 'varBadge') badge = pos; });
      ed().commands.setNodeSelection(badge);
      await h.sleep(120);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      let modal = conditionModal();
      const forBadge = { footer: footerLabels(modal), hidden: unwrapButton(modal).hidden };
      cancelWindow(modal);
      await h.sleep(40);
      modal = await openValueWindow(h, 1, 1);
      const forInner = { footer: footerLabels(modal), removeHidden: modal.querySelector('.var-modal-danger').hidden, unwrapHidden: unwrapButton(modal).hidden };
      unwrapButton(modal).click();
      await h.sleep(100);
      const afterInner = afterFirstParagraph(Editor.getHTML());
      modal = await openValueWindow(h, 0, 1);
      unwrapButton(modal).click();
      await h.sleep(100);
      const afterOuter = afterFirstParagraph(Editor.getHTML());
      const pass = JSON.stringify(forBadge.footer) === JSON.stringify([I18n.t('varCond.remove'), I18n.t('common.cancel'), I18n.t('common.save')]) && forBadge.hidden === true
        && JSON.stringify(forInner.footer) === JSON.stringify([I18n.t('varCond.unwrapValue'), I18n.t('common.cancel'), I18n.t('common.save')]) && forInner.removeHidden === true && forInner.unwrapHidden === false
        && afterInner === '<p>Un ' + val('deux trois') + ' fin</p>' && afterOuter === '<p>Un deux trois fin</p>' && valueNodes().length === 0;
      return { pass, notes: JSON.stringify({ forBadge, forInner, afterInner, afterOuter }) };
    },
  });

  cases.push({
    id: 'condvalue_unwrap_and_save_do_nothing_and_warn_when_the_value_is_gone',
    description: 'Défaire une valeur vide la retire ; si la valeur a disparu ou changé de place pendant que la fenêtre est ouverte, « Défaire la valeur » comme « Enregistrer » ne touchent à rien : l’alerte le dit et la fenêtre se ferme ; la fonction rend faux sur une position qui ne porte pas une valeur',
    run: async (h) => {
      await seed(h);
      const html = '<p>Avant ' + val('Texte', COND_URGENT) + ' après</p><p>Fin</p>';
      Editor.setHTML(html);
      await h.sleep(80);
      const refusals = [ConditionalValue.unwrap(ed(), 0), ConditionalValue.unwrap(ed(), ed().state.doc.content.size), ConditionalValue.unwrap(ed(), 3)];
      const unchanged = Editor.getHTML() === html;
      Editor.setHTML('<p>Avant ' + val('') + ' après</p>');
      await h.sleep(80);
      const emptied = { done: ConditionalValue.unwrap(ed(), valueNodes()[0].pos), html: Editor.getHTML() };
      const realAlert = window.alert;
      const alerts = [];
      window.alert = message => { alerts.push(String(message)); };
      const outcomes = {};
      try {
        for (const what of ['unwrap', 'save']) {
          Editor.setHTML(html);
          await h.sleep(80);
          const modal = await openValueWindow(h, 0, 1);
          // La valeur disparaît pendant que la fenêtre est ouverte (elle garde sa position d'ouverture).
          const found = valueNodes()[0];
          ed().view.dispatch(ed().state.tr.delete(found.pos, found.pos + found.node.nodeSize));
          if (what === 'unwrap') unwrapButton(modal).click(); else modal.querySelector('.var-modal-actions .var-modal-primary').click();
          await h.sleep(100);
          outcomes[what] = { alerts: alerts.slice(), closed: !VariableCondition.isOpen(), html: Editor.getHTML() };
          alerts.length = 0;
        }
      } finally { window.alert = realAlert; }
      const pass = refusals.every(r => r === false) && unchanged && emptied.done === true && emptied.html === '<p>Avant  après</p>'
        && outcomes.unwrap.alerts.length === 1 && outcomes.unwrap.alerts[0] === I18n.t('varCond.unwrapLostValue') && outcomes.unwrap.closed && outcomes.unwrap.html === '<p>Avant  après</p><p>Fin</p>'
        && outcomes.save.alerts.length === 1 && outcomes.save.alerts[0] === I18n.t('varCond.saveLostValue') && outcomes.save.closed && outcomes.save.html === '<p>Avant  après</p><p>Fin</p>';
      return { pass, notes: JSON.stringify({ refusals, unchanged, emptied, outcomes }) };
    },
  });

  // === Mode suivi ===
  cases.push({
    id: 'condvalue_suggest_mode_insert_type_wrap_and_whole_deletion_are_tracked_and_accepting_or_refusing_all_is_exact',
    description: 'En mode suivi : poser une valeur et y taper se suit, « Tout accepter » rend la valeur avec son texte et « Tout refuser » le document d’avant ; entourer un texte se suit (ancien texte barré, valeur insérée) ; supprimer une valeur entière se suit et « Tout accepter » la retire AVEC sa condition (aucune valeur vide ne reste)',
    run: async (h) => {
      await seed(h);
      const ed0 = ed();
      const results = {};
      let suggest = false;
      const track = async (original, act) => {
        ed0.commands.loadTrackedDocument(original);
        if (!suggest) { ed0.commands.toggleSuggestMode(); suggest = true; }
        await h.sleep(80);
        const done = await act();
        await h.sleep(80);
        const tracked = Editor.getHTML();
        const accepted = (() => { ed0.commands.acceptAllSuggestionsChunked(); return null; })();
        await h.sleep(150);
        const acceptedHtml = Editor.getHTML();
        ed0.commands.loadTrackedDocument(original);
        await h.sleep(60);
        await act();
        await h.sleep(80);
        ed0.commands.rejectAllSuggestionsChunked();
        await h.sleep(150);
        return { done, accepted: acceptedHtml, rejected: Editor.getHTML(), tracked: tracked.slice(0, 500), marked: /<ins|<del/.test(tracked) };
      };
      try {
        results.typed = await track('<p>Alpha</p><p>Beta</p>', async () => {
          cursorIn('Beta');
          const picked = await insertViaPanel(h, true);
          await h.typeText('bon');
          return picked;
        });
        results.wrapped = await track('<p>Alpha</p><p>Beta gamma delta</p>', async () => {
          selectText('gamma');
          const started = ConditionalText.startFromSelection(ed0);
          await h.sleep(100);
          return started && await pickEntry(h);
        });
        const source = '<p>Alpha ' + val('Beta', COND_URGENT) + ' delta</p><p>Fin</p>';
        results.deleted = await track(source, async () => {
          ed0.commands.setNodeSelection(valueNodes()[0].pos);
          await h.sleep(60);
          ed0.commands.deleteSelection();
          return true;
        });
        results.deletedSource = source;
      } finally { if (suggest) ed0.commands.toggleSuggestMode(); }
      const { typed, wrapped, deleted } = results;
      const pass = typed.done && typed.marked && /^<p>Alpha<\/p><p>Beta <span class="conditional-value">bon<\/span><\/p>$/.test(typed.accepted) && typed.rejected === '<p>Alpha</p><p>Beta</p>'
        && wrapped.done && wrapped.marked && wrapped.accepted === '<p>Alpha</p><p>Beta ' + val('gamma') + ' delta</p>' && wrapped.rejected === '<p>Alpha</p><p>Beta gamma delta</p>'
        && deleted.done && deleted.marked && deleted.accepted === '<p>Alpha  delta</p><p>Fin</p>' && deleted.rejected === results.deletedSource;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'condvalue_suggest_mode_unwrap_is_tracked_accepting_gives_the_text_alone_and_refusing_the_value',
    description: 'En mode suivi, « Défaire la valeur » se suit : l’ancienne valeur est barrée et son texte inséré à côté ; « Tout accepter » rend le texte seul, « Tout refuser » la valeur avec sa condition',
    run: async (h) => {
      await seed(h);
      const ed0 = ed();
      const original = '<p>Alpha ' + val('Beta <strong>gamma</strong>', COND_URGENT) + ' delta</p><p>Fin</p>';
      const results = {};
      let suggest = false;
      try {
        for (const verdict of ['accept', 'reject']) {
          ed0.commands.loadTrackedDocument(original);
          if (!suggest) { ed0.commands.toggleSuggestMode(); suggest = true; }
          await h.sleep(80);
          const done = ConditionalValue.unwrap(ed0, valueNodes()[0].pos);
          await h.sleep(80);
          const tracked = Editor.getHTML();
          if (verdict === 'accept') ed0.commands.acceptAllSuggestionsChunked(); else ed0.commands.rejectAllSuggestionsChunked();
          await h.sleep(150);
          results[verdict] = { done, struck: /<span class="conditional-value"[^>]*><del[^>]*>Beta /.test(tracked), inserted: /<ins[^>]*>Beta <strong>gamma<\/strong><\/ins>/.test(tracked), html: Editor.getHTML(), tracked: tracked.slice(0, 600) };
        }
      } finally { if (suggest) ed0.commands.toggleSuggestMode(); }
      const pass = results.accept.done && results.accept.struck && results.accept.inserted && results.accept.html === '<p>Alpha Beta <strong>gamma</strong> delta</p><p>Fin</p>'
        && results.reject.done && results.reject.html === original;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  // === Lecture, aperçu d'export, PDF et Word ===
  cases.push({
    id: 'condvalue_reader_true_condition_unwraps_the_value_false_removes_it_and_the_sentence_stays',
    description: 'Lecture et aperçu d’export : condition remplie, le cadre disparaît et le texte reste au fil de la phrase, sans rien ajouter autour ; non remplie, la valeur et tout son contenu disparaissent, le texte autour reste ; une valeur seule dans son paragraphe masquée laisse sa ligne (comme une bulle masquée)',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Dossier' + val(' urgent', COND_URGENT) + val(' normal', COND_NORMAL) + ' à traiter</p><p>Avant</p><p>' + val('Seule', COND_NORMAL) + '</p><p>Après</p>';
        const reader1 = await renderReader(html);
        const read1 = { shape: shape(reader1), frames: framesIn(reader1) };
        const prev1 = await previewHtml(html);
        await setRecord(h, RECORD_2);
        const reader2 = await renderReader(html);
        const read2 = { shape: shape(reader2), frames: framesIn(reader2) };
        const prev2 = await previewHtml(html);
        const pass = read1.shape === 'p:Dossier urgent à traiter | p:Avant | p: | p:Après' && read1.frames === 0 && shape(prev1) === read1.shape && framesIn(prev1) === 0
          && read2.shape === 'p:Dossier normal à traiter | p:Avant | p:Seule | p:Après' && read2.frames === 0 && shape(prev2) === read2.shape && framesIn(prev2) === 0
          && reader1.querySelector('p').innerHTML === 'Dossier urgent à traiter';
        return { pass, notes: JSON.stringify({ read1, read2, prev1: shape(prev1), prev2: shape(prev2) }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reader_nested_values_follow_their_own_condition_and_a_hidden_outer_hides_all',
    description: 'Valeurs emboîtées : chacune suit sa condition ; une valeur extérieure masquée emporte celles qu’elle contient, même dont la condition est remplie ; une valeur extérieure affichée laisse chaque valeur intérieure à son verdict ; une valeur dans un bloc conditionnel suit son bloc puis sa condition',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>A' + val(' dehors normal' + val(' dedans urgent', COND_URGENT) + ' fin normal', COND_NORMAL)
          + val(' x' + val(' y normal', COND_NORMAL) + val(' z urgent' + val(' tout dedans libre'), COND_URGENT), COND_URGENT) + '</p>'
          + block('<p>B' + val(' urgent', COND_URGENT) + val(' normal', COND_NORMAL) + '</p>', COND_URGENT);
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const pass = read1 === 'p:A x z urgent tout dedans libre | p:B urgent' && read2 === 'p:A dehors normal fin normal';
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reader_value_without_condition_is_shown_and_an_unreadable_one_is_hidden_like_a_variable',
    description: 'Sans condition (ou sans règle complète) la valeur s’affiche toujours ; une condition illisible ou sur une colonne qui n’existe pas la masque, comme une bulle ; une valeur vide n’écrit rien',
    run: async (h) => {
      try {
        await seed(h);
        const unknown = { mode: 'all', rules: [{ column: 'Inexistante', operator: '=', value: 'x' }] };
        const html = '<p>[' + val('libre') + '][' + val('sans règle', { mode: 'all', rules: [] }) + '][<span class="conditional-value" data-condition="{pas du json">illisible</span>][' + val('colonne inconnue', unknown)
          + '][' + val('') + '] ' + badgeHtml('Titre', unknown) + '|</p>';
        const read = shape(await renderReader(html));
        const pass = read === 'p:[libre][sans règle][][][] |';
        return { pass, notes: JSON.stringify({ read }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reader_variables_marks_and_a_checkbox_inside_a_value',
    description: 'Une valeur contient des variables - conditionnelles comprises -, du gras et une case conditionnelle : à l’affichage, la valeur de chaque variable est écrite, le gras et la case sont gardés, une variable à condition non remplie disparaît seule, indépendamment de la condition de la valeur ; masquée, tout part avec la valeur',
    run: async (h) => {
      try {
        await seed(h);
        const box = '<span class="conditional-checkbox" data-checkbox-style="classic">☐</span>';
        const html = '<p>[' + val(badgeHtml('Titre') + ' ' + badgeHtml('Titre', COND_NORMAL) + ' <strong>gras</strong> ' + box, COND_URGENT) + '][' + val(badgeHtml('Titre'), COND_NORMAL) + ']</p>';
        const reader1 = await renderReader(html);
        const read1 = { shape: shape(reader1), bold: Array.from(reader1.querySelectorAll('strong')).map(s => s.textContent), boxes: reader1.querySelectorAll('.resolved-checkbox').length };
        await setRecord(h, RECORD_2);
        const reader2 = await renderReader(html);
        const read2 = { shape: shape(reader2), bold: reader2.querySelectorAll('strong').length, boxes: reader2.querySelectorAll('.resolved-checkbox').length };
        // La variable à condition non remplie (« Normal ») disparaît seule : « Dossier A », une espace, « gras », la case ; la valeur « Normal » est masquée en entier.
        const pass = /^p:\[Dossier A\s+gras[^\]]*\]\[\]$/.test(read1.shape) && read1.bold.length === 1 && read1.bold[0] === 'gras' && read1.boxes === 1
          && read2.shape === 'p:[][Dossier B]' && read2.bold === 0 && read2.boxes === 0;
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reader_value_in_a_list_item_a_heading_and_a_table_cell',
    description: 'Dans un élément de liste, un titre et une case de tableau, la valeur se résout comme dans un paragraphe : texte gardé quand la condition est remplie, retiré sinon, sans toucher à la structure',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<ul><li><p>un' + val(' urgent', COND_URGENT) + '</p></li></ul><h2>Titre' + val(' normal', COND_NORMAL) + '</h2>'
          + '<table><tbody><tr><td><p>case' + val(' urgente', COND_URGENT) + '</p></td><td><p>case' + val(' normale', COND_NORMAL) + '</p></td></tr></tbody></table>';
        const read = reader => ({
          li: reader.querySelector('li').textContent.trim(), h2: reader.querySelector('h2').textContent.trim(),
          cells: Array.from(reader.querySelectorAll('td')).map(td => td.textContent.trim()), frames: framesIn(reader),
        });
        const read1 = read(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = read(await renderReader(html));
        const pass = read1.li === 'un urgent' && read1.h2 === 'Titre' && JSON.stringify(read1.cells) === JSON.stringify(['case urgente', 'case']) && read1.frames === 0
          && read2.li === 'un' && read2.h2 === 'Titre normal' && JSON.stringify(read2.cells) === JSON.stringify(['case', 'case normale']) && read2.frames === 0;
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reader_value_inside_a_repeated_row_reads_the_row_of_its_turn',
    description: 'Une valeur dans une ligne de tableau répétée (boucle sur une table liée) lit la ligne de son tour : une condition sur une colonne de la table parcourue n’affiche son texte que pour les lignes qui la remplissent',
    run: async (h) => {
      try {
        await seed(h);
        const loop = { repeat: 'row', table: 'CvLignes', empty: 'header' };
        const designation = `<span class="var-badge" data-table="CvLignes" data-column="Designation" data-key="CvLignes.Designation"${attr('data-loop', loop)} data-loop-repeat="row"></span>`;
        const bigQuantity = { mode: 'all', rules: [{ column: 'CvLignes.Qte', operator: '>', value: '5' }] };
        const html = '<table><tbody><tr><th><p>Désignation</p></th><th><p>Remarque</p></th></tr>'
          + '<tr><td><p>' + designation + '</p></td><td><p>Remarque : ' + val('gros volume', bigQuantity) + '</p></td></tr></tbody></table>';
        const reader = await renderReader(html);
        const rows = Array.from(reader.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()).join(' | '));
        const pass = JSON.stringify(rows) === JSON.stringify(['Désignation | Remarque', 'Audit | Remarque :', 'Livret | Remarque : gros volume', 'Déplacement | Remarque :']) && framesIn(reader) === 0;
        return { pass, notes: JSON.stringify({ rows }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_condition_on_a_linked_table_column_holds_if_any_linked_row_does',
    description: 'Condition d’une valeur sur une colonne d’une table liée : remplie si une des lignes liées la remplit (même règle que pour une bulle ou un bloc), fausse pour une ligne sans ligne liée',
    run: async (h) => {
      try {
        await seed(h);
        const big = { mode: 'all', rules: [{ column: 'CvLignes.Qte', operator: '>', value: '10' }] };
        const huge = { mode: 'all', rules: [{ column: 'CvLignes.Qte', operator: '>', value: '100' }] };
        const html = '<p>x' + val(' gros', big) + val(' énorme', huge) + '</p>';
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const pass = read1 === 'p:x gros' && read2 === 'p:x';
        return { pass, notes: JSON.stringify({ read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_header_and_footer_values_are_resolved_in_reading_and_in_exports',
    description: 'Une valeur dans l’en-tête ou le pied de page se résout comme dans le corps : affichage en Lecture (aperçu A4) et zones préparées pour le PDF et le Word',
    run: async (h) => {
      try {
        await seed(h);
        h.setA4Preview(true);
        const hf = {
          enabled: true, differentFirstPage: false,
          header: { default: '<p>En-tête' + val(' urgent', COND_URGENT) + val(' normal', COND_NORMAL) + '</p>', first: '' },
          footer: { default: '<p>Pied' + val(' normal', COND_NORMAL) + val(' urgent', COND_URGENT) + '</p>', first: '' },
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
        const pass = headerText === 'En-tête urgent' && headerFrames === 0 && shape(box) === 'p:Pied urgent' && shape(headerBox) === 'p:En-tête urgent' && framesIn(box) === 0 && framesIn(headerBox) === 0;
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
    id: 'condvalue_pdf_and_word_files_follow_the_value_condition_of_each_row',
    description: 'Les vrais fichiers : le PDF et le Word d’une ligne ne contiennent que les valeurs dont la condition est remplie pour cette ligne, sans cadre, au fil de la phrase et dans les cases de tableau',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Dossier' + val(' urgent', COND_URGENT) + val(' normal', COND_NORMAL) + ' à traiter</p>'
          + '<table><tbody><tr><td><p>Case' + val(' urgente', COND_URGENT) + '</p></td><td><p>Case' + val(' normale', COND_NORMAL) + '</p></td></tr></tbody></table><p>Fin</p>';
        await PdfExport.ensurePdfLibsLoaded();
        await DocxExport.ensureDocxLibLoaded();
        const out = {};
        for (const [key, record] of [['urgent', RECORD_1], ['normal', RECORD_2]]) {
          out['pdf_' + key] = await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, TABLE, record, '', NO_HF, undefined)).blob);
          out['docx_' + key] = await docxBodyParagraphs((await DocxExport.getDocxBlobForRecord(html, TABLE, record, '', NO_HF, null)).blob);
        }
        const nonEmpty = list => list.filter(t => t !== '');
        const pass = out.pdf_urgent === 'Dossier urgent à traiter Case urgente Case Fin' && out.pdf_normal === 'Dossier normal à traiter Case Case normale Fin'
          && JSON.stringify(nonEmpty(out.docx_urgent)) === JSON.stringify(['Dossier urgent à traiter', 'Case urgente', 'Case', 'Fin'])
          && JSON.stringify(nonEmpty(out.docx_normal)) === JSON.stringify(['Dossier normal à traiter', 'Case', 'Case normale', 'Fin']);
        return { pass, notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condvalue_reading_keeps_comment_positions_of_the_text_in_a_shown_value',
    description: 'Commentaires en Lecture : le texte d’une valeur affichée garde ses repères de position (le texte retrouvé à ces positions est le bon), celui d’une valeur masquée disparaît avec elle',
    run: async (h) => {
      try {
        await seed(h);
        Editor.setHTML('<p>Avant ' + val('visible', COND_URGENT) + ' et ' + val('masquée', COND_NORMAL) + ' après</p>');
        await h.sleep(80);
        const tagged = await Comments.buildReaderHtml();
        const reader = await renderReader(tagged);
        const marks = Array.from(reader.querySelectorAll('[data-pp-pos]')).map(span => {
          const raw = span.getAttribute('data-pp-pos');
          const pos = Number(raw.slice(raw.indexOf(':') + 1));
          return { text: span.textContent, found: ed().state.doc.textBetween(pos, pos + span.textContent.length) };
        });
        const texts = marks.map(m => m.text).join('|');
        const pass = marks.length === 4 && marks.every(m => m.text === m.found) && texts === 'Avant |visible| et | après' && framesIn(reader) === 0;
        return { pass, notes: JSON.stringify({ marks, shape: shape(reader) }) };
      } finally { closeReader(); }
    },
  });

  // === Géométrie, copier-coller ===
  const sheetZoom = () => {
    const sheet = document.querySelector('#editor-container .v2-page-sheet');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / sheetZoom();
  const r1 = n => Math.round(n * 10) / 10;
  const LONG = 'Un texte assez long pour passer à la ligne dans la phrase, comme à la Lecture et à l’export. '.repeat(10).trim();

  // Un texte qui tient JUSTE sur une ligne dans la largeur d'un paragraphe (une lettre de plus et il passe à la ligne) : « fits » et « over ». C'est là que le moindre écart de largeur
  // entre l'éditeur et l'export se verrait (un cadre qui élargirait le texte d'un pixel le ferait passer à la ligne un cran trop tôt).
  async function textsAroundOneLine(h) {
    const heightOf = async text => { Editor.setHTML('<p>' + text + '</p>'); await h.sleep(30); return layoutHeight(h.tiptap().querySelector('p')); };
    const oneLine = await heightOf('mot');
    const words = n => Array.from({ length: n }, (_, i) => ['mot', 'un', 'chat', 'très', 'a'][i % 5]).join(' ');
    let lo = 1, hi = 400;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await heightOf(words(mid)) <= oneLine + 1) lo = mid; else hi = mid; }
    let letters = 0;
    while (letters < 40 && await heightOf(words(lo) + ' ' + 'x'.repeat(letters + 1)) <= oneLine + 1) letters++;
    return { oneLine, fits: words(lo) + ' ' + 'x'.repeat(letters), over: words(lo) + ' ' + 'x'.repeat(letters + 1) };
  }

  cases.push({
    id: 'condvalue_frame_does_not_change_the_text_width_so_the_editor_wraps_like_the_export',
    description: 'Le cadre de la valeur n’ajoute ni marge ni largeur au texte : une phrase dont une partie - ou tout - est dans une valeur (avec ou sans condition) passe à la ligne exactement là où la même phrase sans valeur (même hauteur), pour un long texte, pour un texte qui tient juste sur une ligne et pour celui qui la dépasse d’une lettre',
    run: async (h) => {
      await seed(h);
      const { oneLine, fits, over } = await textsAroundOneLine(h);
      const results = {};
      for (const [name, text] of [['long', LONG], ['fits', fits], ['over', over]]) {
        const half = Math.floor(text.length / 2);
        Editor.setHTML('<p>' + text + '</p><p>' + val(text) + '</p><p>' + val(text, COND_URGENT) + '</p><p>' + text.slice(0, half) + val(text.slice(half), COND_URGENT) + '</p><p>Fin</p>');
        await h.sleep(100);
        results[name] = Array.from(document.querySelectorAll('.tiptap p')).filter(p => p.textContent === text).map(p => { const r = p.getBoundingClientRect(); const z = sheetZoom(); return { left: r1(r.left / z), height: r1(r.height / z) }; });
      }
      const same = (a, b) => Math.abs(a.left - b.left) <= 0.5 && Math.abs(a.height - b.height) <= 0.5;
      const allSame = list => list.length === 4 && list.every(x => same(list[0], x));
      const lines = (r, n) => Math.abs(r.height - n * oneLine) <= 1;
      const pass = allSame(results.long) && Math.round(results.long[0].height / oneLine) >= 3 && allSame(results.fits) && results.fits.every(r => lines(r, 1)) && allSame(results.over) && results.over.every(r => lines(r, 2));
      return { pass, notes: JSON.stringify({ oneLine, results }) };
    },
  });

  cases.push({
    id: 'condvalue_value_is_small_by_default_and_grows_with_its_text_and_line_breaks',
    description: 'Une valeur est petite par défaut (vide : la largeur de son texte d’attente, sans prendre la ligne) et son cadre grandit à mesure qu’on y écrit : plus large avec le texte - il passe à la ligne comme la phrase, sans déborder de la page -, plus haut à chaque retour à la ligne',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Début</p><p>Avant ' + val('', COND_URGENT) + ' après</p><p>Fin</p>');
      await h.sleep(120);
      const pageWidth = r1(h.tiptap().querySelector('p').getBoundingClientRect().width / sheetZoom());
      const el = () => h.tiptap().querySelectorAll('.conditional-value')[0];
      const size = () => { const rects = Array.from(el().getClientRects()); const r = el().getBoundingClientRect(); return { w: r1(r.width / sheetZoom()), h: r1(r.height / sheetZoom()), lines: rects.length }; };
      const typeAtEnd = async content => {
        const { pos, node } = valueNodes()[0];
        ed().chain().setTextSelection(pos + 1 + node.content.size).insertContent(content).run();
        await h.sleep(60);
        return size();
      };
      const step = {};
      step.empty = size();
      step.word = await typeAtEnd('350 €');
      step.sentence = await typeAtEnd(' à régler avant la fin du mois, sans autre formalité, merci');
      step.wrapped = await typeAtEnd(' ' + LONG);
      Editor.setHTML('<p>Début</p><p>Avant ' + val('Un', COND_URGENT) + ' après</p><p>Fin</p>');
      await h.sleep(120);
      step.oneLine = size();
      ed().chain().setTextSelection(valueNodes()[0].pos + 1 + 2).setHardBreak().insertContent('Deux lignes plus longues que la première').run();
      await h.sleep(60);
      step.twoLines = size();
      ed().chain().setHardBreak().insertContent('Trois').run();
      await h.sleep(60);
      step.threeLines = size();
      const pass = step.empty.w >= 25 && step.empty.w <= pageWidth / 4 && step.empty.lines === 1
        && step.word.w >= 20 && step.sentence.w > step.word.w + 80 && step.sentence.w < pageWidth - 20
        && step.wrapped.lines >= 3 && step.wrapped.w <= pageWidth + 1 && step.wrapped.h > step.sentence.h + 20
        && step.twoLines.h >= step.oneLine.h + 15 && step.threeLines.h >= step.twoLines.h + 15;
      return { pass, notes: JSON.stringify({ pageWidth, step }) };
    },
  });

  cases.push({
    id: 'condvalue_copy_and_paste_of_a_value_keeps_its_condition_content_and_nesting',
    description: 'Copier un texte qui contient une valeur (avec une valeur emboîtée et une variable) et le coller ailleurs recrée les valeurs avec leur condition et leur contenu ; une valeur sélectionnée seule se colle de même',
    run: async (h) => {
      await seed(h);
      const source = '<p>Avant ' + val('Dossier ' + badgeHtml('Titre') + val(' interne', COND_NORMAL), COND_URGENT) + ' après</p><p>Suite</p><p></p>';
      Editor.setHTML(source);
      await h.sleep(80);
      ed().commands.setTextSelection({ from: 1, to: 1 + ed().state.doc.firstChild.content.size });
      const copied = ed().view.serializeForClipboard(ed().state.selection.content()).dom.innerHTML;
      const last = ed().state.doc.content.size - 1;
      ed().commands.setTextSelection(last);
      ed().view.focus();
      ed().view.pasteHTML(copied);
      await h.sleep(120);
      const afterParagraph = valueNodes().map(n => JSON.stringify(n.node.attrs.condition));
      ed().commands.setNodeSelection(valueNodes()[0].pos);
      const single = ed().view.serializeForClipboard(ed().state.selection.content()).dom.innerHTML;
      ed().commands.setTextSelection(ed().state.doc.content.size - 1);
      ed().view.pasteHTML(single);
      await h.sleep(120);
      const conditions = valueNodes().map(n => JSON.stringify(n.node.attrs.condition));
      const pass = afterParagraph.length === 4 && afterParagraph[0] === JSON.stringify(COND_URGENT) && afterParagraph[1] === JSON.stringify(COND_NORMAL)
        && afterParagraph[2] === JSON.stringify(COND_URGENT) && afterParagraph[3] === JSON.stringify(COND_NORMAL)
        && conditions.length === 6 && conditions[4] === JSON.stringify(COND_URGENT) && conditions[5] === JSON.stringify(COND_NORMAL)
        && Editor.getHTML().split('data-key="CvDossiers.Titre"').length === 4 && copied.indexOf('class="conditional-value"') !== -1;
      return { pass, notes: JSON.stringify({ afterParagraph, conditions, copied: copied.slice(0, 240) }) };
    },
  });

  // === Renommages faits dans Grist (js/schema-renames.js) ===
  cases.push({
    id: 'condvalue_follows_a_column_renamed_in_grist_like_the_condition_of_a_block',
    description: 'Une colonne renommée dans Grist suit dans la condition d’une valeur conditionnelle, comme dans celle d’un bloc (js/schema-renames.js) : colonne sans nom de table, colonne « Table.Colonne », valeur dans un bloc ; le texte et les marques de la valeur, et une condition sur une colonne qui n’a pas changé, ne bougent pas',
    run: async () => {
      // Hier : CvDossiers (Titre, Montant) ; aujourd'hui : Montant s'appelle Total.
      const m = SchemaRenames.createMapper(
        { f: 1, t: { 1: [TABLE, { 1: 'Titre', 2: 'Montant' }] } },
        { f: 1, t: { 1: [TABLE, { 1: 'Titre', 2: 'Total' }] } },
        {}
      );
      const ctx = { page: m.tableContext(TABLE), trigger: Variables.triggerChar() };
      const rule = column => ({ mode: 'all', rules: [{ column, operator: '>', value: '100' }] });
      const html = '<p>Montant ' + val('<strong>élevé</strong>', rule('Montant')) + ' ' + val('qualifié', rule(TABLE + '.Montant')) + ' ' + val('stable', rule('Titre')) + '</p>'
        + block('<p>Bloc ' + val('dedans', rule('Montant')) + '</p>', rule('Montant'));
      const out = SchemaRenames.rewriteHtml(html, m, ctx);
      const box = document.createElement('div');
      box.innerHTML = out.html;
      const values = Array.from(box.querySelectorAll('.conditional-value'));
      const columns = values.map(el => JSON.parse(el.getAttribute('data-condition')).rules[0].column);
      const texts = values.map(el => el.innerHTML);
      const blockColumn = JSON.parse(box.querySelector('.conditional-text').getAttribute('data-condition')).rules[0].column;
      const untouched = val('stable', rule('Titre'));
      const same = SchemaRenames.rewriteHtml(untouched, m, ctx);
      const pass = out.count === 4 && JSON.stringify(columns) === JSON.stringify(['Total', TABLE + '.Total', 'Titre', 'Total']) && blockColumn === 'Total'
        && JSON.stringify(texts) === JSON.stringify(['<strong>élevé</strong>', 'qualifié', 'stable', 'dedans'])
        && same.count === 0 && same.html === untouched;
      return { pass, notes: JSON.stringify({ count: out.count, columns, texts, blockColumn, same }) };
    },
  });

  // L'AUTRE colonne d'une règle (bouton « autre colonne » du champ Valeur), choisie comme une personne dans son champ avec recherche.
  async function pickOtherColumn(h, row, name) {
    const wrap = row.querySelector('.macro-rule-value-slot .macro-rule-column-wrap');
    wrap.querySelector('.ss-trigger').click();
    await h.sleep(30);
    const input = wrap.querySelector('.ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }

  // === Une règle qui compare à une autre colonne : la fenêtre est celle des bulles, avec le même bouton (demande d'Antoine, 2026-10-08) ===
  cases.push({
    id: 'condvalue_condition_window_compares_with_another_column_and_the_reader_follows',
    description: 'La fenêtre d’une valeur a le bouton « autre colonne » des bulles : Montant = Paye (autre colonne) s’enregistre sur la valeur (info-bulle « Si Montant = {Paye} »), la Lecture et l’aperçu d’export gardent le texte dans la phrase pour la ligne où les deux colonnes s’accordent et le retirent pour l’autre',
    run: async (h) => {
      try {
        await seed(h);
        const stub = window.__gristStub;
        stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CvAnnuaire', Montant: 'Numeric', Paye: 'Numeric' });
        stub.setRows(TABLE, [
          { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, Paye: 1200 },
          { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50, Paye: 20 },
        ]);
        await GristAPI.refreshSchema();
        const rows = [Object.assign({}, RECORD_1, { Paye: 1200 }), Object.assign({}, RECORD_2, { Paye: 20 })];
        await setRecord(h, rows[0]);
        Editor.setHTML('<p>Dossier ' + val('urgent ') + 'à traiter</p>');
        await h.sleep(80);
        const modal = await openValueWindow(h, 0, 2);
        const row = modal.querySelector('.macro-rule-row');
        await pickColumn(h, row, 'Montant');
        const toggle = row.querySelector('.macro-rule-compare');
        if (!toggle) { cancelWindow(modal); return { pass: false, notes: 'bouton « autre colonne » absent de la fenêtre de la valeur' }; }
        toggle.click();
        await h.sleep(40);
        await pickOtherColumn(h, row, 'Paye');
        await h.sleep(700);
        const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
        modal.querySelector('.var-modal-actions .var-modal-primary').click();
        await h.sleep(80);
        const saved = valueNodes()[0].node.attrs.condition;
        const title = valueEls()[0].title;
        const html = Editor.getHTML();
        const read1 = shape(await renderReader(html));
        const prev1 = shape(await previewHtml(html));
        await setRecord(h, rows[1]);
        const read2 = shape(await renderReader(html));
        const prev2 = shape(await previewHtml(html));
        const pass = debug[0] === I18n.t('varCond.debug.currentMetValue', { id: 1 })
          && JSON.stringify(saved) === JSON.stringify({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: 'Paye' }] })
          && title === I18n.t('condValue.titleIf', { condition: 'Montant = {Paye}' })
          && read1 === 'p:Dossier urgent à traiter' && prev1 === read1 && read2 === 'p:Dossier à traiter' && prev2 === read2;
        return { pass, notes: JSON.stringify({ debug, saved, title, read1, prev1, read2, prev2 }) };
      } finally { closeReader(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condValue = cases;
})();
