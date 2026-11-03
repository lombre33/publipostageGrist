// La fenêtre « Thème… » d'une présentation (extension « diapositives » de Grist Factory Suite ; demande du 02/11, fil « Ajouter un thème de présentation »). La ligne « Thème… » du menu Page (js/orientation-toggle.js)
// l'ouvre par SlidesEntry.openTheme. Le socle (js/slide-theme.js) garde le thème avec la page du modèle, le montre à l'écran et dans chaque sortie et recolore le texte quand il change ; ce fichier ne fait que le proposer et le poser.
//  - Un BROUILLON : à gauche « Aspect d'origine » (aucun thème : la présentation d'avant), les thèmes du document et les thèmes prêts (extensions/diapositives/slide-themes.js) ; à droite l'aperçu d'une diapositive aux couleurs et aux polices du
//    brouillon, les deux polices (titres, texte) et les neuf couleurs (le fond, le texte, les titres, six accents), dont chacune s'ouvre dans la fenêtre « Couleur personnalisée ». Rien n'est écrit tant que « Appliquer » n'est
//    pas cliqué ; « Annuler » (ou Échap) ne change rien. Sous l'aperçu, un avertissement dit quand le texte ou les titres se liraient mal sur le fond (moins de 4,5:1, WCAG) ; il ne change jamais rien tout seul.
//  - « Appliquer » pose le thème ET recolore ce que la personne avait pris dans les couleurs de l'ancien thème (SlideTheme.remap), en UN pas d'historique : un Ctrl+Z rend l'ancien thème et les anciennes couleurs ensemble.
//  - Les thèmes du DOCUMENT (carte « où garder le thème ») : juste après « Aspect d'origine », avant les thèmes prêts (ils ne se cachent pas sous le pli de la liste), ceux qu'on a rangés par « Enregistrer comme thème… » (le nom se demande, un nom déjà pris est remplacé), que toutes les présentations du
//    document retrouvent ; « Retirer de la liste » ôte celui qui est choisi ; les deux boutons sont au pied de la fenêtre, à gauche d'« Annuler ». Ces deux gestes valent tout de suite (ils n'attendent pas « Appliquer ») et se défont par Ctrl + Z avec les actions du document (extensions/diapositives/slide-themes.js).
//  - Le DÉCOR (carte « Quel décor le thème pose-t-il... », option « Décor réglé dans le thème ») : le bouton « Décor… », sous les deux polices, ouvre sa fenêtre (slide-decor-ui.js : bandeau, logo, numéro, texte de pied) ; ce qu'elle rend
//    entre dans le brouillon, et l'aperçu le montre. Un thème de la liste qui a son décor le pose, un thème qui n'en a pas LAISSE celui qu'on a réglé (un thème prêt change les couleurs et les polices, pas le logo de la société) ;
//    « Aspect d'origine » n'est aucun thème : il n'a pas de décor non plus.
//  - Le clavier : Tab entre dans la liste par le thème choisi, les flèches passent d'un thème à l'autre (et le choisissent ; Entrée valide la fenêtre, Dom.radioGroup), Tab va ensuite aux polices, au bouton « Décor… », aux couleurs puis aux boutons.
// Styles : extensions/diapositives/slide-theme.css.
const SlideThemeUi = (function () {
  const el = Dom.el;
  const SLOT_ROLES = ['bg', 'text', 'title'];
  const LIST_LABEL_ID = 'pp-slide-theme-themes-label';
  const MINE = 'my:';                // la valeur d'une ligne de la liste qui est un thème du document : `my:` + son nom

  let win = null;
  let refs = null;
  let state = null;                 // { draft, slot, onClose, base } : ce que la fenêtre règle ; `draft` : un thème normalisé, ou null pour « Aspect d'origine » ; `base` : le nom du thème du document dont le brouillon est parti

  const editor = () => EditorCore.getEditor();
  const draftOrOriginal = () => state.draft || SlideTheme.original();
  const slotName = slot => I18n.t('slides.theme.slot.' + slot);
  // Les quatre pastilles d'un thème dans la liste : les titres et trois accents.
  const dotsOf = theme => [theme.colors.title, theme.colors.accent1, theme.colors.accent2, theme.colors.accent3];

  // La fenêtre
  function ensure() {
    if (win) return;
    // Le coin d'état de la page reçoit les refus d'écriture de Grist qui arrivent après coup. Ici et non à l'exécution du script : les scripts de l'extension se chargent en parallèle (js/extensions.js), `SlideThemes` peut ne pas
    // encore exister à ce moment-là, et la ligne « Thème… » ne s'ouvrirait plus.
    SlideThemes.wire({ status: (message, isError) => SlidesEntry.status(message, isError) });
    win = ModalBase.create({ id: 'pp-slide-theme', titleId: 'pp-slide-theme-title', size: 'lg', boxClass: 'pp-slide-theme-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-theme-intro');
    intro.id = 'pp-slide-theme-intro';
    win.box.setAttribute('aria-describedby', intro.id);

    const listLabel = el('div', 'pp-slide-theme-label');
    listLabel.id = LIST_LABEL_ID;
    const radios = makeList();
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
    const decorButton = Dom.button('pp-slide-decor-tool pp-slide-theme-decor');
    decorButton.addEventListener('click', openDecor);
    fonts.append(decorButton);

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

    // Au pied de la fenêtre, à gauche d'« Annuler » (comme « Enregistrer le format… » de la fenêtre des formats de page) : les deux gestes du document, qui valent tout de suite sans attendre « Appliquer » - ranger le thème du brouillon
    // sous un nom, retirer de la liste celui qui est choisi. Ils ne prennent pas de place sous la liste : la fenêtre tient dans les ~376 px du panneau de 700x400.
    const { first: saveButton, cancel, ok } = win.addButtons('pp-slide-theme-tool pp-slide-theme-save');
    const forgetButton = Dom.button('pp-slide-theme-tool pp-slide-theme-forget var-modal-danger');
    saveButton.after(forgetButton);
    saveButton.addEventListener('click', saveDraft);
    forgetButton.addEventListener('click', forgetChosen);
    cancel.addEventListener('click', close);
    ok.addEventListener('click', commit);

    refs = { intro, radios, listLabel, choices, saveButton, forgetButton, paper, sampleTitle, sampleText, bars, shape, selects, decorButton, colorsLabel, chips, chipOf, captionLine, warn, cancel, ok };
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
    refs.decorButton.textContent = I18n.t('slides.decor.open');
    refs.saveButton.textContent = I18n.t('slides.theme.save');
    refs.forgetButton.textContent = I18n.t('slides.theme.forget');
    refs.cancel.textContent = I18n.t('common.cancel');
    refs.ok.textContent = I18n.t('slides.theme.apply');
    refs.sampleTitle.textContent = I18n.t('slides.theme.sampleTitle');
    refs.sampleText.textContent = I18n.t('slides.theme.sampleText');
  }

  // La liste : « Aspect d'origine » (aucun thème), les thèmes du document (une ligne par thème, son nom en valeur après `my:`), puis les thèmes prêts ; une pastille de quatre couleurs et le nom de chacun. Les thèmes du document sont
  // AVANT les thèmes prêts : la liste tient huit lignes dans le panneau de 700x400 et défile au-delà, un thème qu'on vient de ranger ne doit pas se cacher sous le pli.
  function listRows() {
    const original = { id: '', name: I18n.t('slides.theme.original'), theme: SlideTheme.original() };
    const mine = SlideThemes.saved().map(theme => ({ id: MINE + theme.name, name: theme.name, theme, mine: true }));
    const ready = SlideThemes.LIST.map(preset => ({ id: preset.id, name: I18n.t('slides.theme.preset.' + preset.id), theme: SlideTheme.normalize(preset.theme) }));
    return [original].concat(mine, ready);
  }
  function makeList() {
    const rows = listRows();
    return Dom.radioGroup({
      className: 'pp-slide-theme-list', labelId: LIST_LABEL_ID, onPick: choose, onEnter: commit,
      options: rows.map((row, at) => ({
        value: row.id,
        className: 'pp-slide-theme-row' + (row.mine ? ' is-mine' : '') + (!row.mine && at > 0 && rows[at - 1].mine ? ' is-first-ready' : ''),
        fill(button) {
          const dots = el('span', 'pp-slide-theme-dots');
          dots.setAttribute('aria-hidden', 'true');
          dotsOf(row.theme).forEach((color) => { const dot = el('i'); dot.style.background = color; dots.append(dot); });
          button.append(dots, el('span', 'pp-slide-theme-name', row.name));
          if (row.mine) button.title = I18n.t('slides.theme.saved.hint');
        },
      })),
    });
  }
  // La liste se refait quand le document a gagné ou perdu un thème.
  function refreshList() {
    const old = refs.radios;
    refs.radios = makeList();
    old.group.replaceWith(refs.radios.group);
  }

  // Le brouillon et ce que la fenêtre en montre
  const presetOf = draft => (draft ? SlideThemes.find(draft) : null);
  // La ligne de la liste que le brouillon est : un thème du document (même nom, mêmes couleurs et polices), à défaut un thème prêt, '' sans thème, null pour un thème personnalisé.
  function checkedId() {
    if (!state.draft) return '';
    const mine = SlideThemes.savedByName(state.draft.name);
    if (mine && covers(mine, state.draft)) return MINE + mine.name;
    const preset = presetOf(state.draft);
    return preset ? preset.id : null;
  }
  function choose(id) {
    if (!state) return;
    // Un thème qui a son décor le pose ; un thème qui n'en a pas laisse celui qu'on a réglé.
    const kept = state.draft && state.draft.decor ? { decor: state.draft.decor } : {};
    if (id.indexOf(MINE) === 0) {
      const mine = SlideThemes.savedByName(id.slice(MINE.length));
      if (!mine) return;
      state.draft = SlideTheme.normalize(Object.assign({}, kept, mine));
      state.base = mine.name;
      render();
      return;
    }
    const preset = id ? SlideThemes.byId(id) : null;
    state.draft = preset ? SlideTheme.normalize(Object.assign({ name: I18n.t('slides.theme.preset.' + preset.id) }, kept, preset.theme)) : null;
    state.base = '';
    render();
  }
  // Un réglage change dans le brouillon : le thème devient personnalisé (il n'a plus le nom du thème prêt qu'il était). Le décor, lui, ne change ni les couleurs ni les polices : `keepName` garde le nom du thème (« Océan » avec un logo reste « Océan »).
  function change(edit, keepName) {
    if (!state) return;
    const draft = draftOrOriginal();
    const next = { colors: Object.assign({}, draft.colors), fonts: Object.assign({}, draft.fonts) };
    if (keepName && draft.name) next.name = draft.name;
    if (draft.decor) next.decor = draft.decor;
    edit(next);
    state.draft = SlideTheme.normalize(next);
    render();
  }
  function setFont(role, name) { change((next) => { next.fonts[role] = name; }); }
  function setColor(slot, color) { change((next) => { next.colors[slot] = color; }); }
  // Le décor rendu par sa fenêtre (null : aucun). Sans thème et sans décor, il n'y a rien à poser : « Aspect d'origine » reste tel quel.
  function setDecor(decor) {
    if (!state || (!decor && !state.draft)) return;
    change((next) => { if (decor) next.decor = decor; else delete next.decor; }, true);
  }
  function openDecor() {
    if (!state) return;
    SlideDecorUi.open({ theme: draftOrOriginal(), onApply: setDecor });
  }
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
  // Deux thèmes qui ont les mêmes couleurs, les mêmes polices et le même décor (le nom ne compte pas), ou tous les deux aucun.
  const lookOf = theme => JSON.stringify([theme.colors, theme.fonts, theme.decor || null]);
  const same = (a, b) => (!a && !b) || (!!a && !!b && lookOf(a) === lookOf(b));
  // Le thème `row` (un thème du document) est celui du brouillon : mêmes couleurs et polices, et son décor, s'il en a un, est le même (sans décor, il laisse celui du brouillon : le choisir ne changerait rien).
  const covers = (row, draft) => !!draft && JSON.stringify([row.colors, row.fonts]) === JSON.stringify([draft.colors, draft.fonts]) && (!row.decor || JSON.stringify(row.decor) === JSON.stringify(draft.decor || null));
  const readsOn = (theme, slot) => ColorMath.contrast(theme.colors[slot], theme.colors.bg) >= 4.5;

  function render() {
    const theme = draftOrOriginal();
    // La liste : le thème choisi (ou « Aspect d'origine » sans thème) est coché et seul atteint par Tab ; un thème personnalisé n'en coche aucun.
    const checked = checkedId();
    refs.radios.check(checked);
    // Les deux gestes du document : grisés avec leur raison (le titre) quand ils ne peuvent rien faire.
    const locked = SlideThemes.isReadOnly();
    toggleTool(refs.saveButton, !state.draft || locked, locked ? I18n.t('slides.theme.saved.locked') : (!state.draft ? I18n.t('slides.theme.save.needsTheme') : I18n.t('slides.theme.save.hint')));
    const chosenMine = typeof checked === 'string' && checked.indexOf(MINE) === 0;
    toggleTool(refs.forgetButton, !chosenMine || locked, locked ? I18n.t('slides.theme.saved.locked') : (chosenMine ? I18n.t('slides.theme.forget.hint') : I18n.t('slides.theme.forget.needsMine')));
    // L'aperçu : une diapositive aux couleurs et aux polices du brouillon.
    const vars = SlideTheme.cssVars(theme);
    Object.keys(vars).forEach(name => refs.paper.style.setProperty(name, vars[name]));
    const look = SlideTheme.shapeLook(theme);
    refs.paper.style.setProperty('--pp-theme-shape-fill', look.fill);
    refs.paper.style.setProperty('--pp-theme-shape-line', look.line);
    refs.bars.querySelectorAll('i').forEach((bar, at) => { bar.style.background = theme.colors[SlideTheme.ACCENT_SLOTS[at]]; });
    // La deuxième diapositive : elle montre le numéro et le pied même quand ils sont ôtés de la première.
    SlideDecorUi.paintDecor(refs.paper, theme, 1);
    refs.decorButton.title = I18n.t('slides.decor.open.hint') + ' ' + SlideDecorUi.summary(theme.decor);
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

  // Un bouton grisé garde son rôle et sa raison (l'info-bulle) ; un clic dessus n'a pas d'effet, le texte sous les couleurs dit pourquoi.
  function toggleTool(button, off, title) {
    button.classList.toggle('is-disabled', off);
    button.setAttribute('aria-disabled', off ? 'true' : 'false');
    button.title = title;
  }
  const say = text => { if (refs) refs.captionLine.textContent = text; };

  // « Enregistrer comme thème… » : le nom se demande (celui du thème du document dont on est parti, à défaut « Mon thème »), le thème du brouillon est rangé dans la liste du document, un nom déjà pris est remplacé.
  async function saveDraft() {
    if (!state) return;
    if (SlideThemes.isReadOnly()) { say(I18n.t('slides.theme.saved.locked')); return; }
    if (!state.draft) { say(I18n.t('slides.theme.save.needsTheme')); return; }
    const suggested = state.base && SlideThemes.savedByName(state.base) ? state.base : SlideThemes.freeName(I18n.t('slides.theme.save.default'));
    const asked = await Dialogs.prompt({ title: I18n.t('slides.theme.save.title'), label: I18n.t('slides.theme.save.label'), value: suggested, confirmLabel: I18n.t('common.save') });
    if (asked === null || !state) return;
    const name = SlideThemes.cleanName(asked);
    if (!name) { say(I18n.t('slides.theme.save.empty')); refs.saveButton.focus(); return; }
    const done = SlideThemes.save(state.draft, name);
    if (done === 'full') { say(I18n.t('slides.theme.saved.full', { max: SlideThemes.SAVED_MAX })); refs.saveButton.focus(); return; }
    if (done === 'heavy') { say(I18n.t('slides.theme.saved.heavy')); refs.saveButton.focus(); return; }
    if (done === 'locked') { say(I18n.t('slides.theme.saved.locked')); return; }
    if (done === 'invalid') { say(I18n.t('slides.theme.save.empty')); return; }
    state.draft = SlideTheme.normalize(Object.assign({}, state.draft, { name }));
    state.base = name;
    refreshList();
    render();
    say(I18n.t(done === 'replaced' ? 'slides.theme.saved.replaced' : 'slides.theme.saved.added', { name }));
    const chosen = refs.radios.buttons.find(button => button.tabIndex === 0);
    if (chosen) chosen.focus();
  }
  // « Retirer de la liste » : le thème du document qui est choisi quitte la liste ; le brouillon garde ses réglages (il devient un thème personnalisé).
  function forgetChosen() {
    if (!state) return;
    if (SlideThemes.isReadOnly()) { say(I18n.t('slides.theme.saved.locked')); return; }
    const checked = checkedId();
    if (typeof checked !== 'string' || checked.indexOf(MINE) !== 0) { say(I18n.t('slides.theme.forget.needsMine')); return; }
    const name = checked.slice(MINE.length);
    if (!SlideThemes.remove(name)) return;
    state.base = '';
    refreshList();
    render();
    say(I18n.t('slides.theme.saved.removed', { name }));
    const chosen = refs.radios.buttons.find(button => button.tabIndex === 0);
    if (chosen) chosen.focus();
  }

  // Ouvre la fenêtre sur le thème du modèle. `onClose` : rend le clavier à qui l'avait (la ligne du menu Page, l'éditeur).
  function open(onClose) {
    if (!editor()) return;
    ensure();
    fill();
    refreshList();
    const draft = SlideTheme.normalize(PageLayout.getTheme());
    const mine = draft ? SlideThemes.savedByName(draft.name) : null;
    state = { draft, slot: null, onClose, base: mine && same(mine, draft) ? mine.name : '' };
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
