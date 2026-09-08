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

  // Image simple : V2 n'a pas encore de calque devant/derrière ni de
  // repositionnement par glisser (cf. mémoire
  // feedback_v2_defer_complexity_to_pdf_phase - reporté à quand ce besoin
  // sera réel), donc jamais de position absolue à gérer ici, contrairement à
  // js/pdf-export.js (V1) - juste une image dans le flux normal du texte.
  function pdfImageFromNode(node) {
    const widthPx = parseFloat(node.style.width) || 320;
    return { image: node.getAttribute('src'), width: Math.max(15, widthPx * PX_TO_PT), margin: [0, 2, 0, 4] };
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
  // Une cellule multi-lignes (plusieurs blocs, ou un mélange de texte brut et
  // de blocs alignés) construit un stack d'une ligne pdfmake par ligne ;
  // sinon (cas courant, un seul groupe de texte flottant) le texte reste à
  // plat, sans le surcoût d'un stack.
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
  function measuredColumnWidthsPx(table, columnCount) {
    const firstRow = table.querySelector(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
    if (!firstRow) return null;
    const cells = Array.from(firstRow.children).filter(c => /^(TD|TH)$/i.test(c.tagName));
    if (!cells.length) return null;
    const widths = [];
    cells.forEach(cell => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const perCol = cell.getBoundingClientRect().width / span;
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
    const availableWidthPt = 595.28 - 56;
    const minColWidthPt = 12;
    // pdfmake ajoute paddingLeft+paddingRight (cf. `layout` plus bas) À CHAQUE
    // colonne EN PLUS de la valeur donnée dans `widths` (vérifié en décodant
    // le PDF réellement généré, même constat que la V1) - retiré avant de
    // répartir la largeur disponible pour que le total rendu retombe
    // exactement sur la largeur de page.
    const cellPaddingPt = 8; // doit rester cohérent avec layout.paddingLeft/paddingRight ci-dessous
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
    const table = {
      table: { headerRows: 0, widths, body: body.length ? body : [[{ text: ' ', margin: [4, 3, 4, 3] }].concat(Array(Math.max(0, columnCount - 1)).fill({}))] },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#777777', vLineColor: () => '#777777', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
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
  function twoColumnsFrom(node, pageBreakBefore) {
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
    const colOwnInsetRight = [measuredCols[0] ? rightPt(measuredCols[0]) : 0, measuredCols[1] ? rightPt(measuredCols[1]) : 0];
    const colOuterWidthPt = [
      measuredCols[0] ? measuredCols[0].getBoundingClientRect().width * PX_TO_PT : leftWidth,
      measuredCols[1] ? measuredCols[1].getBoundingClientRect().width * PX_TO_PT : rightWidth,
    ];
    document.body.removeChild(measureHost);
    const columns = colNodes.map(col => {
      const colAlign = alignment(col);
      let blocks;
      try { blocks = htmlToPdfContent(col.innerHTML, false); }
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
    return block;
  }

  // Retourne toujours un TABLEAU de blocs (jamais un bloc unique) : un
  // paragraphe contenant une image produit un bloc de texte ET un bloc image
  // séparés (pdfmake ne supporte pas d'image réellement "en ligne").
  function blockFrom(node, pageBreakBefore, headingMarkers) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return [tableFrom(node, pageBreakBefore)];
    if (tag === 'HR') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) }];
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
    const block = { text: runs.length ? runs : ' ', margin: [indentPt, 0, 0, 0], lineHeight: LINE_HEIGHT_RATIO };
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
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [indentPt, 4, 0, 4]; }
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

  function buildPdfContentFromRoot(root, headingMarkers) {
    const blocks = [];
    const headingBlocks = []; const tocBlocks = [];
    let pendingPageBreak = false;
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) blocks.push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; return; }
      if (node.classList.contains('heading-numbering-config')) return;
      if (node.classList.contains('toc-marker')) {
        const tocBlock = { stack: [{ text: 'Sommaire', bold: true, fontSize: 16 }], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) };
        blocks.push(tocBlock); tocBlocks.push(tocBlock); pendingPageBreak = false;
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
        try { zoneBlock = twoColumnsFrom(node, pendingPageBreak); }
        catch (e) { console.warn('[PdfExport] zone 2 colonnes ignorée (structure inattendue), repli en texte brut :', e); zoneBlock = fallbackTextBlock(node, pendingPageBreak); }
        blocks.push(zoneBlock);
        pendingPageBreak = false;
        return;
      }
      if (isBlock(node)) {
        let produced;
        try { produced = blockFrom(node, pendingPageBreak, headingMarkers); }
        catch (e) { console.warn('[PdfExport] bloc ' + node.tagName + ' ignoré (structure inattendue), repli en texte brut :', e); produced = [fallbackTextBlock(node, pendingPageBreak)]; }
        produced.forEach(b => { blocks.push(b); if (b && b._isHeading) headingBlocks.push(b); });
        pendingPageBreak = false;
        return;
      }
      node.childNodes.forEach(visit);
    };
    root.childNodes.forEach(visit);
    tocBlocks.forEach(tocBlock => {
      const built = buildTocStack(headingBlocks);
      tocBlock.stack = built.stack;
      tocBlock._pageNumberCells = built.pageNumberCells;
    });
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    content._headingBlocks = headingBlocks;
    content._tocBlocks = tocBlocks;
    return content;
  }

  // isTopLevel=true pour le flux principal de la page (calcule la
  // numérotation des titres, cf. headingMarkers) ; false pour le contenu
  // d'une colonne d'une zone 2 colonnes (cf. twoColumnsFrom) - un titre saisi
  // dans une colonne n'est ni numéroté ni inclus dans le sommaire, même
  // exclusion que css/editor-v2.css (compteurs scopés aux enfants DIRECTS de
  // .tiptap).
  function htmlToPdfContent(html, isTopLevel) {
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
      return buildPdfContentFromRoot(root, headingMarkers);
    } finally {
      detachMeasureHost();
    }
  }

  // pdfmake ne sait embarquer que du JPEG/PNG (un data URI SVG le fait
  // bloquer indéfiniment sans erreur) - rastérise donc tout SVG en PNG via
  // un aller-retour <img>/<canvas>. Générique, sans dépendance à l'éditeur.
  function rasterizeSvgDataUri(dataUri) {
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
      img.onerror = () => reject(new Error('Échec de décodage du SVG pour rastérisation'));
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
        if (src.startsWith('data:image/svg+xml')) src = await rasterizeSvgDataUri(src);
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

  // S'il y a un sommaire, une 1ère passe de mise en page "de mesure" (jamais
  // montrée à l'utilisateur, juste .getBuffer() pour forcer pdfmake à
  // calculer .positions) donne le numéro de PAGE réel de chaque titre. Le
  // contenu est ensuite reconstruit à neuf (htmlToPdfContent est une fonction
  // pure) et ces numéros reportés dans les cellules réservées du sommaire.
  // Pas de résolution d'ancrage d'image ici (contrairement à la V1) : V2 n'a
  // pas encore d'image en calque, donc rien à résoudre pour l'instant.
  async function resolveNativePdfContent(inlinedHtml, filename) {
    let content = htmlToPdfContent(inlinedHtml, true);
    const hasToc = (content._tocBlocks || []).length > 0;
    if (hasToc) {
      await new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename)).getBuffer(() => resolve()); });
      const headingPageNumbers = (content._headingBlocks || []).map(b => (b.positions && b.positions[0] && b.positions[0].pageNumber) || null);
      content = htmlToPdfContent(inlinedHtml, true);
      (content._tocBlocks || []).forEach(tocBlock => {
        (tocBlock._pageNumberCells || []).forEach((cell, i) => { if (headingPageNumbers[i] != null) cell.text = String(headingPageNumbers[i]); });
      });
    }
    return content;
  }

  async function buildNativePdfDocDefinition(resolvedHtml, filename) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
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
