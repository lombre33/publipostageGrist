// Le menu « Objets » de la barre d'outils du haut (demande du 22/10 : « le bouton d'ajout des formes n'a rien à faire en bas à gauche, ça doit être dans la tool bar en haut comme tout le
// reste du contenu ») : les objets libres qu'on pose sur une diapositive - un cadre de texte, une forme, une ligne. Ils étaient les « Objets » sous les miniatures de la bande (extension
// « diapositives », carte du 21/10) ; ce bouton-là est retiré et ce menu le remplace, au même contenu et avec les mêmes gestes. Le bouton est dans la barre, juste derrière « Image » (#v2-objects-group,
// index.html), et son menu s'ouvre au survol comme ceux du Tableau et de l'Image (`.v2-hover-group`, css/editor-v2.css : le pont de survol, la place sous la barre de GFS et la fermeture au clavier
// sont ceux de tous les menus, js/editor-core.js). Ce fichier ne sait pas fabriquer les objets : le socle les connaît (js/free-frame.js : le cadre de texte, les formes et les lignes,
// js/shape-geometry.js) ; il pose le menu et choisit où l'objet va : au centre de la diapositive du curseur, au premier plan, le curseur dans le cadre de texte posé, la forme ou la ligne
// sélectionnée, en une seule transaction (un Ctrl+Z le défait).
// Le menu a une ligne « Cadre de texte », puis les formes en quatre onglets (choix du 23/10, « toutes à l'import, 40 au menu ») : « Courantes », les seize d'avant, puis « De base », « Flèches »,
// « Étoiles et bulles », seize formes de PowerPoint chacun (ShapeGeometry.TABS). La rangée des onglets prend la place du titre « Formes » (qui reste le nom du groupe pour un lecteur d'écran) et
// sous elle la grille de l'onglet choisi : seize formes, une icône chacune, son nom en info-bulle, deux rangées de huit (à 700 x 400 une grille de quatre rangées ferait sortir le menu sous le bas
// du panneau, et un défilement rognerait les info-bulles). Un onglet se choisit au clic ou par Entrée ou Espace, sans refermer le menu ; le dernier choisi revient à l'ouverture suivante. Puis un
// titre « Lignes » et une rangée de trois : une ligne, une ligne avec flèche, une ligne avec deux flèches. Au clavier, Tab ouvre le menu comme celui des autres boutons, Entrée, Espace ou ↓ sur le
// bouton donnent le clavier à sa première ligne ; ↑ ↓ passent de la ligne aux onglets, à la grille puis à la rangée de lignes (à la même place en largeur), ← → les parcourent d'un trait, Début Fin,
// Entrée ou Espace choisissent ; Échap referme le menu et laisse le clavier sur le bouton. Le bouton est grisé, jamais retiré, quand rien ne peut se poser : l'extension « diapositives » de GFS absente (sa raison, et son clic l'explique,
// SlidesEntry.explainOff) ou un modèle qui n'est pas une présentation (« Les objets se posent sur une diapositive »). Le menu s'ouvre alors quand même, pour le dire.
const ObjectsMenu = (function () {
  // Les lignes du menu, dans l'ordre : l'icône (js/icons.js), le nom et l'info-bulle (js/i18n.js), et ce qu'elles font de l'éditeur et du début de la diapositive du curseur.
  const ROWS = [
    { id: 'textFrame', icon: 'textFrame', label: 'slides.objects.textFrame', tip: 'slides.objects.textFrameTip', place: (ed, slideStart) => FreeFrame.insert(ed, slideStart) },
  ];
  // Les formes, en grille sous les onglets : le nom est `shape.<sorte>` ; l'icône des seize d'avant est dessinée à la main (`shape<Sorte>`, js/icons.js), celle des autres vient de leur dessin
  // (ShapeGeometry.presetIcon) ; une forme se pose sélectionnée (sa barre propose le fond et le trait).
  const GRID_COLUMNS = 8;
  const shapeSpec = kind => ({
    id: 'shape:' + kind, kind, icon: ShapeGeometry.KINDS.indexOf(kind) >= 0 ? 'shape' + kind.charAt(0).toUpperCase() + kind.slice(1) : '', label: 'shape.' + kind,
    place: (ed, slideStart) => FreeFrame.insert(ed, slideStart, { shape: kind }),
  });
  const TABS = ShapeGeometry.TABS.map(tab => ({ id: tab.id, label: 'slides.objects.tab.' + tab.id, shapes: tab.kinds.map(shapeSpec) }));
  const SHAPES = [].concat(...TABS.map(tab => tab.shapes));
  const iconOf = spec => (spec.icon ? Icons.svg(spec.icon) : ShapeGeometry.presetIcon(spec.kind));
  // Les lignes (js/free-frame.js : `insert` avec la sorte `line`), sous leur titre : une ligne, une avec une pointe à la fin, une avec une pointe à chaque bout.
  const LINES = [
    { id: 'line:plain', icon: 'lineStraight', label: 'shape.line', head: '', tail: '' },
    { id: 'line:arrow', icon: 'lineArrow', label: 'shape.lineArrow', head: '', tail: 'triangle' },
    { id: 'line:double', icon: 'lineArrowDouble', label: 'shape.lineArrowDouble', head: 'triangle', tail: 'triangle' },
  ].map(line => Object.assign(line, {
    kind: ShapeGeometry.LINE,
    place: (ed, slideStart) => FreeFrame.insert(ed, slideStart, { shape: ShapeGeometry.LINE, head: line.head, tail: line.tail }),
  }));
  const SPECS = ROWS.concat(SHAPES, LINES);
  // Les parties du menu dans l'ordre des boutons qu'on voit : la ligne « Cadre de texte », les onglets, la grille de l'onglet choisi, la rangée des lignes (le clavier y passe de l'une à l'autre à la
  // même place en largeur : la colonne, ramenée au nombre de colonnes de la partie d'arrivée).
  const shownShapes = () => (TABS.find(tab => tab.id === currentTab) || TABS[0]).shapes.length;
  const sections = () => [
    { from: 0, count: ROWS.length, columns: 1 },
    { from: ROWS.length, count: TABS.length, columns: TABS.length },
    { from: ROWS.length + TABS.length, count: shownShapes(), columns: GRID_COLUMNS },
    { from: ROWS.length + TABS.length + shownShapes(), count: LINES.length, columns: GRID_COLUMNS },
  ];

  let group = null;
  let trigger = null;
  let flyout = null;
  let reasonText = null;   // le paragraphe qui dit pourquoi rien ne se pose, quand le bouton est grisé
  let built = false;
  let state = { reason: '', explains: false };
  let currentTab = TABS[0].id;   // l'onglet des formes choisi : le dernier choisi, le temps de la session

  // Tous les boutons du menu (les choix et les onglets), et ceux qu'on voit : les formes des autres onglets sont cachées.
  const allButtons = () => (flyout ? Array.from(flyout.querySelectorAll('[data-action], [data-tab]')) : []);
  const buttons = () => allButtons().filter(button => !button.closest('[hidden]'));
  const hideIcon = node => { const svg = node.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };

  // Le numéro de la diapositive qui contient `pos` : une de plus que les sauts de page de premier niveau qui le précèdent (comme FreeFrame.slideStartOf).
  function slideNumberAt(doc, pos) {
    let n = 1;
    doc.forEach((node, offset) => { if (node.type.name === 'pageBreak' && offset < pos) n++; });
    return n;
  }
  const currentSlide = () => {
    const ed = EditorCore.getEditor();
    return ed ? slideNumberAt(ed.state.doc, ed.state.selection.from) : 1;
  };
  // L'info-bulle d'une ligne, avec le numéro de la diapositive où l'objet se posera.
  const tipOf = (spec, n) => (spec.kind ? I18n.t('slides.objects.shapeTip', { shape: I18n.t(spec.label), n }) : I18n.t(spec.tip, { n }));

  // Les noms qui disent sur quelle diapositive l'objet se posera : relus à l'ouverture du menu (le curseur a pu changer de diapositive depuis la dernière fois), pas à chaque frappe.
  function refreshNames() {
    if (!built) return;
    const n = currentSlide();
    trigger.setAttribute('aria-label', I18n.t(state.reason ? 'slides.objects.label' : 'slides.objects.buttonTip', { n }));
    allButtons().forEach((button) => {
      const spec = SPECS.find(s => s.id === button.dataset.action);
      if (spec) button.setAttribute('data-tip', tipOf(spec, n));
    });
  }

  // Le menu, construit une fois : le titre « Objets » est déjà dans la page, le reste vient d'ici.
  function build() {
    group = document.getElementById('v2-objects-group');
    if (built || !group) return;
    trigger = group.querySelector(':scope > button');
    flyout = group.querySelector(':scope > .v2-hover-flyout');
    if (!trigger || !flyout) return;
    const frag = document.createDocumentFragment();
    ROWS.forEach((row) => {
      const button = Dom.button('v2-menu-row');
      button.setAttribute('role', 'menuitem');
      button.dataset.action = row.id;
      const icon = Dom.el('span', 'v2-menu-row-icon');
      Dom.setMarkup(icon, Icons.svg(row.icon));
      hideIcon(icon);
      button.append(icon, Dom.el('span', null, I18n.t(row.label)));
      frag.append(button);
    });
    const gridOf = (list) => {
      const grid = Dom.el('span', 'v2-objects-grid');
      grid.setAttribute('role', 'group');
      list.forEach((spec) => {
        const button = Dom.button();
        button.setAttribute('role', 'menuitem');
        button.dataset.action = spec.id;
        button.setAttribute('aria-label', I18n.t(spec.label));
        Dom.setMarkup(button, iconOf(spec));
        hideIcon(button);
        grid.append(button);
      });
      return grid;
    };
    // Les formes : la rangée des onglets (des choix à cocher du menu, un seul coché), puis une grille par onglet, celle de l'onglet choisi seule visible.
    frag.append(Dom.el('span', 'v2-hover-hsep'));
    const tabs = Dom.el('span', 'v2-objects-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', I18n.t('slides.objects.shapes'));
    TABS.forEach((tab) => {
      const button = Dom.button('v2-objects-tab', I18n.t(tab.label));
      button.setAttribute('role', 'menuitemradio');
      button.dataset.tab = tab.id;
      tabs.append(button);
    });
    frag.append(tabs);
    TABS.forEach((tab) => {
      const grid = gridOf(tab.shapes);
      grid.dataset.tabPanel = tab.id;
      grid.setAttribute('aria-label', I18n.t(tab.label));
      frag.append(grid);
    });
    frag.append(Dom.el('span', 'v2-hover-hsep'));
    const heading = Dom.el('span', 'v2-hover-flyout-label', I18n.t('slides.objects.lines'));
    heading.id = 'v2-objects-lines';
    const lines = gridOf(LINES);
    lines.setAttribute('aria-labelledby', heading.id);
    frag.append(heading, lines);
    reasonText = Dom.el('span', 'v2-objects-reason');
    reasonText.setAttribute('role', 'note');
    frag.append(reasonText);
    flyout.append(frag);
    Dom.setMarkup(trigger, Icons.svg('slideObjects'));
    hideIcon(trigger);
    built = true;
    showTab(currentTab);
    wire();
    sync();
  }

  // L'onglet des formes `id` : coché, sa grille montrée, celles des autres cachées.
  function showTab(id) {
    currentTab = TABS.some(tab => tab.id === id) ? id : TABS[0].id;
    flyout.querySelectorAll('[data-tab]').forEach((tab) => { tab.setAttribute('aria-checked', tab.dataset.tab === currentTab ? 'true' : 'false'); });
    flyout.querySelectorAll('[data-tab-panel]').forEach((grid) => { grid.hidden = grid.dataset.tabPanel !== currentTab; });
  }

  function wire() {
    // Le menu agit au clic, comme les lignes des autres menus de la barre : la souris ne fait pas partir le curseur du texte (editor-core.js garde le bouton principal d'un menu sans focus).
    flyout.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab && flyout.contains(tab)) { showTab(tab.dataset.tab); return; }
      const button = event.target.closest('[data-action]');
      if (button && flyout.contains(button)) choose(button.dataset.action, event.detail === 0);
    });
    // Un onglet cliqué à la souris ne prend pas le focus : le curseur reste dans le texte, et le menu se referme quand la souris s'en va (le focus le garderait ouvert).
    flyout.addEventListener('mousedown', (event) => { if (event.target.closest('[data-tab]')) event.preventDefault(); });
    flyout.addEventListener('keydown', onKey);
    trigger.addEventListener('click', () => { if (state.explains) SlidesEntry.explainOff(); });
    // Entrée, Espace ou ↓ sur le bouton donnent le clavier à la première ligne du menu (↑ à la dernière rangée), comme le bouton « Objets » d'avant, sous les miniatures ; Tab y mène aussi.
    trigger.addEventListener('keydown', (event) => {
      if (state.reason || trigger.closest('.pp-access-locked') || !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      buttons()[event.key === 'ArrowUp' ? verticalMove(-1, -1) : 0].focus();
    });
    group.addEventListener('mouseenter', refreshNames);
    group.addEventListener('focusin', refreshNames);
  }

  // Pourquoi rien ne se pose ici ('' : tout se pose) et si le clic sur le bouton l'explique : l'extension de GFS d'abord (le geste existe ailleurs, sa fenêtre dit comment l'avoir), puis
  // le modèle (une présentation seule a des diapositives).
  function situation() {
    if (!SlidesEntry.isAvailable()) return { reason: SlidesEntry.reason(), explains: true };
    if (!SlidesEntry.presentationShown()) return { reason: I18n.t('slides.objects.onlyInPresentation'), explains: false };
    return { reason: '', explains: false };
  }
  // Le grisé du bouton et ce que son menu montre : les choix, ou leur raison. Rappelée à chaque changement de l'écran (js/main-toolbar.js).
  function sync() {
    if (!built) { build(); return; }
    const next = situation();
    const changed = next.reason !== state.reason || next.explains !== state.explains;
    state = next;
    if (changed) {
      const off = !!next.reason;
      trigger.setAttribute('aria-disabled', off ? 'true' : 'false');
      flyout.classList.toggle('pp-objects-off', off);
      allButtons().forEach((button) => { button.disabled = off; });
      reasonText.textContent = next.reason;
      trigger.toggleAttribute('data-explains', next.explains);
    }
    refreshNames();
  }

  // Le bouton où mène ↓ (`way` 1) ou ↑ (-1) depuis le bouton `at` (-1 : aucun) : la rangée d'en dessous ou d'au-dessus, dans la même colonne ; au bout d'une partie du menu, la partie voisine
  // (la même place en largeur : la colonne ramenée à son nombre de colonnes) ; au bout du menu, il reboucle (↓ sur la ligne « Cadre de texte », ↑ sur le début de la dernière rangée).
  function verticalMove(at, way) {
    const SECTIONS = sections();
    const last = SECTIONS[SECTIONS.length - 1];
    const lastRowStart = last.from + Math.floor((last.count - 1) / last.columns) * last.columns;
    if (at < 0) return way > 0 ? 0 : lastRowStart;
    const index = SECTIONS.findIndex(s => at < s.from + s.count);
    const part = SECTIONS[index];
    const column = (at - part.from) % part.columns;
    const rowStart = part.from + Math.floor((at - part.from) / part.columns) * part.columns;
    if (way > 0) {
      if (rowStart + part.columns < part.from + part.count) return Math.min(at + part.columns, part.from + part.count - 1);
      const next = SECTIONS[index + 1];
      return next ? next.from + Math.min(across(column, part, next), Math.min(next.columns, next.count) - 1) : 0;
    }
    if (rowStart > part.from) return at - part.columns;
    const before = SECTIONS[index - 1];
    if (!before) return lastRowStart;
    const start = before.from + Math.floor((before.count - 1) / before.columns) * before.columns;
    return start + Math.min(across(column, part, before), before.from + before.count - start - 1);
  }
  // La colonne `column` d'une partie à `from.columns` colonnes, à la même place dans une partie à `to.columns` colonnes (les quatre onglets au-dessus des huit colonnes de la grille).
  const across = (column, from, to) => (from.columns === to.columns ? column : Math.floor(column * to.columns / from.columns));
  function onKey(event) {
    const list = buttons().filter(button => !button.disabled);
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const first = ROWS.length;                                   // le premier onglet
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      list[verticalMove(at, event.key === 'ArrowDown' ? 1 : -1)].focus();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && at >= first) {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      list[first + (at - first + step + list.length - first) % (list.length - first)].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      list[event.key === 'Home' ? 0 : list.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }
  // Referme le menu : la souris encore dessus ne le rouvre pas avant d'être sortie du groupe ; `returnFocus` rend le clavier au bouton.
  function close(returnFocus) {
    if (returnFocus) trigger.focus();
    EditorCore.closeHoverMenu(group);
  }

  // Un objet choisi : le menu se ferme, puis l'objet se pose sur la diapositive du curseur (une transaction : un seul Ctrl+Z le défait). Le curseur va dans le texte du cadre posé (il est prêt à
  // écrire, comme dans tout éditeur de diapositives), une forme ou une ligne est sélectionnée. `byKeyboard` : le clavier ne se perd pas dans la barre.
  function choose(id, byKeyboard) {
    const spec = SPECS.find(s => s.id === id);
    if (!spec || state.reason) return;
    EditorCore.closeHoverMenu(group);
    Editor.exitHeaderFooterModeIfActive();
    const ed = EditorCore.getEditor();
    if (!ed) return;
    spec.place(ed, FreeFrame.slideStartOf(ed.state.doc, ed.state.selection.from));
    // La barre du cadre posé se montre une fois la transaction passée (js/editor-core.js ferme les barres flottantes au geste qui vient d'avoir lieu).
    setTimeout(FreeFrame.syncToolbar, 0);
    if (byKeyboard) ed.view.focus();
  }

  return { build, sync, SPECS };
})();
