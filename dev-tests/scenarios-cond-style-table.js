// Suite "condStyleTable" - mise en forme conditionnelle d'une case ou d'une ligne de tableau, dans un document comme dans une grille (demande d'Antoine du 2026-11-06, inventaire des fonctions
// restantes ; ses choix du 2026-11-07 : « Case et ligne », « Document et Grille ensemble », « Comme dans Grist » pour une case, un petit repère dans l'éditeur). Attribut `condStyle`
// (`data-cond-style`) de `tableCell`, `tableHeader` et `tableRow` (js/editor-nodes.js:withCondStyle), résolution à la Lecture et aux exports (js/conditional-style.js:prepare : le fond sur
// la case, la couleur et les traits autour du texte), ligne du tour d'une ligne répétée (js/loop-rules.js:BOUND_SELECTOR), renommages (js/schema-renames.js), bouton de la barre du tableau
// (js/floating-toolbars.js, « cell-style ») et fenêtre (js/conditional-style-window.js:openTable). La vraie souris à 700 × 400 est dans verify-cond-style-table-mouse.mjs.
(function () {
  const cases = [];

  const TABLE = 'CtDossiers';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const ROWS = [
    { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 },
    { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 },
  ];
  const RED = '#b91c1c';
  const BLUE = '#1d4ed8';
  const FILL = '#fff2a8';
  const GREEN_FILL = '#bbf7d0';
  const MANUAL = '#fecaca';
  const GREY = '#e5e7eb';
  const rule = (column, operator, value) => ({ mode: 'all', rules: [{ column, operator, value }] });
  const BIG = rule('Montant', '>', '1000');
  const URGENT = rule('Statut', '=', 'Urgent');
  const spec = (...rules) => ({ rules: rules.map(([condition, style]) => ({ condition, style })) });
  const BIG_YELLOW = spec([BIG, { fill: FILL, color: RED, bold: true }]);

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (column, style) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${style ? attr('data-cond-style', style) : ''}></span>`;
  const cell = (inner, style, extra, tag) => `<${tag || 'td'}${style ? attr('data-cond-style', style) : ''}${extra || ''}><p>${inner}</p></${tag || 'td'}>`;
  const row = (cells, style) => `<tr${style ? attr('data-cond-style', style) : ''}>${cells}</tr>`;
  const table = (...rows) => `<table><tbody>${rows.join('')}</tbody></table>`;

  async function seed(h, rowId) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setColumnRules(TABLE, { Montant: null, Titre: null });
    stub.setRows(TABLE, ROWS.map(r => Object.assign({}, r)));
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, ROWS[(rowId || 1) - 1]), TABLE);
    await h.sleep(50);
  }
  async function setRow(h, rowId) {
    window.__gristStub.fireRecord(Object.assign({}, ROWS[rowId - 1]), TABLE);
    await h.sleep(50);
  }
  // Ce que reçoivent la Lecture, le PDF, le Word et l'e-mail : ReaderMode.preview, le HTML résolu.
  async function preview(html, tableId, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, tableId || TABLE, record || GristAPI.getCurrentRecord());
    return box;
  }
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
  // Le fond d'une case en « #rrggbb », quelle que soit la forme que le navigateur lui donne (rgb(…)).
  function fillOf(cellEl) {
    const value = cellEl.style.backgroundColor;
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
    if (m) return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
    return value || '';
  }
  // Le style d'un <span> posé par la mise en forme : { color, bold } lu sur l'attribut.
  function spansOf(root) {
    return Array.from(root.querySelectorAll('span[style]')).map((span) => {
      const css = span.getAttribute('style') || '';
      const get = name => { const m = new RegExp('(?:^|;)\\s*' + name + ':\\s*([^;]+)').exec(css); return m ? m[1].trim() : null; };
      return { text: span.textContent, color: get('color'), bold: get('font-weight') === 'bold', hasFill: /background-color/.test(css) };
    });
  }
  const cellsOf = root => Array.from(root.querySelectorAll('td, th'));

  function ed() { return EditorCore.getEditor(); }
  function nodesOf(name) {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === name) out.push({ node, pos }); });
    return out;
  }
  const savedOf = (name, index) => { const found = nodesOf(name)[index || 0]; return found ? found.node.attrs.condStyle : undefined; };
  const modal = () => document.getElementById('cond-style-modal');
  const barOf = () => document.querySelector('.v2-table-toolbar');
  function barButton(action) {
    const b = barOf() && barOf().querySelector(`button[data-action="${action}"]`);
    return b ? { disabled: b.classList.contains('is-disabled'), active: b.classList.contains('is-active'), title: b.title } : null;
  }
  function press(action) { barOf().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  const scopeBtn = scope => modal().querySelectorAll('.cond-style-scope-btn')[scope === 'rows' ? 1 : 0];
  const saveBtn = () => modal().querySelector('.var-modal-actions .var-modal-primary');
  const removeBtn = () => modal().querySelector('.var-modal-actions .var-modal-danger');
  const openCard = () => modal().querySelector('.cond-style-card.is-open');
  const swatchIn = (card, key, color) => card.querySelector(`.cond-style-colors[data-style-key="${key}"] .cp-swatch[data-color="${color}"]`);
  const markBtn = (card, key) => card.querySelector(`.cond-style-mark[data-mark="${key}"]`);
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  async function pickColumn(h, rowEl, name) {
    rowEl.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = rowEl.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }
  // Curseur dans la case n° `index` (dans l'ordre du document), ou sélection de cases de la première à la dernière de `last`.
  async function cursorInCell(h, index) {
    document.querySelector('.tiptap').focus();
    const cell = nodesOf('tableCell').concat(nodesOf('tableHeader')).sort((a, b) => a.pos - b.pos)[index];
    ed().commands.setTextSelection(cell.pos + 2);
    await h.sleep(160);
  }
  async function selectCells(h, first, last) {
    document.querySelector('.tiptap').focus();
    const all = nodesOf('tableCell').concat(nodesOf('tableHeader')).sort((a, b) => a.pos - b.pos);
    ed().commands.setCellSelection({ anchorCell: all[first].pos, headCell: all[last].pos });
    await h.sleep(160);
  }

  cases.push({
    id: 'condstyletable_cell_takes_fill_color_and_marks_in_reader_and_exports',
    description: 'Une case dont la règle est remplie prend son fond sur TOUTE la case (style en ligne de la case, celui que lisent le PDF, le Word et l’Excel), sa couleur et son gras autour du texte ; sur une ligne où la règle ne tient pas, la case reste telle quelle ; le fond posé à la main n’est remplacé que quand la règle tient, et une couleur posée à la main sur un mot reste la sienne',
    run: async (h) => {
      const manualWord = '<span style="color:#0000ff">mot</span>';
      const html = table(row(
        cell('Plain', null, null) + cell('Sans règle ' + badge('Titre'), null, ` style="background-color: ${MANUAL}"`) + cell('Montant ' + badge('Montant'), BIG_YELLOW, ` style="background-color: ${MANUAL}"`) + cell(manualWord + ' ' + badge('Montant'), BIG_YELLOW),
      ));
      await seed(h, 1);
      const met = await preview(html);
      const metCells = cellsOf(met);
      const metFills = metCells.map(fillOf);
      const metSpans = spansOf(met.querySelectorAll('td')[2]);
      const wordKept = met.querySelectorAll('td')[3].innerHTML;
      const reader = await renderReader(html);
      const readerFill = fillOf(reader.querySelectorAll('td')[2]);
      closeReader();
      await setRow(h, 2);
      const unmet = await preview(html);
      const unmetFills = cellsOf(unmet).map(fillOf);
      const unmetSpans = spansOf(unmet.querySelectorAll('td')[2]);
      const plain = await preview(table(row(cell('Plain', null, null))));
      const plainHtml = plain.innerHTML;
      const pass = metFills[0] === '' && metFills[1] === MANUAL && metFills[2] === FILL && metFills[3] === FILL && readerFill === FILL
        && metSpans.length === 1 && metSpans[0].color === RED && metSpans[0].bold && !metSpans[0].hasFill
        && /<span style="color:#0000ff">mot<\/span>/.test(wordKept) && /<span style="[^"]*color: ?(#b91c1c|rgb\(185, 28, 28\))/.test(wordKept)
        && unmetFills[2] === MANUAL && unmetFills[3] === '' && unmetSpans.length === 0
        && plainHtml.indexOf('style=') === -1;
      return { pass, notes: JSON.stringify({ metFills, metSpans, wordKept, readerFill, unmetFills, unmetSpans, plainHtml }) };
    },
  });

  cases.push({
    id: 'condstyletable_row_rule_reaches_every_cell_and_a_cell_rule_goes_on_top',
    description: 'Le réglage d’une LIGNE vaut pour chacune de ses cases (fond, couleur, gras), une case de la ligne qui a sa propre règle passe par-dessus (son fond l’emporte, ses traits s’ajoutent) ; une cellule d’en-tête (th) suit de même ; une autre ligne du tableau n’est pas touchée',
    run: async (h) => {
      await seed(h, 1);
      const rowStyle = spec([URGENT, { fill: FILL, bold: true }]);
      const cellStyle = spec([BIG, { fill: GREEN_FILL, color: BLUE }]);
      const html = table(
        row(cell('Titre', null, null, 'th') + cell('Statut', null, null, 'th')),
        row(cell('a', null, null) + cell('b', cellStyle, null) + cell('c', null, ` style="background-color: ${MANUAL}"`), rowStyle),
        row(cell('d', null, null) + cell('e', null, null)),
      );
      const box = await preview(html);
      const trs = Array.from(box.querySelectorAll('tr'));
      const fills = trs.map(tr => cellsOf(tr).map(fillOf));
      const spans = trs.map(tr => spansOf(tr));
      await setRow(h, 2);
      const calm = await preview(html);
      const calmFills = cellsOf(calm).map(fillOf);
      const pass = JSON.stringify(fills[0]) === JSON.stringify(['', '']) && JSON.stringify(fills[1]) === JSON.stringify([FILL, GREEN_FILL, FILL]) && JSON.stringify(fills[2]) === JSON.stringify(['', ''])
        && spans[1].length === 3 && spans[1][0].bold && !spans[1][0].color && spans[1][1].bold && spans[1][1].color === BLUE && spans[2].length === 0
        && JSON.stringify(calmFills) === JSON.stringify(['', '', '', '', MANUAL, '', '']);
      return { pass, notes: JSON.stringify({ fills, spans, calmFills }) };
    },
  });

  cases.push({
    id: 'condstyletable_attribute_round_trips_on_cell_header_and_row_and_a_plain_table_stays_plain',
    description: 'Le réglage s’écrit dans data-cond-style sur la case, la cellule d’en-tête et la ligne, et se relit à l’identique ; un attribut illisible ou sans règle complète est ignoré ; un tableau sans réglage garde exactement son HTML d’avant (aucun attribut de plus)',
    run: async (h) => {
      await seed(h, 1);
      const html = table(row(cell('h', BIG_YELLOW, null, 'th') + cell('h2', null, null, 'th') + cell('h3', null, null, 'th')), row(cell('x', BIG_YELLOW, null) + cell('y', { rules: [] }, null) + cell('z', null, null), spec([URGENT, { color: RED }])));
      Editor.setHTML(html);
      await h.sleep(60);
      const out = Editor.getHTML();
      const header = savedOf('tableHeader', 0);
      const cellSet = savedOf('tableCell', 0);
      const empty = savedOf('tableCell', 1);
      const rowSet = savedOf('tableRow', 1);
      const rowPlain = savedOf('tableRow', 0);
      Editor.setHTML(table(row(cell('a', null, null))));
      await h.sleep(40);
      const plainOut = Editor.getHTML();
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(ConditionalStyle.normalize(b));
      const pass = same(header, BIG_YELLOW) && same(cellSet, BIG_YELLOW) && !empty && same(rowSet, spec([URGENT, { color: RED }])) && !rowPlain
        && (out.match(/data-cond-style=/g) || []).length === 3 && plainOut.indexOf('data-cond-style') === -1;
      return { pass, notes: JSON.stringify({ out, header, cellSet, empty, rowSet, rowPlain, count: (out.match(/data-cond-style=/g) || []).length, plainOut }) };
    },
  });

  // Les lignes d'une facture répétées par « Répéter la ligne » (le jeu de la suite varLoop, en plus petit).
  async function seedLoop(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('CtFactures', { Numero: 'Text' });
    stub.setVariables('CtLignes', { Facture: 'Ref:CtFactures', Designation: 'Text', Montant: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setColumnRules('CtLignes', { Montant: null });
    stub.setRows('CtFactures', [{ id: 1, Numero: 'F-1' }]);
    stub.setRows('CtLignes', [
      { id: 1, Facture: 1, Designation: 'Journée', Montant: 1200, manualSort: 1 },
      { id: 2, Facture: 1, Designation: 'Livret', Montant: 180, manualSort: 2 },
      { id: 3, Facture: 1, Designation: 'Déplacement', Montant: 90, manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('CtLignes');
    await GristAPI.saveLinkRule('CtLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Numero: 'F-1' }, 'CtFactures');
    await h.sleep(50);
  }
  const loopBadge = (column) => {
    const loop = { repeat: 'row', table: 'CtLignes', empty: 'header' };
    return `<span class="var-badge" data-table="CtLignes" data-column="${column}" data-key="CtLignes.${column}"${attr('data-loop', loop)} data-loop-repeat="row"></span>`;
  };
  const lineBadge = column => `<span class="var-badge" data-table="CtLignes" data-column="${column}" data-key="CtLignes.${column}"></span>`;

  cases.push({
    id: 'condstyletable_repeated_row_reads_its_own_line_for_the_row_and_for_a_cell',
    description: 'Dans une ligne répétée par une Boucle, la règle de la ligne et celle d’une case lisent la ligne DU TOUR : sur trois lignes de facture, seules celles dont le montant dépasse 100 prennent le fond',
    run: async (h) => {
      await seedLoop(h);
      const over = spec([rule('CtLignes.Montant', '>', '100'), { fill: FILL }]);
      const cellOver = spec([rule('CtLignes.Montant', '>', '1000'), { fill: GREEN_FILL }]);
      const html = table(row(cell('Désignation', null, null, 'th') + cell('Montant', null, null, 'th')), row(cell(loopBadge('Designation')) + cell(lineBadge('Montant'), cellOver), over));
      const box = await preview(html, 'CtFactures', { id: 1, Numero: 'F-1' });
      const body = Array.from(box.querySelectorAll('tr')).slice(1);
      const names = body.map(tr => tr.querySelector('td').textContent.trim());
      const fills = body.map(tr => cellsOf(tr).map(fillOf));
      const pass = body.length === 3 && JSON.stringify(names) === JSON.stringify(['Journée', 'Livret', 'Déplacement'])
        && JSON.stringify(fills) === JSON.stringify([[FILL, GREEN_FILL], [FILL, FILL], ['', '']]);
      return { pass, notes: JSON.stringify({ names, fills }) };
    },
  });

  // La mise en forme de Grist de « Montant » : une règle (texte bleu) quand Montant > 1000, une seconde (fond jaune) quand le statut est Urgent.
  const HELPER1 = 'gristHelper_ConditionalRule';
  const HELPER2 = 'gristHelper_ConditionalRule2';
  const GRIST_RULES = [{ helper: HELPER1, style: { color: BLUE } }, { helper: HELPER2, style: { fill: FILL, bold: true } }];
  async function seedGrist(h, rowId) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric', [HELPER1]: 'Bool', [HELPER2]: 'Bool' });
    stub.setRows(TABLE, ROWS.map(r => Object.assign({}, r, { [HELPER1]: r.Montant > 1000, [HELPER2]: r.Statut === 'Urgent' })));
    stub.setColumnRules(TABLE, { Montant: GRIST_RULES });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, ROWS[(rowId || 1) - 1]), TABLE);
    await h.sleep(50);
  }

  cases.push({
    id: 'condstyletable_cell_follows_the_grist_rules_of_its_first_variable_live',
    description: '« Comme dans Grist » sur une case : elle prend, EN DIRECT, la mise en forme que Grist donne à la colonne de sa PREMIÈRE variable (fond et gras de la règle 2 sur la ligne urgente, texte bleu de la règle 1 quand le montant dépasse 1 000) ; sans variable dans la case, ou sur une ligne, rien n’est repris ; une règle du widget passe par-dessus',
    run: async (h) => {
      await seedGrist(h, 1);
      const gristOnly = { grist: true, rules: [] };
      const plus = { grist: true, rules: [{ condition: URGENT, style: { fill: GREEN_FILL } }] };
      const html = table(row(
        cell('M ' + badge('Montant'), gristOnly) + cell('T ' + badge('Titre') + badge('Montant'), gristOnly) + cell('sans', gristOnly) + cell(badge('Montant'), plus),
      ), row(cell('ligne', null, null), gristOnly));
      const box = await preview(html);
      const tds = Array.from(box.querySelectorAll('td'));
      const fills1 = tds.map(fillOf);
      const spans1 = spansOf(tds[0]);
      await setRow(h, 2);
      const calm = await preview(html);
      const fills2 = Array.from(calm.querySelectorAll('td')).map(fillOf);
      const pass = fills1[0] === FILL && spans1.length === 1 && spans1[0].color === BLUE && spans1[0].bold
        && fills1[1] === '' && fills1[2] === '' && fills1[3] === GREEN_FILL && fills1[4] === ''
        && fills2.every(f => f === '');
      return { pass, notes: JSON.stringify({ fills1, spans1, fills2 }) };
    },
  });

  const OLD = { f: 1, t: { 1: ['Dossiers', { 1: 'Titre', 2: 'Montant', 3: 'Statut' }] } };
  const NEW = { f: 1, t: { 1: ['Dossiers', { 1: 'Titre', 2: 'Total', 3: 'Statut' }] } };
  cases.push({
    id: 'condstyletable_rules_follow_a_column_rename_on_cells_and_rows',
    description: 'Une colonne renommée dans Grist est réécrite dans les conditions d’une case et d’une ligne (js/schema-renames.js lit aussi les <td>, <th> et <tr> réglés), les autres colonnes restent telles quelles',
    run: async (h) => {
      await seed(h, 1);
      const m = SchemaRenames.createMapper(OLD, NEW, {});
      const ctx = { page: m.tableContext('Dossiers'), trigger: Variables.triggerChar() };
      const style = { rules: [{ condition: { mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '100' }] }, style: { fill: FILL } }] };
      const html = table(row(cell('a', style, null) + cell('b', null, null, 'th'), style));
      const out = SchemaRenames.rewriteHtml(html, m, ctx);
      const tpl = document.createElement('template');
      tpl.innerHTML = out.html;
      const found = Array.from(tpl.content.querySelectorAll('[data-cond-style]')).map(el => ({ tag: el.tagName, column: JSON.parse(el.getAttribute('data-cond-style')).rules[0].condition.rules[0].column }));
      const pass = out.count >= 2 && found.length === 2 && found.every(f => f.column === 'Total');
      return { pass, notes: JSON.stringify({ count: out.count, found }) };
    },
  });

  // === La barre du tableau et la fenêtre ===
  const TWO_ROWS = () => table(
    row(cell('a', null, null) + cell(badge('Montant'), null, null)),
    row(cell('c', null, null) + cell('d', null, null)),
  );

  cases.push({
    id: 'condstyletable_toolbar_button_is_after_the_fill_lit_when_set',
    description: 'Un bouton « Mise en forme conditionnelle » dans la barre du tableau, juste après le fond de cellule : éteint sans réglage, allumé quand la case du curseur - ou sa ligne - en porte un',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(table(row(cell('a', null, null) + cell('b', BIG_YELLOW, null)), row(cell('c', null, null) + cell('d', null, null), spec([URGENT, { bold: true }]))));
      await h.sleep(60);
      await cursorInCell(h, 0);
      const order = Array.from(barOf().querySelectorAll('button')).map(b => b.dataset.action);
      const plain = barButton('cell-style');
      await cursorInCell(h, 1);
      const cellSet = barButton('cell-style');
      await cursorInCell(h, 2);
      const rowSet = barButton('cell-style');
      const pass = order.indexOf('cell-style') === order.indexOf('fill-open') + 1 && plain && !plain.disabled && !plain.active && plain.title === I18n.t('table.cellStyle')
        && cellSet && cellSet.active && rowSet && rowSet.active;
      return { pass, notes: JSON.stringify({ order, plain, cellSet, rowSet }) };
    },
  });

  cases.push({
    id: 'condstyletable_window_writes_the_rule_on_the_chosen_cells_then_on_the_row',
    description: 'Le bouton ouvre la fenêtre sur « Cases choisies » : une règle écrite puis « Enregistrer » pose le réglage sur TOUTES les cases d’une sélection de cases (et sur elles seules) ; « Toute la ligne » le pose sur la ligne (<tr>) et non sur les cases ; rien n’est écrit avant « Enregistrer » ; « Retirer » vide le réglage du volet',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(TWO_ROWS());
      await h.sleep(60);
      // Deux cases de la première ligne.
      await selectCells(h, 0, 1);
      press('cell-style');
      await h.sleep(180);
      const opened = !!modal() && getComputedStyle(modal()).display !== 'none';
      const scopes = Array.from(modal().querySelectorAll('.cond-style-scope-btn')).map(b => ({ text: b.textContent, on: b.classList.contains('is-active') }));
      const introCells = modal().querySelector('.var-modal-intro').textContent;
      const card = openCard();
      swatchIn(card, 'fill', FILL).click();
      markBtn(card, 'bold').click();
      const row0 = modal().querySelector('.macro-rule-row');
      await pickColumn(h, row0, 'Montant');
      const untouched = nodesOf('tableCell').every(c => !c.node.attrs.condStyle);
      row0.querySelector('select:not(.macro-rule-column)').value = '>';
      row0.querySelector('select:not(.macro-rule-column)').dispatchEvent(new Event('change', { bubbles: true }));
      setInput(row0.querySelector('.macro-rule-value'), '1000');
      await h.sleep(60);
      saveBtn().click();
      await h.sleep(100);
      const cells = nodesOf('tableCell').map(c => c.node.attrs.condStyle);
      const rows = nodesOf('tableRow').map(r => r.node.attrs.condStyle);
      const written = JSON.stringify(cells[0]) === JSON.stringify(cells[1]) && cells[0] && cells[0].rules.length === 1 && cells[0].rules[0].style.fill === FILL && cells[0].rules[0].style.bold === true;
      const onlyThem = !cells[2] && !cells[3] && rows.every(r => !r);
      // Ctrl+Z défait le réglage des DEUX cases d'un seul pas (une transaction), puis le rétablit.
      ed().commands.undo();
      await h.sleep(60);
      const undone = nodesOf('tableCell').every(c => !c.node.attrs.condStyle);
      ed().commands.redo();
      await h.sleep(60);
      const redone = !!nodesOf('tableCell')[0].node.attrs.condStyle && !!nodesOf('tableCell')[1].node.attrs.condStyle;
      // Le même réglage sur la ligne de la case « c ».
      await cursorInCell(h, 2);
      press('cell-style');
      await h.sleep(180);
      swatchIn(openCard(), 'fill', GREY).click();
      const row1 = modal().querySelector('.macro-rule-row');
      await pickColumn(h, row1, 'Statut');
      row1.querySelector('select:not(.macro-rule-column)').value = '=';
      row1.querySelector('select:not(.macro-rule-column)').dispatchEvent(new Event('change', { bubbles: true }));
      setInput(row1.querySelector('.macro-rule-value'), 'Urgent');
      scopeBtn('rows').click();
      await h.sleep(80);
      const rowScope = scopeBtn('rows').classList.contains('is-active');
      saveBtn().click();
      await h.sleep(100);
      const rows2 = nodesOf('tableRow').map(r => r.node.attrs.condStyle);
      const cells2 = nodesOf('tableCell').map(c => c.node.attrs.condStyle);
      const rowWritten = !rows2[0] && rows2[1] && rows2[1].rules[0].style.fill === GREY && !cells2[2] && !cells2[3] && !!cells2[0];
      // « Retirer » sur les cases du début.
      await selectCells(h, 0, 1);
      press('cell-style');
      await h.sleep(180);
      const removeShown = !removeBtn().hidden;
      removeBtn().click();
      await h.sleep(100);
      const cleared = nodesOf('tableCell').every(c => !c.node.attrs.condStyle) && !!nodesOf('tableRow')[1].node.attrs.condStyle;
      const pass = opened && scopes.length === 2 && scopes[0].on && !scopes[1].on && /cases/i.test(introCells) && untouched && written && onlyThem && undone && redone && rowScope && rowWritten && removeShown && cleared;
      return { pass, notes: JSON.stringify({ opened, scopes, introCells, untouched, cells, rows, written, onlyThem, undone, redone, rowScope, rows2, cells2, rowWritten, removeShown, cleared }) };
    },
  });

  cases.push({
    id: 'condstyletable_window_grist_box_is_for_cells_with_a_variable_and_greyed_otherwise',
    description: 'Dans la fenêtre, « Comme dans Grist » se coche sur une case dont une variable a des règles dans Grist (et s’enregistre en `grist: true` sur la case) ; grisée, avec sa raison, sur une case sans variable et sur « Toute la ligne »',
    run: async (h) => {
      await seedGrist(h, 1);
      Editor.setHTML(table(row(cell('a', null, null) + cell(badge('Montant'), null, null))));
      await h.sleep(60);
      const box = () => modal().querySelector('.cond-style-grist input');
      const note = () => modal().querySelector('.cond-style-grist-note').textContent;
      const out = {};
      await cursorInCell(h, 0);
      press('cell-style');
      await h.sleep(180);
      out.noVar = { disabled: box().disabled, note: note() };
      modal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(60);
      await cursorInCell(h, 1);
      press('cell-style');
      await h.sleep(180);
      out.withVar = { disabled: box().disabled, checked: box().checked };
      box().click();
      await h.sleep(40);
      saveBtn().click();
      await h.sleep(100);
      const saved = savedOf('tableCell', 1);
      press('cell-style');
      await h.sleep(180);
      scopeBtn('rows').click();
      await h.sleep(60);
      out.row = { disabled: box().disabled, checked: box().checked, note: note() };
      modal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(60);
      const pass = out.noVar.disabled && out.noVar.note === I18n.t('condStyle.gristNoVar') && !out.withVar.disabled && !out.withVar.checked
        && saved && saved.grist === true && out.row.disabled && !out.row.checked && out.row.note === I18n.t('condStyle.gristRow');
      return { pass, notes: JSON.stringify({ out, saved }) };
    },
  });

  // === La pastille « @ » ===
  const mentionHtml = (style, row) => `<span class="mention-chip" data-mention-table="${TABLE}" data-mention-row="${row || 1}" data-mention-column="Titre"${style ? attr('data-cond-style', style) : ''}>Dossier A</span>`;

  cases.push({
    id: 'condstyletable_mention_chip_takes_the_style_of_the_page_row_and_round_trips',
    description: 'Une pastille « @ » (js/mention.js) prend sa mise en forme selon la ligne de la PAGE, pas selon la fiche qu’elle cite : fond, couleur et gras quand la règle tient à la Lecture et dans les exports, rien sinon ; le réglage s’écrit dans data-cond-style et se relit, une pastille sans réglage garde son HTML d’avant',
    run: async (h) => {
      await seed(h, 1);
      const html = `<p>Voir ${mentionHtml(BIG_YELLOW)} et ${mentionHtml(null, 2)}.</p>`;
      const met = await preview(html);
      const metSpans = spansOf(met);
      await setRow(h, 2);
      const unmet = await preview(html);
      const unmetSpans = spansOf(unmet);
      Editor.setHTML(html);
      await h.sleep(80);
      const nodes = nodesOf('mention');
      const out = Editor.getHTML();
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(ConditionalStyle.normalize(b));
      const pass = metSpans.length === 1 && metSpans[0].color === RED && metSpans[0].bold && metSpans[0].hasFill && /Dossier A/.test(metSpans[0].text)
        && unmetSpans.length === 0 && nodes.length === 2 && same(nodes[0].node.attrs.condStyle, BIG_YELLOW) && !nodes[1].node.attrs.condStyle
        && (out.match(/data-cond-style=/g) || []).length === 1;
      return { pass, notes: JSON.stringify({ metSpans, unmetSpans, nodes: nodes.map(n => n.node.attrs.condStyle || null), out }) };
    },
  });

  cases.push({
    id: 'condstyletable_mention_toolbar_has_a_style_button_that_opens_the_window',
    description: 'La barre flottante d’une pastille « @ » a un second bouton « Mise en forme conditionnelle » : éteint sans réglage, allumé avec ; il ouvre la fenêtre (sans « Comme dans Grist » : la pastille n’est pas une variable) et « Enregistrer » écrit le réglage sur la pastille',
    run: async (h) => {
      await seed(h, 1);
      Editor.setHTML(`<p>Voir ${mentionHtml(null)} et ${mentionHtml(BIG_YELLOW, 2)}.</p>`);
      await h.sleep(80);
      const barBtn = () => { const b = document.querySelector('.v2-mention-toolbar button[data-action="mention-style"]'); return b ? { active: b.classList.contains('is-active'), disabled: b.classList.contains('is-disabled'), title: b.title } : null; };
      const pick = async (index) => { document.querySelector('.tiptap').focus(); ed().commands.setNodeSelection(nodesOf('mention')[index].pos); await h.sleep(160); };
      await pick(0);
      const plain = barBtn();
      await pick(1);
      const set = barBtn();
      await pick(0);
      document.querySelector('.v2-mention-toolbar button[data-action="mention-style"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(180);
      const opened = !!modal() && getComputedStyle(modal()).display !== 'none';
      const gristHidden = modal().querySelector('.cond-style-grist').hidden;
      const scopeHidden = modal().querySelector('.cond-style-scope').hidden;
      const card = openCard();
      swatchIn(card, 'fill', FILL).click();
      const row0 = modal().querySelector('.macro-rule-row');
      await pickColumn(h, row0, 'Montant');
      row0.querySelector('select:not(.macro-rule-column)').value = '>';
      row0.querySelector('select:not(.macro-rule-column)').dispatchEvent(new Event('change', { bubbles: true }));
      setInput(row0.querySelector('.macro-rule-value'), '1000');
      await h.sleep(60);
      saveBtn().click();
      await h.sleep(100);
      const saved = nodesOf('mention')[0].node.attrs.condStyle;
      ed().commands.undo();
      await h.sleep(60);
      const undone = !nodesOf('mention')[0].node.attrs.condStyle;
      const pass = undone && plain && !plain.active && !plain.disabled && plain.title === I18n.t('varToolbar.style') && set && set.active && opened && gristHidden && scopeHidden
        && saved && saved.rules.length === 1 && saved.rules[0].style.fill === FILL;
      return { pass, notes: JSON.stringify({ plain, set, opened, gristHidden, scopeHidden, saved }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condStyleTable = cases;
})();
