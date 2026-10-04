// Suivi des modifications (mode suggestion façon Word et Google Docs) : pont entre Tiptap et @handlewithcare/prosemirror-suggest-changes@0.1.8.
// Cadrage, diagnostics et mesures : planning/feature-track-changes.md.
// Script classique, même patron que js/editor-nodes.js : createExtensions() fait son propre import() dynamique, appelé par Editor.init() une fois
// Node, Mark, Extension et mergeAttributes disponibles (import de @tiptap/core).
// Réparti sur plusieurs scripts, chargés avant celui-ci : js/track-changes-core.js (les marques et leurs repères), -selection.js (quelles modifications une action touche), -resolve.js
// (les résoudre), -reading.js (la Lecture et les exports) et -commands.js (les commandes de la lib). Celui-ci garde les métadonnées de chaque modification (qui, quand, quel numéro),
// le pont avec Tiptap (createExtensions) et l'API que le reste du widget appelle : TrackChanges.
const TrackChanges = (function () {
  const { lib, extendForTracking, skipTracking, isSkipped, hasPendingSuggestions, collectPendingIds, suggestionMarksOf } = TrackChangesCore;
  const { createMarks, createSerializerClass } = TrackChangesCore;
  const { selectionSuggestionIds } = TrackChangesSelection;
  const { keepOriginalNodeSettings } = TrackChangesResolve;
  const { acceptedView } = TrackChangesReading;
  const { runGuardedLibCommand, resolveAtSelection, chunkedCommand, refuseAttributes, releaseWidthsRefusedBy } = TrackChangesCommands;

  // Qui a proposé quoi : { [id]: { author, authorName, createdAt } }, la colonne Grist SuiviModifications (Editor.getSuiviModificationsForSave). `author` est l'adresse de la
  // personne (null quand le document ne la connaît pas), `authorName` son nom (absent quand Grist n'en donne pas), `createdAt` la date de l'enregistrement.
  // Fusionne les ids présents dans le document avec les métadonnées déjà connues : un id déjà vu garde son auteur et sa date d'origine, un nouveau reçoit la personne
  // devant l'écran (`author` : { email, name }, ou une adresse seule, ou null) et maintenant. Les ids disparus (suggestion acceptée ou refusée) disparaissent du résultat
  // sans purge explicite, puisqu'on ne recopie que ce qui est encore présent : purge dès la résolution, le défaut le plus prudent, comme un commentaire supprimé
  // (cf. « Rétention de l'historique » dans planning/feature-track-changes.md).
  function computeMetadata(state, previousMetadata, author) {
    const previous = previousMetadata || {};
    const now = new Date().toISOString();
    const who = typeof author === 'string' ? { email: author, name: '' } : (author || {});
    const next = {};
    collectPendingIds(state).forEach((id) => {
      if (previous[id]) { next[id] = previous[id]; return; }
      const entry = { author: who.email || null };
      if (who.name) entry.authorName = who.name;
      entry.createdAt = now;
      next[id] = entry;
    });
    return next;
  }

  // À l'ouverture d'un document : chaque modification en attente que ses métadonnées ne connaissent pas (document enregistré avant le suivi des auteurs, colonne vide ou
  // illisible) reçoit un auteur null. Sans cela, le premier enregistrement la mettrait au nom de la personne qui a ouvert le document, et la barre la lui attribuerait.
  function seedMetadata(state, metadata) {
    const seeded = Object.assign({}, metadata || {});
    collectPendingIds(state).forEach((id) => {
      if (!seeded[id]) seeded[id] = { author: null, createdAt: null };
    });
    return seeded;
  }

  // Les personnes derrière les modifications d'ids donnés : [{ name, email }], sans doublon (même adresse, ou même nom à défaut d'adresse), dans l'ordre des ids ; `name` et
  // `email` sont vides quand on ne les connaît pas. Une modification que les métadonnées ne connaissent pas est celle de la personne devant l'écran (tapée dans cette session,
  // pas encore enregistrée) : `current` est { email, name }, ou null tant que son identité n'est pas lue. Une modification dont le document ne connaît aucun auteur n'en apporte
  // aucun.
  function authorsOfSuggestions(ids, metadata, current) {
    const people = new Map();
    ids.forEach((id) => {
      const entry = metadata && metadata[String(id)];
      const who = entry ? { email: entry.author || '', name: entry.authorName || '' } : current;
      if (!who || !(who.email || who.name)) return;
      const key = String(who.email || who.name).toLowerCase();
      const known = people.get(key);
      if (!known) people.set(key, { name: who.name || '', email: who.email || '' });
      else if (!known.name && who.name) known.name = who.name;
    });
    return Array.from(people.values());
  }

  // Les numéros que la session connaît hors du document : ceux des métadonnées, y compris les modifications résolues depuis (« Annuler » peut les ramener, avec leur auteur).
  // Fournis par l'éditeur (Editor.init).
  let knownSuggestionIds = () => [];
  function setKnownSuggestionIds(provider) {
    knownSuggestionIds = typeof provider === 'function' ? provider : () => [];
  }
  // Le numéro d'une modification neuve : au-dessus de tous ceux du document ET de tous ceux que la session connaît. generateNextNumberId de la lib ne regarde que le document :
  // une fois la modification 1 de Jean acceptée, la suivante reprenait le numéro 1 et, avec lui, le nom de Jean. Elle saute aussi les enfants d'un nœud marqué (une case dont
  // le fond a changé et qui contient une insertion).
  function nextSuggestionId(schema, doc) {
    let highest = 0;
    const take = (id) => { const n = Number(id); if (Number.isFinite(n) && n > highest) highest = n; };
    knownSuggestionIds().forEach(take);
    if (doc) doc.descendants(node => { suggestionMarksOf(node).forEach(mark => take(mark.attrs.id)); });
    return highest + 1;
  }

  // Charge la bibliothèque et ses compagnons dans `lib` (cf. TrackChangesCore).
  async function loadLibrary() {
    // applySuggestionsInRange et revertSuggestionsInRange existent dans le paquet npm source mais pas dans le bundle ESM esm.sh réellement chargé
    // ici : les importer casserait le chargement du module entier, sans erreur visible. applySuggestion et revertSuggestion appelés avec un id
    // `undefined` (utilisés partout dans le suivi) font le même travail : toutes les suggestions de la plage.
    const {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled,
      applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction,
    } = await import('@handlewithcare/prosemirror-suggest-changes');
    const { DOMParser: PMDOMParser, DOMSerializer: PMDOMSerializer, Fragment: PMFragment } = await import('prosemirror-model');
    const { EditorState } = await import('prosemirror-state');
    const { TableMap } = await import('prosemirror-tables');
    Object.assign(lib, {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled, applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction, PMDOMParser, PMDOMSerializer, PMFragment, EditorState, TableMap,
    });
  }

  // Le pont : le plugin de la lib, les commandes du suivi (barre flottante et boutons) et la transformation de chaque transaction de la personne en suggestion.
  function createBridge(Extension) {
    const {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled,
      applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction, PMDOMParser,
    } = lib;
    return Extension.create({
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
          rejectAllSuggestionsChunked: (chunkSize = 200) => chunkedCommand(revertSuggestion, chunkSize, refuseAttributes, releaseWidthsRefusedBy),
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
          const tracked = transformToSuggestionTransaction(transaction, editor.state, nextSuggestionId);
          keepOriginalNodeSettings(tracked, transaction);
          next(tracked);
        } catch (e) {
          console.warn('[TrackChanges] transaction refusée (suppression de bloc entier non prise en charge par la lib) :', e);
        }
      },
    });
  }

  // Rétablit le suivi après un rechargement de modèle : EditorNodes.createClearHistoryExtension (js/editor-nodes.js), appelée par Editor.setHTML()
  // après chaque chargement, reconstruit l'état ProseMirror par `EditorState.create({..., plugins: view.state.plugins})`, et `EditorState.create`
  // appelle toujours `init()` sur chaque plugin, même inchangé (contrairement à `state.reconfigure(...)`, qui préserve l'état des plugins
  // inchangés). Le suivi est un booléen de plugin, pas une donnée du document : il retombait à « désactivé » à chaque changement de modèle, y
  // compris en rechargeant le même.
  // Dispatch réel (comme runGuardedLibCommand, js/track-changes-commands.js, et loadTrackedDocument plus haut) plutôt que la commande `toggleSuggestMode` : appelée en direct,
  // elle retomberait sur le piège du dispatch sans effet décrit à runGuardedLibCommand.
  function restoreSuggestModeIfNeeded(editor, wasOn) {
    if (wasOn && !lib.isSuggestChangesEnabled(editor.state)) lib.toggleSuggestChanges(editor.state, editor.view.dispatch);
  }

  async function createExtensions(Node, Mark, Extension, mergeAttributes) {
    await loadLibrary();
    const { isSuggestChangesEnabled, toggleSuggestChanges, PMDOMSerializer } = lib;
    const { InsertionMark, DeletionMark, ModificationMark } = createMarks(Mark, mergeAttributes);
    const TrackingDOMSerializer = createSerializerClass();
    const SuggestChangesBridge = createBridge(Extension);
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
    extendForTracking, hasPendingSuggestions, collectPendingIds, computeMetadata, seedMetadata, authorsOfSuggestions, setKnownSuggestionIds, createExtensions, skipTracking,
    isSkipped, selectionSuggestionIds, acceptedView,
  };
})();
