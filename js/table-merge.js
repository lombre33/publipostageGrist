// Fusionner et scinder des cases dans un tableau de document. Le geste est celui de la grille (js/grid-editor.js:mergeSelected et splitSelected, qui règlent
// aussi les largeurs rendues et les bordures du pourtour) ; ce fichier garde ce qui est propre à un document : les gardes, grisées avec leur raison pour
// info-bulle (jamais retirées) sur les mêmes boutons de la barre du tableau (js/floating-toolbars.js). Le texte des cases fusionnées se garde à la suite de celui
// de la première (prosemirror-tables), le fond et le type (titre ou case) sont ceux de la première, Annuler rend tout d'un seul geste. Ne touche pas au DOM :
// tout passe par l'éditeur.
const TableMerge = (function () {
  let libs = null; // { TableMap, selectedRect, isInTable } de prosemirror-tables, posés par Editor.init()
  function configure(tools) { libs = tools; }

  // La sélection de cases d'un état, null pour un simple curseur. Reconnue par duck-typing sur `forEachCell` : deux exemplaires du module prosemirror-tables peuvent coexister, un
  // `instanceof` échouerait (comme dans js/floating-toolbars.js).
  function cellSelectionOf(state) {
    const sel = state.selection;
    return sel && typeof sel.forEachCell === 'function' ? sel : null;
  }

  // Les rangs des lignes du tableau qu'une boucle répète : js/loop-rules.js clone le <tr> de la bulle dont la boucle répète « la ligne du tableau » (`repeat: 'row'`). Une ligne de
  // tableau imbriqué dans une case a ses propres boucles : on ne descend pas dans les <tr>.
  function loopRows(tableNode) {
    const rows = new Set();
    tableNode.forEach((row, offset, index) => {
      let found = false;
      row.descendants((node) => {
        if (found || node.type.name === 'tableRow') return false;
        if (node.type.name === 'varBadge') {
          const loop = LoopRules.normalizeLoop(node.attrs.loop);
          if (loop && loop.repeat === 'row') found = true;
        }
        return !found;
      });
      if (found) rows.add(index);
    });
    return rows;
  }

  // Une case fusionnée sur plusieurs lignes traverse-t-elle la ligne `rowIndex` du tableau (elle y commence avant, ou elle y finit après) ? Une ligne répétée par une boucle n'en a
  // jamais : la copie d'une ligne dont la case s'étend sur la ligne suivante donnerait un tableau sans forme (js/variable-loop.js grise « La ligne du tableau » dans ce cas).
  function rowCrossedByMerge(tableNode, rowIndex) {
    if (!libs || !tableNode || rowIndex < 0 || rowIndex >= tableNode.childCount) return false;
    const map = libs.TableMap.get(tableNode);
    for (let col = 0; col < map.width; col++) {
      const cell = map.findCell(map.map[rowIndex * map.width + col]);
      if (cell.top < rowIndex || cell.bottom > rowIndex + 1) return true;
    }
    return false;
  }

  // Pourquoi « Fusionner les cases » ne sert pas maintenant : la clé du texte d'info-bulle (js/i18n.js), ou null quand il sert. Dans l'ordre : il faut un rectangle d'au moins deux cases
  // (sans case fusionnée qui dépasse), le suivi des modifications éteint (la forme du tableau changerait entre une proposition et son acceptation), aucune ligne répétée par une
  // boucle dans une fusion sur plusieurs lignes (une fusion dans une seule ligne reste possible : la copie de la ligne garde ses cases fusionnées) et aucun saut de page avant une
  // ligne de la fusion, hors la première (une case ne s'étend pas de part et d'autre d'un saut : le PDF et le Word la couperaient en deux, la grille refuse de même).
  function mergeBlock(ed) {
    if (!libs || !ed || !libs.isInTable(ed.state)) return 'table.cellMergeNeedsCells';
    const sel = cellSelectionOf(ed.state);
    if (!sel || sel.$anchorCell.pos === sel.$headCell.pos) return 'table.cellMergeNeedsCells';
    if (Editor.isTrackChangesOn()) return 'table.cellTracked';
    if (!ed.can().mergeCells()) return 'table.cellMergeOverlap';
    const { table, top, bottom } = libs.selectedRect(ed.state);
    if (bottom - top > 1) {
      const looped = loopRows(table);
      for (let row = top; row < bottom; row++) if (looped.has(row)) return 'table.cellMergeLoop';
      for (let row = top + 1; row < bottom; row++) if (table.child(row).attrs.pageBreakBefore) return 'table.cellMergePageBreak';
    }
    return null;
  }

  // Idem pour « Scinder la case » : le curseur (ou la seule case choisie) dans une case fusionnée, le suivi éteint.
  function splitBlock(ed) {
    if (!libs || !ed || !libs.isInTable(ed.state) || !ed.can().splitCell()) return 'table.cellSplitNeedsMerged';
    if (Editor.isTrackChangesOn()) return 'table.cellTracked';
    return null;
  }

  // Fusionne les cases choisies en une seule, en une transaction (un seul Annuler) : la fusion est celle de la grille (js/grid-editor.js:mergeSelected), qui rend
  // à la case fusionnée la largeur de chaque colonne qu'elle couvre (prosemirror-tables ne lui laisse que celle de la première, et plus aucune case ne porterait
  // celle d'une colonne entièrement fusionnée) et le pourtour des cases fusionnées quand le tableau a des traits. Les gardes ci-dessus restent à ce fichier.
  function mergeCells(ed) {
    if (mergeBlock(ed)) return false;
    return GridEditor.mergeSelected(ed);
  }

  // Scinde la case fusionnée en autant de cases qu'elle en recouvrait : la première garde le contenu, les autres naissent vides (prosemirror-tables leur rend la
  // largeur de leur colonne) ; le pourtour garde ses traits et ceux du dedans sont ceux de départ (js/grid-editor.js:splitSelected).
  function splitCell(ed) {
    if (splitBlock(ed)) return false;
    return GridEditor.splitSelected(ed);
  }

  return { configure, mergeBlock, splitBlock, mergeCells, splitCell, rowCrossedByMerge };
})();
