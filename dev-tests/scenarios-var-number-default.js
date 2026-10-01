// Suite "varNumber" - écriture par défaut d'un nombre sans réglage de format (retour d'Antoine du 2026-10-01 : « par défaut l'UI affiche bien FR en toggle mais ce n'est
// pas le cas, il n'y a pas les espaces entre les milliers, il faut recliquer sur FR pour l'activer - la mise en forme doit suivre l'UI »). Une bulle #Variable
// sur une colonne Numérique ou Entier SANS `format` s'écrit comme le bouton que la barre flottante annonce allumé : FR (espace entre les milliers, virgule),
// ou US quand l'interface est en anglais (js/variables.js:formatValue). Une colonne Texte, une date et tout réglage explicite gardent leur écriture ; les champs
// texte (À, Cc, Cci, Objet, nom du PDF) gardent le nombre tel quel. Le séparateur de milliers est l'espace INSÉCABLE (U+00A0), pas l'espace fine d'Intl (U+202F) :
// la police des PDF n'a pas ce glyphe, qui s'y peignait en case vide.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VnFactures';
  const LINES = 'VnLignes';
  const NBSP = ' ';
  const RECORD = { id: 1, Ref: 'F-001', Montant: 1234567.5, Quantite: 1200, Code: '1200', Naissance: 631152000 };
  const DATE_1990 = () => VariableFormat.formatDate(631152000, { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key });
  // Ce que la page doit écrire pour RECORD, sans aucun réglage : Montant, Quantité (nombres), Code (texte « 1200 »), Naissance (date).
  const EXPECTED_FR = ['1' + NBSP + '234' + NBSP + '567,5', '1' + NBSP + '200', '1200', DATE_1990()];
  const EXPECTED_US = ['1,234,567.5', '1,200', '1200'];

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  function badge(column, format, table, loop) {
    const t = table || PAGE;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${t}" data-column="${column}" data-key="${t}.${column}"${format ? attr('data-format', format) : ''}${loopAttrs}></span>`;
  }
  const FOUR = `<p>${badge('Montant')}|${badge('Quantite')}|${badge('Code')}|${badge('Naissance')}</p>`;

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Ref: 'Text', Montant: 'Numeric', Quantite: 'Int', Code: 'Text', Naissance: 'Date' });
    stub.setVariables(LINES, { Facture: 'Ref:' + PAGE, Libelle: 'Text', Prix: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setRows(PAGE, [Object.assign({}, RECORD)]);
    stub.setRows(LINES, [
      { id: 1, Facture: 1, Libelle: 'Livret', Prix: 1500, manualSort: 1 },
      { id: 2, Facture: 1, Libelle: 'Envoi', Prix: 25, manualSort: 2 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    window.__gristStub.fireRecord(Object.assign({}, RECORD), PAGE);
    await h.sleep(30);
  }
  async function renderReader(html, record, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, hf || NO_HF);
    return reader;
  }
  const resolvedTexts = reader => Array.from(reader.querySelectorAll('.reader-content .resolved-var')).map(e => e.textContent);
  async function previewBox(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, record);
    return box;
  }
  const rowTexts = table => Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join(' | '));

  // Sélectionne la bulle de l'éditeur (nœud sélectionné, comme un clic dessus) : la barre flottante nombre apparaît.
  async function selectBadge(h) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
    ed.commands.setNodeSelection(pos);
    await h.sleep(150);
    return ed;
  }
  const badgeFormat = ed => { let f = null; ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') f = n.attrs.format; }); return f; };

  // Un nombre sans réglage, avec la barre qui annonce `style` allumé : le texte est celui de `expected`, et cliquer ce même bouton ne le change pas (« pas besoin de
  // recliquer »). Rend { texts, announced, afterClick, format }.
  async function defaultVersusButton(h, style) {
    await seed(h);
    const texts = resolvedTexts(await renderReader(FOUR, RECORD));
    Editor.setHTML(`<p>${badge('Montant')}</p>`);
    const ed = await selectBadge(h);
    const panel = document.querySelector('.v2-varfmt-toolbar');
    const lit = a => !!panel.querySelector(`button[data-action="num-style:${a}"]`).classList.contains('is-active');
    const announced = { visible: panel.classList.contains('visible'), fr: lit('fr'), us: lit('us'), none: lit('none') };
    panel.querySelector(`button[data-action="num-style:${style}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(80);
    const format = badgeFormat(ed);
    const afterClick = resolvedTexts(await renderReader(Editor.getHTML(), RECORD))[0];
    return { texts, announced, afterClick, format };
  }

  cases.push({
    id: 'varnumber_default_number_is_written_like_the_fr_button_the_toolbar_shows_lit',
    description: 'Interface en français : un nombre sans réglage s’écrit « 1 234 567,5 » (colonne Numérique) et « 1 200 » (Entier) comme le bouton FR que la barre montre allumé - sans recliquer dessus ; une colonne Texte « 1200 » et une date gardent leur écriture ; cliquer FR ne change alors rien',
    run: async (h) => {
      const r = await defaultVersusButton(h, 'fr');
      const checks = {
        defaultTexts: JSON.stringify(r.texts) === JSON.stringify(EXPECTED_FR),
        toolbarAnnouncesFr: r.announced.visible && r.announced.fr && !r.announced.us && !r.announced.none,
        clickingFrChangesNothing: r.afterClick === EXPECTED_FR[0] && !!r.format && r.format.type === 'number' && r.format.style === 'fr',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, texts: r.texts, announced: r.announced, afterClick: r.afterClick, format: r.format }) };
    },
  });

  cases.push({
    id: 'varnumber_default_number_follows_an_english_interface_like_the_us_button',
    description: 'Interface en anglais : un nombre sans réglage s’écrit « 1,234,567.5 » comme le bouton US que la barre montre alors allumé ; cliquer US ne change rien',
    run: async (h) => {
      const before = I18n.getLang();
      I18n.setLang('en');
      try {
        const r = await defaultVersusButton(h, 'us');
        const checks = {
          defaultTexts: JSON.stringify(r.texts.slice(0, 3)) === JSON.stringify(EXPECTED_US),
          toolbarAnnouncesUs: r.announced.visible && r.announced.us && !r.announced.fr && !r.announced.none,
          clickingUsChangesNothing: r.afterClick === EXPECTED_US[0] && !!r.format && r.format.style === 'us',
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, texts: r.texts, announced: r.announced, afterClick: r.afterClick, format: r.format }) };
      } finally { I18n.setLang(before); }
    },
  });

  cases.push({
    id: 'varnumber_explicit_choices_still_win_over_the_default',
    description: 'Un réglage posé par l’utilisateur n’est jamais écrasé par l’écriture par défaut : US dans une interface française, « — » (sans séparateur de milliers), décimales et devise, « Lettres » ; une colonne Texte, une valeur vide et un texte saisi dans une colonne numérique (« 12 EUR ») restent ce qu’ils sont',
    run: async (h) => {
      await seed(h);
      const fv = (v, f, col) => Variables.formatValue(v, f, PAGE, col || 'Montant');
      const got = {
        us: fv(1234567.5, { type: 'number', style: 'us' }), none: fv(1234567.5, { type: 'number', style: 'none' }),
        money: fv(1200, { type: 'number', style: 'fr', decimals: 2, currency: '€' }), words: fv(21, { type: 'number', words: true }),
        decimals0: fv(1234.56, { type: 'number', decimals: 0 }), textColumn: fv('1200', null, 'Code'), emptyNumber: fv(null, null), emptyText: fv('', null, 'Code'),
        textWithFormat: fv('1200', { type: 'number', style: 'none' }, 'Code'),
        // Un texte saisi dans une colonne numérique (Grist le garde tel quel, en rouge) n'est pas un nombre : il reste ce qu'il est, sans perdre sa fin.
        altText: fv('12 EUR', null), altError: fv('#N/A', null), altQuantity: fv('trois', null, 'Quantite'),
      };
      const expected = {
        us: '1,234,567.5', none: '1234567,5', money: '1' + NBSP + '200,00' + NBSP + '€', words: 'vingt et un',
        decimals0: '1' + NBSP + '235', textColumn: '1200', emptyNumber: '', emptyText: '', textWithFormat: '1200',
        altText: '12 EUR', altError: '#N/A', altQuantity: 'trois',
      };
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  cases.push({
    id: 'varnumber_text_fields_keep_the_number_as_the_grist_stores_it',
    description: 'Les champs texte (Objet, À, Cc, Cci du mode email, nom du fichier PDF) gardent le nombre tel quel : « Facture 2026012 » ne devient pas « Facture 2 026 012 », un 0 reste « 0 »',
    run: async (h) => {
      await seed(h);
      const record = { id: 1, Ref: 'F-001', Montant: 0, Quantite: 2026012, Code: '1200', Naissance: 631152000 };
      const subject = await Variables.resolveTextVariables(`Facture #${PAGE}.Quantite - #${PAGE}.Montant - #${PAGE}.Code`, PAGE, record);
      const filename = await ReaderMode.resolveFilename(`Facture_#${PAGE}.Quantite_#${PAGE}.Montant`, PAGE, record);
      const bubble = await Variables.resolveVariable(PAGE, 'Quantite', PAGE, record);
      const got = { subject, filename, bubble };
      const expected = { subject: 'Facture 2026012 - 0 - 1200', filename: 'Facture_2026012_0', bubble: '2' + NBSP + '026' + NBSP + '012' };
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  cases.push({
    id: 'varnumber_default_applies_to_every_render_path',
    description: 'Même écriture par défaut dans le corps de la Lecture, l’aperçu commun du PDF, du Word et de l’email, la ligne brute d’un lot (fetchTable), l’en-tête/pied résolu, la case d’un tableau en boucle et la valeur d’une boucle dans la phrase',
    run: async (h) => {
      await seed(h);
      const rowLoop = { repeat: 'row', table: LINES, empty: 'header' };
      const inlineLoop = { repeat: 'inline', table: LINES, empty: 'text', emptyText: 'aucun', separator: ', ', lastSeparator: ' et ' };
      const cell = content => `<td><p>${content}</p></td>`;
      const loopHtml = '<table><tbody><tr><th><p>Libellé</p></th><th><p>Prix</p></th></tr>'
        + `<tr>${cell(badge('Libelle', null, LINES, rowLoop))}${cell(badge('Prix', null, LINES))}</tr></tbody></table><p>Prix : ${badge('Prix', null, LINES, inlineLoop)}.</p>`;
      const sentenceOf = root => Array.from(root.children).filter(c => c.tagName === 'P').pop().textContent;
      const rows = await GristAPI.fetchTableRows(PAGE);
      const batchRow = rows.find(r => r.id === 1);
      const hf = { enabled: true, differentFirstPage: false, header: { default: `<p>${badge('Quantite')}</p>`, first: '' }, footer: { default: `<p>${badge('Montant')}</p>`, first: '' } };
      const zones = await ExportCommon.resolveHeaderFooterVariables(hf, PAGE, RECORD);
      const zoneText = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
      const readLoop = (await renderReader(loopHtml, RECORD)).querySelector('.reader-content');
      const previewLoop = await previewBox(loopHtml, RECORD);
      const got = {
        reading: resolvedTexts(await renderReader(FOUR, RECORD)),
        preview: Array.from((await previewBox(FOUR, RECORD)).querySelectorAll('p')).map(p => p.textContent),
        batch: (await previewBox(FOUR, batchRow)).textContent,
        header: zoneText(zones.header.default), footer: zoneText(zones.footer.default),
        loopRead: { rows: rowTexts(readLoop.querySelector('table')), sentence: sentenceOf(readLoop) },
        loopPreview: { rows: rowTexts(previewLoop.querySelector('table')), sentence: sentenceOf(previewLoop) },
      };
      const joined = EXPECTED_FR.join('|');
      const loopOk = r => JSON.stringify(r.rows) === JSON.stringify(['Libellé | Prix', 'Livret | 1' + NBSP + '500', 'Envoi | 25']) && r.sentence === 'Prix : 1' + NBSP + '500 et 25.';
      const checks = {
        reading: JSON.stringify(got.reading) === JSON.stringify(EXPECTED_FR),
        preview: JSON.stringify(got.preview) === JSON.stringify([joined]),
        batch: got.batch === joined,
        header: got.header === '1' + NBSP + '200', footer: got.footer === '1' + NBSP + '234' + NBSP + '567,5',
        loopRead: loopOk(got.loopRead), loopPreview: loopOk(got.loopPreview),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  // --- Les fichiers : le PDF (police pdfmake) et le Word ---
  async function pdfText(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(it => it.str).join(' ');
    return text;
  }
  cases.push({
    id: 'varnumber_pdf_and_docx_files_write_the_thousands_space_without_a_missing_glyph',
    description: 'Le vrai PDF et le vrai DOCX écrivent « 1 234 567,5 » et « 1 200 » (écriture par défaut, et FR choisi à la main) : le PDF ne contient aucun glyphe manquant à la place de l’espace des milliers (U+202F absent de la police Roboto, qui s’y peignait en case vide)',
    run: async (h) => {
      await seed(h);
      const explicitFr = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
      const html = `<p>Défaut : ${badge('Montant')} et ${badge('Quantite')} ; FR choisi : ${badge('Montant', explicitFr)}.</p>`;
      await PdfExport.ensurePdfLibsLoaded();
      const pdf = await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, PAGE, RECORD, '', NO_HF, undefined)).blob);
      await DocxExport.ensureDocxLibLoaded();
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(await (await DocxExport.getDocxBlobForRecord(html, PAGE, RECORD, '', NO_HF, null)).blob.arrayBuffer());
      const docx = Array.from(new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const flat = pdf.replace(/\s+/g, ' ');
      const checks = {
        pdfText: /1 234 567,5 ?et ?1 200/.test(flat) && /1 234 567,50 ?€/.test(flat),
        pdfNoMissingGlyph: !/[\u0000�]/.test(pdf),
        docxText: docx.includes('Défaut : 1' + NBSP + '234' + NBSP + '567,5 et 1' + NBSP + '200 ; FR choisi : 1' + NBSP + '234' + NBSP + '567,50' + NBSP + '€.'),
        noNarrowSpaceAnywhere: !pdf.includes(' ') && !docx.includes(' '),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, pdf: JSON.stringify(pdf.slice(0, 160)), docx }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varNumber = cases;
})();
