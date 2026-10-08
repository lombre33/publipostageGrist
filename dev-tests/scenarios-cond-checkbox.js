// Suite "condCheckbox" - la case conditionnelle (demande d'Antoine du 2026-10-01 : « une case cochée ou décochée en fonction d'une condition basée sur une colonne (même modale et système que
// les variables conditionnelles classiques) » ; sa réponse à la carte : « Puce dédiée »). Nœud inline conditionalCheckbox (js/editor-nodes.js), entrée « Case conditionnelle » de l'onglet Chips et
// pose de la puce (js/variables.js, js/conditional-checkbox.js), barre flottante (js/floating-toolbars.js : la condition et les trois styles de case), fenêtre de condition partagée avec les
// bulles et les blocs de texte (js/variable-condition.js), résolution à la Lecture et aux exports (js/reader-mode.js -> ConditionalCheckbox.resolve : la case de la variable Oui / Non,
// `.resolved-checkbox`, que le PDF, le Word, l'Excel et l'e-mail savent lire). Jeu de données de la suite condText, sous d'autres noms de tables.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  const COND_ANY = { mode: 'any', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }, { column: 'Montant', operator: '>', value: '1000' }] };
  const COND_BIG_LINE = { mode: 'all', rules: [{ column: 'CcLignes.Qte', operator: '>', value: '5' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TABLE = 'CcDossiers';
  const STYLES = ['accentStrike', 'classic', 'accentPlain'];
  const CHECKED = '☑';
  const UNCHECKED = '☐';

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const chip = (condition, style) => `<span class="conditional-checkbox"${condition ? attr('data-condition', condition) : ''}${style ? ` data-checkbox-style="${style}"` : ''}>${UNCHECKED}</span>`;
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const inLangAsync = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setVariables('CcLignes', { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 },
    ]);
    stub.setRows('CcLignes', [
      { id: 1, Dossier: 1, Designation: 'Audit', Qte: 1 },
      { id: 2, Dossier: 1, Designation: 'Livret', Qte: 12 },
      { id: 3, Dossier: 1, Designation: 'Déplacement', Qte: 1 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('CcLignes');
    await GristAPI.saveLinkRule('CcLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  async function renderReader(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), hf || NO_HF);
    return reader.querySelector('.reader-content');
  }
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  async function previewBox(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  // « true / false » de chaque case dessinée, dans l'ordre du document.
  const checkedOf = root => Array.from(root.querySelectorAll('.resolved-checkbox')).map(b => b.getAttribute('data-checked'));
  const stylesOf = root => Array.from(root.querySelectorAll('.resolved-checkbox')).map(b => b.getAttribute('data-checkbox-style'));

  function ed() { return EditorCore.getEditor(); }
  function chipNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'conditionalCheckbox') out.push({ node, pos }); });
    return out;
  }
  function views() { return Array.from(document.querySelectorAll('.tiptap .conditional-checkbox')); }
  function panelBox() { return document.getElementById('autocomplete-box'); }
  function panelOpen() { const b = panelBox(); return !!b && b.style.display !== 'none'; }
  function panelItems() { return panelOpen() ? Array.from(panelBox().querySelectorAll('.ac-item')).map(i => i.textContent) : []; }
  async function openChipsTab(h) {
    document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await h.sleep(30);
  }
  async function pickEntry(h, label) {
    if (!panelOpen()) return false;
    const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(i => i.textContent === label);
    if (!item) return false;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(80);
    return true;
  }
  function cursorAtEndOf(needle) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (!found && node.isTextblock && node.textContent.indexOf(needle) !== -1) found = pos + 1 + node.content.size; });
    if (found == null) return false;
    ed().commands.setTextSelection(found);
    ed().view.focus();
    return true;
  }
  function visible(el) { return !!el && el.style.display !== 'none' && !el.hidden && el.getClientRects().length > 0; }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function toolbarButton(action) { return toolbar().querySelector(`button[data-action="${action}"]`); }
  function pressToolbarButton(action) { toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  async function selectChip(h, index) {
    const target = chipNodes()[index || 0];
    if (!target) return null;
    ed().commands.setNodeSelection(target.pos);
    ed().view.focus();
    await h.sleep(80);
    return target;
  }
  function barState() {
    const bar = toolbar();
    const button = action => { const b = bar.querySelector(`button[data-action="${action}"]`); return b ? { shown: visible(b), active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), disabled: b.getAttribute('aria-disabled') === 'true', title: b.title } : null; };
    const panel = name => { const p = bar.querySelector(`[data-var-panel="${name}"]`); return !!p && !p.hidden && p.getClientRects().length > 0; };
    return {
      visible: visible(bar),
      panels: { number: panel('number'), date: panel('date'), bool: panel('bool') },
      condition: button('var-condition'), linked: button('var-linked'), loop: button('var-loop'),
      styles: STYLES.map(s => button('bool-style:' + s)), text: button('bool-style:text'),
    };
  }

  // --- La pose : liste « # », onglet Chips, un clic ---
  cases.push({
    id: 'condcb_chips_tab_places_the_box_in_one_click_and_opens_its_bar',
    description: 'Le panneau « # », onglet Chips, a une ligne « Case conditionnelle » (« Conditional checkbox » en anglais) : un clic pose la puce à la place de « #requête », sans condition, au style « accent, texte normal », sélectionnée ; sa barre s’ouvre avec la condition (pas encore posée), les trois styles de case - le bon enfoncé -, sans « vrai / faux », « Autres attributs » et « Boucle » grisés avec leur raison ; la puce montre sa case décochée et « sans condition »',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent('<p>Contrat signé</p>');
      cursorAtEndOf('Contrat signé');
      // Un « # » collé à un mot n'ouvre pas la liste : derrière une espace.
      ed().commands.insertContent({ type: 'text', text: ' ' });
      await h.typeText('#');
      await h.sleep(60);
      await openChipsTab(h);
      const items = panelItems();
      const picked = await pickEntry(h, I18n.t('chips.conditionalCheckbox'));
      const nodes = chipNodes();
      const selection = ed().state.selection;
      const bar = barState();
      const view = views()[0];
      const box = view && view.querySelector('.resolved-checkbox');
      const english = await inLangAsync('en', async () => {
        await h.sleep(30);
        return { label: view && view.querySelector('.conditional-checkbox-head').textContent, title: view && view.title, entry: I18n.t('chips.conditionalCheckbox') };
      });
      const checks = {
        // « Valeur conditionnelle » (js/conditional-value.js) la précède et « Calcul » (js/variable-calc.js) la suit : neuf lignes depuis « Nom de l'utilisateur » (juste après l'email), la case conditionnelle huitième.
        entryIsListed: items.indexOf(I18n.t('chips.conditionalCheckbox')) === 7 && items.length === 9 && items[6] === I18n.t('chips.conditionalValue') && items[8] === I18n.t('chips.calc'),
        picked,
        oneChipNoHash: nodes.length === 1 && ed().state.doc.textContent === 'Contrat signé ',
        defaults: nodes.length === 1 && nodes[0].node.attrs.style === 'accentPlain' && nodes[0].node.attrs.condition === null,
        selected: !!selection.node && selection.node.type.name === 'conditionalCheckbox',
        barOpensWithTheBoxPanel: bar.visible && bar.panels.bool && !bar.panels.number && !bar.panels.date,
        threeStylesNoText: bar.styles.every(b => b && b.shown) && !(bar.text && bar.text.shown),
        plainIsPressed: JSON.stringify(bar.styles.map(b => b.pressed)) === JSON.stringify(['false', 'false', 'true']) && bar.styles[2].active,
        conditionButton: !!bar.condition && bar.condition.shown && !bar.condition.active && bar.condition.title === I18n.t('varToolbar.conditionCheckbox'),
        linkedAndLoopGreyedWithReason: bar.linked.disabled && bar.linked.title === I18n.t('varToolbar.linkedCheckbox') && bar.loop.disabled && bar.loop.title === I18n.t('varToolbar.loopCheckbox'),
        viewShowsAnUncheckedBox: !!box && box.getAttribute('data-checked') === 'false' && box.getAttribute('data-checkbox-style') === 'accentPlain' && box.getAttribute('aria-hidden') === 'true',
        viewLabel: !!view && view.querySelector('.conditional-checkbox-head').textContent === I18n.t('condCheckbox.tag.none') && view.title === I18n.t('condCheckbox.tag.titleNone') && view.getAttribute('aria-label') === view.title,
        englishTexts: english.entry === 'Conditional checkbox' && english.label === 'no condition' && english.title.indexOf('stays unchecked') !== -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, items, bar, english }) };
    },
  });

  // --- La barre : les styles ---
  cases.push({
    id: 'condcb_bar_style_buttons_set_the_style_and_keep_the_condition',
    description: 'Les trois boutons de la barre posent le style de la case (le bouton enfoncé suit, la case de la puce change de style) sans toucher à sa condition ; la barre ne montre « vrai / faux » que pour une variable Oui / Non, jamais pour la case, et le garde de nouveau pour la bulle qui suit',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Avant ${chip(COND_URGENT)} après <span class="var-badge" data-table="${TABLE}" data-column="Statut" data-key="${TABLE}.Statut"></span></p>`);
      await h.sleep(40);
      await selectChip(h, 0);
      const seen = {};
      for (const style of ['classic', 'accentStrike', 'accentPlain', 'classic']) {
        pressToolbarButton('bool-style:' + style);
        await h.sleep(60);
        const node = chipNodes()[0].node;
        const bar = barState();
        const box = views()[0].querySelector('.resolved-checkbox');
        seen[style] = { attrs: [node.attrs.style, JSON.stringify(node.attrs.condition)], pressed: bar.styles.map(b => b.pressed).join(','), box: box && box.getAttribute('data-checkbox-style'), visible: bar.visible, text: !!(bar.text && bar.text.shown) };
      }
      const conditionJson = JSON.stringify(COND_URGENT);
      // Une bulle Oui / Non sélectionnée ensuite : « vrai / faux » est de retour, le style de la bulle n'est pas celui de la case.
      window.__gristStub.setVariables(TABLE, { Titre: 'Text', Statut: 'Bool', Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      let badgePos = null;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') badgePos = pos; });
      ed().commands.setNodeSelection(badgePos);
      await h.sleep(80);
      const afterBadge = barState();
      const checks = {
        eachButtonSetsItsStyle: ['classic', 'accentStrike', 'accentPlain'].every(s => seen[s].attrs[0] === s && seen[s].box === s),
        conditionKept: Object.keys(seen).every(s => seen[s].attrs[1] === conditionJson),
        pressedFollows: seen.classic.pressed === 'false,true,false' && seen.accentStrike.pressed === 'true,false,false' && seen.accentPlain.pressed === 'false,false,true',
        barStaysOpenWithoutText: Object.keys(seen).every(s => seen[s].visible && !seen[s].text),
        textButtonBackForABadge: afterBadge.visible && afterBadge.panels.bool && !!afterBadge.text && afterBadge.text.shown && afterBadge.condition.title === I18n.t('varToolbar.condition'),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, seen, afterBadge: { text: afterBadge.text, condition: afterBadge.condition } }) };
    },
  });

  // --- Le HTML enregistré ---
  cases.push({
    id: 'condcb_saved_html_round_trips_and_unknown_values_fall_back',
    description: 'Le HTML enregistré d’une case ne porte que <span class="conditional-checkbox" data-condition data-checkbox-style> et la relit à l’identique (condition, style) ; un style inconnu ou absent devient « accent, texte normal », une condition illisible aucune',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>${chip(COND_ANY, 'classic')} ${chip(null, 'bogus')} ${chip(null)} <span class="conditional-checkbox" data-condition="{oops" data-checkbox-style="accentStrike">☐</span></p>`);
      await h.sleep(40);
      const nodes = chipNodes().map(n => ({ style: n.node.attrs.style, condition: n.node.attrs.condition }));
      const html = ed().getHTML();
      const reparsed = (() => {
        const box = document.createElement('div');
        box.innerHTML = html;
        return Array.from(box.querySelectorAll('span.conditional-checkbox')).map(s => [s.getAttribute('data-checkbox-style'), s.getAttribute('data-condition'), s.textContent, s.getAttribute('contenteditable')]);
      })();
      const checks = {
        fourChips: nodes.length === 4,
        firstKeepsBoth: nodes[0] && nodes[0].style === 'classic' && JSON.stringify(nodes[0].condition) === JSON.stringify(COND_ANY),
        unknownStyleFallsBack: nodes[1] && nodes[1].style === 'accentPlain' && nodes[2] && nodes[2].style === 'accentPlain',
        unreadableConditionIsNone: nodes[3] && nodes[3].condition === null && nodes[3].style === 'accentStrike',
        savedHtml: reparsed.length === 4 && reparsed[0][0] === 'classic' && JSON.stringify(JSON.parse(reparsed[0][1])) === JSON.stringify(COND_ANY) && reparsed[0][2] === UNCHECKED && reparsed[0][3] === 'false'
          && reparsed[1][1] === null && reparsed[1][0] === 'accentPlain',
        noEditorOnlyMarkup: html.indexOf('conditional-checkbox-head') === -1 && html.indexOf('resolved-checkbox') === -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, nodes, reparsed }) };
    },
  });

  // --- La Lecture ---
  cases.push({
    id: 'condcb_reading_checks_the_box_when_its_condition_holds',
    description: 'À la Lecture, la case est cochée quand sa condition est remplie pour la ligne affichée, décochée sinon (et à chaque changement de ligne) : une règle, « au moins une » de deux, sans condition (décochée), condition illisible ou colonne inconnue (décochée) ; le style de la puce est celui de la case (couleurs de la variable Oui / Non), son nom accessible dit « Coché » / « Décoché » (« Checked » / « Unchecked ») ; aucun repère de l’éditeur ne reste',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>'
          + [chip(COND_URGENT, 'accentStrike'), chip(COND_URGENT, 'classic'), chip(COND_NORMAL, 'accentPlain'), chip(COND_ANY), chip(null, 'classic'),
            '<span class="conditional-checkbox" data-condition="{oops" data-checkbox-style="classic">☐</span>',
            chip({ mode: 'all', rules: [{ column: 'Inconnue', operator: '=', value: 'x' }] })].join(' ')
          + '</p>';
        const read1 = await renderReader(html);
        const first = { checked: checkedOf(read1), styles: stylesOf(read1), boxes: Array.from(read1.querySelectorAll('.resolved-checkbox')).map(b => [b.getAttribute('aria-label'), b.style.color]) };
        const framesLeft1 = read1.querySelectorAll('.conditional-checkbox, [data-condition]').length;
        await setRecord(h, RECORD_2);
        const read2 = await renderReader(html);
        const second = checkedOf(read2);
        const english = await inLangAsync('en', async () => { const r = await renderReader(html); return Array.from(r.querySelectorAll('.resolved-checkbox')).slice(0, 3).map(b => b.getAttribute('aria-label')); });
        const checks = {
          recordOne: JSON.stringify(first.checked) === JSON.stringify(['true', 'true', 'false', 'true', 'false', 'false', 'false']),
          recordTwo: JSON.stringify(second) === JSON.stringify(['false', 'false', 'true', 'true', 'false', 'false', 'false']),
          stylesAreKept: JSON.stringify(first.styles) === JSON.stringify(['accentStrike', 'classic', 'accentPlain', 'accentPlain', 'classic', 'classic', 'accentPlain']),
          sameColoursAsTheVariable: first.boxes[0][1] === 'rgb(47, 111, 237)' && first.boxes[1][1] === 'rgb(34, 34, 34)' && first.boxes[2][1] === 'rgb(118, 118, 118)' && first.boxes[4][1] === 'rgb(107, 118, 132)',
          accessibleNames: first.boxes[0][0] === 'Coché' && first.boxes[2][0] === 'Décoché' && JSON.stringify(english) === JSON.stringify(['Unchecked', 'Unchecked', 'Checked']),
          nothingOfTheEditorLeft: framesLeft1 === 0,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, first, second, english }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condcb_accent_strike_box_is_the_box_alone_the_text_after_it_is_never_struck',
    description: 'Le style « accent, texte barré » d’une case conditionnelle dessine la même case que « accent, texte normal » et ne barre rien (réponse d’Antoine du 01/10 : « Non, la case seule », comme pour la variable Oui / Non) : le texte qui la suit, sur la même ligne, ne reçoit ni barré ni couleur, que la condition soit remplie ou non, en Lecture comme dans le HTML des exports',
    run: async (h) => {
      try {
        await seed(h);
        const html = `<p>${chip(COND_URGENT, 'accentStrike')} Pièce fournie</p><p>${chip(COND_NORMAL, 'accentStrike')} Pièce refusée</p><p>${chip(COND_URGENT, 'classic')} Classique</p><p>${chip(COND_URGENT, 'accentPlain')} Normal</p>`;
        const reader = await renderReader(html);
        const ps = Array.from(reader.querySelectorAll(':scope > p'));
        const lineThrough = el => getComputedStyle(el).textDecorationLine.indexOf('line-through') !== -1;
        const anyStruck = root => !!root.querySelector('.resolved-struck, [style*="line-through"]') || Array.from(root.querySelectorAll('*')).some(lineThrough);
        const exported = await previewBox(html);
        const box = p => p.querySelector('.resolved-checkbox');
        const checks = {
          fourParagraphs: ps.length === 4,
          nothingIsStruck: ps.length === 4 && ps.every(p => !anyStruck(p)),
          exportsStayPlain: !/line-through|resolved-struck/.test(exported.innerHTML),
          onlyBoxesCarryInlineStyle: ps.every(p => Array.from(p.querySelectorAll('[style]')).every(e => e.classList.contains('resolved-checkbox'))),
          checkedBoxStillDrawn: ps.length === 4 && box(ps[0]).getAttribute('data-checked') === 'true' && box(ps[0]).getAttribute('data-checkbox-style') === 'accentStrike' && box(ps[1]).getAttribute('data-checked') === 'false',
          sameBoxAsAccentPlain: ps.length === 4 && ['data-checked', 'aria-label', 'style'].every(k => box(ps[0]).getAttribute(k) === box(ps[3]).getAttribute(k)),
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, paragraphs: ps.map(p => p.innerHTML.slice(0, 160)) }) };
      } finally { closeReader(); }
    },
  });

  // --- Zones répétées, cases de tableau, en-tête ---
  cases.push({
    id: 'condcb_row_loop_cell_list_and_header_read_the_right_row',
    description: 'La case se pose partout où une bulle se pose : dans une ligne de tableau répétée (boucle sur une table liée) elle lit la ligne de son tour - une condition sur une colonne de la table parcourue ne coche que les lignes qui la remplissent -, dans une case de tableau, un élément de liste, un titre et l’en-tête ou le pied de page (aperçu A4 et zones préparées pour les exports)',
    run: async (h) => {
      try {
        await seed(h);
        const loop = { repeat: 'row', table: 'CcLignes', empty: 'header' };
        const designation = `<span class="var-badge" data-table="CcLignes" data-column="Designation" data-key="CcLignes.Designation"${attr('data-loop', loop)} data-loop-repeat="row"></span>`;
        const html = '<table><tbody><tr><th><p>Désignation</p></th><th><p>Gros volume</p></th></tr>'
          + `<tr><td><p>${designation}</p></td><td><p>${chip(COND_BIG_LINE, 'classic')}</p></td></tr></tbody></table>`
          + `<ul><li><p>Urgent ${chip(COND_URGENT)}</p></li></ul><h2>Titre ${chip(COND_NORMAL)}</h2>`
          + `<table><tbody><tr><td><p>Case ${chip(COND_URGENT)}</p></td><td><p>Autre ${chip(COND_NORMAL)}</p></td></tr></tbody></table>`;
        const reader = await renderReader(html);
        const tables = reader.querySelectorAll('table');
        const loopRows = Array.from(tables[0].querySelectorAll('tr')).slice(1).map(tr => [tr.cells[0].textContent.trim(), checkedOf(tr.cells[1])[0]]);
        const listBox = checkedOf(reader.querySelector('ul'));
        const titleBox = checkedOf(reader.querySelector('h2'));
        const cellBoxes = Array.from(tables[1].querySelectorAll('td')).map(td => checkedOf(td)[0]);
        h.setA4Preview(true);
        const hf = { enabled: true, differentFirstPage: false, header: { default: `<p>En-tête ${chip(COND_URGENT, 'classic')}</p>`, first: '' }, footer: { default: `<p>Pied ${chip(COND_NORMAL)}</p>`, first: '' } };
        await renderReader('<p>Corps</p>', hf);
        const headerBoxes = Array.from(document.querySelectorAll('#reader-container .v2-page-edge-top .resolved-checkbox, #reader-container .v2-page-edge-bottom .resolved-checkbox')).map(b => [b.getAttribute('data-checked'), b.getAttribute('data-checkbox-style')]);
        const zones = await ExportCommon.resolveHeaderFooterVariables(hf, TABLE, GristAPI.getCurrentRecord());
        const prepared = [zones.header.default, zones.footer.default].map(zone => { const box = document.createElement('div'); box.innerHTML = zone; return checkedOf(box); });
        const checks = {
          rowLoop: JSON.stringify(loopRows) === JSON.stringify([['Audit', 'false'], ['Livret', 'true'], ['Déplacement', 'false']]),
          listTitleAndCells: JSON.stringify(listBox) === JSON.stringify(['true']) && JSON.stringify(titleBox) === JSON.stringify(['false']) && JSON.stringify(cellBoxes) === JSON.stringify(['true', 'false']),
          headerFooter: JSON.stringify(headerBoxes) === JSON.stringify([['true', 'classic'], ['false', 'accentPlain']]),
          preparedZones: JSON.stringify(prepared) === JSON.stringify([['true'], ['false']]),
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, loopRows, listBox, titleBox, cellBoxes, headerBoxes, prepared }) };
      } finally { h.setA4Preview(false); closeReader(); }
    },
  });

  // --- La fenêtre de condition (la même que celle d'une bulle ou d'un bloc de texte) ---
  function conditionModal() { return document.getElementById('var-condition-modal'); }
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
  const footerLabels = modal => Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent);
  async function openCheckboxWindow(h, index) {
    await selectChip(h, index || 0);
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }
  // Le libellé entier de la puce : sa tête et sa queue (le milieu se coupe par « … » quand elle est trop longue pour sa place, css/conditional-checkbox.css).
  const labelOf = index => { const v = views()[index || 0]; return v ? Array.from(v.querySelectorAll('.conditional-checkbox-head, .conditional-checkbox-tail')).map(e => e.textContent).join('') : null; };

  cases.push({
    id: 'condcb_condition_window_on_a_box_saves_edits_and_removes',
    description: 'La fenêtre de condition (la même que celle d’une bulle ou d’un bloc) s’ouvre sur une case par le bouton de sa barre : son titre « Condition de la case », son introduction, « Cocher si » devant la combinaison de plusieurs règles, aucun bouton « Défaire le bloc » ni valeur d’aperçu ; elle dit si la case est cochée pour la ligne courante, enregistre sur la case (étiquette « Si Statut = Urgent », contour en pointillés, bleu du bouton de la barre, HTML), se rouvre sur ce qui est posé, et « Retirer la condition » la supprime (Annuler la rétablit)',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Pièce ${chip(null, 'classic')} fournie</p>`);
      await h.sleep(60);
      let modal = await openCheckboxWindow(h);
      const unwrap = Array.from(modal.querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('varCond.unwrapBlock'));
      const opened = {
        open: VariableCondition.isOpen(), title: modal.querySelector('#var-condition-title').textContent, intro: modal.querySelector('.var-modal-intro').textContent,
        pill: !!modal.querySelector('.var-modal-intro .var-badge'), removeHidden: modal.querySelector('.var-modal-danger').hidden, unwrapHidden: !unwrap || unwrap.hidden,
        rows: windowRulesOf(modal).length, footer: footerLabels(modal), barHiddenUnderWindow: !visible(toolbar()), modeHidden: modal.querySelector('.var-condition-mode').hidden,
      };
      modal.querySelector('.var-condition-add').click();
      await h.sleep(40);
      const mode = { shown: !modal.querySelector('.var-condition-mode').hidden, before: modal.querySelector('.var-condition-mode span').textContent };
      modal.querySelectorAll('.macro-rule-remove')[1].click();
      await h.sleep(40);
      const debug = await saveCondition(h, 'Statut', 'Urgent');
      const saved = chipNodes()[0].node.attrs.condition;
      const afterSave = {
        closed: !VariableCondition.isOpen(), label: labelOf(0), has: views()[0].classList.contains('has-condition'), style: chipNodes()[0].node.attrs.style,
        selected: !!ed().state.selection.node && ed().state.selection.node.type.name === 'conditionalCheckbox', htmlHasCondition: ed().getHTML().indexOf('data-condition') !== -1,
      };
      await h.sleep(60);
      const bar = barState();
      const barActive = bar.visible && bar.condition.active && bar.condition.title === I18n.t('varToolbar.conditionCheckbox');
      // Plus de 500 ms entre les deux modifications : l'historique les groupe sinon en une seule (un seul « Annuler » reviendrait avant l'enregistrement).
      await h.sleep(650);
      modal = await openCheckboxWindow(h);
      const reopened = { rules: windowRulesOf(modal), removeHidden: modal.querySelector('.var-modal-danger').hidden };
      modal.querySelector('.var-modal-danger').click();
      await h.sleep(80);
      const afterRemove = { condition: chipNodes()[0].node.attrs.condition, label: labelOf(0), html: ed().getHTML(), closed: !VariableCondition.isOpen() };
      ed().commands.undo();
      await h.sleep(60);
      const afterUndo = chipNodes()[0].node.attrs.condition;
      const checks = {
        windowOpened: opened.open && opened.title === 'Condition de la case' && opened.title === I18n.t('varCond.titleCheckbox') && opened.intro === I18n.t('varCond.introCheckbox') && !opened.pill,
        noRemoveNoUnwrap: opened.removeHidden && opened.unwrapHidden && opened.rows === 1 && opened.footer.join('|') === [I18n.t('common.cancel'), I18n.t('common.save')].join('|'),
        barHiddenUnderTheWindow: opened.barHiddenUnderWindow,
        checkIf: opened.modeHidden && mode.shown && mode.before === 'Cocher si',
        previewSaysChecked: debug[0] === I18n.t('varCond.debug.currentMetCheckbox', { id: 1 }) && debug[0] === 'Ligne sélectionnée (n° 1) : condition remplie, la case est cochée.',
        savedOnTheBox: JSON.stringify(saved) === JSON.stringify(COND_URGENT) && afterSave.style === 'classic',
        afterSave: afterSave.closed && afterSave.label === 'Si Statut = Urgent' && afterSave.has && afterSave.selected && afterSave.htmlHasCondition && barActive,
        reopened: reopened.rules.length === 1 && reopened.rules[0].column === 'Statut' && reopened.rules[0].operator === '=' && reopened.rules[0].value === 'Urgent' && !reopened.removeHidden,
        removed: afterRemove.condition == null && afterRemove.label === I18n.t('condCheckbox.tag.none') && afterRemove.html.indexOf('data-condition') === -1 && afterRemove.closed,
        undone: JSON.stringify(afterUndo) === JSON.stringify(COND_URGENT),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, opened, mode, debug, saved, afterSave, bar: bar.condition, reopened, afterRemove, afterUndo }) };
    },
  });

  cases.push({
    id: 'condcb_condition_window_on_a_box_says_when_the_box_stays_unchecked',
    description: 'Pour une ligne qui ne remplit pas la condition, l’aperçu de la fenêtre dit que la case est décochée, puis donne la première ligne qui la remplit (sans valeur à montrer)',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Pièce ${chip(null)} fournie</p>`);
      await h.sleep(60);
      await openCheckboxWindow(h);
      const debug = await saveCondition(h, 'Statut', 'Normal');
      const checks = {
        notMet: debug[0] === I18n.t('varCond.debug.currentNotMetCheckbox', { id: 1 }) && debug[0] === 'Ligne sélectionnée (n° 1) : condition non remplie, la case est décochée.',
        firstRow: /Première : n° 2 \(Dossier B\)\.$/.test(debug[1] || ''),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, debug }) };
    },
  });

  cases.push({
    id: 'condcb_condition_window_offers_the_same_columns_as_a_variable',
    description: 'Les colonnes proposées dans la fenêtre d’une case sont celles de la fenêtre d’une bulle de la même page (table de la page, tables liées), dans le même ordre',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Dossier <span class="var-badge" data-table="${TABLE}" data-column="Titre" data-key="${TABLE}.Titre"></span> ${chip(null)}</p>`);
      await h.sleep(60);
      const optionsOf = modal => Array.from(modal.querySelectorAll('.macro-rule-row select.macro-rule-column option')).map(o => o.value);
      let badgePos = null;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') badgePos = pos; });
      ed().commands.setNodeSelection(badgePos);
      await h.sleep(80);
      pressToolbarButton('var-condition');
      await h.sleep(80);
      const forBadge = optionsOf(conditionModal());
      cancelWindow(conditionModal());
      await h.sleep(40);
      const modal = await openCheckboxWindow(h);
      const forBox = optionsOf(modal);
      cancelWindow(modal);
      const checks = { sameColumns: forBadge.length > 3 && JSON.stringify(forBadge) === JSON.stringify(forBox), linkedTableColumns: forBox.indexOf('Statut') !== -1 && forBox.some(c => /^CcLignes\./.test(c)) };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, forBadge, forBox }) };
    },
  });

  cases.push({
    id: 'condcb_condition_copy_and_paste_between_a_variable_and_a_box',
    description: 'Copier la condition d’une bulle et la coller dans la fenêtre d’une case (et l’inverse) : la phrase de « Coller » parle de la case ou de la variable, rien n’est écrit avant « Enregistrer »',
    run: async (h) => {
      await seed(h);
      const badge = (column, condition) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
      ed().commands.setContent(`<p>Dossier ${badge('Titre', COND_URGENT)} ${badge('Statut')} ${chip(null)}</p>`);
      await h.sleep(60);
      const clipButtons = modal => { const b = Array.from(modal.querySelectorAll('.var-condition-clip button')); return { copy: b[0], paste: b[1] }; };
      const selectBadgeAt = async column => {
        let pos = null;
        ed().state.doc.descendants((node, p) => { if (node.type.name === 'varBadge' && node.attrs.column === column) pos = p; });
        ed().commands.setNodeSelection(pos);
        await h.sleep(80);
      };
      await selectBadgeAt('Titre');
      pressToolbarButton('var-condition');
      await h.sleep(80);
      clipButtons(conditionModal()).copy.click();
      cancelWindow(conditionModal());
      await h.sleep(40);
      let modal = await openCheckboxWindow(h);
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toBox = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent, stored: chipNodes()[0].node.attrs.condition };
      modal.querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(80);
      const boxSaved = chipNodes()[0].node.attrs.condition;
      // De la case vers une autre bulle.
      modal = await openCheckboxWindow(h);
      clipButtons(modal).copy.click();
      cancelWindow(modal);
      await h.sleep(40);
      await selectBadgeAt('Statut');
      pressToolbarButton('var-condition');
      await h.sleep(80);
      modal = conditionModal();
      clipButtons(modal).paste.click();
      await h.sleep(60);
      const toBadge = { rules: windowRulesOf(modal), status: modal.querySelector('.var-condition-clip-status').textContent };
      cancelWindow(modal);
      const checks = {
        pastedInTheBox: JSON.stringify(toBox.rules) === JSON.stringify(COND_URGENT.rules) && toBox.status === I18n.t('varCond.clip.pastedStatusCheckbox') && toBox.status === 'Condition collée. Enregistrez pour l’appliquer à la case.' && toBox.stored == null,
        savedOnTheBox: JSON.stringify(boxSaved) === JSON.stringify(COND_URGENT),
        pastedInTheBadge: JSON.stringify(toBadge.rules) === JSON.stringify(COND_URGENT.rules) && toBadge.status === I18n.t('varCond.clip.pastedStatus'),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, toBox, boxSaved, toBadge }) };
    },
  });

  cases.push({
    id: 'condcb_condition_window_warns_when_the_box_was_deleted_meanwhile',
    description: 'Si la case est supprimée pendant que sa fenêtre est ouverte, « Enregistrer » ne pose la condition nulle part et le dit (« La case conditionnelle a été déplacée ou supprimée… ») ; la fenêtre se ferme',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Avant ${chip(null)} après</p>`);
      await h.sleep(60);
      const modal = await openCheckboxWindow(h);
      const row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Statut');
      setInput(row.querySelector('.macro-rule-value'), 'Urgent');
      const asked = [];
      const nativeAlert = window.alert;
      window.alert = message => asked.push(message);
      try {
        // La case disparaît de l'éditeur pendant que la fenêtre est ouverte.
        const target = chipNodes()[0];
        ed().view.dispatch(ed().state.tr.delete(target.pos, target.pos + target.node.nodeSize));
        await h.sleep(40);
        modal.querySelector('.var-modal-actions .var-modal-primary').click();
        await h.sleep(80);
      } finally { window.alert = nativeAlert; }
      const checks = {
        warned: asked.length === 1 && asked[0] === I18n.t('varCond.saveLostCheckbox'),
        nothingWritten: ed().getHTML().indexOf('data-condition') === -1 && chipNodes().length === 0,
        closed: !VariableCondition.isOpen(),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, asked, html: ed().getHTML() }) };
    },
  });

  cases.push({
    id: 'condcb_english_interface_entry_tag_bar_and_window',
    description: 'Interface en anglais : entrée « Conditional checkbox », étiquette (« If Statut = Urgent », « no condition »), info-bulles de la barre et fenêtre de condition (« Checkbox condition », « Check if », l’aperçu, « Coller ») en anglais - sans clé manquante dans aucune des deux langues - puis retour au français',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>${chip(COND_URGENT)} ${chip(null)}</p>`);
      await h.sleep(60);
      const keys = ['chips.conditionalCheckbox', 'condCheckbox.tag.none', 'condCheckbox.tag.titleNone', 'varToolbar.conditionCheckbox', 'varToolbar.linkedCheckbox', 'varToolbar.loopCheckbox', 'varCond.titleCheckbox',
        'varCond.introCheckbox', 'varCond.modeBeforeCheckbox', 'varCond.debug.currentMetCheckbox', 'varCond.debug.currentNotMetCheckbox', 'varCond.saveLostCheckbox', 'varCond.clip.pastedStatusCheckbox'];
      const missing = [];
      const lang = I18n.getLang();
      let seen = null;
      try {
        for (const code of ['fr', 'en']) {
          I18n.setLang(code);
          keys.forEach(k => { const text = I18n.t(k, { id: 1, condition: 'x' }); if (!text || text === k || /\{[a-z]+\}/.test(text)) missing.push(code + ':' + k); });
          ['condCheckbox.tag.if', 'condCheckbox.tag.titleIf'].forEach(k => { const text = I18n.t(k, { condition: 'x' }); if (!text || text === k || /\{[a-z]+\}/.test(text)) missing.push(code + ':' + k); });
        }
        I18n.setLang('en');
        await h.sleep(60);
        const labels = [labelOf(0), labelOf(1)];
        const titles = views().map(v => v.title);
        const modal = await openCheckboxWindow(h, 0);
        modal.querySelector('.var-condition-add').click();
        await h.sleep(40);
        const mode = modal.querySelector('.var-condition-mode span').textContent;
        modal.querySelectorAll('.macro-rule-remove')[1].click();
        await h.sleep(750);
        const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
        const clipButtons = Array.from(modal.querySelectorAll('.var-condition-clip button'));
        clipButtons[0].click();
        clipButtons[1].click();
        await h.sleep(40);
        seen = {
          labels, titles, title: modal.querySelector('#var-condition-title').textContent, intro: modal.querySelector('.var-modal-intro').textContent, mode, debug,
          pasted: modal.querySelector('.var-condition-clip-status').textContent,
        };
        cancelWindow(modal);
        await h.sleep(40);
        const bar = barState();
        seen.bar = { condition: bar.condition && bar.condition.title };
      } finally { I18n.setLang(lang); }
      const checks = {
        noMissingKey: missing.length === 0,
        englishTag: !!seen && seen.labels[0] === 'If Statut = Urgent' && seen.labels[1] === 'no condition' && /unchecked/.test(seen.titles[1]) && /^Checked if Statut = Urgent/.test(seen.titles[0]),
        englishWindow: !!seen && seen.title === 'Checkbox condition' && /^This checkbox is checked in read mode/.test(seen.intro) && seen.mode === 'Check if',
        englishPreview: !!seen && seen.debug[0] === 'Selected row (#1): condition met, the checkbox is checked.',
        englishPasted: !!seen && seen.pasted === 'Condition pasted. Save to apply it to the checkbox.',
        englishBar: !!seen && seen.bar.condition === 'Checkbox condition: checked if…',
        backToFrench: I18n.getLang() === lang && labelOf(0) === 'Si Statut = Urgent',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, missing, seen }) };
    },
  });

  // --- Commentaires en Lecture, copier-coller, mode suivi ---
  cases.push({
    id: 'condcb_reading_keeps_the_comment_position_of_the_box',
    description: 'Commentaires en Lecture : la case qui remplace la puce garde son repère de position (data-pp-atom) et la position retrouvée dans le modèle est celle de la puce ; la puce d’une condition non remplie, elle aussi, garde le sien',
    run: async (h) => {
      try {
        await seed(h);
        Editor.setHTML(`<p>Avant ${chip(COND_URGENT)} milieu ${chip(COND_NORMAL)} après</p>`);
        await h.sleep(80);
        const tagged = await Comments.buildReaderHtml();
        const reader = await renderReader(tagged);
        const boxes = Array.from(reader.querySelectorAll('.resolved-checkbox'));
        const found = boxes.map(box => {
          const raw = box.getAttribute('data-pp-atom');
          const pos = raw == null ? NaN : Number(raw.slice(raw.indexOf(':') + 1));
          const node = isNaN(pos) ? null : ed().state.doc.nodeAt(pos);
          return { raw, checked: box.getAttribute('data-checked'), type: node && node.type.name };
        });
        const checks = {
          twoBoxes: boxes.length === 2,
          tagged: found.every(f => f.raw != null),
          positionsAreTheChips: found.every(f => f.type === 'conditionalCheckbox'),
          verdictsKept: found[0].checked === 'true' && found[1].checked === 'false',
          noFrameLeft: reader.querySelectorAll('.conditional-checkbox').length === 0,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, found }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'condcb_copy_and_paste_of_a_box_keeps_its_condition_and_style',
    description: 'Copier une case sélectionnée et la coller ailleurs recrée une case avec sa condition et son style (le HTML copié est celui de l’éditeur : aucun repère de la vue ne s’y glisse)',
    run: async (h) => {
      await seed(h);
      ed().commands.setContent(`<p>Pièce ${chip(COND_URGENT, 'classic')} fournie</p><p>Suite </p>`);
      await h.sleep(80);
      await selectChip(h, 0);
      const { dom } = ed().view.serializeForClipboard(ed().state.selection.content());
      const copied = dom.innerHTML;
      cursorAtEndOf('Suite');
      ed().view.pasteHTML(copied);
      await h.sleep(120);
      const nodes = chipNodes();
      const checks = {
        copiedIsTheSavedForm: copied.indexOf('class="conditional-checkbox"') !== -1 && copied.indexOf('conditional-checkbox-head') === -1 && copied.indexOf('resolved-checkbox') === -1,
        twoBoxes: nodes.length === 2,
        sameConditionAndStyle: nodes.length === 2 && nodes.every(n => JSON.stringify(n.node.attrs.condition) === JSON.stringify(COND_URGENT) && n.node.attrs.style === 'classic'),
        pastedAfterTheText: nodes.length === 2 && nodes[1].pos > nodes[0].pos,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, copied: copied.slice(0, 300), count: nodes.length }) };
    },
  });

  cases.push({
    id: 'condcb_suggest_mode_insertion_is_tracked_accepting_keeps_the_box_refusing_removes_it',
    description: 'En mode suivi, poser une case depuis la liste « # » se suit (case insérée) : « Tout accepter » la garde avec son style, « Tout refuser » la retire',
    run: async (h) => {
      await seed(h);
      const ed0 = ed();
      const results = {};
      let suggest = false;
      try {
        for (const verdict of ['accept', 'reject']) {
          ed0.commands.loadTrackedDocument('<p>Alpha</p><p>Beta</p>');
          if (!suggest) { ed0.commands.toggleSuggestMode(); suggest = true; }
          await h.sleep(80);
          cursorAtEndOf('Alpha');
          ed0.commands.insertContent({ type: 'text', text: ' ' });
          await h.typeText('#');
          await h.sleep(60);
          await openChipsTab(h);
          const picked = await pickEntry(h, I18n.t('chips.conditionalCheckbox'));
          await h.sleep(60);
          const tracked = Editor.getHTML();
          if (verdict === 'accept') ed0.commands.acceptAllSuggestionsChunked(); else ed0.commands.rejectAllSuggestionsChunked();
          await h.sleep(150);
          results[verdict] = { picked, inserted: /<ins[^>]*>[^]*<span class="conditional-checkbox"/.test(tracked), count: chipNodes().length, style: chipNodes()[0] && chipNodes()[0].node.attrs.style, html: Editor.getHTML() };
        }
      } finally { if (suggest) ed0.commands.toggleSuggestMode(); }
      const checks = {
        pickedAndTracked: results.accept.picked && results.accept.inserted && results.reject.picked && results.reject.inserted,
        acceptKeepsIt: results.accept.count === 1 && results.accept.style === 'accentPlain',
        rejectRemovesIt: results.reject.count === 0 && results.reject.html.indexOf('conditional-checkbox') === -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, results }) };
    },
  });

  // --- Les exports ---
  async function docxRuns(html, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, TABLE, Object.assign({}, record), '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return window.TestHelpers.docxParagraphs(new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml'));
  }
  cases.push({
    id: 'condcb_pdf_word_and_email_carry_the_box_of_each_row',
    description: 'Les vrais fichiers suivent la condition de chaque ligne : le PDF peint la case (☑ ou ☐, dans la police de cases de son style et sa couleur), le Word l’écrit dans la police des symboles avec la couleur de son style (« accent, texte barré » ne barre pas le texte qui suit), l’e-mail écrit « [x] » ou « [ ] » ; le style de la case est celui des cases de la variable Oui / Non',
    run: async (h) => {
      await seed(h);
      const html = `<p>${chip(COND_URGENT, 'accentPlain')} Urgent</p><p>${chip(COND_NORMAL, 'classic')} Normal</p><p>${chip(COND_URGENT, 'accentStrike')} Barré</p>`;
      const out = {};
      for (const [key, record] of [['one', RECORD_1], ['two', RECORD_2]]) {
        const r = await h.exportPdfContent(html, null, null, { tableId: TABLE, record: Object.assign({}, record) });
        const runs = r.content.filter(b => b && Array.isArray(b.text)).flatMap(b => b.text).filter(t => t && typeof t === 'object');
        const boxes = runs.filter(t => t.font === 'PPBoxAccent' || t.font === 'PPBoxClassic').map(t => [t.text, t.font, String(t.color).toLowerCase()]);
        const struck = runs.filter(t => Array.isArray(t.decoration) && t.decoration.indexOf('lineThrough') !== -1).map(t => t.text.trim());
        const gt = await h.extractPdfGroundTruth(r.base64);
        const painted = gt.pages[0].textItems.filter(i => i.str === CHECKED || i.str === UNCHECKED).map(i => i.str);
        const paragraphs = await docxRuns(html, record);
        const wordRuns = paragraphs.flatMap(p => p.runs);
        const word = wordRuns.filter(x => x.text === CHECKED || x.text === UNCHECKED).map(x => [x.text, x.font, String(x.color).toUpperCase()]);
        const wordStruck = wordRuns.filter(x => x.strike).map(x => x.text.trim());
        const mail = MailtoExport.plainTextFromHtml(await ReaderMode.preview(html, TABLE, Object.assign({}, record)));
        out[key] = { boxes, struck, painted, word, wordStruck, mail };
      }
      const checks = {
        pdfBoxesRecordOne: JSON.stringify(out.one.boxes) === JSON.stringify([[CHECKED, 'PPBoxAccent', '#2f6fed'], [UNCHECKED, 'PPBoxClassic', '#6b7684'], [CHECKED, 'PPBoxAccent', '#2f6fed']]),
        pdfBoxesRecordTwo: JSON.stringify(out.two.boxes) === JSON.stringify([[UNCHECKED, 'PPBoxAccent', '#767676'], [CHECKED, 'PPBoxClassic', '#222222'], [UNCHECKED, 'PPBoxAccent', '#767676']]),
        pdfPaintsThem: JSON.stringify(out.one.painted) === JSON.stringify([CHECKED, UNCHECKED, CHECKED]) && JSON.stringify(out.two.painted) === JSON.stringify([UNCHECKED, CHECKED, UNCHECKED]),
        pdfStrikesNothing: out.one.struck.length === 0 && out.two.struck.length === 0,
        wordSymbols: JSON.stringify(out.one.word) === JSON.stringify([[CHECKED, 'Segoe UI Symbol', '2F6FED'], [UNCHECKED, 'Segoe UI Symbol', '6B7684'], [CHECKED, 'Segoe UI Symbol', '2F6FED']])
          && JSON.stringify(out.two.word) === JSON.stringify([[UNCHECKED, 'Segoe UI Symbol', '767676'], [CHECKED, 'Segoe UI Symbol', '222222'], [UNCHECKED, 'Segoe UI Symbol', '767676']]),
        wordStrikesNothing: out.one.wordStruck.length === 0 && out.two.wordStruck.length === 0,
        email: out.one.mail.indexOf('[x] Urgent') !== -1 && out.one.mail.indexOf('[ ] Normal') !== -1 && out.two.mail.indexOf('[ ] Urgent') !== -1 && out.two.mail.indexOf('[x] Normal') !== -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, out }) };
    },
  });

  cases.push({
    id: 'condcb_excel_cell_carries_the_box_of_each_row',
    description: 'Excel : la case conditionnelle d’une cellule est un caractère ☑ ou ☐ dans la police des symboles et la couleur de son style, selon la ligne',
    run: async (h) => {
      await seed(h);
      const grid = '<table><tbody><tr>'
        + `<td colwidth="120"><p>${chip(COND_URGENT, 'accentPlain')}</p></td><td colwidth="120"><p>${chip(COND_NORMAL, 'classic')}</p></td>`
        + '</tr></tbody></table>';
      const out = {};
      for (const [key, record] of [['one', RECORD_1], ['two', RECORD_2]]) {
        const { blob } = await XlsxExport.getXlsxBlobForRecord(grid, TABLE, Object.assign({}, record), '', undefined);
        const workbook = new window.ExcelJS.Workbook();
        await workbook.xlsx.load(await blob.arrayBuffer());
        const sheet = workbook.worksheets[0];
        const read = ref => { const c = sheet.getCell(ref); const text = c.value && typeof c.value === 'object' && c.value.richText ? c.value.richText.map(r => r.text).join('') : c.value; return [text, c.font && c.font.name, c.font && c.font.color ? String(c.font.color.argb).toUpperCase() : null]; };
        out[key] = { a1: read('A1'), b1: read('B1') };
      }
      const checks = {
        recordOne: JSON.stringify(out.one.a1) === JSON.stringify([CHECKED, 'Segoe UI Symbol', 'FF2F6FED']) && JSON.stringify(out.one.b1) === JSON.stringify([UNCHECKED, 'Segoe UI Symbol', 'FF6B7684']),
        recordTwo: JSON.stringify(out.two.a1) === JSON.stringify([UNCHECKED, 'Segoe UI Symbol', 'FF767676']) && JSON.stringify(out.two.b1) === JSON.stringify([CHECKED, 'Segoe UI Symbol', 'FF222222']),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, out }) };
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
    id: 'condcb_condition_window_compares_with_another_column_and_the_reader_follows',
    description: 'La fenêtre d’une case a le bouton « autre colonne » des bulles : Montant = Paye (autre colonne) s’enregistre sur la case (étiquette « Si Montant = {Paye} »), la Lecture et l’aperçu d’export la cochent pour la ligne où les deux colonnes s’accordent et la laissent décochée pour l’autre',
    run: async (h) => {
      try {
        await seed(h);
        const stub = window.__gristStub;
        stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric', Paye: 'Numeric' });
        stub.setRows(TABLE, [
          { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200, Paye: 1200 },
          { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50, Paye: 20 },
        ]);
        await GristAPI.refreshSchema();
        const rows = [Object.assign({}, RECORD_1, { Paye: 1200 }), Object.assign({}, RECORD_2, { Paye: 20 })];
        await setRecord(h, rows[0]);
        ed().commands.setContent(`<p>Pièce ${chip(null, 'classic')} fournie</p>`);
        await h.sleep(60);
        const modal = await openCheckboxWindow(h);
        const row = modal.querySelector('.macro-rule-row');
        await pickColumn(h, row, 'Montant');
        const toggle = row.querySelector('.macro-rule-compare');
        if (!toggle) { cancelWindow(modal); return { pass: false, notes: 'bouton « autre colonne » absent de la fenêtre de la case' }; }
        toggle.click();
        await h.sleep(40);
        await pickOtherColumn(h, row, 'Paye');
        await h.sleep(700);
        const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
        modal.querySelector('.var-modal-actions .var-modal-primary').click();
        await h.sleep(80);
        const saved = chipNodes()[0].node.attrs.condition;
        const label = labelOf(0);
        const html = ed().getHTML();
        const read1 = checkedOf(await renderReader(html));
        const prev1 = checkedOf(await previewBox(html));
        await setRecord(h, rows[1]);
        const read2 = checkedOf(await renderReader(html));
        const prev2 = checkedOf(await previewBox(html));
        const pass = debug[0] === I18n.t('varCond.debug.currentMetCheckbox', { id: 1 })
          && JSON.stringify(saved) === JSON.stringify({ mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: 'Paye' }] }) && label === 'Si Montant = {Paye}'
          && JSON.stringify(read1) === '["true"]' && JSON.stringify(prev1) === '["true"]' && JSON.stringify(read2) === '["false"]' && JSON.stringify(prev2) === '["false"]';
        return { pass, notes: JSON.stringify({ debug, saved, label, read1, prev1, read2, prev2 }) };
      } finally { closeReader(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condCheckbox = cases;
})();
