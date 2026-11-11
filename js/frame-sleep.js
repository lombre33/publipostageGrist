// Les cadres ENDORMIS d'un très gros diaporama (11/11, un PowerPoint de 57 diapositives et 2 400 cadres : « une fois load ça reste super laggy, impossible de travailler sur les slides »).
//
// Le navigateur met en page, dessine et teste au pointeur tout ce que l'éditeur porte, même à vingt pages de l'écran : dans ce diaporama, 85 des 120 ms d'une lettre tapée étaient le rendu de cadres
// qu'on ne voit pas. Un cadre est une ancre de hauteur nulle (css/free-frame.css). Endormie (la classe FreeFrame.ASLEEP : `display: none`), elle reste dans le texte - ProseMirror n'en sait rien, le
// texte enregistré est le même - mais le navigateur ne lui fait plus de boîte : ni mise en page, ni dessin, ni image décodée, ni test au pointeur, et rien ne bouge autour d'elle (une ancre n'a ni
// hauteur ni marge ; celle qui porte la réserve d'une coupure de page, la seule marge qu'une ancre puisse avoir, ne s'endort pas).
// Mesuré le 11/11 sur ce diaporama (Chromium) : 96 à 120 ms par lettre sans sommeil, 52 ms avec (32 en rafale). `content-visibility: hidden` sur l'ancre, essayé d'abord, garde une boîte à chaque
// endormi : une ancre laissée dans le flux devient un bloc à part que les marges de ses voisins ne traversent plus (une citation ou un tableau s'écartaient de 4 à 6 px), sortie du flux elle coûte
// 15 ms à CHAQUE mise en page du texte (2 240 boîtes à replacer), et un navigateur qui ne connaît pas la propriété n'y gagne rien.
//
// DORMENT les cadres des diapositives qui ne sont ni près de l'écran (AHEAD hauteurs d'écran de part et d'autre), ni celle d'un bout de la sélection, ni ses voisines. Seulement à partir de MIN_FRAMES
// cadres dans le texte : en dessous, rien ne change.
//
// Les règles :
//  - on ne MESURE jamais un cadre endormi (il n'a pas de boîte : sa hauteur lue vaut zéro, son rectangle aussi) : un cadre s'endort mesuré, et sa réponse à « dépasse-t-il de la page ? » reste celle
//    de son dernier éveil (FreeFrame.overflowsPage) ; dev-tests/verify-frame-sleep.mjs compte les lectures de géométrie faites dans un cadre endormi pendant les gestes courants : aucune ;
//  - le réveil suit l'écran (défilement, pagination, taille du panneau : à l'image suivante) et la sélection : AVANT que ProseMirror ne l'écrive dans la page (`props.decorations`, que sa mise à jour appelle avant de dessiner : un clic
//    sur une miniature, « Suivant » de la recherche, un Ctrl+Z qui ramène loin), et de nouveau dans la mise à jour de la vue, avant qu'il n'y fasse défiler ; qui demande les coordonnées d'une position
//    du texte réveille d'abord son cadre (`view.coordsAtPos`, enveloppée ici) : il se rendort à l'image suivante ;
//  - la classe se pose sur l'ancre de la vue de nœud : le cadre ignore déjà les mutations d'attribut de son ancre (`ignoreMutation`), et une ancre que ProseMirror refait la reçoit avant l'image suivante
//    (un observateur des seuls enfants directs du texte) ;
//  - rien d'autre ne lit cette classe : les copies de la bande, la Lecture, le diaporama et les sorties partent du texte, ou d'une copie que la règle de style ne vise pas (elle ne vise que les enfants
//    directs du texte de l'éditeur) ;
//  - la TOURNÉE : ce qui change la hauteur d'un cadre sans toucher à son nœud (le thème, un style du modèle, une police ou une image qui arrive) périme la réponse des endormis. Qui le voit la demande
//    (`recheck` : un cadre éveillé dont la hauteur a bougé sans que son nœud change, FreeFrame.overflowsPage ; les polices du navigateur ; une image chargée dans un cadre endormi) ; elle part après
//    TOUR_WAIT_MS de calme, revoit TOUR_CHUNK cadres à la fois (éveillés le temps d'une seule mise en page : 6 ms), jamais pendant que la personne tape, clique ou fait défiler, ni pendant la pose
//    d'un import, et prévient à la fin ceux qui gardent ces réponses (`onRechecked` : la bande refait ses points rouges) quand l'une d'elles a changé.
// Ce qu'un cadre endormi n'a plus : la recherche du NAVIGATEUR (Ctrl+F natif) n'y trouve rien - celle de l'app lit le texte, et la sélection qu'elle pose réveille la diapositive - et un lecteur d'écran ne
// le parcourt qu'une fois sa diapositive approchée.
const FrameSleep = (function () {
  const MIN_FRAMES = 600;
  const AHEAD = 1;
  const BREAK_CLASS = 'page-break-marker';
  const BREAK_NODE = 'pageBreak';
  const TOUR_WAIT_MS = 1500;       // le calme attendu avant qu'une tournée parte (une rafale de causes n'en fait qu'une)
  const TOUR_WAIT_MAX_MS = 30000;  // ce calme double après chaque tournée qui n'a rien changé, jusqu'ici : une cause qui se répète sans effet (un cadre dont la hauteur bouge seule) ne fait pas tourner sans fin
  const TOUR_STEP_MS = 50;         // entre deux morceaux d'une tournée
  const TOUR_QUIET_MS = 700;       // le temps sans geste de la personne avant qu'un morceau passe
  const TOUR_CHUNK = 32;           // les cadres revus par morceau (0,2 ms par cadre : la page ne s'arrête pas plus de 8 ms)
  const GESTURES = ['keydown', 'pointerdown', 'pointerup', 'pointercancel', 'wheel'];

  let view = null;
  let on = false;                  // le texte a assez de cadres pour qu'on en endorme
  let countedDoc = null;           // le texte que `on` a compté
  let near = null;                 // { first, last } : les diapositives près de l'écran à la dernière lecture ; null avant elle (tout est éveillé)
  let picked = new Set();          // celles des deux bouts de la sélection, et leurs voisines
  let seenDoc = null;              // le texte et la sélection de la dernière lecture faite avant un dessin (props.decorations) : rien à relire s'ils n'ont pas changé
  let seenSelection = null;
  let request = 0;                 // l'image demandée pour relire l'écran
  let watcher = null;              // l'observateur des enfants directs du texte
  let asleepCount = 0;             // les cadres endormis à la dernière passe
  let tourDue = false;             // une tournée est demandée (depuis le départ de la dernière)
  let tourList = null;             // les cadres de la tournée en cours
  let tourAt = 0;                  // le premier qu'elle n'a pas revu
  let tourFlips = 0;               // les réponses qu'elle a changées
  let tourTimer = 0;
  let tourWait = TOUR_WAIT_MS;     // le calme attendu avant la prochaine
  let tours = 0;                   // les tournées finies (essais, mesures)
  let epoch = 0;                   // les tournées qui ont changé des réponses : qui garde un verdict fait de ces réponses le date avec (answersEpoch)
  let lastGesture = 0;             // le dernier geste de la personne (performance.now)
  let pressed = false;             // un bouton de la souris est tenu (un glissement)
  const recheckedListeners = new Set();

  const scroller = () => document.getElementById('editor-container');
  const isFrameNode = node => node.type.name === FreeFrame.NODE || node.type.name === FreeFrame.LINE_NODE;

  // Le texte a-t-il assez de cadres ? Compté une fois par texte (les blocs de premier niveau seulement : un cadre en est toujours un).
  function decide(doc) {
    if (doc === countedDoc) return;
    countedDoc = doc;
    let frames = 0;
    doc.forEach((node) => { if (isFrameNode(node)) frames += 1; });
    on = frames >= MIN_FRAMES;
  }

  // Les diapositives des deux bouts de la sélection, et leurs voisines : le curseur y entre aux flèches, la sélection s'y étend.
  function pickedOf(state) {
    const doc = state.doc;
    const ends = [state.selection.$anchor.index(0), state.selection.$head.index(0)];
    const last = Math.min(doc.childCount - 1, Math.max(ends[0], ends[1]));
    const found = new Set();
    let slide = 0;
    for (let i = 0; i <= last; i++) {
      if (i === ends[0] || i === ends[1]) { found.add(slide - 1); found.add(slide); found.add(slide + 1); }
      if (doc.child(i).type.name === BREAK_NODE) slide += 1;
    }
    // Un bout après le dernier bloc (la fin du texte) : la dernière diapositive.
    if (ends[0] >= doc.childCount || ends[1] >= doc.childCount) { found.add(slide - 1); found.add(slide); }
    return found;
  }
  const sameSet = (a, b) => a.size === b.size && Array.from(a).every(x => b.has(x));

  // Les diapositives près de l'écran, lues sur les sauts de page (la diapositive k va du saut k - 1 au saut k) ; null quand l'éditeur n'est pas à l'écran (rien à lire : on garde ce qu'on savait).
  function readNear() {
    const box = scroller();
    if (!view || !box || !view.dom.getClientRects().length) return null;
    const rect = box.getBoundingClientRect();
    if (!rect.height) return null;
    const top = rect.top - rect.height * AHEAD;
    const bottom = rect.bottom + rect.height * AHEAD;
    const marks = view.dom.querySelectorAll(':scope > .' + BREAK_CLASS);
    let first = 0;
    let last = marks.length;
    for (let k = 0; k < marks.length; k++) {
      const y = marks[k].getBoundingClientRect().top;
      if (y < top) first = k + 1;
      if (y > bottom) { last = k; break; }
    }
    return { first, last };
  }

  // Met chaque cadre dans l'état de sa diapositive. Les réveils d'abord, puis la mesure de ceux qui vont dormir (toutes les lectures ensemble : une seule mise en page), puis leur classe.
  // Une ancre qui porte la réserve d'une coupure de page (la dernière pagination l'a choisie : sa marge du bas écarte les pages) reste éveillée : hors du flux, sa marge n'écarterait plus rien.
  function apply() {
    if (!view) return;
    const sleeping = on && near !== null;
    const children = view.dom.children;
    const carriers = sleeping ? new Set(HeaderFooterPreview.pageBreaks().map(brk => brk.afterEl)) : null;
    const toSleep = [];
    let count = 0;
    let slide = 0;
    for (let i = 0; i < children.length; i++) {
      const classes = children[i].classList;
      if (classes.contains(BREAK_CLASS)) { slide += 1; continue; }
      if (!classes.contains(FreeFrame.CLASS)) continue;
      const sleep = sleeping && (slide < near.first || slide > near.last) && !picked.has(slide) && !carriers.has(children[i]);
      if (sleep) count += 1;
      if (sleep === classes.contains(FreeFrame.ASLEEP)) continue;
      if (sleep) toSleep.push(children[i]); else classes.remove(FreeFrame.ASLEEP);
    }
    toSleep.forEach((dom) => { FreeFrame.overflowsPage(dom); });
    toSleep.forEach((dom) => { dom.classList.add(FreeFrame.ASLEEP); });
    asleepCount = count;
  }

  // L'écran a bougé (défilement, pagination, taille du panneau) ou des blocs sont arrivés : l'état se relit à l'image suivante, une fois.
  function schedule() {
    if (request || (!on && !asleepCount)) return;
    request = requestAnimationFrame(() => {
      request = 0;
      if (!view) return;
      if (on) near = readNear() || near;
      apply();
    });
  }

  // Le cadre de premier niveau qui porte la position `pos` se réveille tout de suite s'il dort : ses coordonnées sont alors celles d'un cadre mis en page. Il se rendort à l'image suivante (la passe
  // demandée ici), sauf si la sélection ou l'écran l'ont rejoint entre-temps.
  function wakeAt(pos) {
    if (!view || !asleepCount) return;
    let node = null;
    try { node = view.domAtPos(pos).node; } catch (e) { return; }
    while (node && node.parentNode !== view.dom) node = node.parentNode;
    if (!node || !node.classList || !node.classList.contains(FreeFrame.ASLEEP)) return;
    node.classList.remove(FreeFrame.ASLEEP);
    schedule();
  }

  // --- La tournée des endormis ---

  function onGesture(event) {
    lastGesture = performance.now();
    if (event.type === 'pointerdown') pressed = true;
    else if (event.type === 'pointerup' || event.type === 'pointercancel') pressed = false;
  }
  const tourRests = () => document.hidden || pressed || performance.now() - lastGesture < TOUR_QUIET_MS || ImportPlacing.isPlacing();
  function tourStep() {
    tourTimer = 0;
    if (!view) return;
    if (tourRests()) { tourTimer = setTimeout(tourStep, TOUR_QUIET_MS); return; }
    if (!tourList) {
      if (!tourDue) return;
      tourDue = false;
      tourList = Array.from(view.dom.querySelectorAll(':scope > .' + FreeFrame.ASLEEP));
      tourAt = 0;
      tourFlips = 0;
    }
    tourFlips += FreeFrame.recheckAsleep(tourList.slice(tourAt, tourAt + TOUR_CHUNK));
    tourAt += TOUR_CHUNK;
    if (tourAt < tourList.length) { tourTimer = setTimeout(tourStep, TOUR_STEP_MS); return; }
    tourList = null;
    tours += 1;
    const flips = tourFlips;
    tourWait = flips ? TOUR_WAIT_MS : Math.min(tourWait * 2, TOUR_WAIT_MAX_MS);
    // Demandée de nouveau pendant qu'elle tournait : ce qu'elle a revu avant a pu changer, elle repart après le calme.
    if (tourDue) tourTimer = setTimeout(tourStep, tourWait);
    if (!flips) return;
    epoch += 1;
    recheckedListeners.forEach((fn) => { fn(flips); });
  }
  // La hauteur de cadres a pu changer sans que leur nœud change : les endormis sont à revoir. Sans effet tant que rien ne dort.
  function recheck() {
    if (!view || !asleepCount) return;
    tourDue = true;
    if (!tourTimer) tourTimer = setTimeout(tourStep, tourWait);
  }
  // `fn(changées)` après une tournée qui a changé des réponses ; rend de quoi se désabonner.
  function onRechecked(fn) { recheckedListeners.add(fn); return () => recheckedListeners.delete(fn); }
  // Une image chargée dans un cadre endormi (`load` ne remonte pas : écouté à la descente) : sa boîte a pu grandir.
  function onLoaded(event) {
    if (!asleepCount || !view || !(event.target instanceof HTMLImageElement)) return;
    let node = event.target;
    while (node && node.parentNode !== view.dom) node = node.parentNode;
    if (node && node.classList.contains(FreeFrame.ASLEEP)) recheck();
  }

  function createPlugin(deps) {
    const { Plugin, PluginKey } = deps;
    return new Plugin({
      key: new PluginKey('frameSleep'),
      props: {
        // Une sélection qui part dans une diapositive endormie : ses cadres se réveillent AVANT que ProseMirror n'écrive la sélection dans la page (une sélection posée dans un cadre sans boîte n'a pas de
        // curseur à l'écran). `decorations` est appelée par `updateStateInner` avec le NOUVEL état, avant qu'il ne refasse la page et n'y écrive la sélection - le seul endroit où s'accrocher sans
        // envelopper `updateState`. Les blocs de la page sont alors encore ceux du texte d'avant : quand le texte change aussi (un Ctrl+Z qui ramène loin), les rangs des diapositives sont ceux d'avant,
        // justes tant qu'aucune diapositive n'est ajoutée ni retirée avant la sélection - sinon ses voisines, éveillées avec elle, couvrent un rang d'écart, et la passe qui suit la page refaite
        // (l'observateur des blocs, la mise à jour de la vue) remet chaque cadre dans son état. Ne décore rien.
        decorations(state) {
          if (!asleepCount || !view) return null;
          if (state.doc === seenDoc && seenSelection && state.selection.eq(seenSelection)) return null;
          seenDoc = state.doc;
          seenSelection = state.selection;
          const now = pickedOf(state);
          if (!sameSet(now, picked)) { picked = now; apply(); }
          return null;
        },
      },
      view(editorView) {
        view = editorView;
        countedDoc = null;
        near = null;
        asleepCount = 0;
        tourDue = false;
        tourList = null;
        tourWait = TOUR_WAIT_MS;
        decide(view.state.doc);
        picked = pickedOf(view.state);
        seenDoc = null;
        seenSelection = null;
        const box = scroller();
        if (box) box.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        const stopPaginated = HeaderFooterPreview.onPaginated(schedule);
        // Une ancre posée ou refaite par ProseMirror n'a pas la classe : elle la reçoit avant l'image suivante (les mutations se livrent à la fin de la tâche), et l'écran se relit (des diapositives ont pu
        // changer de rang).
        watcher = new MutationObserver(() => { if (on || asleepCount) { apply(); schedule(); } });
        watcher.observe(view.dom, { childList: true });
        // La tournée : ses causes sans transaction (une police, une image), et les gestes pendant lesquels elle attend.
        const dom = view.dom;
        dom.addEventListener('load', onLoaded, true);
        const fonts = document.fonts && document.fonts.addEventListener ? document.fonts : null;
        if (fonts) fonts.addEventListener('loadingdone', recheck);
        GESTURES.forEach((type) => { document.addEventListener(type, onGesture, { capture: true, passive: true }); });
        // `coordsAtPos` de CETTE vue (une propriété à elle, retirée avec le greffon : la méthode de ProseMirror reprend alors sa place). `updateState`, lui, n'est PAS enveloppé : la bande des diapositives
        // l'enveloppe pour qu'une diapositive déplacée ne fasse pas redessiner tout ce qu'elle traverse (slide-strip.js:lightRedraw, qui s'abstient devant une propriété posée par un autre).
        const coordsAtPos = editorView.coordsAtPos;
        editorView.coordsAtPos = function (pos, side) { wakeAt(pos); return coordsAtPos.call(this, pos, side); };
        schedule();
        return {
          update(updated, prevState) {
            view = updated;
            const state = updated.state;
            const was = on;
            if (prevState.doc !== state.doc) decide(state.doc);
            if (!on && !asleepCount) return;
            const now = pickedOf(state);
            if (on === was && sameSet(now, picked)) return;
            picked = now;
            apply();
            schedule();
          },
          destroy() {
            if (box) box.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            if (typeof stopPaginated === 'function') stopPaginated();
            if (watcher) watcher.disconnect();
            watcher = null;
            if (request) cancelAnimationFrame(request);
            request = 0;
            dom.removeEventListener('load', onLoaded, true);
            if (fonts) fonts.removeEventListener('loadingdone', recheck);
            GESTURES.forEach((type) => { document.removeEventListener(type, onGesture, { capture: true }); });
            clearTimeout(tourTimer);
            tourTimer = 0;
            tourList = null;
            tourDue = false;
            pressed = false;
            delete editorView.coordsAtPos;
            view = null;
          },
        };
      },
    });
  }

  // Des cadres peuvent-ils dormir dans le texte d'à présent ? (La pose d'un gros import n'a alors plus à masquer tout le texte : js/import-placing.js.)
  const isOn = () => on;
  // Combien dorment (essais, mesures).
  const asleep = () => asleepCount;
  // Les cadres de la diapositive de rang `slide` dorment-ils, d'après la dernière passe ?
  const sleeps = slide => on && near !== null && (slide < near.first || slide > near.last) && !picked.has(slide);

  // Les tournées finies, et celle qui attend ou tourne (essais, mesures).
  const toursDone = () => tours;
  const tourPending = () => tourDue || !!tourList;
  // Monte à chaque tournée qui a changé des réponses « ce cadre dépasse » : un verdict gardé sous un autre nombre est périmé.
  const answersEpoch = () => epoch;

  return { createPlugin, isOn, asleep, sleeps, wakeAt, recheck, onRechecked, answersEpoch, toursDone, tourPending, MIN_FRAMES, AHEAD, TOUR_WAIT_MS, TOUR_QUIET_MS };
})();
