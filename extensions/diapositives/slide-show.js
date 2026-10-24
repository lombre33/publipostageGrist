// « Présenter » : le diaporama d'une présentation, en plein écran, une diapositive à la fois (extension « diapositives » de Grist Factory Suite ; demande du 21/10, carte « Près du
// zoom »). Le bouton ▶ est à gauche de la pastille du zoom, au coin bas droit du document, tant que la bande des diapositives est montrée (extensions/diapositives/slide-strip.js) ;
// la barre d'outils ne change pas (elle est gelée). Ce fichier est le bouton, son menu et le départ ; la lecture elle-même (passer, transitions, animations, barre du bas) est celle du lecteur
// commun (slide-player.js), qui joue de la même façon dans le panneau et dans la fenêtre à part (slide-window.js, slide-present.js).
//  - DÉPART : le bouton et Maj+F5 partent de la diapositive du curseur, F5 de la première (comme PowerPoint). Le diaporama prend tout l'écran, fond noir, la diapositive au centre, aussi
//    grande que l'écran le permet. OÙ IL SE JOUE (demande du 24/10 : « un moyen alternatif pour avoir un plein écran, c'est vraiment important ») :
//      1. le cadre permet le plein écran du navigateur (`document.fullscreenEnabled`) : dans le panneau du widget, en plein écran ;
//      2. sinon (le sous-cadre de GFS et celui de Grist n'ont pas `allow="fullscreen"`, et rien depuis le widget ne le force) : dans une FENÊTRE À PART, ouverte dans le geste du départ, où un clic ou
//         une touche donne le vrai plein écran (slide-window.js). Le navigateur qui la refuse (bloqueur de fenêtres, touche F5 sous Firefox ESR, cadre sans `allow-popups`) : le panneau, avec
//         une ligne qui le dit ;
//      3. l'interrupteur « Plein écran » du menu décoché : dans le panneau, sans plein écran.
//  - LE MENU ▾ (demande du 22/10) : un petit bouton ▾ à gauche du ▶ ouvre « À partir de la diapositive N », « Depuis le début » (le ▶ ne change pas : un clic, la diapositive du curseur) et
//    l'interrupteur « Plein écran » (coché au départ ; le ▶, F5 et Maj+F5 le suivent ; quand le cadre ne permet pas le plein écran, une ligne dessous dit que le diaporama s'ouvre dans une
//    fenêtre à part). Le choix n'est gardé que pour la page ouverte.
//  - CE QUI EST MONTRÉ : la présentation telle que la Lecture la rend pour la ligne choisie (variables, conditions et boucles résolues, en-têtes et pieds, images en calque et
//    répétées), page après page, au pixel près de la Lecture : le rendu et la découpe en pages sont ceux de l'impression par le navigateur (PrintExport.stage), en une seule copie du
//    document qu'on déplace d'une page à l'autre (léger sur 70 diapositives chargées). Une diapositive qui dépasse de sa page se montre en autant de pages qu'elle en prend.
//  - SORTIR : Échap (ou la sortie du plein écran), « Quitter » ; le clavier revient où il était, et le document n'a pas bougé. Rien ne s'écrit : le diaporama ne touche pas au modèle.
//  - L'extension éteinte par GFS : le bouton reste, grisé avec sa raison, et son clic l'explique (SlidesEntry.explainOff), comme les gestes de la bande.
//  - LA BARRE DE GFS (consigne GFS 025) : elle recouvre le cadre au bord choisi par la personne. Le ▶ suit la pastille du zoom, qui s'écarte de la barre quand elle la recouvrirait
//    (js/page-zoom.js:stepAside, qui compte aussi la place du ▶ : `data-pp-zoom-companion`). Le diaporama du panneau prend tout le cadre : à son ouverture l'app demande à GFS de masquer sa barre
//    (`GfsBar.hide(true)`), et chaque sortie la lui fait rendre (`GfsBar.hide(false)`, dans `stop`, le seul chemin de sortie), Échap et « Quitter » comprise. La fenêtre à part ne couvre rien : la
//    barre reste.
// Styles : extensions/diapositives/slide-show.css.
const SlideShow = (function () {
  const el = Dom.el;
  const PILL_GAP = 4;              // l'écart, en px, entre le ▶ et la pastille du zoom à sa droite

  let split = null;                // le groupe ▾ ▶, posé à gauche de la pastille du zoom : c'est lui que `place` déplace et que la pastille compte (`data-pp-zoom-companion`)
  let button = null;               // ▶ « Présenter », le bord droit du groupe, contre la pastille
  let more = null;                 // ▾, à gauche du ▶ : le menu des autres départs et du plein écran
  let menu = null;                 // le menu de ▾ : { panel, open, pointer }
  let wantFullscreen = true;       // l'interrupteur « Plein écran » du menu (le ▶, F5 et Maj+F5 le suivent) ; gardé pour la page ouverte
  let shown = false;               // la bande est montrée : le bouton aussi, et F5 lance le diaporama
  let off = false;                 // l'extension est éteinte : le bouton est grisé
  let placeObservers = [];
  let run = null;                  // le diaporama du panneau en cours : { player (SlidePlayer), root, focusBack }
  let launching = false;           // un départ est en route (la question des images d'un autre site, le rendu de la fenêtre à part) : un autre geste ne lance pas un deuxième diaporama

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
  // Où le diaporama se joue : dans la fenêtre à part quand le plein écran est voulu et que ce cadre le refuse, sinon dans le panneau (en plein écran quand il est voulu et permis).
  const routeOf = () => (wantFullscreen && !fullscreenAllowed() ? 'window' : 'panel');
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
    note.textContent = allowed ? '' : I18n.t('slides.show.menu.fullscreenWindow');
    note.hidden = allowed;
    fullscreen.setAttribute('aria-checked', wantFullscreen ? 'true' : 'false');
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
      wantFullscreen = !wantFullscreen;
      closeMenu(!pointer);
      return;
    }
    closeMenu(!pointer);
    start(action === 'current');
  }


  // Le diaporama

  // Les textes du lecteur (extensions/diapositives/slide-player.js), dans la langue de la page.
  const labels = () => ({
    label: I18n.t('slides.show.label'),
    preparing: I18n.t('slides.show.preparing'),
    end: I18n.t('slides.show.end'),
    prev: I18n.t('slides.show.prev'),
    next: I18n.t('slides.show.next'),
    exit: I18n.t('slides.show.exit'),
    counter: I18n.t('slides.show.counter', { n: '{n}', total: '{total}' }),
  });
  // Ce que la fenêtre à part sait de l'app : la langue, le thème, le nom du modèle (le titre de la fenêtre) et les textes du lecteur, plus les siens.
  function windowInfo() {
    const template = typeof Templates !== 'undefined' ? Templates.byId(Templates.getCurrentId()) : null;
    return {
      lang: document.documentElement.lang === 'en' ? 'en' : 'fr',
      theme: document.documentElement.getAttribute('data-theme') || '',
      title: template && template.nom ? String(template.nom) : '',
      labels: Object.assign(labels(), {
        hint: I18n.t('slides.show.window.hint'),
        closed: I18n.t('slides.show.window.closed'),
        failed: I18n.t('slides.show.failed', { message: '{message}' }),
      }),
    };
  }
  // Ce que le lecteur lit sur l'éditeur au départ : la transition et le passage seul de chaque diapositive, la première page de chacune (la pagination est celle que la Lecture reprend) et son signet (la cible d'un lien).
  function readSlides() {
    const ed = EditorCore.getEditor();
    const props = ed ? SlideProps.listOf(ed.state.doc) : [];
    const timings = ed ? SlideProps.timingsOf(ed.state.doc) : [];
    const anchors = ed ? SlideProps.anchorsOf(ed.state.doc) : [];
    return { props, timings, starts: props.map((_, k) => firstPageOf(k)), anchors };
  }

  async function start(fromCurrent) {
    if (run || launching) return;
    if (off) { SlidesEntry.explainOff(); return; }
    closeMenu(false);
    const html = SlidesEntry.outputHtml('presentation', Editor.getHTML());
    const headerFooter = Editor.getHeaderFooterData();
    const how = { startPage: fromCurrent ? firstPageOf(currentSlide()) : 0, fromCurrent: !!fromCurrent };
    const focusBack = document.activeElement;
    launching = true;
    try {
      // Une image d'un autre site se montre au diaporama comme dans un export : la même question d'abord (ExternalImages), « Annuler » ne lance rien.
      try { await ExternalImages.confirmExport(html, headerFooter); } catch (e) { return; }
      if (run) return;
      // La fenêtre à part s'ouvre ICI, tout de suite après le geste (le départ, ou le bouton de la question ci-dessus, un geste neuf) et avant le rendu, qui prend du temps : le navigateur n'accorde plus la fenêtre environ 5 s après le geste ; refusée, le panneau la remplace, avec une ligne qui le dit.
      const wanted = routeOf() === 'window';
      const link = wanted ? SlideWindow.open(windowInfo()) : null;
      if (link) await playInWindow(link, html, headerFooter, how);
      else await playInPanel(html, headerFooter, how, focusBack, wanted);
    } finally {
      launching = false;
    }
  }

  // Dans la fenêtre à part : le rendu mesuré, le même que celui du panneau, part vers elle dès qu'il est prêt (slide-window.js). Rien ne se pose dans le panneau, ni la barre de GFS masquée.
  async function playInWindow(link, html, headerFooter, how) {
    let job = null;
    try {
      const slides = readSlides();
      job = await PrintExport.stage(FrameAnim.stampSlides(html), GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), headerFooter, { id: SlidePlayer.HOST_ID, parent: document.body });
      const payload = SlideWindow.pack(job, Object.assign({}, slides, how));
      job.dispose();
      job = null;
      link.deliver(payload);
    } catch (e) {
      if (job) job.dispose();
      link.cancel();
      SlidesEntry.status(I18n.t('slides.show.failed', { message: (e && e.message) || String(e) }));
    }
  }

  // Dans le panneau. `refused` : la fenêtre à part était voulue et le navigateur l'a refusée ; une ligne le dit.
  async function playInPanel(html, headerFooter, how, focusBack, refused) {
    const player = SlidePlayer.create({ labels: labels(), onExit: stop });
    const slides = readSlides();
    run = { player, root: player.root, focusBack };
    const current = run;
    // Le diaporama prend tout le cadre : la barre de GFS ne reste pas par-dessus (rendue par `stop`, quelle que soit la sortie).
    GfsBar.hide(true);
    // Le plein écran se demande tout de suite, dans le geste qui lance (le rendu prend du temps, le navigateur ne l'accorderait plus), quand l'interrupteur du menu est coché et que le
    // cadre le permet ; sinon - ou s'il le refuse quand même - le diaporama garde le panneau.
    if (wantFullscreen && fullscreenAllowed()) player.enterFullscreen();
    player.root.focus({ preventScroll: true });
    if (refused) player.note(I18n.t('slides.show.window.blocked'), 8000);
    try {
      const job = await PrintExport.stage(FrameAnim.stampSlides(html), GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), headerFooter, { id: SlidePlayer.HOST_ID, parent: player.root });
      if (run !== current) { job.dispose(); return; }
      player.load(job, slides, how);
    } catch (e) {
      if (run !== current) return;
      stop();
      SlidesEntry.status(I18n.t('slides.show.failed', { message: (e && e.message) || String(e) }));
    }
  }

  function stop() {
    const current = run;
    if (!current) return;
    run = null;
    current.player.destroy();
    GfsBar.hide(false);
    current.root.remove();
    const back = current.focusBack;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  // Arrivé après la bande (les fichiers de l'extension se chargent sans ordre) : le bouton se montre tout de suite si elle l'est déjà.
  if (typeof SlideStrip !== 'undefined' && SlideStrip.isShown()) sync(true, SlideStrip.isOff());

  // Ce que le diaporama du panneau montre (pour les essais) : la page, l'écran de fin, l'effet en cours.
  const state = () => (run ? run.player.state() : null);

  return { sync, start, stop, state, isRunning: () => !!run };
})();
