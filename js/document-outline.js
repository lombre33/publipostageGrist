// Le plan du document : un volet à gauche du texte qui liste les titres (H1 à H6, décalés selon leur niveau), met en valeur celui où l'on se trouve et mène à l'un d'un clic - comme le volet de
// navigation de Word et le plan de Google Docs (demande du 16/11 : « un panel sur le côté pour naviguer facilement d'un titre à l'autre et voir le sommaire »).
//  - Ce n'est ni le Sommaire (le bloc que l'on pose DANS le document, js/toc-options.js) ni « Aller à… » de la palette (js/command-palette.js, qui demande de taper) : c'est la liste qui reste affichée.
//    La lecture des titres est commune : `read` sert la palette et le volet, une seule copie ;
//  - il vaut pour l'Édition (les titres de l'éditeur : un clic y pose le curseur) comme pour la Lecture (les titres de la page lue : un clic y fait défiler) ; il suit la personne d'un mode à l'autre ;
//  - grisé, jamais retiré, quand il n'a rien à lister (une grille, une présentation dont la bande de diapositives tient lieu de plan, la Lecture épurée, un PDF, le résumé d'un macro-modèle) :
//    la languette se cache, la palette garde la ligne grisée avec sa raison (LockReasons) ;
//  - ouvert par la languette (#v2-outline-tab, au bord gauche du texte - HORS de la barre d'outils, qui reste gelée), par la ligne « Plan du document » de la palette Alt+/ et par la touche
//    de l'action `documentOutline` (js/shortcuts.js, sans touche d'origine : le raccourci de Google Docs est un enchaînement de deux touches, que ce module ne prend pas) ;
//  - sa place : fenêtre large (≥ 900 px), il POUSSE le texte (la page garde sa largeur, la fenêtre sur elle se réduit, comme le volet de relecture à droite) ; fenêtre étroite (le panneau de
//    Grist, ~700 px), il passe PAR-DESSUS le texte, se ferme après un clic sur un titre ou un clic dans le texte. Le document ne change jamais : ni contenu, ni mise en page ;
//  - le titre « courant » suit le curseur (Édition) ou le défilement (Lecture, et Édition quand on fait défiler à la main) : le dernier titre au-dessus du tiers haut de la fenêtre ;
//  - état de session, comme la languette du haut et la Lecture épurée : rien n'est écrit (ni Grist, ni stockage, ni Annuler), le plan repart fermé à chaque ouverture du widget ;
//  - hébergé par GFS, le volet cède ce que la barre de GFS en recouvre à gauche (GfsBar.bite), la languette s'écarte de la barre (GfsBar.keepClear).
// Styles : css/document-outline.css. Script classique (pas type="module"), même convention de portée globale que BarFold ; js/main-live.js le câble (DocumentOutline.wire), js/main.js lui dit quand
// l'écran change (DocumentOutline.sync).
const DocumentOutline = (function () {
  const el = Dom.el;
  const MAX_ITEMS = 500;          // titres listés au plus
  const WIDE_MIN = 900;           // largeur de la fenêtre à partir de laquelle le plan pousse le texte au lieu de passer dessus
  const FOLLOW_LINE = 1 / 3;      // le titre courant : le dernier qui a passé le tiers haut de la fenêtre
  const QUIET_MS = 600;           // après un saut ou un déplacement du curseur, le défilement qui suit n'est pas celui de la personne
  const REFRESH_MS = 250;         // la liste se relit une fois la frappe calmée
  const EDIT_ID = 'editor-container';
  const READ_ID = 'reader-container';
  const TAB_ID = 'v2-outline-tab';
  const ACTION = 'documentOutline';
  const READER_HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(tag => '#reader-container .reader-content ' + tag).join(', ');

  // `open` : ce que la personne a demandé ; `available` : le plan a de quoi lister ici ; `source` : 'edit', 'read' ou null ; `items` : { name, level, pos | el } ; `current` : rang du titre courant, -1 sans.
  const state = { open: false, available: false, reason: '', source: null, items: [], signature: '', current: -1, overlay: false };
  let editor = null;
  let wired = false;
  let pane = null;
  let refs = null;
  let tab = null;
  let release = null;     // rend la languette à sa place d'origine (GfsBar.keepClear)
  let stopBar = null;     // l'abonnement aux changements de la barre de GFS (le plan ouvert seulement)
  let sizeObserver = null;
  let readObserver = null;
  let refreshTimer = 0;
  let scrollFrame = 0;
  let quietUntil = 0;
  let followScroll = false; // le titre courant suit la fenêtre (la personne a fait défiler) et non le curseur

  const t = (key, params) => I18n.t(key, params);
  const byId = id => document.getElementById(id);
  const shown = node => !!node && node.getClientRects().length > 0;
  const currentEditor = () => (typeof EditorCore !== 'undefined' ? EditorCore.getEditor() : null);
  const boxOf = source => byId(source === 'read' ? READ_ID : EDIT_ID);

  // Ce que l'écran montre : l'éditeur (Édition), la page lue (Lecture) ou rien (résumé d'un macro-modèle, carte de l'accès).
  function sourceNow() {
    if (shown(byId(EDIT_ID)) && currentEditor()) return 'edit';
    if (shown(byId(READ_ID))) return 'read';
    return null;
  }

  // Les titres du document qu'on voit, dans l'ordre du document : { name, level, pos } en Édition (`pos` : dans le titre), { name, level, el } en Lecture. Un titre vide n'est pas listé ; une bulle de
  // variable y est écrite [Table.Colonne]. Sert le volet et la palette (« Aller à… »).
  function read(max = MAX_ITEMS) {
    const source = sourceNow();
    const items = [];
    const add = (text, level, target) => {
      const name = text.replace(/\s+/g, ' ').trim();
      if (name && items.length < max) items.push(Object.assign({ name, level }, target));
    };
    if (source === 'edit') {
      const leaf = node => { const attrs = node.attrs || {}; const column = attrs.column || attrs['data-column']; return column ? '[' + column + ']' : ''; };
      currentEditor().state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return true;
        add(node.textBetween(0, node.content.size, ' ', leaf), node.attrs.level || 1, { pos: pos + 1 });
        return false;
      });
    } else if (source === 'read') {
      document.querySelectorAll(READER_HEADINGS).forEach(node => add(node.textContent, Number(node.tagName.slice(1)), { el: node }));
    }
    return { source, items };
  }

  // Pourquoi le plan n'a rien à montrer ici ('' quand il en a). Dit par la languette cachée à la palette (LockReasons), qui grise la ligne et la dit.
  function unavailableReason(source) {
    if (typeof CleanReading !== 'undefined' && document.body.classList.contains('pp-clean-reading')) return t('outline.unavailable.clean');
    if (!source) return t('outline.unavailable.here');
    if (document.body.classList.contains('pp-grid-mode')) return t('outline.unavailable.grid');
    if (typeof SlidesEntry !== 'undefined' && SlidesEntry.presentationShown()) return t('outline.unavailable.slides');
    if (typeof PdfReading !== 'undefined' && PdfReading.isActive()) return t('outline.unavailable.pdf');
    return '';
  }

  // Le nom de la languette : l'action à faire et la touche qui la fait ('' quand elle n'en a pas). Grisé, c'est la raison qui parle (LockReasons) : le titre d'une languette cachée ne se voit que dans la palette.
  function syncTab() {
    if (!tab) return;
    const reason = state.available ? '' : state.reason;
    if (typeof LockReasons !== 'undefined') LockReasons.set(tab, 'explain', reason);
    const key = typeof Shortcuts !== 'undefined' ? Shortcuts.label(ACTION) : '';
    const action = t(state.open ? 'outline.close' : 'outline.open');
    const name = key ? action + ' (' + key + ')' : action;
    tab.setAttribute('aria-label', name);
    if (!reason) tab.title = name;
    tab.setAttribute('aria-expanded', state.open && state.available ? 'true' : 'false');
    const hide = !state.available || state.open;   // ouvert, le volet porte son propre bouton « Fermer » : la languette lui cède la place
    if (tab.hidden !== hide) {
      tab.hidden = hide;
      keepClear();
    }
  }

  function keepClear() {
    if (release) { release(); release = null; }
    if (typeof GfsBar !== 'undefined' && tab && !tab.hidden) release = GfsBar.keepClear(tab);
  }

  // Les repères du titre courant et la liste, d'après `state.items`.
  function setCurrent(index) {
    if (index === state.current || !refs) return;
    state.current = index;
    const buttons = refs.list.querySelectorAll('.pp-outline-item');
    buttons.forEach((button, rank) => {
      const on = rank === index;
      button.classList.toggle('is-current', on);
      if (on) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
    });
    const stop = buttons[index >= 0 ? index : 0];
    buttons.forEach(button => { button.tabIndex = button === stop ? 0 : -1; });
    if (index >= 0 && buttons[index] && state.open) keepInView(buttons[index]);
  }

  // Fait défiler la liste du volet (jamais la page) juste ce qu'il faut pour que le titre courant s'y voie.
  function keepInView(button) {
    const list = refs.list;
    const top = button.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + button.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + button.offsetHeight - list.clientHeight;
  }

  const signatureOf = items => items.map(item => item.level + ':' + item.name).join('\n');

  // Le titre dont le curseur est dans la section : le dernier dont le début est avant lui.
  function indexByCursor() {
    const ed = currentEditor();
    if (!ed || state.source !== 'edit') return -1;
    const from = ed.state.selection.from;
    let found = -1;
    for (let i = 0; i < state.items.length && state.items[i].pos <= from; i++) found = i;
    return found;
  }

  // L'élément de la page qui porte le titre `item` (null quand il n'est plus là ou n'a pas de boîte).
  function nodeOf(item) {
    let node = null;
    if (item.el) node = item.el.isConnected ? item.el : null;
    else {
      const ed = currentEditor();
      try { node = ed ? ed.view.nodeDOM(item.pos - 1) : null; } catch (error) { node = null; }
    }
    return node && node.nodeType === 1 && shown(node) ? node : null;
  }

  // Le titre dont la section est en haut de la fenêtre : le dernier qui a passé la ligne du tiers haut ; tout en bas du document, le dernier qu'on voit (une dernière section courte
  // n'atteindrait jamais la ligne).
  function indexByScroll() {
    const box = state.source ? boxOf(state.source) : null;
    if (!box) return -1;
    const frame = box.getBoundingClientRect();
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    const limit = atEnd ? frame.bottom : frame.top + frame.height * FOLLOW_LINE;
    // Tout en haut du document, le premier titre est le courant s'il est déjà dans le tiers haut (sinon c'est le deuxième, tout proche, qui passerait devant lui).
    if (box.scrollTop <= 1 && state.items.length) {
      const first = nodeOf(state.items[0]);
      if (first && first.getBoundingClientRect().top <= limit) return 0;
    }
    let found = -1;
    state.items.forEach((item, rank) => {
      const node = nodeOf(item);
      if (node && node.getBoundingClientRect().top <= limit) found = rank;
    });
    return found;
  }

  // Relit les titres de l'écran ; redessine la liste seulement quand elle a changé (une frappe qui n'ajoute ni ne retire de titre ne touche pas à la page).
  function readNow() {
    const { source, items } = read();
    state.source = source;
    const signature = signatureOf(items);
    const same = signature === state.signature && refs && refs.list.children.length === items.length;
    state.items = items;
    state.signature = signature;
    if (!refs) return;
    if (!same) render();
    refs.empty.hidden = items.length > 0;
  }

  function render() {
    const focusedRank = pane.contains(document.activeElement) && document.activeElement.classList.contains('pp-outline-item') ? Number(document.activeElement.dataset.index) : -1;
    const floor = state.items.reduce((least, item) => Math.min(least, item.level), 6);
    const rows = state.items.map((item, index) => {
      const button = Dom.button('pp-outline-item', item.name);
      button.dataset.index = String(index);
      button.dataset.level = String(item.level);
      button.dataset.depth = String(Math.min(5, item.level - floor));
      button.title = item.name;
      button.tabIndex = -1;
      const row = el('li', 'pp-outline-row');
      row.append(button);
      return row;
    });
    refs.list.replaceChildren(...rows);
    state.current = -2;   // oblige le prochain setCurrent à tout repeindre
    const wanted = indexByCursorOrScroll();
    setCurrent(wanted);
    if (focusedRank >= 0 && refs.list.children[Math.min(focusedRank, rows.length - 1)]) refs.list.children[Math.min(focusedRank, rows.length - 1)].firstChild.focus({ preventScroll: true });
  }

  // Qui dit le titre courant : le curseur en Édition (sauf si l'on vient de faire défiler à la main), la fenêtre en Lecture.
  function indexByCursorOrScroll() {
    return state.source === 'edit' && !followScroll ? indexByCursor() : indexByScroll();
  }

  function reloadNow() {
    refreshTimer = 0;
    if (!state.open || !state.available) return;
    readNow();
    setCurrent(indexByCursorOrScroll());
  }
  function scheduleRefresh() {
    if (!state.open || refreshTimer) return;
    refreshTimer = setTimeout(reloadNow, REFRESH_MS);
  }

  // Place le volet à gauche du texte : sous la barre, sur la hauteur du document. Large, le document lui laisse sa place (marge à gauche) ; étroit, il passe par-dessus. Appelé à chaque
  // changement de taille du document et de la barre de GFS : cette barre est posée par-dessus le cadre, au bord que la personne a choisi, et le volet lui cède ce qu'elle en recouvre
  // (`GfsBar.bite`, calculé sur le volet sans cette cession, pour ne pas tourner en rond) : à gauche il recule de sa profondeur, et le texte avec lui ; en haut ou en bas il se raccourcit.
  function layout() {
    if (!pane) return;
    const box = state.source ? boxOf(state.source) : null;
    const visible = state.open && state.available && !!box && shown(box);
    pane.hidden = !visible;
    let cleared = false;
    [EDIT_ID, READ_ID].forEach(id => { const other = byId(id); if (other && (!visible || other !== box) && other.style.marginLeft) { other.style.marginLeft = ''; cleared = true; } });
    if (cleared && typeof HeaderFooterPreview !== 'undefined') HeaderFooterPreview.schedulePaginationRecompute();
    if (!visible) return;
    const rect = box.getBoundingClientRect();
    const width = pane.offsetWidth;
    state.overlay = document.documentElement.clientWidth < WIDE_MIN;
    pane.classList.toggle('is-overlay', state.overlay);
    const bite = typeof GfsBar !== 'undefined' ? GfsBar.bite({ left: 0, top: rect.top, right: width, bottom: rect.top + rect.height }) : { left: 0, top: 0, right: 0, bottom: 0 };
    const gutter = Math.max(0, Math.ceil(bite.left));
    const margin = state.overlay ? '' : (width + gutter) + 'px';
    const moved = box.style.marginLeft !== margin;
    box.style.marginLeft = margin;
    // La page, centrée dans une fenêtre plus étroite, glisse de moitié sans que sa taille change : les coutures de page de l'éditeur (calculées dans le repère du conteneur) se refont.
    if (moved && state.source === 'edit' && typeof HeaderFooterPreview !== 'undefined') HeaderFooterPreview.schedulePaginationRecompute();
    pane.style.left = gutter ? gutter + 'px' : '';
    pane.style.top = (rect.top + Math.ceil(bite.top)) + 'px';
    pane.style.height = Math.max(0, rect.height - Math.ceil(bite.top) - Math.ceil(bite.bottom)) + 'px';
  }

  // Le plan a-t-il de quoi lister ici ? Recalcule la source et la raison, puis remet la languette, les titres et la place du volet d'accord. Appelé par js/main.js quand l'écran change (mode, modèle),
  // et par les observateurs de ce module (affichage des deux conteneurs, classes de <body>).
  function sync() {
    if (!wired) return;
    const source = sourceNow();
    const reason = unavailableReason(source);
    const available = !reason;
    const changed = source !== state.source || available !== state.available || reason !== state.reason;
    state.source = source;
    state.available = available;
    state.reason = reason;
    syncTab();
    if (state.open && available) {
      ensure();
      if (changed) detachObservers();   // le conteneur observé a changé (Édition, Lecture)
      attachObservers();
      readNow();
      setCurrent(indexByCursorOrScroll());
    } else detachObservers();
    if (changed || state.open) layout();
  }

  function ensure() {
    if (pane) return;
    pane = el('aside', 'pp-outline');
    pane.id = 'pp-outline-pane';
    pane.setAttribute('aria-label', t('outline.title'));
    // Ses boutons gardent le focus : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
    pane.setAttribute('data-own-undo', '');
    pane.hidden = true;
    const head = el('div', 'pp-outline-head');
    const title = el('span', 'pp-outline-title', t('outline.title'));
    const close = Dom.button('pp-outline-close');
    close.setAttribute('aria-label', t('outline.close'));
    close.title = t('outline.close');
    Dom.setMarkup(close, Icons.svg('closeFind'));
    close.addEventListener('click', () => setOpen(false));
    head.append(title, close);
    const list = el('ul', 'pp-outline-list');
    list.setAttribute('aria-label', t('outline.list.label'));
    const empty = el('p', 'pp-outline-empty', t('outline.empty'));
    empty.hidden = true;
    pane.append(head, list, empty);
    // Une souris qui appuie sur un titre ne prend pas le focus : le curseur reste dans le texte, ou y arrive par le saut.
    list.addEventListener('mousedown', event => { if (event.target.closest('.pp-outline-item')) event.preventDefault(); });
    list.addEventListener('click', event => {
      const button = event.target.closest('.pp-outline-item');
      if (button) goTo(Number(button.dataset.index));
    });
    list.addEventListener('keydown', onListKeydown);
    pane.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setOpen(false); } });
    refs = { head, title, close, list, empty };
    document.body.append(pane);
  }

  // Flèches, Début et Fin passent d'un titre à l'autre (un seul arrêt de Tab pour toute la liste : le titre courant).
  function onListKeydown(event) {
    const buttons = Array.from(refs.list.querySelectorAll('.pp-outline-item'));
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    let to = at;
    if (event.key === 'ArrowDown') to = Math.min(buttons.length - 1, at + 1);
    else if (event.key === 'ArrowUp') to = Math.max(0, at - 1);
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[to].focus();
  }

  // Va au titre de rang `index` : en Édition le curseur s'y pose et il monte en haut de la fenêtre ; en Lecture la page y défile. Le titre devient le courant tout de suite (le défilement
  // d'un saut n'est pas celui de la personne : QUIET_MS). Étroit, le volet se ferme.
  function goTo(index) {
    if (!state.open || !state.available) return;
    readNow();   // les positions d'une frappe de l'instant ne sont pas encore relues
    const item = state.items[index];
    if (!item) return;
    quietUntil = Date.now() + QUIET_MS;
    followScroll = false;
    const ed = currentEditor();
    if (state.source === 'edit' && ed && ed.isEditable) ed.chain().focus().setTextSelection(Math.min(item.pos, ed.state.doc.content.size)).run();
    const node = nodeOf(item);
    if (node) node.scrollIntoView({ block: 'start' });
    setCurrent(index);
    if (state.overlay) setOpen(false, { focus: false });
  }

  function attachObservers() {
    const box = state.source ? boxOf(state.source) : null;
    if (!sizeObserver && typeof ResizeObserver === 'function' && box) { sizeObserver = new ResizeObserver(layout); sizeObserver.observe(box); }
    if (!readObserver && typeof MutationObserver === 'function' && state.source === 'read') {
      // La Lecture se redessine en vidant et en refaisant ses enfants directs : les titres se relisent après.
      readObserver = new MutationObserver(scheduleRefresh);
      readObserver.observe(byId(READ_ID), { childList: true });
    }
    if (!stopBar && typeof GfsBar !== 'undefined') stopBar = GfsBar.onChange(() => layout());
    document.addEventListener('mousedown', onOutsideMousedown, true);
  }
  function detachObservers() {
    if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null; }
    if (readObserver) { readObserver.disconnect(); readObserver = null; }
    if (stopBar) { stopBar(); stopBar = null; }
    clearTimeout(refreshTimer);
    refreshTimer = 0;
    document.removeEventListener('mousedown', onOutsideMousedown, true);
  }

  // Étroit, le volet passe par-dessus le texte : un clic dans le texte (hors du volet et de la languette) le referme, sans rien prendre au clic.
  function onOutsideMousedown(event) {
    if (!state.open || !state.overlay || !pane || pane.hidden) return;
    if (pane.contains(event.target) || (tab && tab.contains(event.target))) return;
    setOpen(false, { focus: false });
  }

  // Ouvre (true) ou ferme (false) le plan. Faux, sans rien changer, quand il est déjà dans cet état ou qu'il n'a rien à lister ici. `options.focus` : false laisse le focus où il est (la souris) ; sinon
  // le focus va au titre courant à l'ouverture, et revient au texte à la fermeture.
  function setOpen(value, options) {
    const next = !!value;
    sync();
    if (next === state.open || (next && !state.available)) return false;
    state.open = next;
    if (next) {
      ensure();
      attachObservers();
      readNow();
      setCurrent(indexByCursorOrScroll());
    } else detachObservers();
    syncTab();
    layout();
    const focus = !options || options.focus !== false;
    if (next && focus) focusCurrent();
    if (!next && focus) giveFocusBack();
    return true;
  }
  function toggle(options) { return setOpen(!state.open, options); }

  function focusCurrent() {
    const buttons = refs ? refs.list.querySelectorAll('.pp-outline-item') : [];
    const target = buttons[state.current >= 0 ? state.current : 0] || (refs && refs.close);
    if (target) target.focus({ preventScroll: true });
  }
  function giveFocusBack() {
    const ed = currentEditor();
    if (state.source === 'edit' && ed && ed.isEditable && typeof EditorCore !== 'undefined') EditorCore.focusEditor();
    else if (tab && !tab.hidden) tab.focus({ preventScroll: true });
  }

  // Le contrôle dont l'action dépend (`run.element` de js/shortcuts.js) : la languette quand le plan est fermé, le bouton « Fermer » du volet quand il est ouvert. Donne à la palette le moyen de griser,
  // sans le lancer, une ligne que la souris ne ferait pas ici.
  function controlElement() {
    return state.open && state.available && refs ? refs.close : tab;
  }

  // Le défilement de la personne (la roulette, la barre de défilement) : le titre courant suit la fenêtre. Un saut du plan ou un déplacement du curseur fait défiler aussi, sans que ce soit elle : QUIET_MS.
  function onScroll() {
    if (!state.open || !state.available || scrollFrame || Date.now() < quietUntil) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (Date.now() < quietUntil) return;
      followScroll = true;
      setCurrent(indexByScroll());
    });
  }

  function onTransaction({ transaction }) {
    if (!state.open || !state.available || state.source !== 'edit') return;
    if (transaction.docChanged) {
      // Les positions suivent la frappe tout de suite ; la liste elle-même se relit quand la frappe se calme.
      state.items.forEach(item => { item.pos = transaction.mapping.map(item.pos); });
      scheduleRefresh();
    }
    if (transaction.docChanged || transaction.selectionSet) {
      followScroll = false;
      quietUntil = Date.now() + QUIET_MS;
      setCurrent(indexByCursor());
    }
  }

  // Câble le module : la languette, l'éditeur (la frappe, le curseur), les deux conteneurs (leur affichage, leur défilement), les classes de <body> (grille, Lecture épurée), la taille de la fenêtre.
  function wire(ed) {
    if (wired) return;
    editor = ed || currentEditor();
    tab = byId(TAB_ID);
    wired = true;
    if (tab) {
      if (!tab.firstChild) Dom.setMarkup(tab, Icons.svg('outline'));
      // Une souris qui appuie sur la languette ne prend pas le focus : le curseur reste dans le texte. Entrée et Espace passent par le même `click` (detail 0) : là, le focus va au volet.
      tab.addEventListener('mousedown', event => event.preventDefault());
      tab.addEventListener('click', event => { toggle({ focus: event.detail === 0 }); });
    }
    if (editor && typeof editor.on === 'function') editor.on('transaction', onTransaction);
    [EDIT_ID, READ_ID].forEach(id => {
      const box = byId(id);
      if (!box) return;
      box.addEventListener('scroll', onScroll, { passive: true });
      if (typeof MutationObserver === 'function') new MutationObserver(() => { if (sourceNow() !== state.source) sync(); }).observe(box, { attributes: true, attributeFilter: ['style'] });
    });
    if (typeof MutationObserver === 'function') new MutationObserver(() => { if (unavailableReason(sourceNow()) !== state.reason) sync(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => { if (state.open) layout(); });
    if (typeof Shortcuts !== 'undefined') Shortcuts.onChange(syncTab);
    sync();
  }

  return { wire, sync, read, open: options => setOpen(true, options), close: options => setOpen(false, options), toggle, isOpen: () => state.open && state.available, isAvailable: () => state.available, controlElement };
})();
