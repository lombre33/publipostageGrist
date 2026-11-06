// Import d'un classeur Excel (.xlsx) dans une grille (planning/feature-mode-grille-excel.md). Le contraire de l'export de js/xlsx-export.js : une
// feuille visible du classeur devient une nouvelle grille, case par case - texte tel que l'affiche Excel (formats de nombre et de date :
// js/xlsx-number-format.js), cases fusionnées, largeur des colonnes et hauteur des lignes, gras / italique / souligné / barré, couleur et taille du
// texte, fond, bordures (couleur), alignements horizontal et vertical, liens, retours à la ligne dans une case. Même modèle de cases que le collage
// d'un tableau de tableur (js/grid-table.js) : le classeur sort par le même `GridTable.toHtml`, un tableau collé et un tableau importé ne peuvent pas
// diverger.
//   GridXlsxImport.openFile(file) -> Promise<{ sheets: [{ index, name }], build(index, { lang }) }>
//     le classeur lu une fois : ses feuilles visibles, dans l'ordre d'Excel, et la grille de celle qu'on choisit
//   GridXlsxImport.chooseSheet(sheets, { anchor }) -> Promise<index | null>
//     la liste avec recherche des feuilles (js/search-select.js), sous le rectangle que rend `anchor()` ; null : Échap ou un clic ailleurs
//   GridXlsxImport.importFile(file, { lang, sheetIndex? }) -> Promise<{ html, model, sheetName, sheetIndex, sheetCount, rows, cols }>
//     rejette avec une Error dont `code` dit pourquoi
//   GridXlsxImport.fromArrayBuffer(buffer, { lang, sheetIndex? }) -> idem, depuis les octets du fichier
//   GridXlsxImport.chooseFile(onFile[, accept]) -> ouvre le sélecteur de fichier (celui des classeurs, ou des types `accept`) ; `onFile(file)` n'est appelé que si un fichier est choisi
// Codes d'erreur : 'oldFormat' (un .xls ou un classeur protégé par mot de passe : le fichier est un conteneur OLE, pas un zip), 'unreadable' (pas un
// classeur), 'empty' (aucune case utile), 'tooBig' (plus de MAX_ROWS lignes, MAX_COLS colonnes ou MAX_CELLS cases : la grille serait inutilisable,
// rien n'est coupé en silence), 'fileTooBig' (le fichier pèse plus de MAX_FILE_BYTES, ou plus de MAX_UNPACKED_BYTES une fois défait d'après son répertoire : `size` et `max` en octets).
// `report` (un tableau [{ key, n }]) dit ce que l'import n'a pas repris tel quel : formules remplacées par leur résultat, mise en forme conditionnelle, images, graphiques, formes,
// commentaires, lignes et colonnes masquées, motifs et dégradés de fond, styles de trait (épais, pointillé, double) et textes tournés. Les feuilles, lignes et colonnes masquées ne sont pas importées. Un classeur qui a plusieurs feuilles visibles demande laquelle devient la grille
// (une liste avec recherche) : une seule est importée, les autres ne le sont pas. Pas importés : formules (le résultat calculé est écrit), images,
// graphiques, commentaires, mise en forme conditionnelle, police, retrait, orientation du texte. Dépend de GridTable (js/grid-table.js), TableBorders
// (js/table-borders.js), XlsxNumberFormat (js/xlsx-number-format.js) et XlsxExport (chargement paresseux d'ExcelJS), deux moteurs que
// ExportEngines (js/export-engines.js) charge au premier import.
const GridXlsxImport = (function () {
  const MAX_ROWS = 1000;
  const MAX_COLS = 100;
  const MAX_FILE_BYTES = 100 * 1024 * 1024;       // un classeur plus lourd n'est pas lu
  const MAX_UNPACKED_BYTES = 600 * 1024 * 1024;   // ce qu'il pèse une fois défait, d'après son répertoire : plus, c'est une bombe de compression (même mesure que l'import PowerPoint)
  const MAX_CELLS = 5000; // la frappe dans une grille coûte à proportion de son nombre de cases : au-delà, elle devient pénible
  const MIN_COL_PX = 24; // la plus petite colonne d'une grille
  const DEFAULT_COL_PX = 64; // 8,43 caractères : la largeur d'une colonne sans largeur écrite
  const DEFAULT_ROW_PT = 15;
  const DEFAULT_SIZE_PT = 11;
  // Ceux des types de valeur d'ExcelJS (ExcelJS.ValueType) qu'on distingue ; les autres se lisent comme une valeur simple (`scalar`).
  const T = { Null: 0, Merge: 1, Hyperlink: 5, Formula: 6, RichText: 8, Error: 10 };

  function fail(code, message, details) { return Object.assign(new Error(message || code), { code }, details || {}); }

  // Les couleurs d'Excel : la palette du thème du classeur et ses teintes, les couleurs « indexées », la couleur d'un trait de case.
  const { themePalette, colorHex, sideColor } = (function () {
    // La palette par défaut d'Office (un thème absent ou illisible), dans l'ordre des index de thème d'Excel : fond 1, texte 1, fond 2, texte 2,
    // accents 1 à 6, lien, lien suivi.
    const DEFAULT_THEME = ['ffffff', '000000', 'e7e6e6', '44546a', '4472c4', 'ed7d31', 'a5a5a5', 'ffc000', '5b9bd5', '70ad47', '0563c1', '954f72'];
    const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    // Les 64 couleurs « indexées » d'Excel (anciens classeurs, couleurs de la palette de base) ; 64 et 65 sont le texte et le fond du système.
    const INDEXED = ('000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 800000 008000 000080 808000 800080 008080 c0c0c0 808080 '
      + '9999ff 993366 ffffcc ccffff 660066 ff8080 0066cc ccccff 000080 ff00ff ffff00 00ffff 800080 800000 008080 0000ff 00ccff ccffff ccffcc ffff99 99ccff ff99cc cc99ff ffcc99 '
      + '3366ff 33cccc 99cc00 ffcc00 ff9900 ff6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').split(' ');

    // La palette du thème du classeur (ExcelJS en garde le XML tel quel dans `_themes`) : « <a:accent1><a:srgbClr val="4472C4"/> », ou
    // « <a:dk1><a:sysClr ... lastClr="000000"/> ».
    function themePalette(workbook) {
      const themes = workbook && workbook._themes;
      const xml = themes ? String(themes.theme1 || Object.values(themes)[0] || '') : '';
      return THEME_ORDER.map((name, i) => {
        const m = new RegExp('<a:' + name + '>\\s*<a:(?:srgbClr\\s+val="([0-9a-fA-F]{6})"|sysClr[^>]*lastClr="([0-9a-fA-F]{6})")').exec(xml);
        return m ? (m[1] || m[2]).toLowerCase() : DEFAULT_THEME[i];
      });
    }

    // Une teinte d'Excel (`tint` de -1 à 1) : -0,25 assombrit de 25 %, +0,4 éclaircit de 40 %, dans l'espace teinte / luminosité / saturation.
    function applyTint(hex, tint) {
      if (!tint) return hex;
      const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      let l = (max + min) / 2;
      if (max !== min) {
        const delta = max - min;
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        h = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        h /= 6;
      }
      l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
      const hue = (p, q, t) => { let u = t; if (u < 0) u += 1; if (u > 1) u -= 1; if (u < 1 / 6) return p + (q - p) * 6 * u; if (u < 1 / 2) return q; if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6; return p; };
      let out;
      if (s === 0) out = [l, l, l];
      else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        out = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
      }
      return out.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
    }

    // Une couleur d'ExcelJS - { argb }, { theme, tint }, { indexed } ou rien (« automatique ») - en « #rrggbb » ; null quand elle n'en dit pas.
    function colorHex(color, palette) {
      if (!color) return null;
      if (typeof color.argb === 'string' && color.argb.length >= 6) return '#' + color.argb.slice(-6).toLowerCase();
      if (color.theme !== undefined && color.theme !== null) { const base = palette[color.theme]; return base ? '#' + applyTint(base, color.tint || 0) : null; }
      if (color.indexed !== undefined && color.indexed !== null) { const base = color.indexed === 64 ? '000000' : color.indexed === 65 ? 'ffffff' : INDEXED[color.indexed]; return base ? '#' + base : null; }
      return null;
    }

    // Le trait fin gris de départ d'une case de grille (celui que js/xlsx-export.js écrit sur les côtés sans couleur choisie,
    // js/pdf-export.js:TABLE_BORDER_COLOR) : le relire comme une couleur choisie ferait d'une grille exportée puis importée une grille aux traits
    // « colorés » en gris - qui ne suivraient plus le trait de départ. Un côté sans trait n'a pas de couleur non plus : le trait de départ.
    const DEFAULT_LINE = '#777777';
    const sideColor = (side, palette) => {
      if (!side || !side.style || side.style === 'none') return null;
      const hex = colorHex(side.color, palette) || '#000000';
      return hex === DEFAULT_LINE ? null : hex;
    };
    return { themePalette, colorHex, sideColor };
  })();

  const underlineOn = value => !!value && value !== 'none';

  // La mise en forme d'une police d'Excel : seules les propriétés écrites y figurent (une plage de texte riche ne redit que ce qui change).
  function fontFormat(font, color) {
    const fmt = {};
    if (!font) return fmt;
    if (font.bold !== undefined) fmt.bold = !!font.bold;
    if (font.italic !== undefined) fmt.italic = !!font.italic;
    if (font.underline !== undefined) fmt.underline = underlineOn(font.underline);
    if (font.strike !== undefined) fmt.strike = !!font.strike;
    if (font.size !== undefined) fmt.size = font.size;
    if (font.name) fmt.font = String(font.name);
    if (font.vertAlign === 'superscript') fmt.sup = true;
    else if (font.vertAlign === 'subscript') fmt.sub = true;
    if (font.color) { const hex = color(font.color); fmt.color = hex === '#000000' ? null : hex; }
    return fmt;
  }

  // Le texte de la valeur, découpé en plages de même mise en forme : [{ text, fmt?, href? }], et son genre (`number`, `date`, `bool`, `error` ou
  // `text`) qui règle l'alignement « Standard ».
  function contentOf(cell, numFmt, options) {
    const { lang, color } = options;
    const value = cell.value;
    const format = v => XlsxNumberFormat.format(v, numFmt, { lang });
    const runsOf = (rich) => rich.map(run => ({ text: run.text || '', fmt: fontFormat(run.font, color) }));
    const link = (href, runs) => (GridTable.isSafeLink(href) ? runs.map(run => Object.assign({}, run, { href: String(href).trim() })) : runs);
    // Le texte d'un lien : des plages de texte riche, ou le texte seul.
    const hyperlinkText = (v) => {
      if (v && typeof v.text === 'object' && v.text) return runsOf(v.text.richText || []);
      return [{ text: v && v.text !== undefined ? String(v.text) : '' }];
    };
    const scalar = (v) => {
      if (v === null || v === undefined) return { runs: [], kind: 'text' };
      if (typeof v === 'boolean') return { runs: [{ text: format(v) }], kind: 'bool' };
      if (typeof v === 'number') return { runs: [{ text: format(v) }], kind: XlsxNumberFormat.isDateFormat(numFmt) ? 'date' : 'number' };
      if (Object.prototype.toString.call(v) === '[object Date]') return { runs: [{ text: format(v) }], kind: 'date' };
      if (typeof v === 'object' && v.error) return { runs: [{ text: String(v.error) }], kind: 'error' };
      return { runs: [{ text: format(String(v)) }], kind: 'text' };
    };
    switch (cell.type) {
      case T.Null: case T.Merge: return { runs: [], kind: 'text' };
      case T.RichText: return { runs: runsOf(value.richText || []), kind: 'text' };
      case T.Hyperlink: return { runs: link(value && value.hyperlink, hyperlinkText(value)), kind: 'text' };
      case T.Formula: return scalar(cell.result); // `cell.value.result` perd un résultat nul, faux ou vide ; `cell.result` le garde
      case T.Error: return { runs: [{ text: String(value && value.error !== undefined ? value.error : '') }], kind: 'error' };
      default: return scalar(value);
    }
  }

  // Le contenu d'une case en HTML d'éditeur : les plages avec leurs marques, un retour à la ligne dans la case = `<br>`. `baseSize` : la taille du
  // texte « de départ » du classeur, qu'on n'écrit pas.
  function runsToHtml(runs, base, baseSize, baseFont) {
    const parts = [];
    runs.forEach((run) => {
      const fmt = Object.assign({}, base, run.fmt || {});
      const size = fmt.size && Math.abs(fmt.size - baseSize) > 0.05 ? Math.round(fmt.size * 2) / 2 : null;
      const font = fmt.font && fmt.font !== baseFont ? fmt.font : null; // la police « de départ » du classeur est celle de l'éditeur : on n'écrit que les autres
      const mark = { bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, strike: fmt.strike, sup: fmt.sup, sub: fmt.sub, color: fmt.color || null, size, font, href: run.href };
      String(run.text).split(/\r\n|\r|\n/).forEach((line, i) => {
        if (i) parts.push('<br>');
        if (line) parts.push(GridTable.markHtml(GridTable.escapeHtml(line), mark));
      });
    });
    return parts.join('').replace(/^(?:<br>)+|(?:<br>)+$/g, '');
  }

  const columnNumber = letters => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const rangeOf = (text) => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(text).toUpperCase());
    return m ? { r1: Number(m[2]), c1: columnNumber(m[1]), r2: Number(m[4]), c2: columnNumber(m[3]) } : null;
  };

  function horizontalAlign(style, kind) {
    const h = style.alignment && style.alignment.horizontal;
    if (h === 'center' || h === 'centerContinuous') return 'center';
    if (h === 'right') return 'right';
    if (h === 'justify' || h === 'distributed') return 'justify';
    if (h === 'left' || h === 'fill') return null;
    // « Standard » : les nombres et les dates à droite, les booléens et les erreurs au centre, le texte à gauche.
    return kind === 'number' || kind === 'date' ? 'right' : kind === 'bool' || kind === 'error' ? 'center' : null;
  }

  function verticalAlign(style) {
    // L'alignement vertical n'est repris que quand le classeur l'écrit : sans lui Excel aligne en bas, mais ce n'est pas un choix, la grille garde
    // alors le sien (le milieu, GridEditor.DEFAULT_VALIGN).
    // Toujours écrit, même quand c'est le milieu : une case sans alignement est « neuve » pour l'éditeur, qui lui en pose un par une transaction à
    // part, une par case : très lent pour un gros classeur.
    const DEFAULT_VALIGN = 'middle';
    const v = style.alignment && style.alignment.vertical;
    return v === 'top' || v === 'bottom' ? v : DEFAULT_VALIGN;
  }

  function fillOf(style, palette) {
    const fill = style.fill;
    if (!fill) return null;
    if (fill.type === 'pattern') return fill.pattern === 'solid' ? colorHex(fill.fgColor, palette) : null;
    if (fill.type === 'gradient' && Array.isArray(fill.stops) && fill.stops.length) return colorHex(fill.stops[0].color, palette);
    return null;
  }

  const hasLook = (cell, palette) => {
    const style = cell.style || {};
    const border = style.border || {};
    return !!(fillOf(style, palette) || sideColor(border.top, palette) || sideColor(border.left, palette) || sideColor(border.bottom, palette) || sideColor(border.right, palette));
  };

  // Les traits qu'un côté de case partage avec sa voisine (ou, fusionnée, avec toute une file de voisines) n'ont qu'une valeur dans la grille
  // (js/table-borders.js) : celle du classeur y est mise d'accord ici, une fois, comme l'éditeur le ferait à l'ouverture, mais par une transaction
  // par case désaccordée : très lent pour un gros classeur (Excel n'écrit souvent un trait que d'un côté).
  function resolveBorders(grid, width) {
    const flat = [];
    grid.forEach((cells, row) => cells.forEach(cell => flat.push({ row, cell })));
    const sides = TableBorders.resolve({
      width,
      height: grid.length,
      cells: flat.map(({ row, cell }) => Object.assign({ row, col: cell.col, rowspan: cell.rowspan, colspan: cell.colspan }, cell.borders)),
    });
    flat.forEach(({ cell }, i) => { cell.borders = sides[i]; });
  }

  // Les feuilles visibles du classeur, dans l'ordre d'Excel : `sheetIndex` est un rang parmi elles.
  function visibleSheets(workbook) { return workbook.worksheets.filter(sheet => !sheet.state || sheet.state === 'visible'); }

  // L'étendue utile : ExcelJS ne rend que les lignes qui ont une valeur ; dans chacune, une case compte si elle a une valeur, un fond ou un trait
  // (des cases mises en forme mais vides au loin ne comptent pas). Les cases d'une plage fusionnée comptent toutes : ExcelJS les crée à la lecture.
  // Les lignes sans valeur mais mises en forme, collées sous la dernière ligne de valeurs, en font partie (`withFormattedRows`).
  function usedExtent(sheet, palette) {
    let rows = 0;
    let cols = 0;
    sheet.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.type !== T.Null || hasLook(cell, palette)) { rows = Math.max(rows, r); cols = Math.max(cols, c); }
      });
    });
    return rows ? withFormattedRows(sheet, palette, { rows, cols }) : { rows, cols };
  }

  // La suite de lignes sans valeur mais avec un fond ou un trait, juste sous la dernière ligne de valeurs (un tableau dessiné jusqu'en bas) : la
  // première ligne sans mise en forme l'arrête, et ses colonnes élargissent l'étendue au besoin. Qu'elle fasse dépasser les limites d'une grille, elle
  // est laissée de côté (sans être lue au-delà de la dernière ligne permise) : une mise en forme n'a jamais rendu une feuille trop grande.
  function withFormattedRows(sheet, palette, extent) {
    let rows = extent.rows;
    let cols = extent.cols;
    for (let r = rows + 1; r <= sheet.rowCount; r++) {
      if (r > MAX_ROWS) return extent;
      const row = sheet.findRow(r);
      let reach = 0;
      if (row) row.eachCell({ includeEmpty: true }, (cell, c) => { if (hasLook(cell, palette)) reach = c; });
      if (!reach) break;
      rows = r;
      cols = Math.max(cols, reach);
    }
    return rows <= MAX_ROWS && cols <= MAX_COLS && rows * cols <= MAX_CELLS ? { rows, cols } : extent;
  }

  // Les fusions, ramenées aux lignes et colonnes qui restent : l'ancre est la première case visible de la plage, le contenu et la mise en forme sont
  // ceux de sa case en haut à gauche. `anchors` : « ligne,colonne » de l'ancre -> { m, rowspan, colspan } ; `covered` : les autres cases de la plage.
  function mergeLayout(merges, shownRows, shownCols) {
    const anchors = new Map();
    const covered = new Set();
    merges.forEach((m) => {
      const rs = shownRows.filter(r => r >= m.r1 && r <= m.r2);
      const cs = shownCols.filter(c => c >= m.c1 && c <= m.c2);
      if (!rs.length || !cs.length) return;
      anchors.set(rs[0] + ',' + cs[0], { m, rowspan: rs.length, colspan: cs.length });
      rs.forEach(r => cs.forEach((c) => { if (r !== rs[0] || c !== cs[0]) covered.add(r + ',' + c); }));
    });
    return { anchors, covered };
  }

  // La taille de texte la plus courante parmi les cases qui ont du texte (à égalité, la première rencontrée) : le « texte de départ » du classeur,
  // qu'on n'écrit pas.
  function commonSize(cells) {
    const counts = new Map();
    cells.forEach(({ content, size }) => {
      if (content.runs.some(run => String(run.text).trim())) counts.set(size, (counts.get(size) || 0) + 1);
    });
    let common = DEFAULT_SIZE_PT;
    let best = 0;
    counts.forEach((count, size) => { if (count > best) { best = count; common = size; } });
    return common;
  }

  // La police la plus courante parmi les cases qui ont du texte : celle de départ du classeur (Calibri, Arial...), qu'on n'écrit pas, comme sa taille.
  function commonFont(cells) {
    const counts = new Map();
    cells.forEach(({ content, base }) => {
      if (base.font && content.runs.some(run => String(run.text).trim())) counts.set(base.font, (counts.get(base.font) || 0) + 1);
    });
    let common = '';
    let best = 0;
    counts.forEach((count, font) => { if (count > best) { best = count; common = font; } });
    return common;
  }

  // Un retrait d'Excel (`indent` : un cran = trois espaces de la police de départ, 7,5 pt) en points. Il vaut pour un texte aligné à gauche, écrit ou « Standard » ; aligné à droite il
  // part de la droite, et la grille n'a de retrait qu'à gauche : il n'est pas repris.
  const INDENT_PT = 7.5;
  function indentOf(style, align) {
    const level = style.alignment && style.alignment.indent;
    return level > 0 && !align ? level * INDENT_PT : 0;
  }

  // La feuille à lire : `options.sheetIndex`, un rang parmi les feuilles visibles (au-delà, la dernière).
  function pickSheet(workbook, options) {
    const sheets = visibleSheets(workbook);
    const sheetIndex = Math.max(0, Math.min((options && options.sheetIndex) || 0, Math.max(0, sheets.length - 1)));
    const sheet = sheets[sheetIndex] || workbook.worksheets[0];
    if (!sheet) throw fail('unreadable', 'Le classeur ne contient aucune feuille.'); // un zip qui n'est pas un classeur : ExcelJS le lit sans feuille
    return { sheets, sheetIndex, sheet };
  }

  // Les lignes et les colonnes de l'étendue utile qui ne sont pas masquées ; rien à montrer, ou trop grand : l'erreur le dit.
  function shownLines(sheet, palette) {
    const extent = usedExtent(sheet, palette);
    if (!extent.rows || !extent.cols) throw fail('empty', 'La feuille ne contient aucune case.');
    const shownRows = [];
    const shownCols = [];
    for (let r = 1; r <= extent.rows; r++) if (!sheet.getRow(r).hidden) shownRows.push(r);
    for (let col = 1; col <= extent.cols; col++) if (!sheet.getColumn(col).hidden) shownCols.push(col);
    if (!shownRows.length || !shownCols.length) throw fail('empty', 'La feuille ne contient aucune case visible.');
    if (shownRows.length > MAX_ROWS || shownCols.length > MAX_COLS || shownRows.length * shownCols.length > MAX_CELLS) {
      throw fail('tooBig', 'La feuille est trop grande pour une grille.', { rows: shownRows.length, cols: shownCols.length, maxRows: MAX_ROWS, maxCols: MAX_COLS, maxCells: MAX_CELLS });
    }
    return { shownRows, shownCols, extent };
  }

  // Ce que l'import n'a pas repris tel quel, pour la fenêtre qui le dit : [{ key, n }] dans l'ordre de REPORT_KEYS, sans les genres absents du classeur. Les clés sont celles de
  // `xlsx.import.report.<genre>` (js/i18n.js). Les objets (images, graphiques, formes, commentaires) sont comptés dans le fichier (objectCounts), le reste case par case.
  const REPORT_KEYS = ['formulas', 'conditional', 'images', 'charts', 'shapes', 'comments', 'hiddenRows', 'hiddenCols', 'patterns', 'gradients', 'borderStyles', 'rotated'];
  function reportOf(sheet, cells, shown, objects) {
    const n = Object.fromEntries(REPORT_KEYS.map(key => [key, 0]));
    cells.forEach(({ formula, style }) => {
      if (formula) n.formulas++;
      const fill = style.fill;
      if (fill && fill.type === 'pattern' && fill.pattern && fill.pattern !== 'solid' && fill.pattern !== 'none') n.patterns++;
      if (fill && fill.type === 'gradient') n.gradients++;
      // Un trait n'a qu'une couleur dans la grille (js/table-borders.js) : un trait épais, pointillé ou double devient un trait fin uni ; un texte tourné reste à l'horizontale.
      const border = style.border || {};
      if (['top', 'right', 'bottom', 'left'].some(side => border[side] && border[side].style && !/^(none|thin)$/.test(border[side].style))) n.borderStyles++;
      const rotation = style.alignment && style.alignment.textRotation;
      if (rotation && rotation !== 0) n.rotated++;
    });
    n.conditional = (sheet.conditionalFormattings || []).reduce((total, group) => total + ((group && group.rules && group.rules.length) || 1), 0);
    Object.assign(n, objects || {});
    n.hiddenRows = shown.extent.rows - shown.shownRows.length;
    n.hiddenCols = shown.extent.cols - shown.shownCols.length;
    return REPORT_KEYS.filter(key => n[key] > 0).map(key => ({ key, n: n[key] }));
  }

  // Première passe : le contenu de chaque case, pour connaître la taille de texte la plus courante.
  function readCells(sheet, shown, layout, options) {
    const cells = [];
    shown.shownRows.forEach((r, row) => shown.shownCols.forEach((c, col) => {
      const key = r + ',' + c;
      if (layout.covered.has(key)) return;
      const anchor = layout.anchors.get(key);
      const source = anchor ? sheet.getCell(anchor.m.r1, anchor.m.c1) : sheet.getCell(r, c);
      const style = source.style || {};
      const font = style.font || {};
      cells.push({
        row,
        col,
        anchor,
        style,
        formula: source.type === T.Formula,
        content: contentOf(source, source.numFmt || style.numFmt, options),
        size: font.size || DEFAULT_SIZE_PT,
        base: Object.assign({ bold: false, italic: false, underline: false, strike: false, size: DEFAULT_SIZE_PT }, fontFormat(font, options.color)),
      });
    }));
    return cells;
  }

  // Deuxième passe : les cases du modèle, rangées par ligne. Le pourtour d'une case fusionnée : le haut et la gauche de sa case d'angle, la droite
  // de la dernière colonne de sa première ligne, le bas de la dernière ligne de sa première colonne.
  function buildGrid(sheet, cells, rowCount, baseSize, baseFont, palette) {
    const borderOf = (r, c) => (sheet.getCell(r, c).style || {}).border || {};
    const grid = Array.from({ length: rowCount }, () => []);
    cells.forEach(({ row, col, anchor, style, content, base }) => {
      const border = style.border || {};
      const m = anchor && anchor.m;
      const align = horizontalAlign(style, content.kind);
      grid[row].push({
        col,
        colspan: anchor ? anchor.colspan : 1,
        rowspan: anchor ? anchor.rowspan : 1,
        html: runsToHtml(content.runs, base, baseSize, baseFont),
        align,
        indent: indentOf(style, align),
        valign: verticalAlign(style),
        fill: fillOf(style, palette),
        borders: {
          top: sideColor(border.top, palette),
          left: sideColor(border.left, palette),
          right: sideColor(m ? borderOf(m.r1, m.c2).right : border.right, palette),
          bottom: sideColor(m ? borderOf(m.r2, m.c1).bottom : border.bottom, palette),
        },
      });
    });
    return grid;
  }

  function buildModel(workbook, options) {
    const lang = options && options.lang === 'en' ? 'en' : 'fr';
    const { sheets, sheetIndex, sheet } = pickSheet(workbook, options);
    const palette = themePalette(workbook);
    const shown = shownLines(sheet, palette);
    const { shownRows, shownCols } = shown;
    const merges = ((sheet.model && sheet.model.merges) || []).map(rangeOf).filter(Boolean);
    const cells = readCells(sheet, shown, mergeLayout(merges, shownRows, shownCols), { lang, color: c => colorHex(c, palette) });
    const grid = buildGrid(sheet, cells, shownRows.length, commonSize(cells), commonFont(cells), palette);
    resolveBorders(grid, shownCols.length);

    const props = sheet.properties || {};
    const widthPx = chars => Math.round(chars * 7 + 5);
    const defaultColPx = props.defaultColWidth ? widthPx(props.defaultColWidth) : DEFAULT_COL_PX;
    const defaultRowPt = props.defaultRowHeight || DEFAULT_ROW_PT;
    const model = {
      width: shownCols.length,
      cols: shownCols.map((c) => { const w = sheet.getColumn(c).width; return Math.max(MIN_COL_PX, w ? widthPx(w) : defaultColPx); }),
      rows: shownRows.map((r, i) => ({ height: Math.round((sheet.getRow(r).height || defaultRowPt) / 0.75), cells: grid[i] })),
    };
    return {
      model, html: GridTable.toHtml(model, { sizes: true }), sheetName: sheet.name, sheetIndex, sheetCount: sheets.length || 1, rows: shownRows.length, cols: shownCols.length,
      report: reportOf(sheet, cells, shown, workbook.ppObjects && workbook.ppObjects[sheet.name]),
    };
  }

  // Les octets d'un classeur, lus par ExcelJS (chargé à la demande) : le classeur, ou l'erreur d'une personne qui a choisi un mauvais fichier.
  async function readWorkbook(buffer) {
    const bytes = new Uint8Array(buffer);
    // Un .xls (ou un classeur protégé par un mot de passe) est un conteneur OLE (D0 CF 11 E0), pas un zip (50 4B).
    if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw fail('oldFormat', 'Format .xls ou classeur protégé.');
    if (bytes.length > MAX_FILE_BYTES) throw fail('fileTooBig', 'Ce classeur est trop volumineux pour être importé.', { size: bytes.length, max: MAX_FILE_BYTES });
    await ExportCommon.ensureJsZipLoaded();
    let unpacked;
    let zip;
    try { zip = await JSZip.loadAsync(buffer); unpacked = ExportCommon.zipUnpackedBytes(zip); } catch (e) { throw fail('unreadable', 'Fichier illisible.', { cause: e }); }
    if (unpacked > MAX_UNPACKED_BYTES) throw fail('fileTooBig', 'Ce classeur est trop volumineux une fois défait.', { size: unpacked, max: MAX_UNPACKED_BYTES });
    await ExportEngines.ensure('xlsx', 'xlsxFormat');
    await XlsxExport.ensureExcelLibLoaded();
    const objects = await objectCounts(zip).catch(() => ({})); // comptés dans le fichier lui-même : ExcelJS n'en lit que les images, et rien du tout d'un classeur qu'il refuse
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); workbook.ppObjects = objects; return workbook; } catch (e) {
      // Un classeur valide qu'ExcelJS ne sait pas lire parce que son auteur (openpyxl, pandas...) a écrit ses dessins, commentaires ou tableaux autrement qu'Excel :
      // la Grille n'en reprend aucun objet, on relit les cases dans le classeur sans eux.
      try {
        const plain = new ExcelJS.Workbook();
        await plain.xlsx.load(await withoutObjects(buffer));
        plain.ppObjects = objects;
        return plain;
      } catch (_) { throw fail('unreadable', 'Fichier illisible.', { cause: e }); }
    }
  }

  // Le même classeur sans ses objets (dessins, images, graphiques, commentaires, schémas), et dont les cibles de relations sont toutes relatives : les cases, les styles, les
  // fusions, les liens et les tableaux n'en dépendent pas. Les parties se reconnaissent à leur dossier et au type de leur relation, pas à leur nom.
  const OBJECT_PARTS = /^xl\/(drawings|comments|charts|media|diagrams|embeddings|ctrlProps|threadedComments)\/|^xl\/(comments|persons)[^/]*\.xml$/;
  const OBJECT_RELATION = /\/(drawing|vmlDrawing|comments|chart|image|diagramData|diagramLayout|diagramQuickStyle|diagramColors|oleObject|ctrlProp|threadedComment|person)"/;
  const SHEET_OBJECT_TAGS = /<(?:\w+:)?(?:drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls)\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?(?:oleObjects|controls)>)/g;
  // Ce que chaque feuille porte d'objets que la Grille ne reprend pas : { nom de la feuille : { images, charts, shapes, comments } }, d'après les dessins et les commentaires du fichier.
  // Les parties se suivent par leurs relations (classeur -> feuille -> dessin, commentaires), pas par leur nom.
  const unescapeXml = text => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  function resolvePart(fromPart, target) {
    const segments = (target.startsWith('/') ? target.slice(1) : fromPart.split('/').slice(0, -1).concat(target).join('/')).split('/');
    const out = [];
    segments.forEach((segment) => { if (segment === '..') out.pop(); else if (segment && segment !== '.') out.push(segment); });
    return out.join('/');
  }
  async function relationsOf(zip, part) {
    const file = zip.file(part.replace(/([^/]+)$/, '_rels/$1.rels'));
    if (!file) return [];
    const xml = await file.async('string');
    return (xml.match(/<Relationship\b[^>]*?\/>/g) || []).map((rel) => {
      const attr = name => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(rel); return m ? unescapeXml(m[1]) : ''; };
      return { id: attr('Id'), type: attr('Type').replace(/^.*\//, ''), target: /TargetMode="External"/.test(rel) ? '' : attr('Target') };
    });
  }
  async function objectCounts(zip) {
    const book = zip.file('xl/workbook.xml');
    if (!book) return {};
    const sheets = ((await book.async('string')).match(/<sheet\b[^>]*?\/>/g) || []).map((tag) => {
      const name = /\bname="([^"]*)"/.exec(tag);
      const id = /\b(?:\w+:)?id="([^"]*)"/.exec(tag);
      return { name: name ? unescapeXml(name[1]) : '', id: id ? id[1] : '' };
    });
    const bookRelations = await relationsOf(zip, 'xl/workbook.xml');
    const counts = {};
    const count = (xml, re) => (xml.match(re) || []).length;
    for (const sheet of sheets) {
      const link = bookRelations.find(rel => rel.id === sheet.id && rel.target);
      const part = link && resolvePart('xl/workbook.xml', link.target);
      const own = { images: 0, charts: 0, shapes: 0, comments: 0 };
      if (part && zip.file(part)) {
        for (const rel of await relationsOf(zip, part)) {
          const target = rel.target && resolvePart(part, rel.target);
          const file = target && zip.file(target);
          if (!file) continue;
          if (rel.type === 'drawing') {
            const xml = await file.async('string');
            own.images += count(xml, /<(?:\w+:)?pic\b/g);
            own.charts += count(xml, /<(?:\w+:)?chart\b[^>]*\bid="/g);
            own.shapes += count(xml, /<(?:\w+:)?sp\b/g);
          } else if (rel.type === 'comments') own.comments += count(await file.async('string'), /<comment\b/g);
        }
      }
      counts[sheet.name] = own;
    }
    return counts;
  }

  function relativeTarget(relsPath, target) {
    const from = relsPath.split('/').slice(0, -2); // le dossier de la partie qui porte les relations
    const to = target.replace(/^\//, '').split('/');
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
    return '../'.repeat(from.length - common) + to.slice(common).join('/');
  }
  async function withoutObjects(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue;
      if (OBJECT_PARTS.test(name)) { zip.remove(name); continue; }
      if (/^xl\/worksheets\/sheet[^/]*\.xml$/.test(name)) {
        zip.file(name, (await zip.file(name).async('string')).replace(SHEET_OBJECT_TAGS, ''));
      } else if (/\.rels$/.test(name)) {
        const xml = await zip.file(name).async('string');
        zip.file(name, xml.replace(/<Relationship\b[^>]*?\/>/g, (rel) => {
          if (OBJECT_RELATION.test(rel)) return '';
          return /TargetMode="External"/.test(rel) ? rel : rel.replace(/Target="(\/[^"]*)"/, (_, target) => 'Target="' + relativeTarget(name, target) + '"');
        }));
      }
    }
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  async function fromArrayBuffer(buffer, options) {
    return buildModel(await readWorkbook(buffer), options);
  }

  async function importFile(file, options) {
    return fromArrayBuffer(await file.arrayBuffer(), options);
  }

  // Le classeur lu une seule fois, pour qu'on puisse choisir la feuille avant d'en faire la grille : les feuilles visibles dans l'ordre d'Excel
  // (`index` : leur rang, celui que `build` attend) et `build(index, { lang })`, qui rend ce que rend importFile pour cette feuille. Un classeur dont
  // toutes les feuilles sont masquées n'en propose qu'une, la première.
  async function openFile(file) {
    const workbook = await readWorkbook(await file.arrayBuffer());
    const visible = visibleSheets(workbook);
    const shown = visible.length ? visible : workbook.worksheets.slice(0, 1);
    if (!shown.length) throw fail('unreadable', 'Le classeur ne contient aucune feuille.');
    return {
      sheets: shown.map((sheet, index) => ({ index, name: sheet.name })),
      build: (index, options) => buildModel(workbook, Object.assign({}, options, { sheetIndex: index })),
    };
  }

  // La feuille à importer quand le classeur en a plusieurs : la liste avec recherche de toutes les listes du widget (js/search-select.js), sous le
  // rectangle que rend `anchor()`.
  // Rend le rang de la feuille choisie, ou null quand on referme la liste sans choisir (Échap, un clic ailleurs) : rien n'est alors importé. Si la
  // liste ne peut pas s'ouvrir, la première feuille est prise (le message de fin dit laquelle).
  function chooseSheet(sheets, options) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.id = 'v2-xlsx-sheet-search';
      const select = document.createElement('select');
      sheets.forEach(({ index, name }) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = name;
        select.appendChild(option);
      });
      host.appendChild(select);
      document.body.appendChild(host);
      select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
      let search = null;
      // Défait après la fin de l'évènement en cours : un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte.
      const cleanup = () => { try { if (search) search.destroy(); } catch (e) { /* déjà défait */ } host.remove(); };
      try {
        search = SearchSelect.attachSheets(select, {
          popup: true,
          anchor: options && options.anchor,
          // Un choix ferme la liste avant d'envoyer `change` : la fermeture sans choix attend la fin de l'évènement, pour que le choix passe en
          // premier (une promesse ne se tient qu'une fois).
          onClose: () => setTimeout(() => { cleanup(); resolve(null); }, 0),
        });
        select.addEventListener('change', () => resolve(Number(select.value)));
        search.open();
      } catch (e) {
        console.warn('[GridXlsxImport] liste des feuilles indisponible', e);
        cleanup();
        resolve(0);
      }
    });
  }

  // Le sélecteur de fichier du navigateur, appelé dans le geste de la personne (le clic sur la ligne du menu) : l'élément n'existe que le temps du
  // choix.
  // `accept` : les types du sélecteur, ceux d'un classeur par défaut (l'import d'un Markdown, js/main.js:onImportMd, y met les siens).
  function chooseFile(onFile, accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.style.display = 'none';
    input.addEventListener('change', () => { const file = input.files && input.files[0]; input.remove(); if (file) onFile(file); }, { once: true });
    input.addEventListener('cancel', () => input.remove(), { once: true });
    document.body.appendChild(input);
    input.click();
  }

  return { openFile, chooseSheet, importFile, fromArrayBuffer, chooseFile, MAX_FILE_BYTES, MAX_UNPACKED_BYTES };
})();
