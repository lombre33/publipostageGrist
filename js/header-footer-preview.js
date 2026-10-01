// Édition en-tête/pied de page + aperçu de pagination - extrait de editor.js (découpage 2026). Un seul éditeur TipTap : le contenu affiché est échangé via
// editor.commands.setContent() entre le document principal et le fragment en-tête/pied en cours d'édition (cf. enterHeaderFooterMode/exitHeaderFooterMode).
const HeaderFooterPreview = (function () {
  let editor = null;
  function setEditor(ed) { editor = ed; watchPaginationGeometry(); }

  // Posé par js/main.js (comme MainToolbar.setEmailMode) quand le modèle courant est un modèle email : un en-tête/pied de page n'a aucun sens dans un
  // mailto: (texte brut, pas de pages, cf. js/mailto-export.js) - retour d'Antoine 2026-09-19. Bloque enterHeaderFooterMode (seul point d'entrée, cf. les
  // 3 sites qui l'appellent plus bas) plutôt que de masquer les zones de marge : elles restent visibles mais inertes et grisées (classe v2-hf-locked,
  // même vocabulaire que le verrouillage de la toolbar principale), même règle "jamais disparaître" que le reste de la toolbar en mode email.
  let inEmailMode = false;
  function setEmailMode(active) { inEmailMode = !!active; }

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
    if (!editor || inEmailMode) return;
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

  // Fragment d'en-tête/pied qui montre quelque chose : du texte (le numéro de page, une variable, une puce intelligente en portent un) ou une image. Même règle
  // que updateHfZone, currentPageGeometry et pdf-export.js:resolveZone - ce que l'écran et l'export ignorent est aussi ce qu'on ne garde pas.
  function hasZoneContent(html) {
    return !!html && (!!html.replace(/<[^>]*>/g, '').trim() || /<img[\s>]/i.test(html));
  }
  // Un en-tête ou un pied de page sans contenu n'existe pas : un clic dans la marge puis « Terminer » sans rien écrire (ou après avoir tout effacé) ne doit rien
  // laisser « activé ». Un fragment vide (« <p></p> », ce que l'éditeur rend d'un fragment sans texte) devient une chaîne vide - en Lecture, il ouvrait sinon une bande
  // blanche de 26 px au-dessus ou au-dessous de la feuille - et sans aucun contenu dans les deux zones, ni en-tête ni pied ne reste activé, ni la première page
  // différente. Ne touche jamais à un fragment qui a du contenu, ni à une variante « première page » qui n'est pas utilisée (case décochée).
  function dropEmptyZones(data) {
    const zones = ['header', 'footer'];
    const variants = ['default', 'first'];
    zones.forEach(zone => variants.forEach(variant => { if (!hasZoneContent(data[zone][variant])) data[zone][variant] = ''; }));
    const used = data.differentFirstPage ? variants : ['default'];
    if (!zones.some(zone => used.some(variant => data[zone][variant]))) { data.enabled = false; data.differentFirstPage = false; }
  }

  function exitHeaderFooterMode() {
    if (!hfMode || !editor) return;
    headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    dropEmptyZones(headerFooterDraft);
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
    // Un modèle enregistré avant ce nettoyage peut déjà porter un en-tête « activé » sans rien dedans (clic dans la marge puis « Terminer ») : remis à plat à
    // l'ouverture, il est enregistré ainsi à la prochaine sauvegarde.
    dropEmptyZones(headerFooterDraft);
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

  // Constante dupliquée depuis pdf-export.js (1pt = 96/72px) : pas de module partagé entre les deux fichiers. La hauteur de page, elle, vient de PageLayout
  // à chaque appel (841.89pt en portrait, 595.28pt en paysage) : elle change à chaud avec l'orientation du modèle.
  const PT_TO_PX = 96 / 72;
  // Marges de page RÉELLES du modèle courant (js/page-layout.js) - lues à chaque appel, jamais figées en constante : elles changent à chaud depuis
  // l'onglet Réglages. Avant ce correctif, 37.33px (= 28pt) et 719.04px étaient codés en dur ici, si bien que la pagination affichée à l'écran (bandes
  // de couture, "Saut de page") et la grille de page qui ancre les images en calque ignoraient PUREMENT ET SIMPLEMENT les marges du modèle : un modèle
  // à 30mm de marge haute affichait encore la découpe d'un modèle à 9.9mm, et l'export PDF/DOCX plaçait l'image sur une autre page que l'éditeur.
  function marginsPx() { return PageLayout.getMarginsPx(); }
  const HEADER_FOOTER_GAP_PX = 10 * PT_TO_PX; // même écart que HEADER_FOOTER_GAP_PT, pdf-export.js

  // Facteur `zoom` effectif de la feuille (ajustement automatique à la largeur disponible, cf. js/main.js:applyPageFitZoom). Indispensable pour toute
  // mesure faite avec getBoundingClientRect() DANS la feuille : ces rectangles sont en pixels ÉCRAN, donc déjà multipliés par le zoom, alors que
  // pageContentHeightPx, offsetTop/offsetLeft et les styles inline posés sur les bandes sont tous en pixels de MISE EN PAGE. Sans cette division, toutes
  // les coupures de page tombent au mauvais endroit dès que la feuille est réduite. Repli sur 1 : navigateur sans `zoom`, feuille absente, ou Aperçu A4
  // décoché - trois cas où la feuille n'est de toute façon pas réduite.
  function layoutZoom(el) {
    const sheet = el && el.closest ? el.closest('.v2-page-sheet, .reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }

  // Blocs que l'export coupe en cours de route (pdfmake, au pixel : entre deux lignes d'une colonne, deux lignes d'un tableau, deux éléments d'une liste) mais que
  // l'aperçu, qui ne peut pas couper le DOM d'une zone 2 colonnes ou d'un tableau, doit traiter d'une pièce. Un bloc de texte conditionnel en fait partie : son cadre
  // n'existe que dans l'éditeur, à l'export son texte coule d'une page à l'autre comme n'importe quel paragraphe.
  function isSplittableByExport(el) {
    return el.classList.contains('two-columns-zone-outer') || el.classList.contains('tableWrapper') || el.classList.contains('conditional-text') || el.tagName === 'TABLE' || el.tagName === 'UL' || el.tagName === 'OL';
  }
  // Paragraphe sans texte ni objet (un <br> décoratif ne compte pas) : la ligne vide que l'éditeur ajoute derrière un bloc (zone, tableau, image) pour pouvoir y
  // poser le curseur.
  function isBlankParagraph(el) {
    return el.tagName === 'P' && !el.textContent.trim() && !el.querySelector(':scope > :not(br)');
  }

  // Accumule la hauteur des blocs de haut niveau de .tiptap, respecte .page-break-marker comme coupure forcée. Grain du bloc (jamais coupé en deux), pas du
  // pixel comme pdfmake. Retourne le bloc après lequel insérer la coupure (afterEl), pour poser un margin-bottom réel dessus.
  // Deux exceptions à « un bloc qui ne tient pas passe entier à la page suivante », pour ne pas afficher une coupure que l'export (qui coupe au pixel) ni le mode
  // Lecture (dont les valeurs sont plus courtes que les noms de variables affichés ici) n'ont :
  //  - un bloc que l'export coupe (isSplittableByExport) reste sur la page où sa plus grande partie tient, et le repère tombe derrière lui. Le déplacer en
  //    entier revient à se tromper de tout ce qui tenait dans la page (deux images en haut d'une lettre, une zone 2 colonnes de ~940 px pour ~910 px de place :
  //    « Page 2 » juste sous les images, page 1 vide) au lieu de se tromper de ce qui déborde (~30 px) ;
  //  - le paragraphe vide qui termine le document (celui que l'éditeur ajoute derrière ce bloc) ne compte pas : seul, il ouvrait une page vide.
  // Un tableau de premier niveau est l'exception de la première : il se coupe ENTRE deux lignes (js/table-page-cut.js), comme le PDF (dontBreakRows) et le Word (cantSplit) qui
  // ne coupent plus une ligne en deux. Les lignes qui ne tiennent pas ouvrent la page suivante ; la coupure porte alors `rowIndex` (rang de la première ligne de la page qui
  // commence) et `afterEl` est l'enveloppe du tableau. Un tableau qu'on ne sait pas couper ainsi (ligne plus haute que la page, cases fusionnées sur plusieurs lignes, grille...)
  // garde la règle des blocs que l'export coupe.
  function cuttableTable(el, pageContentHeightPx, zoom) {
    if (!el.classList.contains('tableWrapper')) return null;
    const table = el.querySelector(':scope > table');
    return table ? TablePageCut.measure(el, table, zoom, pageContentHeightPx, row => appliedRowPad.get(row)) : null;
  }
  function computePageBreaks(tiptapEl, pageContentHeightPx) {
    const breaks = [];
    const zoom = layoutZoom(tiptapEl);
    let consumed = 0;
    let lastBlock = null;
    const children = Array.from(tiptapEl.children);
    children.forEach((child, index) => {
      const height = child.getBoundingClientRect().height / zoom;
      if (child.classList.contains('page-break-marker')) {
        breaks.push({ afterEl: child, forced: true, remainingPx: Math.max(0, pageContentHeightPx - consumed) });
        consumed = 0;
        lastBlock = child;
        return;
      }
      if (index === children.length - 1 && isBlankParagraph(child)) return;
      const cuttable = cuttableTable(child, pageContentHeightPx, zoom);
      if (cuttable) {
        const tablePlan = TablePageCut.plan(consumed, cuttable.segs, pageContentHeightPx);
        if (tablePlan.blockBreakBefore) breaks.push({ afterEl: lastBlock, forced: false, remainingPx: 0 });
        tablePlan.cuts.forEach(rowIndex => breaks.push({ afterEl: child, rowIndex, forced: false, remainingPx: 0 }));
        consumed = tablePlan.consumedAfter;
        lastBlock = child;
        return;
      }
      const room = pageContentHeightPx - consumed;
      const staysOnPage = isSplittableByExport(child) && room > height / 2;
      if (consumed > 0 && height > room && !staysOnPage) {
        breaks.push({ afterEl: lastBlock, forced: false, remainingPx: 0 });
        consumed = height;
      } else {
        consumed += height;
      }
      lastBlock = child;
    });
    return breaks;
  }

  let paginationOverlayEl = null;
  let paginationEdgeTopEl = null;
  let paginationEdgeBottomEl = null;
  // Couche des copies de « Sur toutes les pages » : premier enfant de la feuille, sous `.tiptap` (cf. paintRepeatedCopies).
  let paginationCopiesEl = null;
  // Les pages de la dernière pagination (haut de la feuille, haut du corps, en pixels de mise en page dans le repère du conteneur) et le haut de `.tiptap` dans ce même repère :
  // ce que lit reconcileLayerImagesWithGrid.
  let lastPageLayout = null;
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
  // Ligne de tableau -> hauteur ajoutée à son rembourrage haut pour la descendre sous une couture (règle de la feuille ci-dessus). Remise à zéro avec la feuille : une
  // mesure faite pendant qu'une règle est posée (computePageGridPosition) retranche ce que la règle a ajouté, une mesure faite feuille vide n'a rien à retrancher.
  let appliedRowPad = new WeakMap();
  function clearPageBreakMargins() {
    if (paginationMarginStyleEl) paginationMarginStyleEl.textContent = '';
    appliedRowPad = new WeakMap();
  }
  function schedulePaginationRecompute() {
    if (paginationRecomputeTimer) clearTimeout(paginationRecomputeTimer);
    paginationRecomputeTimer = setTimeout(renderPaginationOverlay, 200);
  }
  // La couture suit la GÉOMÉTRIE du contenu, pas seulement les frappes : onUpdate (js/editor.js) ne rappelle schedulePaginationRecompute que quand le document change, or le
  // contenu change de taille sans transaction - une police qui finit de se charger, une image qui arrive, une bulle de variable qui devient valide ou cassée une fois le schéma
  // Grist relu, la largeur de la feuille. La bande restait alors à la place calculée avant, au milieu d'un tableau devenu plus haut (signalé par Antoine, 01/10 : « un tableau ne se
  // coupe pas au moment du saut de page », la bande recouvrait trois lignes du tableau). `renderedSize` est la taille du contenu une fois les marges de coupure posées : un
  // changement de taille que renderPaginationOverlay vient de causer lui-même n'est pas une nouvelle raison de recalculer. Au plus 8 recalculs de suite en 3 s, au cas où une
  // mise en page ne se stabiliserait pas.
  let paginationObserver = null;
  let renderedSize = '';
  let observedRecomputes = 0;
  let observedRecomputesTimer = null;
  function watchPaginationGeometry() {
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!tiptapEl || paginationObserver || typeof ResizeObserver !== 'function') return;
    const recomputeIfResized = () => {
      const container = document.getElementById('editor-container');
      if (hfMode || !container || !container.classList.contains('a4-preview')) return;
      if (tiptapEl.offsetWidth + 'x' + tiptapEl.offsetHeight === renderedSize || observedRecomputes >= 8) return;
      observedRecomputes++;
      clearTimeout(observedRecomputesTimer);
      observedRecomputesTimer = setTimeout(() => { observedRecomputes = 0; }, 3000);
      schedulePaginationRecompute();
    };
    paginationObserver = new ResizeObserver(recomputeIfResized);
    paginationObserver.observe(tiptapEl);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', recomputeIfResized);
  }
  function clearPaginationOverlay() {
    if (paginationOverlayEl) paginationOverlayEl.innerHTML = '';
    if (paginationEdgeTopEl && paginationEdgeTopEl.parentNode) paginationEdgeTopEl.parentNode.removeChild(paginationEdgeTopEl);
    if (paginationEdgeBottomEl && paginationEdgeBottomEl.parentNode) paginationEdgeBottomEl.parentNode.removeChild(paginationEdgeBottomEl);
    if (paginationCopiesEl && paginationCopiesEl.parentNode) paginationCopiesEl.parentNode.removeChild(paginationCopiesEl);
    paginationEdgeTopEl = null; paginationEdgeBottomEl = null; paginationCopiesEl = null;
    lastPageLayout = null;
    hoveredZoneEl = null;
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
  // Bande cliquable d'une zone VIDE : le libellé « + Ajouter un en-tête » et un peu d'air autour. Rien n'étant imprimé, elle se pose DANS la marge, à son bord extérieur ;
  // le reste de la marge garde son rôle de page (cliquer juste sous la dernière ligne place le curseur à la fin du texte, comme avant, au lieu d'ouvrir le pied).
  const HF_EMPTY_STRIP_PX = 24;
  // Air sous le contenu d'une zone remplie : le bas de la bande cliquable.
  const HF_FILLED_PAD_PX = 8;
  // La boîte d'une zone est sa bande cliquable (celle que le survol teinte, celle d'un clic), pas toute la marge : pour le haut, de la feuille jusque sous le contenu ;
  // pour le bas, du dessous du texte jusque sous le contenu. Les marges de la boîte rendent à la page ce que le PDF y réserve : `bandPx`, la bande que le PDF place sous
  // la marge du haut ou au-dessus de la marge du bas (0 quand aucune des deux variantes n'a de contenu), plus rien. La marge de `.tiptap` de ce côté garde son
  // padding (c'est lui qui porte les positions des images en calque). Le contenu de l'en-tête commence à la moitié de la marge du haut du bord de la feuille, celui
  // du pied juste sous le texte : là où le PDF les peint.
  function sizeHfZone(el, zone, hasContent, bandPx) {
    const mPx = marginsPx();
    const marginPx = zone === 'header' ? mPx.top : mPx.bottom;
    const band = bandPx || 0;
    let height;
    if (hasContent) {
      // Hauteur mesurée (en pixels de mise en page, hors zoom) : le contenu, sous la moitié de la marge pour l'en-tête, plus l'air du bas.
      el.style.height = 'auto';
      el.style.paddingTop = zone === 'header' ? (marginPx / 2) + 'px' : '0';
      el.style.paddingBottom = HF_FILLED_PAD_PX + 'px';
      height = el.offsetHeight;
    } else {
      height = Math.min(HF_EMPTY_STRIP_PX, marginPx + band);
      // Libellé au milieu de la bande (une ligne de texte fait 1,42 x 10,5 px).
      el.style.paddingTop = Math.max(0, (height - 15) / 2) + 'px';
      el.style.paddingBottom = '0';
    }
    el.style.height = height + 'px';
    if (zone === 'header') {
      // Avant `.tiptap`, collée au bord de la feuille : elle ne pèse dans la page que par la bande.
      el.style.marginTop = '0';
      el.style.marginBottom = (band - height) + 'px';
    } else {
      // Après `.tiptap`, dont le padding de bas de page (la marge) commence sous le texte. Remplie, ou quand une bande est réservée, la boîte démarre sous le texte ;
      // vide et sans bande, elle se pose au bord de la feuille, et la marge au-dessus d'elle reste de la page.
      const offsetBelowText = (hasContent || band) ? 0 : marginPx - height;
      el.style.marginTop = (offsetBelowText - marginPx) + 'px';
      el.style.marginBottom = (band - (offsetBelowText - marginPx) - height) + 'px';
    }
  }
  function updateHfZone(el, html, pageNum, totalPages, zone, variant, ghostLabel, bandPx) {
    const resolved = html ? PageLayout.resolvePageNumberBadges(html, pageNum, totalPages) : '';
    // Teste aussi <img : sinon une zone ne contenant qu'une image (pas de texte) serait traitée à tort comme vide (même correctif que resolveZone,
    // pdf-export.js).
    const hasContent = hasZoneContent(resolved);
    el.classList.toggle('v2-hf-zone-empty', !hasContent);
    el.classList.toggle('v2-hf-zone-filled', hasContent);
    el.classList.toggle('v2-hf-locked', inEmailMode);
    el.innerHTML = hasContent
      ? '<div class="v2-hf-zone-body">' + resolved + '</div><span class="v2-hf-zone-pencil" aria-hidden="true"></span>'
      : '<span class="v2-hf-zone-ghost"><span aria-hidden="true">+</span> ' + ghostLabel + '</span>';
    sizeHfZone(el, zone, hasContent, bandPx);
    // Une image d'en-tête qui finit de se charger agrandit la boîte : les marges suivent, sinon le corps de la page glisserait de la différence.
    el.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', () => { if (el.isConnected) sizeHfZone(el, zone, hasContent, bandPx); }, { once: true });
    });
    el.onclick = () => enterHeaderFooterMode(zone, variant);
  }
  // Les espaceurs ne prennent jamais le clic (`pointer-events: none`, css/editor-v2.css) : ils recouvrent la marge de `.tiptap`, et une image en calque posée dans
  // cette marge - le triangle d'un coin de feuille - doit rester atteignable. C'est donc ici qu'on retrouve la zone sous le curseur. Ne compte qu'un clic tombé sur le
  // padding de `.tiptap` ou sur le fond de la feuille : une image, une ligne de texte ou une poignée gardent leur propre clic.
  function zoneUnderPointer(event) {
    // Bouton principal seulement : le menu contextuel d'un clic droit dans la marge n'ouvre rien.
    if (hfMode || inEmailMode || !editor || !editor.view || event.button) return null;
    const tiptapEl = editor.view.dom;
    if (event.target !== tiptapEl && event.target !== tiptapEl.parentElement) return null;
    for (const el of [paginationEdgeTopEl, paginationEdgeBottomEl]) {
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom) return el;
    }
    return null;
  }
  // Survol : l'espaceur ne le reçoit pas non plus, la classe tient lieu de :hover (mêmes règles, css/editor-v2.css).
  let hoveredZoneEl = null;
  function setHoveredZone(el) {
    if (hoveredZoneEl === el) return;
    if (hoveredZoneEl) hoveredZoneEl.classList.remove('v2-hf-zone-hover');
    hoveredZoneEl = el;
    if (el) el.classList.add('v2-hf-zone-hover');
    // Le curseur main que la zone donnait d'elle-même : posé sur la feuille (jamais sur `.tiptap`, dont ProseMirror garde les attributs).
    const sheet = editor && editor.view && editor.view.dom.parentElement;
    if (sheet) sheet.classList.toggle('v2-hf-zone-pointing', !!el);
  }
  let marginZonesWired = false;
  function wireMarginZones(container) {
    if (marginZonesWired) return;
    marginZonesWired = true;
    // En capture : le clic est pris avant ProseMirror, qui poserait sinon le curseur au début du document avant d'ouvrir la zone.
    container.addEventListener('mousedown', event => { if (zoneUnderPointer(event)) { event.preventDefault(); event.stopPropagation(); } }, true);
    container.addEventListener('click', event => {
      const el = zoneUnderPointer(event);
      if (!el) return;
      event.preventDefault(); event.stopPropagation();
      el.onclick();
    }, true);
    // Bouton enfoncé : on glisse une image ou on sélectionne du texte, la marge ne doit pas s'allumer au passage.
    // L'invitation « + Ajouter un en-tête » est la seule partie d'un espaceur à recevoir la souris : tant que le curseur est dessus, sa zone reste allumée.
    container.addEventListener('mousemove', event => {
      const own = event.target.closest && event.target.closest('.v2-page-edge-spacer');
      setHoveredZone(event.buttons ? null : (own || zoneUnderPointer(event)));
    });
    container.addEventListener('mouseleave', () => setHoveredZone(null));
  }
  // Le libellé des zones fantômes est écrit par renderPaginationOverlay : sans ce crochet, un changement de langue dans Réglages ne le corrigerait qu'à la
  // prochaine frappe.
  I18n.onChange(() => { if (editor) renderPaginationOverlay(); });
  // Repère de la couche de pagination (coutures, copies) : des pixels de mise en page depuis le coin du contenu défilant du conteneur, zoom de la feuille compris. `x` et `y` y
  // amènent un point de l'écran, `screenY` en revient : toutes les positions de page se lisent sur des rectangles, jamais sur offsetTop (arrondi à l'entier).
  function layerCoords(container, zoom) {
    const r = container.getBoundingClientRect();
    return {
      x: v => (v - r.left - container.clientLeft + container.scrollLeft) / zoom,
      y: v => (v - r.top - container.clientTop + container.scrollTop) / zoom,
      screenY: v => v * zoom + r.top + container.clientTop - container.scrollTop,
    };
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
    // Même test que pdf-export.js:resolveZone (du texte ou une image) sur les deux variantes : la hauteur rendue du contenu ne compte pas, seule sa présence.
    const headerHasContent = enabled && (hasZoneContent(headerHtml) || hasZoneContent(headerFirstHtml));
    const footerHasContent = enabled && (hasZoneContent(footerHtml) || hasZoneContent(footerFirstHtml));
    const headerHeightPx = headerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    const footerHeightPx = footerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    // Les bandes que le PDF réserve sous la marge du haut et au-dessus de la marge du bas : sur TOUTES les pages dès qu'une variante a du contenu, rien sinon.
    const topExtraPx = headerHeightPx ? headerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + HEADER_FOOTER_GAP_PX : 0;
    const mPx = marginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - mPx.top - mPx.bottom - topExtraPx - bottomExtraPx);
    return { enabled, differentFirstPage, headerForPage: n => (n === 1 && differentFirstPage) ? headerFirstHtml : headerHtml, footerForPage: n => (n === 1 && differentFirstPage) ? footerFirstHtml : footerHtml, pageContentHeightPx, topBandPx: topExtraPx, bottomBandPx: bottomExtraPx };
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
    // Éditeur masqué (Lecture, résumé d'un macro-modèle : display:none) : aucune mise en page, tous les rectangles valent 0 et la mesure ne dit que « coin de la
    // page » (-marge/-marge). Pas de position plutôt qu'une fausse.
    if (!tiptapEl.getClientRects().length) return null;
    const topLevelEl = topLevelAncestorIn(tiptapEl, el);
    if (!topLevelEl) return null;
    // Resynchronise D'ABORD les marges de coupure réelles (renderPaginationOverlay les efface puis les repose à jour) : sans ça, une règle de marge
    // laissée par un calcul PRÉCÉDENT (contenu ou en-tête/pied différents à ce moment-là) gonfle la hauteur mesurée d'un bloc au hasard et fait déclencher
    // des coupures bien trop tôt - confirmé (pageIndex aberrant, ~= l'index brut de l'élément) avant ce correctif.
    renderPaginationOverlay();
    const { pageContentHeightPx, topBandPx } = currentPageGeometry();
    const tiptapRect = tiptapEl.getBoundingClientRect();
    const cs = getComputedStyle(tiptapEl);
    // Les rectangles sont en pixels écran, le remplissage lu par getComputedStyle en pixels de mise en page : à ~700 px la feuille est réduite (zoom CSS), et
    // l'origine de la grille se décalait de remplissage x (1 - zoom), soit ~6 px pour une marge de 28 pt à 0,85 : l'image tirée au coin s'arrêtait en retrait.
    const gridZoom = layoutZoom(tiptapEl);
    const padTop = (parseFloat(cs.paddingTop) || 0) * gridZoom;
    const padLeft = (parseFloat(cs.paddingLeft) || 0) * gridZoom;
    const pageStartLeft = tiptapRect.left + padLeft;
    const elRect = el.getBoundingClientRect();
    let pageIndex = 0;
    let pageStartTop = tiptapRect.top + padTop;
    if (lastPageLayout && lastPageLayout.pages.length) {
      // Feuilles entières : la page d'une image est celle où se trouve son bord haut, pas celle du paragraphe qui la porte. Tirée de la page 1 sur la page 2, l'image garde son
      // paragraphe sur la page 1 : sa grille disait alors « page 1, 847 pt », une position hors de la feuille que le PDF ne dessine pas. Les feuilles ont maintenant une place
      // fixe (page k = k hauteurs de feuille plus les gouttières), la grille se lit donc sur la feuille où l'image est posée. Dans une gouttière (entre le bas d'une feuille et le
      // haut de la suivante) elle est de la page suivante, que la borne du haut de page, plus bas, ramène à son bord.
      const pages = lastPageLayout.pages;
      const lc = layerCoords(document.getElementById('editor-container'), gridZoom);
      const pageH = PageLayout.getPageSizePx().height;
      const y = lc.y(elRect.top);
      pageIndex = pages.findIndex(page => y < page.top + pageH);
      if (pageIndex < 0) pageIndex = pages.length - 1;
      pageStartTop = lc.screenY(pages[pageIndex].bodyTop);
    } else {
      // Pas de mise en page mesurée (édition d'en-tête ou de pied) : la page du paragraphe qui porte l'image, comme avant les feuilles entières.
      const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
      const children = Array.from(tiptapEl.children);
      const elIdx = children.indexOf(topLevelEl);
      // Un élément DANS un tableau coupé entre deux lignes : sur la page de sa ligne (rang de la ligne parmi celles du tableau, -1 s'il n'est dans aucune).
      const rowRankIn = (wrapper) => {
        const rows = TablePageCut.rowsOf(wrapper.querySelector(':scope > table'));
        let row = el.closest('tr');
        while (rows && row && rows.indexOf(row) < 0) row = row.parentElement && row.parentElement.closest('tr');
        return rows && row ? rows.indexOf(row) : -1;
      };
      let lastBreak = null;
      for (const brk of breaks) {
        const afterIdx = children.indexOf(brk.afterEl);
        if (elIdx > afterIdx || (brk.rowIndex != null && elIdx === afterIdx && rowRankIn(brk.afterEl) >= brk.rowIndex)) { pageIndex++; lastBreak = brk; } else break;
      }
      if (lastBreak && lastBreak.rowIndex != null) {
        // La page commence à la ligne qui l'ouvre, sous la couture : le haut de la ligne plus ce que la règle de coupure lui a ajouté (computePageBreaks, mesuré feuille posée,
        // ne le compte pas ; renderPaginationOverlay vient de la poser, ou de la retirer : alors la ligne n'a rien reçu).
        const row = (TablePageCut.rowsOf(lastBreak.afterEl.querySelector(':scope > table')) || [])[lastBreak.rowIndex];
        if (row) pageStartTop = row.getBoundingClientRect().top + (appliedRowPad.get(row) || 0) * gridZoom;
      } else if (lastBreak) {
        // Le margin-bottom de coupure est déjà appliqué au DOM réel (ensurePaginationMarginStyle) : le prochain frère direct est donc déjà poussé à la
        // position exacte du début de page suivante - pas besoin de reconstruire la hauteur de la bande de coupure elle-même.
        const nextSibling = lastBreak.afterEl.nextElementSibling;
        pageStartTop = nextSibling ? nextSibling.getBoundingClientRect().top : lastBreak.afterEl.getBoundingClientRect().bottom;
      }
    }
    // Les deux termes sont des rectangles écran : leur différence est en pixels écran, à ramener en pixels de mise en page avant la conversion en points.
    const rawLeftPt = ((elRect.left - pageStartLeft) / gridZoom) / PT_TO_PX;
    const rawTopPt = ((elRect.top - pageStartTop) / gridZoom) / PT_TO_PX;
    // Une image en calque glissée au-dessus/à gauche du bord PHYSIQUE de la page (pas seulement dans la marge - au-delà de la marge de ce côté) donnerait un point
    // de grille qui, une fois exporté (marge + pageTopPt/pageLeftPt), tombe à une coordonnée PDF négative : invisible/coupée dans le PDF alors que
    // le navigateur, lui, continue de l'afficher en entier (ni `.tiptap` ni `.v2-page-sheet` ne la découpe visuellement) - l'éditeur mentait sur ce qui sera
    // réellement imprimable (repéré par l'utilisateur : image "tout en haut de l'éditeur" ressortant rognée au PDF). Corrigé en repoussant l'élément dans le
    // DOM RÉEL (pas seulement la valeur retournée) jusqu'au bord physique dès qu'on le détecte ici - le seul point de passage commun aux 3 sites d'appel
    // (setLayer/alignOrSnap/glisser), qui lisent tous ensuite `el.offsetLeft`/`offsetTop` pour connaître le left/top brut à enregistrer, donc restent
    // automatiquement cohérents avec cette correction sans avoir à la dupliquer.
    // Le bord physique de la page est à -marge du coin imprimable : avec des marges asymétriques (35mm à gauche, 30mm en haut...) les deux bornes
    // diffèrent, et toutes deux diffèrent de l'ancien -28pt codé en dur (qui rognait une image parfaitement placée sous une grande marge, et en laissait
    // sortir une sous une petite).
    const marginsPtNow = PageLayout.getMarginsPt();
    // Le bord du haut est plus loin que la marge quand un en-tête réserve sa bande (le PDF la compte dans la marge du haut de CHAQUE page) : sans elle, une image
    // tirée au coin s'arrêtait 55 pt plus bas que le bord de la feuille.
    const minLeftPt = -marginsPtNow.left;
    const minTopPt = -(marginsPtNow.top + topBandPx / PT_TO_PX);
    const clampDeltaLeftPt = rawLeftPt < minLeftPt ? minLeftPt - rawLeftPt : 0;
    const clampDeltaTopPt = rawTopPt < minTopPt ? minTopPt - rawTopPt : 0;
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
  // Un modèle chargé pendant que l'éditeur est masqué (Lecture, après un macro-modèle) n'a rien de mesurable : il garde ses images sans grille, et cette passe est
  // rejouée quand l'éditeur redevient visible (Editor.refreshLayout). Mesurée masquée, l'image recevait -marge/-marge (le coin de la page), et cette position
  // s'enregistrait à la première frappe ou au premier Enregistrer, sans jamais être recalculée (pageIndex n'est plus nul).
  // La passe n'est pas une modification de la personne : une seule transaction (setNodeMarkup, la sélection n'est pas touchée), hors historique et hors suivi des
  // modifications. Suivie, la bibliothèque en faisait une suppression + une insertion de l'image ; l'original (marqué supprimé, pageIndex toujours nul) restait candidat
  // à la passe suivante, et chaque retour de l'éditeur (Lecture puis Édition, chaque frappe dans une marge des Réglages) ajoutait une copie de plus, en suggestion en attente.
  function migrateLegacyImagePositions() {
    if (!editor || !document.getElementById('editor-container').classList.contains('a4-preview')) return;
    // En édition d'en-tête/pied, le document affiché est le fragment, pas le corps du modèle dont les images sont à migrer.
    if (hfMode || !editor.view.dom.getClientRects().length) return;
    const toPatch = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'editorImage' && node.attrs.layer !== 'normal' && node.attrs.pageIndex == null && node.attrs.left != null) {
        toPatch.push(pos);
      }
    });
    // Toutes les mesures d'abord, la transaction ensuite : elle pourrait sinon redessiner un nœud pendant qu'on mesure le suivant.
    const patches = [];
    toPatch.forEach(pos => {
      const dom = editor.view.nodeDOM(pos);
      if (!dom) return;
      const grid = computePageGridPosition(dom);
      if (!grid) return;
      const current = editor.state.doc.nodeAt(pos);
      if (current) patches.push({ pos, attrs: Object.assign({}, current.attrs, grid) });
    });
    if (!patches.length) return;
    const tr = editor.state.tr;
    patches.forEach(p => tr.setNodeMarkup(p.pos, undefined, p.attrs));
    tr.setMeta('addToHistory', false);
    TrackChanges.skipTracking(tr);
    editor.view.dispatch(tr);
  }

  // Après un changement d'orientation : la page change de hauteur, donc la page sur laquelle tombe chaque bloc, et la position de chaque image en calque
  // sur SA page. La grille page (data-page-index/left/top-pt) a été capturée dans l'ancienne géométrie et c'est elle que lisent le PDF et le Word - sans cette
  // recapture, une image sortait dans l'export sur une page que l'éditeur ne lui montre plus. Même mesure que migrateLegacyImagePositions (qui ne traite que
  // les images SANS grille), pour toutes celles qui en ont une, en UNE transaction hors historique (changer d'orientation n'est pas annulable par Annuler, la
  // recapture non plus) et sans toucher à la sélection (patchNodeAndReselect sélectionnerait chaque image tour à tour). Rend true si elle a modifié le document.
  function recaptureLayeredImageGrids() {
    if (!editor || !document.getElementById('editor-container').classList.contains('a4-preview')) return false;
    const targets = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'editorImage' && node.attrs.layer !== 'normal' && node.attrs.pageIndex != null) targets.push(pos);
    });
    if (!targets.length) return false;
    // Toutes les mesures d'abord, les transactions ensuite : chacune pourrait sinon redessiner un nœud pendant qu'on mesure le suivant.
    const patches = [];
    targets.forEach(pos => {
      const dom = editor.view.nodeDOM(pos);
      const current = editor.state.doc.nodeAt(pos);
      if (!dom || !current) return;
      const grid = computePageGridPosition(dom);
      if (!grid) return;
      // computePageGridPosition peut avoir repoussé `dom` jusqu'au bord physique de la page : left/top stockés suivent la position corrigée.
      patches.push({ pos, attrs: Object.assign({}, current.attrs, grid, { left: Math.round(dom.offsetLeft), top: Math.round(dom.offsetTop) }) });
    });
    if (!patches.length) return false;
    const tr = editor.state.tr;
    patches.forEach(p => tr.setNodeMarkup(p.pos, undefined, p.attrs));
    tr.setMeta('addToHistory', false);
    // Suivi des modifications actif : cette recapture n'est pas une modification de la personne, elle ne doit pas ressortir comme une suggestion.
    TrackChanges.skipTracking(tr);
    editor.view.dispatch(tr);
    return true;
  }

  // Les feuilles ont leur taille réelle (« Pages entières ») : le haut du corps d'une page 2, 3... n'est plus là où l'ancienne mise en page compacte le posait (ni marge, ni bande
  // de pied et d'en-tête entre deux feuilles). Une image en calque d'un modèle enregistré avant ce changement et posée sur l'une de ces pages garde son `top` d'alors, mais sa
  // grille page (le PDF et le Word la lisent) dit toujours « tant de points depuis le haut du corps de SA page » : l'éditeur la montrait donc plus haut que l'export. Au
  // chargement, son `top` se relit sur la grille. Rien ne change pour un modèle enregistré depuis (les deux s'accordent : l'écart toléré couvre l'arrondi), ni pour la page 1
  // (même géométrie qu'avant) ; une image dans un tableau ou une colonne (autre repère que `.tiptap`) est laissée. Une seule transaction, hors historique et hors suivi, comme
  // migrateLegacyImagePositions : ce n'est pas une modification de la personne. Rend true si elle a modifié le document.
  // Sans mise en page mesurable (éditeur masqué par la Lecture, Aperçu A4 décoché) elle reste « en attente » : `{ onlyIfPending: true }` la rejoue quand l'éditeur en a une.
  let reconcilePending = false;
  function reconcileLayerImagesWithGrid(opts) {
    if (opts && opts.onlyIfPending && !reconcilePending) return false;
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!tiptapEl || hfMode || !document.getElementById('editor-container').classList.contains('a4-preview') || !tiptapEl.getClientRects().length) { reconcilePending = true; return false; }
    reconcilePending = false;
    renderPaginationOverlay();
    if (!lastPageLayout) return false;
    const patches = [];
    editor.state.doc.descendants((node, pos) => {
      const a = node.attrs;
      if (node.type.name !== 'editorImage' || a.layer === 'normal' || !(a.pageIndex >= 1) || a.pageTopPt == null) return;
      const page = lastPageLayout.pages[a.pageIndex];
      const dom = editor.view.nodeDOM(pos);
      if (!page || !dom || dom.offsetParent !== tiptapEl) return;
      const wantedTop = Math.round(page.bodyTop - lastPageLayout.tiptapTop + a.pageTopPt * PT_TO_PX);
      if (Math.abs(wantedTop - (a.top || 0)) <= 1.5) return;
      patches.push({ pos, attrs: Object.assign({}, a, { top: wantedTop }) });
    });
    if (!patches.length) return false;
    const tr = editor.state.tr;
    patches.forEach(p => tr.setNodeMarkup(p.pos, undefined, p.attrs));
    tr.setMeta('addToHistory', false);
    TrackChanges.skipTracking(tr);
    editor.view.dispatch(tr);
    return true;
  }

  // Une couture rejoue ce qui sépare deux feuilles PHYSIQUES, à leur vraie taille : le bas de la page qui finit (sa marge du bas, la bande de son pied : `foot`, avec
  // le pied tout en haut, juste sous le texte), la gouttière du plan de travail, puis le haut de la page qui commence (la bande de son en-tête, sa marge du haut :
  // `head`, avec l'en-tête à la moitié de la marge). Les deux zones restent transparentes : c'est la feuille (`.v2-page-sheet`) qui est blanche, et ce qu'on peint
  // dessus - l'image d'un coin répétée sur chaque page - doit passer à travers. Seuls la gouttière et les zones prennent la souris.
  function buildSeam(opts) {
    const { footerText, headerText, pageEnding, pageStarting, totalPages, differentFirstPage, footAreaPx, headAreaPx, topMarginPx } = opts;
    const seam = document.createElement('div');
    seam.className = 'v2-page-band ' + ((!footerText && !headerText) ? 'v2-page-break-line' : 'v2-page-seam');
    const foot = document.createElement('div');
    foot.className = 'v2-page-seam-foot';
    foot.style.height = footAreaPx + 'px';
    if (footerText) {
      const f = document.createElement('div');
      f.className = 'v2-page-band-footer v2-hf-zone v2-hf-zone-filled' + (inEmailMode ? ' v2-hf-locked' : '');
      f.innerHTML = PageLayout.resolvePageNumberBadges(footerText, pageEnding, totalPages);
      f.style.paddingTop = '0';
      f.style.maxHeight = footAreaPx + 'px';
      f.onclick = () => enterHeaderFooterMode('footer', (pageEnding === 1 && differentFirstPage) ? 'first' : 'default');
      foot.appendChild(f);
    }
    const divider = document.createElement('div');
    divider.className = 'v2-page-seam-divider';
    if (!footerText && !headerText) divider.innerHTML = '<span class="v2-page-break-label">Page ' + pageStarting + '</span>';
    const head = document.createElement('div');
    head.className = 'v2-page-seam-head';
    head.style.height = headAreaPx + 'px';
    if (headerText) {
      const h = document.createElement('div');
      h.className = 'v2-page-band-header v2-hf-zone v2-hf-zone-filled' + (inEmailMode ? ' v2-hf-locked' : '');
      h.innerHTML = PageLayout.resolvePageNumberBadges(headerText, pageStarting, totalPages);
      h.style.paddingTop = (topMarginPx / 2) + 'px';
      h.style.maxHeight = headAreaPx + 'px';
      h.onclick = () => enterHeaderFooterMode('header', 'default');
      head.appendChild(h);
    }
    seam.appendChild(foot); seam.appendChild(divider); seam.appendChild(head);
    return { seam, divider };
  }

  // « Sur toutes les pages » : l'image d'origine reste où la personne l'a posée (c'est elle qu'on déplace) ; ses copies se peignent sur les autres feuilles, à la même
  // place de la page. La couche est le premier enfant de la feuille - blanche, donc sous la couche - et sous `.tiptap`, dont le texte passe devant : « derrière le texte ».
  // Posée dans le repère des bandes de couture (le conteneur, zoom de la feuille compris), comme elles. La place vient de la grille page de l'image (la même que lit le PDF).
  function paintRepeatedCopies(pageSheet, pages, view) {
    const items = [];
    if (tiptapShowsLayout(view.tiptapEl)) {
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'editorImage' || node.attrs.varTable || !node.attrs.src || !PageLayer.isRepeatedAttrs(node.attrs)) return;
        const dom = editor.view.nodeDOM(pos);
        const img = dom && dom.querySelector ? dom.querySelector('img') : null;
        if (!img) return;
        const rect = img.getBoundingClientRect();
        items.push({
          src: node.attrs.src, width: rect.width / view.zoom, height: rect.height / view.zoom,
          leftPt: node.attrs.pageLeftPt, topPt: node.attrs.pageTopPt, opacity: node.attrs.opacity,
          // La page où l'original se trouve déjà : sa copie y serait un doublon.
          skipPage: PageLayer.pageIndexAt(pages, view.toLayoutY(rect.top + rect.height / 2)),
        });
      });
    }
    if (!items.length) {
      if (paginationCopiesEl && paginationCopiesEl.parentNode) paginationCopiesEl.parentNode.removeChild(paginationCopiesEl);
      paginationCopiesEl = null;
      return;
    }
    if (!paginationCopiesEl || paginationCopiesEl.parentNode !== pageSheet) {
      if (paginationCopiesEl && paginationCopiesEl.parentNode) paginationCopiesEl.parentNode.removeChild(paginationCopiesEl);
      paginationCopiesEl = document.createElement('div');
      paginationCopiesEl.className = 'v2-page-layer';
      paginationCopiesEl.setAttribute('aria-hidden', 'true');
      pageSheet.insertBefore(paginationCopiesEl, pageSheet.firstChild);
    }
    PageLayer.paintCopies(paginationCopiesEl, {
      left: view.sheetLeft, width: view.sheetWidth, pageHeight: PageLayout.getPageSizePx().height, contentLeft: view.contentLeftPx, pages, items,
    });
  }
  // Éditeur visible (pas masqué par la Lecture) : sans mise en page, tous les rectangles valent 0 et rien ne se mesure.
  function tiptapShowsLayout(tiptapEl) { return !!tiptapEl && tiptapEl.getClientRects().length > 0; }
  // Le tableau est rogné sous la dernière ligne de la page qui finit, jusqu'au bas de la couture (TablePageCut.clipRule) : le trait du haut de la ligne qui ouvre la page, qui est
  // dans la partie rognée, se redessine au bord bas de la bande par un filet de 1 px de la largeur du tableau (même gris que les cases, css/editor-v2.css).
  function addTableSeamCaps(seam, tableEl, pageSheet, zoom) {
    const tableRect = tableEl.getBoundingClientRect();
    const sheetRect = pageSheet.getBoundingClientRect();
    const cap = document.createElement('div');
    cap.className = 'v2-page-seam-cap';
    cap.style.left = ((tableRect.left - sheetRect.left) / zoom) + 'px';
    cap.style.width = (tableRect.width / zoom) + 'px';
    seam.appendChild(cap);
  }

  function renderPaginationOverlay() {
    const container = document.getElementById('editor-container');
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!container || !tiptapEl) return;
    if (hfMode || !container.classList.contains('a4-preview')) { clearPaginationOverlay(); return; }
    wireMarginZones(container);

    if (!paginationOverlayEl) {
      paginationOverlayEl = document.createElement('div');
      paginationOverlayEl.className = 'v2-pagination-overlay';
      container.appendChild(paginationOverlayEl);
    }
    paginationOverlayEl.innerHTML = '';

    const { enabled, differentFirstPage, headerForPage, footerForPage, pageContentHeightPx, topBandPx, bottomBandPx } = currentPageGeometry();
    // Nettoie avant de recalculer : le bloc "dernier de la page" peut changer d'une frappe à l'autre, une ancienne marge orpheline gonflerait le document.
    // Les réserves retirées, le document raccourcit de leur somme (avec les feuilles entières, jusqu'à une page de moins en bas) : un conteneur défilé près de la fin ramenait
    // sa position à ce nouveau bas dès la première mesure, et une frappe sur la dernière page faisait sauter l'éditeur de plusieurs centaines de pixels. `.tiptap` garde donc sa
    // hauteur d'avant jusqu'au bout du calcul, où le plancher final prend sa place (première règle de `marginRules`).
    const heightBefore = tiptapEl.getBoundingClientRect().height / layoutZoom(tiptapEl);
    clearPageBreakMargins();
    const marginRules = ['#editor-container .tiptap { min-height: ' + heightBefore + 'px; }'];
    ensurePaginationMarginStyle().textContent = marginRules[0];
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const totalPages = breaks.length + 1;

    const pageSheet = tiptapEl.parentElement;
    ensureEdgeZone(pageSheet, tiptapEl, 'top');
    ensureEdgeZone(pageSheet, tiptapEl, 'bottom');
    updateHfZone(paginationEdgeTopEl, headerForPage(1), 1, totalPages, 'header', differentFirstPage ? 'first' : 'default', I18n.t('hf.addHeader'), topBandPx);
    updateHfZone(paginationEdgeBottomEl, footerForPage(totalPages), totalPages, totalPages, 'footer', (totalPages === 1 && differentFirstPage) ? 'first' : 'default', I18n.t('hf.addFooter'), bottomBandPx);

    // Les bandes couvrent toute la largeur de la FEUILLE, pas de la colonne de texte : ce sont des frontières entre deux pages physiques, et depuis que la
    // frontière se dessine comme une vraie gouttière (fond gris + tranche des deux feuilles, cf. css/editor-v2.css), une bande large de la seule colonne
    // de texte laisserait deux bandes blanches sur les côtés, à l'aplomb des marges. Corrige au passage un double décalage : la bande était déjà rentrée
    // des marges de page, et `.v2-page-band-header/footer` y rajoute son propre padding de marge - un en-tête de couture était donc indenté deux fois plus
    // loin que celui de la page 1. Le mode Lecture ne souffrait pas de ce défaut, sa bande couvrant déjà toute la feuille.
    const zoom = layoutZoom(tiptapEl);
    // Positions des bandes (et des pages) lues sur les rectangles, jamais sur offsetTop/offsetLeft/offsetWidth : ceux-ci s'arrondissent à l'entier, et une page
    // posée à 0,4 px près n'est plus au même endroit que le PDF à quelques dixièmes de point. Les rectangles sont en pixels écran, déjà multipliés par le zoom de
    // la feuille ; la bande, enfant du conteneur et zoomée comme elle, se place en pixels de mise en page depuis le coin du contenu défilant du conteneur.
    const lc = layerCoords(container, zoom);
    const toLayoutX = lc.x;
    const toLayoutY = lc.y;
    const sheetRect = pageSheet.getBoundingClientRect();
    const sheetLeft = toLayoutX(sheetRect.left);
    const sheetWidth = sheetRect.width / zoom;
    const tiptapRect = tiptapEl.getBoundingClientRect();

    // Feuilles entières (choix d'Antoine, 01/10) : chaque page a sa hauteur réelle, la dernière comprise. Ce qu'une page contient ne la remplit pas toujours : un saut
    // forcé, une page coupée avant un bloc trop haut, le dernier paragraphe d'un modèle d'une ligne. `remaining` est la place qui reste sous son texte, jusqu'au bas du
    // corps de la page (la hauteur utile B, sans marges ni bandes) : une réserve de plus sur le dernier bloc, avant la couture. Elle se lit sur le DOM déjà mis en page,
    // le repère de saut de page et l'écart entre les blocs compris, jamais sur la somme des hauteurs que computePageBreaks a comptée : la page vaut alors exactement B.
    const mPx = marginsPx();
    const footAreaPx = mPx.bottom + bottomBandPx;
    const headAreaPx = mPx.top + topBandPx;
    const pages = [];
    const tiptapPaddingTop = parseFloat(getComputedStyle(tiptapEl).paddingTop) || 0;
    // Haut du corps de la page courante depuis le haut de `.tiptap`, en pixels de mise en page (la première page : sa marge du haut).
    let bodyTopRel = tiptapPaddingTop;
    pages.push({ top: toLayoutY(sheetRect.top), bodyTop: toLayoutY(tiptapRect.top) + tiptapPaddingTop });

    // Une bande par frontière entre 2 pages (repère "— Page N —" par défaut sans en-tête/pied) ; espace réservé via `:nth-child` externe, pas un style inline
    // sur `afterEl` (même piège que paginationMarginStyleEl).
    const tiptapChildren = Array.from(tiptapEl.children);
    // Tableaux coupés entre deux lignes : pour chacun (rang de son bloc), les bandes de sa hauteur à rogner (cf. TablePageCut.clipRule).
    const tableStrips = new Map();
    breaks.forEach((brk, i) => {
      const pageEnding = i + 1;
      const pageStarting = i + 2;
      const footerText = enabled ? footerForPage(pageEnding) : null;
      const headerText = enabled ? headerForPage(pageStarting) : null;
      const { seam, divider } = buildSeam({ footerText, headerText, pageEnding, pageStarting, totalPages, differentFirstPage, footAreaPx, headAreaPx, topMarginPx: mPx.top });
      paginationOverlayEl.appendChild(seam);
      seam.style.left = sheetLeft + 'px';
      seam.style.width = sheetWidth + 'px';
      const seamHeight = seam.getBoundingClientRect().height / zoom;
      // Coupure ENTRE DEUX LIGNES d'un tableau (brk.rowIndex, js/table-page-cut.js) : le bas de la page qui finit est celui de la ligne qui précède celle qui ouvre la page,
      // non celui du tableau entier (le tableau est le bloc des deux pages).
      const tableEl = brk.rowIndex != null ? brk.afterEl.querySelector(':scope > table') : null;
      const tableRows = tableEl ? (TablePageCut.rowsOf(tableEl) || []) : [];
      const rowAbove = tableRows[brk.rowIndex - 1] || null;
      const rowOpening = rowAbove ? tableRows[brk.rowIndex] : null;
      // Bas du contenu de la page qui finit, lu après les réserves déjà posées : la coupure suivante doit voir leur effet avant de mesurer sa propre position.
      const afterBottomScreen = (rowAbove || brk.afterEl).getBoundingClientRect().bottom;
      const afterBottomRel = (afterBottomScreen - tiptapRect.top) / zoom;
      const remaining = Math.max(0, pageContentHeightPx - (afterBottomRel - bodyTopRel));
      const nthChild = tiptapChildren.indexOf(brk.afterEl) + 1;
      if (rowOpening) {
        // La ligne qui ouvre la page descend de la réserve de la page qui finit, puis de la couture (rembourrage haut de ses cases, jamais un style sur le nœud) ; le reste du
        // tableau la suit. Ce rembourrage est peint par les cases (fond, traits verticaux) : le tableau est rogné sur cette hauteur (clipRule, plus bas) pour que la réserve et les
        // marges de la couture, transparentes, restent blanches. Le trait du haut de la ligne, rogné avec le reste, est redessiné au bord bas de la couture (addTableSeamCaps).
        const restingPad = TablePageCut.restingPadTop(rowOpening);
        marginRules.push(TablePageCut.padRule('#editor-container .tiptap > *:nth-child(' + nthChild + ') > table', brk.rowIndex, restingPad + seamHeight + remaining));
        appliedRowPad.set(rowOpening, seamHeight + remaining);
        const stripTop = (afterBottomScreen - brk.afterEl.getBoundingClientRect().top) / zoom;
        if (!tableStrips.has(nthChild)) tableStrips.set(nthChild, []);
        tableStrips.get(nthChild).push({ top: stripTop + 1, bottom: stripTop + remaining + seamHeight });
        addTableSeamCaps(seam, tableEl, pageSheet, zoom);
      } else {
        marginRules.push('#editor-container .tiptap > *:nth-child(' + nthChild + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }');
      }
      ensurePaginationMarginStyle().textContent = marginRules.join('\n');
      const seamTop = toLayoutY(afterBottomScreen) + remaining;
      seam.style.top = seamTop + 'px';
      bodyTopRel = afterBottomRel + remaining + seamHeight;
      pages.push({ top: seamTop + footAreaPx + divider.getBoundingClientRect().height / zoom, bodyTop: seamTop + seamHeight });
    });
    // La dernière page, jusqu'à sa hauteur réelle : `.tiptap` ne descend jamais sous le haut du corps de cette page + B + sa marge du bas (le plancher ne gêne pas
    // un contenu plus long). Ajouté à la même feuille de style que les réserves : effacé avec elles.
    marginRules[0] = '#editor-container .tiptap { min-height: ' + (bodyTopRel + pageContentHeightPx + mPx.bottom) + 'px; }';
    tableStrips.forEach((strips, nth) => marginRules.push(TablePageCut.clipRule('#editor-container .tiptap > *:nth-child(' + nth + ')', strips)));
    ensurePaginationMarginStyle().textContent = marginRules.join('\n');
    // Les pages sont posées : les copies de « Sur toutes les pages » se peignent dessus (la dernière réserve vient de changer la hauteur de la feuille).
    lastPageLayout = { pages, tiptapTop: toLayoutY(tiptapRect.top) };
    paintRepeatedCopies(pageSheet, pages, { tiptapEl, zoom, toLayoutY, sheetLeft, sheetWidth, contentLeftPx: mPx.left });
    renderedSize = tiptapEl.offsetWidth + 'x' + tiptapEl.offsetHeight;
  }

  return {
    setEditor, setEmailMode, getHfMode, clampWidthForHfMaxSize, enforceZoneHeightLimit,
    enterHeaderFooterMode, exitHeaderFooterMode, exitHeaderFooterModeIfActive, isEditingHeaderFooter,
    getHeaderFooterData, setHeaderFooterData, renderHfPill,
    schedulePaginationRecompute, renderPaginationOverlay, computePageGridPosition, migrateLegacyImagePositions, reconcileLayerImagesWithGrid, recaptureLayeredImageGrids,
  };
})();
