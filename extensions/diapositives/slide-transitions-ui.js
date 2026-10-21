// La fenêtre « Transition… » d'une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10 à 18:35 : « transitions »). La ligne « Transition… » du menu ⋯ d'une
// miniature (extensions/diapositives/slide-strip.js) ouvre cette fenêtre pour la diapositive visée, ou pour tout le choix de plusieurs. Le socle (js/slide-props.js) garde la transition dans
// le texte de la diapositive ; ce fichier ne fait que la proposer et la poser.
//  - Un BROUILLON : l'effet, son côté (une flèche : le sens où ça bouge) et sa durée se choisissent sans rien écrire ; « Appliquer » pose la transition sur la ou les diapositives (UN pas
//    d'historique), « Appliquer à toutes » sur toutes celles de la présentation, « Annuler » (ou Échap) ne change rien. « Aucune » retire la transition.
//  - L'APERÇU rejoue l'effet entre deux cartes (« Avant », « Après »), avec les mêmes animations que le diaporama (slide-transitions.js), à chaque choix et à la demande.
//  - Le clavier : Tab passe d'un groupe à l'autre, les flèches changent le choix dans un groupe (un choix d'effet, de côté ou de durée est un bouton radio). La direction et la durée ne
//    s'appliquent pas à tout effet : le groupe qui ne s'applique pas reste là, grisé avec sa raison en info-bulle (rien ne disparaît), sans réponse au clic ni arrêt de Tab.
//  - Les miniatures portent une pastille quand la diapositive a une transition ; son info-bulle la dit (describe).
// Styles : extensions/diapositives/slide-transitions.css.
const SlideTransitionsUi = (function () {
  const el = Dom.el;
  const EFFECTS = [''].concat(SlideProps.KINDS);
  // Les côtés d'où la diapositive arrive, présentés par le sens du mouvement (celui de l'effet qu'on voit, et des fichiers PowerPoint) : « vers la gauche » est `r`.
  const SIDES = [
    { side: 'r', glyph: '←', key: 'slides.transition.toLeft' },
    { side: 'l', glyph: '→', key: 'slides.transition.toRight' },
    { side: 'b', glyph: '↑', key: 'slides.transition.toTop' },
    { side: 't', glyph: '↓', key: 'slides.transition.toBottom' },
  ];
  const DURATIONS = [300, 500, 700, 1000, 1500, 2000];
  const PREVIEW_DELAY_MS = 150;     // l'aperçu se rejoue un instant après le dernier choix
  const PREVIEW_REST_MS = 700;      // l'image d'arrivée reste ce temps, puis l'aperçu revient à « Avant »

  let win = null;
  let refs = null;
  let state = null;                 // { indexes, draft, onClose } : ce que la fenêtre règle
  let job = null;                   // l'aperçu en cours (SlideTransitions.play)
  let timers = [];

  const editor = () => EditorCore.getEditor();
  const secondsText = ms => I18n.t('slides.transition.seconds', { n: String(ms / 1000).replace('.', I18n.getLang() === 'fr' ? ',' : '.') });
  const nameOf = kind => I18n.t('slides.transition.' + (kind || 'none'));
  const sideKey = side => (SIDES.find(item => item.side === side) || SIDES[0]).key;
  // Ce que dit l'info-bulle d'une pastille : « Poussée, vers la gauche, 0,7 s ».
  function describe(props) {
    const a = SlideProps.normalized(props);
    const parts = [nameOf(a.transition)];
    if (SlideProps.SIDED.includes(a.transition)) parts.push(I18n.t(sideKey(a.from)).toLowerCase());
    parts.push(secondsText(a.dur));
    return parts.join(', ');
  }

  // La fenêtre
  function radioGroup(label, cls) {
    const group = el('div', 'pp-slide-transition-choices ' + cls);
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    return group;
  }
  function radio(group, value, text, tip) {
    const button = Dom.button('pp-slide-transition-choice');
    button.setAttribute('role', 'radio');
    button.dataset.value = value;
    button.textContent = text;
    if (tip) { button.title = tip; button.setAttribute('aria-label', tip); }
    group.appendChild(button);
    return button;
  }
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-transition', titleId: 'pp-slide-transition-title', size: 'lg', boxClass: 'pp-slide-transition-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-transition-intro', I18n.t('slides.transition.intro'));
    intro.id = 'pp-slide-transition-intro';
    win.box.setAttribute('aria-describedby', intro.id);
    const mixed = el('p', 'pp-slide-transition-mixed', I18n.t('slides.transition.mixed'));
    mixed.hidden = true;

    const effectsLabel = el('div', 'pp-slide-transition-label', I18n.t('slides.transition.effect'));
    const effects = radioGroup(I18n.t('slides.transition.effect'), 'pp-slide-transition-effects');
    EFFECTS.forEach(kind => radio(effects, kind, nameOf(kind)));
    const sidesLabel = el('div', 'pp-slide-transition-label', I18n.t('slides.transition.direction'));
    const sides = radioGroup(I18n.t('slides.transition.direction'), 'pp-slide-transition-sides');
    SIDES.forEach(item => radio(sides, item.side, item.glyph, I18n.t(item.key)));
    const durationLabel = el('div', 'pp-slide-transition-label', I18n.t('slides.transition.duration'));
    const durations = radioGroup(I18n.t('slides.transition.duration'), 'pp-slide-transition-durations');
    DURATIONS.forEach(ms => radio(durations, String(ms), secondsText(ms)));
    const controls = el('div', 'pp-slide-transition-controls');
    controls.append(effectsLabel, effects, sidesLabel, sides, durationLabel, durations);

    const preview = el('div', 'pp-slide-transition-preview');
    preview.setAttribute('aria-hidden', 'true');
    const before = el('div', 'pp-slide-transition-card pp-slide-transition-before', I18n.t('slides.transition.previewBefore'));
    const after = el('div', 'pp-slide-transition-card pp-slide-transition-after', I18n.t('slides.transition.previewAfter'));
    preview.append(before, after);
    const replayButton = Dom.button('pp-slide-transition-replay', I18n.t('slides.transition.preview'));
    replayButton.setAttribute('aria-label', I18n.t('slides.transition.previewLabel'));
    const side = el('div', 'pp-slide-transition-side');
    side.append(preview, replayButton);

    const columns = el('div', 'pp-slide-transition-columns');
    columns.append(controls, side);
    win.body.append(intro, mixed, columns);

    const { first, cancel, ok } = win.addButtons('pp-slide-transition-all');
    first.textContent = I18n.t('slides.transition.applyAll');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('slides.transition.apply');
    first.addEventListener('click', () => commit(true));
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => commit(false));
    replayButton.addEventListener('click', () => replay());

    effects.addEventListener('click', event => choose('transition', event));
    sides.addEventListener('click', event => choose('from', event));
    durations.addEventListener('click', event => choose('dur', event));
    [effects, sides, durations].forEach(group => group.addEventListener('keydown', event => onRadioKey(group, event)));
    refs = { mixed, effects, sides, durations, before, after };
  }

  // Le brouillon et ce que la fenêtre en montre
  const specOf = () => Object.assign({}, state.draft);
  function choose(field, event) {
    const button = event.target.closest('.pp-slide-transition-choice');
    if (!button || !state || button.closest('[aria-disabled="true"]')) return;
    state.draft[field] = field === 'dur' ? Number(button.dataset.value) : button.dataset.value;
    render();
    scheduleReplay();
  }
  // Un groupe de boutons radio : le choix est l'unique bouton atteint par Tab ; les flèches le déplacent (et le choisissent), Début et Fin vont aux bouts.
  function onRadioKey(group, event) {
    if (group.getAttribute('aria-disabled') === 'true') return;
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const buttons = Array.from(group.querySelectorAll('.pp-slide-transition-choice'));
    const at = buttons.indexOf(document.activeElement);
    let to = -1;
    if (keys[event.key]) to = (Math.max(at, 0) + keys[event.key] + buttons.length) % buttons.length;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = buttons.length - 1;
    if (to < 0) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[to].focus();
    buttons[to].click();
  }
  // Un groupe qui ne s'applique pas à l'effet choisi reste là, grisé : sa raison en info-bulle, plus de réponse au clic, plus d'arrêt de Tab. Son choix reste coché (celui qui servira au prochain effet qui l'utilise).
  function mark(group, current, enabled, reason) {
    const buttons = Array.from(group.querySelectorAll('.pp-slide-transition-choice'));
    buttons.forEach((button) => {
      const on = button.dataset.value === String(current);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.tabIndex = on && enabled ? 0 : -1;
    });
    if (enabled) { group.removeAttribute('aria-disabled'); group.removeAttribute('title'); }
    else { group.setAttribute('aria-disabled', 'true'); group.title = reason; }
  }
  function render() {
    const a = SlideProps.normalized(state.draft);
    mark(refs.effects, a.transition, true);
    mark(refs.sides, a.from, SlideProps.SIDED.includes(a.transition), I18n.t('slides.transition.noDirection'));
    mark(refs.durations, a.dur, !SlideProps.isNone(a), I18n.t('slides.transition.noDuration'));
  }

  // L'aperçu
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function stopJob() {
    if (!job) return;
    const stopped = job;
    job = null;
    stopped.cancel();
  }
  const rest = () => { if (refs) refs.after.style.visibility = 'hidden'; };
  function replay() {
    if (!state) return;
    clearTimers();
    stopJob();
    const spec = SlideProps.normalized(specOf());
    refs.after.style.visibility = '';
    if (SlideProps.isNone(spec)) {
      timers.push(setTimeout(rest, PREVIEW_REST_MS * 2));
      return;
    }
    const mine = SlideTransitions.play(refs.before, refs.after, spec, {});
    job = mine;
    mine.done.then(() => { if (job === mine) { job = null; timers.push(setTimeout(rest, PREVIEW_REST_MS)); } });
  }
  function scheduleReplay() {
    clearTimers();
    timers.push(setTimeout(replay, PREVIEW_DELAY_MS));
  }

  // Ouvre la fenêtre pour les diapositives `indexes` (leurs rangs dans le texte de l'éditeur). `onClose` : rend le clavier à qui l'avait (la miniature, l'éditeur).
  function open(indexes, onClose) {
    const ed = editor();
    if (!ed || !indexes || !indexes.length) return;
    ensure();
    const list = SlideProps.listOf(ed.state.doc);
    const first = list[indexes[0]] || null;
    const same = (a, b) => (!a && !b) || (!!a && !!b && a.transition === b.transition && a.from === b.from && a.dur === b.dur);
    const mixed = indexes.some(index => !same(list[index] || null, first));
    state = { indexes: indexes.slice(), draft: Object.assign({}, SlideProps.DEFAULTS, first || {}), onClose };
    win.title.textContent = indexes.length > 1 ? I18n.t('slides.transition.titleMany', { n: indexes.length }) : I18n.t('slides.transition.title', { n: indexes[0] + 1 });
    refs.mixed.hidden = !mixed;
    render();
    rest();
    win.show(() => refs.effects.querySelector('[aria-checked="true"]'));
    if (!SlideProps.isNone(state.draft)) timers.push(setTimeout(replay, PREVIEW_DELAY_MS));
  }
  function close() {
    if (!win || !win.isOpen()) return;
    const finished = state;
    clearTimers();
    stopJob();
    state = null;
    win.hide();
    if (finished && finished.onClose) finished.onClose();
  }
  // Pose le brouillon : sur les diapositives de la fenêtre, ou sur toutes (« Appliquer à toutes »).
  function commit(everySlide) {
    const ed = editor();
    if (!state || !ed) { close(); return; }
    const spec = SlideProps.normalized(specOf());
    const total = SlideProps.slidesOf(ed.state.doc).length;
    const indexes = everySlide ? Array.from({ length: total }, (_, k) => k) : state.indexes;
    const changed = SlideProps.apply(ed, indexes, spec);
    close();
    // -1 : l'éditeur a refusé (une diapositive bloquée par son lien) et la ligne d'état dit déjà pourquoi.
    if (changed < 0) return;
    if (!changed) SlidesEntry.status(I18n.t('slides.transition.unchanged'));
    else SlidesEntry.status(I18n.t(SlideProps.isNone(spec) ? 'slides.transition.removed' : 'slides.transition.applied', { n: changed }));
  }

  return { open, close, describe, isOpen: () => !!win && win.isOpen() };
})();
