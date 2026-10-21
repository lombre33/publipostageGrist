// Le dessin des formes qu'on pose sur une diapositive (demande du 21/10 à 18:35 : « ajout de forme »). Une forme est un cadre (js/free-frame.js) dont le nœud porte en plus sa sorte, sa
// couleur de fond et son trait ; ce module ne sait que la géométrie, en points, depuis le coin haut gauche de la boîte, et ne touche à aucun élément de la page : l'éditeur (le CSS de
// css/free-frame.css lit ce que le nœud écrit), le PDF (js/pdf-export.js) et le Word (js/docx-export.js) y lisent tous les mêmes contours, si bien qu'une forme se voit pareil
// partout. Le trait est DANS la boîte, comme une bordure CSS : la boîte est l'encre.
//  - Les sortes nomment les formes prédéfinies de PowerPoint (`rect`, `roundRect`, `ellipse`, `triangle`, `diamond`, `rightArrow`, `leftArrow`, `star5`) : l'import et l'export PowerPoint les
//    prennent tels quels. Une sorte inconnue (écrite par une version plus récente) retombe sur le rectangle, jamais sur une erreur. La sorte vide est un cadre de texte (pas une forme).
//  - Le contour d'une forme est un rectangle, un rectangle arrondi, une ellipse, ou un POLYGONE (`outline`). Le rectangle, le rectangle arrondi et l'ellipse se dessinent par le CSS tout
//    seuls (fond, bordure, arrondi) ; un polygone se dessine par `clip-path: polygon(...)` : un calque de fond (le polygone entier) et un calque de trait (l'anneau entre le polygone et lui-même
//    rentré de l'épaisseur du trait, `evenodd`). Les points d'un polygone sont écrits en POURCENTAGES de la boîte : la boîte grandit avec son texte (comme un cadre), la forme la suit.
//  - Les marges du texte (`textInsets`) sont celles que PowerPoint laisse au texte d'une forme : le texte d'une ellipse ne touche pas ses bords, celui d'un losange reste dans son cœur.
const ShapeGeometry = (function () {
  const TEXT = '';
  // Les sortes proposées, dans l'ordre du menu. L'icône est celle de js/icons.js (`shape<Sorte>`), le nom et l'info-bulle sont dans js/i18n.js (`shape.<sorte>`).
  const KINDS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'leftArrow', 'star5'];
  // La taille d'une forme neuve, en points (la page d'une présentation fait 960 × 540).
  const SIZES = { rect: [192, 108], roundRect: [192, 108], ellipse: [144, 108], triangle: [120, 108], diamond: [144, 108], rightArrow: [144, 72], leftArrow: [144, 72], star5: [120, 114] };
  const ROUND_RATIO = 1 / 6;       // le coin d'un rectangle arrondi : un sixième du petit côté (16,667 % : la valeur de PowerPoint)
  const ARROW_SHAFT = 0.5;         // la hampe d'une flèche : la moitié de sa hauteur
  const ARROW_HEAD = 0.5;          // la tête d'une flèche : la moitié du petit côté
  const STAR_INNER = (3 - Math.sqrt(5)) / 2;   // le rayon intérieur d'une étoile à cinq branches (0,382), en fraction du rayon extérieur : les pointes tombent sur les mêmes hauteurs
  const TEXT_PAD_X_PT = 7.2;       // les marges intérieures par défaut d'un cadre (css/free-frame.css : 3,6 pt en haut et en bas, 7,2 pt de chaque côté)
  const TEXT_PAD_Y_PT = 3.6;
  const MAX_LINE_PT = 36;

  const round = (value, places) => { const k = Math.pow(10, places == null ? 2 : places); return Math.round(value * k) / k; };
  function isKind(kind) { return KINDS.indexOf(kind) >= 0; }
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

  function starPoints(w, h) {
    const raw = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 1 : STAR_INNER;
      raw.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    const xs = raw.map(p => p[0]);
    const ys = raw.map(p => p[1]);
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);
    return raw.map(p => [(p[0] - minX) / (maxX - minX) * w, (p[1] - minY) / (maxY - minY) * h]);
  }
  const headOf = (w, h) => Math.min(w, Math.min(w, h) * ARROW_HEAD);
  function rightArrowPoints(w, h) {
    const head = headOf(w, h);
    const half = h * ARROW_SHAFT / 2;
    const x = w - head;
    return [[0, h / 2 - half], [x, h / 2 - half], [x, 0], [w, h / 2], [x, h], [x, h / 2 + half], [0, h / 2 + half]];
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
  function lineWidthFor(w, h, wanted) {
    const t = Number.isFinite(wanted) ? wanted : 0;
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
      default: return base.map(value => round(value));
    }
  }

  return { KINDS, TEXT, MAX_LINE_PT, isKind, kindOf, defaults, outline, inset, look, strokeOutline, lineWidthFor, textInsets, ROUND_RATIO };
})();
