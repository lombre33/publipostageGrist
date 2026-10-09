// Export Excel (.xlsx) d'une grille (js/grid-editor.js) : le tableau du modèle, enregistrement résolu, est écrit case par case dans un classeur
// ExcelJS (largeur des colonnes et hauteur des lignes de la grille, cases fusionnées, texte riche, alignement, fond, bordures, images). Même
// architecture que js/docx-export.js : le HTML du modèle passe par ReaderMode.preview (les bulles prennent leur valeur), puis un parcours du DOM
// résolu fabrique le fichier.
//
// L'Excel n'est qu'un affichage : ni formule ni calcul. Une case n'est écrite en vrai nombre ou en vraie date que si elle ne contient que cela (une
// seule bulle nombre ou date, ou un seul « Calcul » écrit en nombre, sans autre texte), avec le format d'affichage de la bulle ; toute autre case est
// du texte.
//
// Portée : seul un tableau de grille a un sens ici (le menu grise l'export Excel hors grille) ; un modèle sans tableau donne une feuille d'une case
// avec son texte. Les listes s'écrivent « • », « 1. » et « ☐ » devant leurs lignes (Excel n'a pas de liste dans une case) ; une image se pose sur sa
// case, à sa taille.
const XlsxExport = (function () {
  const EXCEL_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', integrity: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz' };
  let excelLibPromise = null;
  async function ensureExcelLibLoaded() {
    // Chargement paresseux (comme DocxExport) : ExcelJS pèse ~0,9 Mo, inutile au premier chargement du widget. cdnjs le sert tel que publié sur npm
    // (dist/exceljs.min.js), d'où un SRI stable. Recalculer l'integrity si la version change : `curl -s <url> | openssl dgst -sha384 -binary |
    // openssl base64 -A`.
    if (!excelLibPromise) excelLibPromise = (window.ExcelJS ? Promise.resolve() : ExportCommon.loadScriptOnce(EXCEL_LIB)).catch(e => { excelLibPromise = null; throw e; });
    return excelLibPromise;
  }

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const PX_TO_PT = 0.75;
  const MAX_ROW_PT = 409.5; // plafond d'Excel pour une hauteur de ligne
  const MAX_COLUMN_WIDTH = 255; // plafond d'Excel pour une largeur de colonne (en caractères)
  const MAX_CELL_CHARS = 32767; // plafond d'Excel pour le texte d'une case
  const MAX_EXACT_NUMBER = 1e15; // au-delà, Excel n'a plus tous les chiffres
  const MIN_EXCEL_DATE_MS = Date.UTC(1900, 2, 1);
  const STYLE = ExportCommon.EDITOR_STYLE;
  const BASE_FONT = { name: 'Arial', size: STYLE.bodyPt };
  const HEADING_PT = STYLE.headingPt;
  const LINK_COLOR = 'FF' + ExportCommon.hexOf(STYLE.linkColor);
  const CODE_FONT = 'Courier New';
  const GENERIC_FONTS = /^(sans-serif|serif|system-ui|ui-sans-serif|ui-serif|-apple-system|blinkmacsystemfont)$/i;

  // Unités
  // Une largeur de colonne d'Excel se compte en caractères de la police par défaut du classeur (Calibri 11 : 7 px par caractère + 5 px de marge).
  function columnWidthFromPx(px) { return Math.min(MAX_COLUMN_WIDTH, Math.max(0.5, (px - 5) / 7)); }
  function rowHeightFromPx(px) { return Math.min(MAX_ROW_PT, Math.max(1, Math.round(px * PX_TO_PT * 4) / 4)); }

  function cssColorArgb(value) {
    // Une couleur CSS -> « FF123456 » (ARGB d'ExcelJS) ; null si vide, transparente ou illisible (ExportCommon.cssColorHex).
    const hex = ExportCommon.cssColorHex(value);
    return hex ? 'FF' + hex : null;
  }
  function cssSizePt(value, fallback) {
    // Taille CSS (« 14px », « 10.5pt », « 1.2em ») -> points, dans les bornes d'Excel ; `fallback` si illisible.
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    const v = String(value);
    const pt = v.endsWith('px') ? n * PX_TO_PT : (v.endsWith('em') || v.endsWith('rem')) ? n * BASE_FONT.size : n;
    return Math.round(Math.max(1, Math.min(409, pt)) * 2) / 2;
  }
  function fontNameFrom(family) {
    const first = String(family || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!first) return null;
    if (/mono/i.test(first) || /^(courier|consolas|menlo)/i.test(first)) return CODE_FONT;
    return GENERIC_FONTS.test(first) ? BASE_FONT.name : first;
  }

  function numberFormatCode(format, value) {
    // Format d'affichage des vrais nombres et des vraies dates Code de format d'Excel, écrit dans sa convention (virgule des milliers, point des
    // décimales) : Excel l'affiche selon la langue de la personne qui ouvre le fichier ; seuls le groupement, le nombre de décimales et la devise
    // viennent de la bulle.
    const f = format || {};
    const decimals = f.decimals == null ? (Number.isInteger(value) ? 0 : null) : f.decimals;
    let code = f.style === 'none' ? '0' : '#,##0';
    if (decimals === null) code += '.###';
    else if (decimals > 0) code += '.' + '0'.repeat(decimals);
    if (f.currency) {
      const literal = String(f.currency).replace(/"/g, '');
      code = VariableFormat.numberLang(f.style) === 'fr' ? code + ' "' + literal + '"' : '"' + literal + '"' + code;
    }
    return code;
  }
  // Préréglages de date de VariableFormat.DATE_PRESETS : le français écrit jour avant mois, l'anglais l'inverse.
  const DATE_CODES = {
    dmy_slash_full: { fr: 'dd/mm/yyyy', en: 'mm/dd/yyyy' },
    dmy_slash_short: { fr: 'd/m/yy', en: 'm/d/yy' },
    iso: { fr: 'yyyy-mm-dd', en: 'yyyy-mm-dd' },
    d_mmm_yyyy: { fr: 'd mmm yyyy', en: 'mmm d, yyyy' },
    d_mmmm_yyyy: { fr: 'd mmmm yyyy', en: 'mmmm d, yyyy' },
    ddd_d_mmm_yyyy: { fr: 'ddd d mmm yyyy', en: 'ddd, mmm d, yyyy' },
    dddd_d_mmmm_yyyy: { fr: 'dddd d mmmm yyyy', en: 'dddd, mmmm d, yyyy' },
  };
  function dateFormatCode(format) {
    const key = (format && format.preset) || VariableFormat.DATE_PRESETS[0].key;
    const codes = DATE_CODES[key] || DATE_CODES[VariableFormat.DATE_PRESETS[0].key];
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? codes.en : codes.fr;
  }

  const BUBBLES = '.var-badge, .calc-badge';
  function isSoleBadge(cell, badge) {
    // Vrai si `badge` est tout le contenu de sa case : une seule bulle, pas d'autre texte ni d'image, pas de boucle « dans la phrase » ou de zone
    // répétée, pas de texte « Avant » / « Après » (la case écrit alors « 1 200, » : du texte, pas un nombre).
    // Les bulles qui prennent une valeur : celles d'une variable et celles d'un calcul (js/variable-calc.js), comme BADGE_SELECTOR de
    // js/reader-mode.js.
    if (cell.querySelectorAll(BUBBLES).length !== 1 || cell.querySelector('img') || badge.hasAttribute('data-loop')) return false;
    if (VariableFormat.affixes(badge.getAttribute('data-before'), badge.getAttribute('data-after'))) return false;
    const rest = cell.cloneNode(true);
    rest.querySelector(BUBBLES).remove();
    return rest.textContent.replace(/[\s\u00a0]+/g, '') === '';
  }
  function badgeFormat(badge) {
    // Le réglage de format d'une bulle (data-format) ; null s'il manque ou n'est pas lisible.
    try { return JSON.parse(badge.getAttribute('data-format') || 'null'); } catch (e) { return null; }
  }
  function typedNumber(value, format, colType) {
    // Un nombre que la bulle écrit : { kind: 'number', value, numFmt } ; null = du texte (nombre en toutes lettres, zéro que la bulle masque - la
    // case est vide, comme en Lecture et dans le PDF -, plus de 15 chiffres : Excel les arrondirait en silence, donc un n° de série ou un IBAN saisi
    // en nombre reste du texte).
    if (format && ((format.type && format.type !== 'number') || format.words)) return null;
    if (value === 0 && Variables.zeroHidden(format, colType)) return null;
    if (Math.abs(value) >= MAX_EXACT_NUMBER) return null;
    return { kind: 'number', value: String(value), numFmt: numberFormatCode(format, value) };
  }
  async function conditionAllows(rawCondition, tableId, record, loopOpts) {
    // La condition d'affichage d'une bulle (data-condition, `rawCondition` en JSON) : vraie quand elle tient ; une condition illisible ou en erreur
    // ne tient pas.
    try { return !!(await ConditionRules.conditionHolds(JSON.parse(rawCondition), tableId, record, loopOpts)); } catch (e) { return false; }
  }
  async function resolvedFiniteNumber(table, column, tableId, record, loopOpts) {
    // La valeur d'une colonne pour la ligne exportée, si c'est un nombre fini ; null pour tout le reste (valeur absente ou en erreur, texte, liste).
    let resolved;
    try { resolved = await Variables.resolveRawValue(table, column, tableId, record, loopOpts); } catch (e) { return null; }
    if (!resolved || resolved.error) return null;
    return typeof resolved.value === 'number' && Number.isFinite(resolved.value) ? resolved.value : null;
  }
  function typedDate(value, format) {
    // Un nombre de secondes d'une colonne Date ou DateTime : { kind: 'date', value, numFmt } ; null = du texte (nombre en toutes lettres, jour, mois
    // ou année retiré).
    if (format && (format.words || format.day === false || format.month === false || format.year === false)) return null;
    const instant = new Date(value * 1000);
    // Une date avant le 1er mars 1900 n'a pas de numéro de série fiable dans Excel (jour fantôme du 29 février 1900, numéros négatifs) : elle reste
    // un texte.
    if (Number.isNaN(instant.getTime()) || instant.getTime() < MIN_EXCEL_DATE_MS || instant.getUTCFullYear() > 9999) return null;
    return { kind: 'date', value: instant.toISOString().slice(0, 10), numFmt: dateFormatCode(format) };
  }
  function typedFromColumn(colType, value, format) {
    // Le verdict d'une valeur numérique selon sa colonne et le réglage de la bulle : une date pour une colonne Date ou DateTime (sauf réglage d'un
    // autre type), un nombre pour une colonne Numérique, Entier ou une bulle réglée en nombre ; le reste est du texte.
    if (colType === 'Date' || colType === 'DateTime') return !format || !format.type || format.type === 'date' ? typedDate(value, format) : null;
    return colType === 'Numeric' || colType === 'Int' || (format && format.type === 'number') ? typedNumber(value, format, colType) : null;
  }
  async function typedValueOf(badge, tableId, record, binding) {
    // { kind: 'number' | 'date', value, numFmt } si la bulle vaut un vrai nombre ou une vraie date qu'Excel peut afficher comme la bulle l'écrit ;
    // null = du texte (nombre en toutes lettres, date dont on a retiré le jour, le mois ou l'année, valeur absente ou en erreur, liste, colonne d'un
    // autre type).
    const table = badge.getAttribute('data-table');
    const column = badge.getAttribute('data-column');
    if (!table || !column) return null;
    const loopOpts = binding ? { loop: binding } : undefined;
    const format = badgeFormat(badge);
    const rawCondition = badge.getAttribute('data-condition');
    if (rawCondition && !(await conditionAllows(rawCondition, tableId, record, loopOpts))) return null;
    const colType = GristAPI.getColumnType(table, column);
    if (colType === 'Attachments') return null;
    const value = await resolvedFiniteNumber(table, column, tableId, record, loopOpts);
    return value === null ? null : typedFromColumn(colType, value, format);
  }
  async function typedCalcValueOf(badge, tableId, record, binding) {
    // Le même verdict pour une bulle « Calcul » : son résultat est un nombre, écrit comme celui d'une colonne Numérique
    // (Variables.resolveCalcResult), avec la ligne du tour dans une zone répétée. Une erreur de calcul (« [ERREUR : …] »), un calcul qui ne montre
    // rien (cellule vide, moyenne de rien) et une liste restent du texte.
    const format = badgeFormat(badge);
    let result;
    try { result = await Variables.resolveCalcResult(badge.getAttribute('data-formula') || '', tableId, record, format, binding ? { loop: binding } : undefined); } catch (e) { return null; }
    if (!result || result.isError || typeof result.value !== 'number' || !Number.isFinite(result.value)) return null;
    return typedNumber(result.value, format, 'Numeric');
  }
  function typedCellHook(tableId, record) {
    // Crochet de ReaderMode.preview : une case dont la seule bulle vaut un vrai nombre ou une vraie date en garde la trace (data-xl-*) ;
    // ReaderMode.preview remplace ensuite la bulle par son texte, et fillTableSheet lit ces marques. Le contrôle « seule bulle de la case » se fait
    // d'un trait, avant tout await : toutes les bulles du document sont alors encore en place.
    return (badge, binding) => {
      const cell = badge.closest('td, th');
      if (!cell || !isSoleBadge(cell, badge)) return undefined;
      const typed = badge.classList.contains('calc-badge') ? typedCalcValueOf(badge, tableId, record, binding) : typedValueOf(badge, tableId, record, binding);
      return typed.then(info => {
        if (!info) return;
        cell.setAttribute('data-xl-kind', info.kind);
        cell.setAttribute('data-xl-value', info.value);
        cell.setAttribute('data-xl-fmt', info.numFmt);
      });
    };
  }
  function typedValueOfCell(td) {
    // La valeur typée d'une case lue sur ses marques (data-xl-*) ; null si la case est du texte.
    const kind = td.getAttribute('data-xl-kind');
    const raw = td.getAttribute('data-xl-value');
    if (!kind || raw === null) return null;
    const value = kind === 'date' ? new Date(raw + 'T00:00:00Z') : Number(raw);
    if (kind === 'date' ? Number.isNaN(value.getTime()) : !Number.isFinite(value)) return null;
    return { value, numFmt: td.getAttribute('data-xl-fmt') || undefined };
  }

  function inheritedRun(node, parent) {
    // Texte d'une case
    // Même sous-ensemble de formats que DocxExport.inheritedRunStyle : seuls les balises et les styles en ligne comptent, jamais le style calculé (la
    // couleur de texte d'un thème sombre ferait du blanc sur blanc dans le fichier).
    const out = Object.assign({}, parent);
    if (node.nodeType !== 1) return out;
    const style = node.getAttribute('style') || '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    applyTagRun(node, css, out);
    applyEmphasisCss(css, out);
    applyFontCss(css, out);
    return out;
  }
  const TAG_RUNS = new Map([
    ['STRONG', { bold: true }], ['B', { bold: true }], ['EM', { italic: true }], ['I', { italic: true }], ['U', { underline: true }],
    ['S', { strike: true }], ['STRIKE', { strike: true }], ['DEL', { strike: true }], ['CODE', { name: CODE_FONT }], ['PRE', { name: CODE_FONT }],
  ]);
  function applyTagRun(node, css, out) {
    // Ce que la balise de `node` change au texte : gras et taille des titres, lien, surlignage de <mark>, exposant et indice, puis la table ci-dessus.
    // Les réglages de texte qu'une balise pose à elle seule.
    const tag = node.tagName;
    Object.assign(out, TAG_RUNS.get(tag));
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.size = HEADING_PT[tag]; }
    if (tag === 'A' && HtmlSanitize.safeLinkHref(node.getAttribute('href'))) { out.color = LINK_COLOR; out.underline = true; }
    if (tag === 'MARK') out.background = cssColorArgb(css('background-color')) || 'FFFFFF00';
    // Exposant et indice (js/script-marks.js) : le vrai exposant ou indice d'Excel (`vertAlign` de la police), dont Excel règle taille et décalage.
    const script = ScriptMarks.kindOf(node);
    if (script) out.vertAlign = script;
  }
  function applyEmphasisCss(css, out) {
    // Gras, italique, souligné et barré posés par le style en ligne.
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italic = true;
    const decoration = css('text-decoration') || css('text-decoration-line');
    if (decoration) {
      if (/underline/i.test(decoration)) out.underline = true;
      if (/line-through/i.test(decoration)) out.strike = true;
    }
  }
  function applyFontCss(css, out) {
    // Taille, police, couleur et fond posés par le style en ligne.
    if (css('font-size')) out.size = cssSizePt(css('font-size'), out.size);
    if (css('font-family')) out.name = fontNameFrom(css('font-family')) || out.name;
    if (css('color')) out.color = cssColorArgb(css('color')) || out.color;
    if (css('background-color')) out.background = cssColorArgb(css('background-color')) || out.background;
  }
  const sameRunStyle = (a, b) => ['bold', 'italic', 'underline', 'strike', 'vertAlign', 'name', 'size', 'color', 'background'].every(k => a[k] === b[k]);

  const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|LI|UL|OL|TABLE)$/;
  function createLineBuilder() {
    // Les lignes de segments { text, style } d'une case en cours de lecture. Un bloc (paragraphe, titre, élément de liste) commence une ligne ; une
    // ligne vide est gardée (Entrée deux fois), celles de la fin non.
    const lines = [[]];
    let blockSeen = false; // un bloc (paragraphe, titre, élément) a commencé : le suivant ouvre une nouvelle ligne, même si la précédente est vide
    let continueLine = false; // juste après le repère d'un élément de liste : son premier paragraphe reste sur la même ligne
    const startLine = () => { if (blockSeen || lines.length > 1 || lines[0].length) lines.push([]); };
    const addText = (text, style) => {
      if (!text) return;
      lines[lines.length - 1].push({ text, style });
      continueLine = false;
    };
    return {
      lines,
      addText,
      lineBreak: () => { lines.push([]); },
      openBlock() { if (continueLine) continueLine = false; else startLine(); blockSeen = true; },
      openItem(marker, style) { startLine(); blockSeen = true; addText(marker, style); continueLine = true; },
      closeItem() { continueLine = false; },
      dropTrailingEmptyLines() { while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop(); },
    };
  }
  const isBlockSibling = n => !!n && n.nodeType === 1 && BLOCK_TAGS.test(n.tagName);
  function textAlignOf(node) {
    // L'alignement posé par le style en ligne d'un bloc ; null sans réglage.
    const m = (node.getAttribute('style') || '').match(/text-align\s*:\s*(left|center|right|justify)/i);
    return m ? m[1].toLowerCase() : null;
  }
  function wholeCellLink(cell) {
    // Le lien (adresse sûre) qui couvre toute la case ; null si la case n'est pas un lien d'un bout à l'autre.
    const links = cell.querySelectorAll('a[href]');
    if (links.length !== 1 || links[0].textContent.trim() !== cell.textContent.trim()) return null;
    return HtmlSanitize.safeLinkHref(links[0].getAttribute('href')) || null;
  }
  function readCellContent(cell) {
    // Le contenu d'une case : des lignes de segments { text, style }, ses images, l'alignement horizontal du premier paragraphe et le lien s'il
    // couvre toute la case.
    const out = createLineBuilder();
    const images = [];
    let horizontal = null;
    const visitText = (node, style) => {
      const value = node.nodeValue.replace(/\r\n?|\n/g, ' ');
      // L'espace ou le retour à la ligne entre deux blocs n'est pas du texte.
      if (value.trim() === '' && (isBlockSibling(node.previousSibling) || isBlockSibling(node.nextSibling))) return;
      out.addText(value, style);
    };
    // Une liste : le repère de chaque élément (puce, numéro, case cochée ou non) puis son contenu ; une sous-liste prend un retrait de plus.
    const visitList = (node, own, listCtx) => {
      const ordered = node.tagName === 'OL';
      let n = parseInt(node.getAttribute('start') || '1', 10) || 1;
      Array.from(node.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        const checked = li.getAttribute('data-checked');
        const marker = node.getAttribute('data-type') === 'taskList' ? (checked === 'true' ? '☑ ' : '☐ ') : ordered ? (n++) + '. ' : '• ';
        out.openItem('  '.repeat(listCtx) + marker, own);
        Array.from(li.childNodes).forEach(child => {
          if (child.nodeType === 1 && child.tagName === 'LABEL') return; // la case à cocher d'une liste de tâches : son repère est déjà écrit
          if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) visit(child, own, listCtx + 1);
          else if (child.nodeType === 1 && child.tagName === 'DIV') Array.from(child.childNodes).forEach(inner => visit(inner, own, listCtx));
          else visit(child, own, listCtx);
        });
        out.closeItem();
      });
    };
    const visit = (node, style, listCtx) => {
      if (node.nodeType === 3) { visitText(node, style); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'BR') { if (!node.classList.contains('ProseMirror-trailingBreak')) out.lineBreak(); return; }
      if (tag === 'IMG') { images.push(node); return; }
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      const own = inheritedRun(node, style);
      // Case d'une variable Oui / Non (ReaderMode.checkboxNode) : son texte est le caractère ☑ / ☐, sa couleur vient du style en ligne de la case
      // (lue par inheritedRun) ; Arial n'a pas ces caractères, la police des symboles de Windows les dessine à la même taille que Word (DocxExport)
      // sans attendre le remplacement de police d'Excel.
      if (node.classList.contains('resolved-checkbox')) own.name = 'Segoe UI Symbol';
      if (tag === 'UL' || tag === 'OL') { visitList(node, own, listCtx); return; }
      if (BLOCK_TAGS.test(tag)) {
        out.openBlock();
        if (horizontal === null) horizontal = textAlignOf(node);
      }
      Array.from(node.childNodes).forEach(child => visit(child, own, listCtx));
    };
    Array.from(cell.childNodes).forEach(child => visit(child, { bold: false }, 0));
    out.dropTrailingEmptyLines();
    return { lines: out.lines, images, horizontal, wholeLink: wholeCellLink(cell) };
  }

  function flattenRuns(lines) {
    // Les segments d'une case, sur une seule suite avec un retour à la ligne entre deux lignes, regroupés quand deux segments voisins ont le même
    // style. Un retour à la ligne prend le style du texte qui le précède (ou, en tête de case, de celui qui le suit) : il ne coupe pas à lui seul une
    // suite de même style en texte riche.
    const parts = [];
    lines.forEach((line, i) => {
      if (i > 0) parts.push({ text: '\n', style: null });
      line.forEach(seg => parts.push({ text: seg.text, style: seg.style }));
    });
    let previous = null;
    parts.forEach(part => { if (part.style) previous = part.style; else part.style = previous; });
    let following = {};
    for (let i = parts.length - 1; i >= 0; i--) { if (parts[i].style) following = parts[i].style; else parts[i].style = following; }
    const runs = [];
    parts.forEach(part => {
      const last = runs[runs.length - 1];
      if (last && sameRunStyle(last.style, part.style)) last.text += part.text; else runs.push({ text: part.text, style: part.style });
    });
    return runs;
  }
  function fontOf(style) {
    // Police de départ d'une case : Arial à la taille du corps de l'éditeur, dans une police que tout Excel a (le Roboto de l'éditeur n'est installé
    // nulle part ; Excel le remplacerait par la police du classeur et changerait la largeur des lignes).
    const font = { name: style.name || BASE_FONT.name, size: style.size || BASE_FONT.size };
    if (style.bold) font.bold = true;
    if (style.italic) font.italic = true;
    if (style.underline) font.underline = true;
    if (style.strike) font.strike = true;
    if (style.vertAlign) font.vertAlign = style.vertAlign;
    if (style.color) font.color = { argb: style.color };
    return font;
  }

  const BORDER_EDGE = { style: 'thin', color: { argb: 'FF777777' } };
  const CELL_BORDER = { top: BORDER_EDGE, left: BORDER_EDGE, bottom: BORDER_EDGE, right: BORDER_EDGE };
  function borderOfSides(sides) {
    // Les bords réglés d'une case de grille (barre de la case, js/table-borders.js) : le trait de départ, une couleur, ou rien (un côté sans trait
    // n'est pas écrit).
    // Bordures d'une case Un filet fin gris sur les quatre côtés de chaque case, comme le PDF (hLineColor/vLineColor #777777, 0,5 pt,
    // js/pdf-export.js:tableFrom) ; jamais le style calculé, dont la couleur suit le thème sombre de l'éditeur.
    const edge = value => (value === TableBorders.NONE ? null : value ? { style: 'thin', color: { argb: 'FF' + value.slice(1).toUpperCase() } } : BORDER_EDGE);
    const border = {};
    ['top', 'left', 'bottom', 'right'].forEach((side) => { const e = edge(sides[side]); if (e) border[side] = e; });
    return border;
  }

  // Images
  const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
  async function imageForWorkbook(img) {
    // Même lecture que DocxExport.docxImageDataFrom : le contenu de `src` (data:, blob:, adresse de pièce jointe) par fetch ; PNG, JPEG et GIF tels
    // quels, tout le reste (WEBP, SVG, BMP) redessiné en PNG. Une image illisible est laissée de côté : le reste de la feuille s'écrit.
    const src = img.getAttribute('src') || '';
    if (!src) { ExportCommon.noteImageWithoutSource(img); return null; }
    let blob;
    try { blob = await ImageIo.fetchBlob(src); }
    catch (e) { console.warn('[XlsxExport] image ignorée (téléchargement impossible) :', src.slice(0, 80), e); ExportCommon.noteUnreadImage(img); return null; }
    try {
      const decoded = await ImageIo.load(blob);
      let extension = IMAGE_EXTENSIONS[blob.type];
      if (!extension) {
        blob = await ImageIo.pngBlob(await ImageIo.draw(decoded));
        extension = 'png';
      }
      const base64 = (await ImageIo.toDataUri(blob)).split(',')[1] || '';
      return { base64, extension, naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight };
    } catch (e) { console.warn('[XlsxExport] image ignorée (décodage impossible) :', src.slice(0, 80), e); ExportCommon.noteUnreadImage(img); return null; }
  }
  function imageSizePx(img, data) {
    // La taille de l'image dans la case : largeur et hauteur posées par l'éditeur (px), l'une déduite de l'autre par le rapport de l'image quand il
    // en manque une ; 320 px de large sans rien d'autre, comme l'export Word.
    const style = img.getAttribute('style') || '';
    const pick = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([\\d.]+)px', 'i')); return m ? parseFloat(m[1]) : null; };
    const ratio = data.naturalWidth && data.naturalHeight ? data.naturalHeight / data.naturalWidth : 0.75;
    const w = pick('width'); const h = pick('height');
    if (w && h) return { width: w, height: h };
    if (w) return { width: w, height: w * ratio };
    if (h) return { width: h / ratio, height: h };
    return { width: 320, height: 320 * ratio };
  }

  function sheetNameFrom(name, used) {
    // Feuille
    // Nom de feuille valable pour Excel : 31 caractères au plus, sans \ / ? * [ ] :, ni apostrophe au début ou à la fin ; unique dans le classeur
    // (« nom (2) »).
    let base = String(name || '').replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '').trim() || 'Feuille';
    base = base.slice(0, 31);
    if (!used) return base;
    let candidate = base; let n = 2;
    while (used.has(candidate.toLowerCase())) { const suffix = ' (' + n++ + ')'; candidate = base.slice(0, 31 - suffix.length) + suffix; }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function columnWidthsPx(table, columnCount) {
    // Largeurs des colonnes en px : le <colgroup> du modèle d'abord (c'est la largeur réglée par la personne), sinon les cases de la première ligne
    // telles que rendues.
    const fromCols = Array.from(table.querySelectorAll(':scope > colgroup > col')).map(col => parseFloat(col.style.width) || 0);
    const widths = fromCols.slice(0, columnCount);
    const measured = ExportCommon.measuredColumnWidthsPx(table, columnCount);
    const firstRow = table.rows[0];
    for (let i = 0; i < columnCount; i++) {
      if (widths[i] > 0) continue;
      const cell = firstRow && firstRow.cells[i];
      widths[i] = (cell && cell.getBoundingClientRect().width) || (measured && measured[i]) || 100;
    }
    return widths;
  }

  async function addTableSheet(workbook, name, root, options) {
    // Les feuilles d'un enregistrement : une seule, ou une par tranche de lignes que les sauts de page de la grille délimitent (« nom », « nom
    // (2) »... : le nom de la suivante se prend comme celui d'un enregistrement de même nom). Elles ont toutes les mêmes colonnes et chacune recompte
    // ses lignes depuis 1 ; la première est rendue.
    const table = root.querySelector('table');
    // Un objet de réglages neuf par feuille : ExcelJS peut garder une référence à celui qu'on lui donne.
    const sheetOptions = () => ({
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: options.paperSize || 9, orientation: options.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: Object.assign({ left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, options.marginsInch || {}),
      },
    });
    const used = options.usedNames || new Set();
    const newSheet = () => workbook.addWorksheet(sheetNameFrom(name, used), sheetOptions());
    if (!table) {
      const sheet = newSheet();
      sheet.getColumn(1).width = 80;
      const cell = sheet.getCell(1, 1);
      cell.value = (root.textContent || '').trim().slice(0, MAX_CELL_CHARS);
      cell.font = fontOf({}); cell.alignment = { vertical: 'top', wrapText: true };
      return sheet;
    }
    const allRows = ExportCommon.tableRows(table);
    const widthsPx = columnWidthsPx(table, ExportCommon.placeCells(allRows).width);
    const borderSides = ExportCommon.cellBorderSides(table);
    let first = null;
    for (const [from, to] of ExportCommon.gridRowSegments(allRows)) {
      const sheet = newSheet();
      await fillTableSheet(workbook, sheet, allRows.slice(from, to), widthsPx, borderSides);
      first = first || sheet;
    }
    return first;
  }

  function cellRuns(content) {
    // Les segments de texte d'une case, chacun d'un seul style, sans segment vide ; une case d'espaces et de retours à la ligne est une case vide.
    const runs = flattenRuns(content.lines).filter(run => run.text !== '');
    return runs.every(run => run.text.replace(/[\s ]+/g, '') === '') ? [] : runs;
  }
  function writeCellValue(master, runs, text, content, typedInfo) {
    // Écrit la valeur et la police de la case maîtresse : un vrai nombre ou une vraie date, un lien, un texte d'un seul style, un texte riche, ou
    // rien.
    const firstStyle = runs.length ? runs[0].style : {};
    if (typedInfo && text !== '') {
      master.value = typedInfo.value;
      master.numFmt = typedInfo.numFmt;
      master.font = fontOf(firstStyle);
    } else if (content.wholeLink && runs.length) {
      master.value = { text, hyperlink: content.wholeLink };
      master.font = fontOf(Object.assign({}, firstStyle, { color: firstStyle.color || LINK_COLOR, underline: true }));
    } else if (runs.length && runs.every(run => sameRunStyle(run.style, runs[0].style))) {
      master.value = text;
      master.font = fontOf(firstStyle);
    } else if (runs.length) {
      master.value = { richText: runs.map(run => ({ text: run.text, font: fontOf(run.style) })) };
      master.font = fontOf({});
    } else {
      master.font = fontOf({});
    }
  }
  function cellFillOf(td, runs) {
    // Le fond d'une case : celui de son style en ligne seulement (le fond calculé suit le thème sombre) ; sans lui, un surlignage qui couvre tout son
    // texte. Sur une partie du texte Excel ne sait pas le dessiner, il est laissé de côté.
    const cellFill = cssColorArgb(td.style.backgroundColor);
    if (!cellFill && runs.length && runs.every(run => run.style.background && run.style.background === runs[0].style.background)) return runs[0].style.background;
    return cellFill;
  }
  function cellAlignment(td, content, typedInfo) {
    const vertical = td.getAttribute('data-valign') || td.style.verticalAlign;
    const alignment = { vertical: vertical === 'top' || vertical === 'bottom' ? vertical : 'middle', wrapText: true };
    if (content.horizontal) alignment.horizontal = content.horizontal;
    else if (typedInfo) alignment.horizontal = 'left'; // comme dans la grille et le PDF : un nombre s'y lit à gauche, comme tout le texte
    return alignment;
  }
  function styleMergedArea(sheet, p, master, look) {
    // Chaque case d'une fusion porte l'alignement, le fond et les quatre bords de la case fusionnée : Excel ne dessine que ceux de son pourtour.
    for (let rr = p.row; rr < p.row + p.rowspan; rr++) {
      for (let cc = p.col; cc < p.col + p.colspan; cc++) {
        const cell = sheet.getCell(rr + 1, cc + 1);
        cell.alignment = look.alignment;
        if (look.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: look.fill } };
        cell.border = look.border;
        if (cell !== master && !cell.font) cell.font = master.font;
      }
    }
  }
  function writePlacedCell(sheet, p, borderSides) {
    // Écrit une case placée de la grille ; rend ses images, que la feuille pose ensuite.
    const td = p.el;
    const content = readCellContent(td);
    const typedInfo = typedValueOfCell(td);
    const master = sheet.getCell(p.row + 1, p.col + 1);
    const runs = cellRuns(content);
    writeCellValue(master, runs, runs.map(run => run.text).join('').slice(0, MAX_CELL_CHARS), content, typedInfo);
    styleMergedArea(sheet, p, master, {
      alignment: cellAlignment(td, content, typedInfo),
      fill: cellFillOf(td, runs),
      border: borderSides && borderSides.get(td) ? borderOfSides(borderSides.get(td)) : CELL_BORDER,
    });
    return content.images.map(img => ({ img, row: p.row, col: p.col }));
  }
  async function addSheetImage(workbook, sheet, entry) {
    // Pose l'image d'une case sur la feuille, à sa taille ; une image illisible est laissée de côté.
    const data = await imageForWorkbook(entry.img);
    if (!data) return;
    const size = imageSizePx(entry.img, data);
    const id = workbook.addImage({ base64: data.base64, extension: data.extension });
    sheet.addImage(id, { tl: { col: entry.col, row: entry.row }, ext: { width: Math.round(size.width), height: Math.round(size.height) }, editAs: 'oneCell' });
  }

  async function fillTableSheet(workbook, sheet, rows, widthsPx, borderSides) {
    // Une feuille pour `rows` (les lignes de sa tranche) : largeur des colonnes, hauteur des lignes, fusions, puis chaque case.
    const { placed } = ExportCommon.placeCells(rows);
    widthsPx.forEach((px, i) => { sheet.getColumn(i + 1).width = columnWidthFromPx(px); });
    rows.forEach((tr, r) => { sheet.getRow(r + 1).height = rowHeightFromPx(tr.getBoundingClientRect().height); });
    // Les fusions d'abord : ExcelJS copie le style de la case maîtresse sur les autres au moment de fusionner, on style ensuite chaque case une à
    // une.
    placed.forEach(p => { if (p.rowspan > 1 || p.colspan > 1) sheet.mergeCells(p.row + 1, p.col + 1, p.row + p.rowspan, p.col + p.colspan); });
    const pendingImages = [];
    for (const p of placed) pendingImages.push(...writePlacedCell(sheet, p, borderSides));
    for (const entry of pendingImages) await addSheetImage(workbook, sheet, entry);
  }

  async function addRecordSheet(workbook, name, resolvedHtml, options) {
    // Ajoute au classeur la feuille d'un enregistrement (une de plus à chaque saut de page de la grille) : `resolvedHtml` est le HTML du modèle dont
    // les bulles ont déjà pris leur valeur (ReaderMode.preview avec typedCellHook, qui laisse leurs marques data-xl-* sur les cases à nombre ou
    // date). Le tableau est rendu hors écran le temps de la mesure (largeur des colonnes et hauteur des lignes telles que l'éditeur les affiche).
    const root = document.createElement('div');
    root.innerHTML = HtmlSanitize.clean(resolvedHtml || '');
    const table = root.querySelector('table');
    const widthPx = table ? Math.max(100, Math.round(parseFloat(table.style.width) || table.getBoundingClientRect().width || 800)) : 800;
    const detach = ExportCommon.attachMeasureHost(root, widthPx + 24);
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
      return await addTableSheet(workbook, name, root, options || {});
    } finally { detach(); }
  }

  function newWorkbook() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Grist Factory';
    workbook.created = new Date();
    workbook.modified = workbook.created;
    return workbook;
  }
  const PAPER_SIZES = { A3: 8, A4: 9, A5: 11, A6: 70 };
  function pageOptionsFromLayout() {
    // Les réglages de page d'un modèle (js/page-layout.js) pour la feuille : orientation, format du papier et marges en pouces.
    // Le code du papier d'Excel (`paperSize` de la mise en page) de chacun des formats de js/page-layout.js : ceux d'Excel pour A3, A4 et A5, celui
    // du pilote d'impression Windows pour A6 (DMPAPER_A6) ; tout autre format est l'A4.
    const m = PageLayout.getMarginsMm();
    const inch = mm => Math.round(mm / 25.4 * 100) / 100;
    return { landscape: PageLayout.isLandscape(), paperSize: PAPER_SIZES[PageLayout.getFormat()] || PAPER_SIZES.A4, marginsInch: { left: inch(m.left), right: inch(m.right), top: inch(m.top), bottom: inch(m.bottom) } };
  }

  // Le HTML d'un enregistrement dont les bulles ont pris leur valeur (typedCellHook marque les cases à nombre ou date) et le nom de son fichier.
  const resolveRecord = (htmlContent, tableId, record, filenameTemplate) =>
    ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, null, typedCellHook(tableId, record));
  async function workbookToBlob(workbook) {
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: XLSX_MIME });
  }

  async function getXlsxBlobForRecord(htmlContent, tableId, record, filenameTemplate, options) {
    // Un classeur d'une feuille pour un enregistrement : un export seul, ou un fichier de l'archive ZIP d'un lot.
    // Une image d'un site externe est téléchargée à l'écriture du classeur : la fenêtre passe avant tout, comme pour le PDF et le Word
    // (js/external-images.js).
    await ExternalImages.confirmExport(htmlContent, null);
    await ensureExcelLibLoaded();
    const { resolvedHtml, filename } = await resolveRecord(htmlContent, tableId, record, filenameTemplate);
    const workbook = newWorkbook();
    await addRecordSheet(workbook, filename, resolvedHtml, Object.assign(pageOptionsFromLayout(), options || {}));
    return { blob: await workbookToBlob(workbook), filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, options) {
    if (!record) { alert(I18n.t('alert.noRecordForExportXlsx')); return; }
    const { blob, filename } = await getXlsxBlobForRecord(htmlContent, tableId, record, filenameTemplate, options);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.xlsx');
  }

  function nameWithValue(name, value) {
    // Le nom d'une feuille « un document par valeur » (js/list-split.js) : celui du fichier, raccourci pour que la valeur tienne dans les 31
    // caractères d'Excel.
    if (!value) return name;
    const tail = ' - ' + value;
    return String(name || '').slice(0, Math.max(0, 31 - tail.length)).trim() + tail;
  }

  async function createSingleWorkbook(options) {
    // Un classeur unique pour toute la table : une feuille par enregistrement (et une de plus à chaque saut de page de la grille), nommée comme le
    // fichier qu'il aurait eu dans l'archive ZIP (31 caractères au plus, « nom (2) » quand deux feuilles s'appelleraient pareil). Un enregistrement
    // qui échoue ne laisse pas de feuille à moitié écrite : l'appelant le compte en échec et passe au suivant. `valueName` (facultatif) : la valeur
    // de la liste que ce document écrit quand le modèle est réglé « Un document par valeur » ; elle suit le nom de la feuille. `pageOptions`
    // (facultatif, de la forme de pageOptionsFromLayout) : la page de cette feuille quand son modèle n'est pas celui de l'écran (« Modèle selon la
    // ligne », js/main.js:onExportBatch).
    await ensureExcelLibLoaded();
    const workbook = newWorkbook();
    const usedNames = new Set();
    return {
      async appendRecord(htmlContent, tableId, record, filenameTemplate, valueName, pageOptions) {
        await ExternalImages.confirmExport(htmlContent, null);
        const { resolvedHtml, filename } = await resolveRecord(htmlContent, tableId, record, filenameTemplate);
        const before = workbook.worksheets.length;
        try {
          await addRecordSheet(workbook, nameWithValue(filename, valueName), resolvedHtml, Object.assign(pageOptionsFromLayout(), options || {}, pageOptions || {}, { usedNames }));
        } catch (e) {
          workbook.worksheets.slice(before).forEach(sheet => { usedNames.delete(sheet.name.toLowerCase()); workbook.removeWorksheet(sheet.id); });
          throw e;
        }
        return { filename };
      },
      toBlob: () => workbookToBlob(workbook),
    };
  }

  return { exportCurrentRecord, getXlsxBlobForRecord, createSingleWorkbook, ensureExcelLibLoaded, sheetNameFrom, pageOptionsFromLayout, XLSX_MIME };
})();
