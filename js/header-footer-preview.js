// Édition de l'en-tête et du pied de page, et aperçu de la pagination. Un seul éditeur TipTap : le contenu affiché est échangé par setContent() entre
// le document principal et le fragment en cours d'édition (enterHeaderFooterMode, exitHeaderFooterMode).
const HeaderFooterPreview = (function () {
  let editor = null;
  // Une image d'un autre site que la personne affiche (js/external-images.js) change la hauteur de sa zone et de la page : les zones d'en-tête et de pied,
  // les copies d'images répétées et les coupures de page se redessinent d'après le modèle.
  let revealHooked = false;
  function hookReveal() {
    if (revealHooked || typeof ExternalImages === 'undefined') return;
    revealHooked = true;
    ExternalImages.onReveal(() => renderPaginationOverlay());
  }
  function setEditor(ed) { editor = ed; watchPaginationGeometry(); hookReveal(); }

  const ZONES = ['header', 'footer'];
  const VARIANTS = ['default', 'first'];
  function editorContainer() { return document.getElementById('editor-container'); }
  function isA4Preview() {
    const container = editorContainer();
    return !!container && container.classList.contains('a4-preview');
  }
  // Éditeur visible (pas masqué par la Lecture) : sans mise en page, tous les rectangles valent 0 et rien ne se mesure.
  function tiptapShowsLayout(tiptapEl) { return !!tiptapEl && tiptapEl.getClientRects().length > 0; }

  // Posé par js/main.js (comme MainToolbar.setEmailMode) pour un modèle email : un mailto: est du texte brut, sans pages, donc sans en-tête ni pied.
  // Les zones de marge restent visibles, inertes et grisées (classe v2-hf-locked) au lieu de disparaître ; enterHeaderFooterMode refuse d'ouvrir.
  let inEmailMode = false;
  function setEmailMode(active) { inEmailMode = !!active; }

  // `null` en édition normale ; sinon la zone et la variante affichées.
  let hfMode = null; // { zone: 'header'|'footer', variant: 'default'|'first' }
  function getHfMode() { return hfMode; }
  let mainDocSnapshot = null;
  function emptyHeaderFooterData() {
    return { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  }
  let headerFooterDraft = emptyHeaderFooterData();

  // Une image d'en-tête ou de pied tient dans la bande que la page lui réserve (PageLayout.HEADER_FOOTER_ZONE_PX) : une convention, pas une limite
  // technique.
  const HF_MAX_IMAGE_HEIGHT_PX = PageLayout.HEADER_FOOTER_ZONE_PX;
  const HF_MAX_IMAGE_WIDTH_PX = 300;
  function clampWidthForHfMaxSize(widthPx, naturalWidth, naturalHeight) {
    if (!hfMode || !naturalWidth || !naturalHeight) return widthPx;
    const maxWidthFromHeight = HF_MAX_IMAGE_HEIGHT_PX * (naturalWidth / naturalHeight);
    const maxWidthPx = Math.min(HF_MAX_IMAGE_WIDTH_PX, maxWidthFromHeight);
    return Math.min(widthPx, maxWidthPx);
  }

  // La zone est bornée par un max-height CSS, mais rien n'empêchait de taper au-delà (le surplus débordait de la bande réservée du PDF).
  // `suppressHeightGuardOnce` laisse passer le chargement du fragment, qui n'est pas une frappe.
  let suppressHeightGuardOnce = false;
  function enforceZoneHeightLimit(ed, transaction) {
    if (suppressHeightGuardOnce) { suppressHeightGuardOnce = false; return; }
    if (!hfMode || !ed || !transaction || !transaction.docChanged) return;
    // Seules les transactions qui agrandissent le document sont bloquées : supprimer et mettre en forme restent permis.
    if (transaction.before.content.size >= transaction.doc.content.size) return;
    const dom = ed.view.dom;
    if (dom.scrollHeight <= dom.clientHeight + 1) return;
    // On inverse les pas de cette transaction seule : commands.undo() défait tout le groupe d'historique voisin.
    const invertTr = ed.state.tr;
    for (let i = transaction.steps.length - 1; i >= 0; i--) {
      invertTr.step(transaction.steps[i].invert(transaction.docs[i]));
    }
    invertTr.setMeta('addToHistory', false);
    ed.view.dispatch(invertTr);
  }

  // Charge le fragment voulu dans l'éditeur, après avoir gardé ce qu'on quitte : le brouillon de la zone ouverte, ou le document principal à la
  // première entrée.
  function enterHeaderFooterMode(zone, variant) {
    if (!editor || inEmailMode) return;
    // Une page trop basse pour la bande d'un en-tête ou d'un pied (un format libre de la taille d'une étiquette : PageLayout.fitsHeaderFooter) n'en
    // reçoit plus de nouveau, mais une zone qui a déjà un contenu s'ouvre, pour qu'on puisse le retirer. Depuis l'édition d'une zone, passer à
    // l'autre reste permis.
    if (!hfMode && !PageLayout.fitsHeaderFooter() && !hasZoneContent(headerFooterDraft[zone][variant])) return;
    if (hfMode) headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    else mainDocSnapshot = editor.getHTML();
    headerFooterDraft.enabled = true;
    hfMode = { zone, variant };
    suppressHeightGuardOnce = true;
    editor.commands.setContent(headerFooterDraft[zone][variant] || '');
    syncHfMode();
  }
  // L'éditeur vient d'échanger son contenu : la classe d'édition, la barre d'outils, la pastille et la pagination suivent `hfMode`.
  function syncHfMode() {
    const container = editorContainer();
    if (container) container.classList.toggle('hf-editing', !!hfMode);
    MainToolbar.syncToolbarState();
    renderHfPill();
    renderPaginationOverlay();
  }

  // Même règle que les exports : ce qu'ils ignorent, l'écran l'ignore aussi.
  const hasZoneContent = PageLayout.hasZoneContent;
  // Un en-tête ou un pied sans contenu n'existe pas : cliquer dans la marge puis « Terminer » sans rien écrire ne doit rien laisser « activé ». Un
  // fragment vide (le « <p></p> » que l'éditeur rend d'un fragment sans texte) devient une chaîne vide, sinon la Lecture ouvre une bande blanche de
  // 26 px. Sans contenu dans les variantes utilisées, ni en-tête, ni pied, ni première page différente ne reste activé. Un fragment qui a du contenu
  // n'est jamais touché, y compris une variante « première page » inutilisée (case décochée).
  function dropEmptyZones(data) {
    ZONES.forEach(zone => VARIANTS.forEach(variant => { if (!hasZoneContent(data[zone][variant])) data[zone][variant] = ''; }));
    const used = data.differentFirstPage ? VARIANTS : ['default'];
    if (!ZONES.some(zone => used.some(variant => data[zone][variant]))) { data.enabled = false; data.differentFirstPage = false; }
  }

  function exitHeaderFooterMode() {
    if (!hfMode || !editor) return;
    headerFooterDraft[hfMode.zone][hfMode.variant] = editor.getHTML();
    dropEmptyZones(headerFooterDraft);
    hfMode = null;
    editor.commands.setContent(mainDocSnapshot || '');
    mainDocSnapshot = null;
    syncHfMode();
  }

  // Appelé par main.js avant Enregistrer, Exporter et la Lecture : sinon editor.getHTML() rendrait le fragment chargé, pas le document.
  function exitHeaderFooterModeIfActive() {
    if (hfMode) exitHeaderFooterMode();
  }
  // Note de bas de page masquée en zone en-tête/pied : répétée sur chaque page, aucune page physique à laquelle l'ancrer (le pipeline PDF ne les
  // résout que depuis le corps principal).
  function isEditingHeaderFooter() { return !!hfMode; }

  // Le brouillon en cours, zone et variante affichées comprises, sans sortir du mode (les appelants réels appellent exitHeaderFooterModeIfActive
  // juste avant, mais un appel en plein mode reste cohérent).
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
    ZONES.forEach(zone => VARIANTS.forEach(variant => { headerFooterDraft[zone][variant] = HtmlSanitize.clean(headerFooterDraft[zone][variant]); }));
    // Un modèle enregistré avec un en-tête « activé » mais vide est remis à plat à l'ouverture, et enregistré ainsi à la prochaine sauvegarde.
    dropEmptyZones(headerFooterDraft);
    renderPaginationOverlay();
  }

  // Pastille d'édition de l'en-tête et du pied, collée en haut de #editor-container pendant l'édition (hfMode actif). On y entre par un clic sur une
  // zone de marge posée par renderPaginationOverlay. Construite une fois, puis resynchronisée.
  function renderHfPill() {
    const container = editorContainer();
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

  const PT_TO_PX = 96 / 72;
  // Facteur `zoom` effectif de la feuille (EditorCore.layoutZoom, js/main.js:applyPageFitZoom). Les rectangles de getBoundingClientRect() sont en
  // pixels écran, donc déjà multipliés par ce facteur, alors que pageContentHeightPx, offsetTop/offsetLeft et les styles des bandes sont en pixels de
  // mise en page : toute mesure se divise par lui, sinon les coupures tombent au mauvais endroit sur une feuille réduite.
  const layoutZoom = EditorCore.layoutZoom;

  // Blocs que l'export coupe au pixel (pdfmake : une colonne, un tableau, une liste) mais que l'aperçu, qui ne coupe pas le DOM, traite d'une pièce.
  // Un bloc de texte conditionnel en fait partie : son cadre n'existe que dans l'éditeur, à l'export son texte coule d'une page à l'autre.
  function isSplittableByExport(el) {
    return el.classList.contains('two-columns-zone-outer') || el.classList.contains('tableWrapper') || el.classList.contains('conditional-text') || el.tagName === 'TABLE' || el.tagName === 'UL' || el.tagName === 'OL';
  }
  // Paragraphe sans texte ni objet (un <br> décoratif ne compte pas) : la ligne vide que l'éditeur ajoute derrière un bloc (zone, tableau, image)
  // pour pouvoir y poser le curseur.
  function isBlankParagraph(el) {
    return el.tagName === 'P' && !el.textContent.trim() && !el.querySelector(':scope > :not(br)');
  }
  // Les lignes vides qui terminent le document : l'éditeur les garde (il faut pouvoir écrire à la suite), mais elles n'ouvrent pas de page, comme
  // dans la Lecture et les exports (ReaderMode.trimTrailingBlankBlocks) : elles dépassent simplement la dernière. Rend l'index du premier bloc de
  // cette suite (children.length s'il n'y en a pas). Seules les lignes vides comptent : un saut de page est un geste de la personne, il garde son
  // repère « Page 2 » même sans rien derrière.
  function trailingBlankStart(children) {
    let start = children.length;
    while (start > 0 && isBlankParagraph(children[start - 1])) start--;
    // Les lignes de fin qui ne portent que des images en calque de la page 1 en font partie, avec les lignes vides qui les séparent, quand un
    // paragraphe de texte les précède : la Lecture et les exports lui font reprendre les images (js/reader-mode.js:trimTrailingBlankBlocks). Sans
    // lui, la ligne reste une ligne comme une autre.
    let anchorStart = start;
    while (anchorStart > 0 && (isBlankParagraph(children[anchorStart - 1]) || isTailAnchorParagraph(children[anchorStart - 1]))) anchorStart--;
    const host = children[anchorStart - 1];
    return anchorStart < start && host && host.tagName === 'P' && !host.hasAttribute('data-caption') && !isBlankParagraph(host) && !isTailAnchorParagraph(host) ? anchorStart : start;
  }
  // Une ligne de fin qui ne porte que des images en calque posées sur la page 1 : dans un petit format, une image flottante sur la première page «
  // crée une deuxième page ». L'image est placée par sa grille de page, pas par la ligne qui la porte, et cette ligne n'a rien à montrer dans le flux
  // ; ouvrir une page pour elle seule serait ouvrir une page blanche. La page 1 existe toujours : seules ces images-là sont dispensées, celle d'une
  // page 2 ou plus a pu demander la page que sa ligne ouvre. Il faut la grille entière (page et deux décalages, ce que lisent le PDF et le Word) ;
  // elle se lit sur le nœud ProseMirror, la vue de l'image ne la porte pas (le séparateur et le <br> que ProseMirror pose derrière une image ne
  // comptent pas). Le texte se lit lui aussi sur le nœud : la vue d'une image liée à une colonne PJ porte son libellé « #Table.Colonne », que
  // `textContent` prendrait pour du texte. Même règle, sur le HTML, dans js/reader-mode.js:isTailAnchor.
  function isTailAnchorParagraph(el) {
    if (el.tagName !== 'P' || !el.querySelector(':scope > .editor-image-layered') || el.querySelector(':scope > :not(br):not(.ProseMirror-separator):not(.editor-image-layered)')) return false;
    try {
      const paragraph = editor.state.doc.resolve(editor.view.posAtDOM(el, 0)).parent;
      let onlyFirstPageLayers = paragraph.type.name === 'paragraph' && paragraph.childCount > 0;
      paragraph.forEach(child => {
        const a = child.attrs;
        if (child.isText && !child.text.trim()) return;
        if (child.type.name !== 'editorImage' || a.layer === 'normal' || a.pageIndex !== 0 || a.pageLeftPt == null || a.pageTopPt == null) onlyFirstPageLayers = false;
      });
      return onlyFirstPageLayers;
    } catch (e) { return false; }
  }

  // Les tranches de hauteur d'un tableau de premier niveau que TablePageCut sait couper entre deux lignes, `null` pour tout autre bloc.
  function cuttableTable(el, pageContentHeightPx, zoom, captionPx) {
    if (!el.classList.contains('tableWrapper')) return null;
    const table = el.querySelector(':scope > table');
    return table ? TablePageCut.measure(el, table, zoom, pageContentHeightPx, row => appliedRowPad.get(row), captionPx) : null;
  }
  // Les coupures de page de l'aperçu : accumule la hauteur des blocs de premier niveau de .tiptap, un `.page-break-marker` étant une coupure forcée.
  // Le grain est le bloc, jamais coupé en deux (pdfmake coupe au pixel). Rend, pour chaque coupure, le bloc après lequel elle tombe (`afterEl`). Un
  // bloc qui ne tient pas passe entier à la page suivante, sauf pour ne pas afficher une coupure que l'export ni la Lecture n'ont :
  //  - un bloc que l'export coupe (isSplittableByExport) reste sur la page où sa plus grande partie tient, le repère tombe derrière lui : le déplacer
  //    en entier se tromperait de tout ce qui tenait dans la page au lieu de ce qui déborde ;
  //  - les lignes vides de fin de document ne comptent pas (trailingBlankStart) : elles ouvriraient une page pour elles seules.
  // Un tableau de premier niveau se coupe entre deux lignes (js/table-page-cut.js), comme le PDF (dontBreakRows) et le Word (cantSplit) : la coupure
  // porte `rowIndex` (rang de la première ligne de la nouvelle page) et `afterEl` est l'enveloppe du tableau. Les lignes qu'une case fusionnée sur
  // plusieurs lignes lie ne se séparent pas : elles passent ensemble à la page suivante, comme une seule ligne. Un tableau qu'on ne sait pas couper
  // ainsi (ligne ou groupe de lignes plus haut que la page...) suit la règle des blocs que l'export coupe. Une légende d'image ou de tableau
  // (js/caption.js) reste avec son bloc, jamais seule en haut de la page suivante : le bloc et ses légendes comptent pour un seul bloc. Pour un
  // tableau coupé entre deux lignes, la dernière ligne et la légende font ce bloc. Un bloc et sa légende qui ne tiennent pas ensemble dans une page
  // (Caption.fitsWithCaption) ne sont pas gardés ensemble. Une zone à deux colonnes se coupe où la page finit, chaque colonne à son bloc (js/zone-page-cut.js),
  // comme le PDF : la coupure porte `zone` (pour chaque colonne le rang du bloc qui ouvre la page suivante et celui du dernier qu'elle garde sur la page qui
  // finit) et `afterEl` est l'enveloppe de la zone. « Garder avec le suivant » (js/keep-with-next.js) : une suite de paragraphes gardés et le
  // bloc qui la suit passent à la page suivante d'un seul tenant quand ils ne tiennent pas dans la place restante (le bloc qui la suit compte par sa
  // tête : la première ligne d'un tableau qu'on coupe entre deux lignes), sauf au-delà de 90 % d'une page.
  function computePageBreaks(tiptapEl, pageContentHeightPx) {
    const breaks = [];
    const zoom = layoutZoom(tiptapEl);
    const heightOf = el => el.getBoundingClientRect().height / zoom;
    const totalHeight = els => els.reduce((sum, el) => sum + heightOf(el), 0);
    const children = Array.from(tiptapEl.children);
    const blankTailStart = trailingBlankStart(children);
    const tailEl = children[blankTailStart];
    let consumed = 0;
    let lastBlock = null;
    // Les légendes d'un bloc sont comptées avec lui : on saute leurs rangs.
    let counted = 0;
    const cutAfterLast = () => breaks.push({ afterEl: lastBlock, forced: false, remainingPx: 0 });
    // Hauteur d'une suite « Garder avec le suivant » d'un seul tenant : ses blocs et celui qui la suit, avec sa légende ou, pour un tableau, sa
    // première tranche.
    const keptRunPx = run => {
      const membersPx = totalHeight(run.members);
      if (!run.target) return membersPx;
      const captions = Caption.captionsAfter(run.target, tailEl);
      const targetPx = heightOf(run.target);
      const withCaptionPx = targetPx + totalHeight(captions);
      const table = cuttableTable(run.target, pageContentHeightPx, zoom, 0);
      if (table) return membersPx + table.segs[0];
      return membersPx + (captions.length > 0 && Caption.fitsWithCaption(withCaptionPx, pageContentHeightPx) ? withCaptionPx : targetPx);
    };
    // « Garder avec le suivant » (js/keep-with-next.js) : les blocs gardés qui se suivent et le bloc qui les suit ne se coupent pas entre deux
    // pages. S'ils ne tiennent pas dans la place restante, c'est toute la suite qui ouvre la page suivante, au lieu du seul bloc qui ne tient plus.
    const keepRunTogether = index => {
      const run = KeepWithNext.runFrom(children, index, blankTailStart);
      if (!(consumed > 0 && run)) return;
      const unit = keptRunPx(run);
      if (unit > pageContentHeightPx - consumed && KeepWithNext.fits(unit, pageContentHeightPx)) { cutAfterLast(); consumed = 0; }
    };
    const placeCutTable = (block, cuttable) => {
      const { child, index, captions } = block;
      const tablePlan = TablePageCut.plan(consumed, cuttable.segs, pageContentHeightPx, cuttable.starts, cuttable.forced);
      if (tablePlan.blockBreakBefore) cutAfterLast();
      tablePlan.cuts.forEach((rowIndex, k) => breaks.push({ afterEl: child, rowIndex, forced: tablePlan.forcedCuts[k], remainingPx: 0 }));
      consumed = tablePlan.consumedAfter;
      lastBlock = child;
      if (cuttable.keepsTail) { counted = index + 1 + captions.length; lastBlock = captions[captions.length - 1]; }
    };
    // Une zone à deux colonnes se coupe entre deux blocs de chaque colonne (js/zone-page-cut.js), comme le PDF : sa colonne la plus longue continue sur
    // la page suivante, l'autre finit sur la première si elle y tient. L'écart avec le bloc d'avant (la marge de la zone) compte dans la place prise, sauf
    // en haut d'une page ouverte par une coupure : la réserve de la page qui finit absorbe cette marge. Les lignes vides au bas des colonnes de la
    // dernière zone du document ne comptent pas (trimTail : comme la Lecture et les exports).
    const zoneOf = el => (el.classList.contains('two-columns-zone-outer') ? el.querySelector(':scope > .two-columns-zone') : null);
    const cuttableZone = (el, index) => {
      const zoneEl = zoneOf(el);
      return zoneEl ? ZonePageCut.measure(zoneEl, zoom, index === blankTailStart - 1) : null;
    };
    const placeCutZone = (block, cuttable) => {
      const { child } = block;
      const zoneEl = cuttable.zone;
      const previous = child.previousElementSibling;
      const edge = previous ? previous.getBoundingClientRect().bottom : tiptapEl.getBoundingClientRect().top + (parseFloat(getComputedStyle(tiptapEl).paddingTop) || 0) * zoom;
      const naturalGapAbove = Math.max(0, (zoneEl.getBoundingClientRect().top - edge) / zoom);
      const next = child.nextElementSibling;
      const gapBelow = next ? Math.max(0, (next.getBoundingClientRect().top - zoneEl.getBoundingClientRect().bottom) / zoom) : 0;
      let zonePlan = ZonePageCut.plan(consumed, consumed > 0 || lastBlock === null ? naturalGapAbove : 0, cuttable, pageContentHeightPx, gapBelow);
      if (zonePlan.blockBreakBefore) {
        cutAfterLast();
        zonePlan = ZonePageCut.plan(0, 0, cuttable, pageContentHeightPx, gapBelow);
      }
      zonePlan.cuts.forEach(cut => breaks.push({ afterEl: child, zone: Object.assign({ blocks: cuttable.columns.map(column => column.blocks) }, cut), forced: false, remainingPx: 0 }));
      consumed = zonePlan.consumedAfter;
      lastBlock = child;
    };
    const placeBlock = block => {
      const { child, index, height, captions, captionPx } = block;
      const keeps = captions.length > 0 && Caption.fitsWithCaption(height + captionPx, pageContentHeightPx);
      const unitHeight = keeps ? height + captionPx : height;
      const room = pageContentHeightPx - consumed;
      const staysOnPage = !keeps && isSplittableByExport(child) && room > height / 2;
      if (consumed > 0 && unitHeight > room && !staysOnPage) { cutAfterLast(); consumed = unitHeight; }
      else { consumed += unitHeight; }
      lastBlock = child;
      if (keeps) { counted = index + 1 + captions.length; lastBlock = captions[captions.length - 1]; }
    };
    children.forEach((child, index) => {
      if (index < counted) return;
      const height = heightOf(child);
      if (child.classList.contains('page-break-marker')) {
        breaks.push({ afterEl: child, forced: true, remainingPx: Math.max(0, pageContentHeightPx - consumed) });
        consumed = 0;
        lastBlock = child;
        return;
      }
      if (index >= blankTailStart) return;
      keepRunTogether(index);
      const captions = Caption.captionsAfter(child, tailEl);
      const captionPx = totalHeight(captions);
      const block = { child, index, height, captions, captionPx };
      const cuttable = cuttableTable(child, pageContentHeightPx, zoom, captionPx);
      const cuttableZ = cuttable ? null : cuttableZone(child, index);
      if (cuttable) placeCutTable(block, cuttable);
      else if (cuttableZ) placeCutZone(block, cuttableZ);
      else placeBlock(block);
    });
    return breaks;
  }

  let paginationOverlayEl = null;
  const edgeZones = { top: null, bottom: null };
  // Couche des copies de « Sur toutes les pages » : premier enfant de la feuille, sous `.tiptap` (cf. paintRepeatedCopies).
  let paginationCopiesEl = null;
  function removeCopiesLayer() {
    if (paginationCopiesEl) paginationCopiesEl.remove();
    paginationCopiesEl = null;
  }
  // Les pages de la dernière pagination (haut de la feuille et haut du corps, en pixels de mise en page dans le repère du conteneur) et le haut de
  // `.tiptap` dans ce repère. Lu par computePageGridPosition et reconcileLayerImagesWithGrid.
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
  // Ligne de tableau -> hauteur ajoutée à son rembourrage haut pour la descendre sous une couture (règle de la feuille ci-dessus). Remise à zéro avec
  // la feuille : une mesure faite règle posée retranche ce que la règle a ajouté, une mesure faite feuille vide n'a rien à retrancher.
  let appliedRowPad = new WeakMap();
  // Ce rembourrage (pixels de mise en page) fait partie de la hauteur rendue d'une ligne, pas de la sienne : les bandeaux d'un tableau de document le retirent
  // (js/grid-editor.js:measureTable) pour lire la hauteur qu'une poignée règle, et pour laisser un vide devant le numéro de la ligne qui ouvre une page.
  function rowPadOf(row) { return appliedRowPad.get(row) || 0; }
  function clearPageBreakMargins() {
    if (paginationMarginStyleEl) paginationMarginStyleEl.textContent = '';
    if (paginationSteps) paginationSteps.clear();
    appliedRowPad = new WeakMap();
  }
  // Les règles de la pagination en cours (EditorCore.createStepSheets) : retirées avec la feuille des marges, au cas où un calcul s'interromprait en
  // route.
  let paginationSteps = null;
  function schedulePaginationRecompute() {
    if (paginationRecomputeTimer) clearTimeout(paginationRecomputeTimer);
    paginationRecomputeTimer = setTimeout(renderPaginationOverlay, 200);
  }
  // La couture suit la géométrie du contenu, pas seulement les frappes : onUpdate (js/editor.js) ne rappelle schedulePaginationRecompute que si le
  // document change, or le contenu change de taille sans transaction (police chargée, image arrivée, bulle de variable devenue valide ou cassée,
  // largeur de la feuille), et la bande resterait là où elle était calculée, au milieu d'un tableau devenu plus haut. `renderedSize` est la taille du
  // contenu une fois les marges de coupure posées : un changement que renderPaginationOverlay vient de causer n'est pas une nouvelle raison de
  // recalculer. Au plus 8 recalculs de suite en 3 s, au cas où une mise en page ne se stabiliserait pas.
  let paginationObserver = null;
  let renderedSize = '';
  let observedRecomputes = 0;
  let observedRecomputesTimer = null;
  function watchPaginationGeometry() {
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!tiptapEl || paginationObserver || typeof ResizeObserver !== 'function') return;
    const recomputeIfResized = () => {
      if (hfMode || !isA4Preview()) return;
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
    ['top', 'bottom'].forEach(pos => {
      if (edgeZones[pos]) edgeZones[pos].remove();
      edgeZones[pos] = null;
    });
    removeCopiesLayer();
    lastPageLayout = null;
    hoveredZoneEl = null;
    clearPageBreakMargins();
  }

  // Zones de marge cliquables (comme Google Docs ou Word) : un clic appelle enterHeaderFooterMode(zone, variant). Le début et la fin du document ont
  // un vrai espace dans le flux (`.v2-page-edge-spacer`, jamais enfant de `.tiptap`) ; les limites intermédiaires sont de purs overlays absolus dans
  // la marge réservée.
  function ensureEdgeZone(pageSheet, tiptapEl, pos) {
    if (edgeZones[pos]) return;
    const el = document.createElement('div');
    el.className = 'v2-page-edge-spacer v2-page-edge-' + pos + ' v2-hf-zone';
    pageSheet.insertBefore(el, pos === 'top' ? tiptapEl : tiptapEl.nextSibling);
    edgeZones[pos] = el;
  }
  // Bande cliquable d'une zone vide : le libellé « + Ajouter un en-tête » et un peu d'air. Rien n'étant imprimé, elle se pose dans la marge, à son
  // bord extérieur ; le reste de la marge garde son rôle de page (cliquer sous la dernière ligne place le curseur à la fin du texte au lieu d'ouvrir
  // le pied).
  const HF_EMPTY_STRIP_PX = 24;
  // Air sous le contenu d'une zone remplie : le bas de la bande cliquable.
  const HF_FILLED_PAD_PX = 8;
  // La boîte d'une zone est sa bande cliquable (celle que le survol teinte et qu'un clic ouvre), pas toute la marge : pour le haut, du bord de la
  // feuille jusque sous le contenu ; pour le bas, du dessous du texte jusque sous le contenu. Ses marges rendent à la page ce que le PDF y réserve
  // (`bandPx` : la bande placée sous la marge du haut ou au-dessus de la marge du bas, 0 sans contenu dans les deux variantes). Le padding de
  // `.tiptap` de ce côté reste : il porte les positions des images en calque. L'en-tête commence à la moitié de la marge du haut, le pied juste sous
  // le texte, là où le PDF les peint.
  function sizeHfZone(el, zone, hasContent, bandPx) {
    const mPx = PageLayout.getMarginsPx();
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
      // Après `.tiptap`, dont le padding de bas de page (la marge) commence sous le texte. Remplie, ou quand une bande est réservée, la boîte démarre
      // sous le texte ; vide et sans bande, elle se pose au bord de la feuille, et la marge au-dessus d'elle reste de la page.
      const offsetBelowText = (hasContent || band) ? 0 : marginPx - height;
      el.style.marginTop = (offsetBelowText - marginPx) + 'px';
      el.style.marginBottom = (band - (offsetBelowText - marginPx) - height) + 'px';
    }
  }
  function updateHfZone(el, html, pageNum, totalPages, zone, variant, ghostLabel, bandPx) {
    const resolved = html ? PageLayout.resolvePageNumberBadges(html, pageNum, totalPages) : '';
    const hasContent = hasZoneContent(resolved);
    el.classList.toggle('v2-hf-zone-empty', !hasContent);
    el.classList.toggle('v2-hf-zone-filled', hasContent);
    // Grisée (jamais retirée) : en mode e-mail, et, sur une page trop basse, tant que la zone est vide (cf. enterHeaderFooterMode).
    el.classList.toggle('v2-hf-locked', inEmailMode || (!hasContent && !PageLayout.fitsHeaderFooter()));
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
  // Les espaceurs ne prennent jamais le clic (`pointer-events: none`, css/editor-v2.css) : ils recouvrent la marge de `.tiptap`, où une image en
  // calque (le triangle d'un coin de feuille, par exemple) doit rester atteignable. La zone sous le curseur se retrouve donc ici, pour un clic tombé
  // sur le padding de `.tiptap` ou sur le fond de la feuille seulement : une image, une ligne de texte ou une poignée gardent leur clic.
  function zoneUnderPointer(event) {
    // Bouton principal seulement : le menu contextuel d'un clic droit dans la marge n'ouvre rien.
    if (hfMode || inEmailMode || !editor || !editor.view || event.button) return null;
    const tiptapEl = editor.view.dom;
    if (event.target !== tiptapEl && event.target !== tiptapEl.parentElement) return null;
    const under = el => {
      if (!el || !el.isConnected || el.classList.contains('v2-hf-locked')) return false;
      const r = el.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom;
    };
    return [edgeZones.top, edgeZones.bottom].find(under) || null;
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
    // Bouton enfoncé : on glisse une image ou on sélectionne du texte, la marge ne doit pas s'allumer au passage. L'invitation « + Ajouter un
    // en-tête » est la seule partie d'un espaceur à recevoir la souris : tant que le curseur est dessus, sa zone reste allumée.
    container.addEventListener('mousemove', event => {
      const own = event.target.closest && event.target.closest('.v2-page-edge-spacer');
      setHoveredZone(event.buttons ? null : (own || zoneUnderPointer(event)));
    });
    container.addEventListener('mouseleave', () => setHoveredZone(null));
  }
  // Le libellé des zones fantômes est écrit par renderPaginationOverlay : sans ce crochet, un changement de langue dans Réglages ne le corrigerait
  // qu'à la prochaine frappe.
  I18n.onChange(() => { if (editor) renderPaginationOverlay(); });
  // Repère de la couche de pagination (coutures, copies) : des pixels de mise en page depuis le coin du contenu défilant du conteneur, zoom de la
  // feuille compris. `x` et `y` y amènent un point de l'écran, `screenY` en revient : toutes les positions de page se lisent sur des rectangles,
  // jamais sur offsetTop (arrondi à l'entier).
  function layerCoords(container, zoom) {
    const r = container.getBoundingClientRect();
    return {
      x: v => (v - r.left - container.clientLeft + container.scrollLeft) / zoom,
      y: v => (v - r.top - container.clientTop + container.scrollTop) / zoom,
      screenY: v => v * zoom + r.top + container.clientTop - container.scrollTop,
    };
  }

  // Géométrie de page courante : en-tête et pied activés, avec la bande réservée toujours à pleine hauteur (PageLayout.HEADER_FOOTER_ZONE_PX) et
  // jamais à la hauteur rendue du contenu : le PDF réserve cette bande fixe dès qu'une zone a du contenu, et la mesurer ici décalerait tout le corps,
  // donc chaque image en calque, par rapport à l'export. Partagée par renderPaginationOverlay et computePageGridPosition : les deux doivent voir la
  // même page pour qu'une position capturée dans l'un vaille pour l'autre.
  function currentPageGeometry() {
    const enabled = !!headerFooterDraft.enabled;
    const differentFirstPage = enabled && !!headerFooterDraft.differentFirstPage;
    const headerHtml = enabled ? headerFooterDraft.header.default : null;
    const headerFirstHtml = differentFirstPage ? headerFooterDraft.header.first : null;
    const footerHtml = enabled ? headerFooterDraft.footer.default : null;
    const footerFirstHtml = differentFirstPage ? headerFooterDraft.footer.first : null;
    // Même test que pdf-export.js:resolveZone (du texte ou une image) sur les deux variantes : la hauteur rendue du contenu ne compte pas, seule sa
    // présence.
    const headerHasContent = enabled && (hasZoneContent(headerHtml) || hasZoneContent(headerFirstHtml));
    const footerHasContent = enabled && (hasZoneContent(footerHtml) || hasZoneContent(footerFirstHtml));
    const headerHeightPx = headerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    const footerHeightPx = footerHasContent ? HF_MAX_IMAGE_HEIGHT_PX : 0;
    // Les bandes que le PDF réserve sous la marge du haut et au-dessus de la marge du bas : sur toutes les pages dès qu'une variante a du contenu,
    // rien sinon.
    const topExtraPx = headerHeightPx ? headerHeightPx + PageLayout.HEADER_FOOTER_GAP_PX : 0;
    const bottomExtraPx = footerHeightPx ? footerHeightPx + PageLayout.HEADER_FOOTER_GAP_PX : 0;
    const mPx = PageLayout.getMarginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - mPx.top - mPx.bottom - topExtraPx - bottomExtraPx);
    return { enabled, differentFirstPage, headerForPage: n => (n === 1 && differentFirstPage) ? headerFirstHtml : headerHtml, footerForPage: n => (n === 1 && differentFirstPage) ? footerFirstHtml : footerHtml, pageContentHeightPx, topBandPx: topExtraPx, bottomBandPx: bottomExtraPx };
  }

  // Ancêtre direct de .tiptap qui contient `el` : computePageBreaks ne regarde jamais plus profond qu'un enfant direct (une zone 2 colonnes ou un
  // tableau compte pour UN bloc).
  function topLevelAncestorIn(tiptapEl, el) {
    let cur = el;
    while (cur && cur.parentElement !== tiptapEl) cur = cur.parentElement;
    return cur;
  }

  // La page d'une image est celle où se trouve son bord haut, pas celle du paragraphe qui la porte : tirée de la page 1 sur la page 2, elle garde son
  // paragraphe sur la page 1 et sa grille dirait « page 1 » hors de la feuille. Les feuilles ont une place fixe (k hauteurs de feuille plus les
  // gouttières) ; dans une gouttière, l'image est de la page suivante, que clampToPageEdge ramène à son bord. Rend l'index de la page et le haut de
  // son corps, en pixels écran.
  function pageStartFromLayout(elTop, zoom) {
    const pages = lastPageLayout.pages;
    const lc = layerCoords(editorContainer(), zoom);
    const pageH = PageLayout.getPageSizePx().height;
    const y = lc.y(elTop);
    let pageIndex = pages.findIndex(page => y < page.top + pageH);
    if (pageIndex < 0) pageIndex = pages.length - 1;
    return { pageIndex, pageStartTop: lc.screenY(pages[pageIndex].bodyTop) };
  }

  // Édition d'en-tête ou de pied : pas de mise en page mesurée, la page est celle du bloc qui porte l'élément, lue sur les coupures du fragment.
  // `firstPageTop` : haut du corps de la première page, en pixels écran.
  function pageStartFromBreaks(tiptapEl, topLevelEl, el, pageContentHeightPx, zoom, firstPageTop) {
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const children = Array.from(tiptapEl.children);
    const elIdx = children.indexOf(topLevelEl);
    // Un élément dans un tableau coupé entre deux lignes est sur la page de sa ligne : rang de la ligne parmi celles du tableau, -1 s'il n'est dans
    // aucune.
    const rowRankIn = (wrapper) => {
      const rows = TablePageCut.rowsOf(wrapper.querySelector(':scope > table'));
      let row = el.closest('tr');
      while (rows && row && rows.indexOf(row) < 0) row = row.parentElement && row.parentElement.closest('tr');
      return rows && row ? rows.indexOf(row) : -1;
    };
    let pageIndex = 0;
    let lastBreak = null;
    for (const brk of breaks) {
      const afterIdx = children.indexOf(brk.afterEl);
      if (elIdx > afterIdx || (brk.rowIndex != null && elIdx === afterIdx && rowRankIn(brk.afterEl) >= brk.rowIndex)) { pageIndex++; lastBreak = brk; } else break;
    }
    let pageStartTop = firstPageTop;
    if (lastBreak && lastBreak.rowIndex != null) {
      // La page commence à la ligne qui l'ouvre, sous la couture : haut de la ligne plus ce que la règle de coupure lui a ajouté (computePageBreaks
      // mesure feuille posée et ne le compte pas ; renderPaginationOverlay vient de la poser, ou de la retirer : la ligne n'a alors rien reçu).
      const row = (TablePageCut.rowsOf(lastBreak.afterEl.querySelector(':scope > table')) || [])[lastBreak.rowIndex];
      if (row) pageStartTop = row.getBoundingClientRect().top + (appliedRowPad.get(row) || 0) * zoom;
    } else if (lastBreak) {
      // Le margin-bottom de coupure est déjà dans le DOM (ensurePaginationMarginStyle) : le frère suivant est déjà poussé au début de la page
      // suivante.
      const nextSibling = lastBreak.afterEl.nextElementSibling;
      pageStartTop = nextSibling ? nextSibling.getBoundingClientRect().top : lastBreak.afterEl.getBoundingClientRect().bottom;
    }
    return { pageIndex, pageStartTop };
  }

  // Une image en calque tirée au-delà du bord physique de la page donnerait une position exportée négative (marge plus grille) : coupée dans le PDF
  // alors que le navigateur l'affiche en entier. Elle est donc repoussée dans le DOM réel jusqu'à ce bord, le seul point commun aux appelants, qui
  // relisent ensuite offsetLeft/offsetTop pour le left/top à enregistrer. Le bord est à -marge du coin imprimable (marges asymétriques comprises),
  // plus la bande de l'en-tête en haut : le PDF la compte dans la marge du haut de chaque page. Rend la position corrigée, en points, et si l'élément
  // a bougé.
  function clampToPageEdge(el, leftPt, topPt, topBandPx) {
    const margins = PageLayout.getMarginsPt();
    const minLeftPt = -margins.left;
    const minTopPt = -(margins.top + topBandPx / PT_TO_PX);
    const clampDeltaLeftPt = leftPt < minLeftPt ? minLeftPt - leftPt : 0;
    const clampDeltaTopPt = topPt < minTopPt ? minTopPt - topPt : 0;
    const moved = !!(clampDeltaLeftPt || clampDeltaTopPt);
    if (moved) {
      const curLeftPx = parseFloat(el.style.left) || 0;
      const curTopPx = parseFloat(el.style.top) || 0;
      el.style.left = (curLeftPx + clampDeltaLeftPt * PT_TO_PX) + 'px';
      el.style.top = (curTopPx + clampDeltaTopPt * PT_TO_PX) + 'px';
    }
    return { moved, pageLeftPt: leftPt + clampDeltaLeftPt, pageTopPt: topPt + clampDeltaTopPt };
  }

  // La pagination se repose à la première mesure d'une passe (`pass`, cf. computePageGridPosition), puis après une image repoussée.
  function syncPaginationFor(pass) {
    if (pass && pass.synced) return;
    renderPaginationOverlay();
    if (pass) pass.synced = true;
  }
  // Un remplissage lu par getComputedStyle, en pixels de mise en page (0 quand il n'est pas chiffré).
  const paddingPx = (computedStyle, side) => parseFloat(computedStyle[side]) || 0;
  // Position d'un élément sur la grille de page : index de page et décalage en points depuis le coin haut gauche imprimable de cette page, lus sur le
  // DOM mis en page (jamais reconstruits), ce qui permet à pdf-export.js de placer l'image au même endroit. `null` sans Aperçu A4, éditeur masqué
  // (Lecture : tous les rectangles valent 0) ou élément hors de .tiptap. Repousse `el` jusqu'au bord physique de la page s'il en sort
  // (clampToPageEdge). `pass` (facultatif) : objet partagé par les mesures d'une même passe sur plusieurs images. La pagination n'est reposée qu'à la
  // première, puis après une image repoussée : mesurer ne change rien, et une pagination par image rendrait la passe quadratique.
  function computePageGridPosition(el, pass) {
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!tiptapEl || !el || !isA4Preview() || !tiptapShowsLayout(tiptapEl)) return null;
    const topLevelEl = topLevelAncestorIn(tiptapEl, el);
    if (!topLevelEl) return null;
    // Marges de coupure remises à jour d'abord : une règle laissée par un calcul précédent (contenu ou en-tête différents) gonflerait la hauteur d'un
    // bloc et déclencherait des coupures trop tôt.
    syncPaginationFor(pass);
    const { pageContentHeightPx, topBandPx } = currentPageGeometry();
    const tiptapRect = tiptapEl.getBoundingClientRect();
    const cs = getComputedStyle(tiptapEl);
    // Les rectangles sont en pixels écran, le remplissage en pixels de mise en page : à ~700 px la feuille est réduite, le remplissage se multiplie
    // par son zoom.
    const zoom = layoutZoom(tiptapEl);
    const pageStartLeft = tiptapRect.left + paddingPx(cs, 'paddingLeft') * zoom;
    const elRect = el.getBoundingClientRect();
    const { pageIndex, pageStartTop } = lastPageLayout && lastPageLayout.pages.length
      ? pageStartFromLayout(elRect.top, zoom)
      : pageStartFromBreaks(tiptapEl, topLevelEl, el, pageContentHeightPx, zoom, tiptapRect.top + paddingPx(cs, 'paddingTop') * zoom);
    // Écarts en pixels écran : à ramener en pixels de mise en page avant la conversion en points.
    const rawLeftPt = ((elRect.left - pageStartLeft) / zoom) / PT_TO_PX;
    const rawTopPt = ((elRect.top - pageStartTop) / zoom) / PT_TO_PX;
    const edge = clampToPageEdge(el, rawLeftPt, rawTopPt, topBandPx);
    if (edge.moved && pass) pass.synced = false;
    return { pageIndex, pageLeftPt: edge.pageLeftPt, pageTopPt: edge.pageTopPt };
  }

  // Les images en calque dont les attributs passent `keep`, avec leur position dans le document.
  function layeredImages(keep) {
    const found = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'editorImage' && node.attrs.layer !== 'normal' && keep(node.attrs)) found.push({ pos, attrs: node.attrs });
    });
    return found;
  }

  // Les attributs de chaque image de `images` recalés sur sa grille de page, `extra(dom)` ajoutant ce qui se lit sur le DOM après la mesure. Toutes
  // les mesures d'abord, la transaction ensuite (elle pourrait redessiner un nœud pendant qu'on mesure le suivant), sur une seule mise en page pour
  // toute la passe (`pass` de computePageGridPosition).
  function regridImages(images, extra) {
    const pass = {};
    const patches = [];
    images.forEach(({ pos, attrs }) => {
      const dom = editor.view.nodeDOM(pos);
      const grid = dom && computePageGridPosition(dom, pass);
      if (grid) patches.push({ pos, attrs: Object.assign({}, attrs, grid, extra && extra(dom)) });
    });
    return patches;
  }

  // Une seule transaction pour tous les correctifs d'une passe, hors historique et hors suivi des modifications : ces passes ne sont pas une
  // modification de la personne (suivie, la bibliothèque en ferait une suppression plus une insertion, et chaque passe ajouterait une copie en
  // suggestion). La sélection n'est pas touchée. Rend true si le document a changé.
  function applyImagePatches(patches) {
    if (!patches.length) return false;
    const tr = editor.state.tr;
    patches.forEach(p => tr.setNodeMarkup(p.pos, undefined, p.attrs));
    tr.setMeta('addToHistory', false);
    TrackChanges.skipTracking(tr);
    editor.view.dispatch(tr);
    return true;
  }

  // Migration silencieuse : une image en calque posée avant la grille de page n'a que left/top, que pdf-export.js ne sait lire qu'en les prenant pour
  // une distance au paragraphe hôte, faux dès que l'image a été glissée ailleurs. Sa grille est capturée dès que le document est chargé en Aperçu A4,
  // sans geste de la personne. Un modèle chargé pendant que l'éditeur est masqué (Lecture) n'a rien de mesurable : il garde ses images sans grille et
  // la passe est rejouée au retour de l'éditeur (Editor.refreshLayout) ; mesurée masquée, l'image recevrait -marge/-marge et cette position
  // s'enregistrerait pour de bon (pageIndex n'étant plus nul).
  function migrateLegacyImagePositions() {
    // En édition d'en-tête/pied, le document affiché est le fragment, pas le corps du modèle.
    if (!editor || !isA4Preview() || hfMode || !tiptapShowsLayout(editor.view.dom)) return false;
    return applyImagePatches(regridImages(layeredImages(a => a.pageIndex == null && a.left != null)));
  }

  // Après un changement d'orientation ou de format, la page change de hauteur : la grille de chaque image en calque, lue par le PDF et le Word, est
  // recapturée, sinon l'export la place sur une page que l'éditeur ne lui montre plus. Même mesure que migrateLegacyImagePositions, pour les images
  // qui ont déjà une grille ; left/top suivent la position que computePageGridPosition a pu corriger. Rend true si le document a changé.
  function recaptureLayeredImageGrids() {
    if (!editor || !isA4Preview()) return false;
    const images = layeredImages(a => a.pageIndex != null);
    return applyImagePatches(regridImages(images, dom => ({ left: Math.round(dom.offsetLeft), top: Math.round(dom.offsetTop) })));
  }

  // Les feuilles ont leur taille réelle : le haut du corps d'une page 2, 3... n'est plus là où l'ancienne mise en page compacte le posait. Une image
  // en calque d'un modèle enregistré avant garde son `top` d'alors, alors que sa grille (lue par le PDF et le Word) dit « tant de points depuis le
  // haut du corps de sa page » : au chargement, son `top` se relit sur la grille. Rien ne change pour un modèle enregistré depuis (l'écart toléré
  // couvre l'arrondi), pour la page 1, ni pour une image dans un tableau ou une colonne (autre repère que `.tiptap`). Rend true si le document a
  // changé. Sans mise en page mesurable (éditeur masqué par la Lecture, Aperçu A4 décoché) elle reste « en attente » : `{ onlyIfPending: true }` la
  // rejoue quand l'éditeur en a une.
  let reconcilePending = false;
  function reconcileLayerImagesWithGrid(opts) {
    if (opts && opts.onlyIfPending && !reconcilePending) return false;
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!tiptapEl || hfMode || !isA4Preview() || !tiptapShowsLayout(tiptapEl)) { reconcilePending = true; return false; }
    reconcilePending = false;
    // `layoutFresh` : l'appelant vient de poser la pagination et rien ne l'a changée depuis, la refaire rendrait exactement la même.
    if (!(opts && opts.layoutFresh)) renderPaginationOverlay();
    if (!lastPageLayout) return false;
    const patches = [];
    layeredImages(a => a.pageIndex >= 1 && a.pageTopPt != null).forEach(({ pos, attrs }) => {
      const page = lastPageLayout.pages[attrs.pageIndex];
      const dom = editor.view.nodeDOM(pos);
      if (!page || !dom || dom.offsetParent !== tiptapEl) return;
      const wantedTop = Math.round(page.bodyTop - lastPageLayout.tiptapTop + attrs.pageTopPt * PT_TO_PX);
      if (Math.abs(wantedTop - (attrs.top || 0)) <= 1.5) return;
      patches.push({ pos, attrs: Object.assign({}, attrs, { top: wantedTop }) });
    });
    return applyImagePatches(patches);
  }

  // Une couture rejoue ce qui sépare deux feuilles physiques, à leur vraie taille : le bas de la page qui finit (sa marge du bas et la bande de son
  // pied, `foot`, le pied juste sous le texte), la gouttière du plan de travail, puis le haut de la page qui commence (la bande de son en-tête et sa
  // marge du haut, `head`, l'en-tête à la moitié de la marge). Les deux zones sont transparentes : la feuille (`.v2-page-sheet`) est blanche, et ce
  // qu'on peint dessus, l'image d'un coin répétée sur chaque page, doit passer à travers. Seuls la gouttière et les zones prennent la souris.
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

  // « Sur toutes les pages » : l'image d'origine reste où la personne l'a posée (c'est elle qu'on déplace) ; ses copies se peignent sur les autres
  // feuilles, à la même place de la page, donnée par la grille page de l'image (la même que lit le PDF). La couche est le premier enfant de la
  // feuille, donc au-dessus de son fond blanc et sous `.tiptap`, dont le texte passe devant : « derrière le texte ». Elle est posée dans le repère
  // des bandes de couture (le conteneur, zoom de la feuille compris).
  function paintRepeatedCopies(pageSheet, pages, view) {
    const items = [];
    if (tiptapShowsLayout(view.tiptapEl)) {
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'editorImage' || node.attrs.varTable || !node.attrs.src || !PageLayer.isRepeatedAttrs(node.attrs)) return;
        // Une image d'un autre site pas encore affichée n'est pas répétée : ses copies se peindraient hors de son cadre « Afficher ».
        if (ExternalImages.blockedSiteOf(node.attrs.src)) return;
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
    // Le filigrane du modèle (PageLayout.getWatermark) se peint dans la même couche, sur chaque feuille, sous les copies d'images.
    const pageSize = PageLayout.getPageSizePt();
    const watermark = PageLayer.watermarkLayout(PageLayout.getWatermark(), pageSize.width, pageSize.height);
    if (!items.length && !watermark) {
      removeCopiesLayer();
      return;
    }
    if (!paginationCopiesEl || paginationCopiesEl.parentNode !== pageSheet) {
      removeCopiesLayer();
      paginationCopiesEl = document.createElement('div');
      paginationCopiesEl.className = 'v2-page-layer';
      paginationCopiesEl.setAttribute('aria-hidden', 'true');
      pageSheet.insertBefore(paginationCopiesEl, pageSheet.firstChild);
    }
    PageLayer.paintCopies(paginationCopiesEl, {
      left: view.sheetLeft, width: view.sheetWidth, pageHeight: PageLayout.getPageSizePx().height, contentLeft: view.contentLeftPx, pages, items, watermark,
    });
  }
  // Le tableau est rogné sous la dernière ligne de la page qui finit, jusqu'au bas de la couture (TablePageCut.clipRule) : le trait du haut de la
  // ligne qui ouvre la page, qui est dans la partie rognée, se redessine au bord bas de la bande par un filet de 1 px de la largeur du tableau (même
  // gris que les cases, css/editor-v2.css).
  function addTableSeamCaps(seam, tableEl, pageSheet, zoom) {
    const tableRect = tableEl.getBoundingClientRect();
    const sheetRect = pageSheet.getBoundingClientRect();
    const cap = document.createElement('div');
    cap.className = 'v2-page-seam-cap';
    cap.style.left = ((tableRect.left - sheetRect.left) / zoom) + 'px';
    cap.style.width = (tableRect.width / zoom) + 'px';
    seam.appendChild(cap);
  }

  // Pose la couture qui sépare la page `i + 1` de la suivante : sa bande, la réserve sous le dernier bloc de la page qui finit, la page qui
  // commence. `pass` porte les mesures de la pagination et son état courant (haut du corps de page, règles de marge, rognages, pages).
  function placePaginationSeam(pass, brk, i) {
    const { geometry, totalPages, mPx, footAreaPx, headAreaPx, sheetLeft, sheetWidth, zoom, tiptapRect, toLayoutY, tiptapChildren, tableStrips, marginRules, pages, pageSheet } = pass;
    const { enabled, differentFirstPage, headerForPage, footerForPage, pageContentHeightPx } = geometry;
    const pageEnding = i + 1;
    const pageStarting = i + 2;
    const footerText = enabled ? footerForPage(pageEnding) : null;
    const headerText = enabled ? headerForPage(pageStarting) : null;
    const { seam, divider } = buildSeam({ footerText, headerText, pageEnding, pageStarting, totalPages, differentFirstPage, footAreaPx, headAreaPx, topMarginPx: mPx.top });
    paginationOverlayEl.appendChild(seam);
    seam.style.left = sheetLeft + 'px';
    seam.style.width = sheetWidth + 'px';
    const seamHeight = seam.getBoundingClientRect().height / zoom;
    // Coupure entre deux lignes d'un tableau (brk.rowIndex, js/table-page-cut.js) : le bas de la page qui finit est celui de la ligne qui précède
    // celle qui ouvre la page, non celui du tableau entier (le tableau est le bloc des deux pages).
    const tableEl = brk.rowIndex != null ? brk.afterEl.querySelector(':scope > table') : null;
    const tableRows = tableEl ? (TablePageCut.rowsOf(tableEl) || []) : [];
    const rowAbove = tableRows[brk.rowIndex - 1] || null;
    const rowOpening = rowAbove ? tableRows[brk.rowIndex] : null;
    const nthChild = tiptapChildren.indexOf(brk.afterEl) + 1;
    // Coupure dans une zone à deux colonnes (brk.zone, js/zone-page-cut.js) : le bas de la page qui finit est le plus bas des derniers blocs que les deux
    // colonnes y gardent, et c'est le bloc qui ouvre la page suivante, dans chaque colonne qui continue, qui descend sous la couture.
    const zoneCut = brk.zone ? ZonePageCut.place(brk.zone, brk.afterEl.querySelector(':scope > .two-columns-zone'), brk.zone.blocks, {
      rootTop: tiptapRect.top, zoom, bodyTopRel: pass.bodyTopRel, pageContentHeightPx, seamHeight, selector: '#editor-container .tiptap > *:nth-child(' + nthChild + ') > .two-columns-zone',
    }) : null;
    // Bas du contenu de la page qui finit, lu après les réserves déjà posées : la coupure suivante doit voir leur effet avant de mesurer sa propre
    // position.
    const afterBottomScreen = zoneCut ? zoneCut.afterBottomScreen : (rowAbove || brk.afterEl).getBoundingClientRect().bottom;
    const afterBottomRel = (afterBottomScreen - tiptapRect.top) / zoom;
    const remaining = Math.max(0, pageContentHeightPx - (afterBottomRel - pass.bodyTopRel));
    if (zoneCut) {
      zoneCut.rules.forEach(rule => { marginRules.push(rule); paginationSteps.add(rule); });
      if (!pass.zoneStrips.has(nthChild)) pass.zoneStrips.set(nthChild, []);
      pass.zoneStrips.get(nthChild).push(zoneCut.strip);
    } else if (rowOpening) {
      // La ligne qui ouvre la page descend de la réserve de la page qui finit, puis de la couture (rembourrage haut de ses cases, jamais un style
      // sur le nœud) ; le reste du tableau la suit. Ce rembourrage est peint par les cases (fond, traits verticaux) : le tableau est rogné sur
      // cette hauteur (clipRule, plus bas) pour que la réserve et les marges de la couture, transparentes, restent blanches. Le trait du haut de la
      // ligne, rogné avec le reste, est redessiné au bord bas de la couture (addTableSeamCaps).
      const restingPad = TablePageCut.restingPadTop(rowOpening);
      marginRules.push(TablePageCut.padRule('#editor-container .tiptap > *:nth-child(' + nthChild + ') > table', brk.rowIndex, restingPad + seamHeight + remaining, TablePageCut.fixedHeightPx(rowOpening), seamHeight + remaining));
      appliedRowPad.set(rowOpening, seamHeight + remaining);
      const stripTop = (afterBottomScreen - brk.afterEl.getBoundingClientRect().top) / zoom;
      if (!tableStrips.has(nthChild)) tableStrips.set(nthChild, []);
      tableStrips.get(nthChild).push({ top: stripTop + 1, bottom: stripTop + remaining + seamHeight });
      addTableSeamCaps(seam, tableEl, pageSheet, zoom);
    } else {
      marginRules.push('#editor-container .tiptap > *:nth-child(' + nthChild + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }');
    }
    if (!zoneCut) paginationSteps.add(marginRules[marginRules.length - 1]);
    const seamTop = toLayoutY(afterBottomScreen) + remaining;
    seam.style.top = seamTop + 'px';
    pass.bodyTopRel = afterBottomRel + remaining + seamHeight;
    pages.push({ top: seamTop + footAreaPx + divider.getBoundingClientRect().height / zoom, bodyTop: seamTop + seamHeight });
  }
  // Les coutures de toutes les frontières de page, les règles de marge qui réservent leur place (`marginRules[0]` : le plancher de `.tiptap`, remis à
  // sa valeur finale ici) et les copies de « Sur toutes les pages » peintes sur les pages posées.
  function layoutPaginationSeams(container, tiptapEl, pageSheet, geometry, breaks, marginRules) {
    const { pageContentHeightPx, topBandPx, bottomBandPx } = geometry;
    const totalPages = breaks.length + 1;
    // Les bandes couvrent toute la largeur de la feuille, pas de la colonne de texte : ce sont des frontières entre deux pages physiques dessinées
    // comme une gouttière (fond gris et tranche des deux feuilles, css/editor-v2.css), et une bande de la seule colonne laisserait deux bandes
    // blanches sur les côtés, à l'aplomb des marges. `.v2-page-band-header/footer` ajoute son propre padding de marge : la bande ne doit donc pas
    // être rentrée des marges de page, sinon l'en-tête de couture serait indenté deux fois.
    const zoom = layoutZoom(tiptapEl);
    // Positions des bandes (et des pages) lues sur les rectangles, jamais sur offsetTop/offsetLeft/offsetWidth : ceux-ci s'arrondissent à l'entier,
    // et une page posée à 0,4 px près n'est plus au même endroit que le PDF à quelques dixièmes de point. Les rectangles sont en pixels écran, déjà
    // multipliés par le zoom de la feuille ; la bande, enfant du conteneur et zoomée comme elle, se place en pixels de mise en page depuis le coin du
    // contenu défilant du conteneur.
    const lc = layerCoords(container, zoom);
    const toLayoutX = lc.x;
    const toLayoutY = lc.y;
    const sheetRect = pageSheet.getBoundingClientRect();
    const sheetLeft = toLayoutX(sheetRect.left);
    const sheetWidth = sheetRect.width / zoom;
    const tiptapRect = tiptapEl.getBoundingClientRect();

    // Chaque page est une feuille entière, la dernière comprise, alors que son contenu ne la remplit pas toujours (saut forcé, bloc trop haut renvoyé
    // à la suivante, dernier paragraphe d'une ligne). `remaining` est la place qui reste sous son texte jusqu'au bas du corps de la page (la hauteur
    // utile, sans marges ni bandes) : une réserve de plus sur le dernier bloc, avant la couture. Elle se lit sur le DOM déjà mis en page (repère de
    // saut de page et écart entre blocs compris), jamais sur la somme des hauteurs de computePageBreaks : la page vaut alors exactement la hauteur
    // utile.
    const mPx = PageLayout.getMarginsPx();
    const footAreaPx = mPx.bottom + bottomBandPx;
    const headAreaPx = mPx.top + topBandPx;
    const tiptapPaddingTop = parseFloat(getComputedStyle(tiptapEl).paddingTop) || 0;
    const pages = [{ top: toLayoutY(sheetRect.top), bodyTop: toLayoutY(tiptapRect.top) + tiptapPaddingTop }];
    // `bodyTopRel` : haut du corps de la page courante depuis le haut de `.tiptap`, en pixels de mise en page (la première page : sa marge du haut).
    // `tableStrips` : pour chaque tableau coupé entre deux lignes (rang de son bloc), les bandes de sa hauteur à rogner (cf. TablePageCut.clipRule).
    // Une bande par frontière entre 2 pages (repère "— Page N —" par défaut sans en-tête/pied) ; espace réservé via `:nth-child` externe, pas un
    // style inline sur `afterEl` (même piège que paginationMarginStyleEl).
    const pass = {
      geometry, totalPages, mPx, footAreaPx, headAreaPx, sheetLeft, sheetWidth, zoom, tiptapRect, toLayoutY, tiptapChildren: Array.from(tiptapEl.children),
      tableStrips: new Map(), zoneStrips: new Map(), marginRules, pages, pageSheet, bodyTopRel: tiptapPaddingTop,
    };
    breaks.forEach((brk, i) => placePaginationSeam(pass, brk, i));
    // La dernière page, jusqu'à sa hauteur réelle : `.tiptap` ne descend jamais sous le haut du corps de cette page + B + sa marge du bas (le
    // plancher ne gêne pas un contenu plus long). Ajouté à la même feuille de style que les réserves : effacé avec elles.
    marginRules[0] = '#editor-container .tiptap { min-height: ' + (pass.bodyTopRel + pageContentHeightPx + mPx.bottom) + 'px; }';
    pass.tableStrips.forEach((strips, nth) => marginRules.push(TablePageCut.clipRule('#editor-container .tiptap > *:nth-child(' + nth + ')', strips)));
    // Une zone coupée par une couture est rognée sur la bande que la couture recouvre : son liseré et les bordures de ses colonnes (au survol) s'arrêtent sous
    // le dernier bloc de la page qui finit et reprennent en haut de la page suivante, au lieu de traverser les marges blanches de la couture.
    pass.zoneStrips.forEach((strips, nth) => marginRules.push(TablePageCut.clipRule('#editor-container .tiptap > *:nth-child(' + nth + ') > .two-columns-zone', strips)));
    ensurePaginationMarginStyle().textContent = marginRules.join('\n');
    paginationSteps.clear();
    // Les pages sont posées : les copies de « Sur toutes les pages » se peignent dessus (la dernière réserve vient de changer la hauteur de la
    // feuille).
    lastPageLayout = { pages, tiptapTop: toLayoutY(tiptapRect.top) };
    paintRepeatedCopies(pageSheet, pages, { tiptapEl, zoom, toLayoutY, sheetLeft, sheetWidth, contentLeftPx: mPx.left });
  }

  function renderPaginationOverlay() {
    const container = editorContainer();
    const tiptapEl = editor && editor.view && editor.view.dom;
    if (!container || !tiptapEl) return;
    if (hfMode || !isA4Preview()) { clearPaginationOverlay(); return; }
    wireMarginZones(container);

    if (!paginationOverlayEl) {
      paginationOverlayEl = document.createElement('div');
      paginationOverlayEl.className = 'v2-pagination-overlay';
      container.appendChild(paginationOverlayEl);
    }
    paginationOverlayEl.innerHTML = '';

    const geometry = currentPageGeometry();
    const { differentFirstPage, headerForPage, footerForPage, pageContentHeightPx, topBandPx, bottomBandPx } = geometry;
    // On nettoie avant de recalculer : le dernier bloc d'une page change d'une frappe à l'autre, une ancienne réserve orpheline gonflerait le
    // document. Les réserves retirées, le document raccourcit de leur somme (jusqu'à une page) : un conteneur défilé près de la fin ramènerait sa
    // position à ce nouveau bas, et une frappe sur la dernière page ferait sauter l'éditeur. `.tiptap` garde donc sa hauteur d'avant jusqu'au bout du
    // calcul, où le plancher final prend sa place (première règle de `marginRules`).
    const heightBefore = tiptapEl.getBoundingClientRect().height / layoutZoom(tiptapEl);
    clearPageBreakMargins();
    const marginRules = ['#editor-container .tiptap { min-height: ' + heightBefore + 'px; }'];
    ensurePaginationMarginStyle().textContent = marginRules[0];
    paginationSteps = EditorCore.createStepSheets(ensurePaginationMarginStyle());
    const breaks = computePageBreaks(tiptapEl, pageContentHeightPx);
    const totalPages = breaks.length + 1;

    const pageSheet = tiptapEl.parentElement;
    ensureEdgeZone(pageSheet, tiptapEl, 'top');
    ensureEdgeZone(pageSheet, tiptapEl, 'bottom');
    updateHfZone(edgeZones.top, headerForPage(1), 1, totalPages, 'header', differentFirstPage ? 'first' : 'default', I18n.t('hf.addHeader'), topBandPx);
    updateHfZone(edgeZones.bottom, footerForPage(totalPages), totalPages, totalPages, 'footer', (totalPages === 1 && differentFirstPage) ? 'first' : 'default', I18n.t('hf.addFooter'), bottomBandPx);
    layoutPaginationSeams(container, tiptapEl, pageSheet, geometry, breaks, marginRules);
    renderedSize = tiptapEl.offsetWidth + 'x' + tiptapEl.offsetHeight;
  }

  return {
    setEditor, setEmailMode, getHfMode, clampWidthForHfMaxSize, enforceZoneHeightLimit,
    enterHeaderFooterMode, exitHeaderFooterModeIfActive, isEditingHeaderFooter,
    getHeaderFooterData, setHeaderFooterData,
    schedulePaginationRecompute, renderPaginationOverlay, computePageGridPosition, migrateLegacyImagePositions, reconcileLayerImagesWithGrid, recaptureLayeredImageGrids,
    rowPadOf,
  };
})();
