// Export OpenDocument tableur : la grille d'une ligne en un fichier .ods (LibreOffice Calc, OnlyOffice, Collabora...), SANS bibliothèque de plus : le zip (JSZip, déjà chargé) et son XML sont écrits à la main, comme l'import les lit
// (js/ods-import.js, qui sert d'essai d'aller-retour).
//
// La grille se lit EXACTEMENT comme pour Excel (js/xlsx-export.js : les largeurs et les hauteurs mesurées, les fusions, les nombres et les dates typés, les polices, les fonds, les traits, les liens, les images) : l'export Excel
// écrit dans un classeur d'enregistrement, que ce fichier fournit à sa place (même surface qu'ExcelJS, à peine plus de trente lignes) et qu'il écrit ensuite en OpenDocument. Un seul lecteur de la grille pour les deux
// formats : une correction de l'un vaut pour l'autre. Un nombre ou une date garde sa valeur ET le texte que la bulle écrit (la valeur sert aux calculs, le texte à l'affichage), avec un format d'affichage converti du code
// d'Excel en style de nombre OpenDocument.
//
// Ce que le fichier ne reprend pas est dit (`report`) : les tableaux croisés (écrits comme des tableaux ordinaires) et les graphiques créés (repris en image, plus modifiables).
const OdsExport = (function () {
  const STYLE = ExportCommon.EDITOR_STYLE;
  const MIME = 'application/vnd.oasis.opendocument.spreadsheet';
  const GENERATOR = 'Grist Factory';
  const BASE_FONT = 'Arial';
  const CM_PER_PX = 2.54 / 96;
  const CM_PER_PT = 2.54 / 72;
  const CM_PER_INCH = 2.54;
  const PX_PER_CHAR = 7;   // la largeur d'une colonne d'Excel (en caractères de Calibri 11) et sa marge : js/xlsx-export.js:columnWidthFromPx, à l'envers
  const PX_MARGIN = 5;
  const PAPER_MM = { 8: [297, 420], 9: [210, 297], 11: [148, 210], 70: [105, 148] };   // les codes de papier d'Excel (js/xlsx-export.js:PAPER_SIZES) en millimètres, portrait
  const THIN_BORDER = '0.75pt';
  const EMPTY_SHEET = 'Feuille';   // le nom d'une feuille quand le classeur n'en a aucune (comme js/xlsx-export.js:sheetNameFrom)
  const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };
  const { XML_HEAD, namespaceAttrs, escText, escAttr, fixed, attrsOf, textXml } = ExportCommon.OdfXml;
  const centimeters = value => fixed(value, 3) + 'cm';
  const colorOf = argb => '#' + String(argb).slice(-6).toLowerCase();

  // --- Le classeur d'enregistrement ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // La surface d'ExcelJS que lit js/xlsx-export.js:addRecordSheet, rien de plus : des colonnes, des lignes, des cases, des fusions et des images posées, que `build` écrit ensuite. Les numéros de ligne, de colonne et de
  // case commencent à 1, ceux de l'ancre d'une image (col, row) à 0, comme ExcelJS.
  function newSheet(workbook, id, name, options) {
    const sheet = { id, name, options, columns: new Map(), rows: new Map(), cells: new Map(), merges: [], pictures: [] };
    const entry = (map, number) => { if (!map.has(number)) map.set(number, {}); return map.get(number); };
    sheet.getColumn = number => entry(sheet.columns, number);
    sheet.getRow = number => entry(sheet.rows, number);
    sheet.getCell = (row, col) => { const key = row + ':' + col; if (!sheet.cells.has(key)) sheet.cells.set(key, { row, col }); return sheet.cells.get(key); };
    sheet.mergeCells = (top, left, bottom, right) => { sheet.merges.push({ row: top, col: left, rowspan: bottom - top + 1, colspan: right - left + 1 }); };
    sheet.addImage = (imageId, where) => { sheet.pictures.push({ image: workbook.images[imageId], col: where.tl.col, row: where.tl.row, width: where.ext.width, height: where.ext.height }); };
    return sheet;
  }
  function newRecordingWorkbook() {
    const sheets = [];
    const images = [];
    let nextId = 1;
    let charts = 0;
    const workbook = {
      recording: true,
      worksheets: sheets,
      images,
      addWorksheet: (name, options) => { const sheet = newSheet(workbook, nextId++, name, options || {}); sheets.push(sheet); return sheet; },
      getWorksheet: name => sheets.find(sheet => sheet.name === name),
      removeWorksheet: id => { const index = sheets.findIndex(sheet => sheet.id === id); if (index !== -1) sheets.splice(index, 1); },
      addImage: data => { images.push(data); return images.length - 1; },
      noteChart: () => { charts += 1; },
      chartCount: () => charts,
    };
    return workbook;
  }

  // --- Les formats de nombre et de date ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le code d'Excel que js/xlsx-export.js écrit (« #,##0.00 "€" », « 0.0% », « dd/mm/yyyy », « h "h" mm ») en style de nombre OpenDocument. Les séparateurs et les noms de mois ne sont pas écrits : le fichier s'affiche
  // dans la langue de la personne qui l'ouvre, comme dans Excel.
  const TOKEN_OF_NUMBER = /"[^"]*"|[#0,.]+|[\s\S]/g;
  function numberStyleXml(name, code) {
    let percent = false;
    let inner = '';
    let text = '';
    const flush = () => { if (text) inner += '<number:text>' + escText(text) + '</number:text>'; text = ''; };
    (String(code).match(TOKEN_OF_NUMBER) || []).forEach(token => {
      if (token[0] === '"') { text += token.slice(1, token.endsWith('"') && token.length > 1 ? -1 : undefined); return; }
      if (/^[#0,.]+$/.test(token) && /[#0]/.test(token)) {
        flush();
        const parts = token.split('.');
        const decimals = parts[1] || '';
        const minimum = (decimals.match(/0/g) || []).length;
        const integers = (parts[0].match(/0/g) || []).length;
        inner += '<number:number number:decimal-places="' + decimals.replace(/,/g, '').length + '" number:min-decimal-places="' + minimum + '" number:min-integer-digits="' + integers + '"' + (parts[0].indexOf(',') !== -1 ? ' number:grouping="true"' : '') + '/>';
        return;
      }
      if (token === '%') percent = true;
      text += token;
    });
    flush();
    const tag = percent ? 'number:percentage-style' : 'number:number-style';
    return { xml: '<' + tag + ' style:name="' + name + '">' + inner + '</' + tag + '>', percent, withTime: false };
  }
  const TOKEN_OF_DATE = /"[^"]*"|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|[\s\S]/gi;
  function dateStyleXml(name, code) {
    let inner = '';
    let text = '';
    let withTime = false;
    let afterHour = false;   // un « m » derrière une heure (des textes entre les deux : « h "h" mm ») compte les minutes, jamais le mois
    const flush = () => { if (text) inner += '<number:text>' + escText(text) + '</number:text>'; text = ''; };
    const element = (tag, attrs) => { flush(); inner += '<number:' + tag + (attrs || '') + '/>'; };
    (String(code).match(TOKEN_OF_DATE) || []).forEach(token => {
      const word = token.toLowerCase();
      if (token[0] === '"') { text += token.slice(1, token.endsWith('"') && token.length > 1 ? -1 : undefined); return; }
      if (word === 'h' || word === 'hh') { element('hours', word === 'hh' ? ' number:style="long"' : ''); withTime = true; afterHour = true; return; }
      if ((word === 'm' || word === 'mm') && afterHour) { element('minutes', word === 'mm' ? ' number:style="long"' : ''); withTime = true; afterHour = false; return; }
      if (word === 's' || word === 'ss') { element('seconds', word === 'ss' ? ' number:style="long"' : ''); withTime = true; afterHour = false; return; }
      if (word === 'am/pm') { element('am-pm'); return; }
      const dated = { yyyy: ['year', ' number:style="long"'], yy: ['year', ''], mmmm: ['month', ' number:textual="true" number:style="long"'], mmm: ['month', ' number:textual="true"'], mm: ['month', ' number:style="long"'], m: ['month', ''],
        dddd: ['day-of-week', ' number:style="long"'], ddd: ['day-of-week', ''], dd: ['day', ' number:style="long"'], d: ['day', ''] }[word];
      if (dated) { element(dated[0], dated[1]); afterHour = false; return; }
      text += token;
    });
    flush();
    return { xml: '<number:date-style style:name="' + name + '">' + inner + '</number:date-style>', percent: false, withTime };
  }
  function dataStyleOf(ctx, code, isDate) {
    // Le style de nombre ou de date du code `code` : écrit à la première demande ({ name, percent, withTime }) ; rien sans code.
    if (!code) return null;
    const key = (isDate ? 'date:' : 'number:') + code;
    if (!ctx.dataStyles.has(key)) {
      const name = 'N' + (ctx.dataStyles.size + 1);
      const made = isDate ? dateStyleXml(name, code) : numberStyleXml(name, code);
      ctx.dataStyles.set(key, { name, percent: made.percent, withTime: made.withTime });
      ctx.dataStyleXml.push(made.xml);
    }
    return ctx.dataStyles.get(key);
  }

  // Le style de nombre ou de date `name` du code d'Excel `code`, en XML (ce que `dataStyleOf` écrit dans le fichier) : de quoi l'essayer seul.
  const dataStyleXml = (name, code, isDate) => (isDate ? dateStyleXml : numberStyleXml)(name, code).xml;

  // --- Les styles : un par réglage différent (ce1, T1, co1, ro1...) --------------------------------------------------------------------------------------------------------------------------------------
  function newContext() {
    return { names: new Map(), counts: {}, autoStyles: [], dataStyles: new Map(), dataStyleXml: [], fonts: new Set([BASE_FONT]), pages: new Map(), pageXml: [], masterXml: [], images: new Map(), parts: [] };
  }
  function named(ctx, kind, key, prefix, xmlOf) {
    // Le nom du style de ce réglage, écrit à la première demande ; `kind` : la famille (les noms ne se mêlent pas entre familles).
    const full = kind + '|' + key;
    if (ctx.names.has(full)) return ctx.names.get(full);
    ctx.counts[kind] = (ctx.counts[kind] || 0) + 1;
    const name = prefix + ctx.counts[kind];
    ctx.names.set(full, name);
    ctx.autoStyles.push(xmlOf(name));
    return name;
  }
  function textProperties(ctx, font) {
    // Les réglages de caractères d'une police d'ExcelJS (celle de js/xlsx-export.js:fontOf).
    const look = font || {};
    const props = [];
    if (look.name) { ctx.fonts.add(look.name); props.push(['style:font-name', look.name]); }
    if (look.size) props.push(['fo:font-size', fixed(look.size, 2) + 'pt']);
    if (look.bold) props.push(['fo:font-weight', 'bold']);
    if (look.italic) props.push(['fo:font-style', 'italic']);
    if (look.underline) props.push(['style:text-underline-style', 'solid'], ['style:text-underline-width', 'auto'], ['style:text-underline-color', 'font-color']);
    if (look.strike) props.push(['style:text-line-through-style', 'solid']);
    if (look.vertAlign === 'superscript') props.push(['style:text-position', 'super 58%']);
    else if (look.vertAlign === 'subscript') props.push(['style:text-position', 'sub 58%']);
    if (look.color && look.color.argb) props.push(['fo:color', colorOf(look.color.argb)]);
    return props.length ? '<style:text-properties' + attrsOf(props) + '/>' : '';
  }
  const HORIZONTAL = { left: 'start', right: 'end', center: 'center', justify: 'justify' };
  const VERTICAL = { top: 'top', middle: 'middle', bottom: 'bottom' };
  function cellStyleOf(ctx, cell, dataStyle) {
    const key = JSON.stringify([cell.font, cell.alignment, cell.fill, cell.border, dataStyle && dataStyle.name]);
    return named(ctx, 'cell', key, 'ce', name => {
      const alignment = cell.alignment || {};
      const cellProps = [['style:vertical-align', VERTICAL[alignment.vertical]], ['fo:wrap-option', alignment.wrapText ? 'wrap' : null]];
      if (cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb) cellProps.push(['fo:background-color', colorOf(cell.fill.fgColor.argb)]);
      ['top', 'bottom', 'left', 'right'].forEach(side => {
        const edge = cell.border && cell.border[side];
        cellProps.push(['fo:border-' + side, edge ? THIN_BORDER + ' solid ' + colorOf(edge.color && edge.color.argb ? edge.color.argb : 'FF777777') : (cell.border ? 'none' : null)]);
      });
      return '<style:style style:name="' + name + '" style:family="table-cell" style:parent-style-name="Default"' + (dataStyle ? ' style:data-style-name="' + dataStyle.name + '"' : '') + '>'
        + '<style:table-cell-properties' + attrsOf(cellProps) + '/>'
        + (HORIZONTAL[alignment.horizontal] ? '<style:paragraph-properties fo:text-align="' + HORIZONTAL[alignment.horizontal] + '"/>' : '') + textProperties(ctx, cell.font) + '</style:style>';
    });
  }
  const columnStyleOf = (ctx, widthCm) => named(ctx, 'column', widthCm, 'co', name => '<style:style style:name="' + name + '" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="' + widthCm + '"/></style:style>');
  const rowStyleOf = (ctx, heightCm) => named(ctx, 'row', heightCm, 'ro', name => '<style:style style:name="' + name + '" style:family="table-row"><style:table-row-properties style:row-height="' + heightCm + '" fo:break-before="auto" style:use-optimal-row-height="false"/></style:style>');
  function pageOf(ctx, sheet) {
    // La page de la feuille (format, sens, marges, une page de large) : une page maîtresse par réglage différent, « Default » pour la première ; rend le style de la table qui s'y range.
    const setup = sheet.options.pageSetup || {};
    const paper = PAPER_MM[setup.paperSize] || PAPER_MM[9];
    const landscape = setup.orientation === 'landscape';
    const size = landscape ? [paper[1], paper[0]] : paper;
    const margins = Object.assign({ left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 }, setup.margins || {});
    const key = JSON.stringify([size, landscape, margins.left, margins.right, margins.top, margins.bottom]);
    if (!ctx.pages.has(key)) {
      const index = ctx.pages.size + 1;
      const layout = 'pm' + index;
      const master = index === 1 ? 'Default' : 'Page' + index;
      ctx.pageXml.push('<style:page-layout style:name="' + layout + '"><style:page-layout-properties fo:page-width="' + centimeters(size[0] / 10) + '" fo:page-height="' + centimeters(size[1] / 10) + '" style:print-orientation="' + (landscape ? 'landscape' : 'portrait')
        + '" fo:margin-top="' + centimeters(margins.top * CM_PER_INCH) + '" fo:margin-bottom="' + centimeters(margins.bottom * CM_PER_INCH) + '" fo:margin-left="' + centimeters(margins.left * CM_PER_INCH) + '" fo:margin-right="' + centimeters(margins.right * CM_PER_INCH)
        + '" style:scale-to-X="1" style:scale-to-Y="0" style:writing-mode="lr-tb" style:print="objects charts drawings zero-values"/></style:page-layout>');
      ctx.masterXml.push('<style:master-page style:name="' + master + '" style:page-layout-name="' + layout + '"/>');
      ctx.pages.set(key, master);
    }
    const master = ctx.pages.get(key);
    return named(ctx, 'table', master, 'ta', name => '<style:style style:name="' + name + '" style:family="table" style:master-page-name="' + master + '"><style:table-properties table:display="true" style:writing-mode="lr-tb"/></style:style>');
  }

  // --- Le contenu d'une case ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const paragraph = (inner) => '<text:p>' + inner + '</text:p>';
  const linesOf = text => String(text).replace(/\r\n?/g, '\n').split('\n');
  function textStyleOf(ctx, font) {
    const props = textProperties(ctx, font);
    return named(ctx, 'text', props, 'T', name => '<style:style style:name="' + name + '" style:family="text">' + props + '</style:style>');
  }
  function richBody(ctx, runs) {
    // Un texte de plusieurs styles : un paragraphe par ligne, une série par style (`text:span`).
    const lines = [[]];
    runs.forEach(run => linesOf(run.text).forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece !== '') lines[lines.length - 1].push({ text: piece, font: run.font });
    }));
    return lines.map(line => {
      const state = { blank: true };
      return paragraph(line.map(part => '<text:span text:style-name="' + textStyleOf(ctx, part.font) + '">' + textXml(part.text, state) + '</text:span>').join(''));
    }).join('');
  }
  function plainBody(text, href) {
    return linesOf(text).map(line => {
      const inner = textXml(line, { blank: true });
      return paragraph(href && inner ? '<text:a xlink:type="simple" xlink:href="' + escAttr(href) + '">' + inner + '</text:a>' : inner);
    }).join('');
  }
  function typedContent(ctx, cell) {
    const isDate = cell.value instanceof Date;
    const style = dataStyleOf(ctx, cell.numFmt, isDate);
    const shown = cell.shown === undefined ? '' : cell.shown;
    if (isDate) {
      const withTime = style ? style.withTime : false;
      return { dataStyle: style, attrs: [['office:value-type', 'date'], ['office:date-value', cell.value.toISOString().slice(0, withTime ? 19 : 10)]], body: paragraph(textXml(shown, { blank: true })) };
    }
    return { dataStyle: style, attrs: [['office:value-type', style && style.percent ? 'percentage' : 'float'], ['office:value', String(cell.value)]], body: paragraph(textXml(shown, { blank: true })) };
  }
  function contentOf(ctx, cell) {
    const value = cell.value;
    if (value === undefined || value === null || value === '') return { dataStyle: null, attrs: [], body: '' };
    if (value instanceof Date || typeof value === 'number') return typedContent(ctx, cell);
    if (typeof value === 'object' && Array.isArray(value.richText)) return { dataStyle: null, attrs: [['office:value-type', 'string']], body: richBody(ctx, value.richText) };
    if (typeof value === 'object' && value.hyperlink) return { dataStyle: null, attrs: [['office:value-type', 'string']], body: plainBody(value.text, value.hyperlink) };
    return { dataStyle: null, attrs: [['office:value-type', 'string']], body: plainBody(typeof value === 'object' ? value.text : value) };
  }

  // --- La feuille ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function imagePart(ctx, picture) {
    // Le fichier de l'image dans `Pictures/`, écrit une seule fois même posée plusieurs fois (le même contenu) ; rend son chemin.
    const key = picture.image.extension + ':' + picture.image.base64;
    if (!ctx.images.has(key)) {
      const path = 'Pictures/image' + (ctx.images.size + 1) + '.' + picture.image.extension;
      ctx.images.set(key, path);
      ctx.parts.push({ path, data: picture.image.base64, type: IMAGE_TYPES[picture.image.extension] || 'image/png' });
    }
    return ctx.images.get(key);
  }
  function frameXml(ctx, picture, number) {
    const style = named(ctx, 'graphic', 'plain', 'gr', name => '<style:style style:name="' + name + '" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" style:mirror="none"/></style:style>');
    return '<draw:frame draw:z-index="0" draw:name="' + escAttr('Image ' + number) + '" draw:style-name="' + style + '" svg:width="' + centimeters(picture.width * CM_PER_PX) + '" svg:height="' + centimeters(picture.height * CM_PER_PX) + '" svg:x="0cm" svg:y="0cm">'
      + '<draw:image xlink:href="' + imagePart(ctx, picture) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>';
  }
  function sheetExtent(sheet) {
    let rows = 0;
    let cols = 0;
    sheet.cells.forEach(cell => { rows = Math.max(rows, cell.row); cols = Math.max(cols, cell.col); });
    sheet.rows.forEach((_, number) => { rows = Math.max(rows, number); });
    sheet.columns.forEach((_, number) => { cols = Math.max(cols, number); });
    sheet.pictures.forEach(picture => { rows = Math.max(rows, picture.row + 1); cols = Math.max(cols, picture.col + 1); });
    return { rows, cols };
  }
  function columnsXml(ctx, sheet, count) {
    // Les colonnes : celles qui se suivent avec la même largeur n'en font qu'une, répétée.
    const widths = [];
    for (let col = 1; col <= count; col++) {
      const chars = sheet.columns.has(col) ? sheet.columns.get(col).width : 0;
      widths.push(chars > 0 ? centimeters((chars * PX_PER_CHAR + PX_MARGIN) * CM_PER_PX) : '');
    }
    let out = '';
    for (let index = 0; index < widths.length;) {
      let end = index + 1;
      while (end < widths.length && widths[end] === widths[index]) end += 1;
      out += '<table:table-column' + attrsOf([['table:style-name', widths[index] ? columnStyleOf(ctx, widths[index]) : null], ['table:number-columns-repeated', end - index > 1 ? end - index : null]]) + ' table:default-cell-style-name="Default"/>';
      index = end;
    }
    return out;
  }
  function sheetXml(ctx, sheet) {
    const { rows, cols } = sheetExtent(sheet);
    const masters = new Map();
    const covered = new Set();
    sheet.merges.forEach(merge => {
      masters.set(merge.row + ':' + merge.col, merge);
      for (let row = merge.row; row < merge.row + merge.rowspan; row++) for (let col = merge.col; col < merge.col + merge.colspan; col++) if (row !== merge.row || col !== merge.col) covered.add(row + ':' + col);
    });
    const pictures = new Map();
    sheet.pictures.forEach(picture => { const key = (picture.row + 1) + ':' + (picture.col + 1); pictures.set(key, (pictures.get(key) || []).concat(picture)); });
    let frames = 0;
    const cellXml = (row, col) => {
      const key = row + ':' + col;
      const cell = sheet.cells.get(key);
      const isCovered = covered.has(key);
      const here = pictures.get(key) || [];
      if (!cell && !isCovered && !here.length) return '';
      const content = cell ? contentOf(ctx, cell) : { dataStyle: null, attrs: [], body: '' };
      const merge = masters.get(key);
      const style = cell ? cellStyleOf(ctx, cell, content.dataStyle) : null;
      const tag = isCovered ? 'table:covered-table-cell' : 'table:table-cell';
      const attrs = attrsOf([['table:style-name', style], ['table:number-columns-spanned', merge && merge.colspan > 1 ? merge.colspan : null], ['table:number-rows-spanned', merge && merge.rowspan > 1 ? merge.rowspan : null]].concat(content.attrs));
      const inner = content.body + here.map(picture => frameXml(ctx, picture, ++frames)).join('');
      return inner ? '<' + tag + attrs + '>' + inner + '</' + tag + '>' : '<' + tag + attrs + '/>';
    };
    let out = '<table:table table:name="' + escAttr(sheet.name) + '" table:style-name="' + pageOf(ctx, sheet) + '">' + columnsXml(ctx, sheet, cols);
    for (let row = 1; row <= rows; row++) {
      const height = sheet.rows.has(row) ? sheet.rows.get(row).height : 0;
      let line = '';
      let empty = 0;
      for (let col = 1; col <= cols; col++) {
        const made = cellXml(row, col);
        if (made === '') { empty += 1; continue; }
        if (empty) line += '<table:table-cell' + (empty > 1 ? ' table:number-columns-repeated="' + empty + '"' : '') + '/>';
        empty = 0;
        line += made;
      }
      out += '<table:table-row' + attrsOf([['table:style-name', height > 0 ? rowStyleOf(ctx, centimeters(height * CM_PER_PT)) : null]]) + '>' + (line || '<table:table-cell/>') + '</table:table-row>';
    }
    return out + '</table:table>';
  }

  // --- Les fichiers du paquet ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const fontFaces = ctx => Array.from(ctx.fonts).map(font => '<style:font-face style:name="' + escAttr(font) + '" svg:font-family="' + escAttr(/\s/.test(font) ? "'" + font + "'" : font) + '"/>').join('');
  const stylesXml = ctx => XML_HEAD + '<office:document-styles ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:styles>'
    + '<style:style style:name="Default" style:family="table-cell"><style:text-properties style:font-name="' + BASE_FONT + '" fo:font-size="' + STYLE.bodyPt + 'pt"/></style:style></office:styles>'
    + '<office:automatic-styles>' + ctx.pageXml.join('') + '</office:automatic-styles><office:master-styles>' + ctx.masterXml.join('') + '</office:master-styles></office:document-styles>';
  const contentXml = (ctx, body) => XML_HEAD + '<office:document-content ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:automatic-styles>'
    + ctx.dataStyleXml.join('') + ctx.autoStyles.join('') + '</office:automatic-styles><office:body><office:spreadsheet>' + body + '</office:spreadsheet></office:body></office:document-content>';
  const metaXml = title => XML_HEAD + '<office:document-meta ' + namespaceAttrs + ' office:version="1.3"><office:meta><meta:generator>' + GENERATOR + '</meta:generator>' + (title ? '<dc:title>' + escText(title) + '</dc:title>' : '')
    + '<meta:creation-date>' + new Date().toISOString().slice(0, 19) + '</meta:creation-date></office:meta></office:document-meta>';
  // Le quadrillage de LibreOffice éteint : les cases portent leurs traits, comme à l'écran de l'éditeur (js/xlsx-export.js : `showGridLines: false`).
  const settingsXml = () => XML_HEAD + '<office:document-settings ' + namespaceAttrs + ' office:version="1.3"><office:settings><config:config-item-set config:name="ooo:configuration-settings">'
    + '<config:config-item config:name="ShowGrid" config:type="boolean">false</config:config-item></config:config-item-set></office:settings></office:document-settings>';
  function manifestXml(ctx) {
    const entry = (path, type) => '<manifest:file-entry manifest:full-path="' + path + '" manifest:media-type="' + type + '"/>';
    return XML_HEAD + '<manifest:manifest ' + namespaceAttrs + ' manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="' + MIME + '"/>'
      + entry('content.xml', 'text/xml') + entry('styles.xml', 'text/xml') + entry('meta.xml', 'text/xml') + entry('settings.xml', 'text/xml') + ctx.parts.map(part => entry(part.path, part.type)).join('') + '</manifest:manifest>';
  }

  // Le classeur d'enregistrement `workbook` en fichier : { blob, report: [{ key, n }] } ; `options.pivots` : le nombre de tableaux croisés que les documents écrivaient (écrits ici comme des tableaux ordinaires), `options.title` : le titre.
  async function build(workbook, options) {
    const opts = options || {};
    await ExportCommon.ensureJsZipLoaded();
    const ctx = newContext();
    const body = workbook.worksheets.map(sheet => sheetXml(ctx, sheet)).join('') || '<table:table table:name="' + escAttr(EMPTY_SHEET) + '"><table:table-column/><table:table-row><table:table-cell/></table:table-row></table:table>';
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifestXml(ctx), { createFolders: false });
    ctx.parts.forEach(part => zip.file(part.path, part.data, { base64: true, createFolders: false }));
    zip.file('content.xml', contentXml(ctx, body));
    zip.file('styles.xml', stylesXml(ctx));
    zip.file('meta.xml', metaXml(opts.title));
    zip.file('settings.xml', settingsXml());
    const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
    const report = [];
    if (workbook.chartCount()) report.push({ key: 'charts', n: workbook.chartCount() });
    if (opts.pivots) report.push({ key: 'pivots', n: opts.pivots });
    return { blob, report };
  }

  // --- Les exports ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // La grille d'une ligne : un classeur d'une feuille (une de plus à chaque saut de page de la grille). `options` : la page (celle de js/xlsx-export.js:pageOptionsFromLayout à défaut).
  async function getOdsBlobForRecord(htmlContent, tableId, record, filenameTemplate, options) {
    await ExportEngines.ensure('xlsx');   // le lecteur de grille de l'export Excel (jamais ExcelJS : le classeur d'enregistrement le remplace)
    const workbook = newRecordingWorkbook();
    const added = await XlsxExport.recordAppender(workbook, options)(htmlContent, tableId, record, filenameTemplate);
    const built = await build(workbook, { pivots: added.pivots, title: added.filename });
    return { blob: built.blob, filename: added.filename, report: built.report };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, options) {
    if (!record) { alert(I18n.t('alert.noRecordForExportOdf')); return null; }
    const made = await getOdsBlobForRecord(htmlContent, tableId, record, filenameTemplate, options);
    ExportCommon.downloadBlob(made.blob, (made.filename || 'publipostage') + '.ods');
    return made;
  }

  return { build, newRecordingWorkbook, dataStyleXml, getOdsBlobForRecord, exportCurrentRecord, MIME };
})();
