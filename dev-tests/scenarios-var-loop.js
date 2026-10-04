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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varLoop = cases;
})();
