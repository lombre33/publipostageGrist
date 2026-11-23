// « Puce, numéro ou case » ligne par ligne : le genre d'une ligne de liste se choisit pour cette ligne seule, pas pour toute la liste qui la porte (demande du 23/11 : « dans une liste à puces, j'indente, je
// voudrais basculer l'indentation en cours en liste numérotée ou en cases à cocher, choisir ma puce à chaque ligne et les croiser entre elles »).
//
// Un genre est ce que dit la puce : « bullet » (puces), « ordered » (numéros), « task » (cases à cocher). Une liste de l'éditeur n'a qu'un genre (`bulletList`, `orderedList`, `taskList`), et ses points sont de la
// forme qui va avec (`listItem` pour les puces et les numéros, `taskItem` pour les cases) : changer la puce d'UNE ligne revient donc à couper sa liste en trois (les lignes d'avant, la ligne, les lignes d'après), la
// ligne du milieu devenant une liste de l'autre genre au MÊME niveau. Les sous-listes d'une ligne la suivent sans changer. Quand la ligne change pour le genre de la liste voisine (et son style), les deux listes se
// recollent : repasser une ligne en puce au milieu de puces rend la liste d'origine.
//
// Avant : « Liste numérotée » sur une sous-ligne numérotait toute la sous-liste d'un coup (le `toggleList` de TipTap change le type de la liste entière), et « Cases à cocher » sortait la ligne de ses retraits
// (`clearNodes` + `wrapInList` : la ligne remontait au premier niveau et la sous-liste était coupée en morceaux).
//
// `convert` est une commande de TipTap (elle écrit dans la transaction qu'on lui donne, en un seul pas d'historique) : elle rend faux, sans rien écrire, quand ce n'est pas son travail - la sélection touche du texte
// qui n'est pas dans une liste, ou toutes ses lignes ont déjà le genre demandé (sans style à régler) : l'appelant fait alors ce qu'il faisait (poser la liste, la retirer, ou ne régler que son style).
const ListKind = (function () {
  const KIND_OF_LIST = { bulletList: 'bullet', orderedList: 'ordered', taskList: 'task' };
  const LIST_OF_KIND = { bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' };
  const ITEM_OF_KIND = { bullet: 'listItem', ordered: 'listItem', task: 'taskItem' };
  const isItem = node => node.type.name === 'listItem' || node.type.name === 'taskItem';
  const isList = node => !!node && Object.prototype.hasOwnProperty.call(KIND_OF_LIST, node.type.name);
  const kindOf = node => (isList(node) ? KIND_OF_LIST[node.type.name] : null);

  // La liste la plus proche d'une position (la liste de la ligne du curseur, jamais celle d'un parent) : { node, depth, kind }, null hors d'une liste.
  function innermost($pos) {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (isList(node)) return { node, depth, kind: KIND_OF_LIST[node.type.name] };
    }
    return null;
  }

  // Les lignes touchées par la sélection : leurs points de liste ({ pos, index, listPos } : où il commence, son rang dans sa liste, où commence sa liste), dans l'ordre du texte. `plain` : la sélection touche
  // aussi du texte qui n'est pas directement une ligne de liste (un paragraphe seul, un titre, une case de tableau dans un point) : ce n'est plus le cas d'une liste que l'on change de genre.
  function linesOf(doc, selection) {
    const found = new Map();
    let plain = false;
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (!node.isTextblock) return true;
      const $pos = doc.resolve(pos);
      const owner = $pos.depth > 0 ? $pos.parent : null;
      if (!owner || !isItem(owner) || $pos.depth < 2 || !isList($pos.node($pos.depth - 1))) { plain = true; return false; }
      const itemPos = $pos.before($pos.depth);
      if (!found.has(itemPos)) found.set(itemPos, { pos: itemPos, index: $pos.index($pos.depth - 1), listPos: $pos.before($pos.depth - 1) });
      return false;
    });
    return { lines: Array.from(found.values()), plain };
  }

  // La sélection retenue par le rang du bloc de texte et le décalage dedans : changer le genre d'une ligne ne touche ni le texte ni l'ordre des blocs, alors que les positions bougent (la liste coupée en gagne
  // deux par coupure). Seule une sélection de texte est suivie ; une autre (un objet, des cases) garde ce que la transaction en fait.
  function textblockIndex(doc, $pos) {
    const own = $pos.before();
    let rank = 0;
    doc.nodesBetween(0, own, (node, pos) => {
      if (pos >= own) return false;
      if (node.isTextblock) { rank += 1; return false; }
      return true;
    });
    return { rank, offset: $pos.parentOffset };
  }
  function capture(selection) {
    // Une sélection de texte est la seule à porter `$cursor` (nul quand elle n'est pas un curseur) : le nom de sa classe, lui, ne survit pas à une bibliothèque réduite.
    if (!selection || !('$cursor' in selection) || !selection.$anchor.parent.isTextblock || !selection.$head.parent.isTextblock) return null;
    return { anchor: textblockIndex(selection.$anchor.doc, selection.$anchor), head: textblockIndex(selection.$head.doc, selection.$head) };
  }
  function positionOf(doc, mark) {
    let rank = 0;
    let found = null;
    doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (!node.isTextblock) return true;
      if (rank === mark.rank) found = pos + 1 + Math.min(mark.offset, node.content.size);
      rank += 1;
      return false;
    });
    return found;
  }

  // Le même point dans la forme du genre demandé : le même contenu, les réglages qu'ont en commun les deux formes (animation, ...), « non coché » pour une case neuve. Null quand le contenu ne tient pas dans la forme
  // (un point de puce qui porte un tableau ou une citation ne devient pas une case) : la ligne garde alors sa puce.
  function itemAs(item, kind, schema) {
    const type = schema.nodes[ITEM_OF_KIND[kind]];
    if (item.type === type) return item;
    if (!type.validContent(item.content)) return null;
    const attrs = Object.assign({}, type.defaultAttrs);
    Object.keys(attrs).forEach((name) => { if (name !== 'checked' && Object.prototype.hasOwnProperty.call(item.attrs, name)) attrs[name] = item.attrs[name]; });
    return type.create(attrs, item.content, item.marks);
  }

  // Les réglages de la liste neuve d'un genre : ceux de la liste voisine du même genre quand il y en a une (la ligne qui s'y glisse la rejoint avec le même style), sinon les réglages d'origine du genre ; le sens
  // d'écriture de la liste d'où vient la ligne les suit toujours ; `style` (ce que dit le bouton cliqué) passe en dernier. `neighbours` : les listes qui touchent le morceau, avant lui et après (aucune au milieu).
  function listAttrs(schema, kind, from, neighbours, style) {
    const type = schema.nodes[LIST_OF_KIND[kind]];
    const attrs = Object.assign({}, type.defaultAttrs);
    const same = neighbours.find(node => node && node.type === type);
    if (same) Object.assign(attrs, same.attrs);
    if (Object.prototype.hasOwnProperty.call(attrs, 'dir')) attrs.dir = from.attrs.dir;
    Object.keys(style || {}).forEach((name) => { if (Object.prototype.hasOwnProperty.call(attrs, name)) attrs[name] = style[name]; });
    return attrs;
  }
  const sameLook = (a, b) => !!a && !!b && a.type === b.type && JSON.stringify(a.attrs) === JSON.stringify(b.attrs);
  function joinAt(tr, pos) {
    const $pos = tr.doc.resolve(pos);
    if (isList($pos.nodeBefore) && sameLook($pos.nodeBefore, $pos.nodeAfter)) tr.join(pos);
  }

  // Une liste dont certains points (leur rang, dans `ranks`) passent au genre `kind` : la liste est remplacée par une suite de listes, un genre par morceau, que les listes voisines du même genre et du même style
  // rejoignent. Vrai quand quelque chose a changé.
  function rebuild(tr, listPos, ranks, kind, style) {
    const schema = tr.doc.type.schema;
    const list = tr.doc.nodeAt(listPos);
    const here = KIND_OF_LIST[list.type.name];
    if (here === kind) {
      // Les lignes ont déjà ce genre : seul le style bouge, pour la liste entière (le bouton d'un style règle une liste, pas une ligne).
      if (!style) return false;
      const attrs = Object.assign({}, list.attrs);
      let changed = false;
      Object.keys(style).forEach((name) => { if (Object.prototype.hasOwnProperty.call(attrs, name) && attrs[name] !== style[name]) { attrs[name] = style[name]; changed = true; } });
      if (changed) tr.setNodeMarkup(listPos, undefined, attrs);
      return changed;
    }
    const before = tr.doc.resolve(listPos).nodeBefore;
    const after = tr.doc.resolve(listPos + list.nodeSize).nodeAfter;
    const runs = [];
    let converted = false;
    list.forEach((item, offset, index) => {
      let target = here;
      let node = item;
      if (ranks.has(index)) {
        const next = itemAs(item, kind, schema);
        if (next) { target = kind; node = next; converted = true; }
      }
      const last = runs[runs.length - 1];
      if (last && last.kind === target) last.items.push(node); else runs.push({ kind: target, items: [node] });
    });
    if (!converted) return false;
    // Seul le premier morceau touche la liste d'avant, seul le dernier celle d'après.
    const lists = runs.map((run, rank) => (run.kind === here
      ? list.type.create(list.attrs, run.items)
      : schema.nodes[LIST_OF_KIND[run.kind]].create(listAttrs(schema, run.kind, list, [rank === 0 ? before : null, rank === runs.length - 1 ? after : null], style), run.items)));
    const size = lists.reduce((sum, node) => sum + node.nodeSize, 0);
    tr.replaceWith(listPos, listPos + list.nodeSize, lists);
    // Les raccords : d'abord celui de la fin (le début ne bouge pas), puis celui du début.
    joinAt(tr, listPos + size);
    joinAt(tr, listPos);
    return true;
  }

  // Passe les lignes de la sélection au genre `kind` (« bullet », « ordered », « task »), avec `style` pour la liste neuve ({ numberStyle: 'alpha' }, { bulletStyle: 'square' }, { taskListStyle: 'classic' }). Vrai
  // quand la transaction a été écrite ; faux, sans rien écrire, quand la sélection n'est pas faite que de lignes de liste ou quand toutes ont déjà ce genre (et que `style` n'a rien à changer).
  function convert(tr, kind, style) {
    if (!LIST_OF_KIND[kind]) return false;
    const { lines, plain } = linesOf(tr.doc, tr.selection);
    if (plain || !lines.length) return false;
    // Toutes les lignes ont déjà ce genre : le bouton fait ce qu'il faisait (retirer la liste, ou ne régler que son style).
    if (!style && lines.every(({ listPos }) => kindOf(tr.doc.nodeAt(listPos)) === kind)) return false;
    const groups = new Map();
    lines.forEach(({ index, listPos }) => { if (!groups.has(listPos)) groups.set(listPos, new Set()); groups.get(listPos).add(index); });
    const kept = capture(tr.selection);
    let changed = false;
    // De la dernière liste à la première : changer une liste ne déplace que ce qui la suit, et une sous-liste (plus loin dans le texte que la ligne qui la porte) est traitée avant sa liste mère.
    Array.from(groups.keys()).sort((a, b) => b - a).forEach((listPos) => { if (rebuild(tr, listPos, groups.get(listPos), kind, style)) changed = true; });
    // Rien n'a changé alors que des lignes avaient un autre genre : leur contenu ne tient pas dans la forme demandée (un point de puce qui porte un tableau ne devient pas une case). Le geste est pris, sans effet : la
    // commande de TipTap, qui sortirait ces lignes de leur liste, n'a pas à s'en mêler.
    return changed ? finish(tr, kept) : lines.some(({ listPos }) => kindOf(tr.doc.nodeAt(listPos)) !== kind);
  }
  // Rend la sélection retenue (`capture`) au texte d'après et sort la transaction du suivi : un changement de genre ou de niveau ne touche pas au texte, il n'est pas à suivre comme une suppression suivie
  // d'une insertion de toute la liste.
  function finish(tr, kept) {
    if (kept) {
      const anchor = positionOf(tr.doc, kept.anchor);
      const head = positionOf(tr.doc, kept.head);
      if (anchor !== null && head !== null) tr.setSelection(tr.selection.constructor.create(tr.doc, anchor, head));
    }
    if (typeof TrackChanges !== 'undefined' && TrackChanges.skipTracking) TrackChanges.skipTracking(tr);
    return true;
  }

  // Le niveau d'une ligne : Tab la glisse sous la ligne qui la précède, Maj+Tab la remonte, et la ligne GARDE son genre (une ligne numérotée glissée sous une puce reste numérotée). Les commandes de TipTap font cela
  // dans une seule liste ; ici la ligne a souvent sa propre liste (une puce, puis une ligne numérotée, puis une puce : trois listes de même niveau), que `sinkListItem` ne sait pas traverser.
  // Le point unique de la sélection : la profondeur de son point de liste, ou null quand la sélection en touche plusieurs ou aucun (les commandes de TipTap traitent alors la sélection entière).
  function soleItem(selection) {
    const { $from, $to } = selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if (!isItem($from.node(depth))) continue;
      return depth > 1 && isList($from.node(depth - 1)) && $to.depth >= depth && $to.start(depth) === $from.start(depth) ? depth : null;
    }
    return null;
  }

  // Tab sur la première ligne d'une liste, quand la liste d'avant (de n'importe quel genre) est au même niveau : la ligne et ses sous-listes passent sous le dernier point de cette liste, dans une sous-liste de son
  // genre à elle (la dernière sous-liste de ce point si elle est du même genre et du même style, une neuve sinon). Faux, sans rien écrire, quand il n'y a pas de telle liste (la première ligne du texte ne bouge pas).
  // Les lignes d'une même liste, elles, restent à `sinkListItem`.
  function sink(tr) {
    const depth = soleItem(tr.selection);
    if (depth === null) return false;
    const { $from } = tr.selection;
    if ($from.index(depth - 1) !== 0) return false;
    const parent = $from.node(depth - 2);
    const at = $from.index(depth - 2);
    const before = at > 0 ? parent.child(at - 1) : null;
    if (!isList(before)) return false;
    const list = $from.node(depth - 1);
    const item = $from.node(depth);
    const host = before.lastChild;
    const last = host.lastChild;
    const content = isList(last) && sameLook(last, list)
      ? host.content.replaceChild(host.childCount - 1, last.copy(last.content.addToEnd(item)))
      : host.content.addToEnd(list.type.create(list.attrs, [item]));
    if (!host.type.validContent(content)) return false;
    const kept = capture(tr.selection);
    const grown = before.copy(before.content.replaceChild(before.childCount - 1, host.copy(content)));
    const rest = list.childCount > 1 ? list.copy(list.content.cutByIndex(1, list.childCount)) : null;
    const listPos = $from.before(depth - 1);
    tr.replaceWith(listPos - before.nodeSize, listPos + list.nodeSize, rest ? [grown, rest] : [grown]);
    return finish(tr, kept);
  }
  // Une ligne sous une ligne d'un AUTRE genre de liste (une case sous une puce, un numéro sous une case) : Maj+Tab la remonte au niveau de sa ligne mère, juste après elle, dans une liste de son genre à elle ; les
  // lignes qui la suivaient dans sa sous-liste passent sous elle, comme ailleurs. Faux, sans rien écrire, quand la liste de la ligne mère est du même genre (la commande de TipTap fait alors la même chose) ou quand
  // la ligne n'est pas sous une autre ligne (elle sort de sa liste : la commande de TipTap).
  function lift(tr) {
    const depth = soleItem(tr.selection);
    if (depth === null || depth < 4) return false;
    const { $from } = tr.selection;
    const host = $from.node(depth - 2);
    const outer = $from.node(depth - 3);
    const list = $from.node(depth - 1);
    if (!isItem(host) || !isList(outer) || outer.type === list.type) return false;
    const item = $from.node(depth);
    const rank = $from.index(depth - 1);
    const followers = [];
    for (let i = rank + 1; i < list.childCount; i += 1) followers.push(list.child(i));
    const moved = followers.length ? item.type.create(item.attrs, item.content.addToEnd(list.type.create(list.attrs, followers)), item.marks) : item;
    if (!item.type.validContent(moved.content)) return false;
    const stay = [];
    host.forEach((child, offset, index) => {
      if (index !== $from.index(depth - 2)) { stay.push(child); return; }
      if (rank > 0) stay.push(list.type.create(list.attrs, Array.from({ length: rank }, (v, i) => list.child(i))));
    });
    const place = $from.index(depth - 3);
    const first = [];
    const second = [];
    outer.forEach((child, offset, index) => {
      if (index < place) first.push(child); else if (index > place) second.push(child);
    });
    first.push(host.type.create(host.attrs, stay, host.marks));
    const kept = capture(tr.selection);
    const lists = [outer.type.create(outer.attrs, first), list.type.create(list.attrs, [moved])];
    if (second.length) lists.push(outer.type.create(outer.attrs, second));
    const outerPos = $from.before(depth - 3);
    tr.replaceWith(outerPos, outerPos + outer.nodeSize, lists);
    if (!second.length) joinAt(tr, outerPos + lists[0].nodeSize + lists[1].nodeSize);
    return finish(tr, kept);
  }

  // Les touches Ctrl+Maj+8, Ctrl+Maj+7 et Ctrl+Maj+9 (puces, numéros, cases : js/shortcuts.js, `native`) font ce que font les boutons : la ligne du curseur change de genre pour elle seule. L'extension est rangée
  // après celles des listes, donc essayée avant elles (TipTap essaie la dernière extension rangée en premier) ; quand la ligne a déjà le genre, ou hors d'une liste, ou sur une sélection de cases de tableau
  // (EditorCore.toggleList la traite case par case), la touche passe à la commande de TipTap, qui pose ou retire la liste comme avant.
  function createExtension(Extension) {
    const key = kind => ({ editor }) => editor.chain().command(({ tr }) => (tr.selection.$anchorCell ? false : convert(tr, kind))).run();
    return Extension.create({
      name: 'listKind',
      addKeyboardShortcuts() {
        return { 'Mod-Shift-7': key('ordered'), 'Mod-Shift-8': key('bullet'), 'Mod-Shift-9': key('task') };
      },
    });
  }

  return { KIND_OF_LIST, LIST_OF_KIND, kindOf, innermost, linesOf, convert, sink, lift, createExtension };
})();
