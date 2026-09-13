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

  // Zone visuellement bornée (max-height CSS) mais rien n'empêchait de taper au-delà - le surplus débordait aussi la bande réservée du PDF.
  let suppressHeightGuardOnce = false;
  function enforceZoneHeightLimit(ed, transaction) {
    if (suppressHeightGuardOnce) { suppressHeightGuardOnce = false; return; }
    if (!hfMode || !ed || !transaction || !transaction.docChanged) return;
    // Ne bloque que les transactions qui agrandissent le document - suppression/mise en forme restent toujours autorisées.
    if (transaction.before.content.size >= transaction.doc.content.size) return;
    const dom = ed.view.dom;
    if (dom.scrollHeight <= dom.clientHeight + 1) return;
    // commands.undo() rejoue tout le groupe d'historique proche (sur-corrige) - annule précisément cette transaction via l'inverse de ses steps.
    const invertTr = ed.state.tr;
    for (let i = transaction.steps.length - 1; i >= 0; i--) {
      invertTr.step(transaction.steps[i].invert(transaction.docs[i]));
    }
    invertTr.setMeta('addToHistory', false);
    ed.view.dispatch(invertTr);
  }

  // Édition en-tête/pied de page : un seul éditeur, on y charge le fragment voulu après avoir sauvegardé ce qu'on quitte (brouillon, ou snapshot du document
  // principal à la toute première entrée).
  function enterHeaderFooterMode(zone, variant) {
    if (!editor) return;
    if (hfMode) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    else mainDocSnapshot = editor.getHTML();
    headerFooterDraft.enabled = true;
    hfMode = { zone, variant };
    suppressHeightGuardOnce = true;
    editor.commands.setContent(headerFooterDraft[zone][variant] || '');
    const container = document.getElementById('editor-container');
    if (container) container.classList.add('hf-editing');
    MainToolbar.syncToolbarState();
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
    MainToolbar.syncToolbarState();
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
  // Doit matcher PAGE_MARGIN_PT dans js/pdf-export.js - utilisé uniquement pour empêcher une image en calque de sortir de la page physique (cf.
  // computePageGridPosition), pas pour un calcul de mise en page.
  const PAGE_MARGIN_PT = 28;
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
  // Géométrie de page courante (en-tête/pied activés + bande RÉSERVÉE toujours pleine hauteur, HF_MAX_IMAGE_HEIGHT_PX - même plafond que
  // pdf-export.js:HF_MAX_ZONE_HEIGHT_PT, jamais la hauteur RENDUE du contenu actuel : pdf-export.js réserve TOUJOURS cette bande fixe dès qu'une zone a du
  // contenu, quelle que soit sa hauteur réelle, souvent bien moins que le plafond - un en-tête d'une seule ligne, par ex. Mesurer la hauteur réelle ici
  // sous-estimait l'espace réservé côté éditeur, décalant tout le corps - et donc la position de toute image en calque - par rapport à l'export dès que le
  // contenu était plus court que le plafond, bug réel signalé par l'utilisateur). Partagée par renderPaginationOverlay ET computePageGridPosition : les
  // deux doivent voir EXACTEMENT la même page pour qu'une position capturée dans l'un vaille pour l'autre.
  function currentPageGeometry() {
    const enabled = !!headerFooterDraft.enabled;
    const differentFirstPage = enabled && !!headerFooterDraft.differentFirstPage;
    const headerHtml = enabled ? headerFooterDraft.header.default : null;
    const headerFirstHtml = differentFirstPage ? headerFooterDraft.header.first : null;
    const footerHtml = enabled ? headerFooterDraft.footer.default : null;
    const footerFirstHtml = differentFirstPage ? headerFooterDraft.footer.first : null;
    // measureHtmlHeightPx ne sert plus qu'à détecter "zone vraiment vide" (même logique que pdf-export.js:resolveZone) - sa valeur de hauteur elle-même
    // n'est plus utilisée pour dimensionner la réserve.
    const headerHasContent = enabled && (measureHtmlHeightPx(headerHtml) > 0 || measureHtmlHeightPx(headerFirstHtml) > 0);
    const footerHasContent = enabled && (measureHtmlHeightPx(footerHtml) > 0 || measureHtmlHeightPx(footerFirstHtml) > 0);
    const headerHeightPx = headerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    const footerHeightPx = footerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const pageContentHeightPx = Math.max(50, A4_PAGE_HEIGHT_PX - 2 * A4_BASE_MARGIN_PX - topExtraPx - bottomExtraPx);
    return { enabled, differentFirstPage, headerForPage: n => (n === 1 && differentFirstPage) ? headerFirstHtml : headerHtml, footerForPage: n => (n === 1 && differentFirstPage) ? footerFirstHtml : footerHtml, topExtraPx, bottomExtraPx, pageContentHeightPx };
  }

  // Ancêtre direct de .tiptap contenant `el` (computePageBreaks ne regarde jamais plus profond qu'un enfant direct - une zone 2-colonnes/un tableau compte
  // comme UN bloc). Sert à situer un élément nested (image dans une colonne/cellule) parmi les coupures de page.
  function topLevelAncestorIn(tiptapEl, el) {
    let cur = el;
    while (cur && cur.parentElement !== tiptapEl) cur = cur.parentElement;
    return cur;
  }

  // Position d'un élément RÉELLEMENT RENDU sur la grille de page (index de page + décalage en pt depuis le coin haut-gauche IMPRIMABLE de cette page) -
  // lue directement sur le DOM déjà mis en page (breaks + marges de coupure déjà appliquées), jamais reconstruite : c'est exactement cette garantie qui
  // permet à pdf-export.js de placer l'image au même endroit sans avoir à deviner un contexte ou chercher une ancre textuelle. `null` si l'Aperçu A4 n'est
  // pas actif (pagination non significative dans ce cas, cf. renderPaginationOverlay) ou si `el` n'est pas dans .tiptap. EFFET DE BORD : repositionne `el`
  // (style.left/top) si la mesure le place au-delà du bord physique de la page - voir le commentaire plus bas, juste avant le `return`.
  function computePageGridPosition(el) {
    const container = document.getElementById('editor-container');
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!container || !tiptapEl || !el || !container.classList.contains('a4-preview')) return null;
    const topLevelEl = topLevelAncestorIn(tiptapEl, el);
    if (!topLevelEl) return null;
    // Resynchronise D'ABORD les marges de coupure réelles (renderPaginationOverlay les efface puis les repose à jour) : sans ça, une règle de marge
    // laissée par un calcul PRÉCÉDENT (contenu ou en-tête/pied différents à ce moment-là) gonfle la hauteur mesurée d'un bloc au hasard et fait déclencher
    // des coupures bien trop tôt - confirmé (pageIndex aberrant, ~= l'index brut de l'élément) avant ce correctif.
    renderPaginationOverlay();
    const { pageContentHeightPx } = currentPageGeometry();
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const children = Array.from(tiptapEl.children);
    const elIdx = children.indexOf(topLevelEl);
    let pageIndex = 0;
    let lastBreak = null;
    for (const brk of breaks) {
      if (elIdx > children.indexOf(brk.afterEl)) { pageIndex++; lastBreak = brk; } else break;
    }
    const tiptapRect = tiptapEl.getBoundingClientRect();
    const cs = getComputedStyle(tiptapEl);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    let pageStartTop, pageStartLeft = tiptapRect.left + padLeft;
    if (!lastBreak) {
      pageStartTop = tiptapRect.top + padTop;
    } else {
      // Le margin-bottom de coupure est déjà appliqué au DOM réel (ensurePaginationMarginStyle) : le prochain frère direct est donc déjà poussé à la
      // position exacte du début de page suivante - pas besoin de reconstruire la hauteur de la bande de coupure elle-même.
      const nextSibling = lastBreak.afterEl.nextElementSibling;
      pageStartTop = nextSibling ? nextSibling.getBoundingClientRect().top : lastBreak.afterEl.getBoundingClientRect().bottom;
    }
    const elRect = el.getBoundingClientRect();
    const rawLeftPt = (elRect.left - pageStartLeft) / PT_TO_PX;
    const rawTopPt = (elRect.top - pageStartTop) / PT_TO_PX;
    // Une image en calque glissée au-dessus/à gauche du bord PHYSIQUE de la page (pas seulement dans la marge - au-delà, -PAGE_MARGIN_PT) donnerait un point
    // de grille qui, une fois exporté (PAGE_MARGIN_PT + pageTopPt/pageLeftPt), tombe à une coordonnée PDF négative : invisible/coupée dans le PDF alors que
    // le navigateur, lui, continue de l'afficher en entier (ni `.tiptap` ni `.v2-page-sheet` ne la découpe visuellement) - l'éditeur mentait sur ce qui sera
    // réellement imprimable (repéré par l'utilisateur : image "tout en haut de l'éditeur" ressortant rognée au PDF). Corrigé en repoussant l'élément dans le
    // DOM RÉEL (pas seulement la valeur retournée) jusqu'au bord physique dès qu'on le détecte ici - le seul point de passage commun aux 3 sites d'appel
    // (setLayer/alignOrSnap/glisser), qui lisent tous ensuite `el.offsetLeft`/`offsetTop` pour connaître le left/top brut à enregistrer, donc restent
    // automatiquement cohérents avec cette correction sans avoir à la dupliquer.
    const minPt = -PAGE_MARGIN_PT;
    const clampDeltaLeftPt = rawLeftPt < minPt ? minPt - rawLeftPt : 0;
    const clampDeltaTopPt = rawTopPt < minPt ? minPt - rawTopPt : 0;
    if (clampDeltaLeftPt || clampDeltaTopPt) {
      const curLeftPx = parseFloat(el.style.left) || 0;
      const curTopPx = parseFloat(el.style.top) || 0;
      el.style.left = (curLeftPx + clampDeltaLeftPt * PT_TO_PX) + 'px';
      el.style.top = (curTopPx + clampDeltaTopPt * PT_TO_PX) + 'px';
    }
    return {
      pageIndex,
      pageLeftPt: rawLeftPt + clampDeltaLeftPt,
      pageTopPt: rawTopPt + clampDeltaTopPt,
    };
  }

  // Migration silencieuse : une image en calque positionnée AVANT l'introduction de la grille page (data-page-index/left/top-pt) n'a que left/top (relatifs
  // à son offsetParent au moment du calque/glisser) - pdf-export.js doit alors reconstruire sa position via l'ancien système d'ancrage textuel, qui suppose
  // à tort que left/top représentent une distance LOCALE au paragraphe hôte. C'est FAUX dès que l'image a été glissée ailleurs (l'usage normal d'un calque
  // "flottant") : position:absolute ignore totalement le flux du document, left/top n'ont alors plus aucun rapport avec "où est le paragraphe hôte" - d'où
  // des résultats aberrants (confirmé : une image glissée loin de son paragraphe pouvait ressortir collée en haut de page). Rattrapée ici en capturant la
  // grille page de toute image déjà en calque dès qu'un document est chargé (Aperçu A4 actif) - aucune action de l'utilisateur nécessaire, un ancien
  // document se met à niveau tout seul à la prochaine ouverture.
  function migrateLegacyImagePositions() {
    if (!editor || !document.getElementById('editor-container').classList.contains('a4-preview')) return;
    const toPatch = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'editorImage' && node.attrs.layer !== 'normal' && node.attrs.pageIndex == null && node.attrs.left != null) {
        toPatch.push(pos);
      }
    });
    toPatch.forEach(pos => {
      const dom = editor.view.nodeDOM(pos);
      if (!dom) return;
      const grid = computePageGridPosition(dom);
      if (!grid) return;
      const current = editor.state.doc.nodeAt(pos);
      if (current) EditorCore.patchNodeAndReselect(editor, pos, Object.assign({}, current.attrs, grid));
    });
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

    const { enabled, differentFirstPage, headerForPage, footerForPage, topExtraPx, bottomExtraPx, pageContentHeightPx } = currentPageGeometry();
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
    setEditor, getHfMode, clampWidthForHfMaxSize, enforceZoneHeightLimit,
    enterHeaderFooterMode, exitHeaderFooterMode, exitHeaderFooterModeIfActive, isEditingHeaderFooter,
    getHeaderFooterData, setHeaderFooterData, renderHfPill,
    schedulePaginationRecompute, renderPaginationOverlay, computePageGridPosition, migrateLegacyImagePositions,
  };
})();
