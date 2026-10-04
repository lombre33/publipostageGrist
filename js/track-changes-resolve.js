// Suivi des modifications : résoudre une modification. Le réglage d'ORIGINE d'un nœud changé plusieurs fois (keepOriginalNodeSettings, que le pont appelle à chaque transaction), l'étendue
// d'une suggestion (suggestionRegion) et la résolution des marques `modification` (resolveModifications). Script classique, chargé après js/track-changes-selection.js.
const TrackChangesResolve = (function () {
  const { MARK_NAMES, isSuggestionMark } = TrackChangesCore;
  const { sameId, ridesAlong } = TrackChangesSelection;

  // Le réglage d'un nœud changé par une transaction faite de changements d'attribut (le fond d'une case : setNodeMarkup ; la largeur d'une colonne : setNodeMarkup sur chaque case ;
  // l'alignement d'un paragraphe) : la lib n'y insère ni ne retire aucun nœud, les positions du document d'avant sont celles du document suivi. Elle pose une marque `modification` sur
  // le nœud, d'où deux défauts. 1) Un réglage changé deux fois de suite (deux couleurs de fond, deux glissés du même bord de colonne, deux alignements) : la lib remplace la marque et y
  // note la valeur d'AVANT LE DERNIER changement - l'originale est perdue, « Refuser » rendait la valeur d'entre-deux. La marque garde donc la valeur d'origine de celle qu'elle
  // remplace, et disparaît quand le dernier changement la ramène. La marque qui suit une colonne ou une ligne ajoutée ou supprimée (ridesAlong) reste à la lib. 2) Une `modification`
  // exclut l'insertion et la suppression (schéma de la lib) : posée sur une case dont la colonne est ajoutée ou supprimée, elle lui retirait sa marque - « Tout refuser » laissait la
  // colonne en place, « Tout accepter » rendait un tableau percé. Un changement sur un nœud qui porte une insertion en fait partie : il s'applique, le nœud garde sa marque (refuser
  // l'ajout l'enlève entier, l'accepter garde tout). Sur un nœud qui porte une suppression il n'a pas lieu : ce qui s'en va n'a plus de réglage à proposer, et refuser la suppression
  // rend le document d'origine. Ajoute ses corrections à `tracked`, la transaction que la lib vient de produire pour `original`.
  const isSameValue = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  const attrModification = (node, name) => node.marks.find(m => m.type.name === 'modification' && m.attrs.type === 'attr' && m.attrs.attrName === name);
  const isInsertionOrDeletion = mark => isSuggestionMark(mark) && mark.type.name !== 'modification';
  // Le nœud et les attributs qu'un pas change, ou null quand ce pas n'est pas un simple changement d'attribut. `doc` : le document d'avant ce pas.
  function attributeChange(step, doc) {
    if (step.jsonID === 'attr') {
      const node = doc.nodeAt(step.pos);
      return node && { pos: step.pos, node, names: [step.attr] };
    }
    // setNodeMarkup : le même test que la lib (suggestSetNodeMarkup, replaceAroundStep.js).
    if (step.jsonID === 'replaceAround' && step.structure && step.insert === 1 && step.slice.size === 2 && step.gapFrom === step.from + 1 && step.gapTo === step.to - 1) {
      const node = doc.nodeAt(step.from);
      const next = step.slice.content.firstChild;
      if (!node || !next || next.type !== node.type) return null;
      return { pos: step.from, node, names: Object.keys(next.attrs).filter(name => next.attrs[name] !== node.attrs[name]) };
    }
    return null;
  }
  function keepOriginalNodeSettings(tracked, original) {
    const carried = [];
    const replaced = [];
    for (let i = 0; i < original.steps.length; i++) {
      const change = attributeChange(original.steps[i], original.docs[i]);
      if (!change) return;
      if (change.node.marks.some(isInsertionOrDeletion)) {
        if (!carried.some(other => other.pos === change.pos)) carried.push(change);
        continue;
      }
      change.names.forEach(name => {
        const before = attrModification(change.node, name);
        if (before && !ridesAlong(change.node, before)) replaced.push({ pos: change.pos, name, before });
      });
    }
    carried.forEach(({ pos, node: before }) => {
      const node = tracked.doc.nodeAt(pos);
      if (!node || node.type !== before.type) return;
      const attrs = before.marks.some(mark => mark.type.name === 'deletion') ? before.attrs : node.attrs;
      if (!node.hasMarkup(before.type, attrs, before.marks)) tracked.setNodeMarkup(pos, null, attrs, before.marks);
    });
    const { modification } = tracked.doc.type.schema.marks;
    replaced.forEach(({ pos, name, before }) => {
      const node = tracked.doc.nodeAt(pos);
      const mark = node && attrModification(node, name);
      if (!mark) return;
      const rest = mark.removeFromSet(node.marks);
      const marks = isSameValue(before.attrs.previousValue, mark.attrs.newValue)
        ? rest
        : modification.create(Object.assign({}, mark.attrs, { previousValue: before.attrs.previousValue })).addToSet(rest);
      tracked.setNodeMarkup(pos, null, node.attrs, marks);
    });
    // Tout ce que la transaction changeait n'a pas eu lieu (des cases supprimées) : le document est resté tel quel, il n'y a rien à annuler ni rien d'enregistrer.
    if (carried.length && tracked.before.eq(tracked.doc)) tracked.setMeta('addToHistory', false).setMeta('preventUpdate', true);
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

  // Une colonne « automatique » (sans `colwidth`) dont on tire le bord devient fixe, et le widget fige aussitôt les autres colonnes automatiques à la
  // largeur qu'elles ont (backfillAutoColumnWidths, js/editor.js), hors suivi : le tableau n'a plus que des largeurs fixes. Rendre sa largeur d'avant
  // à la seule colonne tirée (« automatique ») ne suffit pas : le widget la fige de nouveau aussitôt, les autres restent à leurs largeurs figées et le
  // tableau ne retrouve jamais sa mise en page d'origine. Quand un refus rend une largeur d'avant « automatique » - le tableau l'était alors tout
  // entier, le widget fige dès qu'une colonne reste automatique à côté d'une fixe -, les autres colonnes du tableau qui restent fixes sans largeur en
  // attente, celles que le widget a figées, redeviennent donc « automatiques » elles aussi. `refused` : les marques que le refus vient de résoudre.
  function releaseFrozenColumnWidths(tr, refused) {
    const tables = [];
    refused.forEach(({ pos, mark }) => {
      if (mark.attrs.type !== 'attr' || mark.attrs.attrName !== 'colwidth' || mark.attrs.previousValue != null) return;
      const $pos = tr.doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name !== 'table') continue;
        const start = $pos.before(depth);
        if (!tables.includes(start)) tables.push(start);
        break;
      }
    });
    tables.forEach(start => {
      tr.doc.nodeAt(start).descendants((node, offset) => {
        if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return true;
        if (node.attrs.colwidth && !attrModification(node, 'colwidth')) tr.setNodeAttribute(start + 1 + offset, 'colwidth', null);
        return false;
      });
    });
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
    if (!accept) releaseFrozenColumnWidths(tr, found);
  }

  return { attrModification, keepOriginalNodeSettings, suggestionRegion, releaseFrozenColumnWidths, resolveModifications };
})();
