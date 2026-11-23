// Import OpenDocument présentation : un fichier .odp (ou son modèle .otp, ou le fichier « flat » .fodp) devient une présentation de l'éditeur - une nouvelle présentation sans nom et pas encore enregistrée, sur le modèle
// de l'import PowerPoint (js/pptx-import.js) : une diapositive par page du fichier, chaque objet un cadre libre de la diapositive (js/free-frame.js), ce que l'éditeur ne sait pas reprendre COMPTÉ et dit à la personne à la
// fin. Les formats libres (LibreOffice Impress, OnlyOffice, Collabora, Calligra...) sont lus sans aucune bibliothèque de plus : un zip (JSZip, déjà chargé) de parties XML, lu à la main.
//
// Ce que la diapositive devient : sa page (la taille de la page maîtresse, en format libre), son fond uni, ses notes, son état masqué, son passage à la suivante (au temps, avec ou sans transition) ; ses objets dans l'ordre
// du fichier, sous le décor de sa page maîtresse (les objets que la maîtresse dessine derrière tout) :
//  - les zones de texte et les emplacements (titre, plan, sous-titre) : leurs paragraphes, listes, séries de caractères et tableaux sont lus par js/odt-import.js (`presentationReader`), donc comme ceux d'un document, avec
//    le style de l'objet pour aspect de base ; l'ancrage du texte (haut, milieu, bas) et ses marges sont ceux du style ;
//  - les formes (`draw:custom-shape`, rectangle, ellipse) : la sorte de l'éditeur de même nom (les formes de la norme `ooxml-*` et les formes de LibreOffice qui ont leur équivalent), le fond uni, le trait (épaisseur,
//    couleur, tiret, bout), la rotation, le texte de la forme ; une forme qu'on ne sait pas dessiner devient un rectangle, compté ;
//  - les traits et les connecteurs (une ligne droite entre leurs deux bouts, avec les pointes du fichier) ; les images (avec leur texte alternatif) ; les tableaux (dans un cadre) ; les groupes sont mis à plat.
//
// Ce qui n'arrive pas est COMPTÉ, un genre à la fois, et dit par la fenêtre du compte rendu (js/main-import.js) : rien n'est perdu en silence. Le moteur ne touche ni à l'éditeur ni à la page : il rend le TEXTE de chaque
// diapositive (le balisage que l'éditeur écrit), la page et le compte rendu, dans la forme de l'import PowerPoint (`slideTexts`, `page`, `slideCount`, `report`, `stats`) : js/import-placing.js les pose de la même façon.
const OdpImport = (function () {
  // Les plafonds communs aux imports (js/export-common.js:Ooxml.LIMITS) ; une partie XML plus grosse que celui-ci est refusée.
  const { file: MAX_FILE_BYTES, unpacked: MAX_UNPACKED_BYTES, image: MAX_IMAGE_BYTES, images: MAX_IMAGES_BYTES } = ExportCommon.Ooxml.LIMITS;
  const MAX_PART_BYTES = 60 * 1024 * 1024;
  const MAX_SLIDES = 500;               // au plus cinq cents diapositives par présentation (comme l'import PowerPoint)
  const MAX_OBJECTS = 3000;             // les objets lus sur une diapositive ; au delà, ils sont comptés (`unreadable`) et laissés
  const MAX_DECOR_BYTES = 60 * 1024 * 1024;   // le balisage du décor des pages maîtresses recopié sur les diapositives ; au delà, le décor n'est plus recopié (compté)
  const HEAVY_FILE_BYTES = 15 * 1024 * 1024;  // un fichier aussi lourd est enregistré dans Grist dès sa mise en place (js/main-import.js)
  const PX_PER_PT = 96 / 72;
  const MM_PER_PT = 25.4 / 72;
  const FRAME_PAD_X_PT = 7.2;           // les marges d'un cadre de texte (css/free-frame.css)
  const FRAME_PAD_Y_PT = 3.6;
  const DEFAULT_PAD_X_PT = 7.2;         // les marges d'un objet dont le style n'en dit rien (0,25 cm de chaque côté, 0,125 cm en haut et en bas)
  const DEFAULT_PAD_Y_PT = 3.6;
  const HAIRLINE_PT = 0.75;
  const HOST_WIDTH_PX = 4000;           // la largeur de l'hôte caché où se mesure un texte (plus large que toute page)
  const ROBOTO_FACES = ['400 14px Roboto', 'italic 400 14px Roboto', '700 14px Roboto', 'italic 700 14px Roboto'];
  const MESSAGES = {
    notPackage: 'Ce fichier n’est pas un document OpenDocument.', unreadable: 'Ce fichier n’a pas pu être lu.', tooBig: 'Ce fichier est trop gros pour être importé.',
    encrypted: 'Ce fichier OpenDocument est protégé par un mot de passe.',
  };
  // Les genres du compte rendu, dans l'ordre où la fenêtre les dit : ce qui n'arrive pas ou arrive remplacé, puis les effets, enfin les limites. Les genres que le texte d'un objet compte (js/odt-import.js : polices,
  // tabulations, numérotations...) viennent après, avec les mots de l'import des documents (`scope: 'odt'`).
  const REPORT_KEYS = ['animations', 'charts', 'embedded', 'media', 'freeDrawings', 'pathEnds', 'objectLinks', 'images', 'shapes', 'imageEffects', 'gradients', 'patterns', 'slidePatterns', 'shadows', 'transitions', 'masterObjects', 'slidesCut', 'unreadable'];
  const TEXT_KEYS = ['fonts', 'tabs', 'rightIndent', 'paragraphBorders', 'numbering', 'hidden', 'fields', 'nestedTables', 'borderStyles', 'links', 'tableCells', 'images', 'floatingImages', 'imageEffects'];
  const PLACEHOLDER_CLASSES = new Set(['title', 'outline', 'subtitle', 'notes', 'header', 'footer', 'date-time', 'page-number', 'handout', 'page', 'graphic', 'object', 'chart', 'orgchart', 'table', 'text']);

  const { fail, kids, round2, fixed, escAttr } = ExportCommon.Ooxml;
  const { name, attr, children, child, toPoints } = ExportCommon.Odf;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const count = (ctx, key, n) => { ctx.report.set(key, (ctx.report.get(key) || 0) + (n === undefined ? 1 : n)); };
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const colorOf = value => (HEX_COLOR.test(String(value || '')) ? String(value).slice(1).toLowerCase() : '');
  const percentOf = (value, fallback) => {
    const found = /^\s*(-?[\d.]+)\s*%\s*$/.exec(String(value === undefined || value === null ? '' : value));
    return found ? clamp(Number(found[1]), 0, 100) : fallback;
  };
  // Une longueur du fichier en points de la page de l'éditeur (la page du fichier ramenée à la plus grande que l'éditeur accepte : `k`).
  const lengthOf = (ctx, value) => { const pt = toPoints(value); return pt === null ? 0 : pt * ctx.k; };

  // --- La page --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // La page de l'éditeur pour des diapositives de `widthPt` sur `heightPt` : le format libre (côté court d'abord, au dixième de millimètre, borné) et le sens ; `k` rapporte le fichier à cette page (1, sauf si la page du
  // fichier dépasse la plus grande que l'éditeur accepte).
  function pageFor(widthPt, heightPt) {
    const landscape = widthPt >= heightPt;
    const orientation = landscape ? PageLayout.LANDSCAPE : PageLayout.PORTRAIT;
    const short = Math.min(widthPt, heightPt) * MM_PER_PT;
    const long = Math.max(widthPt, heightPt) * MM_PER_PT;
    const shrink = Math.min(1, PageLayout.CUSTOM_MAX_MM / long);
    const tenth = mm => String(Math.round(clamp(mm * shrink, PageLayout.CUSTOM_MIN_MM, PageLayout.CUSTOM_MAX_MM) * 10) / 10);
    const format = PageLayout.normalizeFormat(tenth(short) + 'x' + tenth(long));
    const mm = PageLayout.pageSizeMmFor(orientation, format);
    const pt = PageLayout.pageSizePtFor(orientation, format);
    const k = Math.min(mm.width / (landscape ? long : short), mm.height / (landscape ? short : long));
    return { orientation, format, k: Math.abs(k - 1) < 0.002 ? 1 : k, widthPt: pt.width, heightPt: pt.height };
  }
  // La page maîtresse d'une diapositive, et la taille que sa mise en page donne à la page.
  const masterOf = (ctx, pageEl) => ctx.masters.get(attr(pageEl, 'draw:master-page-name')) || ctx.firstMaster;
  function sizeOfMaster(ctx, master) {
    const layout = master ? ctx.styles.layouts.get(attr(master, 'style:page-layout-name')) : null;
    const widthPt = layout ? toPoints(layout['fo:page-width']) : null;
    const heightPt = layout ? toPoints(layout['fo:page-height']) : null;
    return widthPt > 0 && heightPt > 0 ? { widthPt, heightPt } : { widthPt: 792, heightPt: 446 };   // 28 cm sur 15,75 cm, la page « 16:9 » d'Impress
  }

  // --- Les couleurs, les traits et les fonds ---------------------------------------------------------------------------------------------------------------------------------------------
  // Les dégradés nommés du fichier (`draw:gradient` : couleur de départ et d'arrivée) : un fond ou un dégradé de forme est remplacé par la moyenne de ses deux couleurs.
  function gradientsOf(odf) {
    const out = new Map();
    odf.sections('office:styles').forEach((holder) => {
      children(holder, 'draw:gradient').forEach((gradient) => {
        const start = colorOf(attr(gradient, 'draw:start-color'));
        const end = colorOf(attr(gradient, 'draw:end-color'));
        if (start && end) out.set(attr(gradient, 'draw:name'), [start, end]);
      });
    });
    return out;
  }
  function averageHex(pair) {
    const channel = i => Math.round((parseInt(pair[0].slice(i, i + 2), 16) + parseInt(pair[1].slice(i, i + 2), 16)) / 2);
    return [0, 2, 4].map(i => ('0' + channel(i).toString(16)).slice(-2)).join('');
  }
  // Le fond d'un objet : { hex, tr } ('' sans fond). Un dégradé devient la moyenne de ses couleurs ; une trame ou une image garde la couleur du fond quand le style en écrit une. Le compte est fait une fois par objet.
  function fillOf(ctx, graphic, losses) {
    const kind = graphic['draw:fill'];
    if (!kind || kind === 'none') return { hex: '', tr: 0 };
    const opacity = percentOf(graphic['draw:opacity'], 100);
    const tr = Math.round(100 - opacity);
    if (kind === 'solid') return { hex: colorOf(graphic['draw:fill-color']), tr };
    if (kind === 'gradient') {
      const pair = ctx.gradients.get(graphic['draw:fill-gradient-name']);
      losses.add('gradients');
      return { hex: pair ? averageHex(pair) : colorOf(graphic['draw:fill-color']), tr };
    }
    losses.add('patterns');
    return { hex: colorOf(graphic['draw:fill-color']), tr };
  }
  const CAPS = { round: 'rnd', square: 'sq' };
  // Le trait d'un objet : { hex, width, tr, dash, cap } (hex '' sans trait). Une épaisseur nulle est le trait le plus fin ; un tiret (`draw:stroke="dash"`) est le tiret court de l'éditeur.
  function strokeOf(ctx, graphic) {
    const kind = graphic['draw:stroke'];
    if (!kind || kind === 'none') return { hex: '', width: 0, tr: 0, dash: '', cap: '' };
    const wanted = lengthOf(ctx, graphic['svg:stroke-width']);
    const dash = kind === 'dash' ? dashOf(ctx, graphic['draw:stroke-dash']) : '';
    return { hex: colorOf(graphic['svg:stroke-color']) || '000000', width: clamp(wanted > 0 ? wanted : HAIRLINE_PT, 0.25, ShapeGeometry.MAX_LINE_PT), tr: Math.round(100 - percentOf(graphic['svg:stroke-opacity'], 100)), dash, cap: CAPS[graphic['svg:stroke-linecap']] || '' };
  }
  // Le tiret nommé du fichier (`draw:stroke-dash` : points, longueurs, écart) ramené au tiret de l'éditeur qui lui ressemble : un point court -> pointillé, un trait long -> tirets longs, sinon le tiret court.
  function dashOf(ctx, dashName) {
    const el = dashName ? ctx.dashes.get(dashName) : null;
    if (!el) return 'dash';
    const length = toPoints(attr(el, 'draw:dots1-length')) || 0;
    const width = toPoints(attr(el, 'draw:distance')) || 0;
    if (/^\s*[\d.]+\s*%/.test(attr(el, 'draw:dots1-length') || '')) return 'dash';
    if (length > 0 && length < 1.2 * Math.max(width, 0.1)) return 'sysDot';
    return length > 4 * Math.max(width, 0.1) ? 'lgDash' : 'dash';
  }
  // Les pointes d'un trait : le marqueur nommé du fichier (« Arrow », « Line Arrow », « Circle », « Square »...) devient la pointe de l'éditeur qui lui ressemble ; '' sans marqueur.
  function endOf(markerName) {
    const label = String(markerName || '').toLowerCase();
    if (!label) return '';
    if (/circle|round|oval/.test(label)) return 'oval';
    if (/square|diamond/.test(label)) return 'diamond';
    if (/line.arrow|open/.test(label)) return 'arrow';
    return 'triangle';
  }

  // --- La boîte d'un objet ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // `draw:transform` (« rotate (-0.349) translate (21.2cm 2.6cm) ») : l'angle (en radians, positif dans le sens inverse des aiguilles d'une montre) et la place du coin haut gauche de l'objet TOURNÉ autour de ce coin.
  function transformOf(text) {
    const out = { turn: 0, at: null };
    const source = String(text || '');
    const rotate = /rotate\s*\(\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*\)/i.exec(source);
    if (rotate) out.turn = Number(rotate[1]) || 0;
    const move = /translate\s*\(\s*(-?[\d.]+)\s*([a-z%]*)\s+(-?[\d.]+)\s*([a-z%]*)\s*\)/i.exec(source);
    if (move) out.at = [toPoints(move[1] + (move[2] || 'pt')), toPoints(move[3] + (move[4] || move[2] || 'pt'))];
    return out;
  }
  // La boîte d'un objet en points de l'éditeur : { x, y, w, h, rot (degrés, sens des aiguilles d'une montre, 0 à 360), turned } - l'objet DROIT (sa boîte avant la rotation autour de son centre).
  function boxOf(ctx, el) {
    const width = lengthOf(ctx, attr(el, 'svg:width'));
    const height = lengthOf(ctx, attr(el, 'svg:height'));
    const transform = transformOf(attr(el, 'draw:transform'));
    let x = lengthOf(ctx, attr(el, 'svg:x'));
    let y = lengthOf(ctx, attr(el, 'svg:y'));
    let rot = 0;
    if (transform.at) { x = transform.at[0] * ctx.k; y = transform.at[1] * ctx.k; }
    if (transform.turn) {
      rot = -transform.turn * 180 / Math.PI;
      const turn = -transform.turn;
      // La rotation d'ODF se fait autour du coin haut gauche : le centre est celui de la boîte tournée de ce coin.
      const centerX = x + (width / 2) * Math.cos(turn) - (height / 2) * Math.sin(turn);
      const centerY = y + (width / 2) * Math.sin(turn) + (height / 2) * Math.cos(turn);
      x = centerX - width / 2;
      y = centerY - height / 2;
    }
    return { x, y, w: width, h: height, rot: ((Math.round(rot * 100) / 100 % 360) + 360) % 360 };
  }

  // --- Mesurer un texte ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Un texte posé sans fond ni trait dont l'ancrage est au milieu ou en bas descend dans sa boîte : l'éditeur ancre ses cadres en haut, la boîte est donc ramenée à la hauteur que le texte prendra, MESURÉE dans un hôte
  // caché qui a les règles de l'éditeur (la classe `tiptap`) : le même moteur de texte, les mêmes polices, la même largeur.
  function measureHost(ctx) {
    if (!ctx.host) {
      const host = document.createElement('div');
      host.className = 'tiptap';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position: fixed; left: -100000px; top: 0; width: ' + HOST_WIDTH_PX + 'px; min-height: 0; visibility: hidden; pointer-events: none; zoom: 1';
      document.body.appendChild(host);
      ctx.host = host;
    }
    return ctx.host;
  }
  function measuredHeight(ctx, frame, inner) {
    const host = measureHost(ctx);
    Dom.setMarkup(host, FreeFrame.html(Object.assign({}, frame, { h: 0, rot: 0, layer: '' }), inner).replace(/<p([^>]*)><\/p>/g, '<p$1><br></p>'));
    const box = host.querySelector('.pp-free-frame-box');
    return box ? box.getBoundingClientRect().height / PX_PER_PT : 0;
  }

  // --- Les tracés libres --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Un tracé du fichier (`draw:path` : données SVG `svg:d` ; `draw:polygon`, `draw:polyline` : une liste de points ; `draw:regular-polygon` ; une forme `non-primitive` dont `draw:enhanced-path` n'est que des
  // nombres et des commandes de tracé) devient une FORME LIBRE de l'éditeur, comme celles que l'import PowerPoint reprend (js/shape-presets.js : `freeze`, le nom de la forme EST sa géométrie). Un tracé trop
  // détaillé pour un nom de forme, ou sans surface ni ligne à dessiner, reste compté (`freeDrawings`).
  const MAX_PATH_TOKENS = 60000;
  const PATH_TOKEN = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  const PATH_ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  // L'arc SVG (forme « points d'arrivée » : rayons, rotation, grand arc, sens) en courbes de Bézier d'au plus un quart de tour (norme SVG, annexe F.6).
  function arcCurves(x1, y1, rx, ry, turnDeg, large, sweep, x2, y2) {
    let radiusX = Math.abs(rx);
    let radiusY = Math.abs(ry);
    if (!radiusX || !radiusY || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
    const phi = (turnDeg % 360) * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;
    const grow = (x1p * x1p) / (radiusX * radiusX) + (y1p * y1p) / (radiusY * radiusY);
    if (grow > 1) { radiusX *= Math.sqrt(grow); radiusY *= Math.sqrt(grow); }
    const numerator = radiusX * radiusX * radiusY * radiusY - radiusX * radiusX * y1p * y1p - radiusY * radiusY * x1p * x1p;
    const denominator = radiusX * radiusX * y1p * y1p + radiusY * radiusY * x1p * x1p;
    const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
    const cxp = factor * (radiusX * y1p) / radiusY;
    const cyp = factor * -(radiusY * x1p) / radiusX;
    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
    const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const start = angle(1, 0, (x1p - cxp) / radiusX, (y1p - cyp) / radiusY);
    let sweepAngle = angle((x1p - cxp) / radiusX, (y1p - cyp) / radiusY, (-x1p - cxp) / radiusX, (-y1p - cyp) / radiusY);
    if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;
    const pieces = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9));
    const step = sweepAngle / pieces;
    const k = 4 / 3 * Math.tan(step / 4);
    const at = (t) => [cx + radiusX * Math.cos(t) * cosPhi - radiusY * Math.sin(t) * sinPhi, cy + radiusX * Math.cos(t) * sinPhi + radiusY * Math.sin(t) * cosPhi];
    const slope = (t) => [-radiusX * Math.sin(t) * cosPhi - radiusY * Math.cos(t) * sinPhi, -radiusX * Math.sin(t) * sinPhi + radiusY * Math.cos(t) * cosPhi];
    const out = [];
    for (let n = 0; n < pieces; n++) {
      const from = start + step * n;
      const to = from + step;
      const p0 = at(from);
      const p3 = n === pieces - 1 ? [x2, y2] : at(to);
      const d0 = slope(from);
      const d3 = slope(to);
      out.push(['C', p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
    }
    return out;
  }
  // Les données d'un tracé SVG en commandes absolues M, L, C et Z : [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']] (les courbes du second degré et les arcs deviennent des courbes cubiques) ;
  // null quand le texte est illisible ou ne commence pas par un déplacement.
  function svgCommands(text) {
    const tokens = [];
    String(text || '').replace(PATH_TOKEN, (all, letter, number) => { if (tokens.length <= MAX_PATH_TOKENS) tokens.push(letter || Number(number)); return all; });
    if (!tokens.length || tokens.length > MAX_PATH_TOKENS) return null;
    const out = [];
    let command = '';
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let control = null;   // le dernier point de contrôle (pour S et T), avec la lettre de la commande qui l'a posé
    let i = 0;
    while (i < tokens.length) {
      if (typeof tokens[i] === 'string') {
        command = tokens[i++];
        if (!(command.toUpperCase() in PATH_ARITY)) return null;
        if (command === 'Z' || command === 'z') { out.push(['Z']); x = startX; y = startY; control = null; continue; }
      } else if (!command || command === 'Z' || command === 'z') return null;
      const upper = command.toUpperCase();
      const relative = command !== upper;
      const args = tokens.slice(i, i + PATH_ARITY[upper]);
      if (args.length < PATH_ARITY[upper] || args.some(arg => typeof arg !== 'number')) return null;
      i += PATH_ARITY[upper];
      const ox = relative ? x : 0;
      const oy = relative ? y : 0;
      if (upper === 'M') {
        x = args[0] + ox; y = args[1] + oy; startX = x; startY = y; out.push(['M', x, y]); control = null;
        command = relative ? 'l' : 'L';   // les couples suivants d'un déplacement sont des droites
      } else if (upper === 'L') { x = args[0] + ox; y = args[1] + oy; out.push(['L', x, y]); control = null; }
      else if (upper === 'H') { x = args[0] + ox; out.push(['L', x, y]); control = null; }
      else if (upper === 'V') { y = args[0] + oy; out.push(['L', x, y]); control = null; }
      else if (upper === 'C') {
        out.push(['C', args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy]);
        control = ['C', args[2] + ox, args[3] + oy]; x = args[4] + ox; y = args[5] + oy;
      } else if (upper === 'S') {
        const first = control && control[0] === 'C' ? [2 * x - control[1], 2 * y - control[2]] : [x, y];
        out.push(['C', first[0], first[1], args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy]);
        control = ['C', args[0] + ox, args[1] + oy]; x = args[2] + ox; y = args[3] + oy;
      } else if (upper === 'Q' || upper === 'T') {
        const point = upper === 'Q' ? [args[0] + ox, args[1] + oy] : (control && control[0] === 'Q' ? [2 * x - control[1], 2 * y - control[2]] : [x, y]);
        const end = upper === 'Q' ? [args[2] + ox, args[3] + oy] : [args[0] + ox, args[1] + oy];
        out.push(['C', x + 2 / 3 * (point[0] - x), y + 2 / 3 * (point[1] - y), end[0] + 2 / 3 * (point[0] - end[0]), end[1] + 2 / 3 * (point[1] - end[1]), end[0], end[1]]);
        control = ['Q', point[0], point[1]]; x = end[0]; y = end[1];
      } else if (upper === 'A') {
        const to = [args[5] + ox, args[6] + oy];
        arcCurves(x, y, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, to[0], to[1]).forEach(piece => out.push(piece));
        x = to[0]; y = to[1]; control = null;
      }
    }
    return out.length && out[0][0] === 'M' ? out : null;
  }

  // La zone de dessin du fichier : `svg:viewBox` (« x y largeur hauteur »), ou null quand il manque ou ne se lit pas.
  function viewOf(text) {
    const numbers = String(text || '').trim().split(/[\s,]+/).map(Number);
    return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0 ? { x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] } : null;
  }
  // La zone qu'occupent les commandes d'un tracé (quand le fichier n'a pas dit sa zone de dessin).
  function boundsOf(subpaths) {
    const xs = [];
    const ys = [];
    subpaths.forEach(sub => sub.commands.forEach((c) => { for (let n = 1; n < c.length; n += 2) { xs.push(c[n]); ys.push(c[n + 1]); } }));
    if (!xs.length) return null;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
  }
  // Une liste de points (`draw:points` : « x,y x,y ... ») en commandes de tracé, fermé pour un polygone.
  function pointsCommands(text, closed) {
    const numbers = String(text || '').trim().split(/[\s,]+/).map(Number);
    if (numbers.length < 4 || numbers.length % 2 || numbers.length > MAX_PATH_TOKENS || !numbers.every(Number.isFinite)) return null;
    const out = [];
    for (let n = 0; n < numbers.length; n += 2) out.push([n ? 'L' : 'M', numbers[n], numbers[n + 1]]);
    if (closed) out.push(['Z']);
    return out;
  }
  // Les tracés d'une forme de genre `non-primitive` (`draw:enhanced-path`) quand ce ne sont que des nombres et les commandes M, L, C, Z, N (fin de tracé), F (sans fond) et S (sans trait) : [{ commands, noFill, noStroke }] ;
  // null dès qu'une formule (`?f0`, `$0`) ou une autre commande (arcs d'ellipse, quarts) y entre : la forme reste un rectangle, comptée.
  function enhancedSubpaths(text) {
    const source = String(text || '');
    if (/[?$]/.test(source) || !source.trim()) return null;
    const tokens = [];
    source.replace(PATH_TOKEN, (all, letter, number) => { if (tokens.length <= MAX_PATH_TOKENS) tokens.push(letter || Number(number)); return all; });
    if (!tokens.length || tokens.length > MAX_PATH_TOKENS) return null;
    const subpaths = [];
    let current = { commands: [], noFill: false, noStroke: false };
    const close = () => { if (current.commands.length > 1) subpaths.push(current); current = { commands: [], noFill: false, noStroke: false }; };
    const arity = { M: 2, L: 2, C: 6 };
    let command = '';
    let i = 0;
    while (i < tokens.length) {
      if (typeof tokens[i] === 'string') {
        command = tokens[i++];
        if (command === 'N') { close(); continue; }
        if (command === 'Z') { current.commands.push(['Z']); continue; }
        if (command === 'F') { current.noFill = true; continue; }
        if (command === 'S') { current.noStroke = true; continue; }
        if (!arity[command]) return null;
      } else if (!arity[command]) return null;
      const args = tokens.slice(i, i + arity[command]);
      if (args.length < arity[command] || args.some(arg => typeof arg !== 'number')) return null;
      i += arity[command];
      current.commands.push([command].concat(args));
      if (command === 'M') command = 'L';
    }
    close();
    return subpaths.length && subpaths[0].commands[0][0] === 'M' ? subpaths : null;
  }
  // La forme libre, en nom de forme de l'éditeur : `subpaths` ([{ commands, noFill, noStroke }]), la zone de dessin `view` du fichier et la boîte `box` de l'objet, en points ; '' quand elle ne tient pas dans un nom
  // de forme ou n'a rien à dessiner. `flip` : { h, v } - la forme retournée dans sa boîte.
  function freeKind(subpaths, view, box, flip) {
    if (!subpaths.length || !view || !(box.w > 0 && box.h > 0)) return '';
    const scale = Math.max(1, Math.min(1000, Math.floor(100000 / Math.max(view.w, view.h))));
    const units = value => String(Math.round(value * scale * 100) / 100);
    const specs = subpaths.map((sub) => {
      const spec = [];
      if (sub.noFill) spec.push('f0');
      if (sub.noStroke) spec.push('s0');
      spec.push('W' + Math.round(view.w * scale), 'H' + Math.round(view.h * scale));
      sub.commands.forEach((c) => { spec.push(c[0]); for (let n = 1; n < c.length; n += 2) spec.push(units(c[n] - view.x), units(c[n + 1] - view.y)); });
      return spec.join(' ');
    });
    return ShapePresets.freeze({ a: '', g: '', p: specs, r: '' }, box.w, box.h, flip || {});
  }
  // La forme libre d'une forme `non-primitive` dont le tracé est simple : son nom de forme, ou ''.
  function enhancedKind(geometry, box) {
    if (!geometry || attr(geometry, 'draw:type') !== 'non-primitive') return '';
    const subpaths = enhancedSubpaths(attr(geometry, 'draw:enhanced-path'));
    const view = viewOf(attr(geometry, 'svg:viewBox')) || (subpaths && boundsOf(subpaths));
    return subpaths ? freeKind(subpaths, view, box, { h: attr(geometry, 'draw:mirror-horizontal') === 'true', v: attr(geometry, 'draw:mirror-vertical') === 'true' }) : '';
  }

  // --- Les objets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les styles d'un objet : le style de présentation (un emplacement : titre, plan...) puis le style graphique, du plus lointain au plus proche.
  function styleLayers(el) {
    const layers = [];
    if (attr(el, 'presentation:style-name')) layers.push(['presentation', attr(el, 'presentation:style-name')]);
    if (attr(el, 'draw:style-name')) layers.push(['graphic', attr(el, 'draw:style-name')]);
    return layers;
  }
  const textLayers = el => styleLayers(el).concat([['paragraph', attr(el, 'draw:text-style-name')]]);
  const altOf = (el) => {
    const found = child(el, 'svg:desc') || child(el, 'svg:title');
    return found ? AltText.textOf(found.textContent) : '';
  };
  const hasContent = html => /\S/.test(html.replace(/<[^>]*>/g, '')) || /<(?:table|img)\b/.test(html);
  const ANCHORS = { top: 't', middle: 'ctr', bottom: 'b' };

  // Les formes de LibreOffice qui ont leur sorte dans l'éditeur ; les formes de la norme (`ooxml-<nom>`) prennent le nom de la norme telles quelles.
  const NATIVE_KINDS = {
    rectangle: 'rect', 'round-rectangle': 'roundRect', ellipse: 'ellipse', diamond: 'diamond', 'isosceles-triangle': 'triangle', 'right-triangle': 'rtTriangle', parallelogram: 'parallelogram', trapezoid: 'trapezoid',
    octagon: 'octagon', hexagon: 'hexagon', pentagon: 'pentagon', cross: 'plus', star5: 'star5', 'right-arrow': 'rightArrow', 'left-arrow': 'leftArrow', 'up-arrow': 'upArrow', 'down-arrow': 'downArrow', heart: 'heart',
    'ring': 'donut', 'mso-spt1': 'rect', 'mso-spt2': 'rect',
  };
  // Un tracé qui n'est qu'un rectangle plein cadre (« M 0 0 L w 0 w h 0 h Z N », celui que l'export OpenDocument écrit pour un rectangle) : une forme de genre `non-primitive` qui est un rectangle n'a rien de perdu.
  function isRectanglePath(geometry) {
    const corners = /^M\s*0\s+0\s+L\s*(\d+)\s+0\s+(?:L\s*)?(\d+)\s+(\d+)\s+(?:L\s*)?0\s+(\d+)\s*Z\s*N?$/.exec(String(geometry && attr(geometry, 'draw:enhanced-path') || '').trim().replace(/,/g, ' '));
    return !!corners && corners[1] === corners[2] && corners[3] === corners[4];
  }
  // La sorte de l'éditeur et ses réglages d'après la géométrie du fichier : { kind, adj } ; kind null quand l'éditeur ne la dessine pas.
  function kindOfGeometry(geometry) {
    const type = geometry ? attr(geometry, 'draw:type') || '' : 'rectangle';
    const ooxml = /^ooxml-(.+)$/.exec(type);
    const kind = ooxml ? ooxml[1] : NATIVE_KINDS[type] || (type === '' || (type === 'non-primitive' && isRectanglePath(geometry)) ? 'rect' : null);
    if (!kind || !ShapeGeometry.isKind(kind) || kind === ShapeGeometry.LINE) return { kind: null, adj: '' };
    // Les réglages d'une forme de la norme (les poignées jaunes) : `draw:modifiers`, dans l'ordre de ses réglages.
    let adj = '';
    const modifiers = String(geometry && attr(geometry, 'draw:modifiers') || '').trim().split(/\s+/).map(Number).filter(Number.isFinite);
    if (ooxml && modifiers.length && ShapePresets.has && ShapePresets.has(kind)) {
      const names = Object.keys(ShapePresets.adjDefaults(kind));
      const picked = {};
      names.forEach((key, i) => { if (modifiers[i] !== undefined) picked[key] = modifiers[i]; });
      adj = ShapePresets.adjText(kind, picked);
    }
    return { kind, adj };
  }

  // Les formes, les zones de texte et les emplacements : le cadre de l'éditeur de leur sorte, avec leur fond, leur trait et leur texte.
  async function textObject(el, container, env, forced) {
    const ctx = env.ctx;
    const tag = name(el);
    const losses = new Set();
    const graphic = ctx.reader.props(styleLayers(el), 'graphic');
    let shape = forced || null;
    if (!shape) {
      if (tag === 'draw:custom-shape') shape = kindOfGeometry(child(el, 'draw:enhanced-geometry'));
      else if (tag === 'draw:ellipse' || tag === 'draw:circle') shape = { kind: 'ellipse', adj: '' };
      else if (tag === 'draw:rect' && lengthOf(ctx, attr(el, 'svg:corner-radius') || attr(el, 'draw:corner-radius')) > 0) shape = { kind: 'roundRect', adj: '' };
      else shape = { kind: 'rect', adj: '' };
    }
    const box = boxOf(ctx, el);
    if (!forced && !shape.kind && tag === 'draw:custom-shape') {
      const name = enhancedKind(child(el, 'draw:enhanced-geometry'), box);
      if (name) shape = { kind: name, adj: '' };
    }
    const fill = fillOf(ctx, graphic, losses);
    const stroke = strokeOf(ctx, graphic);
    if (graphic['draw:shadow'] === 'visible' && percentOf(graphic['draw:shadow-opacity'], 100) > 0 && (fill.hex || stroke.hex)) losses.add('shadows');
    const padLeft = graphic['fo:padding-left'] !== undefined ? lengthOf(ctx, graphic['fo:padding-left']) : DEFAULT_PAD_X_PT;
    const padRight = graphic['fo:padding-right'] !== undefined ? lengthOf(ctx, graphic['fo:padding-right']) : DEFAULT_PAD_X_PT;
    const padTop = graphic['fo:padding-top'] !== undefined ? lengthOf(ctx, graphic['fo:padding-top']) : DEFAULT_PAD_Y_PT;
    const padBottom = graphic['fo:padding-bottom'] !== undefined ? lengthOf(ctx, graphic['fo:padding-bottom']) : DEFAULT_PAD_Y_PT;
    const html = container ? ctx.reader.blocks(container, textLayers(el), box.w - padLeft - padRight) : '';
    const hasText = hasContent(html);
    const known = !!shape.kind;
    // Une forme sans fond, sans trait ni texte ne montre rien : elle n'est pas reprise.
    if (!fill.hex && !stroke.hex && !hasText) return;
    if (!known) { count(ctx, 'shapes'); shape = { kind: 'rect', adj: '' }; }
    losses.forEach(key => count(ctx, key));
    const rectLike = shape.kind === 'rect';
    const plain = rectLike && !fill.hex && !stroke.hex;
    const anchor = ANCHORS[graphic['draw:textarea-vertical-align']] || 't';
    const edge = stroke.hex ? stroke.width : 0;
    // Le texte d'une forme est centré dans sa boîte : un objet à fond ou à trait dont le texte est centré ou en bas devient une forme (un rectangle) ; un texte posé (sans fond ni trait) reste un cadre de texte, que sa
    // boîte suit en descendant là où le texte est (plus bas), la hauteur du texte étant mesurée.
    const frame = {
      x: box.x, y: box.y, w: box.w, h: box.h, shape: rectLike ? (hasText && (anchor === 't' || (plain && !box.rot)) ? '' : 'rect') : shape.kind,
      fill: fill.hex ? '#' + fill.hex : '', line: stroke.hex ? '#' + stroke.hex : '', lw: edge, fillTr: fill.tr, lineTr: stroke.tr, dash: edge ? stroke.dash : '', cap: edge ? stroke.cap : '', rot: box.rot,
      layer: env.layer || '', alt: altOf(el), link: objectLink(el, env),
    };
    Object.assign(frame, ShapeGeometry.frameOfShape(frame.shape, box, edge, shape.adj, frame.cap));
    if (plain) {
      frame.x += padLeft - FRAME_PAD_X_PT;
      frame.w += 2 * FRAME_PAD_X_PT - padLeft - padRight;
      frame.y += padTop - FRAME_PAD_Y_PT;
      frame.h += 2 * FRAME_PAD_Y_PT - padTop - padBottom;
    }
    if (hasText && plain && !box.rot && anchor !== 't') {
      const natural = measuredHeight(ctx, frame, html);
      if (natural < frame.h - 1) {
        frame.y += anchor === 'b' ? frame.h - natural : (frame.h - natural) / 2;
        frame.h = natural;
      }
    }
    env.frames.push(FreeFrame.html(frame, hasText ? html : '<p></p>'));
    ctx.objects += 1;
  }

  // Un trait ou un connecteur : une ligne droite entre ses deux bouts, avec les pointes du fichier.
  function lineObject(el, env) {
    const ctx = env.ctx;
    const graphic = ctx.reader.props(styleLayers(el), 'graphic');
    const stroke = strokeOf(ctx, graphic);
    const start = [lengthOf(ctx, attr(el, 'svg:x1')), lengthOf(ctx, attr(el, 'svg:y1'))];
    const end = [lengthOf(ctx, attr(el, 'svg:x2')), lengthOf(ctx, attr(el, 'svg:y2'))];
    if (!stroke.hex) return;
    const flip = (start[0] > end[0] ? 'h' : '') + (start[1] > end[1] ? 'v' : '');
    env.frames.push(FreeFrame.html({
      x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), w: Math.abs(end[0] - start[0]), h: Math.abs(end[1] - start[1]), shape: ShapeGeometry.LINE, flip,
      line: '#' + stroke.hex, lw: stroke.width, lineTr: stroke.tr, dash: stroke.dash, cap: stroke.cap, head: endOf(graphic['draw:marker-start']), tail: endOf(graphic['draw:marker-end']), layer: env.layer || '', alt: altOf(el), link: objectLink(el, env),
    }, ''));
    ctx.objects += 1;
  }

  // Une image : le cadre qui la porte, à la boîte du fichier (élargie des marges d'un cadre : le cadre pose l'image à l'intérieur de ses marges).
  function pictureObject(el, node, env) {
    const ctx = env.ctx;
    const image = ctx.reader.ctx.images.get(node);
    if (!image || image.unsupported) { count(ctx, 'images'); return; }
    const graphic = ctx.reader.props(styleLayers(el), 'graphic');
    const clip = /rect\(\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)/.exec(graphic['fo:clip'] || '');
    if ((clip && clip.slice(1, 5).some(value => Math.abs(parseFloat(value)) > 0.001)) || (graphic['style:mirror'] && graphic['style:mirror'] !== 'none')) count(ctx, 'imageEffects');
    const box = boxOf(ctx, el);
    const opacity = percentOf(graphic['draw:image-opacity'], 100) / 100;
    const alt = altOf(el);
    const img = '<img class="editor-image" src="' + escAttr(image.src) + '" alt="' + escAttr(alt) + '" style="width: ' + fixed(box.w * PX_PER_PT) + 'px' + (opacity < 1 ? '; opacity: ' + fixed(opacity) : '') + '">';
    env.frames.push(FreeFrame.html({ x: box.x - FRAME_PAD_X_PT, y: box.y - FRAME_PAD_Y_PT, w: box.w + 2 * FRAME_PAD_X_PT, h: box.h + 2 * FRAME_PAD_Y_PT, rot: box.rot, layer: env.layer || '', alt, link: objectLink(el, env) }, '<p>' + img + '</p>'));
    ctx.objects += 1;
  }

  // Un cadre (`draw:frame`) : une zone de texte, une image, un tableau, ou un objet que l'éditeur ne porte pas (graphique, objet incorporé, son, vidéo : comptés).
  async function frameObject(el, env) {
    const ctx = env.ctx;
    const holder = attr(el, 'presentation:class') || '';
    if (env.layer && holder && PLACEHOLDER_CLASSES.has(holder)) return;   // un emplacement de la maîtresse n'est pas montré sur la diapositive
    const textBox = child(el, 'draw:text-box');
    if (textBox) { await textObject(el, textBox, env, { kind: 'rect', adj: '' }); return; }
    // Un tableau porte aussi l'image de son aperçu (`draw:image`) : il passe avant l'image.
    if (child(el, 'table:table')) { await tableObject(el, env); return; }
    const image = child(el, 'draw:image');
    if (image) { pictureObject(el, image, env); return; }
    const object = child(el, ['draw:object', 'draw:object-ole']);
    if (object) { count(ctx, (await isChart(ctx, object)) ? 'charts' : 'embedded'); return; }
    if (child(el, ['draw:plugin', 'draw:floating-frame', 'draw:applet'])) { count(ctx, 'media'); return; }
    if (holder === 'page' || holder === 'handout') return;
  }
  // Un graphique : l'objet incorporé dont le contenu est un `office:chart`.
  async function isChart(ctx, object) {
    const href = String(attr(object, 'xlink:href') || '').replace(/^\.\//, '').replace(/\/$/, '');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    const file = ctx.odf.fileOf(href + '/content.xml');
    if (!file) return false;
    try {
      return /<office:chart\b/.test((await file.async('string')).slice(0, 6000));
    } catch (e) {
      return false;
    }
  }
  // Un tableau : le tableau de l'éditeur dans un cadre libre, à la boîte du fichier.
  async function tableObject(el, env) {
    const ctx = env.ctx;
    const box = boxOf(ctx, el);
    const html = ctx.reader.blocks(el, styleLayers(el), box.w);
    if (!/<table\b/.test(html)) return;
    env.frames.push(FreeFrame.html({ x: box.x - FRAME_PAD_X_PT, y: box.y - FRAME_PAD_Y_PT, w: box.w + 2 * FRAME_PAD_X_PT, h: box.h + 2 * FRAME_PAD_Y_PT, rot: 0, layer: env.layer || '', alt: altOf(el) }, html));
    ctx.objects += 1;
  }

  // Un objet qui porte une action au clic (`office:event-listeners` : aller à une diapositive, ouvrir un document, un programme, un son...) : que l'éditeur ne reprend pas.
  function hasClickAction(el) {
    const listeners = child(el, 'office:event-listeners');
    return !!listeners && children(listeners, 'presentation:event-listener').some(listener => (attr(listener, 'presentation:action') || 'none') !== 'none');
  }
  // Le lien d'un objet tel que le cadre de l'éditeur le porte (`data-ff-link`, js/frame-link.js), d'après son écouteur de clic (`presentation:action` : adresse, diapositive visée, saut du diaporama) ou la balise `draw:a`
  // qui l'entoure. Une diapositive visée est notée (`ctx.linkedSlides`) : elle reçoit son signet. Une action sans équivalent (ouvrir un programme, un son...) n'est pas un lien : elle est comptée.
  const SHOW_ACTIONS = { 'next-page': 'next', 'previous-page': 'prev', 'first-page': 'first', 'last-page': 'last', 'last-visited-page': 'back', stop: 'end' };
  function linkTarget(ctx, href) {
    let text = String(href || '').trim();
    if (text.charAt(0) === '#') {
      try { text = decodeURIComponent(text); } catch (e) { /* le texte tel quel */ }
      const n = ctx.pageNumbers.get(text.slice(1));
      if (!n) return '';
      ctx.linkedSlides.add(n);
      return '#' + SLIDE_ANCHOR + n;
    }
    return /^(https?:|mailto:|tel:)/i.test(text) ? FrameLink.text(text) : '';
  }
  const SLIDE_ANCHOR = 'slide-';
  function objectLink(el, env) {
    if (env.layer) return '';
    const listeners = child(el, 'office:event-listeners');
    const listener = listeners ? children(listeners, 'presentation:event-listener').find(node => (attr(node, 'presentation:action') || 'none') !== 'none') : null;
    let link = '';
    if (listener) {
      const action = attr(listener, 'presentation:action');
      link = SHOW_ACTIONS[action] ? FrameLink.hrefOfAction(SHOW_ACTIONS[action]) : (action === 'show' ? linkTarget(env.ctx, attr(listener, 'xlink:href')) : '');
    } else if (env.href) {
      link = linkTarget(env.ctx, env.href);
    }
    if (link) { env.ctx.carried.add(el); env.ctx.carriedN += 1; }
    return link;
  }
  // Un tracé libre (`draw:path`, `draw:polygon`, `draw:polyline`) : la forme libre de l'éditeur avec le fond, le trait et le texte du fichier ; illisible ou trop détaillé, il est compté. Un polygone est fermé, une ligne
  // brisée n'a pas de fond ; les pointes d'un tracé ouvert (`draw:marker-start`, `draw:marker-end`) ne sont pas reprises (comptées).
  async function freeObject(el, env) {
    const ctx = env.ctx;
    const tag = name(el);
    const box = boxOf(ctx, el);
    const commands = tag === 'draw:path' ? svgCommands(attr(el, 'svg:d')) : pointsCommands(attr(el, 'draw:points'), tag === 'draw:polygon');
    const subpaths = commands ? [{ commands, noFill: tag === 'draw:polyline', noStroke: false }] : [];
    const kind = subpaths.length ? freeKind(subpaths, viewOf(attr(el, 'svg:viewBox')) || boundsOf(subpaths), box) : '';
    if (!kind) { count(ctx, 'freeDrawings'); return; }
    const graphic = ctx.reader.props(styleLayers(el), 'graphic');
    if (tag !== 'draw:polygon' && ((graphic['draw:marker-start'] && graphic['draw:marker-start'] !== 'none') || (graphic['draw:marker-end'] && graphic['draw:marker-end'] !== 'none'))) count(ctx, 'pathEnds');
    await textObject(el, el, env, { kind, adj: '' });
  }

  // Les objets d'une page (diapositive ou page maîtresse) dans l'ordre du fichier ; les groupes sont mis à plat.
  async function objectsOf(parent, env) {
    for (const el of kids(parent)) {
      if (env.seen >= MAX_OBJECTS) { count(env.ctx, 'unreadable'); return; }
      env.seen += 1;
      const tag = name(el);
      try {
        switch (tag) {
          case 'draw:frame': await frameObject(el, env); break;
          case 'draw:custom-shape': case 'draw:rect': case 'draw:ellipse': case 'draw:circle': case 'draw:caption': await textObject(el, el, env); break;
          case 'draw:line': case 'draw:connector': lineObject(el, env); break;
          case 'draw:g': await objectsOf(el, env); break;
          case 'draw:polyline': case 'draw:polygon': case 'draw:path': await freeObject(el, env); break;
          case 'draw:a': {
            // Les objets d'une balise `draw:a` partent avec son adresse ; si aucun ne peut la porter, elle est comptée.
            const before = env.ctx.carriedN;
            const outer = env.href;
            env.href = attr(el, 'xlink:href');
            await objectsOf(el, env);
            env.href = outer;
            if (!env.layer && attr(el, 'xlink:href') && env.ctx.carriedN === before) count(env.ctx, 'objectLinks');
            break;
          }
          case 'draw:regular-polygon': case 'draw:measure': case 'draw:control': count(env.ctx, 'freeDrawings'); break;
          default:
            if (/^dr3d:/.test(tag)) count(env.ctx, 'shapes');
            break;
        }
      } catch (e) {
        count(env.ctx, 'unreadable');
      }
      if (!env.layer && hasClickAction(el) && !env.ctx.carried.has(el)) count(env.ctx, 'objectLinks');
    }
  }

  // --- Une diapositive ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le texte brut des notes : les paragraphes de la zone de notes, un par ligne.
  function plainText(el) {
    let out = '';
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 || node.nodeType === 4) { out += node.nodeValue.replace(/[ \t\r\n]+/g, ' '); continue; }
      if (node.nodeType !== 1) continue;
      const tag = name(node);
      if (tag === 'text:s') out += ' '.repeat(Math.min(1000, Math.max(1, parseInt(attr(node, 'text:c'), 10) || 1)));
      else if (tag === 'text:tab') out += '\t';
      else if (tag === 'text:line-break') out += '\n';
      else out += plainText(node);
    }
    return out;
  }
  function notesOf(pageEl) {
    const notes = child(pageEl, 'presentation:notes');
    if (!notes) return '';
    const frame = children(notes, 'draw:frame').find(candidate => attr(candidate, 'presentation:class') === 'notes');
    const box = frame ? child(frame, 'draw:text-box') : null;
    if (!box) return '';
    const lines = [];
    const walk = (parent) => {
      kids(parent).forEach((part) => {
        const tag = name(part);
        if (tag === 'text:p' || tag === 'text:h') lines.push(plainText(part).trim());
        else if (tag === 'text:list' || tag === 'text:list-item' || tag === 'text:list-header') walk(part);
      });
    };
    walk(box);
    return lines.join('\n').replace(/\n+$/, '');
  }
  // Le passage à la suivante : la durée automatique (`presentation:duration`, « PT00H00M05S », en millisecondes) et l'effet (`smil:type`) ramené à ceux de l'éditeur, ou à un fondu (compté).
  const TRANSITIONS = { fade: 'fade', pushWipe: 'push', slideWipe: 'cover', barWipe: 'wipe', irisWipe: 'circle', fourBoxWipe: 'diamond', blindsWipe: 'blinds', checkerBoardWipe: 'blinds', miscDiagonalWipe: 'wipe' };
  const SPEED_MS = { slow: 1000, medium: 700, fast: 400 };
  const SIDES = { fromLeft: 'r', fromRight: 'l', fromTop: 'b', fromBottom: 't', leftToRight: 'r', rightToLeft: 'l', topToBottom: 'b', bottomToTop: 't' };
  function durationOf(text) {
    const found = /^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(String(text || '').replace(/^PT/i, 'P'));
    return found ? ((Number(found[1] || 0) * 60 + Number(found[2] || 0)) * 60 + Number(found[3] || 0)) * 1000 : 0;
  }
  function transitionOf(ctx, props) {
    const out = {};
    const advance = props['presentation:transition-type'] === 'automatic' || props['presentation:duration'] ? durationOf(props['presentation:duration']) : 0;
    if (advance > 0) out.advance = advance;
    const type = props['smil:type'];
    if (!type || props['presentation:transition-style'] === 'none') return out;
    let kind = TRANSITIONS[type];
    if (!kind) { kind = 'fade'; count(ctx, 'transitions'); }
    out.transition = kind;
    out.from = SIDES[props['smil:subtype']] || 'r';
    out.dur = SPEED_MS[props['presentation:transition-speed']] || SPEED_MS.medium;
    return out;
  }
  // La durée exacte du passage (`anim:transitionFilter smil:dur="0.9s"`, que LibreOffice et l'export de l'éditeur écrivent dans la page) : elle l'emporte sur les trois vitesses du style.
  function exactDuration(pageEl) {
    const filter = ExportCommon.Odf.descendants(pageEl, 'transitionFilter').find(node => name(node) === 'anim:transitionFilter' && attr(node, 'smil:dur'));
    const found = filter ? /^(\d+(?:\.\d+)?)s$/.exec(attr(filter, 'smil:dur')) : null;
    const ms = found ? Math.round(Number(found[1]) * 1000) : 0;
    return ms >= 100 && ms <= 30000 ? ms : 0;
  }
  // Le décor d'une page maîtresse : ses objets sans emplacement (un logo, un bandeau, un filet), posés DERRIÈRE le texte de la diapositive. Le balisage d'une maîtresse est fait une fois puis recopié sur chaque diapositive qui la montre.
  async function decorOf(ctx, master) {
    const key = attr(master, 'style:name');
    if (ctx.decor.has(key)) return ctx.decor.get(key);
    const env = { ctx, frames: [], layer: 'behind', seen: 0 };
    await objectsOf(master, env);
    const html = env.frames.join('');
    ctx.decor.set(key, html);
    return html;
  }
  async function slideOf(pageEl, ctx) {
    const env = { ctx, frames: [], layer: '', seen: 0 };
    const master = masterOf(ctx, pageEl);
    const pageProps = ctx.reader.props([['drawing-page', attr(pageEl, 'draw:style-name')]], 'drawingPage');
    const masterProps = master ? ctx.reader.props([['drawing-page', attr(master, 'draw:style-name')]], 'drawingPage') : {};
    // Le fond : celui de la diapositive, sinon celui de sa page maîtresse ; un dégradé ou une image est remplacé par une couleur unie (compté).
    const background = pageProps['draw:fill'] ? pageProps : masterProps;
    const losses = new Set();
    let backgroundHex = '';
    if (background['draw:fill'] === 'solid') backgroundHex = colorOf(background['draw:fill-color']);
    else if (background['draw:fill'] === 'gradient') { backgroundHex = (ctx.gradients.get(background['draw:fill-gradient-name']) ? averageHex(ctx.gradients.get(background['draw:fill-gradient-name'])) : ''); losses.add('slidePatterns'); }
    else if (background['draw:fill'] && background['draw:fill'] !== 'none') { backgroundHex = colorOf(background['draw:fill-color']); losses.add('slidePatterns'); }
    losses.forEach(key => count(ctx, key));
    // Le décor de la maîtresse, sauf pour une diapositive qui le cache (« Objets de l'arrière-plan » décoché) ; il n'est plus recopié une fois son budget atteint.
    if (master && pageProps['presentation:background-objects-visible'] !== 'false' && masterProps['presentation:background-objects-visible'] !== 'false') {
      const decor = await decorOf(ctx, master);
      if (decor) {
        if (ctx.decorBytes + decor.length <= MAX_DECOR_BYTES) { ctx.decorBytes += decor.length; env.frames.push(decor); } else count(ctx, 'masterObjects');
      }
    }
    await objectsOf(pageEl, env);
    const animations = ExportCommon.Odf.descendants(pageEl, 'par').filter(node => name(node) === 'anim:par' && /^(on-click|with-previous|after-previous)$/.test(attr(node, 'presentation:node-type') || '')).length;
    if (animations) count(ctx, 'animations', animations);
    const props = Object.assign({ bg: backgroundHex && backgroundHex !== 'ffffff' ? '#' + backgroundHex : '', notes: notesOf(pageEl), hidden: pageProps['presentation:visibility'] === 'hidden', section: '' }, transitionOf(ctx, pageProps));
    if (props.transition && exactDuration(pageEl)) props.dur = exactDuration(pageEl);
    return { props, frames: env.frames.join(''), tail: '<p></p>' };
  }

  // --- Le fichier ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const PAGE_BREAK = '<div class="page-break-marker"></div>';
  // Le résultat d'un import, dans la forme de l'import PowerPoint (js/pptx-import.js:importResult) : `slideTexts` (le texte de chaque diapositive, que js/import-placing.js pose une à une), `html` (le texte entier, réuni À LA
  // DEMANDE), `page`, `slideCount`, `report` ; les mesures (`stats`) ne sont pas énumérables.
  function importResult(texts, page, report, stats) {
    const result = { get html() { return texts.join(PAGE_BREAK); }, slideTexts: texts, page, slideCount: texts.length, report };
    Object.defineProperty(result, 'stats', { value: stats });
    return result;
  }
  // Le texte d'une présentation d'après le contenu d'un fichier .odp : { html, slideTexts, page: { orientation, format }, slideCount, report, stats }. `report` : une ligne par genre non repris, { key, n, scope } (`scope` :
  // 'odt' pour les genres que le texte d'un objet compte, qui ont les mots de l'import des documents).
  async function fromBuffer(buffer, options) {
    const startedAt = performance.now();
    if (!buffer || buffer.byteLength > MAX_FILE_BYTES) throw fail('tooBig', 'Ce fichier est trop gros pour être importé.', { size: buffer ? buffer.byteLength : 0, max: MAX_FILE_BYTES });
    const odf = await ExportCommon.Odf.open(buffer, { limits: { maxUnpacked: MAX_UNPACKED_BYTES, maxPart: MAX_PART_BYTES }, messages: MESSAGES });
    if (odf.kind !== 'presentation') throw fail('wrongType', 'Ce fichier OpenDocument n’est pas une présentation.', { kind: odf.kind });
    await ExportEngines.ensure('odtImport').catch((e) => { throw fail('library', 'Le lecteur de texte OpenDocument n’a pas pu se charger.', { cause: e }); });
    const reader = await OdtImport.presentationReader(odf);
    const pages = children(odf.body, 'draw:page');
    if (!pages.length) throw fail('empty', 'Cette présentation n’a aucune diapositive.');
    const masters = new Map(reader.styles.masters.map(master => [attr(master, 'style:name'), master]));
    const firstMaster = masters.get(attr(pages[0], 'draw:master-page-name')) || reader.styles.masters[0] || null;
    const size = sizeOfMaster({ styles: reader.styles }, firstMaster);
    const page = pageFor(size.widthPt, size.heightPt);
    const dashes = new Map();
    odf.sections('office:styles').forEach((holder) => { children(holder, 'draw:stroke-dash').forEach((dash) => { dashes.set(attr(dash, 'draw:name'), dash); }); });
    const ctx = {
      odf, reader, styles: reader.styles, masters, firstMaster, k: page.k, report: new Map(), objects: 0, pageNumbers: new Map(), linkedSlides: new Set(), carried: new WeakSet(), carriedN: 0, decor: new Map(), decorBytes: 0, gradients: gradientsOf(odf), dashes, host: null,
    };
    if (pages.length > MAX_SLIDES) { count(ctx, 'slidesCut', pages.length - MAX_SLIDES); pages.length = MAX_SLIDES; }
    pages.forEach((pageEl, i) => { const pageName = attr(pageEl, 'draw:name'); if (pageName && !ctx.pageNumbers.has(pageName)) ctx.pageNumbers.set(pageName, i + 1); });
    const onProgress = options && typeof options.onProgress === 'function' ? options.onProgress : null;
    const shouldStop = options && typeof options.shouldStop === 'function' ? options.shouldStop : null;
    // Les polices de l'éditeur sont prêtes avant qu'un texte soit mesuré : Roboto ne se charge qu'au premier texte qui s'en sert (css/roboto-fonts.css).
    if (document.fonts && document.fonts.load) await Promise.all(ROBOTO_FACES.map(face => document.fonts.load(face).catch(() => null)));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const texts = [];
    const heads = [];   // le repère de chaque diapositive : ses mesures, pour lui poser un signet une fois toutes lues
    try {
      for (let i = 0; i < pages.length; i++) {
        if (shouldStop && shouldStop()) throw fail('cancelled', 'Import annulé.');
        let slide;
        try {
          slide = await slideOf(pages[i], ctx);
        } catch (e) {
          count(ctx, 'unreadable');
          slide = { props: {}, frames: '', tail: '<p></p>' };
        }
        const head = SlideProps.html(slide.props);
        heads.push({ props: slide.props, length: head.length });
        texts.push(head + slide.frames + slide.tail);
        if (onProgress) { try { onProgress({ done: i + 1, total: pages.length }); } catch (e) { /* l'affichage de l'avancement ne fait jamais échouer l'import */ } }
        // La page reprend la main entre deux diapositives (une présentation de plusieurs centaines ne fige rien).
        if (i % 10 === 9) await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
    } finally {
      if (ctx.host) ctx.host.remove();
    }
    // Le signet d'une diapositive que vise un lien d'une autre (ou d'elle-même), dans son repère.
    ctx.linkedSlides.forEach((n) => {
      const head = heads[n - 1];
      if (head) texts[n - 1] = SlideProps.html(Object.assign({}, head.props, { anchorId: SLIDE_ANCHOR + n, anchorName: I18n.t('pptx.import.slideAnchor', { n }) })) + texts[n - 1].slice(head.length);
    });
    const images = Array.from(reader.ctx.images.values()).filter(image => image && image.src);
    const stats = { fileBytes: buffer.byteLength, slides: texts.length, objects: ctx.objects, heavy: buffer.byteLength >= HEAVY_FILE_BYTES, images: images.length, imageBytes: reader.ctx.imageBytes, holders: [], ms: Math.round(performance.now() - startedAt) };
    const own = REPORT_KEYS.filter(key => ctx.report.get(key) > 0).map(key => ({ key, n: ctx.report.get(key), scope: 'odp' }));
    const text = reader.report().filter(item => TEXT_KEYS.indexOf(item.key) >= 0 && !own.some(entry => entry.key === item.key)).map(item => ({ key: item.key, n: item.n, scope: 'odt' }));
    return importResult(texts, { orientation: page.orientation, format: page.format }, own.concat(text), stats);
  }
  async function fromFile(file, options) {
    if (!file || file.size > MAX_FILE_BYTES) throw fail('tooBig', 'Ce fichier est trop gros pour être importé.', { size: file ? file.size : 0, max: MAX_FILE_BYTES });
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’a pas pu être lu.', { cause: e });
    }
    return fromBuffer(buffer, options);
  }

  return { fromFile, fromBuffer, pageFor, MAX_FILE_BYTES, MAX_UNPACKED_BYTES, MAX_SLIDES, HEAVY_FILE_BYTES, REPORT_KEYS };
})();
