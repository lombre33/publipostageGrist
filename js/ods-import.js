// Import d'un tableur OpenDocument : un fichier .ods (ou son modèle .ots, ou le fichier « flat » .fods) devient une GRILLE, sur le modèle de l'import d'un classeur Excel (js/grid-xlsx-import.js) : une feuille visible
// devient une nouvelle grille, case par case (chantier « formats libres » du 17/11, étude du 13/11). Aucune bibliothèque de plus : un zip (JSZip, déjà chargé)
// de parties XML, lu à la main par ExportCommon.Odf comme l'import du .odt.
//   OdsImport.openFile(file) -> Promise<{ sheets: [{ index, name }], build(index, { lang }) }>
//     le tableur lu une fois : ses feuilles visibles, dans l'ordre du fichier, et la grille de celle qu'on choisit (même forme que GridXlsxImport.openFile : la liste des feuilles est la sienne)
//   OdsImport.fromBuffer(buffer, { lang, sheetIndex? }) -> Promise<{ html, model, sheetName, sheetIndex, sheetCount, rows, cols, report }>
//   OdsImport.importFile(file, { lang, sheetIndex? }) -> idem, depuis un fichier
// Codes d'erreur (ceux de GridXlsxImport, plus `wrongType` et `encrypted` d'OdtImport) : 'unreadable' (pas un tableur OpenDocument), 'wrongType' (un document texte ou une présentation : `kind` le dit), 'encrypted' (protégé par un mot de passe),
// 'empty' (aucune case utile), 'tooBig' (plus de 1 000 lignes, 100 colonnes ou 5 000 cases une fois les lignes et colonnes masquées retirées : rien n'est coupé en silence), 'fileTooBig' (le fichier pèse plus de
// MAX_FILE_BYTES, ou plus de MAX_UNPACKED_BYTES défait : `size` et `max` en octets), 'library' (le lecteur de zip n'a pas pu se charger).
//
// Ce que la grille reprend : le texte TEL QUE LE TABLEUR L'AFFICHE (le `text:p` de la case : « 1 234,50 € », « 05/03/2024 », « 25 % » ; sans lui, la valeur écrite, mise en forme au plus simple), les cases fusionnées, la largeur des
// colonnes et la hauteur des lignes, gras / italique / souligné / barré, exposant et indice, couleur, taille et police du texte (par case et par plage de texte), fond, traits (couleur), alignement horizontal (le « standard » :
// nombres et dates à droite, booléens et erreurs au centre) et vertical, retrait, liens, retours à la ligne dans une case. Les feuilles, lignes et colonnes masquées (ou filtrées) ne sont pas importées. Le style d'une case est
// celui qu'elle écrit, sinon celui de sa ligne, sinon celui de sa colonne ; ceux qu'il hérite (`style:parent-style-name`, valeurs par défaut du fichier) comptent.
// Les colonnes et les lignes « répétées » (LibreOffice en écrit des milliers pour dire « tout le reste est vide ») ne sont jamais écrites une à une : seules les cases qui ont une valeur, un fond ou un trait comptent, et ce qui
// n'a qu'une mise en forme au loin n'agrandit pas la feuille.
// `report` ([{ key, n }], les clés de `xlsx.import.report.<genre>`) dit ce que l'import n'a pas repris tel quel : formules remplacées par leur résultat, mises en forme conditionnelles, images, graphiques, formes, commentaires, lignes et colonnes
// masquées, traits épais / pointillés / doubles (repris en trait fin uni) et textes tournés (repris à l'horizontale).
// Dépend de GridTable (js/grid-table.js), GridXlsxImport.shared (js/grid-xlsx-import.js : la même main pour les deux grilles) et ExportCommon.Odf.
const OdsImport = (function () {
  const { file: MAX_FILE_BYTES, unpacked: MAX_UNPACKED_BYTES } = ExportCommon.Ooxml.LIMITS;
  const MAX_PART_BYTES = 60 * 1024 * 1024;
  const MAX_REPEAT_COLS = 16384;       // les colonnes d'une feuille, au plus (LibreOffice et Excel)
  const MAX_REPEAT_ROWS = 1048576;     // ses lignes
  const DEFAULT_COL_PX = 85;           // 2,258 cm : la largeur d'une colonne sans largeur écrite dans LibreOffice
  const DEFAULT_SIZE_PT = 10;          // la taille de texte de départ de LibreOffice
  const PT_TO_PX = 96 / 72;
  const DEFAULT_LINE = '#777777';      // le trait de départ d'une case de grille (même valeur que GridXlsxImport) : relu comme une couleur choisie, il ferait des traits « colorés » en gris
  const REPORT_KEYS = ['formulas', 'conditional', 'images', 'charts', 'shapes', 'comments', 'hiddenRows', 'hiddenCols', 'borderStyles', 'rotated'];
  const { fail, kids } = ExportCommon.Ooxml;
  const { NS, name, attr, attrs, children, child, toPoints } = ExportCommon.Odf;
  const { runsToHtml, resolveBorders, mergeLayout, commonSize, commonFont, limits } = GridXlsxImport.shared;
  const { rows: MAX_ROWS, cols: MAX_COLS, cells: MAX_CELLS, minColPx: MIN_COL_PX, defaultRowPt: DEFAULT_ROW_PT } = limits;
  const MESSAGES = {
    notPackage: 'Ce fichier n’est pas un document OpenDocument.', unreadable: 'Ce fichier n’a pas pu être lu.', tooBig: 'Ce fichier est trop gros pour être importé.',
    encrypted: 'Ce fichier OpenDocument est protégé par un mot de passe.',
  };

  const whole = (value, fallback, max) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
  };
  // Le plus petit des rangs d'une suite triée par `from` qui contient `n` (les colonnes et les lignes décrites par plages « répétées »).
  function runAt(runs, n) {
    let low = 0;
    let high = runs.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const run = runs[mid];
      if (n < run.from) high = mid - 1;
      else if (n > run.to) low = mid + 1;
      else return run;
    }
    return null;
  }

  // --- Les styles : un par famille et par nom, avec les propriétés de chaque groupe -----------------------------------------------------------------------------------------------------
  const groupsOf = el => ({
    text: attrs(child(el, 'style:text-properties')), para: attrs(child(el, 'style:paragraph-properties')), cell: attrs(child(el, 'style:table-cell-properties')),
    column: attrs(child(el, 'style:table-column-properties')), row: attrs(child(el, 'style:table-row-properties')), table: attrs(child(el, 'style:table-properties')),
  });
  function readStyles(odf) {
    const fonts = new Map();
    odf.sections('office:font-face-decls').forEach((holder) => {
      children(holder, 'style:font-face').forEach((face) => {
        const family = String(attr(face, 'svg:font-family') || attr(face, 'style:name') || '').replace(/^['"]|['"]$/g, '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
        fonts.set(attr(face, 'style:name'), family);
      });
    });
    const styles = new Map();
    const defaults = new Map();
    const take = (el) => {
      if (name(el) === 'style:style') {
        const family = attr(el, 'style:family');
        const styleName = attr(el, 'style:name');
        if (family && styleName) styles.set(family + ':' + styleName, Object.assign({ parent: attr(el, 'style:parent-style-name') }, groupsOf(el)));
      } else if (name(el) === 'style:default-style') {
        defaults.set(attr(el, 'style:family'), groupsOf(el));
      }
    };
    ['office:styles', 'office:automatic-styles'].forEach(section => odf.sections(section).forEach(holder => children(holder).forEach(take)));
    return { fonts, styles, defaults };
  }
  // Les propriétés d'un groupe (`text`, `cell`...) d'un style, héritage compris : les valeurs par défaut de la famille, puis chaque style de la chaîne, du plus lointain au plus proche, attribut par attribut. Un cycle ou
  // un nom inconnu coupe la chaîne.
  function merged(styles, family, styleName, group, withDefaults) {
    const chain = [];
    const seen = new Set();
    let current = styleName;
    while (current && !seen.has(current) && chain.length < 32) {
      seen.add(current);
      const style = styles.styles.get(family + ':' + current);
      if (!style) break;
      chain.unshift(style);
      current = style.parent;
    }
    const out = withDefaults ? Object.assign({}, (styles.defaults.get(family) || {})[group]) : {};
    chain.forEach(style => Object.assign(out, style[group]));
    return out;
  }

  // --- Les caractères : ce qu'un style de texte demande, en mise en forme de grille ---------------------------------------------------------------------------------------------------------
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const hexOf = value => (HEX_COLOR.test(String(value || '')) ? String(value).toLowerCase() : null);
  function fontFormat(styles, props) {
    const fmt = {};
    if (props['fo:font-weight'] !== undefined) fmt.bold = props['fo:font-weight'] === 'bold' || Number(props['fo:font-weight']) >= 600;
    if (props['fo:font-style'] !== undefined) fmt.italic = props['fo:font-style'] === 'italic' || props['fo:font-style'] === 'oblique';
    if (props['style:text-underline-style'] !== undefined) fmt.underline = props['style:text-underline-style'] !== 'none';
    const strike = props['style:text-line-through-style'] !== undefined ? props['style:text-line-through-style'] : props['style:text-line-through-type'];
    if (strike !== undefined) fmt.strike = strike !== 'none';
    const size = toPoints(props['fo:font-size']);
    if (size && !/%/.test(props['fo:font-size'])) fmt.size = size;
    const declared = props['style:font-name'] ? styles.fonts.get(props['style:font-name']) || props['style:font-name'] : props['fo:font-family'];
    const font = String(declared || '').replace(/^['"]|['"]$/g, '').trim();
    if (font) fmt.font = font;
    // « Position » : « super 58% », « sub 58% » ou « 33% 58% » (monté ou descendu de 33 %).
    const position = /^\s*(super|sub|-?\d+(?:\.\d+)?%)/.exec(props['style:text-position'] || '');
    if (position) {
      const raised = position[1] === 'super' || (/%$/.test(position[1]) && parseFloat(position[1]) > 0);
      const lowered = position[1] === 'sub' || (/%$/.test(position[1]) && parseFloat(position[1]) < 0);
      if (raised) fmt.sup = true;
      else if (lowered) fmt.sub = true;
    }
    if (props['fo:color'] !== undefined) { const hex = hexOf(props['fo:color']); fmt.color = hex === '#000000' ? null : hex; }
    return fmt;
  }

  // --- La mise en forme d'une case : son style, héritage compris, lu une fois par nom de style ----------------------------------------------------------------------------------------------------
  // Un trait (« 0.74pt solid #000000 ») : sa couleur (null : pas de trait, ou le trait de départ de la grille), et s'il est épais, pointillé ou double (une grille n'a que le trait fin uni).
  function sideOf(props, side) {
    const text = String(props['fo:border-' + side] !== undefined ? props['fo:border-' + side] : (props['fo:border'] || '')).trim();
    if (!text || /^(none|hidden)\b/i.test(text)) return { color: null, special: false };
    const parts = text.split(/\s+/);
    const color = hexOf(parts.find(part => HEX_COLOR.test(part))) || '#000000';
    const widthPt = toPoints(parts.find(part => /^-?[\d.]+(?:pt|cm|mm|in|px)$/.test(part)));
    const lineStyle = parts.find(part => /^(solid|dotted|dashed|double|groove|ridge|inset|outset)$/.test(part)) || 'solid';
    return { color: color === DEFAULT_LINE ? null : color, special: lineStyle !== 'solid' || (widthPt !== null && widthPt > 1.1) };
  }
  function lookOf(ctx, styleName) {
    if (ctx.looks.has(styleName)) return ctx.looks.get(styleName);
    const text = merged(ctx.styles, 'table-cell', styleName, 'text', true);
    const para = merged(ctx.styles, 'table-cell', styleName, 'para', true);
    const props = merged(ctx.styles, 'table-cell', styleName, 'cell', true);
    const sides = ['top', 'left', 'right', 'bottom'].map(side => [side, sideOf(props, side)]);
    const fmt = fontFormat(ctx.styles, text);
    const back = hexOf(props['fo:background-color']);
    const rotation = Number(props['style:rotation-angle']);
    const align = para['fo:text-align'];
    const auto = para['style:text-align-source'] === 'value-type' || !align;
    const vertical = props['style:vertical-align'];
    const look = {
      fmt,
      size: fmt.size || DEFAULT_SIZE_PT,
      fill: back,
      borders: Object.fromEntries(sides.map(([side, info]) => [side, info.color])),
      hasLook: !!back || sides.some(([, info]) => info.color),
      borderStyles: sides.some(([, info]) => info.special),
      rotated: Number.isFinite(rotation) && rotation !== 0,
      // `align` : null = « standard » (selon le genre de la valeur), sinon 'center' | 'right' | 'justify' | 'left'.
      align: auto ? null : (align === 'center' ? 'center' : (align === 'end' || align === 'right' ? 'right' : (align === 'justify' ? 'justify' : 'left'))),
      indentPt: Math.max(0, toPoints(para['fo:margin-left']) || 0),
      valign: vertical === 'top' || vertical === 'bottom' ? vertical : 'middle', // « automatique » n'est pas un choix : la grille garde le sien (le milieu)
    };
    ctx.looks.set(styleName, look);
    return look;
  }
  // Un style de texte (`text:span`) : ce qu'il écrit lui-même, héritage compris, sans les valeurs par défaut de la case.
  function spanFormat(ctx, styleName) {
    if (!ctx.spans.has(styleName)) ctx.spans.set(styleName, fontFormat(ctx.styles, merged(ctx.styles, 'text', styleName, 'text', false)));
    return ctx.spans.get(styleName);
  }

  // --- Le contenu d'une case : le texte affiché, découpé en plages de même mise en forme ----------------------------------------------------------------------------------------------------------------
  function inlineRuns(ctx, node, fmt, href, out) {
    Array.from(node.childNodes).forEach((part) => {
      if (part.nodeType === 3) {
        const text = part.nodeValue.replace(/[ \t\r\n]+/g, ' ');
        if (text) out.push({ text, fmt, href });
        return;
      }
      if (part.nodeType !== 1) return;
      switch (name(part)) {
        case 'text:span': inlineRuns(ctx, part, Object.assign({}, fmt, spanFormat(ctx, attr(part, 'text:style-name'))), href, out); break;
        case 'text:a': {
          const target = attr(part, 'xlink:href');
          inlineRuns(ctx, part, fmt, target && GridTable.isSafeLink(target) ? String(target).trim() : href, out);
          break;
        }
        case 'text:s': out.push({ text: ' '.repeat(whole(attr(part, 'text:c'), 1, 200)), fmt, href }); break;
        case 'text:tab': out.push({ text: '\t', fmt, href }); break;
        case 'text:line-break': out.push({ text: '\n', fmt, href }); break;
        case 'office:annotation': case 'office:annotation-end': break; // les commentaires sont comptés, pas lus
        default: inlineRuns(ctx, part, fmt, href, out); break; // un champ (date, nom de feuille...) : son texte affiché
      }
    });
  }
  function twoDigits(n) { return String(n).padStart(2, '0'); }
  // Sans texte affiché (un fichier écrit par un programme, pas par un tableur), la valeur écrite, au plus simple.
  function writtenText(el, type, lang) {
    const value = attr(el, 'office:value');
    switch (type) {
      case 'float': return value === null ? '' : String(Number(value));
      case 'percentage': return value === null ? '' : String(Math.round(Number(value) * 10000) / 100) + ' %';
      case 'currency': return value === null ? '' : String(Number(value)) + (attr(el, 'office:currency') ? ' ' + attr(el, 'office:currency') : '');
      case 'boolean': { const on = attr(el, 'office:boolean-value') === 'true'; return lang === 'en' ? (on ? 'TRUE' : 'FALSE') : (on ? 'VRAI' : 'FAUX'); }
      case 'string': return attr(el, 'office:string-value') || '';
      case 'date': {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(attr(el, 'office:date-value') || '');
        if (!m) return '';
        const day = lang === 'en' ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
        return m[4] && !(m[4] === '00' && m[5] === '00') ? `${day} ${m[4]}:${m[5]}` : day;
      }
      case 'time': {
        const m = /^PT(\d+)H(\d+)M(\d+)/.exec(attr(el, 'office:time-value') || '');
        return m ? `${twoDigits(m[1])}:${twoDigits(m[2])}:${twoDigits(m[3])}` : '';
      }
      default: return '';
    }
  }
  const KINDS = { float: 'number', percentage: 'number', currency: 'number', date: 'date', time: 'date', boolean: 'bool' };
  function contentOf(ctx, el, look, lang) {
    const type = attr(el, 'office:value-type');
    const kind = attr(el, 'calcext:value-type') === 'error' ? 'error' : (KINDS[type] || 'text');
    const runs = [];
    children(el, 'text:p').forEach((para, i) => {
      if (i) runs.push({ text: '\n', fmt: {} });
      inlineRuns(ctx, para, {}, null, runs);
    });
    if (!runs.some(run => run.text !== '\n' && run.text)) {
      const written = type ? writtenText(el, type, lang) : '';
      return { runs: written ? [{ text: written, fmt: {} }] : [], kind };
    }
    // Les plages voisines de même mise en forme n'en font qu'une.
    const joined = [];
    runs.forEach((run) => {
      const last = joined[joined.length - 1];
      if (last && last.href === run.href && JSON.stringify(last.fmt) === JSON.stringify(run.fmt)) last.text += run.text;
      else joined.push({ text: run.text, fmt: run.fmt, href: run.href });
    });
    return { runs: joined, kind };
  }

  // --- La feuille : ses colonnes, ses lignes et les cases qui comptent -----------------------------------------------------------------------------------------------------------------------------------
  const COLUMN_WRAPPERS = ['table:table-columns', 'table:table-header-columns', 'table:table-column-group'];
  const ROW_WRAPPERS = ['table:table-rows', 'table:table-header-rows', 'table:table-row-group'];
  // Les colonnes ou les lignes d'une table, en descendant dans leurs groupes ; un groupe replié (`table:display="false"`) masque ce qu'il contient.
  function walkLines(parent, leaf, wrappers, hidden, visit) {
    children(parent).forEach((el) => {
      const tag = name(el);
      if (tag === leaf) visit(el, hidden);
      else if (wrappers.indexOf(tag) >= 0) walkLines(el, leaf, wrappers, hidden || attr(el, 'table:display') === 'false', visit);
    });
  }
  const isHiddenLine = (el, byGroup) => byGroup || attr(el, 'table:visibility') === 'collapse' || attr(el, 'table:visibility') === 'filter';

  function readColumns(ctx, table) {
    const runs = [];
    let position = 1;
    walkLines(table, 'table:table-column', COLUMN_WRAPPERS, false, (col, byGroup) => {
      const repeat = whole(attr(col, 'table:number-columns-repeated'), 1, MAX_REPEAT_COLS);
      const widthPt = toPoints(merged(ctx.styles, 'table-column', attr(col, 'table:style-name'), 'column', false)['style:column-width']);
      if (position <= MAX_REPEAT_COLS) runs.push({ from: position, to: position + repeat - 1, widthPt, hidden: isHiddenLine(col, byGroup), defaultStyle: attr(col, 'table:default-cell-style-name') });
      position += repeat;
    });
    return runs;
  }

  // Les lignes (en plages « répétées ») et les cases qui comptent : une case compte quand elle a une valeur, est fusionnée, ou a un fond ou un trait. Les cases vides sans mise en forme (des milliers, répétées) ne sont pas gardées.
  function readRows(ctx, table, columns) {
    const rowRuns = [];
    const entries = [];
    let position = 1;
    walkLines(table, 'table:table-row', ROW_WRAPPERS, false, (row, byGroup) => {
      const repeat = whole(attr(row, 'table:number-rows-repeated'), 1, MAX_REPEAT_ROWS);
      const rowProps = merged(ctx.styles, 'table-row', attr(row, 'table:style-name'), 'row', false);
      const heightPt = toPoints(rowProps['style:row-height'] !== undefined ? rowProps['style:row-height'] : rowProps['style:min-row-height']);
      if (position <= MAX_REPEAT_ROWS) rowRuns.push({ from: position, to: position + repeat - 1, heightPt, optimal: rowProps['style:use-optimal-row-height'] === 'true', hidden: isHiddenLine(row, byGroup) });
      const rowDefault = attr(row, 'table:default-cell-style-name');
      let col = 1;
      children(row, ['table:table-cell', 'table:covered-table-cell']).forEach((el) => {
        const colRepeat = whole(attr(el, 'table:number-columns-repeated'), 1, MAX_REPEAT_COLS);
        if (name(el) === 'table:table-cell' && col <= MAX_REPEAT_COLS && position <= MAX_REPEAT_ROWS) {
          const colRun = runAt(columns, col);
          const styleName = attr(el, 'table:style-name') || rowDefault || (colRun && colRun.defaultStyle) || '';
          const rowspan = whole(attr(el, 'table:number-rows-spanned'), 1, MAX_REPEAT_ROWS);
          const colspan = whole(attr(el, 'table:number-columns-spanned'), 1, MAX_REPEAT_COLS);
          const type = attr(el, 'office:value-type');
          const value = type !== null || children(el, 'text:p').some(para => para.textContent.trim());
          const look = lookOf(ctx, styleName).hasLook;
          if (value || look || rowspan > 1 || colspan > 1) entries.push({ r: position, c: col, rowRepeat: repeat, colRepeat, rowspan, colspan, el, styleName, value, look });
        }
        col += colRepeat;
      });
      position += repeat;
    });
    return { rowRuns, entries };
  }

  // L'étendue utile : la dernière ligne et la dernière colonne qui ont une valeur (ou une fusion), puis les lignes qui n'ont qu'un fond ou un trait, collées juste dessous (un tableau dessiné jusqu'en bas). Une mise
  // en forme qui ferait dépasser les limites d'une grille est laissée de côté : une mise en forme n'a jamais rendu une feuille trop grande.
  function usedExtent(entries) {
    let rows = 0;
    let cols = 0;
    entries.forEach((entry) => {
      if (!entry.value && entry.rowspan === 1 && entry.colspan === 1) return;
      rows = Math.max(rows, entry.r + entry.rowRepeat - 1 + entry.rowspan - 1);
      cols = Math.max(cols, entry.c + entry.colRepeat - 1 + entry.colspan - 1);
    });
    return rows ? withFormattedRows(entries, { rows, cols }) : { rows, cols };
  }
  function withFormattedRows(entries, extent) {
    const looks = entries.filter(entry => !entry.value && entry.look && entry.colRepeat <= MAX_COLS && entry.c <= MAX_COLS);
    let rows = extent.rows;
    let cols = extent.cols;
    for (let r = rows + 1; ; r++) {
      if (r > MAX_ROWS) return extent;
      let reach = 0;
      looks.forEach((entry) => { if (entry.r <= r && r <= entry.r + entry.rowRepeat - 1) reach = Math.max(reach, entry.c + entry.colRepeat - 1); });
      if (!reach) break;
      rows = r;
      cols = Math.max(cols, reach);
    }
    return rows <= MAX_ROWS && cols <= MAX_COLS && rows * cols <= MAX_CELLS ? { rows, cols } : extent;
  }

  function shownLines(extent, columns, rowRuns) {
    if (!extent.rows || !extent.cols) throw fail('empty', 'La feuille ne contient aucune case.');
    const shownRows = [];
    const shownCols = [];
    for (let r = 1; r <= extent.rows; r++) { const run = runAt(rowRuns, r); if (!(run && run.hidden)) shownRows.push(r); }
    for (let c = 1; c <= extent.cols; c++) { const run = runAt(columns, c); if (!(run && run.hidden)) shownCols.push(c); }
    if (!shownRows.length || !shownCols.length) throw fail('empty', 'La feuille ne contient aucune case visible.');
    if (shownRows.length > MAX_ROWS || shownCols.length > MAX_COLS || shownRows.length * shownCols.length > MAX_CELLS) {
      throw fail('tooBig', 'La feuille est trop grande pour une grille.', { rows: shownRows.length, cols: shownCols.length, maxRows: MAX_ROWS, maxCols: MAX_COLS, maxCells: MAX_CELLS });
    }
    return { shownRows, shownCols, extent };
  }

  // Les cases des lignes et colonnes montrées : « ligne,colonne » -> la case qui l'écrit (une case répétée se retrouve à chacune de ses places).
  function placeEntries(entries, shown) {
    const rowShown = new Set(shown.shownRows);
    const colShown = new Set(shown.shownCols);
    const placed = new Map();
    entries.forEach((entry) => {
      const lastRow = Math.min(entry.r + entry.rowRepeat - 1, shown.extent.rows);
      const lastCol = Math.min(entry.c + entry.colRepeat - 1, shown.extent.cols);
      for (let r = entry.r; r <= lastRow; r++) {
        if (!rowShown.has(r)) continue;
        for (let c = entry.c; c <= lastCol; c++) if (colShown.has(c)) placed.set(r + ',' + c, entry);
      }
    });
    return placed;
  }

  // Ce que la feuille porte que la grille ne reprend pas : images, graphiques, formes (les objets de plus haut niveau seulement, un groupe compte pour un), commentaires, mises en forme conditionnelles.
  const FRAME = 'draw:frame';
  const SHAPES = new Set(['draw:custom-shape', 'draw:rect', 'draw:ellipse', 'draw:circle', 'draw:line', 'draw:polyline', 'draw:polygon', 'draw:path', 'draw:g', 'draw:connector', 'draw:caption', 'draw:measure', 'draw:control']);
  function objectCounts(table) {
    const counts = { images: 0, charts: 0, shapes: 0, comments: 0, conditional: 0 };
    Array.from(table.getElementsByTagNameNS(NS.draw, '*')).forEach((el) => {
      const tag = name(el);
      const parent = name(el.parentNode);
      if (parent === FRAME || parent === 'draw:g' || parent === 'draw:a') return;
      if (tag === FRAME) {
        if (child(el, 'draw:image')) counts.images++;
        else if (child(el, ['draw:object', 'draw:object-ole'])) counts.charts++;
        else counts.shapes++;
      } else if (SHAPES.has(tag)) counts.shapes++;
    });
    counts.comments = table.getElementsByTagNameNS(NS.office, 'annotation').length;
    Array.from(table.getElementsByTagNameNS(NS.calcext, 'conditional-format')).forEach((format) => {
      counts.conditional += Math.max(1, kids(format).filter(rule => /^(condition|color-scale|data-bar|icon-set|date-is)$/.test(rule.localName)).length);
    });
    return counts;
  }

  // --- Les feuilles du fichier ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function sheetsOf(odf, styles) {
    return children(odf.body, 'table:table').map(el => ({
      el,
      name: attr(el, 'table:name') || '',
      hidden: merged(styles, 'table', attr(el, 'table:style-name'), 'table', false)['table:display'] === 'false',
    }));
  }
  // Les feuilles visibles, dans l'ordre du fichier : `sheetIndex` est un rang parmi elles (celui de GridXlsxImport). Un tableur dont toutes les feuilles sont masquées n'en propose qu'une, la première.
  function visibleOf(sheets) {
    const visible = sheets.filter(sheet => !sheet.hidden);
    return visible.length ? visible : sheets.slice(0, 1);
  }

  function buildModel(ctx, sheets, options) {
    const lang = options && options.lang === 'en' ? 'en' : 'fr';
    const visible = visibleOf(sheets);
    const sheetIndex = Math.max(0, Math.min((options && options.sheetIndex) || 0, visible.length - 1));
    const sheet = visible[sheetIndex];
    const columns = readColumns(ctx, sheet.el);
    const { rowRuns, entries } = readRows(ctx, sheet.el, columns);
    const extent = usedExtent(entries);
    const shown = shownLines(extent, columns, rowRuns);
    const { shownRows, shownCols } = shown;
    const placed = placeEntries(entries, shown);
    const merges = [];
    entries.forEach((entry) => { if (entry.rowspan > 1 || entry.colspan > 1) merges.push({ r1: entry.r, c1: entry.c, r2: entry.r + entry.rowspan - 1, c2: entry.c + entry.colspan - 1 }); });
    const layout = mergeLayout(merges, shownRows, shownCols);

    // Première passe : le contenu de chaque case, pour connaître la taille et la police de texte les plus courantes.
    const cells = [];
    shownRows.forEach((r, row) => shownCols.forEach((c, col) => {
      const key = r + ',' + c;
      if (layout.covered.has(key)) return;
      const anchor = layout.anchors.get(key);
      const entry = anchor ? placed.get(anchor.m.r1 + ',' + anchor.m.c1) : placed.get(key);
      const colRun = runAt(columns, c);
      const styleName = entry ? entry.styleName : (colRun && colRun.defaultStyle) || '';
      const look = lookOf(ctx, styleName);
      const content = entry ? contentOf(ctx, entry.el, look, lang) : { runs: [], kind: 'text' };
      cells.push({
        row, col, anchor, look, content,
        formula: !!(entry && attr(entry.el, 'table:formula')),
        size: look.size,
        base: Object.assign({ bold: false, italic: false, underline: false, strike: false, size: DEFAULT_SIZE_PT }, look.fmt),
      });
    }));

    // Deuxième passe : les cases du modèle, rangées par ligne. Une case fusionnée porte les quatre traits de sa case d'angle (c'est ainsi que le tableur les écrit).
    const baseSize = commonSize(cells);
    const baseFont = commonFont(cells);
    const grid = Array.from({ length: shownRows.length }, () => []);
    cells.forEach(({ row, col, anchor, look, content, base }) => {
      let align = look.align;
      if (align === null) align = content.kind === 'number' || content.kind === 'date' ? 'right' : (content.kind === 'bool' || content.kind === 'error' ? 'center' : null);
      else if (align === 'left') align = null;
      grid[row].push({
        col,
        colspan: anchor ? anchor.colspan : 1,
        rowspan: anchor ? anchor.rowspan : 1,
        html: runsToHtml(content.runs, base, baseSize, baseFont),
        align,
        indent: !align ? look.indentPt : 0,
        valign: look.valign,
        fill: look.fill,
        borders: Object.assign({}, look.borders),
      });
    });
    resolveBorders(grid, shownCols.length);

    const model = {
      width: shownCols.length,
      cols: shownCols.map((c) => { const run = runAt(columns, c); return Math.max(MIN_COL_PX, run && run.widthPt ? Math.round(run.widthPt * PT_TO_PX) : DEFAULT_COL_PX); }),
      rows: shownRows.map((r, i) => {
        const run = runAt(rowRuns, r);
        const pt = run && run.heightPt ? (run.optimal ? Math.max(run.heightPt, DEFAULT_ROW_PT) : run.heightPt) : DEFAULT_ROW_PT; // la hauteur « au plus juste » de LibreOffice (0,45 cm) est plus basse que celle d'Excel : la grille garde la sienne
        return { height: Math.round(pt / 0.75), cells: grid[i] };
      }),
    };
    return {
      model, html: GridTable.toHtml(model, { sizes: true }), sheetName: sheet.name, sheetIndex, sheetCount: visible.length || 1, rows: shownRows.length, cols: shownCols.length,
      report: reportOf(sheet, cells, shown),
    };
  }

  // Ce que l'import n'a pas repris tel quel : [{ key, n }] dans l'ordre de REPORT_KEYS, sans les genres absents du tableur. Les clés sont celles de `xlsx.import.report.<genre>`.
  function reportOf(sheet, cells, shown) {
    const n = Object.assign(Object.fromEntries(REPORT_KEYS.map(key => [key, 0])), objectCounts(sheet.el));
    cells.forEach(({ formula, look }) => {
      if (formula) n.formulas++;
      if (look.borderStyles) n.borderStyles++;
      if (look.rotated) n.rotated++;
    });
    n.hiddenRows = shown.extent.rows - shown.shownRows.length;
    n.hiddenCols = shown.extent.cols - shown.shownCols.length;
    return REPORT_KEYS.filter(key => n[key] > 0).map(key => ({ key, n: n[key] }));
  }

  // --- Le fichier -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le tableur lu une fois : ses feuilles visibles et `build(index, { lang })`, qui rend la grille de celle qu'on choisit.
  async function openBuffer(buffer) {
    if (buffer.byteLength > MAX_FILE_BYTES) throw fail('fileTooBig', 'Ce fichier est trop gros pour être importé.', { size: buffer.byteLength, max: MAX_FILE_BYTES });
    let odf;
    try {
      odf = await ExportCommon.Odf.open(buffer, { limits: { maxUnpacked: MAX_UNPACKED_BYTES, maxPart: MAX_PART_BYTES }, messages: MESSAGES });
    } catch (e) {
      if (e && e.code === 'tooBig') throw fail('fileTooBig', 'Ce fichier est trop gros pour être importé.', { size: e.size, max: e.max });
      throw e;
    }
    if (odf.kind !== 'spreadsheet') throw fail('wrongType', 'Ce fichier OpenDocument n’est pas un tableur.', { kind: odf.kind });
    const styles = readStyles(odf);
    const sheets = sheetsOf(odf, styles);
    if (!sheets.length) throw fail('empty', 'Ce tableur ne contient aucune feuille.');
    const ctx = { styles, looks: new Map(), spans: new Map() };
    const visible = visibleOf(sheets);
    return {
      sheets: visible.map((sheet, index) => ({ index, name: sheet.name })),
      build: (index, options) => buildModel(ctx, sheets, Object.assign({}, options, { sheetIndex: index })),
    };
  }
  async function bufferOf(file) {
    if (!file || file.size > MAX_FILE_BYTES) throw fail('fileTooBig', 'Ce fichier est trop gros pour être importé.', { size: file ? file.size : 0, max: MAX_FILE_BYTES });
    try {
      return await file.arrayBuffer();
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’a pas pu être lu.', { cause: e });
    }
  }
  async function openFile(file) { return openBuffer(await bufferOf(file)); }
  async function fromBuffer(buffer, options) {
    const book = await openBuffer(buffer);
    return book.build((options && options.sheetIndex) || 0, options);
  }
  async function importFile(file, options) { return fromBuffer(await bufferOf(file), options); }

  return { openFile, fromBuffer, importFile, MAX_FILE_BYTES, MAX_UNPACKED_BYTES, REPORT_KEYS };
})();
