// Publipostage Grist — reader mode v1.1.2 — 2026-09-04
const ReaderMode = (function () {
  let lastCurrentTableId = null;
  // Format nombre/date choisi via la barre flottante d'une bulle #Variable, sérialisé en JSON dans data-format ; transmis à Variables.resolveVariable.
  function parseBadgeFormat(badge) {
    const raw = badge.getAttribute('data-format');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // Options de résolution d'un élément copié par une zone répétée (js/loop-rules.js) : sa valeur est lue dans la ligne du tour.
  function loopOpts(binding) { return binding ? { loop: binding } : undefined; }
  // Les bulles à résoudre : celles d'une variable et celles d'un calcul (js/variable-calc.js).
  const BADGE_SELECTOR = '.var-badge, .calc-badge';
  const isCalcBadge = badge => badge.classList.contains('calc-badge');
  // Condition d'affichage d'une bulle #Variable (data-condition, js/variable-condition.js) : faux = la bulle disparaît de la lecture et de l'export, le
  // texte autour reste. Une condition illisible masque la bulle, comme une règle illisible de macro-modèle (js/condition-rules.js:matches).
  // `binding` : ligne du tour d'une zone répétée (js/loop-rules.js:bindingOf) - une règle sur une colonne de la table de la boucle lit alors cette ligne.
  async function badgeConditionHolds(badge, tableId, record, binding) {
    const raw = badge.getAttribute('data-condition');
    if (!raw) return true;
    let condition = null;
    try { condition = JSON.parse(raw); } catch (e) { console.error('[ReaderMode] condition de variable illisible', e); return false; }
    try { return await ConditionRules.conditionHolds(condition, tableId, record, loopOpts(binding)); }
    catch (e) { console.error('[ReaderMode] échec de l\'évaluation d\'une condition de variable', e); return false; }
  }
  // === Aperçu paginé réel - mode Lecture === Même principe que js/editor.js:renderPaginationOverlay, dupliqué plutôt qu'importé (pas de mécanisme de module
  // entre scripts classiques). Plus simple ici : contenu statique déjà résolu, pas de débounce nécessaire.
  const PT_TO_PX = 96 / 72;
  // Mêmes valeurs que le padding de .reader-content en Aperçu A4 (css/editor-v2.css), mais lues à chaud depuis js/page-layout.js : codées en dur
  // (37.33px / 719.04px), elles ignoraient les marges propres au modèle et paginaient le mode Lecture comme un modèle à 28pt de marge.
  function marginsPx() { return PageLayout.getMarginsPx(); }
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, js/pdf-export.js

  // Même rôle que layoutZoom() dans js/header-footer-preview.js (copie volontairement locale, comme tout ce module) : les rectangles mesurés DANS la
  // feuille sont en pixels écran, déjà multipliés par le zoom d'ajustement, alors que pageContentHeightPx et offsetTop sont en pixels de mise en page.
  function layoutZoom(el) {
    const sheet = el && el.closest ? el.closest('.reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }

  // La bande que le PDF réserve à un en-tête (sous la marge du haut) ou à un pied (au-dessus de la marge du bas) dès que l'une de ses variantes a du contenu : un plafond
  // fixe (60 px, HF_MAX_ZONE_HEIGHT_PT de js/pdf-export.js) plus l'écart de 10 pt, jamais la hauteur rendue du texte. Mesurée à la hauteur du texte, la Lecture réservait
  // moins que le PDF pour un en-tête d'une ligne et coupait ses pages plus bas que lui. Du texte ou une image : même test que pdf-export.js:resolveZone.
  const HF_MAX_ZONE_HEIGHT_PX = 60;
  const HEADER_FOOTER_BAND_PX = HF_MAX_ZONE_HEIGHT_PX + HEADER_FOOTER_GAP_PX;
  function hasZoneContent(html) {
    return !!html && (!!html.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(html));
  }
  // Blocs que l'export coupe en cours de route (pdfmake, au pixel : entre deux lignes d'une colonne, deux lignes d'un tableau, deux éléments d'une liste) mais que
  // cet aperçu, qui ne coupe pas le DOM, traite d'une pièce. Même règle que js/header-footer-preview.js:isSplittableByExport, sur le HTML sérialisé de la
  // Lecture (zone `two-columns-zone` et tableau sans l'enveloppe de l'éditeur).
  function isSplittableByExport(el) {
    return el.classList.contains('two-columns-zone') || el.tagName === 'TABLE' || el.tagName === 'UL' || el.tagName === 'OL';
  }
  // Un bloc qui ne tient pas passe entier à la page suivante, sauf s'il est de ceux que l'export coupe et que sa plus grande partie tient dans la place restante :
  // il reste alors sur sa page et le repère tombe derrière lui. Le déplacer en entier revient à se tromper de tout ce qui tenait dans la page (un tableau ou une
  // zone 2 colonnes qui déborde de ~30 px envoyé en page 2, page 1 presque vide) au lieu de se tromper de ce qui déborde, alors que l'export coupe au pixel.
  // Un tableau de premier niveau fait exception à la première phrase : il se coupe ENTRE deux lignes (js/table-page-cut.js, comme l'éditeur, le PDF et le Word), les lignes qui ne
  // tiennent pas ouvrent la page suivante. Le décalage porte alors `rowIndex` (rang de la première ligne de la page qui commence) et `afterIndex` est celui du tableau. Les lignes
  // qu'une case fusionnée sur plusieurs lignes lie passent ensemble. Un tableau qu'on ne sait pas couper ainsi (ligne ou groupe de lignes plus haut que la page...) garde la règle ci-dessus.
  // La légende d'une image ou d'un tableau reste avec son bloc, comme dans l'éditeur (js/header-footer-preview.js:computePageBreaks, « Rester ensemble ») : le bloc et ses légendes comptent pour
  // UN bloc d'une pièce ; pour un tableau coupé entre deux lignes, la dernière ligne et la légende. « Garder avec le suivant » (js/keep-with-next.js) : une suite de paragraphes gardés et le bloc
  // qui la suit passent à la page suivante d'un seul tenant quand ils ne tiennent pas dans la place restante, sauf au-delà de 90 % d'une page.
  function computePageBreakOffsets(rootEl, pageContentHeightPx) {
    const rootRect = rootEl.getBoundingClientRect();
    const zoom = layoutZoom(rootEl);
    const offsets = [];
    let consumed = 0;
    let counted = 0;
    const children = Array.from(rootEl.children);
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
      // « Garder avec le suivant » (js/keep-with-next.js), comme dans l'éditeur : les paragraphes gardés qui se suivent et le bloc qui les suit passent ensemble à la page suivante quand
      // ils ne tiennent pas dans la place restante.
      const run = KeepWithNext.runFrom(children, index, children.length);
      if (consumed > 0 && run) {
        const heightOf = el => el.getBoundingClientRect().height / zoom;
        let unit = run.members.reduce((sum, el) => sum + heightOf(el), 0);
        if (run.target) {
          const targetCaptions = Caption.captionsAfter(run.target);
          const targetCaptionPx = targetCaptions.reduce((sum, el) => sum + heightOf(el), 0);
          const targetPx = heightOf(run.target);
          const targetTable = run.target.tagName === 'TABLE' ? TablePageCut.measure(run.target, run.target, zoom, pageContentHeightPx, null, 0) : null;
          unit += targetTable ? targetTable.segs[0] : (targetCaptions.length > 0 && Caption.fitsWithCaption(targetPx + targetCaptionPx, pageContentHeightPx) ? targetPx + targetCaptionPx : targetPx);
        }
        if (unit > pageContentHeightPx - consumed && KeepWithNext.fits(unit, pageContentHeightPx)) {
          offsets.push({ top, afterIndex: index - 1, remainingPx: 0 });
          consumed = 0;
        }
      }
      const captions = Caption.captionsAfter(child);
      const captionPx = captions.reduce((sum, el) => sum + el.getBoundingClientRect().height / zoom, 0);
      const cuttable = child.tagName === 'TABLE' ? TablePageCut.measure(child, child, zoom, pageContentHeightPx, null, captionPx) : null;
      if (cuttable) {
        const tablePlan = TablePageCut.plan(consumed, cuttable.segs, pageContentHeightPx, cuttable.starts);
        if (tablePlan.blockBreakBefore) offsets.push({ top, afterIndex: index - 1, remainingPx: 0 });
        tablePlan.cuts.forEach((rowIndex, k) => offsets.push({ top: top + cuttable.segs.slice(0, tablePlan.ranks[k]).reduce((sum, seg) => sum + seg, 0), afterIndex: index, rowIndex, remainingPx: 0 }));
        consumed = tablePlan.consumedAfter;
        if (cuttable.keepsTail) counted = index + 1 + captions.length;
        return;
      }
      const keeps = captions.length > 0 && Caption.fitsWithCaption(height + captionPx, pageContentHeightPx);
      const unitHeight = keeps ? height + captionPx : height;
      const staysOnPage = !keeps && isSplittableByExport(child) && pageContentHeightPx - consumed > height / 2;
      if (consumed > 0 && consumed + unitHeight > pageContentHeightPx && !staysOnPage) { offsets.push({ top, afterIndex: index - 1, remainingPx: 0 }); consumed = unitHeight; }
      else { consumed += unitHeight; }
      if (keeps) counted = index + 1 + captions.length;
    });
    return offsets;
  }
  // Ligne vide (Entrée deux fois) : Editor.getHTML() la sérialise en <p></p>. Dans l'éditeur, ProseMirror ne lui garde sa ligne que par un
  // <br class="ProseMirror-trailingBreak"> absent de ce HTML, et les paragraphes n'ont ici aucune marge (margin:0) : sans hauteur propre, l'espacement entre
  // deux blocs disparaissait en Lecture alors que l'éditeur et l'export PDF/DOCX le gardent (Antoine, 2026-09-29). Appelée APRÈS la résolution des bulles :
  // un paragraphe qui ne contenait qu'une bulle vide ou masquée par sa condition garde lui aussi sa ligne, comme dans l'export. Un <br> saisi (Maj+Entrée)
  // compte comme du contenu et n'est jamais doublé : le PDF n'ajoute pas non plus de ligne après un retour à la ligne placé en fin de paragraphe.
  const BLANK_LINE_BLOCKS = 'p, h1, h2, h3, h4, h5, h6';
  // Ce qui occupe une ligne sans porter de texte : le marqueur de note de bas de page n'a que le numéro de son compteur CSS.
  const NON_TEXT_CONTENT = 'img, br, svg, canvas, video, audio, iframe, object, embed, input, .footnote-ref-marker';
  // Une image en calque (devant ou derrière le texte) est hors du flux : elle ne remplit pas la ligne de son paragraphe. Celui qui n'en porte que garde donc sa ligne, comme
  // dans l'éditeur où ProseMirror la lui laisse (Antoine, 2026-10-02 : la Lecture était d'une ligne plus haut que l'éditeur, le calque « Sur toutes les pages » posé dans une ligne
  // vide en haut du modèle) - et comme le PDF et le Word. Il en va de même d'une image alignée à gauche ou à droite : elle flotte (css/style.css, comme dans l'éditeur), le texte l'habille,
  // et le paragraphe où elle est seule garde sa ligne (Antoine, 2026-10-02, point 9).
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
  // Fin de document sans rien à montrer (Antoine, 2026-10-01 : « s'il n'y a pas de contenu, peu importe les marges, on ne crée pas de nouvelle page »). Une
  // dernière ligne vide - Entrée de trop, ou le paragraphe que l'éditeur laisse toujours derrière un tableau ou une zone deux colonnes - ne s'imprime pas, mais
  // quand le texte arrive à la marge du bas elle n'y tient plus et ouvre une page blanche : en Lecture, dans le PDF et dans le Word. Ces blocs sont donc retirés
  // de la FIN du document (ceux du milieu gardent leur ligne, cf. keepBlankLines), ainsi que les lignes vides au bas des colonnes d'une dernière zone deux
  // colonnes : sans cadre ni fond à l'impression, elles ne font que la rallonger. Appelée sur le HTML déjà résolu (une bulle vide ou masquée ne laisse que
  // son paragraphe). « Rien à montrer » = un paragraphe, une zone deux colonnes ou un saut de page sans texte, image, tableau, liste, citation, encadré, note
  // ni numéro de page ; un titre n'en est jamais un (sa numérotation s'écrit même sans texte). Le premier bloc reste toujours : un modèle vide garde sa ligne.
  const VISIBLE_CONTENT = 'img, svg, canvas, video, audio, iframe, object, embed, input, table, hr, ul, ol, pre, blockquote, .callout, .toc-marker, .footnote-ref-marker, .page-number-badge';
  function hasNothingToShow(el) {
    if (el.classList.contains('page-break-marker')) return true;
    if (el.tagName !== 'P' && !el.classList.contains('two-columns-zone')) return false;
    return !el.textContent.replace(/[\s\u00a0\u200b]/g, '') && !el.querySelector(VISIBLE_CONTENT);
  }
  // Ce qui ne compte pas comme bloc en fin de document : espaces entre deux balises, commentaires, <style> et réglage de la numérotation des titres.
  function isDocumentFurniture(node) {
    if (node.nodeType === Node.ELEMENT_NODE) return node.tagName === 'STYLE' || node.classList.contains('heading-numbering-config');
    return node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim());
  }
  // Une ligne de fin qui ne porte que des images en calque posées sur la PAGE 1 (demande du 2026-10-04 : dans un petit format, une image flottante sur la première page « crée une deuxième page »).
  // L'image est placée par sa grille de page, pas par la ligne qui la porte, et cette ligne n'a rien à montrer dans le flux : quand le texte arrive à la marge du bas elle n'y tient plus et ouvre
  // une page blanche, comme une ligne vide. La page 1 existe toujours : seules ces images-là sont dispensées, une image d'une page 2 ou plus a pu demander la page que sa ligne ouvre. Il faut la
  // grille entière (`data-page-index` et les deux décalages, ce que lit pdf-export.js:pdfImageFromNode) : sans elle l'image n'est placée que par son paragraphe, et la ligne reste. Même règle,
  // sur le DOM de l'éditeur, dans js/header-footer-preview.js:isTailAnchorParagraph.
  function isFirstPageLayerImage(el) {
    return el.matches(LAYER_IMAGE_SELECTOR) && parseInt(el.getAttribute('data-page-index'), 10) === 0
      && Number.isFinite(parseFloat(el.getAttribute('data-page-left-pt'))) && Number.isFinite(parseFloat(el.getAttribute('data-page-top-pt')));
  }
  function isTailAnchor(el) {
    if (el.tagName !== 'P' || el.textContent.replace(/[\s ​]/g, '')) return false;
    const children = Array.from(el.children);
    return children.length > 0 && children.every(isFirstPageLayerImage);
  }
  // Ces lignes de fin (et les lignes vides qui les séparent) quittent le flux : le dernier paragraphe de texte qui les précède reprend leurs images, posées par leur grille quel que soit
  // le paragraphe qui les porte, et elles sont retirées. Sans paragraphe de texte avant elles (un tableau, une liste, un titre, un saut de page, ou le début du document) la ligne reste :
  // l'image n'aurait pas d'hôte, et c'est la même condition dans l'éditeur (js/header-footer-preview.js:trailingBlankStart).
  function carryTailAnchors(root, blocks) {
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
  // Les suggestions du suivi des modifications encore en attente (js/track-changes.js) : le document s'écrit comme si elles étaient toutes acceptées.
  // Si la vue échoue, il reste tel qu'il est écrit (suggestions visibles) plutôt qu'à moitié transformé ou vide, et l'erreur va à la console.
  // `options.tint: false` : sans teinte.
  function applyAcceptedView(wrapper, source, options) {
    try { TrackChanges.acceptedView(wrapper, options); } catch (e) {
      console.error('[reader-mode] vue « comme acceptée » impossible, les suggestions restent affichées', e);
      wrapper.innerHTML = source;
    }
  }
  // #Variable d'un fragment d'en-tête/pied - même résolution que le corps (badges .var-badge remplacés par leur valeur réelle), avec le VRAI enregistrement
  // Grist affiché en mode Lecture.
  async function resolveHeaderFooterZone(html, tableId, record) {
    if (!html) return html;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    // Comme le corps : les suggestions du suivi acceptées, avec la teinte légère.
    applyAcceptedView(wrapper, html);
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à résoudre.
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
      if (inline) { badge.replaceWith(inline.node); return; }
      try { const value = await Variables.resolveVariable(table, column, tableId, record, format, loopOpts(binding)); badge.replaceWith(valueNode(value, format, '')); } catch (e) {}
    }));
    LoopRules.removeHiddenBlocks(wrapper);
    // La note de bas de page n'est volontairement pas insérable en en-tête/ pied (aucun repère de page dans une zone répétée sur chaque page), donc
    // resolveSmartChips ne trouve jamais de .footnote-ref-marker ici.
    await resolveSmartChips(wrapper);
    keepBlankLines(wrapper);
    return wrapper.innerHTML;
  }
  // Une couture rejoue ce qui sépare deux feuilles PHYSIQUES, à leur vraie taille : le bas de la page qui finit (sa marge du bas, la bande de son pied : `foot`, avec le
  // pied tout en haut, juste sous le texte), la gouttière du plan de travail, puis le haut de la page qui commence (la bande de son en-tête, sa marge du haut : `head`,
  // avec l'en-tête à la moitié de la marge, comme dans le PDF). Même structure que l'éditeur (js/header-footer-preview.js:buildSeam), sans zones cliquables : la Lecture
  // n'ouvre rien. Bas et haut de page transparents, la feuille blanche est derrière (`.v2-reader-paper`).
  function buildSeam(opts) {
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
  // Les quatre fragments d'en-tête et de pied, résolus : leurs #Variable relisent des tables, d'où une résolution par rendu et non à chaque mise en page (renderPaginationPreview
  // se refait quand une image finit de charger, cf. watchGeometry).
  // `hfEnabled` remplace l'ancien `return` sec quand aucun en-tête/pied n'est configuré : le mode Lecture ne montrait alors AUCUNE frontière de page,
  // alors que l'éditeur y affiche son repère « Page N ». Un document sans en-tête/pied garde donc maintenant ses gouttières, mais pas d'espaceur de bord
  // (rien à y afficher - une bande blanche vide flotterait au-dessus et en dessous de la feuille).
  async function resolvePaginationZones(headerFooterData, tableId, record) {
    const hfEnabled = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = hfEnabled && !!headerFooterData.differentFirstPage;
    const headerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.default, tableId, record) : null;
    const headerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.first, tableId, record) : null;
    const footerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.default, tableId, record) : null;
    const footerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.first, tableId, record) : null;
    return { hfEnabled, differentFirstPage, headerDefault, headerFirst, footerDefault, footerFirst };
  }
  // Insère les espaceurs de bord (vrais frères DOM de `wrapper`, en flux normal) et les bandes "couture" aux limites intermédiaires (position:absolute,
  // peuvent recouvrir un peu de texte pile à la limite - résidu assumé). Synchrone et refaisable : clearPagination retire tout ce qu'elle pose.
  function renderPaginationPreview(container, wrapper, zones) {
    const { hfEnabled, differentFirstPage, headerDefault, headerFirst, footerDefault, footerFirst } = zones;
    const headerForPage = n => (n === 1 && differentFirstPage) ? headerFirst : headerDefault;
    const footerForPage = n => (n === 1 && differentFirstPage) ? footerFirst : footerDefault;

    const topBandPx = (hasZoneContent(headerDefault) || hasZoneContent(headerFirst)) ? HEADER_FOOTER_BAND_PX : 0;
    const bottomBandPx = (hasZoneContent(footerDefault) || hasZoneContent(footerFirst)) ? HEADER_FOOTER_BAND_PX : 0;
    const mPx = marginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - mPx.top - mPx.bottom - topBandPx - bottomBandPx);
    const offsets = computePageBreakOffsets(wrapper, pageContentHeightPx);
    const totalPages = offsets.length + 1;

    const wrapperChildren = Array.from(wrapper.children);

    // Un rendu plus récent peut avoir déjà repeint `container` : `wrapper` ne serait alors plus attaché et insertBefore lèverait une exception.
    if (!wrapper.isConnected) return null;

    // Les bandes du PDF, sur la première et la dernière page : un espaceur par bande réservée, vide quand la variante de CETTE page n'a rien (page 1 sans en-tête
    // alors que les autres en ont un). Collés à la feuille, dont ils prolongent la page : le haut de la page est le haut de l'espaceur, le contenu de l'en-tête à la
    // moitié de la marge du haut comme dans le PDF ; le pied recouvre la marge du bas de la feuille et commence juste sous le texte, là où le PDF le peint.
    let edgeTopEl = null; let edgeBottomEl = null;
    if (topBandPx) {
      edgeTopEl = document.createElement('div');
      edgeTopEl.className = 'v2-page-edge-spacer v2-page-edge-top';
      edgeTopEl.innerHTML = headerForPage(1) ? PageLayout.resolvePageNumberBadges(headerForPage(1), 1, totalPages) : '';
      edgeTopEl.style.height = topBandPx + 'px';
      edgeTopEl.style.paddingTop = (mPx.top / 2) + 'px';
      container.insertBefore(edgeTopEl, wrapper);
    }
    if (bottomBandPx) {
      edgeBottomEl = document.createElement('div');
      edgeBottomEl.className = 'v2-page-edge-spacer v2-page-edge-bottom';
      edgeBottomEl.innerHTML = footerForPage(totalPages) ? PageLayout.resolvePageNumberBadges(footerForPage(totalPages), totalPages, totalPages) : '';
      edgeBottomEl.style.height = (bottomBandPx + mPx.bottom) + 'px';
      edgeBottomEl.style.marginTop = (-mPx.bottom) + 'px';
      container.appendChild(edgeBottomEl);
    }

    const overlay = document.createElement('div');
    overlay.className = 'v2-pagination-overlay';
    container.appendChild(overlay);
    // <style> en display:none, donc sans effet de mise en page propre, et dernier enfant de .reader-content : il ne décale aucun `nth-child` déjà calculé.
    const styleEl = document.createElement('style');
    styleEl.className = 'v2-pagination-style';
    wrapper.appendChild(styleEl);
    const marginRules = [];
    const zoom = layoutZoom(wrapper);
    // Positions lues sur les rectangles, jamais sur offsetTop/offsetLeft/offsetWidth (arrondis à l'entier : une page posée à 0,4 px près n'est plus au même endroit que
    // le PDF à quelques dixièmes de point). Les rectangles sont en pixels écran, déjà multipliés par le zoom d'ajustement ; la bande, enfant du conteneur et zoomée
    // comme la feuille, se place en pixels de mise en page depuis le coin du contenu défilant du conteneur.
    const containerRect = container.getBoundingClientRect();
    const toLayoutX = x => (x - containerRect.left - container.clientLeft + container.scrollLeft) / zoom;
    const toLayoutY = y => (y - containerRect.top - container.clientTop + container.scrollTop) / zoom;
    const wrapperRect = wrapper.getBoundingClientRect();
    const wrapperLeft = toLayoutX(wrapperRect.left);
    const wrapperWidth = wrapperRect.width / zoom;
    // Feuilles entières (choix d'Antoine, 01/10), même modèle que l'aperçu éditeur (js/header-footer-preview.js:renderPaginationOverlay) : chaque page a sa hauteur
    // réelle. Une bande est créée pour CHAQUE frontière de page (repère « Page N » quand il n'y a ni en-tête ni pied) ; elle rejoue le bas de la page qui finit, la
    // gouttière, le haut de la page qui commence. L'espace qu'elle occupe est réellement réservé par un margin-bottom sur le dernier bloc de la page, avec, en plus, la
    // place qui reste sous ce bloc jusqu'au bas du corps de la page (`remaining`, lu sur le DOM déjà mis en page : la page vaut alors exactement la hauteur utile).
    // Sans cette réserve, la gouttière recouvrirait les dernières lignes de la page qui finit.
    const footAreaPx = mPx.bottom + bottomBandPx;
    const headAreaPx = mPx.top + topBandPx;
    const wrapperPaddingTop = parseFloat(getComputedStyle(wrapper).paddingTop) || 0;
    // Haut du corps de la page courante depuis le haut de `.reader-content`, en pixels de mise en page (la première page : sa marge du haut).
    let bodyTopRel = wrapperPaddingTop;
    const pages = [{ top: toLayoutY((edgeTopEl || wrapper).getBoundingClientRect().top), bodyTop: toLayoutY(wrapperRect.top) + wrapperPaddingTop }];
    // Tableaux coupés entre deux lignes : pour chacun (rang de son bloc), les bandes de sa hauteur à rogner (cf. TablePageCut.clipRule).
    const tableStrips = new Map();
    offsets.forEach((offset, i) => {
      const pageEnding = i + 1; const pageStarting = i + 2;
      const footerText = footerForPage(pageEnding);
      const headerText = headerForPage(pageStarting);
      const { seam, divider } = buildSeam({ footerText, headerText, pageEnding, pageStarting, totalPages, footAreaPx, headAreaPx, topMarginPx: mPx.top });
      overlay.appendChild(seam);
      seam.style.left = wrapperLeft + 'px';
      seam.style.width = wrapperWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height / zoom;
      const el = wrapperChildren[offset.afterIndex];
      // Bas du contenu de la page qui finit, lu après les réserves déjà posées : la frontière suivante doit voir leur effet avant de mesurer sa propre position.
      // getBoundingClientRect() ne compte jamais la marge PROPRE de l'élément (margin-bottom pousse le FRÈRE suivant, pas sa propre boîte) : `remaining` se rajoute
      // à la main pour retrouver la vraie frontière. Coupure ENTRE DEUX LIGNES d'un tableau (même principe que l'éditeur, js/header-footer-preview.js) : le bas de la page qui
      // finit est celui de la ligne qui précède celle qui ouvre la page, non celui du tableau entier.
      const tableRows = offset.rowIndex != null ? (TablePageCut.rowsOf(el) || []) : [];
      const rowAbove = tableRows[offset.rowIndex - 1] || null;
      const rowOpening = rowAbove ? tableRows[offset.rowIndex] : null;
      const afterBottomScreen = rowAbove ? rowAbove.getBoundingClientRect().bottom : (el ? el.getBoundingClientRect().bottom : wrapperRect.top + offset.top * zoom);
      const afterBottomRel = (afterBottomScreen - wrapperRect.top) / zoom;
      const remaining = Math.max(0, pageContentHeightPx - (afterBottomRel - bodyTopRel));
      if (rowOpening) {
        // La ligne qui ouvre la page descend de la réserve de la page qui finit, puis de la couture (rembourrage haut de ses cases) ; le tableau est rogné sur cette hauteur
        // (TablePageCut.clipRule, plus bas) : la réserve et les marges de la couture, transparentes, ne montrent ni le fond ni les traits verticaux des cases. Le trait du haut
        // de la ligne, rogné avec le reste, est redessiné au bord bas de la bande (css/editor-v2.css).
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
        // `.reader-content > *:nth-child(N)` et écrasait silencieusement la réserve dès que le dernier bloc d'une page était un paragraphe - la
        // gouttière recouvrait alors une ligne de texte. Invisible avant, la règle n'étant posée que pour les sauts de page forcés, dont le bloc est
        // un <div class="page-break-marker">, jamais un <p>.
        marginRules.push('#reader-container .reader-content > *:nth-child(' + (offset.afterIndex + 1) + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }');
      }
      // Écrit la feuille à chaque itération : la frontière suivante doit voir l'effet des marges déjà posées avant de mesurer sa propre position.
      styleEl.textContent = marginRules.join('\n');
      const seamTop = toLayoutY(afterBottomScreen) + remaining;
      seam.style.top = seamTop + 'px';
      bodyTopRel = afterBottomRel + remaining + seamHeight;
      pages.push({ top: seamTop + footAreaPx + divider.getBoundingClientRect().height / zoom, bodyTop: seamTop + seamHeight });
    });
    // La dernière page, jusqu'à sa hauteur réelle : la feuille ne descend jamais sous le haut du corps de cette page + B + sa marge du bas (le plancher ne gêne pas un
    // contenu plus long).
    marginRules.push('#reader-container .reader-content { min-height: ' + (bodyTopRel + pageContentHeightPx + mPx.bottom) + 'px; }');
    tableStrips.forEach((strips, index) => marginRules.push(TablePageCut.clipRule('#reader-container .reader-content > *:nth-child(' + (index + 1) + ')', strips)));
    styleEl.textContent = marginRules.join('\n');

    // Le fond de la feuille : une seule page blanche pour toute la pile, bandes d'en-tête et de pied comprises, DERRIÈRE le corps (z-index -1 dans le conteneur, qui est
    // un contexte d'empilement). Le corps, les espaceurs de bord et la feuille elle-même sont transparents : une image « derrière le texte » posée dans la bande de
    // l'en-tête - le triangle d'un coin de la Fiche mission - n'est plus cachée par le fond blanc de l'espaceur, ce qu'elle était dès qu'un en-tête réservait sa
    // bande. C'est aussi là que se peignent les copies de « Sur toutes les pages » (page-layer.js).
    const backdrop = document.createElement('div');
    backdrop.className = 'v2-reader-backdrop';
    const paper = document.createElement('div');
    paper.className = 'v2-reader-paper';
    const paperTopScreen = (edgeTopEl || wrapper).getBoundingClientRect().top;
    const paperBottomScreen = (edgeBottomEl || wrapper).getBoundingClientRect().bottom;
    paper.style.left = wrapperLeft + 'px';
    paper.style.width = wrapperWidth + 'px';
    paper.style.top = toLayoutY(paperTopScreen) + 'px';
    paper.style.height = ((paperBottomScreen - paperTopScreen) / zoom) + 'px';
    backdrop.appendChild(paper);
    // Les copies de « Sur toutes les pages » : la même couche que l'éditeur, posée sur la feuille (paintRepeatedCopies la remplit, une fois les images décalées par slot).
    const layer = document.createElement('div');
    layer.className = 'v2-page-layer';
    layer.setAttribute('aria-hidden', 'true');
    backdrop.appendChild(layer);
    container.appendChild(backdrop);
    wrapper.classList.add('v2-paper-backed');
    return { offsets, pages, layer, zoom, toLayoutY, sheetLeft: wrapperLeft, sheetWidth: wrapperWidth, contentLeftPx: mPx.left };
  }

  // `top` d'une image en calque avant que la Lecture le décale (par slot, par page), gardé à la première écriture : la mise en page refaite (clearPagination) repart du `top`
  // d'origine, jamais d'un décalage déjà appliqué.
  function setLayerTop(img, px) {
    if (img.dataset.ppTop0 === undefined) img.dataset.ppTop0 = img.style.top;
    img.style.top = px + 'px';
  }
  // Retire tout ce que renderPaginationPreview et les décalages d'images ont posé - espaceurs de bord, couture, fond de la feuille, réserves de bas de page, `top` des images en
  // calque - : le contenu retrouve sa mise en page naturelle, mesurable de nouveau.
  function clearPagination(container, wrapper) {
    container.querySelectorAll(':scope > .v2-page-edge-spacer, :scope > .v2-pagination-overlay, :scope > .v2-reader-backdrop').forEach(el => el.remove());
    wrapper.querySelectorAll(':scope > style.v2-pagination-style').forEach(el => el.remove());
    wrapper.classList.remove('v2-paper-backed');
    wrapper.querySelectorAll('img[data-pp-top0]').forEach(img => { img.style.top = img.dataset.ppTop0; delete img.dataset.ppTop0; });
  }
  // Mise en page complète de la Lecture, dans l'ordre : feuilles et coutures, images en calque décalées par slot puis posées sur leur page (grille), copies de « Sur toutes
  // les pages ». `zones` nul : pas d'Aperçu A4, donc pas de pagination, seuls les `top` par slot s'appliquent.
  function paginate(container, wrapper, zones) {
    const paged = zones ? renderPaginationPreview(container, wrapper, zones) : null;
    rebaseLayerImagesBySlot(wrapper);
    if (paged) { placeGridImagesOnPages(wrapper, paged); paintRepeatedCopies(wrapper, paged); }
    return paged;
  }

  // Page d'un bloc de premier niveau : une frontière (`afterIndex`) renvoie à la page d'après tous les blocs qui la suivent.
  function pageOfChildIndex(offsets, index) { return offsets.filter(o => o.afterIndex < index).length; }

  // Les feuilles ont leur taille réelle (« Pages entières ») : le haut du corps d'une page 2, 3... n'est plus là où l'ancienne mise en page compacte le posait. Une image en calque
  // d'un modèle enregistré avant ce changement et posée sur l'une de ces pages garde son `top` d'alors, alors que sa grille page (le PDF et le Word la lisent) dit « tant de
  // points depuis le haut du corps de SA page » : la Lecture se cale sur la grille, comme l'export. Rien ne change pour un modèle enregistré depuis (les deux s'accordent) ni pour
  // la première page de chaque courrier (même géométrie qu'avant) ; dans un macro-modèle, la page se compte depuis la première page du courrier de l'image.
  function placeGridImagesOnPages(wrapper, paged) {
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

  // « Sur toutes les pages » en Lecture : l'image d'origine reste à sa place (dans le corps), ses copies se peignent sur les autres feuilles à la même place de page. Un
  // macro-modèle (js/macro-templates.js) assemble plusieurs courriers : une image n'est répétée que sur les pages de SON courrier (js/pdf-export.js:slotPageRange), du saut de
  // page qui l'ouvre à celui qui suit. Appelée une fois les images décalées par slot (rebaseLayerImagesBySlot) : l'original est alors à sa vraie place, d'où se lit sa page.
  function paintRepeatedCopies(wrapper, paged) {
    const images = PageLayer.collect(wrapper).filter(img => img.getAttribute('src'));
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

  // Image en calque (flottante) : celles que l'éditeur pose en position:absolute, à `left`/`top` du bloc de contenu (js/pdf-export.js:pdfImageFromNode, même définition).
  const LAYER_IMAGE_SELECTOR = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';
  // Macro-modèle (js/macro-templates.js:buildConcatenatedHtml) : chaque slot garde les `top` de SON modèle, comptés depuis le haut de SA première page, alors que les
  // slots suivants commencent plus bas, après le saut de page qui les ouvre (data-macro-slot) : sans ce décalage toutes les images en calque s'empilaient en haut du
  // premier slot. Le décalage est la distance entre le haut de la première page (le padding de la feuille) et l'endroit où le slot commence, saut de page et réserve de
  // pagination compris : à calculer une fois la pagination posée. Une image dans un conteneur positionné (cellule...) suit ce conteneur, elle n'est pas touchée.
  function rebaseLayerImagesBySlot(wrapper) {
    if (!wrapper.isConnected || !wrapper.querySelector(':scope > .page-break-marker[data-macro-slot]')) return;
    const zoom = layoutZoom(wrapper);
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
  // La pagination se mesure une fois, mais l'écran continue de changer : une image finit de charger (pièce jointe, adresse externe, image d'une variable), une police web
  // arrive, la feuille change de largeur. Chaque coupure posée sur une mesure périmée coupait alors une ligne en deux et laissait un décalage vers le bas que seul un nouveau
  // rendu (quitter la ligne et y revenir, l'image étant alors en cache) corrigeait. Comme l'éditeur (js/header-footer-preview.js:watchPaginationGeometry), la Lecture surveille
  // donc sa feuille et chaque image, et refait la mise en page seule - les variables ne sont pas relues, les en-têtes et pieds restent ceux du rendu.
  let geometryWatch = null;
  const GEOMETRY_RECOMPUTES_MAX = 8; // par fenêtre de 3 s, comme l'éditeur : une mise en page qui ne se stabilise pas ne tourne pas en boucle
  const GEOMETRY_DEBOUNCE_MS = 40;
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
      // Sans la mise en page, la feuille est plus courte : le navigateur ramènerait le défilement en arrière, et le lecteur ne retrouverait pas sa page.
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
    geometryWatch = w;
    remember();
    w.observer = new ResizeObserver(() => { if (changed()) schedule(); });
    targets.forEach(el => w.observer.observe(el));
    // Une police qui arrive refait les lignes sans forcément changer la taille de la feuille : la mise en page est toujours refaite.
    if (document.fonts && document.fonts.addEventListener) { w.onFonts = schedule; document.fonts.addEventListener('loadingdone', w.onFonts); }
  }
  // Attend que les images du rendu aient fini de charger (ou d'échouer), au plus `maxMs` : leur hauteur décide des coupures de page, la première mise en page se mesure donc
  // une fois qu'elles l'ont. Celles qui arrivent plus tard sont reprises par watchGeometry.
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
  // `htmlContent` : le HTML du document, ou une fonction qui le donne (js/main.js : un macro-modèle assemble ses modèles contre la ligne courante, ce qui relit des tables -
  // l'appel se fait donc dans les lectures partagées de CE rendu, cf. GristAPI.withReadPass).
  async function render(htmlContent, tableId, record, headerFooterData) {
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    // Le contenu affiché est sur le point d'être remplacé : sa mise en page n'a plus à être suivie.
    stopGeometryWatch();
    // État vide : atteignable depuis js/main.js:renderReader(), qui appelle désormais render() avec record=null au lieu de retourner en silence (le mode
    // Lecture affichait alors un conteneur totalement vide, sans la moindre explication). Pas une erreur, juste une étape que l'utilisateur n'a pas encore
    // faite : js/reader-guide.js la lui explique (le guide en quatre étapes, ou le court message quand le widget est déjà relié à un tableau).
    if (!record) {
      ReaderGuide.render(container);
      return;
    }
    return GristAPI.withReadPass(() => renderRecord(renderId, container, htmlContent, tableId, record, headerFooterData));
  }
  async function renderRecord(renderId, container, htmlContent, tableId, record, headerFooterData) {
    // Un rendu plus récent a démarré : celui-ci sera écarté au remplacement final, inutile de poursuivre ses lectures et ses résolutions.
    const stale = () => renderId !== renderGeneration;
    if (typeof htmlContent === 'function') htmlContent = await htmlContent();
    if (stale()) return;
    // .reader-content : le parent direct des titres de premier niveau, celui qui porte data-heading-style (#reader-container ne peut pas jouer ce rôle, ce
    // <div> s'intercale toujours entre les deux).
    const wrapper = document.createElement('div'); wrapper.className = 'reader-content';
    const cleanHtml = HtmlSanitize.clean(htmlContent);
    wrapper.innerHTML = cleanHtml;
    // La Lecture montre le document comme si les suggestions du suivi en attente étaient toutes acceptées, avec une légère teinte là où quelque
    // chose a changé. Avant tout le reste : les boucles, les blocs conditionnels et les bulles ne voient plus ni <ins> ni <del>.
    applyAcceptedView(wrapper, cleanHtml);
    // Un lien de la Lecture s'ouvre dans un nouvel onglet : le suivre dans le cadre du widget le remplacerait (et la plupart des sites refusent d'y être affichés).
    wrapper.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    const configEl = wrapper.querySelector(':scope > .heading-numbering-config');
    wrapper.dataset.headingStyle = (configEl && configEl.dataset.style) || 'none';
    // Rafraîchit les types de colonnes avant de résoudre les badges : resolveBadgeNode a besoin de GristAPI.getColumnType à jour pour détecter une colonne Attachments
    // récemment ajoutée. Pas refreshSchema : il relisait chaque table du document en entier, à chaque rendu, pour une liste de colonnes que la Lecture n'utilise pas.
    await GristAPI.refreshColumnTypes().catch(() => {});
    if (stale()) return;
    // Zones répétées d'une boucle (js/loop-rules.js) déroulées AVANT la résolution : chaque copie porte la ligne de son tour, lue par resolveBadgeNode.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    if (stale()) return;
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à résoudre.
    await ConditionalText.resolve(wrapper, tableId, record);
    await ConditionalValue.resolve(wrapper, tableId, record);
    await ConditionalCheckbox.resolve(wrapper, tableId, record);
    if (stale()) return;
    const badges = wrapper.querySelectorAll(BADGE_SELECTOR); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      const { node, isError } = await resolveBadgeNode(badge, tableId, record, format, loopCtx);
      return { badge, node, isError };
    }));
    if (stale()) return;
    for (const r of results) { if (r.isError) hasError = true; carryReaderAtom(r.badge, r.node); r.badge.replaceWith(r.node); }
    LoopRules.removeHiddenBlocks(wrapper);
    await resolveVariableImages(wrapper, tableId, record);
    await resolveQrCodes(wrapper, tableId, record);
    await resolveSmartChips(wrapper);
    if (stale()) return;
    trimTrailingBlankBlocks(wrapper);
    keepBlankLines(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    await settleImages(wrapper, IMAGE_SETTLE_MS);
    // Variables déjà résolues (texte des titres définitif) : peut construire le sommaire maintenant, avant le swap DOM final ci-dessous.
    resolveTocMarkers(wrapper);
    if (stale()) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = I18n.t('reader.unresolvedVariables'); container.appendChild(warn); }
    container.appendChild(wrapper);
    const zones = container.classList.contains('a4-preview') ? await resolvePaginationZones(headerFooterData, tableId, record) : null;
    // Les résolutions ci-dessus sont asynchrones : un rendu plus récent peut avoir déjà repeint `container`, `wrapper` ne serait alors plus attaché.
    if (!wrapper.isConnected) return;
    paginate(container, wrapper, zones);
    if (!stale()) watchGeometry(container, wrapper, zones);
  }
  // Remplace .toc-marker par la vraie liste de titres, sans numéro de page (non paginé ici). Marqueur recalculé en JS, jamais lu via
  // getComputedStyle('::before').content (ne renvoie que "counter(h1c)", pas le texte peint - counter() n'est résolu qu'à la peinture).
  function resolveTocMarkers(wrapper) {
    const tocMarkers = wrapper.querySelectorAll(':scope > .toc-marker');
    if (!tocMarkers.length) return;
    const headings = Array.from(wrapper.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const numberingStyle = wrapper.dataset.headingStyle || 'none';
    const entries = headingCounterEntries(headings, numberingStyle);
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
  // Reproduit en JS la cascade de compteurs CSS de style.css : chaque titre incrémente le compteur de son niveau et réinitialise ceux des niveaux plus
  // profonds, même ordre de style par niveau que les règles CSS ::before.
  const HEADING_COUNTER_SCHEMES = {
    numeric: ['decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman'],
    alpha: ['lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal'],
    roman: ['upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha'],
  };
  function formatCounterValue(n, counterStyle) {
    if (counterStyle === 'lower-alpha') { let s = ''; let v = n; while (v > 0) { const rem = (v - 1) % 26; s = String.fromCharCode(97 + rem) + s; v = Math.floor((v - 1) / 26); } return s; }
    if (counterStyle === 'upper-roman') { const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; let v = n; table.forEach(([val, sym]) => { while (v >= val) { s += sym; v -= val; } }); return s; }
    return String(n);
  }
  function headingCounterEntries(headingEls, numberingStyle) {
    const scheme = HEADING_COUNTER_SCHEMES[numberingStyle];
    const counters = [0, 0, 0, 0, 0, 0];
    return headingEls.map(h => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      counters[level - 1] += 1;
      for (let i = level; i < 6; i += 1) counters[i] = 0;
      const marker = scheme ? formatCounterValue(counters[level - 1], scheme[level - 1]) + ') ' : '';
      return { level, text: (marker + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
  }
  // Rattache le placeholder <img.editor-image> à la bonne pièce jointe pour que hydrateAttachmentImages lui pose un vrai src ; le retire si aucune PJ.
  async function resolveVariableImages(wrapper, tableId, record) {
    const nodes = Array.from(wrapper.querySelectorAll('img.editor-image[data-var-table]'));
    await Promise.all(nodes.map(async img => {
      const table = img.getAttribute('data-var-table');
      const column = img.getAttribute('data-var-column');
      let ids = [];
      try { ids = await Variables.resolveAttachmentIds(table, column, tableId, record, loopOpts(LoopRules.bindingOf(img))); }
      catch (e) { ids = []; }
      if (!ids.length) { img.remove(); return; }
      // data-var-table/-column/-key restent posés : c'est le marqueur que pdf-export.js:pdfImageFromNode lit pour choisir `fit` (boîte fixe, image mise à
      // l'échelle sans déformation) plutôt que `width` seul.
      img.dataset.source = 'attachment';
      img.dataset.attachmentId = String(ids[0]);
      img.style.objectFit = 'contain';
    }));
  }
  // QR codes dont le texte contient une colonne (js/qr-code.js) : dessinés ici pour la ligne affichée, avec la ligne du tour dans une zone répétée ; sans valeur, le QR code
  // disparaît comme une image sans pièce jointe. Celui d'un texte seul est déjà une image du modèle.
  async function resolveQrCodes(wrapper, tableId, record) {
    const nodes = Array.from(wrapper.querySelectorAll('img.editor-image[data-qr-text]')).filter(QrCode.needsImage);
    await Promise.all(nodes.map(img => QrCode.resolveImage(img, tableId, record, loopOpts(LoopRules.bindingOf(img)))));
  }
  // Chips intelligents - date du jour/heure actuelle/email et nom de l'utilisateur, valeurs calculées (jamais liées à une colonne Grist) donc résolues à chaque rendu
  // sans recherche de ligne/table liée. `.footnote-ref-marker` n'a pas besoin d'être résolu ici : son numéro vient du compteur CSS, déjà correct à l'écran.
  function formatTodayDate() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function formatNowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  // Le texte d'un chip qui lit la personne connectée (email, nom) : la valeur lue ou, si elle ne se lit pas (réseau, portée du jeton insuffisante, lecteur Grist) ou que Grist n'en
  // donne aucune, le repli visuel d'une #Variable cassée - jamais un blocage du reste du rendu.
  async function userChipText(read, unavailableKey) {
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
  // Repère de position posé par js/comments.js:buildReaderHtml (commentaires en mode Lecture, lecture seule) : reporté sur la valeur qui remplace la
  // bulle/le chip, pour qu'une sélection qui commence ou finit sur cette valeur retrouve sa place dans le modèle. Absent partout ailleurs (exports).
  function carryReaderAtom(from, to) {
    if (to && to.nodeType === 1 && from.hasAttribute('data-pp-atom')) to.setAttribute('data-pp-atom', from.getAttribute('data-pp-atom'));
  }
  // Case à cocher d'une variable Oui / Non (format { type: 'bool', style } d'un style de case, VariableFormat) : un <span class="resolved-checkbox"> qui garde le caractère ☑ / ☐ comme texte
  // (copier-coller, lecteur d'écran, et le Word ou l'Excel qui n'ont rien d'autre à lire), dessiné par css/editor-v2.css dans la couleur de la case. Cette couleur est posée EN LIGNE, comme celle
  // d'un texte coloré : c'est elle que lisent le PDF (js/pdf-export.js:inlineRuns), le Word et l'Excel, jamais la feuille de style. L'e-mail écrit « [x] » / « [ ] » (js/mailto-export.js).
  function checkboxNode(checked, style) {
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
  // Le nœud d'une valeur résolue : un <span> de texte ; pour une bulle réglée sur un style de case, chaque ☑ / ☐ du texte (une liste de valeurs en a plusieurs : « ☑, ☐ ») devient une vraie case.
  // `className` : celle du <span> (« resolved-var », avec « error-msg » pour une erreur) ; les en-têtes et pieds n'en portaient aucune et n'en prennent pas.
  function valueNode(text, format, className) {
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
  // Résout un badge #Variable en texte, ou en <img> si la colonne est de type Attachments ; les <img> produites réutilisent les classes/attributs déjà lus
  // par GristAPI.hydrateAttachmentImages, appelé juste après.
  function attachmentImages(ids) {
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
  // Bulle en boucle « dans la phrase » (js/loop-rules.js) : ses valeurs pour chaque ligne retenue, jointes par les séparateurs de la boucle (les images
  // d'une colonne Pièces jointes, à la suite). Null sans boucle, ou si la boucle ne trouve plus sa source : résolution ordinaire.
  async function resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx) {
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
        binding => Variables.resolveVariable(table, column, tableId, record, format, loopOpts(binding)));
      if (!res) return null;
      if (res.node) return { node: res.node, isError: false };
      return { node: valueNode(res.text, format, 'resolved-var'), isError: false };
    } catch (e) {
      console.error('[ReaderMode] échec de la boucle d\'une variable', e);
      return null;
    }
  }
  async function resolveBadgeNode(badge, tableId, record, format, loopCtx) {
    const binding = LoopRules.bindingOf(badge);
    // Bulle « Calcul » (js/variable-calc.js) : le résultat de sa formule, avec la ligne du tour quand elle est dans une zone répétée - comme une bulle de variable de cette table.
    if (isCalcBadge(badge)) {
      const { text, isError } = await Variables.resolveCalcResult(badge.getAttribute('data-formula') || '', tableId, record, format, loopOpts(binding));
      const span = document.createElement('span'); span.textContent = text; span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      return { node: span, isError };
    }
    if (!(await badgeConditionHolds(badge, tableId, record, binding))) return { node: document.createTextNode(''), isError: false };
    const table = badge.getAttribute('data-table');
    const column = badge.getAttribute('data-column');
    const inline = await resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx);
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
      const { text, isError } = await Variables.resolveVariableResult(table, column, tableId, record, format, loopOpts(binding));
      return { node: valueNode(text, format, 'resolved-var' + (isError ? ' error-msg' : '')), isError };
    } catch (e) {
      const span = document.createElement('span'); span.textContent = I18n.t('variables.error.generic', { message: e.message }); span.className = 'resolved-var error-msg';
      return { node: span, isError: true };
    }
  }
  // Le document tel que preview() le déroule avant de remplacer les bulles : les zones répétées (leurs copies comprises) et les conditions de bloc, de valeur et de case résolues. Partagé avec splitBadges.
  async function expandedWrapper(htmlContent, tableId, record) {
    const cleanHtml = HtmlSanitize.clean(htmlContent);
    const wrapper = document.createElement('div'); wrapper.innerHTML = cleanHtml;
    // Le PDF, le Word et l'Excel sortent le document comme la Lecture, suggestions du suivi acceptées, mais sans teinte (choix d'Antoine, 04/10) :
    // le texte supprimé n'y est plus, le texte ajouté s'y écrit comme le reste. Le modèle garde ses suggestions en attente.
    applyAcceptedView(wrapper, cleanHtml, { tint: false });
    // Cf. commentaire équivalent dans render() : schéma à jour nécessaire pour que resolveBadgeNode détecte correctement une colonne Attachments.
    await GristAPI.refreshSchema().catch(() => {});
    // Mêmes zones répétées que le mode Lecture (cf. render()), avant de lister les bulles : les copies en font partie.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId || lastCurrentTableId, record, loopCtx);
    await ConditionalText.resolve(wrapper, tableId || lastCurrentTableId, record);
    await ConditionalValue.resolve(wrapper, tableId || lastCurrentTableId, record);
    await ConditionalCheckbox.resolve(wrapper, tableId || lastCurrentTableId, record);
    return { wrapper, loopCtx };
  }
  // Les bulles réglées « Un document par valeur » (format.list.perValue, js/variable-list.js) que l'export de cette ligne trouvera dans ces morceaux de HTML (le corps, les quatre zones d'en-tête et de pied) :
  // celles qui restent après les zones répétées et les conditions de bloc, de valeur et de case, que leur propre condition laisse écrire, et qui ne sont ni dans une zone répétée ni en boucle « dans la phrase »
  // (le tour y donne déjà la valeur). Un morceau sans le mot « perValue » n'est même pas lu. Retourne [{ table, column, format }], dans l'ordre du document.
  async function splitBadges(parts, tableId, record) {
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
  // `onBadge(badge, binding)` (facultatif, js/xlsx-export.js) : appelé pour chaque bulle APRÈS le déroulé des zones répétées et AVANT qu'elle soit remplacée par sa
  // valeur, avec la ligne du tour qu'elle suit (null hors zone) ; le fichier Excel y repère les cases qui ne contiennent qu'un nombre ou qu'une date. Il s'exécute
  // d'un trait jusqu'à son premier `await` pendant que le parcours démarre : toutes les bulles sont alors encore en place.
  async function preview(htmlContent, tableId, record, onBadge) {
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
  // Variables d'un nom de fichier : le scan des champs Objet/À/Cc/Cci (Variables.findTextVariables - plus longue clé connue après chaque déclencheur, chemins
  // « #Projet.Accompagnateur.Email » compris), les caractères interdits d'un nom de fichier remplacés par « _ » dans chaque valeur.
  async function resolveFilename(filenameTemplate, tableId, record) {
    if (!filenameTemplate) return 'publipostage';
    const matches = Variables.findTextVariables(filenameTemplate);
    const resolved = await Promise.all(matches.map(async m => {
      try { const val = await Variables.resolveVariable(m.table, m.column, tableId, record, null, { rawNumbers: true }); return String(val || '').replace(/[\\/:*?"<>|]/g, '_'); }
      catch (e) { return ''; }
    }));
    let result = ''; let lastEnd = 0;
    matches.forEach((m, idx) => { result += filenameTemplate.slice(lastEnd, m.start) + resolved[idx]; lastEnd = m.end; });
    result += filenameTemplate.slice(lastEnd);
    return result;
  }
  return { render, preview, resolveFilename, splitBadges, trimTrailingBlankBlocks, checkboxNode };
})();
