// Tourner une page d'un document, ou le document entier, depuis le menu du bouton Page (js/orientation-toggle.js ; demande du 22/10 : « le bouton [aurait] un mini menu pour savoir si le choix s'applique à tout le
// document ou à la page sélectionnée »). Le document dit lui-même le sens de chaque page (js/page-sections.js) : un saut de page qui porte `data-page-orientation` donne ce sens aux pages qui le suivent, la
// première page a celui des marges (PageLayout.getOrientation). Ce module écrit ces sauts de page ; il ne dessine rien (js/page-section-view.js montre le résultat) et ne touche ni aux marges ni au format.
//  - « Tout le document » : le sens des marges devient le sens choisi (c'est à l'appelant de le poser) et aucun saut de page ne tourne plus rien ; ceux que ce menu avait posés (`added`) sont retirés. Un
//    document qui n'a aucun saut tourné ni posé par le menu n'est pas touché : son HTML est celui d'avant.
//  - « Cette page » : la page du curseur (ou les pages que la sélection touche) prend le sens choisi, les autres gardent le leur. Une page change de sens par le saut de page qui l'ouvre, et la page qui la
//    suit, qui en dépendait, reçoit son propre sens de la même façon. Là où la page commence ou finit par une coupure automatique, un saut de page `added` est posé (son repère, « Saut de page · la suite
//    en paysage », le dit à l'écran) ; il est retiré dès qu'il ne tourne plus rien, là où un saut posé à la main reste. Le plan se calcule sur les coupures de la dernière pagination, donc avec l'Aperçu de la
//    page ; une coupure au milieu d'un tableau ou d'une zone à deux colonnes n'est pas entre deux blocs, aucun saut ne peut s'y poser : la page ne se tourne pas seule tant qu'elle y commence ou y finit.
// Le plan (`plan`, `documentEdits`) ne lit ni le DOM ni ProseMirror : ce sont des listes de coupures et de blocs, que lisent `inspect` et `readCuts` et que `apply` écrit en UNE transaction (un seul Ctrl+Z pour les
// sauts ; le sens des marges, lui, n'est dans aucun historique, comme tout réglage de la page).
const PageSenseEdit = (function () {
  const PORTRAIT = PageSections.PORTRAIT;
  const LANDSCAPE = PageSections.LANDSCAPE;
  const normal = sense => (sense === LANDSCAPE ? LANDSCAPE : PORTRAIT);
  const BREAK_NODE = 'pageBreak';

  // --- Le plan ---
  // Les coupures du document, dans l'ordre : `cuts[k - 1]` ouvre la page `k` (la page 0 n'en a pas). Chacune : { kind, block, turn, added }
  //  - 'marker' : un saut de page (le bloc `block`) ; `turn` : son sens (nul s'il n'en dit pas), `added` : le menu l'a posé ;
  //  - 'auto'   : une coupure automatique entre deux blocs, après le bloc `block` : un saut de page peut s'y poser ;
  //  - 'inner'  : une coupure au milieu d'un tableau ou d'une zone : rien ne peut s'y poser.
  // Le sens de chaque page : celui des marges, puis celui du dernier saut tourné qui la précède (une coupure qui ne tourne rien garde le sens de la page qui finit).
  function sensesOfPages(base, cuts) {
    const senses = [normal(base)];
    cuts.forEach(cut => senses.push(cut.kind === 'marker' && cut.turn ? normal(cut.turn) : senses[senses.length - 1]));
    return senses;
  }

  // Ce qu'il faut écrire pour que les pages `first` à `last` (comprises) prennent le sens `sense` et que toutes les autres gardent le leur :
  //  { ok: true, base, edits, changed } ou { ok: false, reason: 'inner', page } quand un saut devrait se poser dans un tableau ou une zone.
  // `base` : le sens de la première page ; `edits` : { type: 'orient', block, orientation } (le saut dit ce sens, ou rien si nul), { type: 'remove', block } (un saut posé par le menu qui ne tourne plus rien) et
  // { type: 'insert', after, orientation } (un saut posé après le bloc `after`). Chaque coupure ne dit un sens que si la page qu'elle ouvre n'a pas celui de la page qui finit : un sens redondant est retiré.
  function plan(base, cuts, first, last, sense) {
    const was = sensesOfPages(base, cuts);
    const wanted = was.map((old, page) => (page >= first && page <= last ? normal(sense) : old));
    const edits = [];
    for (let page = 1; page < wanted.length; page++) {
      const cut = cuts[page - 1];
      const needed = wanted[page] !== wanted[page - 1] ? wanted[page] : null;
      if (cut.kind === 'inner') {
        if (needed) return { ok: false, reason: 'inner', page };
      } else if (cut.kind === 'marker') {
        const current = cut.turn ? normal(cut.turn) : null;
        if (needed === current) continue;
        edits.push(!needed && cut.added ? { type: 'remove', block: cut.block } : { type: 'orient', block: cut.block, orientation: needed });
      } else if (needed) {
        edits.push({ type: 'insert', after: cut.block, orientation: needed });
      }
    }
    return { ok: true, base: wanted[0], edits, changed: wanted[0] !== normal(base) || edits.length > 0 };
  }

  // « Tout le document » : aucun saut ne tourne plus rien, ceux que le menu avait posés disparaissent. `blocks` : les blocs de premier niveau, { node } (un nœud ProseMirror).
  const isBreakNode = node => node.type.name === BREAK_NODE;
  function documentEdits(blocks) {
    const edits = [];
    blocks.forEach((block, index) => {
      if (!isBreakNode(block.node)) return;
      if (block.node.attrs.added) edits.push({ type: 'remove', block: index });
      else if (block.node.attrs.orientation) edits.push({ type: 'orient', block: index, orientation: null });
    });
    return edits;
  }

  // --- Ce que l'éditeur dit ---
  // Les blocs de premier niveau du document : { node, pos, el } (`el` : son élément du DOM, de quoi retrouver la coupure de la pagination qui tombe après lui).
  function blocksOf(editor) {
    const blocks = [];
    editor.state.doc.forEach((node, pos) => blocks.push({ node, pos, el: editor.view.nodeDOM(pos) }));
    return blocks;
  }

  // Les coupures de la dernière pagination, dans le vocabulaire du plan ; null quand elle n'est plus celle du document (un bloc de coupure n'y est plus).
  function readCuts(blocks) {
    const indexOf = new Map(blocks.map((block, index) => [block.el, index]));
    const cuts = [];
    for (const brk of HeaderFooterPreview.pageBreaks()) {
      const index = indexOf.get(brk.afterEl);
      if (index == null) return null;
      const node = blocks[index].node;
      if (brk.inner || (brk.forced && !isBreakNode(node))) cuts.push({ kind: 'inner', block: index });
      else if (isBreakNode(node)) cuts.push({ kind: 'marker', block: index, turn: node.attrs.orientation || null, added: !!node.attrs.added });
      else cuts.push({ kind: 'auto', block: index });
    }
    return cuts;
  }

  // L'élément du DOM où tombe la position `pos` : la ligne de tableau qui la contient (c'est elle qui dit la page d'un tableau coupé entre deux lignes), sinon le bloc de premier niveau.
  function elementAt(editor, pos) {
    const { doc } = editor.state;
    const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === 'tableRow') return editor.view.nodeDOM($pos.before(depth));
    }
    if ($pos.depth >= 1) return editor.view.nodeDOM($pos.before(1));
    if ($pos.nodeAfter) return editor.view.nodeDOM($pos.pos);
    return $pos.nodeBefore ? editor.view.nodeDOM($pos.pos - $pos.nodeBefore.nodeSize) : null;
  }

  function turnedIn(doc) {
    let turned = false;
    doc.forEach(node => { if (isBreakNode(node) && (node.attrs.orientation || node.attrs.added)) turned = true; });
    return turned;
  }

  const unavailable = reason => ({ reason, first: null, last: null, count: 0, sense: null, blocked: { portrait: null, landscape: null } });

  // « Cette page » : où est le curseur, de quel sens sont les pages que la sélection touche, et pour chaque sens si le plan est possible. `reason` : pourquoi le menu ne peut pas désigner de page -
  // 'reading' (l'éditeur est masqué par la Lecture), 'hf' (l'en-tête ou le pied est en cours d'écriture : l'éditeur ne montre pas le document), 'preview' (sans l'Aperçu de la page, il n'y a pas de pages),
  // 'unknown' (la pagination n'est pas celle du document, ou le curseur est dans une zone à deux colonnes que la page coupe : sa page dépend de la colonne).
  function inspectPages(editor) {
    if (!editor.view.dom.getClientRects().length) return unavailable('reading');
    const container = document.getElementById('editor-container');
    if (!container || !container.classList.contains('a4-preview')) return unavailable('preview');
    const blocks = blocksOf(editor);
    const cuts = readCuts(blocks);
    if (!cuts) return unavailable('unknown');
    // Toute la sélection, pas seulement sa tête : des cellules choisies d'un tableau sont autant de plages (la première n'est que la cellule d'arrivée).
    const { ranges } = editor.state.selection;
    const from = ranges.reduce((least, range) => Math.min(least, range.$from.pos), Infinity);
    const to = ranges.reduce((most, range) => Math.max(most, range.$to.pos), 0);
    const startPage = HeaderFooterPreview.pageIndexOf(elementAt(editor, from));
    const endPage = HeaderFooterPreview.pageIndexOf(elementAt(editor, to));
    if (startPage == null || endPage == null) return unavailable('unknown');
    const first = Math.min(startPage, endPage);
    const last = Math.max(startPage, endPage);
    const base = PageLayout.getOrientation();
    const senses = sensesOfPages(base, cuts).slice(first, last + 1);
    const sense = senses.every(one => one === senses[0]) ? senses[0] : null;
    const blocked = {};
    [PORTRAIT, LANDSCAPE].forEach(wanted => {
      const result = plan(base, cuts, first, last, wanted);
      blocked[wanted] = result.ok ? null : result.reason;
    });
    return { reason: null, first, last, count: last - first + 1, sense, blocked, base, cuts, blocks };
  }

  // L'état du document pour le menu : { hf, turned, mixed, pages }. `turned` : il porte des sauts qui tournent des pages ou que le menu a posés ; `mixed` : ses pages n'ont pas toutes le même sens. En
  // écriture d'en-tête ou de pied, l'éditeur montre cette zone et le document attend à côté (HeaderFooterPreview.mainDocumentHtml) : on ne lit que s'il porte de tels sauts.
  function inspect(editor) {
    const state = { hf: false, turned: false, mixed: false, pages: unavailable('reading') };
    if (!editor || !editor.view) return state;
    const mainHtml = HeaderFooterPreview.mainDocumentHtml();
    if (mainHtml != null) {
      state.hf = true;
      state.turned = PageSections.hasSenses(mainHtml) || mainHtml.indexOf(PageSections.ADDED_ATTR) !== -1;
      state.mixed = state.turned;
      state.pages = unavailable('hf');
      return state;
    }
    const doc = editor.state.doc;
    state.turned = turnedIn(doc);
    state.mixed = state.turned && PageSectionView.isMixed(doc);
    state.pages = inspectPages(editor);
    return state;
  }

  // --- L'écriture ---
  function apply(editor, blocks, edits) {
    if (!edits.length) return;
    const { state, view } = editor;
    // Le menu règle la page, il n'écrit pas dans le texte : le suivi des modifications ne le compte pas (comme la grille des images en calque après un changement de sens des marges).
    const tr = TrackChanges.skipTracking(state.tr);
    const breakNode = state.schema.nodes[BREAK_NODE];
    const endOf = block => block.pos + block.node.nodeSize;
    const where = edit => (edit.type === 'insert' ? endOf(blocks[edit.after]) : blocks[edit.block].pos);
    // Du bas du document vers le haut, pour qu'une position déjà calculée reste la bonne ; à position égale, ce qui change le bloc d'en dessous passe avant un saut posé juste au-dessus de lui.
    const rank = edit => (edit.type === 'insert' ? 1 : 0);
    edits.slice().sort((a, b) => where(b) - where(a) || rank(a) - rank(b)).forEach(edit => {
      if (edit.type === 'insert') tr.insert(where(edit), breakNode.create({ orientation: edit.orientation, added: true }));
      else if (edit.type === 'remove') tr.delete(where(edit), endOf(blocks[edit.block]));
      else tr.setNodeMarkup(where(edit), undefined, Object.assign({}, blocks[edit.block].node.attrs, { orientation: edit.orientation }));
    });
    view.dispatch(tr);
  }

  // « Tout le document » : écrit ce qu'il faut pour qu'aucun saut ne tourne plus rien. Rend le nombre de sauts changés ou retirés. Ne touche pas au sens des marges.
  function turnDocument(editor) {
    const blocks = blocksOf(editor);
    const edits = documentEdits(blocks);
    apply(editor, blocks, edits);
    return edits.length;
  }

  // « Cette page » : la pagination est refaite d'abord (elle doit être celle du document tel qu'il est), puis le plan s'écrit. Rend { ok, base, changed } - `base` : le sens que les marges doivent avoir pour
  // que la première page garde ou prenne le sien (à poser par l'appelant) - ou { ok: false, reason } quand le menu ne peut pas désigner la page ou qu'un saut devrait se poser dans un tableau.
  function turnPages(editor, sense) {
    if (HeaderFooterPreview.mainDocumentHtml() != null) return { ok: false, reason: 'hf' };
    HeaderFooterPreview.renderPaginationOverlay();
    const pages = inspectPages(editor);
    if (pages.reason) return { ok: false, reason: pages.reason };
    const result = plan(pages.base, pages.cuts, pages.first, pages.last, sense);
    if (!result.ok) return result;
    apply(editor, pages.blocks, result.edits);
    return { ok: true, base: result.base, changed: result.changed };
  }

  return { plan, sensesOfPages, documentEdits, inspect, turnDocument, turnPages };
})();
