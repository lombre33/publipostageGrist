// Module export PDF : raster (historique) ou texte natif vectoriel (pdfmake).
const PdfExport = (function () {
  // Ces deux préréglages ne couvrent QUE les qualités raster (html2canvas) -
  // 'native' (vectoriel) et 'browser-print' ont chacun leur propre chemin
  // dédié (exportNativePdf/exportViaBrowserPrint) et ne consultent jamais
  // QUALITY_PRESETS. Réduits à 2 choix clairs (au lieu de 3 raster + 1
  // vectoriel + 1 impression navigateur mal différenciés) : 'low' pour un
  // fichier léger (compression jsPDF activée, qualité JPEG réellement
  // dégradée - l'ancien "standard" gardait quality:0.98, ce qui n'avait de
  // "standard" que le nom, jamais de fichier significativement plus petit),
  // 'ultra' pour l'impression (reprend l'ancien "print", déjà la meilleure
  // qualité raster disponible).
  const QUALITY_PRESETS = {
    low: { label: 'Basse qualité (compressé)', image: { type: 'jpeg', quality: 0.6 }, html2canvas: { scale: 1.5 }, jsPDF: { compress: true } },
    ultra: { label: 'Ultra HD (impression)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } }
  };
  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.low; }
  const PX_TO_PT = 72 / 96;
  // Taille de police par défaut du PDF pour tout texte sans taille inline
  // explicite : DOIT correspondre à la taille réellement rendue par défaut
  // dans l'éditeur (.ql-editor { font-size: 14px }), convertie via PX_TO_PT
  // (14 × 0.75 = 10.5pt) — c'était fixé à 11pt (une taille "standard" pour du
  // texte imprimé, mais qui ne correspond à rien de mesuré dans l'éditeur).
  // Cet écart de taille de police, combiné à LINE_HEIGHT_RATIO (qui scale
  // proportionnellement à la taille de police), se cumulait sur toute la
  // hauteur d'un paragraphe : vérifié sur un paragraphe de 8 lignes, l'écart
  // avec 11pt atteignait ~5.7pt (~2mm) entre la dernière ligne du texte et le
  // bas d'une image "derrière le texte" dimensionnée sur la hauteur mesurée
  // dans l'éditeur — largement suffisant pour laisser la dernière ligne
  // visible hors de l'image. Avec 10.5pt, ce même test tombe pile.
  const DEFAULT_FONT_SIZE = 10.5;
  // Correctif interligne : pdfmake espace ses lignes de texte plus serré que
  // le rendu navigateur par défaut, ce qui fait qu'un paragraphe de N lignes
  // occupe moins de hauteur dans le PDF que dans l'éditeur — une image
  // "derrière le texte" dimensionnée pour couvrir tout le paragraphe (mesures
  // éditeur) ne recouvre alors plus la ou les dernières lignes à l'export.
  //
  // EDITOR_LINE_HEIGHT_RATIO = interligne / taille de police mesuré en live
  // sur .ql-editor (14px de police, 19.88px d'interligne réel via
  // getComputedStyle ⇒ 19.88/14 ≈ 1.42).
  //
  // La propriété `lineHeight` de pdfmake n'est PAS un multiplicateur de la
  // taille de police : c'est un multiplicateur de l'interligne *par défaut*
  // de la police pdfmake elle-même (Roboto), qui a son propre ratio naturel
  // — mesuré empiriquement à 12.890625pt d'interligne pour 11pt de police,
  // soit un PDFMAKE_DEFAULT_LINE_RATIO ≈ 1.171875. Passer directement 1.42 à
  // `lineHeight` revient donc à cumuler les deux ratios (1.42 × 1.172 ≈ 1.66),
  // ce qui sur-corrige et rend les lignes du PDF plus hautes que dans
  // l'éditeur (vérifié : positions de lignes espacées de 18.3pt au lieu des
  // ~15.6pt attendus). Diviser par PDFMAKE_DEFAULT_LINE_RATIO annule ce ratio
  // natif avant d'appliquer le nôtre, pour obtenir un interligne final
  // réellement proportionnel à EDITOR_LINE_HEIGHT_RATIO quelle que soit la
  // taille de police du run pdfmake concerné (vérifié : 15.62pt = 11 × 1.42).
  const EDITOR_LINE_HEIGHT_RATIO = 1.42;
  const PDFMAKE_DEFAULT_LINE_RATIO = 1.171875;
  const LINE_HEIGHT_RATIO = EDITOR_LINE_HEIGHT_RATIO / PDFMAKE_DEFAULT_LINE_RATIO;
  const HEADING_SIZES = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 };
  function cssSize(value, fallback) { const n = parseFloat(value); return Number.isFinite(n) ? Math.max(6, Math.min(72, n * (value && String(value).endsWith('px') ? PX_TO_PT : 1))) : fallback; }
  function alignment(node) { const cls = node.classList || { contains: () => false }; if (cls.contains('ql-align-center')) return 'center'; if (cls.contains('ql-align-right')) return 'right'; if (cls.contains('ql-align-justify')) return 'justify'; const style = (node.getAttribute && node.getAttribute('style')) || ''; const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i); if (match) return match[1].toLowerCase(); const align = (node.getAttribute && node.getAttribute('align')) || ''; const alignLower = align.toLowerCase(); if (alignLower === 'center' || alignLower === 'right' || alignLower === 'justify' || alignLower === 'left') return alignLower; return undefined; }
  // Table HTML5 legacy <font size="N"> : taille ABSOLUE (indépendante du
  // contexte, contrairement aux classes ql-size-* relatives à la taille
  // parente) - mesurée en live sur .editable-table (getComputedStyle), pas
  // devinée depuis la spec HTML (qui ne garantit pas ces valeurs px exactes).
  const FONT_TAG_SIZE_PX = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };
  // Classes ql-size-* : RELATIVES (em) à la taille de police courante (0.75 /
  // 1.5 / 2.5, mesuré en live sur .ql-editor) - contrairement à <font size>.
  const QL_SIZE_RATIO = { 'ql-size-small': 0.75, 'ql-size-large': 1.5, 'ql-size-huge': 2.5 };
  // Convertit une couleur CSS (rgb()/rgba(), hex déjà valide, ou nom CSS) en
  // une valeur que pdfmake/PDFKit accepte directement (hex ou nom CSS - il ne
  // comprend PAS la syntaxe fonctionnelle rgb()/rgba() que Quill/le collage
  // Word/Gmail produisent pour color/background-color).
  function cssColorToHex(value) {
    if (!value) return null;
    const v = value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return '#' + [1, 2, 3].map(i => Math.max(0, Math.min(255, parseInt(m[i], 10))).toString(16).padStart(2, '0')).join('');
    return v;
  }
  // Quill ne pose lui-même AUCUNE couleur sur <a> (seulement text-decoration:
  // underline, cf. .ql-snow .ql-editor a) - le bleu #0066cc vient du style
  // par défaut du NAVIGATEUR pour un lien (mesuré en live : rgb(0,102,204)),
  // qu'il faut donc reproduire explicitement ici (pdfmake ne connaît rien du
  // rendu par défaut d'un <a>, contrairement au navigateur).
  const LINK_DEFAULT_COLOR = '#0066cc';
  // Police web-safe choisie (picker "Police", cf. editor.js) -> nom de police
  // pdfmake réellement embarquée (cf. pdf-fonts-extra.js) qui la remplace :
  // pdfmake ne peut jamais utiliser une police du système, contrairement au
  // navigateur - Arial/Times New Roman/Calibri sont des polices commerciales
  // non redistribuables ici, remplacées par un équivalent libre à MÉTRIQUE
  // IDENTIQUE (mêmes largeurs de caractères, donc même mise en page - formes
  // de lettres légèrement différentes), même principe que LibreOffice/Google
  // Docs. Clé en minuscules : la comparaison normalise la casse.
  const FONT_FAMILY_MAP = {
    'arial': 'Arimo',
    'helvetica': 'Arimo',
    'times new roman': 'Tinos',
    'times': 'Tinos',
    'georgia': 'Gelasio',
    'courier new': 'Cousine',
    'courier': 'Cousine',
    'calibri': 'Carlito',
  };
  // `value` peut être une pile CSS ("Arial, Helvetica, sans-serif" ou
  // "'Times New Roman', Times, serif") - seul le PREMIER nom compte (celui
  // réellement choisi dans le picker), les suivants ne sont que des repli
  // navigateur sans objet ici (la police est de toute façon substituée).
  function pdfFontFor(value) {
    if (!value) return null;
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    return FONT_FAMILY_MAP[first] || null;
  }
  function addDecoration(out, name) { const list = Array.isArray(out.decoration) ? out.decoration.slice() : (out.decoration ? [out.decoration] : []); if (list.indexOf(name) === -1) list.push(name); out.decoration = list; }
  function inheritedStyle(node, parent) { const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : ''; const css = name => { const m = style.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); }; const tag = node.nodeType === 1 ? node.tagName : ''; const cls = node.nodeType === 1 ? (node.classList || { contains: () => false }) : { contains: () => false }; const out = Object.assign({}, parent); if (/^H[1-6]$/.test(tag)) { out.bold = true; out.fontSize = HEADING_SIZES[tag]; } if (tag === 'STRONG' || tag === 'B') out.bold = true; if (tag === 'EM' || tag === 'I') out.italics = true; if (tag === 'U') addDecoration(out, 'underline'); if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') addDecoration(out, 'lineThrough'); if (tag === 'SUP') out.sup = true; if (tag === 'SUB') out.sub = true; if (tag === 'A' && node.getAttribute('href')) { out.link = node.getAttribute('href'); out.color = LINK_DEFAULT_COLOR; addDecoration(out, 'underline'); } if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true; if (css('font-style') === 'italic') out.italics = true; if (css('text-decoration')) { if (/underline/i.test(css('text-decoration'))) addDecoration(out, 'underline'); if (/line-through/i.test(css('text-decoration'))) addDecoration(out, 'lineThrough'); } if (css('color')) out.color = cssColorToHex(css('color')); if (css('background-color')) out.background = cssColorToHex(css('background-color')); Object.keys(QL_SIZE_RATIO).forEach(name => { if (cls.contains(name)) out.fontSize = Math.max(6, Math.min(72, (parent && parent.fontSize || DEFAULT_FONT_SIZE) * QL_SIZE_RATIO[name])); }); if (css('font-size')) out.fontSize = cssSize(css('font-size'), DEFAULT_FONT_SIZE); if (tag === 'FONT' && node.getAttribute('size') && FONT_TAG_SIZE_PX[node.getAttribute('size')]) out.fontSize = Math.max(6, Math.min(72, FONT_TAG_SIZE_PX[node.getAttribute('size')] * PX_TO_PT)); const fontFamilyValue = css('font-family') || (tag === 'FONT' ? node.getAttribute('face') : null); const legacyFontClass = cls.contains('ql-font-serif') ? 'Tinos' : cls.contains('ql-font-monospace') ? 'Cousine' : null; const pdfFont = pdfFontFor(fontFamilyValue) || legacyFontClass; if (pdfFont) out.font = pdfFont; return out; }
  // IMPORTANT : ne retourne jamais d'image dans ce tableau de "runs" — un objet
  // { image: ... } glissé dans un tableau assigné à la propriété `text` d'un
  // bloc pdfmake n'est PAS une syntaxe valide (`text` attend des runs de texte
  // uniquement) : pdfmake ne plante pas, il ignore juste l'entrée en silence.
  // C'était le vrai bug derrière "aucune image dans le PDF vectoriel" — ni CORS
  // ni SVG (déjà corrigés par ailleurs) n'y étaient pour quelque chose : une
  // image atteignant bien inlineRuns() était de toute façon perdue ensuite. Les
  // images rencontrées sont donc accumulées à part (floatingImages) pour être
  // ajoutées par l'appelant comme blocs de contenu indépendants.
  const PAGE_MARGIN_PT = 28; // doit matcher pageMargins dans exportNativePdf
  // Largeur de contenu PDF (page A4 moins les deux marges), en px éditeur —
  // référence commune pour toute mesure DOM offscreen destinée à imiter la
  // largeur réellement disponible dans le PDF (cf. CONTENT_WIDTH_PX ci-dessous
  // et twoColumnsFrom, qui l'utilisait déjà en calcul local avant extraction).
  const CONTENT_WIDTH_PX = (595.28 - 2 * PAGE_MARGIN_PT) / PX_TO_PT;
  // Indentation horizontale RÉELLE d'un bloc (liste à puces/numérotée, citation,
  // paragraphe indenté via ql-indent-N...) : plutôt que deviner/coder en dur une
  // valeur par type de bloc (fragile, cf. les 3 tentatives ratées sur la largeur
  // des colonnes plus bas dans ce fichier), on MESURE le rendu réel de `node`
  // dans un hôte hors-écran portant la classe .ql-editor (pour hériter les
  // règles CSS de Quill scopées par cette classe : padding des listes,
  // bordure+padding des citations, padding em-based des ql-indent-N...) à la
  // largeur de contenu du PDF. `node` doit être un enfant, direct ou non, du
  // conteneur passé (voir attachMeasureHost) au moment de l'appel.
  //
  // Deux modes :
  // - 'box' (utilisé pour LI) : le bord GAUCHE de la boîte du bloc lui-même,
  //   c'est-à-dire l'indentation apportée par le <ul>/<ol> ANCÊTRE - pdf-export.js
  //   ajoute lui-même un "• "/numéro en tête du texte pour imiter le marqueur de
  //   Quill (posé via ::before, invisible pour un Range JS), donc mesurer le
  //   bord de la boîte (pas le texte) évite de compter deux fois cette marque.
  // - 'text' (utilisé pour tout le reste : paragraphe/titre/citation, avec ou
  //   sans ql-indent-N) : la position du tout premier caractère de texte RENDU,
  //   via un Range JS - capture aussi bien un retrait posé sur un ANCÊTRE
  //   (comme 'box') qu'un padding/bordure posé sur l'élément LUI-MÊME (cas de
  //   <blockquote>, padding-left + border-left Quill, invisible à une mesure
  //   par simple getBoundingClientRect().left qui ne regarde que le bord de la
  //   boîte).
  function measureIndentPt(node, mode) {
    const host = node.closest('.pdf-measure-host');
    if (!host) return 0;
    const hostLeft = host.getBoundingClientRect().left;
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      const textNode = walker.nextNode();
      if (!textNode) return 0;
      // Un bloc centré/aligné à droite pousse son texte loin du bord gauche du
      // large hôte de mesure (largeur de page entière) - ce n'est PAS un retrait
      // (padding/liste/citation), juste l'alignement. Neutraliser temporairement
      // l'alignement du bloc pendant la mesure (le style inline gagne quelle que
      // soit la source réelle : classe ql-align-*, style, ou attribut HTML
      // legacy align="...") pour isoler le VRAI retrait, sinon un simple
      // <p style="text-align:right"> mesurait un retrait de plusieurs centaines
      // de points - largement de quoi faire passer le texte entier hors de la
      // largeur de page restante et le forcer à couper un caractère par ligne.
      const previousAlign = node.style.textAlign;
      node.style.textAlign = 'left';
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 1);
      leftPx = range.getBoundingClientRect().left;
      node.style.textAlign = previousAlign;
    }
    return Math.round(Math.max(0, (leftPx - hostLeft) * PX_TO_PT) * 100) / 100;
  }
  // Attache `root` (le conteneur détaché construit par htmlToPdfContent à partir
  // du HTML source) à document.body, hors-écran, avec la classe .ql-editor et
  // la largeur de contenu du PDF - condition nécessaire pour que measureIndentPt
  // (et tout futur besoin de mesure DOM réelle sur ce contenu) lise des valeurs
  // CSS calculées identiques à celles de l'éditeur réel. Retourne une fonction
  // de nettoyage à appeler une fois le parcours terminé (toujours, y compris en
  // cas d'erreur : cf. le try/finally de l'appelant).
  function attachMeasureHost(root) {
    root.classList.add('pdf-measure-host', 'ql-editor');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + CONTENT_WIDTH_PX + 'px; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }
  // left/top d'une image en calque (editor.js:setImageLayer) sont capturés
  // relatifs au bord EXTÉRIEUR de .ql-editor (getBoundingClientRect, qui
  // inclut son propre padding CSS comme espace intérieur) — pas relatifs à
  // l'endroit où le texte commence réellement à s'afficher. Ce padding
  // (12/15px par défaut, 37px en mode "Aperçu format A4", volontairement
  // choisi pour imiter visuellement la marge de la page PDF) doit donc être
  // RETRANCHÉ avant d'ajouter PAGE_MARGIN_PT, sans quoi les deux marges se
  // cumulent : une image callée bord à bord avec le texte se retrouvait
  // décalée d'un plein padding éditeur vers la droite ET vers le bas dans le
  // PDF (vérifié : padding 37px → x/y PDF à 55.75pt au lieu de 28/30pt, soit
  // ~1cm d'écart dans les deux sens — plus visible horizontalement dans un
  // document réel car le décalage vertical peut se confondre avec la dérive
  // cumulative des marges de paragraphes qui précèdent l'image).
  function getEditorPaddingPx() {
    const editorEl = document.querySelector('.ql-editor');
    if (!editorEl) return { left: 0, top: 0 };
    const cs = getComputedStyle(editorEl);
    return { left: parseFloat(cs.paddingLeft) || 0, top: parseFloat(cs.paddingTop) || 0 };
  }
  // Construit le bloc image pdfmake à partir d'un <img class="editor-image"> déjà
  // en data URI, en px->pt standard (PX_TO_PT) dans TOUS les cas — y compris pour
  // la position absolue des images en calque devant/derrière.
  //
  // Historique : la position d'une image en calque avait d'abord été mise à
  // l'échelle au prorata de la largeur de l'éditeur (data-ref-width) vers la
  // largeur de contenu de la page PDF, en supposant que "X% de la largeur de
  // l'éditeur" correspondrait à "X% de la largeur de la page". FAUX : le reste
  // du document (texte, tableaux) n'est PAS mis à l'échelle de cette façon — sa
  // position verticale résulte du moteur de mise en page de pdfmake, qui calcule
  // la hauteur des lignes à partir de tailles de police en pt (PX_TO_PT partout
  // ailleurs dans ce fichier), sans aucun rapport avec la largeur de l'éditeur.
  // Pire : l'éditeur (souvent large, ex. 965px) et la page PDF (largeur de
  // contenu fixe, ~719px équivalents) ne font PAS retomber le texte aux mêmes
  // endroits, puisque le nombre de mots par ligne diffère selon la largeur
  // disponible — un simple ratio de largeur ne peut donc jamais aligner
  // parfaitement une position "en calque" avec le texte qui l'entoure. Utiliser
  // PX_TO_PT partout (la même base que tout le reste du document) rapproche
  // nettement le résultat sans prétendre à une fidélité pixel-perfect : cette
  // dernière est structurellement hors de portée tant que l'éditeur et la page
  // PDF n'ont pas la même largeur de habillage du texte.
  // Une image insérée par les outils de l'éditeur porte TOUJOURS sa taille en
  // style inline (node.style.width/height, cf. editor.js). Une <img> tapée à
  // la main (onglet Code HTML) n'a souvent que les attributs HTML width/height
  // (ou aucun des deux) - repli sur ceux-ci, puis sur une largeur par défaut
  // raisonnable, plutôt que de dégénérer sur une image minuscule (15pt, le
  // plancher ci-dessous) ou de planter sur parseFloat(undefined).
  function pdfImageFromNode(node) {
    const widthPx = parseFloat(node.style.width) || parseFloat(node.getAttribute('width')) || 320;
    const heightPx = parseFloat(node.style.height) || parseFloat(node.getAttribute('height')) || null;
    const image = { image: node.getAttribute('src'), opacity: Math.max(0, Math.min(1, parseFloat(node.style.opacity) || 1)), margin: [0, 2, 0, 4] };
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (heightPx) image.height = Math.max(10, heightPx * PX_TO_PT);
    if (node.style.position === 'absolute') {
      // Si l'image porte data-anchor-off-left/above-*/below-*
      // (editor.js:updateAnchorOffset), sa position a été mesurée en direct
      // par rapport aux paragraphes qui l'ENCADRENT (le dernier qui finit
      // avant elle, le premier qui commence après) - pas par rapport à un
      // paragraphe unique "le plus proche", ni au haut de l'éditeur. On
      // résout alors sa position finale (cf. resolveAnchoredImagePositions)
      // par INTERPOLATION entre les positions RÉELLEMENT calculées par
      // pdfmake pour ces deux repères, après une 1ère passe de mesure - exact
      // quel que soit ce qui se trouve entre les deux (texte, zone 2-colonnes,
      // tableau...), sans avoir à choisir "LE" bon paragraphe ni à calibrer
      // chaque type de bloc séparément. Fallback (image sans aucun repère, ou
      // dans un tableau/zone à 2 colonnes non couverts par ce mécanisme) :
      // ancien calcul, marge de page + padding éditeur retranché.
      const anchorLeft = node.dataset.anchorOffLeft;
      const aboveId = node.dataset.anchorAboveId;
      const belowId = node.dataset.anchorBelowId;
      if (anchorLeft !== undefined && (aboveId || belowId)) {
        image._pendingOffset = {
          left: parseFloat(anchorLeft) || 0,
          top: node.dataset.anchorAboveOffTop !== undefined ? (parseFloat(node.dataset.anchorAboveOffTop) || 0) : undefined,
          topBelow: node.dataset.anchorBelowOffTop !== undefined ? (parseFloat(node.dataset.anchorBelowOffTop) || 0) : undefined,
        };
        // Résolus après coup (cf. htmlToPdfContent) : les blocs-ancres référencés
        // par ces identifiants peuvent être n'importe où dans le document,
        // traités avant OU après cette image dans le parcours DOM.
        image._anchorAboveId = aboveId || null;
        image._anchorBelowId = belowId || null;
        // Repli "zone" (editor.js:updateAnchorOffset) : aucun paragraphe
        // voisin trouvé DANS la colonne (cas fréquent, une colonne = souvent
        // un seul <p> que l'image recouvre) - anchorAboveId pointe alors sur
        // la ZONE elle-même, dont le containerLeft "par défaut" ne convient
        // à AUCUNE colonne (cf. resolveAnchoredImagePositions, qui pioche
        // dans anchor.columnOrigins[côté] à la place quand ce marqueur est
        // présent).
        image._columnSide = node.dataset.anchorColumnSide || null;
        image.absolutePosition = { x: 0, y: 0 }; // provisoire, résolu après la 1ère passe de mise en page
      } else {
        const leftPx = parseFloat(node.style.left) || 0;
        const topPx = parseFloat(node.style.top) || 0;
        const pad = getEditorPaddingPx();
        image.absolutePosition = { x: PAGE_MARGIN_PT + (leftPx - pad.left) * PX_TO_PT, y: PAGE_MARGIN_PT + (topPx - pad.top) * PX_TO_PT };
      }
      delete image.margin;
    } else {
      const align = node.dataset.align;
      if (align === 'center' || align === 'right') image.alignment = align;
    }
    // Marqueur temporaire, retiré par l'appelant : permet de faire peindre les
    // images "derrière" avant tout le reste du document et celles "devant"
    // après tout le reste, pour approcher au mieux la superposition réelle vue
    // dans l'éditeur (pdfmake peint son content[] dans l'ordre, sans notion de
    // z-index — le seul levier disponible est l'ordre d'insertion).
    if (node.style.position === 'absolute' && (node.dataset.layer === 'front' || node.dataset.layer === 'behind')) {
      image._layer = node.dataset.layer;
    }
    return image;
  }
  function inlineRuns(node, parentStyle, floatingImages) { const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE }); if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ text: node.nodeValue, ...style }] : []; if (node.nodeType !== Node.ELEMENT_NODE) return []; if (node.classList.contains('page-break-marker')) return []; if (node.classList.contains('two-columns-marker')) return []; if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }]; if (node.tagName === 'IMG') { if (floatingImages && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) { floatingImages.push(pdfImageFromNode(node)); } return []; } if (node.tagName === 'BR') return [{ text: '\n', ...style }]; let runs = []; let sawLineBlock = false; node.childNodes.forEach(child => { const isLineBlock = child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6])$/.test(child.tagName); if (isLineBlock && sawLineBlock) runs.push({ text: '\n', ...style }); if (isLineBlock) sawLineBlock = true; runs = runs.concat(inlineRuns(child, style, floatingImages)); }); return runs; }
  // Comme inlineRuns(node, ...), mais ignore les enfants <ul>/<ol> DIRECTS - une
  // sous-liste imbriquée (execCommand 'indent' dans une cellule/colonne 2-colonnes,
  // seul contexte où une VRAIE liste imbriquée peut apparaître : Quill lui-même
  // n'imbrique jamais, cf. listMarkerFor) doit produire SES PROPRES blocs (un par
  // <li>, avec sa propre indentation mesurée), pas être aplatie dans le texte du
  // <li> parent - cf. appelants (blockFrom pour un <li> de premier niveau,
  // cellLineToPdfObject pour une cellule de tableau).
  function inlineRunsExcludingNestedLists(node, parentStyle, floatingImages) {
    const style = inheritedStyle(node, parentStyle);
    let runs = [];
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) return;
      runs = runs.concat(inlineRuns(child, style, floatingImages));
    });
    return runs;
  }
  // Marqueur (puce/numéro) d'un <li>, mesuré/calculé selon son origine :
  // - Liste native Quill (attribut data-list, posée par le format 'list' du
  //   toolbar - TOUJOURS à plat, sur des <li> SIBLINGS avec classes ql-indent-N,
  //   jamais de vraie imbrication <ol><li><ol>) : le texte du marqueur (puce,
  //   ou numéro/lettre/romain selon le niveau ql-indent-N) est entièrement piloté
  //   par les compteurs CSS de Quill (::before, cf. quill.snow.css) - le MESURER
  //   en direct sur le DOM réel (déjà attaché à .pdf-measure-host, qui préserve
  //   l'ordre des <li> siblings et donc l'état réel des compteurs CSS) est plus
  //   fiable que réimplémenter ce mécanisme de compteurs à la main, et garantit
  //   un texte de marqueur pixel-perfect quel que soit le niveau d'imbrication.
  // - Liste native du navigateur (execCommand insertOrderedList/insertUnorderedList,
  //   cellule de tableau ou colonne 2-colonnes - jamais de data-list ici) : une
  //   VRAIE balise <ol>/<ul> avec de VRAIS <li> enfants ; puce fixe pour <ul>,
  //   numéro calculé par position pour <ol> (respecte l'attribut start éventuel).
  function listMarkerFor(node) {
    if (node.hasAttribute('data-list')) {
      try {
        const raw = getComputedStyle(node, '::before').content;
        if (raw && raw !== 'none' && raw !== 'normal') {
          const stripped = raw.replace(/^["']|["']$/g, '').trim();
          if (stripped) return stripped + ' ';
        }
      } catch (e) { /* repli ci-dessous */ }
      return node.getAttribute('data-list') === 'ordered' ? '1. ' : '• ';
    }
    const parent = node.parentElement;
    if (parent && parent.tagName === 'OL') {
      const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
      const start = parseInt(parent.getAttribute('start') || '1', 10) || 1;
      const idx = items.indexOf(node);
      return (start + (idx === -1 ? 0 : idx)) + '. ';
    }
    return '• ';
  }
  // Marqueur de numérotation d'un titre (H1-H6), mesuré EXACTEMENT comme
  // listMarkerFor ci-dessus : Quill/l'éditeur pilote l'affichage "1) "/"a) "/
  // "I) " uniquement via un compteur CSS (::before, cf. style.css et
  // editor.js:syncHeadingNumberingDataset qui pose data-heading-style sur la
  // racine) - le mesurer en direct sur le DOM réellement attaché (cf.
  // attachMeasureHost/htmlToPdfContent, qui pose ce même attribut sur la
  // racine hors-écran) reproduit fidèlement n'importe quel style choisi sans
  // dupliquer la logique de compteurs CSS (numérique/alpha/romain, par
  // niveau) à la main en JS.
  function headingMarkerFor(node) {
    try {
      const raw = getComputedStyle(node, '::before').content;
      if (raw && raw !== 'none' && raw !== 'normal') {
        const stripped = raw.replace(/^["']|["']$/g, '').trim();
        if (stripped) return stripped + ' ';
      }
    } catch (e) { /* pas de numérotation configurée pour ce document */ }
    return '';
  }
  // Construit le contenu pdfmake d'un sommaire à partir des blocs-titre déjà
  // rencontrés (headingBlocks, cf. buildPdfContentFromRoot) - texte et niveau
  // toujours connus dès cet appel, mais PAS le numéro de page (dépend d'une
  // 1ère passe de mise en page, cf. resolveNativePdfContent) : chaque entrée
  // réserve sa propre cellule de droite VIDE (largeur fixe, alignée à droite)
  // dont la référence est renvoyée dans pageNumberCells pour être patchée
  // après coup - sans changer la hauteur du sommaire entre les deux passes.
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
  // IMG inclus depuis le correctif "HTML personnalisé" (onglet Code HTML,
  // cf. js/html-source-tab.js) : une image produite par l'éditeur vit
  // TOUJOURS à l'intérieur d'un <p>/<div> (Quill l'insère comme embed DANS la
  // ligne courante), donc jamais rencontrée directement ici (blockFrom la
  // consomme déjà via inlineRuns pendant le traitement de son <p> parent) -
  // mais une <img> tapée à la main peut parfaitement être un enfant DIRECT de
  // la racine, sans aucun wrapper. Sans IMG ici, un tel noeud ne correspond à
  // AUCUN cas de visit() (ni bloc, ni classe spéciale) et retombe sur
  // `node.childNodes.forEach(visit)` - qui n'itère JAMAIS puisqu'une <img> n'a
  // pas d'enfants : l'image disparaissait silencieusement, jamais transmise à
  // inlineRuns/pdfImageFromNode.
  function isBlock(node) { return node.nodeType === Node.ELEMENT_NODE && (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TABLE|HR|IMG)$/i.test(node.tagName)); }
  // Repli de robustesse (cf. buildPdfContentFromRoot) : un noeud dont la
  // construction pdfmake (blockFrom/tableFrom/twoColumnsFrom) lève une
  // exception - structure inattendue, notamment du HTML tapé à la main dans
  // l'onglet Code HTML (mode avancé, cf. html-source-tab.js) qui ne suit pas
  // les conventions exactes de l'éditeur - dégrade EN TEXTE BRUT plutôt que
  // d'annuler tout l'export : mieux vaut un contenu incomplet/mal formaté
  // qu'un PDF qui ne se génère pas du tout.
  function fallbackTextBlock(node, pageBreakBefore) {
    const text = ((node && node.textContent) || '').trim();
    return { text: text || ' ', margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pageBreakBefore ? { pageBreak: 'before' } : {}) };
  }
  // Le navigateur COLLAPSE (masque) les espaces/retours à la ligne en tout
  // début/fin du contenu rendu d'un bloc (règles CSS standard de fusion des
  // blancs) — pdfmake, lui, prend le texte tel quel. Un cas concret et
  // fréquent : un paragraphe "<img> Lorem ipsum..." (espace tapée après une
  // image insérée en début de ligne) affiche "Lorem ipsum" sans décalage dans
  // l'éditeur (l'image ne compte plus une fois sortie du flux en calque, et
  // l'espace qui suit est de toute façon collapsée), mais cette même espace,
  // conservée telle quelle par pdfmake, s'ajoute au texte centré/justifié et
  // se traduit par un décalage visible façon "alinéa" en tête de paragraphe.
  // On ne trime PAS les espaces insécables ( ) : celles-ci sont un choix
  // délibéré de mise en forme (indentation manuelle), pas un artefact HTML.
  function trimEdgeWhitespace(runs) {
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[0].text)) runs.shift();
    if (runs.length) runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^[ \t\n\r\f\v]+/, '') });
    while (runs.length && !/[^ \t\n\r\f\v]/.test(runs[runs.length - 1].text)) runs.pop();
    if (runs.length) { const last = runs.length - 1; runs[last] = Object.assign({}, runs[last], { text: runs[last].text.replace(/[ \t\n\r\f\v]+$/, '') }); }
    return runs;
  }
  // Découpe les enfants DIRECTS d'une cellule/sous-liste en "lignes" pdfmake,
  // accumulées dans `lines` : un <p>/<div>/<h1-6> direct est sa propre ligne
  // (porte sa propre alignment, cf. cellLineToPdfObject) ; un <ul>/<ol> DIRECT
  // ajoute une ligne par <li> (récursif pour toute sous-liste imbriquée) ;
  // tout le RESTE (texte flottant, <br>, <b>/<i>/<span>...) - la frappe libre
  // dans une cellule ne passe pas forcément par un <p>/<div> par ligne comme
  // Quill le ferait - s'accumule dans un groupe "inline" commun, flush comme
  // sa propre ligne dès qu'un bloc/une liste l'interrompt. Un texte "4<br><br>"
  // AVANT un <div align="..."> reste ainsi une ligne à part (via inlineRuns,
  // qui convertit lui-même <br> en "\n" - les lignes vides sont donc
  // préservées), sans faire disparaître l'alignement du <div> qui suit : cf.
  // le bug signalé où ce dernier n'était lu que sur la CELLULE elle-même
  // (jamais alignée), la détection précédente exigeant que TOUS les enfants
  // directs soient des blocs pour même chercher l'alignement par ligne.
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
      pending.push(node); // <br>, <b>/<i>/<span>/.var-badge... : reste dans le flux inline courant
    });
    flushPending();
  }
  // `line` est soit un noeud réel (P/DIV/H1-6/LI), soit { inline: [...] } (un
  // groupe de texte flottant sans bloc dédié, cf. collectCellLines) - `cellAlign`
  // (alignment posée sur la CELLULE elle-même, éventuel repli quand aucune
  // sélection valide n'était capturée à l'origine, cf. editor.js
  // applyGranularAlignment) sert de repli pour toute ligne qui n'a PAS sa
  // propre alignment explicite - jamais pour en écraser une qui existe déjà.
  function cellLineToPdfObject(line, cellAlign, cellBaseStyle) {
    if (line.inline) {
      let runs = [];
      line.inline.forEach(n => { runs = runs.concat(inlineRuns(n, cellBaseStyle)); });
      runs = trimEdgeWhitespace(runs);
      const obj = { text: runs.length ? runs : ' ' };
      if (cellAlign) obj.alignment = cellAlign;
      return obj;
    }
    const node = line;
    const isLi = node.tagName === 'LI';
    const marker = isLi ? listMarkerFor(node) : '';
    const runs = trimEdgeWhitespace(isLi
      ? inlineRunsExcludingNestedLists(node, cellBaseStyle)
      : inlineRuns(node, cellBaseStyle));
    const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
    const obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, 0, 0] };
    const align = alignment(node) || cellAlign; if (align) obj.alignment = align;
    return obj;
  }
  // Une cellule multi-lignes (plusieurs <p>/<div>/<h1-6>/<li>, ou un mélange
  // de texte brut et de blocs alignés - cf. collectCellLines) peut avoir une
  // ligne alignée différemment des autres (même mécanisme execCommand
  // par-sélection que pour une colonne 2-colonnes, cf. editor.js) - un simple
  // inlineRuns(cell) aplatit tout dans UN SEUL tableau de texte avec UNE
  // SEULE alignment (celle de la cellule), perdant l'alignement par ligne ET
  // tout marqueur de liste. On construit donc un stack d'une ligne pdfmake
  // par ligne dès qu'il y en a plusieurs - sinon (cas courant, un seul groupe
  // de texte flottant sans aucun bloc dédié) on garde le texte à plat, sans
  // le surcoût d'un stack.
  function cellContentFrom(cell) {
    const lines = [];
    collectCellLines(cell, lines);
    if (!lines.length) return { text: ' ' };
    if (lines.length === 1 && lines[0].inline) {
      const runs = trimEdgeWhitespace(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }));
      return { text: runs.length ? runs : ' ' };
    }
    const cellAlign = alignment(cell);
    const cellBaseStyle = inheritedStyle(cell, { fontSize: DEFAULT_FONT_SIZE });
    return { stack: lines.map(line => cellLineToPdfObject(line, cellAlign, cellBaseStyle)) };
  }
  function tableFrom(node, pageBreakBefore) {
    const rows = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    const rawRows = rows.length ? rows : Array.from(node.querySelectorAll('tr'));
    const cellsOf = row => Array.from(row.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName));
    const columnCount = Math.max(1, ...rawRows.map(row => cellsOf(row).reduce((sum, cell) => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      return sum + span;
    }, 0)));
    const body = rawRows.map(row => {
      const output = [];
      cellsOf(row).forEach(cell => {
        const colSpan = Math.min(columnCount - output.length, Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1));
        let content;
        try { content = cellContentFrom(cell); }
        catch (e) { console.warn('[PdfExport] cellule de tableau ignorée (structure inattendue), repli en texte brut :', e); content = { text: (cell.textContent || '').trim() || ' ' }; }
        const pdfCell = Object.assign({ margin: [4, 3, 4, 3], border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
        if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
        if (colSpan > 1) pdfCell.colSpan = colSpan;
        output.push(pdfCell);
        for (let i = 1; i < colSpan; i += 1) output.push({});
      });
      while (output.length < columnCount) output.push({ text: ' ', margin: [4, 3, 4, 3], border: [true, true, true, true] });
      return output.slice(0, columnCount);
    });
    // Largeurs de colonnes RÉELLES (glissées via la poignée de redimensionnement,
    // cf. editor.js:resizeTableColumn, qui écrit un pourcentage sur chaque
    // <col> du <colgroup>) plutôt que toujours diviser la largeur disponible
    // à parts égales - sans quoi tout redimensionnement de colonne fait dans
    // l'éditeur était invisible à l'export (confirmé par retour utilisateur
    // une fois la poignée elle-même réparée : ni la largeur ni la mise en
    // forme du texte - qui se répartit différemment selon la largeur réelle
    // de sa colonne - n'étaient respectées).
    const availableWidthPt = 595.28 - 56;
    const minColWidthPt = 12;
    // pdfmake ajoute paddingLeft+paddingRight (cf. `layout` plus bas, 4+4=8pt)
    // À CHAQUE colonne EN PLUS de la valeur qu'on lui donne dans `widths` -
    // une valeur explicite dans `widths` est donc la largeur du CONTENU, pas
    // la largeur totale rendue de la colonne. Vérifié en décodant le flux PDF
    // réellement généré : chaque colonne sortait exactement 8.5pt plus large
    // que prévu (8pt de padding + ~0.5pt de bordure), un tableau de 4 colonnes
    // débordant ainsi de 34pt à droite de la page malgré des `widths` sommant
    // pourtant exactement à la largeur disponible. Il faut donc retirer cet
    // encombrement AVANT de répartir la largeur disponible, pour qu'une fois
    // le padding rajouté par pdfmake, le total rendu retombe exactement sur
    // la largeur de page.
    const cellPaddingPt = 8; // doit rester cohérent avec layout.paddingLeft/paddingRight ci-dessous
    const usableForColumnsPt = Math.max(minColWidthPt * columnCount, availableWidthPt - columnCount * cellPaddingPt);
    const colgroup = node.querySelector(':scope > colgroup');
    const colPercents = colgroup ? Array.from(colgroup.children).map(col => parseFloat(col.style.width) || 0) : [];
    while (colPercents.length < columnCount) colPercents.push(0);
    const percentSum = colPercents.slice(0, columnCount).reduce((sum, p) => sum + p, 0);
    let widths;
    if (percentSum > 0) {
      // Normalise D'ABORD pour sommer exactement à usableForColumnsPt, quel que
      // soit percentSum réel (resizeTableColumn peut légèrement dériver de
      // 100% sur un redimensionnement extrême - un plancher de 5% clampé d'un
      // côté sans que son voisin ne recule exactement d'autant).
      widths = colPercents.slice(0, columnCount).map(p => (p / percentSum) * usableForColumnsPt);
      const flooredTotal = widths.reduce((sum, w) => sum + Math.max(minColWidthPt, w), 0);
      if (flooredTotal > usableForColumnsPt) {
        // Le plancher minimal (colonne glissée très étroite) ferait à lui
        // seul dépasser la largeur de page si on l'appliquait tel quel - on
        // retire le manque aux colonnes encore AU-DESSUS du plancher, au
        // prorata, plutôt que de laisser le tableau déborder à droite.
        const deficit = flooredTotal - usableForColumnsPt;
        const aboveFloorTotal = widths.reduce((sum, w) => sum + (w > minColWidthPt ? w : 0), 0) || 1;
        widths = widths.map(w => w > minColWidthPt ? Math.max(minColWidthPt, w - deficit * (w / aboveFloorTotal)) : minColWidthPt);
      } else {
        widths = widths.map(w => Math.max(minColWidthPt, w));
      }
    } else {
      widths = Array(columnCount).fill(Math.max(minColWidthPt, usableForColumnsPt / columnCount));
    }
    const table = {
      table: { headerRows: 0, widths, body: body.length ? body : [[{ text: ' ', margin: [4, 3, 4, 3] }].concat(Array(Math.max(0, columnCount - 1)).fill({}) )] },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#777777', vLineColor: () => '#777777', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 5, 0, 5]
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    return table;
  }
  function twoColumnsFrom(node, pageBreakBefore, sharedAnchorIdToBlock) {
    const colNodes = Array.from(node.querySelectorAll(':scope > .two-columns-column')).slice(0, 2);
    // TOUJOURS exactement deux dans du contenu produit par l'éditeur
    // (TwoColumnsBlot en pose systématiquement deux) - mais un
    // .two-columns-zone tapé à la main (onglet Code HTML) avec zéro ou une
    // seule .two-columns-column construirait plus bas `columns[1]` (voire
    // `columns[0]`) undefined (`columns` = colNodes.map(...), plus court que
    // 2), un objet pdfmake malformé (`stack: undefined`) qui ne lève PAS
    // d'exception ICI (donc pas rattrapable par le try/catch de
    // buildPdfContentFromRoot) mais peut échouer plus tard, de façon opaque,
    // dans le moteur de mise en page de pdfmake lui-même. Repli explicite ET
    // immédiat plutôt que de laisser construire cet objet malformé.
    if (colNodes.length < 2) return fallbackTextBlock(node, pageBreakBefore);
    const pageWidth = 595.28;
    const columnGapPt = 18 * PX_TO_PT; // css: .two-columns-zone { gap: 18px }
    // Largeur RÉELLE de chaque colonne, mesurée AVANT de construire son
    // contenu pdfmake (cf. plus bas) : le containerLeft d'une image en
    // calque ancrée DANS la colonne de droite (pdf-export.js:buildPdfContentFromRoot,
    // editor.js:findBracketingAnchors) a besoin de connaître l'abscisse PDF
    // réelle où cette colonne démarre, qui dépend de la largeur MESURÉE de
    // la colonne de gauche - ne peut donc plus être calculée après coup.
    //
    // Deux tentatives précédentes de reproduire À LA MAIN la chrome CSS de
    // .two-columns-zone / .two-columns-column (padding, bordure, gap) par un
    // calcul de constantes ont chacune laissé un léger écart dans un sens ou
    // l'autre (texte qui ne retombe pas exactement au même endroit qu'dans
    // l'éditeur) - fragile par nature : toute dérive entre ces constantes et
    // le CSS réel (ou un style hérité d'un document plus ancien) reproduit le
    // même bug. On MESURE donc directement la largeur de texte réellement
    // disponible dans chaque colonne, en clonant la zone dans un conteneur
    // hors-écran de la MÊME largeur que le contenu PDF (539.28pt / 0.75 =
    // 719.04px, la largeur de référence utilisée partout ailleurs dans ce
    // fichier pour faire correspondre éditeur et PDF), plutôt que de deviner.
    // Immunisé contre tout futur ajustement de style.css.
    const contentWidthPx = (pageWidth - 2 * PAGE_MARGIN_PT) / PX_TO_PT;
    const measureHost = document.createElement('div');
    measureHost.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + contentWidthPx + 'px;';
    const zoneClone = node.cloneNode(true);
    zoneClone.querySelectorAll('.two-columns-resize-grip').forEach(el => el.remove());
    measureHost.appendChild(zoneClone);
    document.body.appendChild(measureHost);
    const measuredCols = Array.from(zoneClone.querySelectorAll(':scope > .two-columns-column'));
    const leftPt = el => {
      const cs = getComputedStyle(el);
      return ((parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0)) * PX_TO_PT;
    };
    const rightPt = el => {
      const cs = getComputedStyle(el);
      return ((parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0)) * PX_TO_PT;
    };
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
    // Chrome CSS RÉELLE (mesurée, pas devinée) qui décale visiblement le texte
    // d'une colonne vers la droite dans l'éditeur, jusqu'ici totalement ignorée
    // à l'export : le padding+bordure GAUCHE de la ZONE elle-même (une seule
    // fois, avant la première colonne - reporté sur la marge gauche du bloc
    // entier plus bas) PLUS le padding+bordure gauche propre à CHAQUE colonne
    // (répété pour chacune). Distinct du bug de LARGEUR déjà corrigé
    // : la largeur de texte disponible était déjà juste, mais son point de
    // DÉPART restait implicitement supposé être la marge de page elle-même -
    // signalé par l'utilisateur : le paragraphe simple juste au-dessus de la
    // zone reste collé à gauche dans l'éditeur, alors que le texte de la
    // colonne, lui, apparaît nettement indenté - écart totalement absent de
    // l'export, où les deux retombaient à tort au même endroit.
    const zoneChromeLeftPt = leftPt(zoneClone);
    const colOwnInsetLeft = [
      measuredCols[0] ? leftPt(measuredCols[0]) : 0,
      measuredCols[1] ? leftPt(measuredCols[1]) : 0,
    ];
    // Chrome droite propre à CHAQUE colonne (padding+bordure droits) : sans
    // elle, le SLOT pdfmake alloué à la colonne de gauche (ci-dessous) ne
    // réserve que largeur-de-texte + inset-GAUCHE, plus étroit que sa vraie
    // largeur extérieure (mesurée, colOuterWidthPt) - la colonne de DROITE,
    // positionnée juste après ce slot trop étroit, démarrait alors un peu
    // trop tôt (trop à gauche) de tout juste cet inset droit manquant.
    // Signalé par l'utilisateur après le premier correctif (gauche) : lui
    // seul restait décalé, la colonne de gauche étant déjà correcte.
    const colOwnInsetRight = [
      measuredCols[0] ? rightPt(measuredCols[0]) : 0,
      measuredCols[1] ? rightPt(measuredCols[1]) : 0,
    ];
    const colOuterWidthPt = [
      measuredCols[0] ? measuredCols[0].getBoundingClientRect().width * PX_TO_PT : leftWidth,
      measuredCols[1] ? measuredCols[1].getBoundingClientRect().width * PX_TO_PT : rightWidth,
    ];
    document.body.removeChild(measureHost);
    // Abscisse PDF du bord gauche du TEXTE de chaque colonne (cf. note sur
    // buildPdfContentFromRoot/leftOriginPt), pour l'ancrage d'une image en
    // calque à l'intérieur - doit inclure exactement la même chrome que celle
    // appliquée ci-dessous au bloc pdfmake réel (zoneChromeLeftPt une seule
    // fois, puis l'inset propre de chaque colonne).
    const columnOrigins = [
      PAGE_MARGIN_PT + zoneChromeLeftPt + colOwnInsetLeft[0],
      PAGE_MARGIN_PT + zoneChromeLeftPt + colOuterWidthPt[0] + columnGapPt + colOwnInsetLeft[1],
    ];
    // Réapplique explicitement l'alignement (ql-align-center / -right / -justify
    // ou style inline text-align) à CHAQUE bloc pdfmake issu du contenu de la
    // colonne. Le flux hors-colonnes le fait déjà via blockFrom() /
    // alignment() ; on reproduit exactement la même sémantique ici pour que
    // les zones à 2 colonnes honorent enfin ql-align-justify à l'export PDF
    // vectoriel (bug : le justify était perdu à l'export PDF dans les
    // .two-columns-column). L'alignement par défaut (gauche) reste implicite
    // côté pdfmake, on ne l'écrit donc que si une valeur explicite est lue.
    const columns = colNodes.map((col, colIndex) => {
      // Alignement porté par la COLONNE elle-même (ex. style="text-align:
      // justify" posé directement sur le <div class="two-columns-column">,
      // cas courant quand son contenu est du texte brut sans <p> wrapper
      // propre - confirmé sur le HTML réel de l'utilisateur). Servira de
      // valeur par défaut : la boucle plus bas la remplace par un alignement
      // plus spécifique si un élément interne en porte un.
      const colAlign = alignment(col);
      let blocks;
      try { blocks = htmlToPdfContent(col.innerHTML, columnOrigins[colIndex], sharedAnchorIdToBlock); }
      catch (e) { console.warn('[PdfExport] contenu de colonne ignoré (structure inattendue), repli en texte brut :', e); blocks = [fallbackTextBlock(col, false)]; }
      // collect() parcourt le DOM de la colonne en MIRROR exactement les
      // règles de skip de htmlToPdfContent (page-break-marker ne pousse pas,
      // editable-table / two-columns-zone / isBlock() poussent un bloc).
      // L'ordre des sources collectées correspond donc 1-pour-1 à l'ordre
      // des blocs pdfmake produits par htmlToPdfContent, ce qui permet
      // d'aligner les indices sans avoir à dupliquer toute la logique.
      const alignSources = [];
      const collect = n => {
        if (n.nodeType === Node.TEXT_NODE) {
          if (n.nodeValue && n.nodeValue.trim()) alignSources.push(n);
          return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        if (n.classList.contains('page-break-marker')) return;
        // Ces embeds produisent eux aussi un bloc dans htmlToPdfContent ;
        // les ajouter à alignSources préserve la correspondance d'indices
        // (sinon les paragraphes qui les suivent seraient mal alignés).
        if (n.classList.contains('editable-table')) { alignSources.push(n); return; }
        if (n.classList.contains('two-columns-zone')) { alignSources.push(n); return; }
        if (isBlock(n)) { alignSources.push(n); return; }
        n.childNodes.forEach(collect);
      };
      const root = document.createElement('div');
      root.innerHTML = col.innerHTML || '';
      Array.from(root.childNodes).forEach(collect);
      // Applique l'alignement de la colonne comme valeur par défaut à TOUS
      // ses blocs : la boucle ci-dessous ne peut jamais le découvrir elle-même
      // (elle ne parcourt que `root`, une reconstruction DOM déconnectée de
      // `col` - la remontée s'arrête donc systématiquement à `root` avant
      // d'atteindre le vrai `.two-columns-column` qui porte cet alignement).
      // Les affectations plus spécifiques de la boucle (ql-align-* sur un
      // élément interne précis) s'appliquent ensuite par-dessus.
      if (colAlign) {
        blocks.forEach(b => { if (b && typeof b === 'object' && !b.columns) b.alignment = colAlign; });
      }
      for (let i = 0; i < blocks.length && i < alignSources.length; i += 1) {
        const src = alignSources[i];
        const isPlaceholder = src.classList &&
          (src.classList.contains('editable-table') || src.classList.contains('two-columns-zone'));
        if (isPlaceholder) continue;
        // CORRECTIF bug 2 : si la source est un TEXT_NODE (texte direct entre
        // blocs, fréquent quand la colonne n'a pas de <p> wrapper pour chaque
        // paragraphe), alignment(text_node) renvoie toujours undefined car
        // un TextNode n'a ni classList ni style. On remonte au parent
        // porteur (bloc ou deux-colonnes-column) qui porte ql-align-* ou
        // text-align inline posés par applyColumnAlignment().
        const probe = (src.nodeType === Node.TEXT_NODE && src.parentElement) ? src.parentElement : src;
        let a;
        let cur = probe;
        while (cur && !a) {
          a = alignment(cur);
          if (a) break;
          if (cur.classList && (cur.classList.contains('two-columns-column') || cur === root)) break;
          cur = cur.parentElement;
        }
        if (a && blocks[i] && typeof blocks[i] === 'object' && !blocks[i].columns) {
          blocks[i].alignment = a;
        }
      }
      return blocks;
    });
    // La poignée de redimensionnement (editor.js, .two-columns-resize-grip) ne
    // change QUE la variable CSS --layout-left du conteneur ; jusqu'ici cette
    // fonction ignorait totalement cette valeur et imposait un partage 50/50
    // fixe - la largeur ajustée dans l'éditeur n'avait donc littéralement
    // aucun effet sur l'export PDF (leftWidth/rightWidth, déjà mesurées
    // plus haut dans cette fonction avant de construire le contenu des
    // colonnes - cf. columnOrigins).
    //
    // pdfmake IGNORE silencieusement la largeur passée via `columnWidths` sur
    // le parent quand chaque entrée de `columns` est un simple TABLEAU de blocs
    // (comme ici, `columns[i]` = le tableau retourné par htmlToPdfContent) -
    // confirmé en inspectant le PDF réellement rendu : les données envoyées à
    // pdfmake portaient bien le bon ratio, mais le rendu final restait 50/50.
    // pdfmake attend une largeur portée par CHAQUE objet-colonne lui-même
    // (`{ width, stack }`), pas par le tableau `columnWidths` du parent quand
    // le contenu est un tableau brut plutôt qu'un objet - on enveloppe donc
    // chaque colonne dans `{ width, stack }` plutôt que de compter sur
    // `columnWidths`.
    // Chaque colonne est enveloppée dans un stack imbriqué portant sa propre
    // marge gauche ET droite (colOwnInsetLeft/Right) : la largeur de SLOT
    // allouée à la colonne (width) est sa vraie largeur EXTÉRIEURE mesurée
    // (colOuterWidthPt, padding+bordure des DEUX côtés compris), et le stack
    // interne retranche les deux par sa marge, laissant exactement la largeur
    // de TEXTE déjà mesurée (leftWidth/rightWidth) disponible pour le contenu
    // réel. Utiliser une largeur de slot amputée du côté droit (comme une
    // 1ère version le faisait) sous-évalue où se termine RÉELLEMENT la
    // colonne de gauche : la colonne de DROITE, positionnée juste après ce
    // slot, démarrerait alors trop tôt (trop à gauche) de tout juste cet
    // inset droit manquant - confirmé par l'utilisateur après le premier
    // correctif (gauche) : seule la colonne de droite restait décalée.
    const block = {
      columns: [
        { width: colOuterWidthPt[0], stack: [{ stack: columns[0], margin: [colOwnInsetLeft[0], 0, colOwnInsetRight[0], 0] }] },
        { width: colOuterWidthPt[1], stack: [{ stack: columns[1], margin: [colOwnInsetLeft[1], 0, colOwnInsetRight[1], 0] }] },
      ],
      columnGap: columnGapPt,
      // Marge gauche = chrome CSS RÉELLE de la zone elle-même (zoneChromeLeftPt,
      // mesurée plus haut - padding+bordure gauche de .two-columns-zone),
      // jusqu'ici ignorée (0 codé en dur) alors que visible dans l'éditeur :
      // le paragraphe juste au-dessus de la zone reste collé à la marge de
      // page tandis que le texte de la zone, lui, démarre plus loin.
      //
      // Marge verticale calibrée pour correspondre exactement à la "chrome"
      // d'édition réduite au minimum de .two-columns-zone (css/style.css) :
      // marge(0)+padding haut(16px)+bordure(1px) = 17px*0.75 = 12.75pt en
      // haut, marge(0)+padding bas(4px)+bordure(1px) = 5px*0.75 = 3.75pt en
      // bas. Un écart ici décale tout le contenu qui suit cette zone dans le
      // document (ex. une image en calque ancrée juste après) sans que
      // l'ancrage (qui lit la position RÉELLE du bloc ancre après mise en
      // page) ne puisse s'en apercevoir - contrairement à un paragraphe de
      // texte, la hauteur de CETTE zone n'est jamais mesurée dans l'éditeur,
      // seulement supposée correspondre à ces deux chiffres.
      margin: [zoneChromeLeftPt, 12.75, 0, 3.75],
    };
    // Exposée pour buildPdfContentFromRoot : quand une image en calque DANS
    // cette zone n'a trouvé aucun paragraphe voisin à qui s'ancrer (cf.
    // editor.js:updateAnchorOffset, repli "zone"), elle a besoin de savoir où
    // chaque colonne démarre réellement dans la page PDF - PAS calculable
    // après coup, une fois ce bloc retourné, sans redupliquer tout ce calcul.
    block._columnOrigins = columnOrigins;
    if (pageBreakBefore) block.pageBreak = 'before';
    return block;
  }
  // Retourne toujours un TABLEAU de blocs pdfmake (jamais un bloc unique) : un
  // paragraphe contenant une image doit produire un bloc de texte ET un bloc
  // image séparés (cf. note sur inlineRuns — une image ne peut pas être un run
  // de texte). L'image suit le texte du même paragraphe plutôt que d'être
  // repositionnée littéralement au milieu de la phrase, pdfmake ne supportant
  // pas d'image réellement "en ligne" dans un flux de texte.
  function blockFrom(node, pageBreakBefore, frontImages, behindImages) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return [tableFrom(node, pageBreakBefore)];
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
    const images = [];
    // Sous-liste imbriquée : seulement possible pour un <li> d'une liste NATIVE
    // du navigateur (execCommand 'indent' en cellule/colonne 2-colonnes) -
    // Quill lui-même n'imbrique jamais ses propres listes (cf. listMarkerFor).
    // Ses enfants <ul>/<ol> DIRECTS sont exclus du texte de CE <li> (traités
    // plus bas comme leurs propres blocs, avec leur propre marqueur/indentation).
    const nestedLists = tag === 'LI' ? Array.from(node.children).filter(c => /^(UL|OL)$/.test(c.tagName)) : [];
    const runs = trimEdgeWhitespace(nestedLists.length
      ? inlineRunsExcludingNestedLists(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images)
      : inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images));
    const blocks = [];
    let remainingPageBreak = pageBreakBefore;
    // Toujours créer ce bloc-texte, MÊME pour un paragraphe qui ne contient
    // qu'une image (aucun run - runs.length === 0) : sans lui, ce noeud n'a
    // aucun bloc pdfmake sur lequel lire `.positions` une fois mis en page,
    // ce qui casse l'ancrage (data-anchor-target-id, cf. htmlToPdfContent) si
    // cette IMAGE elle-même s'ancre sur SON PROPRE paragraphe - cas fréquent
    // depuis qu'une image insérée démarre directement en calque "devant" sur
    // sa propre ligne (editor.js:insertImage). Sans ce bloc, la résolution
    // d'ancre retombe sur `PAGE_MARGIN_PT + petit décalage`, une formule
    // pensée pour "aucune ancre connue du tout", pas pour "ancre connue mais
    // sans texte" - elle place alors l'image tout près du haut de la page,
    // sans le moindre rapport avec sa position réelle dans le document.
    // Contrepartie mineure acceptée : une ligne vide (' ', un espace) occupe
    // un peu d'espace vertical là où le paragraphe de l'image collapsait à
    // rien auparavant - un compromis nécessaire pour lui donner une position
    // PDF exploitable.
    //
    // Marge NULLE (pas [0,2,0,4]) pour ce cas précis (runs.length === 0,
    // paragraphe vide/image seule) : dans l'éditeur, des paragraphes vides
    // consécutifs (lignes vides utilisées comme espacement manuel) s'empilent
    // SANS marge visible entre eux (confirmé : hauteur mesurée = exactement
    // le line-height, aucun écart). La marge [0,2,0,4] est calibrée pour du
    // texte réel (cf. LINE_HEIGHT_RATIO) ; l'appliquer aussi aux lignes vides
    // ajoute ~6pt de trop À CHAQUE ligne vide, et plusieurs lignes vides
    // consécutives (cas fréquent : espacement avant une image en calque)
    // cumulent cet écart - confirmé être la cause d'un décalage vertical
    // d'environ "une ligne" signalé par l'utilisateur sur une image ancrée
    // après plusieurs lignes vides.
    // Indentation horizontale MESURÉE sur le rendu réel (measureIndentPt),
    // jamais codée en dur : couvre à la fois les cas connus (retrait des
    // <li>, padding+bordure des <blockquote>) et tout ql-indent-N posé par
    // Quill sur N'IMPORTE QUEL bloc (paragraphe, titre, liste...) - notamment
    // via un collage Word/Google Docs, jusqu'ici totalement ignoré par
    // l'export PDF alors que visible dans l'éditeur. D'anciennes valeurs
    // codées en dur (10pt pour <li>, 18pt pour <blockquote>) ont été vérifiées
    // FAUSSES par mesure directe (respectivement ~15.7pt et ~15pt réels dans
    // l'éditeur, à comparer à leur propre marge/bordure CSS) - tout document
    // en contenant produisait donc du texte décalé horizontalement dans le
    // PDF par rapport à l'éditeur, indépendamment de tout bug d'ancrage
    // d'image (cf. hypothèse utilisateur : "si ça se trouve ce n'est pas
    // l'image qui n'est pas à sa place, mais le texte").
    const indentPt = measureIndentPt(node, tag === 'LI' ? 'box' : 'text');
    // Marge verticale nulle (hors BLOCKQUOTE, cf. plus bas) : mesuré en live
    // sur l'éditeur réel, l'écart entre deux blocs consécutifs (paragraphes,
    // titres, items de liste - collés les uns aux autres SANS ligne vide) est
    // TOUJOURS exactement nul, quel que soit le tag - Quill remet leur
    // margin/padding CSS à 0 (.ql-editor p/h1-6/li/ol/ul/pre { margin:0 }),
    // et un <div> issu d'un retour à la ligne brut dans une colonne/cellule
    // (non géré par Quill) n'a de toute façon aucune marge par défaut. Un
    // ancien +6pt (top 2 + bottom 4, +5 en haut pour les titres) ajoutait donc
    // un espacement fictif à CHAQUE changement de bloc, absent de l'éditeur :
    // visible en net sur des lignes courtes (un <div> par ligne dans une
    // colonne ressemblait à un saut de ligne complet), et cumulatif sur tout
    // document à plusieurs paragraphes (dérive de position détectée par
    // ailleurs sur les ancres d'image). Vérifié : lignes consécutives à
    // top-to-top espacées de exactement LINE_HEIGHT_RATIO × taille de police
    // dans le PDF une fois cette marge retirée, comme mesuré dans l'éditeur.
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, 0, 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node); if (align) block.alignment = align;
    if (/^H[1-6]$/.test(tag)) {
      block.bold = true;
      // Numérotation (cf. headingMarkerFor) affichée devant le texte du titre,
      // ET utilisée telle quelle comme préfixe de l'entrée correspondante dans
      // le sommaire (cf. buildTocStack/_headingText plus bas) - un seul calcul
      // pour les deux, comme demandé ("apparaitre à la fois avant le texte des
      // titres et dans le sommaire").
      const marker = headingMarkerFor(node);
      if (marker && runs.length) block.text = [{ text: marker, fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }].concat(runs);
      block._isHeading = true;
      block._headingLevel = parseInt(tag.slice(1), 10);
      block._headingText = (marker + (node.textContent || '')).replace(/\s+/g, ' ').trim();
    }
    if (tag === 'LI') { block.text = runs.length ? [{ text: listMarkerFor(node), fontSize: DEFAULT_FONT_SIZE }].concat(runs) : ' '; }
    // BLOCKQUOTE : marge droite nulle (mesurée : Quill ne pose de
    // padding/bordure qu'à GAUCHE de la citation, jamais à droite - l'ancienne
    // valeur codée en dur (8pt) rétrécissait sans raison la largeur de texte
    // disponible côté PDF, un décalage de RETOUR À LA LIGNE en plus du simple
    // décalage de départ de texte).
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, 4, 0, 4]; }
    if (remainingPageBreak) { block.pageBreak = 'before'; remainingPageBreak = false; }
    blocks.push(block);
    images.forEach(img => {
      const layer = img._layer; delete img._layer;
      // _containingBlock : repère de repli pour relocateTopLevelFloatingImages
      // (plus bas) - posé pour TOUTE image en calque, même celle qui n'a PAS
      // trouvé de paragraphe voisin exploitable (cf. pdfImageFromNode, branche
      // sans data-anchor-off-* : _pendingOffset n'est alors jamais posé, donc
      // jamais retrouvée par le seul mécanisme d'ancrage précis) - sans lui,
      // cette image restait à l'extrémité globale du document (cf. plus bas).
      if (layer === 'behind' && behindImages) { img._containingBlock = block; behindImages.push(img); return; }
      if (layer === 'front' && frontImages) { img._containingBlock = block; frontImages.push(img); return; }
      if (remainingPageBreak) { img.pageBreak = 'before'; remainingPageBreak = false; }
      blocks.push(img);
    });
    // Sous-liste(s) imbriquée(s) (cf. plus haut) : traitées ICI plutôt que par
    // le parcours générique de buildPdfContentFromRoot, qui ne redescend jamais
    // dans le sous-arbre d'un noeud déjà transformé en bloc par blockFrom -
    // chaque <li> enfant devient son propre bloc (récursivement, pour une
    // imbrication à plusieurs niveaux), avec son propre marqueur et sa propre
    // indentation mesurée sur le DOM réel (measureIndentPt s'applique telle
    // quelle, quelle que soit la profondeur).
    nestedLists.forEach(list => {
      Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
        blockFrom(li, false, frontImages, behindImages).forEach(b => blocks.push(b));
      });
    });
    return blocks;
  }
  // Résout la position finale des images en calque ancrées (data-anchor-off-*,
  // cf. pdfImageFromNode) une fois qu'une 1ère passe de mise en page pdfmake a
  // rempli `.positions` sur leur bloc-paragraphe ancre. À appeler après avoir
  // fait générer ce premier PDF "de mesure" (jamais montré à l'utilisateur).
  function resolvedTop(anchor) {
    return anchor && anchor.block && anchor.block.positions && anchor.block.positions[0]
      ? anchor.block.positions[0].top
      : null;
  }
  function resolveAnchoredImagePositions(pendingImages) {
    return pendingImages.map(img => {
      const offset = img._pendingOffset;
      const above = img._anchorAboveBlock;
      const below = img._anchorBelowBlock;
      const aboveTop = resolvedTop(above);
      const belowTop = resolvedTop(below);
      // x part du containerLeft de l'ancre de référence (bord gauche de la
      // BOÎTE du paragraphe, cf. calcul dans htmlToPdfContent), PAS de
      // .positions[0].left : pour un paragraphe centré/aligné à droite,
      // .positions[0].left est le bord gauche du TEXTE RENDU de cette ligne
      // précise (déjà décalé par le centrage, et variable ligne par ligne
      // selon leur largeur) - alors que offset.left (editor.js:updateAnchorOffset)
      // est mesuré par rapport à getBoundingClientRect() du paragraphe,
      // c'est-à-dire le bord gauche de sa BOÎTE, insensible à l'alignement du
      // texte qu'elle contient. Additionner offset.left à .positions[0].left
      // reviendrait donc à appliquer DEUX FOIS l'effet du centrage.
      const xRef = above || below;
      // Repli "zone" (cf. pdfImageFromNode/_columnSide) : xRef pointe alors
      // sur la ZONE 2-colonnes elle-même (seul élément englobant mesurable),
      // dont le containerLeft "par défaut" ne correspond à AUCUNE des deux
      // colonnes - on pioche plutôt l'origine PDF de la colonne concernée
      // (columnOrigins, exposée par twoColumnsFrom) selon le côté mémorisé
      // par editor.js au moment où aucun paragraphe voisin n'a été trouvé.
      let x;
      if (xRef && img._columnSide && xRef.columnOrigins) {
        x = xRef.columnOrigins[img._columnSide === 'left' ? 0 : 1] + offset.left * PX_TO_PT;
      } else {
        x = xRef ? xRef.containerLeft + offset.left * PX_TO_PT : PAGE_MARGIN_PT + offset.left * PX_TO_PT;
      }
      if (aboveTop !== null && belowTop !== null && offset.top !== undefined && offset.topBelow !== undefined) {
        // Encadrement par les DEUX paragraphes qui bornent l'image (le dernier
        // qui finit avant elle, le premier qui commence après) : on interpole
        // sa position Y entre leurs positions RÉELLEMENT mesurées par pdfmake,
        // selon la proportion mesurée dans l'éditeur - exact quel que soit ce
        // qui se trouve entre les deux (texte, zone 2-colonnes, tableau...),
        // sans avoir besoin de choisir "LE" bon paragraphe ni de calibrer
        // séparément chaque type de bloc intercalé.
        const editorSpan = offset.top - offset.topBelow;
        const fraction = editorSpan !== 0 ? offset.top / editorSpan : 0;
        const pdfSpan = belowTop - aboveTop;
        return { x, y: aboveTop + fraction * pdfSpan };
      }
      if (aboveTop !== null && offset.top !== undefined) {
        return { x, y: aboveTop + offset.top * PX_TO_PT };
      }
      if (belowTop !== null && offset.topBelow !== undefined) {
        return { x, y: belowTop + offset.topBelow * PX_TO_PT };
      }
      // Aucune ancre exploitable (paragraphe(s) sans texte, ex. image seule
      // sur sa ligne) : pas de position pdfmake à lire, on retombe sur
      // l'ancien calcul (marge de page).
      const fallbackTop = offset.top !== undefined ? offset.top : offset.topBelow || 0;
      return { x, y: PAGE_MARGIN_PT + fallbackTop * PX_TO_PT };
    });
  }
  // Les images "derrière le texte" sont préfixées avant tout le reste du
  // contenu (peintes en premier, donc recouvertes par tout ce qui suit) et
  // celles "devant" ajoutées après tout (peintes en dernier, donc par-dessus) :
  // pdfmake n'a pas de z-index, seul l'ordre d'insertion dans content[]
  // détermine l'ordre de peinture. absolutePosition les sort de toute façon du
  // flux normal, donc ce placement initial n'affecte PAS la mise en page du
  // reste du document (aucun texte poussé/décalé) - MAIS détermine quelle
  // PAGE pdfmake leur attribue (limitation pdfmake, cf.
  // relocateTopLevelFloatingImages plus bas) : ce placement de premier niveau
  // n'est que provisoire, chaque image de premier niveau est ensuite repêchée
  // et repositionnée juste à côté de son ancre réelle par cette fonction.
  function htmlToPdfContent(html, leftOriginPt, sharedAnchorIdToBlock) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    // data-heading-style : posé UNIQUEMENT sur le parcours de premier niveau
    // (leftOriginPt === undefined, cf. resolveNativePdfContent) - jamais sur un
    // parcours de colonne (twoColumnsFrom rappelle htmlToPdfContent avec un
    // leftOriginPt défini pour le contenu de CHAQUE colonne). Un titre dans une
    // colonne 2-colonnes ou une cellule de tableau ne doit PAS être numéroté ni
    // entrer dans le sommaire (cf. style.css : la numérotation ne cible QUE les
    // enfants DIRECTS de .ql-editor/#reader-container - même exclusion ici).
    if (leftOriginPt === undefined) {
      const config = root.querySelector(':scope > .heading-numbering-config');
      root.dataset.headingStyle = (config && config.dataset.style) || 'none';
    }
    // Attaché hors-écran le temps du parcours (cf. measureIndentPt / attachMeasureHost)
    // pour que chaque bloc puisse mesurer son indentation RÉELLE sur du CSS
    // effectivement calculé, pas sur un DOM détaché (où toute mesure de largeur/
    // position renverrait des zéros). Toujours détaché en sortie, y compris si
    // blockFrom/tableFrom/twoColumnsFrom lève une exception.
    const detachMeasureHost = attachMeasureHost(root);
    try {
      return buildPdfContentFromRoot(root, leftOriginPt, sharedAnchorIdToBlock);
    } finally {
      detachMeasureHost();
    }
  }
  // leftOriginPt : abscisse PDF (pt) du bord gauche du contenu de CE parcours -
  // PAGE_MARGIN_PT pour le flux principal de la page, mais l'origine propre de
  // LA COLONNE (cf. twoColumnsFrom) quand ce HTML est le contenu d'une colonne
  // d'une zone 2-colonnes, sans quoi tout repère (data-pm-anchor-id) enregistré
  // ici pour une image en calque ancrée à l'intérieur de cette colonne se
  // verrait attribuer un containerLeft de page entière au lieu de celui, bien
  // plus étroit et décalé, de sa colonne réelle.
  //
  // sharedAnchorIdToBlock : map data-pm-anchor-id -> bloc pdfmake, PARTAGÉE
  // entre CE parcours et tout parcours ANCÊTRE ou DESCENDANT (colonnes d'une
  // zone 2-colonnes, cf. twoColumnsFrom, qui rappelle htmlToPdfContent pour
  // le contenu de chaque colonne). Un repère de repli "zone" (cf.
  // editor.js:updateAnchorOffset) posé par une image DANS une colonne
  // référence l'id de la ZONE elle-même - un id enregistré par le parcours
  // PARENT (celui du document global), pas par celui, isolé, de la colonne.
  // Sans map partagée, le parcours de la colonne ne pourrait jamais résoudre
  // ce repère (chercherait dans SA PROPRE map, locale, qui ne contient que
  // les blocs DE la colonne) - la résolution finale de _anchorAboveId/
  // _anchorBelowId est donc TOUJOURS différée à la toute fin, une fois le
  // document entier (colonnes comprises) parcouru et cette map définitivement
  // complète (cf. resolveNativePdfContent, seul endroit qui la consulte).
  function buildPdfContentFromRoot(root, leftOriginPt, sharedAnchorIdToBlock) {
    const origin = leftOriginPt !== undefined ? leftOriginPt : PAGE_MARGIN_PT;
    const blocks = []; const frontImages = []; const behindImages = [];
    const anchorIdToBlock = sharedAnchorIdToBlock || {};
    // Titres rencontrés à CE niveau (jamais ceux d'une colonne/cellule, cf.
    // htmlToPdfContent : hors de portée du parcours de premier niveau) et
    // emplacements du sommaire (placeholder rempli juste après le parcours,
    // cf. plus bas) - alimentent buildTocStack, cf. resolveNativePdfContent
    // pour la résolution des numéros de page (2e passe, même principe que
    // l'ancrage d'image).
    const headingBlocks = []; const tocBlocks = [];
    let pendingPageBreak = false;
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) blocks.push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; return; }
      if (node.classList.contains('heading-numbering-config')) { return; }
      if (node.classList.contains('toc-marker')) {
        // Contenu réel posé après coup (cf. buildTocStack ci-dessous, appelé
        // une fois root.childNodes.forEach(visit) terminé) : au moment où ce
        // noeud est rencontré, les titres qui le SUIVENT dans le document
        // (cas le plus fréquent - un sommaire est généralement en tête) ne
        // sont pas encore connus.
        const tocBlock = { stack: [{ text: 'Sommaire', bold: true, fontSize: 16 }], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
        blocks.push(tocBlock);
        tocBlocks.push(tocBlock);
        pendingPageBreak = false;
        return;
      }
      if (node.classList.contains('editable-table')) {
        const table = node.querySelector('table');
        if (table) {
          let tableBlock;
          try { tableBlock = tableFrom(table, pendingPageBreak); }
          catch (e) { console.warn('[PdfExport] tableau ignoré (structure inattendue), repli en texte brut :', e); tableBlock = fallbackTextBlock(node, pendingPageBreak); }
          blocks.push(tableBlock);
        }
        pendingPageBreak = false;
        return;
      }
      if (node.classList.contains('two-columns-zone')) {
        let zoneBlock;
        try { zoneBlock = twoColumnsFrom(node, pendingPageBreak, anchorIdToBlock); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        blocks.push(zoneBlock);
        // Repère de repli pour une image ancrée DANS une colonne de cette
        // zone sans paragraphe voisin (cf. editor.js:updateAnchorOffset) :
        // containerLeft n'est ici jamais utilisé directement (columnOrigins
        // le remplace, cf. resolveAnchoredImagePositions), gardé seulement
        // par cohérence avec la forme attendue d'une entrée anchorIdToBlock.
        if (node.dataset && node.dataset.pmAnchorId) {
          anchorIdToBlock[node.dataset.pmAnchorId] = {
            block: zoneBlock,
            containerLeft: origin,
            columnOrigins: zoneBlock._columnOrigins,
          };
        }
        pendingPageBreak = false;
        return;
      }
      if (isBlock(node)) {
        let produced;
        try { produced = blockFrom(node, pendingPageBreak, frontImages, behindImages); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        produced.forEach(b => { blocks.push(b); if (b && b._isHeading) headingBlocks.push(b); });
        if (node.dataset && node.dataset.pmAnchorId) {
          const textBlock = produced.find(b => b && b.text);
          if (textBlock) {
            anchorIdToBlock[node.dataset.pmAnchorId] = {
              block: textBlock,
              containerLeft: origin + (textBlock.margin ? textBlock.margin[0] : 0),
            };
          }
        }
        pendingPageBreak = false;
        return;
      }
      node.childNodes.forEach(visit);
    };
    root.childNodes.forEach(visit);
    // Résolution de _anchorAboveId/_anchorBelowId volontairement PAS faite
    // ici (cf. note sur sharedAnchorIdToBlock ci-dessus) : une image DANS une
    // colonne peut référencer un id enregistré par le parcours PARENT (la
    // zone elle-même) qui n'existe pas encore forcément dans la map à CE
    // stade précis (twoColumnsFrom n'a pas fini de construire le bloc de la
    // zone tant que ce parcours de colonne n'est pas terminé). Différée à la
    // toute fin, une fois tout le document (colonnes comprises) parcouru -
    // cf. resolveNativePdfContent, seul endroit qui lit cette map pour de bon.
    // Rempli avec le texte/niveau RÉELS de chaque titre (déjà tous connus, le
    // parcours ci-dessus est terminé) mais un numéro de page encore VIDE
    // (_pageNumberCells, réservé mais non écrit) : donne au sommaire, dès
    // CETTE passe, sa taille (presque) définitive - indispensable pour que la
    // 1ère passe de mesure (cf. resolveNativePdfContent) place les titres qui
    // SUIVENT le sommaire sur la bonne page. Les numéros eux-mêmes ne sont
    // connus qu'après cette 1ère passe (positions pdfmake), et patchés dans
    // les cellules réservées ici lors de la 2e passe (contenu neuf, mais
    // rebâti de façon identique - mêmes titres, même ordre, cf. htmlToPdfContent
    // fonction pure).
    tocBlocks.forEach(tocBlock => {
      const built = buildTocStack(headingBlocks);
      tocBlock.stack = built.stack;
      tocBlock._pageNumberCells = built.pageNumberCells;
    });
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    const result = behindImages.concat(content, frontImages);
    result._headingBlocks = headingBlocks;
    result._tocBlocks = tocBlocks;
    return result;
  }
  // pdfmake ne sait embarquer que du JPEG/PNG (jamais du SVG — un data URI SVG
  // le fait bloquer indéfiniment sans erreur, confirmé en le testant isolément).
  // On rastérise donc tout SVG en PNG via un aller-retour <img>/<canvas> avant de
  // le transmettre.
  function rasterizeSvgDataUri(dataUri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL('image/png')); }
        catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Échec de décodage du SVG pour rastérisation'));
      img.src = dataUri;
    });
  }
  // pdfmake exige une image en data URI base64 (ou une entrée "images" nommée) :
  // un simple src http(s)://... (upload Grist ou URL externe) n'est jamais
  // rendu, silencieusement. On convertit donc chaque <img> - PAS seulement
  // celles marquées "editor-image" : l'onglet Code HTML (mode avancé, cf.
  // html-source-tab.js) peut contenir une <img> tapée à la main, sans cette
  // classe - avant de construire le docDefinition (+ rastérisation si SVG,
  // cf. ci-dessus) ; en cas d'échec (réseau, CORS...), on marque l'image à
  // ignorer plutôt que de faire planter tout l'export PDF.
  async function inlineEditorImagesAsDataUri(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';
    const images = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(images.map(async img => {
      let src = img.getAttribute('src') || '';
      if (!src) return;
      try {
        if (!src.startsWith('data:')) {
          console.log('[PdfExport] conversion base64 de', src);
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
        if (src.startsWith('data:image/svg+xml')) {
          console.log('[PdfExport] rastérisation SVG -> PNG pour', img.getAttribute('src'));
          src = await rasterizeSvgDataUri(src);
        }
        img.setAttribute('src', src);
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
  // S'il y a des images en calque ancrées (data-anchor-off-*), une 1ère passe de
  // mise en page "de mesure" (jamais montrée à l'utilisateur, juste .getBuffer()
  // pour forcer pdfmake à calculer .positions sur chaque bloc) donne la position
  // RÉELLE de leur paragraphe ancre dans le PDF. On reconstruit alors le contenu
  // à neuf (htmlToPdfContent est une fonction pure : rejouée sur le même HTML,
  // elle produit des objets vierges, sans les métadonnées internes que pdfmake a
  // écrites dans les objets de la 1ère passe) et on y reporte les positions
  // ainsi résolues, dans le même ordre — pour la mise en page finale, la seule
  // réellement écrite dans le fichier téléchargé/affiché.
  // Une image en attente de résolution (_pendingOffset, cf. pdfImageFromNode)
  // n'est pas forcément un élément de PREMIER NIVEAU de `content` : une image
  // ancrée à l'intérieur d'une colonne d'une zone 2-colonnes vit nichée dans
  // `{columns: [{stack: [...]}, {stack: [...]}]}` (twoColumnsFrom). Un simple
  // `content.filter(...)` de premier niveau la manquerait entièrement - ni
  // mesurée lors de la 1ère passe, ni jamais patchée avec sa position finale
  // lors de la 2e (elle resterait bloquée à {x:0,y:0}, sa valeur provisoire).
  function collectPendingImages(content) {
    const found = [];
    (content || []).forEach(b => {
      if (!b || typeof b !== 'object') return;
      if (b._pendingOffset) found.push(b);
      if (Array.isArray(b.columns)) b.columns.forEach(col => { if (col && Array.isArray(col.stack)) found.push(...collectPendingImages(col.stack)); });
      // Un stack imbriqué ordinaire (cf. twoColumnsFrom : chaque colonne
      // enveloppe désormais son contenu dans {stack:[...], margin:[...]}
      // pour reproduire son propre padding/bordure gauche) doit AUSSI être
      // descendu - pas seulement columns[i].stack - sous peine de manquer
      // toute image nichée à CE niveau supplémentaire (jamais mesurée ni
      // patchée, resterait bloquée à son {x:0,y:0} provisoire).
      if (Array.isArray(b.stack)) found.push(...collectPendingImages(b.stack));
    });
    return found;
  }
  // Résout _anchorAboveId/_anchorBelowId (chaînes, cf. pdfImageFromNode) en
  // _anchorAboveBlock/_anchorBelowBlock (blocs pdfmake réels) pour chaque
  // image en attente - TOUJOURS après que tout le document (colonnes d'une
  // zone 2-colonnes comprises) a été parcouru, une fois `anchorIdToBlock`
  // définitivement complète (cf. notes sur buildPdfContentFromRoot/
  // sharedAnchorIdToBlock : un repère de repli "zone" posé par une image DANS
  // une colonne référence un id enregistré par le parcours PARENT, pas
  // disponible tant que le bloc de la zone elle-même n'est pas construit).
  function resolveAnchorIds(pending, anchorIdToBlock) {
    pending.forEach(img => {
      img._anchorAboveBlock = img._anchorAboveId ? (anchorIdToBlock[img._anchorAboveId] || null) : null;
      img._anchorBelowBlock = img._anchorBelowId ? (anchorIdToBlock[img._anchorBelowId] || null) : null;
      delete img._anchorAboveId;
      delete img._anchorBelowId;
    });
  }
  // pdfmake résout `absolutePosition` par rapport à la page qu'il est EN TRAIN
  // de composer au moment où il traite cet élément dans content[] (aucun moyen
  // de préciser explicitement une page cible - limitation connue et documentée
  // de pdfmake, cf. bpampuch/pdfmake#1476/#1738 : "any extra content with
  // absolute positioning overlays on top of the second page when there is
  // more than one page"). Poser TOUTES les images "devant" à la toute fin de
  // content[] (comme avant ce correctif) les fait donc composer au moment où
  // pdfmake a déjà traité TOUT le reste du document - sur un document de plus
  // d'une page, elles atterrissent alors sur la DERNIÈRE page plutôt que sur
  // celle où leur ancre réelle se trouve (souvent une page quasi vide en fin
  // de document, d'où une image qui semble ne "jamais apparaître"). Les images
  // "derrière" (posées au tout DÉBUT) ne présentaient pas ce symptôme car
  // pdfmake les compose alors que son curseur est encore sur la page 1 - ce
  // qui ne coïncide avec leur ancre réelle QUE si celle-ci est aussi page 1,
  // par pure coïncidence sur un document court, pas parce que le mécanisme
  // serait correct pour elles non plus.
  //
  // Fix : au lieu de laisser CHAQUE image ancrée à l'extrémité globale du
  // document, on la déplace juste à côté du bloc-ancre réellement résolu
  // (juste après le repère "au-dessus", ou juste avant celui "en dessous") -
  // pdfmake la compose alors exactement au même moment que ce bloc, donc sur
  // la même page que lui. absolutePosition la sort de toute façon du flux
  // normal (position ET x/y déjà calculés indépendamment, cf.
  // resolveAnchoredImagePositions) : la déplacer dans content[] ne change que
  // QUAND pdfmake la peint, jamais où elle est dessinée ni la mise en page du
  // reste du document.
  //
  // Portée : uniquement les images de PREMIER NIVEAU (flux principal) - une
  // image ancrée DANS une colonne d'une zone 2-colonnes reste, elle, bornée
  // au début/à la fin du stack de SA PROPRE colonne (cf. twoColumnsFrom), un
  // périmètre bien plus restreint où ce même défaut pdfmake est nettement
  // moins susceptible de se manifester (une zone 2-colonnes s'étend rarement
  // sur plusieurs pages) - non corrigé ici, hors périmètre de ce correctif.
  //
  // S'applique à TOUTE image en calque de premier niveau (marquée
  // `_containingBlock`, cf. blockFrom), pas seulement celles ayant une ancre
  // précise résolue (`_pendingOffset`) : une image SANS paragraphe voisin
  // exploitable (cas fréquent sur un document simple - une seule ligne, ou
  // l'image seule sur son propre paragraphe) ne passe jamais par ce mécanisme
  // d'ancrage précis (cf. pdfImageFromNode, branche sans data-anchor-off-*) et
  // restait donc, avant ce correctif, coincée à l'extrémité globale du
  // document malgré le premier correctif ci-dessus (qui ne déplaçait que les
  // images déjà ancrées). `_containingBlock` (son propre bloc-paragraphe,
  // toujours connu - c'est celui dans lequel blockFrom l'a rencontrée) sert
  // alors de repère de repli : moins précis qu'une vraie ancre pour le calcul
  // x/y (déjà fait ailleurs), mais garantit qu'elle est au moins composée sur
  // la MÊME page que son propre paragraphe plutôt que sur la dernière page du
  // document.
  function relocateTopLevelFloatingImages(content) {
    const floating = (content || []).filter(b => b && typeof b === 'object' && b._containingBlock);
    console.log('[PdfExport] relocateTopLevelFloatingImages: ' + floating.length + ' image(s) en calque de premier niveau à repositionner.');
    floating.forEach(img => {
      const currentIdx = content.indexOf(img);
      let outcome = 'inconnue';
      if (currentIdx !== -1) {
        // _anchorAboveBlock/_anchorBelowBlock (posés par resolveAnchorIds) sont
        // l'enveloppe {block, containerLeft, ...} lue par resolveAnchoredImagePositions
        // (anchor.block.positions...), PAS le bloc pdfmake lui-même - contrairement à
        // _containingBlock (jamais enveloppé, posé directement dans blockFrom). Chercher
        // l'enveloppe telle quelle dans content[] ne pouvait jamais la trouver (elle n'y
        // a jamais été insérée, seul .block l'a été) : indexOf échouait toujours,
        // laissant l'image bloquée à sa position d'origine malgré l'ancre "trouvée".
        let anchorBlock, insertAfter;
        if (img._anchorAboveBlock) { anchorBlock = img._anchorAboveBlock.block; insertAfter = true; }
        else if (img._anchorBelowBlock) { anchorBlock = img._anchorBelowBlock.block; insertAfter = false; }
        else { anchorBlock = img._containingBlock; insertAfter = true; }
        let anchorIdx = content.indexOf(anchorBlock);
        if (anchorIdx !== -1) {
          content.splice(currentIdx, 1);
          if (currentIdx < anchorIdx) anchorIdx -= 1; // l'index de l'ancre se décale après cette suppression
          const insertedAt = insertAfter ? anchorIdx + 1 : anchorIdx;
          content.splice(insertedAt, 0, img);
          outcome = `déplacée : index ${currentIdx} -> ${insertedAt} (ancre trouvée à ${anchorIdx}, insertAfter=${insertAfter})`;
        } else {
          outcome = 'ancre NON trouvée dans content[] (anchorBlock existe mais indexOf a échoué) - laissée à sa position d’origine ' + currentIdx;
        }
      } else {
        outcome = 'image elle-même absente de content[] au moment du repositionnement (nichée ailleurs ?)';
      }
      console.log('[PdfExport] relocateTopLevelFloatingImages: image src=' + String(img.image).slice(0, 60) + '… absolutePosition=' + JSON.stringify(img.absolutePosition) + ' -> ' + outcome);
      delete img._containingBlock;
      delete img._anchorAboveBlock;
      delete img._anchorBelowBlock;
      delete img._pendingOffset;
    });
  }
  async function resolveNativePdfContent(inlinedHtml, filename) {
    let anchorIdToBlock = {};
    let content = htmlToPdfContent(inlinedHtml, undefined, anchorIdToBlock);
    let pending = collectPendingImages(content);
    // Sommaire présent (cf. buildPdfContentFromRoot) : ses entrées ont besoin
    // du numéro de PAGE de chaque titre, connu seulement après une 1ère passe
    // de mise en page réelle (même mécanisme, même raison, que la résolution
    // de position des images en calque ancrées ci-dessous) - déclenche donc
    // cette 2e passe même en l'absence de toute image en attente.
    const hasToc = (content._tocBlocks || []).length > 0;
    console.log('[PdfExport] resolveNativePdfContent: ' + pending.length + ' image(s) ancrée(s) (_pendingOffset) trouvée(s), sommaire=' + hasToc + '.');
    if (pending.length || hasToc) {
      resolveAnchorIds(pending, anchorIdToBlock);
      await new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename)).getBuffer(() => resolve()); });
      const resolved = resolveAnchoredImagePositions(pending);
      console.log('[PdfExport] resolveNativePdfContent: positions résolues =', JSON.stringify(resolved));
      // Numéro de page RÉEL de chaque titre, lu sur les blocs de CETTE 1ère
      // passe (seule pdfmake les a effectivement mis en page - .positions
      // n'existe que sur les objets qu'elle a réellement traités) - capturé
      // par INDEX (même ordre garanti par htmlToPdfContent, fonction pure
      // rejouée à l'identique sur le même HTML) avant de reconstruire le
      // contenu à neuf.
      const headingPageNumbers = (content._headingBlocks || []).map(b => (b.positions && b.positions[0] && b.positions[0].pageNumber) || null);
      anchorIdToBlock = {};
      content = htmlToPdfContent(inlinedHtml, undefined, anchorIdToBlock);
      pending = collectPendingImages(content);
      resolveAnchorIds(pending, anchorIdToBlock);
      pending.forEach((img, i) => {
        if (resolved[i]) img.absolutePosition = resolved[i];
        console.log('[PdfExport] resolveNativePdfContent: image #' + i + ' anchorAbove=' + !!img._anchorAboveBlock + ' anchorBelow=' + !!img._anchorBelowBlock + ' absolutePosition=' + JSON.stringify(img.absolutePosition));
      });
      // Patch des cellules de numéro de page réservées (cf. buildTocStack) sur
      // le contenu NEUF de cette 2e passe - mêmes titres, même ordre que la
      // 1ère passe, donc alignement par index fiable.
      (content._tocBlocks || []).forEach(tocBlock => {
        (tocBlock._pageNumberCells || []).forEach((cell, i) => {
          if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]);
        });
      });
      console.log('[PdfExport] resolveNativePdfContent: numéros de page du sommaire =', JSON.stringify(headingPageNumbers));
    }
    // Toujours appelé, même sans image "en attente" (_pendingOffset) : couvre
    // aussi les images en calque sans ancre précise résolue (cf. commentaire
    // sur relocateTopLevelFloatingImages) - un retour anticipé ici (ancien
    // comportement) les laissait à l'extrémité globale du document.
    relocateTopLevelFloatingImages(content);
    return content;
  }
  // Construit le docDefinition pdfmake (résolution d'ancrage d'image incluse) sans
  // déclencher de téléchargement — partagé par exportNativePdf (.download()) et
  // getNativePdfBlob (.getBlob(), pour l'enregistrement en pièce jointe Grist).
  async function buildNativePdfDocDefinition(resolvedHtml, filename) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml);
    const content = await resolveNativePdfContent(inlinedHtml, filename);
    return buildNativeDocDefinition(content, filename);
  }
  async function exportNativePdf(resolvedHtml, filename) { const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename); window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf'); }
  async function getNativePdfBlob(resolvedHtml, filename) {
    const docDefinition = await buildNativePdfDocDefinition(resolvedHtml, filename);
    return new Promise((resolve, reject) => {
      try { window.pdfMake.createPdf(docDefinition).getBlob(resolve); } catch (e) { reject(e); }
    });
  }
  // Passe par la boîte de dialogue d'impression native du navigateur ("Enregistrer
  // au format PDF") plutôt que par un rendu canvas (html2canvas) ou une image
  // base64 (pdfmake). Les deux autres méthodes doivent RELIRE les pixels d'une
  // image via JS (fetch, ou canvas.toDataURL) pour l'intégrer au PDF, ce qui
  // échoue silencieusement dès que l'hôte de l'image ne renvoie pas d'en-têtes
  // CORS permissifs — restriction de sécurité du navigateur, pas un bug
  // corrigeable côté widget. L'impression native, elle, compose la page comme à
  // l'affichage normal (un <img> s'affiche sans CORS) et ne lit jamais les
  // pixels en JS : les images s'impriment donc quelle que soit leur origine.
  // Contrepartie : c'est le visiteur qui choisit "Enregistrer au format PDF"
  // dans la boîte de dialogue native, il n'y a pas de téléchargement automatique.
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
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (filename || 'publipostage') + '</title>' +
        '<style>' +
        '@page { size: A4; margin: 18mm; }' +
        'body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #1b2430; margin: 0; }' +
        'table { width: 100%; border-collapse: collapse; }' +
        'td, th { border: 1px solid #999; padding: 6px; }' +
        '.page-break-marker { page-break-after: always; break-after: page; height: 0; margin: 0; border: 0; }' +
        '.two-columns-marker { display: none; }' +
        '.two-columns-zone { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }' +
        'img { max-width: 100%; }' +
        '</style></head><body>' + resolvedHtml + '</body></html>'
      );
      doc.close();
      // Attend le chargement des images avant d'imprimer (avec filet de sécurité),
      // sans quoi certaines apparaîtraient blanches dans le PDF imprimé.
      await new Promise(resolve => {
        const imgs = Array.from(doc.images || []);
        if (!imgs.length) { resolve(); return; }
        let remaining = imgs.length;
        const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
        imgs.forEach(img => { if (img.complete) done(); else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); } });
        setTimeout(resolve, 4000);
      });
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
    }
  }
  // Construit le conteneur détaché (DOM neutralisé des marqueurs de saut de
  // page/2-colonnes) et les options html2pdf partagées par le téléchargement
  // (exportCurrentRecord) et la génération de blob pour pièce jointe
  // (generatePdfBlob) pour les qualités raster (standard/high/print).
  function buildRasterContainerAndOptions(resolvedHtml, filename, quality) {
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.position = 'relative';
    container.style.fontFamily = 'Arial, sans-serif';
    container.innerHTML = resolvedHtml;
    // .reader-content + data-heading-style : ce conteneur est bien attaché au
    // document réel (contrairement à .pdf-measure-host, hors-écran mais
    // toujours DANS ce même document) - css/style.css s'y applique déjà telle
    // quelle, donc la numérotation des titres (::before, cf. style.css) se
    // rend correctement à la capture html2canvas SANS rien réimplémenter ici,
    // à condition que ce conteneur porte les mêmes marqueurs que .ql-editor/
    // .reader-content (cf. reader-mode.js). Le sommaire lui-même (.toc-marker)
    // n'est PAS résolu pour les qualités raster (html2canvas n'a aucune notion
    // de "page" exploitable pour le numéro de page de chaque titre, contrairement
    // à pdfmake) : reste affiché tel quel (l'encadré pointillé de l'éditeur).
    const config = container.querySelector(':scope > .heading-numbering-config');
    container.classList.add('reader-content');
    container.dataset.headingStyle = (config && config.dataset.style) || 'none';
    container.querySelectorAll('.page-break-marker').forEach(marker => { marker.innerHTML = ''; marker.style.border = '0'; marker.style.background = 'transparent'; marker.style.color = 'transparent'; marker.style.height = '0'; marker.style.margin = '0'; marker.style.pageBreakAfter = 'always'; marker.style.breakAfter = 'page'; });
    container.querySelectorAll('.two-columns-marker').forEach(marker => { marker.innerHTML = ''; marker.style.display = 'none'; });
    document.body.appendChild(container);
    const preset = getQualityPreset(quality);
    const opt = { margin: 10, filename: (filename || 'publipostage') + '.pdf', image: preset.image, html2canvas: preset.html2canvas, jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}), pagebreak: { mode: ['css', 'legacy'], avoid: '.var-badge' } };
    return { container, opt };
  }
  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality) { if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; } const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record); const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record); if (quality === 'native') { await exportNativePdf(resolvedHtml, filename); return; } if (quality === 'browser-print') { await exportViaBrowserPrint(resolvedHtml, filename); return; } const { container, opt } = buildRasterContainerAndOptions(resolvedHtml, filename, quality); try { await html2pdf().set(opt).from(container).save(); } finally { document.body.removeChild(container); } }
  // Génère le PDF en mémoire (Blob), sans déclencher ni téléchargement ni
  // impression navigateur — pour l'enregistrement dans une pièce jointe Grist
  // (cf. GristAPI.saveExportToAttachment). 'browser-print' n'a, par nature,
  // aucun octet PDF disponible en JS (c'est le visiteur qui choisit
  // "Enregistrer au format PDF" dans la boîte de dialogue native) : exclu.
  async function generatePdfBlob(htmlContent, currentTableId, record, filenameTemplate, quality) {
    if (!record) throw new Error("Aucune ligne sélectionnée : impossible de générer le PDF.");
    if (quality === 'browser-print') throw new Error("La qualité « Impression navigateur » ne peut pas être enregistrée en pièce jointe (aucun fichier PDF n'est produit par le widget dans ce mode — c'est vous qui l'enregistrez depuis la boîte de dialogue d'impression).");
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    if (quality === 'native') {
      const blob = await getNativePdfBlob(resolvedHtml, filename);
      return { blob, filename };
    }
    const { container, opt } = buildRasterContainerAndOptions(resolvedHtml, filename, quality);
    try {
      const blob = await html2pdf().set(opt).from(container).outputPdf('blob');
      return { blob, filename };
    } finally {
      document.body.removeChild(container);
    }
  }
  return { exportCurrentRecord, generatePdfBlob };
})();