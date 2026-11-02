// La fenêtre « Thème… » d'une présentation (extension « diapositives » de Grist Factory Suite ; demande du 02/11, fil « Ajouter un thème de présentation »). La ligne « Thème… » du menu Page (js/orientation-toggle.js)
// l'ouvre par SlidesEntry.openTheme. Le socle (js/slide-theme.js) garde le thème avec la page du modèle, le montre à l'écran et dans chaque sortie et recolore le texte quand il change ; ce fichier ne fait que le proposer et le poser.
//  - Un BROUILLON : à gauche les thèmes prêts (extensions/diapositives/slide-themes.js) et « Aspect d'origine » (aucun thème : la présentation d'avant) ; à droite l'aperçu d'une diapositive aux couleurs et aux polices du
//    brouillon, les deux polices (titres, texte) et les neuf couleurs (le fond, le texte, les titres, six accents), dont chacune s'ouvre dans la fenêtre « Couleur personnalisée ». Rien n'est écrit tant que « Appliquer » n'est
//    pas cliqué ; « Annuler » (ou Échap) ne change rien. Sous l'aperçu, un avertissement dit quand le texte ou les titres se liraient mal sur le fond (moins de 4,5:1, WCAG) ; il ne change jamais rien tout seul.
//  - « Appliquer » pose le thème ET recolore ce que la personne avait pris dans les couleurs de l'ancien thème (SlideTheme.remap), en UN pas d'historique : un Ctrl+Z rend l'ancien thème et les anciennes couleurs ensemble.
//  - Le clavier : Tab entre dans la liste par le thème choisi, les flèches passent d'un thème à l'autre (et le choisissent ; Entrée valide la fenêtre, Dom.radioGroup), Tab va ensuite aux polices, aux couleurs puis aux boutons.
// Styles : extensions/diapositives/slide-theme.css.
const SlideThemeUi = (function () {
  const el = Dom.el;
  const SLOT_ROLES = ['bg', 'text', 'title'];

  let win = null;
  let refs = null;
  let state = null;                 // { draft, slot, onClose } : ce que la fenêtre règle ; `draft` : un thème normalisé, ou null pour « Aspect d'origine »

  const editor = () => EditorCore.getEditor();
  const draftOrOriginal = () => state.draft || SlideTheme.original();
  const slotName = slot => I18n.t('slides.theme.slot.' + slot);
  // Les quatre pastilles d'un thème dans la liste : les titres et trois accents.
  const dotsOf = theme => [theme.colors.title, theme.colors.accent1, theme.colors.accent2, theme.colors.accent3];

  // La fenêtre
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-theme', titleId: 'pp-slide-theme-title', size: 'lg', boxClass: 'pp-slide-theme-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-theme-intro');
    intro.id = 'pp-slide-theme-intro';
    win.box.setAttribute('aria-describedby', intro.id);

    const listLabel = el('div', 'pp-slide-theme-label');
    listLabel.id = 'pp-slide-theme-themes-label';
    // « Aspect d'origine » d'abord (aucun thème), puis les thèmes prêts : une pastille de quatre couleurs et le nom de chacun.
    const rows = [{ id: '', name: I18n.t('slides.theme.original'), theme: SlideTheme.original() }].concat(SlideThemes.LIST.map(preset => ({ id: preset.id, name: I18n.t('slides.theme.preset.' + preset.id), theme: SlideTheme.normalize(preset.theme) })));
    const radios = Dom.radioGroup({
      className: 'pp-slide-theme-list', labelId: listLabel.id, onPick: choose, onEnter: commit,
      options: rows.map(row => ({
        value: row.id,
        className: 'pp-slide-theme-row',
        fill(button) {
          const dots = el('span', 'pp-slide-theme-dots');
          dots.setAttribute('aria-hidden', 'true');
          dotsOf(row.theme).forEach((color) => { const dot = el('i'); dot.style.background = color; dots.append(dot); });
          button.append(dots, el('span', 'pp-slide-theme-name', row.name));
        },
      })),
    });
    const choices = el('div', 'pp-slide-theme-choices');
    choices.append(listLabel, radios.group);

    const paper = el('div', 'pp-slide-theme-paper');
    paper.setAttribute('aria-hidden', 'true');
    const sampleTitle = el('div', 'pp-slide-theme-sample-title');
    const sampleText = el('div', 'pp-slide-theme-sample-text');
    const bars = el('div', 'pp-slide-theme-bars');
    SlideTheme.ACCENT_SLOTS.forEach(() => bars.append(el('i')));
    const shape = el('div', 'pp-slide-theme-sample-shape');
    paper.append(sampleTitle, sampleText, bars, shape);

    const fonts = el('div', 'pp-slide-theme-fonts');
    const selects = {};
    ['title', 'body'].forEach((role) => {
      const field = el('label', 'pp-slide-theme-field');
      const caption = el('span', 'pp-slide-theme-field-label');
      const select = el('select', 'pp-slide-theme-select');
      select.dataset.role = role;
      SlideTheme.FONTS.forEach((font) => { const option = el('option', null, font.name); option.value = font.name; select.append(option); });
      select.addEventListener('change', () => setFont(role, select.value));
      field.append(caption, select);
      fonts.append(field);
      selects[role] = { caption, select };
    });

    const colorsLabel = el('div', 'pp-slide-theme-label');
    const chips = el('div', 'pp-slide-theme-chips');
    chips.setAttribute('role', 'group');
    const chipOf = {};
    SlideTheme.COLOR_SLOTS.forEach((slot) => {
      const chip = Dom.button('pp-slide-theme-chip', '');
      chip.dataset.slot = slot;
      chip.addEventListener('click', () => openColor(slot));
      chip.addEventListener('focus', () => caption(slot));
      chip.addEventListener('mouseenter', () => caption(slot));
      chip.addEventListener('mouseleave', () => caption(state && state.slot));
      chips.append(chip);
      chipOf[slot] = chip;
    });
    const captionLine = el('div', 'pp-slide-theme-caption');
    captionLine.setAttribute('aria-live', 'polite');
    const warn = el('div', 'pp-slide-theme-warn');
    warn.setAttribute('role', 'status');

    // L'aperçu et les deux polices côte à côte : la colonne de droite reste plus basse que la liste, même avec la légende et un avertissement de deux lignes sous les pastilles.
    const preview = el('div', 'pp-slide-theme-preview');
    preview.append(paper, fonts);
    const side = el('div', 'pp-slide-theme-side');
    side.append(preview, colorsLabel, chips, captionLine, warn);
    const columns = el('div', 'pp-slide-theme-columns');
    columns.append(choices, side);
    win.body.append(intro, columns);

    const { cancel, ok } = win.addButtons();
    cancel.addEventListener('click', close);
    ok.addEventListener('click', commit);

    refs = { intro, radios, listLabel, paper, sampleTitle, sampleText, bars, shape, selects, colorsLabel, chips, chipOf, captionLine, warn, cancel, ok };
  }

  // Les textes de la fenêtre, dans la langue du moment (relus à chaque ouverture) et les thèmes prêts de la liste.
  function fill() {
    win.title.textContent = I18n.t('slides.theme.title');
    refs.intro.textContent = I18n.t('slides.theme.intro');
    refs.listLabel.textContent = I18n.t('slides.theme.themes');
    refs.colorsLabel.textContent = I18n.t('slides.theme.colors');
    refs.chips.setAttribute('aria-label', I18n.t('slides.theme.colors'));
    refs.selects.title.caption.textContent = I18n.t('slides.theme.font.title');
    refs.selects.body.caption.textContent = I18n.t('slides.theme.font.body');
    refs.selects.title.select.setAttribute('aria-label', I18n.t('slides.theme.font.title'));
    refs.selects.body.select.setAttribute('aria-label', I18n.t('slides.theme.font.body'));
    refs.cancel.textContent = I18n.t('common.cancel');
    refs.ok.textContent = I18n.t('slides.theme.apply');
    refs.sampleTitle.textContent = I18n.t('slides.theme.sampleTitle');
    refs.sampleText.textContent = I18n.t('slides.theme.sampleText');
  }

  // Le brouillon et ce que la fenêtre en montre
  const presetOf = draft => (draft ? SlideThemes.find(draft) : null);
  function choose(id) {
    if (!state) return;
    const preset = id ? SlideThemes.byId(id) : null;
    state.draft = preset ? SlideTheme.normalize(Object.assign({ name: I18n.t('slides.theme.preset.' + preset.id) }, preset.theme)) : null;
    render();
  }
  // Un réglage change dans le brouillon : le thème devient personnalisé (il n'a plus le nom du thème prêt qu'il était).
  function change(edit) {
    if (!state) return;
    const draft = draftOrOriginal();
    const next = { colors: Object.assign({}, draft.colors), fonts: Object.assign({}, draft.fonts) };
    edit(next);
    state.draft = SlideTheme.normalize(next);
    render();
  }
  function setFont(role, name) { change((next) => { next.fonts[role] = name; }); }
  function setColor(slot, color) { change((next) => { next.colors[slot] = color; }); }
  // « Couleur personnalisée » pour un réglage : la fenêtre s'ouvre sur sa couleur, sans cases « garder » (les couleurs du thème sont déjà sous la main dans la rangée « Couleurs du thème » de chaque menu de couleur) ;
  // « Appliquer » la pose dans le brouillon. Le clavier revient à la pastille.
  function openColor(slot) {
    if (!state) return;
    state.slot = slot;
    caption(slot);
    ColorDialog.open({
      initial: draftOrOriginal().colors[slot],
      keep: false,
      onApply: ({ color }) => setColor(slot, color),
      onClose: () => { if (win && win.isOpen()) refs.chipOf[slot].focus(); },
    });
  }
  function caption(slot) {
    if (!state || !refs) return;
    const theme = draftOrOriginal();
    refs.captionLine.textContent = slot ? slotName(slot) + ' · ' + theme.colors[slot].toUpperCase() : (presetOf(state.draft) || !state.draft ? '' : I18n.t('slides.theme.custom'));
  }
  // Deux thèmes qui ont les mêmes couleurs et les mêmes polices (le nom ne compte pas), ou tous les deux aucun.
  const same = (a, b) => (!a && !b) || (!!a && !!b && JSON.stringify([a.colors, a.fonts]) === JSON.stringify([b.colors, b.fonts]));
  const readsOn = (theme, slot) => ColorMath.contrast(theme.colors[slot], theme.colors.bg) >= 4.5;

  function render() {
    const theme = draftOrOriginal();
    const preset = presetOf(state.draft);
    // La liste : le thème choisi (ou « Aspect d'origine » sans thème) est coché et seul atteint par Tab ; un thème personnalisé n'en coche aucun.
    refs.radios.check(state.draft ? (preset ? preset.id : null) : '');
    // L'aperçu : une diapositive aux couleurs et aux polices du brouillon.
    const vars = SlideTheme.cssVars(theme);
    Object.keys(vars).forEach(name => refs.paper.style.setProperty(name, vars[name]));
    const look = SlideTheme.shapeLook(theme);
    refs.paper.style.setProperty('--pp-theme-shape-fill', look.fill);
    refs.paper.style.setProperty('--pp-theme-shape-line', look.line);
    refs.bars.querySelectorAll('i').forEach((bar, at) => { bar.style.background = theme.colors[SlideTheme.ACCENT_SLOTS[at]]; });
    Object.keys(refs.selects).forEach((role) => { refs.selects[role].select.value = theme.fonts[role]; });
    SlideTheme.COLOR_SLOTS.forEach((slot) => {
      const chip = refs.chipOf[slot];
      const color = theme.colors[slot];
      const label = slotName(slot) + ' · ' + color.toUpperCase();
      chip.style.setProperty('--chip', color);
      chip.style.setProperty('--ink', ColorMath.inkOn(color));
      chip.setAttribute('aria-label', label);
      chip.title = label;
      chip.classList.toggle('is-active', slot === state.slot);
      chip.setAttribute('aria-pressed', slot === state.slot ? 'true' : 'false');
    });
    caption(state.slot);
    // Le texte et les titres se lisent-ils sur le fond ? (Le même avertissement que la fenêtre « Fond… ».)
    const unreadable = SLOT_ROLES.filter(slot => slot !== 'bg' && !readsOn(theme, slot));
    refs.warn.textContent = unreadable.length ? I18n.t('slides.theme.contrastWarning', { which: unreadable.map(slotName).join(', ') }) : '';
  }

  // Ouvre la fenêtre sur le thème du modèle. `onClose` : rend le clavier à qui l'avait (la ligne du menu Page, l'éditeur).
  function open(onClose) {
    if (!editor()) return;
    ensure();
    fill();
    state = { draft: SlideTheme.normalize(PageLayout.getTheme()), slot: null, onClose };
    render();
    win.show(() => refs.radios.buttons.find(button => button.tabIndex === 0));
  }
  function close() {
    if (!win || !win.isOpen()) return;
    const finished = state;
    state = null;
    win.hide();
    if (finished && finished.onClose) finished.onClose();
  }

  // Pose le brouillon : le thème de la page ET les couleurs recolorées dans le texte, UN seul pas d'historique (Ctrl+Z rend les deux).
  function commit() {
    const ed = editor();
    if (!state || !ed) { close(); return; }
    const before = SlideTheme.normalize(PageLayout.getTheme());
    // Un thème prêt garde le nom qu'il a dans la langue du moment ; un thème retouché n'en a pas (SlideTheme.displayName dit « Personnalisé »).
    const next = state.draft;
    close();
    if (same(before, next)) { SlidesEntry.status(I18n.t('slides.theme.unchanged')); return; }
    const gesture = HistoryMarkers.begin('page');
    PageLayout.setTheme(next);
    const tr = ed.state.tr;
    SlideTheme.remap(tr, before, next);
    if (tr.docChanged) ed.view.dispatch(TrackChanges.skipTracking(tr));
    gesture.commit();
    // Les polices changent les lignes : la mise en page et la pagination se refont ; le modèle est « modifié ».
    Editor.refreshLayout();
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
    SlidesEntry.status(next ? I18n.t('slides.theme.applied', { name: SlideThemes.nameOf(next) }) : I18n.t('slides.theme.removed'));
  }

  SlidesEntry.registerTheme({ open, close, isOpen: () => !!win && win.isOpen() });

  return { open, close, isOpen: () => !!win && win.isOpen() };
})();
