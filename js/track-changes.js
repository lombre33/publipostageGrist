// Suivi des modifications (mode suggestion façon Word et Google Docs) : pont entre Tiptap et @handlewithcare/prosemirror-suggest-changes@0.1.8.
// Cadrage, diagnostics et mesures : planning/feature-track-changes.md.
// Script classique, même patron que js/editor-nodes.js : createExtensions() fait son propre import() dynamique, appelé par Editor.init() une fois
// Node, Mark, Extension et mergeAttributes disponibles (import de @tiptap/core).
const TrackChanges = (function () {
  const MARK_NAMES = ['insertion', 'deletion', 'modification'];
  const isSuggestionMark = mark => MARK_NAMES.includes(mark.type.name);
  const suggestionMarksOf = node => node.marks.filter(isSuggestionMark);

  // Une marque de suivi posée sur une case de tableau (« Colonne avant / après », « Supprimer la colonne ») ou sur une ligne (« Ligne avant /
  // après », « Supprimer la ligne ») : ProseMirror l'écrit en <ins>/<del> autour du <td> (dans le <tr>) ou autour du <tr> (dans le <tbody>). Le HTML
  // enregistré ne peut pas garder cette forme : l'analyseur HTML du navigateur sort d'une ligne ou d'un corps de tableau tout élément étranger
  // (« foster parenting »), et la colonne ou la ligne supprimée revenait à la réouverture comme si de rien n'était. La marque s'écrit donc en
  // attribut de la case ou de la ligne (data-tc-insertion="3"), relu par les règles parseHTML des marques plus bas. La marque `modification`
  // (changement d'attribut : largeur d'une case fusionnée qui gagne une colonne, hauteur d'une case fusionnée qui gagne une ligne) y garde ses cinq
  // valeurs, en JSON.
  const CELL_NODE_TYPES = ['tableCell', 'tableHeader', 'tableRow'];
  const cellMarkAttribute = markName => 'data-tc-' + markName;
  const cellMarkValue = mark => JSON.stringify(mark.type.name === 'modification' ? mark.attrs : mark.attrs.id);

  // Clé du plugin de la lib, gardée pour skipTracking() : createExtensions() est le seul endroit qui importe la lib. Null tant qu'il n'a pas tourné.
  let suggestKey = null;
  // Classe TableMap de prosemirror-tables, gardée de la même façon : elle sert à retrouver les cases d'une même colonne (expandSuggestionIds). Null
  // tant que createExtensions() n'a pas tourné.
  let TableMapClass = null;

  // Un conteneur de bloc (doc, table, twoColumnsColumn, twoColumnsZone, cellule de tableau...) doit autoriser explicitement ces 3 marques sur ses
  // enfants directs pour qu'une suppression ou une insertion de bloc entier (pas seulement de texte) puisse se poser en marque de nœud
  // (tr.addNodeMark) sans que ProseMirror lève « Invalid content for node X » (cf. planning/feature-track-changes.md). Un nœud Tiptap est immutable :
  // `.extend(...)` renvoie une nouvelle définition, à utiliser à la place de l'originale dans `extensions: [...]`.
  function extendForTracking(nodeOrMarkExtension) {
    return nodeOrMarkExtension.extend({ marks: MARK_NAMES.join(' ') });
  }

  // Marque `tr` comme « déjà le résultat » : dispatchTransaction (plus bas) la laisse passer au lieu de la transformer en suggestion. Pour ce que le
  // widget écrit lui-même sans que la personne l'ait demandé (grille page des images en calque après un changement d'orientation,
  // HeaderFooterPreview.recaptureLayeredImageGrids) : suivie, l'écriture ressortait en suppression et insertion de l'image, à accepter ou refuser.
  // Rend `tr` (pour chaîner) ; sans suivi actif, la marque est sans effet.
  function skipTracking(tr) {
    return suggestKey ? tr.setMeta(suggestKey, { skip: true }) : tr;
  }

  // Vrai pour une transaction qui n'est pas une modification de la personne mais le résultat de ce qu'elle décrit : « Tout accepter » et « Tout
  // refuser » (et leurs variantes par suggestion ou par sélection), le chargement d'un document, une écriture marquée par skipTracking().
  // dispatchTransaction (plus bas) les laisse passer sans les suivre ; un plugin qui doit réagir à la résolution des suggestions (la valeur
  // conditionnelle vidée, js/editor-nodes.js) s'appuie sur la même marque.
  function isSkipped(tr) {
    const meta = suggestKey ? tr.getMeta(suggestKey) : null;
    return !!meta && 'skip' in meta;
  }

  function lastNodeCarriesSuggestionMark(state) {
    const last = state.doc.lastChild;
    return !!last && last.marks.some(isSuggestionMark);
  }

  // Vrai tant qu'un nœud du document porte une marque que `test` retient.
  function docHasMark(doc, test) {
    let found = false;
    doc.descendants(node => {
      if (found) return false;
      if (node.marks.some(test)) found = true;
      return !found;
    });
    return found;
  }
  const hasPendingSuggestions = state => docHasMark(state.doc, isSuggestionMark);
  // Vrai tant qu'une insertion ou une suppression (un texte, un objet, une case, une colonne, une ligne) attend : les modifications seules ne
  // comptent pas.
  const hasInsertionOrDeletion = doc => docHasMark(doc, mark => isSuggestionMark(mark) && mark.type.name !== 'modification');

  // L'ensemble des ids de suggestion présents dans le document, dédupliqués (un remplacement adjacent peut réutiliser le même id sur plusieurs
  // marques, cf. suggestReplaceStep dans planning/feature-track-changes.md). Convertis en chaîne : ce sont des clés d'objet JS, et
  // generateNextNumberId (dans la lib) produit des nombres.
  function collectPendingIds(state) {
    const ids = new Set();
    state.doc.descendants(node => {
      suggestionMarksOf(node).forEach(m => { if (m.attrs.id != null) ids.add(String(m.attrs.id)); });
    });
    return ids;
  }

  // Fusionne les ids présents dans le document avec les métadonnées déjà connues (auteur, horodatage) : un id déjà vu garde son auteur et sa date
  // d'origine, un nouveau reçoit authorEmail et maintenant. Les ids disparus (suggestion acceptée ou refusée) disparaissent du résultat sans purge
  // explicite, puisqu'on ne recopie que ce qui est encore présent : purge dès la résolution, le défaut le plus prudent, comme un commentaire supprimé
  // (cf. « Rétention de l'historique » dans planning/feature-track-changes.md).
  function computeMetadata(state, previousMetadata, authorEmail) {
    const previous = previousMetadata || {};
    const now = new Date().toISOString();
    const next = {};
    collectPendingIds(state).forEach((id) => {
      next[id] = previous[id] || { author: authorEmail || null, createdAt: now };
    });
    return next;
  }

  // Accepter ou refuser une modification (barre flottante, js/floating-toolbars.js)
  const sameId = (a, b) => String(a) === String(b);
  // Une marque `modification` d'une case ou d'une ligne (la largeur d'une case fusionnée qui gagne une colonne, le fond d'une cellule, la largeur
  // d'une colonne) ne se voit pas dans l'éditeur : elle ne déclenche jamais la barre « Accepter / Refuser », elle suit seulement la colonne ou la
  // ligne dont elle fait partie (expandSuggestionIds). « Tout refuser » rend celles qui ne suivent rien (pendingAttributeIds), « Tout accepter »
  // toutes.
  const isTableMod = (node, mark) => mark.type.name === 'modification' && CELL_NODE_TYPES.includes(node.type.name);

  // Les ids des suggestions que la sélection touche. Curseur seul : le texte ou l'objet tout contre lui, celui d'avant d'abord (ce que le curseur
  // vient de franchir) ; à défaut, le bloc le plus profond qui porte une marque en remontant (la case d'une colonne suivie, la ligne, le paragraphe
  // supprimé en entier) : la suggestion la plus proche, jamais celle d'un bloc plus large qui ne fait que contenir le curseur. Sélection : toutes
  // celles qu'elle recouvre. Vide quand il n'y en a aucune.
  function selectionSuggestionIds(state) {
    const { from, to, empty, $from } = state.selection;
    const ids = [];
    const take = node => suggestionMarksOf(node).forEach(mark => {
      if (mark.attrs.id == null || isTableMod(node, mark) || ids.some(id => sameId(id, mark.attrs.id))) return;
      ids.push(mark.attrs.id);
    });
    if (empty) {
      const near = [$from.nodeBefore, $from.nodeAfter].find(node => node && suggestionMarksOf(node).some(m => !isTableMod(node, m)));
      if (near) take(near);
    } else {
      // Un bloc qui contient toute la sélection (la case, la ligne, le tableau où elle se trouve) ne compte pas : il ne fait que l'entourer.
      state.doc.nodesBetween(from, to, (node, pos) => { if (node.isLeaf || pos >= from || pos + node.nodeSize <= to) take(node); });
    }
    for (let depth = $from.depth; depth > 0 && !ids.length; depth--) take($from.node(depth));
    return ids;
  }

  // Tout ce qui se résout avec les suggestions `seedIds` : leurs propres ids, plus, pour une colonne ou une ligne de tableau ajoutée ou supprimée
  // avec le suivi, ceux des autres cases de la colonne (une marque par case, chacune avec son id : en résoudre une seule laisserait un tableau percé,
  // ou une colonne qui revient à la réouverture) et ceux des cases fusionnées dont la largeur (ou la hauteur) a changé avec elle : « Refuser » une
  // colonne ajoutée à travers une case fusionnée doit aussi lui rendre sa largeur, sans quoi prosemirror-tables « répare » le tableau en ajoutant des
  // cases vides. Rend une table id en texte -> id tel que le document l'écrit (la lib compare avec `===`).
  function expandSuggestionIds(doc, seedIds) {
    const ids = new Map();
    seedIds.forEach(id => ids.set(String(id), id));
    if (!TableMapClass) return ids;
    const seeds = [];
    doc.descendants((node, pos) => {
      if (!CELL_NODE_TYPES.includes(node.type.name)) return true;
      const own = suggestionMarksOf(node).find(m => m.type.name !== 'modification' && ids.has(String(m.attrs.id)));
      if (own) seeds.push({ pos, kind: own.type.name, isRow: node.type.name === 'tableRow' });
      return true;
    });
    seeds.forEach(({ pos, kind, isRow }) => {
      const $pos = doc.resolve(pos);
      let depth = $pos.depth;
      while (depth > 0 && $pos.node(depth).type.name !== 'table') depth--;
      if (!depth) return;
      const table = $pos.node(depth);
      const map = TableMapClass.get(table);
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
    return ids;
  }

  // L'étendue, dans `doc`, de tout ce qui porte une insertion ou une suppression d'id `id` : une suggestion s'étend sur des nœuds voisins (la fin
  // d'un paragraphe et le début du suivant pour une suppression à cheval sur les deux, par exemple). Les marques `modification` n'y comptent pas,
  // elles se résolvent à part (resolveModifications). Null quand rien ne la porte.
  function suggestionRegion(doc, id) {
    let from = null;
    let to = null;
    doc.descendants((node, pos) => {
      if (!node.marks.some(m => m.type.name !== 'modification' && MARK_NAMES.includes(m.type.name) && sameId(m.attrs.id, id))) return true;
      if (from == null) from = pos;
      to = Math.max(to == null ? 0 : to, pos + node.nodeSize);
      return true;
    });
    return from == null ? null : { from, to };
  }

  // Résout les marques `modification` (un attribut de nœud qui a changé : alignement, taille d'une image, largeur d'une case fusionnée...) des
  // suggestions `ids` : « accepter » retire la marque, « refuser » la retire et rend l'ancienne valeur - la même règle que revertModifications de la
  // lib, qui ne sait pas la restreindre à une suggestion. Du dernier au premier : les positions lues restent vraies.
  function resolveModifications(tr, ids, accept) {
    const found = [];
    tr.doc.descendants((node, pos) => {
      node.marks.forEach(mark => { if (mark.type.name === 'modification' && ids.has(String(mark.attrs.id))) found.push({ node, pos, mark }); });
    });
    found.reverse().forEach(({ node, pos, mark }) => {
      if (node.isText) tr.removeMark(pos, pos + node.nodeSize, mark); else tr.removeNodeMark(pos, mark);
      if (accept) return;
      const { type, attrName, previousValue } = mark.attrs;
      if (type === 'attr' && typeof attrName === 'string') tr.setNodeAttribute(pos, attrName, previousValue);
      else if (type === 'nodeType' && tr.doc.type.schema.nodes[previousValue]) tr.setNodeMarkup(pos, tr.doc.type.schema.nodes[previousValue], null);
    });
  }

  // Lecture et exports : le document comme si tout était accepté
  // Le mode Lecture (js/reader-mode.js:renderRecord) montre le document tel qu'il serait après « Tout accepter », avec une légère teinte
  // (.pp-tc-changed, css/track-changes.css) là où quelque chose a changé ; le PDF, le Word et l'Excel (ReaderMode.preview) sortent le même document
  // sans teinte. Le document n'est pas touché : c'est le HTML qui est retouché au niveau du DOM (celui d'editor.getHTML() ou de
  // js/comments.js:buildReaderHtml, qui garde ses repères data-pp-pos), sans éditeur ni schéma - un macro-modèle assemble d'ailleurs le HTML d'autres
  // modèles. Mêmes règles que la lib (commands.js:applySuggestionsToTransform) : le texte supprimé s'en va, et une seule espace des deux quand celle
  // d'avant et celle d'après en sont ; une suppression à cheval sur plusieurs blocs les réunit ; une insertion ne garde que son texte (le U+200B posé
  // pour un saut de paragraphe disparaît) ; une case, une colonne ou une ligne supprimée s'en va aussi, avec son <col>.
  const CHANGED_CLASS = 'pp-tc-changed';
  const ZERO_WIDTH_SPACE = '​';
  const SUGGESTION_MARKERS = 'ins[data-id], del[data-id], span[data-type="modification"], [data-tc-insertion], [data-tc-deletion], [data-tc-modification]';
  const TEXT_BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);
  const BLOCK_TAGS = new Set([...TEXT_BLOCK_TAGS, 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'FIGURE', 'HR']);
  const isDeletion = node => node.nodeType === 1 && node.tagName === 'DEL' && node.hasAttribute('data-id');
  const isBlockLevel = el => Array.from(el.children).some(child => BLOCK_TAGS.has(child.tagName));
  // Le bloc qui porte le texte de `node` (le paragraphe, le titre, la case...) ; `root` quand rien ne l'enveloppe.
  function blockOf(node, root) {
    let el = node.parentNode;
    while (el && el !== root && !BLOCK_TAGS.has(el.tagName)) el = el.parentNode;
    return el || root;
  }
  // Un texte vide ou un commentaire n'est pas du contenu ; les blancs entre deux blocs non plus (jamais ceux d'un paragraphe ou d'une mise en forme :
  // ce sont des espaces du texte).
  const isStructural = el => BLOCK_TAGS.has(el.tagName) && !TEXT_BLOCK_TAGS.has(el.tagName);
  const isFiller = (node, parent) => node.nodeType === 8 || (node.nodeType === 3 && (!node.data || (!node.data.trim() && isStructural(parent))));
  // Le contenu qui suit (`dir` 1) ou précède (-1) `node` dans `block` (un texte, ou un élément sans enfant : image, saut de ligne, bulle), hors des
  // enfants de `node` ; null au bout du bloc.
  function leafNear(node, block, dir) {
    const sibling = dir > 0 ? 'nextSibling' : 'previousSibling';
    const innermost = dir > 0 ? 'firstChild' : 'lastChild';
    let current = node;
    for (;;) {
      while (current !== block && !current[sibling]) current = current.parentNode;
      if (current === block) return null;
      current = current[sibling];
      while (current[innermost]) current = current[innermost];
      if (!isFiller(current, current.parentNode)) return current;
    }
  }
  const leafAfter = (node, block) => leafNear(node, block, 1);
  const leafBefore = (node, block) => leafNear(node, block, -1);
  const contentChildren = el => Array.from(el.childNodes).filter(child => !isFiller(child, el));
  // La suppression qui prolonge `del` (même id) : celle qui suit dans le bloc, ou, en fin de bloc, celle qui ouvre le bloc suivant - le tout premier
  // contenu de ce bloc, comme le fait findSuggestionMarkEnd de la lib : un bloc vide ou qui commence par autre chose l'arrête.
  function followingDeletion(root, del) {
    const block = blockOf(del, root);
    const leaf = leafAfter(del, block);
    let next = null;
    if (leaf) {
      for (let el = leaf.nodeType === 1 ? leaf : leaf.parentNode; el && el !== block; el = el.parentNode) { if (isDeletion(el)) { next = el; break; } }
    } else {
      const nextContent = node => {
        let sibling = node.nextSibling;
        while (sibling && isFiller(sibling, node.parentNode)) sibling = sibling.nextSibling;
        return sibling;
      };
      let from = block;
      while (from && from !== root && !(next = nextContent(from))) from = from.parentNode;
      while (next && !isDeletion(next) && next.firstChild) next = contentChildren(next)[0] || null;
    }
    return next && next !== del && isDeletion(next) && !isBlockLevel(next) && next.getAttribute('data-id') === del.getAttribute('data-id') ? next : null;
  }
  // Retire `node`, puis les éléments en ligne que cela laisse vides (la marque d'un texte supprimé, un lien...) : jamais un bloc, un paragraphe vidé
  // reste.
  function pruneEmpty(node) {
    let parent = node.parentNode;
    node.remove();
    while (parent && !parent.firstChild && parent.parentNode && !BLOCK_TAGS.has(parent.tagName)) {
      const up = parent.parentNode;
      parent.remove();
      parent = up;
    }
    return parent;
  }
  // Une case, un item ou une citation ne reste jamais sans bloc : un paragraphe vide y prend la place, comme la lib la laisse.
  function refillContainer(parent) {
    if (parent && !parent.firstChild && ['TD', 'TH', 'LI', 'BLOCKQUOTE'].includes(parent.tagName)) parent.appendChild(parent.ownerDocument.createElement('p'));
  }
  // Retire les `count` premiers caractères de `text`. Le repère de position d'un texte (data-pp-pos, js/comments.js) suit : il désigne le début du
  // texte.
  function dropLeading(text, count) {
    const holder = text.parentNode;
    if (holder.nodeType === 1 && holder.firstChild === text && holder.hasAttribute('data-pp-pos')) {
      const parts = holder.getAttribute('data-pp-pos').split(':');
      holder.setAttribute('data-pp-pos', parts.slice(0, -1).concat(Number(parts[parts.length - 1]) + count).join(':'));
    }
    text.data = text.data.slice(count);
    if (!text.data) refillContainer(pruneEmpty(text));
  }
  // Réunit le bloc `b` au bloc `a` qui le précède : ce qui est entre les deux (des blocs entièrement supprimés) s'en va, le contenu de `b` rejoint
  // `a`.
  function mergeBlocks(root, a, b) {
    if (a === b || !root.contains(a) || !root.contains(b) || a.contains(b) || b.contains(a)) return;
    if (a.closest('td, th') !== b.closest('td, th')) return;
    const range = root.ownerDocument.createRange();
    range.setStart(a, a.childNodes.length);
    range.setEnd(b, 0);
    range.deleteContents();
    while (b.firstChild) a.appendChild(b.firstChild);
    let shell = b;
    while (shell !== root && !shell.firstChild) {
      const up = shell.parentNode;
      shell.remove();
      shell = up;
    }
  }
  // Une suppression et ce qui la prolonge (cf. followingDeletion), traitées comme la lib : retirées d'un bloc, l'espace en trop avalée, les blocs
  // réunis.
  function acceptDeletion(root, del) {
    if (isBlockLevel(del)) { refillContainer(pruneEmpty(del)); return; }
    const run = [del];
    for (let next = followingDeletion(root, del); next && !run.includes(next); next = followingDeletion(root, next)) run.push(next);
    const last = run[run.length - 1];
    const blockA = blockOf(del, root);
    const blockB = blockOf(last, root);
    const before = leafBefore(del, blockA);
    const after = leafAfter(last, blockB);
    const squeeze = before && after && before.nodeType === 3 && after.nodeType === 3 && before.data.endsWith(' ') && after.data.startsWith(' ');
    run.forEach(item => refillContainer(pruneEmpty(item)));
    if (squeeze) dropLeading(after, 1);
    mergeBlocks(root, blockA, blockB);
  }
  // Un élément de suivi (<ins>, <span data-type="modification">) laisse son contenu, teinté sauf pour une sortie (`tint` faux) : en bloc, la classe
  // va sur chaque bloc ; en ligne, dans un <span>.
  function tintAndUnwrap(el, tint) {
    if (!tint) { el.replaceWith(...el.childNodes); return; }
    const blocks = Array.from(el.children).filter(child => BLOCK_TAGS.has(child.tagName));
    if (blocks.length) {
      blocks.forEach(block => block.classList.add(CHANGED_CLASS));
      el.replaceWith(...el.childNodes);
      return;
    }
    const span = el.ownerDocument.createElement('span');
    span.className = CHANGED_CLASS;
    while (el.firstChild) span.appendChild(el.firstChild);
    el.replaceWith(span);
  }
  function acceptInsertion(ins, tint) {
    const texts = [];
    const walker = ins.ownerDocument.createTreeWalker(ins, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(text => {
      const marker = /^​+/.exec(text.data);
      if (marker) dropLeading(text, marker[0].length);
      if (text.parentNode && text.data.includes(ZERO_WIDTH_SPACE)) text.data = text.data.split(ZERO_WIDTH_SPACE).join('');
    });
    if (!ins.parentNode) return;
    if (ins.firstChild) tintAndUnwrap(ins, tint); else refillContainer(pruneEmpty(ins));
  }
  // Tiptap écrit un <col> par colonne de la première ligne et la largeur du tableau d'après eux (createColGroup, @tiptap/extension-table) : refaits
  // une fois les cases et les lignes supprimées retirées, sinon une colonne vide resterait à droite. Largeur minimale d'une colonne : celle que les
  // <col> portaient.
  function rebuildColumns(table) {
    const group = Array.from(table.children).find(el => el.tagName === 'COLGROUP');
    const first = table.rows[0];
    if (!group || !first) return;
    const minWidth = Array.from(group.children).map(col => parseFloat(col.style.minWidth)).find(width => width > 0) || 25;
    let total = 0;
    let fixed = true;
    group.textContent = '';
    Array.from(first.cells).forEach(cell => {
      const widths = (cell.getAttribute('colwidth') || cell.getAttribute('data-colwidth') || '').split(',');
      for (let i = 0; i < cell.colSpan; i++) {
        const width = parseInt(widths[i], 10) || 0;
        const col = table.ownerDocument.createElement('col');
        col.style[width ? 'width' : 'minWidth'] = (width || minWidth) + 'px';
        group.appendChild(col);
        total += width || minWidth;
        if (!width) fixed = false;
      }
    });
    table.style.width = fixed ? total + 'px' : '';
    table.style.minWidth = fixed ? '' : total + 'px';
    if (!table.getAttribute('style')) table.removeAttribute('style');
  }
  // Colonnes et lignes suivies (une marque par case, cf. CELL_NODE_TYPES) : les supprimées s'en vont, les ajoutées se teintent (sauf en sortie).
  function acceptTableSuggestions(root, tint) {
    root.querySelectorAll('table').forEach(table => {
      let removed = false;
      Array.from(table.rows).forEach(row => {
        if (row.hasAttribute('data-tc-deletion')) { row.remove(); removed = true; return; }
        Array.from(row.cells).forEach(cell => { if (cell.hasAttribute('data-tc-deletion')) { cell.remove(); removed = true; } });
      });
      if (removed) rebuildColumns(table);
    });
    root.querySelectorAll('[data-tc-insertion], [data-tc-modification], [data-tc-deletion]').forEach(el => {
      if (tint && el.hasAttribute('data-tc-insertion')) el.classList.add(CHANGED_CLASS);
      MARK_NAMES.forEach(name => el.removeAttribute(cellMarkAttribute(name)));
    });
  }
  // Rend `root` (un conteneur détaché ou non, dont le HTML vient d'être posé) tel qu'il serait avec toutes les suggestions acceptées. True si quelque
  // chose a changé. `options.tint: false` pour une sortie (PDF, Word, Excel) : ce qui a changé s'y écrit comme le reste, sans teinte.
  function acceptedView(root, options) {
    if (!root.querySelector(SUGGESTION_MARKERS)) return false;
    const tint = !options || options.tint !== false;
    acceptTableSuggestions(root, tint);
    // Dans l'ordre du document, comme la lib : la suppression d'avant se voit déjà faite quand on regarde l'espace qui précède celle d'après.
    root.querySelectorAll('ins[data-id], del[data-id]').forEach(el => {
      if (!root.contains(el)) return;
      if (el.tagName === 'DEL') acceptDeletion(root, el); else acceptInsertion(el, tint);
    });
    root.querySelectorAll('span[data-type="modification"]').forEach(el => tintAndUnwrap(el, tint));
    return true;
  }

  async function createExtensions(Node, Mark, Extension, mergeAttributes) {
    const {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled,
      applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction,
    } = await import('@handlewithcare/prosemirror-suggest-changes');
    suggestKey = suggestChangesKey;
    const { DOMParser: PMDOMParser, DOMSerializer: PMDOMSerializer, Fragment: PMFragment } = await import('prosemirror-model');
    const { EditorState } = await import('prosemirror-state');
    TableMapClass = (await import('prosemirror-tables')).TableMap;
    // applySuggestionsInRange et revertSuggestionsInRange existent dans le paquet npm source mais pas dans le bundle ESM esm.sh réellement chargé
    // ici : les importer casserait le chargement du module entier, sans erreur visible. applySuggestion et revertSuggestion appelés avec un id
    // `undefined` (utilisés partout ci-dessous) font le même travail : toutes les suggestions de la plage.

    // Une marque de suggestion : `<ins>` ou `<del>` portant l'id en data-id, ou l'attribut data-tc-* d'une case ou d'une ligne (cf.
    // CELL_NODE_TYPES) ; `consuming: false` laisse ensuite s'appliquer la règle de la case ou de la ligne (td, th, tr), la marque se posant sur le
    // nœud. `priority: 200` : le Strike de StarterKit reconnaît aussi <del>, sans priorité de règle explicite (50, le défaut ProseMirror) ; à
    // priorité de règle égale, l'ordre des marques dans le schéma tranche, dérivé de la priorité d'extension Tiptap (défaut 100). Sans ce relèvement,
    // StarterKit (déclaré en premier dans `extensions: [...]`) gagnerait la course au parsing de <del> et absorberait la marque de suivi, sans erreur
    // visible (aller-retour HTML).
    const suggestionMark = (name, tag, excludes) => Mark.create({
      name,
      priority: 200,
      inclusive: false,
      excludes,
      addAttributes() { return { id: { default: null } }; },
      parseHTML() {
        const cell = ['td', 'th', 'tr'].map(cellTag => `${cellTag}[${cellMarkAttribute(name)}]`).join(', ');
        return [
          { tag, getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) },
          { tag: cell, consuming: false, getAttrs: el => ({ id: JSON.parse(el.getAttribute(cellMarkAttribute(name))) }) },
        ];
      },
      renderHTML({ HTMLAttributes }) { return [tag, { 'data-id': JSON.stringify(HTMLAttributes.id) }, 0]; },
    });
    const InsertionMark = suggestionMark('insertion', 'ins', 'deletion modification insertion');
    const DeletionMark = suggestionMark('deletion', 'del', 'insertion modification deletion');
    const ModificationMark = Mark.create({
      name: 'modification',
      inclusive: false,
      excludes: 'deletion insertion',
      addAttributes() {
        return {
          id: { default: null }, type: { default: null },
          attrName: { default: null }, previousValue: { default: null }, newValue: { default: null },
        };
      },
      parseHTML() {
        return [
          { tag: "span[data-type='modification']" },
          { tag: 'td[data-tc-modification], th[data-tc-modification], tr[data-tc-modification]', consuming: false, getAttrs: el => JSON.parse(el.getAttribute('data-tc-modification')) },
        ];
      },
      renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'modification', 'data-id': JSON.stringify(HTMLAttributes.id) }), 0]; },
    });

    // Sérialiseur du schéma (celui de editor.getHTML(), du presse-papiers, des brouillons d'en-tête) : une case ou une ligne qui porte une marque de
    // suivi s'écrit avec la marque en attribut de l'élément au lieu d'un <ins>/<del> autour de lui (cf. CELL_NODE_TYPES). Tout autre fragment passe
    // tel quel par le sérialiseur d'origine.
    class TrackingDOMSerializer extends PMDOMSerializer {
      serializeFragment(fragment, options, target) {
        const isTrackedCell = node => CELL_NODE_TYPES.includes(node.type.name) && node.marks.some(isSuggestionMark);
        let anyTrackedCell = false;
        fragment.forEach(node => { if (isTrackedCell(node)) anyTrackedCell = true; });
        if (!anyTrackedCell) return super.serializeFragment(fragment, options, target);
        const bare = [];
        fragment.forEach(node => bare.push(isTrackedCell(node) ? node.mark(node.marks.filter(m => !isSuggestionMark(m))) : node));
        const out = super.serializeFragment(PMFragment.fromArray(bare), options);
        // Une case ou une ligne sérialisée = un élément : repli sur la forme d'origine si le compte n'y est pas, plutôt que d'écrire la marque sur le
        // mauvais élément.
        if (out.childNodes.length !== fragment.childCount) return super.serializeFragment(fragment, options, target);
        let index = 0;
        fragment.forEach(node => {
          const el = out.childNodes[index++];
          if (el.nodeType !== 1) return;
          suggestionMarksOf(node).forEach(m => el.setAttribute(cellMarkAttribute(m.type.name), cellMarkValue(m)));
        });
        if (!target) return out;
        target.appendChild(out);
        return target;
      }
    }

    // Contournement d'un piège de Tiptap 3.x : pour un appel direct (editor.commands.xxx(), pas une chaîne .chain()), Tiptap fournit un `dispatch`
    // sans effet et un `state.tr` chaînable toujours partagé pendant tout l'appel ; lui passer `editor.state` (l'état déjà figé) crée un tr orphelin
    // à chaque lecture, jeté en silence par ce dispatch. `editor.view.dispatch` est le vrai dispatch ProseMirror (synchrone) ;
    // `tr.setMeta('preventDispatch', true)` empêche Tiptap de dispatcher en plus son propre tr partagé resté vide. Nécessaire dès qu'une commande
    // doit appliquer plusieurs transactions dans l'ordre (bourrage, opération, nettoyage) et pas une seule mutation.
    function runGuardedLibCommand(libFn, editor, dispatch, tr) {
      if (!dispatch) return libFn(editor.state, undefined); // vérif de capacité (editor.can()) : pas de mutation
      if (tr) tr.setMeta('preventDispatch', true);
      return withEndGuard(editor, () => libFn(editor.state, editor.view.dispatch));
    }

    // Exécute `run()` avec, au besoin, le garde-fou du dernier nœud du document. Bug de la lib (cf. planning/feature-track-changes.md) :
    // applySuggestions, revertSuggestions, applySuggestion et revertSuggestion plantent avec « Cannot read properties of undefined (reading
    // 'nodeSize') » quand le nœud traité est le tout dernier du document (test de fusion avec le caractère suivant hors limites, `<=` au lieu de
    // `<`). Contournement : un paragraphe-tampon temporaire est inséré juste après, retiré ensuite s'il est resté vide ; les deux transactions de
    // bord sont hors historique (invisibles pour Annuler).
    function withEndGuard(editor, run) {
      if (!lastNodeCarriesSuggestionMark(editor.state)) return run();
      const guardMeta = t => t.setMeta(suggestChangesKey, { skip: true }).setMeta('addToHistory', false);
      editor.view.dispatch(guardMeta(editor.state.tr
        .insert(editor.state.doc.content.size, editor.state.schema.nodes.paragraph.create())));
      try {
        return run();
      } finally {
        const guard = editor.state.doc.lastChild;
        if (guard && guard.type.name === 'paragraph' && guard.content.size === 0 && guard.marks.length === 0) {
          editor.view.dispatch(guardMeta(editor.state.tr
            .delete(editor.state.doc.content.size - guard.nodeSize, editor.state.doc.content.size)));
        }
      }
    }

    // Le document sans ses marques « modification » : la seconde passe de applySuggestion/revertSuggestion (lib) résout toutes celles de la plage, de
    // n'importe quelle suggestion, sur des positions que la première passe a déjà décalées. Sur ce document-là elle n'a plus rien à toucher ; celles
    // de la suggestion visée se résolvent à part (resolveModifications). Les positions ne changent pas : une marque ne prend pas de place.
    function withoutModifications(doc, schema) {
      const strip = EditorState.create({ doc, schema }).tr;
      doc.descendants((node, pos) => {
        node.marks.forEach(mark => {
          if (mark.type.name !== 'modification') return;
          if (node.isText) strip.removeMark(pos, pos + node.nodeSize, mark); else strip.removeNodeMark(pos, mark);
        });
      });
      return strip.doc;
    }

    // Accepte ou refuse les suggestions `seedIds` et tout ce qui se résout avec elles (expandSuggestionIds) en une seule transaction : un seul
    // Annuler, et prosemirror-tables ne voit jamais un tableau à moitié résolu (il « répare » un tableau non rectangulaire en ajoutant des cases
    // vides). Une suggestion après l'autre par applySuggestion / revertSuggestion de la lib - que « Tout accepter » et « Tout refuser » appellent
    // aussi, sans id et par tranches -, sur une plage serrée et sur un état sans plugin (ses étapes sont rejouées sur la transaction finale, le
    // document restant celui d'origine). Rend faux, sans rien changer, quand rien n'est à résoudre ou quand une étape ne s'applique pas.
    function resolveSuggestionIds(editor, seedIds, accept) {
      const ids = expandSuggestionIds(editor.state.doc, seedIds);
      return withEndGuard(editor, () => {
        const { schema } = editor.state;
        const tr = editor.state.tr;
        const resolveOne = accept ? applySuggestion : revertSuggestion;
        try {
          ids.forEach(id => {
            const region = suggestionRegion(tr.doc, id);
            if (!region) return;
            let captured = null;
            resolveOne(id, region.from, region.to)(EditorState.create({ doc: withoutModifications(tr.doc, schema), schema }), t => { captured = t; });
            if (captured) captured.steps.forEach(step => tr.step(step));
          });
          resolveModifications(tr, ids, accept);
        } catch (e) {
          console.warn('[TrackChanges] suggestion non résolue :', e);
          return false;
        }
        if (!tr.docChanged) return false;
        editor.view.dispatch(tr.setMeta(suggestChangesKey, { skip: true }));
        return true;
      });
    }

    // Accepter / Refuser de la barre flottante : la ou les suggestions que la sélection touche (selectionSuggestionIds).
    function resolveAtSelection(editor, state, dispatch, tr, accept) {
      const ids = selectionSuggestionIds(state);
      if (!ids.length) return false;
      if (!dispatch) return true; // vérif de capacité (editor.can())
      if (tr) tr.setMeta('preventDispatch', true);
      return resolveSuggestionIds(editor, ids, accept);
    }

    // Atténue un coût quadratique confirmé dans la lib : applySuggestions et revertSuggestions sans plage traitent tout le document dans un seul
    // Transform partagé, au coût cumulatif. « Tout accepter » et « Tout refuser » sont donc découpés en transactions bornées à chunkSize marques,
    // toujours depuis la position 0 du document courant (jamais des positions mises en cache : sa taille change à chaque tranche). Mesuré : le coût
    // est multiplié par ~5 au lieu de ~10 pour 4 fois plus de marques. Contrepartie assumée : chaque tranche est sa propre transaction et son propre
    // pas d'historique (Ctrl+Z une fois par tranche pour tout défaire).
    function findFirstPendingMarks(state, chunkSize) {
      const found = [];
      state.doc.descendants((node, pos) => {
        if (found.length >= chunkSize) return false;
        const mark = node.marks.find(isSuggestionMark);
        if (mark) found.push({ from: pos, to: pos + node.nodeSize });
        return true;
      });
      return found;
    }
    // Les réglages en attente (un alignement, « Garder avec le suivant », le fond d'une cellule, la largeur d'une colonne) : les marques
    // `modification`, avec leurs ids tels que le document les écrit. Celles d'une case ou d'une ligne de tableau (isTableMod) suivent leur colonne ou
    // leur ligne tant que l'une d'elles attend : `withTableMods` les prend aussi, pour quand il n'en reste plus.
    function pendingAttributeIds(doc, withTableMods) {
      const ids = [];
      doc.descendants(node => {
        node.marks.forEach(mark => {
          if (mark.type.name === 'modification' && (withTableMods || !isTableMod(node, mark)) && mark.attrs.id != null && !ids.some(id => sameId(id, mark.attrs.id))) ids.push(mark.attrs.id);
        });
      });
      return ids;
    }
    // Reprend une tranche après l'autre jusqu'à ce qu'il ne reste plus de marque. Une tranche qui ne change rien ne mènerait nulle part :
    // revertSuggestion de la lib rend « rien à faire » avant de résoudre les modifications dès qu'elle n'a aucun texte à défaire, et la boucle
    // retrouverait la même marque à chaque tour (avec un seul réglage de paragraphe suivi, « Tout refuser » ne finirait jamais). `onStall` résout
    // alors ce que la lib laisse et rend vrai s'il a changé le document : la boucle reprend pour le reste. Sans `onStall`, ou s'il ne change rien non
    // plus, elle s'arrête : des marques peuvent rester, mais la page ne se fige jamais.
    function runChunkedLibCommand(rangeCommandFactory, editor, chunkSize, onStall) {
      while (true) {
        const marks = findFirstPendingMarks(editor.state, chunkSize);
        if (marks.length === 0) break;
        const before = editor.state.doc;
        const to = marks[marks.length - 1].to;
        runGuardedLibCommand((s, d) => rangeCommandFactory(0, to)(s, d), editor, editor.view.dispatch, undefined);
        if (editor.state.doc.eq(before) && !(onStall && onStall())) break;
      }
    }

    // Les réglages seuls (la lib n'a rien à défaire : un alignement, le fond d'une cellule, la largeur d'une colonne) se refusent comme « Refuser »
    // une modification : resolveSuggestionIds, une transaction, un seul Annuler. Ceux d'une case ou d'une ligne ne passent là que quand plus aucune
    // insertion ni suppression n'attend : avec une colonne ou une ligne suivie, ils s'en vont avec elle. Rend vrai si le document a changé.
    const refuseAttributes = editor => {
      const ids = pendingAttributeIds(editor.state.doc, !hasInsertionOrDeletion(editor.state.doc));
      return ids.length > 0 && resolveSuggestionIds(editor, ids, false);
    };

    // « Tout accepter » / « Tout refuser » par tranches de `chunkSize` marques : `resolveOne` est applySuggestion ou revertSuggestion, sans id
    // (toutes les suggestions de la plage). `onStall(editor)` : cf. runChunkedLibCommand.
    const chunkedCommand = (resolveOne, chunkSize, onStall) => ({ editor, dispatch, tr }) => {
      if (!dispatch) return true;
      tr.setMeta('preventDispatch', true);
      runChunkedLibCommand((from, to) => resolveOne(undefined, from, to), editor, chunkSize, onStall && (() => onStall(editor)));
      return true;
    };

    const SuggestChangesBridge = Extension.create({
      name: 'suggestChangesBridge',
      addProseMirrorPlugins() { return [suggestChanges()]; },
      addCommands() {
        return {
          toggleSuggestMode: () => ({ state, dispatch }) => toggleSuggestChanges(state, dispatch),
          acceptAllSuggestions: () => ({ editor, dispatch, tr }) => runGuardedLibCommand(applySuggestions, editor, dispatch, tr),
          rejectAllSuggestions: () => ({ editor, dispatch, tr }) => runGuardedLibCommand(revertSuggestions, editor, dispatch, tr),
          // chunkSize par défaut, choisi par mesure : assez petit pour rester loin du coût quadratique, assez grand pour ne pas multiplier les pas
          // d'historique sur un document de taille normale.
          acceptAllSuggestionsChunked: (chunkSize = 200) => chunkedCommand(applySuggestion, chunkSize),
          rejectAllSuggestionsChunked: (chunkSize = 200) => chunkedCommand(revertSuggestion, chunkSize, refuseAttributes),
          // Une modification à la fois (barre flottante) : celle que la sélection touche, avec tout ce qui s'y résout (resolveSuggestionIds). Faux
          // sans rien changer quand la sélection n'en touche aucune.
          acceptSuggestionsAtSelection: () => ({ editor, dispatch, tr, state }) => resolveAtSelection(editor, state, dispatch, tr, true),
          rejectSuggestionsAtSelection: () => ({ editor, dispatch, tr, state }) => resolveAtSelection(editor, state, dispatch, tr, false),
          // Remplace tout le document sans jamais passer par transformToSuggestionTransaction, quel que soit l'état du suivi au moment de l'appel :
          // un setContent() normal pendant que le suivi est actif empile l'ancien et le nouveau contenu dans des <del>/<ins> englobants au lieu de
          // remplacer proprement (cf. planning/feature-track-changes.md). C'est le remplacement qu'utilise Editor.setHTML() (chargement d'un modèle,
          // rechargement après un conflit d'enregistrement automatique).
          // `preventUpdate: true` (en plus de `skip` et `addToHistory: false`) : Editor#dispatchTransaction de @tiptap/core lit ce meta avant
          // d'émettre 'update'. Il reproduit `editor.commands.setContent(html, { emitUpdate: false })` ; un dispatch direct comme celui-ci n'étouffe
          // pas l'événement sans ce meta.
          loadTrackedDocument: html => ({ editor, dispatch, tr }) => {
            if (!dispatch) return true;
            tr.setMeta('preventDispatch', true);
            // Document inerte, nettoyé, jamais sérialisé : un <div> du widget, même détaché, ferait charger ses images (et courir leurs onerror) au
            // premier innerHTML.
            const docNode = PMDOMParser.fromSchema(editor.schema).parse(HtmlSanitize.parseInert(html));
            editor.view.dispatch(
              editor.state.tr
                .setMeta(suggestChangesKey, { skip: true })
                .setMeta('addToHistory', false)
                .setMeta('preventUpdate', true)
                .replaceWith(0, editor.state.doc.content.size, docNode.content),
            );
            return true;
          },
        };
      },
      dispatchTransaction({ transaction, next }) {
        const editor = this.editor;
        // Garde alignée sur withSuggestChanges() (code source de la lib) : sans le test `'skip' in ...`, « Tout accepter » et « Tout refuser » (qui
        // posent ce meta pour dire « ceci est déjà le résultat, ne le re-transforme pas ») seraient réinterceptées et transformées en nouvelles
        // suggestions.
        const skipMeta = transaction.getMeta(suggestChangesKey);
        const enabled = isSuggestChangesEnabled(editor.state)
          && !transaction.getMeta('history$')
          && !(skipMeta && 'skip' in skipMeta);
        if (!enabled) { next(transaction); return; }
        try {
          next(transformToSuggestionTransaction(transaction, editor.state));
        } catch (e) {
          console.warn('[TrackChanges] transaction refusée (suppression de bloc entier non prise en charge par la lib) :', e);
        }
      },
    });

    // Rétablit le suivi après un rechargement de modèle : EditorNodes.createClearHistoryExtension (js/editor-nodes.js), appelée par Editor.setHTML()
    // après chaque chargement, reconstruit l'état ProseMirror par `EditorState.create({..., plugins: view.state.plugins})`, et `EditorState.create`
    // appelle toujours `init()` sur chaque plugin, même inchangé (contrairement à `state.reconfigure(...)`, qui préserve l'état des plugins
    // inchangés). Le suivi est un booléen de plugin, pas une donnée du document : il retombait à « désactivé » à chaque changement de modèle, y
    // compris en rechargeant le même.
    // Dispatch réel (comme runGuardedLibCommand et loadTrackedDocument ci-dessus) plutôt que la commande `toggleSuggestMode` : appelée en direct,
    // elle retomberait sur le piège du dispatch sans effet décrit plus haut.
    function restoreSuggestModeIfNeeded(editor, wasOn) {
      if (wasOn && !isSuggestChangesEnabled(editor.state)) toggleSuggestChanges(editor.state, editor.view.dispatch);
    }

    return {
      InsertionMark, DeletionMark, ModificationMark, SuggestChangesBridge,
      isSuggestModeOn: state => isSuggestChangesEnabled(state),
      restoreSuggestModeIfNeeded,
      // Bascule du suivi hors de la barre (une grille l'éteint à l'ouverture) : même appel direct de la lib que restoreSuggestModeIfNeeded, jamais la
      // commande.
      toggleSuggestMode: editor => toggleSuggestChanges(editor.state, editor.view.dispatch),
      // À appeler une fois l'éditeur créé : DOMSerializer.fromSchema() relit schema.cached.domSerializer, tous les sérialiseurs du schéma passent
      // donc par celui-ci.
      installSerializer(schema) {
        schema.cached.domSerializer = new TrackingDOMSerializer(PMDOMSerializer.nodesFromSchema(schema), PMDOMSerializer.marksFromSchema(schema));
      },
    };
  }

  return {
    extendForTracking, hasPendingSuggestions, computeMetadata, createExtensions, skipTracking, isSkipped, selectionSuggestionIds, acceptedView,
  };
})();
