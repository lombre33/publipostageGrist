// Les cadres de texte libres d'une présentation (demande du 21/10 à 18:35, cartes « Où cliquer ? » : le bouton « Objets » sous les miniatures, et « Quand le texte déborde ? » : le cadre
// grandit). Un cadre est un morceau de texte posé n'importe où sur une diapositive, qu'on déplace et qu'on redimensionne à la souris, dans le MÊME éditeur que le reste (les bulles, les
// listes, les commentaires, la recherche y marchent comme ailleurs) : le socle garde ici le nœud, ses gestes, sa barre et ce qui le range ; le bouton qui en pose un est dans
// extensions/diapositives/slide-objects.js, qui n'appelle que `insert`.
//  - Le NŒUD (`freeFrame`, un bloc qui contient des paragraphes, titres, listes, citations) s'écrit <div class="pp-free-frame" data-ff-x data-ff-y data-ff-w data-ff-h><div class="pp-free-frame-box">
//    <div class="pp-free-frame-content">...</div></div></div>. Les quatre mesures sont en POINTS depuis le coin haut gauche de la PAGE (le point de PowerPoint : 12 700 unités, donc l'import et
//    l'export PowerPoint les prennent tels quels ; pdfmake place aussi depuis le coin de la page) : x, y, largeur, hauteur MINIMALE. La hauteur est celle que la personne a réglée : la boîte
//    grandit avec son texte et redescend à elle quand on l'efface, jamais en dessous de ce que le texte demande (`h` n'est jamais réécrit par la frappe).
//  - L'ANCRE : l'élément enregistré est de hauteur nulle (css/free-frame.css), la boîte y flotte (position absolue). L'éditeur, la Lecture, le diaporama et la bande ne lui comptent donc aucune
//    place, et rien du texte de la diapositive ne bouge quand on pose un cadre. Pour que l'ancre soit au coin du texte de SA diapositive, tous les cadres d'une diapositive sont rangés tout au
//    début d'elle, derrière le saut de page qui l'ouvre (ou au début du texte) : leur ordre est leur empilement, le dernier est au premier plan.
//  - Ce RANGEMENT (tidyTransaction, appendTransaction) est le garde-fou d'une présentation : un cadre collé au milieu d'un texte, dans une colonne ou un encadré, remonte au début de sa diapositive ; un
//    collage qui porte des cadres et du texte met les cadres au début et le texte à l'endroit du curseur ; un cadre déjà bien rangé n'est jamais touché, et rien ne se range au chargement d'un
//    modèle (ouvrir n'écrit rien). Hors d'une présentation, un cadre collé devient du texte ordinaire (ses blocs, sans la boîte).
//  - Les GESTES : un clic dans le cadre y pose le curseur ; son contour (le bord, 8 px) se saisit pour le déplacer ; huit poignées le redimensionnent (la hauteur ne descend jamais sous celle du
//    texte : dépassée vers le haut, le cadre s'ajuste à son texte et suit désormais lui) ; un geste est UN pas d'historique. Cadre sélectionné : les flèches le déplacent d'un point (Maj : dix),
//    Entrée y pose le curseur, Suppr l'efface ; dans le texte, Échap sélectionne le cadre. Sa barre flottante (cadre sélectionné seulement) : premier plan, arrière-plan, dupliquer, supprimer.
//  - La LIMITE : un cadre reste atteignable (au moins 24 points de lui restent sur la page).
//  - Les FORMES (demande du 21/10 à 18:35 : « ajout de forme ») sont des cadres : le même nœud porte en plus sa sorte (`shape` : un rectangle, un rectangle arrondi, une ellipse, un triangle, un
//    losange, une flèche à droite, à gauche, en haut ou en bas, une étoile, un chevron, un pentagone, un hexagone, un parallélogramme, une croix, une bulle - js/shape-geometry.js, les noms des
//    formes de PowerPoint), son fond (`fill`), la couleur de son trait (`line`) et son épaisseur
//    (`lw`, en points). Une forme s'écrit, se déplace, se redimensionne et s'empile comme un cadre de texte, et son texte est centré ; un cadre de texte peut lui aussi avoir un fond et un trait.
//    Le dessin est du CSS (css/free-frame.css) : le nœud écrit, avec ses mesures, les variables que ce CSS lit (`--ff-fill`, `--ff-clip`...), si bien que l'éditeur, la Lecture, le diaporama, les
//    miniatures et l'impression montrent la même forme sans script ; le PDF (canvas de pdfmake) et le Word (forme DrawingML) la dessinent d'après les mêmes contours.
//  - Les LIGNES (demande du 22/10 : « traits, flèches ») sont un nœud à part, `freeLine`, sans texte : une feuille que `isFrame` compte avec les cadres, donc rangée, empilée, déplacée aux flèches
//    du clavier, dupliquée, collée et supprimée comme eux, avec la même barre (moins le fond, plus les extrémités) ; deux BOUTS à la place des huit poignées (`start` et `end`, qu'on glisse :
//    Maj garde l'angle par pas de 15 degrés) et une bande à saisir qui suit le trait (un clic à côté ne la prend pas : le texte dessous reste atteignable). Sa boîte (x, y, w, h) est celle de
//    ses DEUX bouts, `flip` dit où est le début, `head` et `tail` les pointes (js/shape-geometry.js : `lineOutline`). Elle s'écrit comme un cadre (`data-ff-shape="line"`, `data-ff-flip`,
//    `data-ff-head`, `data-ff-tail`, `data-ff-line`, `data-ff-lw`) : la Lecture, le diaporama, l'impression et les miniatures la dessinent par le CSS, le PDF et le Word d'après les mêmes mesures.
//  - La ROTATION (4e fonction de la parité PowerPoint, après le fond, les formes, les traits et les notes) : un cadre ou une forme pivote autour du centre de sa boîte de `rot` degrés dans le sens des
//    aiguilles d'une montre (`data-ff-rot`, `--ff-rot` ; les degrés de PowerPoint, dont le `rot` vaut 60 000 unités par degré), dans [0, 360[ ; une ligne ne pivote pas (ses deux bouts disent son angle).
//    On la saisit par une poignée ronde au bout d'une tige au-dessus de la boîte (Maj : par pas de 15°, Échap abandonne ; l'angle se lit près de la souris), ou au clavier par Alt + ← → (15°, Maj : un
//    degré), UN pas d'historique chaque fois. Un cadre pivoté se redimensionne dans SES axes (le côté ou le coin d'en face ne bouge pas sur la page), se déplace, se duplique et se range comme un cadre
//    droit ; ses mesures (x, y, w, h) sont celles de sa boîte DROITE, si bien que tourner ne la déplace pas. Il est rogné à la page par son ancre. Le PDF le dessine en SVG (formes, puces et texte
//    tournés, le texte lu dans l'éditeur mot à mot), le Word par `a:xfrm rot`.
// Les écritures de ce module (geste, rangement, empilement) ne sont pas des modifications à suivre (TrackChanges.skipTracking) et ne rejouent pas le rangement (OWN_META).
const FreeFrame = (function () {
  const el = Dom.el;
  const NODE = 'freeFrame';
  const LINE_NODE = 'freeLine';
  const CLASS = 'pp-free-frame';
  const BOX = 'pp-free-frame-box';
  const CONTENT = 'pp-free-frame-content';
  const ACTIVE = 'pp-ff-active';
  const SELECTED = 'pp-ff-selected';
  const EMPTY = 'pp-ff-empty';
  const UI = 'pp-ff-ui';
  const OWN_META = 'ppFreeFrame';
  const BODY = '(paragraph | heading | bulletList | orderedList | taskList | blockquote)+';
  const PT_PER_PX = 0.75;
  const DEFAULTS = { x: 288, y: 234, w: 384, h: 72 };
  // L'aspect d'un cadre : sa sorte ('' : un cadre de texte), son fond et la couleur de son trait (#rrggbb ou '' : aucun), l'épaisseur du trait en points (0 : aucun).
  const LOOK = { shape: '', fill: '', line: '', lw: 0, flip: '', head: '', tail: '', rot: 0 };
  // L'aspect d'une forme neuve : un fond clair, un trait plus foncé de la même teinte (le texte noir y reste lisible).
  const SHAPE_LOOK = { fill: '#d9e2f3', line: '#2f5597', lw: 1.5 };
  // L'aspect d'une ligne neuve : le trait de PowerPoint des formes, un peu plus épais (sa pointe en grandit avec lui : trois fois l'épaisseur). Une ligne a toujours une couleur et une épaisseur.
  const LINE_LOOK = { line: '#2f5597', lw: 3 };
  const LINE_MIN_PT = 0.25;
  const LINE_MIN_LENGTH_PT = 1;
  const SNAP_STEP = Math.PI / 12;
  // La rotation : Maj à la souris et Alt + ← → au clavier la font par pas de 15 degrés, Alt + Maj + ← → d'un degré (les touches de PowerPoint).
  const ROTATE_STEP_DEG = 15;
  const ROTATE_FINE_DEG = 1;
  const ROTATE_MIN_RADIUS_PX = 4;
  // Ce que la poignée de rotation (css/free-frame.css) prend au-dessus de la boîte, en pixels de mise en page : la barre du cadre se pose au-dessus d'elle, jamais dessus.
  const ROTATE_ROOM_PX = 34;
  const BAR_GAP_PX = 8;
  const LIMITS = { pos: 4000, minW: 24, maxW: 4000, minH: 12, maxH: 4000 };
  const STAY_ON_PAGE_PT = 24;
  const OVERFLOW_SLACK_PT = 0.5;
  const NUDGE_PT = 1;
  const NUDGE_BIG_PT = 10;
  const CASCADE_PT = 12;
  // Les attributs du nœud et leur écriture dans le HTML enregistré.
  // Ce qui marque, dans le HTML des sorties, le cadre qui peint le fond d'une diapositive (js/slide-props.js:forOutput).
  const BACKGROUND_ATTR = 'data-ff-bg';
  const DOM_ATTRS = { x: 'data-ff-x', y: 'data-ff-y', w: 'data-ff-w', h: 'data-ff-h', shape: 'data-ff-shape', fill: 'data-ff-fill', line: 'data-ff-line', lw: 'data-ff-lw', flip: 'data-ff-flip', head: 'data-ff-head', tail: 'data-ff-tail', rot: 'data-ff-rot' };
  // Les variables CSS du dessin d'un cadre (css/free-frame.css) : écrites seulement pour un cadre qui a un aspect, retirées sinon.
  const LOOK_VARS = ['--ff-fill', '--ff-line', '--ff-edge', '--ff-radius', '--ff-clip', '--ff-ring', '--ff-ring-bg', '--ff-pt', '--ff-pr', '--ff-pb', '--ff-pl', '--ff-bleed', '--ff-grab', '--ff-sx', '--ff-sy', '--ff-ex', '--ff-ey', '--ff-rot'];
  const EDGES = ['n', 'e', 's', 'w'];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  // Le curseur d'une poignée d'un cadre pivoté : celui de la direction où elle pointe à l'écran (le côté de la poignée tourne avec le cadre), le plus proche de ceux que le navigateur sait faire.
  const HANDLE_ANGLES = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  const cursorFor = (side, rot) => RESIZE_CURSORS[Math.round((((HANDLE_ANGLES[side] + rot) % 180) + 180) % 180 / 45) % 4];

  let libs = null;      // { NodeSelection, TextSelection } de ProseMirror (js/editor.js)
  let toolbar = null;   // la barre flottante du cadre sélectionné (wireToolbar)
  let syncBar = null;   // ce qui la montre ou la cache selon la sélection (wireToolbar : `check`)
  function configure(deps) { libs = deps; }

  // Les mesures
  const toNumber = (value, fallback) => {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const tidy = value => Math.round(value * 100) / 100;
  // Une couleur lisible (#rrggbb en minuscules), ou '' : aucune.
  const colorOf = (raw) => {
    const hex = typeof raw === 'string' ? ColorMath.parseCss(raw) : null;
    return hex ? hex.toLowerCase() : '';
  };
  // Un angle de rotation, en degrés dans le sens des aiguilles d'une montre (le `rot` de PowerPoint, sans ses 60 000 unités par degré), ramené dans [0, 360[ au centième : -90 vaut 270, 360
  // vaut 0. Une valeur absente ou illisible vaut 0.
  const turnOf = (raw) => {
    const turn = tidy(((toNumber(raw, 0) % 360) + 360) % 360);
    return turn >= 360 ? 0 : turn;
  };
  // Les attributs d'un cadre, bornés : une valeur absente ou illisible (HTML écrit à la main, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur.
  // Une ligne (sorte `line`) a ses deux bouts pour boîte : sa largeur ou sa hauteur peut être nulle, jamais les deux (au moins un point de long) ; elle a toujours une couleur et une épaisseur,
  // pas de fond ; son sens et ses pointes sont lus (ShapeGeometry.flipOf, endOf). Ces trois réglages n'existent que pour elle. Une ligne ne pivote pas (ses deux bouts disent son angle) : sa
  // rotation vaut 0 ; celle d'un cadre ou d'une forme est lue par turnOf.
  function normalized(raw) {
    const a = raw || {};
    const shape = ShapeGeometry.kindOf(a.shape);
    const line = shape === ShapeGeometry.LINE;
    const out = {
      x: tidy(clamp(toNumber(a.x, DEFAULTS.x), -LIMITS.pos, LIMITS.pos)),
      y: tidy(clamp(toNumber(a.y, DEFAULTS.y), -LIMITS.pos, LIMITS.pos)),
      w: tidy(clamp(toNumber(a.w, DEFAULTS.w), line ? 0 : LIMITS.minW, LIMITS.maxW)),
      h: tidy(clamp(toNumber(a.h, DEFAULTS.h), line ? 0 : LIMITS.minH, LIMITS.maxH)),
      shape,
      fill: line ? '' : colorOf(a.fill),
      line: line ? colorOf(a.line) || LINE_LOOK.line : colorOf(a.line),
      lw: tidy(line ? clamp(toNumber(a.lw, LINE_LOOK.lw), LINE_MIN_PT, ShapeGeometry.MAX_LINE_PT) : clamp(toNumber(a.lw, LOOK.lw), 0, ShapeGeometry.MAX_LINE_PT)),
      flip: line ? ShapeGeometry.flipOf(a.flip) : '',
      head: line ? ShapeGeometry.endOf(a.head) : '',
      tail: line ? ShapeGeometry.endOf(a.tail) : '',
      rot: line ? 0 : turnOf(a.rot),
    };
    if (line && Math.hypot(out.w, out.h) < LINE_MIN_LENGTH_PT) out.w = LINE_MIN_LENGTH_PT;
    return out;
  }
  // Le trait d'un cadre, en points : il compte quand il a une couleur ET une épaisseur (la boîte le plafonne au quart de son petit côté en le dessinant ; une ligne n'a pas de plafond de boîte).
  const lineWidthOf = a => (a.line ? ShapeGeometry.lineWidthFor(a.w, a.h, a.lw, a.shape) : 0);
  const isPlain = a => !a.shape && !a.fill && !lineWidthOf(a);
  const isLineAttrs = a => a.shape === ShapeGeometry.LINE;
  // Les attributs d'un élément enregistré. `shape` : la sorte que le nœud impose (celle d'une ligne), quand le HTML ne la dit pas.
  function attrsOfEl(dom, shape) {
    const raw = {};
    Object.keys(DOM_ATTRS).forEach((key) => { raw[key] = dom.getAttribute(DOM_ATTRS[key]); });
    if (shape) raw.shape = shape;
    return normalized(raw);
  }
  // Ce que le CSS lit pour dessiner l'aspect du cadre `a` : ses marges de texte (la sorte et le trait les règlent), son fond, son trait (la bordure d'une boîte rectangulaire ou arrondie, un
  // anneau découpé dans un polygone). Rien pour un cadre de texte nu : son CSS est celui d'avant.
  function lookVars(a) {
    if (isLineAttrs(a)) return lineVars(a);
    if (isPlain(a)) return {};
    const edge = lineWidthOf(a);
    const look = ShapeGeometry.look(a.shape, a.w, a.h, edge);
    const pad = ShapeGeometry.textInsets(a.shape, a.w, a.h, edge);
    const vars = { '--ff-pt': pad[0] + 'pt', '--ff-pr': pad[1] + 'pt', '--ff-pb': pad[2] + 'pt', '--ff-pl': pad[3] + 'pt' };
    if (a.fill) vars['--ff-fill'] = a.fill;
    if (edge) vars['--ff-line'] = a.line;
    if (look.edge) vars['--ff-edge'] = look.edge + 'pt';
    if (look.radius !== '0') vars['--ff-radius'] = look.radius;
    if (look.clip !== 'none') vars['--ff-clip'] = look.clip;
    if (look.ring !== 'none') { vars['--ff-ring'] = look.ring; vars['--ff-ring-bg'] = a.line; }
    return vars;
  }
  // Ce que le CSS lit pour dessiner une ligne : son encre (la couleur du trait, découpée dans le calque de fond par le polygone de la ligne), le tour que sa boîte prend autour de celle de ses deux
  // bouts (l'encre en sort), la bande qu'on saisit et la place des deux bouts (en points depuis le coin de la boîte agrandie).
  function lineVars(a) {
    const look = ShapeGeometry.lineLook(a.w, a.h, { flip: a.flip, lw: lineWidthOf(a), head: a.head, tail: a.tail });
    const vars = { '--ff-fill': a.line, '--ff-bleed': look.bleed + 'pt', '--ff-sx': look.start[0] + 'pt', '--ff-sy': look.start[1] + 'pt', '--ff-ex': look.end[0] + 'pt', '--ff-ey': look.end[1] + 'pt' };
    if (look.clip !== 'none') vars['--ff-clip'] = look.clip;
    if (look.grab !== 'none') vars['--ff-grab'] = look.grab;
    return vars;
  }
  // La rotation : `--ff-rot`, que le CSS lit (css/free-frame.css) ; rien pour un cadre droit.
  const turnVars = a => (a.rot ? { '--ff-rot': a.rot + 'deg' } : {});
  const varsOf = a => Object.assign({ '--ff-x': a.x + 'pt', '--ff-y': a.y + 'pt', '--ff-w': a.w + 'pt', '--ff-h': a.h + 'pt' }, lookVars(a), turnVars(a));
  const styleOf = (a) => { const vars = varsOf(a); return Object.keys(vars).map(name => name + ':' + vars[name]).join(';'); };
  // Les attributs data-ff-* d'un cadre : ses mesures toujours, son aspect seulement quand il en a un (un cadre de texte nu s'écrit comme avant).
  function dataAttrsOf(a) {
    const out = {};
    ['x', 'y', 'w', 'h'].forEach((key) => { out[DOM_ATTRS[key]] = String(a[key]); });
    if (a.shape) out[DOM_ATTRS.shape] = a.shape;
    if (a.fill) out[DOM_ATTRS.fill] = a.fill;
    if (a.line) out[DOM_ATTRS.line] = a.line;
    if (a.lw) out[DOM_ATTRS.lw] = String(a.lw);
    if (a.flip) out[DOM_ATTRS.flip] = a.flip;
    if (a.head) out[DOM_ATTRS.head] = a.head;
    if (a.tail) out[DOM_ATTRS.tail] = a.tail;
    if (a.rot) out[DOM_ATTRS.rot] = String(a.rot);
    return out;
  }
  function domAttrs(a) {
    return Object.assign({ class: CLASS, role: 'group', style: styleOf(a) }, dataAttrsOf(a));
  }
  // Le fond d'une diapositive, tel que les sorties le lisent (js/slide-props.js:forOutput) : un cadre de la page entière, à son coin, plein de `color` (#rrggbb), sans trait ni texte. Le CSS
  // le peint SOUS le texte et à la taille de la page (css/free-frame.css), le PDF et le Word le posent derrière lui à la taille de la leur ; l'éditeur ne le relit jamais (parseHTML).
  function backgroundHtml(color) {
    const page = pageSize();
    const a = normalized({ x: 0, y: 0, w: page.width, h: page.height, fill: color });
    const attrs = Object.assign({ class: CLASS, role: 'presentation', 'aria-hidden': 'true', style: styleOf(a), [BACKGROUND_ATTR]: '' }, dataAttrsOf(a));
    const text = Object.keys(attrs).map(name => ' ' + name + '="' + attrs[name] + '"').join('');
    return '<div' + text + '><div class="' + BOX + '"><div class="' + CONTENT + '"></div></div></div>';
  }
  // La page en points (celle du modèle ouvert) : ce qui borne un cadre et le centre d'un cadre neuf.
  function pageSize() {
    const size = PageLayout.getPageSizePt();
    return { width: size.width, height: size.height };
  }
  // Un cadre reste atteignable : au moins STAY_ON_PAGE_PT de lui sur la page, de chaque côté.
  function keepReachable(a, page) {
    return Object.assign({}, a, {
      x: tidy(clamp(a.x, STAY_ON_PAGE_PT - a.w, page.width - STAY_ON_PAGE_PT)),
      y: tidy(clamp(a.y, STAY_ON_PAGE_PT - a.h, page.height - STAY_ON_PAGE_PT)),
    });
  }

  // Un cadre dépasse de sa diapositive quand le rectangle qui enveloppe sa boîte, tournée et à la hauteur que son texte lui donne, sort de la page : le CSS le rogne alors à son bord, dans
  // l'éditeur comme dans toutes les sorties. `dom` est l'élément du cadre (celui que `measuresOf` lit) ; sa hauteur montrée est celle de la boîte dessinée (`offsetHeight`, en pixels de
  // mise en page : ni le zoom de la feuille ni la rotation n'y comptent), jamais moins que la hauteur réglée. Une ligne n'a que ses deux bouts pour boîte ; le fond d'une diapositive
  // (`data-ff-bg`, des sorties seulement) est la page même. L'écart d'un demi-point ne compte pas (l'arrondi des mesures).
  function overflowsPage(dom) {
    if (dom.hasAttribute(BACKGROUND_ATTR)) return false;
    const a = attrsOfEl(dom);
    const box = dom.querySelector(':scope > .' + BOX);
    const shown = isLineAttrs(a) || !box ? a.h : Math.max(a.h, box.offsetHeight * PT_PER_PX);
    const turn = a.rot * Math.PI / 180;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const halfW = (a.w * cos + shown * sin) / 2;
    const halfH = (a.w * sin + shown * cos) / 2;
    const centerX = a.x + a.w / 2;
    const centerY = a.y + shown / 2;
    const page = pageSize();
    return centerX - halfW < -OVERFLOW_SLACK_PT || centerY - halfH < -OVERFLOW_SLACK_PT || centerX + halfW > page.width + OVERFLOW_SLACK_PT || centerY + halfH > page.height + OVERFLOW_SLACK_PT;
  }

  // Le geste, en pure fonction : `kind` est 'move' ou les côtés tenus par la poignée (n, e, s, w, ne, nw, se, sw) ; `dx` et `dy` le déplacement de la souris en points ; `shown` la hauteur
  // montrée au départ (la plus grande de `h` et du texte) ; `natural` la hauteur que demande le texte à la largeur d'arrivée. Rend les mesures à poser PENDANT le geste : `h` est la hauteur
  // demandée (la boîte montre la plus grande de `h` et du texte), `y` suit la hauteur montrée quand c'est le bord du haut qui bouge. Un cadre pivoté (`start.rot`) se redimensionne dans SES axes
  // (turnedGesture) ; le déplacer ne dépend pas de son angle.
  function flatGesture(kind, start, dx, dy, shown, natural) {
    let { x, y, w, h } = start;
    if (kind.indexOf('e') >= 0) w = Math.max(LIMITS.minW, start.w + dx);
    if (kind.indexOf('w') >= 0) { w = Math.max(LIMITS.minW, start.w - dx); x = start.x + start.w - w; }
    if (kind.indexOf('s') >= 0) h = Math.max(LIMITS.minH, shown + dy);
    if (kind.indexOf('n') >= 0) {
      h = Math.max(LIMITS.minH, shown - dy);
      y = start.y + shown - Math.max(h, natural);
    }
    return { x, y, w, h };
  }
  function gesture(kind, start, dx, dy, shown, natural, page) {
    const { w, h } = start;
    if (kind === 'move') return keepReachable({ x: start.x + dx, y: start.y + dy, w, h }, page);
    if (start.rot) return turnedGesture(kind, start, dx, dy, shown, natural, page);
    return keepReachable(flatGesture(kind, start, dx, dy, shown, natural), page);
  }
  // Le geste d'un cadre PIVOTÉ : la souris parcourt la page, la poignée tient un côté du cadre dans SES axes. Le déplacement est d'abord ramené dans les axes du cadre (« à plat »), le cadre est
  // redimensionné comme s'il était droit, puis reposé de sorte que le côté ou le coin que le geste à plat laisse en place (celui d'en face de la poignée) ne bouge pas sur la page : la rotation se
  // fait autour du centre, qui se déplace donc de la moitié de ce que la taille a changé, dans l'angle du cadre. `natural` doit être la hauteur du texte à la largeur d'arrivée (elle donne la
  // hauteur montrée, donc le centre) ; avec 0, seule la largeur est juste.
  function turnedGesture(kind, start, dx, dy, shown, natural, page) {
    const angle = start.rot * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const flat = flatGesture(kind, { x: 0, y: 0, w: start.w, h: start.h }, dx * cos + dy * sin, dy * cos - dx * sin, shown, natural);
    const height = Math.max(flat.h, natural);
    const moveX = flat.x + flat.w / 2 - start.w / 2;
    const moveY = flat.y + height / 2 - shown / 2;
    const centerX = start.x + start.w / 2 + moveX * cos - moveY * sin;
    const centerY = start.y + shown / 2 + moveX * sin + moveY * cos;
    return keepReachable({ x: tidy(centerX - flat.w / 2), y: tidy(centerY - height / 2), w: flat.w, h: flat.h }, page);
  }
  // Le geste de la poignée de rotation, en pure fonction : l'angle (en degrés) d'un cadre qui était à `startRot` quand la souris était en `from`, la souris étant maintenant en `to` ; `center` est le
  // centre du cadre, autour duquel il tourne. Le cadre tourne d'autant que la souris tourne autour de lui (la poignée ne saute pas sous la souris). `snap` (Maj) tient l'angle sur un pas de 15 degrés.
  function rotationAt(startRot, center, from, to, snap) {
    const before = Math.atan2(from.y - center.y, from.x - center.x);
    const now = Math.atan2(to.y - center.y, to.x - center.x);
    const turn = startRot + (now - before) * 180 / Math.PI;
    return turnOf(snap ? Math.round(turn / ROTATE_STEP_DEG) * ROTATE_STEP_DEG : turn);
  }
  // Le geste d'une LIGNE, en pure fonction : `kind` est 'move' (la ligne entière) ou 'start' / 'end' (le bout qu'on tient) ; `dx` et `dy` le déplacement de la souris en points ; `snap` (Maj)
  // garde l'angle de la ligne par pas de 15 degrés autour du bout qu'on ne tient pas. Rend les mesures de la boîte de ses deux bouts (`x`, `y`, `w`, `h`) et son sens (`flip`) : tenir un bout
  // et le passer de l'autre côté de l'autre le retourne, la ligne n'est jamais « à l'envers ».
  function lineGesture(kind, start, dx, dy, page, snap) {
    if (kind === 'move') return keepReachable({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h, flip: start.flip }, page);
    const ends = ShapeGeometry.lineEnds(start.w, start.h, start.flip);
    const begin = [start.x + ends.start[0], start.y + ends.start[1]];
    const finish = [start.x + ends.end[0], start.y + ends.end[1]];
    const held = kind === 'start' ? begin : finish;
    const fixed = kind === 'start' ? finish : begin;
    let moved = [held[0] + dx, held[1] + dy];
    if (snap) {
      const angle = Math.round(Math.atan2(moved[1] - fixed[1], moved[0] - fixed[0]) / SNAP_STEP) * SNAP_STEP;
      const length = Math.hypot(moved[0] - fixed[0], moved[1] - fixed[1]);
      moved = [fixed[0] + Math.cos(angle) * length, fixed[1] + Math.sin(angle) * length];
    }
    const from = kind === 'start' ? moved : fixed;
    const to = kind === 'start' ? fixed : moved;
    const w = tidy(Math.abs(to[0] - from[0]));
    const h = tidy(Math.abs(to[1] - from[1]));
    return keepReachable({
      x: tidy(Math.min(from[0], to[0])), y: tidy(Math.min(from[1], to[1])), w: Math.hypot(w, h) < LINE_MIN_LENGTH_PT ? LINE_MIN_LENGTH_PT : w, h,
      flip: (from[0] > to[0] ? 'h' : '') + (from[1] > to[1] ? 'v' : ''),
    }, page);
  }
  // La hauteur à ENREGISTRER à la fin d'un geste : ce que la personne a demandé, sauf quand le texte la dépasse ou l'égale - le cadre s'ajuste alors à son texte (la hauteur minimale).
  function storedHeight(requested, natural) {
    return requested <= natural + 0.5 ? LIMITS.minH : requested;
  }

  // Le document
  function inPresentation() {
    return SlidesEntry.presentationShown() && !HeaderFooterPreview.getHfMode();
  }
  const isLineNode = node => !!node && node.type.name === LINE_NODE;
  const isFrame = node => !!node && (node.type.name === NODE || node.type.name === LINE_NODE);
  // Le repère de transition de la diapositive (js/slide-props.js) ouvre le début de sa diapositive, devant les cadres : il n'est pas un cadre, et n'en dérange aucun.
  const isProps = node => !!node && node.type.name === 'slideProps';
  // Le début de la diapositive qui contient `pos` : derrière le dernier saut de page de premier niveau qui le précède, ou le début du texte.
  function slideStartOf(doc, pos) {
    let start = 0;
    doc.forEach((node, offset) => {
      if (node.type.name === 'pageBreak' && offset < pos) start = offset + node.nodeSize;
    });
    return start;
  }
  // Les cadres du début d'une diapositive : de son début jusque derrière le dernier cadre de la suite (l'endroit où poser un cadre neuf, au premier plan). `framesFrom` : où commencent les
  // cadres, derrière le repère de transition de la diapositive quand elle en a un (l'endroit où poser un cadre à l'arrière-plan).
  function headRange(doc, slideStart) {
    let at = slideStart;
    let framesFrom = slideStart;
    while (at < doc.content.size) {
      const node = doc.nodeAt(at);
      if (!isFrame(node) && !isProps(node)) break;
      at += node.nodeSize;
      if (isProps(node) && framesFrom === at - node.nodeSize) framesFrom = at;
    }
    return { from: slideStart, framesFrom, to: at };
  }
  // Le cadre autour d'une position, ou null : { pos, node }.
  function frameAround($pos) {
    for (let depth = $pos.depth; depth >= 1; depth--) {
      const node = $pos.node(depth);
      if (isFrame(node)) return { pos: $pos.before(depth), node };
    }
    return null;
  }
  const selectedFrame = selection => (selection && selection.node && isFrame(selection.node) ? { pos: selection.from, node: selection.node } : null);
  const currentFrame = state => selectedFrame(state.selection) || frameAround(state.selection.$from);
  // Le curseur au début du texte de la diapositive `slide` ({ start, end }) SANS entrer dans un de ses cadres : la bande y va quand on clique une miniature. Null sans endroit où écrire.
  function flowSelection(doc, slide) {
    const from = headRange(doc, slide.start).to;
    if (from > slide.end) return null;
    const found = libs.TextSelection.findFrom(doc.resolve(from), 1, true);
    return found && found.from <= slide.end ? found : null;
  }

  // Les cadres mal rangés d'un texte : ceux qui ne sont pas dans la suite du début de leur diapositive (au milieu d'un texte, dans une colonne, un encadré, une cellule...).
  // Rend [{ pos, node, slot }] dans l'ordre du texte, `slot` étant la position, dans le texte d'ici, où ranger le cadre (derrière les cadres déjà en tête de sa diapositive).
  function misplaced(doc) {
    const found = [];
    let slideStart = 0;
    let inHead = true;
    doc.forEach((node, offset) => {
      if (node.type.name === 'pageBreak') { slideStart = offset + node.nodeSize; inHead = true; return; }
      if (isProps(node)) return;
      if (isFrame(node)) {
        if (!inHead) found.push({ pos: offset, node, slot: headRange(doc, slideStart).to });
        return;
      }
      inHead = false;
      node.descendants((child, childOffset) => {
        if (isFrame(child)) found.push({ pos: offset + 1 + childOffset, node: child, slot: headRange(doc, slideStart).to });
        return !isFrame(child);
      });
    });
    return found;
  }
  // Le rangement : une transaction qui retire les cadres mal rangés et les remet, dans leur ordre, derrière ceux du début de leur diapositive ; null quand tout est rangé.
  function tidyTransaction(state) {
    const wrong = misplaced(state.doc);
    if (!wrong.length) return null;
    const tr = state.tr;
    const bySlot = new Map();
    wrong.forEach((entry) => {
      if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, []);
      bySlot.get(entry.slot).push(entry.node);
    });
    wrong.slice().reverse().forEach(entry => tr.delete(entry.pos, entry.pos + entry.node.nodeSize));
    Array.from(bySlot.keys()).sort((a, b) => b - a).forEach(slot => tr.insert(tr.mapping.map(slot, -1), bySlot.get(slot)));
    return TrackChanges.skipTracking(tr.setMeta(OWN_META, true));
  }

  // Un collage
  // Les cadres du premier niveau d'un collage qui sont COMPLETS : un texte copié dans un cadre arrive enveloppé du cadre, ouvert des deux côtés (son contenu seulement est copié), et se colle
  // comme du texte.
  function closedFrameIndexes(slice) {
    const last = slice.content.childCount - 1;
    const found = [];
    slice.content.forEach((node, offset, index) => {
      if (isFrame(node) && !((index === 0 && slice.openStart > 0) || (index === last && slice.openEnd > 0))) found.push(index);
    });
    return found;
  }
  // Le contenu `fragment` sans ses cadres (`unwrap` : leurs blocs prennent leur place ; sinon ils sont retirés), jusque dans les conteneurs ; un conteneur que cela laisse invalide est retiré.
  function withoutFrames(fragment, unwrap) {
    const out = [];
    fragment.forEach((node) => {
      if (isFrame(node)) { if (unwrap) withoutFrames(node.content, true).forEach(child => out.push(child)); return; }
      if (node.isLeaf || node.isTextblock) { out.push(node); return; }
      const content = withoutFrames(node.content, unwrap);
      if (content.eq(node.content)) { out.push(node); return; }
      if (node.type.validContent(content)) out.push(node.copy(content));
    });
    return fragment.constructor.fromArray(out);
  }
  const hasFrame = fragment => { let found = false; fragment.descendants((node) => { if (isFrame(node)) found = true; return !found; }); return found; };
  // Le premier endroit libre pour un cadre de mesures `a` : un cadre déjà posé aux mêmes mesures (`taken`, complétée du cadre posé) le fait glisser de CASCADE_PT, comme la copie d'un objet de
  // tout éditeur de diapositives.
  function freeSpot(a, taken, page) {
    let spot = a;
    for (let k = 0; k < 20 && taken.some(t => Math.abs(t.x - spot.x) < 0.5 && Math.abs(t.y - spot.y) < 0.5); k++) {
      spot = keepReachable(Object.assign({}, spot, { x: spot.x + CASCADE_PT, y: spot.y + CASCADE_PT }), page);
    }
    taken.push(spot);
    return spot;
  }
  // Les mesures des cadres déjà posés au début de la diapositive qui commence à `slideStart`.
  function takenIn(doc, slideStart) {
    const head = headRange(doc, slideStart);
    const taken = [];
    doc.nodesBetween(head.from, head.to, (node) => { if (isFrame(node)) taken.push(normalized(node.attrs)); return false; });
    return taken;
  }
  function handlePaste(view, event, slice) {
    if (!libs || !hasFrame(slice.content)) return false;
    const { state } = view;
    const SliceClass = slice.constructor;
    if (!inPresentation()) {
      view.dispatch(state.tr.replaceSelection(new SliceClass(withoutFrames(slice.content, true), 0, 0)).scrollIntoView());
      return true;
    }
    const closed = closedFrameIndexes(slice);
    if (!closed.length) return false;
    const frames = [];
    const rest = [];
    slice.content.forEach((node, offset, index) => { (closed.indexOf(index) >= 0 ? frames : rest).push(node); });
    const slideStart = slideStartOf(state.doc, state.selection.from);
    const at = headRange(state.doc, slideStart).to;
    const taken = takenIn(state.doc, slideStart);
    const page = pageSize();
    const pasted = frames.map(node => node.type.create(Object.assign({}, node.attrs, freeSpot(normalized(node.attrs), taken, page)), node.content, node.marks));
    const tr = state.tr.insert(at, pasted);
    if (rest.length) {
      const openStart = closed.indexOf(0) >= 0 ? 0 : slice.openStart;
      const openEnd = closed.indexOf(slice.content.childCount - 1) >= 0 ? 0 : slice.openEnd;
      tr.replaceSelection(new SliceClass(slice.content.constructor.fromArray(rest), openStart, openEnd));
    } else {
      tr.setSelection(libs.NodeSelection.create(tr.doc, at + pasted.slice(0, -1).reduce((sum, node) => sum + node.nodeSize, 0)));
    }
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // Les commandes
  function select(ed, pos) {
    ed.view.dispatch(ed.state.tr.setSelection(libs.NodeSelection.create(ed.state.doc, pos)));
  }
  const own = tr => TrackChanges.skipTracking(tr.setMeta(OWN_META, true));
  // Pose un cadre neuf au centre de la diapositive qui commence à `slideStart`, au premier plan. `options.shape` : la sorte d'une forme (rien : un cadre de texte). Un cadre de texte reçoit le
  // curseur ; une forme est sélectionnée - sa barre propose tout de suite le fond et le trait - et son texte, centré, s'écrit en y entrant (Entrée, ou un clic). Faux hors d'une présentation
  // modifiable.
  function insert(ed, slideStart, options) {
    if (!libs || !ed || !ed.isEditable || !inPresentation()) return false;
    const { state } = ed;
    const page = pageSize();
    if (options && options.shape === ShapeGeometry.LINE) return insertLine(ed, slideStart, options);
    const kind = ShapeGeometry.kindOf(options && options.shape);
    const size = kind ? ShapeGeometry.defaults(kind) : { w: DEFAULTS.w, h: DEFAULTS.h };
    const w = Math.min(size.w, Math.max(LIMITS.minW, page.width - 2 * STAY_ON_PAGE_PT));
    const h = Math.min(size.h, Math.max(LIMITS.minH, page.height - 2 * STAY_ON_PAGE_PT));
    const at = headRange(state.doc, slideStart).to;
    const wanted = Object.assign({ x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, shape: kind }, kind ? SHAPE_LOOK : {});
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const type = state.schema.nodes[NODE];
    const node = kind ? type.create(attrs, state.schema.nodes.paragraph.create({ textAlign: 'center' })) : type.createAndFill(attrs);
    const tr = own(state.tr.insert(at, node));
    tr.setSelection(kind ? libs.NodeSelection.create(tr.doc, at) : libs.TextSelection.near(tr.doc.resolve(at + 1), 1)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Pose une ligne neuve (`options.head` et `options.tail` : ses pointes) : horizontale, au milieu de la diapositive, au premier plan, SÉLECTIONNÉE (ses deux bouts se saisissent, sa barre propose le
  // trait et les extrémités). Une ligne n'a pas de texte à recevoir.
  function insertLine(ed, slideStart, options) {
    const { state } = ed;
    const page = pageSize();
    const w = Math.min(ShapeGeometry.defaults(ShapeGeometry.LINE).w, Math.max(LINE_MIN_LENGTH_PT, page.width - 2 * STAY_ON_PAGE_PT));
    const wanted = { x: (page.width - w) / 2, y: page.height / 2, w, h: 0, shape: ShapeGeometry.LINE, line: LINE_LOOK.line, lw: LINE_LOOK.lw, head: options.head, tail: options.tail };
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const at = headRange(state.doc, slideStart).to;
    const tr = own(state.tr.insert(at, state.schema.nodes[LINE_NODE].create(attrs)));
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Les mesures d'un cadre, écrites : UN pas d'historique, la sélection (le cadre) gardée. Rend vrai quand quelque chose a changé.
  function patch(ed, pos, changes, reselect) {
    const node = ed.state.doc.nodeAt(pos);
    if (!isFrame(node)) return false;
    const next = normalized(Object.assign({}, node.attrs, changes));
    if (Object.keys(next).every(key => next[key] === node.attrs[key])) return false;
    const tr = own(ed.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, next)));
    if (reselect) tr.setSelection(libs.NodeSelection.create(tr.doc, pos));
    ed.view.dispatch(tr);
    return true;
  }
  function nudge(ed, found, dx, dy) {
    const a = normalized(found.node.attrs);
    const moved = keepReachable({ x: a.x + dx, y: a.y + dy, w: a.w, h: a.h }, pageSize());
    return patch(ed, found.pos, { x: moved.x, y: moved.y }, true);
  }
  // Pivote le cadre de `delta` degrés (UN pas d'historique) et le dit dans la ligne d'état, pour qui n'a pas la souris. Faux quand rien ne change (une ligne ne pivote pas).
  function turnBy(ed, found, delta) {
    const a = normalized(found.node.attrs);
    if (isLineAttrs(a)) return false;
    const rot = turnOf(a.rot + delta);
    if (!patch(ed, found.pos, { rot }, true)) return false;
    SlidesEntry.status(I18n.t('frame.rotated', { n: numberText(rot) }));
    return true;
  }
  // L'empilement : le cadre passe au premier plan (`front`) ou à l'arrière-plan (`back`) des cadres de sa diapositive.
  function reorder(ed, found, where) {
    const { state } = ed;
    const head = headRange(state.doc, slideStartOf(state.doc, found.pos));
    const size = found.node.nodeSize;
    if ((where === 'front' && found.pos + size === head.to) || (where === 'back' && found.pos === head.framesFrom)) return false;
    const tr = own(state.tr.delete(found.pos, found.pos + size));
    const to = tr.mapping.map(where === 'front' ? head.to : head.framesFrom, where === 'front' ? -1 : 1);
    tr.insert(to, found.node);
    tr.setSelection(libs.NodeSelection.create(tr.doc, to)).scrollIntoView();
    ed.view.dispatch(tr);
    return true;
  }
  function duplicate(ed, found) {
    const { state } = ed;
    const slideStart = slideStartOf(state.doc, found.pos);
    const at = headRange(state.doc, slideStart).to;
    const page = pageSize();
    const a = normalized(found.node.attrs);
    const spot = freeSpot(keepReachable(Object.assign({}, a, { x: a.x + CASCADE_PT, y: a.y + CASCADE_PT }), page), takenIn(state.doc, slideStart), page);
    const copy = found.node.type.create(Object.assign({}, found.node.attrs, spot), found.node.content, found.node.marks);
    const tr = own(state.tr.insert(at, copy));
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    return true;
  }
  function remove(ed, found) {
    ed.view.dispatch(own(ed.state.tr.delete(found.pos, found.pos + found.node.nodeSize)).scrollIntoView());
    ed.view.focus();
    return true;
  }

  // La vue
  // Mesure ce que rend `measure()` pendant que la boîte `box` est DROITE : le rectangle d'une boîte pivotée est celui de sa rotation, or ce que les exports lisent du DOM (la hauteur que le texte lui
  // donne, la place de son texte) est celui de la boîte droite, dont ils posent ensuite la rotation eux-mêmes.
  function straight(box, measure) {
    const saved = box.style.transform;
    box.style.transform = 'none';
    try { return measure(); } finally { box.style.transform = saved; }
  }
  // La hauteur que demande le texte du cadre à sa largeur d'aujourd'hui, en points : la boîte sans hauteur minimale.
  // La boîte est mesurée DROITE : le rectangle d'une boîte pivotée est celui qui enveloppe sa rotation, pas sa hauteur.
  function naturalHeight(box, zoom) {
    const savedHeight = box.style.minHeight;
    const savedTurn = box.style.transform;
    box.style.minHeight = '0';
    box.style.transform = 'none';
    const height = box.getBoundingClientRect().height / zoom * PT_PER_PX;
    box.style.minHeight = savedHeight;
    box.style.transform = savedTurn;
    return height;
  }
  function paint(dom, a) {
    const vars = varsOf(a);
    Object.keys(vars).forEach((name) => { dom.style.setProperty(name, vars[name]); });
    LOOK_VARS.forEach((name) => { if (!(name in vars)) dom.style.removeProperty(name); });
    const data = dataAttrsOf(a);
    Object.keys(DOM_ATTRS).forEach((key) => {
      const name = DOM_ATTRS[key];
      if (name in data) dom.setAttribute(name, data[name]); else dom.removeAttribute(name);
    });
  }
  function buildUi() {
    const ui = el('div', UI);
    ui.contentEditable = 'false';
    ui.setAttribute('aria-hidden', 'true');
    EDGES.forEach((side) => {
      const edge = el('div', 'pp-ff-edge pp-ff-edge-' + side);
      edge.dataset.ffKind = 'move';
      edge.title = I18n.t('frame.moveTip');
      ui.appendChild(edge);
    });
    HANDLES.forEach((side) => {
      const handle = el('div', 'pp-ff-handle pp-ff-handle-' + side);
      handle.dataset.ffKind = side;
      ui.appendChild(handle);
    });
    // La poignée de rotation, au-dessus du cadre, au bout d'une tige.
    const rotate = el('div', 'pp-ff-rotate');
    rotate.dataset.ffKind = 'rotate';
    rotate.title = I18n.t('frame.rotateTip');
    Dom.setMarkup(rotate, Icons.svg('rotate'));
    ui.appendChild(rotate);
    return ui;
  }
  function liveFrame(ed, getPos) {
    const pos = getPos();
    const node = typeof pos === 'number' ? ed.state.doc.nodeAt(pos) : null;
    return isFrame(node) ? { pos, node } : null;
  }
  // Un geste à la souris : déplacer (le bord) ou redimensionner (une poignée). La souris parle en pixels écran, les mesures en points de la page : la feuille est réduite à ~0,85 dans un
  // panneau de ~700 px (EditorCore.layoutZoom). La boîte suit en direct ; UN pas d'historique à la fin ; Échap l'abandonne.
  function startGesture(event, kind, ctx) {
    if (kind === 'rotate') { startRotation(event, ctx); return; }
    const { ed, getPos, dom, box } = ctx;
    if (event.button !== 0 || !ed.isEditable) return;
    const live = liveFrame(ed, getPos);
    if (!live) return;
    event.preventDefault();
    event.stopPropagation();
    select(ed, live.pos);
    ed.view.focus();
    const zoom = EditorCore.layoutZoom(dom);
    const page = pageSize();
    const start = normalized(live.node.attrs);
    const isLine = isLineAttrs(start);
    const shown = isLine ? start.h : Math.max(start.h, naturalHeight(box, zoom));
    let current = start;
    let moved = false;
    // Le geste ne règle que les mesures ; l'aspect (la sorte, le fond, le trait) suit les mesures à chaque pas : le contour d'une forme se redessine à sa taille du moment.
    const show = measures => paint(dom, Object.assign({}, start, measures));
    function onMove(e) {
      if (!moved) { moved = true; if (toolbar) toolbar.hide(); }
      const dx = (e.clientX - event.clientX) / zoom * PT_PER_PX;
      const dy = (e.clientY - event.clientY) / zoom * PT_PER_PX;
      if (isLine) { current = lineGesture(kind, start, dx, dy, page, e.shiftKey); show(current); return; }
      // La largeur change ce que demande le texte : posée d'abord, elle donne la hauteur du texte qui règle le bord du haut (et, pour un cadre pivoté, le centre autour duquel il tourne).
      current = gesture(kind, start, dx, dy, shown, 0, page);
      show(current);
      if (kind !== 'move' && (kind.indexOf('n') >= 0 || start.rot)) { current = gesture(kind, start, dx, dy, shown, naturalHeight(box, zoom), page); show(current); }
    }
    function stop() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey, true);
    }
    function onUp() {
      stop();
      const now = liveFrame(ed, getPos);
      if (!now || !moved) return;
      // Seul un bord du haut ou du bas change la hauteur demandée : déplacer le cadre ou le prendre par un côté ne la réécrit jamais.
      const vertical = !isLine && (kind.indexOf('n') >= 0 || kind.indexOf('s') >= 0);
      const final = vertical ? Object.assign({}, current, { h: storedHeight(current.h, naturalHeight(box, zoom)) }) : current;
      if (!patch(ed, now.pos, final, true)) paint(dom, normalized(now.node.attrs));
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      const now = liveFrame(ed, getPos);
      if (now) paint(dom, normalized(now.node.attrs));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey, true);
  }
  // Pivoter à la souris (la poignée au-dessus du cadre) : le cadre tourne autour de son centre d'autant que la souris tourne autour de lui, Maj tient l'angle sur un pas de 15 degrés, Échap abandonne,
  // UN pas d'historique à la fin. L'angle du moment se lit près de la souris pendant le geste (une pastille hors de la feuille, donc toujours droite). Une ligne ne pivote pas.
  function startRotation(event, ctx) {
    const { ed, getPos, dom, box } = ctx;
    if (event.button !== 0 || !ed.isEditable) return;
    const live = liveFrame(ed, getPos);
    if (!live || isLineNode(live.node)) return;
    event.preventDefault();
    event.stopPropagation();
    select(ed, live.pos);
    ed.view.focus();
    const start = normalized(live.node.attrs);
    // Le centre du rectangle qui enveloppe la boîte est celui de la boîte, quel que soit son angle : le pivot ne bouge pas pendant le geste.
    const rect = box.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const from = { x: event.clientX, y: event.clientY };
    const badge = el('div', 'pp-ff-angle');
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);
    let current = start.rot;
    let moved = false;
    const show = rot => paint(dom, Object.assign({}, start, { rot }));
    function onMove(e) {
      if (!moved) { moved = true; if (toolbar) toolbar.hide(); }
      badge.style.left = e.clientX + 16 + 'px';
      badge.style.top = e.clientY - 30 + 'px';
      // Tout près du centre, l'angle de la souris saute d'un pas à l'autre : le cadre garde le dernier.
      if (Math.hypot(e.clientX - center.x, e.clientY - center.y) >= ROTATE_MIN_RADIUS_PX) {
        current = rotationAt(start.rot, center, from, { x: e.clientX, y: e.clientY }, e.shiftKey);
        show(current);
      }
      badge.textContent = numberText(current) + '°';
    }
    function stop() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey, true);
      badge.remove();
    }
    function onUp() {
      stop();
      const now = liveFrame(ed, getPos);
      if (!now || !moved) return;
      if (!patch(ed, now.pos, { rot: current }, true)) paint(dom, normalized(now.node.attrs));
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      const now = liveFrame(ed, getPos);
      if (now) paint(dom, normalized(now.node.attrs));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey, true);
  }
  const isEmptyFrame = node => node.childCount === 1 && node.firstChild.type.name === 'paragraph' && node.firstChild.childCount === 0;
  function nodeView({ node: initial, editor: ed, getPos }) {
    let node = initial;
    const dom = el('div', CLASS);
    const box = el('div', BOX);
    const ui = buildUi();
    const handles = Array.from(ui.querySelectorAll('.pp-ff-handle'));
    const content = el('div', CONTENT);
    box.append(ui, content);
    dom.appendChild(box);
    dom.setAttribute('role', 'group');
    // Le nom du cadre dit sa sorte : « Ellipse », « Étoile »... ; « Cadre de texte » sinon.
    const refresh = () => {
      const a = normalized(node.attrs);
      paint(dom, a);
      handles.forEach((handle) => { handle.style.cursor = a.rot ? cursorFor(handle.dataset.ffKind, a.rot) : ''; });
      dom.setAttribute('aria-label', I18n.t(a.shape ? 'shape.' + a.shape : 'frame.label'));
      dom.classList.toggle(EMPTY, isEmptyFrame(node));
    };
    refresh();
    ui.addEventListener('mousedown', (event) => {
      const target = event.target.closest && event.target.closest('[data-ff-kind]');
      if (target) startGesture(event, target.dataset.ffKind, { ed, getPos, dom, box });
    });
    return {
      dom,
      contentDOM: content,
      update(updated) {
        if (updated.type !== node.type) return false;
        node = updated;
        refresh();
        return true;
      },
      selectNode() { dom.classList.add(SELECTED); },
      deselectNode() { dom.classList.remove(SELECTED); },
      // Les bords et les poignées sont à eux : ni sélection, ni glisser de l'éditeur sur leur clic. Rien de ce qui n'est pas le texte du cadre n'est une modification du document.
      stopEvent: event => ui.contains(event.target),
      ignoreMutation: mutation => mutation.type !== 'selection' && !content.contains(mutation.target),
    };
  }

  // L'interface d'une ligne : la bande qu'on saisit pour la déplacer (elle suit le trait : son découpage est `--ff-grab`) et ses deux bouts, `start` et `end`, qu'on glisse.
  function buildLineUi() {
    const ui = el('div', UI);
    ui.contentEditable = 'false';
    ui.setAttribute('aria-hidden', 'true');
    const grab = el('div', 'pp-ff-line-grab');
    grab.dataset.ffKind = 'move';
    grab.title = I18n.t('frame.moveTip');
    ui.appendChild(grab);
    [['start', 'frame.lineStartTip'], ['end', 'frame.lineEndTip']].forEach(([side, key]) => {
      const handle = el('div', 'pp-ff-line-handle pp-ff-line-handle-' + side);
      handle.dataset.ffKind = side;
      handle.title = I18n.t(key);
      ui.appendChild(handle);
    });
    return ui;
  }
  // Le nom d'une ligne dit ses pointes : « Ligne », « Ligne avec flèche », « Ligne avec deux flèches ».
  const lineNameKey = a => (a.head && a.tail ? 'shape.lineArrowDouble' : a.head || a.tail ? 'shape.lineArrow' : 'shape.line');
  function lineView({ node: initial, editor: ed, getPos }) {
    let node = initial;
    const dom = el('div', CLASS);
    const box = el('div', BOX);
    const ui = buildLineUi();
    box.append(ui, el('div', CONTENT));
    dom.appendChild(box);
    dom.setAttribute('role', 'group');
    const refresh = () => {
      const a = normalized(node.attrs);
      paint(dom, a);
      dom.setAttribute('aria-label', I18n.t(lineNameKey(a)));
    };
    refresh();
    ui.addEventListener('mousedown', (event) => {
      const target = event.target.closest && event.target.closest('[data-ff-kind]');
      if (target) startGesture(event, target.dataset.ffKind, { ed, getPos, dom, box });
    });
    return {
      dom,
      update(updated) {
        if (updated.type !== node.type) return false;
        node = updated;
        refresh();
        return true;
      },
      selectNode() { dom.classList.add(SELECTED); },
      deselectNode() { dom.classList.remove(SELECTED); },
      // Rien d'une ligne n'est du texte : ni les clics de son interface, ni ce que le geste écrit dans son DOM ne regardent l'éditeur.
      stopEvent: event => ui.contains(event.target),
      ignoreMutation: () => true,
    };
  }

  // Le nœud et son extension
  // Les attributs d'un nœud : les mesures et l'aspect d'un cadre, avec leurs valeurs par défaut (`overrides`, celles de la ligne) ; une valeur du HTML enregistré est bornée (normalized) et la sorte que
  // le nœud impose (`overrides.shape`) remplace celle que le HTML ne dirait pas.
  function attributeSpecs(overrides) {
    const out = {};
    Object.keys(DEFAULTS).concat(Object.keys(LOOK)).forEach((key) => {
      const fallback = key in overrides ? overrides[key] : (key in DEFAULTS ? DEFAULTS[key] : LOOK[key]);
      out[key] = { default: fallback, parseHTML: dom => attrsOfEl(dom, overrides.shape)[key], renderHTML: () => ({}) };
    });
    return out;
  }
  // La ligne : une feuille (`atom`), sans texte, qui s'enregistre comme un cadre (la boîte et son contenu, vide) pour que tout ce qui lit le HTML des cadres - la Lecture, le diaporama, l'impression, les
  // miniatures, le PDF, le Word - la trouve sous la même forme. Elle passe avant le cadre au collage (priorité), qui prendrait sinon son HTML pour un cadre de texte.
  function createLineNode(Node) {
    return Node.create({
      name: LINE_NODE,
      group: 'block',
      atom: true,
      selectable: true,
      draggable: false,
      addAttributes() { return attributeSpecs({ shape: ShapeGeometry.LINE, line: LINE_LOOK.line, lw: LINE_LOOK.lw }); },
      parseHTML() { return [{ tag: 'div.' + CLASS + '[' + DOM_ATTRS.shape + '="' + ShapeGeometry.LINE + '"]', priority: 1050 }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs)), ['div', { class: BOX }, ['div', { class: CONTENT }]]]; },
      addNodeView() { return lineView; },
    });
  }
  function createNode(Node) {
    return Node.create({
      name: NODE,
      group: 'block',
      content: BODY,
      defining: true,
      isolating: true,
      addAttributes() { return attributeSpecs({}); },
      // Le fond d'une diapositive que les sorties écrivent comme un cadre (backgroundHtml) n'est pas un cadre de la personne : collé de la Lecture, il n'entre pas.
      parseHTML() { return [{ tag: 'div.' + CLASS + '[' + BACKGROUND_ATTR + ']', priority: 1100, ignore: true }, { tag: 'div.' + CLASS, priority: 1000, contentElement: '.' + CONTENT }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs)), ['div', { class: BOX }, ['div', { class: CONTENT }, 0]]]; },
      addNodeView() { return nodeView; },
    });
  }
  // Les touches du cadre sélectionné : les flèches le déplacent, Entrée y pose le curseur ; Échap, dans son texte, le sélectionne.
  function handleKeyDown(view, event) {
    const ed = EditorCore.getEditor();
    if (!libs || !ed || !inPresentation() || event.ctrlKey || event.metaKey) return false;
    const { state } = view;
    const selected = selectedFrame(state.selection);
    // Alt + ← → pivotent le cadre sélectionné de 15 degrés, avec Maj d'un degré (comme dans PowerPoint) ; une ligne ne pivote pas.
    if (event.altKey) {
      if (!selected || isLineNode(selected.node) || !ed.isEditable || !/^Arrow(Left|Right)$/.test(event.key)) return false;
      event.preventDefault();
      const step = event.shiftKey ? ROTATE_FINE_DEG : ROTATE_STEP_DEG;
      turnBy(ed, selected, event.key === 'ArrowLeft' ? -step : step);
      return true;
    }
    if (selected && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      const step = event.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
      event.preventDefault();
      nudge(ed, selected, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      return true;
    }
    if (selected && event.key === 'Enter') {
      event.preventDefault();
      if (isLineNode(selected.node)) return true;   // une ligne n'a pas de texte où poser le curseur
      view.dispatch(state.tr.setSelection(libs.TextSelection.near(state.doc.resolve(selected.pos + 1), 1)).scrollIntoView());
      return true;
    }
    if (!selected && !event.shiftKey && event.key === 'Escape') {
      const around = frameAround(state.selection.$from);
      if (!around) return false;
      event.preventDefault();
      select(ed, around.pos);
      return true;
    }
    return false;
  }
  function createExtension(Extension, deps) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = deps;
    return Extension.create({
      name: 'freeFrameBehaviour',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('freeFrame'),
          props: {
            // Le curseur dans un cadre : son contour se dessine (le cadre sélectionné a le sien, par selectNode).
            decorations(state) {
              if (!inPresentation() || state.selection.node) return null;
              const found = frameAround(state.selection.$from);
              return found ? DecorationSet.create(state.doc, [Decoration.node(found.pos, found.pos + found.node.nodeSize, { class: ACTIVE })]) : null;
            },
            handlePaste,
            handleKeyDown,
          },
          // Le rangement : seulement après un geste de la personne (pas au chargement d'un modèle, ni en défaisant, ni pour ce qui vient d'une autre personne, ni après le rangement lui-même),
          // seulement dans une présentation.
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some(tr => tr.docChanged)) return null;
            if (transactions.some(tr => tr.getMeta(OWN_META) || tr.getMeta('preventUpdate') || tr.getMeta('history$') || LiveEntry.isRemote(tr))) return null;
            return inPresentation() ? tidyTransaction(newState) : null;
          },
        })];
      },
    });
  }

  // La barre flottante du cadre sélectionné : son fond, la couleur et l'épaisseur de son trait (un menu chacun : la palette de la barre d'outils, js/color-palette.js, et une courte liste),
  // premier plan, arrière-plan, dupliquer, supprimer. Un choix est UN pas d'historique ; une couleur de trait sans épaisseur (ou l'inverse) apporte l'autre, celle d'une forme neuve : un
  // choix doit se voir.
  const WIDTHS = [0.5, 1, 1.5, 2, 3, 4.5, 6];
  const numberText = n => String(n).replace('.', I18n.getLang() === 'fr' ? ',' : '.');
  function wireToolbar(ed) {
    const button = (action, icon, key) => '<button data-action="' + action + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key) + '">' + Icons.svg(icon) + '</button>';
    const chip = (action, icon, key, bar) => '<button data-action="' + action + '" class="v2-fill-chip" id="v2-frame-' + action + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key)
      + '" aria-haspopup="true" aria-expanded="false">' + Icons.svg(icon) + (bar ? '<span class="v2-fill-bar" id="v2-frame-' + bar + '-bar"></span>' : '') + Icons.svg('caretDown') + '</button>';
    const html = [
      chip('fill-open', 'fill', 'frame.fill', 'fill'),
      chip('line-open', 'shapeLine', 'frame.line', 'line'),
      chip('width-open', 'lineWidth', 'frame.lineWidth'),
      chip('ends-open', 'lineEnds', 'frame.ends'),
      '<span class="v2-floating-sep"></span>',
      button('front', 'layerFront', 'frame.front'),
      button('back', 'layerBehind', 'frame.back'),
      '<span class="v2-floating-sep"></span>',
      button('duplicate', 'duplicate', 'frame.duplicate'),
      '<span class="v2-floating-sep"></span>',
      button('delete', 'trash', 'frame.delete'),
    ].join('');
    const looksOf = () => { const found = selectedFrame(ed.state.selection); return found ? normalized(found.node.attrs) : null; };
    const applyLook = (changes) => {
      const found = selectedFrame(ed.state.selection);
      if (found) patch(ed, found.pos, typeof changes === 'function' ? changes(normalized(found.node.attrs)) : changes, true);
      EditorCore.closeDropdownPanel();
    };
    // Une ligne a toujours un trait : ni « Sans trait » dans la palette de sa couleur, ni « Aucun trait » dans la liste de ses épaisseurs.
    const lineSelected = () => { const a = looksOf(); return !!a && isLineAttrs(a); };
    const colorMenu = (key, noneKey, onPick, onNone) => ColorPalette.createMenu({
      className: 'v2-color-dropdown', noneKey, current: () => (looksOf() || {})[key] || null, onPick, onNone,
      afterRender: (menu) => {
        const none = menu.el.querySelector('[data-action="none"]');
        if (none) none.style.display = key === 'line' && lineSelected() ? 'none' : '';
      },
    });
    const widthRows = [0].concat(WIDTHS).map(n => '<button type="button" role="menuitemradio" data-action="width:' + n + '"><span class="pp-ff-width-sample" style="--w:' + n + 'pt"></span><span>'
      + (n ? I18n.t('frame.widthValue', { n: numberText(n) }) : I18n.t('frame.widthNone')) + '</span></button>').join('');
    const widthMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-width-menu', widthRows, (action) => {
      if (action.indexOf('width:') !== 0) return;
      const lw = Number(action.slice(6));
      applyLook(a => (lw ? { lw, line: a.line || SHAPE_LOOK.line } : { lw }));
    });
    widthMenu.el.setAttribute('role', 'menu');
    widthMenu.el.setAttribute('aria-label', I18n.t('frame.lineWidth'));
    // Les extrémités d'une ligne : sans pointe, une pointe à la fin, au début, aux deux bouts.
    const ENDS = [
      { action: 'ends:none', icon: 'lineEndsNone', key: 'frame.endsNone', head: '', tail: '' },
      { action: 'ends:end', icon: 'lineEndsEnd', key: 'frame.endsEnd', head: '', tail: ShapeGeometry.endOf('triangle') },
      { action: 'ends:start', icon: 'lineEndsStart', key: 'frame.endsStart', head: ShapeGeometry.endOf('triangle'), tail: '' },
      { action: 'ends:both', icon: 'lineEndsBoth', key: 'frame.endsBoth', head: ShapeGeometry.endOf('triangle'), tail: ShapeGeometry.endOf('triangle') },
    ];
    const endsRows = ENDS.map(row => '<button type="button" role="menuitemradio" data-action="' + row.action + '">' + Icons.svg(row.icon) + '<span>' + I18n.t(row.key) + '</span></button>').join('');
    const endsMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-ends-menu', endsRows, (action) => {
      const row = ENDS.find(r => r.action === action);
      if (row) applyLook({ head: row.head, tail: row.tail });
    });
    endsMenu.el.setAttribute('role', 'menu');
    endsMenu.el.setAttribute('aria-label', I18n.t('frame.ends'));
    endsMenu.el.querySelectorAll('svg').forEach((svg) => { svg.setAttribute('aria-hidden', 'true'); });
    const menus = {
      'fill-open': colorMenu('fill', 'frame.noFill', color => applyLook({ fill: color }), () => applyLook({ fill: '' })),
      'line-open': colorMenu('line', 'frame.noLine', color => applyLook(a => ({ line: color, lw: a.lw || SHAPE_LOOK.lw })), () => applyLook({ line: '' })),
      'width-open': widthMenu,
      'ends-open': endsMenu,
    };
    const markWidth = () => {
      const a = looksOf();
      const now = a && a.line ? a.lw : 0;
      widthMenu.el.querySelectorAll('[data-action]').forEach((row) => {
        const n = Number(row.dataset.action.slice(6));
        const on = n === now;
        row.style.display = n === 0 && lineSelected() ? 'none' : '';
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    const markEnds = () => {
      const a = looksOf();
      endsMenu.el.querySelectorAll('[data-action]').forEach((row) => {
        const spec = ENDS.find(r => r.action === row.dataset.action);
        const on = !!a && spec.head === a.head && spec.tail === a.tail;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    const openMenu = (action) => {
      const menu = menus[action];
      const trigger = document.getElementById('v2-frame-' + action);
      if (EditorCore.getOpenDropdownPanel() === menu) { EditorCore.closeDropdownPanel(); return; }
      EditorCore.closeDropdownPanel();
      if (action === 'width-open') markWidth();
      if (action === 'ends-open') markEnds();
      menu.show(trigger);
      EditorCore.setOpenDropdownPanel(menu, trigger);
    };
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-frame-toolbar', html, (action) => {
      if (menus[action]) { openMenu(action); return; }
      const found = selectedFrame(ed.state.selection);
      if (!found) return;
      if (action === 'front' || action === 'back') reorder(ed, found, action);
      else if (action === 'duplicate') duplicate(ed, found);
      else if (action === 'delete') remove(ed, found);
    });
    toolbar = panel;
    const fillChip = panel.el.querySelector('#v2-frame-fill-open');
    const endsChip = panel.el.querySelector('#v2-frame-ends-open');
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur (un clic ailleurs dans la page) est une transaction de plus, mais ne change ni la sélection ni le document : la traiter rouvrirait la barre que le filet de
      // editor-core.js vient de fermer.
      if (transaction && transaction.getMeta('blur')) return;
      const found = ed.isEditable && inPresentation() ? selectedFrame(ed.state.selection) : null;
      const dom = found ? ed.view.nodeDOM(found.pos) : null;
      const box = dom && dom.querySelector ? dom.querySelector('.' + BOX) : null;
      const a = box ? normalized(found.node.attrs) : null;
      // Une ligne n'a pas de fond mais des extrémités ; un cadre ou une forme, l'inverse : les pastilles sont réglées AVANT de poser la barre, qui se place d'après sa largeur.
      const isLine = !!a && isLineAttrs(a);
      if (fillChip) fillChip.style.display = isLine ? 'none' : '';
      if (endsChip) endsChip.style.display = isLine ? '' : 'none';
      if (box) panel.show(box, isLine ? undefined : () => ({ offset: BAR_GAP_PX + Math.ceil(ROTATE_ROOM_PX * EditorCore.layoutZoom(box)) }));
      else {
        panel.hide();
        if (Object.keys(menus).some(name => menus[name] === EditorCore.getOpenDropdownPanel())) EditorCore.closeDropdownPanel();
      }
      EditorCore.setColorBar('v2-frame-fill-bar', a && a.fill ? a.fill : null);
      EditorCore.setColorBar('v2-frame-line-bar', a && a.line ? a.line : null);
    };
    ed.on('selectionUpdate', check);
    ed.on('transaction', check);
    syncBar = check;
  }
  // Remontre la barre du cadre sélectionné, ou la cache : pour une forme posée par une ligne de menu, dont l'appui (mousedown) referme les barres flottantes JUSTE après avoir posé la forme
  // (js/editor-core.js) ; le menu l'appelle une fois cet appui passé.
  const syncToolbar = () => { if (syncBar) syncBar(); };

  return {
    NODE, LINE_NODE, CLASS, BOX, CONTENT, BACKGROUND_ATTR, DEFAULTS, LOOK, SHAPE_LOOK, LINE_LOOK, LIMITS, STAY_ON_PAGE_PT, CASCADE_PT, lineWidthOf, backgroundHtml,
    configure, createNode, createLineNode, createExtension, wireToolbar, normalized, measuresOf: attrsOfEl, straight, gesture, lineGesture, rotationAt, turnOf, storedHeight, keepReachable, overflowsPage, misplaced, tidyTransaction, headRange, slideStartOf, flowSelection,
    insert, patch, nudge, turnBy, reorder, duplicate, remove, select, currentFrame, frameAround, syncToolbar,
  };
})();
