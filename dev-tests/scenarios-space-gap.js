// Suite "spaceGap" - les espaces autour de ce qui n'écrit rien (retours d'Antoine du 2026-10-13 : « quand deux puces valeurs conditionnelles se suivent, quand une valeur
// n'est pas validée on dirait que ça ajoute un espace », puis « des espaces sont parfois ajoutés avant / après certaines variables ou puces »). Une valeur conditionnelle
// retirée, une bulle masquée par sa condition, vide, à zéro masqué, à sinon vide ou en boucle sans ligne n'écrivent rien : les espaces tapés autour d'elles ne doivent pas
// s'additionner (« Cher Monsieur , bonjour », « Bonjour  Durand », un paragraphe qui commence ou finit par une espace). js/space-gap.js fait le travail à un seul endroit ;
// js/reader-mode.js l'appelle quand une bulle prend sa valeur (Lecture, aperçu commun au PDF, au Word, à l'Excel et à l'e-mail, en-têtes et pieds, champs texte),
// js/conditional-value.js quand il retire une valeur.
// Les surfaces lues sont les vraies : la Lecture, l'aperçu commun, la zone d'en-tête de la Lecture et des exports, le champ texte, les runs du PDF, les paragraphes du Word,
// le corps de l'e-mail et la case de l'Excel.
(function () {
  const cases = [];

  const TABLE = 'SgFactures';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  // Deux lignes de la page : la première a un prénom, deux lignes dans SgLignes et le statut « Urgent » ; la seconde n'a ni prénom, ni ligne, un montant nul et le statut « Normal ».
  const ROW_URGENT = { id: 1, Client: 'Atelier Durand', Prenom: 'Jean', Statut: 'Urgent', Montant: 1200 };
  const ROW_NORMAL = { id: 2, Client: 'Cabinet Roux', Prenom: '', Statut: 'Normal', Montant: 0 };
  // L'espace insécable, construite à l'exécution : écrite en toutes lettres dans ce fichier, elle ne se distinguerait pas d'une espace.
  const NBSP = String.fromCharCode(0xA0);

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  // Le HTML enregistré d'une valeur conditionnelle et d'une bulle : exactement ce que écrit renderHTML.
  const val = (inner, condition) => `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}>${inner}</span>`;
  function bubble(column, opts) {
    const o = opts || {};
    const otherwise = o.otherwise ? ` data-otherwise-table="${TABLE}" data-otherwise-column="${o.otherwise}" data-otherwise-key="${TABLE}.${o.otherwise}"` : '';
    const loop = o.loop ? attr('data-loop', o.loop) + ` data-loop-repeat="${o.loop.repeat}"` : '';
    const table = o.table || TABLE;
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${o.condition ? attr('data-condition', o.condition) : ''}`
      + `${o.format ? attr('data-format', o.format) : ''}${o.before ? ` data-before="${o.before}"` : ''}${o.after ? ` data-after="${o.after}"` : ''}${otherwise}${loop}></span>`;
  }
  const lines = { repeat: 'inline', table: 'SgLignes', empty: 'blank', separator: ', ' };
  // Une bulle « Calcul » : le montant de la ligne doublé, que le zéro masqué (Montant à 0) laisse sans valeur.
  const calc = formula => `<span class="calc-badge" data-formula="${formula}"></span>`;
  const DOUBLE = '{' + TABLE + '.Montant} * 2';

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Client: 'Text', Prenom: 'Text', Statut: 'Choice', Montant: 'Numeric' }, { Statut: ['Urgent', 'Normal'] });
    stub.setVariables('SgLignes', { Facture: 'Ref:' + TABLE, Designation: 'Text' });
    stub.setRows(TABLE, [Object.assign({}, ROW_URGENT), Object.assign({}, ROW_NORMAL)]);
    stub.setRows('SgLignes', [{ id: 1, Facture: 1, Designation: 'Audit' }, { id: 2, Facture: 1, Designation: 'Livret' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('SgLignes');
    await GristAPI.saveLinkRule('SgLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, ROW_URGENT), TABLE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const firstParagraph = root => { const p = root.querySelector('p'); return p ? p.textContent : null; };

  async function readerHtml(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), hf || NO_HF);
    return reader.querySelector('.reader-content');
  }
  async function pdfParagraph(h, html, record, needle) {
    await PdfExport.ensurePdfLibsLoaded();
    const result = await h.exportPdfContent(html, null, undefined, { tableId: TABLE, record });
    const block = h.findTextBlocks(result.content, b => h.blockPlainText(b).indexOf(needle) !== -1)[0];
    return block ? h.blockPlainText(block) : null;
  }
  async function docxParagraph(html, record, needle) {
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, TABLE, record, '', NO_HF, null);
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const paragraphs = Array.from(xml.getElementsByTagName('w:p')).map(p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join(''));
    return paragraphs.find(t => t.indexOf(needle) !== -1) || null;
  }
  async function xlsxCell(html, record) {
    GridEditor.setActive(false);
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, TABLE, record, '');
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sst = new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml');
    const first = sst.getElementsByTagName('si')[0];
    return first ? Array.from(first.getElementsByTagName('t')).map(t => t.textContent).join('') : null;
  }

  // Ce que chaque surface écrit pour ce paragraphe (`html` : un seul <p>) et cette ligne ; `needle` : un mot du paragraphe, pour le retrouver dans le PDF et le Word.
  async function surfaces(h, html, record, needle) {
    await setRecord(h, record);
    const reader = await readerHtml(html);
    const readerText = firstParagraph(reader);
    const mailText = MailtoExport.plainTextFromHtml(reader.innerHTML).replace(/\n+$/, '');
    const previewBox = document.createElement('div');
    previewBox.innerHTML = await ReaderMode.preview(html, TABLE, record);
    const hf = { enabled: true, differentFirstPage: false, header: { default: html, first: '' }, footer: { default: '', first: '' } };
    const zones = await ExportCommon.resolveHeaderFooterVariables(hf, TABLE, record);
    const zoneBox = document.createElement('div');
    zoneBox.innerHTML = zones.header.default;
    return {
      reader: readerText,
      preview: firstParagraph(previewBox),
      exportZone: firstParagraph(zoneBox),
      pdf: await pdfParagraph(h, html, record, needle),
      docx: await docxParagraph(html, record, needle),
      mail: mailText,
      xlsx: await xlsxCell(html, record),
    };
  }
  // Toutes les surfaces disent `expected` : rend les écarts, ou null.
  function mismatches(found, expected) {
    const bad = {};
    Object.keys(found).forEach(key => { if (found[key] !== expected) bad[key] = found[key]; });
    return Object.keys(bad).length ? bad : null;
  }

  // --- 1) Le cas d'Antoine : deux valeurs conditionnelles qui se suivent ---
  cases.push({
    id: 'spacegap_two_conditional_values_in_a_row_leave_one_space_only_on_every_surface',
    description: 'Deux valeurs conditionnelles côte à côte, séparées par une espace : celle qui n\'est pas retenue ne laisse pas son espace - ni « Monsieur , » devant la virgule, ni deux espaces - dans la Lecture, l\'aperçu des exports, l\'en-tête, le PDF, le Word, l\'e-mail et l\'Excel',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Cher ' + val('Monsieur', COND_URGENT) + ' ' + val('Madame', COND_NORMAL) + ', bonjour.</p>';
        const urgent = await surfaces(h, html, ROW_URGENT, 'bonjour');
        const normal = await surfaces(h, html, ROW_NORMAL, 'bonjour');
        const badUrgent = mismatches(urgent, 'Cher Monsieur, bonjour.');
        const badNormal = mismatches(normal, 'Cher Madame, bonjour.');
        return { pass: !badUrgent && !badNormal, notes: JSON.stringify({ badUrgent, badNormal }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_a_removed_value_at_the_start_or_the_end_of_a_paragraph_leaves_no_edge_space',
    description: 'Une valeur retirée (ou laissée vide) au début, au milieu ou à la fin d\'un paragraphe n\'y laisse pas d\'espace : le paragraphe ne commence ni ne finit par une espace',
    run: async (h) => {
      try {
        await seed(h);
        const start = '<p>' + val('Madame', COND_NORMAL) + ' Durand arrive</p>';
        const end = '<p>Durand arrive ' + val('Madame', COND_NORMAL) + '</p>';
        const both = '<p>' + val('Madame', COND_NORMAL) + ' ' + val('Monsieur', COND_NORMAL) + ' Durand</p>';
        // Une valeur dont la condition est remplie mais qu'on a laissée vide n'écrit rien non plus.
        const emptyKept = '<p>Cher ' + val('', COND_URGENT) + ' Durand</p>';
        const out = {
          start: mismatches(await surfaces(h, start, ROW_URGENT, 'Durand'), 'Durand arrive'),
          end: mismatches(await surfaces(h, end, ROW_URGENT, 'Durand'), 'Durand arrive'),
          both: mismatches(await surfaces(h, both, ROW_URGENT, 'Durand'), 'Durand'),
          emptyKept: mismatches(await surfaces(h, emptyKept, ROW_URGENT, 'Durand'), 'Cher Durand'),
        };
        return { pass: Object.values(out).every(v => v === null), notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  // --- 2) Les bulles qui n'écrivent rien ---
  cases.push({
    id: 'spacegap_a_variable_that_writes_nothing_leaves_one_space_only',
    description: 'Une bulle vide, masquée par sa condition, à zéro masqué, à sinon vide, à Avant / Après sans valeur, en boucle sans ligne ou de calcul à zéro ne double pas les espaces autour d\'elle, ni ne laisse une espace devant la virgule ou au bord du paragraphe',
    run: async (h) => {
      try {
        await seed(h);
        const empty = '<p>Bonjour ' + bubble('Prenom') + ' ' + bubble('Client') + ', merci</p>';
        const emptyLast = '<p>Bonjour ' + bubble('Client') + ' ' + bubble('Prenom') + ', merci</p>';
        const hidden = '<p>Bonjour ' + bubble('Prenom', { condition: COND_NORMAL }) + ' ' + bubble('Client') + ', merci</p>';
        const zero = '<p>Bonjour ' + bubble('Montant', { format: { zero: 'hide' } }) + ' ' + bubble('Client') + ', merci</p>';
        const otherwise = '<p>Bonjour ' + bubble('Client', { condition: COND_URGENT, otherwise: 'Prenom' }) + ' ' + bubble('Client') + ', merci</p>';
        const affix = '<p>Bonjour ' + bubble('Prenom', { before: 'M. ', after: '.' }) + ' ' + bubble('Client') + ', merci</p>';
        const loop = '<p>Bonjour ' + bubble('Designation', { table: 'SgLignes', loop: lines }) + ' ' + bubble('Client') + ', merci</p>';
        const calcZero = '<p>Bonjour ' + calc(DOUBLE) + ' ' + bubble('Client') + ', merci</p>';
        const firstOfLine = '<p>' + bubble('Prenom') + ' ' + bubble('Client') + ', merci</p>';
        const lastOfLine = '<p>Merci ' + bubble('Client') + ' ' + bubble('Prenom') + '</p>';
        const out = {
          emptyOnNormal: mismatches(await surfaces(h, empty, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          emptyLastOnNormal: mismatches(await surfaces(h, emptyLast, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          hiddenOnUrgent: mismatches(await surfaces(h, hidden, ROW_URGENT, 'merci'), 'Bonjour Atelier Durand, merci'),
          zeroOnNormal: mismatches(await surfaces(h, zero, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          otherwiseOnNormal: mismatches(await surfaces(h, otherwise, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          affixOnNormal: mismatches(await surfaces(h, affix, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          loopOnNormal: mismatches(await surfaces(h, loop, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          calcOnNormal: mismatches(await surfaces(h, calcZero, ROW_NORMAL, 'merci'), 'Bonjour Cabinet Roux, merci'),
          firstOfLineOnNormal: mismatches(await surfaces(h, firstOfLine, ROW_NORMAL, 'merci'), 'Cabinet Roux, merci'),
          lastOfLineOnNormal: mismatches(await surfaces(h, lastOfLine, ROW_NORMAL, 'Merci'), 'Merci Cabinet Roux'),
        };
        const pass = Object.values(out).every(v => v === null);
        return { pass, notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_the_text_fields_of_the_email_and_the_pdf_name_close_the_gap_too',
    description: 'Les champs texte à bulles (Objet, À, Cc, Cci, nom du PDF) : une bulle vide ou masquée ne laisse ni deux espaces ni une espace au bord du champ',
    run: async (h) => {
      try {
        await seed(h);
        await setRecord(h, ROW_NORMAL);
        const field = (a, b, c) => 'Facture ' + a + ' ' + b + ' ' + c;
        const emptyFirst = await ReaderMode.fieldText(field(bubble('Prenom'), bubble('Client'), '(' + bubble('Montant') + ')'), TABLE, ROW_NORMAL);
        // L'espace tapée derrière la dernière bulle, qui s'écrit, reste.
        const hiddenSecond = await ReaderMode.fieldText('Objet : ' + bubble('Client', { condition: COND_URGENT }) + ' ' + bubble('Client') + ' ', TABLE, ROW_NORMAL);
        const atStart = await ReaderMode.fieldText(bubble('Prenom') + ' ' + bubble('Client'), TABLE, ROW_NORMAL);
        // Le nom du PDF : les espaces des valeurs deviennent des tirets, celles tapées entre les bulles et le vide d'une bulle sans valeur se referment comme ailleurs.
        const named = await ReaderMode.fieldText(bubble('Client') + ' ' + bubble('Prenom') + ' ' + bubble('Statut'), TABLE, ROW_NORMAL, text => text.replace(/\s/g, '-'));
        const out = { emptyFirst, hiddenSecond, atStart, named };
        const pass = emptyFirst === 'Facture Cabinet Roux (0)' && hiddenSecond === 'Objet : Cabinet Roux ' && atStart === 'Cabinet Roux' && named === 'Cabinet-Roux Normal';
        return { pass, notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_the_reading_header_closes_the_gap_too',
    description: 'L\'en-tête et le pied de la Lecture (leur propre chemin de résolution) : une bulle vide, masquée, en boucle sans ligne ou de calcul à zéro, ou une valeur conditionnelle retirée, ne laisse pas deux espaces',
    run: async (h) => {
      try {
        await seed(h);
        await setRecord(h, ROW_NORMAL);
        const hf = {
          enabled: true, differentFirstPage: false,
          header: {
            default: '<p>En-tête ' + bubble('Prenom') + ' ' + bubble('Client') + ' ' + val('urgent', COND_URGENT) + ' ' + bubble('Designation', { table: 'SgLignes', loop: lines }) + ' fin</p>'
              + '<p>Total ' + calc(DOUBLE) + ' euros</p>',
            first: '',
          },
          footer: { default: '<p>' + bubble('Prenom') + ' Pied ' + bubble('Client', { condition: COND_URGENT }) + '</p>', first: '' },
        };
        h.setA4Preview(true);
        await readerHtml('<p>Corps</p>', hf);
        const header = document.querySelector('#reader-container .v2-page-edge-top');
        const footer = document.querySelector('#reader-container .v2-page-edge-bottom');
        const headerLines = header ? Array.from(header.querySelectorAll('p')).map(p => p.textContent) : null;
        const footerText = footer ? footer.textContent : null;
        const pass = JSON.stringify(headerLines) === JSON.stringify(['En-tête Cabinet Roux fin', 'Total euros']) && footerText === 'Pied';
        return { pass, notes: JSON.stringify({ headerLines, footerText }) };
      } finally { h.setA4Preview(false); closeReader(); }
    },
  });

  // --- 3) Ce qui ne bouge pas ---
  cases.push({
    id: 'spacegap_spaces_around_what_is_written_are_left_as_typed',
    description: 'Les espaces tapés autour d\'une valeur ou d\'une bulle qui s\'écrit, et les doubles espaces tapés ailleurs dans le texte, ne bougent pas : seule la place d\'une valeur qui n\'écrit rien est refermée',
    run: async (h) => {
      try {
        await seed(h);
        const typed = '<p>Cher  ' + val('Monsieur', COND_URGENT) + ' , ' + bubble('Prenom') + '  ' + bubble('Client') + ' ,  merci</p>';
        const bad = mismatches(await surfaces(h, typed, ROW_URGENT, 'merci'), 'Cher  Monsieur , Jean  Atelier Durand ,  merci');
        return { pass: !bad, notes: JSON.stringify(bad) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_a_typed_space_before_a_french_colon_or_after_a_glued_comma_is_kept_as_typed',
    description: 'Une valeur retirée entre deux mots garde l\'espace du mot qui précède : « Total _ : 100 » donne « Total : 100 » et « Montant _, » donne « Montant, » seulement quand la virgule était collée',
    run: async (h) => {
      try {
        await seed(h);
        const colon = '<p>Total ' + val('TTC', COND_NORMAL) + ' : 100 euros</p>';
        const gluedColon = '<p>Total ' + val('TTC', COND_NORMAL) + ': 100 euros</p>';
        const spacedComma = '<p>Total ' + val('TTC', COND_NORMAL) + ' , 100 euros</p>';
        const out = {
          colon: mismatches(await surfaces(h, colon, ROW_URGENT, 'euros'), 'Total : 100 euros'),
          gluedColon: mismatches(await surfaces(h, gluedColon, ROW_URGENT, 'euros'), 'Total: 100 euros'),
          spacedComma: mismatches(await surfaces(h, spacedComma, ROW_URGENT, 'euros'), 'Total , 100 euros'),
        };
        return { pass: Object.values(out).every(v => v === null), notes: JSON.stringify(out) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_the_template_itself_is_not_touched',
    description: 'Les espaces ne sont refermées que dans le HTML résolu de la ligne : le modèle enregistré garde la valeur retirée et ses espaces, la ligne suivante les retrouve',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Cher ' + val('Monsieur', COND_URGENT) + ' ' + val('Madame', COND_NORMAL) + ', bonjour.</p>';
        Editor.setHTML(html);
        await h.sleep(80);
        const saved = Editor.getHTML();
        const first = (await surfaces(h, saved, ROW_URGENT, 'bonjour')).reader;
        const second = (await surfaces(h, saved, ROW_NORMAL, 'bonjour')).reader;
        const savedAgain = Editor.getHTML();
        const pass = first === 'Cher Monsieur, bonjour.' && second === 'Cher Madame, bonjour.' && saved === savedAgain
          && /Cher <span[^>]*conditional-value[^>]*>Monsieur<\/span> <span[^>]*conditional-value[^>]*>Madame<\/span>, bonjour\./.test(saved);
        return { pass, notes: JSON.stringify({ first, second, saved: saved.slice(0, 200) }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'spacegap_reading_comments_keep_their_positions_when_a_text_loses_its_first_space',
    description: 'Commentaires en Lecture : le texte qui perd son espace de tête garde sa position dans le modèle (data-pp-pos avancé d\'autant), le texte retrouvé à chaque position est le bon',
    run: async (h) => {
      try {
        await seed(h);
        Editor.setHTML('<p>Avant ' + val('visible', COND_URGENT) + ' et ' + val('masquée', COND_NORMAL) + ' après</p>');
        await h.sleep(80);
        const tagged = await Comments.buildReaderHtml();
        const reader = await readerHtml(tagged);
        const marks = Array.from(reader.querySelectorAll('[data-pp-pos]')).map(span => {
          const raw = span.getAttribute('data-pp-pos');
          const pos = Number(raw.slice(raw.indexOf(':') + 1));
          return { text: span.textContent, found: EditorCore.getEditor().state.doc.textBetween(pos, pos + span.textContent.length) };
        });
        const texts = marks.map(m => m.text).join('|');
        const pass = marks.length === 4 && marks.every(m => m.text === m.found) && texts === 'Avant |visible| et |après' && firstParagraph(reader) === 'Avant visible et après';
        return { pass, notes: JSON.stringify({ marks, paragraph: firstParagraph(reader) }) };
      } finally { closeReader(); }
    },
  });

  // --- 4) La règle elle-même (SpaceGap.absorb), sur du HTML posé à la main : `<span data-gap>` est ce qui n'écrit rien ---
  const GAP = '<span data-gap></span>';
  const RULES = [
    ['une espace devant une virgule collée', `<p>Cher Monsieur ${GAP}, bonjour.</p>`, 'Cher Monsieur, bonjour.'],
    ['une espace devant un point collé', `<p>Merci ${GAP}.</p>`, 'Merci.'],
    ['une espace devant un point d\'exclamation collé', `<p>Bonjour ${GAP}!</p>`, 'Bonjour!'],
    ['des espaces des deux côtés : celle de droite part', `<p>Cher ${GAP} Durand</p>`, 'Cher Durand'],
    ['rien d\'une part : rien ne bouge', `<p>Cher ${GAP}Durand</p>`, 'Cher Durand'],
    ['rien de l\'autre part : rien ne bouge', `<p>Cher${GAP} Durand</p>`, 'Cher Durand'],
    ['premier de sa ligne : l\'espace qui suit part', `<p>${GAP} Durand</p>`, 'Durand'],
    ['dernier de sa ligne : l\'espace qui précède part', `<p>Durand ${GAP}</p>`, 'Durand'],
    ['dernier de sa ligne, collé au mot : l\'espace qui suit part', `<p>Durand${GAP} </p>`, 'Durand'],
    ['seul dans son paragraphe, entre deux espaces', `<p> ${GAP} </p>`, ''],
    ['une double espace tapée à gauche reste entière', `<p>Cher  ${GAP}  Durand</p>`, 'Cher  Durand'],
    ['une double espace tapée ailleurs reste', `<p>Cher  Durand ${GAP}</p>`, 'Cher  Durand'],
    ['une double espace au bord du début, devant le mot qui suit, est un retrait : il reste', `<p>   ${GAP} Durand</p>`, '   Durand'],
    ['l\'espace d\'un deux-points à la française reste', `<p>Total ${GAP} : 100</p>`, 'Total : 100'],
    ['un deux-points collé s\'écrit contre le mot', `<p>Total ${GAP}: 100</p>`, 'Total: 100'],
    ['une parenthèse ouvrante n\'a pas d\'espace derrière', `<p>Cher (${GAP} Durand)</p>`, 'Cher (Durand)'],
    ['un guillemet ouvrant suivi d\'une espace garde la sienne', `<p>Cher « ${GAP} Durand »</p>`, 'Cher « Durand »'],
    ['l\'insécable de gauche reste, l\'espace de droite part', `<p>Total${NBSP}${GAP} €</p>`, `Total${NBSP}€`],
    ['une espace dans un texte en gras', `<p><strong>Cher </strong>${GAP} <em>bonjour</em></p>`, 'Cher bonjour'],
    ['une espace de tête dans un texte en italique', `<p>Cher ${GAP}<em> bonjour</em></p>`, 'Cher bonjour'],
    ['des espaces réparties sur plusieurs textes', `<p>Cher <strong> </strong>${GAP} <em> </em>bonjour</p>`, 'Cher  bonjour'],
    ['une image est un voisin : elle n\'est pas traversée', `<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="> ${GAP} texte</p>`, ' texte'],
    ['une image juste derrière : rien ne bouge', `<p>texte ${GAP}<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></p>`, 'texte '],
    ['une bulle pas encore résolue est un voisin', `<p>Cher ${GAP} <span class="var-badge">Nom</span></p>`, 'Cher Nom'],
    ['une puce pas encore résolue est un voisin', `<p>Le ${GAP}, <span class="smart-chip" data-chip-kind="date">Date</span></p>`, 'Le, Date'],
    ['un retour à la ligne est un bord : après lui, l\'espace de tête part', `<p>ligne<br>${GAP} suite</p>`, 'lignesuite'],
    ['un retour à la ligne est un bord : avant lui, l\'espace de queue part', `<p>ligne ${GAP}<br>suite</p>`, 'lignesuite'],
    ['un autre paragraphe n\'est pas touché', `<p>a </p><p>${GAP} b</p><p> c</p>`, 'a b c'],
    ['un item de liste est un bloc', `<ul><li>${GAP} a</li><li>b ${GAP}</li></ul>`, 'ab'],
    ['une case de tableau est un bloc', `<table><tbody><tr><td>${GAP} a</td><td>b ${GAP}</td></tr></tbody></table>`, 'ab'],
    ['un bloc de code est laissé tel quel', `<pre>a ${GAP} b</pre>`, 'a  b'],
    ['plusieurs vides de suite', `<p>x ${GAP} ${GAP} y</p>`, 'x y'],
    ['plusieurs vides collés à une ponctuation', `<p>x ${GAP} ${GAP}, y</p>`, 'x, y'],
    ['un élément vide au milieu est traversé', `<p>Cher<b></b> ${GAP} Durand</p>`, 'Cher Durand'],
  ];
  cases.push({
    id: 'spacegap_rule_absorb_removes_only_the_space_that_the_absence_leaves',
    description: 'SpaceGap.absorb sur du HTML posé à la main : une espace de chaque côté en laisse une, le début et la fin d\'un paragraphe n\'en gardent pas, une ponctuation collée s\'écrit contre le mot d\'avant, rien d\'autre ne bouge',
    run: async () => {
      const failures = [];
      RULES.forEach(([name, html, expected]) => {
        const box = document.createElement('div');
        box.innerHTML = html;
        Array.from(box.querySelectorAll('[data-gap]')).forEach(gap => SpaceGap.absorb(gap));
        const found = box.textContent;
        if (found !== expected) failures.push({ name, found, expected });
      });
      return { pass: failures.length === 0, notes: JSON.stringify(failures) };
    },
  });

  cases.push({
    id: 'spacegap_rule_absorb_moves_a_reading_position_with_the_text_it_shortens',
    description: 'Un texte de la Lecture qui perd ses premiers caractères avance sa position (data-pp-pos « rendu:position ») d\'autant ; celui qui perd les derniers ou qu\'on ne touche pas la garde',
    run: async () => {
      const box = document.createElement('div');
      box.innerHTML = `<p><span data-pp-pos="4:10">Cher </span>${GAP}<span data-pp-pos="4:15"> Durand</span><span data-pp-pos="4:22"> fin</span></p>`;
      SpaceGap.absorb(box.querySelector('[data-gap]'));
      const spans = Array.from(box.querySelectorAll('[data-pp-pos]')).map(s => [s.textContent, s.getAttribute('data-pp-pos')]);
      const expected = [['Cher ', '4:10'], ['Durand', '4:16'], [' fin', '4:22']];
      return { pass: JSON.stringify(spans) === JSON.stringify(expected), notes: JSON.stringify(spans) };
    },
  });

  cases.push({
    id: 'spacegap_writes_nothing_tells_a_value_that_writes_nothing_from_the_others',
    description: 'SpaceGap.writesNothing : un texte vide et un <span> vide n\'écrivent rien ; un texte, un <span> avec du texte, une image, une case et un fragment d\'images écrivent quelque chose',
    run: async () => {
      const span = html => { const el = document.createElement('span'); el.innerHTML = html; return el; };
      const fragment = document.createDocumentFragment();
      fragment.appendChild(document.createElement('img'));
      const checks = {
        emptyText: SpaceGap.writesNothing(document.createTextNode('')) === true,
        emptySpan: SpaceGap.writesNothing(span('')) === true,
        text: SpaceGap.writesNothing(document.createTextNode('a')) === false,
        spaceText: SpaceGap.writesNothing(document.createTextNode(' ')) === false,
        spanWithText: SpaceGap.writesNothing(span('a')) === false,
        spanWithImage: SpaceGap.writesNothing(span('<img>')) === false,
        image: SpaceGap.writesNothing(document.createElement('img')) === false,
        fragment: SpaceGap.writesNothing(fragment) === false,
        nothing: SpaceGap.writesNothing(null) === false,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.spaceGap = cases;
})();
