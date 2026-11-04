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
//  - L'ÉCRAN NOIR, L'ÉCRAN BLANC ET LE STYLO (demande du 04/11) : quatre boutons au-dessus de la diapositive en cours. B couvre l'écran du public de noir, W de blanc, la même touche (ou le bouton, ou un clic dans la fenêtre) le
//    rend ; la console, elle, reste affichée. Le stylo (D) trace à la souris sur la diapositive en cours : le trait est dessiné tout de suite ici et part, par petits envois de points (des parts de la page, de 0 à 1), vers la fenêtre, qui
//    le dessine au même endroit à sa taille ; E (ou le bouton) efface, et changer de page efface aussi. Un clic ne passe pas à la suivante pendant qu'on dessine ; Échap finit le stylo avant de quitter. Derrière un écran, le stylo ne
//    trace pas. Ni l'un ni l'autre ne touche au document. C'est la fenêtre qui sait ce qu'elle montre (`screen` dans son état) : les boutons ne disent que ce qu'elle a répondu.
//  - LE CLAVIER est celui du diaporama (→ ↓ Page suivante Espace Entrée N : suivante ; ← ↑ Page précédente Retour arrière P : précédente ; Début, Fin ; B W : écran noir, blanc ; D E : stylo, effacer ; Échap : quitter) ; sur les
//    notes, ↑ ↓ Page Début Fin les font défiler. La console est une fenêtre modale : Tab y circule sans en sortir.
// Elle se pose au niveau des barres flottantes (--z-floating-toolbar) : sous les menus, pour que la liste « Aller à… » passe devant. Styles : extensions/diapositives/slide-speaker.css.
const SlideSpeaker = (function () {
  const el = Dom.el;
  const NOTES_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];   // les tailles des notes, en pixels (A−, A+)
  const NOTES_START = 2;                                   // la taille de départ : 16 px
  const WHEEL_GAP_MS = 400;                                // un cran de molette par diapositive, comme au diaporama
  const TICK_MS = 250;                                     // le chrono et l'heure se relisent à ce rythme (l'affichage ne change qu'à la seconde)
  const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
  const INK_FLUSH_MS = 30;                                 // les points du stylo partent par envois, à ce rythme au plus...
  const INK_FLUSH_POINTS = 64;                             // ... ou dès qu'il y en a autant (un envoi porte 256 nombres au plus : slide-player.js:inkLayer)
  const TIP_DELAY_MS = 350;                                // la bulle d'un outil vient après ce temps de survol (comme celles de la barre et des liens)
  const TIP_GAP = 6;                                       // son écart au bouton, en pixels...
  const TIP_EDGE = 4;                                      // ... et ce qu'il lui reste de marge au bord de la console
  const pad = n => (n < 10 ? '0' : '') + n;
  const part = value => Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;   // une part de la page, de 0 à 1, à quatre décimales

  // `options.labels` : tous les textes, dans la langue de la page (slide-show.js:speakerLabels) ; `options.slides` : [{ title, notes, hidden }], une entrée par diapositive, dans l'ordre ; `options.onCommand(name, index, points)` :
  // « next », « prev », « jump » (le rang de la page, une fenêtre de la découpe), « screen » (1 l'écran noir, 2 le blanc : le mode déjà montré se retire), « ink » (les `points` d'un envoi du stylo ; `index` 1 quand ils commencent
  // un trait) ou « inkClear » ; `options.onExit()` : la personne demande à quitter. La console se pose dans la page tout de suite (« Préparation… ») ; `boxes` dit où poser les deux copies du rendu mesuré, `load` les lui donne.
  // Ses sorties pour l'extérieur : `setState` (ce que la fenêtre dit d'elle-même) et `reset` (la fenêtre repart de zéro : le tracé qu'elle gardait n'est plus).
  function create(options) {
    const { labels, slides, onCommand, onExit } = options;
    const s = { state: null, ready: false, destroyed: false, windows: [], starts: [], current: null, upcoming: null, shownSlide: -1, notesSize: NOTES_START, lastWheel: 0, tick: 0, picker: null, pen: false, stroke: null, inkPlace: null, hintText: '', tipTimer: 0 };
    let mirror = null;               // le tracé tel que la console le fait, posé sur la copie de la diapositive en cours (le même calque que celui de la fenêtre : SlidePlayer.inkLayer)
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
    // Les outils, à droite du titre de la diapositive en cours : l'écran noir, l'écran blanc, le stylo, l'effacement. Les trois premiers s'enfoncent (`aria-pressed`) quand ils sont en service.
    const tools = el('span', 'pp-speaker-tools');
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', labels.tools);
    const blackButton = iconButton('pp-speaker-tool pp-speaker-black', 'speakerBlack', labels.black);
    const whiteButton = iconButton('pp-speaker-tool pp-speaker-white', 'speakerWhite', labels.white);
    const penButton = iconButton('pp-speaker-tool pp-speaker-pen', 'speakerPen', labels.pen);
    const eraseButton = iconButton('pp-speaker-tool pp-speaker-erase', 'speakerErase', labels.erase);
    [blackButton, whiteButton, penButton].forEach(button => button.setAttribute('aria-pressed', 'false'));
    setDisabled(eraseButton, true);
    tools.append(blackButton, whiteButton, penButton, eraseButton);
    // Le DÉTAIL de chaque outil (demande du 04/11 : « en hover à la souris on ait le détail de ce que ces boutons font ») : une bulle au survol et au focus clavier, celle des liens de l'éditeur (le nom en gras, ce que l'outil fait
    // dessous), posée dans le cadre de la console sans rien déplacer. Le détail se lit aussi par `aria-describedby` ; un outil n'a donc pas de `title` : il doublerait la bulle.
    const tip = el('div', 'pp-speaker-tip');
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const tipName = el('span', 'pp-speaker-tip-name');
    const tipText = el('span', 'pp-speaker-tip-text');
    tip.append(tipName, tipText);
    function hideTip() {
      clearTimeout(s.tipTimer);
      s.tipTimer = 0;
      tip.hidden = true;
    }
    // Sous le bouton, centrée sur lui et tenue dans la console ; au-dessus quand il n'y a pas la place dessous.
    function showTip(button, detail) {
      s.tipTimer = 0;
      if (s.destroyed || !button.isConnected) return;
      tipName.textContent = button.getAttribute('aria-label');
      tipText.textContent = detail;
      tip.hidden = false;
      // Mesurée au coin de la fenêtre : là où l'a laissée la précédente, près du bord droit, la largeur disponible la serrerait (étroite et haute).
      tip.style.left = '0px';
      tip.style.top = '0px';
      const box = button.getBoundingClientRect();
      const size = tip.getBoundingClientRect();
      const below = box.bottom + TIP_GAP + size.height <= window.innerHeight - TIP_EDGE;
      tip.style.top = Math.max(TIP_EDGE, below ? box.bottom + TIP_GAP : box.top - TIP_GAP - size.height) + 'px';
      tip.style.left = Math.max(TIP_EDGE, Math.min(box.left + box.width / 2 - size.width / 2, window.innerWidth - size.width - TIP_EDGE)) + 'px';
    }
    function toolTip(button, key, detail) {
      button.removeAttribute('title');
      const note = el('span', 'pp-speaker-detail', detail);
      note.id = 'pp-speaker-detail-' + key;
      note.hidden = true;
      tools.append(note);
      button.setAttribute('aria-describedby', note.id);
      const arm = () => { clearTimeout(s.tipTimer); s.tipTimer = setTimeout(() => showTip(button, detail), TIP_DELAY_MS); };
      button.addEventListener('mouseenter', arm);
      button.addEventListener('focus', () => { if (button.matches(':focus-visible')) arm(); });
      ['mouseleave', 'blur', 'mousedown'].forEach(type => button.addEventListener(type, hideTip));
    }
    toolTip(blackButton, 'black', labels.blackTip);
    toolTip(whiteButton, 'white', labels.whiteTip);
    toolTip(penButton, 'pen', labels.penTip);
    toolTip(eraseButton, 'erase', labels.eraseTip);
    const currentHead = el('div', 'pp-speaker-label');
    currentHead.append(el('span', 'pp-speaker-label-text', labels.current), tools);
    const hint = el('div', 'pp-speaker-hint');
    hint.setAttribute('role', 'status');
    const upcomingBox = el('div', 'pp-speaker-box pp-speaker-upcoming');
    upcomingBox.setAttribute('aria-hidden', 'true');
    const upcomingStage = el('div', 'pp-speaker-stage');
    const upcomingCard = el('div', 'pp-speaker-card', labels.nextNone);
    upcomingCard.hidden = true;
    upcomingBox.append(upcomingStage, upcomingCard);
    left.append(currentHead, currentBox, hint, el('div', 'pp-speaker-label', labels.upcoming), upcomingBox);

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
    root.append(head, body, status, tip);
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
      // Le tracé n'a de sens que sur la page où il a été fait : une autre page, ou la fin, l'efface (la fenêtre fait de même).
      const place = st.ended ? -1 : st.index;
      if (place !== s.inkPlace) { s.inkPlace = place; dropInk(); }
      // Ce que le prochain clic fera.
      let text;
      if (st.ended) text = labels.hintEnded;
      else if (st.left > 0) text = labels.hintClick.replace('{k}', String(st.clicks - st.left + 1)).replace('{total}', String(st.clicks));
      else text = to >= 0 ? labels.hintSlide : labels.hintEnd;
      s.hintText = text;
      paintTools();
      // Les notes de la diapositive ; une autre diapositive les reprend en haut.
      if (s.shownSlide !== slide) { s.shownSlide = slide; notes.scrollTop = 0; }
      setNotes((slides[slide] && slides[slide].notes) || '');
      // « Précédente » défait une animation jouée ou revient à la page d'avant.
      setDisabled(prevButton, st.prev < 0 && st.clicks <= st.left);
      if (!clock.started) startClock();
    }

    // Les boutons et la phrase d'aide disent l'état du moment : l'écran que le public voit (la fenêtre l'a dit), le stylo, sinon ce que le prochain clic fera. L'écran en service prend la phrase en négatif : c'est ce qu'il ne faut pas oublier.
    function paintTools() {
      const st = s.state;
      const screen = st ? st.screen : 0;
      blackButton.setAttribute('aria-pressed', screen === 1 ? 'true' : 'false');
      whiteButton.setAttribute('aria-pressed', screen === 2 ? 'true' : 'false');
      penButton.setAttribute('aria-pressed', s.pen ? 'true' : 'false');
      setDisabled(eraseButton, !mirror || mirror.count() === 0);
      currentBox.classList.toggle('pp-speaker-inking', s.pen);
      let text = s.hintText;
      if (screen) text = screen === 1 ? labels.hintBlack : labels.hintWhite;
      else if (s.pen) text = labels.hintPen;
      if (hint.textContent !== text) hint.textContent = text;
      hint.classList.toggle('pp-speaker-hint-click', !screen && !s.pen && !!st && !st.ended && st.left > 0);
      hint.classList.toggle('pp-speaker-hint-screen', !!screen);
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
    const send = (name, index, points) => { if (!s.destroyed && s.ready) onCommand(name, index, points); };
    const goNext = () => send('next');
    const goPrev = () => { if (prevButton.getAttribute('aria-disabled') !== 'true') send('prev'); };
    prevButton.addEventListener('click', goPrev);
    nextButton.addEventListener('click', goNext);
    exitButton.addEventListener('click', () => onExit());
    pauseButton.addEventListener('click', togglePause);
    restartButton.addEventListener('click', restart);
    smaller.addEventListener('click', () => { if (s.notesSize > 0) { s.notesSize -= 1; applySize(); } });
    larger.addEventListener('click', () => { if (s.notesSize < NOTES_SIZES.length - 1) { s.notesSize += 1; applySize(); } });
    // Un clic sur la diapositive en cours passe à la suivante, comme au diaporama - sauf au stylo, où l'on dessine.
    currentBox.addEventListener('click', event => { if (event.button === 0 && !s.pen) goNext(); });

    // L'écran noir et l'écran blanc : la fenêtre en décide (le mode déjà montré se retire) et le dit dans son état.
    const toggleScreen = mode => send('screen', mode);
    blackButton.addEventListener('click', () => toggleScreen(1));
    whiteButton.addEventListener('click', () => toggleScreen(2));

    // Le stylo. Le tracé se dessine tout de suite sur la copie de la diapositive en cours (`mirror`) et part, par envois de points (des parts de la page), vers la fenêtre qui le dessine pareil à sa taille : même calque (SlidePlayer.inkLayer),
    // mêmes envois, si bien que les deux sont les mêmes. On ne trace que sur une page montrée au public : ni l'écran de fin, ni derrière un écran noir ou blanc (la fenêtre ne tracerait rien non plus).
    const canDraw = () => !!(s.ready && !s.destroyed && mirror && s.state && !s.state.ended && !s.state.screen);
    function flushInk() {
      const stroke = s.stroke;
      if (!stroke) return;
      clearTimeout(stroke.timer);
      stroke.timer = 0;
      const points = stroke.buffer;
      stroke.buffer = [];
      if (!points.length || !canDraw()) return;
      const first = stroke.first;
      stroke.first = false;
      mirror.add(points, first);
      send('ink', first ? 1 : 0, points);
      paintTools();
    }
    // Le trait fini : les derniers points partent, le suivant en commencera un autre.
    function endStroke() {
      if (!s.stroke) return;
      flushInk();
      if (mirror) mirror.end();
      s.stroke = null;
    }
    // Rien de ce qui n'est pas parti ne part : le trait en cours est lâché, le tracé de la copie effacé (une autre page, la fenêtre repartie de zéro).
    function dropInk() {
      if (s.stroke) { clearTimeout(s.stroke.timer); s.stroke = null; }
      if (mirror) { mirror.end(); mirror.clear(); }
      paintTools();
    }
    function eraseInk() {
      endStroke();
      if (!mirror) return;
      const had = mirror.count() > 0;
      mirror.clear();
      if (had) send('inkClear');
      paintTools();
    }
    function setPen(on) {
      if (s.pen === on) return;
      s.pen = on;
      if (!on) endStroke();
      paintTools();
    }
    // Un point du pointeur, en part de la page (le cadre de la copie, tel que l'écran le montre) ; deux fois le même point de suite n'en fait qu'un.
    function pushPoint(event) {
      const stroke = s.stroke;
      const box = s.current ? s.current.surf.frame.getBoundingClientRect() : null;
      if (!stroke || !box || !box.width || !box.height) return;
      const x = part((event.clientX - box.left) / box.width);
      const y = part((event.clientY - box.top) / box.height);
      if (stroke.x === x && stroke.y === y) return;
      stroke.x = x;
      stroke.y = y;
      stroke.buffer.push(x, y);
      if (stroke.buffer.length >= INK_FLUSH_POINTS * 2) flushInk(); else if (!stroke.timer) stroke.timer = setTimeout(flushInk, INK_FLUSH_MS);
    }
    currentBox.addEventListener('pointerdown', (event) => {
      if (!s.pen || s.stroke || event.button !== 0 || !event.isPrimary || !canDraw()) return;
      const box = s.current.surf.frame.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
      event.preventDefault();
      try { currentBox.setPointerCapture(event.pointerId); } catch (e) { /* le pointeur n'est plus là */ }
      s.stroke = { id: event.pointerId, first: true, buffer: [], timer: 0, x: -1, y: -1 };
      pushPoint(event);
      flushInk();
    });
    currentBox.addEventListener('pointermove', (event) => {
      if (!s.stroke || event.pointerId !== s.stroke.id) return;
      const moves = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      (moves.length ? moves : [event]).forEach(pushPoint);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => currentBox.addEventListener(type, (event) => {
      if (!s.stroke || event.pointerId !== s.stroke.id) return;
      if (type === 'pointerup') pushPoint(event);
      endStroke();
    }));
    penButton.addEventListener('click', () => setPen(!s.pen));
    eraseButton.addEventListener('click', () => { if (eraseButton.getAttribute('aria-disabled') !== 'true') eraseInk(); });
    left.addEventListener('wheel', (event) => {
      event.preventDefault();
      hideTip();
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
      hideTip();
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
      // Les touches des outils ne se répètent pas : garder B enfoncée ne ferait que clignoter l'écran.
      const once = action => () => { if (!event.repeat) action(); };
      const keys = {
        ArrowRight: goNext, ArrowDown: goNext, PageDown: goNext, ' ': goNext, Enter: goNext, n: goNext, N: goNext,
        ArrowLeft: goPrev, ArrowUp: goPrev, PageUp: goPrev, Backspace: goPrev, p: goPrev, P: goPrev,
        Home: () => send('jump', 0), End: () => send('jump', last), F5: () => {},
        b: once(() => toggleScreen(1)), B: once(() => toggleScreen(1)), w: once(() => toggleScreen(2)), W: once(() => toggleScreen(2)),
        d: once(() => setPen(!s.pen)), D: once(() => setPen(!s.pen)), e: once(eraseInk), E: once(eraseInk),
        // Échap finit d'abord le stylo ; quitter vient ensuite.
        Escape: () => (s.pen ? setPen(false) : onExit()),
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
      mirror = SlidePlayer.inkLayer(s.current.surf.frame);
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
      clearTimeout(s.tipTimer);
      document.removeEventListener('keydown', onKey, true);
      closePicker();
      if (s.stroke) { clearTimeout(s.stroke.timer); s.stroke = null; }
      if (mirror) mirror.destroy();
      [s.current, s.upcoming].forEach((view) => { if (view) { view.surf.destroy(); view.job.dispose(); } });
      root.remove();
    }

    // La fenêtre repart de zéro (rechargée) : le tracé qu'elle gardait n'est plus, celui de la console non plus.
    function reset() { if (!s.destroyed) dropInk(); }

    applySize();
    return {
      root, boxes: { current: currentStage, upcoming: upcomingStage }, load, setState, reset, destroy,
      // Pour les essais : le dernier état reçu, le chrono (en marche ? depuis combien de millisecondes ?), le stylo (en service ? combien de traits sur la copie ?).
      state: () => s.state,
      timer: () => ({ running: clock.running, started: clock.started, ms: elapsed() }),
      pen: () => ({ on: s.pen, strokes: mirror ? mirror.count() : 0, drawing: !!s.stroke }),
    };
  }

  return { create };
})();
