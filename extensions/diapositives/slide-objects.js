// « Objets » : les objets libres qu'on pose sur une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10, carte « Où cliquer ? » : un bouton « Objets » sous les
// miniatures, à côté d'« Ajouter » et d'« Importer », avec les mêmes choix). Sous « Importer », dans la bande des diapositives (extensions/diapositives/slide-strip.js, qui l'appelle à sa
// construction, à chaque mise à jour du grisé et quand elle se cache), ce bouton ouvre un menu à sa droite - du même dessin que celui des mises en page d'« Ajouter » - dont chaque ligne
// pose un objet au centre de la diapositive du curseur, au premier plan, le curseur dedans quand il s'écrit. Ce fichier ne sait pas fabriquer les objets : le socle les connaît (js/free-frame.js :
// le cadre de texte), il n'est que la porte d'entrée de la bande. Au clavier, ↑ ↓ Début Fin, Entrée ou Espace ; Échap et Tab referment le menu et rendent le clavier au bouton.
// L'extension éteinte (GFS), le bouton est grisé avec sa raison, et son clic l'explique (SlidesEntry.explainOff). Styles : extensions/diapositives/slide-objects.css.
const SlideObjects = (function () {
  const el = Dom.el;
  // Les lignes du menu, dans l'ordre : l'icône (js/icons.js), le nom et l'info-bulle (js/i18n.js), et ce qu'elle fait de l'éditeur et du début de la diapositive du curseur.
  const ROWS = [
    { id: 'textFrame', icon: 'textFrame', label: 'slides.objects.textFrame', tip: 'slides.objects.textFrameTip', place: (ed, slideStart) => FreeFrame.insert(ed, slideStart) },
  ];

  let button = null;
  let menu = null;     // { panel, open, pointer } : le menu, s'il est ouvert, et si c'est à la souris que le dernier geste s'est fait
  let off = false;
  let slideNumber = 1;

  const hideIcon = node => { const svg = node.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };
  const rowButtons = () => Array.from(menu.panel.el.querySelectorAll('[data-action]'));

  // Le bouton, au bas de la bande, derrière « Importer » (SlideStrip.build).
  function attach(strip) {
    if (button) return;
    button = Dom.button('pp-slide-add pp-slide-objects-open');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    Dom.setMarkup(button, Icons.svg('slideObjects'));
    button.appendChild(el('span', null, I18n.t('slides.objects.button')));
    hideIcon(button);
    strip.appendChild(button);
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
      rowButtons().forEach((row) => { row.title = I18n.t(ROWS.find(r => r.id === row.dataset.action).tip, { n: slideNumber }); });
    }
    if (off && menu && menu.open) close(false);
  }

  function ensureMenu() {
    if (menu) return menu;
    const html = ROWS.map(row => '<button type="button" role="menuitem" data-action="' + row.id + '">' + Icons.svg(row.icon) + '<span></span></button>').join('');
    const panel = EditorCore.createFloatingPanel('pp-slide-layouts pp-slide-objects', html, onAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.setAttribute('aria-label', I18n.t('slides.objects.label'));
    panel.el.querySelectorAll('[data-action]').forEach((row) => {
      const spec = ROWS.find(r => r.id === row.dataset.action);
      row.querySelector('span').textContent = I18n.t(spec.label);
      row.title = I18n.t(spec.tip, { n: slideNumber });
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
    menu.panel.show(button, { placement: 'right-end', offset: 6 });
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
  function onKey(event) {
    const buttons = rowButtons();
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
      close(true);
    }
  }
  // Une ligne choisie : le menu se ferme, puis l'objet se pose sur la diapositive du curseur (une transaction : un seul Ctrl+Z le défait). Au clavier, le curseur va dans le texte du
  // cadre posé ; à la souris aussi : c'est ce que fait tout éditeur de diapositives d'une zone de texte neuve.
  function onAction(id) {
    if (!menu || !menu.open) return;
    close(false);
    const spec = ROWS.find(r => r.id === id);
    if (!spec) return;
    if (off) { SlidesEntry.explainOff(); return; }
    Editor.exitHeaderFooterModeIfActive();
    const ed = EditorCore.getEditor();
    if (!ed) return;
    spec.place(ed, FreeFrame.slideStartOf(ed.state.doc, ed.state.selection.from));
  }

  return { attach, sync, close };
})();
