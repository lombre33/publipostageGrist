// Export DOCX, volontairement plus modeste que l'export PDF vectoriel (js/pdf-export.js) : un .docx se reflow (police, zoom, imprimante du lecteur)
// et se continue d'éditer dans Word ou LibreOffice, la fidélité au pixel d'une page PDF figée n'y aurait pas de sens.
//
// Ce que l'export reprend du modèle : listes en numérotation Word native (numbering.xml : une <ul> ou <ol> se renumérote après l'ajout ou le retrait
// d'un item, ce que ne fait pas un marqueur texte), colonnes de tableau mesurées sur le rendu réel (comme le PDF), notes de bas de page, numéro de
// page et nombre de pages en vrais champs, titres en styles « Titre 1 » à « Titre 6 » (que reprend le volet de navigation de Word), images en calque
// (devant ou derrière le texte) et images habillées à gauche ou à droite en ancres flottantes natives, export en lot (un ZIP, une ligne = un .docx :
// js/main.js:onExportBatch).
//
// Ce qu'il ne fait pas, volontairement :
// - Case à cocher : le caractère ☑ ou ☐ tel quel, pas une case à cocher Word native (un contrôle de contenu `w:sdt`, bien plus lourd que la
//   numérotation des autres listes).
// - Sommaire : une liste statique (marqueur et texte), jamais un champ TOC de Word, qui demanderait « Mettre à jour les champs » à la personne.
// - Polices : jamais embarquées (le PDF les embarque) ; Word résout « Roboto », « Arial »... sur les polices installées chez le lecteur, avec un
//   repli silencieux si elles manquent, comme pour tout document éditable.
const DocxExport = (function () {
  // Chargement paresseux (comme ensurePdfLibsLoaded) : évite ~1,1 Mo au premier chargement du widget pour une fonctionnalité pas toujours utilisée.
  // `docx` n'est pas sur cdnjs ; jsDelivr sert le fichier tel que publié sur npm (dist/index.iife.js, pas ...iife.min.js, que jsDelivr reminifie à la
  // volée : incompatible avec un SRI stable). Recalculer l'integrity si la version change : `curl -s <url> | openssl dgst -sha384 -binary | openssl
  // base64 -A`.
  const DOCX_LIB = { src: 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', integrity: 'sha384-9OH56uLhIvkZkwF0jWNlfpcK3gPuSy5DfEMNqKe156wCpkND+MDdtaRyd05kwpG0' };
  let docxLibPromise = null;
  async function ensureDocxLibLoaded() {
    if (!docxLibPromise) docxLibPromise = ExportCommon.loadScriptOnce(DOCX_LIB).catch(e => { docxLibPromise = null; throw e; });
    return docxLibPromise;
  }

  // 1 twip = 1/20 pt = 1/1440 pouce.
  const TWIPS_PER_PT = 20;
  const PX_TO_TWIP = 15; // 1440 twips par pouce ÷ 96 px par pouce
  // La bande que le PDF réserve à un en-tête (sous la marge du haut) ou à un pied (au-dessus de la marge du bas) : PageLayout.HEADER_FOOTER_ZONE_PX
  // plus l'écart HEADER_FOOTER_GAP_PT, soit 55 pt quelle que soit la hauteur du texte. Word reçoit les mêmes marges : ce que l'éditeur, la Lecture et
  // le PDF dessinent à la marge + 55 pt du bord de la feuille, il le dessine aussi. L'en-tête est posé à la moitié de la marge du haut du bord de la
  // feuille (comme le PDF : marginTopPt * 0.5) ; le pied, que Word ancre par son bas, à la distance qui met son haut sous le texte, là où le PDF
  // l'ancre (buildDocxDocument).
  const HF_BAND_TWIP = PageLayout.HEADER_FOOTER_ZONE_PX * PX_TO_TWIP + PageLayout.HEADER_FOOTER_GAP_PT * TWIPS_PER_PT;
  // Marges de page (twip), variables de module réglées par setPageMarginsTwip() une fois par export à partir des marges du modèle courant
  // (js/page-layout.js) ; une marge absente prend le défaut de PageLayout (28 pt, 560 twip).
  const DEFAULT_MARGIN_TWIP = PageLayout.DEFAULT_MARGIN_PT * TWIPS_PER_PT;
  let marginTopTwip = DEFAULT_MARGIN_TWIP, marginRightTwip = DEFAULT_MARGIN_TWIP, marginBottomTwip = DEFAULT_MARGIN_TWIP, marginLeftTwip = DEFAULT_MARGIN_TWIP;
  // Bande réservée au-dessus du corps par un en-tête (0 sans en-tête), posée par buildDocxDocument avant de construire les blocs : l'ancrage d'une
  // image en calque la compte.
  let topBandTwip = 0;
  // Page courante : A4 portrait (11906 x 16838 twips) par défaut, sinon le format et le sens que PageLayout.getMarginsTwip() joint aux marges. Les
  // dimensions de PageLayout.pageSizeTwipFor sont toujours rendues dans le sens de la page (largeur 16838 en A4 paysage) : buildDocxDocument les
  // redonne à docx.js en portrait avec un drapeau d'orientation, car docx.js échange lui-même largeur et hauteur dès qu'il voit LANDSCAPE.
  let pageOrientation = 'portrait';
  let pageFormat = 'A4';
  let pageWidthTwip = 11906;
  let CONTENT_WIDTH_TWIP = pageWidthTwip - marginLeftTwip - marginRightTwip;
  // Filigrane du modèle (PageLayout.normalizeWatermark), absent = aucun : il voyage avec les marges comme le sens et le format, et buildDocxDocument
  // le pose dans l'en-tête.
  let pageWatermark = null;

  function setPageMarginsTwip(marginsTwip) {
    const m = marginsTwip || {};
    const marginOf = value => (Number.isFinite(value) ? value : DEFAULT_MARGIN_TWIP);
    marginTopTwip = marginOf(m.top);
    marginRightTwip = marginOf(m.right);
    marginBottomTwip = marginOf(m.bottom);
    marginLeftTwip = marginOf(m.left);
    pageOrientation = m.orientation === 'landscape' ? 'landscape' : 'portrait';
    pageFormat = PageLayout.normalizeFormat(m.format);
    pageWidthTwip = PageLayout.pageSizeTwipFor(pageOrientation, pageFormat).width;
    CONTENT_WIDTH_TWIP = pageWidthTwip - marginLeftTwip - marginRightTwip;
    pageWatermark = PageLayout.normalizeWatermark(m.watermark);
  }
  const STYLE = ExportCommon.EDITOR_STYLE;
  const { hexOf, cssColorHex } = ExportCommon;
  // Le Word compte les tailles en demi-points. `heading:` (style Word natif) fixe déjà une taille, mais on la resurcharge pour rester identique à
  // l'éditeur et au PDF plutôt que de dépendre du thème Word de la personne.
  const DEFAULT_HALF_PT = STYLE.bodyPt * 2;
  const HEADING_HALF_PT = Object.fromEntries(Object.entries(STYLE.headingPt).map(([tag, pt]) => [tag, pt * 2]));
  const HEADING_LEVEL = { H1: 'HEADING_1', H2: 'HEADING_2', H3: 'HEADING_3', H4: 'HEADING_4', H5: 'HEADING_5', H6: 'HEADING_6' };
  const INDENT_STEP_TWIP = 360; // ~0.25" par niveau de liste imbriquée, valeur par défaut standard Word.
  // vrais glyphes Unicode : contrairement à pdfmake (WinAnsi seul), les polices Word les rendent nativement.
  const BULLET_MARKERS = { disc: '• ', circle: '○ ', square: '▪ ' };
  const EMU_PER_PT = 12700; // 914400 EMU par pouce (unité des positions et tailles de dessin OOXML) / 72 pt
  // w:spacing/@line s'exprime en 240èmes de ligne quand lineRule="auto" (240 = interligne simple) : posé sur chaque paragraphe généré pour que les
  // sauts de ligne à l'intérieur d'un paragraphe qui revient à la ligne correspondent à l'éditeur, au lieu de l'interligne du style Word « Normal ».
  const LINE_SPACING_240THS = Math.round(240 * STYLE.lineHeight);
  const LINK_COLOR_HEX = hexOf(STYLE.linkColor);
  // Bloc de code : Courier New, que Word trouve partout (Cousine, de même métrique, dans le PDF). Word multiplie la hauteur propre de la police et
  // non la taille du corps : l'interligne est rapporté au rapport naturel de la police.
  const CODE_FONT = 'Courier New';
  const CODE_HALF_PT = STYLE.codePt * 2;
  const CODE_TEXT_HEX = hexOf(STYLE.codeTextColor);
  const CODE_FILL_HEX = hexOf(STYLE.codeFillColor);
  const CODE_BOX_HEX = hexOf(STYLE.codeBoxColor);
  const CODE_LINE_240THS = Math.round(240 * STYLE.lineHeight / STYLE.codeFontRatio);

  function cssHalfPt(value, fallback) {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    const pt = value && String(value).endsWith('px') ? n * 72 / 96 : n;
    return Math.round(Math.max(6, Math.min(72, pt)) * 2);
  }

  // Le style des balises qui en posent un : titre, gras, italique, soulignement, lien, code, légende, barré, exposant et indice.
  function applyTagRunStyle(out, node, tag) {
    // 'auto' (pas de couleur explicite dans le HTML) plutôt que de laisser le style Word « Titre N » imposer sa couleur par défaut (accent du thème,
    // souvent bleu) : un titre de l'éditeur n'a pas de couleur particulière, il hérite du noir du corps du texte (`.tiptap { color }`).
    // La couleur d'un <span> posé dedans (applyInlineRunStyle) garde la priorité si la personne a choisi une couleur.
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.size = HEADING_HALF_PT[tag]; out.color = 'auto'; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') out.underline = { type: 'single' };
    // Lien : couleur et soulignement de lien ; la couleur d'un <span> posé dedans l'emporte, comme `.tiptap a` face à un texte coloré.
    if (tag === 'A' && HtmlSanitize.safeLinkHref(node.getAttribute('href'))) { out.color = LINK_COLOR_HEX; out.underline = { type: 'single' }; }
    if (tag === 'PRE') { out.font = CODE_FONT; out.size = CODE_HALF_PT; out.color = CODE_TEXT_HEX; }
    // Légende (js/caption.js) : un paragraphe `data-caption` est en petit, italique, gris, la base de ses runs ; la taille ou la couleur d'un <span>
    // posé dedans l'emportent ensuite, comme dans l'éditeur.
    if (tag === 'P' && node.hasAttribute('data-caption')) { out.italics = true; out.size = Math.round(Caption.SIZE_PT * 2); out.color = Caption.COLOR.replace('#', '').toUpperCase(); }
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out.strike = true;
    // Exposant et indice (js/script-marks.js) : le vrai exposant ou indice de Word (`w:vertAlign`), dont Word règle lui-même la taille et le décalage ;
    // la personne qui ouvre le fichier le retrouve comme mise en forme du texte, qu'elle peut retirer.
    const script = ScriptMarks.kindOf(node);
    if (script) { out.superScript = script === ScriptMarks.SUPERSCRIPT; out.subScript = script === ScriptMarks.SUBSCRIPT; }
  }

  // Le style en ligne (`style="…"`), lu par `css(nom)` : gras, italique, soulignement, barré, taille, police, couleur et fond.
  function applyInlineRunStyle(out, css) {
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italics = true;
    if (css('text-decoration')) {
      if (/underline/i.test(css('text-decoration'))) out.underline = { type: 'single' };
      if (/line-through/i.test(css('text-decoration'))) out.strike = true;
    }
    if (css('font-size')) out.size = cssHalfPt(css('font-size'), DEFAULT_HALF_PT);
    if (css('font-family')) out.font = css('font-family').split(',')[0].trim().replace(/^["']|["']$/g, '');
    // Une valeur qui n'est pas une couleur (ou transparente) laisse la couleur héritée telle quelle.
    const color = css('color') && cssColorHex(css('color'));
    if (color) out.color = color;
    const fill = css('background-color') && cssColorHex(css('background-color'));
    if (fill) out.shading = { fill, type: docx.ShadingType.CLEAR };
  }

  // Même point de passage que inheritedStyle (js/pdf-export.js), adapté à la forme attendue par docx.TextRun. Le sous-ensemble de formats reconnus
  // est volontairement identique (l'exposant et l'indice du texte sont la marque de js/script-marks.js ; la note de bas de page, gérée à part, ne l'est
  // pas).
  function inheritedRunStyle(node, parent) {
    const isElement = node.nodeType === 1;
    const style = isElement ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const out = Object.assign({}, parent);
    applyTagRunStyle(out, node, isElement ? node.tagName : '');
    applyInlineRunStyle(out, css);
    return out;
  }
  function runOpts(style) {
    const opts = { size: style.size || DEFAULT_HALF_PT };
    if (style.bold) opts.bold = true;
    if (style.italics) opts.italics = true;
    if (style.underline) opts.underline = style.underline;
    if (style.strike) opts.strike = true;
    if (style.superScript) opts.superScript = true;
    if (style.subScript) opts.subScript = true;
    if (style.font) opts.font = style.font;
    if (style.color) opts.color = style.color;
    if (style.shading) opts.shading = style.shading;
    return opts;
  }
  function paragraphAlignment(node) {
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const m = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    if (!m) return undefined;
    const map = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' };
    return docx.AlignmentType[map[m[1].toLowerCase()]];
  }

  // pdfmake (js/pdf-export.js:inlineEditorImagesAsDataUri) doit rastériser en PNG car il n'accepte que PNG et JPEG ; docx.ImageRun accepte aussi GIF
  // et BMP mais ni WEBP ni SVG : même filet ici, l'image est décodée dans un <canvas> puis réencodée en PNG quand son type n'est pas pris en charge.
  const DOCX_IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
  const DEFAULT_IMAGE_RATIO = 0.75;
  const ratioOf = image => (image.naturalWidth && image.naturalHeight ? image.naturalHeight / image.naturalWidth : DEFAULT_IMAGE_RATIO);
  async function docxImageDataFrom(img) {
    const src = img.getAttribute('src') || '';
    if (!src) { ExportCommon.noteImageWithoutSource(img); return null; }
    let blob;
    try { blob = await ImageIo.fetchBlob(src); }
    catch (e) { console.warn('[DocxExport] image ignorée (téléchargement impossible) :', src, e); ExportCommon.noteUnreadImage(img); return null; }
    // Hauteur déduite du ratio intrinsèque : docx exige les deux dimensions, pdfmake sait déduire l'une de l'autre.
    let type = DOCX_IMAGE_TYPES[blob.type];
    let ratio;
    if (type) {
      ratio = await ImageIo.load(blob).then(ratioOf, () => DEFAULT_IMAGE_RATIO);
    } else {
      try {
        const canvas = await ImageIo.draw(blob);
        blob = await ImageIo.pngBlob(canvas);
        type = 'png';
        ratio = canvas.height / canvas.width;
      } catch (e) { console.warn('[DocxExport] image ignorée (rastérisation impossible) :', src, e); ExportCommon.noteUnreadImage(img); return null; }
    }
    const data = await blob.arrayBuffer();
    // Largeur déjà posée par l'éditeur (même convention que pdfImageFromNode, js/pdf-export.js). Une image dans le texte est ramenée à la largeur
    // de ce qui la contient, comme dans l'éditeur (ExportCommon.shownImageWidthPx) ; une image en calque garde sa taille réglée.
    const styleWidthPx = parseFloat(img.style.width) || 320;
    const layer = img.getAttribute('data-layer');
    const widthPx = (layer === 'front' || layer === 'behind') ? styleWidthPx : ExportCommon.shownImageWidthPx(img, styleWidthPx);
    return { data, type, width: Math.round(widthPx), height: Math.max(1, Math.round(widthPx * ratio)) };
  }

  // Marges d'habillage de l'éditeur (`float` : 12 px côté texte, 8 px dessous, css/editor-v2.css), soit 9 pt et 6 pt : docx.js les écrit sur le
  // <wp:anchor> et le <wp:wrapSquare> (en EMU). Sans elles, le texte touchait l'image, 9 pt plus près que dans l'éditeur.
  const WRAP_TEXT_SIDE_EMU = 9 * EMU_PER_PT;
  const WRAP_BELOW_EMU = 6 * EMU_PER_PT;

  // Image alignée à gauche ou à droite (data-align, css/editor-v2.css `.tiptap img.editor-image[data-align="left|right"] { float }`) : un vrai
  // habillage, le texte d'un même paragraphe contourne l'image sur le côté qu'elle laisse libre, ce que ne fait jamais une image en calque. Le
  // centrage n'en a pas besoin : l'image est un bloc centré (splitRunsAtFloatedImages). Aucune position à relever : le jeton `align` suffit à Word
  // pour refaire le même flottement, il reste à dire de quel côté le texte continue (wrap.side, opposé au bord d'alignement).
  //
  // Ancrée à la marge de la page, pas à une colonne : exact pour un paragraphe du corps (le seul cas rencontré) ; dans une zone à deux colonnes ou
  // une cellule, l'image s'ancrerait quand même à la marge de la page entière, limite connue (Word n'ancre pas un flottant sur une cellule de
  // tableau).
  //
  // verticalPosition relative au paragraphe, pas à la ligne : relativeFrom="line" n'est pas respecté par Google Docs (l'image restait plaquée en haut
  // du paragraphe entier), « paragraph » l'est partout. Pour qu'elle tombe à la bonne hauteur quand elle suit plusieurs lignes de texte,
  // paragraphBlockFrom coupe le paragraphe HTML en plusieurs paragraphes Word à l'endroit de l'image (splitRunsAtFloatedImages, __docxSplitBefore) :
  // « haut du paragraphe » tombe là où l'image paraît dans le texte, sans dépendre du support de « line » par le lecteur.
  function docxAlignFloatingOptionsFrom(imgNode, uniqueId) {
    const align = imgNode.getAttribute('data-align');
    if (align !== 'left' && align !== 'right') return null;
    return {
      zIndex: 1000 + uniqueId,
      __isAlignFloat: true,
      margins: { top: 0, bottom: WRAP_BELOW_EMU, left: align === 'right' ? WRAP_TEXT_SIDE_EMU : 0, right: align === 'left' ? WRAP_TEXT_SIDE_EMU : 0 },
      wrap: { type: docx.TextWrappingType.SQUARE, side: align === 'right' ? docx.TextWrappingSide.LEFT : docx.TextWrappingSide.RIGHT },
      horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.MARGIN, align: align === 'right' ? docx.HorizontalPositionAlign.RIGHT : docx.HorizontalPositionAlign.LEFT },
      verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PARAGRAPH, align: docx.VerticalPositionAlign.TOP },
    };
  }

  // Ancrage flottant natif (wp:anchor) d'une image en calque (devant ou derrière le texte, js/editor-nodes.js), positionné par rapport à la page.
  // Deux sources de position, par ordre de préférence :
  //  1. La position « grille de page » relevée par l'éditeur (Aperçu A4), la même donnée que js/pdf-export.js:_pageGrid, lue sur les attributs DOM :
  //     connue, rien à mesurer.
  //  2. À défaut (image jamais positionnée par l'Aperçu A4 : `left` et `top` posés à la main dans un ancien document), le rendu réel : `imgNode` est
  //     encore attaché à l'hôte de mesure (attachMeasureHost, buildDocxDocument), getBoundingClientRect() donne donc sa position par rapport au coin
  //     du contenu, même dans une colonne ou une cellule. Elle passe par `ctx.measureRoot` (posé une fois par buildDocxDocument), car
  //     `imgNode.style.left|top` n'est juste que pour une image enfant directe de la racine.
  //
  // Limite assumée du second cas : l'image est supposée près du haut de la 1re page (logo, tampon d'en-tête), aucune pagination n'ayant lieu ici ;
  // plus bas, l'ancrage ne suit pas un texte qui reflowe. Jamais pire que le repli en image en ligne, qui perdait la position.
  //
  // La position est relative au contenu (marges et bande d'en-tête comprises), pas au bord de la page : marge + bande + décalage, la formule de
  // p.image.absolutePosition (js/pdf-export.js), avant la conversion en EMU. Rend null si l'image n'est pas en calque ou si aucune des deux sources
  // n'existe (image détachée du DOM) : l'appelant retombe sur l'image en ligne.
  function docxFloatingOptionsFrom(imgNode, uniqueId, ctx) {
    const layer = imgNode.getAttribute('data-layer');
    if (layer !== 'front' && layer !== 'behind') return docxAlignFloatingOptionsFrom(imgNode, uniqueId);
    const pageIndex = imgNode.hasAttribute('data-page-index') ? parseInt(imgNode.getAttribute('data-page-index'), 10) : null;
    const pageLeftPt = imgNode.hasAttribute('data-page-left-pt') ? parseFloat(imgNode.getAttribute('data-page-left-pt')) : null;
    const pageTopPt = imgNode.hasAttribute('data-page-top-pt') ? parseFloat(imgNode.getAttribute('data-page-top-pt')) : null;
    let leftPt, topPt;
    if (Number.isFinite(pageIndex) && Number.isFinite(pageLeftPt) && Number.isFinite(pageTopPt)) {
      leftPt = pageLeftPt;
      topPt = pageTopPt;
    } else if (ctx.measureRoot && imgNode.isConnected) {
      const rootRect = ctx.measureRoot.getBoundingClientRect();
      const imgRect = imgNode.getBoundingClientRect();
      const pxToPt = PX_TO_TWIP / TWIPS_PER_PT;
      leftPt = (imgRect.left - rootRect.left) * pxToPt;
      topPt = (imgRect.top - rootRect.top) * pxToPt;
    } else {
      return null;
    }
    const xEmu = Math.round((marginLeftTwip / TWIPS_PER_PT + leftPt) * EMU_PER_PT);
    const yEmu = Math.round(((marginTopTwip + topBandTwip) / TWIPS_PER_PT + topPt) * EMU_PER_PT);
    return {
      behindDocument: layer === 'behind',
      zIndex: 1000 + uniqueId,  // unique par image, comme altText.id : sans lui docx.js prend la hauteur de l'image
      horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.PAGE, offset: xEmu },
      verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PAGE, offset: yEmu },
    };
  }

  const textRun = (text, style) => new docx.TextRun(Object.assign({ text }, runOpts(style)));

  // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : le caractère ☑ ou ☐ en « Segoe UI Symbol » (Word, Google Docs et
  // LibreOffice en prennent une autre si elle manque), dans la couleur de la case (style en ligne, déjà lu par inheritedRunStyle) et jamais barré :
  // le barré d'une case d'accent cochée vise le texte qui la suit.
  function checkboxRuns(node, style) {
    return [textRun(node.textContent, Object.assign({}, style, { strike: false, font: 'Segoe UI Symbol' }))];
  }

  // .var-badge et .smart-chip ne devraient jamais arriver ici (ReaderMode.preview les résout déjà en <span class="resolved-var"> ou en texte simple) :
  // gardés par robustesse, comme dans js/pdf-export.js.
  function valueRuns(node, style) {
    return node.textContent ? [textRun(node.textContent, style)] : [];
  }

  function pageNumberRuns(node, style) {
    const format = node.getAttribute('data-format') || 'n';
    const opts = runOpts(style);
    const current = new docx.TextRun(Object.assign({ children: [docx.PageNumber.CURRENT] }, opts));
    if (format === 'page-n') return [new docx.TextRun(Object.assign({ text: 'Page ' }, opts)), current];
    if (format === 'n-slash-total') return [current, new docx.TextRun(Object.assign({ text: '/' }, opts)), new docx.TextRun(Object.assign({ children: [docx.PageNumber.TOTAL_PAGES] }, opts))];
    return [current];
  }

  function footnoteRuns(node, style, ctx) {
    ctx.footnoteCounter += 1;
    const id = ctx.footnoteCounter;
    ctx.footnotes[String(id)] = { children: [new docx.Paragraph({ children: [new docx.TextRun(node.getAttribute('data-note-text') || '')] })] };
    return [new docx.FootnoteReferenceRun(id)];
  }

  // Bloc de code au milieu d'un autre bloc (dans une citation, un item de liste) : ses lignes se suivent par des sauts de ligne ; le cadre gris
  // n'existe que pour un bloc de code posé directement dans le document, une cellule, une colonne ou un en-tête (codeBlockFrom).
  function codeRuns(node, style) {
    return ExportCommon.codeLinesOf(node).map((line, i) => new docx.TextRun(Object.assign({ text: line }, runOpts(style), i ? { break: 1 } : {})));
  }

  async function imageRunsFrom(node, style, ctx) {
    if (node.hasAttribute('data-pdf-skip')) return [];
    // « Sur toutes les pages » (js/page-layer.js) : ancrée dans l'en-tête de chaque page (buildDocxDocument), pas dans le paragraphe qui la porte.
    if (PageLayer.isRepeatedEl(node)) return [];
    const imgData = await docxImageDataFrom(node);
    if (!imgData) return [];
    // docx.js régénère un compteur wp:docPr/id frais (à partir de 1) à chaque ImageRun au lieu d'en partager un pour tout le document (défaut de la
    // bibliothèque) : sans id explicite, deux images prennent id="1", ce que Word refuse d'ouvrir sans signaler un contenu illisible. altText.id
    // donne un id unique par image du document.
    ctx.imageIdCounter += 1;
    const runOptions = { type: imgData.type, data: imgData.data, transformation: { width: imgData.width, height: imgData.height }, altText: { id: ctx.imageIdCounter, name: '', description: '', title: '' } };
    const floatingOptions = docxFloatingOptionsFrom(node, ctx.imageIdCounter, ctx);
    if (floatingOptions) runOptions.floating = floatingOptions;
    const imgRun = new docx.ImageRun(runOptions);
    markImageRun(imgRun, node, floatingOptions);
    return [imgRun];
  }

  // Ce que paragraphBlockFrom (splitRunsAtFloatedImages ci-dessous) lit sur le run d'une image pour la ranger dans son propre paragraphe Word.
  function markImageRun(imgRun, node, floatingOptions) {
    // Google Docs ne respecte pas relativeFrom="line", d'où le découpage en paragraphes Word plutôt qu'un ancrage à la ligne.
    if (floatingOptions && floatingOptions.__isAlignFloat) imgRun.__docxSplitBefore = true;
    // data-align="center" : pas un flottant (le texte ne contourne rien), mais l'image doit rester centrée : `.editor-image[data-align="center"]`
    // vaut `display:block; margin:auto` dans l'éditeur et la Lecture (css/style.css), et le PDF pose `alignment:'center'` sur le bloc image
    // (js/pdf-export.js:pdfImageFromNode). L'alignement est une propriété de paragraphe en OOXML (w:jc), pas de run : l'image occupe donc son propre
    // <w:p> centré, ce que splitRunsAtFloatedImages fait ci-dessous.
    if (!floatingOptions && node.getAttribute('data-align') === 'center') imgRun.__docxCenterBlock = true;
    // « Bloc » sans alignement (barre de l'image, « Basculer en ligne / bloc ») : seule sur sa ligne, à gauche :
    // `.editor-image-view[data-wrap="block"] { display: block; width: fit-content }` dans l'éditeur, le texte d'avant finit sa ligne et celui d'après
    // repart dessous. Même raison que le centre : l'alignement est une propriété de paragraphe, l'image prend donc son propre <w:p>, aligné à gauche
    // (un paragraphe centré ou justifié ne la déplace pas : un bloc ne suit pas le text-align de son parent).
    if (!floatingOptions && !node.getAttribute('data-align') && node.getAttribute('data-wrap') === 'block') imgRun.__docxBlock = true;
  }

  // Les runs des nœuds sans enfants à parcourir, par classe ou par balise : [test, runs(node, style, ctx)], le premier qui convient ; un nœud qui n'en
  // a aucun descend dans ses enfants (inlineChildrenFrom). Un sommaire, un saut de page et la numérotation des titres n'écrivent rien ici ; une valeur
  // qui porte une case (« ☑, ☐ » d'une liste de valeurs) passe par ses enfants, case par case.
  const LEAF_RUNS = [
    [node => node.classList.contains('page-break-marker') || node.classList.contains('heading-numbering-config') || node.classList.contains('toc-marker'), () => []],
    [node => node.classList.contains('resolved-checkbox'), checkboxRuns],
    [node => node.classList.contains('var-badge') || (node.classList.contains('resolved-var') && !node.querySelector('.resolved-checkbox')) || node.classList.contains('smart-chip'), valueRuns],
    [node => node.classList.contains('page-number-badge'), pageNumberRuns],
    [node => node.classList.contains('footnote-ref-marker'), footnoteRuns],
    [node => node.tagName === 'IMG', imageRunsFrom],
    [node => node.tagName === 'BR', () => [new docx.TextRun({ break: 1 })]],
    [node => node.tagName === 'PRE', codeRuns],
  ];

  // Équivalent de inlineRuns (js/pdf-export.js), en composants docx (TextRun, ImageRun, FootnoteReferenceRun) au lieu de « runs » pdfmake. Asynchrone
  // (une image se télécharge) : le parcours est séquentiel, largement suffisant pour le nombre d'images d'un courrier.
  async function inlineNodesFrom(node, parentStyle, ctx) {
    const style = inheritedRunStyle(node, parentStyle);
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [textRun(node.nodeValue, style)] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const leaf = LEAF_RUNS.find(([matches]) => matches(node));
    return leaf ? leaf[1](node, style, ctx) : inlineChildrenFrom(node, style, ctx);
  }

  async function inlineChildrenFrom(node, style, ctx) {
    const out = [];
    let sawLineBlock = false;
    for (const child of Array.from(node.childNodes)) {
      // Comme inlineRuns (js/pdf-export.js) : un paragraphe, un titre ou un bloc de code qui en suit un autre dans le même bloc (citation de deux
      // paragraphes, item de liste suivi d'un bloc de code) commence sa propre ligne.
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) out.push(new docx.TextRun({ break: 1 }));
      if (isLineBlock) sawLineBlock = true;
      for (const run of await inlineNodesFrom(child, style, ctx)) out.push(run);
    }
    const linkHref = node.tagName === 'A' ? HtmlSanitize.safeLinkHref(node.getAttribute('href')) : null;
    return linkHref ? hyperlinkRuns(out, linkHref) : out;
  }
  // Un lien Word (w:hyperlink) n'enveloppe que du texte : un autre run dans le lien (image, note de bas de page) reste à côté, hors du lien.
  function hyperlinkRuns(runs, href) {
    const out = [];
    let textRuns = [];
    const flush = () => { if (textRuns.length) out.push(new docx.ExternalHyperlink({ children: textRuns, link: href })); textRuns = []; };
    runs.forEach(run => { if (run instanceof docx.TextRun) textRuns.push(run); else { flush(); out.push(run); } });
    flush();
    return out;
  }
  // Comme inlineNodesFrom, mais sans les <ul> ni <ol> directs : une sous-liste produit ses propres paragraphes (listBlocksFrom) au lieu d'être
  // aplatie dans le texte de son <li> parent. Même rôle que inlineRunsExcludingNestedLists, js/pdf-export.js.
  async function inlineNodesExcludingNestedLists(node, parentStyle, ctx) {
    const style = inheritedRunStyle(node, parentStyle);
    const out = [];
    let sawLineBlock = false;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) continue;
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) out.push(new docx.TextRun({ break: 1 }));
      if (isLineBlock) sawLineBlock = true;
      for (const run of await inlineNodesFrom(child, style, ctx)) out.push(run);
    }
    return out;
  }

  // Numérotation Word native (numbering.xml) : chaque <ul> ou <ol> du document reçoit sa propre référence (jamais partagée, même entre deux listes du
  // même style), un seul niveau (0) suffit alors, l'indentation des niveaux imbriqués étant posée par `depth` (une sous-liste = une autre référence).
  // Cela évite le redémarrage de compteur par « instance » de numbering.xml : chaque référence démarre à 1 (ou à `start`) puisqu'elle n'est jamais
  // réutilisée.
  function orderedLevelFormat(numberStyle) {
    if (numberStyle === 'alpha') return docx.LevelFormat.LOWER_LETTER;
    if (numberStyle === 'roman') return docx.LevelFormat.LOWER_ROMAN;
    return docx.LevelFormat.DECIMAL;
  }
  function registerListNumbering(listEl, depth, ctx) {
    ctx.numberingCounter += 1;
    const reference = 'list-' + ctx.numberingCounter;
    const indentLeft = INDENT_STEP_TWIP * (depth + 1);
    const paragraphStyle = { paragraph: { indent: { left: indentLeft, hanging: 260 } } };
    const level = listEl.tagName === 'OL'
      ? { level: 0, format: orderedLevelFormat(listEl.getAttribute('data-number-style')), text: '%1.', start: parseInt(listEl.getAttribute('start') || '1', 10) || 1, style: paragraphStyle }
      : { level: 0, format: docx.LevelFormat.BULLET, text: (BULLET_MARKERS[listEl.getAttribute('data-bullet-style')] || BULLET_MARKERS.disc).trim(), style: paragraphStyle };
    ctx.numberingConfigs.push({ reference, levels: [level] });
    return reference;
  }
  function taskMarkerText(li) { return li.getAttribute('data-checked') === 'true' ? '☑ ' : '☐ '; }
  // Comme taskListRuns, js/pdf-export.js : un item coché barre son texte (en gris), sauf pour les styles 'classic' et 'accentPlain' (case cochée,
  // texte normal).
  function taskItemBaseStyle(li) {
    const checked = li.getAttribute('data-checked') === 'true';
    const style = (li.parentElement && li.parentElement.getAttribute('data-tasklist-style')) || 'accentStrike';
    if (!checked || style === 'classic' || style === 'accentPlain') return { size: DEFAULT_HALF_PT };
    return { size: DEFAULT_HALF_PT, strike: true, color: '667085' };  // le gris de la Lecture (--paper-text-faint, 4,97:1 sur blanc)
  }

  // Une <li> donne un Paragraph (marqueur natif de Word `numbering:` ou, pour une case à cocher, un marqueur littéral suivi de son contenu en ligne,
  // sans les sous-listes) ; une sous-liste directe donne ses propres paragraphes juste après, indentés d'un cran de plus. Aplati dans l'ordre de
  // l'affichage (comme collectCellLines, js/pdf-export.js), sans vraie imbrication Word, inutile ici (voir la numérotation ci-dessus).
  async function listBlocksFrom(listEl, depth, ctx, pageBreakBefore) {
    const items = Array.from(listEl.children).filter(c => c.tagName === 'LI');
    const isTask = listEl.getAttribute('data-type') === 'taskList';
    const numberingRef = isTask ? null : registerListNumbering(listEl, depth, ctx);
    const blocks = [];
    for (const [i, li] of items.entries()) {
      const baseStyle = isTask ? taskItemBaseStyle(li) : { size: DEFAULT_HALF_PT };
      const runs = await inlineNodesExcludingNestedLists(li, baseStyle, ctx);
      const align = paragraphAlignment(li);
      const opts = {
        alignment: align,
        // after:0 : `.tiptap li` n'a aucune marge propre (seuls ul et ol sont remis à 0, css/editor-v2.css ; li hérite de ce 0). line et lineRule :
        // même interligne que l'éditeur dans un item qui revient à la ligne (LINE_SPACING_240THS).
        spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' },
        pageBreakBefore: !!(pageBreakBefore && depth === 0 && i === 0),
      };
      if (isTask) {
        opts.children = [new docx.TextRun({ text: taskMarkerText(li) })].concat(runs.length ? runs : [new docx.TextRun('')]);
        opts.indent = { left: INDENT_STEP_TWIP * (depth + 1) };
      } else {
        opts.children = runs.length ? runs : [new docx.TextRun('')];
        opts.numbering = { reference: numberingRef, level: 0 };
      }
      blocks.push(new docx.Paragraph(opts));
      const nested = Array.from(li.children).filter(c => /^(UL|OL)$/.test(c.tagName));
      for (const sub of nested) for (const block of await listBlocksFrom(sub, depth + 1, ctx)) blocks.push(block);
    }
    return blocks;
  }

  // Plancher de chaque colonne d'une zone à deux colonnes : 10 mm, comme la saisie en mm de js/editor-nodes.js (commitMm) et le plancher CSS de
  // css/editor-v2.css.
  const MIN_ZONE_COLUMN_TWIP = Math.round(10 * PageLayout.MM_TO_TWIP);
  // Largeurs à parts égales, le repli quand rien ne se mesure.
  function equalColumnWidthsTwip(columnCount) { return new Array(columnCount).fill(Math.floor(CONTENT_WIDTH_TWIP / columnCount)); }
  // Table réelle du document (pas l'émulation à deux colonnes, twoColumnsBlockFrom). Largeurs mesurées sur le rendu réel (comme le PDF), plus la
  // marge de cellule par défaut de Word (2 × 108 twips, jamais comprise dans une mesure de contenu) pour que la largeur totale demandée à Word colle
  // à la mesure.
  const WORD_DEFAULT_CELL_MARGIN_TWIP = 216;
  // Fond d'une cellule : celui de son style en ligne, comme le PDF (le fond calculé suivrait le thème sombre de l'éditeur). Pas de fond, ou
  // transparent : pas de <w:shd>.
  function cellShadingFrom(cell) {
    const fill = cell.style.backgroundColor && cssColorHex(cell.style.backgroundColor);
    return fill ? { type: docx.ShadingType.CLEAR, fill, color: 'auto' } : undefined;
  }
  // `keepWithCaption` : une légende suit le tableau (js/caption.js, « Rester ensemble » : jamais seule en haut de la page suivante). Word garde une
  // ligne avec le paragraphe qui la suit quand les paragraphes de ses cases portent « Conserver avec le suivant » : les lignes du dernier groupe d'un
  // tableau qui se coupe entre deux lignes (js/table-page-cut.js), toutes les lignes sinon, comme l'éditeur et le PDF qui passent alors le tableau
  // entier. Word laisse tomber le lien quand la suite dépasse une page.
  //
  // Les lignes qu'une case fusionnée sur plusieurs lignes lie (TablePageCut.unitsOf) ne se séparent pas non plus : toutes sauf la dernière de chaque
  // groupe gardent leurs paragraphes avec le suivant, y compris la case de continuation que docx.js écrit dans les lignes recouvertes. Word laisse
  // tomber le lien d'un groupe plus haut que la page.
  async function tableBlockFrom(tableEl, ctx, keepWithCaption) {
    const rows = ExportCommon.tableRows(tableEl);
    if (!rows.length) return null;
    const { keptRows, joinedRows } = rowsKeptWithNext(tableEl, rows, keepWithCaption);
    const columnCount = ExportCommon.cellsOf(rows[0]).reduce((sum, c) => sum + ExportCommon.spanOf(c, 'colspan'), 0) || 1;
    const colWidthsTwip = tableColumnWidthsTwip(tableEl, columnCount);
    // Les lignes de titres (cases <th> en tête) : Word les reprend en haut de chaque page où le tableau se poursuit (`tblHeader`), comme le PDF.
    const headerRowCount = ExportCommon.headerRowCount(rows);
    // Où chaque case commence dans la grille du tableau : une case fusionnée sur plusieurs lignes tient sa place dans les lignes d'après, dont les
    // cases se décalent d'autant (Word n'écrit que les cases de continuation). Sans cela, la case suivante prenait la largeur d'une autre colonne.
    const placement = new Map(ExportCommon.placeCells(rows).placed.map(placed => [placed.el, placed]));
    // Les bords réglés avec la barre de la case (js/table-borders.js) et le quadrillage masqué : null pour un tableau que personne n'a réglé, qui garde
    // les traits de départ de Word.
    const borderSides = ExportCommon.cellBorderSides(tableEl);
    const tableRows = [];
    for (const tr of rows) {
      const keepNext = keptRows.has(tr) || joinedRows.has(tr);
      tableRows.push(await wordRowFrom(tr, { ctx, placement, colWidthsTwip, columnCount, keepNext, borderSides, isHeader: tableRows.length < headerRowCount }));
    }
    // columnWidths pilote le <w:tblGrid>, la déclaration des colonnes : sans lui docx.js retombe sur son défaut (100 twips par colonne), incohérent
    // avec les largeurs posées sur chaque TableCell.width. Un <w:tblGrid> qui ne correspond pas aux tcW est un tableau non conforme, que Word peut
    // signaler comme contenu à réparer. Avec des bords réglés, chaque case porte ses quatre traits : ceux du tableau, en dessous, sont coupés pour
    // qu'aucun trait de départ ne reste là où la personne n'en veut pas.
    const wordTable = new docx.Table(Object.assign(
      { rows: tableRows, width: { size: tableWidthTwip(colWidthsTwip), type: docx.WidthType.DXA }, columnWidths: colWidthsTwip },
      borderSides ? { borders: NO_BORDERS } : {},
    ));
    keepContinuationCellsWithNext(tableRows, rows, joinedRows, keptRows);
    return wordTable;
  }

  // Les lignes gardées avec la suivante : `keptRows` (la dernière ligne ou le dernier groupe de lignes quand une légende suit le tableau),
  // `joinedRows` (toutes sauf la dernière de chaque groupe de lignes qu'une case fusionnée lie).
  function rowsKeptWithNext(tableEl, rows, keepWithCaption) {
    const cutRows = TablePageCut.rowsOf(tableEl);
    const units = cutRows && cutRows.length === rows.length ? TablePageCut.unitsOf(cutRows) : null;
    const keptRows = new Set(keepWithCaption ? (units ? rows.slice(units[units.length - 1].from) : rows) : []);
    const joinedRows = new Set();
    (units || []).forEach((unit) => { for (let r = unit.from; r < unit.to - 1; r += 1) joinedRows.add(rows[r]); });
    return { keptRows, joinedRows };
  }

  // Largeurs à parts égales quand le tableau n'est pas attaché au document (zone d'en-tête ou de pied, hors du périmètre de la mesure :
  // buildDocxDocument) : aucun rendu à mesurer.
  function tableColumnWidthsTwip(tableEl, columnCount) {
    const measuredPx = tableEl.isConnected ? ExportCommon.measuredColumnWidthsPx(tableEl, columnCount) : null;
    return (measuredPx && measuredPx.every(w => w > 0))
      ? measuredPx.map(px => Math.max(200, Math.round(px * PX_TO_TWIP) + WORD_DEFAULT_CELL_MARGIN_TWIP))
      : equalColumnWidthsTwip(columnCount);
  }

  // Un tableau plus étroit que la page (colonnes réglées en les tirant) garde sa largeur : Word étire sinon les colonnes jusqu'à la largeur demandée
  // au tableau, alors que l'éditeur, la Lecture et le PDF le gardent étroit. En dessous de 2 % d'écart, la page entière : la mesure des colonnes n'est
  // pas exacte à ce point près, et un tableau de la largeur du texte doit rester celui de la page.
  const NARROW_TABLE_RATIO = 0.98;
  function tableWidthTwip(colWidthsTwip) {
    const columnsTwip = colWidthsTwip.reduce((sum, w) => sum + w, 0);
    return columnsTwip < CONTENT_WIDTH_TWIP * NARROW_TABLE_RATIO ? columnsTwip : CONTENT_WIDTH_TWIP;
  }

  async function wordRowFrom(tr, t) {
    const cells = [];
    for (const cell of ExportCommon.cellsOf(tr)) cells.push(await wordCellFrom(cell, t));
    // cantSplit : une ligne ne se coupe pas entre deux pages, elle passe en entier à la suivante (comme dans l'éditeur, la Lecture et le PDF :
    // js/table-page-cut.js). Word la coupe quand même si elle est plus haute que la page.
    // Hauteur réglée (`data-row-height`, en px) : un minimum (`atLeast`), comme l'éditeur et le PDF, où une ligne que son texte agrandit grandit.
    const heightPx = ExportCommon.rowHeightPx(tr);
    return new docx.TableRow(Object.assign(
      { children: cells, cantSplit: true },
      t.isHeader ? { tableHeader: true } : {},
      heightPx ? { height: { value: Math.round(heightPx * PX_TO_TWIP), rule: docx.HeightRule.ATLEAST } } : {},
    ));
  }

  // Le trait de départ de Word, celui d'un tableau que personne n'a réglé (docx.js : simple, 0,5 pt, couleur automatique).
  const DEFAULT_WORD_BORDER = { style: 'single', size: 4, color: 'auto' };
  // Un bord tel que `ExportCommon.cellBorderSides` le rend : null = le trait de départ, 'none' = rien, '#rrggbb' = un trait fin de cette couleur.
  function wordBorderFrom(value) {
    if (value === TableBorders.NONE) return NO_BORDER;
    if (!value) return DEFAULT_WORD_BORDER;
    return { style: 'single', size: 4, color: value.slice(1).toUpperCase() };
  }

  async function wordCellFrom(cell, t) {
    const { col, colspan: span, rowspan: rowSpan } = t.placement.get(cell);
    const width = t.colWidthsTwip.slice(col, col + span).reduce((a, b) => a + b, 0) || Math.floor(CONTENT_WIDTH_TWIP / t.columnCount);
    const children = await blocksFromContainer(cell, t.ctx, false, Math.max(200, width - WORD_DEFAULT_CELL_MARGIN_TWIP), t.keepNext);
    // Bords et alignement vertical réglés : seulement quand la case en porte (une case sans réglage garde ce que Word fait d'un tableau ordinaire).
    // Les deux cases d'un trait qu'elles se partagent disent la même chose (js/table-borders.js), donc Word n'a aucun conflit de bords à trancher ;
    // docx.js reporte les bords d'une case fusionnée sur ses cases de continuation.
    const sides = t.borderSides && t.borderSides.get(cell);
    const valign = ExportCommon.cellVerticalAlign(cell);
    const wordValign = { top: docx.VerticalAlign.TOP, middle: docx.VerticalAlign.CENTER, bottom: docx.VerticalAlign.BOTTOM };
    return new docx.TableCell({
      children: children.length ? children : [new docx.Paragraph('')],
      width: { size: width, type: docx.WidthType.DXA },
      columnSpan: span > 1 ? span : undefined,
      rowSpan: rowSpan > 1 ? rowSpan : undefined,
      shading: cellShadingFrom(cell),
      borders: sides ? { top: wordBorderFrom(sides.top), right: wordBorderFrom(sides.right), bottom: wordBorderFrom(sides.bottom), left: wordBorderFrom(sides.left) } : undefined,
      verticalAlign: valign ? wordValign[valign] : undefined,
    });
  }

  // La case de continuation d'une case fusionnée (docx.js la crée dans la ligne recouverte, sans contenu) : un paragraphe vide qui garde, lui aussi,
  // avec le suivant. Word ne tient la ligne avec la suivante que si les paragraphes de toutes ses cases le demandent.
  function keepContinuationCellsWithNext(tableRows, rows, joinedRows, keptRows) {
    tableRows.forEach((tableRow, i) => {
      if (!joinedRows.has(rows[i]) && !keptRows.has(rows[i])) return;
      tableRow.cells.forEach((tableCell) => { if (tableCell.options && tableCell.options.verticalMerge === docx.VerticalMergeType.CONTINUE) tableCell.addChildElement(new docx.Paragraph({ keepNext: true })); });
    });
  }

  const NO_BORDER = { style: 'none', size: 0, color: 'FFFFFF' };
  const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  // Émulation par un tableau sans bordure d'une ligne et deux cellules (le « table trick » des générateurs DOCX) : Word n'a pas de colonnes locales à
  // un bloc, seulement des colonnes de section. Largeurs lues dans --layout-left (variable CSS posée par TipTap, js/editor-nodes.js), pas mesurées :
  // il n'y a pas de mise en page hors du navigateur. --layout-left-mm, posé seulement quand la colonne a été réglée en mm
  // (js/editor-nodes.js:renderHTML), prime sur le pourcentage : conversion directe, sans repasser par un pourcentage arrondi.
  async function twoColumnsBlockFrom(zoneEl, ctx) {
    const cols = Array.from(zoneEl.querySelectorAll(':scope > .two-columns-column'));
    if (cols.length !== 2) return null;
    const leftMm = parseFloat(zoneEl.style.getPropertyValue('--layout-left-mm'));
    let leftTwip;
    if (Number.isFinite(leftMm)) {
      leftTwip = Math.round(leftMm * PageLayout.MM_TO_TWIP);
    } else {
      const leftPercent = parseFloat(zoneEl.style.getPropertyValue('--layout-left')) || 50;
      leftTwip = Math.round(CONTENT_WIDTH_TWIP * leftPercent / 100);
    }
    // Colonne séparatrice, vide et sans bordure, à la largeur exacte de la gouttière CSS (PageLayout.COLUMN_GAP_PX). Sans elle, la colonne droite
    // récupérait toute la place restante : le Word rendait 90 mm là où l'éditeur et le PDF en rendent 85,8, et les deux colonnes se touchaient.
    const gapTwip = Math.round(PageLayout.COLUMN_GAP_PX * PX_TO_TWIP);
    // Une largeur en mm réglée pour une page plus large (paysage, marges plus petites) peut dépasser la page d'aujourd'hui : la colonne droite
    // devenait négative et docx.js refusait l'export entier (« Invalid value '-793' ... Must be a positive integer »). Même plancher que l'écran
    // (css/editor-v2.css) : chaque colonne garde au moins 10 mm.
    const minTwip = Math.min(MIN_ZONE_COLUMN_TWIP, Math.floor((CONTENT_WIDTH_TWIP - gapTwip) / 2));
    leftTwip = Math.max(minTwip, Math.min(CONTENT_WIDTH_TWIP - gapTwip - minTwip, leftTwip));
    const rightTwip = CONTENT_WIDTH_TWIP - leftTwip - gapTwip;
    const widths = [leftTwip, gapTwip, rightTwip];
    const cells = [];
    for (let i = 0; i < 2; i += 1) {
      const children = await blocksFromContainer(cols[i], ctx, false, i === 0 ? leftTwip : rightTwip);
      const cell = new docx.TableCell({
        children: children.length ? children : [new docx.Paragraph('')],
        width: { size: i === 0 ? leftTwip : rightTwip, type: docx.WidthType.DXA },
        borders: NO_BORDERS,
        // Word applique sinon ses marges de cellule par défaut (108 twips de chaque côté) : la largeur annoncée ne serait pas celle du texte, et le
        // chiffre en mm choisi par la personne serait faux d'environ 3,8 mm par colonne.
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      cells.push(cell);
      if (i === 0) cells.push(new docx.TableCell({ children: [new docx.Paragraph('')], width: { size: gapTwip, type: docx.WidthType.DXA }, borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 0, right: 0 } }));
    }
    // Comme tableBlockFrom : un columnWidths explicite pour que <w:tblGrid> corresponde aux largeurs des cellules.
    return new docx.Table({ rows: [new docx.TableRow({ children: cells })], width: { size: CONTENT_WIDTH_TWIP, type: docx.WidthType.DXA }, borders: NO_BORDERS, columnWidths: widths });
  }

  // Encadré (js/callout.js) : un tableau Word d'une ligne et deux cellules, l'icône (un PNG tracé d'après les mêmes dessins que le CSS) à gauche, les
  // blocs de l'encadré à droite, avec le fond teinté sur toute la ligne et, pour seul filet, une barre épaisse de la couleur d'accent à gauche. Mêmes
  // mesures que css/callout.css (ExportCommon.calloutMetricsPx). Un paragraphe de la hauteur de la marge (`margin: 6px 0`) avant et après : sans
  // paragraphe entre eux Word fusionne deux tableaux qui se suivent, et une cellule ne peut pas finir par un tableau. `widthTwip` : la largeur de la
  // colonne ou de la cellule qui contient l'encadré, la page entière pour le corps du document.
  function dataUrlBytes(dataUrl) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function calloutBlocksFrom(node, ctx, widthTwip, pageBreakBefore) {
    const m = ExportCommon.calloutMetricsPx(node);
    const color = Callout.colorOf(node.getAttribute('data-color'));
    const iconKey = node.getAttribute('data-icon');
    const hex = css => css.replace('#', '').toUpperCase();
    const totalTwip = widthTwip || CONTENT_WIDTH_TWIP;
    const leftTwip = Math.round(m.padLeftPx * PX_TO_TWIP);
    const rightTwip = Math.max(400, totalTwip - leftTwip);
    const marginTwip = px => Math.round(px * PX_TO_TWIP);
    const iconPx = Math.round(m.iconSizePx);
    ctx.imageIdCounter += 1;
    const icon = new docx.ImageRun({
      type: 'png', data: dataUrlBytes(Callout.iconPng(iconKey, color.accent, 96)), transformation: { width: iconPx, height: iconPx },
      altText: { id: ctx.imageIdCounter, name: '', description: I18n.t('callout.icon.' + iconKey), title: '' },
    });
    const shading = { type: docx.ShadingType.CLEAR, fill: hex(color.tint), color: 'auto' };
    // La barre : huitièmes de point (24 = 3pt = les 4px du CSS).
    const bar = { style: 'single', size: Math.max(2, Math.round(m.barPx * 0.75 * 8)), color: hex(color.accent), space: 0 };
    const iconCell = new docx.TableCell({
      children: [new docx.Paragraph({ children: [icon], spacing: { before: marginTwip(Math.max(0, m.iconTopPx - m.padTopPx)), after: 0 } })],
      width: { size: leftTwip, type: docx.WidthType.DXA },
      shading,
      borders: { top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER, left: bar },
      margins: { top: marginTwip(m.padTopPx), bottom: marginTwip(m.padBottomPx), left: marginTwip(m.iconLeftPx), right: 0 },
    });
    let children = await blocksFromContainer(node, ctx, false, Math.max(200, rightTwip - marginTwip(m.padRightPx)));
    if (!children.length || children[children.length - 1] instanceof docx.Table) children = children.concat([new docx.Paragraph('')]);
    const textCell = new docx.TableCell({
      children,
      width: { size: rightTwip, type: docx.WidthType.DXA },
      shading,
      borders: { top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER, left: NO_BORDER },
      margins: { top: marginTwip(m.padTopPx), bottom: marginTwip(m.padBottomPx), left: 0, right: marginTwip(m.padRightPx) },
    });
    const table = new docx.Table({
      rows: [new docx.TableRow({ children: [iconCell, textCell] })],
      width: { size: totalTwip, type: docx.WidthType.DXA }, borders: NO_BORDERS, columnWidths: [leftTwip, rightTwip], layout: docx.TableLayoutType.FIXED,
    });
    const spacer = breakBefore => new docx.Paragraph({ children: [], spacing: { before: 0, after: 0, line: marginTwip(m.marginTopPx), lineRule: 'exact' }, pageBreakBefore: !!breakBefore });
    return [spacer(pageBreakBefore), table, spacer(false)];
  }

  function isHeadingTag(tag) { return /^H[1-6]$/.test(tag); }
  // Découpe un tableau de runs en groupes, un groupe = un <w:p>. `w:jc` (l'alignement) et `wp:anchor/verticalPosition` s'appliquent au paragraphe,
  // jamais à un run : une image qui a besoin de son propre alignement ou de son propre point d'ancrage vertical a donc besoin de son propre
  // paragraphe. Trois marqueurs, posés par inlineNodesFrom :
  // - __docxSplitBefore (image habillée à gauche ou à droite) : ouvre un groupe, sans couper en tête (une coupure avant le tout premier run ne
  //   servirait à rien) ; le texte qui suit l'image reste avec elle, c'est lui qui doit l'habiller.
  // - __docxCenterBlock (image centrée) : l'image est seule dans son groupe, centrée ; le texte autour garde son alignement, comme dans l'éditeur où
  //   `display:block` la met sur sa propre ligne.
  // - __docxBlock (image « bloc » sans alignement) : de même, seule dans son groupe, alignée à gauche.
  // Chaque groupe porte `alignment: undefined` (garder celui du paragraphe HTML d'origine) ou une valeur qui le remplace.
  function splitRunsAtFloatedImages(runsArr) {
    const groups = [];
    let current = { runs: [], alignment: undefined };
    const flush = () => { if (current.runs.length) groups.push(current); current = { runs: [], alignment: undefined }; };
    for (const run of runsArr) {
      if (run && run.__docxCenterBlock) { flush(); groups.push({ runs: [run], alignment: docx.AlignmentType.CENTER }); continue; }
      if (run && run.__docxBlock) { flush(); groups.push({ runs: [run], alignment: docx.AlignmentType.LEFT }); continue; }
      if (run && run.__docxSplitBefore && current.runs.length) flush();
      current.runs.push(run);
    }
    // `!groups.length` : un paragraphe vide (<p></p>) n'a aucun run et doit quand même produire son <w:p>, qui fait l'espacement vertical (aucune
    // marge automatique : spacing.after à 0 plus bas).
    if (current.runs.length || !groups.length) groups.push(current);
    return groups;
  }
  // <p>, <div> et <h1-6> donnent un ou plusieurs Paragraph (splitRunsAtFloatedImages). Titre : le marqueur littéral (« 1) »...), identique à celui du
  // PDF et de la Lecture, posé en texte en plus du style Word « Titre N » (que reprennent le volet de navigation et un futur sommaire réel construit
  // dans Word). `pageBreakBefore` doit passer par le constructeur (option native, IParagraphPropertiesOptionsBase) : un Paragraph construit n'est pas
  // modifiable de l'extérieur. `keepNext` : « Conserver avec le suivant » (w:keepNext), pour le bloc que sa légende doit suivre sur la même page
  // (keepsWithCaption) et pour un paragraphe que le réglage « Garder avec le suivant » (js/keep-with-next.js) garde avec le bloc qui le suit.
  async function paragraphBlockFrom(node, ctx, headingMarkers, pageBreakBefore, keepNext) {
    const runs = await inlineNodesExcludingNestedLists(node, { size: DEFAULT_HALF_PT }, ctx);
    const align = paragraphAlignment(node);
    const isHeading = isHeadingTag(node.tagName);
    const marker = isHeading && headingMarkers && headingMarkers.get(node);
    // color:'auto', pour la même raison que dans inheritedRunStyle : ce marqueur (« 1) », « 2) »...) est un TextRun à part, qui ne passe pas par
    // inheritedRunStyle ni par son défaut de couleur ; sans cela il hériterait du bleu du style Word « Titre N ».
    const children = marker ? [new docx.TextRun(Object.assign({ text: marker }, isHeading ? { bold: true, size: HEADING_HALF_PT[node.tagName], color: 'auto' } : {}))].concat(runs) : runs;
    if (isHeading) ctx.headingBlocks.push({ level: parseInt(node.tagName.slice(1), 10), text: ((marker || '') + (node.textContent || '')).replace(/\s+/g, ' ').trim() });
    const groups = splitRunsAtFloatedImages(children);
    return groups.map((group, i) => {
      const groupChildren = group.runs;
      const opts = {
        children: groupChildren.length ? groupChildren : [new docx.TextRun('')],
        alignment: group.alignment !== undefined ? group.alignment : align,
        // after:0 : `.tiptap p` et `h1-6` n'ont aucune marge propre (css/editor-v2.css) ; l'espacement vient des paragraphes vides que la personne
        // insère elle-même, jamais d'une marge automatique. line et lineRule : voir LINE_SPACING_240THS.
        spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' },
        pageBreakBefore: !!(i === 0 && pageBreakBefore),
      };
      if (keepNext) opts.keepNext = true;
      if (isHeading) opts.heading = docx.HeadingLevel[HEADING_LEVEL[node.tagName]];
      if (node.tagName === 'BLOCKQUOTE') { opts.indent = { left: 400 }; opts.border = { left: { style: 'single', size: 16, color: 'CBD5E1', space: 8 } }; }
      return new docx.Paragraph(opts);
    });
  }

  // Bloc de code posé directement dans le document, une cellule, une colonne ou un en-tête : un paragraphe par ligne de code, tous avec les mêmes
  // fond, bordures et retraits, que Word et LibreOffice fusionnent alors en un seul cadre gris sans filet entre deux lignes. Retraits de 7,5 pt (150
  // twips) et filet à 7 pt du texte : le cadre s'aligne sur la marge, le texte est en retrait comme dans l'éditeur. Les espaces de tête sont gardés
  // (docx.js écrit xml:space="preserve"), une ligne vide devient une ligne d'un espace.
  function codeBlockFrom(node, pageBreakBefore) {
    const lines = ExportCommon.codeLinesOf(node);
    const edge = { style: 'single', size: 6, color: CODE_BOX_HEX, space: 7 };
    return lines.map((line, i) => new docx.Paragraph({
      children: [new docx.TextRun({ text: line === '' ? ' ' : line, font: CODE_FONT, size: CODE_HALF_PT, color: CODE_TEXT_HEX })],
      shading: { type: docx.ShadingType.CLEAR, fill: CODE_FILL_HEX },
      border: { top: edge, bottom: edge, left: edge, right: edge },
      indent: { left: 150, right: 150 },
      // 3pt (60 twips) avant et après le bloc = `margin: 4px 0` de `.tiptap pre`, hors du cadre.
      spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 60 : 0, line: CODE_LINE_240THS, lineRule: 'auto' },
      pageBreakBefore: !!(i === 0 && pageBreakBefore),
    }));
  }

  function buildTocParagraphs(headingBlocks) {
    const title = new docx.Paragraph({ children: [new docx.TextRun({ text: I18n.t('pdf.tocTitle'), bold: true, size: 32 })], spacing: { after: 160 } });
    if (!headingBlocks.length) return [title, new docx.Paragraph({ children: [new docx.TextRun({ text: I18n.t('docx.tocEmpty'), italics: true })] })];
    const lines = headingBlocks.map(hb => new docx.Paragraph({
      children: [new docx.TextRun({ text: hb.text, bold: hb.level === 1 })],
      indent: { left: Math.max(0, hb.level - 1) * INDENT_STEP_TWIP },
      spacing: { after: 60 },
    }));
    return [title].concat(lines);
  }

  // Le paragraphe est-il à garder avec le suivant ? L'image que suit une légende, et chaque légende qu'une autre légende suit (« Rester ensemble »,
  // js/caption.js). Un tableau passe par tableBlockFrom (`keepWithCaption`).
  function keepsWithCaption(node) {
    if (Caption.captionsAfter(node).length) return true;
    if (!Caption.isCaptionElement(node) || !Caption.isCaptionElement(node.nextElementSibling)) return false;
    let owner = node.previousElementSibling;
    while (Caption.isCaptionElement(owner)) owner = owner.previousElementSibling;
    return Caption.carriesCaption(owner);
  }
  // Cœur du module : parcourt les enfants directs d'un conteneur (corps du document, cellule de tableau, colonne à deux colonnes, zone d'en-tête ou
  // de pied : les quatre partagent la même logique ici, alors que le PDF doit distinguer le flux pdfmake de la cellule) et renvoie un tableau de
  // Paragraph et de Table, prêt à poser dans `children` (Document, TableCell, Header et Footer acceptent la même forme). `keepNext` : tous les
  // paragraphes construits ici gardent le suivant (la dernière ligne d'un tableau que suit une légende, voir tableBlockFrom).
  async function blocksFromContainer(container, ctx, isTopLevel, widthTwip, keepNext) {
    const flow = { ctx, isTopLevel, widthTwip, keepNext, headingMarkers: isTopLevel ? headingMarkersOf(container) : null, pendingPageBreak: false };
    const blocks = [];
    for (const node of Array.from(container.childNodes)) {
      for (const block of await blocksFromNode(node, flow)) blocks.push(block);
    }
    // Un sommaire n'a de sens qu'à la racine du document : il y prend la place de son repère.
    return isTopLevel ? blocks.flatMap(b => (b && b.__tocPlaceholder ? buildTocParagraphs(ctx.headingBlocks) : [b])) : blocks;
  }

  function headingMarkersOf(container) {
    const config = container.querySelector(':scope > .heading-numbering-config');
    const style = (config && config.dataset.style) || 'none';
    const headingEls = Array.from(container.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const markers = HeadingNumbering.markersFor(headingEls, style);
    return new Map(headingEls.map((el, i) => [el, markers[i]]));
  }

  // Les blocs d'un enfant du conteneur ; `flow.pendingPageBreak` : un saut de page vient d'être lu, le prochain bloc l'ouvre (et le consomme).
  async function blocksFromNode(node, flow) {
    if (node.nodeType === Node.TEXT_NODE) return consumedTextBlocks(node, flow);
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const handler = CONTAINER_NODE_BLOCKS.find(([matches]) => matches(node));
    if (handler) return handler[1](node, flow);
    // Nœud non reconnu (wrapper générique...) : on continue de creuser dedans plutôt que d'ignorer tout son contenu.
    return blocksFromContainer(node, flow.ctx, false);
  }

  // Un bloc qui ouvre une page quand un saut de page le précède : le saut est consommé, que le bloc existe ou non.
  function consumingBreak(blocksOf) {
    return async (node, flow) => {
      const blocks = await blocksOf(node, flow);
      flow.pendingPageBreak = false;
      return blocks;
    };
  }

  function textBlocks(node, flow) {
    if (!node.nodeValue || !node.nodeValue.trim()) return [];
    return [new docx.Paragraph({ children: [new docx.TextRun(node.nodeValue)], pageBreakBefore: flow.pendingPageBreak, keepNext: flow.keepNext ? true : undefined })];
  }

  const consumedTextBlocks = consumingBreak(textBlocks);

  const optionalBlock = block => (block ? [block] : []);

  // <img> directement enfant du conteneur (hors d'un <p> : une image en calque insérée hors flux, js/editor-nodes.js) : sans cette branche, le nœud
  // tombait dans le repli générique, qui recurse sur ses enfants ; une image n'en a aucun, elle disparaissait de l'export.
  async function bareImageBlocks(node, flow) {
    const runs = await inlineNodesFrom(node, { size: DEFAULT_HALF_PT }, flow.ctx);
    if (!runs.length) return [];
    // Même centrage que dans un <p> (splitRunsAtFloatedImages) : ce paragraphe est construit ici, il ne passe pas par paragraphBlockFrom et n'hériterait
    // sinon d'aucun alignement.
    const centered = runs.some(r => r && r.__docxCenterBlock);
    return [new docx.Paragraph({ children: runs, alignment: centered ? docx.AlignmentType.CENTER : undefined, spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' }, pageBreakBefore: !!flow.pendingPageBreak })];
  }

  // Les blocs des enfants d'un conteneur, par classe ou par balise : [test, blocs(node, flow)], le premier qui convient. Les repères (saut de page,
  // numérotation des titres) n'écrivent rien ; un sommaire est ignoré sans bruit hors de la racine, plutôt que de laisser fuiter un objet de réserve non
  // résolu dans un Table ou un TableCell (plantage à la sérialisation).
  const CONTAINER_NODE_BLOCKS = [
    [node => node.classList.contains('page-break-marker'), (node, flow) => { flow.pendingPageBreak = true; return []; }],
    [node => node.classList.contains('heading-numbering-config'), () => []],
    [node => node.classList.contains('toc-marker'), (node, flow) => (flow.isTopLevel ? [{ __tocPlaceholder: true }] : [])],
    [node => node.classList.contains('two-columns-zone'), consumingBreak(async (node, flow) => optionalBlock(await twoColumnsBlockFrom(node, flow.ctx)))],
    [node => node.classList.contains('callout'), consumingBreak((node, flow) => calloutBlocksFrom(node, flow.ctx, flow.widthTwip, flow.pendingPageBreak))],
    [node => node.tagName === 'TABLE', consumingBreak(async (node, flow) => optionalBlock(await tableBlockFrom(node, flow.ctx, flow.isTopLevel && Caption.captionsAfter(node).length > 0)))],
    [node => /^(UL|OL)$/.test(node.tagName), consumingBreak((node, flow) => listBlocksFrom(node, 0, flow.ctx, flow.pendingPageBreak))],
    [node => node.tagName === 'PRE', consumingBreak((node, flow) => codeBlockFrom(node, flow.pendingPageBreak))],
    [node => /^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(node.tagName), consumingBreak((node, flow) => paragraphBlockFrom(node, flow.ctx, flow.headingMarkers, flow.pendingPageBreak, flow.keepNext || (flow.isTopLevel && (keepsWithCaption(node) || KeepWithNext.isKeptElement(node)))))],
    [node => node.tagName === 'HR', consumingBreak(() => [new docx.Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'CBD5E1' } }, spacing: { after: 120 } })])],
    [node => node.tagName === 'IMG', consumingBreak(bareImageBlocks)],
  ];

  // Hauteur rendue d'un fragment d'en-tête ou de pied à la largeur du contenu, en twips : elle sert à placer le pied (Word l'ancre par son bas).
  // Mesurée comme le fait js/pdf-export.js:resolveZone, images décodées d'abord (sinon elles mesurent 0).
  async function measureZoneHeightTwip(html) {
    if (!PageLayout.hasZoneContent(html)) return 0;
    const root = document.createElement('div'); root.innerHTML = html;
    const detach = ExportCommon.attachMeasureHost(root, Math.round(CONTENT_WIDTH_TWIP / PX_TO_TWIP));
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      return Math.round(root.getBoundingClientRect().height * PX_TO_TWIP);
    } finally { detach(); }
  }

  // Le filigrane du modèle (js/page-layer.js:watermarkLayout : le corps, l'angle, la couleur et l'opacité que l'éditeur et le PDF dessinent) en image
  // PNG : le texte est rendu par un canevas dans la même police (Roboto gras), tourné, l'opacité cuite dans les pixels, car Word n'applique pas celle
  // d'une image ancrée et un filigrane Word natif (VML) ne s'affiche ni dans Google Docs ni ailleurs. L'image a la taille du rectangle qui contient
  // le texte tourné ; Word la centre sur la page (watermarkRun). Dessiné une fois par réglage : un lot de 200 courriers ne redessine pas 200 fois le
  // même canevas. Rend null quand le navigateur ne sait pas dessiner (l'export continue sans filigrane).
  const WATERMARK_PX_PER_PT = 1.5;
  const WATERMARK_MAX_CANVAS_PX = 4096;
  const watermarkImageCache = new Map();
  async function watermarkImageData(layout) {
    if (!layout) return null;
    const key = JSON.stringify(layout);
    if (watermarkImageCache.has(key)) return watermarkImageCache.get(key);
    try { await document.fonts.load('700 40px Roboto', layout.text); } catch (e) { /* police indisponible : le canevas prend le repli du navigateur */ }
    const k = WATERMARK_PX_PER_PT;
    const fontPx = layout.fontSizePt * k;
    const fontCss = '700 ' + fontPx + 'px Roboto, Helvetica, Arial, sans-serif';
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.font = fontCss;
    const textW = g.measureText(layout.text).width;
    const textH = fontPx * 1.2;
    const rad = layout.angleDeg * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const pad = Math.ceil(fontPx * 0.1);
    const width = Math.min(WATERMARK_MAX_CANVAS_PX, Math.ceil(textW * cos + textH * sin) + 2 * pad);
    const height = Math.min(WATERMARK_MAX_CANVAS_PX, Math.ceil(textW * sin + textH * cos) + 2 * pad);
    canvas.width = width; canvas.height = height;
    g.translate(width / 2, height / 2);
    g.rotate(rad);
    g.font = fontCss;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = layout.color;
    g.globalAlpha = layout.opacity;
    g.fillText(layout.text, 0, PageLayer.WATERMARK_BASELINE_EM * fontPx);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    // docx.js compte la taille d'une image en pixels de 96 dpi : points = pixels du canevas / k, pixels = points x 96 / 72.
    const image = { data: new Uint8Array(await blob.arrayBuffer()), widthPx: Math.round(width / k * 96 / 72), heightPx: Math.round(height / k * 96 / 72) };
    if (watermarkImageCache.size >= 8) watermarkImageCache.clear();
    watermarkImageCache.set(key, image);
    return image;
  }

  // Son ancre : centrée sur la page (pas sur les marges) dans les deux sens, derrière le texte, sous toutes les images en calque (zIndex 1 contre
  // 1000 et plus).
  function watermarkRun(image) {
    layerObjectId += 1;
    return new docx.ImageRun({
      type: 'png', data: image.data, transformation: { width: image.widthPx, height: image.heightPx },
      altText: { id: layerObjectId, name: '', description: '', title: '' },
      floating: {
        behindDocument: true, zIndex: 1,
        horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.PAGE, align: docx.HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PAGE, align: docx.VerticalPositionAlign.CENTER },
      },
    });
  }

  // « Sur toutes les pages » (js/page-layer.js) : un paragraphe de 1 pt qui porte, en ancres flottantes derrière le texte, chaque image répétée à sa
  // place de la page : le même ancrage que dans le corps (docxFloatingOptionsFrom), mais placé dans l'en-tête, que Word répète sur chaque page. Un
  // paragraphe neuf et des images neuves par en-tête : un en-tête ne partage rien avec un autre. Les numéros d'objet partent de 9000, hors de ceux du
  // contenu de l'en-tête (headerFooterBlocksFrom recompte depuis 1). Le filigrane du modèle (`watermark` : watermarkImageData), s'il y en a un, est
  // la première ancre : le fond de tout le reste.
  async function repeatedLayerParagraph(images, ctx, watermark) {
    const runs = watermark ? [watermarkRun(watermark)] : [];
    for (const img of images) {
      const imgData = await docxImageDataFrom(img);
      if (!imgData) continue;
      layerObjectId += 1;
      const floating = docxFloatingOptionsFrom(img, layerObjectId, ctx);
      if (!floating) continue;
      runs.push(new docx.ImageRun({ type: imgData.type, data: imgData.data, transformation: { width: imgData.width, height: imgData.height }, altText: { id: layerObjectId, name: '', description: '', title: '' }, floating }));
    }
    return runs.length ? new docx.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: runs }) : null;
  }
  let layerObjectId = 9000;

  async function headerFooterBlocksFrom(html, ctx) {
    if (!html) return [];
    const root = document.createElement('div'); root.innerHTML = html;
    return blocksFromContainer(root, ctx, false);
  }

  // Les zones d'en-tête et de pied, comme dans le PDF : sur toutes les pages dès qu'une variante a du contenu (la page 1 sans en-tête garde la marge des
  // autres), rien sinon. `bandTwip(zone)` : la bande que la zone prend en haut ou en bas de la page.
  function zonesFrom(headerFooterData) {
    const enabled = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = enabled && !!headerFooterData.differentFirstPage;
    const variants = differentFirstPage ? ['default', 'first'] : ['default'];
    const html = (zone, variant) => (enabled && headerFooterData[zone] && headerFooterData[zone][variant]) || '';
    const bandTwip = zone => (variants.some(v => PageLayout.hasZoneContent(html(zone, v))) ? HF_BAND_TWIP : 0);
    return { enabled, differentFirstPage, variants, html, bandTwip };
  }

  // Les blocs du corps. Hôte de mesure hors écran le temps du parcours : measuredColumnWidthsPx a besoin d'un rendu réel, impossible sur un <div>
  // détaché du document. Word veut un paragraphe après un tableau placé en fin de document (un tableau, une zone à deux colonnes et un encadré en sont) :
  // réduit à 1 pt, celui-ci ne rouvre pas une page blanche quand le tableau touche la marge du bas, ce que faisait le paragraphe vide d'une ligne de
  // l'éditeur.
  async function bodyBlocksFrom(root, ctx) {
    const detachMeasureHost = ExportCommon.attachMeasureHost(root, Math.round(CONTENT_WIDTH_TWIP / PX_TO_TWIP));
    let bodyBlocks;
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      bodyBlocks = await blocksFromContainer(root, ctx, true);
    } finally { detachMeasureHost(); }
    if (bodyBlocks.length && bodyBlocks[bodyBlocks.length - 1] instanceof docx.Table) {
      bodyBlocks.push(new docx.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, run: { size: 2 } }));
    }
    return bodyBlocks;
  }

  // Le pied : Word l'ancre par son bas (distance du bord de la feuille au bas du pied), le PDF par son haut, juste sous le texte. La distance qui met le
  // haut du pied le plus haut des deux variantes là où le PDF le met est donc marge du bas + bande - sa hauteur ; une variante plus basse est complétée
  // d'une ligne vide à hauteur fixe pour que la sienne commence aussi au même endroit.
  async function footerLayoutFrom(zones, ctx, bottomBandTwip) {
    const heights = {};
    for (const v of zones.variants) heights[v] = await measureZoneHeightTwip(zones.html('footer', v));
    const heightTwip = Math.max(0, ...Object.values(heights));
    const distanceTwip = bottomBandTwip ? Math.max(0, marginBottomTwip + bottomBandTwip - heightTwip) : Math.round(marginBottomTwip / 2);
    async function blocksFor(variant) {
      const blocks = await headerFooterBlocksFrom(zones.html('footer', variant), ctx);
      const pad = heightTwip - (heights[variant] || 0);
      if (blocks.length && pad >= TWIPS_PER_PT) blocks.push(new docx.Paragraph({ spacing: { before: 0, after: 0, line: pad, lineRule: 'exact' } }));
      return blocks;
    }
    return { distanceTwip, blocksFor };
  }

  function sectionPropertiesFrom(zones, bottomBandTwip, footerDistanceTwip) {
    return {
      page: {
        // docx.js échange largeur et hauteur de lui-même quand l'orientation vaut LANDSCAPE : lui donner les dimensions déjà échangées les
        // ré-échangerait (page portrait étiquetée paysage). Toujours le portrait du format ici, l'orientation seule dit le sens.
        size: Object.assign(PageLayout.pageSizeTwipFor('portrait', pageFormat), pageOrientation === 'landscape' ? { orientation: docx.PageOrientation.LANDSCAPE } : {}),
        margin: { top: marginTopTwip + topBandTwip, bottom: marginBottomTwip + bottomBandTwip, left: marginLeftTwip, right: marginRightTwip, header: Math.round(marginTopTwip / 2), footer: footerDistanceTwip },
      },
      titlePage: zones.differentFirstPage,
    };
  }

  // Les pieds de la section, variante par variante ; rend les blocs d'en-tête de chaque variante, que addHeaders complète.
  async function addHeaderFooterZones(section, zones, ctx, footer) {
    const headerBlocks = {};
    if (!zones.enabled) return headerBlocks;
    for (const variant of zones.variants) {
      headerBlocks[variant] = await headerFooterBlocksFrom(zones.html('header', variant), ctx);
      const footerBlocks = await footer.blocksFor(variant);
      if (footerBlocks.length) section.footers = Object.assign({}, section.footers, { [variant]: new docx.Footer({ children: footerBlocks }) });
    }
    return headerBlocks;
  }

  // Chaque en-tête que Word peut montrer (celui de la première page aussi quand elle diffère) porte les images répétées ; sans en-tête du tout, il est
  // créé pour elles. Le filigrane du modèle rejoint ces images : la même ancre dans chaque en-tête, créé pour lui s'il manque.
  async function addHeaders(section, variants, headerBlocks, layerImages, ctx) {
    const pageSizePt = PageLayout.pageSizePtFor(pageOrientation, pageFormat);
    const watermarkImage = await watermarkImageData(PageLayer.watermarkLayout(pageWatermark, pageSizePt.width, pageSizePt.height));
    for (const variant of variants) {
      const blocks = headerBlocks[variant] || [];
      const layerParagraph = (layerImages.length || watermarkImage) ? await repeatedLayerParagraph(layerImages, ctx, watermarkImage) : null;
      if (layerParagraph) blocks.push(layerParagraph);
      if (blocks.length) section.headers = Object.assign({}, section.headers, { [variant]: new docx.Header({ children: blocks }) });
    }
  }

  async function buildDocxDocument(resolvedHtml, headerFooterData) {
    const root = document.createElement('div'); root.innerHTML = resolvedHtml || '';
    // Ni ligne vide ni saut de page orphelin en fin de document : quand le texte arrive à la marge du bas, ils ouvrent une page blanche.
    ReaderMode.trimTrailingBlankBlocks(root);
    const ctx = { footnotes: {}, footnoteCounter: 0, headingBlocks: [], numberingConfigs: [], numberingCounter: 0, imageIdCounter: 0, measureRoot: root };
    // « Sur toutes les pages » : les images répétées partent dans l'en-tête, le corps ne les compte plus (inlineNodesFrom).
    const layerImages = PageLayer.collect(root);
    layerObjectId = 9000;
    // Les bandes d'en-tête et de pied sont posées avant les blocs : l'ancrage d'une image en calque compte la bande du haut.
    const zones = zonesFrom(headerFooterData);
    topBandTwip = zones.bandTwip('header');
    const bottomBandTwip = zones.bandTwip('footer');
    const bodyBlocks = await bodyBlocksFrom(root, ctx);
    const footer = await footerLayoutFrom(zones, ctx, bottomBandTwip);
    const section = {
      properties: sectionPropertiesFrom(zones, bottomBandTwip, footer.distanceTwip),
      children: bodyBlocks.length ? bodyBlocks : [new docx.Paragraph('')],
    };
    const headerBlocks = await addHeaderFooterZones(section, zones, ctx, footer);
    await addHeaders(section, zones.variants, headerBlocks, layerImages, ctx);
    const doc = { sections: [section], footnotes: ctx.footnotes };
    if (ctx.numberingConfigs.length) doc.numbering = { config: ctx.numberingConfigs };
    return new docx.Document(doc);
  }

  async function getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip) {
    // Une image d'un site externe est téléchargée pour ce Word (docxImageDataFrom) : la fenêtre la liste et peut tout arrêter
    // (js/external-images.js). Un seul passage pour l'export d'une ligne comme pour chaque ligne d'un lot (exportCurrentRecord passe par ici).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsTwip(marginsTwip);
    await ensureDocxLibLoaded();
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const doc = await buildDocxDocument(resolvedHtml, resolvedHeaderFooterData);
    const blob = await docx.Packer.toBlob(doc);
    return { blob, filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip) {
    if (!record) { alert(I18n.t('alert.noRecordForExportDocx')); return; }
    const { blob, filename } = await getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.docx');
  }

  return { exportCurrentRecord, getDocxBlobForRecord, ensureDocxLibLoaded };
})();
