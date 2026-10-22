// La fenêtre « Fond… » d'une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10 à 18:35 : la quatrième fonction, « fond de diapositive »). La ligne « Fond… »
// du menu ⋯ d'une miniature (extensions/diapositives/slide-strip.js) ouvre cette fenêtre pour la diapositive visée, ou pour tout le choix de plusieurs. Le socle (js/slide-props.js) garde le
// fond dans le texte de la diapositive et le dessine ; ce fichier ne fait que le proposer et le poser.
//  - Un BROUILLON : la couleur se choisit sans rien écrire (la palette de tous les menus de couleur, les couleurs gardées du modèle et du document, « Personnalisé… » qui ouvre la fenêtre de
//    couleur, « Sans fond »), et l'aperçu montre la page avec un peu de texte pour juger de la lisibilité. « Appliquer » pose le fond sur la ou les diapositives (UN pas d'historique),
//    « Appliquer à toutes » sur toutes celles de la présentation, « Annuler » (ou Échap) ne change rien. Le texte garde sa couleur : un fond foncé demande un texte clair, à la main - sous l'aperçu,
//    un avertissement le dit quand le texte noir de l'éditeur ne s'y lirait pas (moins de 4,5:1, WCAG) ; il ne change jamais rien tout seul.
//  - Le clavier : Tab entre dans la palette par la couleur choisie (ou la première), les flèches passent d'une pastille à l'autre (haut et bas d'une rangée à l'autre), Début et Fin vont aux bouts.
// Styles : extensions/diapositives/slide-background.css.
const SlideBackgroundUi = (function () {
  const el = Dom.el;
  const COLUMNS = 10;               // les colonnes de la palette (js/color-palette.js) : haut et bas d'une pastille à celle de la rangée d'à côté
  const READABLE = 4.5;             // le contraste (WCAG 2) que le texte doit avoir sur le fond pour se lire

  let win = null;
  let refs = null;
  let state = null;                 // { indexes, draft, onClose } : ce que la fenêtre règle ; `draft` : #rrggbb, ou '' pour « sans fond »

  const editor = () => EditorCore.getEditor();
  // Une pastille de la palette : celle de js/color-palette.js (mêmes classes, donc même dessin, même coche et même marque que ColorPalette.mark).
  function swatch(color) {
    const name = color.toUpperCase();
    return `<button type="button" class="cp-swatch" data-color="${color}" style="--swatch:${color};--ink:${ColorMath.inkOn(color)}" title="${name}" aria-label="${name}" aria-pressed="false"></button>`;
  }
  const groupOf = (html, label) => `<div class="pp-slide-background-colors" role="group" aria-label="${label}">${html}</div>`;
  // Les couleurs gardées (js/color-store.js), une rangée chacune quand elle en a ; relues à chaque ouverture et après « Personnalisé… », qui en garde une de plus.
  function savedHtml() {
    return ColorStore.scopes().filter(scope => scope.colors.length).map(scope => `<div class="cp-row" role="group" aria-label="${scope.label}"><div class="cp-row-label" title="${scope.hint}">${scope.label}</div>`
      + `<div class="cp-row-list pp-slide-background-colors">${scope.colors.map(swatch).join('')}</div></div>`).join('');
  }

  // La fenêtre
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-background', titleId: 'pp-slide-background-title', size: 'lg', boxClass: 'pp-slide-background-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-background-intro', I18n.t('slides.background.intro'));
    intro.id = 'pp-slide-background-intro';
    win.box.setAttribute('aria-describedby', intro.id);
    const mixed = el('p', 'pp-slide-background-mixed', I18n.t('slides.background.mixed'));
    mixed.hidden = true;

    const label = el('div', 'pp-slide-background-label', I18n.t('slides.background.color'));
    const picker = el('div', 'pp-slide-background-picker');
    const grid = el('div', 'cp-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', I18n.t('color.palette'));
    Dom.setMarkup(grid, ColorPalette.ROWS.map(row => row.map(swatch).join('')).join(''));
    grid.classList.add('pp-slide-background-colors');
    const saved = el('div', 'pp-slide-background-saved');
    const tools = el('div', 'pp-slide-background-tools');
    const none = Dom.button('pp-slide-background-tool', I18n.t('slides.background.none'));
    none.setAttribute('aria-pressed', 'false');
    const custom = Dom.button('pp-slide-background-tool cp-custom', I18n.t('colorDropdown.customLabel'));
    custom.title = I18n.t('colorDropdown.custom');
    tools.append(none, custom);
    picker.append(grid, saved, tools);

    const paper = el('div', 'pp-slide-background-paper');
    paper.setAttribute('aria-hidden', 'true');
    paper.append(el('div', 'pp-slide-background-sample-title', I18n.t('slides.background.sampleTitle')), el('div', 'pp-slide-background-sample-text', I18n.t('slides.background.sampleText')));
    const caption = el('div', 'pp-slide-background-caption');
    caption.setAttribute('aria-live', 'polite');
    // L'avertissement est une région vive toujours là (vide quand le fond se lit bien) : le texte qui y entre est annoncé.
    const warn = el('div', 'pp-slide-background-warn');
    warn.setAttribute('role', 'status');
    const side = el('div', 'pp-slide-background-side');
    side.append(paper, caption, warn);

    const controls = el('div', 'pp-slide-background-controls');
    controls.append(label, picker);
    const columns = el('div', 'pp-slide-background-columns');
    columns.append(controls, side);
    win.body.append(intro, mixed, columns);

    const { first, cancel, ok } = win.addButtons('pp-slide-background-all');
    first.textContent = I18n.t('slides.background.applyAll');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('slides.background.apply');
    first.addEventListener('click', () => commit(true));
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => commit(false));

    picker.addEventListener('click', onPick);
    picker.addEventListener('keydown', onKey);
    none.addEventListener('click', () => choose(''));
    custom.addEventListener('click', openCustom);
    refs = { mixed, picker, saved, none, custom, paper, caption, warn };
  }

  // Le brouillon et ce que la fenêtre en montre
  function choose(color) {
    if (!state) return;
    state.draft = color;
    render();
  }
  function onPick(event) {
    const button = event.target.closest('.cp-swatch');
    if (button && refs.picker.contains(button)) choose(button.dataset.color);
  }
  // Une rangée de pastilles : le choix est la seule pastille atteinte par Tab ; les flèches vont d'une pastille à l'autre, haut et bas d'une rangée à l'autre de la palette.
  function onKey(event) {
    const group = event.target.closest('.pp-slide-background-colors');
    if (!group || !event.target.classList.contains('cp-swatch')) return;
    const buttons = Array.from(group.querySelectorAll('.cp-swatch'));
    const at = buttons.indexOf(event.target);
    const steps = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: group.classList.contains('cp-grid') ? COLUMNS : 0, ArrowUp: group.classList.contains('cp-grid') ? -COLUMNS : 0 };
    let to = -1;
    if (event.key in steps) to = steps[event.key] ? at + steps[event.key] : -1;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = buttons.length - 1;
    if (to < 0 || to >= buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[to].focus();
  }
  function render() {
    const color = state.draft;
    ColorPalette.mark(refs.picker, color);
    refs.none.setAttribute('aria-pressed', color ? 'false' : 'true');
    refs.none.classList.toggle('is-active', !color);
    // Une seule pastille par rangée est atteinte par Tab : la choisie, ou à défaut la première.
    refs.picker.querySelectorAll('.pp-slide-background-colors').forEach((group) => {
      const buttons = Array.from(group.querySelectorAll('.cp-swatch'));
      const stop = buttons.find(button => button.classList.contains('is-active')) || buttons[0];
      buttons.forEach((button) => { button.tabIndex = button === stop ? 0 : -1; });
    });
    refs.paper.style.background = color || '';
    refs.caption.textContent = color ? color.toUpperCase() : I18n.t('slides.background.noneCaption');
    refs.warn.textContent = color && !readsOn(color) ? I18n.t('slides.background.darkWarning') : '';
  }
  // Le texte de l'éditeur (l'encre que l'aperçu reprend) se lit-il sur `color` ?
  function readsOn(color) {
    const ink = ColorMath.parseCss(getComputedStyle(refs.paper).color) || '#1b2430';
    return ColorMath.contrast(color, ink) >= READABLE;
  }
  function fillSaved() {
    Dom.setMarkup(refs.saved, savedHtml());
    refs.saved.hidden = !refs.saved.firstChild;
  }
  // « Personnalisé… » : la fenêtre de couleur s'ouvre sur la couleur du brouillon ; « Appliquer » y garde la couleur dans les rangées cochées, puis la prend pour le brouillon. Le clavier revient au bouton.
  function openCustom() {
    if (!state) return;
    ColorDialog.open({
      initial: state.draft || null,
      onApply: ({ color, scopes }) => { ColorStore.addTo(scopes, color); fillSaved(); choose(color); },
      onClose: () => { if (win && win.isOpen()) refs.custom.focus(); },
    });
  }

  // Ouvre la fenêtre pour les diapositives `indexes` (leurs rangs dans le texte de l'éditeur). `onClose` : rend le clavier à qui l'avait (la miniature, l'éditeur).
  function open(indexes, onClose) {
    const ed = editor();
    if (!ed || !indexes || !indexes.length) return;
    ensure();
    const list = SlideProps.backgroundsOf(ed.state.doc);
    const first = list[indexes[0]] || '';
    const mixed = indexes.some(index => (list[index] || '') !== first);
    state = { indexes: indexes.slice(), draft: first, onClose };
    win.title.textContent = indexes.length > 1 ? I18n.t('slides.background.titleMany', { n: indexes.length }) : I18n.t('slides.background.title', { n: indexes[0] + 1 });
    refs.mixed.hidden = !mixed;
    fillSaved();
    render();
    win.show(() => refs.picker.querySelector('.cp-swatch[tabindex="0"]'));
  }
  function close() {
    if (!win || !win.isOpen()) return;
    const finished = state;
    state = null;
    win.hide();
    if (finished && finished.onClose) finished.onClose();
  }
  // Pose le brouillon : sur les diapositives de la fenêtre, ou sur toutes (« Appliquer à toutes »).
  function commit(everySlide) {
    const ed = editor();
    if (!state || !ed) { close(); return; }
    const color = state.draft;
    const total = SlideProps.slidesOf(ed.state.doc).length;
    const indexes = everySlide ? Array.from({ length: total }, (_, k) => k) : state.indexes;
    const changed = SlideProps.applyBackground(ed, indexes, color);
    close();
    // -1 : l'éditeur a refusé (une diapositive bloquée par son lien) et la ligne d'état dit déjà pourquoi.
    if (changed < 0) return;
    if (!changed) SlidesEntry.status(I18n.t('slides.background.unchanged'));
    else SlidesEntry.status(I18n.t(color ? 'slides.background.applied' : 'slides.background.removed', { n: changed }));
  }

  return { open, close, isOpen: () => !!win && win.isOpen() };
})();
