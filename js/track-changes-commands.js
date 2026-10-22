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

  // Les étapes qui acceptent ou refusent les suggestions `ids` (une table id en texte -> id tel que le document l'écrit, cf. expandSuggestionIds), posées
  // sur `tr` : une suggestion après l'autre par applySuggestion / revertSuggestion de la lib - que « Tout accepter » et « Tout refuser » appellent aussi,
  // sans id et par tranches -, sur une plage serrée et sur un état sans plugin (ses étapes sont rejouées sur `tr`, le document restant celui d'origine).
  function resolveInto(tr, schema, ids, accept) {
    const resolveOne = accept ? lib.applySuggestion : lib.revertSuggestion;
    ids.forEach(id => {
      const region = suggestionRegion(tr.doc, id);
      if (!region) return;
      let captured = null;
      resolveOne(id, region.from, region.to)(lib.EditorState.create({ doc: withoutModifications(tr.doc, schema), schema }), t => { captured = t; });
      if (captured) captured.steps.forEach(step => tr.step(step));
    });
    resolveModifications(tr, ids, accept);
  }

  // Accepte ou refuse les suggestions `seedIds` et tout ce qui se résout avec elles (expandSuggestionIds) en une seule transaction : un seul
  // Annuler, et prosemirror-tables ne voit jamais un tableau à moitié résolu (il « répare » un tableau non rectangulaire en ajoutant des cases
  // vides). Rend faux, sans rien changer, quand rien n'est à résoudre ou quand une étape ne s'applique pas.
  function resolveSuggestionIds(editor, seedIds, accept) {
    const ids = expandSuggestionIds(editor.state.doc, seedIds);
    return withEndGuard(editor, () => {
      const tr = editor.state.tr;
      try {
        resolveInto(tr, editor.state.schema, ids, accept);
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
  // Transform partagé, au coût cumulatif. « Tout accepter » et « Tout refuser » avancent donc par tranches bornées à chunkSize marques, toujours
  // depuis la position 0 du document courant (jamais des positions mises en cache : sa taille change à chaque tranche), chacune sur un état à part
  // dont le Transform reste petit. Mesuré : le coût est multiplié par ~5 au lieu de ~10 pour 4 fois plus de marques. Les étapes de toutes les
  // tranches s'ajoutent pourtant à UNE transaction (runChunkedLibCommand), partie une fois à la fin : un seul pas d'historique, et prosemirror-tables
  // ne voit jamais un tableau à moitié résolu.
  function findFirstPendingMarks(doc, chunkSize) {
    const found = [];
    doc.descendants((node, pos) => {
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
  // La transaction de « Tout accepter » et « Tout refuser » (runChunkedLibCommand) porte une étape par marque résolue, et Tiptap lui fait lire `getChangedRanges`, dont le coût grandit comme
  // le CARRÉ du nombre d'étapes, à deux endroits. Elle y échappe par deux méta : BULK_META, que lit isBulkResolution, le filtre de l'événement `delete` de l'extension Delete de Tiptap (js/editor.js :
  // rien du widget ne l'écoute, et il part dans une tâche APRÈS la commande), et `preventAutolink`, qui coupe la création automatique de liens de l'extension Link. Celle-ci est pourtant gardée :
  // la commande en rejoue le plugin sur chaque tranche (autolinkOf), comme quand chaque tranche était sa transaction, et l'adresse qu'une acceptation ou un refus laisse suivie d'une espace
  // devient toujours un lien. Mesuré à 3 200 modifications : voir le CHANGELOG, qui donne aussi les autres tailles.
  const BULK_META = 'bulkResolve';
  const isBulkResolution = tr => !!tr.getMeta(BULK_META);
  // Le `appendTransaction` du plugin `autolink` de l'extension Link (clé `autolink$`, un seul par éditeur), ou rien si l'éditeur n'en a pas : il ne lit que le document des états qu'on lui donne.
  const autolinkOf = editor => {
    const plugin = editor.state.plugins.find(p => p.key.startsWith('autolink$'));
    return plugin && plugin.spec.appendTransaction ? (trs, oldState, newState) => plugin.spec.appendTransaction.call(plugin, trs, oldState, newState) : null;
  };
  // Reprend une tranche après l'autre jusqu'à ce qu'il ne reste plus de marque. Une tranche qui ne change rien ne mènerait nulle part :
  // revertSuggestion de la lib rend « rien à faire » avant de résoudre les modifications dès qu'elle n'a aucun texte à défaire, et la boucle
  // retrouverait la même marque à chaque tour (avec un seul réglage de paragraphe suivi, « Tout refuser » ne finirait jamais). `onStall(whole)` résout
  // alors ce que la lib laisse et rend vrai s'il a changé le document : la boucle reprend pour le reste. Sans `onStall`, ou s'il ne change rien non
  // plus, elle s'arrête : des marques peuvent rester, mais la page ne se fige jamais. `adjust(tr)` complète la transaction que la lib produit pour
  // chaque tranche, avant que ses étapes ne soient reprises.
  // Toutes les tranches s'ajoutent à `whole`, UNE transaction envoyée à la fin : Annuler défait « Tout accepter » ou « Tout refuser » en un seul pas, de
  // 12 modifications comme de 12 000, et prosemirror-tables ne voit que le tableau fini (une colonne ajoutée sur plus d'une tranche de lignes, refusée tranche
  // par tranche, revenait avec ses cases, vides : il « réparait » le tableau entre deux tranches). Les mêmes garde-fous qu'une résolution à la main : le
  // garde du dernier nœud (withEndGuard) et les plugins qui filtrent ou complètent la transaction voient la commande d'un bloc.
  function runChunkedLibCommand(rangeCommandFactory, editor, chunkSize, onStall, adjust) {
    withEndGuard(editor, () => {
      const { schema } = editor.state;
      const whole = editor.state.tr;
      const autolink = autolinkOf(editor);
      while (true) {
        const marks = findFirstPendingMarks(whole.doc, chunkSize);
        if (marks.length === 0) break;
        const before = whole.doc;
        const sliceState = lib.EditorState.create({ doc: before, schema });
        let slice = null;
        rangeCommandFactory(0, marks[marks.length - 1].to)(sliceState, t => { slice = adjust ? adjust(t) : t; });
        if (slice) {
          slice.steps.forEach(step => whole.step(step));
          const links = autolink && slice.docChanged ? autolink([slice], sliceState, sliceState.apply(slice)) : null;
          if (links) links.steps.forEach(step => whole.step(step));
        }
        if (whole.doc.eq(before) && !(onStall && onStall(whole))) break;
      }
      if (whole.docChanged) editor.view.dispatch(whole.setMeta(lib.suggestChangesKey, { skip: true }).setMeta('preventAutolink', true).setMeta(BULK_META, true));
    });
  }

  // Les réglages seuls (la lib n'a rien à défaire : un alignement, le fond d'une cellule, la largeur d'une colonne) se refusent comme « Refuser »
  // une modification : leurs étapes, prises à part puis reprises toutes ensemble par `whole` (la transaction de la commande), dans le même pas d'historique.
  // Ceux qui accompagnent une colonne ou une ligne ne passent là que quand plus aucune insertion ni suppression n'attend : avec une colonne ou une ligne
  // suivie, ils s'en vont avec elle. Rend vrai si le document a changé.
  const refuseAttributes = (editor, whole) => {
    const ids = pendingAttributeIds(whole.doc, !hasInsertionOrDeletion(whole.doc));
    if (!ids.length) return false;
    const { schema } = editor.state;
    const attempt = lib.EditorState.create({ doc: whole.doc, schema }).tr;
    try {
      resolveInto(attempt, schema, expandSuggestionIds(whole.doc, ids), false);
    } catch (e) {
      console.warn('[TrackChanges] suggestion non résolue :', e);
      return false;
    }
    if (!attempt.docChanged) return false;
    attempt.steps.forEach(step => whole.step(step));
    return true;
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

  // « Tout accepter » / « Tout refuser » par tranches de `chunkSize` marques, en un seul pas d'historique : `resolveOne` est applySuggestion ou
  // revertSuggestion, sans id (toutes les suggestions de la plage). `onStall(editor, whole)` : cf. runChunkedLibCommand ; `adjust(tr)` : complète
  // chaque transaction de la lib.
  const chunkedCommand = (resolveOne, chunkSize, onStall, adjust) => ({ editor, dispatch, tr }) => {
    if (!dispatch) return true;
    tr.setMeta('preventDispatch', true);
    runChunkedLibCommand((from, to) => resolveOne(undefined, from, to), editor, chunkSize, onStall && (whole => onStall(editor, whole)), adjust);
    return true;
  };

  return { runGuardedLibCommand, resolveAtSelection, chunkedCommand, refuseAttributes, releaseWidthsRefusedBy, isBulkResolution };
})();
