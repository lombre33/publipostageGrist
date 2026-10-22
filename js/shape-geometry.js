// Le dessin des formes qu'on pose sur une diapositive (demande du 21/10 à 18:35 : « ajout de forme »). Une forme est un cadre (js/free-frame.js) dont le nœud porte en plus sa sorte, sa
// couleur de fond et son trait ; ce module ne sait que la géométrie, en points, depuis le coin haut gauche de la boîte, et ne touche à aucun élément de la page : l'éditeur (le CSS de
// css/free-frame.css lit ce que le nœud écrit), le PDF (js/pdf-export.js) et le Word (js/docx-export.js) y lisent tous les mêmes contours, si bien qu'une forme se voit pareil
// partout. Le trait est DANS la boîte, comme une bordure CSS : la boîte est l'encre.
//  - Les sortes nomment les formes prédéfinies de PowerPoint (`rect`, `roundRect`, `ellipse`, `triangle`, `diamond`, `rightArrow`, `leftArrow`, `star5`, puis `upArrow`, `downArrow`,
//    `chevron`, `pentagon`, `hexagon`, `parallelogram`, `plus` - la croix -, `wedgeRoundRectCallout` - la bulle) : l'import et l'export PowerPoint les prennent tels quels, et leurs
//    contours et rectangles de texte sont ceux que PowerPoint donne à ces formes (aux réglages d'origine), si bien que le Word les dessine comme l'éditeur. Une sorte inconnue (écrite
//    par une version plus récente) retombe sur le rectangle, jamais sur une erreur. La sorte vide est un cadre de texte (pas une forme).
//  - La BULLE a sa queue DANS la boîte (la boîte est l'encre) : le corps en occupe les huit neuvièmes du haut, la queue le neuvième du bas ; PowerPoint, lui, laisse la queue dépasser du corps
//    (le corps y est la boîte), et le Word reçoit donc le corps seul (js/docx-export.js : `BUBBLE_BODY`).
//  - Le contour d'une forme est un rectangle, un rectangle arrondi, une ellipse, ou un POLYGONE (`outline`). Le rectangle, le rectangle arrondi et l'ellipse se dessinent par le CSS tout
//    seuls (fond, bordure, arrondi) ; un polygone se dessine par `clip-path: polygon(...)` : un calque de fond (le polygone entier) et un calque de trait (l'anneau entre le polygone et lui-même
//    rentré de l'épaisseur du trait, `evenodd`). Les points d'un polygone sont écrits en POURCENTAGES de la boîte : la boîte grandit avec son texte (comme un cadre), la forme la suit.
//  - Les marges du texte (`textInsets`) sont celles que PowerPoint laisse au texte d'une forme : le texte d'une ellipse ne touche pas ses bords, celui d'un losange reste dans son cœur.
//  - La LIGNE (demande du 22/10 : « traits, flèches », sorte `line` de PowerPoint) n'est pas une forme de la grille : une ligne droite entre deux bouts, avec ou sans pointe à chacun. Sa boîte est
//    celle de ses DEUX BOUTS (une ligne horizontale est une boîte de hauteur nulle, comme dans PowerPoint) et non l'encre, qui déborde de la moitié de l'épaisseur du trait et de la largeur des
//    pointes. `flip` dit où est le début : '' en haut à gauche (la fin en bas à droite), 'h' en haut à droite, 'v' en bas à gauche, 'hv' en bas à droite (les `flipH` et `flipV` de PowerPoint) ;
//    `head` est la pointe du début, `tail` celle de la fin (les `headEnd` et `tailEnd` de PowerPoint ; seule la pointe pleine, `triangle`, existe). Le dessin est UN polygone, le corps du trait
//    et ses pointes d'un seul tenant (`lineOutline`) : l'éditeur le découpe dans un calque de la boîte, le PDF le remplit tel quel, le Word reçoit une ligne prédéfinie.
const ShapeGeometry = (function () {
  const TEXT = '';
  // Les sortes proposées, dans l'ordre du menu. L'icône est celle de js/icons.js (`shape<Sorte>`), le nom et l'info-bulle sont dans js/i18n.js (`shape.<sorte>`).
  const KINDS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'leftArrow', 'star5', 'upArrow', 'downArrow', 'chevron', 'pentagon', 'hexagon', 'parallelogram', 'plus', 'wedgeRoundRectCallout'];
  // La taille d'une forme neuve, en points (la page d'une présentation fait 960 × 540).
  const SIZES = {
    rect: [192, 108], roundRect: [192, 108], ellipse: [144, 108], triangle: [120, 108], diamond: [144, 108], rightArrow: [144, 72], leftArrow: [144, 72], star5: [120, 114],
    upArrow: [72, 144], downArrow: [72, 144], chevron: [144, 72], pentagon: [132, 126], hexagon: [144, 112], parallelogram: [168, 84], plus: [96, 96], wedgeRoundRectCallout: [180, 126],
    line: [192, 0],
  };
  const ROUND_RATIO = 1 / 6;       // le coin d'un rectangle arrondi : un sixième du petit côté (16,667 % : la valeur de PowerPoint)
  const ARROW_SHAFT = 0.5;         // la hampe d'une flèche : la moitié de sa hauteur
  const ARROW_HEAD = 0.5;          // la tête d'une flèche : la moitié du petit côté
  const STAR_INNER = (3 - Math.sqrt(5)) / 2;   // le rayon intérieur d'une étoile à cinq branches (0,382), en fraction du rayon extérieur : les pointes tombent sur les mêmes hauteurs
  // Les réglages d'origine des formes de PowerPoint (ses « adj »), en fraction du petit côté `ss` de la boîte sauf mention contraire.
  const CHEVRON_NOTCH = 0.5;       // le chevron : la profondeur de sa pointe et de son creux
  const HEXAGON_NOTCH = 0.25;      // l'hexagone : ce que ses deux pointes (gauche et droite) prennent de chaque côté
  const SLANT = 0.25;              // le parallélogramme : le décalage de ses côtés obliques
  const CROSS_ARM = 0.25;          // la croix : l'épaisseur de ce qui dépasse du carré du milieu, de chaque côté
  const BUBBLE_BODY = 8 / 9;       // la bulle : la part de la boîte que prend son corps (PowerPoint : le corps est la boîte, la queue finit à 1,125 fois sa hauteur)
  const BUBBLE_TAIL_FROM = 1 / 6;  // le début de la queue sur le bas du corps, en fraction de la largeur (2/12)
  const BUBBLE_TAIL_TO = 5 / 12;   // sa fin (5/12)
  const BUBBLE_TIP = 7 / 24;       // sa pointe : au milieu de la queue, sous le premier tiers du corps (0,5 - 0,20833 de la largeur)
  const BUBBLE_ARC_STEPS = 4;      // un coin arrondi de la bulle est tracé par quatre côtés (le quart de cercle, par pas de 22,5 degrés : l'écart au cercle est sous 0,2 point à 18 points de rayon)
  const TEXT_PAD_X_PT = 7.2;       // les marges intérieures par défaut d'un cadre (css/free-frame.css : 3,6 pt en haut et en bas, 7,2 pt de chaque côté)
  const TEXT_PAD_Y_PT = 3.6;
  const MAX_LINE_PT = 36;
  const LINE = 'line';
  const LINE_END = 'triangle';     // la pointe pleine de PowerPoint
  const ARROW_SCALE = 3;           // la pointe d'une ligne : trois fois l'épaisseur du trait en longueur et en largeur (la taille « moyenne » de PowerPoint)...
  const ARROW_BASE_MIN_PT = 2;     // ... pour un trait d'au moins deux points : une pointe ne rétrécit pas sous celle d'un trait de 2 points
  const GRAB_PT = 9;               // la largeur de la bande qu'on saisit à la souris : celle d'un trait fin n'est qu'un fil

  const round = (value, places) => { const k = Math.pow(10, places == null ? 2 : places); return Math.round(value * k) / k; };
  function isKind(kind) { return KINDS.indexOf(kind) >= 0 || kind === LINE; }
  // Une sorte lisible : celle qu'on connaît, sinon le rectangle. La chaîne vide (et tout ce qui n'est pas du texte) est un cadre de texte.
  function kindOf(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === TEXT) return TEXT;
    return isKind(value) ? value : 'rect';
  }
  function defaults(kind) {
    const size = SIZES[kindOf(kind)] || SIZES.rect;
    return { w: size[0], h: size[1] };
  }

  // Des points donnés dans un repère quelconque, étirés pour remplir exactement la boîte de `w` sur `h` (ce que PowerPoint fait de l'étoile et du pentagone : `hf` et `vf`).
  function fitted(raw, w, h) {
    const xs = raw.map(p => p[0]);
    const ys = raw.map(p => p[1]);
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);
    return raw.map(p => [(p[0] - minX) / (maxX - minX) * w, (p[1] - minY) / (maxY - minY) * h]);
  }
  // Les sommets, d'angle -90° (la pointe en haut) de pas `step`, au rayon `radiusOf(i)`.
  const polar = (count, step, radiusOf) => Array.from({ length: count }, (unused, i) => {
    const angle = -Math.PI / 2 + i * step;
    return [Math.cos(angle) * radiusOf(i), Math.sin(angle) * radiusOf(i)];
  });
  const starPoints = (w, h) => fitted(polar(10, Math.PI / 5, i => (i % 2 === 0 ? 1 : STAR_INNER)), w, h);
  const pentagonPoints = (w, h) => fitted(polar(5, Math.PI * 2 / 5, () => 1), w, h);
  const headOf = (w, h) => Math.min(w, Math.min(w, h) * ARROW_HEAD);
  function rightArrowPoints(w, h) {
    const head = headOf(w, h);
    const half = h * ARROW_SHAFT / 2;
    const x = w - head;
    return [[0, h / 2 - half], [x, h / 2 - half], [x, 0], [w, h / 2], [x, h], [x, h / 2 + half], [0, h / 2 + half]];
  }

  // La flèche vers le haut (réglages d'origine : hampe de la moitié de la largeur, tête de la moitié du petit côté) ; celle vers le bas en est le reflet.
  function upArrowPoints(w, h) {
    const head = Math.min(h, Math.min(w, h) * ARROW_HEAD);
    const half = w * ARROW_SHAFT / 2;
    const y = head;
    return [[0, y], [w / 2, 0], [w, y], [w / 2 + half, y], [w / 2 + half, h], [w / 2 - half, h], [w / 2 - half, y]];
  }
  const notchOf = (w, h, part) => Math.min(Math.min(w, h) * part, part === HEXAGON_NOTCH ? w / 2 : w);
  // Le corps de la bulle, en points : le rectangle arrondi des huit neuvièmes du haut de la boîte, sa queue dans le neuvième du bas.
  function bubblePoints(w, h) {
    const body = h * BUBBLE_BODY;
    const radius = Math.min(w, body) * ROUND_RATIO;
    const corner = (cx, cy, from) => Array.from({ length: BUBBLE_ARC_STEPS + 1 }, (unused, i) => {
      const angle = (from + i * 90 / BUBBLE_ARC_STEPS) * Math.PI / 180;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
    return [].concat(
      corner(w - radius, radius, -90),
      corner(w - radius, body - radius, 0),
      [[w * BUBBLE_TAIL_TO, body], [w * BUBBLE_TIP, h], [w * BUBBLE_TAIL_FROM, body]],
      corner(radius, body - radius, 90),
      corner(radius, radius, 180),
    );
  }

  // Le contour de la sorte `kind` dans une boîte de `w` sur `h` points : { type: 'rect' } | { type: 'roundRect', radius } | { type: 'ellipse' } | { type: 'polygon', points }.
  function outline(kind, w, h) {
    switch (kindOf(kind)) {
      case 'ellipse': return { type: 'ellipse' };
      case 'roundRect': return { type: 'roundRect', radius: round(Math.min(w, h) * ROUND_RATIO) };
      case 'triangle': return { type: 'polygon', points: [[w / 2, 0], [w, h], [0, h]] };
      case 'diamond': return { type: 'polygon', points: [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]] };
      case 'rightArrow': return { type: 'polygon', points: rightArrowPoints(w, h) };
      case 'leftArrow': return { type: 'polygon', points: rightArrowPoints(w, h).map(p => [w - p[0], p[1]]) };
      case 'star5': return { type: 'polygon', points: starPoints(w, h) };
      case 'upArrow': return { type: 'polygon', points: upArrowPoints(w, h) };
      case 'downArrow': return { type: 'polygon', points: upArrowPoints(w, h).map(p => [p[0], h - p[1]]) };
      case 'chevron': { const x = notchOf(w, h, CHEVRON_NOTCH); return { type: 'polygon', points: [[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h], [x, h / 2]] }; }
      case 'pentagon': return { type: 'polygon', points: pentagonPoints(w, h) };
      case 'hexagon': { const x = notchOf(w, h, HEXAGON_NOTCH); return { type: 'polygon', points: [[0, h / 2], [x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h]] }; }
      case 'parallelogram': { const x = notchOf(w, h, SLANT); return { type: 'polygon', points: [[0, h], [x, 0], [w, 0], [w - x, h]] }; }
      case 'plus': {
        const x = notchOf(w, h, CROSS_ARM);
        return { type: 'polygon', points: [[0, x], [x, x], [x, 0], [w - x, 0], [w - x, x], [w, x], [w, h - x], [w - x, h - x], [w - x, h], [x, h], [x, h - x], [0, h - x]] };
      }
      case 'wedgeRoundRectCallout': return { type: 'polygon', points: bubblePoints(w, h) };
      default: return { type: 'rect' };
    }
  }

  // Le polygone `points` rentré de `d` points sur tous ses côtés (chaque côté glisse vers l'intérieur de `d`, deux côtés voisins se coupent en un sommet). Rend les sommets dans le même ordre.
  function inset(points, d) {
    const n = points.length;
    if (!n || !(d > 0)) return points.map(p => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      area += a[0] * b[1] - b[0] * a[1];
    }
    // En coordonnées d'écran (y vers le bas), l'aire positive est le sens des aiguilles d'une montre : l'intérieur d'un côté (dx, dy) est à (-dy, dx) ; l'inverse sinon.
    const sign = area >= 0 ? 1 : -1;
    const lines = points.map((a, i) => {
      const b = points[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      return { x: a[0] + sign * -uy * d, y: a[1] + sign * ux * d, ux, uy };
    });
    return points.map((p, i) => {
      const before = lines[(i + n - 1) % n];
      const after = lines[i];
      const cross = before.ux * after.uy - before.uy * after.ux;
      if (Math.abs(cross) < 1e-9) return [after.x, after.y];
      const s = ((after.x - before.x) * after.uy - (after.y - before.y) * after.ux) / cross;
      return [before.x + before.ux * s, before.y + before.uy * s];
    });
  }

  // L'épaisseur du trait qu'une boîte de `w` sur `h` points peut porter : jamais plus du quart de son petit côté (au-delà, l'intérieur d'un polygone se retournerait).
  // Une ligne (`kind` « line ») n'a pas d'intérieur à garder : seul le maximum la borne.
  function lineWidthFor(w, h, wanted, kind) {
    const t = Number.isFinite(wanted) ? wanted : 0;
    if (kind === LINE) return round(Math.max(0, Math.min(t, MAX_LINE_PT)));
    return round(Math.max(0, Math.min(t, MAX_LINE_PT, Math.min(w, h) / 4)));
  }

  // Un polygone en CSS : ses sommets en pourcentages de la boîte (`w` sur `h`).
  const polygonCss = (points, w, h, rule) => 'polygon(' + (rule ? rule + ', ' : '')
    + points.map(p => round(p[0] / w * 100, 3) + '% ' + round(p[1] / h * 100, 3) + '%').join(', ') + ')';

  // Ce que le CSS de la boîte (css/free-frame.css) lit pour dessiner la sorte `kind` à `w` sur `h` points avec un trait de `lineWidth` points :
  //   radius  l'arrondi de la boîte (`0`, `Xpt`, `50%`) ; edge  l'épaisseur de la bordure de la boîte (rectangles et ellipse : la bordure CSS est le trait) ;
  //   clip    le polygone du calque de fond (`none` pour une boîte rectangulaire) ; ring  l'anneau du calque de trait (`none` sans polygone ou sans trait).
  // Un polygone dessine son trait en anneau : sa bordure CSS est donc nulle.
  function look(kind, w, h, lineWidth) {
    const shape = outline(kind, w, h);
    const t = lineWidthFor(w, h, lineWidth);
    if (shape.type === 'polygon') {
      const inner = t ? inset(shape.points, t) : null;
      // Un seul chemin pour deux contours : le contour du dehors, FERMÉ (son premier point repris), puis un pont vers le contour du dedans, fermé de même ; le chemin se referme sur le pont,
      // qui est parcouru dans les deux sens et ne couvre rien. Sans ces deux points repris, le dernier côté de chaque contour manque et le trait s'ouvre sur ce côté.
      return {
        radius: '0', edge: 0, clip: polygonCss(shape.points, w, h),
        ring: inner ? polygonCss(shape.points.concat([shape.points[0]], inner, [inner[0]]), w, h, 'evenodd') : 'none',
      };
    }
    return {
      radius: shape.type === 'ellipse' ? '50%' : shape.type === 'roundRect' ? shape.radius + 'pt' : '0',
      edge: t, clip: 'none', ring: 'none',
    };
  }

  // Le trait à dessiner « au milieu » (comme le fait un PDF ou un Word) pour qu'il tienne dans la boîte : le contour rentré de la moitié de l'épaisseur. Rend le contour, même type.
  function strokeOutline(kind, w, h, lineWidth) {
    const shape = outline(kind, w, h);
    const half = lineWidthFor(w, h, lineWidth) / 2;
    if (shape.type === 'polygon') return { type: 'polygon', points: inset(shape.points, half).map(p => [round(p[0]), round(p[1])]), half };
    return Object.assign({}, shape, { half });
  }

  // Le sens d'une ligne : '', 'h', 'v' ou 'hv' (tout autre texte est lu pour ce qu'il contient : « vh » vaut « hv »).
  function flipOf(raw) {
    const value = typeof raw === 'string' ? raw.toLowerCase() : '';
    return (value.indexOf('h') >= 0 ? 'h' : '') + (value.indexOf('v') >= 0 ? 'v' : '');
  }
  // Une pointe lue : la pointe pleine, ou rien. Un nom que cette version ne connaît pas (écrit par une plus récente : `stealth`, `arrow`...) donne la pointe pleine, la plus proche.
  function endOf(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return value && value !== 'none' ? LINE_END : '';
  }
  // Le début et la fin d'une ligne dans sa boîte de `w` sur `h` points : [x, y] de chacun.
  function lineEnds(w, h, flip) {
    const f = flipOf(flip);
    const atRight = f.indexOf('h') >= 0;
    const atBottom = f.indexOf('v') >= 0;
    return { start: [atRight ? w : 0, atBottom ? h : 0], end: [atRight ? 0 : w, atBottom ? 0 : h] };
  }
  // Le polygone d'une ligne de `w` sur `h` points (la boîte de ses deux bouts) : le corps du trait, de `options.lw` points d'épaisseur, et la pointe pleine à chaque bout qui en a une
  // (`options.head` au début, `options.tail` à la fin), d'un seul tenant. Les points sont dans le repère de la boîte et sortent d'elle (le corps de la moitié de l'épaisseur, les pointes
  // de leur largeur). `options.minWidth` élargit le corps (la bande qu'on saisit à la souris). Une ligne plus courte que ses pointes les rétrécit toutes deux.
  // Rend { points, start, end, bleed } : `bleed`, ce dont le polygone dépasse la boîte, arrondi au point supérieur et un point de plus, que le CSS ajoute autour d'elle.
  function lineOutline(w, h, options) {
    const o = options || {};
    const ends = lineEnds(w, h, o.flip);
    const length = Math.hypot(ends.end[0] - ends.start[0], ends.end[1] - ends.start[1]);
    if (length < 1e-6) return { points: [], start: ends.start, end: ends.end, bleed: 0 };
    const lw = Math.max(0, Number(o.lw) || 0);
    const half = Math.max(lw / 2, (Number(o.minWidth) || 0) / 2);
    const ux = (ends.end[0] - ends.start[0]) / length;
    const uy = (ends.end[1] - ends.start[1]) / length;
    const nx = -uy;
    const ny = ux;
    const size = ARROW_SCALE * Math.max(lw, ARROW_BASE_MIN_PT);
    const wanted = ((o.head ? 1 : 0) + (o.tail ? 1 : 0)) * size;
    const shrink = wanted > length ? length / wanted : 1;
    const long = size * shrink;
    const wing = Math.max(half, size / 2 * shrink);
    const at = (from, along, side) => [from[0] + ux * along + nx * side, from[1] + uy * along + ny * side];
    const start = ends.start;
    const end = ends.end;
    const points = [];
    if (o.head) points.push(at(start, 0, 0), at(start, long, wing), at(start, long, half)); else points.push(at(start, 0, half));
    if (o.tail) points.push(at(end, -long, half), at(end, -long, wing), at(end, 0, 0), at(end, -long, -wing), at(end, -long, -half)); else points.push(at(end, 0, half), at(end, 0, -half));
    if (o.head) points.push(at(start, long, -half), at(start, long, -wing)); else points.push(at(start, 0, -half));
    const rounded = points.map(p => [round(p[0], 3), round(p[1], 3)]);
    const over = rounded.reduce((most, p) => Math.max(most, -p[0], p[0] - w, -p[1], p[1] - h), 0);
    return { points: rounded, start, end, bleed: Math.ceil(over) + 1 };
  }
  // Ce que le CSS de la boîte d'une ligne (css/free-frame.css) lit : `bleed`, le tour que la boîte prend autour de celle des deux bouts ; `clip`, le polygone de l'encre ; `grab`, celui de
  // la bande qu'on saisit (au moins GRAB_PT de large, pointes comprises) ; `start` et `end`, les deux bouts. Tout est en points depuis le coin de la boîte AGRANDIE du tour.
  function lineLook(w, h, options) {
    const ink = lineOutline(w, h, options);
    const grab = lineOutline(w, h, Object.assign({}, options, { minWidth: GRAB_PT }));
    const bleed = Math.max(ink.bleed, grab.bleed);
    const polygon = points => (points.length ? 'polygon(' + points.map(p => round(p[0] + bleed) + 'pt ' + round(p[1] + bleed) + 'pt').join(', ') + ')' : 'none');
    const moved = p => [round(p[0] + bleed), round(p[1] + bleed)];
    return { bleed, clip: polygon(ink.points), grab: polygon(grab.points), start: moved(ink.start), end: moved(ink.end) };
  }

  // Les marges intérieures du texte d'une forme, en points : [haut, droite, bas, gauche]. Celles d'un cadre de texte (kind '') sont les marges par défaut ; `lineWidth` (le trait,
  // dans la boîte) s'y ajoute de chaque côté.
  function textInsets(kind, w, h, lineWidth) {
    const t = lineWidthFor(w, h, lineWidth);
    const base = [TEXT_PAD_Y_PT + t, TEXT_PAD_X_PT + t, TEXT_PAD_Y_PT + t, TEXT_PAD_X_PT + t];
    const grown = (extra) => base.map((value, i) => round(value + extra[i]));
    switch (kindOf(kind)) {
      case TEXT:
      case 'rect': return base.map(value => round(value));
      case 'roundRect': { const r = Math.min(w, h) * ROUND_RATIO * 0.29289; return grown([r, r, r, r]); }
      case 'ellipse': return grown([h * 0.1464, w * 0.1464, h * 0.1464, w * 0.1464]);
      case 'diamond': return grown([h * 0.25, w * 0.25, h * 0.25, w * 0.25]);
      case 'triangle': return grown([h * 0.5, w * 0.25, 0, w * 0.25]);
      case 'rightArrow': return grown([h * (1 - ARROW_SHAFT) / 2, headOf(w, h) * 0.5, h * (1 - ARROW_SHAFT) / 2, 0]);
      case 'leftArrow': return grown([h * (1 - ARROW_SHAFT) / 2, 0, h * (1 - ARROW_SHAFT) / 2, headOf(w, h) * 0.5]);
      case 'star5': return grown([h * 0.34, w * 0.2, h * 0.2, w * 0.2]);
      case 'upArrow': return grown([Math.min(h, Math.min(w, h) * ARROW_HEAD) * 0.5, w * (1 - ARROW_SHAFT) / 2, 0, w * (1 - ARROW_SHAFT) / 2]);
      case 'downArrow': return grown([0, w * (1 - ARROW_SHAFT) / 2, Math.min(h, Math.min(w, h) * ARROW_HEAD) * 0.5, w * (1 - ARROW_SHAFT) / 2]);
      case 'chevron': { const x = notchOf(w, h, CHEVRON_NOTCH); const side = w - 2 * x > 0 ? x : 0; return grown([0, side, 0, side]); }
      case 'pentagon': return grown([h * 0.23607, w * 0.19098, 0, w * 0.19098]);
      case 'hexagon': { const q = Math.min(w, h) / w; return grown([h * (1 + q) / 12, w * (1 + q) / 12, h * (1 + q) / 12, w * (1 + q) / 12]); }
      case 'parallelogram': { const q = (1 + 1.25 * Math.min(w, h) / w) / 12; return grown([h * q, w * q, h * q, w * q]); }
      case 'plus': { const x = notchOf(w, h, CROSS_ARM); return grown([x, x, x, x]); }
      case 'wedgeRoundRectCallout': { const r = Math.min(w, h * BUBBLE_BODY) * ROUND_RATIO * 0.29289; return grown([r, r, r + h * (1 - BUBBLE_BODY), r]); }
      default: return base.map(value => round(value));
    }
  }

  return { KINDS, TEXT, LINE, MAX_LINE_PT, BUBBLE_BODY, GRAB_PT, isKind, kindOf, defaults, outline, inset, look, strokeOutline, lineWidthFor, textInsets, ROUND_RATIO, flipOf, endOf, lineEnds, lineOutline, lineLook };
})();
