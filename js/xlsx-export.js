// Export Excel (.xlsx) d'une grille (js/grid-editor.js) : le tableau du modèle, enregistrement résolu, est écrit case par case dans un classeur ExcelJS - largeur des
// colonnes et hauteur des lignes de la grille, cases fusionnées, texte riche, alignement, fond, bordures, images. Même architecture que js/docx-export.js : le HTML du
// modèle passe par ReaderMode.preview (les bulles prennent leur valeur), puis un parcours du DOM résolu fabrique le fichier.
//
// L'Excel n'est qu'un AFFICHAGE : aucune formule, aucun calcul. Une case n'est écrite comme VRAI nombre ou VRAIE date que si elle ne contient QUE cela (une seule bulle
// nombre ou date, sans autre texte), avec le format d'affichage de la bulle ; toute autre case est du texte (choix d'Antoine, 01/10).
//
// Portée : seul un tableau de grille a un sens ici (le menu grise l'export Excel hors grille) ; un modèle sans tableau donne une feuille d'une case avec son texte.
// Les listes s'écrivent « • », « 1. » et « ☐ » devant leurs lignes (Excel n'a pas de liste dans une case) ; une image se pose sur sa case, à sa taille.
const XlsxExport = (function () {
  // Chargement paresseux (comme DocxExport) : ExcelJS pèse ~0,9 Mo, inutile au premier chargement du widget. cdnjs le sert tel que publié sur npm
  // (dist/exceljs.min.js) : SRI stable. Recalculer l'integrity si la version change : `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
  const EXCEL_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', integrity: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz' };
  let excelLibPromise = null;
  async function ensureExcelLibLoaded() {
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
  // Police de départ d'une case : Arial 10,5 pt, la taille de DEFAULT_FONT_SIZE (js/pdf-export.js) dans une police que tout Excel a (le Roboto de l'éditeur n'est installé
  // nulle part ; Excel le remplacerait par la police du classeur et changerait la largeur des lignes).
  const BASE_FONT = { name: 'Arial', size: 10.5 };
  const HEADING_PT = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 }; // mêmes tailles que HEADING_HALF_PT / 2, js/docx-export.js
  const LINK_COLOR = 'FF0563C1';
  const CODE_FONT = 'Courier New';
  const GENERIC_FONTS = /^(sans-serif|serif|system-ui|ui-sans-serif|ui-serif|-apple-system|blinkmacsystemfont)$/i;

  // --- Unités ------------------------------------------------------------------------------------------------------------------------------------------------
  // Une largeur de colonne d'Excel se compte en caractères de la police par défaut du classeur (Calibri 11 : 7 px par caractère + 5 px de marge).
  function columnWidthFromPx(px) { return Math.min(MAX_COLUMN_WIDTH, Math.max(0.5, (px - 5) / 7)); }
  function rowHeightFromPx(px) { return Math.min(MAX_ROW_PT, Math.max(1, Math.round(px * PX_TO_PT * 4) / 4)); }

  // « rgb(12, 34, 56) », « rgba(12, 34, 56, 0.5) » ou « #123456 » -> « FF123456 » (ARGB d'ExcelJS) ; null si transparent, vide ou illisible.
  function cssColorArgb(value) {
    if (!value) return null;
    const v = String(value).trim().toLowerCase();
    if (v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor') return null;
    const rgb = v.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
    if (rgb) {
      const alpha = rgb[4] === undefined ? 1 : (rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]));
      if (alpha === 0) return null;
      const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
      return ('FF' + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3])).toUpperCase();
    }
    const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (short) return ('FF' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toUpperCase();
    const long = v.match(/^#([0-9a-f]{6})$/);
    return long ? ('FF' + long[1]).toUpperCase() : null;
  }
  // Taille CSS (« 14px », « 10.5pt », « 1.2em ») -> points, dans les bornes d'Excel ; `fallback` si illisible.
  function cssSizePt(value, fallback) {
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

  // --- Format d'affichage des vrais nombres et des vraies dates ------------------------------------------------------------------------------------------------
  // Même choix de langue que VariableFormat.numberLang : « us » ou « fr » imposés par la bulle, sinon la langue de l'interface.
  function numberLangOf(style) {
    if (style === 'us') return 'en';
    if (style === 'fr') return 'fr';
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? 'en' : 'fr';
  }
  // Code de format d'Excel : écrit dans la convention d'Excel (virgule des milliers, point des décimales) - c'est Excel qui l'affiche selon la langue de la personne
  // qui l'ouvre ; seuls le groupement, le nombre de décimales et la devise viennent de la bulle.
  function numberFormatCode(format, value) {
    const f = format || {};
    const decimals = f.decimals == null ? (Number.isInteger(value) ? 0 : null) : f.decimals;
    let code = f.style === 'none' ? '0' : '#,##0';
    if (decimals === null) code += '.###';
    else if (decimals > 0) code += '.' + '0'.repeat(decimals);
    if (f.currency) {
      const literal = String(f.currency).replace(/"/g, '');
      code = numberLangOf(f.style) === 'fr' ? code + ' "' + literal + '"' : '"' + literal + '"' + code;
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

  // Vrai si `badge` est tout le contenu de sa case : une seule bulle, pas d'autre texte ni d'image, pas de boucle « dans la phrase » ou de zone répétée.
  function isSoleBadge(cell, badge) {
    if (cell.querySelectorAll('.var-badge').length !== 1 || cell.querySelector('img') || badge.hasAttribute('data-loop')) return false;
    const rest = cell.cloneNode(true);
    rest.querySelector('.var-badge').remove();
    return rest.textContent.replace(/[\s\u00a0]+/g, '') === '';
  }
  // { kind: 'number' | 'date', value, numFmt } si la bulle vaut un vrai nombre ou une vraie date qu'Excel peut afficher comme la bulle l'écrit ; null = du texte (nombre écrit
  // en toutes lettres, date dont on a retiré le jour, le mois ou l'année, valeur absente ou en erreur, liste, colonne d'un autre type). Un zéro que la bulle masque
  // (réglage par défaut des colonnes nombre) reste du texte : la case est vide, comme dans la Lecture et le PDF.
  async function typedValueOf(badge, tableId, record, binding) {
    const table = badge.getAttribute('data-table');
    const column = badge.getAttribute('data-column');
    if (!table || !column) return null;
    const loopOpts = binding ? { loop: binding } : undefined;
    let format = null;
    try { format = JSON.parse(badge.getAttribute('data-format') || 'null'); } catch (e) { format = null; }
    const rawCondition = badge.getAttribute('data-condition');
    if (rawCondition) {
      try { if (!(await ConditionRules.conditionHolds(JSON.parse(rawCondition), tableId, record, loopOpts))) return null; } catch (e) { return null; }
    }
    const colType = GristAPI.getColumnType(table, column);
    if (colType === 'Attachments') return null;
    let resolved;
    try { resolved = await Variables.resolveRawValue(table, column, tableId, record, loopOpts); } catch (e) { return null; }
    if (!resolved || resolved.error) return null;
    const value = resolved.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const isDateColumn = colType === 'Date' || colType === 'DateTime';
    if (isDateColumn && (!format || !format.type || format.type === 'date')) {
      if (format && (format.words || format.day === false || format.month === false || format.year === false)) return null;
      const instant = new Date(value * 1000);
      // Une date avant le 1er mars 1900 n'a pas de numéro de série fiable dans Excel (jour fantôme du 29 février 1900, numéros négatifs) : elle reste un texte.
      if (Number.isNaN(instant.getTime()) || instant.getTime() < MIN_EXCEL_DATE_MS || instant.getUTCFullYear() > 9999) return null;
      const iso = instant.toISOString().slice(0, 10);
      return { kind: 'date', value: iso, numFmt: dateFormatCode(format) };
    }
    if (!isDateColumn && (colType === 'Numeric' || colType === 'Int' || (format && format.type === 'number'))) {
      if (format && ((format.type && format.type !== 'number') || format.words)) return null;
      if (value === 0 && Variables.zeroHidden(format, colType)) return null;
      // Excel garde 15 chiffres significatifs : un identifiant plus long (n° de série, IBAN saisi en nombre) y serait arrondi en silence, il reste un texte.
      if (Math.abs(value) >= MAX_EXACT_NUMBER) return null;
      return { kind: 'number', value: String(value), numFmt: numberFormatCode(format, value) };
    }
    return null;
  }
  // Crochet de ReaderMode.preview : une case dont la seule bulle vaut un vrai nombre ou une vraie date en garde la trace (data-xl-*) ; ReaderMode.preview remplace ensuite
  // la bulle par son texte, et le parcours de la feuille (addTableSheet) lit ces marques. Le contrôle « seule bulle de la case » est fait d'un trait, avant tout await :
  // à cet instant toutes les bulles du document sont encore en place.
  function typedCellHook(tableId, record) {
    return (badge, binding) => {
      const cell = badge.closest('td, th');
      if (!cell || !isSoleBadge(cell, badge)) return undefined;
      return typedValueOf(badge, tableId, record, binding).then(info => {
        if (!info) return;
        cell.setAttribute('data-xl-kind', info.kind);
        cell.setAttribute('data-xl-value', info.value);
        cell.setAttribute('data-xl-fmt', info.numFmt);
      });
    };
  }
  // La valeur typée d'une case lue sur ses marques (data-xl-*) ; null si la case est du texte.
  function typedValueOfCell(td) {
    const kind = td.getAttribute('data-xl-kind');
    const raw = td.getAttribute('data-xl-value');
    if (!kind || raw === null) return null;
    const value = kind === 'date' ? new Date(raw + 'T00:00:00Z') : Number(raw);
    if (kind === 'date' ? Number.isNaN(value.getTime()) : !Number.isFinite(value)) return null;
    return { value, numFmt: td.getAttribute('data-xl-fmt') || undefined };
  }

  // --- Texte d'une case ----------------------------------------------------------------------------------------------------------------------------------------
  // Même sous-ensemble de formats que DocxExport.inheritedRunStyle : seuls les balises et les styles EN LIGNE comptent (jamais le style calculé : la couleur de texte
  // d'un thème sombre ferait du blanc sur blanc dans le fichier).
  function inheritedRun(node, parent) {
    const out = Object.assign({}, parent);
    if (node.nodeType !== 1) return out;
    const style = node.getAttribute('style') || '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.size = HEADING_PT[tag]; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italic = true;
    if (tag === 'U') out.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out.strike = true;
    if (tag === 'A' && HtmlSanitize.safeLinkHref(node.getAttribute('href'))) { out.color = LINK_COLOR; out.underline = true; }
    if (tag === 'CODE' || tag === 'PRE') out.name = CODE_FONT;
    if (tag === 'MARK') out.background = cssColorArgb(css('background-color')) || 'FFFFFF00';
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italic = true;
    const decoration = css('text-decoration') || css('text-decoration-line');
    if (decoration) {
      if (/underline/i.test(decoration)) out.underline = true;
      if (/line-through/i.test(decoration)) out.strike = true;
    }
    if (css('font-size')) out.size = cssSizePt(css('font-size'), out.size);
    if (css('font-family')) out.name = fontNameFrom(css('font-family')) || out.name;
    if (css('color')) out.color = cssColorArgb(css('color')) || out.color;
    if (css('background-color')) out.background = cssColorArgb(css('background-color')) || out.background;
    return out;
  }
  const sameRunStyle = (a, b) => ['bold', 'italic', 'underline', 'strike', 'name', 'size', 'color', 'background'].every(k => a[k] === b[k]);

  const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|LI|UL|OL|TABLE)$/;
  // Le contenu d'une case : des lignes de segments { text, style }, la première image de chaque ligne, l'alignement horizontal du premier paragraphe et le lien s'il
  // couvre toute la case. Un bloc (paragraphe, titre, élément de liste) commence une ligne ; une ligne vide est gardée (Entrée deux fois), celles de la fin non.
  function readCellContent(cell) {
    const lines = [[]];
    const images = [];
    let horizontal = null;
    let wholeLink = null;
    let blockSeen = false; // un bloc (paragraphe, titre, élément) a déjà commencé : le suivant commence une nouvelle ligne, même si la précédente est vide
    let continueLine = false; // juste après le repère d'un élément de liste : son premier paragraphe reste sur la même ligne
    const startLine = () => { if (blockSeen || lines.length > 1 || lines[0].length) lines.push([]); };
    const isBlockSibling = n => !!n && n.nodeType === 1 && BLOCK_TAGS.test(n.tagName);
    const addText = (text, style) => {
      if (!text) return;
      lines[lines.length - 1].push({ text, style });
      continueLine = false;
    };
    const visit = (node, style, listCtx) => {
      if (node.nodeType === 3) {
        const value = node.nodeValue.replace(/\r\n?|\n/g, ' ');
        // L'espace ou le retour à la ligne entre deux blocs n'est pas du texte.
        if (value.trim() === '' && (isBlockSibling(node.previousSibling) || isBlockSibling(node.nextSibling))) return;
        addText(value, style);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'BR') { if (!node.classList.contains('ProseMirror-trailingBreak')) lines.push([]); return; }
      if (tag === 'IMG') { images.push({ img: node, line: lines.length - 1 }); return; }
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      const own = inheritedRun(node, style);
      // Case d'une variable Oui / Non (ReaderMode.checkboxNode) : son texte est le caractère ☑ / ☐, sa couleur vient du style en ligne de la case (lue par inheritedRun) ; Arial n'a pas ces
      // caractères, la police des symboles de Windows les dessine à la même taille que Word (DocxExport) sans attendre le remplacement de police d'Excel.
      if (node.classList.contains('resolved-checkbox')) own.name = 'Segoe UI Symbol';
      if (tag === 'UL' || tag === 'OL') {
        const ordered = tag === 'OL';
        let n = parseInt(node.getAttribute('start') || '1', 10) || 1;
        Array.from(node.children).forEach(li => {
          if (li.tagName !== 'LI') return;
          const checked = li.getAttribute('data-checked');
          const marker = node.getAttribute('data-type') === 'taskList' ? (checked === 'true' ? '☑ ' : '☐ ') : ordered ? (n++) + '. ' : '• ';
          startLine();
          blockSeen = true;
          addText('  '.repeat(listCtx) + marker, own);
          continueLine = true;
          Array.from(li.childNodes).forEach(child => {
            if (child.nodeType === 1 && child.tagName === 'LABEL') return; // la case à cocher d'une liste de tâches : son repère est déjà écrit
            if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) visit(child, own, listCtx + 1);
            else if (child.nodeType === 1 && child.tagName === 'DIV') Array.from(child.childNodes).forEach(inner => visit(inner, own, listCtx));
            else visit(child, own, listCtx);
          });
          continueLine = false;
        });
        return;
      }
      if (BLOCK_TAGS.test(tag)) {
        if (continueLine) continueLine = false; else startLine();
        blockSeen = true;
        if (horizontal === null) { const m = (node.getAttribute('style') || '').match(/text-align\s*:\s*(left|center|right|justify)/i); if (m) horizontal = m[1].toLowerCase(); }
      }
      Array.from(node.childNodes).forEach(child => visit(child, own, listCtx));
    };
    Array.from(cell.childNodes).forEach(child => visit(child, { bold: false }, 0));
    while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    const links = cell.querySelectorAll('a[href]');
    if (links.length === 1 && HtmlSanitize.safeLinkHref(links[0].getAttribute('href')) && links[0].textContent.trim() === cell.textContent.trim()) wholeLink = HtmlSanitize.safeLinkHref(links[0].getAttribute('href'));
    return { lines, images, horizontal, wholeLink };
  }

  // Les segments d'une case, sur une seule suite avec un retour à la ligne entre deux lignes, regroupés quand deux segments voisins ont le même style. Un retour à la
  // ligne prend le style du texte qui le précède (ou, en tête de case, de celui qui le suit) : il ne coupe pas à lui seul une suite de même style en texte riche.
  function flattenRuns(lines) {
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
    const font = { name: style.name || BASE_FONT.name, size: style.size || BASE_FONT.size };
    if (style.bold) font.bold = true;
    if (style.italic) font.italic = true;
    if (style.underline) font.underline = true;
    if (style.strike) font.strike = true;
    if (style.color) font.color = { argb: style.color };
    return font;
  }

  // --- Bordures d'une case --------------------------------------------------------------------------------------------------------------------------------------
  // Un filet fin gris sur les quatre côtés de chaque case, comme le PDF (hLineColor/vLineColor #777777, 0,5 pt, js/pdf-export.js:tableFrom) : jamais le style calculé,
  // dont la couleur suit le thème sombre de l'éditeur.
  const BORDER_EDGE = { style: 'thin', color: { argb: 'FF777777' } };
  const CELL_BORDER = { top: BORDER_EDGE, left: BORDER_EDGE, bottom: BORDER_EDGE, right: BORDER_EDGE };

  // --- Images -----------------------------------------------------------------------------------------------------------------------------------------------------------
  const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
  // Même lecture que DocxExport.docxImageDataFrom : le contenu de `src` (data:, blob:, adresse de pièce jointe) par fetch ; PNG, JPEG et GIF tels quels, tout le reste (WEBP,
  // SVG, BMP) redessiné en PNG. Une image illisible est laissée de côté : le reste de la feuille s'écrit.
  function loadImage(url) {
    return new Promise((resolve, reject) => { const probe = new Image(); probe.onload = () => resolve(probe); probe.onerror = () => reject(new Error('image illisible')); probe.src = url; });
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  }
  async function imageForWorkbook(img) {
    const src = img.getAttribute('src') || '';
    if (!src) return null;
    let blob;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      blob = await resp.blob();
    } catch (e) { console.warn('[XlsxExport] image ignorée (téléchargement impossible) :', src.slice(0, 80), e); return null; }
    try {
      let extension = IMAGE_EXTENSIONS[blob.type];
      const url = URL.createObjectURL(blob);
      try {
        const decoded = await loadImage(url);
        if (!extension) {
          const canvas = document.createElement('canvas');
          canvas.width = decoded.naturalWidth || 512; canvas.height = decoded.naturalHeight || 512;
          canvas.getContext('2d').drawImage(decoded, 0, 0, canvas.width, canvas.height);
          blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob a échoué'))), 'image/png'));
          extension = 'png';
        }
        return { base64: await blobToBase64(blob), extension, naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight };
      } finally { URL.revokeObjectURL(url); }
    } catch (e) { console.warn('[XlsxExport] image ignorée (décodage impossible) :', src.slice(0, 80), e); return null; }
  }
  // La taille de l'image dans la case : largeur et hauteur posées par l'éditeur (px), l'une déduite de l'autre par le rapport de l'image quand il en manque une ; 320 px de large
  // sans rien d'autre, comme l'export Word.
  function imageSizePx(img, data) {
    const style = img.getAttribute('style') || '';
    const pick = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([\\d.]+)px', 'i')); return m ? parseFloat(m[1]) : null; };
    const ratio = data.naturalWidth && data.naturalHeight ? data.naturalHeight / data.naturalWidth : 0.75;
    const w = pick('width'); const h = pick('height');
    if (w && h) return { width: w, height: h };
    if (w) return { width: w, height: w * ratio };
    if (h) return { width: h / ratio, height: h };
    return { width: 320, height: 320 * ratio };
  }

  // --- Feuille ----------------------------------------------------------------------------------------------------------------------------------------------------------
  // Nom de feuille valable pour Excel : 31 caractères au plus, sans \ / ? * [ ] :, ni apostrophe au début ou à la fin ; unique dans le classeur (« nom (2) »).
  function sheetNameFrom(name, used) {
    let base = String(name || '').replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '').trim() || 'Feuille';
    base = base.slice(0, 31);
    if (!used) return base;
    let candidate = base; let n = 2;
    while (used.has(candidate.toLowerCase())) { const suffix = ' (' + n++ + ')'; candidate = base.slice(0, 31 - suffix.length) + suffix; }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  // Largeurs des colonnes en px : le <colgroup> du modèle d'abord (c'est la largeur réglée par la personne), sinon les cases de la première ligne telles que rendues.
  function columnWidthsPx(table, columnCount) {
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

  // Place chaque case sur la grille de la feuille (les cellules fusionnées en recouvrent plusieurs) : { td, row, col, rowSpan, colSpan }, numérotés depuis 0.
  function placeCells(rows) {
    const taken = [];
    const placed = [];
    let columnCount = 0;
    rows.forEach((tr, r) => {
      let c = 0;
      Array.from(tr.cells).forEach(td => {
        while (taken[r] && taken[r][c]) c++;
        const colSpan = Math.max(1, parseInt(td.getAttribute('colspan') || '1', 10) || 1);
        const rowSpan = Math.max(1, Math.min(rows.length - r, parseInt(td.getAttribute('rowspan') || '1', 10) || 1));
        for (let dr = 0; dr < rowSpan; dr++) for (let dc = 0; dc < colSpan; dc++) (taken[r + dr] = taken[r + dr] || [])[c + dc] = true;
        placed.push({ td, row: r, col: c, rowSpan, colSpan });
        c += colSpan;
        columnCount = Math.max(columnCount, c);
      });
    });
    return { placed, columnCount };
  }

  async function addTableSheet(workbook, name, root, options) {
    const table = root.querySelector('table');
    const sheetOptions = {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: options.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: Object.assign({ left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, options.marginsInch || {}),
      },
    };
    const sheet = workbook.addWorksheet(sheetNameFrom(name, options.usedNames), sheetOptions);
    if (!table) {
      sheet.getColumn(1).width = 80;
      const cell = sheet.getCell(1, 1);
      cell.value = (root.textContent || '').trim().slice(0, MAX_CELL_CHARS);
      cell.font = fontOf({}); cell.alignment = { vertical: 'top', wrapText: true };
      return sheet;
    }
    const rows = Array.from(table.rows);
    const { placed, columnCount } = placeCells(rows);
    const widthsPx = columnWidthsPx(table, columnCount);
    widthsPx.forEach((px, i) => { sheet.getColumn(i + 1).width = columnWidthFromPx(px); });
    rows.forEach((tr, r) => { sheet.getRow(r + 1).height = rowHeightFromPx(tr.getBoundingClientRect().height); });

    // Les fusions d'abord : ExcelJS copie le style de la case maîtresse sur les autres au moment de fusionner, on style ensuite chaque case une à une.
    placed.forEach(p => { if (p.rowSpan > 1 || p.colSpan > 1) sheet.mergeCells(p.row + 1, p.col + 1, p.row + p.rowSpan, p.col + p.colSpan); });

    const pendingImages = [];
    for (const p of placed) {
      const { td } = p;
      const content = readCellContent(td);
      const typedInfo = typedValueOfCell(td);
      const master = sheet.getCell(p.row + 1, p.col + 1);
      let runs = flattenRuns(content.lines).filter(run => run.text !== '');
      if (runs.every(run => run.text.replace(/[\s\u00a0]+/g, '') === '')) runs = []; // une case d'espaces et de retours à la ligne est une case vide
      const text = runs.map(run => run.text).join('').slice(0, MAX_CELL_CHARS);
      const firstStyle = runs.length ? runs[0].style : {};
      let cellFill = cssColorArgb(td.style.backgroundColor); // le style en ligne seulement : le fond calculé suit le thème sombre

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
      // Un surlignage qui couvre toute la case devient son fond ; sur une partie du texte Excel ne sait pas le dessiner, il est laissé de côté.
      if (!cellFill && runs.length && runs.every(run => run.style.background && run.style.background === runs[0].style.background)) cellFill = runs[0].style.background;

      const vertical = td.getAttribute('data-valign') || td.style.verticalAlign;
      const alignment = { vertical: vertical === 'top' || vertical === 'bottom' ? vertical : 'middle', wrapText: true };
      if (content.horizontal) alignment.horizontal = content.horizontal;
      else if (typedInfo) alignment.horizontal = 'left'; // comme dans la grille et le PDF : un nombre s'y lit à gauche, comme tout le texte
      for (let rr = p.row; rr < p.row + p.rowSpan; rr++) {
        for (let cc = p.col; cc < p.col + p.colSpan; cc++) {
          const cell = sheet.getCell(rr + 1, cc + 1);
          cell.alignment = alignment;
          if (cellFill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cellFill } };
          cell.border = CELL_BORDER;
          if (cell !== master && !cell.font) cell.font = master.font;
        }
      }
      content.images.forEach(entry => pendingImages.push({ img: entry.img, row: p.row, col: p.col }));
    }

    for (const entry of pendingImages) {
      const data = await imageForWorkbook(entry.img);
      if (!data) continue;
      const size = imageSizePx(entry.img, data);
      const id = workbook.addImage({ base64: data.base64, extension: data.extension });
      sheet.addImage(id, { tl: { col: entry.col, row: entry.row }, ext: { width: Math.round(size.width), height: Math.round(size.height) }, editAs: 'oneCell' });
    }
    return sheet;
  }

  // Ajoute au classeur la feuille d'un enregistrement : `resolvedHtml` est le HTML du modèle dont les bulles ont déjà pris leur valeur (ReaderMode.preview avec
  // typedCellHook, qui laisse sur les cases à nombre ou date leurs marques data-xl-*). Le tableau est rendu hors écran le temps de la mesure (largeur des colonnes et
  // hauteur des lignes telles que l'éditeur les affiche).
  async function addRecordSheet(workbook, name, resolvedHtml, options) {
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
  // Les réglages de page d'un modèle (js/page-layout.js) pour la feuille : orientation et marges en pouces.
  function pageOptionsFromLayout() {
    const m = PageLayout.getMarginsMm();
    const inch = mm => Math.round(mm / 25.4 * 100) / 100;
    return { landscape: PageLayout.isLandscape(), marginsInch: { left: inch(m.left), right: inch(m.right), top: inch(m.top), bottom: inch(m.bottom) } };
  }

  // Le HTML d'un enregistrement dont les bulles ont pris leur valeur (typedCellHook marque les cases à nombre ou date) et le nom de son fichier.
  async function resolveRecord(htmlContent, tableId, record, filenameTemplate) {
    const resolvedHtml = await ReaderMode.preview(htmlContent, tableId, record, typedCellHook(tableId, record));
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    return { resolvedHtml, filename };
  }
  async function workbookToBlob(workbook) {
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: XLSX_MIME });
  }

  // Un classeur d'une feuille pour un enregistrement : un export seul, ou un fichier de l'archive ZIP d'un lot.
  async function getXlsxBlobForRecord(htmlContent, tableId, record, filenameTemplate, options) {
    // Une image d'un site externe est téléchargée à l'écriture du classeur : la fenêtre passe avant tout, comme pour le PDF et le Word (js/external-images.js).
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

  // Un classeur unique pour toute la table : une feuille par enregistrement, nommée comme le fichier qu'il aurait eu dans l'archive ZIP (31 caractères au plus, « nom (2) »
  // quand deux feuilles s'appelleraient pareil). Un enregistrement qui échoue ne laisse pas de feuille à moitié écrite : l'appelant le compte en échec et passe au suivant.
  async function createSingleWorkbook(options) {
    await ensureExcelLibLoaded();
    const workbook = newWorkbook();
    const usedNames = new Set();
    return {
      async appendRecord(htmlContent, tableId, record, filenameTemplate) {
        await ExternalImages.confirmExport(htmlContent, null);
        const { resolvedHtml, filename } = await resolveRecord(htmlContent, tableId, record, filenameTemplate);
        const before = workbook.worksheets.length;
        try {
          await addRecordSheet(workbook, filename, resolvedHtml, Object.assign(pageOptionsFromLayout(), options || {}, { usedNames }));
        } catch (e) {
          workbook.worksheets.slice(before).forEach(sheet => { usedNames.delete(sheet.name.toLowerCase()); workbook.removeWorksheet(sheet.id); });
          throw e;
        }
        return { filename };
      },
      toBlob: () => workbookToBlob(workbook),
    };
  }

  return { exportCurrentRecord, getXlsxBlobForRecord, createSingleWorkbook, ensureExcelLibLoaded, typedCellHook, addRecordSheet, newWorkbook, sheetNameFrom, XLSX_MIME };
})();
