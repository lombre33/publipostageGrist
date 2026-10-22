// « Présenter » : le diaporama d'une présentation, en plein écran, une diapositive à la fois (extension « diapositives » de Grist Factory Suite ; demande du 21/10, carte « Près du
// zoom »). Le bouton ▶ est à gauche de la pastille du zoom, au coin bas droit du document, tant que la bande des diapositives est montrée (extensions/diapositives/slide-strip.js) ;
// la barre d'outils ne change pas (elle est gelée).
//  - DÉPART : le bouton et Maj+F5 partent de la diapositive du curseur, F5 de la première (comme PowerPoint). Le diaporama prend tout l'écran (plein écran du navigateur ; quand le
//    cadre le refuse, il prend tout le panneau du widget), fond noir, la diapositive au centre, aussi grande que l'écran le permet.
//  - LE MENU ▾ (demande du 22/10) : un petit bouton ▾ à gauche du ▶ ouvre « À partir de la diapositive N », « Depuis le début » (le ▶ ne change pas : un clic, la diapositive du curseur) et
//    l'interrupteur « Plein écran » (coché au départ ; le ▶, F5 et Maj+F5 le suivent). Quand le cadre ne permet pas le plein écran (`document.fullscreenEnabled` faux : le sous-cadre de GFS et
//    celui de Grist n'ont pas `allow="fullscreen"`), l'interrupteur est grisé avec sa raison et le diaporama prend le panneau, sans rien demander au navigateur. Le choix n'est gardé
//    que pour la page ouverte.
//  - CE QUI EST MONTRÉ : la présentation telle que la Lecture la rend pour la ligne choisie (variables, conditions et boucles résolues, en-têtes et pieds, images en calque et
//    répétées), page après page, au pixel près de la Lecture : le rendu et la découpe en pages sont ceux de l'impression par le navigateur (PrintExport.stage), en une seule copie du
//    document qu'on déplace d'une page à l'autre (léger sur 70 diapositives chargées). Une diapositive qui dépasse de sa page se montre en autant de pages qu'elle en prend.
//  - PASSER : → ↓ Espace Entrée Page suivante, un clic ou la molette vers le bas avancent ; ← ↑ Retour arrière Page précédente et la molette vers le haut reculent ; Début et Fin vont à
//    la première et à la dernière. Après la dernière, un écran noir dit la fin ; le geste suivant quitte. La souris qui bouge montre la barre du bas (précédente, numéro, suivante,
//    quitter), qui se cache avec le pointeur quand elle s'arrête.
//  - Les TRANSITIONS (demande du 21/10 à 18:35) : en passant d'une diapositive à la suivante (ou à la précédente), l'effet que la diapositive d'arrivée a choisi (js/slide-props.js, lu dans
//    le texte de l'éditeur au départ du diaporama) se joue entre la page qu'on quitte - une copie figée, posée par-dessus - et celle où l'on arrive (slide-transitions.js). En revenant en
//    arrière, c'est la transition de la diapositive qu'on quitte, à l'envers. Passer d'une page à l'autre d'une même diapositive, sauter au début ou à la fin, l'écran de fin : sans effet.
//    Un geste pendant l'effet le termine aussitôt et fait ce qu'il demande. Le mouvement réduit du système ramène tout effet à un fondu court.
//  - SORTIR : Échap (ou la sortie du plein écran), « Quitter » ; le clavier revient où il était, et le document n'a pas bougé. Rien ne s'écrit : le diaporama ne touche pas au modèle.
//  - L'extension éteinte par GFS : le bouton reste, grisé avec sa raison, et son clic l'explique (SlidesEntry.explainOff), comme les gestes de la bande.
//  - LA BARRE DE GFS (consigne GFS 025) : elle recouvre le cadre au bord choisi par la personne. Le ▶ suit la pastille du zoom, qui s'écarte de la barre quand elle la recouvrirait
//    (js/page-zoom.js:stepAside, qui compte aussi la place du ▶ : `data-pp-zoom-companion`). Le diaporama prend tout le cadre : à son ouverture l'app demande à GFS de masquer sa barre
//    (`GfsBar.hide(true)`), et chaque sortie la lui fait rendre (`GfsBar.hide(false)`, dans `stop`, le seul chemin de sortie), Échap et « Quitter » comprise.
// Styles : extensions/diapositives/slide-show.css.
const SlideShow = (function () {
  const el = Dom.el;
  const HOST_ID = 'pp-slide-show-stage';
  const IDLE_MS = 2000;            // la barre du bas et le pointeur se cachent après ce temps sans mouvement de la souris
  const WHEEL_GAP_MS = 400;        // un cran de molette par diapositive : les crans qui suivent de près sont ignorés
  const PILL_GAP = 4;              // l'écart, en px, entre le ▶ et la pastille du zoom à sa droite

  let split = null;                // le groupe ▾ ▶, posé à gauche de la pastille du zoom : c'est lui que `place` déplace et que la pastille compte (`data-pp-zoom-companion`)
  let button = null;               // ▶ « Présenter », le bord droit du groupe, contre la pastille
  let more = null;                 // ▾, à gauche du ▶ : le menu des autres départs et du plein écran
  let menu = null;                 // le menu de ▾ : { panel, open, pointer }
  let wantFullscreen = true;       // l'interrupteur « Plein écran » du menu (le ▶, F5 et Maj+F5 le suivent) ; gardé pour la page ouverte
  let shown = false;               // la bande est montrée : le bouton aussi, et F5 lance le diaporama
  let off = false;                 // l'extension est éteinte : le bouton est grisé
  let placeObservers = [];
  let run = null;                  // le diaporama en cours : { root, frame, view, stage, windows, index, ended, job, ... }

  // Le bouton

  function build() {
    if (button) return;
    split = el('div', 'pp-slide-show-split');
    split.hidden = true;
    split.setAttribute('data-pp-zoom-companion', String(PILL_GAP));
    more = Dom.button('pp-slide-show-more');
    Dom.setMarkup(more, Icons.svg('caretDown'));
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    button = Dom.button('pp-slide-show-open');
    Dom.setMarkup(button, Icons.svg('slideShow'));
    [more, button].forEach(b => {
      const svg = b.querySelector('svg');
      if (svg) svg.setAttribute('aria-hidden', 'true');
      // Un appui ne prend pas le focus (le curseur reste dans le texte, comme sur la pastille du zoom) ; au clavier, Tab puis Entrée ou Espace font ce que fait le clic.
      b.addEventListener('mousedown', event => event.preventDefault());
    });
    button.hidden = true;
    button.addEventListener('click', () => start(true));
    more.addEventListener('click', event => {
      if (off) { SlidesEntry.explainOff(); return; }
      if (menu && menu.open) closeMenu(false); else openMenu(event.detail === 0);
    });
    split.append(more, button);
    document.body.appendChild(split);
    document.addEventListener('keydown', onStartKey, true);
  }
  // À gauche de la pastille du zoom, sur sa ligne : elle se déplace (barre de défilement, volet d'import) et s'élargit à gauche au survol, le bouton la suit. Sans pastille posée
  // (une présentation ouverte au démarrage s'affiche avant que la pastille soit construite), le bouton attend, invisible, au lieu de tomber au coin haut gauche du panneau : la
  // pastille qui arrive dans la page le place (observePlace).
  function place() {
    if (!split || split.hidden) return;
    const pill = document.getElementById('pp-page-zoom');
    watchPill(pill);
    const r = pill ? pill.getBoundingClientRect() : null;
    const ready = !!r && r.width > 0 && r.height > 0;
    split.style.visibility = ready ? '' : 'hidden';
    if (!ready) return;
    const root = document.documentElement;
    split.style.right = Math.round(root.clientWidth - r.left + PILL_GAP) + 'px';
    split.style.bottom = Math.round(root.clientHeight - r.bottom) + 'px';
  }
  // La pastille est suivie dès qu'elle existe : sa taille (ouverte au survol, montrée) et son style (sa place).
  let observing = false;
  let watchedPill = null;
  function watchPill(pill) {
    if (!observing || !pill || pill === watchedPill) return;
    watchedPill = pill;
    if (typeof ResizeObserver === 'function') { const sizes = new ResizeObserver(place); sizes.observe(pill); placeObservers.push(sizes); }
    if (typeof MutationObserver === 'function') { const moves = new MutationObserver(place); moves.observe(pill, { attributes: true, attributeFilter: ['style'] }); placeObservers.push(moves); }
  }
  function observePlace() {
    if (observing) return;
    observing = true;
    // La classe de la page (la bande, le volet « Importer ») et ses enfants directs : la pastille qui arrive.
    if (typeof MutationObserver === 'function') {
      const page = new MutationObserver(place);
      page.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
      placeObservers.push(page);
    }
    window.addEventListener('resize', place);
  }
  function unobservePlace() {
    placeObservers.forEach(o => o.disconnect());
    placeObservers = [];
    observing = false;
    watchedPill = null;
    window.removeEventListener('resize', place);
  }
  // L'info-bulle dit de quelle diapositive le bouton part ; écrite seulement quand elle change (la bande la redemande à chaque transaction).
  let said = '';
  function syncTexts() {
    const tip = off ? SlidesEntry.reason() : I18n.t('slides.show.buttonTip', { n: currentSlide() + 1 });
    if (tip + off === said) return;
    said = tip + off;
    button.title = tip;
    button.setAttribute('aria-label', off ? I18n.t('slides.show.button') + ' : ' + tip : tip);
    button.setAttribute('aria-disabled', off ? 'true' : 'false');
    const moreTip = off ? SlidesEntry.reason() : I18n.t('slides.show.more');
    more.title = moreTip;
    more.setAttribute('aria-label', off ? I18n.t('slides.show.more') + ' : ' + moreTip : moreTip);
    more.setAttribute('aria-disabled', off ? 'true' : 'false');
    if (off) closeMenu(false);
  }
  // La bande le montre et le cache avec elle (`on`) ; `isOff` : l'extension est éteinte. Appelée aussi à chaque changement de diapositive, pour l'info-bulle.
  function sync(on, isOff) {
    build();
    const was = shown;
    off = !!isOff;
    shown = !!on;
    button.hidden = !shown;
    split.hidden = !shown;
    if (shown && !was) { observePlace(); place(); }
    if (!shown && was) { unobservePlace(); closeMenu(false); }
    // La pastille compte la place du ▶ pour s'écarter de la barre de GFS : elle la refait quand il paraît ou disparaît.
    if (shown !== was) PageZoom.place();
    if (shown) syncTexts();
  }

  const currentSlide = () => (typeof SlideStrip !== 'undefined' ? SlideStrip.current() : 0);
  // La première page de la diapositive `index` dans la pagination de l'éditeur, la même que celle de la Lecture : la page qui suit son saut de page.
  function firstPageOf(index) {
    if (index <= 0) return 0;
    const breaks = HeaderFooterPreview.pageBreaks();
    let forced = 0;
    for (let i = 0; i < breaks.length; i++) if (breaks[i].forced && ++forced === index) return i + 1;
    return 0;
  }
  const windowOpen = () => Array.from(document.querySelectorAll('.pp-modal')).some(m => m.isConnected && getComputedStyle(m).display !== 'none');

  // F5 : depuis la première diapositive ; Maj+F5 : depuis celle du curseur. Seulement quand le bouton est là et qu'aucune fenêtre n'est ouverte : ailleurs, F5 recharge comme toujours.
  function onStartKey(event) {
    if (run || !shown || event.key !== 'F5' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || windowOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    start(event.shiftKey);
  }

  // Le menu de ▾ : deux départs et l'interrupteur « Plein écran ». Au clavier, ↑ ↓ Début Fin, Entrée ou Espace ; Échap et Tab le referment et rendent le clavier à ▾.

  // Le plein écran du navigateur est permis dans ce cadre : `document.fullscreenEnabled` est faux quand le sous-cadre de GFS, ou celui que Grist lui donne, n'a pas `allow="fullscreen"`.
  const fullscreenAllowed = () => typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
  function ensureMenu() {
    if (menu) return menu;
    const html = '<button type="button" role="menuitem" data-action="current"></button>'
      + '<button type="button" role="menuitem" data-action="begin"></button>'
      + '<div class="pp-show-menu-sep" role="separator"></div>'
      + '<button type="button" role="menuitemcheckbox" data-action="fullscreen" aria-describedby="pp-show-menu-note"><span class="pp-show-menu-name"></span><span class="pp-show-menu-note" id="pp-show-menu-note"></span></button>';
    const panel = EditorCore.createFloatingPanel('pp-show-menu', html, onMenuAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.setAttribute('aria-label', I18n.t('slides.show.more'));
    panel.el.addEventListener('mousedown', () => { menu.pointer = true; }, true);
    panel.el.addEventListener('keydown', event => { menu.pointer = false; onMenuKey(event); });
    menu = { panel, open: false, pointer: true };
    return menu;
  }
  const menuButtons = () => Array.from(menu.panel.el.querySelectorAll('[data-action]'));
  // Les lignes disent l'état du moment : la diapositive du curseur, et l'interrupteur - coché, ou grisé avec sa raison quand le cadre ne permet pas le plein écran.
  function paintMenu() {
    const [current, begin, fullscreen] = menuButtons();
    current.textContent = I18n.t('slides.show.menu.current', { n: currentSlide() + 1 });
    begin.textContent = I18n.t('slides.show.menu.begin');
    const allowed = fullscreenAllowed();
    fullscreen.querySelector('.pp-show-menu-name').textContent = I18n.t('slides.show.menu.fullscreen');
    const note = fullscreen.querySelector('.pp-show-menu-note');
    note.textContent = allowed ? '' : I18n.t('slides.show.menu.fullscreenOff');
    note.hidden = allowed;
    fullscreen.setAttribute('aria-checked', allowed && wantFullscreen ? 'true' : 'false');
    fullscreen.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  }
  function openMenu(byKeyboard) {
    ensureMenu();
    paintMenu();
    Object.assign(menu, { open: true, pointer: !byKeyboard });
    more.setAttribute('aria-expanded', 'true');
    menu.panel.show(split, { placement: 'top-end', offset: 6 });
    if (byKeyboard) menuButtons()[0].focus();
    document.addEventListener('mousedown', onPressOutsideMenu, true);
  }
  function closeMenu(returnFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    menu.panel.hide();
    more.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onPressOutsideMenu, true);
    if (returnFocus) more.focus({ preventScroll: true });
  }
  // Un appui hors du menu le referme ; celui de ▾ est laissé à son clic, qui ouvre ou referme.
  function onPressOutsideMenu(event) {
    if (menu.panel.el.contains(event.target) || more.contains(event.target)) return;
    closeMenu(false);
  }
  function onMenuKey(event) {
    const buttons = menuButtons();
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
      closeMenu(true);
    }
  }
  function onMenuAction(action) {
    if (!menu || !menu.open) return;
    const { pointer } = menu;
    if (action === 'fullscreen') {
      // Grisé, l'interrupteur ne change rien et le menu reste ouvert (sa raison est sous les yeux).
      if (!fullscreenAllowed()) return;
      wantFullscreen = !wantFullscreen;
      closeMenu(!pointer);
      return;
    }
    closeMenu(!pointer);
    start(action === 'current');
  }

  // Le diaporama

  async function start(fromCurrent) {
    if (run) return;
    if (off) { SlidesEntry.explainOff(); return; }
    closeMenu(false);
    const html = SlidesEntry.outputHtml('presentation', Editor.getHTML());
    const headerFooter = Editor.getHeaderFooterData();
    const startPage = fromCurrent ? firstPageOf(currentSlide()) : 0;
    const focusBack = document.activeElement;
    // Une image d'un autre site se montre au diaporama comme dans un export : la même question d'abord (ExternalImages), « Annuler » ne lance rien.
    try { await ExternalImages.confirmExport(html, headerFooter); } catch (e) { return; }
    if (run) return;
    const root = el('div', 'pp-slide-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', I18n.t('slides.show.label'));
    root.tabIndex = -1;
    const status = el('div', 'pp-slide-show-card', I18n.t('slides.show.preparing'));
    status.setAttribute('role', 'status');
    const end = el('div', 'pp-slide-show-card pp-slide-show-end', I18n.t('slides.show.end'));
    end.hidden = true;
    const bar = buildBar();
    root.append(status, end, bar.el);
    document.body.appendChild(root);
    // Les transitions de chaque diapositive et la première page de chacune, lues sur l'éditeur au départ (la pagination est celle que la Lecture reprend).
    const ed = EditorCore.getEditor();
    const props = ed ? SlideProps.listOf(ed.state.doc) : [];
    const starts = props.map((_, k) => firstPageOf(k));
    run = { root, status, end, bar, windows: [], index: 0, ended: false, job: null, focusBack, fullscreen: false, idleTimer: 0, lastWheel: 0, ready: false, props, starts, transition: null };
    const current = run;
    // Le diaporama prend tout le cadre : la barre de GFS ne reste pas par-dessus (rendue par `stop`, quelle que soit la sortie).
    GfsBar.hide(true);
    // Le plein écran se demande tout de suite, dans le geste qui lance (le rendu prend du temps, le navigateur ne l'accorderait plus), quand l'interrupteur du menu est coché et que le
    // cadre le permet ; sinon - ou s'il le refuse quand même - le diaporama garde le panneau.
    if (wantFullscreen && fullscreenAllowed()) enterFullscreen(root);
    root.focus({ preventScroll: true });
    wireRun();
    try {
      const job = await PrintExport.stage(html, GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), headerFooter, { id: HOST_ID, parent: root });
      if (run !== current) { job.dispose(); return; }
      current.job = job;
      mount(current, job);
      const first = job.windows.findIndex(win => win.page >= startPage);
      current.ready = true;
      status.hidden = true;
      go(first >= 0 ? first : 0);
    } catch (e) {
      if (run !== current) return;
      stop();
      SlidesEntry.status(I18n.t('slides.show.failed', { message: (e && e.message) || String(e) }));
    }
  }

  function enterFullscreen(root) {
    if (typeof root.requestFullscreen !== 'function') return;
    try {
      const asked = root.requestFullscreen();
      if (asked && typeof asked.then === 'function') asked.then(() => { if (run && run.root === root) run.fullscreen = true; }, () => {});
    } catch (e) { /* le cadre refuse le plein écran : le diaporama garde le panneau */ }
  }

  // La copie mesurée du document, posée dans une feuille de la taille d'une page, au centre, agrandie ou réduite à l'écran ; la fenêtre de la page montrée la rogne.
  function mount(current, job) {
    const { host, root: scope, stage } = job;
    host.classList.add('pp-slide-show-host');
    scope.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:transparent';
    const frame = document.createElement('div');
    frame.style.cssText = 'position:absolute;left:50%;top:50%;overflow:hidden;background:#fff;transform-origin:50% 50%';
    const view = document.createElement('div');
    view.className = 'pp-print-window';
    frame.appendChild(view);
    view.appendChild(stage);
    // Le calque : toute la surface du diaporama, qui porte la page ; une transition le déplace, le fond ou le découpe, la page garde sa place dedans.
    const layer = document.createElement('div');
    layer.className = 'pp-slide-show-layer';
    layer.style.cssText = 'position:absolute;inset:0';
    layer.appendChild(frame);
    scope.appendChild(layer);
    Object.assign(current, { layer, frame, view, stage, windows: job.windows });
    if (typeof ResizeObserver === 'function') {
      current.sizes = new ResizeObserver(() => fit(current));
      current.sizes.observe(current.root);
    }
  }
  const paperOf = (current, win) => win.sheet || { width: current.job.pagePx.width, height: current.job.pagePx.height, left: current.job.sheetLeft };
  function fit(current) {
    const win = current.windows[current.index];
    if (!current.frame || !win) return;
    const paper = paperOf(current, win);
    const scale = Math.min(current.root.clientWidth / paper.width, current.root.clientHeight / paper.height);
    current.frame.style.width = paper.width + 'px';
    current.frame.style.height = paper.height + 'px';
    current.frame.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }

  // La page `index` (une fenêtre de la découpe) ; au-delà de la dernière, l'écran de fin. `how.step` : un pas vers la page d'à côté (suivante, ou précédente avec `how.reverse`), que la
  // transition de la diapositive accompagne ; sans lui, la page change d'un coup.
  function go(index, how) {
    const current = run;
    if (!current || !current.ready) return;
    const count = current.windows.length;
    endTransition(current, true);
    if (index >= count) { showEnd(current, true); return; }
    showEnd(current, false);
    const spec = how && how.step ? transitionFor(current, current.index, Math.max(0, index), !!how.reverse) : null;
    const ghost = spec ? makeGhost(current) : null;
    current.index = Math.max(0, index);
    const win = current.windows[current.index];
    const paper = paperOf(current, win);
    current.view.style.top = win.at + 'px';
    current.view.style.height = (win.to - win.from) + 'px';
    current.stage.style.position = 'absolute';
    current.stage.style.left = (-paper.left) + 'px';
    current.stage.style.top = (-win.from) + 'px';
    fit(current);
    current.bar.counter.textContent = I18n.t('slides.show.counter', { n: current.index + 1, total: count });
    current.bar.prev.setAttribute('aria-disabled', current.index === 0 ? 'true' : 'false');
    if (ghost) beginTransition(current, ghost, spec, !!how.reverse);
  }

  // Les transitions
  // La diapositive que montre la page `i` (une fenêtre de la découpe) : la dernière dont la première page est celle-là ou une d'avant.
  function slideOfWindow(current, i) {
    const page = current.windows[i].page;
    let found = 0;
    current.starts.forEach((start, k) => { if (start <= page) found = k; });
    return found;
  }
  // La transition à jouer en allant de la page `from` à la page `to` : celle de la diapositive où l'on arrive, ou - en revenant en arrière - celle de la diapositive qu'on quitte ; rien
  // quand les deux pages sont de la même diapositive, ou que la diapositive n'a pas de transition.
  function transitionFor(current, from, to, reverse) {
    if (typeof SlideTransitions === 'undefined' || !current.props.length || from === to || !current.windows[from] || !current.windows[to]) return null;
    const leaving = slideOfWindow(current, from);
    const arriving = slideOfWindow(current, to);
    return leaving === arriving ? null : current.props[reverse ? leaving : arriving] || null;
  }
  // Une copie figée du calque tel qu'il est (la page qu'on quitte), posée par-dessus : la page d'arrivée se met en place dessous, le temps que l'effet joue.
  function makeGhost(current) {
    const copy = current.layer.cloneNode(true);
    copy.classList.add('pp-slide-show-ghost');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.style.pointerEvents = 'none';
    current.layer.parentNode.appendChild(copy);
    return copy;
  }
  function beginTransition(current, ghost, spec, reverse) {
    const job = SlideTransitions.play(ghost, current.layer, spec, { reverse });
    current.transition = { job, ghost, kind: job.kind, side: job.side, duration: job.duration, reverse };
    job.done.then(() => { if (current.transition && current.transition.job === job) endTransition(current, false); });
  }
  // Termine l'effet en cours (`finish` : il saute à l'image d'arrivée) et retire la copie.
  function endTransition(current, finish) {
    const running = current.transition;
    if (!running) return;
    current.transition = null;
    if (finish) running.job.finish(); else running.job.cancel();
    running.ghost.remove();
  }
  function showEnd(current, on) {
    current.ended = on;
    current.end.hidden = !on;
    if (current.frame) current.frame.style.visibility = on ? 'hidden' : '';
  }
  function next() {
    if (!run || !run.ready) return;
    if (run.ended) { stop(); return; }
    go(run.index + 1, { step: true });
  }
  function prev() {
    if (!run || !run.ready) return;
    if (run.ended) { go(run.windows.length - 1); return; }
    if (run.index > 0) go(run.index - 1, { step: true, reverse: true });
  }

  // La barre du bas : précédente, numéro, suivante, quitter. Montrée quand la souris bouge.
  function buildBar() {
    const barEl = el('div', 'pp-slide-show-bar');
    barEl.setAttribute('role', 'toolbar');
    barEl.setAttribute('aria-label', I18n.t('slides.show.label'));
    const make = (cls, text, tip) => {
      const b = Dom.button('pp-slide-show-step ' + cls, text);
      b.title = tip;
      b.setAttribute('aria-label', tip);
      return b;
    };
    const prevButton = make('pp-slide-show-prev', '‹', I18n.t('slides.show.prev'));
    const counter = el('span', 'pp-slide-show-counter');
    counter.setAttribute('aria-live', 'polite');
    const nextButton = make('pp-slide-show-next', '›', I18n.t('slides.show.next'));
    const exitButton = make('pp-slide-show-exit', '✕', I18n.t('slides.show.exit'));
    barEl.append(prevButton, counter, nextButton, exitButton);
    prevButton.addEventListener('click', event => { event.stopPropagation(); prev(); });
    nextButton.addEventListener('click', event => { event.stopPropagation(); next(); });
    exitButton.addEventListener('click', event => { event.stopPropagation(); stop(); });
    barEl.addEventListener('mousedown', event => event.preventDefault());
    return { el: barEl, prev: prevButton, next: nextButton, counter, exit: exitButton };
  }
  function wake() {
    if (!run) return;
    run.root.classList.add('pp-slide-show-awake');
    clearTimeout(run.idleTimer);
    const current = run;
    // Le clavier sur un bouton de la barre la garde montrée.
    current.idleTimer = setTimeout(() => { if (!current.bar.el.contains(document.activeElement)) current.root.classList.remove('pp-slide-show-awake'); }, IDLE_MS);
  }

  function onKey(event) {
    if (!run || event.isComposing) return;
    // Le clavier sur un bouton de la barre : Entrée et Espace l'activent, Tab y circule.
    const onBar = run.bar.el.contains(event.target);
    if (event.key === 'Tab') { wake(); return; }
    if (onBar && (event.key === 'Enter' || event.key === ' ')) return;
    const keys = {
      ArrowRight: next, ArrowDown: next, PageDown: next, ' ': next, Enter: next, n: next, N: next,
      ArrowLeft: prev, ArrowUp: prev, PageUp: prev, Backspace: prev, p: prev, P: prev,
      Home: () => go(0), End: () => run && go(run.windows.length - 1), Escape: stop, F5: () => {},
    };
    const action = keys[event.key];
    // Pendant le diaporama, aucune touche n'atteint le document en dessous.
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // L'écran de fin : une touche quitte, sauf celles qui reculent.
    if (run.ended && action !== prev && !/^(Shift|Control|Alt|Meta|CapsLock)$/.test(event.key)) { event.preventDefault(); stop(); return; }
    if (!action) return;
    event.preventDefault();
    action();
  }
  function onClick(event) {
    if (!run || event.button !== 0 || run.bar.el.contains(event.target)) return;
    next();
  }
  function onWheel(event) {
    if (!run) return;
    event.preventDefault();
    const now = Date.now();
    if (now - run.lastWheel < WHEEL_GAP_MS || !event.deltaY) return;
    run.lastWheel = now;
    if (event.deltaY > 0) next(); else prev();
  }
  function onFullscreenChange() {
    if (!run) return;
    if (document.fullscreenElement === run.root) { run.fullscreen = true; return; }
    // Le navigateur sort du plein écran (Échap, F11) : le diaporama se termine avec lui.
    if (run.fullscreen) stop();
  }
  // Le clavier reste dans le diaporama (une fenêtre modale) : Tab ne mène pas au document caché dessous.
  function onFocusIn(event) {
    if (run && !run.root.contains(event.target)) run.root.focus({ preventScroll: true });
  }
  function wireRun() {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    run.root.addEventListener('click', onClick);
    run.root.addEventListener('wheel', onWheel, { passive: false });
    run.root.addEventListener('mousemove', wake);
    run.root.addEventListener('contextmenu', event => event.preventDefault());
  }

  function stop() {
    const current = run;
    if (!current) return;
    run = null;
    clearTimeout(current.idleTimer);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (current.sizes) current.sizes.disconnect();
    endTransition(current, false);
    GfsBar.hide(false);
    if (document.fullscreenElement === current.root && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => {});
    if (current.job) current.job.dispose();
    current.root.remove();
    const back = current.focusBack;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  // Arrivé après la bande (les fichiers de l'extension se chargent sans ordre) : le bouton se montre tout de suite si elle l'est déjà.
  if (typeof SlideStrip !== 'undefined' && SlideStrip.isShown()) sync(true, SlideStrip.isOff());

  // Ce que le diaporama montre (pour les essais) : la page, l'écran de fin, l'effet en cours.
  const state = () => (run ? { index: run.index, ended: run.ended, transition: run.transition ? { kind: run.transition.kind, side: run.transition.side, duration: run.transition.duration, reverse: run.transition.reverse } : null } : null);

  return { sync, start, stop, state, isRunning: () => !!run };
})();
