// Suivi des modifications : accepter ou refuser UNE modification (barre flottante, js/floating-toolbars.js). Quelles modifications la sélection touche (selectionSuggestionIds) et tout
// ce qui se résout avec elles (expandSuggestionIds). Script classique, chargé après js/track-changes-core.js.
const TrackChangesSelection = (function () {
  const { suggestionMarksOf, CELL_NODE_TYPES, lib } = TrackChangesCore;

  const sameId = (a, b) => String(a) === String(b);
  // Une marque `modification` d'une case ou d'une ligne qui accompagne une colonne ou une ligne ajoutée ou supprimée avec le suivi : la case fusionnée
  // dont la largeur (colspan, colwidth) ou la hauteur (rowspan) change avec elle porte ces marques sous un même id. Elle ne se voit pas dans l'éditeur
  // et la barre « Accepter / Refuser » ne la propose jamais : elle se résout avec sa colonne ou sa ligne (expandSuggestionIds). Les autres réglages
  // d'une case - le fond d'une cellule, la largeur d'une colonne tirée à la souris - sont des suggestions comme l'alignement d'un paragraphe : la
  // barre les propose, un par un.
  const ridesAlong = (node, mark) => mark.type.name === 'modification' && CELL_NODE_TYPES.includes(node.type.name)
    && node.marks.some(m => m.type.name === 'modification' && sameId(m.attrs.id, mark.attrs.id) && (m.attrs.attrName === 'colspan' || m.attrs.attrName === 'rowspan'));

  // Les ids des suggestions que la sélection touche. Curseur seul : le texte ou l'objet tout contre lui, celui d'avant d'abord (ce que le curseur
  // vient de franchir) ; à défaut, le bloc le plus profond qui porte une marque en remontant (la case d'une colonne suivie ou dont le fond ou la
  // largeur a changé, la ligne, le paragraphe supprimé en entier) : la suggestion la plus proche, jamais celle d'un bloc plus large qui ne fait que
  // contenir le curseur. Sélection : toutes celles qu'elle recouvre. Vide quand il n'y en a aucune.
  function selectionSuggestionIds(state) {
    const { from, to, empty, $from } = state.selection;
    const ids = [];
    const take = node => suggestionMarksOf(node).forEach(mark => {
      if (mark.attrs.id == null || ridesAlong(node, mark) || ids.some(id => sameId(id, mark.attrs.id))) return;
      ids.push(mark.attrs.id);
    });
    if (empty) {
      const near = [$from.nodeBefore, $from.nodeAfter].find(node => node && suggestionMarksOf(node).some(m => !ridesAlong(node, m)));
      if (near) take(near);
    } else {
      // Des cases sélectionnées (CellSelection, reconnue à `forEachCell` comme le fait setCellsBackground de js/floating-toolbars.js) : la plage de
      // chacune est son contenu, la case elle-même n'y est pas (la première non plus) - on la prend à part.
      if (typeof state.selection.forEachCell === 'function') state.selection.forEachCell(cell => take(cell));
      // Un bloc qui contient toute la sélection (la case, la ligne, le tableau où elle se trouve) ne compte pas : il ne fait que l'entourer.
      state.doc.nodesBetween(from, to, (node, pos) => { if (node.isLeaf || pos >= from || pos + node.nodeSize <= to) take(node); });
    }
    for (let depth = $from.depth; depth > 0 && !ids.length; depth--) take($from.node(depth));
    return ids;
  }

  // Le tableau autour de la case ou de la ligne à `pos` : `$pos` (sa position résolue), `depth` (celle du tableau), `table` et `map` (sa TableMap) ;
  // null hors d'un tableau.
  function tableAround(doc, pos) {
    const $pos = doc.resolve(pos);
    let depth = $pos.depth;
    while (depth > 0 && $pos.node(depth).type.name !== 'table') depth--;
    if (!depth) return null;
    const table = $pos.node(depth);
    return { $pos, depth, table, map: lib.TableMap.get(table) };
  }
  // La largeur d'une colonne tirée à la souris : prosemirror-tables règle `colwidth` sur toutes les cases de la colonne d'un coup, la lib pose une
  // marque par case, chacune avec son id. Hors celle d'une case fusionnée qui suit une colonne ajoutée ou supprimée (ridesAlong).
  const isColumnWidth = (node, mark) => mark.type.name === 'modification' && mark.attrs.attrName === 'colwidth' && !ridesAlong(node, mark);
  // Les colonnes dont la largeur a changé dans une marque `colwidth`, par rang à partir de la première colonne de la case : une case fusionnée porte la
  // largeur de chaque colonne qu'elle couvre, et seule celle qu'on a tirée compte.
  function changedColumns(mark) {
    const before = mark.attrs.previousValue || [];
    const after = mark.attrs.newValue || [];
    const columns = [];
    for (let k = 0; k < Math.max(before.length, after.length); k++) if ((before[k] || 0) !== (after[k] || 0)) columns.push(k);
    return columns;
  }

  // Tout ce qui se résout avec les suggestions `seedIds` : leurs propres ids, plus, pour une colonne ou une ligne de tableau ajoutée ou supprimée
  // avec le suivi, ceux des autres cases de la colonne (une marque par case, chacune avec son id : en résoudre une seule laisserait un tableau percé,
  // ou une colonne qui revient à la réouverture) et ceux des cases fusionnées dont la largeur (ou la hauteur) a changé avec elle : « Refuser » une
  // colonne ajoutée à travers une case fusionnée doit aussi lui rendre sa largeur, sans quoi prosemirror-tables « répare » le tableau en ajoutant des
  // cases vides. Pour la largeur d'une colonne tirée à la souris, ceux des autres cases de la colonne qui portent la leur : une colonne n'a qu'une
  // largeur, la rendre à une case seule laisserait des largeurs différentes dans la colonne. Rend une table id en texte -> id tel que le document
  // l'écrit (la lib compare avec `===`).
  function expandSuggestionIds(doc, seedIds) {
    const ids = new Map();
    seedIds.forEach(id => ids.set(String(id), id));
    if (!lib.TableMap) return ids;
    const seeds = [];
    const widths = [];
    doc.descendants((node, pos) => {
      if (!CELL_NODE_TYPES.includes(node.type.name)) return true;
      const own = suggestionMarksOf(node).find(m => m.type.name !== 'modification' && ids.has(String(m.attrs.id)));
      if (own) seeds.push({ pos, kind: own.type.name, isRow: node.type.name === 'tableRow' });
      const width = suggestionMarksOf(node).find(m => isColumnWidth(node, m) && ids.has(String(m.attrs.id)));
      if (width) widths.push({ pos, mark: width });
      return true;
    });
    seeds.forEach(({ pos, kind, isRow }) => {
      const around = tableAround(doc, pos);
      if (!around) return;
      const { $pos, depth, table, map } = around;
      const take = (cell, attrName) => cell && suggestionMarksOf(cell).forEach(m => {
        const sameKind = m.type.name === kind && !isRow;
        const sameSize = m.type.name === 'modification' && m.attrs.attrName === attrName;
        if (m.attrs.id != null && (sameKind || sameSize)) ids.set(String(m.attrs.id), m.attrs.id);
      });
      if (isRow) {
        const row = $pos.index(depth);
        for (let col = 0; col < map.width; col++) take(table.nodeAt(map.map[row * map.width + col]), 'rowspan');
      } else {
        const { left } = map.findCell(pos - $pos.start(depth));
        for (let row = 0; row < map.height; row++) take(table.nodeAt(map.map[row * map.width + left]), 'colspan');
      }
    });
    widths.forEach(({ pos, mark }) => {
      const around = tableAround(doc, pos);
      if (!around) return;
      const { $pos, depth, table, map } = around;
      const { left } = map.findCell(pos - $pos.start(depth));
      changedColumns(mark).forEach(offset => {
        if (left + offset >= map.width) return;
        for (let row = 0; row < map.height; row++) {
          const cell = table.nodeAt(map.map[row * map.width + left + offset]);
          if (cell) suggestionMarksOf(cell).forEach(m => { if (isColumnWidth(cell, m) && m.attrs.id != null) ids.set(String(m.attrs.id), m.attrs.id); });
        }
      });
    });
    return ids;
  }

  return { sameId, ridesAlong, selectionSuggestionIds, expandSuggestionIds };
})();
