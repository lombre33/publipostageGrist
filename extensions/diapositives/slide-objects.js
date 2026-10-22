// « Objets » : les objets libres qu'on pose sur une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10, carte « Où cliquer ? » : un bouton « Objets » sous les
// miniatures, à côté d'« Ajouter » et d'« Importer », avec les mêmes choix). Troisième des trois boutons carrés d'une icône que la bande des diapositives (extensions/diapositives/slide-strip.js,
// qui l'appelle à sa construction, à chaque mise à jour du grisé et quand elle se cache) range sur une ligne (carte du 22/10, « Trois icônes sur une ligne » : son nom est son info-bulle), ce bouton
// ouvre un menu à droite de la bande - du même dessin que celui des mises en page d'« Ajouter » - dont chaque ligne pose un objet au centre de la diapositive du curseur, au premier plan, le
// curseur dedans quand il s'écrit. Ce fichier ne sait pas fabriquer les objets : le socle les connaît (js/free-frame.js :
// le cadre de texte, les formes et les lignes, js/shape-geometry.js), il n'est que la porte d'entrée de la bande. Le menu a une ligne « Cadre de texte », puis une grille de seize « Formes » (une icône
// chacune, son nom en info-bulle, quatre rangées de quatre), puis une rangée de trois « Lignes » : une ligne, une ligne avec flèche, une ligne avec deux flèches. Au clavier, ↑ ↓ passent de la ligne
// à la grille puis à la rangée de lignes (même colonne), ← → les parcourent d'un trait, Début Fin, Entrée ou Espace ; Échap et Tab referment le menu et rendent le clavier au bouton.
// L'extension éteinte (GFS), le bouton est grisé avec sa raison, et son clic l'explique (SlidesEntry.explainOff). Styles : extensions/diapositives/slide-objects.css.
const SlideObjects = (function () {
  // Les lignes du menu, dans l'ordre : l'icône (js/icons.js), le nom et l'info-bulle (js/i18n.js), et ce qu'elle fait de l'éditeur et du début de la diapositive du curseur.
  const ROWS = [
    { id: 'textFrame', icon: 'textFrame', label: 'slides.objects.textFrame', tip: 'slides.objects.textFrameTip', place: (ed, slideStart) => FreeFrame.insert(ed, slideStart) },
  ];
  // Les formes, en grille de quatre colonnes sous un titre : l'icône est `shape<Sorte>`, le nom `shape.<sorte>` ; une forme se pose sélectionnée (sa barre propose le fond et le trait).
  const SHAPE_COLUMNS = 4;
  const SHAPES = ShapeGeometry.KINDS.map(kind => ({
    id: 'shape:' + kind, kind, icon: 'shape' + kind.charAt(0).toUpperCase() + kind.slice(1), label: 'shape.' + kind,
    place: (ed, slideStart) => FreeFrame.insert(ed, slideStart, { shape: kind }),
  }));
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
  // Les parties du menu dans l'ordre des boutons : la ligne « Cadre de texte », la grille des formes, la rangée des lignes (le clavier y passe de l'une à l'autre en gardant sa colonne).
  const SECTIONS = [
    { from: 0, count: ROWS.length, columns: 1 },
    { from: ROWS.length, count: SHAPES.length, columns: SHAPE_COLUMNS },
    { from: ROWS.length + SHAPES.length, count: LINES.length, columns: SHAPE_COLUMNS },
  ];
  // L'info-bulle d'une ligne, avec le numéro de la diapositive où l'objet se posera.
  const tipOf = (spec, n) => (spec.kind ? I18n.t('slides.objects.shapeTip', { shape: I18n.t(spec.label), n }) : I18n.t(spec.tip, { n }));

  let button = null;
  let actions = null;  // la rangée des trois boutons du bas de la bande : l'ancre du menu
  let menu = null;     // { panel, open, pointer } : le menu, s'il est ouvert, et si c'est à la souris que le dernier geste s'est fait
  let off = false;
  let slideNumber = 1;

  const hideIcon = node => { const svg = node.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };
  const rowButtons = () => Array.from(menu.panel.el.querySelectorAll('[data-action]'));

  // Le bouton, dans la rangée du bas de la bande, derrière « Importer » (SlideStrip.build) : un carré d'une icône, dont le nom est l'info-bulle (sync).
  function attach(actionsRow) {
    if (button) return;
    actions = actionsRow;
    button = Dom.button('pp-slide-add pp-slide-objects-open');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    Dom.setMarkup(button, Icons.svg('slideObjects'));
    hideIcon(button);
    actions.appendChild(button);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', (event) => {
      if (off) { SlidesEntry.explainOff(); return; }
      if (menu && menu.open) close(false); else openMenu(event.detail === 0);
    });
    sync(off, slideNumber - 1);
  }
  // Le grisé et le nom du bouton, qui dit sur quelle diapositive l'objet se posera (SlideStrip.syncOff : à chaque transaction).
  function sync(isOff, current) {
    off = !!isOff;
    slideNumber = current + 1;
    if (!button) return;
    const tip = off ? SlidesEntry.reason() : I18n.t('slides.objects.buttonTip', { n: slideNumber });
    button.setAttribute('aria-disabled', off ? 'true' : 'false');
    button.setAttribute('aria-label', I18n.t('slides.objects.buttonTip', { n: slideNumber }));
    button.title = tip;
    if (menu) {
      rowButtons().forEach((row) => { row.title = tipOf(SPECS.find(r => r.id === row.dataset.action), slideNumber); });
    }
    if (off && menu && menu.open) close(false);
  }

  function ensureMenu() {
    if (menu) return menu;
    const rows = ROWS.map(row => '<button type="button" role="menuitem" data-action="' + row.id + '">' + Icons.svg(row.icon) + '<span></span></button>').join('');
    const group = (id, className, list) => '<div class="pp-slide-menu-sep" role="separator"></div><div class="pp-slide-objects-heading" id="pp-slide-objects-' + id + '"></div>'
      + '<div class="pp-slide-objects-shapes ' + className + '" role="group" aria-labelledby="pp-slide-objects-' + id + '">'
      + list.map(spec => '<button type="button" role="menuitem" data-action="' + spec.id + '">' + Icons.svg(spec.icon) + '</button>').join('') + '</div>';
    const panel = EditorCore.createFloatingPanel('pp-slide-layouts pp-slide-objects', rows + group('shapes', 'pp-slide-objects-shape-grid', SHAPES) + group('lines', 'pp-slide-objects-lines', LINES), onAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.setAttribute('aria-label', I18n.t('slides.objects.label'));
    panel.el.querySelector('#pp-slide-objects-shapes').textContent = I18n.t('slides.objects.shapes');
    panel.el.querySelector('#pp-slide-objects-lines').textContent = I18n.t('slides.objects.lines');
    panel.el.querySelectorAll('[data-action]').forEach((row) => {
      const spec = SPECS.find(r => r.id === row.dataset.action);
      if (spec.kind) row.setAttribute('aria-label', I18n.t(spec.label)); else row.querySelector('span').textContent = I18n.t(spec.label);
      row.title = tipOf(spec, slideNumber);
      hideIcon(row);
    });
    panel.el.addEventListener('mousedown', () => { menu.pointer = true; }, true);
    panel.el.addEventListener('keydown', (event) => { menu.pointer = false; onKey(event); });
    menu = { panel, open: false, pointer: true };
    return menu;
  }
  function openMenu(byKeyboard) {
    ensureMenu();
    Object.assign(menu, { open: true, pointer: !byKeyboard });
    button.setAttribute('aria-expanded', 'true');
    menu.panel.show(actions, { placement: 'right-end', offset: 6 });
    if (byKeyboard) rowButtons()[0].focus();
    document.addEventListener('mousedown', onPressOutside, true);
  }
  function close(returnFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    menu.panel.hide();
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onPressOutside, true);
    if (returnFocus) button.focus();
  }
  // Un appui hors du menu le referme ; celui du bouton est laissé à son clic, qui ouvre ou referme.
  function onPressOutside(event) {
    if (menu.panel.el.contains(event.target) || button.contains(event.target)) return;
    close(false);
  }
  // Le bouton où mène ↓ (`way` 1) ou ↑ (-1) depuis le bouton `at` (-1 : aucun) : la rangée d'en dessous ou d'au-dessus, dans la même colonne ; au bout d'une partie du menu, la partie voisine
  // (sa colonne la plus proche) ; au bout du menu, il reboucle (↓ sur la ligne « Cadre de texte », ↑ sur le début de la dernière rangée).
  function verticalMove(at, way) {
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
      return next ? next.from + Math.min(column, Math.min(next.columns, next.count) - 1) : 0;
    }
    if (rowStart > part.from) return at - part.columns;
    const before = SECTIONS[index - 1];
    if (!before) return lastRowStart;
    const start = before.from + Math.floor((before.count - 1) / before.columns) * before.columns;
    return start + Math.min(column, before.from + before.count - start - 1);
  }
  function onKey(event) {
    const buttons = rowButtons();
    const at = buttons.indexOf(document.activeElement);
    const first = ROWS.length;                                   // la première forme
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[verticalMove(at, event.key === 'ArrowDown' ? 1 : -1)].focus();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && at >= first) {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      buttons[first + (at - first + step + buttons.length - first) % (buttons.length - first)].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }
  // Une ligne choisie : le menu se ferme, puis l'objet se pose sur la diapositive du curseur (une transaction : un seul Ctrl+Z le défait). Au clavier, le curseur va dans le texte du
  // cadre posé ; à la souris aussi : c'est ce que fait tout éditeur de diapositives d'une zone de texte neuve.
  function onAction(id) {
    if (!menu || !menu.open) return;
    close(false);
    const spec = SPECS.find(r => r.id === id);
    if (!spec) return;
    if (off) { SlidesEntry.explainOff(); return; }
    Editor.exitHeaderFooterModeIfActive();
    const ed = EditorCore.getEditor();
    if (!ed) return;
    spec.place(ed, FreeFrame.slideStartOf(ed.state.doc, ed.state.selection.from));
    // Le menu agit à l'appui (mousedown) : le même appui referme ensuite les barres flottantes (js/editor-core.js), et avec lui celle de la forme qu'on vient de poser, sélectionnée.
    setTimeout(FreeFrame.syncToolbar, 0);
  }

  return { attach, sync, close };
})();
