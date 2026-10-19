// La bande des diapositives d'une présentation, à gauche du document (extension « diapositives » de Grist Factory Suite ; le socle ne l'atteint que par js/slides-entry.js, qui la montre
// tant qu'une présentation est à l'écran en Édition). Une diapositive est ce qu'il y a entre deux sauts de page (nœuds `pageBreak` de premier niveau) : la bande en montre une miniature
// par diapositive, dans l'ordre, celle du curseur cochée.
//  - ALLER à une diapositive : un clic sur sa miniature pose le curseur au début de son texte et fait défiler le document jusqu'au haut de sa page. Au clavier (la bande est une liste, Tab
//    y entre) : ↑ et ↓, Début et Fin vont d'une diapositive à l'autre sans quitter la bande ; Entrée et Échap rendent le clavier au document.
//  - Ses GESTES : « Ajouter une diapositive après », « Dupliquer », « Monter », « Descendre », « Supprimer », dans son menu (le bouton « ⋯ » de la miniature, un clic droit, Maj+F10 ou la
//    touche Menu) ; « Ajouter », au bas de la bande, ajoute une diapositive vide après celle du curseur ; au clavier, Ctrl+↑ et Ctrl+↓ la déplacent, Suppr l'efface, Ctrl+Z et Ctrl+Y
//    défont et refont. Chaque geste est UNE transaction de l'éditeur : un seul Ctrl+Z le défait, et le modèle se marque modifié comme après une frappe. Une présentation garde au moins
//    une diapositive. La barre d'outils ne change pas (elle est gelée).
//  - Les MINIATURES : des copies du rendu de l'éditeur (ses blocs de premier niveau, les images en calque replacées sur leur page), à la taille de la page puis réduites à la largeur de
//    la miniature : le texte s'y coupe aux mêmes endroits. L'en-tête, le pied et les images répétées sur toutes les pages n'y sont pas. Elles se refont après une pause de la frappe, et
//    seulement pour les diapositives qui ont changé.
//  - Une diapositive dont le contenu DÉPASSE de sa page continue sur une page de plus, comme un document (carte du 19/10, « Continuer ») : sa miniature porte un point rouge, et la liste
//    le dit. Lu sur la pagination de l'éditeur (HeaderFooterPreview.pageBreaks) : une coupure qui n'est pas un saut de page tombe dans cette diapositive.
//  - GFS éteint l'extension pendant que la présentation est ouverte : la bande reste et ses miniatures mènent toujours à leur diapositive ; ses gestes sont grisés avec leur raison, et
//    leur clic explique (SlidesEntry.explainOff).
//  - Pendant l'écriture d'un en-tête ou d'un pied de page, l'éditeur porte leur texte, pas celui des diapositives : la bande ne bouge pas, et un geste referme d'abord l'en-tête.
// Styles : extensions/diapositives/slide-strip.css (dont la place que la bande prend à gauche du document, `body.pp-slide-strip-on`).
const SlideStrip = (function () {
  const el = Dom.el;
  const THUMB_WIDTH_PX = 80;       // la largeur d'une miniature ; sa hauteur suit la page
  const REDRAW_DELAY_MS = 200;     // les miniatures se refont après une pause de la frappe, pas à chaque lettre
  const PT_TO_PX = PageLayout.MM_TO_PX / PageLayout.MM_TO_PT;
  // Les lignes du menu d'une diapositive, dans l'ordre ; null : un filet.
  const MENU = ['addAfter', 'duplicate', null, 'moveUp', 'moveDown', null, 'delete'];

  let strip = null;                // la bande (<aside>), créée au premier affichage
  let list = null;                 // la liste des miniatures
  let addButton = null;
  let menu = null;                 // le menu d'une diapositive : { panel, index, open, pointer }
  let editor = null;               // l'éditeur suivi tant que la bande est montrée
  let shown = false;
  let off = false;                 // l'extension est éteinte : les gestes sont grisés
  let slides = [];                 // les diapositives du texte (slidesOf)
  let readDoc = null;              // le texte d'où `slides` a été lu
  let rows = [];                   // une rangée par diapositive : { row, item, num, dot, thumb, page, more, nodes, sizedFor }
  let current = 0;                 // la diapositive du curseur
  let overflowing = new Set();     // les diapositives qui dépassent de leur page
  let redrawTimer = null;
  let stopPaginated = null;
  let resizeObserver = null;

  const container = () => document.getElementById('editor-container');
  const editingHeaderFooter = () => Editor.isEditingHeaderFooter();

  // Les diapositives
  // Celles du texte `doc`, dans l'ordre : { start, end, breakBefore, breakAfter, nodes } (`start` et `end` bornent ses blocs ; `breakBefore` et `breakAfter`, la position des sauts de
  // page qui l'encadrent, null au bout du texte ; `nodes`, ses blocs { node, pos }).
  function slidesOf(doc) {
    const found = [];
    let slide = { start: 0, breakBefore: null, nodes: [] };
    doc.forEach((node, pos) => {
      if (node.type.name !== 'pageBreak') { slide.nodes.push({ node, pos }); return; }
      found.push(Object.assign(slide, { end: pos, breakAfter: pos }));
      slide = { start: pos + node.nodeSize, breakBefore: pos, nodes: [] };
    });
    found.push(Object.assign(slide, { end: doc.content.size, breakAfter: null }));
    return found;
  }
  // La diapositive de la position `pos` (un saut de page compte pour celle qu'il termine).
  function slideAt(pos) {
    const index = slides.findIndex(slide => pos <= slide.end);
    return index < 0 ? slides.length - 1 : index;
  }
  // Le curseur au début du texte de `slide` dans `doc`, ou null quand elle n'a aucun endroit où écrire (deux sauts de page de suite).
  function selectionIn(doc, slide) {
    if (!slide) return null;
    const found = EditorCore.getTextSelectionClass().findFrom(doc.resolve(slide.start), 1, true);
    return found && found.from <= slide.end ? found : null;
  }

  // La page des miniatures : celle du modèle ouvert (PageLayout), en pixels CSS, et l'échelle qui la ramène à la largeur d'une miniature. `key` change avec elle.
  function pageGeometry() {
    const width = PageLayout.getSheetWidthPx();
    const height = PageLayout.getPageSizePx().height;
    const margins = PageLayout.getMarginsPx();
    return { width, height, margins, scale: THUMB_WIDTH_PX / width, key: [width, height, margins.top, margins.right, margins.bottom, margins.left].join(' ') };
  }

  // La bande
  function build() {
    if (strip) return;
    strip = el('aside', 'pp-slide-strip');
    strip.hidden = true;
    strip.setAttribute('aria-label', I18n.t('slides.strip.label'));
    list = el('div', 'pp-slide-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', I18n.t('slides.strip.label'));
    list.setAttribute('aria-orientation', 'vertical');
    addButton = Dom.button('pp-slide-add');
    addButton.innerHTML = Icons.svg('slideAdd');
    addButton.appendChild(el('span', null, I18n.t('slides.strip.add')));
    hideIcon(addButton);
    strip.append(list, addButton);
    document.body.appendChild(strip);
    wireList();
    wireAddButton();
  }
  const hideIcon = button => { const svg = button.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };

  // Une rangée : la miniature (une option de la liste) et son bouton « ⋯ », pour la souris seulement (le clavier ouvre le même menu par Maj+F10).
  function makeRow() {
    const row = el('div', 'pp-slide-row');
    row.setAttribute('role', 'none');
    const item = el('div', 'pp-slide-item');
    item.setAttribute('role', 'option');
    item.tabIndex = -1;
    const side = el('div', 'pp-slide-side');
    side.setAttribute('aria-hidden', 'true');
    const num = el('span', 'pp-slide-num');
    const dot = el('span', 'pp-slide-overflow');
    dot.hidden = true;
    dot.title = I18n.t('slides.strip.overflow');
    side.append(num, dot);
    const thumb = el('div', 'pp-slide-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    const page = el('div', 'pp-slide-page tiptap');
    page.inert = true;
    thumb.appendChild(page);
    item.append(side, thumb);
    const more = Dom.button('pp-slide-more');
    more.tabIndex = -1;
    more.title = I18n.t('slides.strip.more');
    more.setAttribute('aria-hidden', 'true');
    more.innerHTML = Icons.svg('more');
    hideIcon(more);
    row.append(item, more);
    list.appendChild(row);
    return { row, item, num, dot, thumb, page, more, nodes: null, sizedFor: '' };
  }
  const rowOf = target => rows.find(r => r.row.contains(target)) || null;

  // Relit les diapositives quand le texte a changé et met les rangées d'accord (nombre, numéros, ce qui dépasse) ; puis la diapositive du curseur et le grisé. `thumbs` : refait aussi
  // les miniatures qui ont changé. Rien pendant l'écriture d'un en-tête : l'éditeur porte alors son texte.
  function refresh(thumbs) {
    if (!editor || editingHeaderFooter()) return;
    const doc = editor.state.doc;
    if (doc !== readDoc) {
      slides = slidesOf(doc);
      readDoc = doc;
      while (rows.length < slides.length) rows.push(makeRow());
      while (rows.length > slides.length) rows.pop().row.remove();
      rows.forEach((r, i) => { r.num.textContent = String(i + 1); });
      syncOverflow();
    }
    if (thumbs) drawThumbs();
    syncCurrent();
    syncOff();
  }

  // Les miniatures
  function scheduleThumbs() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawThumbs, REDRAW_DELAY_MS);
  }
  // Refait la miniature des diapositives dont les blocs ont changé (un bloc que le texte n'a pas touché reste le même objet d'une transaction à l'autre), toutes quand la page a changé.
  function drawThumbs() {
    clearTimeout(redrawTimer);
    redrawTimer = null;
    if (!editor || editingHeaderFooter()) return;
    if (editor.state.doc !== readDoc) refresh(false);
    const geometry = pageGeometry();
    rows.forEach((r, i) => {
      const slide = slides[i];
      const nodes = slide.nodes.map(entry => entry.node);
      const resized = r.sizedFor !== geometry.key;
      if (resized) sizeThumb(r, geometry);
      if (!resized && r.nodes && r.nodes.length === nodes.length && r.nodes.every((node, k) => node === nodes[k])) return;
      r.nodes = nodes;
      fillThumb(r.page, slide, geometry);
    });
  }
  function sizeThumb(r, geometry) {
    r.sizedFor = geometry.key;
    r.thumb.style.height = Math.round(geometry.height * geometry.scale) + 'px';
    r.page.style.width = geometry.width + 'px';
    r.page.style.height = geometry.height + 'px';
    r.page.style.transform = 'scale(' + geometry.scale + ')';
  }
  // La miniature d'une diapositive : une copie du rendu de ses blocs dans l'éditeur, sans ce qui ne sert qu'à écrire (sélection, poignées, texte indicatif).
  function fillThumb(page, slide, geometry) {
    const view = editor.view;
    const copies = [];
    slide.nodes.forEach(({ node, pos }) => {
      const original = view.nodeDOM(pos);
      if (!(original instanceof HTMLElement)) return;
      const copy = original.cloneNode(true);
      tidyCopy(copy);
      placeLayers(copy, original, node, pos, geometry);
      copies.push(copy);
    });
    page.replaceChildren(...copies);
  }
  function tidyCopy(copy) {
    copy.querySelectorAll('.editor-image-handle, .editor-image-move-handle, .column-resize-handle, .ProseMirror-gapcursor').forEach(node => node.remove());
    [copy, ...copy.querySelectorAll('*')].forEach((node) => {
      node.removeAttribute('id');
      node.removeAttribute('data-placeholder');
      Array.from(node.classList).filter(name => /selected/i.test(name) || name === 'is-editor-empty' || name === 'has-focus').forEach(name => node.classList.remove(name));
    });
  }
  // Une image en calque se place par son `top`, compté depuis le haut du texte entier de l'éditeur : dans la miniature, elle reprend sa place sur sa page, celle de sa grille (`pageTopPt`,
  // depuis le haut du corps de la page). Sans grille, ou posée dans un bloc qui la place lui-même (une case), elle garde son `top`.
  function placeLayers(copy, original, node, pos, geometry) {
    const originals = Array.from(original.querySelectorAll('.editor-image-layered'));
    if (!originals.length) return;
    const copied = copy.querySelectorAll('.editor-image-layered');
    const view = editor.view;
    node.descendants((child, offset) => {
      const attrs = child.attrs || {};
      if (!attrs.layer || attrs.layer === 'normal' || attrs.pageTopPt == null) return;
      const dom = view.nodeDOM(pos + 1 + offset);
      const at = originals.indexOf(dom);
      if (at < 0 || !copied[at] || dom.offsetParent !== view.dom) return;
      copied[at].style.top = (geometry.margins.top + attrs.pageTopPt * PT_TO_PX) + 'px';
    });
  }

  // Ce qui dépasse de sa page : une coupure de la pagination qui n'est pas un saut de page, et la diapositive où elle tombe (comptée par les sauts de page qui la précèdent).
  function syncOverflow() {
    overflowing = new Set();
    const slideOf = new Map();
    let index = 0;
    Array.from(editor.view.dom.children).forEach((child) => {
      if (child.classList.contains('page-break-marker')) index += 1;
      else slideOf.set(child, index);
    });
    HeaderFooterPreview.pageBreaks().forEach((brk) => { if (slideOf.has(brk.afterEl)) overflowing.add(slideOf.get(brk.afterEl)); });
    rows.forEach((r, i) => {
      r.dot.hidden = !overflowing.has(i);
      const name = I18n.t('slides.strip.item', { n: i + 1, total: rows.length });
      r.item.setAttribute('aria-label', overflowing.has(i) ? name + ' · ' + I18n.t('slides.strip.overflow') : name);
    });
  }
  // La diapositive du curseur : cochée, la seule que Tab atteint, gardée en vue dans la bande.
  function syncCurrent() {
    current = slideAt(editor.state.selection.from);
    rows.forEach((r, i) => {
      r.item.setAttribute('aria-selected', i === current ? 'true' : 'false');
      r.item.tabIndex = i === current ? 0 : -1;
    });
    keepInView(rows[current]);
  }
  function keepInView(r) {
    if (!r) return;
    const top = r.row.offsetTop;
    const bottom = top + r.row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }
  // « Ajouter » : grisé avec la raison quand l'extension est éteinte ; son nom dit après quelle diapositive il ajoute.
  function syncOff() {
    addButton.setAttribute('aria-disabled', off ? 'true' : 'false');
    addButton.setAttribute('aria-label', I18n.t('slides.strip.addTip', { n: current + 1 }));
    addButton.title = off ? SlidesEntry.reason() : I18n.t('slides.strip.addTip', { n: current + 1 });
  }

  // Aller à une diapositive
  // Le curseur au début du texte de la diapositive `index`, le document défilé jusqu'au haut de sa page. `focusEditor` : le clavier va au document.
  function goTo(index, focusEditor) {
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    const slide = slides[index];
    if (!slide) return;
    const { state, view } = editor;
    const selection = selectionIn(state.doc, slide);
    if (selection) view.dispatch(state.tr.setSelection(selection));
    scrollToSlide(index);
    if (focusEditor) view.focus();
  }
  // Le haut de la page où commence la diapositive `index` (celle qu'ouvre son saut de page, dans la pagination de l'éditeur) ; sans pagination, son premier bloc.
  function scrollToSlide(index) {
    const slide = slides[index];
    if (!slide) return;
    const view = editor.view;
    const marker = slide.breakBefore == null ? null : view.nodeDOM(slide.breakBefore);
    const page = marker ? HeaderFooterPreview.pageBreaks().findIndex(brk => brk.afterEl === marker) + 1 : 0;
    if ((!marker || page > 0) && HeaderFooterPreview.scrollToPage(page)) return;
    const first = slide.nodes.length ? view.nodeDOM(slide.nodes[0].pos) : marker;
    const box = container();
    if (!(first instanceof HTMLElement) || !box) return;
    const gap = parseFloat(getComputedStyle(box).paddingTop) || 0;
    box.scrollTop += first.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientTop - gap;
  }
  function focusItem(index) {
    const r = rows[index];
    if (r) r.item.focus();
  }

  // Les gestes
  // Le geste `action` sur la diapositive `index`, en UNE transaction ; le curseur va à la diapositive touchée, que le document montre. `byKeyboard` : le clavier reste dans la bande, sur
  // elle ; à la souris, il va au document.
  function act(action, index, byKeyboard) {
    if (off) { SlidesEntry.explainOff(); return; }
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    const plan = planOf(action, index);
    if (!plan) return;
    const { state, view } = editor;
    const tr = state.tr;
    plan.apply(tr, state.schema);
    const after = slidesOf(tr.doc);
    const target = Math.max(0, Math.min(plan.target, after.length - 1));
    const selection = selectionIn(tr.doc, after[target]);
    if (selection) tr.setSelection(selection);
    view.dispatch(tr);
    // La pagination tout de suite, pas après sa minuterie : le défilement vise la page que la diapositive occupe maintenant (comme le bouton « Saut de page », js/main-toolbar.js).
    Editor.refreshPaginationPreview();
    refresh(true);
    scrollToSlide(target);
    if (byKeyboard) focusItem(target); else view.focus();
  }
  // Ce que fait le geste : { target (la diapositive à montrer ensuite), apply(tr, schema) }, ou null quand il ne s'applique pas (monter la première, supprimer la seule).
  function planOf(action, index) {
    const slide = slides[index];
    if (!slide) return null;
    const last = slides.length - 1;
    const nodesOf = s => s.nodes.map(entry => entry.node);
    switch (action) {
      case 'addAfter':
        return { target: index + 1, apply: (tr, schema) => tr.insert(slide.end, [schema.nodes.pageBreak.create(), schema.nodes.paragraph.create()]) };
      case 'duplicate':
        return { target: index + 1, apply: (tr, schema) => tr.insert(slide.end, [schema.nodes.pageBreak.create(), ...nodesOf(slide)]) };
      case 'moveUp':
        return index > 0 ? { target: index - 1, apply: tr => swap(tr, slides[index - 1], slide) } : null;
      case 'moveDown':
        return index < last ? { target: index + 1, apply: tr => swap(tr, slide, slides[index + 1]) } : null;
      case 'delete':
        // Avec le saut de page qui la suit ; la dernière, avec celui qui la précède.
        if (last < 1) return null;
        return { target: Math.min(index, last - 1), apply: tr => (slide.breakAfter != null ? tr.delete(slide.start, slide.breakAfter + 1) : tr.delete(slide.breakBefore, slide.end)) };
      default:
        return null;
    }
  }
  // Échange deux diapositives voisines (`first` puis `second`) : le saut de page qui les sépare reste entre elles.
  function swap(tr, first, second) {
    const between = tr.doc.nodeAt(first.breakAfter);
    tr.replaceWith(first.start, second.end, [...second.nodes.map(entry => entry.node), between, ...first.nodes.map(entry => entry.node)]);
  }
  // Pourquoi la ligne `action` du menu de la diapositive `index` est grisée, '' quand elle ne l'est pas.
  function unavailable(action, index) {
    if (off) return SlidesEntry.reason();
    if (action === 'moveUp' && index === 0) return I18n.t('slides.menu.first');
    if (action === 'moveDown' && index === slides.length - 1) return I18n.t('slides.menu.last');
    if (action === 'delete' && slides.length < 2) return I18n.t('slides.menu.onlyOne');
    return '';
  }
  function undoRedo(which) {
    const command = editor.commands[which];
    if (typeof command !== 'function') return;
    command();
    refresh(true);
    focusItem(current);
  }

  // Le menu d'une diapositive
  function ensureMenu() {
    if (menu) return menu;
    const html = MENU.map(action => (action ? '<button type="button" role="menuitem" data-action="' + action + '"></button>' : '<div class="pp-slide-menu-sep" role="separator"></div>')).join('');
    const panel = EditorCore.createFloatingPanel('pp-slide-menu', html, onMenuAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.querySelectorAll('[data-action]').forEach((button) => { button.textContent = I18n.t('slides.menu.' + button.dataset.action); });
    // Le geste qui choisit une ligne : à la souris, le clavier va ensuite au document ; au clavier, il reste dans la bande.
    panel.el.addEventListener('mousedown', () => { menu.pointer = true; }, true);
    panel.el.addEventListener('keydown', (event) => { menu.pointer = false; onMenuKey(event); });
    menu = { panel, index: 0, open: false, pointer: true };
    return menu;
  }
  function openMenu(index, byKeyboard) {
    const r = rows[index];
    if (!r) return;
    ensureMenu();
    closeMenu(false);
    Object.assign(menu, { index, open: true, pointer: !byKeyboard });
    menu.panel.el.setAttribute('aria-label', I18n.t('slides.menu.label', { n: index + 1 }));
    menu.panel.el.querySelectorAll('[data-action]').forEach((button) => {
      const why = unavailable(button.dataset.action, index);
      button.setAttribute('aria-disabled', why ? 'true' : 'false');
      if (why) button.title = why; else button.removeAttribute('title');
    });
    r.row.classList.add('pp-slide-menu-open');
    menu.panel.show(r.thumb, { placement: 'right-start', offset: 6 });
    if (byKeyboard) menuButtons()[0].focus();
    document.addEventListener('mousedown', onPressOutsideMenu, true);
  }
  function closeMenu(returnFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    menu.panel.hide();
    document.removeEventListener('mousedown', onPressOutsideMenu, true);
    const r = rows[menu.index];
    if (r) r.row.classList.remove('pp-slide-menu-open');
    if (returnFocus) focusItem(menu.index);
  }
  const menuButtons = () => Array.from(menu.panel.el.querySelectorAll('[data-action]'));
  // Un appui hors du menu le referme ; celui d'un bouton « ⋯ » est laissé à son clic, qui ouvre ou referme.
  function onPressOutsideMenu(event) {
    if (menu.panel.el.contains(event.target) || event.target.closest('.pp-slide-more')) return;
    closeMenu(false);
  }
  function onMenuKey(event) {
    const buttons = menuButtons();
    const at = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  }
  // Une ligne choisie : grisée, elle ne fait rien (l'extension éteinte, elle explique) ; sinon le menu se ferme et le geste se fait.
  function onMenuAction(action) {
    if (!menu || !menu.open) return;
    const button = menu.panel.el.querySelector('[data-action="' + action + '"]');
    if (button && button.getAttribute('aria-disabled') === 'true') {
      if (off) { closeMenu(false); SlidesEntry.explainOff(); }
      return;
    }
    const { index, pointer } = menu;
    closeMenu(false);
    act(action, index, !pointer);
  }

  // La souris et le clavier
  function wireList() {
    // Ni focus sur la miniature ni sélection de texte : un clic sur une miniature va au document. Le geste se fait au clic, après l'appui qui referme les barres de l'éditeur
    // (js/editor-core.js) : celle du tableau où le curseur arrive s'ouvre alors normalement.
    list.addEventListener('mousedown', (event) => { if (rowOf(event.target)) event.preventDefault(); });
    list.addEventListener('click', (event) => {
      const r = rowOf(event.target);
      if (!r) return;
      const index = rows.indexOf(r);
      if (event.target.closest('.pp-slide-more')) {
        if (menu && menu.open && menu.index === index) closeMenu(false); else openMenu(index, false);
        return;
      }
      goTo(index, true);
    });
    list.addEventListener('contextmenu', (event) => {
      const r = rowOf(event.target);
      if (!r) return;
      event.preventDefault();
      openMenu(rows.indexOf(r), false);
    });
    list.addEventListener('keydown', onListKey);
  }
  function onListKey(event) {
    const r = rowOf(event.target);
    if (!r || event.target !== r.item) return;
    const index = rows.indexOf(r);
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if ((key === 'F10' && event.shiftKey) || key === 'ContextMenu') { event.preventDefault(); openMenu(index, true); return; }
    if (mod && /^[zy]$/i.test(key)) { event.preventDefault(); undoRedo(key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
    if (mod && (key === 'ArrowUp' || key === 'ArrowDown')) { event.preventDefault(); act(key === 'ArrowUp' ? 'moveUp' : 'moveDown', index, true); return; }
    if (mod || event.altKey) return;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      event.preventDefault();
      const step = key === 'ArrowUp' ? -1 : 1;
      const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + step));
      goTo(next, false);
      focusItem(next);
    } else if (key === 'Enter') {
      event.preventDefault();
      goTo(index, true);
    } else if (key === 'Escape') {
      event.preventDefault();
      editor.view.focus();
    } else if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      act('delete', index, true);
    }
  }
  function wireAddButton() {
    addButton.addEventListener('mousedown', event => event.preventDefault());
    // `detail` vaut 0 pour un clic du clavier (Entrée, Espace).
    addButton.addEventListener('click', (event) => {
      if (off) { SlidesEntry.explainOff(); return; }
      act('addAfter', current, event.detail === 0);
    });
  }

  // L'éditeur et la page
  function onTransaction({ transaction }) {
    if (!shown || editingHeaderFooter()) return;
    const count = slides.length;
    refresh(false);
    if (!transaction.docChanged) return;
    // Une diapositive de plus ou de moins (un saut de page posé ou effacé dans le texte) : tout de suite, sinon après la pause de la frappe.
    if (slides.length !== count) drawThumbs(); else scheduleThumbs();
  }
  // Après chaque pagination : ce qui dépasse, et toutes les miniatures quand la page a changé (format, sens, marges). Sortie de l'en-tête : le texte des diapositives est revenu.
  function onPaginated() {
    if (!shown || editingHeaderFooter()) return;
    if (editor.state.doc !== readDoc) { refresh(true); return; }
    const key = pageGeometry().key;
    if (rows.some(r => r.sizedFor !== key)) drawThumbs();
    syncOverflow();
  }
  // La bande couvre la marge gauche du document, sur sa hauteur visible (sans sa barre de défilement du bas).
  function place() {
    const box = container();
    if (!strip || !box) return;
    const rect = box.getBoundingClientRect();
    strip.style.left = rect.left + 'px';
    strip.style.top = (rect.top + box.clientTop) + 'px';
    strip.style.height = box.clientHeight + 'px';
  }
  function observe() {
    window.addEventListener('resize', place);
    if (typeof ResizeObserver === 'function' && container()) {
      resizeObserver = new ResizeObserver(place);
      resizeObserver.observe(container());
    }
  }
  function unobserve() {
    window.removeEventListener('resize', place);
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  }

  // Montrée par js/slides-entry.js : une présentation est à l'écran en Édition. `off` : l'extension est éteinte, les gestes sont grisés.
  function show(options) {
    build();
    const wasOff = off;
    off = !!(options && options.off);
    // Le menu ouvert a les lignes d'avant : GFS vient d'allumer ou d'éteindre l'extension.
    if (off !== wasOff) closeMenu(false);
    if (!shown) {
      shown = true;
      editor = EditorCore.getEditor();
      editor.on('transaction', onTransaction);
      stopPaginated = HeaderFooterPreview.onPaginated(onPaginated);
      strip.hidden = false;
      document.body.classList.add('pp-slide-strip-on');
      place();
      observe();
      readDoc = null;
      // Le document a une marge de plus à gauche : la page se réajuste à la largeur qui reste, et sa pagination se refait.
      SlidesEntry.relayout();
    }
    refresh(true);
  }
  function hide() {
    if (!shown) return;
    shown = false;
    closeMenu(false);
    clearTimeout(redrawTimer);
    redrawTimer = null;
    if (editor) editor.off('transaction', onTransaction);
    if (stopPaginated) { stopPaginated(); stopPaginated = null; }
    unobserve();
    strip.hidden = true;
    document.body.classList.remove('pp-slide-strip-on');
    rows.forEach(r => r.row.remove());
    rows = [];
    slides = [];
    readDoc = null;
    SlidesEntry.relayout();
  }

  SlidesEntry.register({ show, hide });

  return { show, hide, slidesOf };
})();
