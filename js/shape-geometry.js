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
//  - Les FORMES DE LA NORME (chantier 4 « Plus de formes » du plan « Import PowerPoint : ce qui se perd encore », choix du 23/10 : « Toutes à l'import, 40 au menu ») : toute forme prédéfinie de
//    PowerPoint (sauf les lignes et les connecteurs) est une sorte de l'éditeur, calculée par js/shape-presets.js d'après sa définition ; quarante-huit sont rangées par onglets dans le menu (`TABS`,
//    après les seize : le cylindre, le cube, le cœur, le nuage, les flèches courbes, les étoiles, les bulles ovale et de pensée...), les autres arrivent par l'import. Leurs RÉGLAGES (`adj`, les poignées
//    jaunes de PowerPoint) sont gardés ; une des seize dont les réglages ne sont pas ceux d'origine est dessinée de même (`drawnByPresets`). Le dessin est celui de PowerPoint : la géométrie est dans la
//    boîte rentrée de la moitié du trait, qui est à cheval sur son contour (l'encre tient donc dans la boîte, comme pour les seize) ; une forme dont l'encre sort de sa géométrie (la queue d'une bulle, le
//    trait de rappel d'une légende) y est réduite pour que la boîte aille jusqu'au bout de son encre. Le fond (avec les faces éclaircies ou assombries d'un cube, d'un cylindre) et le trait sont deux
//    images SVG (`presetArt`), que le CSS peint étirées à la boîte, chacune avec son opacité.
//  - La LIGNE (demande du 22/10 : « traits, flèches », sorte `line` de PowerPoint) n'est pas une forme de la grille : une ligne droite entre deux bouts, avec ou sans pointe à chacun. Sa boîte est
//    celle de ses DEUX BOUTS (une ligne horizontale est une boîte de hauteur nulle, comme dans PowerPoint) et non l'encre, qui déborde de la moitié de l'épaisseur du trait et de la largeur des
//    pointes. `flip` dit où est le début : '' en haut à gauche (la fin en bas à droite), 'h' en haut à droite, 'v' en bas à gauche, 'hv' en bas à droite (les `flipH` et `flipV` de PowerPoint) ;
//    `head` est la pointe du début, `tail` celle de la fin (les `headEnd` et `tailEnd` de PowerPoint : `type` - le triangle plein, la flèche ouverte, la flèche à encoche, le losange, l'ovale -,
//    `headW` et `headLen` (`w` et `len`) leur largeur et leur longueur, petites, moyennes ou grandes). Le dessin d'une ligne à pointes triangulaires, pleine et simple, est UN polygone, le corps du
//    trait et ses pointes d'un seul tenant (`lineOutline`) : l'éditeur le découpe dans un calque de la boîte, le PDF le remplit tel quel, le Word reçoit une ligne prédéfinie. Toute autre ligne
//    est une image (`lineArt`) : le corps du trait, puis chaque pointe en polygone plein.
const ShapeGeometry = (function () {
  const TEXT = '';
  // Les sortes proposées, dans l'ordre du menu. L'icône est celle de js/icons.js (`shape<Sorte>`), le nom et l'info-bulle sont dans js/i18n.js (`shape.<sorte>`).
  const KINDS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'leftArrow', 'star5', 'upArrow', 'downArrow', 'chevron', 'pentagon', 'hexagon', 'parallelogram', 'plus', 'wedgeRoundRectCallout'];
  // Les onglets du menu, seize formes chacun dans l'ordre du menu : les seize d'avant (« Courantes »), puis les formes de la norme (js/shape-presets.js) : formes de base, flèches, étoiles et bulles.
  // Le nom d'un onglet est `slides.objects.tab.<id>` (js/i18n.js).
  const TABS = [
    { id: 'common', kinds: KINDS },
    { id: 'basic', kinds: ['rtTriangle', 'trapezoid', 'octagon', 'can', 'cube', 'donut', 'noSmoking', 'blockArc', 'pie', 'teardrop', 'frame', 'heart', 'lightningBolt', 'sun', 'moon', 'cloud'] },
    { id: 'arrows', kinds: ['leftRightArrow', 'upDownArrow', 'quadArrow', 'leftRightUpArrow', 'bentArrow', 'uturnArrow', 'leftUpArrow', 'bentUpArrow', 'curvedRightArrow', 'curvedLeftArrow', 'curvedUpArrow',
      'curvedDownArrow', 'stripedRightArrow', 'notchedRightArrow', 'homePlate', 'circularArrow'] },
    { id: 'stars', kinds: ['star4', 'star6', 'star7', 'star8', 'star10', 'star12', 'star16', 'star24', 'star32', 'irregularSeal1', 'irregularSeal2', 'ribbon2', 'wave', 'wedgeRectCallout', 'wedgeEllipseCallout', 'cloudCallout'] },
  ];
  // La taille d'une forme neuve, en points (la page d'une présentation fait 960 × 540).
  const SIZES = {
    rect: [192, 108], roundRect: [192, 108], ellipse: [144, 108], triangle: [120, 108], diamond: [144, 108], rightArrow: [144, 72], leftArrow: [144, 72], star5: [120, 114],
    upArrow: [72, 144], downArrow: [72, 144], chevron: [144, 72], pentagon: [132, 126], hexagon: [144, 112], parallelogram: [168, 84], plus: [96, 96], wedgeRoundRectCallout: [180, 126],
    rtTriangle: [120, 108], trapezoid: [144, 108], octagon: [120, 120], can: [108, 144], cube: [132, 120], donut: [120, 120], noSmoking: [120, 120], blockArc: [144, 144], pie: [120, 120],
    teardrop: [120, 120], frame: [144, 108], heart: [120, 108], lightningBolt: [108, 120], sun: [120, 120], moon: [72, 120], cloud: [168, 108],
    leftRightArrow: [168, 72], upDownArrow: [72, 168], quadArrow: [144, 144], leftRightUpArrow: [168, 108], bentArrow: [120, 120], uturnArrow: [120, 120], leftUpArrow: [120, 120], bentUpArrow: [120, 120],
    curvedRightArrow: [72, 144], curvedLeftArrow: [72, 144], curvedUpArrow: [144, 72], curvedDownArrow: [144, 72], stripedRightArrow: [144, 72], notchedRightArrow: [144, 72], homePlate: [144, 72], circularArrow: [144, 144],
    star4: [108, 108], star6: [120, 108], star7: [120, 114], star8: [120, 120], star10: [126, 120], star12: [120, 120], star16: [120, 120], star24: [120, 120], star32: [120, 120],
    irregularSeal1: [168, 120], irregularSeal2: [168, 120], ribbon2: [192, 84], wave: [168, 96], wedgeRectCallout: [180, 126], wedgeEllipseCallout: [180, 126], cloudCallout: [180, 126],
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
  const LINE_END = 'triangle';     // la pointe pleine de PowerPoint, celle que reçoit un nom de pointe que cette version ne connaît pas
  // Les pointes de PowerPoint (`type` de `a:headEnd` et `a:tailEnd`), dans l'ordre du menu : le triangle plein, la flèche ouverte (`arrow`, deux traits en V), la flèche à encoche (`stealth`), le losange et l'ovale (ces
  // deux-là centrés sur le bout de la ligne, les autres posés pointe sur le bout) ; et leurs tailles (`w`, `len`), petite, moyenne et grande.
  const END_TYPES = ['triangle', 'arrow', 'stealth', 'diamond', 'oval'];
  const END_SIZES = ['sm', 'med', 'lg'];
  // La largeur et la longueur d'une pointe, en épaisseurs du trait (celles de PowerPoint, qui compte d'au moins deux points un trait plus fin : une pointe ne rétrécit pas sous celle d'un trait de 2 points). La
  // taille moyenne est celle d'avant (trois fois l'épaisseur) ; la flèche ouverte, dessinée en traits, est plus grande à taille égale.
  const END_FACTORS = { sm: 2, med: 3, lg: 5 };
  const OPEN_END_FACTORS = { sm: 3.5, med: 4.5, lg: 6 };
  const ARROW_BASE_MIN_PT = 2;
  const STEALTH_NOTCH = 0.6;       // l'encoche de la flèche à encoche : à six dixièmes de sa longueur depuis la pointe
  const OVAL_STEPS = 40;           // l'ovale est un polygone de quarante côtés (l'écart au cercle est de 0,3 point à 90 points de rayon)
  const GRAB_PT = 9;               // la largeur de la bande qu'on saisit à la souris : celle d'un trait fin n'est qu'un fil

  const round = (value, places) => { const k = Math.pow(10, places == null ? 2 : places); return Math.round(value * k) / k; };
  // Les formes de la norme qui sont des lignes (les connecteurs) : l'import en fait des lignes (sorte `line`), jamais un cadre.
  const LINE_PRESETS = /^(line|lineInv|straightConnector1|bentConnector[2-5]|curvedConnector[2-5])$/;
  const GEO_TOLERANCE_PT = 0.05;   // l'écart permis entre une géométrie retenue (`geo`) et le cadre qu'elle doit remplir : ses mesures sont au centième de point
  // Une forme de la norme que l'éditeur dessine par js/shape-presets.js : toute forme prédéfinie de PowerPoint (celles des onglets du menu, et les autres que l'import reprend) sauf les seize et les lignes.
  const isPreset = kind => typeof kind === 'string' && KINDS.indexOf(kind) < 0 && !LINE_PRESETS.test(kind) && typeof ShapePresets === 'object' && ShapePresets.has(kind);
  // Une forme que js/shape-presets.js dessine : une forme de la norme, ou l'une des seize dont les réglages (`adj` : les poignées jaunes de PowerPoint) ne sont pas ceux d'origine - une flèche à
  // tête plus longue, un rectangle aux coins plus arrondis, une bulle à la queue ailleurs. Les seize aux réglages d'origine gardent leur dessin d'avant.
  const drawnByPresets = (kind, adj) => isPreset(kind) || (KINDS.indexOf(kind) >= 0 && typeof ShapePresets === 'object' && ShapePresets.adjText(kind, adj) !== '');
  function isKind(kind) { return KINDS.indexOf(kind) >= 0 || isPreset(kind) || kind === LINE; }
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

  // Le contour de la sorte `kind` dans une boîte de `w` sur `h` points : { type: 'rect' } | { type: 'roundRect', radius } | { type: 'ellipse' } | { type: 'polygon', points } | { type: 'preset' }
  // (une forme de la norme : ses chemins sont ceux de `presetLayout`).
  function outline(kind, w, h) {
    if (isPreset(kind)) return { type: 'preset' };
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
  //   clip    le polygone du calque de fond (`none` pour une boîte rectangulaire) ; ring  l'anneau du calque de trait (`none` sans polygone ou sans trait) ;
  //   fillInset, fillRadius  de combien le fond rentre dans la boîte (en points) et l'arrondi qu'il y prend : rien (0) tant que le trait est plein.
  // Un polygone dessine son trait en anneau : sa bordure CSS est donc nulle. `fillInset` (la moitié de l'épaisseur du trait, quand ce trait est translucide) arrête le fond au MILIEU du trait,
  // comme PowerPoint, le PDF et l'export PowerPoint le font : le trait translucide ne se mêle alors au fond que sur sa moitié intérieure, sa moitié extérieure est sur le papier. Un trait plein
  // cache le fond de toute façon : le fond y garde toute la boîte, et rien ne change pour les formes d'avant. `drawn` : le trait est dessiné par une image (`strokeArt` : tirets, pointillés),
  // la boîte n'a donc ni bordure ni anneau.
  function look(kind, w, h, lineWidth, fillInset, drawn) {
    const shape = outline(kind, w, h);
    // Une forme de la norme n'a ni bordure, ni polygone, ni anneau : son fond et son trait sont ses deux images (`presetArt`).
    if (shape.type === 'preset') return { radius: '0', edge: 0, clip: 'none', ring: 'none', fillInset: 0, fillRadius: '0' };
    const t = lineWidthFor(w, h, lineWidth);
    const under = t && fillInset > 0 ? round(Math.min(fillInset, t)) : 0;
    if (shape.type === 'polygon') {
      const inner = t && !drawn ? inset(shape.points, t) : null;
      // Un seul chemin pour deux contours : le contour du dehors, FERMÉ (son premier point repris), puis un pont vers le contour du dedans, fermé de même ; le chemin se referme sur le pont,
      // qui est parcouru dans les deux sens et ne couvre rien. Sans ces deux points repris, le dernier côté de chaque contour manque et le trait s'ouvre sur ce côté.
      return {
        radius: '0', edge: 0, clip: polygonCss(under ? inset(shape.points, under) : shape.points, w, h),
        ring: inner ? polygonCss(shape.points.concat([shape.points[0]], inner, [inner[0]]), w, h, 'evenodd') : 'none',
        fillInset: 0, fillRadius: '0',
      };
    }
    return {
      radius: shape.type === 'ellipse' ? '50%' : shape.type === 'roundRect' ? shape.radius + 'pt' : '0',
      edge: drawn ? 0 : t, clip: 'none', ring: 'none',
      fillInset: under,
      fillRadius: shape.type === 'ellipse' ? '50%' : shape.type === 'roundRect' ? round(Math.max(0, shape.radius - under)) + 'pt' : '0',
    };
  }

  // Le contour de la sorte `kind` rentré de `half` points (`half` : la distance du bord de la boîte au milieu du trait qu'on y dessine). Rend le contour, même type, avec `half`.
  function outlineInset(kind, w, h, half) {
    const shape = outline(kind, w, h);
    if (shape.type === 'polygon') return { type: 'polygon', points: inset(shape.points, half).map(p => [round(p[0]), round(p[1])]), half };
    return Object.assign({}, shape, { half });
  }
  // Le trait à dessiner « au milieu » (comme le fait un PDF ou un Word) pour qu'il tienne dans la boîte : le contour rentré de la moitié de l'épaisseur. Rend le contour, même type.
  function strokeOutline(kind, w, h, lineWidth) {
    return outlineInset(kind, w, h, lineWidthFor(w, h, lineWidth) / 2);
  }

  // Le sens d'une ligne : '', 'h', 'v' ou 'hv' (tout autre texte est lu pour ce qu'il contient : « vh » vaut « hv »).
  function flipOf(raw) {
    const value = typeof raw === 'string' ? raw.toLowerCase() : '';
    return (value.indexOf('h') >= 0 ? 'h' : '') + (value.indexOf('v') >= 0 ? 'v' : '');
  }
  // Une pointe lue : le nom d'une pointe de PowerPoint (sans tenir compte de la casse), ou '' (aucune pointe : le vide et `none`). Un nom que cette version ne connaît pas (écrit par une plus récente)
  // donne la pointe pleine, la plus proche.
  function endOf(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!value || value === 'none') return '';
    return END_TYPES.find(name => name.toLowerCase() === value) || LINE_END;
  }
  // La largeur ou la longueur d'une pointe lue : 'sm' (petite) ou 'lg' (grande), '' pour la moyenne (`med`, la taille d'origine, et tout texte inconnu : jamais une erreur).
  function endSizeOf(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return value === 'sm' || value === 'lg' ? value : '';
  }
  // Le début et la fin d'une ligne dans sa boîte de `w` sur `h` points : [x, y] de chacun.
  function lineEnds(w, h, flip) {
    const f = flipOf(flip);
    const atRight = f.indexOf('h') >= 0;
    const atBottom = f.indexOf('v') >= 0;
    return { start: [atRight ? w : 0, atBottom ? h : 0], end: [atRight ? 0 : w, atBottom ? 0 : h] };
  }
  // La pointe `type` de `long` de long et `wide` de large (déjà rétrécies si la ligne est courte), sur un trait de `lw` points : { points, attach, reach }. `points` est son polygone plein dans le repère de la pointe,
  // [x, y] : x en reculant depuis la pointe vers le corps de la ligne (le losange et l'ovale sont centrés sur le bout de la ligne : leur avant est en x négatif), y de côté. `attach` est l'endroit où le corps du
  // trait la rejoint, en reculant depuis le bout de la ligne : il s'arrête là ; `reach` ce qu'elle prend de la longueur de la ligne.
  function endShape(type, long, wide, lw) {
    const half = wide / 2;
    switch (type) {
      case 'stealth': return { points: [[0, 0], [long, half], [long * STEALTH_NOTCH, 0], [long, -half]], attach: long * STEALTH_NOTCH, reach: long };
      case 'arrow': {
        // La flèche ouverte est faite de deux traits en V de l'épaisseur du trait : le triangle de la pointe moins un triangle rentré de cette épaisseur ; le corps du trait la rejoint au creux du V.
        const slope = half / long;
        const notch = Math.min(lw * Math.sqrt(1 + slope * slope) / slope, long * 0.95);
        const rise = (long - notch) * slope;
        return { points: [[0, 0], [long, half], [long, rise], [notch, 0], [long, -rise], [long, -half]], attach: notch, reach: long };
      }
      case 'diamond': return { points: [[-long / 2, 0], [0, half], [long / 2, 0], [0, -half]], attach: long / 2, reach: long / 2 };
      case 'oval': return { points: Array.from({ length: OVAL_STEPS }, (unused, i) => [-Math.cos(2 * Math.PI * i / OVAL_STEPS) * long / 2, Math.sin(2 * Math.PI * i / OVAL_STEPS) * half]), attach: long / 2, reach: long / 2 };
      default: return { points: [[0, 0], [long, half], [long, -half]], attach: long, reach: long };
    }
  }
  // La pointe `type` (de largeur `widthSize` et de longueur `lengthSize` : 'sm', 'med' ou 'lg') d'un trait de `lw` points, pour qui la dessine à part du corps (un connecteur coudé ou courbe repris d'un
  // fichier PowerPoint, dont la pointe fait partie de la forme) : { type, long, wide, points, attach, reach } comme `endShape`, aux mesures de `lineBasis` ; null sans pointe.
  function endPolygon(type, widthSize, lengthSize, lw) {
    const kind = endOf(type);
    if (!kind) return null;
    const base = Math.max(Number(lw) || 0, ARROW_BASE_MIN_PT);
    const factors = kind === 'arrow' ? OPEN_END_FACTORS : END_FACTORS;
    const long = factors[endSizeOf(lengthSize) || 'med'] * base;
    const wide = Math.max(factors[endSizeOf(widthSize) || 'med'] * base, Number(lw) || 0);
    return Object.assign({ type: kind, long, wide }, endShape(kind, long, wide, Number(lw) || 0));
  }
  // La silhouette d'une pointe jointe à un corps de demi-épaisseur `half` (`lineOutline`), dans le repère de `endShape` : du bord `+half` du corps, par l'avant de la pointe, au bord `-half` ; `wing` est sa demi-largeur
  // (au moins celle du corps). Le triangle, la flèche ouverte et la flèche à encoche y sont leur triangle (la bande qu'on saisit à la souris les contient), le losange et l'ovale leur contour exact.
  function endCap(shape, wing, half) {
    switch (shape.type) {
      case 'diamond': {
        const join = shape.long / 2 * (1 - half / wing);
        return [[join, half], [0, wing], [-shape.long / 2, 0], [0, -wing], [join, -half]];
      }
      case 'oval': {
        const from = Math.asin(Math.min(1, half / wing));
        return Array.from({ length: OVAL_STEPS + 1 }, (unused, i) => {
          const angle = from + (2 * Math.PI - 2 * from) * i / OVAL_STEPS;
          return [shape.long / 2 * Math.cos(angle), wing * Math.sin(angle)];
        });
      }
      default: return [[shape.long, half], [shape.long, wing], [0, 0], [shape.long, -wing], [shape.long, -half]];
    }
  }
  // Les mesures que le polygone d'une ligne (`lineOutline`) et son tracé en pièces (`lineParts`, `lineArt`) partagent : ses deux bouts, la longueur de la ligne (nulle : rien à dessiner), l'épaisseur du trait, la
  // pointe du début et celle de la fin (`head`, `tail` : { type, long, wide, points, attach, reach } ou null) et `at(from, along, side)`, le point à `along` du bout `from` le long de la ligne et à `side` d'elle.
  // La largeur d'une pointe est celle du trait multipliée par la taille voulue (`o.headW`, `o.headLen`, `o.tailW`, `o.tailLen`), d'au moins deux points d'épaisseur ; une ligne plus courte que ses pointes les
  // rétrécit toutes deux dans les mêmes proportions. `options.minWidth` élargit le corps (la bande qu'on saisit à la souris).
  function lineBasis(w, h, o) {
    const ends = lineEnds(w, h, o.flip);
    const length = Math.hypot(ends.end[0] - ends.start[0], ends.end[1] - ends.start[1]);
    if (length < 1e-6) return { ends, length: 0 };
    const lw = Math.max(0, Number(o.lw) || 0);
    const half = Math.max(lw / 2, (Number(o.minWidth) || 0) / 2);
    const ux = (ends.end[0] - ends.start[0]) / length;
    const uy = (ends.end[1] - ends.start[1]) / length;
    const nx = -uy;
    const ny = ux;
    const base = Math.max(lw, ARROW_BASE_MIN_PT);
    const asked = ['head', 'tail'].map((name) => {
      const type = endOf(o[name]);
      if (!type) return null;
      const factors = type === 'arrow' ? OPEN_END_FACTORS : END_FACTORS;
      return { type, wide: factors[endSizeOf(o[name + 'W']) || 'med'] * base, long: factors[endSizeOf(o[name + 'Len']) || 'med'] * base };
    });
    const needed = asked.reduce((sum, spec) => sum + (spec ? endShape(spec.type, spec.long, spec.wide, lw).reach : 0), 0);
    const shrink = needed > length ? length / needed : 1;
    // Une pointe n'est jamais plus étroite que le corps du trait (ni que la bande qu'on saisit à la souris), même rétrécie.
    const [head, tail] = asked.map((spec) => {
      if (!spec) return null;
      const long = spec.long * shrink;
      const wide = Math.max(spec.wide * shrink, 2 * half);
      return Object.assign({ type: spec.type, long, wide }, endShape(spec.type, long, wide, lw));
    });
    const at = (from, along, side) => [from[0] + ux * along + nx * side, from[1] + uy * along + ny * side];
    return { ends, length, lw, half, head, tail, at };
  }
  // Le polygone d'une ligne de `w` sur `h` points (la boîte de ses deux bouts) : le corps du trait, de `options.lw` points d'épaisseur, et la pointe de chaque bout qui en a une (`options.head` au début,
  // `options.tail` à la fin ; leurs tailles `headW`, `headLen`, `tailW`, `tailLen`), d'un seul tenant. Les points sont dans le repère de la boîte et sortent d'elle (le corps de la moitié de l'épaisseur, les
  // pointes de leur largeur). Le triangle y est exact, ainsi que le losange et l'ovale ; la flèche ouverte et la flèche à encoche y sont leur triangle (une enveloppe : leur encre est l'image de `lineArt`).
  // `options.minWidth` élargit le corps (la bande qu'on saisit à la souris). Une ligne plus courte que ses pointes les rétrécit toutes deux.
  // Rend { points, start, end, bleed } : `bleed`, ce dont le polygone dépasse la boîte, arrondi au point supérieur et un point de plus, que le CSS ajoute autour d'elle.
  function lineOutline(w, h, options) {
    const o = options || {};
    const basis = lineBasis(w, h, o);
    const { ends, half, head, tail, at } = basis;
    if (!basis.length) return { points: [], start: ends.start, end: ends.end, bleed: 0 };
    const cap = shape => (shape ? endCap(shape, Math.max(half, shape.wide / 2), half) : [[0, half], [0, -half]]);
    // Le contour part de l'avant de la pointe du début (ou du bord `+half` de son bout), suit la fin de la ligne puis revient par l'autre bord : l'ordre des sommets d'une ligne à pointes triangulaires est celui d'avant.
    const tailCap = cap(tail).map(p => at(ends.end, -p[0], p[1]));
    const headBack = cap(head).slice().reverse();
    const first = headBack.filter(p => p[1] < 0).length;
    const headCap = headBack.map(p => at(ends.start, p[0], p[1]));
    const points = headCap.slice(first).concat(tailCap, headCap.slice(0, first));
    const rounded = points.map(p => [round(p[0], 3), round(p[1], 3)]);
    const over = rounded.reduce((most, p) => Math.max(most, -p[0], p[0] - w, -p[1], p[1] - h), 0);
    return { points: rounded, start: ends.start, end: ends.end, bleed: Math.ceil(over) + 1 };
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

  // --- Le style du trait : tirets, pointillés et bouts ----------------------------------------------------------------------------------------------------------------------------------
  // Les tirets prédéfinis de PowerPoint (`a:prstDash`, dont les noms sont ceux de la valeur) : des couples (trait, vide), en LARGEURS DE TRAIT, que le trait répète d'un bout à l'autre. Dans l'ordre du menu.
  const DASH_PRESETS = {
    sysDot: [[1, 1]], dot: [[1, 3]], sysDash: [[3, 1]], dash: [[4, 3]], lgDash: [[8, 3]],
    sysDashDot: [[3, 1], [1, 1]], dashDot: [[4, 3], [1, 3]], lgDashDot: [[8, 3], [1, 3]],
    sysDashDotDot: [[3, 1], [1, 1], [1, 1]], lgDashDotDot: [[8, 3], [1, 3], [1, 3]],
  };
  const DASHES = Object.keys(DASH_PRESETS);
  const DASH_MAX_PAIRS = 8;        // une liste que PowerPoint n'a pas nommée (`a:custDash`, écrite par un autre logiciel) : huit couples au plus, chacun de 0,01 à 100 largeurs de trait
  const DASH_UNIT_MIN = 0.01;
  const DASH_UNIT_MAX = 100;
  const DASH_DOT_PT = 0.01;        // le corps d'un point à bout rond n'a plus de longueur : le bout fait le point (un trait de longueur nulle est refusé par pdfmake)
  const PX_PER_PT = 4 / 3;
  const unitText = n => String(round(n, 2));
  const samePairs = (a, b) => a.length === b.length && a.every((pair, i) => pair[0] === b[i][0] && pair[1] === b[i][1]);
  // Un tiret lu : '' (trait plein), le nom d'un tiret prédéfini (sans tenir compte de la casse) ou la liste de couples « trait:vide » séparés par une espace (« 5:2 1:2 »), ramenée à sa forme canonique
  // (un nom si la liste est celle d'un tiret prédéfini). Tout autre texte (une liste illisible, trop longue ou aux mesures absurdes) donne '' : le trait reste plein, jamais une erreur.
  function dashOf(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || value.toLowerCase() === 'solid') return '';
    const named = DASHES.find(name => name.toLowerCase() === value.toLowerCase());
    if (named) return named;
    const parts = value.split(/\s+/);
    if (parts.length > DASH_MAX_PAIRS) return '';
    const pairs = [];
    for (const part of parts) {
      const found = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(part);
      if (!found) return '';
      const on = round(Number(found[1]), 2);
      const off = round(Number(found[2]), 2);
      if (!(on >= DASH_UNIT_MIN && on <= DASH_UNIT_MAX && off >= DASH_UNIT_MIN && off <= DASH_UNIT_MAX)) return '';
      pairs.push([on, off]);
    }
    return DASHES.find(name => samePairs(DASH_PRESETS[name], pairs)) || pairs.map(pair => unitText(pair[0]) + ':' + unitText(pair[1])).join(' ');
  }
  // Les couples (trait, vide) d'un tiret, en largeurs de trait ; null pour un trait plein.
  function dashPairs(raw) {
    const value = dashOf(raw);
    if (!value) return null;
    return (DASH_PRESETS[value] || value.split(' ').map(part => part.split(':').map(Number))).map(pair => pair.slice());
  }
  // Un bout lu : '' (plat), 'round' ou 'square' (le `cap` de PowerPoint : `rnd`, `sq`, `flat`).
  function capOf(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return value === 'round' || value === 'rnd' ? 'round' : value === 'square' || value === 'sq' ? 'square' : '';
  }
  // Les longueurs (trait, vide, trait, vide...) d'un trait de `lineWidth` points, telles que SVG et PDF les veulent (`stroke-dasharray`, `dash`) ; null pour un trait plein. Un bout rond ou carré rallonge
  // chaque trait d'une demi-épaisseur de chaque côté : le trait est rogné d'une épaisseur (jamais sous un point) et le vide l'a de plus, si bien que la période du motif et la longueur visible du
  // trait sont celles de PowerPoint. `bandWidth` : l'épaisseur de la bande qu'on dessine, quand elle n'est que d'une partie du trait (un trait composé : les motifs restent ceux du trait entier,
  // seul le bout est celui de la bande).
  function dashArray(dash, lineWidth, cap, bandWidth) {
    const pairs = dashPairs(dash);
    const t = Number(lineWidth);
    if (!pairs || !(t > 0)) return null;
    const extra = capOf(cap) ? (bandWidth > 0 ? Number(bandWidth) : t) : 0;
    return [].concat(...pairs.map((pair) => {
      const on = Math.max(pair[0] * t - extra, DASH_DOT_PT);
      return [round(on, 3), round((pair[0] + pair[1]) * t - on, 3)];
    }));
  }
  // Où le motif commence, en points dans sa période (la « phase » d'un tiret PDF) : 0 pour un bout plat ; avec un bout rond ou carré le motif commence une demi-épaisseur plus loin (voir `shiftAttr`).
  function dashPhase(dash, lineWidth, cap, bandWidth) {
    const array = dashArray(dash, lineWidth, cap, bandWidth);
    if (!array || !capOf(cap)) return 0;
    const period = array.reduce((sum, n) => sum + n, 0);
    const width = bandWidth > 0 ? Number(bandWidth) : lineWidth;
    return round((((-width / 2) % period) + period) % period, 3);
  }
  // Le tiret pour DrawingML (`a:prstDash`, `a:custDash`) : { preset } ou { custom: [{ d, sp }] } (en millièmes de pour cent de la largeur du trait : quatre largeurs valent 400 000) ; null pour un trait plein.
  function dashDrawingMl(dash) {
    const value = dashOf(dash);
    if (!value) return null;
    if (DASH_PRESETS[value]) return { preset: value };
    return { custom: dashPairs(value).map(pair => ({ d: Math.round(pair[0] * 100000), sp: Math.round(pair[1] * 100000) })) };
  }

  // Le trait COMPOSÉ (`cmpd` de `a:ln` : double, fin-épais, épais-fin, triple) : plusieurs bandes parallèles dont l'ensemble fait l'épaisseur du trait. PowerPoint ne documente pas leurs proportions :
  // un trait fin, un vide et un trait épais valent une, une et deux parts (le double, trois tiers égaux). Les bandes sont données du bord extérieur du trait vers l'intérieur (le premier trait d'une forme est
  // dehors, celui d'une ligne du côté gauche de son sens, dans le repère de la boîte), en fractions de l'épaisseur : [début, fin]. Le trait simple (`sng`) est ''.
  const COMPOUND_BANDS = {
    dbl: [[0, 1 / 3], [2 / 3, 1]],
    thinThick: [[0, 1 / 4], [1 / 2, 1]],
    thickThin: [[0, 1 / 2], [3 / 4, 1]],
    tri: [[0, 1 / 6], [1 / 3, 2 / 3], [5 / 6, 1]],
  };
  const COMPOUNDS = Object.keys(COMPOUND_BANDS);
  // Un trait composé lu : le nom de PowerPoint (sans tenir compte de la casse) ou '' (le trait simple, `sng`, et tout nom inconnu : jamais une erreur).
  function cmpdOf(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return COMPOUNDS.find(name => name.toLowerCase() === value) || '';
  }
  // Les bandes d'un trait composé de `lineWidth` points : [{ center, width }], `center` étant la distance de la bande au bord extérieur du trait (son milieu), `width` son épaisseur ; null pour un trait simple.
  function compoundBands(cmpd, lineWidth) {
    const bands = COMPOUND_BANDS[cmpdOf(cmpd)];
    const t = Number(lineWidth);
    if (!bands || !(t > 0)) return null;
    return bands.map(([from, to]) => ({ center: round((from + to) / 2 * t, 3), width: round((to - from) * t, 3) }));
  }

  // Le TRAIT D'ART : un trait en tirets, en pointillés, à bouts arrondis ou composé ne se dessine pas par une bordure CSS (ses tirets seraient ceux du navigateur) mais par une image SVG que le nœud écrit dans
  // une variable (`--ff-art`, `--ff-art-nine` : js/free-frame.js) et que la feuille de style peint : la Lecture, le diaporama, l'impression et les miniatures la montrent sans script. L'image est
  // un SVG à guillemets simples, de la taille de la boîte en points (viewBox), qui ne contient que des `path` aux attributs que l'assainissement du HTML (js/html-sanitize.js : `isSafeArt`) reconnaît.
  const unit = n => String(round(n, 3));
  const artUrl = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '")';
  const artSvg = (w, h, body) => "<svg xmlns='http://www.w3.org/2000/svg' width='" + unit(w * PX_PER_PT) + "' height='" + unit(h * PX_PER_PT) + "' viewBox='0 0 " + unit(w) + ' ' + unit(h)
    + "' preserveAspectRatio='none'>" + body + '</svg>';
  const capAttr = cap => (capOf(cap) ? " stroke-linecap='" + capOf(cap) + "'" : '');
  // Avec un bout rond ou carré, le premier trait du motif commence une demi-épaisseur plus loin : son bout, qui dépasse d'autant, tombe alors sur l'extrémité du chemin (le premier point d'une ligne en
  // pointillés ronds est donc tangent à son début, comme dans PowerPoint).
  const shiftAttr = (cap, t) => (capOf(cap) ? " stroke-dashoffset='" + unit(-t / 2) + "'" : '');
  // Le chemin du trait d'une boîte de `w` sur `h` points : le contour de la forme rentré de la moitié de l'épaisseur (comme le trait du PDF), parcouru dans le sens des aiguilles d'une montre
  // depuis le coin haut gauche (le milieu du côté gauche pour l'ellipse).
  function strokePath(shape, w, h) {
    const half = shape.half;
    const n = unit;
    switch (shape.type) {
      case 'polygon': return 'M' + shape.points.map(p => n(p[0]) + ' ' + n(p[1])).join('L') + 'Z';
      case 'ellipse': {
        const rx = n(Math.max(0.1, w / 2 - half));
        const ry = n(Math.max(0.1, h / 2 - half));
        return 'M' + n(half) + ' ' + n(h / 2) + 'A' + rx + ' ' + ry + ' 0 0 1 ' + n(w - half) + ' ' + n(h / 2) + 'A' + rx + ' ' + ry + ' 0 0 1 ' + n(half) + ' ' + n(h / 2) + 'Z';
      }
      case 'roundRect': {
        const r = Math.max(0, shape.radius - half);
        if (r > 0) {
          const arc = ' ' + n(r) + ' ' + n(r) + ' 0 0 1 ';
          return 'M' + n(half + r) + ' ' + n(half) + 'H' + n(w - half - r) + 'A' + arc + n(w - half) + ' ' + n(half + r) + 'V' + n(h - half - r) + 'A' + arc + n(w - half - r) + ' ' + n(h - half)
            + 'H' + n(half + r) + 'A' + arc + n(half) + ' ' + n(h - half - r) + 'V' + n(half + r) + 'A' + arc + n(half + r) + ' ' + n(half) + 'Z';
        }
        return 'M' + n(half) + ' ' + n(half) + 'H' + n(w - half) + 'V' + n(h - half) + 'H' + n(half) + 'Z';
      }
      default: return 'M' + n(half) + ' ' + n(half) + 'H' + n(w - half) + 'V' + n(h - half) + 'H' + n(half) + 'Z';
    }
  }
  // Le trait en tirets ou composé d'une forme ou d'un cadre de texte (`kind`, boîte de `w` sur `h` points ; `o` : { lw, color (#rrggbb), dash, cap, cmpd }) : { url, edge, slice } ou null (trait plein et
  // simple, ou rien à dessiner). `url` est l'image (`url("data:...")`) : un chemin par bande du trait (une seule pour un trait simple), chacune rentrée du milieu de sa bande. Un rectangle, un rectangle
  // arrondi ou un cadre de texte la peint en BORDURE IMAGE à neuf cases (`slice` : les coupes en pourcentages de l'image, `edge` : l'épaisseur de la bordure, en points) : la boîte grandit avec son texte, les
  // coins et l'épaisseur du trait gardent leur taille et seuls les tirets des côtés s'allongent. Les autres formes (`slice` vide) sont peintes étirées à la boîte, comme les anneaux de leurs traits pleins.
  function strokeArt(kind, w, h, o) {
    const t = lineWidthFor(w, h, o.lw, kind);
    const bands = compoundBands(o.cmpd, t);
    if ((!dashArray(o.dash, t, o.cap) && !bands) || !o.color) return null;
    const paths = (bands || [{ center: t / 2, width: t }]).map((band) => {
      const dashes = dashArray(o.dash, t, o.cap, band.width);
      return "<path d='" + strokePath(outlineInset(kind, w, h, band.center), w, h) + "' fill='none' stroke='" + o.color + "' stroke-width='" + unit(band.width) + "'" + (dashes ? capAttr(o.cap) : '')
        + " stroke-linejoin='miter' stroke-miterlimit='8'" + (dashes ? " stroke-dasharray='" + dashes.map(unit).join(' ') + "'" + shiftAttr(o.cap, band.width) : '') + '/>';
    });
    const shape = outline(kind, w, h);
    const straight = shape.type === 'rect' || shape.type === 'roundRect';
    const edge = straight ? Math.max(t, shape.type === 'roundRect' ? shape.radius : 0) : 0;
    return { url: artUrl(artSvg(w, h, paths.join(''))), edge, slice: edge ? unit(edge / h * 100) + '% ' + unit(edge / w * 100) + '%' : '' };
  }

  // --- Les formes de la norme (js/shape-presets.js) ------------------------------------------------------------------------------------------------------------------------------------------
  // La boîte de la géométrie d'une forme de la norme dans un cadre de `w` sur `h` points (`o` : { lw, adj, cap, geo } : le trait, 0 sans trait, ses réglages, son bout et la géométrie retenue) :
  // réduite et décalée pour que tout ce que la forme couvre tienne dans le cadre (ShapePresets.fit : la moitié du trait à cheval sur le contour, les pointes de ses coins, la queue d'une bulle).
  // { x, y, w, h }, en points depuis le coin du cadre. Le cadre ne la dit pas toujours seul : une forme dont l'encre ne suit pas la boîte (la barre oblique de « Différent »), un coin dont l'onglet
  // devient biseau entre deux tailles voisines, ont deux géométries qui remplissent le même cadre. L'import de PowerPoint écrit alors celle du fichier (`geo` : « x y w h ») ; elle est prise telle
  // quelle tant qu'elle remplit exactement le cadre avec ce trait : un cadre retaillé ou un trait changé la font oublier, la forme se recalcule.
  const presetBoxes = new Map();
  function presetBox(kind, w, h, o) {
    const opts = o || {};
    const t = opts.lw || 0;
    const cap = capOf(opts.cap);
    const key = [kind, w, h, t, ShapePresets.adjText(kind, opts.adj), cap, opts.geo || ''].join('|');
    let box = presetBoxes.get(key);
    if (!box) {
      if (presetBoxes.size >= 256) presetBoxes.clear();
      const kept = geoOf(opts.geo);
      const all = kept ? ShapePresets.reach(kind, kept.w, kept.h, opts.adj, t, cap) : null;
      box = all && Math.max(Math.abs(kept.x + all[0]), Math.abs(kept.y + all[1]), Math.abs(kept.x + all[2] - w), Math.abs(kept.y + all[3] - h)) < GEO_TOLERANCE_PT
        ? kept : ShapePresets.fit(kind, Math.max(0.01, w), Math.max(0.01, h), opts.adj, t, cap);
      presetBoxes.set(key, box);
    }
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  }
  // Une géométrie retenue lue (« x y w h », en points) : { x, y, w, h }, ou null si elle ne se lit pas ; `geoText` l'écrit au centième ('' si elle ne se lit pas).
  function geoOf(raw) {
    const parts = typeof raw === 'string' ? raw.trim().split(/\s+/).map(Number) : [];
    return parts.length === 4 && parts.every(value => Number.isFinite(value) && Math.abs(value) < 1e6) && parts[2] > 0 && parts[3] > 0 ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] } : null;
  }
  const geoText = (raw) => { const geo = geoOf(raw); return geo ? [geo.x, geo.y, geo.w, geo.h].map(value => round(value)).join(' ') : ''; };
  // La même boîte et les chemins de la forme qui y sont tracés (ShapePresets.paths, dans le repère de leur boîte) : { x, y, w, h, paths }. `inward` (facultatif, en points) rentre la boîte d'autant
  // de chaque côté : la bande d'un trait composé suit le contour rentré jusqu'au milieu de la bande (le contour décalé de PowerPoint, à peu près : exact pour les côtés droits, au dixième de point
  // pour un trait de 6 points sur une courbe).
  function presetLayout(kind, w, h, o, inward) {
    const box = presetBox(kind, w, h, o);
    const d = inward || 0;
    const placed = { x: box.x + d, y: box.y + d, w: Math.max(0.01, box.w - 2 * d), h: Math.max(0.01, box.h - 2 * d) };
    return Object.assign(placed, { paths: ShapePresets.paths(kind, placed.w, placed.h, (o || {}).adj) });
  }
  // Le cadre d'une forme de la norme dont la géométrie fait `gw` sur `gh` points (celle de PowerPoint ; `o` : { lw, adj, cap }) : { x, y, w, h, geo }, la place du coin du cadre depuis celui de la
  // géométrie, sa taille (tout ce que la forme couvre, ShapePresets.reach) et la géométrie à retenir quand le cadre ne la redonne pas seul ('' sinon). L'inverse de presetBox : l'import de
  // PowerPoint en tire le cadre, l'export en retrouve la géométrie.
  function presetFrame(kind, gw, gh, o) {
    const opts = o || {};
    const all = ShapePresets.reach(kind, gw, gh, opts.adj, opts.lw || 0, capOf(opts.cap));
    const frame = { x: round(all[0]), y: round(all[1]), w: round(all[2] - all[0]), h: round(all[3] - all[1]), geo: '' };
    const back = presetBox(kind, frame.w, frame.h, { lw: opts.lw, adj: opts.adj, cap: opts.cap });
    if (Math.max(Math.abs(back.w - gw), Math.abs(back.h - gh), Math.abs(back.x + frame.x), Math.abs(back.y + frame.y)) >= GEO_TOLERANCE_PT) {
      frame.geo = [-frame.x, -frame.y, gw, gh].map(value => round(value)).join(' ');
    }
    return frame;
  }
  // La boîte d'une forme de la norme dans la page (l'`xfrm` de Word et de PowerPoint), en points : celle de sa géométrie (presetBox) dans le cadre `f` ({ x, y, w, h, rot, shape, adj, cap,
  // geo }) au trait `lw`, étirée à la hauteur montrée `shownH` comme le dessin de l'éditeur. Pivotée (`rot`, degrés), la forme tourne autour du centre de SA boîte, l'éditeur autour de celui du
  // cadre : son centre est posé là où la rotation du cadre le met.
  function presetPlace(f, shownH, lw) {
    const box = presetBox(f.shape, f.w, f.h, { lw, adj: f.adj, cap: f.cap, geo: f.geo });
    const k = shownH / f.h;
    const turn = (f.rot || 0) * Math.PI / 180;
    const dx = box.x + box.w / 2 - f.w / 2;
    const dy = (box.y + box.h / 2) * k - shownH / 2;
    const cx = f.x + f.w / 2 + dx * Math.cos(turn) - dy * Math.sin(turn);
    const cy = f.y + shownH / 2 + dx * Math.sin(turn) + dy * Math.cos(turn);
    return { x: cx - box.w / 2, y: cy - box.h * k / 2, w: box.w, h: box.h * k };
  }
  // Le dessin d'une forme de la norme dans un cadre de `w` sur `h` points (`o` : { fill, line (#rrggbb ou ''), lw, dash, cap, cmpd, adj, geo }), en éléments <path> SVG dans le repère du cadre :
  // { fill, line } ('' sans fond, sans trait). Le FOND remplit chaque chemin qui en a un, de la couleur du fond éclaircie ou assombrie pour les faces qui le demandent (le dessus d'un cylindre,
  // les côtés d'un cube) ; le TRAIT suit chaque chemin qui en porte un, à cheval sur le contour, en onglet aux coins (la limite de PowerPoint, huit fois l'épaisseur), avec son tiret, son bout et
  // ses bandes. L'éditeur en fait deux images (presetArt), le PDF les peint tels quels (js/pdf-export.js) : le même dessin.
  function presetSvg(kind, w, h, o) {
    const t = lineWidthFor(w, h, o.lw, kind);
    const stroked = t > 0 && !!o.line;
    const main = presetLayout(kind, w, h, { lw: stroked ? t : 0, adj: o.adj, cap: o.cap, geo: o.geo });
    const d = (layout, path) => ShapePresets.pathData(path, layout.x, layout.y);
    const fill = o.fill ? main.paths.filter(p => p.fill).map(p => "<path d='" + d(main, p) + "' fill='" + ShapePresets.shade(o.fill, p.fill) + "'/>").join('') : '';
    const lines = [];
    if (stroked) {
      (compoundBands(o.cmpd, t) || [{ center: t / 2, width: t }]).forEach((band) => {
        const layout = Math.abs(band.center - t / 2) < 1e-6 ? main : presetLayout(kind, w, h, { lw: t, adj: o.adj, cap: o.cap, geo: o.geo }, band.center - t / 2);
        const dashes = dashArray(o.dash, t, o.cap, band.width);
        layout.paths.filter(p => p.stroke).forEach((p) => {
          lines.push("<path d='" + d(layout, p) + "' fill='none' stroke='" + o.line + "' stroke-width='" + unit(band.width) + "'" + capAttr(o.cap) + " stroke-linejoin='miter' stroke-miterlimit='"
            + ShapePresets.MITER_LIMIT + "'" + (dashes ? " stroke-dasharray='" + dashes.map(unit).join(' ') + "'" + shiftAttr(o.cap, band.width) : '') + '/>');
        });
      });
    }
    return { fill, line: lines.join('') };
  }
  // Le même dessin en deux images (`url("data:...")`, ou null), étirées à la boîte par le CSS : le fond (`--ff-fill-art`) et le trait (`--ff-art`), chacune son calque et son opacité.
  function presetArt(kind, w, h, o) {
    const svg = presetSvg(kind, w, h, o);
    return { fill: svg.fill ? artUrl(artSvg(w, h, svg.fill)) : null, line: svg.line ? artUrl(artSvg(w, h, svg.line)) : null };
  }
  // L'icône d'une forme de la norme, pour le menu : son dessin au trait (ses chemins tracés ; ceux de son fond pour une forme qui n'en trace aucun), à la proportion de sa taille d'origine, son encre
  // ramenée à 18 de côté et centrée dans le carré de 24 des icônes de js/icons.js (un arc plein ne dessine que le haut de sa boîte : c'est son dessin qu'on centre). Un trait de 1,75 et non de 2 :
  // ces dessins ont plus de détails que ceux tracés à la main (dents, rayons, double bord), qui se boucheraient.
  function presetIcon(kind) {
    const size = SIZES[kind] || [72, 72];
    const paths = ShapePresets.paths(kind, size[0], size[1]);
    const ink = ShapePresets.inkBox(kind, size[0], size[1]);
    const k = 18 / Math.max(ink[2] - ink[0], ink[3] - ink[1], 1e-6);
    const traced = paths.filter(p => p.stroke);
    const drawn = (traced.length ? traced : paths.filter(p => p.fill)).map(p => ShapePresets.pathData(p, 12 - (ink[0] + ink[2]) * k / 2, 12 - (ink[1] + ink[3]) * k / 2, k, k)).join('');
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="' + drawn + '"/></svg>';
  }
  // Les pièces d'une ligne à dessiner une à une (la boîte de ses deux bouts de `w` sur `h` points ; `o` : { flip, lw, cmpd, head, tail, headW, headLen, tailW, tailLen }), dans le repère de la boîte : le CORPS du trait,
  // `{ from, to }`, du bout du début à celui de la fin et rogné de la pointe de chaque bout qui en a une (là où le corps la rejoint : la base d'un triangle, l'encoche d'une flèche à encoche, le creux d'une flèche
  // ouverte, le fond d'un losange ou d'un ovale ; null quand les pointes prennent toute la ligne), ses BANDES (`bands` : `{ from, to, width }`, une seule de l'épaisseur du trait quand il est simple, sinon une par
  // bande du trait composé, décalée de côté ; vide sans corps) et les POINTES, des polygones pleins (`heads`). null pour une ligne sans longueur.
  // La première bande d'un trait composé est du côté gauche du sens de la ligne (le haut d'une ligne qui va de gauche à droite) ; une ligne retournée dans un seul sens (`h` ou `v`) la voit passer de l'autre
  // côté, comme le dessin que PowerPoint retourne.
  function lineParts(w, h, o) {
    const basis = lineBasis(w, h, o);
    if (!basis.length) return null;
    const { ends, head, tail, at } = basis;
    const startAt = head ? head.attach : 0;
    const endAt = tail ? tail.attach : 0;
    const body = startAt + endAt < basis.length - 1e-6 ? { from: at(ends.start, startAt, 0), to: at(ends.end, -endAt, 0) } : null;
    const turned = flipOf(o.flip).length === 1 ? -1 : 1;
    const drawn = compoundBands(o.cmpd, basis.lw) || [{ center: basis.lw / 2, width: basis.lw }];
    const bands = body ? drawn.map((band) => {
      const side = turned * (band.center - basis.lw / 2);
      return { from: at(ends.start, startAt, side), to: at(ends.end, -endAt, side), width: band.width };
    }) : [];
    const placed = (shape, from, sign) => shape.points.map(p => at(from, sign * p[0], p[1]));
    return { body, bands, heads: (head ? [placed(head, ends.start, 1)] : []).concat(tail ? [placed(tail, ends.end, -1)] : []) };
  }
  // Une ligne que le polygone de `lineOutline` suffit à dessiner (`o` : { lw, dash, cap, cmpd, head, tail }) : un trait plein, simple, à bouts plats, dont la seule pointe est le triangle (de toute taille).
  // Toute autre ligne - tirets, bouts arrondis, trait composé, flèche ouverte, à encoche, losange ou ovale - est dessinée par l'image de `lineArt`.
  function lineIsPlain(o) {
    const lw = Math.max(0, Number(o.lw) || 0);
    return !dashArray(o.dash, lw, o.cap) && !capOf(o.cap) && !cmpdOf(o.cmpd) && [o.head, o.tail].every(end => endOf(end) === '' || endOf(end) === LINE_END);
  }
  // Une ligne en tirets, à bouts arrondis, composée ou à pointe autre que le triangle (la boîte de ses deux bouts de `w` sur `h` points ; `o` : { flip, lw, color (#rrggbb), dash, cap, cmpd, head, tail, headW, headLen,
  // tailW, tailLen }) : { url, bleed } ou null (la ligne que `lineIsPlain` dit : le polygone de `lineOutline`). L'image couvre la boîte agrandie du tour `bleed` (celui de `lineLook`) : les bandes du corps du trait
  // (`lineParts`), puis les pointes, pleines. Un bout rond ou carré dépasse du bout de la ligne de la moitié de l'épaisseur, que le tour contient.
  function lineArt(w, h, o) {
    const lw = Math.max(0, Number(o.lw) || 0);
    const cap = capOf(o.cap);
    if (lineIsPlain(o) || !o.color || !(lw > 0)) return null;
    const parts = lineParts(w, h, o);
    if (!parts) return null;
    const bleed = lineLook(w, h, o).bleed;
    const moved = p => unit(p[0] + bleed) + ' ' + unit(p[1] + bleed);
    const body = parts.bands.map((band) => {
      const dashes = dashArray(o.dash, lw, cap, band.width);
      return "<path d='M" + moved(band.from) + 'L' + moved(band.to) + "' fill='none' stroke='" + o.color + "' stroke-width='" + unit(band.width) + "'" + capAttr(cap)
        + (dashes ? " stroke-dasharray='" + dashes.map(unit).join(' ') + "'" + shiftAttr(cap, band.width) : '') + '/>';
    }).join('');
    const heads = parts.heads.map(points => "<path d='M" + points.map(moved).join('L') + "Z' fill='" + o.color + "'/>").join('');
    return { url: artUrl(artSvg(w + 2 * bleed, h + 2 * bleed, body + heads)), bleed };
  }

  // Les marges intérieures du texte d'une forme, en points : [haut, droite, bas, gauche]. Celles d'un cadre de texte (kind '') sont les marges par défaut ; `lineWidth` (le trait,
  // dans la boîte) s'y ajoute de chaque côté. `o` (facultatif) : { adj, cap, geo } d'une forme de la norme.
  function textInsets(kind, w, h, lineWidth, o) {
    const t = lineWidthFor(w, h, lineWidth);
    // Une forme que js/shape-presets.js dessine (`adj` : ses réglages) : le rectangle de son texte (celui de PowerPoint) dans la boîte de sa géométrie (presetBox), puis les marges par défaut (le
    // trait, à cheval sur le contour, n'y ajoute rien).
    const opts = o || {};
    if (drawnByPresets(kind, opts.adj)) {
      const box = presetBox(kind, w, h, { lw: t, adj: opts.adj, cap: opts.cap, geo: opts.geo });
      const r = ShapePresets.textRect(kind, box.w, box.h, opts.adj);
      return [box.y + r[1] + TEXT_PAD_Y_PT, w - box.x - r[2] + TEXT_PAD_X_PT, h - box.y - r[3] + TEXT_PAD_Y_PT, box.x + r[0] + TEXT_PAD_X_PT].map(value => round(Math.max(0, value)));
    }
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

  return {
    KINDS, TABS, TEXT, LINE, MAX_LINE_PT, BUBBLE_BODY, GRAB_PT, DASHES, COMPOUNDS, END_TYPES, END_SIZES, isKind, isPreset, drawnByPresets, kindOf, defaults, outline, inset, look, strokeOutline, outlineInset, lineWidthFor, textInsets, ROUND_RATIO, flipOf, endOf, endSizeOf, lineEnds,
    endPolygon, lineOutline, lineLook, lineIsPlain, dashOf, dashPairs, capOf, cmpdOf, compoundBands, dashArray, dashPhase, dashDrawingMl, strokeArt, lineParts, lineArt, geoText, presetBox, presetLayout, presetFrame, presetPlace, presetSvg, presetArt, presetIcon,
  };
})();
