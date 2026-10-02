// Suite "gridImport" - importer un classeur Excel dans une grille (js/grid-xlsx-import.js, js/xlsx-number-format.js, planning/feature-mode-grille-excel.md, sujet 18 du 02/10 : « Prévoir un Import
// Excel pour le modèle Grille »). Le contraire de l'export (js/xlsx-export.js) : la première feuille visible d'un .xlsx devient une NOUVELLE grille, case par case. Les classeurs ci-dessous sont
// fabriqués ICI, octet par octet, « comme Excel les écrit » (feuilles, chaînes partagées, styles, thème, fusions, liens : un .xlsx est un zip d'OOXML) : le sandbox n'a pas d'Excel, et ExcelJS
// n'écrit pas un trait que d'un côté ni un style par case comme le fait Excel. Les cas lisent le résultat dans le VRAI éditeur (une grille chargée), pas seulement le modèle, et le geste complet
// passe par la vraie ligne du menu « + » : le sélecteur de fichier du navigateur n'existe pas ici, le scénario répond comme lui (fichier choisi + évènement `change`, ou `cancel`) ; et, pour un
// classeur qui a plusieurs feuilles visibles, la VRAIE liste avec recherche des feuilles (js/search-select.js) : le scénario y fait ce que fait la personne (taper, cliquer une ligne, Entrée, Échap).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const doc = () => ed().state.doc;
  const tableNode = () => doc().child(0);
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // --- Fabriquer un .xlsx ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // spec : { sheets: [{ name, state?, rows: [[cell]], cols?: [{ min, max, width?, hidden? }], rowMeta?: { n: { ht?, hidden? } }, merges?: ['A1:C1'], links?: [{ ref, url }], defaultColWidth?, defaultRowHeight? }],
  //          fonts?, fills?, borders?: [xml], numFmts?: { id: code }, xfs?: [{ numFmtId?, fontId?, fillId?, borderId?, align? }] }
  // cell : null | texte | nombre | booléen | { v, s? (style), f? (formule), t? ('e' : erreur), rich?: [{ t, rPr? }] }
  function colName(n) { let s = ''; let k = n; while (k > 0) { const m = (k - 1) % 26; s = String.fromCharCode(65 + m) + s; k = Math.floor((k - 1) / 26); } return s; }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  async function buildXlsx(spec) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    const strings = [];
    const stringIndex = (cell) => {
      const xml = cell.rich ? cell.rich.map(r => `<r>${r.rPr ? `<rPr>${r.rPr}</rPr>` : ''}<t xml:space="preserve">${esc(r.t)}</t></r>`).join('') : `<t xml:space="preserve">${esc(cell.v)}</t>`;
      let at = strings.indexOf(xml);
      if (at < 0) { strings.push(xml); at = strings.length - 1; }
      return at;
    };
    const sheets = spec.sheets;
    const n = sheets.length;
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state && s.state !== 'visible' ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/theme" Target="theme/theme1.xml"/><Relationship Id="rId${n + 2}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${n + 3}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    const fonts = spec.fonts || ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'];
    const fills = spec.fills || ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = spec.borders || ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    const numFmts = spec.numFmts || {};
    const xfs = spec.xfs || [{}];
    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${Object.keys(numFmts).length ? `<numFmts count="${Object.keys(numFmts).length}">${Object.entries(numFmts).map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.map(x => `<xf numFmtId="${x.numFmtId || 0}" fontId="${x.fontId || 0}" fillId="${x.fillId || 0}" borderId="${x.borderId || 0}" xfId="0"${x.numFmtId ? ' applyNumberFormat="1"' : ''}${x.fontId ? ' applyFont="1"' : ''}${x.fillId ? ' applyFill="1"' : ''}${x.borderId ? ' applyBorder="1"' : ''}${x.align ? ' applyAlignment="1"' : ''}>${x.align ? `<alignment ${x.align}/>` : ''}</xf>`).join('')}</cellXfs></styleSheet>`);
    zip.file('xl/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>`);
    sheets.forEach((sheet, i) => {
      const rows = sheet.rows.map((cells, r) => {
        const meta = (sheet.rowMeta || {})[r + 1] || {};
        const cs = cells.map((raw, c) => {
          if (raw === null || raw === undefined) return '';
          const cell = typeof raw === 'object' ? raw : { v: raw };
          const ref = colName(c + 1) + (r + 1);
          const s = cell.s ? ` s="${cell.s}"` : '';
          if (cell.f !== undefined) return `<c r="${ref}"${s}${typeof cell.v === 'string' ? ' t="str"' : ''}><f>${esc(cell.f)}</f><v>${esc(cell.v)}</v></c>`;
          if (cell.t === 'e') return `<c r="${ref}"${s} t="e"><v>${esc(cell.v)}</v></c>`;
          if (cell.rich || typeof cell.v === 'string') return `<c r="${ref}"${s} t="s"><v>${stringIndex(cell)}</v></c>`;
          if (typeof cell.v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
          if (cell.v === undefined) return `<c r="${ref}"${s}/>`;
          return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
        }).join('');
        return `<row r="${r + 1}"${meta.ht ? ` ht="${meta.ht}" customHeight="1"` : ''}${meta.hidden ? ' hidden="1"' : ''}>${cs}</row>`;
      }).join('');
      const cols = (sheet.cols || []).length ? `<cols>${sheet.cols.map(c => `<col min="${c.min}" max="${c.max || c.min}"${c.width !== undefined ? ` width="${c.width}" customWidth="1"` : ''}${c.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>` : '';
      const merges = (sheet.merges || []).length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const links = (sheet.links || []).length ? `<hyperlinks>${sheet.links.map((l, k) => `<hyperlink ref="${l.ref}" r:id="rId${k + 1}"/>`).join('')}</hyperlinks>` : '';
      if (links) zip.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheet.links.map((l, k) => `<Relationship Id="rId${k + 1}" Type="${REL}/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join('')}</Relationships>`);
      zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheetFormatPr${sheet.defaultColWidth ? ` defaultColWidth="${sheet.defaultColWidth}"` : ''} defaultRowHeight="${sheet.defaultRowHeight || 15}"/>${cols}<sheetData>${rows}</sheetData>${merges}${links}</worksheet>`);
    });
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(x => `<si>${x}</si>`).join('')}</sst>`);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  // --- Les classeurs d'essai ------------------------------------------------------------------------------------------------------------------------------------------------------
  const AUTO = '<color auto="1"/>';
  const THIN = side => `<${side} style="thin">${AUTO}</${side}>`;
  // Une facture « comme Excel l'écrit » : titre sur quatre colonnes (orange du thème, gras 14 pt, centré, traits écrits case par case : la case d'angle, celles du haut, celle de droite), titres
  // de colonnes gras soulignés d'un trait, texte rouge italique centré, une case fusionnée sur deux lignes en haut avec un retour à la ligne et une partie en gras souligné bleu (texte riche),
  // montants en euros, une ligne encadrée blanc sur bleu foncé du thème (accent 1, plus foncé de 25 %), une date, un total vert pâle sur trois colonnes dont le résultat d'une formule. Une colonne
  // (E) et une ligne (7) masquées portent chacune un texte qui ne doit pas venir.
  const INVOICE = () => ({
    fonts: [
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
      '<font><b/><sz val="14"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
      '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
      '<font><i/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
      '<font><b/><sz val="11"/><color theme="0"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
    ],
    fills: ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor theme="7"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor theme="4" tint="-0.249977111117893"/><bgColor indexed="64"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>'],
    borders: ['<border><left/><right/><top/><bottom/><diagonal/></border>',
      `<border>${THIN('left')}<right/>${THIN('top')}<bottom/><diagonal/></border>`,
      `<border><left/><right/>${THIN('top')}<bottom/><diagonal/></border>`,
      `<border><left/>${THIN('right')}${THIN('top')}<bottom/><diagonal/></border>`,
      `<border><left/><right/><top/>${THIN('bottom')}<diagonal/></border>`,
      `<border>${THIN('left')}${THIN('right')}${THIN('top')}${THIN('bottom')}<diagonal/></border>`],
    numFmts: { 164: '#,##0.00\\ "€"' },
    xfs: [
      {},
      { fontId: 1, fillId: 2, borderId: 1, align: 'horizontal="center" vertical="center"' },
      { fillId: 2, borderId: 2, align: 'horizontal="center" vertical="center"' },
      { fillId: 2, borderId: 3, align: 'horizontal="center" vertical="center"' },
      { fontId: 2, borderId: 4 },
      { fontId: 2, borderId: 4, align: 'horizontal="right"' },
      { fontId: 3, align: 'horizontal="center"' },
      { numFmtId: 164 },
      { align: 'vertical="top" wrapText="1"' },
      { fontId: 2, fillId: 4, align: 'horizontal="right"' },
      { fontId: 2, fillId: 4, numFmtId: 164 },
      { fontId: 4, fillId: 3, borderId: 5 },
      { numFmtId: 14 },
    ],
    sheets: [{
      name: 'Facture',
      cols: [{ min: 1, max: 1, width: 10.7 }, { min: 2, max: 2, width: 30 }, { min: 3, max: 3, width: 8 }, { min: 4, max: 4, width: 14 }, { min: 5, max: 5, hidden: true, width: 9 }],
      rowMeta: { 1: { ht: 28 }, 3: { ht: 45 }, 7: { hidden: true } },
      merges: ['A1:D1', 'B3:B4', 'A6:C6'],
      rows: [
        [{ v: 'Facture Alpha', s: 1 }, { s: 2 }, { s: 2 }, { s: 3 }],
        [{ v: 'Réf', s: 4 }, { v: 'Désignation', s: 4 }, { v: 'Qté', s: 5 }, { v: 'Prix', s: 5 }, { v: 'caché' }],
        [{ v: 'A-1', s: 6 }, { rich: [{ t: 'Vis à bois\nzinguée ' }, { t: '4x40', rPr: '<b/><u/><sz val="11"/><color rgb="FF0070C0"/><rFont val="Calibri"/>' }], s: 8 }, 2, { v: 12.5, s: 7 }],
        [{ v: 'A-2', s: 6 }, { s: 8 }, 1, { v: 8, s: 7 }],
        [{ v: 'Visible ?', s: 11 }, { v: 'oui', s: 11 }, { v: 'non', s: 11 }, { v: 46298, s: 12 }],
        [{ v: 'Total', s: 9 }, { s: 9 }, { s: 9 }, { v: 20.5, f: 'SUM(D3:D4)', s: 10 }],
        [{ v: 'ligne cachée' }],
      ],
    }],
  });

  // Une ligne de cases de toutes sortes : nombre, texte, booléen, erreur, alignements écrits à gauche / à droite / au centre, formules (texte et nombre), date, alignements verticaux.
  const KINDS = () => ({
    numFmts: {},
    xfs: [{}, { align: 'horizontal="left"' }, { align: 'horizontal="right"' }, { numFmtId: 14 }, { align: 'vertical="top" wrapText="1"' }, { align: 'vertical="bottom"' }, { align: 'vertical="center"' }, { align: 'horizontal="center"' }],
    sheets: [{
      name: 'Types',
      rows: [[
        { v: 1234.5 }, { v: 'Texte' }, { v: true }, { v: '#DIV/0!', t: 'e' }, { v: 1234.5, s: 1 }, { v: 'droite', s: 2 }, { v: '1234,5Texte', f: 'A1&B1' }, { v: 2469, f: 'A1*2' }, { v: 46298, s: 3 },
        { v: 'haut', s: 4 }, { v: 'bas', s: 5 }, { v: 'milieu', s: 6 }, { v: 'défaut' }, { v: 'centre', s: 7 },
      ]],
    }],
  });

  // --- Lire une grille chargée dans l'éditeur --------------------------------------------------------------------------------------------------------------------------------------
  // Comme dans scenarios-grid-table.js : le tableau lu par EMPLACEMENT (ligne, colonne de la grille, fusions comprises).
  function slots() {
    const out = {};
    const taken = {};
    tableNode().forEach((rowNode, _o, r) => {
      let c = 0;
      rowNode.forEach((cell) => {
        while (taken[r + ',' + c]) c++;
        const colspan = cell.attrs.colspan || 1, rowspan = cell.attrs.rowspan || 1;
        for (let rr = r; rr < r + rowspan; rr++) for (let cc = c; cc < c + colspan; cc++) taken[rr + ',' + cc] = true;
        out[r + ',' + c] = { node: cell, row: r, col: c };
        c += colspan;
      });
    });
    return out;
  }
  const hexOf = css => {
    const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(css || '');
    return m ? '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('') : css || null;
  };
  // Ce que la case (ligne, colonne) porte : texte (retours à la ligne = « | »), fusion, fond, alignements, traits, marques du texte, adresse d'un lien.
  function cellAt(row, col) {
    const slot = slots()[row + ',' + col];
    if (!slot) return null;
    const cell = slot.node;
    const marks = new Set();
    let href = null;
    let text = '';
    cell.descendants((node) => {
      if (node.type.name === 'hardBreak') text += '|';
      if (node.isText) text += node.text;
      (node.marks || []).forEach((mark) => {
        const name = mark.type.name;
        if (name === 'link') href = mark.attrs.href;
        marks.add(name === 'textStyle' ? 'textStyle' + (mark.attrs.color ? ':' + hexOf(mark.attrs.color) : '') + (mark.attrs.fontSize ? ':' + mark.attrs.fontSize : '') : name);
      });
    });
    return {
      text, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan, fill: hexOf(cell.attrs.backgroundColor), valign: cell.attrs.verticalAlign,
      borders: [cell.attrs.borderTop, cell.attrs.borderRight, cell.attrs.borderBottom, cell.attrs.borderLeft].map(b => b || '.').join(','),
      align: cell.firstChild.attrs.textAlign || null, marks: Array.from(marks).sort().join(' '), href,
    };
  }
  const shape = () => { const rows = []; tableNode().forEach(row => rows.push(row.childCount)); return rows.join(','); };
  const colWidths = () => { const out = []; tableNode().firstChild.forEach(cell => (cell.attrs.colwidth || []).forEach(w => out.push(w))); return out.join(','); };
  const rowHeights = () => { const out = []; tableNode().forEach(row => out.push(row.attrs.rowHeight)); return out.join(','); };

  // Le nombre de pas de chaque transaction que l'éditeur voit passer pendant `fn` (une grille chargée en pose une ou deux, jamais une par case).
  async function recordSteps(fn) {
    const steps = [];
    const on = ({ transaction, appendedTransactions }) => [transaction].concat(appendedTransactions || []).forEach(tr => steps.push(tr.steps.length));
    ed().on('transaction', on);
    try { await fn(); } finally { ed().off('transaction', on); }
    return steps;
  }
  // Charge le HTML d'un import dans une vraie grille (celle du modèle chargé : GridEditor posé comme loadTemplateIntoEditor le fait).
  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await sleep(250);
  }
  async function enterGrid(h) { await h.resetEditor(); h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-grid'); await sleep(250); }
  async function leaveGrid(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(150); }
  const statusText = () => document.getElementById('status-msg').textContent;
  async function until(test, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { if (test()) return true; await sleep(50); }
    return false;
  }

  // La liste avec recherche des feuilles (js/grid-xlsx-import.js:chooseSheet), telle que la personne la voit : ses lignes dans l'ordre, la zone de recherche, ce qu'elle dit quand rien ne correspond.
  const sheetPanel = () => { const panel = document.querySelector('#v2-xlsx-sheet-search .ss-panel'); return panel && !panel.hidden ? panel : null; };
  const sheetList = () => {
    const panel = sheetPanel();
    if (!panel) return null;
    const input = panel.querySelector('.ss-input');
    const rect = panel.getBoundingClientRect();
    const empty = panel.querySelector('.ss-empty');
    return {
      rows: Array.from(panel.querySelectorAll('.ss-option')).map(row => row.querySelector('.ss-name').textContent),
      placeholder: input.placeholder, focused: document.activeElement === input, search: input.value, emptyShown: empty && !empty.hidden ? empty.textContent : '',
      inPanel: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && rect.width > 0,
    };
  };
  const typeInList = (text) => { const input = sheetPanel().querySelector('.ss-input'); input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const keyInList = (key) => sheetPanel().querySelector('.ss-input').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const clickSheet = (name) => { const row = Array.from(sheetPanel().querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === name); row.click(); };

  // Le geste complet par la vraie ligne du menu « + » : un clic crée un <input type=file> et le clique ; ici le sélecteur du navigateur n'existe pas, le scénario répond comme lui. `bytes` null :
  // « Annuler ». Rend ce que la personne voit : le sélecteur s'est-il ouvert (et que demandait-il), le texte du coin d'état à la fin, s'il est en erreur.
  // `onList(list)` : ce que fait la personne de la liste des feuilles quand le classeur en a plusieurs (rien : la liste n'est pas attendue ; si elle s'ouvre, le geste s'arrête là) ; elle rend
  // ce qu'elle a vu (`out.seen`), avec `cancel: true` quand elle referme la liste sans choisir.
  async function importThroughMenu(h, bytes, name, onList) {
    const original = HTMLInputElement.prototype.click;
    let input = null;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') { input = this; return undefined; } return original.apply(this, arguments); };
    document.getElementById('status-msg').textContent = ''; // deux erreurs peuvent dire la même chose : on attend un message, pas un message différent du précédent
    try {
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-import-xlsx');
      if (!input) return { opened: false, status: statusText() };
      const asked = { accept: input.accept, multiple: input.multiple, attached: input.isConnected };
      let list = null;
      let seen = null;
      if (bytes) {
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name || 'classeur.xlsx', { type: XLSX_MIME }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
        // « Lecture du classeur Excel… » puis la liste des feuilles ou le résultat : un message nouveau qui n'est plus celui de la lecture.
        const readDone = () => { const t = statusText(); return t !== '' && !/^(Lecture du classeur|Reading the Excel)/.test(t); };
        await until(() => !!sheetPanel() || readDone(), 30000);
        if (sheetPanel()) {
          list = sheetList();
          if (onList) {
            seen = await onList(list);
            await until(() => !document.getElementById('v2-xlsx-sheet-search'), 5000); // la liste se défait après la fin de l'évènement en cours
            if (!(seen && seen.cancel)) await until(readDone, 30000);
          }
        }
        await sleep(200);
      } else {
        input.dispatchEvent(new Event('cancel'));
        await sleep(100);
      }
      return Object.assign(asked, { opened: true, list, seen, status: statusText(), error: document.getElementById('status-msg').classList.contains('error-msg'), removed: !input.isConnected });
    } finally { HTMLInputElement.prototype.click = original; }
  }
  // Remplace la réponse de la fenêtre « Enregistrer / Abandonner / Annuler » le temps de `fn` ; rend les demandes reçues.
  async function withChoose(answer, fn) {
    const before = Dialogs.choose;
    const asked = [];
    Dialogs.choose = async (opts) => { asked.push(opts); return typeof answer === 'function' ? answer(opts) : answer; };
    try { await fn(); } finally { Dialogs.choose = before; }
    return asked;
  }
  // Une grille encore active (le cas d'avant) ne se quitte pas par resetEditor() : son garde-fou refuserait le paragraphe ; « Nouveau document » la quitte comme la personne.
  async function settle(h) { if (GridEditor.isActive()) await leaveGrid(h); }
  // La grille importée par le geste complet : un scénario qui veut seulement lire son résultat (il appelle `settle(h)` en sortant). `onList` : voir importThroughMenu.
  async function importAndRead(h, spec, lang, onList) {
    const bytes = await buildXlsx(spec);
    await settle(h);
    await h.resetEditor();
    const before = I18n.getLang();
    if (lang) I18n.setLang(lang);
    try {
      const out = await importThroughMenu(h, bytes, null, onList);
      return Object.assign(out, { grid: GridEditor.isActive() });
    } finally { if (lang) I18n.setLang(before); }
  }

  const asBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  // --- 1) Le menu --------------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_menu_row_sits_after_new_grid_and_opens_a_chooser_for_xlsx_files_only',
    description: 'Le menu « + » a une ligne « Importer un Excel… » (« Import from Excel… » en anglais) juste après « Nouvelle grille » ; un clic ouvre le sélecteur de fichier réduit aux classeurs .xlsx / .xlsm (un seul fichier) ; « Annuler » dans le sélecteur ne change rien et ne laisse aucun champ caché dans la page.',
    run: async (h) => {
      await h.resetEditor();
      const rows = Array.from(document.querySelectorAll('#v2-new-template-flyout .v2-hover-row')).map(r => r.id);
      const at = rows.indexOf('v2-btn-import-xlsx');
      const row = document.getElementById('v2-btn-import-xlsx');
      const labels = {};
      ['fr', 'en'].forEach((lang) => { const before = I18n.getLang(); I18n.setLang(lang); labels[lang] = row.textContent; I18n.setLang(before); });
      const htmlBefore = Editor.getHTML();
      const inputsBefore = document.querySelectorAll('input[type=file]').length;
      const cancelled = await importThroughMenu(h, null);
      const inputsAfter = document.querySelectorAll('input[type=file]').length;
      const checks = {
        placed: at > 0 && rows[at - 1] === 'v2-btn-new-grid',
        labels: labels.fr === 'Importer un Excel…' && labels.en === 'Import from Excel…',
        chooser: cancelled.opened && /\.xlsx/.test(cancelled.accept) && /\.xlsm/.test(cancelled.accept) && cancelled.accept.includes(XLSX_MIME) && cancelled.multiple === false && cancelled.attached,
        cancelledLeavesNothing: cancelled.removed && inputsAfter === inputsBefore && Editor.getHTML() === htmlBefore && !GridEditor.isActive(),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, rows, labels, cancelled }) };
    },
  });

  // --- 2) La lecture -----------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_reads_a_styled_invoice_cell_by_cell',
    description: 'Une facture comme Excel l\'écrit, importée par le menu : une nouvelle grille de six lignes (1, 4, 4, 3, 4 et 2 cases : les fusions couvrent les autres) ; le titre sur quatre colonnes (orange du thème, gras 14 pt, centré au milieu, traits des cases d\'angle réunis sur la case fusionnée), les titres gras soulignés d\'un trait (le même trait au-dessus de la ligne d\'après), le rouge italique centré, la case sur deux lignes en haut avec son retour à la ligne et sa partie en gras souligné bleu, les montants à droite en euros, la ligne encadrée blanc sur le bleu foncé du thème, la date, le total vert pâle sur trois colonnes avec le résultat de sa formule ; la colonne et la ligne masquées ne viennent pas.',
    run: async (h) => {
      const out = await importAndRead(h, INVOICE());
      try {
      const c = (r, k) => cellAt(r, k);
      const title = c(0, 0), ref = c(1, 0), qty = c(1, 2), code = c(2, 0), vis = c(2, 1), n1 = c(2, 2), price = c(2, 3), second = c(3, 0), boxed = c(4, 0), box3 = c(4, 2), date = c(4, 3), total = c(5, 0), sum = c(5, 3);
      const text = doc().textContent;
      const checks = {
        imported: out.opened && out.grid && !out.error && /6 lignes, 4 colonnes/.test(out.status),
        shape: shape() === '1,4,4,3,4,2' && doc().childCount >= 1,
        title: title.text === 'Facture Alpha' && title.colspan === 4 && title.fill === '#ffc000' && title.align === 'center' && title.valign === 'middle' && title.marks.includes('bold') && title.marks.includes('14pt') && title.borders === '#000000,#000000,.,#000000',
        heads: ref.text === 'Réf' && ref.marks === 'bold' && ref.borders === '.,.,#000000,.' && qty.align === 'right' && qty.text === 'Qté',
        sharedEdge: code.borders.split(',')[0] === '#000000' && code.text === 'A-1' && code.align === 'center' && code.marks.includes('italic') && code.marks.includes('textStyle:#c00000'),
        multiline: vis.text === 'Vis à bois|zinguée 4x40' && vis.rowspan === 2 && vis.valign === 'top' && vis.marks.includes('bold') && vis.marks.includes('underline') && vis.marks.includes('textStyle:#0070c0'),
        numbers: n1.text === '2' && n1.align === 'right' && price.text === '12,50 €' && price.align === 'right' && second.text === 'A-2',
        boxed: boxed.text === 'Visible ?' && boxed.fill === '#2f5597' && boxed.marks.includes('bold') && boxed.marks.includes('textStyle:#ffffff') && boxed.borders === '#000000,#000000,#000000,#000000' && box3.fill === '#2f5597',
        date: date.text === '03/10/2026' && date.align === 'right' && date.borders === '.,.,.,#000000',
        total: total.text === 'Total' && total.colspan === 3 && total.fill === '#e2efda' && total.align === 'right' && total.marks === 'bold' && sum.text === '20,50 €' && sum.fill === '#e2efda',
        hiddenLeftOut: !/caché|cachée/.test(text),
        sizes: colWidths() === '80,215,61,103' && rowHeights() === '37,20,60,20,20,20',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, out: { status: out.status, error: out.error }, title, ref, code, vis, boxed, date, total, widths: colWidths(), heights: rowHeights() }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_writes_the_text_excel_shows_in_the_language_of_the_widget',
    description: 'Excel ne garde que 12,5 et 46298 : le texte vient du format de la case et de la langue du widget. En français : « 12,50 € », « 03/10/2026 », « 1234,5 », « VRAI » ; en anglais : « 12.50 € », « 10/3/2026 », « 1234.5 », « TRUE » ; le texte d\'une formule est son résultat enregistré, jamais la formule.',
    run: async (h) => {
      try {
        const cellsOf = () => [0, 2, 4, 6, 7, 8].map(i => cellAt(0, i).text);
        await importAndRead(h, KINDS(), 'fr');
        const frCells = cellsOf();
        const frInvoice = await importAndRead(h, INVOICE(), 'fr');
        const frPrice = cellAt(2, 3).text;
        await importAndRead(h, KINDS(), 'en');
        const enCells = cellsOf();
        const enInvoice = await importAndRead(h, INVOICE(), 'en');
        const enPrice = cellAt(2, 3).text;
        const enDate = cellAt(4, 3).text;
        const checks = {
          fr: frCells.join('|') === '1234,5|VRAI|1234,5|1234,5Texte|2469|03/10/2026' && frPrice === '12,50 €',
          en: enCells.join('|') === '1234.5|TRUE|1234.5|1234,5Texte|2469|10/3/2026' && enPrice === '12.50 €' && enDate === '10/3/2026', // le texte d'une formule est son résultat enregistré, tel quel
          statusInLanguage: /^Excel imported: 6 rows, 4 columns\./.test(enInvoice.status) && /^Excel importé : 6 lignes, 4 colonnes\./.test(frInvoice.status),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, frCells, enCells, frPrice, enPrice, enStatus: enInvoice.status }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_alignments_follow_what_excel_writes_and_its_standard_rules',
    description: 'Sans alignement écrit, Excel met les nombres et les dates à droite, les booléens et les erreurs au centre, le texte à gauche ; un alignement écrit (à gauche, à droite, au centre) l\'emporte, même sur un nombre. En hauteur : en haut et en bas quand le classeur les écrit, au milieu sinon (celui de la grille : toujours écrit sur chaque case).',
    run: async (h) => {
      try {
        await importAndRead(h, KINDS());
        const aligns = Array.from({ length: 14 }, (_, i) => cellAt(0, i).align || 'left').join(',');
        const valigns = Array.from({ length: 14 }, (_, i) => cellAt(0, i).valign).join(',');
        const checks = {
          aligns: aligns === 'right,left,center,center,left,right,left,right,right,left,left,left,left,center',
          valigns: valigns === 'middle,middle,middle,middle,middle,middle,middle,middle,middle,top,bottom,middle,middle,middle',
          error: cellAt(0, 3).text === '#DIV/0!',
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, aligns, valigns }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_hidden_sheets_rows_and_columns_are_left_out_and_the_status_names_the_sheet',
    description: 'Une feuille masquée n\'est pas proposée (la liste ne montre que « Devis » et « Autre ») ; la feuille choisie est lue : une ligne et une colonne masquées ne viennent pas, une fusion qui les enjambe se réduit aux cases visibles ; avec plusieurs feuilles le coin d\'état donne le nom de la feuille lue, son rang parmi les feuilles proposées et dit que les autres ne le sont pas.',
    run: async (h) => {
      const spec = {
        sheets: [
          { name: 'Brouillon', state: 'hidden', rows: [['secret']] },
          { name: 'Devis', rows: [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h'], ['i', 'j', 'k', 'l']], cols: [{ min: 2, max: 2, hidden: true }], rowMeta: { 2: { hidden: true } }, merges: ['A1:C1'] },
          { name: 'Autre', rows: [['z']] },
        ],
      };
      try {
        const out = await importAndRead(h, spec, null, async () => { clickSheet('Devis'); return {}; });
        const text = doc().textContent;
        const checks = {
          offered: out.list && out.list.rows.join('|') === 'Devis|Autre',
          sheet: out.opened && out.grid && !out.error && /Devis/.test(out.status) && /1 sur 2/.test(out.status) && /Les autres ne le sont pas/.test(out.status),
          shape: shape() === '2,3',
          merged: cellAt(0, 0).text === 'a' && cellAt(0, 0).colspan === 2 && cellAt(0, 2).text === 'd',
          row3: [cellAt(1, 0).text, cellAt(1, 1).text, cellAt(1, 2).text].join('') === 'ikl',
          onlyVisible: text.replace(/\s/g, '') === 'adikl',
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, status: out.status, list: out.list, text, shape: shape() }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_column_widths_and_row_heights_follow_the_workbook',
    description: 'Largeur d\'une colonne d\'Excel (en caractères) × 7 + 5 pixels, hauteur d\'une ligne en points ÷ 0,75 ; une colonne sans largeur écrite prend la largeur par défaut de la feuille (10 caractères : 75 px), une ligne celle de la feuille (30 pt : 40 px) ; une colonne plus étroite qu\'une colonne de grille (24 px) s\'arrête là.',
    run: async (h) => {
      const spec = { sheets: [{ name: 'Tailles', defaultColWidth: 10, defaultRowHeight: 30, cols: [{ min: 2, max: 2, width: 20 }, { min: 3, max: 3, width: 1 }], rowMeta: { 2: { ht: 12 } }, rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']] }] };
      try {
        await importAndRead(h, spec);
        const checks = { widths: colWidths() === '75,145,24', heights: rowHeights() === '40,16,40' };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, widths: colWidths(), heights: rowHeights() }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_links_keep_safe_addresses_only',
    description: 'Une case avec un lien Excel garde son lien (https, mailto) ; un lien qui n\'est pas une adresse sûre (`javascript:`) garde son texte sans lien.',
    run: async (h) => {
      const spec = { sheets: [{ name: 'Liens', rows: [['Site'], ['Mail'], ['Piège'], ['Texte seul']], links: [{ ref: 'A1', url: 'https://example.org/page' }, { ref: 'A2', url: 'mailto:antoine@example.org' }, { ref: 'A3', url: 'javascript:alert(1)' }] }] };
      try {
      await importAndRead(h, spec);
      const cells = [0, 1, 2, 3].map(r => cellAt(r, 0));
      // Le HTML que l'import remet à l'éditeur : l'éditeur refuse de toute façon un lien `javascript:`, l'import ne doit pas le lui transmettre (deux garde-fous, un seul visible dans l'éditeur).
      const html = (await GridXlsxImport.fromArrayBuffer(asBuffer(await buildXlsx(spec)), { lang: 'fr' })).html;
      const checks = {
        site: cells[0].text === 'Site' && cells[0].href === 'https://example.org/page',
        mail: cells[1].text === 'Mail' && cells[1].href === 'mailto:antoine@example.org',
        unsafe: cells[2].text === 'Piège' && cells[2].href === null,
        plain: cells[3].text === 'Texte seul' && cells[3].href === null,
        htmlKeepsSafeLinks: html.includes('href="https://example.org/page"') && html.includes('href="mailto:antoine@example.org"'),
        htmlDropsUnsafeLink: !/javascript:/i.test(html) && html.includes('Piège'),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, cells }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridImport_rows_covered_by_merges_stay_and_keep_their_height',
    description: 'Deux fusions verticales qui couvrent trois lignes entières : la grille garde les trois lignes (les deux dernières sans case), leurs hauteurs (20, 40 et 20 px) et reste une grille valable, comme quand on fusionne à la main.',
    run: async (h) => {
      const spec = { sheets: [{ name: 'Couvert', merges: ['A1:A3', 'B1:B3'], rowMeta: { 2: { ht: 30 } }, rows: [['gauche', 'droite'], [null, null], ['x', 'y']] }] };
      try {
      const out = await importAndRead(h, spec);
      const checks = { imported: out.opened && out.grid && !out.error, shape: shape() === '2,0,0', heights: rowHeights() === '20,40,20', merged: cellAt(0, 0).rowspan === 3 && cellAt(0, 1).rowspan === 3 && cellAt(0, 0).text === 'gauche' && cellAt(0, 1).text === 'droite', stillGrid: GridEditor.isActive() && doc().childCount >= 1 };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, shape: shape(), heights: rowHeights() }) };
      } finally { await settle(h); }
    },
  });

  // --- 3) Une grille qui arrive prête -------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_cells_arrive_ready_so_the_editor_corrects_nothing_one_cell_at_a_time',
    description: 'Sans alignement vertical écrit, ou avec un trait d\'un seul côté (Excel n\'écrit souvent que le droit et le bas), l\'éditeur corrigeait chaque case par une transaction à part : 1 200 cases = 1 200 pas et des minutes pour un gros classeur (20 000 cases : 120 s). L\'import écrit l\'alignement du milieu sur chaque case et met les traits partagés d\'accord : l\'éditeur ne pose qu\'une ou deux transactions d\'un seul pas, et la case voisine d\'un trait écrit d\'un seul côté porte déjà ce trait.',
    run: async (h) => {
      const body = Array.from({ length: 119 }, (_, r) => Array.from({ length: 10 }, (_, c) => ({ v: 'L' + r + 'C' + c, s: 1 })));
      const spec = {
        borders: ['<border><left/><right/><top/><bottom/><diagonal/></border>', `<border><left/>${THIN('right')}<top/>${THIN('bottom')}<diagonal/></border>`],
        xfs: [{}, { borderId: 1 }],
        sheets: [{ name: 'Gros', rows: [Array.from({ length: 10 }, (_, c) => ({ v: 'T' + c, s: 1 })), ...body] }],
      };
      const bytes = await buildXlsx(spec);
      await settle(h);
      const imported = await GridXlsxImport.fromArrayBuffer(asBuffer(bytes), { lang: 'fr' });
      const cell = (r, k) => imported.model.rows[r].cells[k];
      const modelResolved = cell(1, 1).borders.left === '#000000' && cell(1, 1).borders.top === '#000000' && cell(1, 1).valign === 'middle';
      await h.resetEditor();
      GridEditor.setActive(false);
      let steps;
      try {
        steps = await recordSteps(async () => { Editor.setHTML(imported.html); GridEditor.setActive(true); await sleep(400); });
      } finally { GridEditor.setActive(false); Editor.setHTML('<p></p>'); }
      const biggest = Math.max.apply(null, steps);
      const checks = { modelResolved, fewTransactions: steps.length <= 6 && biggest <= 2, shape: imported.rows === 120 && imported.cols === 10 };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, steps: steps.slice(0, 12), biggest }) };
    },
  });

  cases.push({
    id: 'gridImport_a_wide_sheet_keeps_its_column_widths_coming_from_a_document_and_when_reopened',
    description: 'Un classeur de 20 colonnes de 64 px (1 280 px) importé depuis un document en Aperçu A4 : les colonnes gardent leur largeur (elles arrivaient à 36 px : la grille était rognée à la largeur d\'une page avant que la classe `a4-preview` ne sorte, une transaction par case en prime) ; enregistrée puis rouverte depuis un document, la grille garde encore ses largeurs.',
    run: async (h) => {
      const rows = Array.from({ length: 10 }, (_, r) => Array.from({ length: 20 }, (_, c) => 'R' + r + 'C' + c));
      const bytes = await buildXlsx({ sheets: [{ name: 'Large', rows }] });
      const editorBox = document.getElementById('editor-container');
      const readerBox = document.getElementById('reader-container');
      const a4 = on => { editorBox.classList.toggle('a4-preview', on); readerBox.classList.toggle('a4-preview', on); };
      await h.resetEditor();
      a4(true);
      let imported = null;
      let steps = [];
      let saved = null;
      let reopened = null;
      try {
        steps = await recordSteps(async () => { imported = await importThroughMenu(h, bytes); });
        const widths = colWidths();
        const keptOnImport = widths === Array(20).fill(64).join(',');
        const a4AfterImport = editorBox.classList.contains('a4-preview');
        document.getElementById('template-name').value = 'Grille large (test d\'import)';
        await h.clickButton('btn-save');
        await sleep(600);
        saved = Templates.getCurrentId();
        await leaveGrid(h);
        a4(true);
        const select = document.getElementById('template-select');
        select.value = String(saved);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(600);
        reopened = { active: GridEditor.isActive(), widths: colWidths(), a4: editorBox.classList.contains('a4-preview') };
        const biggest = Math.max.apply(null, steps);
        const checks = {
          imported: imported.opened && !imported.error && /10 lignes, 20 colonnes/.test(imported.status),
          keptOnImport, noMassTransaction: biggest <= 2, noA4Class: !a4AfterImport,
          reopenedKeepsWidths: !!saved && reopened.active && reopened.widths === widths && !reopened.a4,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, widths, biggest, reopened }) };
      } finally { await leaveGrid(h); a4(false); }
    },
  });

  // --- 4) Les erreurs ----------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_errors_say_why_in_french_and_english_and_change_nothing',
    description: 'Un .xls (ou un classeur protégé par un mot de passe), un fichier qui n\'est pas un classeur, un classeur sans aucune case, une feuille de 1 001 lignes, de 101 colonnes ou de plus de 5 000 cases : chaque cas dit pourquoi dans le coin d\'état (en rouge, avec les chiffres et les limites), dans la langue du widget, sans ouvrir de question et sans toucher au document ; une feuille de 1 000 lignes et 5 cases (5 000) passe.',
    run: async (h) => {
      const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
      await ExportCommon.ensureJsZipLoaded();
      const notAWorkbook = await (async () => { const z = new JSZip(); z.file('bonjour.txt', 'pas un classeur'); return z.generateAsync({ type: 'uint8array' }); })();
      const rows = (n, cols) => Array.from({ length: n }, (_, r) => Array.from({ length: cols }, (_, c) => 'x' + r + c));
      const cases2 = {
        old: ole,
        garbage: new Uint8Array([1, 2, 3, 4, 5, 6]),
        zip: notAWorkbook,
        empty: await buildXlsx({ sheets: [{ name: 'Vide', rows: [] }] }),
        tooManyRows: await buildXlsx({ sheets: [{ name: 'Long', rows: rows(1001, 1) }] }),
        tooManyCols: await buildXlsx({ sheets: [{ name: 'Large', rows: rows(1, 101) }] }),
        tooManyCells: await buildXlsx({ sheets: [{ name: 'Dense', rows: rows(100, 60) }] }),
      };
      const results = {};
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      ed().chain().focus('end').insertContent(' modifié').run(); // une modification attend : si un fichier illisible posait la question, elle serait comptée
      await sleep(150);
      const htmlBefore = Editor.getHTML();
      const prompts = await withChoose('discard', async () => {
        for (const key of Object.keys(cases2)) { results[key] = await importThroughMenu(h, cases2[key]); }
        const before = I18n.getLang();
        I18n.setLang('en');
        try { results.oldEn = await importThroughMenu(h, ole); results.tooManyRowsEn = await importThroughMenu(h, cases2.tooManyRows); } finally { I18n.setLang(before); }
      });
      const unchanged = Editor.getHTML() === htmlBefore && !GridEditor.isActive();
      // la limite passe : 1 000 lignes de 5 cases, lues sans les charger dans l'éditeur
      const edge = await GridXlsxImport.fromArrayBuffer(asBuffer(await buildXlsx({ sheets: [{ name: 'Limite', rows: rows(1000, 5) }] })), { lang: 'fr' });
      const r = results;
      const checks = {
        old: r.old.error && /\.xls/.test(r.old.status) && /mot de passe/.test(r.old.status),
        garbage: r.garbage.error && /n’est pas un classeur Excel/.test(r.garbage.status),
        zip: r.zip.error && /n’est pas un classeur Excel/.test(r.zip.status),
        empty: r.empty.error && /aucune case/.test(r.empty.status),
        rows: r.tooManyRows.error && /1001 lignes et 1 colonne/.test(r.tooManyRows.status) && /1000 lignes, 100 colonnes et 5000 cases/.test(r.tooManyRows.status),
        cols: r.tooManyCols.error && /1 ligne et 101 colonnes/.test(r.tooManyCols.status),
        cells: r.tooManyCells.error && /100 lignes et 60 colonnes/.test(r.tooManyCells.status),
        english: r.oldEn.error && /password-protected/.test(r.oldEn.status) && r.tooManyRowsEn.error && /1001 rows and 1 column/.test(r.tooManyRowsEn.status) && /at most 1000 rows, 100 columns and 5000 cells/.test(r.tooManyRowsEn.status),
        noQuestion: prompts.length === 0,
        unchanged,
        edge: edge.rows === 1000 && edge.cols === 5,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, statuses: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status])), prompts: prompts.length }) };
    },
  });

  // --- 5) Le geste complet ------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_asks_before_leaving_unsaved_work_but_only_once_the_file_is_read',
    description: 'Un document dont une modification attend d\'être enregistrée : la question « Enregistrer / Abandonner / Annuler » n\'est posée qu\'APRÈS la lecture du classeur (un fichier illisible ne coûte rien) ; « Annuler » garde le document, « Abandonner » le remplace par la grille importée.',
    run: async (h) => {
      const good = await buildXlsx(INVOICE());
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      ed().chain().focus('end').insertContent(' modifié').run(); // une vraie frappe : c'est elle qui met une modification en attente
      await sleep(150);
      const results = {};
      const askedUnreadable = await withChoose(null, async () => { results.unreadable = await importThroughMenu(h, new Uint8Array([1, 2, 3])); });
      const textAfterUnreadable = doc().textContent;
      const askedCancel = await withChoose(null, async () => { results.cancel = await importThroughMenu(h, good); });
      const textAfterCancel = doc().textContent;
      const gridAfterCancel = GridEditor.isActive();
      const askedDiscard = await withChoose('discard', async () => { results.discard = await importThroughMenu(h, good); });
      const checks = {
        unreadableAsksNothing: askedUnreadable.length === 0 && results.unreadable.error && textAfterUnreadable === 'Mon document modifié',
        cancelAsksOnce: askedCancel.length === 1 && textAfterCancel === 'Mon document modifié' && !gridAfterCancel,
        discardImports: askedDiscard.length === 1 && GridEditor.isActive() && /6 lignes, 4 colonnes/.test(results.discard.status) && cellAt(0, 0).text === 'Facture Alpha',
      };
      await leaveGrid(h);
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, asked: [askedUnreadable.length, askedCancel.length, askedDiscard.length], status: results.discard.status }) };
    },
  });

  cases.push({
    id: 'gridImport_result_is_a_new_unsaved_unnamed_grid_that_saves_like_any_other',
    description: 'La grille importée est un NOUVEAU modèle de type grille, sans nom et pas encore enregistré (aucun modèle de la liste n\'est écrasé) ; elle compte comme une modification en attente (quitter pose la question) ; on la nomme, Enregistrer l\'écrit avec son contenu et son type.',
    run: async (h) => {
      const bytes = await buildXlsx(INVOICE());
      await h.resetEditor();
      const out = await importThroughMenu(h, bytes);
      const select = document.getElementById('template-select');
      const state = { selected: select.value, name: document.getElementById('template-name').value, id: Templates.getCurrentId(), grid: GridEditor.isActive() };
      // quitter maintenant poserait la question (une modification attend)
      const asked = await withChoose(null, async () => { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(200); });
      const stillThere = GridEditor.isActive() && cellAt(0, 0) && cellAt(0, 0).text === 'Facture Alpha';
      document.getElementById('template-name').value = 'Facture importée (test d\'import)';
      await h.clickButton('btn-save');
      await sleep(700);
      const id = Templates.getCurrentId();
      const record = Templates.getCached().find(t => String(t.id) === String(id));
      const checks = {
        imported: out.opened && !out.error,
        unsaved: state.selected === '' && state.name === '' && state.id === null && state.grid,
        asksBeforeLeaving: asked.length === 1 && stillThere,
        saved: !!record && record.typeModele === 'grille' && /Facture Alpha/.test(record.contenu) && /colspan="4"/.test(record.contenu) && record.nom === 'Facture importée (test d\'import)',
      };
      await leaveGrid(h);
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, state, asked: asked.length, type: record && record.typeModele }) };
    },
  });

  cases.push({
    id: 'gridImport_read_only_does_nothing',
    description: 'En lecture seule (droits par personne) la ligne du menu n\'ouvre aucun sélecteur et ne change rien.',
    run: async (h) => {
      await h.resetEditor();
      const real = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
      let out;
      try { out = await importThroughMenu(h, await buildXlsx(INVOICE())); } finally { AccessRights.get = real; }
      return { pass: out.opened === false && !GridEditor.isActive(), notes: JSON.stringify(out) };
    },
  });

  // --- 6) Aller-retour avec l'export ----------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridImport_round_trip_with_the_excel_export_keeps_the_grid',
    description: 'Une grille exportée par js/xlsx-export.js puis importée donne la même grille : mêmes textes, cases fusionnées, largeurs de colonnes et hauteurs de lignes, fonds, traits, alignements, gras.',
    run: async (h) => {
      const TABLE = 'GrilleAllerRetour';
      const RECORD = { id: 1 };
      await h.resetEditor();
      window.__gristStub.setVariables(TABLE, { Nom: 'Text' });
      window.__gristStub.setRows(TABLE, [RECORD]);
      await GristAPI.refreshSchema();
      const html = '<table style="width: 450px;"><colgroup><col style="width: 120px;"><col style="width: 90px;"><col style="width: 160px;"><col style="width: 80px;"></colgroup><tbody>'
        + '<tr data-row-height="40" style="height: 40px"><td colspan="2" colwidth="120,90" data-valign="middle" data-border-top="#000000" data-border-left="#000000" data-border-bottom="#000000" style="background-color: #ffc000"><p style="text-align: center"><strong>Titre</strong></p></td>'
        + '<td colwidth="160" data-valign="top"><p>Texte à gauche</p></td><td colwidth="80" data-valign="bottom" data-border-right="#ff0000"><p style="text-align: right">1 234,50</p></td></tr>'
        + '<tr data-row-height="30" style="height: 30px"><td colwidth="120" data-valign="middle" style="background-color: #e2efda"><p>Réf</p></td><td rowspan="2" colwidth="90" data-valign="middle"><p>Fusion verticale</p></td><td colwidth="160" data-valign="middle"><p style="text-align: center">centré</p></td><td colwidth="80" data-valign="middle"><p>fin</p></td></tr>'
        + '<tr data-row-height="50" style="height: 50px"><td colwidth="120" data-valign="middle"><p>A-2</p></td><td colwidth="160" data-valign="middle"><p>suite</p></td><td colwidth="80" data-valign="middle"><p>.</p></td></tr>'
        + '</tbody></table>';
      await loadGrid(html);
      const before = { shape: shape(), widths: colWidths(), heights: rowHeights() };
      const keys = [[0, 0], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 2], [2, 3]];
      const read = () => keys.map(([r, c]) => { const x = cellAt(r, c); return [x.text, x.colspan, x.rowspan, x.fill, x.valign, x.borders, x.align, x.marks].join('/'); });
      const original = read();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(Editor.getHTML(), TABLE, RECORD, '');
      const imported = await GridXlsxImport.fromArrayBuffer(await blob.arrayBuffer(), { lang: 'fr' });
      await loadGrid(imported.html);
      const after = { shape: shape(), widths: colWidths(), heights: rowHeights() };
      const again = read();
      const diffs = original.map((x, i) => (x === again[i] ? null : { key: keys[i].join(','), before: x, after: again[i] })).filter(Boolean);
      GridEditor.setActive(false);
      Editor.setHTML('<p></p>');
      const checks = { shape: before.shape === after.shape, widths: before.widths === after.widths, heights: before.heights === after.heights, cells: diffs.length === 0 };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, before, after, diffs }) };
    },
  });

  // --- 7) Plusieurs feuilles : la liste des feuilles --------------------------------------------------------------------------------------------------------------------------------
  // Choix d'Antoine du 02/10 (« Choisir la feuille à importer quand un classeur Excel en a plusieurs ? » - « Oui, une liste ») : un classeur qui a plusieurs feuilles VISIBLES demande laquelle
  // devient la grille, par la liste avec recherche de toutes les listes du widget ; une seule feuille visible s'importe sans rien demander, comme avant.

  // Trois feuilles visibles (une masquée au milieu), chacune avec son texte : la liste propose les visibles, dans l'ordre d'Excel.
  const THREE = () => ({
    sheets: [
      { name: 'Devis', rows: [['Devis Alpha', 'HT'], ['Vis', 12]] },
      { name: 'Brouillon', state: 'hidden', rows: [['secret']] },
      { name: 'Détails des lignes', rows: [['Détails'], ['ligne 1'], ['ligne 2']] },
      { name: 'Récapitulatif annuel', rows: [['Récap']] },
    ],
  });

  cases.push({
    id: 'gridImport_several_visible_sheets_open_a_searchable_list_and_the_chosen_one_becomes_the_grid',
    description: 'Un classeur qui a plusieurs feuilles visibles ouvre, une fois lu, la liste avec recherche des feuilles : leurs noms dans l\'ordre d\'Excel, sans la feuille masquée, la zone de recherche prête sous le focus (« Rechercher une feuille… », « Search for a sheet… » en anglais), dans le panneau ; rien n\'est encore importé et le coin d\'état n\'annonce plus une lecture (elle est finie) ; « detail » ne garde que « Détails des lignes » (accents et casse ignorés), « zzz » dit « Aucune feuille ne correspond. » ; un clic sur une ligne (ou la recherche puis Entrée, en anglais) en fait la grille, et le coin d\'état dit laquelle et son rang parmi les feuilles proposées ; la liste ne laisse rien dans la page.',
    run: async (h) => {
      const bytes = await buildXlsx(THREE());
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      const seen = {};
      await withChoose('discard', async () => {
        seen.fr = await importThroughMenu(h, bytes, null, async (first) => {
          const out = { first, statusWhileOpen: statusText(), gridWhileOpen: GridEditor.isActive(), textWhileOpen: doc().textContent };
          typeInList('DETAIL');
          await sleep(100);
          out.detail = sheetList();
          typeInList('zzz');
          await sleep(100);
          out.zzz = sheetList();
          typeInList('');
          await sleep(100);
          out.cleared = sheetList();
          clickSheet('Détails des lignes');
          return out;
        });
      });
      const frGrid = { active: GridEditor.isActive(), shape: shape(), first: GridEditor.isActive() && cellAt(0, 0).text, last: GridEditor.isActive() && cellAt(2, 0).text };
      const leftFr = !!document.getElementById('v2-xlsx-sheet-search');
      await settle(h);
      await h.resetEditor();
      const before = I18n.getLang();
      I18n.setLang('en');
      try {
        seen.en = await importThroughMenu(h, bytes, null, async (first) => {
          const out = { first };
          typeInList('recap');
          await sleep(100);
          out.recap = sheetList();
          typeInList('zzz');
          await sleep(100);
          out.zzz = sheetList();
          typeInList('recap');
          await sleep(100);
          keyInList('Enter');
          return out;
        });
      } finally { I18n.setLang(before); }
      const enGrid = { active: GridEditor.isActive(), text: GridEditor.isActive() && cellAt(0, 0).text };
      const leftEn = !!document.getElementById('v2-xlsx-sheet-search');
      await settle(h);
      const fr = seen.fr, en = seen.en;
      const checks = {
        namesInOrder: fr.list.rows.join('|') === 'Devis|Détails des lignes|Récapitulatif annuel',
        searchReady: fr.list.focused && fr.list.placeholder === 'Rechercher une feuille…' && fr.list.search === '' && fr.list.inPanel,
        nothingYet: fr.seen.gridWhileOpen === false && fr.seen.textWhileOpen === 'Mon document',
        statusWhileOpen: fr.seen.statusWhileOpen === '',
        accentsAndCaseIgnored: fr.seen.detail.rows.join('|') === 'Détails des lignes' && fr.seen.detail.search === 'DETAIL',
        noMatch: fr.seen.zzz.rows.length === 0 && fr.seen.zzz.emptyShown === 'Aucune feuille ne correspond.',
        clearedAgain: fr.seen.cleared.rows.length === 3,
        chosenBecomesTheGrid: frGrid.active && frGrid.shape === '1,1,1' && frGrid.first === 'Détails' && frGrid.last === 'ligne 2',
        statusNamesIt: !fr.error && /^Feuille « Détails des lignes » \(2 sur 3\) importée : 3 lignes, 1 colonne\. Les autres ne le sont pas\.$/.test(fr.status),
        leftNothing: !leftFr && !leftEn,
        english: en.list.placeholder === 'Search for a sheet…' && en.seen.recap.rows.join('|') === 'Récapitulatif annuel' && en.seen.zzz.emptyShown === 'No sheet matches.',
        enterPicks: enGrid.active && enGrid.text === 'Récap' && !en.error && /^Sheet “Récapitulatif annuel” \(3 of 3\) imported: 1 row, 1 column\. The others are not\.$/.test(en.status),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, fr: { list: fr.list, seen: fr.seen, status: fr.status }, en: { list: en.list, status: en.status }, frGrid, enGrid }) };
    },
  });

  cases.push({
    id: 'gridImport_closing_the_sheet_list_without_choosing_changes_nothing_and_asks_nothing',
    description: 'Échap, ou un clic ailleurs, referme la liste des feuilles sans rien importer : le document (même modifié et pas enregistré) reste tel quel, aucune grille, aucune question « Enregistrer / Abandonner / Annuler », le coin d\'état redit l\'état du modèle (ni « Lecture du classeur… » ni une erreur d\'import), la liste ne laisse rien dans la page ; après Échap le focus est dans le texte du document, après un clic ailleurs il reste où la personne a cliqué.',
    run: async (h) => {
      const bytes = await buildXlsx(THREE());
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      ed().chain().focus('end').insertContent(' modifié').run(); // une modification attend : fermer la liste ne doit pas poser la question
      await sleep(300);
      const baseline = { text: statusText(), error: document.getElementById('status-msg').classList.contains('error-msg') };
      const htmlBefore = Editor.getHTML();
      const probe = document.createElement('button'); // « ailleurs » : un champ où la personne vient de cliquer
      probe.textContent = 'ailleurs';
      document.body.appendChild(probe);
      const results = {};
      let asked;
      try {
        asked = await withChoose('discard', async () => {
          results.escape = await importThroughMenu(h, bytes, null, async () => { keyInList('Escape'); return { cancel: true }; });
          results.escapeFocus = !!document.activeElement && !!document.activeElement.closest('.tiptap');
          results.escapeStatus = { text: statusText(), error: document.getElementById('status-msg').classList.contains('error-msg') };
          results.outside = await importThroughMenu(h, bytes, null, async () => { probe.focus(); return { cancel: true }; });
          results.outsideFocus = document.activeElement === probe;
          results.outsideStatus = { text: statusText(), error: document.getElementById('status-msg').classList.contains('error-msg') };
        });
      } finally { probe.remove(); }
      const sameAsBaseline = st => st.text === baseline.text && st.error === baseline.error;
      const checks = {
        baselineSaysSomething: baseline.text !== '', // sinon « le coin d'état redit l'état » ne se distinguerait pas du coin vidé pendant la liste
        listOpened: !!results.escape.list && !!results.outside.list,
        noQuestion: asked.length === 0,
        documentKept: Editor.getHTML() === htmlBefore && !GridEditor.isActive(),
        statusRestored: sameAsBaseline(results.escapeStatus) && sameAsBaseline(results.outsideStatus),
        leftNothing: !document.getElementById('v2-xlsx-sheet-search') && !sheetPanel(),
        escapeFocusInText: results.escapeFocus,
        outsideFocusKept: results.outsideFocus,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, baseline, escapeStatus: results.escapeStatus, outsideStatus: results.outsideStatus, asked: asked.length }) };
    },
  });

  cases.push({
    id: 'gridImport_one_visible_sheet_imports_straight_away_without_a_list',
    description: 'Un classeur dont une seule feuille est visible (les autres masquées), ou dont toutes sont masquées (la première est prise), s\'importe tout de suite : aucune liste, le message de fin est celui d\'une feuille unique (« Excel importé… ») ; un classeur d\'une seule feuille aussi.',
    run: async (h) => {
      const specs = {
        oneVisible: { sheets: [{ name: 'Brouillon', state: 'hidden', rows: [['secret']] }, { name: 'Seule', rows: [['visible', 'ici']] }] },
        allHidden: { sheets: [{ name: 'Premier', state: 'hidden', rows: [['un']] }, { name: 'Second', state: 'hidden', rows: [['deux']] }] },
        single: { sheets: [{ name: 'Unique', rows: [['solo']] }] },
      };
      const out = {};
      try {
        for (const key of Object.keys(specs)) {
          out[key] = await importAndRead(h, specs[key]);
          out[key].text = doc().textContent;
        }
      } finally { await settle(h); }
      const checks = {
        oneVisible: out.oneVisible.list === null && out.oneVisible.grid && !out.oneVisible.error && out.oneVisible.text === 'visibleici' && /^Excel importé : 1 ligne, 2 colonnes\./.test(out.oneVisible.status),
        allHiddenTakesTheFirst: out.allHidden.list === null && out.allHidden.grid && out.allHidden.text === 'un' && /^Excel importé : 1 ligne, 1 colonne\./.test(out.allHidden.status),
        single: out.single.list === null && out.single.grid && out.single.text === 'solo' && /^Excel importé/.test(out.single.status),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, statuses: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.status])) }) };
    },
  });

  cases.push({
    id: 'gridImport_the_unsaved_work_question_comes_after_the_sheet_is_chosen',
    description: 'Un document dont une modification attend d\'être enregistrée et un classeur à plusieurs feuilles : la liste des feuilles s\'ouvre d\'abord, la question « Enregistrer / Abandonner / Annuler » n\'est posée qu\'APRÈS le choix de la feuille ; « Annuler » garde le document, « Abandonner » le remplace par la grille de la feuille choisie.',
    run: async (h) => {
      const bytes = await buildXlsx(THREE());
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      ed().chain().focus('end').insertContent(' modifié').run();
      await sleep(150);
      let questions = 0;
      const results = {};
      const answers = ['cancel', 'discard'];
      await withChoose(() => { questions++; return answers.shift(); }, async () => {
        results.cancel = await importThroughMenu(h, bytes, null, async () => { const out = { questionsBefore: questions }; clickSheet('Devis'); return out; });
        results.textAfterCancel = doc().textContent;
        results.gridAfterCancel = GridEditor.isActive();
        results.questionsAfterCancel = questions;
        results.discard = await importThroughMenu(h, bytes, null, async () => { const out = { questionsBefore: questions }; clickSheet('Détails des lignes'); return out; });
      });
      const checks = {
        listFirst: results.cancel.seen.questionsBefore === 0 && results.discard.seen.questionsBefore === 1,
        cancelKeeps: results.questionsAfterCancel === 1 && results.textAfterCancel === 'Mon document modifié' && results.gridAfterCancel === false,
        discardImports: questions === 2 && GridEditor.isActive() && cellAt(0, 0).text === 'Détails' && /^Feuille « Détails des lignes » \(2 sur 3\) importée/.test(results.discard.status),
      };
      await settle(h);
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, questions, statuses: [results.cancel.status, results.discard.status] }) };
    },
  });

  cases.push({
    id: 'gridImport_a_chosen_sheet_that_is_empty_or_too_big_says_so_by_its_name_and_changes_nothing',
    description: 'Dans un classeur à plusieurs feuilles, une feuille vide ou trop grande qu\'on vient de choisir le dit en rouge dans le coin d\'état (« La feuille « Vide » ne contient aucune case à importer. », en anglais aussi) sans rien changer ni rien demander ; un classeur d\'une seule feuille vide garde « Ce classeur ne contient aucune case à importer. ».',
    run: async (h) => {
      const rows = (n, cols) => Array.from({ length: n }, (_, r) => Array.from({ length: cols }, (_, c) => 'x' + r + c));
      const two = await buildXlsx({ sheets: [{ name: 'Devis', rows: [['a']] }, { name: 'Vide', rows: [] }, { name: 'Long', rows: rows(1001, 1) }] });
      const solo = await buildXlsx({ sheets: [{ name: 'Vide', rows: [] }] });
      await settle(h);
      await h.resetEditor();
      Editor.setHTML('<p>Mon document</p>');
      await sleep(150);
      ed().chain().focus('end').insertContent(' modifié').run();
      await sleep(150);
      const htmlBefore = Editor.getHTML();
      const results = {};
      const asked = await withChoose('discard', async () => {
        results.empty = await importThroughMenu(h, two, null, async () => { clickSheet('Vide'); return {}; });
        results.big = await importThroughMenu(h, two, null, async () => { clickSheet('Long'); return {}; });
        results.solo = await importThroughMenu(h, solo);
        const before = I18n.getLang();
        I18n.setLang('en');
        try { results.emptyEn = await importThroughMenu(h, two, null, async () => { clickSheet('Vide'); return {}; }); } finally { I18n.setLang(before); }
      });
      const checks = {
        emptyNamesTheSheet: results.empty.error && results.empty.status === 'La feuille « Vide » ne contient aucune case à importer.',
        tooBigKeepsItsNumbers: results.big.error && /^Cette feuille est trop grande pour une grille : 1001 lignes et 1 colonne/.test(results.big.status),
        singleKeepsTheWorkbookText: results.solo.error && results.solo.status === 'Ce classeur ne contient aucune case à importer.',
        english: results.emptyEn.error && results.emptyEn.status === 'The sheet “Vide” has no cells to import.',
        nothingChanged: asked.length === 0 && Editor.getHTML() === htmlBefore && !GridEditor.isActive(),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, statuses: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status])), asked: asked.length }) };
    },
  });

  cases.push({
    id: 'gridImport_openFile_gives_the_visible_sheets_and_builds_the_one_asked_for',
    description: 'GridXlsxImport.openFile lit le classeur une fois : `sheets` donne les feuilles visibles dans l\'ordre d\'Excel avec leur rang (la masquée n\'y est pas), `build(rang)` rend la grille de celle-là (nom, rang, nombre de feuilles proposées, lignes, colonnes), la même chaque fois ; un classeur dont toutes les feuilles sont masquées n\'en propose qu\'une, la première.',
    run: async (h) => {
      const file = new File([await buildXlsx(THREE())], 'trois.xlsx', { type: XLSX_MIME });
      const book = await GridXlsxImport.openFile(file);
      const a = book.build(0, { lang: 'fr' });
      const b = book.build(1, { lang: 'fr' });
      const c = book.build(2, { lang: 'fr' });
      const again = book.build(0, { lang: 'fr' });
      const hidden = await GridXlsxImport.openFile(new File([await buildXlsx({ sheets: [{ name: 'Premier', state: 'hidden', rows: [['un']] }, { name: 'Second', state: 'hidden', rows: [['deux']] }] })], 'caches.xlsx'));
      const hiddenBuilt = hidden.build(0, { lang: 'fr' });
      const viaImport = await GridXlsxImport.importFile(file, { lang: 'fr', sheetIndex: 2 });
      const checks = {
        sheets: book.sheets.map(x => x.index + ':' + x.name).join('|') === '0:Devis|1:Détails des lignes|2:Récapitulatif annuel',
        first: a.sheetName === 'Devis' && a.sheetIndex === 0 && a.sheetCount === 3 && a.rows === 2 && a.cols === 2,
        second: b.sheetName === 'Détails des lignes' && b.sheetIndex === 1 && b.rows === 3 && b.cols === 1,
        third: c.sheetName === 'Récapitulatif annuel' && c.sheetIndex === 2 && c.rows === 1,
        sameEachTime: again.html === a.html && again.html !== b.html,
        allHidden: hidden.sheets.length === 1 && hidden.sheets[0].name === 'Premier' && hiddenBuilt.sheetName === 'Premier' && hiddenBuilt.sheetCount === 1,
        importFileStillTakesAnIndex: viaImport.sheetName === 'Récapitulatif annuel',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, sheets: book.sheets }) };
    },
  });

  cases.push({
    id: 'gridImport_when_the_sheet_list_cannot_open_the_first_sheet_is_imported_and_named',
    description: 'Si la liste des feuilles ne peut pas s\'ouvrir (composant en panne), la première feuille est importée comme avant la liste et le coin d\'état dit laquelle (« Feuille « Devis » (1 sur 3) importée… ») : la personne n\'est jamais bloquée ; rien ne reste dans la page.',
    run: async (h) => {
      const bytes = await buildXlsx(THREE());
      await settle(h);
      await h.resetEditor();
      const real = SearchSelect.attachSheets;
      const warn = console.warn;
      console.warn = () => {}; // l'échec est voulu : le message d'avertissement du module n'est pas une erreur du scénario
      let out;
      try {
        SearchSelect.attachSheets = () => { throw new Error('liste en panne'); };
        out = await importThroughMenu(h, bytes);
      } finally { SearchSelect.attachSheets = real; console.warn = warn; }
      const checks = {
        imported: out.opened && !out.error && GridEditor.isActive() && cellAt(0, 0).text === 'Devis Alpha',
        named: /^Feuille « Devis » \(1 sur 3\) importée : 2 lignes, 2 colonnes\. Les autres ne le sont pas\.$/.test(out.status),
        leftNothing: !document.getElementById('v2-xlsx-sheet-search'),
      };
      await settle(h);
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, status: out.status }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridImport = cases;
})();
