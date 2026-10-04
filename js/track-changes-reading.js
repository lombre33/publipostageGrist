// Suivi des modifications : la Lecture et les exports, le document comme si tout était accepté (acceptedView). Script classique, chargé après js/track-changes-core.js.
const TrackChangesReading = (function () {
  const { MARK_NAMES, cellMarkAttribute } = TrackChangesCore;

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
  // La suppression qui entoure `leaf` sans sortir de `block` ; null quand rien ne l'entoure.
  function deletionAround(leaf, block) {
    for (let el = leaf.nodeType === 1 ? leaf : leaf.parentNode; el && el !== block; el = el.parentNode) { if (isDeletion(el)) return el; }
    return null;
  }
  // Le premier contenu après `block` : celui du bloc suivant, ou d'un niveau au-dessus quand il n'y en a plus, puis le premier contenu de chaque élément en dessous jusqu'à une
  // suppression ou une feuille ; null au bout de `root`.
  function firstContentAfter(block, root) {
    const nextContent = node => {
      let sibling = node.nextSibling;
      while (sibling && isFiller(sibling, node.parentNode)) sibling = sibling.nextSibling;
      return sibling;
    };
    let next = null;
    let from = block;
    while (from && from !== root && !(next = nextContent(from))) from = from.parentNode;
    while (next && !isDeletion(next) && next.firstChild) next = contentChildren(next)[0] || null;
    return next;
  }
  // La suppression qui prolonge `del` (même id) : celle qui suit dans le bloc, ou, en fin de bloc, celle qui ouvre le bloc suivant - le tout premier
  // contenu de ce bloc, comme le fait findSuggestionMarkEnd de la lib : un bloc vide ou qui commence par autre chose l'arrête.
  function followingDeletion(root, del) {
    const block = blockOf(del, root);
    const leaf = leafAfter(del, block);
    const next = leaf ? deletionAround(leaf, block) : firstContentAfter(block, root);
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

  return { acceptedView };
})();
