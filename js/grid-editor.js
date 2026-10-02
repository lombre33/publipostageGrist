// Mode grille (planning/feature-mode-grille-excel.md) : un modèle de type « grille » (colonne TypeModele) n'est pas un texte sur une page A4 mais UN tableau, sans
// feuille, dont on tire les traits pour régler les colonnes et les lignes, et que l'export Excel reprend case par case. Même éditeur TipTap que les documents
// (aucun second éditeur) : ce module n'ajoute que ce qui fait d'un document « un tableau et rien d'autre » -
//   - un garde-fou (filterTransaction) qui refuse toute modification dont le résultat ne serait plus UN seul tableau, sans second tableau ni bloc que la grille
//     ne sait pas exporter (deux colonnes, sommaire, citation, bloc de code...) : la barre les grise, le garde-fou tient aussi pour le collage et le clavier ;
//   - la sélection toujours DANS une case (jamais le paragraphe vide que TipTap range sous un tableau final, jamais le curseur « gap » après lui) ;
//   - les bandeaux A, B, C / 1, 2, 3 autour du tableau, collants au défilement, avec les poignées qui règlent la largeur d'une colonne et la hauteur d'une ligne
//     (aperçu en direct pendant le geste, UNE seule transaction au relâcher : un seul Annuler) ;
//   - la hauteur de ligne (`rowHeight` sur tableRow, plancher = la hauteur de son texte) et la largeur de colonne (`colwidth` de chaque case) toujours posées ;
//   - le saut de page, porté par une ligne (`pageBreakBefore`) : le PDF y commence une page, l'Excel une feuille ; une pastille dans le numéro de la ligne et un trait en tirets le montrent ;
//   - le collage dans une case, sans les lignes vides de fin que les textes copiés traînent (`trimPastedSlice`) ;
//   - Entrée qui descend d'une case (`enterGoesDown`), Maj+Entrée et Ctrl+Entrée qui ajoutent une ligne dans la case ;
//   - le collage d'un tableau de tableur (Excel, Sheets, LibreOffice) case par case, mise en forme comprise (`transformPastedHTML`, js/grid-table.js).
// Tout est inerte tant que setActive(true) n'a pas été appelé (js/main.js:loadTemplateIntoEditor) : un document, un email ou un macro-modèle ne voient rien de ce
// fichier. Script classique, même convention de portée globale que Editor/MainToolbar ; les classes TipTap/ProseMirror arrivent par configure() (editor.js).
const GridEditor = (function () {
  const TYPE = 'grille';
  const DEFAULT_COLS = 6;
  const DEFAULT_ROWS = 15;
  const DEFAULT_COL_WIDTH_PX = 100;
  const DEFAULT_ROW_HEIGHT_PX = 28;
  const MIN_COL_WIDTH_PX = 24;
  const MAX_COL_WIDTH_PX = 1200;
  const MAX_ROW_HEIGHT_PX = 1000;

  // Ce qu'une grille ne sait pas porter (ni à l'écran, ni dans l'Excel) : un second tableau, des colonnes de texte (le bloc de signature en est une), un sommaire,
  // une citation, un encadré, un bloc de code, un trait horizontal, une note de bas de page, un numéro de page (en-tête/pied : pas dans une grille), le saut de page
  // de document (celui d'une grille est porté par une ligne : `pageBreakBefore`). Jamais une liste, un titre, une image : ceux-là s'écrivent dans l'Excel (puces
  // « • », gras et taille, image posée sur la case).
  const FORBIDDEN_NODES = new Set(['table', 'twoColumnsZone', 'twoColumnsColumn', 'toc', 'headingNumberingConfig', 'pageBreak', 'blockquote', 'callout', 'codeBlock',
    'horizontalRule', 'footnoteRef', 'pageNumberBadge']);
  const CELL_NODES = new Set(['tableCell', 'tableHeader']);
  // Alignement vertical d'une case (`verticalAlign`, inline `vertical-align`) : au milieu par défaut, comme les en-têtes d'un tableur mis en forme ; le haut et le bas se choisiront
  // dans la barre de la case (lot « fusion, bordures, alignement vertical »). Posé sur CHAQUE case de la grille : l'éditeur, la Lecture, le PDF et l'Excel le lisent au même endroit.
  const VALIGNS = new Set(['top', 'middle', 'bottom']);
  const DEFAULT_VALIGN = 'middle';
  // Les quatre bords d'une case (js/table-borders.js : null = trait de départ, 'none' = pas de trait, '#rrggbb' = couleur) : un attribut par côté, écrit sur les deux cases d'un trait partagé.
  const BORDER_ATTRS = { top: 'borderTop', right: 'borderRight', bottom: 'borderBottom', left: 'borderLeft' };

  let libs = null;
  let editor = null;
  let active = false;
  let strips = null;
  let resizeObserver = null;
  let syncFrame = 0;
  let lastKey = '';
  let tip = null;

  function configure(deps) { libs = deps; }
  function isActive() { return active; }
  function isGridType(typeModele) { return typeModele === TYPE; }

  // --- Extension TipTap : hauteur de ligne -------------------------------------------------------------------------------------------------------------------
  // `rowHeight` : hauteur MINIMALE en px (une ligne que son texte agrandit garde sa hauteur de texte, comme un <tr style="height">). Absent (null) pour tout
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
          // Saut de page AVANT cette ligne : la grille n'a pas de page, mais son PDF et son Excel en ont (une nouvelle page, une nouvelle feuille : js/export-common.js:gridRowSegments).
          // Faux pour toute ligne d'un tableau de document ; `data-page-break-before` est la marque de l'enregistrement, lue par les exports et par le CSS qui trace le trait.
          pageBreakBefore: {
            default: false,
            parseHTML: el => el.getAttribute('data-page-break-before') === 'true',
            renderHTML: attrs => (attrs.pageBreakBefore ? { 'data-page-break-before': 'true' } : {}),
          },
        });
      },
    });
  }

  // `verticalAlign` : null pour toute case d'un tableau de document (aucun changement de rendu ni de HTML hors grille) ; 'top', 'middle' ou 'bottom' dans une grille.
  // Lu dans `data-valign` seulement, la marque de l'enregistrement : le `vertical-align` d'un tableau collé d'Excel ou du web ne doit rien changer à un tableau de
  // document (l'export PDF ne l'applique que dans une grille, l'éditeur et la Lecture le montreraient seuls).
  // Les bords (`borderTop`...) suivent la même règle : null pour toute case d'un tableau de document, lus dans `data-border-*` seulement (jamais dans le `border` d'un tableau collé) ;
  // écrits en ligne pour que l'éditeur, la Lecture, le PDF et l'Excel les lisent au même endroit - `hidden` = pas de trait (il l'emporte sur le trait de la case voisine, bordures fusionnées).
  function borderHtml(side, value) {
    const v = TableBorders.normalizeValue(value);
    if (!v) return {};
    return { ['data-border-' + side]: v, style: 'border-' + side + ': ' + (v === TableBorders.NONE ? 'hidden' : '1px solid ' + v) };
  }
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

  // Le HTML d'une grille enregistrée est son tableau, rien d'autre : le paragraphe vide que TipTap range sous un tableau final (TrailingNode) n'est pas du contenu - TipTap
  // le remet tout seul au chargement. Les exports (Lecture, PDF, Excel) n'ont ainsi jamais à le deviner : une ligne vide sous la grille, voire une page de plus.
  function serialize(html) {
    const tail = '</table><p></p>';
    return active && typeof html === 'string' && html.endsWith(tail) ? html.slice(0, html.length - '<p></p>'.length) : html;
  }

  // --- Document -------------------------------------------------------------------------------------------------------------------------------------------------
  function tableInfo(doc) {
    const first = doc.firstChild;
    return first && first.type.name === 'table' ? { node: first, pos: 0 } : null;
  }

  function isEmptyParagraph(node) { return node.type.name === 'paragraph' && node.content.size === 0; }

  // Un seul tableau en tête du document, éventuellement suivi du paragraphe vide que TipTap range sous un tableau final (TrailingNode de StarterKit : on ne
  // peut pas l'empêcher, on le cache - cf. css/grid.css - et la sélection n'y entre jamais), sans rien d'interdit dans les cases.
  function isValidGridDoc(doc) {
    const n = doc.childCount;
    if (n < 1 || n > 2) return false;
    if (doc.child(0).type.name !== 'table') return false;
    if (n === 2 && !isEmptyParagraph(doc.child(1))) return false;
    let ok = true;
    doc.child(0).descendants(node => {
      if (!ok) return false;
      const name = node.type.name;
      // Une image en calque (devant/derrière le texte) n'a pas de sens sur une case : posée sur la case, à sa taille, rien d'autre.
      if (FORBIDDEN_NODES.has(name) || (name === 'editorImage' && node.attrs.layer && node.attrs.layer !== 'normal')) { ok = false; return false; }
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

  // Largeur de chaque colonne de la grille, lue sur les `colwidth` des cases (la première largeur connue de la colonne gagne : toutes les lignes doivent s'y
  // accorder) ; DEFAULT_COL_WIDTH_PX quand aucune case ne la porte (colonne ajoutée par la barre de la case : ses cases naissent sans largeur).
  function columnWidths(tableNode) {
    const map = libs.TableMap.get(tableNode);
    const widths = new Array(map.width).fill(0);
    for (let row = 0; row < map.height; row++) {
      let col = 0;
      while (col < map.width) {
        const pos = map.map[row * map.width + col];
        const cell = tableNode.nodeAt(pos);
        const span = cell.attrs.colspan || 1;
        const known = cell.attrs.colwidth || [];
        for (let j = 0; j < span; j++) if (!widths[col + j] && known[j]) widths[col + j] = known[j];
        col += span;
      }
    }
    return widths.map(w => w || DEFAULT_COL_WIDTH_PX);
  }

  // Pose la largeur de chaque case qui n'en a pas (ou qui n'a pas celle de sa colonne) et la hauteur de chaque ligne qui n'en a pas, sur la transaction `tr` (ou
  // une neuve) ; null s'il n'y a rien à faire. Une ligne ajoutée par la barre de la case naît sans hauteur : elle prend celle de la ligne du dessus (du dessous pour
  // la première), comme dans un tableur.
  // Seule une case dont le type porte l'attribut peut le recevoir : sinon le « correctif » ne corrigerait jamais rien et appendTransaction tournerait sans fin.
  function hasCellAttr(cell, name) { return !!cell.type.spec.attrs && name in cell.type.spec.attrs; }
  // Une case neuve (ligne ou colonne ajoutée, collage) : aucun alignement vertical encore posé.
  function isFreshCell(cell) { return hasCellAttr(cell, 'verticalAlign') && !VALIGNS.has(cell.attrs.verticalAlign); }

  // Les bords de départ des cases neuves, et ce qu'il faut changer chez leurs voisines : une ligne ajoutée reprend les bords gauche et droit de la ligne voisine (du dessus, du dessous pour la
  // première), une colonne ajoutée les bords haut et bas de la colonne voisine (de gauche, de droite pour la première). Au milieu du tableau, le trait entre l'ancienne case et la nouvelle
  // est celui d'avant (js/table-borders.js : la valeur du voisin l'emporte sur le trait de départ de la case neuve). En bout de grille, le bord extérieur reste à l'extérieur, passe à la
  // case neuve - et le trait qui était extérieur devient un trait intérieur, comme celui d'à côté (sinon un cadre caché ou coloré se prolongerait entre l'ancienne case et la nouvelle).
  // Rend une Map position de case -> attributs à écrire.
  function borderSeeds(tableNode, map, fresh) {
    const seeds = new Map();
    if (!fresh.size) return seeds;
    const origin = new Map();
    for (let i = 0; i < map.map.length; i++) if (!origin.has(map.map[i])) origin.set(map.map[i], { row: Math.floor(i / map.width), col: i % map.width });
    const rowCells = Array.from({ length: map.height }, () => []);
    const colCells = Array.from({ length: map.width }, () => []);
    origin.forEach((where, pos) => { rowCells[where.row].push(pos); colCells[where.col].push(pos); });
    const allFresh = list => list.length > 0 && list.every(pos => fresh.has(pos));
    const rowFresh = rowCells.map(allFresh);
    const colFresh = colCells.map(allFresh);
    const nearest = (flags, from, step) => { for (let i = from + step; i >= 0 && i < flags.length; i += step) if (!flags[i]) return i; return -1; };
    const posAt = (row, col) => map.map[row * map.width + col];
    const attrsAt = (row, col) => tableNode.nodeAt(posAt(row, col)).attrs;
    const put = (pos, attrs) => seeds.set(pos, Object.assign(seeds.get(pos) || {}, attrs));
    fresh.forEach((pos) => {
      const { row, col } = origin.get(pos);
      if (rowFresh[row]) {
        const up = nearest(rowFresh, row, -1);
        const refRow = up >= 0 ? up : nearest(rowFresh, row, 1);
        if (refRow < 0) return;
        const ref = attrsAt(refRow, col);
        const seed = { borderLeft: ref.borderLeft || null, borderRight: ref.borderRight || null };
        if (up >= 0 && row === map.height - 1) {
          const inner = refRow >= 1 ? ref.borderTop || null : null;
          Object.assign(seed, { borderTop: inner, borderBottom: ref.borderBottom || null });
          put(posAt(refRow, col), { borderBottom: inner });
        } else if (up < 0 && row === 0) {
          const inner = refRow + 1 < map.height ? ref.borderBottom || null : null;
          Object.assign(seed, { borderTop: ref.borderTop || null, borderBottom: inner });
          put(posAt(refRow, col), { borderTop: inner });
        }
        put(pos, seed);
      } else if (colFresh[col]) {
        const left = nearest(colFresh, col, -1);
        const refCol = left >= 0 ? left : nearest(colFresh, col, 1);
        if (refCol < 0) return;
        const ref = attrsAt(row, refCol);
        const seed = { borderTop: ref.borderTop || null, borderBottom: ref.borderBottom || null };
        if (left >= 0 && col === map.width - 1) {
          const inner = refCol >= 1 ? ref.borderLeft || null : null;
          Object.assign(seed, { borderLeft: inner, borderRight: ref.borderRight || null });
          put(posAt(row, refCol), { borderRight: inner });
        } else if (left < 0 && col === 0) {
          const inner = refCol + 1 < map.width ? ref.borderRight || null : null;
          Object.assign(seed, { borderLeft: ref.borderLeft || null, borderRight: inner });
          put(posAt(row, refCol), { borderLeft: inner });
        }
        put(pos, seed);
      }
    });
    return seeds;
  }

  function fixDimensions(state, tr) {
    const info = tableInfo(tr ? tr.doc : state.doc);
    if (!info) return null;
    const widths = columnWidths(info.node);
    const map = libs.TableMap.get(info.node);
    const fresh = new Set();
    map.map.forEach((pos) => { if (!fresh.has(pos) && isFreshCell(info.node.nodeAt(pos))) fresh.add(pos); });
    const seeds = borderSeeds(info.node, map, fresh);
    let out = tr;
    let changed = false;
    const seen = new Set();
    for (let i = 0; i < map.map.length; i++) {
      const pos = map.map[i];
      if (seen.has(pos)) continue;
      seen.add(pos);
      const cell = info.node.nodeAt(pos);
      const col = i % map.width;
      const want = widths.slice(col, col + (cell.attrs.colspan || 1));
      const have = cell.attrs.colwidth;
      const widthOk = !!have && have.length === want.length && have.every((w, k) => w === want[k]);
      const alignOk = !fresh.has(pos);
      const seed = hasCellAttr(cell, BORDER_ATTRS.top) ? seeds.get(pos) : null;
      if (widthOk && alignOk && !seed) continue;
      if (!out) out = state.tr;
      out.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, cell.attrs, { colwidth: want }, alignOk ? {} : { verticalAlign: DEFAULT_VALIGN }, seed));
      changed = true;
    }
    const heights = [];
    info.node.forEach(row => heights.push(row.attrs.rowHeight || 0));
    info.node.forEach((row, offset, index) => {
      if (heights[index]) return;
      heights[index] = heights[index - 1] || heights.slice(index + 1).find(Boolean) || DEFAULT_ROW_HEIGHT_PX;
      if (!out) out = state.tr;
      out.setNodeMarkup(info.pos + 1 + offset, undefined, Object.assign({}, row.attrs, { rowHeight: heights[index] }));
      changed = true;
    });
    return changed ? out : null;
  }

  // --- Bordures : la description du tableau que lit js/table-borders.js, et ce qu'on écrit en retour ---------------------------------------------------------------------
  function borderSpec(tableNode) {
    const map = libs.TableMap.get(tableNode);
    const cells = [];
    const seen = new Set();
    for (let i = 0; i < map.map.length; i++) {
      const pos = map.map[i];
      if (seen.has(pos)) continue;
      seen.add(pos);
      const attrs = tableNode.nodeAt(pos).attrs;
      cells.push({
        pos, row: Math.floor(i / map.width), col: i % map.width, rowspan: attrs.rowspan || 1, colspan: attrs.colspan || 1,
        top: attrs.borderTop, right: attrs.borderRight, bottom: attrs.borderBottom, left: attrs.borderLeft,
      });
    }
    return { width: map.width, height: map.height, cells };
  }

  // Écrit sur chaque case les côtés calculés (`sides`, dans l'ordre de `spec.cells`) quand ils diffèrent de ce qu'elle porte ; null s'il n'y a rien à changer. Les positions ne bougent pas
  // (même taille de nœud) : plusieurs cases d'une même transaction ne se décalent pas.
  function writeBorders(state, tr, info, spec, sides) {
    let out = tr;
    let changed = false;
    spec.cells.forEach((cell, index) => {
      const node = info.node.nodeAt(cell.pos);
      if (!hasCellAttr(node, BORDER_ATTRS.top)) return;
      const next = {};
      let differs = false;
      TableBorders.SIDES.forEach((side) => {
        const attr = BORDER_ATTRS[side];
        if ((node.attrs[attr] || null) !== sides[index][side]) { next[attr] = sides[index][side]; differs = true; }
      });
      if (!differs) return;
      if (!out) out = state.tr;
      out.setNodeMarkup(info.pos + 1 + cell.pos, undefined, Object.assign({}, node.attrs, next));
      changed = true;
    });
    return changed ? out : null;
  }

  // Met d'accord les cases qui se partagent un trait (fusion, ligne ou colonne supprimée, collage) : « pas de trait » l'emporte, puis la première couleur, sinon le trait de départ.
  // Rien à faire - et aucune transaction - quand tout s'accorde déjà.
  function fixBorders(state, tr) {
    const info = tableInfo(tr ? tr.doc : state.doc);
    if (!info) return null;
    const spec = borderSpec(info.node);
    return writeBorders(state, tr, info, spec, TableBorders.resolve(spec)) || null;
  }

  // Retire le saut de page que rien ne peut suivre : avant la première ligne (une page vide) ou au milieu d'une case fusionnée sur plusieurs lignes. L'éditeur n'en pose pas de tel, mais
  // la première ligne peut le devenir (la ligne du dessus a été supprimée) et un HTML collé ou chargé peut en porter. Rien à faire - et aucune transaction - sinon.
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

  // Le document est déjà « une grille » ? Sinon (modèle vide, contenu abîmé) on garde le premier tableau trouvé s'il est valable, sinon la grille de départ.
  // Hors historique et sans signal « modifié » : ouvrir un modèle n'est pas une modification de la personne.
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
    const fixed = fixDimensions(state, tr);
    if (fixed) tr = fixed;
    const bordered = fixBorders(state, tr);
    if (bordered) tr = bordered;
    const broken = fixPageBreaks(state, tr);
    if (broken) tr = broken;
    if (tr) view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
    selectFirstCell();
  }

  // --- Sélection -----------------------------------------------------------------------------------------------------------------------------------------------
  function isCellSelection(sel) { return !!(sel && sel.$anchorCell); }

  function selectionInsideTable(sel) {
    if (isCellSelection(sel)) return true;
    // Profondeur 0 : curseur « gap » avant/après le tableau, tout le document (Ctrl+A), le tableau lui-même (NodeSelection).
    if (sel.$from.depth < 1 || sel.$to.depth < 1) return false;
    return sel.$from.node(1).type.name === 'table' && sel.$to.node(1).type.name === 'table';
  }

  function firstAndLastCell(doc) {
    const info = tableInfo(doc);
    if (!info) return null;
    const map = libs.TableMap.get(info.node);
    return { first: info.pos + 1 + map.map[0], last: info.pos + 1 + map.map[map.map.length - 1], info, map };
  }

  function allCellsSelection(doc) {
    const ends = firstAndLastCell(doc);
    return ends ? libs.CellSelection.create(doc, ends.first, ends.last) : null;
  }

  // Où remettre une sélection qui sort du tableau : tout le document ou le tableau entier -> toutes les cases ; après le tableau -> la fin de la dernière case ;
  // avant -> le début de la première.
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

  function selectAllCells(ed) {
    const ends = firstAndLastCell(ed.state.doc);
    return !!ends && ed.commands.setCellSelection({ anchorCell: ends.first, headCell: ends.last });
  }

  // Suppr/Retour arrière sur des cases sélectionnées : vide leur contenu (comme dans un tableur) au lieu de la commande « supprimer le tableau » de TipTap quand
  // toutes sont sélectionnées - que le garde-fou refuserait en silence, et la touche semblerait ne rien faire.
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

  // La case qui porte la sélection (la tête d'une sélection de cases) : ancre de la barre flottante de la case et décoration « case courante ».
  function currentCellPos(state) {
    const sel = state.selection;
    if (isCellSelection(sel)) return sel.$headCell.pos;
    const $head = sel.$head;
    for (let d = $head.depth; d > 0; d--) {
      if (CELL_NODES.has($head.node(d).type.name)) return $head.before(d);
    }
    return null;
  }
  function currentCellDom() {
    if (!editor) return null;
    const pos = currentCellPos(editor.state);
    return pos == null ? null : editor.view.nodeDOM(pos);
  }

  // --- Barre de la case : fusion, alignement vertical ------------------------------------------------------------------------------------------------------------
  // Les cases que la barre vise : toutes celles d'une sélection de cases, sinon la case du curseur.
  function selectedCells(state) {
    const sel = state.selection;
    const out = [];
    if (isCellSelection(sel)) { sel.forEachCell((node, pos) => out.push({ node, pos })); return out; }
    const pos = currentCellPos(state);
    if (pos != null) out.push({ node: state.doc.nodeAt(pos), pos });
    return out;
  }

  // 'top', 'middle' ou 'bottom' quand toutes les cases visées s'accordent, null quand la sélection est mêlée (aucun bouton n'est alors enfoncé).
  function selectedVerticalAlign(ed) {
    if (!active) return null;
    const values = new Set(selectedCells(ed.state).map(({ node }) => (VALIGNS.has(node.attrs.verticalAlign) ? node.attrs.verticalAlign : DEFAULT_VALIGN)));
    return values.size === 1 ? Array.from(values)[0] : null;
  }

  // Une seule transaction pour toutes les cases visées : un seul Annuler.
  function setVerticalAlign(ed, value) {
    if (!active || !VALIGNS.has(value)) return false;
    const tr = ed.state.tr;
    selectedCells(ed.state).forEach(({ node, pos }) => {
      if (node.attrs.verticalAlign !== value) tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { verticalAlign: value }));
    });
    if (tr.docChanged) ed.view.dispatch(tr);
    return true;
  }

  // Fusionner n'a de sens que pour des cases d'une même page : une case ne s'étend jamais de part et d'autre d'un saut de page (le PDF et l'Excel la couperaient en deux).
  function canMerge(ed) {
    if (!active || !ed.can().mergeCells()) return false;
    const info = tableInfo(ed.state.doc);
    const rect = info && selectionRect(ed.state, info);
    for (let row = rect ? rect.top + 1 : 0; rect && row < rect.bottom; row++) if (info.node.child(row).attrs.pageBreakBefore) return false;
    return true;
  }
  function canSplit(ed) { return active && ed.can().splitCell(); }

  // Le rectangle (emplacements de la grille, `right` et `bottom` exclus) que couvrent les cases visées : toujours un rectangle, une sélection de cases n'en connaît pas d'autre.
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

  // Fusionne les cases sélectionnées en une seule : le texte des autres s'ajoute à la suite du sien (rien n'est perdu, Annuler rend tout), le fond et l'alignement sont ceux de la
  // première. prosemirror-tables ne laisse à la case fusionnée que la largeur de sa première colonne (0 pour les autres) : on lui rend, dans la même transaction, celle de chaque
  // colonne qu'elle couvre - sans cela, fusionner toutes les lignes de deux colonnes remettait la seconde à la largeur par défaut (fixDimensions ne la retrouvait dans aucune autre case).
  // Ses bords sont ceux du POURTOUR des cases fusionnées (pas ceux de la première, dont le côté droit était un trait intérieur) ; les traits de l'intérieur disparaissent.
  function mergeCells(ed) {
    if (!canMerge(ed)) return false;
    const before = tableInfo(ed.state.doc);
    const widths = columnWidths(before.node);
    const spec = borderSpec(before.node);
    const rect = selectionRect(ed.state, before);
    const borders = {};
    TableBorders.SIDES.forEach((side) => { borders[BORDER_ATTRS[side]] = TableBorders.combineAll(TableBorders.valuesOf(spec, TableBorders.presetEdges(side, rect))); });
    return ed.chain().focus().mergeCells().command(({ tr }) => {
      const merged = tr.selection.$anchorCell ? tr.selection.$anchorCell.pos : null;
      const info = tableInfo(tr.doc);
      if (merged == null || !info) return true;
      const cell = tr.doc.nodeAt(merged);
      const left = libs.TableMap.get(info.node).colCount(merged - (info.pos + 1));
      tr.setNodeMarkup(merged, undefined, Object.assign({}, cell.attrs, { colwidth: widths.slice(left, left + (cell.attrs.colspan || 1)) }, hasCellAttr(cell, BORDER_ATTRS.top) ? borders : null));
      return true;
    }).run();
  }

  // Scinde la case fusionnée en autant de cases qu'elle en recouvrait : la première garde le contenu, les autres naissent vides, avec le fond, l'alignement et la largeur de leur colonne.
  // Les bords du pourtour restent aux cases du pourtour ; les traits entre les nouvelles cases sont ceux de départ.
  function splitCell(ed) {
    if (!canSplit(ed)) return false;
    const before = tableInfo(ed.state.doc);
    const rect = selectionRect(ed.state, before);
    const attrs = selectedCells(ed.state)[0].node.attrs;
    return ed.chain().focus().splitCell().command(({ tr }) => {
      const info = tableInfo(tr.doc);
      if (!info || !rect) return true;
      const map = libs.TableMap.get(info.node);
      for (let r = rect.top; r < rect.bottom; r++) {
        for (let c = rect.left; c < rect.right; c++) {
          const pos = map.map[r * map.width + c];
          const piece = info.node.nodeAt(pos);
          if (!hasCellAttr(piece, BORDER_ATTRS.top)) continue;
          tr.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, piece.attrs, {
            borderTop: r === rect.top ? attrs.borderTop || null : null,
            borderBottom: r === rect.bottom - 1 ? attrs.borderBottom || null : null,
            borderLeft: c === rect.left ? attrs.borderLeft || null : null,
            borderRight: c === rect.right - 1 ? attrs.borderRight || null : null,
          }));
        }
      }
      return true;
    }).run();
  }

  // Les traits que visent les cases sélectionnées, selon le réglage du menu « Bordures » : tout (« all »), le pourtour (« outer »), l'intérieur (« inner »), un côté, ou plus aucun trait (« none »).
  // `color` : la couleur du stylo, null = le trait de départ. Une seule transaction pour toutes les cases touchées : un seul Annuler.
  function applyBorders(ed, preset, color) {
    if (!active || !TableBorders.PRESETS.includes(preset)) return false;
    const info = tableInfo(ed.state.doc);
    const rect = info && selectionRect(ed.state, info);
    if (!rect) return false;
    const spec = borderSpec(info.node);
    const edges = TableBorders.usableEdges(spec, TableBorders.presetEdges(preset, rect));
    if (!edges.length) return false;
    const tr = writeBorders(ed.state, null, info, spec, TableBorders.set(spec, edges, TableBorders.valueFor(preset, color)));
    if (tr) ed.view.dispatch(tr);
    return true;
  }

  // Le réglage a-t-il un trait à poser ? « Intérieurs » n'en a pas pour une seule case (ni pour l'intérieur d'une case fusionnée) : le bouton se grise.
  function canApplyBorders(ed, preset) {
    if (!active || !TableBorders.PRESETS.includes(preset)) return false;
    const info = tableInfo(ed.state.doc);
    const rect = info && selectionRect(ed.state, info);
    return !!rect && TableBorders.usableEdges(borderSpec(info.node), TableBorders.presetEdges(preset, rect)).length > 0;
  }

  // --- Saut de page : porté par une ligne -----------------------------------------------------------------------------------------------------------------------------
  // Une case couvre-t-elle la limite entre la ligne `row - 1` et la ligne `row` ? (la même case dans les deux, dans l'une des colonnes)
  function boundaryCrossed(map, row) {
    for (let col = 0; col < map.width; col++) if (map.map[(row - 1) * map.width + col] === map.map[row * map.width + col]) return true;
    return false;
  }

  // La ligne que le bouton vise : la première de la sélection (le saut se pose AVANT elle).
  function pageBreakRow(state) {
    const info = tableInfo(state.doc);
    const rect = info && selectionRect(state, info);
    return rect ? { info, map: libs.TableMap.get(info.node), row: rect.top } : null;
  }

  // Pas avant la première ligne (une page vide), pas au milieu d'une case fusionnée sur plusieurs lignes (aucune case n'est coupée en deux) : le bouton se grise.
  function canTogglePageBreak(ed) {
    if (!active) return false;
    const target = pageBreakRow(ed.state);
    return !!target && target.row > 0 && !boundaryCrossed(target.map, target.row);
  }

  // La ligne visée porte-t-elle un saut ? (le bouton est alors enfoncé : un second clic le retire)
  function hasPageBreak(ed) {
    if (!active) return false;
    const target = pageBreakRow(ed.state);
    return !!target && !!target.info.node.child(target.row).attrs.pageBreakBefore;
  }

  // Pose le saut avant la ligne visée, ou le retire s'il y est déjà : une transaction, un Annuler.
  function togglePageBreak(ed) {
    if (!canTogglePageBreak(ed)) return false;
    const { info, row } = pageBreakRow(ed.state);
    let pos = info.pos + 1;
    for (let i = 0; i < row; i++) pos += info.node.child(i).nodeSize;
    const node = info.node.child(row);
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { pageBreakBefore: !node.attrs.pageBreakBefore })));
    return true;
  }

  // Les lignes qui portent un saut, par rang : ce que montrent les bandeaux.
  function pageBreakRows() {
    const info = editor && tableInfo(editor.state.doc);
    const rows = [];
    if (info) info.node.forEach(row => rows.push(!!row.attrs.pageBreakBefore));
    return rows;
  }

  // --- Collage ----------------------------------------------------------------------------------------------------------------------------------------------------
  // Un texte copié finit presque toujours par un retour à la ligne (une ligne de Grist, d'un mail ou d'un autre tableur, un paragraphe sélectionné jusqu'à sa fin) :
  // ProseMirror en fait un dernier paragraphe vide qui reste sous le texte collé (Antoine, 02/10 : « quand on colle une variable en mode grille ça rajoute 1 à 2 lignes en
  // dessous non souhaitées »). Dans une case ces lignes vides ne servent à rien : elles agrandissent la ligne et ouvrent des lignes dans l'Excel. Elles ne sont pas collées ;
  // les lignes vides du MILIEU d'un texte restent, et un tableau copié (ses lignes, ses cases) est laissé tel quel - c'est prosemirror-tables qui le place.
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

  // --- Entrée : la case du dessous --------------------------------------------------------------------------------------------------------------------------------
  // Comme dans Excel et Google Sheets (Antoine, 02/10) : Entrée descend d'une case et la sélectionne (on tape par-dessus, comme avec Tab) ; Maj+Entrée et Ctrl+Entrée ajoutent une
  // ligne DANS la case (le retour à la ligne forcé de TipTap, que ces deux touches faisaient déjà). Sur la dernière ligne la touche est prise sans rien faire : pas de ligne de
  // tableau ajoutée en passant, pas de paragraphe vide. Dans une liste (puces, numéros, tâches) Entrée garde son sens de liste, sinon on n'y ajouterait jamais un point.
  const LIST_ITEMS = new Set(['listItem', 'taskItem']);

  function inListItem(sel) {
    if (isCellSelection(sel)) return false;
    for (let d = sel.$head.depth; d > 0; d--) if (LIST_ITEMS.has(sel.$head.node(d).type.name)) return true;
    return false;
  }

  // La case « active » : celle du curseur ; pour des cases choisies, celle d'où la sélection est partie (comme Excel : Entrée se range alors sous elle).
  function activeCellPos(sel) {
    if (isCellSelection(sel)) return sel.$anchorCell.pos;
    for (let d = sel.$head.depth; d > 0; d--) if (CELL_NODES.has(sel.$head.node(d).type.name)) return sel.$head.before(d);
    return null;
  }

  // La case sous la case active, dans sa colonne de gauche ; sous une case fusionnée sur plusieurs lignes, la case qui suit sa dernière ligne. Null sur la dernière ligne.
  function cellBelowPos(info, cellPos) {
    const map = libs.TableMap.get(info.node);
    const rect = map.findCell(cellPos - (info.pos + 1));
    return rect.bottom < map.height ? info.pos + 1 + map.map[rect.bottom * map.width + rect.left] : null;
  }

  // Montre TOUTE la case d'arrivée. ProseMirror ne regarde que la ligne du curseur et ne connaît pas les bandeaux collés (colonnes en haut, lignes à gauche) : une case remontée au
  // bord du panneau (curseur resté hors de vue, puis Entrée) arrivait cachée dessous. Une case plus haute (ou plus large) que le panneau garde son bord haut (gauche) visible.
  function revealCell(view, cellPos) {
    const cell = view.nodeDOM(cellPos);
    const scroller = view.dom.closest('.v2-grid-mode');
    if (!cell || !cell.getBoundingClientRect || !scroller) return;
    const cols = scroller.querySelector('.v2-grid-cols');
    const rows = scroller.querySelector('.v2-grid-rows');
    const box = scroller.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    const top = box.top + (cols ? cols.offsetHeight : 0);
    const left = box.left + (rows ? rows.offsetWidth : 0);
    const bottom = box.top + scroller.clientHeight;
    const right = box.left + scroller.clientWidth;
    if (r.top < top) scroller.scrollTop -= top - r.top;
    else if (r.bottom > bottom) scroller.scrollTop += Math.min(r.bottom - bottom, r.top - top);
    if (r.left < left) scroller.scrollLeft -= left - r.left;
    else if (r.right > right) scroller.scrollLeft += Math.min(r.right - right, r.left - left);
  }

  function enterGoesDown(ed) {
    if (!active || !ed.isEditable || ed.view.composing) return false;
    const { state, view } = ed;
    const sel = state.selection;
    const info = tableInfo(state.doc);
    if (!info || !selectionInsideTable(sel) || inListItem(sel)) return false;
    const here = activeCellPos(sel);
    if (here == null) return false;
    const below = cellBelowPos(info, here);
    if (below == null) return true;
    const $below = state.doc.resolve(below);
    view.dispatch(state.tr.setSelection(libs.TextSelection.between($below, state.doc.resolve(below + $below.nodeAfter.nodeSize))).scrollIntoView());
    revealCell(view, below);
    return true;
  }

  // Une extension à part, de priorité normale, et rangée dans js/editor.js APRÈS StarterKit (sa liste à puces, ses touches de base) et AVANT Variables et TextExpansion : TipTap
  // essaie les extensions de la dernière rangée à la première, donc la liste `#` (ou celle des expansions) ouverte garde son Entrée (choisir une ligne) et ne cède la touche
  // qu'à la case du dessous quand elle n'en veut pas, alors que celle d'un calcul (priorité 1000) passe toujours devant. Hors grille la fonction rend faux : Entrée coupe le paragraphe.
  function createEnterExtension(Extension) {
    return Extension.create({
      name: 'gridEnter',
      addKeyboardShortcuts() {
        return { Enter: ({ editor: ed }) => enterGoesDown(ed) };
      },
    });
  }

  // --- Extension TipTap : garde-fou, sélection, touches ----------------------------------------------------------------------------------------------------------
  function createExtension(Extension) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    return Extension.create({
      name: 'gridEditor',
      // Avant les raccourcis de Tableau (Retour arrière / Suppr sur toutes les cases = supprimer le tableau) et de TipTap (Ctrl+A = tout le document).
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
            if (!active) return null;
            let tr = null;
            if (trs.some(t => t.docChanged)) {
              tr = fixDimensions(newState, null);
              const bordered = fixBorders(newState, tr);
              if (bordered) tr = bordered;
              const broken = fixPageBreaks(newState, tr);
              if (broken) tr = broken;
            }
            const sel = tr ? tr.selection : newState.selection;
            if (!selectionInsideTable(sel)) {
              const back = selectionBackInside(tr ? tr.doc : newState.doc, sel);
              if (back) { if (!tr) tr = newState.tr; tr.setSelection(back); }
            }
            return tr;
          },
          props: {
            // Un tableau de tableur (Excel, Sheets, LibreOffice) est réécrit pour la grille avant que ProseMirror le lise : fusions, fond, texte, alignements, traits (js/grid-table.js).
            transformPastedHTML(html) { return active ? GridTable.cleanPastedHtml(html) : html; },
            transformPasted(slice) { return active ? trimPastedSlice(slice) : slice; },
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

  // --- Largeur de colonne, hauteur de ligne (une transaction chacune) -------------------------------------------------------------------------------------------
  // Même parcours que `updateColumnWidth` de prosemirror-tables (poignée du bord d'une case) : toutes les cases de la colonne reçoivent la largeur, une case
  // fusionnée sur plusieurs colonnes ne change que SA part de `colwidth`.
  function setColumnWidth(colIndex, width) {
    const { state, view } = editor;
    const info = tableInfo(state.doc);
    if (!info) return;
    const map = libs.TableMap.get(info.node);
    const tr = state.tr;
    for (let row = 0; row < map.height; row++) {
      const index = row * map.width + colIndex;
      if (row && map.map[index] === map.map[index - map.width]) continue;
      const pos = map.map[index];
      const cell = info.node.nodeAt(pos);
      const attrs = cell.attrs;
      const spanIndex = (attrs.colspan || 1) === 1 ? 0 : colIndex - map.colCount(pos);
      if (attrs.colwidth && attrs.colwidth[spanIndex] === width) continue;
      const colwidth = attrs.colwidth ? attrs.colwidth.slice() : new Array(attrs.colspan || 1).fill(0);
      colwidth[spanIndex] = width;
      tr.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, attrs, { colwidth }));
    }
    if (tr.docChanged) view.dispatch(tr);
  }

  function setRowHeight(rowIndex, height) {
    const { state, view } = editor;
    const info = tableInfo(state.doc);
    if (!info || rowIndex >= info.node.childCount) return;
    let pos = info.pos + 1;
    for (let i = 0; i < rowIndex; i++) pos += info.node.child(i).nodeSize;
    const row = info.node.child(rowIndex);
    if (row.attrs.rowHeight === height) return;
    view.dispatch(state.tr.setNodeMarkup(pos, undefined, Object.assign({}, row.attrs, { rowHeight: height })));
  }

  // --- Bandeaux A, B, C / 1, 2, 3 ---------------------------------------------------------------------------------------------------------------------------------
  function colName(index) {
    let name = '';
    let n = index;
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return name;
  }

  function tableDom() { return editor && editor.view.dom.querySelector(':scope > .tableWrapper > table'); }

  // Taille réelle de chaque colonne et de chaque ligne, lue sur le rendu (une ligne que son texte agrandit n'a pas la hauteur de son attribut). null quand
  // l'éditeur est masqué (Lecture, macro-modèle) : rien à mesurer, les bandeaux gardent leur dernier état.
  function measure() {
    const table = tableDom();
    if (!table) return null;
    const rect = table.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));
    return { table, width: rect.width, height: rect.height, cols, rows, widths: cols.map(c => c.getBoundingClientRect().width), heights: rows.map(r => r.getBoundingClientRect().height) };
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function buildStrips() {
    const sheet = editor.view.dom.parentElement;
    if (!sheet || strips) return;
    const corner = el('div', 'v2-grid-corner');
    const cols = el('div', 'v2-grid-cols');
    const rows = el('div', 'v2-grid-rows');
    [corner, cols, rows].forEach(node => node.setAttribute('aria-hidden', 'true'));
    sheet.insertBefore(rows, sheet.firstChild);
    sheet.insertBefore(cols, sheet.firstChild);
    sheet.insertBefore(corner, sheet.firstChild);
    strips = { corner, cols, rows };
    // mousedown ET pointerdown : le focus reste dans la grille (ni sélection de texte, ni perte du curseur) pendant qu'on clique un bandeau.
    [corner, cols, rows].forEach(node => node.addEventListener('mousedown', event => event.preventDefault()));
    corner.addEventListener('pointerdown', onCornerDown);
    cols.addEventListener('pointerdown', event => onStripDown('col', event));
    rows.addEventListener('pointerdown', event => onStripDown('row', event));
    refreshLabels();
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => scheduleSync());
      const table = tableDom();
      if (table) resizeObserver.observe(table);
    }
  }

  function destroyStrips() {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (syncFrame) { cancelAnimationFrame(syncFrame); syncFrame = 0; }
    if (strips) { [strips.corner, strips.cols, strips.rows].forEach(node => node.remove()); strips = null; }
    const preview = document.getElementById('pp-grid-resize-preview');
    if (preview) preview.remove();
    lastKey = '';
    hideTip();
  }

  function refreshLabels() {
    if (!strips) return;
    strips.corner.title = I18n.t('grid.selectAll');
    strips.cols.querySelectorAll('.v2-grid-handle').forEach(h => { h.title = I18n.t('grid.resizeColumn'); });
    strips.rows.querySelectorAll('.v2-grid-handle').forEach(h => { h.title = I18n.t('grid.resizeRow'); });
    strips.rows.querySelectorAll('.v2-grid-rowhead.has-break').forEach(h => { h.title = I18n.t('grid.pageBreak'); });
  }

  function scheduleSync() {
    if (!active || !strips || syncFrame) return;
    syncFrame = requestAnimationFrame(() => { syncFrame = 0; syncStrips(); });
  }

  function fillHeads(container, count, className, build) {
    while (container.children.length > count) container.lastChild.remove();
    while (container.children.length < count) container.appendChild(build(className));
  }

  function buildHead(className) {
    const head = el('div', className);
    head.appendChild(el('span', 'v2-grid-label'));
    const handle = el('span', 'v2-grid-handle');
    handle.title = I18n.t(className === 'v2-grid-colhead' ? 'grid.resizeColumn' : 'grid.resizeRow');
    head.appendChild(handle);
    return head;
  }

  // Le numéro d'une ligne qui porte un saut de page : une pastille à cheval sur son bord haut (le trait en tirets sur la ligne, c'est css/grid.css), et l'info-bulle du saut. La pastille ne répond pas au
  // pointeur : la poignée qui règle la ligne du dessus, juste dessous, reste atteignable.
  function markPageBreak(head, on) {
    head.classList.toggle('has-break', on);
    let badge = head.querySelector(':scope > .v2-grid-break');
    if (!on) { if (badge) badge.remove(); head.removeAttribute('title'); return; }
    if (!badge) { badge = el('span', 'v2-grid-break'); badge.innerHTML = Icons.svg('gridBreak'); head.appendChild(badge); }
    head.title = I18n.t('grid.pageBreak');
  }

  function syncStrips(force) {
    if (!active || !strips || !editor) return;
    const m = measure();
    if (!m) return;
    const table = m.table;
    if (resizeObserver && !table.__gridObserved) { resizeObserver.disconnect(); resizeObserver.observe(table); table.__gridObserved = true; }
    const breaks = pageBreakRows();
    const key = m.widths.map(w => w.toFixed(2)).join(',') + '|' + m.heights.map(h => h.toFixed(2)).join(',') + '|' + breaks.map(on => (on ? 1 : 0)).join('');
    if (force || key !== lastKey) {
      lastKey = key;
      fillHeads(strips.cols, m.widths.length, 'v2-grid-colhead', buildHead);
      fillHeads(strips.rows, m.heights.length, 'v2-grid-rowhead', buildHead);
      m.widths.forEach((w, i) => {
        const head = strips.cols.children[i];
        head.style.width = w + 'px';
        head.firstChild.textContent = colName(i);
        head.dataset.index = String(i);
      });
      m.heights.forEach((h, i) => {
        const head = strips.rows.children[i];
        head.style.height = h + 'px';
        head.firstChild.textContent = String(i + 1);
        head.dataset.index = String(i);
        markPageBreak(head, !!breaks[i]);
      });
      refreshLabels();
    }
    highlightSelection();
  }

  // Les bandeaux des colonnes et des lignes touchées par la sélection s'allument (comme dans un tableur).
  function highlightSelection() {
    if (!strips || !editor) return;
    const sel = editor.state.selection;
    const info = tableInfo(editor.state.doc);
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
    Array.prototype.forEach.call(strips.cols.children, (head, i) => head.classList.toggle('sel', i >= colFrom && i <= colTo));
    Array.prototype.forEach.call(strips.rows.children, (head, i) => head.classList.toggle('sel', i >= rowFrom && i <= rowTo));
  }

  // --- Clic sur un bandeau : sélectionne toute la colonne / la ligne ------------------------------------------------------------------------------------------------
  function onCornerDown(event) {
    if (event.button !== 0 || !editor) return;
    event.preventDefault();
    selectAllCells(editor);
    editor.view.focus();
  }

  function selectLine(kind, index, extend) {
    const info = tableInfo(editor.state.doc);
    if (!info) return;
    const map = libs.TableMap.get(info.node);
    const start = info.pos + 1;
    const cellAt = (row, col) => start + map.map[row * map.width + col];
    const sel = editor.state.selection;
    let anchorIndex = index;
    if (extend) {
      const cell = isCellSelection(sel) ? sel.$anchorCell.pos : currentCellPos(editor.state);
      if (cell != null) { const rect = map.findCell(cell - start); anchorIndex = kind === 'col' ? rect.left : rect.top; }
    }
    const anchorCell = kind === 'col' ? cellAt(0, anchorIndex) : cellAt(anchorIndex, 0);
    const headCell = kind === 'col' ? cellAt(map.height - 1, index) : cellAt(index, map.width - 1);
    editor.commands.setCellSelection({ anchorCell, headCell });
    editor.view.focus();
  }

  function onStripDown(kind, event) {
    if (event.button !== 0 || !editor) return;
    const head = event.target.closest(kind === 'col' ? '.v2-grid-colhead' : '.v2-grid-rowhead');
    if (!head) return;
    event.preventDefault();
    const index = parseInt(head.dataset.index, 10);
    if (event.target.closest('.v2-grid-handle')) startResize(kind, index, event);
    else selectLine(kind, index, event.shiftKey);
  }

  // --- Tirer un trait : aperçu en direct, une transaction au relâcher ------------------------------------------------------------------------------------------------
  function showTip(text, event) {
    if (!tip) { tip = el('div', 'v2-grid-tip'); tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.textContent = text;
    tip.style.left = Math.min(event.clientX + 14, window.innerWidth - 70) + 'px';
    tip.style.top = Math.min(event.clientY + 14, window.innerHeight - 30) + 'px';
  }
  function hideTip() { if (tip) { tip.remove(); tip = null; } }

  // Hauteur d'une ligne réduite à son contenu : le plancher du glissé (« une ligne ne descend pas sous la hauteur de son texte »). Mesurée par une feuille de style
  // d'un instant, pas en changeant le style de la ligne : ProseMirror verrait la ligne modifiée et la redessinerait.
  function naturalRowHeight(tr, index) {
    const probe = document.createElement('style');
    probe.textContent = `.tiptap table > tbody > tr:nth-child(${index + 1}) { height: 0 !important; }`;
    document.head.appendChild(probe);
    const height = tr.getBoundingClientRect().height;
    probe.remove();
    return Math.ceil(height);
  }

  function startResize(kind, index, event) {
    const m = measure();
    if (!m) return;
    const isCol = kind === 'col';
    const target = event.target;
    const head = (isCol ? strips.cols : strips.rows).children[index];
    const start = isCol ? event.clientX : event.clientY;
    const startSize = isCol ? m.widths[index] : m.heights[index];
    const startTableSize = isCol ? m.width : m.height;
    const min = isCol ? MIN_COL_WIDTH_PX : naturalRowHeight(m.rows[index], index);
    const max = isCol ? MAX_COL_WIDTH_PX : MAX_ROW_HEIGHT_PX;
    let size = Math.max(min, Math.round(startSize));
    try { target.setPointerCapture(event.pointerId); } catch (e) { /* capture indisponible : les écouteurs du document suffisent */ }
    document.body.classList.add(isCol ? 'pp-grid-resizing-col' : 'pp-grid-resizing-row');
    showTip(size + ' px', event);

    // Aperçu par une feuille de style posée dans <head>, jamais par un style en ligne sur le tableau : ProseMirror lit un attribut modifié sur une ligne (<tr>) comme un
    // changement du document à relire et redessine la ligne - l'aperçu d'une hauteur s'effaçait aussitôt, à la vraie souris. Il ne voit rien d'une feuille de style, et
    // le rendu d'avant n'a jamais été touché : annuler = retirer la feuille.
    const preview = document.createElement('style');
    preview.id = 'pp-grid-resize-preview';
    document.head.appendChild(preview);
    const apply = value => {
      preview.textContent = isCol
        ? `.tiptap table > colgroup > col:nth-child(${index + 1}) { width: ${value}px !important; } .tiptap table { width: ${startTableSize + value - startSize}px !important; }`
        : `.tiptap table > tbody > tr:nth-child(${index + 1}) { height: ${value}px !important; }`;
      head.style[isCol ? 'width' : 'height'] = value + 'px';
    };
    apply(size);
    const onMove = e => {
      size = Math.min(max, Math.max(min, Math.round(startSize + (isCol ? e.clientX : e.clientY) - start)));
      apply(size);
      showTip(size + ' px', e);
    };
    const finish = commit => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      try { target.releasePointerCapture(event.pointerId); } catch (e) { /* déjà relâché */ }
      document.body.classList.remove('pp-grid-resizing-col', 'pp-grid-resizing-row');
      hideTip();
      // L'enregistrement redessine le tableau à sa nouvelle taille (synchrone) AVANT que l'aperçu ne soit retiré : pas de saut.
      if (commit && size !== Math.round(startSize)) { if (isCol) setColumnWidth(index, size); else setRowHeight(index, size); }
      else head.style[isCol ? 'width' : 'height'] = startSize + 'px';
      preview.remove();
      lastKey = '';
      scheduleSync();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);
  }

  // La bande où la barre de la case est fixée (index.html : #v2-cell-bar-dock, css/grid.css), entre la barre d'outils et le plan de travail : dans une grille cette barre ne flotte
  // plus sur la case courante. Posée sur une case (au-dessus ou en dessous), elle recouvrait les cases voisines : un appui dessus tombait sur ses boutons, et ni un clic ni un
  // glissé ne pouvait plus les atteindre (vu à la vraie souris à 700x400, demande d'Antoine : sélectionner plusieurs cases en glissant).
  function barSlot() { return document.getElementById('v2-cell-bar-dock'); }

  // Barres flottantes d'image et de bulle : elles ne recouvrent jamais les bandeaux. Posée au-dessus de la première ligne, une barre cachait les lettres - ni clic
  // sur une lettre, ni poignée à tirer tant que le curseur était dans la première ligne (vu à la vraie souris à 700x400). floating-ui la garde dans le plan de travail,
  // hors des deux bandeaux : elle passe sous la case quand il n'y a pas la place au-dessus, et reste à droite du bandeau des numéros. Fonction relue à chaque calcul.
  function floatingOptions() {
    if (!active || !strips) return undefined;
    const box = document.getElementById('editor-container');
    const corner = strips.corner.getBoundingClientRect();
    const top = corner.height + 4;
    return { flip: { boundary: box, padding: { top } }, shift: { boundary: box, padding: { top, left: corner.width + 8, right: 8, bottom: 8 } } };
  }

  // --- Activation ---------------------------------------------------------------------------------------------------------------------------------------------------
  // Les boutons grisés d'une grille ne se déclenchent pas non plus au clavier (Tab puis Entrée) : un clic sur un bouton grisé de la barre est arrêté en capture,
  // comme js/main.js:wireAccessLockGuard le fait pour les droits. `v2-hf-locked` n'est jamais posé ailleurs qu'ici pendant une grille (ni en-tête, ni email).
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
    ed.on('transaction', ({ transaction }) => { if (active && (transaction.docChanged || transaction.selectionSet)) scheduleSync(); });
    wireLockedClickGuard();
    I18n.onChange(refreshLabels);
    if (active) setActive(true, true);
  }

  // Entre dans / sort du mode grille. Appelé par js/main.js à chaque chargement de modèle : faux AVANT Editor.setHTML (le garde-fou ne doit pas refuser le
  // contenu qu'on charge), puis vrai pour une grille (le document est alors ramené à une grille valable, les bandeaux se posent).
  function setActive(on, force) {
    on = !!on;
    if (on === active && !force) { if (on) scheduleSync(); return; }
    active = on;
    const container = document.getElementById('editor-container');
    if (container) container.classList.toggle('v2-grid-mode', on);
    document.body.classList.toggle('pp-grid-mode', on);
    const a4Toggle = document.getElementById('v2-toggle-a4-preview');
    if (a4Toggle) a4Toggle.disabled = on;
    if (!editor) return;
    if (on) {
      // Une grille s'ouvre en haut à gauche : le plan de travail est le même que celui du modèle précédent et en gardait le défilement (une nouvelle grille apparaissait
      // descendue jusqu'à la ligne 12, ses bandeaux et sa première ligne hors de vue).
      if (container) { container.scrollTop = 0; container.scrollLeft = 0; }
      // Pas de suivi des modifications dans une grille : il ne suit ni les lignes, ni les colonnes, ni les fusions (bouton grisé) - et un suivi resté allumé
      // d'un document précédent transformerait chaque frappe en suggestion.
      if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
      normalizeDocument();
      buildStrips();
      scheduleSync();
    } else {
      destroyStrips();
    }
  }

  // Rafraîchit les bandeaux quand l'éditeur redevient visible (Lecture -> Édition) : js/editor.js:refreshLayout.
  function refresh() { if (active) { lastKey = ''; scheduleSync(); } }

  return {
    TYPE, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_COL_WIDTH_PX, DEFAULT_ROW_HEIGHT_PX, MIN_COL_WIDTH_PX, DEFAULT_VALIGN,
    configure, attach, createExtension, createEnterExtension, withRowAttributes, withCellAttributes, serialize, setActive, isActive, isGridType, refresh,
    currentCellDom, columnWidths, colName, floatingOptions, barSlot,
    canMerge, canSplit, mergeCells, splitCell, setVerticalAlign, selectedVerticalAlign, applyBorders, canApplyBorders, canTogglePageBreak, hasPageBreak, togglePageBreak,
  };
})();
