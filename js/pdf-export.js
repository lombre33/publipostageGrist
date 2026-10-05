// Export PDF vectoriel (pdfmake). L'impression navigateur et les qualités raster (html2pdf.js) sont retirées (jsPDF et DOMPurify périmés) ; leur code
// reste dans l'historique git (js/pdf-export-alt.js) et l'interface les montre grisées (« bientôt »).
const PdfExport = (function () {
  // Chargés au premier export (1-2 s d'ouverture gagnées). `integrity` (SRI sha384) à recalculer si la version change : `curl -s <url> | openssl dgst
  // -sha384 -binary | openssl base64 -A`.
  const PDF_LIB_URLS = [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js', integrity: 'sha384-VFQrHzqBh5qiJIU0uGU5CIW3+OWpdGGJM9LBnGbuIH2mkICcFZ7lPd/AAtI7SNf7' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.min.js', integrity: 'sha384-dWs4+zGqy/KS6giKxiK+6iowhidQwjVFaiE1lMar36QwIulE44VyBSQp0brMCx4D' },
    // Chemins relatifs à index.html, même origine que la page : pas de SRI nécessaire (une compromission serait déjà celle du dépôt lui-même).
    { src: 'js/pdf-fonts.js?v=0.68' },
    { src: 'js/pdf-fonts-extra.js?v=0.67' },
    // Les deux polices de cases à cocher des variables Oui / Non (dev-tests/build-pdf-boxes-font.py) : ~3 Ko, lues par inlineRuns.
    { src: 'js/pdf-fonts-boxes.js?v=0.1' },
    // PPSymbols (dev-tests/build-pdf-fonts-fallback.py) : ✓ → ★ ① ₿ ✅... que ni Roboto ni les cinq autres familles n'ont ; js/pdf-glyph-fallback.js
    // (chargé avec la page) y renvoie ces caractères. ~380 Ko.
    { src: 'js/pdf-fonts-symbols.js?v=0.1' },
  ];
  let pdfLibsPromise = null;
  // Séquentiel (pas Promise.all) : pdf-fonts*.js lisent window.pdfMake.vfs à l'exécution, donc s'exécutent après pdfmake.min.js et vfs_fonts.min.js.
  async function ensurePdfLibsLoaded() {
    if (!pdfLibsPromise) {
      pdfLibsPromise = (async () => {
        for (const lib of PDF_LIB_URLS) await ExportCommon.loadScriptOnce(lib);
      })().catch(e => { pdfLibsPromise = null; throw e; });
    }
    return pdfLibsPromise;
  }

  const PX_TO_PT = 72 / 96;
  const STYLE = ExportCommon.EDITOR_STYLE;
  const DEFAULT_FONT_SIZE = STYLE.bodyPt;
  // `lineHeight` de pdfmake multiplie l'interligne par défaut de Roboto (≈1.171875 pour 11 pt) : diviser par ce ratio annule cet interligne natif
  // avant d'appliquer celui de l'éditeur.
  const EDITOR_LINE_HEIGHT_RATIO = STYLE.lineHeight;
  const PDFMAKE_DEFAULT_LINE_RATIO = 1.171875;
  const LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / PDFMAKE_DEFAULT_LINE_RATIO;
  const HEADING_SIZES = STYLE.headingPt;
  const LINK_COLOR = STYLE.linkColor;
  // Bloc de code : Cousine (métrique de Courier New, déjà embarquée).
  const CODE_FONT = 'Cousine';
  const CODE_FONT_SIZE = STYLE.codePt;
  const CODE_LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / STYLE.codeFontRatio;
  const CODE_BOX_COLOR = STYLE.codeBoxColor;
  const CODE_FILL_COLOR = STYLE.codeFillColor;
  const CODE_TEXT_COLOR = STYLE.codeTextColor;
  // Marges de page (pt) : variables de module, réglées par setPageMarginsPt() une fois par export (comme footnoteCounter et footnoteEntries plus
  // bas). La marge par défaut de PageLayout sur les quatre côtés quand l'appelant ne fournit aucune marge.
  const DEFAULT_MARGIN_PT = PageLayout.DEFAULT_MARGIN_PT;
  let marginTopPt = DEFAULT_MARGIN_PT, marginRightPt = DEFAULT_MARGIN_PT, marginBottomPt = DEFAULT_MARGIN_PT, marginLeftPt = DEFAULT_MARGIN_PT;
  // Page courante (pt) : A4 portrait par défaut, sinon le format et le sens que PageLayout.getMarginsPt() joint aux marges (setPageMarginsPt).
  let pageOrientation = 'portrait';
  let pageFormat = 'A4';
  let pageWidthPt = 595.28, pageHeightPt = 841.89;
  // Filigrane du modèle (PageLayout.normalizeWatermark) : il voyage avec les marges comme le sens et le format, absent = aucun. Peint par
  // buildNativeDocDefinition.
  let pageWatermark = null;
  // Notes de bas de page, collectées par inlineRuns à toute profondeur (cellule, colonne, corps) : variables de module plutôt qu'un paramètre à
  // passer par tableFrom, twoColumnsFrom et cellLineToPdfObject. Remises à zéro à chaque passe racine de buildPdfContentFromRoot (cf. isTopLevel).
  let footnoteCounter = 0;
  let footnoteEntries = [];
  // Lignes justifiées posées à la main (buildJustifiedLine) : leur étirement est estimé dans le navigateur, puis corrigé sur la largeur que pdfmake
  // leur trouve vraiment (learnStretchedLines, appelée par resolveNativePdfContent). `stretchedBlocks` : les blocs de la passe en cours ;
  // `stretchExtra` : l'écart par intervalle appris, par ligne, pour la passe suivante.
  let stretchedBlocks = [];
  let stretchExtra = new Map();
  let stretching = false; // vrai le temps de resolveNativePdfContent, la seule à mesurer puis corriger les lignes étirées
  // Bande fixe réservée en pied de page pour ~4 lignes de note à 8 pt plus le filet séparateur (pdfmake ne permet pas de bande dynamique par page) ;
  // une pile de notes très longues sur une page peut la déborder (limite assumée).
  const FOOTNOTE_BAND_PT = 4 * 8 * 1.15 + 8;
  // Hauteur utile d'une page (pt), marges, bandes d'en-tête et de pied et bande des notes déduites : posée une fois par passage dans
  // resolveNativePdfContent, lue par tableFrom pour savoir si les lignes d'un tableau tiennent dans une page. 0 tant qu'elle n'est pas posée : aucun
  // tableau n'est alors gardé en lignes entières.
  let tablePageHeightPt = 0;
  // `left` et `top` d'une image en calque sont relatifs au padding de `.tiptap` (la marge de page de l'Aperçu A4), alors que l'hôte de mesure PDF
  // n'en a pas : soustrait une seule fois avant toute comparaison ou interpolation. Deux valeurs, les marges pouvant être asymétriques.
  let A4_PREVIEW_PADDING_TOP_PX = marginTopPt / PX_TO_PT;
  let A4_PREVIEW_PADDING_LEFT_PX = marginLeftPt / PX_TO_PT;

  // ProseMirror pose `white-space: break-spaces` (l'espace avant un retour à la ligne compte dans la largeur), pas `normal` comme pdfmake (l'espace
  // dépasse sans compter, un mot de plus peut tenir) - compensé en retranchant la largeur d'un espace (mesurée une fois, mise en cache) de chaque
  // largeur d'habillage.
  let cachedSpaceWidthPt = null;
  function spaceWidthPt() {
    if (cachedSpaceWidthPt !== null) return cachedSpaceWidthPt;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute; visibility:hidden; white-space:pre; font-family:Roboto,Helvetica,Arial,sans-serif; font-size:' + DEFAULT_FONT_SIZE + 'pt;';
    probe.textContent = 'a a';
    document.body.appendChild(probe);
    const withSpace = probe.getBoundingClientRect().width;
    probe.textContent = 'aa';
    const withoutSpace = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);
    cachedSpaceWidthPt = Math.max(1, (withSpace - withoutSpace) * PX_TO_PT);
    return cachedSpaceWidthPt;
  }
  let CONTENT_WIDTH_PT = pageWidthPt - marginLeftPt - marginRightPt;
  let CONTENT_WIDTH_PX = CONTENT_WIDTH_PT / PX_TO_PT;

  // Réglé une fois par export (exportCurrentRecord, getNativePdfBlobForRecord) à partir des marges du modèle courant (js/page-layout.js) : recalcule
  // toutes les valeurs dérivées. Une marge absente prend le défaut de PageLayout. Les dimensions de page viennent de PageLayout.pageSizePtFor (pure,
  // sans état), comme PageLayout.pageNumberText plus bas.
  function setPageMarginsPt(marginsPt) {
    const m = marginsPt || {};
    const marginOf = value => (Number.isFinite(value) ? value : DEFAULT_MARGIN_PT);
    marginTopPt = marginOf(m.top);
    marginRightPt = marginOf(m.right);
    marginBottomPt = marginOf(m.bottom);
    marginLeftPt = marginOf(m.left);
    // Sens et format de la page, joints aux marges (PageLayout.getMarginsPt) ; absents, A4 portrait. Les dimensions viennent de
    // PageLayout.pageSizePtFor : un seul endroit les écrit.
    pageOrientation = m.orientation === 'landscape' ? 'landscape' : 'portrait';
    pageFormat = PageLayout.normalizeFormat(m.format);
    const page = PageLayout.pageSizePtFor(pageOrientation, pageFormat);
    pageWidthPt = page.width; pageHeightPt = page.height;
    pageWatermark = PageLayout.normalizeWatermark(m.watermark);
    A4_PREVIEW_PADDING_TOP_PX = marginTopPt / PX_TO_PT;
    A4_PREVIEW_PADDING_LEFT_PX = marginLeftPt / PX_TO_PT;
    CONTENT_WIDTH_PT = pageWidthPt - marginLeftPt - marginRightPt;
    CONTENT_WIDTH_PX = CONTENT_WIDTH_PT / PX_TO_PT;
  }

  function cssSize(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? Math.max(6, Math.min(72, n * (value && String(value).endsWith('px') ? PX_TO_PT : 1))) : fallback;
  }

  // Police web-safe -> police pdfmake réellement embarquée (pdfmake ne peut jamais utiliser une police système) : équivalents libres à métrique
  // identique.
  const FONT_FAMILY_MAP = {
    'arial': 'Arimo', 'helvetica': 'Arimo',
    'times new roman': 'Tinos', 'times': 'Tinos',
    'georgia': 'Gelasio',
    'courier new': 'Cousine', 'courier': 'Cousine',
    'calibri': 'Carlito',
  };
  function pdfFontFor(value) {
    if (!value) return null;
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    return FONT_FAMILY_MAP[first] || null;
  }

  function addDecoration(out, name) {
    const list = Array.isArray(out.decoration) ? out.decoration.slice() : (out.decoration ? [out.decoration] : []);
    if (list.indexOf(name) === -1) list.push(name);
    out.decoration = list;
  }

  // pdfmake n'interprète pas `rgb(r,g,b)` (rend en noir, sans erreur) - or c'est la forme que le navigateur renvoie pour tout style inline posé en
  // hexa une fois repassé par le DOM. Convertit vers l'hexa ; laisse passer un nom de couleur CSS ou un hexa déjà présent.
  function cssColorToHex(value) {
    if (!value) return null;
    const v = value.trim();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (!m) return v;
    const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
  }

  // Le style des balises qui en posent un : titre, gras, italique, soulignement, barré, lien, code et légende.
  function applyTagStyle(out, node, tag) {
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.fontSize = HEADING_SIZES[tag]; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') addDecoration(out, 'underline');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') addDecoration(out, 'lineThrough');
    if (tag === 'PRE') { out.font = CODE_FONT; out.fontSize = CODE_FONT_SIZE; out.color = CODE_TEXT_COLOR; out.preserveLeadingSpaces = true; }
    // Légende (js/caption.js) : un paragraphe `data-caption` est en petit, italique, gris - la base de ses runs ; la taille ou la couleur d'un <span>
    // posé dedans l'emportent ensuite, comme dans l'éditeur.
    if (tag === 'P' && node.hasAttribute('data-caption')) { out.italics = true; out.fontSize = Caption.SIZE_PT; out.color = Caption.COLOR; }
    // Lien : le clic part du run lui-même (`link`, annotation pdfmake), hérité par tout ce qui est dans le <a>. La couleur du lien l'emporte sur
    // celle d'un parent, mais pas sur celle d'un <span> posé dedans, comme `.tiptap a` face à un texte coloré.
    const linkHref = tag === 'A' ? HtmlSanitize.safeLinkHref(node.getAttribute('href')) : null;
    if (linkHref) {
      out.link = linkHref;
      out.color = LINK_COLOR;
      addDecoration(out, 'underline');
    }
  }

  // Le style en ligne (`style="…"`), lu par `css(nom)` : gras, italique, soulignement, barré, taille, police, couleur et fond.
  function applyInlineStyle(out, css) {
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italics = true;
    if (css('text-decoration')) {
      if (/underline/i.test(css('text-decoration'))) addDecoration(out, 'underline');
      if (/line-through/i.test(css('text-decoration'))) addDecoration(out, 'lineThrough');
    }
    if (css('font-size')) out.fontSize = cssSize(css('font-size'), DEFAULT_FONT_SIZE);
    const pdfFont = pdfFontFor(css('font-family'));
    if (pdfFont) out.font = pdfFont;
    if (css('color')) out.color = cssColorToHex(css('color'));
    if (css('background-color')) out.background = cssColorToHex(css('background-color'));
  }

  // Style hérité d'un nœud DOM -> attributs de "run" pdfmake. Point de passage unique pour tout texte, où qu'il vive dans le schéma.
  function inheritedStyle(node, parent) {
    const isElement = node.nodeType === 1;
    const style = isElement ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const out = Object.assign({}, parent);
    applyTagStyle(out, node, isElement ? node.tagName : '');
    applyInlineStyle(out, css);
    return out;
  }

  // TipTap (extension-text-align) pose toujours un style inline `text-align`, jamais une classe ql-align-* ni un attribut align="" : pas de repli à
  // gérer ici.
  function alignment(node) {
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  // Contenu pdfmake d'un sommaire, à partir des blocs-titre déjà rencontrés : texte et niveau sont connus tout de suite, pas le numéro de page (il
  // dépend d'une première passe de mise en page, cf. resolveNativePdfContent) ; chaque entrée réserve sa cellule vide, remplie après coup.
  function buildTocStack(headingBlocks) {
    const title = { text: I18n.t('pdf.tocTitle'), bold: true, fontSize: 16, margin: [0, 0, 0, 10] };
    if (!headingBlocks.length) {
      return { stack: [title, { text: I18n.t('pdf.tocEmpty'), italics: true, color: '#6b7280' }], pageNumberCells: [] };
    }
    const pageNumberCells = [];
    const lines = headingBlocks.map(hb => {
      const level = hb._headingLevel || 1;
      const isH1 = level === 1;
      const fontSize = isH1 ? 11 : 10.5;
      const pageCell = { text: '', alignment: 'right', width: 30, bold: isH1, fontSize };
      pageNumberCells.push(pageCell);
      return {
        columns: [glyphText(hb._headingText || '', { bold: isH1, fontSize }), pageCell],
        columnGap: 4,
        margin: [Math.max(0, level - 1) * 14, isH1 ? 6 : 2, 0, 2],
      };
    });
    return { stack: [title].concat(lines), pageNumberCells };
  }

  // Indentation réelle d'un bloc, mesurée dans un hôte .tiptap hors-écran (hérite le CSS des listes/citations) plutôt que devinée. 'box' (LI) : bord
  // de la boîte (le marqueur est ajouté à part par listMarkerFor). 'text' : premier caractère rendu, capture aussi un padding/bordure propre.
  function measureIndentPt(node, mode) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const hostLeft = host.getBoundingClientRect().left;
    // Un flottement CSS (image « au cœur du texte ») qui déborde d'un frère précédent décalerait la mesure comme un faux retrait, fixé pour tout le
    // paragraphe : `clear` l'écarte le temps de la mesure.
    const previousClear = node.style.clear;
    node.style.clear = 'both';
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else {
      // Case d'une variable Oui / Non (`.resolved-checkbox`) : le premier « caractère rendu » d'un paragraphe qui commence par elle est la case, pas
      // son ☑ / ☐ (poussé hors de sa boîte par `text-indent` : le mesurer décalait tout le paragraphe d'une quarantaine de pt) ni le texte qui la
      // suit (sa case lui ferait un faux retrait).
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => {
          if (n.nodeType === Node.ELEMENT_NODE) return n.classList.contains('resolved-checkbox') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          return (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      const first = walker.nextNode();
      if (!first) { node.style.clear = previousClear; return 0; }
      // L'alignement du bloc est neutralisé le temps de la mesure : un bloc centré ou aligné à droite pousse son texte loin du bord gauche du large
      // hôte de mesure, ce qui n'est pas un retrait.
      const previousAlign = node.style.textAlign;
      node.style.textAlign = 'left';
      if (first.nodeType === Node.ELEMENT_NODE) {
        // Sans l'écart de .1em que la feuille de style met de chaque côté de la case : c'est un jeu entre elle et son voisin, pas un retrait.
        leftPx = first.getBoundingClientRect().left - (parseFloat(getComputedStyle(first).marginLeft) || 0);
      } else {
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(first, 1);
        leftPx = range.getBoundingClientRect().left;
      }
      node.style.textAlign = previousAlign;
    }
    node.style.clear = previousClear;
    return Math.round(Math.max(0, (leftPx - hostLeft) * PX_TO_PT) * 100) / 100;
  }

  // Hôte de mesure hors-écran (ExportCommon.attachMeasureHost) : la classe .pdf-measure-host permet à un nœud de retrouver son hôte (cf. closest
  // ci-dessus), la largeur retombe sur celle du contenu de page quand l'appelant n'en donne pas.
  const attachPdfMeasureHost = (root, widthPx) => ExportCommon.attachMeasureHost(root, widthPx || CONTENT_WIDTH_PX, 'pdf-measure-host');

  const FLOW_IMAGE_NODES = new WeakMap();

  // Une image en calque : sa position réelle est résolue plus tard par ancrage ou par interpolation (une formule directe depuis le pixel `top` n'a
  // aucune notion de pagination PDF). Garde une référence au nœud DOM réel (encore attaché à l'hôte de mesure) pour mesurer sa position par rapport
  // aux blocs de texte voisins.
  function markLayeredImage(image, node, layer) {
    image._pendingImgNode = node;
    // Conservé jusqu'à la relocation dans content[] : pdfmake peint content[] séquentiellement, "devant" et "derrière" n'ont donc pas la même
    // direction d'insertion par rapport à leur bloc-ancre.
    image._pendingLayer = layer;
    // Provisoire, écrasé une fois l'ancrage résolu : sans absolutePosition, pdfmake traite ce bloc comme un élément de flux et lui réserve sa
    // hauteur dès la première passe de mesure, ce qui gonfle la position mesurée des blocs suivants de la hauteur de l'image.
    image.absolutePosition = { x: 0, y: 0 };
    // Position sur la grille de page (data-page-index, data-page-left-pt, data-page-top-pt), capturée une fois dans l'éditeur (Aperçu A4) depuis le
    // DOM déjà mis en page : elle passe avant tout l'ancrage ci-dessous dès qu'elle existe (resolveNativePdfContent), pour un rendu identique à
    // l'éditeur. Absente d'un document ancien ou positionné hors de l'Aperçu A4 : repli sur l'ancrage.
    if (!node.hasAttribute('data-page-index')) return;
    const pageIndex = parseInt(node.getAttribute('data-page-index'), 10);
    const pageLeftPt = parseFloat(node.getAttribute('data-page-left-pt'));
    const pageTopPt = parseFloat(node.getAttribute('data-page-top-pt'));
    if (Number.isFinite(pageIndex) && Number.isFinite(pageLeftPt) && Number.isFinite(pageTopPt)) {
      image._pageGrid = { pageIndex, pageLeftPt, pageTopPt, macroSlot: node.getAttribute('data-macro-slot') };
      // « Sur toutes les pages » (js/page-layer.js) : peinte en fond de chaque page de son courrier, pas seulement de celle où elle a été posée
      // (resolveNativePdfContent).
      if (PageLayer.isRepeatedEl(node)) image._repeat = true;
    }
  }

  // Une image du texte (ni calque) : habillée à gauche ou à droite, ou en place.
  function markFlowImage(image, node) {
    const align = node.getAttribute('data-align');
    // gauche/droite = habillage (float CSS) géré par floatedImageParagraphFrom (colonne image + colonne texte), pas par `alignment` de pdfmake (qui
    // n'aurait fait qu'aligner l'image seule, sans habiller le texte autour).
    if (align === 'left' || align === 'right') {
      image._floatAlign = align;
      image._sourceImgNode = node;
      return;
    }
    image.margin = [0, 2, 0, 4];
    if (align) image.alignment = align;
    // Le nœud DOM d'une image du flux (ni calque, ni habillage), hors de l'objet pdfmake : inFlowImageBlocksFrom y lit sa boîte et sa ligne.
    FLOW_IMAGE_NODES.set(image, node);
  }

  function pdfImageFromNode(node) {
    const layer = node.getAttribute('data-layer') || 'normal';
    const layered = layer !== 'normal' && node.style.position === 'absolute';
    const styleWidthPx = parseFloat(node.style.width) || 320;
    // Une image dans le texte est ramenée à la largeur de son conteneur, comme dans l'éditeur (ExportCommon.shownImageWidthPx) : réglée plus large
    // que la page, la case ou la colonne, elle déborderait. Une image en calque garde sa taille réglée.
    const widthPx = layered ? styleWidthPx : ExportCommon.shownImageWidthPx(node, styleWidthPx);
    const image = { image: node.getAttribute('src') };
    // Image liée à une #Variable Attachments : la boîte width×height est fixe, mais chaque ligne Grist y met une image d'un autre ratio ; `fit`
    // (pdfmake) la met à l'échelle sans la déformer. `width` reste posé aussi : pdfmake ne le lit pas ici, le bracketing d'une image en calque si
    // (sinon NaN).
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (node.hasAttribute('data-var-table')) {
      const heightPx = parseFloat(node.style.height) || 240;
      image.fit = [image.width, Math.max(15, heightPx * PX_TO_PT)];
    }
    const opacity = parseFloat(node.style.opacity);
    if (Number.isFinite(opacity) && opacity < 1) image.opacity = opacity;
    if (layered) markLayeredImage(image, node, layer);
    else markFlowImage(image, node);
    return image;
  }

  // Numéro d'une note de bas de page, compté une seule fois : le texte d'un paragraphe coupé en lignes ou en morceaux (extractRunsBetweenRaw) est
  // relu sur des copies du nœud. Le numéro se pose sur la note à sa première lecture (data-pdf-footnote-number, sur l'hôte de mesure de cette passe)
  // et les copies le reprennent tel quel ; sans cela, chaque relecture ajouterait une note au bas de page.
  function footnoteNumberOf(marker) {
    let number = parseInt(marker.getAttribute('data-pdf-footnote-number'), 10);
    if (!(number > 0)) {
      footnoteCounter += 1;
      number = footnoteCounter;
      footnoteEntries.push({ number, text: marker.getAttribute('data-note-text') || '' });
      marker.setAttribute('data-pdf-footnote-number', String(number));
    }
    return number;
  }

  // Un texte qui ne passe pas par inlineRuns (entrée du sommaire, ligne de code, note de bas de page) : le même repli de police par caractère.
  // `style` : ce qui se pose sur un caractère (police, taille, graisse, couleur, interligne) ; le bloc rendu le garde, et seul le texte devient une
  // suite de runs quand la police en manque un caractère - sinon rien ne change.
  function glyphText(text, style) {
    return Object.assign({}, style, { text: PdfGlyphFallback.split(text, style) || text });
  }

  // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : un glyphe des polices de cases (js/pdf-fonts-boxes.js) - la police du
  // texte n'a ni ☑ ni ☐ -, de la taille du texte et de la couleur de la case (style en ligne, déjà lu par inheritedStyle). Jamais barrée, grasse ni
  // en italique : le barré d'une case d'accent cochée vise le texte qui la suit, pas une autre case.
  function checkboxRuns(node, style) {
    const box = Object.assign({}, style, {
      text: node.getAttribute('data-checked') === 'true' ? '\u2611' : '\u2610',
      font: node.getAttribute('data-checkbox-style') === 'classic' ? 'PPBoxClassic' : 'PPBoxAccent',
    });
    delete box.decoration; delete box.bold; delete box.italics;
    return [box];
  }

  // Contrairement à .page-number-badge, le numéro ne dépend pas de la pagination : assigné tout de suite par le compteur de module (remis à 0 à
  // chaque passe), correct à toute profondeur.
  function footnoteRuns(node, style) {
    const number = footnoteNumberOf(node);
    return [{ text: String(number), ...style, sup: true, fontSize: (style.fontSize || DEFAULT_FONT_SIZE) * 0.7 }];
  }

  // Les éléments qui portent une classe à part, essayés dans cet ordre : le premier qui correspond rend les runs de l'élément.
  const RUNS_BY_CLASS = [
    ['page-break-marker', () => []],
    // ReaderMode.preview a déjà résolu chaque badge en texte avant ce module : branche de robustesse.
    ['var-badge', (node, style) => PdfGlyphFallback.runsFor(node.textContent || '', style)],
    // Contrairement à .var-badge, aucune valeur réelle n'existe avant que pdfmake choisisse le numéro de page final - marqueur résolu plus tard par
    // resolvePageNumberPlaceholders à chaque callback header/footer natif.
    ['page-number-badge', (node, style) => [{ text: '#', ...style, _pendingPageNumber: { format: node.getAttribute('data-format') || 'n' } }]],
    ['smart-chip', (node, style) => PdfGlyphFallback.runsFor(node.textContent || '', style)],
    ['resolved-checkbox', checkboxRuns],
    ['footnote-ref-marker', footnoteRuns],
  ];

  // Une image (rangée dans `images` quand l'appelant les prend) ou un retour à la ligne ; null pour tout autre élément.
  function leafRuns(node, style, images) {
    if (node.tagName === 'IMG') {
      if (images && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) {
        images.push(pdfImageFromNode(node));
        // Marqueur de position (jamais un run pdfmake valide) : blockFrom y retrouve l'ordre d'origine du texte et des images ; sans lui, une image
        // « au cœur du texte » passerait en fin de paragraphe.
        return [{ _imageMarker: true }];
      }
      return [];
    }
    // data-pdf-measure-filler : <br> injecté pour donner une hauteur à un bloc vide dans l'hôte de mesure, pas un retour à la ligne saisi : aucun
    // run.
    if (node.tagName === 'BR') return node.hasAttribute('data-pdf-measure-filler') ? [] : [{ text: '\n', ...style }];
    return null;
  }

  // Les runs des enfants d'un nœud, avec un retour à la ligne entre deux blocs de ligne (paragraphe, titre, code) ; `skip` écarte des enfants.
  function childRuns(node, style, images, skip) {
    const runs = [];
    let sawLineBlock = false;
    node.childNodes.forEach(child => {
      if (skip && skip(child)) return;
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) runs.push({ text: '\n', ...style });
      if (isLineBlock) sawLineBlock = true;
      for (const run of inlineRuns(child, style, images)) runs.push(run);
    });
    return runs;
  }

  // Ne rend jamais d'image dans ce tableau de runs : un objet { image } glissé dans le texte n'est pas valide pour pdfmake (ignoré sans erreur). Les
  // images rencontrées vont à part dans `images`, que l'appelant ajoute comme blocs propres.
  function inlineRuns(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE });
    // Tout texte écrit passe par PdfGlyphFallback : un caractère que la police du texte n'a pas (✓ → ★ ①, un mot grec ou cyrillique en Arial...)
    // s'écrit dans une police qui l'a, jamais en case vide.
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? PdfGlyphFallback.runsFor(node.nodeValue, style) : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const byClass = RUNS_BY_CLASS.find(([name]) => node.classList.contains(name));
    if (byClass) return byClass[1](node, style);
    return leafRuns(node, style, images) || childRuns(node, style, images);
  }

  // Comme inlineRuns, mais ignore les <ul> et <ol> directs : une sous-liste produit ses propres blocs (un par <li>) au lieu d'être aplatie dans le
  // texte du <li> parent. Un bloc de code posé après le texte de l'item (ou un paragraphe après lui) commence sa propre ligne, comme dans inlineRuns.
  function inlineRunsExcludingNestedLists(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle);
    return childRuns(node, style, images, child => child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName));
  }

  // inlineRuns glisse un marqueur `{_imageMarker:true}` pour que blockFrom() reconstitue l'ordre réel texte/image ; tout autre appelant doit le
  // retirer, un objet sans `text` ni `image` fait planter pdfmake.
  function stripImageMarkers(runs) { return runs.filter(r => !r._imageMarker); }

  // 'circle' et 'square' n'utilisent pas les glyphes Unicode ○ et ▪ : pdfmake/PDFKit n'embarque les TTF qu'en WinAnsi (vérifié en décodant le PDF
  // avec pdf.js), tout caractère au-delà de U+00FF ressort invisible. '°' reste dans cette plage (cercle creux) ; '*' pour le carré, pas '#'
  // (collision avec #Variable).
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };
  function listMarkerFor(node) {
    const parent = node.parentElement;
    if (parent && parent.tagName === 'OL') {
      const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
      const start = parseInt(parent.getAttribute('start') || '1', 10) || 1;
      const n = start + (items.indexOf(node) === -1 ? 0 : items.indexOf(node));
      // Réutilise la même conversion chiffre→lettre/romain que la numérotation des titres plutôt que d'en réécrire une.
      const numberStyle = parent.getAttribute('data-number-style');
      if (numberStyle === 'alpha') return HeadingNumbering.formatCounterValue(n, 'lower-alpha') + '. ';
      if (numberStyle === 'roman') return HeadingNumbering.formatCounterValue(n, 'upper-roman').toLowerCase() + '. ';
      return n + '. ';
    }
    const bulletStyle = parent && parent.getAttribute('data-bullet-style');
    return BULLET_MARKERS[bulletStyle] || BULLET_MARKERS.disc;
  }

  // Case à cocher dessinée en vectoriel via `canvas` plutôt qu'en glyphe de police (☑/☐ hors WinAnsi, même contrainte que les puces rondes/carrées) :
  // un rectangle + une coche ne dépendent d'aucune police embarquée.
  const TASK_BOX_PT = 8;
  function taskCheckboxCanvas(checked, style) {
    const rect = { type: 'rect', x: 0, y: 0, w: TASK_BOX_PT, h: TASK_BOX_PT, r: style === 'classic' ? 0.5 : 1.6, lineWidth: 1 };
    if (style === 'classic') {
      const shapes = [Object.assign({}, rect, { lineColor: '#555' })];
      if (checked) shapes.push({ type: 'polyline', lineWidth: 1.3, lineColor: '#222', points: [{ x: 1.6, y: 4.6 }, { x: 3.3, y: 6.6 }, { x: 6.6, y: 2 }] });
      return shapes;
    }
    if (checked) return [Object.assign({}, rect, { color: '#2f6fed', lineColor: '#2f6fed' }), { type: 'polyline', lineWidth: 1.4, lineColor: '#ffffff', points: [{ x: 1.6, y: 4.6 }, { x: 3.3, y: 6.6 }, { x: 6.6, y: 2 }] }];
    return [Object.assign({}, rect, { lineColor: '#98a2b3' })];
  }

  // Reflète la règle CSS text-decoration:line-through, qu'inheritedStyle ne peut pas lire (style inline d'un nœud seulement, jamais une règle
  // externe).
  function taskListRuns(node, runs) {
    const parent = node.parentElement;
    const checked = node.getAttribute('data-checked') === 'true';
    const style = (parent && parent.getAttribute('data-tasklist-style')) || 'accentStrike';
    const base = runs.length ? runs : [{ text: ' ' }];
    if (!checked || style === 'classic' || style === 'accentPlain') return base;
    return base.map(r => Object.assign({}, r, {
      decoration: Array.isArray(r.decoration) ? r.decoration.concat('lineThrough') : (r.decoration ? [r.decoration, 'lineThrough'] : ['lineThrough']),
      color: r.color || '#667085',  // le gris de la Lecture (--paper-text-faint, 4,97:1 sur blanc)
    }));
  }

  function isTaskListItem(node) {
    const parent = node.parentElement;
    return !!(parent && parent.getAttribute('data-type') === 'taskList');
  }

  // Structure `columns` commune aux deux points d'insertion d'un item de liste de tâches : case dans une colonne étroite, texte dans le reste.
  function taskListColumns(node, runs, align) {
    const checked = node.getAttribute('data-checked') === 'true';
    const style = (node.parentElement && node.parentElement.getAttribute('data-tasklist-style')) || 'accentStrike';
    const textCol = { width: '*', text: runs, lineHeight: LINE_HEIGHT_RATIO };
    if (align) textCol.alignment = align;
    return [
      { width: TASK_BOX_PT + 5, margin: [0, 3, 0, 0], canvas: taskCheckboxCanvas(checked, style) },
      textCol,
    ];
  }

  function isBlock(node) { return node.nodeType === Node.ELEMENT_NODE && (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TABLE|HR|IMG)$/i.test(node.tagName)); }

  // Repli de robustesse : un nœud dont la construction pdfmake lève une exception dégrade en texte brut plutôt que d'annuler tout l'export.
  function fallbackTextBlock(node, pageBreakBefore) {
    const text = ((node && node.textContent) || '').trim();
    return { text: text || ' ', margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pageBreakBefore ? { pageBreak: 'before' } : {}) };
  }

  // Le navigateur écrase les espaces et retours en tout début et fin de bloc, pdfmake prend le texte tel quel : sans ce trim, un espace ou un retour
  // à la ligne en tête ou en fin de paragraphe (fréquent après une image ou un saut de ligne) décale visiblement un texte centré ou justifié.
  function trimEdgeWhitespace(runs) {
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[0].text)) runs.shift();
    if (runs.length) runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^[ \t\n\r\f\v]+/, '') });
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[runs.length - 1].text)) runs.pop();
    if (runs.length) { const last = runs.length - 1; runs[last] = Object.assign({}, runs[last], { text: runs[last].text.replace(/[ \t\n\r\f\v]+$/, '') }); }
    return runs;
  }

  // Découpe les enfants directs d'une cellule/sous-liste en "lignes" pdfmake : <p>/<div>/<h1-6> direct = sa propre ligne ; <ul>/<ol> direct = une
  // ligne par <li> (récursif) ; tout le reste s'accumule dans un groupe "inline".
  function collectCellLines(container, lines) {
    let pending = [];
    function flushPending() { if (pending.length) { lines.push({ inline: pending }); pending = []; } }
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue) pending.push(node); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (/^(P|DIV|H[1-6]|PRE)$/.test(node.tagName)) { flushPending(); lines.push(node); return; }
      if (/^(UL|OL)$/.test(node.tagName)) {
        flushPending();
        Array.from(node.children).filter(c => c.tagName === 'LI').forEach(li => {
          lines.push(li);
          Array.from(li.children).filter(c => /^(UL|OL)$/.test(c.tagName)).forEach(nested => collectCellLines(nested, lines));
        });
        return;
      }
      pending.push(node);
    });
    flushPending();
  }
  // Rattache une image en calque à `obj` comme ancre locale : dans une cellule, le paragraphe hôte est la référence la plus proche, pas besoin de
  // bracketing. Pas de correction A4_PREVIEW_PADDING_TOP/LEFT_PX ici : la cellule a son propre position:relative, seule la différence avec le
  // conteneur compte.
  function attributeNestedPendingImages(images, before, obj, containerNode, rootRect, nestedPending) {
    if (!nestedPending || !rootRect) return;
    for (let i = before; i < images.length; i += 1) {
      const img = images[i];
      if (!img._pendingImgNode) continue;
      const imgRect = img._pendingImgNode.getBoundingClientRect();
      const containerRect = containerNode.getBoundingClientRect();
      const entry = {
        image: img,
        container: obj,
        containerTopPx: containerRect.top - rootRect.top,
        containerLeftPx: containerRect.left - rootRect.left,
        imgTopPx: imgRect.top - rootRect.top,
        imgLeftPx: imgRect.left - rootRect.left,
      };
      nestedPending.push(entry);
    }
  }
  // Image « au cœur du texte » (dans le flux, pas en calque) alignée à gauche ou à droite : la cible de l'habillage `columns` (cf.
  // floatedImageParagraphFrom).
  function findFloatImageIn(node) {
    return Array.from(node.querySelectorAll('img.editor-image')).find(img => {
      const align = img.getAttribute('data-align');
      const layer = img.getAttribute('data-layer') || 'normal';
      return layer === 'normal' && (align === 'left' || align === 'right');
    });
  }
  // Une ligne de la case, avec l'habillage d'une image qui flotte (`state.floatCarry`, d'une ligne à l'autre, comme blockFrom dans le flux
  // principal) : le texte d'une ligne suivante se range à côté de l'image qui la déborde, une autre ligne (liste, titre, code) repart sous elle.
  // `state.lastBottomPx` : le bas de la dernière ligne de texte, pour la hauteur que l'image donne à la case.
  function cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending, state) {
    const carry = state && state.floatCarry;
    if (state) state.floatCarry = null;
    if (carry && !line.inline && /^(P|DIV)$/.test(line.tagName) && !line.querySelector('img.editor-image')) {
      const carried = carriedFloatBlocksFrom(line, carry, false, { nested: true, maxWidthPt: cellWidthPt });
      if (carried) {
        if (state) { state.floatCarry = carried._floatCarry || null; state.lastBottomPx = line.getBoundingClientRect().bottom; }
        return carried;
      }
    }
    const obj = cellLineObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending);
    if (state) carryFloatPast(line, obj, carry, state);
    return obj;
  }

  // Ce que la ligne posée laisse à la suivante : l'image qui déborde encore (`state.floatCarry`) et le bas de son texte (`state.lastBottomPx`).
  function carryFloatPast(line, obj, carry, state) {
    const blocks = Array.isArray(obj) ? obj : [obj];
    // Ce qui n'est pas du texte rangé à côté de l'image (liste, titre, code, paragraphe qui porte lui-même une image) repart sous elle.
    if (carry && !line.inline) {
      const gapPt = (carry.floatBottomPx - line.getBoundingClientRect().top) * PX_TO_PT;
      const first = blocks.find(b => b && !b._pendingImgNode && !b.absolutePosition);
      if (gapPt > 0.5 && first) addTopMargin(first, gapPt);
    }
    state.floatCarry = blocks._floatCarry || null;
    state.lastBottomPx = line.inline ? null : line.getBoundingClientRect().bottom;
  }

  // Une ligne de la case faite de nœuds en ligne (texte, mise en forme, images) : un seul bloc de texte.
  function inlineCellObject(line, cellAlign, cellBaseStyle, images, rootRect, nestedPending) {
    const before = images.length;
    const runs = trimEdgeWhitespace(stripImageMarkers(line.inline.flatMap(n => inlineRuns(n, cellBaseStyle, images))));
    const obj = { text: runs.length ? runs : ' ', margin: [0, 0, runs.length ? spaceWidthPt() : 0, 0] };
    if (cellAlign) obj.alignment = cellAlign;
    attributeNestedPendingImages(images, before, obj, line.inline[0].parentElement || line.inline[0], rootRect, nestedPending);
    return obj;
  }

  // Un paragraphe de la case que porte une image habillée : le même chemin d'habillage que le flux principal (floatedImageParagraphFrom), avec la
  // largeur réelle de la cellule (cf. tableFrom) au lieu de la pleine page. Image en calque, texte rangé à côté en blocs décalés ; habillage en
  // colonnes quand le paragraphe ne s'y prête pas ; null quand le paragraphe n'en porte pas.
  function cellFloatBlocksFrom(node, cellWidthPt) {
    if (!/^(P|DIV)$/.test(node.tagName) || !findFloatImageIn(node)) return null;
    return floatParagraphBlocksFrom(node, false, { nested: true, maxWidthPt: cellWidthPt }) || floatedImageParagraphFrom(node, false, cellWidthPt) || null;
  }

  // Une image du flux (dans la ligne, « bloc », centrée) dans un paragraphe de la case : le texte et l'image posés où le navigateur les met, comme
  // dans le flux principal (inFlowImageBlocksFrom). Les images en calque restent dans `images`, que la case ajoute à sa suite et rattache à ce
  // paragraphe ; celles du flux sont déjà dans les blocs. null quand le paragraphe n'en porte pas.
  function cellFlowImageBlocksFrom(node, rawRuns, before, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
    if (!/^(P|DIV)$/.test(node.tagName) || !rawRuns.some(r => r._imageMarker) || images.slice(before).some(img => img._floatAlign)) return null;
    const flowBlocks = inFlowImageBlocksFrom(node, images.slice(before), false, { keepLayered: true, textAlign: cellAlign, baseStyle: cellBaseStyle, maxWidthPt: cellWidthPt });
    if (!flowBlocks) return null;
    for (let i = images.length - 1; i >= before; i -= 1) if (FLOW_IMAGE_NODES.has(images[i])) images.splice(i, 1);
    attributeNestedPendingImages(images, before, flowBlocks.find(b => b.text !== undefined) || flowBlocks[0], node, rootRect, nestedPending);
    return flowBlocks;
  }

  // Ce qu'un texte de case rend de sa largeur à la coupure des lignes (marge droite de son bloc, en pt), pour que pdfmake coupe là où le navigateur a
  // coupé. ProseMirror pose `white-space: break-spaces` : l'espace qui finit une ligne compte dans sa largeur, pas chez pdfmake (qui coupe comme
  // `normal`), d'où un mot de plus sur une ligne que l'éditeur coupe. En retrancher une espace partout (comme le flux principal) règle ce cas et en
  // crée un autre : la dernière ligne, sans espace à sa fin, peut remplir la case à moins d'une espace près (un en-tête étroit : « 2027 (€) »,
  // « Projet (€) ») et pdfmake la coupe alors que l'éditeur la tient. On lit donc les lignes du navigateur (l'hôte de mesure) : la largeur de coupure doit
  // tenir dans la fenêtre qu'elles dessinent, au moins la plus large d'entre elles (aucune ne se recoupe), au plus la plus étroite d'une ligne et du
  // premier mot de la suivante (le mot que le navigateur n'a pas pu y mettre n'y tient pas non plus), la plus proche de la largeur de la case : ni le
  // centrage ni l'alignement à droite ne bougent quand rien ne presse. Négative quand la ligne la plus large touche le bord : le texte déborde de
  // WRAP_NOISE_PT dans le rembourrage plutôt que d'être recoupé par un écart de mesure entre le navigateur et pdfmake. Une espace, comme le flux
  // principal, quand les lignes ne se lisent pas ainsi (saut de ligne forcé, liste ou tableau dans le bloc) ou quand pdfmake a dû ramener la colonne
  // dans la page (les lignes du navigateur ne sont plus celles de cette largeur).
  const WRAP_NOISE_PT = 0.5;
  function cellWrapMarginPt(node, cellWidthPt) {
    const spacePt = spaceWidthPt();
    if (!(cellWidthPt > 0) || !node.isConnected || node.querySelector('br, ul, ol, table')) return spacePt;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const insetPx = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, property) => sum + (parseFloat(style[property]) || 0), 0);
    if (cellWidthPt < (rect.width - insetPx) * PX_TO_PT - 1) return spacePt;
    const range = document.createRange();
    range.selectNodeContents(node);
    // Une seule ligne dans le navigateur : rien à y couper, sauf à ne pas la recouper quand elle touche le bord.
    if (parseFloat(style.lineHeight) > 0 && rect.height < parseFloat(style.lineHeight) * 1.5) {
      return Math.max(-WRAP_NOISE_PT, Math.min(0, cellWidthPt - range.getBoundingClientRect().width * PX_TO_PT - WRAP_NOISE_PT));
    }
    const lines = groupWordsIntoLines(collectWords(node));
    const naturalPt = line => line.reduce((sum, w) => sum + w.right - w.left, 0) * PX_TO_PT + (line.length - 1) * spacePt;
    let widestPt = 0;
    let narrowestWithNextPt = Infinity;
    lines.forEach((line, i) => {
      widestPt = Math.max(widestPt, naturalPt(line));
      const next = lines[i + 1];
      if (next) narrowestWithNextPt = Math.min(narrowestWithNextPt, naturalPt(line) + spacePt + (next[0].right - next[0].left) * PX_TO_PT);
    });
    const floorPt = widestPt + WRAP_NOISE_PT;
    const ceilingPt = narrowestWithNextPt - WRAP_NOISE_PT;
    let wrapPt;
    if (floorPt <= ceilingPt) wrapPt = Math.min(Math.max(cellWidthPt, floorPt), ceilingPt);
    else wrapPt = narrowestWithNextPt > widestPt ? (widestPt + narrowestWithNextPt) / 2 : floorPt;
    // Jamais plus de débord que l'écart de mesure, jamais plus de retrait qu'une espace : le navigateur n'en a pas davantage.
    wrapPt = Math.min(Math.max(wrapPt, cellWidthPt - spacePt), cellWidthPt + WRAP_NOISE_PT);
    return cellWidthPt - wrapPt;
  }

  // Un élément de liste ou un paragraphe de la case, en un bloc de texte (une case à cocher et ses colonnes pour un élément de liste de tâches).
  function cellTextObject(node, runs, cellAlign, cellWidthPt) {
    const isLi = node.tagName === 'LI';
    const align = alignment(node) || cellAlign;
    if (isLi && isTaskListItem(node)) {
      return { columns: taskListColumns(node, taskListRuns(node, runs), align), margin: [measureIndentPt(node, 'box'), 0, 0, 0] };
    }
    const marker = isLi ? listMarkerFor(node) : '';
    const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
    const wrapMarginPt = !runs.length ? 0 : (isLi ? spaceWidthPt() : cellWrapMarginPt(node, cellWidthPt));
    const obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, wrapMarginPt, 0] };
    if (align) obj.alignment = align;
    if (!runs.length && node.tagName === 'P' && node.hasAttribute('data-caption')) obj.fontSize = Caption.SIZE_PT;
    return obj;
  }

  function cellLineObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
    if (line.inline) return inlineCellObject(line, cellAlign, cellBaseStyle, images, rootRect, nestedPending);
    const node = line;
    // Bloc de code dans une cellule de tableau : le même cadre gris que dans le flux principal, en tableau imbriqué à la largeur de la cellule.
    if (node.tagName === 'PRE') return codeBlockFrom(node, false, true);
    const floatBlocks = cellFloatBlocksFrom(node, cellWidthPt);
    if (floatBlocks) return floatBlocks;
    const before = images.length;
    const rawRuns = node.tagName === 'LI' ? inlineRunsExcludingNestedLists(node, cellBaseStyle, images) : inlineRuns(node, cellBaseStyle, images);
    const flowBlocks = cellFlowImageBlocksFrom(node, rawRuns, before, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending);
    if (flowBlocks) return flowBlocks;
    // Un paragraphe de la case où le navigateur ouvre une ligne par « : » (ou un signe voisin) : une ligne du navigateur par bloc, comme dans le flux
    // principal (signLineBlocksFrom).
    if (/^(P|DIV)$/.test(node.tagName) && !rawRuns.some(r => r._imageMarker)) {
      const signLines = signLineBlocksFrom(node, false, { nested: true, maxWidthPt: cellWidthPt, baseStyle: cellBaseStyle, textAlign: cellAlign });
      if (signLines) return signLines;
    }
    const obj = cellTextObject(node, trimEdgeWhitespace(stripImageMarkers(rawRuns)), cellAlign, cellWidthPt);
    attributeNestedPendingImages(images, before, obj, node, rootRect, nestedPending);
    return obj;
  }
  // La case rendue en stack pdfmake : les images en attente d'une position retrouvent leur tableau parent, et la case garde la liste de ce qui reste à
  // placer.
  function stackCell(finalStack, nestedPending) {
    nestedPending.forEach(p => { p.parentArray = finalStack; });
    const result = { stack: finalStack };
    if (nestedPending.length) result._nestedPending = nestedPending;
    return result;
  }
  // Une cellule multi-lignes devient un stack pdfmake ; sinon le texte reste à plat, sauf si des images ont été trouvées (pdfmake n'accepte pas
  // d'image au milieu d'un tableau de `text`, elle atterrit après le texte).
  function cellContentFrom(cell, cellWidthPt, rootRect) {
    const lines = [];
    collectCellLines(cell, lines);
    const images = [];
    const nestedPending = [];
    if (!lines.length) return { text: ' ' };
    if (lines.length === 1 && lines[0].inline) {
      const runs = trimEdgeWhitespace(stripImageMarkers(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }, images)));
      const textObj = { text: runs.length ? runs : ' ', margin: [0, 0, runs.length ? cellWrapMarginPt(cell, cellWidthPt) : 0, 0] };
      if (!images.length) return textObj;
      const finalStack = [textObj].concat(images);
      attributeNestedPendingImages(images, 0, textObj, cell, rootRect, nestedPending);
      return stackCell(finalStack, nestedPending);
    }
    const cellAlign = alignment(cell);
    const cellBaseStyle = inheritedStyle(cell, { fontSize: DEFAULT_FONT_SIZE });
    const stack = [];
    const floatState = { floatCarry: null, lastBottomPx: null };
    lines.forEach(line => {
      const obj = cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending, floatState);
      if (Array.isArray(obj)) obj.forEach(o => stack.push(o)); else stack.push(obj);
    });
    // Une image habillée plus basse que le texte de la case lui donne sa hauteur (la case contient ses flottantes) : le bas de la dernière ligne la
    // rejoint.
    if (floatState.floatCarry && floatState.lastBottomPx != null) {
      const lastFlow = stack.slice().reverse().find(b => b && !b._pendingImgNode && !b.absolutePosition);
      const extraPt = (floatState.floatCarry.floatBottomPx - floatState.lastBottomPx) * PX_TO_PT;
      if (extraPt > 0.5 && lastFlow) addBottomMargin(lastFlow, extraPt);
    }
    return stackCell(stack.concat(images), nestedPending);
  }

  const TABLE_BORDER_COLOR = '#777777'; // le trait fin d'un tableau, celui de départ d'une case de grille
  const TABLE_LINE_PT = 0.5; // sa largeur (layout), retranchée de la hauteur d'une ligne de grille
  const MIN_COLUMN_WIDTH_PT = 12;
  // Ce qui contient un tableau sans que celui-ci passe d'une page à l'autre : une case, une liste, une citation, un encadré, une colonne.
  const PAGE_FLOW_BREAKERS = 'td, th, li, blockquote, .callout, .two-columns-column';

  function tableFrom(node, pageBreakBefore, rootRect, inMainFlow) {
    const rows = ExportCommon.tableRows(node);
    const rawRows = rows.length ? rows : Array.from(node.querySelectorAll('tr'));
    const columnCount = tableColumnCount(rawRows);
    const pads = cellPaddingsPt(rawRows);
    const widths = columnWidthsPt(node, columnCount, pads.left + pads.right);
    const isGrid = rawRows.some(row => row.hasAttribute('data-row-height'));
    const t = {
      node, rawRows, rootRect, inMainFlow, columnCount, pads, widths, isGrid,
      layout: tableLayoutFor(pads),
      // Bords réglés d'une grille (barre de la case, js/table-borders.js) : le trait de départ est celui du layout ; pdfmake dessine un trait dès que
      // l'une des deux cases voisines le veut, et lit les bords d'une case fusionnée sur sa case de départ seule (les `{}` qui la prolongent n'y
      // changent rien : vérifié en lisant les traits du PDF) - chaque case porte donc ses quatre côtés, et les cases voisines, d'accord avec elle sur
      // le trait qu'elles se partagent, disent la même chose.
      borderSides: isGrid ? ExportCommon.cellBorderSides(node) : null,
      rowAreasPt: isGrid ? gridRowAreasPt(rawRows, pads) : null,
      // Images en calque imbriquées dans une case, portées sur `table._nestedPending`, remontées jusqu'à buildPdfContentFromRoot (même résolution que le
      // top-level).
      nestedPending: [],
    };
    const body = tableBodyFrom(t);
    return pdfTableFrom(t, body, pageBreakPlan(t, body), pageBreakBefore);
  }

  function tableColumnCount(rawRows) {
    const { cellsOf, spanOf } = ExportCommon;
    return Math.max(1, ...rawRows.map(row => cellsOf(row).reduce((sum, cell) => sum + spanOf(cell, 'colspan'), 0)));
  }

  // Le rembourrage d'une case, mesuré sur la première case du tableau plutôt qu'une constante approchée, qui creuserait un écart avec l'éditeur : il
  // sert au budget de largeur et à layout.padding*, un seul chiffre pour les deux.
  function cellPaddingsPt(rawRows) {
    const firstCell = rawRows.length ? ExportCommon.cellsOf(rawRows[0])[0] : null;
    const style = firstCell ? getComputedStyle(firstCell) : null;
    const measured = (property, fallbackPt) => (style ? (parseFloat(style[property]) || 0) * PX_TO_PT : fallbackPt);
    return { left: measured('paddingLeft', 4.5), right: measured('paddingRight', 4.5), top: measured('paddingTop', 3), bottom: measured('paddingBottom', 3) };
  }

  // Les largeurs des colonnes, en pt : celles du tableau mesuré dans l'éditeur, ramenées dans la page, sans rien retrancher d'autre : les traits et le
  // texte des colonnes tombent où l'éditeur les met (un tableau d'une page entière va jusqu'à la marge de droite, comme à l'écran). pdfmake ajoute
  // paddingLeft + paddingRight et un trait vertical à chaque colonne en plus de `widths`, et un trait de plus à la fin (vérifié en décodant le PDF) :
  // retirés avant de répartir, pour que le total rendu retombe sur la largeur de page. La coupure des lignes de chaque case se règle dans la case
  // (cellWrapMarginPt), pas ici : une largeur retranchée à chaque colonne rétrécissait le tableau (près de 5 % pour sept colonnes) et les en-têtes
  // étroits se coupaient sur une ligne de plus que dans l'éditeur.
  function columnWidthsPt(node, columnCount, cellPaddingPt) {
    const usablePt = Math.max(MIN_COLUMN_WIDTH_PT * columnCount, CONTENT_WIDTH_PT - columnCount * (cellPaddingPt + TABLE_LINE_PT) - TABLE_LINE_PT);
    const measuredPx = ExportCommon.measuredColumnWidthsPx(node, columnCount);
    const measuredPt = measuredPx ? measuredPx.map(px => px * PX_TO_PT) : null;
    const measuredSum = measuredPt ? measuredPt.reduce((sum, w) => sum + w, 0) : 0;
    return measuredSum > 0
      ? fitColumnWidths(measuredPt, measuredSum, usablePt)
      : Array(columnCount).fill(Math.max(MIN_COLUMN_WIDTH_PT, usablePt / columnCount));
  }

  // Les largeurs mesurées (`measuredPt`, de somme `sum`) sur le total visé : la largeur réelle du tableau si elle tient dans la page (un tableau
  // rétréci reste rétréci à l'export), `usablePt` au-delà. Aucune colonne sous le minimum : ce que le plancher ajoute est retiré aux colonnes plus
  // larges, au prorata.
  function fitColumnWidths(measuredPt, sum, usablePt) {
    const widths = measuredPt.map(w => (w / sum) * Math.min(sum, usablePt));
    const flooredTotal = widths.reduce((total, w) => total + Math.max(MIN_COLUMN_WIDTH_PT, w), 0);
    if (flooredTotal > usablePt) {
      const deficit = flooredTotal - usablePt;
      const aboveFloorTotal = widths.reduce((total, w) => total + (w > MIN_COLUMN_WIDTH_PT ? w : 0), 0) || 1;
      return widths.map(w => (w > MIN_COLUMN_WIDTH_PT ? Math.max(MIN_COLUMN_WIDTH_PT, w - deficit * (w / aboveFloorTotal)) : MIN_COLUMN_WIDTH_PT));
    }
    return widths.map(w => Math.max(MIN_COLUMN_WIDTH_PT, w));
  }

  function tableLayoutFor(pads) {
    return {
      hLineWidth: () => TABLE_LINE_PT, vLineWidth: () => TABLE_LINE_PT, hLineColor: () => TABLE_BORDER_COLOR, vLineColor: () => TABLE_BORDER_COLOR,
      paddingLeft: () => pads.left, paddingRight: () => pads.right, paddingTop: () => pads.top, paddingBottom: () => pads.bottom,
    };
  }

  // Grille (js/grid-editor.js) : chaque ligne porte sa hauteur en px (`data-row-height`, un minimum : un texte plus haut agrandit la ligne).
  // `heights` de pdfmake est la hauteur du contenu de la ligne, sans les marges intérieures ni le trait, et un minimum lui aussi ; la hauteur mesurée
  // dans l'hôte (qui compte la croissance due au texte) la complète.
  function gridRowAreasPt(rawRows, pads) {
    return rawRows.map(row => {
      const px = Math.max(parseFloat(row.getAttribute('data-row-height')) || 0, row.getBoundingClientRect().height);
      return Math.max(0, px * PX_TO_PT - pads.top - pads.bottom - TABLE_LINE_PT);
    });
  }

  // Le décalage haut d'une case de grille selon son alignement vertical : pdfmake ne centre rien dans une case, le centrage est une marge haute,
  // calculée sur la hauteur du texte mesurée dans l'hôte. Une case fusionnée sur plusieurs lignes se centre (ou se pose en bas) sur la hauteur de toutes
  // les lignes qu'elle couvre, traits et marges intérieures des lignes du milieu compris.
  function gridCellOffsetPt(t, cell, rowIndex, rowSpan) {
    const valign = cell.style.verticalAlign;
    if (valign !== 'middle' && valign !== 'bottom') return 0;
    let areaPt = (rowSpan - 1) * (t.pads.top + t.pads.bottom + TABLE_LINE_PT);
    for (let i = rowIndex; i < rowIndex + rowSpan; i += 1) areaPt += t.rowAreasPt[i];
    const range = document.createRange();
    range.selectNodeContents(cell);
    const free = Math.max(0, areaPt - range.getBoundingClientRect().height * PX_TO_PT);
    return valign === 'bottom' ? free : free / 2;
  }

  // Les lignes du corps, chacune de `columnCount` cases pdfmake. Une case fusionnée sur plusieurs lignes (`rowspan`) n'est pas répétée par le HTML dans
  // les lignes suivantes : pdfmake veut un emplacement vide ({}) à sa place, dans chaque colonne qu'elle couvre.
  function tableBodyFrom(t) {
    // `covered[colonne]` : le nombre de lignes, sous la ligne en cours, qu'une case venue d'au-dessus occupe encore dans cette colonne.
    const covered = new Array(t.columnCount).fill(0);
    return t.rawRows.map((row, rowIndex) => tableRowFrom(t, row, rowIndex, covered));
  }

  function tableRowFrom(t, row, rowIndex, covered) {
    const { columnCount, widths } = t;
    const { cellsOf, spanOf } = ExportCommon;
    const output = [];
    const skipCovered = () => { while (output.length < columnCount && covered[output.length] > 0) { covered[output.length] -= 1; output.push({}); } };
    cellsOf(row).forEach(cell => {
      skipCovered();
      if (output.length >= columnCount) return;
      const colSpan = fittingColSpan(spanOf(cell, 'colspan'), output.length, columnCount, covered);
      const rowSpan = Math.min(t.rawRows.length - rowIndex, spanOf(cell, 'rowspan'));
      const cellWidthPt = widths.slice(output.length, output.length + colSpan).reduce((sum, w) => sum + w, 0) || null;
      const pdfCell = pdfTableCell(t, cell, cellWidthPt, rowIndex, rowSpan);
      if (colSpan > 1) pdfCell.colSpan = colSpan;
      if (rowSpan > 1) {
        pdfCell.rowSpan = rowSpan;
        for (let i = 0; i < colSpan; i += 1) covered[output.length + i] = rowSpan - 1;
      }
      output.push(pdfCell);
      for (let i = 1; i < colSpan; i += 1) output.push({});
    });
    skipCovered();
    while (output.length < columnCount) output.push({ text: ' ', border: [true, true, true, true] });
    return output.slice(0, columnCount);
  }

  // L'étendue d'une case de la colonne `from` (`wanted` : son colspan) : bornée au reste de la ligne, jamais par-dessus une colonne déjà prise par une
  // case d'au-dessus (HTML venu d'ailleurs, mal formé).
  function fittingColSpan(wanted, from, columnCount, covered) {
    let colSpan = Math.min(columnCount - from, wanted);
    for (let i = 1; i < colSpan; i += 1) if (covered[from + i] > 0) { colSpan = i; break; }
    return colSpan;
  }

  // Le contenu d'une case ; une structure inattendue se replie en texte brut plutôt que de faire échouer l'export.
  function safeCellContent(cell, cellWidthPt, rootRect) {
    try { return cellContentFrom(cell, cellWidthPt, rootRect); }
    catch (e) {
      console.warn('[PdfExport] cellule de tableau ignorée (structure inattendue), repli en texte brut :', e);
      return { text: (cell.textContent || '').trim() || ' ' };
    }
  }

  // Une case pdfmake : son contenu, son alignement, son fond, ses bords (grille) et son décalage vertical (grille). Pas de margin propre à la case : le
  // seul inset est layout.padding*, déjà compté dans la largeur utilisable.
  function pdfTableCell(t, cell, cellWidthPt, rowIndex, rowSpan) {
    const content = safeCellContent(cell, cellWidthPt, t.rootRect);
    if (content._nestedPending) { t.nestedPending.push(...content._nestedPending); delete content._nestedPending; }
    const pdfCell = Object.assign({ border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
    if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
    if (cell.style.backgroundColor) pdfCell.fillColor = cssColorToHex(cell.style.backgroundColor);
    const sides = t.borderSides && t.borderSides.get(cell);
    if (sides) {
      const edges = [sides.left, sides.top, sides.right, sides.bottom];
      pdfCell.border = edges.map(edge => edge !== TableBorders.NONE);
      pdfCell.borderColor = edges.map(edge => (edge && edge !== TableBorders.NONE ? edge : TABLE_BORDER_COLOR));
    }
    if (t.isGrid) {
      const offsetPt = gridCellOffsetPt(t, cell, rowIndex, rowSpan);
      if (offsetPt > 0.25) pdfCell.margin = [0, (pdfCell.margin ? pdfCell.margin[1] : 0) + offsetPt, 0, 0];
    }
    return pdfCell;
  }

  // Les lignes du tableau telles que pdfmake les reçoit, et ce qui règle leurs coupures de page : { rows, headerRows, dontBreakRows }.
  //
  // Une ligne ne se coupe jamais entre deux pages : elle passe en entier à la page suivante quand elle ne tient pas, comme dans l'éditeur et la
  // Lecture (js/table-page-cut.js) et dans le Word (cantSplit) ; les lignes qu'une case fusionnée sur plusieurs lignes lie (js/table-page-cut.js:unitsOf)
  // passent ensemble. Mais avec dontBreakRows, pdfmake perd le texte d'une case fusionnée (mesuré : 12 lignes de texte sur 16) : le groupe devient une
  // seule ligne du tableau, dont l'unique case, sur toutes les colonnes, porte le tableau des lignes du groupe, cases fusionnées comprises (`unitRowFrom`).
  // Mêmes colonnes, mêmes traits, mêmes marges : le PDF relu par pdf.js a les textes et les traits aux mêmes positions que le tableau à plat.
  //
  // Les lignes de titres (cases <th> en tête) reviennent en haut de chaque page où le tableau se poursuit, comme dans le Word (`tblHeader`). Pour un
  // tableau du texte courant seulement : celui d'une case, d'une liste, d'une citation, d'un encadré ou d'une colonne ne passe pas d'une page à l'autre,
  // et une grille (js/grid-editor.js) n'a pas de feuille.
  function pageBreakPlan(t, body) {
    const { node, rawRows } = t;
    const inPageFlow = !t.isGrid && !!t.inMainFlow && !(node.parentElement && node.parentElement.closest(PAGE_FLOW_BREAKERS));
    const headerRows = inPageFlow ? ExportCommon.headerRowCount(rawRows) : 0;
    const cutRows = TablePageCut.rowsOf(node);
    const cutUnits = cutRows && cutRows.length === rawRows.length ? TablePageCut.unitsOf(cutRows) : null;
    const dontBreakRows = !!cutUnits && inPageFlow && rowsFitInPage(node, cutRows, cutUnits);
    if (!dontBreakRows || !cutUnits.some(unit => unit.to - unit.from > 1)) return { rows: body, headerRows, dontBreakRows };
    return {
      rows: cutUnits.map(unit => (unit.to - unit.from > 1 ? unitRowFrom(t, body.slice(unit.from, unit.to)) : body[unit.from])),
      // Les lignes de titres finissent toujours entre deux groupes (headerRowCount s'arrête avant une case fusionnée qui déborde) : leur nombre, en
      // groupes.
      headerRows: cutUnits.filter(unit => unit.to <= headerRows).length,
      dontBreakRows,
    };
  }

  // Les groupes de lignes tiennent chacun dans une page (avec dontBreakRows, pdfmake fait disparaître une ligne plus haute que la page ; les autres
  // tableaux gardent leurs lignes coupées entre deux lignes de texte, l'éditeur les garde d'une pièce), et le tableau ne porte aucune image qui lit la
  // position de son texte : avec dontBreakRows, pdfmake note les positions (`positions[].left` et `.top`) du texte de ses cases dans la ligne en cours
  // de rangement, sans le décalage de la colonne ni le rembourrage de la case (mesuré : 28 pt au lieu de 383,7 dans la 3e colonne), et l'ancrage d'une
  // image en calque ancienne (sans grille de page) ou habillée (ancrée sur son texte) se lit dessus : elle partirait à gauche de la page.
  function rowsFitInPage(node, cutRows, cutUnits) {
    if (!(tablePageHeightPt > 0)) return false;
    const layerOf = img => img.getAttribute('data-layer') || 'normal';
    const hasLayeredImage = Array.from(node.querySelectorAll('img')).some(img => layerOf(img) !== 'normal' && img.style.position === 'absolute');
    const hasFloatedImage = Array.from(node.querySelectorAll('img.editor-image')).some(img => layerOf(img) === 'normal' && /^(left|right)$/.test(img.getAttribute('data-align') || ''));
    if (hasLayeredImage || hasFloatedImage) return false;
    const unitHeightsPt = cutUnits.map(unit => (cutRows[unit.to - 1].getBoundingClientRect().bottom - cutRows[unit.from].getBoundingClientRect().top) * PX_TO_PT);
    return TablePageCut.rowsFit(unitHeightsPt, tablePageHeightPt);
  }

  // Le tableau d'un groupe de lignes, à la place de ses lignes : le trait de son contour est celui de la ligne qui le porte (hLineWidth et vLineWidth
  // à 0 aux bords), et ses marges négatives reprennent le rembourrage de cette ligne, que le tableau imbriqué n'a pas à compter.
  function unitRowFrom(t, unitBody) {
    const { layout, widths, pads, columnCount } = t;
    const inner = Object.assign({}, layout, {
      hLineWidth: (i, tableNode) => (i === 0 || i === tableNode.table.body.length ? 0 : layout.hLineWidth(i, tableNode)),
      vLineWidth: (i, tableNode) => (i === 0 || i === tableNode.table.widths.length ? 0 : layout.vLineWidth(i, tableNode)),
    });
    const unitTable = { table: { widths: widths.slice(), body: unitBody }, layout: inner, margin: [-pads.left, -pads.top, -pads.right, -pads.bottom], colSpan: columnCount, border: [true, true, true, true], _unitTable: true };
    return [unitTable].concat(Array.from({ length: columnCount - 1 }, () => ({})));
  }

  // Le tableau pdfmake : ses lignes (celles du corps, ou leurs groupes), sa mise en page, et ce qui remonte au contenu : les images en calque de ses
  // cases, et, pour une grille, ses tranches de sauts de page (`data-page-break-before` sur une ligne : celles que tableBlocksFrom en fera).
  function pdfTableFrom(t, body, plan, pageBreakBefore) {
    const { columnCount, widths, isGrid } = t;
    const emptyRow = [[{ text: ' ' }].concat(Array(Math.max(0, columnCount - 1)).fill({}))];
    const table = {
      table: Object.assign({ headerRows: plan.headerRows, widths, body: plan.rows.length ? plan.rows : emptyRow }, isGrid && body.length ? { heights: t.rowAreasPt } : {}, plan.dontBreakRows ? { dontBreakRows: true } : {}),
      layout: t.layout,
      margin: [0, 5, 0, 5],
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    if (t.nestedPending.length) table._nestedPending = t.nestedPending;
    if (isGrid && body.length) {
      const segments = ExportCommon.gridRowSegments(t.rawRows);
      if (segments.length > 1) table._rowSegments = segments;
    }
    return table;
  }

  // Un tableau en un ou plusieurs blocs : une grille dont des lignes portent un saut de page (js/grid-editor.js) est coupée avant chacune, et chaque
  // morceau ouvre une page (le premier garde le saut que le tableau avait déjà). Les colonnes, le trait et les hauteurs sont ceux du tableau entier :
  // tous les morceaux se lisent à la même largeur.
  //
  // « Rester ensemble » (js/caption.js) : un tableau qui se coupe entre deux lignes et que suit une légende (`captionPt`, sa hauteur) est rendu en
  // deux morceaux, tout sauf la dernière ligne puis la dernière ligne seule (`_keepTail`) : c'est elle, avec la légende, que captionKeepRule passe à
  // la page suivante quand la légende y serait seule. Collés, les deux morceaux ne se distinguent pas du tableau entier (le trait entre eux n'est
  // dessiné qu'une fois, par le premier) ; la dernière ligne qui ouvre une page dessine son trait du haut. Seulement quand la dernière ligne et la
  // légende tiennent ensemble dans une page (Caption.fitsWithCaption) : sinon le tableau reste d'une pièce.
  function splitTailRow(table, node, captionPt) {
    const body = table.table.body;
    const rows = TablePageCut.rowsOf(node);
    // Les lignes du tableau sont ses groupes de lignes (tableFrom : un groupe lié par une case fusionnée est une seule ligne) : le dernier est celui
    // qui garde sa légende.
    const units = rows ? TablePageCut.unitsOf(rows) : null;
    if (!table.table.dontBreakRows || body.length < 2 || !units || units.length !== body.length) return null;
    const lastUnit = units[units.length - 1];
    const tailPt = (rows[lastUnit.to - 1].getBoundingClientRect().bottom - rows[lastUnit.from].getBoundingClientRect().top) * PX_TO_PT + captionPt;
    if (!Caption.fitsWithCaption(tailPt, tablePageHeightPt)) return null;
    // Les lignes de titres restent au premier morceau (jamais toutes les lignes de lui : pdfmake ne reprend rien au-dessus de rien) ; la dernière
    // ligne, seule, n'en reprend pas.
    const head = Object.assign({}, table, { table: Object.assign({}, table.table, { body: body.slice(0, -1), headerRows: Math.min(table.table.headerRows || 0, body.length - 2) }), margin: [0, 5, 0, 0] });
    const baseLayout = table.layout;
    const tail = Object.assign({}, table, {
      table: Object.assign({}, table.table, { body: body.slice(-1), headerRows: 0 }),
      margin: [0, 0, 0, 5],
      layout: Object.assign({}, baseLayout, { hLineWidth: (i, tableNode) => (i === 0 && tableNode.pageBreak !== 'before' ? 0 : baseLayout.hLineWidth(i, tableNode)) }),
      _keepTail: true,
      _keepUnitPt: tailPt,
    });
    delete tail.pageBreak;
    delete tail._nestedPending;
    return [head, tail];
  }
  function tableBlocksFrom(node, pageBreakBefore, rootRect, inMainFlow, captionPt) {
    const table = tableFrom(node, pageBreakBefore, rootRect, inMainFlow);
    const segments = table._rowSegments;
    delete table._rowSegments;
    if (!segments) return (captionPt > 0 && splitTailRow(table, node, captionPt)) || [table];
    return segments.map(([from, to], i) => {
      const piece = Object.assign({}, table, { table: Object.assign({}, table.table, { body: table.table.body.slice(from, to), heights: table.table.heights.slice(from, to) }) });
      if (i > 0) { piece.pageBreak = 'before'; delete piece._nestedPending; }
      return piece;
    });
  }

  // Le chrome CSS (padding et bordure) d'un élément d'un côté ('Left', 'Right', 'Top' ou 'Bottom'), en points.
  function chromePt(el, side) {
    const cs = getComputedStyle(el);
    return ((parseFloat(cs['padding' + side]) || 0) + (parseFloat(cs['border' + side + 'Width']) || 0)) * PX_TO_PT;
  }

  // La largeur du texte d'une colonne mesurée, sans son padding ni sa bordure.
  function columnTextWidthPt(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    const bL = parseFloat(cs.borderLeftWidth) || 0, bR = parseFloat(cs.borderRightWidth) || 0;
    return Math.max(10, (r.width - padL - padR - bL - bR) * PX_TO_PT);
  }

  // Zone 2 colonnes : mesure le chrome CSS réel (padding, bordure, largeur) en clonant la zone dans un hôte hors écran, plutôt que de deviner ces
  // valeurs. Colonnes toujours 50/50 (flex: 1 1 0), pas de ratio ajustable. `widthPt` : la largeur du texte de chaque colonne, `outerWidthPt` : celle
  // de sa boîte, `inset*` : son propre chrome (css/style.css .two-columns-column) - sans lui, tout le contenu d'une colonne, texte comme image en
  // calque, serait décalé de la hauteur de ce chrome (~5-9 pt selon le CSS) -, `zone*` : celui de la zone.
  function measureTwoColumns(node) {
    const measureHost = document.createElement('div');
    measureHost.className = 'tiptap';
    measureHost.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + CONTENT_WIDTH_PT / PX_TO_PT + 'px;';
    const zoneClone = node.cloneNode(true);
    measureHost.appendChild(zoneClone);
    document.body.appendChild(measureHost);
    const measuredCols = Array.from(zoneClone.querySelectorAll(':scope > .two-columns-column'));
    const perColumn = (measure, fallback) => [0, 1].map(i => (measuredCols[i] ? measure(measuredCols[i]) : fallback(i)));
    const widthPt = perColumn(columnTextWidthPt, () => CONTENT_WIDTH_PT / 2);
    // La zone a aussi sa propre marge CSS (css/editor-v2.css : `.two-columns-zone { margin: 6px 0; }`), distincte de son padding et de sa bordure :
    // sans elle, le contenu de la zone serait décalé de ~4.5 pt vers le haut par rapport à l'éditeur. Mesurée ici, tant que zoneClone est attaché
    // à measureHost : getComputedStyle sur un nœud détaché (après le removeChild plus bas) renvoie padding et bordure à 0.
    const zoneCs = getComputedStyle(zoneClone);
    const measured = {
      widthPt,
      outerWidthPt: perColumn(el => el.getBoundingClientRect().width * PX_TO_PT, i => widthPt[i]),
      zoneChromeLeftPt: chromePt(zoneClone, 'Left'),
      zoneOwnTopPt: chromePt(zoneClone, 'Top') + (parseFloat(zoneCs.marginTop) || 0) * PX_TO_PT,
      zoneOwnBottomPt: chromePt(zoneClone, 'Bottom') + (parseFloat(zoneCs.marginBottom) || 0) * PX_TO_PT,
      // Pas de compensation spaceWidthPt() pour la largeur, contrairement à tableFrom : columnTextWidthPt mesure la largeur réelle du texte, déjà
      // assez stricte (avec elle, un mot de moins que dans l'éditeur tiendrait par ligne).
      insetLeft: perColumn(el => chromePt(el, 'Left'), () => 0),
      insetRight: perColumn(el => chromePt(el, 'Right'), () => 0),
      insetTop: perColumn(el => chromePt(el, 'Top'), () => 0),
      insetBottom: perColumn(el => chromePt(el, 'Bottom'), () => 0),
    };
    document.body.removeChild(measureHost);
    return measured;
  }

  // Le contenu de chaque colonne en blocs pdfmake. Séquentiel (pas Promise.all) : footnoteCounter et footnoteEntries sont un état de module, deux
  // appels en parallèle s'entrelaceraient si l'un attend un décodage d'image et corrompraient la numérotation des notes. Deux colonnes au plus :
  // coût négligeable.
  async function twoColumnsContent(colNodes, widthPt) {
    const columns = [];
    for (let colIdx = 0; colIdx < colNodes.length; colIdx += 1) {
      const col = colNodes[colIdx];
      let blocks;
      // La largeur réelle de cette colonne, pour que l'hôte de mesure interne de htmlToPdfContent habille une image flottante à la bonne largeur
      // plutôt qu'à la pleine largeur de page.
      try { blocks = await htmlToPdfContent(col.innerHTML, false, widthPt[colIdx]); }
      catch (e) { console.warn('[PdfExport] contenu de colonne ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(col, false)]; }
      // Pas de ré-application de l'alignement ici : blockFrom (via htmlToPdfContent) lit déjà `text-align` de chaque paragraphe, colonne ou non. Le
      // réaffecter par index au « bloc qui s'y trouve » appliquerait `alignment` par-dessus l'`absolutePosition` d'une image en calque seule dans un
      // paragraphe centré (pdfmake le fait passer devant : l'image se décale de dizaines de pt), et un paragraphe peut donner plusieurs blocs (texte
      // puis image), ce qui désynchroniserait le pairage par index.
      columns.push(blocks);
    }
    return columns;
  }

  // Les images en calque des colonnes, remontées à la zone (resolvePendingImageAnchors les résout comme celles du premier niveau). La zone
  // (`node`) a son propre position: relative (css/style.css, règle générique) : c'est donc l'offsetParent d'une image en calque ici, ni .tiptap ni
  // la colonne. Les ancres locales (container, above, below) sont mesurées depuis le début du contenu de la colonne (l'isolat rendu pour
  // htmlToPdfContent) : l'image doit être ramenée à ce référentiel.
  function columnPendingImages(columns, colNodes, node, rootRect) {
    const zoneRect = node.getBoundingClientRect();
    const nestedPending = [];
    columns.forEach((colBlocks, colIdx) => {
      const pending = colBlocks._pendingImages || [];
      if (pending.length) {
        const colNode = colNodes[colIdx];
        const colRect = colNode.getBoundingClientRect();
        // Les ancres container, above et below (…TopPx, …LeftPx) sont mesurées dans l'isolat de htmlToPdfContent(col.innerHTML, …), qui ne contient
        // que les enfants de la colonne : son padding et sa bordure (css/style.css : 6 px + 1 px) n'y existent pas, elles sont donc relatives au
        // début du contenu, pas au bord de la boîte. colRect (getBoundingClientRect) mesure la boîte de bordure : sans ce décalage, l'image tomberait
        // ~7 px (~5 pt) trop à gauche et en haut par rapport au texte.
        const colCs = getComputedStyle(colNode);
        const colContentTop = colRect.top + (parseFloat(colCs.paddingTop) || 0) + (parseFloat(colCs.borderTopWidth) || 0);
        const colContentLeft = colRect.left + (parseFloat(colCs.paddingLeft) || 0) + (parseFloat(colCs.borderLeftWidth) || 0);
        pending.forEach(p => {
          if (p.container || p.above || p.below) {
            p.imgTopPx += A4_PREVIEW_PADDING_TOP_PX + (zoneRect.top - colContentTop);
            p.imgLeftPx += A4_PREVIEW_PADDING_LEFT_PX + (zoneRect.left - colContentLeft);
          } else {
            // Aucune ancre : repli générique page-relatif (resolveImageAbsolutePosition) - ramène à la position réelle de la zone dans le document.
            p.imgTopPx += zoneRect.top - rootRect.top;
            p.imgLeftPx += zoneRect.left - rootRect.left;
          }
          nestedPending.push(p);
        });
      }
      delete colBlocks._pendingImages;
    });
    return nestedPending;
  }

  async function twoColumnsFrom(node, pageBreakBefore, rootRect) {
    const colNodes = Array.from(node.querySelectorAll(':scope > .two-columns-column')).slice(0, 2);
    if (colNodes.length < 2) return fallbackTextBlock(node, pageBreakBefore);
    const m = measureTwoColumns(node);
    const columns = await twoColumnsContent(colNodes, m.widthPt);
    const block = {
      columns: columns.map((stack, i) => ({ width: m.outerWidthPt[i], stack: [{ stack, margin: [m.insetLeft[i], m.insetTop[i], m.insetRight[i], m.insetBottom[i]] }] })),
      columnGap: PageLayout.COLUMN_GAP_PX * PX_TO_PT,
      margin: [m.zoneChromeLeftPt, m.zoneOwnTopPt, 0, m.zoneOwnBottomPt],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
    const nestedPending = columnPendingImages(columns, colNodes, node, rootRect);
    if (nestedPending.length) block._nestedPending = nestedPending;
    return block;
  }

  // L'habillage que garde un conteneur dont l'image habillée dépasse le bas (`null` : aucune ne le dépasse) : le même objet que celui qu'un
  // paragraphe passe au suivant (floatParagraphBlocksFrom), mesuré dans le DOM.
  function floatOverflowCarryOf(container) {
    const box = container.getBoundingClientRect();
    let carry = null;
    Array.from(container.querySelectorAll('img.editor-image')).forEach(img => {
      const align = img.getAttribute('data-align');
      if ((img.getAttribute('data-layer') || 'normal') !== 'normal' || (align !== 'left' && align !== 'right')) return;
      const rect = img.getBoundingClientRect();
      const floatBottomPx = rect.bottom + FLOAT_BELOW_MARGIN_PX;
      // Le texte d'après repart du bord du conteneur, et laisse à l'image sa marge côté texte : la place prise est celle qui va de ce bord à l'autre
      // bord de l'image, marge comprise.
      const shiftPx = align === 'left' ? rect.right + FLOAT_SIDE_MARGIN_PX - box.left : box.right - (rect.left - FLOAT_SIDE_MARGIN_PX);
      if (floatBottomPx > box.bottom + 0.5 && (!carry || floatBottomPx > carry.floatBottomPx)) carry = { overlay: true, floatBottomPx, align, shiftPt: shiftPx * PX_TO_PT };
    });
    return carry;
  }

  // Encadré (js/callout.js) : un tableau pdfmake à une ligne et deux colonnes - l'icône (PNG tracé d'après les mêmes dessins que le CSS) à gauche,
  // les blocs de l'encadré à droite, mis en page comme ceux d'une colonne (htmlToPdfContent sur leur HTML, à la largeur de texte mesurée). Le fond
  // teinté et la barre de couleur viennent de la mise en page du tableau (fillColor, filet gauche) ; aucun autre trait. Toutes les mesures sont
  // prises sur le CSS réel (css/callout.css), pas recopiées. La ligne du tableau se coupe d'une page à l'autre comme un long paragraphe.
  async function calloutFrom(node, pageBreakBefore, rootRect) {
    const m = ExportCommon.calloutMetricsPx(node);
    const barPt = m.barPx * PX_TO_PT, padLeftPt = m.padLeftPx * PX_TO_PT, padRightPt = m.padRightPx * PX_TO_PT;
    const padTopPt = m.padTopPx * PX_TO_PT, padBottomPt = m.padBottomPx * PX_TO_PT;
    const marginTopPt = m.marginTopPx * PX_TO_PT, marginBottomPt = m.marginBottomPx * PX_TO_PT;
    const iconSizePt = m.iconSizePx * PX_TO_PT, iconLeftPt = m.iconLeftPx * PX_TO_PT, iconTopPt = m.iconTopPx * PX_TO_PT;
    const innerWidthPt = Math.max(30, node.getBoundingClientRect().width * PX_TO_PT - barPt - padLeftPt - padRightPt);
    let blocks;
    try { blocks = await htmlToPdfContent(node.innerHTML, false, innerWidthPt, { floatsOverflow: true }); }
    catch (e) { console.warn('[PdfExport] contenu d\'encadré ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(node, false)]; }
    const color = Callout.colorOf(node.getAttribute('data-color'));
    const iconKey = node.getAttribute('data-icon');
    // L'icône est posée dans l'éditeur (position: absolute) : elle ne donne pas sa hauteur à l'encadré, qui ne dépend que de son texte. La cellule de
    // l'icône ne compte donc pour aucune hauteur dans la ligne du tableau : sa marge du dessous reprend ce que l'icône et sa marge du dessus ajoutent
    // (sans elle, un encadré d'une seule ligne, dont le texte est plus court que l'icône avec sa marge, grandissait de 1,6 pt).
    const iconTopGapPt = Math.max(0, iconTopPt - padTopPt);
    const block = {
      table: {
        widths: [iconSizePt, '*'],
        body: [[
          { image: Callout.iconPng(iconKey, color.accent, 96), width: iconSizePt, height: iconSizePt, margin: [0, iconTopGapPt, 0, -(iconTopGapPt + iconSizePt)] },
          { stack: blocks },
        ]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: i => (i === 0 ? barPt : 0),
        vLineColor: () => color.accent,
        fillColor: () => color.tint,
        paddingLeft: i => (i === 0 ? iconLeftPt : 0),
        paddingRight: i => (i === 0 ? Math.max(0, padLeftPt - iconLeftPt - iconSizePt) : padRightPt),
        paddingTop: () => padTopPt,
        paddingBottom: () => padBottomPt,
      },
      margin: [0, marginTopPt, 0, marginBottomPt],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
    block._isCallout = true;
    // Images en calque dans l'encadré : même ramenée au référentiel de la page que pour une colonne (l'encadré est, comme la zone 2 colonnes, le
    // parent positionné de ses images - css/callout.css : position: relative -, et ses ancres locales partent du début de son contenu).
    const pending = blocks._pendingImages || [];
    if (pending.length) {
      const rect = node.getBoundingClientRect();
      const contentTop = rect.top + m.padTopPx;
      const contentLeft = rect.left + m.padLeftPx + m.barPx;
      pending.forEach(p => {
        if (p.container || p.above || p.below) {
          p.imgTopPx += A4_PREVIEW_PADDING_TOP_PX + (rect.top - contentTop);
          p.imgLeftPx += A4_PREVIEW_PADDING_LEFT_PX + (rect.left - contentLeft);
        } else {
          p.imgTopPx += rect.top - rootRect.top;
          p.imgLeftPx += rect.left - rootRect.left;
        }
      });
      block._nestedPending = pending.slice();
    }
    delete blocks._pendingImages;
    // Une image habillée plus haute que l'encadré ne l'agrandit pas (css/callout.css : overflow visible) : elle le dépasse, et le texte d'après se
    // range encore à côté d'elle.
    const overflow = floatOverflowCarryOf(node);
    if (overflow) block._floatCarryOut = overflow;
    return block;
  }

  // Chemin d'indices de `root` jusqu'à `target` (ex. [2,0,1]) - permet de retrouver le même nœud dans un clone de `root`.
  function nodePathTo(root, target) {
    const path = [];
    let cur = target;
    while (cur && cur !== root) {
      const parent = cur.parentNode;
      if (!parent) return null;
      path.unshift(Array.from(parent.childNodes).indexOf(cur));
      cur = parent;
    }
    return cur === root ? path : null;
  }
  function nodeAtPath(root, path) {
    let cur = root;
    for (const idx of path) { if (!cur) return null; cur = cur.childNodes[idx]; }
    return cur;
  }
  // Retire, à chaque niveau entre `marker` et `root`, tout ce qui suit - laisse un arbre ne contenant que ce qui précède marker, tout en conservant
  // les éléments ancêtres pour ce qu'ils contiennent avant. `keepNotes` : les notes de bas de page qui suivent aussitôt la coupure restent (une note
  // n'a aucun texte : coupée entre deux morceaux elle tomberait dans l'écart et disparaîtrait ; elle suit toujours le mot qui la précède, c'est avec
  // lui qu'elle se lit).
  function removeAfter(root, marker, keepNotes) {
    let node = marker;
    let touching = !!keepNotes;
    while (node !== root) {
      const parent = node.parentNode;
      let sib = node.nextSibling;
      while (sib) {
        const next = sib.nextSibling;
        if (touching && sib.nodeType === Node.ELEMENT_NODE && sib.classList.contains('footnote-ref-marker')) { sib = next; continue; }
        touching = false;
        parent.removeChild(sib);
        sib = next;
      }
      node = parent;
    }
  }
  function removeBefore(root, marker) {
    let node = marker;
    while (node !== root) {
      const parent = node.parentNode;
      let sib = node.previousSibling;
      while (sib) { const prev = sib.previousSibling; parent.removeChild(sib); sib = prev; }
      node = parent;
    }
  }
  // Tous les mots du texte de `node` (encore attaché à l'hôte de mesure, donc réellement mis en page par le float CSS), avec la position Y réelle de
  // la ligne sur laquelle chacun tombe.
  function collectWords(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const words = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      const value = textNode.nodeValue;
      let i = 0;
      while (i < value.length) {
        while (i < value.length && /\s/.test(value[i])) i += 1;
        const start = i;
        while (i < value.length && !/\s/.test(value[i])) i += 1;
        if (i > start) {
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, i);
          const r = range.getBoundingClientRect();
          words.push({ textNode, start, end: i, index: words.length, top: r.top, bottom: r.bottom, left: r.left, right: r.right });
        }
      }
    }
    return words;
  }
  // Extrait les runs pdfmake du texte de `node` entre startCut/endCut ({textNode,offset} ou null = jusqu'au bord) - clone `node` puis tronque, sans
  // jamais modifier `node` lui-même (rappelable sur d'autres plages).
  function extractRunsBetweenRaw(node, startCut, endCut, baseStyle) {
    // Les notes de bas de page du texte sont numérotées dans l'ordre du texte avant toute copie, quelle que soit la plage lue en premier.
    node.querySelectorAll('.footnote-ref-marker').forEach(footnoteNumberOf);
    const clone = node.cloneNode(true);
    if (endCut) {
      const target = nodeAtPath(clone, nodePathTo(node, endCut.textNode));
      const touchesNotes = /^\s*$/.test(target.nodeValue.slice(endCut.offset));
      target.nodeValue = target.nodeValue.slice(0, endCut.offset);
      removeAfter(clone, target, touchesNotes);
    }
    if (startCut) {
      const target = nodeAtPath(clone, nodePathTo(node, startCut.textNode));
      target.nodeValue = target.nodeValue.slice(startCut.offset);
      removeBefore(clone, target);
    }
    return stripImageMarkers(inlineRuns(clone, baseStyle || { fontSize: DEFAULT_FONT_SIZE }, []));
  }
  function extractRunsBetween(node, startCut, endCut, baseStyle) {
    return trimEdgeWhitespace(extractRunsBetweenRaw(node, startCut, endCut, baseStyle));
  }

  // Étirement d'une ligne justifiée jusqu'à `targetWidthPt` : l'écart est réparti entre les mots (characterSpacing de pdfmake n'agit qu'entre les
  // caractères d'un même run, jamais en bordure) ; `lineWords` est un sous-ensemble de collectWords().
  //
  // Marge de sécurité de l'estimation : viser exactement la largeur laisserait un écart nul avec pdfmake, et un sous-pixel d'arrondi suffit à faire
  // recouper la ligne (un mot bascule sur une ligne en trop) ; un léger sous-étirement invisible vaut mieux. pdfmake retrouve la largeur des mots
  // mesurée dans le navigateur à ±1,5 pt près (il coupe chaque mot avant sa dernière lettre pour y poser l'écart, ce qui perd le crénage de la
  // paire). Une fois la largeur réelle mesurée (learnStretchedLines), c'est STRETCH_LEARNED_SAFETY_PT qui reste.
  const STRETCH_SAFETY_PT = 2;
  const STRETCH_LEARNED_SAFETY_PT = 0.3;
  const STRETCH_MAX_SQUEEZE_PT = 0.5; // au plus, ce dont une ligne mesurée trop large peut resserrer chacun de ses intervalles
  function buildJustifiedLine(node, lineWords, startCut, endCut, targetWidthPt, baseStyle) {
    const gaps = lineWords.length - 1;
    // Pas (dernier mot.right - premier mot.left) : le paragraphe est déjà justifié en CSS, la ligne rendue est donc déjà étirée et la mesurer ainsi
    // ramènerait extraPt vers 0. On somme la largeur propre de chaque mot (que le justify n'affecte pas) plus une espace normale par intervalle.
    const naturalWidthPt = lineWords.reduce((sum, w) => sum + (w.right - w.left), 0) * PX_TO_PT + gaps * spaceWidthPt();
    const key = lineWords.map(w => w.textNode.nodeValue.slice(w.start, w.end)).join(' ') + '|' + targetWidthPt.toFixed(2) + '|' + naturalWidthPt.toFixed(1);
    const learned = stretchExtra.get(key);
    const extraPt = learned !== undefined ? learned : (gaps > 0 ? Math.max(0, (targetWidthPt - STRETCH_SAFETY_PT) - naturalWidthPt) / gaps : 0);
    // Une ligne trop peu étirable pour la marge de l'estimation (extraPt nul) est tout de même coupée en morceaux à la première passe, pour que la
    // passe de mesure lui trouve sa largeur et que la suivante l'étire de ce qui reste : le navigateur, lui, la justifie. Une ligne mesurée reste
    // coupée (la largeur mesurée est celle des morceaux, que le crénage perdu aux coupures rend un peu plus large qu'un seul run) : son écart peut
    // être négatif, de quelques centièmes de point, quand les morceaux sont déjà plus larges que la ligne du navigateur.
    const measurable = stretching && learned === undefined && gaps > 0 && targetWidthPt - naturalWidthPt >= STRETCH_LEARNED_SAFETY_PT;
    if (gaps <= 0 || (learned === undefined && extraPt < 0.01 && !measurable)) {
      return trimEdgeWhitespace(extractRunsBetweenRaw(node, startCut, endCut, baseStyle));
    }
    const runs = [];
    // Pour learnStretchedLines : de quoi retrouver cette ligne et la largeur visée.
    runs.stretch = { key, gaps, extraPt, targetPt: targetWidthPt };
    let cursor = startCut;
    for (let i = 0; i < lineWords.length - 1; i += 1) {
      const w = lineWords[i];
      const next = lineWords[i + 1];
      const wordEndCut = { textNode: w.textNode, offset: w.end - 1 };
      runs.push(...extractRunsBetweenRaw(node, cursor, wordEndCut, baseStyle));
      const gapRuns = extractRunsBetweenRaw(node, wordEndCut, { textNode: next.textNode, offset: next.start }, baseStyle);
      gapRuns.forEach(r => { r.characterSpacing = extraPt; });
      runs.push(...gapRuns);
      cursor = { textNode: next.textNode, offset: next.start };
    }
    runs.push(...extractRunsBetweenRaw(node, cursor, endCut, baseStyle));
    return trimEdgeWhitespace(runs);
  }
  // Ce que pdfmake a mesuré (`_maxWidth`, marges comprises) de chaque ligne étirée de la passe qu'il vient de mettre en page : l'écart restant à la
  // largeur visée, réparti sur ses intervalles, devient l'étirement de la même ligne à la passe suivante (buildJustifiedLine la retrouve par sa clé).
  // Ne laisse que STRETCH_LEARNED_SAFETY_PT.
  function learnStretchedLines(blocks) {
    (blocks || []).forEach(block => {
      const st = block._stretch;
      if (!st || !(block._maxWidth > 0)) return;
      const margin = block.margin || [0, 0, 0, 0];
      const widthPt = block._maxWidth - (margin[0] || 0) - (margin[2] || 0);
      stretchExtra.set(st.key, Math.max(-STRETCH_MAX_SQUEEZE_PT, st.extraPt + ((st.targetPt - STRETCH_LEARNED_SAFETY_PT) - widthPt) / st.gaps));
    });
  }

  // Les mots d'un bloc (collectWords) rangés par ligne, du haut vers le bas : un mot est de la ligne d'avant s'il en recouvre la hauteur. `top` et
  // `bottom` d'une ligne : ceux de ses mots.
  function groupWordsIntoLines(words) {
    const lines = [];
    words.forEach(w => {
      const last = lines[lines.length - 1];
      if (last && w.top < last.bottom - 1 && w.bottom > last.top + 1) {
        last.push(w);
        last.top = Math.min(last.top, w.top);
        last.bottom = Math.max(last.bottom, w.bottom);
      } else {
        const line = [w];
        line.top = w.top;
        line.bottom = w.bottom;
        lines.push(line);
      }
    });
    return lines;
  }
  // La coupure (nœud de texte, décalage) au début ou à la fin d'un mot.
  const cutAtStart = word => ({ textNode: word.textNode, offset: word.start });
  const cutAtEnd = word => ({ textNode: word.textNode, offset: word.end });
  // Où couper le texte d'un bloc pour garder les mots de rang `first` à `last` : juste avant le premier, juste après le dernier (`null` : jusqu'au
  // bord).
  function wordCutsOf(words) {
    return {
      before: wi => (wi <= 0 ? null : cutAtStart(words[wi])),
      after: wi => (wi >= words.length - 1 ? null : cutAtEnd(words[wi])),
    };
  }
  // Les espaces que le navigateur garde en tête de ligne (white-space: break-spaces) : celui qui suit une image « bloc » ouvre la ligne d'en dessous
  // et la décale d'une espace, les mots d'une ligne coupée plus haut n'en ont pas. pdfmake, lui, les retire : on les rend par le retrait de gauche
  // (la ligne est centrée ou étirée sur ce qui reste, comme dans le navigateur).
  function leadingSpacePt(word) {
    const before = word.textNode.nodeValue.slice(0, word.start);
    return /^[ \u00a0]+$/.test(before) ? before.length * spaceWidthPt() : 0;
  }
  // Les lignes `from` à `to` (comprises) d'un bloc, en blocs pdfmake, chaque ligne au même endroit et avec les mêmes mots que dans le navigateur. En
  // justifié chaque ligne a son bloc, étiré à la largeur du navigateur (pdfmake n'étire jamais la dernière ligne d'un bloc, le navigateur étire
  // toutes celles qu'une autre suit) ; les autres lignes ont aussi chacune leur bloc, aux mots que le navigateur y met, la première quand elle
  // commence par une espace gardée (`leadPt`) avec son retrait. `ctx` : { node, words, lines, textAlign, indentPt, lineWidthPt, cuts }. `shiftLeftPt`
  // / `shiftRightPt` : la place prise à côté par une image habillée. `endsParagraph` : la dernière de ces lignes est la dernière du paragraphe
  // (jamais étirée). `ctx.slackPt` : ce que le conteneur du PDF a de moins que celui du navigateur (une case de tableau perd une espace et demie, cf.
  // tableFrom) : la marge de droite de chaque bloc le rend, pour que pdfmake coupe les lignes où le navigateur les coupe, pas une ligne plus tôt.
  function lineBlocksFrom(ctx, from, to, opts) {
    const { node, lines, textAlign, indentPt, lineWidthPt, cuts, baseStyle, slackPt = 0 } = ctx;
    const { shiftLeftPt = 0, shiftRightPt = 0, endsParagraph = false, leadPt = 0 } = opts || {};
    const justify = textAlign === 'justify';
    const widthPt = lineWidthPt - shiftLeftPt - shiftRightPt;
    const startOf = li => lines[li][0].index;
    const endOf = li => lines[li][lines[li].length - 1].index;
    // La dernière ligne d'un paragraphe centré ou à droite n'a pas d'espace de fin dans le navigateur (white-space: break-spaces garde celle de
    // toutes les autres) : son texte est au vrai centre, ou au bord droit, là où celui des autres lignes est décalé d'une demi-espace ou d'une
    // espace. Elle a donc sa propre place, de chaque côté ou à gauche seulement, sans la marge d'une espace : la ligne garde une marge de
    // LAST_LINE_ROOM_PT de plus que le navigateur pour qu'une largeur de pdfmake un peu plus grande ne la renvoie pas à la ligne.
    const LAST_LINE_ROOM_PT = 2;
    const trailsNoSpace = textAlign === 'center' || textAlign === 'right';
    // Une ligne à gauche (ou étirée) n'a pas besoin de la marge d'une espace : sa position ne dépend pas du bord droit, qui ne sert qu'à la garder
    // sur une seule ligne. On lui laisse même de la place en plus, pour qu'une largeur de pdfmake un peu plus grande que celle du navigateur ne la
    // renvoie pas à la ligne.
    const LEFT_LINE_ROOM_PT = 2;
    const blockOf = (runs, lead, last, stretched) => {
      const left = indentPt + shiftLeftPt + lead;
      const margin = last && trailsNoSpace
        ? [left - LAST_LINE_ROOM_PT, 0, shiftRightPt - slackPt - (textAlign === 'center' ? LAST_LINE_ROOM_PT : 0), 0]
        : [left, 0, (trailsNoSpace || stretched ? spaceWidthPt() : -LEFT_LINE_ROOM_PT) + shiftRightPt - slackPt, 0];
      const block = { text: runs.length ? runs : ' ', margin, lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) block.alignment = textAlign;
      if (runs.stretch) { block._stretch = runs.stretch; stretchedBlocks.push(block); }
      return block;
    };
    const out = [];
    // Une ligne, un bloc : pdfmake ne coupe pas le texte lui-même, il n'a pas les mêmes règles que le navigateur (il ne sépare jamais un mot de
    // l'« : » qui le suit, par exemple, que le navigateur renvoie à la ligne d'après) ; chaque ligne garde donc les mots que le navigateur y met.
    for (let li = from; li <= to; li += 1) {
      const lead = li === from ? leadPt : 0;
      const stretch = justify && !(endsParagraph && li === to);
      const runs = stretch
        ? buildJustifiedLine(node, lines[li], cuts.before(startOf(li)), cuts.after(endOf(li)), widthPt - spaceWidthPt() - lead, baseStyle)
        : extractRunsBetween(node, cuts.before(startOf(li)), cuts.after(endOf(li)), baseStyle);
      out.push(blockOf(runs, lead, endsParagraph && li === to, stretch));
    }
    return out;
  }

  // Signes en début de ligne : le navigateur passe à la ligne avant « : » (et « ; ! ? , . ) ] } / ») quand une espace le précède, le signe ouvre la
  // ligne d'après. pdfmake ne coupe jamais là (UAX #14 : pas de coupure avant ces signes, même après une espace) : « mot : » reste ensemble, un mot
  // de plus tient sur la ligne et tout le paragraphe se coupe autrement que dans l'éditeur. Un paragraphe où le navigateur ouvre une ligne par l'un
  // de ces signes est donc posé comme ceux qui portent une image, une ligne du navigateur par bloc (lineBlocksFrom) ; les autres gardent leur texte
  // d'un seul bloc.
  const LINE_START_SIGNS = ':;!?,.)]}/';
  const SIGN_AFTER_SPACE = /[ \t\n][:;!?,.)\]}\/]/;
  // Les blocs pdfmake d'un paragraphe sans image dont une ligne du navigateur commence par l'un de ces signes, ou `null` (l'appelant garde son bloc
  // de texte). `opts` : `nested` (dans une case, une colonne ou un encadré), `maxWidthPt` (la largeur que pdfmake donne au bloc quand elle est plus
  // étroite que celle du navigateur : une case), `baseStyle` (le style que le bloc hérite de sa case), `textAlign` (l'alignement de la case quand le
  // bloc n'a pas le sien).
  function signLineBlocksFrom(node, pageBreakBefore, opts) {
    const { nested = false, maxWidthPt, baseStyle, textAlign: containerAlign } = opts || {};
    // Le texte d'abord : mesurer chaque mot d'un paragraphe n'est utile que s'il porte une espace suivie d'un de ces signes. Un saut de ligne forcé
    // (Maj+Entrée) garde le chemin ordinaire : une ligne vide n'a pas de mot, donc pas de ligne ici (elle disparaîtrait), et le navigateur n'étire
    // pas la ligne qui précède un saut.
    if (!node.isConnected || node.querySelector('br') || !SIGN_AFTER_SPACE.test(node.textContent || '')) return null;
    const words = collectWords(node);
    const lines = groupWordsIntoLines(words);
    const opensWithSign = line => LINE_START_SIGNS.includes(line[0].textNode.nodeValue.charAt(line[0].start));
    if (!lines.some((line, li) => li > 0 && opensWithSign(line))) return null;
    const { lineWidthPt, slackPt, indentPt } = paragraphBoxPt(node, node.getBoundingClientRect(), nested, maxWidthPt);
    const textAlign = alignment(node) || containerAlign;
    const blocks = lineBlocksFrom({ node, words, lines, textAlign, indentPt, lineWidthPt, slackPt, cuts: wordCutsOf(words), baseStyle }, 0, lines.length - 1, { endsParagraph: true, leadPt: leadingSpacePt(words[0]) });
    if (pageBreakBefore) blocks[0].pageBreak = 'before';
    return blocks;
  }

  // Image dans le flux (dans la ligne, « bloc », centrée). pdfmake ne sait pas poser une image dans une ligne de texte : un `text` n'en accepte pas,
  // et une image ne se met à côté d'un texte que dans des `columns`. Le navigateur, lui (l'hôte de mesure suit les règles de l'éditeur,
  // css/editor-v2.css), sait où tombent chaque image et chaque mot. Une ligne qui porte une image devient donc une rangée de colonnes : le texte
  // d'avant, l'image, le texte d'après, posés aux x mesurés, à la hauteur de la ligne du navigateur (le pied de l'image sur la ligne de base du
  // texte ; le haut de la ligne est celui de l'image quand elle dépasse l'interligne). Les lignes sans image ont chacune leur bloc de texte
  // (lineBlocksFrom). Une image « bloc » ou centrée est seule sur sa ligne : sa propre rangée.

  // La boîte d'un paragraphe que le PDF pose lui-même ligne à ligne, en points : `lineWidthPt` (la largeur de son texte, plafonnée à `maxWidthPt`
  // quand pdfmake lui en laisse moins : une case de tableau), `slackPt` (ce que le plafond retranche), `indentPt` (son retrait : mesuré dans l'hôte,
  // ou, `nested` - dans une case, une colonne ou un encadré -, depuis le bord de ce qui le contient).
  function paragraphBoxPt(node, nodeRect, nested, maxWidthPt) {
    const nodeStyle = getComputedStyle(node);
    const insetLeftPx = (parseFloat(nodeStyle.borderLeftWidth) || 0) + (parseFloat(nodeStyle.paddingLeft) || 0);
    const insetRightPx = (parseFloat(nodeStyle.borderRightWidth) || 0) + (parseFloat(nodeStyle.paddingRight) || 0);
    const domWidthPt = Math.max(0, (nodeRect.width - insetLeftPx - insetRightPx) * PX_TO_PT);
    const lineWidthPt = maxWidthPt > 0 ? Math.min(domWidthPt, maxWidthPt) : domWidthPt;
    const indentPt = nested ? Math.max(0, (nodeRect.left + insetLeftPx - flowOriginLeftPx(node)) * PX_TO_PT) : measureIndentPt(node, 'box');
    return { lineWidthPt, slackPt: domWidthPt - lineWidthPt, indentPt };
  }

  // Un bloc de texte du flux : `text` (des runs, ou ' ' pour une ligne vide), son retrait à gauche, et la largeur d'une espace retranchée à droite
  // (cf. spaceWidthPt).
  function flowTextBlock(text, leftPt = 0) {
    return { text, margin: [leftPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
  }

  // Le décalage du texte à côté d'une image habillée : du côté de l'image, de sa largeur et de sa marge (`shiftPt`).
  function floatShifts(align, shiftPt) {
    return { shiftLeftPt: align === 'left' ? shiftPt : 0, shiftRightPt: align === 'right' ? shiftPt : 0 };
  }

  // Bord gauche, en px, de ce qui contient un bloc dans le PDF : l'hôte de mesure, ou la case de tableau où il se trouve (pdfmake y repart du bord
  // intérieur de la case).
  function flowOriginLeftPx(node) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const cell = node.closest('td, th');
    if (!cell || !host.contains(cell)) return host.getBoundingClientRect().left;
    const cs = getComputedStyle(cell);
    return cell.getBoundingClientRect().left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
  }

  // Ce que le navigateur fait d'une ligne de ce bloc, mesuré sur un clone vide posé juste après lui (mêmes classes, même style : même police, même
  // interligne) : la hauteur d'une ligne, où est sa ligne de base depuis le haut de la ligne, et la hauteur du texte au-dessus de cette ligne (pour
  // retrouver la ligne de base d'un mot). `null` hors d'une page.
  function lineStrutOf(node) {
    if (!node.parentNode) return null;
    const probe = node.cloneNode(false);
    probe.removeAttribute('id');
    const marker = document.createElement('span');
    marker.style.cssText = 'display:inline-block; width:0; height:0;';
    probe.appendChild(marker);
    probe.appendChild(document.createTextNode('x'));
    node.parentNode.insertBefore(probe, node.nextSibling);
    try {
      const cs = getComputedStyle(probe);
      const box = probe.getBoundingClientRect();
      const insetTop = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0);
      const insetBottom = (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      const glyph = document.createRange();
      glyph.setStart(probe.lastChild, 0);
      glyph.setEnd(probe.lastChild, 1);
      const baseline = marker.getBoundingClientRect().bottom;
      const lineHeightPx = box.height - insetTop - insetBottom;
      if (!(lineHeightPx > 0)) return null;
      return { lineHeightPx, baselinePx: baseline - (box.top + insetTop), glyphAscentPx: baseline - glyph.getBoundingClientRect().top };
    } finally {
      probe.remove();
    }
  }

  // Les blocs pdfmake d'un paragraphe qui porte au moins une image du flux, ou `null` (rien à mesurer : l'appelant garde son chemin ordinaire).
  // `images` : les objets image que inlineRuns a rendus pour ce nœud, dans l'ordre du DOM ; ceux qui sont en calque (hors du flux) suivent le texte
  // sans le couper. `opts` : `keepLayered` (les images en calque restent à l'appelant, qui les rattache lui-même : case de tableau), `textAlign`
  // (l'alignement du conteneur quand le bloc n'a pas le sien : case), `baseStyle` (le style que le bloc hérite de son conteneur), `maxWidthPt` (la
  // largeur que pdfmake donne au bloc quand elle est plus étroite que celle du navigateur : une case de tableau perd une espace et demie, cf.
  // tableFrom).
  function inFlowImageBlocksFrom(node, images, pageBreakBefore, opts) {
    const { keepLayered = false, textAlign: containerAlign, baseStyle, maxWidthPt } = opts || {};
    const flowImages = images.filter(img => FLOW_IMAGE_NODES.has(img));
    if (!flowImages.length || !node.isConnected) return null;
    const strut = lineStrutOf(node);
    if (!strut) return null;
    const { lineWidthPt, indentPt } = paragraphBoxPt(node, node.getBoundingClientRect(), true, maxWidthPt);
    const words = collectWords(node);
    const f = {
      node, words, strut, baseStyle, lineWidthPt, indentPt,
      originLeftPx: flowOriginLeftPx(node),
      textAlign: alignment(node) || containerAlign,
      cuts: wordCutsOf(words),
    };
    const rows = flowImageRows(flowImages, strut);
    if (!rows.length) return null;
    const segments = flowSegmentsOf(rows, words, assignWordsToRows(rows, words));
    const blocks = [];
    segments.forEach((seg, si) => {
      const followed = si < segments.length - 1;
      if (seg.run) blocks.push(...textRunBlocks(f, seg.run, followed));
      else blocks.push(imageRowBlock(f, seg.row, followed));
    });
    // Les images en calque ne prennent pas de place : posées après le texte, sans le couper (leur position est résolue plus tard, d'après leur boîte
    // réelle).
    if (!keepLayered) images.forEach(img => { if (!FLOW_IMAGE_NODES.has(img)) blocks.push(img); });
    const firstFlow = blocks.find(b => !b._pendingImgNode);
    if (pageBreakBefore && firstFlow) firstFlow.pageBreak = 'before';
    return blocks;
  }

  // Les rangées : une par ligne du navigateur qui porte une image dans la ligne, une par image « bloc » ou centrée. `top` / `bottom` : la boîte de
  // la ligne du navigateur.
  function flowImageRows(flowImages, strut) {
    const rows = [];
    flowImages.forEach(img => {
      const el = FLOW_IMAGE_NODES.get(img);
      const rect = el.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;
      const own = getComputedStyle(el).display === 'block';
      const item = { kind: 'img', img, rect, left: rect.left, right: rect.right };
      if (own) { rows.push({ own: true, top: rect.top, bottom: rect.bottom, items: [item], wordIdx: [] }); return; }
      const baseline = rect.bottom;
      const strutTop = baseline - strut.baselinePx;
      const row = rows.find(r => !r.own && Math.abs(r.baseline - baseline) < 1.5);
      if (row) { row.items.push(item); row.top = Math.min(row.top, rect.top); row.bottom = Math.max(row.bottom, rect.bottom); return; }
      rows.push({ own: false, baseline, strutTop, top: Math.min(strutTop, rect.top), bottom: Math.max(strutTop + strut.lineHeightPx, rect.bottom), items: [item], wordIdx: [] });
    });
    return rows;
  }

  // Les mots de la ligne d'une image : ceux dont le milieu tombe dans la boîte de sa ligne (deux lignes ne se recouvrent pas). Rend, mot par mot, si
  // une rangée le porte ; le rang de chacun s'ajoute à `wordIdx` de sa rangée.
  function assignWordsToRows(rows, words) {
    const taken = new Array(words.length).fill(false);
    words.forEach((w, wi) => {
      const mid = (w.top + w.bottom) / 2;
      const row = rows.find(r => !r.own && mid >= r.top - 0.5 && mid <= r.bottom + 0.5);
      if (row) { row.wordIdx.push(wi); taken[wi] = true; }
    });
    return taken;
  }

  // Du haut vers le bas : les rangées, et entre elles les suites de mots qu'aucune rangée ne porte (le texte que pdfmake coupe lui-même).
  function flowSegmentsOf(rows, words, taken) {
    const segments = rows.map(row => ({ row, key: row.top }));
    // Une suite de mots se coupe aussi là où une rangée s'intercale sans mot (une image « bloc », ou trop large pour partager sa ligne) : le texte
    // d'après repart sous l'image.
    const rowBetween = (a, b) => rows.some(r => (a.top + a.bottom) / 2 < r.top + 0.5 && (b.top + b.bottom) / 2 > r.bottom - 0.5);
    for (let wi = 0; wi < words.length; wi += 1) {
      if (taken[wi]) continue;
      let last = wi;
      while (last + 1 < words.length && !taken[last + 1] && !rowBetween(words[last], words[last + 1])) last += 1;
      segments.push({ run: { first: wi, last }, key: words[wi].top });
      wi = last;
    }
    return segments.sort((a, b) => a.key - b.key);
  }

  // Une image du flux en bloc, sans l'alignement que lui a donné le paragraphe : son retrait est celui de la rangée.
  function marginedImage(img, margin) {
    const out = Object.assign({}, img, { margin });
    delete out.alignment;
    return out;
  }

  // Une suite de mots que aucune image ne porte : ses lignes, une par bloc (lineBlocksFrom). `followed` : une autre rangée la suit.
  function textRunBlocks(f, run, followed) {
    const { first, last } = run;
    const lines = groupWordsIntoLines(f.words.slice(first, last + 1));
    const { node, words, textAlign, indentPt, lineWidthPt, cuts, baseStyle } = f;
    return lineBlocksFrom({ node, words, lines, textAlign, indentPt, lineWidthPt, cuts, baseStyle }, 0, lines.length - 1, { endsParagraph: !followed, leadPt: leadingSpacePt(words[first]) });
  }

  // Une rangée d'images : le bloc de l'image seule (« bloc » ou centrée, ou seule sur sa ligne), sinon une rangée de colonnes qui mêle les images
  // et les mots de leur ligne, aux x mesurés.
  function imageRowBlock(f, row, followed) {
    const { words, strut, originLeftPx, textAlign, baseStyle, node, cuts } = f;
    if (row.own) {
      const { img, rect } = row.items[0];
      return marginedImage(img, [Math.max(0, (rect.left - originLeftPx) * PX_TO_PT), 0, 0, 0]);
    }
    // Les morceaux de la ligne, de gauche à droite : chaque image, et les mots que deux images (ou le bord de la ligne) ne séparent pas.
    const sequence = [];
    const placed = row.items.map(it => ({ at: it.left, item: it })).concat(row.wordIdx.map(wi => ({ at: words[wi].left, word: words[wi], wi })));
    placed.sort((a, b) => a.at - b.at);
    placed.forEach(p => {
      if (p.item) { sequence.push(p.item); return; }
      const prev = sequence[sequence.length - 1];
      if (prev && prev.kind === 'text') { prev.words.push(p.word); prev.lastIdx = p.wi; } else sequence.push({ kind: 'text', words: [p.word], firstIdx: p.wi, lastIdx: p.wi });
    });
    sequence.forEach(it => {
      if (it.kind !== 'text') return;
      it.left = it.words[0].left;
      it.right = it.words[it.words.length - 1].right;
      const stretched = textAlign === 'justify' && followed && it.words.length > 1;
      it.runs = stretched
        ? buildJustifiedLine(node, it.words, cuts.before(it.firstIdx), cuts.after(it.lastIdx), (it.right - it.left) * PX_TO_PT, baseStyle)
        : extractRunsBetween(node, cuts.before(it.firstIdx), cuts.after(it.lastIdx), baseStyle);
    });
    const leftPt = Math.max(0, (sequence[0].left - originLeftPx) * PX_TO_PT);
    if (sequence.length === 1 && sequence[0].kind === 'img') {
      // Une image seule sur sa ligne : son haut, et sous elle ce que la ligne garde sous la ligne de base.
      const { img, rect } = sequence[0];
      return marginedImage(img, [leftPt, (rect.top - row.top) * PX_TO_PT, 0, (row.bottom - rect.bottom) * PX_TO_PT]);
    }
    return rowColumnsBlock(sequence, row, strut, leftPt);
  }

  // La rangée de colonnes d'une ligne qui mêle images et texte : chaque morceau de `sequence` à sa hauteur dans la ligne du navigateur.
  function rowColumnsBlock(sequence, row, strut, leftPt) {
    const textTopPt = (row.strutTop - row.top) * PX_TO_PT;
    const rowHeightPt = (row.bottom - row.top) * PX_TO_PT;
    const lineHeightPt = strut.lineHeightPx * PX_TO_PT;
    let tallestPt = 0;
    const children = sequence.map((it, i) => {
      const next = sequence[i + 1];
      if (it.kind === 'img') {
        const topPt = (it.rect.top - row.top) * PX_TO_PT;
        tallestPt = Math.max(tallestPt, topPt + it.rect.height * PX_TO_PT);
        // Dans une pile : la largeur d'une colonne d'image est aussi celle de l'image, or la colonne doit aller jusqu'au morceau suivant.
        return { width: next ? Math.max(1, (next.left - it.left) * PX_TO_PT) : it.img.width, stack: [marginedImage(it.img, [0, topPt, 0, 0])] };
      }
      tallestPt = Math.max(tallestPt, textTopPt + lineHeightPt);
      const child = { text: it.runs.length ? it.runs : ' ', noWrap: true, lineHeight: LINE_HEIGHT_RATIO, margin: [0, textTopPt, 0, 0], width: next ? Math.max(1, (next.left - it.left) * PX_TO_PT) : (it.right - it.left) * PX_TO_PT + 2 };
      if (it.runs.stretch) { child._stretch = it.runs.stretch; stretchedBlocks.push(child); }
      return child;
    });
    return { columns: children, columnGap: 0, margin: [leftPt, 0, 0, Math.max(0, rowHeightPt - tallestPt)] };
  }

  // Image habillée (alignée à gauche ou à droite). Dans l'éditeur, l'image flotte : elle ne prend aucune place dans le flux, et le texte (de son
  // paragraphe, puis des paragraphes d'après) se range à côté d'elle jusqu'à son bas, marge comprise, avant de reprendre toute la largeur. pdfmake
  // n'a rien de tel : le PDF reproduit les deux moitiés séparément. Le texte, ce sont des blocs décalés du côté de l'image (le retrait est la largeur
  // de l'image et sa marge), coupés là où le navigateur passe sous elle (mesuré dans l'hôte). L'image, c'est un calque que le fond de page peint à la
  // hauteur de la première ligne à côté d'elle, sans place dans le flux : sa page et sa hauteur ne sont connues qu'une fois le texte mis en page par
  // pdfmake, d'où la passe de mesure de resolveNativePdfContent.
  const FLOAT_SIDE_MARGIN_PX = 12; // css/editor-v2.css : margin: 0 12px 8px 0 (et son miroir à droite)
  const FLOAT_BELOW_MARGIN_PX = 8;

  // Les lignes d'un bloc par rapport à une image qui flotte, du haut (`floatTopPx`) au bas de sa boîte avec marge (`floatBottomPx`) : { before,
  // beside, after } = rangs des lignes (`lines`) ; le haut d'une ligne du navigateur est celui de ses mots moins la demi-interligne.
  function linesAroundFloat(lines, strut, floatTopPx, floatBottomPx) {
    const halfLeadingPx = strut.baselinePx - strut.glyphAscentPx;
    const topOf = line => line.top - halfLeadingPx;
    let firstBeside = lines.findIndex(line => topOf(line) >= floatTopPx - 1);
    if (firstBeside === -1) return { before: lines.length, beside: 0, after: 0, topOf };
    let afterFrom = lines.findIndex((line, i) => i >= firstBeside && topOf(line) >= floatBottomPx);
    if (afterFrom === -1) afterFrom = lines.length;
    return { before: firstBeside, beside: afterFrom - firstBeside, after: lines.length - afterFrom, topOf };
  }

  // Les blocs pdfmake d'un paragraphe qui porte une image habillée, ou `null` (l'appelant garde alors son chemin ordinaire : plusieurs images
  // habillées, ou une image du flux dans le même paragraphe). Le premier bloc à côté de l'image (ou, sans texte, la ligne vide du paragraphe) porte
  // `_floatOverlay` : c'est à lui que resolveFloatOverlays ancre l'image. `opts` : `nested` (dans une case, une colonne ou un encadré : l'ancre dit
  // où est l'image par rapport à son propre texte, la page et la hauteur du conteneur ne sont pas celles de la page), `maxWidthPt` (la largeur que
  // pdfmake donne au bloc quand elle est plus étroite que celle du navigateur : une case de tableau).
  function floatParagraphBlocksFrom(node, pageBreakBefore, opts) {
    const { nested = false, maxWidthPt } = opts || {};
    if (!node.isConnected) return null;
    const images = [];
    inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images);
    const single = singleFloatOf(node, images);
    if (!single) return null;
    const { floatImg, imgNode, strut } = single;
    const align = floatImg._floatAlign;
    const nodeRect = node.getBoundingClientRect();
    const imgRect = imgNode.getBoundingClientRect();
    const { lineWidthPt, slackPt, indentPt } = paragraphBoxPt(node, nodeRect, nested, maxWidthPt);
    const originLeftPx = nested ? flowOriginLeftPx(node) : 0;
    const textAlign = alignment(node);
    const floatTopPx = imgRect.top;
    const floatBottomPx = imgRect.bottom + FLOAT_BELOW_MARGIN_PX;
    const shiftPt = (imgRect.width + FLOAT_SIDE_MARGIN_PX) * PX_TO_PT;
    const words = collectWords(node);
    const lines = groupWordsIntoLines(words);
    const around = linesAroundFloat(lines, strut, floatTopPx, floatBottomPx);
    const ctx = { node, words, lines, textAlign, indentPt, lineWidthPt, slackPt, cuts: wordCutsOf(words) };
    const placed = textAroundFloat(ctx, around, floatTopPx, floatShifts(align, shiftPt));
    const { blocks } = placed;
    const { anchor, dyPt } = placed.anchor ? placed : floatAnchorWithoutText(blocks, ctx, around, strut, floatTopPx, nodeRect);
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // `reachPt` : de son haut au bas de ce qu'elle occupe, soit sa hauteur, sa marge du dessous et une ligne de texte de plus (la dernière ligne à
    // côté d'elle peut dépasser son bas d'une ligne).
    anchor._floatOverlay = { image: floatImg, align, dyPt, reachPt: (floatBottomPx - imgRect.top + strut.lineHeightPx) * PX_TO_PT };
    // Dans un conteneur (case, colonne, encadré) l'image se pose depuis son texte : son bord gauche est à `offsetPt` du bord gauche du conteneur, que
    // le PDF retrouve par la marge de l'ancre.
    if (nested) { anchor._floatOverlay.nested = true; anchor._floatOverlay.offsetPt = (imgRect.left - originLeftPx) * PX_TO_PT; }
    images.forEach(img => { if (img._pendingImgNode) blocks.push(img); });
    if (pageBreakBefore) blocks[0].pageBreak = 'before';
    // L'image dépasse le paragraphe : le texte des paragraphes suivants se range encore à côté d'elle.
    if (floatBottomPx > nodeRect.bottom + 0.5) blocks._floatCarry = { overlay: true, floatBottomPx, align, shiftPt };
    return blocks;
  }

  // L'image habillée que porte seule un paragraphe (`images` : tout ce que inlineRuns y a trouvé) et la ligne type de son bloc ; null quand le
  // paragraphe n'est pas de ce chemin (aucune ou plusieurs images habillées, une image du flux, pas de ligne mesurable).
  function singleFloatOf(node, images) {
    const floats = images.filter(img => img._floatAlign);
    if (floats.length !== 1 || images.some(img => FLOW_IMAGE_NODES.has(img))) return null;
    const floatImg = floats[0];
    const imgNode = floatImg._sourceImgNode;
    const strut = imgNode && lineStrutOf(node);
    return strut ? { floatImg, imgNode, strut } : null;
  }

  // Le texte d'un paragraphe autour de son image habillée : les lignes avant elle, à côté d'elle (décalées de son côté, `shifts`) et après. Rend les
  // blocs, celui qui porte l'image (`anchor`, null sans ligne à côté) et l'écart (`dyPt`) entre son haut et celui de l'image.
  function textAroundFloat(ctx, around, floatTopPx, shifts) {
    const { lines } = ctx;
    const blocks = [];
    let anchor = null;
    let dyPt = 0;
    const lastSegment = around.after ? 'after' : around.beside ? 'beside' : 'before';
    if (around.before) blocks.push(...lineBlocksFrom(ctx, 0, around.before - 1, { endsParagraph: lastSegment === 'before' }));
    if (around.beside) {
      const beside = lineBlocksFrom(ctx, around.before, around.before + around.beside - 1, Object.assign({ endsParagraph: lastSegment === 'beside', leadPt: 0 }, shifts));
      anchor = beside[0];
      dyPt = (floatTopPx - around.topOf(lines[around.before])) * PX_TO_PT;
      blocks.push(...beside);
    }
    if (around.after) blocks.push(...lineBlocksFrom(ctx, around.before + around.beside, lines.length - 1, { endsParagraph: true }));
    return { blocks, anchor, dyPt };
  }

  // Le bloc qui porte l'image quand aucune ligne n'est à côté d'elle, et l'écart (`dyPt`) entre son haut et celui de l'image ; la ligne vide que le
  // paragraphe garde peut s'ajouter à `blocks`.
  function floatAnchorWithoutText(blocks, ctx, around, strut, floatTopPx, nodeRect) {
    const { lines } = ctx;
    if (around.after === lines.length && lines.length) {
      // Une image aussi large que la ligne ne laisse rien à côté : le navigateur pousse tout le texte sous elle. Le texte garde ce vide au-dessus de
      // sa première ligne, et l'image est ancrée à cette première ligne, au-dessus d'elle.
      const gapPt = (around.topOf(lines[0]) - floatTopPx) * PX_TO_PT;
      blocks[0].margin[1] = gapPt;
      return { anchor: blocks[0], dyPt: -gapPt };
    }
    // Pas de texte à côté : la ligne que le paragraphe garde (l'éditeur laisse une ligne vide à l'image seule, cf.
    // insertTrailingBreaksForEmptyBlocks) porte l'image.
    const kept = flowTextBlock(' ', ctx.indentPt);
    const lastLine = lines[lines.length - 1];
    const keptTopPx = lastLine ? around.topOf(lastLine) + strut.lineHeightPx : nodeRect.top;
    if (!lastLine || nodeRect.bottom - keptTopPx > strut.lineHeightPx * 0.5) {
      blocks.push(kept);
      return { anchor: kept, dyPt: (floatTopPx - keptTopPx) * PX_TO_PT };
    }
    return { anchor: blocks[blocks.length - 1], dyPt: (floatTopPx - around.topOf(lastLine)) * PX_TO_PT };
  }

  // Un paragraphe sans image, sous une image habillée qui le déborde encore (`carry`, posé par floatParagraphBlocksFrom) : ses premières lignes se
  // rangent à côté d'elle, le reste reprend toute la largeur. `null` : le paragraphe est déjà sous l'image, ou porte une image de son propre chemin.
  function carriedFloatBlocksFrom(node, carry, pageBreakBefore, opts) {
    const { nested = false, maxWidthPt } = opts || {};
    if (!node.isConnected || node.querySelector('img.editor-image')) return null;
    const nodeRect = node.getBoundingClientRect();
    if (nodeRect.top >= carry.floatBottomPx - 0.5) return null;
    const strut = lineStrutOf(node);
    if (!strut) return null;
    const { lineWidthPt, slackPt, indentPt } = paragraphBoxPt(node, nodeRect, nested, maxWidthPt);
    const textAlign = alignment(node);
    const words = collectWords(node);
    const lines = groupWordsIntoLines(words);
    // Une ligne vide à côté de l'image garde sa ligne, rien à décaler.
    const blocks = lines.length
      ? linesBesideCarry({ node, words, lines, textAlign, indentPt, lineWidthPt, slackPt, cuts: wordCutsOf(words) }, strut, carry)
      : [flowTextBlock(' ', indentPt)];
    if (pageBreakBefore) blocks[0].pageBreak = 'before';
    if (nodeRect.bottom < carry.floatBottomPx - 0.5) blocks._floatCarry = carry;
    blocks._carried = true;
    return blocks;
  }

  // Les blocs des lignes d'un paragraphe sous l'image que `carry` décrit : les premières à côté d'elle, le reste sur toute la largeur.
  function linesBesideCarry(ctx, strut, carry) {
    const { lines } = ctx;
    const around = linesAroundFloat(lines, strut, -Infinity, carry.floatBottomPx);
    const blocks = [];
    if (around.beside) blocks.push(...lineBlocksFrom(ctx, 0, around.beside - 1, Object.assign({ endsParagraph: !around.after }, floatShifts(carry.align, carry.shiftPt))));
    if (around.after) blocks.push(...lineBlocksFrom(ctx, around.beside, lines.length - 1, { endsParagraph: true }));
    return blocks;
  }

  // Un titre posé en plusieurs blocs (une image dans sa ligne, un habillage) : son premier bloc porte ce que le sommaire lit (niveau, texte), comme
  // le bloc unique du chemin ordinaire ; `_headingLeaf` est le texte où pdfmake note la page (une rangée de colonnes n'en note pas).
  function markHeadingBlocks(blocks, node, tag) {
    const first = blocks.find(b => b && !b._pendingImgNode && !b.absolutePosition && (b.text !== undefined || b.columns));
    if (!first) return;
    first._isHeading = true;
    first._headingLevel = parseInt(tag.slice(1), 10);
    first._headingText = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (first.text === undefined && first.columns) first._headingLeaf = first.columns.find(c => c && c.text !== undefined) || null;
  }

  // Les blocs de texte qui portent une image habillée (`_floatOverlay`), dans l'ordre du document : au premier niveau comme dans une case, une
  // colonne ou un encadré. `_floatSiblings` : la liste qui contient chacun.
  function floatAnchorsOf(content) {
    const found = [];
    // `top` : le bloc de premier niveau qui contient l'ancre (elle-même au premier niveau) : `_floatTop`.
    const walk = (node, siblings, top) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(child => walk(child, node, top || child)); return; }
      if (node._floatOverlay) { node._floatSiblings = siblings; node._floatTop = top; found.push(node); }
      ['stack', 'columns', 'ul', 'ol'].forEach(key => { if (node[key]) walk(node[key], null, top); });
      if (node.table && Array.isArray(node.table.body)) node.table.body.forEach(row => walk(row, null, top));
    };
    walk(content, null, null);
    return found;
  }

  // Le bloc qui ouvre la page suivante quand l'image habillée de cette ancre ne tient pas dans ce qui reste de sa page : l'ancre elle-même au premier
  // niveau, l'encadré qui la contient ; `null` pour une case ou une colonne (pdfmake ne les coupe pas : la ligne du tableau reste entière, la zone
  // aussi).
  function floatMovesWith(anchor) {
    if (!anchor._floatOverlay.nested) return anchor;
    return anchor._floatTop && anchor._floatTop._isCallout ? anchor._floatTop : null;
  }

  // Ajoute `pt` sous un bloc pdfmake (même formes de marge qu'addTopMargin).
  function addBottomMargin(block, pt) {
    const m = block.margin;
    if (Array.isArray(m) && m.length === 4) block.margin = [m[0], m[1], m[2], m[3] + pt];
    else if (Array.isArray(m) && m.length === 2) block.margin = [m[0], m[1], m[0], m[1] + pt];
    else if (typeof m === 'number') block.margin = [m, m, m, m + pt];
    else block.margin = [0, 0, 0, pt];
  }

  // Ajoute `pt` au-dessus d'un bloc pdfmake, quelle que soit la forme de sa marge (absente, nombre, [horizontal, vertical] ou [gauche, haut, droite,
  // bas]).
  function addTopMargin(block, pt) {
    const m = block.margin;
    if (Array.isArray(m) && m.length === 4) block.margin = [m[0], m[1] + pt, m[2], m[3]];
    else if (Array.isArray(m) && m.length === 2) block.margin = [m[0], m[1] + pt, m[0], m[1]];
    else if (typeof m === 'number') block.margin = [m, m + pt, m, m];
    else block.margin = [0, pt, 0, 0];
  }

  const MIN_BESIDE_PT = 40; // la plus petite colonne de texte à côté d'une image habillée

  // Les colonnes d'une image habillée : l'image et le texte à côté, dans la largeur disponible (`pageWidthPt`). `roomBesidePt` : la place qui reste
  // à côté de l'image, que la colonne de texte ne descend pas sous MIN_BESIDE_PT (`remainingWidthPt`).
  function floatColumns(floatImg, align, pageWidthPt) {
    const gapPt = 12 * PX_TO_PT; // css/editor-v2.css: margin 0 12px 8px 0 (et son miroir)
    const roomBesidePt = pageWidthPt - floatImg.width - gapPt;
    const remainingWidthPt = Math.max(MIN_BESIDE_PT, roomBesidePt);
    const makeColumns = besideContent => {
      const textCol = { width: remainingWidthPt, stack: besideContent.length ? besideContent : [{ text: ' ' }] };
      const imgCol = { width: floatImg.width, stack: [floatImg] };
      return { columns: align === 'right' ? [textCol, imgCol] : [imgCol, textCol], columnGap: gapPt };
    };
    return { roomBesidePt, remainingWidthPt, makeColumns };
  }

  // Image presque aussi large que la zone de texte (typiquement une image réglée trop large, ramenée à la largeur disponible) : rien ne tient à
  // côté, le texte passe dessous dans l'éditeur comme dans la Lecture. Texte d'avant l'image, image, texte d'après, l'un sous l'autre et sans
  // colonnes : une colonne de texte de 40 pt ferait déborder l'ensemble du bord de la page. `beforeRuns` / `afterRuns` : le texte de part et
  // d'autre de l'image (ou rien).
  function stackedFloatBlocks(f, beforeRuns, afterRuns) {
    const textBlock = textRuns => {
      const textBlockObj = flowTextBlock(textRuns);
      if (f.textAlign) textBlockObj.alignment = f.textAlign;
      return textBlockObj;
    };
    f.floatImg.alignment = f.align;
    f.floatImg.margin = [0, 2, 0, 4];
    const stackedBlocks = [];
    if (beforeRuns && beforeRuns.length) stackedBlocks.push(textBlock(beforeRuns));
    stackedBlocks.push(f.floatImg);
    if (afterRuns && afterRuns.length) stackedBlocks.push(textBlock(afterRuns));
    if (f.pageBreakBefore) stackedBlocks[0].pageBreak = 'before';
    return stackedBlocks;
  }

  // Le paragraphe quand rien ne se mesure à côté de l'image. `splitIndex` : rang du premier mot situé sous l'image dans le rendu mesuré (ce qui
  // précède est au-dessus), inconnu quand l'image n'a pas de nœud à mesurer - le texte est alors placé sous l'image.
  function floatFallbackBlocks(f, splitIndex) {
    const { node, runs, words } = f;
    if (f.roomBesidePt < MIN_BESIDE_PT) {
      if (splitIndex == null || splitIndex <= 0) return stackedFloatBlocks(f, null, runs);
      if (splitIndex >= words.length) return stackedFloatBlocks(f, runs, null);
      const cut = cutAtStart(words[splitIndex]);
      return stackedFloatBlocks(f, extractRunsBetween(node, null, cut), extractRunsBetween(node, cut, null));
    }
    const textBlock = { text: runs, lineHeight: LINE_HEIGHT_RATIO };
    if (f.textAlign) textBlock.alignment = f.textAlign;
    const block = f.makeColumns([textBlock]);
    if (f.pageBreakBefore) block.pageBreak = 'before';
    return block;
  }

  // Les rangs des mots à côté de l'image : de `start` (le premier mot dont la ligne commence au niveau du haut de l'image ou plus bas : ce qui
  // précède est sur des lignes terminées avant le flottement) à `end` (le premier mot, à partir de `start`, dont la ligne commence au niveau du
  // bas de l'image ou plus bas).
  function wordsBesideImage(words, imgRect) {
    // Tolérance généreuse sur les deux frontières : au demi-pixel, elles seraient trop fragiles (les sous-pixels de rendu varient d'un navigateur à
    // l'autre). ~20 % d'une hauteur de ligne à 10.5 pt.
    const BOUNDARY_TOLERANCE_PX = 4;
    let start = words.length;
    for (let w = 0; w < words.length; w += 1) { if (words[w].top >= imgRect.top - BOUNDARY_TOLERANCE_PX) { start = w; break; } }
    // +tolérance ici (pas -) pour repousser le seuil vers le bas plutôt que de classer "en dessous" trop de lignes.
    let end = words.length;
    for (let w = start; w < words.length; w += 1) { if (words[w].top >= imgRect.bottom + BOUNDARY_TOLERANCE_PX) { end = w; break; } }
    return { start, end };
  }

  // Regroupe des mots consécutifs (même Y à 2px près) en lignes - permet de calculer un étirement justify précis ligne par ligne
  // (buildJustifiedLine).
  function groupByTop(wordsSlice) {
    const lines = [];
    wordsSlice.forEach(w => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0].top - w.top) < 2) last.push(w); else lines.push([w]);
    });
    return lines;
  }

  // Le texte d'avant l'image (les mots 0 à `besideStart` exclu, `besideStartCut` : où il s'arrête), en blocs au-dessus de la rangée de colonnes ; le
  // premier porte le saut de page du paragraphe.
  function textBeforeFloat(f, besideStart, besideStartCut) {
    const { node, words, textAlign } = f;
    if (textAlign !== 'justify') {
      const beforeRuns = extractRunsBetween(node, null, besideStartCut);
      if (!beforeRuns.length) return [];
      const beforeBlock = Object.assign(flowTextBlock(beforeRuns), f.pageBreakBefore ? { pageBreak: 'before' } : {});
      if (textAlign) beforeBlock.alignment = textAlign;
      return [beforeBlock];
    }
    // Le texte « avant » est toujours suivi du texte « à côté » : même sa dernière ligne s'étire (ce n'est jamais la fin du paragraphe).
    const beforeLines = groupByTop(words.slice(0, besideStart));
    let cursor = null;
    return beforeLines.map((line, li) => {
      const endCut = li === beforeLines.length - 1 ? besideStartCut : cutAtStart(beforeLines[li + 1][0]);
      // Retranche la marge droite (spaceWidthPt()) posée juste dessous : sans elle, l'étirement calculé dépasse le bloc réel et pdfmake recoupe
      // un mot sur une ligne en trop.
      const lineRuns = buildJustifiedLine(node, line, cursor, endCut, f.pageWidthPt - spaceWidthPt());
      const block = flowTextBlock(lineRuns.length ? lineRuns : ' ');
      if (li === 0 && f.pageBreakBefore) block.pageBreak = 'before';
      cursor = endCut;
      return block;
    });
  }

  // Le texte à côté de l'image (les mots `besideStart` à `besideEnd` exclu) : un bloc par ligne en justifié, un seul bloc sinon. `hasAfter` : du texte
  // suit, sous l'image.
  function textBesideFloat(f, range, besideStartCut, besideEndCut, hasAfter) {
    const { node, words, textAlign } = f;
    if (textAlign !== 'justify') {
      const besideLastWord = words[range.end - 1];
      const besideRuns = extractRunsBetween(node, besideStartCut, cutAtEnd(besideLastWord));
      const besideBlock = { text: besideRuns.length ? besideRuns : ' ', lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) besideBlock.alignment = textAlign;
      return [besideBlock];
    }
    // Chaque ligne "à côté" est étirée, sauf si c'est à la fois la dernière ligne et qu'il n'y a pas de texte "après" : la vraie dernière ligne du
    // paragraphe n'est jamais étirée (même convention que le CSS).
    const besideLines = groupByTop(words.slice(range.start, range.end));
    let cursor = besideStartCut;
    return besideLines.map((line, li) => {
      const isLastLine = li === besideLines.length - 1;
      const endCut = isLastLine ? besideEndCut : cutAtStart(besideLines[li + 1][0]);
      const lineRuns = isLastLine && !hasAfter
        ? extractRunsBetween(node, cursor, endCut)
        : buildJustifiedLine(node, line, cursor, endCut, f.remainingWidthPt);
      cursor = endCut;
      return { text: lineRuns.length ? lineRuns : ' ', lineHeight: LINE_HEIGHT_RATIO, alignment: textAlign };
    });
  }

  // Reproduit le float CSS via les `columns` natifs de pdfmake : colonne image + colonne texte restante. Le paragraphe se découpe en trois segments
  // (avant, à hauteur de, après l'image) selon la position mesurée, pas une coupure interne. Limité au paragraphe de l'image ; `null` s'il ne
  // contient que l'image. Le texte à côté de l'image reste un seul bloc auto-wrappé (pdfmake n'étire en justify qu'une ligne qu'il coupe lui-même) :
  // sa coupure de ligne peut différer de celle de l'éditeur, risque assumé.
  function floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt) {
    const images = [];
    const runs = trimEdgeWhitespace(stripImageMarkers(inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images)));
    const floatImg = images.find(img => img._floatAlign);
    if (!floatImg || !runs.length) return null;
    const align = floatImg._floatAlign;
    const imgNode = floatImg._sourceImgNode;
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // Largeur disponible : celle de la page par défaut, ou celle que donne l'appelant (cellule de tableau, colonne) : une image flottante nichée dans
    // un espace plus étroit ne doit pas habiller comme si elle avait la pleine largeur de la page.
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT;
    const words = imgNode ? collectWords(node) : [];
    // `textAlign` : l'alignement du paragraphe, distinct de `align` (le côté du flottement) : blockFrom() l'applique d'ordinaire lui-même, mais cette
    // fonction retourne avant, il faut donc le reporter ici.
    const f = Object.assign({ node, runs, words, floatImg, align, textAlign: alignment(node), pageBreakBefore, pageWidthPt }, floatColumns(floatImg, align, pageWidthPt));
    if (!imgNode) return floatFallbackBlocks(f);

    const range = wordsBesideImage(words, imgNode.getBoundingClientRect());
    if (range.start === range.end) return floatFallbackBlocks(f, range.start); // rien de mesurable à côté (cas dégénéré)
    const hasAfter = range.end < words.length;
    const beforeBlocks = range.start > 0 ? textBeforeFloat(f, range.start, cutAtStart(words[range.start])) : [];
    const besideContent = textBesideFloat(f, range, range.start === 0 ? null : cutAtStart(words[range.start]), hasAfter ? cutAtStart(words[range.end]) : null, hasAfter);
    const columnsBlock = f.makeColumns(besideContent);
    if (pageBreakBefore && !beforeBlocks.length) columnsBlock.pageBreak = 'before';
    const blocks = beforeBlocks.concat(columnsBlock);
    if (hasAfter) {
      const afterRuns = extractRunsBetween(node, cutAtStart(words[range.end]), null);
      const afterBlock = flowTextBlock(afterRuns.length ? afterRuns : ' ');
      if (f.textAlign) afterBlock.alignment = f.textAlign;
      blocks.push(afterBlock);
    }
    return blocks;
  }

  // Poursuit l'habillage sur un paragraphe suivant sans image propre, mais sous le flottement d'un frère précédent (`carry`, préparé par blockFrom) -
  // simple décalage de marge. Retourne { blocks, stillActive } (le frère suivant doit être vérifié à son tour), ou `null` si déjà sous l'image.
  function wrapParagraphBesideCarriedFloat(node, carry) {
    const words = collectWords(node);
    if (!words.length) return null;
    const textAlign = alignment(node);
    const BOUNDARY_TOLERANCE_PX = 4;
    let besideEnd = words.length;
    for (let w = 0; w < words.length; w += 1) { if (words[w].top >= carry.imgBottom + BOUNDARY_TOLERANCE_PX) { besideEnd = w; break; } }
    if (besideEnd === 0) return null;
    const marginLeft = carry.align === 'left' ? carry.imageWidthPt + carry.gapPt : 0;
    const marginRight = carry.align === 'right' ? carry.imageWidthPt + carry.gapPt : 0;
    const hasAfter = besideEnd < words.length;
    const blocks = [];
    if (textAlign === 'justify') {
      const besideLines = groupByTop(words.slice(0, besideEnd));
      let cursor = null;
      besideLines.forEach((line, li) => {
        const isLastLine = li === besideLines.length - 1;
        const endCut = isLastLine ? (hasAfter ? { textNode: words[besideEnd].textNode, offset: words[besideEnd].start } : null) : { textNode: besideLines[li + 1][0].textNode, offset: besideLines[li + 1][0].start };
        const isTrueLastLine = isLastLine && !hasAfter;
        const lineRuns = isTrueLastLine
          ? extractRunsBetween(node, cursor, endCut)
          : buildJustifiedLine(node, line, cursor, endCut, carry.remainingWidthPt);
        blocks.push({ text: lineRuns.length ? lineRuns : ' ', margin: [marginLeft, 0, marginRight, 0], lineHeight: LINE_HEIGHT_RATIO, alignment: textAlign });
        cursor = endCut;
      });
    } else {
      const besideLastWord = words[besideEnd - 1];
      const besideRuns = extractRunsBetween(node, null, { textNode: besideLastWord.textNode, offset: besideLastWord.end });
      const besideBlock = { text: besideRuns.length ? besideRuns : ' ', margin: [marginLeft, 0, marginRight, 0], lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) besideBlock.alignment = textAlign;
      blocks.push(besideBlock);
    }
    if (hasAfter) {
      const afterRuns = extractRunsBetween(node, { textNode: words[besideEnd].textNode, offset: words[besideEnd].start }, null);
      const afterBlock = { text: afterRuns.length ? afterRuns : ' ', margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) afterBlock.alignment = textAlign;
      blocks.push(afterBlock);
    }
    return { blocks, stillActive: !hasAfter };
  }

  // État transmis à blockFrom() pour le(s) frère(s) suivant(s) quand une image flottante déborde encore verticalement son propre paragraphe.
  function makeFloatCarry(imgRect, align, imageWidthPt, availableWidthPt) {
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT;
    const gapPt = 12 * PX_TO_PT;
    return { imgBottom: imgRect.bottom, align, imageWidthPt, remainingWidthPt: Math.max(40, pageWidthPt - imageWidthPt - gapPt), gapPt };
  }

  // Bloc de code du flux principal : un tableau pdfmake à une colonne, une ligne de tableau par ligne de code. Le fond gris et le cadre viennent de
  // la mise en page du tableau (fillColor, filets) et une ligne de tableau est insécable : un long bloc se coupe donc entre deux lignes de code,
  // d'une page à l'autre, sans en couper une en deux. Espaces de tête gardés (preserveLeadingSpaces), ligne vide = une ligne d'une espace. 6 pt de
  // haut et de bas, 7.5 pt de côté et 0.75 pt de filet reprennent le padding 8px/10px et la bordure 1px de `.tiptap pre` ; marge de 3 pt = `margin:
  // 4px 0`.
  function codeBlockFrom(node, pageBreakBefore, inCell) {
    const body = ExportCommon.codeLinesOf(node).map(line => [glyphText(line === '' ? ' ' : line, { font: CODE_FONT, fontSize: CODE_FONT_SIZE, color: CODE_TEXT_COLOR, lineHeight: CODE_LINE_HEIGHT_RATIO, preserveLeadingSpaces: true })]);
    const last = body.length - 1;
    const block = {
      table: { widths: ['*'], body },
      layout: {
        hLineWidth: i => (i === 0 || i === body.length ? 0.75 : 0),
        vLineWidth: () => 0.75,
        hLineColor: () => CODE_BOX_COLOR,
        vLineColor: () => CODE_BOX_COLOR,
        fillColor: () => CODE_FILL_COLOR,
        paddingLeft: () => 7.5, paddingRight: () => 7.5,
        paddingTop: i => (i === 0 ? 6 : 0), paddingBottom: i => (i === last ? 6 : 0),
      },
      margin: [inCell ? 0 : measureIndentPt(node, 'box'), 3, 0, 3],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
    return block;
  }

  // Rend toujours un tableau de blocs, jamais un bloc seul : un paragraphe qui contient une image produit un bloc de texte et un bloc image séparés
  // (pdfmake ne sait pas poser une image dans une ligne de texte).
  function blockFrom(node, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry, captionPt) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return tableBlocksFrom(node, pageBreakBefore, rootRect, availableWidthPt == null, captionPt);
    if (tag === 'HR') return [ruleBlock(pageBreakBefore)];
    if (tag === 'PRE') return [codeBlockFrom(node, pageBreakBefore)];
    const ctx = { node, tag, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry };
    return isFlowText(node, tag, headingMarkers) ? flowTextBlocks(ctx) : ordinaryBlocks(ctx, blockRunsOf(node, tag));
  }

  function ruleBlock(pageBreakBefore) {
    return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) };
  }

  const headingMarkerOf = (headingMarkers, node) => (headingMarkers && headingMarkers.get(node)) || '';

  // Un paragraphe, un div ou un titre se pose comme du texte du flux (image dans la ligne, habillage, texte à côté d'une image qui le déborde), sauf
  // un titre numéroté : son numéro est un texte que le navigateur dessine, absent des mots mesurés.
  function isFlowText(node, tag, headingMarkers) {
    return tag === 'P' || tag === 'DIV' || (/^H[1-6]$/.test(tag) && !headingMarkerOf(headingMarkers, node));
  }

  // Les blocs d'un texte du flux : autour d'une image habillée, avec les images du flux mesurées dans l'hôte, à la ligne près (signe), ou ordinaires.
  function flowTextBlocks(ctx) {
    const { node, tag, pageBreakBefore, availableWidthPt } = ctx;
    const isHeading = /^H[1-6]$/.test(tag);
    const asHeading = blocks => { if (isHeading) markHeadingBlocks(blocks, node, tag); return blocks; };
    const floating = floatAwareBlocks(ctx);
    if (floating) return asHeading(floating);
    const runs = blockRunsOf(node, tag);
    if (runs.rawRuns.some(r => r._imageMarker)) return asHeading(imageParagraphBlocks(ctx, runs));
    // Un paragraphe où le navigateur ouvre une ligne par « : » (ou un signe voisin) : une ligne du navigateur par bloc, pdfmake ne coupe pas avant ce
    // signe.
    const signLines = signLineBlocksFrom(node, pageBreakBefore, { nested: availableWidthPt != null });
    return signLines ? asHeading(signLines) : ordinaryBlocks(ctx, runs);
  }

  // Les blocs d'un paragraphe ou d'un titre que touche une image habillée : la sienne, ou celle d'un frère précédent dont l'habillage se poursuit
  // (`ctx.floatCarry`) ; `null` : le chemin ordinaire.
  function floatAwareBlocks(ctx) {
    const { node, tag, pageBreakBefore, availableWidthPt, floatCarry } = ctx;
    const nested = availableWidthPt != null;
    const isHeading = /^H[1-6]$/.test(tag);
    const floatImgEl = findFloatImageIn(node);
    if (floatImgEl) {
      // Image habillée : un calque, le texte se range à côté en blocs décalés (floatParagraphBlocksFrom), au premier niveau comme dans une case, une
      // colonne ou un encadré (`nested`). Quand il rend `null`, l'habillage en colonnes de floatedImageParagraphFrom.
      const overlaid = floatParagraphBlocksFrom(node, pageBreakBefore, { nested });
      if (overlaid) return overlaid;
      const floated = isHeading ? null : floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt);
      return floated ? floatingBlocksWithCarry(floated, floatImgEl, availableWidthPt) : null;
    }
    if (floatCarry && floatCarry.overlay) return carriedFloatBlocksFrom(node, floatCarry, pageBreakBefore, { nested });
    if (floatCarry && !isHeading) return blocksBesideCarriedFloat(node, floatCarry, pageBreakBefore);
    return null;
  }

  // Les blocs de floatedImageParagraphFrom, en tableau, avec ce que le flottement reporte sur le(s) frère(s) suivant(s) : mesuré depuis le <img> réel
  // plutôt que de changer la signature de retour de floatedImageParagraphFrom. Si le dernier bloc n'a pas de `columns` (texte déjà revenu sous
  // l'image), le flottement est épuisé, rien à reporter.
  function floatingBlocksWithCarry(floated, floatImgEl, availableWidthPt) {
    const blocks = Array.isArray(floated) ? floated : [floated];
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && !lastBlock.columns) {
      blocks._floatCarry = null;
    } else {
      const imgRect = floatImgEl.getBoundingClientRect();
      blocks._floatCarry = makeFloatCarry(imgRect, floatImgEl.getAttribute('data-align'), Math.max(15, imgRect.width * PX_TO_PT), availableWidthPt);
    }
    return blocks;
  }

  // Un paragraphe qui commence à côté d'un habillage reporté d'un frère précédent : ses blocs, ou `null` s'il ne le touche pas.
  function blocksBesideCarriedFloat(node, floatCarry, pageBreakBefore) {
    if (!(node.getBoundingClientRect().top < floatCarry.imgBottom)) return null;
    const cont = wrapParagraphBesideCarriedFloat(node, floatCarry);
    if (!cont) return null;
    if (pageBreakBefore && cont.blocks[0]) cont.blocks[0].pageBreak = 'before';
    cont.blocks._floatCarry = cont.stillActive ? floatCarry : null;
    return cont.blocks;
  }

  // Les runs d'un nœud de bloc : `rawRuns`, et `images` (les objets image qu'ils portent). Une sous-liste imbriquée (Tab pour imbriquer, cf.
  // js/editor.js) est exclue du texte de son <li> et traitée comme ses propres blocs (`nestedLists`).
  function blockRunsOf(node, tag) {
    const images = [];
    const nestedLists = tag === 'LI' ? Array.from(node.children).filter(c => /^(UL|OL)$/.test(c.tagName)) : [];
    const base = { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE };
    const rawRuns = nestedLists.length ? inlineRunsExcludingNestedLists(node, base, images) : inlineRuns(node, base, images);
    return { rawRuns, images, nestedLists };
  }

  // Une image habillée posée dans un bloc de repli (floatedImageParagraphFrom a échoué, ou aucun texte à côté) doit pouvoir reporter son habillage
  // sur les frères suivants (cf. wrapParagraphBesideCarriedFloat).
  function carryFloatOf(blocks, image, availableWidthPt) {
    if (!image._floatAlign) return;
    blocks._floatCarry = makeFloatCarry(image._sourceImgNode.getBoundingClientRect(), image._floatAlign, image.width, availableWidthPt);
  }

  // Les runs d'un paragraphe coupés à chaque image du flux : des segments de texte (`textRuns`) et d'image. Une image en calque est hors du flux : elle
  // ne coupe pas le texte (sinon la ligne se poursuivrait sur la suivante, une ligne de plus que dans l'éditeur), `layeredImages` les garde à part.
  function splitRunsAtImages(rawRuns, images) {
    const segments = [];
    const layeredImages = [];
    let currentTextRuns = [];
    let imgIdx = 0;
    rawRuns.forEach(r => {
      if (!r._imageMarker) { currentTextRuns.push(r); return; }
      const image = images[imgIdx++];
      if (image._pendingImgNode) { layeredImages.push(image); return; }
      segments.push({ textRuns: currentTextRuns }, { image });
      currentTextRuns = [];
    });
    segments.push({ textRuns: currentTextRuns });
    return { segments, layeredImages };
  }

  // Un paragraphe qui porte une image « au cœur du texte » sans habillage : plusieurs blocs pdfmake successifs (texte, image, texte...) dans l'ordre
  // réel du document - pdfmake ne sait pas faire une image réellement en ligne.
  function imageParagraphBlocks(ctx, { rawRuns, images }) {
    const { node, pageBreakBefore, availableWidthPt } = ctx;
    // Une image du flux (dans la ligne, « bloc », centrée) : les lignes mesurées dans l'hôte, cf. inFlowImageBlocksFrom. Un habillage dans le même
    // paragraphe garde le chemin ordinaire.
    const flowBlocks = images.some(img => img._floatAlign) ? null : inFlowImageBlocksFrom(node, images, pageBreakBefore);
    if (flowBlocks) return flowBlocks;
    const indentPt = measureIndentPt(node, 'text');
    const align = alignment(node);
    const { segments, layeredImages } = splitRunsAtImages(rawRuns, images);
    const blocks = [];
    segments.forEach(seg => {
      if (seg.image) {
        blocks.push(seg.image);
        carryFloatOf(blocks, seg.image, availableWidthPt);
        return;
      }
      const runs = trimEdgeWhitespace(seg.textRuns);
      if (!runs.length) return; // segment vide (ex. deux images consécutives, ou espace pur entre deux images)
      const textBlock = flowTextBlock(runs, indentPt);
      if (align) textBlock.alignment = align;
      blocks.push(textBlock);
    });
    layeredImages.forEach(image => blocks.push(image));
    // Un paragraphe qui ne porte que des images en calque (hors du flux), ou rien du tout, garde sa ligne, comme dans l'éditeur et le Word : sans
    // elle, tout ce qui suit remonterait d'une ligne dans le PDF (par exemple le calque « Sur toutes les pages » posé dans une ligne vide en haut
    // du modèle). Le saut de page qui le précède s'accroche à cette ligne, qui ouvre la page comme dans l'éditeur.
    if (!blocks.some(b => !b._pendingImgNode)) blocks.unshift(flowTextBlock(' ', indentPt));
    if (pageBreakBefore && blocks[0]) blocks[0].pageBreak = 'before';
    return blocks;
  }

  // Les blocs d'un nœud de texte ordinaire (paragraphe, titre, élément de liste, citation) : son bloc de texte, ses images, ses sous-listes.
  function ordinaryBlocks(ctx, { rawRuns, images, nestedLists }) {
    const { node, tag, pageBreakBefore, headingMarkers, availableWidthPt, rootRect } = ctx;
    const runs = trimEdgeWhitespace(rawRuns.filter(r => !r._imageMarker));
    const block = textBlockFrom(node, tag, runs, headingMarkers);
    const blocks = [];
    // Un bloc sans texte qui ne contient qu'une image dans le flux n'a pas besoin du bloc-texte de repli `text: ' '` : l'image fait sa hauteur, et le
    // pousser quand même décalerait tout le contenu suivant (et l'ancrage des images voisines, cf. resolvePendingImageAnchors). Celui qui ne porte
    // que des images en calque garde sa ligne (cf. imageParagraphBlocks).
    if (runs.length || !images.length || images.every(img => img._pendingImgNode)) {
      if (pageBreakBefore) block.pageBreak = 'before';
      blocks.push(block);
    } else if (pageBreakBefore && images[0]) {
      images[0].pageBreak = 'before';
    }
    images.forEach(img => {
      blocks.push(img);
      // Image flottante seule dans son paragraphe (aucun texte à côté) : le flottement doit quand même pouvoir se reporter sur le(s) frère(s) suivant(s).
      carryFloatOf(blocks, img, availableWidthPt);
    });
    nestedLists.forEach(list => {
      Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
        blockFrom(li, false, headingMarkers, availableWidthPt, rootRect).forEach(nested => blocks.push(nested));
      });
    });
    return blocks;
  }

  // Le bloc de texte d'un paragraphe, d'un titre, d'un élément de liste ou d'une citation.
  function textBlockFrom(node, tag, runs, headingMarkers) {
    const isHeading = /^H[1-6]$/.test(tag);
    const indentPt = measureIndentPt(node, (tag === 'LI' || isHeading) ? 'box' : 'text');
    // Marge verticale nulle entre blocs (mesuré : .tiptap p/h1-6/li/ol/ul { margin: 0 }) - une marge fictive ici dériverait de la vraie mise en page.
    // Marge droite = spaceWidthPt() : compense white-space:break-spaces.
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node);
    if (align) block.alignment = align;
    // Une légende vide garde sa hauteur de petite ligne, comme dans l'éditeur (le bloc de repli `text: ' '` n'a aucun run qui porte la taille).
    if (!runs.length && tag === 'P' && node.hasAttribute('data-caption')) block.fontSize = Caption.SIZE_PT;
    if (isHeading) headingFields(block, node, tag, runs, headingMarkerOf(headingMarkers, node));
    if (tag === 'LI') listItemFields(block, node, runs, align);
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, 4, spaceWidthPt(), 4]; }
    return block;
  }

  function headingFields(block, node, tag, runs, marker) {
    block.bold = true;
    if (marker && runs.length) block.text = [{ text: marker, fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }].concat(runs);
    block._isHeading = true;
    block._headingLevel = parseInt(tag.slice(1), 10);
    block._headingText = (marker + (node.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function listItemFields(block, node, runs, align) {
    if (isTaskListItem(node)) {
      delete block.text;
      delete block.alignment; // porté sur la colonne de texte, cf. taskListColumns
      block.columns = taskListColumns(node, taskListRuns(node, runs), align);
    } else {
      block.text = runs.length ? [{ text: listMarkerFor(node), fontSize: DEFAULT_FONT_SIZE }].concat(runs) : ' ';
    }
  }

  // Le contenu pdfmake d'une racine HTML : ses blocs, et ce que la suite en tire (`_headingBlocks`, `_tocBlocks`, `_footnoteBlocks`, `_slotStarts`,
  // `_captionPairs`, `_stretchedBlocks`, `_pendingImages`). `isTopLevel` : la racine du document, pas une colonne ou un encadré.
  async function buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel, opts) {
    // Remis à zéro seulement à l'appel de premier niveau : la fonction est aussi appelée par colonne (twoColumnsFrom), et la 2e colonne effacerait
    // les notes de la 1re. Variables de module pour continuer la numérotation à toute profondeur.
    if (isTopLevel) {
      footnoteCounter = 0;
      footnoteEntries = [];
      stretchedBlocks = [];
    }
    const st = contentStateFor(root, headingMarkers, availableWidthPt, isTopLevel);
    for (const child of Array.from(root.childNodes)) { await visitNode(st, child); }
    closeKeepRun(st, st.keepRun);
    st.keepRun = null;
    fillTocBlocks(st.tocBlocks, st.headingBlocks);
    growForOverflowingFloat(st, opts);
    return contentFrom(st);
  }

  // L'état d'une construction de contenu : ce que visitNode lit et remplit en parcourant le HTML.
  function contentStateFor(root, headingMarkers, availableWidthPt, isTopLevel) {
    return {
      isTopLevel, headingMarkers, availableWidthPt,
      rootRect: root.getBoundingClientRect(),
      // Les blocs, et en parallèle le nœud DOM de premier niveau source de chaque entrée (il ne sert qu'à mesurer la position rendue des blocs voisins
      // d'une image en calque : résolution d'ancrage) et son slot (null hors macro-modèle : une image sans position de page n'est encadrée que par les
      // blocs de son slot).
      blocks: [], sourceNodes: [], blockSlots: [],
      headingBlocks: [], tocBlocks: [], footnoteBlocks: [],
      // Images en calque imbriquées (cellule de tableau, colonne 2-colonnes) - accumulées à part de resolvePendingImageAnchors (qui ne voit que le
      // top-level) : tableFrom/twoColumnsFrom posent un `_nestedPending` sur leur bloc, récolté ici puis fusionné dans content._pendingImages, même
      // résolution.
      nestedPendingAll: [],
      pendingPageBreak: false,
      // Habillage d'une image flottante qui déborde encore verticalement une fois son paragraphe hôte terminé - transmis au(x) frère(s) suivant(s) via
      // blockFrom tant qu'ils restent des <p>/<div> simples ; remis à null dès qu'arrive une structure plus complexe (tableau, titre, liste...).
      floatCarry: null,
      // Macro-modèle : rang du slot que le dernier saut de page ouvre tant que son premier bloc n'est pas posé, puis rang -> indice de ce bloc dans
      // `blocks`.
      pendingSlotStart: null, currentSlot: null, slotStarts: {},
      // « Rester ensemble » (js/caption.js) : les images et les tableaux du texte courant que suit une légende, avec leur légende - { start, last }, le
      // premier bloc de l'image ou du tableau (la dernière ligne seule, pour un tableau qui se coupe entre deux lignes) et le dernier bloc de la
      // légende. captionKeepRule les garde sur une même page. `captionOwner` : le bloc qui vient d'être posé et peut encore recevoir sa légende (le
      // frère suivant) ; tout autre nœud le referme.
      captionPairs: [], captionOwner: null,
      // « Garder avec le suivant » (js/keep-with-next.js) : la suite de paragraphes gardés en cours - { start, last, unitPt, count } : son premier et
      // son dernier bloc posés, la hauteur qu'elle porte (en points) et son nombre de paragraphes. Le bloc qui la suit la referme en paire que
      // captionKeepRule garde sur une même page (`headOnly` : seule la tête de ce bloc doit y tenir). Tout ce qui n'est pas un bloc à garder la referme
      // de même quand elle compte au moins deux paragraphes. Au-delà de 90 % d'une page, rien à garder (Caption.fitsWithCaption, même plafond).
      keepRun: null, keepHeadCount: 0,
      // Le bas, dans l'hôte de mesure, du dernier bloc posé.
      lastBlockBottomPx: null,
    };
  }

  const inFlow = block => !!block && !block._pendingImgNode && !block.absolutePosition;

  function pushBlock(st, block, node) {
    if (st.pendingSlotStart != null) { st.slotStarts[st.pendingSlotStart] = st.blocks.length; st.pendingSlotStart = null; }
    st.blocks.push(block); st.sourceNodes.push(node); st.blockSlots.push(st.currentSlot);
  }

  // Un bloc ne porte qu'un `id` : une seconde paire qui part du même bloc (un paragraphe gardé qui porte une image et sa légende) se range sous la
  // première (`more`).
  function claimKeepId(st, pair) {
    const { captionPairs } = st;
    const own = typeof pair.start.id === 'string' && pair.start.id.indexOf(CAPTION_KEEP_ID) === 0 ? captionPairs[parseInt(pair.start.id.slice(CAPTION_KEEP_ID.length), 10)] : null;
    if (own) { own.more = (own.more || []).concat(pair); return; }
    pair.start.id = CAPTION_KEEP_ID + captionPairs.length;
    captionPairs.push(pair);
  }

  function firstTextOf(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.text !== undefined) return node;
    const inner = node.stack || node.columns || node.ul || node.ol || (node.table && node.table.body && node.table.body[0]);
    for (const child of inner || []) { const found = firstTextOf(child); if (found) return found; }
    return null;
  }

  // Un tableau dont les lignes ne se coupent pas (dontBreakRows) range chaque ligne dans un bloc insécable : pdfmake y note la page où elle a commencé de
  // se ranger, avant de la passer à la suivante, et ne corrige cette page que pour un texte qui porte un `id` (elementWriter.addFragment). Pour un tel
  // tableau, `head` est le premier texte de sa première ligne hors titres (celle des titres, reprise en haut de chaque page, y fausserait la page de
  // nouveau), muni d'un `id` : captionKeepRule y lit la page où la tête du tableau tombe vraiment.
  function keepHeadOf(st, block) {
    if (!block || !block.table || !block.table.dontBreakRows) return null;
    const body = block.table.body || [];
    for (const cell of body[Math.min(block.table.headerRows || 0, body.length - 1)] || []) {
      const text = firstTextOf(cell);
      if (text) { if (!text.id) text.id = KEEP_HEAD_ID + st.keepHeadCount++; return text; }
    }
    return null;
  }

  function closeKeepRun(st, run, target, targetPt) {
    const last = target || (run && run.count > 1 ? run.last : null);
    if (!run || !last || !KeepWithNext.fits(run.unitPt + (target ? targetPt : 0), tablePageHeightPt)) return;
    claimKeepId(st, { start: run.start, last, head: target ? keepHeadOf(st, target) : null, headOnly: true });
  }

  // Un nœud du HTML : un bloc (ou plusieurs) posé dans `st`, avec ce que la suite en retient ; un conteneur sans bloc propre se parcourt.
  async function visitNode(st, node) {
    if (node.nodeType === Node.TEXT_NODE) { visitText(st, node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const owner = st.captionOwner;
    st.captionOwner = null;
    const run = st.keepRun;
    st.keepRun = null;
    const classes = node.classList;
    if (classes.contains('page-break-marker')) { visitPageBreak(st, node, run); return; }
    if (classes.contains('heading-numbering-config')) { st.keepRun = run; return; }
    if (classes.contains('toc-marker')) { visitToc(st, node, run); return; }
    // Pas de branche dédiée pour un <table> : le HTML sérialisé (Editor.getHTML()) ne porte jamais le wrapper de défilement ajouté en édition live,
    // un <table> y est donc un enfant direct, déjà couvert par isBlock()/blockFrom().
    if (classes.contains('two-columns-zone')) { await visitZone(st, node, run); return; }
    if (classes.contains('callout')) { await visitCallout(st, node, run); return; }
    if (isBlock(node)) { visitBlockNode(st, node, run, owner); return; }
    // Un conteneur sans bloc propre (une liste) : son premier élément est le bloc qui suit la suite gardée.
    st.keepRun = run;
    for (const child of Array.from(node.childNodes)) { await visitNode(st, child); }
  }

  function visitText(st, node) {
    if (node.nodeValue.trim()) {
      st.captionOwner = null;
      closeKeepRun(st, st.keepRun);
      st.keepRun = null;
      pushBlock(st, { ...glyphText(node.nodeValue, { lineHeight: LINE_HEIGHT_RATIO }), margin: [0, 2, 0, 4], ...(st.pendingPageBreak ? { pageBreak: 'before' } : {}) }, node.parentElement);
    }
    st.pendingPageBreak = false;
  }

  function visitPageBreak(st, node, run) {
    closeKeepRun(st, run);
    st.pendingPageBreak = true;
    st.floatCarry = null;
    if (st.isTopLevel && node.hasAttribute('data-macro-slot')) { st.currentSlot = st.pendingSlotStart = node.getAttribute('data-macro-slot'); }
  }

  function visitToc(st, node, run) {
    closeKeepRun(st, run);
    const tocBlock = { stack: [{ text: I18n.t('pdf.tocTitle'), bold: true, fontSize: 16 }], ...(st.pendingPageBreak ? { pageBreak: 'before' } : {}) };
    pushBlock(st, tocBlock, node);
    st.tocBlocks.push(tocBlock);
    st.pendingPageBreak = false;
    st.floatCarry = null;
  }

  // Une zone 2 colonnes ou un encadré : un seul bloc, que `build` fabrique ; à défaut (structure inattendue), un repli en texte brut. Ses images en
  // calque imbriquées et ses notes remontent au contenu.
  async function containerBlockFrom(st, node, skipped, build) {
    const footnoteCheckpoint = footnoteEntries.length;
    let block;
    try { block = await build(node, st.pendingPageBreak, st.rootRect); }
    catch (e) { console.warn('[PdfExport] ' + skipped + ' (structure inattendue), repli en texte brut :', e); block = fallbackTextBlock(node, st.pendingPageBreak); }
    if (block && block._nestedPending) { st.nestedPendingAll.push(...block._nestedPending); delete block._nestedPending; }
    // Note(s) trouvée(s) n'importe où dans le bloc : rattachées au bloc top-level englobant, suffisant pour savoir sur quelle page placer le texte de la
    // note.
    if (footnoteEntries.length > footnoteCheckpoint) st.footnoteBlocks.push(...footnoteEntries.slice(footnoteCheckpoint).map(fe => ({ block, number: fe.number, text: fe.text })));
    return block;
  }

  async function visitZone(st, node, run) {
    const zoneBlock = await containerBlockFrom(st, node, 'zone 2 colonnes ignorée', twoColumnsFrom);
    pushBlock(st, zoneBlock, node);
    closeKeepRun(st, run, zoneBlock, node.getBoundingClientRect().height * PX_TO_PT);
    st.pendingPageBreak = false;
    st.floatCarry = null;
  }

  async function visitCallout(st, node, run) {
    const calloutBlock = await containerBlockFrom(st, node, 'encadré ignoré', calloutFrom);
    pushBlock(st, calloutBlock, node);
    closeKeepRun(st, run, calloutBlock, node.getBoundingClientRect().height * PX_TO_PT);
    st.pendingPageBreak = false;
    st.floatCarry = (calloutBlock && calloutBlock._floatCarryOut) || null;
    if (calloutBlock) delete calloutBlock._floatCarryOut;
    st.lastBlockBottomPx = null;
  }

  // Un nœud de bloc du texte : les blocs que blockFrom en fait (un repli en texte brut si sa structure est inattendue), posés dans `st` avec leurs
  // notes, et ce que la suite en retient : l'habillage reporté, la suite gardée avec le suivant, la légende.
  function visitBlockNode(st, node, run, owner) {
    const footnoteCheckpoint = footnoteEntries.length;
    // Les légendes qui suivent une image ou un tableau du texte courant (hauteur en points : un tableau en tient compte pour garder sa dernière ligne
    // avec elles).
    const keepable = st.isTopLevel && tablePageHeightPt > 0;
    const captions = keepable ? Caption.captionsAfter(node) : [];
    const captionPt = captions.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) * PX_TO_PT;
    const carriedFloat = st.floatCarry && st.floatCarry.overlay ? st.floatCarry : null;
    let produced;
    try { produced = blockFrom(node, st.pendingPageBreak, st.headingMarkers, st.availableWidthPt, st.rootRect, st.floatCarry, captionPt); }
    catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, st.pendingPageBreak)]; }
    st.floatCarry = (produced && produced._floatCarry) || null;
    const nodeRect = node.getBoundingClientRect();
    spaceBelowCarriedFloat(st, nodeRect, produced, carriedFloat);
    st.lastBlockBottomPx = nodeRect.bottom;
    const newFootnotes = footnoteEntries.length > footnoteCheckpoint ? footnoteEntries.slice(footnoteCheckpoint) : null;
    pushProduced(st, node, produced, newFootnotes);
    const nodePt = nodeRect.height * PX_TO_PT;
    updateKeepRun(st, node, produced, run, { keepable, captions, captionPt, nodePt });
    if (keepable) trackCaption(st, node, produced, owner, captions, captionPt);
  }

  // Une image habillée qui dépasse encore le bloc d'avant : un paragraphe se range à côté d'elle (carriedFloatBlocksFrom), mais tout autre bloc
  // (tableau, titre, liste, citation, code, paragraphe qui porte lui-même une image) n'a pas de texte décalable : il repart sous l'image, sans la
  // recouvrir. Le navigateur le fait descendre sous l'image de lui-même quand il ne tient pas à côté (un tableau) : le vide qu'il a laissé au-dessus
  // du bloc se retrouve dans le PDF ; sinon (un titre, une liste), c'est ce qu'il faut pour passer sous l'image.
  function spaceBelowCarriedFloat(st, nodeRect, produced, carriedFloat) {
    if (!carriedFloat || produced._carried) return;
    const gapPt = Math.max(carriedFloat.floatBottomPx - nodeRect.top, st.lastBlockBottomPx == null ? 0 : nodeRect.top - st.lastBlockBottomPx) * PX_TO_PT;
    const first = produced.find(inFlow);
    if (gapPt > 0.5 && first) addTopMargin(first, gapPt);
  }

  // Pose les blocs d'un nœud. Les notes trouvées dans ce nœud s'attachent au premier bloc produit : plusieurs blocs pour un seul nœud source atterrissent
  // presque toujours sur la même page, précision suffisante ici. Un saut de page ne peut pas tenir sur une image en calque : elle sort du flux
  // (position absolue résolue plus tard) et l'emporterait avec elle, le texte qui suit resterait sur la page d'avant. Le paragraphe qui ne contient que
  // de telles images (un triangle de coin posé juste après le saut) le laisse au bloc suivant.
  function pushProduced(st, node, produced, newFootnotes) {
    const breakLeavesWithLayers = st.pendingPageBreak && produced.length > 0 && produced.every(b => b && b._pendingImgNode);
    if (breakLeavesWithLayers) produced.forEach(b => { delete b.pageBreak; });
    produced.forEach((b, i) => {
      if (b && b._nestedPending) { st.nestedPendingAll.push(...b._nestedPending); delete b._nestedPending; }
      pushBlock(st, b, node);
      if (b && b._isHeading) st.headingBlocks.push(b);
      if (i === 0 && newFootnotes) st.footnoteBlocks.push(...newFootnotes.map(fe => ({ block: b, number: fe.number, text: fe.text })));
    });
    st.pendingPageBreak = breakLeavesWithLayers;
  }

  // « Garder avec le suivant » : un paragraphe gardé ouvre ou prolonge la suite, tout autre bloc la referme (il en est la cible : sa tête, la première
  // ligne d'un tableau ou le bloc avec ses légendes, doit tenir avec elle). Un paragraphe sans bloc dans le flux (rien que des images en calque) ne
  // compte pas.
  function updateKeepRun(st, node, produced, run, { keepable, captions, captionPt, nodePt }) {
    const firstFlow = produced.find(inFlow);
    if (keepable && KeepWithNext.isKeptElement(node)) {
      st.keepRun = extendKeepRun(run, firstFlow, nodePt);
    } else if (run && firstFlow) {
      const firstRow = node.tagName === 'TABLE' ? node.querySelector('tr') : null;
      const headPt = firstRow ? Math.min(nodePt, firstRow.getBoundingClientRect().height * PX_TO_PT) : (captions.length && Caption.fitsWithCaption(nodePt + captionPt, tablePageHeightPt) ? nodePt + captionPt : nodePt);
      closeKeepRun(st, run, firstFlow, headPt);
    } else if (run) {
      st.keepRun = run;
    }
  }

  // La suite gardée en cours, prolongée du bloc `firstFlow` ou ouverte par lui ; inchangée quand le nœud n'a aucun bloc dans le flux.
  function extendKeepRun(run, firstFlow, nodePt) {
    if (!firstFlow) return run;
    if (!run) return { start: firstFlow, last: firstFlow, unitPt: nodePt, count: 1 };
    return Object.assign(run, { last: firstFlow, unitPt: run.unitPt + nodePt, count: run.count + 1 });
  }

  function trackCaption(st, node, produced, owner, captions, captionPt) {
    if (owner && Caption.isCaptionElement(node)) {
      // Une légende de l'image ou du tableau qui précède : le dernier bloc posé de la paire est celui de cette légende (une autre légende à la suite le
      // prolongera).
      const lastBlock = produced.filter(inFlow).pop();
      if (lastBlock) {
        if (!owner.pair) { owner.pair = { start: owner.start, last: lastBlock }; claimKeepId(st, owner.pair); }
        else owner.pair.last = lastBlock;
        st.captionOwner = owner;
      }
    } else if (captions.length) {
      // L'image ou le tableau et sa légende tiennent-ils ensemble dans une page ? Sinon rien à garder (Caption.fitsWithCaption). Un tableau coupé entre
      // deux lignes ne garde que sa dernière ligne.
      const tail = produced.find(b => b && b._keepTail);
      const start = tail || produced.find(inFlow);
      const unitPt = tail ? tail._keepUnitPt : (node.getBoundingClientRect().height * PX_TO_PT + captionPt);
      if (start && Caption.fitsWithCaption(unitPt, tablePageHeightPt)) st.captionOwner = { start, pair: null };
    }
  }

  // Repli si structure de titres inattendue : le tocBlock garde son stack par défaut (le titre du sommaire seul, posé à sa création) plutôt que de
  // faire échouer tout l'export - même granularité de repli que blockFrom pour un bloc de contenu.
  function fillTocBlocks(tocBlocks, headingBlocks) {
    tocBlocks.forEach(tocBlock => {
      try {
        const built = buildTocStack(headingBlocks);
        tocBlock.stack = built.stack;
        tocBlock._pageNumberCells = built.pageNumberCells;
      } catch (e) { console.warn('[PdfExport] sommaire ignoré (structure de titres inattendue) :', e); }
    });
  }

  // Une colonne contient ses images habillées : l'image qui dépasse son dernier bloc lui donne sa hauteur, marge du dessous comprise. Un encadré, non
  // (`opts.floatsOverflow`) : l'image dépasse, comme dans l'éditeur.
  function growForOverflowingFloat(st, opts) {
    const { floatCarry, lastBlockBottomPx } = st;
    if (st.isTopLevel || (opts && opts.floatsOverflow) || !(floatCarry && floatCarry.overlay) || lastBlockBottomPx == null) return;
    const lastFlow = st.blocks.slice().reverse().find(inFlow);
    const extraPt = (floatCarry.floatBottomPx - lastBlockBottomPx) * PX_TO_PT;
    if (extraPt > 0.5 && lastFlow) addBottomMargin(lastFlow, extraPt);
  }

  function contentFrom(st) {
    const { blocks } = st;
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    content._headingBlocks = st.headingBlocks;
    content._tocBlocks = st.tocBlocks;
    content._footnoteBlocks = st.footnoteBlocks;
    content._slotStarts = st.slotStarts;
    content._captionPairs = st.captionPairs;
    content._stretchedBlocks = stretchedBlocks;
    // Repli : images en calque laissées à leur placeholder plutôt que de faire échouer tout l'export si l'ancrage échoue.
    try { content._pendingImages = resolvePendingImageAnchors(st.rootRect, blocks, st.sourceNodes, st.blockSlots).concat(st.nestedPendingAll); }
    catch (e) { console.warn('[PdfExport] ancrage des images en calque ignoré :', e); content._pendingImages = st.nestedPendingAll; }
    return content;
  }

  // Une image en calque est positionnée par glisser n'importe où dans l'éditeur, sans lien avec l'endroit où son <img> vit dans le HTML - ancrer sur
  // le bloc précédent/suivant ne suffit donc pas. On cherche plutôt, parmi tous les blocs top-level mesurables, ceux qui encadrent le plus
  // étroitement l'image.
  function resolvePendingImageAnchors(rootRect, blocks, sourceNodes, blockSlots) {
    const pending = [];
    // Un paragraphe qui ne contient que l'image produit un bloc-texte compagnon fantôme, de hauteur quasi nulle, qui pourrait par coïncidence
    // qualifier comme ancre : exclu de `measurable`, comme le bloc image lui-même.
    const pendingHostNodes = new Set(blocks.map((b, i) => (b && b._pendingImgNode) ? sourceNodes[i] : null).filter(Boolean));
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i], slot: blockSlots[i] })).filter(({ block, node }) => block && !block._pendingImgNode && !pendingHostNodes.has(node));
    // Une image nichée avec du texte réel autour a une meilleure référence que le bracketing générique : le début de son propre paragraphe,
    // prioritaire quand il existe.
    const hostToOwnTextBlock = new Map();
    blocks.forEach((b, i) => {
      if (b && !b._pendingImgNode && sourceNodes[i] && !hostToOwnTextBlock.has(sourceNodes[i])) hostToOwnTextBlock.set(sourceNodes[i], b);
    });
    // Tolérance de rendu : les sous-pixels de police et d'interligne varient d'un navigateur à l'autre. 0.5 px s'est révélé insuffisant : un
    // paragraphe de plusieurs lignes centrées débordait son ancre de 1.25 px, le bracketing « au-dessus » échouait et l'image retombait sur le repli
    // générique, une erreur d'une fraction de pixel devenant une erreur de ~150 pt. Le cas le plus courant (image tout juste insérée puis passée en
    // calque « devant » sous un paragraphe) place son top presque exactement au bord bas de ce paragraphe (setLayer part de la position rendue) :
    // cette marge est justifiée.
    const BOUNDARY_EPS_PX = 5;
    blocks.forEach((block, idx) => {
      if (!block || !block._pendingImgNode) return;
      const imgRect = block._pendingImgNode.getBoundingClientRect();
      // Repère brut (sans le -A4_PREVIEW_PADDING_TOP_PX ci-dessous), réservé au bracketing above/below qui suit : comparer un imgTopPx déjà décalé de
      // 37 px à des bottom et top de candidats qui ne le sont pas rendrait le bracketing « au-dessus » trop strict de 37 px (il ratait une ancre
      // juste au-dessus : image posée après une seule ligne de texte) et le bracketing « en dessous » trop permissif d'autant.
      const rawImgTopPx = imgRect.top - rootRect.top;
      const rawImgBottomPx = imgRect.bottom - rootRect.top;
      // Ramène au référentiel sans padding utilisé par tout le reste de cette fonction (mesures prises dans l'hôte de mesure).
      const imgTopPx = rawImgTopPx - A4_PREVIEW_PADDING_TOP_PX;
      const imgBottomPx = rawImgBottomPx - A4_PREVIEW_PADDING_TOP_PX;
      const imgLeftPx = imgRect.left - rootRect.left - A4_PREVIEW_PADDING_LEFT_PX;
      const hostNode = sourceNodes[idx];
      const container = hostToOwnTextBlock.get(hostNode) || null;
      const containerTopPx = (container && hostNode && hostNode.getBoundingClientRect) ? (hostNode.getBoundingClientRect().top - rootRect.top) : null;
      const containerLeftPx = (container && hostNode && hostNode.getBoundingClientRect) ? (hostNode.getBoundingClientRect().left - rootRect.left) : null;
      let above = null, aboveTopPx = -Infinity, aboveLeftPx = null;
      let below = null, belowTopPx = Infinity, belowLeftPx = null;
      measurable.forEach(({ block: other, node, slot }) => {
        if (!node || !node.getBoundingClientRect) return;
        // Macro-modèle : un bloc d'un autre slot n'est jamais une ancre (le haut du slot d'une image n'a pas de bloc « au-dessus » : celui du slot
        // précédent est sur une autre page).
        if (slot !== blockSlots[idx]) return;
        const r = node.getBoundingClientRect();
        const top = r.top - rootRect.top;
        const bottom = r.bottom - rootRect.top;
        const left = r.left - rootRect.left;
        // Qualifie comme ancre seulement si le bloc entier (haut et bas, pas son seul sommet) se termine avant l'image ou commence après elle : sinon
        // le paragraphe qui contient l'image (texte avant et après) serait à tort sa propre ancre « au-dessus ». Comparaison sur les repères bruts
        // (rawImgTopPx, rawImgBottomPx) des deux côtés, jamais un côté ajusté contre un côté brut.
        if (bottom <= rawImgTopPx + BOUNDARY_EPS_PX && top > aboveTopPx) { aboveTopPx = top; aboveLeftPx = left; above = other; }
        if (top >= rawImgBottomPx - BOUNDARY_EPS_PX && top < belowTopPx) { belowTopPx = top; belowLeftPx = left; below = other; }
      });
      // parentArray : tableau dans lequel l'image et son ancre vivent toutes les deux, utilisé par resolveNativePdfContent pour relocaliser l'image à
      // côté de son ancre sans dépendre d'un tableau top-level codé en dur.
      pending.push({
        image: block, above, below, imgTopPx, imgLeftPx, imgHeightPx: imgBottomPx - imgTopPx,
        aboveTopPx, belowTopPx, aboveLeftPx, belowLeftPx, container, containerTopPx, containerLeftPx, parentArray: blocks,
      });
    });
    return pending;
  }

  // Un bloc vide s'effondre à hauteur nulle en mesure hors écran, alors que ProseMirror y insère un <br> décoratif (absent de Editor.getHTML()) :
  // plusieurs lignes vides consécutives se mesureraient à la même position et fausseraient le bracketing voisin, d'où le même filler avant la mesure.
  // Même chose pour un bloc qui ne porte que des images en calque ou habillées (à gauche ou à droite) : elles ne prennent pas de place dans la ligne,
  // l'éditeur laisse à ce bloc sa ligne vide (le <br> que ProseMirror pose après elles), sinon les blocs suivants se mesureraient une ligne trop
  // haut.
  function holdsOnlyLayeredImages(el) {
    return el.children.length > 0 && Array.from(el.childNodes).every(n => (n.nodeType === Node.ELEMENT_NODE && n.matches(LAYER_IMAGE_SELECTOR + ', ' + FLOAT_IMAGE_SELECTOR)) || (n.nodeType === Node.TEXT_NODE && !n.nodeValue.trim()));
  }
  function insertTrailingBreaksForEmptyBlocks(root) {
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th').forEach(el => {
      if (!el.hasChildNodes() || holdsOnlyLayeredImages(el)) {
        const br = document.createElement('br');
        br.setAttribute('data-pdf-measure-filler', '1');
        el.appendChild(br);
      }
    });
  }
  // Image en calque (flottante) : celles que l'éditeur pose en position:absolute (même définition que pdfImageFromNode).
  const LAYER_IMAGE_SELECTOR = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';
  const FLOAT_IMAGE_SELECTOR = 'img.editor-image[data-align="left"], img.editor-image[data-align="right"]';
  // Macro-modèle (js/macro-templates.js:buildConcatenatedHtml) : chaque slot garde les positions d'image de son modèle, comptées depuis le haut de sa
  // première page, alors que les slots suivants commencent plus bas, après le saut de page qui les ouvre (data-macro-slot). Deux choses sont posées
  // sur les images en calque du slot : (1) leur `top` descend du décalage du slot dans l'hôte de mesure, pour le repli par ancrage textuel des images
  // sans position de page (encadrées alors par les blocs de leur slot, plus par ceux du premier) ; (2) `data-macro-slot` porte leur slot jusqu'à leur
  // position de page, qui ajoute la page où le slot commence (resolveNativePdfContent). Appelée sur l'hôte attaché, avant la conversion : les copies
  // imbriquées (cellule, colonne) héritent de l'attribut.
  function rebaseMacroSlotImages(root) {
    if (!root.querySelector(':scope > .page-break-marker[data-macro-slot]')) return;
    let slot = null;
    let shiftPx = 0;
    Array.from(root.children).forEach(child => {
      if (child.matches('.page-break-marker[data-macro-slot]')) {
        slot = child.getAttribute('data-macro-slot');
        shiftPx = child.offsetTop + child.offsetHeight + (parseFloat(getComputedStyle(child).marginBottom) || 0);
        return;
      }
      if (slot == null) return;
      const layered = child.matches(LAYER_IMAGE_SELECTOR) ? [child] : Array.from(child.querySelectorAll(LAYER_IMAGE_SELECTOR));
      layered.forEach(img => {
        img.setAttribute('data-macro-slot', slot);
        if (img.style.position === 'absolute' && img.offsetParent === root) img.style.top = ((parseFloat(img.style.top) || 0) + shiftPx) + 'px';
      });
    });
  }
  // Contenu pdfmake d'un fragment HTML. `isTopLevel` : vrai pour le flux principal (titres numérotés, sommaire, notes, images en calque), faux pour
  // une colonne ou un encadré. `availableWidthPt` : la largeur réelle quand ce n'est pas celle de la page (colonne reconstruite dans un hôte de
  // mesure à part). `opts.floatsOverflow` : une image habillée dépasse le dernier bloc au lieu de lui donner sa hauteur (encadré).
  async function htmlToPdfContent(html, isTopLevel, availableWidthPt, opts) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    // Ni ligne vide ni saut de page orphelin en fin de document : quand le texte arrive à la marge du bas, ils ouvriraient une page blanche.
    if (isTopLevel) ReaderMode.trimTrailingBlankBlocks(root);
    insertTrailingBreaksForEmptyBlocks(root);
    let headingMarkers = null;
    if (isTopLevel) {
      const config = root.querySelector(':scope > .heading-numbering-config');
      const style = (config && config.dataset.style) || 'none';
      root.dataset.headingStyle = style;
      const headingEls = Array.from(root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
      const markers = HeadingNumbering.markersFor(headingEls, style);
      headingMarkers = new Map(headingEls.map((el, i) => [el, markers[i]]));
    }
    const widthPx = availableWidthPt != null ? availableWidthPt / PX_TO_PT : null;
    const detachMeasureHost = attachPdfMeasureHost(root, widthPx);
    try {
      // Attend le décodage de chaque <img> de ce root avant toute mesure : getBoundingClientRect() sur une image en hauteur auto a besoin du ratio
      // intrinsèque réel, qu'un pré-chauffage du cache sur un élément séparé ne garantit pas.
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      if (isTopLevel) rebaseMacroSlotImages(root);
      return await buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel, opts);
    } finally {
      detachMeasureHost();
    }
  }

  // pdfmake exige une image en data URI base64 : un simple src http(s)://... (upload Grist ou URL externe) n'est jamais rendu, silencieusement. Il ne
  // sait embarquer que du JPEG et du PNG (SVG et WEBP le font bloquer indéfiniment ou lever "Unknown image format") : tout autre format est redessiné
  // en PNG, cas fréquent quand un CDN renvoie du WEBP par négociation de contenu même pour une URL en ".png". En cas d'échec (réseau, CORS...),
  // marque l'image à ignorer plutôt que de faire planter tout l'export.
  async function inlineEditorImagesAsDataUri(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';
    const images = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(images.map(async img => {
      let src = img.getAttribute('src') || '';
      if (!src) { ExportCommon.noteImageWithoutSource(img); return; }
      try {
        if (!src.startsWith('data:')) src = await ImageIo.toDataUri(await ImageIo.fetchBlob(src));
        if (!/^data:image\/(png|jpe?g);/.test(src)) src = (await ImageIo.draw(src)).toDataURL('image/png');
        img.setAttribute('src', src);
        // Décode ici, avant la resérialisation : une hauteur `auto` a besoin du ratio intrinsèque, connu une fois l'image décodée, sinon
        // floatedImageParagraphFrom mesurerait `imgRect.bottom` trop tôt. `decode()` pré-chauffe aussi le cache pour le <img> reparsé plus tard.
        await img.decode().catch(() => {});
      } catch (e) {
        console.warn('[PdfExport] image ignorée dans le PDF vectoriel (conversion impossible) :', img.getAttribute('src'), e);
        img.setAttribute('data-pdf-skip', '1');
        ExportCommon.noteUnreadImage(img);
      }
    }));
    return wrapper.innerHTML;
  }

  // Le filigrane en SVG de la taille de la page, pour le fond de chaque page : un seul <text> Roboto gras (les caractères sont ceux de l'embarqué, du
  // vrai texte que le PDF garde), tourné autour du centre de la page. `y` est la ligne de base, à 0,342 em sous le centre
  // (PageLayer.WATERMARK_BASELINE_EM) comme à l'écran. Le texte est échappé : une esperluette ou un chevron dans « R&D < 5 » ne doit pas casser le
  // SVG, et avec lui tout l'export.
  function watermarkSvgFrom(layout) {
    const cx = pageWidthPt / 2, cy = pageHeightPt / 2;
    const escaped = layout.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const num = n => Math.round(n * 100) / 100;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(pageWidthPt) + '" height="' + num(pageHeightPt) + '" viewBox="0 0 ' + num(pageWidthPt) + ' ' + num(pageHeightPt) + '">'
      + '<text x="' + num(cx) + '" y="' + num(cy + PageLayer.WATERMARK_BASELINE_EM * layout.fontSizePt) + '" font-family="Roboto" font-weight="bold" font-size="' + layout.fontSizePt + '" text-anchor="middle"'
      + ' fill="' + layout.color + '" fill-opacity="' + layout.opacity + '" transform="rotate(' + layout.angleDeg + ' ' + num(cx) + ' ' + num(cy) + ')">' + escaped + '</text></svg>';
  }

  // « Rester ensemble » (js/caption.js) : la légende d'une image ou d'un tableau ne reste jamais seule en haut de la page suivante. Rappel
  // `pageBreakBefore` de pdfmake, appelé une fois par nœud après une mise en page, pour le premier bloc de chaque paire (`id` « pp-keep-N », posé par
  // buildPdfContentFromRoot) : il demande de le passer à la page suivante quand lui et sa légende ne sont plus sur la même page (pdfmake remet alors
  // tout en page, la légende suit). Un bloc déjà en haut de sa page ne bouge pas : le passer à la suivante n'ajouterait qu'une page blanche. Pas
  // d'`unbreakable` : pdfmake note les positions d'un bloc insécable à l'endroit où il ne tient pas, avant de le déplacer, et la page d'une note ou
  // d'une image en calque ancrée sur lui serait fausse. Un seul paramètre : pdfmake ne dresse les listes des nœuds voisins (en O(n²)) que pour un
  // rappel qui en déclare davantage.
  //
  // « Garder avec le suivant » (js/keep-with-next.js) passe par la même règle : la paire d'une suite de paragraphes gardés a pour `last` le bloc qui
  // la suit (`headOnly`) et se sépare quand la tête de ce bloc n'est pas sur la page du début de la suite (pour un tableau dont les lignes ne se
  // coupent pas, son premier texte hors titres : `head`) ; si ce bloc porte lui-même une légende (sa propre paire), c'est la fin de la légende qui
  // compte, comme pour lui.
  const CAPTION_KEEP_ID = 'pp-keep-';
  const KEEP_HEAD_ID = 'pp-head-';
  function captionKeepRule(pairs) {
    const endOf = pair => {
      const own = pair.headOnly ? pairs.find(p => p !== pair && p.start === pair.last) : null;
      const at = (own ? own.last : (pair.head || pair.last)).positions;
      return at && (pair.headOnly && !own ? at[0] : at[at.length - 1]);
    };
    const splits = pair => {
      const first = pair.start.positions && pair.start.positions[0];
      const end = endOf(pair);
      if (!first || !end || first.pageNumber === end.pageNumber) return false;
      const ownTopMargin = (pair.start._margin && pair.start._margin[1]) || 0;
      return first.verticalRatio * first.pageInnerHeight > ownTopMargin + 2;
    };
    return function (currentNode) {
      const id = currentNode && currentNode.id;
      if (typeof id !== 'string' || id.indexOf(CAPTION_KEEP_ID) !== 0) return false;
      const pair = pairs[parseInt(id.slice(CAPTION_KEEP_ID.length), 10)];
      return !!pair && [pair].concat(pair.more || []).some(splits);
    };
  }

  // Les marges haute et basse d'une page : celles du document, plus ce que l'en-tête et le pied prennent en plus, et la bande des notes quand il y en a.
  // Les deux passes (mesure et rendu) doivent avoir les mêmes, sinon la pagination mesurée dérive ; la marge basse sert aussi de plancher au filet de
  // sécurité anti-débordement de resolveImageAbsolutePosition.
  function pageMarginsPt(headerFooterChunks, hasFootnotes) {
    const extra = headerFooterChunks || {};
    return {
      topMarginPt: marginTopPt + (extra.topExtraPt || 0),
      bottomMarginPt: marginBottomPt + (extra.bottomExtraPt || 0) + (hasFootnotes ? FOOTNOTE_BAND_PT : 0),
    };
  }

  // `headerFooterChunks` est passé à l'identique aux deux passes (mesure et rendu réel) : sinon la hauteur de page disponible différerait et un titre
  // ou une image pourrait changer de page entre les deux.
  function buildNativeDocDefinition(content, filename, headerFooterChunks) {
    const hf = headerFooterChunks || { enabled: false, topExtraPt: 0, bottomExtraPt: 0 };
    // `content._footnoteBlocks` est posé par buildPdfContentFromRoot à chaque appel (mesure et finale, cf. resolveNativePdfContent) : cette condition
    // est donc la même aux deux passes, invariant que topExtraPt et bottomExtraPt exigent déjà (même marge aux deux passes, sinon la pagination
    // mesurée dérive).
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    const { topMarginPt, bottomMarginPt } = pageMarginsPt(hf, hasFootnotes);
    const doc = {
      pageSize: PageLayout.pdfPageNameFor(pageFormat), pageOrientation: pageOrientation,
      pageMargins: [marginLeftPt, topMarginPt, marginRightPt, bottomMarginPt],
      defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE },
      content, info: { title: filename || 'publipostage' },
    };
    if ((content._captionPairs || []).length) doc.pageBreakBefore = captionKeepRule(content._captionPairs);
    const background = pageBackgroundFor(content);
    if (background) doc.background = background;
    if (hf.enabled && (hf.header.default || hf.header.first)) doc.header = pageHeaderFor(hf);
    // Le pied de page doit exister même sans en-tête/pied configuré par l'utilisateur dès qu'il y a au moins une note : le texte des notes est ajouté
    // après le contenu utilisateur dans le même stack, en réutilisant le callback natif déjà appelé une fois par page.
    if ((hf.enabled && (hf.footer.default || hf.footer.first)) || hasFootnotes) doc.footer = pageFooterFor(hf, content);
    return doc;
  }

  // Le fond de chaque page, ou `null` s'il n'y en a pas. Le filigrane (js/page-layer.js:watermarkLayout : le corps et l'angle que l'éditeur dessine) est
  // le premier des fonds de chaque page, donc derrière le texte et derrière les images en calque, comme à l'écran : pas le `watermark` natif de pdfmake,
  // qui se peint après le contenu (par-dessus le texte et les images) et que rien ne descend dessous. Viennent ensuite les images répétées (« Sur toutes
  // les pages ») sur chaque page de leur courrier, puis les images « derrière » à position de page, au-delà de la 1re page (resolveNativePdfContent) :
  // pdfmake appelle `background` page par page, 1-based, et range ses mesures sur le nœud qu'il traite, d'où une copie par appel.
  function pageBackgroundFor(content) {
    const layout = PageLayer.watermarkLayout(pageWatermark, pageWidthPt, pageHeightPt);
    const watermarkNode = layout ? { svg: watermarkSvgFrom(layout), absolutePosition: { x: 0, y: 0 } } : null;
    const behindByPage = content._backgroundByPage || {};
    const repeatedLayer = content._repeatedLayer || [];
    if (!watermarkNode && !repeatedLayer.length && !Object.keys(behindByPage).length) return null;
    return currentPage => {
      const nodes = (watermarkNode ? [Object.assign({}, watermarkNode)] : [])
        .concat(repeatedLayer.filter(r => currentPage >= r.fromPage && currentPage <= r.toPage).map(r => Object.assign({}, r.image)), behindByPage[currentPage] || []);
      return nodes.length ? nodes : null;
    };
  }

  // « Première page différente » se résout à chaque page, au moment de peindre (currentPage === 1), pas dans buildHeaderFooterPdfChunks qui se contente
  // de préparer les 2 variantes.
  const chunkForPage = (hf, variants, currentPage) => ((currentPage === 1 && hf.differentFirstPage) ? variants.first : variants.default);

  function pageHeaderFor(hf) {
    return (currentPage, pageCount) => {
      const chunk = chunkForPage(hf, hf.header, currentPage);
      if (!chunk) return null;
      return { margin: [marginLeftPt, marginTopPt * 0.5, marginRightPt, 0], stack: resolvePageNumberPlaceholders(chunk, currentPage, pageCount) };
    };
  }

  function pageFooterFor(hf, content) {
    const footnoteByPage = content._footnoteByPage || {};
    return (currentPage, pageCount) => {
      const chunk = hf.enabled ? chunkForPage(hf, hf.footer, currentPage) : null;
      const stackParts = (chunk ? resolvePageNumberPlaceholders(chunk, currentPage, pageCount) : []).concat(footnoteBandFor(footnoteByPage[currentPage]));
      if (!stackParts.length) return null;
      return { margin: [marginLeftPt, 0, marginRightPt, marginBottomPt * 0.5], stack: stackParts };
    };
  }

  // Le trait et les notes d'une page, au pied de page.
  function footnoteBandFor(notes) {
    if (!notes || !notes.length) return [];
    const rule = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 0.5, lineColor: '#999999' }], margin: [0, 2, 0, 2] };
    return [rule].concat(notes.map(fn => ({ text: [{ text: fn.number + '. ', bold: true, fontSize: 8 }, glyphText(fn.text, { fontSize: 8 })], margin: [0, 0, 0, 1] })));
  }

  // Convertit une image en calque en `absolutePosition` pdfmake, interpolée entre les blocs-ancre au-dessus/en-dessous (repli sur une seule ancre, ou
  // local si aucune résolue). `layer` choisit l'ancre de référence pour Y sur pages différentes - même ordre que la relocation : "devant" préfère le
  // dessous.
  function resolveImageAbsolutePosition(a, topMarginPt, bottomMarginPt, layer) {
    const effectiveTopMarginPt = topMarginPt != null ? topMarginPt : marginTopPt;
    const effectiveBottomMarginPt = bottomMarginPt != null ? bottomMarginPt : marginBottomPt;
    const xPt = anchoredXPt(a, layer);
    let yPt = anchoredYPt(a, layer, effectiveTopMarginPt);
    // Filet de sécurité : une extrapolation sur une seule ancre, ou une ancre mal choisie (bracketing par proximité de pixels, cf.
    // resolvePendingImageAnchors : plus proche dans l'aperçu continu hors écran, mais paginée sur une autre page que l'image), peut faire dépasser
    // `yPt` de la page : image invisible.
    const imgHeightPt = Number.isFinite(a.imgHeightPx) ? Math.max(0, a.imgHeightPx) * PX_TO_PT : 0;
    const maxYPt = pageHeightPt - effectiveBottomMarginPt - imgHeightPt;
    yPt = Math.min(Math.max(yPt, effectiveTopMarginPt), Math.max(effectiveTopMarginPt, maxYPt));
    return { x: xPt, y: yPt };
  }

  // X suit la même structure que Y (anchoredYPt) : container prioritaire, puis interpolation entre l'ancre du dessus et celle du dessous, puis une seule
  // ancre, puis page-relatif générique. Une image ancrée « au-dessus » ou « en dessous » reçoit un imgLeftPx déjà converti au référentiel de la colonne
  // ou de la case (twoColumnsFrom, attributeNestedPendingImages), que le repli page-relatif réinterpréterait à tort (X hors page).
  function anchoredXPt(a, layer) {
    if (a.containerLeftPx != null && a.containerLeft != null) return a.containerLeft + (a.imgLeftPx - a.containerLeftPx) * PX_TO_PT;
    if (a.aboveLeft != null && a.belowLeft != null && a.abovePage === a.belowPage && a.belowLeftPx !== a.aboveLeftPx) {
      return a.aboveLeft + ((a.imgLeftPx - a.aboveLeftPx) / (a.belowLeftPx - a.aboveLeftPx)) * (a.belowLeft - a.aboveLeft);
    }
    const fromAnchor = fromOneAnchorPt(layer, [a.aboveLeft, a.aboveLeftPx], [a.belowLeft, a.belowLeftPx], a.imgLeftPx, false);
    return fromAnchor != null ? fromAnchor : marginLeftPt + a.imgLeftPx * PX_TO_PT;
  }

  function anchoredYPt(a, layer, topMarginPt) {
    // Référence locale, prioritaire sur le bracketing générique : plus précise, fondée sur le début du paragraphe qui héberge l'image plutôt que sur
    // une extrapolation depuis un bloc éloigné.
    if (a.containerTop != null) return a.containerTop + (a.imgTopPx - a.containerTopPx) * PX_TO_PT;
    if (a.aboveTop != null && a.belowTop != null && a.abovePage === a.belowPage && a.belowTopPx !== a.aboveTopPx) {
      return a.aboveTop + ((a.imgTopPx - a.aboveTopPx) / (a.belowTopPx - a.aboveTopPx)) * (a.belowTop - a.aboveTop);
    }
    // Au-dessus/en-dessous existent mais sur des pages différentes : le delta en px traverserait la coupure, mélangeant deux pages dont pdfmake
    // réinitialise l'origine Y (image projetée hors-page). Repli sans extrapolation (delta 0).
    const crossesPage = a.aboveTop != null && a.belowTop != null && a.abovePage !== a.belowPage;
    const fromAnchor = fromOneAnchorPt(layer, [a.aboveTop, a.aboveTopPx], [a.belowTop, a.belowTopPx], a.imgTopPx, crossesPage);
    return fromAnchor != null ? fromAnchor : topMarginPt + a.imgTopPx * PX_TO_PT;
  }

  // La position depuis une seule ancre (`[pt, px]`) : celle du dessous pour « devant », celle du dessus pour le reste (même ordre que la relocation),
  // l'autre à défaut ; `null` s'il n'y en a aucune. `flat` : sans extrapolation (delta 0).
  function fromOneAnchorPt(layer, above, below, imgPx, flat) {
    const anchor = (layer === 'front' ? [below, above] : [above, below]).find(([pt]) => pt != null);
    return anchor ? anchor[0] + (flat ? 0 : (imgPx - anchor[1]) * PX_TO_PT) : null;
  }

  // S'il y a un sommaire et/ou des images en calque en attente, une 1ère passe de mesure (.getBuffer(), jamais montrée) donne les vraies
  // page/position des blocs-ancre : le contenu est reconstruit (numéros de page dans le sommaire ; images relocalisées à côté de leur ancre - pdfmake
  // peint sur la page courante).
  async function resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks) {
    // Hauteur utile d'une page pour tableFrom (lignes de tableau gardées entières) : la bande des notes est déduite par prudence, qu'il y ait des
    // notes ou non.
    tablePageHeightPt = pageHeightPt - marginTopPt - marginBottomPt - ((headerFooterChunks && headerFooterChunks.topExtraPt) || 0) - ((headerFooterChunks && headerFooterChunks.bottomExtraPt) || 0) - FOOTNOTE_BAND_PT;
    // Images habillées qui ne tiennent pas dans ce qui reste de leur page : leur ancre (et son image) passe en haut de la page suivante (rang parmi
    // les ancres, dans l'ordre du document), cf. settleFloatBreaks.
    const floatBreaks = new Set();
    const buildContent = async () => {
      const built = await htmlToPdfContent(inlinedHtml, true);
      floatAnchorsOf(built).forEach((anchor, i) => { const target = floatMovesWith(anchor); if (target && floatBreaks.has(i)) target.pageBreak = 'before'; });
      return built;
    };
    stretchExtra = new Map();
    stretching = true;
    let content = await buildContent();
    // Mise en page par pdfmake du contenu courant, sans rien en garder que ce qu'il pose sur les blocs (positions, largeurs mesurées).
    const measure = toMeasure => new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(toMeasure, filename, headerFooterChunks)).getBuffer(() => resolve()); });
    // Les lignes justifiées posées à la main sont étirées sur une largeur estimée dans le navigateur : une première mise en page en mesure l'écart,
    // la seconde l'annule (learnStretchedLines).
    if ((content._stretchedBlocks || []).length) {
      await measure(content);
      learnStretchedLines(content._stretchedBlocks);
      content = await buildContent();
    }
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    // Images habillées (floatParagraphBlocksFrom) : le bloc de texte qui porte chacune, dans l'ordre du document. Leur page et leur hauteur viennent
    // de la passe de mesure.
    const hasFloatOverlays = floatAnchorsOf(content).length > 0;
    if (hasFootnotes || hasFloatOverlays || (content._tocBlocks || []).length > 0 || (content._pendingImages || []).length > 0) {
      // Marges de cette passe : identiques à celles de la passe réelle, pour que la pagination mesurée ici corresponde exactement au document final.
      const { topMarginPt, bottomMarginPt } = pageMarginsPt(headerFooterChunks, hasFootnotes);
      content = await relocateMeasured(content, { buildContent, measure, floatBreaks, hasFloatOverlays, topMarginPt, bottomMarginPt });
    }
    // Filet de sécurité résiduel : une image dont ni bracket ni container n'a pu être résolu garderait sinon son absolutePosition placeholder (0,0)
    // indéfiniment, coincée au coin de la page. Repli : aucune position absolue, rendue en flux normal - pas au pixel près, mais visible au bon
    // endroit.
    stripUnresolvedPendingImages(content);
    return content;
  }

  // La passe de mesure : pdfmake met `content` en page (jamais montrée), le contenu est reconstruit puis reçoit ce que la mesure a appris : page des
  // titres et des notes, images à côté de leur ancre.
  async function relocateMeasured(content, pass) {
    const { buildContent, measure, hasFloatOverlays, topMarginPt, bottomMarginPt } = pass;
    await measure(content);
    if (hasFloatOverlays) content = await settleFloatBreaks(content, pass);
    const measured = measuredLayoutOf(content);
    content = await buildContent();
    placeMeasured(content, measured, topMarginPt, bottomMarginPt);
    return content;
  }

  // Une image habillée qui ne tient pas dans ce qui reste de sa page (elle serait coupée par le bord, ou le texte à côté d'elle passerait à la page
  // suivante sans elle) : son ancre ouvre la page suivante, avec elle. Ce qui précède reste en place, ce qui suit se range à côté d'elle comme avant.
  // Déplacer une ancre change la pagination de ce qui la suit : on mesure de nouveau (au plus quelques fois), jusqu'à ce que toutes tiennent ou ouvrent
  // déjà leur page. Rend le dernier contenu mesuré.
  async function settleFloatBreaks(content, pass) {
    const { buildContent, measure, floatBreaks, topMarginPt, bottomMarginPt } = pass;
    for (let round = 0; round < 4; round += 1) {
      const moving = floatAnchorsPastPageBottom(content, floatBreaks, topMarginPt, bottomMarginPt);
      if (!moving.length) break;
      moving.forEach(i => floatBreaks.add(i));
      content = await buildContent();
      await measure(content);
    }
    return content;
  }

  // Le rang des ancres d'images habillées que leur image fait déborder de la page, et qui n'ont pas déjà été remontées.
  function floatAnchorsPastPageBottom(content, floatBreaks, topMarginPt, bottomMarginPt) {
    const pageBottomPt = pageHeightPt - bottomMarginPt;
    const moving = [];
    floatAnchorsOf(content).forEach((anchor, i) => {
      const pos = firstPosition(anchor);
      // Dans une case ou une colonne, l'image suit son conteneur (qui ne se coupe pas d'une page à l'autre pour elle) ; un encadré, lui, passe à la page
      // suivante avec elle.
      const target = floatMovesWith(anchor);
      if (!pos || floatBreaks.has(i) || !target) return;
      const topPt = pos.top + anchor._floatOverlay.dyPt;
      const targetPos = firstPosition(target);
      if (targetPos && targetPos.top > topMarginPt + 1 && topPt + anchor._floatOverlay.reachPt > pageBottomPt + 0.5) moving.push(i);
    });
    return moving;
  }

  // La position de la première ligne d'un bloc mesuré. Un bloc composite (columns, par exemple) peut porter une entrée de remesure pdfmake à
  // {left:0, top:0}, à une position non déterministe : on l'écarte. Un bloc texte multi-lignes porte une entrée par ligne enchaînée ; above, below et
  // container sont tous mesurés côté éditeur par le haut du bloc (xxxTopPx), leur pendant PDF est donc sa première ligne, pas la dernière, sinon le
  // delta image-ancre compterait la hauteur du bloc en trop.
  function firstPosition(block) {
    if (!block || !block.positions || !block.positions.length) return null;
    const real = block.positions.filter(p => !(p.left === 0 && p.top === 0));
    return (real.length ? real : block.positions)[0];
  }

  const pageNumberOf = block => (block.positions && block.positions[0] && block.positions[0].pageNumber) || null;

  // Ce que la mesure apprend du contenu : la page de chaque titre et de chaque note (le numéro de chaque note est déjà définitif dès la 1ère passe -
  // numérotation continue - seule sa page avait besoin d'être mesurée), la page de chaque bloc de premier niveau, la position des images habillées et
  // les ancres des images en attente. À lire avant de reconstruire : `positions` devient obsolète dès que htmlToPdfContent recrée des objets neufs.
  function measuredLayoutOf(content) {
    // `blockPageNumbers` : la page (pdfmake, à partir de 1) de chaque bloc de premier niveau, dans l'ordre de `content` ; ne sert qu'à retrouver un bloc
    // quelconque de la page N, pour y insérer une image à position de page à côté (ordre de peinture devant ou derrière), jamais à calculer sa position
    // (déjà connue, cf. _pageGrid). Les images en attente en sont exclues (placeholder {x:0, y:0}, position pas encore significative) : sinon une image
    // pourrait être choisie comme sa propre ancre, retirée de `content` puis jamais réinsérée (indexOf introuvable), et disparaître du PDF.
    const pendingImageObjs = new Set((content._pendingImages || []).map(p => p.image));
    return {
      headingPageNumbers: (content._headingBlocks || []).map(b => pageNumberOf(b._headingLeaf || b)),
      footnotePageNumbers: (content._footnoteBlocks || []).map(fb => pageNumberOf(fb.block)),
      resolvedAnchors: (content._pendingImages || []).map(resolvedAnchorOf),
      blockPageNumbers: content.map(b => { if (pendingImageObjs.has(b)) return null; const pos = firstPosition(b); return pos ? pos.pageNumber : null; }),
      floatPositions: floatAnchorsOf(content).map(firstPosition),
    };
  }

  // Les voisins mesurés d'une image en attente : la position et la page du bloc au-dessus, de celui en dessous et du paragraphe hôte (pt), avec leurs
  // pendants mesurés dans l'éditeur (px), pour resolveImageAbsolutePosition.
  function resolvedAnchorOf(p) {
    const aboveResolved = firstPosition(p.above);
    const belowResolved = firstPosition(p.below);
    const containerResolved = firstPosition(p.container);
    return {
      aboveTop: aboveResolved ? aboveResolved.top : null, abovePage: aboveResolved ? aboveResolved.pageNumber : null,
      belowTop: belowResolved ? belowResolved.top : null, belowPage: belowResolved ? belowResolved.pageNumber : null,
      // aboveLeft et belowLeft (comme aboveTop et belowTop) donnent à resolveImageAbsolutePosition un X pour une image ancrée « au-dessus » ou
      // « en dessous » dans une colonne ou une cellule (cf. anchoredXPt).
      aboveLeft: aboveResolved ? aboveResolved.left : null, belowLeft: belowResolved ? belowResolved.left : null,
      containerTop: containerResolved ? containerResolved.top : null, containerTopPx: p.containerTopPx,
      // Seules les images imbriquées dans une cellule posent containerLeft et containerLeftPx (cf. attributeNestedPendingImages) : ils pilotent le X
      // relatif à la cellule dans resolveImageAbsolutePosition.
      containerLeft: containerResolved ? containerResolved.left : null, containerLeftPx: p.containerLeftPx,
      hadAbove: !!p.above, hadBelow: !!p.below,
      imgTopPx: p.imgTopPx, imgLeftPx: p.imgLeftPx, imgHeightPx: p.imgHeightPx,
      aboveTopPx: p.aboveTopPx, belowTopPx: p.belowTopPx, aboveLeftPx: p.aboveLeftPx, belowLeftPx: p.belowLeftPx,
    };
  }

  const pushByPage = (byPage, page, item) => { (byPage[page] = byPage[page] || []).push(item); };

  // Place dans le contenu reconstruit ce que la mesure a appris : numéros de page du sommaire, notes au pied de leur page, images habillées et images
  // en calque à leur place.
  function placeMeasured(content, measured, topMarginPt, bottomMarginPt) {
    const { headingPageNumbers, footnotePageNumbers, resolvedAnchors, blockPageNumbers, floatPositions } = measured;
    // Les blocs d'origine, dans l'ordre de `blockPageNumbers` : chaque image insérée plus bas décale les indices de `content`, et un indice relu après
    // coup désignerait un autre bloc (une image de la page 2 serait ancrée en page 1).
    const originalBlocks = content.slice();
    const slotStartPages = slotStartPagesOf(content, blockPageNumbers);
    fillTocPageNumbers(content, headingPageNumbers);
    content._footnoteByPage = footnotesByPage(content, footnotePageNumbers);
    const behindByPage = {};
    content._backgroundByPage = behindByPage;
    placeFloatOverlays(content, floatPositions, behindByPage);
    // « Sur toutes les pages » (js/page-layer.js) : les images répétées, chacune avec les pages (1-based) de son courrier ; buildNativeDocDefinition les
    // peint en fond de chacune.
    const repeatedLayer = [];
    content._repeatedLayer = repeatedLayer;
    const ctx = { content, originalBlocks, blockPageNumbers, slotStartPages, slotPageRange: slotPageRangeFn(slotStartPages), behindByPage, repeatedLayer, topMarginPt, bottomMarginPt };
    (content._pendingImages || []).forEach((p, i) => placePendingImage(ctx, p, resolvedAnchors[i]));
  }

  // Macro-modèle : page (0 pour le premier slot) où commence chaque slot, celle de son premier bloc mesurable (le premier bloc peut être une image en
  // attente, sans page). Lue avant que les images ne soient insérées dans `content` : les indices de `_slotStarts` sont ceux de la liste d'origine.
  function slotStartPagesOf(content, blockPageNumbers) {
    const slotStartPages = {};
    Object.keys(content._slotStarts || {}).forEach(slot => {
      for (let j = content._slotStarts[slot]; j < blockPageNumbers.length; j++) {
        if (blockPageNumbers[j] != null) { slotStartPages[slot] = blockPageNumbers[j] - 1; break; }
      }
    });
    return slotStartPages;
  }

  function fillTocPageNumbers(content, headingPageNumbers) {
    (content._tocBlocks || []).forEach(tocBlock => {
      (tocBlock._pageNumberCells || []).forEach((cell, i) => { if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]); });
    });
  }

  // Regroupe chaque note par la page réelle de son appel (mesurée) - consommé par le callback doc.footer natif de pdfmake pour placer le texte au pied
  // de la bonne page.
  function footnotesByPage(content, footnotePageNumbers) {
    const byPage = {};
    (content._footnoteBlocks || []).forEach((fb, i) => {
      const pageNum = footnotePageNumbers[i];
      if (pageNum != null) pushByPage(byPage, pageNum, { number: fb.number, text: fb.text });
    });
    return byPage;
  }

  // Images habillées : peintes en fond de la page de leur ancre, à la hauteur de sa première ligne (le texte, lui, est déjà décalé à côté, cf.
  // floatParagraphBlocksFrom) ; elles ne sont pas dans le flux, la pagination de cette passe est celle de la passe de mesure. Une ancre que pdfmake n'a
  // pas posée garde son image dans le flux plutôt que de la perdre.
  function placeFloatOverlays(content, floatPositions, behindByPage) {
    floatAnchorsOf(content).forEach((anchor, i) => {
      const { image, align, dyPt, nested, offsetPt } = anchor._floatOverlay;
      delete anchor._floatOverlay;
      const siblings = anchor._floatSiblings || content;
      delete anchor._floatSiblings;
      delete anchor._floatTop;
      const pos = floatPositions[i];
      if (!pos) { siblings.splice(siblings.indexOf(anchor) + 1, 0, image); return; }
      // Dans un conteneur, le bord gauche de l'image est celui de son texte (la position de l'ancre, marge comprise) moins sa marge, plus l'écart que le
      // navigateur a mesuré.
      const x = nested ? pos.left - ((anchor.margin && anchor.margin[0]) || 0) + offsetPt
        : (align === 'right' ? pageWidthPt - marginRightPt - image.width : marginLeftPt);
      image.absolutePosition = { x, y: pos.top + dyPt };
      pushByPage(behindByPage, pos.pageNumber, image);
    });
  }

  // Un macro-modèle assemble ses courriers à la suite : le courrier d'une image répétée est le sien, de sa première page à celle d'avant le courrier
  // suivant (le premier courrier n'a pas de saut de page marqué, son `macroSlot` est nul). Hors macro-modèle (aucun saut marqué) : toutes les pages.
  function slotPageRangeFn(slotStartPages) {
    const slotIds = Object.keys(slotStartPages).sort((a, b) => slotStartPages[a] - slotStartPages[b]);
    return slot => {
      if (!slotIds.length) return { from: 1, to: Infinity };
      if (slot == null || slotStartPages[slot] == null) return { from: 1, to: slotStartPages[slotIds[0]] };
      const next = slotIds[slotIds.indexOf(slot) + 1];
      return { from: slotStartPages[slot] + 1, to: next != null ? slotStartPages[next] : Infinity };
    };
  }

  // Une image en calque à sa place dans le contenu : à position de page (capturée dans l'éditeur), ou ancrée aux blocs voisins mesurés (`anchors`).
  function placePendingImage(ctx, p, anchors) {
    const layer = p.image._pendingLayer;
    const pageGrid = p.image._pageGrid;
    const repeat = !!p.image._repeat;
    delete p.image._pendingImgNode;
    delete p.image._pendingLayer;
    delete p.image._pageGrid;
    delete p.image._repeat;
    if (!pageGrid) { placeByAnchors(ctx, p, anchors, layer); return; }
    // Position connue directement (capturée dans l'éditeur, Aperçu A4) : ni ancrage ni interpolation, rendu identique à l'éditeur. Reste à savoir sur
    // quelle page ce document (peut-être modifié depuis) place ce contenu aujourd'hui : trouvée par blockPageNumbers, jamais en reconstruisant une
    // position depuis un ancrage textuel.
    p.image.absolutePosition = PageLayer.pagePositionPt({ leftPt: pageGrid.pageLeftPt, topPt: pageGrid.pageTopPt }, marginLeftPt, ctx.topMarginPt);
    if (repeat) placeRepeatedImage(ctx, p, pageGrid);
    else placeOnGridPage(ctx, p, layer, pageGrid);
  }

  // Une image répétée : sortie du flux (comme une image à position de page, qui s'évade de son tableau ou de sa colonne), elle ne dépend plus d'aucun
  // bloc, elle est le fond de chaque page de son courrier.
  function placeRepeatedImage(ctx, p, pageGrid) {
    const flowArr = p.parentArray || ctx.content;
    const flowIdx = flowArr.indexOf(p.image);
    if (flowIdx !== -1) flowArr.splice(flowIdx, 1);
    const range = ctx.slotPageRange(pageGrid.macroSlot);
    ctx.repeatedLayer.push({ image: p.image, fromPage: range.from, toPage: range.to });
  }

  const indexesWhere = (list, test) => list.reduce((acc, item, j) => { if (test(item)) acc.push(j); return acc; }, []);

  // Une image à position de page, posée sur la page que ce document donne aujourd'hui à son contenu.
  function placeOnGridPage(ctx, p, layer, pageGrid) {
    const { content, originalBlocks, blockPageNumbers, behindByPage } = ctx;
    const targetPage = pageGrid.pageIndex + 1 + (ctx.slotStartPages[pageGrid.macroSlot] || 0);
    const candidateIdxs = indexesWhere(blockPageNumbers, pn => pn === targetPage);
    // Page introuvable (document raccourci depuis le dernier positionnement de l'image, par exemple) : repli sur la dernière page connue plutôt que de
    // laisser l'image sur son tableau ou sa colonne d'origine, qui peut ne plus exister au même endroit après une réédition.
    const fallbackIdxs = candidateIdxs.length ? candidateIdxs : indexesWhere(blockPageNumbers, pn => pn != null);
    if (!fallbackIdxs.length) return;
    // « Devant » se peint après tout le reste de sa page (il recouvre), « derrière » avant (il est recouvert) : même intention que l'ancrage aux blocs
    // voisins, réduite à « en dernier » ou « en premier sur la page » faute de bloc-ancre précis.
    const anchorBlock = originalBlocks[layer === 'front' ? fallbackIdxs[fallbackIdxs.length - 1] : fallbackIdxs[0]];
    // Toujours au niveau racine (jamais p.parentArray) : une image à position de page est indépendante de son tableau ou de sa colonne d'origine, elle
    // s'en évade vers le contenu de premier niveau sans changement visuel (absolutePosition ignore la profondeur d'imbrication). Retirée de son
    // tableau d'origine (souvent imbriqué) avant d'être insérée dans `content`, jamais les deux à la fois (elle serait dupliquée dans le PDF).
    const sourceArr = p.parentArray || content;
    const sourceIdx = sourceArr.indexOf(p.image);
    if (sourceIdx !== -1) sourceArr.splice(sourceIdx, 1);
    // Page réellement retenue : la page visée, ou la dernière connue quand elle n'existe plus.
    const placedPage = candidateIdxs.length ? targetPage : blockPageNumbers[fallbackIdxs[fallbackIdxs.length - 1]];
    // pdfmake pose une image à position absolue sur la page où il en est de son contenu : « derrière » est insérée avant le premier bloc de sa page, ce
    // qui, dès la 2e page, la fait tomber sur la page précédente (le saut de page n'a lieu qu'avec ce bloc). Le fond de page (`background`, appelé page
    // par page et peint avant le texte, ce que « derrière » veut dire) la met sur la bonne page : buildNativeDocDefinition le lit dans
    // _backgroundByPage.
    if (layer !== 'front' && placedPage > 1) { pushByPage(behindByPage, placedPage, p.image); return; }
    const anchorIdx = content.indexOf(anchorBlock);
    if (anchorIdx === -1) return;
    content.splice(layer === 'front' ? anchorIdx + 1 : anchorIdx, 0, p.image);
  }

  // Une image en calque ancrée aux blocs mesurés qui l'encadrent. pdfmake peint content[] dans l'ordre (une entrée plus tardive recouvre les
  // précédentes) : "devant" finit aussi tard que possible (ancré sur le bloc du dessous, inséré après) pour recouvrir le texte proche ; "derrière"
  // l'inverse (ancré au-dessus, inséré avant).
  function placeByAnchors(ctx, p, a, layer) {
    const { content, behindByPage } = ctx;
    p.image.absolutePosition = resolveImageAbsolutePosition(a, ctx.topMarginPt, ctx.bottomMarginPt, layer);
    const anchorBlock = anchorBlockFor(p, a, layer);
    if (!anchorBlock) return;
    const arr = p.parentArray || content;
    const imgIdx = arr.indexOf(p.image);
    if (imgIdx === -1) return;
    // « Derrière », au niveau racine, ancrée à un bloc de la 2e page ou d'une suivante : insérée avant ce bloc, elle tombe sur la page précédente quand
    // c'est le premier de sa page (même défaut que l'image à position de page, même remède : le fond de sa page).
    if (arr === content && layer !== 'front' && (anchorBlock === p.above || anchorBlock === p.below)) {
      const behindPage = anchorBlock === p.above ? a.abovePage : a.belowPage;
      if (behindPage > 1) { arr.splice(imgIdx, 1); pushByPage(behindByPage, behindPage, p.image); return; }
    }
    // anchorBlock peut vivre hors de `arr` (ancre de zone) : vérifier sa présence avant de retirer l'image, sinon elle est perdue sans bruit.
    const anchorIdx = arr.indexOf(anchorBlock);
    if (anchorIdx === -1) return;
    arr.splice(imgIdx, 1);
    const shiftedAnchorIdx = anchorIdx > imgIdx ? anchorIdx - 1 : anchorIdx;
    arr.splice(layer === 'front' ? shiftedAnchorIdx + 1 : shiftedAnchorIdx, 0, p.image);
  }

  // Le bloc d'ancrage : celui du dessous pour « devant », celui du dessus pour le reste, l'autre à défaut ; à défaut encore le « container » (paragraphe
  // hôte des images imbriquées dans une cellule, sans bracketing above ni below), même logique devant et derrière : « devant » finit peint après son
  // texte hôte (il recouvre), « derrière » avant (il est recouvert).
  function anchorBlockFor(p, a, layer) {
    const candidates = layer === 'front' ? [[a.belowTop, p.below], [a.aboveTop, p.above]] : [[a.aboveTop, p.above], [a.belowTop, p.below]];
    const hit = candidates.find(([top]) => top != null);
    return (hit && hit[1]) || p.container || null;
  }

  function stripUnresolvedPendingImages(node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(stripUnresolvedPendingImages); return; }
    if (typeof node !== 'object') return;
    if (node._pendingImgNode) {
      delete node._pendingImgNode;
      delete node._pendingLayer;
      delete node.absolutePosition;
    }
    if (node.stack) stripUnresolvedPendingImages(node.stack);
    if (node.columns) stripUnresolvedPendingImages(node.columns);
    if (node.table && node.table.body) stripUnresolvedPendingImages(node.table.body);
  }

  // Clone-et-parcours remplaçant chaque run marqué `_pendingPageNumber` par son texte résolu - appelé à chaque invocation du callback header/footer
  // natif. currentPage/pageCount sont déjà connus à ce stade, contrairement au sommaire/images en calque : pas besoin d'une 2e passe de mesure.
  function resolvePageNumberPlaceholders(node, currentPage, pageCount) {
    if (Array.isArray(node)) return node.map(n => resolvePageNumberPlaceholders(n, currentPage, pageCount));
    if (!node || typeof node !== 'object') return node;
    const out = Object.assign({}, node);
    if (out._pendingPageNumber) {
      out.text = PageLayout.pageNumberText(out._pendingPageNumber.format, currentPage, pageCount);
      delete out._pendingPageNumber;
    } else if (Array.isArray(out.text)) {
      out.text = out.text.map(t => resolvePageNumberPlaceholders(t, currentPage, pageCount));
    }
    if (out.columns) out.columns = resolvePageNumberPlaceholders(out.columns, currentPage, pageCount);
    if (out.stack) out.stack = resolvePageNumberPlaceholders(out.stack, currentPage, pageCount);
    return out;
  }

  // Convertit les 4 fragments d'en-tête/pied (déjà résolus) en contenu pdfmake une seule fois - réutilisé par les 2 appels de
  // buildNativeDocDefinition (mesure jetable + réelle) pour une pagination identique. Marge fixe (PageLayout.HEADER_FOOTER_ZONE_PX, le plafond de
  // l'éditeur), pas la hauteur rendue.
  const HF_MAX_ZONE_HEIGHT_PT = PageLayout.HEADER_FOOTER_ZONE_PX * PX_TO_PT;
  async function buildHeaderFooterPdfChunks(headerFooterData) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    if (!headerFooterData || !headerFooterData.enabled) return empty;
    async function resolveZone(html) {
      if (!PageLayout.hasZoneContent(html)) return { content: null, heightPt: 0 };
      // Une image d'en-tête ou de pied dont le src est une URL externe doit passer par inlineEditorImagesAsDataUri, comme celles du corps : pdfmake
      // n'imprime que des data URI.
      html = await inlineEditorImagesAsDataUri(html);
      const content = await htmlToPdfContent(html, false, CONTENT_WIDTH_PT);
      // Filet de sécurité : une image en calque n'a pas de résolution de position dans un en-tête/pied (pas de passe de mesure dédiée) - l'UI
      // verrouille déjà cette option en édition, mais un gabarit existant pourrait quand même en contenir une. Repli en flux normal.
      stripUnresolvedPendingImages(content);
      const measureRoot = document.createElement('div');
      measureRoot.innerHTML = html;
      insertTrailingBreaksForEmptyBlocks(measureRoot);
      const detach = attachPdfMeasureHost(measureRoot, CONTENT_WIDTH_PX);
      // measureRoot est un arbre DOM séparé du root de htmlToPdfContent ci-dessus (reparsing indépendant) : son propre décodage d'image doit être
      // attendu séparément, sinon une image mesure une hauteur proche de 0 et la marge réservée devient plus petite que ce que pdfmake peint
      // réellement.
      await Promise.all(Array.from(measureRoot.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      const heightPt = measureRoot.getBoundingClientRect().height * PX_TO_PT;
      detach();
      return { content, heightPt };
    }
    const differentFirstPage = !!headerFooterData.differentFirstPage;
    const emptyZone = { content: null, heightPt: 0 };
    // Les quatre zones sont indépendantes (chacune a son hôte de mesure hors écran, cf. resolveZone) : contrairement à twoColumnsFrom, aucun état de
    // module partagé comme footnoteCounter (les notes de bas de page ne sont jamais résolues en en-tête ou pied), donc rien n'impose le séquentiel.
    const [headerDefault, headerFirst, footerDefault, footerFirst] = await Promise.all([
      resolveZone(headerFooterData.header && headerFooterData.header.default),
      differentFirstPage ? resolveZone(headerFooterData.header && headerFooterData.header.first) : Promise.resolve(emptyZone),
      resolveZone(headerFooterData.footer && headerFooterData.footer.default),
      differentFirstPage ? resolveZone(headerFooterData.footer && headerFooterData.footer.first) : Promise.resolve(emptyZone),
    ]);
    // Une seule hauteur de marge par zone : la marge de page ne peut pas varier d'une page à l'autre chez pdfmake, donc "page 1 différente" ne change
    // que le contenu - le plus grand des deux fragments dimensionne la marge des deux variantes.
    const headerHeightPt = (headerDefault.content || headerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    const footerHeightPt = (footerDefault.content || footerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    return {
      enabled: true,
      differentFirstPage,
      header: { default: headerDefault.content, first: headerFirst.content },
      footer: { default: footerDefault.content, first: footerFirst.content },
      topExtraPt: headerHeightPt ? headerHeightPt + PageLayout.HEADER_FOOTER_GAP_PT : 0,
      bottomExtraPt: footerHeightPt ? footerHeightPt + PageLayout.HEADER_FOOTER_GAP_PT : 0,
    };
  }

  async function buildNativePdfDocDefinition(resolvedHtml, filename, headerFooterData) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    // Attend que Roboto (police de mesure) soit réellement chargée avant toute mesure : un export lancé tôt mesurerait sur une police de repli aux
    // métriques différentes, assez pour faire basculer une ligne d'un côté ou l'autre d'une frontière fine (habillage autour d'une image).
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* repli silencieux */ } }
    const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml);
    // Repli : export sans en-tête/pied plutôt que d'échouer entièrement si leur contenu (potentiellement modifié en dehors de l'éditeur) est dans un
    // état inattendu.
    let headerFooterChunks;
    try { headerFooterChunks = await buildHeaderFooterPdfChunks(headerFooterData); }
    catch (e) {
      console.warn('[PdfExport] en-tête/pied de page ignorés (structure inattendue) :', e);
      headerFooterChunks = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    }
    let content;
    try { content = await resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks); } finally { stretching = false; }
    return buildNativeDocDefinition(content, filename, headerFooterChunks);
  }

  // Ce que l'export d'une ligne lit avant d'écrire : la fenêtre des images externes (js/external-images.js : une image d'un autre site est
  // téléchargée pour ce PDF, la fenêtre la liste et peut tout arrêter ; dans un lot, un site déjà accepté n'est pas redemandé et un refus arrête tout
  // le lot, cf. ExternalImages.beginRun), les marges et les bibliothèques, puis le HTML, le nom du fichier et l'en-tête et le pied résolus pour la
  // ligne.
  async function prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsPt(marginsPt);
    await ensurePdfLibsLoaded();
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    return { docDefinition: await buildNativePdfDocDefinition(resolvedHtml, filename, resolvedHeaderFooterData), filename };
  }

  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    const { docDefinition, filename } = await prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt);
    window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf');
  }

  // Export PDF en lot (une ligne Grist -> un blob PDF, cf. js/main.js onExportBatch).
  async function getNativePdfBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    const { docDefinition, filename } = await prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt);
    const blob = await new Promise((resolve, reject) => {
      try { window.pdfMake.createPdf(docDefinition).getBlob(resolve); } catch (e) { reject(e); }
    });
    return { blob, filename };
  }

  return { exportCurrentRecord, getNativePdfBlobForRecord, ensurePdfLibsLoaded };
})();
