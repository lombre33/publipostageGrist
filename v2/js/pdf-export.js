// Export PDF V2 — mode vectoriel (pdfmake) uniquement pour cet incrément
// (raster/impression navigateur pas encore portés, cf. plan de migration).
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

  // Style hérité d'un nœud DOM -> attributs de "run" pdfmake. Ne lit QUE des
  // marques réellement produites par l'éditeur V2 aujourd'hui (gras/italique/
  // souligné/barré, taille/police inline posées par FontSize/FontFamily) -
  // pas de couleur/lien/exposant, pas encore de bouton pour ça dans la
  // toolbar V2 (à étendre ici le jour où ces marques existeront).
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
    let leftPx;
    if (mode === 'box') {
      leftPx = node.getBoundingClientRect().left;
    } else {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      const textNode = walker.nextNode();
      if (!textNode) return 0;
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
    return Math.round(Math.max(0, (leftPx - hostLeft) * PX_TO_PT) * 100) / 100;
  }

  // Attache `root` hors-écran avec la classe .tiptap (pas #editor-container
  // .tiptap : cf. css/editor-v2.css, volontairement scopé à la seule classe
  // pour que cette mesure fonctionne sans dépendre de l'ID du conteneur
  // éditeur réel) et la largeur de contenu du PDF.
  function attachMeasureHost(root) {
    root.classList.add('pdf-measure-host', 'tiptap');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + CONTENT_WIDTH_PX + 'px; padding:0; margin:0; box-sizing:border-box;';
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
  function listMarkerFor(node) {
    const parent = node.parentElement;
    if (parent && parent.tagName === 'OL') {
      const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
      const start = parseInt(parent.getAttribute('start') || '1', 10) || 1;
      const idx = items.indexOf(node);
      return (start + (idx === -1 ? 0 : idx)) + '. ';
    }
    return '• ';
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
  function cellLineToPdfObject(line, cellAlign, cellBaseStyle, images) {
    if (line.inline) {
      let runs = [];
      line.inline.forEach(n => { runs = runs.concat(inlineRuns(n, cellBaseStyle, images)); });
      runs = trimEdgeWhitespace(runs);
      const obj = { text: runs.length ? runs : ' ' };
      if (cellAlign) obj.alignment = cellAlign;
      return obj;
    }
    const node = line;
    const isLi = node.tagName === 'LI';
    const marker = isLi ? listMarkerFor(node) : '';
    const runs = trimEdgeWhitespace(isLi
      ? inlineRunsExcludingNestedLists(node, cellBaseStyle, images)
      : inlineRuns(node, cellBaseStyle, images));
    const text = marker ? [{ text: marker, fontSize: DEFAULT_FONT_SIZE }].concat(runs.length ? runs : [{ text: ' ' }]) : (runs.length ? runs : ' ');
    const obj = { text, margin: [isLi ? measureIndentPt(node, 'box') : 0, 0, 0, 0] };
    const align = alignment(node) || cellAlign; if (align) obj.alignment = align;
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
  function cellContentFrom(cell) {
    const lines = [];
    collectCellLines(cell, lines);
    const images = [];
    if (!lines.length) return { text: ' ' };
    if (lines.length === 1 && lines[0].inline) {
      const runs = trimEdgeWhitespace(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }, images));
      const textObj = { text: runs.length ? runs : ' ' };
      return images.length ? { stack: [textObj].concat(images) } : textObj;
    }
    const cellAlign = alignment(cell);
    const cellBaseStyle = inheritedStyle(cell, { fontSize: DEFAULT_FONT_SIZE });
    const stack = lines.map(line => cellLineToPdfObject(line, cellAlign, cellBaseStyle, images));
    return { stack: stack.concat(images) };
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
  function tableFrom(node, pageBreakBefore) {
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
    const body = rawRows.map(row => {
      const output = [];
      cellsOf(row).forEach(cell => {
        const colSpan = Math.min(columnCount - output.length, Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1));
        let content;
        try { content = cellContentFrom(cell); }
        catch (e) { console.warn('[PdfExport] cellule de tableau ignorée (structure inattendue), repli en texte brut :', e); content = { text: (cell.textContent || '').trim() || ' ' }; }
        // Pas de `margin` propre à la cellule : le seul inset appliqué est
        // `layout.paddingLeft/Right/Top/Bottom` ci-dessous (le budget de
        // largeur, cf. usableForColumnsPt, est déjà calculé en fonction de
        // CE padding précisément - un margin en plus double-compterait un
        // inset déjà pris en compte).
        const pdfCell = Object.assign({ border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO }, content);
        if (!pdfCell.stack) { const align = alignment(cell); if (align) pdfCell.alignment = align; }
        if (colSpan > 1) pdfCell.colSpan = colSpan;
        output.push(pdfCell);
        for (let i = 1; i < colSpan; i += 1) output.push({});
      });
      while (output.length < columnCount) output.push({ text: ' ', border: [true, true, true, true] });
      return output.slice(0, columnCount);
    });
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
    let widths;
    if (measuredPt && measuredSum > 0) {
      widths = measuredPt.map(w => (w / measuredSum) * usableForColumnsPt);
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
    const table = {
      table: { headerRows: 0, widths, body: body.length ? body : [[{ text: ' ' }].concat(Array(Math.max(0, columnCount - 1)).fill({}))] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#777777', vLineColor: () => '#777777',
        paddingLeft: () => cellPadLeftPt, paddingRight: () => cellPadRightPt, paddingTop: () => cellPadTopPt, paddingBottom: () => cellPadBottomPt,
      },
      margin: [0, 5, 0, 5],
    };
    if (pageBreakBefore) table.pageBreak = 'before';
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
  async function twoColumnsFrom(node, pageBreakBefore) {
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
    const columns = await Promise.all(colNodes.map(async col => {
      const colAlign = alignment(col);
      let blocks;
      try { blocks = await htmlToPdfContent(col.innerHTML, false); }
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
    const block = {
      columns: [
        { width: colOuterWidthPt[0], stack: [{ stack: columns[0], margin: [colOwnInsetLeft[0], 0, colOwnInsetRight[0], 0] }] },
        { width: colOuterWidthPt[1], stack: [{ stack: columns[1], margin: [colOwnInsetLeft[1], 0, colOwnInsetRight[1], 0] }] },
      ],
      columnGap: columnGapPt,
      margin: [zoneChromeLeftPt, 12.75, 0, 3.75],
    };
    if (pageBreakBefore) block.pageBreak = 'before';
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
          words.push({ textNode, start, end: i, top: range.getBoundingClientRect().top });
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
  function extractRunsBetween(node, startCut, endCut) {
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
    return trimEdgeWhitespace(inlineRuns(clone, { fontSize: DEFAULT_FONT_SIZE }, []));
  }

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
  // ce segment reste en flux normal pleine largeur, INCHANGÉ) ; (2) les
  // lignes qui tombent dans la hauteur de l'image (reconstruites une par
  // une, cf. plus bas) ; (3) tout ce qui suit le bas de l'image, de nouveau
  // en flux normal pleine largeur. Chaque LIGNE du segment (2) est
  // reconstruite comme son PROPRE bloc pdfmake, avec ses frontières EXACTES
  // dictées par le rendu réel mesuré (mots consécutifs de même Y regroupés
  // en une ligne) - PAS laissée à pdfmake pour re-répartir tout ce texte en
  // un seul flux dans une largeur calculée : vérifié en conditions réelles
  // que cette re-répartition ne tombe pas TOUJOURS exactement sur les mêmes
  // coupures que l'éditeur - dicter directement les lignes réelles élimine
  // le problème à la racine. Chaque ligne, prise seule, tient par
  // construction dans la largeur disponible : c'est très exactement ce qui
  // l'a fait tenir dans l'éditeur à cette même largeur.
  // Portée de CET incrément : seulement le texte du MÊME paragraphe que
  // l'image - un paragraphe SUIVANT distinct ne vient pas encore s'habiller
  // si l'image est plus haute que ce seul paragraphe (limitation connue,
  // nécessiterait de consommer des blocs frères suivants depuis
  // buildPdfContentFromRoot, plus invasif - cf. mémoire
  // project_v2_tiptap_migration). `null` si le paragraphe ne contient QUE
  // l'image (aucun texte à habiller) - l'appelant retombe alors sur le rendu
  // normal (image seule).
  function floatedImageParagraphFrom(node, pageBreakBefore) {
    const images = [];
    const runs = trimEdgeWhitespace(inlineRuns(node, { fontSize: DEFAULT_FONT_SIZE }, images));
    const floatImg = images.find(img => img._floatAlign);
    if (!floatImg || !runs.length) return null;
    const align = floatImg._floatAlign;
    const imgNode = floatImg._sourceImgNode;
    delete floatImg._floatAlign;
    delete floatImg._sourceImgNode;
    const pageWidthPt = 595.28 - 2 * PAGE_MARGIN_PT;
    const gapPt = 12 * PX_TO_PT; // css/editor-v2.css: margin 0 12px 8px 0 (et son miroir)
    const imageWidthPt = floatImg.width;
    const remainingWidthPt = Math.max(40, pageWidthPt - imageWidthPt - gapPt);
    const makeColumns = (besideContent) => {
      const textCol = { width: remainingWidthPt, stack: besideContent.length ? besideContent : [{ text: ' ' }] };
      const imgCol = { width: imageWidthPt, stack: [floatImg] };
      return { columns: align === 'right' ? [textCol, imgCol] : [imgCol, textCol], columnGap: gapPt };
    };
    const fallback = () => {
      const block = makeColumns([{ text: runs, lineHeight: LINE_HEIGHT_RATIO }]);
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

    const blocks = [];
    let pendingPageBreak = pageBreakBefore;
    if (besideStart > 0) {
      const beforeRuns = extractRunsBetween(node, null, { textNode: words[besideStart].textNode, offset: words[besideStart].start });
      if (beforeRuns.length) {
        blocks.push({ text: beforeRuns, margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) });
        pendingPageBreak = false;
      }
    }
    // Regroupe les mots "à côté" en lignes (mots consécutifs de Y quasi
    // identique) et reconstruit chacune comme son propre bloc de texte.
    const lineGroups = [];
    words.slice(besideStart, besideEnd).forEach(w => {
      const last = lineGroups[lineGroups.length - 1];
      if (last && Math.abs(last.top - w.top) < 2) last.words.push(w); else lineGroups.push({ top: w.top, words: [w] });
    });
    const besideBlocks = lineGroups.map((line, i) => {
      const startCut = (besideStart === 0 && i === 0) ? null : { textNode: line.words[0].textNode, offset: line.words[0].start };
      const lastWord = line.words[line.words.length - 1];
      const lineRuns = extractRunsBetween(node, startCut, { textNode: lastWord.textNode, offset: lastWord.end });
      return { text: lineRuns.length ? lineRuns : ' ', lineHeight: LINE_HEIGHT_RATIO };
    });
    const columnsBlock = makeColumns(besideBlocks);
    if (pendingPageBreak) columnsBlock.pageBreak = 'before';
    blocks.push(columnsBlock);
    if (besideEnd < words.length) {
      const afterRuns = extractRunsBetween(node, { textNode: words[besideEnd].textNode, offset: words[besideEnd].start }, null);
      blocks.push({ text: afterRuns.length ? afterRuns : ' ', margin: [0, 0, spaceWidthPt(), 0], lineHeight: LINE_HEIGHT_RATIO });
    }
    return blocks;
  }

  // Retourne toujours un TABLEAU de blocs (jamais un bloc unique) : un
  // paragraphe contenant une image produit un bloc de texte ET un bloc image
  // séparés (pdfmake ne supporte pas d'image réellement "en ligne").
  function blockFrom(node, pageBreakBefore, headingMarkers) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return [tableFrom(node, pageBreakBefore)];
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
    if (tag === 'P' || tag === 'DIV') {
      const floatImgEl = Array.from(node.querySelectorAll('img.editor-image')).find(img => {
        const align = img.getAttribute('data-align');
        const layer = img.getAttribute('data-layer') || 'normal';
        return layer === 'normal' && (align === 'left' || align === 'right');
      });
      if (floatImgEl) {
        const floated = floatedImageParagraphFrom(node, pageBreakBefore);
        if (floated) return Array.isArray(floated) ? floated : [floated];
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
    if (pageBreakBefore) block.pageBreak = 'before';
    blocks.push(block);
    images.forEach(img => blocks.push(img));
    nestedLists.forEach(list => {
      Array.from(list.children).filter(c => c.tagName === 'LI').forEach(li => {
        blockFrom(li, false, headingMarkers).forEach(b => blocks.push(b));
      });
    });
    return blocks;
  }

  async function buildPdfContentFromRoot(root, headingMarkers) {
    const blocks = [];
    // Parallèle à `blocks` : le nœud DOM top-level source de chaque entrée -
    // sert uniquement à mesurer la position RENDUE réelle des blocs voisins
    // d'une image en calque (cf. résolution d'ancrage plus bas), pas besoin
    // ailleurs.
    const sourceNodes = [];
    const headingBlocks = []; const tocBlocks = [];
    let pendingPageBreak = false;
    const push = (block, node) => { blocks.push(block); sourceNodes.push(node); };
    const visit = async node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }, node.parentElement); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; return; }
      if (node.classList.contains('heading-numbering-config')) return;
      if (node.classList.contains('toc-marker')) {
        const tocBlock = { stack: [{ text: 'Sommaire', bold: true, fontSize: 16 }], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
        push(tocBlock, node); tocBlocks.push(tocBlock); pendingPageBreak = false;
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
        try { zoneBlock = await twoColumnsFrom(node, pendingPageBreak); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        push(zoneBlock, node);
        pendingPageBreak = false;
        return;
      }
      if (isBlock(node)) {
        let produced;
        try { produced = blockFrom(node, pendingPageBreak, headingMarkers); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        produced.forEach(b => { push(b, node); if (b && b._isHeading) headingBlocks.push(b); });
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
    content._pendingImages = resolvePendingImageAnchors(root, blocks, sourceNodes);
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
  function resolvePendingImageAnchors(root, blocks, sourceNodes) {
    const pending = [];
    const rootRect = root.getBoundingClientRect();
    const measurable = blocks.map((b, i) => ({ block: b, node: sourceNodes[i] })).filter(({ block }) => block && !block._pendingImgNode);
    blocks.forEach(block => {
      if (!block || !block._pendingImgNode) return;
      const imgRect = block._pendingImgNode.getBoundingClientRect();
      const imgTopPx = imgRect.top - rootRect.top;
      const imgLeftPx = imgRect.left - rootRect.left;
      let above = null, aboveTopPx = -Infinity;
      let below = null, belowTopPx = Infinity;
      measurable.forEach(({ block: other, node }) => {
        if (!node || !node.getBoundingClientRect) return;
        const t = node.getBoundingClientRect().top - rootRect.top;
        if (t <= imgTopPx && t > aboveTopPx) { aboveTopPx = t; above = other; }
        if (t >= imgTopPx && t < belowTopPx) { belowTopPx = t; below = other; }
      });
      pending.push({ image: block, above, below, imgTopPx, imgLeftPx, aboveTopPx, belowTopPx });
    });
    return pending;
  }

  // isTopLevel=true pour le flux principal de la page (calcule la
  // numérotation des titres, cf. headingMarkers) ; false pour le contenu
  // d'une colonne d'une zone 2 colonnes (cf. twoColumnsFrom) - un titre saisi
  // dans une colonne n'est ni numéroté ni inclus dans le sommaire, même
  // exclusion que css/editor-v2.css (compteurs scopés aux enfants DIRECTS de
  // .tiptap).
  async function htmlToPdfContent(html, isTopLevel) {
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
    const detachMeasureHost = attachMeasureHost(root);
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
      return await buildPdfContentFromRoot(root, headingMarkers);
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
    const xPt = PAGE_MARGIN_PT + a.imgLeftPx * PX_TO_PT;
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
  // dans le tableau `content[]` juste à côté de l'ancre utilisée - pdfmake
  // place un `absolutePosition` sur la page COURANTE au moment où il traite
  // cette entrée du tableau (pas sur la page indiquée par `y`), donc une
  // image glissée loin de sa position DOM d'origine resterait composée sur
  // la MAUVAISE page sans ce réalignement (même contrainte que la V1, cf.
  // mémoire project_image_anchor_bracketing_interpolation). Portée de cet
  // incrément : uniquement les images en calque au niveau racine du document
  // - une image en calque imbriquée dans une cellule de tableau ou une
  // colonne de zone 2-colonnes n'est pas résolue ici (aucun de ces deux
  // chemins de construction n'a de blocs-ancre top-level à offrir) ; elle
  // garde alors le repli le plus simple - aucune `absolutePosition`, rendue
  // en flux normal à sa place dans sa cellule/colonne - pas invisible, juste
  // pas positionnée au pixel près comme au niveau racine.
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
        return {
          aboveTop: aboveResolved ? aboveResolved.top : null, abovePage: aboveResolved ? aboveResolved.pageNumber : null,
          belowTop: belowResolved ? belowResolved.top : null, belowPage: belowResolved ? belowResolved.pageNumber : null,
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
        const anchorBlock = a.aboveTop != null ? p.above : (a.belowTop != null ? p.below : null);
        if (!anchorBlock) return;
        const imgIdx = content.indexOf(p.image);
        if (imgIdx === -1) return;
        content.splice(imgIdx, 1);
        const anchorIdx = content.indexOf(anchorBlock);
        if (anchorIdx === -1) return;
        content.splice(anchorBlock === p.above ? anchorIdx + 1 : anchorIdx, 0, p.image);
      });
    }
    return content;
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

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate) {
    if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; }
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    await exportNativePdf(resolvedHtml, filename);
  }

  return { exportCurrentRecord, getNativePdfBlob };
})();
