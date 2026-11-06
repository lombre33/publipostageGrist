// Le LECTEUR du diaporama (extension « diapositives » de Grist Factory Suite) : la copie mesurée du document (js/print-export.js:stage) posée sur un écran noir, une diapositive à la fois, avec ses
// transitions, ses animations d'objets, son passage seul à la suivante, sa barre du bas et ses gestes. Il joue à deux endroits avec le MÊME code : le panneau du widget (slide-show.js, qui lance le
// diaporama, demande le plein écran et rend la barre de GFS) et la fenêtre à part (slide-present.js, page present.html : le seul moyen d'un vrai plein écran quand le cadre du widget le refuse). Il ne
// sait rien d'eux : celui qui le crée lui donne les textes (`labels`, déjà écrits dans la langue de la page) et ce qu'il faut faire quand le diaporama se termine (`onExit`), puis lui passe la copie
// mesurée par `load`.
//  - PASSER : → ↓ Espace Entrée Page suivante, un clic ou la molette vers le bas avancent ; ← ↑ Retour arrière Page précédente et la molette vers le haut reculent ; Début et Fin vont à
//    la première et à la dernière. Après la dernière, un écran noir dit la fin ; le geste suivant quitte. La souris qui bouge montre la barre du bas (précédente, numéro, suivante,
//    quitter), qui se cache avec le pointeur quand elle s'arrête.
//  - Les TRANSITIONS (demande du 21/10 à 18:35) : en passant d'une diapositive à la suivante (ou à la précédente), l'effet que la diapositive d'arrivée a choisi (js/slide-props.js, lu dans
//    le texte de l'éditeur au départ du diaporama) se joue entre la page qu'on quitte - une copie figée, posée par-dessus - et celle où l'on arrive (slide-transitions.js). En revenant en
//    arrière, c'est la transition de la diapositive qu'on quitte, à l'envers. Passer d'une page à l'autre d'une même diapositive, sauter au début ou à la fin, l'écran de fin : sans effet.
//    Un geste pendant l'effet le termine aussitôt et fait ce qu'il demande. Le mouvement réduit du système ramène tout effet à un fondu court.
//  - Les ANIMATIONS D'OBJETS (chantier 8c de l'import PowerPoint ; js/frame-anim.js) : un objet animé (cadre, forme ou ligne libre) n'est pas là à l'arrivée sur sa diapositive quand son effet
//    est une entrée ; l'animation « automatique » (avec ou après la précédente, avant le premier clic) se joue une fois la transition finie, puis chaque clic (→, Espace, Entrée, la
//    molette ou le bouton « suivante ») joue le pas suivant AVANT de passer à la diapositive d'après ; le geste « précédent » défait le dernier pas d'un coup avant de revenir à la
//    diapositive d'avant, où tout est déjà joué. Un geste pendant un pas le termine aussitôt. Le passage seul (« après n s ») ne joue pas les pas : il passe à la suivante. Sans
//    animation dans la présentation, rien de tout cela ne se passe.
//  - Les LIENS (demandes du 02/11) : un clic sur un lien du texte vers une diapositive mène à elle ; un clic sur un objet à lien (js/frame-link.js : un bouton, une forme, une image) suit le sien - une diapositive, un
//    titre ou un signet, une adresse web, de courrier ou de téléphone, ou une action (suivante, précédente, première, dernière, dernière vue, fin du diaporama). La diapositive où l'on arrive joue SA transition. Le lien du
//    texte passe avant celui de l'objet qui le porte ; un objet sans lien ne laisse pas passer le clic à celui du dessous, il passe à la suivante. Un objet dont la personne a choisi l'animation au clic
//    (`data-ff-link-trans`, js/frame-link.js:transOf) joue cet effet - ou aucun - à la place de celui de la diapositive visée, entre deux diapositives seulement (jamais entre deux pages d'une même diapositive).
//  - SORTIR : Échap, « Quitter », l'écran de fin suivi d'un geste, ou la sortie du plein écran que le lecteur a obtenu : il appelle `onExit`, et c'est à celui qui l'a créé de le fermer (`destroy`).
//  - Le clavier reste dans le lecteur (une fenêtre modale) : aucune touche n'atteint ce qui est dessous. `onGesture(event)` peut prendre un geste (clic, touche) pour lui : la fenêtre à part y
//    demande le plein écran au premier, qui ne doit pas aussi passer à la diapositive suivante.
//  - La VUE INTERVENANT (slide-speaker.js, demande du 02/11) suit le lecteur de loin : `options.onState` lui dit où il en est (la page, la diapositive, les animations qui restent, la page où mène « suivante »)
//    à chaque changement, et `next`, `prev` et `jump` lui obéissent comme au clavier. Le lecteur ne sait rien d'elle : il joue de la même façon avec ou sans.
//  - L'ÉCRAN NOIR, L'ÉCRAN BLANC ET LE STYLO (demande du 04/11, carte « noir, blanc et stylo » ; seulement quand `options.screens` est vrai, c'est-à-dire pour la fenêtre que la vue intervenant pilote : un diaporama sans elle
//    ne change pas) : B noircit l'écran du public, W le blanchit, la même touche le rend ; un geste pour changer de page le rend aussi, et le passage seul (« après n s ») ne le rend pas : il attend derrière l'écran. Le stylo est un trait
//    que la console envoie (`ink`, des parts de la page) et que le lecteur dessine par-dessus la page (`inkLayer`) ; il s'efface quand la page change, ou à `clearInk` (E). `screen`, `ink` et `clearInk` sont les ordres de la console ;
//    l'écran en cours est dans `state()`.
// Styles : extensions/diapositives/slide-show.css. Les fichiers de l'extension se chargent sans ordre : rien ici n'en appelle un autre avant un geste de la personne.
const SlidePlayer = (function () {
  const el = Dom.el;
  const HOST_ID = 'pp-slide-show-stage';   // l'id du conteneur de la copie mesurée (PrintExport.stage), au panneau comme dans la fenêtre à part
  const IDLE_MS = 2000;            // la barre du bas et le pointeur se cachent après ce temps sans mouvement de la souris
  const WHEEL_GAP_MS = 400;        // un cran de molette par diapositive : les crans qui suivent de près sont ignorés

  // Une SURFACE : la copie mesurée du document (`job`, ce que rend PrintExport.stage ou SlideWindow.unpack) posée dans `box` - un cadre à la taille d'une page, au centre, agrandi ou réduit pour que la page entière
  // tienne dans `box` - et la page de la fenêtre `win` (une entrée de la découpe en pages) montrée en la déplaçant dans ce cadre : la copie ne change jamais, elle est déplacée. Le diaporama (plus bas) et la vue
  // intervenant (slide-speaker.js : la page en cours et la suivante) dessinent leurs pages de cette seule façon, si bien qu'elles sont les mêmes au pixel près.
  function surface(job, box) {
    const { host, root: scope, stage } = job;
    host.classList.add('pp-slide-show-host');
    // `z-index:0` : un contexte d'empilement à elle, où le rang qu'une transition donne à un calque (slide-transitions.js:stack) reste : la barre du bas et la ligne d'information, qui ont le leur (`z-index:1`, slide-show.css), restent devant.
    scope.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:transparent;z-index:0';
    const frame = document.createElement('div');
    frame.style.cssText = 'position:absolute;left:50%;top:50%;overflow:hidden;background:#fff;transform-origin:50% 50%';
    const view = document.createElement('div');
    view.className = 'pp-print-window';
    frame.appendChild(view);
    view.appendChild(stage);
    // Le calque : toute la surface, qui porte la page ; une transition le déplace, le fond ou le découpe, la page garde sa place dedans.
    const layer = document.createElement('div');
    layer.className = 'pp-slide-show-layer';
    layer.style.cssText = 'position:absolute;inset:0';
    layer.appendChild(frame);
    scope.appendChild(layer);
    let shown = null;
    // La taille de `box`, lue une fois puis tenue à jour par l'observateur ci-dessous : la lire à chaque page (`clientWidth` juste après `place`) obligeait le navigateur à refaire la mise en page de toute la
    // copie, qu'on venait de déplacer, avant même que l'effet commence (quelque 70 ms par page à 1 920 px, mesuré avec la présentation commerciale de la galerie).
    let boxSize = null;
    const paperOf = win => win.sheet || { width: job.pagePx.width, height: job.pagePx.height, left: job.sheetLeft };
    function fit() {
      if (!shown) return;
      const paper = paperOf(shown);
      if (!boxSize) boxSize = { width: box.clientWidth, height: box.clientHeight };
      const scale = Math.min(boxSize.width / paper.width, boxSize.height / paper.height);
      frame.style.width = paper.width + 'px';
      frame.style.height = paper.height + 'px';
      frame.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
      // L'échelle de la page, pour qui dessine un trait autour d'elle à la taille de l'écran (la vue intervenant : slide-speaker.css).
      frame.style.setProperty('--pp-fit', String(scale));
    }
    function place(win) {
      shown = win;
      const paper = paperOf(win);
      view.style.top = win.at + 'px';
      view.style.height = (win.to - win.from) + 'px';
      stage.style.position = 'absolute';
      stage.style.left = (-paper.left) + 'px';
      stage.style.top = (-win.from) + 'px';
      fit();
    }
    let sizes = null;
    if (typeof ResizeObserver === 'function') { sizes = new ResizeObserver(() => { boxSize = { width: box.clientWidth, height: box.clientHeight }; fit(); }); sizes.observe(box); }
    return { layer, frame, view, stage, place, fit, destroy() { if (sizes) sizes.disconnect(); } };
  }

  // L'état des objets animés d'une diapositive quand `done` pas sont joués (`frames` : [{ box }] ; `steps` : FrameAnim.stepsOf, dont le pas 0, celui qui part seul, compte pour un) : une entrée est là une fois son
  // pas joué, une sortie ne l'est plus. Les objets que `steps` ne règle pas ne bougent pas. Le diaporama et la vue intervenant (la page en cours telle que le public la voit) le posent de la même façon.
  function paintSteps(frames, steps, done) {
    steps.forEach((step, k) => step.forEach((item) => {
      const { box } = frames[item.index];
      const spent = k < done;
      box.style.visibility = (item.anim.exit ? spent : !spent) ? 'hidden' : '';
    }));
  }

  // La diapositive que montre la page `page` : la dernière dont la première page (`starts`) est celle-là ou une d'avant. Le lecteur et la vue intervenant (qui n'a que la découpe et les départs) la lisent de la même façon.
  function slideAt(starts, page) {
    let found = 0;
    starts.forEach((start, k) => { if (start <= page) found = k; });
    return found;
  }
  // La première fenêtre de la découpe (`windows`) qui montre la diapositive `slide` ; -1 quand elle n'en a pas.
  const firstWindowOf = (windows, starts, slide) => windows.findIndex(win => win.page >= starts[slide]);

  // Le TRACÉ au stylo : un calque SVG posé DANS le cadre de la page (`frame`, celui de `surface`), qui en suit donc l'échelle - le trait est au même endroit de la page, à la même épaisseur relative, dans la fenêtre du public comme
  // dans l'aperçu de la console, à toute taille de fenêtre et de plein écran. Les points se donnent en parts de la page (de 0 à 1, une liste plate x, y, x, y…) et se gardent dans la taille de la page ; l'épaisseur est une part de sa
  // hauteur. Le rendu est dans un arbre ombre que les feuilles de la page n'atteignent pas : tout s'écrit en ligne, et la couleur seule passe par une variable (`--pp-ink`), qui traverse l'arbre. Le calque ne prend aucun clic.
  // Le trait n'est pas la ligne brisée de ces points : il est LISSÉ (`smoothInk`, `curveOf`), le même calcul sur les mêmes points dans la console et dans la fenêtre.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const INK_WIDTH = 0.008;         // l'épaisseur du trait, en part de la hauteur de la page
  const INK_SMOOTH = 0.012;        // le lissage : l'écart type du noyau, en part du plus grand côté de la page (15 px sur une page de 1 280)
  const INK_COLOR = 'var(--pp-ink, #d92d20)';
  const INK_BATCH = 256;           // le plus de nombres qu'un envoi porte : un envoi plus long n'est pas lu
  const INK_POINTS = 6000;         // les points d'un trait : au-delà, le suivant continue
  const INK_STROKES = 400;         // les traits d'une page : le plus ancien s'efface quand il y en a plus
  const INK_STEP = 2;              // l'écart le plus court entre deux points gardés, en pixels de page : un point plus près du dernier ne s'y ajoute pas, il n'est que le bout du trait (un stylet en donne des centaines au pixel, sans rien de plus à lisser)

  // Le LISSAGE. La souris donne des positions ENTIÈRES dans un aperçu de quelque deux cents pixels : sur l'écran du public un pixel de l'aperçu en vaut sept à dix, et la ligne brisée de ces points est en escalier, bien plus
  // épaisse que le trait n'est large. Chaque point est donc ramené à la moyenne de ses voisins - ceux qui sont à moins de trois écarts types de lui SELON LA LONGUEUR DU TRAIT, chacun compté pour le bout de trait qu'il porte
  // (les points ne sont pas à égale distance : la souris va plus ou moins vite) - ce qui lisse les marches sans émousser les courbes. Les deux bouts ne bougent pas : au-delà de chacun, le trait se prolonge par symétrie
  // centrale (le point opposé à son voisin), si bien que la moyenne y retombe sur le bout même et que le trait finit là où est le pointeur. `points` : [[x, y]] en pixels de page, `sigma` en pixels de page.
  function smoothInk(points, sigma) {
    const n = points.length;
    if (n < 3 || !(sigma > 0)) return points;
    const along = new Float64Array(n);                   // la longueur du trait jusqu'à chaque point
    for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const total = along[n - 1];
    if (!(total > 0)) return points;
    const reach = 3 * sigma;
    let before = 0;                                      // les points qui prolongent le trait au-delà du premier...
    while (before + 1 < n && along[before + 1] <= reach) before++;
    let after = 0;                                       // ... et au-delà du dernier
    while (after + 1 < n && total - along[n - 2 - after] <= reach) after++;
    const m = before + n + after;
    const at = new Float64Array(m);
    const px = new Float64Array(m);
    const py = new Float64Array(m);
    for (let k = 0; k < before; k++) {                   // le plus loin d'abord
      const j = before - k;
      at[k] = -along[j];
      px[k] = 2 * points[0][0] - points[j][0];
      py[k] = 2 * points[0][1] - points[j][1];
    }
    for (let i = 0; i < n; i++) { at[before + i] = along[i]; px[before + i] = points[i][0]; py[before + i] = points[i][1]; }
    for (let k = 0; k < after; k++) {
      const j = n - 2 - k;
      at[before + n + k] = 2 * total - along[j];
      px[before + n + k] = 2 * points[n - 1][0] - points[j][0];
      py[before + n + k] = 2 * points[n - 1][1] - points[j][1];
    }
    const k2 = 1 / (2 * sigma * sigma);
    // Le poids d'un point : le bout de trait qu'il porte (la moitié de la distance entre ses deux voisins), pesé par la gaussienne de sa distance, le long du trait, au point qu'on lisse.
    const weigh = (j, c) => {
      const lo = j > 0 ? at[j - 1] : at[j];
      const hi = j + 1 < m ? at[j + 1] : at[j];
      return ((hi - lo) / 2) * Math.exp(-((at[j] - at[c]) ** 2) * k2);
    };
    const out = [points[0]];
    for (let i = 1; i < n - 1; i++) {
      const c = before + i;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let j = c; j >= 0 && at[c] - at[j] <= reach; j--) { const g = weigh(j, c); sx += g * px[j]; sy += g * py[j]; sw += g; }
      for (let j = c + 1; j < m && at[j] - at[c] <= reach; j++) { const g = weigh(j, c); sx += g * px[j]; sy += g * py[j]; sw += g; }
      out.push(sw > 0 ? [sx / sw, sy / sw] : points[i]);
    }
    out.push(points[n - 1]);
    return out;
  }
  // Le chemin d'un trait : un point seul est un point rond (le bout rond d'un trait presque nul), deux points une droite, au-delà une courbe qui passe par le milieu de chaque segment et prend chaque point pour poignée
  // (des arcs de Bézier quadratiques : aucun angle, ni aux points ni entre eux) ; elle part du premier point et finit au dernier.
  function curveOf(points) {
    const n = points.length;
    const num = value => Math.round(value * 100) / 100;
    const at = p => num(p[0]) + ' ' + num(p[1]);
    const middle = (a, b) => num((a[0] + b[0]) / 2) + ' ' + num((a[1] + b[1]) / 2);
    if (n === 1) return 'M ' + at(points[0]) + ' h 0.01';
    if (n === 2) return 'M ' + at(points[0]) + ' L ' + at(points[1]);
    let d = 'M ' + at(points[0]) + ' L ' + middle(points[0], points[1]);
    for (let i = 1; i < n - 1; i++) d += ' Q ' + at(points[i]) + ' ' + middle(points[i], points[i + 1]);
    return d + ' L ' + at(points[n - 1]);
  }

  function inkLayer(frame) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('data-pp-ink', '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:5';
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('fill', 'none');
    group.setAttribute('stroke-linecap', 'round');
    group.setAttribute('stroke-linejoin', 'round');
    group.style.stroke = INK_COLOR;
    svg.appendChild(group);
    frame.appendChild(svg);
    let strokes = [];              // [{ path, raw, tail, sigma, width, height }] : `raw`, les points gardés du trait en pixels de page, tant qu'on peut encore le continuer (`null` ensuite : le chemin dit tout) ; `tail`, son bout : le dernier point reçu quand il est trop près du dernier gardé
    let open = null;               // le trait que les points suivants continuent
    const round = value => Math.round(value * 100) / 100;
    const render = stroke => { if (stroke.raw) stroke.path.setAttribute('d', curveOf(smoothInk(stroke.tail ? stroke.raw.concat([stroke.tail]) : stroke.raw, stroke.sigma))); };
    // Un trait nouveau ; `carry` : le dernier point du trait plein qu'il continue (au-delà de `INK_POINTS`), pour que les deux se touchent.
    function begin(carry) {
      if (open) { render(open); open.raw = null; }
      if (strokes.length >= INK_STROKES) strokes.shift().path.remove();
      // La page se lit dans la taille que `surface` lui a donnée, en pixels de page ; le repère du calque est celui-là, si bien que le trait grandit et rapetisse avec elle.
      const width = parseFloat(frame.style.width) || 1;
      const height = parseFloat(frame.style.height) || 1;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      group.setAttribute('stroke-width', String(round(height * INK_WIDTH)));
      const path = document.createElementNS(SVG_NS, 'path');
      group.appendChild(path);
      open = { path, raw: carry ? [carry] : [], tail: null, sigma: INK_SMOOTH * Math.max(width, height), width, height };
      strokes.push(open);
      return open;
    }
    // Les points d'un envoi, lus pour ce qu'ils sont : des nombres et rien d'autre, en nombre borné ; un point hors de la page est ramené à son bord. Vide quand la forme n'est pas la bonne.
    function read(points) {
      if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0 || points.length > INK_BATCH) return [];
      const out = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return [];
        out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
      }
      return out;
    }
    // Ajoute des points au trait en cours, ou à un nouveau (`start` : ils en commencent un). Vrai quand quelque chose a été lu.
    function add(points, start) {
      const list = read(points);
      if (!list.length) return false;
      const touched = new Set();
      list.forEach(([x, y], k) => {
        const full = !!open && !!open.raw && open.raw.length >= INK_POINTS;
        if (!open || (start && k === 0) || full) begin(full ? (open.tail || open.raw[open.raw.length - 1]) : null);
        const raw = open.raw;
        const point = [x * open.width, y * open.height];
        // Un point à moins de INK_STEP du dernier gardé ne s'y ajoute pas : il devient le bout du trait (le trait finit toujours au pointeur), qui se rend après les points gardés. Ceux-ci sont donc à INK_STEP les uns des autres au moins,
        // et le lissage, qui relit le trait en cours à chaque envoi, ne voit jamais plus d'une vingtaine de points par côté, quelle que soit la finesse de ce que le pointeur donne.
        if (raw.length && Math.hypot(point[0] - raw[raw.length - 1][0], point[1] - raw[raw.length - 1][1]) < INK_STEP) open.tail = point;
        else { raw.push(point); open.tail = null; }
        touched.add(open);
      });
      touched.forEach(render);
      return true;
    }
    return {
      add,
      // Le trait en cours est fini : les points qui viennent en commencent un autre.
      end() { if (open) { render(open); open.raw = null; } open = null; },
      clear() { strokes.forEach(stroke => stroke.path.remove()); strokes = []; open = null; },
      count: () => strokes.length,
      // Une copie du tracé tel qu'il est, posée dans un autre cadre (celui de la copie de rechange d'un effet : la page qu'on quitte garde son tracé le temps qu'elle part).
      copyTo(other) { const copy = svg.cloneNode(true); other.appendChild(copy); return copy; },
      destroy() { svg.remove(); },
    };
  }

  // `options.labels` : { label, preparing, end, prev, next, exit, counter } (le compteur garde `{n}` et `{total}` à remplir) ; `options.onExit()` : le diaporama demande à se terminer ;
  // `options.onGesture(event)` (facultatif) : vrai quand le geste est pris et que le lecteur n'en fait rien ; `options.onState(state)` (facultatif) : appelé à chaque changement de ce que le lecteur montre, avec
  // ce que rend `state()` ; `options.screens` (facultatif) : vrai pour la fenêtre que la vue intervenant pilote - l'écran noir et l'écran blanc (B, W), le stylo (`ink`, `clearInk`, E) y sont ; faux, le lecteur n'a ni les uns ni
  // les autres. Le lecteur se pose dans la page tout de suite (« Préparation… »), avec ses écouteurs.
  function create(options) {
    const { labels, onExit } = options;
    const onGesture = options.onGesture || (() => false);
    const onState = typeof options.onState === 'function' ? options.onState : null;
    const screens = options.screens === true;
    const root = el('div', 'pp-slide-show');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', labels.label);
    root.tabIndex = -1;
    const status = el('div', 'pp-slide-show-card', labels.preparing);
    status.setAttribute('role', 'status');
    const end = el('div', 'pp-slide-show-card pp-slide-show-end', labels.end);
    end.hidden = true;
    // Une ligne d'information au bas de l'écran, au-dessus de la barre (`note`) : ce que la personne doit savoir sans que le diaporama s'arrête.
    const noteCard = el('div', 'pp-slide-show-card pp-slide-show-note');
    noteCard.setAttribute('role', 'status');
    noteCard.hidden = true;
    const bar = buildBar();
    root.append(status, end, noteCard, bar.el);
    // L'écran noir ou blanc : un voile qui couvre tout (la barre du bas comprise), là seulement où la vue intervenant le demande.
    const screenEl = screens ? el('div', 'pp-slide-show-screen') : null;
    if (screenEl) {
      screenEl.hidden = true;
      screenEl.setAttribute('aria-hidden', 'true');
      root.appendChild(screenEl);
    }
    document.body.appendChild(root);
    // L'état de ce diaporama : `props` (la transition de chaque diapositive), `timings` (masquée, passage seul), `starts` (la première page de chacune), `anchors` (le signet de chacune, cible d'un lien du texte), `windows` (la découpe en pages de la copie) ; `screen` : 0 la diapositive, 1 l'écran noir, 2 l'écran blanc ; `ink` : le calque du tracé.
    const s = { root, status, end, bar, windows: [], index: 0, ended: false, job: null, fullscreen: false, idleTimer: 0, lastWheel: 0, ready: false, props: [], timings: [], starts: [], anchors: [], transition: null, advanceTimer: 0, anims: new Map(), anim: null, animTimer: 0, noteTimer: 0, last: -1, started: false, destroyed: false, spare: null, screen: 0, held: false, ink: null };

    // La copie mesurée du document, posée dans une feuille de la taille d'une page, au centre, agrandie ou réduite à l'écran ; la fenêtre de la page montrée la rogne (`surface`, plus haut).
    function mount(job) {
      const surf = surface(job, root);
      Object.assign(s, { surf, layer: surf.layer, frame: surf.frame, view: surf.view, stage: surf.stage, windows: job.windows, anims: FrameAnim.framesOf(surf.stage) });
      if (screens) s.ink = inkLayer(surf.frame);
    }

    // Le temps que la diapositive de la page `i` attend avant de passer seule, et si elle est masquée (js/slide-props.js:timingsOf).
    const timingOf = i => s.timings[slideOfWindow(i)] || { hidden: false, advance: 0 };
    // La première page, à partir de `from` et dans le sens `step` (1 ou -1), dont la diapositive n'est pas masquée ; -1 quand il n'y en a plus.
    function visibleFrom(from, step) {
      for (let i = from; i >= 0 && i < s.windows.length; i += step) if (!timingOf(i).hidden) return i;
      return -1;
    }
    // La page `index` (une fenêtre de la découpe) ; au-delà de la dernière, l'écran de fin. `how.step` : un pas vers la page d'à côté (suivante, ou précédente avec `how.reverse`), que la
    // transition de la diapositive accompagne ; sans lui, la page change d'un coup.
    function go(index, how) {
      if (s.destroyed || !s.ready) return;
      const count = s.windows.length;
      // Changer de page rend la diapositive à qui voyait un écran noir ou blanc (l'état suit, plus bas) et efface le tracé : il n'a de sens que sur la page où il a été fait.
      leaveScreen(true);
      // Une vidéo qui jouait (js/video-frame.js, lecteur de GFS par-dessus le cadre de l'app) s'arrête avec la page : le son ne passe pas sur la diapositive suivante. La fenêtre à part (present.html) ne charge pas
      // ce module, et `VideoFrame` y est alors la classe native du navigateur (WebCodecs) : sans `stop`, d'où le test de la fonction et non du seul nom.
      if (typeof VideoFrame !== 'undefined' && typeof VideoFrame.stop === 'function') VideoFrame.stop();
      endTransition(true);
      clearTimeout(s.advanceTimer);
      s.advanceTimer = 0;
      s.held = false;
      if (s.anim) settleAnim(s.anim);
      if (index >= count) { if (s.ink) s.ink.clear(); showEnd(true); emit(); return; }
      showEnd(false);
      // La dernière diapositive vue (l'action « dernière vue » d'un objet à lien) : celle qu'on quitte pour une autre ; passer d'une page à l'autre d'une même diapositive ne compte pas.
      if (s.started && s.windows[s.index] && slideOfWindow(s.index) !== slideOfWindow(Math.max(0, index))) s.last = s.index;
      s.started = true;
      const spec = how && how.step ? transitionFor(s.index, Math.max(0, index), !!how.reverse, how.trans) : null;
      const ghost = spec ? takeGhost() : null;
      if (s.ink && Math.max(0, index) !== s.index) s.ink.clear();
      s.index = Math.max(0, index);
      s.surf.place(s.windows[s.index]);
      bar.counter.textContent = labels.counter.replace('{n}', String(s.index + 1)).replace('{total}', String(count));
      bar.prev.setAttribute('aria-disabled', visibleFrom(s.index - 1, -1) < 0 ? 'true' : 'false');
      if (ghost) beginTransition(ghost, spec, !!how.reverse);
      enterAnim(slideOfWindow(s.index), !!(how && how.reverse), spec ? spec.dur : 0);
      // Le passage seul : le temps de la diapositive, compté une fois son effet joué ; tout geste de la personne (go) remet le compte à zéro.
      clearTimeout(s.advanceTimer);
      s.advanceTimer = 0;
      const wait = timingOf(s.index).advance;
      if (wait) armAdvance(wait + (spec ? spec.dur : 0));
      emit();
    }
    // Le passage seul : après `ms`, la diapositive passe à la suivante. Derrière un écran noir ou blanc elle ne passe pas (la personne ne la verrait pas partir) : `held` garde que son temps est venu, et il se recompte quand l'écran s'en va.
    function armAdvance(ms) {
      s.advanceTimer = setTimeout(() => {
        if (s.destroyed) return;
        if (s.screen) { s.held = true; return; }
        next(true);
      }, ms);
    }
    // Dit à qui suit le lecteur (la vue intervenant) où il en est : à chaque page, animation jouée ou défaite, et à l'écran de fin.
    function emit() {
      if (!onState || s.destroyed || !s.ready) return;
      try { onState(state()); } catch (e) { /* celui qui suit le lecteur ne doit pas l'arrêter */ }
    }

    // L'écran noir et l'écran blanc (vue intervenant seulement) : `mode` 1 couvre tout de noir, 2 de blanc, 0 rend la diapositive ; le mode déjà montré se retire (la même touche le rend). Le tracé, la page, les effets et les
    // animations continuent dessous. `quiet` : celui qui appelle dit lui-même l'état ensuite.
    function setScreen(mode, quiet) {
      if (!screens || s.destroyed || !s.ready || (mode !== 0 && mode !== 1 && mode !== 2)) return;
      const to = mode === s.screen ? 0 : mode;
      if (to === s.screen) return;
      s.screen = to;
      screenEl.hidden = to === 0;
      screenEl.classList.toggle('pp-slide-show-screen-white', to === 2);
      // Le passage seul dont le temps est venu derrière l'écran reprend son compte une fois la diapositive rendue.
      if (!to && s.held) {
        s.held = false;
        const wait = timingOf(s.index).advance;
        if (wait && !s.ended) armAdvance(wait);
      }
      if (!quiet) emit();
    }
    // Toute navigation rend la diapositive à qui voyait un écran.
    function leaveScreen(quiet) { if (s.screen) setScreen(0, quiet); }

    // Les animations d'objets
    // L'état des objets animés de la diapositive `a` quand `done` pas sont joués (le pas 0, celui qui part seul, compte pour un) : une entrée est là une fois son pas joué, une sortie ne l'est plus ;
    // tout ce qui court est arrêté. Les objets que `a` ne règle pas ne bougent pas.
    function renderAnim(a, done) {
      a.running.forEach(job => job.cancel());
      a.running = [];
      paintSteps(a.frames, a.steps, done);
      a.done = done;
    }
    // Termine ce qui court, d'un coup.
    const settleAnim = a => renderAnim(a, a.done);
    // Joue le pas suivant de l'animation en cours. Faux quand il n'y en a plus.
    function playStep() {
      const a = s.anim;
      if (!a || a.done >= a.steps.length) return false;
      const step = a.steps[a.done];
      a.done += 1;
      step.forEach((item) => {
        const job = FrameAnim.play(a.frames[item.index].box, item.anim, { begin: item.begin, page: s.job.pagePx });
        a.running.push(job);
        job.finished.then(() => { a.running = a.running.filter(other => other !== job); });
      });
      emit();
      return true;
    }
    // Arrive sur la diapositive `slide` : ses objets se mettent à leur état de départ (en revenant en arrière, tout est joué), et l'animation qui part seule se joue une fois la transition finie
    // (`wait`, en millisecondes). Rester sur la même diapositive (une autre page d'elle) ne touche à rien.
    function enterAnim(slide, reverse, wait) {
      clearTimeout(s.animTimer);
      s.animTimer = 0;
      if (s.anim && s.anim.slide === slide) return;
      const list = s.anims.get(slide);
      s.anim = null;
      if (!list) return;
      const a = { slide, frames: list, steps: FrameAnim.stepsOf(list).steps, done: 0, running: [] };
      s.anim = a;
      if (reverse) { renderAnim(a, a.steps.length); return; }
      renderAnim(a, 0);
      if (!a.steps[0].length) { a.done = 1; return; }
      s.animTimer = setTimeout(() => { s.animTimer = 0; if (!s.destroyed && s.anim === a && a.done === 0) playStep(); }, wait);
    }
    // Un geste « suivant » : joue le pas suivant de la diapositive s'il en reste (vrai), sinon rend la main (faux : on passe à la diapositive d'après).
    function advanceAnim() {
      const a = s.anim;
      if (!a) return false;
      clearTimeout(s.animTimer);
      s.animTimer = 0;
      // Ce qui court se termine d'un coup, puis le pas suivant se joue.
      settleAnim(a);
      return playStep();
    }
    // Un geste « précédent » : défait le dernier pas joué d'un coup (vrai), sinon rend la main (faux : on revient à la diapositive d'avant).
    function rewindAnim() {
      const a = s.anim;
      if (!a || a.done <= 1) return false;
      renderAnim(a, a.done - 1);
      emit();
      return true;
    }

    // Les transitions
    // La diapositive que montre la page `i` (une fenêtre de la découpe).
    const slideOfWindow = i => slideAt(s.starts, s.windows[i].page);
    // La transition à jouer en allant de la page `from` à la page `to` : celle de la diapositive où l'on arrive, ou - en revenant en arrière - celle de la diapositive qu'on quitte ; rien
    // quand les deux pages sont de la même diapositive, ou que la diapositive n'a pas de transition.
    // `override` : l'animation au clic d'un objet à lien (js/frame-link.js:transOf) ; elle remplace celle de la diapositive, et sans effet ({ transition: '' }) la page change d'un coup.
    function transitionFor(from, to, reverse, override) {
      if (typeof SlideTransitions === 'undefined' || (!override && !s.props.length) || from === to || !s.windows[from] || !s.windows[to]) return null;
      const leaving = slideOfWindow(from);
      const arriving = slideOfWindow(to);
      if (leaving === arriving) return null;
      if (override) return override.transition ? override : null;
      return s.props[reverse ? leaving : arriving] || null;
    }
    // Une copie figée du calque tel qu'il est (la page qu'on quitte), posée par-dessus : la page d'arrivée se met en place dessous, le temps que l'effet joue. La copie porte toute la présentation
    // (quelque 6 000 nœuds pour une quarantaine de diapositives) : la refaire à chaque effet, puis la jeter, coûtait de 100 à 150 ms de mise en page et de styles à chaque diapositive, juste avant que
    // l'effet démarre - l'image s'arrêtait un instant. Elle est donc faite UNE fois (`buildSpare`) et reste dans la feuille, GARÉE hors de l'écran, où ses styles et sa mise en page restent faits : la rendre
    // à l'écran n'est plus qu'un décalage, et à la fin de l'effet on la gare de nouveau. Rien ne change à l'écran : à chaque effet elle reprend l'état exact du calque qu'on quitte (`takeGhost`).
    const PARKED = '-300% 0';
    function buildSpare() {
      if (s.spare || s.destroyed || !s.layer) return s.spare;
      const layer = s.layer.cloneNode(true);
      // Le tracé ne se garde pas dans la copie : celle d'un effet reprend celui du moment (`takeGhost`).
      if (s.ink) layer.querySelectorAll('[data-pp-ink]').forEach(node => node.remove());
      layer.className = 'pp-slide-show-layer pp-slide-show-ghost pp-slide-show-parked';
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;translate:' + PARKED;
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      s.layer.parentNode.appendChild(layer);
      const frame = layer.firstElementChild;
      const view = frame.firstElementChild;
      const stage = view.firstElementChild;
      s.spare = { layer, frame, view, stage, anims: FrameAnim.framesOf(stage) };
      return s.spare;
    }
    // La copie de rechange, remise dans l'état du calque tel qu'il est à cet instant - la page qu'on quitte : la place de la page (le cadre, la fenêtre et la copie du document), les objets animés
    // montrés ou cachés, le calque « éveillé » ou non ; puis rendue à l'écran, par-dessus.
    function takeGhost() {
      const spare = buildSpare();
      if (!spare) return null;
      const same = (copy, original) => { if (copy.style.cssText !== original.style.cssText) copy.style.cssText = original.style.cssText; };
      same(spare.frame, s.frame);
      same(spare.view, s.view);
      same(spare.stage, s.stage);
      s.anims.forEach((list, slide) => {
        const other = spare.anims.get(slide);
        if (!other) return;
        list.forEach((item, k) => {
          const shown = item.box.style.visibility;
          if (other[k] && other[k].box.style.visibility !== shown) other[k].box.style.visibility = shown;
        });
      });
      // Le tracé de la page qu'on quitte part avec elle, le temps de l'effet.
      if (s.ink && s.ink.count()) spare.copy = s.ink.copyTo(spare.frame);
      const layer = spare.layer;
      layer.classList.toggle('pp-slide-show-awake', s.layer.classList.contains('pp-slide-show-awake'));
      layer.classList.remove('pp-slide-show-parked');
      layer.style.translate = '';
      return layer;
    }
    // La copie sort de l'écran et attend le prochain effet.
    function parkSpare(layer) {
      layer.classList.add('pp-slide-show-parked');
      layer.style.translate = PARKED;
      if (s.spare && s.spare.layer === layer && s.spare.copy) { s.spare.copy.remove(); s.spare.copy = null; }
    }
    function beginTransition(ghost, spec, reverse) {
      // Un effet qui ne se joue pas (une erreur dans le calcul de l'effet) ne laisse pas sa copie à l'écran et n'empêche pas d'arriver (les animations des objets suivent).
      let job;
      try { job = SlideTransitions.play(ghost, s.layer, spec, { reverse }); } catch (e) { parkSpare(ghost); s.layer.classList.remove(SlideTransitions.ABOVE); return; }
      s.transition = { job, ghost, kind: job.kind, side: job.side, duration: job.duration, reverse };
      job.done.then(() => { if (s.transition && s.transition.job === job) endTransition(false); });
    }
    // Termine l'effet en cours (`finish` : il saute à l'image d'arrivée) et gare la copie.
    function endTransition(finish) {
      const running = s.transition;
      if (!running) return;
      s.transition = null;
      if (finish) running.job.finish(); else running.job.cancel();
      parkSpare(running.ghost);
    }
    function showEnd(on) {
      s.ended = on;
      end.hidden = !on;
      if (s.frame) s.frame.style.visibility = on ? 'hidden' : '';
    }
    // `skipSteps` : le passage seul, qui ne joue pas les pas d'animation.
    function next(skipSteps, trans) {
      if (s.destroyed || !s.ready) return;
      leaveScreen();
      if (s.ended) { onExit(); return; }
      if (!skipSteps && advanceAnim()) return;
      // Les diapositives masquées sont sautées ; plus aucune après celle-ci : l'écran de fin.
      const to = visibleFrom(s.index + 1, 1);
      go(to < 0 ? s.windows.length : to, { step: true, trans });
    }
    function prev() {
      if (s.destroyed || !s.ready) return;
      leaveScreen();
      if (s.ended) { const last = visibleFrom(s.windows.length - 1, -1); go(last >= 0 ? last : s.windows.length - 1); return; }
      if (rewindAnim()) return;
      const to = s.index > 0 ? visibleFrom(s.index - 1, -1) : -1;
      if (to >= 0) go(to, { step: true, reverse: true });
    }

    // La barre du bas : précédente, numéro, suivante, quitter. Montrée quand la souris bouge.
    function buildBar() {
      const barEl = el('div', 'pp-slide-show-bar');
      barEl.setAttribute('role', 'toolbar');
      barEl.setAttribute('aria-label', labels.label);
      const make = (cls, text, tip) => {
        const b = Dom.button('pp-slide-show-step ' + cls, text);
        b.title = tip;
        b.setAttribute('aria-label', tip);
        return b;
      };
      const prevButton = make('pp-slide-show-prev', '‹', labels.prev);
      const counter = el('span', 'pp-slide-show-counter');
      counter.setAttribute('aria-live', 'polite');
      const nextButton = make('pp-slide-show-next', '›', labels.next);
      const exitButton = make('pp-slide-show-exit', '✕', labels.exit);
      barEl.append(prevButton, counter, nextButton, exitButton);
      prevButton.addEventListener('click', event => { event.stopPropagation(); prev(); });
      nextButton.addEventListener('click', event => { event.stopPropagation(); next(); });
      exitButton.addEventListener('click', event => { event.stopPropagation(); onExit(); });
      barEl.addEventListener('mousedown', event => event.preventDefault());
      return { el: barEl, prev: prevButton, next: nextButton, counter, exit: exitButton };
    }
    // « Éveillé » : la souris vient de bouger. La racine le dit (le pointeur, la barre) ; le calque aussi, qui est dans l'arbre ombre où la feuille de la page ne voit pas la racine : la main d'un objet à lien ne s'y affiche qu'éveillé.
    function setAwake(on) {
      root.classList.toggle('pp-slide-show-awake', on);
      if (s.layer) s.layer.classList.toggle('pp-slide-show-awake', on);
    }
    function wake() {
      if (s.destroyed) return;
      setAwake(true);
      clearTimeout(s.idleTimer);
      // Le clavier sur un bouton de la barre la garde montrée.
      s.idleTimer = setTimeout(() => { if (!bar.el.contains(document.activeElement)) setAwake(false); }, IDLE_MS);
    }

    // Les touches des écrans, là seulement où la vue intervenant les demande : B l'écran noir, W l'écran blanc ; la même touche rend la diapositive.
    const screenKeys = screens ? { b: () => setScreen(1), B: () => setScreen(1), w: () => setScreen(2), W: () => setScreen(2) } : {};
    function onKey(event) {
      if (s.destroyed || event.isComposing) return;
      // Le clavier sur un bouton de la barre : Entrée et Espace l'activent, Tab y circule.
      const onBar = bar.el.contains(event.target);
      if (event.key === 'Tab') { wake(); return; }
      if (onBar && (event.key === 'Enter' || event.key === ' ')) return;
      // Un geste que celui qui a créé le lecteur prend pour lui (le plein écran de la fenêtre à part) ne passe pas à la diapositive suivante.
      if (onGesture(event)) { event.preventDefault(); event.stopPropagation(); return; }
      const keys = {
        ArrowRight: next, ArrowDown: next, PageDown: next, ' ': next, Enter: next, n: next, N: next,
        ArrowLeft: prev, ArrowUp: prev, PageUp: prev, Backspace: prev, p: prev, P: prev,
        Home: () => go(0), End: () => go(s.windows.length - 1), Escape: onExit, F5: () => {},
      };
      const screenAction = screenKeys[event.key];
      const action = keys[event.key] || screenAction;
      // Pendant le diaporama, aucune touche n'atteint le document en dessous.
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // L'écran de fin : une touche quitte, sauf celles qui reculent et celles des écrans noir et blanc.
      if (s.ended && action !== prev && !(screenAction && action === screenAction) && !/^(Shift|Control|Alt|Meta|CapsLock)$/.test(event.key)) { event.preventDefault(); onExit(); return; }
      if (!action) return;
      event.preventDefault();
      action();
    }
    // Un lien du texte vers une autre diapositive (`#slide-3`, le signet que porte son repère ; ReaderMode.renderInto en garde l'adresse dans `data-link-anchor`) mène à elle, comme dans PowerPoint ; un autre clic
    // passe à la suivante. Le texte est dans un arbre ombre : le clic n'en dit que l'hôte, les liens se cherchent donc à l'endroit du clic.
    function slideOfLink(event) {
      const links = s.stage ? Array.from(s.stage.querySelectorAll('a[data-link-anchor]')) : [];
      const link = links.find(a => Array.from(a.getClientRects()).some(r => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom));
      return link ? s.anchors.indexOf(link.getAttribute('data-link-anchor')) : -1;
    }
    // La page qui montre le signet `id` (l'adresse d'un lien, sans le dièse) : la première page de la diapositive qui le porte ; ou, pour un titre ou un signet du texte, la page où il se trouve
    // (`[data-anchor]`, que la copie mesurée garde ; même calcul que js/print-export.js:planTargets, la copie étant ici à l'échelle de l'écran). -1 quand il n'est nulle part.
    function windowOfAnchor(id) {
      const slide = s.anchors.indexOf(id);
      if (slide >= 0) return s.windows.findIndex(win => win.page >= s.starts[slide]);
      const mark = Array.from(s.stage.querySelectorAll('[data-anchor]')).find(el => el.getAttribute('data-anchor') === id);
      if (!mark || !s.windows.length) return -1;
      const scale = s.frame.getBoundingClientRect().width / (parseFloat(s.frame.style.width) || 1) || 1;
      const y = (mark.getBoundingClientRect().top - s.stage.getBoundingClientRect().top) / scale;
      const found = s.windows.findIndex(win => y < win.to - 0.5);
      return found < 0 ? s.windows.length - 1 : found;
    }
    // Le lien d'un objet (js/frame-link.js:parse) suivi au diaporama. Comme PowerPoint, la diapositive visée arrive avec SA transition (`step`), de l'avant, d'où qu'on vienne, sans jouer les pas d'animation
    // de celle qu'on quitte ; « précédente » est la seule à reculer (sa transition à l'envers, comme le geste du même nom), « dernière vue » revient à la diapositive qu'on vient de quitter (et, rappelée, y retourne).
    // Un signet qui n'existe plus, une action sans diapositive à atteindre (« précédente » sur la première, « dernière vue » au départ) : rien ne se passe, le clic ne passe pas à la suivante.
    // `trans` : l'animation que la personne a choisie pour ce lien (js/frame-link.js:transOf), ou null : celle de la diapositive visée.
    function followFrame(link, trans) {
      if (link.kind === 'url') { FrameLink.openUrl(link.url); return; }
      if (link.kind === 'anchor') {
        const to = windowOfAnchor(link.id);
        if (to >= 0) go(to, { step: true, trans });
        return;
      }
      const count = s.windows.length;
      const toVisible = (to, how) => { if (to >= 0) go(to, Object.assign({ trans }, how)); };
      switch (link.action) {
        case 'next': next(true, trans); break;
        case 'prev': toVisible(s.index > 0 ? visibleFrom(s.index - 1, -1) : -1, { step: true, reverse: true }); break;
        case 'first': toVisible(visibleFrom(0, 1), { step: true }); break;
        case 'last': toVisible(visibleFrom(count - 1, -1), { step: true }); break;
        case 'back': toVisible(s.last < count ? s.last : -1, { step: true }); break;
        case 'end': onExit(); break;
        default: break;
      }
    }
    function onClick(event) {
      if (s.destroyed || event.button !== 0 || bar.el.contains(event.target)) return;
      if (onGesture(event)) return;
      // Un clic sur l'écran noir ou blanc rend la diapositive, sans passer à la suivante.
      if (s.screen) { setScreen(0); return; }
      const slide = s.ready ? slideOfLink(event) : -1;
      if (slide >= 0) {
        event.preventDefault();
        const target = firstWindowOf(s.windows, s.starts, slide);
        // Comme PowerPoint : la diapositive visée arrive avec sa propre transition (`step`), de l'avant, d'où qu'on vienne.
        if (target >= 0) go(target, { step: true });
        return;
      }
      // Un objet à lien (js/frame-link.js) : le clic suit son lien au lieu de passer à la suivante ; l'objet le plus haut sous le pointeur décide (un objet sans lien ne laisse pas passer le clic à celui du dessous).
      const framed = s.ready && !s.ended && s.stage ? FrameLink.frameAt(s.stage.getRootNode(), event.clientX, event.clientY) : null;
      if (framed) {
        event.preventDefault();
        // Une vidéo (js/video-frame.js) se lit sur place quand GFS sait jouer son lecteur ; la fenêtre à part, qui ne charge pas ce fichier, ouvre son lien.
        if (framed.link.kind === 'url' && typeof VideoFrame !== 'undefined' && VideoFrame.play(framed.el)) return;
        followFrame(framed.link, FrameLink.transOf(framed.el.getAttribute(FrameLink.TRANS_ATTR)));
        return;
      }
      next();
    }
    function onWheel(event) {
      if (s.destroyed) return;
      event.preventDefault();
      const now = Date.now();
      if (now - s.lastWheel < WHEEL_GAP_MS || !event.deltaY) return;
      s.lastWheel = now;
      if (event.deltaY > 0) next(); else prev();
    }
    function onFullscreenChange() {
      if (s.destroyed) return;
      if (document.fullscreenElement === root) { s.fullscreen = true; return; }
      // Le navigateur sort du plein écran (Échap, F11) : le diaporama se termine avec lui.
      if (s.fullscreen) onExit();
    }
    // Le clavier reste dans le diaporama (une fenêtre modale) : Tab ne mène pas au document caché dessous.
    function onFocusIn(event) {
      if (!s.destroyed && !root.contains(event.target)) root.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    root.addEventListener('click', onClick);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('mousemove', wake);
    root.addEventListener('contextmenu', event => event.preventDefault());

    // Le plein écran se demande dans le geste de la personne (le navigateur ne l'accorde plus après : environ 5 s). Résolu vrai quand il est accordé, faux quand le cadre le refuse ou n'en a pas.
    function enterFullscreen() {
      if (typeof root.requestFullscreen !== 'function') return Promise.resolve(false);
      try {
        const asked = root.requestFullscreen();
        if (asked && typeof asked.then === 'function') return asked.then(() => { if (!s.destroyed) s.fullscreen = true; return !s.destroyed; }, () => false);
      } catch (e) { /* le cadre refuse le plein écran : le lecteur garde sa place */ }
      return Promise.resolve(false);
    }

    // Écrit `text` dans la ligne d'information (vide : la retire) ; `ms` : elle s'efface seule après ce temps.
    function note(text, ms) {
      clearTimeout(s.noteTimer);
      s.noteTimer = 0;
      noteCard.textContent = text || '';
      noteCard.hidden = !text;
      if (text && ms) s.noteTimer = setTimeout(() => { noteCard.hidden = true; }, ms);
    }

    // La copie mesurée du document (`job`, ce que rend PrintExport.stage) et ce que la découpe ne dit pas (`data` : props, timings, starts, anchors) : le lecteur la monte et montre la première diapositive -
    // depuis le début (la première qui n'est pas masquée) ou, avec `how.fromCurrent`, la page `how.startPage` même masquée.
    function load(job, data, how) {
      s.job = job;
      Object.assign(s, { props: data.props || [], timings: data.timings || [], starts: data.starts || [], anchors: data.anchors || [] });
      mount(job);
      const first = job.windows.findIndex(win => win.page >= how.startPage);
      s.ready = true;
      status.hidden = true;
      // Depuis le début, le diaporama commence à la première diapositive qui n'est pas masquée ; depuis la diapositive du curseur, il commence là où elle est, masquée ou non.
      const at = first >= 0 ? first : 0;
      const shown = how.fromCurrent ? at : visibleFrom(at, 1);
      go(shown >= 0 ? shown : at);
      // La copie de rechange des effets, prête avant le premier geste : seulement quand une diapositive a un effet (sinon, au premier effet qu'un objet à lien demande) ; la faire en cours de route arrêterait l'image un instant.
      if (s.props.some(Boolean)) buildSpare();
    }

    // Le lecteur se ferme : minuteries, écouteurs, effet en cours, plein écran et copie mesurée. La racine reste dans la page, c'est à celui qui l'a créé de la retirer.
    function destroy() {
      if (s.destroyed) return;
      s.destroyed = true;
      clearTimeout(s.idleTimer);
      clearTimeout(s.advanceTimer);
      clearTimeout(s.animTimer);
      clearTimeout(s.noteTimer);
      if (s.anim) s.anim.running.forEach(job => job.cancel());
      if (s.ink) s.ink.destroy();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (s.surf) s.surf.destroy();
      endTransition(false);
      if (document.fullscreenElement === root && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => {});
      if (s.job) s.job.dispose();
    }

    // Où en est le lecteur (pour qui le suit et pour les essais) : `index` la page (une fenêtre de la découpe) sur `count`, `slide` sa diapositive, `ended` l'écran de fin, `advancing` le passage seul qui court, `transition` l'effet
    // en cours ; `next` et `prev`, les pages où mènent « suivante » et « précédente » (-1 : la fin, ou rien : les diapositives masquées sont sautées) ; `clicks`, les animations à clic de la diapositive, et `left` celles qui
    // restent à jouer (un clic « suivant » en joue une avant de passer à la diapositive d'après).
    function state() {
      const base = { index: s.index, ended: s.ended, advancing: !!s.advanceTimer, screen: s.screen, transition: s.transition ? { kind: s.transition.kind, side: s.transition.side, duration: s.transition.duration, reverse: s.transition.reverse } : null };
      if (!s.ready || !s.windows.length) return base;
      const a = s.anim;
      return Object.assign(base, {
        count: s.windows.length,
        slide: slideOfWindow(s.index),
        next: s.ended ? -1 : visibleFrom(s.index + 1, 1),
        prev: s.ended ? visibleFrom(s.windows.length - 1, -1) : (s.index > 0 ? visibleFrom(s.index - 1, -1) : -1),
        clicks: a ? a.steps.length - 1 : 0,
        left: a ? Math.max(0, a.steps.length - Math.max(a.done, 1)) : 0,
      });
    }
    // Les mêmes gestes que le clavier, pour la vue intervenant : « suivante » (une animation d'abord, comme au clic), « précédente », et le saut vers la page `index` (sans transition) ; un rang hors de la découpe n'est pas un saut.
    const jump = index => { if (Number.isInteger(index) && index >= 0 && index < s.windows.length) go(index); };

    // Les ordres de la console : `screen(mode)` (0 la diapositive, 1 l'écran noir, 2 l'écran blanc ; le mode déjà montré se retire), `ink(points, start)` (les points d'un envoi du stylo, voir `inkLayer` ; `start` : ils commencent un trait ;
    // sans effet derrière un écran ou sur l'écran de fin ; vrai quand quelque chose a été tracé) et `clearInk()`. Sans `options.screens`, aucun des trois ne fait rien.
    const ink = (points, start) => !!(s.ink && s.ready && !s.destroyed && !s.ended && !s.screen && s.ink.add(points, start === true));
    const clearInk = () => { if (s.ink && !s.destroyed) s.ink.clear(); };

    return { root, load, note, enterFullscreen, destroy, state, isFullscreen: () => s.fullscreen, next: () => next(), prev: () => prev(), jump, screen: mode => setScreen(mode), ink, clearInk };
  }

  return { create, surface, paintSteps, slideAt, firstWindowOf, inkLayer, HOST_ID };
})();
