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
// Une diapositive lourde (des centaines de cadres) se pose elle-même en plusieurs PAS, coupés entre deux blocs de premier niveau (`stepsOf`), et le début de l'import n'est lui-même que de quoi tenir en
// quelques dizaines de millisecondes (`takeFirst`). La MÊME pose sert à l'OUVERTURE d'un gros modèle enregistré (`planOpen`, `fillOpened`, nuit du 10 au 11/11 : « zéro gel à l'ouverture ») : voir plus bas.
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
  let hintEl = null;
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
    hintEl = el('p', 'pp-placing-hint');
    hintEl.textContent = I18n.t('importPlacing.hint');
    win.body.append(lineEl, track, hintEl);
    cancelButton = Dom.button('', I18n.t('importPlacing.cancel'));
    cancelButton.onclick = askCancel;
    win.actions.appendChild(cancelButton);
    showCancel();
  }

  // Un suivi d'avancement : `update(texte, fraction, force)` à chaque pas (le texte dit où l'on en est, la barre suit la fraction de 0 à 1 ; le voile ne se redessine pas plus d'une fois par 80 ms, `force` l'y oblige) ; `allowCancel(fonction)` pose « Annuler l'import » (la fonction est appelée au clic
  // et à Échap), `allowCancel(null)` le retire ; `suspend()` cache le voile jusqu'au pas suivant (une question à la personne, la fenêtre du rapport) ; `end()` le retire pour de bon (une seule fois : un suivi
  // déjà terminé ne touche plus au voile, qu'un autre suivi a pu remontrer). `options.opening` : l'OUVERTURE d'un modèle enregistré (titre et conseil à elle) ; le voile est là dès le premier pas - un modèle qui
  // s'ouvre par morceaux dure toujours plus d'une demi-seconde, et pendant son premier morceau le texte n'est que le début du modèle : rien ne s'y tape.
  function begin(options) {
    const opening = !!(options && options.opening);
    let quietFrom = performance.now() - (opening ? SHOW_AFTER_MS : 0);   // le voile n'apparaît qu'après SHOW_AFTER_MS de travail depuis ce moment : le début de l'import, ou la reprise après une question quand il ne s'était pas encore montré
    let last = null;
    let ended = false;
    let suspended = false;
    let shown = false;
    let drawnAt = 0;
    let timer = 0;
    function draw(force) {
      if (ended || suspended || !last) return;
      const now = performance.now();
      if (now - quietFrom < SHOW_AFTER_MS || (!force && now - drawnAt < 80)) return;
      drawnAt = now;
      shown = true;
      build();
      lineEl.textContent = last.text;
      win.title.textContent = I18n.t(opening ? 'importPlacing.openTitle' : 'importPlacing.title');
      hintEl.textContent = I18n.t(opening ? 'importPlacing.openHint' : 'importPlacing.hint');
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
      update(text, fraction, force) {
        last = { text, fraction: fraction || 0 };
        if (suspended) {
          suspended = false;
          // Une question vient de se fermer : un petit fichier (le voile ne s'est pas montré) ne le voit toujours pas, un gros fichier le retrouve tout de suite.
          if (!shown) { quietFrom = performance.now(); arm(); }
        }
        draw(force);
      },
      // Le voile est-il à l'écran à cet instant (affiché, ni suspendu ni retiré) ? Ce qui est dessous ne se voit alors pas.
      isShown() { return shown && !ended && !suspended && !!win && win.isOpen(); },
      allowCancel(handler) { cancelHandler = typeof handler === 'function' ? handler : null; showCancel(); },
      suspend() { suspended = true; clearTimeout(timer); if (win && win.isOpen()) win.hide(); },
      end() { if (ended) return; ended = true; clearTimeout(timer); cancelHandler = null; showCancel(); if (win && win.isOpen()) win.hide(); },
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
  // Le texte masqué pendant la pose d'un très gros fichier (LOCK_AFTER_FRAMES) : rien d'autre que le style en ligne de la racine du texte, remis par la pose elle-même (`finally` de appendSlides).
  const lockDom = () => { EditorCore.getEditor().view.dom.style.contentVisibility = 'hidden'; };
  const unlockDom = () => { EditorCore.getEditor().view.dom.style.contentVisibility = ''; };

  // Mesure les cadres posés depuis le bloc `from` : leur mise en page se fait ici, par morceaux, et FreeFrame garde la réponse que la bande relira à la fin.
  function measureFrom(from) {
    const children = EditorCore.getEditor().view.dom.children;
    for (let i = from; i < children.length; i++) if (children[i].classList.contains(FreeFrame.CLASS)) FreeFrame.overflowsPage(children[i]);
  }

  // Les éléments qui peuvent CONTENIR un saut de page (un cadre, une colonne, une case de tableau, un élément de liste, une citation) : un texte coupé à un saut de page qui est dans l'un d'eux couperait cet
  // élément en deux. Un morceau coupé proprement ouvre et ferme chacun d'eux autant de fois ; sinon l'ouverture par morceaux est abandonnée (`strict`).
  const CONTAINERS = ['div', 'table', 'ul', 'ol', 'blockquote'];
  function occurrences(text, needle) {
    let found = 0;
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) found += 1;
    return found;
  }
  const balanced = text => CONTAINERS.every(tag => occurrences(text, '<' + tag) === occurrences(text, '</' + tag + '>'));

  // --- Ce que coûte un texte, et ses pas ---
  // Poser un texte d'un bloc tient la page le temps de l'analyser, de le dessiner et de le mesurer. Mesuré le 11/11 (Chromium sans écran, cinq modèles de 1 à 19 millions de signes : 17 s pour 20 000 cadres, 5 s
  // pour 500 diapositives de texte, 2,3 s pour 57 diapositives de 2 400 cadres, 1,3 s pour 40 diapositives de 7 000 cases de tableau) : ce temps suit, à 15 % près, le nombre de cadres libres, de cases et de
  // sauts de page - le nombre de signes compte presque pour rien (les photos sont des adresses de données, décodées à part). Un pas de la pose coûte le même temps par cadre qu'un chargement d'un bloc.
  const MARKER_OPEN = '<div class="page-break-marker"';
  const MARKER_CLASS = 'page-break-marker';
  const COST_MS_PER_FRAME = 0.9;
  const COST_MS_PER_CELL = 0.12;
  const COST_MS_PER_MARKER = 8;
  const COST_MS_PER_CHAR = 0.00005;
  const STEP_MS = 40;                // le travail d'un pas de la pose : la page reprend la main après chacun (un cadre ~1 ms : une quarantaine de cadres)
  const FIRST_MS = 50;               // celui du premier morceau d'une ouverture, que le chemin habituel pose d'un bloc, à froid (le moteur n'a encore rien chauffé : deux à quatre fois l'estimation) : la page ne s'arrête pas plus de 300 ms avant le voile
  const SPLIT_SLACK = 1.5;           // un texte qui coûte moins d'une fois et demie le pas n'est pas coupé (un pas de plus ne vaut pas un reste de rien)
  const cellsIn = text => occurrences(text, '<td') + occurrences(text, '<th ') + occurrences(text, '<th>');
  // Ce que contient un texte et ce qu'il coûterait posé d'un bloc : { frames, cells, markers, ms }.
  function profileOf(text) {
    const frames = framesIn(text);
    const cells = cellsIn(text);
    const markers = occurrences(text, MARKER_OPEN);
    return { frames, cells, markers, ms: text.length * COST_MS_PER_CHAR + frames * COST_MS_PER_FRAME + cells * COST_MS_PER_CELL + markers * COST_MS_PER_MARKER };
  }
  // Les marques qu'un pas franchit : l'ouverture ou la fermeture d'un élément qui en CONTIENT d'autres (CONTAINERS), la fin d'un bloc simple de premier niveau (`</p>`, un titre, un bloc de code, un trait
  // `<hr>`) et l'ouverture d'une case de tableau (qui compte pour le coût).
  const STEP_TAGS = /<(\/?)(div|table|ul|ol|blockquote)\b[^>]*>|<\/(?:p|h[1-6]|pre)>|<hr\b[^>]*>|<t[dh]\b/g;
  // Les PAS d'un texte de blocs de premier niveau : le texte se coupe aux frontières de ces blocs - jamais DANS un cadre, une case, une liste ou une citation, quel que soit ce qu'ils contiennent, un saut de page
  // compris - en pas qui coûtent chacun à peu près `budget` ms (un bloc plus lourd à lui seul fait un pas à lui seul). Chaque pas est { text, ms } ; les pas mis bout à bout redonnent exactement le texte. La
  // lecture est paresseuse : un pas ne parcourt que son propre texte, la page ne s'arrête pas à lire le suivant (un texte de 19 millions de signes ne se lit pas d'un coup). `knownMs` : le coût du texte, quand
  // l'appelant l'a déjà calculé.
  function* stepsOf(text, budget, knownMs) {
    const totalMs = typeof knownMs === 'number' ? knownMs : profileOf(text).ms;
    if (totalMs <= budget * SPLIT_SLACK) { yield { text, ms: totalMs }; return; }
    const tags = new RegExp(STEP_TAGS.source, 'g');
    let from = 0;
    let depth = 0;
    let tagMs = 0;
    let doneMs = 0;
    for (let found = tags.exec(text); found; found = tags.exec(text)) {
      const tag = found[0];
      let boundary = false;
      if (found[2]) {
        if (found[1]) { depth -= 1; boundary = depth <= 0; if (depth < 0) depth = 0; }
        else {
          depth += 1;
          if (found[2] === 'div') {
            if (tag.indexOf(FRAME_MARK) > 0) tagMs += COST_MS_PER_FRAME;
            else if (tag.indexOf(MARKER_CLASS) > 0) tagMs += COST_MS_PER_MARKER;
          }
        }
      } else if (tag.charCodeAt(1) === 116) tagMs += COST_MS_PER_CELL;
      else boundary = depth === 0;
      if (!boundary) continue;
      const at = found.index + tag.length;
      const ms = tagMs + (at - from) * COST_MS_PER_CHAR;
      if (ms < budget || totalMs - doneMs - ms < budget / 2) continue;      // pas assez pour un pas, ou il ne resterait qu'une queue de rien
      yield { text: text.slice(from, at), ms };
      from = at;
      doneMs += ms;
      tagMs = 0;
    }
    if (from < text.length) yield { text: text.slice(from), ms: Math.max(0, totalMs - doneMs) };
  }

  // L'import (js/main-import.js) : le début des diapositives lues passe par le chemin habituel (type, page, bande), d'un bloc ; les autres se posent à la suite par pas. Ce début est les FIRST_SLIDES premières
  // diapositives, ou - quand elles coûtent plus d'un pas et demi du début (FIRST_MS : des diapositives de milliers de cadres) - seulement le début de ce texte, coupé entre deux blocs de premier niveau : le reste de
  // ces diapositives devient le premier des morceaux, qui n'ouvre pas de diapositive (`leads[0]` vide) et se pose par pas comme les autres. `texts` (la liste de l'import) est CONSOMMÉ : ce qui est dans `first`
  // n'y est plus. Rend { first (le texte du début), pieces (les morceaux à poser), leads (le début de chacun : son saut de page, '' pour la suite d'une diapositive), started (les diapositives que `first` commence) }.
  function takeFirst(texts) {
    const head = texts.splice(0, Math.min(texts.length, FIRST_SLIDES));
    const joined = head.join(PAGE_BREAK);
    const lightLeads = () => texts.map(() => PAGE_BREAK);
    const profile = profileOf(joined);
    if (profile.ms <= FIRST_MS * SPLIT_SLACK) return { first: joined, pieces: texts, leads: lightLeads(), started: head.length };
    const cut = stepsOf(joined, FIRST_MS, profile.ms).next().value;
    if (!cut || cut.text.length >= joined.length) return { first: joined, pieces: texts, leads: lightLeads(), started: head.length };
    return { first: cut.text, pieces: [joined.slice(cut.text.length)].concat(texts), leads: [''].concat(lightLeads()), started: occurrences(cut.text, MARKER_OPEN) + 1 };
  }

  // La pose en cours : une pose qui n'est plus celle-là (un autre texte a pris l'éditeur, ou une autre pose a commencé) ne touche plus à rien en finissant.
  let activeRun = null;

  // Ajoute les diapositives `pieces` à la suite du texte de l'éditeur, une par une ; `onPlaced(n)` après chacune. Les textes sont CONSOMMÉS : chacun est libéré dès que sa diapositive est posée (la liste que
  // donne l'import ne garde rien de ce qui est déjà dans l'éditeur). Une diapositive que l'éditeur refuse est remplacée par une page vide (les rangs ne bougent pas) et comptée ; rend ce compte.
  // Une diapositive qui coûte plus d'un pas et demi (`stepsOf` : STEP_MS, ses cadres, ses cases) se pose en PLUSIEURS pas, coupés entre deux blocs de premier niveau : la page reprend la main après chacun,
  // même quand une seule diapositive porte des milliers de cadres (sinon c'est elle qui tient la page, 8 s pour 3 300 cadres).
  // `options` : `covered` (le voile est-il à l'écran ? begin().isShown : le texte se masque alors, voir LOCK_AFTER_FRAMES) ; `markers` (le début de chaque morceau - son saut de page, tel que le texte ENREGISTRÉ
  // l'écrit : il peut porter le sens des pages qui suivent ; '' pour un morceau qui n'en commence pas, comme la suite d'un texte ; sans cette liste, le saut de l'import) ; `shouldStop` (rend vrai quand l'éditeur a
  // changé de texte : la pose s'arrête là sans rien poser de plus ni clore) ; `strict` (l'ouverture d'un modèle enregistré : un pas coupé en deux ou refusé fait lever l'erreur - une page vide à sa place ferait
  // perdre la diapositive à l'enregistrement suivant) ; `tail` : le texte qui précède le premier morceau (le premier morceau du plan), dont la fin dit si TipTap a rangé un paragraphe vide sous lui : ce
  // paragraphe est retiré avant le pas suivant, pour que le texte obtenu soit celui d'un chargement d'un bloc à l'octet près (entre deux pas d'une même diapositive, dans tous les cas) ;
  // `onStep({ markers, fraction })` après chaque pas : le nombre de sauts de page posés jusqu'ici, et - avec `totalMs`, le coût de tout ce qui est à poser - la part du coût déjà posée ;
  // `onClosing()` une fois, quand le texte masqué (LOCK_AFTER_FRAMES) va être remontré : la mise en page de tout le texte d'un coup tient la page quelques secondes (1 à 2 s pour 60 000 cadres), le voile le dit avant.
  const endsWithParagraph = text => /<\/p>\s*$/.test(text.length > 64 ? text.slice(-64) : text);
  async function appendSlides(pieces, onPlaced, options) {
    const opts = options || {};
    const covered = typeof opts.covered === 'function' ? opts.covered : () => false;
    const shouldStop = typeof opts.shouldStop === 'function' ? opts.shouldStop : () => false;
    const onStep = typeof opts.onStep === 'function' ? opts.onStep : null;
    const onClosing = typeof opts.onClosing === 'function' ? opts.onClosing : null;
    const markers = Array.isArray(opts.markers) ? opts.markers : null;
    const strict = !!opts.strict;
    const totalMs = typeof opts.totalMs === 'number' && opts.totalMs > 0 ? opts.totalMs : 0;
    let tailIsParagraph = typeof opts.tail === 'string' ? endsWithParagraph(opts.tail) : true;   // le dernier bloc posé est un paragraphe : TipTap n'a rien rangé dessous
    const run = {};
    activeRun = run;
    const pace = pacer();
    let failed = 0;
    let frames = 0;
    let placedMarkers = 0;
    let placedMs = 0;
    let locked = false;
    let unmeasured = -1;                        // le texte est masqué : les cadres posés depuis ce bloc seront mesurés d'un coup, une fois remontré
    unlockDom();                                // la pose d'avant, si elle a laissé le texte masqué, n'est plus là pour le remontrer
    // La bande se tient dès qu'elle existe : l'extension des diapositives se charge APRÈS le premier morceau d'une ouverture (elle n'est pas là au premier pas, puis cachée, puis montrée) ; une bande qui n'est pas
    // tenue relit TOUTES les diapositives posées à chaque pas (275 mesures au 5e pas, des milliers au 400e : le temps de la pose doublait).
    let stripHeld = false;
    const holdStrip = () => { if (!stripHeld && typeof SlideStrip !== 'undefined') { SlideStrip.hold(true); stripHeld = true; } };
    holdStrip();
    try {
      for (let i = 0; i < pieces.length; i++) {
        if (shouldStop()) return failed;
        const lead = markers && typeof markers[i] === 'string' ? markers[i] : PAGE_BREAK;
        let refused = false;
        let first = true;
        for (const step of stepsOf(pieces[i], STEP_MS)) {
          if (!first && shouldStop()) return failed;
          const html = (first ? lead : '') + step.text;
          if (strict && !balanced(html)) throw Object.assign(new Error('un morceau est coupé en deux'), { code: 'split' });
          holdStrip();
          let from;
          try {
            from = Editor.appendHTML(html, strict || !first || lead === '' ? { dropTrailing: !tailIsParagraph } : undefined);
            tailIsParagraph = endsWithParagraph(step.text);
          } catch (e) {
            if (strict) throw e;
            if (!refused) failed += 1;
            refused = true;
            console.warn('[import-placing] diapositive refusée par l’éditeur', e);
            from = first ? Editor.appendHTML(PAGE_BREAK + '<p></p>') : Editor.appendHTML('<p></p>');
            tailIsParagraph = true;
          }
          frames += framesIn(step.text);
          placedMarkers += occurrences(html, MARKER_OPEN);
          placedMs += step.ms;
          if (locked) { if (unmeasured < 0) unmeasured = from; } else measureFrom(from);
          if (!locked && frames >= LOCK_AFTER_FRAMES && covered()) { lockDom(); locked = true; }
          if (onStep) onStep({ markers: placedMarkers, fraction: totalMs ? Math.min(1, placedMs / totalMs) : 0 });
          first = false;
          await pace();
        }
        pieces[i] = '';
        onPlaced(i + 1);
      }
      if (shouldStop()) return failed;
      if (locked && onClosing) {
        onClosing();
        await breatheAndPaint();                // le mot du voile se peint avant la mise en page de tout le texte
        if (shouldStop()) return failed;
      }
      unlockDom();
      locked = false;
      await breatheAndPaint();                  // la mise en page et le dessin de tout le texte d'un coup, dans leur propre tâche : le voile est encore là
      if (unmeasured >= 0) {
        // Chaque mesure d'un cadre d'un texte masqué le met en page tout entier (400 ms de plus à chaque pas pour 20 000 cadres) : celles du texte masqué se font ici, par tranches, sur une mise en page qui est à jour.
        const children = EditorCore.getEditor().view.dom.children;
        for (let i = unmeasured; i < children.length; i++) {
          if (children[i].classList.contains(FreeFrame.CLASS)) FreeFrame.overflowsPage(children[i]);
          if ((i & 63) === 0) { if (shouldStop()) return failed; await pace(); }
        }
      }
      if (shouldStop()) return failed;
      Editor.settleAppended();                  // la clôture (colonnes, pagination) et la relecture de la bande sont deux tâches, pas une
      await breatheAndPaint();
    } finally {
      if (activeRun === run) {
        activeRun = null;
        unlockDom();
        if (stripHeld) SlideStrip.hold(false);
      }
    }
    return failed;
  }

  // --- L'ouverture par morceaux d'un modèle de présentation ENREGISTRÉ ---
  // Un modèle enregistré se charge d'un bloc (Editor.setHTML) : la page est tenue le temps que tout le texte soit analysé, dessiné et mesuré - 2,3 s pour 57 diapositives de 2 400 cadres, 5 s pour 500 diapositives,
  // 17 s pour 120 diapositives de schémas. Un modèle assez lourd (`planOpen`) s'ouvre donc comme il s'est posé à l'import : son début passe par le chemin habituel de js/main.js:loadTemplateIntoEditor (de quoi
  // voir la présentation, FIRST_MS), et `fillOpened` pose la suite, pas après pas (STEP_MS), sous le voile (« Ouverture des diapositives… n / total »). Les pas se coupent entre deux blocs de premier niveau, quels
  // que soient les sauts de page : une diapositive de 3 000 cadres se pose en plusieurs pas comme les autres. Tant que le remplissage dure, l'éditeur ne montre que le début du modèle : l'enregistrement
  // automatique, l'enregistrement et les exports attendent (`isFilling`, `whenFilled`), l'entrée automatique de l'écriture en direct aussi, et un autre modèle choisi pendant ce temps l'arrête (`stopFill`).
  const OPEN_MIN_CHARS = 120000;     // en dessous, un modèle s'ouvre d'un bloc quoi qu'il contienne : mille cadres d'une ligne font déjà plus
  const OPEN_STALL_MS = 600;         // le gel que coûterait l'ouverture d'un bloc (`profileOf`) au-delà duquel le modèle s'ouvre par morceaux ; un poste plus lent que celui des mesures y vient de plus tôt
  // Le plan d'ouverture du modèle `tpl` : { first (le début du texte), rest (tout le reste, jamais lu d'avance : `stepsOf` le coupe pas après pas), restMs (son coût), firstShare (la part du coût du début), firstSlides,
  // total (les diapositives du modèle) } ; null quand le modèle s'ouvre d'un bloc : trop léger, avec un suivi des modifications (ses positions sont celles du texte entier), ou sans rien à poser à la suite.
  function planOpen(tpl) {
    const text = tpl && tpl.contenu;
    if (typeof text !== 'string' || text.length < OPEN_MIN_CHARS) return null;
    const tracked = tpl.suiviModifications;
    if (tracked && (typeof tracked !== 'object' || Object.keys(tracked).length)) return null;
    const profile = profileOf(text);
    if (profile.ms < OPEN_STALL_MS) return null;
    const head = stepsOf(text, FIRST_MS, profile.ms).next().value;
    if (!head || head.text.length >= text.length || !balanced(head.text)) return null;
    return {
      first: head.text,
      rest: text.slice(head.text.length),
      restMs: Math.max(1, profile.ms - head.ms),
      firstShare: Math.max(0, Math.min(1, head.ms / profile.ms)),
      firstSlides: occurrences(head.text, MARKER_OPEN) + 1,
      total: profile.markers + 1,
    };
  }

  let filling = null;                     // le remplissage en cours : { stopped, progress } ; null quand l'éditeur a tout le texte de son modèle
  let fillDone = Promise.resolve();       // se tient quand le remplissage en cours a fini de tout ranger
  const isFilling = () => !!filling;
  const whenFilled = () => fillDone;
  // Un autre texte prend l'éditeur (js/main.js:loadTemplateIntoEditor, quel que soit le chemin) : le remplissage s'arrête là, voile retiré, sans rien poser de plus.
  function stopFill() {
    if (!filling) return;
    const run = filling;
    filling = null;
    run.stopped = true;
    if (run.progress) run.progress.end();
  }
  // Pose la suite du plan à la suite de son début (`handlers.onPlaced(sauts de page posés, part du coût posée)` après chaque pas, `covered` : le voile est-il à l'écran, `closing` : avant la mise en page finale d'un texte masqué) puis, une fois tout posé ET AVANT que ceux
  // qui attendent soient libérés, appelle `handlers.finish(résultat)` : ce qu'il faut remettre d'aplomb (l'état « à enregistrer », les tableaux et diapositives liés, la Lecture). Résultat : 'done' ;
  // 'broken' (un pas coupé en deux ou refusé : `finish` recharge alors le texte d'un bloc, comme avant) ; 'stopped' (un autre texte a pris l'éditeur : `finish` n'est pas appelé).
  async function fillOpened(plan, handlers) {
    stopFill();
    const run = { stopped: false, progress: handlers.progress || null };
    filling = run;
    let release = () => {};
    fillDone = new Promise(resolve => { release = resolve; });
    let outcome = 'done';
    try {
      await appendSlides([plan.rest], () => {}, { covered: handlers.covered, markers: [''], shouldStop: () => run.stopped, strict: true, tail: plan.first, totalMs: plan.restMs, onStep: info => handlers.onPlaced(info.markers, info.fraction), onClosing: handlers.closing });
      if (run.stopped) outcome = 'stopped';
    } catch (e) {
      if (run.stopped) outcome = 'stopped';
      else {
        outcome = 'broken';
        console.warn('[import-placing] ouverture par morceaux impossible : le texte se charge d’un bloc', e);
      }
    }
    try {
      if (outcome !== 'stopped' && typeof handlers.finish === 'function') handlers.finish(outcome);
    } catch (e) {
      console.warn('[import-placing] fin de l’ouverture par morceaux en échec', e);
    } finally {
      if (filling === run) filling = null;
      release();
    }
    return outcome;
  }

  // Prépare le texte du document pour l'enregistrement qui suit (Editor.prepareHTML) : par tranches, la page répond pendant ce temps.
  const prepareSave = () => Editor.prepareHTML(pacer());

  return { begin, slidesOf, takeFirst, appendSlides, prepareSave, planOpen, fillOpened, stopFill, isFilling, whenFilled, stepsOf, profileOf, FIRST_SLIDES, FIRST_MS, STEP_MS, PAGE_BREAK };
})();
