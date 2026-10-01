// Suite "xlsx" - export Excel d'une grille (js/xlsx-export.js, planning/feature-mode-grille-excel.md, lot D : un enregistrement -> un classeur d'une feuille).
//
// Même principe que les suites docx : on DÉZIPPE le .xlsx produit et on lit son OOXML réel (xl/worksheets/sheet1.xml, sharedStrings.xml, styles.xml, drawings), jamais les
// objets ExcelJS d'entrée - un objet correct en mémoire ne prouve rien sur le fichier qu'Excel ouvrira. Le fichier a aussi été relu par openpyxl hors de cette suite (une
// fois, à l'écriture du lot) ; LibreOffice n'est pas utilisable dans ce bac à sable (pas de module Calc).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.05 : tolerance);
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // --- Lecture d'un .xlsx --------------------------------------------------------------------------------------------------------------------------------------------
  const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');
  const childrenNamed = (el, name) => Array.from(el.children).filter(c => c.localName === name);
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const colIndexOf = letters => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const splitRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: colIndexOf(m[1]), row: Number(m[2]) }; };

  const colorOf = el => (el ? (el.getAttribute('rgb') || el.getAttribute('argb')) : null);
  const BUILTIN_FORMATS = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%' };
  function fontOf(el) {
    if (!el) return null;
    const has = name => childrenNamed(el, name).some(c => c.getAttribute('val') !== '0' && c.getAttribute('val') !== 'false');
    const one = name => childrenNamed(el, name)[0];
    return {
      bold: has('b'), italic: has('i'), underline: !!one('u'), strike: has('strike'),
      size: one('sz') ? Number(attr(one('sz'), 'val')) : null,
      name: one('rFont') ? attr(one('rFont'), 'val') : (one('name') ? attr(one('name'), 'val') : null),
      color: one('color') ? colorOf(one('color')) : null,
      vertAlign: one('vertAlign') ? attr(one('vertAlign'), 'val') : null,
    };
  }

  // Le contenu du classeur : feuilles (nom, cellules, colonnes, lignes, fusions, mise en page), styles résolus (format, police, fond, bordure, alignement), chaînes
  // partagées (avec leurs passages de texte riche), dessins.
  async function openXlsx(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = async name => (zip.file(name) ? zip.file(name).async('string') : null);
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    const workbook = parseXml(await text('xl/workbook.xml'));
    const wbRels = parseXml(await text('xl/_rels/workbook.xml.rels'));
    const targetOf = id => { const rel = Array.from(wbRels.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === id); return rel ? 'xl/' + rel.getAttribute('Target').replace(/^\//, '').replace(/^xl\//, '') : null; };

    // chaînes partagées
    const shared = [];
    const sst = await text('xl/sharedStrings.xml');
    if (sst) {
      Array.from(parseXml(sst).getElementsByTagName('si')).forEach(si => {
        const runEls = childrenNamed(si, 'r');
        const plain = childrenNamed(si, 't')[0];
        const runs = runEls.map(r => ({ text: (childrenNamed(r, 't')[0] || { textContent: '' }).textContent, font: fontOf(childrenNamed(r, 'rPr')[0]) }));
        shared.push({ text: runEls.length ? runs.map(r => r.text).join('') : (plain ? plain.textContent : ''), runs: runEls.length ? runs : null });
      });
    }
    // styles
    const styles = parseXml(await text('xl/styles.xml'));
    const numFmts = {};
    Array.from(styles.getElementsByTagName('numFmt')).forEach(n => { numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    const fonts = childrenNamed(styles.getElementsByTagName('fonts')[0], 'font').map(fontOf);
    const fills = childrenNamed(styles.getElementsByTagName('fills')[0], 'fill').map(f => {
      const pattern = f.getElementsByTagName('patternFill')[0];
      const fg = f.getElementsByTagName('fgColor')[0];
      return pattern && attr(pattern, 'patternType') === 'solid' ? { argb: colorOf(fg) } : null;
    });
    const borders = childrenNamed(styles.getElementsByTagName('borders')[0], 'border').map(b => {
      const side = n => { const el = childrenNamed(b, n)[0]; return el && el.getAttribute('style') ? { style: el.getAttribute('style'), color: colorOf(el.getElementsByTagName('color')[0]) } : null; };
      return { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
    });
    const xfs = childrenNamed(styles.getElementsByTagName('cellXfs')[0], 'xf').map(xf => {
      const al = childrenNamed(xf, 'alignment')[0];
      const numFmtId = xf.getAttribute('numFmtId');
      return {
        numFmt: numFmtId === '0' ? 'General' : (numFmts[numFmtId] || BUILTIN_FORMATS[numFmtId] || 'builtin:' + numFmtId),
        font: fonts[Number(xf.getAttribute('fontId'))], fill: fills[Number(xf.getAttribute('fillId'))], border: borders[Number(xf.getAttribute('borderId'))],
        horizontal: attr(al, 'horizontal'), vertical: attr(al, 'vertical'), wrap: attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true',
      };
    });

    const sheets = [];
    for (const sheetEl of Array.from(workbook.getElementsByTagName('sheet'))) {
      const path = targetOf(sheetEl.getAttribute('r:id'));
      const xml = await text(path);
      const doc = parseXml(xml);
      const relsPath = path.replace('worksheets/', 'worksheets/_rels/') + '.rels';
      const relsXml = await text(relsPath);
      const rels = relsXml ? Array.from(parseXml(relsXml).getElementsByTagName('Relationship')).map(r => ({ id: r.getAttribute('Id'), type: r.getAttribute('Type'), target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') })) : [];
      const cells = new Map();
      const rows = new Map();
      Array.from(doc.getElementsByTagName('row')).forEach(rowEl => {
        rows.set(Number(rowEl.getAttribute('r')), { height: rowEl.getAttribute('ht') === null ? null : Number(rowEl.getAttribute('ht')), custom: rowEl.getAttribute('customHeight') === '1' });
        Array.from(rowEl.getElementsByTagName('c')).forEach(c => {
          const ref = c.getAttribute('r');
          const t = c.getAttribute('t');
          const v = childrenNamed(c, 'v')[0];
          const style = xfs[Number(c.getAttribute('s') || 0)] || {};
          let value = null; let rich = null;
          if (t === 's' && v) { const s = shared[Number(v.textContent)]; value = s.text; rich = s.runs; }
          else if (t === 'inlineStr') value = c.textContent;
          else if (v) value = t === 'str' || t === 'b' || t === 'e' ? v.textContent : Number(v.textContent);
          cells.set(ref, { ref, kind: value === null ? 'empty' : (typeof value === 'number' ? 'number' : 'text'), value, rich, hasFormula: childrenNamed(c, 'f').length > 0, style });
        });
      });
      const cols = Array.from(doc.getElementsByTagName('col')).map(c => ({ min: Number(c.getAttribute('min')), max: Number(c.getAttribute('max')), width: Number(c.getAttribute('width')) }));
      const merges = Array.from(doc.getElementsByTagName('mergeCell')).map(m => m.getAttribute('ref'));
      const pageSetup = doc.getElementsByTagName('pageSetup')[0];
      const margins = doc.getElementsByTagName('pageMargins')[0];
      const fitToPage = doc.getElementsByTagName('pageSetUpPr')[0];
      const view = doc.getElementsByTagName('sheetView')[0];
      const hyperlinks = Array.from(doc.getElementsByTagName('hyperlink')).map(hl => ({ ref: hl.getAttribute('ref'), target: (rels.find(r => r.id === hl.getAttribute('r:id')) || {}).target || null }));
      const drawingRel = doc.getElementsByTagName('drawing')[0];
      const drawingPath = drawingRel ? 'xl/drawings/' + (rels.find(r => r.id === drawingRel.getAttribute('r:id')).target.split('/').pop()) : null;
      const anchors = [];
      if (drawingPath) {
        const dxml = parseXml(await text(drawingPath));
        Array.from(dxml.getElementsByTagName('*')).filter(e => /^(oneCellAnchor|twoCellAnchor)$/.test(e.localName)).forEach(a => {
          const from = a.getElementsByTagName('xdr:from')[0] || Array.from(a.children).find(c => c.localName === 'from');
          const ext = Array.from(a.getElementsByTagName('*')).find(e => e.localName === 'ext');
          const num = (el, name) => Number(((Array.from(el.children).find(c => c.localName === name) || {}).textContent) || 0);
          anchors.push({ col: num(from, 'col'), row: num(from, 'row'), widthPx: ext ? Number(ext.getAttribute('cx')) / 9525 : null, heightPx: ext ? Number(ext.getAttribute('cy')) / 9525 : null });
        });
      }
      sheets.push({
        name: sheetEl.getAttribute('name'), xml, cols, rows, cells, merges, hyperlinks, anchors,
        gridLines: attr(view, 'showGridLines') !== '0',
        pageSetup: pageSetup ? { paperSize: attr(pageSetup, 'paperSize'), orientation: attr(pageSetup, 'orientation'), fitToWidth: attr(pageSetup, 'fitToWidth'), fitToHeight: attr(pageSetup, 'fitToHeight') } : null,
        fitToPage: !!fitToPage && attr(fitToPage, 'fitToPage') === '1',
        margins: margins ? { left: Number(attr(margins, 'left')), right: Number(attr(margins, 'right')), top: Number(attr(margins, 'top')), bottom: Number(attr(margins, 'bottom')) } : null,
        cell: ref => cells.get(ref) || { ref, kind: 'empty', value: null, style: {} },
        colWidth: n => { const c = cols.find(col => col.min <= n && n <= col.max); return c ? c.width : null; },
        rowHeight: r => (rows.get(r) || {}).height,
        text: () => Array.from(cells.values()).map(c => (c.value === null ? '' : String(c.value))).join('|'),
      });
    }
    return { zip, names, sheets, sheet: sheets[0], creator: ((parseXml((await text('docProps/core.xml')) || '<x/>').getElementsByTagName('dc:creator')[0]) || {}).textContent || null };
  }
  // Numéro de série Excel d'un jour (1900, sans le jour fantôme du 29 février 1900 : valable dès le 1er mars 1900).
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

  // --- Jeu d'essai ---------------------------------------------------------------------------------------------------------------------------------------------------
  const TABLE = 'GrilleExcel';
  const RECORD = { id: 1, Nom: 'Alpha Durand', Montant: 1234.5, Quantite: 12, Date: Date.UTC(2026, 8, 12) / 1000, Zero: 0, Gros: 1234567890123456, Ancienne: Date.UTC(1850, 0, 1) / 1000, Mots: 'Mots' };
  const badge = (col, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${col}" data-key="${TABLE}.${col}"${extra || ''}></span>`;
  const withFormat = format => ` data-format='${JSON.stringify(format)}'`;
  const withCondition = condition => ` data-condition="${JSON.stringify(condition).replace(/"/g, '&quot;')}"`;
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Montant: 'Numeric', Quantite: 'Int', Date: 'Date', Zero: 'Numeric', Gros: 'Int', Ancienne: 'Date', Mots: 'Text' });
    stub.setRows(TABLE, [RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await sleep(100);
  }
  // Une grille aux dimensions connues : `rows` = le HTML de chaque ligne de cases (des <td> déjà écrits ou du texte), chargée comme un modèle enregistré.
  const td = (html, attrs) => `<td${attrs || ''}><p>${html}</p></td>`;
  function gridHtml(widths, heights, rows) {
    const total = widths.reduce((sum, w) => sum + w, 0);
    let k = 0;
    const fix = cell => (cell.startsWith('<td') ? cell.replace('<td', `<td colwidth="${widths[k++ % widths.length]}"`) : `<td colwidth="${widths[k++ % widths.length]}"><p>${cell}</p></td>`);
    return `<table style="width: ${total}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
      + rows.map((row, r) => { k = 0; return `<tr data-row-height="${heights[r]}" style="height: ${heights[r]}px">${row.map(fix).join('')}</tr>`; }).join('') + '</tbody></table>';
  }
  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await sleep(250);
  }
  // Charge la grille, l'enregistre comme le modèle le serait (Editor.getHTML), l'exporte et ouvre le fichier.
  async function exportGrid(widths, heights, rows, options) {
    const o = options || {};
    await loadGrid(gridHtml(widths, heights, rows));
    const { blob, filename } = await XlsxExport.getXlsxBlobForRecord(Editor.getHTML(), o.tableId || TABLE, o.record || RECORD, o.template || '', o.options);
    return Object.assign(await openXlsx(blob), { filename, blob });
  }
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  // --- 1) La feuille reprend les colonnes, les lignes et les textes de la grille --------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_grid_becomes_one_sheet_with_the_same_columns_rows_and_text',
    description: 'Une grille devient une feuille : largeur des colonnes ((px − 5) / 7 caractères), hauteur des lignes (px × 0,75 pt, plus haute si le texte passe à la ligne), un texte par case, sans quadrillage Excel ; classeur au nom du produit',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([120, 90, 160], [40, 30, 200, 20], [
        ['Nom', 'Montant', 'Remarque'],
        [badge('Nom'), 'deux', 'trois'],
        ['milieu', '', ''],
        ['Un texte assez long pour passer sur plusieurs lignes dans cette case étroite et la rendre plus haute', '', ''],
      ]);
      const s = x.sheet;
      const widths = [1, 2, 3].map(n => s.colWidth(n));
      const heights = [1, 2, 3, 4].map(r => s.rowHeight(r));
      const expectedWidths = [120, 90, 160].map(px => (px - 5) / 7);
      const bad = [];
      if (x.sheets.length !== 1) bad.push('feuilles=' + x.sheets.length);
      if (!widths.every((w, i) => near(w, expectedWidths[i], 0.01))) bad.push('largeurs=' + widths.map(w => w && w.toFixed(2)) + ' (attendu ' + expectedWidths.map(w => w.toFixed(2)) + ')');
      // 40, 30 et 200 px = 30, 22,5 et 150 pt ; la dernière ligne (20 px demandés) grandit pour son texte sur plusieurs lignes.
      if (!near(heights[0], 30, 0.3) || !near(heights[1], 22.5, 0.3) || !near(heights[2], 150, 0.3) || !(heights[3] > 60)) bad.push('hauteurs=' + heights);
      if (s.cell('A1').value !== 'Nom' || s.cell('C1').value !== 'Remarque' || s.cell('A2').value !== 'Alpha Durand' || s.cell('B2').value !== 'deux') bad.push('textes=' + s.text());
      if (!s.cell('A4').value.startsWith('Un texte assez long')) bad.push('A4=' + s.cell('A4').value);
      if (s.gridLines) bad.push('quadrillage Excel gardé');
      if (x.creator !== 'Grist Factory') bad.push('créateur=' + x.creator);
      if (!s.cell('A1').style.wrap) bad.push('retour à la ligne absent');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ widths, heights, name: s.name }) };
    },
  });

  // --- 2) Vrais nombres et vraies dates, seulement quand la case ne contient que cela ---------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_only_a_cell_holding_just_a_number_or_a_date_is_a_real_value',
    description: 'Une case qui ne contient qu\'une bulle nombre ou date est un vrai nombre / une vraie date, au format d\'affichage de la bulle ; avec du texte autour, deux bulles, un nombre en lettres, une date amputée, un zéro masqué, un nombre de plus de 15 chiffres, une date avant 1900 ou une condition fausse, c\'est du texte (ou rien)',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([100, 100, 100, 100], [30, 30, 30, 30, 30, 30], [
        [badge('Montant'), badge('Quantite'), badge('Date'), badge('Montant', withFormat({ type: 'number', decimals: 2, currency: '€' }))],
        ['Total : ' + badge('Montant'), badge('Montant') + ' ' + badge('Quantite'), badge('Montant', withFormat({ type: 'number', words: true })), badge('Date', withFormat({ type: 'date', preset: 'dmy_slash_full', day: false }))],
        [badge('Zero'), badge('Gros'), badge('Ancienne'), badge('Montant', withCondition({ mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'personne' }] }))],
        [badge('Date', withFormat({ type: 'date', preset: 'd_mmmm_yyyy' })), badge('Montant', withFormat({ type: 'number', style: 'none', decimals: 1 })), badge('Montant', withFormat({ type: 'number', style: 'us', currency: '$' })), badge('Nom')],
        [badge('Date', withFormat({ type: 'date', preset: 'iso' })), badge('Date', withFormat({ type: 'date', preset: 'dddd_d_mmmm_yyyy' })), badge('Quantite', withFormat({ type: 'number', decimals: 2 })), badge('Zero', withFormat({ type: 'number', zero: 'show' }))],
        [badge('Montant', withCondition({ mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Alpha Durand' }] })), '', '', ''],
      ]);
      const s = x.sheet;
      const c = ref => s.cell(ref);
      const bad = [];
      const expect = (ref, kind, value, fmt) => {
        const cell = c(ref);
        if (cell.kind !== kind) bad.push(ref + ' type=' + cell.kind + ' (attendu ' + kind + ', valeur ' + JSON.stringify(cell.value) + ')');
        else if (value !== undefined && cell.value !== value) bad.push(ref + ' valeur=' + JSON.stringify(cell.value) + ' (attendu ' + JSON.stringify(value) + ')');
        if (fmt !== undefined && cell.style.numFmt !== fmt) bad.push(ref + ' format=' + cell.style.numFmt + ' (attendu ' + fmt + ')');
      };
      expect('A1', 'number', 1234.5, '#,##0.###');
      expect('B1', 'number', 12, '#,##0');
      expect('C1', 'number', serial(2026, 9, 12), 'dd/mm/yyyy');
      expect('D1', 'number', 1234.5, '#,##0.00 "€"');
      expect('A2', 'text'); if (!/^Total : /.test(String(c('A2').value))) bad.push('A2=' + c('A2').value);
      expect('B2', 'text'); expect('C2', 'text'); expect('D2', 'text');
      if (!/mille/.test(String(c('C2').value))) bad.push('C2 (en lettres)=' + c('C2').value);
      expect('A3', 'empty'); // zéro masqué par défaut : la case est vide, comme en Lecture et dans le PDF
      expect('B3', 'text'); // 1 234 567 890 123 456 : plus de 15 chiffres
      expect('C3', 'text'); // 1850
      expect('D3', 'empty'); // condition fausse : la bulle disparaît
      expect('A4', 'number', serial(2026, 9, 12), 'd mmmm yyyy');
      expect('B4', 'number', 1234.5, '0.0');
      expect('C4', 'number', 1234.5, '"$"#,##0.###');
      expect('D4', 'text', 'Alpha Durand');
      expect('A5', 'number', serial(2026, 9, 12), 'yyyy-mm-dd');
      expect('B5', 'number', serial(2026, 9, 12), 'dddd d mmmm yyyy');
      expect('C5', 'number', 12, '#,##0.00');
      expect('D5', 'number', 0, '#,##0'); // « Afficher le zéro » : le 0 est un vrai nombre
      expect('A6', 'number', 1234.5, '#,##0.###'); // condition vraie : la bulle reste, et reste un nombre
      // Les cellules à nombre se lisent à gauche, comme dans la grille et le PDF.
      if (c('A1').style.horizontal !== 'left' || c('C1').style.horizontal !== 'left') bad.push('alignement des nombres=' + c('A1').style.horizontal);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_number_and_date_formats_follow_the_interface_language',
    description: 'En interface anglaise, le format d\'une date par défaut est mm/dd/yyyy, celui d\'une date « 12 sept. 2026 » est « mmm d, yyyy », et la devise d\'un nombre à l\'américaine passe devant ; en français, jour avant mois et devise après',
    run: async (h) => {
      await seed(h);
      const html = [[badge('Date'), badge('Date', withFormat({ type: 'date', preset: 'd_mmm_yyyy' })), badge('Montant', withFormat({ type: 'number', decimals: 2, currency: '€' }))]];
      const fr = await inLang('fr', () => exportGrid([100, 100, 100], [30], html));
      const en = await inLang('en', () => exportGrid([100, 100, 100], [30], html));
      const f = ref => fr.sheet.cell(ref).style.numFmt; const e = ref => en.sheet.cell(ref).style.numFmt;
      const pass = f('A1') === 'dd/mm/yyyy' && f('B1') === 'd mmm yyyy' && f('C1') === '#,##0.00 "€"'
        && e('A1') === 'mm/dd/yyyy' && e('B1') === 'mmm d, yyyy' && e('C1') === '"€"#,##0.00';
      return { pass, notes: JSON.stringify({ fr: [f('A1'), f('B1'), f('C1')], en: [e('A1'), e('B1'), e('C1')] }) };
    },
  });

  // --- 3) Mise en forme : texte riche, couleurs, fond, alignements ---------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_text_formats_colors_alignment_and_fill_follow_the_cell',
    description: 'Gras, italique, souligné, barré, couleur, taille et police de passages de texte deviennent du texte riche de la case (ou la police de toute la case si tout est pareil) ; le fond posé sur la case, l\'alignement vertical (haut / milieu / bas) et horizontal sont repris ; un titre est en gras à sa taille',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([200, 100, 100, 100], [40, 30, 30, 30], [
        [td('<strong>Gras</strong> puis <em>italique</em> et <u>souligné</u> <s>barré</s> <span style="color: #ff0000">rouge</span> <span style="font-size: 20px">grand</span>'), td('<strong>tout gras</strong>', ' data-valign="top"'), td('fond', ' style="background-color: #ffff00"'), td('bas', ' data-valign="bottom"')],
        ['<td><p style="text-align: center">centré</p></td>', '<td><p style="text-align: right">droite</p></td>', '<td><h2>Titre</h2></td>', 'vide'],
        [td('<span style="font-family: Georgia, serif">Georgia</span>'), td('<span style="font-family: monospace">mono</span>'), '', ''],
        [td('<span style="background-color: #00ff00">surligné</span> tout'), td('<span style="background-color: #00ff00">tout surligné</span>'), '', ''],
      ]);
      const s = x.sheet; const c = ref => s.cell(ref);
      const bad = [];
      const runs = c('A1').rich || [];
      const run = t => runs.find(r => r.text.trim() === t) || { font: {} };
      if (!runs.length) bad.push('A1 sans texte riche');
      if (!run('Gras').font.bold) bad.push('gras');
      if (!run('italique').font.italic) bad.push('italique');
      if (!run('souligné').font.underline) bad.push('souligné');
      if (!run('barré').font.strike) bad.push('barré');
      if (run('rouge').font.color !== 'FFFF0000') bad.push('couleur=' + run('rouge').font.color);
      if (run('grand').font.size !== 15) bad.push('taille=' + run('grand').font.size + ' (20px = 15pt)');
      if (run('puis').font.bold || run('puis').font.italic) bad.push('« puis » ne devrait avoir aucun format');
      // Tout gras dans la case : la police de la case, pas du texte riche.
      if (c('B1').rich || !c('B1').style.font.bold || c('B1').value !== 'tout gras') bad.push('B1 tout gras: ' + JSON.stringify({ rich: !!c('B1').rich, bold: c('B1').style.font.bold }));
      if (!c('C1').style.fill || c('C1').style.fill.argb !== 'FFFFFF00') bad.push('fond=' + JSON.stringify(c('C1').style.fill));
      if (c('A2').style.fill) bad.push('A2 a un fond sans en avoir');
      if (c('B1').style.vertical !== 'top' || c('D1').style.vertical !== 'bottom' || c('A1').style.vertical !== 'center') bad.push('vertical=' + [c('B1').style.vertical, c('D1').style.vertical, c('A1').style.vertical]);
      if (c('A2').style.horizontal !== 'center' || c('B2').style.horizontal !== 'right') bad.push('horizontal=' + [c('A2').style.horizontal, c('B2').style.horizontal]);
      if (!c('C2').style.font.bold || c('C2').style.font.size !== 20) bad.push('titre=' + JSON.stringify(c('C2').style.font) + ' (gras, 20 pt)');
      if (c('A3').style.font.name !== 'Georgia' || !/Courier/.test(c('B3').style.font.name || '')) bad.push('polices=' + [c('A3').style.font.name, c('B3').style.font.name]);
      // Un surlignage de toute la case devient son fond ; sur une partie du texte, Excel ne sait pas le dessiner.
      if (c('B4').style.fill ? c('B4').style.fill.argb !== 'FF00FF00' : true) bad.push('B4 surligné en entier sans fond=' + JSON.stringify(c('B4').style.fill));
      if (c('A4').style.fill) bad.push('A4 partiellement surligné : pas de fond attendu');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_colors_come_only_from_what_the_person_set',
    description: 'Les couleurs du fichier viennent de ce que la personne a posé (couleur du texte, fond de case) et d\'un filet gris fixe : une case sans format n\'a ni couleur de texte ni fond, thème sombre réglé compris (jamais de blanc sur blanc ni de case noire). Le garde-fou de fond est dans codeHygiene : aucune lecture du style calculé',
    run: async (h) => {
      await seed(h);
      const root = document.documentElement;
      const before = root.getAttribute('data-theme');
      root.setAttribute('data-theme', 'dark');
      await sleep(100);
      let x;
      try { x = await exportGrid([120, 120], [30, 30], [['Texte', td('<span style="color: #ff0000">rouge</span>', ' style="background-color: #ffff00"')], ['bas', 'x']]); }
      finally { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); }
      const c = ref => x.sheet.cell(ref);
      const bad = [];
      if (c('A1').style.font.color) bad.push('A1 couleur de texte=' + c('A1').style.font.color);
      if (c('A1').style.fill || c('A2').style.fill || c('B2').style.fill) bad.push('fond lu du thème=' + JSON.stringify([c('A1').style.fill, c('A2').style.fill, c('B2').style.fill]));
      if (!c('B1').style.fill || c('B1').style.fill.argb !== 'FFFFFF00') bad.push('B1 fond posé perdu=' + JSON.stringify(c('B1').style.fill));
      if (c('B1').style.font.color !== 'FFFF0000') bad.push('B1 couleur posée perdue=' + c('B1').style.font.color);
      const bords = ['left', 'right', 'top', 'bottom'].map(side => c('A1').style.border[side] && c('A1').style.border[side].color);
      if (!bords.every(color => color === 'FF777777')) bad.push('bordures=' + bords);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // --- 4) Fusions et bordures ------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_merged_cells_keep_their_range_and_every_cell_its_borders',
    description: 'colspan et rowspan deviennent des cellules fusionnées (A1:B2, C1:C2…) ; la valeur est dans la case d\'angle, et toutes les cases du bloc ont le filet fin gris (comme le PDF)',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([80, 80, 80], [30, 30, 30], [
        ['<td colspan="2" rowspan="2"><p>Bloc</p></td>', 'C1'],
        ['C2'],
        ['A3', '<td colspan="2"><p>Large</p></td>'],
      ]);
      const s = x.sheet;
      const merges = s.merges.slice().sort();
      const edges = ref => ['left', 'right', 'top', 'bottom'].every(side => s.cell(ref).style.border && s.cell(ref).style.border[side] && s.cell(ref).style.border[side].style === 'thin');
      const bad = [];
      if (JSON.stringify(merges) !== JSON.stringify(['A1:B2', 'B3:C3'])) bad.push('fusions=' + merges);
      if (s.cell('A1').value !== 'Bloc' || s.cell('C1').value !== 'C1' || s.cell('C2').value !== 'C2' || s.cell('A3').value !== 'A3' || s.cell('B3').value !== 'Large') bad.push('valeurs=' + s.text());
      ['A1', 'B1', 'A2', 'B2', 'C1', 'C2', 'A3', 'B3', 'C3'].forEach(ref => { if (!edges(ref)) bad.push(ref + ' bordures=' + JSON.stringify(s.cell(ref).style.border)); });
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify(merges) };
    },
  });

  // --- 5) Lignes d'une case --------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_paragraphs_lists_and_line_breaks_become_lines_of_the_cell',
    description: 'Dans une case, chaque paragraphe, saut de ligne et élément de liste est une ligne (« • », « 1. », « ☐ » devant les listes, un niveau de plus = un retrait), un paragraphe vide garde sa ligne, les lignes vides de la fin sont retirées',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([200, 200], [90, 90], [
        ['<td><p>un</p><p>deux</p><p></p><p>quatre</p><p></p></td>', '<td><p>haut<br>bas</p></td>'],
        ['<td><ul><li><p>pomme</p></li><li><p>poire</p><ul><li><p>conférence</p></li></ul></li></ul></td>', '<td><ol><li><p>un</p></li><li><p>deux</p></li></ol><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>fait</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>à faire</p></div></li></ul></td>'],
      ]);
      const s = x.sheet;
      const bad = [];
      if (s.cell('A1').value !== 'un\ndeux\n\nquatre') bad.push('A1=' + JSON.stringify(s.cell('A1').value));
      if (s.cell('B1').value !== 'haut\nbas') bad.push('B1=' + JSON.stringify(s.cell('B1').value));
      if (s.cell('A2').value !== '• pomme\n• poire\n  • conférence') bad.push('A2=' + JSON.stringify(s.cell('A2').value));
      if (s.cell('B2').value !== '1. un\n2. deux\n☑ fait\n☐ à faire') bad.push('B2=' + JSON.stringify(s.cell('B2').value));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // --- 6) Liens, formules, images --------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_links_are_clickable_only_when_they_cover_the_cell_and_text_never_becomes_a_formula',
    description: 'Un lien qui couvre toute la case est un vrai lien Excel ; au milieu d\'un texte il garde sa couleur et son soulignement, sans cible ; un lien javascript: est retiré ; un texte qui commence par = reste du texte (aucune formule dans le fichier)',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([200, 200, 200], [30, 30], [
        [td('<a href="https://exemple.fr/page">Le site</a>'), td('Voir <a href="mailto:a@b.fr">ce courriel</a> ici'), td('<a href="javascript:alert(1)">piégé</a>')],
        [td('=SUM(A1:A2)'), td('+1+1'), td('@SUM(1)')],
      ]);
      const s = x.sheet;
      const bad = [];
      const links = s.hyperlinks;
      if (links.length !== 1 || links[0].ref !== 'A1' || links[0].target !== 'https://exemple.fr/page') bad.push('liens=' + JSON.stringify(links));
      const partial = (s.cell('B1').rich || []).find(r => r.text === 'ce courriel');
      if (!partial || !partial.font.underline || partial.font.color !== 'FF0563C1') bad.push('lien partiel sans couleur / soulignement=' + JSON.stringify(partial));
      if (s.cell('C1').value !== 'piégé' || s.cell('C1').style.font.underline) bad.push('lien dangereux=' + JSON.stringify(s.cell('C1').value));
      if (!s.cell('A1').style.font.underline) bad.push('lien de toute la case non souligné');
      ['A2', 'B2', 'C2'].forEach(ref => { if (s.cell(ref).kind !== 'text' || s.cell(ref).hasFormula) bad.push(ref + ' devenu ' + s.cell(ref).kind + (s.cell(ref).hasFormula ? ' avec formule' : '')); });
      if (s.cell('A2').value !== '=SUM(A1:A2)') bad.push('A2=' + s.cell('A2').value);
      if (/<f[ >]/.test(s.xml)) bad.push('une formule (<f>) dans la feuille');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_images_sit_on_their_cell_at_their_size',
    description: 'Une image d\'une case est posée sur cette case (angle haut gauche), à sa taille, et son fichier est dans le classeur',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([120, 120], [30, 80], [
        ['A1', 'B1'],
        ['A2', `<td><p><img class="editor-image" src="${DATA_PNG}" style="width: 40px" data-layer="normal" data-wrap="inline"></p></td>`],
      ]);
      const s = x.sheet;
      const media = x.names.filter(n => n.startsWith('xl/media/'));
      const a = s.anchors[0];
      const bad = [];
      if (media.length !== 1) bad.push('médias=' + media);
      if (s.anchors.length !== 1) bad.push('ancres=' + s.anchors.length);
      else if (a.col !== 1 || a.row !== 1 || !near(a.widthPx, 40, 1) || !near(a.heightPx, 40, 1)) bad.push('ancre=' + JSON.stringify(a)); // image carrée de 1 × 1 : 40 px de large, 40 de haut
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify(a) };
    },
  });

  // --- 7) Nom de feuille, mise en page ---------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_sheet_name_is_valid_and_page_is_a4_fitted_to_one_page_wide',
    description: 'La feuille porte le nom du fichier, débarrassé de \\ / ? * [ ] : et coupé à 31 caractères ; deux feuilles du même nom restent distinctes ; la page est A4, ajustée à une page de large, orientation et marges de la page du modèle',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([100], [30], [['x']], { template: 'Facture: Dupont/Jean?*[nov] 2026 - une très longue référence qui dépasse' });
      const used = new Set();
      const names = [XlsxExport.sheetNameFrom('Rapport', used), XlsxExport.sheetNameFrom('rapport', used), XlsxExport.sheetNameFrom("'" + 'a'.repeat(40) + "'", used), XlsxExport.sheetNameFrom('', used)];
      const bad = [];
      if (!/^[^\\/?*[\]:]{1,31}$/.test(x.sheet.name) || x.sheet.name !== 'Facture_ Dupont_Jean___nov_ 2026'.slice(0, 31)) bad.push('nom=' + JSON.stringify(x.sheet.name));
      if (new Set(names.map(n => n.toLowerCase())).size !== 4 || names.some(n => n.length > 31 || n.startsWith("'") || !n)) bad.push('noms=' + JSON.stringify(names));
      const p = x.sheet.pageSetup;
      if (!p || p.paperSize !== '9' || p.orientation !== 'portrait' || p.fitToWidth !== '1' || p.fitToHeight !== '0' || !x.sheet.fitToPage) bad.push('page=' + JSON.stringify([p, x.sheet.fitToPage]));
      const m = PageLayout.getMarginsMm();
      const inch = mm => Math.round(mm / 25.4 * 100) / 100;
      if (!x.sheet.margins || !near(x.sheet.margins.left, inch(m.left), 0.011) || !near(x.sheet.margins.top, inch(m.top), 0.011)) bad.push('marges=' + JSON.stringify(x.sheet.margins) + ' pour ' + JSON.stringify(m));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify({ name: x.sheet.name, names }) };
    },
  });

  cases.push({
    id: 'xlsx_page_follows_the_landscape_setting_of_the_model',
    description: 'Si la page du modèle est en paysage, la feuille Excel l\'est aussi',
    run: async (h) => {
      await seed(h);
      const before = PageLayout.getOrientation();
      PageLayout.setOrientation('landscape');
      let x;
      try { x = await exportGrid([100], [30], [['x']]); } finally { PageLayout.setOrientation(before); }
      const o = x.sheet.pageSetup && x.sheet.pageSetup.orientation;
      return { pass: o === 'landscape', notes: 'orientation=' + o };
    },
  });

  // --- 8) Zones répétées (une ligne de la grille par ligne liée) -------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_a_repeated_row_keeps_the_typed_value_of_each_of_its_rows',
    description: 'Une ligne de grille répétée pour chaque ligne liée (zone « ligne ») : chaque copie a SON nombre (vrai nombre) et son texte, lus dans la ligne du tour, et pas ceux de la première ligne ni de la ligne de la page',
    run: async (h) => {
      await h.resetEditor();
      const stub = window.__gristStub;
      stub.setVariables('XlFactures', { Numero: 'Text' });
      stub.setVariables('XlLignes', { Facture: 'Ref:XlFactures', Designation: 'Text', Qte: 'Numeric', manualSort: 'ManualSortPos' });
      stub.setRows('XlFactures', [{ id: 1, Numero: 'F-1' }]);
      stub.setRows('XlLignes', [
        { id: 1, Facture: 1, Designation: 'Journée', Qte: 1.5, manualSort: 2 },
        { id: 2, Facture: 1, Designation: 'Livret', Qte: 12, manualSort: 1 },
        { id: 3, Facture: 1, Designation: 'Déplacement', Qte: 3, manualSort: 3 },
      ]);
      await GristAPI.refreshSchema();
      await GristAPI.deleteLinkRule('XlLignes');
      await GristAPI.saveLinkRule('XlLignes', { mode: 'match', colonneTarget: undefined, colonneCible: 'Facture', colonneSource: 'id' });
      await GristAPI.refreshSchema();
      const record = { id: 1, Numero: 'F-1' };
      stub.fireRecord(Object.assign({}, record), 'XlFactures');
      await sleep(80);
      const loop = JSON.stringify({ repeat: 'row', table: 'XlLignes', empty: 'header' }).replace(/"/g, '&quot;');
      const b = (table, col, loopAttr) => `<span class="var-badge" data-table="${table}" data-column="${col}" data-key="${table}.${col}"${loopAttr ? ` data-loop="${loop}" data-loop-repeat="row"` : ''}></span>`;
      await loadGrid(gridHtml([160, 80], [30, 30], [['Désignation', 'Qté'], [b('XlLignes', 'Designation', true), b('XlLignes', 'Qte')]]));
      const { blob } = await XlsxExport.getXlsxBlobForRecord(Editor.getHTML(), 'XlFactures', record, '');
      const x = await openXlsx(blob);
      const s = x.sheet;
      const got = [2, 3, 4].map(r => [s.cell('A' + r).value, s.cell('B' + r).kind, s.cell('B' + r).value]);
      const expected = [['Livret', 'number', 12], ['Journée', 'number', 1.5], ['Déplacement', 'number', 3]];
      return { pass: JSON.stringify(got) === JSON.stringify(expected) && !s.rows.has(5), notes: JSON.stringify({ got, expected, rows: s.rows.size }) };
    },
  });

  // --- 9) Hors grille ---------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_a_document_without_table_gives_a_one_cell_sheet',
    description: 'Un contenu sans tableau (le menu grise l\'export Excel hors grille, mais un appel direct ne casse rien) donne une feuille d\'une case avec le texte, jamais une erreur',
    run: async (h) => {
      await seed(h);
      GridEditor.setActive(false);
      const { blob } = await XlsxExport.getXlsxBlobForRecord('<p>Bonjour ' + badge('Nom') + '</p><p>fin</p>', TABLE, RECORD, '');
      const x = await openXlsx(blob);
      return { pass: x.sheets.length === 1 && /^Bonjour Alpha Durand/.test(String(x.sheet.cell('A1').value)) && /fin/.test(String(x.sheet.cell('A1').value)), notes: JSON.stringify(x.sheet.cell('A1').value) };
    },
  });

  // --- 10) Menu --------------------------------------------------------------------------------------------------------------------------------------------------------
  const ROWS = { docx: 'v2-btn-export-docx', docxBatch: 'v2-btn-export-docx-batch', xlsx: 'v2-btn-export-xlsx', xlsxBatch: 'v2-btn-export-xlsx-batch', xlsxSingle: 'v2-btn-export-xlsx-single' };
  const rowState = id => { const el = document.getElementById(id); return el ? { greyed: el.classList.contains('v2-hover-row-disabled'), aria: el.getAttribute('aria-disabled') } : null; };
  async function enterGrid(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(250);
  }
  cases.push({
    id: 'xlsx_menu_rows_are_greyed_by_model_type_never_removed',
    description: 'Dans le menu d\'export, les trois lignes Excel (une valeur, ZIP, classeur unique) sont grisées hors grille et les deux lignes Word le sont dans une grille : aucune ne disparaît ; le clic d\'une ligne grisée ne lance aucun export et n\'ouvre aucune confirmation',
    run: async (h) => {
      await seed(h);
      const calls = { xlsx: 0, docx: 0 };
      const orig = { xlsx: XlsxExport.exportCurrentRecord, docx: DocxExport.exportCurrentRecord };
      XlsxExport.exportCurrentRecord = async () => { calls.xlsx++; };
      DocxExport.exportCurrentRecord = async () => { calls.docx++; };
      const dialogs = h.stubDialogs({ confirm: false });
      const excelRows = [ROWS.xlsx, ROWS.xlsxBatch, ROWS.xlsxSingle];
      const bad = [];
      try {
        await leaveGrid(h);
        const doc = { docx: rowState(ROWS.docx), docxBatch: rowState(ROWS.docxBatch) };
        excelRows.forEach(id => { const st = rowState(id); if (st === null || !st.greyed || st.aria !== 'true') bad.push('document : ' + id + '=' + JSON.stringify(st)); });
        if (!doc.docx || doc.docx.greyed || !doc.docxBatch || doc.docxBatch.greyed) bad.push('document : Word=' + JSON.stringify([doc.docx, doc.docxBatch]));
        excelRows.forEach(id => document.getElementById(id).click());
        await sleep(250);
        if (calls.xlsx) bad.push('clic sur Excel grisé a lancé l\'export');
        if (dialogs.asked.length) bad.push('clic sur un Excel grisé a ouvert une confirmation : ' + JSON.stringify(dialogs.asked.map(a => a.message)));
        document.getElementById(ROWS.docx).click(); await sleep(250);
        if (!calls.docx) bad.push('clic sur Word d\'un document n\'a rien lancé');
        calls.docx = 0;
        await enterGrid(h);
        excelRows.forEach(id => { const st = rowState(id); if (!st || st.greyed || st.aria !== null) bad.push('grille : ' + id + '=' + JSON.stringify(st)); });
        const grid = { docx: rowState(ROWS.docx), docxBatch: rowState(ROWS.docxBatch) };
        if (!grid.docx || !grid.docx.greyed || grid.docx.aria !== 'true' || !grid.docxBatch || !grid.docxBatch.greyed || grid.docxBatch.aria !== 'true') bad.push('grille : Word=' + JSON.stringify([grid.docx, grid.docxBatch]));
        document.getElementById(ROWS.docx).click(); await sleep(150);
        document.getElementById(ROWS.docxBatch).click(); await sleep(150);
        if (calls.docx) bad.push('clic sur Word grisé (grille) a lancé l\'export');
        if (dialogs.asked.length) bad.push('clic sur un Word grisé (grille) a ouvert une confirmation');
        await leaveGrid(h);
      } finally {
        dialogs.restore();
        XlsxExport.exportCurrentRecord = orig.xlsx; DocxExport.exportCurrentRecord = orig.docx;
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_menu_row_downloads_the_workbook_of_the_current_row',
    description: 'Dans une grille, « Exporter en Excel… » télécharge le classeur de la ligne courante, nommé comme le PDF (modèle de nom de fichier) avec l\'extension .xlsx, et le dit dans le coin d\'état ; les boutons d\'export sont reprenables ensuite',
    run: async (h) => {
      await seed(h);
      await enterGrid(h);
      GridEditor.setActive(false);
      Editor.setHTML(gridHtml([140, 100], [30, 30], [['Nom', 'Montant'], [badge('Nom'), badge('Montant')]]));
      GridEditor.setActive(true);
      await sleep(250);
      const nameInput = document.getElementById('pdf-filename-template');
      const savedName = nameInput.value;
      nameInput.value = 'Fiche ' + '#' + TABLE + '.Nom';
      const downloads = [];
      const origDownload = ExportCommon.downloadBlob;
      ExportCommon.downloadBlob = (blob, filename) => { downloads.push({ blob, filename }); };
      const bad = [];
      let x = null;
      try {
        document.getElementById(ROWS.xlsx).click();
        for (let i = 0; i < 60 && !downloads.length; i++) await sleep(100);
        await sleep(100);
        if (downloads.length !== 1) bad.push('téléchargements=' + downloads.length);
        else {
          if (downloads[0].filename !== 'Fiche Alpha Durand.xlsx') bad.push('nom=' + downloads[0].filename);
          if (downloads[0].blob.type !== XlsxExport.XLSX_MIME) bad.push('type=' + downloads[0].blob.type);
          x = await openXlsx(downloads[0].blob);
          if (x.sheet.cell('A2').value !== 'Alpha Durand' || x.sheet.cell('B2').value !== 1234.5) bad.push('contenu=' + x.sheet.text());
        }
        const status = document.getElementById('status-msg').textContent;
        if (status !== I18n.t('status.xlsxGenerated')) bad.push('état=' + JSON.stringify(status));
        const rowOpacity = document.getElementById(ROWS.xlsx).style.opacity;
        if (rowOpacity !== '') bad.push('ligne restée verrouillée (opacité ' + rowOpacity + ')');
      } finally {
        ExportCommon.downloadBlob = origDownload;
        nameInput.value = savedName;
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_menu_row_without_a_selected_row_says_so_in_excel_words',
    description: '« Exporter en Excel… » sans ligne sélectionnée dans Grist affiche une alerte qui parle d\'Excel (jamais de PDF), dans les deux langues, et ne télécharge rien',
    run: async (h) => {
      await seed(h);
      await enterGrid(h);
      const messages = [];
      const downloads = [];
      const origAlert = window.alert;
      const origDownload = ExportCommon.downloadBlob;
      window.alert = message => { messages.push(String(message)); };
      ExportCommon.downloadBlob = (blob, filename) => { downloads.push(filename); };
      const bad = [];
      try {
        window.__gristStub.fireRecord(null, TABLE);
        await sleep(80);
        for (const lang of ['fr', 'en']) {
          await inLang(lang, async () => {
            messages.length = 0;
            document.getElementById(ROWS.xlsx).click();
            await sleep(250);
            if (messages.length !== 1) bad.push(lang + ' : alertes=' + JSON.stringify(messages));
            else if (!/Excel/.test(messages[0]) || /PDF/i.test(messages[0]) || messages[0] !== I18n.t('alert.noRecordForExportXlsx')) bad.push(lang + ' : texte=' + messages[0]);
          });
        }
        if (downloads.length) bad.push('téléchargements=' + JSON.stringify(downloads));
      } finally {
        window.alert = origAlert;
        ExportCommon.downloadBlob = origDownload;
        window.__gristStub.fireRecord(Object.assign({}, RECORD), TABLE);
        await sleep(80);
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // --- 11) Toutes les valeurs de la table : archive ZIP de classeurs et classeur unique -------------------------------------------------------------------------------
  const VALUES = [
    { id: 1, Nom: 'Alpha Durand', Montant: 1234.5 },
    { id: 2, Nom: 'Bravo Martin', Montant: 99 },
    { id: 3, Nom: 'Charlie Petit', Montant: 0.5 },
  ];
  // Trois valeurs dans la table, la première affichée, et la grille [Nom | Montant] / [bulle Nom | bulle Montant] chargée comme un modèle enregistré.
  async function seedValues(h, values) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Montant: 'Numeric', Quantite: 'Int', Date: 'Date', Zero: 'Numeric', Gros: 'Int', Ancienne: 'Date', Mots: 'Text' });
    stub.setRows(TABLE, values);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, values[0] || RECORD), TABLE);
    await sleep(100);
    await enterGrid(h);
    await loadGrid(gridHtml([140, 100], [30, 30], [['Nom', 'Montant'], [badge('Nom'), badge('Montant')]]));
  }
  // Clique la ligne du menu et attend le téléchargement (ou la fin de l'export quand la confirmation est refusée) : la confirmation notée et acceptée ou non, le <a download>
  // intercepté, chaque message d'état affiché. Même principe que dev-tests/scenarios-pdf-batch.js.
  async function clickExportRow(h, rowId, accept) {
    const downloads = [];
    const confirms = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: opts => { confirms.push({ title: opts.title, message: opts.message }); return accept !== false; } });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    const statusEl = document.getElementById('status-msg');
    const statuses = [];
    const statusObserver = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    statusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (accept !== false && !downloads.length && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(accept === false ? 400 : 80);
    } finally {
      statusObserver.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, confirms, statuses, status: statusEl.textContent };
  }
  const withTemplate = async (value, fn) => {
    const input = document.getElementById('pdf-filename-template');
    const saved = input.value;
    input.value = value;
    try { return await fn(); } finally { input.value = saved; }
  };
  const FILE_TEMPLATE = 'Fiche #' + TABLE + '.Nom';

  cases.push({
    id: 'xlsx_batch_zip_has_one_workbook_per_value_named_like_the_pdf_files',
    description: '« Exporter toutes les valeurs de la table en Excel (ZIP)… » télécharge une archive « <table>-export-xlsx.zip » avec un classeur par valeur (nommé par le modèle de nom de fichier), chacun d\'une feuille avec SES valeurs (vrais nombres) ; la confirmation, la progression et la fin parlent d\'Excel, jamais de PDF ni de lignes',
    run: async (h) => {
      await seedValues(h, VALUES);
      const bad = [];
      try {
        const res = await withTemplate(FILE_TEMPLATE, () => clickExportRow(h, ROWS.xlsxBatch));
        const dl = res.downloads[0];
        if (res.downloads.length !== 1 || !dl) return { pass: false, notes: 'téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses) };
        if (dl.name !== TABLE + '-export-xlsx.zip') bad.push('nom de l\'archive=' + dl.name);
        const zip = await JSZip.loadAsync(await dl.blob.arrayBuffer());
        const files = Object.keys(zip.files).sort();
        const expected = VALUES.map(v => 'Fiche ' + v.Nom + '.xlsx').sort();
        if (JSON.stringify(files) !== JSON.stringify(expected)) bad.push('fichiers=' + JSON.stringify(files));
        for (const v of VALUES) {
          const entry = zip.file('Fiche ' + v.Nom + '.xlsx');
          if (!entry) continue;
          const x = await openXlsx(await entry.async('blob'));
          if (x.sheets.length !== 1) bad.push(v.Nom + ' : ' + x.sheets.length + ' feuilles');
          else if (x.sheet.cell('A2').value !== v.Nom || x.sheet.cell('B2').value !== v.Montant) bad.push(v.Nom + ' : contenu=' + x.sheet.text());
          else if (x.sheet.name !== 'Fiche ' + v.Nom) bad.push(v.Nom + ' : feuille=' + x.sheet.name);
        }
        const messages = [...res.confirms.map(c => c.title + ' ' + c.message), ...res.statuses];
        if (res.confirms.length !== 1 || !/Excel/.test(res.confirms[0].message) || !/3/.test(res.confirms[0].message)) bad.push('confirmation=' + JSON.stringify(res.confirms));
        if (messages.some(m => /pdf|docx|ligne/i.test(m))) bad.push('un message parle de PDF, DOCX ou de lignes : ' + JSON.stringify(messages.filter(m => /pdf|docx|ligne/i.test(m))));
        if (!res.statuses.some(m => /Excel/.test(m) && /1\/3/.test(m))) bad.push('progression=' + JSON.stringify(res.statuses));
        if (res.status !== I18n.t('status.batchExportDoneXlsx', { ok: 3 })) bad.push('fin=' + res.status);
        const locked = [ROWS.xlsx, ROWS.xlsxBatch, ROWS.xlsxSingle, 'btn-export-pdf'].filter(id => document.getElementById(id).style.opacity !== '');
        if (locked.length) bad.push('contrôles restés verrouillés : ' + locked.join(', '));
      } finally {
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_single_workbook_has_one_sheet_per_value_named_like_the_files',
    description: '« Exporter toutes les valeurs de la table dans un seul classeur… » télécharge « <table>-export.xlsx » : une feuille par valeur, nommée comme son fichier (31 caractères au plus, « nom (2) » si deux feuilles s\'appellent pareil), avec SES valeurs ; la confirmation, la progression et la fin parlent d\'Excel',
    run: async (h) => {
      await seedValues(h, VALUES);
      const bad = [];
      try {
        const res = await withTemplate(FILE_TEMPLATE, () => clickExportRow(h, ROWS.xlsxSingle));
        const dl = res.downloads[0];
        if (res.downloads.length !== 1 || !dl) return { pass: false, notes: 'téléchargements=' + res.downloads.length + ' états=' + JSON.stringify(res.statuses) };
        if (dl.name !== TABLE + '-export.xlsx') bad.push('nom=' + dl.name);
        if (dl.blob.type !== XlsxExport.XLSX_MIME) bad.push('type=' + dl.blob.type);
        const x = await openXlsx(dl.blob);
        if (x.sheets.length !== 3) bad.push('feuilles=' + x.sheets.map(sh => sh.name).join(','));
        VALUES.forEach((v, i) => {
          const sheet = x.sheets[i];
          if (!sheet) return;
          if (sheet.name !== 'Fiche ' + v.Nom) bad.push('feuille ' + (i + 1) + '=' + sheet.name);
          if (sheet.cell('A2').value !== v.Nom || sheet.cell('B2').value !== v.Montant) bad.push(v.Nom + ' : contenu=' + sheet.text());
          if (sheet.colWidth(1) === null || sheet.rowHeight(2) !== 22.5) bad.push(v.Nom + ' : largeur ou hauteur absentes (' + sheet.colWidth(1) + ', ' + sheet.rowHeight(2) + ')');
        });
        const messages = [...res.confirms.map(c => c.title + ' ' + c.message), ...res.statuses];
        if (res.confirms.length !== 1 || !/Excel/.test(res.confirms[0].message) || !/une feuille|sheet/i.test(res.confirms[0].message)) bad.push('confirmation=' + JSON.stringify(res.confirms));
        if (messages.some(m => /pdf|docx|ligne/i.test(m))) bad.push('un message parle de PDF, DOCX ou de lignes : ' + JSON.stringify(messages.filter(m => /pdf|docx|ligne/i.test(m))));
        if (!res.statuses.some(m => /Excel/.test(m) && /1\/3/.test(m))) bad.push('progression=' + JSON.stringify(res.statuses));
        if (res.status !== I18n.t('status.singleWorkbookDone', { ok: 3 })) bad.push('fin=' + res.status);
        // Sans modèle de nom de fichier, les trois valeurs auraient le même nom : « publipostage », « publipostage (2) », « publipostage (3) » - comme dans l'archive ZIP.
        const same = await withTemplate('', () => clickExportRow(h, ROWS.xlsxSingle));
        const sameNames = same.downloads[0] ? (await openXlsx(same.downloads[0].blob)).sheets.map(sh => sh.name) : null;
        if (JSON.stringify(sameNames) !== JSON.stringify(['publipostage', 'publipostage (2)', 'publipostage (3)'])) bad.push('noms sans modèle=' + JSON.stringify(sameNames));
        // Un nom plus long que les 31 caractères d'Excel, avec des caractères interdits : coupé, nettoyé, et chaque feuille garde un nom à elle.
        const longName = await withTemplate('Facture [très] longue : numéro de ' + '#' + TABLE + '.Nom', () => clickExportRow(h, ROWS.xlsxSingle));
        const longNames = longName.downloads[0] ? (await openXlsx(longName.downloads[0].blob)).sheets.map(sh => sh.name) : null;
        if (!longNames || longNames.length !== 3 || longNames.some(n => n.length > 31 || /[\\\/?*\[\]:]/.test(n)) || new Set(longNames.map(n => n.toLowerCase())).size !== 3) bad.push('noms longs=' + JSON.stringify(longNames));
      } finally {
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'xlsx_single_workbook_keeps_no_half_written_sheet_when_a_value_fails',
    description: 'Dans le classeur unique, une valeur qui échoue en cours de feuille ne laisse ni feuille à moitié écrite ni nom pris : les autres valeurs sont là, et la suivante du même nom reprend le nom sans « (2) »',
    run: async (h) => {
      await seed(h);
      await loadGrid(gridHtml([140, 100], [30, 30], [[td('Nom', ' colspan="2"')], [badge('Nom'), badge('Montant')]].map(r => r)));
      const html = Editor.getHTML();
      const book = await XlsxExport.createSingleWorkbook();
      // La deuxième feuille créée échoue à sa première fusion : la feuille existe déjà dans le classeur quand l'exception tombe.
      const origAdd = ExcelJS.Workbook.prototype.addWorksheet;
      let created = 0;
      ExcelJS.Workbook.prototype.addWorksheet = function (...args) {
        const sheet = origAdd.apply(this, args);
        if (++created === 2) sheet.mergeCells = () => { throw new Error('échec voulu'); };
        return sheet;
      };
      const bad = [];
      let names = null;
      try {
        const outcomes = [];
        for (const v of [VALUES[0], VALUES[1], VALUES[2], VALUES[1]]) {
          try { await book.appendRecord(html, TABLE, v, FILE_TEMPLATE); outcomes.push('ok'); } catch (e) { outcomes.push('échec'); }
        }
        if (outcomes.join() !== 'ok,échec,ok,ok') bad.push('résultats=' + outcomes.join());
        names = (await openXlsx(await book.toBlob())).sheets.map(sh => sh.name);
        if (JSON.stringify(names) !== JSON.stringify(['Fiche Alpha Durand', 'Fiche Charlie Petit', 'Fiche Bravo Martin'])) bad.push('feuilles=' + JSON.stringify(names));
      } finally {
        ExcelJS.Workbook.prototype.addWorksheet = origAdd;
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // --- 12) Dans une grille, « lignes » devient « valeurs de la table » (les autres modèles gardent leurs mots) --------------------------------------------------------------
  const BATCH_LABEL_IDS = ['v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'];
  const labelsNow = () => Object.fromEntries(BATCH_LABEL_IDS.map(id => [id, document.getElementById(id).textContent.trim()]));
  ['fr', 'en'].forEach(lang => cases.push({
    id: 'xlsx_grid_wording_says_values_of_the_table_not_rows_' + lang,
    description: 'Dans une grille (' + lang + '), les quatre lignes « toutes les valeurs » du menu, la confirmation du ZIP de PDF et le message d\'une table vide parlent de « valeurs de la table », jamais de lignes ; dans un document les lignes PDF gardent « lignes » et le texte suit un changement de langue',
    run: async (h) => {
      await seedValues(h, VALUES);
      const bad = [];
      const previous = I18n.getLang();
      try {
        I18n.setLang(lang);
        const words = lang === 'fr' ? /valeurs? de la table/ : /table values?/;
        const rowWord = lang === 'fr' ? /lignes?/i : /\brows?\b/i;
        const inGrid = labelsNow();
        BATCH_LABEL_IDS.forEach(id => { if (!words.test(inGrid[id]) || rowWord.test(inGrid[id])) bad.push('grille : ' + id + '=' + inGrid[id]); });
        // Confirmation du ZIP de PDF, refusée : rien n'est généré, seul le texte compte.
        const zipRes = await clickExportRow(h, 'v2-btn-export-pdf-batch', false);
        const confirm = zipRes.confirms[0];
        if (!confirm || rowWord.test(confirm.title + ' ' + confirm.message) || !/PDF/.test(confirm.message) || !/3/.test(confirm.message)) bad.push('confirmation du ZIP de PDF=' + JSON.stringify(confirm));
        if (zipRes.downloads.length) bad.push('téléchargement malgré le refus');
        const mergedRes = await clickExportRow(h, 'v2-btn-export-pdf-merged', false);
        const mergedConfirm = mergedRes.confirms[0];
        if (!mergedConfirm || rowWord.test(mergedConfirm.title + ' ' + mergedConfirm.message)) bad.push('confirmation du PDF unique=' + JSON.stringify(mergedConfirm));
        // Table vide.
        window.__gristStub.setRows(TABLE, []);
        const emptyRes = await clickExportRow(h, 'v2-btn-export-pdf-batch', false);
        if (rowWord.test(emptyRes.status) || !/values?|valeurs?/i.test(emptyRes.status) || emptyRes.confirms.length) bad.push('table vide=' + JSON.stringify(emptyRes.status));
        window.__gristStub.setRows(TABLE, VALUES);
        // Lecture de la table impossible.
        const realFetch = GristAPI.fetchTableRows;
        GristAPI.fetchTableRows = async () => { throw new Error('lecture refusée'); };
        const unreadable = await (async () => { try { return await clickExportRow(h, 'v2-btn-export-xlsx-batch', false); } finally { GristAPI.fetchTableRows = realFetch; } })();
        if (rowWord.test(unreadable.status) || !/values?|valeurs?/i.test(unreadable.status)) bad.push('table illisible=' + JSON.stringify(unreadable.status));
        // Dans un document : les mots d'avant, et le changement de langue réécrit chaque ligne dans le bon vocabulaire.
        await leaveGrid(h);
        const inDoc = labelsNow();
        const classic = lang === 'fr'
          ? { 'v2-btn-export-pdf-batch': 'Exporter toutes les lignes (ZIP)…', 'v2-btn-export-pdf-merged': 'Exporter toutes les lignes en un seul PDF…' }
          : { 'v2-btn-export-pdf-batch': 'Export all rows (ZIP)…', 'v2-btn-export-pdf-merged': 'Export all rows as a single PDF…' };
        Object.keys(classic).forEach(id => { if (inDoc[id] !== classic[id]) bad.push('document : ' + id + '=' + inDoc[id]); });
        const emptyDoc = await (async () => { window.__gristStub.setRows(TABLE, []); const r = await clickExportRow(h, 'v2-btn-export-pdf-batch', false); window.__gristStub.setRows(TABLE, VALUES); return r; })();
        if (!rowWord.test(emptyDoc.status)) bad.push('document, table vide=' + JSON.stringify(emptyDoc.status));
        await enterGrid(h);
        I18n.setLang(lang === 'fr' ? 'en' : 'fr');
        const switched = labelsNow();
        const otherWords = lang === 'fr' ? /table values?/ : /valeurs? de la table/;
        BATCH_LABEL_IDS.forEach(id => { if (!otherWords.test(switched[id])) bad.push('changement de langue : ' + id + '=' + switched[id]); });
      } finally {
        I18n.setLang(previous);
        window.__gristStub.setRows(TABLE, VALUES);
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  }));

  cases.push({
    id: 'xlsx_grid_merged_pdf_says_values_when_done',
    description: 'Dans une grille, « Exporter toutes les valeurs de la table en un seul PDF… » génère bien un PDF unique et le dit en « valeurs réunies », pas en lignes',
    run: async (h) => {
      await seedValues(h, VALUES);
      const bad = [];
      try {
        const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
        if (res.downloads.length !== 1 || res.downloads[0].name !== TABLE + '-export.pdf') bad.push('téléchargements=' + JSON.stringify(res.downloads.map(d => d.name)));
        if (res.status !== I18n.t('status.mergedExportDoneGrid', { ok: 3 }) || /ligne/i.test(res.status)) bad.push('fin=' + res.status);
        if (!res.confirms[0] || /ligne/i.test(res.confirms[0].message)) bad.push('confirmation=' + JSON.stringify(res.confirms));
      } finally {
        await leaveGrid(h);
        GridEditor.setActive(false);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // --- 13) Bloc de texte conditionnel (menu des variables, onglet Chips) dans une case -------------------------------------------------------------------------------
  cases.push({
    id: 'xlsx_a_conditional_text_block_in_a_cell_is_resolved_like_in_reading',
    description: 'Un bloc de texte conditionnel dans une case de grille est résolu comme à la Lecture, avant la lecture de la case : condition remplie, le cadre disparaît et son contenu reste (une bulle seule dans le bloc reste un vrai nombre) ; sinon le bloc disparaît et la case reste vide, avec son filet ; sans condition, le bloc est toujours là ; aucun cadre ni étiquette ne passe dans le classeur',
    run: async (h) => {
      await seed(h);
      const yes = withCondition({ mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Alpha Durand' }] });
      const no = withCondition({ mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'personne' }] });
      // Une case dont le contenu est le bloc lui-même (un <td> déjà écrit : gridHtml n'enveloppe pas un <td> dans un paragraphe, ce qui sortirait le <div> du <p>).
      const frame = (inner, condition) => `<div class="conditional-text"${condition}>${inner}</div>`;
      const block = (inner, condition) => `<td>${frame(inner, condition)}</td>`;
      const x = await exportGrid([100, 180], [30, 40, 30, 30, 30], [
        ['Nombre', block(`<p>${badge('Montant')}</p>`, yes)],
        ['Texte', block(`<p>Gros</p><p>${badge('Nom')}</p>`, yes)],
        ['Faux', block('<p>Jamais</p>', no)],
        ['Libre', block('<p>Sans condition</p>', '')],
        ['Emboîté', block(`<p>Dehors</p>${frame('<p>Dedans</p>', yes)}${frame('<p>Caché</p>', no)}`, yes)],
      ]);
      const cell = ref => x.sheet.cell(ref);
      const bad = [];
      if (cell('B1').kind !== 'number' || cell('B1').value !== 1234.5) bad.push('bulle seule dans un bloc : ' + JSON.stringify(cell('B1').value));
      if (cell('B2').value !== 'Gros\nAlpha Durand') bad.push('deux paragraphes : ' + JSON.stringify(cell('B2').value));
      if (cell('B3').kind !== 'empty') bad.push('bloc faux : ' + JSON.stringify(cell('B3').value));
      if (cell('B4').value !== 'Sans condition') bad.push('sans condition : ' + JSON.stringify(cell('B4').value));
      if (cell('B5').value !== 'Dehors\nDedans') bad.push('blocs emboîtés : ' + JSON.stringify(cell('B5').value));
      const border = cell('B3').style.border;
      if (!border || !border.left || !border.top) bad.push('la case vide n\'a plus son filet : ' + JSON.stringify(border));
      if (/Jamais|Caché|conditionnel|Si /.test(x.sheet.text())) bad.push('du contenu d\'un bloc retiré ou une étiquette est passé dans le classeur : ' + x.sheet.text());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // Un texte collé de Word ou d'une page web garde ses couleurs NOMMÉES (« red », « black » : le navigateur ne les réécrit pas en rgb()). L'Excel ne lisait que rgb() et #hexa : la couleur de ces textes, de ces
  // surlignages et de ces fonds disparaissait sans un mot (carte d'Antoine du 01/10, « Corriger », après l'« Erreur génération DOCX. » de sa Fiche mission).
  cases.push({
    id: 'xlsx_named_css_colors_keep_their_color',
    description: 'Une couleur de texte, un surlignage ou un fond de case écrits avec un NOM (red, black, yellow, lime ; majuscules comprises) sortent comme leur écriture en rgb() ou en #hexa ; transparent ou illisible : aucune couleur, jamais d\'erreur',
    run: async (h) => {
      await seed(h);
      const x = await exportGrid([150, 110, 110, 110], [30, 30], [
        [td('<span style="color: red">rouge</span> et <span style="color: BLUE">bleu</span>'), td('<span style="color: black">tout noir</span>'), td('fond nommé', ' style="background-color: yellow"'), td('<span style="background-color: lime">tout surligné</span>')],
        [td('<span style="color: transparent">transparent</span>'), td('<span style="color: nope">illisible</span>'), td('fond transparent', ' style="background-color: transparent"'), td('fond illisible', ' style="background-color: nope"')],
      ]);
      const c = ref => x.sheet.cell(ref);
      const bad = [];
      const runs = c('A1').rich || [];
      const run = t => runs.find(r => r.text.trim() === t) || { font: {} };
      if (run('rouge').font.color !== 'FFFF0000') bad.push('« rouge » : couleur=' + run('rouge').font.color);
      if (run('bleu').font.color !== 'FF0000FF') bad.push('« BLUE » : couleur=' + run('bleu').font.color);
      if (c('B1').style.font.color !== 'FF000000') bad.push('« black » sur toute la case : couleur=' + c('B1').style.font.color);
      if (!c('C1').style.fill || c('C1').style.fill.argb !== 'FFFFFF00') bad.push('fond « yellow » : ' + JSON.stringify(c('C1').style.fill));
      if (!c('D1').style.fill || c('D1').style.fill.argb !== 'FF00FF00') bad.push('surlignage « lime » de toute la case : ' + JSON.stringify(c('D1').style.fill));
      ['A2', 'B2'].forEach(ref => { if (c(ref).style.font.color) bad.push(ref + ' (transparent ou illisible) : couleur de texte=' + c(ref).style.font.color); });
      ['C2', 'D2'].forEach(ref => { if (c(ref).style.fill) bad.push(ref + ' (transparent ou illisible) : fond=' + JSON.stringify(c(ref).style.fill)); });
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.xlsx = cases;
})();
