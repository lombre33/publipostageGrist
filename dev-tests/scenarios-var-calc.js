// Suite "varCalc" - bulle « Calcul » (demande d'Antoine du 2026-10-01 : « variables calculées », au classeur de la feuille de route « Somme et soustraction entre #Variables,
// sous-total + TVA = total »). Nœud calcBadge (js/editor-nodes.js), ligne « Calcul » du menu des variables et fenêtre (js/variables.js, js/variable-calc.js), moteur (js/formula.js,
// testé seul par `formulaUnit`), résolution à la Lecture, au PDF, au Word, à l'e-mail et dans les zones répétées (js/reader-mode.js, js/loop-rules.js), barre flottante
// (js/floating-toolbars.js). Le jeu de données : une facture (HT 1000, taux 20) et trois lignes liées (1500 × 2, 25 × 4, 0 × 7) par une règle « match ».
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VcFactures';
  const LINES = 'VcLignes';
  const NBSP = '\u00a0';
  const RECORD = { id: 1, Ref: 'F-001', HT: 1000, Taux: 20, Remise: 0, Echeance: 631152000, Note: 'dix' };
  const EMPTY_RECORD = { id: 2, Ref: 'F-002', HT: 0, Taux: 20, Remise: 0, Echeance: 631152000, Note: '' };

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const esc = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  function calc(formula, format) { return `<span class="calc-badge" data-formula="${esc(formula)}"${format ? attr('data-format', format) : ''}></span>`; }
  function badge(column, table, loop) {
    const t = table || PAGE;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${t}" data-column="${column}" data-key="${t}.${column}"${loopAttrs}></span>`;
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Ref: 'Text', HT: 'Numeric', Taux: 'Numeric', Remise: 'Numeric', Echeance: 'Date', Note: 'Text' });
    stub.setVariables(LINES, { Facture: 'Ref:' + PAGE, Libelle: 'Text', Prix: 'Numeric', Qte: 'Int', manualSort: 'ManualSortPos' });
    stub.setRows(PAGE, [Object.assign({}, RECORD), Object.assign({}, EMPTY_RECORD)]);
    stub.setRows(LINES, [
      { id: 1, Facture: 1, Libelle: 'Livret', Prix: 1500, Qte: 2, manualSort: 1 },
      { id: 2, Facture: 1, Libelle: 'Envoi', Prix: 25, Qte: 4, manualSort: 2 },
      { id: 3, Facture: 1, Libelle: 'Suivi', Prix: 0, Qte: 7, manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), PAGE);
    await h.sleep(40);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), PAGE);
    await h.sleep(40);
  }
  async function renderReader(html, record, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, hf || NO_HF);
    return reader;
  }
  const resolvedTexts = root => Array.from(root.querySelectorAll('.resolved-var')).map(e => e.textContent);
  async function previewBox(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, record);
    return box;
  }
  const rowTexts = table => Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join(' | '));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function ed() { return EditorCore.getEditor(); }
  function calcNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'calcBadge') out.push({ node, pos }); });
    return out;
  }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const modal = () => document.getElementById('pp-calc-modal');
  const modalShown = () => !!modal() && modal().style.display !== 'none' && modal().getClientRects().length > 0;
  const field = () => document.getElementById('pp-calc-formula');
  const statusEl = () => modal().querySelector('.pp-calc-status');
  const okButton = () => modal().querySelector('.var-modal-primary');
  const cancelButton = () => Array.from(modal().querySelectorAll('.pp-modal-actions button')).find(b => !b.classList.contains('var-modal-primary'));
  const fnButton = canonical => modal().querySelector(`.pp-calc-function[data-fn="${canonical}"]`);
  function panelBox() { return document.getElementById('autocomplete-box'); }
  function panelOpen() { const b = panelBox(); return !!b && b.style.display !== 'none'; }
  async function waitPreview(h) { await h.sleep(480); }

  // Ouvre la fenêtre comme une personne : « # », l'onglet Chips, la ligne « Calcul » du menu.
  async function openViaPanel(h) {
    await h.typeText('#');
    await h.sleep(60);
    document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await h.sleep(30);
    if (!panelOpen()) return false;
    const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(i => i.textContent === I18n.t('chips.calc'));
    if (!item) return false;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(120);
    return modalShown();
  }
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const toolbarButton = action => toolbar().querySelector(`button[data-action="${action}"]`);
  const pressToolbarButton = action => toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  async function selectNode(h, pos) {
    document.querySelector('.tiptap').focus();
    ed().commands.setNodeSelection(pos);
    await h.sleep(150);
  }

  // === Le nœud ===
  cases.push({
    id: 'varcalc_bubble_keeps_its_stored_formula_and_reads_in_the_interface_language',
    description: 'La bulle « Calcul » est un atome de l’éditeur : sa formule enregistrée (variables entre accolades, décimales au point, noms anglais) survit à getHTML/setHTML ; son texte « = … » la relit dans la langue de l’interface (0,2 et SOMME en français, 0.2 et SUM en anglais) et avec la touche de déclenchement choisie',
    run: async (h) => {
      await seed(h);
      const stored = '{VcFactures.HT} * 0.2 + SUM({VcLignes.Prix};10)';
      Editor.setHTML(`<p>Total ${calc(stored)} fin</p>`);
      await h.sleep(60);
      const label = () => document.querySelector('.tiptap .calc-badge').textContent;
      const out = { fr: label() };
      const html = Editor.getHTML();
      const roundTrip = html.includes('class="calc-badge"') && html.includes('data-formula="' + stored + '"') && !html.includes(' formula="');
      const isAtom = calcNodes().length === 1 && calcNodes()[0].node.isAtom && calcNodes()[0].node.attrs.formula === stored;
      const before = I18n.getLang();
      I18n.setLang('en');
      try { Editor.setHTML(`<p>Total ${calc(stored)} fin</p>`); await h.sleep(60); out.en = label(); } finally { I18n.setLang(before); }
      localStorage.setItem('pp_trigger_char', '§');
      try { Editor.setHTML(`<p>Total ${calc(stored)} fin</p>`); await h.sleep(60); out.trigger = label(); } finally { localStorage.removeItem('pp_trigger_char'); }
      const expected = {
        fr: '= #VcFactures.HT × 0,2 + SOMME(#VcLignes.Prix; 10)',
        en: '= #VcFactures.HT × 0.2 + SUM(#VcLignes.Prix; 10)',
        trigger: '= §VcFactures.HT × 0,2 + SOMME(§VcLignes.Prix; 10)',
      };
      const checks = { roundTrip, isAtom, texts: same(out, expected) };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, out, htmlStart: html.slice(0, 200) }) };
    },
  });

  cases.push({
    id: 'varcalc_formula_in_a_table_cell_is_cut_in_the_middle_not_wrapped',
    description: 'Dans une case de tableau étroite, la bulle « Calcul » garde une seule ligne et coupe sa formule au milieu par « … » (comme le nom d’une variable) : elle ne déborde pas sur la case voisine et son texte entier reste dans le DOM',
    run: async (h) => {
      await seed(h);
      const long = '{VcFactures.HT} * {VcFactures.Taux} / 100 + SUM({VcLignes.Prix} * {VcLignes.Qte})';
      Editor.setHTML(`<table><tbody><tr><td colwidth="120"><p>${calc(long)}</p></td><td colwidth="120"><p>x</p></td></tr></tbody></table>`);
      await h.sleep(100);
      const cell = document.querySelector('.tiptap td');
      const bubble = cell.querySelector('.calc-badge');
      const head = bubble.querySelector('.calc-badge-head');
      const next = document.querySelectorAll('.tiptap td')[1];
      const bubbleRect = bubble.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(bubble).lineHeight) || 16;
      const checks = {
        parts: !!head && !!bubble.querySelector('.calc-badge-tail'),
        insideCell: bubbleRect.right <= cellRect.right + 1 && bubbleRect.left >= cellRect.left - 1,
        oneLine: bubbleRect.height < lineHeight * 1.8,
        cut: head.scrollWidth > head.clientWidth,
        fullTextKept: bubble.textContent.startsWith('= #VcFactures.HT') && bubble.textContent.endsWith('#VcLignes.Qte)'),
        neighbourUntouched: next.getBoundingClientRect().left >= cellRect.right - 1,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, bubbleRect, cellRect, text: bubble.textContent }) };
    },
  });

  cases.push({
    id: 'varcalc_bubble_turns_red_with_a_message_when_its_formula_or_column_is_broken',
    description: 'Une bulle dont la formule ne se lit pas, ou qui cite une colonne disparue, devient rouge avec le message en info-bulle (comme une variable cassée) ; une bulle saine n’a ni la classe ni le titre',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${calc('{VcFactures.HT} * 2')} ${calc('{VcFactures.Nope} * 2')} ${calc('{VcFactures.HT} *')} ${calc('{VcAutre.HT} + 1')}</p>`);
      await h.sleep(250);
      const bubbles = Array.from(document.querySelectorAll('.tiptap .calc-badge'));
      const state = bubbles.map(b => ({ broken: b.classList.contains('calc-badge-broken'), title: b.title }));
      const checks = {
        healthy: !state[0].broken && state[0].title === '',
        missingColumn: state[1].broken && state[1].title.includes('Nope') && state[1].title.includes(PAGE),
        syntax: state[2].broken && state[2].title.length > 5,
        missingTable: state[3].broken && state[3].title.includes('VcAutre'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, state }) };
    },
  });

  // === Le résultat, partout où le document est écrit ===
  const EIGHT = [
    ['{VcFactures.HT} * {VcFactures.Taux} / 100', null, '200'],
    ['{VcFactures.HT} + {VcFactures.HT} * {VcFactures.Taux} %', null, '1' + NBSP + '200'],
    ['SUM({VcLignes.Prix} * {VcLignes.Qte})', null, '3' + NBSP + '100'],
    ['ROUND(AVERAGE({VcLignes.Prix});2)', null, '508,33'],
    ['{VcFactures.Remise}', null, ''],
    ['{VcFactures.Remise}', { zero: 'show' }, '0'],
    ['{VcFactures.HT} * 1.2', { type: 'number', style: 'fr', decimals: 2, currency: '€' }, '1' + NBSP + '200,00' + NBSP + '€'],
    ['MAX({VcLignes.Prix}) - MIN({VcLignes.Prix}) + COUNT({VcLignes.Prix})', null, '1' + NBSP + '503'],
  ];
  const EIGHT_HTML = '<p>' + EIGHT.map(([formula, format]) => calc(formula, format)).join('|') + '</p>';
  const EIGHT_TEXTS = EIGHT.map(row => row[2]);

  cases.push({
    id: 'varcalc_result_is_written_like_a_number_column_in_every_render_path',
    description: 'Huit calculs (opération, pourcentage, total de lignes, moyenne arrondie, zéro caché, zéro montré, format €, MAX/MIN/NB) s’écrivent pareil à la Lecture, dans l’aperçu commun du PDF/Word/e-mail, sur la ligne brute d’un lot et dans l’en-tête/pied : FR par défaut, zéro caché par défaut, format de la bulle respecté',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const batchRow = rows.find(r => r.id === 1);
      const hf = { enabled: true, differentFirstPage: false, header: { default: `<p>${calc(EIGHT[1][0])}</p>`, first: '' }, footer: { default: `<p>${calc(EIGHT[2][0])}</p>`, first: '' } };
      const zones = await ExportCommon.resolveHeaderFooterVariables(hf, PAGE, RECORD);
      const zoneText = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
      const got = {
        reading: resolvedTexts(await renderReader(EIGHT_HTML, RECORD)),
        preview: resolvedTexts(await previewBox(EIGHT_HTML, RECORD)),
        batch: resolvedTexts(await previewBox(EIGHT_HTML, batchRow)),
        header: zoneText(zones.header.default), footer: zoneText(zones.footer.default),
      };
      const checks = {
        reading: same(got.reading, EIGHT_TEXTS), preview: same(got.preview, EIGHT_TEXTS), batch: same(got.batch, EIGHT_TEXTS),
        header: got.header === '1' + NBSP + '200', footer: got.footer === '3' + NBSP + '100',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  cases.push({
    id: 'varcalc_english_interface_writes_numbers_the_us_way',
    description: 'Interface en anglais : un calcul sans réglage s’écrit « 3,100 » et « 508.33 » (comme une colonne Numérique), pas « 3 100 » ni « 508,33 »',
    run: async (h) => {
      await seed(h);
      const before = I18n.getLang();
      I18n.setLang('en');
      try {
        const got = resolvedTexts(await renderReader(EIGHT_HTML, RECORD));
        // Le sixième (format € posé à la main, style FR explicite) garde son écriture quelle que soit la langue de l'interface.
        const expected = ['200', '1,200', '3,100', '508.33', '', '0', EIGHT_TEXTS[6], '1,503'];
        return { pass: same(got, expected), notes: JSON.stringify({ got, expected }) };
      } finally { I18n.setLang(before); }
    },
  });

  cases.push({
    id: 'varcalc_totals_with_no_linked_rows_and_a_list_without_function',
    description: 'Une facture sans ligne : SOMME vaut 0 (donc rien d’écrit, zéro caché), une opération sur la liste vide ne montre rien ; une liste de plusieurs lignes SANS fonction est une erreur claire écrite dans le document, que la Lecture signale comme variable non résolue',
    run: async (h) => {
      await seed(h);
      await setRecord(h, EMPTY_RECORD);
      const html = `<p>${calc('SUM({VcLignes.Prix} * {VcLignes.Qte})')}|${calc('{VcLignes.Prix} * 2')}|${calc('SUM({VcLignes.Prix})', { zero: 'show' })}|${calc('COUNT({VcLignes.Prix})', { zero: 'show' })}</p>`;
      const empty = resolvedTexts(await renderReader(html, EMPTY_RECORD));
      await setRecord(h, RECORD);
      const many = calc('{VcLignes.Prix} * 2');
      const reader = await renderReader(`<p>${many}</p>`, RECORD);
      const text = resolvedTexts(reader)[0];
      const flagged = !!reader.querySelector('.error-msg');
      const warning = !!Array.from(reader.querySelectorAll('p.error-msg')).find(p => p.textContent === I18n.t('reader.unresolvedVariables'));
      const checks = {
        emptyLines: same(empty, ['', '', '0', '0']),
        manyValuesMessage: text.startsWith('[ERREUR:') && text.includes('3 valeurs') && text.includes('SOMME'),
        flagged, warning,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, empty, text }) };
    },
  });

  cases.push({
    id: 'varcalc_errors_name_the_problem_in_the_interface_language_and_never_write_a_wrong_total',
    description: 'Division par zéro, date, texte qui n’est pas un nombre, colonne ou table disparue, pièce jointe : chacun écrit un « [ERREUR: …] » dans la langue de l’interface (jamais un total faux : une colonne disparue ne vaut pas 0), la variable fautive citée avec la touche de déclenchement',
    run: async (h) => {
      await seed(h);
      window.__gristStub.setVariables(PAGE, { Ref: 'Text', HT: 'Numeric', Taux: 'Numeric', Remise: 'Numeric', Echeance: 'Date', Note: 'Text', Pieces: 'Attachments' });
      await GristAPI.refreshSchema();
      const run = async stored => (await Variables.resolveCalcResult(stored, PAGE, Object.assign({}, RECORD), null)).text;
      const fr = {
        div: await run('{VcFactures.HT} / {VcFactures.Remise}'),
        date: await run('{VcFactures.Echeance} + 1'),
        text: await run('{VcFactures.Note} + 1'),
        gone: await run('{VcFactures.Nope} + 1'),
        table: await run('{VcAutre.Prix} + 1'),
        files: await run('{VcFactures.Pieces} + 1'),
        syntax: await run('{VcFactures.HT} +'),
        empty: await run('   '),
      };
      const before = I18n.getLang();
      I18n.setLang('en');
      let en;
      try { en = { div: await run('{VcFactures.HT} / {VcFactures.Remise}'), text: await run('{VcFactures.Note} + 1') }; } finally { I18n.setLang(before); }
      const checks = {
        div: fr.div === '[ERREUR: Division par zéro.]',
        date: fr.date.startsWith('[ERREUR:') && fr.date.includes('#VcFactures.Echeance') && fr.date.includes('date'),
        text: fr.text.startsWith('[ERREUR:') && fr.text.includes('#VcFactures.Note') && fr.text.includes('dix') && fr.text.includes('pas un nombre'),
        gone: fr.gone.startsWith('[ERREUR:') && fr.gone.includes('Nope') && fr.gone.includes(PAGE),
        table: fr.table.startsWith('[ERREUR:') && fr.table.includes('VcAutre'),
        files: fr.files.startsWith('[ERREUR:') && fr.files.includes('pièces jointes'),
        syntax: fr.syntax.startsWith('[ERREUR:') && fr.syntax.includes('trop tôt'),
        empty: fr.empty === '[ERREUR: Le calcul est vide.]',
        english: en.div === '[ERROR: Division by zero.]' && en.text.startsWith('[ERROR:') && en.text.includes('not a number'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, fr, en }) };
    },
  });

  // === Zones répétées : le total d'une ligne dans la ligne, le total général sous le tableau ===
  const ROW_LOOP = { repeat: 'row', table: LINES, empty: 'header' };
  const cell = content => `<td><p>${content}</p></td>`;
  const INVOICE = '<table><tbody><tr><th><p>Libellé</p></th><th><p>Total ligne</p></th></tr>'
    + `<tr>${cell(badge('Libelle', LINES, ROW_LOOP))}${cell(calc('{VcLignes.Prix} * {VcLignes.Qte}'))}</tr>`
    + `<tr>${cell('Total')}${cell(calc('SUM({VcLignes.Prix} * {VcLignes.Qte})'))}</tr></tbody></table>`;
  cases.push({
    id: 'varcalc_inside_a_repeated_row_gives_each_row_its_own_total_and_the_sum_stays_whole',
    description: 'Dans une ligne de tableau répétée par ligne liée, « Prix × Quantité » donne le total de CETTE ligne (3 000, 100, puis rien pour 0) ; la ligne « Total » sous le tableau additionne toutes les lignes (3 100) - Lecture et aperçu commun du PDF/Word',
    run: async (h) => {
      await seed(h);
      const expected = ['Libellé | Total ligne', 'Livret | 3' + NBSP + '000', 'Envoi | 100', 'Suivi | ', 'Total | 3' + NBSP + '100'];
      const read = (await renderReader(INVOICE, RECORD)).querySelector('.reader-content table');
      const preview = (await previewBox(INVOICE, RECORD)).querySelector('table');
      const checks = { reading: same(rowTexts(read), expected), preview: same(rowTexts(preview), expected) };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, reading: rowTexts(read), preview: rowTexts(preview) }) };
    },
  });

  // === Les fichiers ===
  async function pdfText(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(it => it.str).join(' ');
    return text;
  }
  cases.push({
    id: 'varcalc_pdf_and_docx_files_carry_the_results',
    description: 'Le vrai PDF et le vrai DOCX d’une ligne portent les résultats des calculs (« Total HT : 3 100 », « TVA : 620,00 € ») avec la même écriture que la Lecture, sans glyphe manquant',
    run: async (h) => {
      await seed(h);
      const html = `<p>Total HT : ${calc('SUM({VcLignes.Prix} * {VcLignes.Qte})')} ; TVA : ${calc('SUM({VcLignes.Prix} * {VcLignes.Qte}) * {VcFactures.Taux} %', { type: 'number', style: 'fr', decimals: 2, currency: '€' })}.</p>`;
      await PdfExport.ensurePdfLibsLoaded();
      const pdf = await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, PAGE, RECORD, '', NO_HF, undefined)).blob);
      await DocxExport.ensureDocxLibLoaded();
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(await (await DocxExport.getDocxBlobForRecord(html, PAGE, RECORD, '', NO_HF, null)).blob.arrayBuffer());
      const docx = Array.from(new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const flat = pdf.replace(/\s+/g, ' ');
      const checks = {
        pdfText: /Total HT : ?3 100 ?; ?TVA : ?620,00 ?€/.test(flat),
        pdfNoMissingGlyph: !/[\u0000�]/.test(pdf),
        docxText: docx.includes('Total HT : 3' + NBSP + '100 ; TVA : 620,00' + NBSP + '€.'),
        noFormulaLeftBehind: !flat.includes('SUM(') && !docx.includes('SUM(') && !flat.includes('= #'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, pdf: JSON.stringify(pdf.slice(0, 200)), docx }) };
    },
  });

  // === La fenêtre ===
  cases.push({
    id: 'varcalc_calculation_line_of_the_hash_menu_opens_the_window_and_the_bubble_lands_on_validation',
    description: 'Ligne « Calcul » de l’onglet Chips : le « # » tapé disparaît, la fenêtre s’ouvre sur son champ (titre « Insérer un calcul », rien d’inséré), le résultat de la ligne courante s’affiche à la frappe ; « Insérer » pose la bulle (formule enregistrée neutre), le focus revient à l’éditeur et un seul Annuler retire la bulle',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      const opened = await openViaPanel(h);
      const atOpen = opened ? {
        title: modal().querySelector('h3').textContent, focused: document.activeElement === field(), empty: field().value === '',
        status: statusEl().textContent, nodes: calcNodes().length, okLabel: okButton().textContent, hashGone: !ed().state.doc.textContent.includes('#'),
      } : null;
      if (!opened) return { pass: false, notes: 'la fenêtre ne s’est pas ouverte' };
      setInput(field(), '#VcFactures.HT * 0,2');
      await waitPreview(h);
      const preview = statusEl().textContent;
      const previewState = statusEl().dataset.state;
      okButton().click();
      await h.sleep(150);
      const nodes = calcNodes();
      const afterInsert = {
        closed: !modalShown(), count: nodes.length, formula: nodes[0] && nodes[0].node.attrs.formula, format: nodes[0] && nodes[0].node.attrs.format,
        label: document.querySelector('.tiptap .calc-badge') && document.querySelector('.tiptap .calc-badge').textContent, focusInEditor: !!document.activeElement.closest('.tiptap'),
      };
      ed().commands.undo();
      await h.sleep(80);
      const afterUndo = calcNodes().length;
      const checks = {
        opened: atOpen.title === 'Insérer un calcul' && atOpen.focused && atOpen.empty && atOpen.nodes === 0 && atOpen.okLabel === 'Insérer' && atOpen.hashGone,
        emptyStatus: atOpen.status === I18n.t('calc.status.empty'),
        preview: preview === 'Résultat pour la ligne courante : 200' && previewState === 'ok',
        inserted: afterInsert.closed && afterInsert.count === 1 && afterInsert.formula === '{VcFactures.HT} * 0.2' && afterInsert.format === null && afterInsert.label === '= #VcFactures.HT × 0,2' && afterInsert.focusInEditor,
        oneUndo: afterUndo === 0,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, atOpen, preview, afterInsert, afterUndo }) };
    },
  });

  cases.push({
    id: 'varcalc_cancel_and_escape_leave_nothing_in_the_document',
    description: 'Annuler, Échap et un champ vide fermé : aucune bulle n’entre dans le document, le curseur revient à l’éditeur ; Échap dans le champ avec la liste des colonnes ouverte ferme d’abord la liste, pas la fenêtre',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      const out = {};
      await openViaPanel(h);
      setInput(field(), '#VcFactures.HT * 2');
      cancelButton().click();
      await h.sleep(80);
      out.cancelClosed = !modalShown(); out.cancelNodes = calcNodes().length;
      await h.focusAtEnd();
      await openViaPanel(h);
      setInput(field(), '#VcFactures.HT * 2');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(80);
      out.escClosed = !modalShown(); out.escNodes = calcNodes().length; out.focus = !!document.activeElement.closest('.tiptap');
      await h.focusAtEnd();
      await openViaPanel(h);
      setInput(field(), '#VcFact');
      await h.sleep(40);
      out.listOpen = panelOpen();
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(60);
      out.listClosedFirst = !panelOpen() && modalShown();
      cancelButton().click();
      await h.sleep(60);
      const checks = {
        cancel: out.cancelClosed && out.cancelNodes === 0, escape: out.escClosed && out.escNodes === 0 && out.focus,
        escapeClosesTheListFirst: out.listOpen && out.listClosedFirst,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, out }) };
    },
  });

  cases.push({
    id: 'varcalc_a_refused_formula_stays_in_the_window_with_the_reason',
    description: 'Un calcul vide, inachevé, avec un mot inconnu, une virgule entre deux valeurs ou une colonne inventée n’est pas validé : la fenêtre reste ouverte, le champ est marqué invalide et prend le focus, la raison est écrite sous le champ (rouge), rien n’entre dans le document',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      await openViaPanel(h);
      const tries = [
        ['', 'Le calcul est vide.'],
        ['#VcFactures.HT *', 'trop tôt'],
        ['foo + 1', 'foo'],
        ['somme(2 , 3)', '« ; »'],
        ['#Nope.Prix * 2', 'n’est pas une colonne'],
        ['(1 + 2', 'parenthèse'],
        ['sommme(1)', 'Fonction inconnue'],
      ];
      const results = [];
      for (const [text, needle] of tries) {
        setInput(field(), text);
        okButton().click();
        await h.sleep(100);
        results.push({ text, stays: modalShown(), invalid: field().getAttribute('aria-invalid') === 'true', focused: document.activeElement === field(), state: statusEl().dataset.state, shows: statusEl().textContent.includes(needle), text2: statusEl().textContent });
      }
      const nodes = calcNodes().length;
      cancelButton().click();
      await h.sleep(60);
      const bad = results.filter(r => !(r.stays && r.invalid && r.focused && r.state === 'error' && r.shows));
      return { pass: bad.length === 0 && nodes === 0, notes: JSON.stringify({ bad, nodes }) };
    },
  });

  cases.push({
    id: 'varcalc_function_buttons_write_the_call_at_the_cursor_or_around_the_selection',
    description: 'Les six boutons de fonction (SOMME, MOYENNE, MIN, MAX, NB, ARRONDI, noms de l’interface) écrivent « SOMME() » au curseur, curseur entre les parenthèses, ou entourent le texte sélectionné ; un clic ne retire pas le focus du champ ; en anglais les boutons s’appellent SUM, AVERAGE…',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      await openViaPanel(h);
      const names = Array.from(modal().querySelectorAll('.pp-calc-function')).map(b => b.textContent);
      setInput(field(), '1 + ');
      field().setSelectionRange(4, 4);
      fnButton('SUM').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      fnButton('SUM').click();
      const atCursor = { value: field().value, caret: field().selectionStart, focused: document.activeElement === field() };
      setInput(field(), '#VcLignes.Prix * 2');
      field().setSelectionRange(0, field().value.length);
      fnButton('MAX').click();
      const around = { value: field().value, caret: field().selectionStart };
      await waitPreview(h);
      const previewAround = statusEl().textContent;
      cancelButton().click();
      await h.sleep(60);
      const before = I18n.getLang();
      I18n.setLang('en');
      let english;
      try { await h.focusAtEnd(); await openViaPanel(h); english = Array.from(modal().querySelectorAll('.pp-calc-function')).map(b => b.textContent); cancelButton().click(); await h.sleep(60); } finally { I18n.setLang(before); }
      const checks = {
        names: same(names, ['SOMME', 'MOYENNE', 'MIN', 'MAX', 'NB', 'ARRONDI']),
        atCursor: atCursor.value === '1 + SOMME()' && atCursor.caret === 10 && atCursor.focused,
        around: around.value === 'MAX(#VcLignes.Prix * 2)' && around.caret === around.value.length,
        previewAround: previewAround === 'Résultat pour la ligne courante : 3' + NBSP + '000',
        english: same(english, ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND']),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, names, atCursor, around, previewAround, english }) };
    },
  });

  cases.push({
    id: 'varcalc_hash_in_the_field_lists_the_columns_in_front_of_the_window_and_enter_picks_before_it_validates',
    description: 'Taper « # » dans le champ ouvre la liste des colonnes, DEVANT la fenêtre (sinon elle passait dessous) ; Entrée choisit la colonne surlignée sans valider la fenêtre ; un clic sur une ligne de la liste la pose ; hors de la fenêtre la liste garde son étage habituel',
    run: async (h) => {
      await seed(h);
      await h.focusAtEnd();
      await openViaPanel(h);
      setInput(field(), '#VcFactures.H');
      await h.sleep(40);
      const box = panelBox();
      const zWindow = parseInt(getComputedStyle(modal()).zIndex, 10) || 0;
      const zList = parseInt(getComputedStyle(box).zIndex, 10) || 0;
      const items = Array.from(box.querySelectorAll('.ac-item')).map(i => i.textContent);
      const tabsHidden = getComputedStyle(box.querySelector('.ac-tabs')).display === 'none';
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await h.sleep(60);
      const afterEnter = { value: field().value, stillOpen: modalShown(), listClosed: !panelOpen(), nodes: calcNodes().length };
      setInput(field(), '#VcLignes.Pr');
      await h.sleep(40);
      const click = Array.from(panelBox().querySelectorAll('.ac-item')).find(i => i.textContent === 'VcLignes.Prix');
      if (click) click.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(60);
      const afterClick = field().value;
      cancelButton().click();
      await h.sleep(60);
      await h.focusAtEnd();
      await h.typeText('#');
      await h.sleep(60);
      const outsideZ = getComputedStyle(panelBox()).zIndex;
      const checks = {
        inFront: zList > zWindow, items: items.includes('VcFactures.HT'), tabsHidden,
        enterPicks: afterEnter.value === '#VcFactures.HT' && afterEnter.stillOpen && afterEnter.listClosed && afterEnter.nodes === 0,
        clickPicks: afterClick === '#VcLignes.Prix',
        normalLevelOutside: outsideZ !== '2200',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, zWindow, zList, items, afterEnter, afterClick, outsideZ }) };
    },
  });

  cases.push({
    id: 'varcalc_english_interface_refuses_a_decimal_comma_instead_of_reading_it_wrong',
    description: 'Interface en anglais : « 1,000 » n’est pas lu 1 (la virgule n’est pas une décimale) mais refusé avec la raison ; « 0.2 » et SUM s’acceptent ; la fenêtre, ses boutons et son aide sont en anglais',
    run: async (h) => {
      await seed(h);
      const before = I18n.getLang();
      I18n.setLang('en');
      try {
        await h.focusAtEnd();
        await openViaPanel(h);
        const texts = { title: modal().querySelector('h3').textContent, label: modal().querySelector('label').textContent, ok: okButton().textContent, cancel: cancelButton().textContent, hint: modal().querySelector('#pp-calc-hint').textContent };
        setInput(field(), '1,000 + 2');
        okButton().click();
        await h.sleep(100);
        const refused = { stays: modalShown(), message: statusEl().textContent };
        setInput(field(), '#VcFactures.HT * 0.2');
        await waitPreview(h);
        const preview = statusEl().textContent;
        okButton().click();
        await h.sleep(150);
        const stored = calcNodes()[0] && calcNodes()[0].node.attrs.formula;
        const checks = {
          texts: texts.title === 'Insert a calculation' && texts.label === 'Formula' && texts.ok === 'Insert' && texts.cancel === 'Cancel' && texts.hint.includes('Type #'),
          refused: refused.stays && refused.message.includes('Between two values'),
          accepted: preview === 'Result for the current row: 200' && stored === '{VcFactures.HT} * 0.2',
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, texts, refused, preview, stored }) };
      } finally { I18n.setLang(before); }
    },
  });

  cases.push({
    id: 'varcalc_the_matching_key_of_another_table_is_asked_for_when_saving',
    description: 'Une formule qui cite une AUTRE table que celle de la page demande sa clé de correspondance à la validation (Variables.ensureLinkConfigured, une seule fois par table, même citée deux fois) : refusée, la fenêtre reste ouverte et rien n’est inséré ; acceptée, la bulle entre. La table de la page n’en demande jamais',
    run: async (h) => {
      await seed(h);
      const original = Variables.ensureLinkConfigured;
      const asked = [];
      let answer = false;
      Variables.ensureLinkConfigured = async item => { asked.push(item.table); return answer; };
      try {
        await h.focusAtEnd();
        await openViaPanel(h);
        setInput(field(), 'SOMME(#VcLignes.Prix * #VcLignes.Qte) + #VcFactures.HT');
        okButton().click();
        await h.sleep(120);
        const refused = { asked: asked.slice(), stays: modalShown(), nodes: calcNodes().length };
        answer = true;
        okButton().click();
        await h.sleep(150);
        const accepted = { asked: asked.slice(), closed: !modalShown(), nodes: calcNodes().length };
        asked.length = 0;
        await h.focusAtEnd();
        await openViaPanel(h);
        setInput(field(), '#VcFactures.HT * 2');
        okButton().click();
        await h.sleep(150);
        const checks = {
          refused: same(refused.asked, [LINES]) && refused.stays && refused.nodes === 0,
          accepted: same(accepted.asked, [LINES, LINES]) && accepted.closed && accepted.nodes === 1,
          pageTableNeverAsks: asked.length === 0 && calcNodes().length === 2,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, refused, accepted, asked }) };
      } finally { Variables.ensureLinkConfigured = original; }
    },
  });

  cases.push({
    id: 'varcalc_a_formula_in_a_nested_zone_cites_the_tables_around_it_without_asking_for_a_key',
    description: 'Dans une zone répétée dans une autre (les détails de chaque ligne), une formule peut citer la table de la zone et celle de la zone qui l’entoure sans clé de correspondance - toutes deux lisent la ligne du tour - ; une autre table pas encore liée la demande toujours',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      stub.setVariables('VcDetails', { Ligne: 'Ref:' + LINES, Heures: 'Numeric' });
      stub.setVariables('VcAutre', { Prix: 'Numeric' });
      stub.setRows('VcDetails', [{ id: 1, Ligne: 1, Heures: 3 }]);
      stub.setRows('VcAutre', [{ id: 1, Prix: 5 }]);
      await GristAPI.refreshSchema();
      const detailLoop = { repeat: 'item', table: 'VcDetails', within: LINES, by: 'Ligne', empty: 'none' };
      Editor.setHTML(`<table><tbody><tr><td><p>${badge('Libelle', LINES, ROW_LOOP)}</p></td><td><ul><li><p>${badge('Heures', 'VcDetails', detailLoop)}</p></li></ul></td></tr></tbody></table>`);
      await h.sleep(120);
      const original = Variables.ensureLinkConfigured;
      const asked = [];
      Variables.ensureLinkConfigured = async item => { asked.push(item.table); return true; };
      // Dans l'élément de liste de la zone des détails, après une espace (la liste « # » ne s'ouvre pas à la suite d'une bulle).
      const formulaInTheZone = async formula => {
        await h.focusInElement(document.querySelector('.tiptap li p'));
        await h.typeText(' ');
        const opened = await openViaPanel(h);
        if (!opened) return { opened };
        setInput(field(), formula);
        okButton().click();
        await h.sleep(150);
        return { opened, asked: asked.slice(), closed: !modalShown(), nodes: calcNodes().length };
      };
      try {
        const around = await formulaInTheZone('#VcLignes.Prix * #VcDetails.Heures');
        asked.length = 0;
        const other = await formulaInTheZone('#VcAutre.Prix + #VcDetails.Heures');
        const checks = {
          tablesAroundNeedNoKey: around.opened && same(around.asked, []) && around.closed && around.nodes === 1,
          anotherTableAsksForItsKey: other.opened && same(other.asked, ['VcAutre']) && other.closed && other.nodes === 2,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, around, other }) : 'ok' };
      } finally { Variables.ensureLinkConfigured = original; }
    },
  });

  cases.push({
    id: 'varcalc_preview_says_why_there_is_no_result_yet',
    description: 'Sous le champ : « table pas encore liée » (la clé sera demandée à l’enregistrement) tant que la table citée n’a pas de règle, « aucune ligne sélectionnée » sans ligne courante, le zéro que le document n’écrit pas, une cellule vide ; une erreur de lecture (colonne texte) est dite en clair, sans « [ERREUR: … ] »',
    run: async (h) => {
      await seed(h);
      await GristAPI.deleteLinkRule(LINES);
      await h.focusAtEnd();
      await openViaPanel(h);
      const say = async text => { setInput(field(), text); await waitPreview(h); return statusEl().textContent; };
      const got = {};
      got.unlinked = await say('SOMME(#VcLignes.Prix)');
      await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
      await GristAPI.refreshSchema();
      got.linked = await say('SOMME(#VcLignes.Prix)');
      got.zero = await say('#VcFactures.Remise');
      got.text = await say('#VcFactures.Note + 1');
      window.__gristStub.fireRecord(null, PAGE);
      await h.sleep(60);
      got.noRow = await say('#VcFactures.HT * 2');
      cancelButton().click();
      await h.sleep(60);
      const checks = {
        unlinked: got.unlinked.includes('n’est pas encore liée') && got.unlinked.includes(LINES) && got.unlinked.includes(PAGE),
        linked: got.linked === 'Résultat pour la ligne courante : 1' + NBSP + '525',
        zero: got.zero.includes('0, que le document n’écrit pas'),
        text: got.text.includes('pas un nombre') && !got.text.includes('[ERREUR'),
        noRow: got.noRow === I18n.t('calc.status.noRow'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  // === Modifier un calcul posé ===
  async function placeOne(h, stored, format) {
    await seed(h);
    Editor.setHTML(`<p>Total ${calc(stored, format)} fin</p>`);
    await h.sleep(80);
    return calcNodes()[0];
  }
  cases.push({
    id: 'varcalc_toolbar_edit_double_click_and_enter_reopen_the_same_bubble',
    description: 'Bulle sélectionnée : la barre flottante montre « Modifier le calcul » (condition, autres attributs et boucle grisés avec leur raison, réglage nombre présent) ; ce bouton, un double-clic et Entrée ouvrent la fenêtre sur la formule en saisie ; « Valider » change la formule en place (même position, format gardé), Entrée ne coupe pas le paragraphe',
    run: async (h) => {
      const format = { type: 'number', style: 'us' };
      const placed = await placeOne(h, '{VcFactures.HT} * 0.2', format);
      await selectNode(h, placed.pos);
      const bar = toolbar();
      const reason = I18n.t('varToolbar.notForCalc');
      const barState = {
        visible: bar.classList.contains('visible'), edit: visible(toolbarButton('calc-edit')),
        condition: toolbarButton('var-condition').classList.contains('is-disabled') && toolbarButton('var-condition').title === reason,
        linked: toolbarButton('var-linked').classList.contains('is-disabled') && toolbarButton('var-linked').title === reason,
        loop: toolbarButton('var-loop').classList.contains('is-disabled') && toolbarButton('var-loop').title === reason,
        number: visible(bar.querySelector('[data-var-panel="number"]')), date: visible(bar.querySelector('[data-var-panel="date"]')), us: toolbarButton('num-style:us').classList.contains('is-active'),
      };
      pressToolbarButton('calc-edit');
      await h.sleep(120);
      const viaButton = { shown: modalShown(), title: modalShown() && modal().querySelector('h3').textContent, value: modalShown() && field().value, okLabel: modalShown() && okButton().textContent, barHidden: !bar.classList.contains('visible') };
      setInput(field(), '#VcFactures.HT * 0,5');
      okButton().click();
      await h.sleep(150);
      const edited = calcNodes();
      const afterEdit = { count: edited.length, pos: edited[0] && edited[0].pos, formula: edited[0] && edited[0].node.attrs.formula, format: edited[0] && edited[0].node.attrs.format, closed: !modalShown(), selected: ed().state.selection.from === placed.pos };
      // Double-clic
      const bubble = document.querySelector('.tiptap .calc-badge');
      bubble.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await h.sleep(120);
      const viaDouble = modalShown() && field().value === '#VcFactures.HT * 0,5';
      cancelButton().click();
      await h.sleep(80);
      // Entrée sur la bulle sélectionnée : ouvre la fenêtre, ne coupe pas le paragraphe
      await selectNode(h, placed.pos);
      const paragraphsBefore = ed().state.doc.childCount;
      document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await h.sleep(120);
      const viaEnter = { shown: modalShown(), paragraphs: ed().state.doc.childCount === paragraphsBefore };
      cancelButton().click();
      await h.sleep(80);
      const checks = {
        bar: barState.visible && barState.edit && barState.condition && barState.linked && barState.loop && barState.number && !barState.date && barState.us,
        viaButton: viaButton.shown && viaButton.title === 'Modifier le calcul' && viaButton.value === '#VcFactures.HT * 0,2' && viaButton.okLabel === 'Valider' && viaButton.barHidden,
        editedInPlace: afterEdit.count === 1 && afterEdit.pos === placed.pos && afterEdit.formula === '{VcFactures.HT} * 0.5' && same(afterEdit.format, format) && afterEdit.closed,
        viaDoubleClick: viaDouble,
        viaEnter: viaEnter.shown && viaEnter.paragraphs,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, barState, viaButton, afterEdit, viaDouble, viaEnter }) };
    },
  });

  cases.push({
    id: 'varcalc_toolbar_number_settings_apply_to_the_result_and_the_variable_bar_is_restored',
    description: 'La barre d’une bulle « Calcul » règle son résultat comme celui d’une colonne nombre : US, décimales, devise, « En lettres », zéro (bouton Ø enfoncé tant que le zéro ne s’écrit pas) ; sélectionner ensuite une bulle de variable rend à la barre ses trois boutons actifs et cache « Modifier le calcul », et un bloc ne voit pas non plus ce bouton',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${calc('{VcFactures.Remise}')} | ${badge('HT')} | ${calc('{VcFactures.HT} * 1.2345')}</p>`);
      await h.sleep(80);
      const [zeroCalc] = calcNodes();
      await selectNode(h, zeroCalc.pos);
      const zeroPressed = toolbarButton('num-zero').getAttribute('aria-pressed') === 'true';
      pressToolbarButton('num-zero');
      await h.sleep(80);
      const afterZero = calcNodes()[0].node.attrs.format;
      const reading = resolvedTexts(await renderReader(Editor.getHTML(), RECORD))[0];
      await selectNode(h, calcNodes()[1].pos);
      pressToolbarButton('num-style:us');
      await h.sleep(60);
      const sel = toolbar().querySelector('select[data-role="num-decimals"]');
      sel.value = '2';
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(60);
      const cur = toolbar().querySelector('input[data-role="num-currency"]');
      cur.value = '$';
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(60);
      const amountFormat = calcNodes()[1].node.attrs.format;
      const amountText = resolvedTexts(await renderReader(Editor.getHTML(), RECORD))[2];
      // Retour à une bulle de variable : ses trois boutons sont de nouveau actifs, « Modifier le calcul » est caché.
      let varPos = -1;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') varPos = pos; });
      await selectNode(h, varPos);
      const varBar = {
        editHidden: !visible(toolbarButton('calc-edit')), condition: !toolbarButton('var-condition').classList.contains('is-disabled') && toolbarButton('var-condition').title === I18n.t('varToolbar.condition'),
        number: visible(toolbar().querySelector('[data-var-panel="number"]')),
      };
      const checks = {
        zeroButtonStartsPressed: zeroPressed,
        zeroShownOnClick: afterZero && afterZero.zero === 'show' && reading === '0',
        usDecimalsCurrency: amountFormat && amountFormat.style === 'us' && amountFormat.decimals === 2 && amountFormat.currency === '$',
        amountWritten: /1,234\.50/.test(amountText) && amountText.includes('$'),
        variableBarRestored: varBar.editHidden && varBar.condition && varBar.number,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, afterZero, reading, amountFormat, amountText, varBar }) };
    },
  });

  cases.push({
    id: 'varcalc_bubbles_survive_copy_paste_and_damaged_html',
    description: 'Une bulle « Calcul » copiée-collée dans l’éditeur (HTML du presse-papiers) garde sa formule et son format ; une bulle sans formule lue depuis un HTML ancien ou abîmé ne fait pas planter l’éditeur et s’écrit en erreur « calcul vide » à la Lecture',
    run: async (h) => {
      await seed(h);
      const format = { type: 'number', style: 'fr', decimals: 1 };
      Editor.setHTML(`<p>${calc('{VcFactures.HT} * 2', format)}</p>`);
      await h.sleep(60);
      const html = Editor.getHTML();
      Editor.setHTML(`<p>a</p>`);
      ed().commands.insertContent(html);
      await h.sleep(60);
      const pasted = calcNodes().map(n => ({ formula: n.node.attrs.formula, format: n.node.attrs.format }));
      Editor.setHTML('<p><span class="calc-badge"></span><span class="calc-badge" data-format="pas du json"></span></p>');
      await h.sleep(60);
      const damaged = calcNodes().map(n => ({ formula: n.node.attrs.formula, format: n.node.attrs.format }));
      const reading = resolvedTexts(await renderReader(Editor.getHTML(), RECORD));
      const checks = {
        pasted: pasted.length === 1 && pasted[0].formula === '{VcFactures.HT} * 2' && same(pasted[0].format, format),
        damagedKept: damaged.length === 2 && damaged[0].formula === '' && damaged[1].format === null,
        damagedRead: reading.length === 2 && reading.every(t => t === '[ERREUR: Le calcul est vide.]'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, pasted, damaged, reading }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varCalc = cases;
})();
