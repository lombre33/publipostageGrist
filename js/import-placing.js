// L'IMPORT d'une grosse présentation, du début à la fin (10/11, « ça freeze sur Mise en place de 57 diapositives : verrouiller l'éditeur mais ne pas figer, avec l'avancement »).
// Poser tout le texte d'un coup (Editor.setHTML) tient la page plusieurs secondes, et d'autant plus que le fichier est lourd (analyse du texte, une rangée de la bande par diapositive, mesure de chaque cadre,
// pagination), avec toutes les copies du texte en mémoire en même temps. Ici le premier morceau passe par le chemin habituel (loadTemplateIntoEditor : type, page, bande) et les diapositives qui suivent sont
// AJOUTÉES À LA FIN, une à une (Editor.appendHTML : sans historique, sans suggestion, sans évènement `update`), la page reprenant la main après chacune (une tâche ordinaire, jamais plus de 35 ms d'affilée) ;
// pendant ce temps :
//  - un voile couvre le panneau (ModalBase : les clics, le clavier et les raccourcis n'atteignent plus le document) et dit où en est l'import - « Lecture du fichier PowerPoint… n / total », « Mise en place des
//    diapositives… n / total », « Enregistrement du modèle dans Grist… » - avec une barre. Il n'apparaît qu'après une demi-seconde (un petit fichier ne le voit jamais), s'efface devant une question ou la fenêtre
//    du rapport (`suspend`), et porte « Annuler l'import » tant que le fichier se lit (`allowCancel` : rien n'a encore changé) ;
//  - la bande des diapositives est tenue (SlideStrip.hold) : elle ne relit pas tout le texte à chaque diapositive posée, elle le fait une fois à la fin ;
//  - chaque cadre posé est mesuré tout de suite (FreeFrame.overflowsPage garde sa réponse) : la mise en page se fait par morceaux et la relecture finale de la bande ne mesure plus rien.
// À la fin, `Editor.settleAppended` fait ce que setHTML fait une fois pour tout le document (colonnes de tableau, pagination, copie du HTML au repos).
const ImportPlacing = (function () {
  const el = Dom.el;
  const PAGE_BREAK = '<div class="page-break-marker"></div>';
  const FRAME_MARK = 'class="pp-free-frame"';
  const FIRST_SLIDES = 3;        // posées par le chemin habituel : de quoi voir la présentation derrière le voile
  const SLICE_MS = 12;           // une tranche de travail (une diapositive posée en demande 15 à 35 : la pause vient après chacune) ; entre deux tranches, la page répond
  const PAINT_MS = 250;          // toutes les 250 ms la pause attend aussi une image (le voile se peint)
  const SHOW_AFTER_MS = 500;     // le voile n'apparaît qu'après ce délai
  // Un très gros texte (des dizaines de milliers de cadres) coûte, à CHAQUE diapositive posée, la mise en page et le dessin de tout ce qui est déjà là : 14 s de pose au lieu de 26 pour 120 diapositives de
  // schémas quand le texte est masqué (mesuré le 10/11). Le voile le cache de toute façon à la personne : dès qu'il est affiché et que ce nombre de cadres est posé, le texte est MASQUÉ (`content-visibility:
  // hidden` : le navigateur ne le met plus en page ni ne le dessine, mais une mesure demandée sur un de ses cadres le met en page à cet instant : `measureFrom` reste juste) et remontré avant la clôture.
  // Un fichier ordinaire (2 400 cadres pour 57 diapositives) n'atteint jamais ce nombre : il suit le chemin d'avant, sans rien masquer.
  const LOCK_AFTER_FRAMES = 2500;

  // La pause : une tâche ordinaire (scheduler.postTask, rang des minuteurs et des messages de GFS), jamais `scheduler.yield` - sa reprise passe devant tous les minuteurs, qui attendraient la fin de la pose ;
  // sans postTask, un minuteur à 0 ms.
  const breathe = () => new Promise((resolve) => {
    if (typeof scheduler !== 'undefined' && scheduler && typeof scheduler.postTask === 'function') scheduler.postTask(resolve, { priority: 'user-visible' });
    else setTimeout(resolve, 0);
  });
  const breatheAndPaint = () => new Promise((resolve) => {
    // Un onglet caché ne peint rien et ses minuteurs sont ralentis (une seconde, puis une minute) : la pause est alors une simple tâche.
    if (document.hidden) { breathe().then(resolve); return; }
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
    setTimeout(go, 60);                       // une image qui ne vient pas : la pause ne dure jamais plus de 60 ms
  });
  // La fonction `pace()` d'une pose : à appeler souvent, elle ne fait une pause que si la tranche dure depuis SLICE_MS.
  function pacer() {
    let sliceStart = performance.now();
    let lastPaint = sliceStart;
    return async function pace() {
      const now = performance.now();
      if (now - sliceStart < SLICE_MS) return;
      if (now - lastPaint >= PAINT_MS) { await breatheAndPaint(); lastPaint = performance.now(); } else await breathe();
      sliceStart = performance.now();
    };
  }

  // --- Le voile ---
  let win = null;
  let lineEl = null;
  let fillEl = null;
  let cancelButton = null;
  let cancelHandler = null;       // ce que fait « Annuler l'import » (et Échap) du suivi en cours ; null : l'import ne s'annule plus
  const askCancel = () => { if (cancelHandler) cancelHandler(); };
  function showCancel() {
    if (win) win.box.dataset.cancelable = cancelHandler ? 'true' : 'false';
  }
  function build() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-placing-modal', titleId: 'pp-placing-title', size: 'sm', boxClass: 'pp-placing-box', actionsClass: 'var-modal-actions', onEscape: askCancel, restoreFocus: false });
    win.title.textContent = I18n.t('importPlacing.title');
    lineEl = el('p', 'pp-placing-line');
    lineEl.setAttribute('role', 'status');
    const track = el('div', 'pp-placing-bar');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    fillEl = el('div', 'pp-placing-fill');
    track.appendChild(fillEl);
    const hint = el('p', 'pp-placing-hint');
    hint.textContent = I18n.t('importPlacing.hint');
    win.body.append(lineEl, track, hint);
    cancelButton = Dom.button('', I18n.t('importPlacing.cancel'));
    cancelButton.onclick = askCancel;
    win.actions.appendChild(cancelButton);
    showCancel();
  }

  // Un suivi d'avancement : `update(texte, fraction)` à chaque pas (le texte dit où l'on en est, la barre suit la fraction de 0 à 1) ; `allowCancel(fonction)` pose « Annuler l'import » (la fonction est appelée au clic
  // et à Échap), `allowCancel(null)` le retire ; `suspend()` cache le voile jusqu'au pas suivant (une question à la personne, la fenêtre du rapport) ; `end()` le retire pour de bon.
  function begin() {
    let quietFrom = performance.now();   // le voile n'apparaît qu'après SHOW_AFTER_MS de travail depuis ce moment : le début de l'import, ou la reprise après une question quand il ne s'était pas encore montré
    let last = null;
    let ended = false;
    let suspended = false;
    let shown = false;
    let drawnAt = 0;
    let timer = 0;
    function draw() {
      if (ended || suspended || !last) return;
      const now = performance.now();
      if (now - quietFrom < SHOW_AFTER_MS || now - drawnAt < 80) return;
      drawnAt = now;
      shown = true;
      build();
      lineEl.textContent = last.text;
      const percent = Math.max(0, Math.min(100, Math.round(100 * last.fraction)));
      fillEl.style.width = percent + '%';
      fillEl.parentNode.setAttribute('aria-valuenow', String(percent));
      if (!win.isOpen()) win.show(win.box);
      else if (!win.box.contains(document.activeElement)) win.box.focus();   // un chargement qui rend le focus à l'éditeur ne laisse pas la frappe atteindre le texte sous le voile
    }
    // Le voile vient même si aucun pas n'arrive (le premier pas d'une grosse lecture dure des secondes : le fichier se dézippe, les polices se chargent).
    function arm() {
      clearTimeout(timer);
      if (!ended && !shown) timer = setTimeout(draw, Math.max(0, SHOW_AFTER_MS - (performance.now() - quietFrom)) + 30);
    }
    arm();
    return {
      update(text, fraction) {
        last = { text, fraction: fraction || 0 };
        if (suspended) {
          suspended = false;
          // Une question vient de se fermer : un petit fichier (le voile ne s'est pas montré) ne le voit toujours pas, un gros fichier le retrouve tout de suite.
          if (!shown) { quietFrom = performance.now(); arm(); }
        }
        draw();
      },
      // Le voile est-il à l'écran à cet instant (affiché, ni suspendu ni retiré) ? Ce qui est dessous ne se voit alors pas.
      isShown() { return shown && !ended && !suspended && !!win && win.isOpen(); },
      allowCancel(handler) { cancelHandler = typeof handler === 'function' ? handler : null; showCancel(); },
      suspend() { suspended = true; clearTimeout(timer); if (win && win.isOpen()) win.hide(); },
      end() { ended = true; clearTimeout(timer); cancelHandler = null; showCancel(); if (win && win.isOpen()) win.hide(); },
    };
  }

  // --- La pose ---
  // Les diapositives du fichier, une par texte ; l'import les donne séparées (`slideTexts`), sinon le texte entier se coupe aux sauts de page. C'est la liste de l'import elle-même, pas une copie : les textes
  // posés en sont retirés ou vidés, et aucun ne reste en mémoire une fois sa diapositive dans l'éditeur.
  const slidesOf = imported => (Array.isArray(imported.slideTexts) ? imported.slideTexts : String(imported.html || '').split(PAGE_BREAK));

  // Le nombre de cadres libres d'un texte de diapositive (sans l'analyser : le texte est écrit par FreeFrame.html, la classe est toujours posée telle quelle).
  function framesIn(text) {
    let found = 0;
    for (let at = text.indexOf(FRAME_MARK); at >= 0; at = text.indexOf(FRAME_MARK, at + FRAME_MARK.length)) found += 1;
    return found;
  }
  // Le texte masqué pendant la pose d'un très gros fichier (LOCK_AFTER_FRAMES) : rien d'autre que le style en ligne de la racine du texte, remis dans `unlockDocument` (toujours appelé, `finally` de la pose).
  let lockedDom = null;
  function lockDocument() {
    if (lockedDom) return;
    lockedDom = EditorCore.getEditor().view.dom;
    lockedDom.style.contentVisibility = 'hidden';
  }
  function unlockDocument() {
    if (!lockedDom) return;
    lockedDom.style.contentVisibility = '';
    lockedDom = null;
  }

  // Mesure les cadres posés depuis le bloc `from` : leur mise en page se fait ici, par morceaux, et FreeFrame garde la réponse que la bande relira à la fin.
  function measureFrom(from) {
    const children = EditorCore.getEditor().view.dom.children;
    for (let i = from; i < children.length; i++) if (children[i].classList.contains(FreeFrame.CLASS)) FreeFrame.overflowsPage(children[i]);
  }

  // Ajoute les diapositives `pieces` à la suite du texte de l'éditeur, une par une ; `onPlaced(n)` à chaque pas. Les textes sont CONSOMMÉS : chacun est libéré dès que sa diapositive est posée (la liste que donne
  // l'import ne garde rien de ce qui est déjà dans l'éditeur). Une diapositive que l'éditeur refuse est remplacée par une page vide (les rangs ne bougent pas) et comptée ; rend ce compte.
  async function appendSlides(pieces, onPlaced, options) {
    const covered = options && typeof options.covered === 'function' ? options.covered : () => false;   // le voile est-il à l'écran ? (begin().isShown)
    const pace = pacer();
    let failed = 0;
    let frames = 0;
    if (typeof SlideStrip !== 'undefined') SlideStrip.hold(true);
    try {
      for (let i = 0; i < pieces.length; i++) {
        frames += framesIn(pieces[i]);
        let from;
        try {
          from = Editor.appendHTML(PAGE_BREAK + pieces[i]);
        } catch (e) {
          failed += 1;
          console.warn('[import-placing] diapositive refusée par l’éditeur', e);
          from = Editor.appendHTML(PAGE_BREAK + '<p></p>');
        }
        pieces[i] = '';
        measureFrom(from);
        if (!lockedDom && frames >= LOCK_AFTER_FRAMES && covered()) lockDocument();
        onPlaced(i + 1);
        await pace();
      }
      unlockDocument();
      await breatheAndPaint();                  // la mise en page et le dessin de tout le texte d'un coup, dans leur propre tâche : le voile est encore là
      Editor.settleAppended();                  // la clôture (colonnes, pagination) et la relecture de la bande sont deux tâches, pas une
      await breatheAndPaint();
    } finally {
      unlockDocument();
      if (typeof SlideStrip !== 'undefined') SlideStrip.hold(false);
    }
    return failed;
  }

  // Prépare le texte du document pour l'enregistrement qui suit (Editor.prepareHTML) : par tranches, la page répond pendant ce temps.
  const prepareSave = () => Editor.prepareHTML(pacer());

  return { begin, slidesOf, appendSlides, prepareSave, FIRST_SLIDES, PAGE_BREAK };
})();
