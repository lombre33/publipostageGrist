// Export PDF V2 — 4 qualités : vectoriel (pdfmake, moteur principal de ce
// fichier), impression navigateur (exportViaBrowserPrint, relie les vraies
// feuilles de style dans un iframe et délègue à window.print()) et raster
// basse/ultra qualité (buildRasterContainerAndOptions + html2pdf.js, capture
// un conteneur détaché portant .tiptap/.reader-content). Les deux derniers
// modes ne consomment jamais le docDefinition pdfmake : ils capturent le
// vrai DOM résolu, donc les corrections CSS/éditeur s'y appliquent
// automatiquement, sans double maintenance.
//
// Réécrit depuis js/pdf-export.js (V1), pas copié : le HTML TipTap diffère
// assez de celui de Quill pour que certaines mesures ne s'appliquent plus.
// Les branches propres à Quill (ql-align-*/ql-indent-*/ql-size-*/data-list/
// <font>) sont volontairement absentes ici, structurellement impossibles
// dans du HTML TipTap.
const PdfExport = (function () {
  // Chargement paresseux des bibliothèques PDF (~plusieurs Mo au total,
  // pdf-fonts-extra.js seul ~1.6 Mo) au premier clic d'export plutôt qu'au
  // chargement de la page (économise 1-2s d'ouverture quand aucun export
  // n'a lieu). Mémorisé dans une promesse partagée, chargé une seule fois.
  // `integrity` (SRI sha384) : si cdnjs sert un jour un contenu différent à
  // cette URL, le navigateur refuse d'exécuter le script (cf. AUDIT_CODE.md
  // §2.2). Recalculer si la version change :
  // `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
  const PDF_LIB_URLS = [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js', integrity: 'sha384-VFQrHzqBh5qiJIU0uGU5CIW3+OWpdGGJM9LBnGbuIH2mkICcFZ7lPd/AAtI7SNf7' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.min.js', integrity: 'sha384-dWs4+zGqy/KS6giKxiK+6iowhidQwjVFaiE1lMar36QwIulE44VyBSQp0brMCx4D' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', integrity: 'sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG' },
    // Chemins relatifs à index.html, même origine que la page : pas de SRI
    // nécessaire (une compromission serait déjà celle du dépôt lui-même).
    { src: 'js/pdf-fonts.js?v=0.67' },
    { src: 'js/pdf-fonts-extra.js?v=0.67' },
  ];
  let pdfLibsPromise = null;
  function loadScriptOnce(lib) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = lib.src;
      if (lib.integrity) { s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; }
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Échec de chargement du script : ' + lib.src));
      document.head.appendChild(s);
    });
  }
  // Séquentiel (pas Promise.all) : pdf-fonts*.js lisent window.pdfMake.vfs à
  // l'exécution, donc doivent s'exécuter après pdfmake.min.js/vfs_fonts.min.js.
  async function ensurePdfLibsLoaded() {
    if (!pdfLibsPromise) {
      pdfLibsPromise = (async () => {
        for (const lib of PDF_LIB_URLS) await loadScriptOnce(lib);
      })().catch(e => { pdfLibsPromise = null; throw e; });
    }
    return pdfLibsPromise;
  }

  const PX_TO_PT = 72 / 96;
  // Doit correspondre à .tiptap { font-size: 14px } (css/editor-v2.css) :
  // 14 × 0.75 = 10.5pt, la taille de tout texte sans taille inline explicite.
  const DEFAULT_FONT_SIZE = 10.5;
  // .tiptap { line-height: 1.42 }. `lineHeight` de pdfmake multiplie
  // l'interligne par défaut de Roboto (≈1.171875 pour 11pt) - diviser par ce
  // ratio annule cet interligne natif avant d'appliquer le nôtre.
  const EDITOR_LINE_HEIGHT_RATIO = 1.42;
  const PDFMAKE_DEFAULT_LINE_RATIO = 1.171875;
  const LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / PDFMAKE_DEFAULT_LINE_RATIO;
  const HEADING_SIZES = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 };
  const PAGE_MARGIN_PT = 28; // doit matcher pageMargins dans buildNativeDocDefinition
  // Notes de bas de page : collectées par inlineRuns quelle que soit sa
  // profondeur d'appel (cellule/colonne/corps) - variables de module plutôt
  // qu'un paramètre traversant tableFrom/twoColumnsFrom/cellLineToPdfObject.
  // Remises à zéro au début de chaque buildPdfContentFromRoot racine (une
  // fois par passe de mesure/rendu, cf. isTopLevel), jamais une seule fois au
  // niveau module.
  let footnoteCounter = 0;
  let footnoteEntries = [];
  // Bande fixe (pas dynamique par page - pdfmake ne le permet pas) réservée
  // en pied de page pour ~4 lignes de note à 8pt ; un empilement extrême de
  // notes très longues sur une page peut la déborder (limite assumée).
  const FOOTNOTE_BAND_PT = 4 * 8 * 1.15 + 8; // ≈ 4 lignes à 8pt + le filet séparateur
  // left/top d'une image en calque sont captures relatifs au bord de la boite
  // de PADDING de `.tiptap` (qui, en Apercu A4, EST la marge de page) alors
  // que l'hote de mesure PDF (attachMeasureHost) a un padding NUL - sans
  // correction, une image pres du coin de page atterrissait a l'export
  // decalee d'exactement un paragraphe de marge (~28pt), confirme par
  // l'utilisateur et par test dedie. Corrige en soustrayant ce padding une
  // seule fois avant toute comparaison/interpolation.
  const A4_PREVIEW_PADDING_PX = PAGE_MARGIN_PT / PX_TO_PT;

  // ProseMirror pose `white-space: break-spaces` (l'espace avant un retour à
  // la ligne compte dans la largeur de cette ligne), pas `normal` comme
  // pdfmake (l'espace dépasse sans compter, un mot de plus peut tenir) - sans
  // compensation pdfmake calait un mot de trop par ligne vs l'éditeur, plus
  // visible en colonne étroite. Corrigé en retranchant la largeur d'un espace
  // (mesurée une fois, mise en cache) de chaque largeur d'habillage.
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
  const CONTENT_WIDTH_PT = 595.28 - 2 * PAGE_MARGIN_PT;
  const CONTENT_WIDTH_PX = CONTENT_WIDTH_PT / PX_TO_PT;

  function cssSize(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? Math.max(6, Math.min(72, n * (value && String(value).endsWith('px') ? PX_TO_PT : 1))) : fallback;
  }

  // Police web-safe -> police pdfmake réellement embarquée (pdfmake ne peut
  // jamais utiliser une police système) : équivalents libres à métrique identique.
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

  // pdfmake n'interprète pas `rgb(r,g,b)` (rend en noir, sans erreur) - or
  // c'est la forme que le navigateur renvoie pour tout style inline posé en
  // hexa une fois repassé par le DOM. Convertit vers l'hexa ; laisse passer
  // un nom de couleur CSS ou un hexa déjà présent.
  function cssColorToHex(value) {
    if (!value) return null;
    const v = value.trim();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (!m) return v;
    const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
  }

  // Style hérité d'un nœud DOM -> attributs de "run" pdfmake. Point de
  // passage unique pour tout texte, où qu'il vive dans le schéma.
  function inheritedStyle(node, parent) {
    const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const tag = node.nodeType === 1 ? node.tagName : '';
    const out = Object.assign({}, parent);
    if (/^H[1-6]$/.test(tag)) { out.bold = true; out.fontSize = HEADING_SIZES[tag]; }
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') addDecoration(out, 'underline');
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

  // Alignement réel : TipTap (extension-text-align) pose toujours un style
  // inline `text-align`, jamais de classe - pas de repli ql-align-*/attribut
  // legacy align="" à gérer ici (aucune des deux formes ne peut exister dans
  // du HTML produit par cet éditeur).
  function alignment(node) {
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  // Construit le contenu pdfmake d'un sommaire à partir des blocs-titre déjà
  // rencontrés - texte et niveau toujours connus dès cet appel, mais PAS le
  // numéro de page (dépend d'une 1ère passe de mise en page, cf.
  // resolveNativePdfContent) : chaque entrée réserve sa propre cellule vide,
  // patchée après coup.
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

  // Indentation horizontale RÉELLE d'un bloc (liste/citation) : mesurée sur
  // le rendu effectif dans un hôte hors-écran portant la classe .tiptap
  // (pour hériter le CSS de css/editor-v2.css - padding des listes,
  // bordure+padding des citations), pas devinée/codée en dur - même
  // technique que la V1 (js/pdf-export.js:measureIndentPt), généralisable
  // sans changement puisque purement géométrique.
  // - 'box' (LI) : bord gauche de la boîte du bloc (l'indentation vient du
  //   <ul>/<ol> ancêtre ; le marqueur "•"/numéro est ajouté à part par
  //   listMarkerFor, mesurer le TEXTE compterait ce marqueur en double).
  // - 'text' (tout le reste) : position du premier caractère RENDU, capture
  //   aussi bien un retrait d'ANCÊTRE qu'un padding/bordure sur l'élément
  //   lui-même (cas de <blockquote>).
  function measureIndentPt(node, mode) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const hostLeft = host.getBoundingClientRect().left;
    // Neutralise une contamination par un flottement CSS (image "au coeur du
    // texte" à gauche/droite, cf. floatedImageParagraphFrom) qui déborde
    // depuis un FRÈRE PRÉCÉDENT : sans `clear`, ce bloc démarre visuellement
    // décalé (poussé par le flottement, habillage normal du navigateur) -
    // mesuré ici à tort comme un retrait sémantique (liste/citation), ce qui
    // pose un retrait FIXE sur tout le paragraphe (marge pdfmake, pas par
    // ligne) au lieu de laisser chaque ligne s'enrouler séparément - le
    // paragraphe entier reste alors décalé même une fois réellement passé
    // sous l'image, comme un bloc rigide plutôt que ligne à ligne (signalé
    // par l'utilisateur). L'habillage réel du texte à côté de l'image reste
    // géré à part par floatedImageParagraphFrom, pour le seul paragraphe qui
    // CONTIENT l'image - `clear` ici ne touche que la mesure des paragraphes
    // SUIVANTS, sans affecter leur rendu réel (retiré aussitôt après).
    const previousClear = node.style.clear;
    node.style.clear = 'both';
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      const textNode = walker.nextNode();
      if (!textNode) { node.style.clear = previousClear; return 0; }
      // Neutralise temporairement l'alignement du bloc pendant la mesure -
      // un bloc centré/aligné à droite pousse son texte loin du bord gauche
      // du large hôte de mesure, ce qui n'est PAS un retrait réel.
      const previousAlign = node.style.textAlign;
      node.style.textAlign = 'left';
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 1);
      leftPx = range.getBoundingClientRect().left;
      node.style.textAlign = previousAlign;
    }
    node.style.clear = previousClear;
    return Math.round(Math.max(0, (leftPx - hostLeft) * PX_TO_PT) * 100) / 100;
  }

  // Attache `root` hors-écran avec la classe .tiptap (scopée à la classe
  // seule, pas #editor-container .tiptap, pour ne pas dépendre du conteneur réel).
  function attachMeasureHost(root, widthPx) {
    root.classList.add('pdf-measure-host', 'tiptap');
    // min-height:0 en inline l'emporte sur .tiptap { min-height: 200px } (zone
    // cliquable de l'éditeur vide) : sans lui, mesurer la hauteur totale de
    // `root` plafonne à 200px quel que soit le contenu réel.
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + (widthPx || CONTENT_WIDTH_PX) + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }

  function pdfImageFromNode(node) {
    const widthPx = parseFloat(node.style.width) || 320;
    const image = { image: node.getAttribute('src') };
    // Image liée à une #Variable Attachments : boîte width×height fixe,
    // mais chaque ligne Grist y insère une image de ratio différent - `fit`
    // (pdfmake) la met à l'échelle sans la déformer, contrairement à `width`
    // seul. `width` est toujours posé en plus (jamais lu par pdfmake dans ce
    // cas, mais lu plus loin par le bracketing de position d'une image en
    // calque, qui deviendrait NaN sans lui).
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (node.hasAttribute('data-var-table')) {
      const heightPx = parseFloat(node.style.height) || 240;
      image.fit = [image.width, Math.max(15, heightPx * PX_TO_PT)];
    }
    const opacity = parseFloat(node.style.opacity);
    if (Number.isFinite(opacity) && opacity < 1) image.opacity = opacity;
    const layer = node.getAttribute('data-layer') || 'normal';
    if (layer !== 'normal' && node.style.position === 'absolute') {
      // Position réelle résolue plus tard par ancrage/interpolation (une
      // formule directe depuis le pixel `top` n'a aucune notion de
      // pagination PDF). Garde une référence au nœud DOM réel (encore
      // attaché à l'hôte de mesure) pour mesurer sa position par rapport aux
      // blocs de texte voisins.
      image._pendingImgNode = node;
      // Conservé jusqu'à la relocation dans content[] : pdfmake peint
      // content[] séquentiellement, "devant" et "derrière" n'ont donc pas la
      // même direction d'insertion par rapport à leur bloc-ancre.
      image._pendingLayer = layer;
      // Placeholder écrasé une fois l'ancrage résolu : sans absolutePosition,
      // pdfmake traite ce bloc comme un élément de flux et lui réserve sa
      // propre hauteur dès la première passe de mesure, gonflant à tort la
      // position mesurée de tous les blocs suivants (constaté : ~46pt d'écart
      // correspondant exactement à la hauteur d'une image en attente).
      image.absolutePosition = { x: 0, y: 0 };
    } else {
      const align = node.getAttribute('data-align');
      // gauche/droite = habillage (float CSS) géré par floatedImageParagraphFrom
      // (colonne image + colonne texte), pas par `alignment` de pdfmake (qui
      // n'aurait fait qu'aligner l'image seule, sans habiller le texte autour).
      if (align === 'left' || align === 'right') {
        image._floatAlign = align;
        image._sourceImgNode = node;
      } else {
        image.margin = [0, 2, 0, 4];
        if (align) image.alignment = align;
      }
    }
    return image;
  }

  // IMPORTANT : ne retourne jamais d'image dans ce tableau de "runs" - un
  // objet { image: ... } glissé dans le texte n'est pas une syntaxe pdfmake
  // valide (silencieusement ignoré). Les images rencontrées sont accumulées
  // à part (`images`) pour être ajoutées par l'appelant comme blocs propres.
  function inlineRuns(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE });
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ text: node.nodeValue, ...style }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.classList.contains('page-break-marker')) return [];
    // Ne devrait normalement jamais être rencontré ici : ReaderMode.preview
    // résout déjà chaque badge en texte simple avant ce module - gardé par robustesse.
    if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }];
    // Contrairement à .var-badge, aucune valeur réelle n'existe avant que
    // pdfmake choisisse le numéro de page final - marqueur résolu plus tard
    // par resolvePageNumberPlaceholders à chaque callback header/footer natif.
    if (node.classList.contains('page-number-badge')) {
      return [{ text: '#', ...style, _pendingPageNumber: { format: node.getAttribute('data-format') || 'n' } }];
    }
    if (node.classList.contains('smart-chip')) return [{ text: node.textContent || '', ...style }];
    // Le numéro (contrairement à .page-number-badge) n'a aucune dépendance à
    // la pagination - assigné immédiatement via un compteur de module (remis
    // à 0 une fois par passe) plutôt qu'un paramètre à faire traverser
    // tableFrom/twoColumnsFrom/cellLineToPdfObject, correct à toute profondeur.
    if (node.classList.contains('footnote-ref-marker')) {
      footnoteCounter += 1;
      footnoteEntries.push({ number: footnoteCounter, text: node.getAttribute('data-note-text') || '' });
      return [{ text: String(footnoteCounter), ...style, sup: true, fontSize: (style.fontSize || DEFAULT_FONT_SIZE) * 0.7 }];
    }
    if (node.tagName === 'IMG') {
      if (images && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) {
        images.push(pdfImageFromNode(node));
        // Marqueur de position (jamais un run pdfmake valide) : permet à
        // blockFrom de reconstituer l'ordre réel texte/image d'origine -
        // sans lui une image "au cœur du texte" sautait en fin de paragraphe.
        return [{ _imageMarker: true }];
      }
      return [];
    }
    // data-pdf-measure-filler : <br> injecté juste pour donner une hauteur
    // réelle à un bloc vraiment vide dans l'hôte de mesure, jamais un vrai
    // retour à la ligne saisi par l'utilisateur - ne produit aucun run.
    if (node.tagName === 'BR') return node.hasAttribute('data-pdf-measure-filler') ? [] : [{ text: '\n', ...style }];
    let runs = [];
    let sawLineBlock = false;
    node.childNodes.forEach(child => {
      const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6])$/.test(child.tagName);
      if (isLineBlock && sawLineBlock) runs.push({ text: '\n', ...style });
      if (isLineBlock) sawLineBlock = true;
      runs = runs.concat(inlineRuns(child, style, images));
    });
    return runs;
  }
  // Comme inlineRuns, mais ignore les <ul>/<ol> DIRECTS - une sous-liste
  // imbriquée doit produire SES PROPRES blocs (un par <li>), pas être
  // aplatie dans le texte du <li> parent.
  function inlineRunsExcludingNestedLists(node, parentStyle, images) {
    const style = inheritedStyle(node, parentStyle);
    let runs = [];
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) return;
      runs = runs.concat(inlineRuns(child, style, images));
    });
    return runs;
  }
  // `inlineRuns`/`inlineRunsExcludingNestedLists` glissent un marqueur
  // `{_imageMarker:true}` dans le flux de runs à l'endroit exact où une
  // image a été rencontrée (en plus de la pousser, comme avant, dans le
  // tableau `images` séparé) - SEUL `blockFrom()` (flux principal) sait
  // s'en servir pour reconstituer l'ordre réel texte/image (cf. Bug 3,
  // dev-tests/BUGS.md). Tout AUTRE appelant de inlineRuns/
  // Un objet sans `text` ni `image` glissé dans un tableau `text:` pdfmake
  // fait planter pdfmake ("Unrecognized document structure").
  function stripImageMarkers(runs) { return runs.filter(r => !r._imageMarker); }

  // 'circle'/'square' n'utilisent pas les vrais glyphes Unicode ○/▪ : vérifié
  // (décodage du PDF via pdf.js) que pdfmake/PDFKit n'embarque les polices
  // TTF qu'en encodage WinAnsi - tout caractère au-delà de U+00FF ressort en
  // glyphe invisible. '°' reste dans cette plage et se lit comme un cercle
  // creux ; aucun caractère WinAnsi ne lit comme un carré, d'où '*' plutôt
  // qu'un '#' qui entrerait en collision visuelle avec les badges #Variable.
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };
  function listMarkerFor(node) {
    const parent = node.parentElement;
    if (parent && parent.tagName === 'OL') {
      const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
      const start = parseInt(parent.getAttribute('start') || '1', 10) || 1;
      const n = start + (items.indexOf(node) === -1 ? 0 : items.indexOf(node));
      // Réutilise la même conversion chiffre→lettre/romain que la
      // numérotation des titres plutôt que d'en réécrire une.
      const numberStyle = parent.getAttribute('data-number-style');
      if (numberStyle === 'alpha') return HeadingNumbering.formatCounterValue(n, 'lower-alpha') + '. ';
      if (numberStyle === 'roman') return HeadingNumbering.formatCounterValue(n, 'upper-roman').toLowerCase() + '. ';
      return n + '. ';
    }
    const bulletStyle = parent && parent.getAttribute('data-bullet-style');
    return BULLET_MARKERS[bulletStyle] || BULLET_MARKERS.disc;
  }

  // Case à cocher dessinée en vectoriel via `canvas` plutôt qu'en glyphe de
  // police (☑/☐ hors WinAnsi, même contrainte que les puces rondes/carrées) :
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

  // Reflète la règle CSS text-decoration:line-through, qu'inheritedStyle ne
  // peut pas lire (style inline d'un nœud seulement, jamais une règle externe).
  function taskListRuns(node, runs) {
    const parent = node.parentElement;
    const checked = node.getAttribute('data-checked') === 'true';
    const style = (parent && parent.getAttribute('data-tasklist-style')) || 'accentStrike';
    const base = runs.length ? runs : [{ text: ' ' }];
    if (!checked || style === 'classic' || style === 'accentPlain') return base;
    return base.map(r => Object.assign({}, r, {
      decoration: Array.isArray(r.decoration) ? r.decoration.concat('lineThrough') : (r.decoration ? [r.decoration, 'lineThrough'] : ['lineThrough']),
      color: r.color || '#98a2b3',
    }));
  }

  function isTaskListItem(node) {
    const parent = node.parentElement;
    return !!(parent && parent.getAttribute('data-type') === 'taskList');
  }

  // Structure `columns` commune aux deux points d'insertion d'un item de
  // liste de tâches : case dans une colonne étroite, texte dans le reste.
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

  // Repli de robustesse : un nœud dont la construction pdfmake lève une
  // exception dégrade en texte brut plutôt que d'annuler tout l'export.
  function fallbackTextBlock(node, pageBreakBefore) {
    const text = ((node && node.textContent) || '').trim();
    return { text: text || ' ', margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pageBreakBefore ? { pageBreak: 'before' } : {}) };
  }

  // Le navigateur COLLAPSE les espaces/retours en tout début/fin de bloc -
  // pdfmake prend le texte tel quel. Sans ce trim, un espace ou retour ligne
  // superflu en tête/fin de paragraphe (fréquent après une image ou un saut
  // de ligne) produit un décalage visible dans un texte centré/justifié.
  function trimEdgeWhitespace(runs) {
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[0].text)) runs.shift();
    if (runs.length) runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^[ \t\n\r\f\v]+/, '') });
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[runs.length - 1].text)) runs.pop();
    if (runs.length) { const last = runs.length - 1; runs[last] = Object.assign({}, runs[last], { text: runs[last].text.replace(/[ \t\n\r\f\v]+$/, '') }); }
    return runs;
  }

  // Découpe les enfants directs d'une cellule/sous-liste en "lignes" pdfmake :
  // <p>/<div>/<h1-6> direct = sa propre ligne ; <ul>/<ol> direct = une ligne
  // par <li> (récursif) ; tout le reste s'accumule dans un groupe "inline".
  function collectCellLines(container, lines) {
    let pending = [];
    function flushPending() { if (pending.length) { lines.push({ inline: pending }); pending = []; } }
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue) pending.push(node); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (/^(P|DIV|H[1-6])$/.test(node.tagName)) { flushPending(); lines.push(node); return; }
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
  // Une image en calque trouvée dans `images` entre [before, images.length)
  // est rattachée à `obj` comme ancre locale : dans une cellule, le
  // paragraphe qui héberge l'image est la référence la plus proche
  // disponible, pas besoin de bracketing. Sans cette fonction, une image en
  // calque nichée dans une cellule n'avait nulle part où s'ancrer.
  //
  // Pas de correction A4_PREVIEW_PADDING_PX ici (contrairement au flux
  // principal) : `.tiptap table td, th` a son propre position:relative, donc
  // le bloc englobant CSS est la cellule elle-même, pas `.tiptap`/la page.
  // imgTopPx/imgLeftPx ne sont jamais interprétés en absolu page-relative -
  // seule leur différence avec le paragraphe-conteneur compte. Appliquer la
  // correction A4 ici décalait la position d'un ~28pt constant (bug confirmé).
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
  // Image "au coeur du texte" (flux normal, non en calque) alignée gauche/
  // droite - cible de l'habillage `columns` (cf. floatedImageParagraphFrom),
  // par opposition à une image en calque ou sans alignement gauche/droite.
  function findFloatImageIn(node) {
    return Array.from(node.querySelectorAll('img.editor-image')).find(img => {
      const align = img.getAttribute('data-align');
      const layer = img.getAttribute('data-layer') || 'normal';
      return layer === 'normal' && (align === 'left' || align === 'right');
    });
  }
  function cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
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
    // Même chemin d'habillage que le flux principal (floatedImageParagraphFrom),
    // avec la largeur RÉELLE de la cellule (cf. tableFrom) au lieu de la pleine page.
    if (/^(P|DIV)$/.test(node.tagName)) {
      const floatImgEl = findFloatImageIn(node);
      if (floatImgEl) {
        const floated = floatedImageParagraphFrom(node, false, cellWidthPt);
        if (floated) return floated;
      }
    }
    const isLi = node.tagName === 'LI';
    const before = images.length;
    const runs = trimEdgeWhitespace(stripImageMarkers(isLi
      ? inlineRunsExcludingNestedLists(node, cellBaseStyle, images)
      : inlineRuns(node, cellBaseStyle, images)));
    const align = alignment(node) || cellAlign;
    let obj;
    if (isLi && isTaskListItem(node)) {
      obj = { columns: taskListColumns(node, taskListRuns(node, runs), align), margin: [measureIndentPt(node, 'box'), 0, 0, 0] };
    } else {
      const marker = isLi ? listMarkerFor(node) : '';
      const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
      obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, 0, 0] };
      if (align) obj.alignment = align;
    }
    attributeNestedPendingImages(images, before, obj, node, rootRect, nestedPending);
    return obj;
  }
  // Une cellule multi-lignes (plusieurs blocs, ou un mélange de texte brut et
  // de blocs alignés) construit un stack d'une ligne pdfmake par ligne ;
  // sinon (cas courant, un seul groupe de texte flottant) le texte reste à
  // plat, sans le surcoût d'un stack - SAUF si des images ont été trouvées,
  // auquel cas la cellule doit de toute façon devenir un stack (texte + une
  // entrée par image, à la suite - même limitation que le flux principal :
  // pdfmake n'accepte pas d'image au milieu d'un tableau de `text`, donc une
  // image au milieu d'une phrase atterrit après tout le texte de la cellule,
  // pas exactement à sa place).
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
    lines.forEach(line => {
      const obj = cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending);
      if (Array.isArray(obj)) obj.forEach(o => stack.push(o)); else stack.push(obj);
    });
    const finalStack = stack.concat(images);
    nestedPending.forEach(p => { p.parentArray = finalStack; });
    const result = { stack: finalStack };
    if (nestedPending.length) result._nestedPending = nestedPending;
    return result;
  }

  // Largeurs de colonnes mesurées sur le rendu réel de la première ligne, pas
  // lues depuis un pourcentage stocké (l'extension @tiptap/extension-table
  // écrit une largeur minimale en px sur <col>, pas un pourcentage exploitable).
  //
  // Largeur de contenu (sans padding/bordure de cellule), pas la boîte
  // entière : tableFrom applique déjà son propre padding pdfmake une fois la
  // proportion calculée - compter le padding deux fois élargirait le texte PDF.
  //
  // Mesurée sur le premier enfant de bloc de la cellule, pas en soustrayant
  // padding+bordure de la boîte cellule : les deux ne coïncident pas toujours
  // exactement (arrondi du moteur de layout sur table-layout:fixed, écart de
  // 1px constaté, assez pour faire basculer une coupure de ligne).
  function measuredColumnWidthsPx(table, columnCount) {
    const firstRow = table.querySelector(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
    if (!firstRow) return null;
    const cells = Array.from(firstRow.children).filter(c => /^(TD|TH)$/i.test(c.tagName));
    if (!cells.length) return null;
    const widths = [];
    cells.forEach(cell => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const contentEl = cell.querySelector(':scope > p, :scope > div, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol');
      let perCol;
      if (contentEl) {
        perCol = contentEl.getBoundingClientRect().width / span;
      } else {
        const cs = getComputedStyle(cell);
        const inset = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        perCol = (cell.getBoundingClientRect().width - inset) / span;
      }
      for (let i = 0; i < span; i += 1) widths.push(perCol);
    });
    while (widths.length < columnCount) widths.push(0);
    return widths.slice(0, columnCount);
  }
  function tableFrom(node, pageBreakBefore, rootRect) {
    const rows = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    const rawRows = rows.length ? rows : Array.from(node.querySelectorAll('tr'));
    const cellsOf = row => Array.from(row.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName));
    const columnCount = Math.max(1, ...rawRows.map(row => cellsOf(row).reduce((sum, cell) => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      return sum + span;
    }, 0)));
    // Padding de cellule mesuré sur le CSS réel, pas une constante
    // approximative (un ancien "4pt/3pt" arrondi creusait un écart mesurable
    // avec l'éditeur) - sert au budget de largeur ET à layout.paddingLeft/Right,
    // un seul chiffre plutôt que deux valeurs qui pourraient diverger.
    const firstCell = rawRows.length ? cellsOf(rawRows[0])[0] : null;
    const cellCs = firstCell ? getComputedStyle(firstCell) : null;
    const cellPadLeftPt = cellCs ? (parseFloat(cellCs.paddingLeft) || 0) * PX_TO_PT : 4.5;
    const cellPadRightPt = cellCs ? (parseFloat(cellCs.paddingRight) || 0) * PX_TO_PT : 4.5;
    const cellPadTopPt = cellCs ? (parseFloat(cellCs.paddingTop) || 0) * PX_TO_PT : 3;
    const cellPadBottomPt = cellCs ? (parseFloat(cellCs.paddingBottom) || 0) * PX_TO_PT : 3;
    const availableWidthPt = CONTENT_WIDTH_PT;
    const minColWidthPt = 12;
    // pdfmake ajoute paddingLeft+paddingRight à chaque colonne EN PLUS de
    // `widths` (vérifié en décodant le PDF généré) - retiré avant de répartir
    // pour que le total rendu retombe exactement sur la largeur de page.
    const cellPaddingPt = cellPadLeftPt + cellPadRightPt;
    const usableForColumnsPt = Math.max(minColWidthPt * columnCount, availableWidthPt - columnCount * cellPaddingPt);
    const measuredPx = measuredColumnWidthsPx(node, columnCount);
    const measuredPt = measuredPx ? measuredPx.map(px => px * PX_TO_PT) : null;
    const measuredSum = measuredPt ? measuredPt.reduce((sum, w) => sum + w, 0) : 0;
    // Cible de répartition : la largeur réelle du tableau si elle tient dans
    // la page, pas systématiquement la pleine largeur - un tableau rétréci
    // par l'utilisateur redevenait pleine largeur à l'export (bug confirmé).
    // usableForColumnsPt reste la limite au-delà de laquelle réduire quand même.
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
    // spaceWidthPt() retranché par colonne, après la répartition (pas dans le
    // budget total avant répartition, qui la diluerait au prorata de chaque
    // colonne) : compense white-space:break-spaces. ×1.5 vérifié par
    // recherche dichotomique - ×1 laissait encore, de justesse, un mot de trop tenir.
    widths = widths.map(w => Math.max(minColWidthPt, w - spaceWidthPt() * 1.5));
    // Images en calque imbriquées dans une cellule, portées sur `table._nestedPending`,
    // remontées jusqu'à buildPdfContentFromRoot (même résolution que le top-level).
    const tableNestedPending = [];
    const body = rawRows.map(row => {
      const output = [];
      cellsOf(row).forEach(cell => {
        const colSpan = Math.min(columnCount - output.length, Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1));
        const cellWidthPt = widths.slice(output.length, output.length + colSpan).reduce((sum, w) => sum + w, 0) || null;
        let content;
        try { content = cellContentFrom(cell, cellWidthPt, rootRect); }
        catch (e) { console.warn('[PdfExport] cellule de tableau ignorée (structure inattendue), repli en texte brut :', e); content = { text: (cell.textContent || '').trim() || ' ' }; }
        if (content._nestedPending) { tableNestedPending.push(...content._nestedPending); delete content._nestedPending; }
        // Pas de margin propre à la cellule : le seul inset est layout.paddingLeft/
        // Right/Top/Bottom ci-dessous, déjà compté dans usableForColumnsPt.
        const pdfCell = Object.assign({ border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
        if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
        if (cell.style.backgroundColor) pdfCell.fillColor = cssColorToHex(cell.style.backgroundColor);
        if (colSpan > 1) pdfCell.colSpan = colSpan;
        output.push(pdfCell);
        for (let i = 1; i < colSpan; i += 1) output.push({});
      });
      while (output.length < columnCount) output.push({ text: ' ', border: [true, true, true, true] });
      return output.slice(0, columnCount);
    });
    const table = {
      table: { headerRows: 0, widths, body: body.length ? body : [[{ text: ' ' }].concat(Array(Math.max(0, columnCount - 1)).fill({}))] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#777777', vLineColor: () => '#777777',
        paddingLeft: () => cellPadLeftPt, paddingRight: () => cellPadRightPt, paddingTop: () => cellPadTopPt, paddingBottom: () => cellPadBottomPt,
      },
      margin: [0, 5, 0, 5],
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    if (tableNestedPending.length) table._nestedPending = tableNestedPending;
    return table;
  }

  // Zone 2 colonnes : mesure la chrome CSS réelle (padding/bordure/largeur)
  // en clonant la zone dans un hôte hors-écran, plutôt que de deviner ces
  // valeurs. Colonnes toujours 50/50 (flex: 1 1 0), pas de ratio ajustable.
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
    const colOwnInsetLeft = [measuredCols[0] ? leftPt(measuredCols[0]) : 0, measuredCols[1] ? leftPt(measuredCols[1]) : 0];
    // Pas de compensation spaceWidthPt() ici (contrairement à tableFrom) :
    // measureTextWidthPt mesure directement la largeur de texte réelle, déjà
    // suffisamment stricte - en ajouter une ici calait un mot de moins que l'éditeur.
    const colOwnInsetRight = [
      measuredCols[0] ? rightPt(measuredCols[0]) : 0,
      measuredCols[1] ? rightPt(measuredCols[1]) : 0,
    ];
    const colOuterWidthPt = [
      measuredCols[0] ? measuredCols[0].getBoundingClientRect().width * PX_TO_PT : leftWidth,
      measuredCols[1] ? measuredCols[1].getBoundingClientRect().width * PX_TO_PT : rightWidth,
    ];
    document.body.removeChild(measureHost);
    // Séquentiel (pas Promise.all) : footnoteCounter/footnoteEntries sont un
    // état de module, deux appels en parallèle peuvent s'entrelacer si l'un
    // attend un décodage d'image et corrompre la numérotation des notes
    // (bug confirmé, cf. AUDIT_CODE.md §4). Jamais plus de 2 colonnes, coût négligeable.
    const columns = [];
    for (let colIdx = 0; colIdx < colNodes.length; colIdx += 1) {
      const col = colNodes[colIdx];
      const colAlign = alignment(col);
      // Largeur réelle de cette colonne, pour que l'hôte de mesure interne
      // de htmlToPdfContent habille une image flottante à la bonne largeur
      // plutôt qu'à la pleine largeur de page.
      const colWidthPt = colIdx === 0 ? leftWidth : rightWidth;
      let blocks;
      try { blocks = await htmlToPdfContent(col.innerHTML, false, colWidthPt); }
      catch (e) { console.warn('[PdfExport] contenu de colonne ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(col, false)]; }
      const alignSources = [];
      const collect = n => {
        if (n.nodeType === Node.TEXT_NODE) { if (n.nodeValue && n.nodeValue.trim()) alignSources.push(n); return; }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        if (n.classList.contains('page-break-marker')) return;
        if (n.tagName === 'TABLE') { alignSources.push(n); return; }
        if (n.classList.contains('two-columns-zone')) { alignSources.push(n); return; }
        if (isBlock(n)) { alignSources.push(n); return; }
        n.childNodes.forEach(collect);
      };
      const root = document.createElement('div');
      root.innerHTML = col.innerHTML || '';
      Array.from(root.childNodes).forEach(collect);
      if (colAlign) { blocks.forEach(b => { if (b && typeof b === 'object' && !b.columns) b.alignment = colAlign; }); }
      for (let i = 0; i < blocks.length && i < alignSources.length; i += 1) {
        const src = alignSources[i];
        const isPlaceholder = src.tagName === 'TABLE' || (src.classList && src.classList.contains('two-columns-zone'));
        if (isPlaceholder) continue;
        const probe = (src.nodeType === Node.TEXT_NODE && src.parentElement) ? src.parentElement : src;
        let a; let cur = probe;
        while (cur && !a) {
          a = alignment(cur);
          if (a) break;
          if (cur.classList && (cur.classList.contains('two-columns-column') || cur === root)) break;
          cur = cur.parentElement;
        }
        if (a && blocks[i] && typeof blocks[i] === 'object' && !blocks[i].columns) blocks[i].alignment = a;
      }
      columns.push(blocks);
    }
    // Chaque colonne a déjà sa propre résolution complète (bracketing+
    // interpolation) via son propre appel à htmlToPdfContent - remontée ici
    // vers resolveNativePdfContent, sans quoi l'image gardait son placeholder
    // au coin de la page.
    //
    // Correction Y indispensable : cet appel imbriqué reconstruit la colonne
    // dans un sous-arbre détaché, dont l'origine est le début de la colonne,
    // pas du document. imgTopPx y vaut le top CSS brut (relatif à .tiptap,
    // pensé pour tout le document) alors que containerTopPx y est mesuré en
    // local (~0) - comparer les deux sans correction décalait l'image de la
    // position réelle de la colonne dans le document. Fixé en soustrayant la
    // position Y réelle de la colonne (mesurée sur le node réel, encore
    // attaché à l'hôte de mesure) de imgTopPx.
    //
    // Pas de correction équivalente pour X : il se calcule directement depuis
    // la marge de page (aucune colonne ne pose son propre position:relative,
    // contrairement à une cellule) - le left CSS brut est déjà la distance
    // depuis le bord gauche de .tiptap, valable identiquement dans le
    // fragment isolé ou le document réel.
    const nestedPending = [];
    columns.forEach((colBlocks, colIdx) => {
      const pending = colBlocks._pendingImages || [];
      if (pending.length) {
        const colOffsetTopPx = colNodes[colIdx].getBoundingClientRect().top - rootRect.top;
        pending.forEach(p => { p.imgTopPx -= colOffsetTopPx; nestedPending.push(p); });
      }
      delete colBlocks._pendingImages;
    });
    const block = {
      columns: [
        { width: colOuterWidthPt[0], stack: [{ stack: columns[0], margin: [colOwnInsetLeft[0], 0, colOwnInsetRight[0], 0] }] },
        { width: colOuterWidthPt[1], stack: [{ stack: columns[1], margin: [colOwnInsetLeft[1], 0, colOwnInsetRight[1], 0] }] },
      ],
      columnGap: columnGapPt,
      margin: [zoneChromeLeftPt, 12.75, 0, 3.75],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
    if (nestedPending.length) block._nestedPending = nestedPending;
    return block;
  }

  // Chemin d'indices de `root` jusqu'à `target` (ex. [2,0,1]) - permet de
  // retrouver le même nœud dans un clone de `root`.
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
  // Retire, à chaque niveau entre `marker` et `root`, tout ce qui suit -
  // laisse un arbre ne contenant que ce qui précède marker, tout en
  // conservant les éléments ancêtres pour ce qu'ils contiennent avant.
  function removeAfter(root, marker) {
    let node = marker;
    while (node !== root) {
      const parent = node.parentNode;
      let sib = node.nextSibling;
      while (sib) { const next = sib.nextSibling; parent.removeChild(sib); sib = next; }
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
  // Tous les mots du texte de `node` (encore attaché à l'hôte de mesure,
  // donc réellement mis en page par le float CSS), avec la position Y
  // réelle de la ligne sur laquelle chacun tombe.
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
          words.push({ textNode, start, end: i, top: r.top, left: r.left, right: r.right });
        }
      }
    }
    return words;
  }
  // Extrait les runs pdfmake (gras/italique préservés) du texte de `node`
  // strictement compris entre `startCut` (position {textNode,offset}, ou
  // `null` = depuis le tout début) et `endCut` (idem, ou `null` = jusqu'à la
  // toute fin) - clone `node`, tronque le texte visé, retire tout ce qui
  // précède/suit au clone (removeBefore/removeAfter), sans jamais modifier
  // `node` lui-même (peut être appelé plusieurs fois sur le même `node`,
  // pour des plages différentes).
  function extractRunsBetweenRaw(node, startCut, endCut) {
    const clone = node.cloneNode(true);
    if (endCut) {
      const target = nodeAtPath(clone, nodePathTo(node, endCut.textNode));
      target.nodeValue = target.nodeValue.slice(0, endCut.offset);
      removeAfter(clone, target);
    }
    if (startCut) {
      const target = nodeAtPath(clone, nodePathTo(node, startCut.textNode));
      target.nodeValue = target.nodeValue.slice(startCut.offset);
      removeBefore(clone, target);
    }
    return stripImageMarkers(inlineRuns(clone, { fontSize: DEFAULT_FONT_SIZE }, []));
  }
  function extractRunsBetween(node, startCut, endCut) {
    return trimEdgeWhitespace(extractRunsBetweenRaw(node, startCut, endCut));
  }

  // Étire une ligne à la main jusqu'à `targetWidthPt`, en ajoutant de
  // l'espacement uniquement entre chaque mot et l'espace qui le suit
  // (characterSpacing de pdfmake n'agit qu'entre caractères d'un même run,
  // jamais en bordure). Répartit l'écart également entre tous les mots,
  // comme un vrai justify. `lineWords` = sous-ensemble consécutif de
  // collectWords() pour cette seule ligne ; startCut/endCut bornent le texte
  // réel à extraire (rognés ensuite via trimEdgeWhitespace).
  function buildJustifiedLine(node, lineWords, startCut, endCut, targetWidthPt) {
    const gaps = lineWords.length - 1;
    // Pas (dernier mot.right - premier mot.left) : le paragraphe est déjà
    // justifié en CSS dans l'éditeur, donc la ligne RENDUE est déjà étirée -
    // la mesurer directement fausserait extraPt vers 0. Somme plutôt la
    // largeur propre de chaque mot (jamais affectée par le justify) plus un
    // espace normal par intervalle (spaceWidthPt()).
    const naturalWidthPt = lineWords.reduce((sum, w) => sum + (w.right - w.left), 0) * PX_TO_PT + gaps * spaceWidthPt();
    // Viser exactement targetWidthPt laisse un écart nul avec pdfmake : un
    // sous-pixel d'arrondi suffit alors à faire recouper la ligne (un mot
    // bascule sur une ligne en trop). Un léger sous-étirement invisible vaut
    // mieux que ce risque.
    const SAFETY_MARGIN_PT = 2;
    const extraPt = gaps > 0 ? Math.max(0, (targetWidthPt - SAFETY_MARGIN_PT) - naturalWidthPt) / gaps : 0;
    if (gaps <= 0 || extraPt < 0.01) {
      return trimEdgeWhitespace(extractRunsBetweenRaw(node, startCut, endCut));
    }
    const runs = [];
    let cursor = startCut;
    for (let i = 0; i < lineWords.length - 1; i += 1) {
      const w = lineWords[i];
      const next = lineWords[i + 1];
      const wordEndCut = { textNode: w.textNode, offset: w.end - 1 };
      runs.push(...extractRunsBetweenRaw(node, cursor, wordEndCut));
      const gapRuns = extractRunsBetweenRaw(node, wordEndCut, { textNode: next.textNode, offset: next.start });
      gapRuns.forEach(r => { r.characterSpacing = extraPt; });
      runs.push(...gapRuns);
      cursor = { textNode: next.textNode, offset: next.start };
    }
    runs.push(...extractRunsBetweenRaw(node, cursor, endCut));
    return trimEdgeWhitespace(runs);
  }

  // pdfmake n'étire jamais (alignment:'justify') une ligne qu'il n'a pas
  // lui-même coupée - un bloc par ligne reviendrait au même problème que des
  // '\n' manuels. Seul le wordwrap interne de pdfmake (un bloc de texte
  // continu qui se répartit lui-même) sait quelles lignes ne sont pas les
  // dernières et les étire en conséquence - le texte "à côté" de l'image est
  // donc un seul bloc auto-wrappé avec le vrai alignement du paragraphe, au
  // prix d'un risque assumé : la coupure de ligne de pdfmake ne tombe pas
  // toujours exactement au même mot que le rendu réel de l'éditeur.

  // Habillage réel (float CSS côté éditeur) reproduit via le mécanisme
  // `columns` natif de pdfmake : colonne à largeur fixe pour l'image, colonne
  // pour le texte du même paragraphe dans la largeur restante. L'image peut
  // apparaître n'importe où dans le paragraphe, donc le texte se découpe en
  // trois segments : (1) ce qui précède la ligne où l'image commence, en
  // flux normal pleine largeur ; (2) ce qui tombe dans la hauteur de
  // l'image, comme un seul bloc auto-wrappé dans la largeur restante ; (3)
  // ce qui suit le bas de l'image, de nouveau pleine largeur. Seules les
  // frontières entre segments sont dictées par la position réelle mesurée
  // dans l'éditeur - pas la coupure de ligne à l'intérieur du segment (2),
  // laissée à pdfmake. Portée limitée au texte du même paragraphe que
  // l'image - un paragraphe suivant distinct ne s'habille pas encore si
  // l'image est plus haute que ce seul paragraphe. `null` si le paragraphe
  // ne contient que l'image (l'appelant retombe sur le rendu normal).
  function floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt) {
    const images = [];
    const runs = trimEdgeWhitespace(stripImageMarkers(inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images)));
    const floatImg = images.find(img => img._floatAlign);
    if (!floatImg || !runs.length) return null;
    const align = floatImg._floatAlign;
    // Alignement du paragraphe, distinct de `align` (le côté du flottement) :
    // blockFrom() applique normalement `alignment` lui-même, mais cette
    // fonction retourne avant ce point (chemin séparé pour l'habillage) -
    // sans le reporter ici, l'alignement était silencieusement perdu.
    const textAlign = alignment(node);
    const imgNode = floatImg._sourceImgNode;
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // Largeur disponible : celle de la page par défaut, mais surchargeable
    // par l'appelant (cellule de tableau, colonne 2-colonnes) - sinon une
    // image flottante nichée dans un espace plus étroit habillait comme si
    // elle disposait de la pleine largeur de page.
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT;
    const gapPt = 12 * PX_TO_PT; // css/editor-v2.css: margin 0 12px 8px 0 (et son miroir)
    const imageWidthPt = floatImg.width;
    const remainingWidthPt = Math.max(40, pageWidthPt - imageWidthPt - gapPt);
    const makeColumns = (besideContent) => {
      const textCol = { width: remainingWidthPt, stack: besideContent.length ? besideContent : [{ text: ' ' }] };
      const imgCol = { width: imageWidthPt, stack: [floatImg] };
      return { columns: align === 'right' ? [textCol, imgCol] : [imgCol, textCol], columnGap: gapPt };
    };
    const fallback = () => {
      const textBlock = { text: runs, lineHeight: LINE_HEIGHT_RATIO };
      if (textAlign) textBlock.alignment = textAlign;
      const block = makeColumns([textBlock]);
      if (pageBreakBefore) block.pageBreak = 'before';
      return block;
    };
    if (!imgNode) return fallback();

    const words = collectWords(node);
    const imgRect = imgNode.getBoundingClientRect();
    // Tolérance généreuse (pas 0.5px) sur les deux frontières : une frontière
    // stricte au demi-pixel s'est avérée trop fragile (sous-pixels de rendu
    // qui varient d'un navigateur à l'autre). ~20% d'une hauteur de ligne à 10.5pt.
    const BOUNDARY_TOLERANCE_PX = 4;
    // Premier mot dont la ligne commence au niveau (ou après) le haut de
    // l'image - ce qui précède est sur des lignes terminées avant le flottement.
    let besideStart = words.length;
    for (let w = 0; w < words.length; w += 1) { if (words[w].top >= imgRect.top - BOUNDARY_TOLERANCE_PX) { besideStart = w; break; } }
    // Premier mot, à partir de besideStart, dont la ligne commence au niveau
    // (ou après) le bas de l'image. +tolérance ici (pas -) pour repousser le
    // seuil vers le bas plutôt que de classer "en dessous" trop de lignes.
    let besideEnd = words.length;
    for (let w = besideStart; w < words.length; w += 1) { if (words[w].top >= imgRect.bottom + BOUNDARY_TOLERANCE_PX) { besideEnd = w; break; } }
    if (besideStart === besideEnd) return fallback(); // rien de mesurable à côté (cas dégénéré)
    // Regroupe des mots consécutifs (même Y à 2px près) en lignes - permet de
    // calculer un étirement justify précis ligne par ligne (buildJustifiedLine).
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
        // Texte "avant" TOUJOURS suivi du texte "à côté" - même sa propre
        // dernière ligne doit donc s'étirer (ce n'est jamais la fin réelle
        // du paragraphe).
        const beforeLines = groupIntoLines(words.slice(0, besideStart));
        let cursor = null;
        beforeLines.forEach((line, li) => {
          const isLastLine = li === beforeLines.length - 1;
          const endCut = isLastLine ? besideStartCut : { textNode: beforeLines[li + 1][0].textNode, offset: beforeLines[li + 1][0].start };
          // La largeur cible retranche la marge droite posée juste en
          // dessous (spaceWidthPt(), compensation white-space:break-spaces
          // déjà utilisée ailleurs dans ce fichier) - cette marge réduit
          // elle aussi la largeur RÉELLEMENT disponible pour le texte, sans
          // quoi l'étirement calculé dépassait de peu le bloc réel et
          // pdfmake recoupait un mot entier sur une ligne en trop (constaté ;
          // `noWrap` n'aide pas ici, cf. buildJustifiedLine - seule cette
          // marge de sécurité compte).
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
      // Chaque ligne "à côté" est étirée, sauf si c'est à la fois la dernière
      // ligne et qu'il n'y a pas de texte "après" : la vraie dernière ligne
      // du paragraphe n'est jamais étirée (même convention que le CSS).
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

  // Poursuite de l'habillage sur un paragraphe suivant qui n'a lui-même
  // aucune image, mais dont le flottement d'un frère précédent continue de
  // déborder verticalement - un simple décalage de marge suffit ici (l'image
  // est déjà posée par le paragraphe d'origine, pas de `columns` à refaire).
  // `carry` = { imgBottom, align, imageWidthPt, remainingWidthPt, gapPt },
  // préparé par blockFrom. Retourne { blocks, stillActive } - stillActive
  // si tout le paragraphe est resté sous l'image (le frère suivant doit être
  // vérifié à son tour) ; `null` si déjà entièrement sous l'image (tolérance
  // de l'appelant trop généreuse - traité normalement).
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

  // État transmis à blockFrom() pour le(s) frère(s) suivant(s) quand une
  // image flottante déborde encore verticalement son propre paragraphe.
  function makeFloatCarry(imgRect, align, imageWidthPt, availableWidthPt) {
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : CONTENT_WIDTH_PT;
    const gapPt = 12 * PX_TO_PT;
    return { imgBottom: imgRect.bottom, align, imageWidthPt, remainingWidthPt: Math.max(40, pageWidthPt - imageWidthPt - gapPt), gapPt };
  }

  // Retourne toujours un TABLEAU de blocs (jamais un bloc unique) : un
  // paragraphe contenant une image produit un bloc de texte ET un bloc image
  // séparés (pdfmake ne supporte pas d'image réellement "en ligne").
  function blockFrom(node, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return [tableFrom(node, pageBreakBefore, rootRect)];
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
    if (tag === 'P' || tag === 'DIV') {
      const floatImgEl = findFloatImageIn(node);
      if (floatImgEl) {
        const floated = floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt);
        if (floated) {
          const arr = Array.isArray(floated) ? floated : [floated];
          // Le flottement se poursuit-il sur le(s) frère(s) suivant(s) ?
          // Mesuré depuis le <img> réel plutôt que de changer la signature de
          // retour de floatedImageParagraphFrom. Si le dernier bloc n'a pas
          // de `columns` (texte déjà revenu sous l'image dans ce paragraphe),
          // le flottement est épuisé, rien à reporter.
          const lastBlock = arr[arr.length - 1];
          if (lastBlock && !lastBlock.columns) {
            arr._floatCarry = null;
          } else {
            const imgRect = floatImgEl.getBoundingClientRect();
            arr._floatCarry = makeFloatCarry(imgRect, floatImgEl.getAttribute('data-align'), Math.max(15, imgRect.width * PX_TO_PT), availableWidthPt);
          }
          return arr;
        }
      } else if (floatCarry) {
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
    // Sous-liste imbriquée (Tab pour imbriquer, cf. js/editor.js) : exclue du
    // texte de ce <li>, traitée plus bas comme ses propres blocs.
    const nestedLists = tag === 'LI' ? Array.from(node.children).filter(c => /^(UL|OL)$/.test(c.tagName)) : [];
    const rawRuns = nestedLists.length
      ? inlineRunsExcludingNestedLists(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images)
      : inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images);
    // Paragraphe/div contenant du texte et au moins une image "au cœur du
    // texte" sans alignement gauche/droite : reconstitue plusieurs blocs
    // pdfmake successifs (texte, image, texte, image...) dans l'ordre réel
    // du document plutôt que tout concaténer en un bloc-texte suivi de
    // toutes les images (bug confirmé, cf. dev-tests/BUGS.md Bug 3). pdfmake
    // ne sait pas faire une image réellement en ligne - préserver l'ordre en
    // blocs séparés est le maximum fidèle réalisable.
    if ((tag === 'P' || tag === 'DIV') && rawRuns.some(r => r._imageMarker)) {
      const indentPtInline = measureIndentPt(node, 'text');
      const alignInline = alignment(node);
      const segments = [];
      let currentTextRuns = [];
      let imgIdx = 0;
      rawRuns.forEach(r => {
        if (r._imageMarker) {
          segments.push({ textRuns: currentTextRuns });
          currentTextRuns = [];
          segments.push({ image: images[imgIdx++] });
        } else {
          currentTextRuns.push(r);
        }
      });
      segments.push({ textRuns: currentTextRuns });
      const blocks = [];
      segments.forEach(seg => {
        if (seg.image) {
          blocks.push(seg.image);
          // Cf. commentaire équivalent plus bas (repli si
          // floatedImageParagraphFrom a échoué) : une image gauche/droite
          // qui atterrit malgré tout ici doit pouvoir reporter son
          // habillage sur le(s) frère(s) suivant(s).
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
      if (!blocks.length) blocks.push({ text: ' ', margin: [indentPtInline, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO });
      if (pageBreakBefore && blocks[0]) blocks[0].pageBreak = 'before';
      return blocks;
    }
    const runs = trimEdgeWhitespace(rawRuns.filter(r => !r._imageMarker));
    const blocks = [];
    const indentPt = measureIndentPt(node, tag === 'LI' ? 'box' : 'text');
    // Marge verticale nulle entre blocs (mesuré : .tiptap p/h1-6/li/ol/ul
    // { margin: 0 }) - une marge fictive ici dériverait de la vraie mise en
    // page. Marge droite = spaceWidthPt() : compense white-space:break-spaces.
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node); if (align) block.alignment = align;
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
    // Un paragraphe sans aucun texte (ex. ne contenant qu'une image) n'a pas
    // besoin du bloc-texte de repli `text: ' '` : dans l'éditeur il s'effondre
    // à hauteur nulle, le pousser quand même ajoutait une ligne vide fictive
    // qui décalait tout le contenu suivant (et faussait l'ancrage des images
    // en calque voisines, cf. resolvePendingImageAnchors).
    if (runs.length || !images.length) {
      if (pageBreakBefore) block.pageBreak = 'before';
      blocks.push(block);
    } else if (pageBreakBefore && images[0]) {
      images[0].pageBreak = 'before';
    }
    images.forEach(img => {
      blocks.push(img);
      // Image flottante seule dans son paragraphe (aucun texte à côté) : le
      // flottement doit quand même pouvoir se reporter sur le(s) frère(s)
      // suivant(s), cf. wrapParagraphBesideCarriedFloat.
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

  async function buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel) {
    const blocks = [];
    // Parallèle à `blocks` : le nœud DOM top-level source de chaque entrée -
    // sert uniquement à mesurer la position RENDUE réelle des blocs voisins
    // d'une image en calque (cf. résolution d'ancrage plus bas), pas besoin
    // ailleurs.
    const sourceNodes = [];
    const headingBlocks = []; const tocBlocks = []; const footnoteBlocks = [];
    // Remis à zéro seulement pour le vrai appel top-level : buildPdfContentFromRoot
    // est aussi appelé de façon imbriquée, une fois par colonne d'une zone
    // 2-colonnes (cf. twoColumnsFrom) - sans ce garde-fou, la 2e colonne
    // remettait le compteur à zéro et effaçait la note de la 1ère colonne du
    // PDF final (bug confirmé, cf. AUDIT_CODE.md §4 - la vraie cause était ce
    // reset non gardé, pas seulement la concurrence déjà corrigée côté
    // twoColumnsFrom). footnoteCounter/footnoteEntries restent des variables
    // de module plutôt que des paramètres à traverser tableFrom/twoColumnsFrom/
    // cellLineToPdfObject, pour continuer la numérotation quelle que soit la
    // profondeur d'appel.
    if (isTopLevel) {
      footnoteCounter = 0;
      footnoteEntries = [];
    }
    // Images en calque imbriquées (cellule de tableau, colonne 2-colonnes) -
    // accumulées à part de resolvePendingImageAnchors (qui ne voit que les
    // blocs top-level) : tableFrom/twoColumnsFrom posent un `_nestedPending`
    // sur leur bloc, récolté ici puis fusionné dans content._pendingImages,
    // même mécanisme de résolution que le top-level.
    const nestedPendingAll = [];
    const rootRect = root.getBoundingClientRect();
    let pendingPageBreak = false;
    // Habillage d'une image flottante qui déborde encore verticalement une
    // fois son paragraphe hôte terminé - transmis au(x) frère(s) suivant(s)
    // via blockFrom tant qu'ils restent des <p>/<div> simples ; remis à null
    // dès que le prochain contenu est une structure plus complexe (tableau,
    // titre, liste...).
    let floatCarry = null;
    const push = (block, node) => { blocks.push(block); sourceNodes.push(node); };
    const visit = async node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }, node.parentElement); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; floatCarry = null; return; }
      if (node.classList.contains('heading-numbering-config')) return;
      if (node.classList.contains('toc-marker')) {
        const tocBlock = { stack: [{ text: 'Sommaire', bold: true, fontSize: 16 }], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
        push(tocBlock, node); tocBlocks.push(tocBlock); pendingPageBreak = false; floatCarry = null;
        return;
      }
      // Pas de branche dédiée pour un <table> : le HTML sérialisé
      // (Editor.getHTML()) ne porte jamais le wrapper de défilement ajouté en
      // édition live, un <table> y est donc un enfant direct, déjà couvert
      // par isBlock()/blockFrom() ci-dessous.
      if (node.classList.contains('two-columns-zone')) {
        const footnoteCheckpoint = footnoteEntries.length;
        let zoneBlock;
        try { zoneBlock = await twoColumnsFrom(node, pendingPageBreak, rootRect); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        if (zoneBlock && zoneBlock._nestedPending) { nestedPendingAll.push(...zoneBlock._nestedPending); delete zoneBlock._nestedPending; }
        // Note(s) trouvée(s) n'importe où dans cette zone : rattachées au
        // bloc top-level englobant, suffisant pour savoir sur quelle page
        // placer le texte de la note.
        if (footnoteEntries.length > footnoteCheckpoint) footnoteBlocks.push(...footnoteEntries.slice(footnoteCheckpoint).map(fe => ({ block: zoneBlock, number: fe.number, text: fe.text })));
        push(zoneBlock, node);
        pendingPageBreak = false; floatCarry = null;
        return;
      }
      if (isBlock(node)) {
        const footnoteCheckpoint = footnoteEntries.length;
        let produced;
        try { produced = blockFrom(node, pendingPageBreak, headingMarkers, availableWidthPt, rootRect, floatCarry); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        floatCarry = (produced && produced._floatCarry) || null;
        // Attache toute note trouvée dans ce nœud au premier bloc produit :
        // plusieurs blocs pour un seul nœud source atterrissent presque
        // toujours sur la même page, précision suffisante ici.
        const newFootnotes = footnoteEntries.length > footnoteCheckpoint ? footnoteEntries.slice(footnoteCheckpoint) : null;
        produced.forEach((b, i) => {
          if (b && b._nestedPending) { nestedPendingAll.push(...b._nestedPending); delete b._nestedPending; }
          push(b, node); if (b && b._isHeading) headingBlocks.push(b);
          if (i === 0 && newFootnotes) footnoteBlocks.push(...newFootnotes.map(fe => ({ block: b, number: fe.number, text: fe.text })));
        });
        pendingPageBreak = false;
        return;
      }
      for (const child of Array.from(node.childNodes)) { await visit(child); }
    };
    for (const child of Array.from(root.childNodes)) { await visit(child); }
    // Repli si structure de titres inattendue : le tocBlock garde son stack
    // par défaut (titre "Sommaire" seul, posé à sa création) plutôt que de
    // faire échouer tout l'export - même granularité de repli que blockFrom
    // pour un bloc de contenu.
    tocBlocks.forEach(tocBlock => {
      try {
        const built = buildTocStack(headingBlocks);
        tocBlock.stack = built.stack;
        tocBlock._pageNumberCells = built.pageNumberCells;
      } catch (e) { console.warn('[PdfExport] sommaire ignoré (structure de titres inattendue) :', e); }
    });
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    content._headingBlocks = headingBlocks;
    content._tocBlocks = tocBlocks;
    content._footnoteBlocks = footnoteBlocks;
    // Repli : images en calque laissées à leur placeholder plutôt que de
    // faire échouer tout l'export si l'ancrage échoue.
    try { content._pendingImages = resolvePendingImageAnchors(rootRect, blocks, sourceNodes).concat(nestedPendingAll); }
    catch (e) { console.warn('[PdfExport] ancrage des images en calque ignoré :', e); content._pendingImages = nestedPendingAll; }
    return content;
  }

  // Une image en calque est positionnée par glisser n'importe où dans
  // l'éditeur, sans lien avec l'endroit où son <img> vit dans le HTML -
  // ancrer sur le bloc précédent/suivant ne suffit donc pas. On cherche
  // plutôt, parmi tous les blocs top-level mesurables, ceux dont la position
  // rendue encadre le plus étroitement celle de l'image, recalculé à
  // l'export à partir du HTML final.
  function resolvePendingImageAnchors(rootRect, blocks, sourceNodes) {
    const pending = [];
    // Un paragraphe qui héberge une image en attente produit toujours, en
    // plus du bloc image, un bloc-texte compagnon (même vide, cf. blockFrom).
    // Pour un paragraphe ne contenant QUE l'image, ce compagnon fantôme
    // s'effondre à hauteur quasi nulle à la position du paragraphe hôte, et
    // pouvait par coïncidence qualifier comme ancre pour l'image elle-même
    // ou une autre image plus loin (constaté : décalage de ~150pt). Exclu de
    // `measurable`, comme le bloc image lui-même.
    const pendingHostNodes = new Set(blocks.map((b, i) => (b && b._pendingImgNode) ? sourceNodes[i] : null).filter(Boolean));
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i] })).filter(({ block, node }) => block && !block._pendingImgNode && !pendingHostNodes.has(node));
    // Une image nichée au milieu d'un paragraphe avec du texte réel
    // avant/après elle a une bien meilleure référence que le bracketing
    // générique : le début de son propre paragraphe, à échelle px→pt
    // uniforme. Le bracketing générique doit l'exclure pour ne pas se
    // prendre lui-même comme ancre, ce qui oblige à extrapoler depuis un
    // bloc plus loin - imprécis dès que des paragraphes vides à hauteur
    // nulle s'intercalent (constaté : plusieurs dizaines de points d'écart).
    // Prioritaire sur le bracketing générique quand disponible.
    const hostToOwnTextBlock = new Map();
    blocks.forEach((b, i) => {
      if (b && !b._pendingImgNode && sourceNodes[i] && !hostToOwnTextBlock.has(sourceNodes[i])) hostToOwnTextBlock.set(sourceNodes[i], b);
    });
    // Tolérance au demi-pixel : sous-pixels de rendu de police d'un
    // navigateur à l'autre, pas une erreur de logique.
    const BOUNDARY_EPS_PX = 0.5;
    blocks.forEach((block, idx) => {
      if (!block || !block._pendingImgNode) return;
      const imgRect = block._pendingImgNode.getBoundingClientRect();
      // Ramène au référentiel sans padding utilisé par tout le reste de
      // cette fonction (mesures prises dans l'hôte de mesure).
      const imgTopPx = imgRect.top - rootRect.top - A4_PREVIEW_PADDING_PX;
      const imgBottomPx = imgRect.bottom - rootRect.top - A4_PREVIEW_PADDING_PX;
      const imgLeftPx = imgRect.left - rootRect.left - A4_PREVIEW_PADDING_PX;
      const hostNode = sourceNodes[idx];
      const container = hostToOwnTextBlock.get(hostNode) || null;
      const containerTopPx = (container && hostNode && hostNode.getBoundingClientRect) ? (hostNode.getBoundingClientRect().top - rootRect.top) : null;
      let above = null, aboveTopPx = -Infinity;
      let below = null, belowTopPx = Infinity;
      measurable.forEach(({ block: other, node }) => {
        if (!node || !node.getBoundingClientRect) return;
        const r = node.getBoundingClientRect();
        const top = r.top - rootRect.top;
        const bottom = r.bottom - rootRect.top;
        // Qualifie comme ancre seulement si le bloc ENTIER (haut et bas, pas
        // juste son sommet) se termine avant/commence après l'image - sinon
        // le paragraphe qui contient l'image (texte avant et après) qualifiait
        // à tort comme sa propre ancre "au-dessus".
        if (bottom <= imgTopPx + BOUNDARY_EPS_PX && top > aboveTopPx) { aboveTopPx = top; above = other; }
        if (top >= imgBottomPx - BOUNDARY_EPS_PX && top < belowTopPx) { belowTopPx = top; below = other; }
      });
      // parentArray : tableau dans lequel l'image et son ancre vivent toutes
      // les deux, utilisé par resolveNativePdfContent pour relocaliser
      // l'image à côté de son ancre sans dépendre d'un tableau top-level codé en dur.
      pending.push({ image: block, above, below, imgTopPx, imgLeftPx, aboveTopPx, belowTopPx, container, containerTopPx, parentArray: blocks });
    });
    return pending;
  }

  // isTopLevel=true pour le flux principal (numérotation des titres) ; false
  // pour le contenu d'une colonne 2-colonnes, où un titre n'est ni numéroté
  // ni inclus dans le sommaire.
  // availableWidthPt : largeur réellement disponible pour ce contenu si
  // différente de la pleine page (colonne 2-colonnes, reconstruite dans un
  // hôte de mesure séparé) - sans elle, l'habillage/justify d'une image
  // flottante nichée dans la colonne se basait sur la pleine largeur de page.
  //
  // Un bloc complètement vide (ligne vide volontaire) s'effondre à hauteur
  // nulle dans l'hôte de mesure hors-écran, alors que dans l'éditeur réel
  // ProseMirror insère un <br> décoratif qui lui donne sa hauteur normale
  // (jamais présent dans Editor.getHTML()) - sans correctif, plusieurs
  // lignes vides consécutives se mesuraient toutes à la même position,
  // biaisant le bracketing des images en calque voisines. Corrigé en
  // reproduisant le même artifice que ProseMirror : un <br data-pdf-measure-
  // filler> injecté dans tout bloc-texte vide avant la mesure (sans effet
  // sur le texte final, cf. blockFrom) - un bloc ne contenant qu'une image
  // garde son <img> et n'est donc pas concerné.
  function insertTrailingBreaksForEmptyBlocks(root) {
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th').forEach(el => {
      if (!el.hasChildNodes()) {
        const br = document.createElement('br');
        br.setAttribute('data-pdf-measure-filler', '1');
        el.appendChild(br);
      }
    });
  }
  async function htmlToPdfContent(html, isTopLevel, availableWidthPt) {
    const root = document.createElement('div'); root.innerHTML = html || '';
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
    const detachMeasureHost = attachMeasureHost(root, widthPx);
    try {
      // Attend le décodage de chaque <img> de ce root précis avant toute
      // mesure (getBoundingClientRect() sur une image en hauteur auto a
      // besoin du ratio intrinsèque réel) - un simple pré-chauffage du cache
      // navigateur sur un élément séparé s'est avéré insuffisamment fiable.
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      return await buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel);
    } finally {
      detachMeasureHost();
    }
  }

  // pdfmake ne sait embarquer que du JPEG/PNG (SVG et WEBP le font bloquer
  // indéfiniment ou lever "Unknown image format") - rastérise donc en PNG
  // via un aller-retour <img>/<canvas>, quel que soit le format source. Cas
  // fréquent : les CDN d'images renvoient couramment du WEBP par négociation
  // de contenu même pour une URL en ".png".
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
  // pdfmake exige une image en data URI base64 : un simple src http(s)://...
  // (upload Grist ou URL externe) n'est jamais rendu, silencieusement. En cas
  // d'échec (réseau, CORS...), marque l'image à ignorer plutôt que de faire
  // planter tout l'export.
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
        // Décode l'image ICI (avant de resérialiser le HTML) plutôt que de
        // compter sur le hôte de mesure pour le faire : `getBoundingClientRect()`
        // sur un <img> dont la hauteur est en `auto` (cf. styleFor(), seul
        // `width` est posé) a besoin du ratio intrinsèque de l'image, connu
        // seulement une fois décodée - sans ce await, floatedImageParagraphFrom
        // mesurait `imgRect.bottom` AVANT que l'image ne soit prête (racine du
        // bug du "saut de ligne" : la frontière beside/after se basait sur une
        // hauteur d'image encore incorrecte). `decode()` pré-chauffe le cache
        // navigateur pour cette URI data: précise - un <img> recréé plus tard
        // avec la MÊME src (reparsing du HTML dans htmlToPdfContent) obtient
        // alors ses dimensions intrinsèques synchronement.
        await img.decode().catch(() => {});
      } catch (e) {
        console.warn('[PdfExport] image ignorée dans le PDF vectoriel (conversion impossible) :', img.getAttribute('src'), e);
        img.setAttribute('data-pdf-skip', '1');
      }
    }));
    return wrapper.innerHTML;
  }

  // `headerFooterChunks` (cf. buildHeaderFooterPdfChunks) - threadé à
  // l'IDENTIQUE dans les DEUX appels de cette fonction (passe de mesure
  // jetable dans resolveNativePdfContent ET passe réelle dans
  // buildNativePdfDocDefinition) pour que la pagination TOC/images-ancrées
  // calculée pendant la mesure corresponde exactement au document final -
  // sans ça, un en-tête/pied changerait la hauteur de page disponible entre
  // les deux passes, et un titre/une image pourrait se retrouver sur une
  // page différente entre la mesure et le rendu réel.
  function buildNativeDocDefinition(content, filename, headerFooterChunks) {
    const hf = headerFooterChunks || { enabled: false, topExtraPt: 0, bottomExtraPt: 0 };
    // `content._footnoteBlocks` est posé par buildPdfContentFromRoot à CHAQUE
    // appel (passe de mesure ET passe finale, cf. resolveNativePdfContent) -
    // cette condition est donc IDENTIQUE aux deux appels de cette fonction
    // pour un même document, invariant déjà exigé par topExtraPt/bottomExtraPt
    // (même marge aux deux passes, sans quoi la pagination mesurée ne
    // correspondrait plus au document final).
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    const topMarginPt = PAGE_MARGIN_PT + (hf.topExtraPt || 0);
    const bottomMarginPt = PAGE_MARGIN_PT + (hf.bottomExtraPt || 0) + (hasFootnotes ? FOOTNOTE_BAND_PT : 0);
    const doc = {
      pageSize: 'A4', pageOrientation: 'portrait',
      pageMargins: [PAGE_MARGIN_PT, topMarginPt, PAGE_MARGIN_PT, bottomMarginPt],
      defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE },
      content, info: { title: filename || 'publipostage' },
    };
    // pdfmake appelle header/footer par page au moment de peindre - "première
    // page différente" se résout ici (currentPage === 1), pas dans
    // buildHeaderFooterPdfChunks qui se contente de préparer les 2 variantes.
    if (hf.enabled && (hf.header.default || hf.header.first)) {
      doc.header = (currentPage, pageCount) => {
        const chunk = (currentPage === 1 && hf.differentFirstPage) ? hf.header.first : hf.header.default;
        if (!chunk) return null;
        return { margin: [PAGE_MARGIN_PT, PAGE_MARGIN_PT * 0.5, PAGE_MARGIN_PT, 0], stack: resolvePageNumberPlaceholders(chunk, currentPage, pageCount) };
      };
    }
    // Le pied de page doit exister même sans en-tête/pied configuré par
    // l'utilisateur dès qu'il y a au moins une note : le texte des notes est
    // ajouté après le contenu utilisateur dans le même stack, en réutilisant
    // le callback natif déjà appelé une fois par page.
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
        return { margin: [PAGE_MARGIN_PT, 0, PAGE_MARGIN_PT, PAGE_MARGIN_PT * 0.5], stack: stackParts };
      };
    }
    return doc;
  }

  // Convertit une image en calque en attente en une vraie `absolutePosition`
  // pdfmake, à partir des positions réelles (déjà mesurées par pdfmake lors
  // de la passe de mesure) des blocs-ancre au-dessus/en-dessous. Interpole
  // entre les deux si résolues sur la même page ; repli sur une seule ancre
  // si l'autre est absente ou sur une page différente ; repli purement local
  // si aucune ancre n'a pu être résolue.
  // `layer` détermine, quand au-dessus/en-dessous tombent sur des pages
  // différentes (image proche d'une coupure de page), quelle ancre sert de
  // référence pour Y - doit être exactement la même que celle utilisée pour
  // la relocation dans content[] (page réellement peinte) : "devant" préfère
  // l'ancre du dessous, "derrière" celle du dessus. Avant ce correctif,
  // cette fonction préférait toujours l'ancre du dessus pour Y indépendamment
  // de la page choisie - une image replacée à côté de l'ancre du dessous
  // gardait un Y calculé depuis l'ancre du dessus (page précédente, presque
  // pleine), la poussant bien plus bas que sa position réelle (confirmé par
  // un test dédié, document long, image proche d'une coupure de page).
  function resolveImageAbsolutePosition(a, topMarginPt, layer) {
    const effectiveTopMarginPt = topMarginPt != null ? topMarginPt : PAGE_MARGIN_PT;
    // imgLeftPx est page-relative pour le flux principal et une colonne
    // 2-colonnes (aucun des deux ne pose son propre position:relative). Une
    // cellule de tableau EN a un (cf. attributeNestedPendingImages) :
    // containerLeftPx/containerLeft signalent ce cas et pilotent X en
    // différence locale au conteneur plutôt que la formule page-relative,
    // qui donnait une position n'importe où sur la page.
    const xPt = a.containerLeftPx != null && a.containerLeft != null
      ? a.containerLeft + (a.imgLeftPx - a.containerLeftPx) * PX_TO_PT
      : PAGE_MARGIN_PT + a.imgLeftPx * PX_TO_PT;
    // Référence locale prioritaire sur le bracketing générique quand
    // disponible : plus précise, fondée sur le début du paragraphe qui
    // héberge l'image elle-même plutôt qu'une extrapolation depuis un bloc externe éloigné.
    if (a.containerTop != null) return { x: xPt, y: a.containerTop + (a.imgTopPx - a.containerTopPx) * PX_TO_PT };
    if (a.aboveTop != null && a.belowTop != null && a.abovePage === a.belowPage && a.belowTopPx !== a.aboveTopPx) {
      const fraction = (a.imgTopPx - a.aboveTopPx) / (a.belowTopPx - a.aboveTopPx);
      return { x: xPt, y: a.aboveTop + fraction * (a.belowTop - a.aboveTop) };
    }
    // Au-dessus/en-dessous existent mais sur des pages différentes : le delta
    // en px entre l'image et l'une ou l'autre ancre traverserait la coupure,
    // mélangeant deux pages dont pdfmake réinitialise l'origine Y (constaté :
    // image projetée au-dessus du haut de page). Repli délibérément sans
    // extrapolation (delta 0, au ras de l'ancre choisie) - même ordre de
    // préférence que la relocation : "devant" sur le dessous, "derrière" sur le dessus.
    const crossesPage = a.aboveTop != null && a.belowTop != null && a.abovePage !== a.belowPage;
    if (layer === 'front') {
      if (a.belowTop != null) return { x: xPt, y: a.belowTop + (crossesPage ? 0 : (a.imgTopPx - a.belowTopPx) * PX_TO_PT) };
      if (a.aboveTop != null) return { x: xPt, y: a.aboveTop + (a.imgTopPx - a.aboveTopPx) * PX_TO_PT };
    } else {
      if (a.aboveTop != null) return { x: xPt, y: a.aboveTop + (crossesPage ? 0 : (a.imgTopPx - a.aboveTopPx) * PX_TO_PT) };
      if (a.belowTop != null) return { x: xPt, y: a.belowTop + (a.imgTopPx - a.belowTopPx) * PX_TO_PT };
    }
    return { x: xPt, y: effectiveTopMarginPt + a.imgTopPx * PX_TO_PT };
  }

  // S'il y a un sommaire et/ou des images en calque en attente, une 1ère
  // passe de mise en page "de mesure" (jamais montrée à l'utilisateur, juste
  // .getBuffer() pour forcer pdfmake à calculer .positions) donne les vraies
  // page/position des blocs-ancre. Le contenu est ensuite reconstruit à neuf :
  // les numéros de page du sommaire sont reportés dans ses cellules
  // réservées ; les images en attente reçoivent leur absolutePosition finale
  // ET sont relocalisées dans le tableau qui les héberge (p.parentArray)
  // juste à côté de l'ancre utilisée - pdfmake place un absolutePosition sur
  // la page courante au moment où il traite cette entrée du tableau (pas sur
  // la page indiquée par y), donc une image glissée loin de sa position DOM
  // d'origine resterait composée sur la mauvaise page sans ce réalignement.
  // Une image imbriquée dans une cellule/colonne partage cette même
  // résolution (content._pendingImages fusionne les deux) - seule la
  // recherche d'ancre diffère (bracketing complet pour une colonne, raccourci
  // "container" pour une cellule, cf. attributeNestedPendingImages).
  async function resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks) {
    let content = await htmlToPdfContent(inlinedHtml, true);
    const hasToc = (content._tocBlocks || []).length > 0;
    const hasPendingImages = (content._pendingImages || []).length > 0;
    const hasFootnotes = (content._footnoteBlocks || []).length > 0;
    // Marge haute réelle de cette passe - doit être identique à celle de la
    // passe réelle pour que la pagination mesurée ici corresponde exactement
    // au document final.
    const topMarginPt = PAGE_MARGIN_PT + ((headerFooterChunks && headerFooterChunks.topExtraPt) || 0);
    if (hasToc || hasPendingImages || hasFootnotes) {
      await new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename, headerFooterChunks)).getBuffer(() => resolve()); });
      const headingPageNumbers = (content._headingBlocks || []).map(b => (b.positions && b.positions[0] && b.positions[0].pageNumber) || null);
      // Capturé avant de reconstruire : fb.block.positions devient obsolète
      // dès que htmlToPdfContent recrée des objets neufs. Le numéro de chaque
      // note est déjà définitif dès la 1ère passe (numérotation continue) -
      // seule sa page avait besoin d'être mesurée.
      const footnotePageNumbers = (content._footnoteBlocks || []).map(fb => (fb.block.positions && fb.block.positions[0] && fb.block.positions[0].pageNumber) || null);
      const resolvedAnchors = (content._pendingImages || []).map(p => {
        const aboveResolved = p.above && p.above.positions && p.above.positions[0];
        const belowResolved = p.below && p.below.positions && p.below.positions[0];
        const containerResolved = p.container && p.container.positions && p.container.positions[0];
        return {
          aboveTop: aboveResolved ? aboveResolved.top : null, abovePage: aboveResolved ? aboveResolved.pageNumber : null,
          belowTop: belowResolved ? belowResolved.top : null, belowPage: belowResolved ? belowResolved.pageNumber : null,
          containerTop: containerResolved ? containerResolved.top : null, containerTopPx: p.containerTopPx,
          // Seules les images imbriquées dans une cellule posent containerLeft/
          // containerLeftPx (cf. attributeNestedPendingImages) - pilote le
          // calcul de X en cellule-relatif dans resolveImageAbsolutePosition.
          containerLeft: containerResolved ? containerResolved.left : null, containerLeftPx: p.containerLeftPx,
          hadAbove: !!p.above, hadBelow: !!p.below,
          imgTopPx: p.imgTopPx, imgLeftPx: p.imgLeftPx, aboveTopPx: p.aboveTopPx, belowTopPx: p.belowTopPx,
        };
      });
      content = await htmlToPdfContent(inlinedHtml, true);
      (content._tocBlocks || []).forEach(tocBlock => {
        (tocBlock._pageNumberCells || []).forEach((cell, i) => { if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]); });
      });
      // Regroupe chaque note par la page réelle de son appel (mesurée
      // ci-dessus) - consommé par le callback doc.footer natif de pdfmake
      // pour placer le texte au pied de la bonne page.
      const footnoteByPage = {};
      (content._footnoteBlocks || []).forEach((fb, i) => {
        const pageNum = footnotePageNumbers[i];
        if (pageNum == null) return;
        (footnoteByPage[pageNum] = footnoteByPage[pageNum] || []).push({ number: fb.number, text: fb.text });
      });
      content._footnoteByPage = footnoteByPage;
      (content._pendingImages || []).forEach((p, i) => {
        const a = resolvedAnchors[i];
        const layer = p.image._pendingLayer;
        p.image.absolutePosition = resolveImageAbsolutePosition(a, topMarginPt, layer);
        delete p.image._pendingImgNode;
        delete p.image._pendingLayer;
        // Choix du bloc-ancre pour la RELOCATION dans content[] - distinct du
        // calcul de position ci-dessus. pdfmake peint content[] dans l'ordre
        // du tableau (une entrée plus tardive recouvre les précédentes) :
        // "devant le texte" doit donc finir aussi TARD que possible (ancré de
        // préférence sur le bloc D'EN DESSOUS, inséré APRÈS lui, pour que le
        // texte proche - au-dessus ET en dessous - soit peint AVANT, donc
        // recouvert) ; "derrière le texte" doit à l'inverse finir aussi TÔT
        // que possible (ancré de préférence sur le bloc AU-DESSUS, inséré
        // AVANT lui). Avant ce correctif, les deux calques utilisaient la
        // MÊME ancre/direction ("au-dessus", inséré après) - correct pour
        // "devant" seulement dans le cas où il n'y a rien en dessous, mais
        // signalé cassé pour "derrière" (l'image recouvrait quand même le
        // texte juste avant elle, déjà peint à ce moment du tableau).
        let anchorBlock = null; let insertAfter = true;
        if (layer === 'front') {
          if (a.belowTop != null) { anchorBlock = p.below; insertAfter = true; }
          else if (a.aboveTop != null) { anchorBlock = p.above; insertAfter = true; }
        } else {
          if (a.aboveTop != null) { anchorBlock = p.above; insertAfter = false; }
          else if (a.belowTop != null) { anchorBlock = p.below; insertAfter = false; }
        }
        // Repli sur le "container" (paragraphe hôte, cf. raccourci local des
        // images imbriquées dans une cellule - pas de bracketing above/below
        // disponible dans ce cas) - même logique devant/derrière que ci-
        // dessus : "devant" doit finir peint APRÈS son texte hôte (recouvre),
        // "derrière" doit finir peint AVANT (recouvert).
        if (!anchorBlock && p.container) { anchorBlock = p.container; insertAfter = layer === 'front'; }
        if (!anchorBlock) return;
        const arr = p.parentArray || content;
        const imgIdx = arr.indexOf(p.image);
        if (imgIdx === -1) return;
        arr.splice(imgIdx, 1);
        const anchorIdx = arr.indexOf(anchorBlock);
        if (anchorIdx === -1) return;
        arr.splice(insertAfter ? anchorIdx + 1 : anchorIdx, 0, p.image);
      });
    }
    // Filet de sécurité résiduel : une image dont ni bracket ni container n'a
    // pu être résolu garderait sinon son absolutePosition placeholder
    // (0,0) indéfiniment, coincée au coin de la page. Repli : aucune position
    // absolue, rendue en flux normal - pas au pixel près, mais visible au bon endroit.
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

  // Numéro de page (en-tête/pied de page, incrément 2.2) - pure, aucun accès
  // au DOM/à pdfmake.
  function formatPageNumberText(format, currentPage, pageCount) {
    if (format === 'page-n') return 'Page ' + currentPage;
    if (format === 'n-slash-total') return currentPage + '/' + pageCount;
    return String(currentPage);
  }
  // Clone-et-parcours remplaçant chaque run marqué `_pendingPageNumber` par
  // son texte résolu pour la page en cours - appelé à chaque invocation du
  // callback header/footer natif de pdfmake. currentPage/pageCount sont déjà
  // connus à ce stade, contrairement au sommaire/images en calque ça ne
  // nécessite pas de 2e passe de mesure.
  function resolvePageNumberPlaceholders(node, currentPage, pageCount) {
    if (Array.isArray(node)) return node.map(n => resolvePageNumberPlaceholders(n, currentPage, pageCount));
    if (!node || typeof node !== 'object') return node;
    const out = Object.assign({}, node);
    if (out._pendingPageNumber) {
      out.text = formatPageNumberText(out._pendingPageNumber.format, currentPage, pageCount);
      delete out._pendingPageNumber;
    } else if (Array.isArray(out.text)) {
      out.text = out.text.map(t => resolvePageNumberPlaceholders(t, currentPage, pageCount));
    }
    if (out.columns) out.columns = resolvePageNumberPlaceholders(out.columns, currentPage, pageCount);
    if (out.stack) out.stack = resolvePageNumberPlaceholders(out.stack, currentPage, pageCount);
    return out;
  }

  // Convertit les 4 fragments d'en-tête/pied (déjà résolus) en contenu
  // pdfmake une seule fois - réutilisé par les deux appels de
  // buildNativeDocDefinition (passe de mesure jetable et passe réelle) pour
  // que la pagination calculée pendant la mesure jetable corresponde
  // exactement au document final. La hauteur réellement rendue de chaque
  // fragment dimensionne les marges haute/basse de page.
  const HEADER_FOOTER_GAP_PT = 10; // espace entre le contenu en-tête/pied et le corps du document
  async function buildHeaderFooterPdfChunks(headerFooterData) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    if (!headerFooterData || !headerFooterData.enabled) return empty;
    async function resolveZone(html) {
      // Teste aussi <img : sinon un en-tête/pied ne contenant qu'une image
      // était traité à tort comme "zone vide" et abandonné avant d'atteindre htmlToPdfContent.
      if (!html || (!html.replace(/<[^>]*>/g, '').trim() && !/<img[\s>]/i.test(html))) return { content: null, heightPt: 0 };
      // Une image d'en-tête/pied dont le src est une URL externe (pas encore
      // une data URI) n'apparaissait jamais dans le PDF : ce même traitement
      // (inlineEditorImagesAsDataUri) n'était appliqué qu'au corps du document, jamais ici.
      html = await inlineEditorImagesAsDataUri(html);
      const content = await htmlToPdfContent(html, false, CONTENT_WIDTH_PT);
      // Filet de sécurité : une image en calque n'a pas de résolution de
      // position dans un en-tête/pied (pas de passe de mesure dédiée) - l'UI
      // verrouille déjà cette option en édition, mais un gabarit existant
      // pourrait quand même en contenir une. Repli en flux normal.
      stripUnresolvedPendingImages(content);
      const measureRoot = document.createElement('div');
      measureRoot.innerHTML = html;
      insertTrailingBreaksForEmptyBlocks(measureRoot);
      const detach = attachMeasureHost(measureRoot, CONTENT_WIDTH_PX);
      // measureRoot est un arbre DOM séparé du root de htmlToPdfContent
      // ci-dessus (reparsing indépendant) : son propre décodage d'image doit
      // être attendu séparément, sinon une image mesure une hauteur proche
      // de 0 et la marge réservée devient plus petite que ce que pdfmake peint réellement.
      await Promise.all(Array.from(measureRoot.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      const heightPt = measureRoot.getBoundingClientRect().height * PX_TO_PT;
      detach();
      return { content, heightPt };
    }
    const differentFirstPage = !!headerFooterData.differentFirstPage;
    const headerDefault = await resolveZone(headerFooterData.header && headerFooterData.header.default);
    const headerFirst = differentFirstPage ? await resolveZone(headerFooterData.header && headerFooterData.header.first) : { content: null, heightPt: 0 };
    const footerDefault = await resolveZone(headerFooterData.footer && headerFooterData.footer.default);
    const footerFirst = differentFirstPage ? await resolveZone(headerFooterData.footer && headerFooterData.footer.first) : { content: null, heightPt: 0 };
    // Une seule hauteur de marge par zone : la marge de page ne peut pas
    // varier d'une page à l'autre chez pdfmake, donc "page 1 différente" ne
    // change que le contenu - le plus grand des deux fragments dimensionne
    // la marge des deux variantes.
    const headerHeightPt = Math.max(headerDefault.heightPt, headerFirst.heightPt);
    const footerHeightPt = Math.max(footerDefault.heightPt, footerFirst.heightPt);
    return {
      enabled: true,
      differentFirstPage,
      header: { default: headerDefault.content, first: headerFirst.content },
      footer: { default: footerDefault.content, first: footerFirst.content },
      topExtraPt: headerHeightPt ? headerHeightPt + HEADER_FOOTER_GAP_PT : 0,
      bottomExtraPt: footerHeightPt ? footerHeightPt + HEADER_FOOTER_GAP_PT : 0,
    };
  }

  // #Variable des 4 fragments d'en-tête/pied résolus ici, au même niveau que
  // le corps (pas plus bas dans la chaîne) pour que getNativePdfBlob reste
  // appelable avec du HTML déjà résolu, sans avoir besoin d'un vrai
  // enregistrement Grist à ce niveau.
  async function resolveHeaderFooterVariables(headerFooterData, currentTableId, record) {
    if (!headerFooterData || !headerFooterData.enabled) return headerFooterData;
    const resolveZone = html => (html ? ReaderMode.preview(html, currentTableId, record) : html);
    return {
      enabled: true,
      differentFirstPage: !!headerFooterData.differentFirstPage,
      header: {
        default: await resolveZone(headerFooterData.header && headerFooterData.header.default),
        first: await resolveZone(headerFooterData.header && headerFooterData.header.first),
      },
      footer: {
        default: await resolveZone(headerFooterData.footer && headerFooterData.footer.default),
        first: await resolveZone(headerFooterData.footer && headerFooterData.footer.first),
      },
    };
  }

  async function buildNativePdfDocDefinition(resolvedHtml, filename, headerFooterData) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    // Attend que Roboto (police de mesure) soit réellement chargée avant
    // toute mesure : un export lancé tôt mesurerait sur une police de repli
    // aux métriques différentes, assez pour faire basculer une ligne d'un
    // côté ou l'autre d'une frontière fine (habillage autour d'une image).
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* repli silencieux */ } }
    const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml);
    // Repli : export sans en-tête/pied plutôt que d'échouer entièrement si
    // leur contenu (potentiellement modifié en dehors de l'éditeur) est
    // dans un état inattendu.
    let headerFooterChunks;
    try { headerFooterChunks = await buildHeaderFooterPdfChunks(headerFooterData); }
    catch (e) {
      console.warn('[PdfExport] en-tête/pied de page ignorés (structure inattendue) :', e);
      headerFooterChunks = { enabled: false, differentFirstPage: false, header: { default: null, first: null }, footer: { default: null, first: null }, topExtraPt: 0, bottomExtraPt: 0 };
    }
    const content = await resolveNativePdfContent(inlinedHtml, filename, headerFooterChunks);
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

  // Qualités raster (html2canvas) uniquement - 'native' (vectoriel) et
  // 'browser-print' ont chacun leur propre chemin et ne consultent jamais
  // QUALITY_PRESETS. 'low' = fichier compressé (JPEG dégradé + compression
  // jsPDF), 'ultra' = qualité maximale pour impression (PNG, échelle 6).
  const QUALITY_PRESETS = {
    low: { label: 'Basse qualité (compressé)', image: { type: 'jpeg', quality: 0.6 }, html2canvas: { scale: 1.5 }, jsPDF: { compress: true } },
    ultra: { label: 'Ultra HD (impression)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } }
  };
  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.low; }

  // Passe par la boîte de dialogue d'impression native du navigateur
  // ("Enregistrer au format PDF") plutôt que par un rendu canvas (html2canvas)
  // ou une image base64 (pdfmake) - même raisonnement que js/pdf-export.js
  // (V1) : un <img> s'affiche sans CORS, donc ce mode est le seul immunisé
  // contre les images bloquées par CORS à l'export. Contrairement à la V1,
  // le document imprimé RÉUTILISE les vraies feuilles de style du projet
  // (roboto-fonts.css/style.css/editor-v2.css, relinkées telles quelles
  // depuis les <link> déjà présents dans ce document) au lieu d'un <style>
  // recopié à la main : tout correctif visuel déjà fait sur .tiptap/
  // .reader-content (tableaux, 2-colonnes, images flottantes, numérotation
  // des titres...) s'applique donc ici automatiquement, sans double
  // maintenance - exactement le risque de régression signalé par
  // l'utilisateur en demandant ce mode.
  async function exportViaBrowserPrint(resolvedHtml, filename) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    try {
      const container = document.createElement('div');
      container.innerHTML = resolvedHtml;
      const config = container.querySelector(':scope > .heading-numbering-config');
      container.classList.add('tiptap', 'reader-content');
      container.dataset.headingStyle = (config && config.dataset.style) || 'none';
      const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(link => '<link rel="stylesheet" href="' + link.href + '">')
        .join('');
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (filename || 'publipostage') + '</title>' +
        stylesheetLinks +
        '<style>' +
        '@page { size: A4; margin: 18mm; }' +
        'body { margin: 0; }' +
        // Pagination d'impression - absente des feuilles de style du projet
        // (non pertinente hors export), ajoutée ici seulement.
        '.page-break-marker { page-break-after: always; break-after: page; height: 0; margin: 0; border: 0; color: transparent; background: transparent; }' +
        '</style></head><body>' + container.outerHTML + '</body></html>'
      );
      doc.close();
      // Attend le chargement des feuilles de style ET des images avant
      // d'imprimer (avec filet de sécurité) : sans ça, la mise en page
      // (tableaux/2-colonnes/numérotation) ou certaines images
      // apparaîtraient non stylées/blanches dans le PDF imprimé.
      await new Promise(resolve => {
        const pending = Array.from(doc.images || []).concat(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')));
        if (!pending.length) { resolve(); return; }
        let remaining = pending.length;
        const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
        pending.forEach(el => {
          if (el.tagName === 'IMG' && el.complete) { done(); return; }
          el.addEventListener('load', done, { once: true });
          el.addEventListener('error', done, { once: true });
        });
        setTimeout(resolve, 4000);
      });
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
    }
  }

  // Conteneur détaché (attaché à document.body, hors écran via padding
  // normal - contrairement à .pdf-measure-host qui est positionné hors
  // champ) pour les qualités raster (html2canvas + jsPDF via html2pdf.js).
  // Classes 'tiptap reader-content' + attribut data-heading-style : mêmes
  // deux mécanismes déjà utilisés ailleurs (édition = .tiptap dans
  // editor-v2.css, lecture = .reader-content dans css/style.css) - portées
  // TOUTES LES DEUX sur ce même conteneur pour cumuler mise en page réelle
  // (tableaux/2-colonnes/images) ET numérotation des titres, sans dupliquer
  // aucune règle CSS. Le sommaire (.toc-marker) n'est PAS résolu ici (comme
  // en V1) : html2canvas n'a aucune notion de "page" exploitable pour les
  // numéros de page d'un titre - reste affiché tel quel (encadré pointillé).
  function buildRasterContainerAndOptions(resolvedHtml, filename, quality) {
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.position = 'relative';
    container.innerHTML = resolvedHtml;
    const config = container.querySelector(':scope > .heading-numbering-config');
    container.classList.add('tiptap', 'reader-content');
    container.dataset.headingStyle = (config && config.dataset.style) || 'none';
    container.querySelectorAll('.page-break-marker').forEach(marker => { marker.innerHTML = ''; marker.style.border = '0'; marker.style.background = 'transparent'; marker.style.color = 'transparent'; marker.style.height = '0'; marker.style.margin = '0'; marker.style.pageBreakAfter = 'always'; marker.style.breakAfter = 'page'; });
    document.body.appendChild(container);
    const preset = getQualityPreset(quality);
    const opt = { margin: 10, filename: (filename || 'publipostage') + '.pdf', image: preset.image, html2canvas: preset.html2canvas, jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}), pagebreak: { mode: ['css', 'legacy'] } };
    return { container, opt };
  }

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality, headerFooterData) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    await ensurePdfLibsLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    if (quality === 'browser-print') { await exportViaBrowserPrint(resolvedHtml, filename); return; }
    if (quality === 'low' || quality === 'ultra') {
      const { container, opt } = buildRasterContainerAndOptions(resolvedHtml, filename, quality);
      try { await window.html2pdf().set(opt).from(container).save(); } finally { document.body.removeChild(container); }
      return;
    }
    // En-tête/pied de page : uniquement le chemin vectoriel natif pour cet
    // incrément (2.2), ni l'impression navigateur ni les qualités raster
    // ci-dessus (qui réutilisent respectivement les vraies feuilles de style
    // et html2canvas, aucun des deux mécanismes n'a de notion de header/
    // footer natif de page - hors scope de cet incrément, cf. le plan).
    const resolvedHeaderFooterData = await resolveHeaderFooterVariables(headerFooterData, currentTableId, record);
    await exportNativePdf(resolvedHtml, filename, resolvedHeaderFooterData);
  }

  // Export PDF EN LOT (une ligne Grist -> un blob PDF, cf. js/main.js
  // onExportPdfBatch) - factorisé à partir du chemin "natif" ci-dessus
  // (résolution #Variable + en-tête/pied de page, puis pdfmake) plutôt que
  // dupliqué : c'est la même paire ReaderMode.preview/resolveHeaderFooterVariables,
  // juste appelée une fois par ligne au lieu d'une seule fois pour la ligne
  // sélectionnée. Volontairement limité au vectoriel (getNativePdfBlob) :
  // 'browser-print' ouvre une boîte de dialogue d'impression par ligne
  // (inutilisable sans surveillance) et les qualités raster (html2canvas)
  // n'ont pas de variante "retourne un blob" - seul le vectoriel expose déjà
  // ce chemin (utilisé par exportCurrentRecord côté V1... non, ici seul ce
  // fichier), donc le seul praticable pour un export non surveillé de N lignes.
  async function getNativePdfBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData) {
    await ensurePdfLibsLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, tableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    const resolvedHeaderFooterData = await resolveHeaderFooterVariables(headerFooterData, tableId, record);
    const blob = await getNativePdfBlob(resolvedHtml, filename, resolvedHeaderFooterData);
    return { blob, filename };
  }

  return { exportCurrentRecord, getNativePdfBlob, getNativePdfBlobForRecord, ensurePdfLibsLoaded };
})();
