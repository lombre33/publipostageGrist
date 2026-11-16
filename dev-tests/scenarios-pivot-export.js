// Suite "pivotExport" - le tableau croisé de la grille dans les SORTIES (étude d'Antoine du 12/11, lot 3 ; moteur : js/pivot.js, déroulé : js/pivot-zones.js, testé à la Lecture par `pivotZone`) : le PDF vectoriel, le Word et
// l'Excel d'une ligne écrivent le tableau obtenu comme celui de la Lecture, et un lot (une ligne après l'autre) écrit le tableau de CHAQUE ligne, pas celui de la première.
// Les nombres attendus sont recalculés ICI, à part du moteur, sur les produits du jeu (catégorie = choix, emplacement = référence vers une zone d'entrepôt, stock, prix d'achat).
//  1) le PDF : tous les titres et les valeurs de chaque case, chaque nombre sous le titre de sa colonne, le total général en dernière ligne, une seule page, rien hors de la page ;
//  2) le Word : les rangées du tableau, en-tête et total sur leur fond, le total en gras ; 3) l'Excel : les rangées du tableau dans la feuille, la ligne qui porte le tableau croisé ne laisse rien de son texte ;
//  4) un lot : deux lignes de la page donnent deux tableaux, chacun avec ses lignes liées ; 5) le contrôle d'avant lot dit un tableau croisé qui ne se lit pas (table disparue), sans rien dire pour un tableau lisible.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const CATEGORIES = ['Visserie', 'Électricité', 'Plomberie'];
  const ZONES = ['Réserve', 'Picking', 'Quai'];
  // Les produits du jeu : [id, catégorie, id de l'emplacement, stock, prix d'achat].
  const PRODUCTS = [
    [1, 'Plomberie', 1, 10, 2.5], [2, 'Visserie', 2, 100, 0.12], [3, 'Visserie', 1, 40, 0.3], [4, 'Électricité', 3, 8, 12.99], [5, 'Plomberie', 3, 3, 40],
    [6, 'Visserie', 1, 5, 1], [7, 'Électricité', 1, 20, 3.1], [8, 'Électricité', 3, 2, 70.5], [9, 'Plomberie', 2, 6, 9.9], [10, null, 2, 4, 5],
  ];
  const PRODUCT_ROWS = PRODUCTS.map(([id, Categorie, Emplacement, Stock, PrixAchat]) => ({ id, Categorie: Categorie || '', Emplacement, Stock, PrixAchat, manualSort: id }));
  const ZONE_BY_LOCATION = { 1: 'Réserve', 2: 'Picking', 3: 'Quai' };
  const VALUE = { kind: 'formula', formula: '{PvProduits.Stock} * {PvProduits.PrixAchat}' };
  const DEF = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Categorie'], cols: ['Emplacement.Zone'], value: VALUE, agg: 'sum' };
  const LINKED = Object.assign({}, DEF, { source: { table: 'PvProduits', scope: 'linked' } });

  const attr = def => ` data-pivot="${JSON.stringify(def).replace(/"/g, '&quot;')}"`;
  const cell = (text, tag, extra) => `<${tag || 'td'}${extra || ''}><p>${text}</p></${tag || 'td'}>`;
  // Une grille de quatre colonnes : un titre fusionné, la ligne du tableau croisé (dont le texte n'est jamais lu), une note.
  function gridHtml(def) {
    const w = [120, 90, 90, 90];
    return '<table><tbody>'
      + `<tr><th colspan="4" colwidth="${w.join(',')}"><p><strong>Titre</strong></p></th></tr>`
      + `<tr${attr(def)}>${w.map((width, i) => `<td colwidth="${width}"><p>${i === 0 ? 'texte jamais lu' : ''}</p></td>`).join('')}</tr>`
      + `<tr>${cell('Note du bas')}${cell('')}${cell('')}${cell('')}</tr>`
      + '</tbody></table>';
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('PvEmplacements', { Zone: 'Choice' }, { Zone: ZONES });
    stub.setVariables('PvAtlas', { Nom: 'Text' });
    stub.setVariables('PvProduits', { Categorie: 'Choice', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: CATEGORIES });
    stub.setRows('PvEmplacements', [{ id: 1, Zone: 'Réserve' }, { id: 2, Zone: 'Picking' }, { id: 3, Zone: 'Quai' }]);
    stub.setRows('PvAtlas', [{ id: 1, Nom: 'Atlas Nord' }, { id: 2, Nom: 'Atlas Sud' }]);
    // Les produits d'id pair sont liés à « Atlas Sud », les autres à « Atlas Nord » (la source « liées à la page »).
    stub.setRows('PvProduits', PRODUCT_ROWS.map(r => Object.assign({}, r, { Atlas: r.id % 2 ? 1 : 2 })));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('PvProduits');
    await GristAPI.saveLinkRule('PvProduits', { mode: 'match', colonneCible: 'Atlas', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
    await h.sleep(50);
  }

  // « 1 234,56 € » (espaces insécables, virgule) lu comme un nombre ; null pour un texte vide.
  function toNumber(text) {
    const clean = String(text).replace(/[\s  ]/g, '').replace(/[^0-9,.\-−]/g, '').replace('−', '-').replace(',', '.');
    return clean === '' ? null : Number(clean);
  }
  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Le tableau attendu, recalculé à part du moteur, pour les produits de `products` : { cells[catégorie][zone], rowTotal[catégorie], colTotal[zone], grand }.
  function expected(products) {
    const cells = {}; const rowTotal = {}; const colTotal = {}; let grand = 0;
    products.forEach(([, category, location, stock, price]) => {
      const key = category || '(vide)'; const zone = ZONE_BY_LOCATION[location]; const v = stock * price;
      cells[key] = cells[key] || {}; cells[key][zone] = (cells[key][zone] || 0) + v;
      rowTotal[key] = (rowTotal[key] || 0) + v; colTotal[zone] = (colTotal[zone] || 0) + v; grand += v;
    });
    return { cells, rowTotal, colTotal, grand };
  }
  const ORDER = CATEGORIES.concat('(vide)');
  // Les rangées d'un tableau écrites comme les sorties le doivent : [titre, valeur de chaque zone ('' sans ligne), total] pour chaque catégorie, puis la ligne Total.
  function wantedRows(products) {
    const e = expected(products);
    const rows = ORDER.filter(c => e.cells[c]).map(c => [c].concat(ZONES.map(z => (e.cells[c][z] === undefined ? null : e.cells[c][z])), [e.rowTotal[c]]));
    rows.push(['Total'].concat(ZONES.map(z => e.colTotal[z] || null), [e.grand]));
    return rows;
  }
  // Les rangées lues dans une sortie (titre en texte, le reste en nombres) comparées aux attendues.
  function rowsMatch(read, wanted) {
    if (read.length !== wanted.length) return false;
    return read.every((row, i) => row.length === wanted[i].length && row[0] === wanted[i][0]
      && row.slice(1).every((text, j) => (wanted[i][j + 1] === null ? toNumber(text) === null : near(toNumber(text), wanted[i][j + 1]))));
  }

  const RECORD_NORD = () => ({ id: 1, Nom: 'Atlas Nord' });
  const RECORD_SUD = () => ({ id: 2, Nom: 'Atlas Sud' });

  // Les mots d'un PDF rangés par ligne de texte (même y à 2 pt près) puis de gauche à droite : [{ y, items:[{ str, x, width }] }].
  function pdfLines(page) {
    const items = page.textItems.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    items.forEach(item => {
      const line = lines.find(l => Math.abs(l.y - item.y) <= 2);
      if (line) line.items.push(item); else lines.push({ y: item.y, items: [item] });
    });
    lines.forEach(l => l.items.sort((a, b) => a.x - b.x));
    return lines;
  }
  // Une ligne de PDF découpée en cases : les mots séparés de moins de 6 pt restent dans la même case.
  function pdfCells(line) {
    const cells = [];
    line.items.forEach(item => {
      const last = cells[cells.length - 1];
      if (last && item.x - (last.x + last.width) < 6) { last.str += (item.x - (last.x + last.width) > 1 ? ' ' : '') + item.str; last.width = item.x + item.width - last.x; } else cells.push({ str: item.str, x: item.x, width: item.width });
    });
    return cells;
  }

  // Les rangées du tableau lues dans un PDF, case par case : chaque texte va dans la colonne de l'en-tête dont il est le plus proche (le titre à gauche, un nombre est collé à droite sous son titre) ; '' pour une case sans texte.
  function pdfTable(page) {
    const lines = pdfLines(page).map(pdfCells);
    const header = lines.find(cells => cells.some(c => c.str === 'Réserve'));
    if (!header) return { header: null, rows: [] };
    const centre = c => c.x + c.width / 2;
    const rows = lines.filter(cells => cells[0] && (ORDER.includes(cells[0].str) || cells[0].str === 'Total') && cells !== header).map(cells => {
      const out = header.map(() => '');
      cells.forEach(c => {
        let best = 0;
        header.forEach((title, i) => { if (Math.abs(centre(c) - centre(title)) < Math.abs(centre(c) - centre(header[best]))) best = i; });
        out[best] = c.str;
      });
      return out;
    });
    return { header: header.map(c => c.str), rows };
  }

  async function pdfOf(h, def, record) {
    const out = await h.exportPdfContent(gridHtml(def), NO_HF, undefined, { tableId: 'PvAtlas', record }, true);
    const truth = await h.extractPdfGroundTruth(out.base64);
    return { out, truth };
  }

  cases.push({
    id: 'pivotExport_pdf_writes_the_table',
    description: 'Le PDF d’une ligne écrit le tableau croisé comme la Lecture : titres, nombres de chaque case, totaux, chaque nombre sous le titre de sa colonne, tout sur la page, et le texte « jamais lu » de la ligne qui le porte n’y est pas',
    run: async (h) => {
      await seed(h);
      const { truth } = await pdfOf(h, DEF, RECORD_NORD());
      const page = truth.pages[0];
      const read = pdfTable(page);
      const lines = pdfLines(page).map(pdfCells);
      const header = lines.find(cells => cells.some(c => c.str === 'Réserve'));
      const total = lines.find(cells => cells[0] && cells[0].str === 'Total');
      const rows = read.rows;
      const wanted = wantedRows(PRODUCTS);
      // Chaque nombre du total se range sous le titre de sa colonne (le milieu du nombre est à moins de 60 pt du milieu du titre) : la même lecture que ci-dessus, mais indépendante des cases vides.
      const alignOk = !!header && !!total && ['Réserve', 'Picking', 'Quai'].every(zone => {
        const title = header.find(c => c.str === zone);
        return total.some(c => Math.abs((c.x + c.width / 2) - (title.x + title.width / 2)) < 60 && toNumber(c.str) !== null);
      });
      const allText = page.textItems.map(it => it.str).join(' ');
      const inside = page.textItems.every(it => it.x >= 0 && it.x + it.width <= page.width + 0.5);
      const pass = truth.pages.length === 1 && !!header && same(read.header, ['Categorie', 'Réserve', 'Picking', 'Quai', 'Total']) && rowsMatch(rows, wanted) && alignOk && inside
        && !/jamais lu/.test(allText) && /Titre/.test(allText) && /Note du bas/.test(allText) && !!header.find(c => /Total/.test(c.str));
      return { pass, notes: JSON.stringify({ pages: truth.pages.length, header: read.header, rows, alignOk, inside }) };
    },
  });

  // Les rangées d'un Word : [[texte de chaque case]], et le fond de chaque case (w:shd), et le gras de chaque case (tous ses runs en gras).
  async function docxTable(h, def, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(gridHtml(def), 'PvAtlas', record, '', NO_HF, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    return Array.from(doc.getElementsByTagName('w:tr')).map(tr => Array.from(tr.getElementsByTagName('w:tc')).map(tc => {
      const shd = tc.getElementsByTagName('w:shd')[0];
      const runs = Array.from(tc.getElementsByTagName('w:r')).filter(r => r.textContent.trim());
      return {
        text: Array.from(tc.getElementsByTagName('w:t')).map(t => t.textContent).join(''),
        fill: shd ? (shd.getAttribute('w:fill') || '').toUpperCase() : '',
        bold: runs.length > 0 && runs.every(r => { const b = r.getElementsByTagName('w:b')[0]; return !!b && b.getAttribute('w:val') !== '0' && b.getAttribute('w:val') !== 'false'; }),
        span: Number((tc.getElementsByTagName('w:gridSpan')[0] || { getAttribute: () => '1' }).getAttribute('w:val')),
      };
    }));
  }

  cases.push({
    id: 'pivotExport_word_writes_the_table',
    description: 'Le Word d’une ligne écrit les rangées du tableau croisé, l’en-tête en gras sur son fond, la ligne Total en gras sur le sien, et le titre fusionné est étendu à la largeur du tableau',
    run: async (h) => {
      await seed(h);
      const table = await docxTable(h, DEF, RECORD_NORD());
      const texts = table.map(row => row.map(c => c.text));
      const wanted = wantedRows(PRODUCTS);
      const rowsOnly = texts.slice(2, 2 + wanted.length);
      const head = table[1]; const total = table[table.length - 2];
      const widthOf = row => row.reduce((sum, c) => sum + c.span, 0);
      const pass = same(texts[1], ['Categorie', 'Réserve', 'Picking', 'Quai', 'Total']) && rowsMatch(rowsOnly, wanted)
        && texts[0][0] === 'Titre' && texts[texts.length - 1][0] === 'Note du bas'
        && head.every(c => c.bold && c.fill === 'E8EDF3') && total.every(c => c.bold && c.fill === 'E8EDF3')
        && table.slice(2, 2 + wanted.length - 1).every(row => row.every(c => c.fill !== 'E8EDF3'))
        && new Set(table.map(widthOf)).size === 1 && widthOf(table[0]) === 5
        && !texts.some(row => row.some(t => /jamais lu/.test(t)));
      return { pass, notes: JSON.stringify({ texts, heads: head.map(c => [c.fill, c.bold]), total: total.map(c => [c.fill, c.bold]), widths: table.map(widthOf) }) };
    },
  });

  cases.push({
    id: 'pivotExport_excel_writes_the_table',
    description: 'L’Excel d’une ligne écrit les rangées du tableau croisé dans la feuille de la ligne (le tableau écrit, en texte), la ligne qui le porte ne laisse rien de son texte',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(gridHtml(DEF), 'PvAtlas', RECORD_NORD(), '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const sst = new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml');
      const strings = Array.from(sst.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''));
      const sheetName = Object.keys(zip.files).find(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      const sheet = new DOMParser().parseFromString(await zip.file(sheetName).async('string'), 'application/xml');
      const rows = Array.from(sheet.getElementsByTagName('row')).map(row => Array.from(row.getElementsByTagName('c')).map(c => {
        const v = c.getElementsByTagName('v')[0];
        if (!v) return '';
        return c.getAttribute('t') === 's' ? strings[Number(v.textContent)] : v.textContent;
      }));
      const wanted = wantedRows(PRODUCTS);
      const header = rows.find(r => r.includes('Réserve'));
      const rowsOnly = rows.slice(rows.indexOf(header) + 1, rows.indexOf(header) + 1 + wanted.length);
      const pass = !!header && same(header.filter(Boolean), ['Categorie', 'Réserve', 'Picking', 'Quai', 'Total']) && rowsMatch(rowsOnly.map(r => r.slice(0, 5)), wanted)
        && !strings.some(s => /jamais lu/.test(s)) && strings.includes('Titre') && strings.includes('Note du bas');
      return { pass, notes: JSON.stringify({ rows }) };
    },
  });

  // Les parties XML d'un classeur lues telles qu'elles sont écrites (DOM de l'archive) : `files` = { chemin -> document }.
  async function xmlParts(zip, pattern) {
    const out = {};
    for (const name of Object.keys(zip.files).filter(n => pattern.test(n))) out[name] = new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
    return out;
  }
  const attrOf = (el, name) => (el ? el.getAttribute(name) : null);
  const kids = (el, tag) => Array.from(el.children).filter(c => c.localName === tag);

  cases.push({
    id: 'pivotExport_excel_native_pivot_table',
    description: 'L’Excel d’une ligne porte aussi le VRAI tableau croisé d’Excel (cache, enregistrements, définition du tableau, relations, types de contenu), sur sa feuille, avec les données à plat dans la dernière : les mêmes sommes que le tableau écrit, les rangées et les colonnes dans l’ordre du tableau, les totaux, le format de nombre',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(gridHtml(DEF), 'PvAtlas', RECORD_NORD(), '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      window.__collected = { xlsx: await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); }) };
      const names = Object.keys(zip.files);
      const parts = { cache: 'xl/pivotCache/pivotCacheDefinition1.xml', records: 'xl/pivotCache/pivotCacheRecords1.xml', table: 'xl/pivotTables/pivotTable1.xml' };
      const present = Object.values(parts).every(n => names.includes(n)) && names.includes('xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels') && names.includes('xl/pivotTables/_rels/pivotTable1.xml.rels');
      const workbook = new DOMParser().parseFromString(await zip.file('xl/workbook.xml').async('string'), 'application/xml');
      const sheetNames = Array.from(workbook.getElementsByTagName('sheet')).map(el => el.getAttribute('name'));
      const caches = Array.from(workbook.getElementsByTagName('pivotCache')).map(el => [el.getAttribute('cacheId'), el.getAttribute('r:id')]);
      const types = await zip.file('[Content_Types].xml').async('string');
      const typesOk = ['pivotCacheDefinition+xml', 'pivotCacheRecords+xml', 'pivotTable+xml'].every(t => types.includes(t));
      const workbookRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
      const relOk = !!caches[0] && new RegExp('Id="' + caches[0][1] + '"[^>]*pivotCacheDefinition1\\.xml|pivotCacheDefinition1\\.xml[^>]*Id="' + caches[0][1] + '"').test(workbookRels);
      if (!present) return { pass: false, notes: JSON.stringify({ names }) };
      const cache = new DOMParser().parseFromString(await zip.file(parts.cache).async('string'), 'application/xml');
      const records = new DOMParser().parseFromString(await zip.file(parts.records).async('string'), 'application/xml');
      const table = new DOMParser().parseFromString(await zip.file(parts.table).async('string'), 'application/xml');
      const root = table.documentElement;
      const fields = Array.from(cache.getElementsByTagName('cacheField')).map(el => ({ name: el.getAttribute('name'), items: Array.from(el.getElementsByTagName('s')).map(s => s.getAttribute('v')) }));
      // Les sommes que le cache donne (ses enregistrements), à comparer à celles du tableau écrit.
      const sums = {}; let grand = 0;
      Array.from(records.getElementsByTagName('r')).forEach(r => {
        const cells = Array.from(r.children);
        const category = fields[0].items[Number(attrOf(cells[0], 'v'))]; const zone = fields[1].items[Number(attrOf(cells[1], 'v'))];
        const n = cells[2].localName === 'n' ? Number(attrOf(cells[2], 'v')) : null;
        if (n === null) return;
        sums[category + '|' + zone] = (sums[category + '|' + zone] || 0) + n; grand += n;
      });
      const want = expected(PRODUCTS);
      const sumsOk = Object.keys(want.cells).every(c => Object.keys(want.cells[c]).every(z => near(sums[c + '|' + z], want.cells[c][z]))) && near(grand, want.grand)
        && Object.keys(sums).length === Object.values(want.cells).reduce((n, row) => n + Object.keys(row).length, 0);
      // L'ordre des rangées et des colonnes : celui du tableau (les choix de la colonne, « (vide) » en dernier), pas celui des lignes.
      const pivotFields = kids(root.getElementsByTagName('pivotFields')[0], 'pivotField');
      const order = i => kids(pivotFields[i].getElementsByTagName('items')[0], 'item').map(it => fields[i].items[Number(it.getAttribute('x'))]);
      const orderOk = same(order(0), ORDER) && same(order(1), ZONES);
      const rowFields = kids(root.getElementsByTagName('rowFields')[0], 'field').map(f => f.getAttribute('x'));
      const colFields = kids(root.getElementsByTagName('colFields')[0], 'field').map(f => f.getAttribute('x'));
      const dataField = root.getElementsByTagName('dataField')[0];
      const shapeOk = same(rowFields, ['0']) && same(colFields, ['1']) && attrOf(dataField, 'fld') === '2' && !dataField.hasAttribute('subtotal') && /Somme de/.test(attrOf(dataField, 'name'))
        && attrOf(root, 'rowGrandTotals') === '1' && attrOf(root, 'colGrandTotals') === '1' && attrOf(root, 'cacheId') === caches[0][0] && attrOf(cache.documentElement, 'refreshOnLoad') === '1'
        && attrOf(root.getElementsByTagName('location')[0], 'ref') === 'A3:E9';
      // La feuille du tableau : les mêmes rangées que le tableau écrit, en vrais nombres (et la feuille des données est la dernière).
      const sst = new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml');
      const strings = Array.from(sst.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''));
      const pivotSheetIndex = sheetNames.indexOf('Tableau croisé') + 1;
      const sheetXml = new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet' + pivotSheetIndex + '.xml').async('string'), 'application/xml');
      const grid = Array.from(sheetXml.getElementsByTagName('row')).filter(r => Number(r.getAttribute('r')) >= 3).map(r => Array.from(r.getElementsByTagName('c')).map(c => {
        const v = c.getElementsByTagName('v')[0];
        if (!v) return null;
        return c.getAttribute('t') === 's' ? strings[Number(v.textContent)] : Number(v.textContent);
      }));
      const bodyRows = grid.slice(2).filter(row => row[0] !== null);
      const wanted = wantedRows(PRODUCTS);
      const gridOk = bodyRows.length === wanted.length && bodyRows.every((row, i) => row[0] === wanted[i][0] && wanted[i].slice(1).every((v, j) => (v === null ? row[j + 1] === null || row[j + 1] === undefined : near(row[j + 1], v))));
      const pass = present && typesOk && relOk && same(sheetNames.slice(-2), ['Tableau croisé', 'Données du tableau croisé']) && sumsOk && orderOk && shapeOk && gridOk;
      return { pass, notes: JSON.stringify({ sheetNames, caches, typesOk, relOk, sumsOk, orderOk, shapeOk, gridOk, order0: order(0), order1: order(1), grid }) };
    },
  });

  // L'archive d'un export lue : les noms des feuilles, les caches, et les parties XML des tableaux croisés (numérotées de 1).
  async function pivotParts(zip) {
    const workbook = new DOMParser().parseFromString(await zip.file('xl/workbook.xml').async('string'), 'application/xml');
    const sheetNames = Array.from(workbook.getElementsByTagName('sheet')).map(el => el.getAttribute('name'));
    const caches = Array.from(workbook.getElementsByTagName('pivotCache')).map(el => el.getAttribute('cacheId'));
    const tables = await xmlParts(zip, /^xl\/pivotTables\/pivotTable\d+\.xml$/);
    const defs = await xmlParts(zip, /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/);
    const recs = await xmlParts(zip, /^xl\/pivotCache\/pivotCacheRecords\d+\.xml$/);
    return { sheetNames, caches, tables, defs, recs };
  }
  // Les enregistrements d'un cache lus : [{ items: [texte de chaque champ de regroupement], n }] pour un cache dont le dernier champ est la valeur.
  function cacheRows(def, recs) {
    const fields = Array.from(def.getElementsByTagName('cacheField')).map(el => Array.from(el.getElementsByTagName('s')).map(x => x.getAttribute('v')));
    return Array.from(recs.getElementsByTagName('r')).map(r => {
      const cells = Array.from(r.children);
      const last = cells[cells.length - 1];
      return { items: cells.slice(0, -1).map((c, i) => fields[i][Number(c.getAttribute('v'))]), n: last.localName === 'n' ? Number(last.getAttribute('v')) : null };
    });
  }

  cases.push({
    id: 'pivotExport_excel_native_pivot_two_levels_and_count',
    description: 'Un tableau à deux niveaux de rangées, sans colonne, qui compte les lignes : le tableau croisé d’Excel a ses deux champs en rangées (la rangée qui garde son groupe reprend le niveau d’avant), « Nombre » comme fonction, un champ « Ligne » dans les données, le total général en bas seulement',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      const def = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Categorie', 'Emplacement.Zone'], cols: [], value: null, agg: 'count' };
      const { blob } = await XlsxExport.getXlsxBlobForRecord(gridHtml(def), 'PvAtlas', RECORD_NORD(), '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const { sheetNames, caches, tables, defs, recs } = await pivotParts(zip);
      if (caches.length !== 1) return { pass: false, notes: JSON.stringify({ sheetNames, caches }) };
      const root = tables['xl/pivotTables/pivotTable1.xml'].documentElement;
      const rows = cacheRows(defs['xl/pivotCache/pivotCacheDefinition1.xml'], recs['xl/pivotCache/pivotCacheRecords1.xml']);
      const counts = {};
      rows.forEach(r => { const key = r.items.join('|'); counts[key] = (counts[key] || 0) + (r.n === null ? 0 : r.n); });
      const wantCounts = {};
      PRODUCTS.forEach(([, category, location]) => { const key = (category || '(vide)') + '|' + ZONE_BY_LOCATION[location]; wantCounts[key] = (wantCounts[key] || 0) + 1; });
      const names = Array.from(defs['xl/pivotCache/pivotCacheDefinition1.xml'].getElementsByTagName('cacheField')).map(el => el.getAttribute('name'));
      const rowItems = Array.from(root.getElementsByTagName('rowItems')[0].children).map(i => ({ r: i.getAttribute('r'), t: i.getAttribute('t'), n: i.children.length }));
      const location = root.getElementsByTagName('location')[0];
      const leafRows = Object.keys(wantCounts).length;
      const dataField = root.getElementsByTagName('dataField')[0];
      const pass = same(counts, wantCounts) && rows.length === PRODUCTS.length && same(names, ['Categorie', 'Emplacement ▸ Zone', 'Ligne'])
        && attrOf(dataField, 'subtotal') === 'count' && attrOf(dataField, 'fld') === '2' && root.getElementsByTagName('colFields').length === 0
        && attrOf(root, 'colGrandTotals') === '1' && rowItems.length === leafRows + 1 && rowItems[rowItems.length - 1].t === 'grand'
        && rowItems.filter(i => i.r === '1').length > 0 && rowItems.filter(i => i.t !== 'grand' && i.r !== '1').every(i => i.n === 2) && rowItems.filter(i => i.r === '1').every(i => i.n === 1)
        && attrOf(location, 'firstDataCol') === '2' && attrOf(location, 'firstDataRow') === '1' && attrOf(location, 'ref') === 'A3:C' + (3 + leafRows + 1)
        && root.getElementsByTagName('colItems')[0].children.length === 1;
      return { pass, notes: JSON.stringify({ sheetNames, counts, names, rowItems, ref: attrOf(location, 'ref') }) };
    },
  });

  cases.push({
    id: 'pivotExport_excel_native_pivot_skipped_when_excel_could_not_redo_it',
    description: 'Un tableau dont Excel ne saurait pas refaire les sommes (une liste de choix en rangées : une ligne y serait comptée deux fois dans les totaux) n’a que son tableau écrit : une seule feuille, aucune partie de tableau croisé, les rangées écrites comme avant',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      const stub = window.__gristStub;
      stub.setVariables('PvProduits', { Categorie: 'Choice', Etiquettes: 'ChoiceList', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: CATEGORIES });
      stub.setRows('PvProduits', PRODUCT_ROWS.map(r => Object.assign({}, r, { Atlas: 1, Etiquettes: r.id % 2 ? ['L', 'neuf', 'promo'] : ['L', 'neuf'] })));
      await GristAPI.refreshSchema();
      const def = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Etiquettes'], cols: [], value: { kind: 'column', path: 'Stock' }, agg: 'sum' };
      const { blob } = await XlsxExport.getXlsxBlobForRecord(gridHtml(def), 'PvAtlas', RECORD_NORD(), '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const { sheetNames, caches } = await pivotParts(zip);
      const names = Object.keys(zip.files);
      const sst = new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml');
      const strings = Array.from(sst.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''));
      const pass = sheetNames.length === 1 && caches.length === 0 && !names.some(n => /pivot/i.test(n)) && strings.includes('neuf') && strings.includes('promo') && strings.includes('Total');
      return { pass, notes: JSON.stringify({ sheetNames, caches, parts: names.filter(n => /pivot/i.test(n)) }) };
    },
  });

  cases.push({
    id: 'pivotExport_excel_native_pivot_in_a_single_workbook',
    description: 'Un classeur unique de deux lignes de la page : chaque ligne a son tableau croisé (ses lignes liées), sur sa feuille numérotée, dans un cache à lui, et toutes les données à plat sont dans la même feuille, la dernière',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      const book = await XlsxExport.createSingleWorkbook({});
      await book.appendRecord(gridHtml(LINKED), 'PvAtlas', RECORD_NORD(), 'Nord', null, null);
      await book.appendRecord(gridHtml(LINKED), 'PvAtlas', RECORD_SUD(), 'Sud', null, null);
      const zip = await JSZip.loadAsync(await (await book.toBlob()).arrayBuffer());
      const { sheetNames, caches, tables, defs, recs } = await pivotParts(zip);
      const tableCount = Object.keys(tables).length;
      if (tableCount !== 2 || caches.length !== 2) return { pass: false, notes: JSON.stringify({ sheetNames, caches, tableCount }) };
      const sumOf = n => cacheRows(defs['xl/pivotCache/pivotCacheDefinition' + n + '.xml'], recs['xl/pivotCache/pivotCacheRecords' + n + '.xml']).reduce((sum, r) => sum + (r.n || 0), 0);
      const nord = expected(PRODUCTS.filter(p => p[0] % 2)).grand;
      const sud = expected(PRODUCTS.filter(p => !(p[0] % 2))).grand;
      const sources = Array.from(zip.file('xl/pivotCache/pivotCacheDefinition1.xml') ? [1, 2] : []).map(n => attrOf(defs['xl/pivotCache/pivotCacheDefinition' + n + '.xml'].getElementsByTagName('worksheetSource')[0], 'sheet'));
      const pass = same(sheetNames, ['Nord', 'Sud', 'Tableau croisé', 'Tableau croisé (2)', 'Données du tableau croisé']) && near(sumOf(1), nord) && near(sumOf(2), sud)
        && new Set(sources).size === 1 && sources[0] === 'Données du tableau croisé'
        && same(Array.from(new Set(Object.values(tables).map(t => attrOf(t.documentElement, 'name')))).sort(), ['Tableau croisé 1', 'Tableau croisé 2']);
      return { pass, notes: JSON.stringify({ sheetNames, caches, sums: [sumOf(1), sumOf(2)], want: [nord, sud], sources }) };
    },
  });

  cases.push({
    id: 'pivotExport_html_markdown_and_email_write_the_table',
    description: 'Le HTML, le Markdown et le texte d’un email (le HTML résolu de la Lecture) écrivent les mêmes rangées que le PDF, sans le texte « jamais lu » : un tableau d’en-têtes, de rangées et de total, que ces formats savent tous écrire',
    run: async (h) => {
      await seed(h);
      const wanted = wantedRows(PRODUCTS);
      const html = gridHtml(DEF);
      const htmlOut = await HtmlExport.getHtmlBlobForRecord(html, 'PvAtlas', RECORD_NORD(), '', NO_HF);
      const doc = new DOMParser().parseFromString(await htmlOut.blob.text(), 'text/html');
      const htmlRows = Array.from(doc.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));
      const mdOut = await MarkdownExport.getMarkdownBlobForRecord(html, 'PvAtlas', RECORD_NORD(), '', NO_HF);
      const markdown = await mdOut.blob.text();
      // Une grille aux cases fusionnées n'a pas de forme en barres verticales : le Markdown la garde en <table> (du HTML est du Markdown), lue ici comme telle.
      const mdRows = Array.from(new DOMParser().parseFromString(markdown, 'text/html').querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));
      const mail = await ReaderMode.resolvedHtml(html, 'PvAtlas', RECORD_NORD());
      const box = document.createElement('div'); box.innerHTML = mail.html;
      const mailRows = Array.from(box.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));
      const bodyOf = rows => rows.filter(r => ORDER.includes(r[0]) || r[0] === 'Total');
      const ok = rows => rowsMatch(bodyOf(rows).map(r => r.slice(0, 5)), wanted) && rows.some(r => r[0] === 'Categorie' && r.includes('Réserve'));
      const pass = ok(htmlRows) && ok(mdRows) && ok(mailRows) && !/jamais lu/.test(markdown) && !/jamais lu/.test(doc.body.textContent) && !mail.hasError;
      return { pass, notes: JSON.stringify({ htmlRows: htmlRows.length, mdRows: mdRows.length, mailRows: mailRows.length }) };
    },
  });

  // Un long tableau : soixante rangées (une par produit) sur une seule colonne de valeurs, de quoi remplir plus d'une page.
  const LONG_COUNT = 60;
  const nameOf = i => 'Produit ' + String(i).padStart(2, '0');
  async function seedLong(h) {
    await seed(h);
    const stub = window.__gristStub;
    stub.setVariables('PvLong', { Nom: 'Text', Valeur: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' });
    stub.setRows('PvLong', Array.from({ length: LONG_COUNT }, (_, k) => ({ id: k + 1, Nom: nameOf(k + 1), Valeur: k + 1, Atlas: 1, manualSort: k + 1 })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
    await h.sleep(50);
  }
  const LONG_DEF = { v: 1, source: { table: 'PvLong', scope: 'table' }, rows: ['Nom'], cols: [], value: { kind: 'column', path: 'Valeur' }, agg: 'sum' };

  cases.push({
    id: 'pivotExport_long_table_goes_over_pages',
    description: 'Un tableau croisé de soixante rangées passe sur plusieurs pages du PDF et du Word sans perdre ni répéter une rangée : chaque produit une fois, dans l’ordre, la ligne Total à la fin, l’en-tête repris en haut de la page qui suit',
    run: async (h) => {
      await seedLong(h);
      const out = await h.exportPdfContent(gridHtml(LONG_DEF), NO_HF, undefined, { tableId: 'PvAtlas', record: RECORD_NORD() }, true);
      const truth = await h.extractPdfGroundTruth(out.base64);
      const names = truth.pages.map(p => pdfLines(p).map(pdfCells).map(cells => cells[0] && cells[0].str).filter(t => /^Produit \d\d$/.test(t || '')));
      const flat = [].concat(...names);
      const wanted = Array.from({ length: LONG_COUNT }, (_, k) => nameOf(k + 1));
      const lastPage = truth.pages[truth.pages.length - 1];
      const totalOnLast = lastPage.textItems.some(it => it.str === 'Total');
      const totalElsewhere = truth.pages.slice(0, -1).some(p => p.textItems.some(it => it.str === 'Total'));
      const headerAgain = truth.pages.slice(1).every(p => p.textItems.some(it => it.str === 'Nom' || it.str === 'Titre'));
      // La somme du total général : 1 + 2 + … + 60 = 1 830.
      const grand = lastPage.textItems.map(it => toNumber(it.str)).filter(n => n === 1830).length > 0;
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const { blob } = await DocxExport.getDocxBlobForRecord(gridHtml(LONG_DEF), 'PvAtlas', RECORD_NORD(), '', NO_HF, null);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml').async('string');
      const docNames = (xml.match(/Produit \d\d/g) || []);
      const pass = truth.pages.length >= 2 && same(flat, wanted) && totalOnLast && !totalElsewhere && headerAgain && grand
        && same(docNames, wanted) && /w:tblHeader/.test(xml);
      return { pass, notes: JSON.stringify({ pages: truth.pages.length, perPage: names.map(n => n.length), totalOnLast, totalElsewhere, headerAgain, grand, wordRows: docNames.length, tblHeader: /w:tblHeader/.test(xml) }) };
    },
  });

  cases.push({
    id: 'pivotExport_batch_each_row_its_table',
    description: 'Un lot écrit, pour chaque ligne de la page, le tableau croisé de SES lignes liées : « Atlas Nord » (produits d’id impair) et « Atlas Sud » (id pair) donnent deux PDF aux totaux différents, chacun juste, sans que le premier reste dans le second',
    run: async (h) => {
      await seed(h);
      const nord = PRODUCTS.filter(p => p[0] % 2 === 1);
      const sud = PRODUCTS.filter(p => p[0] % 2 === 0);
      const grandOf = async record => pdfTable((await pdfOf(h, LINKED, record)).truth.pages[0]).rows;
      const nordRows = await grandOf(RECORD_NORD());
      const sudRows = await grandOf(RECORD_SUD());
      // Un tour de plus sur la première ligne : le lot rejoue la ligne de départ sans garder la mémoire du tour d'avant.
      const nordAgain = await grandOf(RECORD_NORD());
      // Les catégories sans ligne liée n'ont pas de rangée : le tableau attendu garde celles que le PDF écrit, dans le même ordre.
      const e = (rows, products) => rows.length > 0 && rowsMatch(rows, wantedRows(products).filter(w => w[0] === 'Total' || rows.some(r => r[0] === w[0])));
      const pass = e(nordRows, nord) && e(sudRows, sud) && e(nordAgain, nord) && !same(nordRows, sudRows) && same(nordRows, nordAgain);
      return { pass, notes: JSON.stringify({ nordRows, sudRows }) };
    },
  });

  cases.push({
    id: 'pivotExport_precheck_says_an_unreadable_pivot',
    description: 'Le contrôle d’avant lot dit un tableau croisé qui ne se lit pas (la table n’existe plus) : une erreur du document, avec le nom du tableau ; un tableau croisé lisible n’ajoute rien au contrôle',
    run: async (h) => {
      await seed(h);
      const good = await ReaderMode.inspect(gridHtml(DEF), 'PvAtlas', RECORD_NORD());
      const broken = await ReaderMode.inspect(gridHtml(Object.assign({}, DEF, { source: { table: 'PvDisparue', scope: 'table' } })), 'PvAtlas', RECORD_NORD());
      const pass = good.errors.length === 0 && broken.errors.length === 1 && /PvDisparue/.test(broken.errors[0].text);
      return { pass, notes: JSON.stringify({ good: good.errors, broken: broken.errors }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pivotExport = cases;
})();
