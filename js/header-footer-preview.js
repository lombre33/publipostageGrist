// Édition en-tête/pied de page + aperçu de pagination - extrait de editor.js (découpage 2026). Un seul éditeur TipTap : le contenu affiché est échangé via
// editor.commands.setContent() entre le document principal et le fragment en-tête/pied en cours d'édition (cf. enterHeaderFooterMode/exitHeaderFooterMode).
const HeaderFooterPreview = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; }

  // `null` = édition normale ; sinon édition d'en-tête/pied (même éditeur, contenu affiché échangé via setContent).
  let hfMode = null; // { zone: 'header'|'footer', variant: 'default'|'first' }
  function getHfMode() { return hfMode; }
  let mainDocSnapshot = null;
  function emptyHeaderFooterData() {
    return { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  }
  let headerFooterDraft = emptyHeaderFooterData();

  // Taille max d'une image en en-tête/pied (convention, pas une limite technique).
  const HF_MAX_IMAGE_HEIGHT_PX = 60;
  const HF_MAX_IMAGE_WIDTH_PX = 300;
  function clampWidthForHfMaxSize(widthPx, naturalWidth, naturalHeight) {
    if (!hfMode || !naturalWidth || !naturalHeight) return widthPx;
    const maxWidthFromHeight = HF_MAX_IMAGE_HEIGHT_PX * (naturalWidth / naturalHeight);
    const maxWidthPx = Math.min(HF_MAX_IMAGE_WIDTH_PX, maxWidthFromHeight);
    return Math.min(widthPx, maxWidthPx);
  }

  // Édition en-tête/pied de page : un seul éditeur, on y charge le fragment voulu après avoir sauvegardé ce qu'on quitte (brouillon, ou snapshot du document
  // principal à la toute première entrée).
  function enterHeaderFooterMode(zone, variant) {
    if (!editor) return;
    if (hfMode) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    else mainDocSnapshot = editor.getHTML();
    headerFooterDraft.enabled = true;
    hfMode = { zone, variant };
    editor.commands.setContent(headerFooterDraft[zone][variant] || '');
    const container = document.getElementById('editor-container');
    if (container) container.classList.add('hf-editing');
    // Temporaire (étape 2/5 du découpage) : redevient MainToolbar.syncToolbarState() à l'étape 5, quand main-toolbar.js existera.
    Editor.syncToolbarState();
    renderHfPill();
    renderPaginationOverlay();
  }

  function exitHeaderFooterMode() {
    if (!hfMode || !editor) return;
    headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    hfMode = null;
    editor.commands.setContent(mainDocSnapshot || '');
    mainDocSnapshot = null;
    const container = document.getElementById('editor-container');
    if (container) container.classList.remove('hf-editing');
    Editor.syncToolbarState();
    renderHfPill();
    renderPaginationOverlay();
  }

  // Appelé par main.js avant Save/Export/Lecture - sans ça editor.getHTML() renverrait le fragment d'en-tête/pied actuellement chargé, pas le document.
  function exitHeaderFooterModeIfActive() {
    if (hfMode) exitHeaderFooterMode();
  }
  // Note de bas de page masquée en zone en-tête/pied : répétée sur chaque page, aucune page physique à laquelle l'ancrer (le pipeline PDF ne les résout que
  // depuis le corps principal).
  function isEditingHeaderFooter() { return !!hfMode; }

  // Reflète le brouillon EN COURS (zone/variante actuellement affichée comprise) sans devoir sortir du mode - les appelants réels (Save/Export) appellent de
  // toute façon exitHeaderFooterModeIfActive() juste avant, mais un appel pendant que le mode est encore actif reste cohérent.
  function getHeaderFooterData() {
    if (hfMode && editor) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    return headerFooterDraft;
  }

  // Appelé au chargement d'un modèle, hfMode déjà garanti inactif (main.js appelle exitHeaderFooterModeIfActive juste avant).
  function setHeaderFooterData(data) {
    const empty = emptyHeaderFooterData();
    headerFooterDraft = data && typeof data === 'object'
      ? Object.assign(empty, data, {
          header: Object.assign({}, empty.header, data.header),
          footer: Object.assign({}, empty.footer, data.footer),
        })
      : empty;
    // Assaini ici : seul point d'entrée d'un en-tête/pied venant de la colonne Grist (modifiable par un autre collaborateur sans ouvrir ce widget).
    headerFooterDraft.header.default = HtmlSanitize.clean(headerFooterDraft.header.default);
    headerFooterDraft.header.first = HtmlSanitize.clean(headerFooterDraft.header.first);
    headerFooterDraft.footer.default = HtmlSanitize.clean(headerFooterDraft.footer.default);
    headerFooterDraft.footer.first = HtmlSanitize.clean(headerFooterDraft.footer.first);
    renderPaginationOverlay();
  }

  // Pastille flottante d'édition d'en-tête/pied, sticky en haut de #editor-container, visible seulement pendant l'édition (hfMode actif). On y entre en
  // cliquant une zone de marge posée par renderPaginationOverlay, pas via un bouton de toolbar. Construite une fois puis resynchronisée.
  function renderHfPill() {
    const container = document.getElementById('editor-container');
    if (!container) return;
    let pill = document.getElementById('v2-hf-pill');
    if (!hfMode) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'v2-hf-pill';
      pill.className = 'v2-hf-pill';
      pill.innerHTML =
        '<span class="v2-segmented" id="v2-hf-zone-segment">'
        + `<button type="button" class="v2-segmented-btn" data-zone="header">${I18n.t('hf.zoneHeader')}</button>`
        + `<button type="button" class="v2-segmented-btn" data-zone="footer">${I18n.t('hf.zoneFooter')}</button>`
        + '</span>'
        + `<label class="v2-hf-checkbox"><input type="checkbox" id="v2-hf-different-first">${I18n.t('hf.differentFirstPage')}</label>`
        + '<span class="v2-segmented" id="v2-hf-variant-segment" hidden>'
        + `<button type="button" class="v2-segmented-btn" data-variant="default">${I18n.t('hf.variantDefault')}</button>`
        + `<button type="button" class="v2-segmented-btn" data-variant="first">${I18n.t('hf.variantFirst')}</button>`
        + '</span>'
        + '<span class="v2-hover-group" id="v2-hf-pagenum-group">'
        + `<button type="button" id="v2-hf-btn-pagenum" data-tip="${I18n.t('hf.insertPageNumber')}" aria-label="${I18n.t('hf.insertPageNumber')}"><span class="v2-hf-pagenum-icon" aria-hidden="true">#</span></button>`
        + '<span class="v2-hover-flyout v2-hover-flyout-v" id="v2-hf-pagenum-flyout">'
        + `<span class="v2-hover-row" data-pagenum-format="n">${I18n.t('hf.pagenumSimple')}</span>`
        + `<span class="v2-hover-row" data-pagenum-format="page-n">${I18n.t('hf.pagenumPageN')}</span>`
        + `<span class="v2-hover-row" data-pagenum-format="n-slash-total">${I18n.t('hf.pagenumSlash')}</span>`
        + '</span>'
        + '</span>'
        + `<button type="button" id="v2-hf-btn-done" class="v2-hf-btn-done">${I18n.t('hf.done')}</button>`;
      container.insertBefore(pill, container.firstChild);

      pill.querySelectorAll('#v2-hf-zone-segment button').forEach(btn => {
        btn.addEventListener('click', () => { if (hfMode && hfMode.zone !== btn.dataset.zone) enterHeaderFooterMode(btn.dataset.zone, hfMode.variant); });
      });
      pill.querySelectorAll('#v2-hf-variant-segment button').forEach(btn => {
        btn.addEventListener('click', () => { if (hfMode && hfMode.variant !== btn.dataset.variant) enterHeaderFooterMode(hfMode.zone, btn.dataset.variant); });
      });
      pill.querySelector('#v2-hf-different-first').addEventListener('change', (event) => {
        headerFooterDraft.differentFirstPage = event.target.checked;
        if (!event.target.checked && hfMode && hfMode.variant === 'first') enterHeaderFooterMode(hfMode.zone, 'default');
        else renderHfPill();
      });
      pill.querySelector('#v2-hf-btn-done').addEventListener('click', () => exitHeaderFooterMode());
      // mousedown+preventDefault (pas click) : un simple click perdrait la sélection ProseMirror avant l'exécution de la commande.
      pill.querySelectorAll('#v2-hf-pagenum-flyout .v2-hover-row').forEach(row => {
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          editor.chain().focus().insertPageNumberBadge(row.dataset.pagenumFormat).run();
        });
      });
    }
    pill.querySelectorAll('#v2-hf-zone-segment button').forEach(btn => btn.classList.toggle('active', btn.dataset.zone === hfMode.zone));
    pill.querySelectorAll('#v2-hf-variant-segment button').forEach(btn => btn.classList.toggle('active', btn.dataset.variant === hfMode.variant));
    pill.querySelector('#v2-hf-different-first').checked = !!headerFooterDraft.differentFirstPage;
    pill.querySelector('#v2-hf-variant-segment').hidden = !headerFooterDraft.differentFirstPage;
  }

  // Constantes dupliquées depuis pdf-export.js (A4 = 595.28×841.89pt, marge 28pt, 1pt = 96/72px) : pas de module partagé entre les deux fichiers.
  const PT_TO_PX = 96 / 72;
  const A4_PAGE_HEIGHT_PX = 841.89 * PT_TO_PX;
  const A4_BASE_MARGIN_PX = 37.33; // doit matcher le padding de .tiptap en Aperçu A4
  const A4_CONTENT_WIDTH_PX = 719.04; // même valeur que CONTENT_WIDTH_PX, pdf-export.js
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, pdf-export.js

  // Hauteur rendue d'un fragment HTML, hors écran. min-height:0 annule le 200px réservé par .tiptap pour rester cliquable à vide (sinon un en-tête d'une
  // ligne mesurerait 200px).
  function measureHtmlHeightPx(html) {
    // Teste aussi <img : un en-tête/pied ne contenant qu'une image sans texte mesurerait sinon une hauteur de 0 (chevauchement avec le corps dans l'aperçu).
    if (!html || (!html.replace(/<[^>]*>/g, '').trim() && !/<img[\s>]/i.test(html))) return 0;
    const host = document.createElement('div');
    host.className = 'tiptap';
    host.innerHTML = html;
    host.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + A4_CONTENT_WIDTH_PX + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(host);
    const h = host.getBoundingClientRect().height;
    document.body.removeChild(host);
    return h;
  }

  // Accumule la hauteur des blocs de haut niveau de .tiptap, respecte .page-break-marker comme coupure forcée. Grain du bloc (jamais coupé en deux), pas du
  // pixel comme pdfmake. Retourne le bloc après lequel insérer la coupure (afterEl), pour poser un margin-bottom réel dessus.
  function computePageBreaks(tiptapEl, pageContentHeightPx) {
    const breaks = [];
    let consumed = 0;
    let lastBlock = null;
    Array.from(tiptapEl.children).forEach(child => {
      const height = child.getBoundingClientRect().height;
      if (child.classList.contains('page-break-marker')) {
        breaks.push({ afterEl: child, forced: true, remainingPx: Math.max(0, pageContentHeightPx - consumed) });
        consumed = 0;
        lastBlock = child;
        return;
      }
      if (consumed > 0 && consumed + height > pageContentHeightPx) {
        breaks.push({ afterEl: lastBlock, forced: false, remainingPx: 0 });
        consumed = height;
      } else {
        consumed += height;
      }
      lastBlock = child;
    });
    return breaks;
  }

  // Résout chaque badge .page-number-badge en son texte réel pour cette page (même conversion que formatPageNumberText côté pdf-export.js, dupliquée).
  function resolvePageNumberBadgesForPreview(html, pageNum, totalPages) {
    const host = document.createElement('div');
    host.innerHTML = html || '';
    host.querySelectorAll('.page-number-badge').forEach(badge => {
      const format = badge.getAttribute('data-format') || 'n';
      badge.textContent = format === 'page-n' ? ('Page ' + pageNum) : format === 'n-slash-total' ? (pageNum + '/' + totalPages) : String(pageNum);
    });
    return host.innerHTML;
  }

  let paginationOverlayEl = null;
  let paginationEdgeTopEl = null;
  let paginationEdgeBottomEl = null;
  let paginationRecomputeTimer = null;
  // Feuille de style dédiée (règles `:nth-child`), pas un style inline : un style posé directement sur un nœud ProseMirror est silencieusement annulé
  // (ProseMirror répare toute mutation DOM qu'il n'a pas produite lui-même).
  let paginationMarginStyleEl = null;
  function ensurePaginationMarginStyle() {
    if (!paginationMarginStyleEl) {
      paginationMarginStyleEl = document.createElement('style');
      paginationMarginStyleEl.id = 'v2-pagination-margins-style';
      document.head.appendChild(paginationMarginStyleEl);
    }
    return paginationMarginStyleEl;
  }
  function clearPageBreakMargins() {
    if (paginationMarginStyleEl) paginationMarginStyleEl.textContent = '';
  }
  function schedulePaginationRecompute() {
    if (paginationRecomputeTimer) clearTimeout(paginationRecomputeTimer);
    paginationRecomputeTimer = setTimeout(renderPaginationOverlay, 200);
  }
  function clearPaginationOverlay() {
    if (paginationOverlayEl) paginationOverlayEl.innerHTML = '';
    if (paginationEdgeTopEl && paginationEdgeTopEl.parentNode) paginationEdgeTopEl.parentNode.removeChild(paginationEdgeTopEl);
    if (paginationEdgeBottomEl && paginationEdgeBottomEl.parentNode) paginationEdgeBottomEl.parentNode.removeChild(paginationEdgeBottomEl);
    paginationEdgeTopEl = null; paginationEdgeBottomEl = null;
    clearPageBreakMargins();
  }

  // Zones de marge cliquables (façon Google Docs/Word) : un clic appelle enterHeaderFooterMode(zone, variant). Début/fin de document ont un vrai espace en
  // flux (`.v2-page-edge-spacer`, jamais enfant de `.tiptap`) ; les limites intermédiaires restent de purs overlays absolus dans la marge réservée.
  function ensureEdgeZone(pageSheet, tiptapEl, pos) {
    if (pos === 'top' && !paginationEdgeTopEl) {
      paginationEdgeTopEl = document.createElement('div');
      paginationEdgeTopEl.className = 'v2-page-edge-spacer v2-page-edge-top v2-hf-zone';
      pageSheet.insertBefore(paginationEdgeTopEl, tiptapEl);
    }
    if (pos === 'bottom' && !paginationEdgeBottomEl) {
      paginationEdgeBottomEl = document.createElement('div');
      paginationEdgeBottomEl.className = 'v2-page-edge-spacer v2-page-edge-bottom v2-hf-zone';
      pageSheet.insertBefore(paginationEdgeBottomEl, tiptapEl.nextSibling);
    }
  }
  function updateHfZone(el, html, pageNum, totalPages, zone, variant, ghostLabel) {
    const resolved = html ? resolvePageNumberBadgesForPreview(html, pageNum, totalPages) : '';
    // Teste aussi <img : sinon une zone ne contenant qu'une image (pas de texte) serait traitée à tort comme vide (même correctif que resolveZone,
    // pdf-export.js).
    const hasContent = !!(resolved.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(resolved));
    el.classList.toggle('v2-hf-zone-empty', !hasContent);
    el.classList.toggle('v2-hf-zone-filled', hasContent);
    el.innerHTML = hasContent
      ? '<div class="v2-hf-zone-body">' + resolved + '</div><span class="v2-hf-zone-pencil" aria-hidden="true"></span>'
      : '<span class="v2-hf-zone-ghost"><span aria-hidden="true">+</span> ' + ghostLabel + '</span>';
    el.onclick = () => enterHeaderFooterMode(zone, variant);
  }
  function renderPaginationOverlay() {
    const container = document.getElementById('editor-container');
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!container || !tiptapEl) return;
    if (hfMode || !container.classList.contains('a4-preview')) { clearPaginationOverlay(); return; }

    if (!paginationOverlayEl) {
      paginationOverlayEl = document.createElement('div');
      paginationOverlayEl.className = 'v2-pagination-overlay';
      container.appendChild(paginationOverlayEl);
    }
    paginationOverlayEl.innerHTML = '';

    const enabled = !!headerFooterDraft.enabled;
    const differentFirstPage = enabled && !!headerFooterDraft.differentFirstPage;
    const headerHtml = enabled ? headerFooterDraft.header.default : null;
    const headerFirstHtml = differentFirstPage ? headerFooterDraft.header.first : null;
    const footerHtml = enabled ? headerFooterDraft.footer.default : null;
    const footerFirstHtml = differentFirstPage ? headerFooterDraft.footer.first : null;
    const headerForPage = n => (n === 1 && differentFirstPage) ? headerFirstHtml : headerHtml;
    const footerForPage = n => (n === 1 && differentFirstPage) ? footerFirstHtml : footerHtml;

    const headerHeightPx = enabled ? Math.max(measureHtmlHeightPx(headerHtml), measureHtmlHeightPx(headerFirstHtml)) : 0;
    const footerHeightPx = enabled ? Math.max(measureHtmlHeightPx(footerHtml), measureHtmlHeightPx(footerFirstHtml)) : 0;
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const pageContentHeightPx = Math.max(50, A4_PAGE_HEIGHT_PX - 2 * A4_BASE_MARGIN_PX - topExtraPx - bottomExtraPx);
    // Nettoie avant de recalculer : le bloc "dernier de la page" peut changer d'une frappe à l'autre, une ancienne marge orpheline gonflerait le document.
    clearPageBreakMargins();
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const totalPages = breaks.length + 1;

    const pageSheet = tiptapEl.parentElement;
    ensureEdgeZone(pageSheet, tiptapEl, 'top');
    ensureEdgeZone(pageSheet, tiptapEl, 'bottom');
    updateHfZone(paginationEdgeTopEl, headerForPage(1), 1, totalPages, 'header', differentFirstPage ? 'first' : 'default', 'Ajouter un en-tête');
    updateHfZone(paginationEdgeBottomEl, footerForPage(totalPages), totalPages, totalPages, 'footer', (totalPages === 1 && differentFirstPage) ? 'first' : 'default', 'Ajouter un pied de page');

    const tiptapOffsetLeft = tiptapEl.offsetLeft;
    const tiptapWidth = tiptapEl.getBoundingClientRect().width;
    const tiptapRect = tiptapEl.getBoundingClientRect();

    // Une bande par frontière entre 2 pages (repère "— Page N —" par défaut sans en-tête/pied) ; espace réservé via `:nth-child` externe, pas un style inline
    // sur `afterEl` (même piège que paginationMarginStyleEl).
    const marginRules = [];
    const tiptapChildren = Array.from(tiptapEl.children);
    breaks.forEach((brk, i) => {
      const pageEnding = i + 1;
      const pageStarting = i + 2;
      const footerText = enabled ? footerForPage(pageEnding) : null;
      const headerText = enabled ? headerForPage(pageStarting) : null;
      const seam = document.createElement('div');
      if (!footerText && !headerText) {
        seam.className = 'v2-page-band v2-page-break-line';
        seam.innerHTML = '<span class="v2-page-break-label">Page ' + pageStarting + '</span>';
      } else {
        seam.className = 'v2-page-band v2-page-seam';
        if (footerText) {
          const f = document.createElement('div');
          f.className = 'v2-page-band-footer v2-hf-zone v2-hf-zone-filled';
          f.innerHTML = resolvePageNumberBadgesForPreview(footerText, pageEnding, totalPages);
          f.onclick = () => enterHeaderFooterMode('footer', (pageEnding === 1 && differentFirstPage) ? 'first' : 'default');
          seam.appendChild(f);
        }
        const divider = document.createElement('div');
        divider.className = 'v2-page-seam-divider';
        seam.appendChild(divider);
        if (headerText) {
          const h = document.createElement('div');
          h.className = 'v2-page-band-header v2-hf-zone v2-hf-zone-filled';
          h.innerHTML = resolvePageNumberBadgesForPreview(headerText, pageStarting, totalPages);
          h.onclick = () => enterHeaderFooterMode('header', 'default');
          seam.appendChild(h);
        }
      }
      paginationOverlayEl.appendChild(seam);
      seam.style.left = tiptapOffsetLeft + 'px';
      seam.style.width = tiptapWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height;
      // Écrit la feuille à chaque itération : la coupure suivante doit voir l'effet des marges déjà posées avant de mesurer sa propre position.
      const nthChild = tiptapChildren.indexOf(brk.afterEl) + 1;
      marginRules.push('#editor-container .tiptap > *:nth-child(' + nthChild + ') { margin-bottom: ' + (seamHeight + brk.remainingPx) + 'px; }');
      ensurePaginationMarginStyle().textContent = marginRules.join('\n');
      const afterRect = brk.afterEl.getBoundingClientRect();
      seam.style.top = (tiptapEl.offsetTop + (afterRect.bottom - tiptapRect.top) + brk.remainingPx) + 'px';
    });
  }

  return {
    setEditor, getHfMode, clampWidthForHfMaxSize,
    enterHeaderFooterMode, exitHeaderFooterMode, exitHeaderFooterModeIfActive, isEditingHeaderFooter,
    getHeaderFooterData, setHeaderFooterData, renderHfPill,
    schedulePaginationRecompute, renderPaginationOverlay,
  };
})();
