// Export DOCX — Beta, volontairement plus modeste que l'export PDF vectoriel (js/pdf-export.js). DOCX est un format qui SE REFLOW (police/zoom/imprimante
// du lecteur), contrairement à une page PDF figée : reproduire la fidélité pixel-près de pdf-export.js (grille page, images en calque bracketées/
// interpolées) n'aurait pas de sens ici et irait contre l'usage réel d'un .docx (un document qu'on continue d'ÉDITER dans Word/LibreOffice).
//
// Écarts avec la V1 (cf. historique git pour le détail) : les listes utilisent maintenant la numérotation Word native (numbering.xml - une <ul>/<ol>
// renumérote correctement après suppression/ajout d'un item, contrairement à un marqueur texte figé) ; les colonnes de tableau sont mesurées sur le rendu
// réel (comme pdf-export.js) au lieu d'une répartition à parts égales ; export en lot (ZIP, une ligne = un .docx) ajouté, cf. js/main.js:onExportBatch.
//
// Portée encore volontairement réduite, assumée :
//  - Toute image (y compris "en calque devant/derrière" dans l'éditeur) devient une image EN LIGNE, dans l'ordre du document - aucune position absolue
//    (le format DOCX autorise une ancre page-relative, mais ça n'aurait de sens que figé comme le PDF - contradictoire avec le reflow qui fait l'intérêt
//    même d'un .docx).
//  - Case à cocher : glyphe Unicode littéral (☑/☐), pas de case à cocher Word native (content control `w:sdt` - mécanisme bien plus lourd, sans lien avec
//    numbering.xml utilisé pour le reste des listes).
//  - Sommaire : liste statique (marqueur + texte), jamais un vrai champ Word TOC (qui demanderait "Mettre à jour les champs" côté utilisateur).
//  - Polices : jamais embarquées (contrairement au PDF) - Word résout "Roboto"/"Arial"... sur les polices RÉELLEMENT installées chez le lecteur, avec repli
//    silencieux si absentes. Comportement normal d'un document éditable, pas un bug.
// En échange, DOCX offre nativement des choses que pdf-export.js doit simuler : vraies notes de bas de page, vrais champs numéro de page/nombre de pages,
// vrai style "Titre 1..6" (repris par le volet de navigation Word).
const DocxExport = (function () {
  // Chargement paresseux (comme ensurePdfLibsLoaded) : évite ~1.1 Mo au premier chargement du widget pour une fonctionnalité pas toujours utilisée.
  // `docx` n'est pas sur cdnjs (vérifié) - jsDelivr sert le fichier tel que publié sur npm (dist/index.iife.js, PAS ...iife.min.js qui est reminifié à la
  // volée par jsDelivr et donc incompatible avec un SRI stable, cf. leur propre avertissement). Recalculer l'integrity si la version change :
  // `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
  const DOCX_LIB = { src: 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', integrity: 'sha384-9OH56uLhIvkZkwF0jWNlfpcK3gPuSy5DfEMNqKe156wCpkND+MDdtaRyd05kwpG0' };
  let docxLibPromise = null;
  async function ensureDocxLibLoaded() {
    if (!docxLibPromise) docxLibPromise = ExportCommon.loadScriptOnce(DOCX_LIB).catch(e => { docxLibPromise = null; throw e; });
    return docxLibPromise;
  }

  // 1 twip = 1/20 pt = 1/1440 pouce. Page A4 + marges alignées sur PAGE_MARGIN_PT de pdf-export.js (28pt = 560 twips) - pas une obligation technique, juste
  // une cohérence visuelle bienvenue entre les deux exports.
  const TWIPS_PER_PT = 20;
  // La bande que le PDF réserve à un en-tête (sous la marge du haut) ou à un pied (au-dessus de la marge du bas) dès qu'il a du contenu : 60 px de zone (HF_MAX_ZONE_HEIGHT_PT)
  // plus 10 pt d'écart (HEADER_FOOTER_GAP_PT), js/pdf-export.js - 55 pt, quelle que soit la hauteur réelle du texte. Word reçoit les mêmes marges : ce que l'éditeur, la Lecture
  // et le PDF dessinent à la marge + 55 pt du bord de la feuille, il le dessine aussi. L'en-tête est posé à la moitié de la marge du haut du bord de la feuille (marginTopPt * 0.5
  // du PDF) ; le pied, que Word ancre par son BAS, à la distance qui met son HAUT sous le texte, là où le PDF l'ancre (cf. buildDocxDocument).
  const HF_BAND_TWIP = (60 * 0.75 + 10) * TWIPS_PER_PT;
  // Marges de page (twip) - variables de module plutôt que des constantes : réglées par setPageMarginsTwip() une fois par export, à partir des marges du
  // modèle courant (js/page-layout.js). 28pt (560 twip) sur les 4 côtés = comportement d'avant PageLayout, repli si l'appelant ne fournit aucune marge.
  let marginTopTwip = 560, marginRightTwip = 560, marginBottomTwip = 560, marginLeftTwip = 560;
  // Bande réservée au-dessus du corps par un en-tête (0 sans en-tête), posée par buildDocxDocument avant de construire les blocs : l'ancrage d'une image en calque la compte.
  let topBandTwip = 0;
  // Page courante : A4 portrait (11906 x 16838 twips) par défaut, au format et dans le sens que PageLayout.getMarginsTwip() joint aux marges. Les dimensions
  // viennent de PageLayout.pageSizeTwipFor, toujours rendues dans le sens de la page (largeur 16838 en A4 paysage) - buildDocxDocument les redonne à docx.js
  // en portrait + drapeau d'orientation, car docx.js échange lui-même largeur et hauteur dès qu'il voit LANDSCAPE.
  let pageOrientation = 'portrait';
  let pageFormat = 'A4';
  let pageWidthTwip = 11906;
  let CONTENT_WIDTH_TWIP = pageWidthTwip - marginLeftTwip - marginRightTwip;
  // Filigrane du modèle (PageLayout.normalizeWatermark) : il voyage avec les marges comme le sens et le format, absent = aucun. Posé dans l'en-tête par buildDocxDocument.
  let pageWatermark = null;

  function setPageMarginsTwip(marginsTwip) {
    const m = marginsTwip || {};
    marginTopTwip = Number.isFinite(m.top) ? m.top : 560;
    marginRightTwip = Number.isFinite(m.right) ? m.right : 560;
    marginBottomTwip = Number.isFinite(m.bottom) ? m.bottom : 560;
    marginLeftTwip = Number.isFinite(m.left) ? m.left : 560;
    pageOrientation = m.orientation === 'landscape' ? 'landscape' : 'portrait';
    pageFormat = PageLayout.normalizeFormat(m.format);
    pageWidthTwip = PageLayout.pageSizeTwipFor(pageOrientation, pageFormat).width;
    CONTENT_WIDTH_TWIP = pageWidthTwip - marginLeftTwip - marginRightTwip;
    pageWatermark = PageLayout.normalizeWatermark(m.watermark);
  }
  const DEFAULT_HALF_PT = 21; // 10.5pt - doit correspondre à DEFAULT_FONT_SIZE, js/pdf-export.js
  // *2 (demi-points) des mêmes tailles que HEADING_SIZES, js/pdf-export.js - `heading:` (style Word natif) fixe déjà une taille par défaut, mais on la
  // resurcharge pour rester visuellement identique à l'éditeur/PDF plutôt que de dépendre du thème Word de l'utilisateur.
  const HEADING_HALF_PT = { H1: 48, H2: 40, H3: 32, H4: 28, H5: 26, H6: 24 };
  const HEADING_LEVEL = { H1: 'HEADING_1', H2: 'HEADING_2', H3: 'HEADING_3', H4: 'HEADING_4', H5: 'HEADING_5', H6: 'HEADING_6' };
  const INDENT_STEP_TWIP = 360; // ~0.25" par niveau de liste imbriquée, valeur par défaut standard Word.
  const BULLET_MARKERS = { disc: '• ', circle: '○ ', square: '▪ ' }; // vrais glyphes Unicode : contrairement à pdfmake (WinAnsi seul), les polices Word les rendent nativement.
  const EMU_PER_PT = 12700; // 1pt = 1/72in, 1in = 914400 EMU (unité native des positions/tailles de dessin OOXML) => 914400/72.
  // .tiptap { line-height: 1.42 } (css/editor-v2.css) - même ratio que EDITOR_LINE_HEIGHT_RATIO, js/pdf-export.js. w:spacing/@line s'exprime en 240èmes de
  // ligne quand lineRule="auto" (240 = interligne simple) : posé sur chaque paragraphe généré pour que les sauts de ligne à l'intérieur d'un paragraphe qui
  // wrap correspondent à l'éditeur, au lieu de l'interligne par défaut du style Word "Normal".
  const EDITOR_LINE_HEIGHT_RATIO = 1.42;
  const LINE_SPACING_240THS = Math.round(240 * EDITOR_LINE_HEIGHT_RATIO);
  // Lien : #0563C1 (bleu de lien de Word) et soulignement, comme `.tiptap a` (css/editor-v2.css). Bloc de code : Courier New 9,5pt (Cousine, de même métrique, dans le PDF), fond gris et filet
  // fin comme `.tiptap pre` ; interligne de 1.42 rapporté au rapport naturel de la police (≈1.1328), Word multipliant la hauteur propre de la police et non la taille du corps.
  const LINK_COLOR_HEX = '0563C1';
  const CODE_FONT = 'Courier New';
  const CODE_HALF_PT = 19;
  const CODE_TEXT_HEX = '1B2430';
  const CODE_FILL_HEX = 'F6F8FA';
  const CODE_BOX_HEX = 'D0D7DE';
  const CODE_LINE_240THS = Math.round(240 * EDITOR_LINE_HEIGHT_RATIO / 1.1328);

  // Couleur CSS -> « RRGGBB » (majuscules), la seule forme que docx.js accepte pour w:color et w:shd : toute autre chaîne lève « Invalid hex value » et fait échouer l'export ENTIER. Un texte
  // collé de Word ou d'une page web garde ses couleurs NOMMÉES (« black », « red » : le navigateur ne les réécrit pas en rgb()), et « #f00 », « rgb(100%, 0%, 0%) » ou « hsl(...) » sont
  // aussi des couleurs valides. C'est donc le navigateur qui lit la valeur, par le fillStyle d'un canevas (rend « #rrggbb », ou « rgba(r, g, b, a) » sous 100 % d'opacité). null quand ce
  // n'est pas une couleur ou qu'elle est transparente : l'appelant garde alors la couleur héritée, jamais d'exception.
  const cssColorHexCache = new Map();
  let colorProbeContext;
  function resolveCssColorHex(v) {
    if (colorProbeContext === undefined) colorProbeContext = document.createElement('canvas').getContext('2d');
    const ctx = colorProbeContext;
    if (!ctx) return null;
    // fillStyle ignore sans rien dire une valeur qui n'est pas une couleur : deux amorces distinctes séparent « illisible » (l'amorce revient telle quelle) d'une couleur qui vaut l'amorce.
    ctx.fillStyle = '#000000'; ctx.fillStyle = v; const onBlack = String(ctx.fillStyle);
    ctx.fillStyle = '#ffffff'; ctx.fillStyle = v; const onWhite = String(ctx.fillStyle);
    if (onBlack !== onWhite) return null;
    const opaque = onBlack.match(/^#([0-9a-f]{6})$/);
    if (opaque) return opaque[1].toUpperCase();
    const translucent = onBlack.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
    if (!translucent || !(parseFloat(translucent[4]) > 0)) return null;
    return translucent.slice(1, 4).map(n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function cssColorHex(value) {
    const v = String(value == null ? '' : value).trim().toLowerCase();
    if (!v || /^(transparent|inherit|initial|unset|revert|currentcolor)$/.test(v)) return null;
    if (!cssColorHexCache.has(v)) cssColorHexCache.set(v, resolveCssColorHex(v));
    return cssColorHexCache.get(v);
  }
  function cssHalfPt(value, fallback) {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    const pt = value && String(value).endsWith('px') ? n * 72 / 96 : n;
    return Math.round(Math.max(6, Math.min(72, pt)) * 2);
  }

  // Même point de passage que inheritedStyle (js/pdf-export.js), adapté à la forme attendue par docx.TextRun. Le sous-ensemble de formats reconnus est
  // volontairement identique (pas de sup/sub générique : l'éditeur V2/TipTap n'a pas de bouton pour ça hors note de bas de page, gérée à part).
  function inheritedRunStyle(node, parent) {
    const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const tag = node.nodeType === 1 ? node.tagName : '';
    const out = Object.assign({}, parent);
    // 'auto' (pas de couleur explicite dans le HTML) plutôt que de laisser le style Word natif "Titre N" imposer SA propre couleur par défaut (accent du
    // thème, souvent bleu) - un titre de l'éditeur n'a pas de couleur particulière, il hérite du même noir que le corps du texte (.tiptap { color:... }).
    // `css('color')` juste en dessous garde la priorité si le titre a explicitement une couleur choisie par l'utilisateur.
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.size = HEADING_HALF_PT[tag]; out.color = 'auto'; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') out.underline = { type: 'single' };
    // Lien : couleur et soulignement de lien ; la couleur d'un <span> posé DEDANS (css('color') plus bas) l'emporte, comme `.tiptap a` face à un texte coloré.
    if (tag === 'A' && HtmlSanitize.safeLinkHref(node.getAttribute('href'))) { out.color = LINK_COLOR_HEX; out.underline = { type: 'single' }; }
    if (tag === 'PRE') { out.font = CODE_FONT; out.size = CODE_HALF_PT; out.color = CODE_TEXT_HEX; }
    // Légende (js/caption.js) : un paragraphe `data-caption` est en petit, italique, gris - la base de ses runs ; la taille ou la couleur d'un <span> posé dedans l'emportent plus bas, comme dans l'éditeur.
    if (tag === 'P' && node.hasAttribute('data-caption')) { out.italics = true; out.size = Math.round(Caption.SIZE_PT * 2); out.color = Caption.COLOR.replace('#', '').toUpperCase(); }
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out.strike = true;
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
    return out;
  }
  function runOpts(style) {
    const opts = { size: style.size || DEFAULT_HALF_PT };
    if (style.bold) opts.bold = true;
    if (style.italics) opts.italics = true;
    if (style.underline) opts.underline = style.underline;
    if (style.strike) opts.strike = true;
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

  // pdfmake (js/pdf-export.js:rasterizeDataUri) doit rastériser en PNG car il n'accepte que PNG/JPEG ; docx.ImageRun accepte aussi GIF/BMP mais ni WEBP ni
  // SVG - même filet de sécurité ici : décodée dans un <canvas> puis réencodée en PNG si le type d'origine n'est pas directement supporté.
  const DOCX_IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
  function rasterizeToPngBlob(objectUrlOrDataUri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob a échoué'))), 'image/png');
      };
      img.onerror = () => reject(new Error('Échec de décodage de l’image pour rastérisation'));
      img.src = objectUrlOrDataUri;
    });
  }
  async function docxImageDataFrom(img) {
    const src = img.getAttribute('src') || '';
    if (!src) return null;
    let blob;
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      blob = await resp.blob();
    } catch (e) { console.warn('[DocxExport] image ignorée (téléchargement impossible) :', src, e); return null; }
    let type = DOCX_IMAGE_TYPES[blob.type];
    if (!type) {
      try { blob = await rasterizeToPngBlob(URL.createObjectURL(blob)); type = 'png'; }
      catch (e) { console.warn('[DocxExport] image ignorée (rastérisation impossible) :', src, e); return null; }
    }
    const data = await blob.arrayBuffer();
    // Largeur déjà posée par l'éditeur (même convention que pdfImageFromNode, js/pdf-export.js) ; hauteur déduite du ratio intrinsèque réel (docx exige les
    // deux dimensions, contrairement à pdfmake qui sait déduire la hauteur d'une largeur seule). Une image dans le texte est ramenée à la largeur de ce qui la
    // contient, comme dans l'éditeur (ExportCommon.shownImageWidthPx) ; une image en calque garde sa taille réglée.
    const styleWidthPx = parseFloat(img.style.width) || 320;
    const layer = img.getAttribute('data-layer');
    const widthPx = (layer === 'front' || layer === 'behind') ? styleWidthPx : ExportCommon.shownImageWidthPx(img, styleWidthPx);
    const ratio = await new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => resolve((probe.naturalHeight && probe.naturalWidth) ? probe.naturalHeight / probe.naturalWidth : 0.75);
      probe.onerror = () => resolve(0.75);
      probe.src = URL.createObjectURL(blob);
    });
    return { data, type, width: Math.round(widthPx), height: Math.max(1, Math.round(widthPx * ratio)) };
  }

  // Image "en calque" (devant/derrière le texte, cf. js/editor-nodes.js) : construit l'ancrage flottant Word natif (wp:anchor, positionné PAGE de bord à
  // bord). Deux sources de position, par ordre de préférence :
  //  1. La position "grille page" déjà capturée dans l'éditeur (Aperçu A4) - même donnée que js/pdf-export.js:_pageGrid, lue ici directement depuis les
  //     attributs DOM plutôt que reconstruite. La plus fiable : connue explicitement, aucune mesure à refaire.
  //  2. À défaut (jamais positionnée via l'Aperçu A4, ex. `left`/`top` posés à la main sur un document plus ancien - cas réel rencontré), mesure DIRECTE
  //     du rendu réel : `imgNode` est encore attaché au host de mesure (cf. attachMeasureHost/buildDocxDocument) au moment de cet appel, donc
  //     getBoundingClientRect() donne sa position vraie par rapport au coin du contenu - MÊME dans un contexte imbriqué (colonne/cellule), sans ancrage/
  //     bracketing textuel à reconstruire. Repose sur `ctx.measureRoot` (posé une fois par buildDocxDocument) plutôt que `imgNode.style.left/top`
  //     brut, qui ne serait juste que pour une image directement enfant de la racine (pas dans une colonne/cellule).
  //     Limite assumée : suppose l'image proche du haut de la 1ère page (cas dominant en pratique - logo/tampon d'en-tête) puisque rien ici ne fait de
  //     pagination réelle ; plus bas dans un document qui reflow, l'ancrage ne suivra pas parfaitement - même compromis inhérent au flottant DOCX que la
  //     voie 1, jamais pire que le repli en image en ligne (qui perdait la position purement et simplement).
  // `null` uniquement si l'image n'est pas en calque, ou en calque sans AUCUNE des deux sources disponible (image détachée du DOM, cas qui ne devrait pas
  // arriver ici) : repli sur l'image en ligne classique dans ce cas.
  // marge + bande + décalage = même formule que p.image.absolutePosition, js/pdf-export.js : la position est relative au CONTENU (dans les marges, bande d'en-tête
  // comprise), pas au bord brut de la page - il faut donc rajouter la marge et la bande avant de convertir en EMU pour un ancrage Word relatif à la PAGE.
  // Alignement gauche/droite (data-align, cf. css/editor-v2.css `.tiptap img.editor-image[data-align="left/right"] { float }`) : HABILLAGE réel, le texte
  // contourne l'image des DEUX côtés d'un même paragraphe - un cas totalement différent du calque (qui ne touche jamais le texte). 'center' n'en a pas
  // besoin (déjà un simple bloc centré, aucun flottant nécessaire). Pas de position à mesurer/capturer ici : `align` (jeton, pas une coordonnée) suffit à
  // Word pour recréer le même flottement - la seule inconnue est de quel côté le texte doit continuer à couler (wrap.side, opposé au bord d'alignement).
  // Ancré relatif à la marge de PAGE (pas "column") : correct pour un paragraphe du corps principal (le seul cas rencontré/rapporté) ; une image alignée
  // À L'INTÉRIEUR d'une colonne 2-colonnes ou d'une cellule de tableau s'ancrerait quand même à la marge de la PAGE entière - limite connue, non traitée
  // ici (Word n'ancre pas nativement un flottant relatif à une cellule de tableau).
  // verticalPosition relatif au PARAGRAPHE (pas à la LIGNE, essayé puis abandonné - vérifié dans un vrai .docx ouvert dans Google Docs : relativeFrom
  // ="line" n'y est pas respecté, l'image restait plaquée en haut du paragraphe entier). "paragraph" est universellement supporté ; pour qu'il tombe
  // pile à la bonne hauteur même quand l'image est insérée après plusieurs lignes de texte, paragraphBlockFrom DÉCOUPE le paragraphe HTML en plusieurs
  // paragraphes Word au point d'insertion de l'image (cf. splitRunsAtFloatedImages/__docxSplitBefore) - "haut du paragraphe" tombe alors exactement là où
  // l'image apparaît dans le texte, sans dépendre du support de "line" par le lecteur.
  // Marges d'habillage = celles de l'éditeur (`float` : 12 px côté texte, 8 px dessous, css/editor-v2.css), soit 9 pt et 6 pt : docx.js les écrit sur le <wp:anchor> et le <wp:wrapSquare> (EMU). Sans elles
  // le texte touchait l'image, 9 pt plus près que dans l'éditeur (Antoine, 02/10, point 9).
  const WRAP_TEXT_SIDE_EMU = 9 * EMU_PER_PT;
  const WRAP_BELOW_EMU = 6 * EMU_PER_PT;
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
      zIndex: 1000 + uniqueId, // unique par image, comme altText.id ci-dessus - évite de dépendre du repli par défaut de docx.js (hauteur de l'image).
      horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.PAGE, offset: xEmu },
      verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PAGE, offset: yEmu },
    };
  }

  // Équivalent de inlineRuns (js/pdf-export.js), en composants docx (TextRun/ImageRun/FootnoteReferenceRun) au lieu de "runs" pdfmake. Asynchrone (une image
  // a besoin d'être téléchargée) - parcours séquentiel, largement suffisant vu le nombre d'images réaliste dans un document de publipostage.
  async function inlineNodesFrom(node, parentStyle, ctx) {
    const style = inheritedRunStyle(node, parentStyle);
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [new docx.TextRun(Object.assign({ text: node.nodeValue }, runOpts(style)))] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.classList.contains('page-break-marker')) return [];
    if (node.classList.contains('heading-numbering-config') || node.classList.contains('toc-marker')) return [];
    // .var-badge/.smart-chip : ne devraient jamais apparaître ici (ReaderMode.preview les résout déjà en <span class="resolved-var">/texte simple) - gardés
    // par robustesse, même esprit que pdf-export.js.
    // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : le caractère ☑ / ☐ en « Segoe UI Symbol » (Word, Google Docs et LibreOffice en prennent une autre si elle manque), dans la
    // couleur de la case (style en ligne, déjà lu par inheritedRunStyle) et jamais barré : le barré d'une case d'accent cochée vise le texte qui la suit.
    if (node.classList.contains('resolved-checkbox')) {
      return [new docx.TextRun(Object.assign({ text: node.textContent }, runOpts(Object.assign({}, style, { strike: false, font: 'Segoe UI Symbol' }))))];
    }
    // Une valeur qui porte une case (« ☑, ☐ » d'une liste de valeurs) passe par ses enfants, case par case.
    if (node.classList.contains('var-badge') || (node.classList.contains('resolved-var') && !node.querySelector('.resolved-checkbox')) || node.classList.contains('smart-chip')) {
      return node.textContent ? [new docx.TextRun(Object.assign({ text: node.textContent }, runOpts(style)))] : [];
    }
    if (node.classList.contains('page-number-badge')) {
      const format = node.getAttribute('data-format') || 'n';
      const opts = runOpts(style);
      const current = new docx.TextRun(Object.assign({ children: [docx.PageNumber.CURRENT] }, opts));
      if (format === 'page-n') return [new docx.TextRun(Object.assign({ text: 'Page ' }, opts)), current];
      if (format === 'n-slash-total') return [current, new docx.TextRun(Object.assign({ text: '/' }, opts)), new docx.TextRun(Object.assign({ children: [docx.PageNumber.TOTAL_PAGES] }, opts))];
      return [current];
    }
    if (node.classList.contains('footnote-ref-marker')) {
      ctx.footnoteCounter += 1;
      const id = ctx.footnoteCounter;
      ctx.footnotes[String(id)] = { children: [new docx.Paragraph({ children: [new docx.TextRun(node.getAttribute('data-note-text') || '')] })] };
      return [new docx.FootnoteReferenceRun(id)];
    }
    if (node.tagName === 'IMG') {
      if (node.hasAttribute('data-pdf-skip')) return [];
      // « Sur toutes les pages » (js/page-layer.js) : ancrée dans l'en-tête de chaque page (buildDocxDocument), pas dans le paragraphe qui la porte.
      if (PageLayer.isRepeatedEl(node)) return [];
      const imgData = await docxImageDataFrom(node);
      if (!imgData) return [];
      // docx.js régénère un compteur wp:docPr/id FRAIS (démarrant à 1) à chaque ImageRun plutôt que d'en partager un seul pour tout le document (bug de la
      // librairie, vérifié dans son propre bundle) : sans id explicite ici, deux images obtiennent toutes les deux id="1", ce que Word refuse d'ouvrir sans
      // le signaler comme contenu illisible. altText.id fournit un id unique par image du document.
      ctx.imageIdCounter += 1;
      const runOptions = { type: imgData.type, data: imgData.data, transformation: { width: imgData.width, height: imgData.height }, altText: { id: ctx.imageIdCounter, name: '', description: '', title: '' } };
      const floatingOptions = docxFloatingOptionsFrom(node, ctx.imageIdCounter, ctx);
      if (floatingOptions) runOptions.floating = floatingOptions;
      const imgRun = new docx.ImageRun(runOptions);
      // Marque ce run pour paragraphBlockFrom : cf. splitRunsAtFloatedImages ci-dessous (Google Docs ne respecte pas relativeFrom="line", d'où le
      // découpage en paragraphes Word plutôt qu'un ancrage à la ligne).
      if (floatingOptions && floatingOptions.__isAlignFloat) imgRun.__docxSplitBefore = true;
      // data-align="center" : PAS un flottant (le texte ne contourne rien), mais l'image doit quand même être CENTRÉE - `.editor-image[data-align="center"]`
      // vaut `display:block; margin:auto` dans l'éditeur ET dans le mode Lecture (css/style.css), et l'export PDF pose `alignment:'center'` sur le bloc image
      // (js/pdf-export.js:pdfImageFromNode). Sans ce marqueur, DOCX était le seul des trois à la laisser collée à gauche : `alignment` est une propriété de
      // PARAGRAPHE en OOXML (w:jc), pas de run, donc l'image doit occuper son propre <w:p> centré - ce que splitRunsAtFloatedImages fait ci-dessous.
      if (!floatingOptions && node.getAttribute('data-align') === 'center') imgRun.__docxCenterBlock = true;
      // « Bloc » sans alignement (barre de l'image, « Basculer en ligne / bloc ») : seule sur sa ligne, À GAUCHE - `.editor-image-view[data-wrap="block"] { display: block; width: fit-content }` dans l'éditeur, le texte d'avant finit sa
      // ligne et celui d'après repart dessous (Antoine, 02/10, point 10 : « La rendre fidèle »). Même raison que le centre : l'alignement est une propriété du PARAGRAPHE, l'image prend donc son propre <w:p>, aligné à gauche
      // (un paragraphe centré ou justifié ne la déplace pas : un bloc ne suit pas le text-align de son parent).
      if (!floatingOptions && !node.getAttribute('data-align') && node.getAttribute('data-wrap') === 'block') imgRun.__docxBlock = true;
      return [imgRun];
    }
    if (node.tagName === 'BR') return [new docx.TextRun({ break: 1 })];
    // Bloc de code au milieu d'un autre bloc (dans une citation, un item de liste) : ses lignes se suivent par des sauts de ligne ; le cadre gris n'existe que pour un bloc de code
    // posé directement dans le document, une cellule, une colonne ou un en-tête (codeBlockFrom).
    if (node.tagName === 'PRE') return ExportCommon.codeLinesOf(node).map((line, i) => new docx.TextRun(Object.assign({ text: line }, runOpts(style), i ? { break: 1 } : {})));
    let out = [];
    let sawLineBlock = false;
    for (const child of Array.from(node.childNodes)) {
      // Comme inlineRuns (js/pdf-export.js) : un paragraphe, un titre ou un bloc de code qui en suit un autre dans le même bloc (citation de deux paragraphes, item de liste suivi d'un
      // bloc de code) commence sa propre ligne.
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) out.push(new docx.TextRun({ break: 1 }));
      if (isLineBlock) sawLineBlock = true;
      out = out.concat(await inlineNodesFrom(child, style, ctx));
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
  // Comme inlineNodesFrom, mais ignore les <ul>/<ol> DIRECTS - une sous-liste doit produire SES PROPRES paragraphes (cf. listBlocksFrom), pas être aplatie
  // dans le texte de son <li> parent. Même rôle que inlineRunsExcludingNestedLists, js/pdf-export.js.
  async function inlineNodesExcludingNestedLists(node, parentStyle, ctx) {
    const style = inheritedRunStyle(node, parentStyle);
    let out = [];
    let sawLineBlock = false;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) continue;
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) out.push(new docx.TextRun({ break: 1 }));
      if (isLineBlock) sawLineBlock = true;
      out = out.concat(await inlineNodesFrom(child, style, ctx));
    }
    return out;
  }

  // Numérotation Word native (numbering.xml) : CHAQUE <ul>/<ol> du document reçoit sa PROPRE référence dédiée (jamais partagée, même entre deux listes du
  // même style) - un seul niveau (0) suffit alors par référence, l'indentation visuelle des niveaux imbriqués étant déjà posée par ailleurs via `depth`
  // (une sous-liste = une autre référence, tout aussi indépendante). Ça évite tout le problème classique "instance"/redémarrage de compteur de
  // numbering.xml : chaque référence démarre naturellement à 1 (ou `start`) puisqu'elle n'est jamais réutilisée ailleurs dans le document.
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
  // Reflète taskListRuns, js/pdf-export.js : un item coché barre son texte (gris), sauf pour les styles 'classic'/'accentPlain' (case cochée, texte normal).
  function taskItemBaseStyle(li) {
    const checked = li.getAttribute('data-checked') === 'true';
    const style = (li.parentElement && li.parentElement.getAttribute('data-tasklist-style')) || 'accentStrike';
    if (!checked || style === 'classic' || style === 'accentPlain') return { size: DEFAULT_HALF_PT };
    return { size: DEFAULT_HALF_PT, strike: true, color: '667085' }; // le gris de la Lecture (--paper-text-faint, 4,97:1 sur blanc) ; c'était 98A2B3, 2,6:1
  }

  // Une <li> -> un Paragraph (marqueur natif Word `numbering:` OU, pour une case à cocher, marqueur littéral + son propre contenu inline sans les
  // sous-listes) ; une sous-liste imbriquée directe -> ses propres paragraphes juste après, indentés un cran de plus. Aplati dans le même ordre que
  // l'affichage (comme collectCellLines, js/pdf-export.js), pas de vraie imbrication Word (non nécessaire ici - cf. commentaire d'en-tête sur les listes).
  async function listBlocksFrom(listEl, depth, ctx, pageBreakBefore) {
    const items = Array.from(listEl.children).filter(c => c.tagName === 'LI');
    const isTask = listEl.getAttribute('data-type') === 'taskList';
    const numberingRef = isTask ? null : registerListNumbering(listEl, depth, ctx);
    let blocks = [];
    for (const [i, li] of items.entries()) {
      const baseStyle = isTask ? taskItemBaseStyle(li) : { size: DEFAULT_HALF_PT };
      const runs = await inlineNodesExcludingNestedLists(li, baseStyle, ctx);
      const align = paragraphAlignment(li);
      const opts = {
        alignment: align,
        // after:0 - `.tiptap li` n'a aucune marge propre (seuls ul/ol sont resetés à 0, cf. css/editor-v2.css ; li hérite de ce 0). line/lineRule :
        // même interligne que l'éditeur à l'intérieur d'un item qui wrap sur plusieurs lignes, cf. LINE_SPACING_240THS ci-dessus.
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
      for (const sub of nested) blocks = blocks.concat(await listBlocksFrom(sub, depth + 1, ctx));
    }
    return blocks;
  }

  const PX_TO_TWIP = 15; // 1440 twips/pouce ÷ 96px/pouce
  const GAP_PX = 16; // gouttière entre les 2 colonnes d'une zone twoColumnsZone - même valeur que PageLayout.COLUMN_GAP_PX (`gap: 16px`, css/editor-v2.css)
  const MM_TO_TWIP = 1440 / 25.4; // même conversion que PageLayout.MM_TO_TWIP, js/page-layout.js (pas de dépendance croisée, simple constante dupliquée)
  // Plancher de chaque colonne d'une zone 2-colonnes : 10 mm, comme la saisie en mm de js/editor-nodes.js (commitMm) et le plancher CSS de css/editor-v2.css.
  const MIN_ZONE_COLUMN_TWIP = Math.round(10 * MM_TO_TWIP);
  // Repli si le tableau n'est pas dans le DOM attaché au moment de l'appel (ex. zone en-tête/pied - hors périmètre de la mesure, cf. buildDocxDocument) :
  // répartition à parts égales, exactement comme la V1.
  function equalColumnWidthsTwip(columnCount) { return new Array(columnCount).fill(Math.floor(CONTENT_WIDTH_TWIP / columnCount)); }
  // Table réelle du document (pas l'émulation 2-colonnes, cf. twoColumnsBlockFrom). Largeurs mesurées sur le rendu réel (comme pdf-export.js), avec une
  // marge de cellule Word par défaut (2×108 twips, jamais incluse dans une mesure de CONTENU) rajoutée pour que la largeur totale demandée à Word colle à
  // ce qui a été mesuré.
  const WORD_DEFAULT_CELL_MARGIN_TWIP = 216;
  // Fond d'une cellule : celui de son style en ligne, comme le PDF (js/pdf-export.js) - le fond calculé suivrait le thème sombre de l'éditeur. Pas de fond, ou transparent : pas de <w:shd>.
  function cellShadingFrom(cell) {
    const fill = cell.style.backgroundColor && cssColorHex(cell.style.backgroundColor);
    return fill ? { type: docx.ShadingType.CLEAR, fill, color: 'auto' } : undefined;
  }
  // `keepWithCaption` : une légende suit le tableau (js/caption.js, « Rester ensemble » : jamais seule en haut de la page suivante). Word garde une ligne avec le paragraphe qui la suit quand
  // les paragraphes de ses cases portent « Conserver avec le suivant » : la dernière ligne d'un tableau qui se coupe entre deux lignes (js/table-page-cut.js), toutes les lignes sinon, comme
  // l'éditeur et le PDF qui passent alors le tableau entier. Word laisse tomber le lien quand la suite dépasse une page.
  async function tableBlockFrom(tableEl, ctx, keepWithCaption) {
    const rows = Array.from(tableEl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr'));
    if (!rows.length) return null;
    const cutRows = keepWithCaption ? TablePageCut.rowsOf(tableEl) : null;
    const keptRows = keepWithCaption ? (cutRows && cutRows.length === rows.length ? [rows[rows.length - 1]] : rows) : [];
    const firstRowCells = Array.from(rows[0].children).filter(c => /^(TD|TH)$/i.test(c.tagName));
    const columnCount = firstRowCells.reduce((sum, c) => sum + (parseInt(c.getAttribute('colspan') || '1', 10) || 1), 0) || 1;
    // Repli à parts égales si le tableau n'est pas attaché au document (ex. zone en-tête/pied, hors périmètre de la mesure, cf. buildDocxDocument) : aucun rendu à mesurer.
    const measuredPx = tableEl.isConnected ? ExportCommon.measuredColumnWidthsPx(tableEl, columnCount) : null;
    const colWidthsTwip = (measuredPx && measuredPx.every(w => w > 0))
      ? measuredPx.map(px => Math.max(200, Math.round(px * PX_TO_TWIP) + WORD_DEFAULT_CELL_MARGIN_TWIP))
      : equalColumnWidthsTwip(columnCount);
    const tableRows = [];
    for (const tr of rows) {
      const cells = Array.from(tr.children).filter(c => /^(TD|TH)$/i.test(c.tagName));
      const tableCells = [];
      let colIndex = 0;
      for (const cell of cells) {
        const span = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
        const rowSpan = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
        const width = colWidthsTwip.slice(colIndex, colIndex + span).reduce((a, b) => a + b, 0) || Math.floor(CONTENT_WIDTH_TWIP / columnCount);
        colIndex += span;
        const children = await blocksFromContainer(cell, ctx, false, Math.max(200, width - WORD_DEFAULT_CELL_MARGIN_TWIP), keptRows.includes(tr));
        tableCells.push(new docx.TableCell({
          children: children.length ? children : [new docx.Paragraph('')],
          width: { size: width, type: docx.WidthType.DXA },
          columnSpan: span > 1 ? span : undefined,
          rowSpan: rowSpan > 1 ? rowSpan : undefined,
          shading: cellShadingFrom(cell),
        }));
      }
      // cantSplit : une ligne ne se coupe pas entre deux pages, elle passe en entier à la suivante (comme dans l'éditeur, la Lecture et le PDF, js/table-page-cut.js). Word
      // la coupe quand même si elle est plus haute que la page.
      tableRows.push(new docx.TableRow({ children: tableCells, cantSplit: true }));
    }
    // columnWidths pilote le <w:tblGrid> (déclaration structurelle des colonnes) - SANS lui, docx.js retombe sur son propre défaut interne
    // (100 twips/colonne, vérifié dans son bundle), incohérent avec les largeurs réelles posées ci-dessus sur chaque TableCell.width. Un <w:tblGrid> qui ne
    // correspond pas aux tcW réels est un tableau non conforme (Word peut le signaler comme contenu à réparer).
    return new docx.Table({ rows: tableRows, width: { size: CONTENT_WIDTH_TWIP, type: docx.WidthType.DXA }, columnWidths: colWidthsTwip });
  }

  const NO_BORDER = { style: 'none', size: 0, color: 'FFFFFF' };
  const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  // Émulation par tableau borderless 1 ligne/2 cellules (même principe que le "table trick" utilisé par la plupart des générateurs DOCX pour simuler des
  // colonnes - Word n'a pas de notion de "section de 2 colonnes locale à un bloc", seulement des colonnes de SECTION entière). Largeurs lues depuis
  // --layout-left (variable CSS posée par TipTap, cf. js/editor-nodes.js), pas mesurées : pas de mise en page réelle en dehors du navigateur ici.
  // --layout-left-mm (posé UNIQUEMENT quand la colonne a été réglée en mm, cf. js/editor-nodes.js:renderHTML) prime sur le pourcentage quand présent :
  // conversion directe, exacte, sans repasser par un pourcentage déjà arrondi.
  async function twoColumnsBlockFrom(zoneEl, ctx) {
    const cols = Array.from(zoneEl.querySelectorAll(':scope > .two-columns-column'));
    if (cols.length !== 2) return null;
    const leftMm = parseFloat(zoneEl.style.getPropertyValue('--layout-left-mm'));
    let leftTwip;
    if (Number.isFinite(leftMm)) {
      leftTwip = Math.round(leftMm * MM_TO_TWIP);
    } else {
      const leftPercent = parseFloat(zoneEl.style.getPropertyValue('--layout-left')) || 50;
      leftTwip = Math.round(CONTENT_WIDTH_TWIP * leftPercent / 100);
    }
    // Colonne SÉPARATRICE, vide et sans bordure, à la largeur exacte de la gouttière CSS (`gap: 16px`, css/editor-v2.css). Sans elle, la colonne droite
    // récupérait toute la place restante : le DOCX rendait 90mm là où l'éditeur et le PDF rendent 85.8mm, et les deux colonnes se touchaient dans Word.
    const gapTwip = Math.round(GAP_PX * PX_TO_TWIP);
    // Une largeur en mm réglée pour une page plus large (paysage, ou marges plus petites) peut dépasser la page d'aujourd'hui : la colonne droite devenait
    // NÉGATIVE et docx.js refusait l'export entier ("Invalid value '-793' ... Must be a positive integer"). Même plancher que l'écran (css/editor-v2.css) :
    // chaque colonne garde au moins 10 mm.
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
        // Word applique sinon ses marges de cellule par défaut (108 twip de chaque côté) : la largeur ANNONCÉE ne serait pas la largeur du texte, et le
        // chiffre en mm choisi par l'utilisateur redeviendrait faux d'environ 3.8mm par colonne.
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      cells.push(cell);
      if (i === 0) cells.push(new docx.TableCell({ children: [new docx.Paragraph('')], width: { size: gapTwip, type: docx.WidthType.DXA }, borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 0, right: 0 } }));
    }
    // Même correctif que tableBlockFrom : columnWidths explicite pour que <w:tblGrid> corresponde aux largeurs réelles des cellules.
    return new docx.Table({ rows: [new docx.TableRow({ children: cells })], width: { size: CONTENT_WIDTH_TWIP, type: docx.WidthType.DXA }, borders: NO_BORDERS, columnWidths: widths });
  }

  // Encadré (js/callout.js) : un tableau Word à une ligne et deux cellules - l'icône (PNG tracé d'après les mêmes dessins que le CSS) à gauche, les blocs de l'encadré à droite - avec le
  // fond teinté sur toute la ligne et, pour seul filet, une barre épaisse de la couleur d'accent à gauche. Mêmes mesures que css/callout.css (ExportCommon.calloutMetricsPx). Un paragraphe
  // de la hauteur de la marge (`margin: 6px 0`) avant et après : sans paragraphe entre eux Word fusionne deux tableaux qui se suivent, et une cellule ne peut pas se terminer par un
  // tableau. `widthTwip` : la largeur de la colonne ou de la cellule qui contient l'encadré, la page entière pour le corps du document.
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
  // Découpe un tableau de runs en groupes -> un groupe = un <w:p>. Deux marqueurs, tous deux posés par inlineNodesFrom, tous deux pour la même raison de
  // fond : `w:jc` (alignement) et `wp:anchor/verticalPosition` s'appliquent au PARAGRAPHE, jamais à un run - une image qui a besoin de son propre
  // alignement ou de son propre point d'ancrage vertical a donc besoin de son propre paragraphe.
  //  - __docxSplitBefore (image habillée gauche/droite) : ouvre un groupe, sans jamais couper en tête (une coupure avant le tout premier run ne
  //    servirait à rien) - le texte qui SUIT l'image reste avec elle, c'est lui qui doit l'habiller.
  //  - __docxCenterBlock (image centrée) : l'image est SEULE dans son groupe, centré - le texte autour d'elle garde son propre alignement, comme dans
  //    l'éditeur où `display:block` la met sur sa propre ligne sans toucher aux lignes voisines.
  //  - __docxBlock (image « bloc » sans alignement) : de même, seule dans son groupe, mais alignée à gauche.
  // Chaque groupe porte `alignment: undefined` (= garder celui du paragraphe HTML d'origine) ou une valeur qui le remplace.
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
    // `!groups.length` : un paragraphe vide (<p></p>) n'a aucun run et doit quand même produire son <w:p> - c'est lui qui fait l'espacement vertical dans
    // ce projet (aucune marge automatique, cf. spacing.after:0 ci-dessous).
    if (current.runs.length || !groups.length) groups.push(current);
    return groups;
  }
  // <p>/<div>/<h1-6> -> un ou plusieurs Paragraph (cf. splitRunsAtFloatedImages ci-dessus). Titre : marqueur littéral ("1) "...) IDENTIQUE à
  // pdf-export.js/reader-mode (cohérence entre les 3 exports) posé en texte, en PLUS du style Word natif "Titre N" (repris par le volet de navigation/un
  // futur sommaire réel si l'utilisateur en construit un dans Word).
  // `pageBreakBefore` DOIT passer par le constructeur (option native, cf. IParagraphPropertiesOptionsBase) - un Paragraph déjà construit n'est pas
  // mutable de l'extérieur.
  // `keepNext` : « Conserver avec le suivant » (w:keepNext), pour le bloc que sa légende doit suivre sur la même page (cf. keepsWithCaption).
  async function paragraphBlockFrom(node, ctx, headingMarkers, pageBreakBefore, keepNext) {
    const runs = await inlineNodesExcludingNestedLists(node, { size: DEFAULT_HALF_PT }, ctx);
    const align = paragraphAlignment(node);
    const isHeading = isHeadingTag(node.tagName);
    const marker = isHeading && headingMarkers && headingMarkers.get(node);
    // color:'auto' - même raison que inheritedRunStyle ci-dessus : ce marqueur ("1) ", "2) "...) est un TextRun à part, jamais passé par
    // inheritedRunStyle/runOpts, donc pas concerné par son propre défaut de couleur - sans ça il hériterait quand même du bleu du style Word "Titre N".
    const children = marker ? [new docx.TextRun(Object.assign({ text: marker }, isHeading ? { bold: true, size: HEADING_HALF_PT[node.tagName], color: 'auto' } : {}))].concat(runs) : runs;
    if (isHeading) ctx.headingBlocks.push({ level: parseInt(node.tagName.slice(1), 10), text: ((marker || '') + (node.textContent || '')).replace(/\s+/g, ' ').trim() });
    const groups = splitRunsAtFloatedImages(children);
    return groups.map((group, i) => {
      const groupChildren = group.runs;
      const opts = {
        children: groupChildren.length ? groupChildren : [new docx.TextRun('')],
        alignment: group.alignment !== undefined ? group.alignment : align,
        // after:0 - `.tiptap p/h1-6` n'ont aucune marge propre (margin:0, cf. css/editor-v2.css) ; l'espacement visuel vient des paragraphes vides que
        // l'utilisateur insère lui-même, jamais d'une marge automatique. line/lineRule : cf. LINE_SPACING_240THS ci-dessus.
        spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' },
        pageBreakBefore: !!(i === 0 && pageBreakBefore),
      };
      if (keepNext) opts.keepNext = true;
      if (isHeading) opts.heading = docx.HeadingLevel[HEADING_LEVEL[node.tagName]];
      if (node.tagName === 'BLOCKQUOTE') { opts.indent = { left: 400 }; opts.border = { left: { style: 'single', size: 16, color: 'CBD5E1', space: 8 } }; }
      return new docx.Paragraph(opts);
    });
  }

  // Bloc de code posé directement dans le document, une cellule, une colonne ou un en-tête : UN paragraphe par ligne de code, tous avec les MÊMES fond, bordures et retraits - Word et
  // LibreOffice les fusionnent alors en un seul cadre gris, sans filet entre deux lignes. Retraits de 7.5pt (150 twips) + filet à 7pt du texte : le cadre s'aligne sur la marge, le
  // texte est en retrait comme dans l'éditeur. Les espaces de tête sont gardés (docx.js écrit xml:space="preserve"), une ligne vide devient une ligne d'un espace.
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

  // Coeur du module : parcourt les enfants directs d'un conteneur (corps du document, cellule de tableau, colonne 2-colonnes, zone en-tête/pied - les
  // quatre partagent la MÊME logique ici, contrairement à pdf-export.js qui doit distinguer "flux pdfmake" et "cellule" à cause des contraintes de
  // pdfmake) et renvoie un tableau de Paragraph/Table, prêt à poser tel quel dans `children` (Document/TableCell/Header/Footer acceptent tous la même forme).
  // Le paragraphe est-il à garder avec le suivant ? L'image que suit une légende, et chaque légende qu'une autre légende suit (« Rester ensemble », js/caption.js). Un tableau passe par
  // tableBlockFrom (`keepWithCaption`).
  function keepsWithCaption(node) {
    if (Caption.captionsAfter(node).length) return true;
    if (!Caption.isCaptionElement(node) || !Caption.isCaptionElement(node.nextElementSibling)) return false;
    let owner = node.previousElementSibling;
    while (Caption.isCaptionElement(owner)) owner = owner.previousElementSibling;
    return Caption.carriesCaption(owner);
  }
  // `keepNext` : tous les paragraphes construits ici gardent le suivant (la dernière ligne d'un tableau que suit une légende, cf. tableBlockFrom).
  async function blocksFromContainer(container, ctx, isTopLevel, widthTwip, keepNext) {
    let headingMarkers = null;
    if (isTopLevel) {
      const config = container.querySelector(':scope > .heading-numbering-config');
      const style = (config && config.dataset.style) || 'none';
      const headingEls = Array.from(container.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
      const markers = HeadingNumbering.markersFor(headingEls, style);
      headingMarkers = new Map(headingEls.map((el, i) => [el, markers[i]]));
    }
    const blocks = [];
    let pendingPageBreak = false;
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue && node.nodeValue.trim()) blocks.push(new docx.Paragraph({ children: [new docx.TextRun(node.nodeValue)], pageBreakBefore: pendingPageBreak, keepNext: keepNext ? true : undefined }));
        pendingPageBreak = false;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; continue; }
      if (node.classList.contains('heading-numbering-config')) continue;
      // Un sommaire n'a de sens qu'au niveau racine du document (l'UI ne permet de toute façon de l'insérer que là) - ignoré silencieusement s'il apparaît
      // dans une cellule/colonne imbriquée plutôt que de laisser fuiter un objet-placeholder non résolu dans un Table/TableCell (crash à la sérialisation).
      if (node.classList.contains('toc-marker')) { if (isTopLevel) blocks.push({ __tocPlaceholder: true }); continue; }
      if (node.classList.contains('two-columns-zone')) {
        const block = await twoColumnsBlockFrom(node, ctx);
        if (block) blocks.push(block);
        pendingPageBreak = false;
        continue;
      }
      if (node.classList.contains('callout')) {
        blocks.push(...await calloutBlocksFrom(node, ctx, widthTwip, pendingPageBreak));
        pendingPageBreak = false;
        continue;
      }
      if (node.tagName === 'TABLE') {
        const block = await tableBlockFrom(node, ctx, isTopLevel && Caption.captionsAfter(node).length > 0);
        if (block) blocks.push(block);
        pendingPageBreak = false;
        continue;
      }
      if (/^(UL|OL)$/.test(node.tagName)) {
        const items = await listBlocksFrom(node, 0, ctx, pendingPageBreak);
        blocks.push(...items);
        pendingPageBreak = false;
        continue;
      }
      if (node.tagName === 'PRE') {
        blocks.push(...codeBlockFrom(node, pendingPageBreak));
        pendingPageBreak = false;
        continue;
      }
      if (/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(node.tagName)) {
        const items = await paragraphBlockFrom(node, ctx, headingMarkers, pendingPageBreak, keepNext || (isTopLevel && keepsWithCaption(node)));
        blocks.push(...items);
        pendingPageBreak = false;
        continue;
      }
      if (node.tagName === 'HR') {
        blocks.push(new docx.Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'CBD5E1' } }, spacing: { after: 120 } }));
        pendingPageBreak = false;
        continue;
      }
      // <img> DIRECTEMENT enfant du conteneur (pas dans un <p> - ex. une image en calque insérée hors flux, cf. js/editor-nodes.js) : sans cette branche,
      // ce nœud tombait dans le repli générique juste en dessous ("creuser dedans"), qui recurse sur ses ENFANTS - une image n'en a aucun, elle
      // disparaissait donc silencieusement de l'export (trouvé en comparant l'éditeur au .docx généré sur templates-gallery/test-images-tableaux).
      if (node.tagName === 'IMG') {
        const runs = await inlineNodesFrom(node, { size: DEFAULT_HALF_PT }, ctx);
        // Même centrage que dans un <p> (cf. splitRunsAtFloatedImages) : ce paragraphe est construit à la main ici, il ne passe donc pas par
        // paragraphBlockFrom et n'hériterait d'aucun alignement sans ça.
        const centered = runs.some(r => r && r.__docxCenterBlock);
        if (runs.length) blocks.push(new docx.Paragraph({ children: runs, alignment: centered ? docx.AlignmentType.CENTER : undefined, spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' }, pageBreakBefore: !!pendingPageBreak }));
        pendingPageBreak = false;
        continue;
      }
      // Nœud non reconnu (wrapper générique...) : on continue de creuser dedans plutôt que d'ignorer tout son contenu.
      const nested = await blocksFromContainer(node, ctx, false);
      blocks.push(...nested);
    }
    if (isTopLevel) {
      const flat = [];
      blocks.forEach(b => { if (b && b.__tocPlaceholder) flat.push(...buildTocParagraphs(ctx.headingBlocks)); else flat.push(b); });
      return flat;
    }
    return blocks;
  }

  // Du texte ou une image : même test que js/pdf-export.js:resolveZone (une zone vide ne réserve rien).
  function hasZoneContent(html) {
    return !!html && (!!html.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(html));
  }
  // Hauteur rendue d'un fragment d'en-tête ou de pied à la largeur du contenu, en twips : sert à placer le pied (Word l'ancre par son bas). Mesurée comme le fait
  // js/pdf-export.js:resolveZone (images décodées d'abord, sinon elles mesurent 0).
  async function measureZoneHeightTwip(html) {
    if (!hasZoneContent(html)) return 0;
    const root = document.createElement('div'); root.innerHTML = html;
    const detach = ExportCommon.attachMeasureHost(root, Math.round(CONTENT_WIDTH_TWIP / PX_TO_TWIP));
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      return Math.round(root.getBoundingClientRect().height * PX_TO_TWIP);
    } finally { detach(); }
  }

  // Le filigrane du modèle (js/page-layer.js:watermarkLayout : le corps, l'angle, la couleur et l'opacité que l'éditeur et le PDF dessinent) en image PNG : le texte est rendu par un
  // canevas dans la même police (Roboto gras), tourné, l'opacité cuite dans les pixels - Word n'applique pas celle d'une image ancrée, et un filigrane « Word » natif (VML) ne
  // s'affiche ni dans Google Docs ni partout ailleurs. L'image est de la taille du rectangle qui contient le texte tourné ; Word la centre sur la page (watermarkRun). Une fois par
  // réglage : un lot de 200 courriers ne redessine pas 200 fois le même canevas. Rend null quand le navigateur ne sait pas dessiner (l'export continue sans filigrane).
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

  // Son ancre : centrée sur la PAGE (pas sur les marges) dans les deux sens, derrière le texte, sous toutes les images en calque (zIndex 1 contre 1000 et plus).
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

  // « Sur toutes les pages » (js/page-layer.js) : un paragraphe de 1 pt qui porte, en ancres flottantes derrière le texte, chaque image répétée à sa place de la page - le même ancrage
  // que dans le corps (docxFloatingOptionsFrom), mais placé dans l'en-tête, que Word répète sur chaque page. Un paragraphe neuf et des images neuves par en-tête : un en-tête
  // ne partage rien avec un autre. Les numéros d'objet partent de 9000, hors de ceux du contenu de l'en-tête (headerFooterBlocksFrom recompte depuis 1). Le filigrane du modèle
  // (`watermark` : watermarkImageData), s'il y en a un, est la première ancre : le fond de tout le reste.
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

  async function buildDocxDocument(resolvedHtml, headerFooterData) {
    const root = document.createElement('div'); root.innerHTML = resolvedHtml || '';
    // Ni ligne vide ni saut de page orphelin en fin de document : quand le texte arrive à la marge du bas, ils ouvrent une page blanche (Antoine, 2026-10-01).
    ReaderMode.trimTrailingBlankBlocks(root);
    const ctx = { footnotes: {}, footnoteCounter: 0, headingBlocks: [], numberingConfigs: [], numberingCounter: 0, imageIdCounter: 0, measureRoot: root };
    // « Sur toutes les pages » : les images répétées partent dans l'en-tête, le corps ne les compte plus (inlineNodesFrom).
    const layerImages = PageLayer.collect(root);
    layerObjectId = 9000;
    // Les bandes du PDF : sur toutes les pages dès qu'une variante a du contenu (la page 1 sans en-tête garde la marge des autres), rien sinon. Posées avant les
    // blocs : l'ancrage d'une image en calque compte la bande du haut.
    const hfOn = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = hfOn && !!headerFooterData.differentFirstPage;
    const zoneVariants = differentFirstPage ? ['default', 'first'] : ['default'];
    const zoneHtml = (zone, variant) => (hfOn && headerFooterData[zone] && headerFooterData[zone][variant]) || '';
    topBandTwip = zoneVariants.some(v => hasZoneContent(zoneHtml('header', v))) ? HF_BAND_TWIP : 0;
    const bottomBandTwip = zoneVariants.some(v => hasZoneContent(zoneHtml('footer', v))) ? HF_BAND_TWIP : 0;
    // Hôte de mesure hors-écran le temps du parcours : measuredColumnWidthsPx a besoin d'un rendu réel, jamais possible sur un <div> détaché du document.
    const detachMeasureHost = ExportCommon.attachMeasureHost(root, Math.round(CONTENT_WIDTH_TWIP / PX_TO_TWIP));
    let bodyBlocks;
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      bodyBlocks = await blocksFromContainer(root, ctx, true);
    } finally { detachMeasureHost(); }
    // Word veut un paragraphe après un tableau placé en fin de document (tableau, zone deux colonnes et encadré en sont) : réduit à 1 pt, celui-ci ne rouvre pas
    // une page blanche quand le tableau touche la marge du bas, ce que faisait le paragraphe vide d'une ligne de l'éditeur.
    if (bodyBlocks.length && bodyBlocks[bodyBlocks.length - 1] instanceof docx.Table) {
      bodyBlocks.push(new docx.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, run: { size: 2 } }));
    }

    // Le pied : Word l'ancre par son BAS (distance du bord de la feuille au bas du pied), le PDF par son HAUT, juste sous le texte. La distance qui met le haut du pied
    // le plus haut des deux variantes là où le PDF le met est donc marge du bas + bande - sa hauteur ; une variante plus basse est complétée d'une ligne vide à hauteur
    // fixe pour que la sienne commence aussi au même endroit.
    const footerHeights = {};
    for (const v of zoneVariants) footerHeights[v] = await measureZoneHeightTwip(zoneHtml('footer', v));
    const footerHeightTwip = Math.max(0, ...Object.values(footerHeights));
    const footerDistanceTwip = bottomBandTwip ? Math.max(0, marginBottomTwip + bottomBandTwip - footerHeightTwip) : Math.round(marginBottomTwip / 2);
    async function footerBlocksFor(variant) {
      const blocks = await headerFooterBlocksFrom(zoneHtml('footer', variant), ctx);
      const pad = footerHeightTwip - (footerHeights[variant] || 0);
      if (blocks.length && pad >= TWIPS_PER_PT) blocks.push(new docx.Paragraph({ spacing: { before: 0, after: 0, line: pad, lineRule: 'exact' } }));
      return blocks;
    }
    const sectionProps = {
      page: {
        // docx.js échange largeur et hauteur de lui-même quand l'orientation vaut LANDSCAPE : lui donner les dimensions déjà échangées les ré-échangerait
        // (page portrait étiquetée paysage). Toujours le portrait du format ici, l'orientation seule dit le sens.
        size: Object.assign(
          { width: PageLayout.pageSizeTwipFor('portrait', pageFormat).width, height: PageLayout.pageSizeTwipFor('portrait', pageFormat).height },
          pageOrientation === 'landscape' ? { orientation: docx.PageOrientation.LANDSCAPE } : {}
        ),
        margin: { top: marginTopTwip + topBandTwip, bottom: marginBottomTwip + bottomBandTwip, left: marginLeftTwip, right: marginRightTwip, header: Math.round(marginTopTwip / 2), footer: footerDistanceTwip },
      },
      titlePage: differentFirstPage,
    };
    const section = { properties: sectionProps, children: bodyBlocks.length ? bodyBlocks : [new docx.Paragraph('')] };
    const headerBlocks = {};
    if (hfOn) {
      headerBlocks.default = await headerFooterBlocksFrom(zoneHtml('header', 'default'), ctx);
      const footerDefaultBlocks = await footerBlocksFor('default');
      if (footerDefaultBlocks.length) section.footers = Object.assign({}, section.footers, { default: new docx.Footer({ children: footerDefaultBlocks }) });
      if (differentFirstPage) {
        headerBlocks.first = await headerFooterBlocksFrom(zoneHtml('header', 'first'), ctx);
        const footerFirstBlocks = await footerBlocksFor('first');
        if (footerFirstBlocks.length) section.footers = Object.assign({}, section.footers, { first: new docx.Footer({ children: footerFirstBlocks }) });
      }
    }
    // Chaque en-tête que Word peut montrer (celui de la première page aussi quand elle diffère) porte les images répétées ; sans en-tête du tout, il est créé pour elles.
    // Le filigrane du modèle rejoint ces images : la même ancre dans chaque en-tête, créé pour lui s'il manque.
    const pageSizePt = PageLayout.pageSizePtFor(pageOrientation, pageFormat);
    const watermarkImage = await watermarkImageData(PageLayer.watermarkLayout(pageWatermark, pageSizePt.width, pageSizePt.height));
    for (const variant of zoneVariants) {
      const blocks = headerBlocks[variant] || [];
      const layerParagraph = (layerImages.length || watermarkImage) ? await repeatedLayerParagraph(layerImages, ctx, watermarkImage) : null;
      if (layerParagraph) blocks.push(layerParagraph);
      if (blocks.length) section.headers = Object.assign({}, section.headers, { [variant]: new docx.Header({ children: blocks }) });
    }
    const doc = { sections: [section], footnotes: ctx.footnotes };
    if (ctx.numberingConfigs.length) doc.numbering = { config: ctx.numberingConfigs };
    return new docx.Document(doc);
  }

  async function getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip) {
    // Une image d'un site externe est téléchargée pour ce Word (docxImageDataFrom) : la fenêtre la liste et peut tout arrêter (js/external-images.js). Un seul passage
    // pour l'export d'une ligne comme pour chaque ligne d'un lot (exportCurrentRecord passe par ici).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsTwip(marginsTwip);
    await ensureDocxLibLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, tableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    const resolvedHeaderFooterData = await ExportCommon.resolveHeaderFooterVariables(headerFooterData, tableId, record);
    const doc = await buildDocxDocument(resolvedHtml, resolvedHeaderFooterData);
    const blob = await docx.Packer.toBlob(doc);
    return { blob, filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    const { blob, filename } = await getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsTwip);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.docx');
  }

  return { exportCurrentRecord, getDocxBlobForRecord, ensureDocxLibLoaded };
})();
