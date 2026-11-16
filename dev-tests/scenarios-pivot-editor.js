// Suite "pivotEditor" - le tableau croisé de la grille, côté éditeur (étude d'Antoine du 12/11, lot 2 ; la Lecture est celle de la suite `pivotZone`, le moteur celui de `pivotUnit`) : la ligne qui le porte (attribut `pivot`,
// `data-pivot` dans le HTML du modèle), son cadre et son aperçu dans l'éditeur (js/pivot-editor.js), le bouton « Tableau croisé… » de la barre du tableau et la fenêtre de réglage (js/pivot-window.js).
//  1) l'attribut se relit tel qu'il est écrit, et le cadre n'est qu'une décoration (rien n'en reste dans le HTML) ; 2) le cadre montre le tableau calculé sur la ligne de la page, couvre la largeur de la ligne et la rend plus haute,
//     et se redessine quand la ligne de la page change ; 3) poser sur une ligne vide la prend, poser sur une ligne qui a du contenu en ajoute une juste après (le contenu reste) : un seul pas d'Annuler ;
//  4) retirer : un seul pas d'Annuler, la ligne reste ; 5) le bouton : allumé sur une ligne qui en porte un, grisé avec sa raison (plusieurs lignes, case fusionnée, tableau de document) ; la saisie y est refusée ;
//  6) la fenêtre : elle propose la table liée à la page, grise la source qui n'a pas de sens, dit ce qui manque, écrit la définition choisie ; Annuler n'écrit rien.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const tableNode = () => ed().state.doc.child(0);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const CATEGORIES = ['Visserie', 'Électricité', 'Plomberie'];
  const ZONES = ['Réserve', 'Picking', 'Quai'];
  const PRODUCTS = [
    [1, 'Plomberie', 1, 10, 2.5], [2, 'Visserie', 2, 100, 0.12], [3, 'Visserie', 1, 40, 0.3], [4, 'Électricité', 3, 8, 12.99], [5, 'Plomberie', 3, 3, 40],
    [6, 'Visserie', 1, 5, 1], [7, 'Électricité', 1, 20, 3.1], [8, 'Électricité', 3, 2, 70.5], [9, 'Plomberie', 2, 6, 9.9], [10, null, 2, 4, 5],
  ];
  const VALUE = { kind: 'formula', formula: '{PvProduits.Stock} * {PvProduits.PrixAchat}' };
  const DEF = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Categorie'], cols: ['Emplacement.Zone'], value: VALUE, agg: 'sum' };
  const LINKED_COUNT = { v: 1, source: { table: 'PvProduits', scope: 'linked' }, rows: ['Categorie'], cols: [], value: null, agg: 'count' };

  const attr = def => ` data-pivot="${JSON.stringify(def).replace(/"/g, '&quot;')}"`;
  const cell = (text, tag, extra) => `<${tag || 'td'}${extra || ''}><p>${text}</p></${tag || 'td'}>`;
  // Une grille de quatre colonnes : un titre fusionné, la ligne du tableau croisé (texte jamais lu), une ligne vide, une note.
  function gridHtml(def, withPivot) {
    const widths = [120, 90, 90, 90];
    const cells = text => widths.map((width, i) => `<td colwidth="${width}"><p>${i === 0 ? text : ''}</p></td>`).join('');
    return '<table><tbody>'
      + `<tr><th colspan="4" colwidth="${widths.join(',')}"><p><strong>Titre</strong></p></th></tr>`
      + `<tr${withPivot === false ? '' : attr(def)}>${cells(withPivot === false ? 'ligne vide' : 'texte jamais lu')}</tr>`
      + `<tr>${cells('')}</tr>`
      + `<tr>${cells('Note du bas')}</tr>`
      + '</tbody></table>';
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('PvEmplacements', { Zone: 'Choice' }, { Zone: ZONES });
    stub.setVariables('PvAtlas', { Nom: 'Text' });
    stub.setVariables('PvProduits', { Categorie: 'Choice', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: CATEGORIES, Zone: ZONES });
    stub.setRows('PvEmplacements', [{ id: 1, Zone: 'Réserve' }, { id: 2, Zone: 'Picking' }, { id: 3, Zone: 'Quai' }]);
    stub.setRows('PvAtlas', [{ id: 1, Nom: 'Atlas Nord' }, { id: 2, Nom: 'Atlas Sud' }]);
    stub.setRows('PvProduits', PRODUCTS.map(([id, Categorie, Emplacement, Stock, PrixAchat]) => ({ id, Categorie: Categorie || '', Emplacement, Stock, PrixAchat, manualSort: id, Atlas: id % 2 ? 1 : 2 })));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('PvProduits');
    await GristAPI.saveLinkRule('PvProduits', { mode: 'match', colonneCible: 'Atlas', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
    await h.sleep(60);
  }
  // Les mêmes gestes qu'une personne : « + » puis « Nouvelle grille », puis « Nouveau document » pour en sortir.
  async function enterGrid(h) {
    await seed(h);
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(150);
  }
  async function inGrid(h, body) {
    await enterGrid(h);
    try { return await body(); } finally { await leaveGrid(h); }
  }
  async function setGrid(html) {
    Editor.setHTML(html);
    await sleep(350);
  }

  // La position de la ligne `index` du tableau.
  function rowPos(index) {
    let pos = 1;
    for (let i = 0; i < index; i++) pos += tableNode().child(i).nodeSize;
    return pos;
  }
  async function cursorInRow(index, text) {
    ed().chain().focus().setTextSelection(rowPos(index) + 3).run();
    await sleep(120);
    return text;
  }
  const rowAttrs = () => Array.from({ length: tableNode().childCount }, (_, i) => tableNode().child(i).attrs.pivot || null);
  const rowTexts = () => Array.from({ length: tableNode().childCount }, (_, i) => tableNode().child(i).textContent);
  const defOf = text => (text ? JSON.parse(text) : null);
  const toNumber = text => { const clean = String(text).replace(/[\s  ]/g, '').replace(/[^0-9,.\-−]/g, '').replace('−', '-').replace(',', '.'); return clean === '' ? null : Number(clean); };
  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;

  function barButton() {
    const bar = Array.from(document.querySelectorAll('.v2-floating-toolbar')).find(node => node.querySelector('button[data-action="row-pivot"]'));
    return bar ? bar.querySelector('button[data-action="row-pivot"]') : null;
  }
  function barState() {
    const button = barButton();
    return button && { grey: button.classList.contains('is-disabled') && button.getAttribute('aria-disabled') === 'true', on: button.classList.contains('is-active'), title: button.title };
  }
  const miniRows = root => Array.from(root.querySelectorAll('table.pp-pivot-mini tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));

  // === 1) L'attribut et le cadre =======================================================================================================================================

  cases.push({
    id: 'pivot_row_attribute_round_trips_and_the_frame_is_only_a_decoration',
    description: 'La définition d’une ligne se relit telle qu’elle est écrite (`data-pivot`), une autre ligne n’en porte pas, et le cadre de l’éditeur n’est qu’une décoration : rien n’en reste dans le HTML du modèle.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(DEF));
      const html = Editor.getHTML();
      const written = /data-pivot="([^"]*)"/.exec(html);
      const back = written ? JSON.parse(written[1].replace(/&quot;/g, '"')) : null;
      const attrs = rowAttrs();
      const pass = !!back && same(back.rows, DEF.rows) && same(back.cols, DEF.cols) && back.source.table === 'PvProduits' && back.value.formula === VALUE.formula
        && attrs[0] === null && !!attrs[1] && attrs[2] === null && attrs[3] === null && (html.match(/data-pivot=/g) || []).length === 1
        && html.indexOf('pp-pivot') === -1;
      return { pass, notes: JSON.stringify({ attrs: attrs.map(a => !!a), count: (html.match(/data-pivot=/g) || []).length, decorationLeaked: html.indexOf('pp-pivot') !== -1 }) };
    }),
  });

  cases.push({
    id: 'pivot_row_shows_its_table_in_the_editor_and_follows_the_page_row',
    description: 'La ligne se montre comme son tableau : un cadre sur toute la largeur, plus haut que la ligne, avec l’étiquette, le bouton « Modifier » et le début du tableau calculé sur la ligne de la page ; il se redessine quand la ligne de la page change.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(LINKED_COUNT));
      await sleep(500);
      const out = {};
      const trs = Array.from(document.querySelectorAll('.tiptap table > tbody > tr'));
      const row = trs[1];
      const frame = row && row.querySelector('.pp-pivot-preview');
      out.marked = !!row && row.classList.contains('pp-pivot-row') && trs.filter(tr => tr.classList.contains('pp-pivot-row')).length === 1;
      out.inFirstCell = !!frame && frame.parentElement === row.firstElementChild;
      const table = document.querySelector('.tiptap table');
      out.widthOk = !!frame && Math.abs(frame.getBoundingClientRect().width - table.getBoundingClientRect().width) < 2;
      out.taller = !!row && row.getBoundingClientRect().height > trs[2].getBoundingClientRect().height + 60;
      out.coversRow = !!frame && Math.abs(frame.getBoundingClientRect().height - row.getBoundingClientRect().height) < 3;
      out.tag = frame ? frame.querySelector('.pp-pivot-title').textContent : '';
      out.edit = frame ? frame.querySelector('.pp-pivot-edit').textContent : '';
      out.north = frame ? miniRows(frame) : [];
      out.northMore = frame ? (frame.querySelector('.pp-pivot-note') || { textContent: '' }).textContent : '';
      window.__gristStub.fireRecord({ id: 2, Nom: 'Atlas Sud' }, 'PvAtlas');
      await sleep(900);
      const again = document.querySelector('.tiptap table > tbody > tr.pp-pivot-row .pp-pivot-preview');
      out.south = again ? miniRows(again) : [];
      out.southMore = again ? (again.querySelector('.pp-pivot-note') || { textContent: '' }).textContent : '';
      window.__gristStub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
      const labels = rows => rows.slice(1).map(r => r[0]);
      const totalOf = rows => { const last = rows[rows.length - 1]; return last ? toNumber(last[last.length - 1]) : null; };
      // Atlas Nord (produits impairs) : Visserie 1, Électricité 1, Plomberie 3, total 5 ; Atlas Sud (pairs) : Visserie 2, Électricité 2, (vide) 1, total 5.
      const pass = out.marked && out.inFirstCell && out.widthOk && out.taller && out.coversRow && out.tag.indexOf('Categorie') !== -1 && out.edit === I18n.t('pivot.zone.edit')
        && same(labels(out.north), ['Visserie', 'Électricité', 'Total']) && totalOf(out.north) === 5 && out.northMore === I18n.t('pivot.zone.more', { count: 1 })
        && same(labels(out.south), ['Visserie', 'Électricité', 'Total']) && totalOf(out.south) === 5 && out.southMore === I18n.t('pivot.zone.more', { count: 1 });
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  // === 2) Poser, retirer, un seul pas d'Annuler ========================================================================================================================

  cases.push({
    id: 'pivot_apply_takes_an_empty_row_or_adds_one_after_a_row_with_content_in_one_undo_step',
    description: 'Poser un tableau croisé sur une ligne vide la prend ; sur une ligne qui a du contenu, il prend une ligne neuve juste après et le contenu reste ; dans les deux cas un seul pas d’Annuler remet la grille comme elle était.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(DEF, false));
      const out = {};
      const editor = ed();
      const before = { count: tableNode().childCount, texts: rowTexts() };
      // Une ligne vide : la ligne 2.
      await cursorInRow(2);
      out.emptyStatus = PivotEditor.status(editor);
      out.emptyApplied = PivotEditor.apply(editor, rowPos(2), DEF);
      out.afterEmpty = { count: tableNode().childCount, attrs: rowAttrs().map(a => !!a) };
      editor.commands.undo();
      await sleep(120);
      out.undoEmpty = { count: tableNode().childCount, attrs: rowAttrs().map(a => !!a), texts: rowTexts() };
      // Une ligne qui a du contenu : la ligne 1 (« ligne vide » y est écrit, justement) et la ligne 3 (« Note du bas »).
      await cursorInRow(3);
      out.noteStatus = PivotEditor.status(editor);
      out.noteApplied = PivotEditor.apply(editor, rowPos(3), DEF);
      out.afterNote = { count: tableNode().childCount, attrs: rowAttrs().map(a => !!a), texts: rowTexts() };
      const added = tableNode().child(4);
      out.addedCells = added ? added.childCount : -1;
      out.sameShape = !!added && added.childCount === tableNode().child(3).childCount && added.textContent === '';
      editor.commands.undo();
      await sleep(120);
      out.undoNote = { count: tableNode().childCount, attrs: rowAttrs().map(a => !!a), texts: rowTexts() };
      const pass = out.emptyStatus.enabled && !out.emptyStatus.active && out.emptyApplied
        && out.afterEmpty.count === before.count && same(out.afterEmpty.attrs, [false, false, true, false])
        && out.undoEmpty.count === before.count && same(out.undoEmpty.attrs, [false, false, false, false]) && same(out.undoEmpty.texts, before.texts)
        && out.noteStatus.enabled && out.noteApplied
        && out.afterNote.count === before.count + 1 && same(out.afterNote.attrs, [false, false, false, false, true]) && out.afterNote.texts[3] === 'Note du bas' && out.sameShape
        && out.undoNote.count === before.count && same(out.undoNote.attrs, [false, false, false, false]) && same(out.undoNote.texts, before.texts);
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  cases.push({
    id: 'pivot_edit_and_remove_each_one_undo_step_and_the_row_stays',
    description: 'Modifier la définition d’une ligne, puis la retirer : chacun est un seul pas d’Annuler, et retirer laisse la ligne (vide de tableau croisé) en place.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(DEF));
      const editor = ed();
      const out = {};
      const edited = Object.assign({}, DEF, { rows: ['Emplacement.Zone'], cols: [] });
      out.edited = PivotEditor.apply(editor, rowPos(1), edited);
      out.afterEdit = { count: tableNode().childCount, rows: defOf(rowAttrs()[1]).rows };
      out.removed = PivotEditor.apply(editor, rowPos(1), null);
      out.afterRemove = { count: tableNode().childCount, attrs: rowAttrs().map(a => !!a) };
      out.removeAgain = PivotEditor.apply(editor, rowPos(1), null);
      editor.commands.undo();
      await sleep(120);
      out.undoRemove = { rows: defOf(rowAttrs()[1]) ? defOf(rowAttrs()[1]).rows : null };
      editor.commands.undo();
      await sleep(120);
      out.undoEdit = { rows: defOf(rowAttrs()[1]).rows };
      const garbage = PivotEditor.apply(editor, rowPos(1), { rows: [] });
      const pass = out.edited && same(out.afterEdit.rows, ['Emplacement.Zone']) && out.afterEdit.count === 4
        && out.removed && out.afterRemove.count === 4 && same(out.afterRemove.attrs, [false, false, false, false]) && out.removeAgain === false
        && same(out.undoRemove.rows, ['Emplacement.Zone']) && same(out.undoEdit.rows, ['Categorie']) && garbage === false;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  // === 3) Le bouton de la barre du tableau ============================================================================================================================

  cases.push({
    id: 'pivot_bar_button_is_lit_on_its_row_and_greyed_with_a_reason_elsewhere',
    description: '« Tableau croisé… » : disponible sur une ligne ordinaire, allumé sur une ligne qui en porte un, grisé avec sa raison sur plusieurs lignes et sur une ligne traversée par une fusion ; la saisie est refusée dans la ligne du tableau croisé.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(DEF));
      const out = {};
      const editor = ed();
      await cursorInRow(2);
      out.plain = barState();
      out.plainStatus = PivotEditor.status(editor).title;
      await cursorInRow(1);
      out.lit = barState();
      out.litStatus = PivotEditor.status(editor).title;
      out.typingRefused = !!editor.view.someProp('handleTextInput', f => f(editor.view, editor.state.selection.from, editor.state.selection.to, 'a'));
      await cursorInRow(2);
      out.typingAllowed = !editor.view.someProp('handleTextInput', f => f(editor.view, editor.state.selection.from, editor.state.selection.to, 'a'));
      // Plusieurs lignes : les cases de deux lignes.
      editor.chain().focus().setCellSelection({ anchorCell: rowPos(2) + 1, headCell: rowPos(3) + 1 }).run();
      await sleep(150);
      out.several = barState();
      out.severalTitle = PivotEditor.status(editor).title;
      // Une case fusionnée sur deux lignes.
      await setGrid('<table><tbody><tr><td rowspan="2"><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td></tr><tr><td><p>d</p></td><td><p>e</p></td></tr></tbody></table>');
      await cursorInRow(0);
      out.merged = barState();
      out.mergedTitle = PivotEditor.status(editor).title;
      await cursorInRow(2);
      out.beside = barState();
      const pass = !!out.plain && !out.plain.grey && !out.plain.on && out.plainStatus === I18n.t('table.pivot')
        && !!out.lit && !out.lit.grey && out.lit.on && out.litStatus === I18n.t('table.pivotOn') && out.typingRefused && out.typingAllowed
        && !!out.several && out.several.grey && out.severalTitle === I18n.t('table.pivotOne') && out.several.title === I18n.t('table.pivotOne')
        && !!out.merged && out.merged.grey && out.mergedTitle === I18n.t('table.pivotMerged') && !!out.beside && !out.beside.grey;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  cases.push({
    id: 'pivot_bar_button_is_greyed_in_a_document_table',
    description: 'Dans un tableau de document, le bouton reste dans la barre, grisé, avec « pour l’instant dans une grille seulement » : jamais retiré.',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p>Après</p>');
      await sleep(250);
      const editor = ed();
      editor.chain().focus().setTextSelection(4).run();
      await sleep(250);
      const state = barState();
      const status = PivotEditor.status(editor);
      const pass = !!state && state.grey && state.title === I18n.t('table.pivotDocument') && !status.enabled && status.title === I18n.t('table.pivotDocument');
      return { pass, notes: JSON.stringify({ state, status }) };
    },
  });

  // === 4) La fenêtre ==================================================================================================================================================

  const modal = () => document.getElementById('pp-pivot-modal');
  const visible = node => !!node && getComputedStyle(node).display !== 'none';
  const field = id => document.getElementById(id);
  function choose(select, value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const sources = () => Array.from(modal().querySelectorAll('.pp-pivot-source [role="radio"]')).map(b => ({ value: b.dataset.value, on: b.getAttribute('aria-checked') === 'true', grey: b.getAttribute('aria-disabled') === 'true', title: b.title }));
  const okButton = () => modal().querySelector('.var-modal-primary');
  const cancelButton = () => modal().querySelector('.pp-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
  const removeButton = () => modal().querySelector('.var-modal-danger');

  cases.push({
    id: 'pivot_window_proposes_the_linked_table_greys_the_source_without_meaning_and_writes_the_chosen_definition',
    description: 'La fenêtre propose d’abord la table liée à la page et ses lignes liées, grise (sans la retirer) la source qui n’a pas de sens pour la table choisie, dit ce qui manque, montre l’aperçu avec la ligne de la page et écrit la définition choisie en un seul pas d’Annuler ; Annuler n’écrit rien.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(DEF, false));
      const editor = ed();
      const out = {};
      await cursorInRow(2);
      barButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(400);
      out.opened = visible(modal());
      out.title = modal().querySelector('h3').textContent;
      out.table = field('pp-pivot-table').value;
      out.sourcesLinked = sources();
      out.removeHidden = removeButton().hidden;
      out.okText = okButton().textContent;
      // Rien n'est choisi : l'enregistrement dit ce qui manque, rien n'est écrit.
      okButton().click();
      await sleep(200);
      out.missing = modal().querySelector('.pp-pivot-status').textContent;
      out.stillOpen = visible(modal());
      out.untouched = same(rowAttrs(), [null, null, null, null]);
      // La page : aucune ligne n'y est liée à elle-même, sa vue ou toute la table.
      choose(field('pp-pivot-table'), 'PvAtlas');
      await sleep(150);
      out.sourcesPage = sources();
      choose(field('pp-pivot-table'), 'PvProduits');
      await sleep(150);
      choose(field('pp-pivot-row1'), 'Categorie');
      await sleep(60);
      // Un Calcul, comme une bulle, additionné pour les lignes liées à Atlas Nord.
      modal().querySelector('.pp-pivot-seg [data-value="calc"]').click();
      await sleep(80);
      const calc = field('pp-pivot-calc');
      calc.value = '#PvProduits.Stock * #PvProduits.PrixAchat';
      calc.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(700);
      out.preview = miniRows(modal());
      const total = out.preview.length ? out.preview[out.preview.length - 1] : [];
      const northValue = PRODUCTS.filter(p => p[0] % 2 === 1).reduce((sum, p) => sum + p[3] * p[4], 0);
      out.total = toNumber(total[total.length - 1]);
      out.northValue = northValue;
      okButton().click();
      await sleep(250);
      const written = defOf(rowAttrs()[2]);
      out.closed = !visible(modal());
      out.written = written && { source: written.source, rows: written.rows, cols: written.cols, value: written.value, agg: written.agg, totals: written.totals };
      out.count = tableNode().childCount;
      // Rouvrir sur cette ligne : la définition revient dans les champs, « Retirer » est là ; Annuler n'écrit rien.
      await cursorInRow(2);
      barButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(400);
      out.reopened = { table: field('pp-pivot-table').value, row: field('pp-pivot-row1').value, calc: field('pp-pivot-calc').value, remove: !removeButton().hidden, save: okButton().textContent };
      choose(field('pp-pivot-row1'), 'Emplacement');
      cancelButton().click();
      await sleep(200);
      out.afterCancel = defOf(rowAttrs()[2]).rows;
      editor.commands.undo();
      await sleep(150);
      out.afterUndo = same(rowAttrs(), [null, null, null, null]);
      const pass = out.opened && out.title === I18n.t('pivot.window.title') && out.table === 'PvProduits'
        && same(out.sourcesLinked.map(s => [s.value, s.on, s.grey]), [['linked', true, false], ['view', false, true], ['table', false, false]]) && out.sourcesLinked[1].title !== '' && out.removeHidden && out.okText === I18n.t('pivot.window.add')
        && out.missing === I18n.t('pivot.window.needRows') && out.stillOpen && out.untouched
        && same(out.sourcesPage.map(s => [s.value, s.on, s.grey]), [['linked', false, true], ['view', true, false], ['table', false, false]])
        && out.preview.length >= 3 && near(out.total, out.northValue)
        && out.closed && !!out.written && out.written.source.table === 'PvProduits' && out.written.source.scope === 'linked' && same(out.written.rows, ['Categorie']) && same(out.written.cols, [])
        && out.written.value.kind === 'formula' && out.written.value.formula === VALUE.formula && out.written.agg === 'sum' && out.count === 4
        && out.reopened.table === 'PvProduits' && out.reopened.row === 'Categorie' && out.reopened.calc === '#PvProduits.Stock * #PvProduits.PrixAchat' && out.reopened.remove && out.reopened.save === I18n.t('pivot.window.save')
        && same(out.afterCancel, ['Categorie']) && out.afterUndo;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  cases.push({
    id: 'pivot_window_removes_the_table_and_texts_follow_the_language',
    description: '« Retirer le tableau croisé » ôte l’attribut en un seul pas d’Annuler (la ligne reste) ; la fenêtre et le cadre de la ligne sont écrits dans la langue choisie, français comme anglais.',
    run: h => inGrid(h, async () => {
      await setGrid(gridHtml(LINKED_COUNT));
      const editor = ed();
      const out = {};
      try {
        I18n.setLang('en');
        await sleep(50);
        await cursorInRow(1);
        PivotWindow.open(editor, rowPos(1));
        await sleep(400);
        out.en = {
          title: modal().querySelector('h3').textContent, remove: removeButton().textContent, ok: okButton().textContent,
          labels: Array.from(modal().querySelectorAll('.pp-pivot-label')).map(l => l.textContent),
          agg: Array.from(field('pp-pivot-agg').options).map(o => o.textContent),
          source: sources().map(s => document.querySelector('#pp-pivot-modal [data-value="' + s.value + '"]').textContent),
        };
        removeButton().click();
        await sleep(250);
        out.removed = same(rowAttrs(), [null, null, null, null]) && tableNode().childCount === 4;
        editor.commands.undo();
        await sleep(150);
        out.back = defOf(rowAttrs()[1]) && defOf(rowAttrs()[1]).source.scope === 'linked';
      } finally { I18n.setLang('fr'); await sleep(100); }
      const english = out.en && out.en.title === 'Pivot table' && out.en.remove === 'Remove the pivot table' && out.en.ok === 'Save'
        && out.en.labels.indexOf('Table') !== -1 && out.en.labels.indexOf('Totals') !== -1 && same(out.en.agg, ['Sum', 'Count', 'Average', 'Minimum', 'Maximum'])
        && out.en.source[0].indexOf('linked to the page row') !== -1;
      const pass = !!english && out.removed && !!out.back;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pivotEditor = cases;
})();
