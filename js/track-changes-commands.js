// Suivi des modifications : les commandes de la bibliothèque, gardées - le garde-fou du dernier nœud du document, la résolution de modifications données en une seule transaction, « Tout
// accepter » et « Tout refuser » par tranches. Le pont (js/track-changes.js) les met dans les commandes de l'éditeur. Script classique, chargé après js/track-changes-resolve.js.
const TrackChangesCommands = (function () {
  const { isSuggestionMark, lastNodeCarriesSuggestionMark, hasInsertionOrDeletion, lib } = TrackChangesCore;
  const { sameId, ridesAlong, selectionSuggestionIds, expandSuggestionIds } = TrackChangesSelection;
  const { attrModification, suggestionRegion, releaseFrozenColumnWidths, resolveModifications } = TrackChangesResolve;

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
    const guardMeta = t => t.setMeta(lib.suggestChangesKey, { skip: true }).setMeta('addToHistory', false);
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
    const strip = lib.EditorState.create({ doc, schema }).tr;
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
      const resolveOne = accept ? lib.applySuggestion : lib.revertSuggestion;
      try {
        ids.forEach(id => {
          const region = suggestionRegion(tr.doc, id);
          if (!region) return;
          let captured = null;
          resolveOne(id, region.from, region.to)(lib.EditorState.create({ doc: withoutModifications(tr.doc, schema), schema }), t => { captured = t; });
          if (captured) captured.steps.forEach(step => tr.step(step));
        });
        resolveModifications(tr, ids, accept);
      } catch (e) {
        console.warn('[TrackChanges] suggestion non résolue :', e);
        return false;
      }
      if (!tr.docChanged) return false;
      editor.view.dispatch(tr.setMeta(lib.suggestChangesKey, { skip: true }));
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
  // `modification`, avec leurs ids tels que le document les écrit. Celles qui accompagnent une colonne ou une ligne de tableau (ridesAlong) la suivent
  // tant qu'elle attend : `withRiders` les prend aussi, pour quand il n'en reste plus.
  function pendingAttributeIds(doc, withRiders) {
    const ids = [];
    doc.descendants(node => {
      node.marks.forEach(mark => {
        if (mark.type.name === 'modification' && (withRiders || !ridesAlong(node, mark)) && mark.attrs.id != null && !ids.some(id => sameId(id, mark.attrs.id))) ids.push(mark.attrs.id);
      });
    });
    return ids;
  }
  // Reprend une tranche après l'autre jusqu'à ce qu'il ne reste plus de marque. Une tranche qui ne change rien ne mènerait nulle part :
  // revertSuggestion de la lib rend « rien à faire » avant de résoudre les modifications dès qu'elle n'a aucun texte à défaire, et la boucle
  // retrouverait la même marque à chaque tour (avec un seul réglage de paragraphe suivi, « Tout refuser » ne finirait jamais). `onStall` résout
  // alors ce que la lib laisse et rend vrai s'il a changé le document : la boucle reprend pour le reste. Sans `onStall`, ou s'il ne change rien non
  // plus, elle s'arrête : des marques peuvent rester, mais la page ne se fige jamais. `adjust(tr)` complète la transaction que la lib produit pour
  // chaque tranche, avant qu'elle ne parte.
  function runChunkedLibCommand(rangeCommandFactory, editor, chunkSize, onStall, adjust) {
    while (true) {
      const marks = findFirstPendingMarks(editor.state, chunkSize);
      if (marks.length === 0) break;
      const before = editor.state.doc;
      const to = marks[marks.length - 1].to;
      runGuardedLibCommand((s, d) => rangeCommandFactory(0, to)(s, adjust ? tr => d(adjust(tr)) : d), editor, editor.view.dispatch, undefined);
      if (editor.state.doc.eq(before) && !(onStall && onStall())) break;
    }
  }

  // Les réglages seuls (la lib n'a rien à défaire : un alignement, le fond d'une cellule, la largeur d'une colonne) se refusent comme « Refuser »
  // une modification : resolveSuggestionIds, une transaction, un seul Annuler. Ceux qui accompagnent une colonne ou une ligne ne passent là que quand
  // plus aucune insertion ni suppression n'attend : avec une colonne ou une ligne suivie, ils s'en vont avec elle. Rend vrai si le document a changé.
  const refuseAttributes = editor => {
    const ids = pendingAttributeIds(editor.state.doc, !hasInsertionOrDeletion(editor.state.doc));
    return ids.length > 0 && resolveSuggestionIds(editor, ids, false);
  };

  // La lib rend `colwidth` avec les autres modifications de la plage (revertSuggestion), sans savoir qu'une largeur d'avant « automatique » doit rendre
  // au tableau tout entier sa mise en page d'origine (releaseFrozenColumnWidths) : la transaction qu'elle produit reçoit ce complément, dans le même
  // pas d'historique. Les marques résolues sont celles d'avant qui ne sont plus sur leur case.
  function releaseWidthsRefusedBy(tr) {
    const refused = [];
    tr.before.descendants((node, pos) => {
      const mark = attrModification(node, 'colwidth');
      if (!mark || mark.attrs.previousValue != null) return true;
      const { pos: now, deleted } = tr.mapping.mapResult(pos);
      const after = deleted ? null : tr.doc.nodeAt(now);
      if (after && after.type === node.type && !attrModification(after, 'colwidth')) refused.push({ pos: now, mark });
      return true;
    });
    if (refused.length) releaseFrozenColumnWidths(tr, refused);
    return tr;
  }

  // « Tout accepter » / « Tout refuser » par tranches de `chunkSize` marques : `resolveOne` est applySuggestion ou revertSuggestion, sans id
  // (toutes les suggestions de la plage). `onStall(editor)` : cf. runChunkedLibCommand ; `adjust(tr)` : complète chaque transaction de la lib.
  const chunkedCommand = (resolveOne, chunkSize, onStall, adjust) => ({ editor, dispatch, tr }) => {
    if (!dispatch) return true;
    tr.setMeta('preventDispatch', true);
    runChunkedLibCommand((from, to) => resolveOne(undefined, from, to), editor, chunkSize, onStall && (() => onStall(editor)), adjust);
    return true;
  };

  return { runGuardedLibCommand, resolveAtSelection, chunkedCommand, refuseAttributes, releaseWidthsRefusedBy };
})();
