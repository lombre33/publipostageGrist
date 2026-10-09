// Mode grille (planning/feature-mode-grille-excel.md) : un modèle de type « grille » (colonne TypeModele) n'est pas un texte sur une page A4 mais un
// seul tableau, sans feuille, dont on tire les traits pour régler colonnes et lignes, et que l'export Excel reprend case par case. C'est le même
// éditeur TipTap que les documents : ce module n'ajoute que ce qui fait d'un document « un tableau et rien d'autre » :
//   - un garde-fou (filterTransaction) qui refuse toute modification dont le résultat ne serait plus un seul tableau, ou contiendrait un bloc que la
//     grille ne sait pas exporter : la barre grise ces boutons, le garde-fou tient aussi pour le collage et le clavier ;
//   - la sélection toujours dans une case (jamais le paragraphe vide que TipTap range sous un tableau final, jamais le curseur « gap » après lui) ;
//   - les bandeaux A, B, C / 1, 2, 3, collants au défilement, dont les poignées règlent la largeur d'une colonne et la hauteur d'une ligne (aperçu en
//     direct, une seule transaction au relâcher : un seul Annuler) ; tirer la poignée d'une ligne (d'une colonne) parmi plusieurs choisies par leurs
//     bandeaux les règle toutes à la même taille (`chosenLines`) ; ceux d'un tableau de document (`documentStrips`) règlent la hauteur d'une ligne de même, la bulle en cm ;
//   - la hauteur de ligne (`rowHeight` sur tableRow, plancher = la hauteur de son texte) et la largeur de colonne (`colwidth` de chaque case),
//     toujours posées ;
//   - le saut de page porté par une ligne (`pageBreakBefore`) : le PDF y commence une page, l'Excel une feuille ;
//   - le quadrillage (`gridLines` du tableau) : montré ou masqué en Lecture, dans le PDF et dans l'Excel - les traits que la personne a posés restent,
//     l'éditeur garde le sien ;
//   - le collage dans une case sans les lignes vides de fin (`trimPastedSlice`), et celui d'un tableau de tableur case par case, mise en forme
//     comprise (`transformPastedHTML`, js/grid-table.js) ;
//   - le collage d'un bloc de cases sur des cases choisies, posé en entier depuis la case en haut à gauche (`pasteFromTopLeft`), et « Ligne/Colonne
//     avant/après » qui ajoutent autant de lignes ou de colonnes que la sélection en couvre (`insertLines`) ;
//   - Entrée qui descend d'une case (`enterGoesDown`), Maj+Entrée et Ctrl+Entrée qui ajoutent une ligne dans la case ;
//   - le défilement vers la sélection qui tient compte des bandeaux (`revealSelection`).
// Tout est inerte tant que setActive(true) n'a pas été appelé (js/main.js:loadTemplateIntoEditor), sauf ce que le tableau d'un document partage avec
// la grille - « tout tableau est un tableau de grille à l'usage » : les réglages de la barre du tableau (alignement vertical, bordures, quadrillage)
// visent le tableau qui porte la sélection (`tableInfo`, `scopedTable`), la grille étant le cas où le modèle n'a qu'un tableau ; « Ligne / Colonne avant /
// après » (`insertLines`), la fusion et la scission (`mergeSelected`, `splitSelected`, appelées par js/table-merge.js) et Entrée qui descend d'une case
// (`enterGoesDown`) valent pour les deux ; et un tableau de document qui porte des traits ou des hauteurs les garde quand on y ajoute ou retire une ligne
// (`repairDocumentTables`). Un email, un
// macro-modèle ou un tableau sans trait ni hauteur n'y voient rien. Les classes TipTap/ProseMirror arrivent par configure() (editor.js).
const GridEditor = (function () {
  const el = Dom.el;

  const {
    TYPE, GRID_LINES_OFF, DEFAULT_LINE_COLOR, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_COL_WIDTH_PX, DEFAULT_ROW_HEIGHT_PX, MIN_COL_WIDTH_PX, MAX_COL_WIDTH_PX,
    MAX_ROW_HEIGHT_PX, FORBIDDEN_NODES, CELL_NODES, VALIGNS, DEFAULT_VALIGN, DOCUMENT_VALIGN, BORDER_ATTRS, ROW_EDGES, COLUMN_EDGES,
  } = (function () {
    // Les constantes de la grille : tailles, nœuds interdits, alignement vertical, bords des cases.

    const TYPE = 'grille';
    // `gridLines` du tableau quand le quadrillage de départ est masqué en Lecture et dans les exports (null : montré).
    const GRID_LINES_OFF = 'off';
    // Le gris du trait de départ à l'écran (css/editor-v2.css), celui qu'un trait « auto » porte en ligne pour rester quand le quadrillage est masqué.
    const DEFAULT_LINE_COLOR = '#b8c0c9';
    const DEFAULT_COLS = 6;
    const DEFAULT_ROWS = 15;
    const DEFAULT_COL_WIDTH_PX = 100;
    const DEFAULT_ROW_HEIGHT_PX = 28;
    const MIN_COL_WIDTH_PX = 24;
    const MAX_COL_WIDTH_PX = 1200;
    const MAX_ROW_HEIGHT_PX = 1000;

    // Ce qu'une grille ne sait pas porter, ni à l'écran ni dans l'Excel : un second tableau, des colonnes de texte (le bloc de signature en est une),
    // un sommaire, une citation, un encadré, un bloc de code, un trait horizontal, une note de bas de page, un numéro de page, le saut de page de
    // document (celui d'une grille est porté par une ligne). Une liste, un titre ou une image restent permis : l'Excel les écrit (puces « • », gras et
    // taille, image posée sur la case).
    const FORBIDDEN_NODES = new Set(['table', 'twoColumnsZone', 'twoColumnsColumn', 'toc', 'headingNumberingConfig', 'pageBreak', 'blockquote', 'callout', 'codeBlock',
      'horizontalRule', 'footnoteRef', 'pageNumberBadge']);
    const CELL_NODES = new Set(['tableCell', 'tableHeader']);
    // Alignement vertical d'une case (`verticalAlign`, `vertical-align` en ligne) : au milieu par défaut, comme les en-têtes d'un tableur mis en forme.
    // Posé sur chaque case : l'éditeur, la Lecture, le PDF et l'Excel le lisent au même endroit.
    const VALIGNS = new Set(['top', 'middle', 'bottom']);
    const DEFAULT_VALIGN = 'middle';
    // Celui d'une case de document que personne n'a réglée : en haut (le `vertical-align` du navigateur, ce que les sorties font aussi).
    const DOCUMENT_VALIGN = 'top';
    // Les quatre bords d'une case (js/table-borders.js : null = trait de départ, 'auto' = trait de départ posé par la personne, 'none' = pas de trait,
    // '#rrggbb' = couleur) : un attribut par côté, écrit sur les deux cases d'un trait partagé.
    const BORDER_ATTRS = { top: 'borderTop', right: 'borderRight', bottom: 'borderBottom', left: 'borderLeft' };
    // Les bords qu'une ligne neuve (ou une colonne neuve) reprend de sa voisine : ceux qui la longent (`sides`) et ceux de ses deux bouts (`before`,
    // `after`).
    const ROW_EDGES = { before: BORDER_ATTRS.top, after: BORDER_ATTRS.bottom, sides: [BORDER_ATTRS.left, BORDER_ATTRS.right] };
    const COLUMN_EDGES = { before: BORDER_ATTRS.left, after: BORDER_ATTRS.right, sides: [BORDER_ATTRS.top, BORDER_ATTRS.bottom] };
    return {
      TYPE, GRID_LINES_OFF, DEFAULT_LINE_COLOR, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_COL_WIDTH_PX, DEFAULT_ROW_HEIGHT_PX, MIN_COL_WIDTH_PX, MAX_COL_WIDTH_PX,
      MAX_ROW_HEIGHT_PX, FORBIDDEN_NODES, CELL_NODES, VALIGNS, DEFAULT_VALIGN, DOCUMENT_VALIGN, BORDER_ATTRS, ROW_EDGES, COLUMN_EDGES,
    };
  })();

  let libs = null;
  let editor = null;
  let active = false;
  let strips = null;         // les bandeaux de la grille
  let docStrips = null;      // ceux du tableau de document où se trouve le curseur, posés par-dessus la page (documentStrips)
  let tip = null;
  let lastCellDom = null;    // la case du curseur après la transaction d'avant : sert à voir si celle-ci a changé de case

  function configure(deps) { libs = deps; }
  function isActive() { return active; }
  function isGridType(typeModele) { return typeModele === TYPE; }

  const { withTableAttributes, withRowAttributes, withCellAttributes, serialize, tableInfo } = (function () {
    // Les attributs du tableau, d'une ligne et d'une case (quadrillage, hauteur, largeur, alignement, bords) et l'enregistrement de la grille.

    // `gridLines` : 'off' quand le quadrillage de départ (les traits que la personne n'a pas posés) est masqué en Lecture et dans les exports, null
    // quand il est montré (tout tableau de document, toute grille jusqu'ici : aucun changement de rendu ni de HTML). L'éditeur garde son quadrillage
    // quoi qu'il en soit : l'attribut n'est lu que par la Lecture (css/grid.css) et les exports (js/export-common.js:cellBorderSides), sur
    // `data-grid-lines`, la marque de l'enregistrement.
    function withTableAttributes(TableExtension) {
      return TableExtension.extend({
        addAttributes() {
          const parent = this.parent ? this.parent() : {};
          return Object.assign({}, parent, {
            gridLines: {
              default: null,
              parseHTML: el => (el.getAttribute('data-grid-lines') === GRID_LINES_OFF ? GRID_LINES_OFF : null),
              renderHTML: attrs => (attrs.gridLines === GRID_LINES_OFF ? { 'data-grid-lines': GRID_LINES_OFF } : {}),
            },
          });
        },
      });
    }

    // `rowHeight` : hauteur minimale en px (une ligne que son texte agrandit garde sa hauteur de texte, comme un <tr style="height">). Null pour tout
    // tableau de document : aucun changement de rendu ni de HTML hors grille.
    function withRowAttributes(TableRow) {
      return TableRow.extend({
        addAttributes() {
          const parent = this.parent ? this.parent() : {};
          return Object.assign({}, parent, {
            rowHeight: {
              default: null,
              parseHTML: el => { const px = parseInt(el.getAttribute('data-row-height'), 10); return px > 0 ? px : null; },
              renderHTML: attrs => (attrs.rowHeight ? { 'data-row-height': String(attrs.rowHeight), style: 'height: ' + attrs.rowHeight + 'px' } : {}),
            },
            // Saut de page avant cette ligne : la grille n'a pas de page, mais son PDF et son Excel en ont (une nouvelle page, une nouvelle feuille :
            // js/export-common.js:gridRowSegments). Faux pour toute ligne d'un tableau de document ; `data-page-break-before` est la marque de
            // l'enregistrement, lue par les exports et par le CSS qui trace le trait.
            pageBreakBefore: {
              default: false,
              parseHTML: el => el.getAttribute('data-page-break-before') === 'true',
              renderHTML: attrs => (attrs.pageBreakBefore ? { 'data-page-break-before': 'true' } : {}),
            },
          });
        },
      });
    }

    // Les attributs HTML d'un bord : `data-border-<côté>`, la marque de l'enregistrement, et le `border-*` en ligne, `hidden` pour « pas de trait » (il
    // l'emporte sur le trait de la case voisine, bordures fusionnées). Un trait « auto » a le gris de départ, écrit en ligne : c'est lui qui reste à
    // l'écran quand la Lecture masque le quadrillage.
    function borderHtml(side, value) {
      const v = TableBorders.normalizeValue(value);
      if (!v) return {};
      const line = v === TableBorders.NONE ? 'hidden' : '1px solid ' + (v === TableBorders.AUTO ? DEFAULT_LINE_COLOR : v);
      return { ['data-border-' + side]: v, style: 'border-' + side + ': ' + line };
    }
    // `verticalAlign` et les bords (`borderTop`...) : null pour toute case d'un tableau de document, donc aucun changement de rendu ni de HTML hors
    // grille ; dans une grille, 'top', 'middle' ou 'bottom' pour l'alignement. Lus dans `data-valign` et `data-border-*` seulement, la marque de
    // l'enregistrement : le `vertical-align` ou le `border` d'un tableau collé d'Excel ou du web ne doit rien changer à un tableau de document (les
    // sorties lisent ces marques sur tout tableau, grille ou document, et seule la marque dit ce que la personne a réglé).
    function withCellAttributes(CellExtension) {
      return CellExtension.extend({
        addAttributes() {
          const parent = this.parent ? this.parent() : {};
          const borders = {};
          TableBorders.SIDES.forEach((side) => {
            const attr = BORDER_ATTRS[side];
            borders[attr] = {
              default: null,
              parseHTML: el => TableBorders.normalizeValue(el.getAttribute('data-border-' + side)),
              renderHTML: attrs => borderHtml(side, attrs[attr]),
            };
          });
          return Object.assign({}, parent, {
            verticalAlign: {
              default: null,
              parseHTML: el => { const v = String(el.getAttribute('data-valign') || '').toLowerCase(); return VALIGNS.has(v) ? v : null; },
              renderHTML: attrs => (VALIGNS.has(attrs.verticalAlign) ? { 'data-valign': attrs.verticalAlign, style: 'vertical-align: ' + attrs.verticalAlign } : {}),
            },
          }, borders);
        },
      });
    }

    // Le HTML d'une grille enregistrée est son tableau, rien d'autre : le paragraphe vide que TipTap range sous un tableau final (TrailingNode) n'est
    // pas du contenu, TipTap le remet au chargement. Les exports (Lecture, PDF, Excel) n'ont ainsi jamais à le deviner : une ligne vide sous la grille,
    // voire une page de plus.
    function serialize(html) {
      const tail = '</table><p></p>';
      return active && typeof html === 'string' && html.endsWith(tail) ? html.slice(0, html.length - '<p></p>'.length) : html;
    }

    // Le tableau que vise la grille. Dans une grille, le seul du modèle, en tête du document. Dans un document, celui qui porte la sélection (`selection`) :
    // le plus proche de la tête du curseur, celui des cases pour des cases choisies, celui d'un tableau choisi en entier ; null hors d'un tableau ou sans
    // sélection. La grille est ainsi le cas où il n'y a qu'un tableau.
    function tableInfo(doc, selection) {
      if (active) {
        const first = doc.firstChild;
        return first && first.type.name === 'table' ? { node: first, pos: 0 } : null;
      }
      return selection ? tableAtSelection(selection) : null;
    }

    function tableAtSelection(selection) {
      if (selection.node && selection.node.type.name === 'table') return { node: selection.node, pos: selection.from };
      const $pos = selection.$anchorCell ? selection.$headCell : selection.$head;
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name === 'table') return { node: $pos.node(depth), pos: $pos.before(depth) };
      }
      return null;
    }
    return { withTableAttributes, withRowAttributes, withCellAttributes, serialize, tableInfo };
  })();

  // Les réglages de la barre du tableau (alignement vertical, bordures, quadrillage) sont-ils refusés ? Oui dans un document dont le suivi des modifications
  // est allumé : ce sont des changements d'attributs, que le suivi ne voit pas (comme la fusion de cases, js/table-merge.js) ; ils s'écriraient sans laisser
  // de suggestion. La barre du tableau s'en sert pour griser leurs boutons et pour ne pas ouvrir le menu « Bordures » (la règle de `scopedTable`, écrite
  // une seule fois). Ne dépend pas de la sélection : un bouton à menu s'ouvre et annonce son état (aria-expanded) tant que rien ne le refuse, tableau sous
  // le curseur ou non (le balayage de `toolbarChrome` le déclenche sur une page sans tableau).
  function tableSettingsBlocked() { return !active && Editor.isTrackChangesOn(); }

  // Le tableau que visent ces réglages : celui de la grille, ou celui du document qui porte la sélection ; aucun quand ils sont refusés.
  function scopedTable(ed) {
    return tableSettingsBlocked() ? null : tableInfo(ed.state.doc, ed.state.selection);
  }

  const { rowPos, isEmptyParagraph, isForbiddenNode, isValidGridDoc, buildDefaultTable, cellOrigins, columnWidths, knownColumnWidths, hasCellAttr, isFreshCell } = (function () {
    // Le document d'une grille : rang d'une ligne, ce qui est valable, la grille de départ, l'emplacement et la largeur des colonnes.

    // La position, dans le document, de la ligne de rang `index` du tableau.
    function rowPos(info, index) {
      let pos = info.pos + 1;
      for (let i = 0; i < index; i++) pos += info.node.child(i).nodeSize;
      return pos;
    }

    function isEmptyParagraph(node) { return node.type.name === 'paragraph' && node.content.size === 0; }

    // Ce qu'une case de grille refuse : un nœud de FORBIDDEN_NODES, ou une image en calque (devant ou derrière le texte), qui n'a pas de sens sur une
    // case où une image se pose à sa taille. La règle est écrite ici une fois : la grille la fait tenir (isValidGridDoc), le tableau lié à un modèle
    // Grille aussi (js/linked-table.js), puisque ses cases s'écrivent dans une grille.
    function isForbiddenNode(node) {
      const name = node.type.name;
      return FORBIDDEN_NODES.has(name) || (name === 'editorImage' && !!node.attrs.layer && node.attrs.layer !== 'normal');
    }

    // Un seul tableau en tête du document, éventuellement suivi du paragraphe vide que TipTap range sous un tableau final (TrailingNode de StarterKit :
    // impossible à empêcher, on le cache - css/grid.css - et la sélection n'y entre jamais), sans rien d'interdit dans les cases.
    function isValidGridDoc(doc) {
      const n = doc.childCount;
      if (n < 1 || n > 2) return false;
      if (doc.child(0).type.name !== 'table') return false;
      if (n === 2 && !isEmptyParagraph(doc.child(1))) return false;
      let ok = true;
      doc.child(0).descendants(node => {
        if (!ok) return false;
        if (isForbiddenNode(node)) { ok = false; return false; }
        return true;
      });
      return ok;
    }

    function buildDefaultTable(schema) {
      const { table, tableRow, tableCell } = schema.nodes;
      const rows = [];
      for (let r = 0; r < DEFAULT_ROWS; r++) {
        const cells = [];
        for (let c = 0; c < DEFAULT_COLS; c++) cells.push(tableCell.createAndFill({ colwidth: [DEFAULT_COL_WIDTH_PX], verticalAlign: DEFAULT_VALIGN }));
        rows.push(tableRow.create({ rowHeight: DEFAULT_ROW_HEIGHT_PX }, cells));
      }
      return table.create(null, rows);
    }

    // Chaque case une seule fois (une case fusionnée occupe plusieurs emplacements de la grille), avec l'emplacement de son coin haut gauche, dans
    // l'ordre de lecture.
    function cellOrigins(tableNode, map) {
      const nodes = new Map();
      tableNode.forEach((row, rowOffset) => row.forEach((cell, cellOffset) => nodes.set(rowOffset + 1 + cellOffset, cell)));
      const seen = new Set();
      const cells = [];
      map.map.forEach((pos, i) => {
        if (seen.has(pos)) return;
        seen.add(pos);
        cells.push({ pos, row: Math.floor(i / map.width), col: i % map.width, node: nodes.get(pos) || tableNode.nodeAt(pos) });
      });
      return cells;
    }

    // Largeur de chaque colonne, lue sur les `colwidth` des cases (la première largeur connue de la colonne gagne : toutes les lignes doivent s'y
    // accorder) ; 0 quand aucune case ne la porte (les colonnes automatiques d'un tableau de document).
    function knownColumnWidths(tableNode) {
      const map = libs.TableMap.get(tableNode);
      const widths = new Array(map.width).fill(0);
      cellOrigins(tableNode, map).forEach(({ node, col }) => {
        const known = node.attrs.colwidth || [];
        for (let j = 0; j < (node.attrs.colspan || 1); j++) if (!widths[col + j] && known[j]) widths[col + j] = known[j];
      });
      return widths;
    }
    // Les mêmes, DEFAULT_COL_WIDTH_PX quand aucune case ne la porte (une colonne ajoutée par la barre de la case naît sans largeur) : une grille.
    function columnWidths(tableNode) { return knownColumnWidths(tableNode).map(w => w || DEFAULT_COL_WIDTH_PX); }

    // Seule une case dont le type porte l'attribut peut le recevoir : sinon le « correctif » ne corrigerait jamais rien et appendTransaction tournerait
    // sans fin.
    function hasCellAttr(cell, name) { return !!cell.type.spec.attrs && name in cell.type.spec.attrs; }
    // Une case neuve (ligne ou colonne ajoutée, collage) : aucun alignement vertical encore posé.
    function isFreshCell(cell) { return hasCellAttr(cell, 'verticalAlign') && !VALIGNS.has(cell.attrs.verticalAlign); }
    return { rowPos, isEmptyParagraph, isForbiddenNode, isValidGridDoc, buildDefaultTable, cellOrigins, columnWidths, knownColumnWidths, hasCellAttr, isFreshCell };
  })();

  const { fixCellDimensions, borderSeeds } = (function () {
    // Les bords de départ des cases neuves et la réparation des largeurs et des alignements.

    // Les bords de départ des cases neuves, et ce qu'il faut changer chez leurs voisines. Une ligne ajoutée reprend les bords gauche et droit de la
    // ligne voisine (du dessus, du dessous pour la première), une colonne ajoutée les bords haut et bas de la colonne voisine (de gauche, de droite
    // pour la première). Au milieu du tableau, le trait entre l'ancienne case et la nouvelle est celui d'avant (js/table-borders.js : la valeur du
    // voisin l'emporte sur le trait de départ de la case neuve). En bout de grille, le bord extérieur reste à l'extérieur et passe à la case neuve ; le
    // trait qui était extérieur devient intérieur, comme celui d'à côté (sinon un cadre caché ou coloré se prolongerait entre l'ancienne case et la
    // nouvelle). Rend une Map position de case -> attributs à écrire.
    function borderSeeds(tableNode, map, cells, fresh) {
      const seeds = new Map();
      if (!fresh.size) return seeds;
      const rowCells = Array.from({ length: map.height }, () => []);
      const colCells = Array.from({ length: map.width }, () => []);
      cells.forEach(({ pos, row, col }) => { rowCells[row].push(pos); colCells[col].push(pos); });
      const allFresh = list => list.length > 0 && list.every(pos => fresh.has(pos));
      const rowFresh = rowCells.map(allFresh);
      const colFresh = colCells.map(allFresh);
      const nearest = (flags, from, step) => { for (let i = from + step; i >= 0 && i < flags.length; i += step) if (!flags[i]) return i; return -1; };
      const put = (pos, attrs) => seeds.set(pos, Object.assign(seeds.get(pos) || {}, attrs));
      // Pose les bords de la case neuve `pos`, de rang `index` parmi les lignes (ou les colonnes) `flags` (vrai : entièrement neuve) ; `cellAt(i)` rend
      // la position de la case voisine de rang i.
      const seedFrom = (edges, flags, pos, index, cellAt) => {
        const before = nearest(flags, index, -1);
        const refIndex = before >= 0 ? before : nearest(flags, index, 1);
        if (refIndex < 0) return;
        const refPos = cellAt(refIndex);
        const ref = tableNode.nodeAt(refPos).attrs;
        const seed = {};
        edges.sides.forEach((side) => { seed[side] = ref[side] || null; });
        if (before >= 0 && index === flags.length - 1) {
          const inner = refIndex >= 1 ? ref[edges.before] || null : null;
          Object.assign(seed, { [edges.before]: inner, [edges.after]: ref[edges.after] || null });
          put(refPos, { [edges.after]: inner });
        } else if (before < 0 && index === 0) {
          const inner = refIndex + 1 < flags.length ? ref[edges.after] || null : null;
          Object.assign(seed, { [edges.before]: ref[edges.before] || null, [edges.after]: inner });
          put(refPos, { [edges.before]: inner });
        }
        put(pos, seed);
      };
      cells.forEach(({ pos, row, col }) => {
        if (!fresh.has(pos)) return;
        if (rowFresh[row]) seedFrom(ROW_EDGES, rowFresh, pos, row, i => map.map[i * map.width + col]);
        else if (colFresh[col]) seedFrom(COLUMN_EDGES, colFresh, pos, col, i => map.map[row * map.width + i]);
      });
      return seeds;
    }

    // Pose la largeur de chaque case qui n'en a pas (ou qui n'a pas celle de sa colonne), l'alignement vertical de départ et les bords de départ des
    // cases neuves, sur la transaction `tr` (ou une neuve) ; null s'il n'y a rien à faire.
    function fixCellDimensions(state, tr) {
      const info = tableInfo(tr ? tr.doc : state.doc);
      if (!info) return null;
      const widths = columnWidths(info.node);
      const map = libs.TableMap.get(info.node);
      const cells = cellOrigins(info.node, map);
      const fresh = new Set(cells.filter(({ node }) => isFreshCell(node)).map(({ pos }) => pos));
      const seeds = borderSeeds(info.node, map, cells, fresh);
      let out = tr;
      let changed = false;
      cells.forEach(({ pos, col, node }) => {
        const want = widths.slice(col, col + (node.attrs.colspan || 1));
        const have = node.attrs.colwidth;
        const widthOk = !!have && have.length === want.length && have.every((w, k) => w === want[k]);
        const alignOk = !fresh.has(pos);
        const seed = hasCellAttr(node, BORDER_ATTRS.top) ? seeds.get(pos) : null;
        if (widthOk && alignOk && !seed) return;
        if (!out) out = state.tr;
        out.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, node.attrs, { colwidth: want }, alignOk ? {} : { verticalAlign: DEFAULT_VALIGN }, seed));
        changed = true;
      });
      return changed ? out : null;
    }
    return { fixCellDimensions, borderSeeds };
  })();

  const { fixRowHeights, borderSpec, writeBorders, fixBorders } = (function () {
    // La réparation des hauteurs de ligne et des bords que se partagent les cases.

    // Une ligne ajoutée par la barre de la case naît sans hauteur : elle prend celle de la ligne du dessus (du dessous pour la première), comme dans un
    // tableur.
    function fixRowHeights(state, tr) {
      const info = tableInfo(tr ? tr.doc : state.doc);
      if (!info) return null;
      const heights = [];
      info.node.forEach(row => heights.push(row.attrs.rowHeight || 0));
      let out = tr;
      let changed = false;
      info.node.forEach((row, offset, index) => {
        if (heights[index]) return;
        heights[index] = heights[index - 1] || heights.slice(index + 1).find(Boolean) || DEFAULT_ROW_HEIGHT_PX;
        if (!out) out = state.tr;
        out.setNodeMarkup(info.pos + 1 + offset, undefined, Object.assign({}, row.attrs, { rowHeight: heights[index] }));
        changed = true;
      });
      return changed ? out : null;
    }

    // La description du tableau que lit js/table-borders.js : une entrée par case, avec son emplacement, ses étendues et ses quatre bords.
    function borderSpec(tableNode) {
      const map = libs.TableMap.get(tableNode);
      const cells = cellOrigins(tableNode, map).map(({ pos, row, col, node: { attrs } }) => ({
        pos, row, col, rowspan: attrs.rowspan || 1, colspan: attrs.colspan || 1,
        top: attrs.borderTop, right: attrs.borderRight, bottom: attrs.borderBottom, left: attrs.borderLeft,
      }));
      return { width: map.width, height: map.height, cells };
    }

    // Écrit sur chaque case les côtés calculés (`sides`, dans l'ordre de `spec.cells`) quand ils diffèrent de ce qu'elle porte ; null s'il n'y a rien à
    // changer. Les positions ne bougent pas (même taille de nœud) : plusieurs cases d'une même transaction ne se décalent pas.
    function writeBorders(state, tr, info, spec, sides) {
      let out = tr;
      let changed = false;
      spec.cells.forEach((cell, index) => {
        const next = {};
        let differs = false;
        TableBorders.SIDES.forEach((side) => {
          if ((cell[side] || null) !== sides[index][side]) { next[BORDER_ATTRS[side]] = sides[index][side]; differs = true; }
        });
        if (!differs) return;
        const node = info.node.nodeAt(cell.pos);
        if (!hasCellAttr(node, BORDER_ATTRS.top)) return;
        if (!out) out = state.tr;
        out.setNodeMarkup(info.pos + 1 + cell.pos, undefined, Object.assign({}, node.attrs, next));
        changed = true;
      });
      return changed ? out : null;
    }

    // Met d'accord les cases qui se partagent un trait (fusion, ligne ou colonne supprimée, collage) : « pas de trait » l'emporte, puis la première
    // couleur, sinon le trait de départ. Null quand tout s'accorde déjà. `table` : le tableau d'un document (`{ node, pos }`) ; sans lui, celui de la grille.
    function fixBorders(state, tr, table) {
      const info = table || tableInfo(tr ? tr.doc : state.doc);
      if (!info) return null;
      const spec = borderSpec(info.node);
      return writeBorders(state, tr, info, spec, TableBorders.resolve(spec)) || null;
    }
    return { fixRowHeights, borderSpec, writeBorders, fixBorders };
  })();

  const { repairGrid, normalizeDocument, isCellSelection, selectionInsideTable, firstAndLastCell, allCellsSelection } = (function () {
    // La réparation des sauts de page, la grille remise d'aplomb au chargement, et les cases d'une sélection.

    // Retire le saut de page que rien ne peut suivre : avant la première ligne (une page vide) ou au milieu d'une case fusionnée sur plusieurs lignes.
    // L'éditeur n'en pose pas de tel, mais la première ligne peut le devenir (la ligne du dessus supprimée) et un HTML collé ou chargé peut en porter.
    // Null quand il n'y a rien à retirer.
    function fixPageBreaks(state, tr) {
      const info = tableInfo(tr ? tr.doc : state.doc);
      if (!info) return null;
      const map = libs.TableMap.get(info.node);
      let out = tr;
      let changed = false;
      info.node.forEach((row, offset, index) => {
        if (!row.attrs.pageBreakBefore || (index > 0 && !boundaryCrossed(map, index))) return;
        if (!out) out = state.tr;
        out.setNodeMarkup(info.pos + 1 + offset, undefined, Object.assign({}, row.attrs, { pageBreakBefore: false }));
        changed = true;
      });
      return changed ? out : null;
    }

    // Les réparations d'une grille l'une après l'autre, chacune sur la transaction de la précédente (`tr` : celle de départ, ou null) ; null quand il
    // n'y avait rien à réparer.
    function repairGrid(state, tr) {
      return [fixCellDimensions, fixRowHeights, fixBorders, fixPageBreaks].reduce((out, fix) => fix(state, out) || out, tr);
    }

    // Le document est déjà « une grille » ? Sinon (modèle vide, contenu abîmé), on garde le premier tableau trouvé s'il est valable, sinon la grille de
    // départ. Hors historique et sans signal « modifié » : ouvrir un modèle n'est pas une modification de la personne.
    function normalizeDocument() {
      const { state, view } = editor;
      let tr = null;
      if (!isValidGridDoc(state.doc)) {
        let table = null;
        state.doc.descendants(node => {
          if (table) return false;
          if (node.type.name === 'table') { table = node; return false; }
          return true;
        });
        if (table && !isValidGridDoc(state.schema.topNodeType.create(null, table))) table = null;
        tr = state.tr.replaceWith(0, state.doc.content.size, table || buildDefaultTable(state.schema));
      }
      tr = repairGrid(state, tr);
      if (tr) view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
      selectFirstCell();
    }

    function isCellSelection(sel) { return !!(sel && sel.$anchorCell); }

    function selectionInsideTable(sel) {
      if (isCellSelection(sel)) return true;
      // Profondeur 0 : curseur « gap » avant/après le tableau, tout le document (Ctrl+A), le tableau lui-même (NodeSelection).
      if (sel.$from.depth < 1 || sel.$to.depth < 1) return false;
      return sel.$from.node(1).type.name === 'table' && sel.$to.node(1).type.name === 'table';
    }

    function firstAndLastCell(doc, table) {
      const info = table || tableInfo(doc);
      if (!info) return null;
      const map = libs.TableMap.get(info.node);
      return { first: info.pos + 1 + map.map[0], last: info.pos + 1 + map.map[map.map.length - 1], info, map };
    }

    function allCellsSelection(doc) {
      const ends = firstAndLastCell(doc);
      return ends ? libs.CellSelection.create(doc, ends.first, ends.last) : null;
    }
    return { repairGrid, normalizeDocument, isCellSelection, selectionInsideTable, firstAndLastCell, allCellsSelection };
  })();

  const { repairDocumentTables } = (function () {
    // Les tableaux d'un DOCUMENT. Pas de réparation générale : la grille impose une largeur et un alignement à chacune de ses cases, un document laisse
    // ses colonnes automatiques et ses cases sans alignement. Mais un geste de structure ne doit pas défaire les traits ni les hauteurs d'un tableau qui
    // en porte : une ligne ou une colonne ajoutée reprend le cadre et la hauteur de sa voisine, comme dans une grille, et les cases qui se partagent un
    // trait s'accordent après une fusion ou une suppression. Un tableau sans trait ni hauteur n'est pas touché (ce que les réparations écriraient est nul).
    // Pas de réparation : suivi des modifications allumé (ces écritures ne seraient pas suivies), Annuler et Rétablir (ils rendent un état qui s'accordait
    // déjà), un tableau arrivé tout entier avec la transaction (chargé ou collé : il porte ses traits).

    // Les zones que les pas de `trs` ont changées, en positions du document final ; `inserted` quand du contenu y est entré.
    function changedRanges(trs) {
      const maps = [];
      trs.forEach(tr => tr.mapping.maps.forEach(map => maps.push(map)));
      const ranges = [];
      maps.forEach((map, index) => map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        let from = newStart;
        let to = newEnd;
        for (let next = index + 1; next < maps.length; next++) { from = maps[next].map(from, 1); to = maps[next].map(to, -1); }
        ranges.push({ from, to: Math.max(from, to), inserted: newEnd > newStart });
      }));
      return ranges;
    }

    function hasBorders(cell) { return !!(cell.attrs.borderTop || cell.attrs.borderRight || cell.attrs.borderBottom || cell.attrs.borderLeft); }

    // Les bords de départ des cases neuves (`fresh` : leurs positions dans le document), ceux de la grille (`borderSeeds`).
    function seedFreshBorders(state, tr, info, fresh) {
      const map = libs.TableMap.get(info.node);
      const cells = cellOrigins(info.node, map);
      const seeds = borderSeeds(info.node, map, cells, new Set(cells.filter(({ pos }) => fresh.has(info.pos + 1 + pos)).map(({ pos }) => pos)));
      let out = tr;
      seeds.forEach((attrs, pos) => {
        const cell = info.node.nodeAt(pos);
        if (!hasCellAttr(cell, BORDER_ATTRS.top) || Object.keys(attrs).every(name => (cell.attrs[name] || null) === (attrs[name] || null))) return;
        if (!out) out = state.tr;
        out.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, cell.attrs, attrs));
      });
      return out === tr ? null : out;
    }

    // Une ligne neuve prend la hauteur de celle du dessus (de la première ligne gardée sous elle, pour une ligne neuve en tête), quand cette ligne en a une.
    function seedFreshHeights(state, tr, info, fresh) {
      const rows = [];
      info.node.forEach((row, offset) => rows.push({ row, pos: info.pos + 1 + offset }));
      const heights = rows.map(({ row }) => row.attrs.rowHeight || 0);
      if (!heights.some(Boolean)) return null;
      let out = tr;
      rows.forEach(({ row, pos }, index) => {
        if (!fresh.has(pos) || heights[index]) return;
        let ref = index > 0 ? heights[index - 1] : 0;
        for (let below = index + 1; index === 0 && below < rows.length && !ref; below++) if (!fresh.has(rows[below].pos)) ref = heights[below];
        if (!ref) return;
        heights[index] = ref;
        if (!out) out = state.tr;
        out.setNodeMarkup(pos, undefined, Object.assign({}, row.attrs, { rowHeight: ref }));
      });
      return out === tr ? null : out;
    }

    // Rend la transaction à ajouter (ou null) après `trs`, pour le document de `state`.
    function repairDocumentTables(trs, state) {
      if (!trs.some(tr => tr.docChanged) || Editor.isTrackChangesOn()) return null;
      if (trs.some(tr => tr.getMeta('history$') || tr.getMeta('preventUpdate'))) return null;
      const ranges = changedRanges(trs);
      const inserted = ranges.filter(range => range.inserted);
      const within = (from, to) => inserted.some(range => range.from <= from && to <= range.to);
      // Les tableaux dont une ligne ou une case a été ajoutée, retirée ou remplacée (un texte tapé dans une case ne compte pas).
      const tables = new Map();
      ranges.forEach(({ from, to }) => [from, to].forEach((at) => {
        if (at < 0 || at > state.doc.content.size) return;
        const $at = state.doc.resolve(at);
        const parent = $at.parent.type.name;
        const depth = parent === 'table' ? $at.depth : (parent === 'tableRow' ? $at.depth - 1 : 0);
        if (depth > 0 && !tables.has($at.before(depth))) tables.set($at.before(depth), $at.node(depth));
      }));
      let tr = null;
      tables.forEach((node, pos) => {
        if (within(pos, pos + node.nodeSize)) return;
        // Un tableau mal formé (lignes de longueurs différentes après un collage) est remis d'aplomb par prosemirror-tables dans le tour suivant, où
        // nous repassons. Une réparation ne doit jamais empêcher le geste qui l'a demandée : en cas d'erreur, le tableau reste tel quel.
        const map = libs.TableMap.get(node);
        if (map.problems) return;
        try {
          const freshCells = new Set();
          const freshRows = new Set();
          cellOrigins(node, map).forEach(({ pos: offset, node: cell }) => {
            const start = pos + 1 + offset;
            if (!hasBorders(cell) && within(start, start + cell.nodeSize)) freshCells.add(start);
          });
          node.forEach((row, offset) => { if (within(pos + 1 + offset, pos + 1 + offset + row.nodeSize)) freshRows.add(pos + 1 + offset); });
          const info = () => ({ node: (tr || state).doc.nodeAt(pos), pos });
          tr = seedFreshBorders(state, tr, info(), freshCells) || tr;
          tr = seedFreshHeights(state, tr, info(), freshRows) || tr;
          tr = fixBorders(state, tr, info()) || tr;
        } catch (error) {
          // rien à écrire pour ce tableau
        }
      });
      return tr;
    }
    return { repairDocumentTables };
  })();

  const {
    selectionBackInside, selectFirstCell, selectAllCells, clearSelectedCells, ancestorDepth, cellPosOf, currentCellPos, currentCellDom,
    selectedCells,
  } = (function () {
    // La sélection : la remettre dans le tableau, la case courante, les cases visées.

    // Où remettre une sélection qui sort du tableau : tout le document ou le tableau entier -> toutes les cases ; après le tableau -> la fin de la
    // dernière case ; avant -> le début de la première.
    function selectionBackInside(doc, sel) {
      const info = tableInfo(doc);
      if (!info) return null;
      const end = info.pos + info.node.nodeSize;
      if (sel.from <= info.pos && sel.to >= end) return allCellsSelection(doc);
      if (sel.from >= end) return libs.TextSelection.near(doc.resolve(end - 1), -1);
      return libs.TextSelection.near(doc.resolve(info.pos + 1), 1);
    }

    function selectFirstCell() {
      if (!editor) return;
      const { state, view } = editor;
      const info = tableInfo(state.doc);
      if (!info) return;
      view.dispatch(state.tr.setSelection(libs.TextSelection.near(state.doc.resolve(info.pos + 1), 1)).setMeta('addToHistory', false));
    }

    function selectAllCells(ed, table) {
      const ends = firstAndLastCell(ed.state.doc, table);
      return !!ends && ed.commands.setCellSelection({ anchorCell: ends.first, headCell: ends.last });
    }

    // Suppr et Retour arrière sur des cases sélectionnées vident leur contenu (comme dans un tableur), au lieu de la commande « supprimer le tableau »
    // de TipTap quand toutes sont sélectionnées : le garde-fou la refuserait en silence et la touche semblerait ne rien faire.
    function clearSelectedCells(ed) {
      const sel = ed.state.selection;
      if (!isCellSelection(sel)) return false;
      const tr = ed.state.tr;
      const empty = ed.schema.nodes.paragraph.create();
      sel.forEachCell((cell, pos) => {
        if (cell.childCount === 1 && isEmptyParagraph(cell.firstChild)) return;
        tr.replaceWith(tr.mapping.map(pos + 1), tr.mapping.map(pos + cell.nodeSize - 1), empty);
      });
      if (tr.docChanged) ed.view.dispatch(tr);
      return true;
    }

    // La profondeur de l'ancêtre le plus proche de `$pos` dont le type est dans `names`, 0 sans.
    function ancestorDepth($pos, names) {
      for (let d = $pos.depth; d > 0; d--) if (names.has($pos.node(d).type.name)) return d;
      return 0;
    }

    // La case qui porte le curseur ; pour des cases choisies, celle de `end` : `$headCell`, la tête, ou `$anchorCell`, d'où la sélection est partie.
    function cellPosOf(sel, end) {
      if (isCellSelection(sel)) return sel[end].pos;
      const depth = ancestorDepth(sel.$head, CELL_NODES);
      return depth ? sel.$head.before(depth) : null;
    }

    // La case qui porte la sélection (la tête d'une sélection de cases) : ancre de la barre flottante de la case et décoration « case courante ».
    function currentCellPos(state) { return cellPosOf(state.selection, '$headCell'); }
    function currentCellDom() {
      if (!editor) return null;
      const pos = currentCellPos(editor.state);
      return pos == null ? null : editor.view.nodeDOM(pos);
    }

    // Les cases que la barre de la case vise : toutes celles d'une sélection de cases, sinon la case du curseur.
    function selectedCells(state) {
      const sel = state.selection;
      const out = [];
      if (isCellSelection(sel)) { sel.forEachCell((node, pos) => out.push({ node, pos })); return out; }
      const pos = currentCellPos(state);
      if (pos != null) out.push({ node: state.doc.nodeAt(pos), pos });
      return out;
    }
    return { selectionBackInside, selectFirstCell, selectAllCells, clearSelectedCells, ancestorDepth, cellPosOf, currentCellPos, currentCellDom, selectedCells };
  })();

  const { selectedVerticalAlign, setVerticalAlign, canMerge, canSplit, selectionRect, sameAttrs, mergeSelected, mergeCells } = (function () {
    // L'alignement vertical, la fusion et le rectangle des cases visées.

    // 'top', 'middle' ou 'bottom' quand toutes les cases visées s'accordent, null quand la sélection est mêlée (aucun bouton n'est alors enfoncé) ou hors
    // d'un tableau. Une case sans alignement posé est au milieu dans une grille (sa valeur de départ) et en haut dans un document (celle du navigateur).
    function selectedVerticalAlign(ed) {
      if (!scopedTable(ed)) return null;
      const unset = active ? DEFAULT_VALIGN : DOCUMENT_VALIGN;
      const values = new Set(selectedCells(ed.state).map(({ node }) => (VALIGNS.has(node.attrs.verticalAlign) ? node.attrs.verticalAlign : unset)));
      return values.size === 1 ? Array.from(values)[0] : null;
    }

    // Une seule transaction pour toutes les cases visées : un seul Annuler. Dans un document « en haut » est l'état de départ d'une case : il s'efface au lieu
    // de s'écrire, et un tableau que personne n'a réglé garde un HTML sans marque.
    function setVerticalAlign(ed, value) {
      if (!VALIGNS.has(value) || !scopedTable(ed)) return false;
      const stored = !active && value === DOCUMENT_VALIGN ? null : value;
      const tr = ed.state.tr;
      selectedCells(ed.state).forEach(({ node, pos }) => {
        if ((node.attrs.verticalAlign || null) !== stored) tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { verticalAlign: stored }));
      });
      if (tr.docChanged) ed.view.dispatch(tr);
      return true;
    }

    // Les deux jeux d'attributs disent-ils la même chose (une valeur absente vaut null) ? Évite d'écrire un pas qui ne change rien.
    function sameAttrs(a, b) {
      const norm = value => JSON.stringify(value == null ? null : value);
      return Object.keys(a).every(name => norm(a[name]) === norm(b[name]));
    }

    // Fusionner n'a de sens que pour des cases d'une même page : une case ne s'étend jamais de part et d'autre d'un saut de page (le PDF et l'Excel la
    // couperaient en deux).
    function canMerge(ed) {
      if (!active || !ed.can().mergeCells()) return false;
      const info = tableInfo(ed.state.doc);
      const rect = info && selectionRect(ed.state, info);
      if (!rect) return true;
      for (let row = rect.top + 1; row < rect.bottom; row++) if (info.node.child(row).attrs.pageBreakBefore) return false;
      return true;
    }
    function canSplit(ed) { return active && ed.can().splitCell(); }

    // Le rectangle (emplacements de la grille, `right` et `bottom` exclus) que couvrent les cases visées : toujours un rectangle, une sélection de
    // cases n'en connaît pas d'autre.
    function selectionRect(state, info) {
      const map = libs.TableMap.get(info.node);
      let rect = null;
      selectedCells(state).forEach(({ pos }) => {
        const cell = map.findCell(pos - (info.pos + 1));
        rect = rect
          ? { left: Math.min(rect.left, cell.left), top: Math.min(rect.top, cell.top), right: Math.max(rect.right, cell.right), bottom: Math.max(rect.bottom, cell.bottom) }
          : { left: cell.left, top: cell.top, right: cell.right, bottom: cell.bottom };
      });
      return rect;
    }

    // Fusionne les cases sélectionnées en une seule : le texte des autres s'ajoute à la suite du sien (rien n'est perdu, Annuler rend tout), le fond et
    // l'alignement sont ceux de la première. prosemirror-tables ne laisse à la case fusionnée que la largeur de sa première colonne (0 pour les autres)
    // : on lui rend, dans la même transaction, celle de chaque colonne qu'elle couvre, sinon fixCellDimensions remettrait la seconde à la largeur par
    // défaut. Ses bords sont ceux du pourtour des cases fusionnées (le côté droit de la première était un trait intérieur) ; les traits de l'intérieur
    // disparaissent.
    // Le même geste pour un tableau de document (js/table-merge.js : `TableMerge.mergeCells`, qui garde ses gardes - une seule case, suivi des
    // modifications, ligne répétée par une boucle) : `mergeSelected` fait la fusion sans garde, `mergeCells` y ajoute celle d'une grille. Dans un document
    // une colonne sans largeur reste sans largeur (un tableau aux colonnes automatiques n'en invente pas), et le pourtour ne s'écrit que s'il y a un trait.
    function mergeSelected(ed) {
      const before = tableInfo(ed.state.doc, ed.state.selection);
      if (!before) return false;
      const widths = (active ? columnWidths : knownColumnWidths)(before.node);
      const spec = borderSpec(before.node);
      const rect = selectionRect(ed.state, before);
      const borders = {};
      TableBorders.SIDES.forEach((side) => { borders[BORDER_ATTRS[side]] = TableBorders.combineAll(TableBorders.valuesOf(spec, TableBorders.presetEdges(side, rect))); });
      return ed.chain().focus().mergeCells().command(({ tr }) => {
        const merged = tr.selection.$anchorCell ? tr.selection.$anchorCell.pos : null;
        const node = tr.doc.nodeAt(before.pos);
        if (merged == null || !node) return true;
        const cell = tr.doc.nodeAt(merged);
        const left = libs.TableMap.get(node).colCount(merged - (before.pos + 1));
        const colwidth = widths.slice(left, left + (cell.attrs.colspan || 1));
        const next = Object.assign({}, cell.attrs, colwidth.some(Boolean) ? { colwidth } : null, hasCellAttr(cell, BORDER_ATTRS.top) ? borders : null);
        if (!sameAttrs(next, cell.attrs)) tr.setNodeMarkup(merged, undefined, next);
        return true;
      }).run();
    }
    function mergeCells(ed) { return canMerge(ed) ? mergeSelected(ed) : false; }
    return { selectedVerticalAlign, setVerticalAlign, canMerge, canSplit, selectionRect, sameAttrs, mergeSelected, mergeCells };
  })();

  const { splitSelected, splitCell, applyBorders, canApplyBorders, gridLinesShown, setGridLinesShown, boundaryCrossed, pageBreakRow } = (function () {
    // Scinder une case, les bordures, le quadrillage et la ligne que vise le saut de page.

    // Scinde la case fusionnée en autant de cases qu'elle en recouvrait : la première garde le contenu, les autres naissent vides, avec le fond,
    // l'alignement et la largeur de leur colonne. Les bords du pourtour restent aux cases du pourtour ; les traits entre les nouvelles cases sont ceux
    // de départ.
    // Le même geste pour un tableau de document (js/table-merge.js : `TableMerge.splitCell`, qui garde sa garde du suivi des modifications) : `splitSelected`
    // scinde sans garde, `splitCell` y ajoute celle d'une grille.
    function splitSelected(ed) {
      const before = tableInfo(ed.state.doc, ed.state.selection);
      if (!before) return false;
      const rect = selectionRect(ed.state, before);
      const attrs = selectedCells(ed.state)[0].node.attrs;
      return ed.chain().focus().splitCell().command(({ tr }) => {
        const node = tr.doc.nodeAt(before.pos);
        if (!node || !rect) return true;
        const map = libs.TableMap.get(node);
        for (let r = rect.top; r < rect.bottom; r++) {
          for (let c = rect.left; c < rect.right; c++) {
            const pos = map.map[r * map.width + c];
            const piece = node.nodeAt(pos);
            if (!hasCellAttr(piece, BORDER_ATTRS.top)) continue;
            const next = Object.assign({}, piece.attrs, {
              borderTop: r === rect.top ? attrs.borderTop || null : null,
              borderBottom: r === rect.bottom - 1 ? attrs.borderBottom || null : null,
              borderLeft: c === rect.left ? attrs.borderLeft || null : null,
              borderRight: c === rect.right - 1 ? attrs.borderRight || null : null,
            });
            if (!sameAttrs(next, piece.attrs)) tr.setNodeMarkup(before.pos + 1 + pos, undefined, next);
          }
        }
        return true;
      }).run();
    }
    function splitCell(ed) { return canSplit(ed) ? splitSelected(ed) : false; }

    // Les traits que visent les cases sélectionnées, selon le réglage du menu « Bordures » : tout (« all »), le pourtour (« outer »), l'intérieur
    // (« inner »), un côté, ou plus aucun trait (« none »). `color` : la couleur du stylo, null = le trait de départ. Une seule transaction pour toutes
    // les cases touchées : un seul Annuler.
    function applyBorders(ed, preset, color) {
      if (!TableBorders.PRESETS.includes(preset)) return false;
      const info = scopedTable(ed);
      const rect = info && selectionRect(ed.state, info);
      if (!rect) return false;
      const spec = borderSpec(info.node);
      const edges = TableBorders.usableEdges(spec, TableBorders.presetEdges(preset, rect));
      if (!edges.length) return false;
      const tr = writeBorders(ed.state, null, info, spec, TableBorders.set(spec, edges, TableBorders.valueFor(preset, color)));
      if (tr) ed.view.dispatch(tr);
      return true;
    }

    // Le réglage a-t-il un trait à poser ? « Intérieurs » n'en a pas pour une seule case (ni pour l'intérieur d'une case fusionnée) : le bouton se
    // grise.
    function canApplyBorders(ed, preset) {
      if (!TableBorders.PRESETS.includes(preset)) return false;
      const info = scopedTable(ed);
      const rect = info && selectionRect(ed.state, info);
      return !!rect && TableBorders.usableEdges(borderSpec(info.node), TableBorders.presetEdges(preset, rect)).length > 0;
    }

    // Le quadrillage de départ est-il montré en Lecture et dans les exports ? (oui tant que la personne ne l'a pas masqué)
    function gridLinesShown(ed) {
      const info = scopedTable(ed);
      return !info || info.node.attrs.gridLines !== GRID_LINES_OFF;
    }

    // Montre ou masque le quadrillage en Lecture et dans les exports ; les traits posés par la personne restent. L'éditeur, lui, n'en change pas. Une
    // seule transaction : un seul Annuler, et l'enregistrement automatique la voit passer.
    function setGridLinesShown(ed, shown) {
      const info = scopedTable(ed);
      if (!info) return false;
      if (gridLinesShown(ed) === !!shown) return true;
      ed.view.dispatch(ed.state.tr.setNodeMarkup(info.pos, undefined, Object.assign({}, info.node.attrs, { gridLines: shown ? null : GRID_LINES_OFF })));
      return true;
    }

    // Une case couvre-t-elle la limite entre la ligne `row - 1` et la ligne `row` ? (la même case dans les deux, dans l'une des colonnes)
    function boundaryCrossed(map, row) {
      for (let col = 0; col < map.width; col++) if (map.map[(row - 1) * map.width + col] === map.map[row * map.width + col]) return true;
      return false;
    }

    // La ligne que le bouton vise : la première de la sélection (le saut se pose avant elle), dans le tableau de la grille ou, dans un document, dans celui
    // qui porte la sélection.
    function pageBreakRow(state) {
      const info = tableInfo(state.doc, state.selection);
      const rect = info && selectionRect(state, info);
      return rect ? { info, map: libs.TableMap.get(info.node), row: rect.top } : null;
    }
    return { splitSelected, splitCell, applyBorders, canApplyBorders, gridLinesShown, setGridLinesShown, boundaryCrossed, pageBreakRow };
  })();

  const { canTogglePageBreak, hasPageBreak, togglePageBreak, pageBreakInTable, pageBreakBlock, pageBreakRows, trimPastedSlice } = (function () {
    // Le saut de page d'une ligne et le collage dans une case sans les lignes vides de fin.

    // Le bouton « Saut de page » de la barre du haut a le sens d'une ligne dès que le curseur est dans un tableau, d'une grille comme d'un document : il
    // pose un saut avant la ligne (le PDF et le Word y ouvrent une page, l'aperçu A4 et la Lecture aussi). Hors d'un tableau il garde son sens de
    // document (js/main-toolbar.js). Vrai aussi pour un tableau choisi en entier, sans case visée : le bouton est alors grisé, il ne remplace pas le
    // tableau par un repère de saut.
    function pageBreakInTable(ed) {
      return !!ed && !!tableInfo(ed.state.doc, ed.state.selection);
    }

    // Pourquoi le saut ne se pose pas ici : la clé de la raison (info-bulle du bouton grisé), ou null quand il se pose. Un saut déjà posé se retire
    // toujours (il peut ne plus tenir : première ligne devenue celle du dessus supprimée, tableau d'ailleurs), sauf sous le suivi des modifications.
    //  - Pas avant la première ligne (une page vide), pas au milieu d'une case fusionnée sur plusieurs lignes (aucune case n'est coupée en deux).
    //  - Dans un document, seulement dans un tableau du premier niveau : une page ne s'ouvre pas dans une case, une colonne, un encadré ni une liste, et
    //    le PDF et le Word n'y suivent pas le saut.
    //  - Dans un document, jamais sous le suivi des modifications : un saut est un changement d'attribut, que le suivi ne voit pas.
    function pageBreakBlock(ed) {
      if (!pageBreakInTable(ed)) return null;
      if (tableSettingsBlocked()) return 'table.settingTracked';
      const target = pageBreakRow(ed.state);
      if (!target) return 'table.pageBreakNoRow';
      if (target.info.node.child(target.row).attrs.pageBreakBefore) return null;
      if (!active && ed.state.doc.resolve(target.info.pos).depth > 0) return 'table.pageBreakNested';
      if (target.row === 0) return 'table.pageBreakFirstRow';
      if (boundaryCrossed(target.map, target.row)) return 'table.pageBreakMerged';
      return null;
    }

    function canTogglePageBreak(ed) {
      return pageBreakInTable(ed) && pageBreakBlock(ed) === null;
    }

    // La ligne visée porte-t-elle un saut ? (le bouton est alors enfoncé : un second clic le retire)
    function hasPageBreak(ed) {
      const target = pageBreakInTable(ed) && pageBreakRow(ed.state);
      return !!target && !!target.info.node.child(target.row).attrs.pageBreakBefore;
    }

    // Pose le saut avant la ligne visée, ou le retire s'il y est déjà : une transaction, un Annuler.
    function togglePageBreak(ed) {
      if (!canTogglePageBreak(ed)) return false;
      const { info, row } = pageBreakRow(ed.state);
      const node = info.node.child(row);
      ed.view.dispatch(ed.state.tr.setNodeMarkup(rowPos(info, row), undefined, Object.assign({}, node.attrs, { pageBreakBefore: !node.attrs.pageBreakBefore })));
      return true;
    }

    // Les lignes qui portent un saut, par rang : ce que montrent les bandeaux (`info` : le tableau qu'ils montrent, celui de la grille sans lui). Dans
    // un document, seuls les sauts que le PDF et le Word suivent comptent : pas sur la première ligne ni au milieu d'une case fusionnée sur plusieurs
    // lignes (un saut qui ne tient pas n'a pas de pastille ; le trait en tirets de css/grid.css n'est jamais sur la première ligne).
    function pageBreakRows(info) {
      const table = info || (editor && tableInfo(editor.state.doc));
      const rows = [];
      if (!table) return rows;
      const map = active ? null : libs.TableMap.get(table.node);
      table.node.forEach((row, _offset, index) => rows.push(!!row.attrs.pageBreakBefore && (active || (index > 0 && !boundaryCrossed(map, index)))));
      return rows;
    }

    // Un texte copié finit presque toujours par un retour à la ligne (une ligne de Grist, d'un mail ou d'un autre tableur, un paragraphe sélectionné
    // jusqu'à sa fin) : ProseMirror en fait un dernier paragraphe vide qui reste sous le texte collé. Dans une case ces lignes vides ne servent à rien
    // : elles agrandissent la ligne et ouvrent des lignes dans l'Excel, donc elles ne sont pas collées. Les lignes vides du milieu d'un texte restent,
    // et un tableau copié (ses lignes, ses cases) est laissé tel quel : prosemirror-tables le place.
    function isBlankBlock(node) {
      if (!node.isTextblock) return false;
      let blank = true;
      node.forEach(child => { if (child.isText ? child.text.trim() !== '' : child.type.name !== 'hardBreak') blank = false; });
      return blank;
    }

    function openDepthAtEnd(fragment) {
      let depth = 0;
      for (let node = fragment.lastChild; node && !node.isLeaf; node = node.lastChild) depth++;
      return depth;
    }

    function trimPastedSlice(slice) {
      const content = slice.content;
      const blocks = [];
      content.forEach(node => blocks.push(node));
      if (!blocks.length || blocks.some(node => node.type.spec.tableRole)) return slice;
      // Au moins un bloc reste : coller des lignes vides seules ne colle rien, sans faire disparaître la case.
      let end = blocks.length;
      while (end > 1 && isBlankBlock(blocks[end - 1])) end--;
      // Le dernier texte peut finir par des retours à la ligne forcés (`<br>` d'un mail, d'une page web).
      let last = blocks[end - 1];
      if (last.isTextblock) {
        let keep = last.childCount;
        while (keep > 0 && last.child(keep - 1).type.name === 'hardBreak') keep--;
        if (keep > 0 && keep < last.childCount) {
          let size = 0;
          for (let i = 0; i < keep; i++) size += last.child(i).nodeSize;
          last = last.copy(last.content.cut(0, size));
        }
      }
      if (end === blocks.length && last === blocks[end - 1]) return slice;
      const fragment = content.constructor.fromArray(blocks.slice(0, end - 1).concat(last));
      return new slice.constructor(fragment, slice.openStart, Math.min(slice.openEnd, openDepthAtEnd(fragment)));
    }
    return { canTogglePageBreak, hasPageBreak, togglePageBreak, pageBreakInTable, pageBreakBlock, pageBreakRows, trimPastedSlice };
  })();

  const { insertLines, pasteFromTopLeft } = (function () {
    // Les lignes et les colonnes que la sélection couvre (choisies par leurs numéros, leurs lettres ou en glissant) : en ajouter autant, y coller un
    // bloc de cases.

    // Dans un tableur, insérer des lignes en ajoute autant que la sélection en couvre : trois numéros choisis, trois lignes neuves au-dessus de la
    // première ou sous la dernière. prosemirror-tables n'en ajoute qu'une par commande ; on appelle donc `addRow` / `addColumn` une fois par ligne (ou
    // colonne) couverte, à la même place, chacune sur le tableau tel que la précédente l'a laissé. Le tout sur UNE transaction (un seul Annuler, une
    // seule réparation de la grille, quelle que soit la taille de la sélection), la sélection restant sur les mêmes cases. Chaque appel a sa
    // transaction neuve : `addColumn` repère ses cases par `tr.mapping`, qui ne doit compter que les pas de son propre appel. Un simple curseur n'ajoute
    // qu'une ligne, même dans une case fusionnée. Dans un document, le tableau est celui du curseur (le suivi des modifications n'y change rien : ce sont
    // les mêmes pas que ceux de la commande d'une ligne, qu'il suit).
    function insertLines(ed, command) {
      const info = tableInfo(ed.state.doc, ed.state.selection);
      const rect = info && selectionRect(ed.state, info);
      if (!rect) return false;
      const byRow = command === 'addRowBefore' || command === 'addRowAfter';
      const after = command === 'addRowAfter' || command === 'addColumnAfter';
      const count = isCellSelection(ed.state.selection) ? (byRow ? rect.bottom - rect.top : rect.right - rect.left) : 1;
      const at = byRow ? (after ? rect.bottom : rect.top) : (after ? rect.right : rect.left);
      const add = byRow ? libs.addRow : libs.addColumn;
      return ed.chain().focus().command(({ tr }) => {
        for (let i = 0; i < count; i++) {
          const table = { node: tr.doc.nodeAt(info.pos), pos: info.pos };
          const step = libs.EditorState.create({ doc: tr.doc }).tr;
          add(step, { map: libs.TableMap.get(table.node), tableStart: table.pos + 1, table: table.node }, at);
          step.steps.forEach(one => tr.step(one));
        }
        return true;
      }).run();
    }

    // Coller sur des cases choisies : comme dans un tableur, le bloc copié se pose en entier à partir de la case en haut à gauche de la sélection.
    // prosemirror-tables le rogne aux dimensions de la sélection : trois lignes collées sur le numéro d'une ligne n'en donnaient qu'une, sur la lettre
    // d'une colonne que sa première colonne, répétée. Quand les dimensions de la sélection sont des multiples de celles du bloc (une case copiée et
    // collée sur toute une colonne, une ligne sur cinq lignes), on lui laisse le répéter pour remplir la sélection, comme un tableur. Sinon le curseur
    // passe dans la case en haut à gauche et prosemirror-tables colle le bloc, comme pour un curseur (la grille s'agrandit s'il le faut). Ne consomme
    // jamais le collage.
    function pasteFromTopLeft(view, slice) {
      const block = isCellSelection(view.state.selection) ? libs.pastedCells(slice) : null;
      const info = block && tableInfo(view.state.doc);
      const rect = info && selectionRect(view.state, info);
      if (!rect || ((rect.right - rect.left) % block.width === 0 && (rect.bottom - rect.top) % block.height === 0)) return false;
      const map = libs.TableMap.get(info.node);
      const corner = info.pos + 1 + map.map[rect.top * map.width + rect.left];
      view.dispatch(view.state.tr.setSelection(libs.TextSelection.near(view.state.doc.resolve(corner + 1), 1)));
      return false;
    }
    return { insertLines, pasteFromTopLeft };
  })();

  const { revealSelection, enterGoesDown } = (function () {
    // Le défilement vers la sélection sous les bandeaux collés, et la touche Entrée qui descend d'une case.

    // ProseMirror amène le curseur dans la vue en ne connaissant que le bord du panneau : les bandeaux collés (colonnes en haut, lignes à gauche)
    // recouvrent ce qui passe dessous, il ne les voit pas. Une flèche vers le haut ou la gauche, Maj+Tab ou Entrée laissaient le curseur, ou toute la
    // case, cachés sous eux ; vers le bas et la droite la case arrivait coupée au bord.
    // On complète son défilement après lui (l'évènement `transaction` de TipTap suit la mise à jour de la vue), pour toute transaction qui le demande :
    // flèches, Tab, Entrée, frappe, Annuler. Quand la transaction a changé de case, la case d'arrivée est montrée en entier ; puis, même dans une case
    // plus haute (ou plus large) que le panneau, reste en vue ce qui compte : le curseur, le début de ce qui est sélectionné quand on arrive en
    // sélectionnant la case (Entrée, Tab, Maj+Tab), sa tête quand on étend une sélection dans la même case. Dans la même case seul le curseur est
    // ramené hors des bandeaux : taper ne fait pas défiler une case coupée sur laquelle on vient de cliquer.
    const CARET_MARGIN_PX = 5; // la marge que ProseMirror laisse autour du curseur (`scrollMargin`)

    // Le rectangle où l'on voit vraiment le contenu : le panneau sans ses barres de défilement, moins les bandeaux collés.
    function visibleArea(scroller) {
      const cols = scroller.querySelector('.v2-grid-cols');
      const rows = scroller.querySelector('.v2-grid-rows');
      const box = scroller.getBoundingClientRect();
      return {
        top: box.top + (cols ? cols.offsetHeight : 0),
        left: box.left + (rows ? rows.offsetWidth : 0),
        bottom: box.top + scroller.clientHeight,
        right: box.left + scroller.clientWidth,
      };
    }

    // Défile du minimum pour que `rect` tienne dans `area` (`margin` px de plus quand il faut le bouger).
    function scrollRectInto(scroller, area, rect, margin) {
      if (rect.top < area.top) scroller.scrollTop -= area.top - rect.top + margin;
      else if (rect.bottom > area.bottom) scroller.scrollTop += rect.bottom - area.bottom + margin;
      if (rect.left < area.left) scroller.scrollLeft -= area.left - rect.left + margin;
      else if (rect.right > area.right) scroller.scrollLeft += rect.right - area.right + margin;
    }

    function revealSelection(view, movedToOtherCell) {
      const scroller = view.dom.closest('.v2-grid-mode');
      if (!scroller) return;
      const sel = view.state.selection;
      const area = visibleArea(scroller);
      const cell = currentCellDom(); // pour des cases choisies : celle où le geste se trouve (la dernière touchée)
      if (cell && movedToOtherCell) scrollRectInto(scroller, area, cell.getBoundingClientRect(), 0);
      if (isCellSelection(sel)) return; // des cases choisies n'ont pas de curseur
      scrollRectInto(scroller, area, view.coordsAtPos(movedToOtherCell ? sel.from : sel.head, 1), CARET_MARGIN_PX);
    }

    // Comme dans Excel et Google Sheets : Entrée descend d'une case et la sélectionne (on tape par-dessus, comme avec Tab) ; Maj+Entrée et Ctrl+Entrée
    // ajoutent une ligne dans la case (le retour à la ligne forcé de TipTap, que ces deux touches faisaient déjà). Sur la dernière ligne la touche est
    // prise sans rien faire : pas de ligne de tableau ajoutée en passant, pas de paragraphe vide. Dans toute case de tableau, d'une grille comme d'un
    // document ; le tableau est celui de la case, le tableau intérieur d'un tableau dans une case compris.

    // La case d'où Entrée part, null quand la touche garde son sens. Le texte doit être un paragraphe ou un titre posé directement dans la case : dans
    // une liste (puces, numéros, tâches) Entrée ajoute un point, dans un bloc de code, une citation, un encadré ou une colonne elle coupe le bloc, sinon
    // on n'y en ajouterait jamais. Des cases choisies : celle d'où la sélection est partie (comme Excel, Entrée se range sous elle).
    function enterCellPos(sel) {
      if (isCellSelection(sel)) return sel.$anchorCell.pos;
      const $head = sel.$head;
      const depth = ancestorDepth($head, CELL_NODES);
      return depth && $head.depth === depth + 1 && $head.parent.type.name !== 'codeBlock' ? $head.before(depth) : null;
    }

    // La case sous la case active, dans sa colonne de gauche ; sous une case fusionnée sur plusieurs lignes, la case qui suit sa dernière ligne. Null
    // sur la dernière ligne.
    function cellBelowPos(info, cellPos) {
      const map = libs.TableMap.get(info.node);
      const rect = map.findCell(cellPos - (info.pos + 1));
      return rect.bottom < map.height ? info.pos + 1 + map.map[rect.bottom * map.width + rect.left] : null;
    }

    function enterGoesDown(ed) {
      if (!ed.isEditable || ed.view.composing) return false;
      const { state, view } = ed;
      const here = enterCellPos(state.selection);
      if (here == null) return false;
      const $here = state.doc.resolve(here); // devant la case, dans sa ligne : la ligne est à `depth`, le tableau juste au-dessus
      const info = { node: $here.node($here.depth - 1), pos: $here.before($here.depth - 1) };
      const below = cellBelowPos(info, here);
      if (below == null) return true;
      const $below = state.doc.resolve(below);
      // `scrollIntoView` : `revealSelection` (plus haut) montre ensuite la case d'arrivée en entier, sous les bandeaux collés.
      view.dispatch(state.tr.setSelection(libs.TextSelection.between($below, state.doc.resolve(below + $below.nodeAfter.nodeSize))).scrollIntoView());
      return true;
    }
    return { revealSelection, enterGoesDown };
  })();

  const { createEnterExtension, createExtension } = (function () {
    // Les extensions TipTap : la touche Entrée, et celle de la grille (garde-fou, sélection, collage, Suppr).

    // Une extension à part, de priorité normale, rangée dans js/editor.js après StarterKit (sa liste à puces, ses touches de base) et avant Variables
    // et TextExpansion : TipTap essaie les extensions de la dernière rangée à la première, donc la liste `#` (ou celle des expansions) ouverte garde
    // son Entrée (choisir une ligne) et ne cède la touche à la case du dessous que quand elle n'en veut pas, alors que celle d'un calcul (priorité
    // 1000) passe toujours devant. Hors d'une case de tableau la fonction rend faux : Entrée coupe le paragraphe.
    function createEnterExtension(Extension) {
      return Extension.create({
        name: 'gridEnter',
        addKeyboardShortcuts() {
          return { Enter: ({ editor: ed }) => enterGoesDown(ed) };
        },
      });
    }

    function createExtension(Extension) {
      const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
      return Extension.create({
        name: 'gridEditor',
        // Avant les raccourcis de Tableau (Retour arrière / Suppr sur toutes les cases = supprimer le tableau) et de TipTap (Ctrl+A = tout le
        // document).
        priority: 1000,
        addKeyboardShortcuts() {
          const when = fn => ({ editor: ed }) => (active ? fn(ed) : false);
          return {
            'Mod-a': when(selectAllCells),
            Backspace: when(clearSelectedCells),
            Delete: when(clearSelectedCells),
            'Mod-Backspace': when(clearSelectedCells),
            'Mod-Delete': when(clearSelectedCells),
          };
        },
        addProseMirrorPlugins() {
          return [new Plugin({
            key: new PluginKey('gridEditor'),
            filterTransaction(tr) {
              if (!active || !tr.docChanged) return true;
              return isValidGridDoc(tr.doc);
            },
            appendTransaction(trs, oldState, newState) {
              if (!active) return repairDocumentTables(trs, newState);
              let tr = trs.some(t => t.docChanged) ? repairGrid(newState, null) : null;
              const sel = tr ? tr.selection : newState.selection;
              if (!selectionInsideTable(sel)) {
                const back = selectionBackInside(tr ? tr.doc : newState.doc, sel);
                if (back) { if (!tr) tr = newState.tr; tr.setSelection(back); }
              }
              return tr;
            },
            props: {
              // Un tableau de tableur (Excel, Sheets, LibreOffice) est réécrit pour la grille avant que ProseMirror le lise : fusions, fond, texte,
              // alignements, traits (js/grid-table.js).
              transformPastedHTML(html) { return active ? GridTable.cleanPastedHtml(html) : html; },
              transformPasted(slice) { return active ? trimPastedSlice(slice) : slice; },
              handlePaste(view, event, slice) { return active ? pasteFromTopLeft(view, slice) : false; },
              decorations(state) {
                if (!active || isCellSelection(state.selection)) return null;
                const pos = currentCellPos(state);
                if (pos == null) return null;
                return DecorationSet.create(state.doc, [Decoration.node(pos, pos + state.doc.nodeAt(pos).nodeSize, { class: 'v2-grid-cur' })]);
              },
            },
          })];
        },
      });
    }
    return { createEnterExtension, createExtension };
  })();

  const { setColumnWidths, setColumnWidth, setRowHeight, colName, tableElement, measure, measureTable } = (function () {
    // La largeur d'une colonne, la hauteur d'une ligne, le nom d'une colonne et la taille mesurée sur le rendu.

    // Même parcours que `updateColumnWidth` de prosemirror-tables (poignée du bord d'une case) : toutes les cases de chaque colonne reçoivent la largeur,
    // une case fusionnée sur plusieurs colonnes ne change que sa part de `colwidth`. `entries` : des couples [rang de colonne, largeur]. Une seule
    // transaction, quel que soit le nombre de colonnes réglées ensemble ; la case est relue sur la transaction, pour qu'une case fusionnée sur deux
    // colonnes réglées ensemble reçoive ses deux parts. `info` : le tableau réglé (celui des bandeaux). `frozen` : la largeur n'est pas un choix de la personne
    // mais celle que le rendu a déjà (une colonne automatique que le glissé d'une autre fige) : ni suivie, ni dans l'historique.
    function setColumnWidths(info, entries, frozen) {
      const { state, view } = editor;
      const map = libs.TableMap.get(info.node);
      const tr = state.tr;
      entries.forEach(([colIndex, width]) => {
        for (let row = 0; row < map.height; row++) {
          const index = row * map.width + colIndex;
          if (row && map.map[index] === map.map[index - map.width]) continue;
          const pos = map.map[index];
          const attrs = tr.doc.nodeAt(info.pos + 1 + pos).attrs;
          const spanIndex = (attrs.colspan || 1) === 1 ? 0 : colIndex - map.colCount(pos);
          if (attrs.colwidth && attrs.colwidth[spanIndex] === width) continue;
          const colwidth = attrs.colwidth ? attrs.colwidth.slice() : new Array(attrs.colspan || 1).fill(0);
          colwidth[spanIndex] = width;
          tr.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, attrs, { colwidth }));
        }
      });
      if (!tr.docChanged) return;
      if (frozen) TrackChanges.skipTracking(tr.setMeta('addToHistory', false));
      view.dispatch(tr);
    }

    // La même largeur pour chaque colonne de `colIndexes`.
    function setColumnWidth(info, colIndexes, width) { setColumnWidths(info, colIndexes.map(colIndex => [colIndex, width])); }

    // La même hauteur pour chaque ligne de `rowIndexes`, en une seule transaction.
    function setRowHeight(info, rowIndexes, height) {
      const { state, view } = editor;
      const tr = state.tr;
      rowIndexes.forEach(rowIndex => {
        if (rowIndex >= info.node.childCount) return;
        const row = info.node.child(rowIndex);
        if (row.attrs.rowHeight !== height) tr.setNodeMarkup(rowPos(info, rowIndex), undefined, Object.assign({}, row.attrs, { rowHeight: height }));
      });
      if (tr.docChanged) view.dispatch(tr);
    }

    function colName(index) {
      let name = '';
      let n = index;
      do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return name;
    }

    // Le <table> du rendu pour le tableau `info` : nodeDOM d'un tableau est son enveloppe (.tableWrapper), on redescend sur le <table>.
    function tableElement(info) {
      const dom = editor.view.nodeDOM(info.pos);
      if (!dom) return null;
      return dom.tagName === 'TABLE' ? dom : (dom.querySelector && dom.querySelector('table')) || null;
    }

    // Taille réelle de chaque colonne et de chaque ligne du tableau d'un jeu de bandeaux, lue sur le rendu (une ligne que son texte agrandit n'a pas la
    // hauteur de son attribut). null quand il n'y a rien à mesurer : pas de tableau, ou éditeur masqué (Lecture, macro-modèle) ; les bandeaux d'une
    // grille gardent alors leur dernier état. Les lignes sont celles du document, retrouvées par leur position : une ligne que l'aperçu d'une page
    // descend sous une couture n'est qu'un style de plus, jamais une ligne de plus.
    function measure(set) { return measureTable(set.ctx.info()); }

    // La même mesure pour un tableau `info` quelconque (égaliser des lignes, des colonnes : js/grid-editor.js:equalizeLines), bandeaux montrés ou non.
    function measureTable(info) {
      const table = info && tableElement(info);
      if (!table) return null;
      const rect = table.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return null;
      const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
      const rows = [];
      let pos = info.pos + 1;
      info.node.forEach(row => { rows.push(editor.view.nodeDOM(pos)); pos += row.nodeSize; });
      if (rows.some(row => !row)) return null;
      // L'Aperçu A4 rembourre le haut de la ligne qui ouvre une page (la place laissée en bas de la page d'avant et la bande de saut : js/header-footer-preview.js) :
      // ce vide compte dans la hauteur rendue de la ligne, pas dans la sienne. `pads` (pixels écran) : à retirer pour lire la hauteur d'une ligne, et à laisser vide
      // devant son numéro.
      const zoom = active ? 1 : EditorCore.layoutZoom(table);
      const pads = rows.map(row => HeaderFooterPreview.rowPadOf(row) * zoom);
      return { info, table, rect, width: rect.width, height: rect.height, rows, widths: cols.map(c => c.getBoundingClientRect().width), heights: rows.map(r => r.getBoundingClientRect().height), pads };
    }
    return { setColumnWidths, setColumnWidth, setRowHeight, colName, tableElement, measure, measureTable };
  })();

  const { newStripSet, buildStrips, destroyStrips, refreshLabels, scheduleSync, watch, fillHeads, buildHead, markPageBreak } = (function () {
    // Les bandeaux : un jeu (coin, lettres, numéros) par tableau montré ; pose, retrait, étiquettes, programmation de leur rafraîchissement.

    // Un jeu de bandeaux. `ctx` dit de quel tableau il parle (`info()`, `table(info)` n'est pas nécessaire : `measure`), dans quelle unité la bulle du
    // glissé d'une poignée dit la taille (`format(px)`), quel facteur sépare ses pixels de ceux de la mise en page (`zoom(table)`), quelle largeur de page
    // le tableau ne dépasse pas (`pageWidth()`, null : aucune), quelles lignes portent un saut de page (`breaks()`), comment on le programme (`wanted()`)
    // et comment on le rafraîchit (`sync(force)`). Celui de la grille vit dans la feuille ; celui d'un tableau de document est posé par-dessus la page
    // (`documentStrips`).
    function newStripSet(ctx) {
      const corner = el('div', 'v2-grid-corner');
      const cols = el('div', 'v2-grid-cols');
      const rows = el('div', 'v2-grid-rows');
      [corner, cols, rows].forEach(node => node.setAttribute('aria-hidden', 'true'));
      const set = { corner, cols, rows, ctx, lastKey: '', syncFrame: 0, observer: null, watched: null };
      // mousedown et pointerdown : le focus reste dans l'éditeur (ni sélection de texte, ni perte du curseur) pendant qu'on clique un bandeau.
      [corner, cols, rows].forEach(node => node.addEventListener('mousedown', event => event.preventDefault()));
      corner.addEventListener('pointerdown', event => onCornerDown(set, event));
      cols.addEventListener('pointerdown', event => onStripDown(set, 'col', event));
      rows.addEventListener('pointerdown', event => onStripDown(set, 'row', event));
      if (typeof ResizeObserver === 'function') set.observer = new ResizeObserver(() => scheduleSync(set));
      return set;
    }

    // Les bandeaux de la grille : insérés dans la feuille, avant le tableau, où la grille CSS les range et où ils collent au défilement.
    function buildStrips() {
      const sheet = editor.view.dom.parentElement;
      if (!sheet || strips) return;
      strips = newStripSet(gridContext);
      sheet.insertBefore(strips.rows, sheet.firstChild);
      sheet.insertBefore(strips.cols, sheet.firstChild);
      sheet.insertBefore(strips.corner, sheet.firstChild);
      refreshLabels(strips);
      const info = gridContext.info();
      watch(strips, info ? tableElement(info) : null);
    }

    // Le jeu garde l'œil sur le tableau montré (sa taille change sans transaction : une image qui charge, une police, le panneau qu'on redimensionne).
    function watch(set, table) {
      if (!set.observer || set.watched === table) return;
      set.observer.disconnect();
      set.watched = table;
      if (table) set.observer.observe(table);
      if (table && set.ctx.watchEditor) set.observer.observe(editor.view.dom);
    }

    function destroyStrips() {
      if (strips) {
        if (strips.observer) strips.observer.disconnect();
        if (strips.syncFrame) cancelAnimationFrame(strips.syncFrame);
        [strips.corner, strips.cols, strips.rows].forEach(node => node.remove());
        strips = null;
      }
      const preview = document.getElementById('pp-grid-resize-preview');
      if (preview) preview.remove();
      hideTip();
    }

    function refreshLabels(set) {
      if (!set) return;
      set.corner.title = I18n.t('grid.selectAll');
      set.cols.querySelectorAll('.v2-grid-handle').forEach(h => { h.title = I18n.t('grid.resizeColumn'); });
      set.rows.querySelectorAll('.v2-grid-handle').forEach(h => { h.title = I18n.t('grid.resizeRow'); });
      set.rows.querySelectorAll('.v2-grid-rowhead.has-break').forEach(h => { h.title = I18n.t(set.ctx.breakTitle || 'grid.pageBreak'); });
    }

    function scheduleSync(set) {
      if (!set || set.syncFrame || !set.ctx.wanted()) return;
      set.syncFrame = requestAnimationFrame(() => { set.syncFrame = 0; set.ctx.sync(); });
    }

    function fillHeads(container, count, className, build) {
      while (container.children.length > count) container.lastChild.remove();
      while (container.children.length < count) container.appendChild(build(className));
    }

    // Une lettre ou un numéro : l'étiquette, et la poignée qui règle la taille de sa colonne ou de sa ligne.
    function buildHead(className) {
      const head = el('div', className);
      head.appendChild(el('span', 'v2-grid-label'));
      const handle = el('span', 'v2-grid-handle');
      handle.title = I18n.t(className === 'v2-grid-colhead' ? 'grid.resizeColumn' : 'grid.resizeRow');
      head.appendChild(handle);
      return head;
    }

    // Le numéro d'une ligne qui porte un saut de page : une pastille à cheval sur son bord haut (le trait en tirets sur la ligne, c'est css/grid.css),
    // et l'info-bulle du saut (`titleKey` : celle d'une grille parle de l'Excel, celle d'un document du Word). La pastille ne répond pas au pointeur : la
    // poignée qui règle la ligne du dessus, juste dessous, reste atteignable.
    function markPageBreak(head, on, titleKey) {
      head.classList.toggle('has-break', on);
      let badge = head.querySelector(':scope > .v2-grid-break');
      if (!on) { if (badge) badge.remove(); head.removeAttribute('title'); return; }
      if (!badge) { badge = el('span', 'v2-grid-break'); badge.innerHTML = Icons.svg('gridBreak'); head.appendChild(badge); }
      head.title = I18n.t(titleKey || 'grid.pageBreak');
    }
    return { newStripSet, buildStrips, destroyStrips, refreshLabels, scheduleSync, watch, fillHeads, buildHead, markPageBreak };
  })();

  const { syncStrips, onCornerDown } = (function () {
    // Le rafraîchissement d'un jeu de bandeaux et ce que la sélection y allume.

    // Remet les lettres et les numéros à la taille du rendu ; rend la mesure (celle de `measure`), null quand il n'y a rien à mesurer.
    function syncStrips(set, force) {
      const m = measure(set);
      if (!m) return null;
      watch(set, m.table);
      const breaks = set.ctx.breaks(m.info);
      const key = m.widths.map(w => w.toFixed(2)).join(',') + '|' + m.heights.map(h => h.toFixed(2)).join(',') + '|' + m.pads.map(p => p.toFixed(2)).join(',') + '|' + breaks.map(on => (on ? 1 : 0)).join('');
      if (force || key !== set.lastKey) {
        set.lastKey = key;
        fillHeads(set.cols, m.widths.length, 'v2-grid-colhead', buildHead);
        fillHeads(set.rows, m.heights.length, 'v2-grid-rowhead', buildHead);
        m.widths.forEach((w, i) => {
          const head = set.cols.children[i];
          head.style.width = w + 'px';
          head.firstChild.textContent = colName(i);
          head.dataset.index = String(i);
        });
        m.heights.forEach((h, i) => {
          const head = set.rows.children[i];
          // Le numéro d'une ligne qui ouvre une page se pose sur la ligne elle-même, le vide d'au-dessus reste vide (comme la page).
          head.style.height = (h - m.pads[i]) + 'px';
          head.style.marginTop = m.pads[i] ? m.pads[i] + 'px' : '';
          head.firstChild.textContent = String(i + 1);
          head.dataset.index = String(i);
          markPageBreak(head, !!breaks[i], set.ctx.breakTitle);
        });
        refreshLabels(set);
      }
      highlightSelection(set, m.info);
      return m;
    }

    // Les bandeaux des colonnes et des lignes touchées par la sélection s'allument (comme dans un tableur).
    function highlightSelection(set, info) {
      const sel = editor.state.selection;
      let colFrom = -1; let colTo = -2; let rowFrom = -1; let rowTo = -2;
      if (info) {
        const map = libs.TableMap.get(info.node);
        const start = info.pos + 1;
        let rect = null;
        if (isCellSelection(sel)) {
          const a = map.findCell(sel.$anchorCell.pos - start);
          const b = map.findCell(sel.$headCell.pos - start);
          rect = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
        } else {
          const cellPos = currentCellPos(editor.state);
          if (cellPos != null) rect = map.findCell(cellPos - start);
        }
        if (rect) { colFrom = rect.left; colTo = rect.right - 1; rowFrom = rect.top; rowTo = rect.bottom - 1; }
      }
      Array.prototype.forEach.call(set.cols.children, (head, i) => head.classList.toggle('sel', i >= colFrom && i <= colTo));
      Array.prototype.forEach.call(set.rows.children, (head, i) => head.classList.toggle('sel', i >= rowFrom && i <= rowTo));
    }

    function onCornerDown(set, event) {
      if (event.button !== 0 || !editor) return;
      event.preventDefault();
      const info = set.ctx.info();
      if (info) selectAllCells(editor, info);
      editor.view.focus();
    }
    return { syncStrips, onCornerDown };
  })();

  // Le tableau que le glissé d'une poignée règle porte cette marque le temps du glissé : l'aperçu et la mesure de la hauteur naturelle (des feuilles de style)
  // ne visent que lui. Une grille n'a qu'un tableau, un document peut en porter plusieurs (un tableau dans une case compris) : sans elle, tirer la ligne 2 du
  // premier réglerait aussi la ligne 2 de tous les autres. Un attribut du <table> : la vue de Tiptap en ignore les changements, ProseMirror ne relit rien.
  const SIZING_MARK = 'data-pp-sizing';
  const SIZING_TABLE = `.tiptap table[${SIZING_MARK}]`;
  // La ligne de rang `index` de ce tableau. Avec le suivi des modifications, Tiptap enveloppe une ligne dont la hauteur est proposée dans un <span> (deux quand elle
  // porte plusieurs marques) : l'enfant de rang `index` du <tbody> est alors ce <span>, la ligne est dedans. Sans cela, une ligne déjà proposée n'avait plus d'aperçu
  // et sa hauteur naturelle (le plancher) se mesurait sans rien retirer : elle ne pouvait plus descendre sous sa hauteur du moment.
  const sizingRow = index => {
    const nth = `${SIZING_TABLE} > tbody > `;
    return `${nth}tr:nth-child(${index + 1}), ${nth}span:nth-child(${index + 1}) > tr, ${nth}span:nth-child(${index + 1}) > span > tr`;
  };

  const { onStripDown, showTip, hideTip, naturalRowHeight } = (function () {
    // Les gestes sur les bandeaux : choisir une ligne ou une colonne, l'info-bulle, la hauteur naturelle d'une ligne.

    function selectLine(set, kind, index, extend) {
      const info = set.ctx.info();
      if (!info) return;
      const map = libs.TableMap.get(info.node);
      const start = info.pos + 1;
      const cellAt = (row, col) => start + map.map[row * map.width + col];
      const sel = editor.state.selection;
      let anchorIndex = index;
      if (extend) {
        const cell = cellPosOf(sel, '$anchorCell');
        if (cell != null) { const rect = map.findCell(cell - start); anchorIndex = kind === 'col' ? rect.left : rect.top; }
      }
      const anchorCell = kind === 'col' ? cellAt(0, anchorIndex) : cellAt(anchorIndex, 0);
      const headCell = kind === 'col' ? cellAt(map.height - 1, index) : cellAt(index, map.width - 1);
      editor.commands.setCellSelection({ anchorCell, headCell });
      editor.view.focus();
    }

    function onStripDown(set, kind, event) {
      if (event.button !== 0 || !editor) return;
      const head = event.target.closest(kind === 'col' ? '.v2-grid-colhead' : '.v2-grid-rowhead');
      if (!head) return;
      event.preventDefault();
      const index = parseInt(head.dataset.index, 10);
      if (event.target.closest('.v2-grid-handle')) startResize(set, kind, index, event);
      else selectLine(set, kind, index, event.shiftKey);
    }

    function showTip(text, event) {
      if (!tip) { tip = el('div', 'v2-grid-tip'); tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
      tip.textContent = text;
      tip.style.left = Math.min(event.clientX + 14, window.innerWidth - 70) + 'px';
      tip.style.top = Math.min(event.clientY + 14, window.innerHeight - 30) + 'px';
    }
    function hideTip() { if (tip) { tip.remove(); tip = null; } }

    // Hauteur d'une ligne réduite à son contenu : le plancher du glissé (« une ligne ne descend pas sous la hauteur de son texte »). Pour des lignes
    // tirées ensemble, la plus haute de leurs hauteurs : elles reçoivent toutes la même. Mesurée par une feuille de style d'un instant, pas en
    // changeant le style d'une ligne : ProseMirror verrait la ligne modifiée et la redessinerait. Une seule feuille pour toutes les lignes, celles du
    // seul tableau que le glissé règle (`SIZING_MARK` : un document peut en porter plusieurs, un tableau dans une case compris). `pads` : le rembourrage de
    // l'Aperçu A4 en haut de la ligne qui ouvre une page (`measureTable`), retiré : il ne fait pas partie de la hauteur de la ligne.
    function naturalRowHeight(rows, indexes, pads) {
      const probe = document.createElement('style');
      probe.textContent = `${indexes.map(sizingRow).join(', ')} { height: 0 !important; }`;
      document.head.appendChild(probe);
      const height = Math.max(...indexes.map(index => rows[index].getBoundingClientRect().height - ((pads && pads[index]) || 0)));
      probe.remove();
      return Math.ceil(height);
    }
    return { onStripDown, showTip, hideTip, naturalRowHeight };
  })();

  const { startResize, planColumnWidths } = (function () {
    // Le glissé d'une poignée : la largeur d'une colonne ou la hauteur d'une ligne, celle de toutes les lignes (colonnes) choisies quand elle en est une.

    // Les lignes (ou colonnes) que la poignée `index` règle : toutes celles que la sélection couvre en entier quand `index` en fait partie (plusieurs
    // lignes choisies par leurs numéros, tirer le trait de l'une les règle toutes à la même hauteur, comme dans un tableur), sinon `index` seule. Une
    // sélection qui ne couvre pas toute la largeur (toute la hauteur pour des colonnes) du tableau, un simple curseur, une poignée hors de la
    // sélection, ou UNE seule case choisie (des colonnes entières fusionnées en une case, que la fusion laisse choisie) : le trait ne règle que sa ligne.
    function chosenLines(info, kind, index) {
      const selection = editor.state.selection;
      const rect = info && isCellSelection(selection) && selection.ranges.length > 1 && selectionRect(editor.state, info);
      if (!rect) return [index];
      const map = libs.TableMap.get(info.node);
      const isCol = kind === 'col';
      const whole = isCol ? rect.top === 0 && rect.bottom === map.height : rect.left === 0 && rect.right === map.width;
      const from = isCol ? rect.left : rect.top;
      const to = (isCol ? rect.right : rect.bottom) - 1;
      if (!whole || index < from || index > to) return [index];
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    }

    // Partage entier de `amount` entre des parts de poids `weights`, au prorata : la somme des parts est exactement `amount`, aucune ne dépasse son poids
    // (quand `amount` ne dépasse pas la somme des poids). Chaque part est arrondie vers le bas, les plus grands restes reçoivent le pixel qui manque.
    function shareOut(amount, weights) {
      const sum = weights.reduce((a, b) => a + b, 0);
      if (!(sum > 0) || !(amount > 0)) return weights.map(() => 0);
      const exact = weights.map(w => amount * w / sum);
      const parts = exact.map(Math.floor);
      let rest = amount - parts.reduce((a, b) => a + b, 0);
      exact.map((x, i) => [x - parts[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0 && parts[i] < weights[i]) { parts[i] += 1; rest -= 1; } });
      return parts;
    }

    // TipTap ne dessine pas une colonne sous 25 px (`cellMinWidth` de son tableau, js/editor.js:DEFAULT_COL_PX) : une colonne qui cède sa place s'arrête là, sinon le
    // rendu serait plus large que la somme des largeurs posées et le tableau dépasserait la page d'autant.
    const RENDERED_MIN_COL_PX = 25;

    // Ce que le glissé d'une largeur laisse à chaque colonne, en pixels de mise en page entiers. `base` : la largeur de départ de chaque colonne du tableau ;
    // `lines` : les colonnes tirées (rangs contigus), qui reçoivent toutes `size` ; `pageWidth` : la largeur de la page que le tableau ne dépasse pas, ou null
    // quand rien ne la limite (une grille, une page sans Aperçu A4). Rend { widths, size } : la largeur de chaque colonne et celle que les colonnes tirées ont
    // obtenue. Réduire une colonne ne rend rien aux autres (le tableau se rétrécit). L'agrandir au-delà de la page, c'est prendre la place aux colonnes qui la
    // suivent, chacune au prorata de ce qu'elle peut céder (sa largeur moins 25 px, le plus étroit qu'une colonne se dessine) ; quand elles ne suffisent pas, ou quand il n'y en a
    // plus (la dernière colonne), la colonne tirée s'arrête où la page finit : le tableau ne sort pas de la page, comme le rognage de js/editor.js
    // (clampOverflowingTables) qui, lui, rétrécirait toutes les colonnes d'un coup. Un tableau déjà plus large que la page n'est ni rogné ni élargi.
    function planColumnWidths(base, lines, size, pageWidth) {
      const widths = base.slice();
      const count = lines.length;
      const last = Math.max(...lines);
      const total = base.reduce((a, b) => a + b, 0);
      const chosen = lines.reduce((sum, i) => sum + base[i], 0);
      let given = Math.max(MIN_COL_WIDTH_PX, size);
      let excess = 0;
      let slack = base.map(() => 0);
      if (pageWidth != null) {
        const limit = Math.max(pageWidth, total);
        slack = base.map((w, i) => (i > last ? Math.max(0, w - RENDERED_MIN_COL_PX) : 0));
        given = Math.max(MIN_COL_WIDTH_PX, Math.min(given, Math.floor((limit - total + slack.reduce((a, b) => a + b, 0) + chosen) / count)));
        excess = total + count * given - chosen - limit;
      }
      lines.forEach(i => { widths[i] = given; });
      if (excess > 0) shareOut(excess, slack).forEach((part, i) => { widths[i] -= part; });
      return { widths, size: given };
    }

    // Les tailles du rendu sont des pixels écran, celles du document des pixels de mise en page : l'écart est le facteur de réduction de la feuille
    // (`zoom`, 1 dans une grille). La poignée, l'info-bulle et l'enregistrement parlent en pixels de mise en page ; les bandeaux, en pixels écran.
    function startResize(set, kind, index, event) {
      const m = measure(set);
      if (!m) return;
      const zoom = set.ctx.zoom(m.table);
      const isCol = kind === 'col';
      const target = event.target;
      const lines = chosenLines(m.info, kind, index);
      const strip = isCol ? set.cols : set.rows;
      const heads = lines.map(i => strip.children[i]);
      const sizes = lines.map(i => (isCol ? m.widths[i] : m.heights[i] - m.pads[i]) / zoom);
      // Colonnes : la largeur de départ de CHAQUE colonne, car la page les lie (celles à droite cèdent la place qui manque). Celle que le document pose ;
      // une colonne automatique (sans largeur posée) a celle du rendu, arrondie vers le bas : la somme ne dépasse pas ce que la page montre.
      const known = isCol ? knownColumnWidths(m.info.node) : [];
      const base = isCol ? m.widths.map((w, i) => known[i] || Math.floor(w / zoom + 1e-6)) : [];
      const pageWidth = isCol ? set.ctx.pageWidth() : null;
      const start = isCol ? event.clientX : event.clientY;
      const startSize = isCol ? base[index] : sizes[lines.indexOf(index)];
      // La marque est posée avant la mesure de la hauteur naturelle : elle et l'aperçu ne visent que ce tableau.
      m.table.setAttribute(SIZING_MARK, '');
      const min = isCol ? MIN_COL_WIDTH_PX : Math.ceil(naturalRowHeight(m.rows, lines, m.pads) / zoom);
      const max = isCol ? MAX_COL_WIDTH_PX : MAX_ROW_HEIGHT_PX;
      let size = Math.max(min, Math.round(startSize));
      let plan = null;
      // Plusieurs lignes tirées ensemble : rien ne change avant le premier déplacement de la poignée (leur plancher commun peut dépasser la taille de départ de celle qu'on
      // tire), et un appui sans déplacement net, ou un retour au point de départ, n'enregistre rien.
      let moved = lines.length === 1;
      let at = start;
      try { target.setPointerCapture(event.pointerId); } catch (e) { /* capture indisponible : les écouteurs du document suffisent */ }
      document.body.classList.add(isCol ? 'pp-grid-resizing-col' : 'pp-grid-resizing-row');

      // Aperçu par une feuille de style posée dans <head>, jamais par un style en ligne sur le tableau : ProseMirror lit un attribut modifié sur une
      // ligne (<tr>) comme un changement du document à relire et redessine la ligne (l'aperçu d'une hauteur s'effacerait aussitôt). Il
      // ne voit rien d'une feuille de style, et le rendu d'avant n'est jamais touché : annuler = retirer la feuille. Une colonne : toutes celles que le glissé
      // touche (les tirées, celles qui cèdent la place, les automatiques que l'enregistrement figera) prennent leur largeur du plan, le tableau la somme.
      const preview = document.createElement('style');
      preview.id = 'pp-grid-resize-preview';
      document.head.appendChild(preview);
      const apply = value => {
        if (isCol) {
          plan = planColumnWidths(base, lines, value, pageWidth);
          size = plan.size;
          const touched = plan.widths.map((w, i) => known[i] === 0 || w !== base[i]);
          preview.textContent = plan.widths.map((w, i) => (touched[i] ? `${SIZING_TABLE} > colgroup > col:nth-child(${i + 1}) { width: ${w}px !important; }` : '')).join(' ')
            + ` ${SIZING_TABLE} { width: ${plan.widths.reduce((a, b) => a + b, 0)}px !important; }`;
          Array.prototype.forEach.call(strip.children, (head, i) => { head.style.width = (touched[i] ? plan.widths[i] * zoom : m.widths[i]) + 'px'; });
          return;
        }
        // La ligne qui ouvre une page garde son vide d'au-dessus : sa hauteur rendue est celle de la ligne plus ce vide.
        preview.textContent = lines.map(i => `${sizingRow(i)} { height: ${value + m.pads[i] / zoom}px !important; }`).join(' ');
        heads.forEach(head => { head.style.height = value * zoom + 'px'; });
      };
      if (moved && !isCol) apply(size);
      showTip(set.ctx.format(size), event);
      const onMove = e => {
        at = isCol ? e.clientX : e.clientY;
        if (!moved && at === start) return;
        moved = true;
        size = Math.min(max, Math.max(min, Math.round(startSize + (at - start) / zoom)));
        apply(size);
        showTip(set.ctx.format(size), e);
      };
      const finish = commit => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('keydown', onKey, true);
        try { target.releasePointerCapture(event.pointerId); } catch (e) { /* déjà relâché */ }
        document.body.classList.remove('pp-grid-resizing-col', 'pp-grid-resizing-row');
        hideTip();
        const done = commit && moved && (lines.length === 1 || at !== start);
        // L'enregistrement redessine le tableau à sa nouvelle taille (synchrone) avant que l'aperçu ne soit retiré : pas de saut.
        if (isCol) {
          const changes = done && plan ? plan.widths.map((w, i) => [i, w]).filter(([i, w]) => w !== base[i]) : [];
          if (changes.length) {
            // Les colonnes automatiques prennent d'abord la largeur qu'elles ont (elles gardent leur place quand une autre change), sans que cela soit un choix de
            // la personne : ni suivi, ni dans l'historique, un Annuler rend les colonnes tirées à cette largeur.
            const autos = known.map((w, i) => [i, base[i]]).filter(([i]) => known[i] === 0);
            if (autos.length) setColumnWidths(m.info, autos, true);
            setColumnWidths(m.info, changes);
          } else {
            Array.prototype.forEach.call(strip.children, (head, i) => { head.style.width = m.widths[i] + 'px'; });
          }
        } else if (done && sizes.some(one => Math.round(one) !== size)) setRowHeight(m.info, lines, size);
        else heads.forEach((head, k) => { head.style.height = sizes[k] * zoom + 'px'; });
        preview.remove();
        m.table.removeAttribute(SIZING_MARK);
        set.lastKey = '';
        scheduleSync(set);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
      document.addEventListener('keydown', onKey, true);
    }
    return { startResize, planColumnWidths };
  })();

  const { canEqualize, equalizeLines } = (function () {
    // Égaliser : la hauteur des lignes (la largeur des colonnes) que les cases choisies couvrent devient leur moyenne.

    // Les rangs des lignes (`kind` 'row') ou des colonnes ('col') du tableau `info` que les cases choisies couvrent, de la première à la dernière ; [] hors d'un
    // tableau, pour un simple curseur et pour UNE seule case choisie (une case fusionnée sur plusieurs lignes n'est pas « plusieurs lignes choisies » : la
    // règle de `chosenLines`, le glissé d'une poignée).
    function coveredLines(ed, info, kind) {
      const selection = ed.state.selection;
      const rect = info && isCellSelection(selection) && selection.ranges.length > 1 && selectionRect(ed.state, info);
      if (!rect) return [];
      const from = kind === 'col' ? rect.left : rect.top;
      const to = kind === 'col' ? rect.right : rect.bottom;
      return Array.from({ length: to - from }, (_, i) => from + i);
    }

    // Une moyenne n'a de sens que pour au moins deux lignes (colonnes) : le bouton est grisé sinon.
    function canEqualize(ed, kind) {
      return coveredLines(ed, tableInfo(ed.state.doc, ed.state.selection), kind).length >= 2;
    }

    // La taille de chaque ligne (colonne) couverte, lue sur le rendu en pixels de MISE EN PAGE (une ligne que son texte agrandit n'a pas la hauteur de son attribut ;
    // une colonne automatique n'a pas de largeur posée), est remplacée par leur moyenne arrondie, en une seule transaction (un seul Annuler). Une somme qui ne
    // bouge pas : le tableau garde sa taille, la page n'a rien à rogner. Une ligne ne descend pas sous la hauteur de son texte (le plancher du glissé d'une
    // poignée, `naturalRowHeight`) : quand une ligne a plus de texte que la moyenne n'en laisse, toutes prennent sa hauteur, égales plutôt qu'à la moyenne.
    // Une colonne ne descend pas sous la largeur minimale d'une colonne. Dans un document la sélection est celle du tableau du curseur.
    function equalizeLines(ed, kind) {
      const info = tableInfo(ed.state.doc, ed.state.selection);
      const lines = coveredLines(ed, info, kind);
      if (lines.length < 2) return false;
      const m = measureTable(info);
      if (!m) return false;
      const zoom = active ? 1 : EditorCore.layoutZoom(m.table);
      const isCol = kind === 'col';
      const mean = Math.round(lines.reduce((sum, i) => sum + (isCol ? m.widths[i] : m.heights[i] - m.pads[i]), 0) / lines.length / zoom);
      if (isCol) {
        setColumnWidth(info, lines, Math.min(MAX_COL_WIDTH_PX, Math.max(MIN_COL_WIDTH_PX, mean)));
        return true;
      }
      // Le plancher se mesure sur ce tableau seul (`SIZING_MARK`), comme pendant le glissé d'une poignée.
      m.table.setAttribute(SIZING_MARK, '');
      const floor = Math.ceil(naturalRowHeight(m.rows, lines, m.pads) / zoom);
      m.table.removeAttribute(SIZING_MARK);
      setRowHeight(info, lines, Math.min(MAX_ROW_HEIGHT_PX, Math.max(floor, mean)));
      return true;
    }
    return { canEqualize, equalizeLines };
  })();

  // Les bandeaux de la grille : son seul tableau, sans réduction de la feuille, avec les sauts de page de ses lignes. Se rafraîchissent tant que le mode
  // grille est actif. Les tailles s'y disent en pixels, comme dans un tableur.
  const gridContext = {
    format: px => px + ' px',
    watchEditor: false,
    info: () => (editor ? tableInfo(editor.state.doc) : null),
    zoom: () => 1,
    pageWidth: () => null,
    breaks: info => pageBreakRows(info),
    breakTitle: 'grid.pageBreak',
    wanted: () => active && !!strips,
    sync: () => { if (active && strips && editor) syncStrips(strips); },
  };

  // Les bandeaux d'un tableau de document : celui où se trouve le curseur, avec les sauts de page de ses lignes, la feuille réduite à ~0,85 dans un panneau
  // de 700 px. Ils n'existent que hors d'une grille (qui a les siens). Les numéros et les lettres ont leur poignée : tirer le bas d'une ligne en règle la
  // hauteur, tirer le bord droit d'une lettre la largeur de sa colonne, comme dans une grille, mais la page est en centimètres et la bulle du glissé le dit
  // en cm. En Aperçu A4 la page limite le tableau : une colonne qu'on agrandit prend la place aux colonnes qui la suivent plutôt que de sortir de la page
  // (`planColumnWidths` ; le bord des cases, lui, règle une colonne sans cette limite et js/editor.js:clampOverflowingTables rogne ensuite toutes les colonnes).
  const documentContext = {
    format: px => PageLayout.cmText(px * 25.4 / 96) + ' cm',
    watchEditor: true,
    info: () => documentStripsTable(),
    zoom: table => EditorCore.layoutZoom(table),
    // La largeur que le tableau ne dépasse pas : le corps de la page, marges déduites (en pixels de mise en page, entière : la somme des colonnes l'est
    // aussi). null hors de l'Aperçu A4, qui ne montre pas de page, et quand l'éditeur est masqué (largeur nulle) : rien ne limite alors le tableau.
    pageWidth: () => {
      const box = document.getElementById('editor-container');
      if (!editor || !box || !box.classList.contains('a4-preview')) return null;
      const width = EditorCore.editorContentWidthPx(editor);
      return width > 0 ? Math.floor(width) : null;
    },
    breaks: info => pageBreakRows(info),
    breakTitle: 'grid.pageBreakDocument',
    wanted: () => !active && !!docStrips,
    sync: () => syncDocumentStrips(),
  };

  const { documentStripsTable, documentStrips, syncDocumentStrips, removeDocumentStrips, documentStripsOffset } = (function () {
    // Les bandeaux A, B, C / 1, 2, 3 d'un tableau de document (le choix « Tableau actif ») : posés par-dessus la page, sans rien décaler,
    // tant que le curseur est dans un tableau du premier niveau du document. Hors de la feuille et de son défilement : une enveloppe fixe, qui a la taille
    // du plan de travail (elle les rogne à ses bords) et qui suit le tableau à chaque défilement. Les lettres et les numéros sont à la taille de l'écran
    // (la feuille est réduite, eux restent lisibles et se cliquent), calés sur les rectangles mesurés du tableau.

    // Le tableau dont la page montre les bandeaux : celui qui porte la sélection, quand il est au premier niveau du document (la place manque pour un
    // tableau dans une colonne, un encadré, une case ou une liste) et que l'éditeur peut le modifier. La condition de la barre du tableau : sans le
    // curseur dans l'éditeur, ni l'une ni les autres. Rien dans une grille.
    function documentStripsTable() {
      if (active || !editor || !editor.isEditable || !editor.view.hasFocus()) return null;
      const info = tableInfo(editor.state.doc, editor.state.selection);
      return info && editor.state.doc.resolve(info.pos).depth === 0 ? info : null;
    }

    // Créés au premier besoin et retirés dès qu'ils n'ont plus à se montrer (le curseur sort du tableau, une grille s'ouvre, l'éditeur perd le focus ou
    // se cache) : hors d'un tableau, la page ne garde aucun bandeau, ni caché ni vide. Ceux d'une grille se cherchent dans la feuille de l'éditeur.
    let wired = false;
    function documentStrips() {
      if (docStrips) return docStrips;
      docStrips = newStripSet(documentContext);
      const root = el('div', 'pp-doc-strips');
      root.hidden = true;
      [docStrips.corner, docStrips.cols, docStrips.rows].forEach(node => root.appendChild(node));
      document.body.appendChild(root);
      docStrips.root = root;
      docStrips.table = null;
      refreshLabels(docStrips);
      if (!wired) {
        wired = true;
        const box = document.getElementById('editor-container');
        if (box) box.addEventListener('scroll', placeOnScroll, { passive: true });
        window.addEventListener('resize', () => scheduleSync(docStrips));
      }
      return docStrips;
    }

    // Les trois bandeaux calés sur le rectangle du tableau (pixels écran) : les lettres juste au-dessus, les numéros juste à gauche, le coin entre les deux.
    // Les numéros ne sortent jamais par la gauche du plan de travail : sans marge à gauche du tableau (une page sans Aperçu A4 n'en a que 14 px), ils
    // recouvrent le bord du tableau - la bordure et le remplissage de ses cases, pas leur texte (la largeur des numéros en tient compte, css/grid.css).
    function placeDocumentStrips(set, tableRect) {
      const box = document.getElementById('editor-container');
      const outer = box.getBoundingClientRect();
      const left = outer.left + box.clientLeft;
      const top = outer.top + box.clientTop;
      const style = set.root.style;
      style.left = left + 'px';
      style.top = top + 'px';
      style.width = box.clientWidth + 'px';
      style.height = box.clientHeight + 'px';
      const w = set.corner.offsetWidth;
      const h = set.corner.offsetHeight;
      const x = tableRect.left - left;
      const y = tableRect.top - top;
      const side = Math.max(0, x - w);
      set.corner.style.left = side + 'px';
      set.corner.style.top = (y - h) + 'px';
      set.cols.style.left = x + 'px';
      set.cols.style.top = (y - h) + 'px';
      set.rows.style.left = side + 'px';
      set.rows.style.top = y + 'px';
    }

    function placeOnScroll() {
      const set = docStrips;
      if (!set || set.root.hidden || !set.table || !set.table.isConnected) return;
      placeDocumentStrips(set, set.table.getBoundingClientRect());
    }

    function removeDocumentStrips() {
      const set = docStrips;
      if (!set) return;
      docStrips = null;
      if (set.observer) set.observer.disconnect();
      if (set.syncFrame) cancelAnimationFrame(set.syncFrame);
      set.root.remove();
    }

    function syncDocumentStrips() {
      const set = docStrips;
      if (!set || !editor) return;
      if (!documentStripsTable()) { removeDocumentStrips(); return; }
      set.root.hidden = false;
      const m = syncStrips(set);
      if (!m) { removeDocumentStrips(); return; }
      set.table = m.table;
      placeDocumentStrips(set, m.rect);
    }

    // Ce que la barre du tableau laisse libre au-dessus du tableau pour ne pas recouvrir les lettres : leur hauteur, quand elles vont se montrer.
    function documentStripsOffset() {
      if (!documentStripsTable()) return 0;
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-strip-h')) || 22;
    }
    return { documentStripsTable, documentStrips, syncDocumentStrips, removeDocumentStrips, documentStripsOffset };
  })();

  // La bande où la barre de la case est fixée (index.html : #v2-cell-bar-dock, css/grid.css), entre la barre d'outils et le plan de travail : dans
  // une grille cette barre ne flotte plus sur la case courante. Posée sur une case, elle recouvrait les cases voisines : un appui dessus tombait sur
  // ses boutons, et ni un clic ni un glissé ne pouvait plus les atteindre.
  function barSlot() { return document.getElementById('v2-cell-bar-dock'); }

  // Barres flottantes d'image et de bulle : elles ne recouvrent jamais les bandeaux. Posée au-dessus de la première ligne, une barre cachait les
  // lettres (ni clic sur une lettre, ni poignée à tirer tant que le curseur était dans la première ligne). floating-ui la garde dans le plan de
  // travail, hors des deux bandeaux : elle passe sous la case quand il n'y a pas la place au-dessus, et reste à droite du bandeau des numéros.
  // Fonction relue à chaque calcul.
  function floatingOptions() {
    if (!active || !strips) return undefined;
    const box = document.getElementById('editor-container');
    const corner = strips.corner.getBoundingClientRect();
    const top = corner.height + 4;
    return { flip: { boundary: box, padding: { top } }, shift: { boundary: box, padding: { top, left: corner.width + 8, right: 8, bottom: 8 } } };
  }

  // Les boutons grisés d'une grille ne se déclenchent pas non plus au clavier (Tab puis Entrée) : un clic sur un bouton grisé de la barre est arrêté
  // en capture, comme js/main.js:wireAccessLockGuard le fait pour les droits. `v2-hf-locked` n'est posé qu'ici pendant une grille (ni en-tête, ni
  // email).
  function wireLockedClickGuard() {
    document.addEventListener('click', event => {
      if (!active || !event.target.closest) return;
      if (event.target.closest('#v2-toolbar .v2-hf-locked, .v2-floating-toolbar .v2-hf-locked, #v2-a4-toggle')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function attach(ed) {
    editor = ed;
    ed.on('transaction', ({ transaction }) => {
      if (!active) {
        lastCellDom = null;
        // Les bandeaux d'un tableau de document suivent chaque transaction (le curseur entre dans un tableau, en sort, le document change, l'éditeur
        // prend ou perd le focus) ; ils ne sont créés qu'à la première fois que le curseur est dans un tableau.
        if (docStrips || documentStripsTable()) scheduleSync(documentStrips());
        return;
      }
      const cell = currentCellDom();
      const moved = cell !== lastCellDom;
      lastCellDom = cell;
      if (transaction.docChanged || transaction.selectionSet) scheduleSync(strips);
      if (transaction.scrolledIntoView) revealSelection(ed.view, moved);
    });
    wireLockedClickGuard();
    I18n.onChange(() => { refreshLabels(strips); refreshLabels(docStrips); });
    if (active) setActive(true, true);
  }

  // Entre dans le mode grille ou en sort. Appelé par js/main.js à chaque chargement de modèle : faux avant Editor.setHTML (le garde-fou ne doit pas
  // refuser le contenu qu'on charge), puis vrai pour une grille (le document est alors ramené à une grille valable, les bandeaux se posent).
  function setActive(on, force) {
    on = !!on;
    if (on === active && !force) { if (on) scheduleSync(strips); return; }
    active = on;
    lastCellDom = null;
    const container = document.getElementById('editor-container');
    if (container) container.classList.toggle('v2-grid-mode', on);
    document.body.classList.toggle('pp-grid-mode', on);
    const a4Toggle = document.getElementById('v2-toggle-a4-preview');
    if (a4Toggle) a4Toggle.disabled = on;
    if (!editor) return;
    if (on) {
      // Une grille s'ouvre en haut à gauche : le plan de travail est celui du modèle précédent et en garderait le défilement, bandeaux et première
      // ligne hors de vue.
      if (container) { container.scrollTop = 0; container.scrollLeft = 0; }
      // Pas de suivi des modifications dans une grille : il ne suit ni les lignes, ni les colonnes, ni les fusions (bouton grisé), et un suivi resté
      // allumé d'un document précédent transformerait chaque frappe en suggestion.
      if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
      normalizeDocument();
      buildStrips();
      scheduleSync(strips);
      removeDocumentStrips();
    } else {
      destroyStrips();
    }
  }

  // Rafraîchit les bandeaux quand l'éditeur redevient visible (Lecture -> Édition) : js/editor.js:refreshLayout.
  function refresh() {
    if (active) { if (strips) strips.lastKey = ''; scheduleSync(strips); } else if (docStrips) scheduleSync(docStrips);
  }

  return {
    TYPE, DEFAULT_VALIGN, isForbiddenNode,
    configure, attach, createExtension, createEnterExtension, withTableAttributes, withRowAttributes, withCellAttributes, serialize, setActive, isActive, isGridType,
    refresh, currentCellDom, colName, floatingOptions, barSlot,
    canMerge, canSplit, mergeCells, splitCell, mergeSelected, splitSelected, tableSettingsBlocked, setVerticalAlign, selectedVerticalAlign, applyBorders, canApplyBorders, gridLinesShown, setGridLinesShown,
    canTogglePageBreak, hasPageBreak, togglePageBreak, pageBreakInTable, pageBreakBlock, insertLines, canEqualize, equalizeLines, documentStripsOffset, planColumnWidths,
  };
})();
