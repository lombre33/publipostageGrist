// Suite "lineBreaks" - les retours à la ligne d'un modèle et d'une valeur, de l'éditeur à tout ce qui en sort (consignes 091 et 092 de GFS, retours du porteur du 19/11 : « les sauts de ligne en mode
// grille ne sont pas conservés en lecture et à l'export »).
//  092 : un retour saisi (Maj+Entrée, un <br>) À LA FIN d'une case ou d'un paragraphe garde sa ligne vide en Lecture, dans le texte et la hauteur de ligne d'Excel et d'ODS, et dans le PDF (grille
//        et document), comme dans l'éditeur (ProseMirror y pose un <br> de fin que le HTML n'a pas) et dans Word (qui écrivait déjà son `w:br`) : n retours de fin = n + 1 lignes, pas n.
//  091 : une valeur de colonne Texte à plusieurs lignes (`\n` comme `\r\n`) garde ses lignes dans l'export Excel (avec `wrapText`), l'export ODS et l'export Word ; un retour saisi reste comme avant ; le
//        blanc entre deux blocs n'ajoute pas de ligne ; le retour qui termine une valeur n'ouvre pas de ligne non plus (comme à la Lecture et dans le PDF).
// On lit les FICHIERS écrits (le .xlsx, le .ods et le .docx dézippés, le PDF relu par pdf.js), jamais les objets des bibliothèques, et la Lecture sur ses vraies hauteurs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TABLE = 'RetoursLigne';
  const RECORD = { id: 1, Adresse: '12 rue X\n75000 Paris', AdresseWin: '12 rue Y\r\n75001 Paris', Nom: 'Dupont', Finale: 'Dupont\n', Trois: 'un\n\ntrois' };
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const br = n => '<br>'.repeat(n);
  const RETURNS = [0, 1, 2, 3];
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  const LINE_PT = () => ExportCommon.EDITOR_STYLE.bodyPt * ExportCommon.EDITOR_STYLE.lineHeight; // une ligne de corps : 10,5 pt x 1,42 = 14,91 pt
  const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');

  async function seed(h) {
    await h.resetEditor();
    GridEditor.setActive(false);
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Adresse: 'Text', AdresseWin: 'Text', Nom: 'Text', Finale: 'Text', Trois: 'Text' });
    stub.setRows(TABLE, [RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await sleep(100);
    await ExportEngines.ensure(['xlsx', 'odsExport']);
    await ExportCommon.ensureJsZipLoaded();
  }

  // Une grille de deux colonnes : `rows` = le HTML de la première case de chaque ligne ; la seconde porte « x ». Les hauteurs sont petites : c'est le contenu qui fait la ligne.
  function gridHtml(rows) {
    const widths = [220, 120];
    const row = html => `<tr data-row-height="20" style="height: 20px"><td colwidth="${widths[0]}">${html}</td><td colwidth="${widths[1]}"><p>x</p></td></tr>`;
    return `<table style="width: 340px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>${rows.map(row).join('')}</tbody></table>`;
  }
  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await sleep(250);
  }
  // Les quatre cases « A », « B<br> », « C<br><br> », « D<br><br><br> » en colonne, puis « Z » : la hauteur de chaque ligne dit combien de lignes la case montre.
  const GRID_TRAILING = gridHtml(RETURNS.map(n => `<p>${'ABCD'[n]}${br(n)}</p>`).concat(['<p>Z</p>']));
  const WANTED_TEXT = ['A', 'B\n', 'C\n\n', 'D\n\n\n'];

  // --- Lire un .xlsx, un .ods, un .docx ----------------------------------------------------------------------------------------------------------------------------------------------------
  async function openXlsx(blob) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const shared = zip.file('xl/sharedStrings.xml') ? Array.from(parseXml(await zip.file('xl/sharedStrings.xml').async('string')).getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')) : [];
    const sheet = parseXml(await zip.file('xl/worksheets/sheet1.xml').async('string'));
    const heights = new Map();
    Array.from(sheet.getElementsByTagName('row')).forEach(r => heights.set(Number(r.getAttribute('r')), r.hasAttribute('ht') ? Number(r.getAttribute('ht')) : null));
    const cells = new Map();
    Array.from(sheet.getElementsByTagName('c')).forEach(c => {
      const v = c.getElementsByTagName('v')[0];
      cells.set(c.getAttribute('r'), c.getAttribute('t') === 's' && v ? shared[Number(v.textContent)] : (v ? v.textContent : null));
    });
    const styles = parseXml(await zip.file('xl/styles.xml').async('string'));
    const wrapOf = ref => {
      const c = Array.from(sheet.getElementsByTagName('c')).find(el => el.getAttribute('r') === ref);
      const xf = c ? Array.from(styles.getElementsByTagName('cellXfs')[0].children)[Number(c.getAttribute('s') || 0)] : null;
      const al = xf ? Array.from(xf.children).find(el => el.localName === 'alignment') : null;
      return !!al && (al.getAttribute('wrapText') === '1' || al.getAttribute('wrapText') === 'true');
    };
    return { heights, cells, wrapOf, text: ref => cells.get(ref) };
  }
  async function xlsxOf(html, tableId, record) {
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, tableId || TABLE, record || RECORD, '');
    return openXlsx(blob);
  }
  async function odsCellLines(html, ref) {
    const made = await OdsExport.getOdsBlobForRecord(html, TABLE, RECORD, '');
    const zip = await JSZip.loadAsync(await made.blob.arrayBuffer());
    const content = parseXml(await zip.file('content.xml').async('string'));
    const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
    const rows = Array.from(content.getElementsByTagNameNS(TABLE_NS, 'table')[0].children).filter(el => el.localName === 'table-row');
    const cellAt = (r, c) => { const cells = Array.from(rows[r - 1].children).filter(el => /table-cell$/.test(el.localName)); return cells[c - 1] || null; };
    return ref.map(([r, c]) => { const cell = cellAt(r, c); return cell ? Array.from(cell.getElementsByTagNameNS(TEXT_NS, 'p')).map(p => p.textContent) : null; });
  }
  async function docxParagraphs(html) {
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, TABLE, RECORD, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const doc = parseXml(await zip.file('word/document.xml').async('string'));
    return Array.from(doc.getElementsByTagName('w:p')).map(p => {
      let text = '', breaks = 0, newlineInText = false;
      Array.from(p.getElementsByTagName('w:r')).forEach(r => Array.from(r.children).forEach(el => {
        if (el.tagName === 'w:t') { text += el.textContent; if (/[\r\n]/.test(el.textContent)) newlineInText = true; }
        else if (el.tagName === 'w:br') { text += '\n'; breaks += 1; }
      }));
      return { text, breaks, newlineInText };
    });
  }
  const pdfTextY = async (h, html) => {
    const result = await h.exportPdfContent(html, null);
    const truth = await h.extractPdfGroundTruth(result.base64);
    const y = new Map();
    truth.pages.forEach(page => page.textItems.forEach(item => { if (!y.has(item.str.trim())) y.set(item.str.trim(), item.y); }));
    return y;
  };

  // ============================== 092 · retours saisis en fin de case ou de paragraphe =============================================================================================
  cases.push({
    id: 'line_breaks_reader_trailing_returns_keep_their_lines',
    description: 'Lecture, 092 : n retours saisis en fin de paragraphe = n + 1 lignes (comme l\'éditeur), pas n ; dans un document comme dans une case de grille ; sans retour de fin, rien ne change',
    run: async (h) => {
      await seed(h);
      const doc = RETURNS.map(n => `<p>P${n}${br(n)}</p><p>fin${n}</p>`).join('');
      Editor.setHTML(doc);
      await sleep(150);
      const editorOf = id => Array.from(h.tiptap().querySelectorAll('p')).find(p => p.textContent.startsWith(id));
      const editorHeights = RETURNS.map(n => editorOf('P' + n).getBoundingClientRect().height);
      const reader = await h.renderReaderMode(doc, null);
      await sleep(150);
      const readerOf = id => Array.from(reader.querySelectorAll('p')).find(p => p.textContent.startsWith(id));
      const readerHeights = RETURNS.map(n => readerOf('P' + n).getBoundingClientRect().height);
      const line = parseFloat(getComputedStyle(readerOf('P0')).lineHeight);
      const lines = heights => heights.map(v => Math.round(v / heights[0] * 10) / 10);
      const docOk = RETURNS.every(n => near(editorHeights[n], editorHeights[0] * (n + 1), 2) && near(readerHeights[n], readerHeights[0] * (n + 1), 2));
      // Une grille : la hauteur de chaque ligne de grille grandit d'une ligne de texte par retour de fin.
      Editor.setHTML(GRID_TRAILING);
      GridEditor.setActive(true);
      await sleep(250);
      const gridReader = await h.renderReaderMode(Editor.getHTML(), null);
      await sleep(200);
      const rowHeights = Array.from(gridReader.querySelectorAll('tr')).slice(0, 4).map(tr => tr.getBoundingClientRect().height);
      const gridOk = RETURNS.every(n => near(rowHeights[n] - rowHeights[0], n * line, 2));
      GridEditor.setActive(false);
      return { pass: docOk && gridOk, notes: JSON.stringify({ editorLines: lines(editorHeights), readerLines: lines(readerHeights), readerHeights, line, rowHeights, docOk, gridOk }) };
    },
  });

  cases.push({
    id: 'line_breaks_reader_other_blocks_unchanged',
    description: 'Lecture, 092 : un paragraphe vide garde sa ligne (une seule), un retour au milieu d\'un texte ne s\'ajoute rien, un paragraphe sans retour de fin ne gagne pas de ligne',
    run: async (h) => {
      await seed(h);
      const html = '<p>un</p><p></p><p>deux<br>trois</p><p>quatre</p><p><strong>gras<br></strong></p><p>cinq</p>';
      const reader = await h.renderReaderMode(html, null);
      await sleep(150);
      const ps = Array.from(reader.querySelectorAll('p'));
      const line = parseFloat(getComputedStyle(ps[0]).lineHeight);
      const lines = ps.map(p => Math.round(p.getBoundingClientRect().height / line * 10) / 10);
      // un, vide, deux⏎trois, quatre, gras⏎(vide), cinq : 1, 1, 2, 1, 2, 1 lignes
      const expected = [1, 1, 2, 1, 2, 1];
      return { pass: JSON.stringify(lines) === JSON.stringify(expected), notes: JSON.stringify({ lines, expected }) };
    },
  });

  cases.push({
    id: 'line_breaks_excel_trailing_returns_keep_their_lines',
    description: 'Excel, 092 : « B<br> », « C<br><br> » et « D<br><br><br> » gardent leurs retours dans le texte de la case (« B\\n », « C\\n\\n », « D\\n\\n\\n ») et dans la hauteur de la ligne (une ligne de texte de plus par retour) ; « A » sans retour ne change pas',
    run: async (h) => {
      await seed(h);
      const x = await xlsxOf(GRID_TRAILING);
      const texts = RETURNS.map(n => x.text('A' + (n + 1)));
      const heights = RETURNS.map(n => x.heights.get(n + 1));
      const heightsOk = RETURNS.every(n => heights[n] !== null && near(heights[n] - heights[0], n * LINE_PT(), 1.2));
      const textOk = JSON.stringify(texts) === JSON.stringify(WANTED_TEXT);
      return { pass: textOk && heightsOk && x.wrapOf('A2'), notes: JSON.stringify({ texts, heights, line: LINE_PT(), wrap: x.wrapOf('A2') }) };
    },
  });

  cases.push({
    id: 'line_breaks_excel_other_blocks_unchanged',
    description: 'Excel, 092 : un retour au milieu d\'un texte, un paragraphe vide au milieu, des paragraphes vides à la fin (retirés comme avant) et un retour en fin de plusieurs paragraphes d\'une même case se lisent comme avant',
    run: async (h) => {
      await seed(h);
      const cell = html => `<td><p>${html}</p></td>`;
      const html = `<table><tbody>`
        + `<tr>${cell('a<br>b')}<td><p>x</p></td></tr>`                                   // A1 : « a\nb »
        + `<tr><td><p>c</p><p></p><p>d</p></td><td><p>x</p></td></tr>`                    // A2 : « c\n\nd » (la ligne vide du milieu reste)
        + `<tr><td><p>e</p><p></p><p></p></td><td><p>x</p></td></tr>`                     // A3 : « e » (les lignes vides de la fin sont retirées)
        + `<tr><td><p>f<br></p><p>g<br></p></td><td><p>x</p></td></tr>`                  // A4 : « f\n\ng\n » (chaque retour de fin garde sa ligne, aussi dans le premier paragraphe)
        + `</tbody></table>`;
      const x = await xlsxOf(html);
      const got = [1, 2, 3, 4].map(r => x.text('A' + r));
      const expected = ['a\nb', 'c\n\nd', 'e', 'f\n\ng\n'];
      return { pass: JSON.stringify(got) === JSON.stringify(expected), notes: JSON.stringify({ got, expected }) };
    },
  });

  cases.push({
    id: 'line_breaks_ods_trailing_returns_keep_their_lines',
    description: 'ODS, 092 : les retours de fin d\'une case gardent leurs lignes (un paragraphe de texte par ligne : « B » puis une ligne vide...), comme l\'Excel dont il hérite',
    run: async (h) => {
      await seed(h);
      const lines = await odsCellLines(GRID_TRAILING, RETURNS.map(n => [n + 1, 1]));
      const expected = [['A'], ['B', ''], ['C', '', ''], ['D', '', '', '']];
      return { pass: JSON.stringify(lines) === JSON.stringify(expected), notes: JSON.stringify({ lines, expected }) };
    },
  });

  cases.push({
    id: 'line_breaks_pdf_grid_trailing_returns_keep_their_lines',
    description: 'PDF (grille), 092 : chaque retour saisi en fin de case ajoute une ligne de texte à la hauteur de la ligne de la grille ; la case sans retour garde sa hauteur',
    run: async (h) => {
      await seed(h);
      const grid = gridHtml(RETURNS.map(n => `<p>G${n}${br(n)}</p>`).concat(['<p>ZZ</p>']));
      await loadGrid(grid);
      const y = await pdfTextY(h, Editor.getHTML());
      GridEditor.setActive(false);
      const rowHeights = RETURNS.map(n => y.get(n === 3 ? 'ZZ' : 'G' + (n + 1)) - y.get('G' + n));
      const ok = RETURNS.every(n => Number.isFinite(rowHeights[n]) && near(rowHeights[n] - rowHeights[0], n * LINE_PT(), 1.5));
      return { pass: ok, notes: JSON.stringify({ rowHeights, line: LINE_PT() }) };
    },
  });

  cases.push({
    id: 'line_breaks_pdf_document_trailing_returns_keep_their_lines',
    description: 'PDF (document), 092 : n retours saisis en fin de paragraphe laissent n lignes vides avant le paragraphe suivant (le PDF les écrivait sans aucune) ; sans retour, le même écart qu\'avant',
    run: async (h) => {
      await seed(h);
      const doc = RETURNS.map(n => `<p>P${n}${br(n)}</p><p>M${n}</p>`).join('');
      const y = await pdfTextY(h, doc);
      const gaps = RETURNS.map(n => y.get('M' + n) - y.get('P' + n));
      const ok = RETURNS.every(n => Number.isFinite(gaps[n]) && near(gaps[n] - gaps[0], n * LINE_PT(), 1.5));
      return { pass: ok, notes: JSON.stringify({ gaps, line: LINE_PT() }) };
    },
  });

  cases.push({
    id: 'line_breaks_pdf_list_item_ending_with_an_empty_paragraph_unchanged',
    description: 'PDF, 092 : le retour qui SÉPARE deux blocs n\'est pas un retour saisi : un élément de liste dont le dernier paragraphe est vide ne gagne pas de ligne ; un titre et une citation qui finissent par un retour en gagnent une',
    run: async (h) => {
      await seed(h);
      const gap = async (html, from, to) => { const y = await pdfTextY(h, html); return y.get(to) - y.get(from); };
      const plain = await gap('<ul><li><p>L1</p></li></ul><p>M1</p>', 'L1', 'M1');
      const withEmpty = await gap('<ul><li><p>L2</p><p></p></li></ul><p>M2</p>', 'L2', 'M2');
      const heading = await gap('<h2>T0</h2><p>M3</p>', 'T0', 'M3');
      const headingReturn = await gap('<h2>T1<br></h2><p>M4</p>', 'T1', 'M4');
      const quote = await gap('<blockquote><p>Q0</p></blockquote><p>M5</p>', 'Q0', 'M5');
      const quoteReturn = await gap('<blockquote><p>Q1<br></p></blockquote><p>M6</p>', 'Q1', 'M6');
      const pass = near(withEmpty, plain, 0.6) && headingReturn - heading > 20 && quoteReturn - quote > 12;
      return { pass, notes: JSON.stringify({ plain, withEmpty, heading, headingReturn, quote, quoteReturn }) };
    },
  });

  cases.push({
    id: 'line_breaks_word_trailing_returns_unchanged',
    description: 'Word, 092 : rien à changer - n retours de fin écrivent n `w:br` (le fichier montre déjà n + 1 lignes comme l\'éditeur) ; un retour au milieu et un paragraphe vide aussi comme avant',
    run: async (h) => {
      await seed(h);
      const html = RETURNS.map(n => `<p>W${n}${br(n)}</p>`).join('') + '<p>m<br>n</p>';
      const paragraphs = await docxParagraphs(html);
      const breaks = paragraphs.map(p => p.breaks);
      return { pass: JSON.stringify(breaks.slice(0, 5)) === JSON.stringify([0, 1, 2, 3, 1]), notes: JSON.stringify({ breaks, paragraphs }) };
    },
  });

  // ============================== 091 · valeur à plusieurs lignes ==================================================================================================================================
  const valueRow = html => `<tr><td>${html}</td><td><p>x</p></td></tr>`;
  const VALUE_ROWS = [
    valueRow(`<p>${badge('Adresse')}</p>`),               // A1 : « 12 rue X\n75000 Paris »
    valueRow(`<p>${badge('AdresseWin')}</p>`),            // A2 : « 12 rue Y\r\n75001 Paris » -> « 12 rue Y\n75001 Paris »
    valueRow(`<p>${badge('Finale')}</p>`),                // A3 : « Dupont\n » : le retour final n'ouvre pas de ligne
    valueRow(`<p>${badge('Trois')}</p>`),                 // A4 : « un\n\ntrois » : la ligne vide du milieu reste
    valueRow(`<p>Adresse :<br>${badge('Nom')}</p>`),      // A5 : « Adresse :\nDupont » : le retour saisi reste comme avant
  ];
  const VALUE_WANTED = ['12 rue X\n75000 Paris', '12 rue Y\n75001 Paris', 'Dupont', 'un\n\ntrois', 'Adresse :\nDupont'];
  const gridOf = rows => `<table><tbody>${rows.join('')}</tbody></table>`;
  // A6 (Excel, ODS) : un blanc entre deux blocs n'est pas du texte, il n'ajoute pas de ligne : « Dupont\nfin »
  const BETWEEN_BLOCKS = valueRow(`<p>${badge('Nom')}</p>\n<p>fin</p>`);

  cases.push({
    id: 'line_breaks_excel_value_with_several_lines_keeps_its_lines',
    description: 'Excel, 091 : une valeur de colonne Texte à plusieurs lignes (`\\n` comme `\\r\\n`) garde ses lignes dans la case (wrapText) ; le retour final d\'une valeur et le blanc entre deux blocs n\'ajoutent pas de ligne ; un retour saisi reste comme avant',
    run: async (h) => {
      await seed(h);
      const x = await xlsxOf(gridOf(VALUE_ROWS.concat([BETWEEN_BLOCKS])));
      const wanted = VALUE_WANTED.concat(['Dupont\nfin']);
      const got = wanted.map((_, i) => x.text('A' + (i + 1)));
      return { pass: JSON.stringify(got) === JSON.stringify(wanted) && x.wrapOf('A1'), notes: JSON.stringify({ got, wanted, wrap: x.wrapOf('A1') }) };
    },
  });

  cases.push({
    id: 'line_breaks_ods_value_with_several_lines_keeps_its_lines',
    description: 'ODS, 091 : la valeur à plusieurs lignes garde ses lignes (un paragraphe de texte par ligne), comme l\'Excel dont l\'export hérite',
    run: async (h) => {
      await seed(h);
      const wanted = VALUE_WANTED.concat(['Dupont\nfin']);
      const lines = await odsCellLines(gridOf(VALUE_ROWS.concat([BETWEEN_BLOCKS])), wanted.map((_, i) => [i + 1, 1]));
      const expected = wanted.map(text => text.split('\n'));
      return { pass: JSON.stringify(lines) === JSON.stringify(expected), notes: JSON.stringify({ lines, expected }) };
    },
  });

  cases.push({
    id: 'line_breaks_word_value_with_several_lines_keeps_its_lines',
    description: 'Word, 091 : la valeur à plusieurs lignes s\'écrit en séries de texte séparées par `w:br` (jamais un `\\n` dans `w:t`, que Word lit comme une espace), dans un document comme dans une case de grille ; un retour saisi reste un `w:br` ; le blanc entre deux blocs n\'en ajoute pas',
    run: async (h) => {
      await seed(h);
      const grid = await docxParagraphs(gridOf(VALUE_ROWS));
      // (Word écrit toujours un paragraphe vide derrière un tableau : il n'est pas une case.)
      const cells = grid.filter(p => p.text !== 'x' && p.text !== '').map(p => p.text);
      const doc = await docxParagraphs(`<p>${badge('Adresse')}</p><p>${badge('AdresseWin')}</p><p>Ligne : ${badge('Trois')}</p>`);
      const docTexts = doc.map(p => p.text);
      // Le blanc entre deux blocs d'une citation ne devient pas une ligne de plus : « un\ndeux » (le retour entre deux paragraphes d'une citation est celui d'avant)
      const quote = await docxParagraphs('<blockquote><p>un</p>\n<p>deux</p></blockquote>');
      const quoteTexts = quote.map(p => p.text);
      const noNewlineInText = grid.concat(doc, quote).every(p => !p.newlineInText);
      const gridOk = JSON.stringify(cells) === JSON.stringify(VALUE_WANTED);
      const docOk = JSON.stringify(docTexts) === JSON.stringify(['12 rue X\n75000 Paris', '12 rue Y\n75001 Paris', 'Ligne : un\n\ntrois']);
      const quoteOk = JSON.stringify(quoteTexts) === JSON.stringify(['un\ndeux']);
      return { pass: gridOk && docOk && quoteOk && noNewlineInText, notes: JSON.stringify({ cells, docTexts, quoteTexts, noNewlineInText }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.lineBreaks = cases;
})();
