// Export PDF — 4 qualités : vectoriel (pdfmake, moteur principal de ce fichier), impression navigateur (iframe + window.print()) et raster basse/ultra
// (html2pdf.js sur un conteneur détaché, chargé à la demande par js/pdf-export-alt.js) - ces deux derniers capturent le vrai DOM résolu, jamais le docDefinition pdfmake.
const PdfExport = (function () {
  // Chargement paresseux au premier export (économise 1-2s d'ouverture). `integrity` (SRI sha384) : recalculer si la version change via `curl -s <url> |
  // openssl dgst -sha384 -binary | openssl base64 -A`.
  const PDF_LIB_URLS = [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js', integrity: 'sha384-VFQrHzqBh5qiJIU0uGU5CIW3+OWpdGGJM9LBnGbuIH2mkICcFZ7lPd/AAtI7SNf7' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.min.js', integrity: 'sha384-dWs4+zGqy/KS6giKxiK+6iowhidQwjVFaiE1lMar36QwIulE44VyBSQp0brMCx4D' },
    // Chemins relatifs à index.html, même origine que la page : pas de SRI nécessaire (une compromission serait déjà celle du dépôt lui-même).
    { src: 'js/pdf-fonts.js?v=0.67' },
    { src: 'js/pdf-fonts-extra.js?v=0.67' },
    // Les deux polices de cases à cocher des variables Oui / Non (dev-tests/build-pdf-boxes-font.py) : ~3 Ko, lues par inlineRuns.
    { src: 'js/pdf-fonts-boxes.js?v=0.1' },
  ];
  let pdfLibsPromise = null;
  // Séquentiel (pas Promise.all) : pdf-fonts*.js lisent window.pdfMake.vfs à l'exécution, donc doivent s'exécuter après pdfmake.min.js/vfs_fonts.min.js.
  async function ensurePdfLibsLoaded() {
    if (!pdfLibsPromise) {
      pdfLibsPromise = (async () => {
        for (const lib of PDF_LIB_URLS) await ExportCommon.loadScriptOnce(lib);
      })().catch(e => { pdfLibsPromise = null; throw e; });
    }
    return pdfLibsPromise;
  }

  const PX_TO_PT = 72 / 96;
  // Doit correspondre à .tiptap { font-size: 14px } (css/editor-v2.css) : 14 × 0.75 = 10.5pt, la taille de tout texte sans taille inline explicite.
  const DEFAULT_FONT_SIZE = 10.5;
  // .tiptap { line-height: 1.42 }. `lineHeight` de pdfmake multiplie l'interligne par défaut de Roboto (≈1.171875 pour 11pt) - diviser par ce ratio annule
  // cet interligne natif avant d'appliquer le nôtre.
  const EDITOR_LINE_HEIGHT_RATIO = 1.42;
  const PDFMAKE_DEFAULT_LINE_RATIO = 1.171875;
  const LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / PDFMAKE_DEFAULT_LINE_RATIO;
  const HEADING_SIZES = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 };
  // Lien : #0563C1 (bleu de lien de Word) et soulignement, comme `.tiptap a` (css/editor-v2.css). Bloc de code : Cousine (métrique de Courier New, déjà embarquée), 9,5pt comme
  // `.tiptap pre`, interligne de 1.42 - rapporté au rapport naturel de Cousine (≈1.1328, comme LINE_HEIGHT_RATIO l'est à celui de Roboto) pour que la ligne mesure la même hauteur.
  const LINK_COLOR = '#0563c1';
  const CODE_FONT = 'Cousine';
  const CODE_FONT_SIZE = 9.5;
  const CODE_LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / 1.1328;
  const CODE_BOX_COLOR = '#d0d7de';
  const CODE_FILL_COLOR = '#f6f8fa';
  const CODE_TEXT_COLOR = '#1b2430';
  // Marges de page (pt) - variables de module plutôt que des constantes : réglées par setPageMarginsPt() une fois par export (même schéma que
  // footnoteCounter/footnoteEntries ci-dessous, réinitialisés une fois par passage racine). 28pt sur les 4 côtés = comportement d'avant PageLayout, repli
  // si l'appelant ne fournit aucune marge (compatibilité ascendante totale).
  let marginTopPt = 28, marginRightPt = 28, marginBottomPt = 28, marginLeftPt = 28;
  // Page courante (pt) : A4 portrait par défaut, au format et dans le sens que PageLayout.getMarginsPt() joint aux marges (setPageMarginsPt). Variables de
  // module pour la même raison que les marges ci-dessus.
  let pageOrientation = 'portrait';
  let pageFormat = 'A4';
  let pageWidthPt = 595.28, pageHeightPt = 841.89;
  // Filigrane du modèle (PageLayout.normalizeWatermark) : il voyage avec les marges comme le sens et le format, absent = aucun. Peint par buildNativeDocDefinition.
  let pageWatermark = null;
  // Notes de bas de page : collectées par inlineRuns à toute profondeur d'appel (cellule/colonne/corps) - variables de module plutôt qu'un paramètre
  // traversant tableFrom/twoColumnsFrom/cellLineToPdfObject. Remises à zéro à chaque buildPdfContentFromRoot racine (une fois par passe, cf. isTopLevel).
  let footnoteCounter = 0;
  let footnoteEntries = [];
  // Lignes justifiées posées à la main (buildJustifiedLine) : leur étirement est estimé dans le navigateur, puis corrigé sur la largeur que pdfmake leur trouve vraiment (learnStretchedLines, appelée par
  // resolveNativePdfContent). `stretchedBlocks` : les blocs de la passe en cours ; `stretchExtra` : l'écart par intervalle appris, par ligne, pour la passe suivante.
  let stretchedBlocks = [];
  let stretchExtra = new Map();
  let stretching = false; // vrai le temps de resolveNativePdfContent, la seule à mesurer puis corriger les lignes étirées
  // Bande fixe (pas dynamique par page - pdfmake ne le permet pas) réservée en pied de page pour ~4 lignes de note à 8pt ; un empilement extrême de notes
  // très longues sur une page peut la déborder (limite assumée).
  const FOOTNOTE_BAND_PT = 4 * 8 * 1.15 + 8; // ≈ 4 lignes à 8pt + le filet séparateur
  // Hauteur utile d'une page (pt), marges, bandes d'en-tête et de pied et bande des notes déduites : posée une fois par passage dans resolveNativePdfContent, lue par tableFrom pour
  // savoir si les lignes d'un tableau tiennent dans une page. 0 tant qu'elle n'est pas posée : aucun tableau n'est alors gardé en lignes entières.
  let tablePageHeightPt = 0;
  // left/top d'une image en calque sont relatifs au padding de `.tiptap` (= marge de page en Aperçu A4), mais l'hôte de mesure PDF a un padding nul -
  // soustrait une seule fois avant toute comparaison/interpolation. Deux valeurs séparées (pas une seule) depuis que les marges peuvent être asymétriques.
  let A4_PREVIEW_PADDING_TOP_PX = marginTopPt / PX_TO_PT;
  let A4_PREVIEW_PADDING_LEFT_PX = marginLeftPt / PX_TO_PT;

  // ProseMirror pose `white-space: break-spaces` (l'espace avant un retour à la ligne compte dans la largeur), pas `normal` comme pdfmake (l'espace dépasse
  // sans compter, un mot de plus peut tenir) - compensé en retranchant la largeur d'un espace (mesurée une fois, mise en cache) de chaque largeur d'habillage.
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

  // Réglé une fois par export (cf. exportCurrentRecord/getNativePdfBlobForRecord) à partir des marges du modèle courant (js/page-layout.js) - recalcule
  // toutes les valeurs dérivées. `marginsPt` absent/partiel retombe côté appelant sur les valeurs par défaut de PageLayout (28pt), jamais ici : ce module
  // reste un pur convertisseur pt->dérivées. Seules les dimensions de page viennent de PageLayout.pageSizePtFor (fonction pure, sans état), comme
  // PageLayout.pageNumberText plus bas.
  function setPageMarginsPt(marginsPt) {
    const m = marginsPt || {};
    marginTopPt = Number.isFinite(m.top) ? m.top : 28;
    marginRightPt = Number.isFinite(m.right) ? m.right : 28;
    marginBottomPt = Number.isFinite(m.bottom) ? m.bottom : 28;
    marginLeftPt = Number.isFinite(m.left) ? m.left : 28;
    // Sens et format de la page : ils voyagent avec les marges (PageLayout.getMarginsPt). Absents (appel historique) = A4 portrait. Les dimensions viennent de
    // PageLayout.pageSizePtFor pour qu'il n'y ait qu'un seul endroit où elles sont écrites.
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

  // Police web-safe -> police pdfmake réellement embarquée (pdfmake ne peut jamais utiliser une police système) : équivalents libres à métrique identique.
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

  // pdfmake n'interprète pas `rgb(r,g,b)` (rend en noir, sans erreur) - or c'est la forme que le navigateur renvoie pour tout style inline posé en hexa une
  // fois repassé par le DOM. Convertit vers l'hexa ; laisse passer un nom de couleur CSS ou un hexa déjà présent.
  function cssColorToHex(value) {
    if (!value) return null;
    const v = value.trim();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (!m) return v;
    const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
  }

  // Style hérité d'un nœud DOM -> attributs de "run" pdfmake. Point de passage unique pour tout texte, où qu'il vive dans le schéma.
  function inheritedStyle(node, parent) {
    const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const tag = node.nodeType === 1 ? node.tagName : '';
    const out = Object.assign({}, parent);
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.fontSize = HEADING_SIZES[tag]; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') addDecoration(out, 'underline');
    // Lien : le clic part du run lui-même (`link`, annotation pdfmake), hérité par tout ce qui est dans le <a>. La couleur du lien l'emporte sur celle d'un parent mais
    // pas sur celle d'un <span> posé DEDANS (css('color') plus bas), comme `.tiptap a` face à un texte coloré.
    const linkHref = tag === 'A' ? HtmlSanitize.safeLinkHref(node.getAttribute('href')) : null;
    if (linkHref) {
      out.link = linkHref;
      out.color = LINK_COLOR;
      addDecoration(out, 'underline');
    }
    if (tag === 'PRE') { out.font = CODE_FONT; out.fontSize = CODE_FONT_SIZE; out.color = CODE_TEXT_COLOR; out.preserveLeadingSpaces = true; }
    // Légende (js/caption.js) : un paragraphe `data-caption` est en petit, italique, gris - la base de ses runs ; la taille ou la couleur d'un <span> posé dedans l'emportent plus bas, comme dans l'éditeur.
    if (tag === 'P' && node.hasAttribute('data-caption')) { out.italics = true; out.fontSize = Caption.SIZE_PT; out.color = Caption.COLOR; }
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') addDecoration(out, 'lineThrough');
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
    return out;
  }

  // Alignement réel : TipTap (extension-text-align) pose toujours un style inline `text-align`, jamais de classe - pas de repli ql-align-*/attribut legacy
  // align="" à gérer ici (aucune des deux formes ne peut exister dans du HTML produit par cet éditeur).
  function alignment(node) {
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  // Construit le contenu pdfmake d'un sommaire à partir des blocs-titre déjà rencontrés - texte et niveau toujours connus dès cet appel, mais PAS le numéro
  // de page (dépend d'une 1ère passe de mise en page, cf. resolveNativePdfContent) : chaque entrée réserve sa propre cellule vide, patchée après coup.
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
        columns: [{ text: hb._headingText || '', bold: isH1, fontSize }, pageCell],
        columnGap: 4,
        margin: [Math.max(0, level - 1) * 14, isH1 ? 6 : 2, 0, 2],
      };
    });
    return { stack: [title].concat(lines), pageNumberCells };
  }

  // Indentation réelle d'un bloc, mesurée dans un hôte .tiptap hors-écran (hérite le CSS des listes/citations) plutôt que devinée. 'box' (LI) : bord de la
  // boîte (le marqueur est ajouté à part par listMarkerFor). 'text' : premier caractère rendu, capture aussi un padding/bordure propre.
  function measureIndentPt(node, mode) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const hostLeft = host.getBoundingClientRect().left;
    // Neutralise une contamination par un flottement CSS (image "au cœur du texte") débordant d'un frère précédent, qui décalerait sinon la mesure comme un
    // faux retrait sémantique fixé pour tout le paragraphe. Ne touche que la mesure des paragraphes suivants (retiré aussitôt après).
    const previousClear = node.style.clear;
    node.style.clear = 'both';
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else {
      // Case d'une variable Oui / Non (`.resolved-checkbox`) : le premier « caractère rendu » d'un paragraphe qui commence par elle est la case, pas son ☑ / ☐ (poussé hors de sa boîte
      // par `text-indent` : le mesurer décalait tout le paragraphe d'une quarantaine de pt) ni le texte qui la suit (sa case lui ferait un faux retrait).
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => {
          if (n.nodeType === Node.ELEMENT_NODE) return n.classList.contains('resolved-checkbox') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          return (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      const first = walker.nextNode();
      if (!first) { node.style.clear = previousClear; return 0; }
      // Neutralise temporairement l'alignement du bloc pendant la mesure - un bloc centré/aligné à droite pousse son texte loin du bord gauche du large hôte
      // de mesure, ce qui n'est PAS un retrait réel.
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

  // Hôte de mesure hors-écran (ExportCommon.attachMeasureHost) : la classe .pdf-measure-host permet à un nœud de retrouver son hôte (cf. closest ci-dessus),
  // la largeur retombe sur celle du contenu de page quand l'appelant n'en donne pas.
  const attachPdfMeasureHost = (root, widthPx) => ExportCommon.attachMeasureHost(root, widthPx || CONTENT_WIDTH_PX, 'pdf-measure-host');

  const FLOW_IMAGE_NODES = new WeakMap();
  function pdfImageFromNode(node) {
    const layer = node.getAttribute('data-layer') || 'normal';
    const layered = layer !== 'normal' && node.style.position === 'absolute';
    const styleWidthPx = parseFloat(node.style.width) || 320;
    // Image dans le texte : ramenée à la largeur de ce qui la contient, comme dans l'éditeur (ExportCommon.shownImageWidthPx) - sans cela, une image réglée plus
    // large que la page, la case ou la colonne sortait en entier et dépassait le bord. Une image en calque garde sa taille réglée.
    const widthPx = layered ? styleWidthPx : ExportCommon.shownImageWidthPx(node, styleWidthPx);
    const image = { image: node.getAttribute('src') };
    // Image liée à une #Variable Attachments : boîte width×height fixe, mais chaque ligne Grist y insère une image de ratio différent - `fit` (pdfmake) la
    // met à l'échelle sans la déformer. `width` reste posé en plus (jamais lu par pdfmake ici, mais lu par le bracketing d'image en calque, sinon NaN).
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (node.hasAttribute('data-var-table')) {
      const heightPx = parseFloat(node.style.height) || 240;
      image.fit = [image.width, Math.max(15, heightPx * PX_TO_PT)];
    }
    const opacity = parseFloat(node.style.opacity);
    if (Number.isFinite(opacity) && opacity < 1) image.opacity = opacity;
    if (layered) {
      // Position réelle résolue plus tard par ancrage/interpolation (une formule directe depuis le pixel `top` n'a aucune notion de pagination PDF). Garde
      // une référence au nœud DOM réel (encore attaché à l'hôte de mesure) pour mesurer sa position par rapport aux blocs de texte voisins.
      image._pendingImgNode = node;
      // Conservé jusqu'à la relocation dans content[] : pdfmake peint content[] séquentiellement, "devant" et "derrière" n'ont donc pas la même direction
      // d'insertion par rapport à leur bloc-ancre.
      image._pendingLayer = layer;
      // Placeholder écrasé une fois l'ancrage résolu : sans absolutePosition, pdfmake traite ce bloc comme un élément de flux et lui réserve sa propre
      // hauteur dès la 1ère passe de mesure, gonflant à tort la position mesurée des blocs suivants (~46pt d'écart, exactement la hauteur de l'image).
      image.absolutePosition = { x: 0, y: 0 };
      // Grille page (data-page-index/left/top-pt) : position capturée UNE FOIS dans l'éditeur (Aperçu A4), directement depuis le DOM déjà mis en page -
      // prioritaire sur tout le système d'ancrage/bracketing ci-dessous dès qu'elle existe (resolveNativePdfContent), pour un rendu garanti identique à
      // l'éditeur. Absente pour un document ancien (jamais repositionné depuis) ou positionné hors Aperçu A4 - repli sur l'ancrage historique.
      if (node.hasAttribute('data-page-index')) {
        const pageIndex = parseInt(node.getAttribute('data-page-index'), 10);
        const pageLeftPt = parseFloat(node.getAttribute('data-page-left-pt'));
        const pageTopPt = parseFloat(node.getAttribute('data-page-top-pt'));
        if (Number.isFinite(pageIndex) && Number.isFinite(pageLeftPt) && Number.isFinite(pageTopPt)) {
          image._pageGrid = { pageIndex, pageLeftPt, pageTopPt, macroSlot: node.getAttribute('data-macro-slot') };
          // « Sur toutes les pages » (js/page-layer.js) : peinte en fond de CHAQUE page de son courrier, pas seulement de celle où elle a été posée (resolveNativePdfContent).
          if (PageLayer.isRepeatedEl(node)) image._repeat = true;
        }
      }
    } else {
      const align = node.getAttribute('data-align');
      // gauche/droite = habillage (float CSS) géré par floatedImageParagraphFrom (colonne image + colonne texte), pas par `alignment` de pdfmake (qui
      // n'aurait fait qu'aligner l'image seule, sans habiller le texte autour).
      if (align === 'left' || align === 'right') {
        image._floatAlign = align;
        image._sourceImgNode = node;
      } else {
        image.margin = [0, 2, 0, 4];
        if (align) image.alignment = align;
        // Le nœud DOM d'une image du flux (ni calque, ni habillage), hors de l'objet pdfmake : inFlowImageBlocksFrom y lit sa boîte et sa ligne.
        FLOW_IMAGE_NODES.set(image, node);
      }
    }
    return image;
  }

  // Numéro d'une note de bas de page, compté une seule fois : le texte d'un paragraphe coupé en lignes ou en morceaux (extractRunsBetweenRaw) est relu sur des copies du nœud. Le numéro se pose sur la note à
  // sa première lecture (data-pdf-footnote-number, sur l'hôte de mesure de cette passe) et les copies le reprennent tel quel : sans cela chaque relecture ajoutait une note en plus au bas de page.
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

  // IMPORTANT : ne retourne jamais d'image dans ce tableau de "runs" - un objet { image: ... } glissé dans le texte n'est pas une syntaxe pdfmake valide
  // (silencieusement ignoré). Les images rencontrées sont accumulées à part (`images`) pour être ajoutées par l'appelant comme blocs propres.
  function inlineRuns(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE });
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ text: node.nodeValue, ...style }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.classList.contains('page-break-marker')) return [];
    // Ne devrait normalement jamais être rencontré ici : ReaderMode.preview résout déjà chaque badge en texte simple avant ce module - gardé par robustesse.
    if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }];
    // Contrairement à .var-badge, aucune valeur réelle n'existe avant que pdfmake choisisse le numéro de page final - marqueur résolu plus tard par
    // resolvePageNumberPlaceholders à chaque callback header/footer natif.
    if (node.classList.contains('page-number-badge')) {
      return [{ text: '#', ...style, _pendingPageNumber: { format: node.getAttribute('data-format') || 'n' } }];
    }
    if (node.classList.contains('smart-chip')) return [{ text: node.textContent || '', ...style }];
    // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : un glyphe des polices de cases (js/pdf-fonts-boxes.js) - la police du texte n'a ni ☑ ni ☐ -, de la taille du texte et de
    // la couleur de la case (style en ligne, déjà lu par inheritedStyle). Jamais barrée, grasse ni en italique : le barré d'une case d'accent cochée vise le texte qui la suit, pas une autre case.
    if (node.classList.contains('resolved-checkbox')) {
      const box = Object.assign({}, style, {
        text: node.getAttribute('data-checked') === 'true' ? '\u2611' : '\u2610',
        font: node.getAttribute('data-checkbox-style') === 'classic' ? 'PPBoxClassic' : 'PPBoxAccent',
      });
      delete box.decoration; delete box.bold; delete box.italics;
      return [box];
    }
    // Le numéro (contrairement à .page-number-badge) n'a aucune dépendance à la pagination - assigné immédiatement via un compteur de module (remis à 0 une
    // fois par passe) plutôt qu'un paramètre à faire traverser tableFrom/twoColumnsFrom/cellLineToPdfObject, correct à toute profondeur.
    if (node.classList.contains('footnote-ref-marker')) {
      const number = footnoteNumberOf(node);
      return [{ text: String(number), ...style, sup: true, fontSize: (style.fontSize || DEFAULT_FONT_SIZE) * 0.7 }];
    }
    if (node.tagName === 'IMG') {
      if (images && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) {
        images.push(pdfImageFromNode(node));
        // Marqueur de position (jamais un run pdfmake valide) : permet à blockFrom de reconstituer l'ordre réel texte/image d'origine - sans lui une image
        // "au cœur du texte" sautait en fin de paragraphe.
        return [{ _imageMarker: true }];
      }
      return [];
    }
    // data-pdf-measure-filler : <br> injecté juste pour donner une hauteur réelle à un bloc vraiment vide dans l'hôte de mesure, jamais un vrai retour à la
    // ligne saisi par l'utilisateur - ne produit aucun run.
    if (node.tagName === 'BR') return node.hasAttribute('data-pdf-measure-filler') ? [] : [{ text: '\n', ...style }];
    let runs = [];
    let sawLineBlock = false;
    node.childNodes.forEach(child => {
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) runs.push({ text: '\n', ...style });
      if (isLineBlock) sawLineBlock = true;
      runs = runs.concat(inlineRuns(child, style, images));
    });
    return runs;
  }
  // Comme inlineRuns, mais ignore les <ul>/<ol> DIRECTS - une sous-liste imbriquée doit produire SES PROPRES blocs (un par <li>), pas être aplatie dans le
  // texte du <li> parent.
  function inlineRunsExcludingNestedLists(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle);
    let runs = [];
    let sawLineBlock = false;
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) return;
      // Un bloc de code posé après le texte de l'item (ou un paragraphe après lui) commence sa propre ligne, comme dans inlineRuns.
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) runs.push({ text: '\n', ...style });
      if (isLineBlock) sawLineBlock = true;
      runs = runs.concat(inlineRuns(child, style, images));
    });
    return runs;
  }
  // inlineRuns glisse un marqueur `{_imageMarker:true}` pour que blockFrom() reconstitue l'ordre réel texte/image ; tout autre appelant doit le retirer, un
  // objet sans `text` ni `image` fait planter pdfmake.
  function stripImageMarkers(runs) { return runs.filter(r => !r._imageMarker); }

  // 'circle'/'square' n'utilisent pas les vrais glyphes Unicode ○/▪ : vérifié (décodage PDF via pdf.js) que pdfmake/PDFKit n'embarque les TTF qu'en WinAnsi -
  // tout caractère au-delà de U+00FF ressort invisible. '°' reste dans cette plage (cercle creux) ; '*' pour le carré, pas '#' (collision avec #Variable).
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

  // Case à cocher dessinée en vectoriel via `canvas` plutôt qu'en glyphe de police (☑/☐ hors WinAnsi, même contrainte que les puces rondes/carrées) : un
  // rectangle + une coche ne dépendent d'aucune police embarquée.
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

  // Reflète la règle CSS text-decoration:line-through, qu'inheritedStyle ne peut pas lire (style inline d'un nœud seulement, jamais une règle externe).
  function taskListRuns(node, runs) {
    const parent = node.parentElement;
    const checked = node.getAttribute('data-checked') === 'true';
    const style = (parent && parent.getAttribute('data-tasklist-style')) || 'accentStrike';
    const base = runs.length ? runs : [{ text: ' ' }];
    if (!checked || style === 'classic' || style === 'accentPlain') return base;
    return base.map(r => Object.assign({}, r, {
      decoration: Array.isArray(r.decoration) ? r.decoration.concat('lineThrough') : (r.decoration ? [r.decoration, 'lineThrough'] : ['lineThrough']),
      color: r.color || '#667085', // le gris de la Lecture (--paper-text-faint, 4,97:1 sur blanc) ; c'était #98a2b3, 2,6:1
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

  // Le navigateur COLLAPSE les espaces/retours en tout début/fin de bloc - pdfmake prend le texte tel quel. Sans ce trim, un espace ou retour ligne superflu
  // en tête/fin de paragraphe (fréquent après une image ou un saut de ligne) produit un décalage visible dans un texte centré/justifié.
  function trimEdgeWhitespace(runs) {
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[0].text)) runs.shift();
    if (runs.length) runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^[ \t\n\r\f\v]+/, '') });
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[runs.length - 1].text)) runs.pop();
    if (runs.length) { const last = runs.length - 1; runs[last] = Object.assign({}, runs[last], { text: runs[last].text.replace(/[ \t\n\r\f\v]+$/, '') }); }
    return runs;
  }

  // Découpe les enfants directs d'une cellule/sous-liste en "lignes" pdfmake : <p>/<div>/<h1-6> direct = sa propre ligne ; <ul>/<ol> direct = une ligne par
  // <li> (récursif) ; tout le reste s'accumule dans un groupe "inline".
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
  // Rattache une image en calque à `obj` comme ancre locale : dans une cellule, le paragraphe hôte est la référence la plus proche, pas besoin de bracketing.
  // Pas de correction A4_PREVIEW_PADDING_TOP/LEFT_PX ici : la cellule a son propre position:relative, seule la différence avec le conteneur compte.
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
  // Image "au coeur du texte" (flux normal, non en calque) alignée gauche/ droite - cible de l'habillage `columns` (cf. floatedImageParagraphFrom), par
  // opposition à une image en calque ou sans alignement gauche/droite.
  function findFloatImageIn(node) {
    return Array.from(node.querySelectorAll('img.editor-image')).find(img => {
      const align = img.getAttribute('data-align');
      const layer = img.getAttribute('data-layer') || 'normal';
      return layer === 'normal' && (align === 'left' || align === 'right');
    });
  }
  // Une ligne de la case, avec l'habillage d'une image qui flotte (`state.floatCarry`, d'une ligne à l'autre, comme blockFrom dans le flux principal) : le texte d'une ligne suivante se range à côté de l'image qui la
  // déborde, une autre ligne (liste, titre, code) repart sous elle. `state.lastBottomPx` : le bas de la dernière ligne de texte, pour la hauteur que l'image donne à la case.
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
    if (state) {
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
    return obj;
  }
  function cellLineObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
    if (line.inline) {
      const before = images.length;
      let runs = [];
      line.inline.forEach(n => { runs = runs.concat(inlineRuns(n, cellBaseStyle, images)); });
      runs = trimEdgeWhitespace(stripImageMarkers(runs));
      const obj = { text: runs.length ? runs : ' ' };
      if (cellAlign) obj.alignment = cellAlign;
      attributeNestedPendingImages(images, before, obj, line.inline[0].parentElement || line.inline[0], rootRect, nestedPending);
      return obj;
    }
    const node = line;
    // Bloc de code dans une cellule de tableau : le même cadre gris que dans le flux principal, en tableau imbriqué à la largeur de la cellule.
    if (node.tagName === 'PRE') return codeBlockFrom(node, false, true);
    // Même chemin d'habillage que le flux principal (floatedImageParagraphFrom), avec la largeur RÉELLE de la cellule (cf. tableFrom) au lieu de la pleine
    // page.
    if (/^(P|DIV)$/.test(node.tagName)) {
      const floatImgEl = findFloatImageIn(node);
      if (floatImgEl) {
        // L'image habillée est un calque et le texte se range à côté en blocs décalés, comme dans le flux principal ; l'ancien habillage en colonnes quand le paragraphe ne s'y prête pas.
        const overlaid = floatParagraphBlocksFrom(node, false, { nested: true, maxWidthPt: cellWidthPt });
        if (overlaid) return overlaid;
        const floated = floatedImageParagraphFrom(node, false, cellWidthPt);
        if (floated) return floated;
      }
    }
    const isLi = node.tagName === 'LI';
    const before = images.length;
    const rawRuns = isLi ? inlineRunsExcludingNestedLists(node, cellBaseStyle, images) : inlineRuns(node, cellBaseStyle, images);
    // Une image du flux (dans la ligne, « bloc », centrée) dans un paragraphe de la case : le texte et l'image posés où le navigateur les met, comme dans le flux principal (inFlowImageBlocksFrom). Les images en calque
    // restent dans `images`, que la case ajoute à sa suite et rattache à ce paragraphe ; celles du flux sont désormais dans les blocs.
    if (/^(P|DIV)$/.test(node.tagName) && rawRuns.some(r => r._imageMarker) && !images.slice(before).some(img => img._floatAlign)) {
      const flowBlocks = inFlowImageBlocksFrom(node, images.slice(before), false, { keepLayered: true, textAlign: cellAlign, baseStyle: cellBaseStyle, maxWidthPt: cellWidthPt });
      if (flowBlocks) {
        for (let i = images.length - 1; i >= before; i -= 1) if (FLOW_IMAGE_NODES.has(images[i])) images.splice(i, 1);
        attributeNestedPendingImages(images, before, flowBlocks.find(b => b.text !== undefined) || flowBlocks[0], node, rootRect, nestedPending);
        return flowBlocks;
      }
    }
    const runs = trimEdgeWhitespace(stripImageMarkers(rawRuns));
    const align = alignment(node) || cellAlign;
    let obj;
    if (isLi && isTaskListItem(node)) {
      obj = { columns: taskListColumns(node, taskListRuns(node, runs), align), margin: [measureIndentPt(node, 'box'), 0, 0, 0] };
    } else {
      const marker = isLi ? listMarkerFor(node) : '';
      const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
      obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, 0, 0] };
      if (align) obj.alignment = align;
      if (!runs.length && node.tagName === 'P' && node.hasAttribute('data-caption')) obj.fontSize = Caption.SIZE_PT;
    }
    attributeNestedPendingImages(images, before, obj, node, rootRect, nestedPending);
    return obj;
  }
  // Une cellule multi-lignes devient un stack pdfmake ; sinon le texte reste à plat, sauf si des images ont été trouvées (pdfmake n'accepte pas d'image au
  // milieu d'un tableau de `text`, elle atterrit après le texte).
  function cellContentFrom(cell, cellWidthPt, rootRect) {
    const lines = [];
    collectCellLines(cell, lines);
    const images = [];
    const nestedPending = [];
    if (!lines.length) return { text: ' ' };
    if (lines.length === 1 && lines[0].inline) {
      const runs = trimEdgeWhitespace(stripImageMarkers(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }, images)));
      const textObj = { text: runs.length ? runs : ' ' };
      if (!images.length) return textObj;
      const finalStack = [textObj].concat(images);
      attributeNestedPendingImages(images, 0, textObj, cell, rootRect, nestedPending);
      nestedPending.forEach(p => { p.parentArray = finalStack; });
      const result = { stack: finalStack };
      if (nestedPending.length) result._nestedPending = nestedPending;
      return result;
    }
    const cellAlign = alignment(cell);
    const cellBaseStyle = inheritedStyle(cell, { fontSize: DEFAULT_FONT_SIZE });
    const stack = [];
    const floatState = { floatCarry: null, lastBottomPx: null };
    lines.forEach(line => {
      const obj = cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending, floatState);
      if (Array.isArray(obj)) obj.forEach(o => stack.push(o)); else stack.push(obj);
    });
    // Une image habillée plus basse que le texte de la case lui donne sa hauteur (la case contient ses flottantes) : le bas de la dernière ligne la rejoint.
    if (floatState.floatCarry && floatState.lastBottomPx != null) {
      const lastFlow = stack.slice().reverse().find(b => b && !b._pendingImgNode && !b.absolutePosition);
      const extraPt = (floatState.floatCarry.floatBottomPx - floatState.lastBottomPx) * PX_TO_PT;
      if (extraPt > 0.5 && lastFlow) addBottomMargin(lastFlow, extraPt);
    }
    const finalStack = stack.concat(images);
    nestedPending.forEach(p => { p.parentArray = finalStack; });
    const result = { stack: finalStack };
    if (nestedPending.length) result._nestedPending = nestedPending;
    return result;
  }

  const TABLE_BORDER_COLOR = '#777777'; // le trait fin d'un tableau, celui de départ d'une case de grille
  function tableFrom(node, pageBreakBefore, rootRect, inMainFlow) {
    const rows = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    const rawRows = rows.length ? rows : Array.from(node.querySelectorAll('tr'));
    const cellsOf = row => Array.from(row.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName));
    const columnCount = Math.max(1, ...rawRows.map(row => cellsOf(row).reduce((sum, cell) => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      return sum + span;
    }, 0)));
    // Padding de cellule mesuré sur le CSS réel, pas une constante approximative (un ancien "4pt/3pt" arrondi creusait un écart mesurable avec l'éditeur) -
    // sert au budget de largeur ET à layout.paddingLeft/Right, un seul chiffre plutôt que deux valeurs qui pourraient diverger.
    const firstCell = rawRows.length ? cellsOf(rawRows[0])[0] : null;
    const cellCs = firstCell ? getComputedStyle(firstCell) : null;
    const cellPadLeftPt = cellCs ? (parseFloat(cellCs.paddingLeft) || 0) * PX_TO_PT : 4.5;
    const cellPadRightPt = cellCs ? (parseFloat(cellCs.paddingRight) || 0) * PX_TO_PT : 4.5;
    const cellPadTopPt = cellCs ? (parseFloat(cellCs.paddingTop) || 0) * PX_TO_PT : 3;
    const cellPadBottomPt = cellCs ? (parseFloat(cellCs.paddingBottom) || 0) * PX_TO_PT : 3;
    const availableWidthPt = CONTENT_WIDTH_PT;
    const minColWidthPt = 12;
    // pdfmake ajoute paddingLeft+paddingRight à chaque colonne EN PLUS de `widths` (vérifié en décodant le PDF généré) - retiré avant de répartir pour que le
    // total rendu retombe exactement sur la largeur de page.
    const cellPaddingPt = cellPadLeftPt + cellPadRightPt;
    const usableForColumnsPt = Math.max(minColWidthPt * columnCount, availableWidthPt - columnCount * cellPaddingPt);
    const measuredPx = ExportCommon.measuredColumnWidthsPx(node, columnCount);
    const measuredPt = measuredPx ? measuredPx.map(px => px * PX_TO_PT) : null;
    const measuredSum = measuredPt ? measuredPt.reduce((sum, w) => sum + w, 0) : 0;
    // Cible de répartition : la largeur réelle du tableau si elle tient dans la page, pas systématiquement la pleine largeur - un tableau rétréci par
    // l'utilisateur redevenait pleine largeur à l'export (bug confirmé). usableForColumnsPt reste la limite au-delà de laquelle réduire quand même.
    const targetTotalPt = measuredSum > 0 ? Math.min(measuredSum, usableForColumnsPt) : usableForColumnsPt;
    let widths;
    if (measuredPt && measuredSum > 0) {
      widths = measuredPt.map(w => (w / measuredSum) * targetTotalPt);
      const flooredTotal = widths.reduce((sum, w) => sum + Math.max(minColWidthPt, w), 0);
      if (flooredTotal > usableForColumnsPt) {
        const deficit = flooredTotal - usableForColumnsPt;
        const aboveFloorTotal = widths.reduce((sum, w) => sum + (w > minColWidthPt ? w : 0), 0) || 1;
        widths = widths.map(w => w > minColWidthPt ? Math.max(minColWidthPt, w - deficit * (w / aboveFloorTotal)) : minColWidthPt);
      } else {
        widths = widths.map(w => Math.max(minColWidthPt, w));
      }
    } else {
      widths = Array(columnCount).fill(Math.max(minColWidthPt, usableForColumnsPt / columnCount));
    }
    // spaceWidthPt() retranché par colonne, après la répartition (pas dans le budget total avant répartition, qui la diluerait au prorata de chaque colonne)
    // : compense white-space:break-spaces. ×1.5 vérifié par recherche dichotomique - ×1 laissait encore, de justesse, un mot de trop tenir.
    widths = widths.map(w => Math.max(minColWidthPt, w - spaceWidthPt() * 1.5));
    // Images en calque imbriquées dans une cellule, portées sur `table._nestedPending`, remontées jusqu'à buildPdfContentFromRoot (même résolution que le
    // top-level).
    const tableNestedPending = [];
    // Grille (js/grid-editor.js) : chaque ligne porte sa hauteur en px (`data-row-height`, un MINIMUM : un texte plus haut agrandit la ligne) et chaque case son alignement vertical.
    // `heights` de pdfmake est la hauteur du CONTENU de la ligne - sans les marges intérieures ni le trait - et un minimum lui aussi ; la hauteur mesurée dans l'hôte (qui compte
    // la croissance due au texte) la complète. pdfmake ne centre rien dans une case : le centrage est une marge haute, calculée sur la hauteur du texte mesurée dans l'hôte.
    const isGrid = rawRows.some(row => row.hasAttribute('data-row-height'));
    const GRID_BORDER_PT = 0.5; // hLineWidth du layout plus bas
    // Bords réglés d'une grille (barre de la case, js/table-borders.js) : le trait de départ est celui du layout plus bas ; pdfmake dessine un trait dès que l'une des deux cases voisines le veut,
    // et lit les bords d'une case fusionnée sur sa case de départ seule (les `{}` qui la prolongent n'y changent rien : vérifié en lisant les traits du PDF) - chaque case porte donc ses
    // quatre côtés, et les cases voisines, d'accord avec elle sur le trait qu'elles se partagent, disent la même chose.
    const borderSides = isGrid ? ExportCommon.cellBorderSides(node) : null;
    const edgeColor = value => (value && value !== TableBorders.NONE ? value : TABLE_BORDER_COLOR);
    const gridRowAreaPt = isGrid ? rawRows.map(row => {
      const px = Math.max(parseFloat(row.getAttribute('data-row-height')) || 0, row.getBoundingClientRect().height);
      return Math.max(0, px * PX_TO_PT - cellPadTopPt - cellPadBottomPt - GRID_BORDER_PT);
    }) : null;
    // Une case fusionnée sur plusieurs lignes se centre (ou se pose en bas) sur la hauteur de toutes les lignes qu'elle couvre, traits et marges intérieures des lignes du milieu compris.
    const gridCellOffsetPt = (cell, rowIndex, rowSpan) => {
      const valign = cell.style.verticalAlign;
      if (valign !== 'middle' && valign !== 'bottom') return 0;
      let areaPt = (rowSpan - 1) * (cellPadTopPt + cellPadBottomPt + GRID_BORDER_PT);
      for (let i = rowIndex; i < rowIndex + rowSpan; i += 1) areaPt += gridRowAreaPt[i];
      const range = document.createRange();
      range.selectNodeContents(cell);
      const free = Math.max(0, areaPt - range.getBoundingClientRect().height * PX_TO_PT);
      return valign === 'bottom' ? free : free / 2;
    };
    // Cases fusionnées sur plusieurs lignes (`rowspan`) : le HTML ne les répète pas dans les lignes suivantes, pdfmake veut un emplacement vide ({}) à leur place, dans chaque colonne
    // qu'elles couvrent. `covered[colonne]` = nombre de lignes, sous la ligne en cours, qu'une case venue d'au-dessus occupe encore dans cette colonne.
    const covered = new Array(columnCount).fill(0);
    const body = rawRows.map((row, rowIndex) => {
      const output = [];
      const skipCovered = () => { while (output.length < columnCount && covered[output.length] > 0) { covered[output.length] -= 1; output.push({}); } };
      cellsOf(row).forEach(cell => {
        skipCovered();
        if (output.length >= columnCount) return;
        let colSpan = Math.min(columnCount - output.length, Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1));
        // Jamais par-dessus une colonne déjà prise par une case d'au-dessus (HTML venu d'ailleurs, mal formé).
        for (let i = 1; i < colSpan; i += 1) if (covered[output.length + i] > 0) { colSpan = i; break; }
        const rowSpan = Math.min(rawRows.length - rowIndex, Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1));
        const cellWidthPt = widths.slice(output.length, output.length + colSpan).reduce((sum, w) => sum + w, 0) || null;
        let content;
        try { content = cellContentFrom(cell, cellWidthPt, rootRect); }
        catch (e) { console.warn('[PdfExport] cellule de tableau ignorée (structure inattendue), repli en texte brut :', e); content = { text: (cell.textContent || '').trim() || ' ' }; }
        if (content._nestedPending) { tableNestedPending.push(...content._nestedPending); delete content._nestedPending; }
        // Pas de margin propre à la cellule : le seul inset est layout.paddingLeft/ Right/Top/Bottom ci-dessous, déjà compté dans usableForColumnsPt.
        const pdfCell = Object.assign({ border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
        if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
        if (cell.style.backgroundColor) pdfCell.fillColor = cssColorToHex(cell.style.backgroundColor);
        const sides = borderSides && borderSides.get(cell);
        if (sides) {
          pdfCell.border = [sides.left !== TableBorders.NONE, sides.top !== TableBorders.NONE, sides.right !== TableBorders.NONE, sides.bottom !== TableBorders.NONE];
          pdfCell.borderColor = [sides.left, sides.top, sides.right, sides.bottom].map(edgeColor);
        }
        if (isGrid) {
          const offsetPt = gridCellOffsetPt(cell, rowIndex, rowSpan);
          if (offsetPt > 0.25) pdfCell.margin = [0, (pdfCell.margin ? pdfCell.margin[1] : 0) + offsetPt, 0, 0];
        }
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
    });
    // Une ligne de tableau ne se coupe jamais entre deux pages (Antoine, 01/10 : « un tableau ne se coupe pas au moment du saut de page ») : elle passe en entier à la page
    // suivante quand elle ne tient pas, comme dans l'éditeur et la Lecture (js/table-page-cut.js) et dans le Word (cantSplit). Seulement pour un tableau du texte courant dont
    // toutes les lignes tiennent dans une page : avec dontBreakRows, pdfmake fait DISPARAÎTRE une ligne plus haute que la page. Les autres gardent leurs lignes coupées entre deux
    // lignes de texte, comme avant (et comme l'éditeur, qui les garde d'une pièce). Pas non plus un tableau qui porte une image en calque : avec dontBreakRows, pdfmake note les
    // positions (`positions[].left` / `.top`) du texte de ses cases dans la ligne en cours de rangement, sans le décalage de la colonne ni le rembourrage de la case (mesuré : 28 au lieu de
    // 383,7 pt dans la 3e colonne), et l'ancrage d'une image en calque ancienne (sans grille de page) se lit dessus - elle partait à gauche de la page.
    const cutRows = TablePageCut.rowsOf(node);
    const hasLayeredImage = Array.from(node.querySelectorAll('img')).some(img => (img.getAttribute('data-layer') || 'normal') !== 'normal' && img.style.position === 'absolute');
    // Une image habillée (calque du fond de page, ancré sur son texte) lit la position de son texte, que dontBreakRows fausse de la même façon.
    const hasFloatedImage = Array.from(node.querySelectorAll('img.editor-image')).some(img => (img.getAttribute('data-layer') || 'normal') === 'normal' && /^(left|right)$/.test(img.getAttribute('data-align') || ''));
    const keepRowsWhole = !!cutRows && !isGrid && !!inMainFlow && !hasLayeredImage && !hasFloatedImage && tablePageHeightPt > 0 && !(node.parentElement && node.parentElement.closest('td, th, li, blockquote, .callout, .two-columns-column'))
      && TablePageCut.rowsFit(cutRows.map(row => row.getBoundingClientRect().height * PX_TO_PT), tablePageHeightPt);
    const table = {
      table: Object.assign({ headerRows: 0, widths, body: body.length ? body : [[{ text: ' ' }].concat(Array(Math.max(0, columnCount - 1)).fill({}))] }, isGrid && body.length ? { heights: gridRowAreaPt } : {}, keepRowsWhole ? { dontBreakRows: true } : {}),
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => TABLE_BORDER_COLOR, vLineColor: () => TABLE_BORDER_COLOR,
        paddingLeft: () => cellPadLeftPt, paddingRight: () => cellPadRightPt, paddingTop: () => cellPadTopPt, paddingBottom: () => cellPadBottomPt,
      },
      margin: [0, 5, 0, 5],
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    if (tableNestedPending.length) table._nestedPending = tableNestedPending;
    // Les sauts de page d'une grille (`data-page-break-before` sur une ligne) : les tranches de lignes que tableBlocksFrom en fera.
    if (isGrid && body.length) {
      const segments = ExportCommon.gridRowSegments(rawRows);
      if (segments.length > 1) table._rowSegments = segments;
    }
    return table;
  }

  // Un tableau en un ou plusieurs blocs : une grille dont des lignes portent un saut de page (js/grid-editor.js) est coupée avant chacune, et chaque morceau ouvre une page (le premier
  // garde le saut que le tableau avait déjà). Les colonnes, le trait et les hauteurs sont ceux du tableau entier : tous les morceaux se lisent à la même largeur.
  // « Rester ensemble » (js/caption.js, choix d'Antoine du 02/10) : un tableau qui se coupe entre deux lignes et que suit une légende (`captionPt`, sa hauteur) est rendu en deux morceaux, tout
  // sauf la dernière ligne puis la dernière ligne seule (`_keepTail`) : c'est elle, avec la légende, que captionKeepRule passe à la page suivante quand la légende y serait seule. Collés,
  // les deux morceaux ne se distinguent pas du tableau entier (le trait entre eux n'est dessiné qu'une fois, par le premier) ; la dernière ligne qui ouvre une page dessine son trait du haut.
  // Seulement quand la dernière ligne et la légende tiennent ensemble dans une page (Caption.fitsWithCaption) : sinon le tableau reste d'une pièce, comme avant.
  function splitTailRow(table, node, captionPt) {
    const body = table.table.body;
    const rows = TablePageCut.rowsOf(node);
    if (!table.table.dontBreakRows || body.length < 2 || !rows || rows.length !== body.length) return null;
    const tailPt = rows[rows.length - 1].getBoundingClientRect().height * PX_TO_PT + captionPt;
    if (!Caption.fitsWithCaption(tailPt, tablePageHeightPt)) return null;
    const head = Object.assign({}, table, { table: Object.assign({}, table.table, { body: body.slice(0, -1) }), margin: [0, 5, 0, 0] });
    const baseLayout = table.layout;
    const tail = Object.assign({}, table, {
      table: Object.assign({}, table.table, { body: body.slice(-1) }),
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

  // Zone 2 colonnes : mesure la chrome CSS réelle (padding/bordure/largeur) en clonant la zone dans un hôte hors-écran, plutôt que de deviner ces valeurs.
  // Colonnes toujours 50/50 (flex: 1 1 0), pas de ratio ajustable.
  async function twoColumnsFrom(node, pageBreakBefore, rootRect) {
    const colNodes = Array.from(node.querySelectorAll(':scope > .two-columns-column')).slice(0, 2);
    if (colNodes.length < 2) return fallbackTextBlock(node, pageBreakBefore);
    const columnGapPt = 16 * PX_TO_PT; // css/editor-v2.css: .two-columns-zone { gap: 16px }
    const contentWidthPx = CONTENT_WIDTH_PT / PX_TO_PT;
    const measureHost = document.createElement('div');
    measureHost.className = 'tiptap';
    measureHost.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + contentWidthPx + 'px;';
    const zoneClone = node.cloneNode(true);
    measureHost.appendChild(zoneClone);
    document.body.appendChild(measureHost);
    const measuredCols = Array.from(zoneClone.querySelectorAll(':scope > .two-columns-column'));
    const leftPt = el => { const cs = getComputedStyle(el); return ((parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0)) * PX_TO_PT; };
    const rightPt = el => { const cs = getComputedStyle(el); return ((parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0)) * PX_TO_PT; };
    // Symétriques à leftPt/rightPt mais jamais mesurés avant ce correctif : le chrome propre à CHAQUE colonne (padding+bordure, css/style.css
    // .two-columns-column) n'était compté ni en haut ni en bas (marge intérieure de colonne toujours codée en dur à 0, cf. plus bas) - seul le chrome de la
    // ZONE (zoneChromeLeftPt, 12.75/3.75 codés en dur) était compté. Décalait TOUT le contenu d'une colonne (texte ET image en calque, vérifié identique
    // sur les deux) de la hauteur de ce chrome manquant (~5-9pt selon le CSS courant) - signalé par l'utilisateur, confirmé par comparaison position réelle
    // de l'éditeur (grille page) vs position résolue dans le PDF pour un simple bloc de texte, pas seulement l'image.
    const topPt = el => { const cs = getComputedStyle(el); return ((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0)) * PX_TO_PT; };
    const bottomPt = el => { const cs = getComputedStyle(el); return ((parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0)) * PX_TO_PT; };
    const measureTextWidthPt = el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      const bL = parseFloat(cs.borderLeftWidth) || 0, bR = parseFloat(cs.borderRightWidth) || 0;
      return Math.max(10, (r.width - padL - padR - bL - bR) * PX_TO_PT);
    };
    const fallbackWidth = CONTENT_WIDTH_PT / 2;
    const leftWidth = measuredCols[0] ? measureTextWidthPt(measuredCols[0]) : fallbackWidth;
    const rightWidth = measuredCols[1] ? measureTextWidthPt(measuredCols[1]) : fallbackWidth;
    const zoneChromeLeftPt = leftPt(zoneClone);
    // La zone a aussi sa propre marge CSS (css/editor-v2.css : `.two-columns-zone { margin: 6px 0; }`), DISTINCTE de son padding/bordure déjà mesurés par
    // topPt/bottomPt ci-dessous - jamais comptée avant ce correctif, ce qui décalait tout le contenu de la zone de ~4.5pt vers le HAUT dans le PDF par
    // rapport à l'éditeur (confirmé par comparaison avec computePageGridPosition sur un simple bloc de texte, cf. mémoire page-grid-positioning).
    const zoneCs = getComputedStyle(zoneClone);
    const zoneMarginTopPt = (parseFloat(zoneCs.marginTop) || 0) * PX_TO_PT;
    const zoneMarginBottomPt = (parseFloat(zoneCs.marginBottom) || 0) * PX_TO_PT;
    // Mesurés ICI (zoneClone est encore attaché à measureHost) : getComputedStyle sur un nœud déjà détaché (après le removeChild plus bas) renvoie
    // padding/bordure à 0, pas les vraies valeurs - piège rencontré en implémentant ce correctif.
    const zoneOwnTopPt = topPt(zoneClone) + zoneMarginTopPt;
    const zoneOwnBottomPt = bottomPt(zoneClone) + zoneMarginBottomPt;
    const colOwnInsetLeft = [measuredCols[0] ? leftPt(measuredCols[0]) : 0, measuredCols[1] ? leftPt(measuredCols[1]) : 0];
    // Pas de compensation spaceWidthPt() ici (contrairement à tableFrom) : measureTextWidthPt mesure directement la largeur de texte réelle, déjà
    // suffisamment stricte - en ajouter une ici calait un mot de moins que l'éditeur.
    const colOwnInsetRight = [
      measuredCols[0] ? rightPt(measuredCols[0]) : 0,
      measuredCols[1] ? rightPt(measuredCols[1]) : 0,
    ];
    const colOwnInsetTop = [measuredCols[0] ? topPt(measuredCols[0]) : 0, measuredCols[1] ? topPt(measuredCols[1]) : 0];
    const colOwnInsetBottom = [measuredCols[0] ? bottomPt(measuredCols[0]) : 0, measuredCols[1] ? bottomPt(measuredCols[1]) : 0];
    const colOuterWidthPt = [
      measuredCols[0] ? measuredCols[0].getBoundingClientRect().width * PX_TO_PT : leftWidth,
      measuredCols[1] ? measuredCols[1].getBoundingClientRect().width * PX_TO_PT : rightWidth,
    ];
    document.body.removeChild(measureHost);
    // Séquentiel (pas Promise.all) : footnoteCounter/footnoteEntries sont un état de module, deux appels en parallèle peuvent s'entrelacer si l'un attend un
    // décodage d'image et corrompre la numérotation des notes (bug confirmé, cf. AUDIT_CODE.md §4). Jamais plus de 2 colonnes, coût négligeable.
    const columns = [];
    for (let colIdx = 0; colIdx < colNodes.length; colIdx += 1) {
      const col = colNodes[colIdx];
      // Largeur réelle de cette colonne, pour que l'hôte de mesure interne de htmlToPdfContent habille une image flottante à la bonne largeur plutôt qu'à la
      // pleine largeur de page.
      const colWidthPt = colIdx === 0 ? leftWidth : rightWidth;
      let blocks;
      try { blocks = await htmlToPdfContent(col.innerHTML, false, colWidthPt); }
      catch (e) { console.warn('[PdfExport] contenu de colonne ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(col, false)]; }
      // Un mécanisme de ré-application d'alignement (héritage V1/Quill, `alignSources`+ré-affectation par index) vivait ici jusqu'à ce correctif : redondant
      // avec `blockFrom` (appelé par htmlToPdfContent ci-dessus), qui lit déjà `text-align` sur CHAQUE paragraphe via alignment(), colonne ou pas - vérifié
      // en le retirant complètement puis en confirmant (positions réelles extraites du PDF via pdf.js, pas les métadonnées `.positions[]` de pdfmake qui se
      // sont révélées peu fiables pour du texte centré multi-lignes) que centre/droite continuent de s'appliquer correctement. En plus d'être inutile, ce
      // mécanisme était activement nuisible : il ré-affectait l'alignement du PARAGRAPHE à "whatever bloc s'y trouvait", y compris une image en calque
      // (position:absolute) placée seule dans un paragraphe centré/aligné - pdfmake applique alors `alignment` PAR-DESSUS `absolutePosition`, décalant le
      // rendu réel de l'image de dizaines de pt sans que rien dans les métadonnées ne le révèle (repéré par l'utilisateur sur un cas réel, confirmé par
      // extraction directe des octets du PDF). Le pairage par INDEX entre `alignSources` (un nœud DOM par paragraphe) et `blocks` (qui peut contenir
      // PLUSIEURS blocs pour un seul paragraphe, ex. texte + image) pouvait aussi désynchroniser les deux tableaux et appliquer le mauvais alignement au
      // mauvais bloc - un second bug latent, éliminé par la même suppression plutôt que patché séparément.
      columns.push(blocks);
    }
    const block = {
      columns: [
        { width: colOuterWidthPt[0], stack: [{ stack: columns[0], margin: [colOwnInsetLeft[0], colOwnInsetTop[0], colOwnInsetRight[0], colOwnInsetBottom[0]] }] },
        { width: colOuterWidthPt[1], stack: [{ stack: columns[1], margin: [colOwnInsetLeft[1], colOwnInsetTop[1], colOwnInsetRight[1], colOwnInsetBottom[1]] }] },
      ],
      columnGap: columnGapPt,
      margin: [zoneChromeLeftPt, zoneOwnTopPt, 0, zoneOwnBottomPt],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
    // .two-columns-zone (node) a son propre position:relative (css/style.css, règle générique non scopée) : c'est le vrai offsetParent d'une image en
    // calque ici (vérifié empiriquement), pas .tiptap ni la colonne. Les ancres locales (container/above/below) restent mesurées depuis le début du
    // contenu de LA COLONNE (l'isolat rendu pour htmlToPdfContent) - l'image doit donc être ramenée à CE référentiel, pas simplement "dé-zoné".
    const zoneRect = node.getBoundingClientRect();
    const nestedPending = [];
    columns.forEach((colBlocks, colIdx) => {
      const pending = colBlocks._pendingImages || [];
      if (pending.length) {
        const colNode = colNodes[colIdx];
        const colRect = colNode.getBoundingClientRect();
        // container/above/belowTopPx|LeftPx sont mesurés dans l'isolat de htmlToPdfContent(col.innerHTML,...), qui ne contient QUE les enfants de la
        // colonne - son propre padding/bordure (css/style.css : 6px + 1px) n'y existe pas, ces ancres sont donc relatives au DÉBUT DU CONTENU, pas au bord
        // de la boîte de la colonne. colRect (getBoundingClientRect) mesure la boîte de bordure - sans ce décalage, l'image atterrissait ~7px (~5pt) trop
        // à gauche/haut par rapport au texte (léger mais visible, signalé par l'utilisateur après le premier correctif offsetParent).
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
    if (nestedPending.length) block._nestedPending = nestedPending;
    return block;
  }

  // L'habillage que garde un conteneur dont l'image habillée dépasse le bas (`null` : aucune ne le dépasse) : le même objet que celui qu'un paragraphe passe au suivant (floatParagraphBlocksFrom), mesuré dans le DOM.
  function floatOverflowCarryOf(container) {
    const box = container.getBoundingClientRect();
    let carry = null;
    Array.from(container.querySelectorAll('img.editor-image')).forEach(img => {
      const align = img.getAttribute('data-align');
      if ((img.getAttribute('data-layer') || 'normal') !== 'normal' || (align !== 'left' && align !== 'right')) return;
      const rect = img.getBoundingClientRect();
      const floatBottomPx = rect.bottom + FLOAT_BELOW_MARGIN_PX;
      // Le texte d'après repart du bord du conteneur, et laisse à l'image sa marge côté texte : la place prise est celle qui va de ce bord à l'autre bord de l'image, marge comprise.
      const shiftPx = align === 'left' ? rect.right + FLOAT_SIDE_MARGIN_PX - box.left : box.right - (rect.left - FLOAT_SIDE_MARGIN_PX);
      if (floatBottomPx > box.bottom + 0.5 && (!carry || floatBottomPx > carry.floatBottomPx)) carry = { overlay: true, floatBottomPx, align, shiftPt: shiftPx * PX_TO_PT };
    });
    return carry;
  }

  // Encadré (js/callout.js) : un tableau pdfmake à une ligne et deux colonnes - l'icône (PNG tracé d'après les mêmes dessins que le CSS) à gauche, les blocs de l'encadré à droite,
  // mis en page comme ceux d'une colonne (htmlToPdfContent sur leur HTML, à la largeur de texte mesurée). Le fond teinté et la barre de couleur viennent de la mise en page du
  // tableau (fillColor, filet gauche) ; aucun autre trait. Toutes les mesures sont prises sur le CSS réel (css/callout.css), pas recopiées. La ligne du tableau se coupe d'une
  // page à l'autre comme un long paragraphe.
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
    const block = {
      table: {
        widths: [iconSizePt, '*'],
        body: [[
          { image: Callout.iconPng(iconKey, color.accent, 96), width: iconSizePt, height: iconSizePt, margin: [0, Math.max(0, iconTopPt - padTopPt), 0, 0] },
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
    // Images en calque dans l'encadré : même ramenée au référentiel de la page que pour une colonne (l'encadré est, comme la zone 2 colonnes, le parent positionné de ses images -
    // css/callout.css : position: relative -, et ses ancres locales partent du début de son contenu).
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
    // Une image habillée plus haute que l'encadré ne l'agrandit pas (css/callout.css : overflow visible) : elle le dépasse, et le texte d'après se range encore à côté d'elle.
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
  // Retire, à chaque niveau entre `marker` et `root`, tout ce qui suit - laisse un arbre ne contenant que ce qui précède marker, tout en conservant les
  // éléments ancêtres pour ce qu'ils contiennent avant.
  // `keepNotes` : les notes de bas de page qui suivent aussitôt la coupure restent (une note n'a aucun texte : coupée entre deux morceaux elle tomberait dans l'écart et disparaîtrait ; elle suit
  // toujours le mot qui la précède, c'est avec lui qu'elle se lit).
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
  // Tous les mots du texte de `node` (encore attaché à l'hôte de mesure, donc réellement mis en page par le float CSS), avec la position Y réelle de la ligne
  // sur laquelle chacun tombe.
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
  // Extrait les runs pdfmake du texte de `node` entre startCut/endCut ({textNode,offset} ou null = jusqu'au bord) - clone `node` puis tronque, sans jamais
  // modifier `node` lui-même (rappelable sur d'autres plages).
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

  // Étire une ligne jusqu'à `targetWidthPt` en répartissant l'écart entre chaque mot (characterSpacing pdfmake n'agit qu'entre caractères d'un même run,
  // jamais en bordure) ; `lineWords` = sous-ensemble de collectWords().
  // Marge de sécurité de l'estimation (largeur des mots mesurée dans le navigateur, que pdfmake retrouve à ±1,5 pt près : il coupe chaque mot avant sa dernière lettre pour y poser l'écart, ce qui perd le crénage
  // de la paire) puis, une fois la largeur réelle mesurée (learnStretchedLines), celle qui reste.
  const STRETCH_SAFETY_PT = 2;
  const STRETCH_LEARNED_SAFETY_PT = 0.3;
  const STRETCH_MAX_SQUEEZE_PT = 0.5; // au plus, ce dont une ligne mesurée trop large peut resserrer chacun de ses intervalles
  function buildJustifiedLine(node, lineWords, startCut, endCut, targetWidthPt, baseStyle) {
    const gaps = lineWords.length - 1;
    // Pas (dernier mot.right - premier mot.left) : le paragraphe est déjà justifié en CSS, donc la ligne RENDUE est déjà étirée - la mesurer directement
    // fausserait extraPt vers 0. Somme plutôt la largeur propre de chaque mot (jamais affectée par le justify) plus un espace normal par intervalle.
    const naturalWidthPt = lineWords.reduce((sum, w) => sum + (w.right - w.left), 0) * PX_TO_PT + gaps * spaceWidthPt();
    // Viser exactement targetWidthPt laisse un écart nul avec pdfmake : un sous-pixel d'arrondi suffit alors à faire recouper la ligne (un mot bascule sur
    // une ligne en trop). Un léger sous-étirement invisible vaut mieux que ce risque.
    const key = lineWords.map(w => w.textNode.nodeValue.slice(w.start, w.end)).join(' ') + '|' + targetWidthPt.toFixed(2) + '|' + naturalWidthPt.toFixed(1);
    const learned = stretchExtra.get(key);
    const extraPt = learned !== undefined ? learned : (gaps > 0 ? Math.max(0, (targetWidthPt - STRETCH_SAFETY_PT) - naturalWidthPt) / gaps : 0);
    // Une ligne trop peu étirable pour la marge de l'estimation (extraPt nul) est tout de même coupée en morceaux à la première passe, pour que la passe de mesure lui trouve sa largeur et que la suivante l'étire de ce
    // qui reste : le navigateur, lui, la justifie. Une ligne mesurée reste coupée (la largeur mesurée est celle des morceaux, que le crénage perdu aux coupures rend un peu plus large qu'un seul run) : son écart peut
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
  // Ce que pdfmake a mesuré (`_maxWidth`, marges comprises) de chaque ligne étirée de la passe qu'il vient de mettre en page : l'écart restant à la largeur visée, réparti sur ses intervalles, devient l'étirement de la
  // même ligne à la passe suivante (buildJustifiedLine la retrouve par sa clé). Ne laisse que STRETCH_LEARNED_SAFETY_PT.
  function learnStretchedLines(blocks) {
    (blocks || []).forEach(block => {
      const st = block._stretch;
      if (!st || !(block._maxWidth > 0)) return;
      const margin = block.margin || [0, 0, 0, 0];
      const widthPt = block._maxWidth - (margin[0] || 0) - (margin[2] || 0);
      stretchExtra.set(st.key, Math.max(-STRETCH_MAX_SQUEEZE_PT, st.extraPt + ((st.targetPt - STRETCH_LEARNED_SAFETY_PT) - widthPt) / st.gaps));
    });
  }

  // Les mots d'un bloc (collectWords) rangés par ligne, du haut vers le bas : un mot est de la ligne d'avant s'il en recouvre la hauteur. `top` et `bottom` d'une ligne : ceux de ses mots.
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
  // Où couper le texte d'un bloc pour garder les mots de rang `first` à `last` : juste avant le premier, juste après le dernier (`null` : jusqu'au bord).
  function wordCutsOf(words) {
    return {
      before: wi => (wi <= 0 ? null : { textNode: words[wi].textNode, offset: words[wi].start }),
      after: wi => (wi >= words.length - 1 ? null : { textNode: words[wi].textNode, offset: words[wi].end }),
    };
  }
  // Les espaces que le navigateur garde en tête de ligne (white-space: break-spaces) : celui qui suit une image « bloc » ouvre la ligne d'en dessous et la décale d'une espace, les mots d'une ligne
  // coupée plus haut n'en ont pas. pdfmake, lui, les retire : on les rend par le retrait de gauche (la ligne est centrée ou étirée sur ce qui reste, comme dans le navigateur).
  function leadingSpacePt(word) {
    const before = word.textNode.nodeValue.slice(0, word.start);
    return /^[ \u00a0]+$/.test(before) ? before.length * spaceWidthPt() : 0;
  }
  // Les lignes `from` à `to` (comprises) d'un bloc, en blocs pdfmake, chaque ligne au même endroit et avec les mêmes mots que dans le navigateur. En justifié chaque ligne a son bloc, étiré à la largeur
  // du navigateur (pdfmake n'étire jamais la dernière ligne d'un bloc, le navigateur étire toutes celles qu'une autre suit) ; les autres lignes ont aussi chacune leur bloc, aux mots que le navigateur y met, la première
  // quand elle commence par une espace gardée (`leadPt`) avec son retrait. `ctx` : { node, words, lines, textAlign, indentPt, lineWidthPt, cuts }. `shiftLeftPt` / `shiftRightPt` : la place prise à côté par une image habillée.
  // `endsParagraph` : la dernière de ces lignes est la dernière du paragraphe (jamais étirée). `ctx.slackPt` : ce que le conteneur du PDF a de moins que celui du navigateur (une case de tableau perd une espace et demie,
  // cf. tableFrom) : la marge de droite de chaque bloc le rend, pour que pdfmake coupe les lignes où le navigateur les coupe, pas une ligne plus tôt.
  function lineBlocksFrom(ctx, from, to, opts) {
    const { node, lines, textAlign, indentPt, lineWidthPt, cuts, baseStyle, slackPt = 0 } = ctx;
    const { shiftLeftPt = 0, shiftRightPt = 0, endsParagraph = false, leadPt = 0 } = opts || {};
    const justify = textAlign === 'justify';
    const widthPt = lineWidthPt - shiftLeftPt - shiftRightPt;
    const startOf = li => lines[li][0].index;
    const endOf = li => lines[li][lines[li].length - 1].index;
    // La dernière ligne d'un paragraphe centré ou à droite n'a pas d'espace de fin dans le navigateur (white-space: break-spaces garde celle de toutes les autres) : son texte est au vrai centre, ou au bord droit, là où celui des
    // autres lignes est décalé d'une demi-espace ou d'une espace. Elle a donc sa propre place, de chaque côté ou à gauche seulement, sans la marge d'une espace : la ligne garde une marge de LAST_LINE_ROOM_PT de plus que
    // le navigateur pour qu'une largeur de pdfmake un peu plus grande ne la renvoie pas à la ligne.
    const LAST_LINE_ROOM_PT = 2;
    const trailsNoSpace = textAlign === 'center' || textAlign === 'right';
    // Une ligne à gauche (ou étirée) n'a pas besoin de la marge d'une espace : sa position ne dépend pas du bord droit, qui ne sert qu'à la garder sur une seule ligne. On lui laisse même de la place en plus,
    // pour qu'une largeur de pdfmake un peu plus grande que celle du navigateur ne la renvoie pas à la ligne.
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
    // Une ligne, un bloc : pdfmake ne coupe pas le texte lui-même, il n'a pas les mêmes règles que le navigateur (il ne sépare jamais un mot de l'« : » qui le suit, par exemple, que le navigateur
    // renvoie à la ligne d'après) ; chaque ligne garde donc les mots que le navigateur y met.
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

  // === Image dans le flux (dans la ligne, « bloc », centrée) ===
  // pdfmake ne sait pas poser une image dans une ligne de texte : un `text` n'en accepte pas, et une image ne se met à côté d'un texte que dans des `columns`. Le navigateur, lui (l'hôte de mesure
  // suit les règles de l'éditeur, css/editor-v2.css), sait où tombent chaque image et chaque mot. Une ligne qui porte une image devient donc une rangée de colonnes : le texte d'avant, l'image, le
  // texte d'après, posés aux x mesurés, à la hauteur de la ligne du navigateur (le pied de l'image sur la ligne de base du texte ; le haut de la ligne est celui de l'image quand elle dépasse
  // l'interligne). Les lignes sans image ont chacune leur bloc de texte (lineBlocksFrom). Une image « bloc » ou centrée est seule sur sa ligne : sa propre rangée.

  // Bord gauche, en px, de ce qui contient un bloc dans le PDF : l'hôte de mesure, ou la case de tableau où il se trouve (pdfmake y repart du bord intérieur de la case).
  function flowOriginLeftPx(node) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const cell = node.closest('td, th');
    if (!cell || !host.contains(cell)) return host.getBoundingClientRect().left;
    const cs = getComputedStyle(cell);
    return cell.getBoundingClientRect().left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
  }

  // Ce que le navigateur fait d'une ligne de ce bloc, mesuré sur un clone vide posé juste après lui (mêmes classes, même style : même police, même interligne) : la hauteur d'une ligne, où est sa
  // ligne de base depuis le haut de la ligne, et la hauteur du texte au-dessus de cette ligne (pour retrouver la ligne de base d'un mot). `null` hors d'une page.
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

  // Les blocs pdfmake d'un paragraphe qui porte au moins une image du flux, ou `null` (rien à mesurer : l'appelant garde son chemin ordinaire). `images` : les objets image que inlineRuns a
  // rendus pour ce nœud, dans l'ordre du DOM ; ceux qui sont en calque (hors du flux) suivent le texte sans le couper.
  // `opts` : `keepLayered` (les images en calque restent à l'appelant, qui les rattache lui-même : case de tableau), `textAlign` (l'alignement du conteneur quand le bloc n'a pas le sien : case), `baseStyle` (le style que le
  // bloc hérite de son conteneur), `maxWidthPt` (la largeur que pdfmake donne au bloc quand elle est plus étroite que celle du navigateur : une case de tableau perd une espace et demie, cf. tableFrom).
  function inFlowImageBlocksFrom(node, images, pageBreakBefore, opts) {
    const { keepLayered = false, textAlign: containerAlign, baseStyle, maxWidthPt } = opts || {};
    const flowImages = images.filter(img => FLOW_IMAGE_NODES.has(img));
    if (!flowImages.length || !node.isConnected) return null;
    const strut = lineStrutOf(node);
    if (!strut) return null;
    const nodeRect = node.getBoundingClientRect();
    const nodeStyle = getComputedStyle(node);
    const insetLeftPx = (parseFloat(nodeStyle.borderLeftWidth) || 0) + (parseFloat(nodeStyle.paddingLeft) || 0);
    const insetRightPx = (parseFloat(nodeStyle.borderRightWidth) || 0) + (parseFloat(nodeStyle.paddingRight) || 0);
    const originLeftPx = flowOriginLeftPx(node);
    const indentPt = Math.max(0, (nodeRect.left + insetLeftPx - originLeftPx) * PX_TO_PT);
    const lineWidthPt = Math.max(0, Math.min((nodeRect.width - insetLeftPx - insetRightPx) * PX_TO_PT, maxWidthPt > 0 ? maxWidthPt : Infinity));
    const textAlign = alignment(node) || containerAlign;
    const words = collectWords(node);

    // Les rangées : une par ligne qui porte une image dans la ligne, une par image « bloc » ou centrée. `top` / `bottom` : la boîte de la ligne du navigateur.
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
    if (!rows.length) return null;
    // Les mots de la ligne d'une image : ceux dont le milieu tombe dans la boîte de sa ligne (deux lignes ne se recouvrent pas).
    const taken = new Array(words.length).fill(false);
    words.forEach((w, wi) => {
      const mid = (w.top + w.bottom) / 2;
      const row = rows.find(r => !r.own && mid >= r.top - 0.5 && mid <= r.bottom + 0.5);
      if (row) { row.wordIdx.push(wi); taken[wi] = true; }
    });

    // Du haut vers le bas : les rangées, et entre elles les suites de mots qu'aucune rangée ne porte (le texte que pdfmake coupe lui-même).
    const segments = rows.map(row => ({ row, key: row.top }));
    // Une suite de mots se coupe aussi là où une rangée s'intercale sans mot (une image « bloc », ou trop large pour partager sa ligne) : le texte d'après repart sous l'image.
    const rowBetween = (a, b) => rows.some(r => (a.top + a.bottom) / 2 < r.top + 0.5 && (b.top + b.bottom) / 2 > r.bottom - 0.5);
    for (let wi = 0; wi < words.length; wi += 1) {
      if (taken[wi]) continue;
      let last = wi;
      while (last + 1 < words.length && !taken[last + 1] && !rowBetween(words[last], words[last + 1])) last += 1;
      segments.push({ run: { first: wi, last }, key: words[wi].top });
      wi = last;
    }
    segments.sort((a, b) => a.key - b.key);

    const cuts = wordCutsOf(words);
    const cutBefore = cuts.before;
    const cutAfter = cuts.after;
    const blocks = [];
    const addImage = (img, margin) => { const out = Object.assign({}, img, { margin }); delete out.alignment; return out; };

    segments.forEach((seg, si) => {
      const followed = si < segments.length - 1;
      if (seg.run) {
        const { first, last } = seg.run;
        const slice = words.slice(first, last + 1);
        const lines = groupWordsIntoLines(slice);
        lineBlocksFrom({ node, words, lines, textAlign, indentPt, lineWidthPt, cuts, baseStyle }, 0, lines.length - 1, { endsParagraph: !followed, leadPt: leadingSpacePt(words[first]) }).forEach(b => blocks.push(b));
        return;
      }
      const row = seg.row;
      if (row.own) {
        const { img, rect } = row.items[0];
        blocks.push(addImage(img, [Math.max(0, (rect.left - originLeftPx) * PX_TO_PT), 0, 0, 0]));
        return;
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
          ? buildJustifiedLine(node, it.words, cutBefore(it.firstIdx), cutAfter(it.lastIdx), (it.right - it.left) * PX_TO_PT, baseStyle)
          : extractRunsBetween(node, cutBefore(it.firstIdx), cutAfter(it.lastIdx), baseStyle);
      });
      const leftPt = Math.max(0, (sequence[0].left - originLeftPx) * PX_TO_PT);
      const textTopPt = (row.strutTop - row.top) * PX_TO_PT;
      const rowHeightPt = (row.bottom - row.top) * PX_TO_PT;
      if (sequence.length === 1 && sequence[0].kind === 'img') {
        // Une image seule sur sa ligne : son haut, et sous elle ce que la ligne garde sous la ligne de base.
        const { img, rect } = sequence[0];
        blocks.push(addImage(img, [leftPt, (rect.top - row.top) * PX_TO_PT, 0, (row.bottom - rect.bottom) * PX_TO_PT]));
        return;
      }
      const lineHeightPt = strut.lineHeightPx * PX_TO_PT;
      let tallestPt = 0;
      const children = sequence.map((it, i) => {
        const next = sequence[i + 1];
        if (it.kind === 'img') {
          const topPt = (it.rect.top - row.top) * PX_TO_PT;
          tallestPt = Math.max(tallestPt, topPt + it.rect.height * PX_TO_PT);
          // Dans une pile : la largeur d'une colonne d'image est aussi celle de l'image, or la colonne doit aller jusqu'au morceau suivant.
          return { width: next ? Math.max(1, (next.left - it.left) * PX_TO_PT) : it.img.width, stack: [addImage(it.img, [0, topPt, 0, 0])] };
        }
        tallestPt = Math.max(tallestPt, textTopPt + lineHeightPt);
        const child = { text: it.runs.length ? it.runs : ' ', noWrap: true, lineHeight: LINE_HEIGHT_RATIO, margin: [0, textTopPt, 0, 0], width: next ? Math.max(1, (next.left - it.left) * PX_TO_PT) : (it.right - it.left) * PX_TO_PT + 2 };
        if (it.runs.stretch) { child._stretch = it.runs.stretch; stretchedBlocks.push(child); }
        return child;
      });
      blocks.push({ columns: children, columnGap: 0, margin: [leftPt, 0, 0, Math.max(0, rowHeightPt - tallestPt)] });
    });
    // Les images en calque ne prennent pas de place : posées après le texte, sans le couper (leur position est résolue plus tard, d'après leur boîte réelle).
    if (!keepLayered) images.forEach(img => { if (!FLOW_IMAGE_NODES.has(img)) blocks.push(img); });
    const firstFlow = blocks.find(b => !b._pendingImgNode);
    if (pageBreakBefore && firstFlow) firstFlow.pageBreak = 'before';
    return blocks;
  }

  // === Image habillée (alignée à gauche ou à droite) ===
  // Dans l'éditeur, l'image flotte : elle ne prend aucune place dans le flux, et le texte (de son paragraphe, puis des paragraphes d'après) se range à côté d'elle jusqu'à son bas, marge comprise, avant de
  // reprendre toute la largeur. pdfmake n'a rien de tel : le PDF reproduit les deux moitiés séparément. Le texte, ce sont des blocs décalés du côté de l'image (le retrait est la largeur de l'image et
  // sa marge), coupés là où le navigateur passe sous elle (mesuré dans l'hôte). L'image, c'est un calque que le fond de page peint à la hauteur de la première ligne à côté d'elle, sans place dans le flux :
  // sa page et sa hauteur ne sont connues qu'une fois le texte mis en page par pdfmake, d'où la passe de mesure de resolveNativePdfContent. Jusqu'ici l'image occupait une colonne de sa hauteur, et tout ce
  // qui suivait commençait sous elle (jusqu'à 75 pt plus bas que dans l'éditeur).
  const FLOAT_SIDE_MARGIN_PX = 12; // css/editor-v2.css : margin: 0 12px 8px 0 (et son miroir à droite)
  const FLOAT_BELOW_MARGIN_PX = 8;

  // Les lignes d'un bloc par rapport à une image qui flotte, du haut (`floatTopPx`) au bas de sa boîte avec marge (`floatBottomPx`) : { before, beside, after } = rangs des lignes (`lines`) ;
  // le haut d'une ligne du navigateur est celui de ses mots moins la demi-interligne.
  function linesAroundFloat(lines, strut, floatTopPx, floatBottomPx) {
    const halfLeadingPx = strut.baselinePx - strut.glyphAscentPx;
    const topOf = line => line.top - halfLeadingPx;
    let firstBeside = lines.findIndex(line => topOf(line) >= floatTopPx - 1);
    if (firstBeside === -1) return { before: lines.length, beside: 0, after: 0, topOf };
    let afterFrom = lines.findIndex((line, i) => i >= firstBeside && topOf(line) >= floatBottomPx);
    if (afterFrom === -1) afterFrom = lines.length;
    return { before: firstBeside, beside: afterFrom - firstBeside, after: lines.length - afterFrom, topOf };
  }

  // Les blocs pdfmake d'un paragraphe qui porte UNE image habillée, ou `null` (l'appelant garde alors son chemin d'avant : plusieurs images habillées, ou une image du flux dans le même paragraphe).
  // Le premier bloc à côté de l'image (ou, sans texte, la ligne vide du paragraphe) porte `_floatOverlay` : c'est à lui que resolveFloatOverlays ancre l'image.
  // `opts` : `nested` (dans une case, une colonne ou un encadré : l'ancre dit où est l'image par rapport à son propre texte, la page et la hauteur du conteneur ne sont pas celles de la page), `maxWidthPt` (la largeur que
  // pdfmake donne au bloc quand elle est plus étroite que celle du navigateur : une case de tableau).
  function floatParagraphBlocksFrom(node, pageBreakBefore, opts) {
    const { nested = false, maxWidthPt } = opts || {};
    if (!node.isConnected) return null;
    const images = [];
    inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images);
    const floats = images.filter(img => img._floatAlign);
    if (floats.length !== 1 || images.some(img => FLOW_IMAGE_NODES.has(img))) return null;
    const floatImg = floats[0];
    const imgNode = floatImg._sourceImgNode;
    const strut = imgNode && lineStrutOf(node);
    if (!strut) return null;
    const align = floatImg._floatAlign;
    const nodeRect = node.getBoundingClientRect();
    const imgRect = imgNode.getBoundingClientRect();
    const nodeStyle = getComputedStyle(node);
    const insetLeftPx = (parseFloat(nodeStyle.borderLeftWidth) || 0) + (parseFloat(nodeStyle.paddingLeft) || 0);
    const insetRightPx = (parseFloat(nodeStyle.borderRightWidth) || 0) + (parseFloat(nodeStyle.paddingRight) || 0);
    const originLeftPx = flowOriginLeftPx(node);
    const domWidthPt = Math.max(0, (nodeRect.width - insetLeftPx - insetRightPx) * PX_TO_PT);
    const lineWidthPt = maxWidthPt > 0 ? Math.min(domWidthPt, maxWidthPt) : domWidthPt;
    const slackPt = domWidthPt - lineWidthPt;
    const indentPt = nested ? Math.max(0, (nodeRect.left + insetLeftPx - originLeftPx) * PX_TO_PT) : measureIndentPt(node, 'box');
    const textAlign = alignment(node);
    const floatTopPx = imgRect.top;
    const floatBottomPx = imgRect.bottom + FLOAT_BELOW_MARGIN_PX;
    const shiftPt = (imgRect.width + FLOAT_SIDE_MARGIN_PX) * PX_TO_PT;
    const words = collectWords(node);
    const lines = groupWordsIntoLines(words);
    const around = linesAroundFloat(lines, strut, floatTopPx, floatBottomPx);
    const ctx = { node, words, lines, textAlign, indentPt, lineWidthPt, slackPt, cuts: wordCutsOf(words) };
    const emptyLine = () => ({ text: ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO });
    const sideOpts = { shiftLeftPt: align === 'left' ? shiftPt : 0, shiftRightPt: align === 'right' ? shiftPt : 0 };

    const blocks = [];
    let anchor = null;
    let dyPt = 0;
    const lastSegment = around.after ? 'after' : around.beside ? 'beside' : 'before';
    if (around.before) blocks.push(...lineBlocksFrom(ctx, 0, around.before - 1, { endsParagraph: lastSegment === 'before' }));
    if (around.beside) {
      const beside = lineBlocksFrom(ctx, around.before, around.before + around.beside - 1, Object.assign({ endsParagraph: lastSegment === 'beside', leadPt: 0 }, sideOpts));
      anchor = beside[0];
      dyPt = (floatTopPx - around.topOf(lines[around.before])) * PX_TO_PT;
      blocks.push(...beside);
    }
    if (around.after) blocks.push(...lineBlocksFrom(ctx, around.before + around.beside, lines.length - 1, { endsParagraph: true }));
    if (!anchor && around.after === lines.length && lines.length) {
      // Une image aussi large que la ligne ne laisse rien à côté : le navigateur pousse tout le texte sous elle. Le texte garde ce vide au-dessus de sa première ligne, et l'image est ancrée à
      // cette première ligne, au-dessus d'elle.
      const gapPt = (around.topOf(lines[0]) - floatTopPx) * PX_TO_PT;
      blocks[0].margin[1] = gapPt;
      anchor = blocks[0];
      dyPt = -gapPt;
    }
    if (!anchor) {
      // Pas de texte à côté : la ligne que le paragraphe garde (l'éditeur laisse une ligne vide à l'image seule, cf. insertTrailingBreaksForEmptyBlocks) porte l'image.
      const kept = emptyLine();
      const lastLine = lines[lines.length - 1];
      const keptTopPx = lastLine ? around.topOf(lastLine) + strut.lineHeightPx : nodeRect.top;
      if (!lastLine || nodeRect.bottom - keptTopPx > strut.lineHeightPx * 0.5) {
        blocks.push(kept);
        anchor = kept;
        dyPt = (floatTopPx - keptTopPx) * PX_TO_PT;
      } else {
        anchor = blocks[blocks.length - 1];
        dyPt = (floatTopPx - around.topOf(lastLine)) * PX_TO_PT;
      }
    }
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // `reachPt` : de son haut au bas de ce qu'elle occupe, soit sa hauteur, sa marge du dessous et une ligne de texte de plus (la dernière ligne à côté d'elle peut dépasser son bas d'une ligne).
    anchor._floatOverlay = { image: floatImg, align, dyPt, reachPt: (floatBottomPx - imgRect.top + strut.lineHeightPx) * PX_TO_PT };
    // Dans un conteneur (case, colonne, encadré) l'image se pose depuis son texte : son bord gauche est à `offsetPt` du bord gauche du conteneur, que le PDF retrouve par la marge de l'ancre.
    if (nested) { anchor._floatOverlay.nested = true; anchor._floatOverlay.offsetPt = (imgRect.left - originLeftPx) * PX_TO_PT; }
    images.forEach(img => { if (img._pendingImgNode) blocks.push(img); });
    if (pageBreakBefore) blocks[0].pageBreak = 'before';
    // L'image dépasse le paragraphe : le texte des paragraphes suivants se range encore à côté d'elle.
    if (floatBottomPx > nodeRect.bottom + 0.5) blocks._floatCarry = { overlay: true, floatBottomPx, align, shiftPt };
    return blocks;
  }

  // Un paragraphe sans image, sous une image habillée qui le déborde encore (`carry`, posé par floatParagraphBlocksFrom) : ses premières lignes se rangent à côté d'elle, le reste reprend toute la largeur.
  // `null` : le paragraphe est déjà sous l'image, ou porte une image de son propre chemin.
  function carriedFloatBlocksFrom(node, carry, pageBreakBefore, opts) {
    const { nested = false, maxWidthPt } = opts || {};
    if (!node.isConnected || node.querySelector('img.editor-image')) return null;
    const nodeRect = node.getBoundingClientRect();
    if (nodeRect.top >= carry.floatBottomPx - 0.5) return null;
    const strut = lineStrutOf(node);
    if (!strut) return null;
    const nodeStyle = getComputedStyle(node);
    const insetLeftPx = (parseFloat(nodeStyle.borderLeftWidth) || 0) + (parseFloat(nodeStyle.paddingLeft) || 0);
    const insetRightPx = (parseFloat(nodeStyle.borderRightWidth) || 0) + (parseFloat(nodeStyle.paddingRight) || 0);
    const domWidthPt = Math.max(0, (nodeRect.width - insetLeftPx - insetRightPx) * PX_TO_PT);
    const lineWidthPt = maxWidthPt > 0 ? Math.min(domWidthPt, maxWidthPt) : domWidthPt;
    const slackPt = domWidthPt - lineWidthPt;
    const indentPt = nested ? Math.max(0, (nodeRect.left + insetLeftPx - flowOriginLeftPx(node)) * PX_TO_PT) : measureIndentPt(node, 'box');
    const textAlign = alignment(node);
    const words = collectWords(node);
    const lines = groupWordsIntoLines(words);
    const blocks = [];
    if (!lines.length) {
      // Une ligne vide à côté de l'image garde sa ligne, rien à décaler.
      blocks.push({ text: ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO });
    } else {
      const around = linesAroundFloat(lines, strut, -Infinity, carry.floatBottomPx);
      const ctx = { node, words, lines, textAlign, indentPt, lineWidthPt, slackPt, cuts: wordCutsOf(words) };
      const sideOpts = { shiftLeftPt: carry.align === 'left' ? carry.shiftPt : 0, shiftRightPt: carry.align === 'right' ? carry.shiftPt : 0 };
      if (around.beside) blocks.push(...lineBlocksFrom(ctx, 0, around.beside - 1, Object.assign({ endsParagraph: !around.after }, sideOpts)));
      if (around.after) blocks.push(...lineBlocksFrom(ctx, around.beside, lines.length - 1, { endsParagraph: true }));
    }
    if (pageBreakBefore) blocks[0].pageBreak = 'before';
    if (nodeRect.bottom < carry.floatBottomPx - 0.5) blocks._floatCarry = carry;
    blocks._carried = true;
    return blocks;
  }

  // Un titre posé en plusieurs blocs (une image dans sa ligne, un habillage) : son premier bloc porte ce que le sommaire lit (niveau, texte), comme le bloc unique du chemin ordinaire ; `_headingLeaf` est
  // le texte où pdfmake note la page (une rangée de colonnes n'en note pas).
  function markHeadingBlocks(blocks, node, tag) {
    const first = blocks.find(b => b && !b._pendingImgNode && !b.absolutePosition && (b.text !== undefined || b.columns));
    if (!first) return;
    first._isHeading = true;
    first._headingLevel = parseInt(tag.slice(1), 10);
    first._headingText = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (first.text === undefined && first.columns) first._headingLeaf = first.columns.find(c => c && c.text !== undefined) || null;
  }

  // Les blocs de texte qui portent une image habillée (`_floatOverlay`), dans l'ordre du document : au premier niveau comme dans une case, une colonne ou un encadré. `_floatSiblings` : la liste qui contient chacun.
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

  // Le bloc qui ouvre la page suivante quand l'image habillée de cette ancre ne tient pas dans ce qui reste de sa page : l'ancre elle-même au premier niveau, l'encadré qui la contient ; `null` pour une case ou une
  // colonne (pdfmake ne les coupe pas : la ligne du tableau reste entière, la zone aussi).
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

  // Ajoute `pt` au-dessus d'un bloc pdfmake, quelle que soit la forme de sa marge (absente, nombre, [horizontal, vertical] ou [gauche, haut, droite, bas]).
  function addTopMargin(block, pt) {
    const m = block.margin;
    if (Array.isArray(m) && m.length === 4) block.margin = [m[0], m[1] + pt, m[2], m[3]];
    else if (Array.isArray(m) && m.length === 2) block.margin = [m[0], m[1] + pt, m[0], m[1]];
    else if (typeof m === 'number') block.margin = [m, m + pt, m, m];
    else block.margin = [0, pt, 0, 0];
  }

  // pdfmake n'étire (justify) qu'une ligne coupée par son propre wordwrap - le texte à côté de l'image reste donc un seul bloc auto-wrappé, au prix d'un
  // risque assumé : sa coupure de ligne peut différer du rendu éditeur.

  // Reproduit le float CSS via les `columns` natifs de pdfmake : colonne image + colonne texte restante. Le paragraphe se découpe en 3 segments (avant/à
  // hauteur/après l'image) selon la position mesurée, pas une coupure interne. Limité au même paragraphe que l'image ; `null` s'il ne contient que l'image.
  function floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt) {
    const images = [];
    const runs = trimEdgeWhitespace(stripImageMarkers(inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images)));
    const floatImg = images.find(img => img._floatAlign);
    if (!floatImg || !runs.length) return null;
    const align = floatImg._floatAlign;
    // Alignement du paragraphe, distinct de `align` (le côté du flottement) : blockFrom() applique normalement `alignment` lui-même, mais cette fonction
    // retourne avant ce point (chemin séparé pour l'habillage) - sans le reporter ici, l'alignement était silencieusement perdu.
    const textAlign = alignment(node);
    const imgNode = floatImg._sourceImgNode;
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // Largeur disponible : celle de la page par défaut, mais surchargeable par l'appelant (cellule de tableau, colonne 2-colonnes) - sinon une image
    // flottante nichée dans un espace plus étroit habillait comme si elle disposait de la pleine largeur de page.
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT;
    const gapPt = 12 * PX_TO_PT; // css/editor-v2.css: margin 0 12px 8px 0 (et son miroir)
    const imageWidthPt = floatImg.width;
    const MIN_BESIDE_PT = 40;
    const roomBesidePt = pageWidthPt - imageWidthPt - gapPt;
    const remainingWidthPt = Math.max(MIN_BESIDE_PT, roomBesidePt);
    const makeColumns = (besideContent) => {
      const textCol = { width: remainingWidthPt, stack: besideContent.length ? besideContent : [{ text: ' ' }] };
      const imgCol = { width: imageWidthPt, stack: [floatImg] };
      return { columns: align === 'right' ? [textCol, imgCol] : [imgCol, textCol], columnGap: gapPt };
    };
    // Image presque aussi large que la zone de texte (typiquement une image réglée trop large, ramenée à la largeur disponible) : rien ne tient à côté, le texte passe
    // dessous dans l'éditeur comme dans la Lecture. Texte d'avant l'image, image, texte d'après, l'un sous l'autre et sans colonnes : une colonne de texte de 40 pt ferait
    // déborder l'ensemble du bord de la page. `beforeRuns` / `afterRuns` : le texte de part et d'autre de l'image (ou rien).
    const stacked = (beforeRuns, afterRuns) => {
      const textBlock = textRuns => {
        const textBlockObj = { text: textRuns, margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
        if (textAlign) textBlockObj.alignment = textAlign;
        return textBlockObj;
      };
      floatImg.alignment = align;
      floatImg.margin = [0, 2, 0, 4];
      const stackedBlocks = [];
      if (beforeRuns && beforeRuns.length) stackedBlocks.push(textBlock(beforeRuns));
      stackedBlocks.push(floatImg);
      if (afterRuns && afterRuns.length) stackedBlocks.push(textBlock(afterRuns));
      if (pageBreakBefore) stackedBlocks[0].pageBreak = 'before';
      return stackedBlocks;
    };
    // `splitIndex` : rang du premier mot situé sous l'image dans le rendu mesuré (ce qui précède est au-dessus), inconnu quand l'image n'a pas de nœud à mesurer -
    // le texte est alors placé sous l'image.
    const fallback = splitIndex => {
      if (roomBesidePt < MIN_BESIDE_PT) {
        if (splitIndex == null || splitIndex <= 0) return stacked(null, runs);
        if (splitIndex >= words.length) return stacked(runs, null);
        const cut = { textNode: words[splitIndex].textNode, offset: words[splitIndex].start };
        return stacked(extractRunsBetween(node, null, cut), extractRunsBetween(node, cut, null));
      }
      const textBlock = { text: runs, lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) textBlock.alignment = textAlign;
      const block = makeColumns([textBlock]);
      if (pageBreakBefore) block.pageBreak = 'before';
      return block;
    };
    const words = imgNode ? collectWords(node) : [];
    if (!imgNode) return fallback();

    const imgRect = imgNode.getBoundingClientRect();
    // Tolérance généreuse (pas 0.5px) sur les deux frontières : une frontière stricte au demi-pixel s'est avérée trop fragile (sous-pixels de rendu qui
    // varient d'un navigateur à l'autre). ~20% d'une hauteur de ligne à 10.5pt.
    const BOUNDARY_TOLERANCE_PX = 4;
    // Premier mot dont la ligne commence au niveau (ou après) le haut de l'image - ce qui précède est sur des lignes terminées avant le flottement.
    let besideStart = words.length;
    for (let w = 0; w < words.length; w += 1) { if (words[w].top >= imgRect.top - BOUNDARY_TOLERANCE_PX) { besideStart = w; break; } }
    // Premier mot, à partir de besideStart, dont la ligne commence au niveau (ou après) le bas de l'image. +tolérance ici (pas -) pour repousser le seuil
    // vers le bas plutôt que de classer "en dessous" trop de lignes.
    let besideEnd = words.length;
    for (let w = besideStart; w < words.length; w += 1) { if (words[w].top >= imgRect.bottom + BOUNDARY_TOLERANCE_PX) { besideEnd = w; break; } }
    if (besideStart === besideEnd) return fallback(besideStart); // rien de mesurable à côté (cas dégénéré)
    // Regroupe des mots consécutifs (même Y à 2px près) en lignes - permet de calculer un étirement justify précis ligne par ligne (buildJustifiedLine).
    const groupIntoLines = wordsSlice => {
      const lines = [];
      wordsSlice.forEach(w => {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last[0].top - w.top) < 2) last.push(w); else lines.push([w]);
      });
      return lines;
    };
    const besideStartCut = besideStart === 0 ? null : { textNode: words[besideStart].textNode, offset: words[besideStart].start };
    const besideEndCut = besideEnd < words.length ? { textNode: words[besideEnd].textNode, offset: words[besideEnd].start } : null;
    const hasAfter = besideEnd < words.length;

    const blocks = [];
    let pendingPageBreak = pageBreakBefore;
    if (besideStart > 0) {
      if (textAlign === 'justify') {
        // Texte "avant" TOUJOURS suivi du texte "à côté" - même sa propre dernière ligne doit donc s'étirer (ce n'est jamais la fin réelle du paragraphe).
        const beforeLines = groupIntoLines(words.slice(0, besideStart));
        let cursor = null;
        beforeLines.forEach((line, li) => {
          const isLastLine = li === beforeLines.length - 1;
          const endCut = isLastLine ? besideStartCut : { textNode: beforeLines[li + 1][0].textNode, offset: beforeLines[li + 1][0].start };
          // Retranche la marge droite (spaceWidthPt()) posée juste dessous : sans elle, l'étirement calculé dépasse le bloc réel et pdfmake recoupe un mot
          // sur une ligne en trop.
          const lineRuns = buildJustifiedLine(node, line, cursor, endCut, pageWidthPt - spaceWidthPt());
          const block = { text: lineRuns.length ? lineRuns : ' ', margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
          if (li === 0 && pendingPageBreak) { block.pageBreak = 'before'; pendingPageBreak = false; }
          blocks.push(block);
          cursor = endCut;
        });
      } else {
        const beforeRuns = extractRunsBetween(node, null, besideStartCut);
        if (beforeRuns.length) {
          const beforeBlock = { text: beforeRuns, margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
          if (textAlign) beforeBlock.alignment = textAlign;
          blocks.push(beforeBlock);
          pendingPageBreak = false;
        }
      }
    }
    let besideContent;
    if (textAlign === 'justify') {
      // Chaque ligne "à côté" est étirée, sauf si c'est à la fois la dernière ligne et qu'il n'y a pas de texte "après" : la vraie dernière ligne du
      // paragraphe n'est jamais étirée (même convention que le CSS).
      const besideLines = groupIntoLines(words.slice(besideStart, besideEnd));
      let cursor = besideStartCut;
      besideContent = besideLines.map((line, li) => {
        const isLastLine = li === besideLines.length - 1;
        const endCut = isLastLine ? besideEndCut : { textNode: besideLines[li + 1][0].textNode, offset: besideLines[li + 1][0].start };
        const isTrueLastLine = isLastLine && !hasAfter;
        const lineRuns = isTrueLastLine
          ? extractRunsBetween(node, cursor, endCut)
          : buildJustifiedLine(node, line, cursor, endCut, remainingWidthPt);
        cursor = endCut;
        return { text: lineRuns.length ? lineRuns : ' ', lineHeight: LINE_HEIGHT_RATIO, alignment: textAlign };
      });
    } else {
      const besideLastWord = words[besideEnd - 1];
      const besideRuns = extractRunsBetween(node, besideStartCut, { textNode: besideLastWord.textNode, offset: besideLastWord.end });
      const besideBlock = { text: besideRuns.length ? besideRuns : ' ', lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) besideBlock.alignment = textAlign;
      besideContent = [besideBlock];
    }
    const columnsBlock = makeColumns(besideContent);
    if (pendingPageBreak) columnsBlock.pageBreak = 'before';
    blocks.push(columnsBlock);
    if (besideEnd < words.length) {
      const afterRuns = extractRunsBetween(node, { textNode: words[besideEnd].textNode, offset: words[besideEnd].start }, null);
      const afterBlock = { text: afterRuns.length ? afterRuns : ' ', margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) afterBlock.alignment = textAlign;
      blocks.push(afterBlock);
    }
    return blocks;
  }

  // Poursuit l'habillage sur un paragraphe suivant sans image propre, mais sous le flottement d'un frère précédent (`carry`, préparé par blockFrom) - simple
  // décalage de marge. Retourne { blocks, stillActive } (le frère suivant doit être vérifié à son tour), ou `null` si déjà sous l'image.
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
      const groupIntoLines = wordsSlice => {
        const lines = [];
        wordsSlice.forEach(w => {
          const last = lines[lines.length - 1];
          if (last && Math.abs(last[0].top - w.top) < 2) last.push(w); else lines.push([w]);
        });
        return lines;
      };
      const besideLines = groupIntoLines(words.slice(0, besideEnd));
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

  // Retourne toujours un TABLEAU de blocs (jamais un bloc unique) : un paragraphe contenant une image produit un bloc de texte ET un bloc image séparés
  // (pdfmake ne supporte pas d'image réellement "en ligne").
  // Bloc de code (flux principal) : un tableau pdfmake à une colonne, UNE LIGNE DE TABLEAU PAR LIGNE DE CODE. Le fond gris et le cadre se dessinent par la mise en page du tableau
  // (fillColor, filets) et une ligne de tableau est insécable : un long bloc se coupe donc proprement entre deux lignes de code, d'une page à l'autre, sans en couper une en deux.
  // Espaces de tête gardés (preserveLeadingSpaces), ligne vide = une ligne d'un espace. 6pt de haut/bas, 7.5pt de côté et 0.75pt de filet reprennent le padding 8px/10px et la
  // bordure 1px de `.tiptap pre` ; marge de 3pt = `margin: 4px 0`.
  function codeBlockFrom(node, pageBreakBefore, inCell) {
    const body = ExportCommon.codeLinesOf(node).map(line => [{ text: line === '' ? ' ' : line, font: CODE_FONT, fontSize: CODE_FONT_SIZE, color: CODE_TEXT_COLOR, lineHeight: CODE_LINE_HEIGHT_RATIO, preserveLeadingSpaces: true }]);
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

  function blockFrom(node, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry, captionPt) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return tableBlocksFrom(node, pageBreakBefore, rootRect, availableWidthPt == null, captionPt);
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
    if (tag === 'PRE') return [codeBlockFrom(node, pageBreakBefore)];
    // Un titre se pose comme un paragraphe (image dans la ligne, habillage, texte à côté d'une image qui le déborde), sauf numéroté : son numéro est un texte que le navigateur dessine, absent des mots mesurés.
    const isHeadingTag = /^H[1-6]$/.test(tag);
    const flowText = tag === 'P' || tag === 'DIV' || (isHeadingTag && !((headingMarkers && headingMarkers.get(node)) || ''));
    const asHeading = blocks => { if (isHeadingTag && blocks) markHeadingBlocks(blocks, node, tag); return blocks; };
    if (flowText) {
      const floatImgEl = findFloatImageIn(node);
      if (floatImgEl) {
        // Dans le flux principal, l'image habillée est un calque et le texte se range à côté en blocs décalés (floatParagraphBlocksFrom) ; en cellule ou en colonne, l'ancien habillage en colonnes.
        const overlaid = floatParagraphBlocksFrom(node, pageBreakBefore, { nested: availableWidthPt != null });
        if (overlaid) return asHeading(overlaid);
        const floated = isHeadingTag ? null : floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt);
        if (floated) {
          const arr = Array.isArray(floated) ? floated : [floated];
          // Le flottement se poursuit-il sur le(s) frère(s) suivant(s) ? Mesuré depuis le <img> réel plutôt que de changer la signature de retour de
          // floatedImageParagraphFrom. Si le dernier bloc n'a pas de `columns` (texte déjà revenu sous l'image), le flottement est épuisé, rien à reporter.
          const lastBlock = arr[arr.length - 1];
          if (lastBlock && !lastBlock.columns) {
            arr._floatCarry = null;
          } else {
            const imgRect = floatImgEl.getBoundingClientRect();
            arr._floatCarry = makeFloatCarry(imgRect, floatImgEl.getAttribute('data-align'), Math.max(15, imgRect.width * PX_TO_PT), availableWidthPt);
          }
          return arr;
        }
      } else if (floatCarry && floatCarry.overlay) {
        const carried = carriedFloatBlocksFrom(node, floatCarry, pageBreakBefore, { nested: availableWidthPt != null });
        if (carried) return asHeading(carried);
      } else if (floatCarry && !isHeadingTag) {
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.top < floatCarry.imgBottom) {
          const cont = wrapParagraphBesideCarriedFloat(node, floatCarry);
          if (cont) {
            if (pageBreakBefore && cont.blocks[0]) cont.blocks[0].pageBreak = 'before';
            cont.blocks._floatCarry = cont.stillActive ? floatCarry : null;
            return cont.blocks;
          }
        }
      }
    }
    const images = [];
    // Sous-liste imbriquée (Tab pour imbriquer, cf. js/editor.js) : exclue du texte de ce <li>, traitée plus bas comme ses propres blocs.
    const nestedLists = tag === 'LI' ? Array.from(node.children).filter(c => /^(UL|OL)$/.test(c.tagName)) : [];
    const rawRuns = nestedLists.length
      ? inlineRunsExcludingNestedLists(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images)
      : inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images);
    // Image "au cœur du texte" sans alignement : reconstitue plusieurs blocs pdfmake successifs (texte, image, texte...) dans l'ordre réel du document -
    // pdfmake ne sait pas faire une image réellement en ligne.
    if (flowText && rawRuns.some(r => r._imageMarker)) {
      // Une image du flux (dans la ligne, « bloc », centrée) : les lignes mesurées dans l'hôte, cf. inFlowImageBlocksFrom. Un habillage dans le même paragraphe garde le chemin d'avant.
      const flowBlocks = images.some(img => img._floatAlign) ? null : inFlowImageBlocksFrom(node, images, pageBreakBefore);
      if (flowBlocks) return asHeading(flowBlocks);
      const indentPtInline = measureIndentPt(node, 'text');
      const alignInline = alignment(node);
      const segments = [];
      const layeredImages = [];
      let currentTextRuns = [];
      let imgIdx = 0;
      rawRuns.forEach(r => {
        if (r._imageMarker) {
          const image = images[imgIdx++];
          // Une image en calque est hors du flux : elle ne coupe pas le texte (la ligne continuait sur la suivante dans le PDF, une ligne de plus que dans l'éditeur).
          if (image._pendingImgNode) { layeredImages.push(image); return; }
          segments.push({ textRuns: currentTextRuns });
          currentTextRuns = [];
          segments.push({ image });
        } else {
          currentTextRuns.push(r);
        }
      });
      segments.push({ textRuns: currentTextRuns });
      const blocks = [];
      segments.forEach(seg => {
        if (seg.image) {
          blocks.push(seg.image);
          // Cf. commentaire équivalent plus bas (repli si floatedImageParagraphFrom a échoué) : une image gauche/droite qui atterrit malgré tout ici doit
          // pouvoir reporter son habillage sur le(s) frère(s) suivant(s).
          if (seg.image._floatAlign) {
            const imgRect = seg.image._sourceImgNode.getBoundingClientRect();
            blocks._floatCarry = makeFloatCarry(imgRect, seg.image._floatAlign, seg.image.width, availableWidthPt);
          }
          return;
        }
        const runs = trimEdgeWhitespace(seg.textRuns);
        if (!runs.length) return; // segment vide (ex. deux images consécutives, ou espace pur entre deux images)
        const textBlock = { text: runs, margin: [indentPtInline, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
        if (alignInline) textBlock.alignment = alignInline;
        blocks.push(textBlock);
      });
      layeredImages.forEach(image => blocks.push(image));
      // Un paragraphe qui ne porte que des images en calque (hors du flux), ou rien du tout, garde sa ligne, comme dans l'éditeur et le Word : sans elle, tout ce qui suit
      // remontait d'une ligne dans le PDF (Antoine, 2026-10-02, le calque « Sur toutes les pages » posé dans une ligne vide en haut du modèle). Le saut de page qui le précède
      // s'accroche à cette ligne, qui ouvre la page comme dans l'éditeur.
      if (!blocks.some(b => !b._pendingImgNode)) blocks.unshift({ text: ' ', margin: [indentPtInline, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO });
      if (pageBreakBefore && blocks[0]) blocks[0].pageBreak = 'before';
      return asHeading(blocks);
    }
    const runs = trimEdgeWhitespace(rawRuns.filter(r => !r._imageMarker));
    const blocks = [];
    const indentPt = measureIndentPt(node, (tag === 'LI' || /^H[1-6]$/.test(tag)) ? 'box' : 'text');
    // Marge verticale nulle entre blocs (mesuré : .tiptap p/h1-6/li/ol/ul { margin: 0 }) - une marge fictive ici dériverait de la vraie mise en page. Marge
    // droite = spaceWidthPt() : compense white-space:break-spaces.
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node); if (align) block.alignment = align;
    // Une légende vide garde sa hauteur de petite ligne, comme dans l'éditeur (le bloc de repli `text: ' '` n'a aucun run qui porte la taille).
    if (!runs.length && tag === 'P' && node.hasAttribute('data-caption')) block.fontSize = Caption.SIZE_PT;
    if (/^H[1-6]$/.test(tag)) {
      block.bold = true;
      const marker = (headingMarkers && headingMarkers.get(node)) || '';
      if (marker && runs.length) block.text = [{ text: marker, fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }].concat(runs);
      block._isHeading = true;
      block._headingLevel = parseInt(tag.slice(1), 10);
      block._headingText = (marker + (node.textContent || '')).replace(/\s+/g, ' ').trim();
    }
    if (tag === 'LI') {
      if (isTaskListItem(node)) {
        delete block.text;
        delete block.alignment; // porté sur la colonne de texte, cf. taskListColumns
        block.columns = taskListColumns(node, taskListRuns(node, runs), align);
      } else {
        block.text = runs.length ? [{ text: listMarkerFor(node), fontSize: DEFAULT_FONT_SIZE }].concat(runs) : ' ';
      }
    }
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, 4, spaceWidthPt(), 4]; }
    // Un bloc sans aucun texte qui ne contient qu'une image DANS LE FLUX n'a pas besoin du bloc-texte de repli `text: ' '` : l'image fait sa hauteur, le pousser quand même
    // décalait tout le contenu suivant (et faussait l'ancrage des images voisines, cf. resolvePendingImageAnchors). Celui qui ne porte que des images en calque, hors du flux,
    // garde sa ligne comme dans l'éditeur (cf. plus haut).
    if (runs.length || !images.length || images.every(img => img._pendingImgNode)) {
      if (pageBreakBefore) block.pageBreak = 'before';
      blocks.push(block);
    } else if (pageBreakBefore && images[0]) {
      images[0].pageBreak = 'before';
    }
    images.forEach(img => {
      blocks.push(img);
      // Image flottante seule dans son paragraphe (aucun texte à côté) : le flottement doit quand même pouvoir se reporter sur le(s) frère(s) suivant(s), cf.
      // wrapParagraphBesideCarriedFloat.
      if (img._floatAlign) {
        const imgRect = img._sourceImgNode.getBoundingClientRect();
        blocks._floatCarry = makeFloatCarry(imgRect, img._floatAlign, img.width, availableWidthPt);
      }
    });
    nestedLists.forEach(list => {
      Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
        blockFrom(li, false, headingMarkers, availableWidthPt, rootRect).forEach(b => blocks.push(b));
      });
    });
    return blocks;
  }

  async function buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel, opts) {
    const blocks = [];
    // Parallèle à `blocks` : le nœud DOM top-level source de chaque entrée - sert uniquement à mesurer la position RENDUE réelle des blocs voisins d'une
    // image en calque (cf. résolution d'ancrage plus bas), pas besoin ailleurs.
    const sourceNodes = [];
    const headingBlocks = []; const tocBlocks = []; const footnoteBlocks = [];
    // Remis à zéro seulement au vrai appel top-level : cette fonction est aussi appelée imbriquée par colonne (twoColumnsFrom) - sans ce garde-fou, la 2e
    // colonne effaçait la note de la 1ère. Variables de module (pas des paramètres) pour continuer la numérotation à toute profondeur.
    if (isTopLevel) {
      footnoteCounter = 0;
      footnoteEntries = [];
      stretchedBlocks = [];
    }
    // Images en calque imbriquées (cellule de tableau, colonne 2-colonnes) - accumulées à part de resolvePendingImageAnchors (qui ne voit que le top-level) :
    // tableFrom/twoColumnsFrom posent un `_nestedPending` sur leur bloc, récolté ici puis fusionné dans content._pendingImages, même résolution.
    const nestedPendingAll = [];
    const rootRect = root.getBoundingClientRect();
    let pendingPageBreak = false;
    // Habillage d'une image flottante qui déborde encore verticalement une fois son paragraphe hôte terminé - transmis au(x) frère(s) suivant(s) via
    // blockFrom tant qu'ils restent des <p>/<div> simples ; remis à null dès qu'arrive une structure plus complexe (tableau, titre, liste...).
    let floatCarry = null;
    // Macro-modèle : rang du slot que le dernier saut de page ouvre tant que son premier bloc n'est pas posé, puis rang -> indice de ce bloc dans `blocks`.
    let pendingSlotStart = null;
    let currentSlot = null;
    const slotStarts = {};
    // Parallèle à `blocks` : le slot de chaque bloc (null hors macro-modèle) - une image sans position de page n'est encadrée que par les blocs de son slot.
    const blockSlots = [];
    // « Rester ensemble » (js/caption.js) : les images et les tableaux du texte courant que suit une légende, avec leur légende - { start, last }, le premier bloc de l'image ou du tableau (la
    // dernière ligne seule, pour un tableau qui se coupe entre deux lignes) et le dernier bloc de la légende. captionKeepRule les garde sur une même page. `captionOwner` : le bloc qui
    // vient d'être posé et peut encore recevoir sa légende (le frère suivant) ; tout autre nœud le referme.
    const captionPairs = [];
    let captionOwner = null;
    const inFlow = block => !!block && !block._pendingImgNode && !block.absolutePosition;
    // Le bas, dans l'hôte de mesure, du dernier bloc posé.
    let lastBlockBottomPx = null;
    const push = (block, node) => {
      if (pendingSlotStart != null) { slotStarts[pendingSlotStart] = blocks.length; pendingSlotStart = null; }
      blocks.push(block); sourceNodes.push(node); blockSlots.push(currentSlot);
    };
    const visit = async node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) { captionOwner = null; push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }, node.parentElement); } pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const owner = captionOwner;
      captionOwner = null;
      if (node.classList.contains('page-break-marker')) {
        pendingPageBreak = true; floatCarry = null;
        if (isTopLevel && node.hasAttribute('data-macro-slot')) { currentSlot = pendingSlotStart = node.getAttribute('data-macro-slot'); }
        return;
      }
      if (node.classList.contains('heading-numbering-config')) return;
      if (node.classList.contains('toc-marker')) {
        const tocBlock = { stack: [{ text: I18n.t('pdf.tocTitle'), bold: true, fontSize: 16 }], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
        push(tocBlock, node); tocBlocks.push(tocBlock); pendingPageBreak = false; floatCarry = null;
        return;
      }
      // Pas de branche dédiée pour un <table> : le HTML sérialisé (Editor.getHTML()) ne porte jamais le wrapper de défilement ajouté en édition live, un
      // <table> y est donc un enfant direct, déjà couvert par isBlock()/blockFrom() ci-dessous.
      if (node.classList.contains('two-columns-zone')) {
        const footnoteCheckpoint = footnoteEntries.length;
        let zoneBlock;
        try { zoneBlock = await twoColumnsFrom(node, pendingPageBreak, rootRect); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        if (zoneBlock && zoneBlock._nestedPending) { nestedPendingAll.push(...zoneBlock._nestedPending); delete zoneBlock._nestedPending; }
        // Note(s) trouvée(s) n'importe où dans cette zone : rattachées au bloc top-level englobant, suffisant pour savoir sur quelle page placer le texte de
        // la note.
        if (footnoteEntries.length > footnoteCheckpoint) footnoteBlocks.push(...footnoteEntries.slice(footnoteCheckpoint).map(fe => ({ block: zoneBlock, number: fe.number, text: fe.text })));
        push(zoneBlock, node);
        pendingPageBreak = false; floatCarry = null;
        return;
      }
      if (node.classList.contains('callout')) {
        const footnoteCheckpoint = footnoteEntries.length;
        let calloutBlock;
        try { calloutBlock = await calloutFrom(node, pendingPageBreak, rootRect); }
        catch (e) { console.warn('[PdfExport] encadré ignoré (structure inattendue), repli en texte brut :', e); calloutBlock = fallbackTextBlock(node, pendingPageBreak); }
        if (calloutBlock && calloutBlock._nestedPending) { nestedPendingAll.push(...calloutBlock._nestedPending); delete calloutBlock._nestedPending; }
        if (footnoteEntries.length > footnoteCheckpoint) footnoteBlocks.push(...footnoteEntries.slice(footnoteCheckpoint).map(fe => ({ block: calloutBlock, number: fe.number, text: fe.text })));
        push(calloutBlock, node);
        pendingPageBreak = false;
        floatCarry = (calloutBlock && calloutBlock._floatCarryOut) || null;
        if (calloutBlock) delete calloutBlock._floatCarryOut;
        lastBlockBottomPx = null;
        return;
      }
      if (isBlock(node)) {
        const footnoteCheckpoint = footnoteEntries.length;
        let produced;
        // Les légendes qui suivent une image ou un tableau du texte courant (hauteur en points : un tableau en tient compte pour garder sa dernière ligne avec elles).
        const keepable = isTopLevel && tablePageHeightPt > 0;
        const captions = keepable ? Caption.captionsAfter(node) : [];
        const captionPt = captions.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) * PX_TO_PT;
        const carriedFloat = floatCarry && floatCarry.overlay ? floatCarry : null;
        try { produced = blockFrom(node, pendingPageBreak, headingMarkers, availableWidthPt, rootRect, floatCarry, captionPt); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        floatCarry = (produced && produced._floatCarry) || null;
        // Une image habillée qui dépasse encore le bloc d'avant : un paragraphe se range à côté d'elle (carriedFloatBlocksFrom), mais tout autre bloc (tableau, titre, liste, citation, code, paragraphe qui porte lui-même une
        // image) n'a pas de texte décalable : il repart sous l'image, sans la recouvrir.
        // Le navigateur le fait descendre sous l'image de lui-même quand il ne tient pas à côté (un tableau) : le vide qu'il a laissé au-dessus du bloc se retrouve dans le PDF ; sinon (un titre, une liste), c'est ce qu'il faut pour passer sous l'image.
        const nodeRect = node.getBoundingClientRect();
        if (carriedFloat && !produced._carried) {
          const gapPt = Math.max(carriedFloat.floatBottomPx - nodeRect.top, lastBlockBottomPx == null ? 0 : nodeRect.top - lastBlockBottomPx) * PX_TO_PT;
          const first = produced.find(inFlow);
          if (gapPt > 0.5 && first) addTopMargin(first, gapPt);
        }
        lastBlockBottomPx = nodeRect.bottom;
        // Attache toute note trouvée dans ce nœud au premier bloc produit : plusieurs blocs pour un seul nœud source atterrissent presque toujours sur la
        // même page, précision suffisante ici.
        const newFootnotes = footnoteEntries.length > footnoteCheckpoint ? footnoteEntries.slice(footnoteCheckpoint) : null;
        // Un saut de page ne tient pas sur une image en calque : elle sort du flux (position absolue résolue plus tard) et l'emporte avec elle, le texte qui suit restait
        // alors sur la page d'avant. Le paragraphe qui ne contient QUE de telles images (un triangle de coin posé juste après le saut) le laisse au bloc suivant.
        const breakLeavesWithLayers = pendingPageBreak && produced.length > 0 && produced.every(b => b && b._pendingImgNode);
        if (breakLeavesWithLayers) produced.forEach(b => { delete b.pageBreak; });
        produced.forEach((b, i) => {
          if (b && b._nestedPending) { nestedPendingAll.push(...b._nestedPending); delete b._nestedPending; }
          push(b, node); if (b && b._isHeading) headingBlocks.push(b);
          if (i === 0 && newFootnotes) footnoteBlocks.push(...newFootnotes.map(fe => ({ block: b, number: fe.number, text: fe.text })));
        });
        pendingPageBreak = breakLeavesWithLayers;
        if (keepable) {
          if (owner && Caption.isCaptionElement(node)) {
            // Une légende de l'image ou du tableau qui précède : le dernier bloc posé de la paire est celui de cette légende (une autre légende à la suite le prolongera).
            const lastBlock = produced.filter(inFlow).pop();
            if (lastBlock) {
              if (!owner.pair) { owner.pair = { start: owner.start, last: lastBlock }; owner.start.id = CAPTION_KEEP_ID + captionPairs.length; captionPairs.push(owner.pair); }
              else owner.pair.last = lastBlock;
              captionOwner = owner;
            }
          } else if (captions.length) {
            // L'image ou le tableau et sa légende tiennent-ils ensemble dans une page ? Sinon rien à garder (Caption.fitsWithCaption). Un tableau coupé entre deux lignes ne garde que sa dernière ligne.
            const tail = produced.find(b => b && b._keepTail);
            const start = tail || produced.find(inFlow);
            const unitPt = tail ? tail._keepUnitPt : (node.getBoundingClientRect().height * PX_TO_PT + captionPt);
            if (start && Caption.fitsWithCaption(unitPt, tablePageHeightPt)) captionOwner = { start, pair: null };
          }
        }
        return;
      }
      for (const child of Array.from(node.childNodes)) { await visit(child); }
    };
    for (const child of Array.from(root.childNodes)) { await visit(child); }
    // Repli si structure de titres inattendue : le tocBlock garde son stack par défaut (le titre du sommaire seul, posé à sa création) plutôt que de faire
    // échouer tout l'export - même granularité de repli que blockFrom pour un bloc de contenu.
    tocBlocks.forEach(tocBlock => {
      try {
        const built = buildTocStack(headingBlocks);
        tocBlock.stack = built.stack;
        tocBlock._pageNumberCells = built.pageNumberCells;
      } catch (e) { console.warn('[PdfExport] sommaire ignoré (structure de titres inattendue) :', e); }
    });
    // Une colonne contient ses images habillées : l'image qui dépasse son dernier bloc lui donne sa hauteur, marge du dessous comprise. Un encadré, non (`opts.floatsOverflow`) : l'image dépasse, comme dans l'éditeur.
    if (!isTopLevel && !(opts && opts.floatsOverflow) && floatCarry && floatCarry.overlay && lastBlockBottomPx != null) {
      const lastFlow = blocks.slice().reverse().find(inFlow);
      const extraPt = (floatCarry.floatBottomPx - lastBlockBottomPx) * PX_TO_PT;
      if (extraPt > 0.5 && lastFlow) addBottomMargin(lastFlow, extraPt);
    }
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    content._headingBlocks = headingBlocks;
    content._tocBlocks = tocBlocks;
    content._footnoteBlocks = footnoteBlocks;
    content._slotStarts = slotStarts;
    content._captionPairs = captionPairs;
    content._stretchedBlocks = stretchedBlocks;
    // Repli : images en calque laissées à leur placeholder plutôt que de faire échouer tout l'export si l'ancrage échoue.
    try { content._pendingImages = resolvePendingImageAnchors(rootRect, blocks, sourceNodes, blockSlots).concat(nestedPendingAll); }
    catch (e) { console.warn('[PdfExport] ancrage des images en calque ignoré :', e); content._pendingImages = nestedPendingAll; }
    return content;
  }

  // Une image en calque est positionnée par glisser n'importe où dans l'éditeur, sans lien avec l'endroit où son <img> vit dans le HTML - ancrer sur le bloc
  // précédent/suivant ne suffit donc pas. On cherche plutôt, parmi tous les blocs top-level mesurables, ceux qui encadrent le plus étroitement l'image.
  function resolvePendingImageAnchors(rootRect, blocks, sourceNodes, blockSlots) {
    const pending = [];
    // Un paragraphe ne contenant QUE l'image produit un bloc-texte compagnon fantôme à hauteur quasi nulle, qui pouvait par coïncidence qualifier comme ancre
    // - exclu de `measurable`, comme le bloc image lui-même.
    const pendingHostNodes = new Set(blocks.map((b, i) => (b && b._pendingImgNode) ? sourceNodes[i] : null).filter(Boolean));
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i], slot: blockSlots[i] })).filter(({ block, node }) => block && !block._pendingImgNode && !pendingHostNodes.has(node));
    // Une image nichée avec du texte réel autour a une meilleure référence que le bracketing générique : le début de son propre paragraphe. Prioritaire sur
    // le bracketing générique quand disponible.
    const hostToOwnTextBlock = new Map();
    blocks.forEach((b, i) => {
      if (b && !b._pendingImgNode && sourceNodes[i] && !hostToOwnTextBlock.has(sourceNodes[i])) hostToOwnTextBlock.set(sourceNodes[i], b);
    });
    // Tolérance de rendu : sous-pixels de police/line-height d'un navigateur à l'autre, pas une erreur de logique - initialement 0.5px, mesuré insuffisant
    // (cas réel : un paragraphe de plusieurs lignes centrées débordait son ancre de 1.25px, ratant le bracketing "au-dessus" du tout au tout et faisant
    // retomber l'image sur le repli générique page-relatif - une erreur de fraction de pixel en cascadait une de ~150pt). Le cas le plus courant qui soit
    // (image tout juste insérée puis passée en calque "devant" juste après un paragraphe) place son top QUASIMENT exactement au bord bas de ce paragraphe
    // par construction (setLayer initialise depuis la position rendue courante) - un peu de marge ici est largement justifiée, pas un pis-aller ponctuel.
    const BOUNDARY_EPS_PX = 5;
    blocks.forEach((block, idx) => {
      if (!block || !block._pendingImgNode) return;
      const imgRect = block._pendingImgNode.getBoundingClientRect();
      // Repère BRUT (sans le -A4_PREVIEW_PADDING_TOP_PX ci-dessous), utilisé UNIQUEMENT pour le bracketing above/below juste en dessous : comparer un
      // imgTopPx déjà décalé de -37px à des bottom/top de candidats qui ne le sont pas rendait le bracketing "au-dessus" ~37px trop strict (ratait une
      // ancre pourtant juste au-dessus, cas réel et fréquent : image posée juste après une seule ligne de texte) et le bracketing "en-dessous" ~37px trop
      // permissif (l'asymétrie inverse) - bug découvert en reproduisant le cas le plus basique qui soit (2 colonnes, texte, image juste en dessous).
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
        // Macro-modèle : un bloc d'un autre slot n'est jamais une ancre (le haut du slot d'une image n'a pas de bloc « au-dessus » : celui du slot précédent est sur une autre page).
        if (slot !== blockSlots[idx]) return;
        const r = node.getBoundingClientRect();
        const top = r.top - rootRect.top;
        const bottom = r.bottom - rootRect.top;
        const left = r.left - rootRect.left;
        // Qualifie comme ancre seulement si le bloc ENTIER (haut et bas, pas juste son sommet) se termine avant/commence après l'image - sinon le paragraphe
        // qui contient l'image (texte avant et après) qualifiait à tort comme sa propre ancre "au-dessus". Comparaison sur les repères BRUTS (rawImgTopPx/
        // rawImgBottomPx) des deux côtés - jamais mélanger un côté ajusté à l'autre brut.
        if (bottom <= rawImgTopPx + BOUNDARY_EPS_PX && top > aboveTopPx) { aboveTopPx = top; aboveLeftPx = left; above = other; }
        if (top >= rawImgBottomPx - BOUNDARY_EPS_PX && top < belowTopPx) { belowTopPx = top; belowLeftPx = left; below = other; }
      });
      // parentArray : tableau dans lequel l'image et son ancre vivent toutes les deux, utilisé par resolveNativePdfContent pour relocaliser l'image à côté de
      // son ancre sans dépendre d'un tableau top-level codé en dur.
      pending.push({
        image: block, above, below, imgTopPx, imgLeftPx, imgHeightPx: imgBottomPx - imgTopPx,
        aboveTopPx, belowTopPx, aboveLeftPx, belowLeftPx, container, containerTopPx, containerLeftPx, parentArray: blocks,
      });
    });
    return pending;
  }

  // isTopLevel=true pour le flux principal (titres numérotés/sommaire) ; false pour une colonne 2-colonnes. availableWidthPt : largeur réelle si différente
  // de la pleine page (colonne reconstruite en hôte de mesure séparé).
  //
  // Un bloc vide s'effondre à hauteur nulle en mesure hors-écran, alors que ProseMirror y insère un <br> décoratif (absent de Editor.getHTML()) - plusieurs
  // lignes vides consécutives se mesuraient à la même position, biaisant le bracketing voisin. Corrigé en injectant le même filler avant mesure.
  // Un bloc qui ne porte que des images en calque (hors du flux) garde sa ligne comme dans l'éditeur : même filler, sinon les blocs qui le suivent se mesureraient une ligne trop haut.
  // Une image habillée (à gauche ou à droite) flotte elle aussi : ni elle ni son paragraphe ne prennent de place dans la ligne, l'éditeur laisse à ce paragraphe sa ligne vide (le <br> que ProseMirror pose après elle).
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
  // Macro-modèle (js/macro-templates.js:buildConcatenatedHtml) : chaque slot garde les positions d'image de SON modèle, comptées depuis le haut de SA première page,
  // alors que les slots suivants commencent plus bas, après le saut de page qui les ouvre (data-macro-slot). Deux choses sont posées sur les images en calque du
  // slot : (1) leur `top` descend du décalage du slot dans l'hôte de mesure, pour le repli par ancrage textuel des images sans position de page (encadrées alors par
  // les blocs de leur slot, plus par ceux du premier) ; (2) `data-macro-slot` porte leur slot jusqu'à leur position de page, qui ajoute la page où le slot commence
  // (resolveNativePdfContent). Appelée sur l'hôte attaché, avant la conversion : les copies imbriquées (cellule, colonne) héritent de l'attribut.
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
  async function htmlToPdfContent(html, isTopLevel, availableWidthPt, opts) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    // Ni ligne vide ni saut de page orphelin en fin de document : quand le texte arrive à la marge du bas, ils ouvrent une page blanche (Antoine, 2026-10-01).
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
      // Attend le décodage de chaque <img> de ce root précis avant toute mesure (getBoundingClientRect() sur une image en hauteur auto a besoin du ratio
      // intrinsèque réel) - un simple pré-chauffage du cache navigateur sur un élément séparé s'est avéré insuffisamment fiable.
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      if (isTopLevel) rebaseMacroSlotImages(root);
      return await buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel, opts);
    } finally {
      detachMeasureHost();
    }
  }

  // pdfmake ne sait embarquer que du JPEG/PNG (SVG et WEBP le font bloquer indéfiniment ou lever "Unknown image format") - rastérise donc en PNG via un
  // aller-retour <img>/<canvas>, quel que soit le format source. Cas fréquent : un CDN renvoie du WEBP par négociation de contenu même pour une URL en ".png".
  function rasterizeDataUri(dataUri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL('image/png')); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Échec de décodage de l’image pour rastérisation'));
      img.src = dataUri;
    });
  }
  // pdfmake exige une image en data URI base64 : un simple src http(s)://... (upload Grist ou URL externe) n'est jamais rendu, silencieusement. En cas
  // d'échec (réseau, CORS...), marque l'image à ignorer plutôt que de faire planter tout l'export.
  async function inlineEditorImagesAsDataUri(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';
    const images = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(images.map(async img => {
      let src = img.getAttribute('src') || '';
      if (!src) return;
      try {
        if (!src.startsWith('data:')) {
          const resp = await fetch(src);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const blob = await resp.blob();
          src = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('FileReader a échoué'));
            reader.readAsDataURL(blob);
          });
        }
        if (!/^data:image\/(png|jpe?g);/.test(src)) src = await rasterizeDataUri(src);
        img.setAttribute('src', src);
        // Décode ICI, avant resérialisation : une hauteur `auto` a besoin du ratio intrinsèque, connu seulement une fois décodée - sinon
        // floatedImageParagraphFrom mesurait `imgRect.bottom` trop tôt. `decode()` pré-chauffe aussi le cache pour le <img> reparsé plus tard.
        await img.decode().catch(() => {});
      } catch (e) {
        console.warn('[PdfExport] image ignorée dans le PDF vectoriel (conversion impossible) :', img.getAttribute('src'), e);
        img.setAttribute('data-pdf-skip', '1');
      }
    }));
    return wrapper.innerHTML;
  }

  // Le filigrane en SVG de la taille de la page, pour le fond de chaque page : un seul <text> Roboto gras (les caractères sont ceux de l'embarqué, du vrai texte que le PDF garde),
  // tourné autour du centre de la page. `y` est la LIGNE DE BASE, à 0,342 em sous le centre (PageLayer.WATERMARK_BASELINE_EM) comme à l'écran. Le texte est échappé : une
  // esperluette ou un chevron dans « R&D < 5 » ne doit jamais casser le SVG, et avec lui tout l'export.
  function watermarkSvgFrom(layout) {
    const cx = pageWidthPt / 2, cy = pageHeightPt / 2;
    const escaped = layout.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const num = n => Math.round(n * 100) / 100;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(pageWidthPt) + '" height="' + num(pageHeightPt) + '" viewBox="0 0 ' + num(pageWidthPt) + ' ' + num(pageHeightPt) + '">'
      + '<text x="' + num(cx) + '" y="' + num(cy + PageLayer.WATERMARK_BASELINE_EM * layout.fontSizePt) + '" font-family="Roboto" font-weight="bold" font-size="' + layout.fontSizePt + '" text-anchor="middle"'
      + ' fill="' + layout.color + '" fill-opacity="' + layout.opacity + '" transform="rotate(' + layout.angleDeg + ' ' + num(cx) + ' ' + num(cy) + ')">' + escaped + '</text></svg>';
  }

  // « Rester ensemble » (js/caption.js, choix d'Antoine du 02/10) : la légende d'une image ou d'un tableau ne reste jamais seule en haut de la page suivante. Rappel `pageBreakBefore` de
  // pdfmake : appelé une fois par nœud, après une mise en page, pour le premier bloc de chaque paire (buildPdfContentFromRoot : `id` « pp-keep-N »), il demande de le passer à la page
  // suivante quand lui et sa légende ne sont plus sur la même page (pdfmake remet alors tout en page, la légende suit). Un bloc déjà en haut de sa page ne bouge pas : le passer à la
  // suivante n'ajouterait qu'une page blanche. Pas d'`unbreakable` : pdfmake note les positions d'un bloc insécable à l'endroit où il ne tient pas, avant de le déplacer - la page d'une note ou
  // d'une image en calque ancrée sur lui serait fausse. Un seul paramètre : pdfmake ne dresse les listes des nœuds voisins (en O(n²)) que pour un rappel qui en déclare davantage.
  const CAPTION_KEEP_ID = 'pp-keep-';
  function captionKeepRule(pairs) {
    return function (currentNode) {
      const id = currentNode && currentNode.id;
      if (typeof id !== 'string' || id.indexOf(CAPTION_KEEP_ID) !== 0) return false;
      const pair = pairs[parseInt(id.slice(CAPTION_KEEP_ID.length), 10)];
      if (!pair) return false;
      const first = pair.start.positions && pair.start.positions[0];
      const end = pair.last.positions && pair.last.positions[pair.last.positions.length - 1];
      if (!first || !end || first.pageNumber === end.pageNumber) return false;
      const ownTopMargin = (pair.start._margin && pair.start._margin[1]) || 0;
      return first.verticalRatio * first.pageInnerHeight > ownTopMargin + 2;
    };
  }

  // `headerFooterChunks` threadé à l'identique dans les deux passes (mesure et rendu réel) : sinon la hauteur de page disponible diffère entre elles et un
  // titre/image pourrait changer de page entre mesure et rendu final.
  function buildNativeDocDefinition(content, filename, headerFooterChunks) {
    const hf = headerFooterChunks || { enabled: false, topExtraPt: 0, bottomExtraPt: 0 };
    // `content._footnoteBlocks` est posé par buildPdfContentFromRoot à CHAQUE appel (mesure ET finale, cf. resolveNativePdfContent) - cette condition est
    // donc IDENTIQUE aux deux appels, invariant déjà exigé par topExtraPt/bottomExtraPt (même marge aux deux passes, sinon la pagination mesurée dérive).
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    const topMarginPt = marginTopPt + (hf.topExtraPt || 0);
    const bottomMarginPt = marginBottomPt + (hf.bottomExtraPt || 0) + (hasFootnotes ? FOOTNOTE_BAND_PT : 0);
    const doc = {
      pageSize: PageLayout.pdfPageNameFor(pageFormat), pageOrientation: pageOrientation,
      pageMargins: [marginLeftPt, topMarginPt, marginRightPt, bottomMarginPt],
      defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE },
      content, info: { title: filename || 'publipostage' },
    };
    if ((content._captionPairs || []).length) doc.pageBreakBefore = captionKeepRule(content._captionPairs);
    // Le filigrane (js/page-layer.js:watermarkLayout : le corps et l'angle que l'éditeur dessine) : le premier des fonds de CHAQUE page, donc derrière le texte et derrière les
    // images en calque, comme à l'écran. Pas le `watermark` natif de pdfmake, qui se peint APRÈS le contenu (par-dessus le texte et les images) et que rien ne descend dessous.
    const watermarkNode = (layout => (layout ? { svg: watermarkSvgFrom(layout), absolutePosition: { x: 0, y: 0 } } : null))(PageLayer.watermarkLayout(pageWatermark, pageWidthPt, pageHeightPt));
    // Images « derrière » à position de page, au-delà de la 1re page (resolveNativePdfContent) : pdfmake appelle `background` page par page, 1-based.
    const behindByPage = content._backgroundByPage || {};
    // Les images répétées (« Sur toutes les pages ») sur chaque page de leur courrier, avant celles d'une seule page : une copie par appel, pdfmake range ses mesures sur le nœud
    // qu'il traite.
    const repeatedLayer = content._repeatedLayer || [];
    if (watermarkNode || repeatedLayer.length || Object.keys(behindByPage).length) {
      doc.background = currentPage => {
        const nodes = (watermarkNode ? [Object.assign({}, watermarkNode)] : [])
          .concat(repeatedLayer.filter(r => currentPage >= r.fromPage && currentPage <= r.toPage).map(r => Object.assign({}, r.image)), behindByPage[currentPage] || []);
        return nodes.length ? nodes : null;
      };
    }
    // pdfmake appelle header/footer par page au moment de peindre - "première page différente" se résout ici (currentPage === 1), pas dans
    // buildHeaderFooterPdfChunks qui se contente de préparer les 2 variantes.
    if (hf.enabled && (hf.header.default || hf.header.first)) {
      doc.header = (currentPage, pageCount) => {
        const chunk = (currentPage === 1 && hf.differentFirstPage) ? hf.header.first : hf.header.default;
        if (!chunk) return null;
        return { margin: [marginLeftPt, marginTopPt * 0.5, marginRightPt, 0], stack: resolvePageNumberPlaceholders(chunk, currentPage, pageCount) };
      };
    }
    // Le pied de page doit exister même sans en-tête/pied configuré par l'utilisateur dès qu'il y a au moins une note : le texte des notes est ajouté après
    // le contenu utilisateur dans le même stack, en réutilisant le callback natif déjà appelé une fois par page.
    if ((hf.enabled && (hf.footer.default || hf.footer.first)) || hasFootnotes) {
      const footnoteByPage = content._footnoteByPage || {};
      doc.footer = (currentPage, pageCount) => {
        const stackParts = [];
        if (hf.enabled) {
          const chunk = (currentPage === 1 && hf.differentFirstPage) ? hf.footer.first : hf.footer.default;
          if (chunk) stackParts.push(...resolvePageNumberPlaceholders(chunk, currentPage, pageCount));
        }
        const notesForPage = footnoteByPage[currentPage];
        if (notesForPage && notesForPage.length) {
          stackParts.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 0.5, lineColor: '#999999' }], margin: [0, 2, 0, 2] });
          notesForPage.forEach(fn => {
            stackParts.push({ text: [{ text: fn.number + '. ', bold: true, fontSize: 8 }, { text: fn.text, fontSize: 8 }], margin: [0, 0, 0, 1] });
          });
        }
        if (!stackParts.length) return null;
        return { margin: [marginLeftPt, 0, marginRightPt, marginBottomPt * 0.5], stack: stackParts };
      };
    }
    return doc;
  }

  // Convertit une image en calque en `absolutePosition` pdfmake, interpolée entre les blocs-ancre au-dessus/en-dessous (repli sur une seule ancre, ou local
  // si aucune résolue). `layer` choisit l'ancre de référence pour Y sur pages différentes - même ordre que la relocation : "devant" préfère le dessous.
  function resolveImageAbsolutePosition(a, topMarginPt, bottomMarginPt, layer) {
    const effectiveTopMarginPt = topMarginPt != null ? topMarginPt : marginTopPt;
    const effectiveBottomMarginPt = bottomMarginPt != null ? bottomMarginPt : marginBottomPt;
    // X suit exactement la même structure que Y ci-dessous (container prioritaire, puis interpolation above+below, puis repli sur une seule ancre, puis
    // page-relatif générique) - sans ça, une image ancrée "au-dessus"/"en-dessous" (pas "container") recevait un imgLeftPx déjà converti au référentiel de
    // la colonne/cellule (par twoColumnsFrom/attributeNestedPendingImages) mais réinterprété à tort par le repli page-relatif, donnant un X hors-page.
    let xPt;
    if (a.containerLeftPx != null && a.containerLeft != null) {
      xPt = a.containerLeft + (a.imgLeftPx - a.containerLeftPx) * PX_TO_PT;
    } else if (a.aboveLeft != null && a.belowLeft != null && a.abovePage === a.belowPage && a.belowLeftPx !== a.aboveLeftPx) {
      const fractionX = (a.imgLeftPx - a.aboveLeftPx) / (a.belowLeftPx - a.aboveLeftPx);
      xPt = a.aboveLeft + fractionX * (a.belowLeft - a.aboveLeft);
    } else if (layer === 'front' && a.belowLeft != null) {
      xPt = a.belowLeft + (a.imgLeftPx - a.belowLeftPx) * PX_TO_PT;
    } else if (layer === 'front' && a.aboveLeft != null) {
      xPt = a.aboveLeft + (a.imgLeftPx - a.aboveLeftPx) * PX_TO_PT;
    } else if (layer !== 'front' && a.aboveLeft != null) {
      xPt = a.aboveLeft + (a.imgLeftPx - a.aboveLeftPx) * PX_TO_PT;
    } else if (layer !== 'front' && a.belowLeft != null) {
      xPt = a.belowLeft + (a.imgLeftPx - a.belowLeftPx) * PX_TO_PT;
    } else {
      xPt = marginLeftPt + a.imgLeftPx * PX_TO_PT;
    }
    let yPt;
    // Référence locale prioritaire sur le bracketing générique quand disponible : plus précise, fondée sur le début du paragraphe qui héberge l'image
    // elle-même plutôt qu'une extrapolation depuis un bloc externe éloigné.
    if (a.containerTop != null) {
      yPt = a.containerTop + (a.imgTopPx - a.containerTopPx) * PX_TO_PT;
    } else if (a.aboveTop != null && a.belowTop != null && a.abovePage === a.belowPage && a.belowTopPx !== a.aboveTopPx) {
      const fraction = (a.imgTopPx - a.aboveTopPx) / (a.belowTopPx - a.aboveTopPx);
      yPt = a.aboveTop + fraction * (a.belowTop - a.aboveTop);
    } else {
      // Au-dessus/en-dessous existent mais sur des pages différentes : le delta en px traverserait la coupure, mélangeant deux pages dont pdfmake réinitialise
      // l'origine Y (image projetée hors-page). Repli sans extrapolation (delta 0) - même ordre que la relocation : "devant" sur le dessous.
      const crossesPage = a.aboveTop != null && a.belowTop != null && a.abovePage !== a.belowPage;
      if (layer === 'front' && a.belowTop != null) yPt = a.belowTop + (crossesPage ? 0 : (a.imgTopPx - a.belowTopPx) * PX_TO_PT);
      else if (layer === 'front' && a.aboveTop != null) yPt = a.aboveTop + (a.imgTopPx - a.aboveTopPx) * PX_TO_PT;
      else if (layer !== 'front' && a.aboveTop != null) yPt = a.aboveTop + (crossesPage ? 0 : (a.imgTopPx - a.aboveTopPx) * PX_TO_PT);
      else if (layer !== 'front' && a.belowTop != null) yPt = a.belowTop + (a.imgTopPx - a.belowTopPx) * PX_TO_PT;
      else yPt = effectiveTopMarginPt + a.imgTopPx * PX_TO_PT;
    }
    // Filet de sécurité : une extrapolation sur une seule ancre, ou une ancre mal choisie (bracketing par proximité de pixels, cf. resolvePendingImageAnchors
    // - plus proche dans l'aperçu continu hors-écran mais paginée sur une autre page que l'image), peut faire dépasser `yPt` de la page - image invisible.
    const imgHeightPt = Number.isFinite(a.imgHeightPx) ? Math.max(0, a.imgHeightPx) * PX_TO_PT : 0;
    const maxYPt = pageHeightPt - effectiveBottomMarginPt - imgHeightPt;
    yPt = Math.min(Math.max(yPt, effectiveTopMarginPt), Math.max(effectiveTopMarginPt, maxYPt));
    return { x: xPt, y: yPt };
  }

  // S'il y a un sommaire et/ou des images en calque en attente, une 1ère passe de mesure (.getBuffer(), jamais montrée) donne les vraies page/position des
  // blocs-ancre : le contenu est reconstruit (numéros de page dans le sommaire ; images relocalisées à côté de leur ancre - pdfmake peint sur la page courante).
  async function resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks) {
    // Hauteur utile d'une page pour tableFrom (lignes de tableau gardées entières) : la bande des notes est déduite par prudence, qu'il y ait des notes ou non.
    tablePageHeightPt = pageHeightPt - marginTopPt - marginBottomPt - ((headerFooterChunks && headerFooterChunks.topExtraPt) || 0) - ((headerFooterChunks && headerFooterChunks.bottomExtraPt) || 0) - FOOTNOTE_BAND_PT;
    // Images habillées qui ne tiennent pas dans ce qui reste de leur page : leur ancre (et son image) passe en haut de la page suivante (rang parmi les ancres, dans l'ordre du document), cf. la boucle de mesure plus bas.
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
    const layOut = () => new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename, headerFooterChunks)).getBuffer(() => resolve()); });
    // Les lignes justifiées posées à la main sont étirées sur une largeur estimée dans le navigateur : une première mise en page en mesure l'écart, la seconde l'annule (learnStretchedLines).
    if ((content._stretchedBlocks || []).length) {
      await layOut();
      learnStretchedLines(content._stretchedBlocks);
      content = await buildContent();
    }
    const hasToc = (content._tocBlocks || []).length > 0;
    const hasPendingImages = (content._pendingImages || []).length > 0;
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    // Images habillées (floatParagraphBlocksFrom) : le bloc de texte qui porte chacune, dans l'ordre du document. Leur page et leur hauteur viennent de la passe de mesure ci-dessous.
    const hasFloatOverlays = floatAnchorsOf(content).length > 0;
    // Marge haute réelle de cette passe - doit être identique à celle de la passe réelle pour que la pagination mesurée ici corresponde exactement au
    // document final.
    const topMarginPt = marginTopPt + ((headerFooterChunks && headerFooterChunks.topExtraPt) || 0);
    // Doit suivre exactement la même formule que buildNativeDocDefinition (bottomMarginPt) - sert de plancher au filet de sécurité anti-débordement de
    // resolveImageAbsolutePosition, doit donc matcher la vraie marge basse rendue.
    const bottomMarginPt = marginBottomPt + ((headerFooterChunks && headerFooterChunks.bottomExtraPt) || 0) + (hasFootnotes ? FOOTNOTE_BAND_PT : 0);
    if (hasToc || hasPendingImages || hasFootnotes || hasFloatOverlays) {
      const measure = layOut;
      // Un bloc composite (ex. columns) peut porter une entrée de remesure pdfmake à {left:0,top:0}, à une position non déterministe - l'écarter. Un bloc
      // texte multi-lignes porte UNE entrée par ligne réellement enchaînée : above/below/container sont tous mesurés côté éditeur par le HAUT du bloc
      // (xxxTopPx), donc leur pendant PDF doit être sa 1ère ligne, pas la dernière - sinon le delta img-ancre compte la hauteur du bloc en trop.
      const firstPosition = block => {
        if (!block || !block.positions || !block.positions.length) return null;
        const real = block.positions.filter(p => !(p.left === 0 && p.top === 0));
        const list = real.length ? real : block.positions;
        return list[0];
      };
      await measure();
      // Une image habillée qui ne tient pas dans ce qui reste de sa page (elle serait coupée par le bord, ou le texte à côté d'elle passerait à la page suivante sans elle) : son ancre ouvre la page suivante, avec elle. Ce qui
      // précède reste en place, ce qui suit se range à côté d'elle comme avant. Déplacer une ancre change la pagination de ce qui la suit : on mesure de nouveau (au plus quelques fois), jusqu'à ce que toutes tiennent ou ouvrent
      // déjà leur page.
      for (let round = 0; round < 4 && hasFloatOverlays; round += 1) {
        const pageBottomPt = pageHeightPt - bottomMarginPt;
        const moving = [];
        floatAnchorsOf(content).forEach((anchor, i) => {
          const pos = firstPosition(anchor);
          // Dans une case ou une colonne, l'image suit son conteneur (qui ne se coupe pas d'une page à l'autre pour elle) ; un encadré, lui, passe à la page suivante avec elle.
          const target = floatMovesWith(anchor);
          if (!pos || floatBreaks.has(i) || !target) return;
          const topPt = pos.top + anchor._floatOverlay.dyPt;
          const targetPos = firstPosition(target);
          if (targetPos && targetPos.top > topMarginPt + 1 && topPt + anchor._floatOverlay.reachPt > pageBottomPt + 0.5) moving.push(i);
        });
        if (!moving.length) break;
        moving.forEach(i => floatBreaks.add(i));
        content = await buildContent();
        await measure();
      }
      const headingPageNumbers = (content._headingBlocks || []).map(b => { const at = b._headingLeaf || b; return (at.positions && at.positions[0] && at.positions[0].pageNumber) || null; });
      // Capturé avant de reconstruire : fb.block.positions devient obsolète dès que htmlToPdfContent recrée des objets neufs. Le numéro de chaque note est
      // déjà définitif dès la 1ère passe (numérotation continue) - seule sa page avait besoin d'être mesurée.
      const footnotePageNumbers = (content._footnoteBlocks || []).map(fb => (fb.block.positions && fb.block.positions[0] && fb.block.positions[0].pageNumber) || null);
      const resolvedAnchors = (content._pendingImages || []).map(p => {
        const aboveResolved = firstPosition(p.above);
        const belowResolved = firstPosition(p.below);
        const containerResolved = firstPosition(p.container);
        return {
          aboveTop: aboveResolved ? aboveResolved.top : null, abovePage: aboveResolved ? aboveResolved.pageNumber : null,
          belowTop: belowResolved ? belowResolved.top : null, belowPage: belowResolved ? belowResolved.pageNumber : null,
          // aboveLeft/belowLeft (comme aboveTop/belowTop) : sans eux, resolveImageAbsolutePosition n'avait pour X que "container" ou le repli page-relatif
          // générique - une image ancrée "au-dessus"/"en-dessous" (pas "container") dans une colonne/cellule recevait un X déjà converti au référentiel de
          // la colonne (par twoColumnsFrom) réinterprété à tort comme page-relatif, donnant un X aberrant (mesuré : hors-page).
          aboveLeft: aboveResolved ? aboveResolved.left : null, belowLeft: belowResolved ? belowResolved.left : null,
          containerTop: containerResolved ? containerResolved.top : null, containerTopPx: p.containerTopPx,
          // Seules les images imbriquées dans une cellule posent containerLeft/ containerLeftPx (cf. attributeNestedPendingImages) - pilote le calcul de X en
          // cellule-relatif dans resolveImageAbsolutePosition.
          containerLeft: containerResolved ? containerResolved.left : null, containerLeftPx: p.containerLeftPx,
          hadAbove: !!p.above, hadBelow: !!p.below,
          imgTopPx: p.imgTopPx, imgLeftPx: p.imgLeftPx, imgHeightPx: p.imgHeightPx,
          aboveTopPx: p.aboveTopPx, belowTopPx: p.belowTopPx, aboveLeftPx: p.aboveLeftPx, belowLeftPx: p.belowLeftPx,
        };
      });
      // Page (pdfmake, 1-based) de chaque bloc DE PREMIER NIVEAU du document, dans le même ordre que `content` (le tableau top-level lui-même, alias
      // `blocks` dans buildPdfContentFromRoot) - sert UNIQUEMENT à retrouver "un bloc quelconque sur la page N" pour y insérer une image grille-page à
      // côté (ordre de peinture devant/derrière), jamais à calculer sa position elle-même (déjà connue, cf. _pageGrid ci-dessous). Exclut les images en
      // attente elles-mêmes (placeholder {x:0,y:0}, position pas encore significative) - sinon une image pouvait se retrouver choisie comme SA PROPRE
      // ancre, retirée de `content` puis jamais réinsérée (indexOf introuvable après coup) : disparaissait purement et simplement du PDF final.
      const pendingImageObjs = new Set((content._pendingImages || []).map(p => p.image));
      const blockPageNumbers = content.map(b => { if (pendingImageObjs.has(b)) return null; const pos = firstPosition(b); return pos ? pos.pageNumber : null; });
      const floatPositions = floatAnchorsOf(content).map(firstPosition);
      content = await buildContent();
      // Les blocs d'origine, dans l'ordre de `blockPageNumbers` : chaque image insérée plus bas décale les indices de `content`, un indice relu après coup désignerait un
      // autre bloc (une image de la page 2 se retrouvait ancrée en page 1 dès qu'une image de la page 1 avait été insérée avant elle).
      const originalBlocks = content.slice();
      // Macro-modèle : page (0 pour le premier slot) où commence chaque slot, celle de son premier bloc mesurable - le premier bloc peut être une image en attente,
      // sans page. Lue AVANT que les images ne soient insérées dans `content` : les indices de `_slotStarts` sont ceux de la liste d'origine.
      const slotStartPages = {};
      Object.keys(content._slotStarts || {}).forEach(slot => {
        for (let j = content._slotStarts[slot]; j < blockPageNumbers.length; j++) {
          if (blockPageNumbers[j] != null) { slotStartPages[slot] = blockPageNumbers[j] - 1; break; }
        }
      });
      (content._tocBlocks || []).forEach(tocBlock => {
        (tocBlock._pageNumberCells || []).forEach((cell, i) => { if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]); });
      });
      // Regroupe chaque note par la page réelle de son appel (mesurée ci-dessus) - consommé par le callback doc.footer natif de pdfmake pour placer le texte
      // au pied de la bonne page.
      const footnoteByPage = {};
      (content._footnoteBlocks || []).forEach((fb, i) => {
        const pageNum = footnotePageNumbers[i];
        if (pageNum == null) return;
        (footnoteByPage[pageNum] = footnoteByPage[pageNum] || []).push({ number: fb.number, text: fb.text });
      });
      content._footnoteByPage = footnoteByPage;
      const behindByPage = {};
      content._backgroundByPage = behindByPage;
      // Images habillées : peintes en fond de la page de leur ancre, à la hauteur de sa première ligne (le texte, lui, est déjà décalé à côté, cf. floatParagraphBlocksFrom) ; elles ne sont pas dans le flux,
      // la pagination de cette passe est celle de la passe de mesure. Une ancre que pdfmake n'a pas posée garde son image dans le flux plutôt que de la perdre.
      floatAnchorsOf(content).forEach((anchor, i) => {
        const { image, align, dyPt, nested, offsetPt } = anchor._floatOverlay;
        delete anchor._floatOverlay;
        const siblings = anchor._floatSiblings || content;
        delete anchor._floatSiblings;
        delete anchor._floatTop;
        const pos = floatPositions[i];
        if (!pos) { siblings.splice(siblings.indexOf(anchor) + 1, 0, image); return; }
        // Dans un conteneur, le bord gauche de l'image est celui de son texte (la position de l'ancre, marge comprise) moins sa marge, plus l'écart que le navigateur a mesuré.
        const x = nested ? pos.left - ((anchor.margin && anchor.margin[0]) || 0) + offsetPt
          : (align === 'right' ? pageWidthPt - marginRightPt - image.width : marginLeftPt);
        image.absolutePosition = { x, y: pos.top + dyPt };
        (behindByPage[pos.pageNumber] = behindByPage[pos.pageNumber] || []).push(image);
      });
      // « Sur toutes les pages » (js/page-layer.js) : les images répétées, chacune avec les pages (1-based) de son courrier ; buildNativeDocDefinition les peint en fond de chacune.
      const repeatedLayer = [];
      content._repeatedLayer = repeatedLayer;
      // Un macro-modèle assemble ses courriers à la suite : le courrier d'une image répétée est le sien, de sa première page à celle d'avant le courrier suivant (le premier courrier
      // n'a pas de saut de page marqué, son `macroSlot` est nul). Hors macro-modèle (aucun saut marqué) : toutes les pages.
      const slotIds = Object.keys(slotStartPages).sort((a, b) => slotStartPages[a] - slotStartPages[b]);
      const slotPageRange = slot => {
        if (!slotIds.length) return { from: 1, to: Infinity };
        if (slot == null || slotStartPages[slot] == null) return { from: 1, to: slotStartPages[slotIds[0]] };
        const next = slotIds[slotIds.indexOf(slot) + 1];
        return { from: slotStartPages[slot] + 1, to: next != null ? slotStartPages[next] : Infinity };
      };
      (content._pendingImages || []).forEach((p, i) => {
        const layer = p.image._pendingLayer;
        const pageGrid = p.image._pageGrid;
        const repeat = !!p.image._repeat;
        delete p.image._pendingImgNode;
        delete p.image._pendingLayer;
        delete p.image._pageGrid;
        delete p.image._repeat;
        if (pageGrid) {
          // Position connue directement (capturée dans l'éditeur, Aperçu A4) - aucun ancrage/interpolation à faire, garantie de rendu identique à
          // l'éditeur. Seule inconnue restante : sur QUELLE page ce document (peut-être modifié depuis) place réellement ce contenu aujourd'hui - trouvée
          // via blockPageNumbers, jamais en reconstruisant une position depuis un ancrage textuel.
          p.image.absolutePosition = PageLayer.pagePositionPt({ leftPt: pageGrid.pageLeftPt, topPt: pageGrid.pageTopPt }, marginLeftPt, topMarginPt);
          if (repeat) {
            // Sortie du flux (comme une image à position de page, qui s'évade de son tableau ou de sa colonne) : elle ne dépend plus d'aucun bloc, elle est le fond de chaque page.
            const flowArr = p.parentArray || content;
            const flowIdx = flowArr.indexOf(p.image);
            if (flowIdx !== -1) flowArr.splice(flowIdx, 1);
            const range = slotPageRange(pageGrid.macroSlot);
            repeatedLayer.push({ image: p.image, fromPage: range.from, toPage: range.to });
            return;
          }
          const targetPage = pageGrid.pageIndex + 1 + (slotStartPages[pageGrid.macroSlot] || 0);
          const candidateIdxs = blockPageNumbers.reduce((acc, pn, j) => { if (pn === targetPage) acc.push(j); return acc; }, []);
          // Page introuvable (document raccourci depuis le dernier positionnement de cette image, ex.) : repli sur la DERNIÈRE page connue plutôt que de
          // laisser l'image bloquée sur son tableau/colonne d'origine (pourrait ne plus exister au même endroit après une réédition du contenu).
          const fallbackIdxs = candidateIdxs.length ? candidateIdxs : blockPageNumbers.reduce((acc, pn, j) => { if (pn != null) acc.push(j); return acc; }, []);
          if (!fallbackIdxs.length) return;
          // "devant" peint APRÈS tout le reste de sa page (recouvre), "derrière" AVANT (recouvert) - même intention que le bracketing historique
          // ci-dessous, réduite à "en dernier/en premier sur la page" puisqu'il n'y a plus de bloc-ancre précis à respecter.
          const anchorBlock = originalBlocks[layer === 'front' ? fallbackIdxs[fallbackIdxs.length - 1] : fallbackIdxs[0]];
          const insertAfter = layer === 'front';
          // Toujours au niveau racine (jamais p.parentArray) : une image grille-page est volontairement indépendante de son tableau/colonne d'origine -
          // elle "s'évade" vers le contenu top-level, ce qui ne change rien visuellement (absolutePosition ignore la profondeur d'imbrication). Retirée de
          // son tableau d'ORIGINE (souvent nested) avant d'être insérée dans `content`, jamais les deux à la fois (sinon dupliquée dans le PDF final).
          const sourceArr = p.parentArray || content;
          const sourceIdx = sourceArr.indexOf(p.image);
          if (sourceIdx !== -1) sourceArr.splice(sourceIdx, 1);
          // Page réellement retenue : la page visée, ou la dernière connue quand elle n'existe plus.
          const placedPage = candidateIdxs.length ? targetPage : blockPageNumbers[fallbackIdxs[fallbackIdxs.length - 1]];
          // pdfmake pose une image à position absolue sur la page où il en est de son contenu : « derrière » est insérée AVANT le premier bloc de sa page, ce qui,
          // dès la 2e page, la fait tomber sur la page précédente (le saut de page n'a lieu qu'avec ce bloc). Le fond de page (`background`, appelé page par
          // page et peint avant le texte, ce que « derrière » veut dire) la met sur la bonne page : buildNativeDocDefinition le lit dans _backgroundByPage.
          if (layer !== 'front' && placedPage > 1) { (behindByPage[placedPage] = behindByPage[placedPage] || []).push(p.image); return; }
          const anchorIdx = content.indexOf(anchorBlock);
          if (anchorIdx === -1) return;
          content.splice(insertAfter ? anchorIdx + 1 : anchorIdx, 0, p.image);
          return;
        }
        const a = resolvedAnchors[i];
        p.image.absolutePosition = resolveImageAbsolutePosition(a, topMarginPt, bottomMarginPt, layer);
        // pdfmake peint content[] dans l'ordre (une entrée plus tardive recouvre les précédentes) : "devant" doit finir aussi tard que possible (ancré sur le
        // bloc du dessous, inséré après) pour recouvrir le texte proche ; "derrière" l'inverse (ancré au-dessus, inséré avant).
        let anchorBlock = null; let insertAfter = true;
        if (layer === 'front') {
          if (a.belowTop != null) { anchorBlock = p.below; insertAfter = true; }
          else if (a.aboveTop != null) { anchorBlock = p.above; insertAfter = true; }
        } else {
          if (a.aboveTop != null) { anchorBlock = p.above; insertAfter = false; }
          else if (a.belowTop != null) { anchorBlock = p.below; insertAfter = false; }
        }
        // Repli sur le "container" (paragraphe hôte des images imbriquées dans une cellule - pas de bracketing above/below disponible) - même logique
        // devant/derrière que ci-dessus : "devant" doit finir peint APRÈS son texte hôte (recouvre), "derrière" doit finir peint AVANT (recouvert).
        if (!anchorBlock && p.container) { anchorBlock = p.container; insertAfter = layer === 'front'; }
        if (!anchorBlock) return;
        const arr = p.parentArray || content;
        const imgIdx = arr.indexOf(p.image);
        if (imgIdx === -1) return;
        // « Derrière », au niveau racine, ancrée à un bloc de la 2e page ou d'une suivante : insérée avant ce bloc, elle tombe sur la page précédente quand c'est le
        // premier de sa page (même défaut que l'image à position de page ci-dessus, même remède : le fond de sa page).
        if (arr === content && layer !== 'front' && (anchorBlock === p.above || anchorBlock === p.below)) {
          const behindPage = anchorBlock === p.above ? a.abovePage : a.belowPage;
          if (behindPage > 1) { arr.splice(imgIdx, 1); (behindByPage[behindPage] = behindByPage[behindPage] || []).push(p.image); return; }
        }
        // anchorBlock peut vivre hors de `arr` (ancre de zone) - vérifier sa présence AVANT de retirer l'image, sinon elle est perdue silencieusement.
        const anchorIdx = arr.indexOf(anchorBlock);
        if (anchorIdx === -1) return;
        arr.splice(imgIdx, 1);
        const shiftedAnchorIdx = anchorIdx > imgIdx ? anchorIdx - 1 : anchorIdx;
        arr.splice(insertAfter ? shiftedAnchorIdx + 1 : shiftedAnchorIdx, 0, p.image);
      });
    }
    // Filet de sécurité résiduel : une image dont ni bracket ni container n'a pu être résolu garderait sinon son absolutePosition placeholder (0,0)
    // indéfiniment, coincée au coin de la page. Repli : aucune position absolue, rendue en flux normal - pas au pixel près, mais visible au bon endroit.
    stripUnresolvedPendingImages(content);
    return content;
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

  // Clone-et-parcours remplaçant chaque run marqué `_pendingPageNumber` par son texte résolu - appelé à chaque invocation du callback header/footer natif.
  // currentPage/pageCount sont déjà connus à ce stade, contrairement au sommaire/images en calque : pas besoin d'une 2e passe de mesure.
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

  // Convertit les 4 fragments d'en-tête/pied (déjà résolus) en contenu pdfmake une seule fois - réutilisé par les 2 appels de buildNativeDocDefinition
  // (mesure jetable + réelle) pour une pagination identique. Marge fixe (HF_MAX_ZONE_HEIGHT_PT, même plafond que l'éditeur, 60px), pas la hauteur rendue.
  const HEADER_FOOTER_GAP_PT = 10; // espace entre le contenu en-tête/pied et le corps du document
  const HF_MAX_ZONE_HEIGHT_PT = 60 * PX_TO_PT;
  async function buildHeaderFooterPdfChunks(headerFooterData) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    if (!headerFooterData || !headerFooterData.enabled) return empty;
    async function resolveZone(html) {
      // Teste aussi <img : sinon un en-tête/pied ne contenant qu'une image était traité à tort comme "zone vide" et abandonné avant d'atteindre
      // htmlToPdfContent.
      if (!html || (!html.replace(/<[^>]*>/g, '').trim() && !/<img[\s>]/i.test(html))) return { content: null, heightPt: 0 };
      // Une image d'en-tête/pied dont le src est une URL externe (pas encore une data URI) n'apparaissait jamais dans le PDF : ce même traitement
      // (inlineEditorImagesAsDataUri) n'était appliqué qu'au corps du document, jamais ici.
      html = await inlineEditorImagesAsDataUri(html);
      const content = await htmlToPdfContent(html, false, CONTENT_WIDTH_PT);
      // Filet de sécurité : une image en calque n'a pas de résolution de position dans un en-tête/pied (pas de passe de mesure dédiée) - l'UI verrouille déjà
      // cette option en édition, mais un gabarit existant pourrait quand même en contenir une. Repli en flux normal.
      stripUnresolvedPendingImages(content);
      const measureRoot = document.createElement('div');
      measureRoot.innerHTML = html;
      insertTrailingBreaksForEmptyBlocks(measureRoot);
      const detach = attachPdfMeasureHost(measureRoot, CONTENT_WIDTH_PX);
      // measureRoot est un arbre DOM séparé du root de htmlToPdfContent ci-dessus (reparsing indépendant) : son propre décodage d'image doit être attendu
      // séparément, sinon une image mesure une hauteur proche de 0 et la marge réservée devient plus petite que ce que pdfmake peint réellement.
      await Promise.all(Array.from(measureRoot.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      const heightPt = measureRoot.getBoundingClientRect().height * PX_TO_PT;
      detach();
      return { content, heightPt };
    }
    const differentFirstPage = !!headerFooterData.differentFirstPage;
    const emptyZone = { content: null, heightPt: 0 };
    // Les 4 zones sont indépendantes (chacune son propre hôte de mesure hors-écran, cf. resolveZone plus haut) - contrairement à twoColumnsFrom, aucun état
    // de module partagé de type footnoteCounter ici (les notes de bas de page ne sont jamais résolues en en-tête/pied), donc rien n'imposait le séquentiel.
    const [headerDefault, headerFirst, footerDefault, footerFirst] = await Promise.all([
      resolveZone(headerFooterData.header && headerFooterData.header.default),
      differentFirstPage ? resolveZone(headerFooterData.header && headerFooterData.header.first) : Promise.resolve(emptyZone),
      resolveZone(headerFooterData.footer && headerFooterData.footer.default),
      differentFirstPage ? resolveZone(headerFooterData.footer && headerFooterData.footer.first) : Promise.resolve(emptyZone),
    ]);
    // Une seule hauteur de marge par zone : la marge de page ne peut pas varier d'une page à l'autre chez pdfmake, donc "page 1 différente" ne change que le
    // contenu - le plus grand des deux fragments dimensionne la marge des deux variantes.
    const headerHeightPt = (headerDefault.content || headerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    const footerHeightPt = (footerDefault.content || footerFirst.content) ? HF_MAX_ZONE_HEIGHT_PT : 0;
    return {
      enabled: true,
      differentFirstPage,
      header: { default: headerDefault.content, first: headerFirst.content },
      footer: { default: footerDefault.content, first: footerFirst.content },
      topExtraPt: headerHeightPt ? headerHeightPt + HEADER_FOOTER_GAP_PT : 0,
      bottomExtraPt: footerHeightPt ? footerHeightPt + HEADER_FOOTER_GAP_PT : 0,
    };
  }

  async function buildNativePdfDocDefinition(resolvedHtml, filename, headerFooterData) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    // Attend que Roboto (police de mesure) soit réellement chargée avant toute mesure : un export lancé tôt mesurerait sur une police de repli aux métriques
    // différentes, assez pour faire basculer une ligne d'un côté ou l'autre d'une frontière fine (habillage autour d'une image).
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* repli silencieux */ } }
    const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml);
    // Repli : export sans en-tête/pied plutôt que d'échouer entièrement si leur contenu (potentiellement modifié en dehors de l'éditeur) est dans un état
    // inattendu.
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
  async function exportNativePdf(resolvedHtml, filename, headerFooterData) {
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename, headerFooterData);
    window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf');
  }
  async function getNativePdfBlob(resolvedHtml, filename, headerFooterData) {
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename, headerFooterData);
    return new Promise((resolve, reject) => {
      try { window.pdfMake.createPdf(docDefinition).getBlob(resolve); } catch (e) { reject(e); }
    });
  }

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality, headerFooterData, marginsPt) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    // Avant tout : une image d'un site externe est téléchargée (ou chargée par le navigateur) pour ce PDF - la fenêtre la liste et peut tout arrêter (js/external-images.js).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsPt(marginsPt);
    await ensurePdfLibsLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    // Qualités non-vectorielles : cf. js/pdf-export-alt.js (isolées, actuellement désactivées dans l'UI - encore peu robustes).
    if (quality === 'browser-print') { await PdfExportAlt.exportViaBrowserPrint(resolvedHtml, filename, pageOrientation, pageFormat); return; }
    if (quality === 'low' || quality === 'ultra') { await PdfExportAlt.exportViaRaster(resolvedHtml, filename, quality, pageOrientation, pageFormat); return; }
    // En-tête/pied de page : uniquement le chemin vectoriel natif - ni l'impression navigateur ni les qualités raster n'ont de notion de header/footer natif
    // de page.
    const resolvedHeaderFooterData = await ExportCommon.resolveHeaderFooterVariables(headerFooterData, currentTableId, record);
    await exportNativePdf(resolvedHtml, filename, resolvedHeaderFooterData);
  }

  // Export PDF en lot (une ligne Grist -> un blob PDF, cf. js/main.js onExportBatch) - réutilise la même paire ReaderMode.preview/
  // ExportCommon.resolveHeaderFooterVariables qu'exportCurrentRecord. Limité au vectoriel : 'browser-print' ouvre une boîte de dialogue par ligne, sans surveillance.
  async function getNativePdfBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    // Même fenêtre que pour un seul PDF ; dans un lot, un site déjà accepté n'est pas redemandé et un refus arrête tout le lot (ExternalImages.beginRun, js/main.js).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    setPageMarginsPt(marginsPt);
    await ensurePdfLibsLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, tableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    const resolvedHeaderFooterData = await ExportCommon.resolveHeaderFooterVariables(headerFooterData, tableId, record);
    const blob = await getNativePdfBlob(resolvedHtml, filename, resolvedHeaderFooterData);
    return { blob, filename };
  }

  return { exportCurrentRecord, getNativePdfBlob, getNativePdfBlobForRecord, ensurePdfLibsLoaded };
})();
