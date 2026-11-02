// La VUE INTERVENANT du diaporama (extension « diapositives » de Grist Factory Suite ; demande du 02/11 : « notes, diapositive suivante, chrono, aller à une diapositive » ; carte du 02/11 : « dans le widget »). Le diaporama se
// joue dans sa fenêtre (slide-window.js, present.html) et le panneau du widget devient la console de qui présente : la diapositive en cours, la suivante, les notes, le chrono et l'heure, la liste « Aller à… ». Ce fichier est cette
// console ; slide-show.js la lance, la nourrit de ce que la fenêtre dit (`setState`) et lui passe ses ordres (`onCommand`).
//  - ELLE NE JOUE PAS : le diaporama reste celui de la fenêtre, qui est seule à savoir où il en est (la page, les animations qui restent, la page où mène « suivante » : le `STATE` du lecteur). La console dessine ce état - la
//    page en cours et la suivante, avec le MÊME code que le lecteur (SlidePlayer.surface et paintSteps : au pixel près de ce que voit le public, les objets animés dans l'état où il les voit) - et envoie des ordres : suivante, précédente,
//    saut vers une page. Un ordre n'est pas un résultat : la console ne montre que ce que la fenêtre a répondu.
//  - LES DEUX APERÇUS sont deux copies du rendu mesuré (celle du diaporama de la fenêtre est une troisième), posées dans deux cadres du panneau ; la suivante se montre terminée (toutes ses animations jouées), comme on la trouvera
//    une fois les clics faits. Un clic sur la diapositive en cours fait ce qu'il fait au diaporama : il passe à la suivante.
//  - LES NOTES (`slides[k].notes`, lues sur l'éditeur au départ : js/slide-props.js) s'affichent en texte simple, retours à la ligne gardés, à la taille que A− et A+ règlent (pour la durée de la console : rien ne s'écrit nulle part).
//    Elles ne partent jamais vers la fenêtre : le public ne les voit pas, même en partageant sa fenêtre.
//  - LE CHRONO part avec le diaporama (la première réponse de la fenêtre), se met en pause et se remet à zéro ; l'heure est celle de l'appareil. Les deux se calculent sur l'horloge (jamais en comptant des tops) : un onglet ralenti par le
//    navigateur ne les fausse pas.
//  - « ALLER À… » : la liste des diapositives par leur titre (le premier titre, à défaut le premier texte), avec la recherche de la page (SearchSelect). Une diapositive masquée y est marquée et s'atteint quand même.
//  - LE CLAVIER est celui du diaporama (→ ↓ Page suivante Espace Entrée N : suivante ; ← ↑ Page précédente Retour arrière P : précédente ; Début, Fin ; Échap : quitter) ; sur les notes, ↑ ↓ Page Début Fin les font défiler. La console
//    est une fenêtre modale : Tab y circule sans en sortir.
// Elle se pose au niveau des barres flottantes (--z-floating-toolbar) : sous les menus, pour que la liste « Aller à… » passe devant. Styles : extensions/diapositives/slide-speaker.css.
const SlideSpeaker = (function () {
  const el = Dom.el;
  const NOTES_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];   // les tailles des notes, en pixels (A−, A+)
  const NOTES_START = 2;                                   // la taille de départ : 16 px
  const WHEEL_GAP_MS = 400;                                // un cran de molette par diapositive, comme au diaporama
  const TICK_MS = 250;                                     // le chrono et l'heure se relisent à ce rythme (l'affichage ne change qu'à la seconde)
  const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
  const pad = n => (n < 10 ? '0' : '') + n;

  // `options.labels` : tous les textes, dans la langue de la page (slide-show.js:speakerLabels) ; `options.slides` : [{ title, notes, hidden }], une entrée par diapositive, dans l'ordre ; `options.onCommand(name, index)` :
  // « next », « prev » ou « jump » (le rang de la page, une fenêtre de la découpe) ; `options.onExit()` : la personne demande à quitter. La console se pose dans la page tout de suite (« Préparation… ») ; `boxes` dit où poser les
  // deux copies du rendu mesuré, `load` les lui donne.
  function create(options) {
    const { labels, slides, onCommand, onExit } = options;
    const s = { state: null, ready: false, destroyed: false, windows: [], starts: [], current: null, upcoming: null, shownSlide: -1, notesSize: NOTES_START, lastWheel: 0, tick: 0, picker: null };
    // Le chrono : le temps déjà compté (`base`) et, tant qu'il court, l'instant où il a repris (`since`).
    const clock = { started: false, running: false, base: 0, since: 0 };
    const elapsed = () => clock.base + (clock.running ? Date.now() - clock.since : 0);

    const root = el('div', 'pp-speaker');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', labels.label);
    root.tabIndex = -1;

    // Un bouton à icône : l'icône est décorative, le texte est celui de l'info-bulle et du nom accessible. Un appui ne prend pas le focus (le clavier reste à la console).
    function iconButton(className, icon, tip) {
      const button = Dom.button('pp-speaker-btn ' + className);
      Dom.setMarkup(button, Icons.svg(icon));
      const svg = button.querySelector('svg');
      if (svg) svg.setAttribute('aria-hidden', 'true');
      button.title = tip;
      button.setAttribute('aria-label', tip);
      button.addEventListener('mousedown', event => event.preventDefault());
      return button;
    }
    const setTip = (button, tip) => { button.title = tip; button.setAttribute('aria-label', tip); };
    const setDisabled = (button, off) => button.setAttribute('aria-disabled', off ? 'true' : 'false');

    // L'en-tête : précédente, numéro, suivante, « Aller à… », puis le chrono, l'heure et « Quitter ».
    const head = el('div', 'pp-speaker-head');
    const prevButton = iconButton('pp-speaker-prev', 'chevronLeft', labels.prev);
    const counter = el('span', 'pp-speaker-count');
    counter.setAttribute('aria-live', 'polite');
    const nextButton = iconButton('pp-speaker-forward', 'chevronRight', labels.nextTip);
    const goTo = Dom.button('pp-speaker-btn pp-speaker-goto');
    goTo.append(el('span', null, labels.goTo));
    const caret = el('span', 'pp-speaker-caret');
    Dom.setMarkup(caret, Icons.svg('caretDown'));
    caret.firstChild.setAttribute('aria-hidden', 'true');
    goTo.append(caret);
    goTo.title = labels.goToTip;
    goTo.setAttribute('aria-haspopup', 'listbox');
    goTo.setAttribute('aria-expanded', 'false');
    goTo.addEventListener('mousedown', event => event.preventDefault());
    const timer = el('span', 'pp-speaker-timer', '00:00');
    timer.setAttribute('role', 'timer');
    timer.setAttribute('aria-label', labels.elapsed);
    timer.title = labels.elapsed;
    const pauseButton = iconButton('pp-speaker-pause', 'chronoPause', labels.pause);
    const restartButton = iconButton('pp-speaker-restart', 'chronoRestart', labels.reset);
    const wallClock = el('span', 'pp-speaker-clock');
    wallClock.title = labels.clock;
    const exitButton = iconButton('pp-speaker-exit', 'closeFind', labels.exit);
    head.append(prevButton, counter, nextButton, goTo, el('span', 'pp-speaker-spacer'), timer, pauseButton, restartButton, wallClock, exitButton);

    // Le corps : à gauche la diapositive en cours (avec ce que le prochain clic fera) et la suivante, à droite les notes.
    const body = el('div', 'pp-speaker-body');
    const left = el('div', 'pp-speaker-col pp-speaker-previews');
    // Un aperçu : le cadre (`box`, qui porte la carte « fin ») et, dedans, la scène où le lecteur pose la page (SlidePlayer.surface) ; la scène est plus petite que le cadre de quelques pixels, le trait qui entoure la page y a sa place.
    const currentBox = el('div', 'pp-speaker-box pp-speaker-current');
    currentBox.setAttribute('aria-hidden', 'true');
    const currentStage = el('div', 'pp-speaker-stage');
    const endCard = el('div', 'pp-speaker-card', labels.nextNone);
    endCard.hidden = true;
    currentBox.append(currentStage, endCard);
    const hint = el('div', 'pp-speaker-hint');
    hint.setAttribute('role', 'status');
    const upcomingBox = el('div', 'pp-speaker-box pp-speaker-upcoming');
    upcomingBox.setAttribute('aria-hidden', 'true');
    const upcomingStage = el('div', 'pp-speaker-stage');
    const upcomingCard = el('div', 'pp-speaker-card', labels.nextNone);
    upcomingCard.hidden = true;
    upcomingBox.append(upcomingStage, upcomingCard);
    left.append(el('div', 'pp-speaker-label', labels.current), currentBox, hint, el('div', 'pp-speaker-label', labels.upcoming), upcomingBox);

    const right = el('div', 'pp-speaker-col pp-speaker-notes-col');
    const notesHead = el('div', 'pp-speaker-label');
    const sizes = el('span', 'pp-speaker-sizes');
    const smaller = Dom.button('pp-speaker-btn pp-speaker-size', 'A−');
    smaller.title = labels.smaller;
    smaller.setAttribute('aria-label', labels.smaller);
    const larger = Dom.button('pp-speaker-btn pp-speaker-size', 'A+');
    larger.title = labels.larger;
    larger.setAttribute('aria-label', labels.larger);
    [smaller, larger].forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    sizes.append(smaller, larger);
    notesHead.append(el('span', null, labels.notes), sizes);
    const notes = el('div', 'pp-speaker-notes');
    notes.tabIndex = 0;
    notes.setAttribute('role', 'region');
    notes.setAttribute('aria-label', labels.notes);
    right.append(notesHead, notes);
    body.append(left, right);

    const status = el('div', 'pp-speaker-card pp-speaker-status', labels.preparing);
    status.setAttribute('role', 'status');
    root.append(head, body, status);
    document.body.appendChild(root);

    // Une vue : une copie du rendu mesuré posée dans son cadre (`SlidePlayer.surface`, celle du diaporama) avec ses objets animés repérés par diapositive.
    function makeView(job, stage) {
      const surf = SlidePlayer.surface(job, stage);
      // Le trait autour de la page, à la taille de l'écran : le rendu est dans un arbre ombre, que la feuille de style de la console n'atteint pas ; le cadre porte donc son trait en ligne, dont la couleur et la largeur sont celles que
      // l'aperçu lui donne (`--pp-ring`, `--pp-ring-width`, qui traversent l'arbre ombre) et que l'échelle de la page (`--pp-fit`, posée par le lecteur) compense.
      surf.frame.style.outline = 'calc(var(--pp-ring-width, 1px) / var(--pp-fit, 1)) solid var(--pp-ring, transparent)';
      return { job, surf, anims: FrameAnim.framesOf(surf.stage), steps: new Map() };
    }
    // Les objets animés de la diapositive `slide`, dans l'état où ils sont quand il reste `left` clics à jouer (0 : tout est joué).
    function paint(view, slide, left) {
      const list = view.anims.get(slide);
      if (!list) return;
      let steps = view.steps.get(slide);
      if (!steps) { steps = FrameAnim.stepsOf(list).steps; view.steps.set(slide, steps); }
      SlidePlayer.paintSteps(list, steps, Math.max(1, steps.length - left));
    }

    function setNotes(text) {
      notes.textContent = text || labels.noNotes;
      notes.classList.toggle('pp-speaker-notes-empty', !text);
    }
    function applySize() {
      notes.style.fontSize = NOTES_SIZES[s.notesSize] + 'px';
      setDisabled(smaller, s.notesSize <= 0);
      setDisabled(larger, s.notesSize >= NOTES_SIZES.length - 1);
    }

    // Dessine ce que la fenêtre a dit (`setState`) : le numéro, les deux aperçus, ce que fera le prochain clic, les notes, les boutons.
    function render() {
      const st = s.state;
      if (!s.ready || !st || s.destroyed) return;
      const slide = Math.min(st.slide, slides.length - 1);
      counter.textContent = labels.counter.replace('{n}', String(slide + 1)).replace('{total}', String(slides.length));
      // La diapositive en cours (au diaporama, l'écran de fin cache la page).
      s.current.surf.frame.style.visibility = st.ended ? 'hidden' : '';
      endCard.hidden = !st.ended;
      if (!st.ended) {
        s.current.surf.place(s.windows[st.index]);
        paint(s.current, st.slide, st.left);
      }
      // La suivante : la page où mène « suivante », terminée ; la fin quand il n'y en a plus.
      const to = st.next;
      s.upcoming.surf.frame.style.visibility = to >= 0 ? '' : 'hidden';
      upcomingCard.hidden = to >= 0;
      if (to >= 0 && s.windows[to]) {
        s.upcoming.surf.place(s.windows[to]);
        paint(s.upcoming, SlidePlayer.slideAt(s.starts, s.windows[to].page), 0);
      }
      // Ce que le prochain clic fera.
      let text;
      if (st.ended) text = labels.hintEnded;
      else if (st.left > 0) text = labels.hintClick.replace('{k}', String(st.clicks - st.left + 1)).replace('{total}', String(st.clicks));
      else text = to >= 0 ? labels.hintSlide : labels.hintEnd;
      hint.textContent = text;
      hint.classList.toggle('pp-speaker-hint-click', !st.ended && st.left > 0);
      // Les notes de la diapositive ; une autre diapositive les reprend en haut.
      if (s.shownSlide !== slide) { s.shownSlide = slide; notes.scrollTop = 0; }
      setNotes((slides[slide] && slides[slide].notes) || '');
      // « Précédente » défait une animation jouée ou revient à la page d'avant.
      setDisabled(prevButton, st.prev < 0 && st.clicks <= st.left);
      if (!clock.started) startClock();
    }

    // Le chrono
    function startClock() {
      clock.started = true;
      clock.running = true;
      clock.since = Date.now();
      paintTimer();
    }
    function paintTimer() {
      const total = Math.floor(elapsed() / 1000);
      const hours = Math.floor(total / 3600);
      const text = (hours ? hours + ':' + pad(Math.floor(total % 3600 / 60)) : pad(Math.floor(total / 60))) + ':' + pad(total % 60);
      if (timer.textContent !== text) timer.textContent = text;
      const now = new Date().toLocaleTimeString(I18n.getLang(), { hour: '2-digit', minute: '2-digit' });
      if (wallClock.textContent !== now) wallClock.textContent = now;
      const tip = clock.running ? labels.pause : labels.resume;
      if (pauseButton.title !== tip) {
        setTip(pauseButton, tip);
        Dom.setMarkup(pauseButton, Icons.svg(clock.running ? 'chronoPause' : 'chronoPlay'));
        pauseButton.firstChild.setAttribute('aria-hidden', 'true');
      }
    }
    function togglePause() {
      if (!clock.started) startClock();
      if (clock.running) { clock.base = elapsed(); clock.running = false; } else { clock.since = Date.now(); clock.running = true; }
      paintTimer();
    }
    function restart() {
      clock.base = 0;
      clock.since = Date.now();
      paintTimer();
    }
    s.tick = setInterval(paintTimer, TICK_MS);
    paintTimer();

    // Les ordres
    const send = (name, index) => { if (!s.destroyed && s.ready) onCommand(name, index); };
    const goNext = () => send('next');
    const goPrev = () => { if (prevButton.getAttribute('aria-disabled') !== 'true') send('prev'); };
    prevButton.addEventListener('click', goPrev);
    nextButton.addEventListener('click', goNext);
    exitButton.addEventListener('click', () => onExit());
    pauseButton.addEventListener('click', togglePause);
    restartButton.addEventListener('click', restart);
    smaller.addEventListener('click', () => { if (s.notesSize > 0) { s.notesSize -= 1; applySize(); } });
    larger.addEventListener('click', () => { if (s.notesSize < NOTES_SIZES.length - 1) { s.notesSize += 1; applySize(); } });
    // Un clic sur la diapositive en cours passe à la suivante, comme au diaporama.
    currentBox.addEventListener('click', event => { if (event.button === 0) goNext(); });
    left.addEventListener('wheel', (event) => {
      event.preventDefault();
      const now = Date.now();
      if (now - s.lastWheel < WHEEL_GAP_MS || !event.deltaY) return;
      s.lastWheel = now;
      if (event.deltaY > 0) goNext(); else goPrev();
    }, { passive: false });
    root.addEventListener('contextmenu', event => event.preventDefault());

    // « Aller à… » : la liste des diapositives par leur titre, avec la recherche de la page.
    function closePicker() {
      const open = s.picker;
      if (!open) return;
      s.picker = null;
      goTo.setAttribute('aria-expanded', 'false');
      try { open.search.destroy(); } catch (e) { /* déjà défait */ }
      open.host.remove();
    }
    function openGoTo() {
      if (s.picker || !s.ready || s.destroyed) return;
      const host = el('div');
      host.id = 'pp-speaker-goto-search';
      const select = el('select');
      slides.forEach((slide, k) => {
        const name = (k + 1) + '. ' + (slide.title || labels.untitled.replace('{n}', String(k + 1)));
        const option = Dom.option(String(k), slide.hidden ? name + ' (' + labels.hiddenSlide + ')' : name);
        option.setAttribute('data-name', name);
        if (slide.hidden) option.setAttribute('data-hint', labels.hiddenSlide);
        select.appendChild(option);
      });
      host.appendChild(select);
      document.body.appendChild(host);
      select.selectedIndex = -1;
      const picker = { host, search: null };
      try {
        picker.search = SearchSelect.attach(select, {
          popup: true,
          anchor: () => goTo.getBoundingClientRect(),
          searchPlaceholder: labels.goToSearch,
          emptyText: labels.goToEmpty,
          // Défait après la fin de l'évènement en cours (un blur ou un clic qui ferme la liste ne doit pas retirer l'élément qui la porte). Le clavier revient à la console quand la fermeture vient de lui ou d'un choix.
          onClose: (refocus) => { setTimeout(() => { if (s.picker === picker) closePicker(); }, 0); if (refocus && !s.destroyed) root.focus({ preventScroll: true }); },
        });
      } catch (e) {
        host.remove();
        return;
      }
      s.picker = picker;
      select.addEventListener('change', () => {
        const target = SlidePlayer.firstWindowOf(s.windows, s.starts, Number(select.value));
        if (target >= 0) send('jump', target);
      });
      goTo.setAttribute('aria-expanded', 'true');
      picker.search.open();
    }
    goTo.addEventListener('click', () => { if (s.picker) closePicker(); else openGoTo(); });

    // Le clavier : celui du diaporama, tant que le clavier est dans la console (la liste « Aller à… » a le sien, hors d'elle).
    function trapTab(event) {
      const items = Array.from(root.querySelectorAll('button, [tabindex="0"]')).filter(node => !node.hidden && node.getClientRects().length);
      if (!items.length) return;
      const at = items.indexOf(document.activeElement);
      const to = event.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at < 0 || at === items.length - 1 ? 0 : at + 1);
      event.preventDefault();
      items[to].focus();
    }
    function onKey(event) {
      if (s.destroyed || event.isComposing) return;
      const target = event.target;
      if (!root.contains(target) && target !== document.body && target !== document.documentElement) return;
      // Pendant la console, aucune touche n'atteint le document en dessous.
      event.stopPropagation();
      if (event.key === 'Tab') { trapTab(event); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Entrée et Espace sur un bouton l'activent ; les touches de défilement sur les notes les font défiler.
      if (target.closest && target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
      if (target === notes && SCROLL_KEYS.indexOf(event.key) !== -1) return;
      const last = Math.max(0, s.windows.length - 1);
      const keys = {
        ArrowRight: goNext, ArrowDown: goNext, PageDown: goNext, ' ': goNext, Enter: goNext, n: goNext, N: goNext,
        ArrowLeft: goPrev, ArrowUp: goPrev, PageUp: goPrev, Backspace: goPrev, p: goPrev, P: goPrev,
        Home: () => send('jump', 0), End: () => send('jump', last), Escape: () => onExit(), F5: () => {},
      };
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    document.addEventListener('keydown', onKey, true);

    // Les deux copies du rendu mesuré (`job` : celle de la diapositive en cours, `copy` : celle de la suivante, de SlideWindow.duplicate) et ce que la découpe ne dit pas (`data.starts`) : la console les monte et dessine l'état reçu.
    function load(job, copy, data) {
      if (s.destroyed) { job.dispose(); copy.dispose(); return; }
      s.windows = job.windows;
      s.starts = data.starts || [];
      s.current = makeView(job, currentStage);
      s.upcoming = makeView(copy, upcomingStage);
      s.ready = true;
      status.hidden = true;
      applySize();
      render();
    }
    // Ce que la fenêtre du diaporama dit d'elle-même (SlideWindow : `readState`) : dessiné tout de suite, ou à `load` quand les copies ne sont pas encore là.
    function setState(state) {
      s.state = state;
      render();
    }

    // La console se ferme : minuteries, écouteurs, liste ouverte, les deux copies du rendu et son propre arbre.
    function destroy() {
      if (s.destroyed) return;
      s.destroyed = true;
      clearInterval(s.tick);
      document.removeEventListener('keydown', onKey, true);
      closePicker();
      [s.current, s.upcoming].forEach((view) => { if (view) { view.surf.destroy(); view.job.dispose(); } });
      root.remove();
    }

    applySize();
    return {
      root, boxes: { current: currentStage, upcoming: upcomingStage }, load, setState, destroy,
      // Pour les essais : le dernier état reçu, le chrono (en marche ? depuis combien de millisecondes ?).
      state: () => s.state,
      timer: () => ({ running: clock.running, started: clock.started, ms: elapsed() }),
    };
  }

  return { create };
})();
