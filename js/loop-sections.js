// Les SECTIONS répétées d'une boucle, dans l'éditeur (demande du 12/11 : un ordre du jour, une ligne par point, de vrais titres avec de la place pour écrire entre eux). Le choix « Le titre et ce
// qui le suit » de la fenêtre Boucle (js/variable-loop.js) répète le titre qui porte la bulle ET les blocs qui le suivent, pour chaque ligne ; le moteur de la Lecture et de l'export est
// js/loop-rules.js (sectionRanges, attachSections, expandZone). Ce module en est l'autre moitié côté éditeur, sur le document ProseMirror :
//  - `rangesOf(parent)` : les sections des enfants d'un même parent, avec la même règle que le moteur (LoopRules.sectionRanges - la section d'un titre va jusqu'au prochain titre de même
//    niveau ou plus haut, ou jusqu'à la marque « Fin de la section », nœud `loopEnd`, ou jusqu'à la fin du parent) ;
//  - `zonesAt(parent, contentStart, index)` : celles qui contiennent l'enfant `index`, de la plus proche à la plus large, au format des zones de VariableLoop.zonesAt - une variable écrite sous
//    un titre répété lit donc la ligne du tour, son autocomplétion et sa couleur le savent, et une boucle posée sous un titre se range dedans (les sous-points) ;
//  - l'extension : une décoration de classe sur le titre et sur chaque bloc de la section (la teinte et le trait de la marge, css/loop-marks.css), rien d'écrit dans le document. Elle ne
//    parcourt le document que s'il porte une section (LoopMarks.hasSections) ; les nœuds de ProseMirror ne changent pas d'identité tant qu'ils ne sont pas modifiés, si bien que les sections de
//    chaque parent se rangent par parent (WeakMap) et ne se recalculent que là où le texte a bougé.
const LoopSections = (function () {
  const LOOP_NODES = ['varBadge', 'editorImage'];
  const END_NODE = 'loopEnd';
  // Les classes des décorations (css/loop-marks.css) : `pp-loop-section` sur chaque bloc de la section, `-first` sur le titre, `-last` sur son dernier bloc, `-d1` à `-d3` selon la profondeur
  // d'emboîtement (un titre 2 dans la section d'un titre 1 : d2).
  const CLASS = 'pp-loop-section';
  const MAX_DEPTH = 3;

  // La bulle d'un titre qui répète sa section : { rel, node, loop } - `rel` : sa place dans le contenu du titre (position du titre + 1 + rel), comme VariableLoop.zoneOwner. Null sans.
  const owners = new WeakMap();
  function ownerIn(heading) {
    if (owners.has(heading)) return owners.get(heading);
    let found = null;
    heading.descendants((child, rel) => {
      if (found) return false;
      if (LOOP_NODES.indexOf(child.type.name) === -1) return true;
      const loop = LoopRules.normalizeLoop(child.attrs.loop);
      if (loop && loop.repeat === 'section') found = { rel, node: child, loop };
      return false;
    });
    owners.set(heading, found);
    return found;
  }

  const levelOf = node => (node.type.name === 'heading' ? Number(node.attrs.level) || 0 : 0);

  // Les sections des enfants de `parent`, dans l'ordre des départs : [{ start, end, marker, offset, owner, depth }] - `start` / `end` : rangs des enfants (fin exclue), `marker` : le rang de la
  // marque qui la ferme (-1 sinon), `offset` : la place du titre dans le contenu du parent, `owner` : sa bulle (ownerIn), `depth` : 1 pour une section, 2 pour celle d'un titre qu'elle contient.
  const ranges = new WeakMap();
  function rangesOf(parent) {
    const cached = ranges.get(parent);
    if (cached) return cached;
    const blocks = [];
    const offsets = [];
    const found = [];
    let any = false;
    let offset = 0;
    parent.forEach(child => {
      const owner = child.type.name === 'heading' ? ownerIn(child) : null;
      if (owner) any = true;
      blocks.push({ level: levelOf(child), marker: child.type.name === END_NODE, owns: !!owner });
      offsets.push(offset);
      found.push(owner);
      offset += child.nodeSize;
    });
    const list = any ? LoopRules.sectionRanges(blocks).map(range => ({ start: range.start, end: range.end, marker: range.marker, offset: offsets[range.start], owner: found[range.start], depth: 1 })) : [];
    // L'emboîtement : une section est dans celle dont elle part pendant que celle-ci dure (elles sont triées par départ).
    const open = [];
    list.forEach(range => {
      while (open.length && open[open.length - 1].end <= range.start) open.pop();
      range.depth = open.length + 1;
      open.push(range);
    });
    ranges.set(parent, list);
    return list;
  }

  // Les sections de `parent` qui contiennent son enfant de rang `index`, de la plus proche à la plus large, au format de VariableLoop.zonesAt : { repeat: 'section', start (position du titre),
  // owner: { pos, node, loop } }. `contentStart` : la position du premier enfant de `parent`.
  function zonesAt(parent, contentStart, index) {
    const zones = [];
    rangesOf(parent).forEach(range => {
      if (range.start > index || range.end <= index) return;
      const start = contentStart + range.offset;
      zones.push({ repeat: 'section', start, owner: { pos: start + 1 + range.owner.rel, node: range.owner.node, loop: range.owner.loop } });
    });
    return zones.reverse();
  }

  // Les décorations de tout le document : les blocs de chaque section. On descend dans les nœuds qui contiennent des blocs (cases, listes, colonnes, encadrés), pas dans les textes.
  function decorate(doc, Decoration, DecorationSet) {
    const found = [];
    const walk = (parent, contentStart) => {
      const positions = [];
      const children = [];
      parent.forEach((child, offset) => { positions.push(contentStart + offset); children.push(child); });
      rangesOf(parent).forEach(range => {
        for (let i = range.start; i < range.end; i++) {
          const classes = [CLASS, CLASS + '-d' + Math.min(range.depth, MAX_DEPTH)];
          if (i === range.start) classes.push(CLASS + '-first');
          if (i === range.end - 1) classes.push(CLASS + '-last');
          found.push(Decoration.node(positions[i], positions[i] + children[i].nodeSize, { class: classes.join(' ') }));
        }
      });
      children.forEach((child, i) => {
        if (child.isTextblock || child.isAtom || !child.childCount) return;
        walk(child, positions[i] + 1);
      });
    };
    walk(doc, 0);
    return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
  }

  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    return Extension.create({
      name: 'loopSections',
      addProseMirrorPlugins() {
        let cached = { doc: null, set: DecorationSet.empty };
        return [new Plugin({
          key: new PluginKey('loopSections'),
          props: {
            decorations: state => {
              if (!LoopMarks.hasSections()) return DecorationSet.empty;
              if (cached.doc !== state.doc) cached = { doc: state.doc, set: decorate(state.doc, Decoration, DecorationSet) };
              return cached.set;
            },
          },
          // La première section du document s'annonce pendant que le document se pose (LoopMarks.needSections) : les décorations calculées avant elle étaient vides, elles se relisent
          // juste après, sans transaction (rien dans l'historique, rien à enregistrer).
          view(view) {
            const refresh = () => Promise.resolve().then(() => { if (!view.isDestroyed) { cached = { doc: null, set: DecorationSet.empty }; view.setProps({}); } });
            document.addEventListener(LoopMarks.SECTIONS_EVENT, refresh);
            return { destroy() { document.removeEventListener(LoopMarks.SECTIONS_EVENT, refresh); } };
          },
        })];
      },
    });
  }

  return { CLASS, END_NODE, ownerIn, rangesOf, zonesAt, createExtension };
})();
