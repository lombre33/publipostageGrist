// Assemblage avant impression (demande d'Antoine du 02/10 : « 4 A6 sur une A4 », avec ou sans trait de coupe, sur A3 et A4) : la GÉOMÉTRIE d'une planche - combien de pages du modèle tiennent sur
// une feuille, où chacune se pose, où passent les traits de coupe. Pure (aucun accès au DOM) : la fenêtre (js/sheet-assembly-dialog.js) en dessine l'aperçu et js/pdf-merge.js (createSheets) la
// peint dans le PDF avec les mêmes nombres - ce que l'aperçu montre est ce que le fichier porte, comme pour le filigrane (js/page-layer.js).
// Mesures en points (1/72 de pouce, l'unité du PDF), origine en HAUT À GAUCHE, y vers le bas ; js/pdf-merge.js retourne y pour pdf-lib. Les dimensions de la page et des feuilles viennent de PageLayout
// (sa table FORMATS : A4 = 595,28 x 841,89 pt), jamais d'une conversion de millimètres : deux A6 en largeur font EXACTEMENT l'A4 (297,64 x 2 = 595,28), un arrondi de plus les en ferait sortir.
//  - Sans traits de coupe, les pages se touchent et gardent leur taille : la grille est centrée sur la feuille, rien n'est réduit (4 A6 = 210 x 296 mm sur 210 x 297).
//  - Avec traits de coupe, chaque ligne de coupe porte deux repères hors de la grille (décalés de 3 mm, longs de 4 mm, comme les traits de coupe d'InDesign) : il faut donc 7 mm de marge autour d'elle.
//    Quand la feuille ne les laisse pas (4 A6 sur une A4), TOUTES les pages sont réduites du même facteur ; l'échelle est dite dans la fenêtre, jamais appliquée en silence.
//  - Les emplacements se suivent de gauche à droite puis de haut en bas : la ligne 1 de la table en haut à gauche, la suivante à sa droite, puis la rangée du dessous.
const SheetLayout = (function () {
  // Les feuilles proposées (demande d'Antoine : A3 et A4) et les deux sens ; les dimensions de chaque couple se lisent à PageLayout.
  const SHEETS = ['A4', 'A3'];
  const ORIENTATIONS = ['portrait', 'landscape'];
  const MM_TO_PT = 72 / 25.4;
  // Traits de coupe : décalage depuis la ligne de coupe, longueur et épaisseur (pt). `zone` : la marge qu'ils demandent autour de la grille.
  const MARK = { offset: 3 * MM_TO_PT, length: 4 * MM_TO_PT, width: 0.5 };
  const MARK_ZONE = MARK.offset + MARK.length;
  // Tolérance des comparaisons en points : un écart de table d'un centième ne retire pas un emplacement ; sous cet écart à 1, l'échelle vaut 1.
  const EPS = 0.05;
  const SCALE_EPS = 0.0005;

  function sheetSize(sheet, orientation) { return PageLayout.pageSizePtFor(orientation, sheet); }

  // Combien de pages entières tiennent sur la feuille, en largeur et en hauteur, sans rien réduire (0 : la page est plus grande que la feuille dans ce sens).
  function maxGrid(sheet, page) {
    return { cols: Math.max(0, Math.floor((sheet.width + EPS) / page.width)), rows: Math.max(0, Math.floor((sheet.height + EPS) / page.height)) };
  }
  function slotCount(grid) { return grid.cols * grid.rows; }

  // Pour cette feuille : le sens qui place le plus de pages, à égalité celui de la page (une page en portrait sur une feuille en portrait), avec sa grille ; null si la page ne tient sur la feuille dans aucun sens.
  function bestOrientation(sheet, page) {
    const portrait = maxGrid(sheetSize(sheet, 'portrait'), page);
    const landscape = maxGrid(sheetSize(sheet, 'landscape'), page);
    const np = slotCount(portrait);
    const nl = slotCount(landscape);
    if (np + nl === 0) return null;
    const orientation = nl > np || (nl === np && page.width > page.height) ? 'landscape' : 'portrait';
    const grid = orientation === 'landscape' ? landscape : portrait;
    return { sheet, orientation, cols: grid.cols, rows: grid.rows };
  }

  // Le réglage par défaut pour ces pages : la feuille A4 (celle de tout le monde), l'A3 seulement si l'A4 n'en reçoit aucune. Rend null si aucune feuille ne reçoit la page.
  function best(page) {
    for (const sheet of SHEETS) {
      const choice = bestOrientation(sheet, page);
      if (choice) return choice;
    }
    return null;
  }

  // Les deux repères de chaque ligne de coupe, hors de la grille : en haut et en bas de chaque ligne verticale, à gauche et à droite de chaque ligne horizontale. Les lignes du bord de la grille donnent
  // les huit repères de coin ordinaires, celles du milieu les repères d'une coupe qui traverse la feuille.
  function cutMarks(x0, y0, cellWidth, cellHeight, cols, rows) {
    const { offset, length } = MARK;
    const top = y0;
    const bottom = y0 + rows * cellHeight;
    const left = x0;
    const right = x0 + cols * cellWidth;
    const out = [];
    for (let c = 0; c <= cols; c++) {
      const x = x0 + c * cellWidth;
      out.push({ x1: x, y1: top - offset, x2: x, y2: top - offset - length }, { x1: x, y1: bottom + offset, x2: x, y2: bottom + offset + length });
    }
    for (let r = 0; r <= rows; r++) {
      const y = y0 + r * cellHeight;
      out.push({ x1: left - offset, y1: y, x2: left - offset - length, y2: y }, { x1: right + offset, y1: y, x2: right + offset + length, y2: y });
    }
    return out;
  }

  // La planche : { sheet, page } en points ({ width, height }), `cols` x `rows` emplacements, `marks` vrai pour les traits de coupe. Rend l'échelle des pages (1 sauf si les traits ne tiennent pas),
  // la grille centrée sur la feuille (x0, y0 : son coin haut gauche) et chaque emplacement { index, col, row, x, y, width, height } dans l'ordre de lecture.
  function compute(opts) {
    const sheet = { width: opts.sheet.width, height: opts.sheet.height };
    const page = { width: opts.page.width, height: opts.page.height };
    const cols = Math.max(1, Math.floor(opts.cols) || 1);
    const rows = Math.max(1, Math.floor(opts.rows) || 1);
    const hasMarks = !!opts.marks;
    const zone = hasMarks ? MARK_ZONE : 0;
    let scale = Math.min(1, (sheet.width - 2 * zone) / (cols * page.width), (sheet.height - 2 * zone) / (rows * page.height));
    if (scale > 1 - SCALE_EPS) scale = 1;
    const cellWidth = page.width * scale;
    const cellHeight = page.height * scale;
    const x0 = (sheet.width - cols * cellWidth) / 2;
    const y0 = (sheet.height - rows * cellHeight) / 2;
    const slots = [];
    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({ index: i, col, row, x: x0 + col * cellWidth, y: y0 + row * cellHeight, width: cellWidth, height: cellHeight });
    }
    return {
      sheet, page, cols, rows, count: cols * rows, scale, x0, y0, cellWidth, cellHeight, slots, hasMarks,
      cutMarks: hasMarks ? cutMarks(x0, y0, cellWidth, cellHeight, cols, rows) : [],
      markWidth: MARK.width,
    };
  }

  // Le nombre de feuilles qu'il faut pour `pages` pages à `slots` emplacements par feuille.
  function sheetCount(pages, slots) { return slots > 0 ? Math.ceil(pages / slots) : 0; }

  return { SHEETS, ORIENTATIONS, MARK, MARK_ZONE, sheetSize, maxGrid, slotCount, bestOrientation, best, compute, sheetCount };
})();
