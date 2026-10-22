// Le volet « Importer » d'une présentation, à droite du document (extension « diapositives » de Grist Factory Suite) : « Importer », au bas de la bande des diapositives
// (extensions/diapositives/slide-strip.js), l'ouvre et le ferme ; la page se réduit à la largeur qui reste tant qu'il est ouvert (demande du 21/10, carte « Volet »).
//  - La SOURCE : une autre présentation du document, choisie dans la liste avec recherche (js/search-select.js) ; le volet la garde d'une ouverture à l'autre, tant qu'elle existe et
//    qu'elle n'est pas celle à l'écran.
//  - Ses DIAPOSITIVES, en miniatures, dans l'ordre : un clic sur l'une (Entrée ou Espace au clavier) la copie après la diapositive du curseur, comme si elle avait été copiée là-bas
//    puis collée ici (Ctrl+C, Ctrl+V : SlideStrip.importAfterCurrent) : ses images répétées sur toutes les pages et ses commentaires restent chez elle, ses images en calque se posent
//    sur sa nouvelle page, et un Ctrl+Z défait cet import seul. Le volet reste ouvert : les imports se suivent, chacun après le précédent, et le coin d'état les dit. Un double-clic
//    n'importe qu'une fois.
//  - Les MINIATURES sont celles de la bande, plus larges : la page de la présentation à l'écran (celle où la diapositive arrive), réduite à leur largeur. Elles sont tirées du HTML que
//    la source a enregistré, lu une fois, assaini et inerte (aucune image n'y charge, rien ne s'y exécute) ; LÉGÈRES sur une source chargée (70 diapositives d'images, de graphiques et
//    de formes, demande du 21/10) : seules celles que le volet montre, et un peu au-delà, sont dessinées, les autres quand la liste défile jusqu'à elles. Le volet fermé, il n'en garde
//    que le choix de la source.
//  - Au clavier, la liste est une liste d'options (un seul arrêt de Tab) : ↑ ↓ Début Fin passent d'une miniature à l'autre, Ctrl+Z et Ctrl+Y défont et refont dans le document ; Échap
//    ferme le volet et rend le clavier au bouton « Importer ». À la souris, le clavier reste où il est : dans le document, le curseur passe au début de la diapositive importée.
//  - « GARDER LIÉE » (demande du 21/10, carte « Case du volet ») : la case sous le choix de la source, décochée à chaque ouverture de la page (rien n'est gardé dans le navigateur).
//    Cochée, la diapositive importée reste liée à la sienne (js/slide-links.js) : avant de la copier, le volet relit la source et y pose le repère de la diapositive (écrit tout de
//    suite dans sa ligne), puis le collage pose le sien ici, dans le même pas d'annulation. Une diapositive déjà liée ici arrive en copie, et le coin d'état le dit. Grisée avec sa
//    raison pendant le suivi des modifications et l'écriture en direct : l'import est alors une copie.
//  - L'extension éteinte par GFS, volet ouvert : ses miniatures restent, grisées, l'indication dit pourquoi et leur clic explique (SlidesEntry.explainOff), comme les gestes de la bande.
//  - « EN TEXTE » (demande du 22/10, carte « En texte, dans les deux sens ») : le même volet s'ouvre aussi depuis un DOCUMENT, par la ligne « Diapositive d'une présentation… » du menu « Lien et blocs
//    de contenu » (SlidesEntry.openTextImport). Toutes les présentations du document sont des sources ; leurs miniatures gardent la page de leur présentation (celle du document n'est pas la
//    sienne) ; un clic insère la diapositive en texte du document, à l'endroit du curseur, à la taille du document, en un seul pas d'annulation (js/slide-text.js : la conversion, du socle). La case
//    est alors « Garder la mise en forme d'origine » (décochée à chaque ouverture : le texte garde les tailles de la diapositive) et la ligne d'état dit ce qui n'est pas entré (formes, traits, notes,
//    transition, fond). Ni liens ni images répétées : rien de la source ne reste dans le document. Un Ctrl+V d'une diapositive copiée de la bande fait la même conversion (SlidesEntry.pastedInDocument).
//  - « GARDER LIÉE » EN TEXTE (demande du 22/10, lot 3, carte « Sens unique : la copie suit la source ») : la case de la source, à côté de « Garder la mise en forme d'origine », décochée à chaque
//    ouverture du volet. Cochée, le texte posé reste lié à sa diapositive (js/slide-copies.js) : la source est relue comme pour un import lié de présentation à présentation
//    (SlideLinks.anchorSource écrit tout de suite le repère de la diapositive dans sa ligne), puis le texte arrive avec son repère, dans le même pas d'annulation. Il suit sa diapositive quand
//    elle change et ne s'écrit plus ici, jusqu'à « Détacher » (la barre flottante du texte). Une diapositive déjà liée à ce document arrive en copie, et le coin d'état le dit. Grisée avec sa raison
//    pendant le suivi des modifications et l'écriture en direct.
//  - « PAGES DE DOCUMENT » (demande du 22/10, lot 2, carte « En texte, dans les deux sens ») : la liste des sources propose aussi les documents ; une page (ce qui sépare deux sauts de page) est
//    une miniature, à la page du document (sa taille, son sens, ses marges), et un clic la pose en diapositives après celle du curseur (extensions/diapositives/page-slides.js : les tailles d'une
//    diapositive, une page trop longue en plusieurs). La case est alors « Garder la mise en forme d'origine » (décochée à chaque ouverture : le texte garde les tailles du document) ; le lien
//    (« Garder liée ») ne vaut que d'une présentation à une autre. Le curseur se pose sur la dernière diapositive posée : l'import suivant vient après elle.
//  - La barre de GFS (consigne GFS 025) recouvre le cadre au bord que la personne a choisi : à droite elle tombe sur le volet et sur la barre de défilement du document. Ce qu'elle en mord
//    (GfsBar.bite), le volet le cède : il s'élargit de cette profondeur vers la gauche, une gouttière à droite que la barre occupe, et la page et la pastille du zoom lui laissent la même
//    place (`--pp-slide-import-bar`) ; aux autres bords, dans un cadre étroit, il perd la hauteur mordue. Les miniatures ne bougent pas et la barre n'en recouvre aucune.
// Styles : extensions/diapositives/slide-import.css (dont la place que le volet prend à droite du document, `body.pp-slide-import-on`).
const SlideImport = (function () {
  const el = Dom.el;
  const THUMB_WIDTH_PX = 140;      // la largeur d'une miniature (celle de slide-import.css) ; sa hauteur suit la page
  const DRAW_AHEAD_PX = 300;       // au-delà de ce que la liste montre, la hauteur de miniatures dessinées, au-dessus et au-dessous
  const PT_TO_PX = PageLayout.MM_TO_PX / PageLayout.MM_TO_PT;
  const SOURCE_ID = 'pp-slide-import-source';
  const HINT_ID = 'pp-slide-import-hint';
  const KEEP_ID = 'pp-slide-import-keep';
  const FORMAT_ID = 'pp-slide-import-format';
  const LAYERED = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';

  let panel = null;                // le volet (<aside>), créé à la première ouverture
  let field = null;                // le choix de la source : son libellé et son <select>, que la liste avec recherche remplace à l'écran
  let select = null;
  let hint = null;                 // « Un clic sur une diapositive l'importe après la diapositive 3. », ou la raison du grisé
  let empty = null;                // « Aucun autre modèle à importer. »
  let keep = null;                 // la case « Garder liée » : { row (son <label>), box (la case), label (son texte) }
  let format = null;               // la case « Garder la mise en forme d'origine » (en texte et pour une page de document) : { row, box, label }
  let keepLinked = false;          // ce que la personne a coché pour une diapositive, le temps de la page
  let linkText = false;            // en texte : ce qu'elle a coché (« Garder liée »), le temps du volet : un texte lié ne s'écrit plus, la case ne reste pas cochée d'une ouverture à l'autre
  let keepFormat = false;          // en texte : ce qu'elle a coché (« Garder la mise en forme d'origine »), le temps du volet
  let titleLabel = null;           // le titre du volet, libellé du choix de la source
  let mode = 'slides';             // 'slides' : le volet « Importer » de la bande, dans une présentation ; 'text' : le volet d'un document, qui insère une diapositive en texte
  const remembered = { slides: null, text: null };   // la source de chacun des deux usages du volet, que `sourceId` porte quand il est ouvert
  let linking = false;             // un import lié en cours (la source se relit et s'écrit) : les clics suivants attendent qu'il ait fini
  let list = null;                 // les miniatures de la source
  let opener = null;               // le bouton qui l'a ouvert : Échap lui rend le clavier
  let open = false;
  let sourceId = null;             // la présentation choisie, gardée d'une ouverture à l'autre
  let source = null;               // ce qui en est lu : { id, contenu, doc, slides, kind, marks } (`slides` : les blocs de premier niveau de chacune, dans le document inerte `doc` ; `kind` : 'slides' pour une présentation, 'pages'
                                   // pour un document ; `marks` : le sens que porte le saut de page qui ouvre chaque page, ou null)
  let rows = [];                   // une rangée par diapositive de la source : { item, thumb, page, drawn, near }
  let active = 0;                  // la miniature que Tab atteint
  let sizedFor = '';               // la page à laquelle les miniatures sont taillées (geometryKey())
  let said = null;                 // l'indication écrite et le grisé de la liste, pour ne les écrire que quand ils changent : la bande les redemande à chaque transaction
  let reloadQueued = false;
  let nearObserver = null;         // dit quelles rangées le volet montre, ou presque (DRAW_AHEAD_PX) : elles seules se dessinent
  let resizeObserver = null;
  let stopPaginated = null;
  let stopBar = null;              // se désabonne de la barre de GFS
  let gutter = 0;                  // ce que la barre de GFS mord du volet, en px (la gouttière qu'elle occupe à droite)

  const container = () => document.getElementById('editor-container');
  const nameOf = tpl => String((tpl && tpl.nom) ?? '');
  const inText = () => mode === 'text';
  // Les pages d'un document (volet « Importer » d'une présentation, source choisie parmi les documents).
  const inPages = () => !inText() && !!source && source.kind === 'pages';
  const isDocument = tpl => (tpl.typeModele || 'document') === 'document';
  const isOff = () => (inText() ? !SlidesEntry.isAvailable() : SlideStrip.isOff());
  const hideIcon = button => { const svg = button.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };
  const itemOf = target => (target && target.closest ? target.closest('.pp-slide-item') : null);
  const indexOf = (target) => { const item = itemOf(target); return item ? rows.findIndex(r => r.item === item) : -1; };

  // La page des miniatures : celle de la présentation à l'écran (PageLayout), en pixels CSS, et l'échelle qui la ramène à la largeur d'une miniature (`thumbWidth`, celle du volet
  // sans elle). `key` change avec elle. `index` : la page de la source qu'on dessine (le sens d'une page de document peut changer de l'une à l'autre).
  function geometry(thumbWidth, index = 0) {
    const own = ownPage(index);
    const width = own ? own.width : PageLayout.getSheetWidthPx();
    const height = own ? own.height : PageLayout.getPageSizePx().height;
    const margins = own ? own.margins : PageLayout.getMarginsPx();
    return { width, height, margins, scale: (thumbWidth || THUMB_WIDTH_PX) / width, key: [width, height, margins.top, margins.right, margins.bottom, margins.left].join(' '), own: !!own };
  }
  // Ce qui change la taille des miniatures : la page de chacune.
  const geometryKey = () => rows.map((row, index) => geometry(undefined, index).key).join('|') || geometry().key;
  // La page de la source quand ce n'est pas celle de la présentation à l'écran, en pixels CSS : en texte, celle de la présentation source (le document qui reçoit la diapositive n'a pas la même) ; pour une
  // page de document, celle du document, dans le sens de cette page (un saut de page qui porte un sens tourne la page qu'il ouvre et celles qui suivent, js/page-sections.js).
  function ownPage(index) {
    if (!inText() && !inPages()) return null;
    const tpl = sourceId == null ? null : Templates.byId(sourceId);
    const stored = inPages() ? Object.assign({}, tpl && tpl.marginsMm) : SlidesEntry.pageFor(SlidesEntry.TYPE, tpl ? tpl.marginsMm : null);
    const orientation = inPages() ? senseAt(stored.orientation, index) : stored.orientation;
    const size = PageLayout.pageSizeMmFor(orientation, stored.format || PageLayout.DEFAULT_FORMAT);
    const px = (mm, fallback) => (Number.isFinite(mm) ? mm : fallback) * PageLayout.MM_TO_PX;
    const side = name => px(stored[name], PageLayout.DEFAULT_MARGIN_MM);
    return { width: size.width * PageLayout.MM_TO_PX, height: size.height * PageLayout.MM_TO_PX, margins: { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') } };
  }
  // Le sens de la page `index` d'un document : celui du dernier saut de page qui en porte un, sinon celui du document.
  function senseAt(base, index) {
    let sense = base === PageLayout.LANDSCAPE ? PageLayout.LANDSCAPE : PageLayout.PORTRAIT;
    for (let i = 1; i <= index && source && i < source.marks.length; i++) if (source.marks[i]) sense = source.marks[i];
    return sense;
  }

  // Le volet
  function build() {
    if (panel) return;
    panel = el('aside', 'pp-slide-import');
    panel.hidden = true;
    panel.setAttribute('aria-label', I18n.t('slides.import.label'));
    const head = el('div', 'pp-slide-import-head');
    const close = Dom.button('pp-slide-import-close');
    Dom.setMarkup(close, Icons.svg('closeFind'));
    hideIcon(close);
    close.title = I18n.t('common.close');
    close.setAttribute('aria-label', I18n.t('common.close'));
    close.addEventListener('click', () => closePanel(true));
    // Le titre, « Importer depuis », est le libellé du choix de la source, juste dessous : un clic dessus ouvre la liste.
    titleLabel = el('label', 'pp-slide-import-title', I18n.t('slides.import.source'));
    titleLabel.htmlFor = SOURCE_ID;
    head.append(titleLabel, close);
    field = el('div', 'pp-slide-import-field');
    select = el('select');
    select.id = SOURCE_ID;
    select.addEventListener('change', () => choose(select.value));
    field.appendChild(select);
    empty = el('p', 'pp-slide-import-empty', I18n.t('slides.import.noOther'));
    empty.hidden = true;
    const row = el('label', 'pp-slide-import-keep');
    row.hidden = true;
    const box = el('input');
    box.type = 'checkbox';
    box.id = KEEP_ID;
    box.addEventListener('change', () => { if (inText()) linkText = box.checked; else keepLinked = box.checked; said = null; syncHint(); });
    const label = el('span', null, I18n.t('slides.import.keepLinked'));
    row.append(box, label);
    keep = { row, box, label };
    const formatRow = el('label', 'pp-slide-import-keep');
    formatRow.hidden = true;
    const formatBox = el('input');
    formatBox.type = 'checkbox';
    formatBox.id = FORMAT_ID;
    formatBox.addEventListener('change', () => { keepFormat = formatBox.checked; said = null; syncHint(); });
    const formatLabel = el('span', null, I18n.t('slides.text.keepFormat'));
    formatRow.append(formatBox, formatLabel);
    format = { row: formatRow, box: formatBox, label: formatLabel };
    hint = el('p', 'pp-slide-import-hint');
    hint.id = HINT_ID;
    hint.hidden = true;
    list = el('div', 'pp-slide-import-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-describedby', HINT_ID);
    panel.append(head, field, empty, keep.row, format.row, hint, list);
    document.body.appendChild(panel);
    // La liste avec recherche ; sans elle (une erreur), le <select> natif reste et sert de même.
    try { SearchSelect.attachTemplates(select); } catch (e) { console.warn('[SlideImport] liste avec recherche indisponible, liste native gardée', e); }
    wireList();
    panel.addEventListener('keydown', onPanelKey);
  }

  // Les mots du volet, selon ce qu'il fait (importer une diapositive dans une présentation, ou l'insérer en texte dans un document).
  function applyMode() {
    const text = inText();
    panel.setAttribute('aria-label', I18n.t(text ? 'slides.text.label' : 'slides.import.label'));
    titleLabel.textContent = I18n.t(text ? 'slides.text.source' : 'slides.import.source');
    empty.textContent = I18n.t(text ? 'slides.text.noPresentation' : 'slides.import.noOther');
    said = null;
  }

  // Ouvrir, fermer
  // `from` : le bouton « Importer » ; `byKeyboard` : le clavier va dans le volet (sur la miniature qu'il avait, ou sur le choix de la source), sinon il reste où il est. `asText` : le volet d'un
  // document (la ligne « Diapositive d'une présentation… » du menu), qui insère en texte ; la case y est décochée à chaque ouverture.
  function openPanel(from, byKeyboard, asText) {
    build();
    const next = asText ? 'text' : 'slides';
    if (open && mode !== next) closePanel(false, true);
    if (mode !== next) { remembered[mode] = sourceId; mode = next; sourceId = remembered[next]; }
    if (!open) { keepFormat = false; linkText = false; }
    applyMode();
    opener = asText ? null : (from || opener);
    if (!open) {
      open = true;
      panel.hidden = false;
      document.body.classList.add('pp-slide-import-on');
      if (opener) opener.setAttribute('aria-expanded', 'true');
      observe();
      place();
      // Le document a une marge de plus à droite : la page se réajuste à la largeur qui reste, et sa pagination se refait.
      SlidesEntry.relayout();
    }
    reload();
    if (byKeyboard) focusInside();
  }
  // `returnFocus` : le clavier revient au bouton « Importer », comme quand il était dans le volet qui se ferme. `quiet` : la bande se cache, et refait elle-même la page.
  function closePanel(returnFocus, quiet) {
    if (!open) return;
    const hadFocus = panel.contains(document.activeElement);
    open = false;
    panel.hidden = true;
    document.body.classList.remove('pp-slide-import-on');
    document.body.style.removeProperty('--pp-slide-import-bar');
    gutter = 0;
    if (opener) opener.setAttribute('aria-expanded', 'false');
    unobserve();
    clearRows();
    source = null;
    said = null;
    const wasText = inText();
    remembered[mode] = sourceId;
    mode = 'slides';
    sourceId = remembered.slides;
    if (!quiet) SlidesEntry.relayout();
    if (!(returnFocus || hadFocus)) return;
    // Le clavier revient au bouton « Importer » ; en texte, au document.
    if (wasText) { const editor = EditorCore.getEditor(); if (editor && !editor.isDestroyed) editor.commands.focus(); } else if (opener && opener.isConnected) opener.focus();
  }
  function toggle(from, byKeyboard) {
    if (open) closePanel(byKeyboard); else openPanel(from, byKeyboard);
  }
  // Le volet d'un document (js/slides-entry.js : registerTextImport). `screen` : ce que l'écran montre ({ type, editing }) ; le volet se ferme dès que l'écran n'est plus un document en Édition.
  function openText(byKeyboard) { openPanel(null, byKeyboard, true); }
  function syncScreen(screen) {
    if (!open || !inText()) return;
    if (screen.type === 'document' && screen.editing) sync(true); else closePanel(false);
  }
  function focusInside() {
    if (rows.length) rows[active].item.focus();
    else if (!field.hidden) select.focus();
    else panel.querySelector('.pp-slide-import-close').focus();
  }

  // Ce que montre le volet, relu à chaque ouverture et quand l'écran change (une autre présentation à l'écran, l'extension allumée ou éteinte) : les sources possibles, la source
  // (relue si son HTML a changé), ses miniatures et l'indication.
  function reload() {
    fillSources();
    readSource();
    syncRows();
    syncHint();
  }
  // Rappelé par la bande : à chaque changement de son texte ou de son curseur, l'indication (`full` faux) ; quand l'écran change (`full`), tout ce que montre le volet, une fois
  // l'ouverture en cours finie : js/main.js montre la bande d'une présentation qui s'ouvre avant d'en faire le modèle courant (Templates.isCurrent), que la liste des sources écarte.
  function sync(full) {
    if (!open) return;
    if (!full) { syncHint(); return; }
    if (reloadQueued) return;
    reloadQueued = true;
    queueMicrotask(() => { reloadQueued = false; if (open) reload(); });
  }

  // Les sources possibles, par nom : dans une présentation, les autres présentations du document et ses documents (leurs pages deviennent des diapositives) ; dans un document, toutes les présentations.
  // La source choisie le reste tant qu'elle est là et qu'elle n'est pas celle à l'écran ; sinon le choix revient à « — Choisir une présentation ou un document — ».
  function fillSources() {
    const lang = I18n.getLang() === 'en' ? 'en' : 'fr';
    const found = Templates.getCached().filter(tpl => (tpl.typeModele === SlidesEntry.TYPE ? (inText() || !Templates.isCurrent(tpl.id)) : !inText() && isDocument(tpl)))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), lang, { numeric: true, sensitivity: 'base' }));
    if (!found.some(tpl => String(tpl.id) === String(sourceId))) sourceId = null;
    const placeholder = Dom.option('', I18n.t(inText() ? 'slides.import.choose' : 'slides.page.choose'));
    placeholder.disabled = true;
    select.replaceChildren(placeholder, ...found.map(tpl => Dom.option(String(tpl.id), nameOf(tpl))));
    select.value = sourceId == null ? '' : String(sourceId);
    SearchSelect.sync(select);
    field.hidden = !found.length;
    empty.hidden = found.length > 0;
  }
  function choose(value) {
    const tpl = value ? Templates.getCached().find(t => String(t.id) === value) : null;
    sourceId = tpl ? tpl.id : null;
    readSource();
    syncRows();
    syncHint();
  }

  // La source, lue de son HTML enregistré (le cache des modèles, js/templates.js), une fois tant qu'il ne change pas : assainie et inerte (HtmlSanitize.parseInert), puis coupée à ses sauts
  // de page de premier niveau, comme la bande coupe le texte de l'éditeur (une présentation qui finit sur un saut de page finit sur une diapositive vide). Les miniatures et l'import en
  // prennent des copies, qu'aucun HTML réécrit ne remplace à l'affichage.
  function readSource() {
    const tpl = sourceId == null ? null : Templates.byId(sourceId);
    if (!tpl) { source = null; clearRows(); return; }
    const contenu = String(tpl.contenu || '');
    // Le même texte relu par le cache est une autre chaîne : gardée, la comparaison suivante est immédiate.
    if (source && String(source.id) === String(tpl.id) && source.contenu === contenu) { source.contenu = contenu; return; }
    const body = HtmlSanitize.parseInert(contenu);
    const slides = [[]];
    const marks = [null];
    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('page-break-marker')) { slides.push([]); marks.push(PageSections.senseOf(node)); return; }
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) return;
      slides[slides.length - 1].push(node);
    });
    source = { id: tpl.id, contenu, doc: body.ownerDocument, slides, marks, kind: tpl.typeModele === SlidesEntry.TYPE ? 'slides' : 'pages' };
    clearRows();
  }
  // Une copie des blocs de la diapositive `index`, dans le document inerte de la source, sans ce qui appartient à la source : ses images répétées sur toutes les pages (le fond de ses
  // pages) et ses commentaires (leurs fils vivent dans sa table), comme la copie d'un Ctrl+C (slide-strip.js:slideForClipboard).
  function cleanCopy(index) {
    const holder = source.doc.createElement('div');
    source.slides[index].forEach(node => holder.appendChild(node.cloneNode(true)));
    holder.querySelectorAll('img').forEach((img) => { if (PageLayer.isRepeatedEl(img)) img.remove(); });
    holder.querySelectorAll('span.comment-mark').forEach(span => span.replaceWith(...span.childNodes));
    holder.querySelectorAll('div.' + SlideLinks.CLASS).forEach(tag => tag.remove());
    return holder;
  }

  // Les miniatures
  // Une rangée par diapositive de la source, taillée à la page ; ses miniatures se dessinent quand la liste les montre (onNear), toutes d'un coup sans observateur (navigateur ancien).
  function syncRows() {
    if (!source) { list.removeAttribute('aria-label'); return; }
    list.setAttribute('aria-label', I18n.t(inPages() ? 'slides.page.list' : 'slides.import.list', { name: nameOf(Templates.byId(source.id)) }));
    if (!rows.length) {
      const total = source.slides.length;
      rows = source.slides.map((nodes, index) => makeRow(index, total));
      list.append(...rows.map(r => r.item));
      list.scrollTop = 0;
      sizedFor = '';
      setActive(0, false);
    }
    const key = geometryKey();
    if (sizedFor !== key) {
      sizedFor = key;
      rows.forEach((r, index) => { size(r, geometry(undefined, index)); r.drawn = false; });
    }
    draw();
  }
  function makeRow(index, total) {
    const item = el('div', 'pp-slide-item');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-label', I18n.t(inPages() ? 'slides.page.item' : 'slides.strip.item', { n: index + 1, total }));
    item.tabIndex = -1;
    const side = el('div', 'pp-slide-side');
    side.setAttribute('aria-hidden', 'true');
    side.appendChild(el('span', 'pp-slide-num', String(index + 1)));
    const thumb = el('div', 'pp-slide-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    const page = el('div', 'pp-slide-page tiptap');
    page.inert = true;
    thumb.appendChild(page);
    item.append(side, thumb);
    if (nearObserver) nearObserver.observe(item);
    return { item, thumb, page, drawn: false, near: !nearObserver };
  }
  function clearRows() {
    rows.forEach((r) => { if (nearObserver) nearObserver.unobserve(r.item); r.item.remove(); });
    rows = [];
    active = 0;
  }
  function size(r, g) {
    r.thumb.style.height = Math.round(g.height * g.scale) + 'px';
    r.page.style.width = g.width + 'px';
    r.page.style.height = g.height + 'px';
    r.page.style.transform = 'scale(' + g.scale + ')';
    // La page d'une présentation vue d'un document : ses marges et sa taille, que les cadres libres et le fond lisent (css/free-frame.css), sont les siennes, pas celles du document.
    if (!g.own) return;
    ['top', 'right', 'bottom', 'left'].forEach(side => r.page.style.setProperty('--pp-margin-' + side, g.margins[side] + 'px'));
    r.page.style.setProperty('--pp-page-width', g.width + 'px');
    r.page.style.setProperty('--pp-page-height', g.height + 'px');
  }
  // La miniature de `html` (une diapositive, déjà sans ce qui n'appartient qu'à sa présentation) dans `host`, large de `width` pixels, dessinée comme celles du volet : la fenêtre
  // « Demander » des diapositives liées (slide-links-ui.js) y montre ses deux versions. `host` doit être affiché : la place des images en calque se lit sur la page.
  function paint(host, html, width) {
    const g = geometry(width);
    const thumb = el('div', 'pp-slide-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    thumb.style.width = width + 'px';
    const page = el('div', 'pp-slide-page tiptap');
    page.inert = true;
    thumb.appendChild(page);
    size({ thumb, page }, g);
    const body = HtmlSanitize.parseInert(html);
    ExternalImages.blockIn(body, { zoom: g.scale });
    page.replaceChildren(...body.childNodes);
    host.replaceChildren(thumb);
    placeLayers(layersOf(page), g);
  }
  // Dessine les miniatures que la liste montre, ou presque, et qui ne le sont pas encore : toutes les copies d'abord, puis toutes les lectures de la mise en page, puis toutes les
  // places des images en calque (le navigateur ne refait sa mise en page qu'une fois). Une image d'un autre site y montre son cadre « Afficher » (js/external-images.js).
  function draw() {
    if (!open || !source) return;
    const due = rows.filter(r => r.near && !r.drawn);
    if (!due.length) return;
    due.forEach((r) => {
      const index = rows.indexOf(r);
      const copy = cleanCopy(index);
      ExternalImages.blockIn(copy, { zoom: geometry(undefined, index).scale });
      r.page.replaceChildren(...copy.childNodes);
      r.drawn = true;
    });
    due.map(r => ({ layers: layersOf(r.page), g: geometry(undefined, rows.indexOf(r)) })).forEach(({ layers, g }) => placeLayers(layers, g));
  }
  // Les images en calque d'une miniature qui ont leur grille (page, gauche et haut sur cette page), et si chacune est posée sur la page même (`flat` : pas dans un bloc qui la place
  // lui-même).
  function layersOf(page) {
    return Array.from(page.querySelectorAll(LAYERED)).map(img => ({ img, grid: PageLayer.gridOfEl(img) })).filter(layer => layer.grid)
      .map(layer => Object.assign(layer, { flat: layer.img.offsetParent === page }));
  }
  // Une image en calque enregistrée se place par son `top`, compté depuis le haut du texte entier de sa présentation : dans la miniature, posée sur la page même, elle reprend sa place
  // sur sa page, celle de sa grille (comme dans la bande, slide-strip.js:placeLayers), la page de la miniature étant la première de la diapositive, celle de ses images en calque
  // (la plus petite) ; une image d'une page suivante (une diapositive qui dépasse) tombe sous la miniature, avec le reste de cette page.
  function placeLayers(layers, g) {
    if (!layers.length) return;
    const first = Math.min(...layers.map(layer => layer.grid.pageIndex));
    layers.forEach(({ img, grid, flat }) => {
      if (!flat) return;
      img.style.left = (g.margins.left + grid.leftPt * PT_TO_PX) + 'px';
      img.style.top = (g.margins.top + grid.topPt * PT_TO_PX + (grid.pageIndex - first) * g.height) + 'px';
    });
  }
  // Les rangées qui entrent dans le volet, ou presque, se dessinent.
  function onNear(entries) {
    let arrived = false;
    entries.forEach((entry) => {
      const r = rows.find(candidate => candidate.item === entry.target);
      if (!r) return;
      if (entry.isIntersecting && !r.near) arrived = true;
      r.near = entry.isIntersecting;
    });
    if (arrived) draw();
  }
  // Après chaque pagination : la page a pu changer (format, sens, marges), et les miniatures avec elle.
  function onPaginated() {
    if (open && rows.length && geometryKey() !== sizedFor) syncRows();
  }

  // L'indication sous le choix de la source : après quelle diapositive l'import se pose (celle du curseur), ou pourquoi il est grisé.
  // La case « Garder liée » se montre avec la source, grisée avec sa raison quand un lien ne peut pas se poser (l'import est alors une copie : la case s'y montre décochée).
  function syncHint() {
    if (inText()) { syncTextHint(); return; }
    if (inPages()) { syncPageHint(); return; }
    const off = isOff();
    const reason = SlideLinks.blockedReason();
    const blocked = off ? SlidesEntry.reason() : (reason ? I18n.t(reason) : '');
    const linked = keepLinked && !blocked;
    const text = !source ? '' : off ? SlidesEntry.reason() : I18n.t(linked ? 'slides.import.hintLinked' : 'slides.import.hint', { n: SlideStrip.current() + 1 });
    const state = text + '|' + off + '|' + blocked + '|' + keepLinked;
    if (state === said) return;
    said = state;
    hint.textContent = text;
    hint.hidden = !text;
    list.setAttribute('aria-disabled', off ? 'true' : 'false');
    keep.row.hidden = !source;
    keep.box.checked = linked;
    keep.box.disabled = !!blocked;
    keep.row.classList.toggle('pp-slide-import-keep-off', !!blocked);
    keep.row.title = blocked || I18n.t('slides.import.keepLinkedTip');
    format.row.hidden = true;
  }
  // En texte : l'indication dit où la diapositive arrive, ou pourquoi le volet est grisé ; les cases « Garder liée » (grisée avec sa raison quand un lien ne peut pas se poser : la case s'y montre
  // décochée) et « Garder la mise en forme d'origine » se montrent avec la source.
  function syncTextHint() {
    const off = isOff();
    const reason = SlideLinks.blockedReason();
    const blocked = off ? SlidesEntry.reason() : (reason ? I18n.t(reason) : '');
    const linked = linkText && !blocked;
    const hintKey = linked ? (keepFormat ? 'slides.copy.hintLinkedKeep' : 'slides.copy.hintLinked') : (keepFormat ? 'slides.text.hintKeep' : 'slides.text.hint');
    const text = !source ? '' : off ? SlidesEntry.reason() : I18n.t(hintKey);
    const state = 'text|' + text + '|' + off + '|' + blocked + '|' + linkText + '|' + keepFormat;
    if (state === said) return;
    said = state;
    hint.textContent = text;
    hint.hidden = !text;
    list.setAttribute('aria-disabled', off ? 'true' : 'false');
    keep.row.hidden = !source;
    keep.box.checked = linked;
    keep.box.disabled = !!blocked;
    keep.row.classList.toggle('pp-slide-import-keep-off', !!blocked);
    keep.row.title = blocked || I18n.t('slides.copy.keepLinkedTip');
    format.row.hidden = !source;
    format.box.checked = keepFormat;
    format.box.disabled = off;
    format.row.classList.toggle('pp-slide-import-keep-off', off);
    format.row.title = off ? SlidesEntry.reason() : I18n.t('slides.text.keepFormatTip');
  }
  // Une page de document : l'indication dit où les diapositives arrivent, ou pourquoi le volet est grisé ; la case « Garder la mise en forme d'origine » se montre avec la source, sans « Garder liée »
  // (le lien d'une page de document est le lot suivant).
  function syncPageHint() {
    const off = isOff();
    const text = !source ? '' : off ? SlidesEntry.reason() : I18n.t(keepFormat ? 'slides.page.hintKeep' : 'slides.page.hint', { n: SlideStrip.current() + 1 });
    const state = 'page|' + text + '|' + off + '|' + keepFormat;
    if (state === said) return;
    said = state;
    hint.textContent = text;
    hint.hidden = !text;
    list.setAttribute('aria-disabled', off ? 'true' : 'false');
    keep.row.hidden = true;
    format.row.hidden = !source;
    format.box.checked = keepFormat;
    format.box.disabled = off;
    format.row.classList.toggle('pp-slide-import-keep-off', off);
    format.row.title = off ? SlidesEntry.reason() : I18n.t('slides.page.keepFormatTip');
  }
  // La miniature que Tab atteint (la liste est un seul arrêt de Tab) ; `focus` : le clavier y va.
  function setActive(index, focus) {
    if (!rows.length) return;
    active = Math.max(0, Math.min(index, rows.length - 1));
    rows.forEach((r, i) => {
      r.item.tabIndex = i === active ? 0 : -1;
      r.item.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
    if (focus) rows[active].item.focus();
  }

  // Importer
  // La diapositive `index` de la source, après celle du curseur (SlideStrip.importAfterCurrent) ; le coin d'état le dit. Une diapositive vide arrive comme « Ajouter » en pose une.
  // Grisé (l'extension éteinte), il explique.
  function importSlide(index) {
    if (!source || !source.slides[index] || linking) return;
    if (isOff()) { SlidesEntry.explainOff(); return; }
    if (inText()) { if (linkText && !SlideLinks.blockedReason()) insertLinkedText(index); else insertText(index); return; }
    if (inPages()) { importPage(index); return; }
    if (keepLinked && !SlideLinks.blockedReason()) { importLinked(index); return; }
    const markup = cleanCopy(index).innerHTML;
    if (!SlideStrip.importAfterCurrent(markup.trim() ? markup : '<p></p>')) return;
    SlidesEntry.status(I18n.t('slides.import.done', { n: index + 1, name: nameOf(Templates.byId(source.id)) }));
    setActive(index, list.contains(document.activeElement));
  }
  // « En texte » : la diapositive `index` de la source devient du texte du document, à l'endroit du curseur (js/slide-text.js), par le collage de l'éditeur (EditorView.pasteHTML : ses nettoyages, ses
  // images) et dans un pas d'annulation à lui, que l'historique ne joint pas à la frappe d'avant ; le curseur reste après le texte inséré, si bien que les insertions se suivent. Le coin d'état dit ce
  // qui n'est pas entré. Une diapositive vide n'insère rien.
  function insertText(index) {
    const editor = EditorCore.getEditor();
    if (!editor || editor.isDestroyed || !editor.isEditable) return;
    const name = nameOf(Templates.byId(source.id));
    if (HeaderFooterPreview.getHfMode()) { SlidesEntry.status(I18n.t('slides.text.notHere'), true); return; }
    const copy = cleanCopy(index);
    const result = SlideText.toDocument(copy, { keepFormat });
    const byKeyboard = list.contains(document.activeElement);
    setActive(index, byKeyboard);
    if (result.blank) { SlidesEntry.status(I18n.t('slides.text.empty', { n: index + 1, name })); return; }
    const { view } = editor;
    view.dispatch(view.state.tr.setMeta('closeHistory$', true));
    view.pasteHTML(copy.innerHTML);
    SlideText.leaveBlockAtEnd(view);
    // À la souris, le clavier revient dans le texte, là où le curseur s'est posé (après la diapositive) ; au clavier, il reste sur la miniature, pour la suivante.
    if (!byKeyboard) editor.commands.focus();
    const said = I18n.t('slides.text.done', { n: index + 1, name });
    const dropped = SlideText.report(result.dropped);
    SlidesEntry.status(dropped ? said + ' ' + dropped : said);
  }
  // « En texte », « Garder liée » : la source relue reçoit le repère de la diapositive (SlideLinks.anchorSource), puis le texte arrive à l'endroit du curseur avec le sien, lié (js/slide-copies.js), en
  // un seul pas d'annulation. Pendant ce temps, le document à l'écran ne doit pas changer. Ce qui empêche le lien se dit sur la ligne d'état, et rien n'est inséré ; une source changée depuis que le
  // volet l'a lue se relit, pour que la personne choisisse de nouveau. Une diapositive déjà liée à ce document, ou vide, arrive comme sans la case (une vide n'écrit rien dans sa source).
  async function insertLinkedText(index) {
    const editor = EditorCore.getEditor();
    if (!editor || editor.isDestroyed || !editor.isEditable) return;
    const id = source.id;
    const name = nameOf(Templates.byId(id));
    if (HeaderFooterPreview.getHfMode()) { SlidesEntry.status(I18n.t('slides.text.notHere'), true); return; }
    if (SlideText.toDocument(cleanCopy(index), { keepFormat }).blank) { insertText(index); return; }
    const here = Templates.getCurrentId();
    const byKeyboard = list.contains(document.activeElement);
    linking = true;
    SlidesEntry.status(I18n.t('slides.link.linking', { name }));
    try {
      const { html, link } = await SlideLinks.anchorSource(editor, id, index, source.contenu);
      if (!open || EditorCore.getEditor() !== editor || String(Templates.getCurrentId()) !== String(here) || !source || String(source.id) !== String(id)) return;
      if (isOff()) { SlidesEntry.explainOff(); return; }
      if (SlideCopies.linkedFrom(editor, id).has(link.linkSlide)) {
        insertText(index);
        SlidesEntry.status(I18n.t('slides.link.already', { n: index + 1, name }));
        return;
      }
      const result = SlideCopies.insert(editor, { html, link, keepFormat });
      setActive(index, byKeyboard);
      if (result.blank) { SlidesEntry.status(I18n.t('slides.text.empty', { n: index + 1, name })); return; }
      // À la souris, le clavier revient dans le texte, là où le curseur s'est posé (après la copie) ; au clavier, il reste sur la miniature, pour la suivante.
      if (!byKeyboard) editor.commands.focus();
      const said = I18n.t('slides.copy.done', { n: index + 1, name });
      const dropped = SlideText.report(result.dropped);
      SlidesEntry.status(dropped ? said + ' ' + dropped : said);
    } catch (error) {
      if (!error || !error.reason) console.warn('[SlideImport] copie liée en échec', error);
      SlidesEntry.status(I18n.t((error && error.reason) || 'slides.link.failed', { name }), true);
      if (error && (error.reason === 'slides.link.changed' || error.reason === 'slides.link.gone') && open) reload();
    } finally {
      linking = false;
    }
  }
  // Une page de document en diapositives (extensions/diapositives/page-slides.js) : leurs tailles sont celles d'une diapositive, sauf la case « Garder la mise en forme d'origine » ; une page trop longue en
  // fait plusieurs, que le coin d'état compte. Elles arrivent après la diapositive du curseur d'un seul Ctrl+Z, et le curseur se pose sur la dernière : la page suivante viendra après elle. Une page vide
  // n'ajoute rien.
  function importPage(index) {
    const name = nameOf(Templates.byId(source.id));
    const result = PageSlides.fromPage(cleanCopy(index), { keepFormat });
    setActive(index, list.contains(document.activeElement));
    if (result.blank) { SlidesEntry.status(I18n.t('slides.page.empty', { n: index + 1, name })); return; }
    if (!SlideStrip.importAfterCurrent(result.html, null, 'last')) return;
    SlidesEntry.status(I18n.t('slides.page.done', { n: index + 1, name, slides: result.slides }));
  }
  // « Garder liée » : la source relue reçoit le repère de la diapositive (SlideLinks.anchorSource), puis la diapositive arrive après celle du curseur avec le sien. Pendant ce temps, la
  // présentation à l'écran ne doit pas changer : une autre ouverte entre-temps ne reçoit rien. Ce qui empêche le lien se dit sur la ligne d'état, et rien n'est importé ; une source
  // changée depuis que le volet l'a lue se relit, pour que la personne choisisse de nouveau.
  async function importLinked(index) {
    const editor = EditorCore.getEditor();
    const id = source.id;
    const name = nameOf(Templates.byId(id));
    const here = Templates.getCurrentId();
    linking = true;
    SlidesEntry.status(I18n.t('slides.link.linking', { name }));
    try {
      const { html, link } = await SlideLinks.anchorSource(editor, id, index, source.contenu);
      if (!open || EditorCore.getEditor() !== editor || String(Templates.getCurrentId()) !== String(here) || !source || String(source.id) !== String(id)) return;
      if (isOff()) { SlidesEntry.explainOff(); return; }
      // Un lien par diapositive source et par présentation : déjà liée ici, elle arrive en copie.
      const already = SlideLinks.linkedFrom(editor, id).has(link.linkSlide);
      if (!SlideStrip.importAfterCurrent(html.trim() ? html : '<p></p>', already ? null : link)) return;
      SlidesEntry.status(I18n.t(already ? 'slides.link.already' : 'slides.link.done', { n: index + 1, name }));
      setActive(index, list.contains(document.activeElement));
    } catch (error) {
      if (!error || !error.reason) console.warn('[SlideImport] import lié en échec', error);
      SlidesEntry.status(I18n.t((error && error.reason) || 'slides.link.failed', { name }), true);
      if (error && (error.reason === 'slides.link.changed' || error.reason === 'slides.link.gone') && open) reload();
    } finally {
      linking = false;
    }
  }
  // Ctrl+Z et Ctrl+Y dans le volet défont et refont dans le document (un import, un geste), sans y emmener le clavier.
  function undoRedo(which) {
    const editor = EditorCore.getEditor();
    const command = editor && editor.commands[which];
    if (typeof command === 'function') command();
  }

  // La souris et le clavier
  function wireList() {
    // Ni focus ni sélection de texte à l'appui : le clavier reste où il est. Le second clic d'un double-clic (detail 2) n'importe pas une seconde fois.
    list.addEventListener('mousedown', (event) => { if (itemOf(event.target)) event.preventDefault(); });
    list.addEventListener('click', (event) => {
      const index = indexOf(event.target);
      if (index < 0 || event.detail > 1) return;
      importSlide(index);
    });
    list.addEventListener('keydown', onListKey);
  }
  function onListKey(event) {
    const index = indexOf(event.target);
    if (index < 0 || event.target !== rows[index].item) return;
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && /^[zy]$/i.test(key)) { event.preventDefault(); undoRedo(key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
    if (mod || event.altKey) return;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      event.preventDefault();
      setActive(key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : index + (key === 'ArrowUp' ? -1 : 1), true);
    } else if (key === 'Enter' || key === ' ') {
      // Une touche tenue enfoncée n'importe qu'une fois.
      event.preventDefault();
      if (!event.repeat) importSlide(index);
    }
  }
  // Échap ferme le volet ; la liste avec recherche ouverte se ferme d'abord seule (elle arrête son Échap).
  function onPanelKey(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    closePanel(true);
  }

  // La page
  // Le volet couvre la marge droite du document, sur sa hauteur visible, à gauche de sa barre de défilement, moins ce que la barre de GFS en mord. Sa largeur de base est celle de la
  // variable CSS (`--pp-slide-import-width`) : la barre n'y entre pas, le calcul part toujours du volet sans elle.
  function place() {
    const box = container();
    if (!open || !box) return;
    const rect = box.getBoundingClientRect();
    const top = rect.top + box.clientTop;
    const right = rect.left + box.clientLeft + box.clientWidth;
    const width = parseFloat(getComputedStyle(document.body).getPropertyValue('--pp-slide-import-width')) || panel.offsetWidth;
    const bite = GfsBar.bite({ left: right - width, top, right, bottom: top + box.clientHeight });
    gutter = Math.max(0, Math.ceil(bite.right));
    document.body.style.setProperty('--pp-slide-import-bar', gutter + 'px');
    panel.style.top = (top + bite.top) + 'px';
    panel.style.height = Math.max(0, box.clientHeight - bite.top - bite.bottom) + 'px';
    panel.style.left = (right - width - gutter) + 'px';
  }
  // La barre de GFS arrive, part ou change de bord : le volet se replace et, si la gouttière a changé, la page se réajuste à la largeur qui reste. Pendant le diaporama GFS masque sa
  // barre pour lui : le volet ne bouge pas.
  function onBar() {
    if (typeof SlideShow !== 'undefined' && SlideShow.isRunning()) return;
    const before = gutter;
    place();
    if (gutter !== before) SlidesEntry.relayout();
  }
  function observe() {
    window.addEventListener('resize', place);
    stopBar = GfsBar.onChange(onBar);
    if (typeof ResizeObserver === 'function' && container()) {
      resizeObserver = new ResizeObserver(place);
      resizeObserver.observe(container());
    }
    if (typeof IntersectionObserver === 'function') nearObserver = new IntersectionObserver(onNear, { root: list, rootMargin: DRAW_AHEAD_PX + 'px 0px' });
    stopPaginated = HeaderFooterPreview.onPaginated(onPaginated);
  }
  function unobserve() {
    window.removeEventListener('resize', place);
    if (stopBar) { stopBar(); stopBar = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
    if (stopPaginated) { stopPaginated(); stopPaginated = null; }
  }

  SlidesEntry.registerTextImport({ open: openText, close: closePanel, isOpen: () => open && inText(), syncScreen, keepsFormat: () => open && inText() && keepFormat });

  // `keepsFormat` : le volet ouvert sur un document garde les tailles du document (le Ctrl+V d'une sélection de document sur la bande, slide-strip.js, suit la case).
  return { open: openPanel, close: closePanel, toggle, isOpen: () => open, sync, paint, keepsFormat: () => open && inPages() && keepFormat };
})();
