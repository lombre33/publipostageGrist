// Export DOCX — Beta, volontairement plus modeste que l'export PDF vectoriel (js/pdf-export.js). DOCX est un format qui SE REFLOW (police/zoom/imprimante
// du lecteur), contrairement à une page PDF figée : reproduire la fidélité pixel-près de pdf-export.js (grille page, images en calque bracketées/
// interpolées) n'aurait pas de sens ici et irait contre l'usage réel d'un .docx (un document qu'on continue d'ÉDITER dans Word/LibreOffice).
//
// Écarts avec la V1 (cf. historique git pour le détail) : les listes utilisent maintenant la numérotation Word native (numbering.xml - une <ul>/<ol>
// renumérote correctement après suppression/ajout d'un item, contrairement à un marqueur texte figé) ; les colonnes de tableau sont mesurées sur le rendu
// réel (comme pdf-export.js) au lieu d'une répartition à parts égales ; export en lot (ZIP, une ligne = un .docx) ajouté, cf. js/main.js:onExportDocxBatch.
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
  async function ensureDocxLibLoaded() {
    if (!docxLibPromise) docxLibPromise = loadScriptOnce(DOCX_LIB).catch(e => { docxLibPromise = null; throw e; });
    return docxLibPromise;
  }

  // 1 twip = 1/20 pt = 1/1440 pouce. Page A4 + marges alignées sur PAGE_MARGIN_PT de pdf-export.js (28pt = 560 twips) - pas une obligation technique, juste
  // une cohérence visuelle bienvenue entre les deux exports.
  const TWIPS_PER_PT = 20;
  const A4_WIDTH_TWIP = 11906;
  const A4_HEIGHT_TWIP = 16838;
  const PAGE_MARGIN_TWIP = 28 * TWIPS_PER_PT;
  const HF_DISTANCE_TWIP = 20 * TWIPS_PER_PT;
  const CONTENT_WIDTH_TWIP = A4_WIDTH_TWIP - 2 * PAGE_MARGIN_TWIP;
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

  function cssColorHex(value) {
    if (!value) return null;
    const v = value.trim();
    const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    const hex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    if (m) return (hex(m[1]) + hex(m[2]) + hex(m[3])).toUpperCase();
    return v.replace(/^#/, '').toUpperCase();
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
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out.strike = true;
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italics = true;
    if (css('text-decoration')) {
      if (/underline/i.test(css('text-decoration'))) out.underline = { type: 'single' };
      if (/line-through/i.test(css('text-decoration'))) out.strike = true;
    }
    if (css('font-size')) out.size = cssHalfPt(css('font-size'), DEFAULT_HALF_PT);
    if (css('font-family')) out.font = css('font-family').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (css('color')) out.color = cssColorHex(css('color'));
    if (css('background-color')) out.shading = { fill: cssColorHex(css('background-color')), type: docx.ShadingType.CLEAR };
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
    // deux dimensions, contrairement à pdfmake qui sait déduire la hauteur d'une largeur seule).
    const widthPx = parseFloat(img.style.width) || 320;
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
  // marge + décalage = même formule que p.image.absolutePosition, js/pdf-export.js : la position est relative au CONTENU (dans les marges), pas au bord
  // brut de la page - il faut donc rajouter la marge avant de convertir en EMU pour un ancrage Word relatif à la PAGE.
  // Alignement gauche/droite (data-align, cf. css/editor-v2.css `.tiptap img.editor-image[data-align="left/right"] { float }`) : HABILLAGE réel, le texte
  // contourne l'image des DEUX côtés d'un même paragraphe - un cas totalement différent du calque (qui ne touche jamais le texte). 'center' n'en a pas
  // besoin (déjà un simple bloc centré, aucun flottant nécessaire). Pas de position à mesurer/capturer ici : `align` (jeton, pas une coordonnée) suffit à
  // Word pour recréer le même flottement - la seule inconnue est de quel côté le texte doit continuer à couler (wrap.side, opposé au bord d'alignement).
  // Ancré relatif à la marge de PAGE (pas "column") : correct pour un paragraphe du corps principal (le seul cas rencontré/rapporté) ; une image alignée
  // À L'INTÉRIEUR d'une colonne 2-colonnes ou d'une cellule de tableau s'ancrerait quand même à la marge de la PAGE entière - limite connue, non traitée
  // ici (Word n'ancre pas nativement un flottant relatif à une cellule de tableau).
  function docxAlignFloatingOptionsFrom(imgNode, uniqueId) {
    const align = imgNode.getAttribute('data-align');
    if (align !== 'left' && align !== 'right') return null;
    return {
      zIndex: 1000 + uniqueId,
      wrap: { type: docx.TextWrappingType.SQUARE, side: align === 'right' ? docx.TextWrappingSide.LEFT : docx.TextWrappingSide.RIGHT },
      horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.MARGIN, align: align === 'right' ? docx.HorizontalPositionAlign.RIGHT : docx.HorizontalPositionAlign.LEFT },
      // relativeFrom "line" (pas "paragraph") : un vrai float CSS démarre à la LIGNE où il est rencontré dans le flux, pas forcément en haut du
      // paragraphe entier - une image insérée après plusieurs lignes de texte (comme le cas rapporté) se retrouvait plaquée en haut du paragraphe dans
      // Word au lieu de rester à la hauteur où elle apparaît réellement dans l'éditeur.
      verticalPosition: { relative: docx.VerticalPositionRelativeFrom.LINE, align: docx.VerticalPositionAlign.TOP },
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
    const marginPt = PAGE_MARGIN_TWIP / TWIPS_PER_PT;
    const xEmu = Math.round((marginPt + leftPt) * EMU_PER_PT);
    const yEmu = Math.round((marginPt + topPt) * EMU_PER_PT);
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
    if (node.classList.contains('var-badge') || node.classList.contains('resolved-var') || node.classList.contains('smart-chip')) {
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
      const imgData = await docxImageDataFrom(node);
      if (!imgData) return [];
      // docx.js régénère un compteur wp:docPr/id FRAIS (démarrant à 1) à chaque ImageRun plutôt que d'en partager un seul pour tout le document (bug de la
      // librairie, vérifié dans son propre bundle) : sans id explicite ici, deux images obtiennent toutes les deux id="1", ce que Word refuse d'ouvrir sans
      // le signaler comme contenu illisible. altText.id fournit un id unique par image du document.
      ctx.imageIdCounter += 1;
      const runOptions = { type: imgData.type, data: imgData.data, transformation: { width: imgData.width, height: imgData.height }, altText: { id: ctx.imageIdCounter, name: '', description: '', title: '' } };
      const floatingOptions = docxFloatingOptionsFrom(node, ctx.imageIdCounter, ctx);
      if (floatingOptions) runOptions.floating = floatingOptions;
      return [new docx.ImageRun(runOptions)];
    }
    if (node.tagName === 'BR') return [new docx.TextRun({ break: 1 })];
    let out = [];
    for (const child of Array.from(node.childNodes)) out = out.concat(await inlineNodesFrom(child, style, ctx));
    return out;
  }
  // Comme inlineNodesFrom, mais ignore les <ul>/<ol> DIRECTS - une sous-liste doit produire SES PROPRES paragraphes (cf. listBlocksFrom), pas être aplatie
  // dans le texte de son <li> parent. Même rôle que inlineRunsExcludingNestedLists, js/pdf-export.js.
  async function inlineNodesExcludingNestedLists(node, parentStyle, ctx) {
    const style = inheritedRunStyle(node, parentStyle);
    let out = [];
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(child.tagName)) continue;
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
    return { size: DEFAULT_HALF_PT, strike: true, color: '98A2B3' };
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
  // Repli si le tableau n'est pas dans le DOM attaché au moment de l'appel (ex. zone en-tête/pied - hors périmètre de la mesure, cf. buildDocxDocument) :
  // répartition à parts égales, exactement comme la V1.
  function equalColumnWidthsTwip(columnCount) { return new Array(columnCount).fill(Math.floor(CONTENT_WIDTH_TWIP / columnCount)); }
  // Port de measuredColumnWidthsPx, js/pdf-export.js : largeur de CONTENU (pas la boîte entière) mesurée sur le rendu réel du 1er enfant de bloc de chaque
  // cellule de la 1ère ligne - le <col> de @tiptap ne porte qu'un minimum px, jamais un pourcentage exploitable.
  function measuredColumnWidthsPx(tableEl, columnCount) {
    if (!tableEl.isConnected) return null;
    const firstRow = tableEl.querySelector(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
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
  // Table réelle du document (pas l'émulation 2-colonnes, cf. twoColumnsBlockFrom). Largeurs mesurées sur le rendu réel (comme pdf-export.js), avec une
  // marge de cellule Word par défaut (2×108 twips, jamais incluse dans une mesure de CONTENU) rajoutée pour que la largeur totale demandée à Word colle à
  // ce qui a été mesuré.
  const WORD_DEFAULT_CELL_MARGIN_TWIP = 216;
  async function tableBlockFrom(tableEl, ctx) {
    const rows = Array.from(tableEl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr'));
    if (!rows.length) return null;
    const firstRowCells = Array.from(rows[0].children).filter(c => /^(TD|TH)$/i.test(c.tagName));
    const columnCount = firstRowCells.reduce((sum, c) => sum + (parseInt(c.getAttribute('colspan') || '1', 10) || 1), 0) || 1;
    const measuredPx = measuredColumnWidthsPx(tableEl, columnCount);
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
        const children = await blocksFromContainer(cell, ctx);
        tableCells.push(new docx.TableCell({
          children: children.length ? children : [new docx.Paragraph('')],
          width: { size: width, type: docx.WidthType.DXA },
          columnSpan: span > 1 ? span : undefined,
          rowSpan: rowSpan > 1 ? rowSpan : undefined,
        }));
      }
      tableRows.push(new docx.TableRow({ children: tableCells }));
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
  async function twoColumnsBlockFrom(zoneEl, ctx) {
    const cols = Array.from(zoneEl.querySelectorAll(':scope > .two-columns-column'));
    if (cols.length !== 2) return null;
    const leftPercent = parseFloat(zoneEl.style.getPropertyValue('--layout-left')) || 50;
    const leftTwip = Math.round(CONTENT_WIDTH_TWIP * leftPercent / 100);
    const rightTwip = CONTENT_WIDTH_TWIP - leftTwip;
    const widths = [leftTwip, rightTwip];
    const cells = [];
    for (let i = 0; i < 2; i += 1) {
      const children = await blocksFromContainer(cols[i], ctx);
      cells.push(new docx.TableCell({
        children: children.length ? children : [new docx.Paragraph('')],
        width: { size: widths[i], type: docx.WidthType.DXA },
        borders: NO_BORDERS,
      }));
    }
    // Même correctif que tableBlockFrom : columnWidths explicite pour que <w:tblGrid> corresponde aux largeurs réelles des cellules.
    return new docx.Table({ rows: [new docx.TableRow({ children: cells })], width: { size: CONTENT_WIDTH_TWIP, type: docx.WidthType.DXA }, borders: NO_BORDERS, columnWidths: widths });
  }

  function isHeadingTag(tag) { return /^H[1-6]$/.test(tag); }
  // <p>/<div>/<h1-6> -> un seul Paragraph. Titre : marqueur littéral ("1) "...) IDENTIQUE à pdf-export.js/reader-mode (cohérence entre les 3 exports) posé
  // en texte, en PLUS du style Word natif "Titre N" (repris par le volet de navigation/un futur sommaire réel si l'utilisateur en construit un dans Word).
  // `pageBreakBefore` DOIT passer par le constructeur (option native, cf. IParagraphPropertiesOptionsBase) - un Paragraph déjà construit n'est pas
  // mutable de l'extérieur.
  async function paragraphBlockFrom(node, ctx, headingMarkers, pageBreakBefore) {
    const runs = await inlineNodesExcludingNestedLists(node, { size: DEFAULT_HALF_PT }, ctx);
    const align = paragraphAlignment(node);
    const isHeading = isHeadingTag(node.tagName);
    const marker = isHeading && headingMarkers && headingMarkers.get(node);
    // color:'auto' - même raison que inheritedRunStyle ci-dessus : ce marqueur ("1) ", "2) "...) est un TextRun à part, jamais passé par
    // inheritedRunStyle/runOpts, donc pas concerné par son propre défaut de couleur - sans ça il hériterait quand même du bleu du style Word "Titre N".
    const children = marker ? [new docx.TextRun(Object.assign({ text: marker }, isHeading ? { bold: true, size: HEADING_HALF_PT[node.tagName], color: 'auto' } : {}))].concat(runs) : runs;
    const opts = {
      children: children.length ? children : [new docx.TextRun('')],
      alignment: align,
      // after:0 - `.tiptap p/h1-6` n'ont aucune marge propre (margin:0, cf. css/editor-v2.css) ; l'espacement visuel vient des paragraphes vides que
      // l'utilisateur insère lui-même, jamais d'une marge automatique. line/lineRule : cf. LINE_SPACING_240THS ci-dessus.
      spacing: { after: 0, line: LINE_SPACING_240THS, lineRule: 'auto' },
      pageBreakBefore: !!pageBreakBefore,
    };
    if (isHeading) { opts.heading = docx.HeadingLevel[HEADING_LEVEL[node.tagName]]; ctx.headingBlocks.push({ level: parseInt(node.tagName.slice(1), 10), text: ((marker || '') + (node.textContent || '')).replace(/\s+/g, ' ').trim() }); }
    if (node.tagName === 'BLOCKQUOTE') { opts.indent = { left: 400 }; opts.border = { left: { style: 'single', size: 16, color: 'CBD5E1', space: 8 } }; }
    return new docx.Paragraph(opts);
  }

  function buildTocParagraphs(headingBlocks) {
    const title = new docx.Paragraph({ children: [new docx.TextRun({ text: 'Sommaire', bold: true, size: 32 })], spacing: { after: 160 } });
    if (!headingBlocks.length) return [title, new docx.Paragraph({ children: [new docx.TextRun({ text: '(aucun titre dans ce document)', italics: true })] })];
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
  async function blocksFromContainer(container, ctx, isTopLevel) {
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
        if (node.nodeValue && node.nodeValue.trim()) blocks.push(new docx.Paragraph({ children: [new docx.TextRun(node.nodeValue)], pageBreakBefore: pendingPageBreak }));
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
      if (node.tagName === 'TABLE') {
        const block = await tableBlockFrom(node, ctx);
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
      if (/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(node.tagName)) {
        const block = await paragraphBlockFrom(node, ctx, headingMarkers, pendingPageBreak);
        blocks.push(block);
        pendingPageBreak = false;
        continue;
      }
      if (node.tagName === 'HR') {
        blocks.push(new docx.Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'CBD5E1' } }, spacing: { after: 120 } }));
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

  // #Variable/chips déjà résolus par ReaderMode.preview (même fonction que pdf-export.js:resolveHeaderFooterVariables) - copie volontairement locale
  // plutôt qu'un appel à travers PdfExport (module privé, pas d'export public pour cette fonction) : ~10 lignes, ne justifie pas un couplage entre les deux
  // exporteurs.
  async function resolveHeaderFooterVariables(headerFooterData, tableId, record) {
    if (!headerFooterData || !headerFooterData.enabled) return headerFooterData;
    const resolveZone = html => (html ? ReaderMode.preview(html, tableId, record) : html);
    const [headerDefault, headerFirst, footerDefault, footerFirst] = await Promise.all([
      resolveZone(headerFooterData.header && headerFooterData.header.default),
      resolveZone(headerFooterData.header && headerFooterData.header.first),
      resolveZone(headerFooterData.footer && headerFooterData.footer.default),
      resolveZone(headerFooterData.footer && headerFooterData.footer.first),
    ]);
    return { enabled: true, differentFirstPage: !!headerFooterData.differentFirstPage, header: { default: headerDefault, first: headerFirst }, footer: { default: footerDefault, first: footerFirst } };
  }
  async function headerFooterBlocksFrom(html, ctx) {
    if (!html) return [];
    const root = document.createElement('div'); root.innerHTML = html;
    return blocksFromContainer(root, ctx, false);
  }

  // Attaché hors-écran avec la classe .tiptap (comme attachMeasureHost, js/pdf-export.js) le temps du parcours : measuredColumnWidthsPx a besoin d'un
  // rendu réel, jamais possible sur un <div> détaché du document.
  function attachMeasureHost(root) {
    root.classList.add('tiptap');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + Math.round(CONTENT_WIDTH_TWIP / PX_TO_TWIP) + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }
  async function buildDocxDocument(resolvedHtml, headerFooterData) {
    const root = document.createElement('div'); root.innerHTML = resolvedHtml || '';
    const ctx = { footnotes: {}, footnoteCounter: 0, headingBlocks: [], numberingConfigs: [], numberingCounter: 0, imageIdCounter: 0, measureRoot: root };
    const detachMeasureHost = attachMeasureHost(root);
    let bodyBlocks;
    try {
      await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
      bodyBlocks = await blocksFromContainer(root, ctx, true);
    } finally { detachMeasureHost(); }

    const differentFirstPage = !!(headerFooterData && headerFooterData.enabled && headerFooterData.differentFirstPage);
    const sectionProps = {
      page: {
        size: { width: A4_WIDTH_TWIP, height: A4_HEIGHT_TWIP },
        margin: { top: PAGE_MARGIN_TWIP, bottom: PAGE_MARGIN_TWIP, left: PAGE_MARGIN_TWIP, right: PAGE_MARGIN_TWIP, header: HF_DISTANCE_TWIP, footer: HF_DISTANCE_TWIP },
      },
      titlePage: differentFirstPage,
    };
    const section = { properties: sectionProps, children: bodyBlocks.length ? bodyBlocks : [new docx.Paragraph('')] };
    if (headerFooterData && headerFooterData.enabled) {
      const headerDefaultBlocks = await headerFooterBlocksFrom(headerFooterData.header && headerFooterData.header.default, ctx);
      const footerDefaultBlocks = await headerFooterBlocksFrom(headerFooterData.footer && headerFooterData.footer.default, ctx);
      if (headerDefaultBlocks.length) section.headers = Object.assign({}, section.headers, { default: new docx.Header({ children: headerDefaultBlocks }) });
      if (footerDefaultBlocks.length) section.footers = Object.assign({}, section.footers, { default: new docx.Footer({ children: footerDefaultBlocks }) });
      if (differentFirstPage) {
        const headerFirstBlocks = await headerFooterBlocksFrom(headerFooterData.header && headerFooterData.header.first, ctx);
        const footerFirstBlocks = await headerFooterBlocksFrom(headerFooterData.footer && headerFooterData.footer.first, ctx);
        if (headerFirstBlocks.length) section.headers = Object.assign({}, section.headers, { first: new docx.Header({ children: headerFirstBlocks }) });
        if (footerFirstBlocks.length) section.footers = Object.assign({}, section.footers, { first: new docx.Footer({ children: footerFirstBlocks }) });
      }
    }
    const doc = { sections: [section], footnotes: ctx.footnotes };
    if (ctx.numberingConfigs.length) doc.numbering = { config: ctx.numberingConfigs };
    return new docx.Document(doc);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData) {
    await ensureDocxLibLoaded();
    const resolvedHtml = await ReaderMode.preview(htmlContent, tableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    const resolvedHeaderFooterData = await resolveHeaderFooterVariables(headerFooterData, tableId, record);
    const doc = await buildDocxDocument(resolvedHtml, resolvedHeaderFooterData);
    const blob = await docx.Packer.toBlob(doc);
    return { blob, filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData) {
    if (!record) { alert(I18n.t('alert.noRecordForExport')); return; }
    const { blob, filename } = await getDocxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    downloadBlob(blob, (filename || 'publipostage') + '.docx');
  }

  return { exportCurrentRecord, getDocxBlobForRecord, ensureDocxLibLoaded };
})();
