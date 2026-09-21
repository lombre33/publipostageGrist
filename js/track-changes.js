// Suivi des modifications (mode suggestion façon Word/Google Docs) - pont entre Tiptap et
// @handlewithcare/prosemirror-suggest-changes@0.1.8. Intégration réelle du prototype
// prototypes/suivi-modifications.html (27 scénarios de tests verts avant intégration) - voir
// planning/feature-track-changes.md pour le cadrage complet, le diagnostic des bugs ci-dessous et
// les mesures de perf. Script classique (pas type="module"), même patron que js/editor-nodes.js :
// createExtensions() fait son propre import() dynamique, appelé depuis Editor.init() une fois
// Node/Mark/Extension/mergeAttributes disponibles (import de @tiptap/core).
const TrackChanges = (function () {
  const MARK_NAMES = ['insertion', 'deletion', 'modification'];

  // Un conteneur de bloc (doc, table, twoColumnsColumn, twoColumnsZone, cellule de tableau...) doit
  // explicitement autoriser ces 3 marques sur ses enfants directs pour qu'une suppression/insertion
  // de BLOC ENTIER (pas seulement de texte inline) puisse être posée comme marque de nœud
  // (tr.addNodeMark) sans que ProseMirror ne lève "Invalid content for node X" - cf.
  // planning/feature-track-changes.md, bug n°1. Chaque nœud Tiptap est immutable : `.extend(...)`
  // renvoie une NOUVELLE définition, à utiliser à la place de l'originale dans `extensions: [...]`.
  function extendForTracking(nodeOrMarkExtension) {
    return nodeOrMarkExtension.extend({ marks: MARK_NAMES.join(' ') });
  }

  function lastNodeCarriesSuggestionMark(state) {
    const last = state.doc.lastChild;
    return !!last && last.marks.some(m => MARK_NAMES.includes(m.type.name));
  }

  function hasPendingSuggestions(state) {
    let found = false;
    state.doc.descendants(node => {
      if (found) return false;
      if (node.marks.some(m => MARK_NAMES.includes(m.type.name))) found = true;
      return !found;
    });
    return found;
  }

  // Collecte l'ensemble des ids de suggestion actuellement présents dans le document (dédupliqués -
  // un remplacement adjacent peut réutiliser le même id sur plusieurs marques, cf.
  // planning/feature-track-changes.md sur suggestReplaceStep). Ids convertis en chaîne : ce sont des
  // clés d'objet JS, et generateNextNumberId (dans la lib) produit des nombres.
  function collectPendingIds(state) {
    const ids = new Set();
    state.doc.descendants(node => {
      node.marks.forEach(m => { if (MARK_NAMES.includes(m.type.name) && m.attrs.id != null) ids.add(String(m.attrs.id)); });
    });
    return ids;
  }

  // Fusionne les ids actuellement présents dans le document avec les métadonnées déjà connues
  // (auteur/horodatage) : un id déjà vu garde SON auteur/date d'origine, un id nouveau reçoit
  // authorEmail/maintenant. Les ids qui ont disparu du document (suggestion acceptée ou refusée)
  // disparaissent naturellement du résultat - pas de purge explicite à écrire, c'est une conséquence
  // du fait qu'on ne recopie que ce qui est encore présent. Voir planning/feature-track-changes.md,
  // "Rétention de l'historique" : purge dès résolution retenue comme comportement par défaut le plus
  // prudent (comme un commentaire supprimé aujourd'hui), pas encore validé par Antoine.
  function computeMetadata(state, previousMetadata, authorEmail) {
    const previous = previousMetadata || {};
    const now = new Date().toISOString();
    const next = {};
    collectPendingIds(state).forEach((id) => {
      next[id] = previous[id] || { author: authorEmail || null, createdAt: now };
    });
    return next;
  }

  async function createExtensions(Node, Mark, Extension, mergeAttributes) {
    const {
      suggestChanges, suggestChangesKey, toggleSuggestChanges, isSuggestChangesEnabled,
      applySuggestions, revertSuggestions, applySuggestion, revertSuggestion,
      transformToSuggestionTransaction,
    } = await import('@handlewithcare/prosemirror-suggest-changes');
    const { DOMParser: PMDOMParser } = await import('prosemirror-model');
    // Note vérifiée le 2026-09-20 (cf. prototype) : applySuggestionsInRange/revertSuggestionsInRange
    // existent dans le paquet npm source mais PAS dans le bundle ESM esm.sh réellement chargé ici -
    // les importer casserait le chargement du module ENTIER, silencieusement. applySuggestion/
    // revertSuggestion(undefined, from, to) (utilisés partout ci-dessous) font le même travail en
    // interne, avec un id undefined (= toutes les suggestions de la plage, pas une seule).

    // `priority: 200` sur insertion/deletion : @tiptap/starter-kit embarque sa propre extension
    // Strike, dont parseHTML reconnaît AUSSI <del> sans priorité de règle explicite (50, le défaut
    // ProseMirror) - à priorité de règle égale, l'ordre d'insertion dans schema.marks tranche, lui-
    // même dérivé de l'ordre de priorité D'EXTENSION Tiptap (défaut 100). Sans ce relèvement, StarterKit
    // (déclaré en premier dans extensions: [...]) gagnerait la course au parsing de <del> et absorberait
    // silencieusement la marque de suivi - bug trouvé et corrigé dans le prototype (round-trip HTML).
    const InsertionMark = Mark.create({
      name: 'insertion',
      priority: 200,
      inclusive: false,
      excludes: 'deletion modification insertion',
      addAttributes() { return { id: { default: null } }; },
      parseHTML() { return [{ tag: 'ins', getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) }]; },
      renderHTML({ HTMLAttributes }) { return ['ins', { 'data-id': JSON.stringify(HTMLAttributes.id) }, 0]; },
    });
    const DeletionMark = Mark.create({
      name: 'deletion',
      priority: 200,
      inclusive: false,
      excludes: 'insertion modification deletion',
      addAttributes() { return { id: { default: null } }; },
      parseHTML() { return [{ tag: 'del', getAttrs: el => (el.dataset.id ? { id: JSON.parse(el.dataset.id) } : false) }]; },
      renderHTML({ HTMLAttributes }) { return ['del', { 'data-id': JSON.stringify(HTMLAttributes.id) }, 0]; },
    });
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
      parseHTML() { return [{ tag: "span[data-type='modification']" }]; },
      renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'modification', 'data-id': JSON.stringify(HTMLAttributes.id) }), 0]; },
    });

    // Contournement d'un piège Tiptap 3.x (constaté en écrivant le prototype) : pour un appel DIRECT
    // (editor.commands.xxx(), pas une chaîne .chain()), Tiptap fournit un `dispatch` no-op et un
    // `state.tr` chaînable TOUJOURS PARTAGÉ pendant tout l'appel - lui passer `editor.state` (l'état
    // déjà figé) crée un tr orphelin à chaque lecture, jeté silencieusement par le dispatch no-op.
    // `editor.view.dispatch` est le vrai dispatch ProseMirror (synchrone, jamais no-op) ; `tr.setMeta
    // ('preventDispatch', true)` empêche Tiptap de dispatcher EN PLUS son propre tr partagé resté vide.
    // Nécessaire dès qu'une commande doit appliquer PLUSIEURS transactions dans l'ordre (bourrage,
    // opération, nettoyage), pas une seule mutation isolée.
    function runGuardedLibCommand(libFn, editor, dispatch, tr) {
      if (!dispatch) return libFn(editor.state, undefined); // vérif de capacité (editor.can()) : pas de mutation
      if (tr) tr.setMeta('preventDispatch', true);
      if (!lastNodeCarriesSuggestionMark(editor.state)) return libFn(editor.state, editor.view.dispatch);
      // Bug DANS LA LIB (pas notre code, cf. planning/feature-track-changes.md bug n°3) :
      // applySuggestions/revertSuggestions/applySuggestion/revertSuggestion plantent avec "Cannot read
      // properties of undefined (reading 'nodeSize')" quand le nœud traité est le tout DERNIER du
      // document (test de fusion avec le caractère suivant hors limites, `<=` au lieu de `<`).
      // Contournement : un paragraphe-tampon temporaire est inséré juste après, retiré ensuite s'il
      // est resté vide - les deux transactions de bord sont hors historique (invisibles pour Annuler).
      const guardMeta = t => t.setMeta(suggestChangesKey, { skip: true }).setMeta('addToHistory', false);
      editor.view.dispatch(guardMeta(editor.state.tr
        .insert(editor.state.doc.content.size, editor.state.schema.nodes.paragraph.create())));
      const result = libFn(editor.state, editor.view.dispatch);
      const guard = editor.state.doc.lastChild;
      if (guard && guard.type.name === 'paragraph' && guard.content.size === 0 && guard.marks.length === 0) {
        editor.view.dispatch(guardMeta(editor.state.tr
          .delete(editor.state.doc.content.size - guard.nodeSize, editor.state.doc.content.size)));
      }
      return result;
    }

    // Mitigation du bug de perf O(N²) confirmé dans la lib (applySuggestions/revertSuggestions sans
    // plage traitent tout le document en un seul Transform partagé - coût cumulatif). Découpe "tout
    // accepter/refuser" en plusieurs transactions bornées à chunkSize marques à la fois, toujours
    // depuis la position 0 du document COURANT (jamais des positions mises en cache, la taille du
    // document change à chaque tranche traitée). Mesuré dans le prototype : ratio ~5x au lieu de ~10x
    // pour 4x de marques. Contrepartie assumée : chaque tranche est SA PROPRE transaction/pas
    // d'historique (Ctrl+Z doit être pressé une fois par tranche pour tout défaire).
    function findFirstPendingMarks(state, chunkSize) {
      const found = [];
      state.doc.descendants((node, pos) => {
        if (found.length >= chunkSize) return false;
        const mark = node.marks.find(m => MARK_NAMES.includes(m.type.name));
        if (mark) found.push({ from: pos, to: pos + node.nodeSize });
        return true;
      });
      return found;
    }
    function runChunkedLibCommand(rangeCommandFactory, editor, chunkSize) {
      while (true) {
        const marks = findFirstPendingMarks(editor.state, chunkSize);
        if (marks.length === 0) break;
        const to = marks[marks.length - 1].to;
        runGuardedLibCommand((s, d) => rangeCommandFactory(0, to)(s, d), editor, editor.view.dispatch, undefined);
      }
    }

    const SuggestChangesBridge = Extension.create({
      name: 'suggestChangesBridge',
      addProseMirrorPlugins() { return [suggestChanges()]; },
      addCommands() {
        return {
          toggleSuggestMode: () => ({ state, dispatch }) => toggleSuggestChanges(state, dispatch),
          acceptAllSuggestions: () => ({ editor, dispatch, tr }) => runGuardedLibCommand(applySuggestions, editor, dispatch, tr),
          rejectAllSuggestions: () => ({ editor, dispatch, tr }) => runGuardedLibCommand(revertSuggestions, editor, dispatch, tr),
          // chunkSize par défaut choisi empiriquement (cf. mesure de perf du prototype) - assez petit
          // pour rester loin du coût quadratique, assez grand pour ne pas multiplier le nombre de pas
          // d'historique pour rien sur un document de taille normale.
          acceptAllSuggestionsChunked: (chunkSize = 200) => ({ editor, dispatch, tr }) => {
            if (!dispatch) return true;
            tr.setMeta('preventDispatch', true);
            runChunkedLibCommand((from, to) => applySuggestion(undefined, from, to), editor, chunkSize);
            return true;
          },
          rejectAllSuggestionsChunked: (chunkSize = 200) => ({ editor, dispatch, tr }) => {
            if (!dispatch) return true;
            tr.setMeta('preventDispatch', true);
            runChunkedLibCommand((from, to) => revertSuggestion(undefined, from, to), editor, chunkSize);
            return true;
          },
          acceptSuggestionsInSelection: () => ({ editor, dispatch, tr, state }) => {
            const { from, to } = state.selection;
            return runGuardedLibCommand((s, d) => applySuggestion(undefined, from, to)(s, d), editor, dispatch, tr);
          },
          rejectSuggestionsInSelection: () => ({ editor, dispatch, tr, state }) => {
            const { from, to } = state.selection;
            return runGuardedLibCommand((s, d) => revertSuggestion(undefined, from, to)(s, d), editor, dispatch, tr);
          },
          acceptSuggestionById: id => ({ editor, dispatch, tr }) =>
            runGuardedLibCommand((s, d) => applySuggestion(id)(s, d), editor, dispatch, tr),
          rejectSuggestionById: id => ({ editor, dispatch, tr }) =>
            runGuardedLibCommand((s, d) => revertSuggestion(id)(s, d), editor, dispatch, tr),
          // Remplace TOUT le document sans jamais passer par transformToSuggestionTransaction, quel
          // que soit l'état du suivi au moment de l'appel - cf. bug n°5 (planning/feature-track-
          // changes.md) : un setContent() normal pendant que le suivi est actif empile ancien ET
          // nouveau contenu dans des <del>/<ins> englobants au lieu de remplacer proprement. C'est le
          // remplacement utilisé par Editor.setHTML() (chargement de modèle, rechargement après
          // conflit d'auto-save). `preventUpdate: true` (en plus de `skip`/`addToHistory: false`) :
          // vérifié dans le code source réel de @tiptap/core (Editor#dispatchTransaction lit ce meta
          // AVANT d'émettre 'update') - reproduit exactement ce que fait
          // `editor.commands.setContent(html, {emitUpdate:false})`, jamais déclenché par un dispatch
          // direct comme celui-ci sans ce meta explicite.
          loadTrackedDocument: html => ({ editor, dispatch, tr }) => {
            if (!dispatch) return true;
            tr.setMeta('preventDispatch', true);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html || '';
            const docNode = PMDOMParser.fromSchema(editor.schema).parse(wrapper);
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
        // Garde alignée sur withSuggestChanges() (code source de la lib) : sans le test `'skip' in
        // ...`, "tout accepter/refuser" (qui posent ce meta pour dire "ceci EST déjà le résultat, ne
        // le re-transforme pas") seraient réinterceptées et transformées en NOUVELLES suggestions.
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

    // Contournement d'un piège DÉCOUVERT en intégrant ce fichier (absent du prototype, qui ne rechargeait jamais un document par-dessus un mode suivi déjà
    // actif) : EditorNodes.createClearHistoryExtension (js/editor-nodes.js), appelée par Editor.setHTML() après CHAQUE chargement de modèle, reconstruit
    // l'état ProseMirror via `EditorState.create({..., plugins: view.state.plugins})`. `EditorState.create` appelle TOUJOURS `init()` sur CHAQUE plugin de
    // la liste, y compris ceux dont la référence ne change pas - contrairement à `state.reconfigure(...)`, qui préserve l'état des plugins inchangés. Le
    // suivi (un booléen de plugin, pas une donnée du document) se retrouvait donc silencieusement remis à OFF à chaque changement de modèle, y compris en
    // rechargeant le MÊME modèle. Dispatch RÉEL (comme runGuardedLibCommand/loadTrackedDocument ci-dessus) plutôt que la commande `toggleSuggestMode` :
    // celle-ci passerait par `editor.commands.toggleSuggestMode()` en appel DIRECT (jamais chaîné ici), avec le même piège dispatch-no-op documenté plus
    // haut - appeler la fonction de la lib directement avec `editor.view.dispatch` l'évite entièrement.
    function restoreSuggestModeIfNeeded(editor, wasOn) {
      if (wasOn && !isSuggestChangesEnabled(editor.state)) toggleSuggestChanges(editor.state, editor.view.dispatch);
    }

    return {
      InsertionMark, DeletionMark, ModificationMark, SuggestChangesBridge,
      isSuggestModeOn: state => isSuggestChangesEnabled(state),
      restoreSuggestModeIfNeeded,
    };
  }

  return {
    extendForTracking, hasPendingSuggestions, computeMetadata, createExtensions,
  };
})();
