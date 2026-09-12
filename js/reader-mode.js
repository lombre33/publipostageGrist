// Publipostage Grist — reader mode v1.1.2 — 2026-09-04
const ReaderMode = (function () {
  let lastCurrentTableId = null;
  // Format nombre/date choisi via la barre flottante d'une bulle #Variable
  // (cf. js/editor.js:wireVariableFloatingToolbar), sérialisé en JSON dans
  // data-format par le nœud varBadge. Transmis en 5e argument à
  // Variables.resolveVariable ; un seul point de lecture ici, partagé par
  // render()/preview() ci-dessous, qui alimentent respectivement le mode
  // Lecture et l'export PDF (PdfExport ne voit jamais les bulles brutes,
  // preview() les a déjà toutes résolues avant).
  function parseBadgeFormat(badge) {
    const raw = badge.getAttribute('data-format');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // === Aperçu paginé réel - mode Lecture ===
  // Même principe que js/editor.js:renderPaginationOverlay, dupliqué plutôt
  // qu'importé (pas de mécanisme de module entre scripts classiques - même
  // tolérance à la duplication que la numérotation des titres). Plus simple
  // ici : contenu statique déjà résolu, pas de débounce nécessaire.
  const PT_TO_PX = 96 / 72;
  const A4_PAGE_HEIGHT_PX = 841.89 * PT_TO_PX;
  const A4_BASE_MARGIN_PX = 37.33; // doit matcher le padding de .reader-content en Aperçu A4 (css/editor-v2.css)
  const A4_CONTENT_WIDTH_PX = 719.04; // même valeur que CONTENT_WIDTH_PX, js/pdf-export.js
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, js/pdf-export.js

  function measureHtmlHeightPx(html) {
    if (!html || !html.replace(/<[^>]*>/g, '').trim()) return 0;
    const host = document.createElement('div');
    host.className = 'reader-content';
    host.innerHTML = html;
    // min-height:0 : .reader-content n'a pas le min-height:200px de .tiptap
    // (css/editor-v2.css, propre à l'éditeur VIDE) - conservé quand même par
    // cohérence/robustesse avec la même mesure côté éditeur/export PDF.
    host.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + A4_CONTENT_WIDTH_PX + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(host);
    const h = host.getBoundingClientRect().height;
    document.body.removeChild(host);
    return h;
  }
  function computePageBreakOffsets(rootEl, pageContentHeightPx) {
    const rootRect = rootEl.getBoundingClientRect();
    const offsets = [];
    let consumed = 0;
    Array.from(rootEl.children).forEach(child => {
      const rect = child.getBoundingClientRect();
      const top = rect.top - rootRect.top;
      const height = rect.height;
      if (child.classList.contains('page-break-marker')) { offsets.push(top + height); consumed = 0; return; }
      if (consumed > 0 && consumed + height > pageContentHeightPx) { offsets.push(top); consumed = height; }
      else { consumed += height; }
    });
    return offsets;
  }
  function resolvePageNumberBadgesForPreview(html, pageNum, totalPages) {
    const host = document.createElement('div');
    host.innerHTML = html || '';
    host.querySelectorAll('.page-number-badge').forEach(badge => {
      const format = badge.getAttribute('data-format') || 'n';
      badge.textContent = format === 'page-n' ? ('Page ' + pageNum) : format === 'n-slash-total' ? (pageNum + '/' + totalPages) : String(pageNum);
    });
    return host.innerHTML;
  }
  // #Variable d'un fragment d'en-tête/pied - même résolution que le corps
  // (badges .var-badge remplacés par leur valeur réelle), avec le VRAI
  // enregistrement Grist affiché en mode Lecture.
  async function resolveHeaderFooterZone(html, tableId, record) {
    if (!html) return html;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => {
      const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column');
      const format = parseBadgeFormat(badge);
      try { const value = await Variables.resolveVariable(table, column, tableId, record, format); const span = document.createElement('span'); span.textContent = value; badge.replaceWith(span); } catch (e) {}
    }));
    // La note de bas de page n'est volontairement pas insérable en en-tête/
    // pied (aucun repère de page dans une zone répétée sur chaque page),
    // donc resolveSmartChips ne trouve jamais de .footnote-ref-marker ici.
    await resolveSmartChips(wrapper);
    return wrapper.innerHTML;
  }
  // Insère les espaceurs de bord (vrais frères DOM de `wrapper`, en flux
  // normal) et les bandes "couture" aux limites intermédiaires
  // (position:absolute, peuvent recouvrir un peu de texte pile à la limite - résidu assumé).
  async function renderPaginationPreview(container, wrapper, headerFooterData, tableId, record) {
    if (!headerFooterData || !headerFooterData.enabled) return;
    if (!container.classList.contains('a4-preview')) return;
    const differentFirstPage = !!headerFooterData.differentFirstPage;
    const headerDefault = await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.default, tableId, record);
    const headerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.header && headerFooterData.header.first, tableId, record) : null;
    const footerDefault = await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.default, tableId, record);
    const footerFirst = differentFirstPage ? await resolveHeaderFooterZone(headerFooterData.footer && headerFooterData.footer.first, tableId, record) : null;
    const headerForPage = n => (n === 1 && differentFirstPage) ? headerFirst : headerDefault;
    const footerForPage = n => (n === 1 && differentFirstPage) ? footerFirst : footerDefault;

    const headerHeightPx = Math.max(measureHtmlHeightPx(headerDefault), measureHtmlHeightPx(headerFirst));
    const footerHeightPx = Math.max(measureHtmlHeightPx(footerDefault), measureHtmlHeightPx(footerFirst));
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const pageContentHeightPx = Math.max(50, A4_PAGE_HEIGHT_PX - 2 * A4_BASE_MARGIN_PX - topExtraPx - bottomExtraPx);
    const offsets = computePageBreakOffsets(wrapper, pageContentHeightPx);
    const totalPages = offsets.length + 1;

    // Les résolutions #Variable ci-dessus sont asynchrones - un rendu plus
    // récent peut avoir déjà repeint `container` pendant l'attente, `wrapper`
    // ne serait alors plus attaché et insertBefore lèverait une exception.
    if (!wrapper.isConnected) return;

    const edgeTop = document.createElement('div');
    edgeTop.className = 'v2-page-edge-spacer v2-page-edge-top';
    edgeTop.innerHTML = resolvePageNumberBadgesForPreview(headerForPage(1), 1, totalPages);
    container.insertBefore(edgeTop, wrapper);
    const edgeBottom = document.createElement('div');
    edgeBottom.className = 'v2-page-edge-spacer v2-page-edge-bottom';
    edgeBottom.innerHTML = resolvePageNumberBadgesForPreview(footerForPage(totalPages), totalPages, totalPages);
    container.appendChild(edgeBottom);

    const overlay = document.createElement('div');
    overlay.className = 'v2-pagination-overlay';
    container.appendChild(overlay);
    const wrapperOffsetTop = wrapper.offsetTop;
    const wrapperOffsetLeft = wrapper.offsetLeft;
    const wrapperWidth = wrapper.getBoundingClientRect().width;
    offsets.forEach((offsetPx, i) => {
      const pageEnding = i + 1; const pageStarting = i + 2;
      const footerText = footerForPage(pageEnding);
      const headerText = headerForPage(pageStarting);
      if (!footerText && !headerText) return;
      const seam = document.createElement('div');
      seam.className = 'v2-page-band v2-page-seam';
      if (footerText) { const f = document.createElement('div'); f.className = 'v2-page-band-footer'; f.innerHTML = resolvePageNumberBadgesForPreview(footerText, pageEnding, totalPages); seam.appendChild(f); }
      const divider = document.createElement('div'); divider.className = 'v2-page-seam-divider'; seam.appendChild(divider);
      if (headerText) { const h = document.createElement('div'); h.className = 'v2-page-band-header'; h.innerHTML = resolvePageNumberBadgesForPreview(headerText, pageStarting, totalPages); seam.appendChild(h); }
      overlay.appendChild(seam);
      seam.style.left = wrapperOffsetLeft + 'px';
      seam.style.width = wrapperWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height;
      seam.style.top = (wrapperOffsetTop + offsetPx - seamHeight) + 'px';
    });
  }

  let renderGeneration = 0;
  async function render(htmlContent, tableId, record, headerFooterData) {
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    if (!record) { container.innerHTML = '<p class="error-msg">Aucune ligne sélectionnée dans Grist.</p>'; return; }
    // .reader-content : le parent direct des titres de premier niveau, celui
    // qui porte data-heading-style (#reader-container ne peut pas jouer ce
    // rôle, ce <div> s'intercale toujours entre les deux).
    const wrapper = document.createElement('div'); wrapper.className = 'reader-content'; wrapper.innerHTML = HtmlSanitize.clean(htmlContent);
    const configEl = wrapper.querySelector(':scope > .heading-numbering-config');
    wrapper.dataset.headingStyle = (configEl && configEl.dataset.style) || 'none';
    // Rafraîchit le schéma avant de résoudre les badges : resolveBadgeNode a
    // besoin de GristAPI.getColumnType à jour pour détecter une colonne
    // Attachments récemment ajoutée.
    await GristAPI.refreshSchema().catch(() => {});
    const badges = wrapper.querySelectorAll('.var-badge'); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      const { node, isError } = await resolveBadgeNode(badge, tableId, record, format);
      return { badge, node, isError };
    }));
    for (const r of results) { if (r.isError) hasError = true; r.badge.replaceWith(r.node); }
    await resolveVariableImages(wrapper, tableId, record);
    await resolveSmartChips(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    // Variables déjà résolues (texte des titres définitif) : peut construire
    // le sommaire maintenant, avant le swap DOM final ci-dessous.
    resolveTocMarkers(wrapper);
    if (renderId !== renderGeneration) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = 'Attention : certaines variables n\'ont pas pu être résolues.'; container.appendChild(warn); }
    container.appendChild(wrapper);
    await renderPaginationPreview(container, wrapper, headerFooterData, tableId, record);
  }
  // Remplace chaque placeholder .toc-marker par la vraie liste des titres de
  // premier niveau, numérotée avec le même schéma que la numérotation CSS à
  // l'écran. Pas de numéro de page ici (le mode lecture n'est pas paginé),
  // contrairement à l'export PDF vectoriel.
  //
  // Le marqueur est recalculé en JS (headingCounterEntries), pas lu via
  // getComputedStyle(h, '::before').content : ce dernier ne renvoie que la
  // valeur CSS déclarée (littéralement "counter(h1c)"), jamais le texte
  // réellement peint - `counter()` n'est résolu qu'au moment de la peinture,
  // la CSSOM ne l'expose pas.
  function resolveTocMarkers(wrapper) {
    const tocMarkers = wrapper.querySelectorAll(':scope > .toc-marker');
    if (!tocMarkers.length) return;
    const headings = Array.from(wrapper.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const numberingStyle = wrapper.dataset.headingStyle || 'none';
    const entries = headingCounterEntries(headings, numberingStyle);
    tocMarkers.forEach(marker => {
      marker.innerHTML = '';
      marker.classList.add('toc-resolved');
      const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = 'Sommaire'; marker.appendChild(title);
      if (!entries.length) { const empty = document.createElement('div'); empty.className = 'toc-empty'; empty.textContent = 'Aucun titre trouvé.'; marker.appendChild(empty); return; }
      entries.forEach(entry => {
        const line = document.createElement('div'); line.className = 'toc-entry toc-level-' + entry.level; line.textContent = entry.text;
        marker.appendChild(line);
      });
    });
  }
  // Reproduit en JS la cascade de compteurs CSS de style.css : chaque titre
  // incrémente le compteur de son niveau et réinitialise ceux des niveaux
  // plus profonds, même ordre de style par niveau que les règles CSS ::before.
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
  // Résout un placeholder d'image lié à une #Variable : ce nœud est déjà un
  // <img class="editor-image"> (width/height fixés dans l'éditeur), il ne
  // s'agit que de le rattacher à la bonne pièce jointe pour que
  // GristAPI.hydrateAttachmentImages lui pose un vrai src. `object-fit:
  // contain` fait le reste à l'écran nativement, jamais déformé ni rogné.
  // Retire le nœud entièrement si la ligne courante n'a aucune pièce jointe.
  async function resolveVariableImages(wrapper, tableId, record) {
    const nodes = Array.from(wrapper.querySelectorAll('img.editor-image[data-var-table]'));
    await Promise.all(nodes.map(async img => {
      const table = img.getAttribute('data-var-table');
      const column = img.getAttribute('data-var-column');
      let ids = [];
      try { ids = await Variables.resolveAttachmentIds(table, column, tableId, record); }
      catch (e) { ids = []; }
      if (!ids.length) { img.remove(); return; }
      // data-var-table/-column/-key restent posés : c'est le marqueur que
      // pdf-export.js:pdfImageFromNode lit pour choisir `fit` (boîte fixe,
      // image mise à l'échelle sans déformation) plutôt que `width` seul.
      img.dataset.source = 'attachment';
      img.dataset.attachmentId = String(ids[0]);
      img.style.objectFit = 'contain';
    }));
  }
  // Chips intelligents - date du jour/heure actuelle/email utilisateur,
  // valeurs calculées (jamais liées à une colonne Grist) donc résolues à
  // chaque rendu sans recherche de ligne/table liée. `.footnote-ref-marker`
  // n'a pas besoin d'être résolu ici : son numéro vient du compteur CSS,
  // déjà correct à l'écran - seul son texte doit être placé dans le PDF exporté.
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
        // Repli visuel identique à une #Variable cassée en cas d'échec
        // (réseau, portée du jeton insuffisante...), jamais un blocage du reste du rendu.
        try {
          text = await GristAPI.getCurrentUserEmail();
          if (!text) { text = '[Email indisponible]'; isError = true; }
        } catch (e) { text = '[Email indisponible]'; isError = true; }
      }
      const span = document.createElement('span');
      span.textContent = text;
      span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      chip.replaceWith(span);
    }));
  }
  // Résout un badge #Variable en noeud DOM à insérer à sa place - texte
  // (comportement historique) OU une ou plusieurs <img> si la colonne
  // référencée est de type Grist Attachments (cf. Variables.resolveAttachmentIds) :
  // une colonne PJ contenant une image affichait jusqu'ici la valeur de
  // cellule brute passée telle quelle dans formatValue (un texte du genre
  // "L, 5", jamais l'image) aussi bien en aperçu qu'à l'export PDF - signalé
  // par l'utilisateur. Les <img> produites réutilisent exactement les
  // classes/attributs déjà lus par GristAPI.hydrateAttachmentImages
  // (img.editor-image[data-source="attachment"][data-attachment-id]), déjà
  // appelé juste après par preview()/render() - aucun nouveau code de
  // résolution d'URL de pièce jointe à écrire ici.
  async function resolveBadgeNode(badge, tableId, record, format) {
    const table = badge.getAttribute('data-table');
    const column = badge.getAttribute('data-column');
    const isAttachments = GristAPI.getColumnType(table, column) === 'Attachments';
    if (isAttachments) {
      let ids = [];
      try { ids = await Variables.resolveAttachmentIds(table, column, tableId, record); }
      catch (e) { return { node: document.createTextNode(''), isError: true }; }
      if (!ids.length) return { node: document.createTextNode(''), isError: false };
      const frag = document.createDocumentFragment();
      ids.forEach(id => {
        const img = document.createElement('img');
        img.className = 'editor-image';
        img.dataset.source = 'attachment';
        img.dataset.attachmentId = String(id);
        // Largeur par défaut explicite (même valeur que l'insertion d'image
        // normale) : cette image n'a jamais été redimensionnée dans l'éditeur
        // (elle n'existe qu'au moment de la résolution), donc sans cette
        // valeur une photo haute résolution s'afficherait à sa pleine
        // largeur intrinsèque, plus grande qu'un logo n'a besoin de l'être.
        img.style.width = '320px';
        frag.appendChild(img);
      });
      return { node: frag, isError: false };
    }
    try {
      const value = await Variables.resolveVariable(table, column, tableId, record, format);
      const isError = typeof value === 'string' && value.indexOf('[ERREUR') === 0;
      const span = document.createElement('span'); span.textContent = value; span.className = 'resolved-var' + (isError ? ' error-msg' : '');
      return { node: span, isError };
    } catch (e) {
      const span = document.createElement('span'); span.textContent = '[ERREUR: ' + e.message + ']'; span.className = 'resolved-var error-msg';
      return { node: span, isError: true };
    }
  }
  async function preview(htmlContent, tableId, record) {
    const wrapper = document.createElement('div'); wrapper.innerHTML = HtmlSanitize.clean(htmlContent); const badges = wrapper.querySelectorAll('.var-badge');
    // Cf. commentaire équivalent dans render() : schéma à jour nécessaire
    // pour que resolveBadgeNode détecte correctement une colonne Attachments.
    await GristAPI.refreshSchema().catch(() => {});
    await Promise.all(Array.from(badges).map(async badge => {
      const format = parseBadgeFormat(badge);
      const { node } = await resolveBadgeNode(badge, tableId || lastCurrentTableId, record, format);
      badge.replaceWith(node);
    }));
    await resolveVariableImages(wrapper, tableId || lastCurrentTableId, record);
    await resolveSmartChips(wrapper);
    await GristAPI.hydrateAttachmentImages(wrapper);
    return wrapper.innerHTML;
  }
  // Découpe le gabarit en scannant chaque "#" et en essayant la plus longue
  // clé de variable connue qui suit (pas un simple regex [A-Za-z0-9_]+) :
  // une clé Grist ("Clients_Nom") contient elle-même des "_", indiscernables
  // d'un séparateur tapé entre deux variables - un simple regex captait à
  // tort le séparateur, la variable entière était alors silencieusement
  // perdue. Comparer aux clés réellement connues (les plus longues d'abord)
  // élimine cette ambiguïté.
  async function resolveFilename(filenameTemplate, tableId, record) {
    if (!filenameTemplate) return 'publipostage';
    const allVars = GristAPI.getAllVariables();
    const sortedKeys = allVars.map(v => v.key).sort((a, b) => b.length - a.length);
    // Touche de déclenchement configurable (cf. js/settings.js), lue
    // directement en localStorage.
    let triggerChar = '#';
    try { const v = localStorage.getItem('pp_trigger_char'); if (v && v.length === 1) triggerChar = v; } catch (e) { /* repli '#' */ }
    const matches = [];
    let i = 0;
    while (i < filenameTemplate.length) {
      if (filenameTemplate[i] === triggerChar) {
        const rest = filenameTemplate.slice(i + 1);
        const key = sortedKeys.find(k => rest.startsWith(k));
        if (key) { matches.push({ start: i, key, end: i + 1 + key.length }); i += 1 + key.length; continue; }
      }
      i += 1;
    }
    const resolved = await Promise.all(matches.map(async m => {
      const found = allVars.find(v => v.key === m.key);
      try { const val = await Variables.resolveVariable(found.table, found.column, tableId, record); return String(val || '').replace(/[\\/:*?"<>|]/g, '_'); }
      catch (e) { return ''; }
    }));
    let result = ''; let lastEnd = 0;
    matches.forEach((m, idx) => { result += filenameTemplate.slice(lastEnd, m.start) + resolved[idx]; lastEnd = m.end; });
    result += filenameTemplate.slice(lastEnd);
    return result;
  }
  return { render, preview, resolveFilename };
})();
