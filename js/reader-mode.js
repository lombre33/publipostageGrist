// Mode Lecture : le document tel qu'il se lit et s'exporte (zones répétées déroulées, conditions évaluées, variables résolues pour la ligne
// affichée), paginé en feuilles comme l'Aperçu A4 de l'éditeur. Les exports passent par preview(), qui fait la même résolution sans la mise en page.
const ReaderMode = (function () {
  let lastCurrentTableId = null;
  function parseBadgeFormat(badge) {
    // Format nombre/date choisi via la barre flottante d'une bulle #Variable, sérialisé en JSON dans data-format ; transmis à
    // Variables.resolveVariable.
    const raw = badge.getAttribute('data-format');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // Options de résolution d'un élément copié par une zone répétée (js/loop-rules.js) : sa valeur est lue dans la ligne du tour.
  function loopOpts(binding) { return binding ? { loop: binding } : undefined; }
  // Les bulles à résoudre : celles d'une variable et celles d'un calcul (js/variable-calc.js).
  const BADGE_SELECTOR = '.var-badge, .calc-badge';
  const isCalcBadge = badge => badge.classList.contains('calc-badge');
  async function badgeConditionHolds(badge, tableId, record, binding) {
    // Condition d'affichage d'une bulle #Variable (data-condition, js/variable-condition.js) : faux = la bulle disparaît de la lecture et de
    // l'export, le texte autour reste. Une condition illisible masque la bulle, comme une règle illisible de macro-modèle
    // (js/condition-rules.js:matches). `binding` : ligne du tour d'une zone répétée (js/loop-rules.js:bindingOf) - une règle sur une colonne de la
    // table de la boucle lit alors cette ligne.
    const raw = badge.getAttribute('data-condition');
    if (!raw) return true;
    let condition = null;
    try { condition = JSON.parse(raw); } catch (e) { console.error('[ReaderMode] condition de variable illisible', e); return false; }
    try { return await ConditionRules.conditionHolds(condition, tableId, record, loopOpts(binding)); }
    catch (e) { console.error('[ReaderMode] échec de l\'évaluation d\'une condition de variable', e); return false; }
  }
  // Le texte « Avant » / « Après » d'une bulle #Variable (data-before / data-after, fenêtre de js/variable-condition.js), écrit tout contre sa valeur
  // résolue `node` et dans le même élément : le style de la valeur (gras, couleur, taille) est aussi le sien dans la Lecture comme dans tous les
  // exports. Seulement quand il y a quelque chose à lire, du texte ou une image : la virgule d'une variable masquée, vide, sans valeur ou en erreur
  // (`isError`) ne s'écrit pas. Rend `node`.
  function withAffixes(badge, node, isError) {
    const around = VariableFormat.affixes(badge.getAttribute('data-before'), badge.getAttribute('data-after'));
    if (!around || isError || node.nodeType === Node.TEXT_NODE) return node;
    if (node.textContent.trim() === '' && !node.querySelector('img')) return node;
    if (around.before) node.prepend(document.createTextNode(around.before));
    if (around.after) node.append(document.createTextNode(around.after));
    return node;
  }
  // === Aperçu paginé réel - mode Lecture ===
  // Parallèle à l'aperçu de l'éditeur (js/header-footer-preview.js:computePageBreaks, renderPaginationOverlay), sur du contenu statique déjà résolu :
  // pas de débounce nécessaire. Les deux sont à tenir d'accord, mais lisent un DOM différent : l'éditeur mesure les enfants de `.tiptap` (avec les
  // enveloppes de tableau, de zone à deux colonnes et de texte conditionnel), la Lecture ceux du HTML sérialisé de `.reader-content`.

  function isSplittableByExport(el) {
    // Blocs que l'export coupe en cours de route (pdfmake, au pixel : entre deux lignes d'une colonne, deux lignes d'un tableau, deux éléments d'une
    // liste) mais que cet aperçu, qui ne coupe pas le DOM, traite d'une pièce. Même règle que js/header-footer-preview.js:isSplittableByExport, sur
    // le HTML sérialisé de la Lecture (zone `two-columns-zone` et tableau sans l'enveloppe de l'éditeur).
    return el.classList.contains('two-columns-zone') || el.tagName === 'TABLE' || el.tagName === 'UL' || el.tagName === 'OL';
  }
  // Les coupures de page de la Lecture : accumule la hauteur des blocs de premier niveau de `.reader-content`, un `.page-break-marker` étant une
  // coupure forcée. Rend, pour chaque coupure, le décalage `{ top, afterIndex, remainingPx }` (`afterIndex` : le rang du bloc après lequel elle
  // tombe). Le grain est le bloc, jamais coupé en deux (le PDF coupe au pixel). Un bloc qui ne tient pas passe entier à la page suivante, sauf s'il
  // est de ceux que l'export coupe (isSplittableByExport) et que sa plus grande partie tient dans la place restante : il reste alors sur sa page et
  // le repère tombe derrière lui. Le déplacer en entier reviendrait à se tromper de tout ce qui tenait dans la page (un tableau ou une zone à deux
  // colonnes qui déborde de ~30 px, envoyé en page 2, page 1 presque vide) au lieu de se tromper de ce qui déborde.
  function computePageBreakOffsets(rootEl, pageContentHeightPx) {
    const rootRect = rootEl.getBoundingClientRect();
    const zoom = EditorCore.layoutZoom(rootEl);
    const heightOf = el => el.getBoundingClientRect().height / zoom;
    const totalHeight = els => els.reduce((sum, el) => sum + heightOf(el), 0);
    const children = Array.from(rootEl.children);
    const offsets = [];
    let consumed = 0;
    let counted = 0;
    const cutBefore = (top, index) => offsets.push({ top, afterIndex: index - 1, remainingPx: 0 });
    // La légende d'une image ou d'un tableau reste avec son bloc (js/caption.js, « Rester ensemble », comme dans
    // js/header-footer-preview.js:computePageBreaks) : le bloc et ses légendes comptent pour un seul bloc ; pour un tableau coupé entre deux lignes,
    // la dernière ligne et la légende. Hauteur d'une suite « Garder avec le suivant » d'un seul tenant : ses paragraphes et le bloc qui la suit, avec
    // sa légende ou, pour un tableau, sa première tranche.
    const keptRunPx = run => {
      const membersPx = totalHeight(run.members);
      if (!run.target) return membersPx;
      const captions = Caption.captionsAfter(run.target);
      const targetPx = heightOf(run.target);
      const withCaptionPx = targetPx + totalHeight(captions);
      const table = run.target.tagName === 'TABLE' ? TablePageCut.measure(run.target, run.target, zoom, pageContentHeightPx, null, 0) : null;
      if (table) return membersPx + table.segs[0];
      return membersPx + (captions.length > 0 && Caption.fitsWithCaption(withCaptionPx, pageContentHeightPx) ? withCaptionPx : targetPx);
    };
    // « Garder avec le suivant » (js/keep-with-next.js) : les paragraphes gardés qui se suivent et le bloc qui les suit passent ensemble à la page
    // suivante s'ils ne tiennent pas dans la place restante, sauf au-delà de 90 % d'une page.
    const keepRunTogether = (index, top) => {
      const run = KeepWithNext.runFrom(children, index, children.length);
      if (!(consumed > 0 && run)) return;
      const unit = keptRunPx(run);
      if (unit > pageContentHeightPx - consumed && KeepWithNext.fits(unit, pageContentHeightPx)) { cutBefore(top, index); consumed = 0; }
    };
    // Un tableau de premier niveau fait exception : il se coupe entre deux lignes (js/table-page-cut.js, comme l'éditeur, le PDF et le Word), les
    // lignes qui ne tiennent pas ouvrent la page suivante. Le décalage porte alors `rowIndex` (rang de la première ligne de la page qui commence) et
    // `afterIndex` est celui du tableau. Les lignes qu'une case fusionnée sur plusieurs lignes lie passent ensemble. Un tableau qu'on ne sait pas
    // couper ainsi (ligne ou groupe de lignes plus haut que la page...) suit la règle des autres blocs.
    const placeCutTable = (block, cuttable) => {
      const { index, top } = block;
      const tablePlan = TablePageCut.plan(consumed, cuttable.segs, pageContentHeightPx, cuttable.starts);
      if (tablePlan.blockBreakBefore) cutBefore(top, index);
      tablePlan.cuts.forEach((rowIndex, k) => offsets.push({ top: top + cuttable.segs.slice(0, tablePlan.ranks[k]).reduce((sum, seg) => sum + seg, 0), afterIndex: index, rowIndex, remainingPx: 0 }));
      consumed = tablePlan.consumedAfter;
      if (cuttable.keepsTail) counted = index + 1 + block.captions.length;
    };
    const placeBlock = block => {
      const { child, index, top, height, captions, captionPx } = block;
      const keeps = captions.length > 0 && Caption.fitsWithCaption(height + captionPx, pageContentHeightPx);
      const unitHeight = keeps ? height + captionPx : height;
      const staysOnPage = !keeps && isSplittableByExport(child) && pageContentHeightPx - consumed > height / 2;
      if (consumed > 0 && consumed + unitHeight > pageContentHeightPx && !staysOnPage) { cutBefore(top, index); consumed = unitHeight; }
      else { consumed += unitHeight; }
      if (keeps) counted = index + 1 + captions.length;
    };
    children.forEach((child, index) => {
      if (index < counted) return;
      const rect = child.getBoundingClientRect();
      const top = (rect.top - rootRect.top) / zoom;
      const height = rect.height / zoom;
      if (child.classList.contains('page-break-marker')) {
        offsets.push({ top: top + height, afterIndex: index, remainingPx: Math.max(0, pageContentHeightPx - consumed) });
        consumed = 0;
        return;
      }
      keepRunTogether(index, top);
      const captions = Caption.captionsAfter(child);
      const captionPx = totalHeight(captions);
      const block = { child, index, top, height, captions, captionPx };
      const cuttable = child.tagName === 'TABLE' ? TablePageCut.measure(child, child, zoom, pageContentHeightPx, null, captionPx) : null;
      if (cuttable) placeCutTable(block, cuttable);
      else placeBlock(block);
    });
    return offsets;
  }
  // Ligne vide (Entrée deux fois) : Editor.getHTML() la sérialise en <p></p>. Dans l'éditeur, ProseMirror ne lui garde sa ligne que par un <br
  // class="ProseMirror-trailingBreak"> absent de ce HTML, et les paragraphes n'ont ici aucune marge (margin: 0) : sans hauteur propre, l'espacement
  // entre deux blocs disparaîtrait en Lecture alors que l'éditeur et les exports le gardent. Appelée après la résolution des bulles : un paragraphe
  // qui ne contenait qu'une bulle vide ou masquée par sa condition garde lui aussi sa ligne, comme dans l'export. Un <br> saisi (Maj+Entrée) compte
  // comme du contenu et n'est jamais doublé : le PDF n'ajoute pas non plus de ligne après un retour à la ligne placé en fin de paragraphe.
  const BLANK_LINE_BLOCKS = 'p, h1, h2, h3, h4, h5, h6';
  // Ce qui occupe une ligne sans porter de texte : le marqueur de note de bas de page n'a que le numéro de son compteur CSS.
  const NON_TEXT_CONTENT = 'img, br, svg, canvas, video, audio, iframe, object, embed, input, .footnote-ref-marker';
  // Une image en calque (devant ou derrière le texte) est hors du flux : elle ne remplit pas la ligne de son paragraphe. Celui qui n'en porte que
  // garde donc sa ligne, comme dans l'éditeur, où ProseMirror la lui laisse (sans cela, la Lecture était d'une ligne plus haute que l'éditeur quand
  // le calque « Sur toutes les pages » est posé dans une ligne vide en haut du modèle), et comme le PDF et le Word. Il en va de même d'une image
  // alignée à gauche ou à droite : elle flotte (css/style.css, comme dans l'éditeur), le texte l'habille, et le paragraphe où elle est seule garde sa
  // ligne.
  const FLOAT_IMAGE_SELECTOR = 'img.editor-image[data-align="left"], img.editor-image[data-align="right"]';
  function holdsInFlowContent(block) {
    return Array.from(block.querySelectorAll(NON_TEXT_CONTENT)).some(el => !el.matches(LAYER_IMAGE_SELECTOR) && !el.matches(FLOAT_IMAGE_SELECTOR));
  }
  function keepBlankLines(root) {
    root.querySelectorAll(BLANK_LINE_BLOCKS).forEach(block => {
      if (block.textContent !== '' || holdsInFlowContent(block)) return;
      const filler = document.createElement('br');
      filler.className = 'pp-blank-line';
      block.appendChild(filler);
    });
  }
  // Fin de document sans rien à montrer : quand il n'y a pas de contenu, les marges ne créent pas de nouvelle page. Une dernière ligne vide (Entrée
  // de trop, ou le paragraphe que l'éditeur laisse toujours derrière un tableau ou une zone à deux colonnes) ne s'imprime pas, mais quand le texte
  // arrive à la marge du bas elle n'y tient plus et ouvre une page blanche : en Lecture, dans le PDF et dans le Word. Ces blocs sont donc retirés de
  // la fin du document (ceux du milieu gardent leur ligne, cf. keepBlankLines), ainsi que les lignes vides au bas des colonnes d'une dernière zone à
  // deux colonnes : sans cadre ni fond à l'impression, elles ne font que la rallonger. Appelée sur le HTML déjà résolu (une bulle vide ou masquée ne
  // laisse que son paragraphe).
  //
  // « Rien à montrer » : un paragraphe, une zone à deux colonnes ou un saut de page sans texte, image, tableau, liste, citation, encadré, note ni
  // numéro de page ; un titre n'en est jamais un (sa numérotation s'écrit même sans texte). Le premier bloc reste toujours : un modèle vide garde sa
  // ligne.
  const VISIBLE_CONTENT = 'img, svg, canvas, video, audio, iframe, object, embed, input, table, hr, ul, ol, pre, blockquote, .callout, .toc-marker, .footnote-ref-marker, .page-number-badge';
  function hasNothingToShow(el) {
    if (el.classList.contains('page-break-marker')) return true;
    if (el.tagName !== 'P' && !el.classList.contains('two-columns-zone')) return false;
    return !el.textContent.replace(/[\s\u00a0\u200b]/g, '') && !el.querySelector(VISIBLE_CONTENT);
  }
  function isDocumentFurniture(node) {
    // Ce qui ne compte pas comme bloc en fin de document : espaces entre deux balises, commentaires, <style> et réglage de la numérotation des
    // titres.
    if (node.nodeType === Node.ELEMENT_NODE) return node.tagName === 'STYLE' || node.classList.contains('heading-numbering-config');
    return node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim());
  }
  function isFirstPageLayerImage(el) {
    // Une ligne de fin qui ne porte que des images en calque posées sur la page 1 : dans un petit format, une image flottante sur la première page
    // « crée une deuxième page ». L'image est placée par sa grille de page, pas par la ligne qui la porte, et cette ligne n'a rien à montrer dans le
    // flux : quand le texte arrive à la marge du bas elle n'y tient plus et ouvre une page blanche, comme une ligne vide. La page 1 existe toujours :
    // seules ces images-là sont dispensées, une image d'une page 2 ou plus a pu demander la page que sa ligne ouvre. Il faut la grille entière
    // (`data-page-index` et les deux décalages, ce que lit pdf-export.js:pdfImageFromNode) : sans elle l'image n'est placée que par son paragraphe,
    // et la ligne reste. Même règle, sur le DOM de l'éditeur, dans js/header-footer-preview.js:isTailAnchorParagraph.
    return el.matches(LAYER_IMAGE_SELECTOR) && parseInt(el.getAttribute('data-page-index'), 10) === 0
      && Number.isFinite(parseFloat(el.getAttribute('data-page-left-pt'))) && Number.isFinite(parseFloat(el.getAttribute('data-page-top-pt')));
  }
  function isTailAnchor(el) {
    if (el.tagName !== 'P' || el.textContent.replace(/[\s ​]/g, '')) return false;
    const children = Array.from(el.children);
    return children.length > 0 && children.every(isFirstPageLayerImage);
  }
  function carryTailAnchors(root, blocks) {
    // Ces lignes de fin (et les lignes vides qui les séparent) quittent le flux : le dernier paragraphe de texte qui les précède reprend leurs
    // images, posées par leur grille quel que soit le paragraphe qui les porte, et elles sont retirées. Sans paragraphe de texte avant elles (un
    // tableau, une liste, un titre, un saut de page, ou le début du document) la ligne reste : l'image n'aurait pas d'hôte, et c'est la même
    // condition dans l'éditeur (js/header-footer-preview.js:trailingBlankStart).
    let from = blocks.length;
    while (from > 1 && blocks[from - 1].nodeType === Node.ELEMENT_NODE && blocks[from - 1].tagName === 'P' && (isTailAnchor(blocks[from - 1]) || hasNothingToShow(blocks[from - 1]))) from--;
    const tail = blocks.slice(from);
    const host = blocks[from - 1];
    if (!tail.some(isTailAnchor) || !host || host.nodeType !== Node.ELEMENT_NODE || host.tagName !== 'P' || host.hasAttribute('data-caption') || hasNothingToShow(host) || isTailAnchor(host)) return;
    tail.forEach(block => {
      Array.from(block.children).filter(isFirstPageLayerImage).forEach(img => host.appendChild(img));
      root.removeChild(block);
    });
    blocks.length = from;
  }
  function trimTrailingBlankBlocks(root) {
    const blocks = Array.from(root.childNodes).filter(node => !isDocumentFurniture(node));
    while (blocks.length > 1 && blocks[blocks.length - 1].nodeType === Node.ELEMENT_NODE && hasNothingToShow(blocks[blocks.length - 1])) root.removeChild(blocks.pop());
    carryTailAnchors(root, blocks);
    const last = blocks[blocks.length - 1];
    if (!last || last.nodeType !== Node.ELEMENT_NODE || !last.classList.contains('two-columns-zone')) return;
    last.querySelectorAll(':scope > .two-columns-column').forEach(column => {
      while (column.children.length > 1 && column.lastElementChild.tagName === 'P' && hasNothingToShow(column.lastElementChild)) column.removeChild(column.lastElementChild);
    });
  }
  function applyAcceptedView(wrapper, source, options) {
    // Les suggestions du suivi des modifications encore en attente (js/track-changes.js) : le document s'écrit comme si elles étaient toutes
    // acceptées. Si la vue échoue, il reste tel qu'il est écrit (suggestions visibles) plutôt qu'à moitié transformé ou vide, et l'erreur va à la
    // console. `options.tint: false` : sans teinte.
    try { TrackChanges.acceptedView(wrapper, options); } catch (e) {
      console.error('[reader-mode] vue « comme acceptée » impossible, les suggestions restent affichées', e);
      wrapper.innerHTML = source;
    }
  }
  async function resolveHeaderFooterZone(html, tableId, record) {
    // Les #Variable d'un fragment d'en-tête ou de pied, résolues comme celles du corps (bulles remplacées par leur valeur) avec l'enregistrement
    // Grist affiché en Lecture.
    if (!html) return html;
    // Cette zone s'affiche (aperçu paginé de la Lecture) : ses images d'un autre site pas encore affichées prennent leur cadre avant l'innerHTML.
    html = ExternalImages.block(html);
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    // Comme le corps : les suggestions du suivi acceptées, avec la teinte légère.
    applyAcceptedView(wrapper, html);
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à
    // résoudre.
    await ConditionalText.resolve(wrapper, tableId, record);
    await ConditionalValue.resolve(wrapper, tableId, record);
    await ConditionalCheckbox.resolve(wrapper, tableId, record);
    const badges = wrapper.querySelectorAll(BADGE_SELECTOR);
    await Promise.all(Array.from(badges).map(async badge => {
      const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column');
      const format = parseBadgeFormat(badge);
      const binding = LoopRules.bindingOf(badge);
      if (isCalcBadge(badge)) { const span = document.createElement('span'); span.textContent = await Variables.resolveCalc(badge.getAttribute('data-formula') || '', tableId, record, format, loopOpts(binding)); badge.replaceWith(span); return; }
      if (!(await badgeConditionHolds(badge, tableId, record, binding))) { badge.replaceWith(document.createTextNode('')); return; }
      const inline = await resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx);
      if (inline) { badge.replaceWith(withAffixes(badge, inline.node, inline.isError)); return; }
      try { const value = await Variables.resolveVariable(table, column, tableId, record, format, loopOpts(binding)); badge.replaceWith(withAffixes(badge, valueNode(value, format, ''))); }
      catch (e) { console.warn('[reader-mode] variable d\'en-tête ou de pied illisible, sa bulle reste telle quelle', e); }
    }));
    LoopRules.removeHiddenBlocks(wrapper);
    // La note de bas de page n'est volontairement pas insérable en en-tête ni en pied (aucun repère de page dans une zone répétée sur chaque page) :
    // resolveSmartChips ne trouve donc jamais de .footnote-ref-marker ici.
    await resolveSmartChips(wrapper);
    keepBlankLines(wrapper);
    return wrapper.innerHTML;
  }
  function buildSeam(opts) {
    // Une couture rejoue ce qui sépare deux feuilles physiques, à leur vraie taille : le bas de la page qui finit (sa marge du bas, la bande de son
    // pied : `foot`, avec le pied tout en haut, juste sous le texte), la gouttière du plan de travail, puis le haut de la page qui commence (la bande
    // de son en-tête, sa marge du haut : `head`, avec l'en-tête à la moitié de la marge, comme dans le PDF). Même structure que l'éditeur
    // (js/header-footer-preview.js:buildSeam), sans zones cliquables : la Lecture n'ouvre rien. Bas et haut de page transparents, la feuille blanche
    // est derrière (`.v2-reader-paper`).
    const { footerText, headerText, pageEnding, pageStarting, totalPages, footAreaPx, headAreaPx, topMarginPx } = opts;
    const seam = document.createElement('div');
    seam.className = 'v2-page-band ' + ((!footerText && !headerText) ? 'v2-page-break-line' : 'v2-page-seam');
    const foot = document.createElement('div');
    foot.className = 'v2-page-seam-foot';
    foot.style.height = footAreaPx + 'px';
    if (footerText) {
      const f = document.createElement('div');
      f.className = 'v2-page-band-footer';
      f.innerHTML = PageLayout.resolvePageNumberBadges(footerText, pageEnding, totalPages);
      f.style.paddingTop = '0';
      f.style.maxHeight = footAreaPx + 'px';
      foot.appendChild(f);
    }
    const divider = document.createElement('div');
    divider.className = 'v2-page-seam-divider';
    if (!footerText && !headerText) {
      const label = document.createElement('span'); label.className = 'v2-page-break-label'; label.textContent = 'Page ' + pageStarting;
      divider.appendChild(label);
    }
    const head = document.createElement('div');
    head.className = 'v2-page-seam-head';
    head.style.height = headAreaPx + 'px';
    if (headerText) {
      const h = document.createElement('div');
      h.className = 'v2-page-band-header';
      h.innerHTML = PageLayout.resolvePageNumberBadges(headerText, pageStarting, totalPages);
      h.style.paddingTop = (topMarginPx / 2) + 'px';
      h.style.maxHeight = headAreaPx + 'px';
      head.appendChild(h);
    }
    seam.appendChild(foot); seam.appendChild(divider); seam.appendChild(head);
    return { seam, divider };
  }
  async function resolvePaginationZones(headerFooterData, tableId, record) {
    // Les quatre fragments d'en-tête et de pied, résolus : leurs #Variable relisent des tables, d'où une résolution par rendu et non à chaque mise en
    // page (renderPaginationPreview se refait quand une image finit de charger, cf. watchGeometry).
    //
    // Sans en-tête ni pied configuré, les quatre restent null : la Lecture montre quand même chaque frontière de page, comme l'éditeur avec son
    // repère « Page N » ; le document garde ses gouttières, mais pas d'espaceur de bord (rien à y afficher : une bande blanche vide flotterait
    // au-dessus et en dessous de la feuille).
    const hfEnabled = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = hfEnabled && !!headerFooterData.differentFirstPage;
    const headerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.default, tableId, record) : null;
    const headerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.first, tableId, record) : null;
    const footerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.default, tableId, record) : null;
    const footerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.first, tableId, record) : null;
    return { differentFirstPage, headerDefault, headerFirst, footerDefault, footerFirst };
  }
  function zoneForPage(zones, kind, n) {
    // La variante d'en-tête ou de pied de la page `n` (`kind` : 'header' ou 'footer') : celle de la première page quand elle a la sienne.
    return (n === 1 && zones.differentFirstPage) ? zones[kind + 'First'] : zones[kind + 'Default'];
  }
  function paginationGeometry(zones) {
    // Bandes et hauteur utile d'une page : une bande n'est réservée que si une de ses variantes a du contenu. Les marges du modèle, lues à chaud
    // (js/page-layout.js) : le padding de `.reader-content` en Aperçu A4 (css/editor-v2.css) en prend les valeurs.
    const { hasZoneContent, HEADER_FOOTER_BAND_PX } = PageLayout;
    const topBandPx = (hasZoneContent(zones.headerDefault) || hasZoneContent(zones.headerFirst)) ? HEADER_FOOTER_BAND_PX : 0;
    const bottomBandPx = (hasZoneContent(zones.footerDefault) || hasZoneContent(zones.footerFirst)) ? HEADER_FOOTER_BAND_PX : 0;
    const mPx = PageLayout.getMarginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - mPx.top - mPx.bottom - topBandPx - bottomBandPx);
    return { topBandPx, bottomBandPx, mPx, pageContentHeightPx };
  }
  function edgeSpacer(side, zoneHtml, page, totalPages) {
    const el = document.createElement('div');
    el.className = 'v2-page-edge-spacer v2-page-edge-' + side;
    el.innerHTML = zoneHtml ? PageLayout.resolvePageNumberBadges(zoneHtml, page, totalPages) : '';
    return el;
  }
  function addEdgeSpacers(container, wrapper, zones, geometry, totalPages) {
    // Les bandes du PDF, sur la première et la dernière page : un espaceur par bande réservée, vide quand la variante de cette page n'a rien (page 1
    // sans en-tête alors que les autres en ont un). Collés à la feuille, dont ils prolongent la page : le haut de la page est le haut de l'espaceur,
    // le contenu de l'en-tête à la moitié de la marge du haut comme dans le PDF ; le pied recouvre la marge du bas de la feuille et commence juste
    // sous le texte, là où le PDF le peint.
    const { topBandPx, bottomBandPx, mPx } = geometry;
    let edgeTopEl = null; let edgeBottomEl = null;
    if (topBandPx) {
      edgeTopEl = edgeSpacer('top', zoneForPage(zones, 'header', 1), 1, totalPages);
      edgeTopEl.style.height = topBandPx + 'px';
      edgeTopEl.style.paddingTop = (mPx.top / 2) + 'px';
      container.insertBefore(edgeTopEl, wrapper);
    }
    if (bottomBandPx) {
      edgeBottomEl = edgeSpacer('bottom', zoneForPage(zones, 'footer', totalPages), totalPages, totalPages);
      edgeBottomEl.style.height = (bottomBandPx + mPx.bottom) + 'px';
      edgeBottomEl.style.marginTop = (-mPx.bottom) + 'px';
      container.appendChild(edgeBottomEl);
    }
    return { edgeTopEl, edgeBottomEl };
  }
  function placeSeam(pass, offset, i) {
    // Pose la couture qui sépare la page `i + 1` de la suivante : sa bande, la réserve sous le dernier bloc de la page qui finit, et la page qui
    // commence. `pass` porte les mesures de la pagination et son état courant (haut du corps de page, règles de marge, rognages, pages).
    const { zones, geometry, totalPages, wrapperChildren, wrapperRect, wrapperLeft, wrapperWidth, zoom, toLayoutY, overlay, steps, marginRules, tableStrips, pages, footAreaPx, headAreaPx } = pass;
    const pageEnding = i + 1; const pageStarting = i + 2;
    const footerText = zoneForPage(zones, 'footer', pageEnding);
    const headerText = zoneForPage(zones, 'header', pageStarting);
    const { seam, divider } = buildSeam({ footerText, headerText, pageEnding, pageStarting, totalPages, footAreaPx, headAreaPx, topMarginPx: geometry.mPx.top });
    overlay.appendChild(seam);
    seam.style.left = wrapperLeft + 'px';
    seam.style.width = wrapperWidth + 'px';
    const seamHeight = seam.getBoundingClientRect().height / zoom;
    const el = wrapperChildren[offset.afterIndex];
    // Bas du contenu de la page qui finit, lu après les réserves déjà posées : la frontière suivante doit voir leur effet avant de mesurer sa
    // propre position. getBoundingClientRect() ne compte jamais la marge propre de l'élément (margin-bottom pousse le frère suivant, pas sa propre
    // boîte) : `remaining` se rajoute à la main pour retrouver la vraie frontière. Coupure entre deux lignes d'un tableau (même principe que
    // l'éditeur, js/header-footer-preview.js) : le bas de la page qui finit est celui de la ligne qui précède celle qui ouvre la page, non celui du
    // tableau entier.
    const tableRows = offset.rowIndex != null ? (TablePageCut.rowsOf(el) || []) : [];
    const rowAbove = tableRows[offset.rowIndex - 1] || null;
    const rowOpening = rowAbove ? tableRows[offset.rowIndex] : null;
    const afterBottomScreen = rowAbove ? rowAbove.getBoundingClientRect().bottom : (el ? el.getBoundingClientRect().bottom : wrapperRect.top + offset.top * zoom);
    const afterBottomRel = (afterBottomScreen - wrapperRect.top) / zoom;
    const remaining = Math.max(0, geometry.pageContentHeightPx - (afterBottomRel - pass.bodyTopRel));
    if (rowOpening) {
      // La ligne qui ouvre la page descend de la réserve de la page qui finit, puis de la couture (rembourrage haut de ses cases) ; le tableau est
      // rogné sur cette hauteur (TablePageCut.clipRule, plus bas) : la réserve et les marges de la couture, transparentes, ne montrent ni le fond
      // ni les traits verticaux des cases. Le trait du haut de la ligne, rogné avec le reste, est redessiné au bord bas de la bande
      // (css/editor-v2.css).
      const restingPad = TablePageCut.restingPadTop(rowOpening);
      marginRules.push(TablePageCut.padRule('#reader-container .reader-content > *:nth-child(' + (offset.afterIndex + 1) + ')', offset.rowIndex, restingPad + seamHeight + remaining));
      const stripTop = (afterBottomScreen - el.getBoundingClientRect().top) / zoom;
      if (!tableStrips.has(offset.afterIndex)) tableStrips.set(offset.afterIndex, []);
      tableStrips.get(offset.afterIndex).push({ top: stripTop + 1, bottom: stripTop + remaining + seamHeight });
      const tableRect = el.getBoundingClientRect();
      const cap = document.createElement('div');
      cap.className = 'v2-page-seam-cap';
      cap.style.left = ((tableRect.left - wrapperRect.left) / zoom) + 'px';
      cap.style.width = (tableRect.width / zoom) + 'px';
      seam.appendChild(cap);
    } else if (el) {
      // Sélecteur préfixé de #reader-container : `#reader-container p { margin: 0 }` (css/editor-v2.css) est plus spécifique qu'un simple
      // `.reader-content > *:nth-child(N)` et écraserait la réserve dès que le dernier bloc d'une page est un paragraphe : la gouttière
      // recouvrirait alors une ligne de texte. Les sauts de page forcés, seuls à poser cette règle jusque-là, ont pour bloc un <div
      // class="page-break-marker">, jamais un <p>.
      marginRules.push('#reader-container .reader-content > *:nth-child(' + (offset.afterIndex + 1) + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }');
    }
    // Posée tout de suite : la frontière suivante doit voir l'effet des marges déjà posées avant de mesurer sa propre position.
    steps.add(marginRules[marginRules.length - 1]);
    const seamTop = toLayoutY(afterBottomScreen) + remaining;
    seam.style.top = seamTop + 'px';
    pass.bodyTopRel = afterBottomRel + remaining + seamHeight;
    pages.push({ top: seamTop + footAreaPx + divider.getBoundingClientRect().height / zoom, bodyTop: seamTop + seamHeight });
  }
  function layoutSeams(ctx) {
    // Les coutures de toutes les frontières de page et les règles de marge qui réservent leur place. Rend les mesures dont la suite a besoin.
    const { container, wrapper, geometry, offsets, edges } = ctx;
    const { mPx, topBandPx, bottomBandPx, pageContentHeightPx } = geometry;
    const overlay = document.createElement('div');
    overlay.className = 'v2-pagination-overlay';
    container.appendChild(overlay);
    // <style> en display:none, donc sans effet de mise en page propre, et dernier enfant de .reader-content : il ne décale aucun `nth-child` déjà
    // calculé.
    const styleEl = document.createElement('style');
    styleEl.className = 'v2-pagination-style';
    wrapper.appendChild(styleEl);
    const steps = EditorCore.createStepSheets(styleEl, 'v2-pagination-style');
    const marginRules = [];
    const zoom = EditorCore.layoutZoom(wrapper);
    // Positions lues sur les rectangles, jamais sur offsetTop/offsetLeft/offsetWidth (arrondis à l'entier : une page posée à 0,4 px près n'est plus
    // au même endroit que le PDF à quelques dixièmes de point). Les rectangles sont en pixels écran, déjà multipliés par le zoom d'ajustement ; la
    // bande, enfant du conteneur et zoomée comme la feuille, se place en pixels de mise en page depuis le coin du contenu défilant du conteneur.
    const containerRect = container.getBoundingClientRect();
    const toLayoutX = x => (x - containerRect.left - container.clientLeft + container.scrollLeft) / zoom;
    const toLayoutY = y => (y - containerRect.top - container.clientTop + container.scrollTop) / zoom;
    const wrapperRect = wrapper.getBoundingClientRect();
    const wrapperLeft = toLayoutX(wrapperRect.left);
    const wrapperWidth = wrapperRect.width / zoom;
    // Feuilles entières, même modèle que l'aperçu de l'éditeur (js/header-footer-preview.js:renderPaginationOverlay) : chaque page a sa hauteur
    // réelle. Une bande est créée pour chaque frontière de page (repère « Page N » quand il n'y a ni en-tête ni pied) ; elle rejoue le bas de la page
    // qui finit, la gouttière, le haut de la page qui commence. L'espace qu'elle occupe est réellement réservé par un margin-bottom sur le dernier
    // bloc de la page, avec, en plus, la place qui reste sous ce bloc jusqu'au bas du corps de la page (`remaining`, lu sur le DOM déjà mis en page :
    // la page vaut alors exactement la hauteur utile). Sans cette réserve, la gouttière recouvrirait les dernières lignes de la page qui finit.
    const footAreaPx = mPx.bottom + bottomBandPx;
    const headAreaPx = mPx.top + topBandPx;
    const wrapperPaddingTop = parseFloat(getComputedStyle(wrapper).paddingTop) || 0;
    const pages = [{ top: toLayoutY((edges.edgeTopEl || wrapper).getBoundingClientRect().top), bodyTop: toLayoutY(wrapperRect.top) + wrapperPaddingTop }];
    // `bodyTopRel` : haut du corps de la page courante depuis le haut de `.reader-content`, en pixels de mise en page (la première page : sa marge du
    // haut). `tableStrips` : pour chaque tableau coupé entre deux lignes (rang de son bloc), les bandes de sa hauteur à rogner (cf.
    // TablePageCut.clipRule).
    const pass = {
      zones: ctx.zones, geometry, totalPages: ctx.totalPages, wrapperChildren: ctx.wrapperChildren, wrapperRect, wrapperLeft, wrapperWidth, zoom, toLayoutY, overlay, steps,
      marginRules, tableStrips: new Map(), pages, footAreaPx, headAreaPx, bodyTopRel: wrapperPaddingTop,
    };
    offsets.forEach((offset, i) => placeSeam(pass, offset, i));
    // La dernière page, jusqu'à sa hauteur réelle : la feuille ne descend jamais sous le haut du corps de cette page, plus la hauteur utile d'une
    // page, plus sa marge du bas (le plancher ne gêne pas un contenu plus long).
    marginRules.push('#reader-container .reader-content { min-height: ' + (pass.bodyTopRel + pageContentHeightPx + mPx.bottom) + 'px; }');
    pass.tableStrips.forEach((strips, index) => marginRules.push(TablePageCut.clipRule('#reader-container .reader-content > *:nth-child(' + (index + 1) + ')', strips)));
    styleEl.textContent = marginRules.join('\n');
    steps.clear();
    return { pages, zoom, toLayoutY, wrapperLeft, wrapperWidth };
  }
  function addBackdrop(container, wrapper, edges, sheet) {
    // Le fond de la feuille : une seule page blanche pour toute la pile, bandes d'en-tête et de pied comprises, derrière le corps (z-index -1 dans le
    // conteneur, qui est un contexte d'empilement). Le corps, les espaceurs de bord et la feuille elle-même sont transparents : une image « derrière
    // le texte » posée dans la bande de l'en-tête n'est ainsi pas cachée par le fond blanc de l'espaceur. C'est aussi là que se peignent les copies
    // de « Sur toutes les pages » (js/page-layer.js). Rend la couche de ces copies.
    const { toLayoutY, wrapperLeft, wrapperWidth, zoom } = sheet;
    const backdrop = document.createElement('div');
    backdrop.className = 'v2-reader-backdrop';
    const paper = document.createElement('div');
    paper.className = 'v2-reader-paper';
    const paperTopScreen = (edges.edgeTopEl || wrapper).getBoundingClientRect().top;
    const paperBottomScreen = (edges.edgeBottomEl || wrapper).getBoundingClientRect().bottom;
    paper.style.left = wrapperLeft + 'px';
    paper.style.width = wrapperWidth + 'px';
    paper.style.top = toLayoutY(paperTopScreen) + 'px';
    paper.style.height = ((paperBottomScreen - paperTopScreen) / zoom) + 'px';
    backdrop.appendChild(paper);
    // Les copies de « Sur toutes les pages » : la même couche que l'éditeur, posée sur la feuille (paintRepeatedCopies la remplit, une fois les
    // images décalées par slot).
    const layer = document.createElement('div');
    layer.className = 'v2-page-layer';
    layer.setAttribute('aria-hidden', 'true');
    backdrop.appendChild(layer);
    container.appendChild(backdrop);
    wrapper.classList.add('v2-paper-backed');
    return layer;
  }
  function renderPaginationPreview(container, wrapper, zones) {
    // Insère les espaceurs de bord (vrais frères DOM de `wrapper`, en flux normal) et les bandes "couture" aux limites intermédiaires
    // (position:absolute, peuvent recouvrir un peu de texte pile à la limite - résidu assumé). Synchrone et refaisable : clearPagination retire tout
    // ce qu'elle pose.
    const geometry = paginationGeometry(zones);
    const offsets = computePageBreakOffsets(wrapper, geometry.pageContentHeightPx);
    const totalPages = offsets.length + 1;
    const wrapperChildren = Array.from(wrapper.children);

    // Un rendu plus récent peut avoir déjà repeint `container` : `wrapper` ne serait alors plus attaché et insertBefore lèverait une exception.
    if (!wrapper.isConnected) return null;

    const edges = addEdgeSpacers(container, wrapper, zones, geometry, totalPages);
    const sheet = layoutSeams({ container, wrapper, zones, geometry, offsets, totalPages, wrapperChildren, edges });
    const layer = addBackdrop(container, wrapper, edges, sheet);
    return { offsets, pages: sheet.pages, layer, zoom: sheet.zoom, toLayoutY: sheet.toLayoutY, sheetLeft: sheet.wrapperLeft, sheetWidth: sheet.wrapperWidth, contentLeftPx: geometry.mPx.left };
  }

  function setLayerTop(img, px) {
    // `top` d'une image en calque avant que la Lecture le décale (par slot, par page), gardé à la première écriture : la mise en page refaite
    // (clearPagination) repart du `top` d'origine, jamais d'un décalage déjà appliqué.
    if (img.dataset.ppTop0 === undefined) img.dataset.ppTop0 = img.style.top;
    img.style.top = px + 'px';
  }
  function clearPagination(container, wrapper) {
    // Retire tout ce que renderPaginationPreview et les décalages d'images ont posé - espaceurs de bord, couture, fond de la feuille, réserves de bas
    // de page, `top` des images en calque - : le contenu retrouve sa mise en page naturelle, mesurable de nouveau.
    container.querySelectorAll(':scope > .v2-page-edge-spacer, :scope > .v2-pagination-overlay, :scope > .v2-reader-backdrop').forEach(el => el.remove());
    wrapper.querySelectorAll(':scope > style.v2-pagination-style').forEach(el => el.remove());
    wrapper.classList.remove('v2-paper-backed');
    wrapper.querySelectorAll('img[data-pp-top0]').forEach(img => { img.style.top = img.dataset.ppTop0; delete img.dataset.ppTop0; });
  }
  function paginate(container, wrapper, zones) {
    // Mise en page complète de la Lecture, dans l'ordre : feuilles et coutures, images en calque décalées par slot puis posées sur leur page
    // (grille), copies de « Sur toutes les pages ». `zones` nul : pas d'Aperçu A4, donc pas de pagination, seuls les `top` par slot s'appliquent.
    const paged = zones ? renderPaginationPreview(container, wrapper, zones) : null;
    rebaseLayerImagesBySlot(wrapper);
    if (paged) { placeGridImagesOnPages(wrapper, paged); paintRepeatedCopies(wrapper, paged); }
    return paged;
  }

  // Page d'un bloc de premier niveau : une frontière (`afterIndex`) renvoie à la page d'après tous les blocs qui la suivent.
  function pageOfChildIndex(offsets, index) { return offsets.filter(o => o.afterIndex < index).length; }

  function placeGridImagesOnPages(wrapper, paged) {
    // Les feuilles ont leur taille réelle (« Pages entières ») : le haut du corps d'une page 2, 3... n'est donc plus là où l'ancienne mise en page
    // compacte le posait. Une image en calque d'un ancien modèle, posée sur l'une de ces pages, garde son `top` d'alors, alors que sa grille de page
    // (lue par le PDF et le Word) dit « tant de points depuis le haut du corps de sa page » : la Lecture se cale sur la grille, comme l'export. Rien
    // ne change pour un modèle enregistré depuis (les deux s'accordent) ni pour la première page de chaque courrier ; dans un macro-modèle, la page
    // se compte depuis la première page du courrier de l'image.
    const children = Array.from(wrapper.children);
    const wrapperTop = paged.toLayoutY(wrapper.getBoundingClientRect().top);
    let slotFirstPage = 0;
    children.forEach((child, index) => {
      if (child.matches('.page-break-marker[data-macro-slot]')) { slotFirstPage = pageOfChildIndex(paged.offsets, index + 1); return; }
      const layered = child.matches(LAYER_IMAGE_SELECTOR) ? [child] : Array.from(child.querySelectorAll(LAYER_IMAGE_SELECTOR));
      layered.forEach(img => {
        const grid = PageLayer.gridOfEl(img);
        if (!grid || grid.pageIndex < 1 || img.style.position !== 'absolute' || img.offsetParent !== wrapper) return;
        const page = paged.pages[slotFirstPage + grid.pageIndex];
        if (page) setLayerTop(img, page.bodyTop - wrapperTop + grid.topPt * PageLayer.PT_TO_PX);
      });
    });
  }

  function paintRepeatedCopies(wrapper, paged) {
    // « Sur toutes les pages » en Lecture : l'image d'origine reste à sa place (dans le corps), ses copies se peignent sur les autres feuilles à la
    // même place de page. Un macro-modèle (js/macro-templates.js) assemble plusieurs courriers : une image n'est répétée que sur les pages de son
    // courrier (js/pdf-export.js:slotPageRange), du saut de page qui l'ouvre à celui qui suit. Appelée une fois les images décalées par slot
    // (rebaseLayerImagesBySlot) : l'original est alors à sa vraie place, d'où se lit sa page.
    // Une image encore bloquée (son cadre « Afficher ») n'est pas répétée : ses copies se peindraient le cadre sur chaque feuille.
    const images = PageLayer.collect(wrapper).filter(img => img.getAttribute('src') && !img.hasAttribute('data-blocked-src'));
    // Le filigrane du modèle (PageLayout.getWatermark) se peint dans la même couche, sur chaque feuille, sous les copies d'images.
    const pageSize = PageLayout.getPageSizePt();
    const watermark = PageLayer.watermarkLayout(PageLayout.getWatermark(), pageSize.width, pageSize.height);
    if (!images.length && !watermark) { paged.layer.textContent = ''; return; }
    const children = Array.from(wrapper.children);
    const markers = [];
    children.forEach((child, index) => { if (child.matches('.page-break-marker[data-macro-slot]')) markers.push(index); });
    const lastPage = paged.pages.length - 1;
    const items = images.map(img => {
      const grid = PageLayer.gridOfEl(img);
      let fromPage = 0; let toPage = null;
      if (markers.length) {
        let host = img;
        while (host && host.parentElement !== wrapper) host = host.parentElement;
        const index = host ? children.indexOf(host) : -1;
        if (index >= 0) {
          const slot = markers.filter(m => m < index).length;
          fromPage = slot === 0 ? 0 : pageOfChildIndex(paged.offsets, markers[slot - 1] + 1);
          toPage = slot < markers.length ? pageOfChildIndex(paged.offsets, markers[slot]) : lastPage;
        }
      }
      const rect = img.getBoundingClientRect();
      return {
        src: img.currentSrc || img.src, width: rect.width / paged.zoom, height: rect.height / paged.zoom, leftPt: grid.leftPt, topPt: grid.topPt,
        opacity: img.style.opacity !== '' ? parseFloat(img.style.opacity) : 1, fromPage, toPage,
        skipPage: PageLayer.pageIndexAt(paged.pages, paged.toLayoutY(rect.top + rect.height / 2)),
      };
    });
    PageLayer.paintCopies(paged.layer, {
      left: paged.sheetLeft, width: paged.sheetWidth, pageHeight: PageLayout.getPageSizePx().height, contentLeft: paged.contentLeftPx, pages: paged.pages, items, watermark,
    });
  }

  // Image en calque (flottante) : celles que l'éditeur pose en position:absolute, à `left`/`top` du bloc de contenu
  // (js/pdf-export.js:pdfImageFromNode, même définition).
  const LAYER_IMAGE_SELECTOR = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';
  function rebaseLayerImagesBySlot(wrapper) {
    // Macro-modèle (js/macro-templates.js:buildConcatenatedHtml) : chaque slot garde les `top` de son modèle, comptés depuis le haut de sa première
    // page, alors que les slots suivants commencent plus bas, après le saut de page qui les ouvre (data-macro-slot) : sans ce décalage, toutes les
    // images en calque s'empileraient en haut du premier slot. Le décalage est la distance entre le haut de la première page (le padding de la
    // feuille) et l'endroit où le slot commence, saut de page et réserve de pagination compris : à calculer une fois la pagination posée. Une image
    // dans un conteneur positionné (cellule...) suit ce conteneur, elle n'est pas touchée.
    if (!wrapper.isConnected || !wrapper.querySelector(':scope > .page-break-marker[data-macro-slot]')) return;
    const zoom = EditorCore.layoutZoom(wrapper);
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const firstPageTopPx = parseFloat(getComputedStyle(wrapper).paddingTop) || 0;
    let shiftPx = 0;
    Array.from(wrapper.children).forEach(child => {
      if (child.matches('.page-break-marker[data-macro-slot]')) {
        const markerBottomPx = (child.getBoundingClientRect().bottom - wrapperTop) / zoom - wrapper.clientTop;
        shiftPx = markerBottomPx + (parseFloat(getComputedStyle(child).marginBottom) || 0) - firstPageTopPx;
        return;
      }
      if (!shiftPx) return;
      const layered = child.matches(LAYER_IMAGE_SELECTOR) ? [child] : Array.from(child.querySelectorAll(LAYER_IMAGE_SELECTOR));
      layered.forEach(img => {
        if (img.style.position !== 'absolute' || img.offsetParent !== wrapper) return;
        setLayerTop(img, (parseFloat(img.style.top) || 0) + shiftPx);
      });
    });
  }

  // === La mise en page de la Lecture suit ce qui bouge après le rendu ===
  // La pagination se mesure une fois, mais l'écran continue de changer : une image finit de charger (pièce jointe, adresse externe, image d'une
  // variable), une police web arrive, la feuille change de largeur. Une coupure posée sur une mesure périmée couperait une ligne en deux et
  // laisserait un décalage vers le bas. Comme l'éditeur (js/header-footer-preview.js:watchPaginationGeometry), la Lecture surveille donc sa feuille
  // et chaque image, et refait la mise en page seule : les variables ne sont pas relues, les en-têtes et pieds restent ceux du rendu.
  let geometryWatch = null;
  const GEOMETRY_RECOMPUTES_MAX = 8; // par fenêtre de 3 s, comme l'éditeur : une mise en page qui ne se stabilise pas ne tourne pas en boucle
  const GEOMETRY_DEBOUNCE_MS = 40;
  // Un site vient d'être affiché (js/external-images.js) : ses images, remises à leur adresse dans la page, changent la hauteur des feuilles et ce que
  // les copies d'image répétées peignent. La mise en page se refait par le chemin des images qui arrivent tard (sans effet si la Lecture est masquée).
  let revealHooked = false;
  function hookReveal() {
    if (revealHooked) return;
    revealHooked = true;
    ExternalImages.onReveal(() => { if (geometryWatch && geometryWatch.schedule) geometryWatch.schedule(); });
  }
  function stopGeometryWatch() {
    const w = geometryWatch;
    if (!w) return;
    geometryWatch = null;
    clearTimeout(w.timer); clearTimeout(w.windowTimer);
    if (w.observer) w.observer.disconnect();
    if (w.onFonts && document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', w.onFonts);
  }
  function watchGeometry(container, wrapper, zones) {
    stopGeometryWatch();
    if (typeof ResizeObserver !== 'function') return;
    const targets = [wrapper].concat(Array.from(wrapper.querySelectorAll('img')));
    const sizeOf = el => { const r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
    const w = { sizes: new Map(), timer: 0, windowTimer: 0, recomputes: 0, observer: null, onFonts: null };
    const remember = () => { w.sizes.clear(); targets.forEach(el => w.sizes.set(el, sizeOf(el))); };
    const changed = () => targets.some(el => w.sizes.get(el) !== sizeOf(el));
    const recompute = () => {
      if (geometryWatch !== w) return;
      if (!wrapper.isConnected) { stopGeometryWatch(); return; }
      // Masquée (autre mode) : rien à mesurer. Elle se mesure de nouveau à son retour, la taille de la feuille passant de zéro à sa vraie valeur.
      if (!wrapper.getClientRects().length) return;
      w.recomputes++;
      clearTimeout(w.windowTimer);
      w.windowTimer = setTimeout(() => { w.recomputes = 0; if (geometryWatch === w && changed()) schedule(); }, 3000);
      // Sans la mise en page, la feuille est plus courte : le navigateur ramènerait le défilement en arrière, et le lecteur ne retrouverait pas sa
      // page.
      const { scrollTop, scrollLeft } = container;
      clearPagination(container, wrapper);
      paginate(container, wrapper, zones);
      container.scrollTop = scrollTop; container.scrollLeft = scrollLeft;
      remember();
    };
    function schedule() {
      if (geometryWatch !== w || w.recomputes >= GEOMETRY_RECOMPUTES_MAX) return;
      clearTimeout(w.timer);
      w.timer = setTimeout(recompute, GEOMETRY_DEBOUNCE_MS);
    }
    w.schedule = schedule;
    geometryWatch = w;
    remember();
    w.observer = new ResizeObserver(() => { if (changed()) schedule(); });
    targets.forEach(el => w.observer.observe(el));
    // Une police qui arrive refait les lignes sans forcément changer la taille de la feuille : la mise en page est toujours refaite.
    if (document.fonts && document.fonts.addEventListener) { w.onFonts = schedule; document.fonts.addEventListener('loadingdone', w.onFonts); }
  }
  // Attend que les images du rendu aient fini de charger (ou d'échouer), au plus `maxMs` : leur hauteur décide des coupures de page, la première mise
  // en page se mesure donc une fois qu'elles l'ont. Celles qui arrivent plus tard sont reprises par watchGeometry.
  const IMAGE_SETTLE_MS = 1500;
  function settleImages(root, maxMs) {
    const pending = Array.from(root.querySelectorAll('img')).filter(img => !img.complete);
    if (!pending.length) return Promise.resolve();
    return new Promise(resolve => {
      let left = pending.length;
      const timer = setTimeout(resolve, maxMs);
      const one = () => { if (--left === 0) { clearTimeout(timer); resolve(); } };
      pending.forEach(img => { img.addEventListener('load', one, { once: true }); img.addEventListener('error', one, { once: true }); });
    });
  }

  let renderGeneration = 0;
  async function render(htmlContent, tableId, record, headerFooterData) {
    // `htmlContent` : le HTML du document, ou une fonction qui le donne (js/main.js : un macro-modèle assemble ses modèles contre la ligne courante,
    // ce qui relit des tables : l'appel se fait donc dans les lectures partagées de ce rendu, cf. GristAPI.withReadPass).
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    hookReveal();
    // Le contenu affiché est sur le point d'être remplacé : sa mise en page n'a plus à être suivie.
    stopGeometryWatch();
    // État vide : js/main.js:renderReader() appelle render() avec record=null quand aucune ligne n'est choisie. Pas une erreur, juste une étape que
    // la personne n'a pas encore faite : js/reader-guide.js la lui explique (le guide en quatre étapes, ou le court message quand le widget est déjà
    // relié à un tableau).
    if (!record) {
      ReaderGuide.render(container);
      return;
    }
    return GristAPI.withReadPass(() => renderRecord(renderId, container, htmlContent, tableId, record, headerFooterData));
  }
  function readerWrapperFrom(htmlContent) {
    // Le <div class="reader-content"> du document, pas encore résolu : HTML nettoyé, suggestions du suivi acceptées, liens ouverts dans un nouvel
    // onglet, style de numérotation des titres.
    // .reader-content : le parent direct des titres de premier niveau, celui qui porte data-heading-style (#reader-container ne peut pas jouer ce
    // rôle, ce <div> s'intercale toujours entre les deux).
    const wrapper = document.createElement('div'); wrapper.className = 'reader-content';
    // Ce HTML s'affiche : une image d'un autre site que la personne n'a pas affichée y prend son cadre « Afficher » (js/external-images.js) avant d'entrer
    // dans la page, sans quoi le navigateur la télécharge dès l'innerHTML. Les exports (expandedWrapper) lisent le HTML du modèle tel quel.
    const cleanHtml = ExternalImages.block(HtmlSanitize.clean(htmlContent));
    wrapper.innerHTML = cleanHtml;
    // La Lecture montre le document comme si les suggestions du suivi en attente étaient toutes acceptées, avec une légère teinte là où quelque
    // chose a changé. Avant tout le reste : les boucles, les blocs conditionnels et les bulles ne voient plus ni <ins> ni <del>.
    applyAcceptedView(wrapper, cleanHtml);
    // Un lien de la Lecture s'ouvre dans un nouvel onglet : le suivre dans le cadre du widget le remplacerait (et la plupart des sites refusent d'y
    // être affichés).
    wrapper.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    const configEl = wrapper.querySelector(':scope > .heading-numbering-config');
    wrapper.dataset.headingStyle = (configEl && configEl.dataset.style) || 'none';
    return wrapper;
  }
  async function resolveReaderBody(wrapper, tableId, record, stale) {
    // Résout le contenu de `wrapper` pour `record` (boucles, blocs conditionnels, bulles, images, codes QR, puces, sommaire). Rend `{ hasError }`
    // (une bulle n'a pas pu être résolue), ou `null` dès qu'un rendu plus récent a démarré (`stale`) : le reste de ses lectures serait inutile.
    // Rafraîchit les types de colonnes avant de résoudre les bulles : resolveBadgeNode a besoin de GristAPI.getColumnType à jour pour détecter une
    // colonne Attachments récemment ajoutée. Pas refreshSchema : il relirait chaque table du document en entier, à chaque rendu, pour une liste de
    // colonnes que la Lecture n'utilise pas.
    await GristAPI.refreshColumnTypes().catch(() => {});
    if (stale()) return null;
    // Zones répétées d'une boucle (js/loop-rules.js) déroulées avant la résolution : chaque copie porte la ligne de son tour, lue par
    // resolveBadgeNode.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    if (stale()) return null;
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à
    // résoudre.
    await ConditionalText.resolve(wrapper, tableId, record);
    await ConditionalValue.resolve(wrapper, tableId, record);
    await ConditionalCheckbox.resolve(wrapper, tableId, record);
    if (stale()) return null;
    const badges = wrapper.querySelectorAll(BADGE_SELECTOR); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      const { node, isError } = await resolveBadgeNode(badge, tableId, record, format, loopCtx);
      return { badge, node, isError };
    }));
    if (stale()) return null;
    for (const r of results) { if (r.isError) hasError = true; carryReaderAtom(r.badge, r.node); r.badge.replaceWith(r.node); }
    LoopRules.removeHiddenBlocks(wrapper);
    await resolveVariableImages(wrapper, tableId, record);
    await resolveQrCodes(wrapper, tableId, record);
    await resolveSmartChips(wrapper);
    if (stale()) return null;
    trimTrailingBlankBlocks(wrapper);
    keepBlankLines(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    await settleImages(wrapper, IMAGE_SETTLE_MS);
    // Variables déjà résolues (texte des titres définitif) : le sommaire se construit maintenant, avant que `renderRecord` remplace le contenu
    // affiché.
    resolveTocMarkers(wrapper);
    if (stale()) return null;
    return { hasError };
  }
  async function renderRecord(renderId, container, htmlContent, tableId, record, headerFooterData) {
    // Un rendu plus récent a démarré : celui-ci sera écarté au remplacement final, inutile de poursuivre ses lectures et ses résolutions.
    const stale = () => renderId !== renderGeneration;
    if (typeof htmlContent === 'function') htmlContent = await htmlContent();
    if (stale()) return;
    const wrapper = readerWrapperFrom(htmlContent);
    const resolved = await resolveReaderBody(wrapper, tableId, record, stale);
    if (!resolved) return;
    container.innerHTML = '';
    if (resolved.hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = I18n.t('reader.unresolvedVariables'); container.appendChild(warn); }
    container.appendChild(wrapper);
    const zones = container.classList.contains('a4-preview') ? await resolvePaginationZones(headerFooterData, tableId, record) : null;
    // Les résolutions ci-dessus sont asynchrones : un rendu plus récent peut avoir déjà repeint `container`, `wrapper` ne serait alors plus attaché.
    if (!wrapper.isConnected) return;
    paginate(container, wrapper, zones);
    if (!stale()) watchGeometry(container, wrapper, zones);
  }
  function resolveTocMarkers(wrapper) {
    // Remplace .toc-marker par la vraie liste de titres, sans numéro de page (non paginé ici). Numérotation de HeadingNumbering, jamais lue par
    // getComputedStyle('::before').content (qui ne rend que « counter(h1c) », counter() n'étant résolu qu'à la peinture).
    const tocMarkers = wrapper.querySelectorAll(':scope > .toc-marker');
    if (!tocMarkers.length) return;
    const headings = Array.from(wrapper.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const numberingStyle = wrapper.dataset.headingStyle || 'none';
    const entries = HeadingNumbering.entriesFor(headings, numberingStyle);
    tocMarkers.forEach(marker => {
      marker.innerHTML = '';
      marker.classList.add('toc-resolved');
      const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = I18n.t('pdf.tocTitle'); marker.appendChild(title);
      if (!entries.length) { const empty = document.createElement('div'); empty.className = 'toc-empty'; empty.textContent = I18n.t('pdf.tocEmpty'); marker.appendChild(empty); return; }
      entries.forEach(entry => {
        const line = document.createElement('div'); line.className = 'toc-entry toc-level-' + entry.level; line.textContent = entry.text;
        marker.appendChild(line);
      });
    });
  }
  async function resolveVariableImages(wrapper, tableId, record) {
    // Rattache le placeholder <img.editor-image> à la bonne pièce jointe pour que hydrateAttachmentImages lui pose un vrai src ; le retire s'il n'y
    // en a aucune.
    const nodes = Array.from(wrapper.querySelectorAll('img.editor-image[data-var-table]'));
    await Promise.all(nodes.map(async img => {
      const table = img.getAttribute('data-var-table');
      const column = img.getAttribute('data-var-column');
      let ids = [];
      try { ids = await Variables.resolveAttachmentIds(table, column, tableId, record, loopOpts(LoopRules.bindingOf(img))); }
      catch (e) { ids = []; }
      if (!ids.length) { img.remove(); return; }
      // data-var-table/-column/-key restent posés : c'est le marqueur que pdf-export.js:pdfImageFromNode lit pour choisir `fit` (boîte fixe, image
      // mise à l'échelle sans déformation) plutôt que `width` seul.
      img.dataset.source = 'attachment';
      img.dataset.attachmentId = String(ids[0]);
      img.style.objectFit = 'contain';
    }));
  }
  async function resolveQrCodes(wrapper, tableId, record) {
    // QR codes dont le texte contient une colonne (js/qr-code.js) : dessinés ici pour la ligne affichée, avec la ligne du tour dans une zone
    // répétée ; sans valeur, le QR code disparaît comme une image sans pièce jointe. Celui d'un texte seul est déjà une image du modèle.
    const nodes = Array.from(wrapper.querySelectorAll('img.editor-image[data-qr-text]')).filter(QrCode.needsImage);
    await Promise.all(nodes.map(img => QrCode.resolveImage(img, tableId, record, loopOpts(LoopRules.bindingOf(img)))));
  }
  function formatTodayDate() {
    // Chips intelligents : date du jour, heure actuelle, email et nom de la personne connectée. Des valeurs calculées, jamais liées à une colonne
    // Grist : résolues à chaque rendu, sans recherche de ligne ni de table liée. `.footnote-ref-marker` n'a pas besoin de l'être ici : son numéro
    // vient du compteur CSS, déjà juste à l'écran.
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function formatNowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  async function userChipText(read, unavailableKey) {
    // Le texte d'un chip qui lit la personne connectée (email, nom) : la valeur lue ou, si elle ne se lit pas (réseau, portée du jeton insuffisante,
    // lecteur Grist) ou que Grist n'en donne aucune, le repli visuel d'une #Variable cassée - jamais un blocage du reste du rendu.
    try {
      const text = await read();
      if (text) return { text, isError: false };
    } catch (e) { /* repli ci-dessous */ }
    return { text: I18n.t(unavailableKey), isError: true };
  }
  async function resolveSmartChips(wrapper) {
    const chips = Array.from(wrapper.querySelectorAll('.smart-chip'));
    await Promise.all(chips.map(async chip => {
      const kind = chip.getAttribute('data-chip-kind');
      let text = ''; let isError = false;
      if (kind === 'date') text = formatTodayDate();
      else if (kind === 'time') text = formatNowTime();
      else if (kind === 'email') ({ text, isError } = await userChipText(() => GristAPI.getCurrentUserEmail(), 'reader.emailUnavailable'));
      else if (kind === 'name') ({ text, isError } = await userChipText(() => GristAPI.getCurrentUserName(), 'reader.nameUnavailable'));
      const span = document.createElement('span');
      span.textContent = text;
      span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      carryReaderAtom(chip, span);
      chip.replaceWith(span);
    }));
  }
  function carryReaderAtom(from, to) {
    // Repère de position posé par js/comments.js:buildReaderHtml (commentaires en mode Lecture, lecture seule) : reporté sur la valeur qui remplace
    // la bulle/le chip, pour qu'une sélection qui commence ou finit sur cette valeur retrouve sa place dans le modèle. Absent partout ailleurs
    // (exports).
    if (to && to.nodeType === 1 && from.hasAttribute('data-pp-atom')) to.setAttribute('data-pp-atom', from.getAttribute('data-pp-atom'));
  }
  function checkboxNode(checked, style) {
    // Case à cocher d'une variable Oui / Non (format { type: 'bool', style } d'un style de case, VariableFormat) : un <span
    // class="resolved-checkbox"> qui garde le caractère ☑ / ☐ comme texte (copier-coller, lecteur d'écran, et le Word ou l'Excel qui n'ont rien
    // d'autre à lire), dessiné par css/editor-v2.css dans la couleur de la case. Cette couleur est posée en ligne, comme celle d'un texte coloré :
    // c'est elle que lisent le PDF (js/pdf-export.js:inlineRuns), le Word et l'Excel, jamais la feuille de style. L'e-mail écrit « [x] » / « [ ] »
    // (js/mailto-export.js).
    const box = document.createElement('span');
    box.className = 'resolved-checkbox';
    box.setAttribute('data-checked', checked ? 'true' : 'false');
    box.setAttribute('data-checkbox-style', style);
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', I18n.t(checked ? 'varFmt.boolChecked' : 'varFmt.boolUnchecked'));
    box.style.color = VariableFormat.checkboxColor(checked, style);
    box.textContent = checked ? VariableFormat.CHECKED_BOX : VariableFormat.UNCHECKED_BOX;
    return box;
  }
  function valueNode(text, format, className) {
    // Le nœud d'une valeur résolue : un <span> de texte ; pour une bulle réglée sur un style de case, chaque ☑ / ☐ du texte (une liste de valeurs en
    // a plusieurs : « ☑, ☐ ») devient une vraie case. `className` : celle du <span> (« resolved-var », avec « error-msg » pour une erreur) ; les
    // en-têtes et pieds n'en portaient aucune et n'en prennent pas.
    const span = document.createElement('span');
    if (className) span.className = className;
    const style = VariableFormat.boolStyle(format);
    if (style !== 'text' && !(className && className.indexOf('error-msg') !== -1)) {
      const { CHECKED_BOX, UNCHECKED_BOX } = VariableFormat;
      const split = new RegExp('([' + CHECKED_BOX + UNCHECKED_BOX + '])');
      if (split.test(text)) {
        String(text).split(split).forEach(part => {
          if (part === CHECKED_BOX || part === UNCHECKED_BOX) span.appendChild(checkboxNode(part === CHECKED_BOX, style));
          else if (part) span.appendChild(document.createTextNode(part));
        });
        return span;
      }
    }
    span.textContent = text;
    return span;
  }
  function attachmentImages(ids) {
    // Résout un badge #Variable en texte, ou en <img> si la colonne est de type Attachments ; les <img> produites réutilisent les classes/attributs
    // déjà lus par GristAPI.hydrateAttachmentImages, appelé juste après.
    const frag = document.createDocumentFragment();
    ids.forEach(id => {
      const img = document.createElement('img');
      img.className = 'editor-image';
      img.dataset.source = 'attachment';
      img.dataset.attachmentId = String(id);
      // Largeur par défaut explicite (même valeur que l'insertion normale) : cette image n'existe qu'au moment de la résolution, donc sans elle une
      // photo haute résolution s'afficherait à sa pleine largeur intrinsèque, plus grande qu'un logo n'a besoin de l'être.
      img.style.width = '320px';
      frag.appendChild(img);
    });
    return frag;
  }
  async function resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx, textOpts) {
    // Bulle en boucle « dans la phrase » (js/loop-rules.js) : ses valeurs pour chaque ligne retenue, jointes par les séparateurs de la boucle (les
    // images d'une colonne Pièces jointes, à la suite). Null sans boucle, ou si la boucle ne trouve plus sa source : résolution ordinaire. `textOpts` :
    // les options de lecture d'un champ texte (Variables.formatValue : `rawNumbers`), cf. fieldText.
    const loop = LoopRules.inlineLoopOf(badge);
    if (!loop) return null;
    try {
      if (GristAPI.getColumnType(table, column) === 'Attachments') {
        const ids = [];
        const res = await LoopRules.resolveInline(badge, loop, tableId, record, loopCtx, async binding => {
          const found = await Variables.resolveAttachmentIds(table, column, tableId, record, loopOpts(binding));
          ids.push(...found);
          return found.length ? 'x' : '';
        });
        if (!res) return null;
        return { node: res.node || attachmentImages(ids), isError: false };
      }
      const res = await LoopRules.resolveInline(badge, loop, tableId, record, loopCtx,
        binding => Variables.resolveVariable(table, column, tableId, record, format, Object.assign({}, textOpts, loopOpts(binding))));
      if (!res) return null;
      if (res.node) return { node: res.node, isError: false };
      return { node: valueNode(res.text, format, 'resolved-var'), isError: false };
    } catch (e) {
      console.error('[ReaderMode] échec de la boucle d\'une variable', e);
      return null;
    }
  }
  async function resolveBadgeNode(badge, tableId, record, format, loopCtx, textOpts) {
    // La valeur de la bulle, puis son texte « Avant » / « Après » : une seule porte pour la Lecture et pour tous les exports (un calcul n'en a pas).
    // `textOpts` : les options de lecture d'un champ texte (fieldText), rien pour le corps d'un modèle.
    const resolved = await resolveBadgeValue(badge, tableId, record, format, loopCtx, textOpts);
    if (!isCalcBadge(badge)) withAffixes(badge, resolved.node, resolved.isError);
    return resolved;
  }
  async function resolveBadgeValue(badge, tableId, record, format, loopCtx, textOpts) {
    const binding = LoopRules.bindingOf(badge);
    // Bulle « Calcul » (js/variable-calc.js) : le résultat de sa formule, avec la ligne du tour quand elle est dans une zone répétée - comme une
    // bulle de variable de cette table.
    if (isCalcBadge(badge)) {
      const { text, isError } = await Variables.resolveCalcResult(badge.getAttribute('data-formula') || '', tableId, record, format, loopOpts(binding));
      const span = document.createElement('span'); span.textContent = text; span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      return { node: span, isError };
    }
    if (!(await badgeConditionHolds(badge, tableId, record, binding))) return { node: document.createTextNode(''), isError: false };
    const table = badge.getAttribute('data-table');
    const column = badge.getAttribute('data-column');
    const inline = await resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx, textOpts);
    if (inline) return inline;
    const isAttachments = GristAPI.getColumnType(table, column) === 'Attachments';
    if (isAttachments) {
      let ids = [];
      try { ids = await Variables.resolveAttachmentIds(table, column, tableId, record, loopOpts(binding)); }
      catch (e) { return { node: document.createTextNode(''), isError: true }; }
      if (!ids.length) return { node: document.createTextNode(''), isError: false };
      return { node: attachmentImages(ids), isError: false };
    }
    try {
      // isError vient de Variables.resolveVariableResult, jamais des premiers mots du texte : le message d'erreur suit la langue de l'interface.
      const { text, isError } = await Variables.resolveVariableResult(table, column, tableId, record, format, Object.assign({}, textOpts, loopOpts(binding)));
      return { node: valueNode(text, format, 'resolved-var' + (isError ? ' error-msg' : '')), isError };
    } catch (e) {
      const span = document.createElement('span'); span.textContent = I18n.t('variables.error.generic', { message: e.message }); span.className = 'resolved-var error-msg';
      return { node: span, isError: true };
    }
  }
  async function expandedWrapper(htmlContent, tableId, record) {
    // Le document tel que preview() le déroule avant de remplacer les bulles : les zones répétées (leurs copies comprises) et les conditions de bloc,
    // de valeur et de case résolues. Partagé avec splitBadges.
    const cleanHtml = HtmlSanitize.clean(htmlContent);
    const wrapper = document.createElement('div'); wrapper.innerHTML = cleanHtml;
    // Le PDF, le Word et l'Excel sortent le document comme la Lecture, suggestions du suivi acceptées, mais sans teinte : le texte supprimé n'y est
    // plus, le texte ajouté s'y écrit comme le reste. Le modèle garde ses suggestions en attente.
    applyAcceptedView(wrapper, cleanHtml, { tint: false });
    // Cf. commentaire équivalent dans render() : les types de colonnes à jour, nécessaires pour que resolveBadgeNode détecte correctement une colonne
    // Attachments. Pas refreshSchema : il relisait chaque table du document en entier pour chaque ligne exportée (1,4 million de cases pour un PDF
    // d'une seule ligne dans un document de 40 tables de 2 000 lignes, autant pour chaque ligne d'un lot), pour une liste de colonnes que l'export
    // n'utilise pas.
    await GristAPI.refreshColumnTypes().catch(() => {});
    // Mêmes zones répétées que le mode Lecture (cf. render()), avant de lister les bulles : les copies en font partie.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId || lastCurrentTableId, record, loopCtx);
    await ConditionalText.resolve(wrapper, tableId || lastCurrentTableId, record);
    await ConditionalValue.resolve(wrapper, tableId || lastCurrentTableId, record);
    await ConditionalCheckbox.resolve(wrapper, tableId || lastCurrentTableId, record);
    return { wrapper, loopCtx };
  }
  async function splitBadges(parts, tableId, record) {
    // Les bulles réglées « Un document par valeur » (format.list.perValue, js/variable-list.js) que l'export de cette ligne trouvera dans ces
    // morceaux de HTML (le corps, les quatre zones d'en-tête et de pied) : celles qui restent après les zones répétées et les conditions de bloc, de
    // valeur et de case, que leur propre condition laisse écrire, et qui ne sont ni dans une zone répétée ni en boucle « dans la phrase » (le tour y
    // donne déjà la valeur). Un morceau sans le mot « perValue » n'est même pas lu. Retourne [{ table, column, format }], dans l'ordre du document.
    const found = [];
    for (const part of parts) {
      if (!part || part.indexOf('perValue') === -1) continue;
      const { wrapper } = await expandedWrapper(part, tableId, record);
      for (const badge of wrapper.querySelectorAll('.var-badge')) {
        const format = parseBadgeFormat(badge);
        if (!format || !format.list || format.list.perValue !== true) continue;
        const binding = LoopRules.bindingOf(badge);
        if (binding || badge.hasAttribute('data-loop')) continue;
        if (!(await badgeConditionHolds(badge, tableId || lastCurrentTableId, record, binding))) continue;
        found.push({ table: badge.getAttribute('data-table'), column: badge.getAttribute('data-column'), format });
      }
    }
    return found;
  }
  async function preview(htmlContent, tableId, record, onBadge) {
    // `onBadge(badge, binding)` (facultatif, js/xlsx-export.js) : appelé pour chaque bulle après le déroulé des zones répétées et avant qu'elle soit
    // remplacée par sa valeur, avec la ligne du tour qu'elle suit (null hors zone) ; le fichier Excel y repère les cases qui ne contiennent qu'un
    // nombre ou qu'une date. Il s'exécute d'un trait jusqu'à son premier `await` pendant que le parcours démarre : toutes les bulles sont alors
    // encore en place.
    const { wrapper, loopCtx } = await expandedWrapper(htmlContent, tableId, record);
    const badges = wrapper.querySelectorAll(BADGE_SELECTOR);
    await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      if (onBadge) await onBadge(badge, LoopRules.bindingOf(badge));
      const { node } = await resolveBadgeNode(badge, tableId || lastCurrentTableId, record, format, loopCtx);
      badge.replaceWith(node);
    }));
    LoopRules.removeHiddenBlocks(wrapper);
    await resolveVariableImages(wrapper, tableId || lastCurrentTableId, record);
    await resolveQrCodes(wrapper, tableId || lastCurrentTableId, record);
    await resolveSmartChips(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    return wrapper.innerHTML;
  }
  // Un champ texte (Objet, À, Cc, Cci, nom du PDF) dont une bulle porte un réglage, enregistré en HTML (js/field-codec.js) : chaque bulle devient son
  // texte pour la ligne `record` - condition, autres attributs, boucle dans la phrase, liste, format de nombre ou de date comme dans le corps d'un
  // modèle (resolveBadgeNode) -, le texte autour reste tel quel. Les champs gardent leurs règles d'avant : un nombre, un zéro et un Oui / Non s'écrivent
  // tels que Grist les stocke (`rawNumbers`, Variables.formatValue), sauf si la bulle choisit son format. `valueText` (facultatif) : ce qui se fait de la
  // valeur de chaque bulle avant de la poser (les caractères interdits d'un nom de fichier). Une image (colonne Pièces jointes) ne s'écrit pas : rien.
  async function fieldText(html, tableId, record, valueText) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = HtmlSanitize.clean(html);
    const loopCtx = LoopRules.createContext();
    const badges = wrapper.querySelectorAll(BADGE_SELECTOR);
    await Promise.all(Array.from(badges).map(async badge => {
      let text = '';
      try {
        const { node } = await resolveBadgeNode(badge, tableId || lastCurrentTableId, record, parseBadgeFormat(badge), loopCtx, { rawNumbers: true });
        text = node.textContent || '';
      } catch (e) { /* une valeur illisible donne un texte vide, jamais un export en échec */ }
      badge.replaceWith(document.createTextNode(valueText ? valueText(text) : text));
    }));
    return wrapper.textContent;
  }
  // Les caractères qu'un nom de fichier ne peut pas porter, dans la valeur d'une variable.
  const fileSafe = text => String(text || '').replace(/[\\/:*?"<>|]/g, '_');
  async function resolveFilename(filenameTemplate, tableId, record) {
    // Le nom d'un fichier : les variables de son modèle remplacées par leur valeur (Variables.replaceTextVariables, comme les champs de l'email), les
    // caractères interdits d'un nom de fichier remplacés par « _ » dans chaque valeur. Une valeur illisible donne un texte vide, jamais un export en
    // échec.
    if (!filenameTemplate) return 'publipostage';
    if (FieldCodec.isRich(filenameTemplate)) return fieldText(filenameTemplate, tableId, record, fileSafe);
    return Variables.replaceTextVariables(filenameTemplate, async m => {
      try { return fileSafe(await Variables.resolveVariable(m.table, m.column, tableId, record, null, { rawNumbers: true })); }
      catch (e) { return ''; }
    });
  }
  return { render, preview, resolveFilename, fieldText, splitBadges, trimTrailingBlankBlocks, checkboxNode };
})();
