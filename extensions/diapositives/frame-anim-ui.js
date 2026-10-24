// La fenêtre « Animation… » d'un objet de diapositive (extension « diapositives » de Grist Factory Suite ; chantier 8c de l'import PowerPoint : « animations d'objets »). Le bouton « Animation… »
// de la barre de l'objet sélectionné (js/free-frame.js) l'ouvre pour lui. Le socle (js/frame-anim.js) garde le réglage dans le HTML de l'objet et joue les mouvements ; ce fichier ne fait que
// les proposer et les poser.
//  - Un BROUILLON, comme la fenêtre « Transition… » (slide-transitions-ui.js, dont il reprend les boutons radio et les styles) : l'effet, son type (entrée ou sortie), son côté, son départ
//    (au clic, avec ou après la précédente), sa durée et son délai se choisissent sans rien écrire ; « Appliquer » pose l'animation sur l'objet (UN pas d'historique), « Annuler » (ou Échap)
//    ne change rien. « Aucune » retire l'animation.
//  - L'APERÇU joue l'effet sur un rectangle, avec les mêmes mouvements que le diaporama (FrameAnim.play), à chaque choix et à la demande.
//  - Le clavier : Tab passe d'un groupe à l'autre, les flèches changent le choix dans un groupe. Un groupe qui ne s'applique pas à l'effet (le côté d'un fondu, la durée d'une apparition) reste là,
//    grisé avec sa raison en info-bulle (rien ne disparaît), sans réponse au clic ni arrêt de Tab.
// Styles : extensions/diapositives/slide-transitions.css (la base commune) et frame-anim.css.
const FrameAnimUi = (function () {
  const el = Dom.el;
  const EFFECTS = [''].concat(FrameAnim.EFFECTS);
  // Les côtés se disent par le bord concerné (une flèche qui le désigne) ; l'info-bulle dit si l'objet en vient (entrée) ou y va (sortie).
  const SIDES = [
    { side: 'l', glyph: '←', from: 'frame.anim.fromLeft', to: 'frame.anim.toLeft' },
    { side: 'r', glyph: '→', from: 'frame.anim.fromRight', to: 'frame.anim.toRight' },
    { side: 't', glyph: '↑', from: 'frame.anim.fromTop', to: 'frame.anim.toTop' },
    { side: 'b', glyph: '↓', from: 'frame.anim.fromBottom', to: 'frame.anim.toBottom' },
  ];
  const DURATIONS = [300, 500, 1000, 1500, 2000, 3000];
  const DELAYS = [0, 500, 1000, 2000];
  const PREVIEW_DELAY_MS = 150;     // l'aperçu se rejoue un instant après le dernier choix
  const PREVIEW_REST_MS = 700;      // l'image finale reste ce temps, puis l'aperçu revient à son départ
  const CHOICE = 'pp-slide-transition-choice';

  let win = null;
  let refs = null;
  let state = null;                 // { pos, draft, onClose } : ce que la fenêtre règle
  let job = null;                   // l'aperçu en cours (FrameAnim.play)
  let timers = [];
  const EXTRA = 'pp-frame-anim-extra';  // la classe d'un choix ajouté pour la valeur d'un fichier importé (0,75 s) que la liste ne propose pas

  const secondsText = ms => I18n.t('slides.transition.seconds', { n: String(ms / 1000).replace('.', I18n.getLang() === 'fr' ? ',' : '.') });
  const nameOf = effect => I18n.t('frame.anim.' + (effect || 'none'));

  function radioGroup(label, cls) {
    const group = el('div', 'pp-slide-transition-choices ' + cls);
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    return group;
  }
  function radio(group, value, text, tip) {
    const button = Dom.button(CHOICE);
    button.setAttribute('role', 'radio');
    button.dataset.value = value;
    button.textContent = text;
    if (tip) { button.title = tip; button.setAttribute('aria-label', tip); }
    group.appendChild(button);
    return button;
  }
  // Une durée ou un délai hors de la liste (celui d'un fichier importé, 0,75 s par exemple) s'y ajoute en bouton coché, à sa place dans l'ordre : sans lui, aucun bouton n'est coché et Tab saute le groupe.
  // Il reste proposé tant que la fenêtre est ouverte (on peut y revenir) ; la prochaine ouverture repart de la liste.
  function addChoice(group, value) {
    if (group.querySelector('[data-value="' + value + '"]')) return;
    const button = radio(group, String(value), secondsText(value));
    button.classList.add(EXTRA);
    const next = Array.from(group.querySelectorAll('.' + CHOICE)).find(other => other !== button && Number(other.dataset.value) > value);
    if (next) group.insertBefore(button, next);
  }
  function dropExtras() {
    if (refs) refs.win.querySelectorAll('.' + EXTRA).forEach(button => button.remove());
  }
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-frame-anim', titleId: 'pp-frame-anim-title', size: 'lg', boxClass: 'pp-slide-transition-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-transition-intro', I18n.t('frame.anim.intro'));
    intro.id = 'pp-frame-anim-intro';
    win.box.setAttribute('aria-describedby', intro.id);
    const label = (key) => el('div', 'pp-slide-transition-label', I18n.t(key));
    const group = (key, cls) => radioGroup(I18n.t(key), cls);
    const pair = (...nodes) => { const box = el('div', 'pp-slide-transition-pair'); box.append(...nodes); return box; };

    const effects = group('frame.anim.effect', 'pp-frame-anim-effects');
    EFFECTS.forEach(effect => radio(effects, effect, nameOf(effect)));
    const kinds = group('frame.anim.kind', 'pp-frame-anim-kinds');
    radio(kinds, 'in', I18n.t('frame.anim.in'));
    radio(kinds, 'out', I18n.t('frame.anim.out'));
    const sides = group('frame.anim.side', 'pp-slide-transition-sides');
    SIDES.forEach(item => radio(sides, item.side, item.glyph));
    const starts = group('frame.anim.start', 'pp-frame-anim-starts');
    FrameAnim.STARTS.forEach(start => radio(starts, start, I18n.t('frame.anim.' + start)));
    const durations = group('frame.anim.duration', 'pp-slide-transition-durations');
    DURATIONS.forEach(ms => radio(durations, String(ms), secondsText(ms)));
    const delays = group('frame.anim.delay', 'pp-slide-transition-durations');
    DELAYS.forEach(ms => radio(delays, String(ms), secondsText(ms)));

    const controls = el('div', 'pp-slide-transition-controls');
    const pairs = (...items) => { const box = el('div', 'pp-slide-transition-pairs'); box.append(...items.map(([key, node]) => pair(label(key), node))); return box; };
    controls.append(label('frame.anim.effect'), effects, pairs(['frame.anim.kind', kinds], ['frame.anim.side', sides]), label('frame.anim.start'), starts, pairs(['frame.anim.duration', durations], ['frame.anim.delay', delays]));

    const preview = el('div', 'pp-slide-transition-preview');
    preview.setAttribute('aria-hidden', 'true');
    const sample = el('div', 'pp-frame-anim-sample', I18n.t('frame.anim.object'));
    const box = el('div', 'pp-free-frame-box pp-frame-anim-box');
    box.appendChild(sample);
    preview.appendChild(box);
    const replayButton = Dom.button('pp-slide-transition-replay', I18n.t('frame.anim.preview'));
    replayButton.setAttribute('aria-label', I18n.t('frame.anim.previewLabel'));
    const side = el('div', 'pp-slide-transition-side');
    side.append(preview, replayButton);

    const columns = el('div', 'pp-slide-transition-columns');
    columns.append(controls, side);
    win.body.append(intro, columns);

    const { cancel, ok } = win.addButtons();
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('frame.anim.apply');
    cancel.addEventListener('click', close);
    ok.addEventListener('click', commit);
    replayButton.addEventListener('click', () => replay());

    effects.addEventListener('click', event => choose('effect', event));
    kinds.addEventListener('click', event => choose('exit', event));
    sides.addEventListener('click', event => choose('side', event));
    starts.addEventListener('click', event => choose('start', event));
    durations.addEventListener('click', event => choose('dur', event));
    delays.addEventListener('click', event => choose('delay', event));
    [effects, kinds, sides, starts, durations, delays].forEach(one => one.addEventListener('keydown', event => onRadioKey(one, event)));
    refs = { win: win.box, effects, kinds, sides, starts, durations, delays, preview, box };
  }

  // Le brouillon et ce que la fenêtre en montre : { effect ('' : aucune), exit, side, start, dur, delay } ; l'ordre dans la diapositive (`order`) est celui de l'objet, que la fenêtre ne change pas.
  const specOf = () => FrameAnim.normalized(Object.assign({}, state.draft));
  function choose(field, event) {
    const button = event.target.closest('.' + CHOICE);
    if (!button || !state || button.closest('[aria-disabled="true"]')) return;
    const value = button.dataset.value;
    state.draft[field] = field === 'exit' ? value === 'out' : (field === 'dur' || field === 'delay' ? Number(value) : value);
    render();
    scheduleReplay();
  }
  // Un groupe de boutons radio : le choix est l'unique bouton atteint par Tab ; les flèches le déplacent (et le choisissent), Début et Fin vont aux bouts.
  function onRadioKey(group, event) {
    if (group.getAttribute('aria-disabled') === 'true') return;
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const buttons = Array.from(group.querySelectorAll('.' + CHOICE + ':not([aria-disabled="true"])'));
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
  // Un groupe qui ne s'applique pas à l'effet choisi reste là, grisé : sa raison en info-bulle, plus de réponse au clic, plus d'arrêt de Tab. Son choix reste coché.
  function mark(group, current, enabled, reason) {
    Array.from(group.querySelectorAll('.' + CHOICE)).forEach((button) => {
      const on = button.dataset.value === String(current);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.tabIndex = on && enabled ? 0 : -1;
    });
    if (enabled) { group.removeAttribute('aria-disabled'); group.removeAttribute('title'); }
    else { group.setAttribute('aria-disabled', 'true'); group.title = reason; }
  }
  function render() {
    const draft = state.draft;
    const a = FrameAnim.normalized(draft);
    const effect = a ? a.effect : '';
    const out = !!draft.exit;
    const none = I18n.t('frame.anim.noEffect');
    mark(refs.effects, effect, true);
    mark(refs.kinds, out ? 'out' : 'in', !!a, none);
    mark(refs.sides, a && a.side ? a.side : draft.side, !!a && FrameAnim.SIDED.includes(effect), a ? I18n.t('frame.anim.noSide') : none);
    refs.sides.querySelectorAll('.' + CHOICE).forEach((button) => {
      const item = SIDES.find(other => other.side === button.dataset.value);
      const tip = I18n.t(out ? item.to : item.from);
      button.title = tip;
      button.setAttribute('aria-label', tip);
    });
    mark(refs.starts, draft.start, !!a, none);
    mark(refs.durations, a ? a.dur : draft.dur, !!a && effect !== 'appear', a ? I18n.t('frame.anim.noDuration') : none);
    mark(refs.delays, draft.delay, !!a, none);
  }

  // L'aperçu
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function stopJob() {
    if (!job) return;
    const stopped = job;
    job = null;
    stopped.cancel();
  }
  // L'aperçu au repos : le rectangle est là, comme l'objet une fois son animation jouée.
  const rest = () => { if (refs) refs.box.style.visibility = ''; };
  function replay() {
    if (!state) return;
    clearTimers();
    stopJob();
    const a = specOf();
    rest();
    if (!a) return;
    const page = { width: refs.preview.clientWidth, height: refs.preview.clientHeight };
    const mine = FrameAnim.play(refs.box, a, { page });
    job = mine;
    mine.finished.then(() => { if (job === mine) { job = null; timers.push(setTimeout(rest, PREVIEW_REST_MS)); } });
  }
  function scheduleReplay() {
    clearTimers();
    timers.push(setTimeout(replay, PREVIEW_DELAY_MS));
  }

  // Ouvre la fenêtre pour l'objet qui est à la position `pos` du texte de l'éditeur. `onClose` : rend le clavier à qui l'avait.
  function open(ed, pos, onClose) {
    const node = ed && ed.state.doc.nodeAt(pos);
    if (!node) return;
    ensure();
    const a = FrameAnim.normalized(FreeFrame.normalized(node.attrs).anim);
    state = { ed, pos, onClose, order: a ? a.order : 0, draft: { effect: a ? a.effect : '', exit: a ? a.exit : false, side: a && a.side ? a.side : 'b', start: a ? a.start : 'click', dur: a ? a.dur : FrameAnim.DURATION.def, delay: a ? a.delay : 0 } };
    dropExtras();
    addChoice(refs.durations, state.draft.dur);
    addChoice(refs.delays, state.draft.delay);
    render();
    rest();
    win.title.textContent = I18n.t('frame.anim.title');
    win.show(() => refs.effects.querySelector('[aria-checked="true"]'));
    if (a) timers.push(setTimeout(replay, PREVIEW_DELAY_MS));
  }
  function close() {
    if (!win || !win.isOpen()) return;
    const finished = state;
    clearTimers();
    stopJob();
    state = null;
    win.hide();
    if (finished && finished.onClose) finished.onClose();
    else if (finished && finished.ed) finished.ed.view.focus();
  }
  // Pose le brouillon sur l'objet : UN pas d'historique ; rien quand il est tel quel.
  function commit() {
    if (!state) { close(); return; }
    const { ed, pos } = state;
    const spec = specOf();
    const text = spec ? FrameAnim.text(Object.assign({}, spec, { order: state.order })) : '';
    const node = ed.state.doc.nodeAt(pos);
    close();
    if (!node) { SlidesEntry.status(I18n.t('frame.anim.gone')); return; }
    if (!FreeFrame.patch(ed, pos, { anim: text }, true)) { SlidesEntry.status(I18n.t('frame.anim.unchanged')); return; }
    SlidesEntry.status(I18n.t(text ? 'frame.anim.applied' : 'frame.anim.removed'));
  }

  return { open, close, isOpen: () => !!win && win.isOpen() };
})();
