// Mode grille (planning/feature-mode-grille-excel.md) : un modèle de type « grille » (colonne TypeModele) n'est pas un texte sur une page A4 mais UN tableau, sans
// feuille, dont on tire les traits pour régler les colonnes et les lignes, et que l'export Excel reprend case par case. Même éditeur TipTap que les documents
// (aucun second éditeur) : ce module n'ajoute que ce qui fait d'un document « un tableau et rien d'autre » -
//   - un garde-fou (filterTransaction) qui refuse toute modification dont le résultat ne serait plus UN seul tableau, sans second tableau ni bloc que la grille
//     ne sait pas exporter (deux colonnes, sommaire, citation, bloc de code...) : la barre les grise, le garde-fou tient aussi pour le collage et le clavier ;
//   - la sélection toujours DANS une case (jamais le paragraphe vide que TipTap range sous un tableau final, jamais le curseur « gap » après lui) ;
//   - les bandeaux A, B, C / 1, 2, 3 autour du tableau, collants au défilement, avec les poignées qui règlent la largeur d'une colonne et la hauteur d'une ligne
//     (aperçu en direct pendant le geste, UNE seule transaction au relâcher : un seul Annuler) ;
//   - la hauteur de ligne (`rowHeight` sur tableRow, plancher = la hauteur de son texte) et la largeur de colonne (`colwidth` de chaque case) toujours posées.
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
  // de document (celui d'une grille est porté par la ligne - lot « saut de page »). Jamais une liste, un titre, une image : ceux-là s'écrivent dans l'Excel (puces
  // « • », gras et taille, image posée sur la case).
  const FORBIDDEN_NODES = new Set(['table', 'twoColumnsZone', 'twoColumnsColumn', 'toc', 'headingNumberingConfig', 'pageBreak', 'blockquote', 'callout', 'codeBlock',
    'horizontalRule', 'footnoteRef', 'pageNumberBadge']);
  const CELL_NODES = new Set(['tableCell', 'tableHeader']);
  // Alignement vertical d'une case (`verticalAlign`, inline `vertical-align`) : au milieu par défaut, comme les en-têtes d'un tableur mis en forme ; le haut et le bas se choisiront
  // dans la barre de la case (lot « fusion, bordures, alignement vertical »). Posé sur CHAQUE case de la grille : l'éditeur, la Lecture, le PDF et l'Excel le lisent au même endroit.
  const VALIGNS = new Set(['top', 'middle', 'bottom']);
  const DEFAULT_VALIGN = 'middle';

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
        });
      },
    });
  }

  // `verticalAlign` : null pour toute case d'un tableau de document (aucun changement de rendu ni de HTML hors grille) ; 'top', 'middle' ou 'bottom' dans une grille.
  // Lu dans `data-valign` seulement, la marque de l'enregistrement : le `vertical-align` d'un tableau collé d'Excel ou du web ne doit rien changer à un tableau de
  // document (l'export PDF ne l'applique que dans une grille, l'éditeur et la Lecture le montreraient seuls).
  function withCellAttributes(CellExtension) {
    return CellExtension.extend({
      addAttributes() {
        const parent = this.parent ? this.parent() : {};
        return Object.assign({}, parent, {
          verticalAlign: {
            default: null,
            parseHTML: el => { const v = String(el.getAttribute('data-valign') || '').toLowerCase(); return VALIGNS.has(v) ? v : null; },
            renderHTML: attrs => (VALIGNS.has(attrs.verticalAlign) ? { 'data-valign': attrs.verticalAlign, style: 'vertical-align: ' + attrs.verticalAlign } : {}),
          },
        });
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
  function fixDimensions(state, tr) {
    const info = tableInfo(tr ? tr.doc : state.doc);
    if (!info) return null;
    const widths = columnWidths(info.node);
    const map = libs.TableMap.get(info.node);
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
      // Seule une case dont le type porte l'attribut peut le recevoir : sinon le « correctif » ne corrigerait jamais rien et appendTransaction tournerait sans fin.
      const alignOk = VALIGNS.has(cell.attrs.verticalAlign) || !cell.type.spec.attrs || !('verticalAlign' in cell.type.spec.attrs);
      if (widthOk && alignOk) continue;
      if (!out) out = state.tr;
      out.setNodeMarkup(info.pos + 1 + pos, undefined, Object.assign({}, cell.attrs, { colwidth: want }, alignOk ? {} : { verticalAlign: DEFAULT_VALIGN }));
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

  function canMerge(ed) { return active && ed.can().mergeCells(); }
  function canSplit(ed) { return active && ed.can().splitCell(); }

  // Fusionne les cases sélectionnées en une seule : le texte des autres s'ajoute à la suite du sien (rien n'est perdu, Annuler rend tout), le fond et l'alignement sont ceux de la
  // première. prosemirror-tables ne laisse à la case fusionnée que la largeur de sa première colonne (0 pour les autres) : on lui rend, dans la même transaction, celle de chaque
  // colonne qu'elle couvre - sans cela, fusionner toutes les lignes de deux colonnes remettait la seconde à la largeur par défaut (fixDimensions ne la retrouvait dans aucune autre case).
  function mergeCells(ed) {
    if (!canMerge(ed)) return false;
    const widths = columnWidths(tableInfo(ed.state.doc).node);
    return ed.chain().focus().mergeCells().command(({ tr }) => {
      const merged = tr.selection.$anchorCell ? tr.selection.$anchorCell.pos : null;
      const info = tableInfo(tr.doc);
      if (merged == null || !info) return true;
      const cell = tr.doc.nodeAt(merged);
      const left = libs.TableMap.get(info.node).colCount(merged - (info.pos + 1));
      tr.setNodeMarkup(merged, undefined, Object.assign({}, cell.attrs, { colwidth: widths.slice(left, left + (cell.attrs.colspan || 1)) }));
      return true;
    }).run();
  }

  // Scinde la case fusionnée en autant de cases qu'elle en recouvrait : la première garde le contenu, les autres naissent vides, avec le fond, l'alignement et la largeur de leur colonne.
  function splitCell(ed) { return canSplit(ed) && ed.chain().focus().splitCell().run(); }

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
            if (trs.some(t => t.docChanged)) tr = fixDimensions(newState, null);
            const sel = tr ? tr.selection : newState.selection;
            if (!selectionInsideTable(sel)) {
              const back = selectionBackInside(tr ? tr.doc : newState.doc, sel);
              if (back) { if (!tr) tr = newState.tr; tr.setSelection(back); }
            }
            return tr;
          },
          props: {
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

  function syncStrips(force) {
    if (!active || !strips || !editor) return;
    const m = measure();
    if (!m) return;
    const table = m.table;
    if (resizeObserver && !table.__gridObserved) { resizeObserver.disconnect(); resizeObserver.observe(table); table.__gridObserved = true; }
    const key = m.widths.map(w => w.toFixed(2)).join(',') + '|' + m.heights.map(h => h.toFixed(2)).join(',');
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
    configure, attach, createExtension, withRowAttributes, withCellAttributes, serialize, setActive, isActive, isGridType, refresh,
    currentCellDom, columnWidths, colName, floatingOptions, barSlot,
    canMerge, canSplit, mergeCells, splitCell, setVerticalAlign, selectedVerticalAlign,
  };
})();
