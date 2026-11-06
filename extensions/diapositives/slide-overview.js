// La vue d'ensemble des diapositives d'une présentation (extension « diapositives » de Grist Factory Suite ; demande du 06/11, carte « Plein cadre par-dessus le texte » : « la vue d'ensemble des diapositives
// (grille de miniatures) et les sections »). « Vue d'ensemble », le troisième bouton carré du bas de la bande (extensions/diapositives/slide-strip.js), ouvre par-dessus tout le cadre du widget une grille de
// toutes les diapositives, en miniatures plus grandes que celles de la bande : le texte et la barre d'outils attendent derrière, rien ne s'y écrit.
//  - ALLER à une diapositive : un clic la choisit (le curseur du document y va), un double-clic ou Entrée l'ouvre et referme la grille ; Échap ou « Fermer » la referme en laissant le curseur où il est. Au clavier,
//    la grille est une liste de choix (un seul arrêt de Tab) : ← → ↑ ↓ passent d'une miniature à l'autre, Début et Fin vont à la première et à la dernière.
//  - CHOISIR PLUSIEURS diapositives comme dans la bande : Ctrl+clic ajoute ou retire une miniature, Maj+clic choisit de la dernière cliquée jusqu'à celle-ci, Maj+flèches étendent le choix, Ctrl+A choisit tout,
//    Échap défait le choix (puis ferme).
//  - Les GESTES de la bande, les mêmes et par les mêmes chemins (SlideStrip.overview) : le bouton « ⋯ » d'une miniature, un clic droit, Maj+F10 ou la touche Menu ouvrent son menu (ajouter après, dupliquer, monter,
//    descendre, transition, fond, notes, masquer, supprimer, les lignes du lien) ; Suppr efface, Ctrl+← ↑ et Ctrl+→ ↓ déplacent d'une place, Ctrl+C et Ctrl+V copient et collent, Ctrl+Z et Ctrl+Y défont et refont.
//    Chaque geste est UNE transaction du texte : un seul Ctrl+Z le défait.
//  - GLISSER une miniature (ou tout le choix) la déplace : une ligne d'accent dit où elle se posera, la grille défile près de ses bords ; Échap pendant le glisser n'écrit rien. À la souris et au stylet.
//  - La TAILLE des miniatures : « Miniatures plus petites » et « Miniatures plus grandes » (cinq tailles) ; le choix ne dure que le temps de la page.
//  - Les PASTILLES de la bande (dépasse, lien, transition, notes, masquée, personnes du direct) sont reprises telles quelles sous chaque miniature, avec son nom accessible.
//  - LÉGÈRE sur une présentation chargée (70 diapositives d'images, de graphiques et de formes, demande du 21/10) : seules les miniatures que la grille montre, et un peu au-delà, sont copiées (les autres
//    quand elle défile jusqu'à elles) ; une diapositive qui ne fait que changer de place (monter, descendre, supprimer celle d'avant) garde sa miniature, sans la recopier.
//  - L'extension éteinte par GFS : la grille s'ouvre et se lit, ses gestes sont grisés avec leur raison et leur clic explique (SlidesEntry.explainOff), comme ceux de la bande.
//  - La barre de GFS (consigne GFS 025) recouvre le cadre au bord que la personne a choisi : la grille lui cède la profondeur qu'elle mord (GfsBar.bite), au bord où elle est.
// Styles : extensions/diapositives/slide-overview.css.
const SlideOverview = (function () {
  const el = Dom.el;
  const SIZES = [84, 110, 150, 210, 300];   // les largeurs de miniature, en px ; sa hauteur suit la page
  const DEFAULT_SIZE = 2;
  const REDRAW_DELAY_MS = 150;              // la grille se met à jour après une pause du texte (écriture en direct, annulation), pas à chaque transaction
  const DRAW_AHEAD_PX = 300;                // au-delà de ce que la grille montre, la hauteur de miniatures déjà copiées, au-dessus et au-dessous
  const DRAG_START_PX = 5;                  // bouton enfoncé sur une miniature, la souris qui bouge de plus la glisse ; de moins, c'est un clic
  const DRAG_EDGE_PX = 28;                  // une miniature glissée près du haut ou du bas de la grille la fait défiler
  const DRAG_SCROLL_PX = 16;                // ce défilement, au plus, à chaque image

  let root = null;                 // la vue (<div role="dialog">), créée à la première ouverture
  let countEl = null;
  let smallerButton = null;
  let largerButton = null;
  let closeButton = null;
  let grid = null;                 // la liste des miniatures
  let drop = null;                 // la ligne d'accent du glisser
  let open = false;
  let opener = null;               // le bouton qui l'a ouverte : « Fermer » lui rend le clavier
  let sizeIndex = DEFAULT_SIZE;
  let cards = [];                  // une carte par diapositive : { card, thumb, page, num, badges, people, more, nodes, key, near, label }
  let heads = [];                  // l'en-tête de chaque section nommée (SlideStrip.overview.makeHead), sur sa propre rangée de la grille
  let sections = [];               // les sections du texte, lues à la dernière mise à jour (SlideStrip.overview.sections)
  let state = null;                // ce que la bande dit : { count, current, chosen, off }
  let geometry = null;             // la page des miniatures (SlideStrip.overview.geometry)
    let editor = null;
  let chartDom = null;
  let syncTimer = null;
  let nearObserver = null;
  let stopBar = null;
  let drag = null;
  let dragJustEnded = false;

  const host = () => SlideStrip.overview;
  const cardOf = target => cards.find(c => c.card.contains(target)) || null;
  const indexAt = target => { const c = cardOf(target); return c ? cards.indexOf(c) : -1; };

  // La vue
  function build() {
    if (root) return;
    root = el('div', 'pp-overview');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', I18n.t('slides.overview.label'));
    // Ctrl+Z et Ctrl+Y se traitent ici (la bande les passe à l'éditeur) : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche.
    root.setAttribute('data-own-undo', '');
    const head = el('div', 'pp-ov-head');
    const title = el('span', 'pp-ov-title', I18n.t('slides.overview.title'));
    countEl = el('span', 'pp-ov-count');
    const hint = el('span', 'pp-ov-hint', I18n.t('slides.overview.hint'));
    const spacer = el('span', 'pp-ov-spacer');
    smallerButton = Dom.button('pp-ov-btn pp-ov-size');
    Dom.setMarkup(smallerButton, Icons.svg('zoomOut'));
    smallerButton.title = I18n.t('slides.overview.smaller');
    smallerButton.setAttribute('aria-label', I18n.t('slides.overview.smaller'));
    largerButton = Dom.button('pp-ov-btn pp-ov-size');
    Dom.setMarkup(largerButton, Icons.svg('zoomIn'));
    largerButton.title = I18n.t('slides.overview.larger');
    largerButton.setAttribute('aria-label', I18n.t('slides.overview.larger'));
    [smallerButton, largerButton].forEach((button) => { const svg = button.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); });
    closeButton = Dom.button('pp-ov-btn pp-ov-close', I18n.t('slides.overview.close'));
    closeButton.title = I18n.t('slides.overview.closeTip');
    head.append(title, countEl, hint, spacer, smallerButton, largerButton, closeButton);
    grid = el('div', 'pp-ov-grid');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', I18n.t('slides.overview.label'));
    grid.setAttribute('aria-multiselectable', 'true');
    drop = el('div', 'pp-ov-drop');
    drop.hidden = true;
    root.append(head, grid);
    document.body.appendChild(root);
    smallerButton.addEventListener('click', () => resize(-1));
    largerButton.addEventListener('click', () => resize(1));
    closeButton.addEventListener('click', () => close(true));
    root.addEventListener('keydown', onRootKey);
    grid.addEventListener('click', onClick);
    grid.addEventListener('dblclick', onDoubleClick);
    grid.addEventListener('contextmenu', onContextMenu);
    grid.addEventListener('keydown', onGridKey);
    grid.addEventListener('pointerdown', onDragPress);
  }

  // Les cartes
  function makeCard() {
    const card = el('div', 'pp-ov-card');
    card.setAttribute('role', 'option');
    card.tabIndex = -1;
    const thumb = el('div', 'pp-slide-thumb pp-ov-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    const page = el('div', 'pp-slide-page tiptap');
    page.inert = true;
    thumb.appendChild(page);
    const meta = el('div', 'pp-ov-meta');
    meta.setAttribute('aria-hidden', 'true');
    const num = el('span', 'pp-ov-num');
    const badges = el('span', 'pp-ov-badges');
    meta.append(num, badges);
    const people = el('span', 'pp-slide-people pp-ov-people');
    people.setAttribute('aria-hidden', 'true');
    people.hidden = true;
    const more = Dom.button('pp-ov-more');
    more.tabIndex = -1;
    more.title = I18n.t('slides.strip.more');
    more.setAttribute('aria-hidden', 'true');
    Dom.setMarkup(more, Icons.svg('more'));
    card.append(thumb, meta, more, people);
    grid.appendChild(card);
    if (nearObserver) nearObserver.observe(card);
    return { card, thumb, page, num, badges, people, more, nodes: null, key: '', near: !nearObserver, label: '', sizedFor: '' };
  }
  function removeCard(c) {
    if (nearObserver) nearObserver.unobserve(c.card);
    c.card.remove();
  }
  // Les miniatures qui entrent dans la grille, ou presque, se copient quand elles ne sont pas à jour.
  function onNear(entries) {
    let arrived = false;
    entries.forEach((entry) => {
      const c = cards.find(candidate => candidate.card === entry.target);
      if (!c) return;
      if (entry.isIntersecting && !c.near) arrived = true;
      c.near = entry.isIntersecting;
    });
    if (arrived && open) drawThumbs();
  }

  // Met la grille d'accord avec la bande : le nombre de cartes, leurs numéros et pastilles, le choix, la taille des miniatures, puis les copies qui manquent.
  function sync() {
    clearTimeout(syncTimer);
    syncTimer = null;
    if (!open) return;
    const next = host().state();
    if (!next) { close(false); return; }
    state = next;
    geometry = host().geometry();
    // Une carte par diapositive. Les copies des miniatures suivent leurs diapositives : une page copiée est reprise par la carte de la diapositive qui montre les mêmes blocs, où qu'elle soit allée.
    const spare = cards.slice(next.count);
    while (cards.length < next.count) cards.push(makeCard());
    if (cards.length > next.count) cards.length = next.count;
    const old = cards.map(c => ({ page: c.page, nodes: c.nodes, key: c.key }));
    spare.forEach((c) => old.push({ page: c.page, nodes: c.nodes, key: c.key }));
    spare.forEach(removeCard);
    const free = new Set(old);
    const peeks = cards.map((c, i) => host().peek(i));
    const taken = new Array(cards.length).fill(null);
    // À sa place d'abord, puis ailleurs.
    peeks.forEach((peek, i) => {
      const here = old[i];
      if (peek && here && free.has(here) && sameBlocks(here, peek)) { taken[i] = here; free.delete(here); }
    });
    peeks.forEach((peek, i) => {
      if (taken[i] || !peek) return;
      const found = Array.from(free).find(candidate => sameBlocks(candidate, peek));
      if (found) { taken[i] = found; free.delete(found); }
    });
    const leftovers = Array.from(free);
    cards.forEach((c, i) => {
      const reuse = taken[i] || leftovers.shift() || null;
      const page = reuse ? reuse.page : c.page;
      if (page !== c.page || page.parentNode !== c.thumb) { c.thumb.replaceChildren(page); c.page = page; }
      if (taken[i]) { c.nodes = taken[i].nodes; c.key = taken[i].key; }
      else { page.replaceChildren(); c.nodes = null; c.key = ''; }
    });
    // L'ordre dans la grille est celui des diapositives.
    let at = nextCard(grid.firstElementChild);
    cards.forEach((c) => {
      if (c.card === at) { at = nextCard(at.nextElementSibling); return; }
      grid.insertBefore(c.card, at);
    });
    syncHeads();
    sizeCards();
    const chosen = new Set(next.chosen);
    cards.forEach((c, i) => {
      const n = String(i + 1);
      if (c.num.textContent !== n) c.num.textContent = n;
      c.card.setAttribute('aria-selected', chosen.has(i) ? 'true' : 'false');
      c.card.tabIndex = i === next.current ? 0 : -1;
      c.card.classList.toggle('pp-ov-current', i === next.current);
      syncInfo(c, i);
    });
    countEl.textContent = I18n.t('slides.overview.count', { n: next.count });
    smallerButton.setAttribute('aria-disabled', sizeIndex === 0 ? 'true' : 'false');
    largerButton.setAttribute('aria-disabled', sizeIndex === SIZES.length - 1 ? 'true' : 'false');
    drawThumbs();
  }
  // La première carte à partir de `node` : les en-têtes de section, entre les cartes, ne comptent pas.
  const nextCard = (node) => { let at = node; while (at && !at.classList.contains('pp-ov-card')) at = at.nextElementSibling; return at; };
  // Les en-têtes de section, chacun sur sa rangée juste avant la première carte de sa section, et les cartes des sections repliées cachées. Les en-têtes sont ceux de la bande (makeHead) : ils se replient,
  // se renomment et ouvrent leur menu par ses gestes.
  function syncHeads() {
    sections = host().sections();
    const named = sections.filter(section => !section.lead);
    while (heads.length > named.length) heads.pop().el.remove();
    named.forEach((section, n) => {
      if (!heads[n]) heads.push(host().makeHead());
      const head = heads[n];
      host().updateHead(head, section, sections.indexOf(section));
      const first = cards[section.from];
      if (first && head.el.nextElementSibling !== first.card) grid.insertBefore(head.el, first.card);
    });
    cards.forEach((c, i) => {
      const section = sections[SlideProps.sectionIndexAt(sections, i)];
      const hide = !!section && host().isFolded(section);
      if (c.card.hidden !== hide) c.card.hidden = hide;
    });
  }
  const sameBlocks = (entry, peek) => !!entry.nodes && entry.key === peek.key && entry.nodes.length === peek.nodes.length && entry.nodes.every((node, k) => node === peek.nodes[k]);
  // Les pastilles et le nom accessible de la diapositive `i`, repris de sa miniature dans la bande.
  function syncInfo(c, i) {
    const info = host().rowInfo(i);
    if (!info) return;
    const hidden = info.badges.some(badge => badge.classList.contains('pp-slide-hidden-badge'));
    c.card.classList.toggle('pp-slide-is-hidden', hidden);
    const signature = info.label + '|' + info.badges.map(badge => badge.outerHTML).join('') + '|' + (info.people ? info.people.outerHTML : '');
    if (c.label === signature) return;
    c.label = signature;
    c.card.setAttribute('aria-label', info.label);
    c.badges.replaceChildren(...info.badges);
    if (info.people) { c.people.replaceChildren(...Array.from(info.people.childNodes)); c.people.hidden = false; } else { c.people.replaceChildren(); c.people.hidden = true; }
  }
  // La taille des miniatures : la largeur choisie, la hauteur de la page ; la copie est la page entière réduite à cette largeur.
  function sizeCards() {
    const width = SIZES[sizeIndex];
    const key = geometry.key + '|' + width;
    grid.style.setProperty('--pp-ov-w', width + 'px');
    const scale = width / geometry.width;
    cards.forEach((c) => {
      if (c.sizedFor === key) return;
      c.sizedFor = key;
      c.thumb.style.height = Math.round(geometry.height * scale) + 'px';
      c.page.style.width = geometry.width + 'px';
      c.page.style.height = geometry.height + 'px';
      c.page.style.transform = 'scale(' + scale + ')';
    });
  }
  // Copie les miniatures qui manquent, seulement pour les cartes que la grille montre, ou presque. Toutes les copies d'abord, puis toutes les écritures : copier lit la mise en page de l'éditeur.
  function drawThumbs() {
    if (!open || !geometry) return;
    const due = [];
    cards.forEach((c, i) => {
      if (!c.near) return;
      const peek = host().peek(i);
      if (peek && !sameBlocks(c, peek)) due.push({ c, i });
    });
    const copies = due.map(({ i }) => host().thumb(i));
    due.forEach(({ c }, k) => {
      const copy = copies[k];
      if (!copy) return;
      c.page.replaceChildren(...copy.elements);
      c.nodes = copy.nodes;
      c.key = copy.key;
    });
  }
  function resize(step) {
    const next = Math.max(0, Math.min(SIZES.length - 1, sizeIndex + step));
    if (next === sizeIndex) return;
    sizeIndex = next;
    const keep = state ? state.current : 0;
    sync();
    scrollTo(keep);
  }
  function scheduleSync() {
    if (!open || syncTimer) return;
    syncTimer = setTimeout(sync, REDRAW_DELAY_MS);
  }
  function onTransaction() { scheduleSync(); }
  // Un graphique vient d'être dessiné par l'éditeur : les copies qui le portent se refont.
  function onChartPainted() {
    cards.forEach((c) => { c.nodes = null; });
    scheduleSync();
  }
  // La grille tient tout le cadre, moins ce que la barre de GFS en mord.
  function place() {
    if (!root) return;
    const bite = GfsBar.bite({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    root.style.paddingLeft = Math.ceil(bite.left) + 'px';
    root.style.paddingTop = Math.ceil(bite.top) + 'px';
    root.style.paddingRight = Math.ceil(bite.right) + 'px';
    root.style.paddingBottom = Math.ceil(bite.bottom) + 'px';
  }
  // La carte `index` en vue dans la grille.
  function scrollTo(index) {
    const c = cards[index];
    if (!c || c.card.hidden) return;
    const top = c.card.offsetTop;
    const bottom = top + c.card.offsetHeight;
    if (top < grid.scrollTop) grid.scrollTop = Math.max(0, top - 10);
    else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTop = bottom - grid.clientHeight + 10;
  }
  // Le clavier va sur la carte `index` (la bande le rend après un geste) : à jour d'abord, le geste a pu changer le nombre de cartes.
  function focusBack(index) {
    if (!open) return;
    sync();
    const c = cards[Math.max(0, Math.min(cards.length - 1, index))];
    if (!c) return;
    c.card.focus({ preventScroll: true });
    scrollTo(cards.indexOf(c));
  }

  // Ouvrir, fermer
  const guest = {
    focusBack,
    indexAt,
    anchorOf: index => (cards[index] ? cards[index].thumb : document.body),
    menuOpen(index, on) { if (cards[index]) cards[index].card.classList.toggle('pp-ov-menu-open', on); },
    // La bande a changé un pli ou un nom de section : la grille se met d'accord tout de suite. Les en-têtes de la grille (pour le renommer sur place).
    sync,
    heads: () => heads,
    // Le clavier va sur la carte `index` sans faire défiler la grille ; sur la flèche de son en-tête quand sa section est repliée (la carte n'a pas de place).
    focus(index) {
      const c = cards[index];
      if (c && !c.card.hidden) { c.card.focus({ preventScroll: true }); return; }
      const head = heads.find(candidate => { const section = sections[candidate.k]; return !!section && index >= section.from && index <= section.to; });
      if (head) head.fold.focus({ preventScroll: true });
    },
  };
  function openOverview(from) {
    if (open) return;
    const initial = host().state();
    if (!initial) return;
    build();
    open = true;
    opener = from || null;
    editor = EditorCore.getEditor();
    host().attach(guest);
    root.hidden = false;
    document.body.classList.add('pp-slide-overview-on');
    if (typeof IntersectionObserver === 'function') nearObserver = new IntersectionObserver(onNear, { root: grid, rootMargin: DRAW_AHEAD_PX + 'px 0px' });
    place();
    window.addEventListener('resize', place);
    stopBar = GfsBar.onChange(place);
    editor.on('transaction', onTransaction);
    chartDom = editor.view.dom;
    chartDom.addEventListener(ChartEntry.PAINTED_EVENT, onChartPainted);
    sync();
    // Les cartes sont posées : la diapositive du curseur en vue, et le clavier sur elle (l'anneau ne se montre qu'au clavier : `byKeyboard` n'y change rien d'autre).
    scrollTo(initial.current);
    const c = cards[initial.current];
    if (c && !c.card.hidden) c.card.focus({ preventScroll: true });
  }
  function close(returnFocus) {
    if (!open) return;
    open = false;
    cancelDrag();
    clearTimeout(syncTimer);
    syncTimer = null;
    host().detach();
    window.removeEventListener('resize', place);
    if (stopBar) { stopBar(); stopBar = null; }
    if (editor) editor.off('transaction', onTransaction);
    if (chartDom) { chartDom.removeEventListener(ChartEntry.PAINTED_EVENT, onChartPainted); chartDom = null; }
    if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
    root.hidden = true;
    document.body.classList.remove('pp-slide-overview-on');
    // Les cartes ne restent pas : la grille de la prochaine ouverture part de la présentation d'alors.
    cards.forEach(removeCard);
    cards = [];
    heads.forEach(head => head.el.remove());
    heads = [];
    sections = [];
    state = null;
    geometry = null;
    const back = opener;
    opener = null;
    if (returnFocus && back && back.isConnected) back.focus();
  }
  function toggle(from) {
    if (open) close(true); else openOverview(from);
  }

  // La souris
  function onClick(event) {
    const c = cardOf(event.target);
    if (!c || dragJustEnded) return;
    const index = cards.indexOf(c);
    if (event.target.closest('.pp-ov-more')) {
      if (host().menuOpenFor(index)) host().closeMenu(); else host().openMenu(index, false);
      return;
    }
    host().closeMenu();
    if (event.shiftKey) host().select(index, 'range');
    else if (event.ctrlKey || event.metaKey) host().select(index, 'toggle');
    else host().select(index, 'one');
    sync();
    c.card.focus({ preventScroll: true });
  }
  // Un double-clic ouvre la diapositive : la grille se referme, le curseur est au début de son texte.
  function onDoubleClick(event) {
    const c = cardOf(event.target);
    if (!c || event.target.closest('.pp-ov-more') || event.shiftKey || event.ctrlKey || event.metaKey) return;
    openSlide(cards.indexOf(c));
  }
  function openSlide(index) {
    host().closeMenu();
    close(false);
    host().openSlide(index);
  }
  function onContextMenu(event) {
    const c = cardOf(event.target);
    if (!c) return;
    event.preventDefault();
    host().openMenu(cards.indexOf(c), false);
  }

  // Glisser une miniature : bouton enfoncé, la souris qui bouge emporte une copie de la miniature (ou de tout le choix), une ligne d'accent dit où elle se posera ; lâchée, la diapositive y va, en une
  // transaction (un Ctrl+Z la remet). Échap, ou lâchée hors de la grille, rien ne bouge. Près du haut ou du bas, la grille défile. À la souris et au stylet.
  function onDragPress(event) {
    if (event.button !== 0 || event.pointerType === 'touch' || drag || !state || state.off || state.count < 2 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    const c = cardOf(event.target);
    if (!c || event.target.closest('.pp-ov-more')) return;
    const index = cards.indexOf(c);
    const box = c.thumb.getBoundingClientRect();
    const group = (state.chosen.length > 1 && state.chosen.includes(index) ? state.chosen : [index]).map(i => cards[i]);
    drag = {
      index, card: c, group, doc: editor.state.doc, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      grabX: event.clientX - box.left, grabY: event.clientY - box.top, active: false, cancelled: false, gap: -1, ghost: null, shield: null, frame: 0,
    };
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', onDragRelease, true);
    window.addEventListener('pointercancel', onDragAbort, true);
  }
  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId || drag.cancelled) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_START_PX) return;
      onDragStart();
    }
    event.preventDefault();
    moveGhost();
    placeDrop();
    scrollWhileDragging();
  }
  function onDragStart() {
    host().closeMenu();
    drag.active = true;
    drag.group.forEach(c => c.card.classList.add('pp-ov-drag-source'));
    grid.classList.add('pp-ov-dragging');
    grid.appendChild(drop);
    // Le curseur « saisi » est sur un voile qui couvre la fenêtre, pas sur les cartes (comme la bande : slide-strip.css).
    drag.shield = el('div', 'pp-slide-drag-shield');
    drag.shield.setAttribute('aria-hidden', 'true');
    document.body.appendChild(drag.shield);
    drag.ghost = el('div', 'pp-slide-ghost');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.appendChild(drag.card.thumb.cloneNode(true));
    if (drag.group.length > 1) drag.ghost.appendChild(el('span', 'pp-slide-ghost-count', String(drag.group.length)));
    document.body.appendChild(drag.ghost);
    try { grid.setPointerCapture(drag.pointerId); } catch (error) { /* le pointeur est déjà parti : son relâchement arrive tout de même */ }
    grid.addEventListener('lostpointercapture', onDragAbort);
    document.addEventListener('keydown', onDragKey, true);
  }
  const moveGhost = () => { drag.ghost.style.transform = 'translate(' + Math.round(drag.x - drag.grabX) + 'px,' + Math.round(drag.y - drag.grabY) + 'px)'; };
  // L'intervalle où la miniature se poserait sous la souris : 0 avant la première, cards.length après la dernière ; -1 hors de la grille. { gap, card, after } : `after` vrai, la ligne est à droite de la carte.
  function gapAt(x, y) {
    const box = grid.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom || !cards.length) return { gap: -1 };
    let best = -1;
    let bestDistance = Infinity;
    cards.forEach((c, i) => {
      if (c.card.hidden) return;
      const rect = c.card.getBoundingClientRect();
      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      // Les rangées pèsent plus que les colonnes : la ligne reste sur celle de la souris.
      const distance = dx * dx + dy * dy * 4;
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    });
    const rect = cards[best].card.getBoundingClientRect();
    const after = x >= rect.left + rect.width / 2;
    const gap = after ? best + 1 : best;
    // Déposée à gauche de la première carte d'une section (sous son titre), elle l'ouvre ('next') ; à droite de la dernière de la section d'avant, elle la finit ('prev').
    const opener = sections.some(section => !section.lead && section.from === gap && gap > 0);
    return { gap, card: best, after, side: opener && best === gap && !after ? 'next' : 'prev' };
  }
  // La ligne d'accent, au bord de la carte la plus proche ; cachée là où rien ne bougerait (juste avant ou juste après la diapositive emportée, ou hors de la grille).
  function placeDrop() {
    const at = gapAt(drag.x, drag.y);
    const set = drag.group.map(c => cards.indexOf(c)).sort((a, b) => a - b);
    drag.gap = at.gap;
    const still = at.gap < 0 || set.some(i => i < 0) || !host().plan('moveTo', set, { gap: at.gap, side: at.side });
    drop.hidden = still;
    if (still) return;
    const c = cards[at.card].card;
    const left = at.after ? c.offsetLeft + c.offsetWidth + 5 : c.offsetLeft - 7;
    drop.style.left = Math.round(left) + 'px';
    drop.style.top = c.offsetTop + 'px';
    drop.style.height = c.offsetHeight + 'px';
  }
  function scrollWhileDragging() {
    if (drag.frame) return;
    const step = () => {
      if (!drag) return;
      drag.frame = 0;
      if (!drag.active || drag.cancelled) return;
      const box = grid.getBoundingClientRect();
      const top = box.top + DRAG_EDGE_PX;
      const bottom = box.bottom - DRAG_EDGE_PX;
      const past = drag.y < top ? drag.y - top : drag.y > bottom ? drag.y - bottom : 0;
      if (!past) return;
      const before = grid.scrollTop;
      grid.scrollTop += Math.max(-DRAG_SCROLL_PX, Math.min(DRAG_SCROLL_PX, Math.round(past / 2) || Math.sign(past)));
      if (grid.scrollTop === before) return;
      placeDrop();
      drag.frame = requestAnimationFrame(step);
    };
    drag.frame = requestAnimationFrame(step);
  }
  // Échap, pendant le glisser : la miniature revient, le relâchement qui suivra ne fera rien. Les autres touches attendent le relâchement.
  function onDragKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    drag.cancelled = true;
    clearDragLook();
  }
  function onDragRelease(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { active, cancelled, index, doc } = drag;
    endDrag();
    if (!active) return;
    dragJustEnded = true;
    setTimeout(() => { dragJustEnded = false; }, 0);
    if (cancelled || !open || editor.state.doc !== doc) return;
    const at = gapAt(event.clientX, event.clientY);
    if (at.gap < 0) return;
    host().act('moveTo', index, { gap: at.gap, side: at.side });
    sync();
  }
  function onDragAbort() {
    if (!drag) return;
    const wasActive = drag.active;
    endDrag();
    if (!wasActive) return;
    dragJustEnded = true;
    setTimeout(() => { dragJustEnded = false; }, 0);
  }
  function clearDragLook() {
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    if (drag.ghost) drag.ghost.remove();
    if (drag.shield) drag.shield.remove();
    drag.ghost = null;
    drag.shield = null;
    drop.hidden = true;
    drag.group.forEach(c => c.card.classList.remove('pp-ov-drag-source'));
    grid.classList.remove('pp-ov-dragging');
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragRelease, true);
    window.removeEventListener('pointercancel', onDragAbort, true);
    if (drag.active) {
      grid.removeEventListener('lostpointercapture', onDragAbort);
      document.removeEventListener('keydown', onDragKey, true);
      if (grid.hasPointerCapture && grid.hasPointerCapture(drag.pointerId)) grid.releasePointerCapture(drag.pointerId);
      clearDragLook();
    }
    drag = null;
  }
  const cancelDrag = () => { if (drag) endDrag(); };

  // Le clavier
  // Les cartes que la grille montre (celles d'une section repliée n'ont pas de place), dans l'ordre.
  const shownIndexes = () => cards.map((c, i) => i).filter(i => !cards[i].card.hidden);
  // La carte au-dessus (`dir` -1) ou au-dessous (1) de la carte `index`, dans la rangée voisine, la plus proche en largeur : une rangée peut être celle d'une autre section. Sans rangée plus loin, la première ou la dernière.
  function vertical(index, dir) {
    const here = cards[index].card;
    const middle = here.offsetLeft + here.offsetWidth / 2;
    const others = shownIndexes().filter(i => i !== index && (dir > 0 ? cards[i].card.offsetTop > here.offsetTop : cards[i].card.offsetTop < here.offsetTop));
    if (!others.length) { const all = shownIndexes(); return dir > 0 ? all[all.length - 1] : all[0]; }
    const rowTop = dir > 0 ? Math.min(...others.map(i => cards[i].card.offsetTop)) : Math.max(...others.map(i => cards[i].card.offsetTop));
    const row = others.filter(i => cards[i].card.offsetTop === rowTop);
    return row.reduce((best, i) => (Math.abs(cards[i].card.offsetLeft + cards[i].card.offsetWidth / 2 - middle) < Math.abs(cards[best].card.offsetLeft + cards[best].card.offsetWidth / 2 - middle) ? i : best), row[0]);
  }
  function onRootKey(event) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      // Un menu ouvert, ou un glisser, ont déjà pris la touche ; sinon le choix se défait d'abord, puis la grille se referme.
      event.preventDefault();
      event.stopPropagation();
      if (state && state.chosen.length > 1 && grid.contains(event.target)) { host().clearChoice(state.current); sync(); focusBack(state.current); return; }
      close(true);
    }
  }
  function onGridKey(event) {
    const c = cardOf(event.target);
    if (!c || event.target !== c.card) return;
    const index = cards.indexOf(c);
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if ((key === 'F10' && event.shiftKey) || key === 'ContextMenu') { event.preventDefault(); host().openMenu(index, true); return; }
    if (mod && /^[zy]$/i.test(key)) { event.preventDefault(); host().undoRedo(key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); sync(); return; }
    const toward = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[key];
    // Ctrl + flèche : la diapositive d'une place (monter, descendre), comme Ctrl+↑ et Ctrl+↓ dans la bande.
    if (mod && toward) { event.preventDefault(); host().act(toward < 0 ? 'moveUp' : 'moveDown', index); sync(); return; }
    // Ctrl+A : toutes les diapositives choisies, le curseur où il est.
    if (mod && /^a$/i.test(key) && !event.shiftKey && !event.altKey) { event.preventDefault(); host().selectAll(); sync(); return; }
    if (mod || event.altKey) return;
    if (toward || key === 'Home' || key === 'End') {
      event.preventDefault();
      const visible = shownIndexes();
      const at = visible.indexOf(index);
      const next = key === 'Home' ? visible[0] : key === 'End' ? visible[visible.length - 1]
        : key === 'ArrowUp' || key === 'ArrowDown' ? vertical(index, toward) : visible[Math.max(0, Math.min(visible.length - 1, (at < 0 ? 0 : at) + toward))];
      host().select(next, event.shiftKey ? 'range' : 'one');
      sync();
      focusBack(next);
    } else if (key === 'Enter') {
      event.preventDefault();
      openSlide(index);
    } else if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      host().act('delete', index);
      sync();
    }
  }

  return { toggle, open: openOverview, close, isOpen: () => open };
})();
