// Suite "odsExport" - l'EXPORT OpenDocument tableur (js/ods-export.js) : la grille d'une ligne devient un .ods, SANS bibliothèque de plus (JSZip, XML écrit à la main), chantier « formats libres », lot 4b. La grille se lit
// par le lecteur de l'export Excel (js/xlsx-export.js:recordAppender, qui écrit dans un classeur d'enregistrement au lieu d'ExcelJS) : ces cas disent donc ce que le FICHIER reprend de la grille, pas comment elle est lue
// (c'est le travail de la suite « xlsx »).
//
// Les cas écrivent le fichier dans la page puis le RELISENT de deux façons : sa forme (le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé, chaque style utilisé
// déclaré) et son sens (l'import OpenDocument tableur du même chantier, js/ods-import.js, relit le fichier : ce qu'on y retrouve est ce que LibreOffice y verra). Un essai d'aller-retour ne remplace pas LibreOffice : le
// fichier a aussi été ouvert par LibreOffice 24.2 (conversion en PDF et en CSV) hors dépôt, cf. dev-tests/README.md.
//  - la forme : paquet, mimetype, manifeste, XML bien formé, texte tel quel (signes < > &, espaces multiples), page (format, sens, marges, une page de large) ;
//  - la grille : colonnes (largeur), lignes (hauteur), fusions et cases couvertes, polices, fonds, traits, alignement ;
//  - les valeurs : vrais nombres et vraies dates AVEC le texte que la bulle écrit, leur format d'affichage converti du code d'Excel (nombre, devise, pourcentage, date, heure et minutes), texte riche, liens, retours à la ligne ;
//  - les images (`Pictures/`), les feuilles (une par saut de page de la grille), ce que le fichier ne reprend pas (compté : graphiques, tableaux croisés).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const ready = () => ExportEngines.ensure(['xlsx', 'odsExport', 'odsImport']);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  // --- Lire un .ods écrit -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const NS = ExportCommon.Odf.NS;
  const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');
  const all = (root, ns, name) => Array.from(root.getElementsByTagNameNS(NS[ns], name));
  const attr = (el, ns, name) => (el ? el.getAttributeNS(NS[ns], name) || '' : '');
  const kids = (el, ns, name) => Array.from(el.children).filter(child => child.namespaceURI === NS[ns] && child.localName === name);
  // Le fichier : { made, zip, names, text(path), content, styles, sheets, style(name), sheet(index), cell(sheet, row, col) }.
  async function openOds(blob, report) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = path => zip.file(path).async('string');
    const content = parseXml(await text('content.xml'));
    const styles = parseXml(await text('styles.xml'));
    const named = {};
    all(content, 'style', 'style').forEach(el => { named[attr(el, 'style', 'name')] = el; });
    all(content, 'number', 'number-style').concat(all(content, 'number', 'date-style'), all(content, 'number', 'percentage-style')).forEach(el => { named[attr(el, 'style', 'name')] = el; });
    const sheets = all(content, 'table', 'table');
    // Les cases d'une ligne développées (`number-columns-repeated`), couvertes comprises.
    const rowCells = row => {
      const out = [];
      Array.from(row.children).filter(el => el.namespaceURI === NS.table && /table-cell$/.test(el.localName)).forEach(el => {
        const times = Math.min(Number(attr(el, 'table', 'number-columns-repeated')) || 1, 50);
        for (let i = 0; i < times; i++) out.push(el);
      });
      return out;
    };
    return {
      blob, report, zip, names: Object.keys(zip.files), text, content, styles, sheets, named,
      style: name => named[name],
      prop: (name, tag, property, ns) => { const style = named[name]; const props = style && Array.from(style.children).find(el => el.localName === tag); return props ? props.getAttributeNS(NS[ns || 'style'], property) || props.getAttributeNS(NS.fo, property) : null; },
      cell: (sheet, row, col) => { const lines = kids(sheets[sheet], 'table', 'table-row'); return lines[row - 1] ? rowCells(lines[row - 1])[col - 1] || null : null; },
      cellText: (sheet, row, col) => { const line = kids(sheets[sheet], 'table', 'table-row')[row - 1]; const el = line ? rowCells(line)[col - 1] : null; return el ? all(el, 'text', 'p').map(p => p.textContent).join('\n') : null; },
      columns: sheet => kids(sheets[sheet], 'table', 'table-column'),
      rows: sheet => kids(sheets[sheet], 'table', 'table-row'),
    };
  }

  // --- Le jeu d'essai ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const TABLE = 'GrilleOds';
  const RECORD = { id: 1, Nom: 'Alpha Durand', Montant: 1234.5, Quantite: 12, Date: Date.UTC(2026, 8, 12) / 1000 };
  const badge = (col, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${col}" data-key="${TABLE}.${col}"${extra || ''}></span>`;
  const withFormat = format => ` data-format='${JSON.stringify(format)}'`;
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Montant: 'Numeric', Quantite: 'Int', Date: 'Date' });
    stub.setRows(TABLE, [RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await sleep(100);
  }
  const td = (html, attrs) => `<td${attrs || ''}><p>${html}</p></td>`;
  function gridHtml(widths, heights, rows, breaks) {
    const total = widths.reduce((sum, w) => sum + w, 0);
    let k = 0;
    const fix = cell => (cell.startsWith('<td') ? cell.replace('<td', `<td colwidth="${widths[k++ % widths.length]}"`) : `<td colwidth="${widths[k++ % widths.length]}"><p>${cell}</p></td>`);
    return `<table style="width: ${total}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
      + rows.map((row, r) => { k = 0; return `<tr data-row-height="${heights[r]}" style="height: ${heights[r]}px"${breaks && breaks.includes(r) ? ' data-page-break-before="true"' : ''}>${row.map(fix).join('')}</tr>`; }).join('') + '</tbody></table>';
  }
  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await sleep(250);
  }
  // Charge la grille, l'enregistre comme le modèle le serait (Editor.getHTML), l'exporte en .ods et ouvre le fichier.
  async function exportGrid(widths, heights, rows, options) {
    const o = options || {};
    await ready();
    await loadGrid(gridHtml(widths, heights, rows, o.breaks));
    const made = await OdsExport.getOdsBlobForRecord(Editor.getHTML(), TABLE, RECORD, '', o.options);
    return Object.assign(await openOds(made.blob, made.report), { filename: made.filename, built: made });
  }
  const cm = px => px * 2.54 / 96;
  const number = text => parseFloat(String(text).replace('cm', ''));

  // ============================================================================================================================================================================================
  // 1. La forme du fichier
  // ============================================================================================================================================================================================
  cases.push({
    id: 'odsExport_the_package_is_a_valid_opendocument_spreadsheet',
    description: 'le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé dans chacune, le type du blob et le nom du fichier',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([120, 90], [30, 30], [['Nom', badge('Nom')], ['x & y < z > "q"', 'trois   espaces']]);
      expect('le premier fichier du zip est mimetype', x.names[0] === 'mimetype', x.names);
      expect('mimetype dit « application/vnd.oasis.opendocument.spreadsheet » et rien d\'autre', (await x.text('mimetype')) === 'application/vnd.oasis.opendocument.spreadsheet');
      const entry = x.zip.file('mimetype');
      expect('mimetype n\'est pas compressé', entry && entry._data && entry._data.compression && entry._data.compression.magic === '\u0000\u0000');
      expect('le type du blob est celui d\'un tableur OpenDocument', x.blob.type === 'application/vnd.oasis.opendocument.spreadsheet', x.blob.type);
      const manifest = parseXml(await x.text('META-INF/manifest.xml'));
      const listed = all(manifest, 'manifest', 'file-entry').map(el => attr(el, 'manifest', 'full-path'));
      expect('le manifeste nomme content.xml, styles.xml, meta.xml et settings.xml', ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml'].every(name => listed.indexOf(name) >= 0), listed);
      const parts = x.names.filter(name => !/\/$/.test(name) && name !== 'mimetype' && name !== 'META-INF/manifest.xml');
      expect('chaque partie du paquet est dans le manifeste', parts.every(name => listed.indexOf(name) >= 0), parts);
      for (const name of ['META-INF/manifest.xml', 'content.xml', 'styles.xml', 'meta.xml', 'settings.xml']) {
        const doc = parseXml(await x.text(name));
        expect(name + ' est du XML bien formé', !doc.getElementsByTagName('parsererror').length, (doc.getElementsByTagName('parsererror')[0] || {}).textContent);
      }
      expect('le fichier garde le nom de la ligne (le nom par défaut du modèle)', typeof x.filename === 'string', x.filename);
      expect('une seule feuille', x.sheets.length === 1, x.sheets.length);
      expect('le texte est celui de la grille, signes réservés compris', x.cellText(0, 1, 1) === 'Nom' && x.cellText(0, 1, 2) === 'Alpha Durand' && x.cellText(0, 2, 1) === 'x & y < z > "q"', [x.cellText(0, 1, 1), x.cellText(0, 1, 2), x.cellText(0, 2, 1)]);
      const spaced = OdsExport.newRecordingWorkbook();
      spaced.addWorksheet('Espaces', {}).getCell(1, 1).value = 'trois   espaces\tet une tabulation';
      const spacedFile = await openOds((await OdsExport.build(spaced, {})).blob);
      expect('les espaces qui se suivent et la tabulation sont écrits (`text:s`, `text:tab`), pas perdus', /trois <text:s text:c="2"\/>espaces<text:tab\/>et/.test(await spacedFile.text('content.xml')), (await spacedFile.text('content.xml')).slice(-300));
      expect('rien à dire pour une grille ordinaire', !x.report.length, x.report);
      expect('le quadrillage de LibreOffice est éteint', /ShowGrid[^<]*>false</.test(await x.text('settings.xml')));
      return result(bad);
    },
  });

  // ============================================================================================================================================================================================
  // 2. La grille : colonnes, lignes, fusions, mise en forme, page
  // ============================================================================================================================================================================================
  cases.push({
    id: 'odsExport_columns_rows_and_the_page_are_written',
    description: 'colonnes et lignes : largeur (px en cm), hauteur (px × 0,75 pt en cm) ; la page : A4 portrait, marges, une page de large ; paysage et format du modèle ouverts',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([120, 90, 160], [40, 30, 100], [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]);
      const widths = x.columns(0).map(el => number(x.prop(attr(el, 'table', 'style-name'), 'table-column-properties', 'column-width')));
      expect('trois colonnes de 120, 90 et 160 px', widths.length === 3 && [120, 90, 160].every((px, i) => near(widths[i], cm(px), 0.01)), widths);
      const heights = x.rows(0).map(el => number(x.prop(attr(el, 'table', 'style-name'), 'table-row-properties', 'row-height')));
      expect('trois lignes de 40, 30 et 100 px (30, 22,5 et 75 pt)', heights.length === 3 && [30, 22.5, 75].every((pt, i) => near(heights[i], pt * 2.54 / 72, 0.01)), heights);
      expect('la hauteur est fixée (pas de hauteur optimale)', x.rows(0).every(el => x.prop(attr(el, 'table', 'style-name'), 'table-row-properties', 'use-optimal-row-height') === 'false'));
      const master = attr(x.sheets[0], 'table', 'style-name');
      const masterName = x.prop(master, 'table-properties', 'master-page-name') || attr(x.style(master), 'style', 'master-page-name');
      const masterEl = all(x.styles, 'style', 'master-page').find(el => attr(el, 'style', 'name') === masterName);
      const layout = masterEl && all(x.styles, 'style', 'page-layout').find(el => attr(el, 'style', 'name') === attr(masterEl, 'style', 'page-layout-name'));
      const props = layout && layout.firstElementChild;
      expect('la table se range sur une page maîtresse « Default »', masterName === 'Default', masterName);
      expect('A4 portrait', props && near(number(attr(props, 'fo', 'page-width')), 21, 0.01) && near(number(attr(props, 'fo', 'page-height')), 29.7, 0.01) && attr(props, 'style', 'print-orientation') === 'portrait', props && props.outerHTML);
      expect('une page de large (échelle X = 1, Y libre)', props && attr(props, 'style', 'scale-to-X') === '1' && attr(props, 'style', 'scale-to-Y') === '0');
      const landscape = await exportGrid([120, 90], [30], [['a', 'b']], { options: { landscape: true, paperSize: 8, marginsInch: { left: 1, right: 1, top: 0.5, bottom: 0.5 } } });
      const lMaster = all(landscape.styles, 'style', 'master-page')[0];
      const lProps = all(landscape.styles, 'style', 'page-layout')[0].firstElementChild;
      expect('A3 en paysage, marges d\'un pouce à gauche et à droite', lMaster && near(number(attr(lProps, 'fo', 'page-width')), 42, 0.01) && near(number(attr(lProps, 'fo', 'page-height')), 29.7, 0.01) && attr(lProps, 'style', 'print-orientation') === 'landscape'
        && near(number(attr(lProps, 'fo', 'margin-left')), 2.54, 0.01) && near(number(attr(lProps, 'fo', 'margin-top')), 1.27, 0.01), lProps.outerHTML);
      return result(bad);
    },
  });

  cases.push({
    id: 'odsExport_merges_fonts_fills_borders_and_alignment',
    description: 'une case sur deux colonnes et deux lignes (cases couvertes), gras, italique, couleur, taille, police, fond, traits (couleur, côtés réglés), alignement horizontal et vertical, retour à la ligne',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([100, 100, 100], [30, 30, 30], [
        [td('<strong>Gras</strong>', ' colspan="2" rowspan="2"'), td('<em><span style="color: #cc0000">Rouge</span></em>')],
        [td('<span style="font-size: 18px">Grand</span>')],
        [td('Fond', ' style="background-color: #ffee99"'), '<td><p style="text-align: right">Droite</p></td>', td('Centre', ' data-valign="top"')],
      ]);
      const master = x.cell(0, 1, 1);
      expect('la case maîtresse a deux colonnes et deux lignes', attr(master, 'table', 'number-columns-spanned') === '2' && attr(master, 'table', 'number-rows-spanned') === '2', master && master.outerHTML.slice(0, 160));
      expect('les trois autres cases de la fusion sont couvertes', x.cell(0, 1, 2).localName === 'covered-table-cell' && x.cell(0, 2, 1).localName === 'covered-table-cell' && x.cell(0, 2, 2).localName === 'covered-table-cell');
      const bold = attr(master, 'table', 'style-name');
      expect('« Gras » est en gras', x.prop(bold, 'text-properties', 'font-weight') === 'bold', x.prop(bold, 'text-properties', 'font-weight'));
      expect('la police est Arial et sa taille celle du corps', x.prop(bold, 'text-properties', 'font-name') === 'Arial' && /pt$/.test(x.prop(bold, 'text-properties', 'font-size') || ''), [x.prop(bold, 'text-properties', 'font-name'), x.prop(bold, 'text-properties', 'font-size')]);
      const red = attr(x.cell(0, 1, 3), 'table', 'style-name');
      expect('« Rouge » est en italique et rouge', x.prop(red, 'text-properties', 'font-style') === 'italic' && x.prop(red, 'text-properties', 'color') === '#cc0000', [x.prop(red, 'text-properties', 'font-style'), x.prop(red, 'text-properties', 'color')]);
      const big = attr(x.cell(0, 2, 3), 'table', 'style-name');
      expect('« Grand » est à 13,5 pt (18 px)', near(parseFloat(x.prop(big, 'text-properties', 'font-size')), 13.5, 0.01), x.prop(big, 'text-properties', 'font-size'));
      const fill = attr(x.cell(0, 3, 1), 'table', 'style-name');
      expect('le fond de la case est écrit', x.prop(fill, 'table-cell-properties', 'background-color') === '#ffee99', x.prop(fill, 'table-cell-properties', 'background-color'));
      expect('chaque case a le filet fin gris de la grille (#777777) sur ses quatre côtés', ['top', 'bottom', 'left', 'right'].every(side => /^0\.75pt solid #777777$/.test(x.prop(fill, 'table-cell-properties', 'border-' + side) || '')), x.prop(fill, 'table-cell-properties', 'border-top'));
      const right = attr(x.cell(0, 3, 2), 'table', 'style-name');
      expect('l\'alignement à droite est celui de la case', x.prop(right, 'paragraph-properties', 'text-align') === 'end', x.prop(right, 'paragraph-properties', 'text-align'));
      expect('l\'alignement vertical en haut est celui de la case, le milieu celui des autres', x.prop(attr(x.cell(0, 3, 3), 'table', 'style-name'), 'table-cell-properties', 'vertical-align') === 'top' && x.prop(fill, 'table-cell-properties', 'vertical-align') === 'middle');
      expect('le texte passe à la ligne dans la case', x.prop(fill, 'table-cell-properties', 'wrap-option') === 'wrap');
      expect('la police est déclarée', all(x.content, 'style', 'font-face').some(el => attr(el, 'style', 'name') === 'Arial'));
      return result(bad);
    },
  });

  // ============================================================================================================================================================================================
  // 3. Les valeurs
  // ============================================================================================================================================================================================
  cases.push({
    id: 'odsExport_numbers_and_dates_keep_their_value_and_their_shown_text',
    description: 'un vrai nombre, une vraie devise, un pourcentage et une vraie date : valeur ET texte affiché dans la case, format d\'affichage converti en style de nombre ; une case de texte reste du texte',
    run: async (h) => inLang('fr', async () => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([120, 120, 120, 120], [30, 30], [
        [badge('Montant'), badge('Montant', withFormat({ type: 'number', decimals: 2, currency: '€' })), badge('Quantite', withFormat({ type: 'number', percent: true })), badge('Date')],
        [badge('Nom'), badge('Date', withFormat({ type: 'date', preset: 'd_mmmm_yyyy' })), badge('Montant', withFormat({ type: 'number', words: true })), 'texte'],
      ]);
      const money = x.cell(0, 1, 1);
      expect('le montant est un vrai nombre (1234.5)', attr(money, 'office', 'value-type') === 'float' && attr(money, 'office', 'value') === '1234.5', money && money.outerHTML.slice(0, 200));
      expect('et la case garde le texte que la bulle écrit', /1.?234,5/.test(x.cellText(0, 1, 1).replace(/\s/g, ' ')), x.cellText(0, 1, 1));
      const style1 = x.style(attr(money, 'table', 'style-name'));
      const dataName = attr(style1, 'style', 'data-style-name');
      const data = x.style(dataName);
      expect('la case a un style de nombre', !!data && data.localName === 'number-style', dataName);
      const num = data && all(data, 'number', 'number')[0];
      expect('groupement des milliers, au moins un chiffre, jusqu\'à une décimale', num && attr(num, 'number', 'grouping') === 'true' && attr(num, 'number', 'min-integer-digits') === '1' && Number(attr(num, 'number', 'decimal-places')) >= 1, num && num.outerHTML);
      const euro = x.cell(0, 1, 2);
      const euroData = x.style(attr(x.style(attr(euro, 'table', 'style-name')), 'style', 'data-style-name'));
      expect('la devise est écrite dans le style de nombre', euroData && all(euroData, 'number', 'text').some(el => /€/.test(el.textContent)) && attr(all(euroData, 'number', 'number')[0], 'number', 'decimal-places') === '2' && attr(all(euroData, 'number', 'number')[0], 'number', 'min-decimal-places') === '2', euroData && euroData.outerHTML);
      expect('la case de devise vaut toujours 1234.5', attr(euro, 'office', 'value') === '1234.5');
      const percent = x.cell(0, 1, 3);
      const percentData = x.style(attr(x.style(attr(percent, 'table', 'style-name')), 'style', 'data-style-name'));
      expect('le pourcentage est une case de pourcentage, avec un style de pourcentage', attr(percent, 'office', 'value-type') === 'percentage' && percentData && percentData.localName === 'percentage-style', [attr(percent, 'office', 'value-type'), percentData && percentData.localName]);
      const date = x.cell(0, 1, 4);
      expect('la date est une vraie date du 12 septembre 2026', attr(date, 'office', 'value-type') === 'date' && attr(date, 'office', 'date-value') === '2026-09-12', date && date.outerHTML.slice(0, 200));
      const dateData = x.style(attr(x.style(attr(date, 'table', 'style-name')), 'style', 'data-style-name'));
      expect('son style de date écrit jour, mois et année', dateData && dateData.localName === 'date-style' && ['day', 'month', 'year'].every(tag => all(dateData, 'number', tag).length === 1), dateData && dateData.outerHTML);
      const spelled = x.cell(0, 2, 2);
      const spelledData = x.style(attr(x.style(attr(spelled, 'table', 'style-name')), 'style', 'data-style-name'));
      expect('« 12 septembre 2026 » : le mois est écrit en lettres', attr(spelled, 'office', 'date-value') === '2026-09-12' && spelledData && attr(all(spelledData, 'number', 'month')[0], 'number', 'textual') === 'true' && /septembre/i.test(x.cellText(0, 2, 2)), [x.cellText(0, 2, 2), spelledData && spelledData.outerHTML]);
      expect('un texte reste du texte', attr(x.cell(0, 2, 1), 'office', 'value-type') === 'string' && x.cellText(0, 2, 1) === 'Alpha Durand' && attr(x.cell(0, 2, 4), 'office', 'value-type') === 'string');
      expect('un nombre en toutes lettres reste du texte', attr(x.cell(0, 2, 3), 'office', 'value-type') === 'string', x.cellText(0, 2, 3));
      expect('l\'alignement d\'un nombre est à gauche comme dans la grille', x.prop(attr(money, 'table', 'style-name'), 'paragraph-properties', 'text-align') === 'start');
      return result(bad);
    }),
  });

  cases.push({
    id: 'odsExport_the_excel_codes_become_opendocument_number_styles',
    description: 'la conversion du code d\'Excel en style de nombre : décimales, groupement, devise devant ou derrière, pourcentage ; dates (jour, mois en lettres, année) ; heure : « mm » après l\'heure compte les minutes, jamais le mois',
    run: async () => {
      const { bad, expect } = checker();
      await ready();
      const doc = (code, isDate) => parseXml('<r xmlns:number="' + NS.number + '" xmlns:style="' + NS.style + '">' + OdsExport.dataStyleXml('N1', code, isDate) + '</r>').documentElement.firstElementChild;
      const tags = el => Array.from(el.children).map(c => c.localName + (c.localName === 'text' ? '(' + c.textContent + ')' : ''));
      const plain = doc('#,##0.00', false);
      expect('« #,##0.00 » : un nombre à deux décimales groupé', plain.localName === 'number-style' && attr(plain.firstElementChild, 'number', 'decimal-places') === '2' && attr(plain.firstElementChild, 'number', 'min-decimal-places') === '2' && attr(plain.firstElementChild, 'number', 'grouping') === 'true', plain.outerHTML);
      const money = doc('"CHF "#,##0.00', false);
      expect('« "CHF "#,##0.00 » : la devise devant', tags(money).join(',') === 'text(CHF ),number', tags(money));
      const after = doc('#,##0.00 "€"', false);
      expect('« #,##0.00 "€" » : la devise derrière, après une espace', tags(after).join(',') === 'number,text( €)', tags(after));
      const range = doc('#,##0.0##', false);
      expect('« 0.0## » : au moins une décimale, jusqu\'à trois', attr(range.firstElementChild, 'number', 'min-decimal-places') === '1' && attr(range.firstElementChild, 'number', 'decimal-places') === '3', range.outerHTML);
      const integer = doc('0', false);
      expect('« 0 » : un entier sans groupement', attr(integer.firstElementChild, 'number', 'decimal-places') === '0' && attr(integer.firstElementChild, 'number', 'grouping') === '', integer.outerHTML);
      const percent = doc('0.0%', false);
      expect('« 0.0% » : un style de pourcentage', percent.localName === 'percentage-style' && tags(percent).join(',') === 'number,text(%)', percent.outerHTML);
      const frenchPercent = doc('#,##0 %', false);
      expect('« #,##0 % » : l\'espace avant le signe est gardée', frenchPercent.localName === 'percentage-style' && tags(frenchPercent).join(',') === 'number,text( %)', tags(frenchPercent));
      const day = doc('dd/mm/yyyy', true);
      expect('« dd/mm/yyyy » : jour, mois (en chiffres) et année longs', tags(day).join(',') === 'day,text(/),month,text(/),year' && attr(day.children[2], 'number', 'textual') === '' && attr(day.children[4], 'number', 'style') === 'long', day.outerHTML);
      const spelled = doc('dddd d mmmm yyyy', true);
      expect('« dddd d mmmm yyyy » : le jour de la semaine et le mois en lettres', tags(spelled).join(',') === 'day-of-week,text( ),day,text( ),month,text( ),year' && attr(spelled.children[4], 'number', 'textual') === 'true', spelled.outerHTML);
      const clock = doc('hh:mm', true);
      expect('« hh:mm » : les minutes (jamais le mois) derrière l\'heure', tags(clock).join(',') === 'hours,text(:),minutes', clock.outerHTML);
      const natural = doc('d mmm yyyy "à" h "h" mm', true);
      expect('« h "h" mm » : « mm » compte les minutes même derrière un texte', tags(natural).join(',') === 'day,text( ),month,text( ),year,text( à ),hours,text( h ),minutes' && attr(natural.children[2], 'number', 'textual') === 'true', tags(natural));
      const ampm = doc('h:mmam/pm', true);
      expect('« h:mmam/pm » : heure, minutes et am/pm', tags(ampm).join(',') === 'hours,text(:),minutes,am-pm', tags(ampm));
      const english = doc('mmm d, yyyy', true);
      expect('« mmm d, yyyy » : le mois (en lettres) avant le jour', tags(english).join(',') === 'month,text( ),day,text(, ),year', tags(english));
      const injected = doc('"</number:text><x/>"0', false);
      expect('un texte entre guillemets ne casse pas le XML', injected && tags(injected).join(',') === 'text(</number:text><x/>),number' && !injected.querySelector('parsererror'), tags(injected));
      return result(bad);
    },
  });

  cases.push({
    id: 'odsExport_rich_text_links_and_line_breaks',
    description: 'un texte de plusieurs styles (gras au milieu : des séries `text:span`), un lien (adresse sûre seulement), un retour à la ligne (un paragraphe par ligne)',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([160, 160], [30, 30, 30], [
        [td('un <strong>mot</strong> en gras'), td('<a href="https://example.org/page?a=1&b=2">le site</a>')],
        [td('ligne un<br>ligne deux'), td('<a href="javascript:alert(1)">piège</a>')],
        [td('<strong>tout gras</strong>'), td('<span style="color: #0000ff">bleu</span> et noir')],
      ]);
      const rich = x.cell(0, 1, 1);
      const spans = all(rich, 'text', 'span');
      expect('trois séries de texte dans la case', spans.length === 3 && x.cellText(0, 1, 1) === 'un mot en gras', [spans.length, x.cellText(0, 1, 1)]);
      expect('la série du milieu est en gras, pas les autres', x.prop(attr(spans[1], 'text', 'style-name'), 'text-properties', 'font-weight') === 'bold' && x.prop(attr(spans[0], 'text', 'style-name'), 'text-properties', 'font-weight') !== 'bold');
      const link = all(x.cell(0, 1, 2), 'text', 'a')[0];
      expect('le lien est un lien, avec son adresse', link && attr(link, 'xlink', 'href') === 'https://example.org/page?a=1&b=2' && link.textContent === 'le site', link && link.outerHTML);
      expect('le lien est souligné', x.prop(attr(x.cell(0, 1, 2), 'table', 'style-name'), 'text-properties', 'text-underline-style') === 'solid');
      expect('une adresse non sûre reste du texte', !all(x.cell(0, 2, 2), 'text', 'a').length && x.cellText(0, 2, 2) === 'piège');
      expect('un retour à la ligne fait deux paragraphes', all(x.cell(0, 2, 1), 'text', 'p').length === 2 && x.cellText(0, 2, 1) === 'ligne un\nligne deux', x.cellText(0, 2, 1));
      expect('une case toute en gras n\'a qu\'un style de case, sans série', !all(x.cell(0, 3, 1), 'text', 'span').length && x.prop(attr(x.cell(0, 3, 1), 'table', 'style-name'), 'text-properties', 'font-weight') === 'bold');
      expect('une case bleue puis noire a deux séries', all(x.cell(0, 3, 2), 'text', 'span').length === 2 && x.prop(attr(all(x.cell(0, 3, 2), 'text', 'span')[0], 'text', 'style-name'), 'text-properties', 'color') === '#0000ff');
      return result(bad);
    },
  });

  // ============================================================================================================================================================================================
  // 4. Images, feuilles, rapport, aller-retour
  // ============================================================================================================================================================================================
  cases.push({
    id: 'odsExport_images_are_written_once_sized_and_anchored_in_their_cell',
    description: 'une image de la grille : un fichier `Pictures/` (une fois pour trois positions), le manifeste, une image posée dans sa case à sa taille',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const image = width => `<td><p><img class="editor-image" src="${DATA_PNG}" style="width: ${width}px" data-layer="normal" data-wrap="inline"></p></td>`;
      const x = await exportGrid([200, 200], [120, 120], [[image(96), 'texte'], [image(40), image(40)]]);
      const pictures = x.names.filter(name => /^Pictures\//.test(name));
      expect('un seul fichier d\'image pour trois positions (c\'est la même image)', pictures.length === 1, pictures);
      const frame = all(x.cell(0, 1, 1), 'draw', 'frame')[0];
      expect('l\'image est dans sa case, à sa taille (96 px de large, carrée)', frame && near(number(attr(frame, 'svg', 'width')), cm(96), 0.01) && near(number(attr(frame, 'svg', 'height')), cm(96), 0.01), frame && frame.outerHTML.slice(0, 220));
      const image1 = frame && all(frame, 'draw', 'image')[0];
      expect('elle pointe sur un fichier du paquet', image1 && x.names.indexOf(attr(image1, 'xlink', 'href')) >= 0, image1 && attr(image1, 'xlink', 'href'));
      const manifest = parseXml(await x.text('META-INF/manifest.xml'));
      const entry = all(manifest, 'manifest', 'file-entry').find(el => attr(el, 'manifest', 'full-path') === pictures[0]);
      expect('le manifeste donne son type (image/png)', entry && attr(entry, 'manifest', 'media-type') === 'image/png', entry && entry.outerHTML);
      expect('les trois positions pointent sur ce fichier', all(x.content, 'draw', 'image').length === 3 && new Set(all(x.content, 'draw', 'image').map(el => attr(el, 'xlink', 'href'))).size === 1, all(x.content, 'draw', 'image').length);
      expect('la deuxième ligne a deux images de 40 px', [1, 2].every(col => { const f = all(x.cell(0, 2, col), 'draw', 'frame')[0]; return f && near(number(attr(f, 'svg', 'width')), cm(40), 0.01); }));
      expect('l\'image ne change pas le texte des autres cases', x.cellText(0, 1, 2) === 'texte');
      return result(bad);
    },
  });

  cases.push({
    id: 'odsExport_a_page_break_makes_a_sheet_and_unreadable_names_are_cleaned',
    description: 'un saut de page de la grille ouvre une feuille de plus (mêmes colonnes, lignes recomptées depuis 1) ; le nom d\'une feuille n\'a ni deux-points, ni barre, ni crochet',
    run: async (h) => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([100, 100], [30, 30, 30], [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']], { breaks: [2] });
      expect('deux feuilles : les deux premières lignes, puis la troisième', x.sheets.length === 2 && x.rows(0).length === 2 && x.rows(1).length === 1, [x.sheets.length, x.rows(0).length, x.rows(1).length]);
      expect('la deuxième feuille repart de la ligne 1', x.cellText(1, 1, 1) === 'a3' && x.cellText(1, 1, 2) === 'b3', [x.cellText(1, 1, 1), x.cellText(1, 1, 2)]);
      const names = x.sheets.map(sheet => attr(sheet, 'table', 'name'));
      expect('les deux feuilles ont des noms différents', names.length === 2 && names[0] !== names[1] && names.every(name => !/[:\\/?*[\]]/.test(name)), names);
      const recording = OdsExport.newRecordingWorkbook();
      const sheet = recording.addWorksheet('a/b:c', {});
      expect('un classeur d\'enregistrement retire une feuille par son numéro', recording.worksheets.length === 1 && (recording.removeWorksheet(sheet.id), recording.worksheets.length === 0));
      return result(bad);
    },
  });

  cases.push({
    id: 'odsExport_what_is_not_carried_is_counted',
    description: 'un tableau croisé est écrit comme un tableau ordinaire et COMPTÉ (`pivots`), un graphique repris en image aussi (`charts`) ; rien à dire pour une grille ordinaire',
    run: async () => {
      const { bad, expect } = checker();
      await ready();
      const workbook = OdsExport.newRecordingWorkbook();
      workbook.addWorksheet('Feuille', {});
      workbook.noteChart(); workbook.noteChart();
      const built = await OdsExport.build(workbook, { pivots: 3 });
      expect('deux graphiques et trois tableaux croisés sont comptés, dans cet ordre', JSON.stringify(built.report) === JSON.stringify([{ key: 'charts', n: 2 }, { key: 'pivots', n: 3 }]), built.report);
      const none = await OdsExport.build(OdsExport.newRecordingWorkbook(), {});
      const opened = await openOds(none.blob, none.report);
      expect('un classeur sans feuille écrit une feuille vide, pour que le fichier s\'ouvre', opened.sheets.length === 1 && !none.report.length, opened.sheets.length);
      const fr = I18n.t('odf.export.lost.charts', { n: 2 }); const frOne = I18n.t('odf.export.lost.pivots', { n: 1 });
      expect('les deux phrases existent dans les deux langues, au pluriel comme au singulier', /graphiques repris en images/.test(fr) && /tableau croisé écrit en tableau simple/.test(frOne)
        && await inLang('en', () => /charts kept as pictures/.test(I18n.t('odf.export.lost.charts', { n: 2 })) && /pivot table written as a plain table/.test(I18n.t('odf.export.lost.pivots', { n: 1 }))), [fr, frOne]);
      return result(bad);
    },
  });

  cases.push({
    id: 'odsExport_the_file_is_read_back_by_the_import',
    description: 'aller-retour : le .ods écrit est relu par l\'import OpenDocument tableur - même texte, mêmes fusions, mêmes largeurs, même gras, même fond, nombre et date relus comme texte affiché',
    run: async (h) => inLang('fr', async () => {
      const { bad, expect } = checker();
      await seed(h);
      const x = await exportGrid([120, 90, 150], [30, 30, 30], [
        [td('<strong>Titre</strong>', ' colspan="2" style="background-color: #ccddff"'), 'x'],
        ['Nom', badge('Montant', withFormat({ type: 'number', decimals: 2, currency: '€' })), badge('Date')],
        ['a', 'b', 'c'],
      ]);
      const back = await OdsImport.fromBuffer(await x.blob.arrayBuffer(), { lang: 'fr' });
      const body = new DOMParser().parseFromString('<body>' + back.html, 'text/html').body;
      const rows = Array.from(body.querySelectorAll('tr')).map(tr => Array.from(tr.children));
      const texts = rows.map(row => row.map(cell => cell.textContent.replace(/\s+/g, ' ').trim()));
      expect('une grille de trois colonnes et trois lignes', back.model.width === 3 && back.model.rows.length === 3, [back.model.width, back.model.rows.length]);
      expect('le titre court sur deux colonnes, puis « x »', rows[0].length === 2 && rows[0][0].getAttribute('colspan') === '2' && texts[0][0] === 'Titre' && texts[0][1] === 'x', texts[0]);
      expect('le titre est en gras', !!rows[0][0].querySelector('strong, b'));
      expect('le fond du titre est gardé', /#cc?dd?ff|rgb\(204, ?221, ?255\)/i.test(rows[0][0].getAttribute('style') || ''), rows[0][0].getAttribute('style'));
      expect('la deuxième ligne : le nom, le montant et la date tels qu\'affichés', texts[1][0] === 'Nom' && /1.?234,50.?€/.test(texts[1][1]) && /12\/09\/2026/.test(texts[1][2]), texts[1]);
      expect('la troisième ligne est celle de la grille', texts[2].join('|') === 'a|b|c', texts[2]);
      expect('les largeurs de colonnes sont relues (à un pixel près)', back.model.cols.length === 3 && [120, 90, 150].every((px, i) => near(back.model.cols[i], px, 1.5)), back.model.cols);
      return result(bad);
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odsExport = cases;
})();
