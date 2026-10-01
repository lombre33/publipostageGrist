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
  function contentWidthPx() { return PageLayout.getContentWidthMm() * PageLayout.MM_TO_PX; }
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, js/pdf-export.js

  // Même rôle que layoutZoom() dans js/header-footer-preview.js (copie volontairement locale, comme tout ce module) : les rectangles mesurés DANS la
  // feuille sont en pixels écran, déjà multipliés par le zoom d'ajustement, alors que pageContentHeightPx et offsetTop sont en pixels de mise en page.
  function layoutZoom(el) {
    const sheet = el && el.closest ? el.closest('.reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }

  function measureHtmlHeightPx(html) {
    if (!html || !html.replace(/<[^>]*>/g, '').trim()) return 0;
    const host = document.createElement('div');
    host.className = 'reader-content';
    host.innerHTML = html;
    // min-height:0 : .reader-content n'a pas le min-height:200px de .tiptap (css/editor-v2.css, propre à l'éditeur VIDE) - conservé quand même par
    // cohérence/robustesse avec la même mesure côté éditeur/export PDF.
    host.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + contentWidthPx() + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(host);
    const h = host.getBoundingClientRect().height;
    document.body.removeChild(host);
    return h;
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
  function computePageBreakOffsets(rootEl, pageContentHeightPx) {
    const rootRect = rootEl.getBoundingClientRect();
    const zoom = layoutZoom(rootEl);
    const offsets = [];
    let consumed = 0;
    Array.from(rootEl.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const top = (rect.top - rootRect.top) / zoom;
      const height = rect.height / zoom;
      if (child.classList.contains('page-break-marker')) {
        offsets.push({ top: top + height, afterIndex: index, remainingPx: Math.max(0, pageContentHeightPx - consumed) });
        consumed = 0;
        return;
      }
      const staysOnPage = isSplittableByExport(child) && pageContentHeightPx - consumed > height / 2;
      if (consumed > 0 && consumed + height > pageContentHeightPx && !staysOnPage) { offsets.push({ top, afterIndex: index - 1, remainingPx: 0 }); consumed = height; }
      else { consumed += height; }
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
  function keepBlankLines(root) {
    root.querySelectorAll(BLANK_LINE_BLOCKS).forEach(block => {
      if (block.textContent !== '' || block.querySelector(NON_TEXT_CONTENT)) return;
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
  function trimTrailingBlankBlocks(root) {
    const blocks = Array.from(root.childNodes).filter(node => !isDocumentFurniture(node));
    while (blocks.length > 1 && blocks[blocks.length - 1].nodeType === Node.ELEMENT_NODE && hasNothingToShow(blocks[blocks.length - 1])) root.removeChild(blocks.pop());
    const last = blocks[blocks.length - 1];
    if (!last || last.nodeType !== Node.ELEMENT_NODE || !last.classList.contains('two-columns-zone')) return;
    last.querySelectorAll(':scope > .two-columns-column').forEach(column => {
      while (column.children.length > 1 && column.lastElementChild.tagName === 'P' && hasNothingToShow(column.lastElementChild)) column.removeChild(column.lastElementChild);
    });
  }
  // #Variable d'un fragment d'en-tête/pied - même résolution que le corps (badges .var-badge remplacés par leur valeur réelle), avec le VRAI enregistrement
  // Grist affiché en mode Lecture.
  async function resolveHeaderFooterZone(html, tableId, record) {
    if (!html) return html;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à résoudre.
    await ConditionalText.resolve(wrapper, tableId, record);
    const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => {
      const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column');
      const format = parseBadgeFormat(badge);
      const binding = LoopRules.bindingOf(badge);
      if (!(await badgeConditionHolds(badge, tableId, record, binding))) { badge.replaceWith(document.createTextNode('')); return; }
      const inline = await resolveInlineLoop(badge, table, column, tableId, record, format, loopCtx);
      if (inline) { badge.replaceWith(inline.node); return; }
      try { const value = await Variables.resolveVariable(table, column, tableId, record, format, loopOpts(binding)); const span = document.createElement('span'); span.textContent = value; badge.replaceWith(span); } catch (e) {}
    }));
    LoopRules.removeHiddenBlocks(wrapper);
    // La note de bas de page n'est volontairement pas insérable en en-tête/ pied (aucun repère de page dans une zone répétée sur chaque page), donc
    // resolveSmartChips ne trouve jamais de .footnote-ref-marker ici.
    await resolveSmartChips(wrapper);
    keepBlankLines(wrapper);
    return wrapper.innerHTML;
  }
  // Insère les espaceurs de bord (vrais frères DOM de `wrapper`, en flux normal) et les bandes "couture" aux limites intermédiaires (position:absolute,
  // peuvent recouvrir un peu de texte pile à la limite - résidu assumé).
  async function renderPaginationPreview(container, wrapper, headerFooterData, tableId, record) {
    if (!container.classList.contains('a4-preview')) return;
    // `hfEnabled` remplace l'ancien `return` sec quand aucun en-tête/pied n'est configuré : le mode Lecture ne montrait alors AUCUNE frontière de page,
    // alors que l'éditeur y affiche son repère « Page N ». Un document sans en-tête/pied garde donc maintenant ses gouttières, mais pas d'espaceur de bord
    // (rien à y afficher - une bande blanche vide flotterait au-dessus et en dessous de la feuille).
    const hfEnabled = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = hfEnabled && !!headerFooterData.differentFirstPage;
    const headerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.default, tableId, record) : null;
    const headerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.first, tableId, record) : null;
    const footerDefault = hfEnabled ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.default, tableId, record) : null;
    const footerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.first, tableId, record) : null;
    const headerForPage = n => (n === 1 && differentFirstPage) ? headerFirst : headerDefault;
    const footerForPage = n => (n === 1 && differentFirstPage) ? footerFirst : footerDefault;

    const headerHeightPx = Math.max(measureHtmlHeightPx(headerDefault), measureHtmlHeightPx(headerFirst));
    const footerHeightPx = Math.max(measureHtmlHeightPx(footerDefault), measureHtmlHeightPx(footerFirst));
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const mPx = marginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - mPx.top - mPx.bottom - topExtraPx - bottomExtraPx);
    const offsets = computePageBreakOffsets(wrapper, pageContentHeightPx);
    const totalPages = offsets.length + 1;

    const wrapperChildren = Array.from(wrapper.children);

    // Les résolutions #Variable ci-dessus sont asynchrones - un rendu plus récent peut avoir déjà repeint `container` pendant l'attente, `wrapper` ne serait
    // alors plus attaché et insertBefore lèverait une exception.
    if (!wrapper.isConnected) return;

    if (headerForPage(1)) {
      const edgeTop = document.createElement('div');
      edgeTop.className = 'v2-page-edge-spacer v2-page-edge-top';
      edgeTop.innerHTML = PageLayout.resolvePageNumberBadges(headerForPage(1), 1, totalPages);
      container.insertBefore(edgeTop, wrapper);
    }
    if (footerForPage(totalPages)) {
      const edgeBottom = document.createElement('div');
      edgeBottom.className = 'v2-page-edge-spacer v2-page-edge-bottom';
      edgeBottom.innerHTML = PageLayout.resolvePageNumberBadges(footerForPage(totalPages), totalPages, totalPages);
      container.appendChild(edgeBottom);
    }

    const overlay = document.createElement('div');
    overlay.className = 'v2-pagination-overlay';
    container.appendChild(overlay);
    // <style> en display:none, donc sans effet de mise en page propre, et dernier enfant de .reader-content : il ne décale aucun `nth-child` déjà calculé.
    const styleEl = document.createElement('style');
    wrapper.appendChild(styleEl);
    const marginRules = [];
    const wrapperOffsetTop = wrapper.offsetTop;
    const wrapperOffsetLeft = wrapper.offsetLeft;
    const zoom = layoutZoom(wrapper);
    // offsetWidth plutôt que le rectangle : déjà en pixels de mise en page, sans division ni erreur d'arrondi.
    const wrapperWidth = wrapper.offsetWidth;
    // Même modèle que l'aperçu éditeur (js/header-footer-preview.js:renderPaginationOverlay), au lieu des deux modèles divergents d'avant : une bande est
    // créée pour CHAQUE frontière de page (repère « Page N » quand il n'y a ni en-tête ni pied, comme dans l'éditeur - le mode Lecture n'en montrait alors
    // aucune), elle COMMENCE à la frontière au lieu de finir dessus, et l'espace qu'elle occupe est réellement réservé par un margin-bottom sur le dernier
    // bloc de la page. Sans cette réserve, la gouttière recouvrirait les dernières lignes de la page qui finit.
    offsets.forEach((offset, i) => {
      const pageEnding = i + 1; const pageStarting = i + 2;
      const footerText = footerForPage(pageEnding);
      const headerText = headerForPage(pageStarting);
      const seam = document.createElement('div');
      if (!footerText && !headerText) {
        seam.className = 'v2-page-band v2-page-break-line';
        const label = document.createElement('span'); label.className = 'v2-page-break-label'; label.textContent = 'Page ' + pageStarting;
        seam.appendChild(label);
      } else {
        seam.className = 'v2-page-band v2-page-seam';
        if (footerText) { const f = document.createElement('div'); f.className = 'v2-page-band-footer'; f.innerHTML = PageLayout.resolvePageNumberBadges(footerText, pageEnding, totalPages); seam.appendChild(f); }
        const divider = document.createElement('div'); divider.className = 'v2-page-seam-divider'; seam.appendChild(divider);
        if (headerText) { const h = document.createElement('div'); h.className = 'v2-page-band-header'; h.innerHTML = PageLayout.resolvePageNumberBadges(headerText, pageStarting, totalPages); seam.appendChild(h); }
      }
      overlay.appendChild(seam);
      seam.style.left = wrapperOffsetLeft + 'px';
      seam.style.width = wrapperWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height / zoom;
      const el = wrapperChildren[offset.afterIndex];
      // Écrit la feuille à chaque itération : la frontière suivante doit voir l'effet des marges déjà posées avant de mesurer sa propre position.
      // Sélecteur préfixé de #reader-container : `#reader-container p { margin: 0 }` (css/editor-v2.css) est plus spécifique qu'un simple
      // `.reader-content > *:nth-child(N)` et écrasait silencieusement la réserve dès que le dernier bloc d'une page était un paragraphe - la
      // gouttière recouvrait alors une ligne de texte. Invisible avant, la règle n'étant posée que pour les sauts de page forcés, dont le bloc est
      // un <div class="page-break-marker">, jamais un <p>.
      if (el) marginRules.push('#reader-container .reader-content > *:nth-child(' + (offset.afterIndex + 1) + ') { margin-bottom: ' + (seamHeight + offset.remainingPx) + 'px; }');
      styleEl.textContent = marginRules.join('\n');
      // getBoundingClientRect() ne compte jamais la marge PROPRE de l'élément (margin-bottom pousse le FRÈRE suivant, pas sa propre boîte) - il faut donc
      // rajouter remainingPx à la main pour retrouver la vraie frontière.
      const rootRect = wrapper.getBoundingClientRect();
      const boundaryTop = el ? ((el.getBoundingClientRect().bottom - rootRect.top) / zoom + offset.remainingPx) : offset.top;
      seam.style.top = (wrapperOffsetTop + boundaryTop) + 'px';
    });
  }

  let renderGeneration = 0;
  async function render(htmlContent, tableId, record, headerFooterData) {
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    // État vide : atteignable depuis js/main.js:renderReader(), qui appelle désormais render() avec record=null au lieu de retourner en silence (le mode
    // Lecture affichait alors un conteneur totalement vide, sans la moindre explication). Pas de .error-msg ici : ce n'est pas une erreur, juste une étape
    // que l'utilisateur n'a pas encore faite.
    if (!record) {
      container.innerHTML = '';
      const empty = document.createElement('div'); empty.className = 'reader-empty';
      const title = document.createElement('p'); title.className = 'reader-empty-title'; title.textContent = I18n.t('reader.empty.title');
      const hint = document.createElement('p'); hint.className = 'reader-empty-hint'; hint.textContent = I18n.t('reader.empty.hint');
      empty.appendChild(title); empty.appendChild(hint); container.appendChild(empty);
      return;
    }
    // .reader-content : le parent direct des titres de premier niveau, celui qui porte data-heading-style (#reader-container ne peut pas jouer ce rôle, ce
    // <div> s'intercale toujours entre les deux).
    const wrapper = document.createElement('div'); wrapper.className = 'reader-content'; wrapper.innerHTML = HtmlSanitize.clean(htmlContent);
    // Un lien de la Lecture s'ouvre dans un nouvel onglet : le suivre dans le cadre du widget le remplacerait (et la plupart des sites refusent d'y être affichés).
    wrapper.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    const configEl = wrapper.querySelector(':scope > .heading-numbering-config');
    wrapper.dataset.headingStyle = (configEl && configEl.dataset.style) || 'none';
    // Rafraîchit le schéma avant de résoudre les badges : resolveBadgeNode a besoin de GristAPI.getColumnType à jour pour détecter une colonne Attachments
    // récemment ajoutée.
    await GristAPI.refreshSchema().catch(() => {});
    // Zones répétées d'une boucle (js/loop-rules.js) déroulées AVANT la résolution : chaque copie porte la ligne de son tour, lue par resolveBadgeNode.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId, record, loopCtx);
    // Blocs de texte conditionnels (js/conditional-text.js) : défaits ou retirés ici, avant les bulles - celles d'un bloc retiré n'ont rien à résoudre.
    await ConditionalText.resolve(wrapper, tableId, record);
    const badges = wrapper.querySelectorAll('.var-badge'); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      const { node, isError } = await resolveBadgeNode(badge, tableId, record, format, loopCtx);
      return { badge, node, isError };
    }));
    for (const r of results) { if (r.isError) hasError = true; carryReaderAtom(r.badge, r.node); r.badge.replaceWith(r.node); }
    LoopRules.removeHiddenBlocks(wrapper);
    await resolveVariableImages(wrapper, tableId, record);
    await resolveSmartChips(wrapper);
    trimTrailingBlankBlocks(wrapper);
    keepBlankLines(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    // Variables déjà résolues (texte des titres définitif) : peut construire le sommaire maintenant, avant le swap DOM final ci-dessous.
    resolveTocMarkers(wrapper);
    if (renderId !== renderGeneration) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = I18n.t('reader.unresolvedVariables'); container.appendChild(warn); }
    container.appendChild(wrapper);
    await renderPaginationPreview(container, wrapper, headerFooterData, tableId, record);
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
  // Chips intelligents - date du jour/heure actuelle/email utilisateur, valeurs calculées (jamais liées à une colonne Grist) donc résolues à chaque rendu
  // sans recherche de ligne/table liée. `.footnote-ref-marker` n'a pas besoin d'être résolu ici : son numéro vient du compteur CSS, déjà correct à l'écran.
  function formatTodayDate() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function formatNowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  async function resolveSmartChips(wrapper) {
    const chips = Array.from(wrapper.querySelectorAll('.smart-chip'));
    await Promise.all(chips.map(async chip => {
      const kind = chip.getAttribute('data-chip-kind');
      let text = ''; let isError = false;
      if (kind === 'date') text = formatTodayDate();
      else if (kind === 'time') text = formatNowTime();
      else if (kind === 'email') {
        // Repli visuel identique à une #Variable cassée en cas d'échec (réseau, portée du jeton insuffisante...), jamais un blocage du reste du rendu.
        try {
          text = await GristAPI.getCurrentUserEmail();
          if (!text) { text = I18n.t('reader.emailUnavailable'); isError = true; }
        } catch (e) { text = I18n.t('reader.emailUnavailable'); isError = true; }
      }
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
      const span = document.createElement('span'); span.textContent = res.text; span.className = 'resolved-var';
      return { node: span, isError: false };
    } catch (e) {
      console.error('[ReaderMode] échec de la boucle d\'une variable', e);
      return null;
    }
  }
  async function resolveBadgeNode(badge, tableId, record, format, loopCtx) {
    const binding = LoopRules.bindingOf(badge);
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
      const span = document.createElement('span'); span.textContent = text; span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      return { node: span, isError };
    } catch (e) {
      const span = document.createElement('span'); span.textContent = I18n.t('variables.error.generic', { message: e.message }); span.className = 'resolved-var error-msg';
      return { node: span, isError: true };
    }
  }
  // `onBadge(badge, binding)` (facultatif, js/xlsx-export.js) : appelé pour chaque bulle APRÈS le déroulé des zones répétées et AVANT qu'elle soit remplacée par sa
  // valeur, avec la ligne du tour qu'elle suit (null hors zone) ; le fichier Excel y repère les cases qui ne contiennent qu'un nombre ou qu'une date. Il s'exécute
  // d'un trait jusqu'à son premier `await` pendant que le parcours démarre : toutes les bulles sont alors encore en place.
  async function preview(htmlContent, tableId, record, onBadge) {
    const wrapper = document.createElement('div'); wrapper.innerHTML = HtmlSanitize.clean(htmlContent);
    // Cf. commentaire équivalent dans render() : schéma à jour nécessaire pour que resolveBadgeNode détecte correctement une colonne Attachments.
    await GristAPI.refreshSchema().catch(() => {});
    // Mêmes zones répétées que le mode Lecture (cf. render()), avant de lister les bulles : les copies en font partie.
    const loopCtx = LoopRules.createContext();
    await LoopRules.expandZones(wrapper, tableId || lastCurrentTableId, record, loopCtx);
    await ConditionalText.resolve(wrapper, tableId || lastCurrentTableId, record);
    const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      if (onBadge) await onBadge(badge, LoopRules.bindingOf(badge));
      const { node } = await resolveBadgeNode(badge, tableId || lastCurrentTableId, record, format, loopCtx);
      badge.replaceWith(node);
    }));
    LoopRules.removeHiddenBlocks(wrapper);
    await resolveVariableImages(wrapper, tableId || lastCurrentTableId, record);
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
  return { render, preview, resolveFilename, trimTrailingBlankBlocks };
})();
