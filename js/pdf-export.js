// Module export PDF : raster (historique) ou texte natif vectoriel (pdfmake).
const PdfExport = (function () {
  const QUALITY_PRESETS = {
    standard: { label: 'Standard', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 } },
    high: { label: 'Haute qualité', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 4 }, jsPDF: { compress: false } },
    print: { label: 'Impression (HD)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } }
  };
  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.standard; }
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
  function alignment(node) { const cls = node.classList || { contains: () => false }; if (cls.contains('ql-align-center')) return 'center'; if (cls.contains('ql-align-right')) return 'right'; if (cls.contains('ql-align-justify')) return 'justify'; const style = (node.getAttribute && node.getAttribute('style')) || ''; const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i); return match ? match[1].toLowerCase() : undefined; }
  function inheritedStyle(node, parent) { const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : ''; const css = name => { const m = style.match(new RegExp(name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); }; const tag = node.nodeType === 1 ? node.tagName : ''; const out = Object.assign({}, parent); if (tag === 'STRONG' || tag === 'B') out.bold = true; if (tag === 'EM' || tag === 'I') out.italics = true; if (tag === 'U') out.decoration = 'underline'; if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true; if (css('font-style') === 'italic') out.italics = true; if (css('text-decoration') && /underline/i.test(css('text-decoration'))) out.decoration = 'underline'; if (css('font-size')) out.fontSize = cssSize(css('font-size'), DEFAULT_FONT_SIZE); return out; }
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
  function pdfImageFromNode(node) {
    const widthPx = parseFloat(node.style.width) || 320;
    const heightPx = parseFloat(node.style.height) || null;
    const image = { image: node.getAttribute('src'), opacity: Math.max(0, Math.min(1, parseFloat(node.style.opacity) || 1)), margin: [0, 2, 0, 4] };
    image.width = Math.max(15, widthPx * PX_TO_PT);
    if (heightPx) image.height = Math.max(10, heightPx * PX_TO_PT);
    if (node.style.position === 'absolute') {
      // Si l'image porte data-anchor-off-left/top (editor.js:updateAnchorOffset),
      // sa position a été mesurée en direct par rapport à SON PROPRE paragraphe,
      // pas par rapport au haut de l'éditeur. On résout alors sa position finale
      // (cf. resolveAnchoredImagePositions) en deux passes de mise en page
      // pdfmake, à partir de la position RÉELLEMENT calculée par pdfmake pour ce
      // paragraphe — la seule façon fiable de rester exact quel que soit ce qui
      // précède l'image dans le document (titre, autres paragraphes...), leur
      // hauteur en PDF ne coïncidant jamais exactement avec leur hauteur dans
      // l'éditeur. Fallback (image sans ancre connue, ou dans un tableau/zone à
      // 2 colonnes non couverts par ce mécanisme) : ancien calcul, marge de page
      // + padding éditeur retranché.
      const anchorLeft = node.dataset.anchorOffLeft;
      const anchorTop = node.dataset.anchorOffTop;
      const anchorTargetId = node.dataset.anchorTargetId;
      if (anchorLeft !== undefined && anchorTop !== undefined && anchorTargetId) {
        image._pendingOffset = { left: parseFloat(anchorLeft) || 0, top: parseFloat(anchorTop) || 0 };
        // Résolu après coup (cf. htmlToPdfContent) : le bloc-ancre référencé par
        // cet identifiant peut être n'importe où dans le document (avant OU
        // après cette image), pas forcément celui qui la contient dans le DOM —
        // une image seule sur sa ligne, glissée pour recouvrir un AUTRE
        // paragraphe, reste ancrée sur CE paragraphe-là, pas sur le sien
        // (souvent vide une fois l'image sortie du flux).
        image._anchorTargetId = anchorTargetId;
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
  function inlineRuns(node, parentStyle, floatingImages) { const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE }); if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ text: node.nodeValue, ...style }] : []; if (node.nodeType !== Node.ELEMENT_NODE) return []; if (node.classList.contains('page-break-marker')) return []; if (node.classList.contains('two-columns-marker')) return []; if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }]; if (node.classList.contains('editor-image')) { if (floatingImages && !node.hasAttribute('data-pdf-skip') && (node.getAttribute('src') || '').startsWith('data:')) { floatingImages.push(pdfImageFromNode(node)); } return []; } if (node.tagName === 'BR') return [{ text: '\n', ...style }]; let runs = []; node.childNodes.forEach(child => { runs = runs.concat(inlineRuns(child, style, floatingImages)); }); return runs; }
  function isBlock(node) { return node.nodeType === Node.ELEMENT_NODE && (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TABLE|HR)$/i.test(node.tagName)); }
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
        const text = trimEdgeWhitespace(inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }));
        const pdfCell = { text: text.length ? text : ' ', margin: [4, 3, 4, 3], border: [true, true, true, true], lineHeight: LINE_HEIGHT_RATIO };
        const align = alignment(cell);
        if (align) pdfCell.alignment = align;
        if (colSpan > 1) pdfCell.colSpan = colSpan;
        output.push(pdfCell);
        for (let i = 1; i < colSpan; i += 1) output.push({});
      });
      while (output.length < columnCount) output.push({ text: ' ', margin: [4, 3, 4, 3], border: [true, true, true, true] });
      return output.slice(0, columnCount);
    });
    const table = {
      table: { headerRows: 0, widths: Array(columnCount).fill(Math.max(12, (595.28 - 56) / columnCount)), body: body.length ? body : [[{ text: ' ', margin: [4, 3, 4, 3] }].concat(Array(Math.max(0, columnCount - 1)).fill({}) )] },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#777777', vLineColor: () => '#777777', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 5, 0, 5]
    };
    if (pageBreakBefore) table.pageBreak = 'before';
    return table;
  }
  function twoColumnsFrom(node, pageBreakBefore) {
    const colNodes = Array.from(node.querySelectorAll(':scope > .two-columns-column')).slice(0, 2);
    // Réapplique explicitement l'alignement (ql-align-center / -right / -justify
    // ou style inline text-align) à CHAQUE bloc pdfmake issu du contenu de la
    // colonne. Le flux hors-colonnes le fait déjà via blockFrom() /
    // alignment() ; on reproduit exactement la même sémantique ici pour que
    // les zones à 2 colonnes honorent enfin ql-align-justify à l'export PDF
    // vectoriel (bug : le justify était perdu à l'export PDF dans les
    // .two-columns-column). L'alignement par défaut (gauche) reste implicite
    // côté pdfmake, on ne l'écrit donc que si une valeur explicite est lue.
    const columns = colNodes.map(col => {
      const blocks = htmlToPdfContent(col.innerHTML);
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
    const pageWidth = 595.28;
    const margins = 56;
    const columnGap = 16;
    const availableWidth = pageWidth - margins - columnGap;
    // La poignée de redimensionnement (editor.js, .two-columns-resize-grip) ne
    // change QUE la variable CSS --layout-left du conteneur ; jusqu'ici cette
    // fonction ignorait totalement cette valeur et imposait un partage 50/50
    // fixe - la largeur ajustée dans l'éditeur n'avait donc littéralement
    // aucun effet sur l'export PDF. On lit maintenant cette même variable
    // (posée en style INLINE par le glisser, cf. editor.js) pour répartir
    // `availableWidth` dans les mêmes proportions que la grille CSS de
    // l'éditeur (`grid-template-columns: var(--layout-left) calc(100% -
    // var(--layout-left) - 18px)`), en excluant le gap des deux côtés comme
    // le fait déjà `availableWidth` pour le cas 50/50.
    let leftPercent = parseFloat(node.style.getPropertyValue('--layout-left'));
    if (!Number.isFinite(leftPercent)) leftPercent = 50;
    leftPercent = Math.max(20, Math.min(80, leftPercent));
    const leftWidth = availableWidth * (leftPercent / 100);
    const rightWidth = availableWidth - leftWidth;
    const block = { columns: columns, columnWidths: [leftWidth, rightWidth], columnGap: columnGap, margin: [0, 6, 0, 6] };
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
    const runs = trimEdgeWhitespace(inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE }, images));
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
    const block = { text: runs.length ? runs : ' ', margin: runs.length ? [0, tag.match(/^H[1-6]$/) ? 5 : 2, 0, 4] : [0, 0, 0, 0], lineHeight: LINE_HEIGHT_RATIO };
    const align = alignment(node); if (align) block.alignment = align;
    if (/^H[1-6]$/.test(tag)) block.bold = true;
    if (tag === 'LI') { block.text = runs.length ? [{ text: '• ', fontSize: DEFAULT_FONT_SIZE }].concat(runs) : ' '; block.margin[0] = 10; }
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [18, 4, 8, 4]; }
    if (remainingPageBreak) { block.pageBreak = 'before'; remainingPageBreak = false; }
    blocks.push(block);
    images.forEach(img => {
      const layer = img._layer; delete img._layer;
      if (layer === 'behind' && behindImages) { behindImages.push(img); return; }
      if (layer === 'front' && frontImages) { frontImages.push(img); return; }
      if (remainingPageBreak) { img.pageBreak = 'before'; remainingPageBreak = false; }
      blocks.push(img);
    });
    return blocks;
  }
  // Résout la position finale des images en calque ancrées (data-anchor-off-*,
  // cf. pdfImageFromNode) une fois qu'une 1ère passe de mise en page pdfmake a
  // rempli `.positions` sur leur bloc-paragraphe ancre. À appeler après avoir
  // fait générer ce premier PDF "de mesure" (jamais montré à l'utilisateur).
  function resolveAnchoredImagePositions(pendingImages) {
    return pendingImages.map(img => {
      const offset = img._pendingOffset;
      const anchor = img._anchorBlock;
      if (anchor && anchor.block && anchor.block.positions && anchor.block.positions[0]) {
        // x part de anchor.containerLeft (bord gauche de la BOÎTE du paragraphe,
        // cf. calcul dans htmlToPdfContent), PAS de anchor.block.positions[0].left :
        // pour un paragraphe centré/aligné à droite, .positions[0].left est le bord
        // gauche du TEXTE RENDU de cette ligne précise (déjà décalé par le centrage,
        // et variable ligne par ligne selon leur largeur) - alors que offset.left
        // (editor.js:updateAnchorOffset) est mesuré par rapport à getBoundingClientRect()
        // du paragraphe, c'est-à-dire le bord gauche de sa BOÎTE, insensible à
        // l'alignement du texte qu'elle contient. Additionner offset.left à
        // .positions[0].left revenait donc à appliquer DEUX FOIS l'effet du
        // centrage (une fois dans le rendu pdfmake, une fois dans l'offset
        // éditeur qui l'ignore) - confirmé comme cause du décalage persistant
        // signalé par l'utilisateur sur un paragraphe centré.
        return { x: anchor.containerLeft + offset.left * PX_TO_PT, y: anchor.block.positions[0].top + offset.top * PX_TO_PT };
      }
      // Paragraphe ancre sans texte (image seule sur sa ligne) : pas de position
      // pdfmake à lire, on retombe sur l'ancien calcul (marge de page).
      return { x: PAGE_MARGIN_PT + offset.left * PX_TO_PT, y: PAGE_MARGIN_PT + offset.top * PX_TO_PT };
    });
  }
  // Les images "derrière le texte" sont préfixées avant tout le reste du
  // contenu (peintes en premier, donc recouvertes par tout ce qui suit) et
  // celles "devant" ajoutées après tout (peintes en dernier, donc par-dessus) :
  // pdfmake n'a pas de z-index, seul l'ordre d'insertion dans content[]
  // détermine l'ordre de peinture. absolutePosition les sort de toute façon du
  // flux normal, donc ce réordonnancement n'affecte pas la mise en page du
  // reste du document.
  function htmlToPdfContent(html) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    const blocks = []; const frontImages = []; const behindImages = [];
    // data-pm-anchor-id -> bloc pdfmake correspondant (cf. editor.js:findVisualAnchor
    // / ensureAnchorId) : une image en calque peut être ancrée sur un paragraphe
    // qui n'est PAS celui qui la contient dans le DOM (glissée pour recouvrir un
    // autre paragraphe que le sien), donc potentiellement traité avant OU après
    // elle dans ce parcours - la résolution se fait après coup, une fois tout
    // le document parcouru (cf. boucle finale ci-dessous).
    const anchorIdToBlock = {};
    let pendingPageBreak = false;
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) blocks.push({ text: node.nodeValue, margin: [0, 2, 0, 4], lineHeight: LINE_HEIGHT_RATIO, ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; return; }
      if (node.classList.contains('editable-table')) { const table = node.querySelector('table'); if (table) blocks.push(tableFrom(table, pendingPageBreak)); pendingPageBreak = false; return; }
      if (node.classList.contains('two-columns-zone')) { blocks.push(twoColumnsFrom(node, pendingPageBreak)); pendingPageBreak = false; return; }
      if (isBlock(node)) {
        const produced = blockFrom(node, pendingPageBreak, frontImages, behindImages);
        produced.forEach(b => blocks.push(b));
        if (node.dataset && node.dataset.pmAnchorId) {
          const textBlock = produced.find(b => b && b.text);
          if (textBlock) {
            anchorIdToBlock[node.dataset.pmAnchorId] = {
              block: textBlock,
              containerLeft: PAGE_MARGIN_PT + (textBlock.margin ? textBlock.margin[0] : 0),
            };
          }
        }
        pendingPageBreak = false;
        return;
      }
      node.childNodes.forEach(visit);
    };
    root.childNodes.forEach(visit);
    behindImages.concat(frontImages).forEach(img => {
      if (!img._pendingOffset) return;
      img._anchorBlock = anchorIdToBlock[img._anchorTargetId] || null;
      delete img._anchorTargetId;
    });
    const content = blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
    return behindImages.concat(content, frontImages);
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
  // rendu, silencieusement. On convertit donc chaque <img class="editor-image">
  // avant de construire le docDefinition (+ rastérisation si SVG, cf. ci-dessus) ;
  // en cas d'échec (réseau, CORS...), on marque l'image à ignorer plutôt que de
  // faire planter tout l'export PDF.
  async function inlineEditorImagesAsDataUri(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';
    const images = Array.from(wrapper.querySelectorAll('img.editor-image'));
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
  async function resolveNativePdfContent(inlinedHtml, filename) {
    let content = htmlToPdfContent(inlinedHtml);
    const pending = content.filter(b => b && b._pendingOffset);
    if (!pending.length) return content;
    await new Promise(resolve => { window.pdfMake.createPdf(buildNativeDocDefinition(content, filename)).getBuffer(() => resolve()); });
    const resolved = resolveAnchoredImagePositions(pending);
    content = htmlToPdfContent(inlinedHtml);
    content.filter(b => b && b._pendingOffset).forEach((img, i) => {
      if (resolved[i]) img.absolutePosition = resolved[i];
      delete img._pendingOffset;
      delete img._anchorBlock;
    });
    return content;
  }
  async function exportNativePdf(resolvedHtml, filename) { if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.'); const inlinedHtml = await inlineEditorImagesAsDataUri(resolvedHtml); const content = await resolveNativePdfContent(inlinedHtml, filename); const docDefinition = buildNativeDocDefinition(content, filename); window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf'); }
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
  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality) { if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; } const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record); const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record); if (quality === 'native') { await exportNativePdf(resolvedHtml, filename); return; } if (quality === 'browser-print') { await exportViaBrowserPrint(resolvedHtml, filename); return; } const container = document.createElement('div'); container.style.padding = '20px'; container.style.position = 'relative'; container.style.fontFamily = 'Arial, sans-serif'; container.innerHTML = resolvedHtml; container.querySelectorAll('.page-break-marker').forEach(marker => { marker.innerHTML = ''; marker.style.border = '0'; marker.style.background = 'transparent'; marker.style.color = 'transparent'; marker.style.height = '0'; marker.style.margin = '0'; marker.style.pageBreakAfter = 'always'; marker.style.breakAfter = 'page'; }); container.querySelectorAll('.two-columns-marker').forEach(marker => { marker.innerHTML = ''; marker.style.display = 'none'; }); document.body.appendChild(container); const preset = getQualityPreset(quality); const opt = { margin: 10, filename: (filename || 'publipostage') + '.pdf', image: preset.image, html2canvas: preset.html2canvas, jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}), pagebreak: { mode: ['css', 'legacy'], avoid: '.var-badge' } }; try { await html2pdf().set(opt).from(container).save(); } finally { document.body.removeChild(container); } }
  return { exportCurrentRecord };
})();