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
//    losange, une flèche à droite ou à gauche, une étoile - js/shape-geometry.js, les noms des formes de PowerPoint), son fond (`fill`), la couleur de son trait (`line`) et son épaisseur
//    (`lw`, en points). Une forme s'écrit, se déplace, se redimensionne et s'empile comme un cadre de texte, et son texte est centré ; un cadre de texte peut lui aussi avoir un fond et un trait.
//    Le dessin est du CSS (css/free-frame.css) : le nœud écrit, avec ses mesures, les variables que ce CSS lit (`--ff-fill`, `--ff-clip`...), si bien que l'éditeur, la Lecture, le diaporama, les
//    miniatures et l'impression montrent la même forme sans script ; le PDF (canvas de pdfmake) et le Word (forme DrawingML) la dessinent d'après les mêmes contours.
// Les écritures de ce module (geste, rangement, empilement) ne sont pas des modifications à suivre (TrackChanges.skipTracking) et ne rejouent pas le rangement (OWN_META).
const FreeFrame = (function () {
  const el = Dom.el;
  const NODE = 'freeFrame';
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
  const LOOK = { shape: '', fill: '', line: '', lw: 0 };
  // L'aspect d'une forme neuve : un fond clair, un trait plus foncé de la même teinte (le texte noir y reste lisible).
  const SHAPE_LOOK = { fill: '#d9e2f3', line: '#2f5597', lw: 1.5 };
  const LIMITS = { pos: 4000, minW: 24, maxW: 4000, minH: 12, maxH: 4000 };
  const STAY_ON_PAGE_PT = 24;
  const NUDGE_PT = 1;
  const NUDGE_BIG_PT = 10;
  const CASCADE_PT = 12;
  // Les attributs du nœud et leur écriture dans le HTML enregistré.
  const DOM_ATTRS = { x: 'data-ff-x', y: 'data-ff-y', w: 'data-ff-w', h: 'data-ff-h', shape: 'data-ff-shape', fill: 'data-ff-fill', line: 'data-ff-line', lw: 'data-ff-lw' };
  // Les variables CSS du dessin d'un cadre (css/free-frame.css) : écrites seulement pour un cadre qui a un aspect, retirées sinon.
  const LOOK_VARS = ['--ff-fill', '--ff-line', '--ff-edge', '--ff-radius', '--ff-clip', '--ff-ring', '--ff-ring-bg', '--ff-pt', '--ff-pr', '--ff-pb', '--ff-pl'];
  const EDGES = ['n', 'e', 's', 'w'];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

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
  // Les attributs d'un cadre, bornés : une valeur absente ou illisible (HTML écrit à la main, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur.
  function normalized(raw) {
    const a = raw || {};
    return {
      x: tidy(clamp(toNumber(a.x, DEFAULTS.x), -LIMITS.pos, LIMITS.pos)),
      y: tidy(clamp(toNumber(a.y, DEFAULTS.y), -LIMITS.pos, LIMITS.pos)),
      w: tidy(clamp(toNumber(a.w, DEFAULTS.w), LIMITS.minW, LIMITS.maxW)),
      h: tidy(clamp(toNumber(a.h, DEFAULTS.h), LIMITS.minH, LIMITS.maxH)),
      shape: ShapeGeometry.kindOf(a.shape),
      fill: colorOf(a.fill),
      line: colorOf(a.line),
      lw: tidy(clamp(toNumber(a.lw, LOOK.lw), 0, ShapeGeometry.MAX_LINE_PT)),
    };
  }
  // Le trait d'un cadre, en points : il compte quand il a une couleur ET une épaisseur (la boîte le plafonne au quart de son petit côté en le dessinant).
  const lineWidthOf = a => (a.line ? ShapeGeometry.lineWidthFor(a.w, a.h, a.lw) : 0);
  const isPlain = a => !a.shape && !a.fill && !lineWidthOf(a);
  function attrsOfEl(dom) {
    const raw = {};
    Object.keys(DOM_ATTRS).forEach((key) => { raw[key] = dom.getAttribute(DOM_ATTRS[key]); });
    return normalized(raw);
  }
  // Ce que le CSS lit pour dessiner l'aspect du cadre `a` : ses marges de texte (la sorte et le trait les règlent), son fond, son trait (la bordure d'une boîte rectangulaire ou arrondie, un
  // anneau découpé dans un polygone). Rien pour un cadre de texte nu : son CSS est celui d'avant.
  function lookVars(a) {
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
  const varsOf = a => Object.assign({ '--ff-x': a.x + 'pt', '--ff-y': a.y + 'pt', '--ff-w': a.w + 'pt', '--ff-h': a.h + 'pt' }, lookVars(a));
  const styleOf = (a) => { const vars = varsOf(a); return Object.keys(vars).map(name => name + ':' + vars[name]).join(';'); };
  // Les attributs data-ff-* d'un cadre : ses mesures toujours, son aspect seulement quand il en a un (un cadre de texte nu s'écrit comme avant).
  function dataAttrsOf(a) {
    const out = {};
    ['x', 'y', 'w', 'h'].forEach((key) => { out[DOM_ATTRS[key]] = String(a[key]); });
    if (a.shape) out[DOM_ATTRS.shape] = a.shape;
    if (a.fill) out[DOM_ATTRS.fill] = a.fill;
    if (a.line) out[DOM_ATTRS.line] = a.line;
    if (a.lw) out[DOM_ATTRS.lw] = String(a.lw);
    return out;
  }
  function domAttrs(a) {
    return Object.assign({ class: CLASS, role: 'group', style: styleOf(a) }, dataAttrsOf(a));
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

  // Le geste, en pure fonction : `kind` est 'move' ou les côtés tenus par la poignée (n, e, s, w, ne, nw, se, sw) ; `dx` et `dy` le déplacement de la souris en points ; `shown` la hauteur
  // montrée au départ (la plus grande de `h` et du texte) ; `natural` la hauteur que demande le texte à la largeur d'arrivée. Rend les mesures à poser PENDANT le geste : `h` est la hauteur
  // demandée (la boîte montre la plus grande de `h` et du texte), `y` suit la hauteur montrée quand c'est le bord du haut qui bouge.
  function gesture(kind, start, dx, dy, shown, natural, page) {
    let { x, y, w, h } = start;
    if (kind === 'move') return keepReachable({ x: start.x + dx, y: start.y + dy, w, h }, page);
    if (kind.indexOf('e') >= 0) w = Math.max(LIMITS.minW, start.w + dx);
    if (kind.indexOf('w') >= 0) { w = Math.max(LIMITS.minW, start.w - dx); x = start.x + start.w - w; }
    if (kind.indexOf('s') >= 0) h = Math.max(LIMITS.minH, shown + dy);
    if (kind.indexOf('n') >= 0) {
      h = Math.max(LIMITS.minH, shown - dy);
      y = start.y + shown - Math.max(h, natural);
    }
    return keepReachable({ x, y, w, h }, page);
  }
  // La hauteur à ENREGISTRER à la fin d'un geste : ce que la personne a demandé, sauf quand le texte la dépasse ou l'égale - le cadre s'ajuste alors à son texte (la hauteur minimale).
  function storedHeight(requested, natural) {
    return requested <= natural + 0.5 ? LIMITS.minH : requested;
  }

  // Le document
  function inPresentation() {
    return SlidesEntry.presentationShown() && !HeaderFooterPreview.getHfMode();
  }
  const isFrame = node => !!node && node.type.name === NODE;
  // Le début de la diapositive qui contient `pos` : derrière le dernier saut de page de premier niveau qui le précède, ou le début du texte.
  function slideStartOf(doc, pos) {
    let start = 0;
    doc.forEach((node, offset) => {
      if (node.type.name === 'pageBreak' && offset < pos) start = offset + node.nodeSize;
    });
    return start;
  }
  // Les cadres du début d'une diapositive : de son début jusque derrière le dernier cadre de la suite (l'endroit où poser un cadre neuf, au premier plan).
  function headRange(doc, slideStart) {
    let at = slideStart;
    while (at < doc.content.size) {
      const node = doc.nodeAt(at);
      if (!isFrame(node)) break;
      at += node.nodeSize;
    }
    return { from: slideStart, to: at };
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
  // L'empilement : le cadre passe au premier plan (`front`) ou à l'arrière-plan (`back`) des cadres de sa diapositive.
  function reorder(ed, found, where) {
    const { state } = ed;
    const head = headRange(state.doc, slideStartOf(state.doc, found.pos));
    const size = found.node.nodeSize;
    if ((where === 'front' && found.pos + size === head.to) || (where === 'back' && found.pos === head.from)) return false;
    const tr = own(state.tr.delete(found.pos, found.pos + size));
    const to = tr.mapping.map(where === 'front' ? head.to : head.from, where === 'front' ? -1 : 1);
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
  // La hauteur que demande le texte du cadre à sa largeur d'aujourd'hui, en points : la boîte sans hauteur minimale.
  function naturalHeight(box, zoom) {
    const saved = box.style.minHeight;
    box.style.minHeight = '0';
    const height = box.getBoundingClientRect().height / zoom * PT_PER_PX;
    box.style.minHeight = saved;
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
    const shown = Math.max(start.h, naturalHeight(box, zoom));
    let current = start;
    let moved = false;
    // Le geste ne règle que les mesures ; l'aspect (la sorte, le fond, le trait) suit les mesures à chaque pas : le contour d'une forme se redessine à sa taille du moment.
    const show = measures => paint(dom, Object.assign({}, start, measures));
    function onMove(e) {
      if (!moved) { moved = true; if (toolbar) toolbar.hide(); }
      const dx = (e.clientX - event.clientX) / zoom * PT_PER_PX;
      const dy = (e.clientY - event.clientY) / zoom * PT_PER_PX;
      // La largeur change ce que demande le texte : posée d'abord, elle donne la hauteur du texte qui règle le bord du haut.
      current = gesture(kind, start, dx, dy, shown, 0, page);
      show(current);
      if (kind.indexOf('n') >= 0) { current = gesture(kind, start, dx, dy, shown, naturalHeight(box, zoom), page); show(current); }
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
      const vertical = kind.indexOf('n') >= 0 || kind.indexOf('s') >= 0;
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
  const isEmptyFrame = node => node.childCount === 1 && node.firstChild.type.name === 'paragraph' && node.firstChild.childCount === 0;
  function nodeView({ node: initial, editor: ed, getPos }) {
    let node = initial;
    const dom = el('div', CLASS);
    const box = el('div', BOX);
    const ui = buildUi();
    const content = el('div', CONTENT);
    box.append(ui, content);
    dom.appendChild(box);
    dom.setAttribute('role', 'group');
    // Le nom du cadre dit sa sorte : « Ellipse », « Étoile »... ; « Cadre de texte » sinon.
    const refresh = () => {
      const a = normalized(node.attrs);
      paint(dom, a);
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

  // Le nœud et son extension
  function createNode(Node) {
    return Node.create({
      name: NODE,
      group: 'block',
      content: BODY,
      defining: true,
      isolating: true,
      addAttributes() {
        const out = {};
        Object.keys(DEFAULTS).concat(Object.keys(LOOK)).forEach((key) => {
          out[key] = { default: key in DEFAULTS ? DEFAULTS[key] : LOOK[key], parseHTML: dom => attrsOfEl(dom)[key], renderHTML: () => ({}) };
        });
        return out;
      },
      parseHTML() { return [{ tag: 'div.' + CLASS, priority: 1000, contentElement: '.' + CONTENT }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs)), ['div', { class: BOX }, ['div', { class: CONTENT }, 0]]]; },
      addNodeView() { return nodeView; },
    });
  }
  // Les touches du cadre sélectionné : les flèches le déplacent, Entrée y pose le curseur ; Échap, dans son texte, le sélectionne.
  function handleKeyDown(view, event) {
    const ed = EditorCore.getEditor();
    if (!libs || !ed || !inPresentation() || event.ctrlKey || event.metaKey || event.altKey) return false;
    const { state } = view;
    const selected = selectedFrame(state.selection);
    if (selected && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      const step = event.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
      event.preventDefault();
      nudge(ed, selected, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      return true;
    }
    if (selected && event.key === 'Enter') {
      event.preventDefault();
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
    const colorMenu = (key, noneKey, onPick, onNone) => ColorPalette.createMenu({
      className: 'v2-color-dropdown', noneKey, current: () => (looksOf() || {})[key] || null, onPick, onNone,
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
    const menus = {
      'fill-open': colorMenu('fill', 'frame.noFill', color => applyLook({ fill: color }), () => applyLook({ fill: '' })),
      'line-open': colorMenu('line', 'frame.noLine', color => applyLook(a => ({ line: color, lw: a.lw || SHAPE_LOOK.lw })), () => applyLook({ line: '' })),
      'width-open': widthMenu,
    };
    const markWidth = () => {
      const a = looksOf();
      const now = a && a.line ? a.lw : 0;
      widthMenu.el.querySelectorAll('[data-action]').forEach((row) => {
        const on = Number(row.dataset.action.slice(6)) === now;
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
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur (un clic ailleurs dans la page) est une transaction de plus, mais ne change ni la sélection ni le document : la traiter rouvrirait la barre que le filet de
      // editor-core.js vient de fermer.
      if (transaction && transaction.getMeta('blur')) return;
      const found = ed.isEditable && inPresentation() ? selectedFrame(ed.state.selection) : null;
      const dom = found ? ed.view.nodeDOM(found.pos) : null;
      const box = dom && dom.querySelector ? dom.querySelector('.' + BOX) : null;
      if (box) panel.show(box);
      else {
        panel.hide();
        if (Object.keys(menus).some(name => menus[name] === EditorCore.getOpenDropdownPanel())) EditorCore.closeDropdownPanel();
      }
      const a = box ? normalized(found.node.attrs) : null;
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
    NODE, CLASS, BOX, CONTENT, DEFAULTS, LOOK, SHAPE_LOOK, LIMITS, STAY_ON_PAGE_PT, CASCADE_PT, lineWidthOf,
    configure, createNode, createExtension, wireToolbar, normalized, measuresOf: attrsOfEl, gesture, storedHeight, keepReachable, misplaced, tidyTransaction, headRange, slideStartOf, flowSelection,
    insert, patch, nudge, reorder, duplicate, remove, select, currentFrame, frameAround, syncToolbar,
  };
})();
