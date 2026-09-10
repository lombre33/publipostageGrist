// Export PDF V2 — 4 qualités : vectoriel (pdfmake, moteur principal, tout le
// reste de ce fichier), impression navigateur (exportViaBrowserPrint, relie
// les vraies feuilles de style du projet dans un iframe et délègue à
// window.print()) et raster basse/ultra qualité (buildRasterContainerAndOptions
// + html2pdf.js, un conteneur détaché portant les classes .tiptap et
// .reader-content pour hériter telle quelle la mise en page déjà validée
// côté édition/lecture). Ces deux derniers modes ne consomment JAMAIS le
// docDefinition pdfmake du mode vectoriel : ils impriment/capturent le vrai
// DOM résolu, donc les corrections faites sur le CSS/éditeur (pas sur la
// construction pdfmake) s'y appliquent automatiquement, sans double
// maintenance.
// Réutilise ../js/pdf-fonts.js/pdf-fonts-extra.js (polices embarquées,
// aucune dépendance à Quill) et ../js/reader-mode.js (résolution des
// #Variable/nom de fichier, déjà partagée avec V1) tels quels.
//
// Beaucoup de logique porte le même nom que js/pdf-export.js (V1) mais est
// RÉÉCRITE, pas copiée : le HTML produit par TipTap diffère assez de celui
// de Quill pour que certaines mesures ne s'appliquent plus (cf. commentaires
// ci-dessous, notamment tableFrom) ; à l'inverse, tout ce qui se contente de
// MESURER le rendu réel via des classes CSS partagées (.two-columns-zone/
// .two-columns-column, cf. twoColumnsFrom) reste valable sans changement,
// l'un des bénéfices attendus de l'architecture à schéma unique de
// ProseMirror. Les branches propres à Quill (ql-align-*/ql-indent-*/
// ql-size-*/data-list/<font>) sont volontairement ABSENTES ici : elles ne
// peuvent structurellement jamais apparaître dans du HTML produit par
// TipTap - les garder serait du code mort, jamais exercé, qu'un audit
// relèverait à raison.
//
// Portée de cet incrément (features V2 actuelles uniquement) : titres
// (avec numérotation + sommaire, mêmes classes que la V1), gras/italique/
// souligné/barré, taille/police, alignement, listes (à puces/numérotées,
// y compris imbriquées), citation, tableaux, zones 2 colonnes, variables
// #Variable (déjà résolues par ReaderMode.preview avant d'arriver ici),
// saut de page forcé, images SIMPLES (V2 n'a pas encore de calque devant/
// derrière/repositionnement - cf. mémoire feedback_v2_defer_complexity_to_pdf_phase
// - donc pas de système d'ancrage/bracketing à porter pour l'instant).
const PdfExport = (function () {
  const PX_TO_PT = 72 / 96;
  // Doit correspondre à .tiptap { font-size: 14px } (css/editor-v2.css) :
  // 14 × 0.75 = 10.5pt, la taille de tout texte sans taille inline explicite.
  const DEFAULT_FONT_SIZE = 10.5;
  // .tiptap { line-height: 1.42 } (css/editor-v2.css) - contrairement à la V1
  // (interligne mesuré en live sur le CSS par défaut de Quill), ce ratio est
  // ici directement celui déclaré dans NOTRE PROPRE CSS, pas une valeur
  // mesurée empiriquement sur un tiers. `lineHeight` de pdfmake multiplie
  // l'interligne *par défaut* de sa police (Roboto, ≈1.171875 pour 11pt) -
  // diviser par ce ratio annule cet interligne natif avant d'appliquer le
  // nôtre (même raisonnement que la V1, cf. js/pdf-export.js).
  const EDITOR_LINE_HEIGHT_RATIO = 1.42;
  const PDFMAKE_DEFAULT_LINE_RATIO = 1.171875;
  const LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / PDFMAKE_DEFAULT_LINE_RATIO;
  const HEADING_SIZES = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 };
  const PAGE_MARGIN_PT = 28; // doit matcher pageMargins dans buildNativeDocDefinition
  // left/top d'une image en calque (editor.js:setLayer/moveState) sont captures
  // relatifs au bord de la boite de PADDING de `.tiptap` (position:absolute
  // standard) - en mode Apercu A4 (coche par defaut, cf. #editor-container.
  // a4-preview .tiptap { padding: 37.33px }), ce padding REPRESENTE visuellement
  // la marge de page, donc ce bord de boite est celui de la PAGE ENTIERE (coin
  // physique de la feuille), pas celui de la zone de contenu. L'hote de mesure
  // PDF (attachMeasureHost) a au contraire un padding NUL - `left`/`top`, une
  // fois reappliques tels quels sur l'image reconstruite dans cet hote, se
  // retrouvent donc mesures depuis un bord DIFFERENT (le debut du contenu, pas
  // le coin de page) sans que la valeur elle-meme ne change. Sans correction,
  // une image glissee pres du coin de la page (ex. left:4px, top:3px - a
  // peine a l'interieur de la marge) atterrissait donc a l'export comme si
  // elle etait a 4px/3px APRES la marge (dans le texte), un ecart d'exactement
  // un paragraphe de marge (~28pt/~1cm) - confirme par l'utilisateur et par un
  // test dedie (une image fraichement basculee en calque, encore a sa position
  // de flux normal juste apres le padding, se retrouve avec left/top ~37px,
  // soit tres precisement le padding Apercu A4 lui-meme). Corrige en ramenant
  // left/top dans le MEME referentiel (sans padding) que le reste de ce
  // fichier avant toute comparaison/interpolation, en soustrayant ce padding
  // une seule fois (il ne represente que la marge du DEBUT du document, un
  // éditeur continu n'ayant pas de rupture de page visuelle repetee).
  const A4_PREVIEW_PADDING_PX = PAGE_MARGIN_PT / PX_TO_PT;

  // ProseMirror pose `white-space: break-spaces` sur tout son contenu texte
  // (nécessaire à son modèle d'édition - préserve les espaces significatifs)
  // - PAS `normal` comme un paragraphe HTML ordinaire. Différence concrète :
  // avec `break-spaces`, l'espace juste avant un retour à la ligne COMPTE
  // dans la largeur de cette ligne (vérifié en conditions réelles : un même
  // texte, à la même largeur en px, saute un mot de moins par ligne avec
  // `break-spaces` qu'avec `normal`) ; avec `normal` (ce que fait pdfmake),
  // cet espace "dépasse" sans compter, un mot de plus peut donc tenir. Sans
  // compensation, pdfmake calait donc systématiquement un mot de trop par
  // rapport à l'éditeur, plus visible dans une colonne étroite (moins de
  // mots par ligne, marge de manœuvre plus faible). Corrigé en retranchant
  // la largeur d'UNE espace (mesurée une fois, mise en cache) de chaque
  // largeur de habillage utilisée par ce fichier - émule la même rigueur que
  // `break-spaces` sans avoir à réimplémenter l'algorithme de retour à la
  // ligne de pdfmake.
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
  const CONTENT_WIDTH_PX = (595.28 - 2 * PAGE_MARGIN_PT) / PX_TO_PT;

  function cssSize(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? Math.max(6, Math.min(72, n * (value && String(value).endsWith('px') ? PX_TO_PT : 1))) : fallback;
  }

  // Police web-safe (picker #v2-font-select, cf. v2/js/editor.js) -> police
  // pdfmake réellement embarquée (cf. ../js/pdf-fonts-extra.js) : pdfmake ne
  // peut jamais utiliser une police du système. Même mapping que la V1 -
  // équivalents libres à métrique identique (mêmes largeurs de caractères).
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

  // pdfmake n'interprète PAS `rgb(r, g, b)` pour `color`/`background`/
  // `fillColor` (vérifié : rend en noir, aucune erreur) - or c'est très
  // exactement la forme sous laquelle un navigateur RENORMALISE un style
  // inline posé en hexa dès qu'il repasse par le DOM (`span.style.color =
  // '#ff0000'` puis relu via `getAttribute('style')`/`outerHTML` ressort en
  // `rgb(255, 0, 0)`, jamais en hexa) - donc systématiquement ce que ce
  // fichier reçoit en pratique (`<input type="color">` produit du hexa,
  // mais passe par un nœud TipTap avant d'arriver ici). Convertit vers
  // l'hexa que pdfmake sait afficher ; laisse passer tel quel un nom de
  // couleur CSS (pdfmake les accepte nativement) ou un hexa déjà présent.
  function cssColorToHex(value) {
    if (!value) return null;
    const v = value.trim();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (!m) return v;
    const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
  }

  // Style hérité d'un nœud DOM -> attributs de "run" pdfmake. Marques
  // produites par l'éditeur V2 (gras/italique/souligné/barré, taille/police/
  // couleur/surlignage inline posées par FontSize/FontFamily/TextColor/
  // HighlightColor, toutes des attributs de la même marque 'textStyle', cf.
  // editor.js) - pdfmake accepte `color`/`background` directement sur un run
  // de texte (vérifié), donc lecture symétrique à font-size/font-family
  // juste en dessous, sans rien de spécial pour tableaux/2-colonnes : cette
  // fonction est déjà le point de passage unique pour tout texte, où qu'il
  // vive dans le schéma.
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
    const title = { text: 'Sommaire', bold: true, fontSize: 16, margin: [0, 0, 0, 10] };
    if (!headingBlocks.length) {
      return { stack: [title, { text: 'Aucun titre trouvé.', italics: true, color: '#6b7280' }], pageNumberCells: [] };
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

  // Attache `root` hors-écran avec la classe .tiptap (pas #editor-container
  // .tiptap : cf. css/editor-v2.css, volontairement scopé à la seule classe
  // pour que cette mesure fonctionne sans dépendre de l'ID du conteneur
  // éditeur réel) et la largeur de contenu du PDF.
  function attachMeasureHost(root, widthPx) {
    root.classList.add('pdf-measure-host', 'tiptap');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + (widthPx || CONTENT_WIDTH_PX) + 'px; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }

  // Image simple, opacité/alignement pris en compte, et position absolue
  // pour un calque devant/derrière le texte - calculée directement depuis les
  // left/top stockés (même formule de repli que la V1, js/pdf-export.js:
  // 288-291), PAS ENCORE via le système de bracketing/interpolation par
  // rapport aux blocs voisins (cf. mémoire project_v2_tiptap_migration,
  // incrément suivant). Limitation connue et acceptée pour cet incrément :
  // une image en calque loin dans un document long (au-delà de la première
  // page) peut driver par rapport à sa position réelle dans l'éditeur, faute
  // de re-belier sa position à un repère mesuré sur la page PDF réelle.
  function pdfImageFromNode(node) {
    const widthPx = parseFloat(node.style.width) || 320;
    const image = { image: node.getAttribute('src'), width: Math.max(15, widthPx * PX_TO_PT) };
    const opacity = parseFloat(node.style.opacity);
    if (Number.isFinite(opacity) && opacity < 1) image.opacity = opacity;
    const layer = node.getAttribute('data-layer') || 'normal';
    if (layer !== 'normal' && node.style.position === 'absolute') {
      // Position réelle résolue plus tard par ancrage/interpolation (cf.
      // buildPdfContentFromRoot/resolveNativePdfContent) - PAS calculée ici :
      // une formule directe depuis le pixel `top` de l'éditeur n'a aucune
      // notion de pagination PDF (une image profondément dans un document
      // long atterrissait n'importe où, signalé par l'utilisateur). Garde
      // une référence au NOEUD DOM réel (encore attaché à l'hôte de mesure
      // à ce stade) pour pouvoir mesurer sa position rendue par rapport aux
      // blocs de texte voisins.
      image._pendingImgNode = node;
      // Conservé jusqu'à la relocation dans content[] (cf.
      // resolveNativePdfContent) : pdfmake peint content[] séquentiellement
      // (une entrée plus tardive dans le tableau recouvre les précédentes) -
      // "devant" et "derrière" n'ont donc PAS la même direction d'insertion
      // par rapport à leur bloc-ancre.
      image._pendingLayer = layer;
      // Placeholder (écrasé par la vraie valeur dans resolveNativePdfContent,
      // une fois l'ancrage résolu) : SANS ceci, tant qu'aucune `absolutePosition`
      // n'est posée, pdfmake traite ce bloc comme un élément de FLUX normal et
      // lui réserve sa propre hauteur - y compris pendant la toute PREMIÈRE
      // passe de mesure (celle qui sert justement à mesurer la position RÉELLE
      // des blocs-ancre voisins, cf. resolveNativePdfContent). Chaque image en
      // attente gonflait alors artificiellement de sa propre hauteur la
      // position mesurée de TOUS les blocs qui la suivent - y compris ceux
      // choisis comme ancres pour CETTE image ou pour une AUTRE image en
      // attente plus loin dans le document - biaisant le calcul d'ancrage
      // (constaté en conditions réelles : ~46pt d'écart correspondant
      // exactement à la hauteur d'une des images en attente). `absolutePosition`
      // sort un bloc du flux dès la première passe, quelle que soit sa valeur
      // (non visible tant que ce bloc n'est pas dans le PDF final rendu).
      image.absolutePosition = { x: 0, y: 0 };
    } else {
      const align = node.getAttribute('data-align');
      // gauche/droite = habillage (float CSS côté éditeur, cf.
      // css/editor-v2.css) - marqué ici plutôt qu'aligné tel quel : géré à
      // part par floatedImageParagraphFrom (colonne image + colonne texte),
      // PAS par la propriété `alignment` de pdfmake (qui n'aurait fait
      // qu'aligner l'image seule dans son propre espace, sans jamais faire
      // habiller le texte autour).
      if (align === 'left' || align === 'right') {
        image._floatAlign = align;
        // Référence au <img> réel (encore attaché à l'hôte de mesure à ce
        // stade) - floatedImageParagraphFrom en a besoin pour mesurer où
        // le texte du MÊME paragraphe dépasse le bas de l'image.
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
    // résout déjà chaque badge en <span> de texte simple AVANT que ce module
    // ne voie le HTML - gardé par robustesse si ce module est un jour appelé
    // sur du HTML non résolu.
    if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }];
    if (node.tagName === 'IMG') {
      if (images && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) {
        images.push(pdfImageFromNode(node));
      }
      return [];
    }
    if (node.tagName === 'BR') return [{ text: '\n', ...style }];
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

  // Marqueur (puce/numéro) d'un <li> : TOUJOURS une vraie liste HTML ici
  // (<ul>/<ol> réels, cf. StarterKit) - contrairement à la V1 (listes Quill
  // plates pilotées par data-list + compteur CSS ::before, jamais fiable via
  // getComputedStyle, cf. v2/js/heading-numbering.js), donc pas besoin de
  // lire quoi que ce soit en CSS : puce fixe pour <ul>, numéro par position
  // pour <ol> (respecte l'attribut start éventuel).
  // Reflète data-bullet-style, posé par la toolbar (bouton "Liste à puces",
  // révélé au survol - cf. Editor.js createBulletStyleExtension) sur le <ul>
  // lui-même, jamais sur chaque <li>. 'circle'/'square' n'utilisent PAS les
  // vrais glyphes Unicode ○/▪ (U+25CB/U+25AA) : vérifié empiriquement (décodage
  // du PDF réel via pdf.js) que pdfmake/PDFKit n'embarque ces polices TTF
  // (pourtant complètes, Roboto/Arimo/etc.) qu'en encodage WinAnsi - tout
  // caractère au-delà de U+00FF ressort en glyphe .notdef (invisible), y
  // compris ○/●/■/□/♦ testés un par un. '°' (degré) reste dans cette plage et
  // se lit comme un petit cercle creux ; aucun caractère WinAnsi ne lit comme
  // un carré, d'où '*' (universel, cf. convention Markdown) plutôt qu'un '#'
  // qui entrerait en collision visuelle avec les badges #Variable. L'éditeur
  // lui-même affiche les vrais disque/cercle/carré (CSS list-style-type, sans
  // cette contrainte) - seul l'export PDF est concerné.
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };
  function listMarkerFor(node) {
    const parent = node.parentElement;
    if (parent && parent.tagName === 'OL') {
      const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
      const start = parseInt(parent.getAttribute('start') || '1', 10) || 1;
      const idx = items.indexOf(node);
      return (start + (idx === -1 ? 0 : idx)) + '. ';
    }
    const bulletStyle = parent && parent.getAttribute('data-bullet-style');
    return BULLET_MARKERS[bulletStyle] || BULLET_MARKERS.disc;
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

  // Découpe les enfants DIRECTS d'une cellule/sous-liste en "lignes" pdfmake :
  // un <p>/<div>/<h1-6> direct est sa propre ligne (porte son propre
  // alignement) ; un <ul>/<ol> DIRECT ajoute une ligne par <li> (récursif
  // pour toute sous-liste imbriquée) ; tout le reste (texte flottant, <br>,
  // <strong>/<em>/<span>...) s'accumule dans un groupe "inline" commun.
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
  // `images` accumule les <img> rencontrées (même mécanisme que blockFrom
  // pour le flux principal) - sans ce paramètre, inlineRuns() les ignore
  // purement et simplement (une image dans une cellule de tableau disparaissait
  // donc silencieusement de l'export, signalé par l'utilisateur).
  // Une image en calque (devant/derrière le texte) trouvée dans `images`
  // entre les index [before, images.length) est rattachée à `obj` (le bloc
  // pdfmake tout juste construit pour CETTE ligne/cellule) comme son ancre
  // LOCALE - même principe que le raccourci "container" du flux principal
  // (cf. resolvePendingImageAnchors), mais sans recherche de bracketing :
  // dans une cellule, le paragraphe qui héberge l'image EST la référence la
  // plus proche disponible, pas besoin de chercher plus loin. Sans cette
  // fonction, une image en calque nichée dans une cellule n'avait NULLE PART
  // où s'ancrer et retombait au coin de la page (ou, après le repli sûr
  // ajouté dans un premier temps, tout en bas de la cellule, en flux normal)
  // - signalé cassé par l'utilisateur dans les deux cas.
  // PAS de correction A4_PREVIEW_PADDING_PX ici (contrairement à
  // resolvePendingImageAnchors, flux principal) : `.tiptap table td, th` a
  // son PROPRE `position: relative` (cf. css/editor-v2.css) - une image en
  // calque nichée dans une cellule a donc pour bloc englobant CSS la
  // CELLULE elle-même, pas `.tiptap`/la page (contrairement à une colonne de
  // zone 2-colonnes, qui n'a aucun `position:relative` propre et reste donc
  // ancrée sur `.tiptap` comme le flux principal). `imgTopPx`/`imgLeftPx`
  // ici ne sont JAMAIS interprétés comme des valeurs absolues page-relative
  // (cf. `containerLeftPx`/xPt spécifique cellule dans
  // resolveImageAbsolutePosition) - seule leur DIFFÉRENCE avec le
  // paragraphe-conteneur compte, qui reste valide quel que soit le bloc
  // englobant CSS réel (simple arithmétique de rects viewport). Appliquer
  // par erreur la correction A4 ici décalait la position d'un ~28pt
  // constant, signalé cassé par l'utilisateur (image retombée bien plus bas
  // que son propre paragraphe hôte).
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
  function cellLineToPdfObject(line, cellAlign, cellBaseStyle, images, cellWidthPt, rootRect, nestedPending) {
    if (line.inline) {
      const before = images.length;
      let runs = [];
      line.inline.forEach(n => { runs = runs.concat(inlineRuns(n, cellBaseStyle, images)); });
      runs = trimEdgeWhitespace(runs);
      const obj = { text: runs.length ? runs : ' ' };
      if (cellAlign) obj.alignment = cellAlign;
      attributeNestedPendingImages(images, before, obj, line.inline[0].parentElement || line.inline[0], rootRect, nestedPending);
      return obj;
    }
    const node = line;
    // Image "au coeur du texte" (flux normal, alignée gauche/droite) dans un
    // <p>/<div> de cellule - même détection et même chemin que blockFrom
    // pour le flux principal (floatedImageParagraphFrom), avec la largeur
    // RÉELLE de la cellule (cf. tableFrom) au lieu de la pleine page : sans
    // cette branche, cellContentFrom n'avait AUCUN support d'habillage,
    // l'image atterrissait systématiquement après tout le texte de la
    // cellule (signalé cassé par l'utilisateur).
    if (/^(P|DIV)$/.test(node.tagName)) {
      const floatImgEl = Array.from(node.querySelectorAll('img.editor-image')).find(img => {
        const align = img.getAttribute('data-align');
        const layer = img.getAttribute('data-layer') || 'normal';
        return layer === 'normal' && (align === 'left' || align === 'right');
      });
      if (floatImgEl) {
        const floated = floatedImageParagraphFrom(node, false, cellWidthPt);
        if (floated) return floated;
      }
    }
    const isLi = node.tagName === 'LI';
    const marker = isLi ? listMarkerFor(node) : '';
    const before = images.length;
    const runs = trimEdgeWhitespace(isLi
      ? inlineRunsExcludingNestedLists(node, cellBaseStyle, images)
      : inlineRuns(node, cellBaseStyle, images));
    const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
    const obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, 0, 0] };
    const align = alignment(node) || cellAlign; if (align) obj.alignment = align;
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
      const runs = trimEdgeWhitespace(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }, images));
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

  // Largeurs de colonnes : MESURÉES sur le rendu réel de la première ligne
  // (le tableau est déjà attaché à un hôte hors-écran de la largeur du PDF,
  // cf. htmlToPdfContent/attachMeasureHost), pas lues depuis un pourcentage
  // stocké sur <col> - contrairement à la V1, dont la poignée de
  // redimensionnement maison écrivait elle-même ce pourcentage ; l'extension
  // officielle @tiptap/extension-table (cf. v2/js/editor.js) écrit à la
  // place une largeur MINIMALE en px sur chaque <col> (`min-width`), pas
  // directement exploitable comme un pourcentage. Mesurer la boîte réelle de
  // chaque cellule évite de dépendre du format exact de cet attribut - et
  // fonctionne aussi bien pour un tableau jamais redimensionné manuellement.
  //
  // Largeur de CONTENU (sans le padding/bordure CSS propres à la cellule),
  // pas la boîte entière : `tableFrom` applique déjà SON PROPRE padding
  // pdfmake (`layout.paddingLeft/Right`, cellPaddingPt) une fois la
  // proportion calculée - mesurer la boîte entière ferait compter ce padding
  // DEUX FOIS (une fois dans la proportion mesurée, une fois dans le budget
  // pdfmake), rendant le texte PDF disponible légèrement plus large que dans
  // l'éditeur.
  //
  // MESURÉE sur le premier enfant de bloc de la cellule (son <p>/<div>/...),
  // PAS calculée en soustrayant padding+bordure de la boîte de la cellule
  // elle-même : les deux ne coïncident pas toujours exactement (arrondi du
  // moteur de mise en page du navigateur sur la largeur de colonne d'un
  // tableau `table-layout:fixed` - vérifié en conditions réelles, un écart
  // de 1px constaté entre les deux approches, juste assez pour faire
  // basculer une coupure de ligne). Repli sur le calcul arithmétique
  // seulement si la cellule n'a aucun enfant de bloc mesurable (cellule
  // vide).
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
    // Padding de cellule MESURÉ sur le CSS réel (.tiptap table td/th { padding:
    // 4px 6px }, cf. css/editor-v2.css), pas une constante approximative :
    // un ancien "4pt/3pt" arrondi (au lieu des 4.5pt/3pt réels) creusait un
    // écart mesurable, signalé par l'utilisateur, entre la largeur de texte
    // disponible dans l'éditeur et celle utilisée par pdfmake. Sert à la fois
    // pour le budget de largeur ci-dessous ET pour `layout.paddingLeft/Right/
    // Top/Bottom` plus bas - un seul et même chiffre, jamais deux valeurs
    // qui pourraient diverger.
    const firstCell = rawRows.length ? cellsOf(rawRows[0])[0] : null;
    const cellCs = firstCell ? getComputedStyle(firstCell) : null;
    const cellPadLeftPt = cellCs ? (parseFloat(cellCs.paddingLeft) || 0) * PX_TO_PT : 4.5;
    const cellPadRightPt = cellCs ? (parseFloat(cellCs.paddingRight) || 0) * PX_TO_PT : 4.5;
    const cellPadTopPt = cellCs ? (parseFloat(cellCs.paddingTop) || 0) * PX_TO_PT : 3;
    const cellPadBottomPt = cellCs ? (parseFloat(cellCs.paddingBottom) || 0) * PX_TO_PT : 3;
    const availableWidthPt = 595.28 - 56;
    const minColWidthPt = 12;
    // pdfmake ajoute paddingLeft+paddingRight (cf. `layout` plus bas) À CHAQUE
    // colonne EN PLUS de la valeur donnée dans `widths` (vérifié en décodant
    // le PDF réellement généré, même constat que la V1) - retiré avant de
    // répartir la largeur disponible pour que le total rendu retombe
    // exactement sur la largeur de page.
    const cellPaddingPt = cellPadLeftPt + cellPadRightPt;
    const usableForColumnsPt = Math.max(minColWidthPt * columnCount, availableWidthPt - columnCount * cellPaddingPt);
    const measuredPx = measuredColumnWidthsPx(node, columnCount);
    const measuredPt = measuredPx ? measuredPx.map(px => px * PX_TO_PT) : null;
    const measuredSum = measuredPt ? measuredPt.reduce((sum, w) => sum + w, 0) : 0;
    // Cible de répartition : la largeur RÉELLE du tableau (measuredSum) si elle
    // tient dans la page, PAS systématiquement `usableForColumnsPt` (la pleine
    // largeur de page) - un tableau volontairement rétréci par l'utilisateur
    // (poignée du milieu tirée vers la gauche, `<table style="width:...px">`
    // plus petit que le conteneur) redevenait pleine largeur à l'export,
    // signalé cassé par l'utilisateur ("je voudrais garder la position réelle
    // des colonnes"). `usableForColumnsPt` reste la limite AU-DELÀ de laquelle
    // on doit quand même réduire (un tableau plus large que la page ne peut
    // physiquement pas garder sa largeur réelle).
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
    // spaceWidthPt() retranché PAR COLONNE, APRÈS la répartition proportionnelle
    // (pas mélangé dans le budget total avant répartition) : compense
    // `white-space: break-spaces` (cf. commentaire en tête de fichier) - sans
    // ça, une colonne étroite en particulier cale régulièrement un mot de
    // trop par rapport à l'éditeur. Mélanger cette compensation dans le
    // budget total AVANT de répartir proportionnellement la diluait au
    // prorata de la largeur de chaque colonne (une petite colonne n'en
    // recevait qu'une fraction), au lieu de s'appliquer pleinement à chacune.
    // ×1.5 (pas ×1 pile) : vérifié par recherche dichotomique sur un cas réel
    // (colonne 241px) que la largeur EXACTE à laquelle un mot cesse de tenir
    // dans pdfmake ne correspond pas exactement à "une largeur d'espace" -
    // ×1 laissait encore, de justesse (< 1pt d'écart), un mot de trop tenir ;
    // une marge de sécurité plus généreuse vaut mieux que de viser le seuil
    // théorique au plus juste, quitte à couper très légèrement plus tôt que
    // strictement nécessaire.
    widths = widths.map(w => Math.max(minColWidthPt, w - spaceWidthPt() * 1.5));
    // Construit APRÈS `widths` (pas avant) : une cellule contenant une image
    // "au coeur du texte" a besoin de la largeur RÉELLE de sa colonne (voire
    // la somme de plusieurs colonnes pour un colspan) pour habiller le texte
    // correctement, cf. cellContentFrom/floatedImageParagraphFrom - sans
    // cette largeur, ce calcul se basait sur la pleine largeur de page,
    // signalé cassé par l'utilisateur.
    // Images en calque imbriquées dans une cellule (cf. cellContentFrom) -
    // récoltées ici puis portées sur le bloc `table` retourné (`_nestedPending`),
    // remontées jusqu'à buildPdfContentFromRoot qui les fusionne dans
    // `content._pendingImages` (même résolution que les images top-level).
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
        // Pas de `margin` propre à la cellule : le seul inset appliqué est
        // `layout.paddingLeft/Right/Top/Bottom` ci-dessous (le budget de
        // largeur, cf. usableForColumnsPt, est déjà calculé en fonction de
        // CE padding précisément - un margin en plus double-compterait un
        // inset déjà pris en compte).
        const pdfCell = Object.assign({ border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
        if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
        // Fond de cellule (TableCell/TableHeader.backgroundColor, cf.
        // editor.js:withCellBackground) - pdfmake accepte `fillColor`
        // directement sur l'objet cellule, symétrique à `color`/`background`
        // sur un run de texte (inheritedStyle).
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

  // Zone 2 colonnes : mesure la chrome CSS RÉELLE (padding/bordure/largeur)
  // en clonant la zone dans un hôte hors-écran de la largeur du PDF, plutôt
  // que de deviner ces valeurs - fonctionne SANS changement pour V2, cette
  // fonction ne lit que des classes CSS partagées (.two-columns-zone/
  // .two-columns-column, css/style.css) et ne dépend d'aucune particularité
  // de Quill ni de TipTap. Contrairement à la V1, pas de ratio de colonnes
  // ajustable pour l'instant (cf. v2/js/editor.js:TwoColumnsZone) - les deux
  // colonnes sont toujours 50/50 (flex: 1 1 0, css/editor-v2.css), mesurées
  // ici comme telles.
  async function twoColumnsFrom(node, pageBreakBefore, rootRect) {
    const colNodes = Array.from(node.querySelectorAll(':scope > .two-columns-column')).slice(0, 2);
    if (colNodes.length < 2) return fallbackTextBlock(node, pageBreakBefore);
    const pageWidth = 595.28;
    const columnGapPt = 16 * PX_TO_PT; // css/editor-v2.css: .two-columns-zone { gap: 16px }
    const contentWidthPx = (pageWidth - 2 * PAGE_MARGIN_PT) / PX_TO_PT;
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
    const fallbackWidth = (pageWidth - 2 * PAGE_MARGIN_PT) / 2;
    const leftWidth = measuredCols[0] ? measureTextWidthPt(measuredCols[0]) : fallbackWidth;
    const rightWidth = measuredCols[1] ? measureTextWidthPt(measuredCols[1]) : fallbackWidth;
    const zoneChromeLeftPt = leftPt(zoneClone);
    const colOwnInsetLeft = [measuredCols[0] ? leftPt(measuredCols[0]) : 0, measuredCols[1] ? leftPt(measuredCols[1]) : 0];
    // PAS de compensation `spaceWidthPt()` ici (contrairement à tableFrom) :
    // `measureTextWidthPt` mesure directement la largeur de TEXTE réelle
    // (pas une largeur de colonne pdfmake à repartir), déjà suffisamment
    // stricte - vérifié en conditions réelles, en ajouter une ici faisait
    // au contraire caler un mot de MOINS que l'éditeur (sur-correction).
    const colOwnInsetRight = [
      measuredCols[0] ? rightPt(measuredCols[0]) : 0,
      measuredCols[1] ? rightPt(measuredCols[1]) : 0,
    ];
    const colOuterWidthPt = [
      measuredCols[0] ? measuredCols[0].getBoundingClientRect().width * PX_TO_PT : leftWidth,
      measuredCols[1] ? measuredCols[1].getBoundingClientRect().width * PX_TO_PT : rightWidth,
    ];
    document.body.removeChild(measureHost);
    const columns = await Promise.all(colNodes.map(async (col, colIdx) => {
      const colAlign = alignment(col);
      // Largeur RÉELLE de cette colonne (mesurée ci-dessus sur le vrai
      // rendu de la zone) - passée à htmlToPdfContent pour que son hôte de
      // mesure interne (un sous-arbre séparé, reconstruit à partir du seul
      // innerHTML de la colonne) mesure une image flottante/son habillage à
      // la largeur RÉELLE de la colonne plutôt qu'à la pleine largeur de
      // page (bug signalé par l'utilisateur : le texte autour d'une image
      // "au coeur du texte" dans une colonne 2-colonnes ne s'enroulait pas
      // à la bonne largeur).
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
      return blocks;
    }));
    // Images en calque imbriquées dans une colonne : chaque colonne a déjà
    // sa PROPRE résolution complète (bracketing+interpolation, pas juste le
    // raccourci "container") via son propre appel à htmlToPdfContent/
    // buildPdfContentFromRoot ci-dessus - `columns[i]._pendingImages` porte
    // déjà `parentArray: columns[i]` (posé par resolvePendingImageAnchors,
    // puisque `columns[i]` EST le tableau `blocks`/`content` de cet appel).
    // Sans cette récolte, cette résolution déjà correcte était silencieusement
    // jetée : rien ne la remontait jusqu'à resolveNativePdfContent, l'image
    // gardait alors son placeholder (coin de la page) puis, après le repli de
    // sécurité ajouté dans un premier temps, retombait en flux normal tout en
    // bas de la colonne - signalé cassé par l'utilisateur dans les deux cas.
    //
    // Correction Y indispensable : cet appel imbriqué reconstruit le contenu
    // de la colonne dans un sous-arbre DÉTACHÉ (`htmlToPdfContent` crée un
    // `root` neuf à partir du seul `col.innerHTML`), pas le même sous-arbre
    // que la zone réelle - son `imgTopPx` (mesuré dans CE sous-arbre isolé,
    // dont l'origine est le début de la colonne, PAS le début du document
    // réel) vaut le `top` CSS BRUT de l'image (relatif à `.tiptap`, cf.
    // attributeNestedPendingImages) tel quel - une valeur pensée pour tout
    // le document, pas pour ce fragment isolé. `containerTopPx` (mesuré dans
    // ce MÊME sous-arbre isolé, sur un paragraphe en flux normal) vaut lui
    // la position LOCALE au fragment (~0 si la colonne ne contient qu'un
    // seul paragraphe) - comparer les deux sans correction revenait à
    // comparer un décalage "depuis le début du document" à un décalage
    // "depuis le début de la colonne", décalé de la position RÉELLE de la
    // colonne dans le document (des centaines de points dès que du contenu
    // la précède) - signalé cassé par l'utilisateur (image très éloignée de
    // son paragraphe hôte dès que la zone 2-colonnes n'est pas tout en tête
    // du document). Fixé en soustrayant la position Y RÉELLE de la colonne
    // (mesurée sur le node RÉEL `col`, encore attaché à l'hôte de mesure
    // top-level à ce stade) de `imgTopPx` - ramène cette valeur dans le MÊME
    // référentiel "local au fragment isolé" que `containerTopPx`/
    // `aboveTopPx`/`belowTopPx`, qui eux n'ont pas besoin de correction
    // (déjà mesurés dans ce référentiel).
    //
    // PAS de correction équivalente pour X (`imgLeftPx`) : contrairement à Y
    // (dont la formule finale s'appuie sur la position RÉSOLUE du conteneur,
    // exprimée dans le référentiel du fragment isolé), X se calcule pour une
    // colonne directement depuis la marge de page (`resolveImageAbsolutePosition`,
    // aucune colonne ne pose son propre `position:relative` - seule une
    // CELLULE le fait, cf. attributeNestedPendingImages) : le `left` CSS brut
    // EST déjà, sans correction, la distance depuis le bord gauche de
    // `.tiptap` - valable identiquement que l'image soit dans la colonne de
    // gauche ou de droite, glissée dans le fragment isolé ou dans le document
    // réel (une correction ici aurait au contraire FAUSSÉ X, testé et
    // confirmé cassé lors d'un premier essai).
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

  // Chemin d'indices d'enfants de `root` jusqu'à `target` (ex. [2,0,1]) -
  // permet de retrouver "le même nœud" dans un clone de `root`
  // (cloneNode(true) préserve exactement la même structure/ordre).
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
  // Retire, à CHAQUE niveau entre `marker` et `root` (`marker` compris), tout
  // ce qui suit `marker`/l'ancêtre courant - laisse un arbre ne contenant
  // plus que "tout ce qui précède (ou suit) marker", tout en conservant les
  // éléments ancêtres (gras/italique...) pour ce qu'ils contiennent avant.
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
  // Tous les MOTS (délimités par un blanc) du texte de `node` (encore
  // attaché à l'hôte de mesure, donc réellement mis en page par le float CSS
  // - cf. css/editor-v2.css), avec la position Y réelle de la ligne sur
  // laquelle chacun tombe.
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
    return inlineRuns(clone, { fontSize: DEFAULT_FONT_SIZE }, []);
  }
  function extractRunsBetween(node, startCut, endCut) {
    return trimEdgeWhitespace(extractRunsBetweenRaw(node, startCut, endCut));
  }

  // Étire une ligne "à la main" jusqu'à `targetWidthPt`, en ajoutant de
  // l'espacement UNIQUEMENT entre le dernier caractère de chaque mot et
  // l'espace qui le suit (jamais à l'intérieur d'un mot, jamais en bordure
  // de run - `characterSpacing` de pdfmake n'agit qu'ENTRE des caractères
  // d'un même run, jamais en bordure - vérifié empiriquement, cf. mémoire
  // project_v2_tiptap_migration : 1 unité = 1pt, linéaire, aucun effet sur
  // la hauteur de ligne contrairement à une variation de fontSize). Répartit
  // l'écart à combler également entre tous les mots de la ligne, comme un
  // vrai justify. `lineWords` = sous-ensemble consécutif de collectWords()
  // pour cette seule ligne (top identique) ; `startCut`/`endCut` bornent le
  // texte RÉEL à extraire (peuvent déborder légèrement des mots eux-mêmes -
  // espaces de bord - d'où le rognage final via trimEdgeWhitespace).
  function buildJustifiedLine(node, lineWords, startCut, endCut, targetWidthPt) {
    const gaps = lineWords.length - 1;
    // PAS (dernier mot.right - premier mot.left) : le paragraphe porte
    // réellement `text-align:justify` en CSS dans l'éditeur (pas juste à
    // l'export) - measurer l'empan de la ligne RENDUE la mesurerait donc
    // déjà étirée par la justification native du navigateur (constaté :
    // largeur mesurée quasi identique à la largeur de colonne cible, alors
    // que le texte est nettement plus court une fois posé tel quel dans
    // pdfmake) - fausserait `extraPt` vers ~0 à tort. Somme plutôt la
    // largeur PROPRE de chaque mot (jamais affectée par le justify - le
    // navigateur n'étire QUE les espaces, jamais les mots eux-mêmes) plus un
    // espace "normal" (non étiré) par intervalle, déjà mesuré ailleurs dans
    // ce fichier via une sonde hors-flux non justifiée (spaceWidthPt()).
    const naturalWidthPt = lineWords.reduce((sum, w) => sum + (w.right - w.left), 0) * PX_TO_PT + gaps * spaceWidthPt();
    // Petite marge de sécurité : viser EXACTEMENT targetWidthPt laisse un
    // écart nul avec la largeur réelle de la colonne - un sous-pixel
    // d'arrondi entre notre estimation et le rendu réel de pdfmake (métriques
    // de police jamais garanties identiques au dixième de point près,
    // cf. commentaire au-dessus) suffit alors à faire dépasser la ligne
    // étirée de sa largeur, et donc à la faire recouper par pdfmake (un mot
    // entier bascule sur une ligne en trop - constaté). `noWrap` n'aide pas
    // ici (n'a d'effet que sur un `text` chaîne simple, pas sur un tableau
    // de runs stylés - vérifié). Un leger sous-étirement (quelques dixièmes
    // de point, invisible) est préférable à ce risque.
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

  // pdfmake n'étire JAMAIS (alignment:'justify') une ligne qu'il n'a pas
  // lui-même coupée - vérifié : même un bloc RÉELLEMENT multi-lignes
  // construit à la main (plusieurs runs séparés par des '\n' explicites)
  // n'étire AUCUNE de ses lignes, pas même les non-dernières. Un bloc pour
  // CHAQUE ligne (l'ancienne approche ici, cf. historique git) revient donc
  // exactement au même problème que des '\n' manuels - impossible à
  // contourner en dictant les coupures. Seul le WordWrap interne de pdfmake
  // (laisser UN bloc de texte continu se répartir lui-même dans la largeur
  // de la colonne) sait quelles lignes ne sont "pas les dernières" et les
  // étire en conséquence. Choix fait avec l'utilisateur (option B, cf.
  // mémoire project_v2_tiptap_migration) : le texte "à côté" de l'image est
  // donc désormais un SEUL bloc pdfmake auto-wrappé, avec le vrai alignement
  // du paragraphe (y compris justify) - au prix d'un risque assumé, déjà
  // observé par ailleurs dans ce fichier, que la coupure de ligne de
  // pdfmake ne tombe pas TOUJOURS exactement au même mot que le rendu réel
  // de l'éditeur (métriques de police légèrement différentes) - préféré à
  // un texte visiblement jamais justifié à côté d'un paragraphe justifié.

  // Habillage réel (float CSS côté éditeur, .editor-image-view[data-align=
  // left|right], cf. css/editor-v2.css) reproduit ici via le mécanisme
  // `columns` NATIF de pdfmake : une colonne à largeur fixe pour l'image,
  // une colonne pour le texte du MÊME paragraphe dans la largeur restante.
  // L'image peut apparaître n'IMPORTE OÙ dans le paragraphe (pas
  // nécessairement en tête - signalé par l'utilisateur : "Lorem ipsum...
  // dolore m<img>agna aliqua...") - le texte se découpe donc en TROIS
  // segments, pas deux : (1) tout ce qui précède la ligne où l'image
  // commence (des lignes ENTIÈREMENT terminées avant que le flottement ne
  // débute - un float CSS n'affecte jamais les lignes qui le précèdent, donc
  // ce segment reste en flux normal pleine largeur, INCHANGÉ) ; (2) le texte
  // qui tombe dans la hauteur de l'image, comme UN SEUL bloc auto-wrappé
  // dans la largeur de colonne restante (cf. commentaire au-dessus) ; (3)
  // tout ce qui suit le bas de l'image, de nouveau en flux normal pleine
  // largeur. Seules les FRONTIÈRES entre ces trois segments (quels mots
  // appartiennent à quel segment) restent dictées par la position RÉELLE
  // mesurée dans l'éditeur (mots consécutifs de même Y) - pas la coupure de
  // ligne à l'intérieur du segment (2) lui-même, laissée à pdfmake.
  // Portée de CET incrément : seulement le texte du MÊME paragraphe que
  // l'image - un paragraphe SUIVANT distinct ne vient pas encore s'habiller
  // si l'image est plus haute que ce seul paragraphe (limitation connue,
  // nécessiterait de consommer des blocs frères suivants depuis
  // buildPdfContentFromRoot, plus invasif - cf. mémoire
  // project_v2_tiptap_migration). `null` si le paragraphe ne contient QUE
  // l'image (aucun texte à habiller) - l'appelant retombe alors sur le rendu
  // normal (image seule).
  function floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt) {
    const images = [];
    const runs = trimEdgeWhitespace(inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images));
    const floatImg = images.find(img => img._floatAlign);
    if (!floatImg || !runs.length) return null;
    const align = floatImg._floatAlign;
    // Alignement du PARAGRAPHE (justify/center/right/left posé sur <p> dans
    // l'éditeur) - distinct de `align`, qui est le côté du FLOTTEMENT de
    // l'image (gauche/droite). blockFrom() applique normalement `alignment`
    // au bloc texte qu'il construit lui-même, mais cette fonction retourne
    // AVANT ce point-là (chemin séparé pour l'habillage) - sans le reporter
    // ici explicitement sur chaque bloc texte produit, l'alignement du
    // paragraphe était silencieusement perdu à l'export (jamais lu du tout
    // sur ce chemin), constaté par l'utilisateur sur un paragraphe justifié.
    const textAlign = alignment(node);
    const imgNode = floatImg._sourceImgNode;
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    // Largeur disponible : celle de la page par défaut (flux principal), mais
    // OVERRIDABLE par l'appelant (blockFrom pour une cellule de tableau,
    // twoColumnsFrom pour une colonne) - sans ça, une image flottante nichée
    // dans une cellule/colonne bien plus étroite que la page calculait son
    // habillage/justify comme si elle disposait de la pleine largeur de page,
    // signalé cassé par l'utilisateur.
    const pageWidthPt = availableWidthPt != null ? availableWidthPt : (595.28 - 2 * PAGE_MARGIN_PT);
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
    // Tolérance généreuse (pas 0.5px) sur les deux frontières : une ligne
    // dont le haut tombe à quelques pixels À PEINE après le bord de l'image
    // reste comptée "à côté" plutôt que "en dessous" - une frontière stricte
    // au demi-pixel s'est avérée trop fragile en conditions réelles (vérifié :
    // un même document, chez l'utilisateur, mesurait le bas de l'image à
    // quelques pixels près d'une ligne suivante et basculait de "3 lignes à
    // côté" à "4 lignes à côté" selon l'environnement - sous-pixels de
    // rendu de police/image qui varient d'un navigateur à l'autre, pas une
    // erreur de logique). ~20% d'une hauteur de ligne typique à 10.5pt.
    const BOUNDARY_TOLERANCE_PX = 4;
    // Premier mot dont la ligne commence au niveau (ou après) le HAUT de
    // l'image - tout ce qui précède est sur des lignes entièrement
    // terminées avant que le flottement ne débute, donc pas affecté par lui.
    let besideStart = words.length;
    for (let w = 0; w < words.length; w += 1) { if (words[w].top >= imgRect.top - BOUNDARY_TOLERANCE_PX) { besideStart = w; break; } }
    // Premier mot, à partir de besideStart, dont la ligne commence au
    // niveau (ou après) le BAS de l'image - tout ce qui suit n'est plus
    // affecté par le flottement.
    // + tolérance ici (pas -) : on veut REPOUSSER le seuil vers le bas pour
    // qu'une ligne à peine après le bord de l'image reste "à côté" - une
    // soustraction, comme pour besideStart, aurait fait l'inverse (classé
    // "en dessous" ENCORE PLUS de lignes, pas moins - erreur de signe
    // commise puis corrigée après re-vérification sur le cas réel).
    let besideEnd = words.length;
    for (let w = besideStart; w < words.length; w += 1) { if (words[w].top >= imgRect.bottom + BOUNDARY_TOLERANCE_PX) { besideEnd = w; break; } }
    if (besideStart === besideEnd) return fallback(); // rien de mesurable à côté (cas dégénéré)
    // Regroupe des mots CONSÉCUTIFS (même Y à 2px près) en lignes - sert à
    // reconstruire, ligne par ligne, le texte "avant" et "à côté" quand un
    // étirement manuel (justify) est nécessaire (cf. buildJustifiedLine) :
    // seule une ligne dictée séparément permet d'en connaître les bornes
    // exactes (mots de début/fin) pour y calculer un étirement précis.
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
      // Chaque ligne "à côté" est dictée séparément (comme "avant" ci-dessus)
      // et étirée - SAUF si c'est à la fois la dernière ligne à côté ET qu'il
      // n'y a pas de texte "après" (cf. hasAfter) : dans ce seul cas, c'est
      // la vraie dernière ligne du paragraphe, jamais étirée (même
      // convention que le CSS).
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

  // Poursuite de l'habillage sur un paragraphe SUIVANT qui n'a lui-même
  // AUCUNE image, mais dont le flottement d'une image d'un FRÈRE PRÉCÉDENT
  // continue de déborder verticalement dans son espace - même mesure "mots
  // réels vs bord de l'image" que floatedImageParagraphFrom, mais un simple
  // décalage de marge suffit ici (pas de `columns` : il n'y a pas de second
  // contenu - l'image, déjà posée par le paragraphe d'origine - à replacer
  // à côté sur CE bloc, seulement le texte qui doit rester dans la largeur
  // réduite tant que le flottement dure). `carry` = { imgBottom (px, même
  // repère getBoundingClientRect que words[].top), align, imageWidthPt,
  // remainingWidthPt, gapPt }, préparé par blockFrom au moment où le
  // paragraphe hôte de l'image est traité. Retourne { blocks, stillActive }
  // - stillActive=true si TOUT le paragraphe est resté dans la hauteur de
  // l'image (le frère SUIVANT doit alors être vérifié à son tour) ; ou
  // `null` si ce paragraphe est en fait déjà entièrement sous l'image
  // (marge de tolérance de l'appelant trop généreuse - traité normalement).
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

  // Retourne toujours un TABLEAU de blocs (jamais un bloc unique) : un
  // paragraphe contenant une image produit un bloc de texte ET un bloc image
  // séparés (pdfmake ne supporte pas d'image réellement "en ligne").
  function blockFrom(node, pageBreakBefore, headingMarkers, availableWidthPt, rootRect, floatCarry) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return [tableFrom(node, pageBreakBefore, rootRect)];
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
    if (tag === 'P' || tag === 'DIV') {
      const floatImgEl = Array.from(node.querySelectorAll('img.editor-image')).find(img => {
        const align = img.getAttribute('data-align');
        const layer = img.getAttribute('data-layer') || 'normal';
        return layer === 'normal' && (align === 'left' || align === 'right');
      });
      if (floatImgEl) {
        const floated = floatedImageParagraphFrom(node, pageBreakBefore, availableWidthPt);
        if (floated) {
          const arr = Array.isArray(floated) ? floated : [floated];
          // Le flottement doit-il se poursuivre sur le(s) frère(s) SUIVANT(s)
          // (cf. wrapParagraphBesideCarriedFloat) ? Mesuré depuis le <img> RÉEL
          // (encore attaché à l'hôte de mesure, indépendamment de ce que
          // floatedImageParagraphFrom a déjà consommé en interne) plutôt que
          // de changer sa signature de retour. Si le dernier bloc produit n'a
          // PAS de `columns` (c'est un `afterBlock` texte plein, cf.
          // floatedImageParagraphFrom), du texte est déjà revenu sous l'image
          // DANS ce même paragraphe - le flottement est épuisé ici, rien à
          // reporter.
          const lastBlock = arr[arr.length - 1];
          if (lastBlock && !lastBlock.columns) {
            arr._floatCarry = null;
          } else {
            const align = floatImgEl.getAttribute('data-align');
            const imgRect = floatImgEl.getBoundingClientRect();
            const pageWidthPt = availableWidthPt != null ? availableWidthPt : (595.28 - 2 * PAGE_MARGIN_PT);
            const gapPt = 12 * PX_TO_PT;
            const imageWidthPt = Math.max(15, imgRect.width * PX_TO_PT);
            arr._floatCarry = { imgBottom: imgRect.bottom, align, imageWidthPt, remainingWidthPt: Math.max(40, pageWidthPt - imageWidthPt - gapPt), gapPt };
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
    // Sous-liste imbriquée : un <li> issu de StarterKit peut contenir un
    // <ul>/<ol> ENFANT après son <p> (Tab pour imbriquer, cf. v2/js/editor.js -
    // aucun câblage supplémentaire nécessaire, ProseMirror gère nativement le
    // raccourci) - exclue du texte de CE <li>, traitée plus bas comme ses
    // propres blocs.
    const nestedLists = tag === 'LI' ? Array.from(node.children).filter(c => /^(UL|OL)$/.test(c.tagName)) : [];
    const runs = trimEdgeWhitespace(nestedLists.length
      ? inlineRunsExcludingNestedLists(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images)
      : inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images));
    const blocks = [];
    const indentPt = measureIndentPt(node, tag === 'LI' ? 'box' : 'text');
    // Marge verticale nulle entre blocs consécutifs (mesuré : .tiptap p/h1-6/
    // li/ol/ul { margin: 0 }, cf. css/editor-v2.css) - même raisonnement que
    // la V1 : ajouter une marge fictive ici dérive de la vraie mise en page.
    // Marge droite = spaceWidthPt() : compense `white-space: break-spaces`
    // (cf. commentaire en tête de fichier), même principe que pour les
    // tableaux/zones 2 colonnes - un flux principal (pleine largeur de page)
    // a rarement assez peu de mots par ligne pour que ça se voie, mais reste
    // cohérent avec le reste du document plutôt que de laisser un cas limite
    // non couvert.
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
    if (tag === 'LI') { block.text = runs.length ? [{ text: listMarkerFor(node), fontSize: DEFAULT_FONT_SIZE }].concat(runs) : ' '; }
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, 4, spaceWidthPt(), 4]; }
    // Un paragraphe SANS AUCUN texte (ex. ne contenant qu'une image) n'a pas
    // besoin de ce bloc-texte de repli (`text: ' '`, prévu pour préserver la
    // ligne vide d'un paragraphe RÉELLEMENT vide) : dans l'éditeur, un tel
    // paragraphe s'effondre à hauteur nulle (l'image y est en flux normal ou
    // sortie du flux si en calque) - le pousser quand même ajoutait une ligne
    // vide fictive dans le PDF, absente de l'éditeur, qui décalait tout le
    // contenu suivant de la hauteur d'une ligne (et, pour une image en calque,
    // faussait la position mesurée des blocs-ancre voisins qui s'appuient sur
    // ces positions réelles, cf. resolvePendingImageAnchors).
    if (runs.length || !images.length) {
      if (pageBreakBefore) block.pageBreak = 'before';
      blocks.push(block);
    } else if (pageBreakBefore && images[0]) {
      images[0].pageBreak = 'before';
    }
    images.forEach(img => {
      blocks.push(img);
      // Image flottante SEULE dans son paragraphe (aucun texte à côté,
      // `floatImgEl` plus haut n'a alors rien trouvé à traiter puisque
      // `runs.length` valait 0 - cf. floatedImageParagraphFrom, qui bâcle
      // avant de calculer quoi que ce soit dans ce cas précis) - le
      // flottement doit quand même pouvoir se reporter sur le(s) frère(s)
      // SUIVANT(s), cf. wrapParagraphBesideCarriedFloat.
      if (img._floatAlign) {
        const imgRect = img._sourceImgNode.getBoundingClientRect();
        const pageWidthPt = availableWidthPt != null ? availableWidthPt : (595.28 - 2 * PAGE_MARGIN_PT);
        const gapPt = 12 * PX_TO_PT;
        blocks._floatCarry = { imgBottom: imgRect.bottom, align: img._floatAlign, imageWidthPt: img.width, remainingWidthPt: Math.max(40, pageWidthPt - img.width - gapPt), gapPt };
      }
    });
    nestedLists.forEach(list => {
      Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
        blockFrom(li, false, headingMarkers, availableWidthPt, rootRect).forEach(b => blocks.push(b));
      });
    });
    return blocks;
  }

  async function buildPdfContentFromRoot(root, headingMarkers, availableWidthPt) {
    const blocks = [];
    // Parallèle à `blocks` : le nœud DOM top-level source de chaque entrée -
    // sert uniquement à mesurer la position RENDUE réelle des blocs voisins
    // d'une image en calque (cf. résolution d'ancrage plus bas), pas besoin
    // ailleurs.
    const sourceNodes = [];
    const headingBlocks = []; const tocBlocks = [];
    // Images en calque IMBRIQUÉES (cellule de tableau, colonne de zone
    // 2-colonnes) - accumulées ici à part de `resolvePendingImageAnchors`
    // (qui ne voit que les blocs TOP-LEVEL) : tableFrom/twoColumnsFrom
    // posent un `_nestedPending` sur le bloc qu'ils retournent, récolté ici
    // puis fusionné dans `content._pendingImages` plus bas - un seul et même
    // mécanisme de résolution (cf. resolveNativePdfContent) pour les deux.
    const nestedPendingAll = [];
    const rootRect = root.getBoundingClientRect();
    let pendingPageBreak = false;
    // Habillage d'une image "au coeur du texte" (float CSS) qui déborde
    // encore verticalement une fois son paragraphe hôte terminé - transmis
    // au(x) frère(s) SUIVANT(s) via blockFrom (cf. son paramètre floatCarry
    // et wrapParagraphBesideCarriedFloat) tant qu'ils restent des <p>/<div>
    // simples. Remis à `null` dès que le prochain contenu n'est PAS un tel
    // bloc (tableau, titre, liste, zone 2-colonnes, saut de page forcé...) -
    // volontairement pas de tentative d'habiller ces structures plus
    // complexes, seule la continuation entre paragraphes simples est gérée.
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
      // Pas de branche dédiée pour un <table> : @tiptap/extension-table
      // l'enveloppe bien d'un <div class="tableWrapper"> (défilement
      // horizontal) dans le DOM d'édition LIVE, mais PAS dans le HTML
      // sérialisé (`Editor.getHTML()`, ce que ce module reçoit toujours en
      // pratique - vérifié en conditions réelles) : un <table> y est donc
      // toujours un enfant direct, déjà couvert par isBlock()/blockFrom()
      // ci-dessous comme n'importe quel autre bloc.
      if (node.classList.contains('two-columns-zone')) {
        let zoneBlock;
        try { zoneBlock = await twoColumnsFrom(node, pendingPageBreak, rootRect); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        if (zoneBlock && zoneBlock._nestedPending) { nestedPendingAll.push(...zoneBlock._nestedPending); delete zoneBlock._nestedPending; }
        push(zoneBlock, node);
        pendingPageBreak = false; floatCarry = null;
        return;
      }
      if (isBlock(node)) {
        let produced;
        try { produced = blockFrom(node, pendingPageBreak, headingMarkers, availableWidthPt, rootRect, floatCarry); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        floatCarry = (produced && produced._floatCarry) || null;
        produced.forEach(b => {
          if (b && b._nestedPending) { nestedPendingAll.push(...b._nestedPending); delete b._nestedPending; }
          push(b, node); if (b && b._isHeading) headingBlocks.push(b);
        });
        pendingPageBreak = false;
        return;
      }
      for (const child of Array.from(node.childNodes)) { await visit(child); }
    };
    for (const child of Array.from(root.childNodes)) { await visit(child); }
    tocBlocks.forEach(tocBlock => {
      const built = buildTocStack(headingBlocks);
      tocBlock.stack = built.stack;
      tocBlock._pageNumberCells = built.pageNumberCells;
    });
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    content._headingBlocks = headingBlocks;
    content._tocBlocks = tocBlocks;
    content._pendingImages = resolvePendingImageAnchors(rootRect, blocks, sourceNodes).concat(nestedPendingAll);
    return content;
  }

  // Une image en calque (devant/derrière le texte) est positionnée par
  // glisser n'IMPORTE OÙ visuellement dans l'éditeur, sans lien avec
  // l'endroit où son <img> vit textuellement dans le HTML - ancrer sur le
  // bloc PRÉCÉDENT/SUIVANT dans le document ne suffit donc pas (l'image a pu
  // être glissée loin de son paragraphe d'origine) : on cherche plutôt,
  // parmi TOUS les blocs top-level déjà mesurables, ceux dont la position
  // RENDUE (dans l'hôte de mesure, encore attaché ici) encadre le plus
  // étroitement la position rendue de l'image elle-même. Contrairement à la
  // V1 (qui devait persister des identifiants d'ancrage côté éditeur parce
  // que le glisser pouvait survenir à tout moment), tout se recalcule ici,
  // à l'export, à partir du HTML final - plus simple.
  function resolvePendingImageAnchors(rootRect, blocks, sourceNodes) {
    const pending = [];
    // Un paragraphe qui héberge une image en attente produit TOUJOURS, en plus
    // du bloc image lui-même, un bloc-texte "compagnon" (cf. blockFrom : même
    // sans aucun texte, `runs.length ? runs : ' '` pousse un bloc `{text:' '}`
    // partageant le MÊME nœud source) - pour un paragraphe qui ne contient QUE
    // l'image (aucun texte autour), ce compagnon fantôme s'effondre à une
    // hauteur quasi nulle, à la position même du paragraphe hôte - donc à un
    // endroit sans rapport avec la position réelle (absolue) de l'image qu'il
    // accompagne. Il pouvait alors, par coïncidence de position, qualifier à
    // tort comme ancre "au-dessus"/"en dessous" pour l'image elle-même (auto-
    // référence non détectée par le test de boîte englobante ci-dessous, qui
    // ne protège que le cas d'un paragraphe avec du VRAI texte avant/après
    // l'image) OU pour une AUTRE image plus loin dans le document - constaté
    // en conditions réelles (position finale décalée de ~150pt). Exclu donc
    // de `measurable` au même titre que le bloc image lui-même : tout bloc
    // partageant le nœud source d'une image en attente est écarté, qu'il
    // porte ou non `_pendingImgNode`.
    const pendingHostNodes = new Set(blocks.map((b, i) => (b && b._pendingImgNode) ? sourceNodes[i] : null).filter(Boolean));
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i] })).filter(({ block, node }) => block && !block._pendingImgNode && !pendingHostNodes.has(node));
    // Une image en calque nichée au milieu d'un paragraphe qui a du texte
    // RÉEL avant/après elle (ex. "...Duis aute irure<img>enderit in...") a
    // un bien meilleur point de référence disponible que le bracketing
    // générique ci-dessous : son PROPRE paragraphe, dont le tout DÉBUT est
    // mesurable (mêmes px/pt que n'importe quel bloc), et dont on sait que
    // l'échelle px→pt y est UNIFORME (texte réel en flux normal, vérifié :
    // le même PX_TO_PT s'applique du premier au dernier pixel). Le
    // bracketing générique doit exclure ce paragraphe (cf. plus haut) pour
    // ne pas se prendre lui-même comme ancre - mais ça oblige alors à
    // extrapoler depuis le bloc externe le plus proche, parfois à des
    // dizaines de pixels de distance de l'autre côté de paragraphes vides à
    // hauteur nulle (cf. commentaire ci-dessus) - une extrapolation linéaire
    // sur cette distance suppose à tort une échelle uniforme sur tout le
    // trajet, ce qui ne tient pas (constaté : plusieurs dizaines de points
    // d'écart). Ici, le début du paragraphe hôte lui-même sert de référence
    // locale directe - plus précis, et prioritaire sur le bracketing
    // générique quand disponible (cf. resolveImageAbsolutePosition).
    const hostToOwnTextBlock = new Map();
    blocks.forEach((b, i) => {
      if (b && !b._pendingImgNode && sourceNodes[i] && !hostToOwnTextBlock.has(sourceNodes[i])) hostToOwnTextBlock.set(sourceNodes[i], b);
    });
    // Tolérance au demi-pixel, même valeur que la V1 (js/editor.js:
    // findBracketingAnchors) - sous-pixels de rendu de police d'un
    // navigateur à l'autre, pas une erreur de logique.
    const BOUNDARY_EPS_PX = 0.5;
    blocks.forEach((block, idx) => {
      if (!block || !block._pendingImgNode) return;
      const imgRect = block._pendingImgNode.getBoundingClientRect();
      // cf. A4_PREVIEW_PADDING_PX ci-dessus : ramène au référentiel sans
      // padding utilisé par tout le reste de cette fonction (mesures prises
      // dans l'hôte de mesure, lui-même sans padding).
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
        // Qualifie comme ancre "au-dessus"/"en dessous" seulement si le bloc
        // ENTIER (haut ET bas, pas juste son sommet) se termine avant/
        // commence après l'image - sans quoi le paragraphe qui CONTIENT
        // l'image (texte avant ET après elle, cas d'une image en calque
        // nichée au milieu d'un paragraphe) qualifiait à tort comme sa
        // propre ancre "au-dessus" (son sommet précède bien l'image, mais
        // son bas la dépasse largement) - donnant une position extrapolée
        // depuis le TOUT DÉBUT du paragraphe au lieu d'un vrai encadrement,
        // signalé cassé par l'utilisateur pour ce cas précis. Même critère
        // de qualification que la V1, déjà résolu là-bas (cf.
        // findBracketingAnchors, js/editor.js : `rect.bottom <= imgRect.top`
        // / `rect.top >= imgRect.bottom`, jamais juste `rect.top`).
        if (bottom <= imgTopPx + BOUNDARY_EPS_PX && top > aboveTopPx) { aboveTopPx = top; above = other; }
        if (top >= imgBottomPx - BOUNDARY_EPS_PX && top < belowTopPx) { belowTopPx = top; below = other; }
      });
      // `parentArray: blocks` - tableau dans lequel `block` (l'image) et son
      // ancre vivent tous les deux ; utilisé par resolveNativePdfContent pour
      // relocaliser l'image à côté de son ancre (paint-order devant/derrière)
      // sans dépendre d'un tableau top-level codé en dur - même champ posé
      // par les images imbriquées dans une cellule/colonne (cf.
      // cellLineToPdfObject/twoColumnsFrom), qui utilisent leur propre
      // tableau local plutôt que le `content` top-level.
      pending.push({ image: block, above, below, imgTopPx, imgLeftPx, aboveTopPx, belowTopPx, container, containerTopPx, parentArray: blocks });
    });
    return pending;
  }

  // isTopLevel=true pour le flux principal de la page (calcule la
  // numérotation des titres, cf. headingMarkers) ; false pour le contenu
  // d'une colonne d'une zone 2 colonnes (cf. twoColumnsFrom) - un titre saisi
  // dans une colonne n'est ni numéroté ni inclus dans le sommaire, même
  // exclusion que css/editor-v2.css (compteurs scopés aux enfants DIRECTS de
  // .tiptap).
  // `availableWidthPt` : largeur réellement disponible pour CE contenu, si
  // différente de la pleine largeur de page - cas d'une colonne de zone
  // 2-colonnes (cf. twoColumnsFrom), dont le contenu est reconstruit dans un
  // hôte de mesure SÉPARÉ (pas le même sous-arbre que la zone réelle) : sans
  // cette largeur, ce second hôte mesurait tout en pleine largeur de page,
  // faussant l'habillage/justify d'une image flottante nichée dans la
  // colonne (bug signalé par l'utilisateur - le calcul se basait sur une
  // largeur bien plus grande que la colonne réelle).
  async function htmlToPdfContent(html, isTopLevel, availableWidthPt) {
    const root = document.createElement('div'); root.innerHTML = html || '';
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
      // Attend le décodage de CHAQUE <img> de CE root précis (pas un
      // pré-chauffage sur un élément séparé, cf. inlineEditorImagesAsDataUri
      // plus haut - un simple pré-chauffage du cache navigateur s'est avéré
      // insuffisamment fiable en conditions réelles, signalé par
      // l'utilisateur : même bug persistant malgré ce premier correctif)
      // AVANT toute mesure (`getBoundingClientRect()` sur une image en
      // hauteur `auto` a besoin du ratio intrinsèque réel, cf.
      // floatedImageParagraphFrom) - la seule garantie robuste est d'attendre
      // le décodage des images DE CE ROOT MESURÉ lui-même.
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      return await buildPdfContentFromRoot(root, headingMarkers, availableWidthPt);
    } finally {
      detachMeasureHost();
    }
  }

  // pdfmake ne sait embarquer que du JPEG/PNG (tout le reste - SVG, mais
  // aussi WEBP - le fait bloquer indéfiniment ou lever "Unknown image
  // format" sans que l'appelant ne soit prévenu) - rastérise donc en PNG via
  // un aller-retour <img>/<canvas>, quel que soit le format source (le
  // navigateur sait décoder n'importe quel format qu'il affiche
  // normalement). Générique, sans dépendance à l'éditeur. Découvert sur du
  // WEBP : les CDN d'images (Wikimedia compris) renvoient couramment du
  // WEBP par négociation de contenu même pour une URL en ".png" - un cas
  // bien plus courant qu'un simple SVG isolé.
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

  function buildNativeDocDefinition(content, filename) {
    return { pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [28, 28, 28, 28], defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE }, content, info: { title: filename || 'publipostage' } };
  }

  // Convertit une image en calque en attente (cf. resolvePendingImageAnchors)
  // en une vraie `absolutePosition` pdfmake, à partir des positions RÉELLES
  // (déjà mesurées par pdfmake lui-même lors de la passe de mesure) des blocs-
  // ancre au-dessus/en-dessous. Interpole entre les deux si les deux sont
  // résolues et sur la MÊME page (même formule que la V1 :
  // fraction = offset-au-dessus / (offset-au-dessus - offset-en-dessous)) ;
  // repli sur une seule ancre si l'autre est absente (image en tête/fin de
  // document, ou ancres sur des pages différentes - cas limite non traité
  // plus finement, rare en pratique) ; repli final purement local si aucune
  // ancre n'a pu être résolue (document sans aucun autre bloc mesurable).
  function resolveImageAbsolutePosition(a) {
    // `imgLeftPx` est page-relative (bloc englobant CSS = `.tiptap`) pour le
    // flux principal ET une colonne de zone 2-colonnes (aucune des deux ne
    // pose son propre `position:relative`) - X s'y calcule directement depuis
    // la marge de page. Une cellule de tableau (`.tiptap table td/th` a SON
    // PROPRE `position:relative`, cf. attributeNestedPendingImages) n'entre
    // PAS dans ce cas : `imgLeftPx` y est relatif à la CELLULE, pas à la
    // page - `containerLeftPx`/`containerLeft` (posés uniquement par
    // attributeNestedPendingImages) signalent ce cas et pilotent alors X de
    // la MÊME façon que Y (différence locale par rapport au conteneur,
    // reportée sur la position RÉELLE déjà résolue de ce conteneur) plutôt
    // que la formule page-relative, qui donnait une position n'importe où
    // sur la page (signalé cassé par l'utilisateur).
    const xPt = a.containerLeftPx != null && a.containerLeft != null
      ? a.containerLeft + (a.imgLeftPx - a.containerLeftPx) * PX_TO_PT
      : PAGE_MARGIN_PT + a.imgLeftPx * PX_TO_PT;
    // Référence locale (cf. resolvePendingImageAnchors) prioritaire sur le
    // bracketing générique ci-dessous quand disponible : plus précise, car
    // fondée sur le début du paragraphe qui héberge l'image elle-même (échelle
    // px→pt localement uniforme, texte réel en flux normal) plutôt que sur une
    // extrapolation/interpolation depuis un bloc externe potentiellement
    // éloigné de plusieurs paragraphes.
    if (a.containerTop != null) return { x: xPt, y: a.containerTop + (a.imgTopPx - a.containerTopPx) * PX_TO_PT };
    if (a.aboveTop != null && a.belowTop != null && a.abovePage === a.belowPage && a.belowTopPx !== a.aboveTopPx) {
      const fraction = (a.imgTopPx - a.aboveTopPx) / (a.belowTopPx - a.aboveTopPx);
      return { x: xPt, y: a.aboveTop + fraction * (a.belowTop - a.aboveTop) };
    }
    if (a.aboveTop != null) return { x: xPt, y: a.aboveTop + (a.imgTopPx - a.aboveTopPx) * PX_TO_PT };
    if (a.belowTop != null) return { x: xPt, y: a.belowTop + (a.imgTopPx - a.belowTopPx) * PX_TO_PT };
    return { x: xPt, y: PAGE_MARGIN_PT + a.imgTopPx * PX_TO_PT };
  }

  // S'il y a un sommaire ET/OU des images en calque en attente, une 1ère
  // passe de mise en page "de mesure" (jamais montrée à l'utilisateur, juste
  // .getBuffer() pour forcer pdfmake à calculer .positions) donne les vraies
  // page/position des blocs-ancre. Le contenu est ensuite reconstruit à neuf
  // (htmlToPdfContent est une fonction pure) : les numéros de page du
  // sommaire sont reportés dans ses cellules réservées ; les images en
  // attente reçoivent leur `absolutePosition` finale ET sont RELOCALISÉES
  // dans le tableau qui les héberge (`p.parentArray` - le tableau `content[]`
  // top-level, OU le tableau local d'une cellule de tableau/colonne de zone
  // 2-colonnes, cf. cellContentFrom/twoColumnsFrom) juste à côté de l'ancre
  // utilisée - pdfmake place un `absolutePosition` sur la page COURANTE au
  // moment où il traite cette entrée du tableau (pas sur la page indiquée par
  // `y`), donc une image glissée loin de sa position DOM d'origine resterait
  // composée sur la MAUVAISE page sans ce réalignement (même contrainte que
  // la V1, cf. mémoire project_image_anchor_bracketing_interpolation). Une
  // image en calque imbriquée dans une cellule/colonne partage cette MÊME
  // résolution (`content._pendingImages` fusionne les deux, cf.
  // buildPdfContentFromRoot) : `getBuffer()` pose bien `.positions` sur
  // n'importe quel objet qu'il peint, même nichée dans une table/columns
  // (vérifié empiriquement) - seule la recherche d'ancre diffère (bracketing
  // complet pour une colonne, qui a déjà son propre passage par
  // buildPdfContentFromRoot ; raccourci "container" - le paragraphe hôte lui-
  // même - pour une cellule, plus simple, cf. attributeNestedPendingImages).
  async function resolveNativePdfContent(inlinedHtml, filename) {
    let content = await htmlToPdfContent(inlinedHtml, true);
    const hasToc = (content._tocBlocks || []).length > 0;
    const hasPendingImages = (content._pendingImages || []).length > 0;
    if (hasToc || hasPendingImages) {
      await new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename)).getBuffer(() => resolve()); });
      const headingPageNumbers = (content._headingBlocks || []).map(b => (b.positions && b.positions[0] && b.positions[0].pageNumber) || null);
      // Capturé AVANT de reconstruire : htmlToPdfContent recrée des objets
      // neufs, ces références deviendraient obsolètes ensuite.
      const resolvedAnchors = (content._pendingImages || []).map(p => {
        const aboveResolved = p.above && p.above.positions && p.above.positions[0];
        const belowResolved = p.below && p.below.positions && p.below.positions[0];
        const containerResolved = p.container && p.container.positions && p.container.positions[0];
        return {
          aboveTop: aboveResolved ? aboveResolved.top : null, abovePage: aboveResolved ? aboveResolved.pageNumber : null,
          belowTop: belowResolved ? belowResolved.top : null, belowPage: belowResolved ? belowResolved.pageNumber : null,
          containerTop: containerResolved ? containerResolved.top : null, containerTopPx: p.containerTopPx,
          // `containerLeft`/`containerLeftPx` : seules les images imbriquées
          // dans une cellule (cf. attributeNestedPendingImages) les posent -
          // pilote le calcul de X en cellule-relatif dans
          // resolveImageAbsolutePosition (cf. commentaire là-bas).
          containerLeft: containerResolved ? containerResolved.left : null, containerLeftPx: p.containerLeftPx,
          hadAbove: !!p.above, hadBelow: !!p.below,
          imgTopPx: p.imgTopPx, imgLeftPx: p.imgLeftPx, aboveTopPx: p.aboveTopPx, belowTopPx: p.belowTopPx,
        };
      });
      content = await htmlToPdfContent(inlinedHtml, true);
      (content._tocBlocks || []).forEach(tocBlock => {
        (tocBlock._pageNumberCells || []).forEach((cell, i) => { if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]); });
      });
      (content._pendingImages || []).forEach((p, i) => {
        const a = resolvedAnchors[i];
        p.image.absolutePosition = resolveImageAbsolutePosition(a);
        delete p.image._pendingImgNode;
        const layer = p.image._pendingLayer;
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
    // Filet de sécurité résiduel : `content._pendingImages` (fusionné plus
    // haut, top-level + imbriqué) couvre le cas normal, mais une image en
    // calque dont ni bracket ni container n'a pu être résolu (ex. cellule
    // dont le seul contenu est le groupe "inline" brut sans paragraphe hôte
    // mesurable) garderait sinon son `absolutePosition` PLACEHOLDER
    // ({x:0,y:0}, posée par pdfImageFromNode pour éviter de gonfler la
    // mesure du flux, cf. plus haut) indéfiniment - littéralement coincée au
    // coin supérieur gauche de la PAGE entière. Repli : aucune position
    // absolue du tout, rendue en flux normal à sa place - pas positionnée au
    // pixel près, mais au moins visible au bon endroit.
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

  async function buildNativePdfDocDefinition(resolvedHtml, filename) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    // Attend que Roboto (police de mesure, cf. css/roboto-fonts.css) soit
    // réellement chargée avant toute mesure de mise en page - sans ça, un
    // export lancé tôt (police pas encore appliquée) mesurerait sur une
    // police de repli aux métriques différentes, un delta de quelques
    // pixels qui peut suffire à faire basculer une ligne d'un côté ou
    // l'autre d'une frontière fine (ex. habillage de texte autour d'une
    // image, cf. floatedImageParagraphFrom) - jamais fait jusqu'ici dans ce
    // fichier, alors que la sensibilité aux polices y est un thème récurrent.
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* repli silencieux */ } }
    const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml);
    const content = await resolveNativePdfContent(inlinedHtml, filename);
    return buildNativeDocDefinition(content, filename);
  }
  async function exportNativePdf(resolvedHtml, filename) {
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename);
    window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf');
  }
  async function getNativePdfBlob(resolvedHtml, filename) {
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename);
    return new Promise((resolve, reject) => {
      try { window.pdfMake.createPdf(docDefinition).getBlob(resolve); } catch (e) { reject(e); }
    });
  }

  // Qualités raster (html2canvas) UNIQUEMENT - 'native' (vectoriel) et
  // 'browser-print' ont chacun leur propre chemin dédié ci-dessous et ne
  // consultent jamais QUALITY_PRESETS. Mêmes réglages que js/pdf-export.js
  // (V1) : 'low' = fichier compressé (JPEG dégradé + compression jsPDF),
  // 'ultra' = qualité maximale pour impression (PNG, échelle html2canvas 6).
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

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality) {
    if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; }
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    if (quality === 'browser-print') { await exportViaBrowserPrint(resolvedHtml, filename); return; }
    if (quality === 'low' || quality === 'ultra') {
      const { container, opt } = buildRasterContainerAndOptions(resolvedHtml, filename, quality);
      try { await window.html2pdf().set(opt).from(container).save(); } finally { document.body.removeChild(container); }
      return;
    }
    await exportNativePdf(resolvedHtml, filename);
  }

  return { exportCurrentRecord, getNativePdfBlob };
})();
