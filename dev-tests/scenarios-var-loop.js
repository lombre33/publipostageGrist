// Suite "varLoop" - boucle sur les lignes liées d'une bulle #Variable (maquette validée par Antoine le 2026-09-28, « nickel pour implémentation ») :
// attribut `loop` du nœud varBadge (js/editor-nodes.js), déroulé en lecture et à l'export (js/loop-rules.js appelé par js/reader-mode.js : render,
// preview, en-têtes/pieds), valeurs lues dans la ligne du tour (js/variables.js:resolveRawValue, opts.loop), icône Boucle de la barre flottante
// (js/floating-toolbars.js), fenêtre (js/variable-loop.js) et autocomplétion # dans une zone répétée (js/variables.js:computeItems).
// Jeu de données fictif de la maquette : factures (table de la page), leurs lignes (liées par Lignes.Facture, rangées par manualSort), leurs
// participants (Choice Presence) et leurs formateurs (colonne Liste de références de la facture, affichée par une colonne d'aide gristHelper_Display
// comme dans le vrai Grist). Aucune ligne pour la facture n° 3 : les choix « si aucune ligne ».
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  // Ligne courante telle que grist.onRecord la livre : la liste de références y arrive décodée (valeurs affichées), jamais sous la forme ["L", ids].
  const RECORD_1 = { id: 1, Numero: 'F-2026-041', Client: 'Atelier Durand', Formateurs: ['Léa Fontaine', 'Karim Benali'] };
  const ROW_LOOP = { repeat: 'row', table: 'LpLignes', empty: 'header' };
  const VIA = { table: 'LpFactures', column: 'Formateurs' };

  function badgeHtml(table, column, loop, condition) {
    const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${loopAttrs}${condition ? attr('data-condition', condition) : ''}></span>`;
  }
  function cell(content, tag) { return `<${tag || 'td'}><p>${content}</p></${tag || 'td'}>`; }
  function linesTable(firstCell, loop) {
    return '<table><tbody>'
      + `<tr>${cell('Désignation', 'th')}${cell('Qté', 'th')}${cell('Facture', 'th')}</tr>`
      + `<tr>${cell(badgeHtml('LpLignes', firstCell || 'Designation', loop || ROW_LOOP))}${cell(badgeHtml('LpLignes', 'Qte'))}${cell(badgeHtml('LpFactures', 'Numero'))}</tr>`
      + '</tbody></table>';
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('LpFormateurs', { Nom: 'Text', Email: 'Text' });
    stub.setVariables('LpFactures', { Numero: 'Text', Client: 'Text', Formateurs: 'RefList:LpFormateurs', gristHelper_Display: 'Any' },
      null, { Formateurs: 'gristHelper_Display' });
    stub.setVariables('LpLignes', { Facture: 'Ref:LpFactures', Designation: 'Text', Qte: 'Numeric', Montant: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setVariables('LpParticipants', { Facture: 'Ref:LpFactures', NomComplet: 'Text', Nom: 'Text', Presence: 'Choice' }, { Presence: ['Présent', 'Absent'] });
    stub.setRows('LpFormateurs', [
      { id: 1, Nom: 'Karim Benali', Email: 'karim@exemple.fr' },
      { id: 2, Nom: 'Léa Fontaine', Email: 'lea@exemple.fr' },
      { id: 3, Nom: 'Sophie Laurent', Email: 'sophie@exemple.fr' },
    ]);
    stub.setRows('LpFactures', [
      { id: 1, Numero: 'F-2026-041', Client: 'Atelier Durand', Formateurs: ['L', 2, 1], gristHelper_Display: ['L', 'Léa Fontaine', 'Karim Benali'] },
      { id: 2, Numero: 'F-2026-042', Client: 'Brasserie Roy', Formateurs: ['L', 3], gristHelper_Display: ['L', 'Sophie Laurent'] },
      { id: 3, Numero: 'F-2026-043', Client: 'Cabinet Morel', Formateurs: null, gristHelper_Display: null },
    ]);
    // manualSort ≠ id : l'ordre de la table dans Grist n'est pas celui de la création des lignes.
    stub.setRows('LpLignes', [
      { id: 1, Facture: 1, Designation: 'Journée de formation intra', Qte: 1, Montant: 1200, manualSort: 2 },
      { id: 2, Facture: 1, Designation: 'Livret stagiaire imprimé', Qte: 12, Montant: 180, manualSort: 1 },
      { id: 3, Facture: 1, Designation: 'Déplacement du formateur', Qte: 1, Montant: 90, manualSort: 3 },
      { id: 4, Facture: 2, Designation: 'Audit', Qte: 1, Montant: 800, manualSort: 4 },
    ]);
    stub.setRows('LpParticipants', [
      { id: 1, Facture: 1, NomComplet: 'Sophie Laurent', Nom: 'Laurent', Presence: 'Présent' },
      { id: 2, Facture: 1, NomComplet: 'Karim Benali', Nom: 'Benali', Presence: 'Présent' },
      { id: 3, Facture: 1, NomComplet: 'Marc Petit', Nom: 'Petit', Presence: 'Absent' },
      { id: 4, Facture: 1, NomComplet: 'Léa Fontaine', Nom: 'Fontaine', Presence: 'Présent' },
      { id: 5, Facture: 1, NomComplet: 'Paul Morel', Nom: 'Morel', Presence: 'Absent' },
      { id: 6, Facture: 2, NomComplet: 'Anne Roy', Nom: 'Roy', Presence: 'Absent' },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['LpLignes', 'LpParticipants', 'LpFormateurs']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('LpLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.saveLinkRule('LpParticipants', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), 'LpFactures');
    await h.sleep(50);
  }

  async function renderReader(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, 'LpFactures', GristAPI.getCurrentRecord(), hf || NO_HF);
    return reader.querySelector('.reader-content');
  }
  async function preview(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, 'LpFactures', record);
    return box;
  }
  function rowTexts(table) {
    return Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()).join(' | '));
  }

  function badgeNodes(ed) {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  // Sélection de la bulle comme un clic (même contournement que scenarios-var-condition.js:selectBadge).
  async function selectBadge(h, key) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = badgeNodes(ed).find(b => b.node.attrs.key === key);
    if (!found) return null;
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return ed;
  }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function toolbarButton(action) { return toolbar().querySelector(`button[data-action="${action}"]`); }
  function pressToolbarButton(action) {
    toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function setSelect(select, value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  function modal() { return document.getElementById('var-loop-modal'); }
  function previewLines() { return Array.from(modal().querySelectorAll('.var-condition-debug-line')).map(l => (l.hidden ? '' : l.textContent)); }
  function sameLists(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function actionButton(label) { return Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === label); }

  cases.push({
    id: 'loop_attr_roundtrip',
    description: 'La boucle d’une bulle survit à l’aller-retour HTML (data-loop, plus data-loop-repeat pour les repères), sans toucher une bulle sans boucle',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'inline', table: 'LpParticipants', separator: ', ', lastSeparator: ' et ', empty: 'hide' };
      Editor.setHTML(`<p>${badgeHtml('LpParticipants', 'NomComplet', loop)} et ${badgeHtml('LpFactures', 'Numero')}</p>`);
      const nodes = badgeNodes(EditorCore.getEditor());
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const spans = box.querySelectorAll('span.var-badge');
      let parsed = null;
      try { parsed = JSON.parse(spans[0].getAttribute('data-loop')); } catch (e) { /* verdict ci-dessous */ }
      const pass = nodes.length === 2 && JSON.stringify(nodes[0].node.attrs.loop) === JSON.stringify(loop) && nodes[1].node.attrs.loop == null
        && JSON.stringify(parsed) === JSON.stringify(loop) && spans[0].getAttribute('data-loop-repeat') === 'inline'
        && !spans[1].hasAttribute('data-loop') && !spans[1].hasAttribute('data-loop-repeat');
      return { pass, notes: JSON.stringify({ attrs: nodes.map(n => n.node.attrs.loop), html }) };
    },
  });

  cases.push({
    id: 'loop_reader_repeats_table_row_per_linked_row',
    description: 'Mode Lecture : la ligne du tableau se répète pour chaque ligne liée, dans l’ordre de la table (manualSort) ; chaque variable de la table parcourue lit sa ligne, format et condition compris, celles de la page restent',
    run: async (h) => {
      await seed(h);
      const money = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
      const qteAboveOne = { mode: 'all', rules: [{ column: 'LpLignes.Qte', operator: '>', value: '1' }] };
      const html = '<table><tbody>'
        + `<tr>${cell('Désignation', 'th')}${cell('Qté', 'th')}${cell('Montant', 'th')}${cell('Facture', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}${cell(badgeHtml('LpLignes', 'Qte', null, qteAboveOne))}`
        + `${cell(badgeHtml('LpLignes', 'Montant').replace('<span ', `<span data-format="${JSON.stringify(money).replace(/"/g, '&quot;')}" `))}`
        + `${cell(badgeHtml('LpFactures', 'Numero'))}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const rows = rowTexts(content.querySelector('table'));
      const fmt = v => Variables.formatValue(v, money, 'LpLignes', 'Montant');
      const expected = [
        'Désignation | Qté | Montant | Facture',
        `Livret stagiaire imprimé | 12 | ${fmt(180)} | F-2026-041`,
        `Journée de formation intra |  | ${fmt(1200)} | F-2026-041`,
        `Déplacement du formateur |  | ${fmt(90)} | F-2026-041`,
      ];
      return { pass: JSON.stringify(rows) === JSON.stringify(expected), notes: JSON.stringify({ rows, expected }) };
    },
  });

  cases.push({
    id: 'loop_export_inline_filter_sort_separators',
    description: 'Export (ReaderMode.preview, commun au PDF, au DOCX et au lot) : bulle en boucle dans la phrase, filtrée (Présent), triée (Nom A → Z), séparateurs « , » et « et »',
    run: async (h) => {
      await seed(h);
      const loop = {
        repeat: 'inline', table: 'LpParticipants', filter: { mode: 'all', rules: [{ column: 'Presence', operator: '=', value: 'Présent' }] },
        sort: { column: 'Nom', direction: 'asc' }, empty: 'hide', separator: ', ', lastSeparator: ' et ',
      };
      const box = await preview(`<p>Ont participé : ${badgeHtml('LpParticipants', 'NomComplet', loop)}.</p>`, GristAPI.getCurrentRecord());
      const text = box.textContent;
      return { pass: text === 'Ont participé : Karim Benali, Léa Fontaine et Sophie Laurent.', notes: JSON.stringify({ text }) };
    },
  });

  cases.push({
    id: 'loop_empty_choices_and_batch_rows',
    description: 'Export en lot (lignes lues par fetchTable) : chaque facture a ses propres lignes ; sans ligne, « en-tête seul », « une ligne de texte », paragraphe masqué, texte à la place, liste retirée',
    run: async (h) => {
      await seed(h);
      const html = linesTable()
        + linesTable('Designation', { repeat: 'row', table: 'LpLignes', empty: 'text', emptyText: 'Aucune ligne' })
        + `<p>Participants : ${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'inline', table: 'LpParticipants', empty: 'hide' })}</p>`
        + `<p>Présents : ${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'inline', table: 'LpParticipants', empty: 'text', emptyText: 'personne' })}</p>`
        + `<ul><li><p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'item', table: 'LpParticipants', empty: 'none' })}</p></li></ul>`
        + '<p>Fin</p>';
      const rows = await GristAPI.fetchTableRows('LpFactures');
      const results = [];
      for (const row of rows) {
        const box = await preview(html, row);
        const tables = box.querySelectorAll('table');
        const textRow = tables[1] ? tables[1].querySelectorAll('tr')[1] : null;
        results.push({
          id: row.id,
          rows: Array.from(tables).map(t => t.querySelectorAll('tr').length),
          textRow: textRow && textRow.children.length === 1 ? textRow.children[0].getAttribute('colspan') + ':' + textRow.textContent.trim() : '',
          paragraphs: Array.from(box.querySelectorAll(':scope > p')).map(p => p.textContent),
          items: box.querySelectorAll('li').length,
        });
      }
      const [first, second, third] = results;
      const pass = JSON.stringify(first.rows) === '[4,4]' && JSON.stringify(second.rows) === '[2,2]' && JSON.stringify(third.rows) === '[1,2]'
        && third.textRow === '3:Aucune ligne'
        && first.paragraphs[0] === 'Participants : Sophie Laurent, Karim Benali, Marc Petit, Léa Fontaine, Paul Morel' && first.items === 5
        && JSON.stringify(third.paragraphs) === JSON.stringify(['Présents : personne', 'Fin']) && third.items === 0 && !third.textRow.includes('undefined');
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'loop_reflist_column_in_cell_order_body_and_header',
    description: 'Colonne Liste de références de la page : la boucle suit l’ordre de la cellule ; la bulle de la colonne montre la fiche du tour, dans la phrase (corps et en-tête) comme dans un élément de liste répété',
    run: async (h) => {
      await seed(h);
      h.setA4Preview(true);
      const inline = { repeat: 'inline', table: 'LpFormateurs', via: VIA, empty: 'hide', separator: ', ', lastSeparator: ' et ' };
      const item = { repeat: 'item', table: 'LpFormateurs', via: VIA, empty: 'none' };
      const hf = {
        enabled: true, differentFirstPage: false,
        header: { default: `<p>Formateurs : ${badgeHtml('LpFactures', 'Formateurs', inline)}</p>`, first: '' },
        footer: { default: '', first: '' },
      };
      const content = await renderReader(`<p>Animée par ${badgeHtml('LpFactures', 'Formateurs', inline)}.</p>`
        + `<ul><li><p>${badgeHtml('LpFactures', 'Formateurs', item)} : ${badgeHtml('LpFormateurs', 'Email')}</p></li></ul>`, hf);
      const reader = document.getElementById('reader-container');
      const header = reader.querySelector('.v2-page-edge-top');
      const headerText = header ? header.textContent.trim() : '';
      const para = content.querySelector('p').textContent;
      const items = Array.from(content.querySelectorAll('li')).map(li => li.textContent);
      h.setA4Preview(false);
      const pass = para === 'Animée par Léa Fontaine et Karim Benali.' && headerText.includes('Formateurs : Léa Fontaine et Karim Benali')
        && JSON.stringify(items) === JSON.stringify(['Léa Fontaine : lea@exemple.fr', 'Karim Benali : karim@exemple.fr']);
      return { pass, notes: JSON.stringify({ para, headerText, items }) };
    },
  });

  // La puce « N° de ligne » (demande d'Antoine du 2026-10-09, point 5.1) : le rang du tour de la zone répétée qui la contient. Elle est posée comme les
  // autres puces (EditorNodes.smartChipHtml) et résolue par ReaderMode.resolveSmartChips avec la liaison du tour (LoopRules.bindingOf).
  const rowNumberChip = () => EditorNodes.smartChipHtml({ kind: 'rowNumber' });

  cases.push({
    id: 'loop_row_number_chip_numbers_the_rows_of_a_table_in_the_order_shown',
    description: 'Puce « N° de ligne » dans la ligne d’un tableau répétée par une Boucle : 1, 2, 3 dans l’ordre où les lignes s’affichent (celui de la table, ou le tri de la boucle), en Lecture et dans l’aperçu des exports ; l’en-tête n’est pas numéroté et la puce ne reste pas dans le rendu',
    run: async (h) => {
      await seed(h);
      const sorted = { repeat: 'row', table: 'LpLignes', sort: { column: 'Designation', direction: 'asc' }, empty: 'header' };
      const html = '<table><tbody>'
        + `<tr>${cell('N°', 'th')}${cell('Désignation', 'th')}</tr>`
        + `<tr>${cell(rowNumberChip())}${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}</tr>`
        + '</tbody></table><table><tbody>'
        + `<tr>${cell('N°', 'th')}${cell('Désignation', 'th')}</tr>`
        + `<tr>${cell(rowNumberChip())}${cell(badgeHtml('LpLignes', 'Designation', sorted))}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const reading = Array.from(content.querySelectorAll('table')).map(rowTexts);
      const box = await preview(html, GristAPI.getCurrentRecord());
      const exported = Array.from(box.querySelectorAll('table')).map(rowTexts);
      const chipsLeft = content.querySelectorAll('.smart-chip').length + box.querySelectorAll('.smart-chip').length;
      const expected = [
        ['N° | Désignation', '1 | Livret stagiaire imprimé', '2 | Journée de formation intra', '3 | Déplacement du formateur'],
        ['N° | Désignation', '1 | Déplacement du formateur', '2 | Journée de formation intra', '3 | Livret stagiaire imprimé'],
      ];
      const pass = JSON.stringify(reading) === JSON.stringify(expected) && JSON.stringify(exported) === JSON.stringify(expected) && chipsLeft === 0;
      return { pass, notes: JSON.stringify({ reading, exported, chipsLeft }) };
    },
  });

  cases.push({
    id: 'loop_row_number_chip_counts_after_the_filter_in_list_items_and_paragraphs',
    description: 'Puce « N° de ligne » dans un élément de liste et dans un paragraphe répétés : le rang compte les lignes retenues, après le filtre et le tri de la boucle (1, 2, 3 sans trou), pas les identifiants des lignes de la table',
    run: async (h) => {
      await seed(h);
      const present = { repeat: 'item', table: 'LpParticipants', filter: { mode: 'all', rules: [{ column: 'Presence', operator: '=', value: 'Présent' }] }, sort: { column: 'Nom', direction: 'asc' }, empty: 'none' };
      const absent = { repeat: 'paragraph', table: 'LpParticipants', filter: { mode: 'all', rules: [{ column: 'Presence', operator: '=', value: 'Absent' }] }, sort: { column: 'Nom', direction: 'asc' }, empty: 'hide' };
      const html = `<ul><li><p>${rowNumberChip()} - ${badgeHtml('LpParticipants', 'NomComplet', present)}</p></li></ul>`
        + `<p>${rowNumberChip()}. ${badgeHtml('LpParticipants', 'NomComplet', absent)}</p>`;
      const box = await preview(html, GristAPI.getCurrentRecord());
      const items = Array.from(box.querySelectorAll('li')).map(li => li.textContent.trim());
      const paragraphs = Array.from(box.querySelectorAll(':scope > p')).map(p => p.textContent.trim());
      const chipsLeft = box.querySelectorAll('.smart-chip').length;
      const pass = JSON.stringify(items) === JSON.stringify(['1 - Karim Benali', '2 - Léa Fontaine', '3 - Sophie Laurent'])
        && JSON.stringify(paragraphs) === JSON.stringify(['1. Paul Morel', '2. Marc Petit']) && chipsLeft === 0;
      return { pass, notes: JSON.stringify({ items, paragraphs, chipsLeft }) };
    },
  });

  cases.push({
    id: 'loop_row_number_chip_restarts_at_one_for_each_page_row_and_is_one_outside_a_zone',
    description: 'Puce « N° de ligne » en lot : chaque ligne de la page repart de 1 (3 lignes pour la facture 1, 1 pour la 2, aucune pour la 3 : en-tête seul) ; hors de toute zone répétée, et dans une zone dont la boucle ne trouve plus sa source, elle vaut 1',
    run: async (h) => {
      await seed(h);
      // Table sans règle de liaison : la boucle n'a plus de source, la zone reste affichée une fois (js/loop-rules.js:expandZones).
      const unlinked = { repeat: 'row', table: 'LpFormateurs', empty: 'header' };
      const html = '<table><tbody>'
        + `<tr>${cell('N°', 'th')}${cell('Désignation', 'th')}</tr>`
        + `<tr>${cell(rowNumberChip())}${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}</tr>`
        + '</tbody></table>'
        + `<p>Hors zone : ${rowNumberChip()}</p>`
        + `<table><tbody><tr>${cell(rowNumberChip())}${cell(badgeHtml('LpFormateurs', 'Nom', unlinked))}</tr></tbody></table>`;
      const rows = await GristAPI.fetchTableRows('LpFactures');
      const results = [];
      for (const row of rows) {
        const box = await preview(html, row);
        const tables = box.querySelectorAll('table');
        results.push({
          id: row.id,
          lines: rowTexts(tables[0]).map(t => t.split(' | ')[0]),
          outside: box.querySelector(':scope > p').textContent,
          unlinked: rowTexts(tables[1])[0].split(' | ')[0],
          chipsLeft: box.querySelectorAll('.smart-chip').length,
        });
      }
      const [first, second, third] = results;
      const pass = JSON.stringify(first.lines) === JSON.stringify(['N°', '1', '2', '3']) && JSON.stringify(second.lines) === JSON.stringify(['N°', '1'])
        && JSON.stringify(third.lines) === JSON.stringify(['N°']) && results.every(r => r.outside === 'Hors zone : 1' && r.unlinked === '1' && r.chipsLeft === 0);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  // === Une boucle dans une boucle (demande d'Antoine du 2026-10-09, point 5.2) ===
  // Les lignes de chaque facture (zone répétée sur LpLignes, liée à la page par une règle) et, dans chaque ligne, ses détails (LpDetails, rattachés à
  // la ligne par la colonne Référence Ligne : aucune règle de liaison à configurer) ; les formateurs de la facture (liste de références de la page) avec
  // leurs compétences (liste de références du formateur) et leurs séances (Référence vers le formateur). Pas de colonne Ordre : le rang vient de la puce.
  async function seedNested(h) {
    await seed(h);
    const stub = window.__gristStub;
    stub.setVariables('LpCompetences', { Nom: 'Text' });
    stub.setVariables('LpFormateurs', { Nom: 'Text', Email: 'Text', Competences: 'RefList:LpCompetences', gristHelper_DisplayC: 'Any' }, null, { Competences: 'gristHelper_DisplayC' });
    stub.setVariables('LpSeances', { Formateur: 'Ref:LpFormateurs', Theme: 'Text', Duree: 'Numeric' });
    stub.setVariables('LpDetails', { Ligne: 'Ref:LpLignes', Libelle: 'Text', Heures: 'Numeric', Statut: 'Choice' }, { Statut: ['Fait', 'À faire'] });
    stub.setVariables('LpEtapes', { Detail: 'Ref:LpDetails', Nom: 'Text' });
    stub.setRows('LpCompetences', [{ id: 1, Nom: 'Excel' }, { id: 2, Nom: 'Pédagogie' }, { id: 3, Nom: 'Qualiopi' }]);
    stub.setRows('LpFormateurs', [
      { id: 1, Nom: 'Karim Benali', Email: 'karim@exemple.fr', Competences: ['L', 1, 2], gristHelper_DisplayC: ['L', 'Excel', 'Pédagogie'] },
      { id: 2, Nom: 'Léa Fontaine', Email: 'lea@exemple.fr', Competences: ['L', 3], gristHelper_DisplayC: ['L', 'Qualiopi'] },
      { id: 3, Nom: 'Sophie Laurent', Email: 'sophie@exemple.fr', Competences: null, gristHelper_DisplayC: null },
    ]);
    stub.setRows('LpSeances', [
      { id: 1, Formateur: 1, Theme: 'Tableaux croisés', Duree: 3 },
      { id: 2, Formateur: 1, Theme: 'Formules', Duree: 4 },
      { id: 3, Formateur: 2, Theme: 'Audit blanc', Duree: 2 },
    ]);
    // Lignes de la facture 1 dans l'ordre de la table : Livret (2), Journée (1), Déplacement (3, sans détail) ; la facture 2 a Audit (4).
    stub.setRows('LpDetails', [
      { id: 1, Ligne: 1, Libelle: 'Préparation', Heures: 2, Statut: 'Fait' },
      { id: 2, Ligne: 1, Libelle: 'Animation', Heures: 7, Statut: 'Fait' },
      { id: 3, Ligne: 2, Libelle: 'Impression', Heures: 1, Statut: 'Fait' },
      { id: 4, Ligne: 2, Libelle: 'Reliure', Heures: 1, Statut: 'À faire' },
      { id: 5, Ligne: 2, Libelle: 'Livraison', Heures: 2, Statut: 'À faire' },
      { id: 6, Ligne: 4, Libelle: 'Analyse', Heures: 3, Statut: 'Fait' },
    ]);
    stub.setRows('LpEtapes', [
      { id: 1, Detail: 3, Nom: 'Maquette' }, { id: 2, Detail: 3, Nom: 'Tirage' }, { id: 3, Detail: 4, Nom: 'Colle' }, { id: 4, Detail: 2, Nom: 'Exercices' },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), 'LpFactures');
    await h.sleep(50);
  }
  const IN_LINE = { table: 'LpDetails', within: 'LpLignes', by: 'Ligne' };
  const DETAIL_ITEMS = Object.assign({ repeat: 'item', empty: 'none' }, IN_LINE);
  function rawCell(html, tag) { return `<${tag || 'td'}>${html}</${tag || 'td'}>`; }
  // Une ligne de la facture dans un tableau : sa désignation (qui porte la boucle de la ligne) puis une cellule de contenu libre.
  function linesWith(inner, header) {
    return '<table><tbody>'
      + `<tr>${cell('Désignation', 'th')}${rawCell(header || '<p>Détail</p>', 'th')}</tr>`
      + `<tr>${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}${rawCell(inner)}</tr>`
      + '</tbody></table>';
  }
  // Pour chaque ligne du tableau (l'en-tête compris) : le texte de sa première cellule, puis les éléments de la seconde.
  function rowsAndParts(table, selector) {
    return Array.from(table.querySelectorAll('tr')).map(tr => {
      const cells = Array.from(tr.children);
      const parts = Array.from(cells[1] ? cells[1].querySelectorAll(selector || 'li') : []).map(el => el.textContent.trim());
      return [cells[0].textContent.trim(), parts];
    });
  }
  const noLoopLeft = box => !box.querySelector('[data-loop]') && !box.querySelector('.error-msg');
  async function eachInvoice(html) {
    const out = [];
    for (const row of await GristAPI.fetchTableRows('LpFactures')) out.push(await preview(html, row));
    return out;
  }

  cases.push({
    id: 'loop_nested_list_in_each_row_reads_the_details_of_that_row_only',
    description: 'Boucle dans une boucle : une liste dans la case de chaque ligne de facture répète les détails de CETTE ligne seulement (rattachés par la colonne Référence, sans règle de liaison), en Lecture et pour chaque facture d’un lot ; une ligne sans détail n’a pas de liste ; une facture sans ligne ne garde que l’en-tête',
    run: async (h) => {
      await seedNested(h);
      if (GristAPI.getLinkRule('LpDetails')) return { pass: false, notes: 'LpDetails ne doit avoir aucune règle de liaison pour cet essai' };
      const html = linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle', DETAIL_ITEMS)}</p></li></ul>`);
      const reading = rowsAndParts((await renderReader(html)).querySelector('table'));
      const boxes = await eachInvoice(html);
      const batch = boxes.map(b => rowsAndParts(b.querySelector('table')));
      const expected1 = [['Désignation', []], ['Livret stagiaire imprimé', ['Impression', 'Reliure', 'Livraison']], ['Journée de formation intra', ['Préparation', 'Animation']], ['Déplacement du formateur', []]];
      const pass = JSON.stringify(reading) === JSON.stringify(expected1) && JSON.stringify(batch[0]) === JSON.stringify(expected1)
        && JSON.stringify(batch[1]) === JSON.stringify([['Désignation', []], ['Audit', ['Analyse']]])
        && JSON.stringify(batch[2]) === JSON.stringify([['Désignation', []]]) && boxes.every(noLoopLeft);
      return { pass, notes: JSON.stringify({ reading, batch }) };
    },
  });

  cases.push({
    id: 'loop_nested_inner_zone_before_the_outer_owner_in_the_document_still_waits_for_its_row',
    description: 'Boucle dans une boucle : la liste de la première case est déroulée APRÈS la ligne qui l’entoure, même quand la bulle qui répète la ligne est dans une case plus loin (ordre du document) ; chaque liste est celle de sa ligne',
    run: async (h) => {
      await seedNested(h);
      // Première case : la liste des détails ; seconde case : la bulle qui répète la ligne du tableau.
      const html = '<table><tbody>'
        + `<tr>${cell('Détail', 'th')}${cell('Désignation', 'th')}</tr>`
        + `<tr>${rawCell(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle', DETAIL_ITEMS)}</p></li></ul>`)}${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const rows = Array.from(content.querySelectorAll('tr')).map(tr => [tr.children[1].textContent.trim(), Array.from(tr.children[0].querySelectorAll('li')).map(li => li.textContent.trim())]);
      const pass = JSON.stringify(rows) === JSON.stringify([['Désignation', []], ['Livret stagiaire imprimé', ['Impression', 'Reliure', 'Livraison']],
        ['Journée de formation intra', ['Préparation', 'Animation']], ['Déplacement du formateur', []]]) && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_inline_paragraph_and_sub_table_repeat_inside_the_cell_of_each_row',
    description: 'Boucle dans une boucle : dans la case de chaque ligne, une bulle « dans la phrase » joint les détails de la ligne, un paragraphe se répète par détail et un tableau dans la case répète sa ligne par détail',
    run: async (h) => {
      await seedNested(h);
      const inline = Object.assign({ repeat: 'inline', empty: 'text', emptyText: 'aucun', separator: ', ', lastSeparator: ' et ' }, IN_LINE);
      const paragraph = Object.assign({ repeat: 'paragraph', empty: 'hide' }, IN_LINE);
      const subRow = Object.assign({ repeat: 'row', empty: 'header' }, IN_LINE);
      const html = linesWith(`<p>Étapes : ${badgeHtml('LpDetails', 'Libelle', inline)}.</p>`
        + `<p>${badgeHtml('LpDetails', 'Libelle', paragraph)} (${badgeHtml('LpDetails', 'Heures')} h)</p>`
        + `<table><tbody><tr>${cell('Détail', 'th')}</tr><tr>${cell(badgeHtml('LpDetails', 'Libelle', subRow))}</tr></tbody></table>`);
      const content = await renderReader(html);
      const rows = Array.from(content.querySelector('table').querySelectorAll(':scope > tbody > tr')).slice(1).map(tr => {
        const cellBox = tr.children[1];
        return {
          line: tr.children[0].textContent.trim(),
          inline: cellBox.querySelector('p').textContent.trim(),
          paragraphs: Array.from(cellBox.querySelectorAll(':scope > p')).slice(1).map(p => p.textContent.trim()),
          sub: Array.from(cellBox.querySelectorAll('table tr')).map(r => r.textContent.trim()),
        };
      });
      const pass = JSON.stringify(rows) === JSON.stringify([
        { line: 'Livret stagiaire imprimé', inline: 'Étapes : Impression, Reliure et Livraison.', paragraphs: ['Impression (1 h)', 'Reliure (1 h)', 'Livraison (2 h)'], sub: ['Détail', 'Impression', 'Reliure', 'Livraison'] },
        { line: 'Journée de formation intra', inline: 'Étapes : Préparation et Animation.', paragraphs: ['Préparation (2 h)', 'Animation (7 h)'], sub: ['Détail', 'Préparation', 'Animation'] },
        { line: 'Déplacement du formateur', inline: 'Étapes : aucun.', paragraphs: [], sub: ['Détail'] },
      ]) && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_filter_sort_empty_text_and_row_numbers_restart_in_each_row',
    description: 'Boucle dans une boucle : le filtre, le tri et « Si aucune ligne » de la boucle intérieure valent pour chaque ligne ; la puce « N° de ligne » compte les lignes de la facture dans la case de la ligne et repart de 1 dans la liste de ses détails',
    run: async (h) => {
      await seedNested(h);
      const todo = Object.assign({ repeat: 'item', empty: 'text', emptyText: 'Rien à faire', filter: { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'À faire' }] }, sort: { column: 'Libelle', direction: 'desc' } }, IN_LINE);
      const html = '<table><tbody>'
        + `<tr>${cell('N°', 'th')}${cell('Désignation', 'th')}${cell('À faire', 'th')}</tr>`
        + `<tr>${cell(rowNumberChip())}${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}`
        + `${rawCell(`<ul><li><p>${rowNumberChip()}/ ${badgeHtml('LpDetails', 'Libelle', todo)}</p></li></ul>`)}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const rows = Array.from(content.querySelectorAll('tr')).slice(1).map(tr => [tr.children[0].textContent.trim(), tr.children[1].textContent.trim(), Array.from(tr.children[2].querySelectorAll('li')).map(li => li.textContent.trim())]);
      const pass = JSON.stringify(rows) === JSON.stringify([
        ['1', 'Livret stagiaire imprimé', ['1/ Reliure', '2/ Livraison']],
        ['2', 'Journée de formation intra', ['Rien à faire']],
        ['3', 'Déplacement du formateur', ['Rien à faire']],
      ]) && content.querySelectorAll('.smart-chip').length === 0 && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_three_levels_each_level_reads_the_row_of_the_zone_just_around_it',
    description: 'Boucle dans une boucle dans une boucle : facture → lignes → détails → étapes ; chaque niveau lit la ligne de la zone qui l’entoure, les variables des niveaux du dessus restent lisibles dans la zone du dessous, et la puce « N° de ligne » compte dans la zone la plus proche',
    run: async (h) => {
      await seedNested(h);
      const steps = { repeat: 'item', table: 'LpEtapes', within: 'LpDetails', by: 'Detail', empty: 'none' };
      const html = '<table><tbody>'
        + `<tr>${cell('Ligne', 'th')}${cell('Détails', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}`
        + `${rawCell(`<ul><li><p>${rowNumberChip()}. ${badgeHtml('LpDetails', 'Libelle', DETAIL_ITEMS)} (de ${badgeHtml('LpLignes', 'Designation')}, ${badgeHtml('LpFactures', 'Numero')})</p>`
          + `<ul><li><p>${rowNumberChip()}) ${badgeHtml('LpEtapes', 'Nom', steps)} de ${badgeHtml('LpDetails', 'Libelle')}</p></li></ul></li></ul>`)}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const rows = Array.from(content.querySelectorAll('table > tbody > tr')).slice(1).map(tr => ({
        line: tr.children[0].textContent.trim(),
        details: Array.from(tr.children[1].querySelectorAll(':scope > ul > li')).map(li => ({
          head: li.querySelector(':scope > p').textContent.trim(),
          steps: Array.from(li.querySelectorAll(':scope > ul > li')).map(s => s.textContent.trim()),
        })),
      }));
      const pass = JSON.stringify(rows) === JSON.stringify([
        { line: 'Livret stagiaire imprimé', details: [
          { head: '1. Impression (de Livret stagiaire imprimé, F-2026-041)', steps: ['1) Maquette de Impression', '2) Tirage de Impression'] },
          { head: '2. Reliure (de Livret stagiaire imprimé, F-2026-041)', steps: ['1) Colle de Reliure'] },
          { head: '3. Livraison (de Livret stagiaire imprimé, F-2026-041)', steps: [] },
        ] },
        { line: 'Journée de formation intra', details: [
          { head: '1. Préparation (de Journée de formation intra, F-2026-041)', steps: [] },
          { head: '2. Animation (de Journée de formation intra, F-2026-041)', steps: ['1) Exercices de Animation'] },
        ] },
        { line: 'Déplacement du formateur', details: [] },
      ]) && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_reflist_competences_and_seances_of_each_trainer',
    description: 'Boucle dans une boucle sur une liste de références : dans la zone répétée pour chaque formateur de la facture (liste de références de la page), ses compétences (liste de références du formateur, dans l’ordre de sa cellule) et ses séances (Référence vers le formateur) ; la bulle de la colonne montre la fiche du tour',
    run: async (h) => {
      await seedNested(h);
      const trainers = { repeat: 'item', table: 'LpFormateurs', via: VIA, empty: 'none' };
      const skills = { repeat: 'inline', table: 'LpCompetences', via: { table: 'LpFormateurs', column: 'Competences' }, empty: 'text', emptyText: 'à définir', separator: ', ', lastSeparator: ' et ' };
      const sessions = { repeat: 'item', table: 'LpSeances', within: 'LpFormateurs', by: 'Formateur', empty: 'none' };
      const html = `<ul><li><p>${badgeHtml('LpFactures', 'Formateurs', trainers)} : ${badgeHtml('LpFormateurs', 'Competences', skills)}</p>`
        + `<ul><li><p>${badgeHtml('LpSeances', 'Theme', sessions)} (${badgeHtml('LpSeances', 'Duree')} h)</p></li></ul></li></ul>`;
      const content = await renderReader(html);
      const rows = Array.from(content.querySelectorAll('li')).filter(li => !li.parentElement.closest('li')).map(li => ({
        head: li.querySelector(':scope > p').textContent.trim(),
        sessions: Array.from(li.querySelectorAll(':scope > ul > li')).map(s => s.textContent.trim()),
      }));
      const pass = JSON.stringify(rows) === JSON.stringify([
        { head: 'Léa Fontaine : Qualiopi', sessions: ['Audit blanc (2 h)'] },
        { head: 'Karim Benali : Excel et Pédagogie', sessions: ['Tableaux croisés (3 h)', 'Formules (4 h)'] },
      ]) && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_a_loop_of_the_page_inside_a_zone_keeps_reading_the_page_row',
    description: 'Une boucle posée sur la page (table liée par une règle, sans rattachement) collée dans une zone répétée garde la ligne de la page : chaque ligne de facture affiche les mêmes participants, comme avant ; même quand elle précède, dans le document, la bulle qui répète la ligne',
    run: async (h) => {
      await seedNested(h);
      const participants = { repeat: 'item', table: 'LpParticipants', sort: { column: 'Nom', direction: 'asc' }, filter: { mode: 'all', rules: [{ column: 'Presence', operator: '=', value: 'Présent' }] }, empty: 'none' };
      const html = '<table><tbody>'
        + `<tr>${cell('Présents', 'th')}${cell('Désignation', 'th')}</tr>`
        + `<tr>${rawCell(`<ul><li><p>${badgeHtml('LpParticipants', 'NomComplet', participants)}</p></li></ul>`)}${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}</tr>`
        + '</tbody></table>';
      const content = await renderReader(html);
      const rows = Array.from(content.querySelectorAll('tr')).slice(1).map(tr => [tr.children[1].textContent.trim(), Array.from(tr.children[0].querySelectorAll('li')).map(li => li.textContent.trim())]);
      const everyone = ['Karim Benali', 'Léa Fontaine', 'Sophie Laurent'];
      const pass = JSON.stringify(rows) === JSON.stringify([['Livret stagiaire imprimé', everyone], ['Journée de formation intra', everyone], ['Déplacement du formateur', everyone]]) && noLoopLeft(content);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'loop_nested_a_loop_that_finds_no_source_leaves_its_zone_once_and_the_other_zones_still_render',
    description: 'Boucle dans une boucle sans source (table englobante qui n’est pas celle de la zone, colonne de rattachement disparue, zone englobante qui ne se déroule pas) : sa zone reste affichée une fois, sans boucle sans fin, et la boucle suivante de la même ligne se déroule',
    run: async (h) => {
      await seedNested(h);
      const wrongTable = { repeat: 'item', table: 'LpDetails', within: 'LpFormateurs', by: 'Ligne', empty: 'none' };
      const goneColumn = { repeat: 'item', table: 'LpDetails', within: 'LpLignes', by: 'Colonne_disparue', empty: 'none' };
      const html = linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle', wrongTable)}</p></li></ul>`
        + `<ul><li><p>${badgeHtml('LpDetails', 'Libelle', goneColumn)}</p></li></ul>`
        + `<ul><li><p>${badgeHtml('LpDetails', 'Libelle', DETAIL_ITEMS)}</p></li></ul>`);
      const content = await renderReader(html);
      const firstRow = content.querySelectorAll('tr')[1];
      const lists = Array.from(firstRow.children[1].querySelectorAll(':scope > ul')).map(ul => ul.querySelectorAll('li').length);
      // Une zone englobante sans source (LpFormateurs n'a pas de règle de liaison) : l'intérieur reste aussi tel quel.
      const lost = '<table><tbody>'
        + `<tr>${cell('Formateur', 'th')}${cell('Séances', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpFormateurs', 'Nom', { repeat: 'row', table: 'LpFormateurs', empty: 'header' }))}`
        + `${rawCell(`<ul><li><p>${badgeHtml('LpSeances', 'Theme', Object.assign({}, { repeat: 'item', table: 'LpSeances', within: 'LpFormateurs', by: 'Formateur', empty: 'none' }))}</p></li></ul>`)}</tr>`
        + '</tbody></table>';
      const lostContent = await renderReader(lost);
      const lostRows = lostContent.querySelectorAll('tr').length;
      const lostItems = lostContent.querySelectorAll('li').length;
      // Les deux premières listes restent affichées une fois (leur bulle montre une erreur de lecture, pas des détails), la troisième est celle des détails.
      const pass = lists.length === 3 && lists[0] === 1 && lists[1] === 1 && lists[2] === 3 && lostRows === 2 && lostItems === 1;
      return { pass, notes: JSON.stringify({ lists, lostRows, lostItems }) };
    },
  });


  // === L'éditeur d'une boucle dans une boucle : l'icône, la fenêtre, la colonne de rattachement, les zones encore libres, l'insertion ===
  const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
  const detailsOfInvoice1 = [['Désignation', []], ['Livret stagiaire imprimé', ['Impression', 'Reliure', 'Livraison']], ['Journée de formation intra', ['Préparation', 'Animation']], ['Déplacement du formateur', []]];
  const repeatChoices = () => Array.from(modal().querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
  const sourceLine = () => modal().querySelector('.var-loop-source').children[0].textContent;

  cases.push({
    id: 'loop_nested_toolbar_icon_follows_the_zone_around_the_bubble',
    description: 'Icône Boucle d’une bulle placée dans une zone répétée : active quand une colonne Référence de sa table désigne la table de la zone (ou que sa colonne est une liste de références d’une autre table), grisée avec son explication sinon - même table : déjà dans la zone ; autre table sans colonne qui y mène : la colonne qui manque - ; hors de toute zone rien ne change',
    run: async (h) => {
      await seedNested(h);
      const trainers = { repeat: 'item', table: 'LpFormateurs', via: VIA, empty: 'none' };
      Editor.setHTML('<table><tbody>'
        + `<tr>${cell('Désignation', 'th')}${cell('Détail', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}${rawCell(`<p>${badgeHtml('LpDetails', 'Libelle')} ${badgeHtml('LpLignes', 'Qte')} ${badgeHtml('LpFormateurs', 'Nom')} ${badgeHtml('LpFactures', 'Numero')}</p>`)}</tr>`
        + '</tbody></table>'
        + `<ul><li><p>${badgeHtml('LpFactures', 'Formateurs', trainers)} ${badgeHtml('LpFormateurs', 'Competences')} ${badgeHtml('LpSeances', 'Theme')} ${badgeHtml('LpDetails', 'Heures')}</p></li></ul>`
        + `<p>${badgeHtml('LpDetails', 'Statut')} ${badgeHtml('LpParticipants', 'NomComplet')}</p>`);
      const states = {};
      for (const key of ['LpDetails.Libelle', 'LpLignes.Qte', 'LpFormateurs.Nom', 'LpFactures.Numero', 'LpFactures.Formateurs', 'LpFormateurs.Competences', 'LpSeances.Theme', 'LpDetails.Heures', 'LpDetails.Statut', 'LpParticipants.NomComplet']) {
        await selectBadge(h, key);
        const btn = toolbarButton('var-loop');
        states[key] = btn ? { disabled: btn.getAttribute('aria-disabled'), active: btn.classList.contains('is-active'), title: btn.title } : null;
      }
      const on = key => !!states[key] && states[key].disabled === 'false' && !states[key].active && states[key].title === I18n.t('varToolbar.loop');
      const off = (key, title) => !!states[key] && states[key].disabled === 'true' && !states[key].active && states[key].title === title;
      const checks = {
        detailsOfTheRowOfTheZone: on('LpDetails.Libelle'),
        sameTableIsAlreadyInTheZone: off('LpLignes.Qte', I18n.t('varToolbar.loopNested', { table: 'LpLignes' })),
        trainerHasNoColumnToTheLines: off('LpFormateurs.Nom', I18n.t('varToolbar.loopNestedNone', { table: 'LpFormateurs', within: 'LpLignes' })),
        pageTableHasNoColumnToTheLines: off('LpFactures.Numero', I18n.t('varToolbar.loopNestedNone', { table: 'LpFactures', within: 'LpLignes' })),
        ownerKeepsItsLoop: !!states['LpFactures.Formateurs'] && states['LpFactures.Formateurs'].disabled === 'false' && states['LpFactures.Formateurs'].active,
        listOfReferencesOfTheZoneTable: on('LpFormateurs.Competences'),
        sessionsOfTheTrainer: on('LpSeances.Theme'),
        detailsHaveNoColumnToTheTrainers: off('LpDetails.Heures', I18n.t('varToolbar.loopNestedNone', { table: 'LpDetails', within: 'LpFormateurs' })),
        outsideAnyZoneNothingChanged: off('LpDetails.Statut', I18n.t('varToolbar.loopDisabled')) && on('LpParticipants.NomComplet'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, states }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_nested_window_names_the_rows_of_the_zone_previews_on_one_of_them_saves_and_reads',
    description: 'Fenêtre Boucle d’une bulle dans une zone répétée : « Lignes de … rattachées à chaque ligne de … par … » sans « Modifier le lien », aperçu sur la première ligne de la zone qui a des lignes rattachées puis sur toutes ses lignes, « Enregistrer » écrit la table englobante et la colonne de rattachement, la fenêtre rouverte les montre (Retirer compris) et la Lecture répète les détails de chaque ligne',
    run: async (h) => {
      await seedNested(h);
      Editor.setHTML(linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle')}</p></li></ul>`));
      let ed = await selectBadge(h, 'LpDetails.Libelle');
      pressToolbarButton('var-loop');
      await h.sleep(700);
      const m = modal();
      const opened = visible(m) && !toolbar().classList.contains('visible');
      const title = m.querySelector('h3').textContent;
      const source = { text: sourceLine(), linkShown: visible(m.querySelector('.var-loop-link')), pickShown: visible(m.querySelector('.var-loop-by')) };
      const segs = repeatChoices();
      const lines = previewLines();
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpDetails.Libelle').node.attrs.loop;
      const reading = rowsAndParts((await renderReader(Editor.getHTML())).querySelector('table'));
      ed = await selectBadge(h, 'LpDetails.Libelle');
      const active = toolbarButton('var-loop').classList.contains('is-active');
      pressToolbarButton('var-loop');
      await h.sleep(500);
      const again = { text: sourceLine(), removeShown: !m.querySelector('.var-modal-danger').hidden, lines: previewLines() };
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      const checks = {
        windowOpened: opened,
        title: title === I18n.t('varLoop.title', { table: 'LpDetails' }),
        sourceNamesTheRows: source.text === I18n.t('varLoop.source.within', { table: 'LpDetails', within: 'LpLignes', via: 'LpDetails.Ligne' }) && !source.linkShown && !source.pickShown,
        listItemIsChosenFirst: JSON.stringify(segs) === JSON.stringify(['item*', 'inline']),
        previewOnTheFirstRowWithDetails: lines[0] === I18n.t('varLoop.preview.nested.linked', { id: 1, within: 'LpLignes', count: 2 }) + ' ' + I18n.t('varLoop.preview.item', { count: 2, values: 'Préparation, Animation' }),
        previewOverEveryRowOfTheZone: lines[1] === I18n.t('varLoop.stats.some', { table: 'LpLignes', count: 3, total: 4, id: 3, effect: lowerFirst(I18n.t('varLoop.effect.none')) }),
        savedWithinAndBy: JSON.stringify(saved) === JSON.stringify({ repeat: 'item', table: 'LpDetails', within: 'LpLignes', by: 'Ligne', empty: 'none' }),
        readingRepeatsTheDetailsOfEachLine: JSON.stringify(reading) === JSON.stringify(detailsOfInvoice1),
        iconIsActive: active,
        reopenedWithItsSource: again.text === source.text && again.removeShown && JSON.stringify(again.lines) === JSON.stringify(lines),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, title, source, segs, lines, saved, reading, again }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_nested_window_asks_which_column_attaches_the_rows_when_several_lead_to_the_zone',
    description: 'Deux colonnes Référence de la table mènent à la table de la zone : la fenêtre Boucle montre une liste avec recherche des deux (la première choisie), l’aperçu suit le choix, « Enregistrer » écrit la colonne choisie et la Lecture rattache les lignes par elle ; rouverte, la liste montre ce choix',
    run: async (h) => {
      await seedNested(h);
      const stub = window.__gristStub;
      stub.setVariables('LpLiens', { Ligne: 'Ref:LpLignes', Origine: 'Ref:LpLignes', Nom: 'Text' });
      stub.setRows('LpLiens', [{ id: 1, Ligne: 1, Origine: 2, Nom: 'A' }, { id: 2, Ligne: 1, Origine: 1, Nom: 'B' }, { id: 3, Ligne: 2, Origine: 1, Nom: 'C' }]);
      await GristAPI.refreshSchema();
      stub.fireRecord(Object.assign({}, RECORD_1), 'LpFactures');
      await h.sleep(50);
      Editor.setHTML(linesWith(`<ul><li><p>${badgeHtml('LpLiens', 'Nom')}</p></li></ul>`));
      let ed = await selectBadge(h, 'LpLiens.Nom');
      pressToolbarButton('var-loop');
      await h.sleep(700);
      const m = modal();
      const pick = () => m.querySelector('#var-loop-by');
      const picker = () => ({ shown: visible(m.querySelector('.var-loop-by')), trigger: visible(m.querySelector('.var-loop-by .ss-trigger')), value: pick().value, label: (m.querySelector('.var-loop-by .ss-trigger') || { textContent: '' }).textContent });
      const first = { text: sourceLine(), values: Array.from(pick().options).map(o => o.value), picker: picker(), lines: previewLines() };
      setSelect(pick(), 'Origine');
      await h.sleep(700);
      const second = { picker: picker(), lines: previewLines() };
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpLiens.Nom').node.attrs.loop;
      const reading = rowsAndParts((await renderReader(Editor.getHTML())).querySelector('table'));
      ed = await selectBadge(h, 'LpLiens.Nom');
      pressToolbarButton('var-loop');
      await h.sleep(500);
      const reopened = picker();
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      const list = (count, values) => I18n.t('varLoop.preview.item', { count, values });
      const head = count => I18n.t('varLoop.preview.nested.linked', { id: 1, within: 'LpLignes', count });
      const checks = {
        pickerListsBothColumns: first.picker.shown && first.picker.trigger && JSON.stringify(first.values) === JSON.stringify(['Ligne', 'Origine']) && first.picker.value === 'Ligne' && first.picker.label.indexOf('Ligne') !== -1,
        sourceSentenceEndsOnTheList: first.text === I18n.t('varLoop.source.withinPick', { table: 'LpLiens', within: 'LpLignes' }),
        previewFollowsTheFirstColumn: first.lines[0] === head(2) + ' ' + list(2, 'A, B'),
        previewFollowsTheChosenColumn: second.picker.value === 'Origine' && second.lines[0] === head(2) + ' ' + list(2, 'B, C'),
        savedWithTheChosenColumn: JSON.stringify(saved) === JSON.stringify({ repeat: 'item', table: 'LpLiens', within: 'LpLignes', by: 'Origine', empty: 'none' }),
        readingFollowsTheChosenColumn: JSON.stringify(reading) === JSON.stringify([['Désignation', []], ['Livret stagiaire imprimé', ['A']], ['Journée de formation intra', ['B', 'C']], ['Déplacement du formateur', []]]),
        reopenedOnTheChosenColumn: reopened.shown && reopened.value === 'Origine' && reopened.label.indexOf('Origine') !== -1,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, first, second, saved, reading, reopened }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_nested_window_offers_only_the_zones_that_nobody_repeats_yet',
    description: 'Une zone n’a qu’une boucle : la bulle d’une case du tableau répété ne propose pas la ligne de sa case (déjà répétée par une autre bulle) mais « la variable, dans sa cellule » ; dans une liste de la case : l’élément de liste ; dans un tableau de la case : la ligne de ce tableau, qui répète alors les détails de chaque ligne en Lecture ; la bulle qui répète la ligne garde tous ses choix',
    run: async (h) => {
      await seedNested(h);
      const para = linesWith(`<p>${badgeHtml('LpDetails', 'Libelle')}</p>`);
      const list = linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Heures')}</p></li></ul>`);
      const sub = linesWith(`<table><tbody><tr><td><p>${badgeHtml('LpDetails', 'Statut')}</p></td></tr></tbody></table>`);
      Editor.setHTML(para + '<p>entre</p>' + list + '<p>entre</p>' + sub);
      const choicesOf = async key => {
        await selectBadge(h, key);
        pressToolbarButton('var-loop');
        await h.sleep(400);
        const out = { segs: repeatChoices(), labels: Array.from(modal().querySelectorAll('.var-loop-seg button')).map(b => b.textContent) };
        actionButton(I18n.t('common.cancel')).click();
        await h.sleep(60);
        return out;
      };
      const inParagraph = await choicesOf('LpDetails.Libelle');
      const inList = await choicesOf('LpDetails.Heures');
      const inSubTable = await choicesOf('LpDetails.Statut');
      const owner = await choicesOf('LpLignes.Designation');
      // Le tableau de la case répète ses lignes : les détails de chaque ligne de la facture, en tableau.
      Editor.setHTML(sub);
      const ed = await selectBadge(h, 'LpDetails.Statut');
      pressToolbarButton('var-loop');
      await h.sleep(400);
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpDetails.Statut').node.attrs.loop;
      const inner = Array.from((await renderReader(Editor.getHTML())).querySelectorAll('table > tbody > tr, table > tr')).filter(tr => tr.closest('td')).map(tr => tr.textContent.trim());
      const checks = {
        paragraphOfTheCell: JSON.stringify(inParagraph.segs) === JSON.stringify(['inline*']) && inParagraph.labels[0] === I18n.t('varLoop.repeat.cell'),
        listOfTheCell: JSON.stringify(inList.segs) === JSON.stringify(['item*', 'inline']),
        tableOfTheCell: JSON.stringify(inSubTable.segs) === JSON.stringify(['row*', 'inline']),
        ownerKeepsEveryChoice: JSON.stringify(owner.segs) === JSON.stringify(['row*', 'inline']),
        subTableSaved: !!saved && saved.repeat === 'row' && saved.table === 'LpDetails' && saved.within === 'LpLignes' && saved.by === 'Ligne',
        subTableReadsTheDetailsOfEachLine: JSON.stringify(inner) === JSON.stringify(['Fait', 'À faire', 'À faire', 'Fait', 'Fait']),
      };
      const failed = Object.keys(checks).filter(k => checks[k] !== true);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, inParagraph, inList, inSubTable, owner, saved, inner }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_nested_autocomplete_and_insertion_need_no_link_inside_a_zone',
    description: 'Autocomplétion # dans une boucle dans une boucle : les colonnes de la zone la plus proche en tête, puis celles de la zone qui l’entoure, puis la page ; une variable dont la table se rattache à la zone (colonne Référence) s’insère sans demander de lien, une autre table pas encore liée le demande toujours',
    run: async (h) => {
      await seedNested(h);
      const detailItems = { repeat: 'item', table: 'LpDetails', within: 'LpLignes', by: 'Ligne', empty: 'none' };
      Editor.setHTML(linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle', detailItems)} : </p></li></ul>`) + '<p>Fin</p>');
      const escape = async () => {
        document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.sleep(40);
      };
      const tablesOfTheList = () => Array.from(document.querySelectorAll('.ac-item')).map(i => (i.textContent.match(/\bLp[A-Za-z]+(?=\.)/) || [''])[0]).filter((t, i, all) => t && all.indexOf(t) === i).slice(0, 3);
      // Dans l'élément de liste de la zone des détails, dans celle des lignes, dans la page.
      await h.focusInElement(document.querySelector('.tiptap li p'));
      await h.typeText(' #');
      await h.sleep(80);
      const inDetails = tablesOfTheList();
      await escape();
      await h.focusInElement(document.querySelectorAll('.tiptap tr')[1].children[0].querySelector('p'));
      await h.typeText(' #');
      await h.sleep(80);
      const inLines = tablesOfTheList();
      await escape();
      await h.focusInElement(document.querySelector('.tiptap > p:last-child'));
      await h.typeText(' #');
      await h.sleep(80);
      const outside = tablesOfTheList();
      await escape();
      // Une variable de LpEtapes (Référence vers LpDetails, pas vers LpLignes) dans la zone des détails : la zone des détails est la plus proche, elle s'y rattache.
      await h.focusInElement(document.querySelector('.tiptap li p'));
      await h.typeText(' #LpEtapes.No');
      await h.sleep(80);
      const pick = Array.from(document.querySelectorAll('.ac-item')).find(i => i.textContent.indexOf('LpEtapes.Nom') !== -1);
      if (pick) pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(150);
      const askedForEtapes = visible(document.getElementById('link-config-modal'));
      if (askedForEtapes) { document.getElementById('link-config-cancel').click(); await h.sleep(80); }
      // Une variable de LpFormateurs (aucune colonne vers la zone des détails) : la clé de correspondance est demandée comme avant.
      await h.focusInElement(document.querySelector('.tiptap li p'));
      await h.typeText(' #LpFormateurs.Em');
      await h.sleep(80);
      const other = Array.from(document.querySelectorAll('.ac-item')).find(i => i.textContent.indexOf('LpFormateurs.Email') !== -1);
      if (other) other.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(150);
      const askedForTrainers = visible(document.getElementById('link-config-modal'));
      if (askedForTrainers) { document.getElementById('link-config-cancel').click(); await h.sleep(80); }
      const keys = badgeNodes(EditorCore.getEditor()).map(b => b.node.attrs.key);
      const checks = {
        detailsThenLinesThenPage: JSON.stringify(inDetails) === JSON.stringify(['LpDetails', 'LpLignes', 'LpFactures']),
        linesThenPageInTheLines: JSON.stringify(inLines.slice(0, 2)) === JSON.stringify(['LpLignes', 'LpFactures']),
        pageFirstOutside: outside[0] === 'LpFactures',
        etapesFound: !!pick && !askedForEtapes && keys.indexOf('LpEtapes.Nom') !== -1 && !GristAPI.getLinkRule('LpEtapes'),
        otherTableStillAsksForTheKey: !!other && askedForTrainers && keys.indexOf('LpFormateurs.Email') === -1,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, inDetails, inLines, outside, askedForEtapes, askedForTrainers, keys }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_nested_condition_on_a_column_of_a_zone_table_asks_for_no_key',
    description: 'Fenêtre de condition d’une bulle dans une zone répétée dans une autre : une colonne de la table de la zone, ou de la zone qui l’entoure, se choisit sans clé de correspondance (elle se lit dans la ligne du tour) ; hors de toute zone, la même colonne demande toujours la clé',
    run: async (h) => {
      await seedNested(h);
      await GristAPI.deleteLinkRule('LpLignes');
      const detailItems = { repeat: 'item', table: 'LpDetails', within: 'LpLignes', by: 'Ligne', empty: 'none' };
      Editor.setHTML(linesWith(`<ul><li><p>${badgeHtml('LpDetails', 'Libelle', detailItems)} ${badgeHtml('LpDetails', 'Statut')}</p></li></ul>`) + `<p>${badgeHtml('LpFactures', 'Numero')}</p>`);
      const conditionModal = () => document.getElementById('var-condition-modal');
      const linkModal = () => document.getElementById('link-config-modal');
      const chooseColumn = async (key, column) => {
        await selectBadge(h, key);
        pressToolbarButton('var-condition');
        await h.sleep(150);
        setSelect(conditionModal().querySelector('select.macro-rule-column'), column);
        await h.sleep(200);
        const asked = visible(linkModal());
        if (asked) { document.getElementById('link-config-cancel').click(); await h.sleep(80); }
        const kept = conditionModal().querySelector('select.macro-rule-column').value;
        conditionModal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
        await h.sleep(80);
        return { asked, kept };
      };
      const ownTable = await chooseColumn('LpDetails.Statut', 'LpDetails.Heures');
      const tableAround = await chooseColumn('LpDetails.Statut', 'LpLignes.Qte');
      const outside = await chooseColumn('LpFactures.Numero', 'LpDetails.Heures');
      const checks = {
        zoneTableNeedsNoKey: !ownTable.asked && ownTable.kept === 'LpDetails.Heures',
        tableAroundNeedsNoKey: !tableAround.asked && tableAround.kept === 'LpLignes.Qte',
        outsideAnyZoneAsksForTheKey: outside.asked && outside.kept !== 'LpDetails.Heures',
        noRuleWritten: !GristAPI.getLinkRule('LpDetails') && !GristAPI.getLinkRule('LpLignes'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, ownTable, tableAround, outside }) : 'ok' };
    },
  });

  cases.push({
    id: 'loop_toolbar_icon_states',
    description: 'Icône Boucle : active pour une variable liée à plusieurs lignes ou une liste de références, grisée avec son explication pour une colonne de la page, bleue quand la boucle est posée, grisée dans une zone déjà répétée',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('LpParticipants', 'NomComplet')} ${badgeHtml('LpFactures', 'Numero')} ${badgeHtml('LpFactures', 'Formateurs')}</p>` + linesTable());
      const states = {};
      for (const key of ['LpParticipants.NomComplet', 'LpFactures.Numero', 'LpFactures.Formateurs', 'LpLignes.Designation', 'LpLignes.Qte']) {
        await selectBadge(h, key);
        const btn = toolbarButton('var-loop');
        states[key] = btn ? { disabled: btn.getAttribute('aria-disabled'), active: btn.classList.contains('is-active'), title: btn.title } : null;
      }
      const s = states;
      const pass = !!s['LpParticipants.NomComplet'] && s['LpParticipants.NomComplet'].disabled === 'false' && !s['LpParticipants.NomComplet'].active
        && s['LpParticipants.NomComplet'].title === I18n.t('varToolbar.loop')
        && s['LpFactures.Numero'].disabled === 'true' && s['LpFactures.Numero'].title === I18n.t('varToolbar.loopDisabled')
        && s['LpFactures.Formateurs'].disabled === 'false'
        && s['LpLignes.Designation'].disabled === 'false' && s['LpLignes.Designation'].active
        && s['LpLignes.Qte'].disabled === 'true' && s['LpLignes.Qte'].title === I18n.t('varToolbar.loopNested', { table: 'LpLignes' });
      return { pass, notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'loop_window_table_row_preview_sort_save_remove',
    description: 'Fenêtre Boucle sur une ligne de tableau : lien affiché, « La ligne du tableau » choisie, aperçu (ligne sélectionnée et toutes les factures), tri enregistré, repère sur la ligne, Retirer',
    run: async (h) => {
      await seed(h);
      h.setA4Preview(true);
      Editor.setHTML('<table><tbody>'
        + `<tr>${cell('Désignation', 'th')}${cell('Qté', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation'))}${cell(badgeHtml('LpLignes', 'Qte'))}</tr>`
        + '</tbody></table>');
      let ed = await selectBadge(h, 'LpLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(700);
      const m = modal();
      const opened = visible(m) && !toolbar().classList.contains('visible');
      const title = m.querySelector('h3').textContent;
      const source = m.querySelector('.var-loop-source').textContent;
      const segs = Array.from(m.querySelectorAll('.var-loop-seg button')).map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
      const before = previewLines();
      setSelect(m.querySelector('#var-loop-sort'), 'Montant');
      await h.sleep(700);
      const directionLabels = Array.from(m.querySelectorAll('.var-loop-sort-row select')[1].options).map(o => o.textContent);
      const sorted = previewLines();
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpLignes.Designation').node.attrs.loop;
      const closed = !visible(m);
      const firstCell = document.querySelector('.tiptap tr:nth-child(2) > td');
      const tint = getComputedStyle(firstCell).backgroundColor;
      const tab = getComputedStyle(firstCell, '::before');
      const tabShown = tab.content !== 'none' && tab.width === '20px' && tab.position === 'absolute';
      const headerTint = getComputedStyle(document.querySelector('.tiptap tr:first-child > th')).backgroundColor;
      ed = await selectBadge(h, 'LpLignes.Designation');
      const activeAfterSave = toolbarButton('var-loop').classList.contains('is-active');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const removeBtn = m.querySelector('.var-modal-danger');
      const removeShown = !removeBtn.hidden && removeBtn.textContent === I18n.t('varLoop.remove');
      removeBtn.click();
      await h.sleep(100);
      const afterRemove = badgeNodes(ed).find(b => b.node.attrs.key === 'LpLignes.Designation').node.attrs.loop;
      const tintAfterRemove = getComputedStyle(document.querySelector('.tiptap tr:nth-child(2) > td')).backgroundColor;
      h.setA4Preview(false);
      const pass = opened && closed && title === I18n.t('varLoop.title', { table: 'LpLignes' })
        && source.includes(I18n.t('varLoop.source.link', { table: 'LpLignes', via: 'LpLignes.Facture' }))
        && JSON.stringify(segs) === JSON.stringify([I18n.t('varLoop.repeat.row') + '*', I18n.t('varLoop.repeat.cell')])
        && before[0].startsWith('Ligne sélectionnée (n° 1) : 3 lignes liées.')
        && before[0] === I18n.t('varLoop.preview.linked', { id: 1, count: 3 }) + ' '
          + I18n.t('varLoop.preview.row', { count: 3, values: 'Livret stagiaire imprimé, Journée de formation intra, Déplacement du formateur' })
        && before[1] === I18n.t('varLoop.stats.some', { table: 'LpFactures', count: 2, total: 3, id: 3, effect: 'le tableau garde son en-tête seul.' })
        && JSON.stringify(directionLabels) === JSON.stringify([I18n.t('varLoop.sort.asc'), I18n.t('varLoop.sort.desc')])
        && sorted[0].endsWith(I18n.t('varLoop.preview.row', { count: 3, values: 'Déplacement du formateur, Livret stagiaire imprimé, Journée de formation intra' }))
        && JSON.stringify(saved) === JSON.stringify({ repeat: 'row', table: 'LpLignes', sort: { column: 'Montant', direction: 'asc' }, empty: 'header' })
        && tint === 'rgb(245, 249, 255)' && tabShown && headerTint !== tint && activeAfterSave && removeShown && afterRemove == null && tintAfterRemove !== tint;
      return { pass, notes: JSON.stringify({ opened, closed, title, source, segs, before, directionLabels, sorted, saved, tint, tabShown, headerTint, activeAfterSave, removeShown, afterRemove, tintAfterRemove }) };
    },
  });

  cases.push({
    id: 'loop_window_row_choice_is_greyed_when_a_merged_cell_crosses_the_row',
    description: 'Fenêtre Boucle : « La ligne du tableau » est grisée (jamais retirée), avec sa raison en info-bulle, quand une case fusionnée sur plusieurs lignes traverse la ligne de la bulle (la copie casserait le tableau) : la bulle seule dans sa cellule est choisie d\'office, un clic sur le choix grisé ne change rien ; une ligne que rien ne traverse garde les deux choix',
    run: async (h) => {
      await seed(h);
      // Première table : « Lot » est fusionnée sur les deux lignes, la bulle Qté est dans la première. Seconde table : aucune fusion, la bulle Designation.
      Editor.setHTML('<table><tbody>'
        + `<tr><td rowspan="2"><p>Lot</p></td>${cell(badgeHtml('LpLignes', 'Qte'))}</tr>`
        + `<tr>${cell('suite')}</tr>`
        + '</tbody></table><p>entre</p><table><tbody>'
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation'))}${cell('x')}</tr>`
        + '</tbody></table>');
      const state = () => {
        const buttons = Array.from(modal().querySelectorAll('.var-loop-seg button'));
        return buttons.map(b => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed') === 'true', disabled: b.getAttribute('aria-disabled') === 'true', title: b.title, opacity: Number(getComputedStyle(b).opacity) }));
      };
      let ed = await selectBadge(h, 'LpLignes.Qte');
      pressToolbarButton('var-loop');
      await h.sleep(500);
      const merged = state();
      const rowButton = Array.from(modal().querySelectorAll('.var-loop-seg button')).find(b => b.dataset.repeat === 'row');
      rowButton.click();
      await h.sleep(60);
      const afterClick = state();
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpLignes.Qte').node.attrs.loop;
      ed = await selectBadge(h, 'LpLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(500);
      const plain = state();
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(100);
      const pass = merged.length === 2 && merged[0].text === I18n.t('varLoop.repeat.row') && merged[0].disabled && merged[0].title === I18n.t('varLoop.repeat.rowMerged') && merged[0].opacity < 0.6 && !merged[0].pressed
        && merged[1].pressed && !merged[1].disabled && sameLists(afterClick, merged) && saved && saved.repeat === 'inline'
        && plain.length === 2 && !plain[0].disabled && plain[0].pressed && !plain[1].disabled && plain[0].title === '';
      return { pass, notes: JSON.stringify({ merged, afterClick: afterClick.map(b => [b.pressed, b.disabled]), saved, plain }) };
    },
  });

  cases.push({
    id: 'loop_window_inline_filter_separators_reader',
    description: 'Fenêtre Boucle dans une phrase : séparateurs, filtre sur les colonnes de la table parcourue (choix de la colonne Choice), tri A → Z, aperçu « 3 lignes sur 5 », puis la phrase en lecture',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Ont participé : ${badgeHtml('LpParticipants', 'NomComplet')}.</p>`);
      const ed = await selectBadge(h, 'LpParticipants.NomComplet');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const m = modal();
      const segs = Array.from(m.querySelectorAll('.var-loop-seg button')).map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
      const seps = m.querySelector('.var-loop-seps');
      const separators = !seps.hidden ? [m.querySelector('#var-loop-sep').value, m.querySelector('#var-loop-last').value] : null;
      m.querySelector('.var-loop-filter .var-condition-add').click();
      await h.sleep(50);
      const row = m.querySelector('.var-loop-filter .macro-rule-row');
      const columns = Array.from(row.querySelectorAll('select.macro-rule-column option')).map(o => o.value).filter(v => v && v !== '__advanced__');
      setSelect(row.querySelector('select.macro-rule-column'), 'Presence');
      await h.sleep(50);
      const valueSelect = m.querySelector('.var-loop-filter .macro-rule-row select.macro-rule-value');
      const choices = valueSelect ? Array.from(valueSelect.options).map(o => o.value).filter(v => v && v !== '__advanced_value__') : null;
      if (valueSelect) setSelect(valueSelect, 'Présent');
      setSelect(m.querySelector('#var-loop-sort'), 'Nom');
      await h.sleep(700);
      const directionLabels = Array.from(m.querySelectorAll('.var-loop-sort-row select')[1].options).map(o => o.textContent);
      const lines = previewLines();
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed)[0].node.attrs.loop;
      const badge = document.querySelector('.tiptap .var-badge');
      const icon = getComputedStyle(badge).backgroundImage;
      const content = await renderReader(Editor.getHTML());
      const text = content.textContent;
      const pass = JSON.stringify(segs) === JSON.stringify([I18n.t('varLoop.repeat.inline') + '*', I18n.t('varLoop.repeat.paragraph')])
        && JSON.stringify(separators) === JSON.stringify([', ', I18n.t('varLoop.lastSeparatorDefault')])
        && JSON.stringify(columns) === JSON.stringify(['Facture', 'NomComplet', 'Nom', 'Presence'])
        && JSON.stringify(choices) === JSON.stringify(['Présent', 'Absent'])
        && JSON.stringify(directionLabels) === JSON.stringify([I18n.t('varLoop.sort.az'), I18n.t('varLoop.sort.za')])
        && lines[0] === I18n.t('varLoop.preview.kept', { id: 1, count: 3, total: 5 }) + ' '
          + I18n.t('varLoop.preview.inline', { text: 'Karim Benali, Léa Fontaine' + I18n.t('varLoop.lastSeparatorDefault') + 'Sophie Laurent' })
        && lines[1].startsWith('Dans « LpFactures » : 1 ligne sur 3 a au moins une ligne retenue.')
        && lines[1] === I18n.t('varLoop.stats.some', { table: 'LpFactures', count: 1, total: 3, id: 2, effect: 'le paragraphe disparaît.' })
        && JSON.stringify(saved) === JSON.stringify({
          repeat: 'inline', table: 'LpParticipants', filter: { mode: 'all', rules: [{ column: 'Presence', operator: '=', value: 'Présent' }] },
          sort: { column: 'Nom', direction: 'asc' }, empty: 'hide', separator: ', ', lastSeparator: I18n.t('varLoop.lastSeparatorDefault'),
        })
        && icon.indexOf('data:image/svg+xml') !== -1
        && text === 'Ont participé : Karim Benali, Léa Fontaine' + I18n.t('varLoop.lastSeparatorDefault') + 'Sophie Laurent.';
      return { pass, notes: JSON.stringify({ segs, separators, columns, choices, directionLabels, lines, saved, icon: icon.slice(0, 40), text }) };
    },
  });

  cases.push({
    id: 'loop_autocomplete_in_repeated_zone',
    description: 'Autocomplétion # dans une zone répétée : les colonnes de la table parcourue en tête ; une variable de la table d’une liste de références s’insère sans demander de lien',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<table><tbody>'
        + `<tr>${cell('Désignation', 'th')}${cell('Qté', 'th')}</tr>`
        + `<tr>${cell(badgeHtml('LpLignes', 'Designation', ROW_LOOP))}<td><p></p></td></tr>`
        + '</tbody></table>'
        + `<ul><li><p>${badgeHtml('LpFactures', 'Formateurs', { repeat: 'item', table: 'LpFormateurs', via: VIA, empty: 'none' })} : </p></li></ul>`
        + '<p>Fin</p>');
      const firstItems = () => Array.from(document.querySelectorAll('.ac-item')).slice(0, 3).map(i => i.textContent);
      const escape = async () => {
        document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.sleep(40);
      };
      await h.focusInElement(document.querySelectorAll('.tiptap tr')[1].children[1].querySelector('p'));
      await h.typeText('#');
      await h.sleep(60);
      const inRow = firstItems();
      await escape();
      // Espace avant # : @tiptap/suggestion n'ouvre la liste qu'en début de ligne ou après une espace (allowedPrefixes).
      await h.focusInElement(document.querySelector('.tiptap > p:last-child'));
      await h.typeText(' #');
      await h.sleep(60);
      const outside = firstItems();
      await escape();
      await h.focusInElement(document.querySelector('.tiptap li p'));
      await h.typeText(' #LpFormateurs.Em');
      await h.sleep(60);
      const pick = Array.from(document.querySelectorAll('.ac-item')).find(i => i.textContent.indexOf('LpFormateurs.Email') !== -1);
      if (pick) pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(150);
      const linkModal = document.getElementById('link-config-modal');
      const askedForLink = visible(linkModal);
      if (askedForLink) { document.getElementById('link-config-cancel').click(); await h.sleep(80); }
      const keys = badgeNodes(EditorCore.getEditor()).map(b => b.node.attrs.key);
      const content = await renderReader(Editor.getHTML());
      const items = Array.from(content.querySelectorAll('li')).map(li => li.textContent.trim());
      const pass = inRow.length === 3 && inRow.every(k => k.indexOf('LpLignes.') !== -1) && outside.length && outside[0].indexOf('LpLignes.') === -1
        && !!pick && !askedForLink && keys.indexOf('LpFormateurs.Email') !== -1 && !GristAPI.getLinkRule('LpFormateurs')
        && JSON.stringify(items) === JSON.stringify(['Léa Fontaine : lea@exemple.fr', 'Karim Benali : karim@exemple.fr']);
      return { pass, notes: JSON.stringify({ inRow, outside, picked: !!pick, askedForLink, keys, items }) };
    },
  });

  // « Remplacer » de la fenêtre « Autres attributs » (demande d'Antoine, 2026-10-01) sur la bulle qui porte la boucle d'une ligne de tableau : c'est la même bulle dont
  // la colonne change, la boucle reste - une copie neuve la perdrait, et le tableau cesserait de répéter sa ligne sans que rien ne le dise.
  cases.push({
    id: 'loop_replace_from_linked_attributes_keeps_the_loop_of_the_row',
    description: 'Autres attributs : « Remplacer » sur la bulle qui porte la boucle de la ligne du tableau met l’attribut coché à sa place sans perdre la boucle - la ligne se répète toujours, avec la nouvelle colonne - et un seul Annuler rend la bulle d’origine',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(linesTable('Designation'));
      const ed = await selectBadge(h, 'LpLignes.Designation');
      pressToolbarButton('var-linked');
      await h.sleep(300);
      const win = document.getElementById('var-linked-modal');
      const replaceBtn = win && win.querySelector('button.var-linked-replace');
      if (!replaceBtn) return { pass: false, notes: 'bouton « Remplacer » absent de la fenêtre Autres attributs' };
      const input = win.querySelector('.var-linked-row[data-col="Montant"] input');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      replaceBtn.click();
      await h.sleep(150);
      const anchors = badgeNodes(ed).filter(b => b.node.attrs.loop);
      const anchor = anchors.length === 1 ? anchors[0].node : null;
      const keys = badgeNodes(ed).map(b => b.node.attrs.key);
      const rows = rowTexts((await renderReader(Editor.getHTML())).querySelector('table'));
      const fmt = v => Variables.formatValue(v, null, 'LpLignes', 'Montant');
      ed.commands.undo();
      await h.sleep(100);
      const afterUndo = badgeNodes(ed).map(b => b.node.attrs.key);
      const pass = !!anchor && anchor.attrs.key === 'LpLignes.Montant' && JSON.stringify(anchor.attrs.loop) === JSON.stringify(ROW_LOOP)
        && JSON.stringify(keys) === JSON.stringify(['LpLignes.Montant', 'LpLignes.Qte', 'LpFactures.Numero'])
        && JSON.stringify(rows) === JSON.stringify(['Désignation | Qté | Facture', `${fmt(180)} | 12 | F-2026-041`, `${fmt(1200)} | 1 | F-2026-041`, `${fmt(90)} | 1 | F-2026-041`])
        && JSON.stringify(afterUndo) === JSON.stringify(['LpLignes.Designation', 'LpLignes.Qte', 'LpFactures.Numero']);
      return { pass, notes: JSON.stringify({ anchor: anchor && anchor.attrs, keys, rows, afterUndo }) };
    },
  });

  // Les réglages de la fenêtre (js/variable-loop.js : `wireModal`, `workingCopy`, `repeatFor`) : chacun doit arriver dans la boucle enregistrée, et la fenêtre rouverte sur cette boucle le montre.
  cases.push({
    id: 'loop_window_every_control_reaches_the_saved_loop_and_the_window_reopens_with_it',
    description: 'Fenêtre Boucle : « Ce qui se répète », « Si aucune ligne » et son texte, séparateurs, filtre (colonne, valeur, « au moins une »), colonne et sens du tri arrivent tous dans la boucle enregistrée ; rouverte, la fenêtre les montre tels quels, Retirer compris ; une boucle sans dernier séparateur rouvre avec ce champ vide',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Ont participé : ${badgeHtml('LpParticipants', 'NomComplet')}.</p>`);
      let ed = await selectBadge(h, 'LpParticipants.NomComplet');
      pressToolbarButton('var-loop');
      await h.sleep(150);
      const m = modal();
      const field = selector => m.querySelector(selector);
      const repeatButton = repeat => Array.from(m.querySelectorAll('.var-loop-seg button')).find(b => b.dataset.repeat === repeat);
      const typeInto = (selector, value) => { const input = field(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
      const sortRow = () => field('.var-loop-sort-row');
      const zone = repeat => ({
        pressed: repeatButton(repeat).getAttribute('aria-pressed'),
        separatorsHidden: field('.var-loop-seps').hidden,
        emptyChoices: Array.from(field('#var-loop-empty').options).map(o => o.value),
        empty: field('#var-loop-empty').value,
        introMarked: !!field('.var-modal-intro [data-loop-repeat]'),
      });
      const shown = () => {
        const rule = field('.var-loop-filter .macro-rule-row');
        return {
          repeat: Array.from(m.querySelectorAll('.var-loop-seg button')).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.repeat),
          filterMode: field('.var-loop-filter .var-condition-mode select') && field('.var-loop-filter .var-condition-mode select').value,
          rule: rule ? [rule.querySelector('select.macro-rule-column').value, rule.querySelector('select.macro-rule-value').value] : null,
          sort: [field('#var-loop-sort').value, sortRow().querySelectorAll('select')[1].value],
          empty: field('#var-loop-empty').value,
          emptyTextShown: !field('.var-loop-empty-text').hidden,
          emptyText: field('#var-loop-empty-text').value,
          separators: [field('#var-loop-sep').value, field('#var-loop-last').value],
          removeShown: !field('.var-modal-danger').hidden,
        };
      };
      // Une autre zone, puis la phrase de nouveau : « Si aucune ligne » reprend les choix de la zone, les séparateurs ne se montrent que dans la phrase.
      const fresh = zone('inline');
      repeatButton('paragraph').click();
      await h.sleep(60);
      const asParagraph = zone('paragraph');
      repeatButton('inline').click();
      await h.sleep(60);
      const asInline = zone('inline');
      // « Si aucune ligne » : le texte à afficher ne se montre que pour ce choix.
      const emptyRowHiddenBefore = field('.var-loop-empty-text').hidden;
      setSelect(field('#var-loop-empty'), 'text');
      await h.sleep(40);
      const emptyRowShownAfter = !field('.var-loop-empty-text').hidden;
      typeInto('#var-loop-empty-text', 'Personne');
      typeInto('#var-loop-sep', ' / ');
      typeInto('#var-loop-last', ' & ');
      m.querySelector('.var-loop-filter .var-condition-add').click();
      await h.sleep(50);
      setSelect(field('.var-loop-filter .macro-rule-row select.macro-rule-column'), 'Presence');
      await h.sleep(50);
      setSelect(field('.var-loop-filter .macro-rule-row select.macro-rule-value'), 'Présent');
      setSelect(field('.var-loop-filter .var-condition-mode select'), 'any');
      await h.sleep(30);
      setSelect(field('#var-loop-sort'), 'Nom');
      await h.sleep(30);
      setSelect(sortRow().querySelectorAll('select')[1], 'desc');
      await h.sleep(30);
      const beforeSave = shown();
      actionButton(I18n.t('common.save')).click();
      await h.sleep(100);
      const saved = badgeNodes(ed).find(b => b.node.attrs.key === 'LpParticipants.NomComplet').node.attrs.loop;
      ed = await selectBadge(h, 'LpParticipants.NomComplet');
      pressToolbarButton('var-loop');
      await h.sleep(300);
      const reopened = shown();
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      // Une boucle posée sans dernier séparateur : le champ reste vide, le premier garde sa valeur par défaut.
      Editor.setHTML(`<p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'inline', table: 'LpParticipants', empty: 'hide' })}</p>`);
      ed = await selectBadge(h, 'LpParticipants.NomComplet');
      pressToolbarButton('var-loop');
      await h.sleep(300);
      const withoutLast = shown();
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      const observed = { fresh, asParagraph, asInline, emptyRowHiddenBefore, emptyRowShownAfter, beforeSave, saved, reopened, withoutLast };
      const inlineZone = { pressed: 'true', separatorsHidden: false, emptyChoices: ['hide', 'text', 'blank'], empty: 'hide', introMarked: true };
      const filled = { repeat: ['inline'], filterMode: 'any', rule: ['Presence', 'Présent'], sort: ['Nom', 'desc'], empty: 'text', emptyTextShown: true, emptyText: 'Personne', separators: [' / ', ' & '] };
      const expected = {
        fresh: inlineZone,
        asParagraph: { pressed: 'true', separatorsHidden: true, emptyChoices: ['hide', 'text', 'blank'], empty: 'hide', introMarked: false },
        asInline: inlineZone,
        emptyRowHiddenBefore: true,
        emptyRowShownAfter: true,
        beforeSave: Object.assign({}, filled, { removeShown: false }),
        saved: { repeat: 'inline', table: 'LpParticipants', filter: { mode: 'any', rules: [{ column: 'Presence', operator: '=', value: 'Présent' }] }, sort: { column: 'Nom', direction: 'desc' }, empty: 'text', emptyText: 'Personne', separator: ' / ', lastSeparator: ' & ' },
        reopened: Object.assign({}, filled, { removeShown: true }),
        withoutLast: { repeat: ['inline'], filterMode: null, rule: null, sort: ['', 'asc'], empty: 'hide', emptyTextShown: false, emptyText: '', separators: [', ', ''], removeShown: true },
      };
      return { pass: sameLists(observed, expected), notes: JSON.stringify(observed) };
    },
  });

  // L'aperçu de la ligne sélectionnée (js/variable-loop.js : `summaryHead`, `currentSummary`) dans chaque situation de données.
  cases.push({
    id: 'loop_window_preview_of_the_selected_row_in_every_situation',
    description: 'Fenêtre Boucle, aperçu de la ligne sélectionnée : aucune ligne liée, liées mais aucune gardée par le filtre, valeurs toutes vides dans la phrase, plus de trois valeurs (« … »), valeur vide, titre, paragraphe et élément de liste ; chaque fois la phrase de « Si aucune ligne » ou la liste des valeurs',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const lineOf = async (html, key, record) => {
        if (record) { stub.fireRecord(record, 'LpFactures'); await h.sleep(50); }
        Editor.setHTML(html);
        await selectBadge(h, key);
        pressToolbarButton('var-loop');
        await h.sleep(600);
        const line = previewLines()[0];
        actionButton(I18n.t('common.cancel')).click();
        await h.sleep(60);
        return line;
      };
      const participants = names => names.map((name, i) => ({ id: i + 1, Facture: 1, NomComplet: name, Nom: name, Presence: 'Présent' }));
      const observed = {};
      observed.noneLinked = await lineOf(linesTable('Designation'), 'LpLignes.Designation', { id: 3, Numero: 'F-2026-043', Client: 'Cabinet Morel', Formateurs: null });
      const kept = { repeat: 'row', table: 'LpLignes', filter: { mode: 'all', rules: [{ column: 'Qte', operator: '>', value: '1000' }] }, empty: 'text', emptyText: 'Rien' };
      observed.noneKept = await lineOf(linesTable('Designation', kept), 'LpLignes.Designation', Object.assign({}, RECORD_1));
      const inline = { repeat: 'inline', table: 'LpParticipants', empty: 'text', emptyText: 'Personne' };
      stub.setRows('LpParticipants', participants(['', '', '']));
      observed.emptyValuesInline = await lineOf(`<p>${badgeHtml('LpParticipants', 'NomComplet', inline)}</p>`, 'LpParticipants.NomComplet');
      stub.setRows('LpParticipants', participants(['Anne', 'Bob', 'Carl', 'Dora', 'Eve']));
      observed.manyRows = await lineOf(`<p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'paragraph', table: 'LpParticipants', empty: 'hide' })}</p>`, 'LpParticipants.NomComplet');
      observed.heading = await lineOf(`<h2>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'paragraph', table: 'LpParticipants', empty: 'hide' })}</h2>`, 'LpParticipants.NomComplet');
      stub.setRows('LpParticipants', participants(['Anne', '', 'Carl']));
      observed.oneEmptyValue = await lineOf(`<p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'paragraph', table: 'LpParticipants', empty: 'hide' })}</p>`, 'LpParticipants.NomComplet');
      observed.listItem = await lineOf(`<ul><li><p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'item', table: 'LpParticipants', empty: 'none' })}</p></li></ul>`, 'LpParticipants.NomComplet');
      observed.inlineWithValues = await lineOf(`<p>${badgeHtml('LpParticipants', 'NomComplet', { repeat: 'inline', table: 'LpParticipants', empty: 'hide', separator: ' | ', lastSeparator: ' + ' })}</p>`, 'LpParticipants.NomComplet');
      const linked = count => I18n.t('varLoop.preview.linked', { id: 1, count }) + ' ';
      const firstThree = 'Anne, Bob, Carl, …';
      const withHole = 'Anne, ' + I18n.t('varCond.debug.emptyValue') + ', Carl';
      const expected = {
        noneLinked: I18n.t('varLoop.preview.noneLinked', { id: 3 }) + ' ' + I18n.t('varLoop.effect.header'),
        noneKept: I18n.t('varLoop.preview.noneKept', { id: 1, total: 3 }) + ' ' + I18n.t('varLoop.effect.rowText', { text: 'Rien' }),
        emptyValuesInline: linked(3) + I18n.t('varLoop.preview.inline', { text: 'Personne' }),
        manyRows: linked(5) + I18n.t('varLoop.preview.paragraph', { count: 5, values: firstThree }),
        heading: linked(5) + I18n.t('varLoop.preview.heading', { count: 5, values: firstThree }),
        oneEmptyValue: linked(3) + I18n.t('varLoop.preview.paragraph', { count: 3, values: withHole }),
        listItem: linked(3) + I18n.t('varLoop.preview.item', { count: 3, values: withHole }),
        inlineWithValues: linked(3) + I18n.t('varLoop.preview.inline', { text: 'Anne + Carl' }),
      };
      return { pass: sameLists(observed, expected), notes: JSON.stringify(observed) };
    },
  });

  // `VariableLoop.open` (js/variable-loop.js) : rien à ouvrir sans bulle ni source ; une boucle déplacée reprend le premier choix permis de son nouvel endroit.
  cases.push({
    id: 'loop_window_does_not_open_without_a_variable_or_a_source_and_a_moved_loop_takes_the_first_choice_of_its_place',
    description: 'Ouvrir la fenêtre Boucle sans éditeur, sur du texte, ou sur une colonne ordinaire de la page (aucune ligne à parcourir) : rien ne s’ouvre ; une boucle « ligne du tableau » posée hors d’un tableau rouvre sur « Dans la phrase », avec les choix de « Si aucune ligne » de cette zone',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Texte</p><p>${badgeHtml('LpFactures', 'Numero')} ${badgeHtml('LpLignes', 'Designation', ROW_LOOP)}</p>`);
      const ed = EditorCore.getEditor();
      const found = badgeNodes(ed);
      const page = found.find(b => b.node.attrs.key === 'LpFactures.Numero');
      const moved = found.find(b => b.node.attrs.key === 'LpLignes.Designation');
      const attempts = [[null, 0], [ed, 1], [ed, page.pos]];
      const opened = attempts.map(([editor, pos]) => { VariableLoop.open(editor, pos); return VariableLoop.isOpen() || (!!modal() && visible(modal())); });
      VariableLoop.open(ed, moved.pos);
      await h.sleep(300);
      const m = modal();
      const observed = {
        opened,
        isOpen: VariableLoop.isOpen(),
        pressed: Array.from(m.querySelectorAll('.var-loop-seg button')).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.repeat),
        choices: Array.from(m.querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat),
        emptyChoices: Array.from(m.querySelector('#var-loop-empty').options).map(o => o.value),
        empty: m.querySelector('#var-loop-empty').value,
        separators: [m.querySelector('#var-loop-sep').value, m.querySelector('#var-loop-last').value],
        removeShown: !m.querySelector('.var-modal-danger').hidden,
      };
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      observed.closed = !VariableLoop.isOpen();
      const expected = {
        opened: [false, false, false], isOpen: true, pressed: ['inline'], choices: ['inline', 'paragraph'], emptyChoices: ['hide', 'text', 'blank'], empty: 'hide',
        separators: [', ', ''], removeShown: true, closed: true,
      };
      return { pass: sameLists(observed, expected), notes: JSON.stringify(observed) };
    },
  });

  // La fermeture de la fenêtre : `close` de js/variable-loop.js (celle des fenêtres Condition et Liste passe par la même aide, VariableModal.closeWindow).
  cases.push({
    id: 'loop_window_closing_hides_it_and_gives_the_keyboard_back_to_the_selected_bubble',
    description: '« Annuler » et « Enregistrer » dans la fenêtre Boucle : la fenêtre se ferme, le clavier revient dans l\'éditeur et la bulle reste sélectionnée ; rouverte, la fenêtre repart de la bulle',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'inline', table: 'LpParticipants', separator: ', ', lastSeparator: ' et ', empty: 'hide' };
      Editor.setHTML(`<p>Avec ${badgeHtml('LpParticipants', 'NomComplet', loop)}</p>`);
      await h.sleep(150);
      const ed = EditorCore.getEditor();
      const out = {};
      const notes = {};
      for (const [name, label] of [['cancel', I18n.t('common.cancel')], ['save', I18n.t('common.save')], ['cancelAgain', I18n.t('common.cancel')]]) {
        await selectBadge(h, 'LpParticipants.NomComplet');
        VariableLoop.open(ed, badgeNodes(ed)[0].pos);
        await h.sleep(300);
        const opened = VariableLoop.isOpen() && visible(modal());
        document.activeElement.blur();
        actionButton(label).click();
        await h.sleep(250);
        const selection = ed.state.selection;
        const focusInEditor = document.querySelector('.tiptap').contains(document.activeElement);
        const bubbleSelected = !!selection.node && selection.node.type.name === 'varBadge';
        out[name] = opened && !VariableLoop.isOpen() && !visible(modal()) && focusInEditor && bubbleSelected;
        notes[name] = { opened, isOpen: VariableLoop.isOpen(), modalVisible: visible(modal()), focusInEditor, bubbleSelected };
      }
      return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(notes) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varLoop = cases;
})();
