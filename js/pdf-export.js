// Export PDF vectoriel (pdfmake). Les qualités raster (html2pdf.js : « Basse qualité », « Ultra HD ») sont retirées de l'interface comme du code (jsPDF et DOMPurify
// périmés) ; leur code reste dans l'historique git (js/pdf-export-alt.js). L'impression navigateur est revenue autrement : js/print-export.js. « Léger » est ce même PDF
// vectoriel dont les images sont ramenées à 150 ppi (ImageIo.lighten) : le texte, les traits et la page ne changent pas.
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
  // Les paragraphes que le PDF garde d'une pièce (markWhole) : ceux de la construction en cours, colonnes de zone comprises, retenus en fin de construction
  // (settleWholeBlocks). Remis à zéro avec les notes, à l'appel de premier niveau.
  let wholeCandidates = [];
  // Les destinations nommées des titres (headingDestination), numérotées de bout en bout du document pour qu'aucun nom ne serve deux fois (pdfmake refuse
  // deux `id` égaux) : remises à zéro à l'appel de premier niveau, comme les notes.
  let headingDestinationCount = 0;
  // Les signets du document (js/anchors.js) : adresse -> paragraphe ou titre de premier niveau qui la porte, relevés avant la construction (un lien qui y mène peut
  // précéder sa cible). Remis à zéro à l'appel de premier niveau, comme les notes ; vide, le PDF ne porte ni destination ni lien de signet.
  let anchorElements = new Map();
  let stretchExtra = new Map();
  let stretching = false; // vrai le temps de resolveNativePdfContent, la seule à mesurer puis corriger les lignes étirées
  // Bande fixe réservée en pied de page pour ~4 lignes de note à 8 pt plus le filet séparateur (pdfmake ne permet pas de bande dynamique par page) ;
  // une pile de notes très longues sur une page peut la déborder (limite assumée).
  const FOOTNOTE_BAND_PT = 4 * 8 * 1.15 + 8;
  // Hauteur utile d'une page (pt), marges, bandes d'en-tête et de pied et bande des notes déduites : posée une fois par passage dans
  // resolveNativePdfContent, lue par tableFrom pour savoir si les lignes d'un tableau tiennent dans une page. 0 tant qu'elle n'est pas posée : aucun
  // tableau n'est alors gardé en lignes entières.
  let tablePageHeightPt = 0;
  // Le modèle que l'export en cours rend est une grille (js/grid-editor.js : son tableau est toute la feuille, sans page ni suite de texte) et non
  // un document. Posé par prepareRecord à chaque export ; les tableaux d'un document (macro-modèle compris) ne sont jamais ceux d'une grille, même
  // quand ils portent les mêmes réglages.
  let exportsGridModel = false;
  // Les points par pouce où l'export en cours ramène ses images (qualité « Léger », ImageIo.lighten) ; 0 : les images sont reprises telles quelles, comme
  // toujours. Posé par prepareRecord à chaque export, avec le genre du modèle.
  let lightImagePpi = 0;
  const LIGHT_IMAGE_PPI = 150;
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
  // Ce que l'en-tête, le pied et les marges prennent en plus de la hauteur d'une page (pt), posé par resolveNativePdfContent ; null tant qu'il ne l'est pas.
  // Une section de sens différent (applyPageOrientation) en tire sa propre hauteur utile de page de tableau.
  let tableExtrasPt = null;
  // Le sens et le format du document tels que ses marges le disent (setPageMarginsPt) : ceux de la page quand aucun repère de départ ne dit mieux (js/page-sections.js), et le format de
  // toute page qui n'en dit pas d'autre.
  let documentOrientation = 'portrait';
  let documentFormat = 'A4';

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
    pageFormat = documentFormat = PageLayout.normalizeFormat(m.format);
    pageWatermark = PageLayout.normalizeWatermark(m.watermark);
    A4_PREVIEW_PADDING_TOP_PX = marginTopPt / PX_TO_PT;
    A4_PREVIEW_PADDING_LEFT_PX = marginLeftPt / PX_TO_PT;
    tableExtrasPt = null;
    documentOrientation = m.orientation === 'landscape' ? 'landscape' : 'portrait';
    applyPageOrientation(documentOrientation);
  }

  // Le sens de la page et tout ce qui en dérive : ses dimensions, la largeur utile du texte (pt et px) et la hauteur utile d'une page de tableau. Réglé pour
  // le document par setPageMarginsPt, puis par chaque section d'un macro-modèle dont les modèles n'ont pas tous la même page (js/page-sections.js,
  // visitSection, applyPage) : les marges ne changent jamais, seuls le sens et le format tournent. Tout ce que le PDF mesure ensuite lit ces variables de module,
  // dans la largeur de la page où le bloc tombe.
  function applyPageOrientation(orientation) {
    pageOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const page = PageLayout.pageSizePtFor(pageOrientation, pageFormat);
    pageWidthPt = page.width; pageHeightPt = page.height;
    CONTENT_WIDTH_PT = pageWidthPt - marginLeftPt - marginRightPt;
    CONTENT_WIDTH_PX = CONTENT_WIDTH_PT / PX_TO_PT;
    if (tableExtrasPt != null) tablePageHeightPt = pageHeightPt - marginTopPt - marginBottomPt - tableExtrasPt - FOOTNOTE_BAND_PT;
  }
  // Une page de section, `{ orientation, format }` (le format d'un repère de page, js/page-sections.js : nul, celui du document) : son sens et son format, et tout ce qui en dérive.
  function applyPage(page) {
    pageFormat = page && page.format ? PageLayout.normalizeFormat(page.format) : documentFormat;
    applyPageOrientation(page && page.orientation);
  }
  // La page courante, telle qu'applyPage la prend et que les suites de pages de même format (runsOf) la gardent : le sens et le format du module.
  const modulePage = () => ({ orientation: pageOrientation, format: pageFormat });
  // Une page pour la table des variantes d'en-tête et de pied : son sens et son format (nul : celui du document) en un mot.
  const pageKey = (orientation, format) => orientation + '|' + (format ? PageLayout.normalizeFormat(format) : documentFormat);

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

  // Le style des balises qui en posent un : titre, gras, italique, soulignement, barré, exposant, indice, lien, code et légende.
  function applyTagStyle(out, node, tag) {
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.fontSize = HEADING_SIZES[tag]; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') addDecoration(out, 'underline');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') addDecoration(out, 'lineThrough');
    // Exposant et indice (js/script-marks.js) : pdfmake lève (`sup`) ou baisse (`sub`) le texte sans le réduire, la taille se règle ici - 6/10 de celle
    // du texte qui porte la marque, comme le CSS de l'éditeur.
    const script = ScriptMarks.kindOf(node);
    if (script) {
      out.fontSize = (out.fontSize || DEFAULT_FONT_SIZE) * ScriptMarks.SIZE_RATIO;
      delete out.sup; delete out.sub;
      out[script === ScriptMarks.SUPERSCRIPT ? 'sup' : 'sub'] = true;
    }
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
    // Lien vers un signet du document : le clic mène à la destination nommée de son bloc (anchorDestination). Un lien dont le signet n'existe plus (ou n'a aucun
    // texte où se poser) reste du texte, comme dans le HTML et le Markdown.
    const anchorId = tag === 'A' && !linkHref ? HtmlSanitize.internalAnchorId(node.getAttribute('href')) : null;
    if (anchorId && anchorElements.has(anchorId)) {
      out.linkToDestination = ANCHOR_DESTINATION_ID + anchorId;
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
    // La sorte de soulignement (js/character-format.js) : pdfmake la dessine pour la ligne du run.
    const line = CharacterFormat.normalizedLine(css('text-decoration-style'));
    if (line) out.decorationStyle = line;
    if (css('font-size')) out.fontSize = cssSize(css('font-size'), DEFAULT_FONT_SIZE);
    const pdfFont = pdfFontFor(css('font-family'));
    if (pdfFont) out.font = pdfFont;
    if (css('color')) out.color = cssColorToHex(css('color'));
    if (css('background-color')) out.background = cssColorToHex(css('background-color'));
    // Espacement des caractères et petites capitales (js/character-format.js) : `characterSpacing` de pdfmake est en points ; les petites capitales sont dessinées (`textRuns`).
    if (css('letter-spacing')) {
      const spacing = CharacterFormat.spacingPt(css('letter-spacing'));
      if (spacing) out.characterSpacing = spacing; else delete out.characterSpacing;
    }
    const variant = css('font-variant') || css('font-variant-caps');
    if (variant) {
      if (CharacterFormat.smallCapsOf(variant)) out.smallCaps = true; else delete out.smallCaps;
    }
  }

  // Un texte en runs pdfmake : en petites capitales, ses minuscules deviennent des majuscules plus petites (pdfmake n'a pas de petites capitales) ; un caractère que la police n'a pas
  // passe ensuite par PdfGlyphFallback.
  function textRuns(text, style) {
    if (!style.smallCaps) return PdfGlyphFallback.runsFor(text, style);
    const runs = [];
    CharacterFormat.smallCapsPieces(text, style).forEach(piece => runs.push(...PdfGlyphFallback.runsFor(piece.text, piece.style)));
    return runs;
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
  // gérer ici. Il le pose sur le paragraphe, jamais sur le <li> ni sur la citation : l'alignement d'un point de liste est celui de son premier paragraphe
  // (ou de celui de sa zone de texte, dans une liste de tâches), celui d'une citation est celui de son premier paragraphe.
  const ALIGN_PARAGRAPH_OF = { LI: ':scope > p, :scope > div > p', BLOCKQUOTE: ':scope > p' };
  function alignment(node) {
    const own = textAlignOf(node);
    const selector = ALIGN_PARAGRAPH_OF[node.tagName];
    if (own || !selector) return own;
    const paragraph = node.querySelector(selector);
    return paragraph ? textAlignOf(paragraph) : undefined;
  }
  function textAlignOf(node) {
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  // La destination nommée d'un titre : pdfmake inscrit dans le PDF, sous le nom `id`, la place de la première ligne du bloc qui le porte, et un lien
  // `linkToDestination` y mène. Le nom va sur le premier texte du titre (`_headingLeaf` quand le titre est posé en plusieurs blocs), un seul par titre, et un
  // titre qui en a déjà un (garder avec le suivant, légende) garde celui-là. Rend null quand le titre n'a aucun texte (une image seule) : sa ligne du sommaire
  // n'est alors pas un lien, plutôt qu'un lien vers un nom que le PDF n'a pas. Le nom ne se pose que pour un titre que le sommaire cite : sans sommaire le PDF
  // n'en porte aucun (une destination de plus par titre pèse dans un long document).
  const HEADING_DESTINATION_ID = 'pp-h-';
  function headingDestination(headingBlock) {
    const leaf = headingBlock._headingLeaf || headingBlock;
    if (leaf.text === undefined) return null;
    if (!leaf.id) leaf.id = HEADING_DESTINATION_ID + headingDestinationCount++;
    return leaf.id;
  }

  // La destination nommée d'un signet : `pp-a-` et son adresse (js/anchors.js, unique dans le document), posée sur le premier texte du bloc qui le porte. Les liens du texte
  // la nomment d'avance (le signet peut venir après eux) : le nom ne dépend que de l'adresse. Un bloc qui porte déjà un `id` (un titre que le sommaire cite
  // passe après : il reprend celui-ci) en reste là ; un paragraphe sans texte (une image seule) n'en a pas, son signet n'est pas relevé (anchorElementsOf). Un signet
  // n'est posé qu'une fois : le premier d'un doublon (macro-modèle), seul inscrit dans anchorElements.
  const ANCHOR_DESTINATION_ID = 'pp-a-';
  function anchorElementsOf(root) {
    const bearing = topLevelElements(root).filter(el => el.hasAttribute(Anchors.ATTR_ID) && (el.textContent.trim() || !el.querySelector('img')));
    return Anchors.indexElements(bearing);
  }

  function placeAnchor(node, produced) {
    const id = node.getAttribute(Anchors.ATTR_ID);
    if (!id || anchorElements.get(id) !== node) return;
    const first = produced.find(b => b && !b._pendingImgNode && !b.absolutePosition && (b.text !== undefined || b.columns || b.stack));
    const leaf = first && (first.text !== undefined ? first : firstTextOf(first));
    if (leaf && !leaf.id) leaf.id = ANCHOR_DESTINATION_ID + id;
  }

  // Contenu pdfmake d'un sommaire, à partir des blocs-titre déjà rencontrés : texte et niveau sont connus tout de suite, pas le numéro de page (il
  // dépend d'une première passe de mise en page, cf. resolveNativePdfContent) ; chaque entrée réserve sa cellule vide, remplie après coup. Chaque entrée est un
  // lien vers son titre (le texte, et le numéro de page quand il est écrit : fillTocPageNumbers) ; la couleur et le trait des lignes restent ceux du sommaire.
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
      const destination = headingDestination(hb);
      const pageCell = { text: '', alignment: 'right', width: 30, bold: isH1, fontSize };
      if (destination) pageCell._destination = destination;
      pageNumberCells.push(pageCell);
      return {
        columns: [glyphText(hb._headingText || '', Object.assign({ bold: isH1, fontSize }, destination ? { linkToDestination: destination } : {})), pageCell],
        columnGap: 4,
        margin: [Math.max(0, level - 1) * 14, isH1 ? 6 : 2, 0, 2],
      };
    });
    return { stack: [title].concat(lines), pageNumberCells };
  }

  // Indentation réelle d'un bloc, mesurée dans un hôte .tiptap hors-écran (hérite le CSS des listes/citations) plutôt que devinée, depuis le bord où
  // pdfmake pose le bloc (flowOriginLeftPx : l'hôte, ou le bord intérieur de la case de tableau où il se trouve : mesurée depuis l'hôte, une liste
  // de la deuxième colonne recevait pour retrait la largeur de la première, et sa case lui laissait une lettre par ligne). 'box' (LI) : bord de la
  // boîte (le marqueur est ajouté à part par listMarkerFor). 'text' : premier caractère rendu, capture aussi un padding/bordure propre.
  function measureIndentPt(node, mode) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const originLeft = flowOriginLeftPx(node);
    // Un flottement CSS (image « au cœur du texte ») qui déborde d'un frère précédent décalerait la mesure comme un faux retrait, fixé pour tout le
    // paragraphe : `clear` l'écarte le temps de la mesure.
    const previousClear = node.style.clear;
    node.style.clear = 'both';
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else if (mode === 'content') {
      const own = getComputedStyle(node);
      leftPx = node.getBoundingClientRect().left + (parseFloat(own.borderLeftWidth) || 0) + (parseFloat(own.paddingLeft) || 0);
    } else {
      // Case d'une variable Oui / Non (`.resolved-checkbox`) : le premier « caractère rendu » d'un paragraphe qui commence par elle est la case, pas
      // son ☑ / ☐ (poussé hors de sa boîte par `text-indent` : le mesurer décalait tout le paragraphe d'une quarantaine de pt) ni le texte qui la
      // suit (sa case lui ferait un faux retrait).
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => {
          // Une tabulation d'ouverture est du retrait du paragraphe, pas de son bloc : sa largeur est écrite dans les runs (tabRun), la compter ici la doublerait et
          // la ferait valoir sur toutes les lignes du paragraphe, pas sur la première.
          if (n.nodeType === Node.ELEMENT_NODE) return n.classList.contains('resolved-checkbox') || TabIndent.isTab(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          return (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      const first = walker.nextNode();
      if (!first) { node.style.clear = previousClear; return 0; }
      // L'alignement du bloc est neutralisé le temps de la mesure : un bloc centré ou aligné à droite pousse son texte loin du bord gauche du large
      // hôte de mesure, ce qui n'est pas un retrait. Celui du paragraphe du premier texte aussi, quand le bloc n'est pas ce paragraphe : l'éditeur
      // pose l'alignement d'une citation sur son paragraphe, et le premier caractère d'un paragraphe centré n'est pas le bord de sa citation.
      const previousAlign = node.style.textAlign;
      node.style.textAlign = 'left';
      const textParagraph = (first.nodeType === Node.ELEMENT_NODE ? first : first.parentElement).closest('p, h1, h2, h3, h4, h5, h6');
      const alignedParagraph = textParagraph && textParagraph !== node && node.contains(textParagraph) ? textParagraph : null;
      const previousParagraphAlign = alignedParagraph ? alignedParagraph.style.textAlign : '';
      if (alignedParagraph) alignedParagraph.style.textAlign = 'left';
      if (first.nodeType === Node.ELEMENT_NODE) {
        // Sans l'écart de .1em que la feuille de style met de chaque côté de la case : c'est un jeu entre elle et son voisin, pas un retrait.
        leftPx = first.getBoundingClientRect().left - (parseFloat(getComputedStyle(first).marginLeft) || 0);
      } else {
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(first, 1);
        leftPx = range.getBoundingClientRect().left;
      }
      if (alignedParagraph) alignedParagraph.style.textAlign = previousParagraphAlign;
      node.style.textAlign = previousAlign;
    }
    node.style.clear = previousClear;
    return Math.round(Math.max(0, (leftPx - originLeft) * PX_TO_PT) * 100) / 100;
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

  // La boîte où l'éditeur règle une image, en pixels : sa largeur (320 à défaut) et, pour une image liée à une colonne Pièces jointes, qui s'y inscrit sans
  // se déformer, sa hauteur (240 à défaut) ; `null` pour toute autre, dont la hauteur suit le ratio.
  function styleBoxOf(node) {
    return { widthPx: parseFloat(node.style.width) || 320, heightPx: node.hasAttribute('data-var-table') ? (parseFloat(node.style.height) || 240) : null };
  }

  function pdfImageFromNode(node) {
    const layer = node.getAttribute('data-layer') || 'normal';
    const layered = layer !== 'normal' && node.style.position === 'absolute';
    const { widthPx: styleWidthPx, heightPx: styleHeightPx } = styleBoxOf(node);
    // Une image dans le texte est ramenée à la largeur de son conteneur, comme dans l'éditeur (ExportCommon.shownImageWidthPx) : réglée plus large
    // que la page, la case ou la colonne, elle déborderait. Une image en calque garde sa taille réglée.
    const widthPx = layered ? styleWidthPx : ExportCommon.shownImageWidthPx(node, styleWidthPx);
    const image = { image: node.getAttribute('src') };
    // Image liée à une #Variable Attachments : la boîte width×height est fixe, mais chaque ligne Grist y met une image d'un autre ratio ; `fit`
    // (pdfmake) la met à l'échelle sans la déformer. `width` reste posé aussi : pdfmake ne le lit pas ici, le bracketing d'une image en calque si
    // (sinon NaN).
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (styleHeightPx !== null) image.fit = [image.width, Math.max(15, styleHeightPx * PX_TO_PT)];
    const opacity = parseFloat(node.style.opacity);
    if (Number.isFinite(opacity) && opacity < 1) image.opacity = opacity;
    if (layered) markLayeredImage(image, node, layer);
    else { markFlowImage(image, node); clipZoneImage(image, node); }
    return image;
  }

  // Une image d'en-tête ou de pied qui dépasse la zone est coupée à sa limite, comme dans l'éditeur, la Lecture et le Word. pdfmake peint une image
  // entière, même hors de la boîte de sa zone, par-dessus le corps de la page : `cover` la rogne à sa partie visible, par le bas. Sa place se lit là où le
  // navigateur la pose dans l'hôte de la zone (`data-hf-zone`) ; une image qui commence au-delà de la limite n'a plus rien de visible (0,01 pt de haut :
  // elle ne prend pas de place). Une image qui s'inscrit dans une boîte (`fit`, colonne Pièces jointes) garde la sienne.
  const ZONE_IMAGE_TOP_MARGIN_PT = 2;
  function clipZoneImage(image, node) {
    const zone = node.closest('[data-hf-zone]');
    if (!zone || image.fit) return;
    const rect = node.getBoundingClientRect();
    const topPx = rect.top - zone.getBoundingClientRect().top;
    if (!(rect.height > 0) || !PageLayout.zoneOverflowPx(topPx + rect.height)) return;
    const visiblePt = Math.max(0.01, (PageLayout.HEADER_FOOTER_ZONE_PX - topPx) * PX_TO_PT - ZONE_IMAGE_TOP_MARGIN_PT);
    image.height = visiblePt;
    image.cover = { width: image.width, height: visiblePt, align: 'left', valign: 'top' };
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
  // texte n'a ni ☑ ni ☐ -, de la taille du texte et de la couleur de la case (style en ligne, déjà lu par inheritedStyle). Jamais grasse ni en
  // italique, et sans trait de ce qui l'enveloppe : le barré d'une case d'accent cochée vise le texte qui la suit, pas une autre case. Seule exception, la case
  // conditionnelle (js/conditional-checkbox.js:resolve), qui porte en `data-checkbox-lines` le souligné et le barré que la personne a posés sur elle.
  const MARK_LINES = { underline: 'underline', 'line-through': 'lineThrough' };
  function checkboxRuns(node, style) {
    const box = Object.assign({}, style, {
      text: node.getAttribute('data-checked') === 'true' ? '\u2611' : '\u2610',
      font: node.getAttribute('data-checkbox-style') === 'classic' ? 'PPBoxClassic' : 'PPBoxAccent',
    });
    delete box.decoration; delete box.bold; delete box.italics;
    const lines = (node.getAttribute('data-checkbox-lines') || '').split(' ').map(line => MARK_LINES[line]).filter(Boolean);
    if (lines.length) box.decoration = lines;
    // Le barré seul d'une case d'accent cochée, qui est pleine : en blanc, comme à la Lecture - à la couleur de la case, il ne se verrait que de part et d'autre d'elle. Avec un souligné,
    // le trait garde la couleur de la case (pdfmake n'en donne qu'une par texte) : c'est le souligné qui se lit.
    if (lines.length === 1 && lines[0] === 'lineThrough' && node.getAttribute('data-checked') === 'true' && node.getAttribute('data-checkbox-style') !== 'classic') box.decorationColor = '#ffffff';
    return [box];
  }

  // Contrairement à .page-number-badge, le numéro ne dépend pas de la pagination : assigné tout de suite par le compteur de module (remis à 0 à
  // chaque passe), correct à toute profondeur.
  function footnoteRuns(node, style) {
    const number = footnoteNumberOf(node);
    return [{ text: String(number), ...style, sup: true, fontSize: (style.fontSize || DEFAULT_FONT_SIZE) * 0.7 }];
  }

  // Tabulation (js/tab-indent.js). Le navigateur cale chaque tabulation sur le cran suivant (12,7 mm) à partir du début de la ligne ; pdfmake n'a pas de cran, il
  // remplace la tabulation par quatre espaces. La largeur de chaque tabulation est donc lue dans l'hôte de mesure, avant toute construction (measureTabs), et rangée en
  // points sur le <span class="pp-tab"> (une valeur par tabulation) : une copie du nœud (extractRunsBetweenRaw) la garde, elle n'a pas besoin d'être mise en page.
  // Une tabulation qui termine sa ligne (fin du bloc, ou saut de ligne forcé) ne se voit pas dans un texte aligné à gauche ou justifié - le navigateur la laisse déborder
  // sans jamais rien pousser à la ligne - mais décale un texte centré ou aligné à droite, comme dans Word : celle-là n'écrit aucun blanc (TAB_HANG_ATTR), les autres si.
  const TAB_WIDTH_ATTR = 'data-pdf-tab-pt';
  const TAB_HANG_ATTR = 'data-pdf-tab-hang';
  const TAB_LINE_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, div, blockquote';
  // Vrai quand rien ne suit la tabulation sur sa ligne : ni texte ni nœud jusqu'à la fin du bloc, ou jusqu'à un saut de ligne forcé.
  function endsItsLine(span) {
    for (let cur = span; cur && !(cur.nodeType === Node.ELEMENT_NODE && cur.matches(TAB_LINE_BLOCKS)); cur = cur.parentNode) {
      for (let next = cur.nextSibling; next; next = next.nextSibling) {
        if (next.nodeType === Node.TEXT_NODE && !next.nodeValue) continue;
        return next.nodeType === Node.ELEMENT_NODE && next.tagName === 'BR';
      }
    }
    return true;
  }
  function measureTabs(root) {
    const spans = Array.from(root.querySelectorAll('.' + TabIndent.CLASS));
    if (!spans.length) return;
    const range = document.createRange();
    // Toutes les lectures d'abord : écrire un attribut après chaque mesure ferait recalculer la page autant de fois.
    const measured = spans.map(span => {
      const found = [];
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
        for (let at = 0; at < textNode.nodeValue.length; at += 1) {
          if (textNode.nodeValue[at] !== TabIndent.TAB) continue;
          range.setStart(textNode, at);
          range.setEnd(textNode, at + 1);
          found.push(Math.round(range.getBoundingClientRect().width * PX_TO_PT * 100) / 100);
        }
      }
      const block = span.closest(TAB_LINE_BLOCKS);
      const align = block ? getComputedStyle(block).textAlign : 'start';
      return { widths: found, hangs: endsItsLine(span) && !/^(?:-webkit-)?(?:center|right)$|^end$/.test(align) };
    });
    spans.forEach((span, i) => {
      span.setAttribute(TAB_WIDTH_ATTR, measured[i].widths.join(','));
      if (measured[i].hangs) span.setAttribute(TAB_HANG_ATTR, '1'); else span.removeAttribute(TAB_HANG_ATTR);
    });
  }
  // Le blanc d'une tabulation de `widthPt` : deux espaces insécables (pdfmake retire les espaces de tête et de queue d'un run, sauf demande contraire), dont l'écart de
  // caractère, qui s'ajoute entre eux (pdfmake ne l'applique jamais après le dernier), complète la largeur d'une paire d'espaces. Celle-ci est lue sur Roboto (spaceWidthPt)
  // à la taille du run : pour une autre police, quelques centièmes de pt d'écart. Le run garde la décoration et le fond du texte (une tabulation soulignée ou surlignée).
  function tabRun(style, widthPt) {
    const pairPt = 2 * spaceWidthPt() * (style.fontSize || DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE;
    return Object.assign({}, style, { text: '\u00a0\u00a0', characterSpacing: widthPt - pairPt, preserveLeadingSpaces: true, preserveTrailingSpaces: true, _tabGap: true });
  }
  // Les runs d'un <span class="pp-tab"> : un blanc par tabulation, à la largeur mesurée (le cran entier quand elle ne l'a pas été : une copie hors de l'hôte), sauf pour
  // celle qui termine sa ligne dans un texte aligné à gauche (rien à écrire), et le texte de la marque, s'il en porte un autre, tel quel.
  function tabRuns(node, style) {
    const widths = (node.getAttribute(TAB_WIDTH_ATTR) || '').split(',').map(parseFloat);
    const hangs = node.getAttribute(TAB_HANG_ATTR) === '1';
    const runs = [];
    (node.textContent || '').split(TabIndent.TAB).forEach((piece, i) => {
      if (i > 0 && !hangs) runs.push(tabRun(style, Number.isFinite(widths[i - 1]) ? widths[i - 1] : TabIndent.STOP_PT));
      if (piece) runs.push(...textRuns(piece, style));
    });
    return runs;
  }

  // Les éléments qui portent une classe à part, essayés dans cet ordre : le premier qui correspond rend les runs de l'élément.
  const RUNS_BY_CLASS = [
    [TabIndent.CLASS, tabRuns],
    ['page-break-marker', () => []],
    // ReaderMode.preview a déjà résolu chaque badge en texte avant ce module : branche de robustesse.
    ['var-badge', (node, style) => textRuns(node.textContent || '', style)],
    // Contrairement à .var-badge, aucune valeur réelle n'existe avant que pdfmake choisisse le numéro de page final - marqueur résolu plus tard par
    // resolvePageNumberPlaceholders à chaque callback header/footer natif.
    ['page-number-badge', (node, style) => [{ text: '#', ...style, _pendingPageNumber: { format: node.getAttribute('data-format') || 'n' } }]],
    ['smart-chip', (node, style) => textRuns(node.textContent || '', style)],
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
  function childRuns(node, style, images, skip) { return runsOfNodes(node.childNodes, style, images, skip); }

  // Les runs d'une suite de nœuds frères (les enfants d'un nœud, ou le morceau d'entre deux traits : ruleSegmentsOf).
  function runsOfNodes(nodes, style, images, skip) {
    const runs = [];
    let sawLineBlock = false;
    nodes.forEach(child => {
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
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? textRuns(node.nodeValue, style) : [];
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
    // Le signe choisi dans « Puce… » (js/bullet-format.js) l'emporte sur le style de la liste ; un signe que la police du texte n'a pas passe par le repli de police (markerRuns).
    const chosen = parent && BulletFormat.markerOf(parent);
    if (chosen) return chosen;
    const bulletStyle = parent && parent.getAttribute('data-bullet-style');
    return BULLET_MARKERS[bulletStyle] || BULLET_MARKERS.disc;
  }

  // La puce ou le numéro pend HORS de la boîte de l'élément : dans l'éditeur et la Lecture (`::marker`) comme dans le Word (retrait suspendu), le texte de la
  // première ligne commence au bord de la boîte, comme les lignes suivantes. Le marqueur est donc le premier mot du bloc, avec un retrait de première ligne
  // négatif (`leadingIndent` de pdfmake) de sa propre largeur : il sort à gauche du retrait du bloc, le texte qui le suit commence au retrait, et la
  // première ligne a autant de place que les suivantes. Largeur mesurée dans le navigateur, dans la police du document (comme spaceWidthPt) ; remise à
  // zéro à chaque export (buildPdfContentFromRoot), la police de mesure pouvant ne pas être chargée à la première mesure d'une session.
  const markerWidths = new Map();
  // La largeur du marqueur à la taille `sizePt` : mesurée à celle du corps, puis mise à l'échelle (une police s'écrit à une largeur proportionnelle à sa taille).
  function markerWidthPt(marker, sizePt = DEFAULT_FONT_SIZE) {
    if (!markerWidths.has(marker)) {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute; visibility:hidden; white-space:pre; font-family:Roboto,Helvetica,Arial,sans-serif; font-size:' + DEFAULT_FONT_SIZE + 'pt;';
      probe.textContent = marker;
      document.body.appendChild(probe);
      markerWidths.set(marker, probe.getBoundingClientRect().width * PX_TO_PT);
      document.body.removeChild(probe);
    }
    return markerWidths.get(marker) * sizePt / DEFAULT_FONT_SIZE;
  }
  // La taille et la couleur de la puce ou du numéro d'un point de liste : celles du début de son texte (js/list-markers.js), comme à l'écran ; sans réglage à cet endroit, la taille du corps et la
  // couleur du document, comme avant.
  function markerLookOf(item) {
    const style = ListMarkers.styleOfElement(item);
    return { sizePt: style && style.size ? cssSize(style.size, DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE, color: style && style.color ? cssColorToHex(style.color) : null };
  }
  const PLAIN_MARKER = { sizePt: DEFAULT_FONT_SIZE, color: null };
  // Les runs du marqueur : un seul, sauf pour un signe de « Puce… » que la police du texte n'a pas (une flèche, une coche : PdfGlyphFallback le pose dans la police de symboles).
  function markerRuns(marker, look) {
    const base = { fontSize: look.sizePt };
    if (look.color) base.color = look.color;
    return PdfGlyphFallback.runsFor(marker, base);
  }
  function listMarkerRuns(marker, look = PLAIN_MARKER) {
    const runs = markerRuns(marker, look);
    runs[0].leadingIndent = -markerWidthPt(marker, look.sizePt);
    return runs;
  }
  // Un point de liste centré, à droite ou justifié : le texte s'aligne dans la boîte du point, mais la puce ou le numéro reste au bord gauche de cette boîte, hors
  // d'elle, comme `::marker` (mesuré dans Chromium : la puce d'un point centré ne suit pas son texte). Deux colonnes : le marqueur, large comme lui, puis le texte avec
  // son alignement et la marge de droite qui compense `white-space: break-spaces`. La rangée recule de la largeur du marqueur (listItemFields, cellTextObject) pour que
  // le texte reste au retrait. Le retrait suspendu (listMarkerRuns) ne convient pas ici : pdfmake aligne la première ligne avec son marqueur, qui suivrait le texte.
  function listMarkerColumns(marker, runs, align, look = PLAIN_MARKER) {
    const column = { width: markerWidthPt(marker, look.sizePt), text: markerRuns(marker, look), noWrap: true, lineHeight: LINE_HEIGHT_RATIO };
    return [
      column,
      { width: '*', text: runs, alignment: align, lineHeight: LINE_HEIGHT_RATIO, margin: [0, 0, spaceWidthPt(), 0] },
    ];
  }

  // Case à cocher dessinée en vectoriel via `canvas` plutôt qu'en glyphe de police (☑/☐ hors WinAnsi, même contrainte que les puces rondes/carrées) :
  // un rectangle + une coche ne dépendent d'aucune police embarquée.
  // Prend la place et la taille de celle de l'éditeur (css/editor-v2.css, mesuré à 14 px de corps) : 15 px de côté (11,25 pt), le texte 6 px (4,5 pt) plus loin.
  // Les styles « accent » posent la case native de Chromium, avec ses marges (4 px à gauche, 3 px à droite et au-dessus) et les .2em du label : case à 3 pt du bord
  // de l'élément, texte à 21 pt. « classic » la dessine à la main, sans marge : case au bord, texte à 15,75 pt, case 3 px plus haut. `top` : le haut de la case sous
  // le haut de la première ligne, réglé pour qu'elle ait, par rapport à la ligne de base, la même place que dans l'éditeur (la ligne de base du PDF est à 9,74 pt
  // du haut de l'item, celle de l'éditeur à 10,5 pt).
  const TASK_BOX_PT = 11.25;
  const TASK_TEXT_GAP_PT = 4.5;
  function taskBoxGeometry(style) {
    return style === 'classic'
      ? { left: 0, top: 1.3, width: TASK_BOX_PT + TASK_TEXT_GAP_PT }
      : { left: 3, top: 3.6, width: 3 + TASK_BOX_PT + 2.25 + TASK_TEXT_GAP_PT };
  }
  function taskCheckboxCanvas(checked, style) {
    const { left } = taskBoxGeometry(style);
    // Le trait de 1 pt est centré sur le contour : il déborde de 0,5 pt de chaque côté, la case peinte fait donc TASK_BOX_PT. La coche a été dessinée pour une case de 8 pt.
    const side = TASK_BOX_PT - 1;
    const scale = side / 8;
    const at = (x, y) => ({ x: Math.round((left + 0.5 + x * scale) * 100) / 100, y: Math.round((0.5 + y * scale) * 100) / 100 });
    const check = [at(1.6, 4.6), at(3.3, 6.6), at(6.6, 2)];
    const rect = { type: 'rect', x: left + 0.5, y: 0.5, w: side, h: side, r: style === 'classic' ? 0.5 : 1.6, lineWidth: 1 };
    if (style === 'classic') {
      const shapes = [Object.assign({}, rect, { lineColor: '#555' })];
      if (checked) shapes.push({ type: 'polyline', lineWidth: 1.7, lineColor: '#222', points: check });
      return shapes;
    }
    if (checked) return [Object.assign({}, rect, { color: '#2f6fed', lineColor: '#2f6fed' }), { type: 'polyline', lineWidth: 1.8, lineColor: '#ffffff', points: check }];
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

  // Structure `columns` commune aux deux points d'insertion d'un item de liste de tâches : case dans une colonne étroite, texte dans le reste, avec à droite la marge
  // d'une espace des autres blocs de texte (`break-spaces`).
  function taskListColumns(node, runs, align) {
    const checked = node.getAttribute('data-checked') === 'true';
    const style = (node.parentElement && node.parentElement.getAttribute('data-tasklist-style')) || 'accentStrike';
    const { top, width } = taskBoxGeometry(style);
    const textCol = { width: '*', text: runs, lineHeight: LINE_HEIGHT_RATIO, margin: [0, 0, spaceWidthPt(), 0] };
    if (align) textCol.alignment = align;
    return [
      { width, margin: [0, top, 0, 0], canvas: taskCheckboxCanvas(checked, style) },
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

  // Les éléments d'une liste de case, une ligne chacun, suivis de ceux de leurs sous-listes (à tout niveau) : une sous-liste n'était pas lue comme une liste
  // (ses <li> partaient en texte « en ligne ») et sortait sans puce ni retrait, à gauche de la case.
  function listLinesOf(list, lines) {
    Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
      lines.push(li);
      Array.from(li.children).filter(c => /^(UL|OL)$/.test(c.tagName)).forEach(nested => listLinesOf(nested, lines));
    });
  }
  // Découpe les enfants directs d'une cellule en "lignes" pdfmake : <p>/<div>/<h1-6> direct = sa propre ligne, comme un trait (<hr>) ; <ul>/<ol>
  // direct = une ligne par <li> (listLinesOf) ; une citation = sa propre ligne ; tout le reste s'accumule dans un groupe "inline".
  function collectCellLines(container, lines) {
    let pending = [];
    function flushPending() { if (pending.length) { lines.push({ inline: pending }); pending = []; } }
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue) pending.push(node); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (/^(P|DIV|H[1-6]|PRE|HR)$/.test(node.tagName)) { flushPending(); lines.push(node); return; }
      // Une citation est une ligne à elle (retrait, italique, 4 pt de dessus et de dessous, comme dans le flux) ; un trait qui la traverse la coupe : cellRuleSplitObjects.
      if (node.tagName === 'BLOCKQUOTE') { flushPending(); lines.push(node); return; }
      if (/^(UL|OL)$/.test(node.tagName)) { flushPending(); listLinesOf(node, lines); return; }
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
    const blocks = cellLineBlocks(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending, state);
    // Le réglage « Paragraphe… » d'un paragraphe, d'un élément de liste ou d'une citation de la case (une ligne de la case chacun, sous-listes comprises).
    return !line.inline && /^(P|LI|BLOCKQUOTE)$/.test(line.tagName) ? applyParagraphFormat(blocks, line) : blocks;
  }
  function cellLineBlocks(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending, state) {
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

  // Un élément de liste, une citation ou un paragraphe de la case, en un bloc de texte (une case à cocher et ses colonnes pour un élément de liste de tâches).
  // Une citation s'écrit comme dans le flux (textBlockFrom) : en italique, retrait mesuré sur son texte, 4 pt de dessus et de dessous ; `rulePart` : le morceau
  // d'une citation que coupe un trait, dont cellRuleSplitObjects pose seule les marges des deux bouts.
  function cellTextObject(node, runs, cellAlign, cellWidthPt, continued, rulePart) {
    const isLi = node.tagName === 'LI';
    const isQuote = node.tagName === 'BLOCKQUOTE';
    const align = alignment(node) || cellAlign;
    if (isLi && isTaskListItem(node)) {
      return { columns: taskListColumns(node, taskListRuns(node, runs), align), margin: [measureIndentPt(node, 'box'), 0, 0, 0] };
    }
    const marker = isLi && !continued ? listMarkerFor(node) : '';
    const look = marker ? markerLookOf(node) : null;
    const text = marker ? listMarkerRuns(marker, look).concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
    const indentPt = isLi ? measureIndentPt(node, 'box') : (isQuote ? measureIndentPt(node, 'text') : 0);
    // Une citation centrée, à droite ou justifiée se place par son bord droit : elle prend, comme un point de liste, la marge d'une espace qui compense `break-spaces`,
    // et non celle (nulle quand rien ne presse) qui ne sert qu'à couper les lignes là où le navigateur les coupe.
    const wrapMarginPt = !runs.length ? 0 : (isLi || hasRuleChild(node) || (isQuote && align && align !== 'left') ? spaceWidthPt() : cellWrapMarginPt(node, cellWidthPt - indentPt));
    const quoteGapPt = isQuote && !rulePart ? 4 : 0;
    if (marker && runs.length && align && align !== 'left') return { columns: listMarkerColumns(marker, runs, align, look), margin: [indentPt - markerWidthPt(marker, look.sizePt), 0, 0, 0] };
    const obj = { text, margin: [indentPt, quoteGapPt, wrapMarginPt, quoteGapPt] };
    if (isQuote) obj.italics = true;
    if (align) obj.alignment = align;
    if (!runs.length && node.tagName === 'P' && node.hasAttribute('data-caption')) obj.fontSize = Caption.SIZE_PT;
    return obj;
  }

  function cellLineObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
    if (line.inline) return inlineCellObject(line, cellAlign, cellBaseStyle, images, rootRect, nestedPending);
    const node = line;
    // Bloc de code dans une cellule de tableau : le même cadre gris que dans le flux principal, en tableau imbriqué à la largeur de la cellule.
    if (node.tagName === 'PRE') return codeBlockFrom(node, false, true);
    // Un trait : toute la largeur de la case, comme dans l'éditeur.
    if (node.tagName === 'HR') return ruleBlock(false, cellWidthPt);
    if (/^(LI|BLOCKQUOTE)$/.test(node.tagName) && hasRuleChild(node)) return cellRuleSplitObjects(node, cellAlign, cellBaseStyle, images, cellWidthPt);
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
    // Un texte à ombre ou à contour est dessiné en vectoriel, comme dans le flux (effectBlockFrom).
    const effect = effectBlockFrom(node, node.tagName, null, null);
    if (effect) return effect;
    const obj = cellTextObject(node, trimEdgeWhitespace(stripImageMarkers(rawRuns)), cellAlign, cellWidthPt);
    attributeNestedPendingImages(images, before, obj, node, rootRect, nestedPending);
    return obj;
  }
  // Un <li> ou une citation de case que traverse un trait (<hr>, enfant direct) : le texte d'avant avec la puce, le trait, le texte d'après sans puce, comme
  // ruleSplitBlocks dans le flux. Les sous-listes sont des lignes de la case à part (collectCellLines), pas du texte du <li>. Une citation de case est en
  // italique, avec le retrait de son texte (sans puce) : le trait part de ce retrait et va jusqu'au bord de la case, et la citation garde ses 4 pt de dessus
  // et de dessous aux deux bouts seulement.
  function cellRuleSplitObjects(node, cellAlign, cellBaseStyle, images, cellWidthPt) {
    const style = inheritedStyle(node, cellBaseStyle);
    const isQuote = node.tagName === 'BLOCKQUOTE';
    const indentPt = measureIndentPt(node, isQuote ? 'text' : 'box');
    const isList = child => child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName);
    const objects = [];
    ruleSegmentsOf(node).forEach((children, i) => {
      if (i > 0) objects.push(ruleBlock(false, cellWidthPt - indentPt, indentPt));
      if (i > 0 && !segmentHasContent(children)) return;
      const runs = trimEdgeWhitespace(stripImageMarkers(runsOfNodes(children, style, images, isList)));
      objects.push(cellTextObject(node, runs, cellAlign, cellWidthPt, i > 0, true));
    });
    if (isQuote && objects.length) { addTopMargin(objects[0], 4); addBottomMargin(objects[objects.length - 1], 4); }
    return objects;
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

  function tableFrom(node, pageBreakBefore, rootRect, inMainFlow, indentPt) {
    const rows = ExportCommon.tableRows(node);
    const rawRows = rows.length ? rows : Array.from(node.querySelectorAll('tr'));
    const columnCount = tableColumnCount(rawRows);
    const pads = cellPaddingsPt(rawRows);
    const widths = columnWidthsPt(node, columnCount, pads.left + pads.right, indentPt);
    // Les réglages de la grille (hauteur d'une ligne, alignement vertical, bords, quadrillage, saut de page avant une ligne) se lisent sur la marque
    // de l'enregistrement de tout tableau, grille ou tableau de document : un tableau que personne n'a réglé n'en porte aucune et sort comme avant.
    const hasRowHeights = rawRows.some(row => row.hasAttribute('data-row-height'));
    // Une page ne s'ouvre que dans le texte courant : celui d'une case, d'une liste, d'une citation, d'un encadré ou d'une colonne ne passe pas d'une
    // page à l'autre, une marque y reste sans effet (comme dans le Word).
    const atPageLevel = !!inMainFlow && !(node.parentElement && node.parentElement.closest(PAGE_FLOW_BREAKERS));
    const hasRowBreaks = atPageLevel && rawRows.some(row => row.hasAttribute('data-page-break-before'));
    const hasValign = rawRows.some(row => ExportCommon.cellsOf(row).some(cell => ExportCommon.cellVerticalAlign(cell)));
    const rowAreasPt = hasRowHeights || hasValign ? gridRowAreasPt(rawRows, pads) : null;
    const t = {
      node, rawRows, rootRect, inMainFlow, columnCount, pads, widths, indentPt: indentPt || 0,
      // La grille ouverte : pas de suite de texte ni de page, donc ni lignes de titres reprises, ni lignes gardées entières. Un tableau à sauts de page
      // avant une ligne est coupé en morceaux (tableBlocksFrom), grille ou tableau de document.
      isGrid: hasRowHeights && exportsGridModel,
      atPageLevel,
      hasRowBreaks,
      layout: tableLayoutFor(pads),
      // Bords réglés (barre de la case, js/table-borders.js) : le trait de départ est celui du layout ; pdfmake dessine un trait dès que l'une des deux
      // cases voisines le veut, et lit les bords d'une case fusionnée sur sa case de départ seule (les `{}` qui la prolongent n'y changent rien :
      // vérifié en lisant les traits du PDF) - chaque case porte donc ses quatre côtés, et les cases voisines, d'accord avec elle sur le trait qu'elles
      // se partagent, disent la même chose.
      borderSides: ExportCommon.cellBorderSides(node),
      // Quadrillage de départ masqué : aucun trait pour une case que le HTML ne donne pas (ligne trop courte), les cases du HTML ont déjà leurs bords.
      gridLinesHidden: ExportCommon.gridLinesHidden(node),
      // L'espace de contenu de chaque ligne, hauteur réglée ou mesurée : de quoi centrer ou descendre une case selon son alignement vertical.
      rowAreasPt,
      // `heights` de pdfmake : la hauteur de chaque ligne réglée, 'auto' (celle de son contenu) pour une ligne que personne n'a réglée. Une grille a
      // toutes les siennes.
      rowHeightsPt: hasRowHeights ? rowAreasPt.map((areaPt, i) => (rawRows[i].hasAttribute('data-row-height') ? areaPt : 'auto')) : null,
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
  function columnWidthsPt(node, columnCount, cellPaddingPt, indentPt) {
    // `indentPt` : le retrait d'un tableau posé dans un item de liste ou une citation, pris sur la largeur de la page. Un tableau d'une colonne de zone à
    // deux colonnes est pris sur la largeur de sa colonne, celle de l'hôte de mesure de son contenu (htmlToPdfContent), plus étroite que la page.
    const zoneHost = node.closest('[data-zone-column]');
    const boxPt = zoneHost ? Math.min(CONTENT_WIDTH_PT, zoneHost.getBoundingClientRect().width * PX_TO_PT) : CONTENT_WIDTH_PT;
    const usablePt = Math.max(MIN_COLUMN_WIDTH_PT * columnCount, boxPt - (indentPt || 0) - columnCount * (cellPaddingPt + TABLE_LINE_PT) - TABLE_LINE_PT);
    const measuredPx = ExportCommon.measuredColumnWidthsPx(node, columnCount);
    const measuredPt = measuredPx ? measuredPx.map(px => px * PX_TO_PT) : null;
    const measuredSum = measuredPt ? measuredPt.reduce((sum, w) => sum + w, 0) : 0;
    // Les largeurs mesurées sur le total visé : la largeur réelle du tableau si elle tient dans la page (un tableau rétréci reste rétréci à l'export),
    // `usablePt` au-delà ; aucune colonne sous le minimum (calcul commun avec le Word : ExportCommon.fitColumnWidths).
    return measuredSum > 0
      ? ExportCommon.fitColumnWidths(measuredPt, usablePt, MIN_COLUMN_WIDTH_PT)
      : Array(columnCount).fill(Math.max(MIN_COLUMN_WIDTH_PT, usablePt / columnCount));
  }

  function tableLayoutFor(pads) {
    return {
      hLineWidth: () => TABLE_LINE_PT, vLineWidth: () => TABLE_LINE_PT, hLineColor: () => TABLE_BORDER_COLOR, vLineColor: () => TABLE_BORDER_COLOR,
      paddingLeft: () => pads.left, paddingRight: () => pads.right, paddingTop: () => pads.top, paddingBottom: () => pads.bottom,
    };
  }

  // Grille (js/grid-editor.js) ou tableau de document réglé : une ligne peut porter sa hauteur en px (`data-row-height`, un minimum : un texte plus
  // haut agrandit la ligne). `heights` de pdfmake est la hauteur du contenu de la ligne, sans les marges intérieures ni le trait, et un minimum lui
  // aussi ; la hauteur mesurée dans l'hôte (qui compte la croissance due au texte, et celle d'une ligne sans réglage) la complète.
  function gridRowAreasPt(rawRows, pads) {
    return rawRows.map(row => {
      const px = Math.max(ExportCommon.rowHeightPx(row) || 0, row.getBoundingClientRect().height);
      return Math.max(0, px * PX_TO_PT - pads.top - pads.bottom - TABLE_LINE_PT);
    });
  }

  // Le décalage haut d'une case de grille selon son alignement vertical : pdfmake ne centre rien dans une case, le centrage est une marge haute,
  // calculée sur la hauteur du texte mesurée dans l'hôte. Une case fusionnée sur plusieurs lignes se centre (ou se pose en bas) sur la hauteur de toutes
  // les lignes qu'elle couvre, traits et marges intérieures des lignes du milieu compris.
  function gridCellOffsetPt(t, cell, rowIndex, rowSpan) {
    const valign = ExportCommon.cellVerticalAlign(cell);
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
    const fillerLine = !t.gridLinesHidden;
    while (output.length < columnCount) output.push({ text: ' ', border: [fillerLine, fillerLine, fillerLine, fillerLine], _filler: true });
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

  // Une case pdfmake : son contenu, son alignement, son fond, ses bords et son décalage vertical (réglés avec la barre de la case : grille ou tableau de
  // document). Pas de margin propre à la case : le seul inset est layout.padding*, déjà compté dans la largeur utilisable.
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
    if (t.rowAreasPt) {
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
  // et la grille ouverte (js/grid-editor.js) n'a pas de feuille. Un tableau réglé (hauteurs de lignes, bords, alignement) se range comme un autre ;
  // un tableau à sauts de page avant une ligne aussi, chaque morceau (tableBlocksFrom) se range à son tour.
  //
  // `heights` : les hauteurs réglées, une par ligne du plan (null : aucune). Un groupe de lignes liées devient une seule ligne ('auto' : c'est le tableau
  // qu'il contient qui porte les hauteurs de ses lignes). `starts` : pour chaque ligne du plan, le rang de sa première ligne dans le tableau (null : une
  // ligne du plan par ligne du tableau), pour retrouver où tombe un saut de page avant une ligne.
  function pageBreakPlan(t, body) {
    const { node, rawRows } = t;
    const inPageFlow = !t.isGrid && t.atPageLevel;
    const headerRows = inPageFlow ? ExportCommon.headerRowCount(rawRows) : 0;
    const cutRows = TablePageCut.rowsOf(node);
    const cutUnits = cutRows && cutRows.length === rawRows.length ? TablePageCut.unitsOf(cutRows) : null;
    const dontBreakRows = !!cutUnits && inPageFlow && rowsFitInPage(node, cutRows, cutUnits);
    if (!dontBreakRows || !cutUnits.some(unit => unit.to - unit.from > 1)) return { rows: body, headerRows, dontBreakRows, heights: t.rowHeightsPt, starts: null };
    return {
      rows: cutUnits.map(unit => (unit.to - unit.from > 1 ? unitRowFrom(t, body.slice(unit.from, unit.to), unit) : body[unit.from])),
      // Les lignes de titres finissent toujours entre deux groupes (headerRowCount s'arrête avant une case fusionnée qui déborde) : leur nombre, en
      // groupes.
      headerRows: cutUnits.filter(unit => unit.to <= headerRows).length,
      dontBreakRows,
      heights: t.rowHeightsPt ? cutUnits.map(unit => (unit.to - unit.from > 1 ? 'auto' : t.rowHeightsPt[unit.from])) : null,
      starts: cutUnits.map(unit => unit.from),
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

  // Le tableau d'un groupe de lignes, à la place de ses lignes. Il peint lui-même son contour, case par case, avec les bords et les couleurs réglés avec la
  // barre de la case : la case qui le porte, sur toutes les colonnes, ne peut peindre qu'un trait d'une seule couleur par côté, et dessinait le haut, le bas
  // et les côtés du groupe d'un trait gris (ou de la couleur de la première case de la ligne d'à côté) sans égard à ses cases. Son contour tombe sur celui que
  // pdfmake réserve à la ligne qui le porte, sans rien décaler : une largeur de trait de plus de chaque côté, reprise par les marges négatives en plus du
  // rembourrage de cette ligne, que le tableau imbriqué n'a pas à compter. La case qui le porte ne peint aucun trait. Les hauteurs réglées des lignes du
  // groupe (`unit` : { from, to } sur les lignes du tableau) passent au tableau qu'il contient. Qui peint le haut et le bas du groupe : `settleUnitEdges`.
  function unitRowFrom(t, unitBody, unit) {
    const { layout, widths, pads, columnCount } = t;
    const unitTable = {
      table: Object.assign({ widths: widths.slice(), body: unitBody }, t.rowHeightsPt ? { heights: t.rowHeightsPt.slice(unit.from, unit.to) } : {}),
      layout,
      margin: [-pads.left - TABLE_LINE_PT, -pads.top - TABLE_LINE_PT, -pads.right - TABLE_LINE_PT, -pads.bottom - TABLE_LINE_PT],
      colSpan: columnCount, border: [false, false, false, false], _unitTable: true,
    };
    return [unitTable].concat(Array.from({ length: columnCount - 1 }, () => ({})));
  }

  // Le tableau pdfmake : ses lignes (celles du corps, ou leurs groupes), sa mise en page, et ce qui remonte au contenu : les images en calque de ses
  // cases, et, pour un tableau à sauts de page avant une ligne (`data-page-break-before`), ses tranches (celles que tableBlocksFrom en fera).
  function pdfTableFrom(t, body, plan, pageBreakBefore) {
    const { columnCount, widths } = t;
    const emptyRow = [[{ text: ' ' }].concat(Array(Math.max(0, columnCount - 1)).fill({}))];
    const table = {
      table: Object.assign({ headerRows: plan.headerRows, widths, body: plan.rows.length ? plan.rows : emptyRow }, plan.heights && body.length ? { heights: plan.heights } : {}, plan.dontBreakRows ? { dontBreakRows: true } : {}),
      layout: t.layout,
      margin: [t.indentPt, 5, 0, 5],
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    if (t.nestedPending.length) table._nestedPending = t.nestedPending;
    if (t.hasRowBreaks && body.length) {
      // Les tranches, en lignes du plan (un groupe de lignes liées en est une) : gridRowSegments ne coupe jamais au milieu d'un groupe.
      const planRow = rawIndex => (rawIndex >= t.rawRows.length ? plan.rows.length : (plan.starts ? plan.starts.indexOf(rawIndex) : rawIndex));
      const segments = ExportCommon.gridRowSegments(t.rawRows).map(([from, to]) => [planRow(from), planRow(to)]);
      if (segments.length > 1 && segments.every(([from, to]) => from >= 0 && to > from)) table._rowSegments = segments;
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
    const heights = table.table.heights;
    const head = Object.assign({}, table, { table: Object.assign({}, table.table, { body: body.slice(0, -1), headerRows: Math.min(table.table.headerRows || 0, body.length - 2) }, heights ? { heights: heights.slice(0, -1) } : {}), margin: [0, 5, 0, 0] });
    const baseLayout = table.layout;
    const tail = Object.assign({}, table, {
      table: Object.assign({}, table.table, { body: body.slice(-1), headerRows: 0 }, heights ? { heights: heights.slice(-1) } : {}),
      margin: [0, 0, 0, 5],
      layout: Object.assign({}, baseLayout, { hLineWidth: (i, tableNode) => (i === 0 && tableNode.pageBreak !== 'before' ? 0 : baseLayout.hLineWidth(i, tableNode)) }),
      _keepTail: true,
      _keepUnitPt: tailPt,
    });
    delete tail.pageBreak;
    delete tail._nestedPending;
    return [head, tail];
  }
  function tableBlocksFrom(node, pageBreakBefore, rootRect, inMainFlow, captionPt, indentPt) {
    const blocks = cutTableBlocks(node, pageBreakBefore, rootRect, inMainFlow, captionPt, indentPt);
    blocks.forEach(settleUnitEdges);
    return blocks;
  }

  // Le haut et le bas d'un groupe de lignes liées ne sont peints qu'une fois. Entre deux lignes du tableau, pdfmake peint le trait que veut l'une des deux
  // cases voisines, case par case : la ligne voisine du groupe (une ligne ordinaire) le peint, et le tableau du groupe, qui le peindrait au même endroit,
  // le laisse (il peindrait le trait deux fois : plus foncé qu'ailleurs). Il le peint quand rien d'autre ne le fait : le haut du premier groupe d'un
  // morceau, qui n'a pas de ligne au-dessus (sauf le dernier morceau collé à celui d'avant, `splitTailRow` : le bas de celui-ci est déjà peint), le bas du
  // dernier, et le trait entre deux groupes qui se suivent (chacun peint le sien : un saut de page peut tomber entre les deux). Une ligne voisine plus courte
  // que le tableau (cases de remplissage) ne dit rien des traits que le groupe a posés : il garde les siens.
  function settleUnitEdges(block) {
    const body = block.table.body;
    const isUnit = row => !!row && !!row[0] && !!row[0]._unitTable;
    const paintsAlone = row => isUnit(row) || row.some(cell => cell && cell._filler);
    body.forEach((row, r) => {
      if (!isUnit(row)) return;
      const paintsTop = r === 0 ? block.layout.hLineWidth(0, block) > 0 : paintsAlone(body[r - 1]);
      const paintsBottom = r === body.length - 1 || paintsAlone(body[r + 1]);
      const unitBody = row[0].table.body;
      const last = unitBody.length - 1;
      unitBody.forEach((unitRow, i) => unitRow.forEach((cell) => {
        if (!Array.isArray(cell.border)) return;
        if (i === 0 && !paintsTop) cell.border[1] = false;
        if (i + (cell.rowSpan || 1) - 1 >= last && !paintsBottom) cell.border[3] = false;
      }));
    });
  }

  function cutTableBlocks(node, pageBreakBefore, rootRect, inMainFlow, captionPt, indentPt) {
    const table = tableFrom(node, pageBreakBefore, rootRect, inMainFlow, indentPt);
    const segments = table._rowSegments;
    delete table._rowSegments;
    if (!segments) return (captionPt > 0 && splitTailRow(table, node, captionPt)) || [table];
    const { body, heights, headerRows } = table.table;
    return segments.map(([from, to], i) => {
      // Les lignes de titres reviennent en haut de chaque morceau (comme sur les pages où le tableau se poursuit), sauf celles que le saut laisse
      // derrière lui ; pdfmake n'en reprend jamais toutes les lignes d'un morceau, il en garde une au moins sous elles.
      const titles = i > 0 ? Math.min(headerRows || 0, from) : 0;
      const pieceBody = (titles ? copiedTitleRows(body.slice(0, titles)) : []).concat(body.slice(from, to));
      const pieceHeights = heights ? heights.slice(0, titles).concat(heights.slice(from, to)) : null;
      const piece = Object.assign({}, table, { table: Object.assign({}, table.table, { body: pieceBody, headerRows: Math.min(headerRows || 0, pieceBody.length - 1) }, pieceHeights ? { heights: pieceHeights } : {}) });
      if (i > 0) { piece.pageBreak = 'before'; delete piece._nestedPending; }
      return piece;
    });
  }

  // Une copie des lignes de titres d'un tableau pour un morceau de plus : pdfmake pose son état sur les objets qu'il range (largeurs, positions), deux
  // tableaux ne partagent donc pas une case. Les objets simples et les listes sont copiés, le reste (fonctions, nœuds) est gardé tel quel ; une image
  // en calque d'une case (ancrée sur la page par son nœud, une fois : `_pendingImgNode`) n'est pas reprise.
  function copiedTitleRows(rows) {
    const copy = (value) => {
      if (Array.isArray(value)) return value.filter(item => !(item && item._pendingImgNode)).map(copy);
      if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
      return value;
    };
    return rows.map(copy);
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
      try { blocks = await htmlToPdfContent(col.innerHTML, false, widthPt[colIdx], { keepWhole: true, zoneColumn: true }); }
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

  // Cadre de texte libre (js/free-frame.js) : le nœud pdfmake de sa boîte, à sa place sur la page (ses mesures sont en points depuis le coin haut gauche de la page, comme celles de pdfmake) et
  // de sa largeur, son texte mis en page comme celui d'une colonne dans la largeur que son CSS lui laisse. Ses marges intérieures sont celles du CSS réel (css/free-frame.css), pas recopiées.
  // Une image en calque dans un cadre reste dans son texte ; une note de bas de page y est numérotée avec les autres (visitFrame la range avec sa marque).
  const FRAME_CLASS = 'pp-free-frame';
  const FRAME_CONTENT_SELECTOR = ':scope > .pp-free-frame-box > .pp-free-frame-content';
  async function frameFrom(node, content) {
    const attrs = FreeFrame.measuresOf(node);
    // Le fond d'une diapositive (SlideProps.forOutput) n'est que le dessin : une page entière de sa couleur, sans texte à mettre en page.
    if (node.hasAttribute(FreeFrame.BACKGROUND_ATTR)) return frameDrawingFrom(node, content, attrs).node;
    if (attrs.shape === ShapeGeometry.LINE) return lineDrawingFrom(attrs);
    // Un cadre pivoté ou à colonnes de texte (`attrs.cols`) : pdfmake ne tourne rien et ne met pas un texte en colonnes qui se suivent ; le texte est lu sur l'écran, mot à mot, et dessiné en SVG.
    if (attrs.rot || attrs.cols || attrs.vert) { await decodeImagesOf(content); return rotatedFrameFrom(content, attrs); }
    const { x, y, w } = attrs;
    const style = getComputedStyle(content);
    const padPt = side => (parseFloat(style['padding' + side]) || 0) * PX_TO_PT;
    const padding = [padPt('Left'), padPt('Top'), padPt('Right'), padPt('Bottom')];
    const innerWidthPt = Math.max(12, w - padding[0] - padding[2]);
    let blocks;
    try { blocks = await htmlToPdfContent(content.innerHTML, false, innerWidthPt, { floatsOverflow: true }); }
    catch (e) { console.warn('[PdfExport] contenu de cadre ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(content, false)]; }
    stripUnresolvedPendingImages(blocks);
    delete blocks._pendingImages;
    const text = { absolutePosition: { x, y }, columns: [{ width: w, margin: padding, stack: blocks }] };
    const drawing = frameDrawingFrom(node, content, attrs);
    if (!drawing) return text;
    text.absolutePosition.y = y + drawing.textTopPt;
    return { stack: [drawing.node, text] };
  }

  // Le dessin d'un cadre qui a un fond, un trait ou une forme (js/shape-geometry.js) : un canevas pdfmake au coin de la boîte, que le texte recouvre. La boîte a la hauteur que le DOM lui montre
  // (elle grandit avec son texte, `h` n'est qu'un minimum) : le contour de `h` est étiré à cette hauteur, comme les pourcentages du CSS qui dessine la même forme à l'écran, et le texte garde sa
  // place dans la boîte (un texte de forme est centré : son décalage est celui du DOM). Le trait du PDF est centré sur son contour : on le dessine sur le contour rentré de la moitié de
  // l'épaisseur, si bien que son encre tient dans la boîte, comme la bordure CSS. Rend { node, textTopPt } ou null : un cadre de texte nu n'a rien à dessiner.
  function frameDrawingFrom(node, content, attrs) {
    if (!frameInkOf(attrs).any) return null;
    const box = content.parentElement.getBoundingClientRect();
    const heightPt = Math.max(attrs.h, box.height * PX_TO_PT);
    const textTopPt = Math.max(0, (content.getBoundingClientRect().top - box.top) * PX_TO_PT);
    if (ShapeGeometry.drawnByPresets(attrs.shape, attrs.adj)) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgNum(attrs.w) + '" height="' + svgNum(heightPt) + '" viewBox="0 0 ' + svgNum(attrs.w) + ' ' + svgNum(attrs.h) + '" preserveAspectRatio="none">'
        + presetBodyOf(attrs) + '</svg>';
      return { node: { svg, width: attrs.w, height: heightPt, absolutePosition: { x: attrs.x, y: attrs.y } }, textTopPt };
    }
    return { node: { canvas: frameVectorsOf(attrs, heightPt), absolutePosition: { x: attrs.x, y: attrs.y } }, textTopPt };
  }
  // Une forme de la norme (js/shape-presets.js : le cylindre, le cœur, les flèches courbes... ; ou l'une des seize à réglages) n'a pas de contour simple : son dessin est celui de l'éditeur
  // (ShapeGeometry.presetSvg : ses chemins, ses faces éclaircies ou assombries, son trait en onglet à la limite de PowerPoint), en SVG, que pdfmake peint en vecteurs (svg-to-pdfkit) étiré à la
  // hauteur de la boîte comme l'image de l'éditeur. Le fond et le trait ont chacun leur opacité, comme leurs deux calques ; un fond ou un trait invisible ne se peint pas. Le corps du SVG, dans le
  // repère de la boîte (`w` sur `h` points).
  function presetBodyOf(attrs) {
    const ink = frameInkOf(attrs);
    const edge = FreeFrame.lineWidthOf(attrs);
    const drawn = ShapeGeometry.presetSvg(attrs.shape, attrs.w, attrs.h, { fill: attrs.fill, line: edge ? attrs.line : '', lw: edge, dash: attrs.dash, cap: attrs.cap, cmpd: attrs.cmpd, adj: attrs.adj, geo: attrs.geo });
    const layer = (body, shown, tr) => (body && shown ? (tr ? '<g opacity="' + svgNum((100 - tr) / 100) + '">' + body + '</g>' : body) : '');
    return layer(drawn.fill, ink.fill, attrs.fillTr) + layer(drawn.line, ink.line, attrs.lineTr);
  }
  // Ce qu'un cadre montre de son dessin : un fond ou un trait totalement transparent (100 %) ne se peint pas (pdfmake peindrait un trait noir à un vecteur qui n'a aucune couleur).
  function frameInkOf(attrs) {
    const fill = !!attrs.fill && attrs.fillTr < 100;
    const line = !!FreeFrame.lineWidthOf(attrs) && attrs.lineTr < 100;
    return { fill, line, any: fill || line };
  }
  // Le contour d'un cadre (son fond et son trait) en vecteurs du canevas de pdfmake, en points depuis le coin de sa boîte de hauteur `heightPt` ; le cadre pivoté (rotatedFrameFrom) les écrit en SVG.
  // Le trait est centré sur le contour rentré de sa demi-épaisseur et le fond s'y arrête : un trait translucide ne couvre le fond que sur sa moitié intérieure, comme dans PowerPoint et dans l'éditeur.
  // Un trait simple est UN vecteur (le fond et le trait ensemble) ; un trait composé (`cmpd`) en fait plusieurs : le fond seul, puis chaque bande du trait, rentrée du milieu de sa bande.
  function frameVectorsOf(attrs, heightPt) {
    const edgePt = FreeFrame.lineWidthOf(attrs);
    const widthPt = attrs.w;
    const ink = frameInkOf(attrs);
    const contour = (half, paint) => {
      const outline = ShapeGeometry.outlineInset(attrs.shape, widthPt, attrs.h, half);
      if (outline.type === 'polygon') {
        const stretch = heightPt / attrs.h;
        return { type: 'polyline', closePath: true, points: outline.points.map(p => ({ x: p[0], y: p[1] * stretch })), ...paint };
      }
      if (outline.type === 'ellipse') return { type: 'ellipse', x: widthPt / 2, y: heightPt / 2, r1: Math.max(0.1, widthPt / 2 - half), r2: Math.max(0.1, heightPt / 2 - half), ...paint };
      const vector = { type: 'rect', x: half, y: half, w: Math.max(0.1, widthPt - 2 * half), h: Math.max(0.1, heightPt - 2 * half), ...paint };
      if (outline.type === 'roundRect') vector.r = Math.max(0, outline.radius - half);
      return vector;
    };
    const fillPaint = () => {
      const paint = { lineJoin: 'miter' };
      if (ink.fill) { paint.color = attrs.fill; if (attrs.fillTr) paint.fillOpacity = (100 - attrs.fillTr) / 100; }
      return paint;
    };
    // Le trait d'une bande de `width` points (le trait entier pour un trait simple) : sa couleur, son opacité et, pour des tirets ou des pointillés, les longueurs du motif (pdfmake les passe telles
    // quelles à PDF, de tous les couples) et le bout ; la phase met le premier trait là où SVG le met. Le motif est celui du trait entier, le bout celui de la bande.
    const stroked = (paint, width) => {
      paint.lineColor = attrs.line;
      paint.lineWidth = width;
      if (attrs.lineTr) paint.strokeOpacity = (100 - attrs.lineTr) / 100;
      const dashes = ShapeGeometry.dashArray(attrs.dash, edgePt, attrs.cap, width);
      if (dashes) {
        paint.dash = { length: dashes, phase: ShapeGeometry.dashPhase(attrs.dash, edgePt, attrs.cap, width) };
        if (attrs.cap) paint.lineCap = attrs.cap;
      }
      return paint;
    };
    if (!ink.line) return [contour(edgePt / 2, fillPaint())];
    const bands = ShapeGeometry.compoundBands(attrs.cmpd, edgePt);
    if (!bands) return [contour(edgePt / 2, stroked(fillPaint(), edgePt))];
    return (ink.fill ? [contour(edgePt / 2, fillPaint())] : []).concat(bands.map(band => contour(band.center, stroked({ lineJoin: 'miter' }, band.width))));
  }

  // Une ligne (js/free-frame.js : `freeLine`) : son polygone d'un seul tenant (ShapeGeometry.lineOutline : le corps du trait et ses pointes triangulaires, le même que l'éditeur découpe), rempli de la couleur du
  // trait ; une ligne à autre chose (tirets, bouts arrondis, trait composé, pointe autre que le triangle) est dessinée pièce par pièce (ShapeGeometry.lineParts). Il sort de la boîte des deux bouts (la moitié de l'épaisseur, les pointes), et pdfmake ne peint ni à gauche ni au-dessus de l'origine de son canevas : le canevas commence donc au tour
  // (`bleed`) que l'encre prend, et ses points en sont décalés d'autant. Une ligne n'a pas de texte à mettre en page.
  function lineDrawingFrom(attrs) {
    const options = {
      flip: attrs.flip, lw: FreeFrame.lineWidthOf(attrs), head: attrs.head, tail: attrs.tail, headW: attrs.headW, headLen: attrs.headLen, tailW: attrs.tailW, tailLen: attrs.tailLen, cmpd: attrs.cmpd, dash: attrs.dash, cap: attrs.cap,
    };
    const ink = ShapeGeometry.lineOutline(attrs.w, attrs.h, options);
    const shifted = p => ({ x: p[0] + ink.bleed, y: p[1] + ink.bleed });
    const opacity = attrs.lineTr ? (100 - attrs.lineTr) / 100 : 0;
    const placed = canvas => ({ canvas, absolutePosition: { x: attrs.x - ink.bleed, y: attrs.y - ink.bleed } });
    if (!ShapeGeometry.lineIsPlain(options)) {
      // Une ligne en tirets, en pointillés, à bouts arrondis, composée ou à pointe autre que le triangle : son corps est un trait ouvert par bande du trait (motif et bout de PDF), ses pointes des polygones pleins.
      const parts = ShapeGeometry.lineParts(attrs.w, attrs.h, options);
      const canvas = [];
      (parts ? parts.bands : []).forEach((band) => {
        const dashes = ShapeGeometry.dashArray(attrs.dash, options.lw, attrs.cap, band.width);
        const body = { type: 'polyline', points: [band.from, band.to].map(shifted), lineWidth: band.width, lineColor: attrs.line, lineJoin: 'miter' };
        if (attrs.cap) body.lineCap = attrs.cap;
        if (dashes) body.dash = { length: dashes, phase: ShapeGeometry.dashPhase(attrs.dash, options.lw, attrs.cap, band.width) };
        if (opacity) body.strokeOpacity = opacity;
        canvas.push(body);
      });
      (parts ? parts.heads : []).forEach((points) => {
        const head = { type: 'polyline', closePath: true, points: points.map(shifted), color: attrs.line, lineJoin: 'miter' };
        if (opacity) head.fillOpacity = opacity;
        canvas.push(head);
      });
      return placed(canvas);
    }
    const vector = { type: 'polyline', closePath: true, points: ink.points.map(shifted), color: attrs.line, lineJoin: 'miter' };
    if (opacity) vector.fillOpacity = opacity;
    return placed([vector]);
  }

  // Un cadre PIVOTÉ (data-ff-rot, js/free-frame.js) : pdfmake ne tourne ni un texte ni un dessin, mais le SVG qu'il sait peindre (svg-to-pdfkit, celui du filigrane) tourne un groupe entier, texte compris,
  // et garde le texte en texte. Le cadre devient donc un SVG de la taille de la page (la page le rogne, comme à l'écran) dont un seul groupe, tourné autour du centre de la boîte, porte le dessin du
  // cadre droit (frameVectorsOf) puis son texte. Le texte n'est pas remis en page : il est lu dans l'éditeur, mot à mot, à la place que le navigateur lui a donnée sur la boîte DROITE
  // (FreeFrame.straight), si bien que les retours à la ligne, l'alignement, le texte justifié, les exposants et les polices sont ceux de l'écran. Repris : les puces, les numéros et les cases des
  // listes de tâches, le surlignage, la barre d'une citation, le souligné, le barré, les liens (leur zone cliquable est le rectangle qui enveloppe le mot tourné) et les images (en PNG ou JPEG, à la
  // place et à la taille que l'écran leur donne : sans leur arrondi, leur bordure ni leur rotation propre). Non repris : les notes de bas de page du cadre.
  // Les images d'un cadre pivoté sont mesurées à l'écran : décodées d'abord, la hauteur `auto` de l'une suit son ratio, connu une fois l'image décodée.
  const decodeImagesOf = content => Promise.all(Array.from(content.querySelectorAll('img')).map(img => (img.decode ? img.decode().catch(() => {}) : null)));
  function rotatedFrameFrom(content, attrs) {
    const box = content.parentElement;
    // Un texte tourné d'un quart de tour (`attrs.vert`) : la boîte ne grandit pas avec lui (sa hauteur est celle du cadre) ; le texte est lu À PLAT (FreeFrame.horizontal) puis tourné de +90 ou -90 degrés
    // autour du centre du cadre, en plus de la rotation du cadre.
    const turn = attrs.vert === 'vert' ? 90 : (attrs.vert ? -90 : 0);
    return FreeFrame.horizontal(box, () => {
      const boxRect = box.getBoundingClientRect();
      const heightPt = turn ? attrs.h : Math.max(attrs.h, boxRect.height * PX_TO_PT);
      let drawing = '';
      if (frameInkOf(attrs).any) {
        drawing = ShapeGeometry.drawnByPresets(attrs.shape, attrs.adj)
          ? '<g transform="translate(' + svgNum(attrs.x) + ' ' + svgNum(attrs.y) + ') scale(1 ' + Math.round(heightPt / attrs.h * 10000) / 10000 + ')">' + presetBodyOf(attrs) + '</g>'
          : frameVectorsOf(attrs, heightPt).map(vector => vectorSvg(vector, attrs.x, attrs.y)).join('');
      }
      const centre = svgNum(attrs.x + attrs.w / 2) + ' ' + svgNum(attrs.y + heightPt / 2);
      // À plat, le texte occupe une boîte de `h` sur `w` : son coin est celui d'une boîte de même centre.
      const text = turn
        ? '<g transform="rotate(' + turn + ' ' + centre + ')">' + frameTextSvg(content, boxRect, attrs.x + attrs.w / 2 - attrs.h / 2, attrs.y + attrs.h / 2 - attrs.w / 2, { notes: true }) + '</g>'
        : frameTextSvg(content, boxRect, attrs.x, attrs.y, { notes: true });
      const body = drawing + text;
      const page = svgNum(pageWidthPt) + ' ' + svgNum(pageHeightPt);
      return {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + svgNum(pageWidthPt) + '" height="' + svgNum(pageHeightPt) + '" viewBox="0 0 ' + page + '">'
          + '<g transform="rotate(' + attrs.rot + ' ' + centre + ')">' + body + '</g></svg>',
        absolutePosition: { x: 0, y: 0 },
      };
    });
  }

  const svgNum = n => Math.round(n * 100) / 100;
  // Un texte pour un SVG : échappé (une esperluette ou un chevron ne doit pas casser le SVG, et avec lui tout l'export), sans les caractères que XML refuse (contrôles, moitiés de paire isolées).
  const svgEscaped = text => String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const svgImage = (x, y, w, h, href) => '<image x="' + svgNum(x) + '" y="' + svgNum(y) + '" width="' + svgNum(w) + '" height="' + svgNum(h) + '" preserveAspectRatio="none" xlink:href="' + href + '"/>';
  const svgRect = (x, y, w, h, color, opacity) => '<rect x="' + svgNum(x) + '" y="' + svgNum(y) + '" width="' + svgNum(w) + '" height="' + svgNum(h) + '" fill="' + color + '"' + (opacity < 1 ? ' fill-opacity="' + opacity + '"' : '') + '/>';

  // Un vecteur du canevas de pdfmake (frameVectorsOf, taskCheckboxCanvas) écrit en SVG, décalé de (dx, dy) : son fond, son trait, ses jointures en onglet comme dans le canevas.
  function vectorSvg(vector, dx, dy) {
    const stroke = vector.lineColor ? ' stroke="' + vector.lineColor + '" stroke-width="' + svgNum(vector.lineWidth || 1) + '" stroke-linejoin="miter" stroke-miterlimit="10"'
      + (vector.strokeOpacity < 1 ? ' stroke-opacity="' + svgNum(vector.strokeOpacity) + '"' : '')
      + (vector.lineCap ? ' stroke-linecap="' + vector.lineCap + '"' : '')
      + (vector.dash ? ' stroke-dasharray="' + vector.dash.length.map(svgNum).join(' ') + '"' + (vector.dash.phase ? ' stroke-dashoffset="' + svgNum(vector.dash.phase) + '"' : '') : '') : '';
    const paint = ' fill="' + (vector.color || 'none') + '"' + (vector.color && vector.fillOpacity < 1 ? ' fill-opacity="' + svgNum(vector.fillOpacity) + '"' : '') + stroke + '/>';
    if (vector.type === 'polyline') return '<' + (vector.closePath ? 'polygon' : 'polyline') + ' points="' + vector.points.map(p => svgNum(p.x + dx) + ',' + svgNum(p.y + dy)).join(' ') + '"' + paint;
    if (vector.type === 'ellipse') return '<ellipse cx="' + svgNum(vector.x + dx) + '" cy="' + svgNum(vector.y + dy) + '" rx="' + svgNum(vector.r1) + '" ry="' + svgNum(vector.r2) + '"' + paint;
    return '<rect x="' + svgNum(vector.x + dx) + '" y="' + svgNum(vector.y + dy) + '" width="' + svgNum(vector.w) + '" height="' + svgNum(vector.h) + '"' + (vector.r ? ' rx="' + svgNum(vector.r) + '"' : '') + paint;
  }

  // Une image en calque (devant ou derrière le texte, posée en absolu) : un autre bloc du PDF, que son ancrage place sur la page.
  const isLayeredImage = img => (img.getAttribute('data-layer') || 'normal') !== 'normal' && img.style.position === 'absolute';
  // La largeur, en pixels, de `text` écrit dans la police de `element` (espaces comprises).
  function textWidthPx(text, element) {
    const style = getComputedStyle(element);
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute; visibility:hidden; white-space:pre; left:0; top:0;';
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'].forEach((name) => { probe.style[name] = style[name]; });
    probe.textContent = text;
    element.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }

  // Le texte d'un cadre pivoté en SVG (voir rotatedFrameFrom), peint dans l'ordre : les fonds et la barre des citations, puis les mots, leur soulignement ou leur trait, les puces et les cases. Les mesures sont
  // celles du navigateur, en pixels depuis le coin de la boîte droite (`boxRect`), ramenées en points depuis le coin de la page (`originX`, `originY` : le coin de la boîte).
  // `options.ownLists` : le contenu est un élément de liste ou un texte dont les sous-listes sont d'autres blocs du PDF (effectParagraph) : leur texte et leurs fonds n'y sont pas repris.
  // `options.notes` : les numéros des notes de bas de page du texte sont écrits à leur place (le navigateur les dessine par un compteur CSS, absent des mots) ; `options.marker` : le numéro d'un titre numéroté,
  // écrit devant sa première ligne ; `options.flowImages` : les images du flux seules sont dessinées (celles en calque sont d'autres blocs du PDF). `options.failed` est posé à vrai quand le numéro du titre
  // n'a pas la place que le navigateur lui réserve (le dessin ne vaut rien : l'appelant garde le texte ordinaire).
  function frameTextSvg(content, boxRect, originX, originY, options) {
    const ownLists = !!(options && options.ownLists);
    const ascents = new Map();
    const toX = px => originX + (px - boxRect.left) * PX_TO_PT;
    const toY = px => originY + (px - boxRect.top) * PX_TO_PT;
    const inNestedList = node => { const list = ownLists && node.closest ? node.closest('ul, ol') : null; return !!list && content.contains(list); };
    const under = [];
    const over = [];
    content.querySelectorAll('*').forEach(element => {
      if (inNestedList(element)) return;
      const style = getComputedStyle(element);
      const fill = inkOf(style.backgroundColor);
      if (fill) (style.display === 'inline' ? Array.from(element.getClientRects()) : [element.getBoundingClientRect()]).forEach(r => under.push(svgRect(toX(r.left), toY(r.top), r.width * PX_TO_PT, r.height * PX_TO_PT, fill.color, fill.opacity)));
      // Les bordures de l'élément (la barre d'une citation, le cadre d'un encadré, les traits d'une case de tableau) : un rectangle plein par côté, de la couleur et de l'épaisseur du navigateur.
      if (style.display !== 'inline') {
        const r = element.getBoundingClientRect();
        [['Left', rr => [rr.left, rr.top, 0, rr.height]], ['Top', rr => [rr.left, rr.top, rr.width, 0]], ['Right', rr => [rr.right, rr.top, 0, rr.height]], ['Bottom', rr => [rr.left, rr.bottom, rr.width, 0]]].forEach(([side, place]) => {
          const widthPx = parseFloat(style['border' + side + 'Width']);
          const line = style['border' + side + 'Style'];
          const ink = widthPx > 0 && line !== 'none' && line !== 'hidden' ? inkOf(style['border' + side + 'Color']) : null;
          if (!ink) return;
          const [x, y, w, h] = place(r);
          const rect = side === 'Left' || side === 'Right' ? [side === 'Left' ? x : x - widthPx, y, widthPx, h] : [x, side === 'Top' ? y : y - widthPx, w, widthPx];
          under.push(svgRect(toX(rect[0]), toY(rect[1]), rect[2] * PX_TO_PT, rect[3] * PX_TO_PT, ink.color, ink.opacity));
        });
      }
    });
    // Les images, déjà en data URI PNG ou JPEG (inlineEditorImagesAsDataUri), à la place que le navigateur leur a donnée : celles du texte et en calque derrière lui avant les mots, celles en calque devant après.
    const behind = [];
    const front = [];
    content.querySelectorAll('img').forEach(img => {
      const href = img.getAttribute('src') || '';
      const r = img.getBoundingClientRect();
      if (img.hasAttribute('data-pdf-skip') || !/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(href) || !r.width || !r.height) return;
      if (options && options.flowImages && isLayeredImage(img)) return;
      (img.getAttribute('data-layer') === 'front' ? front : behind).push(svgImage(toX(r.left), toY(r.top), r.width * PX_TO_PT, r.height * PX_TO_PT, href));
    });
    const range = document.createRange();
    const firstLines = new Map();   // le point de liste → la ligne de base de sa première ligne, où se pose sa puce
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let firstText = null;
    for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      const element = textNode.parentElement;
      if (!element || inNestedList(element)) continue;
      const look = textLookOf(element, content);
      const ascentPx = ascentPxOf(element, ascents);
      const item = element.closest('li');
      textLinesOf(textNode, range).forEach(line => {
        const y = toY(line.topPx + ascentPx);
        if (item && line.words.length && !firstLines.has(item)) firstLines.set(item, y);
        if (line.words.length && !firstText) firstText = { y, left: line.left, look };
        line.words.forEach(word => over.push(wordSvg(word, look, toX, y)));
        const thickness = Math.max(0.4, look.sizePt * 0.05);
        if (look.underline) over.push(underlineSvg(toX(line.left), y + look.sizePt * 0.05, (line.right - line.left) * PX_TO_PT, thickness, look));
        if (look.strike) over.push(svgRect(toX(line.left), y - look.sizePt * 0.33 - thickness / 2, (line.right - line.left) * PX_TO_PT, thickness, look.color, 1));
      });
    }
    if (options && options.notes) {
      content.querySelectorAll('.footnote-ref-marker').forEach((marker) => {
        const r = marker.getBoundingClientRect();
        if (inNestedList(marker) || (!r.width && !r.height)) return;
        over.push(textSvg(toX(r.left), toY(r.top + ascentPxOf(marker, ascents)), String(footnoteNumberOf(marker)), textLookOf(marker, content)));
      });
    }
    if (options && options.marker && firstText) {
      // Le numéro d'un titre numéroté est un texte que le navigateur dessine avant le premier mot : sa place est celle qu'il y a réservée, à gauche de la première ligne.
      const widthPx = textWidthPx(options.marker, content);
      if (firstText.left - boxRect.left < widthPx * 0.6 && /^(left|start)$/.test(getComputedStyle(content).textAlign)) options.failed = true;
      else over.push(textSvg(toX(firstText.left - widthPx), firstText.y, options.marker.trimEnd(), firstText.look));
    }
    firstLines.forEach((y, item) => {
      if (item.parentElement.getAttribute('data-type') === 'taskList') return;
      // La puce telle que le navigateur la rend : sa couleur et sa taille sont celles du début du texte du point (js/list-markers.js, posées sur l'hôte de mesure), sinon celles du point.
      const own = getComputedStyle(item, '::marker');
      const style = getComputedStyle(item);
      const sizePt = (parseFloat(own.fontSize) || parseFloat(style.fontSize)) * PX_TO_PT;
      const marker = listMarkerFor(item);
      const markerLook = { font: 'Roboto', sizePt, color: ColorMath.parseCss(own.color || style.color) || '#000000' };
      PdfGlyphFallback.runsFor(marker.trim(), { font: 'Roboto' }).forEach(run => over.push(textSvg(toX(item.getBoundingClientRect().left) - markerWidthPt(marker, sizePt), y, run.text, markerLook, run.font)));
    });
    const taskItems = Array.from(content.querySelectorAll('ul[data-type="taskList"] > li'));
    if (content.matches('ul[data-type="taskList"] > li')) taskItems.unshift(content);
    taskItems.forEach(item => {
      const input = item.querySelector('input[type="checkbox"]');
      if (!input) return;
      const style = item.parentElement.getAttribute('data-tasklist-style') || 'accentStrike';
      const r = input.getBoundingClientRect();
      taskCheckboxCanvas(item.getAttribute('data-checked') === 'true', style).forEach(vector => over.push(vectorSvg(vector, toX(r.left) - taskBoxGeometry(style).left, toY(r.top))));
    });
    return under.concat(behind, over, front).join('');
  }

  // Un texte qui porte une ombre ou un contour des lettres (« Caractère… », js/character-format.js) : pdfmake n'a ni l'un ni l'autre dans son texte. Le paragraphe, le titre, le point de liste ou la citation qui en a est
  // donc dessiné en vectoriel (un bloc SVG de la taille de son contenu), mot par mot, à la place que le navigateur lui a donnée : les retours à la ligne, l'alignement et les polices sont ceux de l'écran, et le
  // texte reste du texte (pdf.js le relit). Sont repris dans ce dessin : les numéros des notes de bas de page (les notes elles-mêmes sont celles du bloc, en bas de page), la case d'une liste de tâches, le numéro
  // d'un titre numéroté et les images du flux. Ne sont pas repris : le trait qui coupe un point de liste ou une citation, une image en calque dans le paragraphe (qui reste un bloc à part) ou d'un format que le
  // dessin ne sait pas écrire (ces blocs gardent leur texte ordinaire, sans l'effet).
  const EFFECT_STYLE = '[style*="text-shadow"], [style*="text-stroke"]';
  function hasTextEffects(node) {
    // Seul un style en ligne les pose (la marque de « Caractère… ») : la plupart des blocs n'ont rien à mesurer.
    if (!node.matches(EFFECT_STYLE) && !node.querySelector(EFFECT_STYLE)) return false;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.nodeValue.trim() || !text.parentElement) continue;
      const effects = textEffectsOf(getComputedStyle(text.parentElement));
      if (effects.shadow || effects.stroke) return true;
    }
    return false;
  }
  const EFFECT_HOSTS = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/;
  // Le bloc pdfmake { svg, margin } du texte de `node` (voir hasTextEffects) ou null (le chemin ordinaire). `rulePart` et `headingMarkers` : ceux de textBlockFrom.
  function effectBlockFrom(node, tag, headingMarkers, rulePart) {
    if (!EFFECT_HOSTS.test(tag) || !node.isConnected || rulePart || !node.closest('.pdf-measure-host')) return null;
    if (node.querySelector('hr') || !hasTextEffects(node)) return null;
    // Les images du flux doivent être de celles que le dessin sait écrire (PNG ou JPEG en data URI, décodées) : une autre laisserait un trou.
    const images = Array.from(node.querySelectorAll('img')).filter(img => !isLayeredImage(img) && !img.hasAttribute('data-pdf-skip'));
    if (images.some(img => !/^data:image\/(png|jpe?g);base64,/.test(img.getAttribute('src') || '') || !img.complete || !img.naturalWidth || getComputedStyle(img).float !== 'none')) return null;
    const marker = headingMarkerOf(headingMarkers, node);
    const task = isTaskListItem(node);
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const px = name => parseFloat(style[name]) || 0;
    const box = { left: rect.left + px('borderLeftWidth') + px('paddingLeft'), top: rect.top + px('borderTopWidth') + px('paddingTop') };
    const widthPt = Math.max(1, (rect.width - px('borderLeftWidth') - px('paddingLeft') - px('borderRightWidth') - px('paddingRight')) * PX_TO_PT);
    // La hauteur du contenu : celle de la boîte, moins ce qui est à elle (remplissage, bord) ; pour un point de liste, jusqu'à sa première sous-liste, qui est d'autres blocs.
    const nestedList = tag === 'LI' ? node.querySelector(':scope > ul, :scope > ol') : null;
    const bottomPx = nestedList ? nestedList.getBoundingClientRect().top : rect.bottom - px('borderBottomWidth') - px('paddingBottom');
    const heightPt = Math.max(1, (bottomPx - box.top) * PX_TO_PT);
    // De la place autour pour ce que l'effet déborde (ombre, flou, contour), et à gauche pour la puce d'un point de liste, qui pend hors de sa boîte.
    let reachPt = 0;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.parentElement) continue;
      const { shadow, stroke } = textEffectsOf(getComputedStyle(text.parentElement));
      if (shadow) reachPt = Math.max(reachPt, Math.abs(shadow.dx) + shadow.blur, Math.abs(shadow.dy) + shadow.blur);
      if (stroke) reachPt = Math.max(reachPt, stroke.w);
    }
    reachPt = Math.ceil(reachPt) + 2;
    const markerPt = tag === 'LI' && !task ? markerWidthPt(listMarkerFor(node), DEFAULT_FONT_SIZE) + 2 : 0;
    const bleedLeftPt = reachPt + markerPt;
    const drawing = { ownLists: tag === 'LI', notes: true, flowImages: true, marker };
    const body = frameTextSvg(node, box, bleedLeftPt, reachPt, drawing);
    if (drawing.failed) return null;
    const totalW = widthPt + bleedLeftPt + reachPt;
    const totalH = heightPt + 2 * reachPt;
    const format = tag === 'P' || tag === 'DIV' ? ParagraphFormat.readOf(node) : null;
    const leftPt = Math.max(-1000, (box.left - flowOriginLeftPx(node)) * PX_TO_PT - (format && format.indentLeft ? format.indentLeft : 0));
    const block = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + svgNum(totalW) + '" height="' + svgNum(totalH) + '" viewBox="0 0 ' + svgNum(totalW) + ' ' + svgNum(totalH) + '">' + body + '</svg>',
      margin: [leftPt - bleedLeftPt, -reachPt, 0, -reachPt],
    };
    if (/^H[1-6]$/.test(tag)) headingFields(block, node, tag, [], marker);
    if (tag === 'LI' || tag === 'BLOCKQUOTE') applyParagraphFormat(block, node);
    return block;
  }

  // La couleur d'un fond (celle que getComputedStyle rend) et son opacité ; null quand il n'y a pas de fond (transparent).
  function inkOf(css) {
    const alpha = /^rgba\(.*,\s*([\d.]+)\s*\)$/i.exec(css || '');
    const opacity = alpha ? Math.round(parseFloat(alpha[1]) * 100) / 100 : 1;
    const color = opacity > 0 ? ColorMath.parseCss(css) : null;
    return color ? { color, opacity } : null;
  }

  // Le soulignement d'une ligne : simple, double, pointillé, tireté ou ondulé (`look.underlineStyle`, js/character-format.js).
  function underlineSvg(x, y, width, thickness, look) {
    const color = look.color;
    switch (look.underlineStyle) {
      case 'double': return svgRect(x, y, width, thickness, color, 1) + svgRect(x, y + thickness * 2, width, thickness, color, 1);
      case 'dotted':
      case 'dashed': {
        const on = look.underlineStyle === 'dotted' ? thickness : thickness * 3;
        let out = '';
        for (let at = 0; at < width && out.length < 200000; at += on * 2) out += svgRect(x + at, y, Math.min(on, width - at), thickness, color, 1);
        return out;
      }
      case 'wavy': {
        const half = thickness * 2.5;
        const amplitude = thickness * 1.2;
        const points = [];
        for (let at = 0, up = false; at <= width + half; at += half, up = !up) points.push(svgNum(x + Math.min(at, width)) + ',' + svgNum(y + thickness / 2 + (up ? -amplitude : amplitude)));
        return '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + svgNum(thickness) + '"/>';
      }
      default: return svgRect(x, y, width, thickness, color, 1);
    }
  }

  // Un texte tel que le navigateur le rend : la police (celle que le PDF embarque), la graisse, l'italique, la taille en points, la couleur, et ce qui le souligne, le barre ou le lie à une adresse
  // (hérité des éléments qui l'entourent, jusqu'à `root`).
  function textLookOf(element, root) {
    const style = getComputedStyle(element);
    const look = {
      font: pdfFontFor(style.fontFamily) || 'Roboto', bold: /bold|[6-9]00/i.test(style.fontWeight), italics: /italic|oblique/.test(style.fontStyle),
      sizePt: parseFloat(style.fontSize) * PX_TO_PT, color: ColorMath.parseCss(style.color) || '#000000', underline: false, underlineStyle: null, strike: false, link: null,
      // L'espacement des caractères et les petites capitales (js/character-format.js) : les caractères de chaque mot sont posés un à un, à la place que le navigateur leur a donnée.
      spacingPt: /px$/.test(style.letterSpacing) ? parseFloat(style.letterSpacing) * PX_TO_PT : 0, smallCaps: /small-caps/.test(style.fontVariantCaps || ''),
      // L'ombre et le contour des lettres (js/character-format.js) : { dx, dy, blur, hex, alpha } et { w, hex, alpha }, en points.
      shadow: textEffectsOf(style).shadow, stroke: textEffectsOf(style).stroke,
    };
    for (let at = element; at && at !== root; at = at.parentElement) {
      const lines = getComputedStyle(at).textDecorationLine;
      if (/underline/.test(lines) && !look.underline) { look.underline = true; look.underlineStyle = CharacterFormat.normalizedLine(getComputedStyle(at).textDecorationStyle); }
      if (/line-through/.test(lines)) look.strike = true;
      if (!look.link && at.tagName === 'A') look.link = HtmlSanitize.safeLinkHref(at.getAttribute('href'));
    }
    return look;
  }

  // La distance, en pixels, du haut du texte à sa ligne de base pour la police et la taille de `element` : le navigateur la donne en posant, après un mot, une boîte vide dont le bas est sur la ligne de base.
  function ascentPxOf(element, cache) {
    const style = getComputedStyle(element);
    const names = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariantCaps'];
    const key = names.map(name => style[name]).join('|');
    if (!cache.has(key)) {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute; visibility:hidden; left:0; top:0; white-space:pre; line-height:normal;';
      names.forEach(name => { probe.style[name] = style[name]; });
      const word = document.createElement('span');
      word.textContent = 'Hxg';
      const baseline = document.createElement('span');
      baseline.style.cssText = 'display:inline-block; width:0; height:0;';
      probe.append(word, baseline);
      document.body.appendChild(probe);
      cache.set(key, baseline.getBoundingClientRect().bottom - word.getBoundingClientRect().top);
      document.body.removeChild(probe);
    }
    return cache.get(key);
  }

  // Les lignes d'un nœud texte, d'après le rectangle que le navigateur donne à chaque caractère : { topPx, left, right, words } avec `topPx` le haut du texte de la ligne (le plus fréquent : un caractère
  // d'une police de repli est plus haut ou plus bas que les autres), `left` et `right` l'étendue de la ligne (espaces compris : le souligné les couvre), et les mots { text, left, parts } où chaque
  // `part` est un caractère et ses signes. Un caractère sans rectangle (blanc écrasé, texte caché) n'est nulle part ; un retour à la ligne au milieu d'un mot coupe le mot.
  function textLinesOf(textNode, range) {
    const value = textNode.nodeValue;
    const sameLine = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 * Math.min(a.height, b.height);
    const lines = [];
    let line = null;
    let word = null;
    for (let at = 0; at < value.length;) {
      const start = at;
      at += value.codePointAt(at) > 0xFFFF ? 2 : 1;
      const char = value.slice(start, at);
      if (word && /^[\p{M}\p{Cf}︀-️]$/u.test(char)) {
        word.text += char;
        word.parts[word.parts.length - 1].text += char;
        continue;
      }
      range.setStart(textNode, start);
      range.setEnd(textNode, at);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) { word = null; continue; }
      if (!line || !sameLine(line.ref, r)) {
        line = { ref: r, left: r.left, right: r.right, tops: new Map(), words: [] };
        lines.push(line);
        word = null;
      }
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      if (/^\s$/.test(char)) { word = null; continue; }
      const topKey = Math.round(r.top * 10);
      line.tops.set(topKey, (line.tops.get(topKey) || 0) + 1);
      if (!word) { word = { text: '', left: r.left, parts: [] }; line.words.push(word); }
      word.left = Math.min(word.left, r.left);
      word.text += char;
      word.parts.push({ text: char, left: r.left });
    }
    lines.forEach(each => {
      let best = null;
      each.tops.forEach((count, key) => { if (!best || count > best.count || (count === best.count && key < best.key)) best = { key, count }; });
      each.topPx = best ? best.key / 10 : each.ref.top;
    });
    return lines;
  }

  // Un texte en SVG, sa ligne de base en `y` ; la police est la famille du PDF (Roboto, Arimo, Tinos, Gelasio, Cousine, Carlito, PPSymbols), la graisse et l'italique sont celles de `look`.
  function textSvg(x, y, text, look, font) {
    const element = (dx, dy, fill, opacity, stroke) => '<text x="' + svgNum(x + dx) + '" y="' + svgNum(y + dy) + '" font-family="' + (font || look.font) + '" font-size="' + svgNum(look.sizePt) + '"' + (look.bold ? ' font-weight="bold"' : '')
      + (look.italics ? ' font-style="italic"' : '') + ' fill="' + fill + '"' + (opacity < 1 ? ' fill-opacity="' + svgNum(opacity) + '"' : '')
      + (stroke ? ' stroke="' + stroke.hex + '" stroke-width="' + svgNum(stroke.w) + '" stroke-linejoin="round"' + (stroke.alpha < 1 ? ' stroke-opacity="' + svgNum(stroke.alpha) + '"' : '') : '') + '>' + svgEscaped(text) + '</text>';
    return shadowCopies(look.shadow).map(copy => element(copy.dx, copy.dy, copy.hex, copy.alpha, null)).join('') + element(0, 0, look.color, 1, look.stroke);
  }
  // L'ombre d'un texte (js/character-format.js) : une copie du texte, décalée, sous lui. Le PDF n'a pas de flou de texte : une ombre floue est une copie plus pâle (un quart de moins par 10 pt de flou, au plus la moitié) ; chaque copie est
  // du texte, que la recherche et le copier-coller du PDF lisent donc deux fois.
  function shadowCopies(shadow) {
    if (!shadow) return [];
    const pale = 1 - Math.min(0.5, shadow.blur / 40);
    return [{ dx: shadow.dx, dy: shadow.dy, hex: shadow.hex, alpha: Math.round(shadow.alpha * pale * 1000) / 1000 }];
  }
  // L'ombre et le contour calculés d'un élément, en points : { shadow, stroke } (null quand il n'y en a pas).
  function textEffectsOf(style) {
    const shadow = style.textShadow && style.textShadow !== 'none' ? CharacterFormat.parseShadow(style.textShadow) : null;
    const width = parseFloat(style.webkitTextStrokeWidth) * PX_TO_PT;
    const stroke = width > 0 ? CharacterFormat.parseStroke(width + 'pt ' + style.webkitTextStrokeColor) : null;
    return { shadow, stroke };
  }

  // Un mot posé là où le navigateur l'a mis : d'un seul tenant, sauf quand sa police n'a pas tous ses caractères (le repli de js/pdf-glyph-fallback.js, comme partout dans le PDF) : chaque
  // caractère est alors posé à sa place. Un mot d'un lien est enveloppé du lien.
  function wordSvg(word, look, toX, y) {
    const style = { font: look.font, bold: look.bold, italics: look.italics };
    const needsFallback = !!PdfGlyphFallback.split(word.text, style);
    // Un mot espacé ou en petites capitales : chaque caractère à sa place (celle du navigateur) ; en petites capitales, une minuscule devient une majuscule à 70 % de la taille.
    const small = look.smallCaps ? Object.assign({}, look, { sizePt: look.sizePt * CharacterFormat.SMALL_CAPS_RATIO }) : null;
    const charSvg = (part, run) => {
      const lower = !!small && run.text !== run.text.toLocaleUpperCase() && run.text === run.text.toLocaleLowerCase();
      return textSvg(toX(part.left), y, lower ? run.text.toLocaleUpperCase() : run.text, lower ? small : look, run.font);
    };
    const pieces = needsFallback || small || look.spacingPt
      ? word.parts.map(part => PdfGlyphFallback.runsFor(part.text, style).map(run => charSvg(part, run)).join(''))
      : [textSvg(toX(word.left), y, word.text, look)];
    const out = pieces.join('');
    return look.link ? '<a xlink:href="' + svgEscaped(look.link) + '">' + out + '</a>' : out;
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
      gapRuns.forEach(r => { if (!r._tabGap) r.characterSpacing = (r.characterSpacing || 0) + extraPt; });
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
    // Dans l'en-tête ou le pied, aucune passe ne mesure la mise en page de pdfmake après coup : le contenu d'une zone part toujours du même point de la page,
    // la place de l'image est donc celle que le navigateur lui donne dans la zone (zoneFloatsFrom).
    const zoneRoot = node.closest('[data-hf-zone]');
    if (zoneRoot) {
      const zoneRect = zoneRoot.getBoundingClientRect();
      anchor._floatOverlay.zonePx = { left: imgRect.left - zoneRect.left, top: imgRect.top - zoneRect.top };
    }
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

  // Ajoute `pt` à gauche d'un bloc pdfmake, quelle que soit la forme de sa marge (absente, nombre, [horizontal, vertical] ou [gauche, haut, droite, bas]).
  function addLeftMargin(block, pt) {
    const m = block.margin;
    if (Array.isArray(m) && m.length === 4) block.margin = [m[0] + pt, m[1], m[2], m[3]];
    else if (Array.isArray(m) && m.length === 2) block.margin = [m[0] + pt, m[1], m[0], m[1]];
    else if (typeof m === 'number') block.margin = [m + pt, m, m, m];
    else block.margin = [pt, 0, 0, 0];
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
    if (tag === 'HR') return [ruleBlock(pageBreakBefore, availableWidthPt)];
    if (tag === 'PRE') return [codeBlockFrom(node, pageBreakBefore)];
    const ctx = { node, tag, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry };
    if (RULE_HOSTS.test(tag) && (hasRuleChild(node) || ExportCommon.hasTableChild(node) || hasQuoteChild(node) || hasQuoteListChild(node))) return ruleSplitBlocks(ctx);
    const blocks = isFlowText(node, tag, headingMarkers) ? flowTextBlocks(ctx) : ordinaryBlocks(ctx, blockRunsOf(node, tag));
    // Le réglage « Paragraphe… » d'un paragraphe vaut pour tous ses blocs (le texte, les images qu'il porte, le texte à côté d'une image). Un élément de liste et une citation, dont
    // les blocs suivants sont ceux de leurs sous-listes, le posent sur leur seul bloc de texte (textBlockFrom).
    return tag === 'P' ? applyParagraphFormat(blocks, node) : blocks;
  }

  // L'interligne, les espaces et les retraits réglés par « Paragraphe… » (js/paragraph-format.js) sur le paragraphe, l'élément de liste ou la citation `node`, posés sur ses blocs pdfmake
  // (`blocks` : un bloc ou un tableau, rendu tel quel). L'interligne remplace celui de l'éditeur (le facteur CSS réglé, divisé par l'interligne natif de Roboto comme LINE_HEIGHT_RATIO) ;
  // l'espace avant s'ajoute au-dessus du premier bloc du flux, l'espace après sous le dernier (pdfmake additionne les marges, comme l'éditeur additionne les remplissages). Le retrait à
  // gauche est la marge gauche de chaque bloc du paragraphe ; celui de la première ligne est le `leadingIndent` de pdfmake sur son premier bloc de texte (négatif : la ligne sort à gauche
  // de la marge, comme une puce). `part` : le morceau d'un élément de liste ou d'une citation que coupe un trait - l'espace avant va au premier morceau, l'espace après au dernier (ni l'un
  // ni l'autre n'a de retrait : ParagraphFormat.readOf les lui refuse).
  function applyParagraphFormat(blocks, node, part) {
    const format = ParagraphFormat.readOf(node);
    if (!format) return blocks;
    const flow = (Array.isArray(blocks) ? blocks : [blocks]).filter(block => block && typeof block === 'object' && !block._pendingImgNode && !block.absolutePosition);
    if (!flow.length) return blocks;
    if (format.lineHeight != null) flow.forEach(block => retuneLineHeight(block, format.lineHeight / PDFMAKE_DEFAULT_LINE_RATIO, true));
    if (format.spaceBefore && !(part && part.continued)) addTopMargin(flow[0], format.spaceBefore);
    if (format.spaceAfter && !(part && part.beforeRule)) addBottomMargin(flow[flow.length - 1], format.spaceAfter);
    if (format.indentLeft) flow.forEach(block => addLeftMargin(block, format.indentLeft));
    if (format.indentFirst) {
      const textBlock = flow.find(block => block.text !== undefined);
      if (textBlock) textBlock.leadingIndent = format.indentFirst;
    }
    return blocks;
  }

  // L'interligne d'un bloc de texte et de ce qu'il contient : le bloc prend `ratio` (les blocs sans interligne propre, comme le texte d'une case, en héritent), les colonnes et piles
  // dedans qui ont celui d'origine le prennent aussi (la puce et le texte d'un élément de liste restent alignés) ; un autre interligne (du code) reste.
  function retuneLineHeight(block, ratio, isRoot) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return;
    if (isRoot ? (block.text !== undefined || block.columns || block.stack) : block.lineHeight === LINE_HEIGHT_RATIO) block.lineHeight = ratio;
    ['columns', 'stack'].forEach((key) => { if (Array.isArray(block[key])) block[key].forEach(child => retuneLineHeight(child, ratio, false)); });
  }

  // Le trait (<hr>) : 15,75 pt de haut (21 px, comme dans l'éditeur, la Lecture et l'impression : 10 px d'air, 1 px de trait, 10 px d'air), le trait au milieu. Un canvas
  // prend la hauteur de son vecteur le plus bas : le polyligne d'un seul point, au bas du bloc, ne peint rien (un tracé sans segment) mais donne au bloc sa
  // hauteur entière, si bien que pdfmake le passe à la page suivante quand il ne tient pas en entier, comme la pagination de l'éditeur qui additionne des
  // blocs entiers. Avec des marges, le trait resterait sur la page dès que sa marge haute y tient.
  // Sa longueur est la largeur de ce qui le contient, comme dans l'éditeur où le trait tient toute la largeur de sa page, de sa colonne, de sa case, de son
  // élément de liste ou de sa citation : `widthPt` (la page entière quand on n'en donne pas), `leftPt` le retrait du bloc qui le contient.
  const RULE_HEIGHT_PT = 15.75;
  function ruleBlock(pageBreakBefore, widthPt, leftPt) {
    const lengthPt = widthPt == null ? CONTENT_WIDTH_PT : Math.max(1, widthPt);
    return {
      canvas: [
        { type: 'line', x1: 0, y1: RULE_HEIGHT_PT / 2, x2: lengthPt, y2: RULE_HEIGHT_PT / 2, lineWidth: 1 },
        { type: 'polyline', points: [{ x: 0, y: RULE_HEIGHT_PT }] },
      ],
      ...(leftPt > 0.01 ? { margin: [leftPt, 0, 0, 0] } : {}),
      ...(pageBreakBefore ? { pageBreak: 'before' } : {}),
    };
  }

  // Un <li> ou une citation que traverse un trait (un <hr>, enfant direct) : le navigateur pose le trait entre ses paragraphes, le texte d'un côté et de
  // l'autre. Le PDF lit le texte de tout le bloc d'un seul tenant : il le coupe donc au trait, en trois blocs (le texte d'avant avec la puce, le trait
  // à la largeur qui reste, le texte d'après sans puce). Une citation garde ses marges de dessus et de dessous aux deux bouts seulement : à l'intérieur,
  // le trait touche le texte, comme dans l'éditeur. Un tableau (le bouton Tableau le pose dans l'item ou la citation où se trouve le curseur) coupe de même :
  // lu comme du texte, il perdait ses cases (« Un itemL1AL1BL2A »). Une citation posée dans l'item ou dans une autre citation coupe encore : elle est
  // ses propres blocs (italique, retrait et trait mesurés sur elle), jamais le texte de son hôte - lue d'un seul tenant avec lui, sa première ligne se
  // collait à la dernière de l'item (« AlphaBeta ») et son trait ne se dessinait pas.
  const RULE_HOSTS = /^(LI|BLOCKQUOTE)$/;
  const hasRuleChild = node => Array.from(node.children).some(child => child.tagName === 'HR');
  const hasQuoteChild = node => Array.from(node.children).some(child => child.tagName === 'BLOCKQUOTE');
  // Une liste posée dans une citation (jamais dans un <li> : la sous-liste d'un item est déjà ses propres blocs, cf. nestedLists).
  // Le retrait d'un bloc de texte : le bord de la boîte d'un <li>, le premier caractère d'un paragraphe ou d'une citation - le bord de CONTENU de la citation
  // quand elle porte une liste, dont le premier caractère est celui de la liste, plus à droite.
  const quoteIndentMode = (node, tag) => (tag === 'LI' ? 'box' : (hasQuoteListChild(node) ? 'content' : 'text'));
  const hasQuoteListChild = node => node.tagName === 'BLOCKQUOTE' && Array.from(node.children).some(child => /^(UL|OL)$/.test(child.tagName));

  // Les enfants d'un nœud rangés par morceaux, un nouveau morceau après chaque trait. Avec `breaks`, après chaque tableau et chaque citation aussi : ce qui a
  // coupé (le trait, le tableau ou la citation) y est rangé, dans l'ordre, `breaks[i]` entre le morceau i et le suivant.
  function ruleSegmentsOf(node, breaks) {
    const segments = [[]];
    node.childNodes.forEach(child => {
      const isBreak = child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'HR' || (breaks && (/^(TABLE|BLOCKQUOTE)$/.test(child.tagName) || (node.tagName === 'BLOCKQUOTE' && /^(UL|OL)$/.test(child.tagName)))));
      if (isBreak) { segments.push([]); if (breaks) breaks.push(child); }
      else segments[segments.length - 1].push(child);
    });
    return segments;
  }

  // Un morceau où il y a quelque chose : un élément (même un paragraphe vide, qui garde sa ligne) ou du texte ; pas le vide d'un trait en fin de bloc.
  const segmentHasContent = nodes => nodes.some(n => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()));

  function ruleSplitBlocks(ctx) {
    const { node, tag, availableWidthPt } = ctx;
    const style = inheritedStyle(node, { fontSize: DEFAULT_FONT_SIZE });
    const indentPt = measureIndentPt(node, quoteIndentMode(node, tag));
    const rulePt = (availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT) - indentPt;
    const breaks = [];
    const segments = ruleSegmentsOf(node, breaks);
    const lastSegment = segments.length - 1;
    const blocks = [];
    // Le tableau prend le retrait de l'item ou de la citation, mesuré sur lui, sur la largeur de la page (une page ne s'ouvre pas dans un item : PAGE_FLOW_BREAKERS).
    // La citation fait ses blocs à elle, comme une sous-liste : son retrait est mesuré sur son texte, son trait coupe à son tour.
    const breakBlocks = el => {
      if (el.tagName === 'TABLE') return tableBlocksFrom(el, false, ctx.rootRect, availableWidthPt == null, 0, measureIndentPt(el, 'box'));
      if (el.tagName === 'BLOCKQUOTE') return blockFrom(el, false, ctx.headingMarkers, availableWidthPt, ctx.rootRect);
      // Une liste de citation : un bloc par élément (puce, retrait et trait de l'élément, mesurés sur lui), en italique comme le reste de la citation.
      if (/^(UL|OL)$/.test(el.tagName)) {
        return Array.from(el.children).filter(c => c.tagName === 'LI').flatMap(li => blockFrom(li, false, ctx.headingMarkers, availableWidthPt, ctx.rootRect))
          .map(b => (b.text !== undefined || b.columns ? Object.assign(b, { italics: true }) : b));
      }
      return [ruleBlock(false, rulePt, indentPt)];
    };
    segments.forEach((children, i) => {
      if (i > 0) breakBlocks(breaks[i - 1]).forEach(b => blocks.push(b));
      // Rien avant ou après un trait : pas de ligne vide. Un <li> garde son premier morceau, qui porte la puce.
      if (!segmentHasContent(children) && (i > 0 || tag !== 'LI')) return;
      const images = [];
      const isList = child => child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName);
      const nestedLists = tag === 'LI' ? children.filter(isList) : [];
      const rawRuns = runsOfNodes(children, style, images, nestedLists.length ? isList : null);
      const part = { continued: i > 0, beforeRule: i < lastSegment };
      ordinaryBlocks({ ...ctx, pageBreakBefore: i === 0 && ctx.pageBreakBefore, rulePart: part }, { rawRuns, images, nestedLists }).forEach(b => blocks.push(b));
    });
    // Les marges de dessus et de dessous de la citation, quand son premier ou son dernier bloc n'est pas un texte qui les porte déjà (textBlockFrom) : un trait,
    // un élément de liste.
    if (tag === 'BLOCKQUOTE' && blocks.length) {
      const first = blocks[0]; const last = blocks[blocks.length - 1];
      if (first.canvas || !(first.italics && first.margin && first.margin[1] === 4)) addTopMargin(first, 4);
      if (last.canvas || !(last.italics && last.margin && last.margin[3] === 4)) addBottomMargin(last, 4);
    }
    if (ctx.pageBreakBefore && blocks.length && !blocks[0].pageBreak) blocks[0].pageBreak = 'before';
    return blocks;
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
    if (runs.rawRuns.some(r => r._imageMarker)) return effectImageBlocks(ctx, runs) || asHeading(imageParagraphBlocks(ctx, runs));
    // Un paragraphe où le navigateur ouvre une ligne par « : » (ou un signe voisin) : une ligne du navigateur par bloc, pdfmake ne coupe pas avant ce
    // signe.
    const signLines = hasTextEffects(node) ? null : signLineBlocksFrom(node, pageBreakBefore, { nested: availableWidthPt != null });
    return signLines ? asHeading(signLines) : ordinaryBlocks(ctx, runs);
  }

  // Un paragraphe ou un titre à ombre ou à contour des lettres (effectBlockFrom) qui porte une image dans le texte : son dessin vectoriel, images du flux comprises, puis les images en calque, qui restent des blocs
  // à part ; `null` : le chemin des images (imageParagraphBlocks), sans l'effet.
  function effectImageBlocks(ctx, { images }) {
    const { node, tag, pageBreakBefore, headingMarkers, rulePart } = ctx;
    if (images.some(img => img._floatAlign)) return null;
    const block = effectBlockFrom(node, tag, headingMarkers, rulePart);
    if (!block) return null;
    if (pageBreakBefore) block.pageBreak = 'before';
    return [block].concat(images.filter(img => img._pendingImgNode));
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
    const effect = effectBlockFrom(node, tag, headingMarkers, ctx.rulePart);
    const block = effect || textBlockFrom(node, tag, runs, headingMarkers, ctx.rulePart);
    // Le dessin d'un texte à effet porte déjà ses images du flux : seules celles en calque restent des blocs à part.
    if (effect) images = images.filter(img => img._pendingImgNode);
    const blocks = [];
    // La suite d'un item après un trait ou un tableau qui ne porte que sa sous-liste n'a pas de ligne à elle : la sous-liste suit le trait ou le tableau.
    const listOnlyTail = ctx.rulePart && ctx.rulePart.continued && !runs.length && !images.length && nestedLists.length;
    // Un bloc sans texte qui ne contient qu'une image dans le flux n'a pas besoin du bloc-texte de repli `text: ' '` : l'image fait sa hauteur, et le
    // pousser quand même décalerait tout le contenu suivant (et l'ancrage des images voisines, cf. resolvePendingImageAnchors). Celui qui ne porte
    // que des images en calque garde sa ligne (cf. imageParagraphBlocks).
    if (!listOnlyTail && (runs.length || !images.length || images.every(img => img._pendingImgNode))) {
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

  // Le bloc de texte d'un paragraphe, d'un titre, d'un élément de liste ou d'une citation. `rulePart` : le morceau d'un <li> ou d'une citation que coupe un
  // trait (ruleSplitBlocks) ; `continued` : celui d'après le trait, sans puce ni marge de dessus, `beforeRule` : celui d'avant, sans marge de dessous.
  function textBlockFrom(node, tag, runs, headingMarkers, rulePart) {
    const isHeading = /^H[1-6]$/.test(tag);
    const indentPt = measureIndentPt(node, isHeading ? 'box' : quoteIndentMode(node, tag));
    // Marge verticale nulle entre blocs (mesuré : .tiptap p/h1-6/li/ol/ul { margin: 0 }) - une marge fictive ici dériverait de la vraie mise en page.
    // Marge droite = spaceWidthPt() : compense white-space:break-spaces.
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node);
    if (align) block.alignment = align;
    // Une légende vide garde sa hauteur de petite ligne, comme dans l'éditeur (le bloc de repli `text: ' '` n'a aucun run qui porte la taille).
    if (!runs.length && tag === 'P' && node.hasAttribute('data-caption')) block.fontSize = Caption.SIZE_PT;
    if (isHeading) headingFields(block, node, tag, runs, headingMarkerOf(headingMarkers, node));
    const { continued, beforeRule } = rulePart || {};
    if (tag === 'LI' && !continued) listItemFields(block, node, runs, align);
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, continued ? 0 : 4, spaceWidthPt(), beforeRule ? 0 : 4]; }
    if (tag === 'LI' || tag === 'BLOCKQUOTE') applyParagraphFormat(block, node, rulePart);
    return block;
  }

  function headingFields(block, node, tag, runs, marker) {
    block.bold = true;
    if (marker && runs.length) block.text = [{ text: marker, fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }].concat(runs);
    block._isHeading = true;
    block._headingLevel = parseInt(tag.slice(1), 10);
    block._headingText = (marker + (node.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  // La rangée de colonnes d'un point de liste (marqueur ou case, puis texte) est mise dans une autre, sans marge : à un saut de page au milieu de la rangée, pdfmake
  // 0.2.7 remet la largeur disponible du conteneur de premier niveau à celle de la page (initializePage), puis le retrait que le bloc rend en sortant s'y ajoute : tout ce
  // qui suit sortirait à droite de la page de cette marge. La marge de la rangée intérieure est restituée par son propre instantané, que la remise à zéro ne touche pas.
  function marginFreeRow(block, row, leftPt) {
    delete block.text;
    delete block.alignment; // porté sur la colonne de texte, cf. listMarkerColumns et taskListColumns
    block.columns = [{ width: '*', columns: row, margin: [leftPt, 0, 0, 0] }];
    block.margin = [0, 0, 0, 0];
  }

  function listItemFields(block, node, runs, align) {
    if (isTaskListItem(node)) {
      marginFreeRow(block, taskListColumns(node, taskListRuns(node, runs), align), block.margin[0]);
    } else if (runs.length && align && align !== 'left') {
      const marker = listMarkerFor(node);
      const look = markerLookOf(node);
      marginFreeRow(block, listMarkerColumns(marker, runs, align, look), block.margin[0] - markerWidthPt(marker, look.sizePt));
    } else {
      block.text = runs.length ? listMarkerRuns(listMarkerFor(node), markerLookOf(node)).concat(runs) : ' ';
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
      wholeCandidates = [];
      headingDestinationCount = 0;
      anchorElements = anchorElementsOf(root);
      markerWidths.clear();
    }
    const st = contentStateFor(root, headingMarkers, availableWidthPt, isTopLevel, opts);
    for (const child of Array.from(root.childNodes)) { await visitNode(st, child); }
    closeKeepRun(st, st.keepRun);
    st.keepRun = null;
    fillTocBlocks(st.tocBlocks, st.headingBlocks);
    growForOverflowingFloat(st, opts);
    return contentFrom(st);
  }

  // L'état d'une construction de contenu : ce que visitNode lit et remplit en parcourant le HTML.
  function contentStateFor(root, headingMarkers, availableWidthPt, isTopLevel, opts) {
    return {
      isTopLevel, headingMarkers, availableWidthPt,
      // Les paragraphes de plusieurs lignes se gardent d'une pièce (markWhole) : au premier niveau et dans une colonne de zone (`opts.keepWhole`).
      keepWhole: isTopLevel || !!(opts && opts.keepWhole),
      rootRect: root.getBoundingClientRect(),
      // Les blocs, et en parallèle le nœud DOM de premier niveau source de chaque entrée (il ne sert qu'à mesurer la position rendue des blocs voisins
      // d'une image en calque : résolution d'ancrage) et son slot (null hors macro-modèle : une image sans position de page n'est encadrée que par les
      // blocs de son slot).
      blocks: [], sourceNodes: [], blockSlots: [],
      headingBlocks: [], tocBlocks: [], footnoteBlocks: [],
      // Les cadres de texte libres (visitFrame) : chacun avec sa marque dans `blocks`, qui dit sur quelle page le peindre.
      frames: [],
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
      // Macro-modèle dont les modèles n'ont pas tous le même sens de page (js/page-sections.js) : le sens de la page où le dernier bloc est tombé, et celui que
      // le saut de page en attente demande à la page suivante (null : elle garde le sien). Le premier bloc de la section qui tourne la porte (pushBlock).
      pageSense: pageOrientation, pendingSense: null,
      // La page de la section en cours (`{ orientation, format }`, visitSection) : chaque bloc de premier niveau la porte (`_page`, pushBlock), de quoi ranger les blocs en suites de pages de même
      // format (runsOf) quand le macro-modèle mêle des formats (une diapositive au milieu de pages A4). Nulle hors section. `breakPage` : celle de la section où le dernier saut de page a été lu,
      // la page de la page blanche que laisse un second saut de suite (visitPageBreak).
      sectionPage: null, breakPage: null,
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
    if (st.pendingSense && turnPage(block, st.pendingSense)) { st.pageSense = st.pendingSense; st.pendingSense = null; }
    if (st.sectionPage && block && typeof block === 'object') block._page = st.sectionPage;
    st.blocks.push(block); st.sourceNodes.push(node); st.blockSlots.push(st.currentSlot);
  }

  // Le sens de la page que ce bloc ouvre : pdfmake lit `pageOrientation` sur le nœud qui porte le `pageBreak: 'before'`, le bloc lui-même ou, quand le
  // saut est posé sur son premier enfant (une pile, des colonnes, une liste, un tableau), celui-là. Rend vrai quand un nœud l'a reçu ; un bloc sans saut
  // (une image en calque, qui laisse le saut au bloc suivant) ne le reçoit pas.
  function turnPage(node, sense) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(child => turnPage(child, sense));
    if (node.pageBreak === 'before') { node.pageOrientation = sense; return true; }
    return ['stack', 'columns', 'ul', 'ol'].some(key => node[key] && turnPage(node[key], sense)) || !!(node.table && Array.isArray(node.table.body) && turnPage(node.table.body, sense));
  }

  // Un bloc ne porte qu'un `id` : une seconde paire qui part du même bloc (un paragraphe gardé qui porte une image et sa légende) se range sous la
  // première (`more`). Un bloc qui porte déjà une destination (le signet d'un paragraphe gardé avec le suivant, placeAnchor) la garde : la règle retrouve la paire par
  // cet `id` (`startId`), et un lien vers le signet n'en perd pas son nom.
  function claimKeepId(st, pair) {
    const { captionPairs } = st;
    const held = typeof pair.start.id === 'string' ? pair.start.id : null;
    const own = held ? captionPairs.find(p => p.startId === held) : null;
    if (own) { own.more = (own.more || []).concat(pair); return; }
    if (!held) pair.start.id = CAPTION_KEEP_ID + captionPairs.length;
    pair.startId = pair.start.id;
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
    if (classes.contains(SECTION_CLASS)) { await visitSection(st, node, run); return; }
    if (classes.contains('page-break-marker')) { visitPageBreak(st, node, run); return; }
    if (classes.contains('heading-numbering-config')) { st.keepRun = run; return; }
    if (classes.contains('toc-marker')) { visitToc(st, node, run); return; }
    // Pas de branche dédiée pour un <table> : le HTML sérialisé (Editor.getHTML()) ne porte jamais le wrapper de défilement ajouté en édition live,
    // un <table> y est donc un enfant direct, déjà couvert par isBlock()/blockFrom().
    if (classes.contains('two-columns-zone')) { await visitZone(st, node, run); return; }
    if (classes.contains('callout')) { await visitCallout(st, node, run); return; }
    if (classes.contains(FRAME_CLASS)) { await visitFrame(st, node, run); return; }
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

  // L'enveloppe d'une section dans l'hôte de mesure (htmlToPdfContent, visitSection).
  const SECTION_CLASS = 'pdf-section';

  // La page blanche que laisse un second saut de page de suite (comme dans l'éditeur et la Lecture) : une ligne vide qui ouvre la page, le second saut restant au bloc suivant.
  // `_blankPage` : cette page-là est voulue, le repérage des pages blanches du PDF fini (blankPagesOf) ne la signale pas.
  const blankPageBlock = () => ({ text: ' ', margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, pageBreak: 'before', _blankPage: true });

  function visitPageBreak(st, node, run) {
    closeKeepRun(st, run);
    if (st.isTopLevel && st.pendingPageBreak) {
      const blank = blankPageBlock();
      pushBlock(st, blank, node);
      // Cette page blanche est celle du modèle dont le saut l'a ouverte (un modèle vide, une diapositive vide), pas du modèle qui suit : sa page est celle de la section où le premier saut a été lu.
      if (st.breakPage) blank._page = st.breakPage;
    }
    st.pendingPageBreak = true;
    st.breakPage = st.sectionPage;
    st.floatCarry = null;
    if (st.isTopLevel && node.hasAttribute('data-macro-slot')) { st.currentSlot = st.pendingSlotStart = node.getAttribute('data-macro-slot'); }
    // Le sens de la page qui s'ouvre (macro-modèle aux modèles de sens mêlés) : posé sur le premier bloc de cette page seulement s'il tourne.
    const sense = st.isTopLevel ? PageSections.senseOf(node) : null;
    if (sense) st.pendingSense = sense !== st.pageSense ? sense : null;
  }

  // Une section d'un document dont les modèles n'ont pas tous la même page (js/page-sections.js) : ses nœuds, mesurés dans la largeur de SA page
  // (htmlToPdfContent a posé une enveloppe de cette largeur autour d'eux). Le sens et le format de la section règlent les variables de page du module le temps de la
  // parcourir ; la page de pdfmake tourne avec le saut de page qui l'ouvre (visitPageBreak, pushBlock), et chaque bloc porte la page de sa section (`sectionPage`).
  async function visitSection(st, node, run) {
    closeKeepRun(st, run);
    applyPage({ orientation: node.getAttribute(PageSections.ATTR), format: PageSections.formatOf(node) });
    st.sectionPage = modulePage();
    for (const child of Array.from(node.childNodes)) { await visitNode(st, child); }
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

  // Un cadre de texte libre (js/free-frame.js) : une boîte posée à sa place sur la page, sans place dans le flux. Au premier niveau, le flux n'en garde qu'une MARQUE (une espace en position
  // absolue, qui porte aussi le saut de page de la diapositive) et le cadre, construit ici, attend dans `st.frames` : la passe de mesure donne à la marque sa page, et le cadre se peint à sa place
  // sur cette page, devant le texte ou, réglé « Derrière le texte » (`behind`, comme le fond de la diapositive), derrière lui (placeFrames). Ailleurs qu'au premier niveau (HTML venu d'ailleurs :
  // un cadre dans une colonne ou un encadré), le texte du cadre reste dans le flux, comme du texte.
  async function visitFrame(st, node, run) {
    st.keepRun = run;
    const content = node.querySelector(FRAME_CONTENT_SELECTOR);
    if (!content) return;
    if (!st.isTopLevel) {
      for (const child of Array.from(content.childNodes)) { await visitNode(st, child); }
      return;
    }
    const footnoteCheckpoint = footnoteEntries.length;
    const frame = await frameFrom(node, content);
    const marker = { text: ' ', fontSize: 1, absolutePosition: { x: 0, y: 1 }, _frameMarker: true, ...(st.pendingPageBreak ? { pageBreak: 'before' } : {}) };
    pushBlock(st, marker, node);
    st.frames.push({ marker, node: frame, behind: node.hasAttribute(FreeFrame.BACKGROUND_ATTR) || FreeFrame.measuresOf(node).layer === FreeFrame.LAYER_BEHIND });
    if (footnoteEntries.length > footnoteCheckpoint) st.footnoteBlocks.push(...footnoteEntries.slice(footnoteCheckpoint).map(fe => ({ block: marker, number: fe.number, text: fe.text })));
    st.pendingPageBreak = false;
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
    if (anchorElements.size) placeAnchor(node, produced);
    st.floatCarry = (produced && produced._floatCarry) || null;
    const nodeRect = node.getBoundingClientRect();
    spaceBelowCarriedFloat(st, nodeRect, produced, carriedFloat);
    st.lastBlockBottomPx = nodeRect.bottom;
    const newFootnotes = footnoteEntries.length > footnoteCheckpoint ? footnoteEntries.slice(footnoteCheckpoint) : null;
    pushProduced(st, node, produced, newFootnotes);
    const nodePt = nodeRect.height * PX_TO_PT;
    updateKeepRun(st, node, produced, run, { keepable, captions, captionPt, nodePt });
    if (keepable) trackCaption(st, node, produced, owner, captions, captionPt);
    markWhole(st, node, produced, { alone: !run && !captions.length && !carriedFloat, nodePt });
  }

  // Un paragraphe de plusieurs lignes que l'éditeur, la Lecture et l'impression passent en entier sur la page suivante quand il ne tient pas dans ce
  // qui reste de la page (un bloc de texte n'y est jamais coupé entre deux lignes), alors que pdfmake le coupe là où la page finit. Le candidat : un
  // paragraphe ou une citation qui donne UN bloc de texte, plus haut qu'une ligne et demie et qui tient dans une page (TablePageCut.MAX_ROW_RATIO, le
  // plafond des lignes de tableau et des suites gardées : au-delà, rien ne garde le bloc, il se coupe comme avant). Pas un bloc qui a un rôle de plus : un
  // habillage d'image, une légende, une suite « Garder avec le suivant » ou ce qui la ferme (captionKeepRule lit leurs positions). Une note, elle, suit
  // son paragraphe sur la page où il est posé. Les candidats ne sont retenus qu'en fin de construction (settleWholeBlocks), quand on sait lesquels
  // servent d'ancre à une image.
  const WHOLE_TAGS = /^(P|BLOCKQUOTE)$/;
  function markWhole(st, node, produced, { alone, nodePt }) {
    if (!st.keepWhole || !(tablePageHeightPt > 0) || !alone || !WHOLE_TAGS.test(node.tagName) || produced.length !== 1 || produced._floatCarry || produced._carried) return;
    const block = produced[0];
    if (!block || block.text === undefined || block._pendingImgNode || block.absolutePosition || block._floatOverlay || block._stretch) return;
    if (KeepWithNext.isKeptElement(node) || Caption.isCaptionElement(node)) return;
    if (nodePt < 1.5 * DEFAULT_FONT_SIZE * EDITOR_LINE_HEIGHT_RATIO || nodePt > TablePageCut.MAX_ROW_RATIO * tablePageHeightPt) return;
    wholeCandidates.push(block);
  }

  // Les candidats que le PDF garde d'une pièce, rendus par `content._wholeBlocks` : tous sauf ceux qu'une image en calque prend pour ancre (le haut de
  // l'ancre, mesuré par pdfmake, doit être celui où elle se pose vraiment), eux et ce qu'ils contiennent. `unbreakable` : pdfmake met le bloc en page
  // à part et ne le range que s'il tient dans ce qui reste de la page, sinon sur la suivante, sans remettre le document en page (un rappel
  // `pageBreakBefore` par paragraphe à cheval le ferait, une fois chacun). Il garde alors les positions notées au moment où il ne tenait pas : sa page
  // n'est lue que par la mesure (giveWholeIds la lui fait corriger), son haut par personne.
  function settleWholeBlocks(content) {
    const anchors = new Set();
    const collect = node => {
      if (!node || typeof node !== 'object' || anchors.has(node)) return;
      anchors.add(node);
      if (Array.isArray(node)) { node.forEach(collect); return; }
      ['stack', 'columns', 'ul', 'ol'].forEach(key => collect(node[key]));
      if (node.table && Array.isArray(node.table.body)) node.table.body.forEach(collect);
    };
    (content._pendingImages || []).forEach(p => { collect(p.above); collect(p.below); collect(p.container); });
    const kept = wholeCandidates.filter(block => !anchors.has(block));
    kept.forEach(block => { block.unbreakable = true; });
    wholeCandidates = [];
    return kept;
  }

  // Avant une mesure : un `id` sur chaque bloc gardé d'une pièce. pdfmake corrige alors la page notée du bloc quand il le passe à la page suivante
  // (elementWriter.addFragment, pour un texte qui a un `id`) ; sans lui, `blockPageNumbers` (measuredLayoutOf) garderait la page où il ne tenait pas, et
  // une image à position de page se poserait à côté de lui sur la mauvaise. Pas dans le PDF rendu, que le contenu reconstruit après la mesure
  // n'a plus : un `id` y ferait inscrire une destination de plus par paragraphe, soit près de 10 % de poids.
  const WHOLE_ID = 'pp-whole-';
  function giveWholeIds(content) {
    (content._wholeBlocks || []).forEach((block, i) => { if (!block.id) block.id = WHOLE_ID + i; });
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
    content._frames = st.frames;
    content._stretchedBlocks = stretchedBlocks;
    // Repli : images en calque laissées à leur placeholder plutôt que de faire échouer tout l'export si l'ancrage échoue.
    try { content._pendingImages = resolvePendingImageAnchors(st.rootRect, blocks, st.sourceNodes, st.blockSlots).concat(st.nestedPendingAll); }
    catch (e) { console.warn('[PdfExport] ancrage des images en calque ignoré :', e); content._pendingImages = st.nestedPendingAll; }
    if (st.isTopLevel) content._wholeBlocks = settleWholeBlocks(content);
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
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i], slot: blockSlots[i] })).filter(({ block, node }) => block && !block._pendingImgNode && !block._frameMarker && !pendingHostNodes.has(node));
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
    const children = topLevelElements(root);
    if (!children.some(child => child.matches('.page-break-marker[data-macro-slot]'))) return;
    let slot = null;
    let shiftPx = 0;
    children.forEach(child => {
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
    // Une colonne de zone à deux colonnes : ses tableaux se règlent sur sa largeur (columnWidthsPt), pas sur celle de la page.
    if (opts && opts.zoneColumn) root.dataset.zoneColumn = '1';
    // Un en-tête ou un pied de page : ses images habillées se placent d'après la zone (floatParagraphBlocksFrom, zoneFloatsFrom).
    if (opts && opts.hfZone) root.dataset.hfZone = '1';
    // Ni ligne vide ni saut de page orphelin en fin de document : quand le texte arrive à la marge du bas, ils ouvriraient une page blanche.
    if (isTopLevel) ReaderMode.trimTrailingBlankBlocks(root);
    insertTrailingBreaksForEmptyBlocks(root);
    // Macro-modèle dont les modèles n'ont pas tous le même sens de page : les sections, dans la largeur de leur page (null : une seule page pour tout, comme avant).
    const sections = isTopLevel ? prepareSections(root) : null;
    let headingMarkers = null;
    if (isTopLevel) {
      const config = topLevelElements(root).find(el => el.classList.contains('heading-numbering-config'));
      const style = (config && config.dataset.style) || 'none';
      root.dataset.headingStyle = style;
      const headingEls = topLevelElements(root).filter(el => /^H[1-6]$/.test(el.tagName));
      const markers = HeadingNumbering.markersFor(headingEls, style);
      headingMarkers = new Map(headingEls.map((el, i) => [el, markers[i]]));
    }
    const widthPx = availableWidthPt != null ? availableWidthPt / PX_TO_PT : (sections ? sections.widestPx : null);
    const detachMeasureHost = attachPdfMeasureHost(root, widthPx);
    try {
      // Attend le décodage de chaque <img> de ce root avant toute mesure : getBoundingClientRect() sur une image en hauteur auto a besoin du ratio
      // intrinsèque réel, qu'un pré-chauffage du cache sur un élément séparé ne garantit pas.
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      measureTabs(root);
      if (isTopLevel) rebaseMacroSlotImages(root);
      return await buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel, opts);
    } finally {
      detachMeasureHost();
      // Les sections ont tourné la page le temps de la construction : le document reprend le sens et le format de sa première page, ceux que lisent la mise en page et la
      // définition du document.
      if (sections) applyPage(sections.first);
    }
  }

  // Les éléments de premier niveau du document, à travers les enveloppes de section : ce que les titres numérotés, le réglage de leur numérotation et le rebasage
  // des images par modèle lisaient sur les enfants directs de la racine.
  function topLevelElements(root) {
    const found = [];
    Array.from(root.children).forEach(child => {
      if (child.classList.contains(SECTION_CLASS)) found.push(...Array.from(child.children)); else found.push(child);
    });
    return found;
  }

  // Un document dont les modèles n'ont pas tous la même page, son sens et son format (js/page-sections.js) : la racine se range en une enveloppe par section, chacune
  // de la largeur utile de SA page, pour que tout ce que le PDF mesure dans le navigateur (retours à la ligne, colonnes de tableau, images, traits) le soit dans la
  // bonne largeur. Les enveloppes s'empilent dans le même hôte : les positions restent celles d'un flux continu. La première page prend la page de la première
  // section. Rend null sans repère de page (le document est tel qu'avant), sinon { first, widestPx } - `first` : `{ orientation, format }`.
  function prepareSections(root) {
    if (!PageSections.hasSenses(root)) return null;
    const parts = PageSections.split(root.childNodes, { orientation: documentOrientation, format: documentFormat });
    PageSections.stripStart(root);
    if (!parts.length) return null;
    const first = { orientation: parts[0].orientation, format: parts[0].format };
    applyPage(first);
    const widthOf = part => (PageLayout.pageSizePtFor(part.orientation, part.format || documentFormat).width - marginLeftPt - marginRightPt) / PX_TO_PT;
    const widestPx = Math.max(...parts.map(widthOf));
    // Une seule section : la page change, rien d'autre (pas d'enveloppe).
    if (parts.length === 1) return { first, widestPx };
    parts.forEach(part => {
      const wrapper = document.createElement('div');
      wrapper.className = SECTION_CLASS;
      wrapper.setAttribute(PageSections.ATTR, part.orientation);
      if (part.format) wrapper.setAttribute(PageSections.FORMAT_ATTR, part.format);
      wrapper.style.width = widthOf(part) + 'px';
      part.nodes.forEach(node => wrapper.appendChild(node));
      root.appendChild(wrapper);
    });
    return { first, widestPx };
  }

  // pdfmake exige une image en data URI base64 : un simple src http(s)://... (upload Grist ou URL externe) n'est jamais rendu, silencieusement. Il ne
  // sait embarquer que du JPEG et du PNG (SVG et WEBP le font bloquer indéfiniment ou lever "Unknown image format") : tout autre format est redessiné
  // en PNG, cas fréquent quand un CDN renvoie du WEBP par négociation de contenu même pour une URL en ".png". En cas d'échec (réseau, CORS...),
  // marque l'image à ignorer plutôt que de faire planter tout l'export. En qualité « Léger », chaque image est ensuite ramenée à la définition de sa boîte
  // (ImageIo.lighten) ; le code QR garde la sienne : adoucir ses modules le rendrait plus dur à lire.
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
        if (lightImagePpi && !img.hasAttribute('data-qr-text')) src = await ImageIo.lighten(src, styleBoxOf(img), lightImagePpi);
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
  function watermarkSvgFrom(layout, widthPt, heightPt) {
    const cx = widthPt / 2, cy = heightPt / 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgNum(widthPt) + '" height="' + svgNum(heightPt) + '" viewBox="0 0 ' + svgNum(widthPt) + ' ' + svgNum(heightPt) + '">'
      + '<text x="' + svgNum(cx) + '" y="' + svgNum(cy + PageLayer.WATERMARK_BASELINE_EM * layout.fontSizePt) + '" font-family="Roboto" font-weight="bold" font-size="' + layout.fontSizePt + '" text-anchor="middle"'
      + ' fill="' + layout.color + '" fill-opacity="' + layout.opacity + '" transform="rotate(' + layout.angleDeg + ' ' + svgNum(cx) + ' ' + svgNum(cy) + ')">' + svgEscaped(layout.text) + '</text></svg>';
  }

  // « Rester ensemble » (js/caption.js) : la légende d'une image ou d'un tableau ne reste jamais seule en haut de la page suivante. Rappel
  // `pageBreakBefore` de pdfmake, appelé une fois par nœud après une mise en page, pour le premier bloc de chaque paire (`id` « pp-keep-N », posé par
  // buildPdfContentFromRoot) : il demande de le passer à la page suivante quand lui et sa légende ne sont plus sur la même page (pdfmake remet alors
  // tout en page, la légende suit). Un bloc déjà en haut de sa page ne bouge pas : le passer à la suivante n'ajouterait qu'une page blanche. Pas
  // d'`unbreakable` : pdfmake note les positions d'un bloc insécable à l'endroit où il ne tient pas, avant de le déplacer, et la page d'une note ou
  // d'une image en calque ancrée sur lui serait fausse (les paragraphes gardés d'une pièce, markWhole, n'en font jamais partie). Un seul
  // paramètre : pdfmake ne dresse les listes des nœuds voisins (en O(n²)) que pour un rappel qui en déclare davantage.
  //
  // « Garder avec le suivant » (js/keep-with-next.js) passe par la même règle : la paire d'une suite de paragraphes gardés a pour `last` le bloc qui
  // la suit (`headOnly`) et se sépare quand la tête de ce bloc n'est pas sur la page du début de la suite (pour un tableau dont les lignes ne se
  // coupent pas, son premier texte hors titres : `head`) ; si ce bloc porte lui-même une légende (sa propre paire), c'est la fin de la légende qui
  // compte, comme pour lui.
  const CAPTION_KEEP_ID = 'pp-keep-';
  const KEEP_HEAD_ID = 'pp-head-';
  function captionKeepRule(pairs) {
    const byStartId = new Map(pairs.map(pair => [pair.startId, pair]));
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
      const pair = typeof id === 'string' ? byStartId.get(id) : null;
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
  // `run` : le PDF d'une suite de pages de même format d'un document qui en mêle (runsOf, documentOfRuns) - `{ index, page, numbering }` : son rang, sa première page (`{ orientation,
  // format }`) et la numérotation du document entier. Sans `run` (presque tout document), le PDF est d'un seul tenant, à la page du module.
  function buildNativeDocDefinition(content, filename, headerFooterChunks, run) {
    const hf = headerFooterChunks || { enabled: false, topExtraPt: 0, bottomExtraPt: 0 };
    // `content._footnoteBlocks` est posé par buildPdfContentFromRoot à chaque appel (mesure et finale, cf. resolveNativePdfContent) : cette condition
    // est donc la même aux deux passes, invariant que topExtraPt et bottomExtraPt exigent déjà (même marge aux deux passes, sinon la pagination
    // mesurée dérive).
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    const { topMarginPt, bottomMarginPt } = pageMarginsPt(hf, hasFootnotes);
    const page = run ? run.page : modulePage();
    const doc = {
      pageSize: PageLayout.pdfPageNameFor(page.format), pageOrientation: page.orientation,
      pageMargins: [marginLeftPt, topMarginPt, marginRightPt, bottomMarginPt],
      defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE },
      content, info: { title: filename || 'publipostage' },
    };
    if ((content._captionPairs || []).length) doc.pageBreakBefore = captionKeepRule(content._captionPairs);
    const background = pageBackgroundFor(content, run);
    if (background) doc.background = background;
    if (hf.enabled && (hf.header.default || hf.header.first)) doc.header = pageHeaderFor(hf, run);
    // Le pied de page doit exister même sans en-tête/pied configuré par l'utilisateur dès qu'il y a au moins une note : le texte des notes est ajouté
    // après le contenu utilisateur dans le même stack, en réutilisant le callback natif déjà appelé une fois par page. Un cadre libre devant le texte
    // (placeFrames) s'y peint aussi, après le reste : le pied est ce que pdfmake peint en dernier sur la page.
    const hasFrontFrames = Object.keys(content._frontFramesByPage || {}).length > 0;
    if ((hf.enabled && (hf.footer.default || hf.footer.first)) || hasFootnotes || hasFrontFrames) doc.footer = pageFooterFor(hf, content, run);
    return doc;
  }

  // Le rang, dans le document entier, de la page `currentPage` du PDF d'une suite de pages de même format, et le nombre de pages du document entier : ce PDF ne connaît que les siennes.
  // Sans suite (presque tout document), ce que pdfmake donne.
  const wholePageOf = (run, currentPage) => (run ? (run.numbering.offsets[run.index] || 0) + currentPage : currentPage);
  const wholeCountOf = (run, pageCount) => (run && run.numbering.total ? run.numbering.total : pageCount);

  // --- Un document qui mêle des formats de page ------------------------------------------------------------------------------------------------------------
  // Un PDF de pdfmake n'a qu'UN format : ses pages ne savent que tourner (`pageOrientation`). Un macro-modèle qui mêle des formats - une diapositive (16:9) au milieu de pages A4, js/page-sections.js - se
  // met donc en page SUITE par SUITE de pages de même format, un PDF chacune, que pdf-lib réunit ensuite (PdfMerge.joinParts). Le contenu, lui, est construit d'un seul tenant (numérotation des titres et
  // des notes, sommaire, signets) : chaque bloc de premier niveau porte la page de sa section (`_page`, pushBlock) et les blocs se rangent en suites ici. Les numéros de page restent ceux du document
  // entier : la mise en page de chaque suite décale d'autant les `positions` de ses blocs (layoutRuns), et l'en-tête, le pied et les fonds de page lisent le rang du document entier (wholePageOf).

  // Les suites de pages de même format du contenu, `[{ page, blocks }]` - `page` : la page (`{ orientation, format }`) de la première section de la suite -, ou null quand toutes les pages ont le même
  // format (presque tout document : le PDF reste d'un seul tenant). Un bloc sans page (une image en calque insérée près de son ancre) suit la suite en cours. Ne touche à rien.
  function runsOf(content) {
    const runs = [];
    content.forEach(block => {
      const page = block && block._page;
      let run = runs[runs.length - 1];
      if (page && run && run.page && run.page.format !== page.format) run = null;
      if (!run) { run = { page: page || null, blocks: [] }; runs.push(run); } else if (page && !run.page) run.page = page;
      run.blocks.push(block);
    });
    return runs.length > 1 ? runs : null;
  }

  // Le saut de page qui ouvre un bloc, ôté (le chemin de turnPage : le bloc lui-même ou son premier enfant). Rend vrai quand un saut est ôté.
  function dropPageBreak(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(child => dropPageBreak(child));
    if (node.pageBreak === 'before') { delete node.pageBreak; return true; }
    return ['stack', 'columns', 'ul', 'ol'].some(key => node[key] && dropPageBreak(node[key])) || !!(node.table && Array.isArray(node.table.body) && dropPageBreak(node.table.body));
  }

  // Les suites, chacune sauf la première sans le saut de page qui l'ouvrait : sa première page est la première du PDF qui la porte (un saut y laisserait une page blanche devant). Seul son premier
  // bloc le porte, et une fois : le même contenu passe par là à chaque mesure puis à la définition finale, et le saut d'un titre plus bas (un saut de page voulu dans la suite) ne doit pas partir au
  // deuxième passage.
  function withOpeningBreaksDropped(runs) {
    runs.slice(1).forEach(run => {
      const first = run.blocks[0];
      if (first && typeof first === 'object' && !first._openingDropped) { first._openingDropped = true; dropPageBreak(first); }
    });
    return runs;
  }

  // Chaque nœud d'un bloc - lui, ses enfants, les cases de ses tableaux -, dans l'ordre du document.
  function eachNode(node, visit) {
    if (Array.isArray(node)) { node.forEach(child => eachNode(child, visit)); return; }
    if (!node || typeof node !== 'object') return;
    visit(node);
    ['stack', 'columns', 'ul', 'ol', 'text'].forEach(key => { if (Array.isArray(node[key])) eachNode(node[key], visit); });
    if (node.table && Array.isArray(node.table.body)) eachNode(node.table.body, visit);
  }

  // Les `positions` que pdfmake a mesurées sur les blocs d'une suite, décalées au rang de ses pages dans le document entier (`offset` : le nombre de pages d'avant), avec son format : ce que le sommaire, les
  // notes, les images et les cadres lisent ensuite est ce qu'un seul PDF aurait dit. Un conteneur recopie les positions de ses enfants - le même objet, pas une copie : chacune n'est décalée qu'une fois.
  function offsetPositions(blocks, offset, format) {
    const done = new WeakSet();
    eachNode(blocks, node => {
      (Array.isArray(node.positions) ? node.positions : []).forEach(position => {
        if (!position || typeof position !== 'object' || done.has(position)) return;
        done.add(position);
        position.pageNumber += offset;
        position.pageFormat = format;
      });
    });
  }

  // La numérotation du document entier d'après le nombre de pages de chaque suite : le rang de la première page de chacune, et le total.
  function numberRuns(numbering, counts) {
    numbering.counts = counts;
    numbering.offsets = counts.map((_, i) => counts.slice(0, i).reduce((sum, n) => sum + n, 0));
    numbering.total = counts.reduce((sum, n) => sum + n, 0);
  }

  // Le contenu d'une suite : ses blocs, avec ce que le contenu entier porte et que la définition du document lit (notes, légendes, fonds, cadres, images répétées).
  function contentOfRun(content, blocks) {
    Object.keys(content).filter(key => !/^\d+$/.test(key)).forEach((key) => { blocks[key] = content[key]; });
    return blocks;
  }

  // La définition du PDF d'une suite de pages.
  function definitionOfRun(content, run, index, numbering, filename, headerFooterChunks) {
    return buildNativeDocDefinition(contentOfRun(content, run.blocks), filename, headerFooterChunks, { index, page: run.page, numbering });
  }

  // Met en page chaque suite de pages de même format du contenu, l'une après l'autre, dans un PDF jeté (la mesure), et décale les positions de ses blocs au rang de ses pages dans le document entier.
  // Pose `content._runPages`, le nombre de pages de chaque suite : la numérotation de la définition finale (documentOfRuns).
  async function layoutRuns(content, filename, headerFooterChunks) {
    const runs = withOpeningBreaksDropped(runsOf(content));
    const numbering = { offsets: [], total: 0, counts: [] };
    const counts = [];
    for (let index = 0; index < runs.length; index += 1) {
      numberRuns(numbering, counts.concat([0]));
      const definition = definitionOfRun(content, runs[index], index, numbering, filename, headerFooterChunks);
      const { pageCount } = await renderOnce(window.pdfMake.createPdf(definition), definition, true);
      offsetPositions(runs[index].blocks, numbering.offsets[index], runs[index].page.format);
      counts.push(pageCount);
    }
    content._runPages = counts;
  }

  // La définition du PDF d'un document qui mêle des formats : celle de sa première suite, qui porte les suivantes (`_followingRuns`) et la numérotation du document entier (`_numbering`) ;
  // renderRuns les met en page l'une après l'autre. Une suite d'un autre format que celui du document est une présentation : chacune de ses pages est voulue, même blanche (`_everyPageWanted`).
  function documentOfRuns(content, filename, headerFooterChunks) {
    const runs = withOpeningBreaksDropped(runsOf(content));
    const numbering = { offsets: [], total: 0, counts: [] };
    numberRuns(numbering, (content._runPages || []).slice());
    const definitions = runs.map((run, index) => {
      const definition = definitionOfRun(content, run, index, numbering, filename, headerFooterChunks);
      definition._everyPageWanted = PageLayout.normalizeFormat(run.page.format) !== documentFormat;
      return definition;
    });
    definitions[0]._followingRuns = definitions.slice(1);
    definitions[0]._numbering = numbering;
    return definitions[0];
  }

  // Le fond de chaque page, ou `null` s'il n'y en a pas. Le filigrane (js/page-layer.js:watermarkLayout : le corps et l'angle que l'éditeur dessine) est
  // le premier des fonds de chaque page, donc derrière le texte et derrière les images en calque, comme à l'écran : pas le `watermark` natif de pdfmake,
  // qui se peint après le contenu (par-dessus le texte et les images) et que rien ne descend dessous. Viennent ensuite les images répétées (« Sur toutes
  // les pages ») sur chaque page de leur courrier, puis les images « derrière » à position de page, au-delà de la 1re page (resolveNativePdfContent) :
  // pdfmake appelle `background` page par page, 1-based, et range ses mesures sur le nœud qu'il traite, d'où une copie par appel.
  function pageBackgroundFor(content, run) {
    // La page où la suite commence (celle du module hors suite) : ses dimensions sont exactes, celles d'une page qui tourne sont à lire sur la page que pdfmake donne.
    const base = run ? PageLayout.pageSizePtFor(run.page.orientation, run.page.format) : { width: pageWidthPt, height: pageHeightPt };
    // Le filigrane est une image de la taille de la page : une par taille de page du document (pdfmake donne à chaque page sa taille), la même pour toutes les pages
    // de même taille.
    const watermarkBySize = new Map();
    const watermarkFor = (widthPt, heightPt) => {
      const key = widthPt + 'x' + heightPt;
      if (!watermarkBySize.has(key)) {
        const layout = PageLayer.watermarkLayout(pageWatermark, widthPt, heightPt);
        watermarkBySize.set(key, layout ? { svg: watermarkSvgFrom(layout, widthPt, heightPt), absolutePosition: { x: 0, y: 0 } } : null);
      }
      return watermarkBySize.get(key);
    };
    const behindByPage = content._backgroundByPage || {};
    const repeatedLayer = content._repeatedLayer || [];
    if (!watermarkFor(base.width, base.height) && !repeatedLayer.length && !Object.keys(behindByPage).length) return null;
    return (currentPage, pageSize) => {
      const page = wholePageOf(run, currentPage);
      // La page du sens du document garde ses dimensions exactes ; une page qui tourne prend celles que pdfmake lui donne.
      const turned = pageSize && Math.abs(pageSize.width - base.width) > 0.5 && pageSize.width > 0 && pageSize.height > 0;
      const watermarkNode = turned ? watermarkFor(pageSize.width, pageSize.height) : watermarkFor(base.width, base.height);
      // `_furniture` : ce fond se peint sur des pages qui peuvent n'avoir rien d'autre, il ne compte pas pour le repérage des pages blanches (blankPagesOf) ; les
      // images « derrière » d'une page, elles, sont son contenu.
      const nodes = (watermarkNode ? [Object.assign({}, watermarkNode, FURNITURE)] : [])
        .concat(repeatedLayer.filter(r => page >= r.fromPage && page <= r.toPage).map(r => Object.assign({}, r.image, FURNITURE)), behindByPage[page] || []);
      return nodes.length ? nodes : null;
    };
  }

  // « Première page différente » se résout à chaque page, au moment de peindre (currentPage === 1), pas dans buildHeaderFooterPdfChunks qui se contente
  // de préparer les 2 variantes.
  const chunkForPage = (hf, variants, currentPage) => ((currentPage === 1 && hf.differentFirstPage) ? variants.first : variants.default);

  // Les zones de la page que pdfmake peint : celles de la page où le document commence, ou la variante du sens et du format de cette page (macro-modèle aux modèles mêlés) ; `format` :
  // celui des pages du PDF qui les peint (la page du module hors suite, celle de la suite sinon).
  function zonesFor(hf, pageSize, format) {
    const sense = pageSize && (pageSize.orientation || (pageSize.width > pageSize.height ? 'landscape' : 'portrait'));
    return (sense && hf.variants && hf.variants[pageKey(sense, format)]) || hf;
  }

  // pdfmake pose un en-tête ou un pied dans une boîte de la hauteur de la marge de la page, et jette les lignes qui n'y tiennent pas : plus haute que la zone
  // (la moitié de la marge du haut, la bande, ou la bande de notes et la marge du bas). Un contenu qui dépasse la zone (`_clipped`) est ramené à sa limite
  // en retirant d'avance de la place à la boîte (`skipPt`, une pile vide avec une marge), puis en le remontant d'autant : `relativePosition` déplace le
  // curseur sans changer la place disponible. Ce qui ne tient pas plus est jeté, comme avant, mais à la limite de la zone. `boxPt` : la place que pdfmake
  // donne au contenu à cet endroit de la boîte.
  function clippedZoneParts(nodes, boxPt) {
    const skipPt = Math.max(0, boxPt - HF_MAX_ZONE_HEIGHT_PT);
    return { skipPt, parts: [{ stack: [], margin: [0, skipPt, 0, 0] }, { relativePosition: { x: 0, y: -skipPt }, stack: nodes }] };
  }

  function pageHeaderFor(hf, run) {
    const format = run ? run.page.format : pageFormat;
    return (currentPage, pageCount, pageSize) => {
      const page = wholePageOf(run, currentPage);
      const chunk = chunkForPage(hf, zonesFor(hf, pageSize, format).header, page);
      if (!chunk) return null;
      const startPt = marginTopPt * 0.5;
      const nodes = resolvePageNumberPlaceholders(chunk, page, wholeCountOf(run, pageCount));
      const parts = chunk._clipped ? clippedZoneParts(nodes, pageMarginsPt(hf, false).topMarginPt - startPt).parts : nodes;
      return { margin: [marginLeftPt, startPt, marginRightPt, 0], stack: parts.concat(zoneFloatNodes(chunk, marginLeftPt, startPt)) };
    };
  }

  function pageFooterFor(hf, content, run) {
    const footnoteByPage = content._footnoteByPage || {};
    const frontFramesByPage = content._frontFramesByPage || {};
    const format = run ? run.page.format : pageFormat;
    return (currentPage, pageCount, pageSize) => {
      const page = wholePageOf(run, currentPage);
      const chunk = hf.enabled ? chunkForPage(hf, zonesFor(hf, pageSize, format).footer, page) : null;
      // Le pied part du haut de la marge du bas de la page, bande des notes comprise : pdfmake lui donne cette boîte (pageMargins.bottom).
      const boxPt = pageMarginsPt(hf, (content._footnoteBlocks || []).length > 0).bottomMarginPt;
      let zoneParts = chunk ? resolvePageNumberPlaceholders(chunk, page, wholeCountOf(run, pageCount)) : [];
      let notesParts = footnoteBandFor(footnoteByPage[page]);
      if (chunk && chunk._clipped) {
        const { skipPt, parts } = clippedZoneParts(zoneParts, boxPt);
        zoneParts = parts;
        // Les notes suivent le pied coupé, à sa limite : le curseur est resté sous la pile vide.
        if (notesParts.length) notesParts = [{ relativePosition: { x: 0, y: HF_MAX_ZONE_HEIGHT_PT - skipPt }, stack: notesParts }];
      }
      // `absolutePosition` d'un pied se compte depuis le haut de sa boîte (pdfmake y ajoute la place de la boîte sur la page) : y vaut 0 au haut du contenu.
      const stackParts = (chunk ? zoneParts.concat(zoneFloatNodes(chunk, marginLeftPt, 0)) : []).concat(notesParts, frontFramesAt(frontFramesByPage[page], (pageSize && pageSize.height) || pageHeightPt, boxPt));
      if (!stackParts.length) return null;
      return { margin: [marginLeftPt, 0, marginRightPt, marginBottomPt * 0.5], stack: stackParts };
    };
  }

  // Les cadres libres devant le texte d'une page (placeFrames), dans le repère du pied : la boîte du pied commence à la hauteur de la page moins sa marge du bas (`boxPt`) et `absolutePosition` s'y compte
  // depuis son haut, si bien que chaque `y` perd cet écart (le bord bas de la page reste celui où pdfmake rogne). Le nœud d'un cadre est une pile de son dessin et de son texte, ou un seul nœud à position
  // absolue (texte, trait, SVG d'un cadre pivoté) : copiés au passage, pdfmake range ses mesures sur le nœud qu'il traite et le document se rend deux fois (renderOnce, puis le fichier).
  function frontFramesAt(frames, pageHeight, boxPt) {
    const dyPt = boxPt - pageHeight;
    const shifted = node => {
      const copy = Object.assign({}, node);
      if (node.absolutePosition) copy.absolutePosition = { x: node.absolutePosition.x, y: node.absolutePosition.y + dyPt };
      if (Array.isArray(node.stack)) copy.stack = node.stack.map(shifted);
      return copy;
    };
    return (frames || []).map(shifted);
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
    const maxYPt = (a.pageOrientation ? PageLayout.pageSizePtFor(a.pageOrientation, a.pageFormat || pageFormat).height : pageHeightPt) - effectiveBottomMarginPt - imgHeightPt;
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
    tableExtrasPt = ((headerFooterChunks && headerFooterChunks.topExtraPt) || 0) + ((headerFooterChunks && headerFooterChunks.bottomExtraPt) || 0);
    tablePageHeightPt = pageHeightPt - marginTopPt - marginBottomPt - tableExtrasPt - FOOTNOTE_BAND_PT;
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
    // Mise en page par pdfmake du contenu courant, sans rien en garder que ce qu'il pose sur les blocs (positions, largeurs mesurées). Un contenu qui mêle des formats de
    // page (une diapositive au milieu de pages A4) se met en page suite par suite (layoutRuns) : un PDF ne change pas de format en route.
    const measure = (toMeasure) => {
      giveWholeIds(toMeasure);
      if (runsOf(toMeasure)) return layoutRuns(toMeasure, filename, headerFooterChunks);
      return new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(toMeasure, filename, headerFooterChunks)).getBuffer(() => resolve()); });
    };
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
    // Un contenu qui mêle des formats de page est mesuré lui aussi : le nombre de pages de chaque suite (`_runPages`) donne à l'en-tête et au pied la numérotation du document entier.
    if (hasFootnotes || hasFloatOverlays || (content._tocBlocks || []).length > 0 || (content._pendingImages || []).length > 0 || (content._frames || []).length > 0 || runsOf(content)) {
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
    const runPages = content._runPages;
    content = await buildContent();
    if (runPages) content._runPages = runPages;
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
    const moving = [];
    floatAnchorsOf(content).forEach((anchor, i) => {
      const pos = firstPosition(anchor);
      const pageBottomPt = pageHeightAt(pos) - bottomMarginPt;
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
      framePageNumbers: (content._frames || []).map(frame => pageNumberOf(frame.marker)),
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
      // Le sens et le format de la page où l'image se pose (celle de son paragraphe hôte, sinon d'un voisin) : sa hauteur borne la position (resolveImageAbsolutePosition).
      pageOrientation: (containerResolved || aboveResolved || belowResolved || {}).pageOrientation || null,
      pageFormat: (containerResolved || aboveResolved || belowResolved || {}).pageFormat || null,
      imgTopPx: p.imgTopPx, imgLeftPx: p.imgLeftPx, imgHeightPx: p.imgHeightPx,
      aboveTopPx: p.aboveTopPx, belowTopPx: p.belowTopPx, aboveLeftPx: p.aboveLeftPx, belowLeftPx: p.belowLeftPx,
    };
  }

  const pushByPage = (byPage, page, item) => { (byPage[page] = byPage[page] || []).push(item); };

  // Place dans le contenu reconstruit ce que la mesure a appris : numéros de page du sommaire, notes au pied de leur page, images habillées et images
  // en calque à leur place.
  function placeMeasured(content, measured, topMarginPt, bottomMarginPt) {
    const { headingPageNumbers, footnotePageNumbers, resolvedAnchors, blockPageNumbers, floatPositions, framePageNumbers } = measured;
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
    const ctx = { content, originalBlocks, blockPageNumbers, slotStartPages, slotPageRange: slotPageRangeFn(slotStartPages), behindByPage, repeatedLayer, topMarginPt, bottomMarginPt, frontImages: [] };
    (content._pendingImages || []).forEach((p, i) => placePendingImage(ctx, p, resolvedAnchors[i]));
    placeFrames(content, framePageNumbers, behindByPage);
    liftFrontImages(content, ctx.frontImages);
  }

  // Les cadres de texte libres (visitFrame), posés sur la page que la mesure a donnée à leur marque, dans l'ordre du texte (le dernier est au premier plan). pdfmake ne coupe rien d'un cadre : un
  // cadre dont le bas passe la marge de la page ne fait pas de page de plus, et un cadre qui passe le bord de la page est rogné à ce bord. Une marque que pdfmake n'a pas posée garde son cadre dans
  // le flux, derrière elle, plutôt que de le perdre.
  //  - DERRIÈRE le texte (le fond de la diapositive, un cadre réglé « Derrière le texte ») : en fond de la page (`background` de pdfmake, peint avant le texte), SOUS les images « derrière » de cette page,
  //    qui le suivent dans le document comme à l'écran.
  //  - DEVANT le texte (le réglage d'origine) : au pied de la page (`content._frontFramesByPage`, peint par pageFooterFor), que pdfmake peint APRÈS tout le contenu de la page, donc par-dessus son texte.
  //    Pas dans le flux : un nœud à position absolue y est mis en page comme du texte, et ses lignes qui passent la marge du bas (une diapositive n'en a presque pas, un cadre au bas d'une page en a
  //    toujours une) repartent sur la page suivante, avec une page de plus. Un pied est une boîte à part qui s'arrête au bord de la page, comme le fond. Les images « devant le texte » de la page
  //    les y suivent (liftFrontImages), comme à l'écran.
  function placeFrames(content, framePageNumbers, behindByPage) {
    const behind = {};
    const front = {};
    (content._frames || []).forEach((frame, i) => {
      const page = framePageNumbers[i];
      if (!page) {
        const at = content.indexOf(frame.marker);
        if (at !== -1) content.splice(at + 1, 0, frame.node);
        return;
      }
      pushByPage(frame.behind ? behind : front, page, frame.node);
    });
    Object.keys(behind).forEach((page) => { behindByPage[page] = behind[page].concat(behindByPage[page] || []); });
    content._frontFramesByPage = front;
  }

  // Une image « devant le texte » d'une page qui a un cadre libre devant le texte passe avec lui au pied de la page, APRÈS lui : l'écran met l'image (z-index 5) au-dessus d'un cadre, et le pied est peint
  // après le contenu, donc par-dessus une image restée dans le flux. Seules celles du premier niveau, qu'on peut retirer du flux sans toucher à la structure d'un tableau ou d'une colonne ; les autres
  // restent dans le flux, sous les cadres de leur page.
  function liftFrontImages(content, frontImages) {
    const frames = content._frontFramesByPage || {};
    frontImages.forEach(({ image, page }) => {
      const at = page && frames[page] ? content.indexOf(image) : -1;
      if (at === -1) return;
      content.splice(at, 1);
      frames[page].push(image);
    });
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

  // Le numéro de page se lit comme le texte de la ligne : un lien vers le titre. Le lien ne se pose qu'avec le numéro, une cellule vide n'a rien à cliquer.
  function fillTocPageNumbers(content, headingPageNumbers) {
    (content._tocBlocks || []).forEach(tocBlock => {
      (tocBlock._pageNumberCells || []).forEach((cell, i) => {
        if (headingPageNumbers[i] == null) return;
        cell.text = String(headingPageNumbers[i]);
        if (cell._destination) cell.linkToDestination = cell._destination;
      });
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

  // Les dimensions de la page où pdfmake a posé un bloc : `positions` en porte le sens (macro-modèle aux modèles de page mêlés : toutes les pages n'ont pas
  // celles du document) et, pour une suite de pages d'un autre format, le format (`pageFormat`, posé par layoutRuns). Sans sens connu, celles de la page du document.
  function pageSizeAt(pos) {
    return pos && (pos.pageOrientation === 'landscape' || pos.pageOrientation === 'portrait') ? PageLayout.pageSizePtFor(pos.pageOrientation, pos.pageFormat || pageFormat) : { width: pageWidthPt, height: pageHeightPt };
  }
  const pageWidthAt = pos => pageSizeAt(pos).width;
  const pageHeightAt = pos => pageSizeAt(pos).height;

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
        : (align === 'right' ? pageWidthAt(pos) - marginRightPt - image.width : marginLeftPt);
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
    if (layer === 'front') ctx.frontImages.push({ image: p.image, page: placedPage });
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
    if (layer === 'front' && arr === content) ctx.frontImages.push({ image: p.image, page: anchorBlock === p.below ? a.belowPage : anchorBlock === p.above ? a.abovePage : null });
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

  // Les images habillées d'une zone (un logo aligné à gauche ou à droite, son texte à côté) : le corps les peint en fond de page après une passe de mesure de
  // pdfmake, qu'un en-tête ou un pied n'a pas. Elles sortent de leur ancre avec la place que le navigateur leur a donnée dans la zone (`zonePx`, posée par
  // floatParagraphBlocksFrom) et se peignent avec la zone (zoneFloatNodes) ; une image dont la place est inconnue reste dans le flux, derrière son ancre,
  // plutôt que de se perdre.
  function zoneFloatsFrom(content) {
    return floatAnchorsOf(content).map(anchor => {
      const { image, zonePx } = anchor._floatOverlay;
      const siblings = anchor._floatSiblings;
      delete anchor._floatOverlay;
      delete anchor._floatSiblings;
      delete anchor._floatTop;
      if (zonePx) return { image, leftPt: zonePx.left * PX_TO_PT, topPt: zonePx.top * PX_TO_PT };
      if (siblings) siblings.splice(siblings.indexOf(anchor) + 1, 0, image);
      return null;
    }).filter(Boolean);
  }
  // Les images habillées de la zone `chunk`, à leur place sur la page : `originXPt` et `originYPt` sont le coin haut gauche du contenu de la zone.
  function zoneFloatNodes(chunk, originXPt, originYPt) {
    return (chunk._zoneFloats || []).map(f => Object.assign({}, f.image, FURNITURE, { absolutePosition: { x: originXPt + f.leftPt, y: originYPt + f.topPt } }));
  }

  // Ce qui se peint autour du corps de la page - fond, en-tête, pied - porte `_furniture` : sur une page vide, il y est quand même, et ne la rend pas moins blanche
  // (blankPagesOf).
  const FURNITURE = { _furniture: true };
  function markFurniture(node) {
    if (Array.isArray(node)) { node.forEach(markFurniture); return; }
    if (!node || typeof node !== 'object') return;
    node._furniture = true;
    ['stack', 'columns', 'ul', 'ol', 'text'].forEach(key => { if (Array.isArray(node[key])) markFurniture(node[key]); });
    if (node.table && Array.isArray(node.table.body)) node.table.body.forEach(markFurniture);
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
  // `pages` : les pages du document (`{ orientation, format }`, PageSections.pagesIn) quand elles ne sont pas toutes celle où il commence.
  async function buildHeaderFooterPdfChunks(headerFooterData, pages) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    if (!headerFooterData || !headerFooterData.enabled) return empty;
    async function resolveZone(html) {
      if (!PageLayout.hasZoneContent(html)) return { content: null, heightPt: 0 };
      // Une image d'en-tête ou de pied dont le src est une URL externe doit passer par inlineEditorImagesAsDataUri, comme celles du corps : pdfmake
      // n'imprime que des data URI.
      html = await inlineEditorImagesAsDataUri(html);
      const content = await htmlToPdfContent(html, false, CONTENT_WIDTH_PT, { hfZone: true });
      // Filet de sécurité : une image en calque n'a pas de résolution de position dans un en-tête/pied (pas de passe de mesure dédiée) - l'UI
      // verrouille déjà cette option en édition, mais un gabarit existant pourrait quand même en contenir une. Repli en flux normal.
      stripUnresolvedPendingImages(content);
      content._zoneFloats = zoneFloatsFrom(content);
      markFurniture(content);
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
      // Un contenu plus haut que la zone est coupé à sa limite (pageHeaderFor, pageFooterFor) ; un contenu qui tient n'est pas touché.
      if (PageLayout.zoneOverflowPx(heightPt / PX_TO_PT)) content._clipped = true;
      return { content, heightPt };
    }
    const differentFirstPage = !!headerFooterData.differentFirstPage;
    const emptyZone = { content: null, heightPt: 0 };
    // Les quatre zones sont indépendantes (chacune a son hôte de mesure hors écran, cf. resolveZone) : contrairement à twoColumnsFrom, aucun état de
    // module partagé comme footnoteCounter (les notes de bas de page ne sont jamais résolues en en-tête ou pied), donc rien n'impose le séquentiel.
    // Dans la largeur de la page du sens courant (applyPageOrientation).
    const resolveZones = () => Promise.all([
      resolveZone(headerFooterData.header && headerFooterData.header.default),
      differentFirstPage ? resolveZone(headerFooterData.header && headerFooterData.header.first) : Promise.resolve(emptyZone),
      resolveZone(headerFooterData.footer && headerFooterData.footer.default),
      differentFirstPage ? resolveZone(headerFooterData.footer && headerFooterData.footer.first) : Promise.resolve(emptyZone),
    ]);
    const [headerDefault, headerFirst, footerDefault, footerFirst] = await resolveZones();
    // Les autres pages du document (macro-modèle aux modèles mêlés) : les quatre zones refaites dans la largeur de LEUR page, une fois par page différente (sens et format, pageKey). Celles
    // qui sont déjà prêtes sont celles de la page où le document commence.
    const basePage = modulePage();
    const baseKey = pageKey(basePage.orientation, basePage.format);
    const variants = {};
    try {
      for (const page of pages || []) {
        const key = pageKey(page.orientation, page.format);
        if (key === baseKey || variants[key]) continue;
        applyPage(page);
        const [hd, hf, fd, ff] = await resolveZones();
        variants[key] = { header: { default: hd.content, first: hf.content }, footer: { default: fd.content, first: ff.content } };
      }
    } finally { applyPage(basePage); }
    // Une seule hauteur de marge par zone : la marge de page ne peut pas varier d'une page à l'autre chez pdfmake, donc "page 1 différente" ne change
    // que le contenu - le plus grand des deux fragments dimensionne la marge des deux variantes.
    const headerHeightPt = (headerDefault.content || headerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    const footerHeightPt = (footerDefault.content || footerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    return {
      enabled: true,
      differentFirstPage,
      header: { default: headerDefault.content, first: headerFirst.content },
      footer: { default: footerDefault.content, first: footerFirst.content },
      variants,
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
    // Un macro-modèle aux modèles de pages différentes (js/page-sections.js) : le document commence à la page de son premier modèle (son sens et son format), et l'en-tête et le pied se
    // préparent aussi dans la largeur de chacune des autres pages.
    const pages = PageSections.hasSenses(inlinedHtml) ? PageSections.pagesIn(inlinedHtml) : [];
    if (pages.length) applyPage(PageSections.firstPageOf(inlinedHtml) || { orientation: documentOrientation, format: null });
    let headerFooterChunks;
    try { headerFooterChunks = await buildHeaderFooterPdfChunks(headerFooterData, pages); }
    catch (e) {
      console.warn('[PdfExport] en-tête/pied de page ignorés (structure inattendue) :', e);
      headerFooterChunks = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    }
    let content;
    try { content = await resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks); } finally { stretching = false; }
    // Des pages de plusieurs formats (une diapositive entre des pages A4) : un PDF par suite de pages de même format (documentOfRuns) ; sinon le PDF reste d'un seul tenant, comme toujours.
    if (runsOf(content)) return documentOfRuns(content, filename, headerFooterChunks);
    const definition = buildNativeDocDefinition(content, filename, headerFooterChunks);
    // Un macro-modèle qui n'assemble que des diapositives a leur format pour tout le document : chaque page est voulue, même blanche (comme une suite de diapositives, documentOfRuns).
    if (PageLayout.normalizeFormat(pageFormat) !== documentFormat) definition._everyPageWanted = true;
    return definition;
  }

  // Ce que l'export d'une ligne lit avant d'écrire : la fenêtre des images externes (js/external-images.js : une image d'un autre site est
  // téléchargée pour ce PDF, la fenêtre la liste et peut tout arrêter ; dans un lot, un site déjà accepté n'est pas redemandé et un refus arrête tout
  // le lot, cf. ExternalImages.beginRun), les marges et les bibliothèques, puis le HTML, le nom du fichier et l'en-tête et le pied résolus pour la
  // ligne. `gridModel` : le modèle de la ligne est une grille ; absent, c'est le modèle ouvert (un lot « Modèle selon la ligne » peut mêler les deux
  // genres, js/main.js). `quality` : 'light' ramène les images à LIGHT_IMAGE_PPI points par pouce ; absent, le PDF reprend les images telles quelles.
  // `docFields` : les champs de document à poser sur le document fini (mot de passe, droits et propriétés d'un « PDF protégé », js/pdf-protection.js:docFields) ;
  // absent, le PDF est ordinaire.
  async function prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt, gridModel, quality, docFields) {
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsPt(marginsPt);
    exportsGridModel = gridModel === undefined ? (typeof GridEditor !== 'undefined' && GridEditor.isActive()) : !!gridModel;
    lightImagePpi = quality === 'light' ? LIGHT_IMAGE_PPI : 0;
    await ensurePdfLibsLoaded();
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename, resolvedHeaderFooterData);
    // pdfmake chiffre chaque fichier qu'il écrit et pdf-lib ne lit pas un PDF chiffré : un document qui mêle des formats de page (plusieurs fichiers, réunis ensuite) ne peut pas être protégé. Jamais
    // un PDF livré sans la protection demandée : l'export s'arrête, et la phrase dit pourquoi (js/main.js, js/batch-failures.js).
    if (docFields && docDefinition._followingRuns) throw mixedFormatsError();
    return { docDefinition: withDocFields(docDefinition, docFields), filename };
  }

  // L'erreur d'un PDF protégé dont les pages n'ont pas toutes le même format : `passwordProblem` est le champ que l'écran et la fin d'un lot lisent déjà pour dire pourquoi la protection n'a pas pu se faire.
  function mixedFormatsError() {
    const error = new Error('Un PDF protégé ne peut pas mêler des pages de formats différents (une diapositive entre des pages A4).');
    error.passwordProblem = 'mixedFormats';
    return error;
  }

  // Les champs de document de la protection, posés sur le document fini - jamais sur ceux des passes de mesure, qui n'écrivent aucun fichier. Seuls les champs
  // de pdfmake que la protection porte sont repris ; les propriétés complètent le titre sans le remplacer.
  const DOC_FIELDS = ['version', 'userPassword', 'ownerPassword', 'permissions'];
  function withDocFields(docDefinition, docFields) {
    if (!docFields) return docDefinition;
    DOC_FIELDS.forEach(key => { if (docFields[key] !== undefined) docDefinition[key] = docFields[key]; });
    if (docFields.info) docDefinition.info = Object.assign({}, docDefinition.info, docFields.info);
    return docDefinition;
  }

  // Un élément de page de pdfmake (`{ type, item }`) se peint-il dans le corps du document ? `topPt` et `bottomPt` : où le corps commence et finit sur la page (au-delà,
  // c'est l'en-tête et le pied). Une ligne ne compte que si elle montre autre chose que des blancs (espaces, insécables : un paragraphe vide est une ligne de
  // blancs), une image ou un SVG que si elle n'est pas du fond ou de l'en-tête et du pied (`_furniture`), un trait que s'il est dans le corps. Un élément qu'on
  // ne connaît pas se compte : mieux vaut une page blanche de moins signalée qu'une de trop.
  function paintsInBody(entry, topPt, bottomPt) {
    const item = entry.item || {};
    switch (entry.type) {
      case 'line':
        if (item.y < topPt - 0.5 || item.y >= bottomPt - 0.5) return false;
        return (item.inlines || []).some(inline => /\S/.test(String(inline.text == null ? '' : inline.text)) || inline.background || inline.decoration);
      case 'image': case 'svg':
        return !item._furniture;
      case 'vector': {
        const y = [item.y, item.y1].find(Number.isFinite);
        return y === undefined || (y >= topPt - 0.5 && y < bottomPt - 0.5);
      }
      default:
        return false;
    }
  }

  // Les pages blanches du PDF fini - leur numéro, à partir de 1 - d'après la mise en page de pdfmake (`pages` : les éléments de chaque page, dans l'ordre où ils
  // se peignent) : le seul endroit où l'on sait ce que chaque page contient vraiment, après les sauts, les débordements et les repoussements de blocs. Une page
  // blanche est presque toujours un défaut que la personne n'a pas vu venir (des lignes vides, un saut de page juste après une page pleine) : l'export le lui dit.
  // N'en est pas une la page blanche que la personne a voulue : deux sauts de page de suite (blankPageBlock) la gardent, comme l'éditeur et la Lecture ; une présentation
  // n'en a aucune (renderOnce, `everyPageWanted`).
  function blankPagesOf(pages, docDefinition) {
    const margins = docDefinition.pageMargins;
    const topPt = Array.isArray(margins) ? margins[1] : margins.top;
    const bottomPt = Array.isArray(margins) ? margins[3] : margins.bottom;
    const wanted = new Set();
    (docDefinition.content || []).forEach(block => {
      if (block && block._blankPage) (block.positions || []).forEach(position => wanted.add(position.pageNumber));
    });
    const blank = [];
    (pages || []).forEach((page, index) => {
      if (wanted.has(index + 1)) return;
      const limitPt = page.pageSize.height - bottomPt;
      if (!(page.items || []).some(entry => paintsInBody(entry, topPt, limitPt))) blank.push(index + 1);
    });
    return blank;
  }

  // Le PDF fini d'un coup, avec ses pages blanches. pdfmake ne rend ses pages que dans `_flushDoc` (et ne les garde pas) : `getBlob`, `download` ou `getBase64`
  // les refont de zéro à chaque appel. Le document les fait donc une fois ici ; ses `getBuffer` rendent ensuite ces mêmes octets, et le téléchargement, le blob
  // et les tests (qui relisent le PDF par getBase64) passent tous par eux. Le repérage ne doit jamais empêcher l'export : en cas d'échec ou si pdfmake n'a pas ces
  // deux fonctions (version changée), il ne signale rien et le document se rend comme avant. `everyPageWanted` : chaque page est voulue, même blanche - une présentation,
  // dont chaque page est une diapositive (js/slides-entry.js:showsEveryPage ; carte du 19/10, « Ne plus avertir ») : aucune n'est signalée. Rend aussi `pageCount`, le nombre de pages du PDF
  // (0 sans ces deux fonctions) : un document qui mêle des formats se met en page suite par suite et en a besoin pour numéroter ses pages (layoutRuns, renderRuns).
  function renderOnce(pdf, docDefinition, everyPageWanted) {
    if (typeof pdf._createDoc !== 'function' || typeof pdf._flushDoc !== 'function') return Promise.resolve({ blankPages: [], pageCount: 0 });
    return new Promise((resolve, reject) => {
      try {
        pdf._createDoc(undefined, kit => {
          pdf._flushDoc(kit, (buffer, pages) => {
            pdf.getBuffer = callback => callback(buffer);
            let blankPages = [];
            try { if (!everyPageWanted) blankPages = blankPagesOf(pages, docDefinition); } catch (e) { console.warn('[PdfExport] pages blanches non repérées :', e); }
            resolve({ blankPages, pageCount: (pages || []).length });
          });
        });
      } catch (e) { reject(e); }
    });
  }

  const blobOf = pdf => new Promise((resolve, reject) => {
    try { pdf.getBlob(resolve); } catch (e) { reject(e); }
  });

  // Le PDF fini d'un document qui mêle des formats (documentOfRuns) : chaque suite de pages dans son PDF, l'une après l'autre, puis les PDF réunis en un seul (PdfMerge.joinParts, qui garde les liens
  // d'une suite à l'autre). La numérotation du document entier vient de la mesure ; si une suite rend un autre nombre de pages que celui qu'elle avait mesuré, le document est rendu une fois de plus
  // avec les nombres que les pages ont donnés. Les pages blanches se comptent dans le document entier ; celles d'une présentation sont voulues (`_everyPageWanted`).
  async function renderRuns(docDefinition, everyPageWanted) {
    const definitions = [docDefinition].concat(docDefinition._followingRuns);
    const numbering = docDefinition._numbering;
    let parts;
    let counts;
    let blankPages;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      parts = []; counts = []; blankPages = [];
      for (const definition of definitions) {
        const pdf = window.pdfMake.createPdf(definition);
        const rendered = await renderOnce(pdf, definition, everyPageWanted || definition._everyPageWanted);
        parts.push(await blobOf(pdf));
        rendered.blankPages.forEach(page => blankPages.push(page + counts.reduce((sum, n) => sum + n, 0)));
        counts.push(rendered.pageCount);
      }
      if (counts.length === numbering.counts.length && counts.every((n, i) => n === numbering.counts[i])) break;
      numberRuns(numbering, counts);
    }
    // Les moteurs d'export ne se lisent pas entre eux au chargement : celui de la fusion se charge ici, au seul moment où un PDF en a besoin.
    await ExportEngines.ensure('merge');
    return { blankPages, blob: await PdfMerge.joinParts(docDefinition.info.title, parts) };
  }

  // Le PDF d'une définition : mis en page une fois (renderOnce), avec ses pages blanches, et de quoi l'enregistrer ou en prendre le blob. Un document qui mêle des formats passe par renderRuns.
  async function renderDocument(docDefinition, everyPageWanted) {
    if (docDefinition._followingRuns) {
      const { blankPages, blob } = await renderRuns(docDefinition, everyPageWanted);
      return { blankPages, save: name => ExportCommon.downloadBlob(blob, name), blob: () => Promise.resolve(blob) };
    }
    const pdf = window.pdfMake.createPdf(docDefinition);
    const { blankPages } = await renderOnce(pdf, docDefinition, everyPageWanted || docDefinition._everyPageWanted);
    return { blankPages, save: name => pdf.download(name), blob: () => blobOf(pdf) };
  }

  // Résout à `false` quand la personne renonce à l'export à cause d'une page blanche (rien n'est enregistré) ; `undefined` quand il n'y avait pas de ligne.
  // `everyPageWanted` : le PDF d'une présentation, qui ne pose pas la question (renderOnce).
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt, gridModel, quality, docFields, everyPageWanted) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    const { docDefinition, filename } = await prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt, gridModel, quality, docFields);
    const rendered = await renderDocument(docDefinition, everyPageWanted);
    if (rendered.blankPages.length && !(await BatchFailures.confirmBlankPages(rendered.blankPages))) return false;
    rendered.save((filename || 'publipostage') + '.pdf');
    return true;
  }

  // Export PDF en lot (une ligne Grist -> un blob PDF, cf. js/main.js onExportBatch). `blankPages` : les pages blanches de ce PDF (vide : aucune), que la fin du lot
  // rapporte (BatchFailures.showBlankPages) ; toujours vide pour une présentation (`everyPageWanted`, renderOnce).
  async function getNativePdfBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt, gridModel, quality, docFields, everyPageWanted) {
    const { docDefinition, filename } = await prepareRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt, gridModel, quality, docFields);
    const rendered = await renderDocument(docDefinition, everyPageWanted);
    return { blob: await rendered.blob(), filename, blankPages: rendered.blankPages };
  }

  return { exportCurrentRecord, getNativePdfBlobForRecord, ensurePdfLibsLoaded };
})();
