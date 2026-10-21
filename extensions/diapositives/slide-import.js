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
//  - L'extension éteinte par GFS, volet ouvert : ses miniatures restent, grisées, l'indication dit pourquoi et leur clic explique (SlidesEntry.explainOff), comme les gestes de la bande.
// Styles : extensions/diapositives/slide-import.css (dont la place que le volet prend à droite du document, `body.pp-slide-import-on`).
const SlideImport = (function () {
  const el = Dom.el;
  const THUMB_WIDTH_PX = 140;      // la largeur d'une miniature (celle de slide-import.css) ; sa hauteur suit la page
  const DRAW_AHEAD_PX = 300;       // au-delà de ce que la liste montre, la hauteur de miniatures dessinées, au-dessus et au-dessous
  const PT_TO_PX = PageLayout.MM_TO_PX / PageLayout.MM_TO_PT;
  const SOURCE_ID = 'pp-slide-import-source';
  const HINT_ID = 'pp-slide-import-hint';
  const LAYERED = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';

  let panel = null;                // le volet (<aside>), créé à la première ouverture
  let field = null;                // le choix de la source : son libellé et son <select>, que la liste avec recherche remplace à l'écran
  let select = null;
  let hint = null;                 // « Un clic sur une diapositive l'importe après la diapositive 3. », ou la raison du grisé
  let empty = null;                // « Aucune autre présentation dans ce document. »
  let list = null;                 // les miniatures de la source
  let opener = null;               // le bouton qui l'a ouvert : Échap lui rend le clavier
  let open = false;
  let sourceId = null;             // la présentation choisie, gardée d'une ouverture à l'autre
  let source = null;               // ce qui en est lu : { id, contenu, doc, slides } (`slides` : les blocs de premier niveau de chacune, dans le document inerte `doc`)
  let rows = [];                   // une rangée par diapositive de la source : { item, thumb, page, drawn, near }
  let active = 0;                  // la miniature que Tab atteint
  let sizedFor = '';               // la page à laquelle les miniatures sont taillées (geometry().key)
  let said = null;                 // l'indication écrite et le grisé de la liste, pour ne les écrire que quand ils changent : la bande les redemande à chaque transaction
  let reloadQueued = false;
  let nearObserver = null;         // dit quelles rangées le volet montre, ou presque (DRAW_AHEAD_PX) : elles seules se dessinent
  let resizeObserver = null;
  let stopPaginated = null;

  const container = () => document.getElementById('editor-container');
  const nameOf = tpl => String((tpl && tpl.nom) ?? '');
  const isOff = () => SlideStrip.isOff();
  const hideIcon = button => { const svg = button.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };
  const itemOf = target => (target && target.closest ? target.closest('.pp-slide-item') : null);
  const indexOf = (target) => { const item = itemOf(target); return item ? rows.findIndex(r => r.item === item) : -1; };

  // La page des miniatures : celle de la présentation à l'écran (PageLayout), en pixels CSS, et l'échelle qui la ramène à la largeur d'une miniature. `key` change avec elle.
  function geometry() {
    const width = PageLayout.getSheetWidthPx();
    const height = PageLayout.getPageSizePx().height;
    const margins = PageLayout.getMarginsPx();
    return { width, height, margins, scale: THUMB_WIDTH_PX / width, key: [width, height, margins.top, margins.right, margins.bottom, margins.left].join(' ') };
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
    const title = el('label', 'pp-slide-import-title', I18n.t('slides.import.source'));
    title.htmlFor = SOURCE_ID;
    head.append(title, close);
    field = el('div', 'pp-slide-import-field');
    select = el('select');
    select.id = SOURCE_ID;
    select.addEventListener('change', () => choose(select.value));
    field.appendChild(select);
    empty = el('p', 'pp-slide-import-empty', I18n.t('slides.import.noOther'));
    empty.hidden = true;
    hint = el('p', 'pp-slide-import-hint');
    hint.id = HINT_ID;
    hint.hidden = true;
    list = el('div', 'pp-slide-import-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-describedby', HINT_ID);
    panel.append(head, field, empty, hint, list);
    document.body.appendChild(panel);
    // La liste avec recherche ; sans elle (une erreur), le <select> natif reste et sert de même.
    try { SearchSelect.attachTemplates(select); } catch (e) { console.warn('[SlideImport] liste avec recherche indisponible, liste native gardée', e); }
    wireList();
    panel.addEventListener('keydown', onPanelKey);
  }

  // Ouvrir, fermer
  // `from` : le bouton « Importer » ; `byKeyboard` : le clavier va dans le volet (sur la miniature qu'il avait, ou sur le choix de la source), sinon il reste où il est.
  function openPanel(from, byKeyboard) {
    build();
    if (from) opener = from;
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
    if (opener) opener.setAttribute('aria-expanded', 'false');
    unobserve();
    clearRows();
    source = null;
    said = null;
    if (!quiet) SlidesEntry.relayout();
    if ((returnFocus || hadFocus) && opener && opener.isConnected) opener.focus();
  }
  function toggle(from, byKeyboard) {
    if (open) closePanel(byKeyboard); else openPanel(from, byKeyboard);
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

  // Les autres présentations du document, par nom. La source choisie le reste tant qu'elle est là et qu'elle n'est pas celle à l'écran ; sinon le choix revient à « — Choisir une
  // présentation — ».
  function fillSources() {
    const lang = I18n.getLang() === 'en' ? 'en' : 'fr';
    const found = Templates.getCached().filter(tpl => tpl.typeModele === SlidesEntry.TYPE && !Templates.isCurrent(tpl.id))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), lang, { numeric: true, sensitivity: 'base' }));
    if (!found.some(tpl => String(tpl.id) === String(sourceId))) sourceId = null;
    const placeholder = Dom.option('', I18n.t('slides.import.choose'));
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
    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('page-break-marker')) { slides.push([]); return; }
      if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) return;
      slides[slides.length - 1].push(node);
    });
    source = { id: tpl.id, contenu, doc: body.ownerDocument, slides };
    clearRows();
  }
  // Une copie des blocs de la diapositive `index`, dans le document inerte de la source, sans ce qui appartient à la source : ses images répétées sur toutes les pages (le fond de ses
  // pages) et ses commentaires (leurs fils vivent dans sa table), comme la copie d'un Ctrl+C (slide-strip.js:slideForClipboard).
  function cleanCopy(index) {
    const holder = source.doc.createElement('div');
    source.slides[index].forEach(node => holder.appendChild(node.cloneNode(true)));
    holder.querySelectorAll('img').forEach((img) => { if (PageLayer.isRepeatedEl(img)) img.remove(); });
    holder.querySelectorAll('span.comment-mark').forEach(span => span.replaceWith(...span.childNodes));
    return holder;
  }

  // Les miniatures
  // Une rangée par diapositive de la source, taillée à la page ; ses miniatures se dessinent quand la liste les montre (onNear), toutes d'un coup sans observateur (navigateur ancien).
  function syncRows() {
    if (!source) { list.removeAttribute('aria-label'); return; }
    list.setAttribute('aria-label', I18n.t('slides.import.list', { name: nameOf(Templates.byId(source.id)) }));
    if (!rows.length) {
      const total = source.slides.length;
      rows = source.slides.map((nodes, index) => makeRow(index, total));
      list.append(...rows.map(r => r.item));
      list.scrollTop = 0;
      sizedFor = '';
      setActive(0, false);
    }
    const g = geometry();
    if (sizedFor !== g.key) {
      sizedFor = g.key;
      rows.forEach((r) => { size(r, g); r.drawn = false; });
    }
    draw();
  }
  function makeRow(index, total) {
    const item = el('div', 'pp-slide-item');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-label', I18n.t('slides.strip.item', { n: index + 1, total }));
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
  }
  // Dessine les miniatures que la liste montre, ou presque, et qui ne le sont pas encore : toutes les copies d'abord, puis toutes les lectures de la mise en page, puis toutes les
  // places des images en calque (le navigateur ne refait sa mise en page qu'une fois). Une image d'un autre site y montre son cadre « Afficher » (js/external-images.js).
  function draw() {
    if (!open || !source) return;
    const due = rows.filter(r => r.near && !r.drawn);
    if (!due.length) return;
    const g = geometry();
    due.forEach((r) => {
      const copy = cleanCopy(rows.indexOf(r));
      ExternalImages.blockIn(copy, { zoom: g.scale });
      r.page.replaceChildren(...copy.childNodes);
      r.drawn = true;
    });
    due.map(r => layersOf(r.page)).forEach(layers => placeLayers(layers, g));
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
    if (open && rows.length && geometry().key !== sizedFor) syncRows();
  }

  // L'indication sous le choix de la source : après quelle diapositive l'import se pose (celle du curseur), ou pourquoi il est grisé.
  function syncHint() {
    const off = isOff();
    const text = !source ? '' : off ? SlidesEntry.reason() : I18n.t('slides.import.hint', { n: SlideStrip.current() + 1 });
    const state = text + '|' + off;
    if (state === said) return;
    said = state;
    hint.textContent = text;
    hint.hidden = !text;
    list.setAttribute('aria-disabled', off ? 'true' : 'false');
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
    if (!source || !source.slides[index]) return;
    if (isOff()) { SlidesEntry.explainOff(); return; }
    const markup = cleanCopy(index).innerHTML;
    if (!SlideStrip.importAfterCurrent(markup.trim() ? markup : '<p></p>')) return;
    SlidesEntry.status(I18n.t('slides.import.done', { n: index + 1, name: nameOf(Templates.byId(source.id)) }));
    setActive(index, list.contains(document.activeElement));
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
  // Le volet couvre la marge droite du document, sur sa hauteur visible, à gauche de sa barre de défilement.
  function place() {
    const box = container();
    if (!open || !box) return;
    const rect = box.getBoundingClientRect();
    panel.style.top = (rect.top + box.clientTop) + 'px';
    panel.style.height = box.clientHeight + 'px';
    panel.style.left = (rect.left + box.clientLeft + box.clientWidth - panel.offsetWidth) + 'px';
  }
  function observe() {
    window.addEventListener('resize', place);
    if (typeof ResizeObserver === 'function' && container()) {
      resizeObserver = new ResizeObserver(place);
      resizeObserver.observe(container());
    }
    if (typeof IntersectionObserver === 'function') nearObserver = new IntersectionObserver(onNear, { root: list, rootMargin: DRAW_AHEAD_PX + 'px 0px' });
    stopPaginated = HeaderFooterPreview.onPaginated(onPaginated);
  }
  function unobserve() {
    window.removeEventListener('resize', place);
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
    if (stopPaginated) { stopPaginated(); stopPaginated = null; }
  }

  return { open: openPanel, close: closePanel, toggle, isOpen: () => open, sync };
})();
