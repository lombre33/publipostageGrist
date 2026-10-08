// Bordures des cases d'un tableau de grille (planning/feature-mode-grille-excel.md) : la règle qui décide de la valeur d'un trait, écrite une fois
// pour l'éditeur (js/grid-editor.js), la Lecture, le PDF (js/pdf-export.js) et l'Excel (js/xlsx-export.js) - sinon l'écran, le PDF et le classeur ne
// s'accorderaient pas sur un trait que deux cases se partagent. Pur : ni DOM ni ProseMirror, il lit une description du tableau
//   { width, height, cells: [{ row, col, rowspan, colspan, top, right, bottom, left }] }
// (cases dans l'ordre de lecture ; `row`/`col` = emplacement de départ, `width`/`height` = nombre de colonnes et de lignes du tableau).
//
// Chaque côté d'une case vaut : null = le trait fin gris de départ (le quadrillage), 'auto' = ce même trait fin gris, mais posé par la personne
// (réglage « Par défaut » du stylo), 'none' = pas de trait, '#rrggbb' = trait fin de cette couleur. Une case garde une valeur par côté, écrite sur
// les deux cases voisines d'un trait qu'elles se partagent ; une case fusionnée n'a, elle aussi, qu'une valeur par côté : tous les traits de ce côté
// (et les cases d'en face) forment un seul groupe qui prend la même valeur.
//
// Le quadrillage (null) peut être masqué en Lecture et dans les exports (`data-grid-lines="off"` sur le tableau, js/grid-editor.js) ; un trait posé
// par la personne reste, lui : 'auto' sert à le distinguer du quadrillage (`drawn`).
//
// Un groupe, quand ses membres divergent (fusion, ligne ou colonne supprimée, HTML d'ailleurs) : « pas de trait » l'emporte, puis la première couleur
// dans l'ordre de lecture (case de gauche ou du dessus ; 'auto' compte pour une couleur), sinon le trait de départ. C'est la règle des bordures
// fusionnées de CSS (`border-collapse: collapse`) : l'éditeur l'applique en écrivant la valeur choisie sur toutes les cases du groupe, et les exports
// la rejouent sur ce qu'ils lisent.
const TableBorders = (function () {
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const NONE = 'none';
  const AUTO = 'auto';
  const COLOR_RE = /^#[0-9a-f]{6}$/;

  // Réglages du menu « Bordures » d'une grille ; `none` pose « pas de trait » partout, les autres posent la couleur du stylo (null = trait de
  // départ).
  const PRESET_PARTS = {
    all: ['top', 'bottom', 'left', 'right', 'inner'],
    outer: ['top', 'bottom', 'left', 'right'],
    inner: ['inner'],
    top: ['top'],
    bottom: ['bottom'],
    left: ['left'],
    right: ['right'],
    none: ['top', 'bottom', 'left', 'right', 'inner'],
  };
  const PRESETS = Object.keys(PRESET_PARTS);

  // Une valeur de côté connue (null, 'none', 'auto' ou '#rrggbb' en minuscules) ; tout le reste vaut null : un attribut `data-border-*` abîmé ne
  // casse rien.
  function normalizeValue(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (text === NONE || text === AUTO) return text;
    return COLOR_RE.test(text) ? text : null;
  }

  function combine(current, value) {
    if (current === NONE || value === NONE) return NONE;
    return current || value;
  }
  // La valeur que prend un trait fait de plusieurs : le premier gagne parmi les couleurs, « pas de trait » devant tout.
  function combineAll(values) {
    return values.reduce((acc, value) => combine(acc, normalizeValue(value)), null);
  }

  function edgeKey(edge) { return edge.kind + ':' + edge.row + ':' + edge.col; }

  // Les traits de la grille : `h` = trait horizontal au-dessus de la ligne `row` (0 = bord haut, `height` = bord bas) sous la colonne `col` ; `v` =
  // trait vertical à gauche de la colonne `col` (0 = bord gauche, `width` = bord droit) le long de la ligne `row`. Un trait entre deux cases relie
  // leurs deux côtés ; un trait à l'intérieur d'une case fusionnée n'existe pas. Chaque côté de case (case × 4 + côté) est un nœud, les traits les
  // relient : un groupe = une valeur.
  function analyze(spec) {
    const { width, height, cells } = spec;
    const owner = new Array(width * height).fill(-1);
    cells.forEach((cell, index) => {
      const rows = Math.max(1, cell.rowspan || 1);
      const cols = Math.max(1, cell.colspan || 1);
      for (let r = cell.row; r < Math.min(height, cell.row + rows); r++) {
        for (let c = cell.col; c < Math.min(width, cell.col + cols); c++) owner[r * width + c] = index;
      }
    });
    const parent = Array.from({ length: cells.length * 4 }, (_, n) => n);
    const find = (n) => {
      while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; }
      return n;
    };
    const edges = new Map();
    const link = (kind, row, col, first, second) => {
      const nodes = [first, second].filter(n => n >= 0);
      if (!nodes.length) return;
      if (nodes.length === 2) {
        // La plus petite racine reste : le premier nœud dans l'ordre de lecture donne sa valeur au groupe.
        const a = find(nodes[0]);
        const b = find(nodes[1]);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
      edges.set(kind + ':' + row + ':' + col, nodes[0]);
    };
    const side = (index, name) => (index >= 0 ? index * 4 + SIDES.indexOf(name) : -1);
    for (let r = 0; r <= height; r++) {
      for (let c = 0; c < width; c++) {
        const below = r < height ? owner[r * width + c] : -1;
        const above = r > 0 ? owner[(r - 1) * width + c] : -1;
        if (below >= 0 && below === above) continue;
        link('h', r, c, side(below, 'top'), side(above, 'bottom'));
      }
    }
    for (let r = 0; r < height; r++) {
      for (let c = 0; c <= width; c++) {
        const right = c < width ? owner[r * width + c] : -1;
        const left = c > 0 ? owner[r * width + c - 1] : -1;
        if (right >= 0 && right === left) continue;
        link('v', r, c, side(right, 'left'), side(left, 'right'));
      }
    }
    return { find, edges };
  }

  // La valeur de chaque groupe : celle de ses membres, combinée selon la règle ci-dessus.
  function groupValues(spec, analysis) {
    const values = new Map();
    for (let n = 0; n < spec.cells.length * 4; n++) {
      const root = analysis.find(n);
      values.set(root, combine(values.has(root) ? values.get(root) : null, normalizeValue(spec.cells[n >> 2][SIDES[n & 3]])));
    }
    return values;
  }

  function sidesOf(spec, analysis, values) {
    return spec.cells.map((cell, index) => ({
      top: values.get(analysis.find(index * 4)),
      right: values.get(analysis.find(index * 4 + 1)),
      bottom: values.get(analysis.find(index * 4 + 2)),
      left: values.get(analysis.find(index * 4 + 3)),
    }));
  }

  // Les côtés de chaque case, une fois les traits qu'elles se partagent mis d'accord (même ordre que `spec.cells`).
  function resolve(spec) {
    const analysis = analyze(spec);
    return sidesOf(spec, analysis, groupValues(spec, analysis));
  }

  // Comme `resolve`, après avoir posé `value` sur chaque groupe qui contient un des traits `edges` : ce que la personne vient de choisir l'emporte,
  // même sur « pas de trait ».
  function set(spec, edges, value) {
    const analysis = analyze(spec);
    const values = groupValues(spec, analysis);
    const wanted = normalizeValue(value);
    edges.forEach((edge) => {
      const node = analysis.edges.get(edgeKey(edge));
      if (node !== undefined) values.set(analysis.find(node), wanted);
    });
    return sidesOf(spec, analysis, values);
  }

  // La valeur courante de chaque trait demandé (null pour un trait qui n'existe pas) : de quoi calculer les côtés d'une case qui en remplace
  // plusieurs.
  function valuesOf(spec, edges) {
    const analysis = analyze(spec);
    const values = groupValues(spec, analysis);
    return edges.map((edge) => {
      const node = analysis.edges.get(edgeKey(edge));
      return node === undefined ? null : values.get(analysis.find(node));
    });
  }

  // Ceux des traits `edges` qui existent vraiment : un trait à l'intérieur d'une case fusionnée n'en fait pas partie.
  function usableEdges(spec, edges) {
    const analysis = analyze(spec);
    return edges.filter(edge => analysis.edges.has(edgeKey(edge)));
  }

  // Les traits qu'un réglage du menu vise pour des cases formant le rectangle `rect` ({ left, top, right, bottom } : `right` et `bottom` exclus, en
  // emplacements de la grille).
  function presetEdges(preset, rect) {
    const parts = PRESET_PARTS[preset] || [];
    const { left, top, right, bottom } = rect;
    const out = [];
    const horizontal = (row, from, to) => { for (let c = from; c < to; c++) out.push({ kind: 'h', row, col: c }); };
    const vertical = (col, from, to) => { for (let r = from; r < to; r++) out.push({ kind: 'v', row: r, col }); };
    if (parts.includes('top')) horizontal(top, left, right);
    if (parts.includes('bottom')) horizontal(bottom, left, right);
    if (parts.includes('left')) vertical(left, top, bottom);
    if (parts.includes('right')) vertical(right, top, bottom);
    if (parts.includes('inner')) {
      for (let r = top + 1; r < bottom; r++) horizontal(r, left, right);
      for (let c = left + 1; c < right; c++) vertical(c, top, bottom);
    }
    return out;
  }

  // La valeur que pose un réglage : « Aucune » = pas de trait, les autres la couleur du stylo (« Par défaut » : le trait de départ, posé pour de
  // bon, donc 'auto' et non null : null est le quadrillage, que la personne peut masquer).
  function valueFor(preset, color) {
    return preset === 'none' ? NONE : normalizeValue(color) || AUTO;
  }

  // Les côtés d'une case tels que la Lecture et les exports les dessinent : null = le trait de départ, 'none' = rien, '#rrggbb' = cette couleur. Le
  // quadrillage (null) disparaît quand il est masqué (`gridShown` faux) ; 'auto', lui, est toujours dessiné, comme le trait de départ.
  function drawn(sides, gridShown) {
    const value = side => (side === AUTO ? null : side === null && !gridShown ? NONE : side);
    return { top: value(sides.top), right: value(sides.right), bottom: value(sides.bottom), left: value(sides.left) };
  }

  return { SIDES, NONE, AUTO, PRESETS, normalizeValue, combineAll, resolve, set, valuesOf, usableEdges, presetEdges, valueFor, drawn };
})();
