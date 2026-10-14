// Comparaison d'un état d'un modèle avec la version actuelle, pour la fenêtre « Historique des versions… » (js/versions-history.js, bouton « Comparer ») : le texte de la version
// choisie, avec en vert ce qu'elle a EN PLUS de la version actuelle et, en rouge barré, ce que la version actuelle a et qu'elle n'a pas (ce qu'une restauration retirerait). Chargé au
// premier clic sur « Comparer » seulement (balise inerte d'index.html, VersionsStore.loadModule).
//
// La méthode, sans bibliothèque de plus :
//   1. chaque texte (paragraphe, titre, case de tableau, ligne de liste...) est un « bloc » coupé en mots, blancs et signes ; une pastille ou une image n'est qu'un « mot », qui porte son
//      identité (son type et ses réglages) ;
//   2. les blocs des deux états sont alignés : la plus longue suite de blocs identiques, puis, dans une plage sans équivalent exact, un bloc modifié est apparié au bloc qui lui
//      ressemble à moitié ou plus (mots communs) ; ceux qui restent sont ajoutés ou retirés en entier ;
//   3. deux blocs appariés mais différents se comparent mot à mot (plus longue suite commune) ; deux changements séparés par des blancs seuls n'en font qu'un ;
//   4. le résultat est le document de la version : ce qu'elle a en plus porte la marque « ajouté », ce qu'elle n'a pas est remis à sa place (le bloc précédent apparié) sous la marque
//      « retiré ». Au-delà de MAX_CELLS cases de tableau, la plus longue suite commune n'est pas cherchée : la plage est donnée pour remplacée en entier.
// Ne sont pas marqués : la mise en forme seule (gras, alignement, niveau d'un titre...) et les objets sans texte (graphique, saut de page), mais la mise en forme qui diffère est comptée
// (`formatOnly`) pour que « aucune différence » ne soit jamais dit à tort.
//
// Les fonctions du haut (diffKeys, tokenize, alignBlocks, inlineGroups, compareText, compareLines) sont pures, sans navigateur ni ProseMirror (dev-tests/unit-versions-compare.mjs) ;
// celles du bas (compareDocs, compareHtml) reçoivent ProseMirror (prosemirror-model et prosemirror-transform, déjà chargés par l'éditeur) et se testent dans la page.
const VersionsCompare = (function () {
  const MAX_CELLS = 6000000;   // au-delà, la plage est donnée pour remplacée en entier
  const MAX_SIMILAR_CELLS = 6000; // taille (blocs retirés x blocs ajoutés) jusqu'à laquelle on cherche, dans une plage sans équivalent exact, le bloc modifié qui ressemble
  const SIMILAR = 0.5;         // la part de mots communs à partir de laquelle deux blocs sont « le même bloc, modifié »
  const LEAF = '\uFFFC';       // une pastille, une image ou un saut de ligne dans le texte à plat d'un bloc (et l'ouverture d'un nœud en ligne qui contient du texte)
  const CLOSE = '\uE001';      // la fermeture d'un nœud en ligne qui contient du texte
  const TOKEN_RE = /[\uFFFC\uE001]|[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_\uFFFC\uE001]/gu;
  // Les deux marques de la feuille de comparaison, qui n'est jamais enregistrée (`parseDOM` vide) : leur nom ne commence pas par « pp_ », le préfixe des clés que le widget garde dans le navigateur.
  const MARK_ADDED = 'versionsAdded';
  const MARK_REMOVED = 'versionsRemoved';

  // ---- La partie pure ---------------------------------------------------------------------------------------------------------------------------------------------------

  // Les plages d'une comparaison de deux suites de clés : [{ type: 'eq' | 'del' | 'ins', a: [de, à[, b: [de, à[ }], ou null quand elles sont trop grandes pour la plus longue
  // suite commune. 'del' : dans `a` seulement ; 'ins' : dans `b` seulement.
  function diffKeys(a, b) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const n = endA - start;
    const m = endB - start;
    if (n * m > MAX_CELLS) return null;
    const runs = [];
    const push = (type, a0, a1, b0, b1) => {
      if (a0 === a1 && b0 === b1) return;
      const last = runs[runs.length - 1];
      if (last && last.type === type && last.a[1] === a0 && last.b[1] === b0) { last.a[1] = a1; last.b[1] = b1; } else runs.push({ type, a: [a0, a1], b: [b0, b1] });
    };
    push('eq', 0, start, 0, start);
    if (n || m) {
      const w = m + 1;
      const lcs = new (Math.min(n, m) < 65535 ? Uint16Array : Uint32Array)((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          lcs[i * w + j] = a[start + i] === b[start + j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && a[start + i] === b[start + j]) { push('eq', start + i, start + i + 1, start + j, start + j + 1); i++; j++; }
        else if (i < n && (j >= m || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) { push('del', start + i, start + i + 1, start + j, start + j); i++; }
        else { push('ins', start + i, start + i, start + j, start + j + 1); j++; }
      }
    }
    push('eq', endA, a.length, endB, b.length);
    return runs;
  }

  // Une clé courte pour un texte long (les réglages d'une image peuvent peser des mégaoctets) : FNV-1a sur 32 bits, avec la longueur.
  function shortKey(text) {
    if (text.length <= 160) return text;
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return text.length + '#' + h.toString(16);
  }

  // Les « mots » d'un texte à plat : des suites de lettres et de chiffres, des blancs (tous égaux entre eux), des signes un à un, et LEAF pour une pastille ou une image, dont `leafKey(index)`
  // dit l'identité (CLOSE ferme un nœud en ligne qui contient du texte).
  // { key, from, to, space, word } : `from` et `to` sont des positions dans le texte, `word` dit un mot (des lettres, des chiffres, une pastille) et non un blanc ou un signe.
  function tokenize(text, leafKey) {
    const tokens = [];
    for (const m of text.matchAll(TOKEN_RE)) {
      const piece = m[0];
      const space = /^\s/.test(piece);
      const key = piece === LEAF ? LEAF + (leafKey ? leafKey(m.index) : '') : (space ? ' ' : piece);
      tokens.push({ key, from: m.index, to: m.index + piece.length, space, word: !space && /^[\p{L}\p{N}_\uFFFC]/u.test(piece) });
    }
    return tokens;
  }

  // La clé d'un bloc : ses mots, ses signes et ses blancs, sans les blancs du début et de la fin (un blanc de plus ou de moins ailleurs compte comme un autre blanc : un seul « mot »).
  function blockKey(tokens) {
    let from = 0;
    let to = tokens.length;
    while (from < to && tokens[from].space) from++;
    while (to > from && tokens[to - 1].space) to--;
    return tokens.slice(from, to).map(t => t.key).join('\u0001');
  }

  const wordsOf = tokens => tokens.filter(t => t.word).map(t => t.key);

  // La ressemblance de deux blocs (0 à 1) : la moyenne de leurs mots communs dans l'ordre (plus longue suite commune) et de leurs mots communs en vrac, pour qu'un bloc dont on a seulement
  // changé l'ordre des mots soit encore le même bloc.
  function similarity(a, b) {
    const wa = wordsOf(a.tokens);
    const wb = wordsOf(b.tokens);
    if (!wa.length || !wb.length) return 0;
    const runs = diffKeys(wa, wb);
    if (!runs) return 0;
    let ordered = 0;
    runs.forEach(r => { if (r.type === 'eq') ordered += r.a[1] - r.a[0]; });
    const counts = new Map();
    wa.forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
    let loose = 0;
    wb.forEach(w => { const n = counts.get(w); if (n) { loose++; counts.set(w, n - 1); } });
    return (ordered + loose) / (wa.length + wb.length);
  }

  // Dans une plage sans équivalent exact (blocs A[a0..a1[ et B[b0..b1[), apparie les blocs qui se ressemblent : la suite de paires, dans l'ordre, dont la ressemblance totale est la plus grande.
  // Ceux qui restent sans pareil sont ajoutés aux paires seuls : [indice, null] ou [null, indice].
  function alignRange(A, a0, a1, B, b0, b1, pairs) {
    const n = a1 - a0;
    const m = b1 - b0;
    if (n * m > MAX_SIMILAR_CELLS) {
      for (let y = b0; y < b1; y++) pairs.push([null, y]);
      for (let x = a0; x < a1; x++) pairs.push([x, null]);
      return;
    }
    const known = new Float32Array(n * m).fill(-1);
    const sim = (i, j) => {
      const at = i * m + j;
      if (known[at] < 0) known[at] = similarity(A[a0 + i], B[b0 + j]);
      return known[at];
    };
    const w = m + 1;
    const best = new Float32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        let v = Math.max(best[(i + 1) * w + j], best[i * w + j + 1]);
        const s = sim(i, j);
        if (s >= SIMILAR) v = Math.max(v, s + best[(i + 1) * w + j + 1]);
        best[i * w + j] = v;
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m) {
        const s = sim(i, j);
        if (s >= SIMILAR && Math.abs(best[i * w + j] - (s + best[(i + 1) * w + j + 1])) < 1e-5) { pairs.push([a0 + i, b0 + j]); i++; j++; continue; }
      }
      if (j >= m || (i < n && best[(i + 1) * w + j] >= best[i * w + j + 1])) { pairs.push([a0 + i, null]); i++; } else { pairs.push([null, b0 + j]); j++; }
    }
  }

  // Les paires [indice dans A ou null, indice dans B ou null] des blocs de A (la version actuelle) et de B (la version), dans l'ordre du document. Un bloc : { key, tokens }.
  function alignBlocks(A, B) {
    const runs = diffKeys(A.map(x => x.key), B.map(x => x.key));
    const pairs = [];
    if (!runs) {
      A.forEach((_, i) => pairs.push([i, null]));
      B.forEach((_, j) => pairs.push([null, j]));
      return pairs;
    }
    let k = 0;
    while (k < runs.length) {
      const run = runs[k];
      if (run.type === 'eq') {
        for (let d = 0; d < run.a[1] - run.a[0]; d++) pairs.push([run.a[0] + d, run.b[0] + d]);
        k++;
        continue;
      }
      // Une plage sans équivalent exact : tous les « del » et « ins » qui se suivent.
      const a0 = run.a[0];
      let a1 = a0;
      const b0 = run.b[0];
      let b1 = b0;
      while (k < runs.length && runs[k].type !== 'eq') { a1 = Math.max(a1, runs[k].a[1]); b1 = Math.max(b1, runs[k].b[1]); k++; }
      alignRange(A, a0, a1, B, b0, b1, pairs);
    }
    return pairs;
  }

  // Les groupes de différences entre deux blocs appariés : { a: [de, à[, b: [de, à[ } en positions du texte à plat de chacun. Deux changements séparés par des blancs seuls n'en font qu'un.
  // `blockA.size` et `blockB.size` : la longueur de leur texte à plat.
  function inlineGroups(blockA, blockB) {
    const ta = blockA.tokens;
    const tb = blockB.tokens;
    const runs = diffKeys(ta.map(t => t.key), tb.map(t => t.key));
    if (!runs) return [{ a: [0, blockA.size], b: [0, blockB.size] }];
    const groups = [];
    let cur = null;
    runs.forEach((run, idx) => {
      if (run.type !== 'eq') {
        if (!cur) cur = { a0: run.a[0], a1: run.a[1], b0: run.b[0], b1: run.b[1] };
        else { cur.a1 = Math.max(cur.a1, run.a[1]); cur.b1 = Math.max(cur.b1, run.b[1]); }
        return;
      }
      const onlySpaces = run.a[1] > run.a[0] && cur && idx < runs.length - 1 && ta.slice(run.a[0], run.a[1]).every(t => t.space);
      if (onlySpaces) { cur.a1 = run.a[1]; cur.b1 = run.b[1]; return; }
      if (cur) { groups.push(cur); cur = null; }
    });
    if (cur) groups.push(cur);
    const at = (tokens, i, size) => (i < tokens.length ? tokens[i].from : size);
    return groups.map(g => ({
      a: [at(ta, g.a0, blockA.size), g.a1 > g.a0 ? ta[g.a1 - 1].to : at(ta, g.a0, blockA.size)],
      b: [at(tb, g.b0, blockB.size), g.b1 > g.b0 ? tb[g.b1 - 1].to : at(tb, g.b0, blockB.size)],
    }));
  }

  // Deux textes courts (l'objet d'un e-mail, ses destinataires) : [{ kind: 'same' | 'added' | 'removed', text }], dans l'ordre de lecture ; le retiré (propre à `current`) précède l'ajouté
  // (propre à `version`) qui le remplace.
  function compareText(current, version) {
    const a = String(current == null ? '' : current);
    const b = String(version == null ? '' : version);
    if (a === b) return b ? [{ kind: 'same', text: b }] : [];
    const blockA = { tokens: tokenize(a), size: a.length };
    const blockB = { tokens: tokenize(b), size: b.length };
    const out = [];
    let ib = 0;
    const add = (kind, text) => {
      if (!text) return;
      const last = out[out.length - 1];
      if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
    };
    inlineGroups(blockA, blockB).forEach(g => {
      add('same', b.slice(ib, g.b[0]));
      add('removed', a.slice(g.a[0], g.a[1]));
      add('added', b.slice(g.b[0], g.b[1]));
      ib = g.b[1];
    });
    add('same', b.slice(ib));
    return out;
  }

  // Deux listes de lignes (la composition d'un macro-modèle) : [{ kind, text }] dans l'ordre de la version, les lignes que seule la version actuelle a remises à leur place.
  function compareLines(current, version) {
    const runs = diffKeys(current, version);
    const out = [];
    if (!runs) {
      current.forEach(text => out.push({ kind: 'removed', text }));
      version.forEach(text => out.push({ kind: 'added', text }));
      return out;
    }
    runs.forEach(run => {
      if (run.type === 'eq') version.slice(run.b[0], run.b[1]).forEach(text => out.push({ kind: 'same', text }));
      else {
        current.slice(run.a[0], run.a[1]).forEach(text => out.push({ kind: 'removed', text }));
        version.slice(run.b[0], run.b[1]).forEach(text => out.push({ kind: 'added', text }));
      }
    });
    return out;
  }

  // ---- La partie qui touche à ProseMirror ---------------------------------------------------------------------------------------------------------------------------------

  // Le schéma de l'éditeur, plus deux marques : « ajouté » et « retiré ». Un schéma dérivé ne se mêle jamais à l'éditeur vivant : il ne sert qu'à lire du HTML et à l'écrire.
  const derived = new WeakMap();
  function derivedSchema(pm, base) {
    let schema = derived.get(base);
    if (!schema) {
      const marks = base.spec.marks
        .addToEnd(MARK_ADDED, { excludes: '', inclusive: false, parseDOM: [], toDOM: () => ['ins', { class: 'pp-versions-added' }, 0] })
        .addToEnd(MARK_REMOVED, { excludes: '', inclusive: false, parseDOM: [], toDOM: () => ['del', { class: 'pp-versions-removed' }, 0] });
      schema = new pm.model.Schema({ topNode: base.spec.topNode, nodes: base.spec.nodes, marks });
      derived.set(base, schema);
    }
    return schema;
  }

  // Le texte à plat d'un bloc de texte et ses mots. Une position du contenu du bloc = un caractère du texte à plat : un texte garde ses lettres, une pastille, une image ou un saut de ligne
  // devient LEAF, un nœud en ligne qui contient du texte devient LEAF, son contenu, puis CLOSE. Les positions d'un groupe de différences sont donc, telles quelles, celles du document.
  function blockOf(node, pos, depth) {
    let text = '';
    const leaves = new Map();
    const flatten = (fragment) => {
      fragment.forEach(child => {
        if (child.isText) { text += child.text; return; }
        const name = child.type.name;
        leaves.set(text.length, name === 'hard_break' || name === 'hardBreak' ? '' : name + ':' + shortKey(JSON.stringify(child.attrs)));
        text += LEAF;
        if (!child.isLeaf) { flatten(child.content); text += CLOSE; }
      });
    };
    flatten(node.content);
    const tokens = tokenize(text, index => leaves.get(index));
    return { node, pos, depth, text, size: node.content.size, tokens, key: blockKey(tokens) };
  }

  // Les blocs de texte d'un document, dans l'ordre. `pos` : le début de leur contenu.
  function blocksOf(doc) {
    const list = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      list.push(blockOf(node, pos + 1, doc.resolve(pos + 1).depth));
      return false;
    });
    return list;
  }

  // Le contenu d'un bloc retiré, chaque morceau portant la marque `mark` en plus des siennes.
  function markedContent(pm, fragment, mark) {
    const nodes = [];
    fragment.forEach(node => nodes.push(node.mark(mark.addToSet(node.marks))));
    return pm.model.Fragment.fromArray(nodes);
  }

  // La mise en forme d'un bloc : son type, ses réglages et les marques de ses morceaux de texte.
  function formatOf(node) {
    const parts = [node.type.name, JSON.stringify(node.attrs)];
    node.forEach(child => parts.push(child.marks.map(m => m.type.name + JSON.stringify(m.attrs)).join(',')));
    return shortKey(parts.join('|'));
  }

  // Un bloc de texte retiré (propre à la version actuelle), tel qu'on le remet dans le document de la version : son contenu sous la marque « retiré ».
  function removedBlock(pm, schema, node, mark) {
    try { return node.type.create(node.attrs, markedContent(pm, node.content, mark)); }
    catch (e) { return schema.nodes.paragraph.create(null, markedContent(pm, node.content, mark)); }
  }

  // Le nœud `node` (en `pos` dans le document de la version actuelle) réduit aux blocs de texte retirés qu'il contient : ses ancêtres sans leurs autres enfants (l'élément d'une liste, la
  // ligne d'un tableau...), pour que ce qui a été retiré garde sa forme.
  function prune(pm, schema, node, pos, wanted, mark) {
    if (node.isTextblock) return wanted.has(pos) ? removedBlock(pm, schema, node, mark) : null;
    const kids = [];
    node.forEach((child, offset) => { const kid = prune(pm, schema, child, pos + 1 + offset, wanted, mark); if (kid) kids.push(kid); });
    return kids.length ? node.type.create(node.attrs, pm.model.Fragment.fromArray(kids)) : null;
  }

  // Compare le document `A` (la version actuelle) à `B` (la version) : renvoie { doc, changes, formatOnly, skipped }, `doc` étant B marqué. `pm` : { model, transform }.
  function compareDocs(pm, schema, A, B) {
    const added = schema.marks[MARK_ADDED].create();
    const removed = schema.marks[MARK_REMOVED].create();
    const blocksA = blocksOf(A);
    const blocksB = blocksOf(B);
    const pairs = alignBlocks(blocksA, blocksB);
    const jobs = [];
    const groups = [];
    // Une différence = un groupe de mots changés dans un bloc apparié, ou une suite de blocs ajoutés ou retirés d'affilée (un paragraphe remplacé par un autre n'en fait qu'une).
    let changes = 0;
    let formatOnly = 0;
    let inRun = false;
    const startRun = () => { if (!inRun) { changes++; inRun = true; } };
    pairs.forEach(([i, j], at) => {
      const order = at * 1000;
      if (i !== null && j !== null) {
        inRun = false;
        const a = blocksA[i];
        const b = blocksB[j];
        if (a.key === b.key) {
          if (formatOf(a.node) !== formatOf(b.node)) formatOnly++;
          return;
        }
        inlineGroups(a, b).forEach((g, gi) => {
          const bFrom = b.pos + g.b[0];
          const bTo = b.pos + g.b[1];
          const content = g.a[1] > g.a[0] ? a.node.content.cut(g.a[0], g.a[1]) : null;
          if (!content && bTo <= bFrom) return;
          changes++;
          jobs.push({ pos: bFrom, order: order + gi, kind: 'inline', bFrom, bTo, content });
        });
      } else if (j !== null) {
        const b = blocksB[j];
        if (b.size) { startRun(); jobs.push({ pos: b.pos, order, kind: 'added', bFrom: b.pos, bTo: b.pos + b.size }); }
      } else {
        const a = blocksA[i];
        if (!a.size || !a.key) return;
        startRun();
        // Remis à sa place d'après le bloc APPARIÉ qui le précède (à défaut celui qui le suit) : avant ce que la version a ajouté à cet endroit, comme dans toute comparaison.
        let prev = -1;
        let next = -1;
        for (let x = at - 1; x >= 0 && prev < 0; x--) if (pairs[x][0] !== null && pairs[x][1] !== null) prev = x;
        for (let x = at + 1; x < pairs.length && next < 0; x++) if (pairs[x][0] !== null && pairs[x][1] !== null) next = x;
        const refAt = prev >= 0 ? prev : next;
        // `top` : le niveau du plus haut ancêtre du bloc qui n'est pas aussi celui du voisin (l'élément de liste, la ligne du tableau, le bloc lui-même s'ils sont du même niveau).
        const $a = A.resolve(a.pos);
        const top = refAt >= 0 ? $a.sharedDepth(blocksA[pairs[refAt][0]].pos) + 1 : 1;
        const key = refAt + ':' + $a.before(top);
        const last = groups[groups.length - 1];
        if (last && last.key === key && last.lastAt === at - 1) { last.blocks.push(a); last.lastAt = at; return; }
        groups.push({ key, order, lastAt: at, top, after: prev >= 0, ref: refAt >= 0 ? blocksB[pairs[refAt][1]] : null, ancestor: { node: $a.node(top), pos: $a.before(top) }, blocks: [a] });
      }
    });
    // Un groupe de blocs retirés d'affilée : un seul élément qui garde la forme de l'original (une liste, un tableau...) à côté du bloc voisin, sinon ses blocs de texte seuls au niveau du
    // document (ou, faute de voisin, à la fin).
    groups.forEach(group => {
      const { ref } = group;
      let spots = [];
      let node = null;
      if (ref) {
        const $ref = B.resolve(ref.pos);
        const wanted = new Set(group.blocks.map(b => b.pos - 1));
        const wrapped = prune(pm, schema, group.ancestor.node, group.ancestor.pos, wanted, removed);
        const level = Math.min(group.top, ref.depth);
        const spot = d => (group.after ? $ref.after(d) : $ref.before(d));
        if (wrapped) { try { wrapped.check(); node = wrapped; } catch (e) { node = null; } }
        if (node && pm.transform.insertPoint(B, spot(level), node.type) !== null) spots = [spot(level)];
        else node = null;
      }
      if (node) {
        const place = pm.transform.insertPoint(B, spots[0], node.type);
        jobs.push({ pos: place, order: group.order, kind: 'removed', place, spots, node });
        return;
      }
      group.blocks.forEach((b, k) => {
        const single = removedBlock(pm, schema, b.node, removed);
        const list = [];
        if (ref) { const $ref = B.resolve(ref.pos); for (let d = Math.min(b.depth, ref.depth); d >= 1; d--) list.push(group.after ? $ref.after(d) : $ref.before(d)); }
        let place = null;
        for (let n = 0; n < list.length && place == null; n++) place = pm.transform.insertPoint(B, list[n], single.type);
        jobs.push({ pos: place != null ? place : (list.length ? list[0] : B.content.size), order: group.order + k, kind: 'removed', place, spots: list, node: single });
      });
    });
    // De la fin vers le début du document : une insertion ne décale pas ce qui reste à poser (et `tr.mapping` rattrape ce qui l'a été plus loin).
    const tr = new pm.transform.Transform(B);
    jobs.sort((x, y) => y.pos - x.pos || y.order - x.order);
    const late = [];
    let skipped = 0;
    for (const job of jobs) {
      if (job.kind === 'added') tr.addMark(job.bFrom, job.bTo, added);
      else if (job.kind === 'inline') {
        if (job.bTo > job.bFrom) tr.addMark(job.bFrom, job.bTo, added);
        if (job.content) tr.insert(job.bFrom, markedContent(pm, job.content, removed));
      } else {
        let at = null;
        if (job.place != null) {
          const $place = tr.doc.resolve(tr.mapping.map(job.place, -1));
          if ($place.parent.canReplaceWith($place.index(), $place.index(), job.node.type)) at = $place.pos;
        }
        for (let k = 0; k < job.spots.length && at == null; k++) at = pm.transform.insertPoint(tr.doc, tr.mapping.map(job.spots[k], -1), job.node.type);
        if (at == null) late.push(job);
        else tr.insert(at, job.node);
      }
    }
    // Sans bloc voisin apparié, ou sans endroit qui l'accepte : à la fin du document, dans l'ordre où ils étaient.
    late.sort((x, y) => x.order - y.order).forEach(job => {
      const at = pm.transform.insertPoint(tr.doc, tr.doc.content.size, job.node.type);
      if (at == null) skipped++; else tr.insert(at, job.node);
    });
    return { doc: tr.doc, changes, formatOnly, skipped };
  }

  // Le schéma de l'éditeur vivant : de lui viennent les nœuds (pastilles, tableaux, images...) tels que la page les lit et les écrit.
  function editorSchema() {
    const editor = typeof EditorCore !== 'undefined' && EditorCore.getEditor ? EditorCore.getEditor() : null;
    return editor && editor.schema ? editor.schema : null;
  }

  // Compare deux textes HTML de modèle : `currentHtml` (la version actuelle) et `versionHtml` (la version choisie). Renvoie { html, changes, formatOnly, skipped } : `html` est celui de la version
  // avec ses marques <ins class="pp-versions-added"> et <del class="pp-versions-removed">. Échoue quand l'éditeur ou ProseMirror ne sont pas là.
  async function compareHtml(currentHtml, versionHtml) {
    const base = editorSchema();
    if (!base) throw new Error('Éditeur indisponible pour la comparaison.');
    const [model, transform] = await Promise.all([import('prosemirror-model'), import('prosemirror-transform')]);
    const pm = { model, transform };
    const schema = derivedSchema(pm, base);
    const parser = model.DOMParser.fromSchema(schema);
    const read = html => parser.parse(HtmlSanitize.parseInert(html || ''));
    const result = compareDocs(pm, schema, read(currentHtml), read(versionHtml));
    const holder = document.createElement('div');
    holder.appendChild(model.DOMSerializer.fromSchema(schema).serializeFragment(result.doc.content, { document }));
    return { html: holder.innerHTML, changes: result.changes, formatOnly: result.formatOnly, skipped: result.skipped };
  }

  return { MAX_CELLS, diffKeys, tokenize, blockKey, similarity, alignBlocks, inlineGroups, compareText, compareLines, compareDocs, derivedSchema, compareHtml };
})();
